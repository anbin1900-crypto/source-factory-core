/* eslint-env node */
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const SOURCE_NAME = "yolla_panel_main_bridge.cjs.gz.b64";
const candidates = [
  process.env.YOLLA_UI_V53_BACKEND_SOURCE,
  path.resolve(__dirname, "../a0-successor-control/ui-v53", SOURCE_NAME),
  path.join("E:\\SOURCE FACTORY\\source-factory-core", "yolla-panel-v1", "a0-successor-control", "ui-v53", SOURCE_NAME)
].filter(Boolean);
const sourcePath = candidates.find((candidate) => fs.existsSync(candidate));
if (!sourcePath) {
  const error = new Error(`YOLLA_UI_V53_BACKEND_SOURCE_NOT_FOUND:${candidates.join("|")}`);
  error.code = "YOLLA_UI_V53_BACKEND_SOURCE_NOT_FOUND";
  throw error;
}

const encoded = fs.readFileSync(sourcePath, "utf8").replace(/\s+/g, "");
const compressed = Buffer.from(encoded, "base64");
const implementation = zlib.gunzipSync(compressed);
const digest = crypto.createHash("sha256").update(implementation).digest("hex");
if (digest !== "83c986e13256139fa02de66bc8e51cc110b8375404791c43f38dd00229574fdb") {
  const error = new Error(`YOLLA_UI_V53_BACKEND_SHA256_MISMATCH:${digest}`);
  error.code = "YOLLA_UI_V53_BACKEND_SHA256_MISMATCH";
  throw error;
}

const cacheRoot = path.join(process.env.LOCALAPPDATA || os.tmpdir(), ".yolla", "yolla-ui-v53-source", digest.slice(0, 16));
const implementationPath = path.join(cacheRoot, "yolla_panel_main_bridge.cjs");
if (!fs.existsSync(implementationPath) || !fs.readFileSync(implementationPath).equals(implementation)) {
  fs.mkdirSync(cacheRoot, { recursive: true });
  const temporary = `${implementationPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, implementation);
  fs.renameSync(temporary, implementationPath);
}
module.exports = require(implementationPath);
