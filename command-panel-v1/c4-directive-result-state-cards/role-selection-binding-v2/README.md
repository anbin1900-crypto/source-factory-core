# C-4 Role-selected Card Binding V2

C-2 Role Registry 선택 Context를 소비해 선택된 역할의 Directive·Result·PC Agent/Backup 카드만 반환합니다.

- C-2 Source를 복사하거나 수정하지 않습니다.
- C-2 PR #10 Exact Head와 핵심 Blob을 먼저 검증합니다.
- 기존 C-4 Cycle 1 카드 렌더러를 재사용합니다.
- 다른 역할의 Result·Blocker·Directive는 출력 모델에 포함하지 않습니다.
- 없는 Directive·Result는 빈 카드 상태로 Fail-closed 표시합니다.
- C-6는 `C4_TO_C6_CARD_MOUNT_HANDOFF_V2.json`의 순서로 Mount합니다.

## Test

```bash
node --check roleSelectedCardBindingAdapter.js
node --test tests/roleSelectedCardBindingAdapter.test.js
```
