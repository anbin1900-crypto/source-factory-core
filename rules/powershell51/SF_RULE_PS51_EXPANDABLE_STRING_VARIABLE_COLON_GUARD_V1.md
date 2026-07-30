# SF_RULE_PS51_EXPANDABLE_STRING_VARIABLE_COLON_GUARD_V1

status: ACTIVE
registered_at_kst: 2026-07-31T05:47:00+09:00
scope: all Source Factory PowerShell 5.1 effective source, generated fixture source, materialized Git blob source, validator source, runner source, and receipt serializer source
origin_event: A4 PR #177 V9 fixture-only Windows PowerShell 5.1 native parser failure

## 1. Rule Summary

Windows PowerShell 5.1 treats an unbraced variable immediately followed by a colon inside an expandable string as a scope or drive-qualified variable reference.

Therefore, ordinary variable interpolation followed by a literal colon MUST use braced variable syntax.

Required form:

```powershell
"${Case}:$($Value.GetType().FullName)"
"${path}:$($errors[0].Message)"
"${lfRaw}:${crlfRaw}:${lfBlob}:$normalizedBlob"
```

Forbidden ordinary-variable form:

```powershell
"$Case:$($Value.GetType().FullName)"
"$path:$($errors[0].Message)"
"$lfRaw:$crlfRaw:$lfBlob:$normalizedBlob"
```

## 2. Why This Rule Exists

A4 PR #177 V9 had already passed Generic List correction, but fixture-only validation found that V9 effective source failed before reaching Empty/One/Many Generic List execution.

Confirmed failure class:

```text
GENERIC_LIST_CORRECTION=PASS
V9_EFFECTIVE_SOURCE_PS51_NATIVE_PARSE=FAIL
EMPTY_ONE_MANY_EXECUTION=NOT_STARTED_BY_PARSER_ERROR
PARSER_ERROR=InvalidVariableReferenceWithDrive
```

Confirmed failing shape:

```powershell
"A4V9052_NOT_OBJECT_ARRAY:$Case:$($Value.GetType().FullName)"
```

In Windows PowerShell 5.1, `$Case:` is not interpreted as ordinary `$Case` followed by literal `:`. It is parsed as a scope/drive style variable reference and may fail with `InvalidVariableReferenceWithDrive`.

## 3. Mandatory Patch Rule

When a normal variable is immediately followed by a literal colon in an expandable string, convert:

```text
$Name:
```

to:

```text
${Name}:
```

Known A4-derived mandatory examples:

```text
$Case:    -> ${Case}:
$path:    -> ${path}:
$lfRaw:   -> ${lfRaw}:
$crlfRaw: -> ${crlfRaw}:
$lfBlob:  -> ${lfBlob}:
```

## 4. Allowed Scope / Drive References

The following references are allowed and MUST NOT be counted as ordinary variable-colon risk patterns when they are intentionally used as PowerShell scopes or drives:

```text
$env:
$script:
$global:
$local:
$private:
$using:
$this:
```

The scanner MUST treat these exceptions case-insensitively.

## 5. Required Scanner Behavior

Before any Windows PowerShell 5.1 PASS claim, scan every effective PowerShell source and every materialized/generated fixture source for ordinary variable-colon risk patterns.

Minimum scanner requirement:

```text
Input: Effective Vx source set + generated fixture source + materialized Git blob source
Detect: unbraced ordinary variable immediately followed by ':' inside expandable PowerShell string contexts
Ignore: allowed scope/drive references listed above
Expected: VARIABLE_COLON_RISK_PATTERN_COUNT=0
```

A simple text scanner may start from this approximate risk pattern, then apply the allowed-scope exclusion:

```regex
(?<![`{])\$([A-Za-z_][A-Za-z0-9_]*)\:
```

The scanner result is advisory unless paired with actual Windows PowerShell 5.1 native parser execution. Native parser execution is authoritative.

## 6. Required Native Parser Gate

A Source Factory worker MUST NOT claim PowerShell 5.1 compatibility until the exact effective source is parsed by Windows PowerShell 5.1.

Required execution identity:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass
$PSVersionTable.PSVersion.Major -eq 5
$PSVersionTable.PSEdition -eq 'Desktop'
```

Required status before proceeding:

```text
EFFECTIVE_SOURCE_PS51_NATIVE_PARSE=PASS
VARIABLE_COLON_RISK_PATTERN_COUNT=0
```

If native parse fails before runtime logic begins, the worker MUST report parser failure separately from business-logic or Generic List failure.

## 7. Verdict Labels

Use these labels when reporting this class of issue:

```text
PS51_VARIABLE_COLON_GUARD=PASS
PS51_VARIABLE_COLON_GUARD=FAIL
EFFECTIVE_SOURCE_PS51_NATIVE_PARSE=PASS
EFFECTIVE_SOURCE_PS51_NATIVE_PARSE=FAIL
EMPTY_ONE_MANY_EXECUTION=NOT_STARTED_BY_PARSER_ERROR
```

For A4-type remediation:

```text
BROAD_REDEVELOPMENT=false
AS_IS_RERUN=false
MINIMAL_PS51_SYNTAX_PATCH=true
NEXT_FIXTURE_ONLY_VALIDATION=true
SERVICE_TRANSACTION=false
```

## 8. Forbidden Effects During Validation

This rule is a parser and syntax compatibility rule only. Validation must remain fixture-only/read-only unless separately authorized.

Required counters:

```text
WINDOWS_SERVICE_ACTION_COUNT=0
REGISTRY_WRITE_COUNT=0
CURRENT_PC_AGENT_ROOT_MUTATION_COUNT=0
INSTALLATION_COUNT=0
RESTART_COUNT=0
PRODUCTION_COUNT=0
```

## 9. Commander Enforcement

If a worker reports Generic List, materialization, .NET receipt serialization, LF/CRLF, or fixture-only smoke results without first proving `EFFECTIVE_SOURCE_PS51_NATIVE_PARSE=PASS`, the report is incomplete.

If a worker discovers this issue after a prior Vx terminal failure, it MUST preserve the failed Vx authority and publish the correction as append-only Vx+1 minimal syntax compatibility patch.

Do not overwrite prior failure events.
Do not reuse consumed authorization when parser failure invalidated the earlier execution path.
