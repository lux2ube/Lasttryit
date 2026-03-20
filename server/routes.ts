import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import multer from "multer";
import { storage } from "./storage";
import { db } from "./db";
import { sql, eq, and, desc, ilike } from "drizzle-orm";
import { whatsappService } from "./whatsapp-service";
import { uploadKycDocument, getSignedUrl, deleteKycDocument } from "./supabase-storage";
import {
  insertCustomerSchema, insertBlacklistEntrySchema,
  insertRecordSchema, insertTransactionSchema,
  insertCustomerWalletSchema, insertLabelSchema,
  insertCurrencySchema, insertExchangeRateSchema,
  insertAccountingPeriodSchema, insertChartOfAccountsSchema,
  insertJournalEntrySchema, insertJournalEntryLineSchema,
  insertSourceDocumentSchema, insertProviderSchema, insertWatchedWalletSchema,
  insertTransactionEntrySchema, insertCryptoNetworkSchema,
  insertSmsWebhookConfigSchema, insertSmsParsingRuleSchema,
  watchedWallets, records, customerWallets,
} from "@shared/schema";
import { runKycGate, detectStructuring, getLiquidityStatus, autoExtractFeeEntries } from "./financial-engine";
import { getWalletInfo, sendUSDT, validateAddress, checksumAddress } from "./blockchain-service";
import { cryptoSends, cryptoNetworks, customerGroups, customers } from "@shared/schema";
import crypto from "crypto";

const BCRYPT_ROUNDS = 12;

function hashPasswordLegacy(password: string): string {
  return crypto.createHash("sha256").update(password + (process.env.LEGACY_HASH_SALT || "foms-secret-2025")).digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$2a$") || stored.startsWith("$2b$")) {
    return bcrypt.compare(password, stored);
  }
  return stored === hashPasswordLegacy(password);
}

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
  next();
}

function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: Function) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getStaffUser(req.session.userId);
    if (!user || !roles.includes(user.role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

function actorId(req: Request): string | null {
  return req.session?.userId ?? null;
}

function queryStr(q: any): string {
  if (Array.isArray(q)) return q[0] ?? "";
  return q ?? "";
}

function extractBetween(text: string, afterStr: string, beforeStr: string): string | null {
  const lowerText = text.toLowerCase();
  const afterIdx = lowerText.indexOf(afterStr.toLowerCase());
  if (afterIdx < 0) return null;
  const start = afterIdx + afterStr.length;
  const remaining = text.substring(start);
  if (!beforeStr) return remaining.trim() || null;
  const beforeIdx = remaining.toLowerCase().indexOf(beforeStr.toLowerCase());
  if (beforeIdx < 0) return remaining.trim() || null;
  const result = remaining.substring(0, beforeIdx).trim();
  return result || null;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const PgSession = connectPgSimple(session);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });

  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    app.set("trust proxy", 1);
  }

  app.use(helmet({
    contentSecurityPolicy: isProd ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }));

  app.disable("x-powered-by");

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: "Too many login attempts. Please try again in 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: { message: "Too many requests. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const cryptoSendLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { message: "Too many crypto send requests. Please wait." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api", apiLimiter);

  app.use(session({
    store: new PgSession({ pool, tableName: "sessions", createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? (() => { throw new Error("SESSION_SECRET is required in production"); })() : "foms-dev-secret-only"),
    name: "__foms_sid",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: isProd, httpOnly: true, sameSite: isProd ? "none" as const : "lax" as const, maxAge: 8 * 60 * 60 * 1000 },
  }));

  const appSecretKey = process.env.APP_SECRET_KEY;
  if (appSecretKey) {
    app.use("/api", (req, res, next) => {
      const clientKey = req.headers["x-app-key"] as string;
      if (clientKey === appSecretKey) return next();
      if (req.session?.userId) return next();
      if (req.path === "/auth/login" || req.path === "/auth/me") return next();
      return res.status(401).json({ message: "Unauthorized" });
    });
  }

  // ─── AUTH ─────────────────────────────────────────────────────────────────
  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ message: "Username and password required" });
      if (typeof username !== "string" || typeof password !== "string") return res.status(400).json({ message: "Invalid input" });
      if (username.length > 200 || password.length > 200) return res.status(400).json({ message: "Invalid input" });

      const user = await storage.getStaffUserByUsername(username) || await storage.getStaffUserByEmail(username);
      if (!user || !user.isActive) return res.status(401).json({ message: "Invalid credentials" });

      const passwordValid = await verifyPassword(password, user.passwordHash);
      if (!passwordValid) return res.status(401).json({ message: "Invalid credentials" });

      if (!user.passwordHash.startsWith("$2a$") && !user.passwordHash.startsWith("$2b$")) {
        const upgraded = await hashPassword(password);
        await storage.updateStaffUser(user.id, { passwordHash: upgraded });
      }

      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      req.session.userId = user.id;
      await storage.updateStaffUserLastLogin(user.id);
      const { passwordHash, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (e: any) {
      console.error("[Auth] Login error:", e.message);
      res.status(500).json({ message: "An error occurred" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getStaffUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    const { passwordHash, ...safeUser } = user;
    res.json({ user: safeUser });
  });

  // ─── STAFF ────────────────────────────────────────────────────────────────
  app.get("/api/staff", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      const users = await storage.getAllStaffUsers();
      res.json(users.map(({ passwordHash, ...u }) => u));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/staff", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { password, ...rest } = req.body;
      if (!password) return res.status(400).json({ message: "Password required" });
      if (typeof password !== "string" || password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
      const user = await storage.createStaffUser({ ...rest, passwordHash: await hashPassword(password) });
      const { passwordHash, ...safeUser } = user;
      await storage.createAuditLog({ entityType: 'staff_user', entityId: user.id, action: 'created', actorId: actorId(req), actorName: rest.fullName ?? null, before: null, after: safeUser, ipAddress: req.ip ?? null });
      res.status(201).json(safeUser);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/staff/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { password, ...updates } = req.body;
      if (password) {
        if (typeof password !== "string" || password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
        updates.passwordHash = await hashPassword(password);
      }
      const user = await storage.updateStaffUser(req.params.id, updates);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── DASHBOARD ────────────────────────────────────────────────────────────
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try { res.json(await storage.getDashboardStats()); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── CUSTOMERS ────────────────────────────────────────────────────────────
  app.get("/api/customers", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getAllCustomers({
        search: queryStr(req.query.search) || undefined,
        status: queryStr(req.query.status) || undefined,
        verificationStatus: queryStr(req.query.verificationStatus) || undefined,
        riskLevel: queryStr(req.query.riskLevel) || undefined,
      }));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/customers/:id", requireAuth, async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      res.json(customer);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/customers", requireAuth, async (req, res) => {
    try {
      const data = insertCustomerSchema.parse(req.body);

      // ── Duplicate phone check ──────────────────────────────────────────────
      const phone = (data as any).phonePrimary?.replace(/\s+/g, "") ?? "";
      if (phone) {
        const existingPhone = await storage.findCustomerByPhone(phone);
        if (existingPhone) {
          return res.status(409).json({
            code: "DUPLICATE_PHONE",
            message: `Phone number already registered to another customer.`,
            existing: { id: existingPhone.id, customerId: existingPhone.customerId, fullName: existingPhone.fullName },
          });
        }
      }

      // ── Duplicate full name check ──────────────────────────────────────────
      const fullNameRaw = ((data as any).fullName ?? "").trim();
      if (fullNameRaw) {
        const existingName = await storage.findCustomerByFullName(fullNameRaw);
        if (existingName) {
          return res.status(409).json({
            code: "DUPLICATE_NAME",
            message: `A customer with this full name already exists.`,
            existing: { id: existingName.id, customerId: existingName.customerId, fullName: existingName.fullName, phonePrimary: existingName.phonePrimary },
          });
        }
      }

      // ── Blacklist check ────────────────────────────────────────────────────
      const hits = await storage.checkBlacklist({
        firstName:    (data as any).firstName   ?? undefined,
        secondName:   (data as any).secondName  ?? undefined,
        thirdName:    (data as any).thirdName   ?? undefined,
        lastName:     (data as any).lastName    ?? undefined,
        fullName:     (data as any).fullName,
        phonePrimary: (data as any).phonePrimary ?? undefined,
        phoneSecondary: (data as any).phoneSecondary ?? [],
        email:        (data as any).email       ?? undefined,
        nationalId:   ((data as any).documentation as any)?.nationalId  ?? undefined,
        passportNo:   ((data as any).documentation as any)?.passportNo  ?? undefined,
        nationality:  ((data as any).demographics as any)?.nationality  ?? undefined,
      });

      // Force suspended + blocked when blacklisted — never allow active status for a blacklisted person
      const baseData = { ...data } as any;
      if (hits.length > 0) {
        baseData.customerStatus     = "suspended";
        baseData.verificationStatus = "blocked";
        baseData.isBlacklisted      = true;
        baseData.blacklistFlags     = hits;
        baseData.blacklistCheckedAt = new Date();
      }

      // Resolve group UUID from code (or name) when loyaltyGroup is provided
      if (baseData.loyaltyGroup) {
        const allGrps = await db.select().from(customerGroups).where(eq(customerGroups.isActive, true));
        const val = String(baseData.loyaltyGroup).toLowerCase().trim();
        const grp = allGrps.find(g => g.code.toLowerCase().trim() === val)
                 ?? allGrps.find(g => g.name.toLowerCase().trim() === val);
        if (grp) { baseData.groupId = grp.id; baseData.loyaltyGroup = grp.code; }
      }

      const customer = await storage.createCustomer(baseData, actorId(req) ?? undefined);
      await storage.createAuditLog({ entityType: 'customer', entityId: customer.id, action: 'created', actorId: actorId(req), actorName: null, before: null, after: customer, ipAddress: req.ip ?? null });
      res.status(201).json({ customer, blacklistHits: hits });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/customers/:id", requireAuth, async (req, res) => {
    try {
      const before = await storage.getCustomer(req.params.id);
      if (!before) return res.status(404).json({ message: "Customer not found" });
      const patch = req.body;

      // Duplicate phone check (exclude current customer)
      if (patch.phonePrimary) {
        const normPhone = patch.phonePrimary.replace(/\s+/g, "");
        const existingPhone = await storage.findCustomerByPhone(normPhone, req.params.id);
        if (existingPhone) {
          return res.status(409).json({
            code: "DUPLICATE_PHONE",
            message: `Phone number already registered to another customer.`,
            existing: { id: existingPhone.id, customerId: existingPhone.customerId, fullName: existingPhone.fullName },
          });
        }
      }

      // Duplicate full name check (exclude current customer)
      if (patch.fullName) {
        const existingName = await storage.findCustomerByFullName(patch.fullName.trim(), req.params.id);
        if (existingName) {
          return res.status(409).json({
            code: "DUPLICATE_NAME",
            message: `A customer with this full name already exists.`,
            existing: { id: existingName.id, customerId: existingName.customerId, fullName: existingName.fullName, phonePrimary: existingName.phonePrimary },
          });
        }
      }

      // Blacklisted customer cannot be restored to active — enforce suspended + blocked
      const willBeBlacklisted = patch.isBlacklisted ?? before.isBlacklisted;
      if (willBeBlacklisted) {
        if (patch.customerStatus === "active")     patch.customerStatus     = "suspended";
        if (patch.verificationStatus === "verified") patch.verificationStatus = "blocked";
      }

      // When loyaltyGroup is changed, resolve UUID by code or name and normalise to code
      if (typeof patch.loyaltyGroup === "string") {
        const allGrps = await db.select().from(customerGroups).where(eq(customerGroups.isActive, true));
        const val = patch.loyaltyGroup.toLowerCase().trim();
        const grp = allGrps.find(g => g.code.toLowerCase().trim() === val)
                 ?? allGrps.find(g => g.name.toLowerCase().trim() === val);
        patch.groupId = grp?.id ?? null;
        if (grp) patch.loyaltyGroup = grp.code;
      }

      const updated = await storage.updateCustomer(req.params.id, patch);
      if (!updated) return res.status(404).json({ message: "Customer not found" });
      await storage.createAuditLog({ entityType: 'customer', entityId: updated.id, action: 'updated', actorId: actorId(req), actorName: null, before: before ?? null, after: updated, ipAddress: req.ip ?? null });
      res.json(updated);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/customers/:id", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      await storage.deleteCustomer(req.params.id);
      res.json({ success: true });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── CUSTOMER WALLETS ─────────────────────────────────────────────────────
  app.get("/api/customers/:customerId/wallets", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getCustomerWallets(req.params.customerId));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/customers/:customerId/wallets", requireAuth, async (req, res) => {
    try {
      const data = insertCustomerWalletSchema.parse({ ...req.body, customerId: req.params.customerId });
      const wallet = await storage.createCustomerWallet(data, actorId(req) ?? undefined);
      await storage.createAuditLog({ entityType: 'customer_wallet', entityId: wallet.id, action: 'created', actorId: actorId(req), actorName: null, before: null, after: wallet, ipAddress: req.ip ?? null });
      res.status(201).json(wallet);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/customers/:customerId/wallets/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateCustomerWallet(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Wallet not found" });
      res.json(updated);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/customers/:customerId/wallets/:id/set-default", requireAuth, async (req, res) => {
    try {
      const { providerName } = req.body;
      await storage.setDefaultWallet(req.params.customerId, req.params.id, providerName);
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/customers/:customerId/wallets/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteCustomerWallet(req.params.id);
      res.json({ success: true });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── WALLET REVERSE LOOKUP ────────────────────────────────────────────────
  app.get("/api/customer-wallets/lookup", requireAuth, async (req, res) => {
    try {
      const { address } = req.query as { address?: string };
      if (!address || address.trim().length < 10) {
        return res.status(400).json({ message: "address query param required" });
      }
      const rows = await db
        .select()
        .from(customerWallets)
        .where(ilike(customerWallets.addressOrId, address.trim()))
        .limit(5);
      if (rows.length === 0) return res.json(null);
      const wallet = rows[0];
      const customer = await storage.getCustomer(wallet.customerId);
      res.json({ wallet, customer: customer ?? null });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── KYC DOCUMENT STORAGE (Supabase Bucket) ──────────────────────────────
  const kycUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  app.post("/api/customers/:id/kyc-upload", requireAuth, requireRole("admin", "operations_manager", "finance_officer"),
    kycUpload.single("file"), async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      const file = (req as any).file;
      if (!file) return res.status(400).json({ message: "No file uploaded" });
      const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!ALLOWED_MIME.includes(file.mimetype)) {
        return res.status(400).json({ message: `File type ${file.mimetype} not allowed. Accepted: JPEG, PNG, WebP, PDF` });
      }
      const result = await uploadKycDocument(customer.id, file.originalname, file.buffer, file.mimetype);
      res.json({ storagePath: result.path, fullPath: result.fullPath, originalName: file.originalname, mimeType: file.mimetype, size: file.size });
    } catch (e: any) { console.error("KYC upload error:", e); res.status(500).json({ message: e.message }); }
  });

  app.get("/api/kyc-document/signed-url", requireAuth, requireRole("admin", "operations_manager", "finance_officer"), async (req, res) => {
    try {
      const { path: docPath } = req.query as { path?: string };
      if (!docPath) return res.status(400).json({ message: "path query param required" });
      if (docPath.includes("..") || !docPath.match(/^[a-f0-9-]+\/\d+_/)) {
        return res.status(400).json({ message: "Invalid document path" });
      }
      const customerId = docPath.split("/")[0];
      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found for this document" });
      const url = await getSignedUrl(docPath, 3600);
      res.json({ signedUrl: url });
    } catch (e: any) { console.error("KYC signed URL error:", e); res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/kyc-document", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      const { path } = req.body as { path?: string };
      if (!path) return res.status(400).json({ message: "path required" });
      await deleteKycDocument(path);
      res.json({ success: true });
    } catch (e: any) { console.error("KYC delete error:", e); res.status(500).json({ message: e.message }); }
  });

  // ─── LABELS ───────────────────────────────────────────────────────────────
  app.get("/api/labels", requireAuth, async (req, res) => {
    try { res.json(await storage.getAllLabels()); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/labels", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      const data = insertLabelSchema.parse(req.body);
      const label = await storage.createLabel(data, actorId(req) ?? undefined);
      await storage.createAuditLog({ entityType: 'label', entityId: label.id, action: 'created', actorId: actorId(req), actorName: null, before: null, after: label, ipAddress: req.ip ?? null });
      res.status(201).json(label);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/labels/:id", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      const updated = await storage.updateLabel(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Label not found" });
      res.json(updated);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/labels/:id", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      await storage.deleteLabel(req.params.id);
      res.json({ success: true });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── BLACKLIST SUBJECTS (AND-condition system) ────────────────────────────
  app.get("/api/blacklist", requireAuth, async (req, res) => {
    try { res.json(await storage.getAllBlacklistSubjects()); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/blacklist", requireAuth, async (req, res) => {
    try {
      const { conditions = [], ...subjectData } = req.body;
      const subject = await storage.createBlacklistSubject(
        { ...subjectData, addedBy: actorId(req) },
        conditions
      );
      await storage.createAuditLog({ entityType: 'blacklist', entityId: subject.id, action: 'added', actorId: actorId(req), actorName: null, before: null, after: subject, ipAddress: req.ip ?? null });
      res.status(201).json(subject);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/blacklist/:id", requireAuth, async (req, res) => {
    try {
      const { conditions, ...subjectData } = req.body;
      const subject = await storage.updateBlacklistSubject(req.params.id, subjectData, conditions);
      if (!subject) return res.status(404).json({ message: "Subject not found" });
      res.json(subject);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/blacklist/:id", requireAuth, requireRole("admin", "compliance_officer"), async (req, res) => {
    try {
      await storage.deleteBlacklistSubject(req.params.id);
      res.json({ success: true });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/blacklist/check", requireAuth, async (req, res) => {
    try {
      const hits = await storage.checkBlacklist(req.body);
      res.json({ hits, isBlacklisted: hits.length > 0 });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── PUBLIC CONFIG (authenticated) — safe public-side credentials ──────────
  app.get("/api/public-config", requireAuth, (_req, res) => {
    res.json({
      smsWebhookSecret: process.env.SMS_WEBHOOK_SECRET ?? "",
    });
  });

  // ─── SETTINGS ─────────────────────────────────────────────────────────────
  app.get("/api/settings", requireAuth, async (req, res) => {
    try { res.json(await storage.getAllSettings()); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.put("/api/settings/:key", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { value } = req.body;
      const setting = await storage.upsertSetting(req.params.key, value, actorId(req) ?? undefined);
      await storage.createAuditLog({ entityType: 'system_setting', entityId: req.params.key, action: 'updated', actorId: actorId(req), actorName: null, before: null, after: { key: req.params.key, value }, ipAddress: req.ip ?? null });
      res.json(setting);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── RECORDS ──────────────────────────────────────────────────────────────
  app.get("/api/records", requireAuth, async (req, res) => {
    try {
      const limitRaw = parseInt(queryStr(req.query.limit) ?? "", 10);
      res.json(await storage.getAllRecords({
        type:          queryStr(req.query.type)          || undefined,
        direction:     queryStr(req.query.direction)     || undefined,
        stage:         queryStr(req.query.stage)         || undefined,
        customerId:    queryStr(req.query.customerId)    || undefined,
        transactionId: queryStr(req.query.transactionId) || undefined,
        available:     req.query.available === "true" ? true : undefined,
        source:        queryStr(req.query.source)        || undefined,
        endpointName:  queryStr(req.query.endpointName)  || undefined,
        limit:         isNaN(limitRaw) ? undefined : limitRaw,
      }));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ── Customer smart-defaults — MUST be before /api/records/:id to avoid capture ──
  app.get("/api/records/customer-defaults/:customerId", requireAuth, async (req, res) => {
    try {
      const { customerId } = req.params;
      const customerRecords = await db.select().from(records)
        .where(and(
          eq(records.customerId, customerId),
          sql`processing_stage NOT IN ('draft', 'cancelled')`
        ))
        .orderBy(desc(records.createdAt))
        .limit(40);

      const last = (type: string, direction: string) =>
        customerRecords.find(r => r.type === type && r.direction === direction);

      const ci = last('cash', 'inflow');
      const co = last('cash', 'outflow');
      const xi = last('crypto', 'inflow');
      const xo = last('crypto', 'outflow');

      res.json({
        cashInflow:    ci ? { accountId: ci.accountId, accountName: ci.accountName } : null,
        cashOutflow:   co ? { accountId: co.accountId, accountName: co.accountName, assetOrProviderName: co.assetOrProviderName, networkOrId: co.networkOrId } : null,
        cryptoInflow:  xi ? { accountId: xi.accountId, accountName: xi.accountName } : null,
        cryptoOutflow: xo ? { accountId: xo.accountId, accountName: xo.accountName, assetOrProviderName: xo.assetOrProviderName, networkOrId: xo.networkOrId } : null,
      });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/records/customer-group-overrides/:customerId", requireAuth, async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });

      if (customer.customerStatus === "suspended") {
        return res.json({ suspended: true, group: null, rateOverrides: [], feeOverrides: [], recordLimits: null });
      }

      const allGroups = await db.select().from(customerGroups).where(eq(customerGroups.isActive, true));
      // Prefer UUID lookup (groupId), then case-insensitive code match, then default "standard"
      let group = (customer as any).groupId
        ? allGroups.find(g => g.id === (customer as any).groupId) ?? null
        : null;
      if (!group && customer.loyaltyGroup) {
        const val = customer.loyaltyGroup.toLowerCase().trim();
        group = allGroups.find(g => g.code.toLowerCase().trim() === val)
             ?? allGroups.find(g => g.name.toLowerCase().trim() === val)
             ?? null;
      }
      if (!group) {
        group = allGroups.find(g => g.code.toLowerCase() === "standard") ?? null;
      }

      if (!group) {
        return res.json({ suspended: false, group: null, rateOverrides: [], feeOverrides: [], recordLimits: null });
      }

      const rateOvr = Array.isArray(group.rateOverrides) ? group.rateOverrides : [];
      const feeOvr  = Array.isArray(group.feeOverrides)  ? group.feeOverrides  : [];
      const limits  = group.recordLimits && typeof group.recordLimits === 'object' ? group.recordLimits : null;

      res.json({
        suspended: false,
        group: { id: group.id, code: group.code, name: group.name, color: group.color },
        rateOverrides: rateOvr,
        feeOverrides: feeOvr,
        recordLimits: limits,
      });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/records/:id", requireAuth, async (req, res) => {
    try {
      const record = await storage.getRecord(req.params.id);
      if (!record) return res.status(404).json({ message: "Record not found" });
      res.json(record);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // Returns the projected confirmation journal entry lines + profit for a matched record
  // This is a read-only preview — nothing is posted to the ledger.
  app.get("/api/records/:id/confirmation-preview", requireAuth, async (req, res) => {
    try {
      const preview = await storage.previewConfirmationJournalEntry(req.params.id);
      res.json(preview);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/records", requireAuth, async (req, res) => {
    try {
      const data = insertRecordSchema.parse(req.body);

      if (data.customerId) {
        const cust = await storage.getCustomer(data.customerId);
        if (cust?.customerStatus === "suspended") {
          return res.status(403).json({ message: "Cannot create records for a suspended customer." });
        }
      }

      const actor = actorId(req);
      const record = await storage.createRecord(data as any, actor ?? undefined);
      await storage.createAuditLog({ entityType: 'record', entityId: record.id, action: 'created', actorId: actor, actorName: null, before: null, after: record, ipAddress: req.ip ?? null });

      // If created directly as "recorded" (bypassing draft), fire the record-level JE immediately
      if (record.processingStage === 'recorded') {
        storage.generateRecordJournalEntry(record.id, actor ?? 'system').catch(() => { /* period may not be open */ });
      }

      res.status(201).json(record);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/records/:id", requireAuth, async (req, res) => {
    try {
      const before = await storage.getRecord(req.params.id);
      if (!before) return res.status(404).json({ message: "Record not found" });

      const patch = { ...req.body };
      const actor = actorId(req);

      // ── Suspended customer guard ──────────────────────────────────────────
      const effectiveCustomerId = patch.customerId ?? before.customerId;
      if (effectiveCustomerId) {
        const cust = await storage.getCustomer(effectiveCustomerId);
        if (cust?.customerStatus === "suspended") {
          return res.status(403).json({ message: "Cannot process records for a suspended customer." });
        }
      }

      // ── 0. Terminal state guard ───────────────────────────────────────────
      if (before.processingStage === 'used') {
        return res.status(400).json({ message: "This record is locked — it is already used in a transaction and cannot be modified." });
      }
      if (before.processingStage === 'cancelled') {
        return res.status(400).json({ message: "This record has been cancelled and cannot be modified." });
      }

      // ── 1. Financial field locking (Delayed Journaling) ───────────────────
      // HARD locked after draft: structural fields that affect the suspense JE amount.
      // SOFT locked: execution rates editable in matched stages (before confirmation).
      // contraAccountId / contraAccountName are intentionally excluded from HARD_LOCKED.
      // The record is a flexible source document (not the ledger). The contra account label
      // is updated dynamically as the record moves through the pipeline (unmatched → customer name).
      const HARD_LOCKED  = ['amount','currency','accountId','accountName','type','direction'];
      const RATE_FIELDS  = ['buyRate','sellRate','exchangeRate','bankRate','usdEquivalent','serviceFeeRate','serviceFeeUsd','spreadRate','spreadUsd','networkFeeUsd','expenseUsd'];
      const IN_MATCHED   = ['matched','manual_matched','auto_matched'].includes(String(before.processingStage));
      const IN_CONFIRMED = ['confirmed','used','cancelled'].includes(String(before.processingStage));

      if (before.processingStage !== 'draft') {
        // Only block if the value ACTUALLY CHANGED from what is stored.
        // The frontend sends full form data on save, so unchanged hard-locked fields
        // will be in the payload — that is fine as long as the value is identical.
        const hardAttempted = HARD_LOCKED.filter(f => {
          if (!(f in patch) || patch[f] === undefined || patch[f] === null) return false;
          const stored = (before as any)[f];
          if (stored === null || stored === undefined) return true;
          // Compare as trimmed strings to handle number/string coercion for decimal fields
          return String(patch[f]).trim() !== String(stored).trim();
        });
        if (hardAttempted.length > 0) {
          return res.status(400).json({
            message: `Structural fields are locked after journalization. Locked: ${hardAttempted.join(', ')}.`,
          });
        }
        // Rate fields: editable while matched (to adjust before confirmation), locked after confirmed.
        // Compare values (not just presence) so unchanged fields sent by the form don't cause false rejections.
        if (IN_CONFIRMED) {
          const rateAttempted = RATE_FIELDS.filter(f => {
            if (!(f in patch) || patch[f] === undefined || patch[f] === null) return false;
            const stored = (before as any)[f];
            if (stored === null || stored === undefined) return true;
            return String(patch[f]).trim() !== String(stored).trim();
          });
          if (rateAttempted.length > 0) {
            return res.status(400).json({
              message: `Rate fields are locked after confirmation. Locked: ${rateAttempted.join(', ')}.`,
            });
          }
        }
      }
      void IN_MATCHED; // suppress unused warning

      // ── 2. Customer linking business logic ────────────────────────────────
      const incomingCustomerId = patch.customerId ?? before.customerId;
      const customerChanged = patch.customerId && patch.customerId !== before.customerId;
      if (customerChanged && incomingCustomerId) {
        const customer = await storage.getCustomer(incomingCustomerId);
        if (!customer) return res.status(400).json({ message: "Customer not found" });

        // Blacklist check
        if (customer.isBlacklisted) {
          await storage.createComplianceAlert({
            alertType: 'blacklist_hit', severity: 'critical',
            title: `Blacklisted customer linked to record ${before.recordNumber}`,
            description: `Record ${before.recordNumber} was linked to BLACKLISTED customer ${customer.fullName} (${customer.customerId}). Immediate review required.`,
            customerId: incomingCustomerId, customerName: customer.fullName, recordId: before.id,
          });
        }

        // Whitelist check — networkOrId holds the counterparty address/account for all record types
        const counterParty = (patch.networkOrId ?? before.networkOrId);
        if (counterParty && counterParty.trim().length > 2) {
          const wallets = await storage.getCustomerWallets(incomingCustomerId);
          const knownWallet = wallets.find(w => w.addressOrId.toLowerCase() === counterParty.toLowerCase());
          patch.isWhitelisted = !!knownWallet;
          if (knownWallet) patch.clientMatchMethod = 'known_wallet';
        }
        if (!patch.clientMatchMethod && !before.clientMatchMethod) patch.clientMatchMethod = 'manual';

        // Linking a customer to a record ONLY stores the customer — it does NOT change the stage.
        // Stage progression is always a deliberate user action:
        //   Draft → Recorded  : "Record Now" / "Record & Match" button
        //   Recorded → Matched: "Set as Matched" button (appears once a customer is linked)
        // (Exception: draft→recorded with customer already linked auto-advances to matched
        //  inside the stage-transition block below, because the JE goes directly to the customer.)

        // Update the contra account label on the record to reflect the matched customer.
        // The record is a flexible document (not the ledger) — the label should always
        // show the current counterparty, not stay frozen at "Unmatched".
        patch.contraAccountName = `Customer Balance — ${customer.fullName} (${customer.customerId})`;

        patch.logEvents = [
          ...(before.logEvents as any[] ?? []),
          { action: 'customer_linked', by: actor, timestamp: new Date().toISOString(),
            customerName: customer.fullName, customerId: customer.customerId,
            isWhitelisted: patch.isWhitelisted ?? false, isBlacklisted: customer.isBlacklisted },
        ];
      }

      // ── 3. Stage transition business logic ───────────────────────────────
      const newStage    = patch.processingStage as string | undefined;
      const beforeStage = before.processingStage as string;
      const MATCHED_STAGES = ['matched', 'manual_matched', 'auto_matched'];

      if (newStage && newStage !== beforeStage) {

        // ── recorded: post suspense JE (DR Asset / CR 2101); stay as "recorded" always ──
        // "Matched" is NOT a stage — it is a derived property: customerId IS NOT NULL.
        // Linking a customer never changes the stage; it only populates customer_id.
        if (newStage === 'recorded' && beforeStage === 'draft') {
          try {
            await storage.generateRecordJournalEntry(before.id, actor ?? 'system');
          } catch (jeErr: any) {
            return res.status(400).json({ message: `Cannot journalize record: ${jeErr.message}` });
          }
          patch.logEvents = [
            ...(patch.logEvents ?? before.logEvents as any[] ?? []),
            { action: 'recorded', by: actor, timestamp: new Date().toISOString() },
          ];
        }

        // ── matched: customer must be linked; create reclassification JE if coming from recorded ──
        if ((newStage === 'matched') && !incomingCustomerId) {
          return res.status(400).json({ message: "Cannot match a record without a customer. Edit the record to link a customer first." });
        }
        // Explicit recorded → matched transition (via "Set as Matched" button, customer already on record)
        if (newStage === 'matched' && beforeStage === 'recorded' && incomingCustomerId && !customerChanged) {
          try {
            await storage.generateMatchingJournalEntry(before.id, incomingCustomerId, actor ?? 'system');
          } catch (jeErr: any) {
            return res.status(400).json({ message: `Cannot create matching journal entry: ${jeErr.message}` });
          }
        }

        // ── Auto-register counterparty address into customer whitelist at match time ──
        if (newStage === 'matched' && incomingCustomerId) {
          const recType = (patch.type ?? before.type) as string;
          const direction = (patch.direction ?? before.direction) as string;
          const counterAddr = (patch.networkOrId ?? before.networkOrId ?? '').trim();
          const recAccountId = (patch.accountId ?? before.accountId) as string | null;
          let resolvedProviderId: string | null = null;
          let resolvedProviderName = String(patch.assetOrProviderName ?? before.assetOrProviderName ?? 'Unknown');
          let resolvedNetwork: string | null = null;
          if (recAccountId) {
            const recAcct = await storage.getAccount(recAccountId);
            if (recAcct?.providerId) {
              resolvedProviderId = recAcct.providerId;
              const recProv = await storage.getProvider(recAcct.providerId);
              if (recProv) {
                resolvedProviderName = recProv.name;
                resolvedNetwork = recProv.networkCode ?? null;
              }
            }
          }

          if (recType === 'crypto' && counterAddr.length > 5) {
            const wallets = await storage.getCustomerWallets(incomingCustomerId);
            const alreadyKnown = wallets.find(w => w.addressOrId.toLowerCase() === counterAddr.toLowerCase());
            if (!alreadyKnown) {
              await storage.createCustomerWallet({
                customerId: incomingCustomerId, direction: direction as any, type: 'crypto' as any,
                providerId: resolvedProviderId,
                providerName: resolvedProviderName,
                network: resolvedNetwork ?? String(patch.endpointName ?? before.endpointName ?? resolvedProviderName),
                addressOrId: counterAddr,
                label: `Auto-registered from ${before.recordNumber}`,
                isDefault: false, isActive: true,
              }, actor ?? undefined);
              patch.isWhitelisted = true;
              const existingMatchLog = patch.logEvents ?? (before.logEvents as any[] ?? []);
              patch.logEvents = [...existingMatchLog,
                { action: 'address_whitelisted', by: actor, timestamp: new Date().toISOString(),
                  address: counterAddr, providerId: resolvedProviderId, providerName: resolvedProviderName,
                  note: `New ${direction} address auto-registered to customer whitelist` },
              ];
            } else {
              if (!alreadyKnown.providerId && resolvedProviderId) {
                await storage.updateCustomerWallet(alreadyKnown.id, { providerId: resolvedProviderId, providerName: resolvedProviderName, network: resolvedNetwork });
              }
              patch.isWhitelisted = true;
            }
          }

          if (recType === 'cash' && direction === 'outflow' && counterAddr.length > 2) {
            const wallets = await storage.getCustomerWallets(incomingCustomerId);
            const alreadyKnown = wallets.find(w => w.addressOrId.toLowerCase() === counterAddr.toLowerCase());
            if (!alreadyKnown) {
              await storage.createCustomerWallet({
                customerId: incomingCustomerId, direction: 'outflow', type: 'cash' as any,
                providerId: resolvedProviderId,
                providerName: resolvedProviderName,
                network: null,
                addressOrId: counterAddr,
                label: `Auto-registered from ${before.recordNumber}`,
                isDefault: false, isActive: true,
              }, actor ?? undefined);
              patch.isWhitelisted = true;
              const existingMatchLog = patch.logEvents ?? (before.logEvents as any[] ?? []);
              patch.logEvents = [...existingMatchLog,
                { action: 'cash_account_whitelisted', by: actor, timestamp: new Date().toISOString(),
                  account: counterAddr, providerId: resolvedProviderId, providerName: resolvedProviderName,
                  note: `Cash outflow account auto-registered to customer whitelist` },
              ];
            } else {
              if (!alreadyKnown.providerId && resolvedProviderId) {
                await storage.updateCustomerWallet(alreadyKnown.id, { providerId: resolvedProviderId, providerName: resolvedProviderName });
              }
              patch.isWhitelisted = true;
            }
          }
        }

        if (newStage === 'matched' && !patch.logEvents) {
          patch.logEvents = [
            ...(before.logEvents as any[] ?? []),
            { action: 'matched', by: actor, timestamp: new Date().toISOString() },
          ];
        }

        // ── confirmed: allowed from recorded or legacy matched stages; requires a linked customer ──
        // "Matched" is no longer a stage — a record is matched when customerId IS NOT NULL.
        if (newStage === 'confirmed') {
          const confirmableStages = ['recorded', ...MATCHED_STAGES];
          if (!confirmableStages.includes(beforeStage)) {
            return res.status(400).json({ message: "Can only confirm a Recorded record. Current stage: " + beforeStage });
          }
          if (!incomingCustomerId) {
            return res.status(400).json({ message: "Cannot confirm — no customer linked. Link a customer to this record first." });
          }
          // Post the final P&L-realizing journal entry atomically
          try {
            const { entry: confirmJe, feeBreakdown } = await storage.generateConfirmationJournalEntry(before.id, actor ?? 'system');
            // Store the confirmation JE entry number on the record for quick reference
            (patch as any).transactionId = confirmJe.entryNumber;
            if (feeBreakdown) {
              const recType = (patch.type ?? before.type) as string;
              patch.usdEquivalent = String(feeBreakdown.principalUsd.toFixed(4));
              (patch as any).clientLiabilityUsd = String(feeBreakdown.clientLiabilityUsd.toFixed(4));
              if (recType === 'crypto') {
                // Crypto: service fee rate + USD + network gas fee
                patch.serviceFeeRate            = String(feeBreakdown.effectiveFeeRate.toFixed(4));
                (patch as any).serviceFeeUsd    = String(feeBreakdown.serviceFeeUsd.toFixed(4));
                (patch as any).networkFeeUsd    = String(feeBreakdown.networkFeeUsd.toFixed(6));
                (patch as any).spreadRate       = null;
                (patch as any).spreadUsd        = null;
              } else {
                // Cash: FX spread income — service fee columns are not applicable
                (patch as any).spreadRate       = String((feeBreakdown.spreadRate ?? 0).toFixed(4));
                (patch as any).spreadUsd        = String((feeBreakdown.spreadUsd ?? 0).toFixed(4));
                patch.serviceFeeRate            = null;
                (patch as any).serviceFeeUsd    = null;
                (patch as any).networkFeeUsd    = null;
              }
            }
          } catch (jeErr: any) {
            return res.status(400).json({ message: `Cannot confirm — journal entry failed: ${jeErr.message}` });
          }
          const recType = (patch.type ?? before.type) as string;
          const direction = (patch.direction ?? before.direction) as string;
          const counterAddr = (patch.networkOrId ?? before.networkOrId ?? '').trim();
          const confirmAccountId = (patch.accountId ?? before.accountId) as string | null;
          let cfProviderId: string | null = null;
          let cfProviderName = String(patch.assetOrProviderName ?? before.assetOrProviderName ?? 'Unknown');
          let cfNetwork: string | null = null;
          if (confirmAccountId) {
            const cfAcct = await storage.getAccount(confirmAccountId);
            if (cfAcct?.providerId) {
              cfProviderId = cfAcct.providerId;
              const cfProv = await storage.getProvider(cfAcct.providerId);
              if (cfProv) {
                cfProviderName = cfProv.name;
                cfNetwork = cfProv.networkCode ?? null;
              }
            }
          }

          if (recType === 'crypto' && counterAddr.length > 5) {
            const wallets = await storage.getCustomerWallets(incomingCustomerId);
            const alreadyKnown = wallets.find(w => w.addressOrId.toLowerCase() === counterAddr.toLowerCase());
            if (!alreadyKnown) {
              await storage.createCustomerWallet({
                customerId: incomingCustomerId, direction: direction as any, type: 'crypto' as any,
                providerId: cfProviderId,
                providerName: cfProviderName,
                network: cfNetwork ?? String(patch.endpointName ?? before.endpointName ?? cfProviderName),
                addressOrId: counterAddr,
                label: `Auto-registered from ${before.recordNumber}`,
                isDefault: false, isActive: true,
              }, actor ?? undefined);
              patch.isWhitelisted = true;
            } else {
              if (!alreadyKnown.providerId && cfProviderId) {
                await storage.updateCustomerWallet(alreadyKnown.id, { providerId: cfProviderId, providerName: cfProviderName, network: cfNetwork });
              }
              patch.isWhitelisted = true;
            }
          }
          if (recType === 'cash' && direction === 'outflow' && counterAddr.length > 2) {
            const wallets = await storage.getCustomerWallets(incomingCustomerId);
            const alreadyKnown = wallets.find(w => w.addressOrId.toLowerCase() === counterAddr.toLowerCase());
            if (!alreadyKnown) {
              await storage.createCustomerWallet({
                customerId: incomingCustomerId, direction: 'outflow', type: 'cash' as any,
                providerId: cfProviderId,
                providerName: cfProviderName,
                network: null,
                addressOrId: counterAddr,
                label: `Auto-registered from ${before.recordNumber}`,
                isDefault: false, isActive: true,
              }, actor ?? undefined);
              patch.isWhitelisted = true;
            } else {
              if (!alreadyKnown.providerId && cfProviderId) {
                await storage.updateCustomerWallet(alreadyKnown.id, { providerId: cfProviderId, providerName: cfProviderName });
              }
              patch.isWhitelisted = true;
            }
          }
          // Keep the contra account label in sync with the matched customer at confirmation.
          // If the linking step already set it, this refreshes it to stay accurate.
          if (incomingCustomerId) {
            const confirmCustomer = await storage.getCustomer(incomingCustomerId);
            if (confirmCustomer) {
              patch.contraAccountName = `Customer Balance — ${confirmCustomer.fullName} (${confirmCustomer.customerId})`;
            }
          }
          const existingLog = patch.logEvents ?? (before.logEvents as any[] ?? []);
          patch.logEvents = [...existingLog, { action: 'confirmed', by: actor, timestamp: new Date().toISOString() }];
        }

        // ── cancelled: post reversal JE; allowed from recorded / matched / confirmed ──
        if (newStage === 'cancelled') {
          const cancellableStages = ['recorded', 'matched', 'manual_matched', 'auto_matched', 'confirmed'];
          if (!cancellableStages.includes(beforeStage)) {
            return res.status(400).json({ message: `Cannot cancel a record in '${beforeStage}' state. Only recorded, matched, or confirmed records can be cancelled.` });
          }
          try {
            await storage.reverseRecordJournalEntry(before.id, actor ?? 'system');
          } catch (jeErr: any) {
            return res.status(400).json({ message: `Cannot cancel record: ${jeErr.message}` });
          }
          const existingLog = patch.logEvents ?? (before.logEvents as any[] ?? []);
          patch.logEvents = [...existingLog, { action: 'cancelled', by: actor, timestamp: new Date().toISOString() }];
        }
      }

      const updated = await storage.updateRecord(req.params.id, patch);
      if (!updated) return res.status(404).json({ message: "Record not found" });
      await storage.createAuditLog({ entityType: 'record', entityId: updated.id, action: 'updated', actorId: actor, actorName: null, before: before ?? null, after: updated, ipAddress: req.ip ?? null });

      if (newStage === 'confirmed' && updated.customerId) {
        try {
          const customer = await storage.getCustomer(updated.customerId);
          if (customer) {
            await whatsappService.enqueueRecordNotification(updated, customer);
          }
        } catch (waErr: any) {
          console.error(`[WhatsApp] Failed to enqueue notification for ${updated.recordNumber}:`, waErr.message);
        }
      }

      res.json(updated);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── TRANSACTIONS ─────────────────────────────────────────────────────────
  app.get("/api/transactions", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getAllTransactions({
        type: queryStr(req.query.type) || undefined,
        customerId: queryStr(req.query.customerId) || undefined,
      }));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/transactions/:id", requireAuth, async (req, res) => {
    try {
      const tx = await storage.getTransaction(req.params.id);
      if (!tx) return res.status(404).json({ message: "Transaction not found" });
      res.json(tx);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/transactions", requireAuth, async (req, res) => {
    try {
      const data = insertTransactionSchema.parse(req.body);
      const amountUsd = parseFloat(String(data.totalInUsd ?? 0)) + parseFloat(String(data.totalOutUsd ?? 0));

      // S-03 KYC Gate + S-10 Structuring Detector (run async, non-blocking — alerts created even if tx proceeds)
      if (data.customerId) {
        await Promise.allSettled([
          runKycGate(data.customerId, amountUsd, actorId(req) ?? undefined),
          detectStructuring(data.customerId, amountUsd),
        ]);
      }

      const tx = await storage.createTransaction(data as any, actorId(req) ?? undefined);
      await storage.createAuditLog({ entityType: 'transaction', entityId: tx.id, action: 'created', actorId: actorId(req), actorName: null, before: null, after: tx, ipAddress: req.ip ?? null });
      res.status(201).json(tx);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/transactions/:id", requireAuth, async (req, res) => {
    try {
      const before = await storage.getTransaction(req.params.id);
      const updated = await storage.updateTransaction(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Transaction not found" });
      await storage.createAuditLog({ entityType: 'transaction', entityId: updated.id, action: 'updated', actorId: actorId(req), actorName: null, before: before ?? null, after: updated, ipAddress: req.ip ?? null });
      res.json(updated);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── REPORTS ──────────────────────────────────────────────────────────────
  app.get("/api/reports", requireAuth, async (req, res) => {
    try {
      const days = parseInt(queryStr(req.query.days) || "30", 10);
      res.json(await storage.getReportsData({ days }));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ── Trial Balance ──────────────────────────────────────────────────────────
  app.get("/api/reports/trial-balance", requireAuth, async (_req, res) => {
    try {
      const [accts, balances, period] = await Promise.all([
        storage.getAllAccounts(),
        storage.getAccountBalances(),
        storage.getOpenPeriod(),
      ]);
      const DEBIT_NORMAL = new Set(["asset", "expense"]);
      const rows = accts
        .filter(a => a.subtype !== "group")
        .map(a => {
          const b = balances[a.id] ?? { totalDebit: 0, totalCredit: 0 };
          const dr = b.totalDebit, cr = b.totalCredit;
          const balance = DEBIT_NORMAL.has(a.type) ? dr - cr : cr - dr;
          return { ...a, totalDebit: dr, totalCredit: cr, balance };
        })
        .filter(a => a.totalDebit > 0 || a.totalCredit > 0 || true); // include zero-balance accts
      const totalDR = rows.reduce((s, r) => s + r.totalDebit, 0);
      const totalCR = rows.reduce((s, r) => s + r.totalCredit, 0);
      res.json({ period, accounts: rows, totalDebit: totalDR, totalCredit: totalCR, balanced: Math.abs(totalDR - totalCR) < 0.01, generatedAt: new Date().toISOString() });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ── Balance Sheet ──────────────────────────────────────────────────────────
  app.get("/api/reports/balance-sheet", requireAuth, async (_req, res) => {
    try {
      const [accts, balances, period] = await Promise.all([
        storage.getAllAccounts(),
        storage.getAccountBalances(),
        storage.getOpenPeriod(),
      ]);
      const DEBIT_NORMAL = new Set(["asset", "expense"]);
      const mapType = (type: string) => accts
        .filter(a => a.type === type && a.subtype !== "group")
        .map(a => {
          const b = balances[a.id] ?? { totalDebit: 0, totalCredit: 0 };
          const dr = b.totalDebit, cr = b.totalCredit;
          const balance = DEBIT_NORMAL.has(a.type) ? dr - cr : cr - dr;
          return { code: a.code, name: a.name, subtype: a.subtype, balance };
        });
      const assets      = mapType("asset");
      const liabilities = mapType("liability");
      const equity      = mapType("equity");
      // Pull net income from revenue - expense
      const revenues  = mapType("revenue");
      const expenses  = mapType("expense");
      const netIncome = revenues.reduce((s,r) => s+r.balance,0) - expenses.reduce((s,r) => s+r.balance,0);
      const equityWithNI = [...equity, { code: "3300", name: "Current Period Net Income", subtype: "current_pnl", balance: netIncome }];
      const totalAssets   = assets.reduce((s,r) => s+r.balance, 0);
      const totalLiab     = liabilities.reduce((s,r) => s+r.balance, 0);
      const totalEquity   = equityWithNI.reduce((s,r) => s+r.balance, 0);
      res.json({ period, assets, liabilities, equity: equityWithNI, totalAssets, totalLiabilities: totalLiab, totalEquity, totalLiabilitiesEquity: totalLiab + totalEquity, balanced: Math.abs(totalAssets - (totalLiab + totalEquity)) < 0.02, generatedAt: new Date().toISOString() });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ── Income Statement ────────────────────────────────────────────────────────
  app.get("/api/reports/income-statement", requireAuth, async (_req, res) => {
    try {
      const [accts, balances, period] = await Promise.all([
        storage.getAllAccounts(),
        storage.getAccountBalances(),
        storage.getOpenPeriod(),
      ]);
      const mapType = (type: string) => accts
        .filter(a => a.type === type && a.subtype !== "group")
        .map(a => {
          const b = balances[a.id] ?? { totalDebit: 0, totalCredit: 0 };
          const cr = b.totalCredit, dr = b.totalDebit;
          const balance = type === "revenue" ? cr - dr : dr - cr;
          return { code: a.code, name: a.name, subtype: a.subtype, balance };
        });
      const revenues = mapType("revenue");
      const expenses = mapType("expense");
      const totalRevenue  = revenues.reduce((s,r) => s+r.balance, 0);
      const totalExpenses = expenses.reduce((s,r) => s+r.balance, 0);
      res.json({ period, revenues, expenses, totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses, grossProfit: totalRevenue, generatedAt: new Date().toISOString() });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ── Customer Ledger ──────────────────────────────────────────────────────────
  app.get("/api/reports/customer-ledger", requireAuth, async (req, res) => {
    try {
      const customerId = queryStr(req.query.customerId) || null;
      const rows = await db.execute(sql`
        SELECT
          jel.party_id           AS customer_id,
          jel.party_name         AS customer_name,
          coa.code               AS account_code,
          coa.name               AS account_name,
          coa.type               AS account_type,
          COALESCE(SUM(jel.debit_base),  0) AS total_debit,
          COALESCE(SUM(jel.credit_base), 0) AS total_credit
        FROM   journal_entry_lines jel
        JOIN   journal_entries je ON je.id = jel.journal_entry_id
        JOIN   chart_of_accounts coa ON coa.code = jel.account_code
        WHERE  je.status = 'posted'
          AND  jel.party_id IS NOT NULL
          ${customerId ? sql`AND jel.party_id = ${customerId}` : sql``}
        GROUP  BY jel.party_id, jel.party_name, coa.code, coa.name, coa.type
        ORDER  BY jel.party_name, coa.code
      `);
      // Group by customer
      const map: { [id: string]: any } = {};
      for (const r of (rows.rows ?? [])) {
        const cid = r.customer_id as string;
        if (!map[cid]) map[cid] = { customerId: cid, customerName: r.customer_name, accounts: [], totalDebit: 0, totalCredit: 0, balance: 0 };
        const dr = parseFloat(String(r.total_debit ?? 0));
        const cr = parseFloat(String(r.total_credit ?? 0));
        // Customer balance: what we owe them = net credit on liability accounts
        const isCreditNormal = (r.account_type as string) !== "asset" && (r.account_type as string) !== "expense";
        const acctBal = isCreditNormal ? cr - dr : dr - cr;
        map[cid].accounts.push({ accountCode: r.account_code, accountName: r.account_name, accountType: r.account_type, totalDebit: dr, totalCredit: cr, balance: acctBal });
        map[cid].totalDebit += dr;
        map[cid].totalCredit += cr;
      }
      // Compute net balance per customer from 2101 account (customer credit balances)
      for (const c of Object.values(map)) {
        const credit2101 = c.accounts.find((a: any) => a.accountCode === "2101");
        c.balance = credit2101 ? credit2101.balance : 0;
      }
      // Enrich with customer details
      const custIds = Object.keys(map);
      if (custIds.length > 0) {
        const inList = sql.join(custIds.map(id => sql`${id}`), sql`, `);
        const custRows = await db.execute(sql`SELECT id, full_name, customer_status, risk_level, phone_primary FROM customers WHERE id IN (${inList})`);
        for (const c of (custRows.rows ?? [])) {
          const cid = c.id as string;
          if (map[cid]) {
            map[cid].customerStatus = c.customer_status;
            map[cid].riskLevel = c.risk_level;
            map[cid].phone = c.phone_primary;
          }
        }
      }
      res.json({ customers: Object.values(map), generatedAt: new Date().toISOString() });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ── Customer Statement (individual full ledger) ─────────────────────────────
  app.get("/api/reports/customer-statement/:customerId", requireAuth, async (req, res) => {
    try {
      const cid = req.params.customerId;
      const [custRows, lineRows] = await Promise.all([
        db.execute(sql`SELECT id, full_name, phone_primary, customer_status, risk_level, created_at FROM customers WHERE id = ${cid}`),
        db.execute(sql`
          SELECT
            je.entry_date,
            je.entry_number,
            je.description        AS je_description,
            jel.account_code,
            jel.account_name,
            jel.description       AS line_description,
            jel.debit_base        AS debit,
            jel.credit_base       AS credit,
            je.source_type,
            je.source_id
          FROM   journal_entry_lines jel
          JOIN   journal_entries je ON je.id = jel.journal_entry_id
          WHERE  je.status = 'posted'
            AND  jel.party_id = ${cid}
          ORDER  BY je.entry_date, je.entry_number, jel.line_number
        `),
      ]);
      const customer = (custRows.rows ?? [])[0];
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      const lines = (lineRows.rows ?? []).map(r => ({
        date: r.entry_date,
        entryNumber: r.entry_number,
        description: r.line_description || r.je_description,
        accountCode: r.account_code,
        accountName: r.account_name,
        debit: parseFloat(String(r.debit ?? 0)),
        credit: parseFloat(String(r.credit ?? 0)),
        sourceType: r.source_type,
        sourceId: r.source_id,
      }));
      // Running balance on 2101 (Customer Credit Balances)
      let runningBalance = 0;
      const linesWithBalance = lines.map(l => {
        if (l.accountCode === "2101") {
          runningBalance += l.credit - l.debit;
          return { ...l, runningBalance };
        }
        return { ...l, runningBalance: null };
      });
      res.json({ customer, lines: linesWithBalance, generatedAt: new Date().toISOString() });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── TRANSACTION APPROVE ──────────────────────────────────────────────────
  app.post("/api/transactions/:id/approve", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      const user = await storage.getStaffUser(req.session!.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const before = await storage.getTransaction(req.params.id);
      if (!before) return res.status(404).json({ message: "Transaction not found" });
      const updated = await storage.updateTransaction(req.params.id, {
        approvedBy: user.id,
        approvedAt: new Date() as any,
        logs: [
          ...(before.logs as any[] ?? []),
          { action: 'approved', timestamp: new Date().toISOString(), by: user.id, name: user.fullName },
        ],
      } as any);
      await storage.createAuditLog({ entityType: 'transaction', entityId: req.params.id, action: 'approved', actorId: actorId(req), actorName: user.fullName, before, after: updated ?? null, ipAddress: req.ip ?? null });

      // S-12 Fee Extractor — auto-create fee/spread/expense Transaction Entries on approval
      await autoExtractFeeEntries(req.params.id, user.id).catch(err =>
        console.error("[Fee Extractor] Error:", err.message)
      );

      res.json(updated);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── AUDIT LOGS ───────────────────────────────────────────────────────────
  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getAuditLogs({
        entityType: queryStr(req.query.entityType) || undefined,
        entityId: queryStr(req.query.entityId) || undefined,
        limit: 200,
      }));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── SMS WEBHOOK CONFIG CRUD ────────────────────────────────────────────────
  app.get("/api/sms-webhook-configs", requireAuth, async (_req, res) => {
    try { res.json(await storage.getAllSmsWebhookConfigs()); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.get("/api/sms-webhook-configs/:id", requireAuth, async (req, res) => {
    try {
      const config = await storage.getSmsWebhookConfig(req.params.id);
      if (!config) return res.status(404).json({ message: "Config not found" });
      res.json(config);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.post("/api/sms-webhook-configs", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      const data = insertSmsWebhookConfigSchema.parse(req.body);
      const existing = await storage.getSmsWebhookConfigBySlug(data.slug);
      if (existing) return res.status(400).json({ message: "Slug already exists" });
      const config = await storage.createSmsWebhookConfig(data);
      await storage.createAuditLog({
        entityType: 'system_setting', entityId: config.id, action: 'created',
        after: config, performedBy: req.session.userId,
      });
      res.status(201).json(config);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.patch("/api/sms-webhook-configs/:id", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      const config = await storage.updateSmsWebhookConfig(req.params.id, req.body);
      if (!config) return res.status(404).json({ message: "Config not found" });
      res.json(config);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.delete("/api/sms-webhook-configs/:id", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      await storage.deleteSmsWebhookConfig(req.params.id);
      res.json({ success: true });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── SMS PARSING RULES CRUD ───────────────────────────────────────────────
  app.get("/api/sms-webhook-configs/:configId/rules", requireAuth, async (req, res) => {
    try { res.json(await storage.getSmsParsingRules(req.params.configId)); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.post("/api/sms-webhook-configs/:configId/rules", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      const data = insertSmsParsingRuleSchema.parse({ ...req.body, configId: req.params.configId });
      const rule = await storage.createSmsParsingRule(data);
      res.status(201).json(rule);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.patch("/api/sms-webhook-configs/:configId/rules/:ruleId", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      const rule = await storage.updateSmsParsingRule(req.params.ruleId, req.body);
      if (!rule) return res.status(404).json({ message: "Rule not found" });
      res.json(rule);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.delete("/api/sms-webhook-configs/:configId/rules/:ruleId", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      await storage.deleteSmsParsingRule(req.params.ruleId);
      res.json({ success: true });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── SMS WEBHOOK LOGS ─────────────────────────────────────────────────────
  app.get("/api/sms-webhook-logs", requireAuth, async (req, res) => {
    try {
      const filters: any = {};
      if (req.query.configId) filters.configId = req.query.configId;
      if (req.query.status) filters.status = req.query.status;
      filters.limit = parseInt(String(req.query.limit || '100'));
      res.json(await storage.getSmsWebhookLogs(filters));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── SMS WEBHOOK RECEIVER (STORE-FIRST) ───────────────────────────────────
  // POST or GET /api/webhooks/sms/:slug  — no auth required, external SMS gateway hits this
  // Just stores the raw SMS in the inbox immediately; parsing happens on-demand via /process.
  //
  // Forward SMS app (no body template / no custom header required):
  //   URL:  https://<host>/api/webhooks/sms/<slug>?message={msg}&time={local-time}
  //   Method: POST  (or GET)  — works with default app settings, no custom body needed
  //
  // Also accepts:
  //   • JSON body:   { "message": "...", "sender": "..." }
  //   • Form-urlencoded body with any of: message, text, sms, body, msg, content
  //   • Plain-text body
  const _smsWebhookHandler = async (req: any, res: any) => {
    const { slug } = req.params;

    const rawBody = req.body;
    const q = req.query ?? {};
    let smsText = "";
    if (typeof rawBody === "string" && rawBody.trim()) {
      smsText = rawBody.trim();
    } else {
      const b = (typeof rawBody === "object" && rawBody !== null) ? rawBody as Record<string, any> : {};
      smsText = String(
        b.message ?? b.text ?? b.sms ?? b.body ?? b.msg ?? b.content ??
        b.messageBody ?? b.smsBody ?? b.messageText ?? b.sms_body ?? b.sms_text ??
        q.message ?? q.text ?? q.sms ?? q.msg ?? q.body ?? q.content ?? ""
      ).trim();
    }

    // Decode Unicode escape sequences that some SMS apps embed literally in URLs
    // e.g. \u0623\u0648\u062F\u0639 → أودع  (backslash-u hex, not percent-encoded)
    // Also handle %uXXXX (old non-standard URL encoding used by some Java/Android clients)
    smsText = smsText
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/%u([0-9a-fA-F]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));

    if (!smsText) {
      return res.status(400).json({
        message: "message required",
        hint: 'Forward SMS app URL: ?message={msg}&time={local-time}  — no body or headers needed',
        received: { bodyType: typeof rawBody, query: q },
      });
    }

    // Detect unsubstituted template placeholders — the app sent the variable name literally
    // e.g. Forward SMS uses {msg}; if the body template was wrong they arrive as literal text
    const PLACEHOLDER_PATTERN = /^(\{msg\}|%message%|%msg%|\{message\}|\$message\$|\[message\]|\[msg\])$/i;
    if (PLACEHOLDER_PATTERN.test(smsText)) {
      return res.status(422).json({
        message: "Received a template placeholder instead of real SMS content",
        received: smsText,
        fix: 'In Forward SMS app, set body to: {"message": "{msg}"}  — the app variable is {msg} (curly braces, not percent signs)',
      });
    }

    try {
      // ── Duplicate guard ────────────────────────────────────────────────────
      // Same exact message text from the same endpoint on the same calendar day
      // → silently accept (200 OK) but do not store again.
      // Bank messages include the running balance so identical text = identical transaction.
      const duplicate = await storage.findSmsRawInboxDuplicate(slug, smsText);
      if (duplicate) {
        return res.status(200).json({
          status: "duplicate",
          inboxId: duplicate.id,
          message: "Duplicate message — already recorded today. Ignored.",
        });
      }

      const config = await storage.getSmsWebhookConfigBySlug(slug);
      // Resolve forwarding time from query params (Forward SMS sends {local-time} or {time} in URL)
      // Stored in the `sender` column for DB compat — displayed as "Forwarded At" in the UI
      const b = (typeof req.body === "object" && req.body !== null) ? req.body as Record<string, any> : {};
      const q2 = req.query as any;
      const senderValue =
        q2.time ?? q2["local-time"] ?? q2.local_time ?? q2.localtime ??
        b.time ?? b["local-time"] ?? b.local_time ?? undefined;
      // Store to inbox regardless — even if config is unknown, we save it for review
      const entry = await storage.createSmsRawInboxEntry({
        slug,
        configId: config?.id ?? undefined,
        sender: senderValue ? String(senderValue) : undefined,
        rawMessage: smsText,
      });
      res.status(202).json({ status: "queued", inboxId: entry.id, message: "SMS stored. Process it from the Inbox." });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ message: "Internal server error" });
    }
  };
  // Register for both POST and GET so Forward SMS app works without body template
  app.post("/api/webhooks/sms/:slug", _smsWebhookHandler);
  app.get("/api/webhooks/sms/:slug", _smsWebhookHandler);

  // ─── SMS INGEST (replaces Supabase Edge Function) ─────────────────────────
  // Accepts GET ?secret=…&slug=…&message=…&sender=… (same params as the old edge fn)
  app.get("/api/sms-ingest", async (req: any, res: any) => {
    const secret = (req.query.secret as string)?.trim();
    const expectedSecret = process.env.SMS_WEBHOOK_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const slug = (req.query.slug as string)?.trim();
    if (!slug) return res.status(400).json({ error: "Missing ?slug= parameter" });
    // Reuse the slug-based handler by faking params
    req.params = { slug };
    return _smsWebhookHandler(req, res);
  });

  // ─── SMS RAW INBOX API ────────────────────────────────────────────────────
  app.get("/api/sms-raw-inbox", requireAuth, async (req, res) => {
    const { status, configId, limit } = req.query as Record<string, string>;
    const entries = await storage.getSmsRawInbox({
      status: status || undefined,
      configId: configId || undefined,
      limit: limit ? parseInt(limit) : 200,
    });
    res.json(entries);
  });

  // Process all pending (optionally scoped to a configId)
  app.post("/api/sms-raw-inbox/process", requireAuth, requireRole("admin", "operations_manager", "finance_officer"), async (req, res) => {
    const { configId } = req.body as { configId?: string };
    const result = await storage.processAllPendingSmsInbox(configId);
    res.json(result);
  });

  // Process a single entry
  app.post("/api/sms-raw-inbox/:id/process", requireAuth, requireRole("admin", "operations_manager", "finance_officer"), async (req, res) => {
    const entry = await storage.processSmsRawInboxEntry(req.params.id);
    res.json(entry);
  });

  // Delete a single inbox entry
  app.delete("/api/sms-raw-inbox/:id", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    await storage.deleteSmsRawInboxEntry(req.params.id);
    res.status(204).send();
  });

  // Bulk-clear all inbox entries (test cleanup)
  app.delete("/api/sms-raw-inbox", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const all = await storage.getSmsRawInboxEntries();
      await Promise.all(all.map(e => storage.deleteSmsRawInboxEntry(e.id)));
      res.json({ deleted: all.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── SMS PROCESSOR STATUS ──────────────────────────────────────────────────
  app.get("/api/sms-processor/status", requireAuth, async (_req, res) => {
    try {
      const { getSmsProcessorStats } = await import("./sms-processor");
      res.json(getSmsProcessorStats());
    } catch {
      res.json({ totalRuns: 0, totalProcessed: 0, totalSucceeded: 0, totalFailed: 0, lastRunAt: null, lastRunResult: null, nextRunAt: null, isRunning: false });
    }
  });

  app.post("/api/sms-processor/run-now", requireAuth, requireRole("admin", "operations_manager", "finance_officer"), async (_req, res) => {
    try {
      const { triggerSmsProcessorNow } = await import("./sms-processor");
      const result = await triggerSmsProcessorNow();
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Legacy compat: plain /api/webhooks/sms (no slug) — uses message + bankId
  app.post("/api/webhooks/sms", async (req, res) => {
    try {
      const { message, bankId } = req.body;
      if (!message) return res.status(400).json({ message: "message required" });
      const amountMatch = message.match(/(\d[\d,]*\.?\d*)\s*(YER|SAR|USD|AED)/i);
      const amount = amountMatch ? amountMatch[1].replace(/,/g, '') : null;
      const currency = amountMatch ? amountMatch[2].toUpperCase() : null;
      const senderMatch = message.match(/(?:from|من)\s+([^\n\r]+)/i);
      const senderName = senderMatch ? senderMatch[1].trim() : null;

      const record = await storage.createRecord({
        type: 'cash',
        direction: 'inflow',
        source: 'sms_webhook',
        recordMethod: 'auto',
        endpointName: bankId || 'sms',
        amount: amount || '0',
        currency: currency || 'YER',
        clientSenderName: senderName || undefined,
        endpointText: message,
        processingStage: 'auto_matched',
      } as any, 'system');

      res.status(201).json({ record, parsed: { amount, currency, senderName } });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNTING ENGINE ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Currencies ────────────────────────────────────────────────────────────
  app.get("/api/accounting/currencies", requireAuth, async (_req, res) => {
    try { res.json(await storage.getAllCurrencies()); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.post("/api/accounting/currencies", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const data = insertCurrencySchema.parse(req.body);
      res.status(201).json(await storage.upsertCurrency(data));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.put("/api/accounting/currencies/:code", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const data = insertCurrencySchema.parse({ ...req.body, code: req.params.code });
      res.json(await storage.upsertCurrency(data));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.delete("/api/accounting/currencies/:code", requireAuth, requireRole("admin"), async (req, res) => {
    try { await storage.deleteCurrency(req.params.code); res.json({ success: true }); }
    catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── Exchange Rates ────────────────────────────────────────────────────────
  app.get("/api/accounting/exchange-rates", requireAuth, async (req, res) => {
    try {
      const { fromCurrency, effectiveDate } = req.query as any;
      res.json(await storage.getExchangeRates({ fromCurrency, effectiveDate }));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.post("/api/accounting/exchange-rates", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const data = insertExchangeRateSchema.parse({ ...req.body, createdBy: req.session.userId });
      res.status(201).json(await storage.createExchangeRate(data));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.put("/api/accounting/exchange-rates/:id", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const result = await storage.updateExchangeRate(req.params.id, req.body);
      if (!result) return res.status(404).json({ message: "Rate not found" });
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.delete("/api/accounting/exchange-rates/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try { await storage.deleteExchangeRate(req.params.id); res.json({ success: true }); }
    catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── Accounting Periods ────────────────────────────────────────────────────
  app.get("/api/accounting/periods", requireAuth, async (_req, res) => {
    try { res.json(await storage.getAllPeriods()); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.get("/api/accounting/periods/open", requireAuth, async (_req, res) => {
    try { res.json(await storage.getOpenPeriod()); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.post("/api/accounting/periods", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const data = insertAccountingPeriodSchema.parse({ ...req.body, createdBy: req.session.userId });
      res.status(201).json(await storage.createPeriod(data));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.post("/api/accounting/periods/:id/close", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const result = await storage.updatePeriodStatus(req.params.id, 'closed', req.session.userId);
      if (!result) return res.status(404).json({ message: "Period not found" });
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.post("/api/accounting/periods/:id/lock", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const result = await storage.updatePeriodStatus(req.params.id, 'locked', req.session.userId);
      if (!result) return res.status(404).json({ message: "Period not found" });
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.post("/api/accounting/periods/:id/reopen", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const period = await storage.getPeriod(req.params.id);
      if (!period) return res.status(404).json({ message: "Period not found" });
      if (period.status === 'locked') return res.status(400).json({ message: "Locked periods cannot be reopened" });
      const result = await storage.updatePeriodStatus(req.params.id, 'open');
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── Chart of Accounts ─────────────────────────────────────────────────────
  app.get("/api/accounting/accounts", requireAuth, async (req, res) => {
    try {
      const { type, isActive } = req.query as any;
      const filters: { [k: string]: any } = {};
      if (type) filters.type = type;
      if (isActive !== undefined) filters.isActive = isActive === 'true';
      res.json(await storage.getAllAccounts(filters));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  // Must be defined BEFORE /:id to avoid "balances" being treated as an id
  app.get("/api/accounting/accounts/balances", requireAuth, async (_req, res) => {
    try { res.json(await storage.getAccountBalances()); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/accounting/accounts/:id", requireAuth, async (req, res) => {
    try {
      const acc = await storage.getAccount(req.params.id);
      if (!acc) return res.status(404).json({ message: "Account not found" });
      res.json(acc);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.post("/api/accounting/accounts", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const body = {
        ...req.body,
        buyRate:     req.body.buyRate     === "" ? undefined : req.body.buyRate,
        sellRate:    req.body.sellRate    === "" ? undefined : req.body.sellRate,
        providerId:  req.body.providerId  === "" ? undefined : req.body.providerId,
        parentCode:  req.body.parentCode  === "" ? undefined : req.body.parentCode,
        description: req.body.description === "" ? undefined : req.body.description,
        subtype:     req.body.subtype     === "" ? undefined : req.body.subtype,
      };
      const data = insertChartOfAccountsSchema.parse(body);
      res.status(201).json(await storage.createAccount(data, req.session.userId));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.put("/api/accounting/accounts/:id", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const body = {
        ...req.body,
        buyRate:     req.body.buyRate     === "" ? null : req.body.buyRate,
        sellRate:    req.body.sellRate    === "" ? null : req.body.sellRate,
        providerId:  req.body.providerId  === "" ? null : req.body.providerId,
        parentCode:  req.body.parentCode  === "" ? null : req.body.parentCode,
        description: req.body.description === "" ? null : req.body.description,
        subtype:     req.body.subtype     === "" ? null : req.body.subtype,
      };
      const result = await storage.updateAccount(req.params.id, body);
      if (!result) return res.status(404).json({ message: "Account not found" });
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.delete("/api/accounting/accounts/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const acc = await storage.getAccount(req.params.id);
      if (!acc) return res.status(404).json({ message: "Account not found" });
      if (acc.isSystemAcc) return res.status(400).json({ message: "System accounts cannot be deleted" });
      await storage.deleteAccount(req.params.id);
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── Journal Entries ───────────────────────────────────────────────────────

  // Returns the confirmation JE + lines for a given record — used by the invoice download
  // to backfill fee data for records confirmed before the fee writeback fix.
  app.get("/api/accounting/journal-entries/for-record/:recordId", requireAuth, async (req, res) => {
    try {
      const result = await storage.getConfirmationJEForRecord(req.params.recordId);
      if (!result) return res.status(404).json({ message: "No confirmation journal entry found for this record" });
      res.json(result);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/accounting/journal-entries", requireAuth, async (req, res) => {
    try {
      const { periodId, status, sourceType } = req.query as any;
      res.json(await storage.getAllJournalEntries({ periodId, status, sourceType }));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.get("/api/accounting/journal-entries/:id", requireAuth, async (req, res) => {
    try {
      const result = await storage.getJournalEntryWithLines(req.params.id);
      if (!result) return res.status(404).json({ message: "Journal entry not found" });
      res.json(result);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.post("/api/accounting/journal-entries", requireAuth, requireRole("admin", "finance_officer", "operations_manager"), async (req, res) => {
    try {
      const { entry: entryData, lines: linesData } = req.body;
      if (!entryData || !Array.isArray(linesData) || linesData.length < 2) {
        return res.status(400).json({ message: "A journal entry requires a header and at least 2 lines (one debit, one credit)" });
      }
      const entry = insertJournalEntrySchema.parse({ ...entryData, createdBy: req.session.userId });
      const lines = linesData.map((l: any) => insertJournalEntryLineSchema.parse(l));
      const result = await storage.createJournalEntry(entry, lines, req.session.userId);
      res.status(201).json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.post("/api/accounting/journal-entries/:id/post", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const result = await storage.postJournalEntry(req.params.id, req.session.userId!);
      if (!result) return res.status(404).json({ message: "Journal entry not found" });
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.post("/api/accounting/journal-entries/:id/void", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ message: "Void reason is required" });
      const result = await storage.voidJournalEntry(req.params.id, req.session.userId!, reason);
      if (!result) return res.status(404).json({ message: "Journal entry not found" });
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  // Auto-generate journal entry from existing transaction
  app.post("/api/accounting/journal-entries/from-transaction/:txId", requireAuth, requireRole("admin", "finance_officer", "operations_manager"), async (req, res) => {
    try {
      const tx = await storage.getTransaction(req.params.txId);
      if (!tx) return res.status(404).json({ message: "Transaction not found" });
      const entry = await storage.autoGenerateJournalEntry(req.params.txId, req.session.userId!);
      if (!entry) return res.status(409).json({ message: "Journal entry already exists for this transaction", transactionId: req.params.txId });
      res.status(201).json(entry);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── Crypto Networks ───────────────────────────────────────────────────────
  app.get("/api/accounting/networks", requireAuth, async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      res.json(await storage.getAllCryptoNetworks(includeInactive));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.get("/api/accounting/networks/:id", requireAuth, async (req, res) => {
    try {
      const n = await storage.getCryptoNetwork(req.params.id);
      if (!n) return res.status(404).json({ message: "Network not found" });
      res.json(n);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.post("/api/accounting/networks", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const data = insertCryptoNetworkSchema.parse(req.body);
      res.status(201).json(await storage.createCryptoNetwork(data));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.patch("/api/accounting/networks/:id", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const result = await storage.updateCryptoNetwork(req.params.id, req.body);
      if (!result) return res.status(404).json({ message: "Network not found" });
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.delete("/api/accounting/networks/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteCryptoNetwork(req.params.id);
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── Providers ─────────────────────────────────────────────────────────────
  app.get("/api/accounting/providers", requireAuth, async (req, res) => {
    try {
      const { isActive } = req.query as any;
      const filters = isActive !== undefined ? { isActive: isActive === "true" } : undefined;
      res.json(await storage.getAllProviders(filters));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.get("/api/accounting/providers/:id", requireAuth, async (req, res) => {
    try {
      const p = await storage.getProvider(req.params.id);
      if (!p) return res.status(404).json({ message: "Provider not found" });
      res.json(p);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.post("/api/accounting/providers", requireAuth, requireRole("admin", "finance_officer", "operations_manager"), async (req, res) => {
    try {
      const data = insertProviderSchema.parse(req.body);
      res.status(201).json(await storage.createProvider(data, req.session.userId));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.patch("/api/accounting/providers/:id", requireAuth, requireRole("admin", "finance_officer", "operations_manager"), async (req, res) => {
    try {
      const result = await storage.updateProvider(req.params.id, req.body);
      if (!result) return res.status(404).json({ message: "Provider not found" });
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.delete("/api/accounting/providers/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteProvider(req.params.id);
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── Source Documents ──────────────────────────────────────────────────────
  app.get("/api/accounting/source-documents", requireAuth, async (req, res) => {
    try {
      const { documentType, partyId } = req.query as any;
      res.json(await storage.getAllSourceDocuments({ documentType, partyId }));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.get("/api/accounting/source-documents/:id", requireAuth, async (req, res) => {
    try {
      const doc = await storage.getSourceDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      res.json(doc);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.post("/api/accounting/source-documents", requireAuth, requireRole("admin", "finance_officer", "operations_manager"), async (req, res) => {
    try {
      const data = insertSourceDocumentSchema.parse(req.body);
      res.status(201).json(await storage.createSourceDocument(data, req.session.userId));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.put("/api/accounting/source-documents/:id", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const result = await storage.updateSourceDocument(req.params.id, req.body);
      if (!result) return res.status(404).json({ message: "Document not found" });
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── Watched Wallets (Ankr auto-sync) ─────────────────────────────────────
  app.get("/api/accounting/watched-wallets", requireAuth, async (_req, res) => {
    try { res.json(await storage.getAllWatchedWallets()); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });
  app.post("/api/accounting/watched-wallets", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const data = insertWatchedWalletSchema.parse(req.body);
      res.status(201).json(await storage.createWatchedWallet(data, req.session.userId));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.patch("/api/accounting/watched-wallets/:id", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const result = await storage.updateWatchedWallet(req.params.id, req.body);
      if (!result) return res.status(404).json({ message: "Wallet not found" });
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.delete("/api/accounting/watched-wallets/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try { await storage.deleteWatchedWallet(req.params.id); res.json({ success: true }); }
    catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // Manual sync trigger for a single wallet
  app.post("/api/accounting/watched-wallets/:id/sync", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const apiKey = process.env.ANKR_API_KEY;
      if (!apiKey) return res.status(400).json({ message: "ANKR_API_KEY not configured. Please add it in Settings → Secrets." });
      const { syncWallet } = await import("./ankr-sync");
      const result = await syncWallet(req.params.id, apiKey);
      res.json(result);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // Reset block checkpoint so next sync re-scans full history
  app.post("/api/accounting/watched-wallets/:id/rescan", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      const [updated] = await db
        .update(watchedWallets)
        .set({ lastSyncedBlock: null as any, lastSyncAt: null, updatedAt: new Date() })
        .where(eq(watchedWallets.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Wallet not found" });
      res.json({ ok: true, message: "Block checkpoint cleared — next sync will re-scan full history" });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // Check Ankr API key status
  app.get("/api/accounting/ankr-status", requireAuth, async (_req, res) => {
    const apiKey = process.env.ANKR_API_KEY;
    res.json({
      configured: !!apiKey,
      keyHint: apiKey ? `${apiKey.slice(0, 4)}${"•".repeat(8)}` : null,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FINANCIAL ENGINE ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Transaction Entries ──────────────────────────────────────────────────
  app.get("/api/transactions/:id/entries", requireAuth, async (req, res) => {
    try { res.json(await storage.getTransactionEntries(req.params.id)); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/transactions/:id/entries", requireAuth, requireRole("admin", "finance_officer", "operations_manager"), async (req, res) => {
    try {
      const data = insertTransactionEntrySchema.parse({
        ...req.body,
        transactionId: req.params.id,
        createdBy: actorId(req),
      });
      const entry = await storage.createTransactionEntry(data);
      await storage.createAuditLog({ entityType: 'transaction_entry', entityId: entry.id, action: 'created', actorId: actorId(req), actorName: null, before: null, after: entry, ipAddress: req.ip ?? null });
      res.status(201).json(entry);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/transactions/:txId/entries/:id", requireAuth, requireRole("admin", "finance_officer"), async (req, res) => {
    try {
      await storage.deleteTransactionEntry(req.params.id);
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // Auto-extract fee entries from transaction financials
  app.post("/api/transactions/:id/extract-fees", requireAuth, requireRole("admin", "finance_officer", "operations_manager"), async (req, res) => {
    try {
      const created = await autoExtractFeeEntries(req.params.id, actorId(req) ?? undefined);
      res.json({ created: created.length, entries: created });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── Compliance Alerts ────────────────────────────────────────────────────
  app.get("/api/compliance/alerts", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getAllComplianceAlerts({
        status:     queryStr(req.query.status)    || undefined,
        severity:   queryStr(req.query.severity)  || undefined,
        alertType:  queryStr(req.query.alertType) || undefined,
        customerId: queryStr(req.query.customerId)|| undefined,
      }));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/compliance/alerts/count", requireAuth, async (_req, res) => {
    try { res.json({ count: await storage.getOpenCriticalAlertCount() }); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.patch("/api/compliance/alerts/:id", requireAuth, requireRole("admin", "compliance_officer", "operations_manager"), async (req, res) => {
    try {
      const { status, resolutionNotes } = req.body;
      const user = await storage.getStaffUser(req.session!.userId!);
      const updates: any = { status, resolutionNotes };
      if (["resolved", "false_positive"].includes(status)) {
        updates.resolvedBy  = actorId(req);
        updates.resolvedAt  = new Date().toISOString();
      }
      const updated = await storage.updateComplianceAlert(req.params.id, updates);
      if (!updated) return res.status(404).json({ message: "Alert not found" });
      await storage.createAuditLog({ entityType: 'compliance_alert', entityId: req.params.id, action: status, actorId: actorId(req), actorName: user?.fullName ?? null, before: null, after: updated, ipAddress: req.ip ?? null });
      res.json(updated);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── Liquidity Status (S-08) ──────────────────────────────────────────────
  app.get("/api/compliance/liquidity-status", requireAuth, async (_req, res) => {
    try { res.json(await getLiquidityStatus()); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── System Variables ──────────────────────────────────────────────────────
  app.get("/api/system-variables", requireAuth, async (req, res) => {
    try {
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      const vars = await storage.getAllSystemVariables(category);
      res.json(vars);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/system-variables/:key", requireAuth, async (req, res) => {
    try {
      const v = await storage.getSystemVariable(req.params.key);
      if (!v) return res.status(404).json({ message: "Variable not found" });
      res.json(v);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.put("/api/system-variables/:key", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      const { insertSystemVariableSchema } = await import("@shared/schema");
      const data = insertSystemVariableSchema.parse({ ...req.body, key: req.params.key });
      const result = await storage.upsertSystemVariable(data);
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/system-variables", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      const { insertSystemVariableSchema } = await import("@shared/schema");
      const data = insertSystemVariableSchema.parse(req.body);
      const result = await storage.upsertSystemVariable(data);
      res.status(201).json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/system-variables/:key", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const existing = await storage.getSystemVariable(req.params.key);
      if (!existing) return res.status(404).json({ message: "Variable not found" });
      await storage.deleteSystemVariable(req.params.key);
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── Customer Groups ───────────────────────────────────────────────────────
  app.get("/api/customer-groups", requireAuth, async (_req, res) => {
    try { res.json(await storage.getAllCustomerGroups()); }
    catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/customer-groups", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      const { insertCustomerGroupSchema } = await import("@shared/schema");
      const data = insertCustomerGroupSchema.parse(req.body);
      const result = await storage.createCustomerGroup(data, (req as any).user?.id);
      res.status(201).json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/customer-groups/:id", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      const result = await storage.updateCustomerGroup(req.params.id, req.body);
      if (!result) return res.status(404).json({ message: "Group not found" });
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/customer-groups/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteCustomerGroup(req.params.id);
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── Customer Follow-ups ───────────────────────────────────────────────────
  app.get("/api/follow-ups", requireAuth, async (req, res) => {
    try {
      const { customerId, status, assignedTo } = req.query as Record<string, string>;
      res.json(await storage.getAllFollowUps({ customerId, status, assignedTo }));
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/follow-ups", requireAuth, async (req, res) => {
    try {
      const { insertCustomerFollowUpSchema } = await import("@shared/schema");
      const data = insertCustomerFollowUpSchema.parse(req.body);
      const result = await storage.createFollowUp(data, (req as any).user?.id);
      res.status(201).json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.patch("/api/follow-ups/:id", requireAuth, async (req, res) => {
    try {
      const updates = req.body;
      if (updates.status === "done" && !updates.completedAt) updates.completedAt = new Date();
      if (updates.status !== "done") updates.completedAt = null;
      const result = await storage.updateFollowUp(req.params.id, updates);
      if (!result) return res.status(404).json({ message: "Follow-up not found" });
      res.json(result);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/follow-ups/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteFollowUp(req.params.id);
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ─── WHATSAPP BRIDGE ROUTES (machine-to-machine, no session needed) ─────────
  // Protected by x-api-key === VPS_PASSWORD (shared secret between this app and the VPS).
  // These routes are called by the remote instance's whatsapp-service to control
  // the WhatsApp connection on whichever instance has Baileys running.
  const bridgeApiKey = process.env.WA_BRIDGE_API_KEY || "";
  function requireBridgeKey(req: Request, res: Response, next: Function) {
    if (!bridgeApiKey) return res.status(503).json({ error: "Bridge API key not configured on this server" });
    const provided = (req.headers["x-api-key"] as string) ?? "";
    if (provided !== bridgeApiKey) return res.status(401).json({ error: "Unauthorized" });
    next();
  }

  app.get("/api/bridge/status", requireBridgeKey, async (_req, res) => {
    res.json(whatsappService.getStatus());
  });
  app.post("/api/bridge/connect", requireBridgeKey, async (_req, res) => {
    try { await whatsappService.initialize(); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/bridge/disconnect", requireBridgeKey, async (_req, res) => {
    try { await whatsappService.disconnect(); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/bridge/reconnect", requireBridgeKey, async (_req, res) => {
    try { await whatsappService.reconnect(); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/bridge/groups", requireBridgeKey, async (_req, res) => {
    try { res.json(await whatsappService.getGroups()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/bridge/send", requireBridgeKey, async (req, res) => {
    try {
      const { groupJid, message } = req.body as { groupJid: string; message: string };
      if (!groupJid || !message) return res.status(400).json({ error: "groupJid and message are required" });
      const result = await whatsappService.sendDirect(groupJid, message);
      res.json(result ?? { ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ─── WHATSAPP NOTIFICATION MANAGEMENT ───────────────────────────────────

  app.get("/api/whatsapp/status", requireAuth, async (_req, res) => {
    res.json(whatsappService.getStatus());
  });

  app.post("/api/whatsapp/connect", requireAuth, async (_req, res) => {
    try {
      await whatsappService.initialize();
      res.json({ message: "WhatsApp connection initiated — scan QR code to authenticate" });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/whatsapp/disconnect", requireAuth, async (_req, res) => {
    try {
      await whatsappService.disconnect();
      res.json({ message: "WhatsApp disconnected" });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/whatsapp/reconnect", requireAuth, async (_req, res) => {
    try {
      await whatsappService.reconnect();
      res.json({ message: "WhatsApp reconnecting…" });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/whatsapp/groups", requireAuth, async (_req, res) => {
    try {
      const groups = await whatsappService.getGroups();
      res.json(groups);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/notifications/queue", requireAuth, async (req, res) => {
    try {
      const { status, customerId, limit } = req.query as any;
      const queue = await storage.getNotificationQueue({
        status, customerId,
        limit: limit ? parseInt(limit) : 100,
      });
      res.json(queue);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/notifications/audit", requireAuth, async (req, res) => {
    try {
      const { recordId, customerId, limit } = req.query as any;
      const logs = await storage.getNotificationAuditLog({
        recordId, customerId,
        limit: limit ? parseInt(limit) : 100,
      });
      res.json(logs);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/notifications/stats", requireAuth, async (_req, res) => {
    try {
      const stats = await storage.getNotificationStats();
      res.json(stats);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/notifications/:id/cancel", requireAuth, async (req, res) => {
    try {
      const result = await storage.cancelNotification(req.params.id);
      if (!result) return res.status(404).json({ message: "Notification not found or not in queued status" });
      res.json(result);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/notifications/:id/retry", requireAuth, async (req, res) => {
    try {
      const result = await storage.retryNotification(req.params.id);
      if (!result) return res.status(404).json({ message: "Notification not found" });
      res.json(result);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  // ─── Crypto Send (On-chain USDT BEP20) ──────────────────────────────────────

  app.get("/api/crypto-sends/account-info", requireAuth, async (_req, res) => {
    try {
      const { account, provider, network } = await resolveAccountAndProvider("1521");
      if (!account) return res.status(404).json({ message: "Account 1521 (Auto Send Wallet) not found. Create it in Chart of Accounts first." });
      if (!provider) return res.status(400).json({ message: `Account ${account.code} has no linked provider. Set providerId on the account.` });
      const walletInfo = await getWalletInfo();
      const actualNetworkFee = parseFloat(String(network?.networkFeeUsd ?? provider.networkFeeUsd ?? "0"));
      res.json({
        account: { id: account.id, code: account.code, name: account.name },
        provider: {
          id: provider.id,
          name: provider.name,
          networkCode: network?.code || provider.networkCode,
          depositFeeRate: parseFloat(String(provider.depositFeeRate ?? "0")),
          withdrawFeeRate: parseFloat(String(provider.withdrawFeeRate ?? "0")),
          networkFeeUsd: actualNetworkFee,
          fieldType: provider.fieldType,
          fieldName: provider.fieldName,
        },
        wallet: walletInfo,
      });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/crypto-sends/balance", requireAuth, async (_req, res) => {
    try {
      const info = await getWalletInfo();
      res.json(info);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/crypto-sends", requireAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"))));
      const offset = (page - 1) * limit;
      const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(cryptoSends);
      const total = Number(countResult?.count ?? 0);
      const sends = await db.select().from(cryptoSends).orderBy(desc(cryptoSends.createdAt)).limit(limit).offset(offset);
      res.json({ data: sends, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.get("/api/crypto-sends/:id", requireAuth, async (req, res) => {
    try {
      const [send] = await db.select().from(cryptoSends).where(eq(cryptoSends.id, req.params.id));
      if (!send) return res.status(404).json({ message: "Send not found" });
      res.json(send);
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  async function resolveAccountAndProvider(accountIdOrCode: string) {
    const acct = (await storage.getAccount(accountIdOrCode)) ?? (await storage.getAccountByCode(accountIdOrCode));
    if (!acct) return { account: null, provider: null, network: null };
    let provider = null;
    let network = null;
    if (acct.providerId) provider = await storage.getProvider(acct.providerId);
    if (provider?.networkId) {
      const [net] = await db.select().from(cryptoNetworks).where(eq(cryptoNetworks.id, provider.networkId));
      network = net ?? null;
    }
    return { account: acct, provider, network };
  }

  const MIN_SEND_FEE_USD = 1.0;

  app.post("/api/crypto-sends/preview", requireAuth, requireRole("admin", "operations_manager", "finance_officer"), async (req, res) => {
    try {
      const {
        customerId, recipientAddress, amount, exchangeRate,
        depositFeeRate: overrideFeeRate, fromAccountId, fiatAmount, fiatCurrency,
      } = req.body;

      if (!customerId) return res.status(400).json({ message: "Customer is required" });
      if (!recipientAddress) return res.status(400).json({ message: "Recipient address is required" });
      if (!validateAddress(recipientAddress)) return res.status(400).json({ message: "Invalid wallet address" });

      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });

      const { account, provider, network } = await resolveAccountAndProvider(fromAccountId || "1521");
      if (!account) return res.status(404).json({ message: "Account not found. Create account 1521 (Auto Send Wallet) in Chart of Accounts first." });
      if (!provider) return res.status(400).json({ message: `Account ${account.code} has no linked provider. Set providerId on the account.` });

      const rate = parseFloat(exchangeRate || "1");
      const numFiatAmount = parseFloat(fiatAmount || "0");
      const providerDepositFee = parseFloat(String(provider.depositFeeRate ?? "0"));
      const feeRate = overrideFeeRate !== undefined && overrideFeeRate !== "" ? parseFloat(overrideFeeRate) : providerDepositFee;

      const usdtAmount = parseFloat(amount) || (() => {
        if (numFiatAmount <= 0 || rate <= 0) return 0;
        const usdtIfPct = numFiatAmount / rate / (1 + feeRate / 100);
        const feeIfPct  = usdtIfPct * (feeRate / 100);
        if (feeRate > 0 && feeIfPct < MIN_SEND_FEE_USD && numFiatAmount > MIN_SEND_FEE_USD) {
          return Math.max(0, (numFiatAmount - MIN_SEND_FEE_USD) / rate);
        }
        return usdtIfPct;
      })();
      if (!usdtAmount || usdtAmount <= 0) return res.status(400).json({ message: "USDT amount must be greater than zero" });

      const rawDepositFeeUsd = usdtAmount * (feeRate / 100);
      const depositFeeUsd = rawDepositFeeUsd > 0 && rawDepositFeeUsd < MIN_SEND_FEE_USD ? MIN_SEND_FEE_USD : rawDepositFeeUsd;
      const networkFeeUsd = parseFloat(String(network?.networkFeeUsd ?? provider.networkFeeUsd ?? "0"));
      const totalDebitFiat = numFiatAmount;

      const walletInfo = await getWalletInfo();

      res.json({
        customerName: customer.fullName,
        recipientAddress: checksumAddress(recipientAddress),
        usdtAmount: usdtAmount.toFixed(6),
        fiatAmount: numFiatAmount.toFixed(4),
        fiatCurrency: fiatCurrency || "USD",
        currency: "USDT",
        network: network?.code || provider.networkCode || "BEP20",
        exchangeRate: rate.toFixed(6),
        depositFeeRate: feeRate.toFixed(4),
        depositFeeFiat: depositFeeUsd.toFixed(4),
        networkFeeUsd: networkFeeUsd.toFixed(6),
        totalDebitFiat: totalDebitFiat.toFixed(4),
        fromAccountId: account.id,
        fromAccountCode: account.code,
        fromAccountName: account.name,
        providerId: provider.id,
        providerName: provider.name,
        providerDepositFeeRate: providerDepositFee.toFixed(4),
        walletBalance: walletInfo.usdtBalance,
        bnbBalance: walletInfo.bnbBalance,
        walletConfigured: walletInfo.configured,
        sufficientBalance: parseFloat(walletInfo.usdtBalance) >= usdtAmount,
        minFeeApplied: rawDepositFeeUsd > 0 && rawDepositFeeUsd < MIN_SEND_FEE_USD,
      });
    } catch (e: any) { console.error(e); res.status(500).json({ message: "Internal server error" }); }
  });

  app.post("/api/crypto-sends/execute", requireAuth, requireRole("admin", "operations_manager", "finance_officer"), cryptoSendLimiter, async (req, res) => {
    try {
      const {
        customerId, recipientAddress, amount,
        exchangeRate, depositFeeRate: overrideFeeRate, fromAccountId, fiatAmount, fiatCurrency,
      } = req.body;

      if (!customerId) return res.status(400).json({ message: "Customer is required" });
      if (!recipientAddress) return res.status(400).json({ message: "Recipient address is required" });
      if (!validateAddress(recipientAddress)) return res.status(400).json({ message: "Invalid wallet address" });

      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });

      const { account, provider, network } = await resolveAccountAndProvider(fromAccountId || "1521");
      if (!account) return res.status(404).json({ message: "Account not found. Create account 1521 (Auto Send Wallet) in Chart of Accounts first." });
      if (!provider) return res.status(400).json({ message: `Account ${account.code} has no linked provider. Set providerId on the account.` });

      const rate = parseFloat(exchangeRate || "1");
      const numFiatAmount = parseFloat(fiatAmount || "0");
      const providerDepositFee = parseFloat(String(provider.depositFeeRate ?? "0"));
      const feeRate = overrideFeeRate !== undefined && overrideFeeRate !== "" ? parseFloat(overrideFeeRate) : providerDepositFee;

      const usdtAmount = parseFloat(amount) || (() => {
        if (numFiatAmount <= 0 || rate <= 0) return 0;
        const usdtIfPct = numFiatAmount / rate / (1 + feeRate / 100);
        const feeIfPct  = usdtIfPct * (feeRate / 100);
        if (feeRate > 0 && feeIfPct < MIN_SEND_FEE_USD && numFiatAmount > MIN_SEND_FEE_USD) {
          return Math.max(0, (numFiatAmount - MIN_SEND_FEE_USD) / rate);
        }
        return usdtIfPct;
      })();
      if (!usdtAmount || usdtAmount <= 0) return res.status(400).json({ message: "USDT amount must be greater than zero" });

      const rawDepositFeeUsd = usdtAmount * (feeRate / 100);
      const depositFeeUsd = rawDepositFeeUsd > 0 && rawDepositFeeUsd < MIN_SEND_FEE_USD ? MIN_SEND_FEE_USD : rawDepositFeeUsd;
      const networkFeeUsd = parseFloat(String(network?.networkFeeUsd ?? provider.networkFeeUsd ?? "0"));
      const totalDebitFiat = numFiatAmount;

      // Duplicate prevention: block if same customer+address+amount sent within last 5 minutes
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const [recentDupe] = await db.select({ id: cryptoSends.id, sendNumber: cryptoSends.sendNumber, status: cryptoSends.status })
        .from(cryptoSends)
        .where(and(
          eq(cryptoSends.customerId, customer.id),
          eq(cryptoSends.recipientAddress, checksumAddress(recipientAddress)),
          sql`ABS(CAST(${cryptoSends.amount} AS numeric) - ${usdtAmount}) < 0.01`,
          sql`${cryptoSends.createdAt} > ${fiveMinAgo.toISOString()}`,
          sql`${cryptoSends.status} IN ('pending', 'broadcasting', 'confirmed')`,
        )).limit(1);
      if (recentDupe) {
        return res.status(409).json({
          message: `Duplicate detected: ${recentDupe.sendNumber} (${recentDupe.status}) sent to the same address within the last 5 minutes. Wait or change the amount.`,
        });
      }

      const idempotencyKey = crypto.createHash("sha256")
        .update(`${customerId}:${recipientAddress}:${usdtAmount.toFixed(6)}:${Date.now()}`)
        .digest("hex");

      const year = new Date().getFullYear();
      const [lastSend] = await db.select({ n: cryptoSends.sendNumber })
        .from(cryptoSends)
        .where(sql`${cryptoSends.sendNumber} LIKE ${"SEND-" + year + "-%"}`)
        .orderBy(sql`${cryptoSends.sendNumber} DESC`).limit(1);
      const lastNum = lastSend ? parseInt(lastSend.n.split("-")[2] ?? "0", 10) : 0;
      const sendNumber = `SEND-${year}-${String(lastNum + 1).padStart(6, "0")}`;

      const [sendRecord] = await db.insert(cryptoSends).values({
        sendNumber,
        customerId: customer.id,
        customerName: customer.fullName,
        recipientAddress: checksumAddress(recipientAddress),
        amount: usdtAmount.toFixed(6),
        currency: "USDT",
        network: provider.networkCode || "BEP20",
        fromAccountId: account.id,
        fromAccountName: account.name,
        exchangeRate: rate.toFixed(6),
        usdEquivalent: numFiatAmount.toFixed(4),
        depositFeeRate: feeRate.toFixed(4),
        depositFeeUsd: depositFeeUsd.toFixed(4),
        networkFeeUsd: networkFeeUsd.toFixed(6),
        totalDebitUsd: totalDebitFiat.toFixed(4),
        status: "pending",
        idempotencyKey,
        createdBy: actorId(req),
      }).returning();

      let txResult;
      try {
        txResult = await sendUSDT(
          checksumAddress(recipientAddress),
          usdtAmount.toFixed(6),
          idempotencyKey,
        );
      } catch (sendErr: any) {
        await db.update(cryptoSends)
          .set({
            status: "failed",
            errorMessage: sendErr.message,
            updatedAt: new Date(),
          })
          .where(eq(cryptoSends.id, sendRecord.id));
        return res.status(500).json({
          message: `Blockchain send failed: ${sendErr.message}`,
          sendId: sendRecord.id,
          sendNumber: sendRecord.sendNumber,
        });
      }

      await db.update(cryptoSends)
        .set({
          status: "confirmed",
          txHash: txResult.txHash,
          blockNumber: txResult.blockNumber,
          gasUsed: txResult.gasUsed,
          gasCostBnb: txResult.gasCostBnb,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(cryptoSends.id, sendRecord.id));

      // ── Create outflow record — identical to wallet-sync, plus serviceFeeRate ──
      const outflowRecord = await storage.createRecord({
        type:                  "crypto",
        direction:             "outflow",
        processingStage:       "draft",
        source:                "crypto_send",
        recordMethod:          "auto",
        accountId:             account.id,
        accountName:           account.name,
        amount:                usdtAmount.toFixed(6),
        currency:              "USDT",
        txidOrReferenceNumber: txResult.txHash,
        networkOrId:           checksumAddress(recipientAddress),
        customerId:            customer.id,
        clientName:            customer.fullName,
        clientMatchMethod:     "auto_wallet",
        isWhitelisted:         true,
        blockNumberOrBatchId:  String(txResult.blockNumber),
        assetOrProviderName:   provider.name,
        serviceFeeRate:        feeRate.toFixed(4),
        notes:                 `Send Crypto ${sendNumber} | ${usdtAmount.toFixed(6)} USDT → ${checksumAddress(recipientAddress)}`,
      } as any, actorId(req) || undefined);

      await db.update(cryptoSends)
        .set({ recordId: outflowRecord.id, updatedAt: new Date() })
        .where(eq(cryptoSends.id, sendRecord.id));

      // ── Post record-level JE (identical to wallet-sync) ──
      if (outflowRecord?.id) {
        try {
          const je = await storage.generateRecordJournalEntry(outflowRecord.id, actorId(req) || "system");
          const finalStage = "recorded";
          await db.update(records)
            .set({ processingStage: finalStage, updatedAt: new Date() })
            .where(eq(records.id, outflowRecord.id));
          if (je?.id) {
            await db.update(cryptoSends)
              .set({ journalEntryId: je.id, updatedAt: new Date() })
              .where(eq(cryptoSends.id, sendRecord.id));
          }
        } catch (jeErr: any) {
          console.warn(`[CryptoSend] JE failed for ${sendNumber}: ${jeErr.message}`);
        }
      }

      try {
        await whatsappService.enqueueRecordNotification(
          await storage.getRecord(outflowRecord.id),
          customer,
        );
      } catch (notifErr: any) {
        console.error(`[CryptoSend] Notification failed for ${sendNumber}: ${notifErr.message}`);
      }

      const [finalSend] = await db.select().from(cryptoSends).where(eq(cryptoSends.id, sendRecord.id));
      res.json(finalSend);
    } catch (e: any) {
      console.error(`[CryptoSend] Execute error:`, e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Kuraimi ePay ──────────────────────────────────────────────────────────

  const kuraimiService = await import("./kuraimi-service");

  app.get("/api/kuraimi/status", requireAuth, async (_req, res) => {
    res.json({ configured: kuraimiService.isConfigured() });
  });

  app.get("/api/kuraimi/payments", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(queryStr(req.query.limit) || "50");
      const page = parseInt(queryStr(req.query.page) || "1");
      const result = await kuraimiService.getPayments({ limit, offset: (page - 1) * limit });
      res.json({ ...result, page, limit, totalPages: Math.ceil(result.total / limit) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/kuraimi/payments/:id", requireAuth, async (req, res) => {
    try {
      const p = await kuraimiService.getPayment(req.params.id);
      if (!p) return res.status(404).json({ message: "Payment not found" });
      res.json(p);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/kuraimi/send-payment", requireAuth, requireRole("admin", "operations_manager", "finance_officer"), async (req, res) => {
    try {
      if (!kuraimiService.isConfigured()) return res.status(400).json({ message: "Kuraimi credentials not configured" });
      const { scustId, amount, currency, pinPass, customerId, customerName } = req.body;
      if (!scustId || !amount || !pinPass) return res.status(400).json({ message: "scustId, amount, and pinPass are required" });
      const result = await kuraimiService.sendPayment({
        scustId, amount: parseFloat(amount), currency, pinPass,
        customerId, customerName, createdBy: actorId(req) ?? undefined,
      });
      res.json(result);
    } catch (e: any) {
      console.error("[Kuraimi] Payment error:", e.message);
      res.status(e.statusCode || 500).json({ message: e.data?.Message || e.message || "Payment failed" });
    }
  });

  app.post("/api/kuraimi/reverse-payment/:id", requireAuth, requireRole("admin", "operations_manager"), async (req, res) => {
    try {
      if (!kuraimiService.isConfigured()) return res.status(400).json({ message: "Kuraimi credentials not configured" });
      const result = await kuraimiService.reversePayment(req.params.id);
      res.json(result);
    } catch (e: any) {
      console.error("[Kuraimi] Reversal error:", e.message);
      res.status(e.statusCode || 500).json({ message: e.data?.Message || e.message || "Reversal failed" });
    }
  });

  app.post("/api/kuraimi/link-record/:id", requireAuth, requireRole("admin", "operations_manager", "finance_officer"), async (req, res) => {
    try {
      const { recordId } = req.body;
      if (!recordId) return res.status(400).json({ message: "recordId is required" });
      const updated = await kuraimiService.linkPaymentToRecord(req.params.id, recordId);
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/webhooks/kuraimi/verify-customer", async (req, res) => {
    const authHeader = req.headers.authorization;
    const expectedUser = process.env.KURAIMI_VERIFY_USERNAME;
    const expectedPass = process.env.KURAIMI_VERIFY_PASSWORD;
    if (!expectedUser || !expectedPass) return res.status(503).json({ Code: "0", Message: "Verification endpoint not configured" });
    const expected = `Basic ${Buffer.from(`${expectedUser}:${expectedPass}`).toString("base64")}`;
    if (authHeader !== expected) return res.status(401).json({ Code: "0", Message: "Unauthorized" });
    try {
      const { SCustID, MobileNo } = req.body;
      if (!SCustID) return res.json({ Code: "0", Message: "Missing SCustID", SCustID: "" });
      const customer = await storage.getCustomerByCustomerId(SCustID);
      if (customer) {
        return res.json({ Code: "1", Message: "Customer verified", SCustID: customer.customerId || SCustID });
      }
      if (MobileNo) {
        const allCustomers = await storage.getAllCustomers({});
        const byPhone = allCustomers.find((c: any) => c.phonePrimary === MobileNo || (c.phoneSecondary || []).includes(MobileNo));
        if (byPhone) return res.json({ Code: "1", Message: "Customer verified", SCustID: byPhone.customerId || SCustID });
      }
      return res.json({ Code: "0", Message: "Customer not found", SCustID: "" });
    } catch (e: any) {
      console.error("[Kuraimi] Verify customer error:", e.message);
      res.json({ Code: "0", Message: "Internal error", SCustID: "" });
    }
  });

  return httpServer;
}
