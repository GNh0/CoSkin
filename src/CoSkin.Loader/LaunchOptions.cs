namespace CoSkin;

internal enum LaunchCommand
{
    Connect, Coupled, Prepare, Install, Uninstall, Import, Update, Quit
}

internal sealed record LaunchOptions(LaunchCommand Command, string Store, int? Port, string? ImportPath, bool Associate, int? CodexProcess)
{
    internal static LaunchOptions Parse(string[] arguments)
    {
        var command = LaunchCommand.Connect;
        var commandSeen = false;
        var store = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CoSkin");
        int? port = null;
        int? codexProcess = null;
        string? importPath = null;
        var associate = false;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var index = 0; index < arguments.Length; index++)
        {
            var option = arguments[index];
            if (!seen.Add(option))
                throw new InvalidDataException("명령 옵션이 중복되었습니다: " + option);
            string Value()
            {
                if (++index >= arguments.Length || arguments[index].StartsWith("--", StringComparison.Ordinal))
                    throw new InvalidDataException("명령 옵션 값이 필요합니다: " + option);
                return arguments[index];
            }
            void Select(LaunchCommand next)
            {
                if (commandSeen)
                    throw new InvalidDataException("실행 명령은 하나만 지정할 수 있습니다.");
                commandSeen = true;
                command = next;
            }
            switch (option)
            {
                case "--store":
                    store = Path.GetFullPath(Value());
                    break;
                case "--port":
                    if (!int.TryParse(Value(), out var number) || number < 1024 || number > 65535)
                        throw new InvalidDataException("연결 포트 범위는 1024~65535입니다.");
                    port = number;
                    break;
                case "--resident":
                    Select(LaunchCommand.Connect);
                    break;
                case "--with-codex":
                    Select(LaunchCommand.Coupled);
                    break;
                case "--prepare-launch":
                    Select(LaunchCommand.Prepare);
                    break;
                case "--install":
                    Select(LaunchCommand.Install);
                    break;
                case "--uninstall":
                    Select(LaunchCommand.Uninstall);
                    break;
                case "--import":
                    Select(LaunchCommand.Import);
                    importPath = Path.GetFullPath(Value());
                    break;
                case "--quit":
                    Select(LaunchCommand.Quit);
                    break;
                case "--codex-pid":
                    if (!int.TryParse(Value(), out var processId) || processId <= 0)
                        throw new InvalidDataException("Codex 프로세스 번호는 양수여야 합니다.");
                    codexProcess = processId;
                    break;
                case "--apply-update":
                    Select(LaunchCommand.Update);
                    importPath = Path.GetFullPath(Value());
                    break;
                case "--associate":
                    associate = true;
                    break;
                default:
                    throw new InvalidDataException("알 수 없는 명령 옵션입니다: " + option);
            }
        }
        if (associate && command != LaunchCommand.Install)
            throw new InvalidDataException("파일 연결 옵션은 설치 명령에서만 사용할 수 있습니다.");
        if (port is not null && command is not (LaunchCommand.Connect or LaunchCommand.Import))
            throw new InvalidDataException("이 명령에서는 연결 포트를 지정할 수 없습니다.");
        if (seen.Contains("--store") && command is LaunchCommand.Install or LaunchCommand.Uninstall)
            throw new InvalidDataException("설치 등록 명령에서는 별도 저장소를 지정할 수 없습니다.");
        if (codexProcess is not null && (port is not null || command is not (LaunchCommand.Connect or LaunchCommand.Import)))
            throw new InvalidDataException("대상 Codex 지정은 독립 연결 명령에서만 사용할 수 있습니다.");
        return new(command, Path.TrimEndingDirectorySeparator(Path.GetFullPath(store)), port, importPath, associate, codexProcess);
    }
}
