using System.Text.Json.Nodes;
namespace CoSkin;

/// <summary>Only the transactional installation service owns registration and shortcut mutations.</summary>
internal static class WindowsInstaller
{
    private static string Root => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CoSkin");
    internal static bool IsInstalledStore(Library library)
    {
        if (!Path.GetFullPath(library.StorePath).Equals(Path.GetFullPath(Root), StringComparison.OrdinalIgnoreCase) || ShouldOfferSetup())
            return false;
        var record = new InstallationService(Root, new WindowsInstallationPlatform()).Current();
        if (!record.Executable.Equals(Environment.ProcessPath, StringComparison.OrdinalIgnoreCase))
            return false;
        using var executable = File.OpenRead(record.Executable);
        var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(executable));
        return record.Files.Any(file => file.Path == record.Executable && file.Hash == hash);
    }
    internal static bool ShouldOfferSetup()
    {
        var executable = Environment.ProcessPath;
        return executable is not null && Path.GetFileName(executable).Equals("CoSkin.Loader.exe", StringComparison.OrdinalIgnoreCase)
            && !Path.GetFullPath(executable).StartsWith(Path.Combine(Root, "bin") + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }
    internal static void Install(bool associate)
    {
        if (!string.Equals(Path.GetFileName(Environment.ProcessPath), "CoSkin.Loader.exe", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Windows 독립 실행 패키지에서 설치해 주세요.");
        foreach (var name in new[] { "CoSkin.Loader.exe", "renderer.js", "THIRD-PARTY-NOTICES.txt" })
            if (!File.Exists(Path.Combine(AppContext.BaseDirectory, name)))
                throw new InvalidDataException("배포 파일이 누락되었습니다.");
        var preferences = new RuntimePreferenceStore(Root);
        var previous = preferences.Read();
        var choice = SetupDialog.Show(previous, associate);
        if (choice is null)
            return;
        preferences.Write(choice.Preferences);
        try
        {
            var installed = new InstallationService(Root, new WindowsInstallationPlatform()).Install(AppContext.BaseDirectory, choice.Associate, ProductVersion.Display, desktopShortcut: choice.DesktopShortcut, startAtSignIn: choice.Preferences.StartAtSignIn);
            Console.WriteLine("CoSkin 설치 완료: " + installed.Executable);
            SetupDialog.Completed();
        }
        catch
        {
            if (preferences.Read() == choice.Preferences)
                preferences.Write(previous);
            throw;
        }
    }
    internal static void Uninstall()
    {
        var removed = new InstallationService(Root, new WindowsInstallationPlatform()).Uninstall();
        Console.WriteLine(removed.Files.Length == 0 ? "CoSkin 설치 등록을 해제했습니다. 사용자 테마와 데이터는 보존했습니다." : "설치 등록을 해제했습니다. 실행 중이거나 변경된 파일은 보존하여 후속 정리가 필요합니다.");
    }
}
