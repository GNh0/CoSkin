using System.Net;
using System.Net.Http.Headers;

namespace CoSkin;

/// <summary>Only release metadata and signed payload bytes cross this boundary.</summary>
internal sealed class GitHubUpdateFeed : IUpdateFeed, IDisposable
{
    private static readonly Uri Manifest = new("https://github.com/GNh0/CoSkin/releases/latest/download/coskin-update.json");
    private readonly HttpClient client;

    internal GitHubUpdateFeed(HttpMessageHandler? handler = null)
    {
        client = new HttpClient(handler ?? new HttpClientHandler { AllowAutoRedirect = false });
        client.Timeout = TimeSpan.FromMinutes(3);
        client.DefaultRequestHeaders.UserAgent.ParseAdd("CoSkin/" + ProductVersion.Display);
    }

    public async Task<UpdateFeedResult> Check(string? etag, CancellationToken cancellationToken)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(30));
        cancellationToken = deadline.Token;
        using var response = await Send(Manifest, etag, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return new(null, null, false);
        if (response.StatusCode == HttpStatusCode.NotModified)
            return new(null, response.Headers.ETag?.ToString() ?? etag);
        response.EnsureSuccessStatusCode();
        if (response.Content.Headers.ContentLength is > 8192)
            throw new InvalidDataException("업데이트 안내 파일 제한을 초과했습니다.");
        await using var input = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var bytes = new MemoryStream();
        var buffer = new byte[4096];
        int count;
        while ((count = await input.ReadAsync(buffer, cancellationToken)) > 0)
        {
            if (bytes.Length + count > 8192)
                throw new InvalidDataException("업데이트 안내 파일 제한을 초과했습니다.");
            bytes.Write(buffer, 0, count);
        }
        return new(bytes.ToArray(), response.Headers.ETag?.ToString());
    }

    public async Task<Stream> Download(Uri url, CancellationToken cancellationToken)
    {
        if (url.Host != "github.com" || !url.AbsolutePath.StartsWith("/GNh0/CoSkin/releases/download/", StringComparison.Ordinal))
            throw new InvalidDataException("업데이트 다운로드 저장소가 다릅니다.");
        var response = await Send(url, null, cancellationToken);
        try
        {
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength is > UpdateContract.MaximumPayload)
                throw new InvalidDataException("업데이트 다운로드 제한을 초과했습니다.");
            return new OwnedResponseStream(await response.Content.ReadAsStreamAsync(cancellationToken), response);
        }
        catch { response.Dispose(); throw; }
    }

    private async Task<HttpResponseMessage> Send(Uri initial, string? etag, CancellationToken cancellationToken)
    {
        var current = initial;
        for (var redirect = 0; redirect <= 4; redirect++)
        {
            ValidateTransport(current);
            using var request = new HttpRequestMessage(HttpMethod.Get, current);
            if (etag is not null && EntityTagHeaderValue.TryParse(etag, out var parsed))
                request.Headers.IfNoneMatch.Add(parsed);
            var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if ((int)response.StatusCode is not (301 or 302 or 303 or 307 or 308))
                return response;
            var location = response.Headers.Location;
            response.Dispose();
            if (location is null)
                throw new InvalidDataException("업데이트 리디렉션 주소가 없습니다.");
            current = location.IsAbsoluteUri ? location : new Uri(current, location);
        }
        throw new InvalidDataException("업데이트 리디렉션 횟수를 초과했습니다.");
    }

    private static void ValidateTransport(Uri url)
    {
        if (url.Scheme != Uri.UriSchemeHttps || url.Port != 443 || url.UserInfo.Length != 0 || url.Fragment.Length != 0 ||
            url.Host is not ("github.com" or "release-assets.githubusercontent.com" or "objects.githubusercontent.com"))
            throw new InvalidDataException("업데이트 전송 주소가 안전하지 않습니다.");
    }

    public void Dispose() => client.Dispose();

    private sealed class OwnedResponseStream(Stream inner, HttpResponseMessage response) : Stream
    {
        public override bool CanRead => inner.CanRead;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position
        {
            get => throw new NotSupportedException(); set => throw new NotSupportedException();
        }
        public override int Read(byte[] buffer, int offset, int count) => inner.Read(buffer, offset, count);
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) => inner.ReadAsync(buffer, cancellationToken);
        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                inner.Dispose();
                response.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
