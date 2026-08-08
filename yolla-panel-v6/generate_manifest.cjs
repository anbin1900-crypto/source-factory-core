/* eslint-env node */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = __dirname;
const excluded = new Set(["RUNTIME_MANIFEST.json"]);
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test-evidence") return [];
      return files(full);
    }
    const relative = path.relative(root, full).split(path.sep).join("/");
    return excluded.has(relative) ? [] : [relative];
  });
}
const entries = {};
for (const relative of files(root).sort()) {
  const body = fs.readFileSync(path.join(root, relative));
  entries[relative] = { size: body.length, sha256: crypto.createHash("sha256").update(body).digest("hex") };
}
const manifest = {
  schema_version: "YOLLA_PANEL_V6_RUNTIME_MANIFEST_V1",
  system: "YOLLA_PANEL_V6",
  version: "6.0.1",
  target_root: "E:\\YOLLA\\panel-v6",
  source_baseline_sha256: "902ab7eaa08b71998169084f2a2efcdbaf06a2b2a8a6b3272636b6c954608d05",
  file_count: Object.keys(entries).length,
  files: entries
};
fs.writeFileSync(path.join(root, "RUNTIME_MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
process.stdout.write("V6_MANIFEST_GENERATED files=" + manifest.file_count + "\n");
