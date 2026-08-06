#!/usr/bin/env python3
from __future__ import annotations
import json, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import panel_folder_inventory_adapter as a

class DirectRepairTests(unittest.TestCase):
    def setUp(self):
        self.t=tempfile.TemporaryDirectory()
        self.root=Path(self.t.name); self.src=self.root/'src'; self.out=self.root/'out'
        self.src.mkdir(); self.out.mkdir()
    def tearDown(self): self.t.cleanup()
    def pdf(self,name,data=b'%PDF-1.7\nx'):
        p=self.src/name; p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(data); return p

    def test_folder_mode_still_recursive(self):
        self.pdf('a.pdf'); self.pdf('nested/b.PDF')
        r=a.adapt_folder_selection(self.src,self.out)
        self.assertEqual(r['pdf_count'],2)
        self.assertEqual([x['processing_order'] for x in r['inventory']['files']],[1,2])

    def test_single_pdf_only_selected_record(self):
        chosen=self.pdf('chosen.pdf'); self.pdf('other.pdf'); self.pdf('nested/third.pdf')
        r=a.adapt_pdf_file_selection(chosen,self.out)
        self.assertEqual(r['pdf_count'],1)
        self.assertEqual(r['inventory']['files'][0]['file_name'],'chosen.pdf')

    def test_single_pdf_parent_output_collision_rejected(self):
        chosen=self.pdf('chosen.pdf')
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'SOURCE_OUTPUT_FOLDER_COLLISION'):
            a.adapt_pdf_file_selection(chosen,self.src)

    def test_folder_output_collision_rejected(self):
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'SOURCE_OUTPUT_FOLDER_COLLISION'):
            a.adapt_folder_selection(self.src,self.src)

    def test_case_insensitive_extension(self):
        chosen=self.pdf('UPPER.PDF')
        self.assertEqual(a.adapt_pdf_file_selection(chosen,self.out)['pdf_count'],1)

    def test_fake_pdf_signature_rejected(self):
        fake=self.pdf('fake.pdf',b'not-a-pdf')
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'PDF_FILE_SIGNATURE_INVALID'):
            a.adapt_pdf_file_selection(fake,self.out)

    def test_non_pdf_extension_rejected(self):
        p=self.src/'x.txt'; p.write_bytes(b'%PDF-1.7')
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'PDF_FILE_EXTENSION_INVALID'):
            a.adapt_pdf_file_selection(p,self.out)

    def test_missing_paths_fail_closed(self):
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'SOURCE_FOLDER_NOT_FOUND'):
            a.adapt_folder_selection(self.root/'missing',self.out)
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'PDF_FILE_NOT_FOUND'):
            a.adapt_pdf_file_selection(self.root/'missing.pdf',self.out)
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'OUTPUT_FOLDER_NOT_FOUND'):
            a.adapt_folder_selection(self.src,self.root/'out-missing')

    def test_symlink_pdf_rejected(self):
        real=self.pdf('real.pdf'); link=self.src/'link.pdf'
        try: link.symlink_to(real)
        except OSError: self.skipTest('symlink unavailable')
        with self.assertRaisesRegex(a.FolderSelectionAdapterError,'PDF_FILE_SYMLINK_FORBIDDEN'):
            a.adapt_pdf_file_selection(link,self.out)

    def test_inventory_hash_mismatch_rejected(self):
        bad={'schema_version':'PDF_FOLDER_INVENTORY_V1','selected_folder':str(self.src.resolve()),'pdf_count':1,
             'inventory_sha256':'0'*64,'files':[{'processing_order':1,'relative_path':'a.pdf','file_name':'a.pdf','size_bytes':4}]}
        with patch('panel_folder_inventory_adapter.build_inventory',return_value=bad):
            with self.assertRaisesRegex(a.FolderSelectionAdapterError,'CYCLE1_INVENTORY_HASH_MISMATCH'):
                a.adapt_folder_selection(self.src,self.out,verify_output_writable=False)

    def test_output_probe_no_residue(self):
        self.pdf('a.pdf'); a.adapt_folder_selection(self.src,self.out)
        self.assertEqual(list(self.out.iterdir()),[])

    def test_legacy_and_explicit_cli(self):
        self.pdf('a.pdf')
        script=Path(__file__).with_name('panel_folder_inventory_adapter.py')
        legacy=subprocess.run([sys.executable,str(script),str(self.src),str(self.out),'--compact'],text=True,capture_output=True)
        explicit=subprocess.run([sys.executable,str(script),'FOLDER',str(self.src),str(self.out),'--compact'],text=True,capture_output=True)
        self.assertEqual(legacy.returncode,0,legacy.stderr); self.assertEqual(explicit.returncode,0,explicit.stderr)
        self.assertEqual(json.loads(legacy.stdout)['inventory'],json.loads(explicit.stdout)['inventory'])

if __name__=='__main__': unittest.main(verbosity=2)
