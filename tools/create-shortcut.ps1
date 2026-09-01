# Cree le raccourci "AutoGarage Pro" (dossier de l'application + Bureau + menu Demarrer).
#
#   powershell -ExecutionPolicy Bypass -File tools\create-shortcut.ps1
#
# -NoStartMenu pour ne pas creer le raccourci du menu Demarrer.
# -NoDesktop   pour ne pas creer le raccourci du Bureau.

param(
    [switch]$NoStartMenu,
    [switch]$NoDesktop
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root 'AutoGarage.bat'
$icon = Join-Path $root 'assets\autogarage.ico'

if (-not (Test-Path $target)) { throw "Lanceur introuvable : $target" }

# L'icone est generee par le depot ; on la fabrique si elle manque.
if (-not (Test-Path $icon)) {
    Write-Host "Generation de l'icone..."
    & node (Join-Path $root 'tools\make-icon.mjs') | Out-Null
}

$shell = New-Object -ComObject WScript.Shell

function New-AppShortcut([string]$path) {
    $sc = $shell.CreateShortcut($path)
    $sc.TargetPath = $target
    $sc.WorkingDirectory = $root
    $sc.IconLocation = "$icon,0"
    $sc.Description = 'AutoGarage Pro - Gestion de garage automobile'
    $sc.WindowStyle = 7          # demarre reduit : la console ne gene pas
    $sc.Save()
    Write-Host "  Raccourci cree : $path"
}

# Raccourci dans le dossier de l'application lui-meme.
New-AppShortcut (Join-Path $root 'AutoGarage Pro.lnk')

if (-not $NoDesktop) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    New-AppShortcut (Join-Path $desktop 'AutoGarage Pro.lnk')
}

if (-not $NoStartMenu) {
    $startMenu = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'
    if (Test-Path $startMenu) {
        New-AppShortcut (Join-Path $startMenu 'AutoGarage Pro.lnk')
    }
}

Write-Host ''
Write-Host 'Termine. Double-cliquez sur "AutoGarage Pro" pour lancer l''application.'
