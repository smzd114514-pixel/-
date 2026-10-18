param([switch]$NoBrowser, [ValidateRange(1024,65535)][int]$Port = 17865)
$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$appUrl = 'http://127.0.0.1:' + $Port
function Test-Wordbook {
    try {
        $reply = Invoke-RestMethod -Uri ($appUrl + '/api/health') -TimeoutSec 2
        return $reply.app -eq 'uibe-wordbook' -and $reply.version -eq 4
    } catch { return $false }
}
try {
    if (-not (Test-Wordbook)) {
        $nodePath = Join-Path $appRoot 'runtime\node.exe'
        $serverPath = Join-Path $appRoot 'server.mjs'
        $dataPath = Join-Path $appRoot 'data'
        New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
        $previousWordbookPort = $env:WORDBOOK_PORT
        $previousWordbookData = $env:WORDBOOK_DATA_DIR
        try {
            $env:WORDBOOK_PORT = [string]$Port
            $env:WORDBOOK_DATA_DIR = $dataPath
            $process = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $serverPath + '"')) -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataPath 'server.log') -RedirectStandardError (Join-Path $dataPath 'server-error.log') -PassThru
        } finally {
            $env:WORDBOOK_PORT = $previousWordbookPort
            $env:WORDBOOK_DATA_DIR = $previousWordbookData
        }
        Set-Content -LiteralPath (Join-Path $dataPath 'server.pid') -Value $process.Id
        $started = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 200
            if (Test-Wordbook) { $started = $true; break }
            if ($process.HasExited) { break }
        }
        if (-not $started) { throw 'The notebook could not start. Check data/server-error.log, or restart the computer and try again.' }
    }
    if (-not $NoBrowser) { Start-Process $appUrl }
    Write-Output $appUrl
} catch {
    if ($NoBrowser) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Wordbook') | Out-Null
}
