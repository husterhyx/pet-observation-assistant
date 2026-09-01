[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("doctor", "init", "build-debug", "build-emulator", "build-release")]
    [string]$Action
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security

$repoRoot = Split-Path -Parent $PSScriptRoot
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$ndkVersion = if ($env:PET_ANDROID_NDK_VERSION) { $env:PET_ANDROID_NDK_VERSION } else { "29.0.13846066" }
$ndkRoot = Join-Path $sdkRoot "ndk\$ndkVersion"
$javaRoot = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { throw "Set JAVA_HOME to a JDK 17 installation before building." }
$gradleRoot = if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { Join-Path $env:USERPROFILE ".gradle" }
$avdRoot = if ($env:ANDROID_AVD_HOME) { $env:ANDROID_AVD_HOME } else { Join-Path $env:USERPROFILE ".android\avd" }
$buildRoot = if ($env:PET_ANDROID_BUILD_ROOT) { $env:PET_ANDROID_BUILD_ROOT } else { Join-Path $env:TEMP "pet-observation-server-build" }
$rustTargetRoot = Join-Path $buildRoot "rust-target"
$androidBuildProject = Join-Path $buildRoot "android"
$tauri = Join-Path $repoRoot "node_modules\.bin\tauri.cmd"
$proxyUrl = $env:PET_BUILD_PROXY
$androidProject = Join-Path $repoRoot "src-tauri\gen\android"
$buildToolsVersion = if ($env:PET_ANDROID_BUILD_TOOLS_VERSION) { $env:PET_ANDROID_BUILD_TOOLS_VERSION } else { "36.0.0" }
$buildToolsRoot = Join-Path $sdkRoot "build-tools\$buildToolsVersion"
$releaseKeystore = Join-Path $env:USERPROFILE ".android\pet-observation-server-release.jks"
$releasePasswordFile = Join-Path $env:USERPROFILE ".android\pet-observation-server-release.password.dpapi"
$releaseKeyAlias = "pet-observation-server"

$requiredPaths = @(
    $tauri,
    (Join-Path $javaRoot "bin\java.exe"),
    (Join-Path $sdkRoot "platform-tools\adb.exe"),
    (Join-Path $sdkRoot "emulator\emulator.exe"),
    (Join-Path $sdkRoot "cmdline-tools\bin\sdkmanager.bat"),
    (Join-Path $ndkRoot "toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-ar.exe"),
    (Join-Path $buildToolsRoot "zipalign.exe"),
    (Join-Path $buildToolsRoot "apksigner.bat")
)

foreach ($requiredPath in $requiredPaths) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Android build dependency not found: $requiredPath"
    }
}

$env:JAVA_HOME = $javaRoot
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:NDK_HOME = $ndkRoot
$env:GRADLE_USER_HOME = $gradleRoot
$env:ANDROID_AVD_HOME = $avdRoot
$env:CARGO_TARGET_DIR = $rustTargetRoot
$env:Path = "$(Join-Path $javaRoot 'bin');$(Join-Path $sdkRoot 'platform-tools');$(Join-Path $sdkRoot 'emulator');$env:Path"
New-Item -ItemType Directory -Path $buildRoot, $rustTargetRoot, $gradleRoot -Force | Out-Null

function Test-LocalProxy {
    if (-not $proxyUrl) { return $false }
    $proxyUri = [Uri]$proxyUrl
    $client = [Net.Sockets.TcpClient]::new()
    try {
        $pending = $client.ConnectAsync($proxyUri.Host, $proxyUri.Port)
        return $pending.Wait(300) -and $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Get-ReleaseSigningPassword {
    $keystoreExists = Test-Path -LiteralPath $releaseKeystore
    $passwordExists = Test-Path -LiteralPath $releasePasswordFile
    if ($keystoreExists -xor $passwordExists) {
        throw "Release signing material is incomplete. Expected both $releaseKeystore and $releasePasswordFile"
    }

    if (-not $keystoreExists) {
        $androidUserDir = Split-Path -Parent $releaseKeystore
        New-Item -ItemType Directory -Path $androidUserDir -Force | Out-Null
        $randomBytes = New-Object byte[] 32
        $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $randomGenerator.GetBytes($randomBytes)
        }
        finally {
            $randomGenerator.Dispose()
        }
        $password = ([BitConverter]::ToString($randomBytes)).Replace("-", "").ToLowerInvariant()
        $protectedBytes = [Security.Cryptography.ProtectedData]::Protect(
            [Text.Encoding]::UTF8.GetBytes($password),
            $null,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        [IO.File]::WriteAllBytes($releasePasswordFile, $protectedBytes)
        $env:PET_ANDROID_SIGNING_PASSWORD = $password
        try {
            & (Join-Path $javaRoot "bin\keytool.exe") -genkeypair `
                -keystore $releaseKeystore `
                -storetype PKCS12 `
                -storepass:env PET_ANDROID_SIGNING_PASSWORD `
                -keypass:env PET_ANDROID_SIGNING_PASSWORD `
                -alias $releaseKeyAlias `
                -keyalg RSA `
                -keysize 4096 `
                -validity 10000 `
                -dname "CN=Pet Observation Assistant, OU=Personal, O=Pet Observation, C=CN"
            if ($LASTEXITCODE -ne 0) { throw "Release keystore generation failed with exit code $LASTEXITCODE" }
        }
        finally {
            Remove-Item Env:PET_ANDROID_SIGNING_PASSWORD -ErrorAction SilentlyContinue
        }
        Write-Host "Created release signing key: $releaseKeystore"
    }

    $protectedBytes = [IO.File]::ReadAllBytes($releasePasswordFile)
    $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect(
        $protectedBytes,
        $null,
        [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    return [Text.Encoding]::UTF8.GetString($plainBytes)
}

if (Test-LocalProxy) {
    $proxyUri = [Uri]$proxyUrl
    $env:HTTP_PROXY = $proxyUrl
    $env:HTTPS_PROXY = $proxyUrl
    $env:ALL_PROXY = $proxyUrl
    $env:NO_PROXY = "localhost,127.0.0.1,::1"
    $env:GRADLE_OPTS = "-Dhttp.proxyHost=$($proxyUri.Host) -Dhttp.proxyPort=$($proxyUri.Port) -Dhttps.proxyHost=$($proxyUri.Host) -Dhttps.proxyPort=$($proxyUri.Port)"
}

Push-Location $repoRoot
try {
    if ($Action -eq "doctor") {
        Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
        Write-Host "NDK_HOME=$env:NDK_HOME"
        Write-Host "JAVA_HOME=$env:JAVA_HOME"
        Write-Host "GRADLE_USER_HOME=$env:GRADLE_USER_HOME"
        Write-Host "CARGO_TARGET_DIR=$env:CARGO_TARGET_DIR"
        & (Join-Path $javaRoot "bin\java.exe") -version
        & (Join-Path $sdkRoot "platform-tools\adb.exe") version
        & rustc -V
        & cargo -V
        & rustup target list --installed
        & $tauri -V
        exit 0
    }

    if ($Action -eq "init") {
        & $tauri android init --ci --skip-targets-install
    }
    elseif ($Action -in @("build-debug", "build-emulator", "build-release")) {
        & npm.cmd run build:web
        if ($LASTEXITCODE -ne 0) { throw "Frontend build failed with exit code $LASTEXITCODE" }

        # Tauri's Android bridge is generated and intentionally ignored by Git.
        # Recreate it automatically so a fresh clone can build with one command.
        $tauriConfigPath = Join-Path $repoRoot "src-tauri\tauri.conf.json"
        $applicationId = ([IO.File]::ReadAllText($tauriConfigPath, [Text.Encoding]::UTF8) | ConvertFrom-Json).identifier
        $generatedActivity = Join-Path $androidProject ("app\src\main\java\" + $applicationId.Replace(".", "\") + "\generated\TauriActivity.kt")
        if (-not (Test-Path -LiteralPath $generatedActivity)) {
            & $tauri android init --ci --skip-targets-install
            if ($LASTEXITCODE -ne 0) { throw "Tauri Android bridge generation failed with exit code $LASTEXITCODE" }
        }

        if ($Action -eq "build-emulator") {
            $rustTarget = "x86_64-linux-android"
            $clangPrefix = "x86_64-linux-android24"
            $cargoLinkerName = "CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER"
            $ccName = "CC_x86_64_linux_android"
            $cxxName = "CXX_x86_64_linux_android"
            $arName = "AR_x86_64_linux_android"
            $abi = "x86_64"
            $gradleFlavor = "X86_64"
            $outputFlavor = "x86_64"
        }
        else {
            $rustTarget = "aarch64-linux-android"
            $clangPrefix = "aarch64-linux-android24"
            $cargoLinkerName = "CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER"
            $ccName = "CC_aarch64_linux_android"
            $cxxName = "CXX_aarch64_linux_android"
            $arName = "AR_aarch64_linux_android"
            $abi = "arm64-v8a"
            $gradleFlavor = "Arm64"
            $outputFlavor = "arm64"
        }

        $isRelease = $Action -eq "build-release"
        $rustProfile = if ($isRelease) { "release" } else { "debug" }
        $gradleBuildType = if ($isRelease) { "Release" } else { "Debug" }
        $gradleBuildTypePath = $gradleBuildType.ToLowerInvariant()

        $ndkBin = Join-Path $ndkRoot "toolchains\llvm\prebuilt\windows-x86_64\bin"
        $clang = Join-Path $ndkBin "${clangPrefix}-clang.cmd"
        $clangxx = Join-Path $ndkBin "${clangPrefix}-clang++.cmd"
        Set-Item -Path "Env:$cargoLinkerName" -Value $clang
        Set-Item -Path "Env:$ccName" -Value $clang
        Set-Item -Path "Env:$cxxName" -Value $clangxx
        Set-Item -Path "Env:$arName" -Value (Join-Path $ndkBin "llvm-ar.exe")

        $cargoArguments = @(
            "build",
            "--package", "pet-observation-mobile",
            "--manifest-path", (Join-Path $repoRoot "src-tauri\Cargo.toml"),
            "--target", $rustTarget,
            "--features", "tauri/custom-protocol",
            "--lib"
        )
        if ($isRelease) { $cargoArguments += "--release" }
        & cargo @cargoArguments
        if ($LASTEXITCODE -ne 0) { throw "Rust Android build failed with exit code $LASTEXITCODE" }

        $appVersion = (Get-Content -Raw -LiteralPath (Join-Path $repoRoot "package.json") | ConvertFrom-Json).version
        if ($appVersion -notmatch '^(\d+)\.(\d+)\.(\d+)$') { throw "Android version must use major.minor.patch: $appVersion" }
        $versionCode = ([int]$Matches[1] * 1000000) + ([int]$Matches[2] * 1000) + [int]$Matches[3]
        $tauriProperties = "// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.`n" +
            "tauri.android.versionName=$appVersion`n" +
            "tauri.android.versionCode=$versionCode`n"
        [IO.File]::WriteAllText((Join-Path $androidProject "app\tauri.properties"), $tauriProperties, [Text.UTF8Encoding]::new($false))

        $androidBuildProjectFull = [IO.Path]::GetFullPath($androidBuildProject)
        $expectedBuildPrefix = [IO.Path]::GetFullPath($buildRoot) + [IO.Path]::DirectorySeparatorChar
        if (-not $androidBuildProjectFull.StartsWith($expectedBuildPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Unexpected Android build path: $androidBuildProjectFull"
        }
        New-Item -ItemType Directory -Path $androidBuildProjectFull -Force | Out-Null
        # The build directory is validated above; mirror removes stale generated package paths after an ID change.
        & robocopy.exe $androidProject $androidBuildProjectFull /MIR /XD .gradle build "app\build" "buildSrc\build" /NFL /NDL /NJH /NJS /NP
        if ($LASTEXITCODE -gt 7) { throw "Android project copy failed with exit code $LASTEXITCODE" }

        $sourceLib = Join-Path $rustTargetRoot "$rustTarget\$rustProfile\libpet_observation_mobile_lib.so"
        $jniDir = Join-Path $androidBuildProjectFull "app\src\main\jniLibs\$abi"
        New-Item -ItemType Directory -Path $jniDir -Force | Out-Null
        $packagedLib = Join-Path $jniDir "libpet_observation_mobile_lib.so"
        Copy-Item -LiteralPath $sourceLib -Destination $packagedLib -Force
        & (Join-Path $ndkBin "llvm-strip.exe") $packagedLib
        if ($LASTEXITCODE -ne 0) { throw "Rust Android symbol stripping failed with exit code $LASTEXITCODE" }

        Push-Location $androidBuildProjectFull
        try {
            & ".\gradlew.bat" clean "assemble${gradleFlavor}${gradleBuildType}" -x "rustBuild${gradleFlavor}${gradleBuildType}" --no-daemon "-Pkotlin.incremental=false" "-Pkotlin.compiler.execution.strategy=in-process"
            if ($LASTEXITCODE -ne 0) { throw "Gradle Android build failed with exit code $LASTEXITCODE" }
        }
        finally {
            Pop-Location
        }

        $sourceApkName = if ($isRelease) { "app-$outputFlavor-release-unsigned.apk" } else { "app-$outputFlavor-debug.apk" }
        $sourceApk = Join-Path $androidBuildProjectFull "app\build\outputs\apk\$outputFlavor\$gradleBuildTypePath\$sourceApkName"
        if (-not (Test-Path -LiteralPath $sourceApk)) { throw "Expected APK was not generated: $sourceApk" }
        $deliveryDir = Join-Path $repoRoot "dist\android"
        $deliverySuffix = if ($isRelease) { "release" } else { "debug" }
        $deliveryApk = Join-Path $deliveryDir "pet-observation-server-$appVersion-$outputFlavor-$deliverySuffix.apk"
        New-Item -ItemType Directory -Path $deliveryDir -Force | Out-Null

        if ($isRelease) {
            $alignedApk = Join-Path $buildRoot "pet-observation-server-$appVersion-$outputFlavor-aligned.apk"
            & (Join-Path $buildToolsRoot "zipalign.exe") -f -p 4 $sourceApk $alignedApk
            if ($LASTEXITCODE -ne 0) { throw "APK alignment failed with exit code $LASTEXITCODE" }
            $signingPassword = Get-ReleaseSigningPassword
            $env:PET_ANDROID_SIGNING_PASSWORD = $signingPassword
            try {
                & (Join-Path $buildToolsRoot "apksigner.bat") sign `
                    --ks $releaseKeystore `
                    --ks-key-alias $releaseKeyAlias `
                    --ks-pass env:PET_ANDROID_SIGNING_PASSWORD `
                    --key-pass env:PET_ANDROID_SIGNING_PASSWORD `
                    --out $deliveryApk `
                    $alignedApk
                if ($LASTEXITCODE -ne 0) { throw "APK signing failed with exit code $LASTEXITCODE" }
            }
            finally {
                Remove-Item Env:PET_ANDROID_SIGNING_PASSWORD -ErrorAction SilentlyContinue
                $signingPassword = $null
            }
        }
        else {
            Copy-Item -LiteralPath $sourceApk -Destination $deliveryApk -Force
        }

        & (Join-Path $buildToolsRoot "apksigner.bat") verify --verbose --print-certs $deliveryApk
        if ($LASTEXITCODE -ne 0) { throw "APK signature verification failed with exit code $LASTEXITCODE" }
        $sha256 = [Security.Cryptography.SHA256]::Create()
        $stream = [IO.File]::OpenRead($deliveryApk)
        try {
            $hash = ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
        }
        finally {
            $stream.Dispose()
            $sha256.Dispose()
        }
        Write-Host "$deliverySuffix APK: $deliveryApk"
        Write-Host "SHA256: $hash"
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Tauri Android command failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
