using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json.Nodes;
namespace CoSkin;

internal static class PipeTransportTests
{
    internal static async Task Run(Action<bool, string> check, string scratch, string? repositoryRoot = null, bool recoveryOnly = false)
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
