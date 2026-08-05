# C6W2 Wave 2 Report Templates V3

## C Result — worker

```text
PANEL | ROLE=<WORKER_ROLE> | WAVE=V1-C-MODE-6W-WAVE-002 | COMMAND_ID=<COMMAND_ID> | STATUS={REPORTED|END}
```

## C Result — commander

```text
PANEL | ROLE=V-1 | WAVE=V1-C-MODE-6W-WAVE-002 | COMMAND_ID=<COMMAND_ID> | STATUS={REPORTED|END}
```

## Repeat Result

```text
PANEL | ROLE=<TARGET_ROLE> | COMMAND_ID=<COMMAND_ID> | DISPATCH_ID=<IMMUTABLE_DISPATCH_ID> | STATUS={REPORTED|END}
```

## Rules

- C Result requires ROLE, WAVE, COMMAND_ID, STATUS and forbids DISPATCH_ID.
- Repeat Result requires ROLE, COMMAND_ID, DISPATCH_ID, STATUS and forbids WAVE.
- Missing, stale, mixed, duplicated, order-reversed, or wrong-schema reports receive no completion credit.
- Legacy Wave 1 comments are read-only fixtures scoped to this control cycle; they cannot complete Wave 2.
