'use strict';

/**
 * Stage 4 Download Resource Extractor
 *
 * Purpose:
 * - Extract resource candidates from TAERA panel text.
 * - Detect http/https URLs, sandbox:/mnt/data links, markdown links, and relative file path candidates.
 * - Return resources, duplicates, invalidCandidates, and summary.
 * - This helper does not download files, call network APIs, execute code, or modify runtime bindings.
 *
 * Usage example:
 *
 * const { extractDownloadResources } = require('./downloadResourceExtractor');
 *
 * const result = extractDownloadResources(taeraText, { terminalRole: 'TAERA' });
 * console.log(result.resources);
 * console.log(result.summary);
 */

const RESOURCE_TYPES = Object.freeze({
  HTTP_URL: 'HTTP_URL',
  HTTPS_URL: 'HTTPS_URL',
  SANDBOX_LINK: 'SANDBOX_LINK',
  RELATIVE_FILE_PATH: 'RELATIVE_FILE_PATH',
  MARKDOWN_LINK: 'MARKDOWN_LINK',
  UNKNOWN: 'UNKNOWN'
});

const ROUTE_HINTS = Object.freeze({
  TAERA_RESOURCE: 'TAERA_RESOURCE',
  DOWNLOAD_STATION: 'DOWNLOAD_STATION',
  STORAGE_STATION: 'STORAGE_STATION',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED'
});

const COMMON_FILE_EXTENSIONS = Object.freeze([
  'txt',
  'md',
  'json',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'py',
  'bat',
  'ps1',
  'html',
  'css',
  'csv',
  'xlsx',
  'xls',
  'docx',
  'pptx',
  'pdf',
  'zip',
  '7z',
  'rar',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'svg',
  'log'
]);

function normalizeRawText(rawText) {
  if (rawText === null || rawText === undefined) {
    return '';
  }

  if (typeof rawText === 'string') {
    return rawText;
  }

  if (typeof rawText === 'object') {
    try {
      return JSON.stringify(rawText, null, 2);
    } catch (error) {
      return String(rawText);
    }
  }

  return String(rawText);
}

function stripWrappingCharacters(value) {
  return String(value || '')
    .trim()
    .replace(/^<+|>+$/g, '')
    .replace(/^["'`]+|["'`]+$/g, '');
}

function stripTrailingSentencePunctuation(value) {
  let output = stripWrappingCharacters(value);

  while (/[.,;:!?]$/.test(output)) {
    output = output.slice(0, -1);
  }

  return output;
}

function normalizeResourceValue(value) {
  return stripTrailingSentencePunctuation(value).replace(/\\/g, '/');
}

function getFileExtension(value) {
  const cleanValue = String(value || '').split(/[?#]/)[0];
  const match = cleanValue.match(/\.([A-Za-z0-9]+)$/);

  if (!match) {
    return '';
  }

  return match[1].toLowerCase();
}

function isHttpUrl(value) {
  return /^https?:\/\/[^\s]+$/i.test(String(value || '').trim());
}

function isSandboxLink(value) {
  return /^sandbox:\/mnt\/data\/[^\s]+$/i.test(String(value || '').trim());
}

function isRelativeFilePath(value) {
  const cleanValue = String(value || '').trim();

  if (!cleanValue) {
    return false;
  }

  if (/^[A-Za-z]+:\/\//.test(cleanValue)) {
    return false;
  }

  if (/^sandbox:\//i.test(cleanValue)) {
    return false;
  }

  if (/^[A-Za-z]:[\\/]/.test(cleanValue)) {
    return false;
  }

  if (cleanValue.indexOf('\n') !== -1 || cleanValue.indexOf('\r') !== -1) {
    return false;
  }

  const extension = getFileExtension(cleanValue);

  if (extension && COMMON_FILE_EXTENSIONS.indexOf(extension) !== -1) {
    return (
      cleanValue.indexOf('/') !== -1 ||
      cleanValue.indexOf('\\') !== -1 ||
      cleanValue.indexOf('.') !== -1
    );
  }

  return false;
}

function detectResourceType(value) {
  const normalized = normalizeResourceValue(value);

  if (/^https:\/\//i.test(normalized)) {
    return RESOURCE_TYPES.HTTPS_URL;
  }

  if (/^http:\/\//i.test(normalized)) {
    return RESOURCE_TYPES.HTTP_URL;
  }

  if (isSandboxLink(normalized)) {
    return RESOURCE_TYPES.SANDBOX_LINK;
  }

  if (isRelativeFilePath(normalized)) {
    return RESOURCE_TYPES.RELATIVE_FILE_PATH;
  }

  return RESOURCE_TYPES.UNKNOWN;
}

function makeResourceId(type, value, index) {
  const compactValue = String(value || '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

  return [
    'TAERA_RESOURCE',
    type || RESOURCE_TYPES.UNKNOWN,
    String(index).padStart(3, '0'),
    compactValue || 'candidate'
  ].join('_');
}

function buildResource(type, value, source, startIndex, endIndex, extra) {
  const normalizedValue = normalizeResourceValue(value);

  return Object.assign(
    {
      resource_id: '',
      resource_type: type,
      value: normalizedValue,
      original_value: String(value || ''),
      source: source,
      startIndex: Number.isInteger(startIndex) ? startIndex : -1,
      endIndex: Number.isInteger(endIndex) ? endIndex : -1,
      routeHints: [
        ROUTE_HINTS.TAERA_RESOURCE,
        ROUTE_HINTS.DOWNLOAD_STATION,
        ROUTE_HINTS.STORAGE_STATION
      ],
      needsDownloadExecution: false
    },
    extra || {}
  );
}

function addCandidate(state, resource) {
  const key = resource.resource_type + '::' + resource.value;

  if (state.seen.has(key)) {
    state.duplicates.push(Object.assign({}, resource, {
      duplicateOf: state.seen.get(key).resource_id
    }));
    return;
  }

  resource.resource_id = makeResourceId(resource.resource_type, resource.value, state.resources.length + 1);
  state.seen.set(key, resource);
  state.resources.push(resource);
}

function addInvalidCandidate(state, value, reason, source, startIndex, endIndex, extra) {
  state.invalidCandidates.push(Object.assign(
    {
      value: String(value || ''),
      reason: reason,
      source: source,
      startIndex: Number.isInteger(startIndex) ? startIndex : -1,
      endIndex: Number.isInteger(endIndex) ? endIndex : -1,
      routeHints: [ROUTE_HINTS.REVIEW_REQUIRED]
    },
    extra || {}
  ));
}

function extractMarkdownLinks(text, state) {
  const pattern = /\[([^\]\r\n]+)\]\(([^)\r\n]+)\)/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const label = match[1].trim();
    const rawTarget = match[2].trim();
    const targetWithoutTitle = rawTarget.replace(/\s+["'][^"']*["']\s*$/g, '').trim();
    const normalizedTarget = normalizeResourceValue(targetWithoutTitle);
    const targetType = detectResourceType(normalizedTarget);
    const startIndex = match.index;
    const endIndex = pattern.lastIndex;

    if (targetType === RESOURCE_TYPES.UNKNOWN) {
      addInvalidCandidate(
        state,
        rawTarget,
        'markdown_link_target_not_supported_resource',
        RESOURCE_TYPES.MARKDOWN_LINK,
        startIndex,
        endIndex,
        { label: label }
      );
      continue;
    }

    addCandidate(state, buildResource(
      RESOURCE_TYPES.MARKDOWN_LINK,
      normalizedTarget,
      RESOURCE_TYPES.MARKDOWN_LINK,
      startIndex,
      endIndex,
      {
        label: label,
        target_type: targetType,
        raw_markdown: match[0]
      }
    ));
  }
}

function extractHttpUrls(text, state) {
  const pattern = /\bhttps?:\/\/[^\s<>"'`]+/gi;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const rawValue = match[0];
    const normalizedValue = normalizeResourceValue(rawValue);
    const type = detectResourceType(normalizedValue);

    if (type !== RESOURCE_TYPES.HTTP_URL && type !== RESOURCE_TYPES.HTTPS_URL) {
      addInvalidCandidate(
        state,
        rawValue,
        'invalid_http_url_candidate',
        'RAW_URL',
        match.index,
        pattern.lastIndex
      );
      continue;
    }

    addCandidate(state, buildResource(
      type,
      normalizedValue,
      'RAW_URL',
      match.index,
      pattern.lastIndex
    ));
  }
}

function extractSandboxLinks(text, state) {
  const pattern = /sandbox:\/mnt\/data\/[^\s<>"'`)]+/gi;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const rawValue = match[0];
    const normalizedValue = normalizeResourceValue(rawValue);

    if (!isSandboxLink(normalizedValue)) {
      addInvalidCandidate(
        state,
        rawValue,
        'invalid_sandbox_link_candidate',
        'SANDBOX_SCAN',
        match.index,
        pattern.lastIndex
      );
      continue;
    }

    addCandidate(state, buildResource(
      RESOURCE_TYPES.SANDBOX_LINK,
      normalizedValue,
      'SANDBOX_SCAN',
      match.index,
      pattern.lastIndex
    ));
  }
}

function extractRelativeFilePaths(text, state) {
  const extensionPattern = COMMON_FILE_EXTENSIONS.join('|');
  const pattern = new RegExp(
    String.raw`(?:^|[\s"'(])((?:\.{1,2}[\\/])?(?:[A-Za-z0-9_.-]+[\\/])+[A-Za-z0-9_.-]+\.(` + extensionPattern + String.raw`)|[A-Za-z0-9_.-]+\.(` + extensionPattern + String.raw`))(?=$|[\s"',).;:!?])`,
    'gi'
  );
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const rawValue = match[1];
    const startIndex = match.index + match[0].indexOf(rawValue);
    const endIndex = startIndex + rawValue.length;
    const normalizedValue = normalizeResourceValue(rawValue);

    if (!isRelativeFilePath(normalizedValue)) {
      addInvalidCandidate(
        state,
        rawValue,
        'invalid_relative_file_path_candidate',
        'RELATIVE_PATH_SCAN',
        startIndex,
        endIndex
      );
      continue;
    }

    addCandidate(state, buildResource(
      RESOURCE_TYPES.RELATIVE_FILE_PATH,
      normalizedValue,
      'RELATIVE_PATH_SCAN',
      startIndex,
      endIndex,
      {
        extension: getFileExtension(normalizedValue)
      }
    ));
  }
}

function summarizeResources(resources, duplicates, invalidCandidates) {
  const byType = {};

  for (const resource of resources) {
    if (!Object.prototype.hasOwnProperty.call(byType, resource.resource_type)) {
      byType[resource.resource_type] = 0;
    }

    byType[resource.resource_type] += 1;

    if (resource.resource_type === RESOURCE_TYPES.MARKDOWN_LINK) {
      const targetTypeKey = 'MARKDOWN_TARGET_' + String(resource.target_type || RESOURCE_TYPES.UNKNOWN);

      if (!Object.prototype.hasOwnProperty.call(byType, targetTypeKey)) {
        byType[targetTypeKey] = 0;
      }

      byType[targetTypeKey] += 1;
    }
  }

  return {
    resourceCount: resources.length,
    duplicateCount: duplicates.length,
    invalidCandidateCount: invalidCandidates.length,
    byType: byType,
    hasDownloadResource: resources.length > 0,
    needsManualReview: invalidCandidates.length > 0,
    executionPerformed: false
  };
}

function extractDownloadResources(rawText, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const text = normalizeRawText(rawText);

  const state = {
    resources: [],
    duplicates: [],
    invalidCandidates: [],
    seen: new Map()
  };

  extractMarkdownLinks(text, state);
  extractSandboxLinks(text, state);
  extractHttpUrls(text, state);
  extractRelativeFilePaths(text, state);

  return {
    terminalRole: String(opts.terminalRole || opts.terminal || 'TAERA').trim().toUpperCase() || 'TAERA',
    resources: state.resources,
    duplicates: state.duplicates,
    invalidCandidates: state.invalidCandidates,
    summary: summarizeResources(state.resources, state.duplicates, state.invalidCandidates),
    supportedResourceTypes: Object.keys(RESOURCE_TYPES).map(function mapType(key) {
      return RESOURCE_TYPES[key];
    }),
    notes: [
      'extractor_only_no_download_execution',
      'network_calls_not_performed',
      'commander_or_resource_manager_should_decide_final_use'
    ]
  };
}

module.exports = {
  extractDownloadResources,
  RESOURCE_TYPES,
  ROUTE_HINTS,
  COMMON_FILE_EXTENSIONS
};