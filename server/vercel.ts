import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use("/api/webhooks", express.text({ type: "*/*" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Config check — shows which required env vars are missing (safe: no secret values exposed)
app.get("/api/config-check", (_req, res) => {
  const required = ["SUPABASE_DATABASE_URL", "SESSION_SECRET"];
  const optional = ["DEEPSEEK_API_KEY", "WA_BRIDGE_API_KEY"];
  const missing = required.filter(k => !process.env[k]);
  const missingOptional = optional.filter(k => !process.env[k]);
  res.json({
    ok: missing.length === 0,
    missing,
    missingOptional,
    initError,
    node_env: process.env.NODE_ENV,
  });
});

let initPromise: Promise<void> | null = null;
let initError: string | null = null;

async function doInit() {
  console.log("[vercel] starting init...");

  // Validate critical env vars before heavy imports
  const missing = ["SUPABASE_DATABASE_URL", "SESSION_SECRET"].filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables on Vercel: ${missing.join(", ")}. Set them in Vercel → Project Settings → Environment Variables.`);
  }

  console.log("[vercel] importing routes...");
  const { registerRoutes } = await import("./routes");

  console.log("[vercel] registering routes...");
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message: status >= 500 ? "Internal Server Error" : (err.message || "An error occurred") });
  });

  const distPath = path.resolve(process.cwd(), "dist/public");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  console.log("[vercel] init complete");
}

function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = doInit().catch((err) => {
      console.error("[vercel] Init failed:", err);
      initError = err?.message || String(err);
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

async function handler(req: any, res: any) {
  if (req.url === "/api/health" || req.url === "/api/config-check") {
    app(req, res);
    return;
  }

  try {
    await ensureInit();
    app(req, res);
  } catch (err: any) {
    console.error("[vercel] Handler error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    const msg = initError ?? err?.message ?? "Server initialization failed";
    res.end(JSON.stringify({ message: msg }));
  }
}

export default handler;
