using System.Diagnostics;
namespace CoSkin;

internal static class ResidentDetection
{
    // Candidates must still pass signature, build and native ABI checks before attachment.
    internal static int[] OriginalProcesses()
    {
        var result = new List<int>();
        foreach (var process in Process.GetProcessesByName("ChatGPT"))
        {
            using (process)
            {
                try
                {
                    if (process.MainModule?.FileName is string path && IsOriginalPath(path, Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)) && NativeWindow.AttachmentWindow(process.Id) != IntPtr.Zero)
                        result.Add(process.Id);
                }
                catch (Exception error) when (error is System.ComponentModel.Win32Exception or InvalidOperationException) { }
            }
        }
        return result.ToArray();
    }
    internal static bool IsOriginalPath(string executable, string programFiles)
    {
        var prefix = Path.Combine(Path.GetFullPath(programFiles), "WindowsApps") + Path.DirectorySeparatorChar;
        var path = Path.GetFullPath(executable);
        if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return false;
        var relative = path[prefix.Length..].Replace(Path.DirectorySeparatorChar, '/');
        return System.Text.RegularExpressions.Regex.IsMatch(relative,
            @"^OpenAI\.Codex_(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)_x64__2p2nqsd0c76g0/app/ChatGPT\.exe$",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);
    }
}
