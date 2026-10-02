using System.Diagnostics;
namespace CoSkin;

internal sealed class NativeConnectionDiscovery(string store, int? requestedProcess = null)
{
    private sealed record AttemptFailure(int Count, bool Blocked, DateTimeOffset RetryAt);
    private readonly System.Collections.Concurrent.ConcurrentDictionary<(int Pid, long Started), AttemptFailure> failures = [];
    private readonly SemaphoreSlim gate = new(1, 1);
    private NativeConnection? verified;
    private volatile bool retryPending;
    internal bool RetryPending => retryPending;
    internal NativeConnection? VerifiedConnection(int processId, int port) => VerifiedInstallation(processId, port) is null ? null : Volatile.Read(ref verified);
    internal void Invalidate() => Volatile.Write(ref verified, null);
    internal CodexInstallation? VerifiedInstallation(int processId, int port)
    {
        var current = Volatile.Read(ref verified);
        if (current is null || current.ProcessId != processId || current.Port != port) return null;
        try
        {
            using var process = Process.GetProcessById(processId);
            return !process.HasExited && process.StartTime.ToUniversalTime().Ticks == current.Started ? current.Installation : null;
        }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception) { return null; }
    }
    internal async Task<int?> Find(CancellationToken token)
    {
        await gate.WaitAsync(token);
        try
        {
        retryPending = false;
        var current = Volatile.Read(ref verified);
        if (current is not null && VerifiedInstallation(current.ProcessId, current.Port) is not null && NativeWindow.ListenerProcess(current.Port) == current.ProcessId)
            return current.Port;
        foreach (var id in ResidentDetection.OriginalProcesses().Where(id => requestedProcess is null || id == requestedProcess).Order())
        {
            token.ThrowIfCancellationRequested();
            using var process = Process.GetProcessById(id);
            var key = (id, process.StartTime.ToUniversalTime().Ticks);
            var previous = failures.GetValueOrDefault(key);
            if (previous?.Blocked == true) continue;
            if (previous?.RetryAt > DateTimeOffset.UtcNow) { retryPending = true; continue; }
            try
            {
                var connection = await NativeAttachment.Open(store, id, token);
                Volatile.Write(ref verified, connection);
                retryPending = false;
                return connection.Port;
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                DiagnosticLog.Record("native-attachment", error);
                var blocked = error is InvalidDataException or TrayActionException;
                var count = (previous?.Count ?? 0) + 1;
                failures[key] = new(count, blocked, count >= 3 ? DateTimeOffset.UtcNow.AddSeconds(5) : DateTimeOffset.MinValue);
                if (!blocked) retryPending = true;
                Console.Error.WriteLine("Codex 독립 연결 대기: " + error.Message);
            }
        }
        return null;
        }
        finally { gate.Release(); }
    }
    internal void Retry() => failures.Clear();
}
