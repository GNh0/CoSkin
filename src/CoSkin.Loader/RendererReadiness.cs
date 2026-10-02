using System.Diagnostics;
using System.Text.Json.Nodes;

namespace CoSkin;

internal static class RendererReadiness
{
    internal const string Expression = "window.__coskinReadyState || 'pending'";

    internal static async Task Wait(Func<string, TimeSpan, Task<JsonNode?>> evaluate, TimeSpan budget)
    {
        var clock = Stopwatch.StartNew();
        while (true)
        {
            var remaining = budget - clock.Elapsed;
            if (remaining <= TimeSpan.Zero) throw new TimeoutException("화면 초기화 시간이 초과되었습니다.");
            // Poll settled state without leaving a native command open for the whole startup promise.
            var state = (await evaluate(Expression, remaining < TimeSpan.FromSeconds(2) ? remaining : TimeSpan.FromSeconds(2)))?.GetValue<string>();
            if (state == "fulfilled") return;
            if (state == "rejected") throw new InvalidDataException("화면 초기화를 완료하지 못했습니다.");
            remaining = budget - clock.Elapsed;
            if (remaining <= TimeSpan.Zero) throw new TimeoutException("화면 초기화 시간이 초과되었습니다.");
            await Task.Delay(remaining < TimeSpan.FromMilliseconds(100) ? remaining : TimeSpan.FromMilliseconds(100));
        }
    }
}
