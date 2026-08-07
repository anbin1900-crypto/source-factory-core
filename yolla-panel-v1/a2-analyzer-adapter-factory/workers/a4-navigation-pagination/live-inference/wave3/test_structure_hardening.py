from structure_hardening import LoopGuard, sha


def test_sha_deterministic():
    assert sha({'b': 2, 'a': 1}) == sha({'a': 1, 'b': 2})


def test_loop_guard_repeats():
    result = {
        'document_url': 'u',
        'pagination': {'type': 'NEXT', 'target': 'u'},
        'repeated_regions': [{'item_keys': ['1', '2']}],
    }
    guard = LoopGuard()
    assert not guard.check(result)['stop']
    second = guard.check(result)
    assert second['stop']
    assert second['reason'] == 'REPEATED_PAGINATION_STATE'
