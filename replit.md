# FOMS — Financial Operations Management System (Coin Cash)
## Branding
- **Logo**: `/coincash-logo.png` (public directory, 234KB PNG) — used in invoice
- **Brand colors**: Navy `#1a1a2e` + Gold `#F5A623` + White
- **Invoice system**: `client/src/components/record-invoice.tsx` — dom-to-image-more PNG download (SVG foreignObject renderer, properly handles Arabic RTL text shaping). Pre-renders blob when invoice dialog opens so download is instant. Shown on all confirmed records.


## Overview
A professional internal platform for Coin Cash — a crypto exchange and Forex broker agent in Yemen/Gulf. Core business: buy/sell USDT for local customers. Built to international financial standards with Role-Based Access Control, audit trails, blacklist checking, and multi-currency support.

## Tech Stack
- **Frontend**: React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL on Supabase (via Drizzle ORM, session pooler)
- **Session**: express-session + connect-pg-simple
- **Database Connection**: Uses `SUPABASE_DATABASE_URL` (preferred) or falls back to `DATABASE_URL`. Pooler URL: `aws-1-us-east-1.pooler.supabase.com:5432`
- **Security**: helmet (security headers), express-rate-limit (brute-force protection), bcryptjs (password hashing), RBAC middleware
- **Deployment**: Vercel with pre-bundled ESM serverless handler (`api/index.mjs` built from `server/vercel.ts`)

## Architecture

### Database Tables

**Operations Layer**
- `staff_users` — Authentication and staff management (5 roles)
- `customers` — Customer profiles with KYC, risk level, loyalty group, labels, riskLimits, serviceDiscounts
- `customer_wallets` — Whitelist of wallet addresses/bank accounts per customer and provider
- `labels` — Customer classification labels with color, description, applies-to, autoDiscount, autoLimits
- `blacklist_entries` — Blocked phones, emails, name fragments, wallet addresses
- `system_settings` — Configurable key-value settings across categories
- `records` — Financial records (cash/crypto, inflow/outflow) with 5-stage processing pipeline
- `transactions` — Links inflow + outflow records, auto-calculates spread/fee P&L
- `system_variables` — Central registry of domain constants: currencies (USD/YER/USDT…), networks (BEP20/TRC20…), services (deposit/withdraw…), rate tiers; key-value store with JSONB metadata
- `crypto_sends` — On-chain USDT send records. Links to account 1521 "Auto Send Wallet USDT BEP20" (UUID via `fromAccountId`), provider (via account's `providerId`), customer, and outflow record. All amounts in USDT: `amount` (on-chain), `depositFeeUsd` (service fee), `networkFeeUsd` (gas), `totalDebitUsd` (client total). `exchangeRate` stores fiat/USDT rate for reference. Status: pending→confirmed/failed. TX hash, block number, gas cost tracked.
- `audit_logs` — Immutable event history for all system actions
- `sessions` — Persistent session storage
- `customer_groups` — Loyalty tiers (standard, VIP, gold…) with `rateOverrides` JSONB (custom buy/sell per currency), `feeOverrides` JSONB (custom deposit/withdraw % per provider), `recordLimits` JSONB (perTransaction, perMonth, perYear). Linked to customers via `customers.loyaltyGroup = group.code`. Active on record form: `GET /api/records/customer-group-overrides/:customerId` resolves group overrides; rate/fee auto-fill prefers group overrides over provider/exchange defaults. Suspended customers are blocked from record creation (403 on POST/PATCH).
- `customer_follow_ups` — WhatsApp-style follow-up tasks per customer. Fields: title, notes, status (pending/in_progress/done/cancelled), priority (low/medium/high/urgent), dueDate, dueTime, assignedTo (staff ID), completedAt. Kanban board view in UI
- `sms_webhook_configs` — Dynamic SMS endpoint configs: slug (unique URL path), accountId/accountName (CoA asset account), currency, isActive
- `sms_parsing_rules` — Per-config extraction rules: clientAfterString/clientBeforeString + amountAfterString/amountBeforeString + direction (inflow/outflow), sortOrder for priority
- `sms_webhook_logs` — Audit trail for every SMS hit: raw message, parsed fields, match result, generated record ID, status (success/parse_failed/error)
- `sms_raw_inbox` — Store-first SMS messages from Post SMS Forward app; auto-processed every 60s by `server/sms-processor.ts`
- `notification_queue` — PostgreSQL-backed job queue for WhatsApp group notifications. Status: queued→processing→sent/failed/dead. 5 retry attempts with exponential backoff
- `notification_audit_log` — Immutable delivery audit trail linking recordId, wamid, deliveryStatus, payloadSnapshot

**WhatsApp Notification System + SMS Receiver (VPS Bridge Architecture)**
- Bridge server: VPS at 209.127.27.2, runs Baileys (Node.js) managed by PM2 (`wa-bridge` process), port 3078
- WhatsApp 24/7 stability: VPS auto-starts Baileys from saved session (`/var/data/wa-auth`) on every restart — no QR rescan needed
- Replit startup: checks VPS status first — skips `/connect` call if VPS is already `connected`, preventing session interruption on deployment
- Bridge API: authenticated via `x-api-key` (`WA_BRIDGE_API_KEY`). Key endpoints: `/api/bridge/status`, `/connect`, `/disconnect`, `/groups`, `/send`
- SMS receiver: `POST /api/webhooks/sms/:slug` on VPS (port 3078) — **Post SMS Forward app** sends to `http://209.127.27.2:3078/api/webhooks/sms/{slug}?message={body}&time={local-time}`. No auth on endpoint — slug acts as token
- SMS auto-processor: `server/sms-processor.ts` runs every 60s on both Replit and VPS — picks up `pending` inbox entries and converts to records using parsing rules
- Duplicate prevention: idempotency check before WhatsApp send (checks audit log); `nextRetryAt` cleared on success; stuck `processing` jobs reset after 2 min
- Env vars: `WA_BRIDGE_URL`, `WA_BRIDGE_API_KEY` (both stored in Secrets, no hardcoded values)
- AWS requirement: EC2 Security Group must allow inbound TCP port 3078 from Replit IPs
- QR code: bridge generates base64 data URL via `qrcode` npm package, displayed in FOMS UI (`client/src/pages/whatsapp.tsx`)
- Trigger: after record confirmation in routes.ts → `whatsappService.enqueueRecordNotification(record, customer)`
- Notification message format: Arabic, addresses client by name ("عزيزنا العميل"), shows لكم/عليكم direction, provider name (not CoA account name), service/network fees (no spread fee), optional sender/recipient/txid/address fields, and `notificationNotes` (manual client-facing note, separate from internal `notes`)
- Rate limits: 4-9s random delay between messages, 200/day max, 30s cooldown after 10 burst messages, typing simulation
- Group JID: stored in `customers.whatsappGroupId` (format: `120363XXXXXXXXXX@g.us`)
- Architecture doc: `docs/whatsapp-notification-architecture.md`

**Fee & Income Policy**
- **Cash FX spread**: exact rate-difference, supports positive (profit) AND negative (loss). `spreadUsd = bankProceeds − clientCredit` for inflow, `clientCharge − bankCost` for outflow. Customer ALWAYS gets exactly what the exec rate promises. When exec rate is more favorable to customer than bank rate, spread is negative → booked as DR on 4201. No minimum floor. `MIN_INCOME_USD` not applied to cash spread.
- **Crypto service fee**: $1 USD minimum floor still applies — if fee is >$0 but <$1, it's bumped to $1. Zero fees remain zero. Constants: `MIN_INCOME_USD = 1.0` in `server/storage.ts` (confirm flow), `MIN_SEND_FEE_USD = 1.0` in `server/routes.ts` (send crypto preview/execute), `MIN_FEE_USD = 1.0` in `client/src/pages/records.tsx` (crypto fee breakdown preview only)
- Network fee (gas) is always fetched from the `crypto_networks` table via provider's `networkId` FK — NOT from the legacy `provider.networkFeeUsd` field (which is only a seed-time snapshot). Both the send crypto routes and the record form fee breakdown look up the network table.

**Kuraimi ePay Integration**
- Separate page: `/kuraimi` — send payments, view history, reverse transactions
- Backend service: `server/kuraimi-service.ts` — direct Axios calls to Kuraimi Bank API (npm package has broken `main` field, so SDK is implemented inline)
- DB table: `kuraimi_payments` — tracks all payment attempts with status, bank ref, API response
- API routes: `GET /api/kuraimi/status`, `GET /api/kuraimi/payments`, `POST /api/kuraimi/send-payment`, `POST /api/kuraimi/reverse-payment/:id`, `POST /api/kuraimi/link-record/:id`
- Customer verification webhook: `POST /api/webhooks/kuraimi/verify-customer` (Kuraimi Bank calls this to verify customers)
- Env secrets: `KURAIMI_USERNAME`, `KURAIMI_PASSWORD` (required), `KURAIMI_ENV` (UAT/PROD, default UAT), `KURAIMI_MERCHANT_NAME` (default "Coin Cash"), `KURAIMI_BASE_URL` (override for PROD)
- Verify webhook auth: `KURAIMI_VERIFY_USERNAME`, `KURAIMI_VERIFY_PASSWORD` (Basic auth that Kuraimi uses to call our verify endpoint)
- UAT base URL: `https://web.krmbank.net.ye:44746`
- Payment API: `/alk-payments-exp/v1/PHEPaymentAPI/EPayment/SendPayment` (POST, Basic auth)
- Reversal API: `/alk-payments-exp/v1/PHEPaymentAPI/EPayment/ReversePayment` (POST, Basic auth)
- PIN is base64-encoded before sending to API
- Each payment gets unique ref: `CC_{timestamp}_{random}`

**KYC Document Storage**
- Bucket: `kyc-documents` (Supabase Storage, private, 10MB limit)
- Upload route: `POST /api/customers/:id/kyc-upload` (multipart/form-data, field: `file`)
- Signed URL: `GET /api/kyc-document/signed-url?path=...` (1hr expiry)
- Delete: `DELETE /api/kyc-document` (body: `{ path }`)
- Helper: `server/supabase-storage.ts` — fetches service role key from management API via `SUPABASE_ACCESS_TOKEN`
- Storage path: `{customerId}/{timestamp}_{filename}`
- Backward compatible: old base64 `imageData.data` still works for legacy docs

**Double-Entry Accounting Engine**
- `currencies` — Accepted currencies (fiat + crypto) with base currency designation (USD)
- `exchange_rates` — Time-series log of daily rates (fromCurrency → USD); historical record, never editable
- `accounting_periods` — Financial months/years with status: open → closed → locked (prevents retrospective editing)
- `chart_of_accounts` — Full CoA with 70+ seeded accounts in 5 types: Asset(1xxx), Liability(2xxx), Equity(3xxx), Revenue(4xxx), Expense(5xxx). Each account has `currency` and optional `providerId` FK. Numbering: Banks 1110–1133 (Kuraimi Bassem/Aqeed/Mohammed/Wael × YER/SAR/USD), Wallets 1210–1278 (Jaib/Jawali/Cash/OneCash × person × YER/SAR/USD), Remittance 1410–1433 (BinJaber/Hazmi/Taiz Bassem/Taiz Ammar × YER/SAR/USD), Crypto 1510–1521 (platforms: Binance Ammar/Mohammed/Wael 1510–1512, Bybit 1513, KuCoin 1514, OKX 1515, MexC 1516; wallets: Trust Wallet 1520, Auto Send Wallet 1521), Brokers 1610–1612 (HeadWay 1610, Valetax 1611, OneRoyal 1612). Old accounts (1101–1105, 1114, 1115, 1201–1204, 1511–1513 old, 1520 old BNB, 1530–1535) are deleted on startup if no journal history, otherwise deactivated.
- `crypto_networks` — Blockchain networks (TRC20, BEP20, TON, Aptos, Arbitrum, Bitcoin). UUID PK, `code`, `name`, `blockchain`, `nativeToken`, `networkFeeUsd`, `isActive`, `sortOrder`. FK target for `providers.networkId`
- `providers` — Pre-seeded service providers across 6 categories: `crypto_wallet` (usdt_bep20), `crypto_platform` (binance, bybit, kucoin, okx, mexc), `broker` (headway, valetax, oneroyal), `cash_bank` (kuraimi_yer/sar/usd — one per currency), `cash_wallet` (jaib_yer/sar/usd, jawali_yer/sar/usd, cash_yer/sar/usd, onecash_yer/sar/usd — one per brand×currency), `cash_remittance` (remittance_yer/sar/usd). Each has `fieldType` (address|platform_id|account_id|name_phone), `networkId` FK → crypto_networks, `networkCode`, `networkFeeUsd`, `depositFeeRate`, `withdrawFeeRate`. Old providers (flosak, bin_jaber, hazmi, kuraimi_kuwait_kwd, cac_bank_usd, old per-wallet crypto, old per-network exchange providers) are deleted on startup if unreferenced, otherwise deactivated.
- `journal_entries` — JE headers: entry number, period, date, description, status (draft/posted/void), source linkage
- `journal_entry_lines` — JE lines: debits and credits. RULE: Total Debits MUST equal Total Credits or entry cannot be posted
- `source_documents` — Vouchers/receipts/invoices linked to journal entries (receipt, payment_voucher, invoice, credit_note, debit_note, journal_voucher)

**Records Table Key Fields (Double-Entry)**
- `providerId` — FK to providers — links the record to its provider for fee lookups and whitelist validation. Set by crypto send (from account's provider) and available for all record types
- `accountId` — FK to chart_of_accounts — the ASSET account (our bank/wallet that physically moves)
  - For inflows: this is the DEBIT side (asset increases)
  - For outflows: this is the CREDIT side (asset decreases)
- `contraAccountId` — FK to chart_of_accounts — the LIABILITY/PAYABLE account (second leg of double-entry)
  - For inflows: this is the CREDIT side (liability to customer increases — we owe them value)
  - For outflows: this is the DEBIT side (liability reduces — we're fulfilling our obligation)
  - Default for cash records: 2103 (Pending Cash Payable)
  - Default for crypto records: 2102 (Pending Crypto Payable)
- `buyRate` — Exchange rate when we BUY USD/crypto from customer (applies to inflow records)
- `sellRate` — Exchange rate when we SELL USD/crypto to customer (applies to outflow records)
- `assetOrProviderName` — For cash: bank/transfer service name. For crypto: exchange/wallet brand name

### Staff Roles (RBAC)
| Role | Access Level |
|------|-------------|
| admin | Full access including staff management and settings |
| operations_manager | Records, customers, approvals |
| finance_officer | Create/manage records and customers |
| compliance_officer | Blacklist, audit logs, risk dashboard |
| customer_support | Read-only customer view |

## Pages / Routes
- `/` — Dashboard with 6 KPI cards, Recharts pie + bar charts, real volume/revenue/stage data, recent activity feed
- `/customers` — Customer management (CRUD, blacklist check, filters, wallet whitelist tab, History dialog with Tx+Record tabs). KYC docs uploaded to Supabase Storage bucket `kyc-documents` (private, 10MB limit, image/pdf). Country defaults to "Yemen" (not editable). Status: active/inactive/suspended
- `/records` — Financial records (4-type tabs, stage filter, search, View detail dialog, Edit, Stage advance buttons)
- `/transactions` — 4-step wizard: type+customer → pick records (with customer filter) → set fees → confirm; View detail dialog with approve button
- `/reports` — P&L Analytics (volume + revenue area/bar charts, top customers, tx count by type, 7/30/60/90 day range selector)
- `/webhooks` — Webhook config (SMS parser toggle + endpoint URL, WhatsApp API, notification triggers, SMS test panel)
- `/labels` — Label management with color picker, description, applies-to
- `/blacklist` — Blacklist manager (phone, email, name fragment, wallet)
- `/audit-log` — Immutable event history with entity type filter
- `/settings` — System configuration
- `/staff` — Staff user management (admin only)
- `/accounting/chart-of-accounts` — Full CoA: 50+ seeded accounts, type-grouped table, add/edit/delete (system accounts protected). Provider selector in form; Provider column in table
- `/accounting/journal-entries` — JE list + create wizard + detail view; balance enforcement (DR=CR), post to ledger, void with reason
- `/accounting/periods` — Create/close/lock/reopen financial periods; locked periods are immutable
- `/accounting/exchange-rates` — Time-series rates with "latest" badge, inverse rate display, add/edit/delete per currency
- `/accounting/providers` — CRUD for service providers (banks, crypto networks, exchanges). Each has fieldType (address|ID) and fieldName label
- `/accounting/wallet-sync` — Watched wallet management; per-wallet Ankr sync toggle, manual sync, add/edit (network/asset/CoA/provider)
- `/send-crypto` — Send USDT BEP20: crypto outflow from account 1521 "Auto Send Wallet USDT BEP20" to client wallet. Dual amount modes: Fiat→USDT (auto-calc) or Direct USDT (manual entry). Address auto-fill from customer's matching provider wallet. Duplicate prevention: blocks same customer+address+amount within 5 minutes. Server-side pagination: 50 per page with total count. Confirmation dialog with full USDT breakdown. Send history table with TX hash links to BSCScan
- `/compliance/alerts` — AML/KYC compliance alert dashboard: structuring detection, KYC limit breaches, liquidity warnings, orphan records. Filter by severity/type/status; acknowledge/resolve/false-positive workflow
- `/` (Dashboard) — Now includes Liquidity Monitor widget: coverage ratio gauge, wallet balance vs pending outflows, color-coded Safe/Warning/Critical status

### Financial Statements (sidebar group: "Financial Statements")
- `/reports/trial-balance` — Full trial balance: all accounts (assets/liabilities/equity/revenue/expense) with DR/CR totals and net balances; balanced/unbalanced indicator; type-grouped rows with subtotals
- `/reports/balance-sheet` — Statement of Financial Position: Assets (left) vs Liabilities + Equity (right); equation check banner (A = L + E); current period net income auto-included in equity
- `/reports/income-statement` — P&L: Revenue vs Expenses with net income result; profitability ratios (net margin, expense ratio); KPI cards
- `/reports/customer-ledger` — Per-customer account balances from journal_entry_lines; expandable rows showing account breakdown; "View Full Statement" shows individual journal entry history with running balance on account 2101

## Phase 0+1 Financial Engine (server/financial-engine.ts)
Enterprise-grade financial safety layer:
- **S-14 Record Lock**: Blocks mutation of `amount`, `currency`, `direction`, `type` when `processingStage = 'used'`. DB-level trigger + application-level guard
- **S-03 KYC Gate**: Non-blocking — checks per-tx and daily limits from customer `riskLimits`, creates `compliance_alerts` for breaches
- **S-10 Structuring Detector**: Triggers if 3+ transactions under $1,000 in a 24h window for same customer
- **S-08 Liquidity Monitor**: Coverage ratio = estimatedBalance / pendingOutflows; critical < 1.0×, warning < 1.5×
- **S-12 Fee Extractor**: Auto-creates Transaction Entries (fee + spread_profit + network_expense) on transaction approval. Idempotent
- **S-15 Orphan Detector**: Scans for records stuck in `matched` stage > 4h; runs every 15 minutes
- **Audit Hash Chain**: sha256(prevHash + payload+timestamp) on every audit log entry; genesis hash: "GENESIS_HASH_FOMS_2026"

## Multi-Line Journal Entry Generation (IFRS IAS 21/IFRS 15)
`generateRecordJournalEntry` in storage.ts produces proper multi-line double-entry JEs:

**Cash Inflow** (customer sends YER/SAR/KWD → we receive in bank):
- DR Asset (CoA bank buy rate e.g. 535 YER/$)
- CR Customer Liability (system sell rate e.g. 537 YER/$)
- CR FX Spread Income 4201 (difference = spread revenue)

**Cash Outflow** (we send YER/SAR/KWD → customer receives from bank):
- DR Customer Liability (system sell rate)
- CR Asset (CoA bank sell rate)
- CR FX Spread Income 4201 (difference = spread revenue)

**Crypto Outflow** (we send USDT to customer wallet/exchange):
- DR Customer Liability (amount + depositFeeRate% + networkFeeUsd gas)
- CR Crypto Asset (amount sent)
- CR Service Fee Income 4101 (deposit fee)
- CR Network Fee Recovery 4301 (gas passed through to customer)

**Crypto Inflow** (customer sends USDT to our wallet/exchange):
- DR Crypto Asset (amount received)
- CR Customer Liability (amount − withdrawFeeRate%)
- CR Service Fee Income 4101 (withdraw fee)

Rate lookup priority: CoA `buyRate`/`sellRate` for bank account rates; `exchange_rates` table for system rates; provider `depositFeeRate`/`withdrawFeeRate`/`networkFeeUsd` for crypto fees.

## Records Table — Rate and Fee Columns

### Rate columns (cash records)
- `bank_rate` — the CoA account's rate at time of recording (locked once set). Inflow = CoA buyRate, outflow = CoA sellRate. This is the actual bank/interbank rate. Pre-filled from CoA; user cannot edit.
- `buy_rate` / `sell_rate` — the system/execution rate (editable per record). For inflow: buy rate only. For outflow: sell rate only. Pre-filled from bank rate, can be overridden. Spread fee derives from the difference.
- `spread_rate` — FX spread % (internal only, never displayed in UI). `spread_usd` is the only spread metric shown.

### Fee breakdown columns (written back at confirmation, type-specific)
**CRYPTO records only** (`spreadRate`/`spreadUsd` = NULL):
- `usd_equivalent` — principal in USD (1:1 for USDT)
- `service_fee_rate` — % charged to client (e.g. 4.0 = 4%). Revenue → JE 4101
- `service_fee_usd` — actual USD fee = principal × rate/100. Revenue → JE 4101
- `network_fee_usd` — gas/blockchain fee passed to client. Revenue → JE 4301

**CASH records only** (`serviceFeeRate`/`serviceFeeUsd`/`networkFeeUsd` = NULL):
- `usd_equivalent` — principal in USD (at execution/system rate)
- `spread_usd` — FX spread income in USD = (amount/bankRate) − (amount/systemRate) for inflows. Revenue → JE 4201

### Contra account (flexible document field)
- `contraAccountName` is NOT in HARD_LOCKED. It is a display label on the flexible record document.
- Starts as "Customer Credits - Unmatched" (account 2101) for unmatched records.
- Updated automatically to "Customer Balance — [Name] (ID)" when a customer is linked (matched).
- Refreshed again at confirmation time from the linked customer.
- The LEDGER account is always determined by the journal entry logic, not this field.

The sync bug (RATE_FIELDS lock rejecting unchanged values) is fixed: the lock now compares stored vs incoming values before blocking, same as HARD_LOCKED fields.

## Transaction Entries (Financial Distribution Lines)
Table: `transaction_entries` — 8 types: fee, spread_profit, network_expense, receivable, payable, commission, penalty, reversal
- Each entry has: type, description, amount, currency, direction (debit/credit), accountName
- UI panel in transaction detail dialog: Auto-Extract button, manual Add form, balance equation (CR vs DR)
- API: GET/POST `/api/transactions/:id/entries`, DELETE `/api/transactions/:txId/entries/:id`, POST `/api/transactions/:id/extract-fees`

## Compliance Alerts Table
Table: `compliance_alerts` — types: structuring, kyc_limit_breach, blacklist_hit, liquidity_warning, orphan_record
- Severity: critical (red pulse), warning (amber), info (blue)
- Status workflow: open → acknowledged → resolved / false_positive
- Sidebar badge: live count of open critical alerts, auto-refreshes every 60s
- API: GET `/api/compliance/alerts`, PATCH `/api/compliance/alerts/:id`, GET `/api/compliance/alerts/count`

## Business Model
- **Deposit**: Cash Inflow records + Crypto Outflow records
- **Withdrawal**: Crypto Inflow records + Cash Outflow records
- **Transfer**: Any combination
- **Net Difference Types**: `premium_fee` → revenue, `customer_credit` → customer balance, `premium_discount` → expense, `customer_receivable` → customer debt

## API Endpoints
- `POST /api/auth/login` — Authenticate with username/password
- `GET/POST/PATCH/DELETE /api/customers` — Customer CRUD
- `GET/POST/PATCH/DELETE /api/customers/:id/wallets` — Customer wallet whitelist
- `POST /api/customers/:id/wallets/:wid/set-default` — Set default wallet
- `GET/POST/PATCH/DELETE /api/labels` — Label CRUD
- `GET/POST/PATCH /api/records` — Financial records CRUD
- `GET/POST/PATCH /api/transactions` — Transaction CRUD
- `GET/POST/PATCH/DELETE /api/blacklist` — Blacklist CRUD
- `POST /api/blacklist/check` — Run blacklist check
- `GET/PUT /api/settings/:key` — System settings
- `GET/POST/PATCH /api/staff` — Staff management
- `GET /api/dashboard/stats` — Dashboard KPI data
- `GET /api/audit-logs` — Audit event history
- `POST /api/webhooks/sms` — Legacy SMS webhook for auto-record creation
- `GET/POST/PATCH/DELETE /api/sms-webhook-configs` — SMS webhook config CRUD (slug→account+currency mapping)
- `GET/POST/PATCH/DELETE /api/sms-webhook-configs/:configId/rules` — SMS parsing rules CRUD per config
- `GET /api/sms-webhook-logs` — SMS webhook processing logs
- `POST /api/webhooks/sms/:slug` — Dynamic SMS receiver (no auth — external gateway hits this)

## Default Credentials (Seed Data)
| Role | Username | Password |
|------|----------|----------|
| Admin | admin | admin123 |
| Operations Manager | ops.manager | ops123 |
| Finance Officer | finance.officer | finance123 |
| Compliance Officer | compliance | comply123 |
| Customer Support | support | support123 |

## Currencies
- **Fiat**: YER, SAR, USD, AED, KWD
- **Crypto**: USDT, BTC, ETH, BNB
- **Networks**: BEP20, TRC20, ERC20, TON, Aptos

## Development Setup
The app runs on port 5000. Run `npm run dev` to start both the Express server and Vite frontend simultaneously.
Database schema is managed via Drizzle Kit. Run `npm run db:push` to apply schema changes.
