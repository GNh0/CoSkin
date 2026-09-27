using System.Diagnostics;
namespace CoSkin;

internal static class ResidentDetection
{
    // Candidates must still pass signature, build and native ABI checks before attachment.
    internal static int[] OriginalProcesses()
    {
        var result = new List<int>();
        var originals = new HashSet<int>();
        var parents = NativeWindow.ParentProcesses();
        foreach (var process in Process.GetProcessesByName("ChatGPT"))
        {
            using (process)
            {
                try
                {
                    if (process.MainModule?.FileName is string path && IsOriginalPath(path, Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)))
                    {
                        originals.Add(process.Id);
                        if (NativeWindow.AttachmentWindow(process.Id) != IntPtr.Zero) result.Add(process.Id);
                    }
                }
                catch (Exception error) when (error is System.ComponentModel.Win32Exception or InvalidOperationException) { }
            }
        }
        // Renderer children can own Chrome_WidgetWin windows too, even while the app is hidden.
        // Browser roots have an external parent; Chromium children have an original Codex parent.
        return result.Where(id => IsBrowserRoot(id, parents, originals)).ToArray();
    }
    internal static bool IsBrowserRoot(int id, IReadOnlyDictionary<int, int> parents, IReadOnlySet<int> originals) =>
        originals.Contains(id) && parents.TryGetValue(id, out var parent) && !originals.Contains(parent);
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
