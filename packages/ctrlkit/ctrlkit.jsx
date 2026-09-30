/*
Name:CtrlKit
date:2026/09/30
AE上で疑似エフェクトを組み立て、.ffx と「スクリプト埋め込み用のコード」を書き出すパネル。

- ScriptUI Panels フォルダに src フォルダごと置くとドッキングパネルとして使える
- 対応している種類: スライダー、角度、チェックボックス、カラー、ポイント、3Dポイント、
  ドロップダウン、レイヤー、ラベル、グループ
*/

//@include "src/binary.jsxinc"
//@include "src/ffx-writer.jsxinc"
//@include "src/embed.jsxinc"

(function (thisObj) {
  var TITLE = "CtrlKit";
  var MATCHNAME_PREFIX = "Pseudo/CK ";
  // tdmn は40バイト。末尾に "-0000" が付くので本体は34文字まで
  var MATCHNAME_MAX = 34;
  var NAME_MAX = 31;

  // パネル内では項目を平らな並びで持つ。グループは「group」と「groupEnd」で囲む
  var TYPES = [
    { type: "slider", label: "スライダー" },
    { type: "angle", label: "角度" },
    { type: "checkbox", label: "チェックボックス" },
    { type: "color", label: "カラー" },
    { type: "point", label: "ポイント" },
    { type: "point3d", label: "3Dポイント" },
    { type: "popup", label: "ドロップダウン" },
    { type: "layer", label: "レイヤー" },
    { type: "label", label: "ラベル" },
    { type: "group", label: "グループ" }
  ];
  var HOLDABLE = { slider: 1, angle: 1, checkbox: 1, color: 1, popup: 1 };
  var HIDEABLE = { slider: 1, checkbox: 1, color: 1, point: 1, point3d: 1, popup: 1, layer: 1, group: 1 };

  var state = {
    name: "MyEffect",
    matchName: "",
    items: []
  };

  // ---------------------------------------------------------------------
  // 定義まわり
  // ---------------------------------------------------------------------
  function typeLabel(type) {
    if (type === "groupEnd") return "グループ終了";
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].type === type) return TYPES[i].label;
    return type;
  }

  function newItem(type) {
    var n = { type: type, name: type.charAt(0).toUpperCase() + type.substring(1) };
    switch (type) {
      case "slider":
        n.value = 0;
        n.sliderMin = 0;
        n.sliderMax = 100;
        n.validMin = 0;
        n.validMax = 100;
        n.precision = 0;
        break;
      case "angle":
        n.value = 0;
        break;
      case "checkbox":
        n.value = false;
        n.label = "";
        break;
      case "color":
        n.value = [255, 255, 255];
        break;
      case "point":
        n.value = [50, 50];
        break;
      case "point3d":
        n.value = [50, 50, 0];
        break;
      case "popup":
        n.items = ["Item 1", "Item 2", "Item 3"];
        n.value = 1;
        break;
    }
    return n;
  }

  function defaultMatchName(name) {
    var m = MATCHNAME_PREFIX + name.replace(/[^A-Za-z0-9_ ]/g, "_");
    return m.substring(0, MATCHNAME_MAX);
  }

  // 疑似エフェクトの内部名は「Pseudo/」で始まらないと、AE が本物のエフェクトを探しに行ってしまう。
  // 画面では「Pseudo/」を見せず、書き出すときにだけ付ける
  function normalizeMatchName(m) {
    if (!m) return "";
    return /^Pseudo\//.test(m) ? m : "Pseudo/" + m;
  }

  function isAscii(s) {
    return /^[\x20-\x7e]*$/.test(s);
  }

  // 平らな並び → 入れ子（ffx-writer の形式）
  function nest(items) {
    var root = [];
    var stack = [root];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.type === "groupEnd") {
        if (stack.length > 1) stack.pop();
        continue;
      }
      var copy = {};
      for (var k in it) if (it.hasOwnProperty(k)) copy[k] = it[k];
      stack[stack.length - 1].push(copy);
      if (it.type === "group") {
        copy.params = [];
        stack.push(copy.params);
      }
    }
    return root;
  }

  // 入れ子 → 平らな並び（設定ファイルの読み込み用）
  function unnest(params, out) {
    for (var i = 0; i < params.length; i++) {
      var p = params[i];
      var copy = {};
      for (var k in p) if (p.hasOwnProperty(k) && k !== "params") copy[k] = p[k];
      out.push(copy);
      if (p.type === "group") {
        unnest(p.params || [], out);
        out.push({ type: "groupEnd", name: "" });
      }
    }
    return out;
  }

  function currentDefinition() {
    return {
      name: state.name,
      matchName: normalizeMatchName(state.matchName) || defaultMatchName(state.name),
      params: nest(state.items)
    };
  }

  // 問題があればメッセージの配列を返す
  function validate() {
    var errors = [];
    var def = currentDefinition();
    if (!def.name) errors.push("エフェクト名が空です。");
    if (!isAscii(def.name) || def.name.length > NAME_MAX) errors.push("エフェクト名は半角英数字で" + NAME_MAX + "文字までにしてください。");
    if (!isAscii(def.matchName) || def.matchName.length > MATCHNAME_MAX) errors.push("内部名は半角英数字で" + (MATCHNAME_MAX - "Pseudo/".length) + "文字までにしてください。");
    if (state.items.length === 0) errors.push("項目が1つもありません。");

    var depth = 0;
    var seen = {};
    for (var i = 0; i < state.items.length; i++) {
      var p = state.items[i];
      var label = i + 1 + "番目（" + (p.name || typeLabel(p.type)) + "）: ";
      if (p.type === "groupEnd") {
        if (--depth < 0) errors.push(label + "対応するグループがありません。");
        continue;
      }
      if (p.type === "group") depth++;
      if (!p.name || !isAscii(p.name) || p.name.length > NAME_MAX) errors.push(label + "名前は半角英数字で" + NAME_MAX + "文字までにしてください。");
      if (seen[p.name]) errors.push(label + "名前が重複しています。");
      seen[p.name] = true;
      if (p.type === "slider") {
        if (!(p.validMin <= p.sliderMin && p.sliderMin < p.sliderMax && p.sliderMax <= p.validMax)) {
          errors.push(label + "範囲は 有効最小 ≦ スライダー最小 < スライダー最大 ≦ 有効最大 にしてください。");
        }
        if (p.value < p.validMin || p.value > p.validMax) errors.push(label + "初期値が有効範囲の外です。");
      }
      if (p.type === "checkbox" && !isAscii(p.label || "")) errors.push(label + "チェックボックスの文字は半角英数字にしてください。");
      if (p.type === "popup") {
        if (p.items.length < 1) errors.push(label + "ドロップダウンの項目がありません。");
        for (var j = 0; j < p.items.length; j++) {
          if (!isAscii(p.items[j]) || /\|/.test(p.items[j])) errors.push(label + "ドロップダウンの項目は半角英数字で、「|」は使えません。");
        }
        if (p.value < 1 || p.value > p.items.length) errors.push(label + "初期値の番号が項目の数を超えています。");
      }
    }
    if (depth > 0) errors.push("閉じられていないグループがあります（「グループ終了」を追加してください）。");
    return errors;
  }

  // ---------------------------------------------------------------------
  // ファイル入出力
  // ---------------------------------------------------------------------
  function writeBinary(file, bytes) {
    file.encoding = "BINARY";
    if (!file.open("w")) throw new Error("書き込めません: " + file.fsName);
    file.write(bytes);
    file.close();
  }

  function readBinary(file) {
    file.encoding = "BINARY";
    if (!file.open("r")) throw new Error("読み込めません: " + file.fsName);
    var s = file.read();
    file.close();
    return s;
  }

  function writeText(file, text) {
    file.encoding = "UTF-8";
    file.lineFeed = "Unix";
    if (!file.open("w")) throw new Error("書き込めません: " + file.fsName);
    file.write(text);
    file.close();
  }

  function readText(file) {
    file.encoding = "UTF-8";
    if (!file.open("r")) throw new Error("読み込めません: " + file.fsName);
    var s = file.read();
    file.close();
    return s;
  }

  function identifierFrom(name) {
    var id = name.replace(/[^A-Za-z0-9_]/g, "_");
    if (/^[0-9]/.test(id)) id = "_" + id;
    return id;
  }

  function snippetFor(bytes, effectName) {
    var id = identifierFrom(effectName);
    return CK_Embed.snippet(bytes, {
      varName: id.toUpperCase() + "_FFX",
      functionName: "apply" + id.charAt(0).toUpperCase() + id.substring(1),
      effectName: effectName
    });
  }

  function checkOrAlert() {
    var errors = validate();
    if (errors.length) {
      alert(errors.join("\n"), TITLE);
      return false;
    }
    return true;
  }

  // 書き出し: 選んだフォルダに <名前>.ffx と <名前>_ffx.jsx を作る
  function exportFiles() {
    if (!checkOrAlert()) return;
    var def = currentDefinition();
    var folder = Folder.selectDialog("書き出し先のフォルダを選んでください");
    if (!folder) return;
    var bytes = CK_FFXWriter.build(def);
    var base = identifierFrom(def.name);
    writeBinary(new File(folder.fsName + "/" + base + ".ffx"), bytes);
    writeText(new File(folder.fsName + "/" + base + "_ffx.jsx"), snippetFor(bytes, def.name));
    writeText(new File(folder.fsName + "/" + base + ".ck.json"), def.toSource());
    alert("書き出しました:\n" + base + ".ffx\n" + base + "_ffx.jsx\n" + base + ".ck.json（設定。読み込みで再編集できます）", TITLE);
  }

  // 既存の .ffx から埋め込み用コードだけ作る
  function convertExisting() {
    var src = File.openDialog("変換する .ffx を選んでください", "*.ffx");
    if (!src) return;
    var bytes = readBinary(src);
    if (bytes.substring(0, 4) !== "RIFX") return alert(".ffx ファイルではないようです。", TITLE);
    var name = decodeURI(src.name).replace(/\.ffx$/i, "");
    var out = new File(src.path + "/" + identifierFrom(name) + "_ffx.jsx");
    writeText(out, snippetFor(bytes, name));
    alert("書き出しました:\n" + out.fsName, TITLE);
  }

  // パネルから前回適用したときの内部名（付け直すときに古い方を消すため）
  var lastAppliedMatchName = null;

  function removePreviouslyApplied(layers) {
    if (!lastAppliedMatchName) return;
    for (var i = 0; i < layers.length; i++) {
      var effects = layers[i].property("ADBE Effect Parade");
      for (var j = effects.numProperties; j >= 1; j--) {
        if (effects.property(j).matchName === lastAppliedMatchName) effects.property(j).remove();
      }
    }
  }

  // 選択中のレイヤーすべてにまとめて適用する（前回パネルから付けたものは付け直す）
  function applyToLayers() {
    if (!checkOrAlert()) return;
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem) || comp.selectedLayers.length === 0) {
      return alert("適用するレイヤーを選択してください。", TITLE);
    }
    // AE は同じ内部名の疑似エフェクトの定義を覚えてしまうため、パネルから適用するときは毎回別の内部名にする
    // （書き出す .ffx は設定どおりの内部名）
    var def = currentDefinition();
    var suffix = "_" + new Date().getTime().toString(36).slice(-5);
    def.matchName = def.matchName.substring(0, MATCHNAME_MAX - suffix.length) + suffix;
    var tmp = new File(Folder.temp.fsName + "/ck_preview.ffx");
    writeBinary(tmp, CK_FFXWriter.build(def));
    app.beginUndoGroup(TITLE + " 適用");
    try {
      var layers = comp.selectedLayers;
      removePreviouslyApplied(layers);
      // applyPreset は選択中のレイヤーすべてに適用される
      layers[0].applyPreset(tmp);
      lastAppliedMatchName = def.matchName;
    } finally {
      app.endUndoGroup();
      tmp.remove();
    }
  }

  function loadSettings() {
    var f = File.openDialog("設定ファイル（.ck.json）を選んでください", "*.json");
    if (!f) return;
    var def = eval("(" + readText(f) + ")");
    state.name = def.name;
    state.matchName = (def.matchName || "").replace(/^Pseudo\//, "");
    state.items = unnest(def.params || [], []);
    refreshAll();
  }

  // ---------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------
  var win = thisObj instanceof Panel ? thisObj : new Window("palette", TITLE, undefined, { resizeable: true });
  win.orientation = "row";
  win.alignChildren = ["fill", "top"];

  // 左: エフェクトコントロール風のプレビュー
  var previewPanel = win.add("panel", undefined, "プレビュー");
  previewPanel.alignChildren = ["fill", "top"];
  previewPanel.preferredSize.width = 300;
  var previewTitle = previewPanel.add("statictext", undefined, "fx  " + state.name);
  var previewBody = previewPanel.add("group");
  previewBody.orientation = "column";
  previewBody.alignChildren = ["fill", "top"];
  previewBody.spacing = 2;

  // 右: 設定
  var right = win.add("group");
  right.orientation = "column";
  right.alignChildren = ["fill", "top"];

  var head = right.add("panel", undefined, "エフェクト");
  head.alignChildren = ["fill", "top"];
  var rowName = head.add("group");
  rowName.add("statictext", undefined, "名前");
  var etName = rowName.add("edittext", undefined, state.name);
  etName.characters = 20;
  var rowMatch = head.add("group");
  rowMatch.add("statictext", undefined, "内部名");
  var etMatch = rowMatch.add("edittext", undefined, "");
  etMatch.characters = 20;

  var listPanel = right.add("panel", undefined, "項目");
  listPanel.alignChildren = ["fill", "top"];
  var lb = listPanel.add("listbox", undefined, [], { multiselect: false });
  lb.preferredSize = [280, 180];
  var rowAdd = listPanel.add("group");
  var typeNames = [];
  for (var t = 0; t < TYPES.length; t++) typeNames.push(TYPES[t].label);
  var ddType = rowAdd.add("dropdownlist", undefined, typeNames);
  ddType.selection = 0;
  var btnAdd = rowAdd.add("button", undefined, "追加");
  var rowBtns = listPanel.add("group");
  var btnUp = rowBtns.add("button", undefined, "↑");
  var btnDown = rowBtns.add("button", undefined, "↓");
  var btnDup = rowBtns.add("button", undefined, "複製");
  var btnRemove = rowBtns.add("button", undefined, "削除");
  btnUp.preferredSize.width = btnDown.preferredSize.width = 36;

  // --- 選択中の項目の編集欄 ---
  var edit = right.add("panel", undefined, "選択中の項目");
  edit.alignChildren = ["fill", "top"];
  var rowPName = edit.add("group");
  rowPName.add("statictext", undefined, "名前");
  var etPName = rowPName.add("edittext", undefined, "");
  etPName.characters = 20;
  var rowFlags = edit.add("group");
  var cbInvisible = rowFlags.add("checkbox", undefined, "非表示");
  var cbHold = rowFlags.add("checkbox", undefined, "停止キーフレーム");

  var stack = edit.add("group");
  stack.orientation = "stack";
  stack.alignChildren = ["fill", "top"];

  function page() {
    var g = stack.add("group");
    g.orientation = "column";
    g.alignChildren = ["fill", "top"];
    g.visible = false;
    return g;
  }

  function field(parent, label, chars) {
    var g = parent.add("group");
    var st = g.add("statictext", undefined, label);
    st.preferredSize.width = 110;
    var et = g.add("edittext", undefined, "0");
    et.characters = chars || 8;
    return et;
  }

  function fields(parent, label, count) {
    var g = parent.add("group");
    var st = g.add("statictext", undefined, label);
    st.preferredSize.width = 110;
    var list = [];
    for (var i = 0; i < count; i++) {
      var et = g.add("edittext", undefined, "0");
      et.characters = 5;
      list.push(et);
    }
    return list;
  }

  var pages = {};
  var ui = {};

  pages.slider = page();
  ui.slValue = field(pages.slider, "初期値");
  ui.slSMin = field(pages.slider, "スライダー最小");
  ui.slSMax = field(pages.slider, "スライダー最大");
  ui.slVMin = field(pages.slider, "有効最小");
  ui.slVMax = field(pages.slider, "有効最大");
  ui.slPrec = field(pages.slider, "小数点以下の桁数", 3);
  var slFlags = pages.slider.add("group");
  ui.slPercent = slFlags.add("checkbox", undefined, "% 表示");
  ui.slPixel = slFlags.add("checkbox", undefined, "ピクセル値");

  pages.angle = page();
  ui.angValue = field(pages.angle, "初期値（度）");

  pages.checkbox = page();
  ui.cbValue = pages.checkbox.add("checkbox", undefined, "初期値をオンにする");
  ui.cbLabel = field(pages.checkbox, "横に出す文字", 16);

  pages.color = page();
  ui.colRGB = fields(pages.color, "初期色 RGB", 3);

  pages.point = page();
  ui.ptXY = fields(pages.point, "初期位置（%）", 2);

  pages.point3d = page();
  ui.pt3XYZ = fields(pages.point3d, "初期位置（%）", 3);

  pages.popup = page();
  ui.popItems = field(pages.popup, "項目（| 区切り）", 18);
  ui.popValue = field(pages.popup, "初期値（番号）", 3);

  pages.label = page();
  ui.lblDim = pages.label.add("checkbox", undefined, "文字を薄く表示");

  var hint = edit.add("statictext", undefined, "", { multiline: true });
  hint.preferredSize = [260, 30];

  var actions = right.add("group");
  actions.orientation = "column";
  actions.alignChildren = ["fill", "top"];
  var btnApply = actions.add("button", undefined, "選択レイヤーにまとめて適用");
  var btnExport = actions.add("button", undefined, "書き出し（.ffx＋埋め込みコード）");
  var rowFile = actions.add("group");
  rowFile.alignChildren = ["fill", "center"];
  var btnLoad = rowFile.add("button", undefined, "設定を読み込み");
  var btnConvert = rowFile.add("button", undefined, "既存.ffxを変換");

  // --- 表示の更新 ---
  function depthAt(index) {
    var d = 0;
    for (var i = 0; i < index; i++) {
      if (state.items[i].type === "group") d++;
      if (state.items[i].type === "groupEnd") d--;
    }
    return d;
  }

  function labelFor(index) {
    var p = state.items[index];
    var d = depthAt(index) - (p.type === "groupEnd" ? 1 : 0);
    var indent = "";
    for (var i = 0; i < d; i++) indent += "    ";
    if (p.type === "groupEnd") return indent + "└ グループ終了";
    return indent + "[" + typeLabel(p.type) + "] " + p.name + (p.invisible ? "（非表示）" : "");
  }

  function selectedItem() {
    return lb.selection ? state.items[lb.selection.index] : null;
  }

  // --- プレビュー（エフェクトコントロール風） ---
  var NAME_WIDTH = 110;

  function angleText(v) {
    var turns = v < 0 ? Math.ceil(v / 360) : Math.floor(v / 360);
    var deg = v - turns * 360;
    return turns + "x" + (deg < 0 ? "" : "+") + deg.toFixed(1) + "°";
  }

  // --- 線で描くアイコン（AE の画像は使わず自前で描く） ---
  var ICON_COLOR = [0.75, 0.75, 0.75, 1];

  // ストップウォッチ（停止キーフレームがオンの項目の目印）
  function addStopwatch(parent) {
    var g = parent.add("group");
    g.preferredSize = [14, 14];
    g.onDraw = function () {
      var gr = this.graphics;
      var pen = gr.newPen(gr.PenType.SOLID_COLOR, ICON_COLOR, 1.2);
      gr.newPath();
      gr.ellipsePath(2, 3, 10, 10);
      gr.strokePath(pen);
      gr.newPath();
      gr.moveTo(5, 1);
      gr.lineTo(9, 1);
      gr.moveTo(7, 1);
      gr.lineTo(7, 3);
      gr.moveTo(7, 8);
      gr.lineTo(7, 5);
      gr.strokePath(pen);
    };
    return g;
  }

  // 角度のダイヤル（0度が上、時計回り）
  function addDial(parent, degrees) {
    var g = parent.add("group");
    g.preferredSize = [28, 28];
    g.onDraw = function () {
      var gr = this.graphics;
      var pen = gr.newPen(gr.PenType.SOLID_COLOR, ICON_COLOR, 1.5);
      var r = 12;
      var c = 14;
      var a = (degrees * Math.PI) / 180;
      gr.newPath();
      gr.ellipsePath(c - r, c - r, r * 2, r * 2);
      gr.strokePath(pen);
      gr.newPath();
      gr.moveTo(c, c);
      gr.lineTo(c + (r - 2) * Math.sin(a), c - (r - 2) * Math.cos(a));
      gr.strokePath(pen);
    };
    return g;
  }

  function previewRow(depth, name, hidden, showStopwatch) {
    var row = previewBody.add("group");
    row.alignChildren = ["left", "center"];
    row.spacing = 4;
    if (depth > 0) {
      var indent = row.add("group");
      indent.preferredSize = [depth * 14, 1];
    }
    if (showStopwatch) {
      addStopwatch(row);
    } else {
      var blank = row.add("group");
      blank.preferredSize = [14, 14];
    }
    var st = row.add("statictext", undefined, name + (hidden ? "（非表示）" : ""));
    st.preferredSize.width = NAME_WIDTH;
    if (hidden) row.enabled = false;
    return row;
  }

  // 行の名前をクリックすると、右の一覧でその項目を選ぶ
  function selectOnClick(row, index) {
    row.addEventListener("mousedown", function () {
      if (!lb.selection || lb.selection.index !== index) {
        lb.selection = index;
        refreshEditor();
      }
    });
  }

  // プレビュー上の操作で初期値を変えたとき
  function previewChanged(index) {
    if (lb.selection && lb.selection.index === index) refreshEditor();
  }

  function renderPreview() {
    while (previewBody.children.length) previewBody.remove(previewBody.children[0]);
    previewTitle.text = "fx  " + (state.name || "");
    var depth = 0;
    for (var i = 0; i < state.items.length; i++) {
      var p = state.items[i];
      if (p.type === "groupEnd") {
        depth = Math.max(0, depth - 1);
        continue;
      }
      var row = previewRow(depth, (p.type === "group" ? "▼ " : "") + p.name, p.invisible, HOLDABLE[p.type] && p.hold);
      addPreviewWidget(row, p, i);
      selectOnClick(row, i);
      if (p.type === "group") depth++;
    }
    if (!state.items.length) previewBody.add("statictext", undefined, "（項目を追加するとここに表示されます）");
    win.layout.layout(true);
  }

  function addPreviewWidget(row, p, index) {
    var v = p.value;
    var w;
    switch (p.type) {
      case "slider":
        var txt = row.add("statictext", undefined, Number(v).toFixed(p.precision || 0) + (p.percent ? "%" : ""));
        txt.preferredSize.width = 50;
        w = row.add("slider", undefined, v, p.sliderMin, p.sliderMax);
        w.preferredSize.width = 100;
        w.onChanging = function () {
          txt.text = this.value.toFixed(p.precision || 0) + (p.percent ? "%" : "");
        };
        w.onChange = function () {
          var f = Math.pow(10, p.precision || 0);
          p.value = Math.round(this.value * f) / f;
          previewChanged(index);
        };
        break;
      case "angle":
        row.add("statictext", undefined, angleText(v));
        addDial(row, v || 0);
        break;
      case "checkbox":
        w = row.add("checkbox", undefined, p.label || "");
        w.value = !!v;
        w.onClick = function () {
          p.value = this.value;
          previewChanged(index);
        };
        break;
      case "color":
        var sw = row.add("group");
        sw.preferredSize = [40, 16];
        sw.graphics.backgroundColor = sw.graphics.newBrush(sw.graphics.BrushType.SOLID_COLOR, [
          v[0] / 255,
          v[1] / 255,
          v[2] / 255,
          1
        ]);
        break;
      case "point":
        row.add("statictext", undefined, v[0] + "%, " + v[1] + "%");
        break;
      case "point3d":
        row.add("statictext", undefined, v[0] + "%, " + v[1] + "%, " + v[2] + "%");
        break;
      case "popup":
        w = row.add("dropdownlist", undefined, p.items);
        w.selection = Math.max(0, Math.min(p.items.length, v) - 1);
        w.onChange = function () {
          if (!this.selection) return;
          p.value = this.selection.index + 1;
          previewChanged(index);
        };
        break;
      case "layer":
        w = row.add("dropdownlist", undefined, ["なし"]);
        w.selection = 0;
        break;
      case "label":
        if (p.dim) row.children[row.children.length - 1].enabled = false; // 名前の文字
        break;
    }
  }

  function refreshList(selectIndex) {
    lb.removeAll();
    for (var i = 0; i < state.items.length; i++) lb.add("item", labelFor(i));
    if (selectIndex !== undefined && selectIndex >= 0 && selectIndex < state.items.length) {
      lb.selection = selectIndex;
    }
    refreshEditor();
    renderPreview();
  }

  function refreshEditor() {
    var p = selectedItem();
    for (var k in pages) if (pages.hasOwnProperty(k)) pages[k].visible = !!p && p.type === k;
    edit.enabled = !!p && p.type !== "groupEnd";
    hint.text = "";
    if (!p) return;

    etPName.text = p.name;
    cbInvisible.visible = !!HIDEABLE[p.type];
    cbHold.visible = !!HOLDABLE[p.type];
    cbInvisible.value = !!p.invisible;
    cbHold.value = !!p.hold;
    var v = p.value;

    switch (p.type) {
      case "slider":
        ui.slValue.text = v;
        ui.slSMin.text = p.sliderMin;
        ui.slSMax.text = p.sliderMax;
        ui.slVMin.text = p.validMin;
        ui.slVMax.text = p.validMax;
        ui.slPrec.text = p.precision || 0;
        ui.slPercent.value = !!p.percent;
        ui.slPixel.value = !!p.pixel;
        break;
      case "angle":
        ui.angValue.text = v;
        hint.text = "1回転 = 360 度（例: 1回転と45度 → 405）";
        break;
      case "checkbox":
        ui.cbValue.value = !!v;
        ui.cbLabel.text = p.label || "";
        break;
      case "color":
        for (var i = 0; i < 3; i++) ui.colRGB[i].text = v[i];
        break;
      case "point":
        ui.ptXY[0].text = v[0];
        ui.ptXY[1].text = v[1];
        hint.text = "レイヤーの幅・高さに対する % で指定します（50, 50 で中央）。";
        break;
      case "point3d":
        for (var j = 0; j < 3; j++) ui.pt3XYZ[j].text = v[j];
        hint.text = "レイヤーの幅・高さに対する % で指定します。";
        break;
      case "popup":
        ui.popItems.text = p.items.join("|");
        ui.popValue.text = v;
        hint.text = "初期値は 1 から数えた番号です。";
        break;
      case "layer":
        hint.text = "初期値は「なし」になります。";
        break;
      case "label":
        ui.lblDim.value = !!p.dim;
        hint.text = "名前がそのまま見出しとして表示されます。";
        break;
      case "group":
        hint.text = "この下から「グループ終了」までがグループの中身です。";
        break;
    }
  }

  function refreshAll() {
    etName.text = state.name;
    etMatch.text = state.matchName;
    refreshList(0);
  }

  function num(et) {
    var v = parseFloat(et.text);
    return isNaN(v) ? 0 : v;
  }

  function toByte(et) {
    return Math.max(0, Math.min(255, Math.round(num(et))));
  }

  // 編集欄 → データ
  function applyEditor() {
    var p = selectedItem();
    if (!p || p.type === "groupEnd") return;
    p.name = etPName.text;
    if (HIDEABLE[p.type]) p.invisible = cbInvisible.value;
    if (HOLDABLE[p.type]) p.hold = cbHold.value;

    switch (p.type) {
      case "slider":
        p.value = num(ui.slValue);
        p.sliderMin = num(ui.slSMin);
        p.sliderMax = num(ui.slSMax);
        p.validMin = num(ui.slVMin);
        p.validMax = num(ui.slVMax);
        p.precision = Math.max(0, Math.min(6, Math.round(num(ui.slPrec))));
        p.percent = ui.slPercent.value;
        p.pixel = ui.slPixel.value;
        break;
      case "angle":
        p.value = num(ui.angValue);
        break;
      case "checkbox":
        p.value = ui.cbValue.value;
        p.label = ui.cbLabel.text;
        break;
      case "color":
        p.value = [toByte(ui.colRGB[0]), toByte(ui.colRGB[1]), toByte(ui.colRGB[2])];
        break;
      case "point":
        p.value = [num(ui.ptXY[0]), num(ui.ptXY[1])];
        break;
      case "point3d":
        p.value = [num(ui.pt3XYZ[0]), num(ui.pt3XYZ[1]), num(ui.pt3XYZ[2])];
        break;
      case "popup":
        p.items = ui.popItems.text.split("|");
        p.value = Math.round(num(ui.popValue));
        break;
      case "label":
        p.dim = ui.lblDim.value;
        break;
    }
    lb.selection.text = labelFor(lb.selection.index);
    renderPreview();
  }

  function insertAt() {
    return lb.selection ? lb.selection.index + 1 : state.items.length;
  }

  function addItem() {
    var type = TYPES[ddType.selection.index].type;
    var at = insertAt();
    state.items.splice(at, 0, newItem(type));
    if (type === "group") state.items.splice(at + 1, 0, { type: "groupEnd", name: "" });
    refreshList(at);
  }

  function duplicateItem() {
    var p = selectedItem();
    if (!p || p.type === "group" || p.type === "groupEnd") return;
    var copy = eval(p.toSource());
    copy.name = p.name + "_copy";
    var at = lb.selection.index + 1;
    state.items.splice(at, 0, copy);
    refreshList(at);
  }

  // グループを消すときは、中身は残して「グループ終了」も一緒に消す
  function removeItem() {
    if (!lb.selection) return;
    var i = lb.selection.index;
    var p = state.items[i];
    if (p.type === "group" || p.type === "groupEnd") {
      var d = 0;
      var j;
      if (p.type === "group") {
        for (j = i; j < state.items.length; j++) {
          if (state.items[j].type === "group") d++;
          if (state.items[j].type === "groupEnd" && --d === 0) break;
        }
        state.items.splice(j, 1);
        state.items.splice(i, 1);
      } else {
        for (j = i; j >= 0; j--) {
          if (state.items[j].type === "groupEnd") d++;
          if (state.items[j].type === "group" && --d === 0) break;
        }
        state.items.splice(i, 1);
        state.items.splice(j, 1);
        i = j;
      }
    } else {
      state.items.splice(i, 1);
    }
    refreshList(Math.min(i, state.items.length - 1));
  }

  function move(delta) {
    if (!lb.selection) return;
    var i = lb.selection.index;
    var j = i + delta;
    if (j < 0 || j >= state.items.length) return;
    var t = state.items[i];
    state.items[i] = state.items[j];
    state.items[j] = t;
    refreshList(j);
  }

  etName.onChanging = function () {
    state.name = etName.text;
    previewTitle.text = "fx  " + state.name;
  };
  etMatch.onChanging = function () {
    state.matchName = etMatch.text;
  };
  lb.onChange = refreshEditor;
  btnAdd.onClick = addItem;
  btnDup.onClick = duplicateItem;
  btnUp.onClick = function () {
    move(-1);
  };
  btnDown.onClick = function () {
    move(1);
  };
  btnRemove.onClick = removeItem;

  var editors = [
    etPName, ui.slValue, ui.slSMin, ui.slSMax, ui.slVMin, ui.slVMax, ui.slPrec, ui.angValue, ui.cbLabel,
    ui.popItems, ui.popValue
  ].concat(ui.colRGB, ui.ptXY, ui.pt3XYZ);
  for (var k = 0; k < editors.length; k++) editors[k].onChange = applyEditor;
  var toggles = [cbInvisible, cbHold, ui.slPercent, ui.slPixel, ui.cbValue, ui.lblDim];
  for (var m = 0; m < toggles.length; m++) toggles[m].onClick = applyEditor;

  function guarded(fn) {
    return function () {
      try {
        fn();
      } catch (e) {
        alert("エラー: " + e.toString(), TITLE);
      }
    };
  }
  btnApply.onClick = guarded(applyToLayers);
  btnExport.onClick = guarded(exportFiles);
  btnLoad.onClick = guarded(loadSettings);
  btnConvert.onClick = guarded(convertExisting);

  refreshList();
  win.onResizing = win.onResize = function () {
    this.layout.resize();
  };
  if (win instanceof Window) {
    win.center();
    win.show();
  } else {
    win.layout.layout(true);
  }
})(this);
