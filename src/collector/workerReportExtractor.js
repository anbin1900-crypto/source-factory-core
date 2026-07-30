export function extractWorkerReport(text) {
  if (typeof text !== 'string') throw new Error('text must be a string');
  const start = text.indexOf('WORKER_REPORT_START');
  const end = text.indexOf('WORKER_REPORT_END');
  if (start === -1 || end === -1 || end < start) {
    return { found: false, raw: '', fields: {} };
  }
  const raw = text.slice(start, end + 'WORKER_REPORT_END'.length);
  return {
    found: true,
    raw,
    fields: parseWorkerReportFields(raw)
  };
}

export function parseWorkerReportFields(raw) {
  const fields = {};
  const lines = raw.split(/\r?\n/);
  let currentKey = null;
  for (const line of lines) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (match) {
      currentKey = match[1];
      fields[currentKey] = match[2] || '';
      continue;
    }
    const bullet = line.match(/^\s*-\s*(.*)$/);
    if (bullet && currentKey) {
      if (!Array.isArray(fields[currentKey])) fields[currentKey] = fields[currentKey] ? [fields[currentKey]] : [];
      fields[currentKey].push(bullet[1]);
    }
  }
  return fields;
}
