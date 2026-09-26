$ErrorActionPreference='Stop'
$nativeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nativeOutput=Join-Path $nativeRoot 'assets/native'
New-Item -ItemType Directory -Path $nativeOutput -Force | Out-Null
$nativeVswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$nativeStudio=& $nativeVswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(-not $nativeStudio){throw 'Visual Studio x64 C++ build tools are required to build CoSkin.Native.'}
$nativeBatch=Join-Path $nativeOutput 'build-native.cmd'
$nativeSource=Join-Path $nativeRoot 'src/CoSkin.Native/Bridge.cpp'
$nativeEnvironment=Join-Path $nativeStudio 'VC/Auxiliary/Build/vcvars64.bat'
$nativeCommands=@"
@echo off
call "$nativeEnvironment"
if errorlevel 1 exit /b 1
cl /nologo /std:c++17 /LD /MT /EHsc /W4 /WX /O2 /guard:cf "$nativeSource" /Fo:CoSkin.Native.obj /link /OUT:CoSkin.Native.dll /DYNAMICBASE /NXCOMPAT /guard:cf user32.lib
"@
[IO.File]::WriteAllText($nativeBatch,$nativeCommands,[Text.Encoding]::Default)
Push-Location $nativeOutput
try { & $env:ComSpec /c $nativeBatch; if($LASTEXITCODE -ne 0){throw 'CoSkin.Native build failed.'} }
finally { Pop-Location }
