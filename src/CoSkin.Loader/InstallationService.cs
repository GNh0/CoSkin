using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace CoSkin;

internal sealed record RegistrationChange(string Key, string Name, RegistrationValue? Before, RegistrationValue? After);
internal sealed record InstalledArtifact(string Path, string Hash);
internal sealed record InstallationRecord(int FormatVersion, string Executable, InstalledArtifact[] Files, RegistrationChange[] Registrations, string Shortcut, byte[]? PreviousShortcut, string? DesktopShortcut = null, byte[]? PreviousDesktopShortcut = null);
internal sealed record InstallationJournal(InstallationRecord Proposed, byte[]? PreviousMarker, byte[]? PreviousShortcut, RegistrationChange[] Rollback, bool Removing = false, byte[]? DesktopRollback = null);

/// <summary>File and registration transaction with an on-disk recovery journal.</summary>
internal sealed class InstallationService(string root, IInstallationPlatform platform)
{
    private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\CoSkin";
    internal const string StartupKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    internal const string StartupName = "CoSkin.Resident";
    private const string ProgramId = "CoSkin.ThemeFile";
    private static readonly string[] BundleFiles = ["CoSkin.Loader.exe", "renderer.js", "THIRD-PARTY-NOTICES.txt"];
    private string Bin => Path.Combine(Path.GetFullPath(root), "bin");
    private string Marker => Path.Combine(Bin, "installation.json");
    private string Journal => Path.Combine(Bin, "installation-transaction.json");

    internal InstallationRecord Current()
    {
        RejectLinks(Marker);
        var record = Read<InstallationRecord>(File.ReadAllBytes(Marker));
        Validate(record);
        return record;
    }

    internal void SetStartup(bool enabled)
    {
        RejectLinks(Bin);
        using var ownership = new FileStream(Path.Combine(Bin, "installation.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        Recover();
        var bytes = File.ReadAllBytes(Marker);
        var record = Read<InstallationRecord>(bytes);
        Validate(record);
        var actual = platform.Read(StartupKey, StartupName);
        var command = new RegistrationValue("String", JsonValue.Create(SignInStartup.Command(record.Executable))!);
        if (actual is not null && !Equal(actual, command))
            throw new InvalidDataException("자동 시작 등록 소유권이 다릅니다.");
        var old = record.Registrations.FirstOrDefault(change => change.Key == StartupKey && change.Name == StartupName);
        var change = new RegistrationChange(StartupKey, StartupName, old?.Before, enabled ? command : null);
        var next = record with
        {
            Registrations = record.Registrations.Where(entry => entry.Key != StartupKey || entry.Name != StartupName).Append(change).ToArray()
        };
        var rollback = new RegistrationChange(StartupKey, StartupName, actual, change.After);
        var shortcutBytes = File.Exists(record.Shortcut) ? File.ReadAllBytes(record.Shortcut) : null;
        var desktopBytes = record.DesktopShortcut is string desktop && File.Exists(desktop) ? File.ReadAllBytes(desktop) : null;
        Atomic(Journal, JsonSerializer.SerializeToUtf8Bytes(new InstallationJournal(next, bytes, shortcutBytes, [rollback], DesktopRollback: desktopBytes)));
        try
        {
            platform.Write(StartupKey, StartupName, change.After);
            Atomic(Marker, JsonSerializer.SerializeToUtf8Bytes(next));
            File.Delete(Journal);
        }
        catch { Recover(); throw; }
    }

    internal InstallationRecord Install(string sourceDirectory, bool associate, string version = "0.1.0", bool desktopShortcut = true, bool? startAtSignIn = null)
    {
        ReleaseVersion.Parse(version);
        RejectLinks(Bin);
        Directory.CreateDirectory(Bin);
        using var ownership = new FileStream(Path.Combine(Bin, "installation.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        Recover();
        var previousBytes = File.Exists(Marker) ? File.ReadAllBytes(Marker) : null;
        var previous = previousBytes is null ? null : Read<InstallationRecord>(previousBytes);
        if (previous is not null)
            Validate(previous);
        var sources = BundleFiles.Select(name => Path.Combine(Path.GetFullPath(sourceDirectory), name)).ToArray();
        foreach (var source in sources)
        {
            RejectLinks(source);
            if (!File.Exists(source))
                throw new FileNotFoundException("배포 파일이 누락되었습니다.", source);
        }
        var hashes = sources.Select(Hash).ToArray();
        var identity = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join("\n", hashes))))[..20];
        var directory = Path.Combine(Bin, version + "-" + identity);
        Managed(directory);
        var files = BundleFiles.Select((name, index) => new InstalledArtifact(Path.Combine(directory, name), hashes[index])).ToArray();
        var existed = Directory.Exists(directory);
        var executable = files[0].Path;
        var changes = Registrations(executable, associate, previous, version, startAtSignIn);
        var shortcut = Path.GetFullPath(platform.ShortcutPath);
        RejectLinks(shortcut);
        var target = platform.ShortcutTarget(shortcut);
        if (target is not null && !OwnsExecutable(previous, target))
            throw new InvalidDataException("같은 이름의 다른 바로가기가 있어 설치하지 않았습니다.");
        var shortcutBytes = File.Exists(shortcut) ? File.ReadAllBytes(shortcut) : null;
        var desktop = desktopShortcut || previous?.DesktopShortcut is not null ? Path.GetFullPath(platform.DesktopShortcutPath) : null;
        byte[]? desktopBytes = null;
        if (desktop is not null)
        {
            RejectLinks(desktop);
            var desktopTarget = platform.ShortcutTarget(desktop);
            if (desktopTarget is not null && (!OwnsExecutable(previous, desktopTarget) || (previous!.DesktopShortcut != desktop && platform.ShortcutArguments(desktop) is not ("--with-codex" or "--resident"))))
                throw new InvalidDataException("같은 이름의 다른 바탕화면 바로가기가 있어 덮어쓰지 않습니다.");
            desktopBytes = File.Exists(desktop) ? File.ReadAllBytes(desktop) : null;
        }
        var retained = previous?.Files.Where(file => !files.Any(next => next.Path.Equals(file.Path, StringComparison.OrdinalIgnoreCase))) ?? [];
        var record = new InstallationRecord(1, executable, files.Concat(retained).ToArray(), changes, shortcut, previous is null ? shortcutBytes : previous.PreviousShortcut, desktop, previous?.PreviousDesktopShortcut);
        if (record.Files.Length > 4096)
            throw new InvalidDataException("보존 중인 설치 버전이 많습니다. 설치 등록 해제 후 다시 설치해 주세요.");
        Validate(record);
        if (!existed)
        {
            var staging = Path.Combine(Bin, ".stage-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(staging);
            try
            {
                for (var index = 0; index < sources.Length; index++)
                {
                    var output = Path.Combine(staging, BundleFiles[index]);
                    File.Copy(sources[index], output, false);
                    if (Hash(output) != hashes[index])
                        throw new IOException("배포 파일의 복사 무결성 검사에 실패했습니다.");
                }
                Directory.Move(staging, directory);
            }
            finally { DeleteKnownFiles(staging, BundleFiles); }
        }
        foreach (var file in files)
            if (!File.Exists(file.Path) || Hash(file.Path) != file.Hash)
                throw new InvalidDataException("설치 폴더의 배포 파일이 변경되었습니다.");
        var rollback = changes.Select(change => change with { Before = platform.Read(change.Key, change.Name) }).ToArray();
        Atomic(Journal, JsonSerializer.SerializeToUtf8Bytes(new InstallationJournal(record, previousBytes, shortcutBytes, rollback, DesktopRollback: desktopBytes)));
        try
        {
            foreach (var change in changes)
                platform.Write(change.Key, change.Name, change.After);
            Directory.CreateDirectory(Path.GetDirectoryName(shortcut)!);
            platform.CreateShortcut(shortcut, executable);
            if (!Path.GetFullPath(platform.ShortcutTarget(shortcut) ?? "").Equals(executable, StringComparison.OrdinalIgnoreCase))
                throw new IOException("바로가기 대상 검증에 실패했습니다.");
            if (desktop is not null)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(desktop)!);
                if (desktopShortcut)
                {
                    platform.CreateShortcut(desktop, executable);
                    if (platform.ShortcutTarget(desktop) != executable)
                        throw new IOException("바탕화면 바로가기 대상 검증에 실패했습니다.");
                }
                else if (previous is not null && platform.ShortcutTarget(desktop) == previous.Executable)
                    RestoreFile(desktop, previous.PreviousDesktopShortcut);
            }
            Atomic(Marker, JsonSerializer.SerializeToUtf8Bytes(record));
            File.Delete(Journal);
        }
        catch
        {
            Recover();
            if (!existed)
                DeleteArtifacts(files);
            throw;
        }
        // The installation transaction is committed before optional housekeeping.
        // Cleanup failure cannot roll a working registration back to deleted files.
        try
        {
            var protectedDirectories = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                Path.GetDirectoryName(record.Executable)!
            };
            if (previous is not null)
                protectedDirectories.Add(Path.GetDirectoryName(previous.Executable)!);
            var older = record.Files.Where(file => !protectedDirectories.Contains(Path.GetDirectoryName(file.Path)!)).ToArray();
            var remaining = DeleteArtifacts(older);
            record = record with
            {
                Files = record.Files.Except(older).Concat(remaining).ToArray()
            };
            Atomic(Marker, JsonSerializer.SerializeToUtf8Bytes(record));
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            Console.Error.WriteLine("이전 배포 파일 정리를 다음 실행으로 미뤘습니다: " + error.Message);
        }
        return record;
    }

    internal InstallationRecord Uninstall()
    {
        RejectLinks(Bin);
        using var ownership = new FileStream(Path.Combine(Bin, "installation.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        Recover();
        if (!File.Exists(Marker))
            throw new InvalidDataException("CoSkin 설치 기록을 찾지 못했습니다.");
        var record = Read<InstallationRecord>(File.ReadAllBytes(Marker));
        Validate(record);
        var rollback = record.Registrations.Where(change => Equal(platform.Read(change.Key, change.Name), change.After))
            .Select(change => new RegistrationChange(change.Key, change.Name, change.After, change.Before)).ToArray();
        var previousShortcut = File.Exists(record.Shortcut) ? File.ReadAllBytes(record.Shortcut) : null;
        Atomic(Journal, JsonSerializer.SerializeToUtf8Bytes(new InstallationJournal(record, File.ReadAllBytes(Marker), previousShortcut, rollback, true, record.DesktopShortcut is string desktopPathBefore && File.Exists(desktopPathBefore) ? File.ReadAllBytes(desktopPathBefore) : null)));
        try
        {
            foreach (var change in rollback.Reverse())
                platform.Write(change.Key, change.Name, change.After);
            if (platform.ShortcutTarget(record.Shortcut) is string target && Path.GetFullPath(target).Equals(record.Executable, StringComparison.OrdinalIgnoreCase))
                RestoreFile(record.Shortcut, record.PreviousShortcut);
            if (record.DesktopShortcut is string desktopPath && platform.ShortcutTarget(desktopPath) == record.Executable)
                RestoreFile(desktopPath, record.PreviousDesktopShortcut);
            File.Delete(Journal);
        }
        catch { Recover(); throw; }
        var retained = DeleteArtifacts(record.Files);
        if (retained.Length == 0)
            File.Delete(Marker);
        else
            Atomic(Marker, JsonSerializer.SerializeToUtf8Bytes(record));
        return record with
        {
            Files = retained
        };
    }

    private RegistrationChange[] Registrations(string executable, bool associate, InstallationRecord? previous, string version, bool? startAtSignIn)
    {
        var values = new List<(string Key, string Name, RegistrationValue? Value)>();
        RegistrationValue Text(string value) => new("String", JsonValue.Create(value)!);
        void Add(string key, string name, string value) => values.Add((key, name, Text(value)));
        var current = platform.Read(UninstallKey, "UninstallString");
        if (current is not null && (previous is null || !Equal(current, Text(Quote(previous.Executable) + " --uninstall"))))
            throw new InvalidDataException("기존 설치 등록의 소유권을 확인하지 못했습니다.");
        var startup = platform.Read(StartupKey, StartupName);
        if (startup is not null)
        {
            if (previous is null || !Equal(startup, Text(SignInStartup.Command(previous.Executable))))
                throw new InvalidDataException("자동 시작 등록의 소유권을 확인하지 못했습니다.");
            values.Add((StartupKey, StartupName, startAtSignIn == false ? null : Text(SignInStartup.Command(executable))));
        }
        else if (startAtSignIn == true)
            Add(StartupKey, StartupName, SignInStartup.Command(executable));
        Add(UninstallKey, "DisplayName", "CoSkin");
        Add(UninstallKey, "DisplayVersion", version);
        Add(UninstallKey, "Publisher", "CoSkin");
        Add(UninstallKey, "InstallLocation", Path.GetDirectoryName(executable)!);
        Add(UninstallKey, "UninstallString", Quote(executable) + " --uninstall");
        values.Add((UninstallKey, "NoModify", new("DWord", JsonValue.Create(1)!)));
        values.Add((UninstallKey, "NoRepair", new("DWord", JsonValue.Create(1)!)));
        if (associate || previous?.Registrations.Any(change => change.Key == @"Software\Classes\.coskin") == true)
        {
            var commandKey = @"Software\Classes\" + ProgramId + @"\shell\open\command";
            var existing = platform.Read(commandKey, "");
            if (existing is not null && (previous is null || !Equal(existing, Text(Quote(previous.Executable) + " --import " + Quote("%1")))))
                throw new InvalidDataException("테마 파일 연결 등록의 소유권을 확인하지 못했습니다.");
            Add(@"Software\Classes\.coskin", "", ProgramId);
            Add(@"Software\Classes\" + ProgramId, "", "CoSkin theme package");
            Add(commandKey, "", Quote(executable) + " --import " + Quote("%1"));
        }
        return values.Select(value =>
        {
            var old = previous?.Registrations.FirstOrDefault(change => change.Key == value.Key && change.Name == value.Name);
            var actual = platform.Read(value.Key, value.Name);
            var before = old is not null && Equal(actual, old.After) ? old.Before : actual;
            return new RegistrationChange(value.Key, value.Name, before, value.Value);
        }).ToArray();
    }

    private void Recover()
    {
        if (!File.Exists(Journal))
            return;
        var transaction = Read<InstallationJournal>(File.ReadAllBytes(Journal));
        Validate(transaction.Proposed);
        if (transaction.Rollback.Any(change => !transaction.Proposed.Registrations.Any(proposed => proposed.Key == change.Key && proposed.Name == change.Name)))
            throw new InvalidDataException("설치 복구 기록이 일치하지 않습니다.");
        foreach (var change in transaction.Rollback.Reverse())
            if (Equal(platform.Read(change.Key, change.Name), change.After))
                platform.Write(change.Key, change.Name, change.Before);
        var shortcut = transaction.Proposed.Shortcut;
        if (platform.ShortcutTarget(shortcut) == transaction.Proposed.Executable || (transaction.Removing && !File.Exists(shortcut)))
            RestoreFile(shortcut, transaction.PreviousShortcut);
        if (transaction.Proposed.DesktopShortcut is string desktopPath && (platform.ShortcutTarget(desktopPath) == transaction.Proposed.Executable || !File.Exists(desktopPath)))
            RestoreFile(desktopPath, transaction.DesktopRollback);
        RestoreFile(Marker, transaction.PreviousMarker);
        File.Delete(Journal);
    }

    private void Validate(InstallationRecord record)
    {
        if (record.FormatVersion != 1 || record.Files.Length is < 3 or > 4096)
            throw new InvalidDataException("설치 기록 형식을 지원하지 않습니다.");
        Managed(record.Executable);
        if (Path.GetFileName(record.Executable) != "CoSkin.Loader.exe")
            throw new InvalidDataException("설치 실행 파일 경로 오류");
        foreach (var file in record.Files)
        {
            Managed(file.Path);
            var version = Path.GetFileName(Path.GetDirectoryName(file.Path));
            var separator = version?.LastIndexOf('-') ?? -1;
            if (version is null || separator < 1 || version.Length - separator - 1 != 20 || version[(separator + 1)..].Any(character => !Uri.IsHexDigit(character)))
                throw new InvalidDataException("설치 버전 폴더 기록 오류");
            ReleaseVersion.Parse(version[..separator]);
            if (!BundleFiles.Contains(Path.GetFileName(file.Path)) || file.Hash.Length != 64 || file.Hash.Any(character => !Uri.IsHexDigit(character)))
                throw new InvalidDataException("설치 파일 기록 오류");
        }
        if (Path.GetFullPath(record.Shortcut) != Path.GetFullPath(platform.ShortcutPath))
            throw new InvalidDataException("바로가기 기록 경로 오류");
        if (record.DesktopShortcut is not null && Path.GetFullPath(record.DesktopShortcut) != Path.GetFullPath(platform.DesktopShortcutPath))
            throw new InvalidDataException("바탕화면 바로가기 기록 경로 오류");
        foreach (var change in record.Registrations)
        {
            var allowed = change.Key == StartupKey && change.Name == StartupName || (change.Key == UninstallKey
                ? new[] { "DisplayName", "DisplayVersion", "Publisher", "InstallLocation", "UninstallString", "NoModify", "NoRepair" }.Contains(change.Name)
                : change.Name == "" && new[] { @"Software\Classes\.coskin", @"Software\Classes\CoSkin.ThemeFile", @"Software\Classes\CoSkin.ThemeFile\shell\open\command" }.Contains(change.Key));
            if (!allowed)
                throw new InvalidDataException("설치 등록 경로 오류");
        }
    }

    private InstalledArtifact[] DeleteArtifacts(InstalledArtifact[] files)
    {
        var retained = new List<InstalledArtifact>();
        foreach (var file in files)
        {
            Managed(file.Path);
            if (!File.Exists(file.Path))
                continue;
            if (Hash(file.Path) != file.Hash)
            {
                retained.Add(file);
                continue;
            }
            try
            {
                File.Delete(file.Path);
            }
            catch (IOException) { retained.Add(file); }
            catch (UnauthorizedAccessException) { retained.Add(file); }
        }
        foreach (var directory in files.Select(file => Path.GetDirectoryName(file.Path)!).Distinct())
            if (Directory.Exists(directory) && !Directory.EnumerateFileSystemEntries(directory).Any())
                Directory.Delete(directory, false);
        return retained.ToArray();
    }

    private void Managed(string path)
    {
        if (!Path.GetFullPath(path).StartsWith(Bin + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("설치 관리 경로 밖의 파일입니다.");
        RejectLinks(path);
    }
    private static void RejectLinks(string path)
    {
        for (var current = Path.GetFullPath(path); current is not null; current = Path.GetDirectoryName(current))
            if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidDataException("연결된 경로에서는 설치 파일을 관리할 수 없습니다.");
    }
    private static T Read<T>(byte[] bytes) => JsonSerializer.Deserialize<T>(JsonContract.Read(bytes).ToJsonString()) ?? throw new InvalidDataException("설치 기록을 읽지 못했습니다.");
    private static bool Equal(RegistrationValue? left, RegistrationValue? right) => left?.Kind == right?.Kind && JsonNode.DeepEquals(left?.Data, right?.Data);
    private static string Quote(string path) => "\"" + path + "\"";
    private static string Hash(string path)
    {
        using var stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream));
    }
    private static bool OwnsExecutable(InstallationRecord? installation, string target)
    {
        if (installation is null || !Path.GetFileName(target).Equals("CoSkin.Loader.exe", StringComparison.OrdinalIgnoreCase))
            return false;
        var resolved = Path.GetFullPath(target);
        foreach (var artifact in installation.Files)
            if (resolved.Equals(artifact.Path, StringComparison.OrdinalIgnoreCase))
            {
                RejectLinks(resolved);
                return File.Exists(resolved) && Hash(resolved) == artifact.Hash;
            }
        return false;
    }
    private static void RestoreFile(string path, byte[]? bytes)
    {
        if (bytes is null)
            File.Delete(path);
        else
            Atomic(path, bytes);
    }
    private static void Atomic(string path, byte[] bytes)
    {
        RejectLinks(path);
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllBytes(temporary, bytes);
            File.Move(temporary, path, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private void DeleteKnownFiles(string directory, string[] names)
    {
        Managed(directory);
        foreach (var name in names)
        {
            var file = Path.Combine(directory, name);
            if (File.Exists(file))
                File.Delete(file);
        }
        if (Directory.Exists(directory) && !Directory.EnumerateFileSystemEntries(directory).Any())
            Directory.Delete(directory, false);
    }
}
