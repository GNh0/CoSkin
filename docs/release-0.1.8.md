# CoSkin 0.1.8

## 한국어

입력창 바깥에 검은 사각형이 남던 문제를 수정했습니다. Codex의 기본 푸터가 단색 가림막과 포커스 모드 배경을 추가하는 경우, 앱 배경 테마가 활성화되어 있으면 해당 가림막만 투명하게 처리합니다. 입력창·버튼·Goal 진행 표시·팝오버의 내용과 상단 컨트롤 보호는 유지합니다.

Goal 표시의 등장·종료와 입력창 높이 변화, 푸터 노드 교체를 검사했습니다. 실제 설치본에서 검증용 Goal을 켜고 테마 끄기·켜기, 테마 복구, 입력창 포커스를 확인한 뒤 Goal을 종료했습니다. 종료 후에도 검은 가림막이 생기지 않았고 기존 테마 연결·입력 내용·설정이 보존됐습니다. 테마를 끄면 Codex의 원래 가림막을 복원합니다.

Node 검사 128개, .NET 호스트 검사 220개, ESLint·TypeScript·Windows x64 빌드를 통과했습니다. 기존 테마·미디어·리비전은 변경하지 않습니다.

## English

Fixed the black rectangle outside the composer. When an app background theme is active, CoSkin clears the native footer's empty solid backdrop and focus-mode wrapper paint. Composer controls, Goal progress content, popovers and protected top controls retain their own appearance.

Regression checks cover Goal appearance/removal, composer height changes, footer replacement and paint restoration. The installed build was checked with a real temporary Goal, disable/re-enable, theme repair and input focus, then checked again after the Goal completed. Existing binding, input text and preferences were preserved. Disabling themes restores native footer paint.

Passed 128 Node tests, 220 host tests, ESLint, TypeScript and Windows x64 publishing. Existing themes, media and revisions are preserved.

## 日本語

入力欄の外側に黒い四角が残る問題を修正しました。アプリ背景テーマが有効な場合、空の単色フッターとフォーカスモードの背景だけを透明にします。入力欄・ボタン・Goal表示・ポップオーバーと上部コントロールを保護します。

Goalの開始・終了、入力欄の高さ変化、ノードの置換、無効化時の復元を検査しました。実際のインストール版でGoal実行中の再有効化・修復・フォーカスと終了後を確認し、元のテーマ・入力内容・設定を保持しました。Node128件、ホスト220件、静的検査とWindows x64ビルドを通過しました。

## 简体中文

修复输入框外侧残留黑色矩形的问题。启用应用背景主题时，仅清除空白单色页脚遮罩与焦点模式背景，保留输入控件、Goal进度内容、弹出层及顶部控件保护。

检查覆盖Goal出现与结束、输入框高度变化、节点替换和原始样式恢复。实际安装版已验证Goal运行期间的停用/启用、修复、输入焦点及结束后的显示，并保留原主题、输入内容及设置。通过128个Node测试、220个主机测试、静态检查与Windows x64构建。
