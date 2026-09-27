<img src="assets/coskin.svg" alt="CoSkin" width="64">

# CoSkin

**Codexを、自分だけの空間に。**

画像・動く背景・エフェクトでCodexを彩りましょう。テーマを選び、実際の画面でプレビューして、ワンクリックで適用できます。

[한국어](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

[Windows版をダウンロード](https://github.com/GNh0/CoSkin/releases/latest) · [カスタムエフェクト](docs/custom-effects.md) · [対応環境](docs/support-matrix.md)

![CoSkinでカスタマイズしたCodex](docs/media/wuthering-waves/shorekeeper-live-applied.png)

## はじめる

1. [最新リリース](https://github.com/GNh0/CoSkin/releases/latest)からZIPをダウンロードして展開します。
2. **CoSkin.Loader.exe**を起動し、インストール設定を選びます。
3. CodexとCoSkinを起動します。**どちらを先に起動しても自動接続します。**

CoSkinを先に起動するとトレイでCodexを待ちます。デスクトップの **CoSkin** は単独起動、スタートメニューの **Codex + CoSkin** は同時起動です。開発ツールのインストールは不要です。

現在の対応環境は **Windows x64 · Codex 26.924.2738.0** です。両アプリのWindows権限レベルを揃えてください。

## カスタマイズできること

| 機能 | できること |
| --- | --- |
| テーマ一覧 | 作成・取り込み・削除、カードから直接プレビュー・適用 |
| 詳細・編集 | テーマ情報の変更、複製、実画面での編集、書き出し |
| 画像・GIF | 背景・装飾・アイコンの設定、文字と別に不透明度を調整 |
| アニメーション | ホバー・クリック・選択状態、開始・終了・繰り返しエフェクト |
| 適用範囲 | アプリ全体・プロジェクト・チャットへの適用、個別上書き |
| 言語 | Codexに合わせて韓国語・英語・日本語・簡体字中国語で表示 |

## テーマを選んで編集する

左のアイコンバーから **CoSkin** を開きます。カードの **プレビュー**で試し、**適用**で切り替えます。カードをクリックすると詳細画面で編集・複製・書き出しができます。

| テーマ一覧 | 詳細・プレビュー |
| :---: | :---: |
| ![テーマ一覧](docs/media/theme-library-0.1.0.png) | ![テーマ詳細](docs/media/wuthering-waves/shorekeeper-theme-detail.png) |

編集モードでは変更したい領域を **右クリック**して画像・エフェクト・スタイルを調整します。プロジェクト・チャット行は標準で同じ種類の全行に適用し、**個別指定**で選んだ項目だけを変更できます。

**保存**でテーマの変更を保管し、**適用**で選んだ範囲に反映します。プレビューをキャンセルすると前のテーマに戻ります。自作エフェクトの追加・共有は[カスタムエフェクトガイド](docs/custom-effects.md)をご覧ください。

## 動く背景とエフェクト

GIF背景と行のホバーエフェクトを組み合わせて、自分だけのテーマを作れます。

![動くGIF背景](docs/media/wuthering-waves/shorekeeper-live-gif.gif)

<details>
<summary>エフェクト編集とホバーの例を見る</summary>

**エフェクト編集**

![エフェクト編集](docs/media/wuthering-waves/shorekeeper-effect-editor.png)

**プロジェクト行のホバー**

![プロジェクト行のホバーエフェクト](docs/media/wuthering-waves/shorekeeper-hover.gif)

</details>

画面例は鳴潮のショアキーパーの非公式ファンアートテーマです。[画像・GIFの制作情報](docs/media/wuthering-waves/ASSET-NOTES.md)

## 起動と更新の設定

トレイからテーマを切り替えたり、**CoSkin設定**を開いたりできます。

- **Windowsサインイン時に起動**：CoSkinを待機させ、Codexの起動時に接続します。
- **Codexと同時に終了**：最後に接続したCodexが終了するとCoSkinも終了します。
- **自動更新**：GitHubの新しい安定版をダウンロードしてインストールします。設定から手動確認もできます。

GIFが動かない場合はエフェクトの動き設定とWindowsの **動きを減らす** 設定を確認してください。大きなGIFはスクロール性能に影響することがあります。

## 関連ドキュメント

[開発・ビルド](docs/development.md) · [カスタムエフェクト](docs/custom-effects.md) · [対応環境](docs/support-matrix.md) · [更新の公開方法](docs/updates.md)

CoSkinソースのライセンスは未指定です。依存要素のライセンスは[第三者通知](THIRD-PARTY-NOTICES.txt)を参照してください。
