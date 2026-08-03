/* eslint-env node */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

const ZIP_NAME = "YOLLA_CHROME_GROUP_TABS_DYNAMIC_WORKERS_SOURCE_V1.zip";
const candidates = [
  process.env.YOLLA_UI_V53_SOURCE_ZIP,
  path.resolve(__dirname, "../a0-successor-control/ui-v53", ZIP_NAME),
  path.join("E:\\SOURCE FACTORY\\source-factory-core", "yolla-panel-v1", "a0-successor-control", "ui-v53", ZIP_NAME)
].filter(Boolean);
const zipPath = candidates.find((candidate) => fs.existsSync(candidate));
if (!zipPath) {
  const error = new Error(`YOLLA_UI_V53_SOURCE_ZIP_NOT_FOUND:${candidates.join("|")}`);
  error.code = "YOLLA_UI_V53_SOURCE_ZIP_NOT_FOUND";
  throw error;
}

const stat = fs.statSync(zipPath);
const cacheKey = `${Math.trunc(stat.mtimeMs)}-${stat.size}`;
const cacheRoot = path.join(process.env.LOCALAPPDATA || os.tmpdir(), ".yolla", "yolla-ui-v53-source", cacheKey);
const implementationPath = path.join(cacheRoot, "yolla_panel_main_bridge.cjs");
if (!fs.existsSync(implementationPath)) {
  fs.rmSync(cacheRoot, { recursive: true, force: true });
  fs.mkdirSync(cacheRoot, { recursive: true });
  if (process.platform === "win32") {
    childProcess.execFileSync("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
      "Expand-Archive -LiteralPath $env:YOLLA_UI_V53_ZIP -DestinationPath $env:YOLLA_UI_V53_CACHE -Force"
    ], {
      env: { ...process.env, YOLLA_UI_V53_ZIP: zipPath, YOLLA_UI_V53_CACHE: cacheRoot },
      windowsHide: true,
      stdio: "ignore"
    });
  } else {
    childProcess.execFileSync("unzip", ["-oq", zipPath, "-d", cacheRoot], { stdio: "ignore" });
  }
}
if (!fs.existsSync(implementationPath)) {
  const error = new Error(`YOLLA_UI_V53_IMPLEMENTATION_NOT_EXTRACTED:${implementationPath}`);
  error.code = "YOLLA_UI_V53_IMPLEMENTATION_NOT_EXTRACTED";
  throw error;
}
module.exports = require(implementationPath);
