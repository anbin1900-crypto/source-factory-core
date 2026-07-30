# 욜라 사이트 스캐너 upstream 교정 및 최종통합 인계

## 확인 결과

원본 ZIP SHA는 작업보고와 일치합니다.

- W1: 8fd74f5a06ea1c2b0f96ee315d660678899a0250c1c785219b8091e44123ea8d
- W2: b5259aed110c6ccd90574260695e914fc2644eb7b17f53bbcbb68ca30e3119b4
- W3: a6702c0f17aca09eb6d0c6530d14e8211ef1ebf44eb1310e0161a0f7c81d4dc8
- W4: 45e1325ba84b37b5dfaa9171766e3772a9f06ae24cd2b757c690bde5138bd869

## 발견된 차단원인

W4의 실제 upstream verifier를 실행하면 현재 W1·W2·W3 ZIP은 차단됩니다.

공통 원인:

- 루트 `MANIFEST_SHA256.json` 없음
- 루트 `MODULE_MANIFEST.json` 없음
- 기계판독용 `TEST_REPORT.json` 없음

추가 원인:

- W1 `ScannerCore`에 공통 인터페이스 `getStatus()`가 없음
- W1·W2 Markdown TEST_REPORT에 `fail-closed` 같은 단어가 있어 W4의 단순 정규식이 오판할 수 있음

## 순서

1. W1·W2·W3 교정을 병렬 실행
2. 각 교정 ZIP과 새 RESULT_SHA 수령
3. W4 2차 통합 실행
4. `YOLLA_SITE_SCANNER_V1_0.zip` 생성
5. 그 결과를 W6·W7에 전달
