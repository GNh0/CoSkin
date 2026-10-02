using System.Runtime.InteropServices;
namespace CoSkin;

internal enum TrayAction
{
    Library, Settings, OpenCodex, ToggleStartup, ToggleDecoration, Refresh, ToggleLaunch, ToggleExit, ToggleUpdates, Apply, Exit, BackgroundView
}
internal sealed record TrayCommand(TrayAction Action, string? Theme = null);
internal sealed record TrayTheme(string Id, string Name, bool Applied);
internal sealed record TraySnapshot(string Locale, bool Connected, bool Enabled, bool Busy, RuntimePreferences Preferences, TrayTheme[] Themes, bool OriginalDetected = false);

/// <summary>A native message loop owns the notification icon. Async commands never block that loop.</summary>
internal sealed class NativeTray : IDisposable
{
    private const uint Callback = 0x8001, Notice = 0x8002, Close = 0x0010, Timer = 0x0113;
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
    private volatile bool disposed;
    private bool menuOpen;
    private readonly Action? targetChanged;
    private readonly WinEventProcedure targetEvent;
    private readonly WinEventProcedure menuFocusEvent;
    private IntPtr eventHook, menuFocusHook;
    private readonly TrayIconRecovery iconRecovery;
    private UIntPtr retryTimer;
    private uint retryTimerSequence = 0xC500;
    internal NativeTray(Func<TraySnapshot> snapshot, Func<TrayCommand, Task> execute, Action? targetChanged = null)
    {
        this.snapshot = snapshot;
        this.execute = execute;
        this.targetChanged = targetChanged;
        targetEvent = (_, _, hwnd, objectId, childId, _, _) => { if (hwnd != IntPtr.Zero && objectId == 0 && childId == 0) TargetWindowChanged(hwnd); };
        menuFocusEvent = (_, _, _, _, _, _, _) => CancelMenuWhenFocusLeaves();
        procedure = WindowMessage;
        iconRecovery = new TrayIconRecovery(NotifyIcon, ScheduleIconRetry, CancelIconRetry,
            (stage, reason) => DiagnosticLog.Record(stage, reason: reason));
        thread = new Thread(Run) { IsBackground = true, Name = "CoSkin notification icon" };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
    }
    private void TargetWindowChanged(IntPtr handle)
    {
        GetWindowThreadProcessId(handle, out var id);
        if (id == 0 || id == Environment.ProcessId)
            return;
        try
        {
            using var process = System.Diagnostics.Process.GetProcessById((int)id);
            if (process.ProcessName.Equals("ChatGPT", StringComparison.OrdinalIgnoreCase))
                targetChanged?.Invoke();
        }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception) { }
    }
    private void CancelMenuWhenFocusLeaves()
    {
        if (!menuOpen || window == IntPtr.Zero)
            return;
        var foreground = GetForegroundWindow();
        if (foreground == IntPtr.Zero || foreground == window)
            return;
        // The menu's own popup windows belong to this thread. A different
        // foreground thread means the user moved to another application.
        if (GetWindowThreadProcessId(foreground, out _) == GetWindowThreadProcessId(window, out _))
            return;
        if (EndMenu())
            DiagnosticLog.Record("tray-menu-focus-cancel");
    }
    internal Task Ready => ready.Task;
    internal bool IconAvailable => iconRecovery.Registered;
    internal void ShowNotice(string message)
    {
        notices.Enqueue(message);
        PostMessage(window, Notice, UIntPtr.Zero, IntPtr.Zero);
    }
    private void Run()
    {
        var registration = new WindowClass { Instance = GetModuleHandle(null), Procedure = procedure, ClassName = className };
        var atom = RegisterClass(ref registration);
        try
        {
            if (atom == 0)
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            window = CreateWindowEx(0x00080080, className, "CoSkin", 0x80000000, 0, 0, 1, 1, IntPtr.Zero, IntPtr.Zero, registration.Instance, IntPtr.Zero);
            if (window == IntPtr.Zero)
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            if (!SetLayeredWindowAttributes(window, 0, 0, 2))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            icon = CreateOwnIcon();
            taskbarCreated = RegisterWindowMessage("TaskbarCreated");
            // Explorer can be restarting or unavailable in a restricted session.
            // The resident message loop remains usable while its icon recovers.
            iconRecovery.Restore();
            eventHook = SetWinEventHook(0x8000, 0x8002, IntPtr.Zero, targetEvent, 0, 0, 2);
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
            if (menuFocusHook != IntPtr.Zero)
                UnhookWinEvent(menuFocusHook);
            if (eventHook != IntPtr.Zero)
                UnhookWinEvent(eventHook);
            iconRecovery.Dispose();
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
    private int? NotifyIcon(uint command, uint version)
    {
        var data = IconData();
        data.Timeout = version; // NOTIFYICON_VERSION_4 shares uTimeout/uVersion.
        Marshal.SetLastPInvokeError(0);
        return ShellNotifyIcon(command, ref data) ? null : Marshal.GetLastPInvokeError();
    }
    private bool ScheduleIconRetry(uint delayMs)
    {
        CancelIconRetry();
        // Distinct timer IDs discard already queued events from a previous retry.
        retryTimer = SetTimer(window, new UIntPtr(++retryTimerSequence), delayMs, IntPtr.Zero);
        return retryTimer != UIntPtr.Zero;
    }
    private void CancelIconRetry()
    {
        if (retryTimer == UIntPtr.Zero) return;
        KillTimer(window, retryTimer);
        retryTimer = UIntPtr.Zero;
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
            iconRecovery.Restore();
            return IntPtr.Zero;
        }
        if (message == Timer && retryTimer != UIntPtr.Zero && wParam == retryTimer)
        {
            iconRecovery.Retry();
            return IntPtr.Zero;
        }
        if (message == Callback)
        {
            var action = (uint)lParam.ToInt64() & 0xffff;
            if (action is 0x0205 or 0x007B)
            {
                // TrackPopupMenu runs a nested message loop. A second shell
                // callback must not open a second menu inside the first one.
                if (menuOpen)
                    DiagnosticLog.Record("tray-menu-reentrant-callback");
                else
                {
                    menuOpen = true;
                    try
                    {
                        var packed = wParam.ToUInt64();
                        ShowMenu(new Point { X = unchecked((short)(packed & 0xffff)), Y = unchecked((short)((packed >> 16) & 0xffff)) });
                    }
                    finally { menuOpen = false; }
                }
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
            if (menuOpen)
                EndMenu();
            iconRecovery.Dispose();
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
        void Item(string label, TrayCommand command, bool disabled = false, bool check = false, IntPtr? parent = null)
        {
            var id = next++;
            commands.Add(id, command);
            AppendMenu(parent ?? menu, (disabled ? 1u : 0u) | (check ? 8u : 0u), (UIntPtr)id, label);
        }
        AppendMenu(menu, 1, UIntPtr.Zero, ResidentMessages.Status(state.Locale, state.Connected, state.OriginalDetected));
        var blocked = state.Busy || Volatile.Read(ref busy) != 0;
        Item(labels.Library, new(TrayAction.Library), blocked);
        AppendMenu(menu, 0x0800, UIntPtr.Zero, null);
        var themeMenu = CreatePopupMenu();
        foreach (var theme in state.Themes.OrderByDescending(theme => theme.Applied).Take(12))
            Item(theme.Name.Replace("&", "&&").Replace("\n", " "), new(TrayAction.Apply, theme.Id), blocked || !state.Connected, theme.Applied, themeMenu);
        AppendMenu(themeMenu, 0x0800, UIntPtr.Zero, null);
        Item(labels.Library, new(TrayAction.Library), blocked, parent: themeMenu);
        AppendMenu(menu, 0x10, (UIntPtr)themeMenu, ResidentMessages.Themes(state.Locale));
        Item(labels.Decoration, new(TrayAction.ToggleDecoration), blocked || !state.Connected, state.Enabled);
        Item(labels.Refresh, new(TrayAction.Refresh), blocked || !state.Connected || !state.Enabled);
        Item(TrayMessages.BackgroundView(state.Locale), new(TrayAction.BackgroundView), blocked || !state.Connected || !state.Enabled);
        if (!state.Connected)
            Item(ResidentMessages.OpenCodex(state.Locale), new(TrayAction.OpenCodex), blocked);
        var settingsMenu = CreatePopupMenu();
        Item(labels.Settings, new(TrayAction.Settings), blocked, parent: settingsMenu);
        AppendMenu(settingsMenu, 0x0800, UIntPtr.Zero, null);
        Item(ResidentMessages.Startup(state.Locale), new(TrayAction.ToggleStartup), blocked, state.Preferences.StartAtSignIn, settingsMenu);
        Item(labels.ExitTogether, new(TrayAction.ToggleExit), blocked, state.Preferences.ExitWithCodex, settingsMenu);
        Item(labels.Launch, new(TrayAction.ToggleLaunch), blocked, state.Preferences.LaunchWithCodex, settingsMenu);
        Item(labels.AutomaticUpdates, new(TrayAction.ToggleUpdates), blocked, state.Preferences.AutomaticUpdates, settingsMenu);
        AppendMenu(menu, 0x10, (UIntPtr)settingsMenu, labels.Settings);
        AppendMenu(menu, 0x0800, UIntPtr.Zero, null);
        Item(labels.Exit, new(TrayAction.Exit), blocked);
        uint selected = 0;
        var returnFocus = false;
        try
        {
            if (cursor.X == -1 && cursor.Y == -1)
                GetCursorPos(out cursor);
            // A hidden owner cannot reliably become foreground above Windows 11
            // notification overflow. Show a transparent tool owner only for the menu.
            if (!SetWindowPos(window, new IntPtr(-1), cursor.X, cursor.Y, 1, 1, 0x0040))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            // TrackPopupMenu does not dismiss on outside clicks unless its owner
            // is foreground. Never show a menu after foreground activation fails.
            if (!SetForegroundWindow(window) || GetForegroundWindow() != window)
                throw new InvalidOperationException("트레이 메뉴 소유 창을 전경으로 활성화하지 못했습니다.");
            // If another app becomes foreground while the native menu is
            // tracking, cancel it even when Windows misses the usual dismissal.
            menuFocusHook = SetWinEventHook(0x0003, 0x0003, IntPtr.Zero, menuFocusEvent, 0, 0, 2);
            selected = TrackPopupMenu(menu, 0x0100 | 0x0002, cursor.X, cursor.Y, 0, window, IntPtr.Zero);
            PostMessage(window, 0, UIntPtr.Zero, IntPtr.Zero);
            returnFocus = selected == 0 && GetForegroundWindow() == window;
        }
        finally
        {
            if (menuFocusHook != IntPtr.Zero)
            {
                UnhookWinEvent(menuFocusHook);
                menuFocusHook = IntPtr.Zero;
            }
            ShowWindow(window, 0);
            SetWindowPos(window, new IntPtr(-2), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
            DestroyMenu(menu);
            if (returnFocus)
            {
                var data = IconData();
                ShellNotifyIcon(3, ref data);
            }
        }
        if (commands.TryGetValue(selected, out var command))
            Dispatch(command);
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
        return BrandIcon.Load(32);
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
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    private delegate void WinEventProcedure(IntPtr hook, uint kind, IntPtr window, int objectId, int childId, uint thread, uint time);
    [DllImport("user32.dll")] private static extern IntPtr SetWinEventHook(uint minimum, uint maximum, IntPtr module, WinEventProcedure callback, uint process, uint thread, uint flags);
    [DllImport("user32.dll")] private static extern bool UnhookWinEvent(IntPtr hook);
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
    [DllImport("user32.dll", SetLastError = true)] private static extern UIntPtr SetTimer(IntPtr window, UIntPtr id, uint delayMs, IntPtr callback);
    [DllImport("user32.dll")] private static extern bool KillTimer(IntPtr window, UIntPtr id);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern uint RegisterWindowMessage(string name);
    [DllImport("shell32.dll", EntryPoint = "Shell_NotifyIconW", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool ShellNotifyIcon(uint command, ref NotificationIcon icon);
    [DllImport("user32.dll")] private static extern IntPtr CreatePopupMenu();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool AppendMenu(IntPtr menu, uint flags, UIntPtr id, string? text);
    [DllImport("user32.dll")] private static extern uint TrackPopupMenu(IntPtr menu, uint flags, int x, int y, int reserved, IntPtr window, IntPtr bounds);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetLayeredWindowAttributes(IntPtr window, uint key, byte alpha, uint flags);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool DestroyMenu(IntPtr menu);
    [DllImport("user32.dll")] private static extern bool EndMenu();
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr CreateIcon(IntPtr instance, int width, int height, byte planes, byte bits, byte[] mask, byte[] pixels);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int MessageBox(IntPtr window, string text, string caption, uint type);
    [DllImport("user32.dll")] private static extern bool DestroyIcon(IntPtr icon);
}

/// <summary>All operations run on the tray owner thread; a failed shell call is not a resident failure.</summary>
internal sealed class TrayIconRecovery : IDisposable
{
    private static readonly uint[] RetryDelays = [500, 1000, 2000, 5000, 10000];
    private readonly Func<uint, uint, int?> notify;
    private readonly Func<uint, bool> schedule;
    private readonly Action cancel;
    private readonly Action<string, string> record;
    private bool active, retryPending, ownedIcon, disposed;
    private volatile bool registered;
    internal bool Registered => registered;
    internal int Attempts { get; private set; }
    internal bool RetryPending => retryPending;
    internal TrayIconRecovery(Func<uint, uint, int?> notify, Func<uint, bool> schedule, Action cancel, Action<string, string> record)
    {
        this.notify = notify; this.schedule = schedule; this.cancel = cancel; this.record = record;
    }
    internal void Restore()
    {
        if (disposed || active) return;
        registered = false;
        active = true;
        Attempts = 0;
        Attempt();
    }
    internal void Retry()
    {
        if (disposed || !active || !retryPending) return;
        retryPending = false;
        cancel();
        Attempt();
    }
    private void RemoveOwnedIcon()
    {
        if (ownedIcon && notify(2, 0) is null) ownedIcon = false;
    }
    private void Attempt()
    {
        Attempts++;
        RemoveOwnedIcon();
        var error = notify(0, 0);
        var operation = "NIM_ADD";
        if (error is null)
        {
            ownedIcon = true;
            operation = "NIM_SETVERSION";
            error = notify(4, 4);
            if (error is null)
            {
                registered = true;
                active = false;
                cancel();
                record("tray-icon-ready", "attempt=" + Attempts);
                return;
            }
            // An icon with unknown callback packing must not expose a broken menu.
            RemoveOwnedIcon();
        }
        record("tray-icon-registration-failed", operation + ";error=" + error + ";attempt=" + Attempts);
        if (Attempts <= RetryDelays.Length)
        {
            retryPending = true;
            if (schedule(RetryDelays[Attempts - 1])) return;
            retryPending = false;
            record("tray-icon-retry-unavailable", "SetTimer failed; resident remains active");
        }
        else record("tray-icon-retries-exhausted", "Waiting for a future TaskbarCreated message; resident remains active");
        active = false;
        cancel();
    }
    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        active = retryPending = registered = false;
        cancel();
        RemoveOwnedIcon();
    }
}
