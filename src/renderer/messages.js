import { panelMessages } from "./panel-messages.js";
import { controlMessages } from "./control-messages.js";
import { applicationLocale } from "./locale.js";
export const messages = {
  ko: {
    fontFamily: "글꼴",
    fontDefault: "Codex 기본 글꼴",
    fontHint:
      "이 컴퓨터에 설치된 글꼴 이름을 입력하세요. 비워 두면 기본 글꼴을 사용합니다.",
    fontWeight: "글자 굵기",
    autoTextColor: "글자색 자동 맞춤",
    autoTextHint:
      "테마 색은 은은하게 반영하고 글자 대비를 우선합니다. 밝은 GIF·영상에서도 읽히도록 필요하면 글자 뒤 배경을 더 진하게 표시합니다. 코드·상태 색상은 유지합니다.",
    textColorMode: "글자색 설정",
    textColorTheme: "테마 설정 따르기",
    textColorManual: "직접 지정",
    assetRecommended: "권장 {size}px · 비율 {ratio}",
    assetCurrent: "현재 영역 {width} × {height}px",
    assetAnimated:
      "GIF 권장 {size}px 이하, 짧은 반복 구간 · 긴 고화질 배경은 MP4 추천",
    assetFitHint:
      "영역 채우기는 가장자리가 잘릴 수 있습니다. 전체 이미지를 보려면 비율 유지를 선택하세요.",
    favorites: "즐겨찾기",
    favoriteTheme: "{name} 즐겨찾기 추가",
    unfavoriteTheme: "{name} 즐겨찾기 해제",
    group: "그룹",
    tags: "태그",
    organizationTitle: "내 테마 정리",
    organizationHint:
      "태그를 한 줄에 하나씩 입력하세요. 분류를 바꿔도 테마와 적용 상태는 유지됩니다.",
    tagsPlaceholder: "러브코미디\nGIF\n치카댄스",
    saveOrganization: "분류 저장",
    ungrouped: "그룹 없음",
    allGroups: "모든 그룹",
    allTags: "모든 태그",
    filterGroup: "그룹 필터",
    filterTag: "태그 필터",
    manageGroups: "그룹 관리",
    newGroup: "그룹 만들기",
    groupName: "그룹 이름",
    renameGroup: "이름 저장",
    deleteGroupPrompt:
      "“{name}” 그룹을 삭제할까요? 테마는 목록에 그대로 남습니다.",
    clearFilters: "필터 초기화",
    scope: "적용 범위",
    global: "전체",
    project: "프로젝트",
    thread: "채팅",
    library: "테마스킨 목록",
    tagline: "나만의 Codex를 만들어 보세요.",
    create: "+ 테마 만들기",
    import: "가져오기",
    requestTheme: "테마 요청문",
    requestPromptLabel: "AI에게 보낼 CoSkin 테마 요청문",
    requestPromptHint: "대괄호 부분을 고친 뒤 복사해서 AI에게 보내세요.",
    copyPrompt: "요청문 복사",
    copiedPrompt: "요청문을 복사했습니다.",
    copyPromptFailed:
      "자동 복사에 실패했습니다. 선택된 내용을 Ctrl+C로 복사하세요.",
    resetPrompt: "기본 문구로 되돌리기",
    requestPromptTemplate: `CoSkin은 Windows용 Codex 데스크톱 앱에 독립적으로 연결되는 테마 관리자입니다. 원래 Codex 앱 파일을 직접 수정하지 않고, 배경·사이드바·프로젝트/채팅 행·입력창 등을 꾸밉니다. 테마 교환 파일인 .coskin은 manifest.json, theme.json, 자산 파일을 담는 ZIP 기반 패키지입니다.

먼저 https://github.com/GNh0/CoSkin 의 README와 https://github.com/GNh0/CoSkin/blob/main/docs/theme-package-spec.md 를 읽고 현재 설치된 버전의 실제 지원 대상과 형식을 확인해 주세요. 문서와 실제 .coskin 예제 모두에 접근할 수 없다면 형식을 추측해 패키지를 만들지 말고 필요한 자료를 요청해 주세요.

아래 조건으로 새 테마를 제작해 주세요. 실행 가능한 환경이라면 완성된 테마를 실제로 가져와 미리보기·적용까지 검증하고, 확인하지 못한 부분은 밝혀 주세요.

테마 이름: [이름]
콘셉트·분위기: [예: 차분한 밤바다]
참고 이미지·영상: [첨부 파일·경로·링크 또는 없음]
배경 종류: [정지 이미지 / GIF / 무음 반복 MP4 / 없음]
배경 구도: [전체 보이기 / 영역 채우기], 중요 피사체 위치 [위치]
색감·밝기: [원하는 색과 밝기]
움직임·반복 방식: [원하는 동작과 속도]
적용 범위: [앱 전체 / 프로젝트 / 채팅]
영역별 요청: 상단 컨트롤 [설정], 왼쪽 사이드바 [설정], 프로젝트 행 [설정], 채팅 행 [설정], 본문 [설정], 입력창 [설정]
피할 점: [원치 않는 색·효과·가림]

기본 컨트롤과 글자·버튼이 읽히게 하고, 프로젝트 행과 채팅 행을 구분해 주세요. 배경이 창 모서리 밖으로 삐져나오지 않게 맞춰 주세요. 참고 미디어 원본은 보존해 주세요. 가져올 수 있는 .coskin 파일과 미리보기 이미지를 제공하고, 실제 적용 화면에서 구도·모서리·영상 반복을 확인한 결과를 알려 주세요.`,
    search: "테마스킨 검색",
    count: "{count}개의 테마",
    detail: "{name} 상세보기",
    applied: "현재 적용 중",
    skin: "Codex 테마스킨",
    apply: "적용",
    preview: "미리보기",
    delete: "삭제",
    empty: "첫 테마를 만들어 보세요",
    noResults: "검색 결과가 없습니다",
    emptyDescription: "테마를 만들거나 .coskin 파일을 가져오세요.",
    previous: "이전",
    next: "다음",
    pages: "목록 페이지",
    back: "← 테마스킨 목록",
    description: "직접 만드는 Codex 테마스킨",
    edit: "편집",
    author: "제작자 · {name}",
    images: "이미지 {count}개",
    export: "내보내기",
    duplicate: "복제",
    close: "Codex 화면으로",
    loadingPreview: "미리보기 준비 중",
    previewAlt: "예시 프로젝트와 채팅으로 만든 테마 미리보기",
    sampleProject: "예시 프로젝트",
    sampleChat: "예시 채팅",
    samplePrompt: "무엇을 만들까요?",
    sampleComposer: "예시 작성창",
  },
  en: {
    fontFamily: "Font family",
    fontDefault: "Codex default font",
    fontHint:
      "Enter a font installed on this computer. Leave empty to use the default font.",
    fontWeight: "Font weight",
    autoTextColor: "Match text colors automatically",
    autoTextHint:
      "Prioritize readable text with a subtle theme tint. Bright GIF and video scenes may need a stronger surface behind text. Code and status colors stay unchanged.",
    textColorMode: "Text color",
    textColorTheme: "Follow theme settings",
    textColorManual: "Choose manually",
    assetRecommended: "Recommended {size}px · {ratio}",
    assetCurrent: "Current region {width} × {height}px",
    assetAnimated:
      "GIF: {size}px or smaller, short loops · MP4 for long high-quality backgrounds",
    assetFitHint:
      "Cover may crop the edges. Choose Contain to show the entire image.",
    favorites: "Favorites",
    favoriteTheme: "Favorite {name}",
    unfavoriteTheme: "Unfavorite {name}",
    group: "Group",
    tags: "Tags",
    organizationTitle: "Organize your theme",
    organizationHint:
      "Enter one tag per line. Organization preserves the theme and its applied state.",
    tagsPlaceholder: "Romcom\nGIF\nChika dance",
    saveOrganization: "Save organization",
    ungrouped: "Ungrouped",
    allGroups: "All groups",
    allTags: "All tags",
    filterGroup: "Filter by group",
    filterTag: "Filter by tag",
    manageGroups: "Manage groups",
    newGroup: "Create group",
    groupName: "Group name",
    renameGroup: "Save name",
    deleteGroupPrompt: "Delete “{name}”? Its themes will stay in your library.",
    clearFilters: "Clear filters",
    scope: "Apply to",
    global: "All",
    project: "Project",
    thread: "Chat",
    library: "Theme library",
    tagline: "Make Codex your own.",
    create: "+ Create theme",
    import: "Import",
    requestTheme: "Request a theme",
    requestPromptLabel: "CoSkin theme request for an AI assistant",
    requestPromptHint:
      "Edit the bracketed fields, then copy this request to your AI assistant.",
    copyPrompt: "Copy request",
    copiedPrompt: "Request copied.",
    copyPromptFailed:
      "Automatic copy failed. Press Ctrl+C to copy the selected text.",
    resetPrompt: "Reset template",
    requestPromptTemplate: `CoSkin is an independent theme manager for the Windows Codex desktop app. It styles backgrounds, sidebars, project and chat rows, and the composer without directly modifying the original Codex app files. A .coskin exchange file is a ZIP-based package containing manifest.json, theme.json, and assets.

First read the README at https://github.com/GNh0/CoSkin and the package specification at https://github.com/GNh0/CoSkin/blob/main/docs/theme-package-spec.md, then check the actual supported targets and format of the installed version. If neither the docs nor a real .coskin example is available, do not guess the package format; ask for the missing material.

Create a new theme with the requirements below. If the environment allows it, import the finished theme and verify its preview and applied appearance; clearly state what you could not verify.

Theme name: [name]
Concept and mood: [for example, a quiet seaside evening]
Reference images or video: [attached files, paths, links, or none]
Background media: [still image / GIF / muted looping MP4 / none]
Background framing: [show entire image / fill region], important subject position [position]
Colors and brightness: [preferences]
Motion and loop: [movement and speed]
Apply to: [whole app / project / chat]
Areas: top controls [style], left sidebar [style], project rows [style], chat rows [style], main content [style], composer [style]
Avoid: [unwanted colors, effects, or occlusion]

Keep native controls, text, and buttons readable. Make project and chat rows distinguishable, and fit the background to the window corners. Preserve the original reference media. Deliver an importable .coskin file and a preview image, then report the results of checking framing, corners, and video looping in the applied theme.`,
    search: "Search themes",
    count: "{count} themes",
    detail: "View {name}",
    applied: "Currently applied",
    skin: "Codex theme",
    apply: "Apply",
    preview: "Preview",
    delete: "Delete",
    empty: "Create your first theme",
    noResults: "No themes found",
    emptyDescription: "Create a theme or import a .coskin file.",
    previous: "Previous",
    next: "Next",
    pages: "Library pages",
    back: "← Theme library",
    description: "A custom theme for Codex",
    edit: "Edit",
    author: "Created by {name}",
    images: "{count} images",
    export: "Export",
    duplicate: "Duplicate",
    close: "Return to Codex",
    loadingPreview: "Preparing preview",
    previewAlt: "Theme preview with sample projects and chats",
    sampleProject: "Sample project",
    sampleChat: "Sample chat",
    samplePrompt: "What will you create?",
    sampleComposer: "Sample composer",
  },
  ja: {
    fontFamily: "フォント",
    fontDefault: "Codexの標準フォント",
    fontHint:
      "このパソコンにインストールされたフォント名を入力してください。空欄は標準フォントです。",
    fontWeight: "文字の太さ",
    autoTextColor: "文字色を自動調整",
    autoTextHint:
      "テーマ色を控えめに反映し、文字の読みやすさを優先します。明るいGIF・動画では必要に応じて文字の背面を濃くします。コード・状態色は維持します。",
    textColorMode: "文字色の設定",
    textColorTheme: "テーマ設定に従う",
    textColorManual: "手動で指定",
    assetRecommended: "推奨 {size}px · 比率 {ratio}",
    assetCurrent: "現在の領域 {width} × {height}px",
    assetAnimated:
      "GIFは {size}px 以下の短いループを推奨。長い高画質背景にはMP4がおすすめです。",
    assetFitHint:
      "領域を埋めると端が切れる場合があります。全体を表示するには比率を維持を選びます。",
    favorites: "お気に入り",
    favoriteTheme: "{name} をお気に入りに追加",
    unfavoriteTheme: "{name} のお気に入りを解除",
    group: "グループ",
    tags: "タグ",
    organizationTitle: "テーマを整理",
    organizationHint:
      "タグは一行に一つ入力してください。分類を変更してもテーマと適用状態は保持されます。",
    tagsPlaceholder: "ラブコメ\nGIF\nチカダンス",
    saveOrganization: "分類を保存",
    ungrouped: "グループなし",
    allGroups: "すべてのグループ",
    allTags: "すべてのタグ",
    filterGroup: "グループで絞り込む",
    filterTag: "タグで絞り込む",
    manageGroups: "グループ管理",
    newGroup: "グループを作成",
    groupName: "グループ名",
    renameGroup: "名前を保存",
    deleteGroupPrompt: "「{name}」を削除しますか？テーマは一覧に残ります。",
    clearFilters: "絞り込みを解除",
    scope: "適用範囲",
    global: "全体",
    project: "プロジェクト",
    thread: "チャット",
    library: "テーマスキン一覧",
    tagline: "自分だけの Codex を作りましょう。",
    create: "+ テーマを作成",
    import: "読み込む",
    requestTheme: "テーマを依頼",
    requestPromptLabel: "AIに送るCoSkinテーマの依頼文",
    requestPromptHint:
      "角括弧の項目を編集してから、AIに依頼文を送ってください。",
    copyPrompt: "依頼文をコピー",
    copiedPrompt: "依頼文をコピーしました。",
    copyPromptFailed:
      "自動コピーに失敗しました。選択された文章をCtrl+Cでコピーしてください。",
    resetPrompt: "ひな形に戻す",
    requestPromptTemplate: `CoSkinはWindows版Codexデスクトップアプリに独立して接続するテーマ管理ツールです。元のCodexアプリのファイルを直接変更せず、背景、サイドバー、プロジェクト・チャット行、入力欄などを装飾します。交換用の.coskinファイルはmanifest.json、theme.json、素材を含むZIP形式のパッケージです。

まず https://github.com/GNh0/CoSkin のREADMEと https://github.com/GNh0/CoSkin/blob/main/docs/theme-package-spec.md を読み、インストール済みバージョンで実際に対応する箇所と形式を確認してください。文書と実際の.coskinファイルのどちらも入手できない場合は形式を推測してパッケージを作らず、必要な資料を求めてください。

以下の条件で新しいテーマを作成してください。実行可能な環境なら完成したテーマを読み込み、プレビューと適用画面を確認し、確認できなかった点は明記してください。

テーマ名: [名前]
コンセプト・雰囲気: [例: 静かな夕暮れの海]
参考画像・動画: [添付ファイル、パス、リンク、またはなし]
背景メディア: [静止画 / GIF / 無音ループMP4 / なし]
背景の表示: [全体を表示 / 領域を埋める]、重要な被写体の位置 [位置]
色と明るさ: [希望]
動きとループ: [動作と速度]
適用範囲: [アプリ全体 / プロジェクト / チャット]
箇所別の希望: 上部の操作部 [設定]、左サイドバー [設定]、プロジェクト行 [設定]、チャット行 [設定]、本文 [設定]、入力欄 [設定]
避けたいもの: [不要な色、効果、遮り]

標準の操作部、文字、ボタンを読みやすくしてください。プロジェクト行とチャット行を区別できるようにし、背景がウィンドウの角からはみ出ないようにしてください。参考メディアの原本は保存してください。読み込み可能な.coskinファイルとプレビュー画像を渡し、適用画面で構図、角、動画のループを確認した結果を報告してください。`,
    search: "テーマを検索",
    count: "{count} 件のテーマ",
    detail: "{name} の詳細",
    applied: "適用中",
    skin: "Codex テーマスキン",
    apply: "適用",
    preview: "プレビュー",
    delete: "削除",
    empty: "最初のテーマを作りましょう",
    noResults: "テーマが見つかりません",
    emptyDescription:
      "テーマを作成するか .coskin ファイルを読み込んでください。",
    previous: "前へ",
    next: "次へ",
    pages: "一覧のページ",
    back: "← テーマスキン一覧",
    description: "Codex 用のカスタムテーマ",
    edit: "編集",
    author: "作者 · {name}",
    images: "画像 {count} 枚",
    export: "書き出す",
    duplicate: "複製",
    close: "Codex に戻る",
    loadingPreview: "プレビューを準備中",
    previewAlt: "サンプルのプロジェクトとチャットを使ったテーマプレビュー",
    sampleProject: "サンプルプロジェクト",
    sampleChat: "サンプルチャット",
    samplePrompt: "何を作りましょうか？",
    sampleComposer: "サンプル入力欄",
  },
  "zh-CN": {
    fontFamily: "字体",
    fontDefault: "Codex默认字体",
    fontHint: "输入此电脑上安装的字体名称。留空则使用默认字体。",
    fontWeight: "字体粗细",
    autoTextColor: "自动匹配文字颜色",
    autoTextHint:
      "轻微融入主题色，优先保证文字可读。明亮GIF和视频可能需要加深文字背后的表面。代码和状态颜色保持不变。",
    textColorMode: "文字颜色",
    textColorTheme: "跟随主题设置",
    textColorManual: "手动指定",
    assetRecommended: "建议 {size}px · 比例 {ratio}",
    assetCurrent: "当前区域 {width} × {height}px",
    assetAnimated: "GIF建议 {size}px 以下的短循环；长时间高清背景建议使用MP4",
    assetFitHint: "填满区域可能裁剪边缘。选择保持比例可显示完整图片。",
    favorites: "收藏",
    favoriteTheme: "收藏 {name}",
    unfavoriteTheme: "取消收藏 {name}",
    group: "分组",
    tags: "标签",
    organizationTitle: "整理主题",
    organizationHint: "每行输入一个标签。更改分类会保留主题及其应用状态。",
    tagsPlaceholder: "恋爱喜剧\nGIF\n千花舞",
    saveOrganization: "保存分类",
    ungrouped: "未分组",
    allGroups: "所有分组",
    allTags: "所有标签",
    filterGroup: "按分组筛选",
    filterTag: "按标签筛选",
    manageGroups: "管理分组",
    newGroup: "创建分组",
    groupName: "分组名称",
    renameGroup: "保存名称",
    deleteGroupPrompt: "删除“{name}”分组？主题仍保留在列表中。",
    clearFilters: "清除筛选",
    scope: "应用范围",
    global: "全部",
    project: "项目",
    thread: "聊天",
    library: "主题皮肤库",
    tagline: "打造属于你的 Codex。",
    create: "+ 创建主题",
    import: "导入",
    requestTheme: "请求制作主题",
    requestPromptLabel: "发送给 AI 的 CoSkin 主题请求",
    requestPromptHint: "填写方括号中的内容，然后复制请求发送给 AI。",
    copyPrompt: "复制请求",
    copiedPrompt: "已复制请求。",
    copyPromptFailed: "自动复制失败。请按 Ctrl+C 复制已选中的文字。",
    resetPrompt: "恢复模板",
    requestPromptTemplate: `CoSkin 是独立连接到 Windows 版 Codex 桌面应用的主题管理器。它无需直接修改原版 Codex 应用文件，即可装饰背景、侧边栏、项目和聊天行以及输入框。.coskin 交换文件是包含 manifest.json、theme.json 和素材的 ZIP 格式包。

请先阅读 https://github.com/GNh0/CoSkin 的 README 和 https://github.com/GNh0/CoSkin/blob/main/docs/theme-package-spec.md，再确认已安装版本实际支持的区域与格式。如果既无法访问文档，也没有真实的 .coskin 示例文件，请勿猜测包格式；应请求提供所需资料。

请按以下条件制作新主题。如果环境允许，请导入完成的主题并验证预览和实际效果；无法验证的部分请明确说明。

主题名称：[名称]
概念与氛围：[例如安静的傍晚海边]
参考图片或视频：[附件、路径、链接或无]
背景媒体：[静态图片 / GIF / 静音循环 MP4 / 无]
背景构图：[完整显示 / 填满区域]，重要主体的位置 [位置]
颜色与亮度：[偏好]
动态与循环：[动作和速度]
应用范围：[整个应用 / 项目 / 聊天]
区域要求：顶部控件 [样式]、左侧边栏 [样式]、项目行 [样式]、聊天行 [样式]、正文 [样式]、输入框 [样式]
避免：[不需要的颜色、效果或遮挡]

请保证原生控件、文字和按钮清晰可读，让项目行与聊天行容易区分，并确保背景不超出窗口圆角。保留参考媒体原件。提供可导入的 .coskin 文件和预览图，并报告在实际应用界面检查构图、圆角及视频循环的结果。`,
    search: "搜索主题",
    count: "{count} 个主题",
    detail: "查看 {name}",
    applied: "已应用",
    skin: "Codex 主题皮肤",
    apply: "应用",
    preview: "预览",
    delete: "删除",
    empty: "创建你的第一个主题",
    noResults: "未找到主题",
    emptyDescription: "创建主题或导入 .coskin 文件。",
    previous: "上一页",
    next: "下一页",
    pages: "主题库分页",
    back: "← 主题皮肤库",
    description: "Codex 的自定义主题",
    edit: "编辑",
    author: "作者 · {name}",
    images: "{count} 张图片",
    export: "导出",
    duplicate: "复制",
    close: "返回 Codex",
    loadingPreview: "正在准备预览",
    previewAlt: "使用示例项目和聊天的主题预览",
    sampleProject: "示例项目",
    sampleChat: "示例聊天",
    samplePrompt: "想创建什么？",
    sampleComposer: "示例输入框",
  },
};
export function t(key, values = {}) {
  const locale = applicationLocale(document, navigator);
  const value = key.startsWith("panel.")
    ? panelMessages[locale][key.slice(6)]
    : key.startsWith("control.")
      ? controlMessages[locale][key.slice(8)]
      : messages[locale][key];
  if (value === undefined) throw new Error("Missing UI message: " + key);
  return value.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}
