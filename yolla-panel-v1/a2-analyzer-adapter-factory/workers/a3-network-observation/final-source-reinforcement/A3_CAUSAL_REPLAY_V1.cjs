'use strict';
const fs=require('node:fs'); const path=require('node:path'); const {normalizeObservation,buildCausalGraph,sha256}=require('./A3_ALIAS_SAFE_NORMALIZER_V1.cjs');
function replay(){
  const matrix=JSON.parse(fs.readFileSync(path.join(__dirname,'A3_CAUSAL_FIXTURE_MATRIX_V1.json'),'utf8'));
  const observations=[];
  for(const c of matrix.cases){observations.push(normalizeObservation(c.input));if(c.repeat===2)observations.push(normalizeObservation(c.input));}
  const graph=buildCausalGraph(observations);
  const out={schema_version:'A3_CAUSAL_FIXTURE_REPLAY_V1',case_count:matrix.cases.length,observation_count:observations.length,node_count:graph.nodes.length,edge_count:graph.edges.length,graph_sha256:'sha256:'+sha256(graph),deterministic:true};
  process.stdout.write(JSON.stringify(out,null,2)+'\n'); return out;
}
if(require.main===module)replay(); module.exports={replay};
