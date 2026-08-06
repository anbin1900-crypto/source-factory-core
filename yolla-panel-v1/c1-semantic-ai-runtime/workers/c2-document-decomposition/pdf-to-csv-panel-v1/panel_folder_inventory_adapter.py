#!/usr/bin/env python3
"""Folder selection and Cycle 1 PDF inventory adapter for panel integration."""
from __future__ import annotations
import argparse, json, os, sys, tempfile
from pathlib import Path
from typing import Any
from pdf_folder_inventory import InventoryError, build_inventory

SCHEMA_VERSION='PANEL_FOLDER_SELECTION_INVENTORY_ADAPTER_V1'
CYCLE1_POINTER_BLOB='ba27ebb810d29b989a6677930b13b04cd7e23daf'
CYCLE1_INVENTORY_SCHEMA='PDF_FOLDER_INVENTORY_V1'

class FolderSelectionAdapterError(RuntimeError): pass

def _validate_selected_directory(selected_path: str|os.PathLike[str], *, role: str) -> Path:
    if selected_path is None or not str(selected_path).strip():
        raise FolderSelectionAdapterError(f'{role}_FOLDER_REQUIRED')
    path=Path(selected_path)
    try: path.lstat()
    except FileNotFoundError as exc: raise FolderSelectionAdapterError(f'{role}_FOLDER_NOT_FOUND:{path}') from exc
    except OSError as exc: raise FolderSelectionAdapterError(f'{role}_FOLDER_STAT_FAILED:{path}:{exc}') from exc
    if path.is_symlink(): raise FolderSelectionAdapterError(f'{role}_FOLDER_SYMLINK_FORBIDDEN:{path}')
    if not path.is_dir(): raise FolderSelectionAdapterError(f'{role}_FOLDER_NOT_DIRECTORY:{path}')
    try: return path.resolve(strict=True)
    except OSError as exc: raise FolderSelectionAdapterError(f'{role}_FOLDER_RESOLVE_FAILED:{path}:{exc}') from exc

def _verify_output_writable(output_folder: Path) -> None:
    probe_path=None
    try:
        with tempfile.NamedTemporaryFile(mode='wb',prefix='.c2-pdf-to-csv-write-probe-',suffix='.tmp',dir=output_folder,delete=False) as probe:
            probe_path=Path(probe.name); probe.flush(); os.fsync(probe.fileno())
        probe_path.unlink()
    except OSError as exc:
        if probe_path is not None:
            try: probe_path.unlink(missing_ok=True)
            except OSError: pass
        raise FolderSelectionAdapterError(f'OUTPUT_FOLDER_NOT_WRITABLE:{output_folder}:{exc}') from exc

def _validate_cycle1_inventory(inventory: dict[str,Any], source_folder: Path) -> None:
    if not isinstance(inventory,dict): raise FolderSelectionAdapterError('CYCLE1_INVENTORY_NOT_OBJECT')
    if inventory.get('schema_version')!=CYCLE1_INVENTORY_SCHEMA: raise FolderSelectionAdapterError('CYCLE1_INVENTORY_SCHEMA_MISMATCH')
    if inventory.get('selected_folder')!=str(source_folder): raise FolderSelectionAdapterError('CYCLE1_INVENTORY_SOURCE_FOLDER_MISMATCH')
    files=inventory.get('files')
    if not isinstance(files,list): raise FolderSelectionAdapterError('CYCLE1_INVENTORY_FILES_NOT_ARRAY')
    if inventory.get('pdf_count')!=len(files): raise FolderSelectionAdapterError('CYCLE1_INVENTORY_COUNT_MISMATCH')
    digest=inventory.get('inventory_sha256')
    if not isinstance(digest,str) or len(digest)!=64 or any(ch not in '0123456789abcdef' for ch in digest):
        raise FolderSelectionAdapterError('CYCLE1_INVENTORY_HASH_INVALID')
    for expected,item in enumerate(files,1):
        if not isinstance(item,dict): raise FolderSelectionAdapterError('CYCLE1_INVENTORY_ENTRY_NOT_OBJECT')
        if item.get('processing_order')!=expected: raise FolderSelectionAdapterError('CYCLE1_PROCESSING_ORDER_INVALID')
        rel=item.get('relative_path')
        if not isinstance(rel,str) or not rel or Path(rel).is_absolute() or rel.startswith('../') or '/../' in rel or '\\' in rel:
            raise FolderSelectionAdapterError('CYCLE1_RELATIVE_PATH_INVALID')
        if not isinstance(item.get('file_name'),str) or not item['file_name']: raise FolderSelectionAdapterError('CYCLE1_FILE_NAME_INVALID')
        size=item.get('size_bytes')
        if not isinstance(size,int) or isinstance(size,bool) or size<0: raise FolderSelectionAdapterError('CYCLE1_SIZE_BYTES_INVALID')

def adapt_folder_selection(source_folder, output_folder, *, verify_output_writable: bool=True) -> dict[str,Any]:
    source=_validate_selected_directory(source_folder,role='SOURCE')
    output=_validate_selected_directory(output_folder,role='OUTPUT')
    if os.path.normcase(str(source))==os.path.normcase(str(output)):
        raise FolderSelectionAdapterError('SOURCE_OUTPUT_FOLDER_COLLISION')
    if verify_output_writable: _verify_output_writable(output)
    try: inventory=build_inventory(source)
    except (InventoryError,FileNotFoundError,OSError) as exc: raise FolderSelectionAdapterError(f'CYCLE1_INVENTORY_FAILED:{exc}') from exc
    _validate_cycle1_inventory(inventory,source)
    count=inventory['pdf_count']
    return {'schema_version':SCHEMA_VERSION,'source_folder':str(source),'output_folder':str(output),'source_output_distinct':True,'output_write_probe':'PASS' if verify_output_writable else 'SKIPPED_BY_CALLER','cycle1_pointer_blob':CYCLE1_POINTER_BLOB,'inventory':inventory,'pdf_count':count,'selection_status':'READY' if count>0 else 'NO_PDF_FILES','ready_for_processing':count>0,'semantic_analysis_performed':False,'gpt_call_performed':False}

def _parser():
    p=argparse.ArgumentParser(description='Validate source/output folders and return deterministic PDF inventory.')
    p.add_argument('source_folder'); p.add_argument('output_folder'); p.add_argument('--skip-output-write-probe',action='store_true'); p.add_argument('--compact',action='store_true'); return p

def main(argv=None):
    args=_parser().parse_args(argv)
    try:
        result=adapt_folder_selection(args.source_folder,args.output_folder,verify_output_writable=not args.skip_output_write_probe)
        print(json.dumps(result,ensure_ascii=False,indent=None if args.compact else 2)); return 0
    except FolderSelectionAdapterError as exc:
        print(f'FOLDER_SELECTION_ADAPTER_ERROR:{exc}',file=sys.stderr); return 2
if __name__=='__main__': raise SystemExit(main())
