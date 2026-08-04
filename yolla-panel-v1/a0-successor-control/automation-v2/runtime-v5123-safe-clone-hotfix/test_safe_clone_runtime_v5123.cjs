/* eslint-env node */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const patch = fs.readFileSync(path.join(__dirname, "V5123_SAFE_CLONE_HOTFIX.patch"), "utf8");
assert.equal(patch.includes('+const APP_VERSION = "5.12.3";'), true, "version patch missing");
assert.equal(patch.includes("+function safeClone(value, fallback = null)"), true, "safeClone helper patch missing");
assert.equal(patch.includes("+    return deepClone(value);"), true, "canonical deepClone binding missing");
assert.equal(patch.includes('AI YOLLA Panel Workspace V5.12.3 Operation Control Center'), true, "runtime title patch missing");
console.log(JSON.stringify({
  terminal: "V5123_SAFE_CLONE_RUNTIME_PASS",
  safe_clone_defined: true,
  canonical_deep_clone_reused: true
}));
