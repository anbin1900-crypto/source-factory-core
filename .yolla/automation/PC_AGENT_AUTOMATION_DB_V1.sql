-- YOLLA PC Agent local automation database projection V1
-- Authority: GitHub committed EPIC.json / RESULT.json and existing WORKER_JOB_SCHEDULE_V1.
-- This SQLite database is a rebuildable local projection, not an official result ledger.

PRAGMA foreign_keys = ON;

BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS pc_agent_schema_meta (
    schema_id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
    applied_at TEXT NOT NULL,
    authority_policy_id TEXT NOT NULL,
    authority_runtime TEXT NOT NULL,
    authority_transport TEXT NOT NULL,
    local_projection_only INTEGER NOT NULL DEFAULT 1 CHECK (local_projection_only = 1)
);

INSERT INTO pc_agent_schema_meta (
    schema_id,
    schema_version,
    applied_at,
    authority_policy_id,
    authority_runtime,
    authority_transport,
    local_projection_only
)
VALUES (
    'YOLLA_PC_AGENT_AUTOMATION_DB_V1',
    1,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    'YOLLA_AUTOMATION_COMMON_RULES_V2',
    'WORKER_JOB_SCHEDULE_V1',
    'LOCAL_DURABLE_FILE_QUEUE_V1',
    1
)
ON CONFLICT(schema_id) DO UPDATE SET
    schema_version = excluded.schema_version,
    applied_at = excluded.applied_at,
    authority_policy_id = excluded.authority_policy_id,
    authority_runtime = excluded.authority_runtime,
    authority_transport = excluded.authority_transport,
    local_projection_only = 1;

CREATE TABLE IF NOT EXISTS automation_packages (
    package_id TEXT PRIMARY KEY,
    schema_version TEXT NOT NULL CHECK (schema_version = 'YOLLA_COMMANDER_EPIC_SUBMISSION_V2'),
    project_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    commander_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    registration_repository TEXT NOT NULL,
    registration_pr_number INTEGER NOT NULL CHECK (registration_pr_number > 0),
    registration_branch TEXT NOT NULL,
    epic_file_path TEXT NOT NULL,
    epic_commit_sha TEXT NOT NULL CHECK (
        length(epic_commit_sha) = 40
        AND epic_commit_sha NOT GLOB '*[^0-9a-f]*'
    ),
    epic_sha256 TEXT NOT NULL CHECK (
        length(epic_sha256) = 64
        AND epic_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
    source_json TEXT NOT NULL CHECK (json_valid(source_json)),
    import_status TEXT NOT NULL DEFAULT 'IMPORTED' CHECK (
        import_status IN ('IMPORTED', 'VALIDATED', 'RUNNING', 'PARTIAL_BLOCKED', 'COMPLETED', 'REJECTED')
    ),
    imported_at TEXT NOT NULL,
    last_reconciled_at TEXT,
    UNIQUE (registration_repository, registration_pr_number, epic_file_path, epic_commit_sha)
);

CREATE TABLE IF NOT EXISTS automation_workers (
    package_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    worker_slot_uid TEXT NOT NULL,
    repository TEXT NOT NULL,
    control_pr INTEGER NOT NULL CHECK (control_pr > 0),
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    queue_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        queue_status IN (
            'PENDING', 'READY', 'DISPATCHING', 'RUNNING',
            'WAIT_DEPENDENCY', 'RETRY_READY', 'BLOCKED_EXTERNAL',
            'COMPLETED', 'DISABLED'
        )
    ),
    last_event_at TEXT,
    PRIMARY KEY (package_id, worker_id),
    UNIQUE (package_id, worker_slot_uid),
    FOREIGN KEY (package_id)
        REFERENCES automation_packages(package_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS automation_epics (
    package_id TEXT NOT NULL,
    epic_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence >= 1),
    directive_id TEXT NOT NULL,
    title TEXT NOT NULL,
    instruction TEXT NOT NULL,
    done_when_json TEXT NOT NULL CHECK (
        json_valid(done_when_json)
        AND json_type(done_when_json) = 'array'
        AND json_array_length(done_when_json) >= 1
    ),
    expected_terminal_json TEXT NOT NULL CHECK (
        json_valid(expected_terminal_json)
        AND json_type(expected_terminal_json) = 'array'
        AND json_array_length(expected_terminal_json) >= 1
    ),
    retry_limit INTEGER NOT NULL CHECK (retry_limit BETWEEN 0 AND 20),
    runtime_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        runtime_status IN (
            'PENDING', 'READY', 'DISPATCHING', 'RUNNING',
            'RESULT_WAITING', 'PASS', 'RETRY_READY',
            'BLOCKED_EXTERNAL', 'WAIT_DEPENDENCY', 'NEEDS_REPLAN'
        )
    ),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    result_pointer TEXT,
    result_commit TEXT CHECK (
        result_commit IS NULL OR (
            length(result_commit) = 40
            AND result_commit NOT GLOB '*[^0-9a-f]*'
        )
    ),
    last_failure_signature TEXT,
    last_dispatched_at TEXT,
    last_checked_at TEXT,
    PRIMARY KEY (package_id, epic_id),
    UNIQUE (package_id, directive_id),
    UNIQUE (package_id, worker_id, sequence),
    FOREIGN KEY (package_id, worker_id)
        REFERENCES automation_workers(package_id, worker_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS automation_epic_dependencies (
    package_id TEXT NOT NULL,
    epic_id TEXT NOT NULL,
    depends_on_epic_id TEXT NOT NULL,
    PRIMARY KEY (package_id, epic_id, depends_on_epic_id),
    CHECK (epic_id <> depends_on_epic_id),
    FOREIGN KEY (package_id, epic_id)
        REFERENCES automation_epics(package_id, epic_id)
        ON DELETE CASCADE,
    FOREIGN KEY (package_id, depends_on_epic_id)
        REFERENCES automation_epics(package_id, epic_id)
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS automation_dispatches (
    dispatch_id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL,
    epic_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    worker_slot_uid TEXT NOT NULL,
    work_id TEXT NOT NULL UNIQUE,
    command_id TEXT NOT NULL,
    cycle_id TEXT NOT NULL,
    wave_id TEXT NOT NULL,
    assignment_id TEXT NOT NULL,
    directive_id TEXT NOT NULL,
    execution_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    source_github_ref TEXT NOT NULL,
    duplicate_prompt_key TEXT NOT NULL UNIQUE CHECK (
        duplicate_prompt_key GLOB 'a5-p1-command-[0-9a-f]*'
        AND length(duplicate_prompt_key) = 79
    ),
    payload_sha256 TEXT NOT NULL CHECK (
        length(payload_sha256) = 64
        AND payload_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
    dispatch_status TEXT NOT NULL DEFAULT 'CREATED' CHECK (
        dispatch_status IN (
            'CREATED', 'QUEUED', 'DISPATCHING', 'RUNNING',
            'RESULT_WAITING', 'PASS', 'RETRY_READY',
            'BLOCKED_EXTERNAL', 'DUPLICATE_PROMPT_SUPPRESSED',
            'FAILED_CLOSED'
        )
    ),
    dispatched_at TEXT,
    completed_at TEXT,
    UNIQUE (package_id, epic_id, attempt_id),
    FOREIGN KEY (package_id, epic_id)
        REFERENCES automation_epics(package_id, epic_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS automation_results (
    result_id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispatch_id TEXT NOT NULL,
    package_id TEXT NOT NULL,
    epic_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    terminal_status TEXT NOT NULL CHECK (
        terminal_status IN ('PASS', 'BLOCKED_EXTERNAL')
    ),
    source_commit TEXT CHECK (
        source_commit IS NULL OR (
            length(source_commit) = 40
            AND source_commit NOT GLOB '*[^0-9a-f]*'
        )
    ),
    remote_pointer TEXT NOT NULL,
    tests_json TEXT NOT NULL CHECK (
        json_valid(tests_json)
        AND json_type(tests_json) = 'array'
    ),
    blocker TEXT,
    result_json TEXT NOT NULL CHECK (json_valid(result_json)),
    result_sha256 TEXT NOT NULL CHECK (
        length(result_sha256) = 64
        AND result_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
    result_commit_sha TEXT NOT NULL CHECK (
        length(result_commit_sha) = 40
        AND result_commit_sha NOT GLOB '*[^0-9a-f]*'
    ),
    published_at TEXT NOT NULL,
    readback_verified INTEGER NOT NULL DEFAULT 0 CHECK (readback_verified IN (0, 1)),
    second_execution_performed INTEGER NOT NULL DEFAULT 0 CHECK (second_execution_performed = 0),
    UNIQUE (dispatch_id, result_sha256),
    FOREIGN KEY (dispatch_id)
        REFERENCES automation_dispatches(dispatch_id)
        ON DELETE CASCADE,
    FOREIGN KEY (package_id, epic_id)
        REFERENCES automation_epics(package_id, epic_id)
        ON DELETE CASCADE,
    CHECK (
        (terminal_status = 'PASS' AND source_commit IS NOT NULL AND blocker IS NULL)
        OR
        (terminal_status = 'BLOCKED_EXTERNAL' AND blocker IS NOT NULL AND length(trim(blocker)) > 0)
    )
);

CREATE TABLE IF NOT EXISTS automation_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id TEXT NOT NULL,
    epic_id TEXT,
    worker_id TEXT,
    event_type TEXT NOT NULL,
    event_payload_json TEXT NOT NULL CHECK (json_valid(event_payload_json)),
    created_at TEXT NOT NULL,
    FOREIGN KEY (package_id)
        REFERENCES automation_packages(package_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_automation_epics_next
    ON automation_epics(package_id, worker_id, runtime_status, sequence);

CREATE INDEX IF NOT EXISTS idx_automation_dependencies_target
    ON automation_epic_dependencies(package_id, depends_on_epic_id);

CREATE INDEX IF NOT EXISTS idx_automation_dispatches_status
    ON automation_dispatches(package_id, worker_id, dispatch_status);

CREATE INDEX IF NOT EXISTS idx_automation_results_lookup
    ON automation_results(package_id, epic_id, terminal_status, published_at);

CREATE UNIQUE INDEX IF NOT EXISTS ux_one_active_dispatch_per_worker
    ON automation_dispatches(package_id, worker_id)
    WHERE dispatch_status IN ('QUEUED', 'DISPATCHING', 'RUNNING', 'RESULT_WAITING');

COMMIT;
