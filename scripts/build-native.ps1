$ErrorActionPreference='Stop'
$nativeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nativeOutput=Join-Path $nativeRoot 'assets/native'
New-Item -ItemType Directory -Path $nativeOutput -Force | Out-Null
$nativeVswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$nativeStudio=& $nativeVswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(-not $nativeStudio){throw 'Visual Studio x64 C++ build tools are required to build CoSkin.Native.'}
$nativeBatch=Join-Path $nativeOutput 'build-native.cmd'
$nativeSource=Join-Path $nativeRoot 'src/CoSkin.Native/Bridge.cpp'
$nativePipeSource=[IO.File]::ReadAllText((Join-Path $nativeRoot 'src/CoSkin.Loader/native-pipe-session.js'))
$nativeRendererSource=[IO.File]::ReadAllText((Join-Path $nativeRoot 'src/CoSkin.Loader/native-renderer-bridge.js'))
if($nativePipeSource.Contains(')CoSkinJS"') -or $nativeRendererSource.Contains(')CoSkinJS"')){throw 'Native bridge raw string delimiter collision.'}
function ConvertTo-NativeSourceArray([string]$nativeName, [string]$nativeText) {
  $nativePieces=[Collections.Generic.List[string]]::new()
  for($nativeOffset=0;$nativeOffset -lt $nativeText.Length;){
    $nativeLength=[Math]::Min(7000,$nativeText.Length-$nativeOffset)
    if([char]::IsHighSurrogate($nativeText[$nativeOffset+$nativeLength-1])){$nativeLength--}
    $nativePiece=$nativeText.Substring($nativeOffset,$nativeLength)
    $nativePieces.Add("R`"CoSkinJS($nativePiece)CoSkinJS`"")
    $nativeOffset+=$nativeLength
  }
  return "static const char* const $nativeName`[]={`n"+($nativePieces -join ",`n")+"`n};`n"
}
$nativeHeader=(ConvertTo-NativeSourceArray 'CoSkinPipeSessionSource' $nativePipeSource)+(ConvertTo-NativeSourceArray 'CoSkinRendererBridgeSource' $nativeRendererSource)
[IO.File]::WriteAllText((Join-Path $nativeOutput 'SessionSource.h'),$nativeHeader,[Text.UTF8Encoding]::new($false))
$nativeEnvironment=Join-Path $nativeStudio 'VC/Auxiliary/Build/vcvars64.bat'
$nativeCommands=@"
@echo off
call "$nativeEnvironment"
if errorlevel 1 exit /b 1
cl /nologo /std:c++17 /LD /MT /EHsc /W4 /WX /O2 /guard:cf /I"$nativeOutput" "$nativeSource" /Fo:CoSkin.Native.obj /link /OUT:CoSkin.Native.dll /DYNAMICBASE /NXCOMPAT /guard:cf user32.lib
"@
[IO.File]::WriteAllText($nativeBatch,$nativeCommands,[Text.Encoding]::Default)
Push-Location $nativeOutput
try { & $env:ComSpec /c $nativeBatch; if($LASTEXITCODE -ne 0){throw 'CoSkin.Native build failed.'} }
finally { Pop-Location }
