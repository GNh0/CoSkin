namespace CoSkin;

/// <summary>Bounded, ordered temporary transfers. Tokens never resolve arbitrary paths.</summary>
internal sealed class TransferStore : IDisposable
{
    internal const int ChunkBytes = 24 * 1024;
    internal const int LargeChunkBytes = 256 * 1024;
    private const long BudgetBytes = 1536L * 1024 * 1024;
    internal const int MaxOwnerTombstones = 4096;
    private static readonly TimeSpan TransferLifetime = TimeSpan.FromMinutes(2);
    private readonly string root;
    private readonly Dictionary<string, Upload> uploads = new(StringComparer.Ordinal);
    private readonly Dictionary<string, DateTime> canceledOwners = new(StringComparer.Ordinal);
    private readonly TimeProvider time;
    private readonly object sync = new();
    private long reserved;
    private sealed record Upload(string Path, long Length, int ChunkSize, FileStream Stream, string? Owner)
    {
        internal DateTime Touched { get; set; } = DateTime.UtcNow;
    }

    internal TransferStore(string parent, TimeProvider? time = null)
    {
        this.time = time ?? TimeProvider.System;
        root = Path.Combine(Path.GetFullPath(parent), "transfers-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
    }

    internal string Begin(long length, int chunkBytes = ChunkBytes, string? owner = null)
    {
        owner = NormalizeOwner(owner);
        lock (sync)
        {
            Expire();
            if (owner is not null && canceledOwners.ContainsKey(owner))
                throw new InvalidDataException("이 창의 전송 요청은 취소되었습니다.");
            if (length < 1 || length > Package.MaxPackage || uploads.Count >= 8 || reserved + length > BudgetBytes || chunkBytes is not (ChunkBytes or LargeChunkBytes))
                throw new InvalidDataException("전송 크기 또는 동시 전송 제한을 초과했습니다.");
            var token = Guid.NewGuid().ToString("N");
            var path = Path.Combine(root, token);
            uploads.Add(token, new Upload(path, length, chunkBytes,
                new FileStream(path, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None), owner) { Touched = UtcNow });
            reserved += length;
            return token;
        }
    }

    internal void Append(string token, long offset, ReadOnlySpan<byte> bytes)
    {
        lock (sync)
        {
            var upload = Find(token);
            if (bytes.Length < 1 || bytes.Length > upload.ChunkSize || offset != upload.Stream.Length || offset + bytes.Length > upload.Length)
                throw new InvalidDataException("전송 조각의 순서 또는 크기가 올바르지 않습니다.");
            upload.Stream.Write(bytes);
            upload.Touched = UtcNow;
        }
    }

    internal byte[] Consume(string token, long maxBytes = Package.MaxPackage)
    {
        lock (sync)
        {
            var upload = Find(token);
            // Check the reserved length before flushing or allocating a whole-file array.
            if (upload.Length > maxBytes)
            {
                Remove(token, upload);
                throw new InvalidDataException("전송 파일이 이 작업의 크기 제한을 초과했습니다.");
            }
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

    internal string Stage(ReadOnlySpan<byte> bytes, int chunkBytes = ChunkBytes, string? owner = null)
    {
        var token = Begin(bytes.Length, chunkBytes, owner);
        try
        {
            for (var offset = 0; offset < bytes.Length; offset += chunkBytes)
                Append(token, offset, bytes.Slice(offset, Math.Min(chunkBytes, bytes.Length - offset)));
            lock (sync) { _ = Find(token); return token; }
        }
        catch { Cancel(token); throw; }
    }

    internal string StageAsset(Stream source, string expectedHash, int chunkBytes = ChunkBytes, string? owner = null)
    {
        if (!source.CanRead || !source.CanSeek || source.Position != 0)
            throw new InvalidDataException("자산 전송 스트림 오류");
        var token = Begin(source.Length, chunkBytes, owner);
        try
        {
            using var hash = System.Security.Cryptography.IncrementalHash.CreateHash(System.Security.Cryptography.HashAlgorithmName.SHA256);
            var buffer = new byte[chunkBytes];
            long offset = 0;
            while (offset < source.Length)
            {
                var count = source.Read(buffer, 0, (int)Math.Min(buffer.Length, source.Length - offset));
                if (count == 0) throw new EndOfStreamException();
                hash.AppendData(buffer, 0, count);
                Append(token, offset, buffer.AsSpan(0, count));
                offset += count;
            }
            if (Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant() != expectedHash)
                throw new InvalidDataException("내부 자산이 손상되었습니다.");
            lock (sync) { _ = Find(token); return token; }
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
            var bytes = new byte[(int)Math.Min(upload.ChunkSize, upload.Length - offset)];
            upload.Stream.Position = offset;
            upload.Stream.ReadExactly(bytes);
            upload.Touched = UtcNow;
            return bytes;
        }
    }

    internal void Cancel(string token)
    {
        lock (sync)
            if (uploads.TryGetValue(token, out var upload))
                Remove(token, upload);
    }

    internal int CancelOwner(string owner)
    {
        owner = NormalizeOwner(owner) ?? throw new InvalidDataException("전송 창의 식별자가 올바르지 않습니다.");
        lock (sync)
        {
            Expire();
            if (!canceledOwners.ContainsKey(owner) && canceledOwners.Count >= MaxOwnerTombstones)
                throw new InvalidDataException("취소된 전송 창의 보관 한도를 초과했습니다.");
            // Seal first: late Begin/Stage calls must not recreate a disposed controller's transfers.
            canceledOwners[owner] = UtcNow + TransferLifetime;
            var canceled = uploads.Where(entry => entry.Value.Owner == owner).ToArray();
            foreach (var entry in canceled)
                Remove(entry.Key, entry.Value);
            return canceled.Length;
        }
    }

    internal bool IsOwnerCanceled(string? owner)
    {
        owner = NormalizeOwner(owner);
        if (owner is null) return false;
        lock (sync)
        {
            Expire();
            return canceledOwners.ContainsKey(owner);
        }
    }

    private DateTime UtcNow => time.GetUtcNow().UtcDateTime;

    private static string? NormalizeOwner(string? owner)
    {
        if (owner is null) return null;
        if (owner.Length != 32 || owner.Any(value => value is not (>= '0' and <= '9' or >= 'a' and <= 'f' or >= 'A' and <= 'F')))
            throw new InvalidDataException("전송 창의 식별자가 올바르지 않습니다.");
        return owner.ToLowerInvariant();
    }

    private Upload Find(string token)
    {
        Expire();
        return uploads.TryGetValue(token, out var value) ? value : throw new InvalidDataException("전송이 만료되었거나 취소되었습니다.");
    }
    private void Expire()
    {
        var now = UtcNow;
        foreach (var entry in canceledOwners.Where(entry => now >= entry.Value).ToArray())
            canceledOwners.Remove(entry.Key);
        foreach (var entry in uploads.Where(entry => now - entry.Value.Touched > TransferLifetime).ToArray())
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
            canceledOwners.Clear();
            Directory.Delete(root);
        }
    }
}
