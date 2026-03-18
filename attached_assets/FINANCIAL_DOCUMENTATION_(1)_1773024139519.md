# Financial System Documentation
## Forms, Variables, Logic & Current Implementation

**Last Updated:** December 1, 2025  
**System:** Modern Financial Management System  
**Currency Support:** USD (Fiat), USDT (Crypto), Multiple Fiat Currencies

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Cash Records (Fiat Money)](#cash-records-fiat-money)
3. [USDT Records (Crypto)](#usdt-records-crypto)
4. [Transactions](#transactions)
5. [Journal Entries & Balance Calculation](#journal-entries--balance-calculation)
6. [Record Lifecycle](#record-lifecycle)

---

## System Overview

### Core Principles
- **Single Source of Truth:** Journal entries only affect client balances
- **Records + Transactions:** Financial records (cash/USDT) link to transactions
- **Transactions → Journal:** Each transaction generates multiple journal entries
- **100% Deduplication:** 4-layer safeguards prevent duplicate counting
- **Status-Based Filtering:** "Used" records cannot be reused in new transactions

### Record Flow
```
Cash/USDT Record (Pending) 
  ↓
Create Transaction (link records)
  ↓
Records marked as "Used"
  ↓
Journal Entries created (balance impact)
  ↓
Client Balance = Sum of journal entries only
```

---

## CASH RECORDS (Fiat Money)

### 1. CASH RECEIPT FORM (Cash Inflow)

**Purpose:** Record cash money received from client (deposit into bank/wallet)

**Form Type:** `Quick Add Cash Inflow`  
**Database Collection:** `cash_records`  
**Record Type:** `'inflow'`

#### Variables

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Auto | Sequential record ID |
| `date` | ISO string | ✅ | Date/time cash received |
| `type` | enum | ✅ | Always `'inflow'` |
| `source` | enum | ✅ | `'Manual'` (user entry) or `'SMS'` (parsed from SMS) |
| `status` | enum | ✅ | `'Pending'` \| `'Matched'` \| `'Used'` \| `'Cancelled'` \| `'Confirmed'` |
| `clientId` | string | ✅ | Client ID who sent cash |
| `clientName` | string | ✅ | Client name for quick reference |
| `accountId` | string | ✅ | Bank account ID where cash received |
| `accountName` | string | ✅ | Bank account name (e.g., "Main Bank Account") |
| `senderName` | string | ❌ | Name of person who sent cash (for inflows) |
| `amount` | number | ✅ | Amount in local currency (e.g., 100,000 YER) |
| `currency` | string | ✅ | Currency code (e.g., 'YER', 'SAR', 'AED') |
| `amountusd` | number | ✅ | Converted amount in USD using current rate |
| `notes` | string | ❌ | Optional notes about transaction |
| `rawSms` | string | ❌ | Original SMS text (if source='SMS') |
| `createdAt` | ISO string | Auto | System timestamp |

#### Logic

```
When Cash Receipt Created:
1. Validate client exists
2. Validate bank account exists
3. Convert amount to USD using current FiatRate
4. Set status = 'Pending' (waiting to be matched/used in transaction)
5. Auto-assign to client if source='SMS' with smart matching

When Used in Transaction:
1. Status changed to 'Used'
2. Hidden from future transaction selections
3. Linked records cannot be reused

Balance Impact:
- ONLY through journal entry when transaction created
- Journal entry: DEBIT bank account, CREDIT client account (liability ↓)
- Example: Client sends 100,000 YER = we receive $1,600 → liability decreased
```

#### Example
```json
{
  "id": "1001",
  "date": "2025-12-01T10:30:00Z",
  "type": "inflow",
  "source": "Manual",
  "status": "Pending",
  "clientId": "1001910",
  "clientName": "Ahmed Hassan",
  "accountId": "bank_001",
  "accountName": "Main Bank Account",
  "senderName": "Ahmed Hassan",
  "amount": 100000,
  "currency": "YER",
  "amountusd": 1600.00,
  "notes": "Deposit for exchange",
  "createdAt": "2025-12-01T10:30:00Z"
}
```

---

### 2. CASH PAYMENT FORM (Cash Outflow)

**Purpose:** Record cash money paid out to client (withdrawal from bank/wallet)

**Form Type:** `Quick Add Cash Outflow`  
**Database Collection:** `cash_records`  
**Record Type:** `'outflow'`

#### Variables

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Auto | Sequential record ID |
| `date` | ISO string | ✅ | Date/time cash paid out |
| `type` | enum | ✅ | Always `'outflow'` |
| `source` | enum | ✅ | `'Manual'` (user entry) |
| `status` | enum | ✅ | `'Pending'` \| `'Matched'` \| `'Used'` \| `'Cancelled'` \| `'Confirmed'` |
| `clientId` | string | ✅ | Client ID who received cash |
| `clientName` | string | ✅ | Client name for quick reference |
| `accountId` | string | ✅ | Bank account ID where cash withdrawn |
| `accountName` | string | ✅ | Bank account name |
| `recipientName` | string | ❌ | Name of person who received cash (for outflows) |
| `amount` | number | ✅ | Amount in local currency |
| `currency` | string | ✅ | Currency code |
| `amountusd` | number | ✅ | Converted amount in USD |
| `notes` | string | ❌ | Optional notes |
| `createdAt` | ISO string | Auto | System timestamp |

#### Logic

```
When Cash Payment Created:
1. Validate client exists
2. Validate bank account exists
3. Convert amount to USD
4. Set status = 'Pending'
5. Do NOT auto-assign (requires manual linking to transactions)

When Used in Transaction:
1. Status changed to 'Used'
2. System owes client this amount = liability increases
3. Cannot be reused

Balance Impact:
- ONLY through journal entry
- Journal entry: DEBIT client account, CREDIT bank account (liability ↑)
- Example: We pay 100,000 YER to client = $1,600 → liability increased (we owe more)
```

---

## USDT RECORDS (Crypto)

### 3. USDT RECEIPT FORM (USDT Inflow)

**Purpose:** Record USDT received from client's wallet into system wallet

**Form Type:** `Quick Add USDT Inflow`  
**Database Collection:** `modern_usdt_records`  
**Record Type:** `'inflow'`  
**Source Types:** `'Manual'` (user entry) or `'BSCScan'` (auto-synced from blockchain)

#### Variables

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Auto | Sequential USDT record ID |
| `date` | ISO string | ✅ | Date/time USDT received |
| `type` | enum | ✅ | Always `'inflow'` |
| `source` | enum | ✅ | `'Manual'` or `'BSCScan'` (from blockchain sync) |
| `status` | enum | ✅ | `'Pending'` \| `'Matched'` \| `'Used'` \| `'Cancelled'` \| `'Confirmed'` |
| `clientId` | string | ❌ | Client ID (null if unassigned from auto-sync) |
| `clientName` | string | ❌ | Client name (null if unassigned) |
| `accountId` | string | ✅ | System's crypto wallet account ID receiving USDT |
| `accountName` | string | ✅ | Crypto wallet name (e.g., "BNB Chain Wallet") |
| `amount` | number | ✅ | USDT amount received |
| `notes` | string | ❌ | Optional notes |
| `txHash` | string | ❌ | Blockchain transaction hash (if from BSCScan) |
| `clientWalletAddress` | string | ❌ | Client's wallet address sending USDT |
| `blockNumber` | number | ❌ | Blockchain block number (for sync tracking) |
| `createdAt` | ISO string | Auto | System timestamp |

#### Logic

```
When USDT Receipt Created (Manual):
1. User selects/enters client
2. Set status = 'Pending'
3. Link to system wallet receiving USDT
4. Store client wallet address for future reference

When USDT Receipt Auto-Synced (BSCScan):
1. Blockchain sync finds transfer to system wallet
2. Create record with status = 'Pending' (unassigned)
3. Amount = exact USDT received
4. System stores txHash + blockNumber for tracking
5. Client assignment happens manually or via smart matching

When Used in Transaction (Deposit):
1. Status changed to 'Used'
2. IF clientId was null → auto-assign to matched client
3. System extracts fee from USDT inflow
4. Remainder converted to fiat and sent back to client

Balance Impact:
- ONLY through journal entry
- Journal entry: DEBIT crypto wallet, CREDIT client account
- Crypto wallet gains USDT asset
- Client liability decreases (we have their USDT)
```

#### Example (Auto-Synced)
```json
{
  "id": "USDT1001",
  "date": "2025-12-01T09:15:00Z",
  "type": "inflow",
  "source": "BSCScan",
  "status": "Pending",
  "clientId": null,
  "clientName": null,
  "accountId": "crypto_wallet_001",
  "accountName": "BNB Chain Wallet",
  "amount": 500,
  "txHash": "0x123abc...",
  "clientWalletAddress": "0x456def...",
  "blockNumber": 69963000,
  "createdAt": "2025-12-01T09:15:00Z"
}
```

---

### 4. USDT PAYMENT FORM (USDT Outflow)

**Purpose:** Record USDT paid out to client's wallet

**Form Type:** `Quick Add USDT Outflow`  
**Database Collection:** `modern_usdt_records`  
**Record Type:** `'outflow'`  
**Source Types:** `'Manual'` (user entry only)

#### Variables

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Auto | Sequential USDT record ID |
| `date` | ISO string | ✅ | Date/time USDT sent |
| `type` | enum | ✅ | Always `'outflow'` |
| `source` | enum | ✅ | Always `'Manual'` |
| `status` | enum | ✅ | `'Pending'` → `'Confirmed'` (when actually sent) |
| `clientId` | string | ✅ | Client ID receiving USDT |
| `clientName` | string | ✅ | Client name |
| `accountId` | string | ✅ | System's crypto wallet sending from |
| `accountName` | string | ✅ | Wallet name |
| `amount` | number | ✅ | USDT amount sent to client |
| `notes` | string | ❌ | Optional notes |
| `txHash` | string | ❌ | Blockchain txHash (populated after actual send) |
| `clientWalletAddress` | string | ✅ | Client's destination wallet address |
| `createdAt` | ISO string | Auto | System timestamp |

#### Logic

```
When USDT Payment Created:
1. Validate client + wallet address
2. Set status = 'Pending' (ready to send)
3. Store destination wallet address
4. System prepares USDT for transfer

When USDT Payment Confirmed (Blockchain):
1. Status changed to 'Confirmed'
2. Store txHash from actual blockchain transfer
3. Record now immutable (proof of payment)

When Used in Transaction (Withdraw):
1. Status changed to 'Used'
2. Client owes system more (they got USDT)
3. Fee already subtracted from fiat inflow

Balance Impact:
- ONLY through journal entry
- Journal entry: DEBIT client account, CREDIT crypto wallet
- System sends USDT asset to client
- Client liability increases (we sent them crypto)
```

#### Example
```json
{
  "id": "USDT2001",
  "date": "2025-12-01T11:30:00Z",
  "type": "outflow",
  "source": "Manual",
  "status": "Confirmed",
  "clientId": "1001910",
  "clientName": "Ahmed Hassan",
  "accountId": "crypto_wallet_001",
  "accountName": "BNB Chain Wallet",
  "amount": 480,
  "clientWalletAddress": "0xUserWallet123...",
  "txHash": "0xTx789xyz...",
  "createdAt": "2025-12-01T11:30:00Z"
}
```

---

## TRANSACTIONS

### 5. TRANSACTION FORM

**Purpose:** Link financial records (cash/USDT) to create double-entry journal entries that affect client balance

**Database Collection:** `modern_transactions`  
**Types:** `'Deposit'` | `'Withdraw'` | `'Transfer'`

#### Transaction Types

| Type | Inflow | Outflow | Business Case |
|------|--------|---------|---------------|
| **Deposit** | Cash (from client) | USDT (to client) | Client sends fiat, receives crypto |
| **Withdraw** | USDT (from client) | Cash (to client) | Client sends crypto, receives fiat |
| **Transfer** | Any → Any | Any → Any | Internal movements or adjustments |

#### Variables

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Auto | Sequential transaction ID |
| `date` | ISO string | Auto | Current date/time when created |
| `type` | enum | ✅ | `'Deposit'` \| `'Withdraw'` \| `'Transfer'` |
| `clientId` | string | ✅ | Client performing transaction |
| `clientName` | string | Auto | Client name from database |
| `status` | enum | Auto | Always `'Confirmed'` (verified at creation) |
| `notes` | string | ❌ | Optional notes |
| `attachment_url` | string | ❌ | URL to supporting document/image |
| `createdAt` | ISO string | Auto | Creation timestamp |
| `inflows` | array | ✅ | Money/crypto coming IN (bank receives, USDT received) |
| `outflows` | array | ✅ | Money/crypto going OUT (USDT sent, cash paid) |
| `summary` | object | Auto | Financial summary |
| `differenceHandling` | enum | ❌ | `'income'` \| `'expense'` (if amounts don't match) |
| `incomeAccountId` | string | ❌ | Where to record gain (if inflow > outflow + fee) |
| `expenseAccountId` | string | ❌ | Where to record loss (if outflow > inflow) |

#### Transaction Legs

Each inflow/outflow leg contains:

| Variable | Type | Description |
|----------|------|-------------|
| `recordId` | string | ID of cash/USDT record linked |
| `type` | enum | `'cash'` or `'usdt'` |
| `accountId` | string | Account involved |
| `accountName` | string | Account display name |
| `amount` | number | Amount in native currency |
| `currency` | string | Currency code |
| `amount_usd` | number | USD converted amount |

#### Summary Object

| Variable | Type | Description |
|----------|------|-------------|
| `total_inflow_usd` | number | Total money received (USD) |
| `total_outflow_usd` | number | Total money sent out (USD) + fee |
| `fee_usd` | number | Exchange fee charged |
| `net_difference_usd` | number | Inflow - Outflow - Fee (gain/loss) |

#### Logic

```
DEPOSIT FLOW (Client: 100,000 YER → ~480 USDT):

Step 1: Create Transaction
- Link 1 cash inflow: 100,000 YER (~$1,600)
- Link 1 USDT outflow: 480 USDT (~$480)
- Fee extracted: 10% of inflow = ~$160
- Net difference: $1,600 - $480 - $160 = $960 (system profit/variance)

Step 2: Fee Calculation
- DEPOSIT: fee_percent on outflows (USDT sent)
- Fee = 480 * (percentage) or minimum fee, whichever is higher
- Minimum fee: $5 (configurable per provider)

Step 3: Record Status Changes
- Cash inflow record: status → 'Used'
- USDT outflow record: status → 'Used'
- Both records hidden from future transactions

Step 4: Journal Entries Created (4 entries):
  1. Inflow entry:
     DEBIT: Bank Account (+1,600 YER asset)
     CREDIT: Client Account (-$1,600 liability)
  2. Outflow entry:
     DEBIT: Client Account (+$480 liability)
     CREDIT: Crypto Wallet (-$480 USDT asset)
  3. Fee entry:
     DEBIT: Client Account (+$160 liability)
     CREDIT: Fee Income (+$160 income)
  4. Variance entry (if net_difference != 0):
     DEBIT/CREDIT based on differenceHandling

Step 5: Balance Update
- Client balance = Sum of all journal credits - debits
- Only journal entries affect balance
- Records are just source documents
```

```
WITHDRAW FLOW (Client: 480 USDT → 95,000 YER):

Step 1: Create Transaction
- Link 1 USDT inflow: 480 USDT (~$480)
- Link 1 cash outflow: 95,000 YER (~$1,520)
- Fee extracted: 5% of inflow (USDT received) = ~$24
- Net difference: $480 - $1,520 = -$1,040 (client profit)

Step 2: Fee Calculation
- WITHDRAW: fee_percent on inflows (USDT received)
- Fee = 480 * (percentage) or minimum fee, whichever is higher

Step 3: Balance Impact
- Client GAINS $1,040 worth of fiat over USDT
- Journal entries record exact amounts
- Variance account captures the gain
```

#### Deduplication Safeguards

**SAFEGUARD #1: Verify no existing journal entries**
- Check if transaction ID already has entries
- Prevents duplicate creation

**SAFEGUARD #2: Verify records not already used**
- Check if linked records have status != 'Used'
- Prevents reusing records in multiple transactions

**SAFEGUARD #3: Validate journal entries balanced**
- Total debits = Total credits
- Essential for accounting integrity

**SAFEGUARD #4: Post-transaction reconciliation**
- Verify entries posted correctly
- Audit trail logged

---

## JOURNAL ENTRIES & BALANCE CALCULATION

### 6. Journal Entry Structure

**Database Collection:** `journal_entries`

| Variable | Type | Description |
|----------|------|-------------|
| `id` | string | Auto-generated journal entry ID |
| `date` | ISO string | Transaction date |
| `description` | string | Entry description (e.g., "Tx #1001 \| Inflow") |
| `debit_account` | string | Account ID being debited |
| `credit_account` | string | Account ID being credited |
| `debit_amount` | number | Amount debited |
| `credit_amount` | number | Amount credited (must equal debit) |
| `amount_usd` | number | USD equivalent |
| `createdAt` | ISO string | System timestamp |
| `debit_account_name` | string | Account name for display |
| `credit_account_name` | string | Account name for display |

### Client Account Formula

```
Client Account ID = "6000" + clientId
Example: Client 1001910 → Account "60001001910"

This is a LIABILITY account:
- Client sends us money → Liability DECREASES
- We send client money → Liability INCREASES

Balance = SUM(Credits) - SUM(Debits)
- Positive balance: We OWE client (they have money with us)
- Negative balance: Client OWES us (we advanced them cash)
```

### Balance Calculation Logic

```
For each journal entry affecting client 60001001910:

If entry CREDITS client account (liability ↓):
  - We received money from client
  - Balance decreases (we owe them less)
  - Example: Client sends $1,000 cash → balance -$1,000

If entry DEBITS client account (liability ↑):
  - We sent money to client
  - Balance increases (we owe them more)
  - Example: We send client $500 USDT → balance +$500

Total Balance = SUM(all credits) - SUM(all debits)

Deduplication:
- Hash each entry: date|debit_acct|credit_acct|amount|description
- Skip duplicates during calculation
- Track duplicate count in audit
```

---

## RECORD LIFECYCLE

### State Transitions

```
Cash/USDT Record States:
┌─────────────────────────────────────────────────┐
│                                                 │
├─ Pending ────→ Used (in transaction)            │
│                                                 │
├─ Pending ────→ Matched (SMS matching)           │
│    └──────────→ Used (in transaction)           │
│                                                 │
├─ Pending ────→ Confirmed (manual verification)  │
│                                                 │
└─ Pending ────→ Cancelled (error/reversal)       │

Key: Only "Pending" or "Matched" can be used in new transactions
     "Used" records are permanently locked
     "Cancelled" records are ignored
```

### What Blocks Record Reuse

1. **Status = 'Used'**: Record already linked to transaction
2. **Hidden from Form Dropdown**: Form filters `status !== 'Used'`
3. **SAFEGUARD #2 Check**: Server validates record not already used
4. **No Manual Edit**: Users cannot change "Used" status back

### What Affects Client Balance

**ONLY:**
- ✅ Journal entries from confirmed transactions
- ✅ Fees recorded in journal
- ✅ Variances/gains/losses in journal

**NEVER:**
- ❌ Record creation alone
- ❌ Record status changes
- ❌ Manual record edits
- ❌ Duplicate records (deduplication catches them)

---

## CURRENT FEES & CONFIGURATION

### Crypto Fees (from `/rate_history/crypto_fees`)

| Fee Type | Value | Description |
|----------|-------|-------------|
| `buy_fee_percent` | % | Fee on USDT purchases (Deposits) |
| `sell_fee_percent` | % | Fee on USDT sales (Withdrawals) |
| `minimum_buy_fee` | USD | Minimum fee for any deposit |
| `minimum_sell_fee` | USD | Minimum fee for any withdrawal |

### Fiat Rates (from `/rate_history/fiat_rates`)

Per currency stores:
- `clientBuy`: Rate client pays when exchanging to USD
- `clientSell`: Rate client receives when exchanging from USD
- `systemBuy`: System's buy rate
- `systemSell`: System's sell rate

---

## AUDIT & COMPLIANCE

### Deduplication Report

After balance calculation, system tracks:
- Duplicate journal entries (count)
- Orphaned records (no transaction)
- Unlinked transactions (no records)
- Balance variances

### Journal Integrity

Every balance calculation includes:
- Transaction count affecting client
- Journal entry count
- Duplicate count detected
- Validation hash (audit trail)

---

## EXAMPLE: COMPLETE DEPOSIT TRANSACTION

**Scenario:** Ahmed Hassan deposits 100,000 YER to get USDT

### Step 1: Create Records

**Cash Inflow Record**
```json
{
  "id": "2001",
  "clientId": "1001910",
  "type": "inflow",
  "amount": 100000,
  "currency": "YER",
  "amountusd": 1600,
  "accountId": "bank_main",
  "status": "Pending"
}
```

**USDT Outflow Record**
```json
{
  "id": "USDT2002",
  "clientId": "1001910",
  "type": "outflow",
  "amount": 480,
  "currency": "USDT",
  "clientWalletAddress": "0x456...",
  "accountId": "crypto_wallet",
  "status": "Pending"
}
```

### Step 2: Create Transaction

```json
{
  "id": "1001",
  "type": "Deposit",
  "clientId": "1001910",
  "inflows": [{
    "recordId": "2001",
    "type": "cash",
    "amount": 100000,
    "currency": "YER",
    "amount_usd": 1600
  }],
  "outflows": [{
    "recordId": "USDT2002",
    "type": "usdt",
    "amount": 480,
    "currency": "USDT",
    "amount_usd": 480
  }],
  "summary": {
    "total_inflow_usd": 1600,
    "total_outflow_usd": 480,
    "fee_usd": 160,
    "net_difference_usd": 960
  }
}
```

### Step 3: Mark Records "Used"

- Record 2001: status → 'Used'
- Record USDT2002: status → 'Used'

### Step 4: Create Journal Entries

**Entry 1 - Inflow**
```
DEBIT: bank_main (Bank account +100,000 YER)
CREDIT: 60001001910 (Client account -$1,600)
Amount: $1,600
```

**Entry 2 - Outflow**
```
DEBIT: 60001001910 (Client account +$480)
CREDIT: crypto_wallet (Wallet -$480 USDT)
Amount: $480
```

**Entry 3 - Fee**
```
DEBIT: 60001001910 (Client account +$160)
CREDIT: 4002 (Fee Income +$160)
Amount: $160
```

**Entry 4 - Variance** (gain of $960)
```
DEBIT: 60001001910 (Client account +$960)
CREDIT: 5001 (Gain on Transaction +$960)
Amount: $960
```

### Step 5: Client Balance Impact

```
Client 1001910 "Ahmed Hassan" Balance:
= SUM(Credits on 60001001910) - SUM(Debits on 60001001910)
= $1,600 - ($480 + $160 + $960)
= $1,600 - $1,600
= $0 (balanced)

Interpretation: System doesn't owe Ahmed anything (he got equivalent value)
```

---

## QUICK REFERENCE

### When to Use Each Form

| Form | When | What Happens |
|------|------|--------------|
| Cash Inflow | Client sends cash | Record received, wait for transaction |
| Cash Outflow | System sends cash | Record payment, wait for transaction |
| USDT Inflow | Client sends USDT | Record received (auto or manual) |
| USDT Outflow | System sends USDT | Record payment to client |
| Transaction | Link records | Generate journal, update balance |

### Critical Rules

1. **Records must be "Pending" or "Matched" to use in transaction**
2. **"Used" records are permanent and cannot be reused**
3. **Only journal entries affect client balance**
4. **Each transaction creates 3+ journal entries**
5. **Debits must equal credits (always balanced)**
6. **All fees stored in journal, not records**

### Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Can't select record | Status = 'Used' | Create new record |
| Balance doesn't change | Transaction not confirmed | Check transaction status |
| Missing fee | Fee below minimum | Increase minimum fee config |
| Duplicate balance | Multiple entries for same tx | Check for duplicate records |

---

**Document Version:** 1.0  
**Last Review:** December 1, 2025  
**System Owner:** Financial Operations  
**Audience:** Finance Team, Auditors, Developers
