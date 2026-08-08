/* eslint-env node */
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");

const HOST = "127.0.0.1";
const PORT = Number(process.env.YOLLA_V6_MCP_PORT || 8610);
const V6_ROOT = path.resolve(process.env.YOLLA_V6_ROOT || "E:\\YOLLA\\panel-v6");
const EXECUTOR_ROOT = path.join(V6_ROOT, "executor");
const INBOX_ROOT = path.join(EXECUTOR_ROOT, "inbox");
const PROCESSING_ROOT = path.join(EXECUTOR_ROOT, "processing");
const ARCHIVE_ROOT = path.join(EXECUTOR_ROOT, "archive");
const RECEIPT_ROOT = path.join(EXECUTOR_ROOT, "receipts");
const CONTROL_RECEIPT_ROOT = path.join(V6_ROOT, "receipts");
const API_KEY = String(process.env.YOLLA_V6_RUNTIME_API_KEY || "");
const MAX_BODY_BYTES = 1024 * 1024;
const ALLOWED_ACTIONS = new Set(["STATUS", "SNAPSHOT", "VALIDATE", "START_PANEL", "STOP_PANEL", "INSTALL_UPDATE"]);

function ensureDir(directory) { fs.mkdirSync(directory, { recursive: true }); }
function nowIso() { return new Date().toISOString(); }
function cleanId(value) {
  const text = String(value == null ? "" : value).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(text)) throw new Error("INVALID_REQUEST_ID");
  return text;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function sha256(value) { return crypto.createHash("sha256").update(String(value), "utf8").digest("hex"); }
function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, filePath);
}
function readJson(filePath, fallback = null) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")); }
  catch (_error) { return fallback; }
}
function fileCount(directory, suffix = ".json") {
  try { return fs.readdirSync(directory).filter(name => name.endsWith(suffix)).length; }
  catch (_error) { return 0; }
}
function authorized(request) {
  if (!API_KEY) return false;
  const header = String(request.headers.authorization || "");
  return header.startsWith("Bearer ") && safeEqual(header.slice(7), API_KEY);
}
function statusSnapshot() {
  return {
    schema_version: "YOLLA_PANEL_V6_CONTROL_STATUS_V1",
    namespace: "YOLLA_PANEL_V6",
    v6_root: V6_ROOT,
    endpoint: `http://${HOST}:${PORT}/mcp`,
    api_key_configured: Boolean(API_KEY),
    queue_depth: fileCount(INBOX_ROOT),
    receipt_count: fileCount(RECEIPT_ROOT),
    runtime_receipt: readJson(path.join(CONTROL_RECEIPT_ROOT, "LATEST_RUNTIME_RECEIPT.json"), null),
    executor_receipt: readJson(path.join(CONTROL_RECEIPT_ROOT, "LATEST_EXECUTOR_RECEIPT.json"), null),
    legacy_write_count: 0,
    observed_at: nowIso()
  };
}
function submitCommand(args = {}) {
  const requestId = cleanId(args.request_id);
  const action = String(args.action || "").trim().toUpperCase();
  if (!ALLOWED_ACTIONS.has(action)) throw new Error(`ACTION_NOT_ALLOWED:${action || "EMPTY"}`);
  const payload = args.payload && typeof args.payload === "object" && !Array.isArray(args.payload) ? stable(args.payload) : {};
  const idempotencyKey = sha256(`YOLLA_PANEL_V6|${requestId}|${action}|${JSON.stringify(payload)}`);
  const receiptPath = path.join(RECEIPT_ROOT, `${requestId}.json`);
  const inboxPath = path.join(INBOX_ROOT, `${requestId}.json`);
  const processingPath = path.join(PROCESSING_ROOT, `${requestId}.json`);
  const archivePath = path.join(ARCHIVE_ROOT, `${requestId}.json`);
  const existingReceipt = readJson(receiptPath, null);
  if (existingReceipt) return { accepted: true, duplicate: true, terminal: true, idempotency_key: idempotencyKey, receipt: existingReceipt };
  const existing = readJson(inboxPath, null) || readJson(processingPath, null) || readJson(archivePath, null);
  if (existing) {
    if (existing.idempotency_key !== idempotencyKey) throw new Error("REQUEST_ID_CONFLICT");
    return { accepted: true, duplicate: true, terminal: false, idempotency_key: idempotencyKey, command: existing };
  }
  const command = {
    schema_version: "YOLLA_PANEL_V6_PC_COMMAND_V1",
    namespace: "YOLLA_PANEL_V6",
    request_id: requestId,
    action,
    payload,
    idempotency_key: idempotencyKey,
    status: "QUEUED",
    legacy_target_allowed: false,
    arbitrary_shell_allowed: false,
    created_at: nowIso()
  };
  writeJsonAtomic(inboxPath, command);
  return { accepted: true, duplicate: false, terminal: false, idempotency_key: idempotencyKey, command };
}
function getReceipt(args = {}) {
  const requestId = cleanId(args.request_id);
  const receipt = readJson(path.join(RECEIPT_ROOT, `${requestId}.json`), null);
  return { found: Boolean(receipt), request_id: requestId, receipt };
}
function listReceipts(args = {}) {
  const limit = Math.max(1, Math.min(100, Number(args.limit || 20)));
  let files = [];
  try {
    files = fs.readdirSync(RECEIPT_ROOT).filter(name => name.endsWith(".json"))
      .map(name => ({ name, full: path.join(RECEIPT_ROOT, name), mtime: fs.statSync(path.join(RECEIPT_ROOT, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime).slice(0, limit);
  } catch (_error) {}
  return { receipts: files.map(item => readJson(item.full, null)).filter(Boolean) };
}
const tools = [
  { name: "yolla_v6_get_status", description: "Read bounded YOLLA Panel V6 runtime, tunnel, executor and queue status.", inputSchema: { type: "object", additionalProperties: false } },
  { name: "yolla_v6_submit_command", description: "Queue one allowlisted V6-only PC operation. Arbitrary shell and legacy targets are rejected.", inputSchema: { type: "object", additionalProperties: false, required: ["request_id", "action"], properties: { request_id: { type: "string" }, action: { enum: Array.from(ALLOWED_ACTIONS) }, payload: { type: "object" } } } },
  { name: "yolla_v6_get_receipt", description: "Read the immutable executor receipt for one V6 request.", inputSchema: { type: "object", additionalProperties: false, required: ["request_id"], properties: { request_id: { type: "string" } } } },
  { name: "yolla_v6_list_receipts", description: "List recent bounded V6 executor receipts.", inputSchema: { type: "object", additionalProperties: false, properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } } }
];
function toolResult(value, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], isError };
}
function handleRpc(message) {
  const id = Object.prototype.hasOwnProperty.call(message || {}, "id") ? message.id : null;
  try {
    if (!message || message.jsonrpc !== "2.0") throw new Error("INVALID_JSON_RPC");
    if (message.method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "yolla-panel-v6-control-plane", version: "6.0.1" } } };
    if (message.method === "notifications/initialized") return null;
    if (message.method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (message.method === "tools/list") return { jsonrpc: "2.0", id, result: { tools } };
    if (message.method === "tools/call") {
      const name = String(message.params && message.params.name || "");
      const args = message.params && message.params.arguments || {};
      if (name === "yolla_v6_get_status") return { jsonrpc: "2.0", id, result: toolResult(statusSnapshot()) };
      if (name === "yolla_v6_submit_command") return { jsonrpc: "2.0", id, result: toolResult(submitCommand(args)) };
      if (name === "yolla_v6_get_receipt") return { jsonrpc: "2.0", id, result: toolResult(getReceipt(args)) };
      if (name === "yolla_v6_list_receipts") return { jsonrpc: "2.0", id, result: toolResult(listReceipts(args)) };
      throw new Error(`TOOL_NOT_FOUND:${name}`);
    }
    throw new Error(`METHOD_NOT_FOUND:${message.method}`);
  } catch (error) {
    return { jsonrpc: "2.0", id, error: { code: -32000, message: String(error && error.message || error) } };
  }
}
function send(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
  response.end(body);
}
function createServer() {
  [INBOX_ROOT, PROCESSING_ROOT, ARCHIVE_ROOT, RECEIPT_ROOT, CONTROL_RECEIPT_ROOT].forEach(ensureDir);
  return http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") return send(response, 200, { ok: true, namespace: "YOLLA_PANEL_V6", api_key_configured: Boolean(API_KEY), observed_at: nowIso() });
    if (request.method !== "POST" || request.url !== "/mcp") return send(response, 404, { error: "NOT_FOUND" });
    if (!authorized(request)) return send(response, 401, { error: "UNAUTHORIZED" });
    let size = 0;
    const chunks = [];
    request.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) request.destroy(new Error("BODY_TOO_LARGE"));
      else chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const result = Array.isArray(payload) ? payload.map(handleRpc).filter(Boolean) : handleRpc(payload);
        if (result == null) { response.writeHead(202); return response.end(); }
        return send(response, 200, result);
      } catch (error) { return send(response, 400, { error: String(error && error.message || error) }); }
    });
  });
}
if (require.main === module) {
  if (!API_KEY) { process.stderr.write("YOLLA_V6_RUNTIME_API_KEY_REQUIRED\n"); process.exit(2); }
  const server = createServer();
  server.listen(PORT, HOST, () => process.stdout.write(`YOLLA_V6_MCP_LISTENING=http://${HOST}:${PORT}/mcp\n`));
}

module.exports = { ALLOWED_ACTIONS, V6_ROOT, cleanId, handleRpc, statusSnapshot, submitCommand, getReceipt, createServer };
