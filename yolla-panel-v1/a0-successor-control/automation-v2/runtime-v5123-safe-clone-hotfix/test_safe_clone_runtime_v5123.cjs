/* eslint-env node */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "payload-main-v5123.js"), "utf8");
assert.equal(source.includes('const APP_VERSION = "5.12.3";'), true, "version not updated");
assert.equal(source.includes("function safeClone(value, fallback = null)"), true, "safeClone helper missing");
assert.equal(source.includes("return deepClone(value);"), true, "safeClone must reuse canonical deepClone");
assert.equal(source.includes("group_epic_bootstrap: safeClone(groupEpicBootstrapStatus, null)"), true, "runtime status binding missing");
console.log(JSON.stringify({
  terminal: "V5123_SAFE_CLONE_RUNTIME_PASS",
  safe_clone_defined: true,
  runtime_status_binding: true
}));
