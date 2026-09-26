using System.Text.Json.Nodes;
namespace CoSkin;

internal sealed class NativeRendererSession : IAsyncDisposable
{
    internal Cdp Main { get; } = new();
    private bool ownsInspector;
    internal async Task Initialize(JsonArray targets, int port)
    {
        var target = targets.Single(value => value?["type"]?.GetValue<string>() == "node")!;
        var url = new Uri(target["webSocketDebuggerUrl"]!.GetValue<string>());
        if (url.Scheme != "ws" || url.Host != "127.0.0.1" || url.Port != port || url.UserInfo.Length != 0)
            throw new InvalidDataException("Codex 연결 모듈의 소켓 주소 오류");
        await Main.Connect(url);
        await Main.Send("Runtime.enable");
        ownsInspector = (await Main.Evaluate("globalThis.__coskinNativeEndpoint?.contractVersion === 1 && globalThis.__coskinNativeEndpoint.ownerPid === " + Environment.ProcessId))?.GetValue<bool>() == true;
        if (!ownsInspector) throw new InvalidDataException("이 CoSkin이 생성한 Codex 연결만 사용할 수 있습니다.");
        await Main.Send("Runtime.addBinding", new JsonObject { ["name"] = "__coskinRendererEvent" });
        using var input = typeof(NativeRendererSession).Assembly.GetManifestResourceStream("CoSkin.NativeRendererBridge.js")!;
        using var reader = new StreamReader(input);
        if ((await Main.Evaluate(await reader.ReadToEndAsync()))?.GetValue<bool>() != true)
            throw new InvalidDataException("Codex 창 연결을 초기화하지 못했습니다.");
    }
    internal async Task<JsonArray> List() => (await Main.Evaluate("globalThis.__coskinRendererBridge.list()"))!.AsArray();
    public async ValueTask DisposeAsync()
    {
        try
        {
            if (ownsInspector)
            {
                await Main.Evaluate("(()=>{const endpoint=globalThis.__coskinNativeEndpoint;if(endpoint?.ownerPid!==" + Environment.ProcessId + ")return false;endpoint.closing=true;globalThis.__coskinRendererBridge?.dispose();setTimeout(()=>{if(globalThis.__coskinNativeEndpoint===endpoint){delete globalThis.__coskinNativeEndpoint;process.getBuiltinModule('inspector').close()}},250);return true})()");
            }
        }
        catch (Exception error) { Console.Error.WriteLine("Codex 연결 모듈 정리: " + error.Message); }
        await Main.DisposeAsync();
    }
}
