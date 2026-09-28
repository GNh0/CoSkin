using CoSkin;
using System.Text.Json.Nodes;
using System.IO.Compression;
using System.Text;

var scratch = Path.Combine(Path.GetTempPath(), "CoSkin-host-tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(scratch);
var passed = 0;
void Check(bool value, string name) { if (!value) throw new Exception(name); passed++; Console.WriteLine("PASS " + name); }
void Reject(Action operation, string name) { try { operation(); throw new Exception("거부하지 않음: " + name); } catch (InvalidDataException) { passed++; Console.WriteLine("PASS " + name); } }
Task Validate(JsonObject _) => Task.CompletedTask; // Contract/decoder behavior is tested by the renderer suite; these tests isolate storage.
Task Decode(byte[] _, string __) => Task.CompletedTask;
try
{
    var discovered = new JsonObject
    {
        ["family"] = "OpenAI.Codex_2p2nqsd0c76g0",
        ["version"] = "26.924.2738.0",
        ["location"] = Path.Combine(scratch, "original-package"),
        ["status"] = "Valid",
        ["publisher"] = "OpenAI OpCo, LLC",
        ["packageMs"] = 15,
        ["signatureMs"] = 20
    };
    var verifiedDiscovery = WindowsLauncher.ValidateDiscovery(discovered);
    Check(verifiedDiscovery.Build.PackageVersion == "26.924.2738.0" && verifiedDiscovery.App.EndsWith("app", StringComparison.Ordinal), "통합 패키지·서명 응답은 동일 지원 빌드 계약으로 검증");
    var badSignature = (JsonObject)discovered.DeepClone(); badSignature["status"] = "UnknownError";
    Reject(() => WindowsLauncher.ValidateDiscovery(badSignature), "통합 조회도 무효 서명을 거절");
    var wrongPublisher = (JsonObject)discovered.DeepClone(); wrongPublisher["publisher"] = "Another Publisher";
    Reject(() => WindowsLauncher.ValidateDiscovery(wrongPublisher), "통합 조회도 게시자 변경을 거절");
    var wrongBuild = (JsonObject)discovered.DeepClone(); wrongBuild["version"] = "26.924.9999.0";
    try { WindowsLauncher.ValidateDiscovery(wrongBuild); throw new Exception("지원되지 않는 빌드 허용"); }
    catch (TrayActionException error) { Check(error.Code == "unsupported-codex", "통합 조회도 지원되지 않는 Codex 빌드를 거절"); }
    var codexLaunches = 0;
    var probeStore = Path.Combine(scratch, "update-readiness-probe");
    await using (var probeClient = new InstanceChannel(probeStore, claimOwnership: false))
    await using (var candidateOwner = new InstanceChannel(probeStore))
    {
        Check(!probeClient.IsOwner && candidateOwner.IsOwner, "업데이트 준비 검사 클라이언트는 새 호스트의 실행 소유권을 선점하지 않음");
        candidateOwner.Start((_, _) => Task.FromResult(new JsonObject { ["ok"] = true, ["pid"] = 123 }));
        using var probeDeadline = new CancellationTokenSource(2000);
        Check((await probeClient.Send(new JsonObject { ["op"] = "health" }, probeDeadline.Token))["pid"]?.GetValue<int>() == 123, "소유권 없는 업데이트 클라이언트가 실제 명명된 파이프 준비 응답 수신");
    }
    byte[] Box(string type, byte[] payload) { var bytes = new byte[8 + payload.Length]; System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(bytes, (uint)bytes.Length); Encoding.ASCII.GetBytes(type).CopyTo(bytes, 4); payload.CopyTo(bytes, 8); return bytes; }
    var mp4 = Box("ftyp", Encoding.ASCII.GetBytes("isom\0\0\0\0isomavc1")).Concat(Box("moov", new byte[] { 0 })).Concat(Box("mdat", new byte[] { 0 })).ToArray();
    ImageProbe.Validate("assets/video.mp4", mp4);
    Check(ImageProbe.Mime(mp4) == "video/mp4" && ImageProbe.Extension("video/mp4") == ".mp4", "MP4 바이트 형식과 확장자 확인");
    Reject(() => ImageProbe.Validate("assets/video.png", mp4), "MP4 위장 이미지 확장자 거절");
    Reject(() => ImageProbe.Validate("assets/video.mp4", mp4[..^1]), "잘린 MP4 컨테이너 거절");
    Reject(() => ImageProbe.Validate("assets/video.mp4", Box("ftyp", Encoding.ASCII.GetBytes("isom\0\0\0\0"))), "영상 데이터 없는 MP4 거절");
    var currentBuild = CodexBuilds.Find("26.924.2738.0")!;
    Check(CodexBuilds.Find("26.924.1866.0")?.AppVersion == "26.924.20706" && currentBuild.AppVersion == "26.924.22138", "검토한 Codex 패키지와 내부 앱 버전의 정확한 대응");
    Check(CodexBuilds.Find("26.924.2739.0") is null && CodexBuilds.Find("26.924.2738") is null, "검토하지 않은 인접·축약 버전은 자동 지원하지 않음");
    Check(CodexBuilds.Matches(currentBuild, "26.924.22138", currentBuild.ArchiveHash!) && !CodexBuilds.Matches(currentBuild, "26.924.20706", currentBuild.ArchiveHash!) && !CodexBuilds.Matches(currentBuild, "26.924.22138", new string('0', 64)), "새 Codex는 내부 앱 버전과 검토한 ASAR 해시가 모두 일치해야 함");
    Task<int> LaunchCodex() { codexLaunches++; return Task.FromResult(61234); }
    var residentOnly = await ResidentLaunch.Try(false, new RuntimePreferences(), LaunchCodex);
    var disabledLaunch = await ResidentLaunch.Try(true, new RuntimePreferences(LaunchWithCodex: false), LaunchCodex);
    Check(codexLaunches == 0 && residentOnly.Port is null && disabledLaunch.Port is null, "독립 실행·함께 실행 끄기는 Codex를 실행하지 않음");
    var launched = await ResidentLaunch.Try(true, new RuntimePreferences(), LaunchCodex);
    Check(codexLaunches == 1 && launched.Port == 61234 && launched.Error is null, "명시적 함께 실행만 확인된 연결 포트를 전달");
    var launchFailure = new TrayActionException("unsupported-codex");
    var waiting = await ResidentLaunch.Try(true, new RuntimePreferences(), () => Task.FromException<int>(launchFailure));
    Check(waiting.Port is null && ReferenceEquals(waiting.Error, launchFailure), "Codex 지원 실패는 CoSkin 상주 종료 대신 안내 결과로 반환");
    var invalidPort = await ResidentLaunch.Try(true, new RuntimePreferences(), () => Task.FromResult(80));
    Check(invalidPort.Port is null && invalidPort.Error is InvalidDataException, "잘못된 포트로 연결하지 않고 상주 상태 유지");
    try
    {
        await ResidentLaunch.Try(true, new RuntimePreferences(), () => Task.FromCanceled<int>(new CancellationToken(true)));
        throw new Exception("취소가 상주 오류로 흡수됨");
    }
    catch (OperationCanceledException) { Check(true, "명시적 실행 취소는 대기 상태로 흡수하지 않음"); }
    var detectionRoot = Path.Combine(scratch, "Program Files");
    string Original(string package) => Path.Combine(detectionRoot, "WindowsApps", package, "app", "ChatGPT.exe");
    Check(ResidentDetection.IsOriginalPath(Original("OpenAI.Codex_26.924.2738.0_x64__2p2nqsd0c76g0"), detectionRoot), "새 패키지 원본 경로 감지는 연결 허가와 독립");
    Check(!ResidentDetection.IsOriginalPath(Original("OpenAI.Codex_26.924.2738.0_x64__foreign"), detectionRoot), "다른 게시자 패키지 감지 거절");
    Check(!ResidentDetection.IsOriginalPath(Path.Combine(scratch, "ChatGPT.exe"), detectionRoot), "동명 실행파일은 원본 감지 아님");
    Check(!ResidentDetection.IsOriginalPath(Original("OpenAI.Codex_26.924.2738.0_x64__2p2nqsd0c76g0") + ".copy", detectionRoot), "실행파일 경로 전체 일치 필요");
    var originalPids = new HashSet<int> { 10, 11, 12 };
    var parentPids = new Dictionary<int, int> { [10] = 1, [11] = 10, [12] = 11 };
    Check(ResidentDetection.IsBrowserRoot(10, parentPids, originalPids), "Codex 주 프로세스는 창 표시 여부와 관계없이 후보로 유지");
    Check(!ResidentDetection.IsBrowserRoot(11, parentPids, originalPids) && !ResidentDetection.IsBrowserRoot(12, parentPids, originalPids), "더 작은 PID나 Chrome 창을 가진 하위 프로세스도 주 앱 후보에서 제외");
    Check(!ResidentDetection.IsBrowserRoot(13, parentPids, originalPids) && !ResidentDetection.IsBrowserRoot(10, new Dictionary<int, int>(), originalPids), "프로세스 정체성 또는 부모 기록 없는 후보는 연결하지 않음");
    var processEntry = typeof(NativeWindow).GetNestedType("ProcessEntry", System.Reflection.BindingFlags.NonPublic)!;
    Check(System.Runtime.InteropServices.Marshal.SizeOf(processEntry) == 568 && System.Runtime.InteropServices.Marshal.OffsetOf(processEntry, "ParentProcessId").ToInt32() == 32, "Win64 PROCESSENTRY32 부모 PID 및 버퍼 크기 계약");
    foreach (var language in new[] { "ko", "en", "ja", "zh-CN" })
        Check(!TrayMessages.Error(language, "not-connected").Contains("shortcut", StringComparison.OrdinalIgnoreCase), "미연결 안내는 무조건 전용 바로가기 재실행을 요구하지 않음 " + language);
    var nativeDraw = typeof(SetupDrawing).GetNestedType("DrawItem", System.Reflection.BindingFlags.NonPublic)!;
    var nativeCustomDraw = typeof(SetupDrawing).GetNestedType("CustomDraw", System.Reflection.BindingFlags.NonPublic)!;
    Check(IntPtr.Size == 8 && System.Runtime.InteropServices.Marshal.SizeOf(nativeDraw) == 64, "Win64 DRAWITEMSTRUCT는 itemID 포함 64바이트 계약");
    Check(System.Runtime.InteropServices.Marshal.OffsetOf(nativeDraw, "Window").ToInt32() == 24 && System.Runtime.InteropServices.Marshal.OffsetOf(nativeDraw, "Dc").ToInt32() == 32, "설치 CTA native HWND/HDC 오프셋 계약");
    Check(System.Runtime.InteropServices.Marshal.SizeOf(nativeCustomDraw) == 80 && System.Runtime.InteropServices.Marshal.OffsetOf(nativeCustomDraw, "Dc").ToInt32() == 32, "실제 체크박스 custom-draw Win64 ABI 계약");
    Check(CodexPageContract.Supports("app://-/index.html") && CodexPageContract.Supports("app://-/detached-window.html?initialRoute=%2Fdetached-window"), "검증된 main 및 detached 앱 문서 허용");
    Check(!CodexPageContract.Supports("https://example.com/index.html") && !CodexPageContract.Supports("app://-/detached-window.html?initialRoute=https://example.com") && !CodexPageContract.Supports("app://-/index.html?extra=1"), "외부 페이지 및 미지원 내부 라우트 주입 금지");
    var detachedUrl = "app://-/detached-window.html?initialRoute=%2Fdetached-window";
    Check(CodexPageContract.IsRecoverableDetachedFailure(detachedUrl, new InvalidDataException("화면 초기화를 완료하지 못했습니다.")) &&
        CodexPageContract.IsRecoverableDetachedFailure(detachedUrl, new IOException("target closed while handling command")) &&
        CodexPageContract.IsRecoverableDetachedFailure(detachedUrl, new InvalidDataException("{\"text\":\"target closed while handling command\"}")),
        "보조 창 초기화·종료 오류는 해당 창만 재시도");
    Check(!CodexPageContract.IsRecoverableDetachedFailure("app://-/index.html", new InvalidDataException("화면 초기화를 완료하지 못했습니다.")) &&
        !CodexPageContract.IsRecoverableDetachedFailure(detachedUrl, new InvalidDataException("잘못된 연결 주소")) &&
        !CodexPageContract.IsRecoverableDetachedFailure(detachedUrl, new InvalidDataException("지원되지 않은 앱 빌드")) &&
        !CodexPageContract.IsRecoverableDetachedFailure("app://-/detached-window.html?initialRoute=https://example.com", new IOException("closed")),
        "주 창·연결 주소·지원하지 않는 문서는 전체 검증 경계 유지");
    Check(UiLocale.Normalize("ko-KR") == "ko" && UiLocale.Normalize("ja-JP") == "ja" && UiLocale.Normalize("zh-TW") == "zh-CN" && UiLocale.Normalize(null) == "en", "호스트 앱 언어 및 지역 fallback 계약");
    Check(!new RuntimePreferences().ExitWithCodex && !new RuntimePreferences().StartAtSignIn, "새 상주 기본은 종료 후 대기·자동 시작 opt-in");
    var registration = new FakeSignInRegistration();
    var startupService = new SignInStartup(registration);
    var startupExe = Path.Combine(scratch, "CoSkin.Loader.exe");
    startupService.Set(true, startupExe);
    Check(registration.Command == "\"" + startupExe + "\" --resident", "로그인 시작은 직접 상주 명령만 등록");
    startupService.Set(false, startupExe);
    Check(registration.Command is null, "소유 로그인 시작 항목만 제거");
    registration.Command = "foreign-command";
    Reject(() => startupService.Set(true, startupExe), "다른 로그인 시작 등록 덮어쓰기 거절");
    Check(registration.Command == "foreign-command", "거절 뒤 다른 등록 유지");
    var signalStore = Path.Combine(scratch, "resident-idle");
    Directory.CreateDirectory(signalStore);
    using (var signal = new ResidentConnectionSignal(signalStore))
    {
        Check(await signal.FindReadyPort(CancellationToken.None) is null, "연결 기록 없는 대기는 외부 도구 없이 반환");
        using var canceledWait = new CancellationTokenSource(25);
        try { await signal.Wait(canceledWait.Token); throw new Exception("취소 실패"); }
        catch (OperationCanceledException) { Check(true, "유휴 신호 대기 취소·정리"); }
        File.WriteAllText(Path.Combine(signalStore, "managed-connection.json"), "{}");
        using var signalDeadline = new CancellationTokenSource(2000);
        await signal.Wait(signalDeadline.Token);
        Check(true, "별도 저장소 manifest 생성 이벤트로 깨우기");
    }
    var retryWindow = new EndpointRetry();
    for (var attempt = 0; attempt < 6; attempt++) Check(retryWindow.TryAttempt(), "준비 지연 재시도 예산 " + attempt);
    Check(!retryWindow.TryAttempt() && retryWindow.Delay is null, "재시도 소진 후 타이머 없는 대기");
    retryWindow.WakeAfterExhaustion();
    Check(retryWindow.TryAttempt(), "늦은 대상창 생성 신호가 소진된 준비 예산 재개");
    retryWindow.Reset();
    retryWindow.Block();
    retryWindow.WakeAfterExhaustion();
    Check(!retryWindow.TryAttempt() && retryWindow.Delay is null, "잘못된 정체성은 재시도 금지");
    var pendingAttempts = 0;
    using (var delayedEndpoint = new ResidentConnectionSignal(signalStore, probe: _ => Task.FromResult<int?>(++pendingAttempts == 1 ? null : 60600)))
    {
        Check(await delayedEndpoint.FindReadyPort(CancellationToken.None) is null, "manifest보다 listener가 늦은 첫 검사");
        using var deadline = new CancellationTokenSource(2000);
        await delayedEndpoint.Wait(deadline.Token);
        Check(await delayedEndpoint.FindReadyPort(deadline.Token) == 60600 && pendingAttempts == 2, "파일 변경 없이 listener 준비 재시도");
    }
    using (var explicitEndpoint = new ResidentConnectionSignal(signalStore, 60600))
    {
        explicitEndpoint.Connected(60600);
        explicitEndpoint.BeginRecovery(60600);
        using var deadline = new CancellationTokenSource(2000);
        await explicitEndpoint.Wait(deadline.Token);
        Check(await explicitEndpoint.FindReadyPort(deadline.Token) == 60600, "명시 포트 일시 단절 뒤 포트 보존 재연결");
    }
    var slowNativeAttempts = 0;
    using (var slowNative = new ResidentConnectionSignal(signalStore,
        probe: _ => Task.FromResult<int?>(++slowNativeAttempts > 6 ? 60700 : null), retryPending: () => true))
    {
        for (var attempt = 0; attempt < 6; attempt++) await slowNative.FindReadyPort(CancellationToken.None);
        using var deadline = new CancellationTokenSource(7000);
        await slowNative.Wait(deadline.Token);
        Check(await slowNative.FindReadyPort(deadline.Token) == 60700, "일시적인 native 실패는 추가 창 이벤트 없이도 준비 예산을 재개");
        slowNative.Block();
        using var blockedDeadline = new CancellationTokenSource(50);
        try { await slowNative.Wait(blockedDeadline.Token); throw new Exception("차단된 대상 재시도"); }
        catch (OperationCanceledException) { Check(await slowNative.FindReadyPort(CancellationToken.None) is null, "native 복구 대기가 정체성 차단을 해제하지 않음"); }
    }
    using (var idleNative = new ResidentConnectionSignal(signalStore, probe: _ => Task.FromResult<int?>(null), retryPending: () => false))
    {
        for (var attempt = 0; attempt < 6; attempt++) await idleNative.FindReadyPort(CancellationToken.None);
        using var deadline = new CancellationTokenSource(50);
        try { await idleNative.Wait(deadline.Token); throw new Exception("없는 대상 폴링"); }
        catch (OperationCanceledException) { Check(await idleNative.FindReadyPort(CancellationToken.None) is null, "Codex가 없는 유휴 상태는 타이머 재시도 없이 대기"); }
    }
    var runtimeStore = new RuntimePreferenceStore(Path.Combine(scratch, "runtime-settings"));
    Check(runtimeStore.Read() == new RuntimePreferences(), "실행 설정 초기값은 테마와 독립");
    using (var updateLibrary = new Library(Path.Combine(scratch, "manual-update-library")))
    {
        var unavailable = await updateLibrary.Handle(new JsonObject { ["op"] = "runtime-update-check" }, Validate, Decode);
        Check(unavailable["status"]?.GetValue<string>() == "unavailable", "실제 설정 수동 확인은 배포 키 미설정을 명확하게 반환");
        var settings = Library.PreferenceDocument(new RuntimePreferences(StartAtSignIn: true));
        try { await updateLibrary.Handle(new JsonObject { ["op"] = "runtime-settings-write", ["settings"] = settings.DeepClone() }, Validate, Decode); throw new Exception("미설치 로그인 시작 승인"); }
        catch (TrayActionException error) { Check(error.Code == "not-installed" && !updateLibrary.Preferences.Read().StartAtSignIn, "미설치 UI 로그인 시작 거절 및 설정 보존"); }
        var startupRegistered = false; updateLibrary.SetStartup = enabled => startupRegistered = enabled;
        await updateLibrary.Handle(new JsonObject { ["op"] = "runtime-settings-write", ["settings"] = settings.DeepClone() }, Validate, Decode);
        Check(startupRegistered && updateLibrary.Preferences.Read().StartAtSignIn, "설치된 UI 로그인 시작은 등록과 설정을 함께 저장");
        updateLibrary.SetStartup = _ => throw new IOException("fixture registration failure");
        settings["startAtSignIn"] = false;
        try { await updateLibrary.Handle(new JsonObject { ["op"] = "runtime-settings-write", ["settings"] = settings.DeepClone() }, Validate, Decode); throw new Exception("등록 실패 무시"); }
        catch (IOException) { Check(updateLibrary.Preferences.Read().StartAtSignIn, "로그인 등록 실패는 기존 사용자 설정 보존"); }
    }
    runtimeStore.Write(new RuntimePreferences(false, true));
    Check(runtimeStore.Read() == new RuntimePreferences(false, true), "두 실행 연동 옵션 독립 저장");
    runtimeStore.Write(new RuntimePreferences(true, false));
    Check(runtimeStore.Read() == new RuntimePreferences(true, false), "직접 종료 뒤 재실행 설정 보존");
    var lifetime = new TargetLifetime();
    Check(ReleaseVersion.Parse("0.1.0-beta.2").CompareTo(ReleaseVersion.Parse("0.1.0")) < 0 && ReleaseVersion.Parse("0.1.0-beta.10").CompareTo(ReleaseVersion.Parse("0.1.0-beta.2")) > 0, "beta에서 안정 버전 및 숫자 prerelease 우선순위");
    Check(ReleaseVersion.Parse("0.1.0+build.a").CompareTo(ReleaseVersion.Parse("0.1.0+build.b")) == 0, "빌드 메타데이터는 업데이트 우선순위를 바꾸지 않음");
    Reject(() => ReleaseVersion.Parse("0.1.0-beta.02"), "비정규 숫자 prerelease 거절");
    lifetime.Connected(101);
    lifetime.Connected(102);
    lifetime.Connected(102);
    Check(!lifetime.Exited(999, new()), "검증하지 않은 프로세스 종료는 무시");
    Check(!lifetime.Exited(101, new()), "다른 Codex 프로세스가 있으면 상주 유지");
    Check(lifetime.Exited(102, new(ExitWithCodex: true)), "마지막 검증 대상 종료 때만 함께 종료");
    lifetime.Connected(103);
    Check(!lifetime.Exited(103, new(true, false)), "함께 종료 옵션 끄면 대상 종료 후 상주 유지");
    Check(StableVersion.Parse("0.10.0").CompareTo(StableVersion.Parse("0.9.99")) > 0, "안정 버전은 문자열이 아닌 숫자로 비교");
    foreach (var malformedVersion in new[] { "01.0.0", "1.0", "1.0.0-beta", "1.0.0+build", "-1.0.0" })
        Reject(() => StableVersion.Parse(malformedVersion), "비안정/비정규 버전 거절");
    using var publisher = System.Security.Cryptography.ECDsa.Create(System.Security.Cryptography.ECCurve.NamedCurves.nistP256);
    var payloadBytes = Encoding.UTF8.GetBytes("trusted update fixture");
    var updateHash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(payloadBytes)).ToLowerInvariant();
    var payloadUrl = "https://github.com/GNh0/CoSkin/releases/download/v0.10.0/coskin-win-x64.zip";
    var canonical = Encoding.UTF8.GetBytes($"coskin-update-v1\n0.10.0\n{payloadUrl}\n{payloadBytes.Length}\n{updateHash}\n");
    var signature = Convert.ToBase64String(publisher.SignData(canonical, System.Security.Cryptography.HashAlgorithmName.SHA256, System.Security.Cryptography.DSASignatureFormat.IeeeP1363FixedFieldConcatenation));
    var updateManifest = new JsonObject { ["formatVersion"] = 1, ["version"] = "0.10.0", ["payload"] = payloadUrl, ["bytes"] = payloadBytes.Length, ["sha256"] = updateHash, ["signature"] = signature };
    var signedBytes = Encoding.UTF8.GetBytes(updateManifest.ToJsonString());
    var feed = new FakeUpdateFeed(signedBytes, payloadBytes);
    var updater = new UpdateService(feed, publisher.ExportSubjectPublicKeyInfo(), StableVersion.Parse("0.9.99"));
    Check((await updater.Check(new(), false, false, CancellationToken.None)).State == UpdateState.Disabled && feed.Checks == 0, "자동 업데이트 opt-out은 네트워크 호출 없음");
    var noTrust = new UpdateService(feed, null, StableVersion.Parse("0.9.99"));
    Check((await noTrust.Check(new(), true, false, CancellationToken.None)).State == UpdateState.Unavailable && feed.Checks == 0, "게시자 키가 없으면 수동 확인도 미검증 다운로드 금지");
    var deferred = await updater.Check(new(), true, true, CancellationToken.None);
    Check(deferred.State == UpdateState.Deferred && deferred.Update!.Version.ToString() == "0.10.0", "편집 중 상위 안정 버전 교체 지연");
    feed.Manifest = null;
    Check((await updater.Check(new(), true, false, CancellationToken.None)).State == UpdateState.Ready && feed.LastETag == "fixture-etag", "ETag 304 후 검증된 후보 유지");
    updateManifest["version"] = "0.11.0";
    Reject(() => UpdateContract.Verify(Encoding.UTF8.GetBytes(updateManifest.ToJsonString()), publisher.ExportSubjectPublicKeyInfo()), "서명된 버전/경로 변조 거절");
    var updateFile = Path.Combine(scratch, "update.payload");
    await updater.Download(deferred.Update!, updateFile, null, CancellationToken.None);
    Check(File.ReadAllBytes(updateFile).SequenceEqual(payloadBytes), "업데이트 스트림 길이와 해시 검증");
    File.Delete(updateFile);
    feed.Payload = Encoding.UTF8.GetBytes("corrupt");
    try
    {
        await updater.Download(deferred.Update!, updateFile, null, CancellationToken.None);
        throw new Exception("손상 업데이트 승인");
    }
    catch (InvalidDataException) { Check(!File.Exists(updateFile), "손상 업데이트 자체 임시파일 제거"); }
    var failingFeed = new FakeUpdateFeed(signedBytes, payloadBytes) { Failure = new IOException("fixture unavailable") };
    var retryUpdater = new UpdateService(failingFeed, publisher.ExportSubjectPublicKeyInfo(), StableVersion.Parse("0.9.99"));
    try
    {
        await retryUpdater.Check(new(true, true, true), false, false, CancellationToken.None);
        throw new Exception("실패 피드 승인");
    }
    catch (IOException) { Check(true, "업데이트 피드 실패 전달"); }
    Check((await retryUpdater.Check(new(true, true, true), false, false, CancellationToken.None)).State == UpdateState.RetryPending && failingFeed.Checks == 1, "업데이트 실패 후 자동 재시도는 백오프 대기");
    failingFeed.Failure = null;
    Check((await retryUpdater.Check(new(), true, false, CancellationToken.None)).State == UpdateState.Ready && failingFeed.Checks == 2, "명시적 수동 재시도는 정상 피드 복구");
    var timeoutFeed = new FakeUpdateFeed(signedBytes, payloadBytes) { Failure = new OperationCanceledException("fixture body deadline") };
    var timeoutUpdater = new UpdateService(timeoutFeed, publisher.ExportSubjectPublicKeyInfo(), StableVersion.Parse("0.9.99"));
    try { await timeoutUpdater.Check(new(true, true, true), false, false, CancellationToken.None); throw new Exception("시간 제한 실패 무시"); }
    catch (OperationCanceledException) { Check(true, "사용자 취소와 전송 시간 제한을 구분"); }
    Check((await timeoutUpdater.Check(new(true, true, true), false, false, CancellationToken.None)).State == UpdateState.RetryPending && timeoutFeed.Checks == 1, "본문 시간 제한도 자동 재시도 백오프 적용");
    byte[] UpdateZip(params string[] names)
    {
        using var bytes = new MemoryStream();
        using (var zip = new ZipArchive(bytes, ZipArchiveMode.Create, true))
            foreach (var name in names)
            {
                using var writer = new StreamWriter(zip.CreateEntry(name).Open());
                writer.Write("fixture " + name);
            }
        return bytes.ToArray();
    }
    var stageRoot = Path.Combine(scratch, "update-stage");
    var ticketDirectory = Path.Combine(scratch, "updates", Guid.NewGuid().ToString("N")); Directory.CreateDirectory(ticketDirectory);
    var ticketPath = UpdateTickets.Create(scratch, ticketDirectory, deferred.Update!);
    var readTicket = UpdateTickets.Read(scratch, ticketPath, publisher.ExportSubjectPublicKeyInfo());
    Check(readTicket.OriginProcess == Environment.ProcessId && readTicket.Update.Hash == deferred.Update!.Hash, "서명된 업데이트 요청은 정확한 원본 프로세스와 후보를 보존");
    var ticketBytes = File.ReadAllBytes(ticketPath);
    var expiredTicket = JsonContract.Read(ticketBytes); expiredTicket["created"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds() - 601; File.WriteAllText(ticketPath, expiredTicket.ToJsonString());
    Reject(() => UpdateTickets.Read(scratch, ticketPath, publisher.ExportSubjectPublicKeyInfo()), "만료된 업데이트 요청 재사용 거절"); File.WriteAllBytes(ticketPath, ticketBytes);
    Reject(() => UpdateTickets.Read(Path.Combine(scratch, "other-store"), ticketPath, publisher.ExportSubjectPublicKeyInfo()), "다른 저장소 업데이트 요청 거절");
    string StageFixture(byte[] bytes)
    {
        File.WriteAllBytes(updateFile, bytes);
        var trusted = new TrustedUpdate(StableVersion.Parse("1.0.0"), new Uri(payloadUrl), bytes.Length, Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)));
        return UpdateStaging.Extract(updateFile, trusted, stageRoot);
    }
    var validStage = StageFixture(UpdateZip("CoSkin.Loader.exe", "renderer.js", "THIRD-PARTY-NOTICES.txt"));
    Check(Directory.GetFiles(validStage).Length == 3, "검증된 업데이트 ZIP만 독립 staging으로 해제");
    foreach (var forbiddenEntry in new[] { "../renderer.js", "sub/renderer.js", "CoSkin.Loader.exe", "RENDERER.JS" })
        Reject(() => StageFixture(UpdateZip("CoSkin.Loader.exe", forbiddenEntry, "THIRD-PARTY-NOTICES.txt")), "업데이트 ZIP 경로·중복·대소문자 계약 거절");
    Reject(() => StageFixture(UpdateZip("CoSkin.Loader.exe", "renderer.js")), "업데이트 필수 파일 누락 거절");
    Check(Directory.GetDirectories(stageRoot).Length == 1, "거절된 업데이트 staging만 제거하고 기존 검증 staging 보존");
    var transport = new FakeUpdateHttp();
    using (var githubFeed = new GitHubUpdateFeed(transport))
    {
        transport.Response = _ => new System.Net.Http.HttpResponseMessage(System.Net.HttpStatusCode.NotModified);
        Check((await githubFeed.Check("\"fixture\"", CancellationToken.None)).Manifest is null && transport.LastETag == "\"fixture\"", "업데이트 ETag 조건부 확인·304 계약");
        transport.Response = _ => new System.Net.Http.HttpResponseMessage(System.Net.HttpStatusCode.NotFound);
        Check(!(await githubFeed.Check(null, CancellationToken.None)).Available, "안정 배포 안내가 없으면 최신 버전이라고 주장하지 않음");
        transport.Response = _ => new System.Net.Http.HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new System.Net.Http.ByteArrayContent(new byte[8193]) };
        try
        {
            await githubFeed.Check(null, CancellationToken.None);
            throw new Exception("대형 metadata 승인");
        }
        catch (InvalidDataException) { Check(true, "업데이트 HTTP metadata 크기 제한"); }
        foreach (var unsafeUrl in new[] { "http://github.com/GNh0/CoSkin", "https://example.com/payload", "https://github.com:444/payload" })
        {
            transport.Response = _ => { var response = new System.Net.Http.HttpResponseMessage(System.Net.HttpStatusCode.Redirect); response.Headers.Location = new Uri(unsafeUrl); return response; };
            try
            {
                await githubFeed.Check(null, CancellationToken.None);
                throw new Exception("외부 redirect 승인");
            }
            catch (InvalidDataException) { Check(true, "업데이트 HTTPS·게시자 호스트·포트 경계"); }
        }
        transport.Response = _ => new System.Net.Http.HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new System.Net.Http.StreamContent(new StalledUpdateStream()) };
        using var bodyDeadline = new CancellationTokenSource(TimeSpan.FromMilliseconds(50));
        try { await githubFeed.Check(null, bodyDeadline.Token); throw new Exception("중단 본문 미취소"); }
        catch (OperationCanceledException) { Check(true, "응답 헤더 이후 멈춘 업데이트 본문도 연결된 취소 계약 준수"); }
    }
    foreach (var options in new[] { new[] { "--unknown" }, new[] { "--port" }, new[] { "--port", "80" }, new[] { "--store", scratch, "--store", scratch }, new[] { "--install", "--uninstall" }, new[] { "--associate" }, new[] { "--install", "--store", scratch } })
        Reject(() => LaunchOptions.Parse(options), "잘못된 실행 옵션 거절 " + string.Join(" ", options));
    var parsed = LaunchOptions.Parse(["--import", Path.Combine(scratch, "input.coskin"), "--port", "60600", "--store", scratch]);
    Check(parsed.Command == LaunchCommand.Import && parsed.Port == 60600 && parsed.Store == scratch, "파일 가져오기 실행 계약");
    await using (var owner = new InstanceChannel(Path.Combine(scratch, "instance")))
    await using (var client = new InstanceChannel(Path.Combine(scratch, "instance")))
    await using (var isolated = new InstanceChannel(Path.Combine(scratch, "other-instance")))
    {
        Check(owner.IsOwner && !client.IsOwner && isolated.IsOwner, "저장소별 단일 인스턴스 격리");
        owner.Start((command, _) => Task.FromResult(new JsonObject { ["ok"] = command["op"]?.GetValue<string>() == "open" }));
        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.Send(new JsonObject { ["op"] = "open" }, CancellationToken.None)));
        Check(responses.All(response => response["ok"]!.GetValue<bool>()), "동시 실행 요청은 기존 소유 인스턴스로 전달");
    }
    await using (var restarted = new InstanceChannel(Path.Combine(scratch, "instance")))
        Check(restarted.IsOwner, "종료 뒤 단일 인스턴스 소유권 반환");
    var bundle = Path.Combine(scratch, "bundle");
    Directory.CreateDirectory(bundle);
    foreach (var name in new[] { "CoSkin.Loader.exe", "renderer.js", "THIRD-PARTY-NOTICES.txt" })
        File.WriteAllText(Path.Combine(bundle, name), name);
    var installationRoot = Path.Combine(scratch, "installed");
    var fake = new FakeInstallationPlatform(Path.Combine(scratch, "programs", "CoSkin.lnk"));
    var extensionKey = @"Software\Classes\.coskin";
    var previousAssociation = new RegistrationValue("ExpandString", JsonValue.Create("%ORIGINAL%")!);
    fake.Write(extensionKey, "", previousAssociation);
    var installer = new InstallationService(installationRoot, fake);
    var installed = installer.Install(bundle, true);
    Check(File.Exists(installed.Executable) && fake.ShortcutTarget(fake.ShortcutPath) == installed.Executable, "가짜 플랫폼 설치·바로가기 연결");
    Check(fake.Read(extensionKey, "")?.Data.GetValue<string>() == "CoSkin.ThemeFile", "가짜 플랫폼 테마 파일 연결");
    Check(installed.DesktopShortcut is not null && fake.ShortcutTarget(installed.DesktopShortcut) == installed.Executable, "바탕화면 기본 켬·대상 설치 실행파일");
    installer.SetStartup(true);
    Check(fake.Read(InstallationService.StartupKey, InstallationService.StartupName)?.Data.GetValue<string>() == "\"" + installed.Executable + "\" --resident", "로그인 옵션 설치 기록과 등록 일치");

    File.WriteAllText(Path.Combine(bundle, "renderer.js"), "renderer version two");
    var intermediate = installer.Install(bundle, false, "0.1.1");
    Check(fake.Read(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\CoSkin", "DisplayVersion")?.Data.GetValue<string>() == "0.1.1", "상위 안정 버전 설치 등록 갱신");
    Check(fake.Read(InstallationService.StartupKey, InstallationService.StartupName)?.Data.GetValue<string>() == "\"" + intermediate.Executable + "\" --resident", "새 버전 설치 때 로그인 대상 원자 전환");
    Check(fake.ShortcutTarget(intermediate.DesktopShortcut!) == intermediate.Executable, "새 버전 설치 때 바탕화면 대상 갱신");

    var upgraded = installer.Install(bundle, false, "1.0.0");
    Check(installed.Executable != upgraded.Executable && intermediate.Executable != upgraded.Executable && !File.Exists(installed.Executable) && File.Exists(intermediate.Executable) && upgraded.Files.Length == 6, "0.1.0→0.1.1→1.0.0 설치 후 직전 정상 버전만 보존");
    var repairRoot = Path.Combine(scratch, "shortcut-repair");
    var repairPlatform = new FakeInstallationPlatform(Path.Combine(scratch, "repair-programs", "CoSkin.lnk"));
    var repairInstaller = new InstallationService(repairRoot, repairPlatform);
    var oldRepair = repairInstaller.Install(bundle, false, "0.1.0");
    var currentRepair = repairInstaller.Install(bundle, false, "0.1.1");
    repairPlatform.CreateShortcut(currentRepair.DesktopShortcut!, oldRepair.Executable);
    var legacyRecord = currentRepair with { DesktopShortcut = null };
    File.WriteAllBytes(Path.Combine(repairRoot, "bin", "installation.json"), System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(legacyRecord));
    repairPlatform.LegacyShortcutArguments = "--resident";
    var repaired = repairInstaller.Install(bundle, false, "0.1.2");
    Check(repairPlatform.ShortcutTarget(repaired.DesktopShortcut!) == repaired.Executable && repairPlatform.ShortcutTarget(repaired.Shortcut) == repaired.Executable, "구버전 설치 기록이 남긴 서로 다른 실행본의 바로가기를 하나로 복구");
    repairPlatform.CreateShortcut(repaired.DesktopShortcut!, currentRepair.Executable);
    File.WriteAllText(currentRepair.Executable, "changed by another program");
    var repairMarker = File.ReadAllBytes(Path.Combine(repairRoot, "bin", "installation.json"));
    Reject(() => repairInstaller.Install(bundle, false, "0.1.3"), "기록과 해시가 다른 구버전 대상은 소유 바로가기로 인정하지 않음");
    Check(repairMarker.SequenceEqual(File.ReadAllBytes(Path.Combine(repairRoot, "bin", "installation.json"))), "소유권 불일치 시 기존 설치 기록 보존");
    var markerPath = Path.Combine(installationRoot, "bin", "installation.json");
    var beforeMarker = File.ReadAllBytes(markerPath);
    var beforeShortcut = File.ReadAllBytes(fake.ShortcutPath);
    var beforeRegistry = fake.Snapshot();
    File.WriteAllText(Path.Combine(bundle, "renderer.js"), "renderer version three");
    fake.FailAfterWrites = 3;
    try
    {
        installer.Install(bundle, true, "1.0.1");
        throw new Exception("설치 실패 주입 무시");
    }
    catch (IOException) { Check(true, "설치 등록 중 실패 재현"); }
    Check(beforeMarker.SequenceEqual(File.ReadAllBytes(markerPath)) && beforeShortcut.SequenceEqual(File.ReadAllBytes(fake.ShortcutPath)) && beforeRegistry == fake.Snapshot(), "설치 실패는 이전 등록·바로가기·기록으로 복구");
    fake.FailShortcut = true;
    try
    {
        installer.Install(bundle, true, "1.0.1");
        throw new Exception("바로가기 실패 무시");
    }
    catch (IOException) { Check(true, "바로가기 저장 후 실패 재현"); }
    Check(beforeMarker.SequenceEqual(File.ReadAllBytes(markerPath)) && beforeShortcut.SequenceEqual(File.ReadAllBytes(fake.ShortcutPath)) && beforeRegistry == fake.Snapshot(), "바로가기 실패 후 전체 설치 복구");
    fake.FailAfterWrites = 2;
    try
    {
        installer.Uninstall();
        throw new Exception("설치 해제 실패 무시");
    }
    catch (IOException) { Check(true, "등록 해제 중 실패 재현"); }
    Check(beforeRegistry == fake.Snapshot() && beforeMarker.SequenceEqual(File.ReadAllBytes(markerPath)), "등록 해제 실패 후 설치 상태 복구");
    Directory.CreateDirectory(Path.Combine(installationRoot, "assets"));
    var retainedAsset = Path.Combine(installationRoot, "assets", "private.png");
    File.WriteAllText(retainedAsset, "private user asset");
    var rendererPath = upgraded.Files.First(file => Path.GetDirectoryName(file.Path) == Path.GetDirectoryName(upgraded.Executable) && Path.GetFileName(file.Path) == "renderer.js").Path;
    var rendererBytes = File.ReadAllBytes(rendererPath);
    File.WriteAllText(rendererPath, "changed independently");
    var remaining = installer.Uninstall();
    Check(remaining.Files.Length == 1 && File.Exists(rendererPath) && File.Exists(retainedAsset), "해제는 변경된 배포 파일과 개인 자산을 보존");
    Check(fake.Read(InstallationService.StartupKey, InstallationService.StartupName) is null, "제거 시 소유 로그인 항목 해제");
    Check(!File.Exists(upgraded.DesktopShortcut), "제거 시 소유 바탕화면 바로가기 해제");
    Check(fake.Read(extensionKey, "")?.Kind == "ExpandString" && fake.Read(extensionKey, "")?.Data.GetValue<string>() == "%ORIGINAL%", "해제는 기존 연결의 값과 형식을 복원");
    File.WriteAllBytes(rendererPath, rendererBytes);
    Check(installer.Uninstall().Files.Length == 0 && !File.Exists(markerPath), "남은 파일 재검증 후 설치 기록 정리");
    var retentionInstaller = new InstallationService(Path.Combine(scratch, "retention-installed"), new FakeInstallationPlatform(Path.Combine(scratch, "retention-programs", "CoSkin.lnk")));
    var firstRetention = retentionInstaller.Install(bundle, false, "0.1.0");
    var modifiedOld = Path.Combine(Path.GetDirectoryName(firstRetention.Executable)!, "renderer.js");
    File.WriteAllText(modifiedOld, "user modified distribution file");
    InstallationRecord retainedVersions = firstRetention;
    for (var patch = 1; patch <= 34; patch++) retainedVersions = retentionInstaller.Install(bundle, false, "0.1." + patch);
    Check(retainedVersions.Files.Length == 7 && File.Exists(modifiedOld) && File.Exists(retainedVersions.Executable), "34회 상위 버전 설치도 직전 배포와 변경된 이전 파일 보존");
    var switchPlatform = new FakeInstallationPlatform(Path.Combine(scratch, "switch-programs", "CoSkin.lnk"));
    var switchInstaller = new InstallationService(Path.Combine(scratch, "switch-installed"), switchPlatform);
    var switchOriginal = switchInstaller.Install(bundle, true, "0.1.0");
    var switchHosts = new FakeUpdateHosts(false, true);
    var switchUpdate = new TrustedUpdate(StableVersion.Parse("0.1.1"), new Uri(payloadUrl), 1, "fixture");
    var switchResult = await new UpdateSwitch(switchInstaller, switchHosts).Run(bundle, switchUpdate, 101, CancellationToken.None);
    Check(switchResult == UpdateSwitchResult.RolledBack && switchInstaller.Current().Executable == switchOriginal.Executable && switchHosts.Started.Count == 2, "새 호스트 준비 응답 실패는 이전 설치·호스트 복구");
    Check(switchHosts.Waited == 101 && switchPlatform.ShortcutTarget(switchPlatform.ShortcutPath) == switchOriginal.Executable, "호스트 종료 대기와 전용 바로가기 복구 계약");
    var successfulHosts = new FakeUpdateHosts(true);
    Check(await new UpdateSwitch(switchInstaller, successfulHosts).Run(bundle, switchUpdate, 102, CancellationToken.None) == UpdateSwitchResult.Applied && switchInstaller.Current().Executable != switchOriginal.Executable, "새 호스트 명시적 준비 응답 후 전환 확정");
    Reject(() => JsonContract.Read(Encoding.UTF8.GetBytes("{\"id\":1,\"id\":2}")), "중복 JSON 키");
    foreach (var path in new[] { "assets/../x.png", "assets/con.png", "assets//x.png", "C:/x.png", "assets\\x.png", "assets/a.", "Assets/a.png" })
        Check(!Package.SafePath(path), "경로 거절 " + path);
    var root = Directory.GetCurrentDirectory();
    var manifest = JsonContract.Read(File.ReadAllBytes(Path.Combine(root, "docs/examples/manifest.json")));
    var theme = JsonContract.Read(File.ReadAllBytes(Path.Combine(root, "docs/examples/theme.json")));
    var assets = new Dictionary<string, byte[]> { ["assets/search.png"] = File.ReadAllBytes(Path.Combine(root, "docs/examples/assets/search.png")) };
    var exported = Package.Export(manifest, theme, assets);
    Check(exported.SequenceEqual(Package.Export(manifest, theme, assets)), "재현 가능한 ZIP 출력");
    var external = Path.Combine(scratch, "source.coskin");
    File.WriteAllBytes(external, exported);
    Check((await ImportFile.Read(external, CancellationToken.None)).SequenceEqual(exported), "실행 파일 가져오기 바이트 보존");
    var oversized = Path.Combine(scratch, "oversized.coskin");
    using (var stream = File.Create(oversized))
        stream.SetLength(Package.MaxPackage + 1);
    try
    {
        await ImportFile.Read(oversized, CancellationToken.None);
        throw new Exception("큰 파일 승인");
    }
    catch (InvalidDataException) { Check(true, "메모리 할당 전 큰 파일 거절"); }
    var incorrect = Path.Combine(scratch, "incorrect.txt");
    File.WriteAllText(incorrect, "not a theme");
    try
    {
        await ImportFile.Read(incorrect, CancellationToken.None);
        throw new Exception("다른 확장자 승인");
    }
    catch (InvalidDataException) { Check(true, "파일 연결 요청 확장자 제한"); }
    using var store = new Library(Path.Combine(scratch, "library"));
    await store.Handle(new JsonObject { ["op"] = "import", ["data"] = Convert.ToBase64String(File.ReadAllBytes(external)) }, Validate, Decode);
    File.Delete(external);
    var id = manifest["id"]!.GetValue<string>();
    var applied = await store.Handle(new JsonObject { ["op"] = "apply", ["id"] = id, ["scope"] = "global", ["revision"] = 1 }, Validate, Decode);
    Check(applied["bindings"]?["global"]?["revision"]?.GetValue<int>() == 1, "외부 원본 삭제 후 내부 리비전 적용");
    var document = await store.Handle(new JsonObject { ["op"] = "read", ["id"] = id }, Validate, Decode);
    document["manifest"]!["name"] = "이름 변경";
    await store.Handle(new JsonObject { ["op"] = "save", ["document"] = document.DeepClone(), ["baseRevision"] = 1 }, Validate, Decode);
    var summary = await store.Handle(new JsonObject { ["op"] = "list" }, Validate, Decode);
    Check(summary["bindings"]?["global"]?["revision"]?.GetValue<int>() == 1, "저장은 적용 연결을 바꾸지 않음");
    try
    {
        await store.Handle(new JsonObject { ["op"] = "save", ["document"] = document.DeepClone(), ["baseRevision"] = 1 }, Validate, Decode);
        throw new Exception("충돌 미검출");
    }
    catch (InvalidDataException) { passed++; Console.WriteLine("PASS 리비전 충돌"); }
    try
    {
        await store.Handle(new JsonObject { ["op"] = "apply", ["id"] = id, ["scope"] = "global", ["revision"] = 2 }, Validate, Decode, (_, _) => throw new InvalidDataException("창 준비 실패"));
        throw new Exception("적용 실패 미검출");
    }
    catch (InvalidDataException) { summary = await store.Handle(new JsonObject { ["op"] = "list" }, Validate, Decode); Check(summary["bindings"]?["global"]?["revision"]?.GetValue<int>() == 1, "창 준비 실패 시 이전 연결 유지"); }
    try
    {
        await store.Handle(new JsonObject { ["op"] = "apply", ["id"] = id, ["scope"] = "global", ["profile"] = "missing-profile" }, Validate, Decode);
        throw new Exception("없는 구성 승인");
    }
    catch (InvalidDataException) { passed++; Console.WriteLine("PASS 없는 구성 적용 거절"); }
    var missingAsset = document.DeepClone().AsObject();
    missingAsset["assets"]!["assets/search.png"] = new string('0', 64);
    try
    {
        await store.Handle(new JsonObject { ["op"] = "save", ["document"] = missingAsset, ["baseRevision"] = 2 }, Validate, Decode);
        throw new Exception("없는 자산 승인");
    }
    catch (FileNotFoundException) { passed++; Console.WriteLine("PASS 없는 hash 자산 저장 거절"); }
    var mismatchedAsset = document.DeepClone().AsObject();
    mismatchedAsset["assets"]!["assets/search.jpg"] = mismatchedAsset["assets"]!["assets/search.png"]!.DeepClone();
    try
    {
        await store.Handle(new JsonObject { ["op"] = "save", ["document"] = mismatchedAsset, ["baseRevision"] = 2 }, Validate, Decode);
        throw new Exception("잘못된 MIME 승인");
    }
    catch (InvalidDataException) { passed++; Console.WriteLine("PASS 자산 확장자 MIME 불일치 거절"); }
    var classificationBefore = (await store.Handle(new JsonObject { ["op"] = "list" }, Validate, Decode)).DeepClone();
    var groupCreated = await store.Handle(new JsonObject { ["op"] = "group-write", ["name"] = " 러브코미디 " }, Validate, Decode);
    var groupId = groupCreated["groupId"]!.GetValue<string>();
    await store.Handle(new JsonObject { ["op"] = "organization-write", ["id"] = id, ["metadata"] = new JsonObject { ["favorite"] = true, ["groupId"] = groupId, ["tags"] = new JsonArray("GIF", " 고화질 ", "gif") } }, Validate, Decode);
    using (var reopened = new Library(store.StorePath))
    {
        var organized = await reopened.Handle(new JsonObject { ["op"] = "list" }, Validate, Decode);
        Check(organized["organization"]?["themes"]?[id]?["favorite"]?.GetValue<bool>() == true && organized["organization"]?["themes"]?[id]?["tags"]?.AsArray().Count == 2, "즐겨찾기·그룹·태그는 정규화 후 재시작에도 보존");
        Check(JsonNode.DeepEquals(classificationBefore["bindings"], organized["bindings"]) && JsonNode.DeepEquals(classificationBefore["themes"], organized["themes"]), "분류 저장은 적용 바인딩과 테마 리비전을 변경하지 않음");
    }
    try { await store.Handle(new JsonObject { ["op"] = "organization-write", ["id"] = id, ["metadata"] = new JsonObject { ["groupId"] = "missing" } }, Validate, Decode); throw new Exception("그룹 오류 승인"); }
    catch (InvalidDataException) { Check(true, "없는 그룹 지정 거절"); }
    await store.Handle(new JsonObject { ["op"] = "group-write", ["groupId"] = groupId, ["name"] = "애니메이션" }, Validate, Decode);
    summary = await store.Handle(new JsonObject { ["op"] = "list" }, Validate, Decode);
    Check(summary["organization"]?["groups"]?[groupId]?.GetValue<string>() == "애니메이션" && summary["organization"]?["themes"]?[id]?["groupId"]?.GetValue<string>() == groupId, "그룹 이름 변경 후 테마 연결 유지");
    await store.Handle(new JsonObject { ["op"] = "group-delete", ["groupId"] = groupId }, Validate, Decode);
    summary = await store.Handle(new JsonObject { ["op"] = "list" }, Validate, Decode);
    Check(summary["organization"]?["themes"]?[id]?["groupId"] is null && summary["organization"]?["themes"]?[id]?["favorite"]?.GetValue<bool>() == true && summary["themes"]?[id] is not null, "그룹 삭제는 테마와 즐겨찾기를 유지하고 그룹 지정만 해제");
    var output = await store.Handle(new JsonObject { ["op"] = "export", ["id"] = id, ["revision"] = 1 }, Validate, Decode);
    var package = Package.Read(Convert.FromBase64String(output["data"]!.GetValue<string>()));
    Check(!package.Files.Keys.Any(key => key.Contains("organization")) && package.Manifest["organization"] is null, "개인 분류 정보는 내보낸 테마에 포함하지 않음");
    Check(package.Files["assets/search.png"].SequenceEqual(assets["assets/search.png"]), "내보내기 자산 바이트 보존");
    using (var zipBytes = new MemoryStream())
    {
        using (var zip = new ZipArchive(zipBytes, ZipArchiveMode.Create, true))
        {
            var entry = zip.CreateEntry("assets/../evil.png");
            using var stream = entry.Open();
            stream.Write(new byte[] { 1 });
        }
        Reject(() => Package.Read(zipBytes.ToArray()), "ZIP 경로 횡단");
    }
    Check(Failure.Describe(new InvalidDataException("A local file header is corrupt.")).Message.Contains("손상"), "외부 오류 한국어 메시지");
    using (var factoryStore = new Library(Path.Combine(scratch, "factory")))
    {
        var previous = document.DeepClone().AsObject();
        previous["manifest"]!["id"] = "builtin.test";
        previous["assets"] = new JsonObject();
        await factoryStore.Handle(new JsonObject { ["op"] = "create", ["document"] = previous.DeepClone() }, Validate, Decode);
        var next = previous.DeepClone().AsObject();
        next["manifest"]!["name"] = "새 기본 테마";
        await factoryStore.Handle(new JsonObject { ["op"] = "seed", ["documents"] = new JsonArray(next.DeepClone()), ["legacyDocuments"] = new JsonArray(previous.DeepClone()) }, Validate, Decode);
        var latest = await factoryStore.Handle(new JsonObject { ["op"] = "list" }, Validate, Decode);
        Check(latest["themes"]?["builtin.test"]?["revision"]?.GetValue<int>() == 2, "정확한 이전 기본 테마만 새 리비전 생성");
        var saved = await factoryStore.Handle(new JsonObject { ["op"] = "read", ["id"] = "builtin.test", ["revision"] = 1 }, Validate, Decode);
        Check(JsonNode.DeepEquals(saved, previous), "기본 테마 이전 리비전 보존");
    }
    using (var transfers = new TransferStore(scratch))
    {
        var token = transfers.Begin(4);
        Reject(() => transfers.Append(token, 1, new byte[] { 1 }), "전송 조각 순서 거절");
        transfers.Append(token, 0, new byte[] { 1, 2 });
        Reject(() => transfers.Consume(token), "미완료 전송 소비 거절");
        transfers.Append(token, 2, new byte[] { 3, 4 });
        Check(transfers.Read(token, 0).SequenceEqual(new byte[] { 1, 2, 3, 4 }), "조각 다운로드 바이트 보존");
        Check(transfers.Consume(token).SequenceEqual(new byte[] { 1, 2, 3, 4 }), "조각 전송 바이트 보존");
        Reject(() => transfers.Consume(token), "소비된 전송 재사용 거절");
        token = transfers.Begin(1);
        transfers.Cancel(token);
        Reject(() => transfers.Append(token, 0, new byte[] { 1 }), "취소한 전송 거절");
    }
    var effectFile = File.ReadAllBytes(Path.Combine(root, "docs/examples/soft-rise.coskin-effect.json"));
    var effectDefinition = EffectLibrary.Parse(effectFile);
    var validatedEffects = 0;
    Task ValidateEffects(JsonObject value)
    {
        Check(value["theme"]?["customEffects"] is JsonArray, "호스트 사용자 효과 검증은 공통 계약 문서로 위임");
        validatedEffects++;
        return Task.CompletedTask;
    }
    var registered = await store.Handle(new JsonObject { ["op"] = "effect-import", ["data"] = Convert.ToBase64String(effectFile) }, ValidateEffects, Decode);
    Check(registered["ok"]?.GetValue<bool>() == true && validatedEffects == 2, "효과 등록 전 단일 정의·전체 예산 모두 검증");
    var collision = await store.Handle(new JsonObject { ["op"] = "effect-import", ["data"] = Convert.ToBase64String(effectFile) }, ValidateEffects, Decode);
    Check(collision["conflict"]?.GetValue<bool>() == true, "효과 이름·ID 충돌은 명시적 선택 대기");
    var renamed = await store.Handle(new JsonObject { ["op"] = "effect-register", ["definition"] = effectDefinition.DeepClone(), ["rename"] = "Another effect" }, ValidateEffects, Decode);
    Check(renamed["ok"]?.GetValue<bool>() == true, "효과 다른 이름 저장");
    var effectsSummary = await store.Handle(new JsonObject { ["op"] = "list" }, Validate, Decode);
    Check(effectsSummary["effects"]?.AsArray().Count == 2, "내 효과 저장소 재조회");
    await store.Handle(new JsonObject { ["op"] = "effect-delete", ["effectId"] = effectDefinition["id"]!.GetValue<string>() }, Validate, Decode);
    effectsSummary = await store.Handle(new JsonObject { ["op"] = "list" }, Validate, Decode);
    Check(effectsSummary["effects"]?.AsArray().Count == 1, "효과 목록 삭제");
    var effectTheme = (JsonObject)theme.DeepClone();
    effectTheme["customEffects"] = new JsonArray(effectDefinition.DeepClone());
    var effectPackage = Package.Read(Package.Export(manifest, effectTheme, assets));
    Check(JsonNode.DeepEquals(effectPackage.Theme["customEffects"]?[0], effectDefinition), "패키지 내장 효과 정의 왕복 보존");
    Console.WriteLine($"{passed} tests passed");
}


finally
{
    var resolved = Path.GetFullPath(scratch);
    var prefix = Path.GetFullPath(Path.GetTempPath());
    if (resolved.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && Path.GetFileName(resolved).StartsWith("CoSkin-host-tests-", StringComparison.Ordinal))
        Directory.Delete(resolved, true);
}

sealed class FakeInstallationPlatform(string shortcutPath) : IInstallationPlatform
{
    private readonly Dictionary<string, RegistrationValue> values = new();
    public int FailAfterWrites
    {
        get; set;
    }
    public bool FailShortcut
    {
        get; set;
    }
    public string ShortcutPath => shortcutPath;
    public string? LegacyShortcutArguments { get; set; }
    public string? ShortcutArguments(string path) => LegacyShortcutArguments;
    public RegistrationValue? Read(string key, string name) => values.GetValueOrDefault(key + "\n" + name);
    public void Write(string key, string name, RegistrationValue? value)
    {
        if (FailAfterWrites > 0 && --FailAfterWrites == 0)
            throw new IOException("테스트용 등록 실패");
        if (value is null)
            values.Remove(key + "\n" + name);
        else
            values[key + "\n" + name] = value;
    }
    public string? ShortcutTarget(string path) => File.Exists(path) ? File.ReadAllText(path) : null;
    public void CreateShortcut(string path, string executable)
    {
        File.WriteAllText(path, executable);
        if (FailShortcut)
        {
            FailShortcut = false;
            throw new IOException("테스트용 바로가기 실패");
        }
    }
    public string Snapshot() => System.Text.Json.JsonSerializer.Serialize(values.OrderBy(pair => pair.Key).ToArray());
}
internal sealed class FakeUpdateFeed(byte[]? manifest, byte[] payload) : IUpdateFeed
{
    internal byte[]? Manifest = manifest;
    internal byte[] Payload = payload;
    internal int Checks;
    internal string? LastETag;
    internal Exception? Failure;
    public Task<UpdateFeedResult> Check(string? etag, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Checks++;
        if (Failure is not null)
            throw Failure;
        LastETag = etag;
        return Task.FromResult(new UpdateFeedResult(Manifest, "fixture-etag"));
    }
    public Task<Stream> Download(Uri url, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult<Stream>(new MemoryStream(Payload, false));
    }
}
internal sealed class FakeUpdateHttp : System.Net.Http.HttpMessageHandler
{
    internal Func<System.Net.Http.HttpRequestMessage, System.Net.Http.HttpResponseMessage> Response = _ => throw new IOException();
    internal string? LastETag;
    protected override Task<System.Net.Http.HttpResponseMessage> SendAsync(System.Net.Http.HttpRequestMessage request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        LastETag = request.Headers.IfNoneMatch.FirstOrDefault()?.ToString();
        return Task.FromResult(Response(request));
    }
}
internal sealed class StalledUpdateStream : Stream
{
    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        await Task.Delay(Timeout.Infinite, cancellationToken);
        return 0;
    }
    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    public override void Flush() => throw new NotSupportedException();
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}
internal sealed class FakeUpdateHosts(params bool[] readiness) : IUpdateHostLifecycle
{
    private readonly Queue<bool> responses = new(readiness);
    internal int Waited;
    internal readonly List<string> Started = [];
    public Task WaitForExit(int originProcess, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Waited = originProcess;
        return Task.CompletedTask;
    }
    public Task<bool> StartAndConfirm(string executable, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Started.Add(executable);
        return Task.FromResult(responses.Dequeue());
    }
}

internal sealed class FakeSignInRegistration : ISignInRegistration
{
    internal string? Command;
    public string? Read() => Command;
    public void Write(string? command) => Command = command;
}
