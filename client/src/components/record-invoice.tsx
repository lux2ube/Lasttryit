import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { format } from "date-fns";

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
  serviceFeeRate?: string;
  serviceFeeUsd?: string;
  networkFeeUsd?: string;
  spreadRate?: string;
  spreadUsd?: string;
  accountName?: string;
  contraAccountName?: string;
  accountField?: string;
  clientName?: string;
  clientSenderName?: string;
  clientRecipientName?: string;
  assetOrProviderName?: string;
  networkOrId?: string;
  txidOrReferenceNumber?: string;
  blockNumberOrBatchId?: string;
  recordMethod?: string;
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

function confirmedEvent(record: FinancialRecord) {
  return (record.logEvents ?? []).find((e: any) => e.action === "confirmed");
}

function confirmedAt(record: FinancialRecord): string {
  const ev = confirmedEvent(record);
  const d = ev?.timestamp ? new Date(ev.timestamp) : new Date(record.updatedAt);
  return format(d, "dd/MM/yyyy (HH:mm)");
}

function fmt(n: number, maxDp = 6): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: maxDp });
}

function clientNotes(raw?: string): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("auto-synced via")) return null;
  if (lower.includes("auto-matched"))    return null;
  if (lower.includes("ankr"))            return null;
  if (lower.match(/\| bsc \||\| tron \||\| eth \|/)) return null;
  if (lower.match(/^block \d+$/))        return null;
  return raw.trim() || null;
}

function typeLabel(type: string, direction: string): string {
  if (type === "cash"   && direction === "inflow")  return "إيداع نقدي — Cash Deposit";
  if (type === "cash"   && direction === "outflow") return "سحب نقدي — Cash Withdrawal";
  if (type === "crypto" && direction === "inflow")  return "إيداع رقمي — Crypto Deposit";
  return "سحب رقمي — Crypto Withdrawal";
}

const GOLD      = "#F5A623";
const GOLD_DARK = "#C4850C";
const GOLD_BG   = "#FEF9F0";
const GOLD_RING = "#FDF0D5";
const DARK      = "#1A1A2E";
const TEXT      = "#2D2D3F";
const TEXT_SEC  = "#71717A";
const BORDER    = "#F0EDE8";
const WHITE     = "#FFFFFF";
const ROW_ALT   = "#FAFAF8";
const GREEN     = "#16A34A";

const Row = ({ label, value, mono, accent, bold, alt, labelAr }: {
  label: string; value?: string | React.ReactNode;
  mono?: boolean; accent?: string; bold?: boolean; alt?: boolean;
  labelAr?: string;
}) => {
  if (!value && value !== 0) return null;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 24px",
      borderBottom: `1px solid ${BORDER}`,
      background: alt ? ROW_ALT : WHITE,
    }}>
      <span style={{
        fontSize: "12.5px", fontWeight: 500, color: TEXT_SEC,
        flexShrink: 0,
      }}>
        {label}
        {labelAr && <span style={{ display: "block", fontSize: "10px", color: "#A1A1AA", fontWeight: 400, marginTop: "1px", direction: "rtl", textAlign: "left" }}>{labelAr}</span>}
      </span>
      <span style={{
        fontSize: "13px",
        fontWeight: bold ? 700 : 500,
        fontFamily: mono ? "'SF Mono', 'Fira Code', 'Courier New', monospace" : "inherit",
        color: accent ?? TEXT,
        wordBreak: "break-all", textAlign: "right",
        direction: "ltr",
        maxWidth: "58%",
      }}>{value}</span>
    </div>
  );
};

function InvoiceTemplate({ record, customer }: { record: FinancialRecord; customer?: Customer }) {
  const isCrypto = record.type === "crypto";
  const isInflow = record.direction === "inflow";

  const clientName  = customer?.fullName     ?? record.clientName ?? "—";
  const customerId  = customer?.customerId   ?? "—";
  const clientPhone = customer?.phonePrimary ?? "—";

  const amount       = parseFloat(record.amount);
  const principalUsd = record.usdEquivalent ? parseFloat(record.usdEquivalent) : null;

  const feeRate      = record.serviceFeeRate ? parseFloat(record.serviceFeeRate) : null;
  const feeAmountUsd: number | null = record.serviceFeeUsd
    ? parseFloat(record.serviceFeeUsd)
    : (feeRate !== null && principalUsd !== null ? (principalUsd * feeRate) / 100 : null);
  const netFeeUsd = record.networkFeeUsd ? parseFloat(record.networkFeeUsd) : 0;

  let totalClientAmount: number | null = null;
  if (principalUsd !== null) {
    if (isInflow) {
      totalClientAmount = principalUsd - (feeAmountUsd ?? 0) - netFeeUsd;
      if (totalClientAmount < 0) totalClientAmount = principalUsd;
    } else {
      totalClientAmount = principalUsd + (feeAmountUsd ?? 0) + netFeeUsd;
    }
  }

  const liabilityLabel = isInflow ? "لكم" : "عليكم";
  const safeNotes = clientNotes(record.notes);

  return (
    <div style={{
      width: "420px",
      background: WHITE,
      fontFamily: "'Inter', 'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
      direction: "ltr",
      color: TEXT,
      fontSize: "13px",
      lineHeight: "1.5",
      borderRadius: "20px",
      overflow: "hidden",
      boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
      border: `1px solid ${BORDER}`,
    }}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div style={{
        background: WHITE,
        padding: "24px 24px 16px",
        textAlign: "center",
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <img
            src="/coincash-logo.png"
            alt="Coin Cash"
            crossOrigin="anonymous"
            style={{ width: "40px", height: "40px", objectFit: "contain", borderRadius: "10px" }}
          />
          <div style={{ textAlign: "left" }}>
            <div style={{ color: DARK, fontSize: "18px", fontWeight: 800, letterSpacing: "-0.3px", lineHeight: 1 }}>كوين كاش</div>
            <div style={{ color: GOLD_DARK, fontSize: "10px", fontWeight: 500, marginTop: "3px" }}>Coin Cash — Money Exchange & Crypto</div>
          </div>
        </div>
        <div style={{
          color: TEXT, fontSize: "15px", fontWeight: 700, letterSpacing: "0.2px",
        }}>Transaction Details</div>
        <div style={{ color: TEXT_SEC, fontSize: "10.5px", marginTop: "2px", direction: "rtl" }}>تفاصيل العملية</div>
      </div>

      {/* ══ HERO TOTAL ══════════════════════════════════════════════════════ */}
      <div style={{
        background: GOLD_BG,
        padding: "20px 24px",
        textAlign: "center",
        borderBottom: `2px solid ${GOLD_RING}`,
      }}>
        <div style={{
          display: "inline-block",
          background: GOLD,
          color: WHITE,
          fontSize: "10px", fontWeight: 700,
          padding: "3px 14px", borderRadius: "20px",
          letterSpacing: "0.8px", textTransform: "uppercase",
          marginBottom: "10px",
        }}>
          {isInflow ? "Total Credit — لكم" : "Total Debit — عليكم"}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: "8px" }}>
          <span style={{
            color: DARK, fontSize: "36px", fontWeight: 800,
            fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace", lineHeight: 1,
            letterSpacing: "-1px",
          }}>
            {totalClientAmount !== null ? fmt(totalClientAmount, 2) : (principalUsd !== null ? fmt(principalUsd, 2) : fmt(amount, isCrypto ? 4 : 2))}
          </span>
          <span style={{ color: GOLD_DARK, fontSize: "16px", fontWeight: 700 }}>
            {principalUsd !== null || totalClientAmount !== null ? "USD" : record.currency}
          </span>
        </div>
        {totalClientAmount !== null && principalUsd !== null && totalClientAmount !== principalUsd && (
          <div style={{ color: TEXT_SEC, fontSize: "10.5px", marginTop: "6px" }}>
            Principal ${fmt(principalUsd, 2)} {isInflow ? "−" : "+"} fees ${fmt(Math.abs(totalClientAmount - principalUsd), 2)}
          </div>
        )}
      </div>

      {/* ══ DETAIL ROWS ═════════════════════════════════════════════════════ */}
      <Row label="Transaction" labelAr="نوع العملية" value={typeLabel(record.type, record.direction)} bold />

      <Row label="Transaction Date" labelAr="التاريخ" value={confirmedAt(record)} alt />

      <Row label="Record Number" labelAr="رقم العملية" value={record.recordNumber} mono bold />

      <Row label="Amount" labelAr="المبلغ" value={`${fmt(amount, isCrypto ? 6 : 2)}  ${record.currency}`} alt bold />

      {principalUsd !== null && record.currency !== "USD" && (
        <Row label="USD Equivalent" labelAr="المعادل بالدولار" value={`$${fmt(principalUsd, 2)}`} accent={GREEN} bold />
      )}

      {feeAmountUsd !== null && feeAmountUsd > 0 && (
        <Row label="Service Fee" labelAr="رسوم الخدمة" value={`$${fmt(feeAmountUsd, 2)}`} alt accent={GOLD_DARK} />
      )}

      {netFeeUsd > 0 && (
        <Row label="Network Fee" labelAr="رسوم الشبكة" value={`$${fmt(netFeeUsd, 2)}`} accent={GOLD_DARK} />
      )}

      {record.assetOrProviderName && (
        <Row label="Provider" labelAr="المزود" value={record.assetOrProviderName} alt />
      )}

      {record.clientSenderName && (
        <Row label="Sender" labelAr="المرسل" value={record.clientSenderName} mono={isCrypto} />
      )}

      {record.clientRecipientName && (
        <Row label="Recipient" labelAr="المستلم" value={record.clientRecipientName} mono={isCrypto} alt />
      )}

      {record.txidOrReferenceNumber && (
        <Row label="Reference" labelAr="رقم المرجع" value={record.txidOrReferenceNumber} mono accent={GOLD_DARK} />
      )}

      {record.networkOrId && (
        <Row label="Address / ID" labelAr="العنوان/المعرف" value={record.networkOrId} mono alt />
      )}

      {isCrypto && record.blockNumberOrBatchId && (
        <Row label="Block" value={record.blockNumberOrBatchId} mono />
      )}

      {/* ── Client Section ─────────────────────────────────────────────────── */}
      <div style={{
        background: GOLD_BG,
        padding: "6px 24px",
        borderTop: `1px solid ${BORDER}`,
        borderBottom: `1px solid ${BORDER}`,
        fontSize: "10px", fontWeight: 700, letterSpacing: "1.2px",
        textTransform: "uppercase", color: GOLD_DARK,
      }}>Client Info · بيانات العميل</div>

      <Row label="Name" value={clientName} bold />
      <Row label="Client ID" value={customerId} mono alt />
      {customer && <Row label="Phone" value={clientPhone} />}

      {/* ── Notes ──────────────────────────────────────────────────────────── */}
      {safeNotes && (
        <div style={{
          padding: "9px 24px", background: GOLD_BG,
          borderTop: `1px solid ${GOLD_RING}`, borderBottom: `1px solid ${BORDER}`,
        }}>
          <span style={{ color: GOLD_DARK, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Note: </span>
          <span style={{ color: TEXT, fontSize: "12px" }}>{safeNotes}</span>
        </div>
      )}

      {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
      <div style={{
        background: DARK,
        padding: "14px 24px",
        textAlign: "center",
      }}>
        <div style={{
          display: "inline-block",
          background: "rgba(245,166,35,0.15)",
          color: GOLD,
          fontSize: "12px", fontWeight: 700,
          padding: "4px 18px", borderRadius: "20px", letterSpacing: "0.3px",
          marginBottom: "8px",
          border: `1px solid rgba(245,166,35,0.25)`,
        }}>
          ✓ تم تأكيد العملية بنجاح
        </div>
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", marginTop: "4px", letterSpacing: "0.3px" }}>
          © {new Date().getFullYear()} Coin Cash · ycoincash.com
        </div>
      </div>

      {/* Gold accent bottom */}
      <div style={{ height: "4px", background: `linear-gradient(90deg, ${GOLD}, ${GOLD_DARK})` }} />
    </div>
  );
}

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

export default InvoiceDownloadButton;
