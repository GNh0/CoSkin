namespace CoSkin;

internal static class RendererSelection
{
    // Detached windows may connect before the main shell. They have no navigation
    // rail and cannot host the library, so dictionary order is not a UI preference.
    internal static async Task<Cdp?> MainShell(IEnumerable<Cdp> windows)
    {
        Cdp? fallback = null;
        foreach (var window in windows)
        {
            var state = await window.Evaluate("({ready:Boolean(window.__coskin && document.querySelector('nav[data-app-navigation-rail=\"true\"]')),focused:document.hasFocus()})");
            if (state?["ready"]?.GetValue<bool>() != true) continue;
            if (state["focused"]?.GetValue<bool>() == true) return window;
            fallback ??= window;
        }
        return fallback;
    }
}
