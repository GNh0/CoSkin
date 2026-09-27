using System.Threading.Channels;
namespace CoSkin;

/// <summary>Idle waiting is event driven; only the owned connection manifest is observed.</summary>
internal sealed class ResidentConnectionSignal : IDisposable
{
    private readonly string store;
    private readonly FileSystemWatcher watcher;
    private long generation;
    private long attemptedGeneration = -1;
    private readonly EndpointRetry retry = new();
    private CodexInstallation? installation;
    private int? preferredPort;
    private readonly bool explicitEndpoint;
    private readonly Func<CancellationToken, Task<int?>>? probe;
    private readonly Func<bool>? retryPending;
    private readonly Channel<bool> changes = Channel.CreateBounded<bool>(new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite });
    internal ResidentConnectionSignal(string store, int? initialPort = null, Func<CancellationToken, Task<int?>>? probe = null, Func<bool>? retryPending = null)
    {
        this.store = store;
        preferredPort = initialPort;
        explicitEndpoint = initialPort is not null;
        attemptedGeneration = 0;
        this.probe = probe;
        this.retryPending = retryPending;
        watcher = new FileSystemWatcher(store, "managed-connection.json") { NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite, EnableRaisingEvents = true };
        watcher.Changed += Changed;
        watcher.Created += Changed;
        watcher.Deleted += Changed;
        watcher.Renamed += Changed;
    }
    private void Changed(object sender, FileSystemEventArgs args)
    {
        Interlocked.Increment(ref generation);
        changes.Writer.TryWrite(true);
    }
    internal void Wake()
    {
        retry.WakeAfterExhaustion();
        changes.Writer.TryWrite(true);
    }
    internal async Task<int?> FindReadyPort(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var current = Volatile.Read(ref generation);
        if (attemptedGeneration != current)
        {
            attemptedGeneration = current;
            retry.Reset();
            installation = null;
            if (!explicitEndpoint)
                preferredPort = null;
        }
        if (preferredPort is null && probe is null && !File.Exists(Path.Combine(store, "managed-connection.json")))
            return null;
        if (!retry.TryAttempt())
            return null;
        if (preferredPort is int configured)
            return configured;
        if (probe is not null)
            return await probe(cancellationToken);
        installation ??= await WindowsLauncher.Discover();
        return await WindowsLauncher.ManagedConnection(store, installation);
    }
    internal void RequestPort(int port)
    {
        preferredPort = port;
        retry.Reset();
        Wake();
    }
    internal void Connected(int port)
    {
        preferredPort = port;
        retry.Reset();
    }
    internal void BeginRecovery(int port)
    {
        preferredPort = explicitEndpoint && port > 0 ? port : null;
        retry.BeginRecovery();
    }
    internal void Block() => retry.Block();
    internal async Task Wait(CancellationToken cancellationToken)
    {
        using var wait = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var signal = changes.Reader.WaitToReadAsync(wait.Token).AsTask();
        var delay = retry.Delay;
        var resume = delay is null && retry.Exhausted && retryPending?.Invoke() == true;
        if (resume) delay = TimeSpan.FromSeconds(5);
        try
        {
            if (delay is not null)
                await Task.WhenAny(signal, Task.Delay(delay.Value, wait.Token));
            else
                await signal;
            cancellationToken.ThrowIfCancellationRequested();
            if (resume) retry.WakeAfterExhaustion();
            if (signal.IsCompletedSuccessfully && signal.Result)
            {
                await Task.Delay(150, cancellationToken);
                while (changes.Reader.TryRead(out _))
                {
                }
            }
        }
        finally { wait.Cancel(); }
    }
    public void Dispose()
    {
        watcher.Dispose();
        changes.Writer.TryComplete();
    }
}
