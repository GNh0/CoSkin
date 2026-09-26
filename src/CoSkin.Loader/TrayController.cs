using System.Diagnostics;
using System.Text.Json.Nodes;
namespace CoSkin;

/// <summary>Tray actions share the existing apply transaction and never replace a dirty editor.</summary>
internal sealed class TrayController : IDisposable
{
    private readonly Library library;
    private readonly Func<Cdp[]> windows;
    private readonly Func<Cdp, JsonObject, Task<JsonNode>> request;
    private readonly Action stop;
    private readonly Func<Task> reconnect;
    private readonly Func<Cdp, Task> activate;
    private readonly NativeTray tray;
    private JsonObject state;
    private readonly TargetLifetime lifetime = new();
    private readonly Dictionary<int, Process> watched = [];
    private readonly object processGate = new();
    internal TrayController(Library library, JsonObject state, Func<Cdp[]> windows, Func<Cdp, JsonObject, Task<JsonNode>> request, Action stop, Func<Task> reconnect, Func<Cdp, Task> activate)
    {
        this.library = library;
        this.state = state;
        this.windows = windows;
        this.request = request;
        this.stop = stop;
        this.reconnect = reconnect;
        this.activate = activate;
        library.StateChanged += StateChanged;
        tray = new NativeTray(Snapshot, Execute);
    }
    internal Task Ready => tray.Ready;
    private void StateChanged(JsonObject next) => Volatile.Write(ref state, next);
    private TraySnapshot Snapshot()
    {
        var current = Volatile.Read(ref state);
        var enabled = current["enabled"]?.GetValue<bool>() == true;
        var applied = enabled ? current["bindings"]?["global"]?["id"]?.GetValue<string>() : null;
        var themes = current["themes"]!.AsObject().Select(pair => new TrayTheme(pair.Key, pair.Value?["name"]?.GetValue<string>() ?? pair.Key, pair.Key == applied)).ToArray();
        return new(library.Locale, windows().Length > 0, enabled, false, library.Preferences.Read(), themes);
    }
    internal void WatchVerifiedProcess(int id)
    {
        lock (processGate)
        {
            if (watched.ContainsKey(id))
                return;
            var process = Process.GetProcessById(id);
            lifetime.Connected(id);
            watched.Add(id, process);
            process.Exited += (_, _) => OnExited(id, process);
            process.EnableRaisingEvents = true;
        }
    }
    private void OnExited(int id, Process expected)
    {
        lock (processGate)
        {
            if (!watched.TryGetValue(id, out var current) || !ReferenceEquals(current, expected))
                return;
            watched.Remove(id);
            expected.Dispose();
        }
        try
        {
            if (lifetime.Exited(id, library.Preferences.Read()))
                stop();
        }
        catch (Exception error) { Console.Error.WriteLine(Failure.Describe(error).Message); }
    }
    private async Task Execute(TrayCommand command)
    {
        var participants = windows();
        if (command.Action == TrayAction.Exit)
        {
            foreach (var window in participants)
                await window.Evaluate("window.__coskin?.persistDraftForExit()");
            stop();
            return;
        }
        if (command.Action is TrayAction.ToggleLaunch or TrayAction.ToggleExit or TrayAction.ToggleUpdates)
        {
            var settings = library.Preferences.Read();
            settings = command.Action switch
            {
                TrayAction.ToggleLaunch => settings with { LaunchWithCodex = !settings.LaunchWithCodex },
                TrayAction.ToggleExit => settings with { ExitWithCodex = !settings.ExitWithCodex },
                _ => settings with { AutomaticUpdates = !settings.AutomaticUpdates }
            };
            library.Preferences.Write(settings);
            foreach (var window in participants)
                await window.Evaluate("window.__coskin?.receiveRuntimeSettings(" + Library.PreferenceDocument(settings).ToJsonString() + ")");
            return;
        }
        if (participants.Length == 0 && command.Action is TrayAction.Library or TrayAction.Settings)
        {
            await reconnect();
            for (var attempt = 0; attempt < 20 && participants.Length == 0; attempt++)
            {
                await Task.Delay(500);
                participants = windows();
            }
        }
        var selected = participants.FirstOrDefault() ?? throw new TrayActionException("not-connected");
        await activate(selected);
        if (command.Action is TrayAction.Library or TrayAction.Settings)
        {
            await selected.Evaluate(command.Action == TrayAction.Settings ? "window.__coskin?.openSettings()" : "window.__coskin?.openLibrary()");
            return;
        }
        foreach (var window in participants)
            if ((await window.Evaluate("Boolean(window.__coskin?.panel?.dirty || window.__coskin?.panel?.editing || window.__coskin?.panel?.busy || window.__coskin?.panel?.session?.previewing)"))?.GetValue<bool>() == true)
            {
                await activate(window);
                await window.Evaluate("window.__coskin?.panel?.notify(window.__coskin?.trayBusyMessage())");
                return;
            }
        JsonObject operation;
        if (command.Action == TrayAction.Apply)
            operation = new()
            {
                ["op"] = "apply",
                ["id"] = command.Theme,
                ["scope"] = "global"
            };
        else
            operation = new()
            {
                ["op"] = Snapshot().Enabled ? "disable" : "enable"
            };
        var acquired = new List<Cdp>();
        try
        {
            foreach (var window in participants)
            {
                if ((await window.Evaluate("window.__coskin?.beginExternalUpdate()"))?.GetValue<bool>() != true)
                    throw new TrayActionException("busy");
                acquired.Add(window);
            }
            await request(selected, operation);
            var summary = await library.Handle(new JsonObject { ["op"] = "list" }, _ => Task.CompletedTask, (_, _) => Task.CompletedTask);
            foreach (var window in participants)
                await window.Evaluate("window.__coskin?.receiveSummary(" + summary.ToJsonString() + ")");
        }
        finally
        {
            foreach (var window in acquired)
                try
                {
                    await window.Evaluate("window.__coskin?.endExternalUpdate()");
                }
                catch (Exception error) { Console.Error.WriteLine(Failure.Describe(error).Message); }
        }
    }
    public void Dispose()
    {
        library.StateChanged -= StateChanged;
        tray.Dispose();
        lock (processGate)
        {
            foreach (var process in watched.Values)
                process.Dispose();
            watched.Clear();
        }
    }
}
