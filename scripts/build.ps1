param([string]$Dotnet='dotnet',[switch]$Portable)
$ErrorActionPreference='Stop'
$projectRoot=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $projectRoot
try {
 & (Join-Path $PSScriptRoot 'build-native.ps1')
 node scripts/bundle.mjs
 if ($LASTEXITCODE -ne 0) { throw '렌더러 빌드 실패' }
 if ($Portable) { & $Dotnet publish src/CoSkin.Loader/CoSkin.Loader.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o dist/windows }
 else { & $Dotnet build src/CoSkin.Loader/CoSkin.Loader.csproj -c Release }
 if ($LASTEXITCODE -ne 0) { throw 'Windows 로더 빌드 실패' }
} finally { Pop-Location }
