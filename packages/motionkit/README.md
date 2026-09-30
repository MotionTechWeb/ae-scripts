# MotionKit

モーショングラフィックス用の ScriptUI パネルです。3つのタブで「シェイプを作る → 動きを付ける → 並べる」ができます。
どの機能も値をエフェクトコントロールの疑似エフェクトにまとめるので、あとから数値で調整できます。
疑似エフェクトはスクリプトに埋め込んであるため、配布するのは `motionkit.jsx` 1つだけです。

## 使い方

1. `motionkit.jsx` を AE の `ScriptUI Panels` フォルダへコピーし、「ウィンドウ」メニューから MotionKit を開く
   （「ファイル > スクリプト > スクリプトファイルを実行...」で直接開いても使えます）
2. コンポジションを開いて、各タブのボタンを押す

## シェイプ

サイズ・塗り・線を決めてから、形のボタンを押すとシェイプレイヤーを1つ作ります。

| 形 | 使うエフェクトの項目 |
| --- | --- |
| 長方形 | Width, Height, Roundness（角丸の半径 px） |
| 楕円 | Width, Height |
| 多角形 | Width（直径）, Points, Roundness（%） |
| 星 | Width（直径）, Points, Inner Radius, Roundness（%） |
| ライン | Width（長さ） |
| 矢印 | Width（長さ）, Head Size |
| リング | Width, Height（線だけの楕円） |

どの形にも共通で Fill / Fill Color、Stroke / Stroke Color / Stroke Width、Trim Start / Trim End / Trim Offset が付きます。
Trim End にキーフレームを打てば、線を描いていくアニメーションになります。

## アニメ

選んだレイヤーに登場の動きを付けます（キーフレームではなくエクスプレッションなので、あとから長さや種類を変えられます）。
エフェクト「MK_Anim」の項目:

| 項目 | 内容 |
| --- | --- |
| Type | Pop（拡大）/ Fade / Slide / Rotate / Wipe（シェイプの線を描く。シェイプレイヤーのみ） |
| Start | レイヤーの先頭から何秒後に始めるか（パネルの「今の時間から」で今の時間に合わせられる） |
| Delay | さらに遅らせる秒数。複数選んで適用すると、選んだ順に「ずらし」秒ずつ増える |
| Duration | 動きの長さ（秒） |
| Easing / Overshoot | Ease Out / Ease In-Out / Overshoot / Elastic / Bounce / Linear。Overshoot は行き過ぎの強さ |
| Direction / Distance | Slide の方向と距離（px） |
| Rotation | Rotate で最初に何度傾いているか |
| Fade | Fade 以外の動きにも、不透明度のフェードを重ねる |
| Out / Out Duration | レイヤーの終わりに、同じ動きを逆再生して退場する |

スケール・不透明度・位置・回転（シェイプレイヤーはトリムパス「MK_Wipe」も）にエクスプレッションを入れます。
すでに別のエクスプレッションが入っているときは、置き換えてよいか確認します。「外す」でエフェクトとエクスプレッションを取り除きます。

## 配置

選んだレイヤーを、選んだ順に並べます。ヌル「MK_Layout」を作って各レイヤーの親にするので、
ヌルを動かす・回す・拡大すると全体がついてきます。並べ方はヌルのエフェクト「MK_Layout」で後から変えられます。

| Mode | 使う項目 |
| --- | --- |
| Grid | Columns, Spacing X, Spacing Y |
| Circle | Radius, Start Angle, Arc（360 なら一周に等間隔、それ未満なら両端まで）, Align Rotation（外向きに回転） |
| Line | Spacing X, Spacing Y（1つごとのずれ） |
| Scatter | Scatter Width, Scatter Height, Random Rotation, Seed |

アニメと組み合わせられます（例: 並べてから、同じレイヤーを選んだまま「ずらし」付きでスライドを適用）。
「並びを解除」は今の位置・回転を値として残して、親を外します。
ヌルの名前を変えると並びが効かなくなるので、名前はそのままにしてください。

## 仕組みとテスト

| ファイル | 役割 |
| --- | --- |
| `motionkit.jsx` | パネル本体。`@MK_BUILD_START`〜`@MK_BUILD_END` の間は生成部分 |
| `effects/*.ck.json` | 疑似エフェクト（MK_Shape / MK_Anim / MK_Layout）の設定。CtrlKit で読み込んで編集できる |
| `src/expressions.jsxinc` | レイヤーに書き込むエクスプレッション |
| `tools/build.js` | 上の2つから `.ffx` を作り、`motionkit.jsx` に埋め込む |
| `test/run.js` | 埋め込みが最新か、エクスプレッションが期待どおり動くかを Node で確かめる |

`effects/` か `src/` を変えたら `node packages/motionkit/tools/build.js` を実行してください。
疑似エフェクトの項目を変えたときは、AE が古い定義を覚えているため名前（`name`）も変えてください。
`matchName` は必ず `Pseudo/` + `name` にしてください（例: `MK_Shape2` と `Pseudo/MK_Shape2`）。名前と内部名が食い違うと、AE があとからエフェクトを見つけられず「Actual missing plugin」で落ちることがあります。
