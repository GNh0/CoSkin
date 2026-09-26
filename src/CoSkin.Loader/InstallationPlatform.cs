using Microsoft.Win32;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace CoSkin;

internal sealed record RegistrationValue(string Kind, JsonNode Data);

internal interface IInstallationPlatform
{
    RegistrationValue? Read(string key, string name);
    void Write(string key, string name, RegistrationValue? value);
    string ShortcutPath
    {
        get;
    }
    string DesktopShortcutPath => Path.Combine(Path.GetDirectoryName(ShortcutPath)!, "desktop", "CoSkin.lnk");
    string? ShortcutArguments(string path) => null;
    string? ShortcutTarget(string path);
    void CreateShortcut(string path, string executable);
}

/// <summary>Current-user integration only. UserChoice and machine-wide registry are never changed.</summary>
internal sealed class WindowsInstallationPlatform : IInstallationPlatform
{
    public string DesktopShortcutPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "CoSkin.lnk");
    public string ShortcutPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Codex + CoSkin.lnk");

    public RegistrationValue? Read(string path, string name)
    {
        using var key = Registry.CurrentUser.OpenSubKey(path);
        if (key is null || !key.GetValueNames().Contains(name, StringComparer.OrdinalIgnoreCase))
            return null;
        var kind = key.GetValueKind(name);
        var value = key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames)
            ?? throw new InvalidDataException("설치 등록 값을 읽지 못했습니다.");
        if (kind is not (RegistryValueKind.String or RegistryValueKind.ExpandString or RegistryValueKind.MultiString or RegistryValueKind.Binary or RegistryValueKind.DWord or RegistryValueKind.QWord))
            throw new InvalidDataException("설치 등록 값 형식을 지원하지 않습니다.");
        return new(kind.ToString(), JsonSerializer.SerializeToNode(value)!);
    }

    public void Write(string path, string name, RegistrationValue? value)
    {
        if (value is null)
        {
            using var existing = Registry.CurrentUser.OpenSubKey(path, true);
            existing?.DeleteValue(name, false);
            return;
        }
        var kind = Enum.Parse<RegistryValueKind>(value.Kind);
        object data = kind switch
        {
            RegistryValueKind.String or RegistryValueKind.ExpandString => value.Data.GetValue<string>(),
            RegistryValueKind.DWord => value.Data.GetValue<int>(),
            RegistryValueKind.QWord => value.Data.GetValue<long>(),
            RegistryValueKind.Binary => Convert.FromBase64String(value.Data.GetValue<string>()),
            RegistryValueKind.MultiString => value.Data.AsArray().Select(node => node!.GetValue<string>()).ToArray(),
            _ => throw new InvalidDataException("설치 등록 값 형식을 지원하지 않습니다.")
        };
        using var key = Registry.CurrentUser.CreateSubKey(path);
        key.SetValue(name, data, kind);
    }

    public string? ShortcutArguments(string path) => File.Exists(path) ? WithShortcut(path, shortcut => (string)shortcut.Arguments) : null;
    public string? ShortcutTarget(string path)
    {
        if (!File.Exists(path))
            return null;
        return WithShortcut(path, shortcut => (string)shortcut.TargetPath);
    }

    public void CreateShortcut(string path, string executable)
    {
        WithShortcut(path, shortcut =>
        {
            shortcut.TargetPath = executable;
            shortcut.WorkingDirectory = Path.GetDirectoryName(executable);
            shortcut.Description = "Codex + CoSkin";
            shortcut.Arguments = Path.GetFileName(path).Equals("CoSkin.lnk", StringComparison.OrdinalIgnoreCase) ? "--resident" : "--with-codex";
            shortcut.Save();
            return true;
        });
    }

    private static T WithShortcut<T>(string path, Func<dynamic, T> operation)
    {
        var type = Type.GetTypeFromProgID("WScript.Shell") ?? throw new IOException("Windows 바로가기 서비스를 찾지 못했습니다.");
        dynamic shell = Activator.CreateInstance(type) ?? throw new IOException("Windows 바로가기 서비스를 열지 못했습니다.");
        dynamic? shortcut = null;
        try
        {
            shortcut = shell.CreateShortcut(path);
            return operation(shortcut);
        }
        finally
        {
            if (shortcut is not null)
                Marshal.FinalReleaseComObject(shortcut);
            Marshal.FinalReleaseComObject(shell);
        }
    }
}
