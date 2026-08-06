/* eslint-env node */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CATEGORY_PATTERNS = Object.freeze({
  window_open_create: [
    /window\.open\s*\(/i,
    /setWindowOpenHandler/i,
    /did-create-window/i,
    /new-window/i,
    /new\s+BrowserWindow\s*\(/i,
    /BrowserView/i,
    /createTerminal\s*\(/i,
    /openWorkspace/i,
    /open-workspace/i
  ],
  close_destroy_cleanup: [
    /\.close\s*\(/,
    /\.destroy\s*\(/,
    /isDestroyed\s*\(/,
    /\bclosed\b/i,
    /\bclose\b/i,
    /clearInterval\s*\(/,
    /clearTimeout\s*\(/,
    /removeListener\s*\(/,
    /removeAllListeners\s*\(/,
    /removeEventListener\s*\(/
  ],
  polling_timeout_retry: [
    /setInterval\s*\(/,
    /setTimeout\s*\(/,
    /clearInterval\s*\(/,
    /clearTimeout\s*\(/,
    /\bpoll(?:ing)?\b/i,
    /\bretry\b/i,
    /\bbackoff\b/i,
    /\btimeout\b/i
  ],
  render_update_mutation: [
    /\brender[A-Z_a-z0-9]*\s*\(/,
    /innerHTML\s*=/,
    /replaceChildren\s*\(/,
    /textContent\s*=/,
    /className\s*=/,
    /setAttribute\s*\(/,
    /style\.[A-Za-z_$][\w$]*\s*=/,
    /document\.documentElement\.style/i
  ],
  focus_switching_visibility: [
    /\.focus\s*\(/,
    /\.moveTop\s*\(/,
    /\.show\s*\(/,
    /\.hide\s*\(/,
    /setBounds\s*\(/,
    /setPosition\s*\(/,
    /selectRole\s*\(/,
    /selected_role_id/i,
    /selectedRoleId/i
  ],
  event_listener_accumulation: [
    /addEventListener\s*\(/,
    /ipcMain\.(?:on|handle)\s*\(/,
    /ipcRenderer\.on\s*\(/,
    /\.on\s*\(/,
    /\.once\s*\(/,
    /removeListener\s*\(/,
    /removeAllListeners\s*\(/,
    /removeEventListener\s*\(/
  ],
  navigation_and_send: [
    /loadURL\s*\(/,
    /loadFile\s*\(/,
    /reload\s*\(/,
    /executeJavaScript\s*\(/,
    /webContents\.send\s*\(/,
    /\.send\s*\(/
  ]
});

const TEXT_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".html", ".htm", ".json", ".md"]);
const MAX_MATCHES_PER_CATEGORY = 160;
const MAX_LINE_TEXT = 260;

function walk(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const output = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) output.push(...walk(child));
    else if (entry.isFile()) output.push(child);
  }
  return output;
}

function nearestContext(lines, index) {
  for (let cursor = index; cursor >= Math.max(0, index - 30); cursor -= 1) {
    const line = lines[cursor];
    const candidates = [
      line.match(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/),
      line.match(/\b(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/),
      line.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/),
      line.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/),
      line.match(/\bclass\s+([A-Za-z_$][\w$]*)\b/)
    ];
    const found = candidates.find(Boolean);
    if (found) return found[1];
  }
  return "<top-level>";
}

function scanFile(filePath, rootLabels, accumulator) {
  if (!TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return;
  let body;
  try {
    body = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  if (body.includes("\u0000")) return;
  const lines = body.split(/\r?\n/);
  const labelRoot = rootLabels.find((candidate) => filePath.startsWith(candidate.root));
  const source = labelRoot
    ? `${labelRoot.label}/${path.relative(labelRoot.root, filePath).replaceAll("\\", "/")}`
    : filePath.replaceAll("\\", "/");

  accumulator.files.push({ source, line_count: lines.length, byte_count: Buffer.byteLength(body) });
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
      if (!patterns.some((pattern) => pattern.test(line))) continue;
      accumulator.counts[category] += 1;
      if (accumulator.matches[category].length >= MAX_MATCHES_PER_CATEGORY) continue;
      accumulator.matches[category].push({
        source,
        line: index + 1,
        context: nearestContext(lines, index),
        text: line.trim().slice(0, MAX_LINE_TEXT)
      });
    }
  }
}

function main() {
  const targets = process.argv.slice(2).filter(Boolean).map((value) => path.resolve(value));
  if (!targets.length) throw new Error("USAGE: node A5_RUNTIME_STATIC_AUDIT_EXTRACTOR_V1.cjs <file-or-directory> [...]");
  const missing = targets.filter((target) => !fs.existsSync(target));
  if (missing.length) throw new Error(`MISSING_TARGETS:${missing.join("|")}`);

  const rootLabels = targets.map((root, index) => ({ root, label: `target_${index + 1}:${path.basename(root)}` }));
  const accumulator = {
    schema_version: "A5_RUNTIME_STATIC_AUDIT_EXTRACTOR_RESULT_V1",
    generated_at: new Date().toISOString(),
    files: [],
    counts: Object.fromEntries(Object.keys(CATEGORY_PATTERNS).map((key) => [key, 0])),
    matches: Object.fromEntries(Object.keys(CATEGORY_PATTERNS).map((key) => [key, []]))
  };

  const files = [...new Set(targets.flatMap(walk))].sort();
  for (const file of files) scanFile(file, rootLabels, accumulator);
  accumulator.file_count = accumulator.files.length;
  accumulator.total_line_count = accumulator.files.reduce((sum, item) => sum + item.line_count, 0);
  accumulator.truncation = Object.fromEntries(Object.keys(CATEGORY_PATTERNS).map((key) => [
    key,
    accumulator.counts[key] > accumulator.matches[key].length
  ]));
  process.stdout.write(`${JSON.stringify(accumulator, null, 2)}\n`);
}

main();
