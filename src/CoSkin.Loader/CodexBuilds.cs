namespace CoSkin;

internal sealed record CodexBuild(string PackageVersion, string AppVersion, string? ArchiveHash);

/// <summary>Explicit source-reviewed builds; future packages never inherit an adapter by version proximity.</summary>
internal static class CodexBuilds
{
    internal static CodexBuild? Find(string packageVersion) => packageVersion switch
    {
        "26.924.1866.0" => new(packageVersion, "26.924.20706", null),
        "26.924.2738.0" => new(packageVersion, "26.924.22138", "89FBA67324FFB8DD54CCF13B6F097172E697549EEB1F26396F86F972C10C5B0C"),
        _ => null
    };
    internal static bool Matches(CodexBuild build, string appVersion, string archiveHash) =>
        build.AppVersion == appVersion && (build.ArchiveHash is null || build.ArchiveHash == archiveHash);
}
