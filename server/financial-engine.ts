/**
 * FOMS Financial Engine — Sicarios Core
 * Phase 0+1 financial safety layer:
 *   - Record lock guard (immutability enforcement)
 *   - Balance equation validator
 *   - KYC Gate (S-03)
 *   - Structuring Detector (S-10)
 *   - Liquidity Monitor (S-08)
 *   - Fee Auto-Extractor (S-12)
 */

import { db } from "./db";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import {
  records, transactions, transactionEntries, complianceAlerts,
  watchedWallets, customers,
  type Record, type InsertTransactionEntry, type InsertComplianceAlert,
} from "@shared/schema";

// ─── Error types ─────────────────────────────────────────────────────────────

export class RecordLockedError extends Error {
  code = "RECORD_LOCKED";
  constructor(recordId: string) {
    super(`RECORD_LOCKED: Record ${recordId} is in stage 'used' and cannot have financial fields modified. Create a reversal entry instead.`);
  }
}

export class BalanceViolationError extends Error {
  code = "BALANCE_VIOLATION";
  constructor(inflows: number, outflows: number) {
    super(`BALANCE_VIOLATION: Transaction is unbalanced. Inflows+Receivables=${inflows.toFixed(4)} ≠ Outflows+Payables+Fees=${outflows.toFixed(4)}. Difference: ${Math.abs(inflows - outflows).toFixed(4)}`);
  }
}

export class KycLimitError extends Error {
  code = "KYC_LIMIT_BREACH";
  constructor(message: string) { super(message); }
}

export class StructuringFlagError extends Error {
  code = "STRUCTURING_FLAG";
  constructor(message: string) { super(message); }
}

// ─── IMMUTABLE FINANCIAL FIELDS ───────────────────────────────────────────────
const LOCKED_FINANCIAL_FIELDS: (keyof Record)[] = [
  "amount", "currency", "direction", "type", "accountId",
  "usdEquivalent", "exchangeRate", "buyRate", "sellRate",
];

/**
 * S-14 Record Lock Guard
 * Call before any updateRecord when stage=used.
 * Throws RecordLockedError if financial fields are being mutated.
 */
export function enforceRecordLock(existingRecord: Record, updates: Partial<Record>): void {
  if (existingRecord.processingStage !== "used") return;
  const touchedFinancialField = LOCKED_FINANCIAL_FIELDS.some(
    field => field in updates && updates[field] !== (existingRecord as any)[field]
  );
  if (touchedFinancialField) throw new RecordLockedError(existingRecord.id);
}

// ─── BALANCE EQUATION VALIDATOR ───────────────────────────────────────────────
/**
 * Equation: (Inflows + Receivables) = (Outflows + Payables + Fees + Spread + NetworkExpense + Commission + Penalty)
 * Evaluated from transaction_entries for a given transaction.
 * Tolerance: 0.01 USD (for rounding)
 */
export async function validateTransactionBalance(transactionId: string, toleranceUsd = 0.01): Promise<void> {
  const entries = await db.select().from(transactionEntries)
    .where(eq(transactionEntries.transactionId, transactionId));

  if (entries.length === 0) return; // no entries yet — balance check not applicable

  let inflows  = 0;
  let outflows = 0;

  for (const e of entries) {
    const amt = parseFloat(String(e.usdEquivalent ?? e.amount ?? 0));
    if (e.direction === "credit") {
      inflows += amt;  // credit = money coming in or reducing liability
    } else {
      outflows += amt; // debit = money going out or increasing asset
    }
  }

  if (Math.abs(inflows - outflows) > toleranceUsd) {
    throw new BalanceViolationError(inflows, outflows);
  }
}

// ─── KYC GATE (S-03) ──────────────────────────────────────────────────────────
/**
 * Checks customer risk limits before a transaction is committed.
 * If limits are configured in customer.riskLimits, enforce them.
 * Creates a compliance_alert on breach (does NOT block — returns the alert).
 */
export async function runKycGate(
  customerId: string,
  amountUsd: number,
  actorId?: string
): Promise<{ passed: boolean; alert?: InsertComplianceAlert }> {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer) return { passed: true };

  const limits = customer.riskLimits as any;
  if (!limits) return { passed: true };

  const perTxLimit  = parseFloat(limits.perTransaction ?? "999999999");
  const perDayLimit = parseFloat(limits.perDay ?? "999999999");

  // Check per-transaction limit
  if (amountUsd > perTxLimit) {
    const alert: InsertComplianceAlert = {
      alertType: "kyc_limit_breach",
      severity: "critical",
      status: "open",
      customerId,
      customerName: customer.fullName,
      title: `KYC Per-Transaction Limit Exceeded`,
      description: `Customer ${customer.fullName} (${customer.customerId}) attempted a transaction of $${amountUsd.toFixed(2)}, which exceeds their per-transaction limit of $${perTxLimit.toFixed(2)}.`,
      detectedValue: String(amountUsd) as any,
      thresholdValue: String(perTxLimit) as any,
      metadata: { rule: "per_transaction", riskLevel: customer.riskLevel } as any,
    };
    await db.insert(complianceAlerts).values(alert);
    return { passed: false, alert };
  }

  // Check daily volume limit: sum today's transactions for this customer
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayTxs = await db.select({
    totalIn:  sql<number>`COALESCE(SUM(CAST(total_in_usd AS NUMERIC)), 0)`,
    totalOut: sql<number>`COALESCE(SUM(CAST(total_out_usd AS NUMERIC)), 0)`,
  }).from(transactions)
    .where(and(
      eq(transactions.customerId, customerId),
      gte(transactions.createdAt, todayStart)
    ));

  const todayVolume = parseFloat(String((todayTxs[0]?.totalIn ?? 0))) + parseFloat(String((todayTxs[0]?.totalOut ?? 0)));

  if (todayVolume + amountUsd > perDayLimit) {
    const alert: InsertComplianceAlert = {
      alertType: "kyc_limit_breach",
      severity: "warning",
      status: "open",
      customerId,
      customerName: customer.fullName,
      title: `KYC Daily Limit Would Be Exceeded`,
      description: `Customer ${customer.fullName} has $${todayVolume.toFixed(2)} in today's volume. New transaction of $${amountUsd.toFixed(2)} would bring total to $${(todayVolume + amountUsd).toFixed(2)}, exceeding daily limit of $${perDayLimit.toFixed(2)}.`,
      detectedValue: String(todayVolume + amountUsd) as any,
      thresholdValue: String(perDayLimit) as any,
      metadata: { rule: "per_day", todayVolume, riskLevel: customer.riskLevel } as any,
    };
    await db.insert(complianceAlerts).values(alert);
    return { passed: false, alert };
  }

  return { passed: true };
}

// ─── STRUCTURING DETECTOR (S-10) ──────────────────────────────────────────────
/**
 * FATF-aligned structuring detection.
 * Detects if customer is splitting transactions to avoid reporting threshold.
 * Configurable threshold (default $1,000 — low for Yemen operations).
 */
const STRUCTURING_THRESHOLD_USD = 1000;
const STRUCTURING_WINDOW_HOURS  = 24;
const STRUCTURING_MIN_TX_COUNT  = 3;

export async function detectStructuring(
  customerId: string,
  newAmountUsd: number
): Promise<{ detected: boolean; alert?: InsertComplianceAlert }> {
  const windowStart = new Date();
  windowStart.setHours(windowStart.getHours() - STRUCTURING_WINDOW_HOURS);

  const recentTxs = await db.select().from(transactions)
    .where(and(
      eq(transactions.customerId, customerId),
      gte(transactions.createdAt, windowStart)
    ))
    .orderBy(desc(transactions.createdAt));

  const nearThreshold = recentTxs.filter(t => {
    const amt = parseFloat(String(t.totalInUsd ?? 0)) + parseFloat(String(t.totalOutUsd ?? 0));
    return amt > 0 && amt < STRUCTURING_THRESHOLD_USD;
  });

  const isNewAlsoBelow = newAmountUsd > 0 && newAmountUsd < STRUCTURING_THRESHOLD_USD;
  const totalNearThreshold = nearThreshold.length + (isNewAlsoBelow ? 1 : 0);

  if (totalNearThreshold >= STRUCTURING_MIN_TX_COUNT) {
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    const totalValue = nearThreshold.reduce((s, t) =>
      s + parseFloat(String(t.totalInUsd ?? 0)) + parseFloat(String(t.totalOutUsd ?? 0)), 0
    ) + newAmountUsd;

    // Check if we already have an open structuring alert for this customer in last 24h
    const existing = await db.select().from(complianceAlerts)
      .where(and(
        eq(complianceAlerts.customerId, customerId),
        eq(complianceAlerts.alertType, "structuring"),
        eq(complianceAlerts.status, "open"),
        gte(complianceAlerts.createdAt, windowStart)
      )).limit(1);

    if (existing.length > 0) return { detected: true }; // already flagged

    const alert: InsertComplianceAlert = {
      alertType: "structuring",
      severity: "critical",
      status: "open",
      customerId,
      customerName: customer?.fullName ?? "Unknown",
      title: `Possible Structuring Detected`,
      description: `Customer ${customer?.fullName ?? customerId} has ${totalNearThreshold} transactions below the $${STRUCTURING_THRESHOLD_USD} reporting threshold within ${STRUCTURING_WINDOW_HOURS}h window. Combined value: $${totalValue.toFixed(2)}.`,
      detectedValue: String(totalValue) as any,
      thresholdValue: String(STRUCTURING_THRESHOLD_USD) as any,
      metadata: {
        txCount: totalNearThreshold,
        windowHours: STRUCTURING_WINDOW_HOURS,
        threshold: STRUCTURING_THRESHOLD_USD,
        recentTxIds: nearThreshold.map(t => t.id),
      } as any,
    };
    await db.insert(complianceAlerts).values(alert);
    return { detected: true, alert };
  }

  return { detected: false };
}

// ─── LIQUIDITY MONITOR (S-08) ─────────────────────────────────────────────────
/**
 * Compares pending crypto outflow obligations vs watched wallet coverage.
 * Coverage Ratio = walletBalance / pendingOutflows
 * Safe >= 2.0, Warning 1.0–1.99, Critical < 1.0
 */
export async function getLiquidityStatus(): Promise<{
  pendingOutflowUsd:  number;
  estimatedBalanceUsd: number;
  coverageRatio:      number;
  status:             "safe" | "warning" | "critical";
  pendingCount:       number;
}> {
  // Pending crypto outflow records not yet used in a transaction
  const pendingOutflows = await db.select({
    totalUsd: sql<number>`COALESCE(SUM(CAST(usd_equivalent AS NUMERIC)), 0)`,
    count:    sql<number>`COUNT(*)`,
  }).from(records)
    .where(and(
      eq(records.type, "crypto"),
      eq(records.direction, "outflow"),
      sql`processing_stage NOT IN ('used', 'cancelled')`
    ));

  const pendingOutflowUsd = parseFloat(String(pendingOutflows[0]?.totalUsd ?? 0));
  const pendingCount      = parseInt(String(pendingOutflows[0]?.count ?? 0));

  // Estimate wallet balance from watched wallets totalSynced (approximation)
  // In production this would call Ankr/exchange APIs for live balances
  const wallets = await db.select().from(watchedWallets).where(eq(watchedWallets.isActive, true));
  const estimatedBalanceUsd = wallets.reduce((s, w) => s + (w.totalSynced ?? 0) * 1, 0); // placeholder: 1 USDT ≈ $1

  const coverageRatio = pendingOutflowUsd > 0 ? estimatedBalanceUsd / pendingOutflowUsd : 999;
  const status: "safe" | "warning" | "critical" =
    coverageRatio >= 2.0 ? "safe" : coverageRatio >= 1.0 ? "warning" : "critical";

  // Create alert if critical
  if (status === "critical") {
    const existing = await db.select().from(complianceAlerts)
      .where(and(
        eq(complianceAlerts.alertType, "liquidity_warning"),
        eq(complianceAlerts.status, "open")
      )).limit(1);

    if (existing.length === 0) {
      await db.insert(complianceAlerts).values({
        alertType: "liquidity_warning",
        severity: "critical",
        status: "open",
        title: "Critical Liquidity Warning",
        description: `Crypto wallet coverage ratio is ${coverageRatio.toFixed(2)}x. Pending outflows: $${pendingOutflowUsd.toFixed(2)}, estimated balance: $${estimatedBalanceUsd.toFixed(2)}. Immediate action required.`,
        detectedValue: String(coverageRatio.toFixed(4)) as any,
        thresholdValue: "1.0" as any,
        metadata: { pendingOutflowUsd, estimatedBalanceUsd, pendingCount } as any,
      } as InsertComplianceAlert);
    }
  }

  return { pendingOutflowUsd, estimatedBalanceUsd, coverageRatio, status, pendingCount };
}

// ─── FEE EXTRACTOR (S-12) ─────────────────────────────────────────────────────
/**
 * Auto-creates Transaction Entries for fee, spread_profit, and network_expense
 * from a transaction's serviceFeeAmount, spreadAmount, and serviceExpenseAmount.
 * Called after a transaction is committed/approved.
 * Idempotent — checks for existing entries before creating.
 */
export async function autoExtractFeeEntries(transactionId: string, createdBy?: string): Promise<InsertTransactionEntry[]> {
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
  if (!tx) return [];

  const existingEntries = await db.select().from(transactionEntries)
    .where(eq(transactionEntries.transactionId, transactionId));

  const existingTypes = new Set(existingEntries.map(e => e.entryType));
  const toCreate: InsertTransactionEntry[] = [];

  const fee     = parseFloat(String(tx.serviceFeeAmount ?? 0));
  const spread  = parseFloat(String((tx as any).spreadAmount ?? 0));
  const expense = parseFloat(String(tx.serviceExpenseAmount ?? 0));

  if (fee > 0 && !existingTypes.has("fee")) {
    toCreate.push({
      transactionId,
      entryType: "fee",
      description: `Service fee — ${tx.transactionNumber}`,
      amount: String(fee.toFixed(4)),
      currency: "USD",
      usdEquivalent: String(fee.toFixed(4)),
      direction: "credit",          // CR Revenue — fee earned
      accountName: "Service Fee Income",
      createdBy,
    });
  }

  if (spread > 0 && !existingTypes.has("spread_profit")) {
    toCreate.push({
      transactionId,
      entryType: "spread_profit",
      description: `Spread profit — ${tx.transactionNumber}`,
      amount: String(spread.toFixed(4)),
      currency: "USD",
      usdEquivalent: String(spread.toFixed(4)),
      direction: "credit",
      accountName: "Spread Income",
      createdBy,
    });
  }

  if (expense > 0 && !existingTypes.has("network_expense")) {
    toCreate.push({
      transactionId,
      entryType: "network_expense",
      description: `Network/supplier expense — ${tx.transactionNumber}`,
      amount: String(expense.toFixed(4)),
      currency: "USD",
      usdEquivalent: String(expense.toFixed(4)),
      direction: "debit",           // DR Expense
      accountName: "Supplier Exchange Expense",
      createdBy,
    });
  }

  // Handle netDifference entries
  const net = parseFloat(String(tx.netDifference ?? 0));
  if (net > 0 && tx.netDifferenceType) {
    const typeMap: { [k: string]: "receivable" | "payable" } = {
      customer_receivable: "receivable",
      customer_credit:     "payable",
    };
    const entryType = typeMap[tx.netDifferenceType];
    if (entryType && !existingTypes.has(entryType)) {
      toCreate.push({
        transactionId,
        entryType,
        description: `${tx.netDifferenceType.replace(/_/g, " ")} — ${tx.transactionNumber}`,
        amount: String(net.toFixed(4)),
        currency: "USD",
        usdEquivalent: String(net.toFixed(4)),
        direction: entryType === "receivable" ? "debit" : "credit",
        accountName: entryType === "receivable" ? "Customer Receivables" : "Customer Credit Balances",
        customerId: tx.customerId ?? undefined,
        createdBy,
      });
    }
  }

  if (toCreate.length > 0) {
    await db.insert(transactionEntries).values(toCreate);
  }

  return toCreate;
}

// ─── ORPHAN DETECTOR (S-15) ──────────────────────────────────────────────────
/**
 * Find records stuck in matched stage for more than 4 hours.
 * Called periodically by a scheduler.
 */
export async function detectOrphanRecords(): Promise<void> {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 4);

  const orphans = await db.select().from(records)
    .where(and(
      sql`processing_stage IN ('manual_matched', 'auto_matched')`,
      sql`updated_at < ${cutoff.toISOString()}`
    ));

  for (const rec of orphans) {
    const existing = await db.select().from(complianceAlerts)
      .where(and(
        eq(complianceAlerts.recordId, rec.id),
        eq(complianceAlerts.alertType, "orphan_record"),
        eq(complianceAlerts.status, "open")
      )).limit(1);

    if (existing.length > 0) continue;

    await db.insert(complianceAlerts).values({
      alertType: "orphan_record",
      severity: "warning",
      status: "open",
      recordId: rec.id,
      customerId: rec.customerId ?? undefined,
      title: `Orphaned Record: ${rec.recordNumber}`,
      description: `Record ${rec.recordNumber} has been in '${rec.processingStage}' stage for more than 4 hours without progressing to a transaction. Amount: ${rec.amount} ${rec.currency}.`,
      detectedValue: String(rec.amount) as any,
      metadata: { recordNumber: rec.recordNumber, stage: rec.processingStage, age_hours: 4 } as any,
    } as InsertComplianceAlert);
  }
}
