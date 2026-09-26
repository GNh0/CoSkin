using System.Text.RegularExpressions;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
namespace CoSkin;

internal readonly record struct StableVersion(int Major, int Minor, int Patch) : IComparable<StableVersion>
{
    internal static StableVersion Parse(string text)
    {
        if (!Regex.IsMatch(text, @"^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$"))
            throw new InvalidDataException("안정 버전 형식이 올바르지 않습니다.");
        var parts = text.Split('.').Select(int.Parse).ToArray();
        return new(parts[0], parts[1], parts[2]);
    }
    public int CompareTo(StableVersion other)
    {
        var major = Major.CompareTo(other.Major);
        if (major != 0)
            return major;
        var minor = Minor.CompareTo(other.Minor);
        return minor != 0 ? minor : Patch.CompareTo(other.Patch);
    }
    public override string ToString() => $"{Major}.{Minor}.{Patch}";
}

internal sealed record TrustedUpdate(StableVersion Version, Uri Payload, long Bytes, string Hash);
internal static class UpdateContract
{
    internal const long MaximumPayload = 200L * 1024 * 1024;
    internal static TrustedUpdate Verify(byte[] bytes, byte[] publisherKey)
    {
        var document = JsonContract.Read(bytes, 8192);
        JsonContract.Fields(document, "formatVersion", "version", "payload", "bytes", "sha256", "signature");
        if (document["formatVersion"]?.GetValue<int>() != 1)
            throw new InvalidDataException("업데이트 형식을 지원하지 않습니다.");
        var version = StableVersion.Parse(JsonContract.String(document, "version"));
        var url = JsonContract.String(document, "payload");
        var expected = $"https://github.com/GNh0/CoSkin/releases/download/v{version}/coskin-win-x64.zip";
        if (url != expected)
            throw new InvalidDataException("업데이트 주소가 게시자 저장소와 일치하지 않습니다.");
        var size = document["bytes"]?.GetValue<long>() ?? 0;
        if (size <= 0 || size > MaximumPayload)
            throw new InvalidDataException("업데이트 파일 용량 제한을 초과했습니다.");
        var hash = JsonContract.String(document, "sha256");
        if (!Regex.IsMatch(hash, "^[a-f0-9]{64}$"))
            throw new InvalidDataException("업데이트 해시 형식이 올바르지 않습니다.");
        byte[] signature;
        try
        {
            signature = Convert.FromBase64String(JsonContract.String(document, "signature"));
        }
        catch (FormatException error) { throw new InvalidDataException("업데이트 서명 형식이 올바르지 않습니다.", error); }
        var canonical = Encoding.UTF8.GetBytes($"coskin-update-v1\n{version}\n{url}\n{size}\n{hash}\n");
        using var publisher = ECDsa.Create();
        try
        {
            publisher.ImportSubjectPublicKeyInfo(publisherKey, out var consumed);
            if (consumed != publisherKey.Length || publisher.KeySize != 256)
                throw new CryptographicException();
        }
        catch (CryptographicException error) { throw new InvalidDataException("업데이트 게시자 키가 올바르지 않습니다.", error); }
        if (signature.Length != 64 || !publisher.VerifyData(canonical, signature, HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation))
            throw new InvalidDataException("업데이트 게시자 서명을 확인하지 못했습니다.");
        return new(version, new Uri(url), size, hash);
    }
}

internal sealed record UpdateFeedResult(byte[]? Manifest, string? ETag);
internal interface IUpdateFeed
{
    Task<UpdateFeedResult> Check(string? etag, CancellationToken cancellationToken);
    Task<Stream> Download(Uri url, CancellationToken cancellationToken);
}
internal enum UpdateState
{
    Unavailable, Disabled, Current, Deferred, Ready, RetryPending
}
internal sealed record UpdateResult(UpdateState State, TrustedUpdate? Update = null);

/// <summary>No release key is fabricated: production updates remain unavailable until a trusted publisher key ships.</summary>
internal sealed class UpdateService(IUpdateFeed feed, byte[]? publisherKey, StableVersion current)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private string? etag;
    private TrustedUpdate? candidate;
    private DateTimeOffset nextCheck;
    private int failures;
    internal async Task<UpdateResult> Check(RuntimePreferences preferences, bool manual, bool editing, CancellationToken cancellationToken)
    {
        if (!manual && !preferences.AutomaticUpdates)
            return new(UpdateState.Disabled);
        if (publisherKey is null)
            return new(UpdateState.Unavailable);
        await gate.WaitAsync(cancellationToken);
        try
        {
            if (!manual && failures > 0 && DateTimeOffset.UtcNow < nextCheck)
                return new(UpdateState.RetryPending);
            if (manual || DateTimeOffset.UtcNow >= nextCheck)
            {
                var response = await feed.Check(etag, cancellationToken);
                if (response.Manifest is not null)
                {
                    candidate = UpdateContract.Verify(response.Manifest, publisherKey);
                    etag = response.ETag;
                }
                failures = 0;
                nextCheck = DateTimeOffset.UtcNow.AddHours(12);
            }
            if (candidate is null || candidate.Version.CompareTo(current) <= 0)
                return new(UpdateState.Current);
            return new(editing ? UpdateState.Deferred : UpdateState.Ready, candidate);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch { failures = Math.Min(failures + 1, 6); nextCheck = DateTimeOffset.UtcNow.AddMinutes(Math.Min(120, 5 * Math.Pow(2, failures - 1))); throw; }
        finally { gate.Release(); }
    }
    internal async Task Download(TrustedUpdate update, string output, IProgress<long>? progress, CancellationToken cancellationToken)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromMinutes(5));
        cancellationToken = deadline.Token;
        var destination = Path.GetFullPath(output);
        if (File.Exists(destination))
            throw new InvalidDataException("업데이트 임시 파일이 이미 있습니다.");
        for (var parent = Path.GetDirectoryName(destination); parent is not null; parent = Path.GetDirectoryName(parent))
            if (Directory.Exists(parent) && File.GetAttributes(parent).HasFlag(FileAttributes.ReparsePoint))
                throw new InvalidDataException("업데이트 임시 경로가 안전하지 않습니다.");
        var created = false;
        try
        {
            await using var input = await feed.Download(update.Payload, cancellationToken);
            await using var file = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None, 64 * 1024, FileOptions.Asynchronous);
            created = true;
            using var digest = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            var buffer = new byte[64 * 1024];
            long count = 0;
            int read;
            while ((read = await input.ReadAsync(buffer, cancellationToken)) > 0)
            {
                count += read;
                if (count > update.Bytes || count > UpdateContract.MaximumPayload)
                    throw new InvalidDataException("업데이트 파일 용량이 선언과 다릅니다.");
                digest.AppendData(buffer, 0, read);
                await file.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                progress?.Report(count);
            }
            if (count != update.Bytes || !Convert.ToHexString(digest.GetHashAndReset()).Equals(update.Hash, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("업데이트 파일 무결성을 확인하지 못했습니다.");
            await file.FlushAsync(cancellationToken);
        }
        catch { if (created && File.Exists(destination)) File.Delete(destination); throw; }
    }
}
