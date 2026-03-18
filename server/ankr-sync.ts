import { db } from "./db";
import { storage } from "./storage";
import { watchedWallets, records, customerWallets, customers } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

async function generateRecordNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [last] = await db
    .select({ n: records.recordNumber })
    .from(records)
    .where(sql`${records.recordNumber} LIKE ${"REC-" + year + "-%"}`)
    .orderBy(sql`${records.recordNumber} DESC`)
    .limit(1);
  const num = last?.n ? parseInt(last.n.split("-")[2], 10) + 1 : 1;
  return `REC-${year}-${String(num).padStart(6, "0")}`;
}

const ANKR_RPC_URL = "https://rpc.ankr.com/multichain";

// Ankr blockchain identifiers per network
const NETWORK_TO_BLOCKCHAIN: { [k: string]: string } = {
  bep20:    "bsc",
  bsc:      "bsc",
  erc20:    "eth",
  eth:      "eth",
  trc20:    "tron",
  tron:     "tron",
  polygon:  "polygon",
  matic:    "polygon",
  arbitrum: "arbitrum",
  arb:      "arbitrum",
  avalanche:"avalanche",
  avax:     "avalanche",
  optimism: "optimism",
  op:       "optimism",
};

// Well-known USDT contract addresses per network (for filtering)
const USDT_CONTRACTS: { [network: string]: string } = {
  bsc:      "0x55d398326f99059ff775485246999027b3197955",
  eth:      "0xdac17f958d2ee523a2206206994597c13d831ec7",
  polygon:  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
  arbitrum: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
  avalanche:"0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7",
};

interface AnkrTransfer {
  fromAddress:      string;
  toAddress:        string;
  contractAddress?: string;
  value:            string;       // Human-readable decimal (e.g. "12.5")
  valueRawInteger?: string;       // Raw integer in token base units
  tokenName?:       string;
  tokenSymbol:      string;
  tokenDecimals?:   number;
  transactionHash:  string;
  blockHeight:      number;       // Ankr uses blockHeight, NOT blockNumber
  timestamp:        number;       // Unix timestamp in seconds
  blockchain:       string;
}

interface AnkrPage {
  transfers:     AnkrTransfer[];
  nextPageToken: string | undefined;
}

// Fetch one page of token transfers from Ankr.
// Pass pageToken to continue from a previous page.
async function fetchTokenTransfersPage(
  apiKey:      string,
  walletAddress: string,
  blockchain:  string,
  fromBlock?:  number,
  pageToken?:  string,
): Promise<AnkrPage> {
  const params: { [k: string]: any } = {
    address:    [walletAddress],
    blockchain: [blockchain],
    pageSize:   100,
  };
  if (fromBlock != null) params.fromBlock = fromBlock;
  if (pageToken)         params.pageToken = pageToken;

  const response = await fetch(`${ANKR_RPC_URL}/${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method:  "ankr_getTokenTransfers",
      params,
      id:      1,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`Ankr HTTP ${response.status}: ${response.statusText}`);
  const data = await response.json() as any;
  if (data.error) throw new Error(`Ankr API: ${data.error.message ?? JSON.stringify(data.error)}`);

  return {
    transfers:     (data.result?.transfers ?? []) as AnkrTransfer[],
    nextPageToken: data.result?.nextPageToken ?? undefined,
  };
}

// ─── Parse amount with maximum precision ──────────────────────────────────────
function parseAmount(t: AnkrTransfer): number {
  const decimals = t.tokenDecimals ?? 18;
  if (t.valueRawInteger && /^\d+$/.test(t.valueRawInteger)) {
    try {
      const raw = BigInt(t.valueRawInteger);
      const divisor = BigInt(10) ** BigInt(Math.min(decimals, 36));
      return Number(raw * BigInt(1_000_000) / divisor) / 1_000_000;
    } catch { /* fall through */ }
  }
  return parseFloat(t.value ?? "0");
}

// ─── Main sync function ────────────────────────────────────────────────────────
// Processes up to MAX_NEW_PER_RUN NEW records per call, then saves the block
// checkpoint so the next run resumes from exactly where this one stopped.
const MAX_NEW_PER_RUN = 100;
const MIN_AMOUNT      = 0.1;   // Skip dust / zero-value events

export async function syncWallet(
  walletId: string,
  apiKey:   string,
): Promise<{ created: number; skipped: number; highestBlock?: number; hasMore?: boolean; error?: string }> {
  const [wallet] = await db.select().from(watchedWallets).where(eq(watchedWallets.id, walletId));
  if (!wallet) return { created: 0, skipped: 0, error: "Wallet not found" };
  if (!wallet.isActive) return { created: 0, skipped: 0 };

  const blockchain = NETWORK_TO_BLOCKCHAIN[wallet.network.toLowerCase()] ?? wallet.network.toLowerCase();
  const walletLower = wallet.walletAddress.toLowerCase();

  // Block-based checkpoint: resume from the block after the last one we processed.
  const fromBlock = wallet.lastSyncedBlock != null ? wallet.lastSyncedBlock + 1 : undefined;

  let created      = 0;
  let skipped      = 0;
  let highestBlock = wallet.lastSyncedBlock ?? 0;
  let hasMore      = false;
  let pageToken: string | undefined;
  // lastSafeBlock: highest block where we are certain ALL transfers have been saved.
  // We advance this only after completing a page where created < MAX_NEW_PER_RUN.
  let lastSafeBlock = highestBlock;

  try {
    pageLoop:
    while (true) {
      const page = await fetchTokenTransfersPage(apiKey, wallet.walletAddress, blockchain, fromBlock, pageToken);
      const { transfers, nextPageToken } = page;

      if (transfers.length === 0) break;

      for (const t of transfers) {
        const blockNum = t.blockHeight ?? 0;
        if (blockNum > highestBlock) highestBlock = blockNum;

        // ─── Direction detection ───────────────────────────────────────────────
        // Ankr returns transfers where our wallet is EITHER sender OR receiver.
        const isInflow  = t.toAddress?.toLowerCase()   === walletLower;
        const isOutflow = t.fromAddress?.toLowerCase() === walletLower;
        if (!isInflow && !isOutflow) { skipped++; continue; }
        const direction = isInflow ? "inflow" : "outflow";

        // ─── Asset / contract filter ───────────────────────────────────────────
        if (wallet.assetCurrency === "USDT") {
          const knownContract = USDT_CONTRACTS[blockchain];
          if (knownContract && t.contractAddress?.toLowerCase() !== knownContract.toLowerCase()) {
            skipped++;
            continue;
          }
        } else if (t.tokenSymbol && t.tokenSymbol.toUpperCase() !== wallet.assetCurrency.toUpperCase()) {
          skipped++;
          continue;
        }

        // ─── Deduplication ────────────────────────────────────────────────────
        const [existing] = await db
          .select({ id: records.id })
          .from(records)
          .where(eq(records.txidOrReferenceNumber, t.transactionHash))
          .limit(1);
        if (existing) { skipped++; continue; }

        // ─── Amount parsing & minimum threshold ───────────────────────────────
        const amountNum = parseAmount(t);
        if (!isFinite(amountNum) || amountNum < MIN_AMOUNT) { skipped++; continue; }
        const amount = amountNum.toFixed(6);

        // ─── Counter-party address ────────────────────────────────────────────
        const counterPartyAddress = isInflow ? t.fromAddress : t.toAddress;

        // ─── Auto-match to a customer via customer_wallets whitelist ──────────
        // Each customer's known wallet addresses are stored in customer_wallets.
        // The addressOrId field stores the exact identifier (wallet address,
        // platform UID, bank account number) defined by the service provider's
        // field type. We match case-insensitively so on-chain hex addresses work.
        let matchedCustomerId:   string | undefined;
        let matchedClientName:   string | undefined;
        let isWalletWhitelisted  = false;

        if (counterPartyAddress) {
          const [wMatch] = await db
            .select({ customerId: customerWallets.customerId })
            .from(customerWallets)
            .where(sql`LOWER(${customerWallets.addressOrId}) = LOWER(${counterPartyAddress}) AND ${customerWallets.isActive} = true`)
            .limit(1);

          if (wMatch) {
            const [cust] = await db
              .select({ id: customers.id, fullName: customers.fullName })
              .from(customers)
              .where(eq(customers.id, wMatch.customerId))
              .limit(1);
            if (cust) {
              matchedCustomerId   = cust.id;
              matchedClientName   = cust.fullName;
              isWalletWhitelisted = true;
            }
          }
        }

        // ─── Insert record ────────────────────────────────────────────────────
        const txDate       = t.timestamp ? new Date(t.timestamp * 1000) : new Date();
        const recordNumber = await generateRecordNumber();

        const [inserted] = await db.insert(records).values({
          type:                  "crypto",
          direction,
          source:                "ankr_sync",
          recordMethod:          "auto",
          recordNumber,
          accountId:             wallet.accountId   ?? undefined,
          accountName:           wallet.accountName ?? undefined,
          amount,
          currency:              wallet.assetCurrency,
          txidOrReferenceNumber: t.transactionHash,
          // networkOrId = the counterparty wallet address (from/to on-chain address).
          // clientSenderName / clientRecipientName are for human names only,
          // NOT for blockchain addresses — never auto-populate them from sync.
          networkOrId:           counterPartyAddress ?? undefined,
          customerId:            matchedCustomerId,
          clientName:            matchedClientName,
          clientMatchMethod:     isWalletWhitelisted ? "auto_wallet" : undefined,
          isWhitelisted:         isWalletWhitelisted,
          blockNumberOrBatchId:  blockNum > 0 ? String(blockNum) : undefined,
          assetOrProviderName:   t.tokenSymbol ?? wallet.assetCurrency,
          // Draft → we post the JE immediately below; stage advances to recorded/auto_matched
          processingStage:       "draft",
          endpointName:          wallet.label,
          notes:                 `Auto-synced via Ankr | ${blockchain} | ${direction}${blockNum > 0 ? ` | block ${blockNum}` : ""}${isWalletWhitelisted ? ` | auto-matched: ${matchedClientName}` : ""}`,
          createdAt:             txDate,
        } as any).returning({ id: records.id });
        created++;

        // ─── Post journal entry immediately — advances stage to recorded or auto_matched ──
        // This mirrors what the UI "Record Now" button does, ensuring every Ankr-synced
        // record has proper double-entry accounting from the moment it is created.
        if (inserted?.id) {
          try {
            await storage.generateRecordJournalEntry(inserted.id, 'ankr_sync');
            // Advance stage: recorded for unmatched, auto_matched for whitelisted customer
            const finalStage = (isWalletWhitelisted && matchedCustomerId) ? 'auto_matched' : 'recorded';
            await db.update(records)
              .set({ processingStage: finalStage })
              .where(eq(records.id, inserted.id));
          } catch (jeErr: any) {
            // JE failure (e.g. no open period) — keep record as draft so staff can post manually
            console.warn(`[Ankr Sync] JE failed for ${recordNumber}: ${jeErr.message}`);
          }
        }

        // ─── Per-run cap: 100 new records max ────────────────────────────────
        // Stop here, save checkpoint at blockNum. Transfers in the same block
        // after this position will be caught by txHash dedup on next run.
        if (created >= MAX_NEW_PER_RUN) {
          lastSafeBlock = blockNum;
          hasMore       = true;
          break pageLoop;
        }
      }

      // Completed this page without hitting the cap — all transfers processed safely
      lastSafeBlock = highestBlock;

      if (nextPageToken) {
        // More pages available — fetch next page (still within this sync run)
        pageToken = nextPageToken;
      } else {
        // No more pages — fully caught up
        break;
      }
    }

    // ─── Save checkpoint ───────────────────────────────────────────────────────
    // Advance to the highest safe block we've fully processed.
    const newCheckpoint = lastSafeBlock > 0 ? lastSafeBlock : wallet.lastSyncedBlock;
    await db.update(watchedWallets).set({
      lastSyncAt:      new Date(),
      lastSyncedBlock: newCheckpoint,
      lastSyncError:   null,
      totalSynced:     (wallet.totalSynced ?? 0) + created,
      updatedAt:       new Date(),
    }).where(eq(watchedWallets.id, walletId));

    if (created > 0 || skipped > 0) {
      console.log(
        `[Ankr Sync] ${wallet.label}: +${created} new (${skipped} skipped) — checkpoint block ${newCheckpoint}${hasMore ? " [MORE PENDING]" : ""}`
      );
    }
    return { created, skipped, highestBlock: newCheckpoint ?? undefined, hasMore };

  } catch (err: any) {
    const msg = err.message ?? "Unknown error";
    await db.update(watchedWallets).set({
      lastSyncAt:    new Date(),
      lastSyncError: msg,
      updatedAt:     new Date(),
    }).where(eq(watchedWallets.id, walletId));
    console.error(`[Ankr Sync] Wallet ${wallet.label} (${walletId}) error:`, msg);
    return { created: 0, skipped: 0, error: msg };
  }
}

let _pollingInterval: ReturnType<typeof setInterval> | null = null;

export function startAnkrPolling(intervalMs = 2 * 60 * 1000) {
  if (_pollingInterval) return;

  async function poll() {
    const apiKey = process.env.ANKR_API_KEY;
    if (!apiKey) return;

    try {
      const active = await db.select().from(watchedWallets).where(eq(watchedWallets.isActive, true));
      if (!active.length) return;
      let totalCreated = 0;
      for (const w of active) {
        const result = await syncWallet(w.id, apiKey);
        totalCreated += result.created;
        // If wallet still has pending transfers, log it (next poll will continue)
        if (result.hasMore) {
          console.log(`[Ankr Sync] ${w.label}: more transfers pending — will continue next poll`);
        }
      }
      if (totalCreated > 0) console.log(`[Ankr Sync] Poll complete — ${totalCreated} new records created`);
    } catch (e: any) {
      console.error("[Ankr Sync] Poll error:", e.message);
    }
  }

  poll();
  _pollingInterval = setInterval(poll, intervalMs);
  console.log(`✅ Ankr blockchain sync started (every ${intervalMs / 1000}s)`);
}

export function stopAnkrPolling() {
  if (_pollingInterval) { clearInterval(_pollingInterval); _pollingInterval = null; }
}

export { NETWORK_TO_BLOCKCHAIN };
