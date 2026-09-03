$ErrorActionPreference = 'Stop'

$entry = Join-Path $PSScriptRoot 'site-entry.mjs'
$runtimeCandidates = @()
if ($env:THREEBROWSER_RUNTIME_ROOT) {
    $runtimeCandidates += Join-Path $env:THREEBROWSER_RUNTIME_ROOT 'run.ps1'
}
$runtimeCandidates += 'C:\ThreeBrowser\ThreeBrowserRuntime\run.ps1'
$runtimeCandidates += Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'run.ps1'
$runtime = $runtimeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1

if (-not $runtime) {
    throw 'ThreeBrowserRuntime launcher not found. Set THREEBROWSER_RUNTIME_ROOT or install it at C:\ThreeBrowser\ThreeBrowserRuntime.'
}
if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) {
    throw "Demo entry not found at $entry"
}

& $runtime $entry
exit $LASTEXITCODE
