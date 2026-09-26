using System.Diagnostics;
using System.Text.Json.Nodes;
namespace CoSkin;

/// <summary>Updates only CoSkin. A verified worker takes over after the resident releases its library.</summary>
internal sealed class UpdateCoordinator : IAsyncDisposable
{
    private readonly Library library;
    private readonly Func<Cdp[]> windows;
    private readonly Action stopHost;
    private readonly GitHubUpdateFeed feed = new();
    private readonly UpdateService service;
    private readonly bool installed;
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly CancellationTokenSource stop = new();
    private readonly Task loop;
    private TrustedUpdate? candidate;
    private string? downloaded;
    private bool switching;
    internal UpdateCoordinator(Library library, Func<Cdp[]> windows, Action stopHost, bool installed)
    {
        this.library = library; this.windows = windows; this.stopHost = stopHost; this.installed = installed;
        service = new(feed, UpdateTrust.PublisherKey(), ReleaseVersion.Parse(ProductVersion.Display));
        library.CheckUpdate = Check;
        library.ApplyUpdate = Apply;
        loop = Loop();
    }
    private async Task<bool> Editing()
    {
        foreach (var window in windows())
            if ((await window.Evaluate("!window.__coskin || Boolean(window.__coskin.panel?.dirty || window.__coskin.panel?.editing || (window.__coskin.panel?.busy && !window.__coskin.panel?.updateRequesting) || window.__coskin.panel?.runtimeSettingsDraft || window.__coskin.panel?.session?.previewing)"))?.GetValue<bool>() != false)
                return true;
        return false;
    }
    internal async Task<UpdateResult> Check(bool manual)
    {
        await gate.WaitAsync(stop.Token);
        try
        {
            if (!installed) return new(UpdateState.Unavailable);
            if (switching) return new(UpdateState.Updating, candidate);
            var result = await service.Check(library.Preferences.Read(), manual, await Editing(), stop.Token);
            if (result.State == UpdateState.Current) { candidate = null; downloaded = null; }
            if (result.Update is not null && result.Update.Hash != candidate?.Hash) { candidate = result.Update; downloaded = null; }
            return result;
        }
        finally { gate.Release(); }
    }
    internal async Task<UpdateResult> Apply() => await Apply(false);
    private async Task<UpdateResult> Apply(bool automatic)
    {
        await gate.WaitAsync(stop.Token);
        var acquired = new List<Cdp>();
        var handoff = false;
        try
        {
            if (!installed || candidate is null) return new(UpdateState.Unavailable);
            if (automatic && !library.Preferences.Read().AutomaticUpdates) return new(UpdateState.Disabled);
            if (switching) return new(UpdateState.Updating, candidate);
            if (await Editing()) return new(UpdateState.Deferred, candidate);
            if (downloaded is null)
            {
                var directory = Path.Combine(library.StorePath, "updates", Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(directory);
                var output = Path.Combine(directory, "payload.zip");
                await service.Download(candidate, output, null, stop.Token);
                downloaded = output;
            }
            if (automatic && !library.Preferences.Read().AutomaticUpdates) return new(UpdateState.Disabled);
            foreach (var window in windows())
            {
                if ((await window.Evaluate("window.__coskin?.beginExternalUpdate(true)"))?.GetValue<bool>() != true)
                    return new(UpdateState.Deferred, candidate);
                acquired.Add(window);
            }
            if (await Editing() || windows().Any(window => !acquired.Contains(window))) return new(UpdateState.Deferred, candidate);
            var ticketDirectory = Path.Combine(library.StorePath, "updates", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(ticketDirectory);
            File.Copy(downloaded, Path.Combine(ticketDirectory, "payload.zip"), false);
            var ticket = UpdateTickets.Create(library.StorePath, ticketDirectory, candidate);
            var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false, CreateNoWindow = true };
            start.ArgumentList.Add("--apply-update"); start.ArgumentList.Add(ticket);
            start.ArgumentList.Add("--store"); start.ArgumentList.Add(library.StorePath);
            using var worker = Process.Start(start) ?? throw new IOException("업데이트 작업을 시작하지 못했습니다.");
            var readyPath = Path.Combine(Path.GetDirectoryName(ticket)!, "worker-ready.json");
            using var readyDeadline = CancellationTokenSource.CreateLinkedTokenSource(stop.Token);
            readyDeadline.CancelAfter(TimeSpan.FromSeconds(30));
            while (!File.Exists(readyPath))
            {
                if (worker.HasExited) throw new IOException("업데이트 작업이 준비 전에 종료되었습니다.");
                await Task.Delay(100, readyDeadline.Token);
            }
            var ready = JsonContract.Read(File.ReadAllBytes(readyPath), 4096);
            if (ready["pid"]?.GetValue<int>() != worker.Id || ready["origin"]?.GetValue<int>() != Environment.ProcessId)
                throw new InvalidDataException("업데이트 준비 응답이 다릅니다.");
            switching = handoff = true;
            _ = Task.Run(async () => { await Task.Delay(1500); stopHost(); });
            return new(UpdateState.Updating, candidate);
        }
        finally
        {
            if (!handoff)
                foreach (var window in acquired)
                    try { await window.Evaluate("window.__coskin?.endExternalUpdate()"); }
                    catch (Exception error) { Console.Error.WriteLine(error); }
            gate.Release();
        }
    }
    private async Task Loop()
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(30), stop.Token);
            while (!stop.IsCancellationRequested)
            {
                try
                {
                    var result = await Check(false);
                    if (result.State == UpdateState.Ready && library.Preferences.Read().AutomaticUpdates)
                        await Apply(true);
                }
                catch (OperationCanceledException) when (stop.IsCancellationRequested) { break; }
                catch (Exception error) { Console.Error.WriteLine("CoSkin 업데이트 대기: " + error); }
                await Task.Delay(TimeSpan.FromMinutes(5), stop.Token);
            }
        }
        catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
    }
    public async ValueTask DisposeAsync()
    {
        library.CheckUpdate = null; library.ApplyUpdate = null;
        await stop.CancelAsync();
        await loop;
        feed.Dispose(); stop.Dispose();
    }
}
