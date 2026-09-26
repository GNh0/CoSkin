using System.Diagnostics;
using System.Text.Json.Nodes;
namespace CoSkin;

internal sealed record UpdateTicket(string Directory, int OriginProcess, long OriginStarted, TrustedUpdate Update);
internal static class UpdateTickets
{
    internal static string Create(string store, string directory, TrustedUpdate update)
    {
        if (update.Manifest is null) throw new InvalidDataException("서명된 업데이트 안내가 필요합니다.");
        using var origin = Process.GetCurrentProcess();
        var value = new JsonObject
        {
            ["formatVersion"] = 1, ["originProcess"] = origin.Id,
            ["originStarted"] = origin.StartTime.ToUniversalTime().Ticks,
            ["created"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            ["manifest"] = Convert.ToBase64String(update.Manifest)
        };
        var path = Path.Combine(directory, "ticket.json");
        ValidatePath(store, path);
        using var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        var bytes = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(value);
        file.Write(bytes); file.Flush(true);
        return path;
    }
    internal static UpdateTicket Read(string store, string path, byte[] publisherKey)
    {
        ValidatePath(store, path);
        var info = new FileInfo(path);
        if (!info.Exists || info.Length is <= 0 or > 16 * 1024) throw new InvalidDataException("업데이트 요청 크기 오류");
        var value = JsonContract.Read(File.ReadAllBytes(path), 16 * 1024);
        JsonContract.Fields(value, "formatVersion", "originProcess", "originStarted", "created", "manifest");
        var age = DateTimeOffset.UtcNow.ToUnixTimeSeconds() - value["created"]!.GetValue<long>();
        var origin = value["originProcess"]!.GetValue<int>();
        var started = value["originStarted"]!.GetValue<long>();
        if (value["formatVersion"]?.GetValue<int>() != 1 || age is < -60 or > 600 || origin <= 0 || started <= 0)
            throw new InvalidDataException("업데이트 요청 수명 또는 원본 프로세스 오류");
        byte[] manifest;
        try { manifest = Convert.FromBase64String(JsonContract.String(value, "manifest")); }
        catch (FormatException error) { throw new InvalidDataException("업데이트 안내 형식 오류", error); }
        return new(Path.GetDirectoryName(Path.GetFullPath(path))!, origin, started, UpdateContract.Verify(manifest, publisherKey));
    }
    private static void ValidatePath(string store, string path)
    {
        var parent = Path.GetFullPath(Path.Combine(store, "updates"));
        var file = Path.GetFullPath(path);
        var directory = Path.GetDirectoryName(file)!;
        if (Path.GetDirectoryName(directory) != parent || !Guid.TryParseExact(Path.GetFileName(directory), "N", out _) || Path.GetFileName(file) != "ticket.json")
            throw new InvalidDataException("업데이트 요청 경로 오류");
        for (var current = file; current is not null; current = Path.GetDirectoryName(current))
            if ((File.Exists(current) || Directory.Exists(current)) && File.GetAttributes(current).HasFlag(FileAttributes.ReparsePoint))
                throw new InvalidDataException("업데이트 요청 경로에 파일 연결을 사용할 수 없습니다.");
    }
}
