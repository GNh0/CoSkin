using Microsoft.Win32;
namespace CoSkin;

internal interface ISignInRegistration
{
    string? Read();
    void Write(string? command);
}

/// <summary>Owns one opt-in HKCU value; unrelated startup entries are never touched.</summary>
internal sealed class SignInStartup(ISignInRegistration registration)
{
    internal void Set(bool enabled, string executable)
    {
        var command = Command(executable);
        var existing = registration.Read();
        if (existing is not null && !existing.Equals(command, StringComparison.Ordinal))
            throw new InvalidDataException("다른 자동 시작 등록이 있어 덮어쓰지 않습니다.");
        registration.Write(enabled ? command : null);
    }
    internal static string Command(string executable)
    {
        var path = Path.GetFullPath(executable);
        if (!Path.GetFileName(path).Equals("CoSkin.Loader.exe", StringComparison.OrdinalIgnoreCase) || path.Contains('"'))
            throw new InvalidDataException("자동 시작 실행 파일 경로가 올바르지 않습니다.");
        return "\"" + path + "\" --resident";
    }
}

internal sealed class WindowsSignInRegistration : ISignInRegistration
{
    private const string Key = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string Value = "CoSkin.Resident";
    public string? Read()
    {
        using var key = Registry.CurrentUser.OpenSubKey(Key);
        return key?.GetValue(Value, null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string;
    }
    public void Write(string? command)
    {
        using var key = Registry.CurrentUser.CreateSubKey(Key);
        if (command is null)
            key.DeleteValue(Value, false);
        else
            key.SetValue(Value, command, RegistryValueKind.String);
    }
}
