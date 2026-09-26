# CoSkin

[한국어](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

Codexを自分だけの空間にするWindows用テーマライブラリです。画像・GIF・エフェクトを選び、実際の画面でプレビュー・編集・適用できます。

[Windows x64をダウンロード](https://github.com/GNh0/CoSkin/releases/tag/v0.1.0) · [対応・検証範囲](docs/support-matrix.md)

## インストールと起動

ZIPを展開して **CoSkin.Loader.exe** を起動してください。実行ファイル・renderer.js・THIRD-PARTY-NOTICES.txtの3ファイルを同じフォルダーに置きます。利用者はNodeや.NETを別途インストールする必要はありません。

Windowsサインイン時の起動、Codexと同時に終了、デスクトップショートカット、.coskinの関連付け、自動更新を選択できます。既存のテーマとCodexデータを保持します。

**CoSkin → Codex、Codex → CoSkinのどちらの順序でも接続できます。** CoSkinを先に起動するとトレイで待機し、起動中の対応Codexには再起動せずに接続します。デスクトップの **CoSkin** は単独起動、スタートメニューの **Codex + CoSkin** は同時起動です。Codexを強制終了しません。

通常起動への接続を検証したバージョンはWindowsパッケージ **26.924.2738.0**、内部アプリ **26.924.22138** です。実行ファイル・OpenAI署名・ASAR・chrome.dllを確認します。他のバージョンは互換性の検証が必要です。両アプリのWindows権限レベルを揃えてください。[常駐構造](docs/resident-architecture.md)

## テーマとエフェクト

- 左のアイコンバーから **CoSkin** を開きます。カード一覧で作成・取り込み・削除・プレビュー・即時適用できます。
- カードを開くと詳細ページでプレビュー・編集・複製・書き出し・テーマ情報の編集ができます。
- 実画面の編集モードで対象を右クリックします。プロジェクト・チャット行は標準で **同じ種類の全行** を編集し、個別指定で1行だけを上書きできます。
- アプリ全体・プロジェクト・チャットの適用範囲を選択します。保存と適用は別操作です。プレビューのキャンセルは元の適用状態を保持します。
- PNG・JPEG・GIFに対応します。画像の不透明度を文字と別に調整できます。通常・ホバー・選択状態と、開始・終了・クリック・繰り返しエフェクトを編集できます。
- [カスタムエフェクト](docs/custom-effects.md)は宣言型JSONキーフレームを登録・共有します。レンダラーはJavaScript/TypeScript・CSS・Web Animations APIを使用し、任意のJavaScriptを実行するパッケージではありません。

一覧はチャットから分離した専用ページです。共通背景はCodexのアプリ表面、タブ、ファイル・ブラウザーツールのアプリ領域に適用されます。外部サイトの内容とWindowsダイアログは別の表面です。

## トレイと更新

トレイから一覧・設定・テーマ選択・装飾の切り替え・再接続・終了を操作できます。テーマはサブメニューにまとめ、メニューはCodexの言語に従います。サインイン起動と同時終了は独立した設定です。

自動更新は **GitHub Releasesの新しい安定版** を確認します。発行者署名・SHA-256・パッケージ構成を検証し、編集・プレビュー中は置き換えを延期します。新しいCoSkinが準備できなければ前のインストールを復元します。Codexとテーマデータは更新対象ではありません。無効化するとバックグラウンド確認を止めます。設定から手動確認もできます。[更新の公開方法](docs/updates.md)

## 実際の画面

![0.1.0 テーマ一覧](docs/media/theme-library-0.1.0.png)

別途生成した鳴潮のショアキーパーの非公式ファンアート例です。実行ZIPには同梱していません。[メディア出典](docs/media/wuthering-waves/ASSET-NOTES.md)

![テーマ一覧](docs/media/wuthering-waves/shorekeeper-theme-library.png)
![テーマ詳細](docs/media/wuthering-waves/shorekeeper-theme-detail.png)
![エフェクト編集](docs/media/wuthering-waves/shorekeeper-effect-editor.png)
![背景の適用](docs/media/wuthering-waves/shorekeeper-live-applied.png)
![行のホバー](docs/media/wuthering-waves/shorekeeper-hover.gif)
![実際のGIF背景](docs/media/wuthering-waves/shorekeeper-live-gif.gif)

一部の例は最初のベータ版で撮影しました。フレームレートの保証や性能ベンチマークではありません。

## 性能と言語

UIはCodexの言語に従い、**韓国語・英語・日本語・簡体字中国語**を提供します。他の言語は英語に置き換えます。

固定GIF背景はホイールスクロール中も再生します。移動するサイドバー行のエフェクトとGIFは短く停止して一覧の応答を優先します。非表示・最小化・画面外では動きを停止します。Windowsの動きを減らす設定に従うか、許可・停止を選べます。大きいGIFや複数の高解像度背景には負荷が残ります。

**Node 47テスト、ホスト171検査**とESLint・TypeScript検査が通過しました。実際のインストール更新、起動中Codexへの接続、データ保持を確認しました。[検証範囲](docs/support-matrix.md)に条件と未検証環境を記載しています。

## 開発

Node 24、.NET 10、ネイティブモジュール用のVisual Studio 2022 C++ x64ツールが必要です。

```powershell
npm ci --ignore-scripts
npm test
npm run lint
npm run typecheck
./scripts/build.ps1 -Portable
dotnet run --project tests/CoSkin.HostTests
```

元のCodexファイル・ASAR・ショートカットは変更しません。個人ログ・利用者画面・保存先・発行者の秘密鍵は公開しません。

[設計](docs/CoSkin-설계서.md) · [構造](docs/architecture.md) · [.coskin仕様](docs/coskin-package-v1.md)

## ライセンス

CoSkinソースのライセンスは未指定です。依存要素には個別のライセンスが適用されます。[第三者通知](THIRD-PARTY-NOTICES.txt)を参照してください。キャラクターに関する権利は各権利者に帰属します。
