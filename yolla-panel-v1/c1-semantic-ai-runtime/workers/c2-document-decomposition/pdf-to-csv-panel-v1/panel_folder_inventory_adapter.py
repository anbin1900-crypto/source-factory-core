#!/usr/bin/env python3
from __future__ import annotations
import argparse,hashlib,json,os,sys,tempfile
from pathlib import Path
from pdf_folder_inventory import InventoryError,build_inventory
SCHEMA_VERSION='PANEL_FOLDER_SELECTION_INVENTORY_ADAPTER_V2'
CYCLE1_POINTER_BLOB='ba27ebb810d29b989a6677930b13b04cd7e23daf'
CYCLE1_INVENTORY_SCHEMA='PDF_FOLDER_INVENTORY_V1'
INPUT_MODES=('FOLDER','PDF_FILE')
class FolderSelectionAdapterError(RuntimeError): pass

def _validate_selected_directory(selected_path,*,role):
    if selected_path is None or not str(selected_path).strip(): raise FolderSelectionAdapterError(f'{role}_FOLDER_REQUIRED')
    path=Path(selected_path)
    try: path.lstat()
    except FileNotFoundError as e: raise FolderSelectionAdapterError(f'{role}_FOLDER_NOT_FOUND:{path}') from e
    except OSError as e: raise FolderSelectionAdapterError(f'{role}_FOLDER_STAT_FAILED:{path}:{e}') from e
    if path.is_symlink(): raise FolderSelectionAdapterError(f'{role}_FOLDER_SYMLINK_FORBIDDEN:{path}')
    if not path.is_dir(): raise FolderSelectionAdapterError(f'{role}_FOLDER_NOT_DIRECTORY:{path}')
    return path.resolve(strict=True)

def _validate_selected_pdf(selected_path):
    if selected_path is None or not str(selected_path).strip(): raise FolderSelectionAdapterError('PDF_FILE_REQUIRED')
    path=Path(selected_path)
    try: path.lstat()
    except FileNotFoundError as e: raise FolderSelectionAdapterError(f'PDF_FILE_NOT_FOUND:{path}') from e
    except OSError as e: raise FolderSelectionAdapterError(f'PDF_FILE_STAT_FAILED:{path}:{e}') from e
    if path.is_symlink(): raise FolderSelectionAdapterError(f'PDF_FILE_SYMLINK_FORBIDDEN:{path}')
    if not path.is_file(): raise FolderSelectionAdapterError(f'PDF_FILE_NOT_FILE:{path}')
    if path.suffix.casefold()!='.pdf': raise FolderSelectionAdapterError(f'PDF_FILE_EXTENSION_INVALID:{path}')
    return path.resolve(strict=True)

def _verify_output_writable(output_folder):
    probe_path=None
    try:
        with tempfile.NamedTemporaryFile(mode='wb',prefix='.c2-pdf-to-csv-write-probe-',suffix='.tmp',dir=output_folder,delete=False) as probe:
            probe_path=Path(probe.name); probe.flush(); os.fsync(probe.fileno())
        probe_path.unlink()
    except OSError as e:
        if probe_path is not None:
            try: probe_path.unlink(missing_ok=True)
            except OSError: pass
        raise FolderSelectionAdapterError(f'OUTPUT_FOLDER_NOT_WRITABLE:{output_folder}:{e}') from e

def _canonical_files_hash(files):
    return hashlib.sha256(json.dumps(files,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')).hexdigest()

def _build_single_pdf_inventory(pdf):
    try: size=pdf.stat().st_size
    except OSError as e: raise FolderSelectionAdapterError(f'PDF_FILE_STAT_FAILED:{pdf}:{e}') from e
    parent=pdf.parent.resolve(strict=True)
    files=[{'processing_order':1,'relative_path':pdf.name,'file_name':pdf.name,'size_bytes':size}]
    return {'schema_version':CYCLE1_INVENTORY_SCHEMA,'selected_folder':str(parent),'ordering_rule':'SINGLE_SELECTED_PDF_ONLY','recursive':False,'pdf_extension_case_sensitive':False,'symlinks_followed':False,'pdf_count':1,'inventory_sha256':_canonical_files_hash(files),'files':files}

def _validate_cycle1_inventory(inventory,source_folder,*,expected_count=None,expected_relative_path=None):
    if not isinstance(inventory,dict): raise FolderSelectionAdapterError('CYCLE1_INVENTORY_NOT_OBJECT')
    if inventory.get('schema_version')!=CYCLE1_INVENTORY_SCHEMA: raise FolderSelectionAdapterError('CYCLE1_INVENTORY_SCHEMA_MISMATCH')
    if inventory.get('selected_folder')!=str(source_folder): raise FolderSelectionAdapterError('CYCLE1_INVENTORY_SOURCE_FOLDER_MISMATCH')
    files=inventory.get('files')
    if not isinstance(files,list): raise FolderSelectionAdapterError('CYCLE1_INVENTORY_FILES_NOT_ARRAY')
    if inventory.get('pdf_count')!=len(files): raise FolderSelectionAdapterError('CYCLE1_INVENTORY_COUNT_MISMATCH')
    if expected_count is not None and len(files)!=expected_count: raise FolderSelectionAdapterError('CYCLE1_INVENTORY_EXPECTED_COUNT_MISMATCH')
    digest=inventory.get('inventory_sha256')
    if not isinstance(digest,str) or len(digest)!=64 or any(c not in '0123456789abcdef' for c in digest): raise FolderSelectionAdapterError('CYCLE1_INVENTORY_HASH_INVALID')
    for i,item in enumerate(files,1):
        if not isinstance(item,dict): raise FolderSelectionAdapterError('CYCLE1_INVENTORY_ENTRY_NOT_OBJECT')
        if item.get('processing_order')!=i: raise FolderSelectionAdapterError('CYCLE1_PROCESSING_ORDER_INVALID')
        rel=item.get('relative_path')
        if not isinstance(rel,str) or not rel or Path(rel).is_absolute() or rel.startswith('../') or '/../' in rel or '\\' in rel: raise FolderSelectionAdapterError('CYCLE1_RELATIVE_PATH_INVALID')
        if not isinstance(item.get('file_name'),str) or not item['file_name']: raise FolderSelectionAdapterError('CYCLE1_FILE_NAME_INVALID')
        size=item.get('size_bytes')
        if not isinstance(size,int) or isinstance(size,bool) or size<0: raise FolderSelectionAdapterError('CYCLE1_SIZE_BYTES_INVALID')
    if expected_relative_path is not None and (len(files)!=1 or files[0]['relative_path']!=expected_relative_path): raise FolderSelectionAdapterError('SINGLE_PDF_RECORD_PATH_MISMATCH')

def _validate_output_folder(output_folder,*,verify_output_writable):
    out=_validate_selected_directory(output_folder,role='OUTPUT')
    if verify_output_writable: _verify_output_writable(out)
    return out

def adapt_input_selection(input_mode,input_path,output_folder,*,verify_output_writable=True):
    mode=str(input_mode).upper().strip()
    if mode not in INPUT_MODES: raise FolderSelectionAdapterError(f'INPUT_MODE_INVALID:{input_mode}')
    output=_validate_output_folder(output_folder,verify_output_writable=verify_output_writable)
    if mode=='FOLDER':
        source=_validate_selected_directory(input_path,role='SOURCE')
        if os.path.normcase(str(source))==os.path.normcase(str(output)): raise FolderSelectionAdapterError('SOURCE_OUTPUT_FOLDER_COLLISION')
        try: inventory=build_inventory(source)
        except (InventoryError,FileNotFoundError,OSError) as e: raise FolderSelectionAdapterError(f'CYCLE1_INVENTORY_FAILED:{e}') from e
        _validate_cycle1_inventory(inventory,source); selected_pdf=None
    else:
        selected_pdf=_validate_selected_pdf(input_path); source=selected_pdf.parent.resolve(strict=True)
        inventory=_build_single_pdf_inventory(selected_pdf)
        _validate_cycle1_inventory(inventory,source,expected_count=1,expected_relative_path=selected_pdf.name)
    count=inventory['pdf_count']
    return {'schema_version':SCHEMA_VERSION,'input_mode':mode,'input_path':str(source if mode=='FOLDER' else selected_pdf),'source_folder':str(source),'selected_pdf':str(selected_pdf) if selected_pdf else None,'output_folder':str(output),'source_output_distinct':os.path.normcase(str(source))!=os.path.normcase(str(output)) if mode=='FOLDER' else True,'output_write_probe':'PASS' if verify_output_writable else 'SKIPPED_BY_CALLER','cycle1_pointer_blob':CYCLE1_POINTER_BLOB,'inventory':inventory,'pdf_count':count,'selection_status':'READY' if count>0 else 'NO_PDF_FILES','ready_for_processing':count>0,'semantic_analysis_performed':False,'gpt_call_performed':False}

def adapt_folder_selection(source_folder,output_folder,*,verify_output_writable=True): return adapt_input_selection('FOLDER',source_folder,output_folder,verify_output_writable=verify_output_writable)
def adapt_pdf_file_selection(pdf_file,output_folder,*,verify_output_writable=True): return adapt_input_selection('PDF_FILE',pdf_file,output_folder,verify_output_writable=verify_output_writable)
def _parser():
    p=argparse.ArgumentParser(); p.add_argument('arg1'); p.add_argument('arg2'); p.add_argument('arg3',nargs='?'); p.add_argument('--skip-output-write-probe',action='store_true'); p.add_argument('--compact',action='store_true'); return p
def main(argv=None):
    args=_parser().parse_args(argv)
    try:
        first=str(args.arg1).upper().strip()
        if first in INPUT_MODES:
            if args.arg3 is None: raise FolderSelectionAdapterError('OUTPUT_FOLDER_REQUIRED')
            mode,input_path,output_folder=first,args.arg2,args.arg3
        else:
            if args.arg3 is not None: raise FolderSelectionAdapterError('LEGACY_FOLDER_CLI_TOO_MANY_ARGUMENTS')
            mode,input_path,output_folder='FOLDER',args.arg1,args.arg2
        result=adapt_input_selection(mode,input_path,output_folder,verify_output_writable=not args.skip_output_write_probe)
        print(json.dumps(result,ensure_ascii=False,indent=None if args.compact else 2)); return 0
    except FolderSelectionAdapterError as e:
        print(f'FOLDER_SELECTION_ADAPTER_ERROR:{e}',file=sys.stderr); return 2
if __name__=='__main__': raise SystemExit(main())
