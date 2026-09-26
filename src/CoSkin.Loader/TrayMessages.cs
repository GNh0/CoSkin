namespace CoSkin;

internal sealed record TrayLabels(string Library, string Settings, string Decoration, string Launch, string ExitTogether, string Exit, string AutomaticUpdates);
internal static class TrayMessages
{
    internal static TrayLabels For(string locale)
    {
        var language = locale.Split('-', '_')[0].ToLowerInvariant();
        return language switch
        {
            "ko" => new("테마스킨 목록", "설정", "꾸미기 켜기", "전용 바로가기에서 Codex와 함께 실행", "마지막 Codex 창 종료 시 함께 종료", "CoSkin 종료", "CoSkin 자동 업데이트"),
            "ja" => new("テーマ一覧", "設定", "カスタマイズを有効にする", "専用ショートカットでCodexと起動", "最後のCodex終了時に終了", "CoSkinを終了", "CoSkinの自動更新"),
            "zh" => new("主题列表", "设置", "启用装饰", "通过专用快捷方式随Codex启动", "最后一个Codex退出时一起退出", "退出CoSkin", "自动更新CoSkin"),
            _ => new("Theme library", "Settings", "Enable decoration", "Start with Codex using dedicated shortcut", "Exit when the last Codex window closes", "Exit CoSkin", "Automatically update CoSkin")
        };
    }
    internal static string Error(string locale, string code)
    {
        var language = locale.Split('-', '_')[0].ToLowerInvariant();
        if (code == "not-installed") return language switch
        {
            "ko" => "로그인 자동 시작은 설치된 CoSkin의 기본 저장소에서만 변경할 수 있습니다.",
            "ja" => "ログイン起動はインストール済みCoSkinの標準保存先で変更できます。",
            "zh" => "只能在已安装CoSkin的默认存储中修改登录启动设置。",
            _ => "Sign-in startup can only be changed by installed CoSkin using its default store."
        };
        if (code == "not-connected")
            return language switch
            {
                "ko" => "Codex 화면이 준비되면 CoSkin이 연결합니다. 로그인과 화면 로딩을 마친 뒤 다시 열어 주세요. 테마와 이미지는 보존됩니다.",
                "ja" => "Codex画面の準備ができるとCoSkinが接続します。ログインと読み込み後に再度開いてください。テーマと画像は保持されます。",
                "zh" => "Codex界面就绪后CoSkin会连接。请在登录及加载完成后重新打开，主题和图片会保留。",
                _ => "CoSkin connects when the Codex interface is ready. Open again after signing in and loading finishes. Themes and images are preserved."
            };
        if (code == "unsupported-codex") return language switch
        {
            "ko" => "CoSkin은 실행 중입니다. 현재 Codex 버전의 연결 지원을 아직 확인하지 못했습니다. 테마와 이미지를 보존하고 트레이에서 대기합니다.",
            "ja" => "CoSkinは起動しています。現在のCodexバージョンへの接続対応は未確認です。テーマと画像を保持し、トレイで待機します。",
            "zh" => "CoSkin已启动，尚未确认当前Codex版本的连接支持。主题和图片会保留，并在托盘等待。",
            _ => "CoSkin is running. Connection support for this Codex version has not been verified yet. Themes and images are preserved while CoSkin waits in the tray."
        };
        if (code == "codex-running") return language switch
        {
            "ko" => "Codex가 이미 실행 중이며 자동으로 연결할 통로가 없습니다. CoSkin은 대기를 유지하고 Codex를 종료하거나 다시 실행하지 않습니다. 현재 작업을 보존한 상태에서 연결 준비 방법을 확인해 주세요.",
            "ja" => "Codexは起動中ですが自動接続の経路がありません。CoSkinは待機を続け、Codexを終了・再起動しません。作業を保持したまま接続準備の方法をご確認ください。",
            "zh" => "Codex已运行，但没有自动连接通道。CoSkin将继续等待，不会退出或重启Codex。请保留当前工作并查看连接准备方法。",
            _ => "Codex is already running without an automatic connection channel. CoSkin keeps waiting and will not close or restart Codex. Preserve your work while reviewing connection setup."
        };
        return language switch
        {
            "ko" => "요청을 완료하지 못했습니다. 기존 테마와 설정은 보존했습니다. 다시 시도하거나 진단 기록을 확인해 주세요.",
            "ja" => "操作を完了できませんでした。テーマと設定は保持されています。再試行するか診断を確認してください。",
            "zh" => "操作未能完成，原有主题和设置已保留。请重试或查看诊断记录。",
            _ => "The action could not complete. Your themes and settings are preserved. Retry or check diagnostics."
        };
    }

}
