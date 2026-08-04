/* eslint-env node */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const patch = fs.readFileSync(path.join(__dirname, "SESSION_PARTITION_COMPATIBILITY_HOTFIX_V1.patch"), "utf8");
const lines = patch.split(/\r?\n/);
const added = lines.filter((line) => line.startsWith("+") && !line.startsWith("+++"));
const removed = lines.filter((line) => line.startsWith("-") && !line.startsWith("---"));
assert.equal(removed.filter((line) => line.includes("workerBrowserView.webContents.session.getPartition()")).length, 3, "three incompatible calls must be removed");
assert.equal(added.filter((line) => line.includes("workerBrowserView.webContents.session.getPartition()")).length, 0, "incompatible direct calls must not be added");
assert.ok(added.some((line) => line.includes("function currentWorkerBrowserPartition()")), "compatibility helper missing");
assert.ok(added.filter((line) => line.includes("currentWorkerBrowserPartition()")).length >= 4, "helper definition and three call sites required");
assert.ok(added.some((line) => line.includes("return WORKER_BROWSER_PARTITION;")), "fixed partition fallback missing");
console.log(JSON.stringify({
  terminal: "V5102_WORKER_SESSION_PARTITION_COMPAT_PATCH_PASS",
  incompatible_calls_removed: 3,
  incompatible_calls_added: 0
}));
