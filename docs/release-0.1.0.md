# CoSkin 0.1.0

## 한국어

일반 실행한 Codex에 CoSkin을 독립 연결하는 Windows x64 릴리스입니다. **CoSkin → Codex, Codex → CoSkin 모두 지원**하며 기존 Codex를 재시작하지 않습니다.

- 카드 목록·상세·미리보기·편집·적용·가져오기/내보내기, 전체 행 기본 설정과 개별 덮어쓰기.
- 공통 앱 배경·입력창/목표 표시줄·결과물 표면, GIF·상태 효과·선언형 사용자 JSON 효과.
- 브랜드 아이콘, 바탕화면 바로가기, 로그인 시작, 함께 종료, 한국어 트레이와 테마 하위 메뉴.
- 선택형 GitHub 안정 버전 자동 업데이트: 게시자 서명·SHA-256·파일 경계 확인, 편집 중 연기, 준비 실패 복구.
- 호버/휠 처리 비용을 줄이고 움직이는 왼쪽 행만 스크롤 중 잠시 중지. 고정 GIF 배경은 재생 유지.
- 한국어·영어·일본어·중국어 간체 README와 이미지/GIF 예제.

현재 독립 연결 검증 대상은 **Windows 패키지 26.924.2738.0 / 내부 앱 26.924.22138**입니다. 두 앱의 Windows 권한 수준이 같아야 합니다. 다른 Codex 버전은 검증 전 연결하지 않습니다. 큰 GIF와 여러 고해상도 배경의 성능 비용은 남아 있습니다.

ZIP을 풀어 CoSkin.Loader.exe를 실행하세요. 세 파일을 함께 유지하세요. Node/.NET 별도 설치는 필요 없습니다. beta.1 사용자는 이 ZIP으로 설치를 갱신하세요. beta.1에는 자동 교체가 포함되지 않습니다.

검사: Node 47개, .NET 호스트 171개, ESLint·TypeScript·네이티브/Windows 빌드 통과. 실제 설치본 교체·두 창 자동 연결·Codex 프로세스 유지·테마/설정 59개 파일 해시 보존을 확인했습니다. 모든 Windows 실패 조건과 실제 휠 전체 프레임률을 보증하는 결과는 아닙니다.

[한국어 README](../README.md) · [지원·검증 범위](support-matrix.md) · [업데이트 배포](updates.md)

## English

Windows x64 release with independent attachment to ordinarily launched Codex. **Both launch orders work**: CoSkin → Codex and Codex → CoSkin, without restarting existing Codex.

- Card library, detail, preview, edit, apply and import/export; shared row defaults and individual overrides.
- Common app backgrounds, composer/goal rail and result surfaces; GIFs, state effects and declarative custom JSON effects.
- Branded icon, desktop shortcut, sign-in startup, coupled exit, localized tray and theme submenu.
- Optional GitHub stable-release updates with publisher signatures, SHA-256, bounded files, editing deferral and readiness failure recovery.
- Reduced hover/wheel work; moving sidebar rows pause briefly during scrolling while fixed GIF backgrounds keep playing.
- Korean, English, Japanese and Simplified Chinese READMEs with image/GIF examples.

Independent attachment is verified for **Windows package 26.924.2738.0 / internal app 26.924.22138**, with both apps at the same Windows privilege level. Other Codex builds require verification. Large GIFs and multiple high-resolution backgrounds still carry performance costs.

Extract the ZIP and run CoSkin.Loader.exe, keeping all three files together. No separate Node/.NET installation is required. beta.1 users should install this ZIP; beta.1 has no automatic replacement.

Validation: 47 Node and 171 host tests, lint, type checking and native/Windows builds passed. Actual installed-host replacement, two-window attachment, unchanged Codex process and preservation of 59 theme/settings file hashes were verified. This does not establish every Windows failure condition or real-wheel frame rates.

[English README](../README.en.md) · [Support and validation](support-matrix.md) · [Update publishing](updates.md)

## 日本語

通常起動したCodexに独立接続できるWindows x64版です。**CoSkin → Codex、Codex → CoSkinの両順序に対応**し、既存Codexを再起動しません。

- カード一覧・詳細・プレビュー・編集・適用・インポート/エクスポート、共通行設定と個別上書き。
- アプリ共通背景、入力欄/目標バー、成果物の表面、GIF・状態エフェクト・宣言型JSONエフェクト。
- ブランドアイコン、デスクトップショートカット、サインイン起動、連動終了、翻訳済みトレイとテーマサブメニュー。
- 選択式GitHub安定版更新。発行者署名・SHA-256・ファイル境界を検証し、編集中は延期。準備失敗時に復元。
- ホバー/ホイールの処理を削減。動く左側の行のみスクロール中に一時停止し、固定GIF背景は再生を維持。
- 韓国語・英語・日本語・簡体字中国語READMEと画像/GIF例。

独立接続の検証対象は **Windowsパッケージ26.924.2738.0 / 内部アプリ26.924.22138**です。両アプリのWindows権限レベルが同じである必要があります。他のCodex版は検証が必要です。大きなGIF・複数の高解像度背景には性能負荷が残ります。

ZIPを展開し、3ファイルをまとめてCoSkin.Loader.exeを起動してください。Node/.NETの別途導入は不要です。beta.1利用者はこのZIPで更新してください。beta.1には自動置換がありません。

Node 47件、ホスト171件、lint・型検査・ネイティブ/Windowsビルドが通過しました。実際のインストール更新、2ウィンドウ接続、Codexプロセス維持、テーマ/設定59ファイルのハッシュ保持を確認しました。すべてのWindows障害条件や実際のホイールのフレームレート保証ではありません。

[日本語README](../README.ja.md) · [対応・検証範囲](support-matrix.md) · [更新の公開方法](updates.md)

## 简体中文

可独立连接普通方式启动的Codex的Windows x64版本。**支持CoSkin → Codex和Codex → CoSkin两种启动顺序**，无需重启已有Codex。

- 卡片列表、详情、预览、编辑、应用及导入/导出，统一行设置及个别覆盖。
- 应用公共背景、输入框/目标栏、结果区域、GIF、状态效果及声明式JSON自定义效果。
- 品牌图标、桌面快捷方式、登录启动、联动退出、本地化托盘及主题子菜单。
- 可选GitHub稳定版更新。验证发布者签名、SHA-256及文件边界，编辑时延后，准备失败时恢复。
- 减少悬停/滚轮处理。滚动时暂时停止移动的左侧行效果，固定GIF背景继续播放。
- 韩语、英语、日语、简体中文README及图片/GIF示例。

独立连接已验证的目标为 **Windows软件包26.924.2738.0 / 内部应用26.924.22138**。两应用的Windows权限级别须相同。其他Codex版本须另行验证。大GIF和多个高分辨率背景仍有性能开销。

解压ZIP后运行CoSkin.Loader.exe，保持三个文件放在一起。不需另装Node/.NET。beta.1用户请用此ZIP更新；beta.1不提供自动替换。

通过47项Node测试、171项主机测试、lint、类型检查及原生/Windows构建。验证了实际安装更新、双窗口连接、Codex进程保持及59个主题/设置文件的哈希保留。这并非所有Windows失败条件或实际滚轮帧率的保证。

[简体中文README](../README.zh-CN.md) · [支持与验证范围](support-matrix.md) · [更新发布方法](updates.md)