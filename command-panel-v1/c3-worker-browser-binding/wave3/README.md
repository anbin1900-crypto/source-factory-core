# C-3 AI욜라 Workspace PC Context Wave 3

A-1이 GitHub에 게시한 Target PC Runtime 수용 및 개발환경 Snapshot을 AI욜라 Workspace의 역할·전문서비스 Session에 읽기 전용으로 결속한다.

- 같은 역할의 3개 전문서비스는 하나의 Context Snapshot만 사용한다.
- 다른 서비스·Wave·Snapshot 결과 혼합은 Fail-closed한다.
- Credential, 환경변수 값, Browser Data, SSH Key, 원본 파일 내용은 Workspace에 전달하지 않는다.
- Runtime 요청은 Metadata만 만들고 실제 실행권한은 부여하지 않는다.

```bash
node --check aiYollaWorkspacePcContextAdapter.js
node tests/testAiYollaWorkspacePcContextAdapter.js
```
