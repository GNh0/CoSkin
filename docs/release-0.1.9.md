# CoSkin 0.1.9

## 한국어

일반 Codex 연결을 인증된 명명 파이프로 바꿨습니다. 큰 미디어를 Node inspector WebSocket으로 전달하지 않으며, 연결 종료·미완료 요청·임시 미디어를 해당 CoSkin 세션의 소유권에 따라 정리합니다. Windows 트레이 등록이 잠시 실패해도 상주 프로그램을 종료하지 않고 제한된 횟수로 재시도합니다. Codex 자체를 강제로 재시작하지 않습니다.

테마 목록은 폴더 경로·검색·필터를 중심으로 정리했습니다. 보기·정렬·페이지 크기는 옵션 메뉴에서, 폴더 편집과 여러 테마의 이동은 별도 관리창에서 설정합니다. 카드/한 줄 목록, 폴더/트리, 번호 페이지와 드래그 이동을 유지하고 큰 폴더 트리는 화면에 필요한 행만 그립니다. 테마 생성·편집·실행 설정도 간격과 컨트롤을 통일했습니다.

MP4와 WebM은512MiB·10분까지 실제 디코딩 검사 후 사용할 수 있습니다. 설정에서 모든 테마 이미지·영상의 공통 보관 폴더를 지정할 수 있고, 경로 변경은 기존 파일을 복사·해시 검증한 뒤 반영하며 원래 파일을 보존합니다. 목록용 파생 PNG는 별도128MiB 캐시에 보관해 큰 영상을 반복해서 읽지 않습니다. 동영상은 브라우저의 기본 플레이어로 재생하고, 숨긴 창에서는 멈춥니다. 전송·디코딩 동시성을 제한하고 중복 배열 복사와 불필요한0px blur 필터를 제거했습니다. 등록 검사와 재생 모두 Codex의 보안 정책을 준수합니다.

실제 기존 Codex에서2.85MB·262MB WebM 재생, 신규 WebM 등록 검사, 최소화/복원, 새 관리 화면과 보관 폴더 선택 취소를 확인했습니다. 같은25초 구도의60fps/30fps 비교본을 각각30초 재생할 때 프레임 손실은0이었습니다.30fps 파일은약31% 작았고 이 실행의 GPU3D 중앙값은약3.4%에서1.9%로 낮아졌습니다. 이 값은 기존 Codex 세션의 전체 작업을 포함하는 단일 비교이며 모든 영상·PC의 절감률을 보증하지 않습니다. 원본 영상의 해상도·속도·프레임률은 자동으로 변경하지 않습니다.

이전 Codex 종료의 정확한 예외는 확보하지 못했습니다. 별도 Node 프로세스에서 재현한 inspector 프레임 문제와 실제 과거 종료의 인과관계를 확정하지 않습니다. 현재 검증 범위는 [지원 안내](support-matrix.md)에 기록합니다.

Node242개·호스트367개·보관 폴더80개·PNG 캐시25개 검사와 ESLint·TypeScript·Windows x64 빌드를 통과했습니다. 최종 설치 교체에서 기존 리비전635개·라이브러리·설정과 원본 미디어1328개를 해시로 확인해 보존했습니다.

## English

Normal Codex attachment now uses an authenticated named pipe rather than the Node inspector WebSocket. Pending requests and temporary media are cleaned up within their owning CoSkin session. Temporary Windows tray registration failures use bounded retries without terminating the resident application. CoSkin does not forcibly restart Codex.

The library now centers on folder navigation, search and an on-demand filter panel. View, sorting and page-size options are grouped in a menu; folder editing and batch moves use separate dialogs. Cards, thumbnail-free rows, folder/tree views, numbered pages and drag moves remain available. Large folder trees render only visible rows. Creation, editing and runtime settings share consistent spacing and controls.

MP4/WebM admission supports512MiB and10minutes with real decoding checks. A global media storage folder can be selected in settings; migration verifies copied hashes before switching and retains original files. Derived PNG thumbnails use a separate128MiB cache. Native video playback pauses in hidden windows, media concurrency is bounded, duplicate byte-array copies and unnecessary0px blur filters are removed, and both import validation and playback respect Codex CSP.

Live checks covered2.85MB/262MB WebM playback, new-asset admission, minimize/restore, the redesigned panels and folder-picker cancellation. Two otherwise matching25-second60fps/30fps variants each played for30seconds with zero dropped frames. The30fps file was about31% smaller, and median GPU3D usage in this run fell from about3.4% to1.9%. This single comparison includes the running Codex session and is not a general hardware or workload guarantee. Original resolution, playback speed and frame rate are not automatically changed. The exception from the historical Codex exit remains unverified; a separate Node reproduction does not establish that historical cause.

Passed242Node,367host,80storage and25PNG-cache checks, ESLint, TypeScript and Windows x64 publishing. Hash verification during final installation preserved635revisions, library/preferences and1328original media assets.

## 日本語

通常のCodex接続を認証付き名前付きパイプに変更しました。Node inspector WebSocketを使用せず、未完了リクエストと一時メディアを所有セッションごとに解放します。トレイ登録の一時的な失敗は回数制限付きで再試行し、常駐アプリを終了させません。Codexを強制再起動しません。

一覧はフォルダーの移動・検索・必要時のフィルターを中心に整理しました。表示と並べ替えはオプション、フォルダー編集と一括移動は別ダイアログにまとめています。カード・画像なし一覧・ツリー・番号付きページ・ドラッグ移動を維持し、大きなツリーは表示範囲のみ描画します。作成・編集・設定画面の余白と操作部品も統一しました。

MP4/WebMは512MiB・10分まで実際のデコードを確認します。共通保存フォルダーの変更はコピーのハッシュ検証後に反映し、元ファイルを保持します。一覧用PNGは別の128MiBキャッシュに保存します。非表示時の再生停止、同時処理制限、不要なコピーと0px blurの削除を行い、登録検査もCodexのCSPを尊重します。実機で大容量WebM・新規登録・最小化/復元・管理画面・フォルダー選択のキャンセルを確認しました。60fps/30fpsの同一構図比較は両方フレーム落ち0でした。原本の速度・解像度・フレーム率は自動変更しません。過去のCodex終了原因は確定していません。

## 简体中文

普通Codex连接改用经过认证的命名管道，不再使用Node inspector WebSocket。待处理请求和临时媒体按CoSkin会话归属清理。托盘注册暂时失败时采用有限重试，常驻程序继续运行，不强制重启Codex。

主题库以文件夹路径、搜索及按需筛选为中心。显示和排序集中在选项菜单，文件夹编辑与批量移动使用独立对话框。保留卡片、无缩略图列表、文件夹/树视图、页码及拖动移动，大型目录树仅渲染可见行。创建、编辑与运行设置采用一致的间距和控件。

MP4/WebM支持512MiB及10分钟，并进行实际解码检查。可设置全局媒体保存目录；迁移先复制并核验哈希，再切换目录，保留原文件。列表派生PNG使用独立128MiB缓存。隐藏窗口暂停播放，限制并行处理，减少重复字节数组及无用的0px blur，导入验证和播放均遵守Codex CSP。已实际检查大型WebM、新文件注册、最小化/恢复、管理界面及取消目录选择。相同构图的60fps/30fps比较均无丢帧。不会自动改变原始速度、分辨率或帧率。历史Codex退出的准确原因尚未确认。
