using CoSkin;
using System.Diagnostics;
using System.Text.Json.Nodes;

internal static class RendererReadinessTests
{
    internal static async Task Run(Action<bool, string> check)
    {
        using var commandGate = new SemaphoreSlim(1);
        var ready = false;
        var inspected = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var initialization = RendererReadiness.Wait(async (_, budget) =>
        {
            if (!await commandGate.WaitAsync(budget)) throw new TimeoutException();
            try { inspected.TrySetResult(); return JsonValue.Create(ready ? "fulfilled" : "pending"); }
            finally { commandGate.Release(); }
        }, TimeSpan.FromSeconds(2));
        await inspected.Task.WaitAsync(TimeSpan.FromSeconds(1));
        await commandGate.WaitAsync(TimeSpan.FromSeconds(1));
        try { ready = true; }
        finally { commandGate.Release(); }
        await initialization;
        check(ready, "초기화 대기 중에도 native 명령 경로를 해제해 startup host reply가 완료될 수 있음");
        try
        {
            await RendererReadiness.Wait((_, _) => Task.FromResult<JsonNode?>(JsonValue.Create("rejected")), TimeSpan.FromSeconds(1));
            check(false, "실패한 초기화 승인");
        }
        catch (InvalidDataException) { check(true, "초기화 rejection을 준비 완료로 잘못 승인하지 않음"); }
        var timer = Stopwatch.StartNew();
        try
        {
            await RendererReadiness.Wait((_, _) => Task.FromResult<JsonNode?>(JsonValue.Create("pending")), TimeSpan.FromMilliseconds(120));
            check(false, "영구 pending 초기화 승인");
        }
        catch (TimeoutException) { check(timer.Elapsed < TimeSpan.FromSeconds(1), "초기화 polling 전체 시간 예산 유지"); }
    }
}
