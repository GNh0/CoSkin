namespace CoSkin;

internal static class RendererRefresh
{
    // Refresh changes decorations in place; it needs neither a main shell nor focus.
    // A hidden renderer acknowledges a queued refresh and drains it when visible.
    internal static async Task<int> Request(IEnumerable<Cdp> windows, Action<Cdp, Exception> failed)
    {
        var results = await Task.WhenAll(windows.Where(window => !window.IsClosed).Select(async window =>
        {
            try
            {
                return (await window.Evaluate("window.__coskin?.refreshDecorations()", TimeSpan.FromSeconds(2)))?.GetValue<bool>() == true;
            }
            catch (Exception error)
            {
                failed(window, error);
                return false;
            }
        }));
        return results.Count(accepted => accepted);
    }
}
