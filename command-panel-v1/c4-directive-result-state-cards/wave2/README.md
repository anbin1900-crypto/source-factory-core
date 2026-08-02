# C-4 AI욜라 Wave·시간·중복상태 카드 V1

`C1-TO-C4-AI-YOLLA-PANEL-WAVE-TIME-CARDS-WAVE2-V1-20260802-001` 전용 산출물입니다.

- Wave 번호, 지시 등록시간 KST, 결과 게시시간 KST를 표시합니다.
- Duplicate Prompt Key 앞 12자리와 실행가능·중복차단·구버전차단·권위충돌·완료 상태를 표시합니다.
- 공식 서비스명은 `욜라 부동산 전문 AI`, `욜라 주유소 전문 AI`, `욜라 위험물 전문 AI`만 허용합니다.
- 사용자 기본 표기는 `AI욜라 Runtime 상태`이며 `PC Agent 상태`를 기본 표기로 사용하지 않습니다.
- 근거 없는 PASS는 `UNVERIFIED`로 강등합니다.

```bash
node --check aiYollaWaveTimeCards.js
node --test tests/aiYollaWaveTimeCards.test.js
```
