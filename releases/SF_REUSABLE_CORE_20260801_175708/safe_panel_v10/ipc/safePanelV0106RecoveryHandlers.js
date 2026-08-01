/* eslint-env node */
"use strict";

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const vm = require("vm");

const SAFE_PANEL_V0106_IPC_CHANNELS = Object.freeze({
  status: "sf:safe-panel:status",
  intakeTextarea: "sf:safe-panel:intake-textarea",
  intakeClipboard: "sf:safe-panel:intake-clipboard",
  runGate: "sf:safe-panel:run-gate",
  materialize: "sf:safe-panel:materialize",
  syntaxCheck: "sf:safe-panel:syntax-check",
  openLatestGenerated: "sf:safe-panel:open-latest-generated"
});

const SOURCE_FILE_MARKERS = Object.freeze({
  start: "=== SOURCE_FILE_START ===",
  contentStart: "=== CONTENT_START ===",
  contentEnd: "=== CONTENT_END ===",
  end: "=== SOURCE_FILE_END ==="
});

const REQUIRED_SOURCE_FIELDS = [
  "path",
  "language",
  "purpose",
  "operation",
  "owner_worker",
  "target_stage"
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asObject(value) {
  return isPlainObject(value) ? value : {};
}

function normalizeText(value, fallback) {
  if (value === undefined || value === null) return fallback || "";
  const text = String(value).trim();
  return text || fallback || "";
}

function pickRawTextFromPayload(payload) {
  const safePayload = asObject(payload);
  const candidates = [
    safePayload.rawText,
    safePayload.text,
    safePayload.sourceText,
    safePayload.content
  ];

  for (let index = 0; index < candidates.length; index += 1) {
    const value = candidates[index];
    if (value !== undefined && value !== null && String(value).length > 0) {
      return String(value);
    }
  }

  return "";
}

function createError(message, details) {
  const error = { message: normalizeText(message, "SAFE Panel recovery handler failed.") };
  if (details !== undefined) error.details = details;
  return error;
}

function failureResponse(shape, message, details) {
  return Object.assign({}, shape, {
    ok: false,
    error: createError(message, details)
  });
}

function normalizeThrownError(error) {
  if (!error) return createError("Unknown error.");
  if (typeof error === "string") return createError(error);
  if (typeof error.message === "string" && error.message.trim()) return createError(error.message);
  return createError(String(error));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function createDefaultState() {
  return {
    intakes: {},
    gates: {},
    latest: {
      intake_id: null,
      intake_status: null,
      gate_report_path: null,
      gate_status: null,
      output_dir: null,
      materialize_report_path: null,
      syntax_report_path: null,
      syntax_status: null,
      clipboard_status: null,
      clipboard_auto_status: null,
      clipboard_text_length: 0,
      current_run_id: null,
      current_session_id: null
    },
    clipboard: {
      last_auto_fingerprint: null,
      last_auto_intake_id: null,
      last_auto_text_length: 0
    }
  };
}

function ensureState(context) {
  if (!isPlainObject(context.state)) context.state = createDefaultState();
  if (!isPlainObject(context.state.intakes)) context.state.intakes = {};
  if (!isPlainObject(context.state.gates)) context.state.gates = {};
  if (!isPlainObject(context.state.latest)) context.state.latest = createDefaultState().latest;
  if (!isPlainObject(context.state.clipboard)) context.state.clipboard = createDefaultState().clipboard;

  const defaults = createDefaultState().latest;
  Object.keys(defaults).forEach(function ensureLatestKey(key) {
    if (!Object.prototype.hasOwnProperty.call(context.state.latest, key)) {
      context.state.latest[key] = defaults[key];
    }
  });

  return context.state;
}

function createContext(deps) {
  const safeDeps = asObject(deps);
  const sourceFactoryRoot = normalizeText(safeDeps.sourceFactoryRoot, "") || path.join("D:", "SOURCE FACTORY");
  const defaultLogRoot = path.join(sourceFactoryRoot, "_STAGE4_LOGS", "safe_panel_v0106");
  return {
    ipcMain: safeDeps.ipcMain,
    shell: safeDeps.shell,
    clipboard: safeDeps.clipboard,
    helpers: asObject(safeDeps.helpers),
    state: safeDeps.state || createDefaultState(),
    sourceFactoryRoot,
    reportRoot: normalizeText(safeDeps.reportRoot || safeDeps.reportsRoot, "") || path.join(defaultLogRoot, "reports"),
    generatedRoot: normalizeText(safeDeps.generatedRoot, "") || path.join(sourceFactoryRoot, "generated"),
    logger: safeDeps.logger || console
  };
}

function callOptionalHelper(context, name, payload) {
  const helper = context.helpers && context.helpers[name];
  if (typeof helper !== "function") return null;
  return helper(payload, context);
}

function normalizeNewlines(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function makeTextFingerprint(text) {
  const source = String(text || "");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return [source.length, (hash >>> 0).toString(16)].join(":");
}

function parseHeader(lines) {
  const header = {};
  lines.forEach(function parseHeaderLine(line) {
    const match = String(line).match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (match) header[match[1].trim()] = match[2].trim();
  });
  return header;
}

function parseSourceFileBlocks(rawText) {
  const text = normalizeNewlines(rawText);
  const lines = text.split("\n");
  const units = [];
  let index = 0;
  let unitIndex = 0;

  while (index < lines.length) {
    if (lines[index].trim() !== SOURCE_FILE_MARKERS.start) {
      index += 1;
      continue;
    }

    unitIndex += 1;
    index += 1;

    const headerLines = [];
    while (index < lines.length && lines[index].trim() !== SOURCE_FILE_MARKERS.contentStart) {
      headerLines.push(lines[index]);
      index += 1;
    }

    const header = parseHeader(headerLines);
    const errors = [];

    REQUIRED_SOURCE_FIELDS.forEach(function checkField(field) {
      if (!normalizeText(header[field], "")) errors.push("missing_" + field);
    });

    if (index >= lines.length || lines[index].trim() !== SOURCE_FILE_MARKERS.contentStart) {
      errors.push("missing_CONTENT_START");
    } else {
      index += 1;
    }

    const contentLines = [];
    while (index < lines.length && lines[index].trim() !== SOURCE_FILE_MARKERS.contentEnd) {
      contentLines.push(lines[index]);
      index += 1;
    }

    if (index >= lines.length || lines[index].trim() !== SOURCE_FILE_MARKERS.contentEnd) {
      errors.push("missing_CONTENT_END");
    } else {
      index += 1;
    }

    while (index < lines.length && lines[index].trim() === "") index += 1;

    if (index >= lines.length || lines[index].trim() !== SOURCE_FILE_MARKERS.end) {
      errors.push("missing_SOURCE_FILE_END");
    } else {
      index += 1;
    }

    const content = contentLines.join("\n");
    if (!content.trim()) errors.push("empty_content");

    units.push({
      index: unitIndex,
      path: normalizeText(header.path, ""),
      language: normalizeText(header.language, ""),
      purpose: normalizeText(header.purpose, ""),
      operation: normalizeText(header.operation, ""),
      owner_worker: normalizeText(header.owner_worker, ""),
      target_stage: normalizeText(header.target_stage, ""),
      content,
      content_length: content.length,
      status: errors.length === 0 ? "GREEN" : "RED",
      reason: errors.length === 0 ? "source_file_block_valid" : errors.join(", ")
    });
  }

  return units;
}

function makeRunId(prefix) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return [prefix || "safe_panel", stamp, Math.floor(Math.random() * 1000000)].join("_");
}

function makeIntakeId(sourceLabel) {
  return makeRunId(normalizeText(sourceLabel, "intake"));
}

function createIntake(rawText, sourceLabel, payload, context) {
  const text = String(rawText || "");
  const units = parseSourceFileBlocks(text);
  const validUnits = units.filter(function isValid(unit) {
    return unit.status !== "RED";
  });
  const intakeId = makeIntakeId(sourceLabel);
  return {
    intake_id: intakeId,
    source: sourceLabel,
    raw_text_length: text.length,
    source_file_count: units.length,
    valid_source_file_count: validUnits.length,
    worker_report_found: /WORKER_REPORT_START/.test(text),
    current_run_id: normalizeText(payload.current_run_id, "") || intakeId,
    current_session_id: normalizeText(payload.current_session_id, "") || null,
    units,
    rawText: text
  };
}

function clearDownstreamLatest(state) {
  state.latest.gate_report_path = null;
  state.latest.gate_status = null;
  state.latest.output_dir = null;
  state.latest.materialize_report_path = null;
  state.latest.syntax_report_path = null;
  state.latest.syntax_status = null;
}

function commitSuccessfulIntake(intake, context) {
  const state = ensureState(context);
  state.intakes[intake.intake_id] = intake;
  state.latest.intake_id = intake.intake_id;
  state.latest.intake_status = "GREEN";
  state.latest.current_run_id = intake.current_run_id;
  state.latest.current_session_id = intake.current_session_id;
  if (intake.source === "clipboard") {
    state.latest.clipboard_status = "GREEN";
    state.latest.clipboard_text_length = Number(intake.raw_text_length || 0);
  }
  clearDownstreamLatest(state);
}

function markFailedIntake(sourceLabel, payload, context) {
  const state = ensureState(context);
  state.latest.intake_id = null;
  state.latest.intake_status = "RED";
  state.latest.current_run_id = normalizeText(payload.current_run_id, "") || makeRunId(sourceLabel || "intake_failed");
  state.latest.current_session_id = normalizeText(payload.current_session_id, "") || null;
  if (sourceLabel === "clipboard") {
    state.latest.clipboard_status = "RED";
    state.latest.clipboard_text_length = 0;
  }
  clearDownstreamLatest(state);
}

function markFailedGate(payload, context, reportPath) {
  const state = ensureState(context);
  state.latest.gate_report_path = reportPath || null;
  state.latest.gate_status = "RED";
  state.latest.output_dir = null;
  state.latest.materialize_report_path = null;
  state.latest.syntax_report_path = null;
  state.latest.current_run_id = normalizeText(payload.current_run_id, "") || state.latest.current_run_id || makeRunId("gate_failed");
  state.latest.current_session_id = normalizeText(payload.current_session_id, "") || state.latest.current_session_id || null;
}

function clearMaterializeAndSyntax(context) {
  const state = ensureState(context);
  state.latest.output_dir = null;
  state.latest.materialize_report_path = null;
  state.latest.syntax_report_path = null;
  state.latest.syntax_status = null;
}

function getFailureShapeForStatus() {
  return {
    status: "error",
    lights: {
      intake: "red",
      gate: "off",
      materialize: "off",
      syntax: "off",
      latest_generated: "off"
    },
    latest: createDefaultState().latest
  };
}

async function handleSafePanelStatus(payload, context) {
  try {
    const helperResult = await callOptionalHelper(context, "status", payload);
    if (helperResult) return helperResult;

    const state = ensureState(context);
    const intakeLight = state.latest.intake_status === "RED" ? "red" : (state.latest.intake_id ? "green" : "off");
    const gateLight = state.latest.gate_status === "RED" ? "red" : (state.latest.gate_status === "GREEN" || state.latest.gate_report_path ? "green" : "off");
    const syntaxStatus = String(state.latest.syntax_status || "").toUpperCase();
    const syntaxLight = syntaxStatus === "RED" ? "red" : (syntaxStatus === "GREEN" || state.latest.syntax_report_path ? "green" : "off");
    const clipboardStatus = String(state.latest.clipboard_status || "").toUpperCase();
    const clipboardLight = clipboardStatus === "RED" ? "red" : (clipboardStatus === "GREEN" ? "green" : "off");
    const status = syntaxStatus === "RED"
      ? "syntax_failed"
      : state.latest.output_dir
        ? "materialized"
        : state.latest.gate_status === "RED"
          ? "gate_failed"
          : state.latest.gate_report_path
            ? "gate_ready"
            : state.latest.intake_status === "RED"
              ? "intake_failed"
              : state.latest.intake_id
                ? "intake_ready"
                : "idle";

    return {
      ok: true,
      status,
      lights: {
        intake: intakeLight,
        clipboard: clipboardLight,
        gate: gateLight,
        materialize: state.latest.output_dir ? "green" : "off",
        syntax: syntaxLight,
        latest_generated: state.latest.output_dir ? "green" : "off"
      },
      latest: Object.assign({}, state.latest),
      error: null
    };
  } catch (error) {
    return failureResponse(getFailureShapeForStatus(), error);
  }
}

async function handleSafePanelIntakeTextarea(payload, context) {
  const safePayload = asObject(payload);
  try {
    const rawText = pickRawTextFromPayload(safePayload);
    if (!rawText.trim()) {
      markFailedIntake("textarea", safePayload, context);
      return failureResponse({ intake: null, source_file_count: 0, valid_source_file_count: 0 }, "Textarea is empty or SOURCE_FILE block is not found.");
    }

    const helperPayload = Object.assign({}, safePayload, { rawText });
    const helperResult = await callOptionalHelper(context, "intakeTextarea", helperPayload);
    if (helperResult) {
      if (helperResult.ok === false) markFailedIntake("textarea", safePayload, context);
      return helperResult;
    }

    const intake = createIntake(rawText, "textarea", helperPayload, context);
    if (intake.source_file_count === 0 || intake.valid_source_file_count === 0) {
      markFailedIntake("textarea", helperPayload, context);
      return failureResponse({ intake: null, source_file_count: intake.source_file_count, valid_source_file_count: intake.valid_source_file_count }, "Textarea is empty or SOURCE_FILE block is not found.");
    }

    commitSuccessfulIntake(intake, context);
    return {
      ok: true,
      intake,
      source_file_count: intake.source_file_count,
      valid_source_file_count: intake.valid_source_file_count,
      error: null
    };
  } catch (error) {
    markFailedIntake("textarea", safePayload, context);
    return failureResponse({ intake: null, source_file_count: 0, valid_source_file_count: 0 }, error);
  }
}

async function handleSafePanelIntakeClipboard(payload, context) {
  const safePayload = asObject(payload);
  const autoWatch = safePayload.auto_watch === true || safePayload.autoWatch === true || safePayload.action === "clipboard_auto_watch";
  const silentIfNoSource = autoWatch || safePayload.silent_if_no_source === true || safePayload.silentIfNoSource === true;

  try {
    let rawText = pickRawTextFromPayload(safePayload);
    if (!rawText && context.clipboard && typeof context.clipboard.readText === "function") {
      rawText = String(context.clipboard.readText() || "");
    }

    const helperPayload = Object.assign({}, safePayload, { rawText });
    const helperResult = await callOptionalHelper(context, "intakeClipboard", helperPayload);
    if (helperResult) {
      if (helperResult.ok === false && !silentIfNoSource) markFailedIntake("clipboard", safePayload, context);
      return helperResult;
    }

    if (!rawText.trim()) {
      if (silentIfNoSource) {
        return {
          ok: false,
          skipped: true,
          ignored: true,
          reason: "clipboard_empty",
          raw_text_length: 0,
          source_file_count: 0,
          valid_source_file_count: 0,
          error: null
        };
      }
      markFailedIntake("clipboard", safePayload, context);
      return failureResponse({ intake: null, raw_text_length: 0, source_file_count: 0, valid_source_file_count: 0 }, "Clipboard is empty or SOURCE_FILE block is not found.");
    }

    const intake = createIntake(rawText, "clipboard", helperPayload, context);
    if (intake.source_file_count === 0 || intake.valid_source_file_count === 0) {
      if (silentIfNoSource) {
        return {
          ok: false,
          skipped: true,
          ignored: true,
          reason: "source_file_block_not_found",
          raw_text_length: rawText.length,
          source_file_count: intake.source_file_count,
          valid_source_file_count: intake.valid_source_file_count,
          error: null
        };
      }
      markFailedIntake("clipboard", helperPayload, context);
      return failureResponse({ intake: null, raw_text_length: rawText.length, source_file_count: intake.source_file_count, valid_source_file_count: intake.valid_source_file_count }, "Clipboard is empty or SOURCE_FILE block is not found.");
    }

    const state = ensureState(context);
    const fingerprint = makeTextFingerprint(rawText);
    if (autoWatch && state.clipboard.last_auto_fingerprint === fingerprint) {
      return {
        ok: true,
        skipped: true,
        ignored: true,
        reason: "clipboard_unchanged",
        raw_text_length: rawText.length,
        source_file_count: intake.source_file_count,
        valid_source_file_count: intake.valid_source_file_count,
        current_run_id: state.clipboard.last_auto_intake_id || state.latest.current_run_id || null,
        error: null
      };
    }

    commitSuccessfulIntake(intake, context);
    state.latest.clipboard_status = "GREEN";
    state.latest.clipboard_auto_status = autoWatch ? "GREEN" : state.latest.clipboard_auto_status;
    state.latest.clipboard_text_length = rawText.length;

    if (autoWatch) {
      state.clipboard.last_auto_fingerprint = fingerprint;
      state.clipboard.last_auto_intake_id = intake.intake_id;
      state.clipboard.last_auto_text_length = rawText.length;
    }

    return {
      ok: true,
      intake,
      auto_watch: autoWatch,
      raw_text_length: rawText.length,
      source_file_count: intake.source_file_count,
      valid_source_file_count: intake.valid_source_file_count,
      error: null
    };
  } catch (error) {
    if (!silentIfNoSource) markFailedIntake("clipboard", safePayload, context);
    return failureResponse({ intake: null, raw_text_length: 0, source_file_count: 0, valid_source_file_count: 0 }, error);
  }
}

function getIntakeText(payload, context) {
  const safePayload = asObject(payload);
  const directText = pickRawTextFromPayload(safePayload);
  if (directText) return directText;

  const state = ensureState(context);
  const intakeId = normalizeText(safePayload.intake_id || state.latest.intake_id, "");
  if (intakeId && state.intakes[intakeId]) {
    return String(state.intakes[intakeId].rawText || "");
  }

  return "";
}

function getLatestIntake(context) {
  const state = ensureState(context);
  const intakeId = state.latest.intake_id;
  return intakeId && state.intakes[intakeId] ? state.intakes[intakeId] : null;
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function readJsonIfPossible(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
  }
}

async function handleSafePanelRunGate(payload, context) {
  const safePayload = asObject(payload);
  const emptySummary = { total: 0, green: 0, yellow: 0, red: 1, black: 0 };

  try {
    const helperResult = await callOptionalHelper(context, "runGate", safePayload);
    if (helperResult) {
      const state = ensureState(context);
      if (helperResult.report_path) state.latest.gate_report_path = helperResult.report_path;
      state.latest.gate_status = String(helperResult.gate_status || (helperResult.ok ? "GREEN" : "RED")).toUpperCase();
      if (state.latest.gate_status === "RED") clearMaterializeAndSyntax(context);
      return helperResult;
    }

    const rawText = getIntakeText(safePayload, context);
    if (!rawText.trim()) {
      markFailedGate(safePayload, context, null);
      return failureResponse({ gate_status: "RED", report_path: null, source_file_count: 0, valid_source_file_count: 0, units: [], summary: emptySummary }, "Gate input is empty or invalid.");
    }

    const units = parseSourceFileBlocks(rawText);
    const sourceFileCount = units.length;
    const validUnits = units.filter(function isValid(unit) { return unit.status !== "RED"; });
    const redCount = units.filter(function isRed(unit) { return unit.status === "RED"; }).length;
    const gateStatus = sourceFileCount > 0 && redCount === 0 ? "GREEN" : "RED";
    const latestIntake = getLatestIntake(context);
    const currentRunId = normalizeText(safePayload.current_run_id, "") || (latestIntake && latestIntake.current_run_id) || ensureState(context).latest.current_run_id || makeRunId("gate");
    const currentSessionId = normalizeText(safePayload.current_session_id, "") || (latestIntake && latestIntake.current_session_id) || ensureState(context).latest.current_session_id || null;
    const summary = {
      total: sourceFileCount,
      green: gateStatus === "GREEN" ? validUnits.length : 0,
      yellow: 0,
      red: redCount || (sourceFileCount === 0 ? 1 : 0),
      black: 0
    };

    const report = {
      report_type: "gate",
      ok: gateStatus !== "RED",
      gate_status: gateStatus,
      source_file_count: sourceFileCount,
      valid_source_file_count: validUnits.length,
      units,
      summary,
      current_run_id: currentRunId,
      current_session_id: currentSessionId,
      created_at: new Date().toISOString(),
      error: gateStatus === "RED" ? createError("Gate input is empty or invalid.") : null
    };

    ensureDir(context.reportRoot);
    const reportPath = path.join(context.reportRoot, currentRunId + "_gate_report.json");
    writeJson(reportPath, report);

    const state = ensureState(context);
    state.gates[reportPath] = report;
    state.latest.gate_report_path = reportPath;
    state.latest.gate_status = gateStatus;
    state.latest.current_run_id = currentRunId;
    state.latest.current_session_id = currentSessionId;
    if (gateStatus === "RED") {
      state.latest.output_dir = null;
      state.latest.materialize_report_path = null;
      state.latest.syntax_report_path = null;
    }

    return Object.assign({}, report, { report_path: reportPath });
  } catch (error) {
    markFailedGate(safePayload, context, null);
    return failureResponse({ gate_status: "RED", report_path: null, source_file_count: 0, valid_source_file_count: 0, units: [], summary: emptySummary }, error);
  }
}

function isSyntaxFailureReport(report) {
  if (!isPlainObject(report)) return false;
  return report.report_type === "syntax" || report.syntax_failed === true || (Array.isArray(report.failures) && report.failures.length > 0 && Number(report.source_file_count || 0) === 0);
}

function isValidGateReport(report) {
  if (!isPlainObject(report)) return false;
  if (isSyntaxFailureReport(report)) return false;
  if (String(report.report_type || "gate").toLowerCase() !== "gate") return false;
  if (Number(report.source_file_count || 0) <= 0) return false;
  if (Number(report.valid_source_file_count || 0) <= 0) return false;
  if (String(report.gate_status || "").toUpperCase() === "RED") return false;
  return true;
}

function collectJsonFiles(rootDir, maxDepth) {
  const files = [];
  const root = normalizeText(rootDir, "");
  if (!root || !fs.existsSync(root)) return files;

  function walk(currentDir, depth) {
    if (depth > maxDepth) return;

    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_error) {
      return;
    }

    entries.forEach(function visit(entry) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
        files.push(fullPath);
      }
    });
  }

  walk(root, 0);
  return files;
}

function selectLatestValidGateReport(options, context) {
  const safeOptions = asObject(options);
  const explicit = normalizeText(safeOptions.gate_report_path || safeOptions.report_path, "");
  if (explicit) {
    const explicitReport = readJsonIfPossible(explicit);
    if (isValidGateReport(explicitReport)) return Object.assign({}, explicitReport, { report_path: explicit });
    return null;
  }

  const state = ensureState(context);

  if (state.latest.gate_report_path) {
    const stateReport = state.gates[state.latest.gate_report_path] || readJsonIfPossible(state.latest.gate_report_path);
    if (isValidGateReport(stateReport)) {
      return Object.assign({}, stateReport, { report_path: state.latest.gate_report_path });
    }
    return null;
  }

  const runId = normalizeText(safeOptions.current_run_id || state.latest.current_run_id, "");
  const sessionId = normalizeText(safeOptions.current_session_id || state.latest.current_session_id, "");
  const allowPreviousFallback = safeOptions.allow_previous_gate_fallback === true || safeOptions.allowPreviousGateFallback === true;

  const reportRoot = normalizeText(safeOptions.report_root || context.reportRoot, "");
  let candidates = collectJsonFiles(reportRoot, 5)
    .map(function toCandidate(filePath) {
      const report = readJsonIfPossible(filePath);
      if (!isValidGateReport(report)) return null;
      const stat = fs.statSync(filePath);
      return Object.assign({}, report, {
        report_path: filePath,
        mtime: new Date(stat.mtimeMs).toISOString(),
        mtimeMs: stat.mtimeMs
      });
    })
    .filter(Boolean);

  if (candidates.length === 0) return null;

  if (runId) {
    const runMatches = candidates.filter(function matchRun(candidate) {
      return candidate.current_run_id === runId;
    });
    if (runMatches.length > 0) {
      candidates = runMatches;
    } else if (!allowPreviousFallback) {
      return null;
    }
  }

  if (sessionId) {
    const sessionMatches = candidates.filter(function matchSession(candidate) {
      return candidate.current_session_id === sessionId;
    });
    if (sessionMatches.length > 0) candidates = sessionMatches;
  }

  candidates.sort(function sortCandidates(left, right) {
    return right.mtimeMs - left.mtimeMs;
  });

  return candidates[0];
}

function sanitizeRelativePath(inputPath) {
  const raw = normalizeText(inputPath, "").replace(/\\/g, "/");
  const parts = raw.split("/").filter(function keep(part) {
    return part && part !== "." && part !== ".." && !/^[A-Za-z]:$/.test(part);
  });
  return parts.join("/");
}

function materializeUnits(units, outputDir) {
  const projectFilesDir = path.join(outputDir, "PROJECT_FILES");
  const filesWritten = [];
  ensureDir(projectFilesDir);

  units.forEach(function writeUnit(unit) {
    if (!unit || unit.status === "RED") return;
    const relativePath = sanitizeRelativePath(unit.path);
    if (!relativePath) return;
    const targetPath = path.join(projectFilesDir, relativePath);
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, String(unit.content || ""), "utf8");
    filesWritten.push({
      path: relativePath,
      absolute_path: targetPath,
      language: unit.language,
      operation: unit.operation,
      bytes: Buffer.byteLength(String(unit.content || ""), "utf8")
    });
  });

  return filesWritten;
}

async function handleSafePanelMaterialize(payload, context) {
  const safePayload = asObject(payload);
  try {
    const helperResult = await callOptionalHelper(context, "materialize", safePayload);
    if (helperResult) {
      const state = ensureState(context);
      if (helperResult.output_dir) {
        state.latest.output_dir = helperResult.output_dir;
        state.latest.materialize_report_path = helperResult.report_path || state.latest.materialize_report_path;
      }
      return helperResult;
    }

    const selectedGateReport = selectLatestValidGateReport(safePayload, context);
    if (!selectedGateReport) {
      clearMaterializeAndSyntax(context);
      return failureResponse({ output_dir: null, report_path: null, files_written: [], selected_gate_report: null }, "No valid current Gate report found for materialize. Previous GREEN Gate reports are not used unless explicitly allowed.");
    }

    const runId = normalizeText(selectedGateReport.current_run_id, "") || makeRunId("materialize");
    const outputDir = path.join(context.generatedRoot, runId + "_SAFE_PANEL_V0106_DIRECT_INTAKE");
    const filesWritten = materializeUnits(selectedGateReport.units || [], outputDir);

    const report = {
      report_type: "materialize",
      ok: filesWritten.length > 0,
      output_dir: outputDir,
      report_path: null,
      files_written: filesWritten,
      files_created: filesWritten.length,
      selected_gate_report: {
        report_path: selectedGateReport.report_path || null,
        source_file_count: selectedGateReport.source_file_count,
        valid_source_file_count: selectedGateReport.valid_source_file_count,
        current_run_id: selectedGateReport.current_run_id || null,
        current_session_id: selectedGateReport.current_session_id || null
      },
      created_at: new Date().toISOString(),
      error: filesWritten.length > 0 ? null : createError("No files were materialized from the selected Gate report.")
    };

    const reportPath = path.join(outputDir, "SAFE_PANEL_V0106_MATERIALIZE_REPORT.json");
    report.report_path = reportPath;
    writeJson(reportPath, report);

    const state = ensureState(context);
    if (report.ok) {
      state.latest.output_dir = outputDir;
      state.latest.materialize_report_path = reportPath;
      state.latest.syntax_report_path = null;
      state.latest.current_run_id = selectedGateReport.current_run_id || state.latest.current_run_id;
      state.latest.current_session_id = selectedGateReport.current_session_id || state.latest.current_session_id;
    }

    return report;
  } catch (error) {
    clearMaterializeAndSyntax(context);
    return failureResponse({ output_dir: null, report_path: null, files_written: [], selected_gate_report: null }, error);
  }
}

function collectFilesByExtension(rootDir, extensions) {
  const matches = [];
  const root = normalizeText(rootDir, "");
  if (!root || !fs.existsSync(root)) return matches;
  const lowerExtensions = extensions.map(function lower(ext) { return ext.toLowerCase(); });
  const maxFiles = 500;
  const maxDepth = 20;

  function walk(currentDir, depth) {
    if (matches.length >= maxFiles || depth > maxDepth) {
      return;
    }

    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_error) {
      return;
    }

    entries.forEach(function visit(entry) {
      if (matches.length >= maxFiles) {
        return;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && lowerExtensions.indexOf(path.extname(entry.name).toLowerCase()) >= 0) {
        matches.push(fullPath);
      }
    });
  }

  walk(root, 0);
  return matches;
}

function runInProcessJavaScriptSyntaxCheck(filePath) {
  try {
    const source = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    new vm.Script(source, {
      filename: filePath,
      displayErrors: true
    });

    return {
      path: filePath,
      ok: true,
      stdout: "",
      stderr: "",
      checker: "vm.Script",
      checked_at: new Date().toISOString()
    };
  } catch (error) {
    return {
      path: filePath,
      ok: false,
      stdout: "",
      stderr: String(error && (error.stack || error.message) || error),
      checker: "vm.Script",
      checked_at: new Date().toISOString()
    };
  }
}

async function handleSafePanelSyntaxCheck(payload, context) {
  const safePayload = asObject(payload);
  try {
    const helperResult = await callOptionalHelper(context, "syntaxCheck", safePayload);
    if (helperResult) {
      const stateForHelper = ensureState(context);
      if (helperResult.report_path) stateForHelper.latest.syntax_report_path = helperResult.report_path;
      stateForHelper.latest.syntax_status = String(helperResult.gate_status || (helperResult.ok === false ? "RED" : "GREEN")).toUpperCase();
      return helperResult;
    }

    const state = ensureState(context);
    const explicitOutput = normalizeText(safePayload.output_dir || safePayload.outputDir, "");
    const outputDir = explicitOutput || normalizeText(state.latest.output_dir, "");
    if (!outputDir || !fs.existsSync(outputDir)) {
      state.latest.syntax_report_path = null;
      state.latest.syntax_status = "RED";
      return failureResponse({ gate_status: "RED", report_path: null, checked_files: [], failures: [], failure_count: 0, status: "skipped" }, "Syntax Check output directory is missing.");
    }

    const projectFilesDir = fs.existsSync(path.join(outputDir, "PROJECT_FILES")) ? path.join(outputDir, "PROJECT_FILES") : outputDir;
    const jsFiles = collectFilesByExtension(projectFilesDir, [".js", ".mjs", ".cjs"]);
    const checkedFiles = [];
    const failures = [];

    jsFiles.forEach(function checkFile(filePath) {
      const item = runInProcessJavaScriptSyntaxCheck(filePath);
      checkedFiles.push(item);
      if (!item.ok) failures.push(item);
    });

    const report = {
      report_type: "syntax",
      ok: failures.length === 0,
      gate_status: failures.length === 0 ? "GREEN" : "RED",
      status: jsFiles.length === 0 ? "not_applicable" : "checked",
      output_dir: outputDir,
      report_path: null,
      checked_files: checkedFiles,
      checked_count: checkedFiles.length,
      failures,
      failure_count: failures.length,
      checker: "vm.Script",
      created_at: new Date().toISOString(),
      error: failures.length ? createError("Syntax Check found failures.") : null
    };

    const reportPath = path.join(outputDir, "SAFE_PANEL_V0106_SYNTAX_REPORT.json");
    report.report_path = reportPath;
    writeJson(reportPath, report);
    state.latest.syntax_report_path = reportPath;
    state.latest.syntax_status = report.gate_status;

    return report;
  } catch (error) {
    ensureState(context).latest.syntax_status = "RED";
    return failureResponse({ gate_status: "RED", report_path: null, checked_files: [], failures: [], failure_count: 0, status: "error" }, error);
  }
}

function selectLatestGeneratedDir(payload, context) {
  const safePayload = asObject(payload);
  const explicit = normalizeText(safePayload.output_dir || safePayload.outputDir, "");
  if (explicit && fs.existsSync(explicit)) {
    return {
      output_dir: explicit,
      selection: {
        mtime: new Date(fs.statSync(explicit).mtimeMs).toISOString(),
        current_run_id: normalizeText(safePayload.current_run_id, "") || null,
        current_session_id: normalizeText(safePayload.current_session_id, "") || null
      }
    };
  }

  const stateOutput = normalizeText(ensureState(context).latest.output_dir, "");
  if (stateOutput && fs.existsSync(stateOutput)) {
    return {
      output_dir: stateOutput,
      selection: {
        mtime: new Date(fs.statSync(stateOutput).mtimeMs).toISOString(),
        current_run_id: ensureState(context).latest.current_run_id || null,
        current_session_id: ensureState(context).latest.current_session_id || null
      }
    };
  }

  const generatedRoot = normalizeText(safePayload.generated_root || context.generatedRoot, "");
  if (!generatedRoot || !fs.existsSync(generatedRoot)) return null;

  const directories = [];
  function walk(currentDir, depth) {
    if (depth > 3) return;

    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_error) {
      return;
    }

    entries.forEach(function visit(entry) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        const stat = fs.statSync(fullPath);
        directories.push({ output_dir: fullPath, mtimeMs: stat.mtimeMs, mtime: new Date(stat.mtimeMs).toISOString() });
        walk(fullPath, depth + 1);
      }
    });
  }

  walk(generatedRoot, 0);
  directories.sort(function sortByMtime(left, right) {
    return right.mtimeMs - left.mtimeMs;
  });

  if (directories.length === 0) return null;

  return {
    output_dir: directories[0].output_dir,
    selection: {
      mtime: directories[0].mtime,
      current_run_id: normalizeText(safePayload.current_run_id, "") || null,
      current_session_id: normalizeText(safePayload.current_session_id, "") || null
    }
  };
}

async function handleSafePanelOpenLatestGenerated(payload, context) {
  try {
    const selection = selectLatestGeneratedDir(payload, context);
    if (!selection) {
      return failureResponse({ output_dir: null, opened: false, selection: null }, "Latest generated folder not found.");
    }

    if (!context.shell || typeof context.shell.openPath !== "function") {
      return failureResponse({ output_dir: selection.output_dir, opened: false, selection: selection.selection }, "Electron shell.openPath is not available.");
    }

    const openResult = await context.shell.openPath(selection.output_dir);
    if (openResult) {
      return failureResponse({ output_dir: selection.output_dir, opened: false, selection: selection.selection }, openResult);
    }

    return {
      ok: true,
      output_dir: selection.output_dir,
      opened: true,
      selection: selection.selection,
      error: null
    };
  } catch (error) {
    return failureResponse({ output_dir: null, opened: false, selection: null }, error);
  }
}

function registerHandler(ipcMain, channel, handler, context) {
  if (!channel || typeof channel !== "string") {
    throw new Error("SAFE Panel recovery IPC channel name must not be blank.");
  }

  ipcMain.handle(channel, async function safePanelRecoveryIpcHandler(_event, payload) {
    try {
      return await handler(payload, context);
    } catch (error) {
      return { ok: false, error: normalizeThrownError(error) };
    }
  });

  return { channel, registered: true };
}

function registerSafePanelV0106RecoveryIpcHandlers(deps) {
  const context = createContext(deps);
  if (!context.ipcMain || typeof context.ipcMain.handle !== "function") {
    throw new Error("registerSafePanelV0106RecoveryIpcHandlers requires ipcMain.handle.");
  }

  ensureDir(context.reportRoot);
  ensureDir(context.generatedRoot);

  return {
    ok: true,
    channels: Object.assign({}, SAFE_PANEL_V0106_IPC_CHANNELS),
    registrations: [
      registerHandler(context.ipcMain, SAFE_PANEL_V0106_IPC_CHANNELS.status, handleSafePanelStatus, context),
      registerHandler(context.ipcMain, SAFE_PANEL_V0106_IPC_CHANNELS.intakeTextarea, handleSafePanelIntakeTextarea, context),
      registerHandler(context.ipcMain, SAFE_PANEL_V0106_IPC_CHANNELS.intakeClipboard, handleSafePanelIntakeClipboard, context),
      registerHandler(context.ipcMain, SAFE_PANEL_V0106_IPC_CHANNELS.runGate, handleSafePanelRunGate, context),
      registerHandler(context.ipcMain, SAFE_PANEL_V0106_IPC_CHANNELS.materialize, handleSafePanelMaterialize, context),
      registerHandler(context.ipcMain, SAFE_PANEL_V0106_IPC_CHANNELS.syntaxCheck, handleSafePanelSyntaxCheck, context),
      registerHandler(context.ipcMain, SAFE_PANEL_V0106_IPC_CHANNELS.openLatestGenerated, handleSafePanelOpenLatestGenerated, context)
    ]
  };
}

module.exports = {
  SAFE_PANEL_V0106_IPC_CHANNELS,
  registerSafePanelV0106RecoveryIpcHandlers,
  handleSafePanelStatus,
  handleSafePanelIntakeTextarea,
  handleSafePanelIntakeClipboard,
  handleSafePanelRunGate,
  handleSafePanelMaterialize,
  handleSafePanelSyntaxCheck,
  handleSafePanelOpenLatestGenerated,
  parseSourceFileBlocks,
  selectLatestValidGateReport,
  selectLatestGeneratedDir,
  pickRawTextFromPayload
};
