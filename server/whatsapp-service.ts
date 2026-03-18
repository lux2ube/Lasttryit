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

async function bridgeFetch(path: string, options: { method?: string; body?: any } = {}) {
  const url = `${BRIDGE_URL}${path}`;
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

class WhatsAppService extends EventEmitter {
  private isProcessing = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private dailyMessageCount = 0;
  private dailyResetDate = "";
  private burstCount = 0;
  private cachedStatus: any = null;
  private statusPollInterval: ReturnType<typeof setInterval> | null = null;

  getStatus() {
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
    if (!BRIDGE_URL) {
      this.cachedStatus = {
        status: "disconnected",
        qrCode: null,
        qrCodeBase64: null,
        lastError: "WA_BRIDGE_URL not configured",
        dailyMessageCount: 0,
        dailyLimit: RATE_LIMIT.DAILY_LIMIT,
      };
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
    console.log(`[WhatsApp] Bridge mode — connecting to ${BRIDGE_URL}`);
    this.startStatusPolling();
    try {
      await bridgeFetch("/connect", { method: "POST" });
    } catch (e: any) {
      console.log(`[WhatsApp] Bridge connect call failed (may need security group port open): ${e.message}`);
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
    try {
      await bridgeFetch("/disconnect", { method: "POST" });
    } catch (e: any) {
      console.error("[WhatsApp] Bridge disconnect error:", e.message);
    }
    await this.fetchStatus();
  }

  async reconnect() {
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
      const result = await bridgeFetch("/send", {
        method: "POST",
        body: { groupJid, message },
      });

      const wamid = result.wamid ?? null;

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

    if (p.providerName) {
      lines.push(`🏦 *المزود:* ${p.providerName}`);
    }

    if (p.serviceFeeUsd && parseFloat(p.serviceFeeUsd) > 0) {
      lines.push(`💳 *رسوم الخدمة:* $${formatAmount(p.serviceFeeUsd)}`);
    }
    if (p.networkFeeUsd && parseFloat(p.networkFeeUsd) > 0) {
      lines.push(`🔗 *رسوم الشبكة:* $${formatAmount(p.networkFeeUsd)}`);
    }

    lines.push(``, `📝 *تفاصيل العملية:*`);

    if (p.clientSenderName) {
      lines.push(`👤 *المرسل:* ${p.clientSenderName}`);
    }
    if (p.clientRecipientName) {
      lines.push(`👤 *المستلم:* ${p.clientRecipientName}`);
    }
    if (p.txidOrReferenceNumber) {
      lines.push(`🔑 *رقم المرجع:* ${p.txidOrReferenceNumber}`);
    }
    if (p.networkOrId) {
      lines.push(`📍 *العنوان/المعرف:* ${p.networkOrId}`);
    }

    lines.push(`📅 *التاريخ:* ${p.confirmedAt}`);

    if (p.manualNotes) {
      lines.push(`📌 *ملاحظات:* ${p.manualNotes}`);
    }

    lines.push(
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `✅ تم تأكيد العملية بنجاح`,
      `━━━━━━━━━━━━━━━━━━━━`,
    );

    return lines.join("\n");
  }

  async getGroups(): Promise<Array<{ id: string; subject: string; participants: number }>> {
    try {
      return await bridgeFetch("/groups");
    } catch (err: any) {
      console.error("[WhatsApp] Failed to fetch groups via bridge:", err.message);
      return [];
    }
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
}
