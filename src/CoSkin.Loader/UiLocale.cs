namespace CoSkin;

internal static class UiLocale
{
    internal static string Normalize(string? locale) => locale?.Split('-', '_')[0].ToLowerInvariant() switch
    {
        "ko" => "ko",
        "ja" => "ja",
        "zh" => "zh-CN",
        _ => "en"
    };
}
