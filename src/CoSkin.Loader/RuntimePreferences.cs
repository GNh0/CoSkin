using System.Text.Json.Nodes;
namespace CoSkin;

internal sealed record RuntimePreferences(bool LaunchWithCodex = true, bool ExitWithCodex = false, bool AutomaticUpdates = false, bool StartAtSignIn = false, string? AssetStoragePath = null);

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
            var data = JsonContract.Read(File.ReadAllBytes(path), 16 * 1024);
            JsonContract.Fields(data, "formatVersion", "launchWithCodex", "exitWithCodex", "automaticUpdates", "startAtSignIn", "assetStoragePath");
            if (data["formatVersion"]?.GetValue<int>() != 1)
                throw new InvalidDataException("실행 설정 버전을 지원하지 않습니다.");
            try
            {
                return new(data["launchWithCodex"]!.GetValue<bool>(), data["exitWithCodex"]!.GetValue<bool>(), data["automaticUpdates"]?.GetValue<bool>() ?? false, data["startAtSignIn"]?.GetValue<bool>() ?? false,
                    ValidateAssetPath(data["assetStoragePath"]?.GetValue<string>()));
            }
            catch (Exception error) when (error is InvalidOperationException or NullReferenceException) { throw new InvalidDataException("실행 설정 형식이 올바르지 않습니다.", error); }
        }
    }
    internal void Write(RuntimePreferences preferences)
    {
        lock (gate)
        {
            if (!string.Equals(Read().AssetStoragePath, preferences.AssetStoragePath, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("테마 전체 보관 폴더는 파일 확인을 마친 뒤 변경할 수 있습니다.");
            WriteCore(preferences);
        }
    }
    /// <summary>Called only after the asset migration is verified; a concurrent preference change is never overwritten.</summary>
    internal void CommitAssetStorage(RuntimePreferences expected, RuntimePreferences preferences)
    {
        lock (gate)
        {
            if (Read() != expected)
                throw new InvalidDataException("설정이 변경되었습니다. 현재 설정을 다시 확인해 주세요.");
            WriteCore(preferences);
        }
    }
    private void WriteCore(RuntimePreferences preferences)
    {
        ValidateAssetPath(preferences.AssetStoragePath);
        RejectLink(path);
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            var data = new JsonObject { ["formatVersion"] = 1, ["launchWithCodex"] = preferences.LaunchWithCodex, ["exitWithCodex"] = preferences.ExitWithCodex, ["automaticUpdates"] = preferences.AutomaticUpdates, ["startAtSignIn"] = preferences.StartAtSignIn };
            if (preferences.AssetStoragePath is not null) data["assetStoragePath"] = preferences.AssetStoragePath;
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
    private static string? ValidateAssetPath(string? value)
    {
        if (value is not null && (value.Length is < 1 or > 2048 || value.Any(char.IsControl) || !Path.IsPathFullyQualified(value)))
            throw new InvalidDataException("테마 전체 보관 폴더의 절대 경로를 확인해 주세요.");
        return value;
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
