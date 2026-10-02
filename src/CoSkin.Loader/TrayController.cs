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
    internal TrayController(Library library, JsonObject state, Func<Cdp[]> windows, Func<Cdp, JsonObject, Task<JsonNode>> request, Action stop, Func<Task> reconnect, Func<Cdp, Task> activate, Action? targetChanged = null)
    {
        this.library = library;
        this.state = state;
        this.windows = windows;
        this.request = request;
        this.stop = stop;
        this.reconnect = reconnect;
        this.activate = activate;
        library.StateChanged += StateChanged;
        tray = new NativeTray(Snapshot, Execute, targetChanged);
    }
    private volatile bool originalDetected;
    private readonly Dictionary<int, Process> originals = [];
    internal void RefreshDetection()
    {
        lock (processGate)
        {
            foreach (var id in ResidentDetection.OriginalProcesses())
            {
                if (originals.ContainsKey(id))
                    continue;
                try
                {
                    var process = Process.GetProcessById(id);
                    originals.Add(id, process);
                    process.Exited += (_, _) =>
                    {
                        lock (processGate)
                        {
                            if (originals.TryGetValue(id, out var current) && ReferenceEquals(current, process))
                            {
                                originals.Remove(id);
                                process.Dispose();
                                originalDetected = originals.Count > 0;
                            }
                        }
                    };
                    process.EnableRaisingEvents = true;
                }
                catch (ArgumentException) { }
            }
            originalDetected = originals.Count > 0;
        }
    }
    // Shell registration may recover later; readiness is the resident message loop.
    internal Task Ready => tray.Ready;
    internal bool NotificationIconAvailable => tray.IconAvailable;
    internal void ReportConnectionFailure(Exception error) => tray.ShowNotice(TrayMessages.Error(library.Locale,
        error is TrayActionException action ? action.Code : Failure.Describe(error).Code));
    private void StateChanged(JsonObject next) => Volatile.Write(ref state, next);
    private TraySnapshot Snapshot()
    {
        var current = Volatile.Read(ref state);
        var enabled = current["enabled"]?.GetValue<bool>() == true;
        var applied = enabled ? current["bindings"]?["global"]?["id"]?.GetValue<string>() : null;
        var themes = current["themes"]!.AsObject().Select(pair => new TrayTheme(pair.Key, pair.Value?["name"]?.GetValue<string>() ?? pair.Key, pair.Key == applied)).ToArray();
        return new(library.Locale, windows().Length > 0, enabled, false, library.Preferences.Read(), themes, originalDetected);
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
            int? targetExitCode = null;
            try { targetExitCode = expected.ExitCode; }
            catch (Exception error) when (error is InvalidOperationException or System.ComponentModel.Win32Exception) { }
            DiagnosticLog.Record("target-exited", targetPid: id, targetExitCode: targetExitCode, reason: "verified-process-exited");
            expected.Dispose();
        }
        try
        {
            if (lifetime.Exited(id, library.Preferences.Read()))
            {
                DiagnosticLog.Record("stop-requested", targetPid: id, reason: "exit-with-codex");
                stop();
            }
        }
        catch (Exception error) { Console.Error.WriteLine(Failure.Describe(error).Message); }
    }
    private async Task Execute(TrayCommand command)
    {
        var participants = windows();
        if (command.Action == TrayAction.Exit)
        {
            DiagnosticLog.Record("stop-requested", reason: "user-tray-exit");
            foreach (var window in participants)
                await window.Evaluate("window.__coskin?.persistDraftForExit()");
            stop();
            return;
        }
        if (command.Action == TrayAction.OpenCodex)
        {
            await reconnect();
            return;
        }
        if (command.Action == TrayAction.ToggleStartup)
        {
            var startup = library.Preferences.Read();
            ApplyRuntimePreferences(startup with
            {
                StartAtSignIn = !startup.StartAtSignIn
            });
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
            await RendererNotifications.Broadcast(participants, "window.__coskin?.receiveRuntimeSettings(" + Library.PreferenceDocument(settings).ToJsonString() + ")",
                (window, error) => DiagnosticLog.Record("runtime-settings-notification-failure", error, reason: "id=" + window.RendererId));
            return;
        }
        if (participants.Length == 0 && command.Action == TrayAction.Settings)
        {
            var choice = SetupDialog.Show(library.Preferences.Read(), false, library.Locale, settingsOnly: true, allowStartup: WindowsInstaller.IsInstalledStore(library));
            if (choice is not null)
                ApplyRuntimePreferences(choice.Preferences);
            return;
        }
        var selected = await RendererSelection.MainShell(participants) ?? throw new TrayActionException("not-connected");
        await activate(selected);
        if (command.Action == TrayAction.BackgroundView)
        {
            if ((await selected.Evaluate("window.__coskin?.backgroundView?.toggle()", TimeSpan.FromSeconds(2)))?.GetValue<bool>() != true)
                throw new TrayActionException("not-connected");
            return;
        }
        if (command.Action is TrayAction.Library or TrayAction.Settings)
        {
            if ((await selected.Evaluate(command.Action == TrayAction.Settings ? "window.__coskin?.openSettings()" : "window.__coskin?.openLibrary()"))?.GetValue<bool>() != true)
                throw new TrayActionException("not-connected");
            return;
        }
        foreach (var window in participants)
            if ((await window.Evaluate("Boolean(window.__coskin?.panel?.dirty || window.__coskin?.panel?.editing || window.__coskin?.panel?.busy || window.__coskin?.panel?.session?.previewing)"))?.GetValue<bool>() == true)
            {
                await activate(window);
                await window.Evaluate("window.__coskin?.panel?.notify(window.__coskin?.trayBusyMessage())");
                return;
            }
        if (command.Action == TrayAction.Refresh)
        {
            foreach (var window in participants)
                if ((await window.Evaluate("window.__coskin?.refreshDecorations()"))?.GetValue<bool>() != true)
                    throw new TrayActionException("busy");
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
            await RendererNotifications.Broadcast(participants, "window.__coskin?.receiveSummary(" + summary.ToJsonString() + ")",
                (window, error) => DiagnosticLog.Record("summary-notification-failure", error, reason: "id=" + window.RendererId));
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
    private void ApplyRuntimePreferences(RuntimePreferences next)
    {
        var previous = library.Preferences.Read();
        var startupChanged = previous.StartAtSignIn != next.StartAtSignIn;
        if (startupChanged && !WindowsInstaller.IsInstalledStore(library))
            throw new TrayActionException("not-installed");
        library.Preferences.Write(next);
        try
        {
            if (startupChanged)
                new InstallationService(library.StorePath, new WindowsInstallationPlatform()).SetStartup(next.StartAtSignIn);
        }
        catch
        {
            library.Preferences.Write(previous);
            throw;
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
            foreach (var process in originals.Values)
                process.Dispose();
            originals.Clear();
        }
    }
}
