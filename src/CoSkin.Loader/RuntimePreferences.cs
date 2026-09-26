using System.Text.Json.Nodes;
namespace CoSkin;

internal sealed record RuntimePreferences(bool LaunchWithCodex = true, bool ExitWithCodex = true, bool AutomaticUpdates = false);

/// <summary>User lifecycle choices are independent of theme revisions and never control Codex shutdown.</summary>
internal sealed class RuntimePreferenceStore
{
    private readonly string path;
    private readonly object gate = new();
    internal RuntimePreferenceStore(string root)
    {
        var directory = Path.GetFullPath(root);
        Directory.CreateDirectory(directory);
        path = Path.Combine(directory, "runtime-preferences.json");
        RejectLink(directory);
    }
    internal RuntimePreferences Read()
    {
        lock (gate)
        {
            if (!File.Exists(path))
                return new();
            RejectLink(path);
            var data = JsonContract.Read(File.ReadAllBytes(path), 4096);
            JsonContract.Fields(data, "formatVersion", "launchWithCodex", "exitWithCodex", "automaticUpdates");
            if (data["formatVersion"]?.GetValue<int>() != 1)
                throw new InvalidDataException("실행 설정 버전을 지원하지 않습니다.");
            try
            {
                return new(data["launchWithCodex"]!.GetValue<bool>(), data["exitWithCodex"]!.GetValue<bool>(), data["automaticUpdates"]?.GetValue<bool>() ?? false);
            }
            catch (Exception error) when (error is InvalidOperationException or NullReferenceException) { throw new InvalidDataException("실행 설정 형식이 올바르지 않습니다.", error); }
        }
    }
    internal void Write(RuntimePreferences preferences)
    {
        lock (gate)
        {
            RejectLink(path);
            var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                var data = new JsonObject { ["formatVersion"] = 1, ["launchWithCodex"] = preferences.LaunchWithCodex, ["exitWithCodex"] = preferences.ExitWithCodex, ["automaticUpdates"] = preferences.AutomaticUpdates };
                using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    var bytes = System.Text.Encoding.UTF8.GetBytes(JsonContract.Serialize(data));
                    file.Write(bytes);
                    file.Flush(true);
                }
                File.Move(temporary, path, true);
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }
    }
    private static void RejectLink(string candidate)
    {
        for (var current = candidate; current is not null; current = Path.GetDirectoryName(current))
            if ((Directory.Exists(current) || File.Exists(current)) && File.GetAttributes(current).HasFlag(FileAttributes.ReparsePoint))
                throw new InvalidDataException("실행 설정 경로에 파일 연결을 사용할 수 없습니다.");
    }
}

/// <summary>Only verified targets count; one window closing cannot stop another connected process.</summary>
internal sealed class TargetLifetime
{
    private readonly object gate = new();
    private readonly HashSet<int> processes = [];
    private bool hadTarget;
    internal void Connected(int process)
    {
        if (process <= 0)
            throw new ArgumentOutOfRangeException(nameof(process));
        lock (gate)
        {
            processes.Add(process);
            hadTarget = true;
        }
    }
    internal bool Exited(int process, RuntimePreferences preferences)
    {
        lock (gate)
        {
            if (!processes.Remove(process))
                return false;
            return preferences.ExitWithCodex && hadTarget && processes.Count == 0;
        }
    }
}
