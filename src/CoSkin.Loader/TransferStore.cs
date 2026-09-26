namespace CoSkin;

/// <summary>Bounded, ordered temporary transfers. Tokens never resolve arbitrary paths.</summary>
internal sealed class TransferStore : IDisposable
{
    internal const int ChunkBytes = 24 * 1024;
    private const long BudgetBytes = 250L * 1024 * 1024;
    private readonly string root;
    private readonly Dictionary<string, Upload> uploads = new(StringComparer.Ordinal);
    private readonly object sync = new();
    private long reserved;
    private sealed record Upload(string Path, long Length, FileStream Stream)
    {
        internal DateTime Touched { get; set; } = DateTime.UtcNow;
    }

    internal TransferStore(string parent)
    {
        root = Path.Combine(Path.GetFullPath(parent), "transfers-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
    }

    internal string Begin(long length)
    {
        lock (sync)
        {
            Expire();
            if (length < 1 || length > 100L * 1024 * 1024 || uploads.Count >= 8 || reserved + length > BudgetBytes)
                throw new InvalidDataException("전송 크기 또는 동시 전송 제한을 초과했습니다.");
            var token = Guid.NewGuid().ToString("N");
            var path = Path.Combine(root, token);
            uploads.Add(token, new Upload(path, length, new FileStream(path, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None)));
            reserved += length;
            return token;
        }
    }

    internal void Append(string token, long offset, ReadOnlySpan<byte> bytes)
    {
        lock (sync)
        {
            var upload = Find(token);
            if (bytes.Length is < 1 or > ChunkBytes || offset != upload.Stream.Length || offset + bytes.Length > upload.Length)
                throw new InvalidDataException("전송 조각의 순서 또는 크기가 올바르지 않습니다.");
            upload.Stream.Write(bytes);
            upload.Touched = DateTime.UtcNow;
        }
    }

    internal byte[] Consume(string token)
    {
        lock (sync)
        {
            var upload = Find(token);
            if (upload.Stream.Length != upload.Length)
                throw new InvalidDataException("전송이 아직 완료되지 않았습니다.");
            upload.Stream.Flush();
            upload.Stream.Dispose();
            try
            {
                return File.ReadAllBytes(upload.Path);
            }
            finally { Remove(token, upload); }
        }
    }

    internal string Stage(ReadOnlySpan<byte> bytes)
    {
        var token = Begin(bytes.Length);
        try
        {
            for (var offset = 0; offset < bytes.Length; offset += ChunkBytes)
                Append(token, offset, bytes.Slice(offset, Math.Min(ChunkBytes, bytes.Length - offset)));
            return token;
        }
        catch { Cancel(token); throw; }
    }

    internal byte[] Read(string token, long offset)
    {
        lock (sync)
        {
            var upload = Find(token);
            if (upload.Stream.Length != upload.Length || offset < 0 || offset >= upload.Length)
                throw new InvalidDataException("다운로드 조각 위치가 올바르지 않습니다.");
            var bytes = new byte[(int)Math.Min(ChunkBytes, upload.Length - offset)];
            upload.Stream.Position = offset;
            upload.Stream.ReadExactly(bytes);
            upload.Touched = DateTime.UtcNow;
            return bytes;
        }
    }

    internal void Cancel(string token)
    {
        lock (sync)
            if (uploads.TryGetValue(token, out var upload))
                Remove(token, upload);
    }

    private Upload Find(string token)
    {
        Expire();
        return uploads.TryGetValue(token, out var value) ? value : throw new InvalidDataException("전송이 만료되었거나 취소되었습니다.");
    }
    private void Expire()
    {
        foreach (var entry in uploads.Where(entry => DateTime.UtcNow - entry.Value.Touched > TimeSpan.FromMinutes(2)).ToArray())
            Remove(entry.Key, entry.Value);
    }
    private void Remove(string token, Upload upload)
    {
        upload.Stream.Dispose();
        File.Delete(upload.Path);
        uploads.Remove(token);
        reserved -= upload.Length;
    }
    public void Dispose()
    {
        lock (sync)
        {
            foreach (var entry in uploads.ToArray())
                Remove(entry.Key, entry.Value);
            Directory.Delete(root);
        }
    }
}
