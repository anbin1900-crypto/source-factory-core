import importlib.util,json,pathlib
R=pathlib.Path(__file__).parent; D=R/'GENERIC_HTML_DOCUMENT_ADAPTER_V1'
s=importlib.util.spec_from_file_location('a',D/'adapter.py'); a=importlib.util.module_from_spec(s); s.loader.exec_module(a)
f=json.loads((D/'local_fixture.json').read_text()); routes=json.loads((D/'profile_route_bindings.json').read_text())
o1=a.replay(f,routes); o2=a.replay(f,routes); assert o1==o2
assert o1['outbound_links']==['https://fin.land.naver.com/articles/2528362542','https://fin.land.naver.com/map?zoom=15']
assert 'discarded' not in o1['html_document_text'] and '제외 문구' not in o1['html_document_text']
(D/'local_fixture_output.json').write_text(json.dumps(o1,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'replay_1':o1['redacted_sha256'],'replay_2':o2['redacted_sha256'],'equal':True}))
