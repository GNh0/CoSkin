using System.Text.RegularExpressions;
namespace CoSkin;

/// <summary>SemVer precedence for the running product; feeds accept stable releases only.</summary>
internal sealed record ReleaseVersion(StableVersion Core, string[] Prerelease) : IComparable<ReleaseVersion>
{
    internal static ReleaseVersion Parse(string text)
    {
        var match = Regex.Match(text, @"^(?<core>(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5}))(?:-(?<pre>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$", RegexOptions.CultureInvariant);
        if (!match.Success || text.Length > 128)
            throw new InvalidDataException("제품 버전 형식이 올바르지 않습니다.");
        var ids = match.Groups["pre"].Success ? match.Groups["pre"].Value.Split('.') : [];
        if (ids.Any(part => part.All(char.IsAsciiDigit) && part.Length > 1 && part[0] == '0'))
            throw new InvalidDataException("제품 사전 배포 버전 형식이 올바르지 않습니다.");
        return new(StableVersion.Parse(match.Groups["core"].Value), ids);
    }
    public int CompareTo(ReleaseVersion? other)
    {
        if (other is null) return 1;
        var core = Core.CompareTo(other.Core);
        if (core != 0) return core;
        if (Prerelease.Length == 0) return other.Prerelease.Length == 0 ? 0 : 1;
        if (other.Prerelease.Length == 0) return -1;
        for (var i = 0; i < Math.Min(Prerelease.Length, other.Prerelease.Length); i++)
        {
            var left = Prerelease[i]; var right = other.Prerelease[i];
            var a = left.All(char.IsAsciiDigit); var b = right.All(char.IsAsciiDigit);
            var value = a && b ? left.Length.CompareTo(right.Length) : a != b ? a ? -1 : 1 : 0;
            if (value == 0) value = string.CompareOrdinal(left, right);
            if (value != 0) return value;
        }
        return Prerelease.Length.CompareTo(other.Prerelease.Length);
    }
}

internal static class UpdateTrust
{
    // Reviewed public SPKI only. No mutable runtime override or production test key.
    internal static byte[]? PublisherKey()
    {
        using var stream = typeof(UpdateTrust).Assembly.GetManifestResourceStream("CoSkin.UpdatePublisher.spki");
        if (stream is null) return null;
        if (stream.Length is <= 0 or > 256) throw new InvalidDataException("업데이트 게시자 설정이 올바르지 않습니다.");
        var bytes = new byte[(int)stream.Length]; stream.ReadExactly(bytes); return bytes;
    }
}
