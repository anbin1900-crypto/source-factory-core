/* eslint-env node */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function cleanText(value, maxLength = 50000) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, maxLength);
}
function ensureDir(directory) { fs.mkdirSync(directory, { recursive: true }); }
function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, filePath);
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function chatGptConversationKey(value) {
  const match = String(value || "").match(/https:\/\/chatgpt\.com\/(?:g\/[^/]+\/)?c\/([A-Za-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : null;
}
function buildDispatchToken(namespace, seed) {
  const basis = `${cleanText(namespace, 40)}|${cleanText(seed, 2000)}`;
  return `${cleanText(namespace, 40).toUpperCase()}-${crypto.createHash("sha256").update(basis, "utf8").digest("hex").slice(0, 40)}`;
}

class ChatGptDispatcher {
  constructor(deps) {
    if (!deps || typeof deps.getWorkerView !== "function") throw new TypeError("getWorkerView required");
    if (typeof deps.navigateWorker !== "function") throw new TypeError("navigateWorker required");
    if (typeof deps.getRole !== "function") throw new TypeError("getRole required");
    if (!deps.stateRoot) throw new TypeError("stateRoot required");
    this.deps = deps;
    this.tail = Promise.resolve();
    this.activeRoles = new Set();
    this.receiptRoot = path.join(deps.stateRoot, "dispatch-receipts");
  }

  log(event, details = {}) {
    if (typeof this.deps.appendLog === "function") this.deps.appendLog(`DISPATCH_${event}`, details);
  }

  view() {
    const view = this.deps.getWorkerView();
    if (!view || !view.webContents || view.webContents.isDestroyed()) throw new Error("WORKER_BROWSER_UNAVAILABLE");
    return view;
  }

  async waitForDocument(targetUrl, timeoutMs = 45000) {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
      try {
        last = await this.view().webContents.executeJavaScript(`(() => ({
          href: location.href,
          readyState: document.readyState,
          hasPrompt: Boolean(
            document.querySelector('#prompt-textarea') ||
            document.querySelector('textarea[data-testid="prompt-textarea"]') ||
            document.querySelector('[contenteditable="true"][data-testid="prompt-textarea"]') ||
            document.querySelector('form textarea') ||
            document.querySelector('form [contenteditable="true"]')
          )
        }))()`, true);
      } catch (error) {
        last = { evaluation_error: String(error && error.message || error) };
      }
      const targetKey = chatGptConversationKey(targetUrl);
      const observedKey = last && chatGptConversationKey(last.href);
      if (last && last.readyState === "complete" && last.hasPrompt === true && /^https:\/\/chatgpt\.com\//i.test(String(last.href || "")) && (!targetKey || targetKey === observedKey)) return last;
      await delay(500);
    }
    const error = new Error("CHATGPT_DOCUMENT_READY_TIMEOUT");
    error.last_document_state = last;
    throw error;
  }

  async assistantSnapshot(dispatchToken = "") {
    const script = `(() => {
      const dispatchToken = ${JSON.stringify(dispatchToken)};
      const unique = nodes => Array.from(new Set(nodes));
      const textOf = node => (node && (node.innerText || node.textContent) || '').trim();
      const userNodes = unique(Array.from(document.querySelectorAll('[data-message-author-role="user"],[data-author="user"]')));
      const assistantNodes = unique(Array.from(document.querySelectorAll('[data-message-author-role="assistant"],[data-author="assistant"]')));
      const main = document.querySelector('main') || document.body;
      const stopVisible = Boolean(
        document.querySelector('button[data-testid="stop-button"]') ||
        document.querySelector('button[aria-label*="Stop"]') ||
        document.querySelector('button[aria-label*="중지"]')
      );
      return {
        stop_visible: stopVisible,
        dispatch_token_observed: Boolean(dispatchToken && (userNodes.some(node => textOf(node).includes(dispatchToken)) || textOf(main).includes(dispatchToken))),
        assistant_count: assistantNodes.length,
        user_count: userNodes.length
      };
    })()`;
    return this.view().webContents.executeJavaScript(script, true);
  }

  async waitForIdle(timeoutMs = 900000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const snapshot = await this.assistantSnapshot();
      if (!snapshot.stop_visible) return snapshot;
      await delay(750);
    }
    const error = new Error("CHATGPT_ACTIVE_RESPONSE_IDLE_TIMEOUT");
    error.definitely_not_sent = true;
    throw error;
  }

  async inject(prompt, expectedMarker, dispatchToken) {
    const token = cleanText(dispatchToken, 500) || buildDispatchToken("YOLLA", `${expectedMarker}|${prompt}`);
    const tokenLine = `YOLLA_DISPATCH_TOKEN=${token}`;
    const promptWithToken = String(prompt || "").includes(tokenLine) ? String(prompt || "") : `${String(prompt || "").trim()}\n\n${tokenLine}`;
    const script = `(async () => {
      const prompt = ${JSON.stringify(promptWithToken)};
      const expectedMarker = ${JSON.stringify(cleanText(expectedMarker, 500))};
      const dispatchToken = ${JSON.stringify(token)};
      const textOf = node => (node && (node.innerText || node.textContent) || '').trim();
      const unique = nodes => Array.from(new Set(nodes));
      const userNodes = () => unique(Array.from(document.querySelectorAll('[data-message-author-role="user"],[data-author="user"]')));
      const findInput = () =>
        document.querySelector('#prompt-textarea') ||
        document.querySelector('textarea[data-testid="prompt-textarea"]') ||
        document.querySelector('[contenteditable="true"][data-testid="prompt-textarea"]') ||
        document.querySelector('form textarea') ||
        document.querySelector('form [contenteditable="true"]') ||
        document.querySelector('div[contenteditable="true"]');
      const inputText = input => !input ? '' : input.tagName === 'TEXTAREA' ? String(input.value || '') : textOf(input);
      const observedToken = () => {
        const direct = userNodes().map(textOf).find(value => value.includes(dispatchToken));
        if (direct) return { observed:true, text:direct, source:'USER_NODE' };
        const input = findInput();
        const mainText = textOf(document.querySelector('main') || document.body);
        if (!inputText(input).includes(dispatchToken) && mainText.includes(dispatchToken)) return { observed:true, text:mainText, source:'MAIN_TEXT' };
        return { observed:false, text:'', source:null };
      };
      const existing = observedToken();
      const userBefore = userNodes().length;
      if (existing.observed) return { ok:true, method:'ALREADY_PRESENT', prompt_sent:true, dispatch_proof:true, exact_dispatch_token_observed:true, expected_marker_observed:!expectedMarker || existing.text.includes(expectedMarker), already_present:true, execution_delta:0, proof_source:existing.source };
      if (document.querySelector('button[data-testid="stop-button"],button[aria-label*="Stop"],button[aria-label*="중지"]')) return { ok:false, reason:'CHATGPT_RESPONSE_ALREADY_RUNNING', definitely_not_sent:true };
      const input = findInput();
      if (!input) return { ok:false, reason:'PROMPT_INPUT_NOT_FOUND', definitely_not_sent:true };
      input.focus();
      if (input.tagName === 'TEXTAREA') {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        if (descriptor && descriptor.set) descriptor.set.call(input, prompt); else input.value = prompt;
        input.dispatchEvent(new Event('input', { bubbles:true }));
        input.dispatchEvent(new Event('change', { bubbles:true }));
      } else {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(input);
        selection.removeAllRanges(); selection.addRange(range);
        document.execCommand('delete', false, null);
        if (!document.execCommand('insertText', false, prompt)) {
          input.textContent = prompt;
          input.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:prompt }));
        }
      }
      const inputDeadline = Date.now() + 8000;
      while (Date.now() < inputDeadline && !inputText(input).includes(dispatchToken)) await new Promise(resolve => setTimeout(resolve, 200));
      if (!inputText(input).includes(dispatchToken)) return { ok:false, reason:'PROMPT_INPUT_VALUE_NOT_APPLIED', definitely_not_sent:true };
      const selectors = [
        'button[data-testid="send-button"]',
        'button[data-testid="composer-submit-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label*="Send message"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="보내기"]',
        'button[aria-label*="보내"]',
        'form button[type="submit"]'
      ];
      const findSend = () => selectors.map(selector => document.querySelector(selector)).find(button => button && !button.matches('[data-testid="stop-button"]')) || null;
      const sendDeadline = Date.now() + 12000;
      let send = null;
      while (Date.now() < sendDeadline) {
        send = findSend();
        if (send && !send.disabled && send.getAttribute('aria-disabled') !== 'true') break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      let method = null;
      if (send && !send.disabled && send.getAttribute('aria-disabled') !== 'true') { send.click(); method = 'SEND_BUTTON'; }
      else {
        const form = input.closest('form');
        if (form && typeof form.requestSubmit === 'function') { try { form.requestSubmit(); method = 'FORM_REQUEST_SUBMIT'; } catch (_error) {} }
        if (!method) return { ok:false, reason:'SEND_CONTROL_NOT_AVAILABLE', definitely_not_sent:true };
      }
      const verifyDeadline = Date.now() + 45000;
      while (Date.now() < verifyDeadline) {
        const observed = observedToken();
        if (observed.observed) return { ok:true, method, prompt_sent:true, dispatch_proof:true, exact_dispatch_token_observed:true, expected_marker_observed:!expectedMarker || observed.text.includes(expectedMarker), already_present:false, execution_delta:1, user_message_delta:userNodes().length-userBefore, proof_source:observed.source };
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      return { ok:false, reason:'DISPATCH_TOKEN_NOT_OBSERVED', definitely_not_sent:false, dispatch_uncertain:true, method, dispatch_token:dispatchToken };
    })()`;
    const result = await this.view().webContents.executeJavaScript(script, true);
    if (!result || result.ok !== true) {
      const error = new Error(`CHATGPT_PROMPT_INJECTION_FAILED:${result && result.reason || "UNKNOWN"}`);
      error.definitely_not_sent = Boolean(result && result.definitely_not_sent);
      error.dispatch_uncertain = Boolean(result && result.dispatch_uncertain) || !error.definitely_not_sent;
      error.dispatch_token = token;
      error.injection_result = result || null;
      throw error;
    }
    return { ...result, dispatch_token: token };
  }

  dispatch(request) {
    const run = async () => {
      const roleId = cleanText(request && request.role_id, 100).toUpperCase();
      const role = this.deps.getRole(roleId);
      if (!role) throw new Error(`ROLE_NOT_FOUND:${roleId}`);
      const contextUrl = cleanText(role.context_url || role.last_url || role.project_url, 3000);
      if (!/^https:\/\/chatgpt\.com\//i.test(contextUrl)) throw new Error(`ROLE_CONTEXT_URL_REQUIRED:${roleId}`);
      const prompt = cleanText(request && request.prompt, 50000);
      if (!prompt) throw new Error("DISPATCH_PROMPT_REQUIRED");
      const dispatchId = cleanText(request && (request.dispatch_id || request.correlation_key), 200) || `dispatch-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      this.activeRoles.add(roleId);
      if (typeof this.deps.setRoleStatus === "function") this.deps.setRoleStatus(roleId, "DISPATCHING");
      try {
        await this.deps.navigateWorker(contextUrl, roleId);
        await this.waitForDocument(contextUrl);
        await this.waitForIdle();
        const injected = await this.inject(prompt, request && request.kind || "COMMAND", buildDispatchToken("V6", dispatchId));
        const receipt = {
          schema_version: "YOLLA_V6_CHATGPT_DISPATCH_RECEIPT_V1",
          accepted: true,
          role_id: roleId,
          kind: cleanText(request && request.kind || "COMMAND", 80),
          dispatch_id: dispatchId,
          context_url: contextUrl,
          prompt_sent: injected.prompt_sent === true,
          dispatch_proof: injected.dispatch_proof === true,
          dispatch_token: injected.dispatch_token,
          dispatched_at: new Date().toISOString(),
          metadata: request && request.metadata || {}
        };
        const receiptPath = path.join(this.receiptRoot, `${dispatchId.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
        writeJsonAtomic(receiptPath, receipt);
        receipt.receipt_pointer = receiptPath;
        if (typeof this.deps.setRoleStatus === "function") this.deps.setRoleStatus(roleId, "RESULT_WAITING");
        this.log("ACCEPTED", receipt);
        return receipt;
      } catch (error) {
        if (typeof this.deps.setRoleStatus === "function") this.deps.setRoleStatus(roleId, "ERROR");
        this.log("FAILED", { role_id: roleId, dispatch_id: dispatchId, error: String(error && error.stack || error) });
        throw error;
      } finally {
        this.activeRoles.delete(roleId);
      }
    };
    const queued = this.tail.then(run, run);
    this.tail = queued.catch(() => undefined);
    return queued;
  }

  releaseRole(roleId, reason) {
    const id = cleanText(roleId, 100).toUpperCase();
    this.activeRoles.delete(id);
    if (typeof this.deps.setRoleStatus === "function") this.deps.setRoleStatus(id, "IDLE");
    this.log("ROLE_RELEASED", { role_id: id, reason: cleanText(reason, 200) });
  }

  getActiveRoles() { return Array.from(this.activeRoles); }
}

module.exports = { ChatGptDispatcher, buildDispatchToken, chatGptConversationKey };
