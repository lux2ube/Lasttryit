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

const NAVY     = "#0f2057";
const GOLD     = "#d4a017";
const GOLD_LT  = "#fdf6e3";
const DGRAY    = "#1f2937";
const MGRAY    = "#6b7280";
const BORDER   = "#e5e7eb";
const WHITE    = "#ffffff";
const ROW_ALT  = "#f8fafc";

const Row = ({ label, value, valueLarge, mono, accent, bold, alt, last, labelAr }: {
  label: string; value?: string | React.ReactNode; valueLarge?: boolean;
  mono?: boolean; accent?: string; bold?: boolean; alt?: boolean; last?: boolean;
  labelAr?: string;
}) => {
  if (!value && value !== 0) return null;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: valueLarge ? "10px 20px" : "9px 20px",
      borderBottom: last ? "none" : `1px solid ${BORDER}`,
      background: alt ? ROW_ALT : WHITE,
    }}>
      <span style={{
        fontSize: "12px", fontWeight: 600, color: DGRAY,
        flexShrink: 0,
      }}>
        {label}
        {labelAr && <span style={{ display: "block", fontSize: "10px", color: MGRAY, fontWeight: 400, marginTop: "1px" }}>{labelAr}</span>}
      </span>
      <span style={{
        fontSize: valueLarge ? "16px" : "13px",
        fontWeight: bold || valueLarge ? 700 : 500,
        fontFamily: mono ? "'Courier New', monospace" : "inherit",
        color: accent ?? DGRAY,
        wordBreak: "break-all", textAlign: "right",
        direction: "ltr",
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

  const liabilityLabel = isInflow ? "لكم" : "عليكم";
  const safeNotes = clientNotes(record.notes);

  return (
    <div style={{
      width: "420px",
      background: WHITE,
      fontFamily: "'Segoe UI', Arial, system-ui, sans-serif",
      direction: "ltr",
      color: DGRAY,
      fontSize: "13px",
      lineHeight: "1.5",
      borderRadius: "16px",
      overflow: "hidden",
      boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
    }}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div style={{
        background: NAVY,
        padding: "20px 24px 16px",
        textAlign: "center",
      }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <img
            src="/coincash-logo.png"
            alt="Coin Cash"
            crossOrigin="anonymous"
            style={{ width: "42px", height: "42px", objectFit: "contain", borderRadius: "10px", background: "rgba(255,255,255,0.1)", padding: "4px" }}
          />
          <div style={{ textAlign: "left" }}>
            <div style={{ color: WHITE, fontSize: "20px", fontWeight: 800, letterSpacing: "-0.3px", lineHeight: 1 }}>Coin Cash</div>
            <div style={{ color: GOLD, fontSize: "10px", fontWeight: 500, marginTop: "2px" }}>Money Exchange & Crypto Services</div>
          </div>
        </div>
        <div style={{
          color: WHITE, fontSize: "14px", fontWeight: 700, letterSpacing: "0.3px", marginTop: "6px",
        }}>Transaction Details</div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px", marginTop: "2px" }}>تفاصيل العملية</div>
      </div>

      {/* ══ HERO AMOUNT ═════════════════════════════════════════════════════ */}
      <div style={{
        background: GOLD_LT,
        padding: "14px 20px",
        textAlign: "center",
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: "8px" }}>
          <span style={{
            color: "#15803d", fontSize: "32px", fontWeight: 800,
            fontFamily: "'Courier New', monospace", lineHeight: 1,
          }}>
            {principalUsd !== null ? fmt(principalUsd, 2) : fmt(amount, isCrypto ? 4 : 2)}
          </span>
          <span style={{ color: DGRAY, fontSize: "14px", fontWeight: 600 }}>
            {principalUsd !== null ? "USD" : record.currency}
          </span>
          <span style={{ color: MGRAY, fontSize: "14px", fontWeight: 500, direction: "rtl" }}>
            {isInflow ? "لكم" : "عليكم"}
          </span>
        </div>
      </div>

      {/* ══ DETAIL ROWS ═════════════════════════════════════════════════════ */}
      <Row label="Transaction" labelAr="نوع العملية" value={typeLabel(record.type, record.direction)} bold />

      <Row label="Transaction Date" labelAr="التاريخ" value={confirmedAt(record)} alt />

      <Row label="Record Number" labelAr="رقم العملية" value={record.recordNumber} mono bold />

      {record.currency !== "USD" && (
        <Row label="Amount" labelAr="المبلغ" value={`${fmt(amount, isCrypto ? 6 : 2)}  ${record.currency}`} alt bold />
      )}

      {principalUsd !== null && record.currency !== "USD" && (
        <Row label={`USD Equivalent (${liabilityLabel})`} labelAr="المعادل بالدولار" value={`$${fmt(principalUsd, 2)}`} accent="#15803d" bold />
      )}

      {feeAmountUsd !== null && feeAmountUsd > 0 && (
        <Row label="Service Fee" labelAr="رسوم الخدمة" value={`$${fmt(feeAmountUsd, 2)}`} alt accent="#b45309" />
      )}

      {netFeeUsd > 0 && (
        <Row label="Network Fee" labelAr="رسوم الشبكة" value={`$${fmt(netFeeUsd, 2)}`} accent="#7c3aed" />
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
        <Row label="Reference" labelAr="رقم المرجع" value={record.txidOrReferenceNumber} mono accent="#0a7c6e" />
      )}

      {record.networkOrId && (
        <Row label="Address / ID" labelAr="العنوان/المعرف" value={record.networkOrId} mono alt />
      )}

      {isCrypto && record.blockNumberOrBatchId && (
        <Row label="Block" value={record.blockNumberOrBatchId} mono />
      )}

      {/* ── Client Info Section ────────────────────────────────────────────── */}
      <div style={{
        background: "#f1f5f9",
        padding: "5px 20px",
        borderTop: `1px solid ${BORDER}`,
        borderBottom: `1px solid ${BORDER}`,
        fontSize: "10px", fontWeight: 700, letterSpacing: "1px",
        textTransform: "uppercase", color: MGRAY,
      }}>Client</div>

      <Row label="Name" value={clientName} bold />
      <Row label="Client ID" value={customerId} mono alt />
      {customer && <Row label="Phone" value={clientPhone} />}

      {/* ── Notes ──────────────────────────────────────────────────────────── */}
      {safeNotes && (
        <div style={{
          padding: "9px 20px", background: "#fffbeb",
          borderTop: `1px solid #fde68a`, borderBottom: `1px solid ${BORDER}`,
        }}>
          <span style={{ color: "#b45309", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Note: </span>
          <span style={{ color: "#78350f", fontSize: "12px" }}>{safeNotes}</span>
        </div>
      )}

      {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
      <div style={{
        background: NAVY,
        padding: "12px 20px",
        textAlign: "center",
      }}>
        <div style={{
          display: "inline-block",
          background: "rgba(255,255,255,0.12)",
          color: "#4ade80",
          fontSize: "11px", fontWeight: 700, fontFamily: "'Courier New', monospace",
          padding: "3px 14px", borderRadius: "20px", letterSpacing: "0.5px",
          marginBottom: "6px",
        }}>
          ✓ تم تأكيد العملية بنجاح
        </div>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", marginTop: "4px" }}>
          © {new Date().getFullYear()} Coin Cash · support@ycoincash.com · ycoincash.com
        </div>
      </div>

      {/* Gold bottom stripe */}
      <div style={{ height: "3px", background: `linear-gradient(90deg, ${GOLD}, ${NAVY})` }} />
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
