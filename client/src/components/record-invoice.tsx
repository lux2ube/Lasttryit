import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE DESIGN PRINCIPLES (enforced in this component):
//
//  ✅ SHOW to client:
//     • Their name, client ID, phone
//     • Record number, date, confirmed timestamp
//     • Amount (crypto or fiat), currency, USD equivalent
//     • Service fee % and computed amount (in USD)
//     • For crypto: recipient/sender wallet address, tx hash, network, block
//     • For cash: fiat amount, USD equivalent (no exchange rate — spread embedded)
//
//  ❌ NEVER expose to client:
//     • accountName / accountId (our internal account routing)
//     • contraAccountName / contraAccountId
//     • Internal auto-sync notes ("Auto-synced via Ankr", "auto-matched", etc.)
//     • recordMethod ("auto" / "manual")
//     • source field ("ankr_sync", "manual_entry")
//     • Any IFRS account codes or journal references
// ─────────────────────────────────────────────────────────────────────────────

interface FinancialRecord {
  id: string;
  recordNumber: string;
  type: "cash" | "crypto";
  direction: "inflow" | "outflow";
  processingStage: string;
  amount: string;
  currency: string;
  usdEquivalent?: string;
  buyRate?: string;
  sellRate?: string;
  exchangeRate?: string;
  // Crypto-only fee columns
  serviceFeeRate?: string;     // service fee % — null for cash
  serviceFeeUsd?: string;      // service fee in USD (stored) — null for cash
  networkFeeUsd?: string;      // gas/network fee — null for cash
  // Cash-only spread columns
  spreadRate?: string;         // FX spread % — null for crypto
  spreadUsd?: string;          // FX spread income in USD — null for crypto
  accountName?: string;           // ← internal — NEVER render
  contraAccountName?: string;     // ← internal — NEVER render
  accountField?: string;
  clientName?: string;
  clientSenderName?: string;
  clientRecipientName?: string;
  assetOrProviderName?: string;
  networkOrId?: string;
  txidOrReferenceNumber?: string;
  blockNumberOrBatchId?: string;
  recordMethod?: string;          // ← internal — NEVER render
  notes?: string;
  createdAt: string;
  updatedAt: string;
  logEvents?: any[];
  customerId?: string;
}

interface Customer {
  id: string;
  customerId: string;
  fullName: string;
  phonePrimary: string;
}

interface RecordInvoiceProps {
  record: FinancialRecord;
  customer?: Customer;
  size?: "sm" | "default";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function confirmedEvent(record: FinancialRecord) {
  return (record.logEvents ?? []).find((e: any) => e.action === "confirmed");
}
function confirmedAt(record: FinancialRecord): string {
  const ev = confirmedEvent(record);
  const d = ev?.timestamp ? new Date(ev.timestamp) : new Date(record.updatedAt);
  return format(d, "dd MMM yyyy, HH:mm 'UTC'");
}
function confirmedDateShort(record: FinancialRecord): string {
  const ev = confirmedEvent(record);
  const d = ev?.timestamp ? new Date(ev.timestamp) : new Date(record.updatedAt);
  return format(d, "dd MMMM yyyy");
}

function docTitle(type: string, direction: string): string {
  if (type === "cash"   && direction === "inflow")  return "Cash Deposit Receipt";
  if (type === "cash"   && direction === "outflow") return "Cash Payment Receipt";
  if (type === "crypto" && direction === "inflow")  return "Crypto Deposit Confirmation";
  return "Crypto Withdrawal Confirmation";
}

function fmt(n: number, maxDp = 6): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: maxDp });
}

/** Strip internal system-generated notes. Returns null if no client-facing content. */
function clientNotes(raw?: string): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  // Internal auto-sync patterns
  if (lower.includes("auto-synced via")) return null;
  if (lower.includes("auto-matched"))    return null;
  if (lower.includes("ankr"))            return null;
  if (lower.match(/\| bsc \||\| tron \||\| eth \|/)) return null;
  // Strip "block XXXXXXXX" frag if it's the whole note
  if (lower.match(/^block \d+$/))        return null;
  return raw.trim() || null;
}

/** Shorten crypto address/hash for display */
function shorten(s: string, head = 14, tail = 10): string {
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/** Parse network code to a human-readable label */
function networkLabel(n?: string): string {
  if (!n) return "";
  const map: Record<string, string> = {
    usdt_bep20: "BEP-20 (Binance Smart Chain)",
    usdt_trc20: "TRC-20 (TRON)",
    usdt_erc20: "ERC-20 (Ethereum)",
    bep20:      "BEP-20 (Binance Smart Chain)",
    trc20:      "TRC-20 (TRON)",
    erc20:      "ERC-20 (Ethereum)",
    ton:        "TON",
    solana:     "Solana",
    aptos:      "Aptos",
  };
  return map[n.toLowerCase()] ?? n.toUpperCase();
}

// ── Inline style primitives ───────────────────────────────────────────────────

const NAVY   = "#0f2057";
const GOLD   = "#F5A623";
const TEAL   = "#0a7c6e";
const DGRAY  = "#374151";
const MGRAY  = "#6b7280";
const LGRAY  = "#f9fafb";
const BORDER = "#e5e7eb";
const GREEN  = "#15803d";
const AMBER  = "#b45309";
const WHITE  = "#ffffff";

/** Compact label + value row used in the detail grid */
const KV = ({ label, value, mono, last, accent, bold }: {
  label: string; value?: string | React.ReactNode;
  mono?: boolean; last?: boolean; accent?: string; bold?: boolean;
}) => {
  if (!value && value !== 0) return null;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "5px 14px",
      borderBottom: last ? "none" : `1px solid ${BORDER}`,
      gap: "8px",
    }}>
      <span style={{ fontSize: "9.5px", fontWeight: 600, color: MGRAY, textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: "11px", fontWeight: bold ? 700 : 500,
        fontFamily: mono ? "'Courier New', monospace" : "inherit",
        color: accent ?? DGRAY, wordBreak: "break-all", textAlign: "right",
      }}>{value}</span>
    </div>
  );
};

const SectionHead = ({ title }: { title: string }) => (
  <div style={{
    padding: "4px 14px",
    background: "#f1f5f9",
    borderBottom: `1px solid ${BORDER}`,
    borderTop: `1px solid ${BORDER}`,
    fontSize: "9px", fontWeight: 700, letterSpacing: "1.2px",
    textTransform: "uppercase", color: MGRAY,
  }}>{title}</div>
);

// ── Invoice Template ──────────────────────────────────────────────────────────

function InvoiceTemplate({ record, customer }: { record: FinancialRecord; customer?: Customer }) {

  const isCrypto = record.type === "crypto";
  const isInflow = record.direction === "inflow";

  // ── Client identity ───────────────────────────────────────────────────────
  const clientName  = customer?.fullName     ?? record.clientName ?? "—";
  const customerId  = customer?.customerId   ?? "—";
  const clientPhone = customer?.phonePrimary ?? "—";
  const isMatched   = !!customer;

  // ── Amounts ───────────────────────────────────────────────────────────────
  const amount       = parseFloat(record.amount);
  const principalUsd = record.usdEquivalent ? parseFloat(record.usdEquivalent) : null;

  const feeRate      = record.serviceFeeRate ? parseFloat(record.serviceFeeRate) : null;
  const feeAmountUsd: number | null = record.serviceFeeUsd
    ? parseFloat(record.serviceFeeUsd)
    : (feeRate !== null && principalUsd !== null ? (principalUsd * feeRate) / 100 : null);
  const netFeeUsd = record.networkFeeUsd ? parseFloat(record.networkFeeUsd) : 0;

  const netSettledUsd   = (isCrypto && isInflow  && feeAmountUsd !== null && principalUsd !== null) ? principalUsd - feeAmountUsd : null;
  const totalChargedUsd = (isCrypto && !isInflow && feeAmountUsd !== null && principalUsd !== null) ? principalUsd + feeAmountUsd + netFeeUsd : null;

  // ── Reference fields ──────────────────────────────────────────────────────
  const txHash    = record.txidOrReferenceNumber;
  const shortTx   = txHash ? shorten(txHash, 16, 10) : null;
  const walletAddr = record.clientRecipientName ?? record.clientSenderName ?? record.accountField;
  const shortAddr  = walletAddr ? shorten(walletAddr, 14, 10) : null;

  // ── Notes ─────────────────────────────────────────────────────────────────
  const safeNotes = clientNotes(record.notes);

  // ── Direction color ───────────────────────────────────────────────────────
  const dirColor  = isInflow ? GREEN : AMBER;
  const dirBg     = isInflow ? "#f0fdf4" : "#fffbeb";
  const dirBorder = isInflow ? "#bbf7d0" : "#fde68a";

  return (
    <div style={{
      width: "560px",
      background: WHITE,
      fontFamily: "'Segoe UI', Arial, system-ui, sans-serif",
      direction: "ltr",
      color: DGRAY,
      fontSize: "11px",
      lineHeight: "1.45",
      border: `1px solid ${BORDER}`,
      borderRadius: "8px",
      overflow: "hidden",
    }}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div style={{
        background: NAVY,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        {/* Left: logo + company */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img
            src="/coincash-logo.png"
            alt="Coin Cash"
            crossOrigin="anonymous"
            style={{ width: "36px", height: "36px", objectFit: "contain", borderRadius: "7px", background: "rgba(255,255,255,0.09)", padding: "3px" }}
          />
          <div>
            <div style={{ color: WHITE, fontSize: "15px", fontWeight: 800, letterSpacing: "-0.3px", lineHeight: 1.1 }}>Coin Cash</div>
            <div style={{ color: GOLD, fontSize: "9.5px", fontWeight: 500, marginTop: "2px" }}>Money Exchange &amp; Crypto Services</div>
          </div>
        </div>
        {/* Right: doc type + number + date */}
        <div style={{ textAlign: "right" }}>
          <div style={{ color: GOLD, fontSize: "12px", fontWeight: 800, letterSpacing: "0.2px" }}>
            {docTitle(record.type, record.direction)}
          </div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "10px", fontFamily: "'Courier New', monospace", marginTop: "3px" }}>
            {record.recordNumber}
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", marginTop: "2px" }}>
            {confirmedDateShort(record)}
          </div>
        </div>
      </div>

      {/* Gold stripe */}
      <div style={{ height: "3px", background: `linear-gradient(90deg, ${GOLD}, ${NAVY})` }} />

      {/* ══ STATUS BAR ══════════════════════════════════════════════════════ */}
      <div style={{
        background: dirBg,
        borderBottom: `1px solid ${dirBorder}`,
        padding: "6px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: dirColor, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: "10.5px", color: dirColor, letterSpacing: "0.3px" }}>
            {isInflow ? "FUNDS RECEIVED" : "FUNDS SENT"}
          </span>
          <span style={{
            fontSize: "9px", fontWeight: 700, color: WHITE,
            background: isCrypto ? "#6366f1" : "#0891b2",
            padding: "1px 7px", borderRadius: "20px",
          }}>
            {isCrypto ? "CRYPTO" : "CASH"}
          </span>
        </div>
        <span style={{ color: MGRAY, fontSize: "9px" }}>Confirmed · {confirmedAt(record)}</span>
      </div>

      {/* ══ AMOUNT HERO ═════════════════════════════════════════════════════ */}
      <div style={{
        background: LGRAY,
        padding: "14px 18px",
        textAlign: "center",
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ color: MGRAY, fontSize: "9px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.9px" }}>
          {isCrypto
            ? (isInflow ? "Amount Deposited" : "Amount Transferred")
            : (isInflow ? "Amount Received"  : "Amount Paid Out")}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: "6px", marginTop: "4px" }}>
          <span style={{ color: NAVY, fontSize: "28px", fontWeight: 800, fontFamily: "'Courier New', monospace", lineHeight: 1 }}>
            {fmt(amount, isCrypto ? 6 : 2)}
          </span>
          <span style={{ color: isCrypto ? "#6366f1" : TEAL, fontSize: "14px", fontWeight: 700 }}>
            {record.currency}
          </span>
        </div>
        {principalUsd !== null && record.currency !== "USD" && (
          <div style={{ color: MGRAY, fontSize: "10px", marginTop: "3px" }}>
            ≈ <strong style={{ color: NAVY }}>${fmt(principalUsd, 2)}</strong> USD
          </div>
        )}
      </div>

      {/* ── Fee summary (crypto only) ────────────────────────────────────── */}
      {isCrypto && (feeAmountUsd !== null || netFeeUsd > 0) && (
        <div style={{ borderBottom: `1px solid ${BORDER}` }}>
          {feeAmountUsd !== null && feeRate !== null && (
            <KV
              label={`Service Fee (${fmt(feeRate, 2)}%)`}
              value={`${isInflow ? "−" : "+"} $${fmt(feeAmountUsd, 2)}`}
              accent={AMBER}
            />
          )}
          {!isInflow && netFeeUsd > 0 && (
            <KV label="Network Fee" value={`+ $${fmt(netFeeUsd, 2)}`} accent="#7c3aed" />
          )}
          {isInflow && netSettledUsd !== null && (
            <KV label="Net Settlement" value={`$${fmt(netSettledUsd, 2)} USD`} accent={GREEN} bold />
          )}
          {!isInflow && totalChargedUsd !== null && feeAmountUsd !== null && (
            <KV label="Total Charged" value={`$${fmt(totalChargedUsd, 2)} USD`} accent={AMBER} bold last />
          )}
        </div>
      )}
      {isCrypto && feeAmountUsd === null && (
        <div style={{ padding: "5px 14px", borderBottom: `1px solid ${BORDER}`, background: "#f8faff" }}>
          <span style={{ color: MGRAY, fontSize: "9.5px", fontStyle: "italic" }}>Service fees are included in the amount above.</span>
        </div>
      )}
      {!isCrypto && (
        <div style={{ padding: "5px 14px", borderBottom: `1px solid ${BORDER}`, background: "#f8faff" }}>
          <span style={{ color: MGRAY, fontSize: "9.5px", fontStyle: "italic" }}>Exchange rate embedded in agreed spread — not disclosed separately.</span>
        </div>
      )}

      {/* ══ DETAILS GRID (two columns) ══════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${BORDER}` }}>

        {/* Left column: Client */}
        <div style={{ borderRight: `1px solid ${BORDER}` }}>
          <SectionHead title="Client" />
          <KV label="Name"      value={clientName} bold />
          <KV label="Client ID" value={customerId} mono />
          {isMatched
            ? <KV label="Phone" value={clientPhone} last />
            : <KV label="Status" value="Walk-in" accent={AMBER} last />
          }
        </div>

        {/* Right column: Reference */}
        <div>
          <SectionHead title="Reference" />
          <KV label="Record No." value={record.recordNumber} mono bold />
          <KV label="Date"        value={confirmedDateShort(record)} />
          <KV label="Type"        value={
            isCrypto
              ? (isInflow ? "Crypto Deposit"    : "Crypto Withdrawal")
              : (isInflow ? "Cash Deposit"      : "Cash Payment")
          } last />
        </div>
      </div>

      {/* ── Blockchain / Transfer Details ────────────────────────────────── */}
      {(isCrypto || record.txidOrReferenceNumber) && (
        <>
          <SectionHead title={isCrypto ? "Blockchain Details" : "Transfer Details"} />
          {record.assetOrProviderName && (
            <KV label="Asset" value={record.assetOrProviderName} />
          )}
          {isCrypto && record.networkOrId && (
            <KV label="Network" value={networkLabel(record.networkOrId)} />
          )}
          {isCrypto && shortAddr && (
            <KV
              label={isInflow ? "From Wallet" : "To Wallet"}
              value={shortAddr}
              mono
            />
          )}
          {isCrypto && shortTx && (
            <KV label="TX Hash" value={shortTx} mono accent={TEAL} />
          )}
          {isCrypto && record.blockNumberOrBatchId && (
            <KV label="Block" value={record.blockNumberOrBatchId} mono last={!safeNotes && !record.txidOrReferenceNumber} />
          )}
          {!isCrypto && record.txidOrReferenceNumber && (
            <KV label="Reference" value={record.txidOrReferenceNumber} mono last />
          )}
        </>
      )}

      {/* ── Notes ────────────────────────────────────────────────────────── */}
      {safeNotes && (
        <div style={{ padding: "7px 14px", background: "#fffbeb", borderTop: `1px solid #fde68a`, borderBottom: `1px solid ${BORDER}` }}>
          <span style={{ color: AMBER, fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Note · </span>
          <span style={{ color: "#78350f", fontSize: "10.5px" }}>{safeNotes}</span>
        </div>
      )}

      {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
      <div style={{
        background: NAVY,
        padding: "8px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "8.5px" }}>
          © {new Date().getFullYear()} Coin Cash · support@ycoincash.com
        </div>
        <div style={{
          background: "rgba(255,255,255,0.1)", color: WHITE,
          fontSize: "8.5px", fontWeight: 700, fontFamily: "'Courier New', monospace",
          padding: "2px 8px", borderRadius: "3px", letterSpacing: "0.8px",
        }}>
          ✓ CONFIRMED
        </div>
        <div style={{ color: GOLD, fontSize: "9px", fontWeight: 600 }}>ycoincash.com</div>
      </div>

      {/* Gold bottom stripe */}
      <div style={{ height: "2px", background: GOLD }} />
    </div>
  );
}

// ── Download hook ─────────────────────────────────────────────────────────────

// Extract fee breakdown from confirmation JE lines when record fields are missing.
// Account codes: 2101=suspense, 4101=service fee (crypto), 4201=FX spread (cash), 4301=network fee (crypto).
async function backfillFeeFromJE(record: FinancialRecord): Promise<FinancialRecord> {
  if (record.processingStage !== 'confirmed') return record;
  const hasFeeData = record.usdEquivalent && (
    (record.type === 'crypto' && record.serviceFeeUsd) ||
    (record.type === 'cash'   && record.spreadUsd !== undefined)
  );
  if (hasFeeData) return record;
  try {
    const res = await fetch(`/api/accounting/journal-entries/for-record/${record.id}`, { credentials: 'include' });
    if (!res.ok) return record;
    const { lines } = await res.json() as { lines: Array<{ accountCode: string; debitAmount: string; creditAmount: string }> };
    const cr = (code: string) => lines.filter(l => l.accountCode === code).reduce((s, l) => s + parseFloat(l.creditAmount ?? '0'), 0);
    const dr = (code: string) => lines.filter(l => l.accountCode === code).reduce((s, l) => s + parseFloat(l.debitAmount  ?? '0'), 0);
    const principalUsd = record.direction === 'inflow' ? dr('2101') : cr('2101');
    if (principalUsd <= 0) return record;
    if (record.type === 'crypto') {
      const svcFeeUsd = cr('4101');
      const gasUsd    = cr('4301');
      const feeRate   = principalUsd > 0 ? (svcFeeUsd / principalUsd) * 100 : 0;
      return { ...record, usdEquivalent: String(principalUsd.toFixed(4)), serviceFeeRate: String(feeRate.toFixed(4)), serviceFeeUsd: String(svcFeeUsd.toFixed(4)), networkFeeUsd: String(gasUsd.toFixed(6)) };
    } else {
      const sprdUsd  = cr('4201');
      const sprdRate = principalUsd > 0 ? (sprdUsd / principalUsd) * 100 : 0;
      return { ...record, usdEquivalent: String(principalUsd.toFixed(4)), spreadUsd: String(sprdUsd.toFixed(4)), spreadRate: String(sprdRate.toFixed(4)) };
    }
  } catch { return record; }
}

export function useInvoiceDownload() {
  const [loading, setLoading] = useState(false);

  const download = async (record: FinancialRecord, customer?: Customer) => {
    setLoading(true);
    try {
      const enriched = await backfillFeeFromJE(record);
      const html2canvas = (await import("html2canvas")).default;

      const container = document.createElement("div");
      container.style.cssText = "position:fixed;left:-9999px;top:0;z-index:-1;";
      document.body.appendChild(container);

      const { createRoot } = await import("react-dom/client");
      const root = createRoot(container);
      root.render(<InvoiceTemplate record={enriched} customer={customer} />);

      await new Promise(r => setTimeout(r, 500));

      const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const link = document.createElement("a");
      link.download = `${record.recordNumber}-receipt.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      root.unmount();
      document.body.removeChild(container);
    } catch (e) {
      console.error("Invoice download failed", e);
    } finally {
      setLoading(false);
    }
  };

  return { download, loading };
}

// ── Download Button ───────────────────────────────────────────────────────────

export function InvoiceDownloadButton({ record, customer, size = "sm" }: RecordInvoiceProps) {
  const { download, loading } = useInvoiceDownload();

  if (record.processingStage !== "confirmed") return null;

  return (
    <Button
      size={size}
      variant="outline"
      className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
      onClick={() => download(record, customer)}
      disabled={loading}
      data-testid={`button-invoice-${record.id}`}
    >
      {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
      Receipt
    </Button>
  );
}
