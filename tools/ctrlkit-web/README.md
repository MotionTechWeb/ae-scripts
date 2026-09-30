# CtrlKit Web

[CtrlKit](../../packages/ctrlkit/README.md) と同じことをブラウザでできる版です。
After Effects を開かずに、疑似エフェクトの `.ffx` とスクリプト埋め込み用コードを作れます。

## 使い方

1. ブラウザで開く
   - 公開版：https://motiontechweb.github.io/ae-scripts/tools/ctrlkit-web/ctrlkit.html
   - 手元の `ctrlkit.html` をダブルクリックしても開けます（サーバーやインストールは不要）
2. エフェクト名を入れ、項目を追加して名前・範囲・初期値を設定する
3. 左のプレビューで並びや初期値を確認する（スライダー・チェックボックス・ドロップダウンはプレビュー上でも初期値を変えられます）
4. 「書き出し」から `.ffx`・埋め込みコード（`_ffx.jsx`）・設定ファイル（`.ck.json`）をダウンロードする

- 「設定を読み込み」で AE 版と同じ `.ck.json` を開けます（例：`packages/zabuton/zabuton.ck.json`）
- 「既存 .ffx を変換」で、手元の `.ffx` から埋め込みコードだけを作れます
- 「埋め込みコードをコピー」でクリップボードにコピーできます

AE 版と違い、レイヤーに実際に付けて確かめることはできません。書き出した `.ffx` は AE でレイヤーにドラッグすれば確認できます。

## 仕組み

`.ffx` を作る処理は AE 版と同じ `packages/ctrlkit/src/*.jsxinc` をそのまま使っているので、同じ設定からは同じ `.ffx` ができます。

- `template.html`：画面のソース
- `build.js`：`template.html` に `src/*.jsxinc` を埋め込んで `ctrlkit.html` を作る

`template.html` や `packages/ctrlkit/src/` を変えたら `node tools/ctrlkit-web/build.js` を実行してください。
`node packages/ctrlkit/test/run.js` で `ctrlkit.html` が最新かも確認します。
