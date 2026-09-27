using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json.Nodes;
namespace CoSkin;

internal sealed record NativeConnection(int Port, int ProcessId, long Started, CodexInstallation Installation);

internal static class NativeAttachment
{
    private const string ChromeHash = "B6F5C2323C642C3AD3DFDC3501AA94482970F88B4C12DB0875CE593AECE75C16";
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int type, IntPtr callback, IntPtr module, uint thread);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool PostThreadMessage(uint thread, uint message, UIntPtr w, IntPtr l);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    internal static bool Available => typeof(NativeAttachment).Assembly.GetManifestResourceNames().Contains("CoSkin.Native.dll");

    internal static async Task<NativeConnection> Open(string store, int processId, CancellationToken token)
    {
        using var process = Process.GetProcessById(processId);
        var started = process.StartTime.ToUniversalTime().Ticks;
        var executable = NativeWindow.VerifyExecutable(processId);
        var installation = await WindowsLauncher.VerifyRunning(executable);
        if (installation.PackageVersion != "26.924.2738.0" || !ResidentDetection.IsOriginalPath(executable, Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)))
            throw new TrayActionException("unsupported-codex");
        using (var chrome = File.OpenRead(Path.Combine(Path.GetDirectoryName(executable)!, "chrome.dll")))
            if (Convert.ToHexString(SHA256.HashData(chrome)) != ChromeHash)
                throw new TrayActionException("unsupported-codex");
        var handle = NativeWindow.AttachmentWindow(processId);
        var thread = GetWindowThreadProcessId(handle, out var owner);
        if (handle == IntPtr.Zero || thread == 0 || owner != processId)
            throw new IOException("Codex 창이 아직 연결을 받을 준비가 되지 않았습니다.");
        using var input = typeof(NativeAttachment).Assembly.GetManifestResourceStream("CoSkin.Native.dll") ?? throw new IOException("CoSkin 연결 모듈이 없습니다.");
        using var copy = new MemoryStream(); await input.CopyToAsync(copy, token);
        var bytes = copy.ToArray();
        var directory = Path.Combine(store, "native", Convert.ToHexString(SHA256.HashData(bytes)));
        RejectLinks(directory);
        Directory.CreateDirectory(directory);
        var dll = Path.Combine(directory, "CoSkin.Native.dll");
        if (File.Exists(dll))
        {
            RejectLinks(dll);
            if (!SHA256.HashData(File.ReadAllBytes(dll)).SequenceEqual(SHA256.HashData(bytes)))
                throw new InvalidDataException("CoSkin 연결 모듈의 무결성을 확인하지 못했습니다.");
        }
        else
        {
            using var output = new FileStream(dll, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
            output.Write(bytes); output.Flush(true);
        }
        var requestPath = Path.Combine(directory, $"request-{processId}.json");
        var responsePath = Path.Combine(directory, $"response-{processId}.json");
        RejectLinks(requestPath); RejectLinks(responsePath);
        var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var request = new JsonObject { ["contractVersion"] = 1, ["pid"] = processId, ["ownerPid"] = Environment.ProcessId, ["created"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), ["nonce"] = nonce };
        File.WriteAllText(requestPath, request.ToJsonString());
        var module = NativeLibrary.Load(dll);
        IntPtr hook = IntPtr.Zero;
        try
        {
            hook = SetWindowsHookEx(3, NativeLibrary.GetExport(module, "CoSkinConnectHook"), module, thread);
            if (hook == IntPtr.Zero || !PostThreadMessage(thread, 0x8000 + 0x26D, UIntPtr.Zero, IntPtr.Zero))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
            deadline.CancelAfter(TimeSpan.FromSeconds(12));
            var resend = System.Diagnostics.Stopwatch.StartNew();
            var requests = 1;
            while (true)
            {
                deadline.Token.ThrowIfCancellationRequested();
                if (process.HasExited) throw new IOException("연결을 준비하던 Codex가 종료되었습니다.");
                if (File.Exists(responsePath))
                {
                    RejectLinks(responsePath);
                    var response = JsonContract.Read(File.ReadAllBytes(responsePath), 4096);
                    if (response["nonce"]?.GetValue<string>() == nonce)
                    {
                        JsonContract.Fields(response, "contractVersion", "pid", "url", "nonce", "error");
                        if (response["error"] is not null) throw new IOException("Codex 연결 준비 실패: " + JsonContract.String(response, "error"));
                        var url = new Uri(JsonContract.String(response, "url"));
                        if (response["contractVersion"]?.GetValue<int>() != 1 || response["pid"]?.GetValue<int>() != processId ||
                            url.Scheme != "ws" || url.Host != "127.0.0.1" || url.Port < 1024 || url.Port > 65535 || url.UserInfo.Length != 0 ||
                            NativeWindow.ListenerProcess(url.Port) != processId)
                            throw new InvalidDataException("Codex 연결 모듈의 응답 정체성이 다릅니다.");
                        DiagnosticLog.Record("native-ready", requests: requests, elapsedMs: resend.ElapsedMilliseconds);
                        return new(url.Port, processId, started, installation);
                    }
                }
                // A hook can receive the message before V8 has entered a usable context.
                // Keep the verified hook alive and resignal instead of waiting out a full timeout.
                if (resend.ElapsedMilliseconds >= requests * 150L)
                {
                    if (!PostThreadMessage(thread, 0x8000 + 0x26D, UIntPtr.Zero, IntPtr.Zero))
                        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                    requests++;
                }
                await Task.Delay(50, deadline.Token);
            }
        }
        catch (OperationCanceledException error) when (!token.IsCancellationRequested)
        {
            throw new TimeoutException("Codex 연결 준비 응답 시간이 초과되었습니다.", error);
        }
        finally
        {
            if (hook != IntPtr.Zero) UnhookWindowsHookEx(hook);
            NativeLibrary.Free(module);
            if (File.Exists(requestPath)) File.Delete(requestPath);
        }
    }
    private static void RejectLinks(string path)
    {
        for (var current = Path.GetFullPath(path); current is not null; current = Path.GetDirectoryName(current))
            if ((File.Exists(current) || Directory.Exists(current)) && File.GetAttributes(current).HasFlag(FileAttributes.ReparsePoint))
                throw new InvalidDataException("CoSkin 연결 경로에 파일 연결을 사용할 수 없습니다.");
    }
}
