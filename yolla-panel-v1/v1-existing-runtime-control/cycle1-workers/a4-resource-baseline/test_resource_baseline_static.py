import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_json(name: str):
    with (ROOT / name).open('r', encoding='utf-8') as handle:
        return json.load(handle)


def test_json_files_parse():
    load_json('C_MODE_CYCLE1_RESOURCE_BASELINE_RECEIPT_V1.schema.json')
    load_json('C_MODE_CYCLE1_RESOURCE_SCENARIO_MATRIX_V1.json')


def test_schema_requires_live_metrics():
    schema = load_json('C_MODE_CYCLE1_RESOURCE_BASELINE_RECEIPT_V1.schema.json')
    required = set(schema['required'])
    assert {'sample_count_actual', 'metrics_summary', 'load_elapsed_ms', 'target_pc_live_execution'} <= required
    assert schema['properties']['sample_count_actual']['minimum'] == 30
    assert schema['properties']['optimization_source_change_count']['const'] == 0


def test_scenario_matrix_has_required_scenarios():
    matrix = load_json('C_MODE_CYCLE1_RESOURCE_SCENARIO_MATRIX_V1.json')
    ids = {item['id'] for item in matrix['scenarios']}
    assert {'PANEL_ONLY', 'ONE_BROWSER', 'BROWSER_CLOSE', 'BROWSER_REOPEN', 'CLOSE_REOPEN'} <= ids
    assert matrix['measurement_defaults']['minimum_samples_per_executed_scenario'] >= 30
    assert matrix['safety']['optimization_source_change_count'] == 0


def test_powershell_contract_tokens():
    text = (ROOT / 'Invoke-CModeCycle1ResourceBaseline.ps1').read_text(encoding='utf-8')
    required_tokens = [
        'Get-CimInstance Win32_Process',
        'WorkingSet64',
        'PrivateMemorySize64',
        '--type=renderer',
        '--type=gpu-process',
        '--type=utility',
        'SampleCount = 30',
        "optimization_source_change_count = 0",
        "target_pc_live_execution = $true",
        "non_destructive_measurement = $true",
    ]
    for token in required_tokens:
        assert token in text, token


def test_powershell_delimiters_balanced():
    text = (ROOT / 'Invoke-CModeCycle1ResourceBaseline.ps1').read_text(encoding='utf-8')
    assert text.count('{') == text.count('}')
    assert text.count('(') == text.count(')')
    assert text.count('[') == text.count(']')
