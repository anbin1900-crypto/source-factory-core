/* eslint-env node */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "payload-main-v5102.js"), "utf8");
assert.equal(source.includes(".session.getPartition("), false, "direct Session.getPartition call must not remain");
assert.equal(source.includes("function currentWorkerBrowserPartition()"), true, "compatibility helper missing");
const calls = source.match(/currentWorkerBrowserPartition\(\)/g) || [];
assert.ok(calls.length >= 4, `expected helper definition plus at least three uses; got ${calls.length}`);
assert.equal(source.includes("return WORKER_BROWSER_PARTITION;"), true, "fixed partition fallback missing");
console.log(JSON.stringify({
  terminal: "V5102_WORKER_SESSION_PARTITION_COMPAT_PASS",
  direct_get_partition_calls: 0,
  compatibility_helper_occurrences: calls.length
}));
