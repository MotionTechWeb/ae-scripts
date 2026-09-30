/*
MotionKit の動作確認用スクリプト（AE で「スクリプトファイルを実行...」から実行する）

シェイプ作成の処理を段階ごとに分けて実行し、終わった段階をデスクトップの
motionkit_diag.txt に1行ずつ書き出す。AE が固まったら、このファイルの最後の行で
どこまで進んだかが分かる。新しいコンポジション「MK Diag」の中だけで作業する。

  1: 疑似エフェクトを平面に付けるだけ（MK_Shape / MK_Anim / MK_Layout）
  2: シェイプを作るだけ（エフェクトもエクスプレッションも無し）
  3: MotionKit と同じ手順で長方形を作る（エフェクト＋エクスプレッション）
  4: 疑似エフェクトの「名前」と「内部名」の関係を調べる
     一致（A）→ 一致・空白入り（B）→ 食い違い（C）の順に試す。C で落ちれば、名前と内部名の食い違いが原因
*/
(function () {
  var log = new File(Folder.desktop.fsName + "/motionkit_diag.txt");

  function write(msg) {
    log.encoding = "UTF-8";
    log.open("a");
    log.writeln(new Date().toTimeString().substring(0, 8) + "  " + msg);
    log.close();
  }

  // motionkit.jsx の埋め込み部分（疑似エフェクトとエクスプレッション）を読み込む
  function loadEmbedded() {
    var f = new File(File($.fileName).parent.parent.fsName + "/motionkit.jsx");
    f.encoding = "UTF-8";
    if (!f.open("r")) throw new Error("motionkit.jsx が見つかりません: " + f.fsName);
    var src = f.read();
    f.close();
    var a = src.indexOf("// ---- @MK_BUILD_START ----");
    var b = src.indexOf("// ---- @MK_BUILD_END ----");
    if (a < 0 || b < a) throw new Error("motionkit.jsx の埋め込み部分が見つかりません");
    var code = src.substring(a, b) + "\n({ E: MK_Expr, FFX: MK_FFX, MATCH: MK_MATCHNAME });";
    return eval(code);
  }

  function applyFFX(layer, bytes, key) {
    // motionkit.jsx と同じく、.ffx は消さずに残す
    var dir = new Folder(Folder.userData.fsName + "/MotionKit");
    if (!dir.exists) dir.create();
    var f = new File(dir.fsName + "/diag_" + key + ".ffx");
    f.encoding = "BINARY";
    f.open("w");
    f.write(bytes);
    f.close();
    var sel = layer.containingComp.selectedLayers;
    for (var i = 0; i < sel.length; i++) sel[i].selected = false;
    layer.selected = true;
    layer.applyPreset(f);
  }

  var mode = prompt(
    "どの確認をしますか？\n1: 疑似エフェクトを平面に付けるだけ\n2: シェイプを作るだけ\n3: MotionKit と同じ手順で長方形を作る\n4: 名前と内部名の関係を調べる",
    "1",
    "MotionKit 確認"
  );
  if (!mode) return;

  write("---- 確認 " + mode + " 開始（AE " + app.version + "）");
  app.beginUndoGroup("MotionKit 確認");
  try {
    var M = loadEmbedded();
    write("埋め込み部分を読み込み");
    var comp = app.project.items.addComp("MK Diag", 1920, 1080, 1, 10, 30);
    comp.openInViewer();
    write("コンポジション作成");

    if (mode === "4") {
      // CtrlKit の書き出し処理で、その場で疑似エフェクトを作る（毎回別の名前）
      var ckDir = File($.fileName).parent.parent.parent.fsName + "/ctrlkit/src/";
      $.evalFile(new File(ckDir + "binary.jsxinc"));
      $.evalFile(new File(ckDir + "ffx-writer.jsxinc"));
      var id = new Date().getTime().toString(36);
      var variants = [
        { key: "A", name: "Diag_A_" + id, matchName: "Pseudo/Diag_A_" + id },
        { key: "B", name: "Diag B " + id, matchName: "Pseudo/Diag B " + id },
        { key: "C", name: "Diag_C_" + id, matchName: "Pseudo/Other_C_" + id }
      ];
      for (var v = 0; v < variants.length; v++) {
        var d = variants[v];
        write(d.key + ": 名前 " + d.name + " / 内部名 " + d.matchName);
        var bytes = CK_FFXWriter.build({
          name: d.name,
          matchName: d.matchName,
          params: [{ type: "slider", name: "Amount", value: 50, sliderMin: 0, sliderMax: 100, validMin: 0, validMax: 100, precision: 0 }]
        });
        var sl = comp.layers.addSolid([0.5, 0.5, 0.5], d.key, 1920, 1080, 1);
        applyFFX(sl, bytes, "name_" + d.key);
        var dfx = sl.property("ADBE Effect Parade").property(1);
        write(d.key + ": 適用 → " + (dfx ? dfx.matchName + " / " + dfx.name : "付いていない"));
        comp.layers.addNull();
        write(d.key + ": ヌルを追加");
        sl.property("ADBE Transform Group").property("ADBE Opacity").expression = "effect(\"" + dfx.name + "\")(1).value;";
        write(d.key + ": エクスプレッションで参照 → 値 " + dfx.property(1).value);
      }
    } else if (mode === "1") {
      var keys = ["shape", "anim", "layout"];
      for (var i = 0; i < keys.length; i++) {
        var solid = comp.layers.addSolid([0.5, 0.5, 0.5], keys[i], 1920, 1080, 1);
        write(keys[i] + ": 平面作成");
        applyFFX(solid, M.FFX[keys[i]], keys[i]);
        var fx = solid.property("ADBE Effect Parade").property(1);
        write(keys[i] + ": エフェクト適用 → " + (fx ? fx.matchName + "（項目 " + fx.numProperties + "）" : "付いていない"));
      }
    } else {
      var layer = comp.layers.addShape();
      write("シェイプレイヤー作成");
      if (mode === "3") {
        applyFFX(layer, M.FFX.shape, "shape");
        var eff = layer.property("ADBE Effect Parade").property(1);
        write("MK_Shape 適用 → " + (eff ? eff.matchName : "付いていない"));
        eff.property("Width").setValue(400);
        eff.property("Fill").setValue(1);
        eff.property("Fill Color").setValue([1, 0.5, 0, 1]);
        write("エフェクトの値を設定");
      }
      layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
      function contents() {
        return layer.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
      }
      var rect = contents().addProperty("ADBE Vector Shape - Rect");
      if (mode === "3") rect.property("ADBE Vector Rect Size").expression = M.E.shape.size;
      else rect.property("ADBE Vector Rect Size").setValue([400, 400]);
      write("長方形を追加");
      var fill = contents().addProperty("ADBE Vector Graphic - Fill");
      if (mode === "3") fill.property("ADBE Vector Fill Color").expression = M.E.shape.fillColor;
      write("塗りを追加");
    }
    write("スクリプト終了（このあと固まったら、画面の描き直しで止まっている）");
  } catch (e) {
    write("エラー: " + e.toString() + (e.line ? "（" + e.line + "行目）" : ""));
    alert("エラー: " + e.toString());
  } finally {
    app.endUndoGroup();
  }
})();
