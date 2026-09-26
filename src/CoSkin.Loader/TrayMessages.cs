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
        if (code == "not-connected")
            return language switch
            {
                "ko" => "Codex + CoSkin 전용 바로가기로 실행한 뒤 다시 시도해 주세요.",
                "ja" => "Codex + CoSkin専用ショートカットから起動して再試行してください。",
                "zh" => "请通过Codex + CoSkin专用快捷方式启动，然后重试。",
                _ => "Start using the Codex + CoSkin shortcut, then try again."
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
