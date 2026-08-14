# YOLLA current handoff — 2026-08-14

Status snapshot: 2026-08-14 14:27 KST

Publication authority: `anbin1900-crypto/source-factory-core`, base `main@50877defc2e6b69f5f9a941aa508e3ac2c3dcbd5`

This is a non-secret operational handoff. It records verified runtime facts and separates package/test completion from production application. It does not contain passwords, tokens, cookies, tunnel credentials, signing keys, device identifiers, full ChatGPT conversation URLs, or user-profile paths.

## 1. Authority goal and fixed user decisions

The product goal is a lightweight, portable YOLLA control surface that manages multiple project groups and their commander/worker ChatGPT contexts, observes real GPT state, records commands/results in the ledger and board, and supports safe recovery and replacement.

The following decisions are authoritative:

- Automatic WAKE, automatic goal follow-up, idle/status/error messages, and scheduler-originated GPT sends are removed or disabled.
- The normal work-assignment path is an authenticated `USER_DIRECT` one-shot arm/consume operation bound to request, group, worker, conversation, canonical URL, nonce, safety revision, and an expiry of at most 120 seconds.
- Delivery means an exact target ChatGPT composer submit with protocol/DOM acknowledgement. Queue acceptance, HTTP 200, extension receipt, popup display, and OS notification are not delivery success.
- User-directed sends are sequential, at least 10 seconds apart. Replays, mismatches, expired gates, and pre-existing request IDs fail closed.
- `program_stopped=true` and `commander_wake_stopped=true` remain the operating default. A one-shot does not globally resume the program.
- Worker state exposed to users has only `IDLE` (can receive), `WORKING` (cannot receive), and `ERROR` (cannot receive). Stale or unverified evidence must not silently become `IDLE`.
- The standalone DOM monitor keeps its current all-open-tabs card UI. Registry join, dedupe, work cycles, and duration details belong in the legacy/WEB monitoring projections.
- Existing ChatGPT URLs accept canonical `https://chatgpt.com/c/{conversationId}` and `https://chatgpt.com/g/{safeProjectSlug}/c/{conversationId}` forms. A user-entered valid URL is authoritative; a blank URL alone provisions a new context.

## 2. Live system inventory

| Component | Product path | Process / port | Verified live state | Production status |
|---|---|---|---|---|
| Legacy communicator/panel | `E:/YOLLA/yolla-communicator-clean-v06` with runtime `E:/YOLLA/yolla-communicator-runtime-v06/current` | Electron PID 22780 / 37860 | health 200; safety V2 revision 1; runtime active false | **RUNNING, FIXING** — state projection is not release-ready |
| Commander continuity service | `E:/YOLLA/yolla-communicator-clean-v06/app/commanderContinuityService.cjs` | Node PID 7852 / 37861 | listener present | **RUNNING** |
| New WEB V1 | `E:/YOLLA/lao-project-web-v1-independent` | Node PID 6000 / 8080 | root 200; API health 200; password-login capability true; live ChatGPT access false | **RUNNING, PARTIAL** |
| Board/control center | `E:/YOLLA/web-server-v1` | Node PID 16944 / 3340 | root and `/api/health` 200; `/api/control-panel` 502 because dependency 3320 is absent | **RUNNING, NO-GO UI links** |
| Site MRI | deployed service; stable product root pending handoff confirmation | Node PID 25680 / 3350 | root 200, `/health` 404 | **RUNNING, PARTIAL** |
| Legacy linked UI | system listener | PID 4 / 3330 | HTTP 200 | **RUNNING** |
| Control-panel dependency | not installed/running | 3320 | no listener | **BLOCKED** |
| DOM status bridge | `E:/YOLLA/yolla-dom-status-bridge-v1` | Node PID 19068 / 37961 | health 200; 111 requests, 73 posts, 21 items; GPT send/reload/navigation counters all 0 | **RUNNING, NO-GO identity** |
| DOM monitor extension | `E:/YOLLA/yolla-dom-status-monitor-v1.1.0` | Chrome Manifest V3, version 1.2.2 | active files verified; Native Messaging host not registered | **INSTALLED, PARTIAL** |
| AI Browser | `E:/YOLLA/ai-browser-v1` | Node PID 26728 / 32120; Chrome PID 9124 / 32121 | API health 200; remote-debug listener present | **RUNNING** |
| Naver adapter | deployed Node service | PID 24216 / 32130 | health 200 | **RUNNING** |
| Geo enrichment | deployed Node service | PID 12820 / 38431 | listener present | **RUNNING** |
| PC tool gateway | system-hosted connector | 32110 | connector reports READY v5.0.0-native; raw `/health` is not its contract | **RUNNING** |
| Native Messaging / Adapter V2 | staging workstreams under WEB root | no production listener | tests and dry-run packages exist; Windows host/registry/ACL and live Adapter V2 are not wired | **NO-GO** |
| Tool Gateway workstreams | `E:/YOLLA/lao-project-web-v1-independent/workstreams/tool-gateway` | no production service | package-level fixtures/HANDOFFs exist | **STAGING ONLY** |
| Android client | `E:/YOLLA/lao-android-mobile-v1` | APK artifact | v1.2.3 APK SHA-256 `964F4FC2BB749523B3BAB4733646848BE0343441E216D95E2DD3289BA26D1FB5`; device state not verified because ADB was unavailable to this readback | **ARTIFACT READY, DEVICE UNVERIFIED** |
| External tunnel | quick-tunnel processes | cloudflared PIDs 4152 and 11096 | two quick-tunnel processes observed; public URL and credentials intentionally omitted | **RUNNING, EXTERNAL ACCEPTANCE REQUIRED** |

WEB status observation is configured for `http://127.0.0.1:37961/v1/status/snapshot` with a 2.5 second request timeout. Effective observation cadence/staleness remains the deployed 5 second / 45 second contract until configuration projection is normalized. WEB health explicitly reports `liveChatGptAccess=false`.

### DOM and legacy state evidence

At 14:23 KST, the bridge held 21 items but emitted zero non-null `registrationId`, `groupId`, and `generation` values. The legacy lightweight projection contained 31 rows: `ERROR=30`, `IDLE=1`; `STALE=30`, `FRESH=1`; exact registry join `1/31`. All rows used `DOM_STATUS_BRIDGE_SIMPLE_V1`. This is an improvement in transport availability, not an acceptable identity/status result.

The installed extension hashes at this checkpoint are:

- `manifest.json`: `AF58B42837BAF23525193F4A1E38803EF74EFF55DB619121220E03FFA2925F34`
- `background.js`: `50A4427DB4B49A8A4D9BBBE8C47804AAE017A3D3AB91B42ACD8A1C9F2DA183F3`

## 3. A–D and current worker workstreams

| Stream | Worker / command | Artifact or post | Current classification | Acceptance needed |
|---|---|---|---|---|
| A — legacy DOM live activation | worker 23, `YOLLA-COMM-20260814033043-D2813F` / `ATT-27818407-F91B-487C-A8E4-F43CF781EFC5` | `workstreams/legacy-dom-live-activation-v2`; HANDOFF SHA `468491DDAF53B09C68EAC8C6A42EF04FD97F8EA527BC1C6E7681F5B1AFA8F7F0` | **FIXING / NO-GO**; HANDOFF production claim contradicted by live exact join `1/31` | registry-authenticated producer identity, active-generation exact join, stale fail-closed, truthful denominator, desktop/UI readback |
| B1 — native security candidate | worker 21, `YOLLA-COMM-20260814035238-A02F49` / `ATT-2EAC1359-7F74-4D24-980F-7A6C2BC1B132` | `tool-gateway/native-security-production-candidate-v2`; SHA `2C08CBB068F237EF08B95759ABE7CAC40C3FE5B4941173CD56EFF86AEDE79DE6` | **INTEGRATION READY (staging only)** | C09/C10/C12, actual install root/ACL/hash/extension ID/registry/apply and rollback readback |
| B2 — native runtime wiring | worker 20, `YOLLA-COMM-20260814035339-E44408` / `ATT-0F8C6AAC-0E13-4EBB-B2CA-7DAFD596FBDD` | `tool-gateway/native-runtime-production-wiring-v2`; SHA `0AC599AA001E8926DE07B25FBCAF43A68F4DC94C1AC6525D498E5814BDF84DE7` | **INTEGRATION READY (dry-run only)** | deploy values, Windows install/rollback, and separate proven executor for configured post relay |
| B3 — integration recollection | worker 22, `YOLLA-COMM-20260814033137-19DABC` / `ATT-D5B45551-9443-4F41-8580-5B686AB5D404` | HANDOFF SHA `03EB3E18BF7FE6FF0915CD3F7459C15EEE6069EB458E1646FC3C56614140E4FA` | **BLOCKED FIXABLE**; pins predate B1/B2 fixes | recollect stable SHA set, preserve C09–C12/relay/Windows gates, then freeze manifests |
| C — GPT/PC tool inventory | worker 12, `YOLLA-COMM-20260814033159-36ED6B` / `ATT-210BB528-1897-4A7F-AAC7-B00D8E06BC22` | board post `20260814034730-6e854ba43a`; derived display number 700; two attachments read back | **PARTIAL** | enumerate authorized candidate roots, explicit exclusions/errors/duplicates, zero unclassified, closure pass; label display number as derived |
| D — 3340 tools menu | worker 15, `YOLLA-COMM-20260814033230-8CD9C4` / `ATT-1F3AE291-17AF-458E-B561-7AB08BEB84A2` | `workstreams/board3340-tools-menu-v1`; SHA `66E48A79D5809DFFA81F8C346FF9E18EC3BC6E7176EBF19D9BC3F2928B86A6D6` | **FIXING / NO-GO** | remove/gate dead 3350 links, honest 503 for missing 3320, authenticated launch boundary or no launch, 360/390 px overflow tests, fresh screenshots/readback |
| URL parser exact v2 | recovery workstream | HANDOFF SHA `DD6CD86342AC7086ABFEEAF5222ABD8D109FC231042732722AC99B95BA63E652` | **BLOCKED FIXABLE** | latest shared-tree full suite is 241/247; replace six stale same-project/UI assertions and correct help/validation copy before any 8080 deploy |

No workstream is considered production complete merely because `verified=true` appears in its own HANDOFF. Runtime readback and independent acceptance take precedence.

## 4. Safety, queue, and send evidence

- Safety authority: schema V2, revision 1, `program_stopped=true`, `commander_wake_stopped=true`.
- Legacy health: runtime active false. WAKE remains removed/stopped; no automatic follow-up capability is authorized.
- GPT signal audit SHA: `57F389FFD5B62ACBA9431CD5CEEB3202D8342BB12C49A6B8BA540151EE779EDF`.
- Since the fail-closed safety event at `2026-08-13T19:50:28.691Z`, 31 `GPT_SENT` audit rows exist; every one is `PANEL_USER_COMMAND`. Automatic/WAKE/follow-up/scheduled marker count is zero.
- Communication ledger SHA: `FC6754E5058DE778A335AA89605A5161916F3AC1B021F91FBCFD1225A69C33E1`. Read-only status-field occurrences were: completed 527, aborted 32, error 56, recovery-approval-required 9, unknown-reconcile 1, working 18, queued 3. These are field occurrences, not deduplicated command totals.
- During this handoff collection, GPT sends, queue consumption, process restarts, and operating-file mutations were all zero.

## 5. Known blockers and approval boundaries

1. **DOM identity/status:** bridge transport is alive, but producer identity fields are absent and exact legacy join is `1/31`. Stale/default fail-open must remain eliminated; fresh verified identity is required before `IDLE`.
2. **URL registration:** arbitrary safe `/g/{slug}/c/{id}` remains blocked by stale tests/copy and old project-scope semantics. The isolated recovery patch is not deployed.
3. **Native security/wiring:** C02/C04/C06/C08/C11 packages are staging-green. C09 authorization, C10 group/generation scoping, C12 principal-bound receipt wiring, actual Native Messaging installation, ACL/hash readback, registry, and rollback are incomplete.
4. **Adapter/direct relay:** exact target composer ACK must be proven with fake/stub runtime first. Live GPT canary is **USER_APPROVAL_REQUIRED**.
5. **3340 dependencies/UI:** 3320 is absent and `/api/control-panel` returns 502; the 3350 feature lacks a health contract. Mobile overflow and visible dead-action checks remain.
6. **External access:** quick tunnels are running, but Cloudflare Access policy/token rotation and an external canary are **USER_APPROVAL_REQUIRED**. Secret values must never enter git.
7. **Android:** APK exists, but install/update/device readback requires an attached ADB-capable session and explicit device action.

## 6. Ordered next work

1. **P0 DOM recovery — owner A:** authenticate registry snapshot to the producer; emit immutable `registrationId`, `groupId`, and monotonic `generation`; verify canonical A/B URL and active-generation join; reject stale/replay/cross-group/tombstone events; prove fixture coverage and live shadow before overlay. Acceptance: identity non-null for the scoped registered set, exact join materially above `1/31`, no guessed mappings, stale/error projection correct, standalone popup hashes/UI unchanged.
2. **P0 URL parser — recovery owner:** update shared parser/server/client/tests together; latest full suite must have zero failures. Deploy only after timestamp backup and single 8080 restart. Acceptance includes the user-provided arbitrary-slug form without logging the raw conversation URL.
3. **P0 3340 menu — owner D:** implement health-aware cards, honest dependency-unavailable responses, authenticated/no-launch boundary, real loopback link crawl, and 360/390 px viewport assertions. Restart 3340 once only after QA green.
4. **P0 native hardening — owners B1/B2:** finish C09/C10/C12 provider wiring, real installed-path evidence adapter, Native Messaging registration plan/executor/rollback, then refreeze B3 manifests.
5. **P1 monitoring/relay:** consume only exact registered targets and durable ledger cycles. Complete fake direct-composer ACK/replay/dedupe/5-line-batch tests. Any live ChatGPT submit remains separately approved.
6. **P1 inventory:** produce a closure-complete, redacted inventory and superseding board post without modifying existing post 700.
7. **P2 external/Android:** perform Cloudflare canary, token rotation, Android install/update, and rollback only with explicit user approval and non-secret evidence.

## 7. Recovery and rollback rules

- Resolve the exact target and capture SHA-256, PID, port, health, queue snapshot, and safety revision before mutation.
- Create a timestamped backup under the owning product root. Keep source, authority, runtime, and approved manifest roles distinct.
- Apply to staging first; run focused and full contracts; verify a 30-second file-stability window before final HANDOFF/hash freeze.
- Deploy atomically to one owner at a time. Use the stable launcher and a single interactive restart; do not restart overlapping services concurrently.
- After restart verify exactly one process, expected port/health/schema, safety true/true twice, queue/GPT-send delta zero, UI/DOM readback, and rollback viability.
- On failure stop subsequent actions, preserve successful prior state and ledger evidence, and roll back only the affected product. Never delete the underlying ChatGPT conversation as part of panel cleanup.

## 8. New commander: first 15 minutes

1. Read this Markdown and the companion JSON; confirm snapshot time and all `NO-GO` items.
2. Read 37860 health and safety state twice. Do not continue unless both stop switches are true and revision is monotonic.
3. Snapshot listeners and health for 8080, 3340, 37860, 37861, and 37961. Do not restart anything during orientation.
4. Read the command ledger and GPT audit. Preserve the three queued records; do not flush historical or automatic queues.
5. Compare bridge identity counts with the legacy registry. Treat missing/stale/mismatched targets as `ERROR`, not `IDLE`.
6. Review A–D HANDOFF hashes and independent blockers. Do not trust self-declared `productionApplied` without live readback.
7. Select one P0 owner and one non-overlapping staging owner. Keep production file ownership exclusive.
8. For a user-directed worker command, use one authenticated one-shot arm/consume, exact target validation, expiry at most 120 seconds, and a 10-second spacing rule. Never globally resume.
9. Record command/attempt/ACK and wait for a ledger/board result. Do not generate an automatic follow-up.

## 9. Two supported operating modes

**Panel direct chat:** the user chooses an exact registered worker or commander. The server validates group/worker/conversation/canonical URL and consumes one USER_DIRECT gate. The managed browser submits to the real target composer. Only protocol/DOM ACK is success.

**Ledger and board:** commands, attempts, receipts, results, files, and posts are durable evidence. A result is complete only after post/body/attachment readback. A configured post relay may later submit exact server-composed text to a commander, but it must not generate its own prose, use WAKE, or turn receipt/audit events into another outbound trigger.

## 10. Authentication publication rule

The repository may describe mechanisms only: loopback binding, password-login capability, commander authorization, USER_DIRECT confirmation, revision CAS, nonce/expiry, Cloudflare Access/service-token concepts, Android signing/install flow, redaction, and rotation/revocation procedures. It must never contain credential values, cookies, authorization headers, private tunnel material, APK signing material, or user-profile data.
