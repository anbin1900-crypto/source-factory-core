from __future__ import annotations
import io,json,unittest
from contextlib import redirect_stderr,redirect_stdout
from dataclasses import dataclass
from unittest.mock import patch
import pdf_to_csv_pipeline_orchestrator as mod

@dataclass
class Chunk: chunk_no:int; page_start:int; page_end:int; text:str
@dataclass
class SourcePlan: output_relative_dir:str='source-00000001'
@dataclass
class ChunkPlan: chunk_no:int; csv_filename:str

def selection(mode='FOLDER',count=1):
    return {'input_mode':mode,'source_folder':'/src','selected_pdf':'/src/a.pdf' if mode=='PDF_FILE' else None,'output_folder':'/out','pdf_count':count,'ready_for_processing':count>0,'inventory':{'schema_version':'PDF_FOLDER_INVENTORY_V1','selected_folder':'/src','pdf_count':count,'files':[]}}

def extraction(records=None,failed=0):
    records=records if records is not None else [{'page_no':1,'text':'abcdef'}]
    files=[{'processing_order':1,'relative_path':'a.pdf','file_name':'a.pdf','source_path':'/src/a.pdf','status':'PASS','error':None,'extraction':{'page_count':len(records),'records':records}}]
    if failed: files[0]['status']='ERROR'; files[0]['error']={'code':'X'}; files[0]['extraction']=None
    return {'failed_file_count':failed,'files':files}

def fake_chunks(*a,**k): return [Chunk(1,1,1,'abc'),Chunk(2,1,1,'def')]
def fake_source_plan(*a,**k): return SourcePlan()
def fake_chunk_plans(_sp,entries): return [ChunkPlan(n,f'c{n}.csv') for n,_,_ in entries]
def fake_write(chunks,**k): return [{'encoding':'UTF-8-SIG','filename':f'c{c.chunk_no}.csv','path':f'/out/c{c.chunk_no}.csv'} for c in chunks]

class PipelineTests(unittest.TestCase):
    def run_ok(self, *, mode='FOLDER', records=None, progress=None):
        with patch.object(mod,'adapt_input_selection',side_effect=lambda m,p,o: selection(m)), patch.object(mod,'run_inventory_extraction',return_value=extraction(records)), patch.object(mod,'build_source_output_plan',side_effect=fake_source_plan), patch.object(mod,'plan_chunk_outputs',side_effect=fake_chunk_plans), patch.object(mod,'chunk_pages',side_effect=fake_chunks), patch.object(mod,'write_chunks',side_effect=fake_write):
            kw={'output_folder':'/out','max_chars':3,'progress':progress}
            if mode=='FOLDER': kw['source_folder']='/src'
            else: kw['pdf_file']='/src/a.pdf'
            return mod.run_pipeline(**kw)
    def test_folder_mode(self): self.assertEqual(self.run_ok()['input_mode'],'FOLDER')
    def test_pdf_mode(self): self.assertEqual(self.run_ok(mode='PDF_FILE')['input_mode'],'PDF_FILE')
    def test_mode_aliases(self):
        r=self.run_ok(mode='PDF_FILE'); self.assertEqual(r['input_mode'],r['selection_mode']); self.assertEqual(r['selected_pdf'],r['selected_pdf_file'])
    def test_both_inputs_rejected(self):
        with self.assertRaises(mod.PipelineError) as cm: mod.run_pipeline(output_folder='/o',source_folder='/s',pdf_file='/x.pdf')
        self.assertEqual(cm.exception.code,'EXACTLY_ONE_SOURCE_MODE_REQUIRED')
    def test_no_input_rejected(self):
        with self.assertRaises(mod.PipelineError) as cm: mod.run_pipeline(output_folder='/o')
        self.assertEqual(cm.exception.code,'EXACTLY_ONE_SOURCE_MODE_REQUIRED')
    def test_bad_chunk_limit_rejected(self):
        with self.assertRaises(mod.PipelineError) as cm: mod.run_pipeline(output_folder='/o',source_folder='/s',max_chars=0)
        self.assertEqual(cm.exception.code,'MAX_CHARS_INVALID')
    def test_no_pdf_rejected(self):
        with patch.object(mod,'adapt_input_selection',return_value=selection('FOLDER',0)):
            with self.assertRaises(mod.PipelineError) as cm: mod.run_pipeline(output_folder='/o',source_folder='/s')
        self.assertEqual(cm.exception.code,'NO_PDF_FILES')
    def test_extraction_failure_recorded(self):
        ev=[]
        with patch.object(mod,'adapt_input_selection',return_value=selection()), patch.object(mod,'run_inventory_extraction',return_value=extraction(failed=1)):
            with self.assertRaises(mod.PipelineError) as cm: mod.run_pipeline(output_folder='/o',source_folder='/s',progress=ev.append)
        self.assertEqual(cm.exception.code,'EXTRACTION_FAILED'); self.assertEqual(ev[-1]['stage'],'ERROR')
    def test_page_order_rejected(self):
        with patch.object(mod,'adapt_input_selection',return_value=selection()), patch.object(mod,'run_inventory_extraction',return_value=extraction([{'page_no':2,'text':'x'}])), patch.object(mod,'build_source_output_plan',side_effect=fake_source_plan):
            with self.assertRaises(mod.PipelineError) as cm: mod.run_pipeline(output_folder='/o',source_folder='/s')
        self.assertEqual(cm.exception.code,'PAGE_ORDER_INVALID')
    def test_page_count_rejected(self):
        e=extraction(); e['files'][0]['extraction']['page_count']=2
        with patch.object(mod,'adapt_input_selection',return_value=selection()), patch.object(mod,'run_inventory_extraction',return_value=e), patch.object(mod,'build_source_output_plan',side_effect=fake_source_plan):
            with self.assertRaises(mod.PipelineError) as cm: mod.run_pipeline(output_folder='/o',source_folder='/s')
        self.assertEqual(cm.exception.code,'PAGE_COUNT_MISMATCH')
    def test_chunk_limit_rechecked(self):
        with patch.object(mod,'adapt_input_selection',return_value=selection()), patch.object(mod,'run_inventory_extraction',return_value=extraction()), patch.object(mod,'build_source_output_plan',side_effect=fake_source_plan), patch.object(mod,'chunk_pages',return_value=[Chunk(1,1,1,'abcd')]):
            with self.assertRaises(mod.PipelineError) as cm: mod.run_pipeline(output_folder='/o',source_folder='/s',max_chars=3)
        self.assertEqual(cm.exception.code,'CHUNK_LIMIT_EXCEEDED')
    def test_utf8_sig_manifest_rechecked(self):
        with patch.object(mod,'adapt_input_selection',return_value=selection()), patch.object(mod,'run_inventory_extraction',return_value=extraction()), patch.object(mod,'build_source_output_plan',side_effect=fake_source_plan), patch.object(mod,'chunk_pages',side_effect=fake_chunks), patch.object(mod,'plan_chunk_outputs',side_effect=fake_chunk_plans), patch.object(mod,'write_chunks',return_value=[{'encoding':'UTF-8'},{'encoding':'UTF-8'}]):
            with self.assertRaises(mod.PipelineError) as cm: mod.run_pipeline(output_folder='/o',source_folder='/s',max_chars=3)
        self.assertEqual(cm.exception.code,'CSV_ENCODING_MISMATCH')
    def test_write_count_rechecked(self):
        with patch.object(mod,'adapt_input_selection',return_value=selection()), patch.object(mod,'run_inventory_extraction',return_value=extraction()), patch.object(mod,'build_source_output_plan',side_effect=fake_source_plan), patch.object(mod,'chunk_pages',side_effect=fake_chunks), patch.object(mod,'plan_chunk_outputs',side_effect=fake_chunk_plans), patch.object(mod,'write_chunks',return_value=[]):
            with self.assertRaises(mod.PipelineError) as cm: mod.run_pipeline(output_folder='/o',source_folder='/s',max_chars=3)
        self.assertEqual(cm.exception.code,'CSV_WRITE_COUNT_MISMATCH')
    def test_success_events_persisted(self):
        r=self.run_ok(); self.assertEqual(r['events'][0]['stage'],'SELECTION_START'); self.assertEqual(r['events'][-1]['stage'],'COMPLETE')
    def test_callback_equals_event_stream(self):
        ev=[]; r=self.run_ok(progress=ev.append); self.assertEqual(ev,r['events'])
    def test_success_counts(self):
        r=self.run_ok(); self.assertEqual((r['pdf_count'],r['chunk_count']),(1,2))
    def test_semantic_boundaries(self):
        r=self.run_ok(); self.assertFalse(r['semantic_analysis']); self.assertFalse(r['gpt_call']); self.assertFalse(r['database_write'])
    def test_unexpected_error_wrapped(self):
        with patch.object(mod,'adapt_input_selection',side_effect=OSError('boom')):
            with self.assertRaises(mod.PipelineError) as cm: mod.run_pipeline(output_folder='/o',source_folder='/s')
        self.assertEqual(cm.exception.code,'PIPELINE_UNEXPECTED_ERROR'); self.assertEqual(cm.exception.details['events'][-1]['stage'],'ERROR')
    def test_cli_error_json(self):
        err=io.StringIO(); e=mod.PipelineError('X','INPUT'); e.details={'events':[{'stage':'ERROR'}]}
        with patch.object(mod,'run_pipeline',side_effect=e), redirect_stderr(err): rc=mod.main(['--source-folder','/s','--output-folder','/o','--compact'])
        payload=json.loads(err.getvalue()); self.assertEqual(rc,2); self.assertEqual(payload['error']['error_code'],'X')
    def test_cli_success_json(self):
        out=io.StringIO()
        with patch.object(mod,'run_pipeline',return_value={'status':'PASS'}), redirect_stdout(out): rc=mod.main(['--pdf-file','/x.pdf','--output-folder','/o','--compact'])
        self.assertEqual(rc,0); self.assertEqual(json.loads(out.getvalue())['status'],'PASS')

if __name__=='__main__': unittest.main(verbosity=2)
