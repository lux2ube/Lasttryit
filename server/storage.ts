import { db } from "./db";
import { eq, ilike, or, and, desc, sql, inArray, ne, gte, lte } from "drizzle-orm";
import {
  staffUsers, customers, customerWallets, labels, blacklistEntries,
  blacklistSubjects, blacklistConditions,
  systemSettings, records, transactions, auditLogs,
  currencies, exchangeRates, accountingPeriods, chartOfAccounts,
  journalEntries, journalEntryLines, sourceDocuments, providers, watchedWallets,
  transactionEntries, complianceAlerts, systemVariables, cryptoNetworks,
  customerGroups, customerFollowUps,
  smsWebhookConfigs, smsParsingRules, smsWebhookLogs, smsRawInbox,
  notificationQueue, notificationAuditLog,
  type StaffUser, type InsertStaffUser,
  type Customer, type InsertCustomer,
  type CustomerWallet, type InsertCustomerWallet,
  type Label, type InsertLabel,
  type BlacklistEntry, type InsertBlacklistEntry,
  type BlacklistSubject, type InsertBlacklistSubject,
  type BlacklistCondition, type InsertBlacklistCondition,
  type BlacklistSubjectWithConditions,
  type SystemSetting, type InsertSystemSetting,
  type Record, type InsertRecord,
  type Transaction, type InsertTransaction,
  type AuditLog,
  type Currency, type InsertCurrency,
  type ExchangeRate, type InsertExchangeRate,
  type AccountingPeriod, type InsertAccountingPeriod,
  type ChartOfAccount, type InsertChartOfAccounts,
  type JournalEntry, type InsertJournalEntry,
  type JournalEntryLine, type InsertJournalEntryLine,
  type SourceDocument, type InsertSourceDocument,
  type Provider, type InsertProvider,
  type WatchedWallet, type InsertWatchedWallet,
  type TransactionEntry, type InsertTransactionEntry,
  type ComplianceAlert, type InsertComplianceAlert,
  type SystemVariable, type InsertSystemVariable,
  type CryptoNetwork, type InsertCryptoNetwork,
  type CustomerGroup, type InsertCustomerGroup,
  type CustomerFollowUp, type InsertCustomerFollowUp,
  type SmsWebhookConfig, type InsertSmsWebhookConfig,
  type SmsParsingRule, type InsertSmsParsingRule,
  type SmsWebhookLog,
  type SmsRawInbox, type InsertSmsRawInbox,
} from "@shared/schema";
import { enforceRecordLock } from "./financial-engine";
import crypto from "crypto";

export type FeeBreakdown = {
  principalUsd:    number;
  serviceFeeUsd:   number;   // crypto service fee (4101). 0 for cash.
  networkFeeUsd:   number;   // crypto gas fee (4301). 0 for cash.
  effectiveFeeRate: number;  // crypto service fee rate %. 0 for cash.
  spreadUsd?:      number;   // cash FX spread income (4201). undefined for crypto.
  spreadRate?:     number;   // cash FX spread rate %. undefined for crypto.
  clientLiabilityUsd: number; // net USD amount credited/debited to the client's liability account
};

export interface IStorage {
  // Staff Users
  getStaffUser(id: string): Promise<StaffUser | undefined>;
  getStaffUserByUsername(username: string): Promise<StaffUser | undefined>;
  getStaffUserByEmail(email: string): Promise<StaffUser | undefined>;
  getAllStaffUsers(): Promise<StaffUser[]>;
  createStaffUser(user: InsertStaffUser): Promise<StaffUser>;
  updateStaffUser(id: string, updates: Partial<InsertStaffUser>): Promise<StaffUser | undefined>;
  updateStaffUserLastLogin(id: string): Promise<void>;

  // Customers
  getCustomer(id: string): Promise<Customer | undefined>;
  getCustomerByCustomerId(customerId: string): Promise<Customer | undefined>;
  findCustomerByPhone(phone: string, excludeId?: string): Promise<Customer | undefined>;
  findCustomerByFullName(name: string, excludeId?: string): Promise<Customer | undefined>;
  getAllCustomers(filters?: { search?: string; status?: string; verificationStatus?: string; riskLevel?: string }): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer, createdBy?: string): Promise<Customer>;
  updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer | undefined>;
  deleteCustomer(id: string): Promise<void>;
  generateCustomerId(): Promise<string>;

  // Customer Wallets
  getCustomerWallets(customerId: string): Promise<CustomerWallet[]>;
  createCustomerWallet(wallet: InsertCustomerWallet, addedBy?: string): Promise<CustomerWallet>;
  updateCustomerWallet(id: string, updates: Partial<InsertCustomerWallet>): Promise<CustomerWallet | undefined>;
  deleteCustomerWallet(id: string): Promise<void>;
  setDefaultWallet(customerId: string, walletId: string, providerName: string): Promise<void>;

  // Labels
  getAllLabels(): Promise<Label[]>;
  createLabel(label: InsertLabel, createdBy?: string): Promise<Label>;
  updateLabel(id: string, updates: Partial<InsertLabel>): Promise<Label | undefined>;
  deleteLabel(id: string): Promise<void>;

  // Blacklist (legacy single-entry — kept for schema compat)
  getAllBlacklistEntries(): Promise<BlacklistEntry[]>;
  createBlacklistEntry(entry: InsertBlacklistEntry): Promise<BlacklistEntry>;
  updateBlacklistEntry(id: string, updates: Partial<InsertBlacklistEntry>): Promise<BlacklistEntry | undefined>;
  deleteBlacklistEntry(id: string): Promise<void>;

  // Blacklist Subjects (AND-condition system)
  getAllBlacklistSubjects(): Promise<BlacklistSubjectWithConditions[]>;
  createBlacklistSubject(data: InsertBlacklistSubject, conditions: Omit<InsertBlacklistCondition, 'subjectId'>[]): Promise<BlacklistSubjectWithConditions>;
  updateBlacklistSubject(id: string, data: Partial<InsertBlacklistSubject>, conditions?: Omit<InsertBlacklistCondition, 'subjectId'>[]): Promise<BlacklistSubjectWithConditions | undefined>;
  deleteBlacklistSubject(id: string): Promise<void>;
  checkBlacklist(customerFields: {
    firstName?: string; secondName?: string; thirdName?: string;
    lastName?: string; fullName?: string;
    phonePrimary?: string; phoneSecondary?: string[];
    email?: string;
    nationalId?: string; passportNo?: string; nationality?: string;
    walletAddresses?: string[];
  }): Promise<BlacklistSubjectWithConditions[]>;

  // System Settings
  getAllSettings(): Promise<SystemSetting[]>;
  getSettingByKey(key: string): Promise<SystemSetting | undefined>;
  upsertSetting(key: string, value: any, updatedBy?: string): Promise<SystemSetting>;
  initDefaultSettings(): Promise<void>;
  initializeConfiguration(): Promise<void>;

  // Records
  getAllRecords(filters?: { type?: string; direction?: string; stage?: string; customerId?: string; transactionId?: string; available?: boolean; source?: string; endpointName?: string; limit?: number }): Promise<Record[]>;
  getRecord(id: string): Promise<Record | undefined>;
  createRecord(record: InsertRecord, createdBy?: string): Promise<Record>;
  updateRecord(id: string, updates: Partial<Record>): Promise<Record | undefined>;

  // Transactions
  getAllTransactions(filters?: { type?: string; customerId?: string }): Promise<Transaction[]>;
  getTransaction(id: string): Promise<Transaction | undefined>;
  createTransaction(transaction: InsertTransaction, createdBy?: string): Promise<Transaction>;
  updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | undefined>;

  // Audit Logs
  createAuditLog(log: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog>;
  getAuditLogs(filters?: { entityType?: string; entityId?: string; limit?: number }): Promise<AuditLog[]>;

  // Dashboard
  getDashboardStats(): Promise<{
    totalCustomers: number;
    activeCustomers: number;
    totalRecords: number;
    pendingRecords: number;
    totalVolumeUsd: number;
    todayRevenue: number;
    blacklistedCount: number;
    highRiskCount: number;
    cashInflowCount: number;
    cashOutflowCount: number;
    cryptoInflowCount: number;
    cryptoOutflowCount: number;
    recordsByStage: { [stage: string]: number };
    recentActivity: AuditLog[];
  }>;

  // Reports
  getReportsData(params?: { days?: number }): Promise<{
    volumeByDay: Array<{ date: string; cashInflowUsd: number; cashOutflowUsd: number; cryptoInflowUsd: number; cryptoOutflowUsd: number; totalUsd: number }>;
    revenueByDay: Array<{ date: string; fee: number; spread: number; net: number }>;
    totalFeeRevenue: number;
    totalSpread: number;
    totalVolume: number;
    topCustomers: Array<{ customerId: string; fullName: string; totalTransactions: number; totalVolumeUsd: string }>;
    volumeByCurrency: Array<{ currency: string; inflow: number; outflow: number; netUsd: number; count: number }>;
    recordsStatusSummary: Array<{ stage: string; type: string; count: number; totalAmount: number; currency: string }>;
    spreadAnalysis: Array<{ currency: string; buyRate: number | null; sellRate: number | null; midRate: number; spreadPct: number | null; date: string }>;
    totalRecords: number;
    pendingRecords: number;
    unmatchedRecords: number;
    highRiskCustomers: number;
  }>;

  // ─── Accounting Engine ─────────────────────────────────────────────────────

  // Currencies
  getAllCurrencies(): Promise<Currency[]>;
  getCurrency(code: string): Promise<Currency | undefined>;
  upsertCurrency(currency: InsertCurrency): Promise<Currency>;
  deleteCurrency(code: string): Promise<void>;

  // Exchange Rates
  getExchangeRates(filters?: { fromCurrency?: string; effectiveDate?: string }): Promise<ExchangeRate[]>;
  getLatestExchangeRate(fromCurrency: string, toCurrency?: string): Promise<ExchangeRate | undefined>;
  createExchangeRate(rate: InsertExchangeRate): Promise<ExchangeRate>;
  updateExchangeRate(id: string, updates: Partial<InsertExchangeRate>): Promise<ExchangeRate | undefined>;
  deleteExchangeRate(id: string): Promise<void>;

  // Accounting Periods
  getAllPeriods(): Promise<AccountingPeriod[]>;
  getPeriod(id: string): Promise<AccountingPeriod | undefined>;
  getOpenPeriod(): Promise<AccountingPeriod | undefined>;
  createPeriod(period: InsertAccountingPeriod): Promise<AccountingPeriod>;
  updatePeriodStatus(id: string, status: 'open' | 'closed' | 'locked', closedBy?: string): Promise<AccountingPeriod | undefined>;

  // Chart of Accounts
  getAllAccounts(filters?: { type?: string; isActive?: boolean }): Promise<ChartOfAccount[]>;
  getAccount(id: string): Promise<ChartOfAccount | undefined>;
  getAccountByCode(code: string): Promise<ChartOfAccount | undefined>;
  createAccount(account: InsertChartOfAccounts, createdBy?: string): Promise<ChartOfAccount>;
  updateAccount(id: string, updates: Partial<InsertChartOfAccounts>): Promise<ChartOfAccount | undefined>;
  deleteAccount(id: string): Promise<void>;
  getAccountBalances(): Promise<{ [accountId: string]: { totalDebit: number; totalCredit: number } }>;

  // Journal Entries
  getAllJournalEntries(filters?: { periodId?: string; status?: string; sourceType?: string }): Promise<JournalEntry[]>;
  getJournalEntry(id: string): Promise<JournalEntry | undefined>;
  getJournalEntryWithLines(id: string): Promise<{ entry: JournalEntry; lines: JournalEntryLine[] } | undefined>;
  getConfirmationJEForRecord(recordId: string): Promise<{ entry: JournalEntry; lines: JournalEntryLine[] } | undefined>;
  createJournalEntry(entry: InsertJournalEntry, lines: InsertJournalEntryLine[], postedBy?: string): Promise<{ entry: JournalEntry; lines: JournalEntryLine[] }>;
  postJournalEntry(id: string, postedBy: string): Promise<JournalEntry | undefined>;
  voidJournalEntry(id: string, voidedBy: string, reason: string): Promise<JournalEntry | undefined>;
  generateJournalEntryNumber(): Promise<string>;

  // Source Documents
  getAllSourceDocuments(filters?: { documentType?: string; partyId?: string }): Promise<SourceDocument[]>;
  getSourceDocument(id: string): Promise<SourceDocument | undefined>;
  createSourceDocument(doc: InsertSourceDocument, createdBy?: string): Promise<SourceDocument>;
  updateSourceDocument(id: string, updates: Partial<InsertSourceDocument>): Promise<SourceDocument | undefined>;
  generateDocumentNumber(type: string): Promise<string>;

  // Auto-generate journal entry from a transaction (double-entry)
  autoGenerateJournalEntry(transactionId: string, postedBy: string): Promise<JournalEntry | undefined>;

  // Record-level journal entry: fires when a record moves from draft → recorded
  generateRecordJournalEntry(recordId: string, postedBy: string): Promise<JournalEntry | undefined>;
  // Matching JE: fires when a recorded record (2101 suspense) gets a customer linked
  generateMatchingJournalEntry(recordId: string, customerId: string, postedBy: string): Promise<JournalEntry | undefined>;
  // Reversal JE: fires when a record is cancelled (reverses all JEs for this record)
  reverseRecordJournalEntry(recordId: string, postedBy: string): Promise<JournalEntry | undefined>;

  // Crypto Networks
  getAllCryptoNetworks(includeInactive?: boolean): Promise<CryptoNetwork[]>;
  getCryptoNetwork(id: string): Promise<CryptoNetwork | undefined>;
  getCryptoNetworkByCode(code: string): Promise<CryptoNetwork | undefined>;
  createCryptoNetwork(data: InsertCryptoNetwork): Promise<CryptoNetwork>;
  updateCryptoNetwork(id: string, updates: Partial<InsertCryptoNetwork>): Promise<CryptoNetwork | undefined>;
  deleteCryptoNetwork(id: string): Promise<void>;

  // Providers
  getAllProviders(filters?: { isActive?: boolean }): Promise<Provider[]>;
  getProvider(id: string): Promise<Provider | undefined>;
  createProvider(data: InsertProvider, createdBy?: string): Promise<Provider>;
  updateProvider(id: string, updates: Partial<InsertProvider>): Promise<Provider | undefined>;
  deleteProvider(id: string): Promise<void>;

  // Watched Wallets (Ankr auto-sync)
  getAllWatchedWallets(): Promise<WatchedWallet[]>;
  getWatchedWallet(id: string): Promise<WatchedWallet | undefined>;
  createWatchedWallet(data: InsertWatchedWallet, createdBy?: string): Promise<WatchedWallet>;
  updateWatchedWallet(id: string, updates: Partial<WatchedWallet>): Promise<WatchedWallet | undefined>;
  deleteWatchedWallet(id: string): Promise<void>;

  // Transaction Entries (financial distribution lines)
  getTransactionEntries(transactionId: string): Promise<TransactionEntry[]>;
  createTransactionEntry(entry: InsertTransactionEntry): Promise<TransactionEntry>;
  deleteTransactionEntry(id: string): Promise<void>;

  // Compliance Alerts (AML / KYC / Liquidity)
  getAllComplianceAlerts(filters?: { status?: string; severity?: string; alertType?: string; customerId?: string }): Promise<ComplianceAlert[]>;
  getComplianceAlert(id: string): Promise<ComplianceAlert | undefined>;
  createComplianceAlert(alert: InsertComplianceAlert): Promise<ComplianceAlert>;
  updateComplianceAlert(id: string, updates: Partial<ComplianceAlert>): Promise<ComplianceAlert | undefined>;
  getOpenCriticalAlertCount(): Promise<number>;

  // System Variables
  getAllSystemVariables(category?: string): Promise<SystemVariable[]>;
  getSystemVariable(key: string): Promise<SystemVariable | undefined>;
  upsertSystemVariable(data: InsertSystemVariable): Promise<SystemVariable>;
  deleteSystemVariable(key: string): Promise<void>;

  // Customer Groups
  getAllCustomerGroups(): Promise<CustomerGroup[]>;
  getCustomerGroup(id: string): Promise<CustomerGroup | undefined>;
  createCustomerGroup(data: InsertCustomerGroup, createdBy?: string): Promise<CustomerGroup>;
  updateCustomerGroup(id: string, updates: Partial<InsertCustomerGroup>): Promise<CustomerGroup | undefined>;
  deleteCustomerGroup(id: string): Promise<void>;

  // Customer Follow-ups
  getAllFollowUps(filters?: { customerId?: string; status?: string; assignedTo?: string }): Promise<CustomerFollowUp[]>;
  getFollowUp(id: string): Promise<CustomerFollowUp | undefined>;
  createFollowUp(data: InsertCustomerFollowUp, createdBy?: string): Promise<CustomerFollowUp>;
  updateFollowUp(id: string, updates: Partial<InsertCustomerFollowUp & { completedAt?: Date | null }>): Promise<CustomerFollowUp | undefined>;
  deleteFollowUp(id: string): Promise<void>;

  // SMS Webhook Configs
  getAllSmsWebhookConfigs(): Promise<SmsWebhookConfig[]>;
  getSmsWebhookConfig(id: string): Promise<SmsWebhookConfig | undefined>;
  getSmsWebhookConfigBySlug(slug: string): Promise<SmsWebhookConfig | undefined>;
  createSmsWebhookConfig(data: InsertSmsWebhookConfig): Promise<SmsWebhookConfig>;
  updateSmsWebhookConfig(id: string, updates: Partial<InsertSmsWebhookConfig>): Promise<SmsWebhookConfig | undefined>;
  deleteSmsWebhookConfig(id: string): Promise<void>;

  // SMS Parsing Rules
  getSmsParsingRules(configId: string): Promise<SmsParsingRule[]>;
  createSmsParsingRule(data: InsertSmsParsingRule): Promise<SmsParsingRule>;
  updateSmsParsingRule(id: string, updates: Partial<InsertSmsParsingRule>): Promise<SmsParsingRule | undefined>;
  deleteSmsParsingRule(id: string): Promise<void>;

  // SMS Webhook Logs
  getSmsWebhookLogs(filters?: { configId?: string; status?: string; limit?: number }): Promise<SmsWebhookLog[]>;
  createSmsWebhookLog(data: Partial<SmsWebhookLog> & { rawMessage: string }): Promise<SmsWebhookLog>;

  // SMS Raw Inbox (store-first, parse-later queue)
  getSmsRawInbox(filters?: { status?: string; configId?: string; limit?: number }): Promise<SmsRawInbox[]>;
  createSmsRawInboxEntry(data: Omit<InsertSmsRawInbox, 'status'>): Promise<SmsRawInbox>;
  processSmsRawInboxEntry(id: string): Promise<SmsRawInbox>;
  processAllPendingSmsInbox(configId?: string): Promise<{ processed: number; succeeded: number; failed: number }>;
  deleteSmsRawInboxEntry(id: string): Promise<void>;

  // Customer Auto-Matching
  autoMatchCustomer(clientString: string, accountId?: string): Promise<{ customer: Customer; method: string; score: number } | null>;
}

export class DatabaseStorage implements IStorage {
  // ─── Staff Users ───────────────────────────────────────────────────────────
  async getStaffUser(id: string) {
    const [user] = await db.select().from(staffUsers).where(eq(staffUsers.id, id));
    return user;
  }
  async getStaffUserByUsername(username: string) {
    const [user] = await db.select().from(staffUsers).where(eq(staffUsers.username, username));
    return user;
  }
  async getStaffUserByEmail(email: string) {
    const [user] = await db.select().from(staffUsers).where(eq(staffUsers.email, email));
    return user;
  }
  async getAllStaffUsers() {
    return db.select().from(staffUsers).orderBy(desc(staffUsers.createdAt));
  }
  async createStaffUser(user: InsertStaffUser) {
    const [created] = await db.insert(staffUsers).values(user).returning();
    return created;
  }
  async updateStaffUser(id: string, updates: Partial<InsertStaffUser>) {
    const [updated] = await db.update(staffUsers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(staffUsers.id, id)).returning();
    return updated;
  }
  async updateStaffUserLastLogin(id: string) {
    await db.update(staffUsers).set({ lastLoginAt: new Date() }).where(eq(staffUsers.id, id));
  }

  // ─── Customers ─────────────────────────────────────────────────────────────
  async getCustomer(id: string) {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }
  async getCustomerByCustomerId(customerId: string) {
    const [customer] = await db.select().from(customers).where(eq(customers.customerId, customerId));
    return customer;
  }
  async findCustomerByPhone(phone: string, excludeId?: string) {
    const normalized = phone.replace(/\s+/g, "");
    const conditions: any[] = [eq(customers.phonePrimary, normalized)];
    if (excludeId) conditions.push(ne(customers.id, excludeId));
    const [found] = await db.select().from(customers).where(and(...conditions));
    return found;
  }
  async findCustomerByFullName(name: string, excludeId?: string) {
    const normalized = name.trim().toLowerCase();
    const conditions: any[] = [sql`lower(trim(${customers.fullName})) = ${normalized}`];
    if (excludeId) conditions.push(ne(customers.id, excludeId));
    const [found] = await db.select().from(customers).where(and(...conditions));
    return found;
  }
  async getAllCustomers(filters?: { search?: string; status?: string; verificationStatus?: string; riskLevel?: string }) {
    let query = db.select().from(customers).$dynamic();
    const conditions = [];
    if (filters?.search) {
      conditions.push(or(
        ilike(customers.fullName, `%${filters.search}%`),
        ilike(customers.phonePrimary, `%${filters.search}%`),
        ilike(customers.customerId, `%${filters.search}%`),
        ilike(customers.email, `%${filters.search}%`),
      ));
    }
    if (filters?.status) conditions.push(eq(customers.customerStatus, filters.status as any));
    if (filters?.verificationStatus) conditions.push(eq(customers.verificationStatus, filters.verificationStatus as any));
    if (filters?.riskLevel) conditions.push(eq(customers.riskLevel, filters.riskLevel as any));
    if (conditions.length > 0) query = query.where(and(...conditions));
    return query.orderBy(desc(customers.createdAt));
  }
  async generateCustomerId() {
    const count = await db.select({ count: sql<number>`count(*)` }).from(customers);
    const num = (Number(count[0]?.count) ?? 0) + 1;
    return `CUST-${String(num).padStart(5, '0')}`;
  }
  async createCustomer(customer: InsertCustomer, createdBy?: string) {
    const customerId = await this.generateCustomerId();
    const [created] = await db.insert(customers).values({ ...customer, customerId, createdBy }).returning();
    return created;
  }
  async updateCustomer(id: string, updates: Partial<Customer>) {
    const [updated] = await db.update(customers)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(customers.id, id)).returning();
    return updated;
  }
  async deleteCustomer(id: string) {
    await db.delete(customers).where(eq(customers.id, id));
  }

  // ─── Customer Wallets ──────────────────────────────────────────────────────
  async getCustomerWallets(customerId: string) {
    return db.select().from(customerWallets)
      .where(eq(customerWallets.customerId, customerId))
      .orderBy(desc(customerWallets.isDefault), customerWallets.providerName);
  }
  async createCustomerWallet(wallet: InsertCustomerWallet, addedBy?: string) {
    const [created] = await db.insert(customerWallets).values({ ...wallet, addedBy }).returning();
    return created;
  }
  async updateCustomerWallet(id: string, updates: Partial<InsertCustomerWallet>) {
    const [updated] = await db.update(customerWallets)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(customerWallets.id, id)).returning();
    return updated;
  }
  async deleteCustomerWallet(id: string) {
    await db.delete(customerWallets).where(eq(customerWallets.id, id));
  }
  async setDefaultWallet(customerId: string, walletId: string, providerName: string) {
    // Remove default from all wallets of same customer+provider
    await db.update(customerWallets)
      .set({ isDefault: false, updatedAt: new Date() } as any)
      .where(and(
        eq(customerWallets.customerId, customerId),
        eq(customerWallets.providerName, providerName),
        ne(customerWallets.id, walletId)
      ));
    // Set this one as default
    await db.update(customerWallets)
      .set({ isDefault: true, updatedAt: new Date() } as any)
      .where(eq(customerWallets.id, walletId));
  }

  // ─── Labels ────────────────────────────────────────────────────────────────
  async getAllLabels() {
    return db.select().from(labels).orderBy(labels.name);
  }
  async createLabel(label: InsertLabel, createdBy?: string) {
    const [created] = await db.insert(labels).values({ ...label, createdBy }).returning();
    return created;
  }
  async updateLabel(id: string, updates: Partial<InsertLabel>) {
    const [updated] = await db.update(labels)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(labels.id, id)).returning();
    return updated;
  }
  async deleteLabel(id: string) {
    await db.delete(labels).where(eq(labels.id, id));
  }

  // ─── Blacklist (legacy entries — kept for schema compat) ──────────────────
  async getAllBlacklistEntries() {
    return db.select().from(blacklistEntries).orderBy(desc(blacklistEntries.createdAt));
  }
  async createBlacklistEntry(entry: InsertBlacklistEntry) {
    const [created] = await db.insert(blacklistEntries).values(entry).returning();
    return created;
  }
  async updateBlacklistEntry(id: string, updates: Partial<InsertBlacklistEntry>) {
    const [updated] = await db.update(blacklistEntries)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(blacklistEntries.id, id)).returning();
    return updated;
  }
  async deleteBlacklistEntry(id: string) {
    await db.delete(blacklistEntries).where(eq(blacklistEntries.id, id));
  }

  // ─── Blacklist Subjects (AND-condition system) ────────────────────────────
  async getAllBlacklistSubjects(): Promise<BlacklistSubjectWithConditions[]> {
    const subjects = await db.select().from(blacklistSubjects).orderBy(desc(blacklistSubjects.createdAt));
    const conditions = await db.select().from(blacklistConditions);
    return subjects.map(s => ({
      ...s,
      conditions: conditions.filter(c => c.subjectId === s.id),
    }));
  }

  async createBlacklistSubject(
    data: InsertBlacklistSubject,
    conditionRows: Omit<InsertBlacklistCondition, 'subjectId'>[]
  ): Promise<BlacklistSubjectWithConditions> {
    const [subject] = await db.insert(blacklistSubjects).values(data).returning();
    let conditions: BlacklistCondition[] = [];
    if (conditionRows.length > 0) {
      conditions = await db.insert(blacklistConditions)
        .values(conditionRows.map(c => ({ ...c, subjectId: subject.id })))
        .returning();
    }
    return { ...subject, conditions };
  }

  async updateBlacklistSubject(
    id: string,
    data: Partial<InsertBlacklistSubject>,
    conditionRows?: Omit<InsertBlacklistCondition, 'subjectId'>[]
  ): Promise<BlacklistSubjectWithConditions | undefined> {
    const [subject] = await db.update(blacklistSubjects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(blacklistSubjects.id, id)).returning();
    if (!subject) return undefined;
    let conditions: BlacklistCondition[];
    if (conditionRows !== undefined) {
      // Replace all conditions for this subject
      await db.delete(blacklistConditions).where(eq(blacklistConditions.subjectId, id));
      conditions = conditionRows.length > 0
        ? await db.insert(blacklistConditions)
            .values(conditionRows.map(c => ({ ...c, subjectId: id })))
            .returning()
        : [];
    } else {
      conditions = await db.select().from(blacklistConditions).where(eq(blacklistConditions.subjectId, id));
    }
    return { ...subject, conditions };
  }

  async deleteBlacklistSubject(id: string) {
    await db.delete(blacklistConditions).where(eq(blacklistConditions.subjectId, id));
    await db.delete(blacklistSubjects).where(eq(blacklistSubjects.id, id));
  }

  // ── Field-level matching (TypeScript) ─────────────────────────────────────
  private _matchesCondition(cond: BlacklistCondition, f: {
    firstName?: string; secondName?: string; thirdName?: string;
    lastName?: string; fullName?: string;
    phonePrimary?: string; phoneSecondary?: string[];
    email?: string; nationalId?: string; passportNo?: string; nationality?: string;
    walletAddresses?: string[];
  }): boolean {
    const v = cond.value.toLowerCase().trim();
    const contains = (s?: string | null) => !!s && s.toLowerCase().includes(v);
    const exact    = (s?: string | null) => !!s && s.toLowerCase() === v;
    const anyOf    = (arr?: string[])    => (arr ?? []).some(x => x.toLowerCase() === v);
    switch (cond.field) {
      case 'first_name':    return contains(f.firstName);
      case 'second_name':   return contains(f.secondName);
      case 'third_name':    return contains(f.thirdName);
      case 'last_name':     return contains(f.lastName);
      case 'full_name':
      case 'name_fragment': return contains(f.fullName);
      case 'phone':         return f.phonePrimary === cond.value || (f.phoneSecondary ?? []).includes(cond.value);
      case 'email':         return exact(f.email);
      case 'national_id':   return !!f.nationalId && f.nationalId === cond.value;
      case 'passport_no':   return !!f.passportNo  && f.passportNo  === cond.value;
      case 'nationality':   return contains(f.nationality);
      case 'wallet_address':
      case 'bank_account':  return anyOf(f.walletAddresses);
      default:              return false;
    }
  }

  async checkBlacklist(customerFields: {
    firstName?: string; secondName?: string; thirdName?: string;
    lastName?: string; fullName?: string;
    phonePrimary?: string; phoneSecondary?: string[];
    email?: string; nationalId?: string; passportNo?: string; nationality?: string;
    walletAddresses?: string[];
  }): Promise<BlacklistSubjectWithConditions[]> {
    const allSubjects = await this.getAllBlacklistSubjects();
    const hits = allSubjects.filter(s => {
      if (!s.isActive || s.conditions.length === 0) return false;
      // ALL conditions must match (AND logic)
      return s.conditions.every(c => this._matchesCondition(c, customerFields));
    });
    // Increment matchCount for each hit
    for (const s of hits) {
      await db.update(blacklistSubjects)
        .set({ matchCount: s.matchCount + 1, lastMatchAt: new Date(), updatedAt: new Date() })
        .where(eq(blacklistSubjects.id, s.id));
    }
    return hits;
  }

  // ─── System Settings ───────────────────────────────────────────────────────
  async getAllSettings() {
    return db.select().from(systemSettings).orderBy(systemSettings.category, systemSettings.key);
  }
  async getSettingByKey(key: string) {
    const [s] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return s;
  }
  async upsertSetting(key: string, value: any, updatedBy?: string) {
    const existing = await this.getSettingByKey(key);
    if (existing) {
      const [updated] = await db.update(systemSettings)
        .set({ value, updatedBy, updatedAt: new Date() })
        .where(eq(systemSettings.key, key)).returning();
      return updated;
    }
    const [created] = await db.insert(systemSettings).values({ key, value, category: 'general', label: key, updatedBy }).returning();
    return created;
  }
  async initDefaultSettings() {
    const defaults: Array<{ key: string; value: any; category: string; label: string; description?: string; dataType: string }> = [
      // 1. Accounts & Assets
      { key: 'fiat_currencies', value: ['YER', 'SAR', 'USD', 'AED', 'KWD'], category: 'accounts_assets', label: 'Fiat Currencies', description: 'Accepted local currencies', dataType: 'array' },
      { key: 'crypto_assets', value: ['USDT', 'BTC', 'ETH', 'BNB'], category: 'accounts_assets', label: 'Crypto Assets', description: 'Supported digital assets', dataType: 'array' },
      { key: 'crypto_networks', value: { USDT: ['BEP20', 'TRC20', 'ERC20', 'TON', 'Aptos'], BTC: ['Bitcoin'], ETH: ['ERC20'], BNB: ['BEP20'] }, category: 'accounts_assets', label: 'Crypto Networks', description: 'Supported networks per asset', dataType: 'json' },
      { key: 'bank_accounts', value: [{ id: 'bank_01', name: 'Kuraimi Bank - YER', currency: 'YER', accountNumber: '001-123456' }, { id: 'bank_02', name: 'CAC Bank - USD', currency: 'USD', accountNumber: '002-654321' }], category: 'accounts_assets', label: 'Bank Accounts (Ours)', description: 'Our bank accounts for cash inflows/outflows', dataType: 'json' },
      { key: 'crypto_wallets', value: [{ id: 'wallet_01', provider: 'TrustWallet', network: 'BEP20', address: 'BNBXXXXX', asset: 'USDT' }, { id: 'wallet_02', provider: 'Binance', network: 'TRC20', address: 'TXXXXXYYY', asset: 'USDT' }], category: 'accounts_assets', label: 'Crypto Wallets (Ours)', description: 'Our crypto wallets for receiving/sending USDT', dataType: 'json' },
      { key: 'service_fee_rates', value: { deposit: 4, withdraw: 2, transfer: 1 }, category: 'accounts_assets', label: 'Default Service Fee Rates (%)', description: 'Default fee per operation type — can be overridden per customer', dataType: 'json' },
      { key: 'fx_spread_rates', value: { YER: 0.004, SAR: 0.002, AED: 0.002 }, category: 'accounts_assets', label: 'FX Spread Rates', description: 'Our spread added on top of bank rate per currency', dataType: 'json' },

      // 2. Customer Defaults
      { key: 'loyalty_groups', value: { standard: { discounts: { deposit: 0, withdraw: 0 } }, silver: { discounts: { deposit: 0.5, withdraw: 0.5 } }, gold: { discounts: { deposit: 1, withdraw: 1 } }, platinum: { discounts: { deposit: 2, withdraw: 2 } } }, category: 'customer_defaults', label: 'Loyalty Groups & Discounts', description: 'Loyalty tiers with discount rates on service fees', dataType: 'json' },
      { key: 'referral_tracking_enabled', value: true, category: 'customer_defaults', label: 'Referral Tracking', description: 'Enable parent-child referral system', dataType: 'boolean' },

      // 3. Processing Rules
      { key: 'auto_match_sms', value: { enabled: false, endpoint: '/api/webhooks/sms', parsers: ['kuraimi_bank_v1', 'cac_bank_v1'] }, category: 'processing', label: 'SMS Auto-Match', description: 'Sync bank SMS messages to auto-create cash inflow records', dataType: 'json' },
      { key: 'crypto_api_ankr', value: { enabled: false, url: 'https://api.ankr.com', wallets: [] }, category: 'processing', label: 'Ankr Blockchain API', description: 'Watch our wallets for incoming crypto transactions', dataType: 'json' },
      { key: 'excel_import_enabled', value: false, category: 'processing', label: 'Excel Import', description: 'Allow batch record import from Excel files', dataType: 'boolean' },
      { key: 'auto_outflow_trustwallet', value: { enabled: false, privateKeyRef: '' }, category: 'processing', label: 'Auto Outflow (TrustWallet)', description: 'Auto-send crypto to whitelisted customer addresses', dataType: 'json' },

      // 4. Logs & Audit
      { key: 'log_level', value: 'INFO', category: 'audit', label: 'Log Level', description: 'System event logging verbosity', dataType: 'string' },
      { key: 'audit_enabled', value: true, category: 'audit', label: 'Audit Log Enabled', description: 'Track all system operations', dataType: 'boolean' },

      // 5. Security
      { key: 'auto_blacklist_check', value: true, category: 'security', label: 'Auto Blacklist Check on Customer Create', description: 'Screen new customers against blacklist on registration', dataType: 'boolean' },
      { key: 'session_timeout_minutes', value: 60, category: 'security', label: 'Session Timeout (min)', description: 'Auto logout after inactivity', dataType: 'number' },
      { key: 'max_login_attempts', value: 5, category: 'security', label: 'Max Login Attempts', description: 'Lock account after N failed logins', dataType: 'number' },
      { key: 'data_retention_days', value: 2555, category: 'security', label: 'Data Retention (days)', description: '7-year default for compliance', dataType: 'number' },

      // 6. Notifications
      { key: 'whatsapp_api', value: { base_url: '', auth_token: '', instance_id: '' }, category: 'notifications', label: 'WhatsApp Business API', description: 'Credentials for sending WhatsApp notifications', dataType: 'json' },
      { key: 'notification_events', value: { transaction_created: true, record_confirmed: true, customer_created: false }, category: 'notifications', label: 'Notification Events', description: 'Which events trigger WhatsApp notifications', dataType: 'json' },
    ];
    for (const s of defaults) {
      const existing = await this.getSettingByKey(s.key);
      if (!existing) await db.insert(systemSettings).values(s);
    }

    // Ensure the 'admin' username always has the 'admin' role (guard against accidental downgrades)
    await db.update(staffUsers)
      .set({ role: 'admin' })
      .where(and(eq(staffUsers.username, 'admin'), ne(staffUsers.role, 'admin')));
  }

  // ─── Configuration Initialization ─────────────────────────────────────────
  // Seeds all platform configuration idempotently (safe to run every startup).
  // Covers: currencies, crypto networks, accounting period, providers (all categories),
  // chart of accounts (linked to providers), and exchange rates.
  async initializeConfiguration() {
    const today = new Date().toISOString().slice(0, 10);

    // ── 1. Currencies ──────────────────────────────────────────────────────
    const currencyDefs = [
      { code: 'USD',  name: 'US Dollar',         symbol: '$',    type: 'fiat',   isBaseCurrency: true,  decimalPlaces: 2 },
      { code: 'YER',  name: 'Yemeni Rial',        symbol: '﷼',   type: 'fiat',   isBaseCurrency: false, decimalPlaces: 0 },
      { code: 'SAR',  name: 'Saudi Riyal',         symbol: '﷼',   type: 'fiat',   isBaseCurrency: false, decimalPlaces: 2 },
      { code: 'KWD',  name: 'Kuwaiti Dinar',       symbol: 'KD',  type: 'fiat',   isBaseCurrency: false, decimalPlaces: 3 },
      { code: 'USDT', name: 'Tether USD',          symbol: '₮',   type: 'crypto', isBaseCurrency: false, decimalPlaces: 6 },
      { code: 'BNB',  name: 'BNB (BEP-20)',        symbol: 'BNB', type: 'crypto', isBaseCurrency: false, decimalPlaces: 6 },
    ];
    for (const c of currencyDefs) {
      const [ex] = await db.select({ code: currencies.code }).from(currencies).where(eq(currencies.code, c.code));
      if (!ex) await db.insert(currencies).values(c);
    }

    // ── 2. Crypto Networks (dedicated table) ───────────────────────────────
    const networkDefs = [
      { code: 'TRC20',    name: 'TRON Network (TRC-20)',    networkFeeUsd: '0.10', blockchain: 'TRON',     nativeToken: 'TRX', sortOrder: 1 },
      { code: 'BEP20',    name: 'BNB Smart Chain (BEP-20)', networkFeeUsd: '0.10', blockchain: 'BSC',      nativeToken: 'BNB', sortOrder: 2 },
      { code: 'TON',      name: 'TON Network',              networkFeeUsd: '0.05', blockchain: 'TON',      nativeToken: 'TON', sortOrder: 3 },
      { code: 'Aptos',    name: 'Aptos Network',            networkFeeUsd: '0.05', blockchain: 'Aptos',    nativeToken: 'APT', sortOrder: 4 },
      { code: 'Arbitrum', name: 'Arbitrum One',             networkFeeUsd: '0.20', blockchain: 'Arbitrum', nativeToken: 'ETH', sortOrder: 5 },
      { code: 'Bitcoin',  name: 'Bitcoin Network',          networkFeeUsd: '2.00', blockchain: 'Bitcoin',  nativeToken: 'BTC', sortOrder: 6 },
    ];
    for (const n of networkDefs) {
      await db.insert(cryptoNetworks).values({
        code: n.code, name: n.name, blockchain: n.blockchain,
        nativeToken: n.nativeToken, networkFeeUsd: n.networkFeeUsd, sortOrder: n.sortOrder,
      }).onConflictDoUpdate({ target: cryptoNetworks.code, set: {
        name: n.name, updatedAt: new Date(),
      }});
    }
    // Helper: get a network ID by code (for FK linking in providers)
    const getNetId = async (code: string) => {
      const [n] = await db.select({ id: cryptoNetworks.id }).from(cryptoNetworks).where(eq(cryptoNetworks.code, code));
      return n?.id ?? null;
    };
    const netTRC20    = await getNetId('TRC20');
    const netBEP20    = await getNetId('BEP20');
    const netTON      = await getNetId('TON');
    const netAptos    = await getNetId('Aptos');
    const netArbitrum = await getNetId('Arbitrum');
    const netBitcoin  = await getNetId('Bitcoin');

    // ── 3. Accounting Period (ensure 2026 is open) ─────────────────────────
    const openPeriod = await this.getOpenPeriod();
    if (!openPeriod) {
      const year = new Date().getFullYear();
      const month = new Date().getMonth();
      const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const startDate = `${year}-${String(month + 1).padStart(2,'0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const endDate = `${year}-${String(month + 1).padStart(2,'0')}-${lastDay}`;
      await db.insert(accountingPeriods).values({ name: `${monthNames[month]} ${year}`, startDate, endDate, status: 'open' });
    }

    // ── 4. Providers / Payment Gateways (idempotent upsert by code) ──────────
    // A provider = a service TYPE (payment gateway). Multiple CoA accounts
    // can share one provider (e.g. Trust Wallet BEP20 + MetaMask BEP20
    // both use the "USDT BEP20" provider).
    const upsertProvider = async (p: {
      code: string; name: string; providerCategory: string;
      fieldType: string; fieldName: string; currency: string;
      networkId?: string | null; networkCode?: string; networkFeeUsd?: string;
      depositFeeRate?: string; withdrawFeeRate?: string; description?: string;
    }): Promise<string> => {
      const [ex] = await db.select({ id: providers.id }).from(providers).where(eq(providers.code, p.code));
      if (ex) {
        // Always keep networkId in sync (may have been added after initial seed)
        if (p.networkId !== undefined) {
          await db.update(providers).set({ networkId: p.networkId, networkCode: p.networkCode ?? null })
            .where(eq(providers.id, ex.id));
        }
        return ex.id;
      }
      const [created] = await db.insert(providers).values({
        code: p.code, name: p.name, providerCategory: p.providerCategory,
        fieldType: p.fieldType, fieldName: p.fieldName, currency: p.currency,
        networkId: p.networkId ?? null, networkCode: p.networkCode,
        networkFeeUsd: p.networkFeeUsd ?? '0',
        depositFeeRate: p.depositFeeRate ?? '0', withdrawFeeRate: p.withdrawFeeRate ?? '0',
        description: p.description,
      }).returning({ id: providers.id });
      return created!.id;
    };

    // ── Crypto Wallet Provider (USDT BEP20 — for Trust Wallet & Auto-send) ──
    const pUsdtBEP20 = await upsertProvider({ code: 'usdt_bep20', name: 'USDT BEP20', providerCategory: 'crypto_wallet', fieldType: 'address', fieldName: 'USDT BEP20 Wallet Address', currency: 'USDT', networkId: netBEP20, networkCode: 'BEP20', networkFeeUsd: '0.10', depositFeeRate: '4', withdrawFeeRate: '2', description: 'USDT transfers on BNB Smart Chain (BEP20) — wallet address required' });

    // ── Crypto Platform Providers (one per exchange — field = platform ID) ────
    const pBinance = await upsertProvider({ code: 'binance', name: 'Binance', providerCategory: 'crypto_platform', fieldType: 'platform_id', fieldName: 'Binance UID', currency: 'USDT', networkId: netBEP20, networkCode: 'BEP20', networkFeeUsd: '0.10', depositFeeRate: '3', withdrawFeeRate: '1.5', description: 'Binance exchange — customer provides their Binance UID' });
    const pBybit   = await upsertProvider({ code: 'bybit',   name: 'Bybit',   providerCategory: 'crypto_platform', fieldType: 'platform_id', fieldName: 'Bybit UID',   currency: 'USDT', networkFeeUsd: '0.10', depositFeeRate: '3', withdrawFeeRate: '1.5', description: 'Bybit exchange' });
    const pKucoin  = await upsertProvider({ code: 'kucoin',  name: 'KuCoin',  providerCategory: 'crypto_platform', fieldType: 'platform_id', fieldName: 'KuCoin UID',  currency: 'USDT', networkFeeUsd: '0.10', depositFeeRate: '3', withdrawFeeRate: '1.5', description: 'KuCoin exchange' });
    const pOkx     = await upsertProvider({ code: 'okx',     name: 'OKX',     providerCategory: 'crypto_platform', fieldType: 'platform_id', fieldName: 'OKX UID',     currency: 'USDT', networkFeeUsd: '0.10', depositFeeRate: '3', withdrawFeeRate: '1.5', description: 'OKX exchange' });
    const pMexc    = await upsertProvider({ code: 'mexc',    name: 'MexC',    providerCategory: 'crypto_platform', fieldType: 'platform_id', fieldName: 'MexC UID',    currency: 'USDT', networkFeeUsd: '0.10', depositFeeRate: '3', withdrawFeeRate: '1.5', description: 'MexC exchange' });

    // ── Forex Broker Providers (field = broker client ID) ─────────────────────
    const pHeadway  = await upsertProvider({ code: 'headway',  name: 'HeadWay',  providerCategory: 'broker', fieldType: 'platform_id', fieldName: 'HeadWay Client ID',  currency: 'USDT', depositFeeRate: '0', withdrawFeeRate: '0', description: 'HeadWay Forex broker' });
    const pValetax  = await upsertProvider({ code: 'valetax',  name: 'Valetax',  providerCategory: 'broker', fieldType: 'platform_id', fieldName: 'Valetax Client ID',  currency: 'USDT', depositFeeRate: '0', withdrawFeeRate: '0', description: 'Valetax Forex broker' });
    const pOneroyal = await upsertProvider({ code: 'oneroyal', name: 'OneRoyal', providerCategory: 'broker', fieldType: 'platform_id', fieldName: 'OneRoyal Client ID', currency: 'USDT', depositFeeRate: '0', withdrawFeeRate: '0', description: 'OneRoyal Forex broker' });

    // ── Cash Bank Providers (one per currency) ─────────────────────────────────
    const pKuraimiYER  = await upsertProvider({ code: 'kuraimi_yer',        name: 'Kuraimi YER',              providerCategory: 'cash_bank',       fieldType: 'account_id', fieldName: 'Kuraimi Account Number (YER)', currency: 'YER', description: 'Al-Kuraimi Islamic Bank — YER accounts' });
    const pKuraimiSAR  = await upsertProvider({ code: 'kuraimi_sar',        name: 'Kuraimi SAR',              providerCategory: 'cash_bank',       fieldType: 'account_id', fieldName: 'Kuraimi Account Number (SAR)', currency: 'SAR', description: 'Al-Kuraimi Islamic Bank — SAR accounts' });
    const pKuraimiUSD  = await upsertProvider({ code: 'kuraimi_usd',        name: 'Kuraimi USD',              providerCategory: 'cash_bank',       fieldType: 'account_id', fieldName: 'Kuraimi Account Number (USD)', currency: 'USD', description: 'Al-Kuraimi Islamic Bank — USD accounts' });

    // ── Cash Wallet Providers (one per brand per currency) ───────────────────
    const pJaibYER    = await upsertProvider({ code: 'jaib_yer',      name: 'Jaib YER',      providerCategory: 'cash_wallet', fieldType: 'account_id', fieldName: 'Jaib Wallet ID (YER)',      currency: 'YER', description: 'Jaib digital wallet — YER' });
    const pJaibSAR    = await upsertProvider({ code: 'jaib_sar',      name: 'Jaib SAR',      providerCategory: 'cash_wallet', fieldType: 'account_id', fieldName: 'Jaib Wallet ID (SAR)',      currency: 'SAR', description: 'Jaib digital wallet — SAR' });
    const pJaibUSD    = await upsertProvider({ code: 'jaib_usd',      name: 'Jaib USD',      providerCategory: 'cash_wallet', fieldType: 'account_id', fieldName: 'Jaib Wallet ID (USD)',      currency: 'USD', description: 'Jaib digital wallet — USD' });
    const pJawaliYER  = await upsertProvider({ code: 'jawali_yer',    name: 'Jawali YER',    providerCategory: 'cash_wallet', fieldType: 'account_id', fieldName: 'Jawali Wallet ID (YER)',    currency: 'YER', description: 'Jawali mobile money — YER' });
    const pJawaliSAR  = await upsertProvider({ code: 'jawali_sar',    name: 'Jawali SAR',    providerCategory: 'cash_wallet', fieldType: 'account_id', fieldName: 'Jawali Wallet ID (SAR)',    currency: 'SAR', description: 'Jawali mobile money — SAR' });
    const pJawaliUSD  = await upsertProvider({ code: 'jawali_usd',    name: 'Jawali USD',    providerCategory: 'cash_wallet', fieldType: 'account_id', fieldName: 'Jawali Wallet ID (USD)',    currency: 'USD', description: 'Jawali mobile money — USD' });
    const pCashYER    = await upsertProvider({ code: 'cash_yer',      name: 'Cash YER',      providerCategory: 'cash_wallet', fieldType: 'account_id', fieldName: 'Cash Wallet ID (YER)',      currency: 'YER', description: 'Cash digital wallet — YER' });
    const pCashSAR    = await upsertProvider({ code: 'cash_sar',      name: 'Cash SAR',      providerCategory: 'cash_wallet', fieldType: 'account_id', fieldName: 'Cash Wallet ID (SAR)',      currency: 'SAR', description: 'Cash digital wallet — SAR' });
    const pCashUSD    = await upsertProvider({ code: 'cash_usd',      name: 'Cash USD',      providerCategory: 'cash_wallet', fieldType: 'account_id', fieldName: 'Cash Wallet ID (USD)',      currency: 'USD', description: 'Cash digital wallet — USD' });
    const pOnecashYER = await upsertProvider({ code: 'onecash_yer',   name: 'OneCash YER',   providerCategory: 'cash_wallet', fieldType: 'account_id', fieldName: 'OneCash Wallet ID (YER)',   currency: 'YER', description: 'OneCash digital wallet — YER' });
    const pOnecashSAR = await upsertProvider({ code: 'onecash_sar',   name: 'OneCash SAR',   providerCategory: 'cash_wallet', fieldType: 'account_id', fieldName: 'OneCash Wallet ID (SAR)',   currency: 'SAR', description: 'OneCash digital wallet — SAR' });
    const pOnecashUSD = await upsertProvider({ code: 'onecash_usd',   name: 'OneCash USD',   providerCategory: 'cash_wallet', fieldType: 'account_id', fieldName: 'OneCash Wallet ID (USD)',   currency: 'USD', description: 'OneCash digital wallet — USD' });


    // ── Cash Remittance Providers (one per currency) ─────────────────────────
    const pRemitYER = await upsertProvider({ code: 'remittance_yer', name: 'Remittance YER', providerCategory: 'cash_remittance', fieldType: 'name_phone', fieldName: 'Recipient Name & Phone', currency: 'YER', description: 'Cash remittance agents — YER' });
    const pRemitSAR = await upsertProvider({ code: 'remittance_sar', name: 'Remittance SAR', providerCategory: 'cash_remittance', fieldType: 'name_phone', fieldName: 'Recipient Name & Phone', currency: 'SAR', description: 'Cash remittance agents — SAR' });
    const pRemitUSD = await upsertProvider({ code: 'remittance_usd', name: 'Remittance USD', providerCategory: 'cash_remittance', fieldType: 'name_phone', fieldName: 'Recipient Name & Phone', currency: 'USD', description: 'Cash remittance agents — USD' });


    // ── 5. Chart of Accounts (idempotent upsert by code) ───────────────────
    const upsertAccount = async (a: {
      code: string; name: string; type: string; subtype?: string;
      parentCode?: string; currency?: string; description?: string;
      isSystemAcc?: boolean; providerId?: string;
      buyRate?: string; sellRate?: string;
    }) => {
      const [ex] = await db.select({ id: chartOfAccounts.id }).from(chartOfAccounts)
        .where(eq(chartOfAccounts.code, a.code));
      if (ex) {
        await db.update(chartOfAccounts).set({
          name: a.name, type: a.type as any, subtype: a.subtype,
          parentCode: a.parentCode ?? null, currency: a.currency ?? 'USD',
          description: a.description ?? null, isSystemAcc: a.isSystemAcc ?? false,
          providerId: a.providerId ?? null,
          buyRate: a.buyRate ?? null, sellRate: a.sellRate ?? null,
          isActive: true,
        }).where(eq(chartOfAccounts.id, ex.id));
        return;
      }
      await db.insert(chartOfAccounts).values({
        code: a.code, name: a.name, type: a.type as any, subtype: a.subtype,
        parentCode: a.parentCode, currency: a.currency ?? 'USD', description: a.description,
        isSystemAcc: a.isSystemAcc ?? false, providerId: a.providerId,
        buyRate: a.buyRate, sellRate: a.sellRate,
      });
    };

    // Delete old CoA codes that have been fully superseded by the new numbering.
    // ONLY codes that are NOT reused in the new chart belong here.
    // If they have journal history, we deactivate instead of deleting.
    const oldCoaCodes = [
      '1101','1102','1103','1104','1105',
      '1114','1115',
      '1201','1202','1203','1204',
      '1530','1531','1532','1533','1534','1535',
    ];
    for (const oc of oldCoaCodes) {
      const [hasJournal] = await db.select({ count: sql<number>`count(*)` })
        .from(journalEntryLines).where(eq(journalEntryLines.accountCode, oc));
      if (hasJournal && Number(hasJournal.count) > 0) {
        await db.update(chartOfAccounts).set({ isActive: false }).where(eq(chartOfAccounts.code, oc));
      } else {
        await db.delete(chartOfAccounts).where(eq(chartOfAccounts.code, oc));
      }
    }

    // Also delete old providers that are no longer needed
    const oldProviderCodes = [
      'flosak_yer', 'bin_jaber', 'hazmi', 'kuraimi_kuwait_kwd', 'cac_bank_usd',
      'trust_wallet_usdt_bep20','metamask_usdt_bep20',
      'trust_wallet_usdt_trc20','metamask_usdt_trc20',
      'trust_wallet_bnb_bep20',
      'usdt_trc20', 'bnb_bep20',
      'binance_usdt_bep20', 'binance_usdt_trc20',
      'bybit_usdt_trc20', 'kucoin_usdt_trc20', 'mexc_usdt_trc20', 'okx_usdt_trc20',
    ];
    for (const opCode of oldProviderCodes) {
      const [prov] = await db.select({ id: providers.id }).from(providers).where(eq(providers.code, opCode));
      if (!prov) continue;
      const [coaRefs] = await db.select({ count: sql<number>`count(*)` })
        .from(chartOfAccounts).where(eq(chartOfAccounts.providerId, prov.id));
      const [recRefs] = await db.select({ count: sql<number>`count(*)` })
        .from(records).where(eq(records.providerId, prov.id));
      const [walRefs] = await db.select({ count: sql<number>`count(*)` })
        .from(customerWallets).where(eq(customerWallets.providerId, prov.id));
      const totalRefs = Number(coaRefs?.count ?? 0) + Number(recRefs?.count ?? 0) + Number(walRefs?.count ?? 0);
      if (totalRefs > 0) {
        await db.update(providers).set({ isActive: false }).where(eq(providers.id, prov.id));
      } else {
        await db.delete(providers).where(eq(providers.id, prov.id));
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ASSETS  (1000–1999)
    // ══════════════════════════════════════════════════════════════════════════
    await upsertAccount({ code: '1000', name: 'Current Assets',             type: 'asset',   subtype: 'parent',       description: 'All current asset accounts' });
    await upsertAccount({ code: '1001', name: 'Cash on Hand',               type: 'asset',   subtype: 'cash',         parentCode: '1000', currency: 'USD', isSystemAcc: true });

    // ── 1100  Cash Bank Accounts (Kuraimi) ───────────────────────────────────
    await upsertAccount({ code: '1100', name: 'Cash Bank Accounts',         type: 'asset',   subtype: 'parent',       parentCode: '1000', currency: 'USD' });

    // Kuraimi YER  (1110–1119)
    await upsertAccount({ code: '1110', name: 'Kuraimi Bassem YER',         type: 'asset',   subtype: 'bank', parentCode: '1100', currency: 'YER', providerId: pKuraimiYER,  buyRate: '535',  sellRate: '533' });
    await upsertAccount({ code: '1111', name: 'Kuraimi Aqeed YER',          type: 'asset',   subtype: 'bank', parentCode: '1100', currency: 'YER', providerId: pKuraimiYER,  buyRate: '535',  sellRate: '533' });
    await upsertAccount({ code: '1112', name: 'Kuraimi Mohammed YER',       type: 'asset',   subtype: 'bank', parentCode: '1100', currency: 'YER', providerId: pKuraimiYER,  buyRate: '535',  sellRate: '533' });
    await upsertAccount({ code: '1113', name: 'Kuraimi Wael YER',           type: 'asset',   subtype: 'bank', parentCode: '1100', currency: 'YER', providerId: pKuraimiYER,  buyRate: '535',  sellRate: '533' });

    // Kuraimi SAR  (1120–1129)
    await upsertAccount({ code: '1120', name: 'Kuraimi Bassem SAR',         type: 'asset',   subtype: 'bank', parentCode: '1100', currency: 'SAR', providerId: pKuraimiSAR,  buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1121', name: 'Kuraimi Aqeed SAR',          type: 'asset',   subtype: 'bank', parentCode: '1100', currency: 'SAR', providerId: pKuraimiSAR,  buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1122', name: 'Kuraimi Mohammed SAR',       type: 'asset',   subtype: 'bank', parentCode: '1100', currency: 'SAR', providerId: pKuraimiSAR,  buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1123', name: 'Kuraimi Wael SAR',           type: 'asset',   subtype: 'bank', parentCode: '1100', currency: 'SAR', providerId: pKuraimiSAR,  buyRate: '3.74', sellRate: '3.76' });

    // Kuraimi USD  (1130–1139)
    await upsertAccount({ code: '1130', name: 'Kuraimi Bassem USD',         type: 'asset',   subtype: 'bank', parentCode: '1100', currency: 'USD', providerId: pKuraimiUSD,  buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1131', name: 'Kuraimi Aqeed USD',          type: 'asset',   subtype: 'bank', parentCode: '1100', currency: 'USD', providerId: pKuraimiUSD,  buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1132', name: 'Kuraimi Mohammed USD',       type: 'asset',   subtype: 'bank', parentCode: '1100', currency: 'USD', providerId: pKuraimiUSD,  buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1133', name: 'Kuraimi Wael USD',           type: 'asset',   subtype: 'bank', parentCode: '1100', currency: 'USD', providerId: pKuraimiUSD,  buyRate: '1', sellRate: '1' });

    // ── 1200  Cash Wallet Accounts ───────────────────────────────────────────
    await upsertAccount({ code: '1200', name: 'Cash Wallet Accounts',       type: 'asset',   subtype: 'parent',       parentCode: '1000', currency: 'YER' });

    // Jaib YER (1210–1213)
    await upsertAccount({ code: '1210', name: 'Jaib Bassem YER',            type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'YER', providerId: pJaibYER, buyRate: '534', sellRate: '532' });
    await upsertAccount({ code: '1211', name: 'Jaib Commercial YER',        type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'YER', providerId: pJaibYER, buyRate: '534', sellRate: '532' });
    await upsertAccount({ code: '1212', name: 'Jaib Aqeed YER',             type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'YER', providerId: pJaibYER, buyRate: '534', sellRate: '532' });
    await upsertAccount({ code: '1213', name: 'Jaib Wael YER',              type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'YER', providerId: pJaibYER, buyRate: '534', sellRate: '532' });
    // Jaib SAR (1214–1217)
    await upsertAccount({ code: '1214', name: 'Jaib Bassem SAR',            type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'SAR', providerId: pJaibSAR, buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1215', name: 'Jaib Commercial SAR',        type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'SAR', providerId: pJaibSAR, buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1216', name: 'Jaib Aqeed SAR',             type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'SAR', providerId: pJaibSAR, buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1217', name: 'Jaib Wael SAR',              type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'SAR', providerId: pJaibSAR, buyRate: '3.74', sellRate: '3.76' });
    // Jaib USD (1218–1221)
    await upsertAccount({ code: '1218', name: 'Jaib Bassem USD',            type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'USD', providerId: pJaibUSD, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1219', name: 'Jaib Commercial USD',        type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'USD', providerId: pJaibUSD, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1220', name: 'Jaib Aqeed USD',             type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'USD', providerId: pJaibUSD, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1221', name: 'Jaib Wael USD',              type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'USD', providerId: pJaibUSD, buyRate: '1', sellRate: '1' });

    // Jawali YER (1230–1232)
    await upsertAccount({ code: '1230', name: 'Jawali Bassem YER',          type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'YER', providerId: pJawaliYER, buyRate: '534', sellRate: '532' });
    await upsertAccount({ code: '1231', name: 'Jawali Aqeed YER',           type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'YER', providerId: pJawaliYER, buyRate: '534', sellRate: '532' });
    await upsertAccount({ code: '1232', name: 'Jawali Wael YER',            type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'YER', providerId: pJawaliYER, buyRate: '534', sellRate: '532' });
    // Jawali SAR (1233–1235)
    await upsertAccount({ code: '1233', name: 'Jawali Bassem SAR',          type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'SAR', providerId: pJawaliSAR, buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1234', name: 'Jawali Aqeed SAR',           type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'SAR', providerId: pJawaliSAR, buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1235', name: 'Jawali Wael SAR',            type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'SAR', providerId: pJawaliSAR, buyRate: '3.74', sellRate: '3.76' });
    // Jawali USD (1236–1238)
    await upsertAccount({ code: '1236', name: 'Jawali Bassem USD',          type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'USD', providerId: pJawaliUSD, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1237', name: 'Jawali Aqeed USD',           type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'USD', providerId: pJawaliUSD, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1238', name: 'Jawali Wael USD',            type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'USD', providerId: pJawaliUSD, buyRate: '1', sellRate: '1' });

    // Cash (wallet) YER (1250–1252)
    await upsertAccount({ code: '1250', name: 'Cash Bassem YER',            type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'YER', providerId: pCashYER, buyRate: '534', sellRate: '532' });
    await upsertAccount({ code: '1251', name: 'Cash Aqeed YER',             type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'YER', providerId: pCashYER, buyRate: '534', sellRate: '532' });
    await upsertAccount({ code: '1252', name: 'Cash Wael YER',              type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'YER', providerId: pCashYER, buyRate: '534', sellRate: '532' });
    // Cash SAR (1253–1255)
    await upsertAccount({ code: '1253', name: 'Cash Bassem SAR',            type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'SAR', providerId: pCashSAR, buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1254', name: 'Cash Aqeed SAR',             type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'SAR', providerId: pCashSAR, buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1255', name: 'Cash Wael SAR',              type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'SAR', providerId: pCashSAR, buyRate: '3.74', sellRate: '3.76' });
    // Cash USD (1256–1258)
    await upsertAccount({ code: '1256', name: 'Cash Bassem USD',            type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'USD', providerId: pCashUSD, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1257', name: 'Cash Aqeed USD',             type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'USD', providerId: pCashUSD, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1258', name: 'Cash Wael USD',              type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'USD', providerId: pCashUSD, buyRate: '1', sellRate: '1' });

    // OneCash YER (1270–1272)
    await upsertAccount({ code: '1270', name: 'OneCash Bassem YER',         type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'YER', providerId: pOnecashYER, buyRate: '534', sellRate: '532' });
    await upsertAccount({ code: '1271', name: 'OneCash Aqeed YER',          type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'YER', providerId: pOnecashYER, buyRate: '534', sellRate: '532' });
    await upsertAccount({ code: '1272', name: 'OneCash Wael YER',           type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'YER', providerId: pOnecashYER, buyRate: '534', sellRate: '532' });
    // OneCash SAR (1273–1275)
    await upsertAccount({ code: '1273', name: 'OneCash Bassem SAR',         type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'SAR', providerId: pOnecashSAR, buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1274', name: 'OneCash Aqeed SAR',          type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'SAR', providerId: pOnecashSAR, buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1275', name: 'OneCash Wael SAR',           type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'SAR', providerId: pOnecashSAR, buyRate: '3.74', sellRate: '3.76' });
    // OneCash USD (1276–1278)
    await upsertAccount({ code: '1276', name: 'OneCash Bassem USD',         type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'USD', providerId: pOnecashUSD, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1277', name: 'OneCash Aqeed USD',          type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'USD', providerId: pOnecashUSD, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1278', name: 'OneCash Wael USD',           type: 'asset',   subtype: 'cash_wallet', parentCode: '1200', currency: 'USD', providerId: pOnecashUSD, buyRate: '1', sellRate: '1' });

    // ── 1400  Cash Remittance Accounts ───────────────────────────────────────
    await upsertAccount({ code: '1400', name: 'Cash Remittance Accounts',   type: 'asset',   subtype: 'parent',       parentCode: '1000', currency: 'USD' });

    // Remittance YER (1410–1419)
    await upsertAccount({ code: '1410', name: 'BinJaber Bassem YER',        type: 'asset',   subtype: 'cash_remittance', parentCode: '1400', currency: 'YER', providerId: pRemitYER, buyRate: '535', sellRate: '533' });
    await upsertAccount({ code: '1411', name: 'Hazmi Wael YER',             type: 'asset',   subtype: 'cash_remittance', parentCode: '1400', currency: 'YER', providerId: pRemitYER, buyRate: '535', sellRate: '533' });
    await upsertAccount({ code: '1412', name: 'Taiz Bassem YER',            type: 'asset',   subtype: 'cash_remittance', parentCode: '1400', currency: 'YER', providerId: pRemitYER, buyRate: '535', sellRate: '533' });
    await upsertAccount({ code: '1413', name: 'Taiz Ammar YER',             type: 'asset',   subtype: 'cash_remittance', parentCode: '1400', currency: 'YER', providerId: pRemitYER, buyRate: '535', sellRate: '533' });
    // Remittance SAR (1420–1429)
    await upsertAccount({ code: '1420', name: 'BinJaber Bassem SAR',        type: 'asset',   subtype: 'cash_remittance', parentCode: '1400', currency: 'SAR', providerId: pRemitSAR, buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1421', name: 'Hazmi Wael SAR',             type: 'asset',   subtype: 'cash_remittance', parentCode: '1400', currency: 'SAR', providerId: pRemitSAR, buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1422', name: 'Taiz Bassem SAR',            type: 'asset',   subtype: 'cash_remittance', parentCode: '1400', currency: 'SAR', providerId: pRemitSAR, buyRate: '3.74', sellRate: '3.76' });
    await upsertAccount({ code: '1423', name: 'Taiz Ammar SAR',             type: 'asset',   subtype: 'cash_remittance', parentCode: '1400', currency: 'SAR', providerId: pRemitSAR, buyRate: '3.74', sellRate: '3.76' });
    // Remittance USD (1430–1439)
    await upsertAccount({ code: '1430', name: 'BinJaber Bassem USD',        type: 'asset',   subtype: 'cash_remittance', parentCode: '1400', currency: 'USD', providerId: pRemitUSD, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1431', name: 'Hazmi Wael USD',             type: 'asset',   subtype: 'cash_remittance', parentCode: '1400', currency: 'USD', providerId: pRemitUSD, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1432', name: 'Taiz Bassem USD',            type: 'asset',   subtype: 'cash_remittance', parentCode: '1400', currency: 'USD', providerId: pRemitUSD, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1433', name: 'Taiz Ammar USD',             type: 'asset',   subtype: 'cash_remittance', parentCode: '1400', currency: 'USD', providerId: pRemitUSD, buyRate: '1', sellRate: '1' });

    // ── 1500  Crypto Asset Accounts ──────────────────────────────────────────
    await upsertAccount({ code: '1500', name: 'Crypto Asset Accounts',      type: 'asset',   subtype: 'parent',       parentCode: '1000', currency: 'USDT' });
    // Crypto Platforms (exchange balances)
    await upsertAccount({ code: '1510', name: 'Binance Ammar',              type: 'asset',   subtype: 'crypto_platform', parentCode: '1500', currency: 'USDT', providerId: pBinance, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1511', name: 'Binance Mohammed',           type: 'asset',   subtype: 'crypto_platform', parentCode: '1500', currency: 'USDT', providerId: pBinance, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1512', name: 'Binance Wael',               type: 'asset',   subtype: 'crypto_platform', parentCode: '1500', currency: 'USDT', providerId: pBinance, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1513', name: 'Bybit',                      type: 'asset',   subtype: 'crypto_platform', parentCode: '1500', currency: 'USDT', providerId: pBybit,   buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1514', name: 'KuCoin',                     type: 'asset',   subtype: 'crypto_platform', parentCode: '1500', currency: 'USDT', providerId: pKucoin,  buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1515', name: 'OKX',                        type: 'asset',   subtype: 'crypto_platform', parentCode: '1500', currency: 'USDT', providerId: pOkx,     buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1516', name: 'MexC',                       type: 'asset',   subtype: 'crypto_platform', parentCode: '1500', currency: 'USDT', providerId: pMexc,    buyRate: '1', sellRate: '1' });
    // Crypto Wallets (USDT BEP20)
    await upsertAccount({ code: '1520', name: 'Trust Wallet USDT BEP20',    type: 'asset',   subtype: 'crypto_wallet',   parentCode: '1500', currency: 'USDT', providerId: pUsdtBEP20, buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1521', name: 'Auto Send Wallet USDT BEP20',type: 'asset',   subtype: 'crypto_wallet',   parentCode: '1500', currency: 'USDT', providerId: pUsdtBEP20, buyRate: '1', sellRate: '1', isSystemAcc: true, description: 'Wallet linked to crypto-send feature for on-chain USDT transfers' });

    // ── 1600  Brokers Asset Accounts ───────────────────────────────────────────
    await upsertAccount({ code: '1600', name: 'Brokers Asset Accounts',     type: 'asset',   subtype: 'parent',       parentCode: '1000', currency: 'USDT' });
    await upsertAccount({ code: '1610', name: 'HeadWay',                    type: 'asset',   subtype: 'broker',          parentCode: '1600', currency: 'USDT', providerId: pHeadway,  buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1611', name: 'Valetax',                    type: 'asset',   subtype: 'broker',          parentCode: '1600', currency: 'USDT', providerId: pValetax,  buyRate: '1', sellRate: '1' });
    await upsertAccount({ code: '1612', name: 'OneRoyal',                   type: 'asset',   subtype: 'broker',          parentCode: '1600', currency: 'USDT', providerId: pOneroyal, buyRate: '1', sellRate: '1' });

    // ── Liabilities ──
    await upsertAccount({ code: '2000', name: 'Current Liabilities',              type: 'liability', subtype: 'parent', description: 'All current liability accounts', isSystemAcc: false });
    await upsertAccount({ code: '2101', name: 'Customer Credits - Unmatched',     type: 'liability', subtype: 'suspense',  parentCode: '2000', currency: 'USD', isSystemAcc: true,  description: 'Unmatched/suspense inflows awaiting customer identification' });
    await upsertAccount({ code: '2102', name: 'Customer Credits - Identified',    type: 'liability', subtype: 'liability', parentCode: '2000', currency: 'USD', isSystemAcc: true,  description: 'Identified customer credit balances (matched records)' });
    await upsertAccount({ code: '2201', name: 'Customer Receivables',             type: 'asset',     subtype: 'receivable',parentCode: '1000', currency: 'USD', isSystemAcc: true,  description: 'Amounts owed by customers (underpayments, receivables)' });

    // ── Equity ──
    await upsertAccount({ code: '3000', name: 'Equity',                           type: 'equity',    subtype: 'parent',    description: 'Owner equity and retained earnings' });
    await upsertAccount({ code: '3001', name: 'Owner Capital',                    type: 'equity',    subtype: 'capital',   parentCode: '3000', currency: 'USD' });
    await upsertAccount({ code: '3002', name: 'Retained Earnings',                type: 'equity',    subtype: 'retained',  parentCode: '3000', currency: 'USD' });

    // ── Revenue ──
    await upsertAccount({ code: '4000', name: 'Operating Revenue',                type: 'revenue',   subtype: 'parent',    description: 'All operating revenue accounts', isSystemAcc: false });
    await upsertAccount({ code: '4101', name: 'Service Fee Income',               type: 'revenue',   subtype: 'fee',       parentCode: '4000', currency: 'USD', isSystemAcc: true, description: 'Revenue from service fees charged to customers on deposits/withdrawals' });
    await upsertAccount({ code: '4201', name: 'FX Spread Income',                 type: 'revenue',   subtype: 'spread',    parentCode: '4000', currency: 'USD', isSystemAcc: true, description: 'Revenue from spread between system rate and bank/actual rate' });
    await upsertAccount({ code: '4301', name: 'Network Fee Recovery',             type: 'revenue',   subtype: 'fee',       parentCode: '4000', currency: 'USD', isSystemAcc: true, description: 'Network/gas fees collected from customers and passed through' });

    // ── Expenses ──
    await upsertAccount({ code: '5000', name: 'Operating Expenses',               type: 'expense',   subtype: 'parent',    description: 'All operating expense accounts', isSystemAcc: false });
    await upsertAccount({ code: '5101', name: 'Network / Gas Expense',            type: 'expense',   subtype: 'network',   parentCode: '5000', currency: 'USD', isSystemAcc: true, description: 'Blockchain gas and network fees paid to process transactions' });
    await upsertAccount({ code: '5201', name: 'Supplier Exchange Expense',        type: 'expense',   subtype: 'supplier',  parentCode: '5000', currency: 'USD', isSystemAcc: true, description: 'Fees paid to exchange suppliers and liquidity providers' });

    // ── 6. Exchange Rates (seed if missing for today) ──────────────────────
    const ratesDefs = [
      { fromCurrency: 'YER', toCurrency: 'USD', rate: '536', buyRate: '537', sellRate: '530' },  // system rates
      { fromCurrency: 'SAR', toCurrency: 'USD', rate: '3.75', buyRate: '3.77', sellRate: '3.73' },
      { fromCurrency: 'KWD', toCurrency: 'USD', rate: '3.25', buyRate: '3.27', sellRate: '3.23' },
      { fromCurrency: 'USDT', toCurrency: 'USD', rate: '1', buyRate: '1', sellRate: '1' },
      { fromCurrency: 'BNB', toCurrency: 'USD', rate: '350', buyRate: '352', sellRate: '348' },
    ];
    for (const r of ratesDefs) {
      const [existing] = await db.select({ id: exchangeRates.id }).from(exchangeRates)
        .where(and(eq(exchangeRates.fromCurrency, r.fromCurrency), eq(exchangeRates.toCurrency, r.toCurrency), eq(exchangeRates.effectiveDate, today)));
      if (!existing) {
        await db.insert(exchangeRates).values({ ...r, effectiveDate: today, source: 'seed' });
      }
    }
  }

  // ─── Records ───────────────────────────────────────────────────────────────
  async getAllRecords(filters?: { type?: string; direction?: string; stage?: string; customerId?: string; transactionId?: string; available?: boolean; source?: string; endpointName?: string; limit?: number }) {
    let query = db.select().from(records).$dynamic();
    const conditions = [];
    if (filters?.type) conditions.push(eq(records.type, filters.type as any));
    if (filters?.direction) conditions.push(eq(records.direction, filters.direction as any));
    if (filters?.stage) conditions.push(eq(records.processingStage, filters.stage as any));
    if (filters?.customerId) conditions.push(eq(records.customerId, filters.customerId));
    if (filters?.transactionId) conditions.push(eq(records.transactionId, filters.transactionId));
    if (filters?.available) conditions.push(ne(records.processingStage, 'used' as any));
    if (filters?.source) conditions.push(eq(records.source, filters.source as any));
    if (filters?.endpointName) conditions.push(eq(records.endpointName, filters.endpointName));
    if (conditions.length > 0) query = query.where(and(...conditions));
    query = query.orderBy(desc(records.createdAt));
    if (filters?.limit) query = (query as any).limit(filters.limit);
    return query;
  }
  async getRecord(id: string) {
    const [record] = await db.select().from(records).where(eq(records.id, id));
    return record;
  }
  async createRecord(record: InsertRecord, createdBy?: string) {
    const year = new Date().getFullYear();
    const [last] = await db.select({ n: records.recordNumber }).from(records)
      .where(sql`${records.recordNumber} LIKE ${'REC-' + year + '-%'}`)
      .orderBy(sql`${records.recordNumber} DESC`).limit(1);
    const lastNum = last ? parseInt(last.n.split('-')[2] ?? '0', 10) : 0;
    const num = lastNum + 1;
    const recordNumber = `REC-${year}-${String(num).padStart(6, '0')}`;
    const [created] = await db.insert(records).values({
      ...record, recordNumber, createdBy,
      logEvents: [{ action: 'created', timestamp: new Date().toISOString(), by: createdBy }],
    }).returning();
    return created;
  }
  async updateRecord(id: string, updates: Partial<Record>) {
    // S-14 Record Lock Guard — immutability enforcement
    const [existing] = await db.select().from(records).where(eq(records.id, id));
    if (existing) enforceRecordLock(existing, updates);

    const [updated] = await db.update(records)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(records.id, id)).returning();
    return updated;
  }

  // ─── Transactions ──────────────────────────────────────────────────────────
  async getAllTransactions(filters?: { type?: string; customerId?: string }) {
    let query = db.select().from(transactions).$dynamic();
    const conditions = [];
    if (filters?.type) conditions.push(eq(transactions.type, filters.type as any));
    if (filters?.customerId) conditions.push(eq(transactions.customerId, filters.customerId));
    if (conditions.length > 0) query = query.where(and(...conditions));
    return query.orderBy(desc(transactions.createdAt));
  }
  async getTransaction(id: string) {
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, id));
    return tx;
  }
  async createTransaction(transaction: InsertTransaction, createdBy?: string) {
    const year = new Date().getFullYear();
    const [lastTx] = await db.select({ n: transactions.transactionNumber }).from(transactions)
      .where(sql`${transactions.transactionNumber} LIKE ${'TX-' + year + '-%'}`)
      .orderBy(sql`${transactions.transactionNumber} DESC`).limit(1);
    const lastTxNum = lastTx ? parseInt(lastTx.n.split('-')[2] ?? '0', 10) : 0;
    const num = lastTxNum + 1;
    const transactionNumber = `TX-${year}-${String(num).padStart(6, '0')}`;
    const [created] = await db.insert(transactions).values({
      ...transaction, transactionNumber, createdBy,
      logs: [{ action: 'created', timestamp: new Date().toISOString(), by: createdBy }],
    }).returning();

    // Mark all linked records as "used"
    const recordIds = transaction.relatedRecordIds ?? [];
    if (recordIds.length > 0) {
      await db.update(records)
        .set({
          processingStage: 'used' as any,
          transactionId: created.id,
          updatedAt: new Date(),
        } as any)
        .where(inArray(records.id, recordIds));
    }

    // Update customer transaction stats
    if (created.customerId) {
      const totalInUsd = parseFloat(created.totalInUsd ?? "0");
      const totalOutUsd = parseFloat(created.totalOutUsd ?? "0");
      await db.update(customers)
        .set({
          totalTransactions: sql`${customers.totalTransactions} + 1`,
          totalVolumeUsd: sql`${customers.totalVolumeUsd} + ${(totalInUsd + totalOutUsd).toFixed(4)}`,
          updatedAt: new Date(),
        } as any)
        .where(eq(customers.id, created.customerId));
    }

    // Auto-generate double-entry journal entry (IFRS/GAAP compliant)
    // Non-blocking: if JE creation fails (e.g. no open period), transaction still persists
    if (createdBy) {
      this.autoGenerateJournalEntry(created.id, createdBy).catch(() => { /* period may not be open */ });
    }

    return created;
  }
  async updateTransaction(id: string, updates: Partial<Transaction>) {
    const [updated] = await db.update(transactions)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(transactions.id, id)).returning();
    return updated;
  }

  // ─── Audit Logs ────────────────────────────────────────────────────────────
  async createAuditLog(log: Omit<AuditLog, 'id' | 'createdAt'>) {
    // Hash chaining: sha256(prevHash + payload) for tamper-evident trail
    const [latest] = await db.select({ entryHash: auditLogs.entryHash })
      .from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(1);
    const prevHash = latest?.entryHash ?? "GENESIS_HASH_FOMS_2026";
    const payload  = JSON.stringify({ ...log, timestamp: Date.now() });
    const entryHash = crypto.createHash("sha256").update(prevHash + payload).digest("hex");

    const [created] = await db.insert(auditLogs).values({ ...log, entryHash } as any).returning();
    return created;
  }
  async getAuditLogs(filters?: { entityType?: string; entityId?: string; limit?: number }) {
    let query = db.select().from(auditLogs).$dynamic();
    const conditions = [];
    if (filters?.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType as any));
    if (filters?.entityId) conditions.push(eq(auditLogs.entityId, filters.entityId));
    if (conditions.length > 0) query = query.where(and(...conditions));
    return query.orderBy(desc(auditLogs.createdAt)).limit(filters?.limit ?? 200);
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  async getDashboardStats() {
    const [totalCustomersResult]  = await db.select({ count: sql<number>`count(*)` }).from(customers);
    const [activeCustomersResult] = await db.select({ count: sql<number>`count(*)` }).from(customers).where(eq(customers.customerStatus, 'active'));
    const [blacklistedResult]     = await db.select({ count: sql<number>`count(*)` }).from(customers).where(eq(customers.isBlacklisted, true));
    const [highRiskResult]        = await db.select({ count: sql<number>`count(*)` }).from(customers).where(eq(customers.riskLevel, 'high'));

    // All records — source of truth for everything
    const allRecs = await db.select().from(records);

    const stageMap: { [stage: string]: number } = {};
    let totalVolumeUsd   = 0;
    let cashInflowCount  = 0;
    let cashOutflowCount = 0;
    let cryptoInflowCount  = 0;
    let cryptoOutflowCount = 0;

    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    let todayRevenue = 0;

    for (const r of allRecs) {
      stageMap[r.processingStage] = (stageMap[r.processingStage] ?? 0) + 1;
      const usd = parseFloat(r.usdEquivalent ?? '0') || 0;
      totalVolumeUsd += usd;

      if (r.type === 'cash'   && r.direction === 'inflow')  cashInflowCount++;
      if (r.type === 'cash'   && r.direction === 'outflow') cashOutflowCount++;
      if (r.type === 'crypto' && r.direction === 'inflow')  cryptoInflowCount++;
      if (r.type === 'crypto' && r.direction === 'outflow') cryptoOutflowCount++;

      // Today's revenue: confirmed records' fee (usdEquivalent * serviceFeeRate / 100)
      if (r.processingStage === 'confirmed' && new Date(r.createdAt) >= todayStart) {
        const rate = parseFloat(r.serviceFeeRate ?? '0') || 0;
        todayRevenue += usd * rate / 100;
      }
    }

    const pendingCount = allRecs.filter(r =>
      r.processingStage === 'recorded' || r.processingStage === 'manual_matched' || r.processingStage === 'auto_matched'
    ).length;

    const recentActivity = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(10);
    return {
      totalCustomers:    Number(totalCustomersResult?.count  ?? 0),
      activeCustomers:   Number(activeCustomersResult?.count ?? 0),
      totalRecords:      allRecs.length,
      pendingRecords:    pendingCount,
      totalVolumeUsd,
      todayRevenue,
      blacklistedCount:  Number(blacklistedResult?.count ?? 0),
      highRiskCount:     Number(highRiskResult?.count   ?? 0),
      cashInflowCount,
      cashOutflowCount,
      cryptoInflowCount,
      cryptoOutflowCount,
      recordsByStage:    stageMap,
      recentActivity,
    };
  }

  // ─── Reports ───────────────────────────────────────────────────────────────
  async getReportsData(params?: { days?: number }) {
    const days = params?.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // All records in date range — records are the source of truth
    const allRecs = await db.select().from(records).where(
      sql`${records.createdAt} >= ${since.toISOString()}`
    );

    // Build volumeByDay (broken down by type + direction) and revenueByDay
    type VolumeDay = { cashInflowUsd: number; cashOutflowUsd: number; cryptoInflowUsd: number; cryptoOutflowUsd: number };
    const volumeMap:  { [day: string]: VolumeDay }              = {};
    const revenueMap: { [day: string]: { fee: number; spread: number } } = {};

    for (const r of allRecs) {
      const day = new Date(r.createdAt).toISOString().slice(0, 10);
      if (!volumeMap[day])  volumeMap[day]  = { cashInflowUsd: 0, cashOutflowUsd: 0, cryptoInflowUsd: 0, cryptoOutflowUsd: 0 };
      if (!revenueMap[day]) revenueMap[day] = { fee: 0, spread: 0 };

      const usd = parseFloat(r.usdEquivalent ?? '0') || 0;
      if      (r.type === 'cash'   && r.direction === 'inflow')  volumeMap[day].cashInflowUsd   += usd;
      else if (r.type === 'cash'   && r.direction === 'outflow') volumeMap[day].cashOutflowUsd  += usd;
      else if (r.type === 'crypto' && r.direction === 'inflow')  volumeMap[day].cryptoInflowUsd += usd;
      else if (r.type === 'crypto' && r.direction === 'outflow') volumeMap[day].cryptoOutflowUsd+= usd;

      // Revenue: fee from confirmed records (usdEquivalent × serviceFeeRate / 100)
      if (r.processingStage === 'confirmed') {
        const rate = parseFloat(r.serviceFeeRate ?? '0') || 0;
        revenueMap[day].fee += usd * rate / 100;
        // Spread from buy/sell rate difference
        const buy  = parseFloat(r.buyRate  ?? '0') || 0;
        const sell = parseFloat(r.sellRate ?? '0') || 0;
        const amt  = parseFloat(r.amount)           || 0;
        if (buy > 0 && sell > 0 && buy !== sell) {
          revenueMap[day].spread += Math.abs(buy - sell) * amt;
        }
      }
    }

    const allDays = Array.from(new Set([...Object.keys(volumeMap), ...Object.keys(revenueMap)])).sort();
    const volumeByDay = allDays.map(date => {
      const v = volumeMap[date] ?? { cashInflowUsd: 0, cashOutflowUsd: 0, cryptoInflowUsd: 0, cryptoOutflowUsd: 0 };
      return {
        date,
        cashInflowUsd:   v.cashInflowUsd,
        cashOutflowUsd:  v.cashOutflowUsd,
        cryptoInflowUsd: v.cryptoInflowUsd,
        cryptoOutflowUsd:v.cryptoOutflowUsd,
        totalUsd: v.cashInflowUsd + v.cashOutflowUsd + v.cryptoInflowUsd + v.cryptoOutflowUsd,
      };
    });
    const revenueByDay = allDays.map(date => ({
      date,
      fee:    revenueMap[date]?.fee    ?? 0,
      spread: revenueMap[date]?.spread ?? 0,
      net:    (revenueMap[date]?.fee ?? 0) + (revenueMap[date]?.spread ?? 0),
    }));

    const totalFeeRevenue = allRecs.filter(r => r.processingStage === 'confirmed')
      .reduce((s, r) => s + (parseFloat(r.usdEquivalent ?? '0') || 0) * (parseFloat(r.serviceFeeRate ?? '0') || 0) / 100, 0);
    const totalSpread = 0; // Spread tracked via JE; not stored per-record
    const totalVolume = allRecs.reduce((s, r) => s + (parseFloat(r.usdEquivalent ?? '0') || 0), 0);

    const topCustomers = await db.select({
      customerId: customers.customerId,
      fullName: customers.fullName,
      totalTransactions: customers.totalTransactions,
      totalVolumeUsd: customers.totalVolumeUsd,
    }).from(customers)
      .where(sql`${customers.totalTransactions} > 0`)
      .orderBy(desc(customers.totalVolumeUsd))
      .limit(10);

    // Volume by currency — USD equivalent only (never fall back to raw native amount)
    const currencyMap: { [c: string]: { inflow: number; outflow: number; count: number } } = {};
    for (const r of allRecs) {
      const cur = r.currency || 'USD';
      if (!currencyMap[cur]) currencyMap[cur] = { inflow: 0, outflow: 0, count: 0 };
      currencyMap[cur].count++;
      const usd = parseFloat(r.usdEquivalent ?? '0') || 0; // strictly USD equivalent; skip if unknown
      if (r.direction === 'inflow')  currencyMap[cur].inflow  += usd;
      else                           currencyMap[cur].outflow += usd;
    }
    const volumeByCurrency = Object.entries(currencyMap).map(([currency, d]) => ({
      currency, inflow: d.inflow, outflow: d.outflow, count: d.count,
      netUsd: d.inflow - d.outflow,
    })).sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow));

    // Records status summary — totalUsd is always USD equivalent (not raw native amount)
    const stageMap: { [key: string]: { count: number; totalUsd: number } } = {};
    for (const r of allRecs) {
      const key = `${r.processingStage}|${r.type}`;
      if (!stageMap[key]) stageMap[key] = { count: 0, totalUsd: 0 };
      stageMap[key].count++;
      stageMap[key].totalUsd += parseFloat(r.usdEquivalent ?? '0') || 0;
    }
    const recordsStatusSummary = Object.entries(stageMap).map(([key, d]) => {
      const [stage, type] = key.split('|');
      return { stage, type, currency: 'USD', count: d.count, totalAmount: d.totalUsd };
    }).sort((a, b) => b.count - a.count);

    // Spread analysis — latest exchange rates with buy/sell
    const latestRates = await db.select().from(exchangeRates).orderBy(desc(exchangeRates.effectiveDate)).limit(50);
    const latestByPair: { [k: string]: typeof latestRates[0] } = {};
    for (const r of latestRates) {
      const k = r.fromCurrency;
      if (!latestByPair[k]) latestByPair[k] = r;
    }
    const spreadAnalysis = Object.values(latestByPair).map(r => {
      const mid  = parseFloat(r.rate);
      const buy  = r.buyRate  ? parseFloat(r.buyRate)  : null;
      const sell = r.sellRate ? parseFloat(r.sellRate) : null;
      const spreadPct = buy && sell && mid > 0
        ? parseFloat(((sell - buy) / mid * 100).toFixed(4))
        : null;
      return { currency: r.fromCurrency, buyRate: buy, sellRate: sell, midRate: mid, spreadPct, date: r.effectiveDate };
    });

    // Record counts
    const allRecordsCount  = await db.select({ count: sql<number>`count(*)` }).from(records);
    const pendingCount     = await db.select({ count: sql<number>`count(*)` }).from(records)
      .where(sql`${records.processingStage} IN ('recorded','manual_matched','auto_matched')`);
    const unmatchedCount   = await db.select({ count: sql<number>`count(*)` }).from(records)
      .where(sql`${records.processingStage} = 'recorded'`);
    const highRiskCount    = await db.select({ count: sql<number>`count(*)` }).from(customers)
      .where(sql`${customers.riskLevel} = 'high'`);

    return {
      volumeByDay, revenueByDay, totalFeeRevenue, totalSpread, totalVolume, topCustomers,
      volumeByCurrency, recordsStatusSummary, spreadAnalysis,
      totalRecords:      Number(allRecordsCount[0]?.count ?? 0),
      pendingRecords:    Number(pendingCount[0]?.count ?? 0),
      unmatchedRecords:  Number(unmatchedCount[0]?.count ?? 0),
      highRiskCustomers: Number(highRiskCount[0]?.count ?? 0),
    };
  }

  // ─── Currencies ────────────────────────────────────────────────────────────
  async getAllCurrencies() {
    return db.select().from(currencies).orderBy(currencies.type, currencies.code);
  }
  async getCurrency(code: string) {
    const [c] = await db.select().from(currencies).where(eq(currencies.code, code));
    return c;
  }
  async upsertCurrency(currency: InsertCurrency) {
    const [result] = await db.insert(currencies).values(currency)
      .onConflictDoUpdate({ target: currencies.code, set: { name: currency.name, symbol: currency.symbol, type: currency.type, isActive: currency.isActive, decimalPlaces: currency.decimalPlaces } })
      .returning();
    return result;
  }
  async deleteCurrency(code: string) {
    await db.delete(currencies).where(eq(currencies.code, code));
  }

  // ─── Exchange Rates ────────────────────────────────────────────────────────
  async getExchangeRates(filters?: { fromCurrency?: string; effectiveDate?: string }) {
    let q = db.select().from(exchangeRates).$dynamic();
    const conds = [];
    if (filters?.fromCurrency) conds.push(eq(exchangeRates.fromCurrency, filters.fromCurrency));
    if (filters?.effectiveDate) conds.push(eq(exchangeRates.effectiveDate, filters.effectiveDate));
    if (conds.length) q = q.where(and(...conds));
    return q.orderBy(desc(exchangeRates.effectiveDate), exchangeRates.fromCurrency);
  }
  async getLatestExchangeRate(fromCurrency: string, toCurrency = 'USD') {
    const [rate] = await db.select().from(exchangeRates)
      .where(and(eq(exchangeRates.fromCurrency, fromCurrency), eq(exchangeRates.toCurrency, toCurrency)))
      .orderBy(desc(exchangeRates.effectiveDate)).limit(1);
    return rate;
  }
  async createExchangeRate(rate: InsertExchangeRate) {
    const [result] = await db.insert(exchangeRates).values(rate).returning();
    return result;
  }
  async updateExchangeRate(id: string, updates: Partial<InsertExchangeRate>) {
    const [result] = await db.update(exchangeRates).set(updates).where(eq(exchangeRates.id, id)).returning();
    return result;
  }
  async deleteExchangeRate(id: string) {
    await db.delete(exchangeRates).where(eq(exchangeRates.id, id));
  }

  // ─── Accounting Periods ────────────────────────────────────────────────────
  async getAllPeriods() {
    return db.select().from(accountingPeriods).orderBy(desc(accountingPeriods.startDate));
  }
  async getPeriod(id: string) {
    const [p] = await db.select().from(accountingPeriods).where(eq(accountingPeriods.id, id));
    return p;
  }
  async getOpenPeriod() {
    const [p] = await db.select().from(accountingPeriods)
      .where(eq(accountingPeriods.status, 'open'))
      .orderBy(desc(accountingPeriods.startDate)).limit(1);
    return p;
  }
  async createPeriod(period: InsertAccountingPeriod) {
    const [result] = await db.insert(accountingPeriods).values(period).returning();
    return result;
  }
  async updatePeriodStatus(id: string, status: 'open' | 'closed' | 'locked', closedBy?: string) {
    const updates: Partial<AccountingPeriod> = { status };
    if (status === 'closed' || status === 'locked') {
      updates.closedBy = closedBy;
      updates.closedAt = new Date();
    }
    const [result] = await db.update(accountingPeriods).set(updates).where(eq(accountingPeriods.id, id)).returning();
    return result;
  }

  // ─── Chart of Accounts ─────────────────────────────────────────────────────
  async getAllAccounts(filters?: { type?: string; isActive?: boolean }) {
    let q = db.select().from(chartOfAccounts).$dynamic();
    const conds = [];
    if (filters?.type) conds.push(eq(chartOfAccounts.type, filters.type as any));
    if (filters?.isActive !== undefined) conds.push(eq(chartOfAccounts.isActive, filters.isActive));
    if (conds.length) q = q.where(and(...conds));
    return q.orderBy(chartOfAccounts.code);
  }
  async getAccount(id: string) {
    const [a] = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.id, id));
    return a;
  }
  async getAccountByCode(code: string) {
    const [a] = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, code));
    return a;
  }
  async createAccount(account: InsertChartOfAccounts, createdBy?: string) {
    const [result] = await db.insert(chartOfAccounts).values({ ...account, createdBy }).returning();
    return result;
  }
  async updateAccount(id: string, updates: Partial<InsertChartOfAccounts>) {
    const [result] = await db.update(chartOfAccounts)
      .set({ ...updates, updatedAt: new Date() }).where(eq(chartOfAccounts.id, id)).returning();
    return result;
  }
  async deleteAccount(id: string) {
    await db.delete(chartOfAccounts).where(and(eq(chartOfAccounts.id, id), eq(chartOfAccounts.isSystemAcc, false)));
  }
  async getAccountBalances() {
    const rows = await db.execute(sql`
      SELECT coa.id           AS account_id,
             COALESCE(SUM(jel.debit_base),  0) AS total_debit,
             COALESCE(SUM(jel.credit_base), 0) AS total_credit
      FROM   journal_entry_lines jel
      JOIN   journal_entries je  ON je.id  = jel.journal_entry_id
      JOIN   chart_of_accounts coa ON coa.code = jel.account_code
      WHERE  je.status = 'posted'
        AND  jel.account_code IS NOT NULL
      GROUP  BY coa.id
    `);
    const result: { [accountId: string]: { totalDebit: number; totalCredit: number } } = {};
    for (const r of (rows.rows ?? [])) {
      const id = r.account_id as string;
      if (id) {
        result[id] = {
          totalDebit:  parseFloat(String(r.total_debit  ?? 0)),
          totalCredit: parseFloat(String(r.total_credit ?? 0)),
        };
      }
    }
    return result;
  }

  // ─── Journal Entries ───────────────────────────────────────────────────────
  async generateJournalEntryNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [last] = await db.select({ n: journalEntries.entryNumber }).from(journalEntries)
      .where(sql`${journalEntries.entryNumber} LIKE ${'JE-' + year + '-%'}`)
      .orderBy(desc(journalEntries.entryNumber)).limit(1);
    let seq = 1;
    if (last) {
      const parts = last.n.split('-');
      seq = (parseInt(parts[parts.length - 1]) || 0) + 1;
    }
    return `JE-${year}-${String(seq).padStart(6, '0')}`;
  }

  async getAllJournalEntries(filters?: { periodId?: string; status?: string; sourceType?: string }) {
    let q = db.select().from(journalEntries).$dynamic();
    const conds = [];
    if (filters?.periodId)   conds.push(eq(journalEntries.periodId, filters.periodId));
    if (filters?.status)     conds.push(eq(journalEntries.status, filters.status as any));
    if (filters?.sourceType) conds.push(eq(journalEntries.sourceType, filters.sourceType));
    if (conds.length) q = q.where(and(...conds));
    return q.orderBy(desc(journalEntries.createdAt));
  }

  async getJournalEntry(id: string) {
    const [e] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    return e;
  }

  async getJournalEntryWithLines(id: string) {
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!entry) return undefined;
    const lines = await db.select().from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, id))
      .orderBy(journalEntryLines.lineNumber);
    return { entry, lines };
  }

  async getConfirmationJEForRecord(recordId: string) {
    const [je] = await db.select().from(journalEntries)
      .where(and(eq(journalEntries.sourceType, 'record_confirm'), eq(journalEntries.sourceId, recordId)));
    if (!je) return undefined;
    const lines = await db.select().from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, je.id))
      .orderBy(journalEntryLines.lineNumber);
    return { entry: je, lines };
  }

  async createJournalEntry(entryData: InsertJournalEntry, linesData: InsertJournalEntryLine[], postedBy?: string) {
    const entryNumber = await this.generateJournalEntryNumber();
    // Compute totals
    const totalDebit  = linesData.reduce((s, l) => s + parseFloat(String(l.debitAmount  ?? 0)), 0);
    const totalCredit = linesData.reduce((s, l) => s + parseFloat(String(l.creditAmount ?? 0)), 0);

    const [entry] = await db.insert(journalEntries).values({
      ...entryData, entryNumber, totalDebit: String(totalDebit), totalCredit: String(totalCredit),
    }).returning();

    const insertedLines = await Promise.all(
      linesData.map((line, idx) =>
        db.insert(journalEntryLines).values({ ...line, journalEntryId: entry.id, lineNumber: idx + 1 }).returning()
      )
    );
    const lines = insertedLines.map(([l]) => l);

    // Auto-post if totals balance
    if (Math.abs(totalDebit - totalCredit) < 0.001 && postedBy) {
      const [posted] = await db.update(journalEntries)
        .set({ status: 'posted', postedBy, postedAt: new Date(), updatedAt: new Date() })
        .where(eq(journalEntries.id, entry.id)).returning();
      return { entry: posted, lines };
    }
    return { entry, lines };
  }

  async postJournalEntry(id: string, postedBy: string) {
    const result = await this.getJournalEntryWithLines(id);
    if (!result) return undefined;
    const { entry, lines } = result;
    if (entry.status !== 'draft') throw new Error('Only draft entries can be posted');
    const totalDebit  = lines.reduce((s, l) => s + parseFloat(String(l.debitAmount  ?? 0)), 0);
    const totalCredit = lines.reduce((s, l) => s + parseFloat(String(l.creditAmount ?? 0)), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new Error(`Journal entry is unbalanced: Debits ${totalDebit.toFixed(4)} ≠ Credits ${totalCredit.toFixed(4)}. Total Debits MUST equal Total Credits.`);
    }
    const [posted] = await db.update(journalEntries)
      .set({ status: 'posted', postedBy, postedAt: new Date(), updatedAt: new Date() })
      .where(eq(journalEntries.id, id)).returning();
    return posted;
  }

  async voidJournalEntry(id: string, voidedBy: string, reason: string) {
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!entry) return undefined;
    if (entry.status === 'void') throw new Error('Entry is already voided');
    const [voided] = await db.update(journalEntries)
      .set({ status: 'void', voidedBy, voidedAt: new Date(), voidReason: reason, updatedAt: new Date() })
      .where(eq(journalEntries.id, id)).returning();
    return voided;
  }

  // ─── Source Documents ──────────────────────────────────────────────────────
  async generateDocumentNumber(type: string): Promise<string> {
    const prefixMap: { [key: string]: string } = {
      receipt: 'RCP', payment_voucher: 'PV', invoice: 'INV',
      credit_note: 'CN', debit_note: 'DN', journal_voucher: 'JV',
    };
    const prefix = prefixMap[type] ?? 'DOC';
    const year = new Date().getFullYear();
    const pattern = `${prefix}-${year}-%`;
    const [last] = await db.select({ n: sourceDocuments.documentNumber }).from(sourceDocuments)
      .where(sql`${sourceDocuments.documentNumber} LIKE ${pattern}`)
      .orderBy(desc(sourceDocuments.documentNumber)).limit(1);
    let seq = 1;
    if (last) {
      const parts = last.n.split('-');
      seq = (parseInt(parts[parts.length - 1]) || 0) + 1;
    }
    return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
  }

  async getAllSourceDocuments(filters?: { documentType?: string; partyId?: string }) {
    let q = db.select().from(sourceDocuments).$dynamic();
    const conds = [];
    if (filters?.documentType) conds.push(eq(sourceDocuments.documentType, filters.documentType as any));
    if (filters?.partyId)      conds.push(eq(sourceDocuments.partyId, filters.partyId));
    if (conds.length) q = q.where(and(...conds));
    return q.orderBy(desc(sourceDocuments.createdAt));
  }

  async getSourceDocument(id: string) {
    const [doc] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, id));
    return doc;
  }

  async createSourceDocument(doc: InsertSourceDocument, createdBy?: string) {
    const documentNumber = await this.generateDocumentNumber(doc.documentType);
    const [result] = await db.insert(sourceDocuments).values({ ...doc, documentNumber, createdBy }).returning();
    return result;
  }

  async updateSourceDocument(id: string, updates: Partial<InsertSourceDocument>) {
    const [result] = await db.update(sourceDocuments)
      .set({ ...updates, updatedAt: new Date() }).where(eq(sourceDocuments.id, id)).returning();
    return result;
  }

  // ─── Auto-generate Journal Entry from Transaction (IFRS/GAAP Compliant) ─────
  // Principle: Every debit must have an equal and opposite credit. Zero tolerance.
  // Lifecycle:
  //   INFLOW  record → DR [Asset Account]       CR 2101 Customer Credit Balances
  //   OUTFLOW record → DR 2101 Customer Credit  CR [Asset Account]
  //   Fee      → DR 2101 Customer Credit  CR 4101 Service Fee Income
  //   Expense  → DR 5101 Supplier Expense CR 2201 Supplier Payables
  //   Spread   → DR 2101 Customer Credit  CR 4102 Spread Income (or reverse if loss)
  async autoGenerateJournalEntry(transactionId: string, postedBy: string): Promise<JournalEntry | undefined> {
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
    if (!tx) return undefined;

    // Prevent duplicate JEs for the same transaction
    const [existingJE] = await db.select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.sourceType, 'transaction'), eq(journalEntries.sourceId, tx.id)));
    if (existingJE) return undefined; // JE already exists — idempotent

    const period = await this.getOpenPeriod();
    if (!period) throw new Error('No open accounting period. Create or open one first.');

    // Customer name for party tracing
    let partyName = 'Unidentified Customer';
    if (tx.customerId) {
      const [cust] = await db.select({ fullName: customers.fullName }).from(customers)
        .where(eq(customers.id, tx.customerId));
      if (cust) partyName = cust.fullName;
    }

    // Load the actual linked records (physical movements)
    const linkedRecordIds = ((tx.relatedRecordIds ?? []) as string[]).filter(Boolean);
    let linkedRecords: Record[] = [];
    if (linkedRecordIds.length > 0) {
      linkedRecords = await db.select().from(records).where(inArray(records.id, linkedRecordIds));
    }

    // Load CoA accounts used by the linked records (to get real codes & names)
    const accountIdsUsed = [...new Set(linkedRecords.map(r => r.accountId).filter(Boolean))] as string[];
    const accountMap = new Map<string, { code: string; name: string }>();
    if (accountIdsUsed.length > 0) {
      const accts = await db.select({ id: chartOfAccounts.id, code: chartOfAccounts.code, name: chartOfAccounts.name })
        .from(chartOfAccounts).where(inArray(chartOfAccounts.id, accountIdsUsed));
      for (const a of accts) accountMap.set(a.id, { code: a.code, name: a.name });
    }

    // 2101 Customer Credit Balances — the universal contra (control account)
    const [ctrl2101] = await db.select({ code: chartOfAccounts.code, name: chartOfAccounts.name })
      .from(chartOfAccounts).where(eq(chartOfAccounts.code, '2101'));
    const CTRL = ctrl2101 ?? { code: '2101', name: 'Customer Credit Balances' };

    const today = (tx.createdAt as Date | null)?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const lines: InsertJournalEntryLine[] = [];
    let lineNum = 1;

    const addLine = (code: string, name: string, dr: number, cr: number, desc: string) => {
      if (Math.abs(dr) < 0.00005 && Math.abs(cr) < 0.00005) return; // Skip dust
      lines.push({
        journalEntryId: '',
        lineNumber: lineNum++,
        accountCode: code,
        accountName: name,
        description: desc,
        debitAmount:  dr > 0 ? dr.toFixed(4) : '0.0000',
        creditAmount: cr > 0 ? cr.toFixed(4) : '0.0000',
        currency: 'USD',
        exchangeRate: '1',
        debitBase:    dr > 0 ? dr.toFixed(4) : '0.0000',
        creditBase:   cr > 0 ? cr.toFixed(4) : '0.0000',
        partyId: tx.customerId ?? undefined,
        partyName,
      });
    };

    // ── STEP 1: Book each physical record ──────────────────────────────────
    // Use actual USD equivalent from record; fall back to amount ÷ rate if missing.
    for (const rec of linkedRecords) {
      const rawUsd = parseFloat(String(rec.usdEquivalent ?? '0'));
      const rate   = parseFloat(String((rec as any).exchangeRate ?? (rec as any).buyRate ?? (rec as any).sellRate ?? '1')) || 1;
      const usdAmt = rawUsd > 0 ? rawUsd : parseFloat(String(rec.amount ?? '0')) / rate;
      if (usdAmt <= 0) continue;

      const acct    = rec.accountId ? accountMap.get(rec.accountId) : null;
      const acctCode = acct?.code ?? (rec.type === 'crypto' ? '1201' : '1101');
      const acctName = acct?.name ?? rec.accountName ?? 'Asset Account';
      const ref      = `${tx.transactionNumber} / ${rec.recordNumber}`;

      if (rec.direction === 'inflow') {
        // Money arrives: asset increases, customer liability created
        addLine(acctCode,    acctName,    usdAmt, 0,      `Inflow received — ${ref}`);
        addLine(CTRL.code,   CTRL.name,   0,      usdAmt, `Customer credit created — ${ref}`);
      } else {
        // Money leaves: customer liability reduces, asset decreases
        addLine(CTRL.code,   CTRL.name,   usdAmt, 0,      `Customer credit settled — ${ref}`);
        addLine(acctCode,    acctName,    0,      usdAmt, `Outflow disbursed — ${ref}`);
      }
    }

    // If no linked records (bare transaction), use tx-level totals with generic fallback accounts
    if (linkedRecords.length === 0) {
      const inUsd  = parseFloat(String(tx.totalInUsd  ?? 0));
      const outUsd = parseFloat(String(tx.totalOutUsd ?? 0));
      if (inUsd > 0) {
        const assetCode = tx.type === 'withdraw' ? '1201' : '1101';
        const assetName = tx.type === 'withdraw' ? 'USDT Holdings – BEP20' : 'Cash on Hand – USD';
        addLine(assetCode,  assetName,  inUsd, 0,     `Inflow (no records) — ${tx.transactionNumber}`);
        addLine(CTRL.code,  CTRL.name,  0,     inUsd, `Customer credit — ${tx.transactionNumber}`);
      }
      if (outUsd > 0) {
        const assetCode = tx.type === 'deposit' ? '1201' : '1101';
        const assetName = tx.type === 'deposit' ? 'USDT Holdings – BEP20' : 'Cash on Hand – YER';
        addLine(CTRL.code,  CTRL.name,  outUsd, 0,      `Customer credit settled — ${tx.transactionNumber}`);
        addLine(assetCode,  assetName,  0,      outUsd, `Outflow (no records) — ${tx.transactionNumber}`);
      }
    }

    // ── STEP 2: Service Fee Recognition ────────────────────────────────────
    // Customer's credit balance is reduced by the fee; we recognise fee revenue.
    const fee = parseFloat(String(tx.serviceFeeAmount ?? 0));
    if (fee > 0.001) {
      const feeRate = parseFloat(String(tx.serviceFeeRate ?? 0));
      addLine(CTRL.code, CTRL.name,       fee, 0,   `Service fee extracted (${feeRate.toFixed(2)}%) — ${tx.transactionNumber}`);
      addLine('4101',    'Service Fee Income', 0,   fee, `Fee income — ${tx.transactionNumber}`);
    }

    // ── STEP 3: Spread / Exchange Rate Gain or Loss ─────────────────────────
    // Spread = difference between buy and sell rates captured on the transaction.
    // If positive  → DR 2101 (extract from customer credit), CR 4102 Spread Income
    // If negative  → DR 4104 Exchange Rate Loss, CR 2101 (we absorb the loss)
    const inUsd   = parseFloat(String(tx.totalInUsd  ?? 0));
    const outUsd  = parseFloat(String(tx.totalOutUsd ?? 0));
    const expense = parseFloat(String(tx.serviceExpenseAmount ?? 0));
    const spread  = parseFloat(String((tx as any).spreadAmount ?? 0)) ||
                    +(inUsd - outUsd - fee - expense).toFixed(4);

    if (spread > 0.001) {
      addLine(CTRL.code, CTRL.name,     spread, 0,      `Exchange spread captured — ${tx.transactionNumber}`);
      addLine('4102',    'Spread Income', 0,    spread, `Spread revenue — ${tx.transactionNumber}`);
    } else if (spread < -0.001) {
      const loss = Math.abs(spread);
      addLine('4104', 'Exchange Rate Loss', loss, 0,     `FX rate loss — ${tx.transactionNumber}`);
      addLine(CTRL.code, CTRL.name,         0,    loss,  `Rate loss absorbed — ${tx.transactionNumber}`);
    }

    // ── STEP 4: Provider / Supplier Expense ─────────────────────────────────
    // Our cost to acquire the crypto or currency from a provider.
    if (expense > 0.001) {
      const expRate = parseFloat(String(tx.serviceExpenseRate ?? 0));
      addLine('5101', 'Supplier Exchange Expense', expense, 0,       `Provider expense (${expRate.toFixed(2)}%) — ${tx.transactionNumber}`);
      addLine('2201', 'Supplier Payables',          0,       expense, `Payable to provider — ${tx.transactionNumber}`);
    }

    // ── STEP 5: Net Difference Classification (Premium/Discount/Receivable) ─
    const net = parseFloat(String(tx.netDifference ?? 0));
    if (net > 0.001) {
      if (tx.netDifferenceType === 'premium_fee') {
        addLine(CTRL.code, CTRL.name,         net, 0,   `Premium fee charged — ${tx.transactionNumber}`);
        addLine('4103',    'Premium Fee Income', 0, net, `Premium revenue — ${tx.transactionNumber}`);
      } else if (tx.netDifferenceType === 'customer_credit') {
        addLine(CTRL.code, CTRL.name, net, 0,   `Spread (customer credit) — ${tx.transactionNumber}`);
        addLine('4102',    'Spread Income', 0,   net, `Spread income — ${tx.transactionNumber}`);
      } else if (tx.netDifferenceType === 'premium_discount') {
        addLine('5103',    'Premium Discount Given', net, 0,   `Discount given — ${tx.transactionNumber}`);
        addLine(CTRL.code, CTRL.name,                0,   net, `Discount credited to customer — ${tx.transactionNumber}`);
      } else if (tx.netDifferenceType === 'customer_receivable') {
        addLine('1301',    'Customer Receivables',   net, 0,   `Customer owes us — ${tx.transactionNumber}`);
        addLine(CTRL.code, CTRL.name,                0,   net, `Receivable offset — ${tx.transactionNumber}`);
      }
    }

    // ── STEP 6: Balance Validation — ZERO TOLERANCE ─────────────────────────
    // Sum of all debits MUST equal sum of all credits. Any residual is a system error.
    const totalDR = lines.reduce((s, l) => s + parseFloat(l.debitAmount  ?? '0'), 0);
    const totalCR = lines.reduce((s, l) => s + parseFloat(l.creditAmount ?? '0'), 0);
    const imbalance = parseFloat((totalDR - totalCR).toFixed(4));

    if (Math.abs(imbalance) > 0.005) {
      // Auto-correct via suspense: flag for finance review rather than blocking operations
      if (imbalance > 0) {
        addLine('9999', 'Suspense / Balance Correction', 0,          imbalance, `⚠ DR>CR by ${imbalance} — ${tx.transactionNumber}`);
      } else {
        addLine('9999', 'Suspense / Balance Correction', Math.abs(imbalance), 0, `⚠ CR>DR by ${Math.abs(imbalance)} — ${tx.transactionNumber}`);
      }
    }

    // ── STEP 7: Create and immediately post the JE ───────────────────────────
    const entryData: InsertJournalEntry = {
      periodId:    period.id,
      entryDate:   today,
      description: `[AUTO] ${tx.type.toUpperCase()} — ${tx.transactionNumber} | ${partyName}`,
      status:      'draft',
      sourceType:  'transaction',
      sourceId:    tx.id,
      baseCurrency: 'USD',
    };

    const { entry } = await this.createJournalEntry(entryData, lines, postedBy);

    // Auto-post (period must be open; silently leave as draft if post fails)
    if (entry && lines.length >= 2) {
      try { await this.postJournalEntry(entry.id, postedBy); } catch { /* leave draft */ }
    }

    return entry;
  }

  // ─── Record-Level Journal Entry ─────────────────────────────────────────────
  // Fires when a record transitions draft → recorded.
  // ALWAYS journals to 2101 (suspense/unmatched) — even if a customer is already linked.
  // The customer's real liability account is ONLY affected at the Confirmation stage.
  // This upholds the Delayed Journaling principle: P&L and customer impact are deferred.
  async generateRecordJournalEntry(recordId: string, postedBy: string): Promise<JournalEntry | undefined> {
    const [rec] = await db.select().from(records).where(eq(records.id, recordId));
    if (!rec) return undefined;

    // Idempotency: skip if a record-level JE already exists
    const [existingJE] = await db.select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.sourceType, 'record'), eq(journalEntries.sourceId, rec.id)));
    if (existingJE) return undefined;

    const period = await this.getOpenPeriod();
    if (!period) throw new Error('No open accounting period. Create or open one first.');

    const amount = parseFloat(String(rec.amount ?? '0'));
    if (amount <= 0) throw new Error('Cannot journalize a record with zero amount.');

    // ── Look up asset CoA account ──────────────────────────────────────────
    let acctCode    = rec.type === 'crypto' ? '1201' : '1101';
    let acctName    = rec.accountName ?? 'Asset Account';
    let acctBuyRate  = 1;    // bank/account buy rate (for inflow asset valuation)
    let acctSellRate = 1;    // bank/account sell rate (for outflow asset valuation)
    let acctCurrency = rec.currency ?? 'USD';
    let linkedProviderId: string | null = null;

    if (rec.accountId) {
      const [coa] = await db.select({
        code: chartOfAccounts.code, name: chartOfAccounts.name,
        buyRate: chartOfAccounts.buyRate, sellRate: chartOfAccounts.sellRate,
        currency: chartOfAccounts.currency, providerId: chartOfAccounts.providerId,
      }).from(chartOfAccounts).where(eq(chartOfAccounts.id, rec.accountId));
      if (coa) {
        acctCode      = coa.code;
        acctName      = coa.name;
        acctBuyRate   = parseFloat(String(coa.buyRate  ?? '1')) || 1;
        acctSellRate  = parseFloat(String(coa.sellRate ?? '1')) || 1;
        acctCurrency  = coa.currency ?? acctCurrency;
        linkedProviderId = coa.providerId ?? null;
      }
    }

    // ── Look up provider (fees + network) ─────────────────────────────────
    let depositFeeRate  = 0;  // % charged to customer on deposit  (crypto outflow)
    let withdrawFeeRate = 0;  // % charged to customer on withdraw (crypto inflow)
    let networkFeeUsd   = 0;  // fixed USD gas fee per transaction

    if (linkedProviderId) {
      const [prov] = await db.select({
        depositFeeRate: providers.depositFeeRate, withdrawFeeRate: providers.withdrawFeeRate,
        networkFeeUsd:  providers.networkFeeUsd,
      }).from(providers).where(eq(providers.id, linkedProviderId));
      if (prov) {
        depositFeeRate  = parseFloat(String(prov.depositFeeRate  ?? '0'));
        withdrawFeeRate = parseFloat(String(prov.withdrawFeeRate ?? '0'));
        networkFeeUsd   = parseFloat(String(prov.networkFeeUsd   ?? '0'));
      }
    }

    // ── Look up system exchange rates ──────────────────────────────────────
    // System buy/sell rates are what we advertise to customers.
    // Bank/CoA rates (acctBuyRate / acctSellRate) are more favorable to us.
    // Spread = difference between the two = our FX revenue.
    let sysBuyRate  = acctBuyRate;   // fallback = no spread
    let sysSellRate = acctSellRate;
    if (rec.type === 'cash' && acctCurrency !== 'USD') {
      // Prefer rates from the record itself (captured at time of recording)
      const recBuy  = parseFloat(String((rec as any).buyRate  ?? '0'));
      const recSell = parseFloat(String((rec as any).sellRate ?? '0'));
      if (rec.direction === 'inflow'  && recBuy  > 0) sysBuyRate  = recBuy;
      if (rec.direction === 'outflow' && recSell > 0) sysSellRate = recSell;
      // Otherwise fetch latest exchange rate
      if ((rec.direction === 'inflow' && sysBuyRate === acctBuyRate) ||
          (rec.direction === 'outflow' && sysSellRate === acctSellRate)) {
        const [er] = await db.select({ buyRate: exchangeRates.buyRate, sellRate: exchangeRates.sellRate })
          .from(exchangeRates)
          .where(and(eq(exchangeRates.fromCurrency, acctCurrency), eq(exchangeRates.toCurrency, 'USD')))
          .orderBy(desc(exchangeRates.createdAt)).limit(1);
        if (er) {
          if (rec.direction === 'inflow'  && parseFloat(String(er.buyRate  ?? '0')) > 0) sysBuyRate  = parseFloat(String(er.buyRate));
          if (rec.direction === 'outflow' && parseFloat(String(er.sellRate ?? '0')) > 0) sysSellRate = parseFloat(String(er.sellRate));
        }
      }
    }

    // ── Contra-account is ALWAYS 2101 (unmatched suspense) at recording time ──
    // Whether a customer is linked or not is irrelevant here.
    // The customer's real liability account is only touched at Confirmation.
    let contraCode = '2101';
    let contraName = 'Customer Credits - Unmatched';
    const [ctrl2101] = await db.select({ code: chartOfAccounts.code, name: chartOfAccounts.name })
      .from(chartOfAccounts).where(eq(chartOfAccounts.code, '2101'));
    if (ctrl2101) { contraCode = ctrl2101.code; contraName = ctrl2101.name; }

    // Party name for JE description only (display purposes, not accounting routing)
    let partyName = rec.clientName ?? 'Unidentified';
    if (rec.customerId) {
      const [cust] = await db.select({ fullName: customers.fullName })
        .from(customers).where(eq(customers.id, rec.customerId));
      if (cust) partyName = cust.fullName;
    }

    // ── Build journal entry lines ──────────────────────────────────────────
    const today   = (rec.createdAt as Date | null)?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const ref     = rec.recordNumber;
    const lines: InsertJournalEntryLine[] = [];
    let   lineNum = 1;

    const addLine = (code: string, name: string, dr: number, cr: number, desc: string, pId?: string, pName?: string) => {
      if (dr <= 0 && cr <= 0) return;
      lines.push({
        journalEntryId: '',
        lineNumber:     lineNum++,
        accountCode:    code,
        accountName:    name,
        description:    desc,
        debitAmount:    dr > 0 ? dr.toFixed(4) : '0.0000',
        creditAmount:   cr > 0 ? cr.toFixed(4) : '0.0000',
        currency:       'USD',
        exchangeRate:   '1',
        debitBase:      dr > 0 ? dr.toFixed(4) : '0.0000',
        creditBase:     cr > 0 ? cr.toFixed(4) : '0.0000',
        partyId:        pId,
        partyName:      pName,
      });
    };

    // ── SUSPENSE-ONLY JE (Delayed Journaling principle) ───────────────────────
    // P&L is NOT realized here. We only record the gross asset movement vs. suspense.
    // Fees, spread, and net-to-customer are all deferred to the Confirmation JE.
    //
    // INFLOW  → DR Asset Account / CR 2101 Suspense   (at gross bank rate)
    // OUTFLOW → DR 2101 Suspense / CR Asset Account   (at gross bank rate)
    //
    // The confirmation JE later clears the suspense and splits it into:
    //   Customer account (net) + P&L accounts (spread / fees)

    if (rec.type === 'cash') {
      if (rec.direction === 'inflow') {
        // Gross asset value at bank rate (how much USD the bank gives us for the YER)
        const grossUsd = amount / acctBuyRate;
        addLine(acctCode, acctName, grossUsd, 0,       `[SUSPENSE] Cash received (bank rate ${acctBuyRate} ${acctCurrency}/$) — ${ref} | ${partyName}`);
        addLine(contraCode, contraName, 0, grossUsd,   `[SUSPENSE] Pending confirmation — ${ref} | ${partyName}`);
      } else {
        // Gross asset cost at bank rate (how much USD the bank charges us for the YER we send)
        const grossUsd = amount / acctSellRate;
        addLine(contraCode, contraName, grossUsd, 0,   `[SUSPENSE] Pending confirmation — ${ref} | ${partyName}`);
        addLine(acctCode, acctName, 0, grossUsd,       `[SUSPENSE] Cash disbursed (bank rate ${acctSellRate} ${acctCurrency}/$) — ${ref} | ${partyName}`);
      }
    } else {
      // Crypto: USDT is always 1:1 with USD
      if (rec.direction === 'inflow') {
        addLine(acctCode,   acctName,   amount, 0,     `[SUSPENSE] Crypto received (${rec.currency}) — ${ref} | ${partyName}`);
        addLine(contraCode, contraName, 0,      amount, `[SUSPENSE] Pending confirmation — ${ref} | ${partyName}`);
      } else {
        addLine(contraCode, contraName, amount, 0,     `[SUSPENSE] Pending confirmation — ${ref} | ${partyName}`);
        addLine(acctCode,   acctName,   0,      amount, `[SUSPENSE] Crypto sent (${rec.currency}) — ${ref} | ${partyName}`);
      }
      // Fees (depositFeeRate, withdrawFeeRate, networkFeeUsd) are realized at the Confirmation stage.
      void depositFeeRate; void withdrawFeeRate; void networkFeeUsd;
    }

    if (lines.length < 2) throw new Error('Journal entry requires at least 2 lines.');

    // Always suspense at recording stage — customer name is for display only
    const entryData: InsertJournalEntry = {
      periodId:     period.id,
      entryDate:    today,
      description:  `[REC→2101] ${rec.direction.toUpperCase()} ${rec.type.toUpperCase()} — ${ref} | ${partyName}`,
      status:       'draft',
      sourceType:   'record',
      sourceId:     rec.id,
      baseCurrency: 'USD',
    };

    const { entry } = await this.createJournalEntry(entryData, lines, postedBy);
    if (entry && lines.length >= 2) {
      try { await this.postJournalEntry(entry.id, postedBy); } catch { /* leave draft if period not open */ }
    }
    return entry;
  }

  // ─── Matching Journal Entry ──────────────────────────────────────────────────
  // Delayed-journaling principle: matching does NOT post a ledger entry.
  // It only links the customer_id to the record in the data layer.
  // P&L is realized atomically at the Confirmation stage via generateConfirmationJournalEntry.
  async generateMatchingJournalEntry(_recordId: string, _customerId: string, _postedBy: string): Promise<JournalEntry | undefined> {
    return undefined; // intentional no-op — P&L deferred to confirmation
  }

  // ─── Matching Journal Entry (legacy stub — no longer invoked) ────────────────
  private async _legacyGenerateMatchingJournalEntry(recordId: string, customerId: string, postedBy: string): Promise<JournalEntry | undefined> {
    // Idempotency: skip if matching JE already exists
    const [existingMatchJE] = await db.select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.sourceType, 'record_match'), eq(journalEntries.sourceId, recordId)));
    if (existingMatchJE) return undefined;

    const [rec] = await db.select().from(records).where(eq(records.id, recordId));
    if (!rec) return undefined;

    // Find the original record JE
    const [origJE] = await db.select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.sourceType, 'record'), eq(journalEntries.sourceId, recordId)));
    if (!origJE) return undefined;

    const origResult = await this.getJournalEntryWithLines(origJE.id);
    if (!origResult) return undefined;

    // Only reclassify if the original JE had unidentified 2101 lines (no partyId)
    const suspenseLines = origResult.lines.filter(l => l.accountCode === '2101' && !l.partyId);
    if (suspenseLines.length === 0) return undefined; // Already direct-to-client — no reclass needed

    const period = await this.getOpenPeriod();
    if (!period) throw new Error('No open accounting period for matching journal.');

    const [cust] = await db.select({ fullName: customers.fullName })
      .from(customers).where(eq(customers.id, customerId));
    const custName = cust?.fullName ?? 'Customer';

    // Determine the customer's target account (use record's contraAccountId if available)
    let customerAcctCode = '2101';
    let customerAcctName = 'Customer Credit Balances';
    if (rec.contraAccountId) {
      const [contraCoa] = await db.select({ code: chartOfAccounts.code, name: chartOfAccounts.name })
        .from(chartOfAccounts).where(eq(chartOfAccounts.id, rec.contraAccountId));
      if (contraCoa) { customerAcctCode = contraCoa.code; customerAcctName = contraCoa.name; }
    } else {
      const [ctrl2101] = await db.select({ code: chartOfAccounts.code, name: chartOfAccounts.name })
        .from(chartOfAccounts).where(eq(chartOfAccounts.code, '2101'));
      if (ctrl2101) { customerAcctCode = ctrl2101.code; customerAcctName = ctrl2101.name; }
    }

    const today = new Date().toISOString().slice(0, 10);
    const ref   = rec.recordNumber;
    const lines: InsertJournalEntryLine[] = [];
    let   lineNum = 1;

    for (const sl of suspenseLines) {
      const drAmt = parseFloat(sl.debitAmount  ?? '0');
      const crAmt = parseFloat(sl.creditAmount ?? '0');
      // Reverse the unidentified 2101 line (clear suspense)
      lines.push({
        journalEntryId: '',
        lineNumber:     lineNum++,
        accountCode:    '2101',
        accountName:    'Customer Credit Balances',
        description:    `[MATCH-CLR] Clear suspense — ${ref}`,
        debitAmount:    crAmt > 0 ? crAmt.toFixed(4) : '0.0000',
        creditAmount:   drAmt > 0 ? drAmt.toFixed(4) : '0.0000',
        currency:       'USD',
        exchangeRate:   '1',
        debitBase:      crAmt > 0 ? crAmt.toFixed(4) : '0.0000',
        creditBase:     drAmt > 0 ? drAmt.toFixed(4) : '0.0000',
        partyId:        undefined,
        partyName:      undefined,
      });
      // Post to customer's identified account
      lines.push({
        journalEntryId: '',
        lineNumber:     lineNum++,
        accountCode:    customerAcctCode,
        accountName:    customerAcctName,
        description:    `[MATCH-REC] Customer identified — ${ref} | ${custName}`,
        debitAmount:    drAmt > 0 ? drAmt.toFixed(4) : '0.0000',
        creditAmount:   crAmt > 0 ? crAmt.toFixed(4) : '0.0000',
        currency:       'USD',
        exchangeRate:   '1',
        debitBase:      drAmt > 0 ? drAmt.toFixed(4) : '0.0000',
        creditBase:     crAmt > 0 ? crAmt.toFixed(4) : '0.0000',
        partyId:        customerId,
        partyName:      custName,
      });
    }

    if (lines.length < 2) return undefined;

    const entryData: InsertJournalEntry = {
      periodId:     period.id,
      entryDate:    today,
      description:  `[MATCH] ${rec.direction.toUpperCase()} — ${ref} | ${custName}`,
      status:       'draft',
      sourceType:   'record_match',
      sourceId:     recordId,
      baseCurrency: 'USD',
    };

    const { entry } = await this.createJournalEntry(entryData, lines, postedBy);
    if (entry && lines.length >= 2) {
      try { await this.postJournalEntry(entry.id, postedBy); } catch { /* leave draft */ }
    }
    return entry;
  }

  // ─── Confirmation Journal Entry ──────────────────────────────────────────────
  // Posted atomically when a record transitions to 'confirmed'.
  // This is the ONLY place P&L is realized — delayed-journaling principle.
  //
  // INFLOW:  DR 2101 Suspense → CR Customer 2101 Account + CR P&L (fees, spread)
  // OUTFLOW: DR Customer 2101 Account → CR 2101 Suspense + CR P&L (fees, gas)
  async generateConfirmationJournalEntry(recordId: string, postedBy: string): Promise<{ entry: JournalEntry; feeBreakdown: FeeBreakdown | null }> {
    return (await this._buildConfirmationJE(recordId, postedBy, true))!;
  }

  async previewConfirmationJournalEntry(recordId: string): Promise<{ lines: Array<{ accountCode: string; accountName: string; description: string; debitAmount: string; creditAmount: string }>; projectedProfit: number }> {
    return this._buildConfirmationJE(recordId, '__preview__', false) as any;
  }

  private async _buildConfirmationJE(recordId: string, postedBy: string, post: boolean): Promise<{ entry: JournalEntry; feeBreakdown: FeeBreakdown | null } | { lines: any[]; projectedProfit: number }> {
    const [rec] = await db.select().from(records).where(eq(records.id, recordId));
    if (!rec) throw new Error('Record not found.');
    if (post && !rec.customerId) throw new Error('Cannot confirm — no customer linked. Link a customer first.');

    if (post) {
      const [existingConfirmJE] = await db.select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(eq(journalEntries.sourceType, 'record_confirm'), eq(journalEntries.sourceId, recordId)));

      if (existingConfirmJE) {
        // Check whether this JE was reversed by a cancellation.
        // Cancellation creates a reversal entry with sourceId = `${recordId}_confirm_reversal`.
        const [confirmReversal] = await db.select({ id: journalEntries.id })
          .from(journalEntries)
          .where(eq(journalEntries.sourceId, `${recordId}_confirm_reversal`));

        if (!confirmReversal) {
          const [full] = await db.select().from(journalEntries).where(eq(journalEntries.id, existingConfirmJE.id));
          if (full) return { entry: full as JournalEntry, feeBreakdown: null };
          throw new Error('Confirmation journal entry already exists for this record. The record may already be confirmed.');
        }
        // Reversal exists → this is a re-confirmation after cancellation; proceed to create a new JE.
      }
    }

    const period = post ? await this.getOpenPeriod() : null;
    if (post && !period) throw new Error('No open accounting period. Create or open one first.');

    const amount = parseFloat(String(rec.amount ?? '0'));
    if (amount <= 0) throw new Error('Record amount is zero — cannot journalize.');

    // ── Load asset CoA account ────────────────────────────────────────────────
    let acctCode     = rec.type === 'crypto' ? '1201' : '1101';
    let acctName     = rec.accountName ?? 'Asset Account';
    let acctBuyRate  = 1;
    let acctSellRate = 1;
    let acctCurrency = rec.currency ?? 'USD';
    let linkedProviderId: string | null = null;

    if (rec.accountId) {
      const [coa] = await db.select({
        code: chartOfAccounts.code, name: chartOfAccounts.name,
        buyRate: chartOfAccounts.buyRate, sellRate: chartOfAccounts.sellRate,
        currency: chartOfAccounts.currency, providerId: chartOfAccounts.providerId,
      }).from(chartOfAccounts).where(eq(chartOfAccounts.id, rec.accountId));
      if (coa) {
        acctCode = coa.code; acctName = coa.name;
        acctBuyRate  = parseFloat(String(coa.buyRate  ?? '1')) || 1;
        acctSellRate = parseFloat(String(coa.sellRate ?? '1')) || 1;
        acctCurrency = coa.currency ?? acctCurrency;
        linkedProviderId = coa.providerId ?? null;
      }
    }

    // ── Load provider (fees / gas) ────────────────────────────────────────────
    let depositFeeRate  = 0;
    let withdrawFeeRate = 0;
    let networkFeeUsd   = 0;
    if (linkedProviderId) {
      const [prov] = await db.select({
        depositFeeRate: providers.depositFeeRate, withdrawFeeRate: providers.withdrawFeeRate,
        networkFeeUsd: providers.networkFeeUsd, networkId: providers.networkId,
      }).from(providers).where(eq(providers.id, linkedProviderId));
      if (prov) {
        depositFeeRate  = parseFloat(String(prov.depositFeeRate  ?? '0'));
        withdrawFeeRate = parseFloat(String(prov.withdrawFeeRate ?? '0'));
        // Prefer the live network fee from crypto_networks over the provider's cached copy.
        // The user can update network fees in the Networks settings without re-seeding providers.
        let liveNetworkFee: number | null = null;
        if (prov.networkId) {
          const [net] = await db.select({ networkFeeUsd: cryptoNetworks.networkFeeUsd })
            .from(cryptoNetworks).where(eq(cryptoNetworks.id, prov.networkId));
          if (net?.networkFeeUsd !== undefined && net?.networkFeeUsd !== null) {
            liveNetworkFee = parseFloat(String(net.networkFeeUsd));
          }
        }
        networkFeeUsd = liveNetworkFee !== null ? liveNetworkFee : parseFloat(String(prov.networkFeeUsd ?? '0'));
      }
    }

    // ── Execution rates — prefer values stored on the record (possibly edited by admin) ────
    let execBuyRate  = acctBuyRate;
    let execSellRate = acctSellRate;
    if (rec.type === 'cash' && acctCurrency !== 'USD') {
      const recBuy  = parseFloat(String((rec as any).buyRate  ?? '0'));
      const recSell = parseFloat(String((rec as any).sellRate ?? '0'));
      if (rec.direction === 'inflow'  && recBuy  > 0) execBuyRate  = recBuy;
      if (rec.direction === 'outflow' && recSell > 0) execSellRate = recSell;
    }

    // ── Suspense amount from original JE ─────────────────────────────────────
    // For inflow:  2101 was CR'd → we DR it now
    // For outflow: 2101 was DR'd → we CR it now
    let suspenseAmount = 0;
    const [origJE] = await db.select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.sourceType, 'record'), eq(journalEntries.sourceId, recordId)));
    if (origJE) {
      const origResult = await this.getJournalEntryWithLines(origJE.id);
      for (const l of (origResult?.lines ?? [])) {
        if (l.accountCode === '2101') {
          const cr = parseFloat(l.creditAmount ?? '0');
          const dr = parseFloat(l.debitAmount  ?? '0');
          suspenseAmount = rec.direction === 'inflow' ? cr : dr;
          if (suspenseAmount > 0) break;
        }
      }
    }
    // Fallback: recalculate if no original JE found (e.g. legacy records)
    if (suspenseAmount <= 0) {
      suspenseAmount = rec.type === 'crypto' ? amount
        : rec.direction === 'inflow' ? amount / acctBuyRate : amount / acctSellRate;
    }

    // ── Customer account ──────────────────────────────────────────────────────
    let customerAcctCode = '2101';
    let customerAcctName = 'Customer Credit Balances';
    if (rec.contraAccountId) {
      const [c] = await db.select({ code: chartOfAccounts.code, name: chartOfAccounts.name })
        .from(chartOfAccounts).where(eq(chartOfAccounts.id, rec.contraAccountId));
      if (c) { customerAcctCode = c.code; customerAcctName = c.name; }
    } else {
      const [c2101] = await db.select({ code: chartOfAccounts.code, name: chartOfAccounts.name })
        .from(chartOfAccounts).where(eq(chartOfAccounts.code, '2101'));
      if (c2101) { customerAcctCode = c2101.code; customerAcctName = c2101.name; }
    }

    const [cust] = rec.customerId
      ? await db.select({ fullName: customers.fullName }).from(customers).where(eq(customers.id, rec.customerId))
      : [undefined];
    const custName = cust?.fullName ?? 'Customer';

    // ── Build JE lines ────────────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const ref   = rec.recordNumber;
    const lines: InsertJournalEntryLine[] = [];
    let   lineNum = 1;
    let   projectedProfit = 0;
    let   feeBreakdown: FeeBreakdown | null = null;

    const addLine = (code: string, name: string, dr: number, cr: number, desc: string, pId?: string, pName?: string) => {
      if (dr <= 0 && cr <= 0) return;
      lines.push({
        journalEntryId: '',
        lineNumber:     lineNum++,
        accountCode:    code,
        accountName:    name,
        description:    desc,
        debitAmount:    dr > 0 ? dr.toFixed(4) : '0.0000',
        creditAmount:   cr > 0 ? cr.toFixed(4) : '0.0000',
        currency:       'USD',
        exchangeRate:   '1',
        debitBase:      dr > 0 ? dr.toFixed(4) : '0.0000',
        creditBase:     cr > 0 ? cr.toFixed(4) : '0.0000',
        partyId:        pId,
        partyName:      pName,
      });
    };

    const MIN_INCOME_USD = 1.0;

    if (rec.type === 'cash') {
      if (rec.direction === 'inflow') {
        // Customer always receives exactly what the exec rate promises
        const customerActual = amount / execBuyRate;
        // Spread = bank proceeds − customer credit (positive = profit, negative = loss)
        const spreadUsd      = suspenseAmount - customerActual;
        projectedProfit = spreadUsd;
        feeBreakdown = { principalUsd: suspenseAmount, serviceFeeUsd: 0, networkFeeUsd: 0, effectiveFeeRate: 0, spreadUsd, spreadRate: suspenseAmount > 0 ? (spreadUsd / suspenseAmount) * 100 : 0, clientLiabilityUsd: customerActual };

        addLine('2101', 'Customer Credits - Unmatched',
          suspenseAmount, 0, `[CONFIRM-CLR] Clear suspense — ${ref}`);
        if (spreadUsd < -0.0001) {
          // Negative spread: exec rate is more favorable to customer than bank rate → loss
          addLine('4201', 'FX Spread Income', Math.abs(spreadUsd), 0,
            `[P&L] FX spread loss (bank ${acctBuyRate} vs exec ${execBuyRate}) — ${ref}`);
        }
        addLine(customerAcctCode, customerAcctName,
          0, customerActual, `[CONFIRM] Net to customer (exec rate ${execBuyRate} ${acctCurrency}/$) — ${ref} | ${custName}`,
          rec.customerId ?? undefined, custName);
        if (spreadUsd > 0.0001) {
          addLine('4201', 'FX Spread Income', 0, spreadUsd,
            `[P&L] FX spread (bank ${acctBuyRate} vs exec ${execBuyRate}) — ${ref}`);
        }
      } else {
        // Customer is always charged exactly what the exec rate dictates
        const customerChargeUsd = amount / execSellRate;
        // Spread = client charge − bank cost (positive = profit, negative = loss)
        const spreadUsd         = customerChargeUsd - suspenseAmount;
        projectedProfit = spreadUsd;
        feeBreakdown = { principalUsd: suspenseAmount, serviceFeeUsd: 0, networkFeeUsd: 0, effectiveFeeRate: 0, spreadUsd, spreadRate: suspenseAmount > 0 ? (spreadUsd / suspenseAmount) * 100 : 0, clientLiabilityUsd: customerChargeUsd };

        addLine(customerAcctCode, customerAcctName,
          customerChargeUsd, 0, `[CONFIRM] Customer charge (exec rate ${execSellRate} ${acctCurrency}/$) — ${ref} | ${custName}`,
          rec.customerId ?? undefined, custName);
        addLine('2101', 'Customer Credits - Unmatched',
          0, suspenseAmount, `[CONFIRM-CLR] Clear suspense — ${ref}`);
        if (spreadUsd > 0.0001) {
          addLine('4201', 'FX Spread Income', 0, spreadUsd,
            `[P&L] FX spread (exec ${execSellRate} vs bank ${acctSellRate}) — ${ref}`);
        }
        if (spreadUsd < -0.0001) {
          // Negative spread: exec rate is more favorable to customer than bank rate → loss
          addLine('4201', 'FX Spread Income', Math.abs(spreadUsd), 0,
            `[P&L] FX spread loss (exec ${execSellRate} vs bank ${acctSellRate}) — ${ref}`);
        }
      }
    } else {
      // Crypto: USDT always 1:1 USD
      // Per-record serviceFeeRate overrides provider default if explicitly set (even to 0)
      const rawRecFeeRate = (rec as any).serviceFeeRate;
      const hasOverride   = rawRecFeeRate != null && rawRecFeeRate !== '';
      const recFeeRate    = hasOverride ? parseFloat(String(rawRecFeeRate)) : NaN;
      const effectiveWithdrawFee = hasOverride && !isNaN(recFeeRate) ? recFeeRate : withdrawFeeRate;
      const effectiveDepositFee  = hasOverride && !isNaN(recFeeRate) ? recFeeRate : depositFeeRate;

      if (rec.direction === 'inflow') {
        const feePct         = effectiveWithdrawFee / 100;
        const rawFeeUsd      = amount * feePct;
        const feeUsd         = rawFeeUsd > 0 && rawFeeUsd < MIN_INCOME_USD ? MIN_INCOME_USD : rawFeeUsd;
        const customerNet    = Math.max(0, suspenseAmount - feeUsd);
        projectedProfit = feeUsd;
        feeBreakdown = { principalUsd: suspenseAmount, serviceFeeUsd: feeUsd, networkFeeUsd: 0, effectiveFeeRate: effectiveWithdrawFee, spreadUsd: 0, spreadRate: 0, clientLiabilityUsd: customerNet };

        addLine('2101', 'Customer Credits - Unmatched',
          suspenseAmount, 0, `[CONFIRM-CLR] Clear suspense — ${ref}`);
        addLine(customerAcctCode, customerAcctName,
          0, customerNet > 0 ? customerNet : suspenseAmount,
          `[CONFIRM] Net to customer (after ${effectiveWithdrawFee}% fee, min $${MIN_INCOME_USD}) — ${ref} | ${custName}`,
          rec.customerId ?? undefined, custName);
        if (feeUsd > 0.0001) {
          addLine('4101', 'Service Fee Income', 0, feeUsd,
            `[P&L] Withdraw fee ${effectiveWithdrawFee}% (min $${MIN_INCOME_USD}) — ${ref}`);
        }
      } else {
        const feePct          = effectiveDepositFee / 100;
        const rawFeeUsd       = amount * feePct;
        const feeUsd          = rawFeeUsd > 0 && rawFeeUsd < MIN_INCOME_USD ? MIN_INCOME_USD : rawFeeUsd;
        const netFee          = networkFeeUsd;
        const customerCharge  = suspenseAmount + feeUsd + netFee;
        projectedProfit = feeUsd + netFee;
        feeBreakdown = { principalUsd: suspenseAmount, serviceFeeUsd: feeUsd, networkFeeUsd: netFee, effectiveFeeRate: effectiveDepositFee, spreadUsd: 0, spreadRate: 0, clientLiabilityUsd: customerCharge };

        addLine(customerAcctCode, customerAcctName,
          customerCharge, 0,
          `[CONFIRM] Customer charge (${rec.currency} + ${effectiveDepositFee}% min $${MIN_INCOME_USD} + $${netFee} gas) — ${ref} | ${custName}`,
          rec.customerId ?? undefined, custName);
        addLine('2101', 'Customer Credits - Unmatched',
          0, suspenseAmount, `[CONFIRM-CLR] Clear suspense — ${ref}`);
        if (feeUsd  > 0.0001) addLine('4101', 'Service Fee Income',   0, feeUsd,  `[P&L] Deposit fee ${effectiveDepositFee}% (min $${MIN_INCOME_USD}) — ${ref}`);
        if (netFee  > 0.0001) addLine('4301', 'Network Fee Recovery', 0, netFee,  `[P&L] Network fee — ${ref}`);
      }
    }

    // ── Supplier Expense (5201) — applies to ALL record types ────────────────
    // DR 5201 Supplier Exchange Expense (recognise cost)
    // CR Customer Liability (reduces what we owe the customer — they bear the expense)
    const supplierExpenseUsd = parseFloat(String((rec as any).expenseUsd ?? '0'));
    if (supplierExpenseUsd > 0.0001) {
      addLine('5201', 'Supplier Exchange Expense', supplierExpenseUsd, 0,
        `[P&L] Supplier expense — ${ref}`);
      addLine(customerAcctCode, customerAcctName, 0, supplierExpenseUsd,
        `[P&L] Expense charged to customer liability — ${ref}`, rec.customerId ?? undefined, custName);
      projectedProfit -= supplierExpenseUsd;
    }

    if (lines.length < 2) throw new Error('Journal entry requires at least 2 lines.');

    // ── Preview mode: return projected lines without posting ─────────────────
    if (!post) {
      return {
        lines: lines.map(l => ({
          accountCode:  l.accountCode,
          accountName:  l.accountName,
          description:  l.description,
          debitAmount:  l.debitAmount,
          creditAmount: l.creditAmount,
        })),
        projectedProfit,
      };
    }

    // ── Post mode: create & post JE atomically ────────────────────────────────
    const entryData: InsertJournalEntry = {
      periodId:     period!.id,
      entryDate:    today,
      description:  `[CONFIRM] ${rec.direction.toUpperCase()} ${rec.type.toUpperCase()} — ${ref} | ${custName}`,
      status:       'draft',
      sourceType:   'record_confirm',
      sourceId:     rec.id,
      baseCurrency: 'USD',
    };
    // createJournalEntry already auto-posts when debits == credits and postedBy is provided.
    // Calling postJournalEntry again would throw "Only draft entries can be posted".
    const { entry } = await this.createJournalEntry(entryData, lines, postedBy);
    return { entry, feeBreakdown };
  }

  // Fires when a record is cancelled: reverses the original record-level JE and any matching JE.
  async reverseRecordJournalEntry(recordId: string, postedBy: string): Promise<JournalEntry | undefined> {
    const period = await this.getOpenPeriod();
    if (!period) throw new Error('No open accounting period for reversal.');

    const today = new Date().toISOString().slice(0, 10);

    const reverseJE = async (origJEId: string, origDescription: string, sourceId: string) => {
      const origResult = await this.getJournalEntryWithLines(origJEId);
      if (!origResult) return undefined;
      const reversalLines: InsertJournalEntryLine[] = origResult.lines.map((l, i) => ({
        journalEntryId: '',
        lineNumber:     i + 1,
        accountCode:    l.accountCode,
        accountName:    l.accountName ?? '',
        description:    `[REVERSAL] ${l.description ?? ''}`,
        debitAmount:    l.creditAmount ?? '0.0000',
        creditAmount:   l.debitAmount  ?? '0.0000',
        currency:       l.currency     ?? 'USD',
        exchangeRate:   l.exchangeRate  ?? '1',
        debitBase:      l.creditBase   ?? '0.0000',
        creditBase:     l.debitBase    ?? '0.0000',
        partyId:        l.partyId      ?? undefined,
        partyName:      l.partyName    ?? undefined,
      }));
      const entryData: InsertJournalEntry = {
        periodId:     period.id,
        entryDate:    today,
        description:  `[REVERSAL] ${origDescription}`,
        status:       'draft',
        sourceType:   'record',
        sourceId,
        baseCurrency: 'USD',
      };
      const { entry } = await this.createJournalEntry(entryData, reversalLines, postedBy);
      if (entry && reversalLines.length >= 2) {
        try { await this.postJournalEntry(entry.id, postedBy); } catch { /* leave draft */ }
      }
      return entry;
    };

    // Find and reverse the original record JE
    const [origJE] = await db.select({ id: journalEntries.id, description: journalEntries.description })
      .from(journalEntries)
      .where(and(eq(journalEntries.sourceType, 'record'), eq(journalEntries.sourceId, recordId)));
    if (!origJE) return undefined; // No JE to reverse — record was never journalized

    const mainReversal = await reverseJE(origJE.id, origJE.description ?? '', `${recordId}_reversal`);

    // Also reverse the confirmation JE if it exists (for confirmed records being cancelled)
    const [confirmJE] = await db.select({ id: journalEntries.id, description: journalEntries.description })
      .from(journalEntries)
      .where(and(eq(journalEntries.sourceType, 'record_confirm'), eq(journalEntries.sourceId, recordId)));
    if (confirmJE) {
      await reverseJE(confirmJE.id, confirmJE.description ?? '', `${recordId}_confirm_reversal`);
    }

    // Also reverse any legacy matching JE (pre-delayed-journaling records)
    const [matchJE] = await db.select({ id: journalEntries.id, description: journalEntries.description })
      .from(journalEntries)
      .where(and(eq(journalEntries.sourceType, 'record_match'), eq(journalEntries.sourceId, recordId)));
    if (matchJE) {
      await reverseJE(matchJE.id, matchJE.description ?? '', `${recordId}_match_reversal`);
    }

    return mainReversal;
  }

  // ─── Crypto Networks ───────────────────────────────────────────────────────
  async getAllCryptoNetworks(includeInactive = false) {
    let q = db.select().from(cryptoNetworks).$dynamic();
    if (!includeInactive) q = q.where(eq(cryptoNetworks.isActive, true));
    return q.orderBy(cryptoNetworks.sortOrder, cryptoNetworks.code);
  }
  async getCryptoNetwork(id: string) {
    const [n] = await db.select().from(cryptoNetworks).where(eq(cryptoNetworks.id, id));
    return n;
  }
  async getCryptoNetworkByCode(code: string) {
    const [n] = await db.select().from(cryptoNetworks).where(eq(cryptoNetworks.code, code));
    return n;
  }
  async createCryptoNetwork(data: InsertCryptoNetwork) {
    const [n] = await db.insert(cryptoNetworks).values(data).returning();
    return n;
  }
  async updateCryptoNetwork(id: string, updates: Partial<InsertCryptoNetwork>) {
    const [n] = await db.update(cryptoNetworks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(cryptoNetworks.id, id)).returning();
    return n;
  }
  async deleteCryptoNetwork(id: string) {
    await db.delete(cryptoNetworks).where(eq(cryptoNetworks.id, id));
  }

  // ─── Providers ─────────────────────────────────────────────────────────────
  async getAllProviders(filters?: { isActive?: boolean }) {
    let q = db.select().from(providers).$dynamic();
    if (filters?.isActive !== undefined) q = q.where(eq(providers.isActive, filters.isActive));
    return q.orderBy(providers.name);
  }
  async getProvider(id: string) {
    const [p] = await db.select().from(providers).where(eq(providers.id, id));
    return p;
  }
  async createProvider(data: InsertProvider, createdBy?: string) {
    const [p] = await db.insert(providers).values({ ...data, createdBy: createdBy ?? null }).returning();
    return p;
  }
  async updateProvider(id: string, updates: Partial<InsertProvider>) {
    const [p] = await db.update(providers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(providers.id, id)).returning();
    return p;
  }
  async deleteProvider(id: string) {
    await db.delete(providers).where(eq(providers.id, id));
  }

  // ─── Watched Wallets ───────────────────────────────────────────────────────
  async getAllWatchedWallets() {
    return db.select().from(watchedWallets).orderBy(desc(watchedWallets.createdAt));
  }
  async getWatchedWallet(id: string) {
    const [w] = await db.select().from(watchedWallets).where(eq(watchedWallets.id, id));
    return w;
  }
  async createWatchedWallet(data: InsertWatchedWallet, createdBy?: string) {
    const [w] = await db.insert(watchedWallets)
      .values({ ...data, createdBy: createdBy ?? null })
      .returning();
    return w;
  }
  async updateWatchedWallet(id: string, updates: Partial<WatchedWallet>) {
    const [w] = await db.update(watchedWallets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(watchedWallets.id, id))
      .returning();
    return w;
  }
  async deleteWatchedWallet(id: string) {
    await db.delete(watchedWallets).where(eq(watchedWallets.id, id));
  }

  // ─── Transaction Entries ───────────────────────────────────────────────────
  async getTransactionEntries(transactionId: string) {
    return db.select().from(transactionEntries)
      .where(eq(transactionEntries.transactionId, transactionId))
      .orderBy(transactionEntries.createdAt);
  }
  async createTransactionEntry(entry: InsertTransactionEntry) {
    const [created] = await db.insert(transactionEntries).values(entry).returning();
    return created;
  }
  async deleteTransactionEntry(id: string) {
    await db.delete(transactionEntries).where(eq(transactionEntries.id, id));
  }

  // ─── Compliance Alerts ─────────────────────────────────────────────────────
  async getAllComplianceAlerts(filters?: { status?: string; severity?: string; alertType?: string; customerId?: string }) {
    let q = db.select().from(complianceAlerts).$dynamic();
    const conds = [];
    if (filters?.status)     conds.push(eq(complianceAlerts.status, filters.status as any));
    if (filters?.severity)   conds.push(eq(complianceAlerts.severity, filters.severity as any));
    if (filters?.alertType)  conds.push(eq(complianceAlerts.alertType, filters.alertType as any));
    if (filters?.customerId) conds.push(eq(complianceAlerts.customerId, filters.customerId));
    if (conds.length) q = q.where(and(...conds));
    return q.orderBy(desc(complianceAlerts.createdAt));
  }
  async getComplianceAlert(id: string) {
    const [a] = await db.select().from(complianceAlerts).where(eq(complianceAlerts.id, id));
    return a;
  }
  async createComplianceAlert(alert: InsertComplianceAlert) {
    const [created] = await db.insert(complianceAlerts).values(alert).returning();
    return created;
  }
  async updateComplianceAlert(id: string, updates: Partial<ComplianceAlert>) {
    const [updated] = await db.update(complianceAlerts)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(complianceAlerts.id, id)).returning();
    return updated;
  }
  async getOpenCriticalAlertCount() {
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(complianceAlerts)
      .where(and(
        eq(complianceAlerts.status, "open"),
        eq(complianceAlerts.severity, "critical")
      ));
    return Number(result?.count ?? 0);
  }

  // ─── System Variables ──────────────────────────────────────────────────────
  async getAllSystemVariables(category?: string) {
    if (category) {
      return db.select().from(systemVariables)
        .where(eq(systemVariables.category, category))
        .orderBy(systemVariables.sortOrder, systemVariables.key);
    }
    return db.select().from(systemVariables)
      .orderBy(systemVariables.category, systemVariables.sortOrder, systemVariables.key);
  }
  async getSystemVariable(key: string) {
    const [v] = await db.select().from(systemVariables).where(eq(systemVariables.key, key));
    return v;
  }
  async upsertSystemVariable(data: InsertSystemVariable) {
    const [result] = await db
      .insert(systemVariables)
      .values({ ...data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: systemVariables.key,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return result;
  }
  async deleteSystemVariable(key: string) {
    await db.delete(systemVariables).where(eq(systemVariables.key, key));
  }

  // ─── Customer Groups ───────────────────────────────────────────────────────
  async getAllCustomerGroups() {
    return db.select().from(customerGroups).orderBy(customerGroups.name);
  }
  async getCustomerGroup(id: string) {
    const [g] = await db.select().from(customerGroups).where(eq(customerGroups.id, id));
    return g;
  }
  async createCustomerGroup(data: InsertCustomerGroup, createdBy?: string) {
    const [g] = await db.insert(customerGroups).values({ ...data, createdBy, updatedAt: new Date() }).returning();
    return g;
  }
  async updateCustomerGroup(id: string, updates: Partial<InsertCustomerGroup>) {
    const [g] = await db.update(customerGroups)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customerGroups.id, id))
      .returning();
    return g;
  }
  async deleteCustomerGroup(id: string) {
    await db.delete(customerGroups).where(eq(customerGroups.id, id));
  }

  // ─── Customer Follow-ups ───────────────────────────────────────────────────
  async getAllFollowUps(filters?: { customerId?: string; status?: string; assignedTo?: string }) {
    const conditions = [];
    if (filters?.customerId) conditions.push(eq(customerFollowUps.customerId, filters.customerId));
    if (filters?.status)     conditions.push(eq(customerFollowUps.status, filters.status as any));
    if (filters?.assignedTo) conditions.push(eq(customerFollowUps.assignedTo, filters.assignedTo));
    const query = db.select().from(customerFollowUps);
    if (conditions.length) return query.where(and(...conditions)).orderBy(desc(customerFollowUps.createdAt));
    return query.orderBy(desc(customerFollowUps.createdAt));
  }
  async getFollowUp(id: string) {
    const [f] = await db.select().from(customerFollowUps).where(eq(customerFollowUps.id, id));
    return f;
  }
  async createFollowUp(data: InsertCustomerFollowUp, createdBy?: string) {
    const [f] = await db.insert(customerFollowUps).values({ ...data, createdBy, updatedAt: new Date() }).returning();
    return f;
  }
  async updateFollowUp(id: string, updates: Partial<InsertCustomerFollowUp & { completedAt?: Date | null }>) {
    const [f] = await db.update(customerFollowUps)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customerFollowUps.id, id))
      .returning();
    return f;
  }
  async deleteFollowUp(id: string) {
    await db.delete(customerFollowUps).where(eq(customerFollowUps.id, id));
  }

  // ─── SMS Webhook Configs ──────────────────────────────────────────────────
  async getAllSmsWebhookConfigs() {
    return db.select().from(smsWebhookConfigs).orderBy(desc(smsWebhookConfigs.createdAt));
  }
  async getSmsWebhookConfig(id: string) {
    const [c] = await db.select().from(smsWebhookConfigs).where(eq(smsWebhookConfigs.id, id));
    return c;
  }
  async getSmsWebhookConfigBySlug(slug: string) {
    const [c] = await db.select().from(smsWebhookConfigs).where(eq(smsWebhookConfigs.slug, slug));
    return c;
  }
  async createSmsWebhookConfig(data: InsertSmsWebhookConfig) {
    const [c] = await db.insert(smsWebhookConfigs).values(data).returning();
    return c;
  }
  async updateSmsWebhookConfig(id: string, updates: Partial<InsertSmsWebhookConfig>) {
    const [c] = await db.update(smsWebhookConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(smsWebhookConfigs.id, id))
      .returning();
    return c;
  }
  async deleteSmsWebhookConfig(id: string) {
    await db.delete(smsParsingRules).where(eq(smsParsingRules.configId, id));
    await db.delete(smsWebhookConfigs).where(eq(smsWebhookConfigs.id, id));
  }

  // ─── SMS Parsing Rules ────────────────────────────────────────────────────
  async getSmsParsingRules(configId: string) {
    return db.select().from(smsParsingRules)
      .where(eq(smsParsingRules.configId, configId))
      .orderBy(smsParsingRules.sortOrder);
  }
  async createSmsParsingRule(data: InsertSmsParsingRule) {
    const [r] = await db.insert(smsParsingRules).values(data).returning();
    return r;
  }
  async updateSmsParsingRule(id: string, updates: Partial<InsertSmsParsingRule>) {
    const [r] = await db.update(smsParsingRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(smsParsingRules.id, id))
      .returning();
    return r;
  }
  async deleteSmsParsingRule(id: string) {
    await db.delete(smsParsingRules).where(eq(smsParsingRules.id, id));
  }

  // ─── SMS Webhook Logs ─────────────────────────────────────────────────────
  async getSmsWebhookLogs(filters?: { configId?: string; status?: string; limit?: number }) {
    let query = db.select().from(smsWebhookLogs).$dynamic();
    const conditions = [];
    if (filters?.configId) conditions.push(eq(smsWebhookLogs.configId, filters.configId));
    if (filters?.status) conditions.push(eq(smsWebhookLogs.status, filters.status));
    if (conditions.length > 0) query = query.where(and(...conditions));
    query = query.orderBy(desc(smsWebhookLogs.createdAt));
    if (filters?.limit) query = query.limit(filters.limit);
    return query;
  }
  async createSmsWebhookLog(data: Partial<SmsWebhookLog> & { rawMessage: string }) {
    const [log] = await db.insert(smsWebhookLogs).values(data as any).returning();
    return log;
  }

  // ─── SMS Raw Inbox ─────────────────────────────────────────────────────────
  // Helper: extract text between two boundary strings (case-insensitive)
  private _extractBetween(text: string, afterStr: string, beforeStr: string): string | null {
    const lower = text.toLowerCase();
    const aLower = afterStr.toLowerCase();
    const bLower = beforeStr.toLowerCase();
    const start = lower.indexOf(aLower);
    if (start === -1) return null;
    const from = start + aLower.length;
    const end = lower.indexOf(bLower, from);
    if (end === -1) return null;
    return text.slice(from, end) || null;
  }

  async getSmsRawInbox(filters?: { status?: string; configId?: string; limit?: number }) {
    let query = db.select().from(smsRawInbox).$dynamic();
    const conditions = [];
    if (filters?.status) conditions.push(eq(smsRawInbox.status, filters.status));
    if (filters?.configId) conditions.push(eq(smsRawInbox.configId, filters.configId));
    if (conditions.length > 0) query = query.where(and(...conditions));
    query = query.orderBy(desc(smsRawInbox.receivedAt));
    if (filters?.limit) query = query.limit(filters.limit);
    return query;
  }

  async findSmsRawInboxDuplicate(slug: string, rawMessage: string): Promise<SmsRawInbox | null> {
    // Check for identical message text from the same endpoint on the same calendar day (UTC)
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setUTCHours(23, 59, 59, 999);

    const [existing] = await db.select().from(smsRawInbox).where(
      and(
        eq(smsRawInbox.slug, slug),
        eq(smsRawInbox.rawMessage, rawMessage),
        gte(smsRawInbox.receivedAt, dayStart),
        lte(smsRawInbox.receivedAt, dayEnd),
      )
    ).limit(1);
    return existing ?? null;
  }

  async createSmsRawInboxEntry(data: Omit<InsertSmsRawInbox, 'status'>) {
    const [entry] = await db.insert(smsRawInbox).values({ ...data, status: 'pending' } as any).returning();
    return entry;
  }

  async processSmsRawInboxEntry(id: string): Promise<SmsRawInbox> {
    const [entry] = await db.select().from(smsRawInbox).where(eq(smsRawInbox.id, id));
    if (!entry) throw new Error(`Inbox entry ${id} not found`);
    if (entry.status === 'done') return entry; // already processed

    try {
      // Resolve config
      const config = entry.configId
        ? await this.getSmsWebhookConfig(entry.configId)
        : await this.getSmsWebhookConfigBySlug(entry.slug);

      if (!config || !config.isActive) {
        const [updated] = await db.update(smsRawInbox)
          .set({ status: 'failed', errorMessage: 'Config not found or inactive', processedAt: new Date() })
          .where(eq(smsRawInbox.id, id)).returning();
        return updated;
      }

      // Run parsing rules
      const rules = await this.getSmsParsingRules(config.id);
      const activeRules = rules.filter(r => r.isActive);

      let parsed: { client: string; amount: string; direction: string; ruleId: string } | null = null;
      for (const rule of activeRules) {
        const client = this._extractBetween(entry.rawMessage, rule.clientAfterString, rule.clientBeforeString);
        const amountRaw = this._extractBetween(entry.rawMessage, rule.amountAfterString, rule.amountBeforeString);
        if (client && amountRaw) {
          const cleanAmount = amountRaw.replace(/[^\d.]/g, '');
          if (cleanAmount && parseFloat(cleanAmount) > 0) {
            parsed = { client: client.trim(), amount: cleanAmount, direction: rule.direction, ruleId: rule.id };
            break;
          }
        }
      }

      if (!parsed) {
        const [updated] = await db.update(smsRawInbox)
          .set({ status: 'failed', errorMessage: 'No rule could extract client+amount', processedAt: new Date() })
          .where(eq(smsRawInbox.id, id)).returning();
        return updated;
      }

      // Auto-match customer — pass accountId so tiebreaker can use account history
      const match = await this.autoMatchCustomer(parsed.client, config.accountId);

      // Create record
      const isInflow = parsed.direction === 'inflow';
      const record = await this.createRecord({
        type: 'cash',
        direction: parsed.direction as any,
        source: 'sms_webhook',
        recordMethod: 'auto',
        endpointName: config.slug,
        accountId: config.accountId,
        accountName: config.accountName,
        accountCurrency: config.currency,
        amount: parsed.amount,
        currency: config.currency,
        customerId: match?.customer.id ?? undefined,
        clientName: match?.customer.fullName ?? undefined,
        clientSenderName: isInflow ? parsed.client : undefined,
        clientRecipientName: !isInflow ? parsed.client : undefined,
        clientMatchMethod: match?.method ?? undefined,
        endpointText: entry.rawMessage,
        processingStage: match ? 'matched' : 'recorded',
        matchedBy: match ? 'sms_auto' : undefined,
        contraAccountId: undefined,
        contraAccountName: match
          ? `Customer Balance — ${match.customer.fullName} (${match.customer.customerId})`
          : 'Customer Credits - Unmatched',
      } as any, 'system');

      // Generate journal entry
      try { await this.generateRecordJournalEntry(record.id); } catch (_) {}

      // Update inbox entry to done
      const [updated] = await db.update(smsRawInbox).set({
        status: 'done',
        ruleId: parsed.ruleId,
        parsedClient: parsed.client,
        parsedAmount: parsed.amount,
        parsedDirection: parsed.direction,
        matchedCustomerId: match?.customer.id ?? null,
        matchMethod: match?.method ?? null,
        matchScore: match?.score ?? null,
        recordId: record.id,
        processedAt: new Date(),
      }).where(eq(smsRawInbox.id, id)).returning();

      return updated;
    } catch (err: any) {
      const [updated] = await db.update(smsRawInbox)
        .set({ status: 'failed', errorMessage: err.message, processedAt: new Date() })
        .where(eq(smsRawInbox.id, id)).returning();
      return updated;
    }
  }

  async processAllPendingSmsInbox(configId?: string) {
    const conditions = [eq(smsRawInbox.status, 'pending')];
    if (configId) conditions.push(eq(smsRawInbox.configId, configId));
    const pending = await db.select().from(smsRawInbox).where(and(...conditions));

    let succeeded = 0;
    let failed = 0;
    for (const entry of pending) {
      const result = await this.processSmsRawInboxEntry(entry.id);
      if (result.status === 'done') succeeded++;
      else failed++;
    }
    return { processed: pending.length, succeeded, failed };
  }

  async deleteSmsRawInboxEntry(id: string) {
    await db.delete(smsRawInbox).where(eq(smsRawInbox.id, id));
  }

  // ─── Customer Auto-Matching Engine ────────────────────────────────────────
  //
  //  Input patterns handled:
  //    • Phone only           → "967771234567" or "+967 771 234 567"
  //    • Name + phone         → "فارس 967771234567"
  //    • Full name (4 parts)  → "محمد علي عبدالله الحرازي"
  //    • First + second       → "فارس يحيى"   (may be truncated from front)
  //    • First + last         → "فارس احمد"   (non-consecutive)
  //    • Single first name    → "فارس"         (needs uniqueness / history tiebreaker)
  //
  //  Scoring (all candidates evaluated, best wins with ambiguity guard):
  //    P1  Phone exact / suffix           → 100 / 92
  //    N1  Full name exact (normalized)   → 100
  //    N2  Linear token subsequence       → 95   ← primary rule for truncated names
  //    N3  First + last (different tokens)→ 88
  //    N4  All input tokens in name       → 80
  //    N5  Weighted partial (≥2, ≥60%)   → 55–69
  //    N6  Single token, unique in system → 72
  //
  //  Ambiguity / tiebreaker (when top–second < 15 pts):
  //    T1  Only customer who used this account → score kept, label updated
  //    T2  Most recently used this account     → score –5
  //    T3  Most recently active overall        → score –8
  //    T4  Still ambiguous → return null (human review)
  //
  async autoMatchCustomer(
    clientString: string,
    accountId?: string,
  ): Promise<{ customer: Customer; method: string; score: number } | null> {
    if (!clientString || clientString.trim().length < 2) return null;
    const input = clientString.trim();

    // ── Arabic normalization ─────────────────────────────────────────────────
    const norm = (s: string) =>
      s.trim()
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // strip harakat + tatweel
        .replace(/[أإآٱ]/g, 'ا')                     // alef variants → plain alef
        .replace(/ة/g, 'ه')                           // ta marbuta → ha
        .replace(/ى/g, 'ي')                           // alef maqsura → ya
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();

    const normalizePhone = (p: string) => p.replace(/\D/g, '');

    const inputNorm   = norm(input);
    // Name tokens: ≥3 chars, non-digit words only
    const inputTokens = inputNorm.split(/\s+/).filter(t => t.length >= 3 && !/^\d+$/.test(t));

    // Extract Yemeni phone embedded in input (7xxxxxxxxx or 9677xxxxxxxxx)
    const phoneMatch   = input.match(/(?:\+?967\s*)?([7][0-9]{8})/);
    const embeddedPhone = phoneMatch ? normalizePhone(phoneMatch[0]) : null;
    const bareInput    = normalizePhone(input);
    const isPhoneOnly  = /^\d{7,}$/.test(bareInput) && inputTokens.length === 0;

    const allCustomers = await db.select().from(customers)
      .where(eq(customers.customerStatus, 'active'));
    if (allCustomers.length === 0) return null;

    interface Candidate { customer: Customer; score: number; method: string; }
    const candidates: Candidate[] = [];

    for (const c of allCustomers) {
      const primaryPhone    = normalizePhone(c.phonePrimary ?? '');
      const secondaryPhones = (Array.isArray(c.phoneSecondary) ? c.phoneSecondary : [])
        .map((p: any) => normalizePhone(String(p)));
      const allPhones = [primaryPhone, ...secondaryPhones].filter(Boolean);

      // ── P1: Phone match ──────────────────────────────────────────────────
      const phoneToCheck = embeddedPhone ?? (isPhoneOnly ? bareInput : null);
      if (phoneToCheck && phoneToCheck.length >= 8) {
        const sfx = phoneToCheck.slice(-8);
        if (allPhones.some(p => p.slice(-8) === sfx)) {
          const exact = allPhones.some(p =>
            p === phoneToCheck ||
            p === `967${phoneToCheck}` ||
            `967${p}` === phoneToCheck
          );
          candidates.push({
            customer: c,
            score:  exact ? 100 : 92,
            method: exact ? 'Phone number (exact)' : 'Phone number (suffix match)',
          });
          continue;
        }
      }

      const custFull   = norm(c.fullName   ?? '');
      const custFn     = norm(c.firstName  ?? '');
      const custLn     = norm(c.lastName   ?? '');
      const custTokens = custFull.split(/\s+/).filter(t => t.length >= 3);
      if (custTokens.length === 0) continue;

      // ── N1: Exact normalized full name ───────────────────────────────────
      if (inputTokens.length >= 2 && inputNorm === custFull && custFull.length >= 4) {
        candidates.push({ customer: c, score: 100, method: 'Full name (exact)' });
        continue;
      }

      // ── N2: Linear contiguous subsequence (IN ORDER) ────────────────────
      // Handles names truncated from the front (bank cuts first 1–2 parts).
      // e.g. input ["فارس","يحيى"] inside cust ["محمد","فارس","يحيى","احمد"]
      if (inputTokens.length >= 2) {
        const seqLen = inputTokens.length;
        let lin = false;
        for (let i = 0; i <= custTokens.length - seqLen; i++) {
          if (inputTokens.every((t, j) => custTokens[i + j] === t)) { lin = true; break; }
        }
        if (lin) {
          candidates.push({ customer: c, score: 95, method: 'Name in order (truncated OK)' });
          continue;
        }
      }

      // ── N3: First + Last (different tokens, each ≥3 chars) ──────────────
      // Guard: if fn===ln it degenerates to a single-token match — skip.
      if (inputTokens.length >= 2 &&
          custFn.length >= 3 && custLn.length >= 3 && custFn !== custLn &&
          inputTokens.includes(custFn) && inputTokens.includes(custLn)) {
        candidates.push({ customer: c, score: 88, method: 'First + last name' });
        continue;
      }

      // ── N4: All input tokens found anywhere in customer name ─────────────
      if (inputTokens.length >= 2 && inputTokens.every(t => custTokens.includes(t))) {
        candidates.push({ customer: c, score: 80, method: 'All name parts matched' });
        continue;
      }

      // ── N5: Weighted partial (≥2 matched tokens, ≥60% coverage) ─────────
      if (inputTokens.length >= 2) {
        const matched  = inputTokens.filter(t => custTokens.includes(t));
        if (matched.length >= 2) {
          const ws = matched.reduce((s, t) => s + Math.min(t.length, 8), 0);
          const wt = inputTokens.reduce((s, t) => s + Math.min(t.length, 8), 0);
          if (matched.length / inputTokens.length >= 0.6 && wt > 0) {
            const sc = Math.round((ws / wt) * 69);
            if (sc >= 55) {
              candidates.push({ customer: c, score: sc, method: 'Partial name match (weighted)' });
            }
          }
        }
      }

      // ── N6: Single token — only if it appears in this customer's name ────
      // Scored separately below after uniqueness count is known.
      // (We collect them and score after the loop.)
    }

    // ── N6: Single-token name (first name only etc.) ────────────────────────
    // Only attempt if no multi-token candidates exist yet — avoids polluting
    // the candidate list when we already have high-confidence matches.
    if (inputTokens.length === 1 && candidates.length === 0) {
      const tok = inputTokens[0];
      const singleMatches = allCustomers.filter(c => {
        const custFull = norm(c.fullName ?? '');
        return custFull.split(/\s+/).includes(tok);
      });
      if (singleMatches.length === 1) {
        // Unique in the entire system → moderate confidence
        candidates.push({ customer: singleMatches[0], score: 72, method: 'First name (unique in system)' });
      } else if (singleMatches.length > 1) {
        // Not unique — add all at low score so tiebreaker can resolve
        for (const c of singleMatches) {
          candidates.push({ customer: c, score: 60, method: 'First name (needs account history)' });
        }
      }
    }

    if (candidates.length === 0) return null;

    // ── Ambiguity resolution ─────────────────────────────────────────────────
    candidates.sort((a, b) => b.score - a.score);
    const top    = candidates[0];
    const second = candidates[1];

    // Definitive matches (phone exact or full name exact) — never ambiguous
    if (top.score >= 100) {
      return { customer: top.customer, method: top.method, score: top.score };
    }

    // Single unambiguous winner above minimum threshold
    if (!second || (top.score - second.score) >= 15) {
      if (top.score >= 70) return { customer: top.customer, method: top.method, score: top.score };
      return null;
    }

    // ── Tiebreaker: multiple candidates within 15 points ────────────────────
    // Collect the tied group (all within 15 pts of the top score)
    const tiedGroup = candidates.filter(c => top.score - c.score < 15);

    return this._resolveMatchTiebreaker(tiedGroup, accountId);
  }

  // Tiebreaker: among equally-scored candidates, prefer the one who has
  // previously used this specific account, then the most recently active one.
  private async _resolveMatchTiebreaker(
    group: Array<{ customer: Customer; score: number; method: string }>,
    accountId?: string,
  ): Promise<{ customer: Customer; method: string; score: number } | null> {

    // ── T1/T2: Account-specific history ─────────────────────────────────────
    if (accountId) {
      interface WithTime { customer: Customer; score: number; method: string; lastAt: Date | null; }
      const withAccountHist: WithTime[] = [];

      for (const cand of group) {
        const [last] = await db
          .select({ createdAt: records.createdAt })
          .from(records)
          .where(and(
            eq(records.customerId, cand.customer.id),
            eq(records.accountId,  accountId),
          ))
          .orderBy(desc(records.createdAt))
          .limit(1);
        if (last) {
          withAccountHist.push({ ...cand, lastAt: last.createdAt });
        }
      }

      if (withAccountHist.length === 1) {
        // T1: Only one candidate has ever used this account — strong signal
        const w = withAccountHist[0];
        return {
          customer: w.customer,
          score:    w.score,
          method:   `${w.method} + only client for this account`,
        };
      }
      if (withAccountHist.length > 1) {
        // T2: Multiple have used the account — pick most recent
        withAccountHist.sort((a, b) =>
          new Date(b.lastAt!).getTime() - new Date(a.lastAt!).getTime()
        );
        const w = withAccountHist[0];
        return {
          customer: w.customer,
          score:    Math.max(w.score - 5, 65),
          method:   `${w.method} + most recent for this account`,
        };
      }
    }

    // ── T3: Most recently active overall (any record) ────────────────────────
    interface WithTime2 { customer: Customer; score: number; method: string; lastAt: Date | null; }
    const withActivity: WithTime2[] = [];

    for (const cand of group) {
      const [last] = await db
        .select({ createdAt: records.createdAt })
        .from(records)
        .where(eq(records.customerId, cand.customer.id))
        .orderBy(desc(records.createdAt))
        .limit(1);
      withActivity.push({ ...cand, lastAt: last?.createdAt ?? null });
    }

    const active = withActivity.filter(c => c.lastAt !== null);
    if (active.length >= 1) {
      active.sort((a, b) =>
        new Date(b.lastAt!).getTime() - new Date(a.lastAt!).getTime()
      );
      const w = active[0];
      // Only trust this tiebreaker if the score is already decent
      if (w.score >= 60) {
        return {
          customer: w.customer,
          score:    Math.max(w.score - 8, 60),
          method:   `${w.method} + most recently active`,
        };
      }
    }

    // ── T4: Truly ambiguous — leave for human review ─────────────────────────
    return null;
  }

  // ─── NOTIFICATION QUEUE & AUDIT LOG ─────────────────────────────────────────

  async getNotificationQueue(filters?: { status?: string; customerId?: string; limit?: number }) {
    const conditions = [];
    if (filters?.status) conditions.push(eq(notificationQueue.status, filters.status));
    if (filters?.customerId) conditions.push(eq(notificationQueue.customerId, filters.customerId));
    let query = db.select().from(notificationQueue).orderBy(desc(notificationQueue.createdAt)).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    if (filters?.limit) query = query.limit(filters.limit);
    return query;
  }

  async getNotificationAuditLog(filters?: { recordId?: string; customerId?: string; limit?: number }) {
    const conditions = [];
    if (filters?.recordId) conditions.push(eq(notificationAuditLog.recordId, filters.recordId));
    if (filters?.customerId) conditions.push(eq(notificationAuditLog.customerId, filters.customerId));
    let query = db.select().from(notificationAuditLog).orderBy(desc(notificationAuditLog.createdAt)).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    if (filters?.limit) query = query.limit(filters.limit);
    return query;
  }

  async getNotificationStats() {
    const rows = await db.select({
      status: notificationQueue.status,
      count: sql<number>`count(*)::int`,
    }).from(notificationQueue).groupBy(notificationQueue.status);

    const stats: Record<string, number> = { queued: 0, processing: 0, sent: 0, failed: 0, dead: 0 };
    for (const r of rows) stats[r.status] = r.count;
    return stats;
  }

  async cancelNotification(id: string) {
    const [updated] = await db.update(notificationQueue)
      .set({ status: "dead", errorMessage: "Manually cancelled" })
      .where(and(
        eq(notificationQueue.id, id),
        or(eq(notificationQueue.status, "queued"), eq(notificationQueue.status, "failed"))
      ))
      .returning();
    return updated;
  }

  async retryNotification(id: string) {
    const [updated] = await db.update(notificationQueue)
      .set({ status: "queued", nextRetryAt: null, errorMessage: null })
      .where(and(
        eq(notificationQueue.id, id),
        or(eq(notificationQueue.status, "failed"), eq(notificationQueue.status, "dead"))
      ))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
