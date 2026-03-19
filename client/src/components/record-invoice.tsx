import { useState, useRef, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import domtoimage from "dom-to-image-more";
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
const DARK      = "#1A1A2E";
const TEXT      = "#2D2D3F";
const TEXT_SEC  = "#6B7280";
const SEP       = "#E8E4DF";
const WHITE     = "#FFFFFF";
const GREEN     = "#16A34A";
const MONO_FONT = "'Courier New', 'Lucida Console', monospace";
const AR_FONT   = "'Cairo', Tahoma, Arial, sans-serif";

// ── Section divider ───────────────────────────────────────────────────────────
const Divider = () => (
  <div style={{ height: "1px", background: SEP, margin: "0 24px" }} />
);

// ── Single field row (label stacked above value) ───────────────────────────────
const Field = ({ label, labelAr, value, mono, accent, large, hash }: {
  label: string; labelAr?: string; value?: string | React.ReactNode;
  mono?: boolean; accent?: string; large?: boolean; hash?: boolean;
}) => {
  if (!value && value !== 0) return null;
  return (
    <div style={{ padding: "9px 24px" }}>
      <div style={{
        fontSize: "10px", fontWeight: 600, color: TEXT_SEC,
        textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "3px",
        display: "flex", alignItems: "center", gap: "6px",
      }}>
        {label}
        {labelAr && (
          <span style={{ fontFamily: AR_FONT, direction: "rtl", unicodeBidi: "isolate", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "#9CA3AF" }}>
            · {labelAr}
          </span>
        )}
      </div>
      <div style={{
        fontSize: large ? "15px" : "13px",
        fontWeight: large ? 700 : 600,
        fontFamily: mono ? MONO_FONT : "inherit",
        color: accent ?? TEXT,
        wordBreak: hash ? "break-all" : "normal",
        overflowWrap: hash ? "break-word" : "normal",
        lineHeight: 1.45,
      }}>
        {value}
      </div>
    </div>
  );
};

// ── Two-column row (for compact pairs like amount + fee) ───────────────────────
const Row2 = ({ left, right }: {
  left: { label: string; labelAr?: string; value?: string | React.ReactNode; accent?: string; mono?: boolean };
  right: { label: string; labelAr?: string; value?: string | React.ReactNode; accent?: string; mono?: boolean };
}) => {
  if (!left.value && !right.value) return null;
  return (
    <div style={{ display: "flex", padding: "9px 24px", gap: "16px" }}>
      {[left, right].map((col, i) => col.value ? (
        <div key={i} style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "10px", fontWeight: 600, color: TEXT_SEC, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "3px", display: "flex", gap: "5px", alignItems: "center" }}>
            {col.label}
            {col.labelAr && <span style={{ fontFamily: AR_FONT, direction: "rtl", unicodeBidi: "isolate", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "#9CA3AF" }}>· {col.labelAr}</span>}
          </div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: col.accent ?? TEXT, fontFamily: col.mono ? MONO_FONT : "inherit" }}>
            {col.value}
          </div>
        </div>
      ) : <div key={i} style={{ flex: 1 }} />)}
    </div>
  );
};

// ── Section header band ────────────────────────────────────────────────────────
const Band = ({ en, ar }: { en: string; ar?: string }) => (
  <div style={{
    background: GOLD_BG, padding: "5px 24px",
    fontSize: "9.5px", fontWeight: 700, letterSpacing: "1px",
    textTransform: "uppercase", color: GOLD_DARK,
    display: "flex", alignItems: "center", gap: "6px",
  }}>
    {en}
    {ar && <span style={{ fontFamily: AR_FONT, direction: "rtl", unicodeBidi: "isolate", textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>· {ar}</span>}
  </div>
);

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

  const amountStr = `${fmt(amount, isCrypto ? 6 : 2)} ${record.currency}`;
  const hasFees = (feeAmountUsd !== null && feeAmountUsd > 0) || netFeeUsd > 0;

  return (
    <div style={{
      width: "480px",
      background: WHITE,
      fontFamily: "'Segoe UI', 'Inter', system-ui, sans-serif",
      direction: "ltr",
      color: TEXT,
      fontSize: "13px",
      lineHeight: "1.5",
      borderRadius: "16px",
      overflow: "hidden",
    }}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div style={{ background: DARK, padding: "22px 28px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
          <img
            src={logo}
            alt="Coin Cash"
            crossOrigin="anonymous"
            style={{ width: "44px", height: "44px", objectFit: "contain", borderRadius: "10px", background: WHITE, padding: "3px" }}
          />
          <div>
            <div style={{ color: WHITE, fontSize: "20px", fontWeight: 800, lineHeight: 1.1, direction: "rtl", unicodeBidi: "isolate", fontFamily: AR_FONT }}>كوين كاش</div>
            <div style={{ color: GOLD, fontSize: "10.5px", fontWeight: 500, marginTop: "2px", letterSpacing: "0.3px" }}>Coin Cash — Money Exchange &amp; Crypto</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "2px" }}>Transaction Receipt</div>
            <div style={{ color: WHITE, fontSize: "11px", fontFamily: MONO_FONT, fontWeight: 600 }}>{record.recordNumber}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "9.5px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "2px" }}>Date</div>
            <div style={{ color: WHITE, fontSize: "11px" }}>{confirmedAt(record)}</div>
          </div>
        </div>
      </div>

      {/* ══ TOTAL BAND ══════════════════════════════════════════════════════ */}
      <div style={{ background: GOLD_BG, padding: "18px 28px", borderBottom: `2px solid ${GOLD}22` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "10px", fontWeight: 700, color: GOLD_DARK, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>
              {isInflow
                ? <span>Total Credit <span style={{ fontFamily: AR_FONT, direction: "rtl", unicodeBidi: "isolate", textTransform: "none", letterSpacing: 0 }}>· لكم</span></span>
                : <span>Total Debit <span style={{ fontFamily: AR_FONT, direction: "rtl", unicodeBidi: "isolate", textTransform: "none", letterSpacing: 0 }}>· عليكم</span></span>}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
              <span style={{ color: DARK, fontSize: "38px", fontWeight: 800, lineHeight: 1, letterSpacing: "-1.5px" }}>
                {totalClientAmount !== null
                  ? fmt(totalClientAmount, 2)
                  : (principalUsd !== null ? fmt(principalUsd, 2) : fmt(amount, isCrypto ? 4 : 2))}
              </span>
              <span style={{ color: GOLD_DARK, fontSize: "17px", fontWeight: 700 }}>
                {principalUsd !== null || totalClientAmount !== null ? "USD" : record.currency}
              </span>
            </div>
            {totalClientAmount !== null && principalUsd !== null && Math.abs(totalClientAmount - principalUsd) > 0.001 && (
              <div style={{ color: TEXT_SEC, fontSize: "10.5px", marginTop: "4px" }}>
                {fmt(principalUsd, 2)} USD {isInflow ? "−" : "+"} ${fmt(Math.abs(totalClientAmount - principalUsd), 2)} fees
              </div>
            )}
          </div>
          <div style={{
            background: isInflow ? "#16A34A22" : "#EF444422",
            border: `1.5px solid ${isInflow ? "#16A34A44" : "#EF444444"}`,
            borderRadius: "10px", padding: "6px 14px", textAlign: "center",
          }}>
            <div style={{ fontSize: "18px", lineHeight: 1 }}>{isInflow ? "⬇️" : "⬆️"}</div>
            <div style={{ fontSize: "9px", fontWeight: 700, color: isInflow ? GREEN : "#DC2626", marginTop: "3px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
              {isInflow ? "Received" : "Sent"}
            </div>
          </div>
        </div>
      </div>

      {/* ══ TRANSACTION DETAILS ═════════════════════════════════════════════ */}
      <Band en="Transaction Details" ar="تفاصيل العملية" />

      <Field label="Type" labelAr="نوع العملية" value={typeLabel(record.type, record.direction)} large />
      <Divider />
      <Row2
        left={{ label: "Amount", labelAr: "المبلغ", value: amountStr, mono: true, accent: TEXT }}
        right={principalUsd !== null && record.currency !== "USD"
          ? { label: "USD Equivalent", labelAr: "المعادل", value: `$${fmt(principalUsd, 2)}`, accent: GREEN }
          : { label: "", value: undefined }}
      />

      {hasFees && (
        <>
          <Divider />
          <Row2
            left={feeAmountUsd !== null && feeAmountUsd > 0
              ? { label: "Service Fee", labelAr: "رسوم الخدمة", value: `$${fmt(feeAmountUsd, 2)}`, accent: GOLD_DARK }
              : { label: "", value: undefined }}
            right={netFeeUsd > 0
              ? { label: "Network Fee", labelAr: "رسوم الشبكة", value: `$${fmt(netFeeUsd, 2)}`, accent: GOLD_DARK }
              : { label: "", value: undefined }}
          />
        </>
      )}

      {record.assetOrProviderName && (
        <>
          <Divider />
          <Field label="Provider" labelAr="المزود" value={record.assetOrProviderName} />
        </>
      )}

      {(record.clientSenderName || record.clientRecipientName) && (
        <>
          <Divider />
          <Row2
            left={record.clientSenderName ? { label: "Sender", labelAr: "المرسل", value: record.clientSenderName } : { label: "", value: undefined }}
            right={record.clientRecipientName ? { label: "Recipient", labelAr: "المستلم", value: record.clientRecipientName } : { label: "", value: undefined }}
          />
        </>
      )}

      {record.txidOrReferenceNumber && (
        <>
          <Divider />
          <Field label="Reference / TXID" labelAr="رقم المرجع" value={record.txidOrReferenceNumber} mono hash accent={GOLD_DARK} />
        </>
      )}

      {record.networkOrId && (
        <>
          <Divider />
          <Field label="Address / ID" labelAr="العنوان/المعرف" value={record.networkOrId} mono hash />
        </>
      )}

      {isCrypto && record.blockNumberOrBatchId && (
        <>
          <Divider />
          <Field label="Block" value={record.blockNumberOrBatchId} mono />
        </>
      )}

      {/* ══ CLIENT INFO ═════════════════════════════════════════════════════ */}
      <Band en="Client Info" ar="بيانات العميل" />

      <Field label="Name" labelAr="الاسم" value={clientName} large />
      {customerId !== "—" && (
        <>
          <Divider />
          <Row2
            left={{ label: "Customer ID", value: customerId, mono: true }}
            right={clientPhone !== "—" ? { label: "Phone", value: clientPhone } : { label: "", value: undefined }}
          />
        </>
      )}

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      {safeNotes && (
        <>
          <Band en="Note" />
          <div style={{ padding: "9px 24px 12px", color: TEXT, fontSize: "12px", lineHeight: 1.5 }}>
            {safeNotes}
          </div>
        </>
      )}

      {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
      <div style={{ height: "3px", background: `linear-gradient(90deg, ${GOLD}, ${GOLD_DARK})` }} />
      <div style={{ background: DARK, padding: "14px 28px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{
          color: GOLD, fontSize: "15px", fontWeight: 700,
          fontFamily: AR_FONT, direction: "rtl", unicodeBidi: "isolate",
        }}>
          شكراً لاختياركم كوين كاش
        </div>
      </div>
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

async function blobToDownload(el: HTMLElement, filename: string) {
  const blob = await domtoimage.toBlob(el, { scale: 2, bgcolor: "#ffffff" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadInvoiceFromElement(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  await blobToDownload(el, filename);
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

      await Promise.all([
        new Promise(r => setTimeout(r, 150)),
        document.fonts.load("700 16px 'Cairo'"),
        document.fonts.load("400 16px 'Cairo'"),
        document.fonts.ready,
      ]);

      const el = container.firstElementChild as HTMLElement;
      await blobToDownload(el, `${record.recordNumber}-receipt.png`);

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
  const [building, setBuilding] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [logoSrc, setLogoSrc] = useState("/coincash-logo.png");

  useEffect(() => {
    getLogoDataUrl().then(setLogoSrc);
    backfillFeeFromJE(record).then(setEnriched);
  }, [record.id]);

  // Pre-build the PNG blob as soon as the invoice is fully rendered (logo + fee data ready)
  useEffect(() => {
    if (!logoSrc.startsWith("data:") || !invoiceRef.current) return;
    let cancelled = false;
    const el = invoiceRef.current;
    setBlobUrl(null);
    setBuilding(true);
    const timer = setTimeout(() => {
      domtoimage
        .toBlob(el, { scale: 2, bgcolor: "#ffffff" })
        .then((blob: Blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
        })
        .catch((e: unknown) => console.error("Invoice pre-build failed:", e))
        .finally(() => { if (!cancelled) setBuilding(false); });
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enriched, logoSrc]);

  const handleDownload = useCallback(async () => {
    const filename = `${record.recordNumber}-receipt.png`;
    if (blobUrl) {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.click();
      return;
    }
    // Fallback: build on click if pre-build wasn't ready
    if (!invoiceRef.current) return;
    setDownloading(true);
    try {
      await blobToDownload(invoiceRef.current, filename);
    } finally {
      setDownloading(false);
    }
  }, [blobUrl, record.recordNumber]);

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
          disabled={downloading || building}
          data-testid={`button-download-${record.id}`}
        >
          {(downloading || building) ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
          {building ? "Preparing…" : "Download"}
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
