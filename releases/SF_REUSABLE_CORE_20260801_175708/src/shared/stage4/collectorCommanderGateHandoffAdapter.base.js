/* ST4_W44_COLLECTOR_COMMANDER_GATE_HANDOFF_ADAPTER_START */
'use strict';


/* ST4_W45_VERSION_ADAPTER_SUPPORT_START */
let __st4W45PromptPackageVersionManager = null;

try {
  __st4W45PromptPackageVersionManager = require('./promptPackageVersionManager');
} catch (_error) {
  __st4W45PromptPackageVersionManager = null;
}

function __st4W45IsObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function __st4W45Pick(source, names, fallback) {
  const obj = __st4W45IsObject(source) ? source : {};
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== null && obj[name] !== '') {
      return obj[name];
    }
  }
  return fallback;
}

function __st4W45ReadVersionFieldsFromSources() {
  const out = {};
  const sources = Array.prototype.slice.call(arguments).filter(__st4W45IsObject);

  function put(targetKey, names) {
    for (const source of sources) {
      const value = __st4W45Pick(source, names, undefined);
      if (value !== undefined && value !== null && value !== '') {
        out[targetKey] = value;
        return;
      }
    }
    out[targetKey] = '';
  }

  put('prompt_package_id', ['prompt_package_id', 'promptPackageId']);
  put('prompt_package_version', ['prompt_package_version', 'promptPackageVersion']);
  put('target_stage', ['target_stage', 'targetStage']);
  put('commander_function_class', ['commander_function_class', 'commanderFunctionClass']);
  put('worker_function_class', ['worker_function_class', 'workerFunctionClass']);
  put('api_ipc_button_contract_id', ['api_ipc_button_contract_id', 'apiIpcButtonContractId']);
  put('source_factory_constitution_version', ['source_factory_constitution_version', 'sourceFactoryConstitutionVersion']);
  put('prompt_id', ['prompt_id', 'promptId']);
  put('task_id', ['task_id', 'taskId']);
  put('worker_id', ['worker_id', 'workerId']);
  put('worker_slot', ['worker_slot', 'workerSlot']);
  put('send_order', ['send_order', 'sendOrder']);
  put('dedupe_key', ['dedupe_key', 'dedupeKey']);
  put('batchId', ['batchId', 'batch_id']);
  put('batch_record_id', ['batch_record_id', 'batchRecordId', 'recordId']);
  out.old_prompt_reuse_candidate = sources.some(function hasOldReuse(source) {
    return Boolean(source.old_prompt_reuse_candidate || source.oldPromptReuseCandidate || source.already_sent || source.alreadySent);
  });

  return out;
}

function __st4W45BuildVersionMetadata(actual, expected) {
  if (__st4W45PromptPackageVersionManager &&
      typeof __st4W45PromptPackageVersionManager.buildPromptPackageVersionBindingMetadata === 'function') {
    return __st4W45PromptPackageVersionManager.buildPromptPackageVersionBindingMetadata(actual, expected);
  }

  const issues = [];
  if (!actual.prompt_package_id) {
    issues.push({ status: 'YELLOW_VERSION_FIELD_MISSING', field: 'prompt_package_id', reason: 'prompt_package_id is missing; do not create a default value' });
  }
  if (!actual.prompt_package_version) {
    issues.push({ status: 'YELLOW_VERSION_FIELD_MISSING', field: 'prompt_package_version', reason: 'prompt_package_version is missing; do not create a default value' });
  }
  if (expected.prompt_package_id && actual.prompt_package_id && expected.prompt_package_id !== actual.prompt_package_id) {
    issues.push({ status: 'RED_VERSION_MISMATCH_CANDIDATE', field: 'prompt_package_id', expected: expected.prompt_package_id, actual: actual.prompt_package_id, reason: 'prompt_package_id mismatch' });
  }
  if (expected.prompt_package_version && actual.prompt_package_version && expected.prompt_package_version !== actual.prompt_package_version) {
    issues.push({ status: 'RED_VERSION_MISMATCH_CANDIDATE', field: 'prompt_package_version', expected: expected.prompt_package_version, actual: actual.prompt_package_version, reason: 'prompt_package_version mismatch' });
  }
  if (actual.old_prompt_reuse_candidate) {
    issues.push({ status: 'YELLOW_OLD_PROMPT_REUSE_CANDIDATE', field: 'prompt_id', prompt_id: actual.prompt_id, reason: 'old prompt reuse candidate detected' });
  }
  const hasRed = issues.some(function isRed(issue) { return String(issue.status).indexOf('RED_') === 0; });
  const hasYellow = issues.some(function isYellow(issue) { return String(issue.status).indexOf('YELLOW_') === 0; });

  return Object.assign({}, actual, {
    version_binding_status: hasRed ? 'RED_VERSION_MISMATCH_CANDIDATE' : hasYellow ? 'YELLOW_VERSION_FIELD_MISSING' : 'GREEN_VERSION_FIELDS_BOUND',
    version_binding_issues: issues,
    version_binding_issue_count: issues.length
  });
}

function __st4W45ApplyVersionMetadataToGateHandoff(handoff, response, options) {
  if (!__st4W45IsObject(handoff)) {
    return handoff;
  }

  const opts = __st4W45IsObject(options) ? options : {};
  const data = response && response.data && typeof response.data === 'object' ? response.data : {};
  const source = __st4W45IsObject(handoff.source) ? handoff.source : {};
  const expected = __st4W45ReadVersionFieldsFromSources(
    opts.expectedPromptPackage || {},
    {
      prompt_package_id: opts.expected_prompt_package_id || opts.expectedPromptPackageId,
      prompt_package_version: opts.expected_prompt_package_version || opts.expectedPromptPackageVersion
    },
    data
  );
  const actual = __st4W45ReadVersionFieldsFromSources(data, source, opts);
  const versionMetadata = __st4W45BuildVersionMetadata(actual, expected);

  handoff.source = Object.assign({}, source, {
    prompt_package_id: versionMetadata.prompt_package_id,
    prompt_package_version: versionMetadata.prompt_package_version,
    target_stage: versionMetadata.target_stage,
    commander_function_class: versionMetadata.commander_function_class,
    worker_function_class: versionMetadata.worker_function_class,
    api_ipc_button_contract_id: versionMetadata.api_ipc_button_contract_id,
    source_factory_constitution_version: versionMetadata.source_factory_constitution_version,
    prompt_id: versionMetadata.prompt_id || source.prompt_id || null,
    task_id: versionMetadata.task_id || source.task_id || null,
    worker_id: versionMetadata.worker_id || source.worker_id || null,
    worker_slot: versionMetadata.worker_slot || source.worker_slot || null,
    send_order: versionMetadata.send_order,
    dedupe_key: versionMetadata.dedupe_key,
    batchId: versionMetadata.batchId || data.batchId || '',
    batch_record_id: versionMetadata.batch_record_id || data.batch_record_id || data.batchRecordId || data.recordId || ''
  });

  handoff.version_binding_status = versionMetadata.version_binding_status;
  handoff.version_binding_issues = versionMetadata.version_binding_issues;
  handoff.version_binding_issue_count = versionMetadata.version_binding_issue_count;

  handoff.gate_inputs = Object.assign({}, handoff.gate_inputs || {}, {
    prompt_package_id: handoff.source.prompt_package_id,
    prompt_package_version: handoff.source.prompt_package_version,
    target_stage: handoff.source.target_stage,
    version_binding_status: versionMetadata.version_binding_status,
    version_binding_issues: versionMetadata.version_binding_issues,
    version_binding_issue_count: versionMetadata.version_binding_issue_count
  });

  const hasRed = versionMetadata.version_binding_issues.some(function isRed(issue) {
    return String(issue.status).indexOf('RED_') === 0;
  });
  const hasYellow = versionMetadata.version_binding_issues.some(function isYellow(issue) {
    return String(issue.status).indexOf('YELLOW_') === 0;
  });

  if (!handoff.gate_recommendation || typeof handoff.gate_recommendation !== 'object') {
    handoff.gate_recommendation = {
      suggested_status: 'GREEN',
      reason: 'Collector response can be handed off to Commander Gate.',
      blocking_reasons: [],
      yellow_reasons: [],
      red_small_hotfix: null
    };
  }

  if (!Array.isArray(handoff.gate_recommendation.blocking_reasons)) {
    handoff.gate_recommendation.blocking_reasons = [];
  }
  if (!Array.isArray(handoff.gate_recommendation.yellow_reasons)) {
    handoff.gate_recommendation.yellow_reasons = [];
  }

  if (hasRed) {
    handoff.gate_recommendation.suggested_status = 'RED';
    handoff.gate_recommendation.reason = 'version mismatch candidate detected.';
    handoff.gate_recommendation.blocking_reasons.push('version mismatch candidate detected.');
    handoff.gate_recommendation.red_small_hotfix = {
      worker_id: handoff.source.worker_id || 'UNKNOWN_WORKER',
      cause: 'version mismatch candidate detected.',
      fix: 'Preserve prompt_package_id and prompt_package_version across Queue/Sender/Collector/Gate handoff.',
      resubmit_scope: 'version field binding only'
    };
  } else if (hasYellow && handoff.gate_recommendation.suggested_status === 'GREEN') {
    handoff.gate_recommendation.suggested_status = 'YELLOW';
    handoff.gate_recommendation.reason = 'version field review required.';
    handoff.gate_recommendation.yellow_reasons.push('version field review required.');
  } else if (hasYellow) {
    handoff.gate_recommendation.yellow_reasons.push('version field review required.');
  }

  if (!handoff.next_commander_action || typeof handoff.next_commander_action !== 'object') {
    handoff.next_commander_action = {
      action_type: hasRed ? 'ISSUE_RED_SMALL_HOTFIX' : hasYellow ? 'FAST_YELLOW_REVIEW' : 'PROCEED_TO_ASSEMBLY',
      target: null,
      instruction: hasRed ? 'Issue RED small hotfix for version field mismatch.' : hasYellow ? 'Review missing/legacy version fields only.' : 'Proceed with Commander Gate intake.',
      requires_file_modification: hasRed,
      requires_worker: hasRed
    };
  }

  handoff.next_commander_action.version_context = {
    prompt_package_id: handoff.source.prompt_package_id,
    prompt_package_version: handoff.source.prompt_package_version,
    prompt_id: handoff.source.prompt_id,
    task_id: handoff.source.task_id,
    worker_id: handoff.source.worker_id,
    worker_slot: handoff.source.worker_slot,
    send_order: handoff.source.send_order,
    dedupe_key: handoff.source.dedupe_key,
    batchId: handoff.source.batchId,
    batch_record_id: handoff.source.batch_record_id,
    version_binding_status: versionMetadata.version_binding_status,
    version_binding_issue_count: versionMetadata.version_binding_issue_count
  };

  return handoff;
}
/* ST4_W45_VERSION_ADAPTER_SUPPORT_END */



/**
 * Stage 4 Collector Commander Gate Handoff Adapter
 *
 * Converts a collectWorkerOutput response into a Commander Gate intake object.
 * This helper is pure and has no filesystem, runtime, IPC, renderer, preload, or package side effects.
 */

const ADAPTER_VERSION = '0.2.0';

const ALLOWED_OPERATIONS = Object.freeze(['create', 'modify', 'replace', 'patch_request', 'report_only', 'unknown']);
const EXECUTABLE_LANGUAGES = Object.freeze(['javascript', 'json', 'python', 'powershell', 'bat']);
const EXECUTABLE_EXTENSIONS = Object.freeze(['.js', '.json', '.py', '.ps1', '.bat']);

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function safeString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value.slice();
  }
  if (value === null || value === undefined || value === '') {
    return [];
  }
  return [value];
}

function firstNonEmpty() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = arguments[index];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function readField(source, keys, fallback) {
  const obj = isPlainObject(source) ? source : {};
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return fallback;
}

function getData(response) {
  if (isPlainObject(response) && isPlainObject(response.data)) {
    return response.data;
  }
  return isPlainObject(response) ? response : {};
}

function normalizePath(value) {
  return safeString(value).trim().replace(/\\+/g, '/').replace(/^\.\//, '');
}

function parseHeaderValue(text, key) {
  const pattern = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*(.*)$', 'mi');
  const match = safeString(text).match(pattern);
  return match ? match[1].trim() : '';
}

function parseSourceFileBlock(block) {
  const text = safeString(block);
  const contentMatch = text.match(/===\s*CONTENT_START\s*===\s*\n?([\s\S]*?)\n?===\s*CONTENT_END\s*===/i);
  return {
    path: parseHeaderValue(text, 'path'),
    language: parseHeaderValue(text, 'language'),
    purpose: parseHeaderValue(text, 'purpose'),
    operation: parseHeaderValue(text, 'operation'),
    owner_worker: parseHeaderValue(text, 'owner_worker'),
    target_stage: parseHeaderValue(text, 'target_stage'),
    content: contentMatch ? contentMatch[1] : '',
    rawBlock: text
  };
}

function parseWorkerReportText(rawReportText) {
  const fields = {};
  safeString(rawReportText).split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Za-z0-9_/-]+)\s*:\s*(.*)$/);
    if (match) {
      fields[match[1].trim()] = match[2].trim();
    }
  });
  return fields;
}

function parseMaybeArrayText(value) {
  if (Array.isArray(value)) {
    return value;
  }
  const text = safeString(value).trim();
  if (!text) {
    return [];
  }
  if (text === 'none' || text === '[]') {
    return [];
  }
  return text;
}

function isSyntaxCheckRequiredForCandidate(candidate) {
  const language = safeString(candidate.language).toLowerCase();
  const operation = safeString(candidate.operation).toLowerCase();
  const pathValue = safeString(candidate.normalized_path || candidate.path).toLowerCase();

  if (operation === 'report_only') {
    return false;
  }

  return EXECUTABLE_LANGUAGES.includes(language) || EXECUTABLE_EXTENSIONS.some((ext) => pathValue.endsWith(ext));
}

function detectOmittedCodeCandidate(sourceFileCandidate) {
  const candidate = isPlainObject(sourceFileCandidate) ? sourceFileCandidate : {};
  const content = [candidate.content, candidate.rawBlock, candidate.raw_block].map(safeString).join('\n').toLowerCase();

  if (!content.trim()) {
    const operation = safeString(candidate.operation).toLowerCase();
    return operation === 'create' || operation === 'modify' || operation === 'replace';
  }

  const omittedTokens = [
    'todo only',
    'placeholder only',
    'same as above',
    'rest is same',
    'omitted',
    'stub only',
    'todo: implement',
    '나머지는 동일',
    '나머지 동일',
    '이전과 동일',
    '생략',
    '중략',
    '전체 코드가 아님'
  ];

  return omittedTokens.some((token) => content.includes(token));
}

function normalizeOperation(value) {
  const operation = safeString(value).trim().toLowerCase();
  return ALLOWED_OPERATIONS.includes(operation) ? operation : 'unknown';
}

function normalizeSourceFileCandidate(sourceFile, index, context) {
  const options = isPlainObject(context) ? context : {};
  const rawSource = typeof sourceFile === 'string' ? parseSourceFileBlock(sourceFile) : (isPlainObject(sourceFile) ? sourceFile : {});
  const header = isPlainObject(rawSource.header) ? rawSource.header : rawSource;
  const rawBlock = safeString(firstNonEmpty(rawSource.rawBlock, rawSource.raw_block, typeof sourceFile === 'string' ? sourceFile : ''));
  const content = safeString(firstNonEmpty(rawSource.content, rawSource.body, parseSourceFileBlock(rawBlock).content, ''));
  const pathValue = safeString(firstNonEmpty(
    readField(header, ['path', 'file_path', 'target_path', 'targetPath'], ''),
    parseSourceFileBlock(rawBlock).path,
    ''
  )).trim();
  const normalizedPath = normalizePath(pathValue);
  const language = safeString(firstNonEmpty(
    readField(header, ['language', 'lang'], ''),
    parseSourceFileBlock(rawBlock).language,
    ''
  )).trim().toLowerCase();
  const operation = normalizeOperation(firstNonEmpty(
    readField(header, ['operation', 'op'], ''),
    parseSourceFileBlock(rawBlock).operation,
    'unknown'
  ));
  const ownerWorker = safeString(firstNonEmpty(
    readField(header, ['owner_worker', 'ownerWorker', 'worker_id', 'workerId'], ''),
    parseSourceFileBlock(rawBlock).owner_worker,
    ''
  )).trim();
  const targetStage = safeString(firstNonEmpty(
    readField(header, ['target_stage', 'targetStage'], ''),
    parseSourceFileBlock(rawBlock).target_stage,
    options.targetStage || options.target_stage || ''
  )).trim();
  const purpose = safeString(firstNonEmpty(
    readField(header, ['purpose'], ''),
    parseSourceFileBlock(rawBlock).purpose,
    ''
  )).trim();

  const candidate = {
    candidate_id: safeString(firstNonEmpty(rawSource.candidate_id, rawSource.candidateId, 'SOURCE_CANDIDATE_' + String(index + 1).padStart(3, '0'))),
    index: Number.isFinite(Number(rawSource.index)) ? Number(rawSource.index) : index + 1,
    path: pathValue,
    normalized_path: normalizedPath,
    language,
    purpose,
    operation,
    owner_worker: ownerWorker,
    target_stage: targetStage,
    content,
    contentLength: content.length,
    rawBlock,
    blockValid: Boolean(pathValue && language && operation && operation !== 'unknown' && ownerWorker && targetStage && (content || rawBlock.includes('=== CONTENT_START ==='))),
    syntax_check_required: false,
    omitted_code_detected: false,
    false_pass_claim_detected: false,
    duplicate_path_status: 'PASS_UNIQUE',
    gate_candidate_status: 'GREEN_CANDIDATE_READY',
    parseWarnings: Array.isArray(rawSource.parseWarnings) ? rawSource.parseWarnings.slice() : []
  };

  candidate.syntax_check_required = isSyntaxCheckRequiredForCandidate(candidate);
  candidate.omitted_code_detected = detectOmittedCodeCandidate(candidate);

  if (!candidate.blockValid || candidate.omitted_code_detected) {
    candidate.gate_candidate_status = candidate.omitted_code_detected ? 'RED_CANDIDATE_BLOCKED' : 'YELLOW_CANDIDATE_REVIEW_REQUIRED';
  } else if (candidate.syntax_check_required) {
    candidate.gate_candidate_status = 'YELLOW_CANDIDATE_REVIEW_REQUIRED';
  }

  return candidate;
}

function normalizeSourceFileCandidates(sourceFiles, options) {
  return safeArray(sourceFiles).map((item, index) => normalizeSourceFileCandidate(item, index, options));
}

function normalizeWorkerReport(workerReports) {
  const reports = safeArray(workerReports).map((item, index) => {
    if (typeof item === 'string') {
      const fields = parseWorkerReportText(item);
      return {
        index,
        rawReportText: item,
        fields,
        worker_id: safeString(readField(fields, ['worker_id', 'workerId'], '')),
        task_id: safeString(readField(fields, ['task_id', 'taskId'], '')),
        worker_function_class: safeString(readField(fields, ['worker_function_class', 'workerFunctionClass'], '')),
        files_created: parseMaybeArrayText(readField(fields, ['files_created', 'filesCreated'], '')),
        files_modified: parseMaybeArrayText(readField(fields, ['files_modified', 'filesModified'], '')),
        patch_requests_created: parseMaybeArrayText(readField(fields, ['patch_requests_created', 'patchRequestsCreated'], '')),
        report_only_artifacts: parseMaybeArrayText(readField(fields, ['report_only_artifacts', 'reportOnlyArtifacts'], '')),
        tests_run: parseMaybeArrayText(readField(fields, ['tests_run', 'testsRun'], '')),
        tests_not_run: parseMaybeArrayText(readField(fields, ['tests_not_run', 'testsNotRun'], '')),
        class_contract_status: safeString(readField(fields, ['class_contract_status', 'classContractStatus'], '')),
        priority_0_status: safeString(readField(fields, ['priority_0_status', 'priority0Status'], '')),
        known_risks: parseMaybeArrayText(readField(fields, ['known_risks', 'knownRisks'], '')),
        next_needed: parseMaybeArrayText(readField(fields, ['next_needed', 'nextNeeded'], ''))
      };
    }

    const source = isPlainObject(item) ? item : {};
    const fields = isPlainObject(source.fields) ? source.fields : source;
    return {
      index,
      rawReportText: safeString(firstNonEmpty(source.rawReportText, source.rawBlock, source.raw_block, '')),
      fields,
      worker_id: safeString(readField(fields, ['worker_id', 'workerId'], '')),
      task_id: safeString(readField(fields, ['task_id', 'taskId'], '')),
      worker_function_class: safeString(readField(fields, ['worker_function_class', 'workerFunctionClass'], '')),
      files_created: parseMaybeArrayText(readField(fields, ['files_created', 'filesCreated'], '')),
      files_modified: parseMaybeArrayText(readField(fields, ['files_modified', 'filesModified'], '')),
      patch_requests_created: parseMaybeArrayText(readField(fields, ['patch_requests_created', 'patchRequestsCreated'], '')),
      report_only_artifacts: parseMaybeArrayText(readField(fields, ['report_only_artifacts', 'reportOnlyArtifacts'], '')),
      tests_run: parseMaybeArrayText(readField(fields, ['tests_run', 'testsRun'], '')),
      tests_not_run: parseMaybeArrayText(readField(fields, ['tests_not_run', 'testsNotRun'], '')),
      class_contract_status: safeString(readField(fields, ['class_contract_status', 'classContractStatus'], '')),
      priority_0_status: safeString(readField(fields, ['priority_0_status', 'priority0Status'], '')),
      known_risks: parseMaybeArrayText(readField(fields, ['known_risks', 'knownRisks'], '')),
      next_needed: parseMaybeArrayText(readField(fields, ['next_needed', 'nextNeeded'], ''))
    };
  });

  const primary = reports[0] || null;
  const requiredFields = [
    'worker_id',
    'task_id',
    'worker_function_class',
    'files_created',
    'files_modified',
    'patch_requests_created',
    'report_only_artifacts',
    'tests_run',
    'tests_not_run',
    'class_contract_status',
    'priority_0_status',
    'known_risks',
    'next_needed'
  ];

  const missing = primary ? requiredFields.filter((field) => {
    const value = primary[field];
    return value === undefined || value === null || value === '';
  }) : requiredFields.slice();

  const normalized = {
    found: reports.length > 0,
    primary,
    reports,
    worker_id: primary ? primary.worker_id : '',
    task_id: primary ? primary.task_id : '',
    worker_function_class: primary ? primary.worker_function_class : '',
    class_contract_status: primary ? primary.class_contract_status : '',
    priority_0_status: primary ? primary.priority_0_status : '',
    minimum_check: {
      ok: missing.length === 0,
      missing
    },
    false_pass_claim_detected: false
  };

  normalized.false_pass_claim_detected = detectFalsePassClaim(normalized);
  return normalized;
}

function detectFalsePassClaim(workerReport) {
  const report = isPlainObject(workerReport) && workerReport.primary ? workerReport.primary : (isPlainObject(workerReport) ? workerReport : {});
  const text = [
    report.rawReportText,
    report.class_contract_status,
    report.priority_0_status,
    report.tests_run,
    report.tests_not_run,
    report.known_risks
  ].map((value) => Array.isArray(value) ? value.join(' ') : safeString(value)).join('\n').toLowerCase();

  const hasPassClaim = /\bpass\b|\bgreen\b|성공|통과|정상|확인 완료|runtime smoke pass|node --check pass|require smoke pass|e2e pass/i.test(text);
  const hasContradiction = /not_run|fixture_draft_only|not run|미실행|실행하지 않|검사하지 않|runtime smoke.*not|node --check.*not/i.test(text);
  const hasNoEvidence = /no evidence|증거 없음|확인 불가|command output absent|result block absent/i.test(text);

  return hasPassClaim && (hasContradiction || hasNoEvidence);
}

function buildSyntaxCheckPlan(sourceFileCandidates) {
  const candidates = Array.isArray(sourceFileCandidates) && sourceFileCandidates.every((candidate) => Object.prototype.hasOwnProperty.call(candidate, 'syntax_check_required'))
    ? sourceFileCandidates
    : normalizeSourceFileCandidates(sourceFileCandidates);

  const targetPaths = candidates.filter((candidate) => candidate.syntax_check_required).map((candidate) => candidate.normalized_path || candidate.path);
  return {
    required: targetPaths.length > 0,
    status: targetPaths.length > 0 ? 'REQUIRED_NOT_RUN' : 'NOT_REQUIRED',
    reason: targetPaths.length > 0 ? 'Executable/config SOURCE_FILE candidates require syntax check.' : 'No executable/config SOURCE_FILE candidates require syntax check.',
    target_paths: targetPaths,
    plan: targetPaths.map((targetPath) => {
      const lower = safeString(targetPath).toLowerCase();
      if (lower.endsWith('.js')) {
        return { path: targetPath, command: 'node --check ' + targetPath, status: 'PENDING_NOT_RUN_BY_ADAPTER' };
      }
      if (lower.endsWith('.json')) {
        return { path: targetPath, command: 'JSON.parse ' + targetPath, status: 'PENDING_NOT_RUN_BY_ADAPTER' };
      }
      if (lower.endsWith('.py')) {
        return { path: targetPath, command: 'python -m py_compile ' + targetPath, status: 'PENDING_NOT_RUN_BY_ADAPTER' };
      }
      if (lower.endsWith('.ps1')) {
        return { path: targetPath, command: 'powershell -NoProfile -File ' + targetPath, status: 'PENDING_NOT_RUN_BY_ADAPTER' };
      }
      if (lower.endsWith('.bat')) {
        return { path: targetPath, command: 'cmd /c ' + targetPath, status: 'PENDING_NOT_RUN_BY_ADAPTER' };
      }
      return { path: targetPath, command: '', status: 'PENDING_NOT_RUN_BY_ADAPTER' };
    })
  };
}

function buildDuplicatePathCheck(sourceFileCandidates) {
  const candidates = Array.isArray(sourceFileCandidates) && sourceFileCandidates.every((candidate) => Object.prototype.hasOwnProperty.call(candidate, 'normalized_path'))
    ? sourceFileCandidates
    : normalizeSourceFileCandidates(sourceFileCandidates);
  const grouped = {};

  candidates.forEach((candidate) => {
    const normalizedPath = safeString(candidate.normalized_path || candidate.path).toLowerCase();
    if (!normalizedPath) {
      return;
    }
    if (!grouped[normalizedPath]) {
      grouped[normalizedPath] = [];
    }
    grouped[normalizedPath].push(candidate);
  });

  const duplicate_paths = [];
  Object.keys(grouped).sort().forEach((pathValue) => {
    if (grouped[pathValue].length > 1) {
      const contentSet = new Set(grouped[pathValue].map((candidate) => safeString(candidate.content)));
      duplicate_paths.push({
        path: pathValue,
        count: grouped[pathValue].length,
        status: contentSet.size > 1 ? 'RED_DUPLICATE_PATH_CONFLICT' : 'YELLOW_SAME_PATH_REVIEW',
        indexes: grouped[pathValue].map((candidate) => candidate.index)
      });
    }
  });

  let status = 'PASS_NO_DUPLICATES';
  if (duplicate_paths.some((item) => item.status === 'RED_DUPLICATE_PATH_CONFLICT')) {
    status = 'RED_DUPLICATE_PATH_CONFLICT';
  } else if (duplicate_paths.length > 0) {
    status = 'YELLOW_REVIEW_REQUIRED';
  }

  return {
    required: candidates.length > 0,
    status,
    duplicate_paths,
    duplicatePathFound: duplicate_paths.length > 0
  };
}

function normalizeErrorCandidates(errorCandidates) {
  return safeArray(errorCandidates).map((candidate, index) => {
    if (typeof candidate === 'string') {
      return {
        error_id: 'ERROR_CANDIDATE_' + String(index + 1).padStart(3, '0'),
        source: 'collector',
        severity_hint: 'YELLOW',
        code: 'RAW_ERROR_CANDIDATE',
        message: candidate,
        evidence: candidate
      };
    }
    const source = isPlainObject(candidate) ? candidate : {};
    return {
      error_id: safeString(firstNonEmpty(source.error_id, source.errorId, 'ERROR_CANDIDATE_' + String(index + 1).padStart(3, '0'))),
      source: safeString(firstNonEmpty(source.source, 'collector')),
      severity_hint: safeString(firstNonEmpty(source.severity_hint, source.severityHint, source.severity, 'YELLOW')).toUpperCase(),
      code: safeString(firstNonEmpty(source.code, source.error_type, source.errorType, 'ERROR_CANDIDATE')),
      message: safeString(firstNonEmpty(source.message, source.reason, '')),
      evidence: safeString(firstNonEmpty(source.evidence, source.detail, source.details, '')),
      related_path: firstNonEmpty(source.related_path, source.relatedPath, null),
      related_candidate_id: firstNonEmpty(source.related_candidate_id, source.relatedCandidateId, null)
    };
  });
}

function buildGateRecommendation(handoff) {
  const source = isPlainObject(handoff) ? handoff : {};
  const blocking_reasons = [];
  const yellow_reasons = [];

  if (!source.collectWorkerOutput || source.collectWorkerOutput.ok !== true) {
    blocking_reasons.push('collectWorkerOutput.ok is not true.');
  }

  if (!source.worker_report || !source.worker_report.minimum_check || source.worker_report.minimum_check.ok !== true) {
    blocking_reasons.push('WORKER_REPORT minimum fields missing.');
  }

  const sourceCandidates = safeArray(source.source_file_candidates);
  sourceCandidates.forEach((candidate) => {
    if (candidate.blockValid !== true) {
      blocking_reasons.push('SOURCE_FILE candidate invalid: ' + (candidate.normalized_path || candidate.path || candidate.candidate_id));
    }
    if (candidate.omitted_code_detected) {
      blocking_reasons.push('omitted code candidate detected: ' + (candidate.normalized_path || candidate.path || candidate.candidate_id));
    }
  });

  if (source.worker_report && source.worker_report.false_pass_claim_detected) {
    blocking_reasons.push('false PASS claim candidate detected.');
  }

  const errors = safeArray(source.errorCandidates);
  if (errors.some((item) => safeString(item.severity_hint || item.severity).toUpperCase() === 'RED')) {
    blocking_reasons.push('RED error candidate present.');
  } else if (errors.length > 0) {
    yellow_reasons.push('YELLOW/INFO error candidates present.');
  }

  if (source.gate_inputs && source.gate_inputs.syntax_check && source.gate_inputs.syntax_check.status === 'REQUIRED_NOT_RUN') {
    yellow_reasons.push('syntax check required but not run.');
  }

  if (source.gate_inputs && source.gate_inputs.duplicate_path_check && source.gate_inputs.duplicate_path_check.status === 'YELLOW_REVIEW_REQUIRED') {
    yellow_reasons.push('duplicate path review required.');
  }

  if (source.gate_inputs && source.gate_inputs.duplicate_path_check && source.gate_inputs.duplicate_path_check.status === 'RED_DUPLICATE_PATH_CONFLICT') {
    blocking_reasons.push('duplicate path conflict.');
  }

  if (!source.gate_inputs || !source.gate_inputs.batch_record_id) {
    const batchStatus = source.gate_inputs ? safeString(source.gate_inputs.batch_status) : '';
    if (batchStatus.startsWith('YELLOW_') || batchStatus === 'SKIPPED_DUPLICATE') {
      yellow_reasons.push('batch_record_id absent but batch status permits review: ' + batchStatus);
    } else {
      blocking_reasons.push('batch_record_id missing.');
    }
  }

  if (blocking_reasons.length > 0) {
    return {
      suggested_status: 'RED',
      reason: blocking_reasons[0],
      blocking_reasons,
      yellow_reasons,
      red_small_hotfix: {
        worker_id: source.source && source.source.worker_id ? source.source.worker_id : 'UNKNOWN_WORKER',
        cause: blocking_reasons[0],
        fix: 'Resubmit or patch only the affected Collector/Gate handoff field.',
        resubmit_scope: 'affected field or SOURCE_FILE only'
      }
    };
  }

  if (yellow_reasons.length > 0) {
    return {
      suggested_status: 'YELLOW',
      reason: yellow_reasons[0],
      blocking_reasons,
      yellow_reasons,
      red_small_hotfix: null
    };
  }

  return {
    suggested_status: 'GREEN',
    reason: 'Collector response can be handed off to Commander Gate.',
    blocking_reasons,
    yellow_reasons,
    red_small_hotfix: null
  };
}

function buildNextCommanderAction(gateRecommendation) {
  const recommendation = isPlainObject(gateRecommendation) ? gateRecommendation : {};
  if (recommendation.suggested_status === 'RED') {
    return {
      action_type: 'ISSUE_RED_SMALL_HOTFIX',
      target: recommendation.red_small_hotfix ? recommendation.red_small_hotfix.worker_id : null,
      instruction: recommendation.red_small_hotfix
        ? 'RED_FIX_REQUIRED\nworker_id: ' + recommendation.red_small_hotfix.worker_id + '\ncause: ' + recommendation.red_small_hotfix.cause + '\nfix: ' + recommendation.red_small_hotfix.fix + '\nresubmit_scope: ' + recommendation.red_small_hotfix.resubmit_scope
        : 'Issue RED small hotfix for the blocking handoff issue.',
      requires_file_modification: true,
      requires_worker: true
    };
  }

  if (recommendation.suggested_status === 'YELLOW') {
    if (safeString(recommendation.reason).includes('syntax')) {
      return {
        action_type: 'RUN_LOCAL_SYNTAX_CHECK',
        target: 'syntax_check.target_paths',
        instruction: 'Run local syntax check for target_paths before assembly.',
        requires_file_modification: false,
        requires_worker: false
      };
    }
    if (safeString(recommendation.reason).includes('duplicate')) {
      return {
        action_type: 'RUN_DUPLICATE_PATH_CHECK',
        target: 'duplicate_path_check.duplicate_paths',
        instruction: 'Compare duplicate paths before assembly.',
        requires_file_modification: false,
        requires_worker: false
      };
    }
    return {
      action_type: 'FAST_YELLOW_REVIEW',
      target: null,
      instruction: 'Review YELLOW Gate fields only and proceed if non-blocking.',
      requires_file_modification: false,
      requires_worker: false
    };
  }

  return {
    action_type: 'PROCEED_TO_ASSEMBLY',
    target: null,
    instruction: 'Proceed with Commander Gate intake and assembly candidate handling using source_file_candidates and batch_record_id.',
    requires_file_modification: false,
    requires_worker: false
  };
}

function normalizeCollectorResponseToGateHandoff__ST4W45_VERSION_ORIGINAL(response, options) {
  const opts = isPlainObject(options) ? options : {};
  const data = getData(response);
  const baseline = safeString(opts.baseline || 'STAGE4_PRODUCTION_BASELINE_GREEN_20260704_PLUS_W33_PROMPT_QUEUE_PATCH_PLUS_W39_TAEO_AUTOSAVE_RENDERER_PLUS_W40_TAEO_STORAGE_BINDING_PLUS_W42_COLLECTOR_EXTRACTOR_BINDING_PLUS_W43_COLLECTOR_BATCH_STORE_BINDING');
  const handoffId = safeString(firstNonEmpty(opts.handoff_id, opts.handoffId, 'COLLECTOR_GATE_HANDOFF_' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)));
  const sourceFileCandidates = normalizeSourceFileCandidates(data.sourceFiles || data.source_files || [], opts);
  const workerReport = normalizeWorkerReport(data.workerReports || data.worker_reports || data.workerReport || data.worker_report || []);
  const errorCandidates = normalizeErrorCandidates(data.errorCandidates || data.error_candidates || []);
  const syntaxCheck = buildSyntaxCheckPlan(sourceFileCandidates);
  const duplicatePathCheck = buildDuplicatePathCheck(sourceFileCandidates);

  duplicatePathCheck.duplicate_paths.forEach((dup) => {
    sourceFileCandidates.forEach((candidate) => {
      if (safeString(candidate.normalized_path).toLowerCase() === safeString(dup.path).toLowerCase()) {
        candidate.duplicate_path_status = dup.status;
        if (dup.status === 'RED_DUPLICATE_PATH_CONFLICT') {
          candidate.gate_candidate_status = 'RED_CANDIDATE_BLOCKED';
        } else if (candidate.gate_candidate_status === 'GREEN_CANDIDATE_READY') {
          candidate.gate_candidate_status = 'YELLOW_CANDIDATE_REVIEW_REQUIRED';
        }
      }
    });
  });

  const gateInputs = {
    class_contract_status: safeString(firstNonEmpty(data.classContractStatus, data.class_contract_status, workerReport.class_contract_status, 'UNKNOWN')),
    priority_0_status: safeString(firstNonEmpty(data.priority_0_status, data.priority0Status, workerReport.priority_0_status, 'UNKNOWN')),
    batch_record_id: firstNonEmpty(data.batch_record_id, data.batchRecordId, data.recordId, null),
    batch_status: safeString(firstNonEmpty(data.batch_status, data.batchStatus, data.batch_store_status, data.batchStoreStatus, 'UNKNOWN')),
    syntax_check: syntaxCheck,
    duplicate_path_check: duplicatePathCheck,
    known_risks: firstNonEmpty(data.known_risks, data.knownRisks, workerReport.primary ? workerReport.primary.known_risks : '', ''),
    next_needed: firstNonEmpty(data.next_needed, data.nextNeeded, workerReport.primary ? workerReport.primary.next_needed : '', '')
  };

  const handoff = {
    object_type: 'COLLECTOR_COMMANDER_GATE_HANDOFF',
    adapter_version: ADAPTER_VERSION,
    handoff_id: handoffId,
    baseline,
    source: {
      worker_id: firstNonEmpty(data.worker_id, data.workerId, workerReport.worker_id, opts.worker_id, opts.workerId, null),
      task_id: firstNonEmpty(data.task_id, data.taskId, workerReport.task_id, opts.task_id, opts.taskId, null),
      prompt_id: firstNonEmpty(data.prompt_id, data.promptId, opts.prompt_id, opts.promptId, null),
      prompt_package_id: firstNonEmpty(data.prompt_package_id, data.promptPackageId, opts.prompt_package_id, opts.promptPackageId, null),
      prompt_package_version: firstNonEmpty(data.prompt_package_version, data.promptPackageVersion, opts.prompt_package_version, opts.promptPackageVersion, null),
      worker_slot: firstNonEmpty(data.worker_slot, data.workerSlot, opts.worker_slot, opts.workerSlot, null),
      collector_run_id: firstNonEmpty(data.collector_run_id, data.collectorRunId, opts.collector_run_id, opts.collectorRunId, handoffId)
    },
    collected_at: safeString(opts.collected_at || opts.collectedAt || new Date().toISOString()),
    collectWorkerOutput: {
      ok: response && response.ok === true,
      rawTextLength: Number(firstNonEmpty(data.rawTextLength, data.raw_text_length, 0)),
      sourceFileCount: Number(firstNonEmpty(data.sourceFileCount, data.source_file_count, sourceFileCandidates.length)),
      workerReportCount: Number(firstNonEmpty(data.workerReportCount, data.worker_report_count, workerReport.reports.length)),
      errorCandidateCount: Number(firstNonEmpty(data.errorCandidateCount, data.error_candidate_count, errorCandidates.length)),
      collector_status: safeString(firstNonEmpty(data.collector_status, data.collectorStatus, 'UNKNOWN')),
      batch_record_id: gateInputs.batch_record_id,
      batchId: safeString(firstNonEmpty(data.batchId, data.batch_id, '')),
      batch_status: gateInputs.batch_status,
      batch_appended: data.batch_appended === true || data.batchAppended === true || data.batch_store_appended === true || data.batchStoreAppended === true
    },
    source_file_candidates: sourceFileCandidates,
    worker_report: workerReport,
    workerReports: workerReport.reports,
    errorCandidates,
    gate_inputs: gateInputs,
    gate_recommendation: null,
    next_commander_action: null,
    original_response_shape_preserved: true,
    original_response: opts.includeOriginalResponse === true ? response : undefined
  };

  handoff.source_file_candidates.forEach((candidate) => {
    candidate.false_pass_claim_detected = workerReport.false_pass_claim_detected;
    if (workerReport.false_pass_claim_detected && candidate.gate_candidate_status === 'GREEN_CANDIDATE_READY') {
      candidate.gate_candidate_status = 'YELLOW_CANDIDATE_REVIEW_REQUIRED';
    }
  });

  handoff.gate_recommendation = buildGateRecommendation(handoff);
  handoff.next_commander_action = buildNextCommanderAction(handoff.gate_recommendation);
  return handoff;
}

function normalizeCollectorResponseToGateHandoff(response, options) {
  const handoff = normalizeCollectorResponseToGateHandoff__ST4W45_VERSION_ORIGINAL(response, options);
  return __st4W45ApplyVersionMetadataToGateHandoff(handoff, response, options);
}


module.exports = {
  ADAPTER_VERSION,
  normalizeCollectorResponseToGateHandoff,
  normalizeSourceFileCandidates,
  normalizeWorkerReport,
  detectFalsePassClaim,
  detectOmittedCodeCandidate,
  buildSyntaxCheckPlan,
  buildDuplicatePathCheck,
  buildGateRecommendation,
  buildNextCommanderAction
};
/* ST4_W44_COLLECTOR_COMMANDER_GATE_HANDOFF_ADAPTER_END */
/* SOURCE_FACTORY_W54_PROJECT_PANEL_NAMESPACE_METADATA_START */
(function sfW54InstallProjectPanelNamespaceMetadata() {
  if (typeof module === "undefined" || !module.exports) return;
  if (module.exports.__sfW54ProjectPanelNamespaceMetadataApplied_collectorCommanderGateHandoffAdapter) return;

  var helper = null;
  try {
    helper = require("./projectPanelIdentityHelper");
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
    "normalizeCollectorResponseToGateHandoff",
    "buildCollectorCommanderGateHandoff",
    "createCollectorCommanderGateHandoff",
    "buildGateReportSummary",
    "createGateReportSummary"
  ];
  var wrappedExports = [];
  candidateExports.forEach(function wrapCandidate(exportName) {
    if (wrapExport(exportName)) wrappedExports.push(exportName);
  });

  Object.defineProperty(module.exports, "__sfW54ProjectPanelNamespaceMetadataApplied_collectorCommanderGateHandoffAdapter", { value: true, enumerable: false });
  module.exports.__sfW54ProjectPanelNamespaceMetadata = Object.assign({}, module.exports.__sfW54ProjectPanelNamespaceMetadata || {}, {
    version: "W54_PROJECT_PANEL_NAMESPACE_METADATA_COMMANDER_HOTFIX_V1",
    target_key: "collectorCommanderGateHandoffAdapter",
    scope: "collector_gate_handoff_report_envelope_only",
    helper_require: "./projectPanelIdentityHelper",
    candidate_exports: candidateExports,
    wrapped_exports: wrappedExports,
    metadata_fields: ["project_id", "project_name", "panel_id", "panel_instance_id", "project_panel_identity"],
    old_records_migration: "forbidden",
    legacy_records_without_project_id: "allowed"
  });
}());
/* SOURCE_FACTORY_W54_PROJECT_PANEL_NAMESPACE_METADATA_END */
