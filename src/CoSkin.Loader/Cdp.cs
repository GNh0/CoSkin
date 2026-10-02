using System.Net.WebSockets;
using System.Text;
using System.Text.Json.Nodes;
using System.Collections.Concurrent;
using System.IO.Pipes;
using System.Buffers.Binary;
using System.Runtime.InteropServices;
namespace CoSkin;

internal sealed class Cdp : IAsyncDisposable
{
    private readonly Cdp? parent;
    private readonly int rendererId;
    internal int RendererId => rendererId;
    internal bool IsClosed => Volatile.Read(ref disposed) != 0 || cancellation.IsCancellationRequested || parent?.IsClosed == true;
    internal Cdp()
    {
        // This Codex Node inspector rejects unsolicited keep-alive control frames.
        // Application requests already verify liveness every two seconds and time out.
        socket.Options.KeepAliveInterval = Timeout.InfiniteTimeSpan;
        cancellation = stop.Token;
    }
    internal Cdp(Cdp parent, int rendererId) : this()
    {
        this.parent = parent; this.rendererId = rendererId;
        parent.Event += Forward;
    }
    private void Forward(JsonObject message)
    {
        if (message["method"]?.GetValue<string>() != "Runtime.bindingCalled" || message["params"]?["name"]?.GetValue<string>() != "__coskinRendererEvent") return;
        var payload = message["params"]?["payload"]?.GetValue<string>();
        if (payload is null || payload.Length > 4 * 1024 * 1024) return;
        try
        {
            var forwarded = JsonNode.Parse(payload)!.AsObject();
            if (forwarded["id"]?.GetValue<int>() == rendererId && forwarded["method"]?.GetValue<string>() == "Runtime.bindingCalled" && forwarded["params"]?["name"]?.GetValue<string>() == "__coskinRequest") Event?.Invoke(forwarded);
        }
        catch (Exception error) when (error is System.Text.Json.JsonException or InvalidOperationException or FormatException) { System.Diagnostics.Debug.WriteLine(error); }
    }
    private readonly ClientWebSocket socket = new(); private readonly ConcurrentDictionary<int, TaskCompletionSource<JsonObject>> pending = new(); private readonly SemaphoreSlim sendLock = new(1, 1); private int next; private readonly CancellationTokenSource stop = new(); internal event Action<JsonObject>? Event;
    private readonly CancellationToken cancellation;
    private readonly SemaphoreSlim functionLock = new(1, 1);
    private string? windowObject;
    private NamedPipeClientStream? pipe;
    private Task? receiveTask;
    private int disposed;
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetNamedPipeServerProcessId(Microsoft.Win32.SafeHandles.SafePipeHandle handle, out uint processId);
    internal async Task ConnectPipe(NativeConnection connection)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(connection.PipeName, $"^CoSkin-{connection.ProcessId}-[a-f0-9]{{32}}$"))
            throw new InvalidDataException("Codex 파이프 이름 오류");
        pipe = new NamedPipeClientStream(".", connection.PipeName, PipeDirection.InOut, PipeOptions.Asynchronous, System.Security.Principal.TokenImpersonationLevel.Anonymous);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        deadline.CancelAfter(TimeSpan.FromSeconds(5));
        await pipe.ConnectAsync(deadline.Token);
        if (!GetNamedPipeServerProcessId(pipe.SafePipeHandle, out var owner) || owner != connection.ProcessId)
            throw new InvalidDataException("Codex 파이프 소유자 오류");
        using var target = System.Diagnostics.Process.GetProcessById(connection.ProcessId);
        if (target.HasExited || target.StartTime.ToUniversalTime().Ticks != connection.Started)
            throw new InvalidDataException("Codex 프로세스 정체성 오류");
        receiveTask = ReceivePipe();
        var response = await Send("CoSkin.authenticate", new JsonObject { ["nonce"] = connection.Nonce, ["ownerPid"] = Environment.ProcessId }, TimeSpan.FromSeconds(5));
        if (response["contractVersion"]?.GetValue<int>() != 2 || response["pid"]?.GetValue<int>() != connection.ProcessId || response["ownerPid"]?.GetValue<int>() != Environment.ProcessId)
            throw new InvalidDataException("Codex 파이프 인증 오류");
    }
    internal async Task Connect(Uri uri)
    {
        await socket.ConnectAsync(uri, cancellation);
        receiveTask = Receive();
    }
    private void Deliver(JsonObject obj)
    {
        if (obj["id"] is JsonNode id && pending.TryRemove(id.GetValue<int>(), out var completion))
        {
            if (obj["error"] is not null) completion.TrySetException(new IOException(obj["error"]!.ToJsonString()));
            else completion.TrySetResult(obj["result"]!.AsObject());
        }
        else Event?.Invoke(obj);
    }
    private async Task ReceivePipe()
    {
        try
        {
            var header = new byte[4];
            while (!cancellation.IsCancellationRequested)
            {
                await pipe!.ReadExactlyAsync(header, cancellation);
                var length = BinaryPrimitives.ReadUInt32LittleEndian(header);
                if (length < 2 || length > 8 * 1024 * 1024) throw new InvalidDataException("파이프 응답 크기 제한");
                var message = new byte[length];
                await pipe.ReadExactlyAsync(message, cancellation);
                Deliver(JsonNode.Parse(message)!.AsObject());
            }
        }
        catch (Exception error) { if (!cancellation.IsCancellationRequested) DiagnosticLog.Record("pipe-receive", error); FailPending(error); }
        finally { stop.Cancel(); FailPending(new IOException("연결이 종료되었습니다.")); }
    }
    private async Task Receive()
    {
        try
        {
            var buffer = new byte[16384];
            while (!stop.IsCancellationRequested)
            {
                using var message = new MemoryStream();
                WebSocketReceiveResult result;
                do
                {
                    result = await socket.ReceiveAsync(buffer, cancellation);
                    if (result.MessageType == WebSocketMessageType.Close)
                        return;
                    message.Write(buffer, 0, result.Count);
                    if (message.Length > 8 * 1024 * 1024)
                        throw new InvalidDataException("응답 크기 제한");
                } while (!result.EndOfMessage);
                Deliver(JsonNode.Parse(message.ToArray())!.AsObject());
            }
        }
        catch (Exception e) { if (!stop.IsCancellationRequested) DiagnosticLog.Record("cdp-receive", e); FailPending(e); }
        finally { stop.Cancel(); FailPending(new IOException("연결이 종료되었습니다.")); }
    }
    private void FailPending(Exception error)
    {
        foreach (var entry in pending.ToArray())
            if (pending.TryRemove(entry.Key, out var completion))
                completion.TrySetException(error);
    }
    internal async Task<JsonObject> Send(string method, JsonObject? parameters = null, TimeSpan? timeout = null)
    {
        ObjectDisposedException.ThrowIf(Volatile.Read(ref disposed) != 0, this);
        if (parent is not null)
            return await parent.Send("CoSkin.command", new JsonObject { ["rendererId"] = rendererId, ["method"] = method, ["parameters"] = parameters ?? new JsonObject() }, timeout);
        var started = System.Diagnostics.Stopwatch.StartNew();
        TimeSpan Remaining()
        {
            var remaining = (timeout ?? TimeSpan.FromSeconds(30)) - started.Elapsed;
            if (remaining <= TimeSpan.Zero) throw new TimeoutException("Codex 요청 시간이 초과되었습니다.");
            return remaining;
        }
        var id = Interlocked.Increment(ref next);
        var completion = new TaskCompletionSource<JsonObject>(TaskCreationOptions.RunContinuationsAsynchronously);
        pending[id] = completion;
        var data = Encoding.UTF8.GetBytes(new JsonObject { ["id"] = id, ["method"] = method, ["params"] = parameters ?? new JsonObject() }.ToJsonString());
        if (data.Length > 8 * 1024 * 1024) { pending.TryRemove(id, out _); throw new InvalidDataException("파이프 요청 크기 제한"); }
        try
        {
            if (!await sendLock.WaitAsync(Remaining(), cancellation))
                throw new TimeoutException("Codex 전송 준비 시간이 초과되었습니다.");
            try
            {
                // Once a framed pipe write begins, finish it under the transport lifetime
                // token. Cancelling a partial frame would corrupt all windows sharing it.
                if (pipe is not null)
                {
                    var header = new byte[4];
                    BinaryPrimitives.WriteUInt32LittleEndian(header, (uint)data.Length);
                    await pipe.WriteAsync(header, cancellation);
                    await pipe.WriteAsync(data, cancellation);
                }
                else await socket.SendAsync(data, WebSocketMessageType.Text, true, cancellation);
            }
            finally { sendLock.Release(); }
            return await completion.Task.WaitAsync(Remaining(), cancellation);
        }
        finally { pending.TryRemove(id, out _); }
    }
    internal async Task<JsonNode?> Evaluate(string expression, TimeSpan? timeout = null)
    {
        var result = await Send("Runtime.evaluate", new JsonObject { ["expression"] = expression, ["awaitPromise"] = true, ["returnByValue"] = true }, timeout);
        if (result["exceptionDetails"] is not null)
            throw new InvalidDataException(result["exceptionDetails"]!.ToJsonString());
        return result["result"]?["value"];
    }
    internal async Task<JsonNode?> Invoke(string function, JsonArray arguments, TimeSpan? timeout = null)
    {
        var started = System.Diagnostics.Stopwatch.StartNew();
        TimeSpan Remaining()
        {
            var remaining = (timeout ?? TimeSpan.FromSeconds(30)) - started.Elapsed;
            if (remaining <= TimeSpan.Zero) throw new TimeoutException("Codex 함수 요청 시간이 초과되었습니다.");
            return remaining;
        }
        async Task AcquireFunctionLock()
        {
            if (!await functionLock.WaitAsync(Remaining(), cancellation))
                throw new TimeoutException("Codex 함수 준비 시간이 초과되었습니다.");
        }
        for (var attempt = 0; attempt < 2; attempt++)
        {
            await AcquireFunctionLock();
            string objectId;
            try
            {
                if (windowObject is null)
                {
                    var window = await Send("Runtime.evaluate", new JsonObject { ["expression"] = "window", ["returnByValue"] = false }, Remaining());
                    windowObject = window["result"]?["objectId"]?.GetValue<string>() ?? throw new IOException("Codex 함수 연결을 준비하지 못했습니다.");
                }
                objectId = windowObject;
            }
            finally { functionLock.Release(); }
            var values = new JsonArray();
            foreach (var argument in arguments) values.Add(new JsonObject { ["value"] = argument?.DeepClone() });
            JsonObject result;
            try
            {
                result = await Send("Runtime.callFunctionOn", new JsonObject {
                    ["objectId"] = objectId, ["functionDeclaration"] = function, ["arguments"] = values,
                    ["awaitPromise"] = true, ["returnByValue"] = true,
                }, Remaining());
            }
            catch (IOException error) when (attempt == 0 && !IsClosed &&
                (error.Message.Contains("Could not find object with given id", StringComparison.Ordinal) || error.Message.Contains("Cannot find context with specified id", StringComparison.Ordinal)))
            {
                await AcquireFunctionLock();
                try { if (windowObject == objectId) windowObject = null; }
                finally { functionLock.Release(); }
                continue;
            }
            // An executed function's exception is never retried.
            if (result["exceptionDetails"] is not null) throw new InvalidDataException(result["exceptionDetails"]!.ToJsonString());
            return result["result"]?["value"];
        }
        throw new IOException("Codex 함수 연결을 복구하지 못했습니다.");
    }
    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        if (parent is not null)
        {
            parent.Event -= Forward;
            try { await parent.Send("CoSkin.detach", new JsonObject { ["rendererId"] = rendererId }, TimeSpan.FromSeconds(2)); }
            catch (Exception error) { System.Diagnostics.Debug.WriteLine(error); }
        }
        stop.Cancel();
        FailPending(new IOException("연결이 종료되었습니다."));
        pipe?.Dispose();
        socket.Dispose();
        if (receiveTask is not null) await receiveTask;
        // Sends may still be unwinding cancellation callbacks and releasing the gate.
        // These managed primitives own no native wait handle; let their last user
        // release them instead of disposing underneath an in-flight continuation.
    }
}
