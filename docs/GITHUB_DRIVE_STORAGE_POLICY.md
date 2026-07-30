# GitHub + Google Drive Storage Policy

## 1. 저장 원칙

```text
GitHub = 권위 원장 / 작은 텍스트 / 소스 / 상태
Google Drive = 대용량 원본 / ZIP / DB / evidence archive
```

## 2. GitHub commit 허용 대상

```text
- README.md
- PROMPT.md
- WORKER_REPORT.md
- RESULT.json
- MANIFEST_SHA256.json
- SHA256SUMS.txt
- 작은 JS/Python/PowerShell 소스
- 템플릿
- 상태표 CSV
- Drive pointer JSON
```

## 3. Google Drive 보관 대상

```text
- 100MB 이상 ZIP
- DB dump
- raw crawler output
- 실사이트 MRI evidence bundle
- 개인정보 가능 원본 데이터
- 대량 CSV / JSONL / GZIP
- complete package archive
```

## 4. Drive Pointer 규격

GitHub에는 대용량 파일 자체가 아니라 다음 포인터만 저장합니다.

```json
{
  "artifact_id": "W05_CANONICAL_COMPLETE",
  "storage": "GOOGLE_DRIVE",
  "drive_path_or_url": "YOLLA/artifacts/W05/...",
  "file_name": "YOLLA_REGISTRY_LEGACY_NAVER_MERGE_V2_0_1_COMPLETE.zip",
  "size_bytes": 326786922,
  "sha256": "172174588d6fb4d8295e23815c3be06bb13e20cd4c6a9dbb3f20534244fc6159",
  "status": "REQUIRED_INPUT",
  "verified": false
}
```

## 5. 승격 금지

```text
Drive pointer exists != file verified
GitHub manifest exists != byte-exact artifact exists
ZIP CRC PASS != production evidence PASS
```
