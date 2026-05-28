#Requires -Version 5.1

$Script:SourceRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$Script:DevRoot = $Script:SourceRoot
$Script:DeployedRoot = 'F:\GameServer\AIGameCompetition'
$Script:DefaultDeployedPort = 8081
$Script:DefaultDevPort = 3000

function Write-ServerStep([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-ServerRoot([string]$Target) {
    switch ($Target) {
        'dev' { return Join-Path $Script:DevRoot 'server' }
        'deployed' { return Join-Path $Script:DeployedRoot 'server' }
        default { throw "未知目标: $Target（可用 dev / deployed）" }
    }
}

function Get-ServerEnvPath([string]$ServerRoot) {
    Join-Path $ServerRoot '.env'
}

function Get-ServerPidFile([string]$ServerRoot) {
    Join-Path $ServerRoot 'run.pid'
}

function Get-ServerLogDir([string]$ServerRoot) {
    Join-Path $ServerRoot 'logs'
}

function Get-ServerPort([string]$ServerRoot, [int]$DefaultPort) {
    $envPath = Get-ServerEnvPath $ServerRoot
    if (Test-Path $envPath) {
        $line = Get-Content $envPath | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1
        if ($line -match 'PORT\s*=\s*(\d+)') {
            return [int]$Matches[1]
        }
    }
    return $DefaultPort
}

function Get-ServerBaseUrl([string]$ServerRoot, [int]$Port) {
    $envPath = Get-ServerEnvPath $ServerRoot
    if (Test-Path $envPath) {
        $line = Get-Content $envPath | Where-Object { $_ -match '^\s*PUBLIC_BASE_URL\s*=' } | Select-Object -First 1
        if ($line -match '=\s*(.+)') {
            return $Matches[1].Trim()
        }
    }
    return "http://localhost:$Port"
}

function Test-ServerListening([int]$Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Stop-GameServer {
    param(
        [Parameter(Mandatory)][string]$Target
    )

    $serverRoot = Get-ServerRoot $Target
    $defaultPort = if ($Target -eq 'dev') { $Script:DefaultDevPort } else { $Script:DefaultDeployedPort }
    $port = Get-ServerPort $serverRoot $defaultPort
    $pidFile = Get-ServerPidFile $serverRoot
    $label = if ($Target -eq 'dev') { '开发' } else { '生产' }

    if (-not (Test-Path $serverRoot)) {
        Write-Host "$label 服务目录不存在: $serverRoot" -ForegroundColor Yellow
        return
    }

    $stopped = $false

    if (Test-Path $pidFile) {
        $oldPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
        if ($oldPid -match '^\d+$' -and (Get-Process -Id ([int]$oldPid) -ErrorAction SilentlyContinue)) {
            Write-ServerStep "停止${label}服务 PID=$oldPid"
            Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
            $stopped = $true
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }

    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        Write-ServerStep "停止占用端口 $port 的进程 PID=$($conn.OwningProcess)"
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        $stopped = $true
    }

    if ($stopped -or -not (Test-ServerListening $port)) {
        Write-Host "${label}服务已停止 (端口 $port)" -ForegroundColor Green
    } else {
        Write-Host "${label}服务未在运行 (端口 $port)" -ForegroundColor Yellow
    }
}

function Start-GameServer {
    param(
        [Parameter(Mandatory)][string]$Target
    )

    $serverRoot = Get-ServerRoot $Target
    $defaultPort = if ($Target -eq 'dev') { $Script:DefaultDevPort } else { $Script:DefaultDeployedPort }
    $port = Get-ServerPort $serverRoot $defaultPort
    $pidFile = Get-ServerPidFile $serverRoot
    $logDir = Get-ServerLogDir $serverRoot
    $label = if ($Target -eq 'dev') { '开发' } else { '生产' }

    if (-not (Test-Path (Join-Path $serverRoot 'src\index.js'))) {
        throw "$label 服务目录无效，找不到 src/index.js: $serverRoot"
    }

    if (Test-ServerListening $port) {
        throw "端口 $port 已被占用，请先执行: .\server.ps1 stop $Target"
    }

    New-Item -ItemType Directory -Force -Path $logDir | Out-Null

    Write-ServerStep "启动${label}服务，端口 $port"
    $proc = Start-Process `
        -FilePath 'node' `
        -ArgumentList 'src/index.js' `
        -WorkingDirectory $serverRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir 'stdout.log') `
        -RedirectStandardError (Join-Path $logDir 'stderr.log') `
        -PassThru

    $proc.Id | Out-File -FilePath $pidFile -Encoding ascii
    Start-Sleep -Seconds 2

    if (-not (Test-ServerListening $port)) {
        $errLog = Join-Path $logDir 'stderr.log'
        $hint = if (Test-Path $errLog) { Get-Content $errLog -Tail 20 -ErrorAction SilentlyContinue } else { @() }
        throw "${label}服务未能监听端口 $port。请查看 $errLog`n$($hint -join "`n")"
    }

    $baseUrl = Get-ServerBaseUrl $serverRoot $port
    Write-Host ''
    Write-Host "${label}服务已启动" -ForegroundColor Green
    Write-Host "  目录: $serverRoot"
    Write-Host "  端口: $port"
    Write-Host "  访问: $baseUrl"
    Write-Host "  日志: $logDir"
    Write-Host "  PID : $($proc.Id)"
}
