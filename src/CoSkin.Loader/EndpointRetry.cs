namespace CoSkin;

/// <summary>One readiness window, then event-only waiting. Invalid identity never retries.</summary>
internal sealed class EndpointRetry
{
    private int attempts;
    private bool blocked;
    private readonly object gate = new();
    internal bool Exhausted { get { lock (gate) return !blocked && attempts >= 6; } }
    internal void WakeAfterExhaustion()
    {
        lock (gate)
            if (!blocked && attempts >= 6)
                attempts = 0;
    }
    internal TimeSpan? Delay
    {
        get
        {
            lock (gate)
                return !blocked && attempts is > 0 and < 6 ? TimeSpan.FromMilliseconds(250 * (1 << (attempts - 1))) : null;
        }
    }
    internal bool TryAttempt()
    {
        lock (gate)
        {
            if (blocked || attempts >= 6)
                return false;
            attempts++;
            return true;
        }
    }
    internal void Reset()
    {
        lock (gate)
        {
            attempts = 0;
            blocked = false;
        }
    }
    internal void BeginRecovery()
    {
        lock (gate)
            if (attempts == 0 && !blocked)
                attempts = 1;
    }
    internal void Block()
    {
        lock (gate)
            blocked = true;
    }
}
