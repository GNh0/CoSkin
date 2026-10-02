using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json.Nodes;
namespace CoSkin;

internal static class PipeTransportTests
{
    internal static async Task Run(Action<bool, string> check, string scratch, string? repositoryRoot = null, bool recoveryOnly = false, bool windowRecoveryOnly = false)
    {
        var repository = repositoryRoot ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"));
        var output = Path.Combine(scratch, "pipe-response.json");
        var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var nameId = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var start = new ProcessStartInfo("node") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true };
        foreach (var value in new[] { Path.Combine(repository, "tests/helpers/native-pipe-child.cjs"), Path.Combine(repository, "src/CoSkin.Loader/native-pipe-session.js"), Path.Combine(scratch, "pipe-request.json"), output, nonce, Environment.ProcessId.ToString(), nameId })
            start.ArgumentList.Add(value);
        using var child = Process.Start(start)!;
        var errors = child.StandardError.ReadToEndAsync();
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            while (!File.Exists(output) && !child.HasExited) await Task.Delay(20, timeout.Token);
            if (child.HasExited) throw new Exception("Owned Node fixture: " + await errors);
            var response = JsonNode.Parse(await File.ReadAllTextAsync(output))!.AsObject();
            var port = new Uri(response["url"]!.GetValue<string>()).Port;
            var connection = new NativeConnection(port, child.Id, child.StartTime.ToUniversalTime().Ticks,
                new CodexInstallation("test", "1.0.0.0", "1.0.0", scratch), response["pipeName"]!.GetValue<string>(), nonce);
            await using var main = new Cdp();
            await main.ConnectPipe(connection);
            await using var renderer = new Cdp(main, 1);
            if (windowRecoveryOnly)
            {
                await CheckWindowIsolation(main, renderer, check);
                return;
            }
            if (recoveryOnly)
            {
                await CheckInvocationRecovery(renderer, check);
                return;
            }
            check((await main.Send("CoSkin.list"))["targets"]!.AsArray().Count == 1, "인증된 실제 Node 파이프에서 .NET 창 목록 조회");
            var large = new string('가', 350000);
            check((await renderer.Evaluate(large))!.GetValue<string>() == large && !child.HasExited, ".NET/Electron 릴레이 형식의 1MB 파이프 왕복 검증");
            var typedLarge = large + "\n인자 안의 따옴표\"와 경로\\ 및 ${표현식}도 데이터입니다.";
            var typedArguments = new JsonArray { typedLarge };
            var typedResult = await renderer.Invoke("function(value) { return value; }", typedArguments);
            check(typedResult!.GetValue<string>() == typedLarge && System.Text.Encoding.UTF8.GetByteCount(typedLarge) > 1024 * 1024 && !child.HasExited,
                "실제 .NET Cdp.Invoke의 Runtime.callFunctionOn 1MB 한글 인자가 코드 문자열 없이 동일하게 왕복");
            check(ReferenceEquals(typedArguments[0]!.Parent, typedArguments) && typedArguments[0]!.GetValue<string>() == typedLarge,
                "typed 함수 인자 DeepClone이 호출자의 JsonNode 부모와 원본을 보존");
            var objectArgument = new JsonObject { ["name"] = "한글\n이름", ["count"] = 7, ["enabled"] = true,
                ["nested"] = new JsonArray { 1, "따옴표\"", null } };
            var objectResult = await renderer.Invoke("function(value, nothing, flag) { return {value, nothing, flag}; }",
                new JsonArray { objectArgument.DeepClone(), null, false });
            check(JsonNode.DeepEquals(objectResult?["value"], objectArgument) && objectResult?["nothing"] is null && objectResult?["flag"]?.GetValue<bool>() == false,
                "typed 함수의 객체·null·boolean 인자와 결과가 구조 그대로 왕복");
            var functionStats = await renderer.Evaluate("window-object-stats");
            check(functionStats?["windowEvaluations"]?.GetValue<int>() == 1 && functionStats?["functionCalls"]?.GetValue<int>() == 2,
                "연속 Invoke가 동일 실행 문맥의 window objectId를 한 번만 준비");
            var called = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            renderer.Event += _ => called.TrySetResult();
            var waiting = renderer.Evaluate("await-binding");
            await called.Task.WaitAsync(TimeSpan.FromSeconds(3));
            await renderer.Evaluate("reply-binding");
            check((await waiting)!.GetValue<string>() == "binding-resolved", "대기 중인 renderer 평가와 바인딩 응답이 교착 없이 동시 처리");
            var firstBinding = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var secondBinding = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            void TypedBinding(JsonObject message)
            {
                var payload = message["params"]?["payload"]?.GetValue<string>();
                if (payload is null) return;
                var key = JsonNode.Parse(payload)?["key"]?.GetValue<string>();
                if (key == "invoke-first") firstBinding.TrySetResult();
                if (key == "invoke-second") secondBinding.TrySetResult();
            }
            renderer.Event += TypedBinding;
            try
            {
                const string waitFunction = "function(key, value) { return this.__fixtureWait(key, value); }";
                const string replyFunction = "function(key) { return this.__fixtureReply(key); }";
                var first = renderer.Invoke(waitFunction, new JsonArray { "invoke-first", typedLarge });
                var second = renderer.Invoke(waitFunction, new JsonArray { "invoke-second", objectArgument.DeepClone() });
                await Task.WhenAll(firstBinding.Task, secondBinding.Task).WaitAsync(TimeSpan.FromSeconds(3));
                check((await renderer.Invoke(replyFunction, new JsonArray { "invoke-second" }))?.GetValue<bool>() == true &&
                    JsonNode.DeepEquals(await second, objectArgument) && !first.IsCompleted,
                    "동시 typed binding 둘 중 두 번째 응답이 먼저 도착해도 요청별 결과와 첫 번째 대기가 보존");
                check((await renderer.Invoke(replyFunction, new JsonArray { "invoke-first" }))?.GetValue<bool>() == true &&
                    (await first)?.GetValue<string>() == typedLarge && !child.HasExited,
                    "1MB typed Invoke가 binding reply Invoke와 교착 없이 동시 왕복");
            }
            finally { renderer.Event -= TypedBinding; }
            await CheckInvocationRecovery(renderer, check);
            await CheckInvocationBudget(main, renderer, check);
            await CheckRefreshIsolation(main, renderer, check);
            await CheckWindowIsolation(main, renderer, check);
            var pending = renderer.Evaluate("await-binding");
            await main.DisposeAsync();
            try { await pending; check(false, "연결 종료 취소"); }
            catch (Exception error) when (error is IOException or OperationCanceledException or ObjectDisposedException)
            { check(!child.HasExited, "미완료 파이프 요청 종료가 대상 프로세스를 종료하지 않음"); }
            await main.DisposeAsync();
        }
        finally
        {
            // This is the Node child created by this test, never a Codex process.
            if (!child.HasExited) { child.Kill(); await child.WaitForExitAsync(); }
            await errors;
        }
    }

    private static async Task CheckInvocationBudget(Cdp main, Cdp survivor, Action<bool, string> check)
    {
        const string echo = "function(value) { return value; }";
        await survivor.Evaluate("fixture-invoke-delays:120:120");
        await using (var compound = new Cdp(main, 1))
        {
            try { await compound.Invoke(echo, new JsonArray { "overall-budget" }, TimeSpan.FromMilliseconds(180)); check(false, "Invoke 전체 시간 예산"); }
            catch (TimeoutException) { check(!main.IsClosed, "window 준비와 함수 호출은 분리된 180ms가 아닌 전체 180ms 예산을 공유하며 전송은 유지"); }
        }
        await survivor.Evaluate("fixture-invoke-delays:240:0");
        await using (var locked = new Cdp(main, 1))
        {
            var first = locked.Invoke(echo, new JsonArray { "slow-window-preparation" });
            var wait = Stopwatch.StartNew();
            while ((await survivor.Evaluate("fixture-window-preparing"))?.GetValue<bool>() != true && wait.Elapsed < TimeSpan.FromSeconds(1)) await Task.Delay(5);
            check(wait.Elapsed < TimeSpan.FromSeconds(1), "느린 window 준비 중 function 잠금의 실제 경합 관측");
            try { await locked.Invoke(echo, new JsonArray { "short-waiter" }, TimeSpan.FromMilliseconds(50)); check(false, "function 잠금 시간 상한"); }
            catch (TimeoutException) { check(!main.IsClosed, "잠금을 기다리는 짧은 요청은 50ms에 실패하고 공유 연결·선행 요청은 보존"); }
            check((await first)?.GetValue<string>() == "slow-window-preparation", "짧은 요청 시간 초과 뒤 선행 함수의 결과 보존");
        }
        await survivor.Evaluate("fixture-invoke-delays:0:0");
        check((await survivor.Evaluate("after-budget-tests"))?.GetValue<string>() == "after-budget-tests", "함수 준비 예산 검사 후 정상 창의 응답 유지");
    }

    private static async Task CheckRefreshIsolation(Cdp main, Cdp survivor, Action<bool, string> check)
    {
        await survivor.Evaluate("fixture-enable-second-window");
        await using var secondary = new Cdp(main, 2);
        await survivor.Evaluate("fixture-refresh-second:deferred");
        var failures = new List<int>();
        check(await RendererRefresh.Request([secondary, survivor], (window, _) => failures.Add(window.RendererId)) == 2 && failures.Count == 0,
            "숨김 창의 예약 새로고침과 정상 창의 새로고침을 함께 성공으로 처리");
        await survivor.Evaluate("fixture-refresh-second:stalled");
        var timer = Stopwatch.StartNew();
        var refresh = RendererRefresh.Request([secondary, survivor], (window, _) => failures.Add(window.RendererId));
        var visibleWait = Stopwatch.StartNew();
        while ((await survivor.Evaluate("fixture-refresh-count"))?.GetValue<int>() != 2 && visibleWait.Elapsed < TimeSpan.FromSeconds(1))
            await Task.Delay(5);
        check(visibleWait.Elapsed < TimeSpan.FromSeconds(1) && !refresh.IsCompleted,
            "응답이 멈춘 창이 먼저 있어도 정상 창은 기다리지 않고 새로고침");
        check(await refresh == 1 && failures.SequenceEqual([2]) && timer.Elapsed < TimeSpan.FromSeconds(3),
            "새로고침의 창별 2초 시간 제한과 실패 격리");
        await survivor.Evaluate("fixture-refresh-second:not-ready");
        check(await RendererRefresh.Request([secondary, survivor], (window, _) => failures.Add(window.RendererId)) == 1,
            "아직 초기화되지 않은 창이 정상 창의 새로고침을 실패시키지 않음");
        await secondary.DisposeAsync();
        check(await RendererRefresh.Request([secondary, survivor], (window, _) => failures.Add(window.RendererId)) == 1 &&
            !main.IsClosed && (await survivor.Evaluate("after-refresh"))?.GetValue<string>() == "after-refresh",
            "종료된 창을 건너뛰며 공유 연결과 정상 창의 후속 응답 보존");
    }

    private static async Task CheckWindowIsolation(Cdp main, Cdp survivor, Action<bool, string> check)
    {
        const string mainUrl = "app://-/index.html";
        const string detachedUrl = "app://-/detached-window.html?initialRoute=%2Fdetached-window";
        await survivor.Evaluate("fixture-enable-second-window");
        check((await main.Send("CoSkin.list"))["targets"]!.AsArray().Count == 2, "실제 인증 파이프에 서로 다른 두 주 창 대상 연결");
        await using var disappearing = new Cdp(main, 2);
        await disappearing.Send("Runtime.enable");
        try
        {
            await disappearing.Evaluate("fixture-stalled-renderer", TimeSpan.FromMilliseconds(100));
            check(false, "응답 없는 한 창의 제한 시간");
        }
        catch (TimeoutException error)
        {
            check(CodexPageContract.IsRecoverableRendererFailure(mainUrl, error, main.IsClosed) &&
                CodexPageContract.IsRecoverableRendererFailure(detachedUrl, error, main.IsClosed),
                "주 창과 보조 창의 실제 100ms 타임아웃은 공유 연결이 살아 있으면 창 단위 복구");
        }
        check((await survivor.Evaluate("survivor-after-timeout"))?.GetValue<string>() == "survivor-after-timeout" && !main.IsClosed,
            "한 창 타임아웃 후 다른 창의 실제 응답과 공유 파이프 유지");
        var notificationFailures = new List<Exception>();
        var notificationClock = Stopwatch.StartNew();
        await RendererNotifications.Broadcast([disappearing, survivor], "fixture-stalled-renderer",
            (_, error) => notificationFailures.Add(error));
        check(notificationFailures.Count == 1 && notificationFailures[0] is TimeoutException && notificationClock.Elapsed < TimeSpan.FromSeconds(5) && !main.IsClosed,
            "응답 없는 창의 사후 알림은 실제 2초 상한에서 끝나고 다음 창·공유 연결을 유지");
        try
        {
            await disappearing.Evaluate("fixture-close-during-command");
            check(false, "명령 처리 중 닫힌 주 창");
        }
        catch (IOException error)
        {
            check(CodexPageContract.IsRecoverableRendererFailure(mainUrl, error, main.IsClosed),
                "목록 조회 후 평가 도중 닫힌 주 창의 실제 프로토콜 오류 격리");
        }
        var failures = new List<int>();
        await RendererNotifications.Broadcast([disappearing, survivor], "window.__coskin?.receiveSummary({})",
            (window, _) => failures.Add(window.RendererId));
        check(failures.SequenceEqual([2]) && (await survivor.Evaluate("fixture-summary-count"))?.GetValue<int>() == 1,
            "닫힌 다른 창의 요약 전달 실패 뒤에도 정상 창에 요약을 전달하며 저장 결과를 바꾸지 않음");
        await disappearing.DisposeAsync();
        check((await survivor.Evaluate("survivor-after-close"))?.GetValue<string>() == "survivor-after-close" && !main.IsClosed && !survivor.IsClosed,
            "실패한 창 정리 후 정상 창과 공유 연결 생존");
        foreach (var error in new Exception[] { new TimeoutException(), new IOException("target closed while handling command"), new ObjectDisposedException("window") })
            check(!CodexPageContract.IsRecoverableRendererFailure(mainUrl, error, sharedConnectionClosed: true),
                "공유 전송 자체의 종료는 창 단위 재시도로 숨기지 않음 " + error.GetType().Name);
        check(!CodexPageContract.IsRecoverableRendererFailure(mainUrl, new InvalidDataException("잘못된 연결 주소"), false) &&
            !CodexPageContract.IsRecoverableRendererFailure(mainUrl, new TrayActionException("validation"), false) &&
            !CodexPageContract.IsRecoverableRendererFailure("https://example.com", new TimeoutException(), false),
            "인증·검증 실패와 외부 문서의 기존 연결 차단 경계 보존");
    }

    private static async Task CheckInvocationRecovery(Cdp renderer, Action<bool, string> check)
    {
        const string echo = "function(value) { return value; }";
        await renderer.Invoke(echo, new JsonArray { "warm" });
        async Task<(int Windows, int Attempts, int Executions)> Counts()
        {
            var stats = await renderer.Evaluate("window-object-stats");
            return (stats!["windowEvaluations"]!.GetValue<int>(), stats["functionAttempts"]!.GetValue<int>(), stats["functionCalls"]!.GetValue<int>());
        }
        foreach (var kind in new[] { "object", "context" })
        {
            var before = await Counts();
            await renderer.Evaluate("fixture-protocol-failure:1:" + kind);
            var result = await renderer.Invoke(echo, new JsonArray { "recovered-" + kind });
            var after = await Counts();
            check(result?.GetValue<string>() == "recovered-" + kind && after.Windows - before.Windows == 1 &&
                after.Attempts - before.Attempts == 2 && after.Executions - before.Executions == 1,
                "stale " + kind + " protocol 오류는 window를 한 번 새로 얻어 함수 실제 실행 한 번으로 복구");
        }
        var repeatedBefore = await Counts();
        await renderer.Evaluate("fixture-protocol-failure:2:object");
        try
        {
            await renderer.Invoke(echo, new JsonArray { "must-not-execute" });
            check(false, "두 번째 stale 오류 실패 전달");
        }
        catch (IOException error) when (error.Message.Contains("Could not find object with given id", StringComparison.Ordinal))
        {
            check(true, "첫 복구 이후 두 번째 stale protocol 오류는 IOException으로 전달");
        }
        var repeatedAfter = await Counts();
        check(repeatedAfter.Windows - repeatedBefore.Windows == 1 && repeatedAfter.Attempts - repeatedBefore.Attempts == 2 &&
            repeatedAfter.Executions == repeatedBefore.Executions,
            "반복 stale 오류는 총 두 시도에서 멈추고 함수 실행·세 번째 재시도를 하지 않음");

        // The second failed context left a stale cached id; establish a fresh one
        // before measuring executed exceptions independently of that recovery.
        await renderer.Invoke(echo, new JsonArray { "warm-after-stale" });
        foreach (var message in new[] { "Could not find object with given id", "Cannot find context with specified id" })
        {
            var before = await Counts();
            try
            {
                await renderer.Invoke("function(message) { throw new Error(message); }", new JsonArray { message });
                check(false, "실행된 함수 exceptionDetails 전달");
            }
            catch (InvalidDataException error) when (error.Message.Contains(message, StringComparison.Ordinal))
            {
                check(true, "실행된 함수의 같은 stale 문구도 protocol 오류가 아닌 exceptionDetails로 전달");
            }
            var after = await Counts();
            check(after.Windows == before.Windows && after.Attempts - before.Attempts == 1 && after.Executions - before.Executions == 1,
                "실행 후 exceptionDetails는 함수 한 번 실행 뒤 끝나고 window 갱신·재실행은 0회");
        }
        var unrelatedBefore = await Counts();
        await renderer.Evaluate("fixture-protocol-failure:1:other");
        try
        {
            await renderer.Invoke(echo, new JsonArray { "unrelated" });
            check(false, "허용되지 않은 protocol 오류 전달");
        }
        catch (IOException error) when (error.Message.Contains("Unrelated debugger protocol failure", StringComparison.Ordinal))
        {
            check(true, "두 허용 문구 외의 protocol IOException은 재시도 없이 전달");
        }
        var unrelatedAfter = await Counts();
        check(unrelatedAfter.Windows == unrelatedBefore.Windows && unrelatedAfter.Attempts - unrelatedBefore.Attempts == 1 &&
            unrelatedAfter.Executions == unrelatedBefore.Executions,
            "일반 protocol 오류는 window 갱신·함수 실행·재시도를 하지 않음");
    }
}
