using System.Globalization;
using System.Runtime.InteropServices;

namespace CoSkin;

internal static class ApplicationNotice
{
    internal static void Failure(Exception error)
    {
        var message = error is TrayActionException action && action.Code == "codex-running"
            ? CultureInfo.CurrentUICulture.TwoLetterISOLanguageName switch
            {
                "ko" => "Codex가 이미 실행 중입니다. 작업을 저장하고 직접 정상 종료한 뒤 Codex + CoSkin 바로가기로 다시 실행해 주세요. CoSkin은 실행 중인 Codex를 강제로 종료하지 않습니다.",
                "ja" => "Codexは既に起動しています。作業を保存して通常終了してからCodex + CoSkinで起動してください。CoSkinはCodexを強制終了しません。",
                "zh" => "Codex已在运行。请保存工作并正常退出，然后使用Codex + CoSkin启动。CoSkin不会强制关闭Codex。",
                _ => "Codex is already running. Save your work and close it normally, then use Codex + CoSkin. CoSkin will not force Codex to quit."
            }
            : TrayMessages.Error(CultureInfo.CurrentUICulture.Name, "startup");
        MessageBox(IntPtr.Zero, message, "CoSkin", 0x10);
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr window, string text, string caption, uint type);
}
