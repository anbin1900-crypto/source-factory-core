$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'RUN_YOLLA_V6_EXECUTOR.ps1')
& (Join-Path $PSScriptRoot 'RUN_YOLLA_V6_CONTROL.ps1')
& (Join-Path $PSScriptRoot 'RUN_AI_YOLLA_V6.ps1')
