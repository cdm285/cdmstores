# typecheck-on-edit.ps1
# PostToolUse hook — runs `tsc --noEmit` after any edit to worker/src/**/*.ts
# Outputs blocking JSON on TypeScript errors.

$raw = [Console]::In.ReadToEnd()
try { $input = $raw | ConvertFrom-Json } catch { exit 0 }

# Extract file path from common tool shapes
$filePath = $input.tool_input.filePath ?? $input.tool_input.path ?? ""

# Only react to TypeScript files inside worker/src/
if ($filePath -notmatch 'worker[/\\]src[/\\].+\.ts$') { exit 0 }

Write-Host "[ typecheck ] $filePath changed — running tsc --noEmit ..." -ForegroundColor Cyan

$workerDir = Join-Path $PSScriptRoot "..\..\..\worker"
$result = & npx tsc --noEmit 2>&1
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    $errors = ($result | Out-String).Trim()
    $msg = "TypeScript errors detected — fix before continuing:`n`n$errors"
    $json = [ordered]@{
        continue   = $false
        stopReason = $msg
    } | ConvertTo-Json -Compress
    Write-Output $json
    exit 2
}

Write-Host "[ typecheck ] tsc OK" -ForegroundColor Green
exit 0
