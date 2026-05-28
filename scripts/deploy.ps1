#Requires -Version 5.1
<#
.SYNOPSIS
    将 AIGameCompetition 部署到 F:/GameServer/AIGameCompetition 并启动生产服务。

.DESCRIPTION
    1. 停止目标目录上正在运行的旧服务（按 PID 文件或端口）
    2. 从当前仓库拷贝代码到目标目录（保留 .env 与 server/data）
    3. npm install --omit=dev
    4. 启动 Server（默认端口 8080，与开发 3000 区分）

.USAGE
    .\server.ps1 deploy
    powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
#>

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'server-lib.ps1')

$TargetRoot = $Script:DeployedRoot
$DeployPort = $Script:DefaultDeployedPort
$SourceRoot = $Script:SourceRoot

$ExcludeDirs = @(
    'node_modules',
    '.git',
    '.cursor',
    '.claude'
)
$ExcludeDirPaths = @(
    (Join-Path $SourceRoot 'server\data')
)
$ExcludeFiles = @(
    '.env'
)

function Get-TargetEnvPath {
    Join-Path $TargetRoot 'server\.env'
}

function Ensure-TargetEnv {
    $envPath = Get-TargetEnvPath
    $deployExample = Join-Path $SourceRoot 'server\.env.deploy.example'
    $devExample = Join-Path $SourceRoot 'server\.env.example'

    if (Test-Path $envPath) {
        Write-ServerStep '保留已有 server/.env'
        $portLine = Get-Content $envPath | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1
        if ($portLine -match 'PORT\s*=\s*3000') {
            Write-Host "警告: 生产目录 .env 仍为 PORT=3000，与开发环境冲突。请改为 $DeployPort 。" -ForegroundColor Yellow
        }
        return
    }

    Write-ServerStep '首次部署：创建 server/.env'
    New-Item -ItemType Directory -Force -Path (Split-Path $envPath) | Out-Null

    if (Test-Path $deployExample) {
        Copy-Item $deployExample $envPath
    } elseif (Test-Path $devExample) {
        Copy-Item $devExample $envPath
    } else {
        throw '找不到 server/.env.deploy.example 或 server/.env.example'
    }

    Write-Host "请编辑 $envPath ，填入飞书凭证与正确的 PUBLIC_BASE_URL" -ForegroundColor Yellow
}

function Ensure-TargetDataDir {
    $ugcDir = Join-Path $TargetRoot 'server\data\ugc'
    if (-not (Test-Path $ugcDir)) {
        Write-ServerStep '初始化生产 server/data/ugc（不复制开发数据）'
        New-Item -ItemType Directory -Force -Path $ugcDir | Out-Null
        $gitkeep = Join-Path $ugcDir '.gitkeep'
        if (-not (Test-Path $gitkeep)) {
            New-Item -ItemType File -Force -Path $gitkeep | Out-Null
        }
    }
}

function Copy-Project {
    Write-ServerStep "拷贝项目：$SourceRoot -> $TargetRoot"

    New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null

    $robocopyArgs = @(
        $SourceRoot,
        $TargetRoot,
        '/E',
        '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS'
    )
    foreach ($dir in $ExcludeDirs) {
        $robocopyArgs += '/XD'
        $robocopyArgs += $dir
    }
    foreach ($dirPath in $ExcludeDirPaths) {
        $robocopyArgs += '/XD'
        $robocopyArgs += $dirPath
    }
    foreach ($file in $ExcludeFiles) {
        $robocopyArgs += '/XF'
        $robocopyArgs += $file
    }

    & robocopy @robocopyArgs | Out-Null
    $code = $LASTEXITCODE
    if ($code -ge 8) {
        throw "robocopy 失败，退出码 $code"
    }
}

function Install-Dependencies {
    Write-ServerStep '安装 server 依赖'
    Push-Location (Join-Path $TargetRoot 'server')
    try {
        if (Get-Command npm -ErrorAction SilentlyContinue) {
            npm install --omit=dev
        } else {
            throw '未找到 npm，请先安装 Node.js'
        }
    } finally {
        Pop-Location
    }
}

# ========== 主流程 ==========
Write-Host ''
Write-Host 'AIGameCompetition 生产部署' -ForegroundColor Yellow
Write-Host "源目录:   $SourceRoot"
Write-Host "目标目录: $TargetRoot"
Write-Host "生产端口: $DeployPort (开发默认 3000)"
Write-Host ''

Stop-GameServer -Target 'deployed'
Copy-Project
Ensure-TargetDataDir
Ensure-TargetEnv
Install-Dependencies
Start-GameServer -Target 'deployed'

Write-Host ''
Write-Host "开发工程: $SourceRoot" -ForegroundColor DarkGray
Write-Host "生产目录: $TargetRoot" -ForegroundColor DarkGray
Write-Host "单独启停: .\server.ps1 start|stop dev|deployed" -ForegroundColor DarkGray
Write-Host "一键部署: .\server.ps1 deploy" -ForegroundColor DarkGray
