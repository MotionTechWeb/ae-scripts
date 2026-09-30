/*
MotionKit の動作確認用スクリプト（AE で「スクリプトファイルを実行...」から実行する）

シェイプ作成の処理を段階ごとに分けて実行し、終わった段階をデスクトップの
motionkit_diag.txt に1行ずつ書き出す。AE が固まったら、このファイルの最後の行で
どこまで進んだかが分かる。新しいコンポジション「MK Diag」の中だけで作業する。

  1: 疑似エフェクトを平面に付けるだけ（MK Shape / MK Anim / MK Layout）
  2: シェイプを作るだけ（エフェクトもエクスプレッションも無し）
  3: MotionKit と同じ手順で長方形を作る（エフェクト＋エクスプレッション）
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
    var f = new File(Folder.temp.fsName + "/motionkit_diag_" + key + ".ffx");
    f.encoding = "BINARY";
    f.open("w");
    f.write(bytes);
    f.close();
    var sel = layer.containingComp.selectedLayers;
    for (var i = 0; i < sel.length; i++) sel[i].selected = false;
    layer.selected = true;
    layer.applyPreset(f);
    f.remove();
  }

  var mode = prompt(
    "どの確認をしますか？\n1: 疑似エフェクトを平面に付けるだけ\n2: シェイプを作るだけ\n3: MotionKit と同じ手順で長方形を作る",
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

    if (mode === "1") {
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
        write("MK Shape 適用 → " + (eff ? eff.matchName : "付いていない"));
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
