using System.Net;
using System.Text.Json.Nodes;
using System.Collections.Concurrent;
namespace CoSkin;

internal static class Program
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(5) };
    internal static async Task<int> Main(string[] args)
    {
        try
        {
            if (args.Length == 0 && WindowsInstaller.ShouldOfferSetup())
            {
                WindowsInstaller.Install(false);
                return 0;
            }
            var options = LaunchOptions.Parse(args);
            var store = options.Store;
            if (options.Command == LaunchCommand.Prepare)
            {
                await WindowsLauncher.Launch(store, true);
                return 0;
            }
            if (options.Command == LaunchCommand.Install)
            {
                WindowsInstaller.Install(options.Associate);
                return 0;
            }
            if (options.Command == LaunchCommand.Uninstall)
            {
                WindowsInstaller.Uninstall();
                return 0;
            }
            if (options.Command == LaunchCommand.Coupled && !new RuntimePreferenceStore(store).Read().LaunchWithCodex)
            {
                await WindowsLauncher.Launch(store, false);
                return 0;
            }
            await using var instance = new InstanceChannel(store);
            var launchRequest = new JsonObject { ["op"] = options.Command == LaunchCommand.Import ? "import" : "open", ["port"] = options.Port };
            if (options.ImportPath is not null)
                launchRequest["path"] = options.ImportPath;
            if (!instance.IsOwner)
            {
                using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(35));
                var reply = await instance.Send(launchRequest, deadline.Token);
                if (reply["ok"]?.GetValue<bool>() != true)
                    throw new InvalidDataException(reply["message"]?.GetValue<string>() ?? "기존 CoSkin 창으로 요청을 전달하지 못했습니다.");
                Console.WriteLine(reply["deferred"]?.GetValue<bool>() == true ? "편집 상태를 보존했습니다. 가져온 테마는 목록에서 확인할 수 있습니다." : "기존 CoSkin 창으로 요청을 전달했습니다.");
                return 0;
            }
            var port = options.Port?.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (port is null)
            {
                var launched = await WindowsLauncher.Launch(store, false);
                port = launched.ToString(System.Globalization.CultureInfo.InvariantCulture);
            }
            if (!int.TryParse(port, out var number) || number < 1024 || number > 65535)
                throw new InvalidDataException("포트 범위 오류");
            var bundle = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "renderer.js"));
            using var library = new Library(store);
            var sessions = new ConcurrentDictionary<string, Cdp>();
            var exitCode = 0;
            int? verifiedProcess = null;
            var nativeWindows = new ConcurrentDictionary<string, IntPtr>();
            var lastVisibility = new ConcurrentDictionary<string, bool>();
            var sessionId = Guid.NewGuid().ToString("N");
            using var stop = new CancellationTokenSource();
            using var tray = new TrayController(library, await library.TrayState(), () => sessions.Values.ToArray(),
                (renderer, request) => ExecuteRequest(renderer, library, request, () => sessions.Values.ToArray()), () => stop.Cancel(), async () => { number = await WindowsLauncher.Launch(store, false); verifiedProcess = null; },
                async renderer =>
                {
                    var targetId = sessions.FirstOrDefault(pair => ReferenceEquals(pair.Value, renderer)).Key;
                    if (targetId is not null && nativeWindows.TryGetValue(targetId, out var handle))
                        NativeWindow.Activate(handle, verifiedProcess ?? 0);
                    await renderer.Send("Page.bringToFront");
                });
            await tray.Ready;
            instance.Start((command, cancellationToken) => ExternalRequest(command, number, library, () => sessions.Values.ToArray(), cancellationToken));
            var initialImport = options.Command == LaunchCommand.Import;
            Console.CancelKeyPress += (_, e) => { e.Cancel = true; stop.Cancel(); };
            Console.WriteLine("CoSkin 연결을 기다립니다. 종료하려면 Ctrl+C를 누르세요.");
            while (!stop.IsCancellationRequested)
            {
                try
                {
                    var owner = NativeWindow.ListenerProcess(number);
                    if (verifiedProcess != owner)
                    {
                        var executable = NativeWindow.VerifyExecutable(owner);
                        await WindowsLauncher.VerifyRunning(executable);
                        verifiedProcess = owner;
                        tray.WatchVerifiedProcess(owner);
                        nativeWindows.Clear();
                        lastVisibility.Clear();
                    }
                    var list = JsonNode.Parse(await Http.GetStringAsync($"http://127.0.0.1:{number}/json/list", stop.Token))!.AsArray();
                    var alive = new HashSet<string>();
                    foreach (var target in list)
                    {
                        if (target?["type"]?.GetValue<string>() != "page" || !CodexPageContract.Supports(target["url"]?.GetValue<string>()))
                            continue;
                        var id = target["id"]!.GetValue<string>();
                        var newlyConnected = false;
                        alive.Add(id);
                        if (!sessions.TryGetValue(id, out var cdp))
                        {
                            newlyConnected = true;
                            var uri = new Uri(target["webSocketDebuggerUrl"]!.GetValue<string>());
                            if (uri.Host != "127.0.0.1" || uri.Port != number || uri.Scheme != "ws")
                                throw new InvalidDataException("잘못된 연결 주소");
                            cdp = new Cdp();
                            await cdp.Connect(uri);
                            var current = cdp;
                            cdp.Event += message => { if (message["method"]?.GetValue<string>() == "Runtime.bindingCalled" && message["params"]?["name"]?.GetValue<string>() == "__coskinRequest") _ = Handle(current, library, message["params"]!["payload"]!.GetValue<string>(), sessionId, () => sessions.Values.ToArray()); };
                            await cdp.Send("Runtime.enable");
                            await cdp.Send("Runtime.addBinding", new JsonObject { ["name"] = "__coskinRequest" });
                            sessions[id] = cdp;
                        }
                        var status = await cdp.Evaluate("Boolean(window.__coskin)");
                        if (status?.GetValue<bool>() != true)
                        {
                            await cdp.Evaluate("window.__coskinSessionId=" + System.Text.Json.JsonSerializer.Serialize(sessionId));
                            await cdp.Evaluate(bundle);
                            await cdp.Evaluate("window.__coskinReady");
                            if (await cdp.Evaluate("Boolean(window.__coskin)") is not JsonValue ready || !ready.GetValue<bool>())
                                throw new InvalidDataException("화면 초기화를 완료하지 못했습니다.");
                            Console.WriteLine("Codex 창에 CoSkin 테마스킨 목록을 연결했습니다.");
                        }
                        await cdp.Evaluate("window.__coskin?.heartbeat()");
                        if (!nativeWindows.TryGetValue(id, out var window) || window == IntPtr.Zero)
                        {
                            var geometry = (await cdp.Evaluate("({x:screenX,y:screenY,width:outerWidth,height:outerHeight})"))?.AsObject();
                            window = geometry is null ? IntPtr.Zero : NativeWindow.MatchWindow(owner, geometry);
                            nativeWindows[id] = window;
                        }
                        var nativeVisible = NativeWindow.Visible(window, owner);
                        if (window == IntPtr.Zero)
                        {
                            await cdp.Evaluate("window.__coskin?.pauseMotion(true);window.__coskin?.suspend(false)");
                            continue;
                        }
                        await cdp.Evaluate("window.__coskin?.pauseMotion(false)");
                        if (newlyConnected || !lastVisibility.TryGetValue(id, out var previousVisible) || previousVisible != nativeVisible)
                            await cdp.Evaluate("window.__coskin?.suspend(" + (nativeVisible ? "false" : "true") + ")");
                        lastVisibility[id] = nativeVisible;
                    }
                    foreach (var stale in sessions.Keys.Where(k => !alive.Contains(k)).ToArray())
                    {
                        await sessions[stale].DisposeAsync();
                        sessions.TryRemove(stale, out _);
                        nativeWindows.TryRemove(stale, out _);
                        lastVisibility.TryRemove(stale, out _);
                    }
                    if (initialImport && sessions.Count > 0)
                    {
                        initialImport = false;
                        try
                        {
                            await ExternalRequest(launchRequest, number, library, () => sessions.Values.ToArray(), stop.Token);
                        }
                        catch (Exception error) when (error is not OperationCanceledException)
                        {
                            Console.Error.WriteLine(Failure.Describe(error).Message);
                        }
                    }
                }
                catch (OperationCanceledException) when (stop.IsCancellationRequested) { break; }
                catch (InvalidDataException ex)
                {
                    Console.Error.WriteLine("연결을 중지했습니다. 테마스킨 목록은 보존합니다. " + ex.Message);
                    exitCode = 1;
                    break;
                }
                catch (Exception ex) { Console.Error.WriteLine("연결 대기: " + ex.Message); }
                try
                {
                    await Task.Delay(2000, stop.Token);
                }
                catch (OperationCanceledException) { break; }
            }
            await instance.StopServer();
            foreach (var cdp in sessions.Values)
            {
                try
                {
                    await cdp.Evaluate("window.__coskin?.dispose()");
                }
                catch (Exception ex) { Console.Error.WriteLine("복원 확인 실패: " + ex.Message); }
                await cdp.DisposeAsync();
            }
            return exitCode;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex);
            ApplicationNotice.Failure(ex);
            return 1;
        }
    }
    private static async Task<JsonObject> ExternalRequest(JsonObject command, int port, Library library, Func<Cdp[]> windows, CancellationToken cancellationToken)
    {
        if (command.Any(pair => pair.Key is not ("op" or "path" or "port")))
            throw new InvalidDataException("지원하지 않는 실행 요청 필드입니다.");
        if (command["port"] is not null && command["port"]!.GetValue<int>() != port)
            throw new InvalidDataException("이 저장소는 다른 Codex 창에 연결되어 있습니다.");
        var operation = JsonContract.String(command, "op");
        if (operation is not ("open" or "import"))
            throw new InvalidDataException("지원하지 않는 실행 요청입니다.");
        var file = operation == "import" ? await ImportFile.Read(JsonContract.String(command, "path"), cancellationToken) : null;
        Cdp? renderer = null;
        while (renderer is null)
        {
            cancellationToken.ThrowIfCancellationRequested();
            foreach (var candidate in windows())
                if (await candidate.Evaluate("Boolean(window.__coskin)") is JsonValue ready && ready.GetValue<bool>())
                {
                    renderer = candidate;
                    break;
                }
            if (renderer is null)
                await Task.Delay(100, cancellationToken);
        }
        if (file is not null)
        {
            var token = library.StageTransfer(file);
            try
            {
                await ExecuteRequest(renderer, library, new JsonObject { ["op"] = "import", ["token"] = token }, windows);
            }
            finally { library.CancelTransfer(token); }
            var summary = await library.Handle(new JsonObject { ["op"] = "list" }, _ => Task.CompletedTask, (_, _) => Task.CompletedTask);
            foreach (var window in windows())
                await window.Evaluate("window.__coskin?.receiveSummary(" + summary.ToJsonString() + ")");
        }
        var opened = await renderer.Evaluate("window.__coskin.openLibrary()");
        return new JsonObject { ["ok"] = true, ["deferred"] = opened?.GetValue<bool>() != true };
    }
    private static async Task<JsonNode> ExecuteRequest(Cdp cdp, Library library, JsonObject request, Func<Cdp[]> windows)
    {
        return await library.Handle(request,
                async doc => { await cdp.Evaluate("window.__coskinValidate(" + doc.ToJsonString() + ")"); },
                async (bytes, mime) =>
                {
                    var token = library.StageTransfer(bytes);
                    try
                    {
                        var transfer = new JsonObject { ["token"] = token, ["length"] = bytes.Length };
                        await cdp.Evaluate("window.__coskinDecode(" + transfer.ToJsonString() + "," + System.Text.Json.JsonSerializer.Serialize(mime) + ")");
                    }
                    finally { library.CancelTransfer(token); }
                },
                async (next, previous) =>
                {
                    var participants = windows();
                    try
                    {
                        foreach (var window in participants)
                            await window.Evaluate("window.__coskin.prepare(" + next.ToJsonString() + ")");
                        foreach (var window in participants)
                            await window.Evaluate("window.__coskin.receiveSummary(" + next.ToJsonString() + ")");
                    }
                    catch
                    {
                        foreach (var window in participants)
                            try
                            {
                                await window.Evaluate("window.__coskin?.receiveSummary(" + previous.ToJsonString() + ")");
                            }
                            catch (Exception rollback) { Console.Error.WriteLine("창 복구 대기: " + rollback.Message); }
                        throw new InvalidDataException("일부 창에서 적용하지 못해 이전 적용 상태로 복원했습니다.");
                    }
                });
    }
    private static async Task Handle(Cdp cdp, Library library, string payload, string sessionId, Func<Cdp[]> windows)
    {
        string? requestId = null;
        try
        {
            var request = JsonContract.Read(System.Text.Encoding.UTF8.GetBytes(payload), 4 * 1024 * 1024);
            requestId = JsonContract.String(request, "requestId");
            if (request["sessionId"]?.GetValue<string>() != sessionId || request["contractVersion"]?.GetValue<int>() != 1)
                throw new InvalidDataException("연결 계약 오류");
            var result = await ExecuteRequest(cdp, library, request, windows);
            if (request["op"]?.GetValue<string>() is "create" or "save" or "import" or "apply" or "disable" or "enable" or "inherit" or "delete" or "motion-policy")
            {
                var summary = await library.Handle(new JsonObject { ["op"] = "list" }, _ => Task.CompletedTask, (_, _) => Task.CompletedTask);
                foreach (var window in windows())
                    await window.Evaluate("window.__coskin?.receiveSummary(" + summary.ToJsonString() + ")");
            }
            await cdp.Evaluate("window.__coskin?.response(" + System.Text.Json.JsonSerializer.Serialize(requestId) + "," + result.ToJsonString() + ",null)");
        }
        catch (Exception ex)
        {
            var failure = Failure.Describe(ex);
            Console.Error.WriteLine($"{failure.Code}: {ex}");
            if (requestId is not null)
                try
                {
                    await cdp.Evaluate("window.__coskin?.response(" + System.Text.Json.JsonSerializer.Serialize(requestId) + ",null," + new JsonObject { ["code"] = failure.Code, ["message"] = failure.Message, ["line"] = failure.Line, ["column"] = failure.Column }.ToJsonString() + ")");
                }
                catch (Exception reply) { Console.Error.WriteLine("요청 응답 실패: " + reply.Message); }
        }
    }
}

