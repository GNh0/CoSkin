using System.Text.Json.Nodes;
using System.Diagnostics;
using System.Runtime.InteropServices;
namespace CoSkin;

/// <summary>Only the process which owns the configured loopback listener is inspected.</summary>
internal static class NativeWindow
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ProcessEntry
    {
        public uint Size, Usage, ProcessId;
        public UIntPtr Heap;
        public uint Module, Threads, ParentProcessId;
        public int Priority;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Executable;
    }
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint process);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool Process32First(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool Process32Next(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    internal static Dictionary<int, int> ParentProcesses()
    {
        var snapshot = CreateToolhelp32Snapshot(2, 0);
        if (snapshot == new IntPtr(-1)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        try
        {
            var entry = new ProcessEntry { Size = (uint)Marshal.SizeOf<ProcessEntry>() };
            if (!Process32First(snapshot, ref entry)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            var parents = new Dictionary<int, int>();
            do { parents[(int)entry.ProcessId] = (int)entry.ParentProcessId; } while (Process32Next(snapshot, ref entry));
            return parents;
        }
        finally { CloseHandle(snapshot); }
    }
    private const int AfInet = 2;
    private const int OwnerPidListener = 3;
    [DllImport("iphlpapi.dll", SetLastError = true)]
    private static extern uint GetExtendedTcpTable(IntPtr table, ref int size, bool order, int family, int tableClass, int reserved);
    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr window, out Rect rectangle);
    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromRect(ref Rect rectangle, uint flags);
    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr value);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr window, System.Text.StringBuilder name, int length);
    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr window, uint attribute, out int value, int size);
    private delegate bool EnumWindowsCallback(IntPtr window, IntPtr value);
    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left, Top, Right, Bottom;
    }

    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    internal static bool Activate(IntPtr window, int verifiedProcess)
    {
        if (window == IntPtr.Zero || verifiedProcess <= 0)
            return false;
        GetWindowThreadProcessId(window, out var owner);
        if (owner != verifiedProcess)
            return false;
        if (IsIconic(window))
            ShowWindowAsync(window, 9);
        return SetForegroundWindow(window);
    }
    internal static int ListenerProcess(int port)
    {
        var size = 0;
        GetExtendedTcpTable(IntPtr.Zero, ref size, true, AfInet, OwnerPidListener, 0);
        var table = Marshal.AllocHGlobal(size);
        try
        {
            if (GetExtendedTcpTable(table, ref size, true, AfInet, OwnerPidListener, 0) != 0)
                throw new IOException("연결 프로세스를 확인하지 못했습니다.");
            var count = Marshal.ReadInt32(table);
            for (var i = 0; i < count; i++)
            {
                var row = table + 4 + i * 24;
                var address = unchecked((uint)Marshal.ReadInt32(row, 4));
                var currentPort = Marshal.ReadByte(row, 8) * 256 + Marshal.ReadByte(row, 9);
                if (address == 0x0100007f && currentPort == port)
                    return Marshal.ReadInt32(row, 20);
            }
            throw new IOException("로컬 연결을 기다립니다.");
        }
        finally { Marshal.FreeHGlobal(table); }
    }

    internal static IntPtr MatchWindow(int processId, JsonObject geometry)
    {
        var left = geometry["x"]!.GetValue<double>();
        var top = geometry["y"]!.GetValue<double>();
        var width = geometry["width"]!.GetValue<double>();
        var height = geometry["height"]!.GetValue<double>();
        var candidates = new List<IntPtr>();
        EnumWindows((window, _) =>
        {
            GetWindowThreadProcessId(window, out var owner);
            if (owner != processId || !GetWindowRect(window, out var rectangle))
                return true;
            const double tolerance = 4;
            if (Math.Abs(rectangle.Left - left) <= tolerance && Math.Abs(rectangle.Top - top) <= tolerance &&
                Math.Abs(rectangle.Right - rectangle.Left - width) <= tolerance && Math.Abs(rectangle.Bottom - rectangle.Top - height) <= tolerance)
                candidates.Add(window);
            return true;
        }, IntPtr.Zero);
        // Never substitute an overlay or another same-process window for an ambiguous renderer.
        return candidates.Count == 1 ? candidates[0] : IntPtr.Zero;
    }
    internal static IntPtr RendererWindow(int processId, JsonNode target)
    {
        if (!ulong.TryParse(target["nativeWindow"]?.GetValue<string>(), System.Globalization.NumberStyles.AllowHexSpecifier, System.Globalization.CultureInfo.InvariantCulture, out var value)) return IntPtr.Zero;
        var window = new IntPtr(unchecked((long)value));
        GetWindowThreadProcessId(window, out var owner);
        return owner == processId ? window : IntPtr.Zero;
    }
    internal static bool Visible(IntPtr window, int processId)
    {
        if (window == IntPtr.Zero)
            return false;
        GetWindowThreadProcessId(window, out var owner);
        if (owner != processId || !IsWindowVisible(window) || IsIconic(window))
            return false;
        if (DwmGetWindowAttribute(window, 14, out var cloaked, sizeof(int)) == 0 && cloaked != 0)
            return false;
        if (!GetWindowRect(window, out var rectangle) || rectangle.Right <= rectangle.Left || rectangle.Bottom <= rectangle.Top)
            return false;
        return MonitorFromRect(ref rectangle, 0) != IntPtr.Zero;
    }
    internal static bool Focused(IntPtr window, int processId)
    {
        if (window == IntPtr.Zero || GetForegroundWindow() != window) return false;
        GetWindowThreadProcessId(window, out var owner);
        return owner == processId;
    }
    internal static string VerifyExecutable(int processId)
    {
        using var process = Process.GetProcessById(processId);
        var path = process.MainModule?.FileName ?? throw new IOException("Codex 실행 파일을 확인하지 못했습니다.");
        if (!Path.GetFileName(path).Equals("ChatGPT.exe", StringComparison.OrdinalIgnoreCase))
            throw new IOException("연결 포트를 Codex가 사용하고 있지 않습니다.");
        return path;
    }
    internal static IntPtr AttachmentWindow(int processId)
    {
        var windows = new List<(IntPtr Handle, uint Thread)>();
        EnumWindows((window, _) =>
        {
            var thread = GetWindowThreadProcessId(window, out var owner);
            if (owner != processId) return true;
            var name = new System.Text.StringBuilder(128);
            GetClassName(window, name, name.Capacity);
            if (name.ToString().StartsWith("Chrome_WidgetWin_", StringComparison.Ordinal)) windows.Add((window, thread));
            return true;
        }, IntPtr.Zero);
        // All supported top-level Codex windows share its main event-loop thread.
        return windows.Count > 0 && windows.Select(value => value.Thread).Distinct().Count() == 1 ? windows[0].Handle : IntPtr.Zero;
    }
}
