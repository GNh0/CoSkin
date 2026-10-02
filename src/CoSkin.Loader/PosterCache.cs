using System.Buffers.Binary;
using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;

namespace CoSkin;

/// <summary>Disposable PNG previews only. Original assets and theme revisions are never changed.</summary>
internal sealed class PosterCache
{
    internal const int MaxPosterBytes = 4 * 1024 * 1024;
    internal const int MaxDimension = 1600;
    internal const long MaxCacheBytes = 128L * 1024 * 1024;
    internal const string DirectoryName = ".coskin-posters-v1";
    private static readonly object Gate = new(); // Also serialize separate instances for the same media folder.
    private static readonly Regex Hash = new("^[a-f0-9]{64}$", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly Regex PosterName = new("^[a-f0-9]{64}\\.png$", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly Regex TemporaryName = new("^[a-f0-9]{64}\\.poster-[a-f0-9]{32}\\.tmp$", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly uint[] CrcTable = BuildCrcTable();
    private readonly string directory;
    private readonly long budget;

    internal PosterCache(string assetRoot, long budgetBytes = MaxCacheBytes)
    {
        if (string.IsNullOrWhiteSpace(assetRoot) || assetRoot.Length > 2048 || assetRoot.Any(char.IsControl) ||
            !Path.IsPathFullyQualified(assetRoot) || assetRoot.StartsWith("\\\\?\\", StringComparison.Ordinal) ||
            assetRoot.StartsWith("\\\\.\\", StringComparison.Ordinal) || assetRoot.IndexOf(':', 2) >= 0)
            throw new InvalidDataException("미리보기 캐시 경로 오류");
        if (budgetBytes <= 0 || budgetBytes > MaxCacheBytes) throw new ArgumentOutOfRangeException(nameof(budgetBytes));
        var root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(assetRoot));
        RejectLinks(root);
        if (File.Exists(root)) throw new InvalidDataException("미리보기 보관 위치는 폴더여야 합니다.");
        directory = Path.Combine(root, DirectoryName);
        RejectLinks(directory);
        if (File.Exists(directory)) throw new InvalidDataException("미리보기 캐시 위치에 파일이 있습니다.");
        budget = budgetBytes;
    }

    internal byte[]? Read(string hash)
    {
        lock (Gate)
        {
            var path = PathForHash(hash);
            if (!File.Exists(path)) return null;
            try
            {
                byte[] bytes;
                using (var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    if (input.Length is < 1 or > MaxPosterBytes) return null;
                    bytes = new byte[checked((int)input.Length)];
                    input.ReadExactly(bytes);
                }
                RejectLinks(path);
                ValidatePng(bytes);
                // A cache read keeps a frequently used poster without a metadata write on every card repaint.
                try
                {
                    if (DateTime.UtcNow - File.GetLastWriteTimeUtc(path) > TimeSpan.FromMinutes(15))
                        File.SetLastWriteTimeUtc(path, DateTime.UtcNow);
                }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException) { /* Read-only cache is still usable. */ }
                return bytes;
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidDataException)
            {
                return null; // Corrupt or unavailable derived cache is a miss, never loss of an original.
            }
        }
    }

    internal void Write(string hash, byte[] bytes)
    {
        lock (Gate)
        {
            var path = PathForHash(hash);
            ValidatePng(bytes);
            if (bytes.LongLength > budget) throw new InvalidDataException("미리보기 캐시 용량 제한");
            RejectLinks(directory);
            Directory.CreateDirectory(directory);
            RejectLinks(directory);
            if (Directory.Exists(path)) throw new InvalidDataException("미리보기 파일 위치에 폴더가 있습니다.");
            // Leave the old same-key poster intact until an atomic replacement has completed.
            Prune(bytes.LongLength, path);
            var temporary = Path.Combine(directory, Path.GetFileNameWithoutExtension(path) + ".poster-" + Guid.NewGuid().ToString("N") + ".tmp");
            try
            {
                RejectLinks(temporary);
                using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    output.Write(bytes);
                    output.Flush(true);
                }
                RejectLinks(path);
                RejectLinks(temporary);
                File.Move(temporary, path, overwrite: true);
                Prune(0, path);
            }
            finally
            {
                RejectLinks(temporary);
                if (File.Exists(temporary)) File.Delete(temporary); // Only this instance's uniquely created cache temp.
            }
        }
    }

    private string PathForHash(string hash)
    {
        if (hash is null || !Hash.IsMatch(hash)) throw new InvalidDataException("미리보기 자산 해시 오류");
        var path = Path.GetFullPath(Path.Combine(directory, hash.ToLowerInvariant() + ".png"));
        if (!path.StartsWith(directory + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("미리보기 캐시 경로 오류");
        RejectLinks(path);
        return path;
    }

    private void Prune(long incomingBytes, string protectedPath)
    {
        RejectLinks(directory);
        var posters = new List<FileInfo>();
        foreach (var path in Directory.EnumerateFileSystemEntries(directory))
        {
            var name = Path.GetFileName(path);
            if (!PosterName.IsMatch(name) && !TemporaryName.IsMatch(name)) continue;
            RejectLinks(path);
            if (Directory.Exists(path)) continue;
            var file = new FileInfo(path);
            if (TemporaryName.IsMatch(name))
            {
                if (DateTime.UtcNow - file.LastWriteTimeUtc > TimeSpan.FromDays(1)) File.Delete(path);
                continue;
            }
            posters.Add(file);
        }
        // Atomic-write temporaries are bounded to one PNG; the durable poster set stays within the total budget.
        var used = posters.Sum(file => file.Length);
        var replaced = posters.FirstOrDefault(file => string.Equals(file.FullName, protectedPath, StringComparison.OrdinalIgnoreCase));
        if (incomingBytes > 0 && replaced is not null) used -= replaced.Length;
        foreach (var file in posters.OrderBy(file => file.LastWriteTimeUtc).ThenBy(file => file.Name, StringComparer.Ordinal))
        {
            if (used + incomingBytes <= budget) break;
            if (string.Equals(file.FullName, protectedPath, StringComparison.OrdinalIgnoreCase)) continue;
            RejectLinks(file.FullName);
            File.Delete(file.FullName);
            used -= file.Length;
        }
        if (used + incomingBytes > budget) throw new IOException("미리보기 캐시 용량을 확보하지 못했습니다.");
    }

    private static void RejectLinks(string candidate)
    {
        for (var path = candidate; path is not null; path = Path.GetDirectoryName(path))
        {
            FileAttributes attributes;
            try { attributes = File.GetAttributes(path); }
            catch (FileNotFoundException) { continue; }
            catch (DirectoryNotFoundException) { continue; }
            if (attributes.HasFlag(FileAttributes.ReparsePoint)) throw new InvalidDataException("미리보기 캐시 경로에 파일 연결을 사용할 수 없습니다.");
        }
    }

    private static void ValidatePng(byte[] bytes)
    {
        if (bytes is null || bytes.Length is < 57 or > MaxPosterBytes ||
            !bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }))
            throw new InvalidDataException("미리보기는 4MB 이하 정적 PNG여야 합니다.");
        var header = false; var ended = false; var data = false; var dataEnded = false; var palette = false;
        uint width = 0, height = 0; byte depth = 0, color = 0;
        using var compressed = new MemoryStream();
        for (var offset = 8; offset < bytes.Length;)
        {
            if (bytes.Length - offset < 12) throw new InvalidDataException("미리보기 PNG 청크 오류");
            var count = BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset, 4));
            if (count > bytes.Length - offset - 12) throw new InvalidDataException("미리보기 PNG 청크 오류");
            var length = checked((int)count);
            var type = Encoding.ASCII.GetString(bytes, offset + 4, 4);
            if (type.Any(c => c is not (>= 'a' and <= 'z') and not (>= 'A' and <= 'Z')) ||
                Crc(bytes.AsSpan(offset + 4, length + 4)) != BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset + length + 8, 4)))
                throw new InvalidDataException("미리보기 PNG 체크섬 오류");
            var payload = bytes.AsSpan(offset + 8, length);
            if (!header && type != "IHDR") throw new InvalidDataException("미리보기 PNG 헤더 오류");
            switch (type)
            {
                case "IHDR":
                    if (header || length != 13) throw new InvalidDataException("미리보기 PNG 헤더 오류");
                    header = true; width = BinaryPrimitives.ReadUInt32BigEndian(payload); height = BinaryPrimitives.ReadUInt32BigEndian(payload[4..]);
                    depth = payload[8]; color = payload[9];
                    if (width is 0 or > MaxDimension || height is 0 or > MaxDimension || payload[10] != 0 || payload[11] != 0 || payload[12] != 0 ||
                        !(color switch { 0 => depth is 1 or 2 or 4 or 8 or 16, 2 or 4 or 6 => depth is 8 or 16, 3 => depth is 1 or 2 or 4 or 8, _ => false }))
                        throw new InvalidDataException("미리보기 PNG 해상도·형식 제한");
                    break;
                case "PLTE":
                    if (data || palette || length is < 3 or > 768 || length % 3 != 0) throw new InvalidDataException("미리보기 PNG 팔레트 오류");
                    palette = true;
                    break;
                case "IDAT":
                    if (dataEnded || (color == 3 && !palette)) throw new InvalidDataException("미리보기 PNG 영상 데이터 오류");
                    data = true; compressed.Write(payload);
                    break;
                case "IEND":
                    if (!data || length != 0 || offset + 12 != bytes.Length) throw new InvalidDataException("미리보기 PNG 끝 오류");
                    ended = true;
                    break;
                default:
                    if (type == "acTL" || char.IsUpper(type[0])) throw new InvalidDataException("미리보기는 정적 PNG여야 합니다.");
                    if (data) dataEnded = true;
                    break;
            }
            offset += length + 12;
        }
        if (!ended || compressed.Length == 0) throw new InvalidDataException("미리보기 PNG 영상 데이터가 없습니다.");
        var channels = color switch { 0 or 3 => 1, 2 => 3, 4 => 2, 6 => 4, _ => throw new InvalidDataException("미리보기 PNG 색 형식 오류") };
        var rowBytes = checked((int)(((ulong)width * (uint)channels * depth + 7) / 8));
        var row = new byte[rowBytes];
        compressed.Position = 0;
        using var decoded = new ZLibStream(compressed, CompressionMode.Decompress);
        try
        {
            for (uint y = 0; y < height; y++)
            {
                var filter = decoded.ReadByte();
                if (filter is < 0 or > 4) throw new InvalidDataException("미리보기 PNG 픽셀 데이터 오류");
                decoded.ReadExactly(row);
            }
            if (decoded.ReadByte() != -1) throw new InvalidDataException("미리보기 PNG 픽셀 크기 오류");
        }
        catch (EndOfStreamException error) { throw new InvalidDataException("미리보기 PNG 픽셀 데이터 오류", error); }
    }

    private static uint[] BuildCrcTable()
    {
        var table = new uint[256];
        for (uint index = 0; index < table.Length; index++)
        {
            var value = index;
            for (var bit = 0; bit < 8; bit++) value = (value & 1) != 0 ? 0xedb88320U ^ (value >> 1) : value >> 1;
            table[index] = value;
        }
        return table;
    }
    private static uint Crc(ReadOnlySpan<byte> bytes)
    {
        var value = uint.MaxValue;
        foreach (var b in bytes) value = CrcTable[(value ^ b) & 255] ^ (value >> 8);
        return value ^ uint.MaxValue;
    }
}
