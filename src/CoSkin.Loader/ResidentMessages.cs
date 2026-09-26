namespace CoSkin;

internal static class ResidentMessages
{
    private static string Language(string locale) => locale.Split('-', '_')[0].ToLowerInvariant();
    internal static string SettingsOptions(string locale) => Language(locale) switch { "ko" => "실행 및 트레이", "ja" => "起動とトレイ", "zh" => "启动与托盘", _ => "Startup and tray" };
    internal static string Options(string locale) => Language(locale) switch { "ko" => "설치 옵션", "ja" => "インストール設定", "zh" => "安装选项", _ => "Installation options" };
    internal static string Themes(string locale) => Language(locale) switch { "ko" => "테마 선택", "ja" => "テーマを選択", "zh" => "选择主题", _ => "Choose theme" };
    internal static string Desktop(string locale) => Language(locale) switch { "ko" => "바탕화면 바로가기 만들기", "ja" => "デスクトップにショートカットを作成", "zh" => "创建桌面快捷方式", _ => "Create desktop shortcut" };
    internal static string DesktopHelp(string locale) => Language(locale) switch { "ko" => "CoSkin을 직접 열어 트레이에서 대기합니다.", "ja" => "CoSkinを開きトレイで待機します。", "zh" => "直接打开CoSkin并在托盘等待。", _ => "Open CoSkin directly and wait in the tray." };
    internal static string Status(string locale, bool connected, bool detected) => Language(locale) switch
    {
        "ko" => connected ? "Codex 연결됨" : detected ? "Codex 감지됨 · 연결 중" : "Codex 대기 중",
        "ja" => connected ? "Codex接続済み" : detected ? "Codex検出 · 接続中" : "Codexを待機中",
        "zh" => connected ? "Codex已连接" : detected ? "已检测Codex · 正在连接" : "等待Codex",
        _ => connected ? "Codex connected" : detected ? "Codex detected · connecting" : "Waiting for Codex"
    };
    internal static string Settings(string locale) => Language(locale) switch { "ko" => "CoSkin 설정", "ja" => "CoSkin設定", "zh" => "CoSkin设置", _ => "CoSkin settings" };
    internal static string Save(string locale) => Language(locale) switch { "ko" => "저장", "ja" => "保存", "zh" => "保存", _ => "Save" };
    internal static string Waiting(string locale) => Language(locale) switch { "ko" => "Codex가 실행되면 자동으로 연결합니다. 실행 순서와 관계없이 사용할 수 있습니다.", "ja" => "Codexが起動すると自動接続します。どちらを先に起動しても使えます。", "zh" => "Codex运行时自动连接，无论先启动哪个应用。", _ => "Connect automatically when Codex is running, in either launch order." };
    internal static string StartupHelp(string locale) => Language(locale) switch { "ko" => "로그인 후 트레이에서 대기합니다. Codex를 자동 실행하지 않습니다.", "ja" => "サインイン後トレイで待機します。Codexは自動起動しません。", "zh" => "登录后在托盘等待，不会自动启动Codex。", _ => "Wait in the tray after sign-in without automatically starting Codex." };
    internal static string OpenCodex(string locale) => Language(locale) switch
    {
        "ko" => "Codex 열기 · 다시 연결",
        "ja" => "Codexを開く・再接続",
        "zh" => "打开Codex · 重新连接",
        _ => "Open Codex · reconnect"
    };
    internal static string Startup(string locale) => Language(locale) switch
    {
        "ko" => "Windows 로그인 시 CoSkin 시작",
        "ja" => "Windowsサインイン時にCoSkinを起動",
        "zh" => "Windows登录时启动CoSkin",
        _ => "Start CoSkin at Windows sign-in"
    };
}
