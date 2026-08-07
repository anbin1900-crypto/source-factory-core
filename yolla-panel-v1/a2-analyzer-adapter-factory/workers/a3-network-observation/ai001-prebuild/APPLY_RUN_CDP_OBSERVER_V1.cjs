'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { BrowserCdpConnection, CdpObserverModuleV1 } = require('./CDP_OBSERVER_MODULE_V1.cjs');

function argsOf(argv) {
  const result = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { result[key] = next; i += 1; }
    else result[key] = true;
  }
  return result;
}

async function main() {
  const args = argsOf(process.argv);
  if (args['mock-smoke']) return require('./mock_smoke_v1.cjs').runSmoke();
  const browserUrl = args['browser-url'] || process.env.YOLLA_BROWSER_CDP_URL || 'http://127.0.0.1:9222';
  const statePath = path.resolve(args['state'] || './runtime/a3-cdp-observer-state.json');
  const outputPath = path.resolve(args['output'] || './runtime/a3-cdp-evidence.ndjson');
  const durationMs = Number(args['duration-ms'] || 30000);
  const connection = await new BrowserCdpConnection({ browserUrl }).connect();
  const observer = new CdpObserverModuleV1({ transport: connection, statePath });
  observer.loadStateFromFile(statePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const evidence = fs.createWriteStream(outputPath, { flags: 'a' });
  observer.on('evidence', (event) => evidence.write(`${JSON.stringify(event)}\n`));
  await observer.start({ target: { target_id: args['page-id'], url_contains: args['url-contains'], title_contains: args['title-contains'] } });
  if (args['action']) observer.recordAction({ action_type: args['action'] });
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  await observer.stop('duration_elapsed');
  evidence.end();
  await connection.close();
  process.stdout.write(`${JSON.stringify({ status: 'PASS', browser_url: browserUrl, page_id: observer.state.page_id, state_path: statePath, output_path: outputPath, counters: observer.state.counters }, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: 'BLOCKED', error: error.message }, null, 2)}\n`);
  process.exitCode = 2;
});
