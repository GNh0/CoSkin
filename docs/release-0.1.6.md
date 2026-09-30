# CoSkin 0.1.6

## 한국어

Codex 업데이트 후 고정 버전 목록에 걸려 연결하지 못하던 문제를 수정했습니다. 원본 실행 파일과 chrome.dll의 OpenAI 서명, 실제 x64 연결 함수와 응답을 검사하고, 화면에서는 지원 마커를 직접 탐색합니다. 실행 중인 원본 Codex가 Store의 최신 설치 버전과 달라도 직접 검증합니다.

테마 목록에 번호 페이지·처음/끝 이동·직접 페이지 이동, 정렬과 페이지 크기 선택을 추가했습니다. 그룹을 중첩 가능한 폴더 트리로 관리하며, 하위 폴더 생성·이동·접기·검색과 하위 테마 포함 보기를 지원합니다. 검색 가능한 접힌 선택기로 폴더·태그를 찾고, 선택한 테마들의 즐겨찾기·폴더 이동·태그 추가를 일괄 처리할 수 있습니다. 검색·필터·목록 위치를 유지하면서 상세 화면을 확인할 수 있습니다.

주 목록에 폴더와 테마를 함께 표시합니다. 폴더를 더블클릭하거나 Enter로 열고, 뒤로·앞으로·상위 폴더와 경로 표시로 이동하세요. 선택한 테마를 폴더로 끌어 옮길 수 있습니다. 폴더/트리 보기와 미리보기 카드/미리보기 없는 한 줄 목록을 각각 전환하며, 한 줄 목록은 미리보기 미디어를 요청하지 않습니다. 생성·상세·설정·편집 화면의 간격·카드·입력·스위치 디자인도 통일했습니다.

기존 테마·리비전·미디어·적용 상태는 보존합니다. Windows x64에서 Codex와 같은 Windows 권한으로 실행하세요. 필요한 연결 함수나 화면 구조가 향후 바뀌면 CoSkin 업데이트가 필요할 수 있습니다.

Node 검사 99개, .NET 호스트 검사 220개, ESLint·TypeScript·Windows x64 빌드를 통과했습니다. 실제 Codex 26.928.2636.0의 두 창에 연결했고 배경 영상의 재생을 확인했습니다. 실제 목록 화면에서 임시 1,200개 테마로 페이지·검색·더블클릭·탐색·드래그 이동·이동 실패 보존·한 줄 미디어 요청 0건·다중 선택·상세 복귀 등 35항목을 검사했습니다. 생성·상세·설정·편집 화면도 실제로 열어 검수했으며, 검사 전후 기존 라이브러리와 설정의 해시가 일치했습니다.

## English

Fixed attachment being rejected after a Codex update by a fixed version list. CoSkin checks the original executable and chrome.dll signatures, required x64 exports and connection response, then discovers supported UI markers. A running original package is verified directly even when the Store has installed a newer one.

The library adds numbered pages, first/last and direct page navigation, sorting and page sizes. A nested folder tree supports subfolder creation, moving, collapsing, searching and including descendant themes. Searchable collapsed folder/tag pickers and multi-select favorites, folder moves and tags make large libraries easier to organize. Opening details preserves the library query, filters and position.

The main pane contains folders and themes together. Open folders by double-click or Enter; navigate with back, forward, parent and breadcrumbs, or drag selected themes into a folder. Folder/tree view and preview cards/one-line list are independent choices. The one-line list requests no preview media. Creation, details, settings and editing now share consistent cards, spacing, inputs and switches.

Existing themes, revisions, media and bindings are preserved. Run both apps on Windows x64 at the same privilege level. Future changes to internal connection APIs or UI structure may require a CoSkin update.

Passed 99 Node tests, 220 .NET host tests, ESLint, TypeScript and the Windows x64 build. Connected to two windows of Codex 26.928.2636.0 and verified background video playback. An ephemeral 1,200-theme catalog passed 35 actual UI checks, including navigation, double-click, drag moves, failed-move preservation and zero preview requests in list mode. Creation, details, settings and editing were visually inspected; existing library and settings hashes remained unchanged.

## 日本語

Codex更新後に固定バージョン一覧で接続を拒否する問題を修正しました。原本の実行ファイルとchrome.dllの署名、必要なx64関数と接続応答を確認し、対応する画面マーカーを直接探します。Store更新後も実行中の原本を個別に検証します。

番号付きページ、先頭・末尾・指定ページへの移動、並び替え、ページサイズを追加しました。階層フォルダーツリーでサブフォルダーの作成・移動・折り畳み・検索と配下テーマの表示ができます。検索できる折り畳み選択欄と、お気に入り・フォルダー移動・タグの一括整理を提供します。詳細表示後も検索・フィルター・一覧位置を保持します。

主一覧にフォルダーとテーマを表示し、ダブルクリックまたはEnterでフォルダーを開けます。戻る・進む・親フォルダー・パスで移動でき、選択テーマをフォルダーへドラッグできます。フォルダー/ツリー表示とプレビューカード/一行一覧を切り替え、一行一覧はプレビューメディアを読み込みません。作成・詳細・設定・編集画面のカード、間隔、入力欄、スイッチも統一しました。

既存テーマ・履歴・メディア・適用状態を保持します。Windows x64で両アプリの権限を揃えてください。将来接続APIや画面構造が変わると更新が必要になる場合があります。

Node検査99件、.NETホスト検査220件、ESLint・TypeScript・Windows x64ビルドを通過しました。Codex 26.928.2636.0の2ウィンドウで接続と背景動画再生を確認しました。一時的な1,200テーマ一覧でダブルクリック、移動、ドラッグ、失敗時の保持、一行表示の読み込み0件など実画面35項目を検査しました。作成・詳細・設定・編集画面も確認し、既存ライブラリと設定のハッシュ一致を確認しました。

## 简体中文

修复Codex更新后因固定版本列表而拒绝连接的问题。检查原始执行文件及chrome.dll签名、所需x64函数和连接响应，并直接查找受支持的界面标记。即使Store已安装新版，也会直接验证仍在运行的原始软件包。

主题列表新增页码、首页/末页/指定页面跳转、排序及每页数量选择。嵌套文件夹树支持创建子文件夹、移动、折叠、搜索及显示子文件夹中的主题。可搜索的折叠文件夹/标签选择器与收藏、文件夹移动、标签批量整理方便管理大型列表。查看详情后保留查询、筛选条件和列表位置。

主列表同时显示文件夹和主题，可双击或按Enter打开文件夹，通过后退、前进、上级及路径导航，并将已选主题拖入文件夹。文件夹/树形视图与预览卡片/单行列表可分别切换；单行列表不请求预览媒体。创建、详情、设置和编辑页面统一了卡片、间距、输入框和开关设计。

保留现有主题、历史版本、媒体及应用状态。请在Windows x64上以相同权限运行两个应用。未来内部连接API或界面结构变化时可能需要更新CoSkin。

通过99项Node测试、220项.NET宿主测试、ESLint、TypeScript及Windows x64构建。在Codex 26.928.2636.0的两个窗口中验证连接和背景视频播放。临时1,200主题列表通过双击、导航、拖动、失败后保留状态、单行列表预览请求为0等35项实际界面检查。创建、详情、设置和编辑页面也经过目视检查；原有库和设置的哈希保持一致。
