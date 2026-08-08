/* eslint-env node */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "yolla-v6-control-test-"));
process.env.YOLLA_V6_ROOT = root;
process.env.YOLLA_V6_RUNTIME_API_KEY = "test-only-key";
const server = require("./v6_mcp_server.cjs");

assert.equal(server.ALLOWED_ACTIONS.has("STATUS"), true);
assert.equal(server.ALLOWED_ACTIONS.has("SHELL"), false);
const first = server.submitCommand({ request_id: "V6-TEST-001", action: "STATUS", payload: {} });
assert.equal(first.accepted, true);
assert.equal(first.duplicate, false);
assert.equal(first.command.namespace, "YOLLA_PANEL_V6");
assert.equal(first.command.arbitrary_shell_allowed, false);
const again = server.submitCommand({ request_id: "V6-TEST-001", action: "STATUS", payload: {} });
assert.equal(again.duplicate, true);
assert.throws(() => server.submitCommand({ request_id: "V6-TEST-001", action: "START_PANEL", payload: {} }), /REQUEST_ID_CONFLICT/);
assert.throws(() => server.submitCommand({ request_id: "V6-TEST-002", action: "SHELL", payload: { command: "whoami" } }), /ACTION_NOT_ALLOWED/);
const list = server.handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
assert.equal(list.result.tools.length, 4);
const status = server.statusSnapshot();
assert.equal(status.v6_root, root);
assert.equal(status.legacy_write_count, 0);
fs.rmSync(root, { recursive: true, force: true });
process.stdout.write("V6_MCP_SERVER_TEST_PASS\n");
