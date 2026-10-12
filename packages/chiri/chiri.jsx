#targetengine "Chiri"
/*
Name:Chiri
date:2026/10/12
フラクタルノイズ＋しきい値で、チリ・ホコリのような粒が明滅する素材をワンボタンで作るスクリプト

手作業の手順
  1. 平面レイヤーにフラクタルノイズとしきい値を適用
  2. コントラスト・明るさで暗くし、複雑度を最大に、しきい値のレベルで粒の量を調整
  3. ランダムシードにキーフレームを打って粒を明滅させる
  4. 平面を複製し、黒を抜いて（Unmult）ノイズの値を変え、まとめてプリコンポーズ
をまとめて行います。

- 黒抜きは標準エフェクト「チャンネルシフト」でアルファを赤チャンネルから取って行います（白黒なので Unmult と同じ結果）
- ランダムシードはキーフレームではなくエクスプレッションで、指定したコマ数ごとに切り替えます
- 作成後は、プリコンポーズしたレイヤー（オフのときは「Chiri コントロール」ヌル）のエフェクトコントロールで
  しきい値・大きさ・コントラスト・明るさ・複雑度・明滅・色をまとめて調整できます
- ScriptUI Panels フォルダに置くとドッキングパネルとして使えます
*/

(function main(thisObj) {
  var TITLE = "Chiri";

  var DEFAULTS = {
    layers: 2,      // 重ねる層の数
    contrast: 400,  // フラクタルノイズのコントラスト
    brightness: -110, // フラクタルノイズの明るさ
    complexity: 20, // 複雑度（最大 20）
    scale: 100,     // ノイズのスケール（粒の大きさ）
    level: 100,     // しきい値のレベル（上げるほど粒が減る）
    rate: 12,       // ランダムシードを 1 秒に何回切り替えるか
    color: [1, 1, 1],
    precompose: true
  };

  // ---- エフェクト・プロパティの取得 ----

  // 表示名（英語・日本語）で探し、見つからなければ matchName で探す（言語版や AE のバージョン差を吸収する）
  function findProp(effect, matchName, names) {
    for (var i = 1; i <= effect.numProperties; i++) {
      var q = effect.property(i);
      for (var n = 0; n < names.length; n++) {
        if (q.name === names[n]) return q;
      }
    }
    try { return effect.property(matchName); } catch (e) { return null; }
  }

  function setProp(effect, matchName, names, value) {
    var p = findOrThrow(effect, matchName, names);
    p.setValue(value);
    return p;
  }

  function addEffect(layer, matchName) {
    var fx = layer.property("ADBE Effect Parade").addProperty(matchName);
    if (!fx) throw new Error("エフェクト " + matchName + " を追加できません");
    return fx;
  }

  // ---- 本体 ----

  // まとめて操作するためのコントロール（エフェクト名 → スライダーの値の元になる設定キー）
  var CONTROLS = [
    { name: "しきい値", key: "level" },
    { name: "大きさ", key: "scale" },
    { name: "コントラスト", key: "contrast" },
    { name: "明るさ", key: "brightness" },
    { name: "複雑度", key: "complexity" },
    { name: "明滅（回/秒）", key: "rate" }
  ];
  var COLOR_CONTROL = "色";
  var NULL_NAME = TITLE + " コントロール";
  var DEPTH_SCALE = 0.6; // 2 層目以降は粒を 0.6 倍ずつ小さくする
  var DEPTH_LEVEL = 10;  // 2 層目以降はしきい値を 10 ずつ上げて粒を少なめにする

  function quote(str) {
    return '"' + String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  function uniqueCompName(base) {
    var used = {};
    for (var i = 1; i <= app.project.numItems; i++) used[app.project.item(i).name] = true;
    if (!used[base]) return base;
    for (var n = 2; ; n++) if (!used[base + " " + n]) return base + " " + n;
  }

  function addControls(layer, s) {
    var parade = layer.property("ADBE Effect Parade");
    for (var i = 0; i < CONTROLS.length; i++) {
      var fx = parade.addProperty("ADBE Slider Control");
      fx.name = CONTROLS[i].name;
      fx.property(1).setValue(s[CONTROLS[i].key]);
    }
    var col = parade.addProperty("ADBE Color Control");
    col.name = COLOR_CONTROL;
    col.property(1).setValue(s.color);
  }

  function buildLayer(comp, s, index) {
    var name = TITLE + " " + (index + 1);
    var solid = comp.layers.addSolid([0, 0, 0], name, comp.width, comp.height, comp.pixelAspect, comp.duration);
    addEffect(solid, "ADBE Fractal Noise");
    addEffect(solid, "ADBE Threshold2");
    // 白黒なので赤チャンネルをそのままアルファにすれば黒が抜ける（Unmult と同じ結果）
    var shift = addEffect(solid, "ADBE Shift Channels");
    setProp(shift, "ADBE Shift Channels-0001", ["Take Alpha From", "アルファを取り込むチャンネル"], 2);
    addEffect(solid, "ADBE Fill");
    return solid;
  }

  // 各層のエフェクトを、コントロールを持つレイヤー（ref はそのレイヤーを指す式）にリンクする
  function linkLayer(solid, index, ref) {
    var fx = solid.property("ADBE Effect Parade");
    var noise = fx.property("ADBE Fractal Noise");
    var th = fx.property("ADBE Threshold2");
    var fill = fx.property("ADBE Fill");
    function c(name) { return ref + ".effect(" + quote(name) + ")(1)"; }

    findOrThrow(noise, "ADBE Fractal Noise-0004", ["Contrast", "コントラスト"]).expression = c("コントラスト");
    findOrThrow(noise, "ADBE Fractal Noise-0005", ["Brightness", "明るさ"]).expression = c("明るさ");
    findOrThrow(noise, "ADBE Fractal Noise-0015", ["Complexity", "複雑度"]).expression = c("複雑度");
    findOrThrow(noise, "ADBE Fractal Noise-0010", ["Scale", "スケール"]).expression =
      c("大きさ") + " * " + Math.pow(DEPTH_SCALE, index) + ";";
    findOrThrow(noise, "ADBE Fractal Noise-0026", ["Random Seed", "ランダムシード"]).expression =
      "// 1 秒に rate 回シードを切り替えて粒を明滅させる\n" +
      "var rate = Math.max(1, " + c("明滅（回/秒）") + ");\n" +
      "posterizeTime(rate);\n" +
      "Math.floor(time * rate) + " + (index * 1000) + ";";
    findOrThrow(th, "ADBE Threshold2-0001", ["Level", "レベル"]).expression =
      "Math.min(255, " + c("しきい値") + " + " + (index * DEPTH_LEVEL) + ");";
    findOrThrow(fill, "ADBE Fill-0002", ["Color", "カラー"]).expression = c(COLOR_CONTROL);
  }

  function findOrThrow(effect, matchName, names) {
    var p = findProp(effect, matchName, names);
    if (!p) throw new Error("「" + effect.name + "」の「" + names[names.length - 1] + "」が見つかりません");
    return p;
  }

  function run(s) {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
      alert("コンポジションを開いてから実行してください。", TITLE);
      return;
    }
    app.beginUndoGroup(TITLE + " 作成");
    try {
      var layers = [];
      for (var i = 0; i < s.layers; i++) layers.push(buildLayer(comp, s, i));

      var host, ref, inner;
      if (s.precompose) {
        var indices = [];
        for (var j = 0; j < layers.length; j++) indices.push(layers[j].index);
        indices.sort(function (a, b) { return a - b; });
        var preName = uniqueCompName(TITLE);
        var pre = comp.layers.precompose(indices, preName, true);
        pre.comment = TITLE + " で作成";
        host = comp.layer(indices[0]);
        host.name = preName;
        // プリコンポーズの中から、外側のコンポにあるこのレイヤーのコントロールを読む
        ref = "comp(" + quote(comp.name) + ").layer(" + quote(preName) + ")";
        inner = [];
        for (var k = 1; k <= pre.numLayers; k++) inner.push(pre.layer(k));
      } else {
        host = comp.layers.addNull(comp.duration);
        host.name = NULL_NAME;
        ref = "thisComp.layer(" + quote(NULL_NAME) + ")";
        inner = layers;
      }
      addControls(host, s);

      // 層の番号は名前（Chiri 1, Chiri 2, ...）から取る
      for (var m = 0; m < inner.length; m++) {
        var idx = parseInt(inner[m].name.replace(/^.*\s/, ""), 10) - 1;
        linkLayer(inner[m], isNaN(idx) ? m : idx, ref);
      }
      for (var q = 1; q <= comp.numLayers; q++) comp.layer(q).selected = false;
      host.selected = true;
    } catch (e) {
      alert("作成に失敗しました。\n" + e.message, TITLE);
    } finally {
      app.endUndoGroup();
    }
  }

  // ---- UI ----

  function buildUI(thisObj) {
    var win = thisObj instanceof Panel ? thisObj : new Window("palette", TITLE, undefined, { resizeable: true });
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 6;
    win.margins = 10;

    var fields = {};

    function numRow(parent, key, label, min, max) {
      var g = parent.add("group");
      g.orientation = "row";
      g.alignChildren = ["left", "center"];
      var st = g.add("statictext", undefined, label);
      st.preferredSize.width = 110;
      var sl = g.add("slider", undefined, DEFAULTS[key], min, max);
      sl.preferredSize.width = 120;
      var et = g.add("edittext", undefined, String(DEFAULTS[key]));
      et.characters = 5;
      sl.onChanging = function () { et.text = String(Math.round(sl.value)); };
      et.onChange = function () {
        var v = parseFloat(et.text);
        if (isNaN(v)) v = DEFAULTS[key];
        v = Math.max(min, Math.min(max, v));
        et.text = String(v);
        sl.value = v;
      };
      fields[key] = et;
    }

    var p1 = win.add("panel", undefined, "粒");
    p1.alignChildren = ["fill", "top"];
    numRow(p1, "level", "量（しきい値）", 0, 255);
    numRow(p1, "scale", "大きさ（スケール）", 10, 600);
    numRow(p1, "contrast", "コントラスト", 100, 800);
    numRow(p1, "brightness", "明るさ", -200, 0);
    numRow(p1, "complexity", "複雑度", 1, 20);

    var p2 = win.add("panel", undefined, "動きと重ね");
    p2.alignChildren = ["fill", "top"];
    numRow(p2, "rate", "明滅（回/秒）", 1, 60);
    numRow(p2, "layers", "重ねる層の数", 1, 5);

    var gColor = win.add("group");
    gColor.add("statictext", undefined, "色");
    var swatch = gColor.add("button", undefined, "白");
    swatch.preferredSize.width = 120;
    var color = DEFAULTS.color.slice(0);
    swatch.onClick = function () {
      var hex = Math.round(color[0] * 255) << 16 | Math.round(color[1] * 255) << 8 | Math.round(color[2] * 255);
      var picked = $.colorPicker(hex);
      if (picked < 0) return;
      color = [((picked >> 16) & 255) / 255, ((picked >> 8) & 255) / 255, (picked & 255) / 255];
      swatch.text = (color[0] === 1 && color[1] === 1 && color[2] === 1) ? "白" :
        "#" + ("000000" + picked.toString(16).toUpperCase()).slice(-6);
    };

    var cbPre = win.add("checkbox", undefined, "プリコンポーズする");
    cbPre.value = DEFAULTS.precompose;

    var btn = win.add("button", undefined, "作成");
    btn.onClick = function () {
      var s = {};
      for (var key in fields) s[key] = parseFloat(fields[key].text);
      s.layers = Math.round(s.layers);
      s.complexity = Math.round(s.complexity);
      s.color = color;
      s.precompose = cbPre.value;
      run(s);
    };

    win.onResizing = win.onResize = function () { this.layout.resize(); };
    if (win instanceof Window) {
      win.center();
      win.show();
    } else {
      win.layout.layout(true);
    }
  }

  buildUI(thisObj);
})(this);
