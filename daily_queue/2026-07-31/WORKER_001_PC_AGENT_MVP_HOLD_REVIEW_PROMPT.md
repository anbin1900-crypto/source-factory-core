# WORKER 001 Prompt — PC Agent MVP Hold Review

ISSUED_AT_KST: 2026-07-31T03:50+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
BRANCH: main
WORKER_ID: SOURCE_FACTORY_WORKER_001
TASK_ID: SF_W001_PC_AGENT_MVP_HOLD_REVIEW
MODE: REPORT_ONLY / HOLD_026_EXECUTION / NO_GPT_CALL / NO_BROWSER_LAUNCH / NO_PC_AGENT_SERVICE_START / NO_EXTERNAL_API / NO_MIDDLEWARE_TRANSMISSION / NO_PRODUCTION_DEPLOY
REPORT_TO: SOURCE_FACTORY_COMMANDER

## 1. Worker Role

너는 Source Factory Core의 WORKER 001이다.
너의 역할은 현재까지 구축된 Source Factory runtime pipeline의 상태를 인수받고, 026 PC Agent local MVP dry-run으로 실제 진입하기 전에 보류 상태에서 필요한 검토와 차단요인 점검을 수행하는 것이다.

## 2. Project Goal

Source Factory의 최종 목표는 GitHub queue와 로컬 PC Agent를 결속하여, 사용자가 직접 반복 명령을 치지 않아도 다음 흐름이 안정적으로 수행되는 자동화 코어를 만드는 것이다.

1. GitHub queue에서 작업 지시를 읽는다.
2. Worker assignment를 생성한다.
3. exactly-once claim으로 중복 실행을 막는다.
4. 허용된 로컬 명령만 실행한다.
5. stdout, stderr, exit_code, 산출물을 terminal receipt로 저장한다.
6. report를 GitHub에 commit/push한다.
7. Commander가 receipt를 확인하고 다음 gate를 결정한다.

장기 목표는 이 core를 이용해 ChatGPT Pro 기반 Worker 운영, Source Factory Browser, PC Agent, 그리고 주유소 포털/전문 AI 제작 업무를 병렬 자동화하는 것이다.

## 3. Current Verified Status

다음 상태는 Commander가 확인한 기준이다.

- 015 stable core closure: PASS
- 016 runtime pipeline contract: PASS
- 017B runtime pipeline smoke verify: PASS
- 018B Python one-flow runtime pipeline verify: PASS
- 019 queue dispatch dry-run: PASS
- 020 queue claim / terminal receipt contract: PASS
- 021B local exactly-once simulator: PASS
- 022 stable local claim store: PASS
- 023 terminal receipt store: PASS
- 024B local worker lifecycle dry-run: PASS
- 025 local command runner receipt: PASS

026 PC Agent local MVP files may exist in the repository, but 026 execution is currently HOLD by Commander decision.

## 4. Key Verified Modules

The verified source modules include:

- src/queue/local_claim_store.py
- src/queue/terminal_receipt_store.py
- src/queue/local_worker_lifecycle.py
- src/pc_agent/local_command_runner.py

026 준비 파일 may include:

- src/pc_agent/local_pc_agent_mvp.py
- tools/source_factory_oneflow_pc_agent_local_mvp_verify_and_push.py
- daily_queue/2026-07-31/026_ONEFLOW_PC_AGENT_LOCAL_MVP_VERIFY_EXECUTION.md

These 026 files are not an execution authorization.

## 5. Immediate Worker 001 Mission

Perform a report-only review of the repository state for safe transition into PC Agent MVP.

Required checks:

1. Confirm that 025 PASS report exists and that 026 should remain HOLD.
2. Inspect whether 026 files exist and classify them as PREPARED_NOT_EXECUTED.
3. Confirm that no GPT/browser/PC Agent service/external API/middleware/production deployment action is required or allowed.
4. Review whether the Python one-flow principle is preserved:
   - no PowerShell wrapper dependency for core verification;
   - Python script can verify, generate report, commit, and push when authorized;
   - JSON files with BOM should be read using utf-8-sig where relevant;
   - dynamic Python imports involving dataclass must register modules in sys.modules before exec_module.
5. Identify any risks before 026 activation:
   - command allowlist scope too broad;
   - local command runner missing timeout/exit code capture;
   - receipt missing required fields;
   - duplicate claim or duplicate receipt not blocked;
   - unexpected file mutation outside reports;
   - 026 executing more than dry-run.
6. Produce a Worker report only.

## 6. Forbidden Actions

Do not run 026.
Do not start a PC Agent service.
Do not launch browser automation.
Do not send prompts to GPT.
Do not call external APIs.
Do not transmit middleware data.
Do not deploy production.
Do not modify production code unless Commander explicitly re-authorizes.
Do not claim PASS for any stage unless there is a concrete report, receipt, or remote evidence.

## 7. Expected Report Format

Return a concise but complete report with these sections:

1. WORKER_ID / TASK_ID / MODE
2. Intake status
3. Evidence checked
4. 026 hold compliance
5. Risk list
6. Recommended next gate decision
7. Blockers
8. Final decision

Use one of these final decisions:

- READY_TO_AUTHORIZE_026_LOCAL_DRY_RUN
- KEEP_026_HOLD_PENDING_FIXES
- BLOCKED_NEEDS_COMMANDER_DECISION

## 8. Final Instruction

Begin by reading the latest repository state and the reports for 024B and 025. Treat 026 as HOLD unless the Commander explicitly changes the gate.
