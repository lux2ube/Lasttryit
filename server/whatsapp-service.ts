import { EventEmitter } from "events";
import { db } from "./db";
import { notificationQueue, notificationAuditLog } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const BRIDGE_URL = process.env.WA_BRIDGE_URL || "";
const BRIDGE_API_KEY = process.env.WA_BRIDGE_API_KEY || "";

const RATE_LIMIT = {
  DAILY_LIMIT: 200,
  BURST_THRESHOLD: 10,
  COOLDOWN_AFTER_BURST: 30000,
  MIN_DELAY_MS: 4000,
  MAX_DELAY_MS: 9000,
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
    signal: AbortSignal.timeout(15000),
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

async function initBaileys() {
  if (baileysStatus === "connecting" || baileysStatus === "connected") return;

  try {
    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } =
      await import("@whiskeysockets/baileys");
    const { version } = await fetchLatestBaileysVersion();

    baileysStatus = "connecting";
    baileysLastError = null;

    const { state, saveCreds } = await useMultiFileAuthState("/var/data/wa-auth");

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ["FOMS Bridge", "Chrome", "1.0"],
      connectTimeoutMs: 30_000,
      keepAliveIntervalMs: 10_000,
    });

    baileysSocket = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        baileysQr = qr;
        baileysStatus = "qr_ready";
        baileysLastError = null;
        try {
          const QRCode = (await import("qrcode")).default;
          baileysQrBase64 = await QRCode.toDataURL(qr);
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
        console.log("[WhatsApp] Connected to WhatsApp");
        await refreshGroups();
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        baileysStatus = "disconnected";
        baileysQr = null;
        baileysQrBase64 = null;
        baileysLastError = `Disconnected (${statusCode ?? "unknown"})`;
        console.log(`[WhatsApp] Disconnected — statusCode: ${statusCode}, loggedOut: ${loggedOut}`);
        if (!loggedOut) {
          console.log("[WhatsApp] Reconnecting in 5s…");
          setTimeout(() => initBaileys(), 5000);
        } else {
          console.log("[WhatsApp] Logged out — delete /var/data/wa-auth to re-pair");
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
      console.log("[WhatsApp] Server mode — starting Baileys directly");
      await initBaileys();
      this.startQueueProcessor();
      this.startStatusPolling();
      return;
    }
    console.log(`[WhatsApp] Client mode — connecting to bridge at ${BRIDGE_URL}`);
    this.startStatusPolling();
    try {
      await bridgeFetch("/connect", { method: "POST" });
    } catch (e: any) {
      console.log(`[WhatsApp] Bridge connect call failed: ${e.message}`);
    }
    await this.fetchStatus();
  }

  private startStatusPolling() {
    if (this.statusPollInterval) return;
    this.statusPollInterval = setInterval(() => this.fetchStatus(), 4000);
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
      if (baileysSocket) {
        await baileysSocket.logout().catch(() => {});
        baileysSocket = null;
      }
      baileysStatus = "disconnected";
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
      await this.disconnect();
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
    this.pollInterval = setInterval(() => this.processQueue(), 5000);
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
      await db.execute(sql`
        UPDATE ${notificationQueue}
        SET status = 'queued', processed_at = NULL
        WHERE status = 'processing'
          AND processed_at < NOW() - INTERVAL '5 minutes'
      `);

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

      await db.update(notificationQueue)
        .set({
          status: "sent",
          wamid,
          sentAt: new Date(),
          attempts: job.attempts + 1,
          errorMessage: null,
        })
        .where(eq(notificationQueue.id, job.id));

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

      console.log(`[WhatsApp] Sent notification for ${job.recordNumber} to group → wamid: ${wamid}`);
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

  // Called by the /api/bridge/send route — sends directly via Baileys (server mode only)
  async sendDirect(groupJid: string, message: string) {
    return baileysSendMessage(groupJid, message);
  }

  async enqueueRecordNotification(record: Record<string, any>, customer: Record<string, any>) {
    const groupId = customer.whatsappGroupId;

    if (!groupId) {
      console.log(`[WhatsApp] Skip notification for ${record.recordNumber} — customer ${customer.customerId} has no WhatsApp group configured`);
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
  whatsappService.initialize().catch((e) => {
    console.error(`[WhatsApp] Auto-init failed: ${e.message}`);
  });
} else {
  console.log("[WhatsApp] No WA_BRIDGE_URL set — Baileys server mode will be used when connect is called");
}
