const path = require('path');
const registry = require(path.join(process.argv[2], 'src/runtime_pipeline/sourceFactoryRuntimePipelineRegistry.js'));
const contract = registry.getRuntimePipelineContract();
const paths = registry.listRuntimeSourcePaths();
const resolved = paths.map((p) => registry.resolveRuntimePath(process.argv[2], p));
if (!contract || contract.status !== 'PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017') {
  throw new Error('CONTRACT_STATUS_MISMATCH');
}
if (!Array.isArray(paths) || paths.length !== 9) {
  throw new Error('RUNTIME_SOURCE_PATH_COUNT_MISMATCH:' + (Array.isArray(paths) ? paths.length : 'not-array'));
}
if (!resolved.every((p) => typeof p === 'string' && p.includes(process.argv[2]))) {
  throw new Error('RESOLVE_RUNTIME_PATH_FAILED');
}
console.log('PASS_REGISTRY_SMOKE paths=' + paths.length);