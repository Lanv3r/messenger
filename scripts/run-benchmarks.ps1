[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$BenchmarkArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Stop-WithError {
    param([string]$Message)

    [Console]::Error.WriteLine($Message)
    exit 1
}

$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pythonBin = if ($env:PYTHON_BIN) {
    $env:PYTHON_BIN
} else {
    Join-Path $rootDir "backend\.venv\Scripts\python.exe"
}
$testDatabaseUrl = if ($env:TEST_DATABASE_URL) {
    $env:TEST_DATABASE_URL
} else {
    "postgresql+psycopg://messenger_test:messenger_test@127.0.0.1:54329/messenger_test"
}
$testRedisUrl = if ($env:TEST_REDIS_URL) {
    $env:TEST_REDIS_URL
} else {
    "redis://127.0.0.1:56379/0"
}

$dockerCommand = Get-Command docker -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($null -eq $dockerCommand) {
    Stop-WithError "Docker Compose is required to run benchmarks."
}

& $dockerCommand.Source compose version *> $null
if ($LASTEXITCODE -ne 0) {
    Stop-WithError "Docker Compose is required to run benchmarks."
}

& $dockerCommand.Source info *> $null
if ($LASTEXITCODE -ne 0) {
    Stop-WithError "Docker is installed, but its daemon is not running. Start Docker Desktop and retry."
}

$pythonCommand = Get-Command $pythonBin -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($null -eq $pythonCommand) {
    Stop-WithError "Python executable not found: $pythonBin"
}
$pythonBin = $pythonCommand.Source

& $dockerCommand.Source compose -f (Join-Path $rootDir "compose.test.yaml") up -d --wait postgres-test redis-test
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Push-Location (Join-Path $rootDir "backend")
try {
    $env:DATABASE_URL = $testDatabaseUrl
    $env:SECRET_KEY = "benchmark-secret-key-with-at-least-32-bytes"
    $env:S3_BUCKET = "messenger-benchmark-uploads"
    $env:S3_REGION = "us-east-1"
    $env:REDIS_URL = $testRedisUrl
    $env:TEST_DATABASE_URL = $testDatabaseUrl
    $env:MESSAGE_RATE_LIMIT_PER_MINUTE = "0"
    $env:UPLOAD_RATE_LIMIT_PER_MINUTE = "0"

    & $pythonBin -m benchmarks.suite @BenchmarkArgs
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
