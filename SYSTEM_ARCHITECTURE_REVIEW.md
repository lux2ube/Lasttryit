# FOMS System Architecture Review & Future Roadmap

## Executive Summary
**FOMS** (Financial Operations Management System) is an enterprise-grade fintech platform for Coin Cash, a crypto exchange and Forex broker in Yemen/Gulf. Current implementation includes comprehensive operations, accounting, and compliance modules. This document reviews existing structure and recommends missing features + optimal organization.

---

## ✅ CURRENT SYSTEM STRENGTHS

### 1. **Robust Data Model**
- Double-entry accounting engine (IFRS/IAS 21 compliant)
- 40+ database tables with proper relational design
- JSONB flexibility for extensible metadata (risk limits, demographics, fee overrides)
- Immutable audit trails with hash chain verification
- Support for 20+ currencies & 6 blockchain networks

### 2. **Comprehensive Financial Engine**
- 5-stage record processing pipeline (draft → recorded → matched → confirmed → used)
- Automatic journal entry generation for all 4 record types (cash/crypto ± inflow/outflow)
- Service fee extraction (S-12), liquidity monitoring (S-08), structuring detection (S-10)
- Orphan record detection (S-15) running every 15 minutes
- KYC gates + blacklist enforcement with AND-condition logic

### 3. **Role-Based Access Control**
- 5-tier staff roles (admin, ops_manager, finance_officer, compliance, support)
- Granular permission boundaries in routes
- Session persistence via PostgreSQL

### 4. **Modern Tech Stack**
- Frontend: React 18 + TypeScript + Tailwind + shadcn/ui
- Backend: Express 5 + Drizzle ORM (type-safe)
- Database: PostgreSQL 16 with advanced features
- Real-time: WebSocket ready (ws installed)

---

## 📋 CURRENT PAGES (21 implemented)

### Operations (5 pages)
- `/` — Dashboard (KPI cards, charts, activity feed)
- `/customers` — Customer CRUD + wallet whitelist + history
- `/records` — Financial records (4 types, 5 stages)
- `/transactions` — Transaction wizard + approval
- `/reports` — Analytics (volume, revenue, 7/30/60/90 day ranges)

### Accounting (8 pages)
- `/accounting/chart-of-accounts` — CoA CRUD (50+ seeded accounts)
- `/accounting/journal-entries` — JE creation, posting, void
- `/accounting/exchange-rates` — Rate time-series management
- `/accounting/periods` — Period lifecycle (open → closed → locked)
- `/accounting/providers` — Service provider CRUD (25 pre-seeded)
- `/accounting/currencies` — Supported currencies
- `/accounting/networks` — Crypto network configuration
- `/accounting/wallet-sync` — Watched wallet Ankr integration

### Compliance (4 pages)
- `/compliance/alerts` — AML/KYC dashboard (structuring, KYC breach, liquidity, orphan)
- `/blacklist` — Blacklist entry + subject management (AND conditions)
- `/audit-log` — Immutable event history with filters

### Configuration (3 pages)
- `/labels` — Customer classification labels
- `/staff` — User management (admin only)
- `/settings` — System configuration

### Financial Statements (4 pages - NEW in Phase 1)
- `/reports/trial-balance` — Full trial balance with type grouping
- `/reports/balance-sheet` — Statement of Financial Position
- `/reports/income-statement` — P&L statement
- `/reports/customer-ledger` — Per-customer account balances

---

## 🔴 CRITICAL MISSING FEATURES & PAGES

### Tier 1: Revenue Impact (Must Have - Q1 2026)

#### 1. **Multi-Wallet Aggregation & Portfolio Dashboard**
- **Problem**: No unified view of all wallet holdings across networks
- **Missing Pages**:
  - `/portfolio` — Real-time wallet balance aggregation (BEP20, TRC20, ERC20, TON, Aptos)
  - `/portfolio/allocation` — Asset allocation pie/donut chart
  - `/portfolio/history` — Historical balance tracking with CSV export
- **Backend Tasks**:
  - `GET /api/portfolio/balances` — Aggregate across all watched wallets
  - `GET /api/portfolio/pnl` — Unrealized P&L per wallet
  - Real-time price feeds (CoinGecko/Binance API integration)

#### 2. **Customer Self-Service Portal**
- **Problem**: Customers can only request operations; no visibility
- **New Pages**:
  - `/customer-portal` — Public-facing login for customers
  - `/customer-portal/transactions` — View own transaction history
  - `/customer-portal/rates` — Real-time buy/sell rates
  - `/customer-portal/quote` — Request rate quote
  - `/customer-portal/account-statement` — Monthly statement PDF
- **Auth**:
  - Customer phone-based authentication (SMS OTP or WhatsApp link)
  - Session separate from staff sessions
- **Database**:
  - Add `customers.portalsEnabled`, `customers.customerPortalSecret`

#### 3. **Real-Time Rate Management**
- **Problem**: Rates are stored in DB but no dynamic pricing UI
- **Missing Pages**:
  - `/rates/management` — Live rate board (currency pair matrix)
  - `/rates/spreads` — Configure buy/sell spreads per customer group
  - `/rates/alerts` — Price movement alerts (notify ops when movement >5%)
- **Backend**:
  - `GET /api/rates/board` — Current matrix
  - `POST /api/rates/alerts` — Set thresholds
  - WebSocket `/ws/rates` — Live rate push

#### 4. **Referral & Affiliate System**
- **Problem**: `referralParentId` in schema but no UI/logic
- **Missing Pages**:
  - `/affiliates` — Referral partner management
  - `/affiliates/dashboard` — Commission tracking, conversion funnel
  - `/affiliates/:id/analytics` — Referred customer performance
  - `/affiliates/payouts` — Payout scheduling + history
- **Database**:
  - Extend: `customers.referralParentId` → link to referral_partners table
  - New table: `referral_partners` (name, phone, comissionRate, payoutBankInfo)
  - New table: `referral_payouts` (partnerId, period, amount, status: pending/paid)
  - Track commission on transaction_entries (type: commission)

#### 5. **WhatsApp & SMS Integration**
- **Problem**: Infrastructure exists (`/webhooks`) but UI minimal
- **Missing Pages**:
  - `/webhooks/whatsapp-setup` — Webhook URL + auth token config
  - `/webhooks/sms-templates` — Rate alert + transaction confirmation templates
  - `/webhooks/broadcast` — Send bulk WhatsApp messages to customers
  - `/webhooks/logs` — Failed webhook retry logs
- **Backend**:
  - `POST /api/webhooks/broadcast` — Send templated message to customer list
  - Expand `/webhooks/sms` to handle inbound WhatsApp
  - Message queue (Bull/RabbitMQ for reliability) - optional but recommended

#### 6. **Advanced Customer Segmentation**
- **Problem**: Labels exist but no segmentation engine
- **Missing Pages**:
  - `/segments` — Dynamic customer segments (LTV, frequency, risk level)
  - `/segments/:id/rules` — Rule builder (e.g., "active" = txs > 3/month AND volume > $10k)
  - `/segments/:id/members` — List customers matching rules
  - `/segments/:id/automations` — Auto-apply labels/limits when customer matches
- **Database**:
  - New table: `customer_segments` (name, rules JSONB, isActive)
  - New table: `segment_rules` (segmentId, field, operator, value)
  - Trigger on transaction confirm: re-evaluate customer against all segments

---

### Tier 2: Operational Excellence (Should Have - Q2 2026)

#### 7. **KYC/AML Document Management**
- **Problem**: `documentation` JSONB field exists but no UI
- **Missing Pages**:
  - `/customers/:id/documents` — Upload/view passport, national ID, proof of address
  - `/compliance/kyc-review` — Document review queue (pending → approved/rejected)
  - `/compliance/kyc-analytics` — Time to approve, rejection reasons
- **Database**:
  - Rename: `documentation` → `kyc_documents` for clarity
  - Add: `kyc_reviews` (customerId, documentType, status, reviewedBy, reviewedAt, notes)

#### 8. **Settlement & Reconciliation Engine**
- **Problem**: Transactions confirmed but no settlement tracking
- **Missing Pages**:
  - `/settlements` — Group pending outflows into settlement batches
  - `/settlements/:id` — Manual reconciliation workflow (expected vs actual balances)
  - `/reconciliation` — Bank statement import + auto-matching
- **Database**:
  - New table: `settlement_batches` (batchNumber, status: pending/in_flight/completed, totalAmount, executedAt)
  - New table: `settlement_lines` (batchId, transactionId, amount, status)

#### 9. **Multi-Currency P&L Dashboard**
- **Problem**: Reports exist but single-currency focused
- **Missing Pages**:
  - `/reports/consolidated-pl` — Consolidated P&L across all currencies (YER/SAR/USD/USDT)
  - `/reports/currency-exposure` — Open position per currency
  - `/reports/hedging` — Spot rate vs forward contracts view
- **Backend**:
  - `GET /api/reports/pl/:currency` — Multi-currency P&L builder
  - Currency conversion at historical rates for period-end consolidation

#### 10. **Invoice & Receipt Customization**
- **Problem**: Invoice system exists but no custom templates
- **Missing Pages**:
  - `/invoices/templates` — Template builder (HTML/CSS editor)
  - `/invoices/settings` — Logo, company details, payment terms, tax configuration
  - `/invoices/:id/send` — Email invoice to customer
- **Backend**:
  - Extend record_invoice component to support custom templates
  - `POST /api/invoices/:recordId/send-email` — Send via email service

#### 11. **Webhook Management & Monitoring**
- **Problem**: SMS webhook exists but limited UI
- **Missing Pages**:
  - `/integrations/webhooks` — Create custom webhooks (inventory, accounting system sync)
  - `/integrations/webhooks/:id/logs` — Request/response logs + retry UI
  - `/integrations/api-keys` — Generate & manage API keys for third-party integrations
- **Database**:
  - New table: `webhooks` (url, events[], headers JSONB, isActive, secret)
  - New table: `webhook_logs` (webhookId, event, status, payload, response, timestamp)

#### 12. **Dispute & Reversal Management**
- **Problem**: No transaction reversal workflow
- **Missing Pages**:
  - `/disputes` — Customer disputes list (transaction didn't go through, incorrect amount, etc.)
  - `/disputes/:id` — Review + reversal request workflow
  - `/reversals` — Execute reversal (creates offsetting transaction)
- **Database**:
  - New table: `disputes` (transactionId, reason, status: open/investigating/resolved/rejected, createdAt)
  - New table: `reversals` (disputeId, originalTransactionId, reversal TransactionId, executedBy, executedAt)

---

### Tier 3: Analytics & Intelligence (Nice to Have - Q3 2026)

#### 13. **Advanced Analytics & BI Dashboard**
- **Missing Pages**:
  - `/analytics/funnel` — Customer journey: signup → first tx → repeat
  - `/analytics/cohorts` — Monthly cohort analysis (retention, churn)
  - `/analytics/customer-ltv` — Lifetime value by customer segment
  - `/analytics/predictive` — Churn risk scoring (ML-ready)
- **Backend**:
  - `GET /api/analytics/funnel` — Calculate multi-stage conversion
  - `GET /api/analytics/cohorts/:month` — Retention curves
  - Query: window functions for running totals, growth rates

#### 14. **Transaction Limits & Risk Scoring**
- **Problem**: KYC limits exist but no dynamic risk scoring
- **Missing Pages**:
  - `/risk-management` — Risk score calculation model
  - `/risk-management/limits` — Adjust per-customer limits based on score
  - `/risk-management/alerts` — Unusual activity detection (spending pattern anomalies)
- **Backend**:
  - `GET /api/customers/:id/risk-score` — Calculate composite score (velocity, volume, geography, etc.)
  - Webhook trigger to compliance_alerts

#### 15. **Audit Trail Visualization**
- **Problem**: Audit logs exist but raw table view only
- **Missing Pages**:
  - `/audit/timeline` — Visual timeline of customer activity
  - `/audit/user-actions` — Per-staff-member action log + anomaly detection
  - `/audit/export` — Compliance export (regulatory audit trail)
- **Backend**:
  - `GET /api/audit/timeline/:customerId` — Ordered events with linked records/transactions
  - `GET /api/audit/export` — ZIP file with full audit trail + signatures

#### 16. **SMS/Email Campaign Manager**
- **Missing Pages**:
  - `/campaigns` — Create promotional/educational campaigns
  - `/campaigns/:id/schedule` — Time-based delivery
  - `/campaigns/:id/analytics` — Open rate, click rate, conversion
- **Database**:
  - New table: `campaigns` (name, type, content, schedule, status)
  - New table: `campaign_recipients` (campaignId, customerId, sentAt, openedAt)

---

## 🏗️ RECOMMENDED FUTURE ARCHITECTURE

### Sidebar Navigation Structure (Reorganized)

```
FOMS
├── 📊 Dashboard
│   └── / (KPI + liquidity monitor)
├── 💼 Operations
│   ├── Customers
│   │   ├── /customers
│   │   ├── /customers/customer-groups
│   │   ├── /customers/follow-ups
│   │   ├── /customers/:id/documents (NEW)
│   │   └── /customer-portal (NEW - public)
│   ├── Records
│   │   └── /records
│   ├── Transactions
│   │   ├── /transactions
│   │   ├── /disputes (NEW)
│   │   ├── /reversals (NEW)
│   │   └── /settlements (NEW)
│   └── Rates & Portfolio
│       ├── /rates/management (NEW)
│       ├── /rates/spreads (NEW)
│       ├── /portfolio (NEW)
│       ├── /portfolio/allocation (NEW)
│       └── /portfolio/history (NEW)
├── 📈 Accounting
│   ├── Chart of Accounts
│   │   └── /accounting/chart-of-accounts
│   ├── Journal Entries
│   │   └── /accounting/journal-entries
│   ├── Financial Periods
│   │   ├── /accounting/periods
│   │   ├── /accounting/exchange-rates
│   │   ├── /accounting/currencies
│   │   └── /accounting/networks
│   ├── Setup & Sync
│   │   ├── /accounting/providers
│   │   ├── /accounting/wallet-sync
│   │   └── /reconciliation (NEW)
│   └── Statements
│       ├── /reports/trial-balance
│       ├── /reports/balance-sheet
│       ├── /reports/income-statement
│       ├── /reports/customer-ledger
│       ├── /reports/consolidated-pl (NEW)
│       └── /reports/currency-exposure (NEW)
├── 🚨 Compliance & Risk
│   ├── Alerts & Monitoring
│   │   ├── /compliance/alerts
│   │   ├── /compliance/kyc-review (NEW)
│   │   ├── /compliance/kyc-analytics (NEW)
│   │   └── /risk-management (NEW)
│   ├── Blacklist
│   │   └── /blacklist
│   └── Audit & Reports
│       ├── /audit-log
│       ├── /audit/timeline (NEW)
│       └── /audit/export (NEW)
├── 📊 Analytics
│   ├── /reports (existing)
│   ├── /analytics/funnel (NEW)
│   ├── /analytics/cohorts (NEW)
│   └── /analytics/customer-ltv (NEW)
├── 💬 Affiliates & Partners
│   ├── /affiliates (NEW)
│   ├── /affiliates/dashboard (NEW)
│   └── /campaigns (NEW)
├── ⚙️ System Config
│   ├── Labels
│   │   └── /labels
│   ├── Integrations
│   │   ├── /integrations/webhooks (NEW)
│   │   ├── /integrations/api-keys (NEW)
│   │   ├── /webhooks (existing, refactor)
│   │   └── /webhooks/broadcast (NEW)
│   └── Administration
│       ├── /staff
│       └── /settings
```

---

## 🔧 Database Schema Enhancements

### New Tables to Add

```typescript
// Referral Partners
export const referralPartners = pgTable("referral_partners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phonePrimary: text("phone_primary").notNull(),
  phoneSecondary: text("phone_secondary").array(),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).notNull(), // 1.5 = 1.5%
  payoutBankInfo: jsonb("payout_bank_info"), // {bankName, accountNumber, accountHolder, iban}
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Referral Payouts
export const referralPayouts = pgTable("referral_payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar("partner_id").notNull(),
  period: text("period").notNull(), // "2026-01" format
  commissionAmount: decimal("commission_amount", { precision: 18, scale: 4 }).notNull(),
  status: text("status").notNull().default("pending"), // pending|paid|failed
  executedAt: timestamp("executed_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Customer Segments (dynamic grouping)
export const customerSegments = pgTable("customer_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  rulesJsonb: jsonb("rules_jsonb"), // {operator: "AND", conditions: []}
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// KYC Document Reviews
export const kycReviews = pgTable("kyc_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull(),
  documentType: text("document_type").notNull(), // passport|national_id|proof_of_address
  status: text("status").notNull().default("pending"), // pending|approved|rejected
  reviewedBy: varchar("reviewed_by"),
  notes: text("notes"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  reviewedAt: timestamp("reviewed_at"),
});

// Settlement Batches
export const settlementBatches = pgTable("settlement_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchNumber: text("batch_number").notNull().unique(),
  status: text("status").notNull().default("pending"), // pending|in_flight|completed|failed
  totalAmountUsd: decimal("total_amount_usd", { precision: 18, scale: 4 }).notNull(),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Disputes
export const disputes = pgTable("disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionId: varchar("transaction_id").notNull(),
  customerId: varchar("customer_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"), // open|investigating|resolved|rejected
  notes: text("notes"),
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Webhooks (generic integration)
export const webhooks = pgTable("webhooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  url: text("url").notNull(),
  events: text("events").array().notNull(), // ['record.confirmed', 'transaction.completed']
  headers: jsonb("headers"), // custom auth headers
  secret: text("secret"), // signing secret
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Campaigns (WhatsApp/Email)
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // whatsapp|email|sms
  subject: text("subject"), // email only
  content: text("content").notNull(), // message body or template
  status: text("status").notNull().default("draft"), // draft|scheduled|sent|failed
  scheduledFor: timestamp("scheduled_for"),
  sentAt: timestamp("sent_at"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});
```

---

## 📊 Phase Timeline

| Phase | Quarter | Focus | Impact |
|-------|---------|-------|--------|
| **Phase 0** | Current | Operations, Accounting, Compliance | Baseline: record management |
| **Phase 1** | Q1 2026 | Multi-wallet, Rates, Customer Portal, Referrals | Revenue growth |
| **Phase 2** | Q2 2026 | KYC/AML UI, Settlement, Advanced P&L | Operational maturity |
| **Phase 3** | Q3 2026 | Analytics, Cohorts, Risk Scoring, Campaigns | Data-driven growth |
| **Phase 4** | Q4 2026 | Mobile app, Advanced integrations | Omnichannel |

---

## 📈 Success Metrics

### Operations
- Record processing time (target: <2h draft → confirmed)
- False-positive compliance alerts (target: <5%)
- Customer portal adoption (target: >50% within 6 months)

### Financial
- Revenue per transaction ($)
- Spread capture (%)
- Fee extraction accuracy (%)

### Compliance
- Audit trail completeness (100% immutable)
- KYC review time (target: <24h)
- Blacklist match rate (false positives <2%)

### Analytics
- Customer retention rate (month-over-month)
- Referral conversion (applicants → active customers)
- Lifetime value by segment

---

## 🎯 Immediate Priorities (Next 30 Days)

1. **Implement Tier 1 features**:
   - [ ] Portfolio dashboard + wallet aggregation
   - [ ] Customer self-service portal
   - [ ] Rate management UI
   - [ ] Referral partner system

2. **Database schema**:
   - [ ] Add referral_partners, referral_payouts tables
   - [ ] Extend transaction_entries with commission type
   - [ ] Add customer_segments table

3. **Backend endpoints**:
   - [ ] GET /api/portfolio/balances
   - [ ] POST /api/customers/portal-login
   - [ ] GET /api/rates/board
   - [ ] GET /api/affiliates/:id/analytics

4. **UI/UX**:
   - [ ] Portfolio dashboard component
   - [ ] Customer portal login flow
   - [ ] Rate board matrix
   - [ ] Referral dashboard

---

## 🔐 Compliance & Security Notes

- **GDPR**: Customer portal needs data export / deletion workflows
- **KYC/AML**: Phase 2 includes document review queue + regulatory export
- **PCI-DSS**: Bank account numbers in customer_wallets should be encrypted at rest
- **Audit Trail**: All API calls are immutably logged; hash chain prevents tampering

---

## 📞 Stakeholder Alignment

- **Ops Team**: Immediate need for portfolio view + settlement UI
- **Finance Team**: Need consolidated P&L + period close automation
- **Compliance**: Need KYC review queue + enhanced alert management
- **Sales**: Referral system + customer portal for competitive advantage
- **Customers**: Self-service portal + real-time rates

---

**Document Version**: 1.0  
**Last Updated**: 2026-03-11  
**Next Review**: 2026-04-01
