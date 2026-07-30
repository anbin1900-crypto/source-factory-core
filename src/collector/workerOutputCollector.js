import fs from 'node:fs/promises';
import path from 'node:path';
import { extractWorkerReport } from './workerReportExtractor.js';

export async function saveWorkerOutput({ outputDir, outputText, result = {} }) {
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'output.txt');
  const reportPath = path.join(outputDir, 'WORKER_REPORT.md');
  const resultPath = path.join(outputDir, 'RESULT.json');

  await fs.writeFile(outputPath, outputText, 'utf8');

  const extracted = extractWorkerReport(outputText);
  if (extracted.found) {
    await fs.writeFile(reportPath, extracted.raw, 'utf8');
  }

  await fs.writeFile(resultPath, JSON.stringify({
    ...result,
    worker_report_found: extracted.found,
    worker_report_fields: extracted.fields,
    saved_at: new Date().toISOString()
  }, null, 2), 'utf8');

  return { outputPath, reportPath: extracted.found ? reportPath : null, resultPath };
}
