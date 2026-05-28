#Requires -Version 5.1
<#
.SYNOPSIS
    管理开发 / 生产游戏服务：启动、停止、部署。

.USAGE
    .\scripts\server.ps1 start dev
    .\scripts\server.ps1 stop dev
    .\scripts\server.ps1 start deployed
    .\scripts\server.ps1 stop deployed
    .\scripts\server.ps1 deploy
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
. (Join-Path $PSScriptRoot 'server-lib.ps1')

if ($Action -ne 'deploy' -and -not $Target) {
    throw "请指定目标 dev 或 deployed。用法: .\scripts\server.ps1 $Action dev|deployed"
}

switch ($Action) {
    'start' { Start-GameServer -Target $Target }
    'stop' { Stop-GameServer -Target $Target }
    'deploy' {
        & (Join-Path $PSScriptRoot 'deploy.ps1')
    }
}
