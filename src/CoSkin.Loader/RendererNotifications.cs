namespace CoSkin;

internal static class RendererNotifications
{
    internal static async Task Broadcast(IEnumerable<Cdp> windows, string expression, Action<Cdp, Exception> failed)
    {
        foreach (var window in windows)
        {
            if (window.IsClosed) continue;
            try { await window.Evaluate(expression, TimeSpan.FromSeconds(2)); }
            catch (Exception error) { failed(window, error); }
        }
    }
}
