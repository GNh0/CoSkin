# CoSkin 0.1.1

## 한국어

Codex와 CoSkin의 자동 연결 속도와 재시도를 개선했습니다. 숨겨진 렌더러 하위 프로세스를 Codex 주 프로세스로 잘못 선택해 12초를 기다리던 문제를 수정하고, 중복 검사를 줄였습니다. 일시적인 연결 실패가 누적되어도 자동 재연결을 계속합니다.

현재 PC에서 Codex가 켜진 상태의 연결은 약 3.1~3.8초, CoSkin을 먼저 켠 뒤 테스트 Codex를 시작한 연결은 약 3.8~4.0초였습니다. 시작 시간은 PC와 Codex의 준비 상태에 따라 달라집니다. 기존 Codex를 재시작하지 않고 두 창의 연결을 확인했습니다.

0.1.0 사용자는 자동 업데이트를 켜거나 CoSkin 설정에서 업데이트를 확인하세요. 직접 설치하려면 ZIP을 풀고 `CoSkin.Loader.exe`를 실행하세요.

[한국어 안내](../README.md)

## English

Improved automatic attachment speed and recovery in both launch orders. Fixed a 12-second delay caused by selecting a hidden renderer child instead of the main Codex process. Duplicate verification is reduced, and transient failures no longer permanently exhaust automatic retries.

On the tested PC, attaching to running Codex took about 3.1–3.8 seconds. Starting test Codex after CoSkin took about 3.8–4.0 seconds. Timing depends on the PC and Codex readiness. Two existing Codex windows reconnected without restarting Codex.

From 0.1.0, enable automatic updates or check for updates in CoSkin settings. For manual installation, extract the ZIP and run `CoSkin.Loader.exe`.

[English guide](../README.en.md)

## 日本語

どちらの起動順でも自動接続の速度と復旧を改善しました。非表示のレンダラー子プロセスをCodexのメインプロセスとして選択し、12秒待機する問題を修正しました。重複した検証を減らし、一時的な失敗が続いても自動再接続を継続します。

検証したPCでは、起動済みCodexへの接続は約3.1〜3.8秒、CoSkinを先に起動してからテスト用Codexを起動した場合は約3.8〜4.0秒でした。所要時間はPCやCodexの準備状況によって変わります。Codexを再起動せずに既存の2つのウィンドウへ再接続できました。

0.1.0からは自動更新を有効にするか、CoSkin設定で更新を確認してください。手動インストールはZIPを展開して `CoSkin.Loader.exe` を実行します。

[日本語ガイド](../README.ja.md)

## 简体中文

改善了两种启动顺序下的自动连接速度和恢复。修复了将隐藏的渲染器子进程误认为Codex主进程而等待12秒的问题。减少重复验证；临时连接失败不会耗尽自动重试机会。

在测试电脑上，连接已运行的Codex约需3.1～3.8秒；先启动CoSkin再启动测试Codex约需3.8〜4.0秒。实际时间取决于电脑和Codex的准备状态。现有两个Codex窗口已完成重新连接，无需重启Codex。

0.1.0用户可开启自动更新，或在CoSkin设置中检查更新。手动安装请解压ZIP后运行 `CoSkin.Loader.exe`。

[简体中文指南](../README.zh-CN.md)
