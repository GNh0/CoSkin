using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Text.Json.Nodes;
namespace CoSkin;

internal sealed record ThemePackage(JsonObject Manifest, JsonObject Theme, Dictionary<string, byte[]> Files, string Hash);
internal static partial class Package
{
    internal const long MaxPackage = 768L * 1024 * 1024, MaxExpanded = 768L * 1024 * 1024;
    [GeneratedRegex("^[a-z0-9_./-]{1,240}$")] private static partial Regex PathPattern();
    [GeneratedRegex("^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\\.|$)")] private static partial Regex Reserved();
    internal static bool SafePath(string p) => PathPattern().IsMatch(p) && (p is "manifest.json" or "theme.json" || p.StartsWith("assets/", StringComparison.Ordinal) || p.StartsWith("preview/", StringComparison.Ordinal)) && p.Split('/').All(s => s.Length > 0 && s is not "." and not ".." && !s.EndsWith('.') && !Reserved().IsMatch(s));
    internal static string Hash(byte[] data) => Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant();
    internal static ThemePackage Read(byte[] data)
    {
        if (data.LongLength > MaxPackage)
            throw new InvalidDataException("패키지 크기 제한을 초과했습니다.");
        using var input = new MemoryStream(data);
        using var zip = new ZipArchive(input, ZipArchiveMode.Read);
        var files = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
        long total = 0;
        if (zip.Entries.Count > 512)
            throw new InvalidDataException("파일 개수 제한을 초과했습니다.");
        foreach (var entry in zip.Entries)
        {
            if (entry.FullName.EndsWith('/'))
                throw new InvalidDataException("디렉터리 항목은 지원하지 않습니다.");
            if (!SafePath(entry.FullName) || files.ContainsKey(entry.FullName))
                throw new InvalidDataException("패키지 경로가 잘못되었거나 중복됩니다.");
            if ((entry.ExternalAttributes >> 16 & 0xF000) == 0xA000)
                throw new InvalidDataException("심볼릭 링크를 허용하지 않습니다.");
            long limit = entry.FullName.EndsWith(".json", StringComparison.Ordinal) ? 2 * 1024 * 1024
                : Path.GetExtension(entry.FullName) is ".mp4" or ".webm" ? MediaLimits.VideoBytes : MediaLimits.ImageBytes;
            if (entry.Length > limit)
                throw new InvalidDataException("파일 크기 제한을 초과했습니다.");
            using var stream = entry.Open();
            using var output = new MemoryStream();
            var buffer = new byte[8192];
            int n;
            while ((n = stream.Read(buffer)) > 0)
            {
                total += n;
                if (total > MaxExpanded || output.Length + n > limit)
                    throw new InvalidDataException("압축 해제 제한을 초과했습니다.");
                output.Write(buffer, 0, n);
            }
            files.Add(entry.FullName, output.ToArray());
        }
        if (!files.TryGetValue("manifest.json", out var mb) || !files.TryGetValue("theme.json", out var tb))
            throw new InvalidDataException("manifest.json과 theme.json이 필요합니다.");
        var manifest = JsonContract.Read(mb);
        var theme = JsonContract.Read(tb);
        JsonContract.Fields(manifest, "format", "formatVersion", "id", "name", "version", "description", "author", "engine", "requirements", "entry", "defaultProfile", "preview", "files");
        if (JsonContract.String(manifest, "format") != "coskin.theme" || manifest["formatVersion"]?.GetValue<int>() != 1 || JsonContract.String(manifest, "entry") != "theme.json")
            throw new InvalidDataException("지원하지 않는 테마 형식입니다.");
        var id = JsonContract.String(manifest, "id");
        if (!Regex.IsMatch(id, "^[a-z0-9._-]{1,128}$"))
            throw new InvalidDataException("테마 ID 오류");
        foreach (var key in new[] { "version" })
            if (!Regex.IsMatch(JsonContract.String(manifest, key), "^[0-9]+\\.[0-9]+\\.[0-9]+$"))
                throw new InvalidDataException("버전 형식 오류");
        var declared = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "manifest.json" };
        foreach (var node in manifest["files"]?.AsArray() ?? throw new InvalidDataException("파일 목록이 필요합니다."))
        {
            var obj = node?.AsObject() ?? throw new InvalidDataException("파일 목록 오류");
            JsonContract.Fields(obj, "path", "bytes", "sha256");
            var p = JsonContract.String(obj, "path");
            if (!SafePath(p) || !declared.Add(p) || !files.TryGetValue(p, out var bytes) || obj["bytes"]?.GetValue<long>() != bytes.LongLength || JsonContract.String(obj, "sha256") != Hash(bytes))
                throw new InvalidDataException("파일 해시·목록 오류: " + p);
        }
        if (declared.Count != files.Count)
            throw new InvalidDataException("선언되지 않은 파일이 있습니다.");
        foreach (var p in files.Keys.Where(p => p.StartsWith("assets/", StringComparison.Ordinal) || p.StartsWith("preview/", StringComparison.Ordinal)))
        {
            if (files[p].LongLength > MediaLimits.Bytes(ImageProbe.Mime(files[p])))
                throw new InvalidDataException("미디어 파일 크기 제한을 초과했습니다.");
            ImageProbe.Validate(p, files[p]);
        }
        return new(manifest, theme, files, Hash(data));
    }
    internal static byte[] Export(JsonObject manifest, JsonObject theme, Dictionary<string, byte[]> assets)
    {
        var files = new SortedDictionary<string, byte[]>(StringComparer.Ordinal) { ["theme.json"] = System.Text.Encoding.UTF8.GetBytes(JsonContract.Serialize(theme)) };
        foreach (var p in assets)
            files.Add(p.Key, p.Value);
        manifest = (JsonObject)manifest.DeepClone();
        manifest["files"] = new JsonArray(files.Select(p => (JsonNode)new JsonObject { ["path"] = p.Key, ["bytes"] = p.Value.Length, ["sha256"] = Hash(p.Value) }).ToArray());
        files["manifest.json"] = System.Text.Encoding.UTF8.GetBytes(JsonContract.Serialize(manifest));
        using var output = new MemoryStream();
        using (var zip = new ZipArchive(output, ZipArchiveMode.Create, true))
        {
            foreach (var p in files)
            {
                var e = zip.CreateEntry(p.Key, CompressionLevel.NoCompression);
                e.LastWriteTime = new DateTimeOffset(1980, 1, 1, 0, 0, 0, TimeSpan.Zero);
                using var stream = e.Open();
                stream.Write(p.Value);
            }
        }
        var bytes = output.ToArray();
        Read(bytes);
        return bytes;
    }
}
