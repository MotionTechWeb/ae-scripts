/*
Name:MotionKit
date:2026/09/30
モーショングラフィックス用のパネル。3つのタブでシェイプを作り、動きを付け、並べる。

- シェイプ: 長方形・楕円・多角形・星・ライン・矢印・リングをワンクリックで作る
- アニメ:   選んだレイヤーにポップ・フェード・スライド・回転・ワイプの登場（と退場）を付ける
- 配置:     選んだレイヤーをグリッド・円・直線・ランダムに並べる

調整項目は AE 標準のエクスプレッション制御（スライダー制御など）として「Shape Width」「Anim Type」
「Layout Mode」のような名前で付くので、あとからエフェクトコントロールで数値を変えられる。このファイル1つで動く。
ScriptUI Panels フォルダに置くとドッキングパネルとして使える。

埋め込み部分（@MK_BUILD_START〜@MK_BUILD_END）は tools/build.js が
effects/*.json と src/expressions.jsxinc から生成する。直接編集しないこと。
*/

// 「スクリプトファイルを実行」で開いた浮きウィンドウは、スクリプトが終わったあとにボタンが押される。
// 専用のエンジンを指定しないと、そのときには実行環境が片付けられていて AE が固まったり落ちたりするため指定する
#targetengine "MotionKit"

(function (thisObj) {
  var TITLE = "MotionKit";

  // ---- @MK_BUILD_START ----
  // 以下は tools/build.js が生成（直接編集しない）
  // 調整項目の一覧（effects/*.json）
  var MK_PARAMS = {
    shape: [
      {"type":"slider","name":"Width","value":400},
      {"type":"slider","name":"Height","value":400},
      {"type":"slider","name":"Roundness","value":0},
      {"type":"slider","name":"Points","value":5},
      {"type":"slider","name":"Inner Radius","value":50},
      {"type":"slider","name":"Head Size","value":40},
      {"type":"checkbox","name":"Fill","value":true},
      {"type":"color","name":"Fill Color","value":[255,255,255]},
      {"type":"checkbox","name":"Stroke","value":false},
      {"type":"color","name":"Stroke Color","value":[255,255,255]},
      {"type":"slider","name":"Stroke Width","value":8},
      {"type":"slider","name":"Trim Start","value":0},
      {"type":"slider","name":"Trim End","value":100},
      {"type":"angle","name":"Trim Offset","value":0}
    ],
    anim: [
      {"type":"popup","name":"Type","items":["Pop","Fade","Slide","Rotate","Wipe"],"value":1},
      {"type":"slider","name":"Start","value":0},
      {"type":"slider","name":"Delay","value":0},
      {"type":"slider","name":"Duration","value":0.5},
      {"type":"popup","name":"Easing","items":["Ease Out","Ease In-Out","Overshoot","Elastic","Bounce","Linear"],"value":3},
      {"type":"slider","name":"Overshoot","value":50},
      {"type":"popup","name":"Direction","items":["From Left","From Right","From Top","From Bottom"],"value":4},
      {"type":"slider","name":"Distance","value":200},
      {"type":"angle","name":"Rotation","value":-90},
      {"type":"checkbox","name":"Fade","value":true},
      {"type":"checkbox","name":"Out","value":false},
      {"type":"slider","name":"Out Duration","value":0.5}
    ],
    layout: [
      {"type":"popup","name":"Mode","items":["Grid","Circle","Line","Scatter"],"value":1},
      {"type":"slider","name":"Columns","value":3},
      {"type":"slider","name":"Spacing X","value":200},
      {"type":"slider","name":"Spacing Y","value":200},
      {"type":"slider","name":"Radius","value":300},
      {"type":"angle","name":"Start Angle","value":-90},
      {"type":"angle","name":"Arc","value":360},
      {"type":"checkbox","name":"Align Rotation","value":false},
      {"type":"slider","name":"Scatter Width","value":1200},
      {"type":"slider","name":"Scatter Height","value":600},
      {"type":"slider","name":"Random Rotation","value":0},
      {"type":"slider","name":"Seed","value":1}
    ]
  };
  // src/expressions.jsxinc
  /*
   * MotionKit がレイヤーに書き込むエクスプレッションを組み立てる。
   * エクスプレッションは AE の JavaScript エンジン向け（配列の足し算は add() を使う）。
   *
   * 位置と回転は「配置」と「アニメ」の両方が使うため、どちらのツールから書き込んでも
   * 同じ関数で両方の分を含んだエクスプレッションを作る。
   * 配置の情報は 1 行目の目印コメント（// @mk-layout ...）に残し、書き直すときに読み戻す。
   */
  var MK_Expr = (function () {
    // 調整項目は AE 標準のエクスプレッション制御（スライダー制御など）を1項目ずつ付け、
    // 「<頭の名前> <項目名>」という名前にする（例: Shape Width）。値はどれも 1 番目のプロパティ
    var SHAPE = "Shape";
    var ANIM = "Anim";
    var LAYOUT = "Layout";

    // 頭の名前と項目名から、エフェクトの名前を作る
    function controlName(prefix, name) {
      return prefix + " " + name;
    }

    function q(s) {
      return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    }

    function lines(a) {
      return a.join("\n");
    }

    // ---------------------------------------------------------------------
    // シェイプ（エフェクト「MK_Shape」の値を読むだけ）
    // ---------------------------------------------------------------------
    function fx(name) {
      return "effect(" + q(controlName(SHAPE, name)) + ")(1).value";
    }

    var shape = {
      size: "[" + fx("Width") + ", " + fx("Height") + "];",
      roundness: fx("Roundness") + ";",
      points: fx("Points") + ";",
      outerRadius: fx("Width") + " / 2;",
      innerRadius: fx("Width") + " / 2 * " + fx("Inner Radius") + " / 100;",
      fillColor: fx("Fill Color") + ";",
      fillOpacity: fx("Fill") + " >= 0.5 ? 100 : 0;",
      strokeColor: fx("Stroke Color") + ";",
      strokeOpacity: fx("Stroke") + " >= 0.5 ? 100 : 0;",
      strokeWidth: fx("Stroke Width") + ";",
      trimStart: fx("Trim Start") + ";",
      trimEnd: fx("Trim End") + ";",
      trimOffset: fx("Trim Offset") + ";",
      line: lines([
        "var w = " + fx("Width") + " / 2;",
        "createPath([[-w, 0], [w, 0]], [], [], false);"
      ]),
      arrowHead: lines([
        "var w = " + fx("Width") + " / 2;",
        "var h = " + fx("Head Size") + ";",
        "createPath([[w - h, -h * 0.8], [w, 0], [w - h, h * 0.8]], [], [], false);"
      ])
    };

    // ---------------------------------------------------------------------
    // アニメ（エフェクト「MK_Anim」）
    // mkAnim() は進み具合 p（イージング後。オーバーシュートで 1 を超える）と
    // lin（直線の 0〜1）を返す。エフェクトが無ければ null。
    // ---------------------------------------------------------------------
    var ANIM_FN = lines([
      "function mkAnim() {",
      "  var fx;",
      "  try { effect(" + q(controlName(ANIM, "Type")) + "); } catch (e) { return null; }",
      "  fx = function (n) { return effect(" + q(ANIM + " ") + " + n)(1); };",
      "  var k = fx(\"Overshoot\").value / 100 * 3;",
      "  var ez = fx(\"Easing\").value;",
      "  function f(t) {",
      "    if (t <= 0) return 0;",
      "    if (t >= 1) return 1;",
      "    if (ez == 1) return 1 - Math.pow(1 - t, 3);",
      "    if (ez == 2) return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;",
      "    if (ez == 3) return 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2);",
      "    if (ez == 4) return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;",
      "    if (ez == 5) {",
      "      var n = 7.5625, d = 2.75;",
      "      if (t < 1 / d) return n * t * t;",
      "      if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }",
      "      if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }",
      "      t -= 2.625 / d; return n * t * t + 0.984375;",
      "    }",
      "    return t;",
      "  }",
      "  var dur = Math.max(fx(\"Duration\").value, 0.001);",
      "  var t = (time - (inPoint + fx(\"Start\").value + fx(\"Delay\").value)) / dur;",
      "  t = Math.min(Math.max(t, 0), 1);",
      "  var p = f(t), lin = t;",
      "  if (fx(\"Out\").value >= 0.5) {",
      "    var u = (outPoint - time) / Math.max(fx(\"Out Duration\").value, 0.001);",
      "    u = Math.min(Math.max(u, 0), 1);",
      "    if (u < 1) { p = Math.min(p, f(u)); lin = Math.min(lin, u); }",
      "  }",
      "  return { fx: fx, type: fx(\"Type\").value, p: p, lin: lin };",
      "}"
    ]);

    var TYPE = { pop: 1, fade: 2, slide: 3, rotate: 4, wipe: 5 };

    function animScale() {
      return lines([
        "// MotionKit",
        ANIM_FN,
        "var a = mkAnim();",
        "var s = a && a.type == " + TYPE.pop + " ? a.p : 1;",
        "var out = [];",
        "for (var i = 0; i < value.length; i++) out.push(value[i] * s);",
        "out;"
      ]);
    }

    function animOpacity() {
      return lines([
        "// MotionKit",
        ANIM_FN,
        "var a = mkAnim();",
        "var o = 1;",
        "if (a) {",
        "  if (a.type == " + TYPE.fade + ") o = Math.min(Math.max(a.p, 0), 1);",
        "  else if (a.fx(\"Fade\").value >= 0.5) o = a.lin;",
        "}",
        "value * o;"
      ]);
    }

    function animTrimEnd() {
      return lines([
        "// MotionKit",
        ANIM_FN,
        "var a = mkAnim();",
        "a && a.type == " + TYPE.wipe + " ? Math.min(Math.max(a.p * 100, 0), 100) : 100;"
      ]);
    }

    // ---------------------------------------------------------------------
    // 配置（ヌル「MK_Layout」のエフェクト）
    // 子レイヤーは配置用ヌルを親にするので、位置はヌルのアンカーポイントからのずれで表す
    // ---------------------------------------------------------------------
    var LAYOUT_FN = lines([
      "function mkLayout(ctrl, i, n) {",
      "  var L = thisComp.layer(ctrl);",
      "  var fx = function (n) { return L.effect(" + q(LAYOUT + " ") + " + n)(1); };",
      "  var m = fx(\"Mode\").value;",
      "  var sx = fx(\"Spacing X\").value, sy = fx(\"Spacing Y\").value;",
      "  var x = 0, y = 0, r = 0;",
      "  if (m == 1) {",
      "    var c = Math.max(1, Math.round(fx(\"Columns\").value));",
      "    var rows = Math.ceil(n / c);",
      "    x = (i % c - (c - 1) / 2) * sx;",
      "    y = (Math.floor(i / c) - (rows - 1) / 2) * sy;",
      "  } else if (m == 2) {",
      "    var arc = fx(\"Arc\").value;",
      "    var step = Math.abs(arc) >= 360 ? arc / n : (n > 1 ? arc / (n - 1) : 0);",
      "    var deg = fx(\"Start Angle\").value + step * i;",
      "    var rad = deg * Math.PI / 180;",
      "    x = Math.cos(rad) * fx(\"Radius\").value;",
      "    y = Math.sin(rad) * fx(\"Radius\").value;",
      "    if (fx(\"Align Rotation\").value >= 0.5) r = deg + 90;",
      "  } else if (m == 3) {",
      "    x = (i - (n - 1) / 2) * sx;",
      "    y = (i - (n - 1) / 2) * sy;",
      "  } else {",
      "    seedRandom(fx(\"Seed\").value * 1000 + i, true);",
      "    x = random(-0.5, 0.5) * fx(\"Scatter Width\").value;",
      "    y = random(-0.5, 0.5) * fx(\"Scatter Height\").value;",
      "    r = random(-1, 1) * fx(\"Random Rotation\").value;",
      "  }",
      "  var ap = L.transform.anchorPoint.value;",
      "  return { x: ap[0] + x, y: ap[1] + y, r: r };",
      "}"
    ]);

    // info: { ctrl: 配置用ヌルの名前, i: 何番目か（0〜）, n: 全部で何個か } または null
    function marker(info) {
      return "// @mk-layout i=" + info.i + " n=" + info.n + " ctrl=" + info.ctrl;
    }

    function parseLayout(expr) {
      var m = /\/\/ @mk-layout i=(\d+) n=(\d+) ctrl=(.*)/.exec(expr || "");
      if (!m) return null;
      return { i: parseInt(m[1], 10), n: parseInt(m[2], 10), ctrl: m[3].replace(/\s+$/, "") };
    }

    function layoutCall(info) {
      return "var lo = mkLayout(" + q(info.ctrl) + ", " + info.i + ", " + info.n + ");";
    }

    function position(info) {
      var a = [info ? marker(info) : "// MotionKit"];
      if (info) a.push(LAYOUT_FN);
      a.push(ANIM_FN);
      a.push("var p = value.slice(0);");
      if (info) {
        a.push(layoutCall(info));
        a.push("p[0] = lo.x;");
        a.push("p[1] = lo.y;");
      }
      a.push(
        "var a = mkAnim();",
        "if (a && a.type == " + TYPE.slide + ") {",
        "  var d = a.fx(\"Distance\").value * (1 - a.p);",
        "  var dir = a.fx(\"Direction\").value;",
        "  if (dir == 1) p[0] -= d;",
        "  else if (dir == 2) p[0] += d;",
        "  else if (dir == 3) p[1] -= d;",
        "  else p[1] += d;",
        "}",
        "p;"
      );
      return lines(a);
    }

    function rotation(info) {
      var a = [info ? marker(info) : "// MotionKit"];
      if (info) a.push(LAYOUT_FN);
      a.push(ANIM_FN);
      a.push("var r = value;");
      if (info) {
        a.push(layoutCall(info));
        a.push("r += lo.r;");
      }
      a.push(
        "var a = mkAnim();",
        "if (a && a.type == " + TYPE.rotate + ") r += a.fx(\"Rotation\").value * (1 - a.p);",
        "r;"
      );
      return lines(a);
    }

    // MotionKit が書いたエクスプレッションかどうか
    function isOurs(expr) {
      return /^\/\/ (MotionKit|@mk-layout)/.test(expr || "");
    }

    return {
      controlName: controlName,
      SHAPE: SHAPE,
      ANIM: ANIM,
      LAYOUT: LAYOUT,
      shape: shape,
      animScale: animScale,
      animOpacity: animOpacity,
      animTrimEnd: animTrimEnd,
      position: position,
      rotation: rotation,
      parseLayout: parseLayout,
      isOurs: isOurs
    };
  })();
  // ---- @MK_BUILD_END ----

  var E = MK_Expr;

  // ---------------------------------------------------------------------
  // 共通
  // ---------------------------------------------------------------------
  function activeComp() {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
      alert("コンポジションを開いてアクティブにしてください。", TITLE);
      return null;
    }
    return comp;
  }

  function selectedLayers(comp) {
    var sel = comp.selectedLayers;
    var out = [];
    for (var i = 0; i < sel.length; i++) out.push(sel[i]);
    if (!out.length) alert("レイヤーを選択してください。", TITLE);
    return out;
  }

  // 調整項目は AE 標準のエクスプレッション制御を1項目ずつ付ける（名前は「Shape Width」など）。
  // 自作の疑似エフェクト（.ffx）は AE 2025 であとから見失われて落ちたため使わない
  var PREFIX = { shape: E.SHAPE, anim: E.ANIM, layout: E.LAYOUT };
  var CONTROL = {
    slider: "ADBE Slider Control",
    angle: "ADBE Angle Control",
    checkbox: "ADBE Checkbox Control",
    color: "ADBE Color Control",
    popup: "ADBE Dropdown Control"
  };

  function effects(layer) {
    return layer.property("ADBE Effect Parade");
  }

  function control(layer, key, name) {
    return effects(layer).property(E.controlName(PREFIX[key], name));
  }

  // その種類の調整項目が付いているか（1 番目の項目で見る）
  function findEffect(layer, key) {
    return control(layer, key, MK_PARAMS[key][0].name) !== null;
  }

  function initialValue(p) {
    if (p.type === "color") return [p.value[0] / 255, p.value[1] / 255, p.value[2] / 255, 1];
    if (p.type === "checkbox") return p.value ? 1 : 0;
    return p.value;
  }

  // 足りない調整項目を付けて、初期値を入れる。付いていたものはそのまま
  function ensureEffect(layer, key) {
    var params = MK_PARAMS[key];
    for (var i = 0; i < params.length; i++) {
      var p = params[i];
      var name = E.controlName(PREFIX[key], p.name);
      if (effects(layer).property(name)) continue;
      var fx = effects(layer).addProperty(CONTROL[p.type]);
      fx.name = name;
      if (p.type === "popup") {
        // 項目を入れ替えると参照が無効になるので、名前で取り直す
        effects(layer).property(name).property(1).setPropertyParameters(p.items);
      }
      effects(layer).property(name).property(1).setValue(initialValue(p));
    }
    return { layer: layer, key: key };
  }

  function removeEffect(layer, key) {
    var params = MK_PARAMS[key];
    for (var i = 0; i < params.length; i++) {
      var fx = control(layer, key, params[i].name);
      if (fx) fx.remove();
    }
  }

  function setParams(target, values) {
    for (var name in values) {
      if (!values.hasOwnProperty(name)) continue;
      var v = values[name];
      var fx = control(target.layer, target.key, name);
      if (!fx) throw new Error("調整項目がありません: " + name);
      // チェックボックスは 0 / 1 で入れる
      fx.property(1).setValue(typeof v === "boolean" ? (v ? 1 : 0) : v);
    }
  }

  function rgb01(c) {
    return [c[0] / 255, c[1] / 255, c[2] / 255];
  }

  // カラーの項目は [R, G, B, A]（0〜1）で入れる
  function rgba01(c) {
    return [c[0] / 255, c[1] / 255, c[2] / 255, 1];
  }

  function transform(layer) {
    return layer.property("ADBE Transform Group");
  }

  function positionProp(layer) {
    var pos = transform(layer).property("ADBE Position");
    if (pos.dimensionsSeparated) pos.dimensionsSeparated = false;
    return pos;
  }

  function rotationProp(layer) {
    return transform(layer).property("ADBE Rotate Z");
  }

  function num(edit, fallback) {
    var v = parseFloat(edit.text);
    return isNaN(v) ? fallback : v;
  }

  function run(undoName, fn) {
    app.beginUndoGroup(TITLE + ": " + undoName);
    try {
      fn();
    } catch (e) {
      alert("エラーが発生しました。\n" + e.toString() + (e.line ? "（" + e.line + "行目）" : ""), TITLE);
    } finally {
      app.endUndoGroup();
    }
  }

  // ---------------------------------------------------------------------
  // 1. シェイプ
  // ---------------------------------------------------------------------
  var SHAPES = [
    { key: "rect", label: "長方形" },
    { key: "ellipse", label: "楕円" },
    { key: "polygon", label: "多角形" },
    { key: "star", label: "星" },
    { key: "line", label: "ライン" },
    { key: "arrow", label: "矢印" },
    { key: "ring", label: "リング" }
  ];
  var STROKE_ONLY = { line: 1, arrow: 1, ring: 1 };

  // opts: { width, height, fill, fillColor, stroke, strokeColor, strokeWidth }
  function createShape(comp, shape, opts) {
    var layer = comp.layers.addShape();
    layer.name = shape.label;
    var fx = ensureEffect(layer, "shape");
    var strokeOnly = !!STROKE_ONLY[shape.key];
    var fill = strokeOnly ? false : opts.fill || !opts.stroke;
    setParams(fx, {
      Width: opts.width,
      Height: shape.key === "ring" || shape.key === "polygon" || shape.key === "star" ? opts.width : opts.height,
      Fill: fill,
      "Fill Color": rgba01(opts.fillColor),
      Stroke: strokeOnly || opts.stroke,
      "Stroke Color": rgba01(opts.strokeColor),
      "Stroke Width": opts.strokeWidth
    });

    var group = layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    group.name = shape.label;
    // プロパティを足すと、前に取ったグループの参照が無効になることがあるので毎回たどり直す
    function contents() {
      return layer.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
    }
    function add(matchName) {
      return contents().addProperty(matchName);
    }
    function expr(prop, name, e) {
      prop.property(name).expression = e;
    }

    var p;
    if (shape.key === "rect") {
      p = add("ADBE Vector Shape - Rect");
      expr(p, "ADBE Vector Rect Size", E.shape.size);
      expr(p, "ADBE Vector Rect Roundness", E.shape.roundness);
    } else if (shape.key === "ellipse" || shape.key === "ring") {
      p = add("ADBE Vector Shape - Ellipse");
      expr(p, "ADBE Vector Ellipse Size", E.shape.size);
    } else if (shape.key === "polygon" || shape.key === "star") {
      p = add("ADBE Vector Shape - Star");
      p.property("ADBE Vector Star Type").setValue(shape.key === "polygon" ? 2 : 1);
      expr(p, "ADBE Vector Star Points", E.shape.points);
      expr(p, "ADBE Vector Star Outer Radius", E.shape.outerRadius);
      expr(p, "ADBE Vector Star Outer Roundess", E.shape.roundness);
      if (shape.key === "star") expr(p, "ADBE Vector Star Inner Radius", E.shape.innerRadius);
    } else if (shape.key === "line" || shape.key === "arrow") {
      p = add("ADBE Vector Shape - Group");
      p.name = "Line";
      expr(p, "ADBE Vector Shape", E.shape.line);
      if (shape.key === "arrow") {
        p = add("ADBE Vector Shape - Group");
        p.name = "Head";
        expr(p, "ADBE Vector Shape", E.shape.arrowHead);
      }
    }

    p = add("ADBE Vector Filter - Trim");
    expr(p, "ADBE Vector Trim Start", E.shape.trimStart);
    expr(p, "ADBE Vector Trim End", E.shape.trimEnd);
    expr(p, "ADBE Vector Trim Offset", E.shape.trimOffset);

    // 線を上にして塗りの縁に乗せる
    p = add("ADBE Vector Graphic - Stroke");
    expr(p, "ADBE Vector Stroke Color", E.shape.strokeColor);
    expr(p, "ADBE Vector Stroke Opacity", E.shape.strokeOpacity);
    expr(p, "ADBE Vector Stroke Width", E.shape.strokeWidth);
    p.property("ADBE Vector Stroke Line Cap").setValue(2); // 丸
    p.property("ADBE Vector Stroke Line Join").setValue(2); // 丸

    p = add("ADBE Vector Graphic - Fill");
    expr(p, "ADBE Vector Fill Color", E.shape.fillColor);
    expr(p, "ADBE Vector Fill Opacity", E.shape.fillOpacity);

    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    layer.selected = true;
    return layer;
  }

  // ---------------------------------------------------------------------
  // 2. アニメ
  // ---------------------------------------------------------------------
  var ANIM_TYPES = ["ポップ（拡大）", "フェード", "スライド", "回転", "ワイプ（シェイプの線を描く）"];
  var EASINGS = ["イーズアウト", "イーズインアウト", "オーバーシュート", "弾む（エラスティック）", "バウンド", "リニア"];
  var DIRECTIONS = ["左から", "右から", "上から", "下から"];
  var WIPE_NAME = "MK_Wipe";

  // MotionKit 以外のエクスプレッションが入っているプロパティ名を集める
  function foreignExpressions(layer) {
    var t = transform(layer);
    var props = [t.property("ADBE Scale"), t.property("ADBE Opacity"), t.property("ADBE Position"), rotationProp(layer)];
    var out = [];
    for (var i = 0; i < props.length; i++) {
      if (props[i].expression && !E.isOurs(props[i].expression)) out.push(layer.name + " / " + props[i].name);
    }
    return out;
  }

  function wipeTrim(layer, create) {
    if (!(layer instanceof ShapeLayer)) return null;
    var root = layer.property("ADBE Root Vectors Group");
    var t = root.property(WIPE_NAME);
    if (!t && create) {
      t = root.addProperty("ADBE Vector Filter - Trim");
      t.name = WIPE_NAME;
    }
    return t;
  }

  function writeMotionExpressions(layer) {
    var t = transform(layer);
    t.property("ADBE Scale").expression = E.animScale();
    t.property("ADBE Opacity").expression = E.animOpacity();
    var pos = positionProp(layer);
    pos.expression = E.position(E.parseLayout(pos.expression));
    var rot = rotationProp(layer);
    rot.expression = E.rotation(E.parseLayout(rot.expression));
    var trim = wipeTrim(layer, true);
    if (trim) trim.property("ADBE Vector Trim End").expression = E.animTrimEnd();
  }

  // opts: { type, duration, easing, overshoot, direction, distance, rotation, fade, out, outDuration, stagger, fromNow }
  function applyAnim(comp, layers, opts) {
    var foreign = [];
    for (var i = 0; i < layers.length; i++) foreign = foreign.concat(foreignExpressions(layers[i]));
    if (foreign.length && !confirm("次のプロパティのエクスプレッションを置き換えます。よろしいですか？\n\n" + foreign.join("\n"), false, TITLE)) {
      return;
    }
    for (i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var fx = ensureEffect(layer, "anim");
      setParams(fx, {
        Type: opts.type,
        Start: opts.fromNow ? comp.time - layer.inPoint : 0,
        Delay: opts.stagger * i,
        Duration: opts.duration,
        Easing: opts.easing,
        Overshoot: opts.overshoot,
        Direction: opts.direction,
        Distance: opts.distance,
        Rotation: opts.rotation,
        Fade: opts.fade,
        Out: opts.out,
        "Out Duration": opts.outDuration
      });
      writeMotionExpressions(layer);
    }
    for (i = 0; i < layers.length; i++) layers[i].selected = true;
  }

  function clearOurs(prop) {
    if (E.isOurs(prop.expression)) prop.expression = "";
  }

  function removeAnim(layers) {
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      removeEffect(layer, "anim");
      var t = transform(layer);
      clearOurs(t.property("ADBE Scale"));
      clearOurs(t.property("ADBE Opacity"));
      // 並べてあるレイヤーは配置のエクスプレッションを残す
      var props = [positionProp(layer), rotationProp(layer)];
      for (var j = 0; j < props.length; j++) {
        if (!E.parseLayout(props[j].expression)) clearOurs(props[j]);
      }
      var trim = wipeTrim(layer, false);
      if (trim) trim.remove();
      layer.selected = true;
    }
  }

  // ---------------------------------------------------------------------
  // 3. 配置
  // ---------------------------------------------------------------------
  var LAYOUT_MODES = ["グリッド", "円", "直線", "ランダム"];

  function uniqueLayerName(comp, base) {
    var used = {};
    for (var i = 1; i <= comp.numLayers; i++) used[comp.layer(i).name] = true;
    var name = base;
    for (var n = 2; used[name]; n++) name = base + " " + n;
    return name;
  }

  // opts: { mode, columns, spacingX, spacingY, radius, arc, align, scatterWidth, scatterHeight }
  function applyLayout(comp, layers, opts) {
    // 配置用ヌル自身は並べる対象にしない
    var targets = [];
    for (var k = 0; k < layers.length; k++) if (!findEffect(layers[k], "layout")) targets.push(layers[k]);
    layers = targets;
    if (!layers.length) return;
    var foreign = [];
    for (var i = 0; i < layers.length; i++) {
      var ex = [transform(layers[i]).property("ADBE Position"), rotationProp(layers[i])];
      for (var j = 0; j < ex.length; j++) {
        if (ex[j].expression && !E.isOurs(ex[j].expression)) foreign.push(layers[i].name + " / " + ex[j].name);
      }
    }
    if (foreign.length && !confirm("次のプロパティのエクスプレッションを置き換えます。よろしいですか？\n\n" + foreign.join("\n"), false, TITLE)) {
      return;
    }

    var ctrl = comp.layers.addNull();
    ctrl.name = uniqueLayerName(comp, "MK Layout");
    ctrl.label = 9; // 緑
    transform(ctrl).property("ADBE Position").setValue([comp.width / 2, comp.height / 2]);
    var fx = ensureEffect(ctrl, "layout");
    setParams(fx, {
      Mode: opts.mode,
      Columns: opts.columns > 0 ? opts.columns : Math.ceil(Math.sqrt(layers.length)),
      "Spacing X": opts.spacingX,
      "Spacing Y": opts.spacingY,
      Radius: opts.radius,
      Arc: opts.arc,
      "Align Rotation": opts.align,
      "Scatter Width": opts.scatterWidth,
      "Scatter Height": opts.scatterHeight
    });

    for (i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var info = { ctrl: ctrl.name, i: i, n: layers.length };
      layer.parent = ctrl;
      positionProp(layer).expression = E.position(info);
      rotationProp(layer).expression = E.rotation(info);
    }
    for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    ctrl.selected = true;
  }

  // 並びを解除: 今の見た目の位置・回転を値に焼き付けて、親を外す
  function removeLayout(comp, layers) {
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var pos = positionProp(layer);
      var rot = rotationProp(layer);
      var info = E.parseLayout(pos.expression) || E.parseLayout(rot.expression);
      if (!info) continue;
      var hasAnim = !!findEffect(layer, "anim");
      var props = [
        { prop: pos, build: E.position },
        { prop: rot, build: E.rotation }
      ];
      for (var j = 0; j < props.length; j++) {
        var prop = props[j].prop;
        var v = prop.valueAtTime(comp.time, false);
        prop.expression = hasAnim ? props[j].build(null) : "";
        if (prop.numKeys === 0) prop.setValue(v);
      }
      layer.parent = null;
    }
  }

  // ---------------------------------------------------------------------
  // パネル
  // ---------------------------------------------------------------------
  function row(parent, label, width) {
    var g = parent.add("group");
    g.orientation = "row";
    g.alignChildren = ["left", "center"];
    if (label) {
      var st = g.add("statictext", undefined, label);
      st.preferredSize.width = width || 100;
    }
    return g;
  }

  function numField(parent, value, chars) {
    var e = parent.add("edittext", undefined, String(value));
    e.characters = chars || 5;
    return e;
  }

  function dropdown(parent, items, index) {
    var d = parent.add("dropdownlist", undefined, items);
    d.selection = index;
    return d;
  }

  // 色の指定: よく使う色のドロップダウンと16進数の入力欄、色見本。
  // $.colorPicker や、ScriptUI の graphics で色見本を塗る処理は、AE 2025（Windows）で
  // 固まったり落ちたりしたため使わない。色は名前と16進数の文字だけで表す
  var PALETTE = [
    { label: "白", hex: "FFFFFF" },
    { label: "黒", hex: "000000" },
    { label: "グレー", hex: "808080" },
    { label: "赤", hex: "E53935" },
    { label: "オレンジ", hex: "FB8C00" },
    { label: "黄", hex: "FDD835" },
    { label: "緑", hex: "43A047" },
    { label: "水色", hex: "29B6F6" },
    { label: "青", hex: "1E88E5" },
    { label: "紫", hex: "8E24AA" },
    { label: "ピンク", hex: "EC407A" }
  ];

  function hexToRgb(hex) {
    var m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex).replace(/\s/g, ""));
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(c) {
    var s = ((c[0] << 16) | (c[1] << 8) | c[2]).toString(16).toUpperCase();
    while (s.length < 6) s = "0" + s;
    return s;
  }

  function swatch(parent, color) {
    var g = parent.add("group");
    g.spacing = 4;
    var labels = [];
    for (var i = 0; i < PALETTE.length; i++) labels.push(PALETTE[i].label);
    var list = g.add("dropdownlist", undefined, labels);
    var hex = g.add("edittext", undefined, rgbToHex(color));
    hex.characters = 7;
    var sw = { color: color };
    function set(c) {
      sw.color = c;
      hex.text = rgbToHex(c);
    }
    list.onChange = function () {
      if (list.selection) set(hexToRgb(PALETTE[list.selection.index].hex));
    };
    hex.onChange = function () {
      var c = hexToRgb(hex.text);
      if (c) set(c);
      else hex.text = rgbToHex(sw.color);
    };
    return sw;
  }

  function buildShapeTab(tab) {
    var size = row(tab, "サイズ（幅×高さ）");
    var w = numField(size, 400);
    size.add("statictext", undefined, "×");
    var h = numField(size, 400);

    var fillRow = row(tab, "塗り");
    var fillOn = fillRow.add("checkbox", undefined, "");
    fillOn.value = true;
    var fillColor = swatch(fillRow, [255, 255, 255]);

    var strokeRow = row(tab, "線");
    var strokeOn = strokeRow.add("checkbox", undefined, "");
    strokeOn.value = false;
    var strokeColor = swatch(strokeRow, [255, 255, 255]);
    strokeRow.add("statictext", undefined, "太さ");
    var strokeWidth = numField(strokeRow, 8, 4);

    var buttons = tab.add("group");
    buttons.orientation = "column";
    buttons.alignChildren = ["fill", "top"];
    var line;
    for (var i = 0; i < SHAPES.length; i++) {
      if (i % 4 === 0) {
        line = buttons.add("group");
        line.orientation = "row";
        line.alignChildren = ["fill", "center"];
      }
      var b = line.add("button", undefined, SHAPES[i].label);
      b.preferredSize.width = 64;
      b.shape = SHAPES[i];
      b.onClick = function () {
        var shape = this.shape;
        var comp = activeComp();
        if (!comp) return;
        run("シェイプ作成", function () {
          createShape(comp, shape, {
            width: num(w, 400),
            height: num(h, 400),
            fill: fillOn.value,
            fillColor: fillColor.color,
            stroke: strokeOn.value,
            strokeColor: strokeColor.color,
            strokeWidth: num(strokeWidth, 8)
          });
        });
      };
    }
    tab.add("statictext", undefined, "作ったあとはエフェクトコントロール「MK_Shape」で調整できます。", { multiline: true });
  }

  function buildAnimTab(tab) {
    var type = dropdown(row(tab, "動き"), ANIM_TYPES, 0);

    var timing = row(tab, "長さ（秒）");
    var duration = numField(timing, 0.5);
    var fromNow = timing.add("checkbox", undefined, "今の時間から");

    var easeRow = row(tab, "イージング");
    var easing = dropdown(easeRow, EASINGS, 2);
    easeRow.add("statictext", undefined, "強さ");
    var overshoot = numField(easeRow, 50, 3);

    var slideRow = row(tab, "スライド");
    var direction = dropdown(slideRow, DIRECTIONS, 3);
    slideRow.add("statictext", undefined, "距離");
    var distance = numField(slideRow, 200);

    var rotation = numField(row(tab, "回転（度）"), -90);

    var opt = row(tab, "");
    var fade = opt.add("checkbox", undefined, "フェードも付ける");
    fade.value = true;
    var outRow = row(tab, "");
    var out = outRow.add("checkbox", undefined, "退場も付ける　長さ");
    var outDuration = numField(outRow, 0.5);

    var stagger = numField(row(tab, "ずらし（秒）"), 0.1);
    tab.add("statictext", undefined, "複数選ぶと、選んだ順に「ずらし」ずつ遅れて始まります。", { multiline: true });

    var buttons = row(tab, "");
    var apply = buttons.add("button", undefined, "選択レイヤーに適用");
    var remove = buttons.add("button", undefined, "外す");

    apply.onClick = function () {
      var comp = activeComp();
      if (!comp) return;
      var layers = selectedLayers(comp);
      if (!layers.length) return;
      run("アニメ", function () {
        applyAnim(comp, layers, {
          type: type.selection.index + 1,
          duration: num(duration, 0.5),
          easing: easing.selection.index + 1,
          overshoot: num(overshoot, 50),
          direction: direction.selection.index + 1,
          distance: num(distance, 200),
          rotation: num(rotation, -90),
          fade: fade.value,
          out: out.value,
          outDuration: num(outDuration, 0.5),
          stagger: num(stagger, 0),
          fromNow: fromNow.value
        });
      });
    };
    remove.onClick = function () {
      var comp = activeComp();
      if (!comp) return;
      var layers = selectedLayers(comp);
      if (!layers.length) return;
      run("アニメを外す", function () {
        removeAnim(layers);
      });
    };
  }

  function buildLayoutTab(tab) {
    var mode = dropdown(row(tab, "並べ方"), LAYOUT_MODES, 0);

    var grid = row(tab, "列数");
    var columns = numField(grid, "自動");
    var spacing = row(tab, "間隔（X / Y）");
    var sx = numField(spacing, 200);
    var sy = numField(spacing, 200);

    var circle = row(tab, "円の半径");
    var radius = numField(circle, 300);
    circle.add("statictext", undefined, "範囲（度）");
    var arc = numField(circle, 360);
    var align = row(tab, "").add("checkbox", undefined, "円の外向きに回転させる");

    var scatter = row(tab, "ランダム範囲");
    var scw = numField(scatter, 1200);
    scatter.add("statictext", undefined, "×");
    var sch = numField(scatter, 600);

    tab.add("statictext", undefined, "選んだ順に並べます。ヌル「MK_Layout」を動かすと全体が動き、エフェクトで並べ方を変えられます。", {
      multiline: true
    });

    var buttons = row(tab, "");
    var apply = buttons.add("button", undefined, "選択レイヤーを並べる");
    var remove = buttons.add("button", undefined, "並びを解除");

    apply.onClick = function () {
      var comp = activeComp();
      if (!comp) return;
      var layers = selectedLayers(comp);
      if (!layers.length) return;
      run("配置", function () {
        applyLayout(comp, layers, {
          mode: mode.selection.index + 1,
          columns: Math.round(num(columns, 0)),
          spacingX: num(sx, 200),
          spacingY: num(sy, 200),
          radius: num(radius, 300),
          arc: num(arc, 360),
          align: align.value,
          scatterWidth: num(scw, 1200),
          scatterHeight: num(sch, 600)
        });
      });
    };
    remove.onClick = function () {
      var comp = activeComp();
      if (!comp) return;
      var layers = selectedLayers(comp);
      if (!layers.length) return;
      run("配置を解除", function () {
        removeLayout(comp, layers);
      });
    };
  }

  function buildUI(thisObj) {
    var win = thisObj instanceof Panel ? thisObj : new Window("palette", TITLE, undefined, { resizeable: true });
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    var tabs = win.add("tabbedpanel");
    tabs.alignChildren = ["fill", "top"];
    var defs = [
      { label: "シェイプ", build: buildShapeTab },
      { label: "アニメ", build: buildAnimTab },
      { label: "配置", build: buildLayoutTab }
    ];
    for (var i = 0; i < defs.length; i++) {
      var tab = tabs.add("tab", undefined, defs[i].label);
      tab.orientation = "column";
      tab.alignChildren = ["fill", "top"];
      defs[i].build(tab);
    }
    tabs.selection = 0;
    win.onResizing = win.onResize = function () {
      this.layout.resize();
    };
    win.layout.layout(true);
    if (win instanceof Window) {
      win.center();
      win.show();
    }
    return win;
  }

  buildUI(thisObj);
})(this);
