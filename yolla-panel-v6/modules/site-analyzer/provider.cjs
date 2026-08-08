/* eslint-env node */
"use strict";

const ALLOWED = new Set(["REGISTER_SITE", "DELETE_SITE", "NAVIGATE_ANALYZER", "SELECT_SITE"]);

function getManifest() {
  return {
    schema_version: "YOLLA_V6_MODULE_PROVIDER_MANIFEST_V1",
    module_id: "site-analyzer",
    owner: "V-2",
    version: "1.0.0",
    mount_slots: ["TOPBAR_ANALYZER_ACTIONS", "ANALYZER_SIDEBAR", "ANALYZER_DRAWER", "ANALYZER_STATUS"],
    allowed_actions: Array.from(ALLOWED)
  };
}

function receiptStatus(receipts) {
  const required = ["A3", "A4", "A5", "A6", "B1"];
  const missing = required.filter(key => !receipts || !receipts[key]);
  return { missing, status: missing.length ? "BOUND_WAITING_UPSTREAM_RECEIPTS" : "READY" };
}

function getViewModel(context = {}) {
  const sites = Object.values(context.sites || {}).sort((a, b) => String(a.display_name || "").localeCompare(String(b.display_name || "")));
  const receipts = receiptStatus(context.upstream_receipts || {});
  return {
    schema_version: "SITE_ANALYZER_VIEW_MODEL_V1",
    module_id: "site-analyzer",
    current_url: context.browser && context.browser.url || "https://www.google.com",
    selected_site_id: context.selected_site_id || null,
    sites,
    status: receipts.status,
    missing_upstream_receipts: receipts.missing,
    slots: {
      ANALYZER_STATUS: { kind: "status", text: receipts.missing.length ? `V-2 Provider 연결 · 선행 Receipt ${receipts.missing.join(", ")} 대기` : "V-2 분석기 Provider 준비" },
      TOPBAR_ANALYZER_ACTIONS: { kind: "actions", actions: [{ action: "REGISTER_SITE", label: "현재 사이트 등록" }] }
    }
  };
}

function getStatus(context = {}) {
  const receipts = receiptStatus(context.upstream_receipts || {});
  return { schema_version: "ANALYZER_STATUS_V1", status: receipts.status, owner: "V-2", missing_upstream_receipts: receipts.missing, site_count: Object.keys(context.sites || {}).length };
}

async function handleAction(request, host) {
  const action = String(request && request.action || "").toUpperCase();
  if (!ALLOWED.has(action)) throw new Error(`V2_ACTION_NOT_ALLOWED:${action}`);
  return host.perform(action, request && request.payload || {});
}

module.exports = { getManifest, getViewModel, getStatus, handleAction };
