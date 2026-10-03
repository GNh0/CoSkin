using System.Runtime.InteropServices;
namespace CoSkin;

internal static class NativeFilePicker
{
    // Separate shell histories keep a theme package save from changing the background save folder.
    private static readonly Guid BackgroundHistory = new("4c45e343-78b9-43a9-9183-13e4a1a9f1d6");
    private static readonly Guid ThemeHistory = new("77db7014-8b45-43de-9158-590160c5b839");
    private static readonly Guid ConverterHistory = new("7665f09e-1c36-4863-a3a9-0768f6578717");
    internal static string? SaveBackground(string filename, string extension, string title) => Pick(true, filename, extension, title, BackgroundHistory);
    internal static string? SaveTheme(string filename, string title) => Pick(true, filename, "coskin", title, ThemeHistory);
    internal static string? Converter(string title) => Pick(false, "ffmpeg.exe", "exe", title, ConverterHistory);
    private static string? Pick(bool save, string filename, string extension, string title, Guid history)
    {
        var completion = new TaskCompletionSource<string?>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() =>
        {
            IFileDialog? dialog = null; IShellItem? result = null; IntPtr filters = IntPtr.Zero;
            try
            {
                dialog = (IFileDialog)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid(save ? "C0B4E2F3-BA21-4773-8DBA-335EC946EB8B" : "DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7"), true)!)!;
                dialog.SetClientGuid(ref history);
                dialog.SetOptions(0x40 | 0x800 | 0x8 | 0x4 | (save ? 0x2u : 0x1000u));
                dialog.SetTitle(title); dialog.SetFileName(filename); dialog.SetDefaultExtension(extension);
                filters = Marshal.AllocCoTaskMem(Marshal.SizeOf<FilterSpec>());
                Marshal.StructureToPtr(new FilterSpec { Name = extension.ToUpperInvariant() + " (*." + extension + ")", Pattern = "*." + extension }, filters, false);
                dialog.SetFileTypes(1, filters); dialog.SetFileTypeIndex(1);
                var status = dialog.Show(IntPtr.Zero);
                if (status == unchecked((int)0x800704C7)) { completion.SetResult(null); return; }
                Marshal.ThrowExceptionForHR(status);
                dialog.GetResult(out result); result.GetDisplayName(0x80058000, out var pointer);
                try { completion.SetResult(Marshal.PtrToStringUni(pointer)); } finally { Marshal.FreeCoTaskMem(pointer); }
            }
            catch (Exception error) { completion.SetException(error); }
            finally
            {
                if (filters != IntPtr.Zero) { Marshal.DestroyStructure<FilterSpec>(filters); Marshal.FreeCoTaskMem(filters); }
                if (result is not null) Marshal.ReleaseComObject(result);
                if (dialog is not null) Marshal.ReleaseComObject(dialog);
            }
        }) { IsBackground = true, Name = "CoSkin background export file" };
        thread.SetApartmentState(ApartmentState.STA); thread.Start();
        return completion.Task.GetAwaiter().GetResult();
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct FilterSpec { [MarshalAs(UnmanagedType.LPWStr)] public string Name; [MarshalAs(UnmanagedType.LPWStr)] public string Pattern; }
    [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileDialog
    {
        [PreserveSig] int Show(IntPtr owner);
        void SetFileTypes(uint count, IntPtr filters); void SetFileTypeIndex(uint index); void GetFileTypeIndex(out uint index);
        void Advise(IntPtr events, out uint cookie); void Unadvise(uint cookie); void SetOptions(uint options); void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem folder); void SetFolder(IShellItem folder); void GetFolder(out IShellItem folder); void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name); void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title); void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label); void GetResult(out IShellItem item); void AddPlace(IShellItem item, uint alignment);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension); void Close(int result); void SetClientGuid(ref Guid guid); void ClearClientData(); void SetFilter(IntPtr filter);
    }
    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        void BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out IntPtr value); void GetParent(out IShellItem parent);
        void GetDisplayName(uint kind, out IntPtr name); void GetAttributes(uint mask, out uint attributes); void Compare(IShellItem item, uint hint, out int order);
    }
}
