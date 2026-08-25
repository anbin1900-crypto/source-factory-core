# Stage4 shared stores usage

핵심 저장소:
- taeoRawOutputStore.js
- workerOutputBatchStore.js
- panelRecordExecutionStore.js
- laoSourceUnitStore.js
- taeraDownloadResourceStore.js

주의:
- 가능하면 append-only
- worker_id / prompt_id / output_id 유지
- Project Panel identity와 Worker/Commander count를 혼동하지 말 것
