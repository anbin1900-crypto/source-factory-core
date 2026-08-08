import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const required=[
  ['SITE_ANALYZER_PANEL_VIEWMODEL_V1.json','SITE_ANALYZER_PANEL_VIEWMODEL_V1'],
  ['SMART_INSPECTOR_CONTRACT_V1.json','SMART_INSPECTOR_CONTRACT_V1'],
  ['TRACE_DRAWER_CONTRACT_V1.json','TRACE_DRAWER_CONTRACT_V1'],
  ['SUCCESSOR_UI_BOOTSTRAP_PLAN_V1.json','SUCCESSOR_UI_BOOTSTRAP_PLAN_V1'],
];
export function loadContracts(root=ROOT){
  return Object.fromEntries(required.map(([file,schema])=>{
    const p=path.join(root,file); const obj=JSON.parse(fs.readFileSync(p,'utf8'));
    if(obj.schema_version!==schema) throw new Error(`SCHEMA_MISMATCH:${file}`);
    if(obj.control_plane_only!==true||obj.runtime_owned_by_ui!==false) throw new Error(`BOUNDARY_MISMATCH:${file}`);
    return [schema,obj];
  }));
}
export function buildInitialViewState(contracts){
  const vm=contracts.SITE_ANALYZER_PANEL_VIEWMODEL_V1;
  return {
    schema_version:'SITE_ANALYZER_PANEL_VIEW_STATE_V1',
    view_state_id:'b2-prebuild-default',
    selected_workflow_node_id:null, selected_page_id:null, selected_frame_id:null,
    selected_element_ref:null, selected_request_id:null, selected_preview_row_id:null,
    selected_preview_field_key:null, active_inspector_tab:vm.smart_inspector.tabs[0],
    trace_filters:{categories:[],page_id:null,severity:null}, trace_cursor:null,
    workflow_viewport:{x:0,y:0,zoom:1}, expanded_panels:['workflow','live_session','smart_inspector','data_preview'],
    updated_at:null
  };
}
