import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// __dirname = .../server/ → project root is one level up
const _serverDir = path.dirname(fileURLToPath(import.meta.url));
const _projectRoot = path.resolve(_serverDir, "..");

export function serveStatic(app: Express) {
  // Support both tsx (source) and built (dist/index.cjs) layouts
  const candidates = [
    path.join(_projectRoot, "dist", "public"),
    path.join(_serverDir, "public"),
  ];
  const distPath = candidates.find(fs.existsSync) ?? candidates[0];
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
