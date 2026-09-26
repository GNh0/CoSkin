using System.Runtime.InteropServices;
namespace CoSkin;

internal static class BrandIcon
{
    internal static IntPtr Load(int size)
    {
        var path = Environment.ProcessPath ?? throw new IOException("앱 아이콘 경로를 확인하지 못했습니다.");
        var icons = new IntPtr[1];
        var small = new IntPtr[1];
        if (ExtractIconEx(path, 0, icons, small, 1) == 0)
            throw new IOException("앱 아이콘 리소스를 찾지 못했습니다.");
        var selected = size <= 24 ? small[0] : icons[0];
        var unused = size <= 24 ? icons[0] : small[0];
        if (unused != IntPtr.Zero)
            DestroyIcon(unused);
        return selected;
    }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern uint ExtractIconEx(string file, int index, IntPtr[] large, IntPtr[] small, uint count);
    [DllImport("user32.dll")] internal static extern bool DestroyIcon(IntPtr icon);
}
