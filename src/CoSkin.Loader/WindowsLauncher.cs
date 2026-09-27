using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
namespace CoSkin;

internal sealed record CodexInstallation(string Family, string PackageVersion, string AppVersion, string AppDirectory);
internal static class WindowsLauncher
{
    private const string Family = "OpenAI.Codex_2p2nqsd0c76g0";
    private static string Literal(string value) => "'" + value.Replace("'", "''", StringComparison.Ordinal) + "'";

    private static async Task<string> PowerShell(string script)
    {
        var executable = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
        var start = new ProcessStartInfo(executable)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };
        // A PowerShell 7 parent can supply an incompatible module path to Windows PowerShell 5.1.
        // Restrict discovery to the built-in Windows modules; do not change machine configuration.
        start.Environment["PSModulePath"] = Path.Combine(Path.GetDirectoryName(executable)!, "Modules");
        script = "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); " + script;
        start.ArgumentList.Add("-NoProfile");
        start.ArgumentList.Add("-NonInteractive");
        start.ArgumentList.Add("-EncodedCommand");
        start.ArgumentList.Add(Convert.ToBase64String(Encoding.Unicode.GetBytes(script)));
        using var process = Process.Start(start) ?? throw new IOException("Windows 패키지 도구를 실행하지 못했습니다.");
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        try
        {
            await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(45));
        }
        catch (TimeoutException)
        {
            // Terminate only the helper we started. Never terminate Codex or a descendant process tree.
            if (!process.HasExited)
                process.Kill();
            await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
            throw new TimeoutException("Windows 패키지 도구의 응답 시간이 초과되었습니다.");
        }
        var text = await output;
        var diagnostic = await error;
        if (process.ExitCode != 0)
            throw new IOException("Windows 패키지 실행환경을 확인하지 못했습니다. " + diagnostic.Trim());
        return text.Trim();
    }
    internal static async Task<CodexInstallation> Discover()
    {
        var output = await PowerShell("$ErrorActionPreference='Stop'; $p=Get-AppxPackage -Name OpenAI.Codex; if(-not $p){throw 'Package discovery unavailable in this Windows user context'}; [pscustomobject]@{family=$p.PackageFamilyName;version=$p.Version.ToString();location=$p.InstallLocation}|ConvertTo-Json -Compress");
        var package = JsonNode.Parse(output)?.AsObject() ?? throw new IOException("설치된 Codex 패키지를 확인하지 못했습니다.");
        var family = JsonContract.String(package, "family");
        var version = JsonContract.String(package, "version");
        var build = CodexBuilds.Find(version);
        if (family != Family || build is null)
            throw new TrayActionException("unsupported-codex");
        var app = Path.GetFullPath(Path.Combine(JsonContract.String(package, "location"), "app"));
        var executable = Path.Combine(app, "ChatGPT.exe");
        await VerifySignature(executable);
        var metadata = Path.Combine(app, "resources", "owl-app.ini");
        var appVersion = build.AppVersion;
        if (File.Exists(metadata))
        {
            if (new FileInfo(metadata).Length > 4096 || File.GetAttributes(metadata).HasFlag(FileAttributes.ReparsePoint))
                throw new InvalidDataException("Codex 버전 정보 파일을 확인하지 못했습니다.");
            appVersion = "";
            foreach (var line in File.ReadLines(metadata))
                if (line.StartsWith("AppVersion=", StringComparison.Ordinal))
                {
                    if (appVersion.Length > 0)
                        throw new InvalidDataException("Codex 버전 정보가 중복되었습니다.");
                    appVersion = line[11..].Trim();
                }
        }
        else if (build.ArchiveHash is not null)
            throw new TrayActionException("unsupported-codex");
        var archiveHash = build.ArchiveHash is null ? "" : HashFile(Path.Combine(app, "resources", "app.asar"));
        if (!CodexBuilds.Matches(build, appVersion, archiveHash))
            throw new TrayActionException("unsupported-codex");
        return new(family, version, build.AppVersion, app);
    }
    internal static async Task VerifySignature(string executable)
    {
        var result = await PowerShell("$ErrorActionPreference='Stop'; Import-Module ($PSHOME+'\\Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; $s=Get-AuthenticodeSignature -LiteralPath " + Literal(executable) + "; [pscustomobject]@{status=$s.Status.ToString();publisher=$s.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false)}|ConvertTo-Json -Compress");
        var signature = JsonNode.Parse(result)?.AsObject() ?? throw new IOException("실행 파일 서명 검사 실패");
        if (signature["status"]?.GetValue<string>() != "Valid" || signature["publisher"]?.GetValue<string>() != "OpenAI OpCo, LLC")
            throw new InvalidDataException("Codex의 유효한 OpenAI 서명을 확인하지 못했습니다.");
    }
    private static string HashFile(string path)
    {
        using var input = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(input));
    }
    internal static async Task<CodexInstallation> VerifyRunning(string executable)
    {
        var installation = await Discover();
        // Discover has already verified the signature, version and archive at this exact path.
        // Managed copies still require their own signature and content comparisons below.
        if (Path.GetFullPath(executable).Equals(Path.Combine(installation.AppDirectory, "ChatGPT.exe"), StringComparison.OrdinalIgnoreCase))
            return installation;
        await VerifySignature(executable);
        if (HashFile(executable) != HashFile(Path.Combine(installation.AppDirectory, "ChatGPT.exe")))
            throw new InvalidDataException("실행 중인 Codex 버전이 지원 설치본과 다릅니다.");
        var archive = Path.Combine(Path.GetDirectoryName(executable)!, "resources", "app.asar");
        if (HashFile(archive) != HashFile(Path.Combine(installation.AppDirectory, "resources", "app.asar")))
            throw new InvalidDataException("실행 중인 Codex의 원본 무결성을 확인하지 못했습니다.");
        return installation;
    }
    internal static async Task<int> Launch(string store, bool prepareOnly)
    {
        var installation = await Discover();
        if (NativeAttachment.Available && installation.PackageVersion == "26.924.2738.0")
        {
            if (prepareOnly) return 0;
            var native = new NativeConnectionDiscovery(store);
            if (await native.Find(CancellationToken.None) is int attached) return attached;
            if (ResidentDetection.OriginalProcesses().Length > 0) throw new TrayActionException("not-connected");
            var original = Path.Combine(installation.AppDirectory, "ChatGPT.exe");
            await PowerShell("$ErrorActionPreference='Stop'; Invoke-CommandInDesktopPackage -PackageFamilyName " + Literal(installation.Family) + " -AppId 'App' -Command " + Literal(original) + " -PreventBreakaway");
            for (var attempt = 0; attempt < 30; attempt++)
            {
                await Task.Delay(1000);
                if (await native.Find(CancellationToken.None) is int opened) return opened;
            }
            throw new IOException("Codex 실행을 요청했습니다. 준비가 끝나면 상주 CoSkin이 연결을 다시 확인합니다.");
        }
        if (!prepareOnly && await ManagedConnection(store, installation) is int existingPort)
            return existingPort;
        if (!prepareOnly && Process.GetProcessesByName("ChatGPT").Length > 0)
            throw new TrayActionException("codex-running");
        var runtime = Path.GetFullPath(Path.Combine(store, "runtime", installation.PackageVersion));
        var ready = Path.Combine(runtime, "ready.json");
        if (!File.Exists(ready))
        {
            var staging = runtime + ".staging-" + Guid.NewGuid().ToString("N");
            Directory.CreateDirectory(staging);
            try
            {
                CopyDirectory(installation.AppDirectory, staging);
                await VerifyRunning(Path.Combine(staging, "ChatGPT.exe"));
                if (Directory.Exists(runtime))
                    throw new IOException("이전 준비 작업이 남아 있습니다. 진단 후 안전하게 복구해 주세요.");
                Directory.Move(staging, runtime);
                File.WriteAllText(ready, new JsonObject { ["packageVersion"] = installation.PackageVersion, ["appVersion"] = installation.AppVersion }.ToJsonString());
            }
            catch
            {
                var checkedStaging = Path.GetFullPath(staging);
                var checkedPrefix = Path.GetFullPath(runtime) + ".staging-";
                if (checkedStaging.StartsWith(checkedPrefix, StringComparison.OrdinalIgnoreCase) && Directory.Exists(checkedStaging))
                    Directory.Delete(checkedStaging, true);
                throw;
            }
        }
        var executable = Path.Combine(runtime, "ChatGPT.exe");
        await VerifyRunning(executable);
        if (prepareOnly)
        {
            Console.WriteLine("CoSkin 실행 준비 완료: " + runtime);
            return 0;
        }
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        var profile = Path.Combine(store, "profile");
        Directory.CreateDirectory(profile);
        var arguments = $"--user-data-dir=\"{profile}\" --remote-debugging-address=127.0.0.1 --remote-debugging-port={port}";
        await PowerShell("$ErrorActionPreference='Stop'; Invoke-CommandInDesktopPackage -PackageFamilyName " + Literal(installation.Family) + " -AppId 'App' -Command " + Literal(executable) + " -Args " + Literal(arguments) + " -PreventBreakaway");
        Console.WriteLine("CoSkin으로 Codex 실행을 요청했습니다. 기존 로그인·프로젝트 데이터는 Codex가 관리합니다.");
        var connection = Path.Combine(Path.GetFullPath(store), "managed-connection.json");
        var temporary = connection + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllText(temporary, new JsonObject { ["formatVersion"] = 1, ["port"] = port, ["executable"] = executable }.ToJsonString());
            File.Move(temporary, connection, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
        return port;
    }
    internal static async Task<int?> ManagedConnection(string store, CodexInstallation installation)
    {
        var path = Path.Combine(Path.GetFullPath(store), "managed-connection.json");
        if (!File.Exists(path))
            return null;
        if (File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint))
            throw new InvalidDataException("실행 연결 기록이 안전하지 않습니다.");
        var record = JsonContract.Read(File.ReadAllBytes(path), 4096);
        JsonContract.Fields(record, "formatVersion", "port", "executable");
        var expected = Path.GetFullPath(Path.Combine(store, "runtime", installation.PackageVersion, "ChatGPT.exe"));
        if (record["formatVersion"]?.GetValue<int>() != 1 || !Path.GetFullPath(JsonContract.String(record, "executable")).Equals(expected, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("실행 연결 기록과 관리 경로가 일치하지 않습니다.");
        var port = record["port"]?.GetValue<int>() ?? 0;
        if (port < 1024 || port > 65535)
            throw new InvalidDataException("실행 연결 포트 기록 오류");
        int owner;
        try
        {
            owner = NativeWindow.ListenerProcess(port);
        }
        catch (IOException) { return null; }
        if (!NativeWindow.VerifyExecutable(owner).Equals(expected, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("실행 연결의 프로세스가 관리 복사본과 다릅니다.");
        await VerifyRunning(expected);
        return port;
    }
    private static void CopyDirectory(string source, string destination)
    {
        foreach (var path in Directory.EnumerateFiles(source))
        {
            if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("지원하지 않는 설치 파일 유형입니다.");
            File.Copy(path, Path.Combine(destination, Path.GetFileName(path)), false);
        }
        foreach (var child in Directory.EnumerateDirectories(source))
        {
            if ((File.GetAttributes(child) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("지원하지 않는 설치 경로 유형입니다.");
            var target = Path.Combine(destination, Path.GetFileName(child));
            Directory.CreateDirectory(target);
            CopyDirectory(child, target);
        }
    }
}
