using System.Text.Json.Nodes;
namespace CoSkin;

internal sealed class NativeRendererSession : IAsyncDisposable
{
    internal Cdp Main { get; } = new();
    private bool connected;
    internal async Task Initialize(NativeConnection connection)
    {
        await Main.ConnectPipe(connection);
        connected = true;
    }
    internal async Task<JsonArray> List() => (await Main.Send("CoSkin.list"))["targets"]!.AsArray();
    internal Task<JsonObject> OpenMedia(string path, string mime, long length, string hash) => Main.Send("CoSkin.media.register", new JsonObject { ["path"] = path, ["mime"] = mime, ["length"] = length, ["hash"] = hash });
    internal async Task ReleaseMedia(string token) => _ = await Main.Send("CoSkin.media.release", new JsonObject { ["token"] = token });
    public async ValueTask DisposeAsync()
    {
        try
        {
            if (connected) await Main.Send("CoSkin.dispose", timeout: TimeSpan.FromSeconds(2));
        }
        catch (Exception error) { Console.Error.WriteLine("Codex 연결 모듈 정리: " + error.Message); }
        await Main.DisposeAsync();
    }
}
