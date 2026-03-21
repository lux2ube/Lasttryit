import axios, { AxiosInstance, AxiosError } from "axios";
import https from "node:https";
import { db } from "./db";
import { kuraimiPayments } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

const UAT_BASE_URL = "https://web.krmbank.net.ye:44746";
const API_PATHS = {
  sendPayment:        "/alk-payments-exp/v1/PHEPaymentAPI/EPayment/SendPayment",
  reversePayment:     "/alk-payments-exp/v1/PHEPaymentAPI/EPayment/ReversePayment",
  getBalance:         "/alk-payments-exp/v1/PHEPaymentAPI/EPayment/GetBalance",
  getMiniStatement:   "/alk-payments-exp/v1/PHEPaymentAPI/EPayment/GetMiniStatement",
  getStatement:       "/alk-payments-exp/v1/PHEPaymentAPI/EPayment/GetStatement",
  getLastTransaction: "/alk-payments-exp/v1/PHEPaymentAPI/EPayment/GetLastTransaction",
  inquiry:            "/alk-payments-exp/v1/PHEPaymentAPI/EPayment/Inquiry",
  checkBalance:       "/alk-payments-exp/v1/PHEPaymentAPI/EPayment/CheckBalance",
};

interface ApiResponse {
  Code: number;
  Message: string;
  MessageDesc: string;
  Date: string;
  ResultSet: { PH_REF_NO?: string } | null;
}

let axiosClient: AxiosInstance | null = null;

function getSettings() {
  const username = process.env.KURAIMI_USERNAME;
  const password = process.env.KURAIMI_PASSWORD;
  if (!username || !password) return null;
  return {
    username,
    password,
    environment: (process.env.KURAIMI_ENV as "UAT" | "PROD") || "UAT",
    merchantName: process.env.KURAIMI_MERCHANT_NAME || "Coin Cash",
    baseUrl: process.env.KURAIMI_BASE_URL || undefined,
  };
}

function getAxios(): AxiosInstance {
  const settings = getSettings();
  if (!settings) throw new Error("Kuraimi credentials not configured. Set KURAIMI_USERNAME and KURAIMI_PASSWORD in environment secrets.");
  if (!axiosClient) {
    const baseURL = settings.baseUrl || (settings.environment === "UAT" ? UAT_BASE_URL : (() => { throw new Error("Production base URL required. Set KURAIMI_BASE_URL."); })());
    const auth = Buffer.from(`${settings.username}:${settings.password}`).toString("base64");
    axiosClient = axios.create({
      baseURL,
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Basic ${auth}` },
      httpsAgent: new https.Agent({ rejectUnauthorized: settings.environment !== "UAT" }),
      timeout: 30000,
    });
  }
  return axiosClient;
}

export function resetClient() { axiosClient = null; }
export function isConfigured(): boolean { return !!getSettings(); }

function generateRefNo(): string {
  return `CC_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function callApi(path: string, payload: Record<string, any>): Promise<ApiResponse> {
  try {
    const response = await getAxios().post<ApiResponse>(path, payload);
    return response.data;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const ae = error as AxiosError<any>;
      const apiErr: any = new Error(`API Error: ${ae.response?.status || "Network Error"} ${ae.response?.statusText || ""}`);
      apiErr.statusCode = ae.response?.status;
      apiErr.data = ae.response?.data;
      throw apiErr;
    }
    throw error;
  }
}

export async function sendPayment(params: {
  scustId: string;
  amount: number;
  currency?: string;
  pinPass: string;
  customerId?: string;
  customerName?: string;
  createdBy?: string;
}): Promise<{ payment: typeof kuraimiPayments.$inferSelect; apiResponse: ApiResponse }> {
  const settings = getSettings();
  if (!settings) throw new Error("Kuraimi not configured");

  const refNo = generateRefNo();
  const [payment] = await db.insert(kuraimiPayments).values({
    refNo,
    scustId: params.scustId,
    amount: params.amount.toFixed(2),
    currency: params.currency || "YER",
    merchantName: settings.merchantName,
    direction: "payment",
    status: "pending",
    customerId: params.customerId || null,
    customerName: params.customerName || null,
    createdBy: params.createdBy || null,
  }).returning();

  try {
    const response = await callApi(API_PATHS.sendPayment, {
      SCustID: params.scustId,
      REFNO: refNo,
      AMOUNT: params.amount,
      CRCY: params.currency || "YER",
      MRCHNTNAME: settings.merchantName,
      PINPASS: Buffer.from(params.pinPass).toString("base64"),
    });

    const status = response.Code === 1 ? "success" : "failed";
    const [updated] = await db.update(kuraimiPayments)
      .set({
        status,
        bankRefNo: response.ResultSet?.PH_REF_NO || null,
        apiCode: response.Code,
        apiMessage: response.Message,
        apiMessageDesc: response.MessageDesc,
        updatedAt: new Date(),
      })
      .where(eq(kuraimiPayments.id, payment.id))
      .returning();

    return { payment: updated, apiResponse: response };
  } catch (error: any) {
    const errorData = error.data || {};
    await db.update(kuraimiPayments)
      .set({
        status: "failed",
        apiCode: error.statusCode || errorData.Code || null,
        apiMessage: error.message || errorData.Message || "Unknown error",
        apiMessageDesc: errorData.MessageDesc || null,
        updatedAt: new Date(),
      })
      .where(eq(kuraimiPayments.id, payment.id));
    throw error;
  }
}

export async function reversePayment(paymentId: string): Promise<{ payment: typeof kuraimiPayments.$inferSelect; apiResponse: ApiResponse }> {
  const [existing] = await db.select().from(kuraimiPayments).where(eq(kuraimiPayments.id, paymentId));
  if (!existing) throw new Error("Payment not found");
  if (existing.status !== "success") throw new Error("Only successful payments can be reversed");
  if (existing.reversedAt) throw new Error("Payment already reversed");

  try {
    const response = await callApi(API_PATHS.reversePayment, {
      SCustID: existing.scustId,
      REFNO: existing.refNo,
    });

    const reversed = response.Code === 1;
    const [updated] = await db.update(kuraimiPayments)
      .set({
        status: reversed ? "reversed" : existing.status,
        reversedAt: reversed ? new Date() : null,
        reversalRefNo: response.ResultSet?.PH_REF_NO || null,
        apiMessage: response.Message,
        apiMessageDesc: response.MessageDesc,
        updatedAt: new Date(),
      })
      .where(eq(kuraimiPayments.id, paymentId))
      .returning();

    return { payment: updated, apiResponse: response };
  } catch (error: any) {
    throw error;
  }
}

export async function getPayments(opts?: { limit?: number; offset?: number }) {
  const limit = opts?.limit || 50;
  const offset = opts?.offset || 0;
  const [payments, countResult] = await Promise.all([
    db.select().from(kuraimiPayments).orderBy(desc(kuraimiPayments.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(kuraimiPayments),
  ]);
  return { data: payments, total: countResult[0]?.count ?? 0 };
}

export async function getPayment(id: string) {
  const [payment] = await db.select().from(kuraimiPayments).where(eq(kuraimiPayments.id, id));
  return payment || null;
}

export async function linkPaymentToRecord(paymentId: string, recordId: string) {
  const [updated] = await db.update(kuraimiPayments)
    .set({ recordId, updatedAt: new Date() })
    .where(eq(kuraimiPayments.id, paymentId))
    .returning();
  return updated;
}

// ── Account inquiry: try every plausible endpoint to discover what the API supports ──
export async function probeAccountEndpoints(scustId?: string): Promise<Record<string, any>> {
  const client = getAxios();
  const payload: Record<string, any> = {};
  if (scustId) payload.SCustID = scustId;

  const candidates = [
    { name: "GetBalance",         path: API_PATHS.getBalance,         method: "post" },
    { name: "GetMiniStatement",   path: API_PATHS.getMiniStatement,   method: "post" },
    { name: "GetStatement",       path: API_PATHS.getStatement,       method: "post" },
    { name: "GetLastTransaction", path: API_PATHS.getLastTransaction, method: "post" },
    { name: "Inquiry",            path: API_PATHS.inquiry,            method: "post" },
    { name: "CheckBalance",       path: API_PATHS.checkBalance,       method: "post" },
    { name: "GetBalance-GET",     path: API_PATHS.getBalance,         method: "get"  },
    { name: "GetMiniStat-GET",    path: API_PATHS.getMiniStatement,   method: "get"  },
  ];

  const results: Record<string, any> = {};
  for (const c of candidates) {
    try {
      const res = c.method === "get"
        ? await client.get(c.path, { params: scustId ? { SCustID: scustId } : undefined })
        : await client.post(c.path, payload);
      results[c.name] = { status: res.status, data: res.data };
    } catch (err: any) {
      results[c.name] = {
        status: err.response?.status ?? "network_error",
        data: err.response?.data ?? err.message,
      };
    }
  }
  return results;
}

// ── Get account balance & last transaction ──
export async function getAccountStatement(scustId?: string): Promise<{
  balance: any;
  lastTransaction: any;
  rawResponse: any;
}> {
  const client = getAxios();
  const payload: Record<string, any> = {};
  if (scustId) payload.SCustID = scustId;

  // Try the most likely inquiry endpoints in priority order
  const inquiryPaths = [
    API_PATHS.getMiniStatement,
    API_PATHS.getBalance,
    API_PATHS.getStatement,
    API_PATHS.getLastTransaction,
    API_PATHS.inquiry,
    API_PATHS.checkBalance,
  ];

  let lastErr: any;
  for (const path of inquiryPaths) {
    try {
      const res = await client.post(path, payload);
      const data = res.data;
      // If we get a non-error response, parse it
      if (data) {
        const balance = data.Balance ?? data.BALANCE ?? data.balance
          ?? data.ResultSet?.Balance ?? data.ResultSet?.BALANCE
          ?? data.ResultSet?.AvailableBalance ?? data.ResultSet?.available_balance
          ?? null;
        const txs = data.ResultSet?.Transactions ?? data.ResultSet?.transactions
          ?? data.Transactions ?? data.transactions
          ?? data.ResultSet?.MiniStatement ?? data.ResultSet?.miniStatement
          ?? null;
        const lastTx = Array.isArray(txs) ? txs[0] : (txs ?? data.ResultSet ?? data);
        return { balance, lastTransaction: lastTx, rawResponse: { path, ...data } };
      }
    } catch (err: any) {
      lastErr = err;
    }
  }

  throw new Error(lastErr?.response?.data?.Message ?? lastErr?.message ?? "All inquiry endpoints failed");
}
