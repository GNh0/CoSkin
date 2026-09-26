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
    var nativeDraw = typeof(SetupDrawing).GetNestedType("DrawItem", System.Reflection.BindingFlags.NonPublic)!;
    var nativeCustomDraw = typeof(SetupDrawing).GetNestedType("CustomDraw", System.Reflection.BindingFlags.NonPublic)!;
    Check(IntPtr.Size == 8 && System.Runtime.InteropServices.Marshal.SizeOf(nativeDraw) == 64, "Win64 DRAWITEMSTRUCT는 itemID 포함 64바이트 계약");
    Check(System.Runtime.InteropServices.Marshal.OffsetOf(nativeDraw, "Window").ToInt32() == 24 && System.Runtime.InteropServices.Marshal.OffsetOf(nativeDraw, "Dc").ToInt32() == 32, "설치 CTA native HWND/HDC 오프셋 계약");
    Check(System.Runtime.InteropServices.Marshal.SizeOf(nativeCustomDraw) == 80 && System.Runtime.InteropServices.Marshal.OffsetOf(nativeCustomDraw, "Dc").ToInt32() == 32, "실제 체크박스 custom-draw Win64 ABI 계약");
    Check(CodexPageContract.Supports("app://-/index.html") && CodexPageContract.Supports("app://-/detached-window.html?initialRoute=%2Fdetached-window"), "검증된 main 및 detached 앱 문서 허용");
    Check(!CodexPageContract.Supports("https://example.com/index.html") && !CodexPageContract.Supports("app://-/detached-window.html?initialRoute=https://example.com") && !CodexPageContract.Supports("app://-/index.html?extra=1"), "외부 페이지 및 미지원 내부 라우트 주입 금지");
    var runtimeStore = new RuntimePreferenceStore(Path.Combine(scratch, "runtime-settings"));
    Check(runtimeStore.Read() == new RuntimePreferences(), "실행 설정 초기값은 테마와 독립");
    using (var updateLibrary = new Library(Path.Combine(scratch, "manual-update-library")))
    {
        var unavailable = await updateLibrary.Handle(new JsonObject { ["op"] = "runtime-update-check" }, Validate, Decode);
        Check(unavailable["status"]?.GetValue<string>() == "unavailable", "실제 설정 수동 확인은 배포 키 미설정을 명확하게 반환");
    }
    runtimeStore.Write(new RuntimePreferences(false, true));
    Check(runtimeStore.Read() == new RuntimePreferences(false, true), "두 실행 연동 옵션 독립 저장");
    runtimeStore.Write(new RuntimePreferences(true, false));
    Check(runtimeStore.Read() == new RuntimePreferences(true, false), "직접 종료 뒤 재실행 설정 보존");
    var lifetime = new TargetLifetime();
    lifetime.Connected(101);
    lifetime.Connected(102);
    lifetime.Connected(102);
    Check(!lifetime.Exited(999, new()), "검증하지 않은 프로세스 종료는 무시");
    Check(!lifetime.Exited(101, new()), "다른 Codex 프로세스가 있으면 상주 유지");
    Check(lifetime.Exited(102, new()), "마지막 검증 대상 종료 때만 함께 종료");
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
    File.WriteAllText(Path.Combine(bundle, "renderer.js"), "renderer version two");
    var intermediate = installer.Install(bundle, false, "0.1.1");
    Check(fake.Read(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\CoSkin", "DisplayVersion")?.Data.GetValue<string>() == "0.1.1", "상위 안정 버전 설치 등록 갱신");
    var upgraded = installer.Install(bundle, false, "1.0.0");
    Check(installed.Executable != upgraded.Executable && intermediate.Executable != upgraded.Executable && !File.Exists(installed.Executable) && File.Exists(intermediate.Executable) && upgraded.Files.Length == 6, "0.1.0→0.1.1→1.0.0 설치 후 직전 정상 버전만 보존");
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
    var output = await store.Handle(new JsonObject { ["op"] = "export", ["id"] = id, ["revision"] = 1 }, Validate, Decode);
    var package = Package.Read(Convert.FromBase64String(output["data"]!.GetValue<string>()));
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
