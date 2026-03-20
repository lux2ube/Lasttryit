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
  expenseUsd?: string;
  clientLiabilityUsd?: string;
  bankRate?: string;
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
  const isCash = record.type === "cash";
  const typeAr = isCash ? "نقدي" : "عملة رقمية";
  const directionAr = isInflow ? "إيداع" : "سحب";
  const liabilityLabel = isInflow ? "لكم" : "عليكم";
  const arrow = isInflow ? "⬇️" : "⬆️";
  const customerName = customer?.fullName ?? record.clientName ?? "العميل";

  const amount = parseFloat(record.amount);
  const feeAmountUsd = record.serviceFeeUsd ? parseFloat(record.serviceFeeUsd) : null;
  const netFeeUsd = record.networkFeeUsd ? parseFloat(record.networkFeeUsd) : 0;
  const clientLiability = record.clientLiabilityUsd ? parseFloat(record.clientLiabilityUsd) : null;

  const ev = confirmedEvent(record);
  const confirmedDate = ev?.timestamp
    ? format(new Date(ev.timestamp), "dd/MM/yyyy HH:mm")
    : format(new Date(record.updatedAt), "dd/MM/yyyy HH:mm");

  const principalUsd = record.usdEquivalent ? parseFloat(record.usdEquivalent) : null;
  const heroValue = clientLiability !== null
    ? `$${fmt(clientLiability, 2)}`
    : principalUsd !== null
      ? `$${fmt(principalUsd, 2)}`
      : `${fmt(amount, record.type === "crypto" ? 6 : 2)} ${record.currency}`;

  const lines: string[] = [
    `━━━━━━━━━━━━━━━━━━━━`,
    `${arrow} *تأكيد عملية — Coin Cash*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `عزيزنا العميل *${customerName}* قيدنا لحسابكم لدينا التفاصيل التالية:`,
    ``,
    `📊 *نوع العملية:* ${directionAr} — ${typeAr}`,
    `💰 *${liabilityLabel}:* ${heroValue}`,
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

// ── Design tokens ─────────────────────────────────────────────────────────────

const GOLD      = "#F5A623";
const GOLD_DARK = "#C4850C";
const NAVY      = "#0D1B2A";
const NAVY2     = "#132030";
const TEXT      = "#1A1A2E";
const TEXT_SEC  = "#6B7280";
const SEP       = "rgba(255,255,255,0.08)";
const WHITE     = "#FFFFFF";
const GREEN     = "#4ADE80";
const MONO_FONT = "'Courier New', 'Lucida Console', monospace";
const AR_FONT   = "'Cairo', Tahoma, Arial, sans-serif";

// Receipt canvas: 540×960px → captured at scale:2 → output 1080×1920px
const W = "540px";
const H = "960px";

// ── Tiny helpers (internal to template, no border props) ─────────────────────

const HR = () => (
  <div style={{ height: "1px", background: "rgba(0,0,0,0.06)", margin: "0 24px" }} />
);

// Section band uses a background-div accent bar instead of borderLeft (avoids CSS-reset conflict)
const SectionBand = ({ en, ar }: { en: string; ar?: string }) => (
  <div style={{ display: "flex", alignItems: "stretch", background: "rgba(245,166,35,0.08)" }}>
    <div style={{ width: "4px", background: GOLD, flexShrink: 0 }} />
    <div style={{ padding: "7px 20px 6px", display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ fontSize: "9px", fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: GOLD_DARK }}>
        {en}
      </span>
      {ar && (
        <span style={{ fontFamily: AR_FONT, direction: "rtl", unicodeBidi: "isolate", fontSize: "10px", fontWeight: 600, color: GOLD_DARK }}>
          · {ar}
        </span>
      )}
    </div>
  </div>
);

const F = ({ label, labelAr, value, mono, accent, large, hash, small }: {
  label: string; labelAr?: string; value?: string | React.ReactNode;
  mono?: boolean; accent?: string; large?: boolean; hash?: boolean; small?: boolean;
}) => {
  if (!value && value !== 0) return null;
  return (
    <div style={{ padding: "8px 24px" }}>
      <div style={{ fontSize: "8px", fontWeight: 700, color: TEXT_SEC, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "2px", display: "flex", alignItems: "center", gap: "5px" }}>
        {label}
        {labelAr && (
          <span style={{ fontFamily: AR_FONT, direction: "rtl", unicodeBidi: "isolate", textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#9CA3AF", fontSize: "9px" }}>
            · {labelAr}
          </span>
        )}
      </div>
      <div style={{
        fontSize: large ? "15px" : small ? "10.5px" : "13px",
        fontWeight: large ? 700 : 600,
        fontFamily: mono ? MONO_FONT : "inherit",
        color: accent ?? TEXT,
        wordBreak: hash ? "break-all" : "normal",
        overflowWrap: hash ? "break-word" : "normal",
        lineHeight: 1.35,
      }}>
        {value}
      </div>
    </div>
  );
};

const R2 = ({ left, right }: {
  left:  { label: string; labelAr?: string; value?: string | React.ReactNode; accent?: string; mono?: boolean; small?: boolean };
  right: { label: string; labelAr?: string; value?: string | React.ReactNode; accent?: string; mono?: boolean; small?: boolean };
}) => {
  if (!left.value && !right.value) return null;
  return (
    <div style={{ display: "flex", padding: "8px 24px", gap: "16px" }}>
      {[left, right].map((col, i) => (
        <div key={i} style={{ flex: 1, minWidth: 0 }}>
          {col.value ? (
            <>
              <div style={{ fontSize: "8px", fontWeight: 700, color: TEXT_SEC, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "2px", display: "flex", gap: "4px", alignItems: "center" }}>
                {col.label}
                {col.labelAr && <span style={{ fontFamily: AR_FONT, direction: "rtl", unicodeBidi: "isolate", textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#9CA3AF", fontSize: "9px" }}>· {col.labelAr}</span>}
              </div>
              <div style={{ fontSize: col.small ? "10.5px" : "13px", fontWeight: 600, color: col.accent ?? TEXT, fontFamily: col.mono ? MONO_FONT : "inherit", lineHeight: 1.35 }}>
                {col.value}
              </div>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
};

// ── Invoice Template — 1080×1920 receipt (540×960 element, scale:2) ───────────

export function InvoiceTemplate({
  record, customer, logoSrc,
}: {
  record: FinancialRecord; customer?: Customer; logoSrc?: string;
}) {
  const isCrypto = record.type === "crypto";
  const isCash   = record.type === "cash";
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
  const netFeeUsd    = record.networkFeeUsd ? parseFloat(record.networkFeeUsd) : 0;
  const clientLiability = record.clientLiabilityUsd ? parseFloat(record.clientLiabilityUsd) : null;

  const heroAmount = clientLiability !== null
    ? clientLiability
    : principalUsd !== null
      ? (isInflow
          ? Math.max(0, principalUsd - (feeAmountUsd ?? 0) - netFeeUsd)
          : principalUsd + (feeAmountUsd ?? 0) + netFeeUsd)
      : null;

  const safeNotes = clientNotes(record.notes);
  const logo = logoSrc ?? "/coincash-logo.png";

  const amountStr = `${fmt(amount, isCrypto ? 6 : 2)} ${record.currency}`;
  const hasFees = (feeAmountUsd !== null && feeAmountUsd > 0) || netFeeUsd > 0;

  const displayTotal = heroAmount !== null
    ? fmt(heroAmount, 2)
    : principalUsd !== null ? fmt(principalUsd, 2) : fmt(amount, isCrypto ? 4 : 2);
  const displayCcy = heroAmount !== null || principalUsd !== null ? "USD" : record.currency;
  const showBreakdown = heroAmount !== null && principalUsd !== null && Math.abs(heroAmount - principalUsd) > 0.001;

  return (
    <div id="ccr" style={{
      width: W,
      height: H,
      background: WHITE,
      fontFamily: "'Segoe UI', 'Inter', system-ui, sans-serif",
      direction: "ltr",
      color: TEXT,
      fontSize: "13px",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      border: "0",
      outline: "0",
    }}>
      {/* ── CSS reset: kills SVG foreignObject box artifacts in dom-to-image ── */}
      <style>{`
        #ccr, #ccr * {
          box-sizing: border-box !important;
          outline: 0 !important;
          outline-width: 0 !important;
          -webkit-tap-highlight-color: transparent !important;
        }
        #ccr div, #ccr span, #ccr p {
          border: 0 !important;
          border-width: 0 !important;
        }
        #ccr img { border: 0 !important; display: block !important; }
      `}</style>

      {/* ══ HEADER ═══════════════════════════════════════════════════════════ */}
      <div style={{ background: NAVY, padding: "20px 26px 16px", flexShrink: 0, border: "0", outline: "0" }}>
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "14px" }}>
          <img
            src={logo}
            alt=""
            crossOrigin="anonymous"
            style={{ width: "52px", height: "52px", objectFit: "contain", borderRadius: "12px", background: WHITE, padding: "4px", flexShrink: 0, display: "block" }}
          />
          <div>
            <div style={{ color: WHITE, fontSize: "26px", fontWeight: 900, lineHeight: 1.1, direction: "rtl", unicodeBidi: "isolate", fontFamily: AR_FONT }}>كوين كاش</div>
            <div style={{ color: GOLD, fontSize: "11px", fontWeight: 600, marginTop: "3px", letterSpacing: "0.3px" }}>Coin Cash — Money Exchange &amp; Crypto</div>
          </div>
        </div>
        {/* Gold separator */}
        <div style={{ height: "1px", background: "rgba(245,166,35,0.25)", marginBottom: "12px" }} />
        {/* Record # + Date */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "8px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", marginBottom: "3px" }}>Transaction Receipt</div>
            <div style={{ color: WHITE, fontSize: "13px", fontFamily: MONO_FONT, fontWeight: 700 }}>{record.recordNumber}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "8px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", marginBottom: "3px" }}>Date</div>
            <div style={{ color: WHITE, fontSize: "13px", fontWeight: 600 }}>{confirmedAt(record)}</div>
          </div>
        </div>
      </div>

      {/* ══ AMOUNT HERO ══════════════════════════════════════════════════════ */}
      <div style={{ background: NAVY2, padding: "18px 26px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "6px" }}>
              {isInflow
                ? <span>Net Credit to Customer · <span style={{ fontFamily: AR_FONT }}>لكم</span></span>
                : <span>Total Customer Charge · <span style={{ fontFamily: AR_FONT }}>عليكم</span></span>}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ color: isInflow ? GREEN : "#F87171", fontSize: "50px", fontWeight: 900, lineHeight: 1, letterSpacing: "-2px" }}>
                {displayTotal}
              </span>
              <span style={{ color: isInflow ? GREEN : "#F87171", fontSize: "20px", fontWeight: 800, opacity: 0.85 }}>
                {displayCcy}
              </span>
            </div>
            {showBreakdown && (
              <div style={{ color: "rgba(255,255,255,0.38)", fontSize: "11px", marginTop: "5px", fontWeight: 500 }}>
                {fmt(principalUsd!, 2)} {isInflow ? "−" : "+"} ${fmt(Math.abs(heroAmount! - principalUsd!), 2)} fees
              </div>
            )}
          </div>
          {/* Direction symbol — colored +/− only */}
          <div style={{
            background: isInflow ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
            borderRadius: "14px",
            padding: "12px 22px",
            textAlign: "center",
            flexShrink: 0,
            marginLeft: "14px",
          }}>
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: isInflow ? GREEN : "#F87171" }}>
              {isInflow ? "+" : "−"}
            </div>
          </div>
        </div>
      </div>

      {/* Gold accent bar */}
      <div style={{ height: "3px", background: `linear-gradient(90deg, ${GOLD_DARK}, ${GOLD}, ${GOLD_DARK})`, flexShrink: 0 }} />

      {/* ══ DETAILS BODY ═════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, background: WHITE, display: "flex", flexDirection: "column", overflowY: "hidden" }}>

        <SectionBand en="Transaction Details" ar="تفاصيل العملية" />

        <F label="Type" labelAr="نوع العملية" value={typeLabel(record.type, record.direction)} large />
        <HR />
        <R2
          left={{ label: "Amount", labelAr: "المبلغ", value: amountStr, mono: true }}
          right={principalUsd !== null && record.currency !== "USD"
            ? { label: "USD Equivalent", labelAr: "المعادل", value: `$${fmt(principalUsd, 2)}`, accent: "#16A34A" }
            : { label: "", value: undefined }}
        />

        {hasFees && (
          <>
            <HR />
            <R2
              left={feeAmountUsd !== null && feeAmountUsd > 0
                ? { label: "Service Fee", labelAr: "رسوم الخدمة", value: `$${fmt(feeAmountUsd, 2)}`, accent: GOLD_DARK }
                : { label: "", value: undefined }}
              right={netFeeUsd > 0
                ? { label: "Network Fee", labelAr: "رسوم الشبكة", value: `$${fmt(netFeeUsd, 2)}`, accent: GOLD_DARK }
                : { label: "", value: undefined }}
            />
          </>
        )}

        {record.assetOrProviderName && (<><HR /><F label="Provider" labelAr="المزود" value={record.assetOrProviderName} /></>)}

        {(record.clientSenderName || record.clientRecipientName) && (
          <>
            <HR />
            <R2
              left={record.clientSenderName ? { label: "Sender", labelAr: "المرسل", value: record.clientSenderName } : { label: "", value: undefined }}
              right={record.clientRecipientName ? { label: "Recipient", labelAr: "المستلم", value: record.clientRecipientName } : { label: "", value: undefined }}
            />
          </>
        )}

        {record.txidOrReferenceNumber && (
          <><HR /><F label="Reference / TXID" labelAr="رقم المرجع" value={record.txidOrReferenceNumber} mono hash accent={GOLD_DARK} small /></>
        )}

        {record.networkOrId && (
          <><HR /><F label="Address / ID" labelAr="العنوان/المعرف" value={record.networkOrId} mono hash small /></>
        )}

        {isCrypto && record.blockNumberOrBatchId && (
          <><HR /><F label="Block" value={record.blockNumberOrBatchId} mono /></>
        )}

        <SectionBand en="Client Info" ar="بيانات العميل" />
        <F label="Name" labelAr="الاسم" value={clientName} large />

        {safeNotes && (<><HR /><F label="Note" value={safeNotes} /></>)}

        <div style={{ flex: 1 }} />

        {/* Inner watermark strip */}
        <div style={{ padding: "8px 24px", background: "rgba(0,0,0,0.02)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#C4C9D4", fontSize: "8px", letterSpacing: "1px", textTransform: "uppercase", fontWeight: 600 }}>
            Verified · Secure · Licensed
          </div>
          <div style={{ color: "#C4C9D4", fontSize: "8px", fontFamily: MONO_FONT }}>
            {record.recordNumber}
          </div>
        </div>
      </div>

      {/* ══ FOOTER ═══════════════════════════════════════════════════════════ */}
      <div style={{ background: NAVY, padding: "16px 26px", flexShrink: 0, textAlign: "center" }}>
        <div style={{ color: GOLD, fontSize: "16px", fontWeight: 700, fontFamily: AR_FONT, direction: "rtl", unicodeBidi: "isolate", marginBottom: "4px" }}>
          شكراً لاختياركم كوين كاش
        </div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px", fontWeight: 600, marginBottom: "3px", letterSpacing: "0.3px" }}>
          www.ycoincash.com
        </div>
        <div style={{ color: "rgba(255,255,255,0.22)", fontSize: "8px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 600 }}>
          Coin Cash — Trust · Speed · Integrity
        </div>
      </div>
    </div>
  );
}

// ── Fee backfill from JE ──────────────────────────────────────────────────────

async function backfillFeeFromJE(record: FinancialRecord): Promise<FinancialRecord> {
  if (record.processingStage !== "confirmed") return record;
  if (record.clientLiabilityUsd) return record;
  try {
    const res = await fetch(`/api/accounting/journal-entries/for-record/${record.id}`, { credentials: "include" });
    if (!res.ok) return record;
    const { lines } = await res.json() as { lines: Array<{ accountCode: string; debitAmount: string; creditAmount: string }> };
    const cr = (code: string) => lines.filter(l => l.accountCode === code).reduce((s, l) => s + parseFloat(l.creditAmount ?? "0"), 0);
    const dr = (code: string) => lines.filter(l => l.accountCode === code).reduce((s, l) => s + parseFloat(l.debitAmount  ?? "0"), 0);
    const suspenseUsd = record.direction === "inflow" ? dr("2101") : cr("2101");
    if (suspenseUsd <= 0) return record;
    if (record.type === "crypto") {
      const svcFeeUsd = cr("4101");
      const gasUsd    = cr("4301");
      const feeRate   = suspenseUsd > 0 ? (svcFeeUsd / suspenseUsd) * 100 : 0;
      const customerNet = record.direction === "inflow"
        ? suspenseUsd - svcFeeUsd - gasUsd
        : suspenseUsd + svcFeeUsd + gasUsd;
      return { ...record, usdEquivalent: String(suspenseUsd.toFixed(4)), serviceFeeRate: String(feeRate.toFixed(4)), serviceFeeUsd: String(svcFeeUsd.toFixed(4)), networkFeeUsd: String(gasUsd.toFixed(6)), clientLiabilityUsd: String(Math.max(0, customerNet).toFixed(4)) };
    } else {
      const sprdCr   = cr("4201");
      const sprdDr   = dr("4201");
      const sprdUsd  = sprdCr - sprdDr;
      const sprdRate = suspenseUsd > 0 ? (sprdUsd / suspenseUsd) * 100 : 0;
      const customerNet = record.direction === "inflow"
        ? suspenseUsd - sprdUsd
        : suspenseUsd + sprdUsd;
      return { ...record, usdEquivalent: String(suspenseUsd.toFixed(4)), spreadUsd: String(sprdUsd.toFixed(4)), spreadRate: String(sprdRate.toFixed(4)), clientLiabilityUsd: String(Math.max(0, customerNet).toFixed(4)) };
    }
  } catch { return record; }
}

// ── Download: from an already-rendered ref (fast path) ────────────────────────

async function blobToDownload(el: HTMLElement, filename: string) {
  await document.fonts.ready;
  const blob = await domtoimage.toBlob(el, { scale: 3, bgcolor: "#ffffff" });
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
    const enriched = await backfillFeeFromJE(record);
    const msg = buildWhatsAppMessage(enriched, customer);
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [enriched, setEnriched] = useState<FinancialRecord>(record);
  const [downloading, setDownloading] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [logoSrc, setLogoSrc] = useState("/coincash-logo.png");
  const [previewScale, setPreviewScale] = useState(0.5);

  useEffect(() => {
    getLogoDataUrl().then(setLogoSrc);
    backfillFeeFromJE(record).then(setEnriched);
  }, [record.id]);

  // Silent background pre-build — never blocks button
  useEffect(() => {
    if (!logoSrc.startsWith("data:") || !invoiceRef.current) return;
    let cancelled = false;
    const el = invoiceRef.current;
    setBlobUrl(null);
    const timer = setTimeout(async () => {
      try {
        await document.fonts.ready;
        const blob = await domtoimage.toBlob(el, { scale: 3, bgcolor: "#ffffff" });
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      } catch (e) {
        console.error("Invoice pre-build failed:", e);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enriched, logoSrc]);

  // Dynamically scale preview to fill container width
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(() => {
      const w = containerRef.current?.clientWidth ?? 270;
      setPreviewScale(Math.min(w / 540, 1));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const handleDownload = useCallback(async () => {
    const filename = `${record.recordNumber}-receipt.png`;
    // Fast path: blob already pre-built
    if (blobUrl) {
      const a = document.createElement("a");
      a.href = blobUrl; a.download = filename; a.click();
      return;
    }
    // Fallback: capture on click
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
    <div className="flex flex-col items-center gap-3 w-full">
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
          {downloading ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Saving…</> : <><Download className="w-3 h-3 mr-1" />Download</>}
        </Button>
      </div>

      {/* Invoice preview — fills dialog width dynamically */}
      <div ref={containerRef} style={{ width: "100%" }}>
        <div style={{
          width: `${540 * previewScale}px`,
          height: `${960 * previewScale}px`,
          overflow: "hidden",
          borderRadius: "8px",
          border: "1px solid rgba(0,0,0,0.12)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.14)",
          margin: "0 auto",
        }}>
          <div style={{ transform: `scale(${previewScale})`, transformOrigin: "top left", width: "540px", height: "960px" }}>
            <div ref={invoiceRef} style={{ display: "inline-block" }}>
              <InvoiceTemplate record={enriched} customer={customer} logoSrc={logoSrc} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InvoiceDownloadButton;
