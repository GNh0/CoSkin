using System.Security.Cryptography;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
namespace CoSkin;

internal sealed record AssetStorageStatus(string CurrentPath, string DefaultPath, long UsedBytes, int AssetCount, bool IsDefault, bool Available)
{
    internal JsonObject Document() => new()
    {
        ["currentPath"] = CurrentPath, ["defaultPath"] = DefaultPath, ["usedBytes"] = UsedBytes,
        ["assetCount"] = AssetCount, ["isDefault"] = IsDefault, ["available"] = Available
    };
}

/// <summary>One shared media directory for all themes; library, revisions and settings stay in the base store.</summary>
internal sealed class AssetStorageLocation
{
    private static readonly Regex AssetName = new("^[a-f0-9]{64}\\.bin$", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private readonly RuntimePreferenceStore preferences;
    private readonly object gate = new();
    internal string DefaultPath { get; }
    internal string CurrentPath => Resolve(preferences.Read().AssetStoragePath);

    internal AssetStorageLocation(string storeRoot, RuntimePreferenceStore preferences)
    {
        DefaultPath = Path.Combine(Path.GetFullPath(storeRoot), "assets");
        this.preferences = preferences;
        RejectLinks(DefaultPath);
    }

    internal string? Normalize(string? requestedPath)
    {
        if (string.IsNullOrWhiteSpace(requestedPath)) return null;
        var value = requestedPath.Trim();
        if (value.Length > 2048 || value.Any(char.IsControl) || !Path.IsPathFullyQualified(value) ||
            value.StartsWith("\\\\?\\", StringComparison.Ordinal) || value.StartsWith("\\\\.\\", StringComparison.Ordinal) ||
            value.IndexOf(':', 2) >= 0)
            throw new InvalidDataException("테마 전체 보관 폴더의 절대 경로를 입력해 주세요.");
        var full = Path.TrimEndingDirectorySeparator(Path.GetFullPath(value));
        RejectLinks(full);
        if (File.Exists(full)) throw new InvalidDataException("테마 전체 보관 위치는 폴더여야 합니다.");
        return SamePath(full, DefaultPath) ? null : full;
    }

    private string Resolve(string? requestedPath)
    {
        var path = Normalize(requestedPath) ?? DefaultPath;
        RejectLinks(path);
        return path;
    }

    internal string PathForHash(string hash)
    {
        if (!Regex.IsMatch(hash, "^[a-f0-9]{64}$", RegexOptions.CultureInvariant))
            throw new InvalidDataException("자산 해시 오류");
        var path = Path.Combine(CurrentPath, hash + ".bin");
        RejectLinks(path);
        return path;
    }

    internal AssetStorageStatus Describe()
    {
        var path = CurrentPath;
        return Describe(path);
    }
    internal AssetStorageStatus Describe(RuntimePreferences snapshot) => Describe(Resolve(snapshot.AssetStoragePath));
    private AssetStorageStatus Describe(string path)
    {
        var files = Assets(path);
        return new(path, DefaultPath, files.Sum(file => new FileInfo(file).Length), files.Length,
            SamePath(path, DefaultPath), Directory.Exists(path) || SamePath(path, DefaultPath));
    }

    /// <summary>The caller must hold the Library asset-write gate during migration and preference commit.</summary>
    internal AssetStorageStatus Change(RuntimePreferences expected, RuntimePreferences requested)
    {
        lock (gate)
        {
            if (preferences.Read() != expected)
                throw new InvalidDataException("설정이 변경되었습니다. 현재 설정을 다시 확인해 주세요.");
            var next = requested with { AssetStoragePath = Normalize(requested.AssetStoragePath) };
            var source = Resolve(expected.AssetStoragePath);
            var destination = Resolve(next.AssetStoragePath);
            if (!SamePath(source, destination))
            {
                if (!Directory.Exists(source) && expected.AssetStoragePath is not null)
                    throw new DirectoryNotFoundException("현재 테마 전체 보관 폴더를 찾을 수 없습니다.");
                var files = Assets(source);
                RejectLinks(destination);
                Directory.CreateDirectory(destination);
                RejectLinks(destination);
                foreach (var file in files)
                {
                    var hash = Path.GetFileNameWithoutExtension(file).ToLowerInvariant();
                    Verify(file, hash);
                    CopyVerified(file, Path.Combine(destination, hash + ".bin"), hash);
                }
                if (!files.SequenceEqual(Assets(source), StringComparer.OrdinalIgnoreCase))
                    throw new InvalidDataException("복사 중 테마 파일 목록이 변경되었습니다. 다시 시도해 주세요.");
                // Recheck source and target before changing the pointer. Originals and completed copies are retained on failure.
                foreach (var file in files)
                {
                    var hash = Path.GetFileNameWithoutExtension(file).ToLowerInvariant();
                    Verify(file, hash);
                    Verify(Path.Combine(destination, hash + ".bin"), hash);
                }
            }
            var status = Describe(destination);
            preferences.CommitAssetStorage(expected, next);
            return status;
        }
    }

    /// <summary>Picker selection is only a draft; this handler never changes preferences or copies files.</summary>
    internal JsonObject Handle(JsonObject request, Func<string?, string?>? pickFolder = null)
    {
        switch (JsonContract.String(request, "op"))
        {
            case "asset-storage-read":
                JsonContract.Fields(request, "op");
                return Describe().Document();
            case "asset-storage-pick":
                JsonContract.Fields(request, "op", "initialPath");
                if (pickFolder is null) throw new InvalidDataException("폴더 선택을 사용할 수 없습니다. 경로를 직접 입력해 주세요.");
                var initial = request["initialPath"]?.GetValue<string>();
                string initialDirectory;
                try { initialDirectory = Resolve(initial); }
                catch (Exception error) when (error is InvalidDataException or ArgumentException or NotSupportedException) { initialDirectory = CurrentPath; }
                var selected = pickFolder(initialDirectory);
                return selected is null ? new JsonObject { ["path"] = null, ["cancelled"] = true }
                    : new JsonObject { ["path"] = Resolve(selected), ["cancelled"] = false };
            default:
                throw new InvalidDataException("지원하지 않는 테마 보관 폴더 요청입니다.");
        }
    }

    private static string[] Assets(string directory)
    {
        RejectLinks(directory);
        if (!Directory.Exists(directory)) return [];
        return Directory.EnumerateFileSystemEntries(directory).Where(path => AssetName.IsMatch(Path.GetFileName(path)))
            .Select(path => { RejectLinks(path); if (Directory.Exists(path)) throw new InvalidDataException("자산 파일 이름과 같은 폴더가 있습니다."); return path; })
            .Order(StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static void CopyVerified(string source, string destination, string hash)
    {
        RejectLinks(destination);
        if (Directory.Exists(destination)) throw new InvalidDataException("자산 파일 이름과 같은 폴더가 있습니다.");
        if (File.Exists(destination)) { Verify(destination, hash); return; }
        var temporary = destination + ".coskin-copy-" + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            RejectLinks(source);
            using (var input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None))
            {
                input.CopyTo(output);
                output.Flush(true);
                output.Position = 0;
                if (Hash(output) != hash) throw new InvalidDataException("복사한 테마 파일의 SHA256이 원본과 일치하지 않습니다.");
            }
            RejectLinks(destination);
            try { File.Move(temporary, destination, false); }
            catch (IOException) when (File.Exists(destination)) { Verify(destination, hash); }
            Verify(destination, hash);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }

    private static void Verify(string path, string hash)
    {
        RejectLinks(path);
        using var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (Hash(file) != hash) throw new InvalidDataException("테마 파일의 SHA256이 일치하지 않습니다. 기존 파일과 설정을 보존했습니다.");
    }
    private static string Hash(Stream stream) => Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    private static bool SamePath(string a, string b) => string.Equals(Path.TrimEndingDirectorySeparator(a), Path.TrimEndingDirectorySeparator(b), StringComparison.OrdinalIgnoreCase);
    private static void RejectLinks(string candidate)
    {
        for (var path = candidate; path is not null; path = Path.GetDirectoryName(path))
        {
            FileAttributes attributes;
            try { attributes = File.GetAttributes(path); }
            catch (FileNotFoundException) { continue; }
            catch (DirectoryNotFoundException) { continue; }
            if (attributes.HasFlag(FileAttributes.ReparsePoint))
                throw new InvalidDataException("테마 보관 경로에 파일 연결을 사용할 수 없습니다.");
        }
    }
}
