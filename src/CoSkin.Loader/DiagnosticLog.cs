using System.Text.Json;
namespace CoSkin;

/// <summary>Bounded local diagnostics; no chat text, media or remote upload.</summary>
internal static class DiagnosticLog
{
    private static readonly object Gate = new();
    private static string store = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CoSkin");
    internal static void Configure(string directory) => store = Path.GetFullPath(directory);
    internal static void Record(string stage, Exception? error = null, int? requests = null, long? elapsedMs = null, int? targetPid = null, int? targetExitCode = null, string? reason = null)
    {
        try
        {
            lock (Gate)
            {
                var directory = Path.Combine(store, "diagnostics");
                for (var current = directory; current is not null; current = Path.GetDirectoryName(current))
                    if ((Directory.Exists(current) || File.Exists(current)) && File.GetAttributes(current).HasFlag(FileAttributes.ReparsePoint)) return;
                Directory.CreateDirectory(directory);
                var path = Path.Combine(directory, "resident.jsonl");
                var previous = path + ".previous";
                if (File.Exists(path) && File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint) || File.Exists(previous) && File.GetAttributes(previous).HasFlag(FileAttributes.ReparsePoint)) return;
                if (File.Exists(path) && new FileInfo(path).Length >= 256 * 1024) File.Move(path, previous, true);
                var entry = new { at = DateTimeOffset.UtcNow, pid = Environment.ProcessId, version = ProductVersion.Display, stage, type = error?.GetType().Name, code = error is null ? null : Failure.Describe(error).Code, hresult = error?.HResult, requests, elapsedMs, targetPid, targetExitCode, reason };
                File.AppendAllText(path, JsonSerializer.Serialize(entry) + "\n");
            }
        }
        catch (Exception failure) when (failure is IOException or UnauthorizedAccessException) { }
    }
}
