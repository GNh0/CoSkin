using System.Runtime.InteropServices;
namespace CoSkin;

internal enum TrayAction
{
    Library, Settings, ToggleDecoration, ToggleLaunch, ToggleExit, ToggleUpdates, Apply, Exit
}
internal sealed record TrayCommand(TrayAction Action, string? Theme = null);
internal sealed record TrayTheme(string Id, string Name, bool Applied);
internal sealed record TraySnapshot(string Locale, bool Connected, bool Enabled, bool Busy, RuntimePreferences Preferences, TrayTheme[] Themes);

/// <summary>A native message loop owns the notification icon. Async commands never block that loop.</summary>
internal sealed class NativeTray : IDisposable
{
    private const uint Callback = 0x8001, Notice = 0x8002, Close = 0x0010;
    private readonly System.Collections.Concurrent.ConcurrentQueue<string> notices = new();
    private readonly Func<TraySnapshot> snapshot;
    private readonly Func<TrayCommand, Task> execute;
    private readonly Thread thread;
    private readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly WindowProcedure procedure;
    private readonly string className = "CoSkin.Tray." + Guid.NewGuid().ToString("N");
    private IntPtr window, icon;
    private uint taskbarCreated;
    private int busy;
    private string lastLocale = "en";
    private bool disposed;
    internal NativeTray(Func<TraySnapshot> snapshot, Func<TrayCommand, Task> execute)
    {
        this.snapshot = snapshot;
        this.execute = execute;
        procedure = WindowMessage;
        thread = new Thread(Run) { IsBackground = true, Name = "CoSkin notification icon" };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
    }
    internal Task Ready => ready.Task;
    private void Run()
    {
        var registration = new WindowClass { Instance = GetModuleHandle(null), Procedure = procedure, ClassName = className };
        var atom = RegisterClass(ref registration);
        try
        {
            if (atom == 0)
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            window = CreateWindowEx(0, className, "CoSkin", 0, 0, 0, 0, 0, IntPtr.Zero, IntPtr.Zero, registration.Instance, IntPtr.Zero);
            if (window == IntPtr.Zero)
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            icon = CreateOwnIcon();
            taskbarCreated = RegisterWindowMessage("TaskbarCreated");
            AddIcon();
            ready.SetResult();
            if (disposed)
                return;
            while (GetMessage(out var message, IntPtr.Zero, 0, 0) > 0)
            {
                TranslateMessage(ref message);
                DispatchMessage(ref message);
            }
        }
        catch (Exception error) { ready.TrySetException(error); }
        finally
        {
            var data = IconData();
            ShellNotifyIcon(2, ref data);
            if (icon != IntPtr.Zero)
                DestroyIcon(icon);
            if (window != IntPtr.Zero)
                DestroyWindow(window);
            if (atom != 0)
                UnregisterClass(className, registration.Instance);
        }
    }
    private NotificationIcon IconData() => new()
    {
        Size = (uint)Marshal.SizeOf<NotificationIcon>(),
        Window = window,
        Id = 1,
        Flags = 1 | 2 | 4 | 128,
        CallbackMessage = Callback,
        Icon = icon,
        Tip = "CoSkin",
        Info = "",
        InfoTitle = ""
    };
    private void AddIcon()
    {
        var data = IconData();
        if (!ShellNotifyIcon(0, ref data))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        data.Timeout = 4; // NOTIFYICON_VERSION_4 shares the uTimeout/uVersion field.
        if (!ShellNotifyIcon(4, ref data))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
    private IntPtr WindowMessage(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam)
    {
        try
        {
            return HandleMessage(hwnd, message, wParam, lParam);
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(Failure.Describe(error).Message);
            if (message != Notice)
            {
                notices.Enqueue(TrayMessages.Error(lastLocale, Failure.Describe(error).Code));
                PostMessage(window, Notice, UIntPtr.Zero, IntPtr.Zero);
            }
            return IntPtr.Zero;
        }
    }
    private IntPtr HandleMessage(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam)
    {
        if (message == taskbarCreated && taskbarCreated != 0)
        {
            AddIcon();
            return IntPtr.Zero;
        }
        if (message == Callback)
        {
            var action = (uint)lParam.ToInt64() & 0xffff;
            if (action is 0x0205 or 0x007B)
            {
                var packed = wParam.ToUInt64();
                ShowMenu(new Point { X = unchecked((short)(packed & 0xffff)), Y = unchecked((short)((packed >> 16) & 0xffff)) });
            }
            else if (action is 0x0203 or 0x0400 or 0x0401)
                Dispatch(new(TrayAction.Library));
            return IntPtr.Zero;
        }
        if (message == Notice)
        {
            while (notices.TryDequeue(out var notice))
                MessageBox(window, notice, "CoSkin", 0x30);
            return IntPtr.Zero;
        }
        if (message == Close)
        {
            PostQuitMessage(0);
            return IntPtr.Zero;
        }
        return DefWindowProc(hwnd, message, wParam, lParam);
    }
    private void ShowMenu(Point cursor)
    {
        var state = snapshot();
        lastLocale = state.Locale;
        var labels = TrayMessages.For(state.Locale);
        var menu = CreatePopupMenu();
        var commands = new Dictionary<uint, TrayCommand>();
        uint next = 1;
        void Item(string label, TrayCommand command, bool disabled = false, bool check = false)
        {
            var id = next++;
            commands.Add(id, command);
            AppendMenu(menu, (disabled ? 1u : 0u) | (check ? 8u : 0u), (UIntPtr)id, label);
        }
        var blocked = state.Busy || Volatile.Read(ref busy) != 0;
        Item(labels.Library, new(TrayAction.Library), blocked);
        AppendMenu(menu, 0x0800, UIntPtr.Zero, null);
        foreach (var theme in state.Themes.Take(30))
            Item(theme.Name.Replace("&", "&&").Replace("\n", " "), new(TrayAction.Apply, theme.Id), blocked || !state.Connected, theme.Applied);
        AppendMenu(menu, 0x0800, UIntPtr.Zero, null);
        Item(labels.Decoration, new(TrayAction.ToggleDecoration), blocked || !state.Connected, state.Enabled);
        Item(labels.Settings, new(TrayAction.Settings), blocked);
        Item(labels.Launch, new(TrayAction.ToggleLaunch), blocked, state.Preferences.LaunchWithCodex);
        Item(labels.ExitTogether, new(TrayAction.ToggleExit), blocked, state.Preferences.ExitWithCodex);
        Item(labels.AutomaticUpdates, new(TrayAction.ToggleUpdates), blocked, state.Preferences.AutomaticUpdates);
        AppendMenu(menu, 0x0800, UIntPtr.Zero, null);
        Item(labels.Exit, new(TrayAction.Exit), blocked);
        try
        {
            if (cursor.X == -1 && cursor.Y == -1)
                GetCursorPos(out cursor);
            SetForegroundWindow(window);
            var selected = TrackPopupMenu(menu, 0x0100 | 0x0002, cursor.X, cursor.Y, 0, window, IntPtr.Zero);
            PostMessage(window, 0, UIntPtr.Zero, IntPtr.Zero);
            if (commands.TryGetValue(selected, out var command))
                Dispatch(command);
        }
        finally
        {
            DestroyMenu(menu);
            var data = IconData();
            ShellNotifyIcon(3, ref data); // Return keyboard focus to the notification area.
        }
    }
    private void Dispatch(TrayCommand command)
    {
        if (Interlocked.CompareExchange(ref busy, 1, 0) != 0)
            return;
        _ = Task.Run(async () =>
        {
            try
            {
                await execute(command);
            }
            catch (Exception error)
            {
                Console.Error.WriteLine(error);
                notices.Enqueue(TrayMessages.Error(lastLocale, error is TrayActionException actionError ? actionError.Code : Failure.Describe(error).Code));
                PostMessage(window, Notice, UIntPtr.Zero, IntPtr.Zero);
            }
            finally { Volatile.Write(ref busy, 0); }
        });
    }
    private static IntPtr CreateOwnIcon()
    {
        const int size = 32;
        var mask = new byte[size * size / 8];
        var pixels = new byte[size * size * 4];
        for (var y = 0; y < size; y++)
            for (var x = 0; x < size; x++)
            {
                var distance = Math.Sqrt(Math.Pow(x - 15.5, 2) + Math.Pow(y - 15.5, 2));
                var offset = (y * size + x) * 4;
                if (distance > 15)
                {
                    mask[y * 4 + x / 8] |= (byte)(0x80 >> (x % 8));
                    continue;
                }
                var letter = distance is > 7 and < 10 && !(x > 18 && Math.Abs(y - 15.5) < 6);
                pixels[offset] = letter ? (byte)255 : (byte)220;
                pixels[offset + 1] = letter ? (byte)255 : (byte)125;
                pixels[offset + 2] = letter ? (byte)255 : (byte)70;
                pixels[offset + 3] = 255;
            }
        var result = CreateIcon(GetModuleHandle(null), size, size, 1, 32, mask, pixels);
        if (result == IntPtr.Zero)
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        return result;
    }
    public void Dispose()
    {
        if (disposed)
            return;
        disposed = true;
        if (window != IntPtr.Zero)
            PostMessage(window, Close, UIntPtr.Zero, IntPtr.Zero);
        if (Thread.CurrentThread != thread)
            thread.Join(TimeSpan.FromSeconds(3));
    }
    private delegate IntPtr WindowProcedure(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WindowClass
    {
        public uint Style; public WindowProcedure Procedure; public int ClassExtra, WindowExtra;
        public IntPtr Instance, Icon, Cursor, Background; public string? MenuName; public string ClassName;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Point
    {
        public int X, Y;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Message
    {
        public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam; public uint Time; public Point Point; public uint Private;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NotificationIcon
    {
        public uint Size; public IntPtr Window; public uint Id, Flags, CallbackMessage; public IntPtr Icon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string Tip;
        public uint State, StateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string Info;
        public uint Timeout;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string InfoTitle;
        public uint InfoFlags; public Guid Guid; public IntPtr BalloonIcon;
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern ushort RegisterClass(ref WindowClass registration);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool UnregisterClass(string name, IntPtr instance);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string? name);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr CreateWindowEx(uint extended, string name, string title, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr parameter);
    [DllImport("user32.dll")] private static extern IntPtr DefWindowProc(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] private static extern int GetMessage(out Message message, IntPtr window, uint minimum, uint maximum);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref Message message);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref Message message);
    [DllImport("user32.dll")] private static extern bool DestroyWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern void PostQuitMessage(int exit);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern uint RegisterWindowMessage(string name);
    [DllImport("shell32.dll", EntryPoint = "Shell_NotifyIconW", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool ShellNotifyIcon(uint command, ref NotificationIcon icon);
    [DllImport("user32.dll")] private static extern IntPtr CreatePopupMenu();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool AppendMenu(IntPtr menu, uint flags, UIntPtr id, string? text);
    [DllImport("user32.dll")] private static extern uint TrackPopupMenu(IntPtr menu, uint flags, int x, int y, int reserved, IntPtr window, IntPtr bounds);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool DestroyMenu(IntPtr menu);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr CreateIcon(IntPtr instance, int width, int height, byte planes, byte bits, byte[] mask, byte[] pixels);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int MessageBox(IntPtr window, string text, string caption, uint type);
    [DllImport("user32.dll")] private static extern bool DestroyIcon(IntPtr icon);
}
