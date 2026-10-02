using System.Net;
using System.Text.Json.Nodes;
using System.Collections.Concurrent;
namespace CoSkin;

internal static class Program
{
#if COSKIN_INTEGRATION
    internal static Func<Cdp[]> IntegrationWindows { get; private set; } = () => [];
    internal static Func<Cdp?> IntegrationMain { get; private set; } = () => null;
#endif
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
            DiagnosticLog.Configure(store);
            DiagnosticLog.Record("start");
            if (options.Command == LaunchCommand.Update)
            {
                await UpdateWorker.Run(store, options.ImportPath!);
                return 0;
            }
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
            await using var instance = new InstanceChannel(store);
            var launchRequest = new JsonObject { ["op"] = options.Command == LaunchCommand.Quit ? "quit" : options.Command == LaunchCommand.Import ? "import" : options.Command == LaunchCommand.Coupled ? "launch" : "open", ["port"] = options.Port };
            if (options.CodexProcess is not null) launchRequest["codexPid"] = options.CodexProcess;
            if (options.ImportPath is not null)
                launchRequest["path"] = options.ImportPath;
            if (!instance.IsOwner)
            {
                using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(35));
                var reply = await instance.Send(launchRequest, deadline.Token);
                if (reply["ok"]?.GetValue<bool>() != true)
                    throw new TrayActionException(reply["code"]?.GetValue<string>() ?? "startup");
                Console.WriteLine(reply["deferred"]?.GetValue<bool>() == true ? "편집 상태를 보존했습니다. 가져온 테마는 목록에서 확인할 수 있습니다." : "기존 CoSkin 창으로 요청을 전달했습니다.");
                return 0;
            }
            if (options.Command == LaunchCommand.Quit) return 0;
            var port = options.Port?.ToString(System.Globalization.CultureInfo.InvariantCulture);
            var number = 0;
            if (port is not null && (!int.TryParse(port, out number) || number < 1024 || number > 65535))
                throw new InvalidDataException("포트 범위 오류");
            var bundle = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "renderer.js"));
            using var library = new Library(store);
            library.PickAssetStoragePath = initial => NativeFolderPicker.Pick(initial, UiLocale.Normalize(System.Globalization.CultureInfo.CurrentUICulture.Name) == "ko" ? "테마 전체 보관 폴더" : "Theme storage folder");
            var installed = WindowsInstaller.IsInstalledStore(library);
            if (installed) library.SetStartup = enabled => new InstallationService(store, new WindowsInstallationPlatform()).SetStartup(enabled);
            var sessions = new ConcurrentDictionary<string, Cdp>();
            var requests = new ConcurrentDictionary<long, Task>();
            var replies = new RendererReplies();
            long nextRequest = 0;
#if COSKIN_INTEGRATION
            IntegrationWindows = () => sessions.Values.ToArray();
#endif
            const int exitCode = 0;
            int? verifiedProcess = null;
            string? verifiedAppVersion = null;
            var nativeWindows = new ConcurrentDictionary<string, IntPtr>();
            var lastVisibility = new ConcurrentDictionary<string, bool>();
            var lastPlaying = new ConcurrentDictionary<string, bool>();
            var capacity = new WindowCapacity();
            int? capacityOwner = null;
            var uncertainWindows = new HashSet<string>(StringComparer.Ordinal);
            var discoveredWindows = 0;
            var detachedRetryAfter = new Dictionary<string, DateTimeOffset>();
            var sessionId = Guid.NewGuid().ToString("N");
            using var stop = new CancellationTokenSource();
            NativeRendererSession? nativeSession = null;
#if COSKIN_INTEGRATION
            IntegrationMain = () => nativeSession?.Main;
#endif
            var nativeDiscovery = new NativeConnectionDiscovery(store, options.CodexProcess);
            using var connectionSignal = new ResidentConnectionSignal(store, options.Port, async token =>
            {
                if (NativeAttachment.Available && await nativeDiscovery.Find(token) is int nativePort) return nativePort;
                if (options.CodexProcess is not null || !File.Exists(Path.Combine(store, "managed-connection.json"))) return null;
                return await WindowsLauncher.ManagedConnection(store, await WindowsLauncher.Discover());
            }, () => nativeDiscovery.RetryPending);
            async Task LaunchOrAttach()
            {
                nativeDiscovery.Retry();
                if (NativeAttachment.Available && await nativeDiscovery.Find(stop.Token) is int attached) number = attached;
                else number = await WindowsLauncher.Launch(store, false);
                verifiedProcess = null; connectionSignal.Connected(number); connectionSignal.Wake();
            }
            using var tray = new TrayController(library, await library.TrayState(), () => sessions.Values.ToArray(),
                (renderer, request) => ExecuteRequest(renderer, library, request, () => sessions.Values.ToArray()), () => stop.Cancel(), LaunchOrAttach,
                async renderer =>
                {
                    var targetId = sessions.FirstOrDefault(pair => ReferenceEquals(pair.Value, renderer)).Key;
                    if (targetId is not null && nativeWindows.TryGetValue(targetId, out var handle))
                        NativeWindow.Activate(handle, verifiedProcess ?? 0);
                    await renderer.Send("Page.bringToFront");
                }, connectionSignal.Wake);
            await tray.Ready;
            await using var updates = new UpdateCoordinator(library, () => sessions.Values.ToArray(), () => stop.Cancel(), installed);
            instance.Start((command, cancellationToken) => ExternalRequest(command, number, library, () => sessions.Values.ToArray(), cancellationToken, LaunchOrAttach, requested => { number = requested; verifiedProcess = null; connectionSignal.RequestPort(requested); return Task.CompletedTask; }, () =>
            {
                var preferences = library.Preferences.Read();
                return new JsonObject { ["connectedPid"] = verifiedProcess, ["targetPid"] = options.CodexProcess, ["windows"] = sessions.Count, ["port"] = number,
                    ["maxConnectedWindows"] = preferences.MaxConnectedWindows, ["maxPlayingWindows"] = preferences.MaxPlayingWindows,
                    ["playingWindows"] = lastPlaying.Count(pair => pair.Value), ["playbackLimitDeferred"] = lastPlaying.Count(pair => pair.Value) > preferences.MaxPlayingWindows,
                    ["waitingWindows"] = Math.Max(0, discoveredWindows - sessions.Count), ["connectionLimitDeferred"] = sessions.Count > preferences.MaxConnectedWindows };
            }, () => { _ = Task.Run(async () => { await Task.Delay(250); stop.Cancel(); }); }));
            var initialLaunch = await ResidentLaunch.Try(options.Command == LaunchCommand.Coupled, library.Preferences.Read(), async () => { await LaunchOrAttach(); return number; });
            if (initialLaunch.Port is int launchedPort)
            {
                number = launchedPort;
                connectionSignal.Connected(number);
            }
            if (initialLaunch.Error is Exception launchError)
            {
                Console.Error.WriteLine(launchError);
                tray.ReportConnectionFailure(launchError);
            }
            var initialImport = options.Command == LaunchCommand.Import;
            var heartbeatPump = Task.Run(async () =>
            {
                using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10));
                try
                {
                    while (await timer.WaitForNextTickAsync(stop.Token))
                        await RendererNotifications.Broadcast(sessions.Values.ToArray(), "window.__coskin?.heartbeat()",
                            (window, error) => DiagnosticLog.Record("renderer-heartbeat-deferred", error, reason: "id=" + window.RendererId));
                }
                catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
            });
            Console.CancelKeyPress += (_, e) => { e.Cancel = true; stop.Cancel(); };
            Console.WriteLine("CoSkin 연결을 기다립니다. 종료하려면 Ctrl+C를 누르세요.");
            while (!stop.IsCancellationRequested)
            {
                try
                {
                    if (number == 0)
                    {
                        tray.RefreshDetection();
                        var discoveryClock = System.Diagnostics.Stopwatch.StartNew();
                        number = await connectionSignal.FindReadyPort(stop.Token) ?? 0;
                        if (number == 0)
                        {
                            await connectionSignal.Wait(stop.Token);
                            continue;
                        }
                        DiagnosticLog.Record("endpoint-ready", elapsedMs: discoveryClock.ElapsedMilliseconds);
                    }
                    var owner = NativeWindow.ListenerProcess(number);
                    if (verifiedProcess != owner)
                    {
                        var executable = NativeWindow.VerifyExecutable(owner);
                        var installation = nativeDiscovery.VerifiedInstallation(owner, number) ?? await WindowsLauncher.VerifyRunning(executable);
                        verifiedAppVersion = installation.AppVersion;
                        verifiedProcess = owner;
                        DiagnosticLog.Record("connected", targetPid: owner, reason: nativeDiscovery.VerifiedConnection(owner, number) is null ? "renderer-cdp" : "authenticated-pipe");
                        tray.WatchVerifiedProcess(owner);
                        if (capacityOwner != owner)
                        {
                            nativeWindows.Clear(); lastVisibility.Clear(); lastPlaying.Clear();
                            uncertainWindows.Clear(); capacity = new WindowCapacity(); capacityOwner = owner;
                        }
                    }
                    var list = JsonNode.Parse(await Http.GetStringAsync($"http://127.0.0.1:{number}/json/list", stop.Token))!.AsArray();
                    if (list.Any(target => target?["type"]?.GetValue<string>() == "node"))
                        throw new InvalidDataException("Node 디버거 연결은 사용할 수 없습니다. CoSkin 직접 연결로 다시 시도하세요.");
                    if (list.Any(target => target?["type"]?.GetValue<string>() == "coskin-native"))
                    {
                        if (nativeSession is null)
                        {
                            nativeSession = new NativeRendererSession();
                            await nativeSession.Initialize(nativeDiscovery.VerifiedConnection(owner, number) ?? throw new InvalidDataException("검증된 CoSkin 연결이 아닙니다."));
                            library.OpenAssetMedia = nativeSession.OpenMedia;
                            library.ReleaseAssetMedia = nativeSession.ReleaseMedia;
                        }
                        list = await nativeSession.List();
                    }
                    var supported = list.Where(target => target?["type"]?.GetValue<string>() == "page" && CodexPageContract.Supports(target?["url"]?.GetValue<string>())).ToArray();
                    var alive = supported.Select(target => target!["id"]!.GetValue<string>()).ToHashSet(StringComparer.Ordinal);
                    discoveredWindows = alive.Count;
                    foreach (var ended in uncertainWindows.Where(id => !alive.Contains(id)).ToArray())
                    {
                        uncertainWindows.Remove(ended); lastPlaying.TryRemove(ended, out _);
                        replies.Forget(owner + ":" + ended);
                    }
                    var candidates = new List<WindowCandidate>();
                    foreach (var target in supported)
                    {
                        var id = target!["id"]!.GetValue<string>();
                        var available = !detachedRetryAfter.TryGetValue(id, out var retryAt) || retryAt <= DateTimeOffset.UtcNow;
                        var protectedWindow = false;
                        if (uncertainWindows.Contains(id)) { protectedWindow = true; available = false; }
                        if (sessions.TryGetValue(id, out var connected))
                        {
                            if (!available) protectedWindow = true;
                            else try { protectedWindow = (await connected.Evaluate("window.__coskin?.connectionProtected() === true", TimeSpan.FromSeconds(2)))?.GetValue<bool>() == true; }
                            catch (Exception error) when (CodexPageContract.IsRecoverableRendererFailure(target["url"]?.GetValue<string>(), error, nativeSession?.Main.IsClosed == true))
                            {
                                DiagnosticLog.Record("renderer-retry", error, reason: "id=" + id + ";step=capacity-state");
                                detachedRetryAfter[id] = DateTimeOffset.UtcNow.AddSeconds(30);
                                // A lost reply does not prove that the window or its video stopped.
                                // Keep its connection and playback reservation until closure is confirmed.
                                protectedWindow = true;
                                available = false;
                            }
                        }
                        if (nativeSession is not null) nativeWindows[id] = NativeWindow.RendererWindow(owner, target);
                        nativeWindows.TryGetValue(id, out var handle);
                        candidates.Add(new(id, NativeWindow.Visible(handle, owner), NativeWindow.Focused(handle, owner), sessions.ContainsKey(id) || uncertainWindows.Contains(id), protectedWindow, available));
                    }
                    foreach (var stale in sessions.Keys.Where(id => !alive.Contains(id)).ToArray())
                    {
                        if (sessions.TryRemove(stale, out var ended)) await ended.DisposeAsync();
                        nativeWindows.TryRemove(stale, out _);
                        lastVisibility.TryRemove(stale, out _);
                        lastPlaying.TryRemove(stale, out _);
                        detachedRetryAfter.Remove(stale);
                        replies.Forget(owner + ":" + stale);
                        DiagnosticLog.Record("renderer-removed", reason: "id=" + stale);
                    }
                    var limits = library.Preferences.Read();
                    var plan = capacity.Select(candidates, limits.MaxConnectedWindows, limits.MaxPlayingWindows);
                    foreach (var candidate in candidates.Where(candidate => candidate.Connected && !plan.Connected.Contains(candidate.Id)).ToArray())
                    {
                        if (!sessions.TryGetValue(candidate.Id, out var previous)) continue;
                        try
                        {
                            // The renderer checks again atomically, so a new draft between polling and release cannot be lost.
                            if ((await previous.Evaluate("window.__coskin?.tryReleaseConnection() ?? true", TimeSpan.FromSeconds(2)))?.GetValue<bool>() != true)
                            {
                                var index = candidates.FindIndex(item => item.Id == candidate.Id);
                                candidates[index] = candidate with { Protected = true };
                                continue;
                            }
                            sessions.TryRemove(candidate.Id, out _);
                            await previous.DisposeAsync();
                            lastVisibility.TryRemove(candidate.Id, out _);
                            lastPlaying.TryRemove(candidate.Id, out _);
                            replies.Forget(owner + ":" + candidate.Id);
                            DiagnosticLog.Record("renderer-capacity-release", reason: "id=" + candidate.Id);
                        }
                        catch (Exception error) when (CodexPageContract.IsRecoverableRendererFailure(supported.First(target => target!["id"]!.GetValue<string>() == candidate.Id)!["url"]?.GetValue<string>(), error, nativeSession?.Main.IsClosed == true))
                        {
                            // If release cannot be confirmed, retain ownership and stop its motion instead of attaching a duplicate.
                            var index = candidates.FindIndex(item => item.Id == candidate.Id);
                            candidates[index] = candidate with { Protected = true };
                            DiagnosticLog.Record("renderer-capacity-release-deferred", error, reason: "id=" + candidate.Id);
                        }
                    }
                    candidates = candidates.Select(candidate => candidate with { Connected = sessions.ContainsKey(candidate.Id) || uncertainWindows.Contains(candidate.Id) }).ToList();
                    plan = capacity.Select(candidates, limits.MaxConnectedWindows, limits.MaxPlayingWindows);
                    // Pause the previous budget first; starting the next window must not briefly exceed the playback limit.
                    foreach (var previous in sessions.Where(pair => lastPlaying.GetValueOrDefault(pair.Key) && !plan.Playing.Contains(pair.Key)))
                    {
                        try
                        {
                            await previous.Value.Evaluate("window.__coskin?.pauseMotion(true)", TimeSpan.FromSeconds(2));
                            lastPlaying[previous.Key] = false;
                        }
                        catch (Exception error) when (CodexPageContract.IsRecoverableRendererFailure(supported.First(target => target!["id"]!.GetValue<string>() == previous.Key)!["url"]?.GetValue<string>(), error, nativeSession?.Main.IsClosed == true))
                        {
                            // A timed-out pause is not counted as released playback capacity.
                            DiagnosticLog.Record("renderer-playback-pause-deferred", error, reason: "id=" + previous.Key);
                        }
                    }
                    var initializedThisPass = false;
                    foreach (var target in supported)
                    {
                        var pageUrl = target?["url"]?.GetValue<string>();
                        if (target?["type"]?.GetValue<string>() != "page" || !CodexPageContract.Supports(pageUrl))
                            continue;
                        var id = target["id"]!.GetValue<string>();
                        if (!plan.Connected.Contains(id)) continue;
                        if (detachedRetryAfter.TryGetValue(id, out var retryAfter) && retryAfter > DateTimeOffset.UtcNow)
                            continue;
                        var rendererClock = System.Diagnostics.Stopwatch.StartNew();
                        var newlyConnected = false;
                        Cdp? pendingSession = null;
                        var rendererStage = "attach";
                        alive.Add(id);
                        try
                        {
                            if (!sessions.TryGetValue(id, out var cdp))
                            {
                                if ((sessions.Count >= limits.MaxConnectedWindows && !uncertainWindows.Contains(id)) || initializedThisPass) continue;
                                newlyConnected = true;
                                if (nativeSession is not null) cdp = new Cdp(nativeSession.Main, int.Parse(id, System.Globalization.CultureInfo.InvariantCulture));
                                else
                                {
                                    var uri = new Uri(target["webSocketDebuggerUrl"]!.GetValue<string>());
                                    if (uri.Host != "127.0.0.1" || uri.Port != number || uri.Scheme != "ws" || uri.UserInfo.Length != 0)
                                        throw new InvalidDataException("잘못된 연결 주소");
                                    cdp = new Cdp();
                                    pendingSession = cdp;
                                    await cdp.Connect(uri);
                                }
                                pendingSession = cdp;
                                var current = cdp;
                                var requestOwner = owner;
                                var replyTarget = requestOwner + ":" + id;
                                cdp.Event += message => {
                                    if (message["method"]?.GetValue<string>() != "Runtime.bindingCalled" || message["params"]?["name"]?.GetValue<string>() != "__coskinRequest") return;
                                    var requestNumber = Interlocked.Increment(ref nextRequest);
                                    var pending = Handle(current, library, message["params"]!["payload"]!.GetValue<string>(), sessionId, () => sessions.Values.ToArray(),
                                        replies, replyTarget, () => capacityOwner == requestOwner && sessions.TryGetValue(id, out var active) ? active : null, stop.Token);
                                    requests[requestNumber] = pending;
                                    _ = pending.ContinueWith(completed => { requests.TryRemove(requestNumber, out _); }, TaskScheduler.Default);
                                };
                                await cdp.Send("Runtime.enable");
                                await cdp.Send("Runtime.addBinding", new JsonObject { ["name"] = "__coskinRequest" });
                                sessions[id] = cdp;
                                pendingSession = null;
                            }
                            if (newlyConnected)
                            {
                                rendererStage = "metadata";
                                await cdp.Evaluate("window.__coskinNativeMotionPaused=true;window.__coskinNativeSuspended=true;window.__coskin?.pauseMotion(true);window.__coskin?.suspend(true);window.__coskinHostVersion=" + System.Text.Json.JsonSerializer.Serialize(verifiedAppVersion) + ";window.__coskinEngineVersion=" + System.Text.Json.JsonSerializer.Serialize(ProductVersion.Display.Split('+')[0]));
                                lastPlaying[id] = false;
                                await cdp.Evaluate("window.__coskinSessionId=" + System.Text.Json.JsonSerializer.Serialize(sessionId) + ";if(window.__coskin)window.__coskin.sessionId=window.__coskinSessionId");
                                var appLanguage = (await cdp.Evaluate("document.documentElement.lang || navigator.language"))?.GetValue<string>();
                                await library.Handle(new JsonObject { ["op"] = "runtime-locale", ["locale"] = UiLocale.Normalize(appLanguage) }, _ => Task.CompletedTask, (_, _) => Task.CompletedTask);
                            }
                            var status = await cdp.Evaluate("Boolean(window.__coskin)", TimeSpan.FromSeconds(2));
                            var needsInjection = status?.GetValue<bool>() != true;
                            if (needsInjection)
                            {
                                if (initializedThisPass) continue;
                                initializedThisPass = true;
                                rendererStage = "initialize";
                                await cdp.Evaluate("window.__coskinSessionId=" + System.Text.Json.JsonSerializer.Serialize(sessionId));
                                await cdp.Evaluate(bundle, TimeSpan.FromSeconds(5));
                                await RendererReadiness.Wait((expression, timeout) => cdp.Evaluate(expression, timeout), TimeSpan.FromSeconds(10));
                                if (await cdp.Evaluate("Boolean(window.__coskin)") is not JsonValue ready || !ready.GetValue<bool>())
                                    throw new InvalidDataException("화면 초기화를 완료하지 못했습니다.");
                                Console.WriteLine("Codex 창에 CoSkin 테마스킨 목록을 연결했습니다.");
                            }
                            if (newlyConnected || needsInjection)
                                DiagnosticLog.Record("renderer-ready", elapsedMs: rendererClock.ElapsedMilliseconds, reason: "id=" + id + ";page=" + (CodexPageContract.IsDetached(pageUrl) ? "detached" : "main"));
                            rendererStage = "heartbeat";
                            await cdp.Evaluate("window.__coskin?.heartbeat()", TimeSpan.FromSeconds(2));
                            rendererStage = "pending-response";
                            await replies.Deliver(owner + ":" + id, (function, arguments) => cdp.Invoke(function, arguments, TimeSpan.FromSeconds(2)));
                            if (!nativeWindows.TryGetValue(id, out var window) || window == IntPtr.Zero)
                            {
                                if (nativeSession is not null) window = NativeWindow.RendererWindow(owner, target!);
                                else
                                {
                                    var geometry = (await cdp.Evaluate("({x:screenX,y:screenY,width:outerWidth,height:outerHeight})"))?.AsObject();
                                    window = geometry is null ? IntPtr.Zero : NativeWindow.MatchWindow(owner, geometry);
                                }
                                nativeWindows[id] = window;
                            }
                            var nativeVisible = NativeWindow.Visible(window, owner);
                            rendererStage = "visibility";
                            if (window == IntPtr.Zero)
                            {
                                await cdp.Evaluate("window.__coskin?.pauseMotion(true);window.__coskin?.suspend(false)", TimeSpan.FromSeconds(2));
                                lastPlaying[id] = false;
                                continue;
                            }
                            var playing = nativeVisible && plan.Playing.Contains(id) &&
                                (lastPlaying.GetValueOrDefault(id) || lastPlaying.Count(pair => pair.Value) < limits.MaxPlayingWindows);
                            if (newlyConnected || needsInjection || !lastPlaying.TryGetValue(id, out var previousPlaying) || previousPlaying != playing)
                            {
                                if (playing) lastPlaying[id] = true; // Reserve before sending an effect whose reply may be lost.
                                await cdp.Evaluate("window.__coskin?.pauseMotion(" + (playing ? "false" : "true") + ")", TimeSpan.FromSeconds(2));
                                if (!playing) lastPlaying[id] = false;
                            }
                            if (newlyConnected || needsInjection || !lastVisibility.TryGetValue(id, out var previousVisible) || previousVisible != nativeVisible)
                                await cdp.Evaluate("window.__coskin?.suspend(" + (nativeVisible ? "false" : "true") + ")", TimeSpan.FromSeconds(2));
                            lastVisibility[id] = nativeVisible;
                            lastPlaying[id] = playing;
                            uncertainWindows.Remove(id);
                            detachedRetryAfter.Remove(id);
                        }
                        catch (Exception error) when (CodexPageContract.IsRecoverableRendererFailure(pageUrl, error, nativeSession?.Main.IsClosed == true))
                        {
                            DiagnosticLog.Record("renderer-retry", error, elapsedMs: rendererClock.ElapsedMilliseconds, reason: "id=" + id + ";step=" + rendererStage + ";page=" + (CodexPageContract.IsDetached(pageUrl) ? "detached" : "main"));
                            detachedRetryAfter[id] = DateTimeOffset.UtcNow.AddSeconds(30);
                            var closedTarget = error.Message.Contains("target closed while handling command", StringComparison.Ordinal);
                            if (closedTarget || !sessions.ContainsKey(id))
                            {
                                try
                                {
                                    if (sessions.TryRemove(id, out var failed)) await failed.DisposeAsync();
                                    if (pendingSession is not null) await pendingSession.DisposeAsync();
                                }
                                catch (Exception cleanupError) { DiagnosticLog.Record("renderer-cleanup", cleanupError, reason: "id=" + id); }
                                nativeWindows.TryRemove(id, out _);
                                lastPlaying.TryRemove(id, out _);
                                uncertainWindows.Remove(id);
                                replies.Forget(owner + ":" + id);
                            }
                            lastVisibility.TryRemove(id, out _);
                        }
                    }
                    foreach (var missing in detachedRetryAfter.Keys.Where(id => !list.Any(target => target?["id"]?.GetValue<string>() == id)).ToArray())
                        detachedRetryAfter.Remove(missing);
                    connectionSignal.Connected(number);
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
                catch (Exception ex) when (ex is InvalidDataException or TrayActionException)
                {
                    DiagnosticLog.Record("connection-blocked", ex);
                    connectionSignal.Block();
                    nativeDiscovery.Invalidate();
                    Console.Error.WriteLine("연결을 중지했습니다. 테마스킨 목록은 보존합니다. " + ex.Message);
                    uncertainWindows.UnionWith(sessions.Keys);
                    foreach (var session in sessions.Values)
                        await session.DisposeAsync();
                    sessions.Clear();
                    library.OpenAssetMedia = null; library.ReleaseAssetMedia = null;
                    if (nativeSession is not null) { await nativeSession.DisposeAsync(); nativeSession = null; }
                    verifiedProcess = null;
                    number = 0;
                    try
                    {
                        await connectionSignal.Wait(stop.Token);
                    }
                    catch (OperationCanceledException) { break; }
                    continue;
                }
                catch (Exception ex)
                {
                    DiagnosticLog.Record("connection-recovery", ex);
                    connectionSignal.BeginRecovery(number);
                    nativeDiscovery.Invalidate();
                    Console.Error.WriteLine("연결 대기: " + ex.Message);
                    uncertainWindows.UnionWith(sessions.Keys);
                    foreach (var session in sessions.Values)
                        await session.DisposeAsync();
                    sessions.Clear();
                    library.OpenAssetMedia = null; library.ReleaseAssetMedia = null;
                    if (nativeSession is not null) { await nativeSession.DisposeAsync(); nativeSession = null; }
                    verifiedProcess = null;
                    number = 0;
                    try
                    {
                        await connectionSignal.Wait(stop.Token);
                    }
                    catch (OperationCanceledException) { break; }
                    continue;
                }
                try
                {
                    await Task.Delay(2000, stop.Token);
                }
                catch (OperationCanceledException) { break; }
            }
            stop.Cancel();
            try { await heartbeatPump.WaitAsync(TimeSpan.FromSeconds(3)); }
            catch (TimeoutException) { DiagnosticLog.Record("renderer-heartbeat-cleanup-pending"); }
            await instance.StopServer();
            foreach (var cdp in sessions.Values)
            {
                try
                {
                    await cdp.Evaluate("window.__coskin?.dispose()");
                }
                catch (Exception ex) { Console.Error.WriteLine("복원 확인 실패: " + ex.Message); }
            }
            try { await Task.WhenAll(requests.Values).WaitAsync(TimeSpan.FromSeconds(2)); }
            catch (TimeoutException) { DiagnosticLog.Record("request-cleanup-pending"); }
            foreach (var cdp in sessions.Values) await cdp.DisposeAsync();
            if (nativeSession is not null) await nativeSession.DisposeAsync();
            DiagnosticLog.Record("exit");
            return exitCode;
        }
        catch (Exception ex)
        {
            DiagnosticLog.Record("startup-failure", ex);
            Console.Error.WriteLine(ex);
            ApplicationNotice.Failure(ex);
            return 1;
        }
    }
    private static async Task<JsonObject> ExternalRequest(JsonObject command, int port, Library library, Func<Cdp[]> windows, CancellationToken cancellationToken, Func<Task>? launch = null, Func<int, Task>? requestPort = null, Func<JsonObject>? connectionStatus = null, Action? quit = null)
    {
        if (command.Any(pair => pair.Key is not ("op" or "path" or "port" or "codexPid")))
            throw new InvalidDataException("지원하지 않는 실행 요청 필드입니다.");
        if (command["codexPid"] is not null && connectionStatus is not null)
        {
            var requestedPid = command["codexPid"]!.GetValue<int>();
            var status = connectionStatus();
            if (requestedPid <= 0 || (status["targetPid"]?.GetValue<int>() ?? status["connectedPid"]?.GetValue<int>()) != requestedPid)
                throw new InvalidDataException("실행 중인 CoSkin의 대상 Codex와 요청한 프로세스가 다릅니다.");
        }
        if (command["op"]?.GetValue<string>() == "open" && command["port"] is not null && port == 0 && requestPort is not null)
        {
            var requested = command["port"]!.GetValue<int>();
            if (requested < 1024 || requested > 65535)
                throw new InvalidDataException("연결 포트 범위 오류");
            await requestPort(requested);
            return new JsonObject { ["ok"] = true, ["waiting"] = true };
        }
        if (command["port"] is not null && command["port"]!.GetValue<int>() != port)
            throw new InvalidDataException("이 저장소는 다른 Codex 창에 연결되어 있습니다.");
        var operation = JsonContract.String(command, "op");
        if (operation == "quit" && quit is not null)
        {
            foreach (var window in windows()) await window.Evaluate("window.__coskin?.persistDraftForExit()");
            quit();
            return new JsonObject { ["ok"] = true };
        }
        if (operation == "health")
        {
            var health = connectionStatus?.Invoke() ?? new JsonObject();
            health["ok"] = true; health["pid"] = Environment.ProcessId; health["version"] = ProductVersion.Display;
            return health;
        }
        if (operation is not ("open" or "import" or "launch"))
            throw new InvalidDataException("지원하지 않는 실행 요청입니다.");
        if (operation == "launch")
        {
            if (launch is null)
                throw new InvalidDataException("실행 요청을 처리할 수 없습니다.");
            await launch();
            return new JsonObject { ["ok"] = true, ["waiting"] = true };
        }
        if (operation == "open" && windows().Length == 0)
            return new JsonObject { ["ok"] = true, ["waiting"] = true };
        var file = operation == "import" ? await ImportFile.Read(JsonContract.String(command, "path"), cancellationToken) : null;
        if (windows().Length == 0)
            throw new TrayActionException("not-connected");
        Cdp? renderer = null;
        while (renderer is null)
        {
            cancellationToken.ThrowIfCancellationRequested();
            renderer = await RendererSelection.MainShell(windows());
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
            await RendererNotifications.Broadcast(windows(), "window.__coskin?.receiveSummary(" + summary.ToJsonString() + ")",
                (window, error) => DiagnosticLog.Record("summary-notification-failure", error, reason: "id=" + window.RendererId));
        }
        try
        {
            var opened = await renderer.Evaluate("window.__coskin.openLibrary()");
            return new JsonObject { ["ok"] = true, ["deferred"] = opened?.GetValue<bool>() != true };
        }
        catch (Exception error) when (file is not null)
        {
            // Import is already committed. Opening a closing window cannot undo it.
            DiagnosticLog.Record("import-interface-deferred", error, reason: "id=" + renderer.RendererId);
            return new JsonObject { ["ok"] = true, ["deferred"] = true };
        }
    }
    private static async Task<JsonNode> ExecuteRequest(Cdp cdp, Library library, JsonObject request, Func<Cdp[]> windows)
    {
        return await library.Handle(request,
                async doc => { await cdp.Evaluate("window.__coskinValidate(" + doc.ToJsonString() + ")"); },
                async (bytes, mime) =>
                {
                    var openMedia = library.OpenAssetMedia;
                    var releaseMedia = library.ReleaseAssetMedia;
                    // Validation must obey the same CSP admission as playback.
                    // A connected pipe can offer HTTP media even when this renderer forbids it.
                    var directMedia = openMedia is not null && releaseMedia is not null &&
                        (await cdp.Evaluate("window.__coskinDirectMediaAvailable === true"))?.GetValue<bool>() == true;
                    if (directMedia)
                    {
                        var temporaryDirectory = Path.Combine(Path.GetTempPath(), "coskin-media-validation-" + Guid.NewGuid().ToString("N"));
                        var temporaryFile = Path.Combine(temporaryDirectory, "media.bin");
                        JsonObject? source = null;
                        Directory.CreateDirectory(temporaryDirectory);
                        try
                        {
                            await File.WriteAllBytesAsync(temporaryFile, bytes);
                            var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)).ToLowerInvariant();
                            source = await openMedia!(temporaryFile, mime, bytes.LongLength, hash);
                            await cdp.Evaluate("window.__coskinDecodeURL(" + source.ToJsonString() + ")", TimeSpan.FromMinutes(5));
                        }
                finally
                        {
                            if (source?["token"]?.GetValue<string>() is string mediaToken)
                                try { await releaseMedia!(mediaToken); } catch { }
                            if (File.Exists(temporaryFile)) File.Delete(temporaryFile);
                            Directory.Delete(temporaryDirectory);
                        }
                        return;
                    }
                    var token = library.StageTransfer(bytes, TransferStore.LargeChunkBytes);
                    try
                    {
                        var transfer = new JsonObject { ["token"] = token, ["length"] = bytes.Length, ["chunkBytes"] = TransferStore.LargeChunkBytes };
                        await cdp.Evaluate("window.__coskinDecode(" + transfer.ToJsonString() + "," + System.Text.Json.JsonSerializer.Serialize(mime) + ")", TimeSpan.FromMinutes(5));
                    }
                    finally { library.CancelTransfer(token); }
                },
                async (next, previous) =>
                {
                    var participants = windows();
                    try
                    {
                        foreach (var window in participants)
                            await window.Evaluate("window.__coskin.prepare(" + next.ToJsonString() + ")", TimeSpan.FromMinutes(5));
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
    private static async Task Handle(Cdp cdp, Library library, string payload, string sessionId, Func<Cdp[]> windows,
        RendererReplies replies, string replyTarget, Func<Cdp?> currentWindow, CancellationToken shuttingDown)
    {
        string? requestId = null;
        var operationCompleted = false;
        async Task DeliverReply()
        {
            var active = currentWindow();
            if (active is null || active.IsClosed || shuttingDown.IsCancellationRequested) return;
            await replies.Deliver(replyTarget, (function, arguments) => active.Invoke(function, arguments, TimeSpan.FromSeconds(2)));
        }
        async Task CompleteReply(JsonNode? value, JsonNode? error)
        {
            if (replies.TryEnqueue(replyTarget, requestId!, value, error))
            {
                await DeliverReply();
                return;
            }
            // Existing responses remain intact. Still try the newly completed
            // response directly rather than leaving a healthy caller busy.
            DiagnosticLog.Record("response-backlog-capacity", reason: "id=" + cdp.RendererId);
            var active = currentWindow();
            if (active is not null && !active.IsClosed && !shuttingDown.IsCancellationRequested)
                await active.Invoke(RendererReplies.ResponseFunction,
                    new JsonArray(JsonValue.Create(requestId), value?.DeepClone(), error?.DeepClone()), TimeSpan.FromSeconds(2));
        }
        try
        {
            var request = JsonContract.Read(System.Text.Encoding.UTF8.GetBytes(payload), 4 * 1024 * 1024);
            requestId = JsonContract.String(request, "requestId");
            if (request["sessionId"]?.GetValue<string>() != sessionId || request["contractVersion"]?.GetValue<int>() != 1)
                throw new InvalidDataException("연결 계약 오류");
            var result = await ExecuteRequest(cdp, library, request, windows);
            operationCompleted = true;
            try
            {
                await CompleteReply(result, null);
            }
            finally
            {
                if (request["op"]?.GetValue<string>() == "runtime-settings-write")
                    try
                    {
                        await RendererNotifications.Broadcast(windows(), "window.__coskin?.receiveRuntimeSettings(" + result.ToJsonString() + ")",
                            (window, error) => DiagnosticLog.Record("settings-notification-failure", error, reason: "id=" + window.RendererId));
                    }
                    catch (Exception error) { DiagnosticLog.Record("settings-notification-failure", error, reason: "id=" + cdp.RendererId); }
                if (request["op"]?.GetValue<string>() is "create" or "save" or "import" or "apply" or "disable" or "enable" or "inherit" or "delete" or "motion-policy" or "organization-write" or "organization-batch" or "group-write" or "group-delete")
                    try
                    {
                        var summary = await library.Handle(new JsonObject { ["op"] = "list" }, _ => Task.CompletedTask, (_, _) => Task.CompletedTask);
                        await RendererNotifications.Broadcast(windows(), "window.__coskin?.receiveSummary(" + summary.ToJsonString() + ")",
                            (window, error) => DiagnosticLog.Record("summary-notification-failure", error, reason: "id=" + window.RendererId));
                    }
                    catch (Exception error) { DiagnosticLog.Record("summary-notification-failure", error, reason: "id=" + cdp.RendererId); }
            }
        }
        catch (Exception ex)
        {
            if (operationCompleted)
            {
                DiagnosticLog.Record("completed-request-delivery-failure", ex, reason: "id=" + cdp.RendererId);
                return;
            }
            if (shuttingDown.IsCancellationRequested) return;
            var failure = Failure.Describe(ex);
            Console.Error.WriteLine($"{failure.Code}: {ex}");
            if (requestId is not null)
                try
                {
                    await CompleteReply(null, new JsonObject { ["code"] = failure.Code, ["message"] = failure.Message, ["line"] = failure.Line, ["column"] = failure.Column });
                }
                catch (Exception reply) { Console.Error.WriteLine("요청 응답 실패: " + reply.Message); }
        }
    }
}
