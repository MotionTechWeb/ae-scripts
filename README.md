# ae-scripts

Adobe After Effects 用の自作スクリプト（ExtendScript / `.jsx`）をまとめるリポジトリです。
スクリプトごとに `packages/` 以下へディレクトリを分けて管理します。

## 収録スクリプト

| スクリプト | 場所 | 概要 |
| --- | --- | --- |
| Zabuton | `packages/zabuton/` | テキストの背景に、文字サイズにぴったり合う「座布団」（角丸の長方形シェイプ）を自動で敷く |
| MotionKit | `packages/motionkit/` | シェイプ作成・登場アニメ・整列をまとめたパネル。値はエフェクトコントロールで後から調整できる（[詳細](packages/motionkit/README.md)） |
| CtrlKit | `packages/ctrlkit/` | AE上で疑似エフェクトを組み立て、`.ffx` とスクリプト埋め込み用コードを書き出すパネル（[詳細](packages/ctrlkit/README.md)） |
| CtrlKit Web | `tools/ctrlkit-web/` | CtrlKit と同じことをブラウザでできる版。[ブラウザで開く](https://motiontechweb.github.io/ae-scripts/tools/ctrlkit-web/ctrlkit.html)だけで使える（[詳細](tools/ctrlkit-web/README.md)） |

### Zabuton（座布団スクリプト）

テキストレイヤーと、その背景になるシェイプレイヤーをセットで作成します。
座布団のサイズはエクスプレッションでテキストの大きさ（`sourceRectAtTime()`）に追従するため、文字を打ち替えても自動で伸び縮みします。
座布団はテキストレイヤーを親にしているので、テキストを移動・拡大・回転すると一緒についてきます。

#### ファイル構成

| ファイル | 役割 |
| --- | --- |
| `zabuton.jsx` | スクリプト本体（ソース） |
| `effectControl_zabuton.ffx` | 調整用エフェクト（疑似エフェクト「Zabuton」）の元データ。中身は `zabuton.jsx` に埋め込み済みなので、実行時には不要 |
| `zabuton.ck.json` | 疑似エフェクトの設定。CtrlKit で読み込むと項目を編集して `.ffx` を作り直せる |

#### 実行すると起きること

1. アクティブなコンポジションにシェイプレイヤー「Zabuton」を追加し、埋め込んだ疑似エフェクト「Zabuton」を適用する
2. テキストレイヤー（中身は `sourceText`）を追加し、アンカーポイントを文字の中心に合わせるエクスプレッションを設定する
3. シェイプの親をテキストレイヤーにし、長方形と塗りを追加して、位置・サイズ・角丸・色をテキストとエフェクトの値にリンクする

#### エフェクトコントロール「Zabuton」の項目

| 項目 | 内容 |
| --- | --- |
| `X_position_Padding` | 座布団の横方向の余白（テキスト幅に加算） |
| `Y_position_Padding` | 座布団の縦方向の余白（テキスト高さに加算。スクリプト実行時に 0 に設定） |
| `zabuton_radius` | 角丸の半径 |
| `BG_Color` | 座布団の色 |

#### 使い方

1. `zabuton.jsx` を任意のフォルダに置く（`.ffx` は不要です）
2. After Effects でコンポジションを開いてアクティブにする
3. 「ファイル > スクリプト > スクリプトファイルを実行...」から `zabuton.jsx` を実行する
   （After Effects の `Scripts` フォルダに置けば「ファイル > スクリプト」メニューから直接実行できます）
4. 追加されたテキストレイヤーの文字を書き換え、シェイプレイヤーのエフェクトコントロールで余白・角丸・色を調整する

## ディレクトリ構成

### 現在

```
ae-scripts/
├─ README.md
├─ .gitignore
└─ packages/
   ├─ zabuton/
   │  ├─ zabuton.jsx
   │  ├─ zabuton.ck.json
   │  └─ effectControl_zabuton.ffx
   ├─ ctrlkit/
   │  ├─ ctrlkit.jsx
   │  ├─ src/
   │  └─ test/
   └─ motionkit/
      ├─ motionkit.jsx   # パネル本体（配布はこれ1つ）
      ├─ effects/        # 疑似エフェクトの設定（.ck.json）
      ├─ src/            # エクスプレッション
      ├─ tools/build.js  # 疑似エフェクトとエクスプレッションを motionkit.jsx に埋め込む
      └─ test/
tools/
└─ ctrlkit-web/
   ├─ ctrlkit.html     # ブラウザで開く完成品（build.js が生成）
   ├─ template.html    # 画面のソース
   └─ build.js
```

### 今後の構成（予定）

共通ライブラリやビルドの仕組みを入れた、以下の構成を目指しています。
`package.json` やビルドスクリプトはまだ無いため、下記の `npm` コマンドは現時点では動きません。

```
ae-scripts/
├─ packages/
│  ├─ lib/               # 共通ライブラリ（logger, fs など）
│  ├─ script-◯◯◯◯/       # スクリプトごとのディレクトリ
│  │  ├─ src/            # スクリプトソース
│  │  └─ dist/           # 完成スクリプト（.gitignore で除外）
│  └─ script-template/   # テンプレ生成ツール
├─ tools/                # ビルドや自動化スクリプト
└─ tests/                # 共通テスト
```

想定しているビルド手順：

1. ルートで依存解決：`npm i`
2. サンプルをビルド：`npm run build`
3. `dist/*.jsx` が生成される（例：`packages/script-hello/dist/hello.jsx`）
4. After Effects の `Scripts` / `ScriptUI Panels` フォルダへ配置して動作確認
