namespace CoSkin;

internal sealed record ResidentLaunchResult(int? Port, Exception? Error);

/// <summary>Codex launch failure leaves the already initialized CoSkin resident alive.</summary>
internal static class ResidentLaunch
{
    internal static async Task<ResidentLaunchResult> Try(bool requested, RuntimePreferences preferences, Func<Task<int>> launch)
    {
        if (!requested || !preferences.LaunchWithCodex)
            return new(null, null);
        try
        {
            var port = await launch();
            if (port is < 1024 or > 65535)
                throw new InvalidDataException("실행 연결 포트 범위 오류");
            return new(port, null);
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            return new(null, error);
        }
    }
}
