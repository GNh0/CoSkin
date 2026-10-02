namespace CoSkin;

internal static class MediaLimits
{
    internal const long ImageBytes = 25L * 1024 * 1024;
    internal const long VideoBytes = 512L * 1024 * 1024;
    internal static long Bytes(string mime) => mime is "video/mp4" or "video/webm" ? VideoBytes : ImageBytes;
}
