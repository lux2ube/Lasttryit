import { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Copy, Check } from "lucide-react";
import { format } from "date-fns";

export interface FinancialRecord {
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

export interface Customer {
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
  return format(d, "dd/MM/yyyy (HH:mm)");
}

export function fmt(n: number, maxDp = 6): string {
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

function typeLabel(type: string, direction: string): React.ReactNode {
  const labels: Record<string, [string, string]> = {
    "cash-inflow":    ["Cash Deposit",      "إيداع نقدي"],
    "cash-outflow":   ["Cash Withdrawal",   "سحب نقدي"],
    "crypto-inflow":  ["Crypto Deposit",    "إيداع رقمي"],
    "crypto-outflow": ["Crypto Withdrawal", "سحب رقمي"],
  };
  const key = `${type}-${direction}`;
  const [en, ar] = labels[key] ?? ["Unknown", "غير معروف"];
  return (
    <span>
      {en} — <span style={{ direction: "rtl", unicodeBidi: "isolate", fontFamily: AR_FONT }}>{ar}</span>
    </span>
  );
}

// ── WhatsApp message builder (mirrors server/whatsapp-service.ts) ──────────

export function buildWhatsAppMessage(record: FinancialRecord, customer?: Customer): string {
  const isInflow = record.direction === "inflow";
  const typeAr = record.type === "cash" ? "نقدي" : "عملة رقمية";
  const directionAr = isInflow ? "إيداع" : "سحب";
  const liabilityLabel = isInflow ? "لكم" : "عليكم";
  const arrow = isInflow ? "⬇️" : "⬆️";
  const customerName = customer?.fullName ?? record.clientName ?? "العميل";

  const amount = parseFloat(record.amount);
  const principalUsd = record.usdEquivalent ? parseFloat(record.usdEquivalent) : null;
  const feeAmountUsd = record.serviceFeeUsd ? parseFloat(record.serviceFeeUsd) : null;
  const netFeeUsd = record.networkFeeUsd ? parseFloat(record.networkFeeUsd) : 0;

  const ev = confirmedEvent(record);
  const confirmedDate = ev?.timestamp
    ? format(new Date(ev.timestamp), "dd/MM/yyyy HH:mm")
    : format(new Date(record.updatedAt), "dd/MM/yyyy HH:mm");

  const lines: string[] = [
    `━━━━━━━━━━━━━━━━━━━━`,
    `${arrow} *تأكيد عملية — Coin Cash*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `عزيزنا العميل *${customerName}* قيدنا لحسابكم لدينا التفاصيل التالية:`,
    ``,
    `📊 *نوع العملية:* ${directionAr} — ${typeAr}`,
    principalUsd !== null
      ? `💰 *${liabilityLabel}:* $${fmt(principalUsd, 2)}`
      : `💰 *${liabilityLabel}:* ${fmt(amount, record.type === "crypto" ? 6 : 2)} ${record.currency}`,
    `💵 *المبلغ:* ${fmt(amount, record.type === "crypto" ? 6 : 2)} ${record.currency}`,
    `📋 *رقم العملية:* ${record.recordNumber}`,
  ];

  if (record.assetOrProviderName) lines.push(`🏦 *المزود:* ${record.assetOrProviderName}`);
  if (feeAmountUsd && feeAmountUsd > 0) lines.push(`💳 *رسوم الخدمة:* $${fmt(feeAmountUsd, 2)}`);
  if (netFeeUsd > 0) lines.push(`🔗 *رسوم الشبكة:* $${fmt(netFeeUsd, 2)}`);

  lines.push(``, `📝 *تفاصيل العملية:*`);

  if (record.clientSenderName)       lines.push(`👤 *المرسل:* ${record.clientSenderName}`);
  if (record.clientRecipientName)    lines.push(`👤 *المستلم:* ${record.clientRecipientName}`);
  if (record.txidOrReferenceNumber)  lines.push(`🔑 *رقم المرجع:* ${record.txidOrReferenceNumber}`);
  if (record.networkOrId)            lines.push(`📍 *العنوان/المعرف:* ${record.networkOrId}`);

  lines.push(`📅 *التاريخ:* ${confirmedDate}`);

  const safeNotes = clientNotes(record.notes);
  if (safeNotes) lines.push(`📌 *ملاحظات:* ${safeNotes}`);

  lines.push(
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `✅ تم تأكيد العملية بنجاح`,
    `━━━━━━━━━━━━━━━━━━━━`,
  );

  return lines.join("\n");
}

// ── Logo preload ──────────────────────────────────────────────────────────────

let cachedLogoDataUrl: string | null = null;

async function getLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const res = await fetch("/coincash-logo.png");
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        cachedLogoDataUrl = reader.result as string;
        resolve(cachedLogoDataUrl);
      };
      reader.onerror = () => resolve("/coincash-logo.png");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "/coincash-logo.png";
  }
}
// Preload silently at module init
getLogoDataUrl();

// ── Color tokens ──────────────────────────────────────────────────────────────

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

const AR_FONT   = "Tahoma, Arial, sans-serif";

// ── Row component ─────────────────────────────────────────────────────────────

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
      <span style={{ fontSize: "12.5px", fontWeight: 500, color: TEXT_SEC, flexShrink: 0 }}>
        {label}
        {labelAr && <span style={{ display: "block", fontSize: "10px", color: "#A1A1AA", fontWeight: 400, marginTop: "1px", direction: "rtl", unicodeBidi: "isolate", textAlign: "right", fontFamily: AR_FONT }}>{labelAr}</span>}
      </span>
      <span style={{
        fontSize: "13px", fontWeight: bold ? 700 : 500,
        fontFamily: mono ? "'SF Mono', 'Fira Code', 'Courier New', monospace" : "inherit",
        color: accent ?? TEXT,
        wordBreak: "break-all", textAlign: "right", direction: "ltr", maxWidth: "58%",
      }}>{value}</span>
    </div>
  );
};

// ── Invoice Template (exported for use in dialog) ─────────────────────────────

export function InvoiceTemplate({
  record, customer, logoSrc,
}: {
  record: FinancialRecord; customer?: Customer; logoSrc?: string;
}) {
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
      const deducted = principalUsd - (feeAmountUsd ?? 0) - netFeeUsd;
      totalClientAmount = deducted > 0 ? deducted : principalUsd;
    } else {
      totalClientAmount = principalUsd + (feeAmountUsd ?? 0) + netFeeUsd;
    }
  }

  const safeNotes = clientNotes(record.notes);
  const logo = logoSrc ?? "/coincash-logo.png";

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
      <div style={{ background: WHITE, padding: "24px 24px 16px", textAlign: "center", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <img
            src={logo}
            alt="Coin Cash"
            crossOrigin="anonymous"
            style={{ width: "40px", height: "40px", objectFit: "contain", borderRadius: "10px" }}
          />
          <div style={{ textAlign: "left" }}>
            <div style={{ color: DARK, fontSize: "18px", fontWeight: 800, lineHeight: 1, direction: "rtl", unicodeBidi: "isolate", fontFamily: AR_FONT }}>كوين كاش</div>
            <div style={{ color: GOLD_DARK, fontSize: "10px", fontWeight: 500, marginTop: "3px" }}>Coin Cash — Money Exchange &amp; Crypto</div>
          </div>
        </div>
        <div style={{ color: TEXT, fontSize: "15px", fontWeight: 700, letterSpacing: "0.2px" }}>Transaction Details</div>
        <div style={{ color: TEXT_SEC, fontSize: "10.5px", marginTop: "2px", direction: "rtl", unicodeBidi: "isolate", fontFamily: AR_FONT }}>تفاصيل العملية</div>
      </div>

      {/* ══ HERO TOTAL ══════════════════════════════════════════════════════ */}
      <div style={{ background: GOLD_BG, padding: "20px 24px", textAlign: "center", borderBottom: `2px solid ${GOLD_RING}` }}>
        <div style={{
          display: "inline-block", background: GOLD, color: WHITE,
          fontSize: "10px", fontWeight: 700, padding: "3px 14px", borderRadius: "20px",
          letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "10px",
        }}>
          {isInflow
            ? <>Total Credit — <span style={{ direction: "rtl", unicodeBidi: "isolate", fontFamily: AR_FONT }}>لكم</span></>
            : <>Total Debit — <span style={{ direction: "rtl", unicodeBidi: "isolate", fontFamily: AR_FONT }}>عليكم</span></>}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: "8px" }}>
          <span style={{
            color: DARK, fontSize: "36px", fontWeight: 800,
            fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
            lineHeight: 1, letterSpacing: "-1px",
          }}>
            {totalClientAmount !== null
              ? fmt(totalClientAmount, 2)
              : (principalUsd !== null ? fmt(principalUsd, 2) : fmt(amount, isCrypto ? 4 : 2))}
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

      {/* ── Client Section ────────────────────────────────────────────────── */}
      <div style={{
        background: GOLD_BG, padding: "6px 24px",
        borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`,
        fontSize: "10px", fontWeight: 700, letterSpacing: "1.2px",
        textTransform: "uppercase", color: GOLD_DARK,
      }}>
        Client Info · <span style={{ direction: "rtl", unicodeBidi: "isolate", fontFamily: AR_FONT }}>بيانات العميل</span>
      </div>
      <Row label="Name" value={clientName} bold />
      <Row label="Client ID" value={customerId} mono alt />
      {customer && <Row label="Phone" value={clientPhone} />}

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
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
      <div style={{ background: DARK, padding: "14px 24px", textAlign: "center" }}>
        <div style={{
          display: "inline-block",
          background: "rgba(245,166,35,0.15)", color: GOLD,
          fontSize: "12px", fontWeight: 700,
          padding: "4px 18px", borderRadius: "20px", letterSpacing: "0.3px",
          marginBottom: "8px", border: `1px solid rgba(245,166,35,0.25)`,
        }}>
          <span style={{ direction: "ltr", unicodeBidi: "isolate" }}>✓</span>{" "}
          <span style={{ direction: "rtl", unicodeBidi: "isolate", fontFamily: AR_FONT }}>تم تأكيد العملية بنجاح</span>
        </div>
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", marginTop: "4px", letterSpacing: "0.3px" }}>
          © {new Date().getFullYear()} Coin Cash · ycoincash.com
        </div>
      </div>
      <div style={{ height: "4px", background: `linear-gradient(90deg, ${GOLD}, ${GOLD_DARK})` }} />
    </div>
  );
}

// ── Fee backfill from JE ──────────────────────────────────────────────────────

async function backfillFeeFromJE(record: FinancialRecord): Promise<FinancialRecord> {
  if (record.processingStage !== "confirmed") return record;
  const hasFeeData = record.usdEquivalent && (
    (record.type === "crypto" && record.serviceFeeUsd) ||
    (record.type === "cash"   && record.spreadUsd !== undefined)
  );
  if (hasFeeData) return record;
  try {
    const res = await fetch(`/api/accounting/journal-entries/for-record/${record.id}`, { credentials: "include" });
    if (!res.ok) return record;
    const { lines } = await res.json() as { lines: Array<{ accountCode: string; debitAmount: string; creditAmount: string }> };
    const cr = (code: string) => lines.filter(l => l.accountCode === code).reduce((s, l) => s + parseFloat(l.creditAmount ?? "0"), 0);
    const dr = (code: string) => lines.filter(l => l.accountCode === code).reduce((s, l) => s + parseFloat(l.debitAmount  ?? "0"), 0);
    const principalUsd = record.direction === "inflow" ? dr("2101") : cr("2101");
    if (principalUsd <= 0) return record;
    if (record.type === "crypto") {
      const svcFeeUsd = cr("4101");
      const gasUsd    = cr("4301");
      const feeRate   = principalUsd > 0 ? (svcFeeUsd / principalUsd) * 100 : 0;
      return { ...record, usdEquivalent: String(principalUsd.toFixed(4)), serviceFeeRate: String(feeRate.toFixed(4)), serviceFeeUsd: String(svcFeeUsd.toFixed(4)), networkFeeUsd: String(gasUsd.toFixed(6)) };
    } else {
      const sprdUsd  = cr("4201");
      const sprdRate = principalUsd > 0 ? (sprdUsd / principalUsd) * 100 : 0;
      return { ...record, usdEquivalent: String(principalUsd.toFixed(4)), spreadUsd: String(sprdUsd.toFixed(4)), spreadRate: String(sprdRate.toFixed(4)) };
    }
  } catch { return record; }
}

// ── Download: from an already-rendered ref (fast path) ────────────────────────

export async function downloadInvoiceFromElement(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  const logoDataUrl = await getLogoDataUrl();
  // Swap any img[src="/coincash-logo.png"] to data URL for clean capture
  const imgs = el.querySelectorAll<HTMLImageElement>('img[src="/coincash-logo.png"]');
  const origSrcs: string[] = [];
  imgs.forEach((img, i) => { origSrcs[i] = img.src; img.src = logoDataUrl; });
  try {
    const canvas = await html2canvas(el, {
      scale: 2, useCORS: false, allowTaint: true,
      backgroundColor: "#ffffff", logging: false,
    });
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } finally {
    imgs.forEach((img, i) => { img.src = origSrcs[i]; });
  }
}

// ── Download hook (fallback: hidden render, for card row buttons) ─────────────

export function useInvoiceDownload() {
  const [loading, setLoading] = useState(false);

  const download = async (record: FinancialRecord, customer?: Customer) => {
    setLoading(true);
    try {
      const [enriched, logoDataUrl] = await Promise.all([
        backfillFeeFromJE(record),
        getLogoDataUrl(),
      ]);

      const container = document.createElement("div");
      container.style.cssText = "position:fixed;left:-9999px;top:0;z-index:-1;";
      document.body.appendChild(container);

      const root = createRoot(container);
      root.render(<InvoiceTemplate record={enriched} customer={customer} logoSrc={logoDataUrl} />);

      await new Promise(r => setTimeout(r, 150));

      const el = container.firstElementChild as HTMLElement;
      const canvas = await html2canvas(el, {
        scale: 2, useCORS: false, allowTaint: true,
        backgroundColor: "#ffffff", logging: false,
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

// ── Copy WhatsApp Button ──────────────────────────────────────────────────────

export function CopyWhatsAppButton({ record, customer, size = "sm" }: RecordInvoiceProps) {
  const [copied, setCopied] = useState(false);

  if (record.processingStage !== "confirmed") return null;

  const handleCopy = async () => {
    const msg = buildWhatsAppMessage(record, customer);
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = msg;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Button
      size={size}
      variant="outline"
      className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
      onClick={handleCopy}
      data-testid={`button-copy-whatsapp-${record.id}`}
    >
      {copied
        ? <><Check className="w-3 h-3 mr-1" />Copied!</>
        : <><Copy className="w-3 h-3 mr-1" />Copy WhatsApp</>}
    </Button>
  );
}

// ── Download Button (standalone, for card rows) ───────────────────────────────

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

// ── Dialog-integrated invoice viewer (fast download via ref) ─────────────────

export function InvoiceViewer({ record, customer }: { record: FinancialRecord; customer?: Customer }) {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [enriched, setEnriched] = useState<FinancialRecord>(record);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logoSrc, setLogoSrc] = useState("/coincash-logo.png");

  useEffect(() => {
    getLogoDataUrl().then(setLogoSrc);
    backfillFeeFromJE(record).then(setEnriched);
  }, [record.id]);

  const handleDownload = async () => {
    if (!invoiceRef.current) return;
    setDownloading(true);
    try {
      await downloadInvoiceFromElement(invoiceRef.current, `${record.recordNumber}-receipt.png`);
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = async () => {
    const msg = buildWhatsAppMessage(enriched, customer);
    try {
      await navigator.clipboard.writeText(msg);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = msg;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Action buttons */}
      <div className="flex gap-2 w-full justify-end">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400"
          onClick={handleCopy}
          data-testid={`button-copy-wa-${record.id}`}
        >
          {copied ? <><Check className="w-3 h-3 mr-1" />Copied!</> : <><Copy className="w-3 h-3 mr-1" />Copy WhatsApp</>}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
          onClick={handleDownload}
          disabled={downloading}
          data-testid={`button-download-${record.id}`}
        >
          {downloading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
          Download
        </Button>
      </div>

      {/* Invoice — rendered once, ref captured for fast download */}
      <div ref={invoiceRef} style={{ display: "inline-block" }}>
        <InvoiceTemplate record={enriched} customer={customer} logoSrc={logoSrc} />
      </div>
    </div>
  );
}

export default InvoiceDownloadButton;
