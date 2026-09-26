using System.IO.Compression;
using System.Security.Cryptography;
namespace CoSkin;

internal static class UpdateStaging
{
    private static readonly HashSet<string> Names = new(StringComparer.Ordinal) { "CoSkin.Loader.exe", "renderer.js", "THIRD-PARTY-NOTICES.txt" };
    internal static string Extract(string payloadPath, TrustedUpdate update, string root)
    {
        var parent = Path.GetFullPath(root);
        for (var current = parent; current is not null; current = Path.GetDirectoryName(current))
            if (Directory.Exists(current) && File.GetAttributes(current).HasFlag(FileAttributes.ReparsePoint))
                throw new InvalidDataException("업데이트 준비 경로가 안전하지 않습니다.");
        Directory.CreateDirectory(parent);
        var stage = Path.Combine(parent, "stage-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(stage);
        try
        {
            if (File.GetAttributes(payloadPath).HasFlag(FileAttributes.ReparsePoint))
                throw new InvalidDataException("업데이트 파일 연결을 사용할 수 없습니다.");
            using var file = new FileStream(payloadPath, FileMode.Open, FileAccess.Read, FileShare.Read);
            if (file.Length != update.Bytes || !Convert.ToHexString(SHA256.HashData(file)).Equals(update.Hash, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("업데이트 준비 전 무결성 검사에 실패했습니다.");
            file.Position = 0;
            using var archive = new ZipArchive(file, ZipArchiveMode.Read, true);
            if (archive.Entries.Count != Names.Count)
                throw new InvalidDataException("업데이트 배포 파일 구성이 다릅니다.");
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            long total = 0;
            foreach (var entry in archive.Entries)
            {
                if (!Names.Contains(entry.FullName) || !seen.Add(entry.FullName) || entry.Length <= 0 || ((entry.ExternalAttributes >> 16) & 0xf000) == 0xa000 || (entry.ExternalAttributes & 0x400) != 0)
                    throw new InvalidDataException("업데이트 경로 또는 파일 유형이 안전하지 않습니다.");
                total += entry.Length;
                if (total > UpdateContract.MaximumPayload || entry.Length > Math.Max(1, entry.CompressedLength) * 200)
                    throw new InvalidDataException("업데이트 압축 해제 제한을 초과했습니다.");
                var destination = Path.GetFullPath(Path.Combine(stage, entry.FullName));
                if (Path.GetDirectoryName(destination) != stage)
                    throw new InvalidDataException("업데이트 파일이 준비 경로를 벗어났습니다.");
                using var input = entry.Open();
                using var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None);
                var buffer = new byte[64 * 1024];
                long count = 0;
                int read;
                while ((read = input.Read(buffer)) > 0)
                {
                    count += read;
                    if (count > entry.Length)
                        throw new InvalidDataException("업데이트 압축 길이가 올바르지 않습니다.");
                    output.Write(buffer, 0, read);
                }
                if (count != entry.Length)
                    throw new InvalidDataException("업데이트 파일이 완전하지 않습니다.");
                output.Flush(true);
            }
            return stage;
        }
        catch
        {
            var checkedStage = Path.GetFullPath(stage);
            if (checkedStage.StartsWith(parent + Path.DirectorySeparatorChar + "stage-", StringComparison.OrdinalIgnoreCase))
                Directory.Delete(checkedStage, true);
            throw;
        }
    }
}
