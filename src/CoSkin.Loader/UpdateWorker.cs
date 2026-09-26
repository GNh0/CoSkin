using System.Diagnostics;
using System.Text.Json.Nodes;
namespace CoSkin;

internal static class UpdateWorker
{
    internal static async Task Run(string store, string requestPath)
    {
        var key = UpdateTrust.PublisherKey() ?? throw new InvalidDataException("업데이트 게시자 설정이 필요합니다.");
        var ticket = UpdateTickets.Read(store, requestPath, key);
        var installation = new InstallationService(store, new WindowsInstallationPlatform());
        var previous = installation.Current();
        using var origin = Process.GetProcessById(ticket.OriginProcess);
        if (origin.StartTime.ToUniversalTime().Ticks != ticket.OriginStarted ||
            !string.Equals(origin.MainModule?.FileName, previous.Executable, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("업데이트 원본 프로세스와 설치본이 다릅니다.");
        var archive = Path.Combine(ticket.Directory, "payload.zip");
        var stage = UpdateStaging.Extract(archive, ticket.Update, ticket.Directory);
        if (FileVersionInfo.GetVersionInfo(Path.Combine(stage, "CoSkin.Loader.exe")).ProductVersion?.Split('+')[0] != ticket.Update.Version.ToString())
            throw new InvalidDataException("업데이트 실행 파일과 서명된 버전이 다릅니다.");
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        using var hosts = new WindowsUpdateHostLifecycle(store, origin);
        var acknowledgement = Path.Combine(ticket.Directory, "worker-ready.json");
        File.WriteAllText(acknowledgement, new JsonObject { ["pid"] = Environment.ProcessId, ["origin"] = origin.Id }.ToJsonString());
        var result = await new UpdateSwitch(installation, hosts).Run(stage, ticket.Update, origin.Id, deadline.Token);
        File.WriteAllText(Path.Combine(ticket.Directory, "result.json"), new JsonObject { ["status"] = result.ToString(), ["version"] = ticket.Update.Version.ToString() }.ToJsonString());
    }
}

internal sealed class WindowsUpdateHostLifecycle(string store, Process origin) : IUpdateHostLifecycle, IDisposable
{
    private readonly List<Process> started = [];
    public Task WaitForExit(int originProcess, CancellationToken token)
    {
        if (originProcess != origin.Id) throw new InvalidDataException("업데이트 프로세스가 바뀌었습니다.");
        return origin.WaitForExitAsync(token);
    }
    public async Task<bool> StartAndConfirm(string executable, CancellationToken token)
    {
        var launch = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true };
        launch.ArgumentList.Add("--resident");
        launch.ArgumentList.Add("--store"); launch.ArgumentList.Add(store);
        var candidate = Process.Start(launch) ?? throw new IOException("새 CoSkin 실행에 실패했습니다.");
        var expectedVersion = FileVersionInfo.GetVersionInfo(executable).ProductVersion?.Split('+')[0];
        started.Add(candidate);
        var confirmed = false;
        try
        {
            while (!candidate.HasExited)
            {
                token.ThrowIfCancellationRequested();
                await using var client = new InstanceChannel(store, claimOwnership: false);
                if (!client.IsOwner)
                    try
                    {
                        using var attempt = CancellationTokenSource.CreateLinkedTokenSource(token);
                        attempt.CancelAfter(TimeSpan.FromSeconds(2));
                        var health = await client.Send(new JsonObject { ["op"] = "health" }, attempt.Token);
                        if (health["ok"]?.GetValue<bool>() == true && health["pid"]?.GetValue<int>() == candidate.Id && health["version"]?.GetValue<string>() == expectedVersion)
                        {
                            confirmed = true;
                            return true;
                        }
                    }
                    catch (Exception error) when (error is IOException or OperationCanceledException) { token.ThrowIfCancellationRequested(); }
                await Task.Delay(250, token);
            }
            return false;
        }
        finally
        {
            // Only a failed candidate created by this worker is stopped. Never terminate Codex.
            if (!confirmed && !candidate.HasExited)
            {
                candidate.Kill();
                await candidate.WaitForExitAsync(CancellationToken.None);
            }
        }
    }
    public void Dispose() { foreach (var process in started) process.Dispose(); }
}
