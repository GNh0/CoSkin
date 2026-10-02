namespace CoSkin;

internal static class CodexPageContract
{
    internal static bool IsDetached(string? text) => Supports(text) &&
        Uri.TryCreate(text, UriKind.Absolute, out var uri) && uri.AbsolutePath == "/detached-window.html";

    internal static bool IsRecoverableDetachedFailure(string? text, Exception error) =>
        IsDetached(text) && error is not OperationCanceledException && error is not TrayActionException &&
        (error is IOException && error is not InvalidDataException ||
         error is ObjectDisposedException or TimeoutException ||
         error is InvalidDataException data && (data.Message == "화면 초기화를 완료하지 못했습니다." ||
             data.Message.Contains("target closed while handling command", StringComparison.Ordinal)));

    // A disappearing or stalled renderer does not invalidate the authenticated
    // connection shared by the other windows. Transport failure still does.
    internal static bool IsRecoverableRendererFailure(string? text, Exception error, bool sharedConnectionClosed) =>
        !sharedConnectionClosed && Supports(text) &&
        (IsRecoverableDetachedFailure(text, error) ||
         error is ObjectDisposedException or TimeoutException ||
         error is IOException && error is not InvalidDataException ||
         error is InvalidDataException data && data.Message.Contains("target closed while handling command", StringComparison.Ordinal));

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
