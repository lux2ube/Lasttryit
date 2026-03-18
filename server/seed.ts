import { storage } from "./storage";
import { db } from "./db";
import { staffUsers, customers, blacklistEntries, records, transactions, auditLogs } from "@shared/schema";
import bcrypt from "bcryptjs";

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function seed() {
  console.log("🌱 Seeding database...");

  // Init default settings (safe – only creates missing keys)
  await storage.initDefaultSettings();
  console.log("✅ System settings initialized");

  // Initialize all platform configuration (idempotent — safe every startup)
  // Covers: currencies, crypto networks, accounting period, providers, CoA, exchange rates
  await storage.initializeConfiguration();
  console.log("✅ Platform configuration initialized");

  // Skip demo data if staff already seeded
  const existingUsers = await db.select().from(staffUsers);
  if (existingUsers.length > 0) {
    console.log("✅ Data already seeded, skipping");
    return;
  }

  // ─── Staff Users ───────────────────────────────────────────────────────────
  const createdStaff = await db.insert(staffUsers).values([
    { username: "admin", email: "admin@foms.local", passwordHash: await hashPassword("admin123"), fullName: "System Administrator", role: "admin", isActive: true },
    { username: "ops.manager", email: "ops@foms.local", passwordHash: await hashPassword("ops123"), fullName: "Khalid Al-Rashidi", role: "operations_manager", isActive: true },
    { username: "finance.officer", email: "finance@foms.local", passwordHash: await hashPassword("finance123"), fullName: "Fatima Al-Zahra", role: "finance_officer", isActive: true },
    { username: "compliance", email: "compliance@foms.local", passwordHash: await hashPassword("comply123"), fullName: "Omar Al-Haddad", role: "compliance_officer", isActive: true },
    { username: "support", email: "support@foms.local", passwordHash: await hashPassword("support123"), fullName: "Aisha Mohammed", role: "customer_support", isActive: true },
  ]).returning();
  console.log("✅ Staff users created");

  // ─── Customers ─────────────────────────────────────────────────────────────
  const createdCustomers = await db.insert(customers).values([
    {
      customerId: "CUST-00001", firstName: "Mohammed", secondName: "Ali", thirdName: "Saleh", lastName: "Al-Yamani",
      fullName: "Mohammed Ali Saleh Al-Yamani", phonePrimary: "+967771234567", phoneSecondary: ["+967773334455"],
      email: "m.alyamani@email.com", whatsappGroupId: "grp-001",
      customerStatus: "active", verificationStatus: "verified", riskLevel: "low", loyaltyGroup: "gold",
      demographics: { gender: "male", dob: "1985-03-15", address: "Al-Tahrir St, Sana'a", city: "Sana'a", country: "Yemen", nationality: "Yemeni" },
      labels: ["VIP", "HighVolume"],
      documentation: [{ type: "national_id", number: "Y-12345678", issue_date: "2018-01-01", expiry_date: "2028-01-01" }],
      totalTransactions: 45, totalVolumeUsd: "125000",
    },
    {
      customerId: "CUST-00002", firstName: "Fatima", secondName: "Ahmed", lastName: "Al-Zaidi",
      fullName: "Fatima Ahmed Al-Zaidi", phonePrimary: "+966501234567",
      email: "f.alzaidi@email.com",
      customerStatus: "active", verificationStatus: "verified", riskLevel: "medium", loyaltyGroup: "silver",
      demographics: { gender: "female", dob: "1992-07-22", city: "Riyadh", country: "Saudi Arabia", nationality: "Saudi" },
      labels: ["PromoEligible"],
      documentation: [{ type: "passport", number: "P-98765432", issue_date: "2020-05-15", expiry_date: "2030-05-15" }],
      totalTransactions: 18, totalVolumeUsd: "42000",
    },
    {
      customerId: "CUST-00003", firstName: "Ahmed", secondName: "Hassan", lastName: "Al-Makki",
      fullName: "Ahmed Hassan Al-Makki", phonePrimary: "+967773456789",
      email: "a.almakki@email.com",
      customerStatus: "active", verificationStatus: "unverified", riskLevel: "high", loyaltyGroup: "standard",
      demographics: { gender: "male", dob: "1978-11-30", city: "Aden", country: "Yemen", nationality: "Yemeni" },
      labels: [], documentation: [], totalTransactions: 5, totalVolumeUsd: "8500",
    },
    {
      customerId: "CUST-00004", firstName: "Sarah", lastName: "Al-Rashidi",
      fullName: "Sarah Al-Rashidi", phonePrimary: "+971501234567",
      email: "s.alrashidi@email.com",
      customerStatus: "suspended", verificationStatus: "blocked", riskLevel: "high", loyaltyGroup: "standard",
      isBlacklisted: true,
      demographics: { gender: "female", dob: "1988-04-10", city: "Dubai", country: "UAE" },
      labels: ["Restricted"], documentation: [], totalTransactions: 2, totalVolumeUsd: "1200",
    },
    {
      customerId: "CUST-00005", firstName: "Omar", secondName: "Khalid", lastName: "Al-Haddad",
      fullName: "Omar Khalid Al-Haddad", phonePrimary: "+965501234567",
      email: "o.alhaddad@email.com",
      customerStatus: "active", verificationStatus: "verified", riskLevel: "low", loyaltyGroup: "platinum",
      demographics: { gender: "male", dob: "1980-09-05", city: "Kuwait City", country: "Kuwait", nationality: "Kuwaiti" },
      labels: ["VIP", "Corporate"],
      documentation: [{ type: "national_id", number: "K-55512345", issue_date: "2019-01-01", expiry_date: "2029-01-01" }],
      totalTransactions: 120, totalVolumeUsd: "580000",
    },
  ] as any).returning();
  console.log("✅ Customers created");

  // ─── Blacklist ─────────────────────────────────────────────────────────────
  await db.insert(blacklistEntries).values([
    { type: "phone", value: "+967777000111", reason: "Fraudulent transfer activity", isActive: true, matchCount: 3 },
    { type: "name_fragment", value: "Al-Fraud", reason: "Known alias of criminal network", isActive: true, matchCount: 1 },
    { type: "email", value: "fraud@suspicious.com", reason: "Associated with scam operation", isActive: true, matchCount: 0 },
    { type: "wallet_address", value: "TXXXSuspiciousAddress000", reason: "Linked to sanctioned entity", isActive: true, matchCount: 2 },
    { type: "phone", value: "+967771112222", reason: "Reported by compliance", isActive: false, matchCount: 0 },
  ]);
  console.log("✅ Blacklist entries created");

  // ─── Records ───────────────────────────────────────────────────────────────
  const c1 = createdCustomers[0]?.id;
  const c2 = createdCustomers[1]?.id;
  const c3 = createdCustomers[2]?.id;
  const c5 = createdCustomers[4]?.id;

  const createdRecords = await db.insert(records).values([
    {
      recordNumber: "REC-2026-000001", customerId: c1,
      type: "cash", direction: "inflow", status: "confirmed", processingStage: "confirmed", recordMethod: "manual", source: "manual",
      accountName: "Kuraimi Bank", accountCurrency: "YER", accountAssetType: "cash", accountField: "001-123456",
      amount: "1850000", currency: "YER", usdEquivalent: "3700", exchangeRate: "500",
      clientName: "Mohammed Ali", clientSenderName: "Mohammed Ali Saleh",
      assetOrProviderName: "Kuraimi Bank", txidOrReferenceNumber: "REF-2026-0301",
      notes: "Deposit for USDT purchase",
      logEvents: [{ action: "created", ts: "2026-03-01T10:00:00Z" }, { action: "confirmed", ts: "2026-03-01T10:30:00Z" }],
    },
    {
      recordNumber: "REC-2026-000002", customerId: c1,
      type: "crypto", direction: "outflow", status: "confirmed", processingStage: "confirmed", recordMethod: "manual", source: "manual",
      accountName: "Binance TRC20", accountCurrency: "USDT", accountAssetType: "crypto",
      amount: "100", currency: "USDT", usdEquivalent: "100",
      clientName: "Mohammed Ali", clientRecipientName: "Mohammed Ali Saleh",
      assetOrProviderName: "Binance", networkOrId: "TRC20", accountField: "THXXXCustomerWallet001",
      txidOrReferenceNumber: "0xabc123def456", notes: "USDT outflow via TRC20",
      logEvents: [{ action: "created", ts: "2026-03-01T10:00:00Z" }],
    },
    {
      recordNumber: "REC-2026-000003", customerId: c2,
      type: "cash", direction: "inflow", status: "manual_matched", processingStage: "manual_matched", recordMethod: "manual", source: "manual",
      accountName: "CAC Bank", accountCurrency: "USD", accountAssetType: "cash",
      amount: "500", currency: "USD", usdEquivalent: "500",
      clientName: "Fatima Ahmed", clientSenderName: "Fatima Ahmed Al-Zaidi",
      assetOrProviderName: "CAC Bank", txidOrReferenceNumber: "TXF-2026-0302",
      notes: "Cash deposit pending confirmation",
      logEvents: [{ action: "created", ts: "2026-03-02T09:00:00Z" }],
    },
    {
      recordNumber: "REC-2026-000004", customerId: c5,
      type: "crypto", direction: "inflow", status: "recorded", processingStage: "recorded", recordMethod: "auto", source: "api",
      endpointName: "Ankr-BEP20",
      accountName: "Binance BEP20", accountCurrency: "USDT", accountAssetType: "crypto",
      amount: "5000", currency: "USDT", usdEquivalent: "5000",
      clientName: "Omar Khalid",
      assetOrProviderName: "Binance", networkOrId: "BEP20",
      txidOrReferenceNumber: "0x789xyz", notes: "Auto-detected from blockchain API",
      logEvents: [{ action: "auto_created", ts: "2026-03-03T14:00:00Z" }],
    },
    {
      recordNumber: "REC-2026-000005", customerId: c3,
      type: "cash", direction: "outflow", status: "recorded", processingStage: "recorded", recordMethod: "manual", source: "manual",
      accountName: "Kuraimi Bank", accountCurrency: "YER", accountAssetType: "cash",
      amount: "250000", currency: "YER", usdEquivalent: "500", exchangeRate: "500",
      clientName: "Ahmed Hassan", clientRecipientName: "Ahmed Hassan Al-Makki",
      assetOrProviderName: "Kuraimi Bank", accountField: "009-876543",
      txidOrReferenceNumber: "REF-OUT-003", notes: "Cash withdrawal request",
      logEvents: [{ action: "created", ts: "2026-03-04T11:00:00Z" }],
    },
  ] as any).returning();
  console.log("✅ Records created");

  // ─── Transactions ──────────────────────────────────────────────────────────
  await db.insert(transactions).values([
    {
      transactionNumber: "TX-2026-000001",
      type: "deposit",
      relatedRecords: [
        { record_id: createdRecords[0]?.id, type: "cash_inflow", amount: "3700", currency: "USD" },
        { record_id: createdRecords[1]?.id, type: "crypto_outflow", amount: "100", currency: "USDT" },
      ],
      totalInUsd: "3700", totalOutUsd: "100",
      serviceFeeRate: "4", serviceFeeAmount: "4",
      serviceExpenseRate: "0", serviceExpenseAmount: "0",
      netDifference: "4", netDifferenceType: "premium_fee", netDifferenceDirection: "inflow",
      netDifferenceAccount: "revenue_service_fee",
      notes: "Deposit: YER cash → USDT TRC20",
      logs: [{ action: "created", ts: "2026-03-01T10:00:00Z" }, { action: "approved", ts: "2026-03-01T10:45:00Z" }],
      createdBy: createdStaff[0]?.id,
    },
  ] as any);
  console.log("✅ Transactions created");

  // ─── Audit Logs ────────────────────────────────────────────────────────────
  await db.insert(auditLogs).values([
    { entityType: "staff_user", entityId: createdStaff[0]?.id ?? "sys", action: "system_initialized", actorId: null, actorName: "System", before: null, after: null },
    { entityType: "customer", entityId: createdCustomers[0]?.id ?? "", action: "created", actorId: createdStaff[0]?.id, actorName: "System Administrator", before: null, after: { fullName: "Mohammed Ali Saleh Al-Yamani" } },
    { entityType: "customer", entityId: createdCustomers[1]?.id ?? "", action: "created", actorId: createdStaff[0]?.id, actorName: "System Administrator", before: null, after: { fullName: "Fatima Ahmed Al-Zaidi" } },
    { entityType: "customer", entityId: createdCustomers[4]?.id ?? "", action: "created", actorId: createdStaff[2]?.id, actorName: "Fatima Al-Zahra", before: null, after: { fullName: "Omar Khalid Al-Haddad" } },
    { entityType: "record", entityId: createdRecords[0]?.id ?? "", action: "created", actorId: createdStaff[2]?.id, actorName: "Fatima Al-Zahra", before: null, after: { recordNumber: "REC-2026-000001", type: "cash", direction: "inflow" } },
    { entityType: "record", entityId: createdRecords[1]?.id ?? "", action: "created", actorId: createdStaff[2]?.id, actorName: "Fatima Al-Zahra", before: null, after: { recordNumber: "REC-2026-000002", type: "crypto", direction: "outflow" } },
    { entityType: "record", entityId: createdRecords[0]?.id ?? "", action: "confirmed", actorId: createdStaff[1]?.id, actorName: "Khalid Al-Rashidi", before: { processingStage: "manual_matched" }, after: { processingStage: "confirmed" } },
    { entityType: "transaction", entityId: "TX-2026-000001", action: "created", actorId: createdStaff[0]?.id, actorName: "System Administrator", before: null, after: { transactionNumber: "TX-2026-000001", type: "deposit" } },
    { entityType: "blacklist", entityId: "blk-001", action: "added", actorId: createdStaff[3]?.id, actorName: "Omar Al-Haddad", before: null, after: { type: "phone", value: "+967777000111" } },
    { entityType: "system_setting", entityId: "fiat_currencies", action: "initialized", actorId: null, actorName: "System", before: null, after: { value: ["YER", "SAR", "USD"] } },
  ] as any);
  console.log("✅ Audit logs created");

  console.log("🎉 Database seeded successfully!");
}
