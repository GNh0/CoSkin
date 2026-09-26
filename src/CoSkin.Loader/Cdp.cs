using System.Net.WebSockets;
using System.Text;
using System.Text.Json.Nodes;
using System.Collections.Concurrent;
namespace CoSkin;

internal sealed class Cdp : IAsyncDisposable
{
    private readonly ClientWebSocket socket = new(); private readonly ConcurrentDictionary<int, TaskCompletionSource<JsonObject>> pending = new(); private readonly SemaphoreSlim sendLock = new(1, 1); private int next; private readonly CancellationTokenSource stop = new(); internal event Action<JsonObject>? Event;
    internal async Task Connect(Uri uri)
    {
        await socket.ConnectAsync(uri, stop.Token);
        _ = Receive();
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
                    result = await socket.ReceiveAsync(buffer, stop.Token);
                    if (result.MessageType == WebSocketMessageType.Close)
                        return;
                    message.Write(buffer, 0, result.Count);
                    if (message.Length > 8 * 1024 * 1024)
                        throw new InvalidDataException("응답 크기 제한");
                } while (!result.EndOfMessage);
                var obj = JsonNode.Parse(message.ToArray())!.AsObject();
                if (obj["id"] is JsonNode id && pending.TryRemove(id.GetValue<int>(), out var completion))
                {
                    if (obj["error"] is not null)
                        completion.TrySetException(new IOException(obj["error"]!.ToJsonString()));
                    else
                        completion.TrySetResult(obj["result"]!.AsObject());
                }
                else
                    Event?.Invoke(obj);
            }
        }
        catch (Exception e) { FailPending(e); }
        finally { FailPending(new IOException("연결이 종료되었습니다.")); }
    }
    private void FailPending(Exception error)
    {
        foreach (var entry in pending.ToArray())
            if (pending.TryRemove(entry.Key, out var completion))
                completion.TrySetException(error);
    }
    internal async Task<JsonObject> Send(string method, JsonObject? parameters = null)
    {
        var id = Interlocked.Increment(ref next);
        var completion = new TaskCompletionSource<JsonObject>(TaskCreationOptions.RunContinuationsAsynchronously);
        pending[id] = completion;
        var data = Encoding.UTF8.GetBytes(new JsonObject { ["id"] = id, ["method"] = method, ["params"] = parameters ?? new JsonObject() }.ToJsonString());
        try
        {
            await sendLock.WaitAsync(stop.Token);
            try
            {
                await socket.SendAsync(data, WebSocketMessageType.Text, true, stop.Token);
            }
            finally { sendLock.Release(); }
            return await completion.Task.WaitAsync(TimeSpan.FromSeconds(30), stop.Token);
        }
        finally { pending.TryRemove(id, out _); }
    }
    internal async Task<JsonNode?> Evaluate(string expression)
    {
        var result = await Send("Runtime.evaluate", new JsonObject { ["expression"] = expression, ["awaitPromise"] = true, ["returnByValue"] = true });
        if (result["exceptionDetails"] is not null)
            throw new InvalidDataException(result["exceptionDetails"]!.ToJsonString());
        return result["result"]?["value"];
    }
    public async ValueTask DisposeAsync()
    {
        stop.Cancel();
        FailPending(new IOException("연결이 종료되었습니다."));
        socket.Dispose();
        await Task.CompletedTask;
        stop.Dispose();
        sendLock.Dispose();
    }
}

