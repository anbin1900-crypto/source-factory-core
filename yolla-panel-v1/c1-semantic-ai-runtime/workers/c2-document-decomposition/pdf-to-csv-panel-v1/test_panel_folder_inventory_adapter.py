#!/usr/bin/env python3
from __future__ import annotations
import json, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import panel_folder_inventory_adapter as a

class RegressionT(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.root=Path(self.tmp.name); self.src=self.root/'src'; self.out=self.root/'out'; self.src.mkdir(); self.out.mkdir()
    def tearDown(self): self.tmp.cleanup()
    def pdf(self,p,data=b'%PDF'):
        f=self.src/p; f.parent.mkdir(parents=True,exist_ok=True); f.write_bytes(data); return f
    def bad(self,**kw):
        d={'schema_version':'PDF_FOLDER_INVENTORY_V1','selected_folder':str(self.src.resolve()),'pdf_count':0,'files':[],'inventory_sha256':'0'*64}; d.update(kw); return d
    def test_01_ready(self): self.pdf('a.pdf'); self.assertEqual(a.adapt_folder_selection(self.src,self.out)['selection_status'],'READY')
    def test_02_resolved_paths(self): self.pdf('a.pdf'); r=a.adapt_folder_selection(self.src,self.out); self.assertEqual((r['source_folder'],r['output_folder']),(str(self.src.resolve()),str(self.out.resolve())))
    def test_03_pointer(self): self.pdf('a.pdf'); self.assertEqual(a.adapt_folder_selection(self.src,self.out)['cycle1_pointer_blob'],a.CYCLE1_POINTER_BLOB)
    def test_04_schema(self): self.pdf('a.pdf'); self.assertEqual(a.adapt_folder_selection(self.src,self.out)['inventory']['schema_version'],'PDF_FOLDER_INVENTORY_V1')
    def test_05_recursive(self): self.pdf('x/b.pdf'); self.assertEqual(a.adapt_folder_selection(self.src,self.out)['inventory']['files'][0]['relative_path'],'x/b.pdf')
    def test_06_casefold_pdf(self): self.pdf('A.PDF'); self.assertEqual(a.adapt_folder_selection(self.src,self.out)['pdf_count'],1)
    def test_07_deterministic(self): [self.pdf(n) for n in ('z.pdf','A/1.pdf','a/2.pdf')]; self.assertEqual(a.adapt_folder_selection(self.src,self.out)['inventory'],a.adapt_folder_selection(self.src,self.out)['inventory'])
    def test_08_probe_cleanup(self): self.pdf('a.pdf'); a.adapt_folder_selection(self.src,self.out); self.assertEqual(list(self.out.iterdir()),[])
    def test_09_probe_skip(self): self.assertEqual(a.adapt_folder_selection(self.src,self.out,verify_output_writable=False)['output_write_probe'],'SKIPPED_BY_CALLER')
    def test_10_empty_explicit(self): r=a.adapt_folder_selection(self.src,self.out); self.assertEqual(r['selection_status'],'NO_PDF_FILES'); self.assertFalse(r['ready_for_processing'])
    def test_11_source_missing(self):
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'SOURCE_FOLDER_NOT_FOUND'): a.adapt_folder_selection(self.root/'missing',self.out)
    def test_12_source_file(self):
        p=self.root/'f'; p.write_text('x');
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'SOURCE_FOLDER_NOT_DIRECTORY'): a.adapt_folder_selection(p,self.out)
    def test_13_output_missing(self):
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'OUTPUT_FOLDER_NOT_FOUND'): a.adapt_folder_selection(self.src,self.root/'missing')
    def test_14_output_file(self):
        p=self.root/'f'; p.write_text('x');
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'OUTPUT_FOLDER_NOT_DIRECTORY'): a.adapt_folder_selection(self.src,p)
    def test_15_source_symlink(self):
        p=self.root/'sl'
        try: p.symlink_to(self.src,target_is_directory=True)
        except OSError: self.skipTest('symlink unavailable')
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'SOURCE_FOLDER_SYMLINK'): a.adapt_folder_selection(p,self.out)
    def test_16_output_symlink(self):
        p=self.root/'ol'
        try: p.symlink_to(self.out,target_is_directory=True)
        except OSError: self.skipTest('symlink unavailable')
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'OUTPUT_FOLDER_SYMLINK'): a.adapt_folder_selection(self.src,p)
    def test_17_collision(self):
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'SOURCE_OUTPUT_FOLDER_COLLISION'): a.adapt_folder_selection(self.src,self.src)
    def test_18_write_failure(self):
        with patch('panel_folder_inventory_adapter.tempfile.NamedTemporaryFile',side_effect=OSError('denied')):
            with self.assertRaisesRegex(a.FolderSelectionAdapterError,'OUTPUT_FOLDER_NOT_WRITABLE'): a.adapt_folder_selection(self.src,self.out)
    def test_19_inventory_failure(self):
        with patch('panel_folder_inventory_adapter.build_inventory',side_effect=OSError('scan')):
            with self.assertRaisesRegex(a.FolderSelectionAdapterError,'CYCLE1_INVENTORY_FAILED'): a.adapt_folder_selection(self.src,self.out,verify_output_writable=False)
    def test_20_schema_mismatch(self):
        with patch('panel_folder_inventory_adapter.build_inventory',return_value=self.bad(schema_version='X')):
            with self.assertRaisesRegex(a.FolderSelectionAdapterError,'SCHEMA_MISMATCH'): a.adapt_folder_selection(self.src,self.out,verify_output_writable=False)
    def test_21_source_mismatch(self):
        with patch('panel_folder_inventory_adapter.build_inventory',return_value=self.bad(selected_folder='other')):
            with self.assertRaisesRegex(a.FolderSelectionAdapterError,'SOURCE_FOLDER_MISMATCH'): a.adapt_folder_selection(self.src,self.out,verify_output_writable=False)
    def test_22_count_mismatch(self):
        with patch('panel_folder_inventory_adapter.build_inventory',return_value=self.bad(pdf_count=1)):
            with self.assertRaisesRegex(a.FolderSelectionAdapterError,'COUNT_MISMATCH'): a.adapt_folder_selection(self.src,self.out,verify_output_writable=False)
    def test_23_order_invalid(self):
        b=self.bad(pdf_count=1,files=[{'processing_order':2,'relative_path':'a.pdf','file_name':'a.pdf','size_bytes':1}])
        with patch('panel_folder_inventory_adapter.build_inventory',return_value=b):
            with self.assertRaisesRegex(a.FolderSelectionAdapterError,'PROCESSING_ORDER_INVALID'): a.adapt_folder_selection(self.src,self.out,verify_output_writable=False)
    def test_24_escape(self):
        b=self.bad(pdf_count=1,files=[{'processing_order':1,'relative_path':'../a.pdf','file_name':'a.pdf','size_bytes':1}])
        with patch('panel_folder_inventory_adapter.build_inventory',return_value=b):
            with self.assertRaisesRegex(a.FolderSelectionAdapterError,'RELATIVE_PATH_INVALID'): a.adapt_folder_selection(self.src,self.out,verify_output_writable=False)
    def test_25_negative_size(self):
        b=self.bad(pdf_count=1,files=[{'processing_order':1,'relative_path':'a.pdf','file_name':'a.pdf','size_bytes':-1}])
        with patch('panel_folder_inventory_adapter.build_inventory',return_value=b):
            with self.assertRaisesRegex(a.FolderSelectionAdapterError,'SIZE_BYTES_INVALID'): a.adapt_folder_selection(self.src,self.out,verify_output_writable=False)
    def test_26_hash_invalid(self):
        with patch('panel_folder_inventory_adapter.build_inventory',return_value=self.bad(inventory_sha256='BAD')):
            with self.assertRaisesRegex(a.FolderSelectionAdapterError,'HASH_INVALID'): a.adapt_folder_selection(self.src,self.out,verify_output_writable=False)
    def test_27_no_semantic_gpt(self): r=a.adapt_folder_selection(self.src,self.out); self.assertFalse(r['semantic_analysis_performed']); self.assertFalse(r['gpt_call_performed'])
    def test_28_cli_success(self):
        self.pdf('a.pdf'); s=Path(__file__).with_name('panel_folder_inventory_adapter.py'); r=subprocess.run([sys.executable,str(s),str(self.src),str(self.out),'--compact'],capture_output=True,text=True); self.assertEqual(r.returncode,0,r.stderr); self.assertEqual(json.loads(r.stdout)['selection_status'],'READY')
    def test_29_cli_failure(self):
        s=Path(__file__).with_name('panel_folder_inventory_adapter.py'); r=subprocess.run([sys.executable,str(s),str(self.root/'missing'),str(self.out)],capture_output=True,text=True); self.assertEqual(r.returncode,2); self.assertIn('FOLDER_SELECTION_ADAPTER_ERROR',r.stderr)

class SinglePdfT(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.root=Path(self.tmp.name); self.src=self.root/'src'; self.out=self.root/'out'; self.src.mkdir(); self.out.mkdir()
    def tearDown(self): self.tmp.cleanup()
    def pdf(self,p,data=b'%PDF'):
        f=self.src/p; f.parent.mkdir(parents=True,exist_ok=True); f.write_bytes(data); return f
    def test_30_mode_exact(self): self.assertEqual(a.adapt_pdf_file_selection(self.pdf('a.pdf'),self.out)['input_mode'],'PDF_FILE')
    def test_31_exactly_one(self):
        p=self.pdf('chosen.pdf'); self.pdf('other.pdf'); self.assertEqual(a.adapt_pdf_file_selection(p,self.out)['pdf_count'],1)
    def test_32_non_selected_zero(self):
        p=self.pdf('chosen.pdf'); self.pdf('other.pdf'); self.pdf('nested/third.pdf'); self.assertEqual([x['file_name'] for x in a.adapt_pdf_file_selection(p,self.out)['inventory']['files']],['chosen.pdf'])
    def test_33_record_shape(self):
        p=self.pdf('one.pdf',b'%PDF123'); item=a.adapt_pdf_file_selection(p,self.out)['inventory']['files'][0]; self.assertEqual(item,{'processing_order':1,'relative_path':'one.pdf','file_name':'one.pdf','size_bytes':7})
    def test_34_inventory_schema_same(self): self.assertEqual(a.adapt_pdf_file_selection(self.pdf('a.pdf'),self.out)['inventory']['schema_version'],'PDF_FOLDER_INVENTORY_V1')
    def test_35_case_insensitive_pdf(self): self.assertEqual(a.adapt_pdf_file_selection(self.pdf('a.PDF'),self.out)['pdf_count'],1)
    def test_36_non_pdf_rejected(self):
        p=self.src/'x.txt'; p.write_text('x')
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'EXTENSION_INVALID'): a.adapt_pdf_file_selection(p,self.out)
    def test_37_missing_rejected(self):
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'PDF_FILE_NOT_FOUND'): a.adapt_pdf_file_selection(self.src/'missing.pdf',self.out)
    def test_38_directory_rejected(self):
        p=self.src/'fake.pdf'; p.mkdir()
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'PDF_FILE_NOT_FILE'): a.adapt_pdf_file_selection(p,self.out)
    def test_39_symlink_rejected(self):
        p=self.pdf('real.pdf'); link=self.src/'link.pdf'
        try: link.symlink_to(p)
        except OSError: self.skipTest('symlink unavailable')
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'PDF_FILE_SYMLINK'): a.adapt_pdf_file_selection(link,self.out)
    def test_40_parent_binding(self):
        p=self.pdf('nested/a.pdf'); r=a.adapt_pdf_file_selection(p,self.out); self.assertEqual(r['inventory']['selected_folder'],str(p.parent.resolve()))
    def test_41_processing_order_one(self): self.assertEqual(a.adapt_pdf_file_selection(self.pdf('a.pdf'),self.out)['inventory']['files'][0]['processing_order'],1)
    def test_42_deterministic_hash(self):
        p=self.pdf('a.pdf'); self.assertEqual(a.adapt_pdf_file_selection(p,self.out)['inventory']['inventory_sha256'],a.adapt_pdf_file_selection(p,self.out)['inventory']['inventory_sha256'])
    def test_43_cli_pdf_success(self):
        p=self.pdf('a.pdf'); s=Path(__file__).with_name('panel_folder_inventory_adapter.py'); r=subprocess.run([sys.executable,str(s),'PDF_FILE',str(p),str(self.out),'--compact'],capture_output=True,text=True); self.assertEqual(r.returncode,0,r.stderr); self.assertEqual(json.loads(r.stdout)['pdf_count'],1)
    def test_44_invalid_mode(self):
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'INPUT_MODE_INVALID'): a.adapt_input_selection('AUTO',self.src,self.out)

if __name__=='__main__': unittest.main(verbosity=2)
