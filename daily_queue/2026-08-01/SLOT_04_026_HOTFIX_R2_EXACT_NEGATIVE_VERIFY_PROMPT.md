# SLOT 04 — 026 HOTFIX R2 Exact Negative Verification Prompt

TARGET_SLOT: SLOT_04
WORKER_ID: SOURCE_FACTORY_SLOT_04
BATCH_ID: SF_026_HOTFIX_R2_REDISPATCH_20260801_0224
REPOSITORY: anbin1900-crypto/source-factory-core
BRANCH: main
WORKER_FUNCTION_CLASS: TEST_FIXTURE_WORKER
MODE: EXACT_GIT_BLOB_FIXTURE_ONLY / READ_ONLY_OR_REPORT_ARTIFACT_ONLY / NO_PRODUCTION_SOURCE_MODIFICATION / NO_026_EXECUTION / NO_SERVICE / NO_EXTERNAL_EFFECT

## Prior result to intake

R1 result commit:
`be2b50ffd7c076774d4d6e40ca55af870da34ace`

R1 exact result commit:
`6d984e0093b6f62ebef09b2a172ff6374fc64642`

R1 verifier commit:
`29f5af60095eccb1372b0f61c02dc2c5d62bc24a`

Upstream implementation commits previously intaked:

- SLOT 01: `42b1f29b276f603cd793f930b79346700bbbe551`
- SLOT 02: `2207b9b4fc547afc673c0f3229b23f18b65a5be9`
- SLOT 03: `7a51cdd3965b6b215922e9f6f334eea97ae2825a`

## Task

Run or reaffirm exact negative verification against the current R2 intake. Do not run 026 one-flow verifier.

You must verify and report:

1. Exact Git blob reconstruction for SLOT 01, SLOT 02, SLOT 03, and shared claim store source.
2. Python syntax compile for verifier and exact source blobs.
3. Pre-seeded duplicate claim fixture rejects command and receipt execution.
4. Canonical command mismatch and unknown ID reject before subprocess invocation.
5. Command launch failures are structured.
6. Terminal receipt invalid fixtures are rejected without store mutation.
7. Valid receipt is accepted once and duplicate receipt rejected.
8. Unexpected mutation outside fixture/report paths is zero.
9. 026 one-flow invocation count is zero.
10. External side effect count is zero.

## Output

Publish a new append-only WORKER_REPORT under `reports/slot_04_026_hotfix_r2_exact_negative_verify_*`.

Your report must include:

- exact current HEAD observed
- prior R1 result commit intake status
- exact source blob match status
- negative fixture status
- command/subprocess invocation count evidence
- receipt store mutation evidence
- unexpected mutation status
- whether R2 negative verification is PASS or FAIL
- explicit statement that 026 execution was not run

Allowed terminal line:

`SLOT_04_R2_EXACT_NEGATIVE_VERIFY_PASS`

or

`SLOT_04_R2_EXACT_NEGATIVE_VERIFY_FAIL`

Do not claim batch GREEN. Next needed remains SLOT 05 combined intake.
