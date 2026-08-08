#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const {infer}=require('./STRUCTURE_INFERENCE_ENGINE_V1.cjs');const input=process.argv[2];if(!input){console.error('usage: node a4_structure_infer.cjs <input.json> [output.json]');process.exit(2);}const result=infer(JSON.parse(fs.readFileSync(path.resolve(input),'utf8'))),text=JSON.stringify(result,null,2)+'\n';if(process.argv[3])fs.writeFileSync(path.resolve(process.argv[3]),text);else process.stdout.write(text);
