#Requires -Version 5.1
<#
.SYNOPSIS
    管理开发 / 生产游戏服务：启动、停止、部署。

.USAGE
    .\server.ps1 start dev
    .\server.ps1 stop dev
    .\server.ps1 start deployed
    .\server.ps1 stop deployed
    .\server.ps1 deploy
#>

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('start', 'stop', 'deploy')]
    [string]$Action,

    [Parameter(Mandatory = $false, Position = 1)]
    [ValidateSet('dev', 'deployed')]
    [string]$Target
)

$ErrorActionPreference = 'Stop'
$ScriptsDir = Join-Path $PSScriptRoot 'scripts'
. (Join-Path $ScriptsDir 'server-lib.ps1')

if ($Action -ne 'deploy' -and -not $Target) {
    throw "请指定目标 dev 或 deployed。用法: .\server.ps1 $Action dev|deployed"
}

switch ($Action) {
    'start' { Start-GameServer -Target $Target }
    'stop' { Stop-GameServer -Target $Target }
    'deploy' {
        & (Join-Path $ScriptsDir 'deploy.ps1')
    }
}
