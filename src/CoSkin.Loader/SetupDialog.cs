using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
namespace CoSkin;

internal sealed record SetupChoices(RuntimePreferences Preferences, bool Associate);
internal sealed record SetupLabels(string Title, string Heading, string Subtitle, string Launch, string LaunchHelp, string Exit, string ExitHelp, string Updates, string UpdatesHelp, string Associate, string AssociateHelp, string Install, string Cancel);
internal static class SetupMessages
{
    internal static (string Heading, string Help, string Close) Completed(string locale) => locale.Split('-', '_')[0].ToLowerInvariant() switch
    {
        "ko" => ("설치를 마쳤어요", "시작 메뉴의 Codex + CoSkin에서 실행할 수 있습니다. 테마와 이미지는 내부 목록에 보관하며, 시스템 트레이에서 설정을 바꿀 수 있습니다.", "확인"),
        "ja" => ("インストールが完了しました", "スタートメニューのCodex + CoSkinから起動できます。テーマと画像は一覧に保持され、トレイから設定を変更できます。", "完了"),
        "zh" => ("安装完成", "可从开始菜单的Codex + CoSkin启动。主题和图片保存在内部列表，可通过系统托盘修改设置。", "完成"),
        _ => ("You're ready to start", "Launch Codex + CoSkin from the Start menu. Themes and images stay in your library; change settings from the system tray.", "Done")
    };
    internal static SetupLabels For(string locale) => locale.Split('-', '_')[0].ToLowerInvariant() switch
    {
        "ko" => new("CoSkin 설치", "Codex를 나만의 공간으로", "현재 사용자에게만 설치합니다. 테마와 Codex 데이터는 보존합니다.", "전용 바로가기에서 Codex와 함께 실행", "Codex + CoSkin 바로가기에만 적용합니다. 원래 바로가기는 바꾸지 않습니다.", "Codex 종료 시 CoSkin 함께 종료", "연결된 마지막 대상 종료 후 종료하며 Codex를 강제로 닫지 않습니다.", "CoSkin 자동 업데이트", "켜면 서명된 안정 버전을 확인합니다. 배포 키 준비 전에는 다운로드하지 않습니다.", ".coskin 파일 연결", "파일을 열면 테마스킨 목록으로 가져옵니다. 자동 적용하지 않습니다.", "설치", "취소"),
        "ja" => new("CoSkinのインストール", "Codexを自分だけの空間に", "現在のユーザーのみにインストールします。テーマとCodexデータは保持します。", "専用ショートカットでCodexと起動", "Codex + CoSkinのみに適用。元のショートカットは変更しません。", "Codex終了時にCoSkinも終了", "最後の接続先終了後に終了。Codexを強制終了しません。", "CoSkinの自動更新", "署名済み安定版を確認。配信キー準備前はダウンロードしません。", ".coskinファイルの関連付け", "開いたファイルをテーマ一覧に取り込みます。自動適用しません。", "インストール", "キャンセル"),
        "zh" => new("安装CoSkin", "让Codex成为专属空间", "仅为当前用户安装。保留主题与Codex数据。", "通过专用快捷方式随Codex启动", "仅适用于Codex + CoSkin，不更改原来的快捷方式。", "Codex退出时同时退出CoSkin", "最后一个连接目标退出后关闭，不会强制关闭Codex。", "自动更新CoSkin", "检查签名稳定版本。发布密钥准备前不会下载。", "关联.coskin文件", "打开文件时导入主题列表，不会自动应用。", "安装", "取消"),
        _ => new("Install CoSkin", "Make Codex your own", "Install for this user only. Your themes and Codex data are preserved.", "Start with Codex from dedicated shortcut", "Applies only to Codex + CoSkin. Your original shortcut stays unchanged.", "Exit CoSkin when Codex closes", "Exit after the last connected target closes. Never force Codex to quit.", "Automatic CoSkin updates", "Check signed stable releases. No downloads until the release key is ready.", "Associate .coskin files", "Open files into the theme library without applying them automatically.", "Install", "Cancel")
    };
}

/// <summary>System-rendered controls retain contrast, keyboard navigation, DPI scaling and accessibility.</summary>
internal static class SetupDialog
{
    private delegate IntPtr DialogProcedure(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam);
    internal static void Completed(string? locale = null) => Show(new(), false, locale, true);
    internal static SetupChoices? Show(RuntimePreferences initial, bool associate, string? locale = null, bool completed = false)
    {
        var language = locale ?? CultureInfo.CurrentUICulture.Name;
        var labels = SetupMessages.For(language);
        var completion = SetupMessages.Completed(language);
        var controls = new List<(int Id, string Text, short X, short Y, short Width, short Height, ushort Class, uint Style)>();
        void Label(string text, short y, short height, int id) => controls.Add((id, text, 24, y, 352, height, 0x82, 0));
        void Choice(int id, string title, string help, short y) => controls.Add((id, title + "\n" + help, 24, y, 352, 44, 0x80, 0x00012023));
        Label("CoSkin", 18, 27, 100);
        Label(completed ? completion.Heading : labels.Heading, 50, 18, 101);
        Label(completed ? completion.Help : labels.Subtitle, 72, completed ? (short)56 : (short)26, 102);
        controls.Add((103, "0.1.0-beta.1", 300, 27, 76, 14, 0x82, 0));
        if (!completed)
        {
            Choice(11, labels.Launch, labels.LaunchHelp, 106);
            Choice(12, labels.Exit, labels.ExitHelp, 156);
            Choice(13, labels.Updates, labels.UpdatesHelp, 206);
            Choice(14, labels.Associate, labels.AssociateHelp, 256);
            controls.Add((2, labels.Cancel, 218, 318, 74, 27, 0x80, 0x0001000b));
        }
        controls.Add((1, completed ? completion.Close : labels.Install, 302, completed ? (short)140 : (short)318, 74, 27, 0x80, 0x0001000b));
        using var bytes = new MemoryStream();
        using var writer = new BinaryWriter(bytes, Encoding.Unicode, true);
        void String(string text)
        {
            writer.Write(Encoding.Unicode.GetBytes(text));
            writer.Write((ushort)0);
        }
        void Align()
        {
            while (bytes.Length % 4 != 0)
                writer.Write((byte)0);
        }
        writer.Write(0x80c800c0u);
        writer.Write(0u);
        writer.Write((ushort)controls.Count);
        writer.Write((short)0);
        writer.Write((short)0);
        writer.Write((short)400);
        writer.Write(completed ? (short)182 : (short)360);
        writer.Write((ushort)0);
        writer.Write((ushort)0);
        String(labels.Title);
        writer.Write((ushort)10);
        String("Segoe UI");
        foreach (var control in controls)
        {
            Align();
            writer.Write(0x50000000u | control.Style);
            writer.Write(0u);
            writer.Write(control.X);
            writer.Write(control.Y);
            writer.Write(control.Width);
            writer.Write(control.Height);
            writer.Write((ushort)control.Id);
            writer.Write((ushort)0xffff);
            writer.Write(control.Class);
            String(control.Text);
            writer.Write((ushort)0);
        }
        var template = Marshal.AllocHGlobal((int)bytes.Length);
        using var drawing = new SetupDrawing(locale ?? CultureInfo.CurrentUICulture.Name);
        SetupChoices? result = null;
        DialogProcedure procedure = (window, message, wParam, lParam) =>
        {
            var painted = drawing.Handle(window, message, wParam, lParam);
            if (painted is not null)
                return painted.Value;
            if (message == 0x0110)
            {
                CheckDlgButton(window, 11, initial.LaunchWithCodex ? 1u : 0u);
                CheckDlgButton(window, 12, initial.ExitWithCodex ? 1u : 0u);
                CheckDlgButton(window, 13, initial.AutomaticUpdates ? 1u : 0u);
                CheckDlgButton(window, 14, associate ? 1u : 0u);
                return new IntPtr(1);
            }
            if (message == 0x0111)
            {
                var id = (int)(wParam.ToUInt64() & 0xffff);
                if (id == 1)
                {
                    result = new(new(IsDlgButtonChecked(window, 11) == 1, IsDlgButtonChecked(window, 12) == 1, IsDlgButtonChecked(window, 13) == 1), IsDlgButtonChecked(window, 14) == 1);
                    EndDialog(window, new IntPtr(1));
                    return new IntPtr(1);
                }
                if (id == 2)
                {
                    EndDialog(window, IntPtr.Zero);
                    return new IntPtr(1);
                }
            }
            if (message == 0x0010)
            {
                EndDialog(window, IntPtr.Zero);
                return new IntPtr(1);
            }
            return IntPtr.Zero;
        };
        try
        {
            var previousDpi = SetThreadDpiAwarenessContext(new IntPtr(-4));
            try
            {
                Marshal.Copy(bytes.ToArray(), 0, template, (int)bytes.Length);
                if (DialogBoxIndirectParam(GetModuleHandle(null), template, IntPtr.Zero, procedure, IntPtr.Zero) == new IntPtr(-1))
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                return result;
            }
            finally { if (previousDpi != IntPtr.Zero) SetThreadDpiAwarenessContext(previousDpi); }
        }
        finally { Marshal.FreeHGlobal(template); GC.KeepAlive(procedure); }
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string? name);
    [DllImport("user32.dll")] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll", EntryPoint = "DialogBoxIndirectParamW", SetLastError = true)] private static extern IntPtr DialogBoxIndirectParam(IntPtr instance, IntPtr template, IntPtr parent, DialogProcedure procedure, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EndDialog(IntPtr window, IntPtr result);
    [DllImport("user32.dll")] private static extern bool CheckDlgButton(IntPtr window, int id, uint check);
    [DllImport("user32.dll")] private static extern uint IsDlgButtonChecked(IntPtr window, int id);
}
