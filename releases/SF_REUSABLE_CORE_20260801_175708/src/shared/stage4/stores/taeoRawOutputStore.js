'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_TERMINAL = 'TAEO';
const DEFAULT_CLASSIFICATION = Object.freeze({
  status: 'UNCLASSIFIED',
  labels: [],
  confidence: null,
  reason: ''
});

function toSafeString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function toSafeObject(value, fallback) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.assign({}, value);
  }

  return Object.assign({}, fallback);
}

function createRecordId(prefix) {
  const safePrefix = toSafeString(prefix || 'taeo_raw').replace(/[^a-zA-Z0-9_-]/g, '_');

  if (typeof crypto.randomUUID === 'function') {
    return `${safePrefix}_${crypto.randomUUID()}`;
  }

  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const randomHex = crypto.randomBytes(8).toString('hex');
  return `${safePrefix}_${timestamp}_${randomHex}`;
}

function normalizePanelCommandSummary(value) {
  if (!value) {
    return {
      hasPanelCommand: false,
      route: '',
      action: '',
      commandId: '',
      summaryText: ''
    };
  }

  if (typeof value === 'string') {
    return {
      hasPanelCommand: value.trim().length > 0,
      route: '',
      action: '',
      commandId: '',
      summaryText: value
    };
  }

  const summary = toSafeObject(value, {});
  return {
    hasPanelCommand: Boolean(summary.hasPanelCommand),
    route: toSafeString(summary.route),
    action: toSafeString(summary.action),
    commandId: toSafeString(summary.commandId),
    summaryText: toSafeString(summary.summaryText || summary.summary || '')
  };
}

function createTaeoRawOutputRecord(input) {
  const source = input && typeof input === 'object' ? input : {};

  const receivedAt = source.receivedAt
    ? new Date(source.receivedAt).toISOString()
    : new Date().toISOString();

  return {
    recordId: toSafeString(source.recordId || createRecordId('taeo_raw_output')),
    terminal: toSafeString(source.terminal || DEFAULT_TERMINAL),
    receivedAt,
    sourceWindowId: toSafeString(source.sourceWindowId),
    rawText: toSafeString(source.rawText),
    classification: toSafeObject(source.classification, DEFAULT_CLASSIFICATION),
    panelCommandSummary: normalizePanelCommandSummary(source.panelCommandSummary)
  };
}

function ensureParentDirectory(filePath) {
  const targetDirectory = path.dirname(filePath);
  fs.mkdirSync(targetDirectory, { recursive: true });
}

function appendJsonLine(filePath, record) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('appendJsonLine requires a non-empty filePath string.');
  }

  ensureParentDirectory(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

function appendTaeoRawOutputRecord(filePath, input) {
  const record = createTaeoRawOutputRecord(input);
  return appendJsonLine(filePath, record);
}

module.exports = {
  DEFAULT_TERMINAL,
  DEFAULT_CLASSIFICATION,
  createTaeoRawOutputRecord,
  appendTaeoRawOutputRecord
};
/* SOURCE_FACTORY_W54_PROJECT_PANEL_NAMESPACE_METADATA_START */
(function sfW54InstallProjectPanelNamespaceMetadata() {
  if (typeof module === "undefined" || !module.exports) return;
  if (module.exports.__sfW54ProjectPanelNamespaceMetadataApplied_taeoRawOutputStore) return;

  var helper = null;
  try {
    helper = require("../projectPanelIdentityHelper");
  } catch (error) {
    helper = null;
  }

  function hasOwn(objectValue, key) {
    return Object.prototype.hasOwnProperty.call(objectValue, key);
  }

  function pickIdentitySource(record, args) {
    if (record && typeof record === "object" && !Array.isArray(record)) {
      if (record.project_panel_identity || record.project_id || record.panel_id || record.panel_instance_id) return record.project_panel_identity || record;
    }
    if (Array.isArray(args)) {
      for (var index = 0; index < args.length; index += 1) {
        var candidate = args[index];
        if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
          if (candidate.project_panel_identity || candidate.project_id || candidate.panel_id || candidate.panel_instance_id) {
            return candidate.project_panel_identity || candidate;
          }
        }
      }
    }
    return null;
  }

  function buildNullIdentity(identitySource) {
    var source = identitySource && typeof identitySource === "object" && !Array.isArray(identitySource) ? identitySource : {};
    return {
      project_id: hasOwn(source, "project_id") ? source.project_id : null,
      project_name: hasOwn(source, "project_name") ? source.project_name : null,
      panel_id: hasOwn(source, "panel_id") ? source.panel_id : null,
      panel_instance_id: hasOwn(source, "panel_instance_id") ? source.panel_instance_id : null
    };
  }

  function safeAttachProjectPanelIdentityToRecord(record, identitySource) {
    try {
      if (!record || typeof record !== "object" || Array.isArray(record)) return record;
      var preserved = {};
      ["project_id", "project_name", "panel_id", "panel_instance_id", "project_panel_identity"].forEach(function preserve(key) {
        if (hasOwn(record, key)) preserved[key] = record[key];
      });

      var identity = buildNullIdentity(identitySource || record.project_panel_identity || record);
      var output = Object.assign({}, record);

      if (helper && typeof helper.attachProjectPanelIdentityToPayload === "function" && identitySource) {
        output = helper.attachProjectPanelIdentityToPayload(output, identitySource);
      }

      if (!hasOwn(output, "project_id")) output.project_id = identity.project_id;
      if (!hasOwn(output, "project_name")) output.project_name = identity.project_name;
      if (!hasOwn(output, "panel_id")) output.panel_id = identity.panel_id;
      if (!hasOwn(output, "panel_instance_id")) output.panel_instance_id = identity.panel_instance_id;
      if (!hasOwn(output, "project_panel_identity")) output.project_panel_identity = identity;

      Object.keys(preserved).forEach(function restore(key) {
        output[key] = preserved[key];
      });

      return output;
    } catch (error) {
      return record;
    }
  }

  function attachEnvelope(value, args) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    var identitySource = pickIdentitySource(value, args);
    var output = safeAttachProjectPanelIdentityToRecord(value, identitySource);
    ["selectedPrompt", "dispatch", "payload", "record", "batch", "summary", "handoff", "gate_handoff", "report"].forEach(function attachNested(key) {
      if (output && output[key] && typeof output[key] === "object" && !Array.isArray(output[key])) {
        var next = Object.assign({}, output);
        next[key] = safeAttachProjectPanelIdentityToRecord(output[key], identitySource || output);
        output = next;
      }
    });
    return output;
  }

  function wrapExport(exportName) {
    if (!module.exports || typeof module.exports[exportName] !== "function") return false;
    if (module.exports[exportName].__sfW54ProjectPanelNamespaceMetadataWrapped) return true;
    var original = module.exports[exportName];
    function wrappedW54ProjectPanelNamespaceMetadataFunction() {
      var args = Array.prototype.slice.call(arguments);
      var value = original.apply(this, args);
      return attachEnvelope(value, args);
    }
    Object.keys(original).forEach(function copyProp(key) {
      try { wrappedW54ProjectPanelNamespaceMetadataFunction[key] = original[key]; } catch (error) {}
    });
    Object.defineProperty(wrappedW54ProjectPanelNamespaceMetadataFunction, "__sfW54ProjectPanelNamespaceMetadataWrapped", { value: true, enumerable: false });
    module.exports[exportName] = wrappedW54ProjectPanelNamespaceMetadataFunction;
    return true;
  }

  var candidateExports = [
    "createTaeoRawOutputRecord",
    "appendTaeoRawOutput",
    "appendTaeoRawOutputRecord",
    "saveTaeoRawOutput"
  ];
  var wrappedExports = [];
  candidateExports.forEach(function wrapCandidate(exportName) {
    if (wrapExport(exportName)) wrappedExports.push(exportName);
  });

  Object.defineProperty(module.exports, "__sfW54ProjectPanelNamespaceMetadataApplied_taeoRawOutputStore", { value: true, enumerable: false });
  module.exports.__sfW54ProjectPanelNamespaceMetadata = Object.assign({}, module.exports.__sfW54ProjectPanelNamespaceMetadata || {}, {
    version: "W54_PROJECT_PANEL_NAMESPACE_METADATA_COMMANDER_HOTFIX_V1",
    target_key: "taeoRawOutputStore",
    scope: "taeo_raw_output_new_record_envelope_only",
    helper_require: "../projectPanelIdentityHelper",
    candidate_exports: candidateExports,
    wrapped_exports: wrappedExports,
    metadata_fields: ["project_id", "project_name", "panel_id", "panel_instance_id", "project_panel_identity"],
    old_records_migration: "forbidden",
    legacy_records_without_project_id: "allowed"
  });
}());
/* SOURCE_FACTORY_W54_PROJECT_PANEL_NAMESPACE_METADATA_END */
