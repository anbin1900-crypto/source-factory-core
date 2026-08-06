# A-5 Endpoint·Schema·Mode Live Inference

`endpoint_schema_mode_inference.cjs`는 외부 패키지 없이 표준입력 JSON을 읽고 A-6 Adapter Compiler용 Generator Input JSON을 출력합니다.

```bash
node endpoint_schema_mode_inference.cjs < fixture_input.json > generator_input.json
node test_endpoint_schema_mode_inference.cjs
```

## 입력

- A-3 형태의 `network_observations`: request/response/status/content-type/body/evidence pointer
- A-4 형태의 `dom_candidates`: repeated regions, field candidates, locator candidates, pagination
- 선택적 `previous_schemas`: Schema Drift 비교용

## 자동판정

- Endpoint Grouping과 URL Path 일반화
- Query/Path/Body Parameter 위치·타입·필수성
- JSON Schema·반복 Record Path·HTML 반복 Signal
- Primary Key 후보·Parent/Child 관계·Identifier Collision 강등
- `DOM_HTML`·`JSON_API`·`HYBRID`
- Breaking Schema Drift와 잘못된 군집의 Fail-Closed 표시

실제 비밀값을 생성하거나 저장하지 않으며, 실행결과의 `raw_secret_value_count`는 항상 0입니다.
