from __future__ import annotations
import json
from pathlib import Path
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/'src'))
from wave3_recorder_product_flow import ActionLedger, Locator, RecipeCompiler, SessionStateStore, hash_json, generate_adapter_source

class Wave3UnitTests(unittest.TestCase):
    def event(self, kind='click', **kw):
        base=dict(kind=kind,page_alias='main',frame_name=None,locator=Locator('test_id','x').to_json() if kind not in {'scroll','navigation','popup','iframe'} else None,value=None,url=None,scroll=None); base.update(kw); return base
    def test_01_empty_valid(self): self.assertTrue(ActionLedger().validate())
    def test_02_append_sequence(self): self.assertEqual(ActionLedger().append(**self.event())['sequence'],1)
    def test_03_duplicate_suppressed(self):
        l=ActionLedger(); l.append(**self.event()); l.append(**self.event()); self.assertEqual(len(l.events),1)
    def test_04_hash_chain(self):
        l=ActionLedger(); l.append(**self.event()); l.append(**self.event(kind='input',value='x')); self.assertTrue(l.validate())
    def test_05_tamper_rejected(self):
        l=ActionLedger(); l.append(**self.event()); x=l.events; x[0]['kind']='input'
        with self.assertRaises(ValueError): ActionLedger(x)
    def test_06_locator_json(self): self.assertEqual(Locator('test_id','x').to_json(),{'strategy':'test_id','value':'x'})
    def test_07_state_roundtrip(self):
        l=ActionLedger(); l.append(**self.event())
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'s.json'; a=SessionStateStore.save(p,ledger=l,state={'x':1}); l2,s,dg=SessionStateStore.load(p); self.assertEqual((len(l2.events),s,dg),(1,{'x':1},a['state_digest']))
    def test_08_state_tamper_rejected(self):
        l=ActionLedger()
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'s.json'; SessionStateStore.save(p,ledger=l,state={'x':1}); x=json.loads(p.read_text()); x['state']['x']=2; p.write_text(json.dumps(x))
            with self.assertRaises(ValueError): SessionStateStore.load(p)
    def test_09_recipe_hash_stable(self):
        l=ActionLedger(); l.append(**self.event(kind='input',value='a')); self.assertEqual(RecipeCompiler.compile(l),RecipeCompiler.compile(l))
    def test_10_recipe_digest_valid(self):
        l=ActionLedger(); l.append(**self.event(kind='input',value='a')); r=RecipeCompiler.compile(l); dg=r.pop('recipe_digest'); self.assertEqual(dg,hash_json(r))
    def test_11_required_kinds(self): self.assertEqual(RecipeCompiler.EXECUTABLE_KINDS,{'input','select','click','scroll','navigation','popup','iframe'})
    def test_12_scroll_compiles(self):
        l=ActionLedger(); l.append(**self.event(kind='scroll',scroll={'x':0,'y':2})); self.assertEqual(RecipeCompiler.compile(l)['steps'][0]['kind'],'scroll')
    def test_13_navigation_compiles(self):
        l=ActionLedger(); l.append(**self.event(kind='navigation',url='about:blank#detail')); self.assertEqual(RecipeCompiler.compile(l)['steps'][0]['url'],'about:blank#detail')
    def test_14_popup_compiles(self):
        l=ActionLedger(); l.append(**self.event(kind='popup',page_alias='popup-1')); self.assertEqual(RecipeCompiler.compile(l)['steps'][0]['kind'],'popup')
    def test_15_iframe_compiles(self):
        l=ActionLedger(); l.append(**self.event(kind='iframe',page_alias='popup-1',frame_name='details-frame')); self.assertEqual(RecipeCompiler.compile(l)['steps'][0]['frame_name'],'details-frame')
    def test_16_adapter_contains_recipe(self):
        l=ActionLedger(); l.append(**self.event(kind='input',value='a')); self.assertIn('RECIPE =',generate_adapter_source(RecipeCompiler.compile(l)))
    def test_17_adapter_has_popup(self): self.assertIn('expect_popup',generate_adapter_source(RecipeCompiler.compile(ActionLedger())))
    def test_18_adapter_has_frame(self): self.assertIn('frame_locator',generate_adapter_source(RecipeCompiler.compile(ActionLedger())))
    def test_19_adapter_has_navigation_assertion(self): self.assertIn('navigation',generate_adapter_source(RecipeCompiler.compile(ActionLedger())))
    def test_20_safety_false(self): self.assertEqual(RecipeCompiler.compile(ActionLedger())['safety'],{'production':False,'ready':False,'merge':False})
    def test_21_event_json_no_dups(self):
        l=ActionLedger(); l.append(**self.event()); self.assertEqual(l.to_json()['duplicate_fingerprint_count'],0)
    def test_22_different_values_not_duplicate(self):
        l=ActionLedger(); l.append(**self.event(kind='input',value='a')); l.append(**self.event(kind='input',value='b')); self.assertEqual(len(l.events),2)
    def test_23_same_click_different_page_not_duplicate(self):
        l=ActionLedger(); l.append(**self.event()); l.append(**self.event(page_alias='popup-1')); self.assertEqual(len(l.events),2)
    def test_24_hash_json_order_independent(self): self.assertEqual(hash_json({'a':1,'b':2}),hash_json({'b':2,'a':1}))

if __name__=='__main__': unittest.main(verbosity=2)
