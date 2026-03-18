# WhatsApp Notification Architecture — FOMS (Coin Cash)

## Real-Time Event-Driven Notification System for Confirmed Financial Records

**Author:** Systems Engineering  
**Version:** 2.0  
**Date:** 2026-03-12  

---

## 1. Executive Summary

This document defines the architecture for an event-driven notification pipeline that sends WhatsApp messages to dedicated client groups the instant a financial record (inflow or outflow) is confirmed. Uses `@whiskeysockets/baileys` (WhatsApp Web protocol library) with strict anti-ban rate limiting, PostgreSQL-backed job queue, and immutable audit logging.

---

## 2. System Components

| Component | Role | Technology |
|---|---|---|
| **Trigger** | Fires when `processingStage` → `confirmed` in PATCH /api/records/:id | Direct call in routes.ts |
| **Message Queue** | Buffers payloads, guarantees delivery, handles rate limits | `notification_queue` PostgreSQL table |
| **Dispatcher Worker** | Polls queue every 5s, sends via Baileys, updates audit trail | In-process background worker (`WhatsAppService`) |
| **WhatsApp Web** | Delivers messages to client groups via WebSocket protocol | `@whiskeysockets/baileys` |
| **Audit Log** | Immutable delivery record linked to each `recordId` | `notification_audit_log` table |
| **Group ID Registry** | Maps `Client_ID` → `WhatsApp Group JID` | `customers.whatsappGroupId` |

---

## 3. Anti-Ban Rate Limiting Rules

| Rule | Value | Rationale |
|---|---|---|
| Min delay between messages | 4 seconds | WhatsApp detects sub-3s patterns |
| Max delay between messages | 9 seconds | Random jitter prevents detection |
| Daily limit per number | 200 messages | Safe ceiling for non-Business accounts |
| Typing simulation | 2-3 seconds composing presence | Mimics human behavior |
| Burst cooldown | 30s pause after 10 consecutive messages | Prevents rapid-fire patterns |
| Session persistence | Multi-file auth state saved to disk | Avoids repeated QR scans |
| Reconnect backoff | Exponential: 5s → 10s → 20s → ... → 5min max | Prevents reconnect spam |
| Max reconnect attempts | 10 | After 10 failures, requires manual re-scan |

---

## 4. Message Format (Arabic Invoice)

```
━━━━━━━━━━━━━━━━━━━━
⬇️ *تأكيد عملية — Coin Cash*
━━━━━━━━━━━━━━━━━━━━

📋 *رقم العملية:* REC-00142
📊 *النوع:* إيداع (وارد) — نقدي
💰 *المبلغ:* 500,000.00 YER
💵 *المعادل بالدولار:* $1,996.01
👤 *العميل:* محمد الجرموزي
🏦 *الحساب:* Kuraimi YER
📈 *هامش الصرف:* $3.99
📅 *التاريخ:* 12/03/2026, 10:23:45
📝 *رقم القيد:* JE-00089

━━━━━━━━━━━━━━━━━━━━
✅ تم تأكيد العملية بنجاح
━━━━━━━━━━━━━━━━━━━━
```

---

## 5. Sequence Flow

1. Staff clicks **Confirm** → `PATCH /api/records/:id` with `{ processingStage: "confirmed" }`
2. Validation passes → Journal Entry created, rates locked, record stage = `confirmed`
3. After `storage.updateRecord` succeeds, `whatsappService.enqueueRecordNotification(record, customer)` is called
4. If customer has `whatsappGroupId`, payload is built and inserted into `notification_queue` (status: `queued`)
5. Background worker polls queue every 5 seconds
6. Worker claims job → sets status to `processing`
7. Sends "composing" presence to group (typing simulation)
8. After 2-3s delay, sends the formatted invoice message via Baileys WebSocket
9. On success: status → `sent`, audit log entry created, daily counter incremented
10. On failure: exponential backoff retry (30s → 2m → 10m → 1h → final), then `dead` status

---

## 6. Retry Strategy

| Attempt | Delay | Action |
|---|---|---|
| 1 | Immediate | First delivery attempt |
| 2 | 30 seconds | Exponential backoff |
| 3 | 2 minutes | |
| 4 | 10 minutes | |
| 5 | 1 hour | Final attempt |
| — | — | Status → `dead` |

---

## 7. API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/whatsapp/status` | Connection status, QR code, daily counter |
| POST | `/api/whatsapp/connect` | Initialize WhatsApp connection (generates QR) |
| POST | `/api/whatsapp/disconnect` | Logout and disconnect |
| POST | `/api/whatsapp/reconnect` | Force reconnect (new QR if needed) |
| GET | `/api/notifications/queue` | List queued/sent/failed notifications |
| GET | `/api/notifications/audit` | Audit log with delivery status |
| GET | `/api/notifications/stats` | Queue stats by status |
| POST | `/api/notifications/:id/cancel` | Cancel a queued notification |
| POST | `/api/notifications/:id/retry` | Retry a failed/dead notification |

---

## 8. Database Schema

### notification_queue
- `id` (UUID PK), `record_id`, `record_number`, `customer_id`, `customer_name`
- `recipient_phone` (WhatsApp Group JID), `template_name`, `template_lang`
- `payload` (JSONB — full record details), `status` (queued/processing/sent/failed/dead)
- `attempts`, `max_attempts` (5), `next_retry_at`, `error_message`
- `wamid` (WhatsApp message ID), `sent_at`, `processed_at`, `created_at`

### notification_audit_log
- `id` (UUID PK), `queue_id` (FK), `record_id`, `record_number`
- `customer_id`, `customer_name`, `recipient_phone`
- `wamid`, `template_name`, `delivery_status` (sent/delivered/read/failed)
- `status_updated_at`, `error_detail`, `payload_snapshot` (JSONB), `created_at`

---

## 9. Implementation Files

| File | Role |
|---|---|
| `shared/schema.ts` | `notificationQueue` + `notificationAuditLog` Drizzle table definitions |
| `server/whatsapp-service.ts` | WhatsAppService class — connection management, queue processor, message formatting, rate limiting |
| `server/storage.ts` | `getNotificationQueue()`, `getNotificationAuditLog()`, `getNotificationStats()`, `cancelNotification()`, `retryNotification()` |
| `server/routes.ts` | Confirmation trigger (line ~819), notification management API endpoints |

---

## 10. Architecture Constraints

| Constraint | Rationale |
|---|---|
| **No direct sends from event handler** | Confirmation handler only writes to queue. Dispatcher is the sole WhatsApp caller. |
| **Immutable audit log** | INSERT-only for core records. Only `delivery_status` is updated. |
| **Queue is the source of truth** | If the worker crashes, queue retains the job. No lost notifications. |
| **PostgreSQL-backed queue** | No external broker needed. Uses atomic UPDATE...RETURNING for safe job claiming. |
| **Single-threaded dispatcher** | One message at a time with random delays prevents pattern detection. |
