# カスタム効果

CoSkinの実装はTypeScriptの契約とWeb Animations APIを使用します。開発者はJavaScriptではなく `*.coskin-effect.json` の宣言JSONを作成します。CSS文字列、セレクター、URL、ネットワーク操作、コード実行は許可されません。

[例](examples/soft-rise.coskin-effect.json)を「効果 → マイ効果 → 効果を読み込む」から登録します。名前・IDの競合は別名で保存するか明示的に置換します。選択時に定義をテーマへコピーするため、マイ効果から削除・置換しても既存テーマのコピーは保持されます。`.coskin` の `theme.json.customEffects` に定義を含めます。

バージョン1の数値: opacity=0～1（静的不透明度に乗算）、translateXPx/YPx=−1000～1000、scale=0.1～3、rotateDeg=−360～360、blurPx=0～20（静的フィルターに追加）、insetTop/Right/Bottom/Left=0～100%。2～16フレーム、offsetは0から1への厳密な昇順、全フレームで同じ属性集合を使用します。反転時は順序と `1-offset` を変換します。

上限: 定義ごと8KiB、テーマ・一覧ごと32定義/64KiB、読み込みファイル64KiB、1回5秒・有限反復1～3回。IDは `custom.` で始まり、小文字・数字・点・ハイフンを使用します。名前80文字、説明512文字。未知の属性、非有限値、未対応バージョンは拒否します。JSONエラーでは行とUTF-8バイト位置を示します。

検証とコンパイルの単一根拠は `src/core/custom-effects.ts` です。ホストはサイズ・重複キーを確認して同じレンダラー契約を呼び出します。型検査、lint、Nodeテスト、ホスト保存テストと実際の画面検査を分けて実施します。
