'use strict';
const fs = require('fs');
const path = require('path');
const { bindLiveEventStream } = require('./live_event_binding.cjs');

function readEvents(inputPath) {
  const raw = fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '').trim();
  if (!raw) throw new Error('EVENT_STREAM_EMPTY');
  if (raw.startsWith('[') || raw.startsWith('{')) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.events)) return parsed.events;
    throw new Error('JSON_EVENT_ARRAY_REQUIRED');
  }
  return raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`NDJSON_PARSE_FAILED_LINE_${index + 1}:${error.message}`); }
  });
}

function main(argv) {
  const inputPath = argv[2];
  const outputPath = argv[3];
  const sourceHead = argv[4] || null;
  if (!inputPath || !outputPath) {
    throw new Error('USAGE: node run_live_event_binding.cjs <events.json|events.ndjson> <handoff.json> [a3-source-head]');
  }
  const events = readEvents(path.resolve(inputPath));
  const handoff = bindLiveEventStream(events, { sourceHead });
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), JSON.stringify(handoff, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({
    output: path.resolve(outputPath),
    fieldCount: handoff.pass.fieldCount,
    locatorCount: handoff.pass.locatorCount,
    highlightCount: handoff.pass.highlightCount,
    liveEventCount: handoff.source.liveEventCount,
    handoffSha256: handoff.handoffSha256
  }) + '\n');
}

if (require.main === module) {
  try { main(process.argv); }
  catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
}

module.exports = { readEvents, main };
