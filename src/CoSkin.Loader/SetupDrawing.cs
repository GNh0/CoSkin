using System.Runtime.InteropServices;
namespace CoSkin;

/// <summary>Event-driven native painting; the real checkbox retains keyboard and accessibility behavior.</summary>
internal sealed class SetupDrawing(string locale) : IDisposable
{
    private readonly Dictionary<int, IntPtr> brushes = [];
    private readonly Dictionary<int, IntPtr> pens = [];
    private readonly Dictionary<(int Size, int Weight), IntPtr> fonts = [];
    private uint dpi = 96;
    private readonly string unavailable = locale.Split('-', '_')[0].ToLowerInvariant() switch
    {
        "ko" => "준비 중",
        "ja" => "準備中",
        "zh" => "准备中",
        _ => "Preparing"
    };
    private readonly int background = Palette(5, Color(20, 20, 29)), card = Palette(5, Color(30, 29, 42)), edge = Palette(8, Color(61, 55, 78));
    private readonly int foreground = Palette(8, Color(245, 242, 252)), muted = Palette(8, Color(170, 164, 185)), accent = Palette(13, Color(194, 165, 245));
    private readonly int accentInk = Palette(14, Color(28, 19, 43));

    internal IntPtr? Handle(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam)
    {
        if (message is 0x0110 or 0x02e0)
        {
            foreach (var font in fonts.Values)
                DeleteObject(font);
            fonts.Clear();
            dpi = message == 0x02e0 ? (uint)(wParam.ToUInt64() & 0xffff) : GetDpiForWindow(window);
            if (dpi == 0)
                dpi = 96;
            var dark = 1;
            DwmSetWindowAttribute(window, 20, ref dark, 4);
            foreach (var id in new[] { 100, 101, 102, 103 })
                SendMessage(GetDlgItem(window, id), 0x0030, Font(id == 100 ? 28 : id == 101 ? 16 : 12, id <= 101 ? 600 : 400), new IntPtr(1));
            return null;
        }
        if (message is 0x0136 or 0x0138 or 0x0135)
        {
            var dc = (IntPtr)wParam.ToUInt64();
            SetBkMode(dc, 1);
            SetTextColor(dc, GetDlgCtrlID(lParam) is 102 or 103 ? muted : foreground);
            SetBkColor(dc, background);
            return Brush(background);
        }
        if (message == 0x004e)
        {
            var draw = Marshal.PtrToStructure<CustomDraw>(lParam);
            if (draw.Header.Code != unchecked((uint)-12) || draw.Header.Id.ToUInt64() is < 11 or > 14)
                return null;
            if (draw.Stage is 1 or 3)
            {
                // Themed checkboxes can notify PREERASE without a subsequent
                // PREPAINT. Whichever stage owns the paint must draw the whole card.
                DrawOption(draw);
                SetWindowLongPtr(window, 0, new IntPtr(4));
                return new IntPtr(1);
            }
        }
        if (message == 0x002b)
        {
            var item = Marshal.PtrToStructure<DrawItem>(lParam);
            if (item.Id is 1 or 2)
            {
                DrawAction(item);
                return new IntPtr(1);
            }
        }
        if (message == 0x0111 && (wParam.ToUInt64() & 0xffff) is >= 11 and <= 14)
            InvalidateRect(GetDlgItem(window, (int)(wParam.ToUInt64() & 0xffff)), IntPtr.Zero, false);
        return null;
    }

    private void DrawOption(CustomDraw draw)
    {
        var enabled = SendMessage(draw.Header.Window, 0x00f0, IntPtr.Zero, IntPtr.Zero) == new IntPtr(1);
        var rect = draw.Rect;
        FillRect(draw.Dc, ref rect, Brush(background));
        rect.Left += Px(1);
        rect.Top += Px(1);
        rect.Right -= Px(1);
        rect.Bottom -= Px(1);
        Rounded(draw.Dc, rect, card, (draw.State & 0x40) != 0 ? accent : edge, 14);
        var text = new System.Text.StringBuilder(2048);
        GetWindowText(draw.Header.Window, text, text.Capacity);
        var lines = text.ToString().Split('\n', 2);
        var title = rect;
        title.Left += Px(18);
        title.Top += Px(12);
        title.Right -= Px(76);
        title.Bottom = title.Top + Px(22);
        if (draw.Header.Id.ToUInt64() == 13)
        {
            var badge = title;
            badge.Left = badge.Right - Px(80);
            badge.Top += Px(2);
            badge.Bottom -= Px(2);
            Rounded(draw.Dc, badge, card, edge, 10);
            Text(draw.Dc, unavailable, badge, 10, 500, accent, 0x1 | 0x4 | 0x20);
            title.Right = badge.Left - Px(8);
        }
        Text(draw.Dc, lines[0], title, 14, 600, foreground, 0x20 | 0x4 | 0x8000);
        var description = title;
        description.Top += Px(26);
        description.Bottom = rect.Bottom - Px(8);
        description.Right = rect.Right - Px(76);
        Text(draw.Dc, lines.ElementAtOrDefault(1) ?? "", description, 12, 400, muted, 0x10 | 0x800);
        var toggle = new Rect { Left = rect.Right - Px(58), Right = rect.Right - Px(18), Top = (rect.Top + rect.Bottom) / 2 - Px(11), Bottom = (rect.Top + rect.Bottom) / 2 + Px(11) };
        Rounded(draw.Dc, toggle, enabled ? accent : edge, enabled ? accent : edge, 22);
        var knobX = enabled ? toggle.Right - Px(19) : toggle.Left + Px(3);
        Rounded(draw.Dc, new Rect { Left = knobX, Right = knobX + Px(16), Top = toggle.Top + Px(3), Bottom = toggle.Bottom - Px(3) }, enabled ? accentInk : foreground, enabled ? accentInk : foreground, 16);
        if ((draw.State & 0x10) != 0)
        {
            var focus = rect;
            focus.Left += Px(5);
            focus.Top += Px(5);
            focus.Right -= Px(5);
            focus.Bottom -= Px(5);
            SetTextColor(draw.Dc, foreground);
            DrawFocusRect(draw.Dc, ref focus);
        }
    }

    private void DrawAction(DrawItem item)
    {
        var rect = item.Rect;
        FillRect(item.Dc, ref rect, Brush(background));
        var pressed = (item.State & 1) != 0;
        Rounded(item.Dc, rect, item.Id == 1 ? accent : card, item.Id == 1 ? accent : edge, 12);
        var text = new System.Text.StringBuilder(128);
        GetWindowText(item.Window, text, text.Capacity);
        if (pressed)
        {
            rect.Top += Px(1);
            rect.Bottom += Px(1);
        }
        Text(item.Dc, text.ToString(), rect, 14, 600, item.Id == 1 ? accentInk : foreground, 0x1 | 0x4 | 0x20);
        if ((item.State & 0x10) != 0)
        {
            rect.Left += Px(4);
            rect.Top += Px(4);
            rect.Right -= Px(4);
            rect.Bottom -= Px(4);
            DrawFocusRect(item.Dc, ref rect);
        }
    }

    private int Px(int value) => (int)Math.Round(value * dpi / 96d);
    private IntPtr Font(int size, int weight)
    {
        if (!fonts.TryGetValue((size, weight), out var font))
            fonts[(size, weight)] = font = CreateFont(-Px(size), 0, 0, 0, weight, 0, 0, 0, 1, 0, 0, 5, 0, "Segoe UI");
        return font;
    }
    private IntPtr Brush(int color)
    {
        if (!brushes.TryGetValue(color, out var brush))
            brushes[color] = brush = CreateSolidBrush(color);
        return brush;
    }
    private IntPtr Pen(int color)
    {
        if (!pens.TryGetValue(color, out var pen))
            pens[color] = pen = CreatePen(0, Px(1), color);
        return pen;
    }
    private void Rounded(IntPtr dc, Rect rect, int fill, int stroke, int radius)
    {
        var oldBrush = SelectObject(dc, Brush(fill));
        var oldPen = SelectObject(dc, Pen(stroke));
        RoundRect(dc, rect.Left, rect.Top, rect.Right, rect.Bottom, Px(radius), Px(radius));
        SelectObject(dc, oldPen);
        SelectObject(dc, oldBrush);
    }
    private void Text(IntPtr dc, string value, Rect rect, int size, int weight, int color, uint flags)
    {
        var old = SelectObject(dc, Font(size, weight));
        SetBkMode(dc, 1);
        SetTextColor(dc, color);
        DrawText(dc, value, value.Length, ref rect, flags);
        SelectObject(dc, old);
    }
    private static int Color(int r, int g, int b) => r | (g << 8) | (b << 16);
    private static int Palette(int systemColor, int standard)
    {
        var contrast = new HighContrast { Size = (uint)Marshal.SizeOf<HighContrast>() };
        return SystemParametersInfo(0x0042, contrast.Size, ref contrast, 0) && (contrast.Flags & 1) != 0 ? GetSysColor(systemColor) : standard;
    }
    public void Dispose()
    {
        foreach (var resource in brushes.Values.Concat(pens.Values).Concat(fonts.Values))
            DeleteObject(resource);
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left, Top, Right, Bottom;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct HighContrast
    {
        public uint Size, Flags; public IntPtr Scheme;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Header
    {
        public IntPtr Window; public UIntPtr Id; public uint Code;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct CustomDraw
    {
        public Header Header; public uint Stage; public IntPtr Dc; public Rect Rect; public UIntPtr Item; public uint State; public IntPtr Parameter;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct DrawItem
    {
        public uint Type, Id, Item, Action, State; public IntPtr Window, Dc; public Rect Rect; public UIntPtr Data;
    }
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool SystemParametersInfo(uint action, uint parameter, ref HighContrast value, uint flags);
    [DllImport("user32.dll")] private static extern int GetSysColor(int index);
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
    [DllImport("user32.dll")] private static extern IntPtr GetDlgItem(IntPtr window, int id);
    [DllImport("user32.dll")] private static extern int GetDlgCtrlID(IntPtr window);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] private static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, System.Text.StringBuilder value, int count);
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool InvalidateRect(IntPtr window, IntPtr rect, bool erase);
    [DllImport("user32.dll")] private static extern int FillRect(IntPtr dc, ref Rect rect, IntPtr brush);
    [DllImport("user32.dll")] private static extern bool DrawFocusRect(IntPtr dc, ref Rect rect);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int DrawText(IntPtr dc, string text, int count, ref Rect rect, uint format);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateSolidBrush(int color);
    [DllImport("gdi32.dll")] private static extern IntPtr CreatePen(int style, int width, int color);
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateFont(int height, int width, int escapement, int orientation, int weight, uint italic, uint underline, uint strikeout, uint charset, uint precision, uint clip, uint quality, uint family, string name);
    [DllImport("gdi32.dll")] private static extern IntPtr SelectObject(IntPtr dc, IntPtr resource);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr resource);
    [DllImport("gdi32.dll")] private static extern bool RoundRect(IntPtr dc, int left, int top, int right, int bottom, int width, int height);
    [DllImport("gdi32.dll")] private static extern int SetBkMode(IntPtr dc, int mode);
    [DllImport("gdi32.dll")] private static extern int SetBkColor(IntPtr dc, int color);
    [DllImport("gdi32.dll")] private static extern int SetTextColor(IntPtr dc, int color);
}
