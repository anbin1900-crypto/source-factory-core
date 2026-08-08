from pathlib import Path
import tempfile
import pytest
from edge_regression_harness import execute, EXPECTED_IDS

@pytest.fixture(scope='module')
def result():
    with tempfile.TemporaryDirectory() as td:
        yield execute(Path(td))

def test_required_edge_matrix(result):
    assert result['status']=='PASS'
    assert set(result['edge_matrix'])=={'POPUP','IFRAME','NESTED_FRAME','SCROLL','PAGINATION','RELOAD','RESTART','RESUME','IDENTITY_STABILITY'}
    assert all(result['edge_matrix'].values())

def test_identity_stability(result):
    assert result['identity']['ids']==EXPECTED_IDS
    assert result['identity']['record_identity_digest']=='10fe5228cb7a25284c3ae985c42bb93643611202c5a76c5704c69a3be16a84c1'

def test_replay_digest_deterministic(result):
    assert result['replay_digest_parity']=='PASS'
    assert result['replay_digest']==result['second_replay_digest']

def test_network_event_counts_nonzero(result):
    assert result['network_event_counts']['http_bridge_events']>0
    assert result['second_run_network_event_counts']['http_bridge_events']>0

def test_cross_worker_identity_non_mutating(result):
    binding=result['cross_worker_binding']
    assert binding['all_consumers_non_mutating'] is True
    assert set(binding['checks'])=={'A-3','B-3','A-6','B-5'}
    assert all(v['identity_mutation_zero'] for v in binding['checks'].values())

def test_single_entrypoint(result):
    assert result['single_entrypoint']=='python run_edge_regression.py'
