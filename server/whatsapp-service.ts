import { EventEmitter } from "events";
import { db } from "./db";
import { notificationQueue, notificationAuditLog } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

const BRIDGE_URL = process.env.WA_BRIDGE_URL || "";
const BRIDGE_API_KEY = process.env.WA_BRIDGE_API_KEY || "";

// Auth session directory (only used in server/Baileys mode on VPS)
const WA_AUTH_DIR = process.env.WA_AUTH_DIR || "/var/data/wa-auth";

const RATE_LIMIT = {
  DAILY_LIMIT: 200,
  BURST_THRESHOLD: 10,
  COOLDOWN_AFTER_BURST: 30_000,
  MIN_DELAY_MS: 4_000,
  MAX_DELAY_MS: 9_000,
};

// ─── Bridge client helpers (used when WA_BRIDGE_URL is set) ──────────────────

async function bridgeFetch(path: string, options: { method?: string; body?: any } = {}) {
  const url = `${BRIDGE_URL}/api/bridge${path}`;
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": BRIDGE_API_KEY,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bridge ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ─── Baileys-direct implementation (used when WA_BRIDGE_URL is NOT set) ──────

let baileysSocket: any = null;
let baileysQr: string | null = null;
let baileysQrBase64: string | null = null;
let baileysStatus: "connected" | "disconnected" | "connecting" | "qr_ready" = "disconnected";
let baileysLastError: string | null = null;
let baileysGroups: Map<string, any> = new Map();
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function hasAuthSession(): boolean {
  try {
    if (!fs.existsSync(WA_AUTH_DIR)) return false;
    const files = fs.readdirSync(WA_AUTH_DIR);
    return files.length > 0;
  } catch {
    return false;
  }
}

function getReconnectDelayMs(): number {
  // Exponential backoff: 5s, 10s, 20s, 40s … capped at 5 minutes + ±2s jitter
  const base = Math.min(5_000 * Math.pow(2, reconnectAttempts), 300_000);
  const jitter = Math.floor(Math.random() * 4_000) - 2_000;
  return Math.max(5_000, base + jitter);
}

function clearAuthSession() {
  try {
    if (fs.existsSync(WA_AUTH_DIR)) {
      fs.rmSync(WA_AUTH_DIR, { recursive: true, force: true });
      console.log("[WhatsApp] Cleared auth session — will show fresh QR on next connect");
    }
  } catch (e: any) {
    console.error("[WhatsApp] Failed to clear auth session:", e.message);
  }
}

async function initBaileys() {
  // Idempotent — skip if already connecting or connected
  if (baileysStatus === "connecting" || baileysStatus === "connected") {
    console.log(`[WhatsApp] initBaileys skipped — already ${baileysStatus}`);
    return;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    const {
      default: makeWASocket,
      DisconnectReason,
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
      Browsers,
    } = await import("@whiskeysockets/baileys");

    const pino = (await import("pino")).default;

    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WhatsApp] Baileys v${version.join(".")} — isLatest: ${isLatest}`);

    baileysStatus = "connecting";
    baileysLastError = null;

    const { state, saveCreds } = await useMultiFileAuthState(WA_AUTH_DIR);

    const sock = makeWASocket({
      version,
      auth: state,

      // ── Anti-ban: mimic real WhatsApp Web on Chrome ───────────────────────
      browser: Browsers.appropriate("Chrome"),
      printQRInTerminal: false,

      // ── Connection tuning ─────────────────────────────────────────────────
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 30_000,
      keepAliveIntervalMs: 25_000,
      retryRequestDelayMs: 2_500,
      maxMsgRetryCount: 5,

      // ── Privacy & stealth ─────────────────────────────────────────────────
      markOnlineOnConnect: false,
      syncFullHistory: false,
      fireInitQueries: true,

      // ── Performance ───────────────────────────────────────────────────────
      generateHighQualityLinkPreview: false,

      // ── Prevent "store not found" errors on retried messages ──────────────
      getMessage: async (_key: any) => ({ conversation: "" }),

      // ── Suppress Baileys' internal verbose logging ────────────────────────
      logger: pino({ level: "fatal" }),
    });

    baileysSocket = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        baileysQr = qr;
        baileysStatus = "qr_ready";
        baileysLastError = null;
        reconnectAttempts = 0;
        try {
          const QRCode = (await import("qrcode")).default;
          baileysQrBase64 = await QRCode.toDataURL(qr, {
            width: 280,
            margin: 2,
            color: { dark: "#000000", light: "#FFFFFF" },
          });
        } catch {
          baileysQrBase64 = null;
        }
        console.log("[WhatsApp] QR code ready — waiting for scan");
      }

      if (connection === "open") {
        baileysStatus = "connected";
        baileysQr = null;
        baileysQrBase64 = null;
        baileysLastError = null;
        reconnectAttempts = 0;
        console.log("[WhatsApp] Connected to WhatsApp successfully");
        await refreshGroups();
      }

      if (connection === "close") {
        const err = lastDisconnect?.error as any;
        const statusCode: number = err?.output?.statusCode ?? 0;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        baileysQr = null;
        baileysQrBase64 = null;
        baileysStatus = "disconnected";
        baileysLastError = `Disconnected (${statusCode || "unknown"})`;
        baileysSocket = null;

        console.log(`[WhatsApp] Connection closed — statusCode: ${statusCode}, loggedOut: ${loggedOut}`);

        if (loggedOut) {
          console.log("[WhatsApp] Logged out — clearing session for re-pairing");
          clearAuthSession();
        } else {
          reconnectAttempts++;
          const delay = getReconnectDelayMs();
          console.log(`[WhatsApp] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})…`);
          reconnectTimer = setTimeout(() => initBaileys(), delay);
        }
      }
    });

    sock.ev.on("groups.upsert", (groups: any[]) => {
      for (const g of groups) baileysGroups.set(g.id, g);
    });

    sock.ev.on("groups.update", (updates: any[]) => {
      for (const u of updates) {
        const existing = baileysGroups.get(u.id);
        if (existing) baileysGroups.set(u.id, { ...existing, ...u });
      }
    });

  } catch (e: any) {
    baileysStatus = "disconnected";
    baileysLastError = e.message;
    console.error("[WhatsApp] Baileys init error:", e.message);
    // Retry after 30s on init error
    reconnectTimer = setTimeout(() => initBaileys(), 30_000);
  }
}

async function refreshGroups() {
  if (!baileysSocket || baileysStatus !== "connected") return;
  try {
    const groupData = await baileysSocket.groupFetchAllParticipating();
    baileysGroups = new Map(Object.entries(groupData));
    console.log(`[WhatsApp] Loaded ${baileysGroups.size} groups`);
  } catch (e: any) {
    console.error("[WhatsApp] Failed to fetch groups:", e.message);
  }
}

async function baileysSendMessage(groupJid: string, message: string) {
  if (!baileysSocket || baileysStatus !== "connected") {
    throw new Error("WhatsApp not connected");
  }
  const jid = groupJid.includes("@") ? groupJid : `${groupJid}@g.us`;
  const result = await baileysSocket.sendMessage(jid, { text: message });
  return { wamid: result?.key?.id ?? null };
}

function getBaileysStatus() {
  return {
    status: baileysStatus,
    qrCode: baileysQr,
    qrCodeBase64: baileysQrBase64,
    lastError: baileysLastError,
    groupCount: baileysGroups.size,
    dailyMessageCount: 0,
    dailyLimit: RATE_LIMIT.DAILY_LIMIT,
  };
}

function getBaileysGroups(): Array<{ id: string; subject: string; participants: number }> {
  return Array.from(baileysGroups.values()).map((g: any) => ({
    id: g.id,
    subject: g.subject ?? g.id,
    participants: g.participants?.length ?? 0,
  }));
}

// ─── WhatsApp Service (unified) ───────────────────────────────────────────────

class WhatsAppService extends EventEmitter {
  private isProcessing = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private dailyMessageCount = 0;
  private dailyResetDate = "";
  private burstCount = 0;
  private cachedStatus: any = null;
  private statusPollInterval: ReturnType<typeof setInterval> | null = null;

  private get isClientMode() { return !!BRIDGE_URL; }

  getStatus() {
    if (!this.isClientMode) return getBaileysStatus();
    return this.cachedStatus || {
      status: "disconnected",
      qrCode: null,
      qrCodeBase64: null,
      lastError: null,
      dailyMessageCount: 0,
      dailyLimit: RATE_LIMIT.DAILY_LIMIT,
    };
  }

  async fetchStatus() {
    if (!this.isClientMode) {
      this.cachedStatus = getBaileysStatus();
      return this.cachedStatus;
    }
    try {
      this.cachedStatus = await bridgeFetch("/status");
      if (this.cachedStatus.status === "connected" && !this.pollInterval) {
        this.startQueueProcessor();
      }
      if (this.cachedStatus.status !== "connected" && this.pollInterval) {
        this.stopQueueProcessor();
      }
      return this.cachedStatus;
    } catch (e: any) {
      console.error(`[WhatsApp] Bridge status poll failed: ${e.message}`);
      this.cachedStatus = {
        status: "disconnected",
        qrCode: null,
        qrCodeBase64: null,
        lastError: `Bridge unreachable: ${e.message}`,
        dailyMessageCount: 0,
        dailyLimit: RATE_LIMIT.DAILY_LIMIT,
      };
      return this.cachedStatus;
    }
  }

  async initialize() {
    if (!this.isClientMode) {
      // Server/VPS mode: only start if not already running
      if (baileysStatus === "connecting" || baileysStatus === "connected") {
        console.log(`[WhatsApp] Server mode — already ${baileysStatus}, skipping re-init`);
        return;
      }
      console.log("[WhatsApp] Server mode — starting Baileys");
      await initBaileys();
      this.startQueueProcessor();
      this.startStatusPolling();
      return;
    }

    // Client/Replit mode: check if VPS is already live before calling /connect
    console.log(`[WhatsApp] Client mode — checking bridge at ${BRIDGE_URL}`);
    this.startStatusPolling();

    try {
      const current = await bridgeFetch("/status");
      this.cachedStatus = current;

      if (current.status === "connected" || current.status === "qr_ready" || current.status === "connecting") {
        // VPS is already active — don't interrupt it
        console.log(`[WhatsApp] Bridge already ${current.status} — skipping connect call`);
        if (current.status === "connected") this.startQueueProcessor();
        return;
      }
    } catch (e: any) {
      console.log(`[WhatsApp] Bridge pre-check failed: ${e.message} — proceeding with connect`);
    }

    // VPS is disconnected — ask it to connect
    try {
      await bridgeFetch("/connect", { method: "POST" });
      console.log("[WhatsApp] Bridge connect requested");
    } catch (e: any) {
      console.log(`[WhatsApp] Bridge connect call failed: ${e.message}`);
    }
    await this.fetchStatus();
  }

  private startStatusPolling() {
    if (this.statusPollInterval) return;
    this.statusPollInterval = setInterval(() => this.fetchStatus(), 4_000);
  }

  private stopStatusPolling() {
    if (this.statusPollInterval) {
      clearInterval(this.statusPollInterval);
      this.statusPollInterval = null;
    }
  }

  async disconnect() {
    this.stopQueueProcessor();
    if (!this.isClientMode) {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (baileysSocket) {
        await baileysSocket.logout().catch(() => {});
        baileysSocket = null;
      }
      baileysStatus = "disconnected";
      baileysQr = null;
      baileysQrBase64 = null;
      return;
    }
    try {
      await bridgeFetch("/disconnect", { method: "POST" });
    } catch (e: any) {
      console.error("[WhatsApp] Bridge disconnect error:", e.message);
    }
    await this.fetchStatus();
  }

  async reconnect() {
    if (!this.isClientMode) {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (baileysSocket) {
        await baileysSocket.logout().catch(() => {});
        baileysSocket = null;
      }
      baileysStatus = "disconnected";
      reconnectAttempts = 0;
      await initBaileys();
      return;
    }
    try {
      await bridgeFetch("/reconnect", { method: "POST" });
    } catch (e: any) {
      console.error("[WhatsApp] Bridge reconnect error:", e.message);
    }
    await this.fetchStatus();
  }

  private startQueueProcessor() {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => this.processQueue(), 5_000);
    console.log("[WhatsApp] Queue processor started (polling every 5s)");
  }

  private stopQueueProcessor() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isProcessing = false;
  }

  private resetDailyCounterIfNeeded() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyResetDate !== today) {
      this.dailyMessageCount = 0;
      this.dailyResetDate = today;
      this.burstCount = 0;
    }
  }

  private async processQueue() {
    if (this.isProcessing) return;

    const status = this.getStatus();
    if (status.status !== "connected") return;

    this.resetDailyCounterIfNeeded();
    if (this.dailyMessageCount >= RATE_LIMIT.DAILY_LIMIT) return;

    this.isProcessing = true;

    try {
      // Reset jobs stuck in 'processing' for >2 minutes (deployment/crash recovery)
      await db.execute(sql`
        UPDATE ${notificationQueue}
        SET status = 'failed',
            error_message = 'Reset: stuck in processing state (likely server restart)',
            next_retry_at = NOW() + INTERVAL '30 seconds'
        WHERE status = 'processing'
          AND processed_at < NOW() - INTERVAL '2 minutes'
      `);

      // Atomically claim the next job
      const result = await db.execute(sql`
        UPDATE ${notificationQueue}
        SET status = 'processing', processed_at = NOW()
        WHERE id = (
          SELECT id FROM ${notificationQueue}
          WHERE (status = 'queued')
             OR (status = 'failed' AND next_retry_at <= NOW() AND attempts < max_attempts)
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);

      const rows = (result as any).rows ?? result;
      const job = rows?.[0];

      if (!job) {
        this.isProcessing = false;
        return;
      }

      await this.sendNotification(job);
    } catch (err) {
      console.error("[WhatsApp] Queue processing error:", err);
    } finally {
      this.isProcessing = false;
    }
  }

  private async sendNotification(raw: any) {
    const job = {
      id: raw.id,
      recordId: raw.record_id ?? raw.recordId,
      recordNumber: raw.record_number ?? raw.recordNumber,
      customerId: raw.customer_id ?? raw.customerId,
      customerName: raw.customer_name ?? raw.customerName,
      recipientPhone: raw.recipient_phone ?? raw.recipientPhone,
      templateName: raw.template_name ?? raw.templateName,
      payload: raw.payload,
      attempts: raw.attempts ?? 0,
      maxAttempts: raw.max_attempts ?? raw.maxAttempts ?? 5,
    };

    // ── At-most-once delivery: check if already sent before doing anything ──
    const idempotencyCheck = await db.execute(sql`
      SELECT COUNT(*) as cnt
      FROM ${notificationAuditLog}
      WHERE queue_id = ${job.id}
        AND delivery_status = 'sent'
    `);
    const alreadySent = parseInt((idempotencyCheck as any).rows?.[0]?.cnt ?? "0") > 0;
    if (alreadySent) {
      console.log(`[WhatsApp] Job ${job.recordNumber} already sent (idempotency check) — marking done`);
      await db.update(notificationQueue)
        .set({ status: "sent", errorMessage: null, nextRetryAt: null })
        .where(eq(notificationQueue.id, job.id));
      return;
    }

    const payload = (typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload) as Record<string, any>;
    const groupJid = job.recipientPhone;
    const message = this.formatInvoiceMessage(payload);

    try {
      let wamid: string | null = null;

      if (this.isClientMode) {
        const result = await bridgeFetch("/send", {
          method: "POST",
          body: { groupJid, message },
        });
        wamid = result.wamid ?? null;
      } else {
        const result = await baileysSendMessage(groupJid, message);
        wamid = result.wamid ?? null;
      }

      // Update queue entry — clear nextRetryAt to prevent false retries
      await db.update(notificationQueue)
        .set({
          status: "sent",
          wamid,
          sentAt: new Date(),
          attempts: job.attempts + 1,
          errorMessage: null,
          nextRetryAt: null,          // ← critical: prevent re-pickup after success
        })
        .where(eq(notificationQueue.id, job.id));

      // Audit log — this is the authoritative deduplication record
      await db.insert(notificationAuditLog).values({
        queueId: job.id,
        recordId: job.recordId,
        recordNumber: job.recordNumber,
        customerId: job.customerId,
        customerName: job.customerName,
        recipientPhone: job.recipientPhone,
        wamid,
        templateName: job.templateName,
        deliveryStatus: "sent",
        statusUpdatedAt: new Date(),
        payloadSnapshot: payload,
      });

      this.dailyMessageCount++;
      this.burstCount++;

      console.log(`[WhatsApp] Sent ${job.recordNumber} → group ${groupJid} | wamid: ${wamid}`);
    } catch (err: any) {
      const attempts = job.attempts + 1;
      const isFinal = attempts >= job.maxAttempts;
      const nextRetryMs = Math.min(30_000 * Math.pow(2, attempts - 1), 3_600_000);

      await db.update(notificationQueue)
        .set({
          status: isFinal ? "dead" : "failed",
          attempts,
          errorMessage: err.message?.substring(0, 500) ?? "Unknown error",
          nextRetryAt: isFinal ? null : new Date(Date.now() + nextRetryMs),
        })
        .where(eq(notificationQueue.id, job.id));

      if (isFinal) {
        await db.insert(notificationAuditLog).values({
          queueId: job.id,
          recordId: job.recordId,
          recordNumber: job.recordNumber,
          customerId: job.customerId,
          customerName: job.customerName,
          recipientPhone: job.recipientPhone,
          wamid: null,
          templateName: job.templateName,
          deliveryStatus: "failed",
          statusUpdatedAt: new Date(),
          errorDetail: err.message?.substring(0, 500),
          payloadSnapshot: payload,
        });
      }

      console.error(`[WhatsApp] Failed to send ${job.recordNumber} (attempt ${attempts}/${job.maxAttempts}): ${err.message}`);
    }
  }

  private formatInvoiceMessage(p: Record<string, any>): string {
    const isInflow = p.direction === "inflow";
    const typeAr = p.type === "cash" ? "نقدي" : "عملة رقمية";
    const directionAr = isInflow ? "إيداع" : "سحب";
    const liabilityLabel = isInflow ? "لكم" : "عليكم";
    const arrow = isInflow ? "⬇️" : "⬆️";

    const lines = [
      `━━━━━━━━━━━━━━━━━━━━`,
      `${arrow} *تأكيد عملية — Coin Cash*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `عزيزنا العميل *${p.customerName}* قيدنا لحسابكم لدينا التفاصيل التالية:`,
      ``,
      `📊 *نوع العملية:* ${directionAr} — ${typeAr}`,
      `💰 *${liabilityLabel}:* $${formatAmount(p.usdEquivalent)}`,
      `💵 *المبلغ:* ${formatAmount(p.amount)} ${p.currency}`,
      `📋 *رقم العملية:* ${p.recordNumber}`,
    ];

    if (p.providerName) lines.push(`🏦 *المزود:* ${p.providerName}`);
    if (p.serviceFeeUsd && parseFloat(p.serviceFeeUsd) > 0) lines.push(`💳 *رسوم الخدمة:* $${formatAmount(p.serviceFeeUsd)}`);
    if (p.networkFeeUsd && parseFloat(p.networkFeeUsd) > 0) lines.push(`🔗 *رسوم الشبكة:* $${formatAmount(p.networkFeeUsd)}`);

    lines.push(``, `📝 *تفاصيل العملية:*`);

    if (p.clientSenderName) lines.push(`👤 *المرسل:* ${p.clientSenderName}`);
    if (p.clientRecipientName) lines.push(`👤 *المستلم:* ${p.clientRecipientName}`);
    if (p.txidOrReferenceNumber) lines.push(`🔑 *رقم المرجع:* ${p.txidOrReferenceNumber}`);
    if (p.networkOrId) lines.push(`📍 *العنوان/المعرف:* ${p.networkOrId}`);

    lines.push(`📅 *التاريخ:* ${p.confirmedAt}`);

    if (p.manualNotes) lines.push(`📌 *ملاحظات:* ${p.manualNotes}`);

    lines.push(
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `✅ تم تأكيد العملية بنجاح`,
      `━━━━━━━━━━━━━━━━━━━━`,
    );

    return lines.join("\n");
  }

  async getGroups(): Promise<Array<{ id: string; subject: string; participants: number }>> {
    if (!this.isClientMode) {
      await refreshGroups();
      return getBaileysGroups();
    }
    try {
      return await bridgeFetch("/groups");
    } catch (err: any) {
      console.error("[WhatsApp] Failed to fetch groups via bridge:", err.message);
      return [];
    }
  }

  async sendDirect(groupJid: string, message: string) {
    return baileysSendMessage(groupJid, message);
  }

  async enqueueRecordNotification(record: Record<string, any>, customer: Record<string, any>) {
    const groupId = customer.whatsappGroupId;

    if (!groupId) {
      console.log(`[WhatsApp] Skip notification for ${record.recordNumber} — no WhatsApp group configured`);
      return null;
    }

    const normalizedGroupId = groupId.includes("@") ? groupId : `${groupId}@g.us`;

    const payload = {
      recordNumber: record.recordNumber,
      direction: record.direction,
      type: record.type,
      amount: record.amount,
      currency: record.currency,
      usdEquivalent: record.clientLiabilityUsd ?? record.usdEquivalent,
      customerName: customer.fullName ?? record.clientName,
      customerId: customer.customerId,
      providerName: record.assetOrProviderName ?? null,
      serviceFeeUsd: record.serviceFeeUsd,
      networkFeeUsd: record.networkFeeUsd,
      clientSenderName: record.clientSenderName ?? null,
      clientRecipientName: record.clientRecipientName ?? null,
      txidOrReferenceNumber: record.txidOrReferenceNumber ?? null,
      networkOrId: record.networkOrId ?? null,
      manualNotes: record.notificationNotes ?? null,
      confirmedAt: new Date().toLocaleString("en-GB", { timeZone: "Asia/Aden" }),
      confirmedBy: record.confirmedBy,
    };

    const [queued] = await db.insert(notificationQueue).values({
      recordId: record.id,
      recordNumber: record.recordNumber,
      customerId: customer.id,
      customerName: customer.fullName ?? record.clientName ?? "Unknown",
      recipientPhone: normalizedGroupId,
      templateName: "record_confirmed_v1",
      templateLang: "ar",
      payload,
      status: "queued",
      attempts: 0,
      maxAttempts: 5,
    }).returning();

    console.log(`[WhatsApp] Queued notification for ${record.recordNumber} → group ${normalizedGroupId}`);
    return queued;
  }
}

function formatAmount(val: string | number | null | undefined): string {
  if (val == null || val === "") return "0.00";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return String(val);
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const whatsappService = new WhatsAppService();

if (BRIDGE_URL) {
  // Client/Replit mode — poll bridge, don't interrupt if already connected
  whatsappService.initialize().catch((e) => {
    console.error(`[WhatsApp] Auto-init failed: ${e.message}`);
  });
} else {
  // Server/VPS mode — auto-start from saved session for 24/7 uptime
  if (hasAuthSession()) {
    console.log("[WhatsApp] Auth session found — auto-starting Baileys for 24/7 operation");
    whatsappService.initialize().catch((e) => {
      console.error(`[WhatsApp] Auto-start failed: ${e.message}`);
    });
  } else {
    console.log("[WhatsApp] No auth session — call /api/bridge/connect to pair with QR code");
  }
}
