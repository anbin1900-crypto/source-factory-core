import { spawn } from 'node:child_process';

export function verifyZipWithPython(zipPath) {
  return new Promise((resolve) => {
    const script = [
      'import sys, zipfile, json',
      'p=sys.argv[1]',
      'try:',
      '  z=zipfile.ZipFile(p)',
      '  bad=z.testzip()',
      '  names=z.namelist()',
      '  print(json.dumps({"zip_path":p,"zip_integrity_pass":bad is None,"bad_entry":bad,"entry_count":len(names),"entries":names[:50]}, ensure_ascii=False))',
      'except Exception as e:',
      '  print(json.dumps({"zip_path":p,"zip_integrity_pass":False,"error":str(e)}, ensure_ascii=False))',
      '  sys.exit(1)'
    ].join('\n');
    const child = spawn('python', ['-c', script, zipPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      try {
        resolve({ code, stderr, ...JSON.parse(stdout) });
      } catch {
        resolve({ code, stderr, zip_integrity_pass: false, raw_stdout: stdout });
      }
    });
  });
}
