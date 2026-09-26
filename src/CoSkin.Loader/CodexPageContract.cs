namespace CoSkin;

internal static class CodexPageContract
{
    internal static bool Supports(string? text)
    {
        if (!Uri.TryCreate(text, UriKind.Absolute, out var uri) || uri.Scheme != "app" || uri.Host != "-" || !string.IsNullOrEmpty(uri.Fragment))
            return false;
        return uri.AbsolutePath switch
        {
            "/index.html" => uri.Query.Length == 0,
            "/detached-window.html" => uri.Query == "?initialRoute=%2Fdetached-window",
            _ => false
        };
    }
}
internal sealed class TrayActionException(string code) : Exception(code)
{
    internal string Code => Message;
}
