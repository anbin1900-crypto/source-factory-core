# SF_028 Active Core Migration Runbook

## Fixed paths

- OLD_ROOT: `D:\SOURCE FACTORY`
- Runtime entry: `D:\SOURCE FACTORY\RUN_SF4_SAFE_PANEL_ONLY.bat`
- NEW_ROOT: `E:\SOURCE FACTORY\source-factory-active-core`
- GitHub repository: `anbin1900-crypto/source-factory-core`
- GitHub branch: `agent/sf-028-active-core-migration`

## Python worker behavior

1. Treats `D:\SOURCE FACTORY` as read-only.
2. Reads the SAFE Panel BAT and expands `ROOT`, `CAND`, and `SAFE`.
3. Retains the full `safe_panel_v10` runtime bundle.
4. Adds the compact constitution, queue, PC Agent, runtime pipeline, browser bridge, PowerShell 5.1 rules, and current verify/install tool candidates.
5. Follows local JavaScript, Python, HTML, CSS, JSON, BAT, and PowerShell dependencies.
6. Copies files while preserving runtime-relative paths.
7. Generates a self-relative active-core launcher and dependency installation seed.
8. Runs JSON parse, Python `py_compile`, JavaScript `node --check`, required-file, SHA-256, and forbidden-path checks.
9. Generates file-by-file role analysis and a runtime dependency graph.
10. Publishes report-only evidence to GitHub when `gh` and `git` are installed and authenticated.

The worker never deletes or changes OLD_ROOT. It never copies `.git`, `node_modules`, complete `reports`, complete `daily_queue`, complete `staging`, or the 25,000-file candidate pool. It does not run the 026 verifier, Electron runtime, PC Agent service, middleware, external API, or production deployment.

## Run from an existing PowerShell window

```powershell
python "$env:USERPROFILE\Downloads\sf028_active_core_migrate.py" `
  --old-root "D:\SOURCE FACTORY" `
  --entry-bat "D:\SOURCE FACTORY\RUN_SF4_SAFE_PANEL_ONLY.bat" `
  --new-root "E:\SOURCE FACTORY\source-factory-active-core" `
  --publish-github `
  --github-repo "anbin1900-crypto/source-factory-core" `
  --github-branch "agent/sf-028-active-core-migration"
```

The PowerShell window remains open because Python runs inside the current shell.

## GitHub prerequisites

```powershell
gh --version
gh auth status
git --version
```

If authentication is missing:

```powershell
gh auth login
gh auth setup-git
```

Then rerun the Python command.

## Generated local reports

- `ACTIVE_CORE_MANIFEST.json`
- `MIGRATION_COPY_REPORT.json`
- `VERIFY_ACTIVE_CORE_REPORT.json`
- `DELETE_OLD_ROOT_READY_REPORT.md`
- `WORKER_REPORT_SF028.md`
- `SOURCE_ROLE_ANALYSIS.json`
- `SOURCE_ROLE_ANALYSIS.md`
- `RUNTIME_DEPENDENCY_GRAPH.json`
- `GITHUB_PUBLISH_REPORT.json`
- `SF028_TERMINAL.txt`

## Dependency boundary

`node_modules` is intentionally excluded. The migration generates `INSTALL_ACTIVE_CORE_DEPENDENCIES.ps1` and `RUN_SF4_ACTIVE_CORE_SAFE_PANEL.bat`.

A source seed may be `new_root_ready=true` while `runtime_launch_ready=false` until the dependency install script is run. This prevents a false standalone-runtime claim.
