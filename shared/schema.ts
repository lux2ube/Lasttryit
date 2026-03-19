import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  decimal,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const staffRoleEnum = pgEnum("staff_role", [
  "admin",
  "operations_manager",
  "finance_officer",
  "compliance_officer",
  "customer_support",
]);

export const customerStatusEnum = pgEnum("customer_status", [
  "active",
  "inactive",
  "suspended",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "verified",
  "unverified",
  "blocked",
]);

export const riskLevelEnum = pgEnum("risk_level", ["low", "medium", "high"]);

export const recordTypeEnum = pgEnum("record_type", ["cash", "crypto"]);

export const recordDirectionEnum = pgEnum("record_direction", ["inflow", "outflow"]);

export const recordMethodEnum = pgEnum("record_method", ["manual", "auto"]);

export const processingStageEnum = pgEnum("processing_stage", [
  "draft",
  "recorded",
  "matched",         // canonical: customer identified & linked
  "manual_matched",  // legacy alias kept for existing data
  "auto_matched",    // legacy alias kept for existing data
  "confirmed",
  "used",
  "cancelled",
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "deposit",
  "withdraw",
  "transfer",
  "partial_fulfillment",
  "reconciliation",
  "refund",
  "liquidity_b2b",
]);

export const netDifferenceTypeEnum = pgEnum("net_difference_type", [
  "premium_fee",
  "customer_credit",
  "premium_discount",
  "customer_receivable",
]);

export const blacklistTypeEnum = pgEnum("blacklist_type", [
  // Name fields → customers.first_name / second_name / third_name / last_name / full_name
  "first_name",
  "second_name",
  "third_name",
  "last_name",
  "full_name",
  "name_fragment",   // legacy — kept for existing entries
  // Contact → customers.phone_primary / phone_secondary[] / email
  "phone",
  "email",
  // Identity documents → customers.documentation JSONB
  "national_id",
  "passport_no",
  "nationality",     // customers.demographics JSONB → nationality
  // Provider / financial → customer_wallets.address_or_id
  "wallet_address",
  "bank_account",
]);

export const auditEntityEnum = pgEnum("audit_entity", [
  "staff_user",
  "customer",
  "record",
  "transaction",
  "transaction_entry",
  "system_setting",
  "blacklist",
  "label",
  "customer_wallet",
  "compliance_alert",
]);

export const transactionEntryTypeEnum = pgEnum("transaction_entry_type", [
  "fee",               // service fee revenue
  "spread_profit",     // profit from buy/sell rate spread
  "network_expense",   // gas / on-chain network cost
  "receivable",        // customer owes us (underpaid)
  "payable",           // we owe customer (overpaid credit)
  "commission",        // affiliate/referral payout
  "penalty",           // penalty fee charged to customer
  "reversal",          // offsetting correction entry
]);

export const complianceAlertTypeEnum = pgEnum("compliance_alert_type", [
  "structuring",          // S-10: transactions near reporting threshold
  "kyc_limit_breach",     // S-03: volume limit exceeded
  "blacklist_hit",        // match against blacklist
  "liquidity_warning",    // S-08: wallet coverage below threshold
  "orphan_record",        // S-15: record stuck in matched > 4h
  "velocity_breach",      // too many transactions in short window
  "large_transaction",    // single transaction above threshold
]);

export const complianceAlertSeverityEnum = pgEnum("compliance_alert_severity", [
  "info",
  "warning",
  "critical",
]);

export const complianceAlertStatusEnum = pgEnum("compliance_alert_status", [
  "open",
  "acknowledged",
  "resolved",
  "false_positive",
]);

// ─── Staff Users ─────────────────────────────────────────────────────────────

export const staffUsers = pgTable("staff_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  role: staffRoleEnum("role").notNull().default("finance_officer"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertStaffUserSchema = createInsertSchema(staffUsers).omit({
  id: true, createdAt: true, updatedAt: true, lastLoginAt: true,
});
export type InsertStaffUser = z.infer<typeof insertStaffUserSchema>;
export type StaffUser = typeof staffUsers.$inferSelect;

// ─── Customers ───────────────────────────────────────────────────────────────

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: text("customer_id").notNull().unique(),
  // Name fields
  firstName: text("first_name").notNull(),
  secondName: text("second_name"),
  thirdName: text("third_name"),
  lastName: text("last_name"),
  fullName: text("full_name").notNull(),
  // Contact
  phonePrimary: text("phone_primary").notNull(),
  phoneSecondary: text("phone_secondary").array(),
  email: text("email"),
  whatsappGroupId: text("whatsapp_group_id"),
  // Status & Risk
  customerStatus: customerStatusEnum("customer_status").notNull().default("active"),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
  riskLevel: riskLevelEnum("risk_level").notNull().default("low"),
  // Risk Limits (JSONB: { perTransaction: number, perMonth: number, perYear: number, currency: string })
  riskLimits: jsonb("risk_limits"),
  // Loyalty & Referral
  loyaltyGroup: text("loyalty_group").default("standard"),
  groupId: varchar("group_id"),
  // serviceDiscounts: JSONB array of { service: string, txType: string, discountRate: number }
  serviceDiscounts: jsonb("service_discounts"),
  referralParentId: varchar("referral_parent_id"),
  // Demographics (JSONB: gender, dob, address, nationality, city, country)
  demographics: jsonb("demographics"),
  // Labels & Documentation
  labels: text("labels").array(),
  documentation: jsonb("documentation"),
  // Blacklist
  isBlacklisted: boolean("is_blacklisted").notNull().default(false),
  blacklistFlags: jsonb("blacklist_flags"),
  blacklistCheckedAt: timestamp("blacklist_checked_at"),
  // Stats
  totalTransactions: integer("total_transactions").notNull().default(0),
  totalVolumeUsd: decimal("total_volume_usd", { precision: 18, scale: 4 }).notNull().default("0"),
  // Notes
  notes: text("notes"),
  // Audit
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true, customerId: true, createdAt: true, updatedAt: true,
  totalTransactions: true, totalVolumeUsd: true,
  isBlacklisted: true, blacklistCheckedAt: true, blacklistFlags: true,
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

// ─── Customer Wallets (Whitelist) ─────────────────────────────────────────────
// Saved wallet addresses / platform IDs the customer uses for outflows (crypto)
// or our bank accounts the customer prefers for inflows (cash)

export const customerWallets = pgTable("customer_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull(),
  // FK → providers.id — the outflow provider selected from the providers table
  providerId: varchar("provider_id"),
  // Always "outflow" — whitelist = where we send money TO the customer
  direction: recordDirectionEnum("direction").notNull().default("outflow"),
  type: recordTypeEnum("type").notNull(),
  // Provider / exchange / bank name (copied from providers.name for display)
  providerName: text("provider_name").notNull(),
  // Network (BEP20, TRC20…) — copied from providers.networkCode
  network: text("network"),
  // Wallet address OR platform ID OR bank account number
  addressOrId: text("address_or_id").notNull(),
  // Label the customer calls this (e.g. "My Binance", "Main wallet")
  label: text("label"),
  // Is this the default for this provider?
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  // Notes / verification
  notes: text("notes"),
  addedBy: varchar("added_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertCustomerWalletSchema = createInsertSchema(customerWallets).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertCustomerWallet = z.infer<typeof insertCustomerWalletSchema>;
export type CustomerWallet = typeof customerWallets.$inferSelect;

// ─── Labels ─────────────────────────────────────────────────────────────────

export const labels = pgTable("labels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#6366f1"),
  description: text("description"),
  // Which service/category this label applies to (optional)
  appliesTo: text("applies_to"),
  // JSONB: { discountRate: number, txType: string, service: string } — optional auto-discount
  autoDiscount: jsonb("auto_discount"),
  // JSONB: { perTransaction: number, perMonth: number } — optional limits
  autoLimits: jsonb("auto_limits"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertLabelSchema = createInsertSchema(labels).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertLabel = z.infer<typeof insertLabelSchema>;
export type Label = typeof labels.$inferSelect;

// ─── Blacklist ────────────────────────────────────────────────────────────────

export const blacklistEntries = pgTable("blacklist_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: blacklistTypeEnum("type").notNull(),
  value: text("value").notNull(),
  reason: text("reason"),
  addedBy: varchar("added_by"),
  isActive: boolean("is_active").notNull().default(true),
  matchCount: integer("match_count").notNull().default(0),
  lastMatchAt: timestamp("last_match_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertBlacklistEntrySchema = createInsertSchema(blacklistEntries).omit({
  id: true, createdAt: true, updatedAt: true, matchCount: true, lastMatchAt: true,
});
export type InsertBlacklistEntry = z.infer<typeof insertBlacklistEntrySchema>;
export type BlacklistEntry = typeof blacklistEntries.$inferSelect;

// ─── Blacklist Subjects (new AND-condition system) ────────────────────────────
// Each subject is a named suspected entity. It fires only when ALL its
// conditions match — conditions within a subject are AND'd together.
// Different subjects are OR'd (any one match = customer is flagged).
export const blacklistSubjects = pgTable("blacklist_subjects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subjectName: text("subject_name").notNull(),   // display name, e.g. "Mohammed Al-Yemeni"
  reason: text("reason"),
  addedBy: varchar("added_by"),
  isActive: boolean("is_active").notNull().default(true),
  matchCount: integer("match_count").notNull().default(0),
  lastMatchAt: timestamp("last_match_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Each condition is one field check within a subject (AND'd with siblings)
export const blacklistConditions = pgTable("blacklist_conditions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subjectId: varchar("subject_id").notNull(),    // FK → blacklist_subjects.id (cascade delete)
  field: blacklistTypeEnum("field").notNull(),   // which customer profile field to check
  value: text("value").notNull(),                // the value to match against
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertBlacklistSubjectSchema = createInsertSchema(blacklistSubjects).omit({
  id: true, createdAt: true, updatedAt: true, matchCount: true, lastMatchAt: true,
});
export const insertBlacklistConditionSchema = createInsertSchema(blacklistConditions).omit({
  id: true, createdAt: true,
});
export type InsertBlacklistSubject = z.infer<typeof insertBlacklistSubjectSchema>;
export type InsertBlacklistCondition = z.infer<typeof insertBlacklistConditionSchema>;
export type BlacklistSubject = typeof blacklistSubjects.$inferSelect;
export type BlacklistCondition = typeof blacklistConditions.$inferSelect;
export type BlacklistSubjectWithConditions = BlacklistSubject & { conditions: BlacklistCondition[] };

// ─── System Settings ─────────────────────────────────────────────────────────

export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  category: text("category").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  dataType: text("data_type").notNull().default("string"),
  updatedBy: varchar("updated_by"),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  id: true, updatedAt: true,
});
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

// ─── Records ─────────────────────────────────────────────────────────────────
// type + direction defines the 4 record types:
//   cash  + inflow  = Cash Inflow  (customer sends YER/SAR to our bank)
//   cash  + outflow = Cash Outflow (we send YER/SAR to customer's bank)
//   crypto+ inflow  = Crypto Inflow (customer sends USDT to our wallet)
//   crypto+ outflow = Crypto Outflow (we send USDT to customer's wallet)

export const records = pgTable("records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recordNumber: text("record_number").notNull().unique(),

  // Core
  transactionId: varchar("transaction_id"),
  customerId: varchar("customer_id"),
  type: recordTypeEnum("type").notNull(),
  direction: recordDirectionEnum("direction").notNull(),
  processingStage: processingStageEnum("processing_stage").notNull().default("recorded"),

  // Operating Section
  source: text("source").default("manual"),
  endpointName: text("endpoint_name"),
  recordMethod: recordMethodEnum("record_method").notNull().default("manual"),
  matchedBy: text("matched_by"),

  // Financial Section
  // For cash: accountName = our bank account name (e.g. "Kuraimi Bank")
  // For crypto: accountName = our wallet/exchange name (e.g. "Binance TRC20")
  accountId: varchar("account_id"),
  accountName: text("account_name"),
  accountCurrency: text("account_currency"),
  amount: decimal("amount", { precision: 18, scale: 6 }).notNull(),
  currency: text("currency").notNull(),
  // For cash records: usdEquivalent is calculated from exchangeRate
  usdEquivalent: decimal("usd_equivalent", { precision: 18, scale: 4 }),
  // Exchange rates at time of transaction
  // buyRate:  rate we BUY USD/crypto from customer (inflow of USD/crypto)
  // sellRate: rate we SELL USD/crypto to customer (outflow of USD/crypto)
  buyRate:  decimal("buy_rate",  { precision: 18, scale: 6 }),
  sellRate: decimal("sell_rate", { precision: 18, scale: 6 }),
  // Bank exchange rate (buy/sell rate used for this transaction)
  exchangeRate: decimal("exchange_rate", { precision: 18, scale: 6 }),
  // Bank rate from the CoA account at time of recording (locked — set once).
  // For inflow: CoA account's buyRate. For outflow: CoA account's sellRate.
  // The execution/system rate (editable per record) is stored in buyRate/sellRate.
  // Spread fee = (amount/bankRate) − (amount/executionRate) for inflows, reversed for outflows.
  bankRate: decimal("bank_rate", { precision: 18, scale: 6 }),
  // ── Fee breakdown columns (written back at confirmation) ──────────────────
  // CRYPTO RECORDS ONLY:
  //   serviceFeeRate — % charged on principal (e.g. 4.0 = 4%). Revenue (4101).
  //   serviceFeeUsd  — actual USD amount = principal × rate/100. Revenue (4101).
  //   networkFeeUsd  — gas/network fee passed to client. Revenue/pass-through (4301).
  // CASH RECORDS ONLY:
  //   spreadRate     — FX spread % = (spread income / principal) × 100. Revenue (4201).
  //   spreadUsd      — FX spread income in USD. Revenue (4201).
  // serviceFeeRate and serviceFeeUsd are NULL for cash; spreadRate/spreadUsd are NULL for crypto.
  serviceFeeRate: decimal("service_fee_rate", { precision: 8, scale: 4 }),
  serviceFeeUsd:  decimal("service_fee_usd",  { precision: 18, scale: 4 }),
  networkFeeUsd:  decimal("network_fee_usd",  { precision: 18, scale: 6 }),
  spreadRate:     decimal("spread_rate",       { precision: 8,  scale: 4 }),
  spreadUsd:      decimal("spread_usd",        { precision: 18, scale: 4 }),
  clientLiabilityUsd: decimal("client_liability_usd", { precision: 18, scale: 4 }),
  // SUPPLIER EXPENSE: manually entered cost paid to exchange/supplier. Ledgered to 5201 at confirmation.
  //   DR 5201 Supplier Exchange Expense / CR [asset account]
  expenseUsd:     decimal("expense_usd",       { precision: 18, scale: 4 }).default("0"),
  // For cash: bank account number; for crypto: wallet address / platform ID
  accountField: text("account_field"),

  // Client / Counterparty
  // clientName: the matched customer full name (after matching)
  clientName: text("client_name"),
  // For inflows: who sent the money (e.g. name on bank transfer)
  clientSenderName: text("client_sender_name"),
  // For outflows: who we sent to
  clientRecipientName: text("client_recipient_name"),
  clientMatchMethod: text("client_match_method"),

  // Double-entry: contra account (the second leg — usually a liability/payable)
  // For inflows:  our account = debit, contra = credit (liability increases)
  // For outflows: contra = debit (liability decreases), our account = credit
  contraAccountId:   varchar("contra_account_id"),    // FK → chart_of_accounts.id
  contraAccountName: text("contra_account_name"),     // denormalized for performance

  // Asset / Provider (for crypto records)
  // providerId: FK → providers.id — links record to its provider for fee lookups & whitelist
  providerId: varchar("provider_id"),
  // assetOrProviderName: exchange or wallet brand (Binance, TrustWallet, Bybit…)
  // For cash records:   bank / money service provider name (Kuraimi Bank, etc.)
  assetOrProviderName: text("asset_or_provider_name"),
  // Network (BEP20, TRC20, ERC20…) or platform ID type
  networkOrId: text("network_or_id"),
  // Is this address/ID in the customer's whitelist?
  isWhitelisted: boolean("is_whitelisted").default(false),

  // Reference / Blockchain
  txidOrReferenceNumber: text("txid_or_reference_number"),
  blockNumberOrBatchId: text("block_number_or_batch_id"),
  documents: jsonb("documents"),
  notes: text("notes"),
  notificationNotes: text("notification_notes"),
  // Raw SMS or API response text (for auto records)
  endpointText: text("endpoint_text"),

  // Logs
  logEvents: jsonb("log_events").notNull().default(sql`'[]'::jsonb`),

  // Audit
  confirmedBy: varchar("confirmed_by"),
  confirmedAt: timestamp("confirmed_at"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertRecordSchema = createInsertSchema(records).omit({
  id: true, recordNumber: true, createdAt: true, updatedAt: true,
  logEvents: true, confirmedAt: true,
});
export type InsertRecord = z.infer<typeof insertRecordSchema>;
export type Record = typeof records.$inferSelect;

// ─── Transactions ─────────────────────────────────────────────────────────────
// A transaction links one or more records together (inflows + outflows)
// and calculates the net result (spread profit / service fee / customer credit)
//
// Deposit:  Cash Inflow record(s) + Crypto Outflow record(s)
// Withdraw: Crypto Inflow record(s) + Cash Outflow record(s)
// Transfer: Any combination

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionNumber: text("transaction_number").notNull().unique(),
  type: transactionTypeEnum("type").notNull(),

  // The primary customer for this transaction
  customerId: varchar("customer_id"),

  // IDs of linked records (marked "used" when transaction is confirmed)
  // Array of record IDs
  relatedRecordIds: text("related_record_ids").array().notNull().default(sql`'{}'::text[]`),

  // Summary snapshot (auto-calculated from linked records)
  totalInUsd: decimal("total_in_usd", { precision: 18, scale: 4 }).notNull().default("0"),
  totalOutUsd: decimal("total_out_usd", { precision: 18, scale: 4 }).notNull().default("0"),

  // Service Fee (our revenue from this transaction)
  serviceFeeRate: decimal("service_fee_rate", { precision: 8, scale: 4 }).default("0"),
  serviceFeeAmount: decimal("service_fee_amount", { precision: 18, scale: 4 }).default("0"),

  // Service Expense (what we pay suppliers, e.g. USDT provider fee)
  serviceExpenseRate: decimal("service_expense_rate", { precision: 8, scale: 4 }).default("0"),
  serviceExpenseAmount: decimal("service_expense_amount", { precision: 18, scale: 4 }).default("0"),

  // Spread profit from exchange rate difference
  spreadAmount: decimal("spread_amount", { precision: 18, scale: 4 }).default("0"),

  // Net Difference = totalIn - totalOut - serviceFeeAmount + serviceExpenseAmount
  netDifference: decimal("net_difference", { precision: 18, scale: 4 }).default("0"),
  // How the net difference is classified:
  // premium_fee       → goes to our revenue account (we earned extra)
  // customer_credit   → added to customer's balance (we owe them)
  // premium_discount  → we gave discount (expense for us)
  // customer_receivable → customer owes us (debt on their account)
  netDifferenceType: netDifferenceTypeEnum("net_difference_type"),

  // Metadata
  notes: text("notes"),
  logs: jsonb("logs").notNull().default(sql`'[]'::jsonb`),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true, transactionNumber: true, createdAt: true, updatedAt: true,
  logs: true, approvedAt: true,
});
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// DOUBLE-ENTRY ACCOUNTING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Accounting Enums ─────────────────────────────────────────────────────────

export const accountTypeEnum = pgEnum("account_type", [
  "asset",       // 1xxx — what we own (cash, bank, crypto)
  "liability",   // 2xxx — what we owe (customer credits, payables)
  "equity",      // 3xxx — net worth (capital, retained earnings)
  "revenue",     // 4xxx — income (fees, spread, exchange gains)
  "expense",     // 5xxx — costs (exchange fees paid, discounts given)
]);

export const periodStatusEnum = pgEnum("period_status", [
  "open",    // accepts new journal entries
  "closed",  // no new entries, can reopen
  "locked",  // permanently frozen, cannot reopen
]);

export const journalEntryStatusEnum = pgEnum("journal_entry_status", [
  "draft",   // being composed, not yet balanced/posted
  "posted",  // debits = credits, committed to ledger
  "void",    // cancelled, net effect is zero
]);

export const sourceDocTypeEnum = pgEnum("source_doc_type", [
  "receipt",           // cash/crypto received from customer
  "payment_voucher",   // cash/crypto paid to customer
  "invoice",           // fee invoice to customer
  "credit_note",       // refund/credit note issued
  "debit_note",        // debit note / customer charge
  "journal_voucher",   // internal adjustment / reclassification
]);

// ─── Currencies ───────────────────────────────────────────────────────────────

export const currencies = pgTable("currencies", {
  code:           varchar("code", { length: 10 }).primaryKey(),       // "USD", "YER", "USDT"
  name:           varchar("name", { length: 100 }).notNull(),
  symbol:         varchar("symbol", { length: 10 }).notNull(),
  type:           varchar("type", { length: 10 }).notNull().default("fiat"), // "fiat" | "crypto"
  isBaseCurrency: boolean("is_base_currency").notNull().default(false),
  isActive:       boolean("is_active").notNull().default(true),
  decimalPlaces:  integer("decimal_places").notNull().default(2),
  createdAt:      timestamp("created_at").notNull().default(sql`now()`),
});
export const insertCurrencySchema = createInsertSchema(currencies);
export type InsertCurrency = z.infer<typeof insertCurrencySchema>;
export type Currency = typeof currencies.$inferSelect;

// ─── Exchange Rates ───────────────────────────────────────────────────────────

export const exchangeRates = pgTable("exchange_rates", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromCurrency:    varchar("from_currency", { length: 10 }).notNull(),
  toCurrency:      varchar("to_currency",   { length: 10 }).notNull(),  // always base currency
  rate:            decimal("rate", { precision: 18, scale: 6 }),  // mid/reference rate (optional, IFRS IAS 21 reference only)
  buyRate:         decimal("buy_rate",  { precision: 18, scale: 6 }),  // rate we buy from customer (inflow)
  sellRate:        decimal("sell_rate", { precision: 18, scale: 6 }),  // rate we sell to customer (outflow)
  effectiveDate:   varchar("effective_date", { length: 10 }).notNull(),  // "YYYY-MM-DD"
  source:          varchar("source", { length: 50 }).notNull().default("manual"),
  notes:           text("notes"),
  createdBy:       varchar("created_by"),
  createdAt:       timestamp("created_at").notNull().default(sql`now()`),
});
export const insertExchangeRateSchema = createInsertSchema(exchangeRates)
  .omit({ id: true, createdAt: true })
  .extend({ rate: z.string().nullable().optional() });
export type InsertExchangeRate = z.infer<typeof insertExchangeRateSchema>;
export type ExchangeRate = typeof exchangeRates.$inferSelect;

// ─── Accounting Periods ───────────────────────────────────────────────────────

export const accountingPeriods = pgTable("accounting_periods", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name:        varchar("name", { length: 100 }).notNull(),    // "March 2026"
  startDate:   varchar("start_date", { length: 10 }).notNull(), // "2026-03-01"
  endDate:     varchar("end_date",   { length: 10 }).notNull(), // "2026-03-31"
  status:      periodStatusEnum("status").notNull().default("open"),
  closedBy:    varchar("closed_by"),
  closedAt:    timestamp("closed_at"),
  notes:       text("notes"),
  createdBy:   varchar("created_by"),
  createdAt:   timestamp("created_at").notNull().default(sql`now()`),
});
export const insertAccountingPeriodSchema = createInsertSchema(accountingPeriods).omit({ id: true, createdAt: true, closedAt: true });
export type InsertAccountingPeriod = z.infer<typeof insertAccountingPeriodSchema>;
export type AccountingPeriod = typeof accountingPeriods.$inferSelect;

// ─── Watched Wallets (Ankr blockchain auto-sync) ──────────────────────────────

export const watchedWallets = pgTable("watched_wallets", {
  id:            varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label:         varchar("label", { length: 100 }).notNull(),
  walletAddress: varchar("wallet_address", { length: 200 }).notNull(),
  network:       varchar("network", { length: 20 }).notNull(),         // "bep20","trc20","erc20","polygon"
  assetCurrency: varchar("asset_currency", { length: 10 }).notNull().default("USDT"),
  accountId:     varchar("account_id"),                                // FK → chart_of_accounts.id
  accountName:   varchar("account_name", { length: 200 }),
  providerCode:  varchar("provider_code", { length: 30 }),             // FK → providers.code
  isActive:         boolean("is_active").notNull().default(true),
  lastSyncAt:       timestamp("last_sync_at"),
  lastSyncedBlock:  integer("last_synced_block"),              // Highest block number processed; next sync starts from this + 1
  lastSyncError:    text("last_sync_error"),
  totalSynced:      integer("total_synced").notNull().default(0),
  notes:            text("notes"),
  createdBy:        varchar("created_by"),
  createdAt:        timestamp("created_at").notNull().default(sql`now()`),
  updatedAt:        timestamp("updated_at").notNull().default(sql`now()`),
});
export const insertWatchedWalletSchema = createInsertSchema(watchedWallets).omit({ id: true, createdAt: true, updatedAt: true, lastSyncAt: true, lastSyncError: true, totalSynced: true });
export type InsertWatchedWallet = z.infer<typeof insertWatchedWalletSchema>;
export type WatchedWallet = typeof watchedWallets.$inferSelect;

// ─── Crypto Networks ──────────────────────────────────────────────────────────
// Each row = one blockchain network. Stores the fixed USD gas fee per transfer.
// Linked from providers.networkId so the fee is managed in one place.

export const cryptoNetworks = pgTable("crypto_networks", {
  id:            varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code:          varchar("code",         { length: 20  }).notNull().unique(),  // "BEP20", "TRC20"
  name:          varchar("name",         { length: 100 }).notNull(),           // "BNB Smart Chain (BEP-20)"
  blockchain:    varchar("blockchain",   { length: 50  }),                     // "BSC", "TRON"
  nativeToken:   varchar("native_token", { length: 20  }),                     // "BNB", "TRX"
  networkFeeUsd: decimal("network_fee_usd", { precision: 18, scale: 6 }).notNull().default("0.10"),
  isActive:      boolean("is_active").notNull().default(true),
  sortOrder:     integer("sort_order").notNull().default(0),
  createdAt:     timestamp("created_at").notNull().default(sql`now()`),
  updatedAt:     timestamp("updated_at").notNull().default(sql`now()`),
});
export const insertCryptoNetworkSchema = createInsertSchema(cryptoNetworks).omit({ createdAt: true, updatedAt: true });
export type InsertCryptoNetwork = z.infer<typeof insertCryptoNetworkSchema>;
export type CryptoNetwork = typeof cryptoNetworks.$inferSelect;

// ─── Providers ────────────────────────────────────────────────────────────────
// Payment gateways / service types.
// A provider defines the service TYPE (e.g. "USDT BEP20 Wallet").
// Multiple CoA accounts can share one provider (e.g. Trust Wallet BEP20
// and MetaMask BEP20 both use the "USDT BEP20" provider).
//
// Category taxonomy:
//   crypto_wallet    — wallet software (Trust Wallet, MetaMask) — transfer by address
//   crypto_platform  — exchange platform (Binance, Bybit…)     — transfer by platform UID
//   cash_bank        — bank (Kuraimi YER, Kuraimi SAR…)        — transfer by account ID
//   cash_wallet      — digital wallet (Jaib, Jawali…)          — transfer by account ID
//   cash_remittance  — hawala/remittance (Bin Jaber, Hazmi)    — transfer by name+phone

export const providers = pgTable("providers", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code:        varchar("code", { length: 50 }).notNull().unique(),
  name:        varchar("name", { length: 200 }).notNull().unique(),
  providerCategory: varchar("provider_category", { length: 30 }).notNull().default("crypto_wallet"),
  // fieldType determines what customer identifier to collect:
  //   "address"     — blockchain wallet address
  //   "platform_id" — exchange account UID
  //   "account_id"  — bank / digital-wallet account number
  //   "name_phone"  — beneficiary name + phone (hawala)
  fieldType:   varchar("field_type", { length: 20 }).notNull().default("address"),
  fieldName:   varchar("field_name", { length: 200 }).notNull(),
  currency:    varchar("currency", { length: 10 }),
  // FK → crypto_networks.id — drives the gas fee look-up
  networkId:   varchar("network_id"),
  // Legacy short code kept for display/filtering convenience
  networkCode: varchar("network_code", { length: 20 }),
  // Fixed network fee in USD per transaction (synced from crypto_networks.networkFeeUsd at seed)
  networkFeeUsd: decimal("network_fee_usd", { precision: 18, scale: 6 }).default("0"),
  // Fee rates charged TO customer (percentage, e.g. 4 = 4%)
  depositFeeRate:  decimal("deposit_fee_rate",  { precision: 8, scale: 4 }).default("0"),  // on deposit (we send to customer)
  withdrawFeeRate: decimal("withdraw_fee_rate", { precision: 8, scale: 4 }).default("0"),  // on withdraw (customer sends to us)
  // Network/channel expense rates — what the channel costs US (percentage)
  depositExpenseRate:  decimal("deposit_expense_rate",  { precision: 8, scale: 4 }).default("0"),
  withdrawExpenseRate: decimal("withdraw_expense_rate", { precision: 8, scale: 4 }).default("0"),
  // Transaction limits in USD
  minDepositUsd:  decimal("min_deposit_usd",  { precision: 18, scale: 4 }),
  maxDepositUsd:  decimal("max_deposit_usd",  { precision: 18, scale: 4 }),
  minWithdrawUsd: decimal("min_withdraw_usd", { precision: 18, scale: 4 }),
  maxWithdrawUsd: decimal("max_withdraw_usd", { precision: 18, scale: 4 }),
  description: text("description"),
  isActive:    boolean("is_active").notNull().default(true),
  createdBy:   varchar("created_by"),
  createdAt:   timestamp("created_at").notNull().default(sql`now()`),
  updatedAt:   timestamp("updated_at").notNull().default(sql`now()`),
});
export const insertProviderSchema = createInsertSchema(providers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Provider = typeof providers.$inferSelect;

// ─── Chart of Accounts ────────────────────────────────────────────────────────

export const chartOfAccounts = pgTable("chart_of_accounts", {
  id:           varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code:         varchar("code", { length: 20 }).notNull().unique(),  // "1101"
  name:         varchar("name", { length: 200 }).notNull(),
  type:         accountTypeEnum("type").notNull(),
  subtype:      varchar("subtype", { length: 100 }),                 // "current_asset", "bank", "crypto"
  parentCode:   varchar("parent_code", { length: 20 }),              // hierarchical parent
  currency:     varchar("currency", { length: 10 }).notNull().default("USD"),
  description:  text("description"),
  isActive:     boolean("is_active").notNull().default(true),
  isSystemAcc:  boolean("is_system_acc").notNull().default(false),   // protected, cannot delete
  // Link to provider: identifies which service/platform/bank this account is for
  providerId:   varchar("provider_id"),                              // FK → providers.id
  // Account-level exchange rates — what THIS account charges the system
  // buyRate:  rate at which this account buys USD/crypto (for inflows from this account)
  // sellRate: rate at which this account sells USD/crypto (for outflows to this account)
  // Spread = systemRate - accountRate = our revenue
  buyRate:      decimal("buy_rate",  { precision: 18, scale: 6 }),
  sellRate:     decimal("sell_rate", { precision: 18, scale: 6 }),
  createdBy:    varchar("created_by"),
  createdAt:    timestamp("created_at").notNull().default(sql`now()`),
  updatedAt:    timestamp("updated_at").notNull().default(sql`now()`),
});
export const insertChartOfAccountsSchema = createInsertSchema(chartOfAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChartOfAccounts = z.infer<typeof insertChartOfAccountsSchema>;
export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;

// ─── Journal Entries (Headers) ────────────────────────────────────────────────

export const journalEntries = pgTable("journal_entries", {
  id:             varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entryNumber:    text("entry_number").notNull().unique(),        // "JE-2026-000001"
  periodId:       varchar("period_id").notNull(),                 // FK → accountingPeriods
  entryDate:      varchar("entry_date", { length: 10 }).notNull(), // "YYYY-MM-DD"
  description:    text("description").notNull(),
  status:         journalEntryStatusEnum("status").notNull().default("draft"),
  // Source linkage — what operational event created this entry
  sourceType:     varchar("source_type", { length: 50 }),         // "transaction", "record", "manual"
  sourceId:       varchar("source_id"),
  // Totals (auto-computed from lines)
  totalDebit:     decimal("total_debit",  { precision: 18, scale: 4 }).notNull().default("0"),
  totalCredit:    decimal("total_credit", { precision: 18, scale: 4 }).notNull().default("0"),
  baseCurrency:   varchar("base_currency", { length: 10 }).notNull().default("USD"),
  notes:          text("notes"),
  postedBy:       varchar("posted_by"),
  postedAt:       timestamp("posted_at"),
  voidedBy:       varchar("voided_by"),
  voidedAt:       timestamp("voided_at"),
  voidReason:     text("void_reason"),
  createdBy:      varchar("created_by"),
  createdAt:      timestamp("created_at").notNull().default(sql`now()`),
  updatedAt:      timestamp("updated_at").notNull().default(sql`now()`),
});
export const insertJournalEntrySchema = createInsertSchema(journalEntries).omit({
  id: true, entryNumber: true, createdAt: true, updatedAt: true,
  totalDebit: true, totalCredit: true, postedAt: true, voidedAt: true,
});
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntries.$inferSelect;

// ─── Journal Entry Lines (Details) ───────────────────────────────────────────

export const journalEntryLines = pgTable("journal_entry_lines", {
  id:                varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  journalEntryId:    varchar("journal_entry_id").notNull(),     // FK → journalEntries
  lineNumber:        integer("line_number").notNull(),           // 1-based ordering
  accountCode:       varchar("account_code", { length: 20 }).notNull(), // FK → chartOfAccounts.code
  accountName:       varchar("account_name", { length: 200 }),   // denormalised for performance
  description:       varchar("description", { length: 500 }),
  debitAmount:       decimal("debit_amount",  { precision: 18, scale: 4 }).notNull().default("0"),
  creditAmount:      decimal("credit_amount", { precision: 18, scale: 4 }).notNull().default("0"),
  currency:          varchar("currency", { length: 10 }).notNull().default("USD"),
  exchangeRate:      decimal("exchange_rate", { precision: 18, scale: 6 }).notNull().default("1"),
  // Amounts converted to base currency
  debitBase:         decimal("debit_base",  { precision: 18, scale: 4 }).notNull().default("0"),
  creditBase:        decimal("credit_base", { precision: 18, scale: 4 }).notNull().default("0"),
  // Optional linkage to customer (for sub-ledger)
  partyId:           varchar("party_id"),                        // FK → customers.id
  partyName:         varchar("party_name", { length: 200 }),
  createdAt:         timestamp("created_at").notNull().default(sql`now()`),
});
export const insertJournalEntryLineSchema = createInsertSchema(journalEntryLines).omit({ id: true, createdAt: true });
export type InsertJournalEntryLine = z.infer<typeof insertJournalEntryLineSchema>;
export type JournalEntryLine = typeof journalEntryLines.$inferSelect;

// ─── Source Documents ─────────────────────────────────────────────────────────

export const sourceDocuments = pgTable("source_documents", {
  id:             varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentNumber: text("document_number").notNull().unique(),    // "RCP-2026-000001"
  documentType:   sourceDocTypeEnum("document_type").notNull(),
  journalEntryId: varchar("journal_entry_id"),                   // FK → journalEntries
  // Party (customer, supplier, etc.)
  partyId:        varchar("party_id"),                           // FK → customers.id
  partyName:      varchar("party_name", { length: 200 }),
  // Financial details
  amount:         decimal("amount", { precision: 18, scale: 4 }).notNull(),
  currency:       varchar("currency", { length: 10 }).notNull(),
  amountBase:     decimal("amount_base", { precision: 18, scale: 4 }),
  documentDate:   varchar("document_date", { length: 10 }).notNull(),
  dueDate:        varchar("due_date", { length: 10 }),
  description:    text("description").notNull(),
  reference:      varchar("reference", { length: 200 }),         // external ref / receipt #
  status:         varchar("status", { length: 20 }).notNull().default("active"),
  attachments:    jsonb("attachments").default(sql`'[]'::jsonb`),
  notes:          text("notes"),
  createdBy:      varchar("created_by"),
  createdAt:      timestamp("created_at").notNull().default(sql`now()`),
  updatedAt:      timestamp("updated_at").notNull().default(sql`now()`),
});
export const insertSourceDocumentSchema = createInsertSchema(sourceDocuments).omit({
  id: true, documentNumber: true, createdAt: true, updatedAt: true,
});
export type InsertSourceDocument = z.infer<typeof insertSourceDocumentSchema>;
export type SourceDocument = typeof sourceDocuments.$inferSelect;

// ─── Audit Logs ──────────────────────────────────────────────────────────────

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: auditEntityEnum("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  action: text("action").notNull(),
  actorId: varchar("actor_id"),
  actorName: text("actor_name"),
  before: jsonb("before"),
  after: jsonb("after"),
  ipAddress: text("ip_address"),
  entryHash: varchar("entry_hash", { length: 64 }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type AuditLog = typeof auditLogs.$inferSelect;

// ─── Transaction Entries ──────────────────────────────────────────────────────
// Financial distribution lines within a transaction.
// NOT operational records — these are accounting entries explaining how
// the transaction's value is distributed across the P&L and balance sheet.
// Examples: service fee charged, spread profit earned, network expense incurred.

export const transactionEntries = pgTable("transaction_entries", {
  id:             varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionId:  varchar("transaction_id").notNull(),           // FK → transactions.id
  entryType:      transactionEntryTypeEnum("entry_type").notNull(),
  description:    varchar("description", { length: 500 }).notNull(),
  amount:         decimal("amount", { precision: 18, scale: 6 }).notNull(),
  currency:       varchar("currency", { length: 10 }).notNull().default("USD"),
  usdEquivalent:  decimal("usd_equivalent", { precision: 18, scale: 4 }),
  direction:      varchar("direction", { length: 10 }).notNull().default("debit"),  // "debit" | "credit"
  // CoA linkage
  accountId:      varchar("account_id"),                         // FK → chart_of_accounts.id
  accountName:    varchar("account_name", { length: 200 }),
  // Party (customer, affiliate, etc.)
  customerId:     varchar("customer_id"),
  // Linked journal entry (if auto-posted)
  journalEntryId: varchar("journal_entry_id"),
  // Extra data (rate used, referral parent ID, etc.)
  metadata:       jsonb("metadata"),
  createdBy:      varchar("created_by"),
  createdAt:      timestamp("created_at").notNull().default(sql`now()`),
});
export const insertTransactionEntrySchema = createInsertSchema(transactionEntries).omit({ id: true, createdAt: true });
export type InsertTransactionEntry = z.infer<typeof insertTransactionEntrySchema>;
export type TransactionEntry = typeof transactionEntries.$inferSelect;

// ─── Compliance Alerts ────────────────────────────────────────────────────────
// Auto-generated alerts from the Sicarios engine (AML, KYC, liquidity, etc.)
// Staff must acknowledge or resolve each alert — open criticals block progression.

export const complianceAlerts = pgTable("compliance_alerts", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertType:       complianceAlertTypeEnum("alert_type").notNull(),
  severity:        complianceAlertSeverityEnum("severity").notNull().default("warning"),
  status:          complianceAlertStatusEnum("status").notNull().default("open"),
  // Context references
  customerId:      varchar("customer_id"),
  customerName:    varchar("customer_name", { length: 200 }),
  recordId:        varchar("record_id"),
  transactionId:   varchar("transaction_id"),
  // Alert content
  title:           varchar("title", { length: 300 }).notNull(),
  description:     text("description").notNull(),
  detectedValue:   decimal("detected_value", { precision: 18, scale: 4 }),  // e.g. transaction amount
  thresholdValue:  decimal("threshold_value", { precision: 18, scale: 4 }), // e.g. reporting threshold
  // Resolution
  resolvedBy:      varchar("resolved_by"),
  resolvedAt:      timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  // Extra data for drilldown
  metadata:        jsonb("metadata"),
  createdAt:       timestamp("created_at").notNull().default(sql`now()`),
  updatedAt:       timestamp("updated_at").notNull().default(sql`now()`),
});
export const insertComplianceAlertSchema = createInsertSchema(complianceAlerts).omit({ id: true, createdAt: true, updatedAt: true, resolvedAt: true });
export type InsertComplianceAlert = z.infer<typeof insertComplianceAlertSchema>;
export type ComplianceAlert = typeof complianceAlerts.$inferSelect;

// ─── System Variables ─────────────────────────────────────────────────────────
// Central registry of all reusable domain variables: currencies, networks,
// service types, rate tiers, etc. Everything in the system references these
// keys instead of repeating raw string values, keeping data consistent.
//
// category values:
//   "currency"   — USD, YER, SAR, USDT, BTC, ETH …
//   "network"    — BEP20, TRC20, ERC20, POLYGON …
//   "service"    — deposit, withdraw, transfer, b2b_liquidity …
//   "rate_tier"  — standard, premium, vip …
//   "other"      — catch-all for custom variables

export const systemVariables = pgTable("system_variables", {
  key:         varchar("key", { length: 50 }).primaryKey(),          // e.g. "USDT", "BEP20", "deposit"
  name:        varchar("name", { length: 100 }).notNull(),            // e.g. "Tether USDT", "BEP-20 Network"
  category:    varchar("category", { length: 30 }).notNull(),         // "currency" | "network" | "service" | "rate_tier" | "other"
  // Flexible metadata stored as JSON — e.g. for currency: { symbol, decimals, type }
  // for network: { blockchain, nativeToken, explorerUrl }
  metadata:    jsonb("metadata").default(sql`'{}'::jsonb`),
  description: text("description"),
  isActive:    boolean("is_active").notNull().default(true),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at").notNull().default(sql`now()`),
  updatedAt:   timestamp("updated_at").notNull().default(sql`now()`),
});
export const insertSystemVariableSchema = createInsertSchema(systemVariables).omit({ createdAt: true, updatedAt: true });
export type InsertSystemVariable = z.infer<typeof insertSystemVariableSchema>;
export type SystemVariable = typeof systemVariables.$inferSelect;

// ─── Customer Groups ──────────────────────────────────────────────────────────
// Loyalty tiers with custom exchange rates per currency and fee overrides per provider.
// Assigned to customers via customers.loyaltyGroup (text key = group.code).
//
// rateOverrides JSONB: [{ currencyCode, buyRate, sellRate }]
// feeOverrides  JSONB: [{ providerId, depositFeeRate, withdrawFeeRate }]
// recordLimits  JSONB: { perTransaction, perMonth, perYear, currency }

export const customerGroups = pgTable("customer_groups", {
  id:            varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code:          varchar("code", { length: 40 }).notNull().unique(),  // "standard", "vip", "gold" …
  name:          varchar("name", { length: 100 }).notNull(),
  description:   text("description"),
  color:         varchar("color", { length: 20 }).notNull().default("#6366f1"),
  // Custom exchange rate overrides per currency
  rateOverrides: jsonb("rate_overrides").default(sql`'[]'::jsonb`),
  // Custom provider fee overrides
  feeOverrides:  jsonb("fee_overrides").default(sql`'[]'::jsonb`),
  // Per-record and periodic limits
  recordLimits:  jsonb("record_limits").default(sql`'{}'::jsonb`),
  isActive:      boolean("is_active").notNull().default(true),
  createdBy:     varchar("created_by"),
  createdAt:     timestamp("created_at").notNull().default(sql`now()`),
  updatedAt:     timestamp("updated_at").notNull().default(sql`now()`),
});
export const insertCustomerGroupSchema = createInsertSchema(customerGroups).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomerGroup = z.infer<typeof insertCustomerGroupSchema>;
export type CustomerGroup = typeof customerGroups.$inferSelect;

// ─── Customer Follow-ups ──────────────────────────────────────────────────────
// WhatsApp-style follow-up tasks per customer with due date and completion tracking.

export const followUpStatusEnum = pgEnum("follow_up_status", ["pending", "in_progress", "done", "cancelled"]);
export const followUpPriorityEnum = pgEnum("follow_up_priority", ["low", "medium", "high", "urgent"]);

export const customerFollowUps = pgTable("customer_follow_ups", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId:  varchar("customer_id").notNull(),
  title:       text("title").notNull(),
  notes:       text("notes"),
  status:      followUpStatusEnum("status").notNull().default("pending"),
  priority:    followUpPriorityEnum("priority").notNull().default("medium"),
  dueDate:     varchar("due_date", { length: 10 }),   // "YYYY-MM-DD"
  dueTime:     varchar("due_time", { length: 5 }),    // "HH:MM"
  completedAt: timestamp("completed_at"),
  assignedTo:  varchar("assigned_to"),                // staff user id
  createdBy:   varchar("created_by"),
  createdAt:   timestamp("created_at").notNull().default(sql`now()`),
  updatedAt:   timestamp("updated_at").notNull().default(sql`now()`),
});
export const insertCustomerFollowUpSchema = createInsertSchema(customerFollowUps).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true });
export type InsertCustomerFollowUp = z.infer<typeof insertCustomerFollowUpSchema>;
export type CustomerFollowUp = typeof customerFollowUps.$inferSelect;

// ─── SMS Webhook Configs ──────────────────────────────────────────────────────
// Each config maps a unique endpoint slug to a CoA asset account + currency.
// The slug becomes the dynamic route: POST /api/webhooks/sms/:slug

export const smsWebhookConfigs = pgTable("sms_webhook_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  accountId: varchar("account_id").notNull(),
  accountName: text("account_name").notNull(),
  currency: text("currency").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});
export const insertSmsWebhookConfigSchema = createInsertSchema(smsWebhookConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSmsWebhookConfig = z.infer<typeof insertSmsWebhookConfigSchema>;
export type SmsWebhookConfig = typeof smsWebhookConfigs.$inferSelect;

// ─── SMS Parsing Rules ───────────────────────────────────────────────────────
// Extraction rules for a given webhook config. Each rule defines how to pull
// the client name and amount from the raw SMS text, plus the direction.

export const smsParsingRules = pgTable("sms_parsing_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  configId: varchar("config_id").notNull(),
  name: text("name").notNull(),
  direction: recordDirectionEnum("direction").notNull(),
  clientAfterString:  text("client_after_string").notNull(),
  clientBeforeString: text("client_before_string").notNull(),
  amountAfterString:  text("amount_after_string").notNull(),
  amountBeforeString: text("amount_before_string").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});
export const insertSmsParsingRuleSchema = createInsertSchema(smsParsingRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSmsParsingRule = z.infer<typeof insertSmsParsingRuleSchema>;
export type SmsParsingRule = typeof smsParsingRules.$inferSelect;

// ─── SMS Webhook Logs ────────────────────────────────────────────────────────
// Every incoming SMS hit is logged for audit/debugging, whether it succeeds or fails.

export const smsWebhookLogs = pgTable("sms_webhook_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  configId: varchar("config_id"),
  ruleId: varchar("rule_id"),
  rawMessage: text("raw_message").notNull(),
  parsedClient: text("parsed_client"),
  parsedAmount: text("parsed_amount"),
  parsedDirection: text("parsed_direction"),
  matchedCustomerId: varchar("matched_customer_id"),
  matchMethod: text("match_method"),
  matchScore: integer("match_score"),
  recordId: varchar("record_id"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});
export type SmsWebhookLog = typeof smsWebhookLogs.$inferSelect;

// ─── SMS Raw Inbox ────────────────────────────────────────────────────────────
// Stores every incoming SMS immediately upon receipt.
// Messages stay as "pending" until a user clicks Process — which runs
// parsing rules and customer matching to create records.

export const smsRawInbox = pgTable("sms_raw_inbox", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  configId: varchar("config_id"),
  slug: text("slug").notNull(),
  sender: text("sender"),
  rawMessage: text("raw_message").notNull(),
  status: text("status").notNull().default("pending"), // pending | done | failed | skipped
  ruleId: varchar("rule_id"),
  parsedClient: text("parsed_client"),
  parsedAmount: text("parsed_amount"),
  parsedDirection: text("parsed_direction"),
  matchedCustomerId: varchar("matched_customer_id"),
  matchMethod: text("match_method"),
  matchScore: integer("match_score"),
  recordId: varchar("record_id"),
  errorMessage: text("error_message"),
  receivedAt: timestamp("received_at").notNull().default(sql`now()`),
  processedAt: timestamp("processed_at"),
});

export const insertSmsRawInboxSchema = createInsertSchema(smsRawInbox).omit({ id: true, receivedAt: true, processedAt: true });
export type InsertSmsRawInbox = z.infer<typeof insertSmsRawInboxSchema>;
export type SmsRawInbox = typeof smsRawInbox.$inferSelect;

// ─── WhatsApp Notification Queue ───────────────────────────────────────────────

export const notificationQueue = pgTable("notification_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recordId: varchar("record_id").notNull(),
  recordNumber: text("record_number").notNull(),
  customerId: varchar("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  recipientPhone: text("recipient_phone").notNull(),
  templateName: text("template_name").notNull().default("record_confirmed_v1"),
  templateLang: text("template_lang").notNull().default("ar"),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextRetryAt: timestamp("next_retry_at"),
  errorMessage: text("error_message"),
  wamid: text("wamid"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  processedAt: timestamp("processed_at"),
  sentAt: timestamp("sent_at"),
});

export const insertNotificationQueueSchema = createInsertSchema(notificationQueue).omit({ id: true, createdAt: true });
export type InsertNotificationQueue = z.infer<typeof insertNotificationQueueSchema>;
export type NotificationQueue = typeof notificationQueue.$inferSelect;

// ─── WhatsApp Notification Audit Log ──────────────────────────────────────────

export const notificationAuditLog = pgTable("notification_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  queueId: varchar("queue_id").notNull(),
  recordId: varchar("record_id").notNull(),
  recordNumber: text("record_number").notNull(),
  customerId: varchar("customer_id").notNull(),
  customerName: text("customer_name"),
  recipientPhone: text("recipient_phone").notNull(),
  wamid: text("wamid"),
  templateName: text("template_name").notNull(),
  deliveryStatus: text("delivery_status").notNull().default("queued"),
  statusUpdatedAt: timestamp("status_updated_at"),
  errorDetail: text("error_detail"),
  payloadSnapshot: jsonb("payload_snapshot").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertNotificationAuditLogSchema = createInsertSchema(notificationAuditLog).omit({ id: true, createdAt: true });
export type InsertNotificationAuditLog = z.infer<typeof insertNotificationAuditLogSchema>;
export type NotificationAuditLog = typeof notificationAuditLog.$inferSelect;

// ─── Crypto Sends (On-chain outflow) ──────────────────────────────────────────

export const cryptoSendStatusEnum = pgEnum("crypto_send_status", [
  "preview",
  "pending",
  "broadcasting",
  "confirmed",
  "failed",
  "cancelled",
]);

export const cryptoSends = pgTable("crypto_sends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sendNumber: text("send_number").notNull().unique(),
  customerId: varchar("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  recipientAddress: text("recipient_address").notNull(),
  amount: decimal("amount", { precision: 24, scale: 6 }).notNull(),
  currency: text("currency").notNull().default("USDT"),
  network: text("network").notNull().default("BEP20"),
  fromAccountId: varchar("from_account_id").notNull(),
  fromAccountName: text("from_account_name").notNull(),
  exchangeRate: decimal("exchange_rate", { precision: 18, scale: 6 }).notNull().default("1.000000"),
  usdEquivalent: decimal("usd_equivalent", { precision: 18, scale: 4 }).notNull(),
  depositFeeRate: decimal("deposit_fee_rate", { precision: 8, scale: 4 }).notNull().default("0.0000"),
  depositFeeUsd: decimal("deposit_fee_usd", { precision: 18, scale: 4 }).notNull().default("0.0000"),
  networkFeeUsd: decimal("network_fee_usd", { precision: 18, scale: 6 }).notNull().default("0.000000"),
  totalDebitUsd: decimal("total_debit_usd", { precision: 18, scale: 4 }).notNull(),
  txHash: text("tx_hash"),
  blockNumber: integer("block_number"),
  gasUsed: text("gas_used"),
  gasCostBnb: decimal("gas_cost_bnb", { precision: 18, scale: 8 }),
  status: cryptoSendStatusEnum("status").notNull().default("pending"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  errorMessage: text("error_message"),
  journalEntryId: varchar("journal_entry_id"),
  recordId: varchar("record_id"),
  createdBy: varchar("created_by"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertCryptoSendSchema = createInsertSchema(cryptoSends).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCryptoSend = z.infer<typeof insertCryptoSendSchema>;
export type CryptoSend = typeof cryptoSends.$inferSelect;

// ─── Kuraimi Payments ──────────────────────────────────────────────────────────

export const kuraimiPayments = pgTable("kuraimi_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  refNo: text("ref_no").notNull().unique(),
  bankRefNo: text("bank_ref_no"),
  customerId: varchar("customer_id"),
  customerName: text("customer_name"),
  scustId: text("scust_id").notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("YER"),
  merchantName: text("merchant_name").notNull(),
  direction: text("direction").notNull().default("payment"),
  status: text("status").notNull().default("pending"),
  recordId: varchar("record_id"),
  apiCode: integer("api_code"),
  apiMessage: text("api_message"),
  apiMessageDesc: text("api_message_desc"),
  reversedAt: timestamp("reversed_at"),
  reversalRefNo: text("reversal_ref_no"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertKuraimiPaymentSchema = createInsertSchema(kuraimiPayments).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertKuraimiPayment = z.infer<typeof insertKuraimiPaymentSchema>;
export type KuraimiPayment = typeof kuraimiPayments.$inferSelect;

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

// Legacy compatibility
export const users = staffUsers;
export const insertUserSchema = insertStaffUserSchema;
export type InsertUser = InsertStaffUser;
export type User = StaffUser;
