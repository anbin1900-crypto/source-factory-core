'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class WorkControlEventLog {
  constructor(file) { if (!file) throw new Error('LOG_PATH_REQUIRED'); this.file = file; }
  append(event) {
    if (!event || !event.type || !event.role) throw new Error('INVALID_WORK_CONTROL_EVENT');
    fs.mkdirSync(path.dirname(this.file), {recursive:true});
    const row = {...event, ts:event.ts || new Date().toISOString()};
    const canonical = JSON.stringify(row);
    row.sha256 = crypto.createHash('sha256').update(canonical).digest('hex');
    fs.appendFileSync(this.file, JSON.stringify(row) + '\n', {encoding:'utf8', flag:'a'});
    return row;
  }
  readAll() {
    if (!fs.existsSync(this.file)) return [];
    return fs.readFileSync(this.file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  }
  verify() {
    return this.readAll().every(row => {
      const {sha256, ...body} = row;
      return sha256 === crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
    });
  }
}
module.exports = { WorkControlEventLog };
