/* eslint-env node */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SessionRestoreManager } = require("./runtime/session_restore_manager.cjs");
const { V6ModuleHost } = require("./runtime/module_host.cjs");

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "yolla-v6-modules-"));
  try {
    const stateRoot = path.join(temp, "state");
    const profileRoot = path.join(temp, "profile");
    const receiptRoot = path.join(temp, "receipts");
    fs.mkdirSync(profileRoot, { recursive: true });
    const fakeScreen = {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
      getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
    };
    const workspace = {
      selected_mode: "ANALYZER", selected_group_id: "GROUP-01", selected_role_id: "GROUP01-W01", selected_site_id: "SITE-1",
      browser: { WORKER: { url: "https://chatgpt.com/projects" }, ANALYZER: { url: "https://www.google.com" } }
    };
    const first = new SessionRestoreManager({ stateRoot, profileRoot, receiptRoot, screen: fakeScreen, workerPartition: "persist:yolla-v6-worker", analyzerPartition: "persist:yolla-v6-analyzer" });
    first.load(workspace);
    assert.equal(first.snapshot().launch_count, 1);
    assert.equal(first.writeReceipt("PARTIAL").gpt_partition_reused, false);
    assert.equal(first.writeReceipt("PARTIAL").panel_window_restored, false);
    first.value.panel.bounds = { x: 5000, y: 5000, width: 3000, height: 3000 };
    const clamped = first.windowOptions("panel", { minWidth: 1040, minHeight: 680 });
    assert.deepEqual({ x: clamped.x, y: clamped.y, width: clamped.width, height: clamped.height }, { x: 0, y: 0, width: 1920, height: 1080 });
    first.recordAuthProbe("WORKER", { observed: true, authenticated: true, host: "chatgpt.com", path: "/projects", authenticated_marker: "CHATGPT_ACCOUNT_OR_WORKSPACE_CONTROL" });
    const authPass = first.recordAuthProbe("ANALYZER", { observed: true, authenticated: true, host: "www.google.com", path: "/", authenticated_marker: "GOOGLE_ACCOUNT_CONTROL" });
    assert.equal(authPass.status, "PARTIAL");
    assert.equal(authPass.secret_export_count, 0);
    assert.equal(Object.prototype.hasOwnProperty.call(authPass, "cookies"), false);
    first.markQuitting();

    const second = new SessionRestoreManager({ stateRoot, profileRoot, receiptRoot, screen: fakeScreen, workerPartition: "persist:yolla-v6-worker", analyzerPartition: "persist:yolla-v6-analyzer" });
    second.load(workspace);
    const secondReceipt = second.writeReceipt("PARTIAL");
    assert.equal(secondReceipt.previous_runtime_seen, true);
    assert.equal(secondReceipt.gpt_partition_reused, true);
    assert.equal(secondReceipt.google_partition_reused, true);
    assert.equal(secondReceipt.panel_window_restored, false);
    assert.equal(second.snapshot().auth.GPT_CHATGPT_LOGIN.authenticated, false);
    assert.equal(second.snapshot().auth.GOOGLE_LOGIN.observed, false);
    second.applyWindowState("panel", { isDestroyed: () => false, maximize: () => {}, setFullScreen: () => {} });
    second.recordAuthProbe("WORKER", { observed: true, authenticated: true, host: "chatgpt.com", path: "/projects", authenticated_marker: "CHATGPT_ACCOUNT_OR_WORKSPACE_CONTROL" });
    const restoredPass = second.recordAuthProbe("ANALYZER", { observed: true, authenticated: true, host: "www.google.com", path: "/", authenticated_marker: "GOOGLE_ACCOUNT_CONTROL" });
    assert.equal(restoredPass.status, "PASS");
    assert.equal(restoredPass.panel_window_restored, true);
    assert.equal(restoredPass.log_window_restored, true);

    const calls = [];
    for (const providerPath of [
      path.join(__dirname, "modules", "commander-worker-menu", "provider.cjs"),
      path.join(__dirname, "modules", "site-analyzer", "provider.cjs")
    ]) {
      const providerSource = fs.readFileSync(providerPath, "utf8");
      assert.equal(/\brequire\s*\(\s*["'](?:node:)?(?:child_process|fs|net|http|https)["']|\bprocess\s*\./.test(providerSource), false, "FORBIDDEN_PROVIDER_CAPABILITY:" + providerPath);
    }
    const host = new V6ModuleHost({
      releaseRoot: path.join(__dirname, "runtime"),
      adapters: {
        "commander-worker-menu": { perform: async (action, payload) => { calls.push({ module: "B1", action, payload }); return { ok: true }; } },
        "site-analyzer": { perform: async (action, payload) => { calls.push({ module: "V2", action, payload }); return { ok: true }; } }
      }
    });
    const binding = host.load();
    assert.equal(binding["commander-worker-menu"].status, "BOUND");
    assert.equal(binding["site-analyzer"].status, "BOUND");
    assert.equal(binding["session-restore"].status, "HOST_BOUND");
    const context = {
      workspace: {
        groups: { "GROUP-01": { group_id: "GROUP-01", display_name: "A", order: 10 } },
        roles: { "GROUP01-W01": { role_id: "GROUP01-W01", group_id: "GROUP-01", display_name: "W", order: 10 } },
        sites: { "SITE-1": { site_id: "SITE-1", display_name: "S", url: "https://example.com" } },
        selected_group_id: "GROUP-01", selected_role_id: "GROUP01-W01", selected_site_id: "SITE-1"
      },
      browser: { ANALYZER: { url: "https://example.com" } }, c_mode: {}, commands: {}, upstream_receipts: {}
    };
    const modules = host.snapshot(context);
    assert.equal(modules["commander-worker-menu"].view_model.groups[0].roles.length, 1);
    assert.equal(modules["site-analyzer"].view_model.status, "BOUND_WAITING_UPSTREAM_RECEIPTS");
    assert.deepEqual(modules["site-analyzer"].view_model.missing_upstream_receipts, ["A3", "A4", "A5", "A6", "B1"]);
    await host.handleAction("commander-worker-menu", "SELECT_GROUP", { group_id: "GROUP-01" }, context);
    await host.handleAction("site-analyzer", "REGISTER_SITE", { url: "https://example.com" }, context);
    assert.deepEqual(calls.map(item => item.module + ":" + item.action), ["B1:SELECT_GROUP", "V2:REGISTER_SITE"]);
    await assert.rejects(() => host.handleAction("site-analyzer", "ARBITRARY_SHELL", {}, context), /V2_ACTION_NOT_ALLOWED/);
    process.stdout.write("YOLLA_V6_RUNTIME_MODULES_PASS\n");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
