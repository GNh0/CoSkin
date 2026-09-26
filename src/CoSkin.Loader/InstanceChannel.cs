using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace CoSkin;

/// <summary>Bounded, current-user-only command channel scoped to one canonical library.</summary>
internal sealed class InstanceChannel : IAsyncDisposable
{
    private const int MaximumMessageBytes = 16 * 1024;
    private readonly Mutex mutex;
    private readonly ManualResetEventSlim release = new(false);
    private readonly Thread leaseThread;
    private readonly CancellationTokenSource stop = new();
    private readonly string pipeName;
    private Task? server;
    internal bool IsOwner
    {
        get;
    }

    internal InstanceChannel(string store, bool claimOwnership = true)
    {
        var canonical = Path.TrimEndingDirectorySeparator(Path.GetFullPath(store)).ToUpperInvariant();
        var identity = Environment.UserDomainName + "\\" + Environment.UserName + "\n" + canonical;
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)));
        pipeName = "CoSkin-" + key;
        mutex = new Mutex(false, "Local\\" + pipeName);
        var ownership = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        leaseThread = new Thread(() =>
        {
            bool acquired;
            try
            {
                acquired = claimOwnership && mutex.WaitOne(0);
            }
            catch (AbandonedMutexException) { acquired = true; }
            ownership.SetResult(acquired);
            if (!acquired)
                return;
            release.Wait();
            mutex.ReleaseMutex();
        })
        {
            IsBackground = true,
            Name = "CoSkin library ownership"
        };
        leaseThread.Start();
        IsOwner = ownership.Task.GetAwaiter().GetResult();
    }

    internal void Start(Func<JsonObject, CancellationToken, Task<JsonObject>> handler)
    {
        if (!IsOwner || server is not null)
            throw new InvalidOperationException("명령 채널 소유권 오류");
        server = Run(handler);
    }

    private async Task Run(Func<JsonObject, CancellationToken, Task<JsonObject>> handler)
    {
        while (!stop.IsCancellationRequested)
        {
            await using var pipe = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1,
                PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            try
            {
                await pipe.WaitForConnectionAsync(stop.Token);
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(stop.Token);
                deadline.CancelAfter(TimeSpan.FromSeconds(30));
                JsonObject reply;
                try
                {
                    var request = await Read(pipe, deadline.Token);
                    if (request.Count != 2 || request["version"]?.GetValue<int>() != 1 || request["command"] is not JsonObject)
                        throw new InvalidDataException("실행 요청 형식이 올바르지 않습니다.");
                    reply = await handler(request["command"]!.AsObject(), deadline.Token);
                }
                catch (Exception error) when (error is not OperationCanceledException)
                {
                    var failure = Failure.Describe(error);
                    reply = new JsonObject { ["ok"] = false, ["code"] = failure.Code, ["message"] = failure.Message };
                }
                await Write(pipe, reply, deadline.Token);
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { break; }
            catch (Exception error) when (error is IOException or OperationCanceledException or InvalidDataException)
            {
                Console.Error.WriteLine("실행 요청 연결 종료: " + error.Message);
            }
        }
    }

    internal async Task<JsonObject> Send(JsonObject command, CancellationToken cancellationToken)
    {
        await using var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut,
            PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        await pipe.ConnectAsync(5000, cancellationToken);
        await Write(pipe, new JsonObject { ["version"] = 1, ["command"] = command }, cancellationToken);
        return await Read(pipe, cancellationToken);
    }

    private static async Task<JsonObject> Read(Stream stream, CancellationToken cancellationToken)
    {
        var header = new byte[4];
        await stream.ReadExactlyAsync(header, cancellationToken);
        var length = System.Buffers.Binary.BinaryPrimitives.ReadInt32LittleEndian(header);
        if (length <= 0 || length > MaximumMessageBytes)
            throw new InvalidDataException("실행 요청 크기 제한을 초과했습니다.");
        var bytes = new byte[length];
        await stream.ReadExactlyAsync(bytes, cancellationToken);
        return JsonContract.Read(bytes, MaximumMessageBytes);
    }

    private static async Task Write(Stream stream, JsonObject document, CancellationToken cancellationToken)
    {
        var bytes = Encoding.UTF8.GetBytes(document.ToJsonString());
        if (bytes.Length > MaximumMessageBytes)
            throw new InvalidDataException("실행 요청 크기 제한을 초과했습니다.");
        var header = new byte[4];
        System.Buffers.Binary.BinaryPrimitives.WriteInt32LittleEndian(header, bytes.Length);
        await stream.WriteAsync(header, cancellationToken);
        await stream.WriteAsync(bytes, cancellationToken);
        await stream.FlushAsync(cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        await StopServer();
        stop.Dispose();
        release.Set();
        leaseThread.Join();
        release.Dispose();
        mutex.Dispose();
    }

    internal async Task StopServer()
    {
        await stop.CancelAsync();
        if (server is not null)
            await server;
    }
}
