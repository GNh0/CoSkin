using System.Diagnostics;
namespace CoSkin;

internal sealed class NativeConnectionDiscovery(string store, int? requestedProcess = null)
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<(int Pid, long Started), int> failures = [];
    private readonly SemaphoreSlim gate = new(1, 1);
    internal async Task<int?> Find(CancellationToken token)
    {
        await gate.WaitAsync(token);
        try
        {
        foreach (var id in ResidentDetection.OriginalProcesses().Where(id => requestedProcess is null || id == requestedProcess).Order())
        {
            token.ThrowIfCancellationRequested();
            using var process = Process.GetProcessById(id);
            var key = (id, process.StartTime.ToUniversalTime().Ticks);
            if (failures.GetValueOrDefault(key) >= 3) continue;
            try { return await NativeAttachment.Open(store, id, token); }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                DiagnosticLog.Record("native-attachment", error);
                failures[key] = error is InvalidDataException or TrayActionException ? 3 : failures.GetValueOrDefault(key) + 1;
                Console.Error.WriteLine("Codex 독립 연결 대기: " + error.Message);
            }
        }
        return null;
        }
        finally { gate.Release(); }
    }
    internal void Retry() => failures.Clear();
}
