/*
Name:CtrlKit
date:2026/09/30
AE上で疑似エフェクトを組み立て、.ffx と「スクリプト埋め込み用のコード」を書き出すパネル。

- ScriptUI Panels フォルダに src フォルダごと置くとドッキングパネルとして使える
- 今のところ対応している種類: スライダー、カラー
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

  var state = {
    name: "MyEffect",
    matchName: "",
    params: []
  };

  // ---------------------------------------------------------------------
  // 定義まわり
  // ---------------------------------------------------------------------
  function newSlider() {
    return { type: "slider", name: "Slider", validMin: 0, validMax: 100, sliderMin: 0, sliderMax: 100, value: 0 };
  }

  function newColor() {
    return { type: "color", name: "Color", value: [255, 255, 255] };
  }

  function defaultMatchName(name) {
    var m = MATCHNAME_PREFIX + name.replace(/[^A-Za-z0-9_ ]/g, "_");
    return m.substring(0, MATCHNAME_MAX);
  }

  function isAscii(s) {
    return /^[\x20-\x7e]*$/.test(s);
  }

  function currentDefinition() {
    return {
      name: state.name,
      matchName: state.matchName || defaultMatchName(state.name),
      params: state.params
    };
  }

  // 問題があればメッセージの配列を返す
  function validate(def) {
    var errors = [];
    if (!def.name) errors.push("エフェクト名が空です。");
    if (!isAscii(def.name) || def.name.length > NAME_MAX) errors.push("エフェクト名は半角英数字で" + NAME_MAX + "文字までにしてください。");
    if (!isAscii(def.matchName) || def.matchName.length > MATCHNAME_MAX) errors.push("内部名は半角英数字で" + MATCHNAME_MAX + "文字までにしてください。");
    if (def.params.length === 0) errors.push("項目が1つもありません。");
    var seen = {};
    for (var i = 0; i < def.params.length; i++) {
      var p = def.params[i];
      var label = (i + 1) + "番目（" + p.name + "）: ";
      if (!p.name || !isAscii(p.name) || p.name.length > NAME_MAX) errors.push(label + "名前は半角英数字で" + NAME_MAX + "文字までにしてください。");
      if (seen[p.name]) errors.push(label + "名前が重複しています。");
      seen[p.name] = true;
      if (p.type === "slider") {
        if (!(p.validMin <= p.sliderMin && p.sliderMin < p.sliderMax && p.sliderMax <= p.validMax)) {
          errors.push(label + "範囲は 有効最小 ≦ スライダー最小 < スライダー最大 ≦ 有効最大 にしてください。");
        }
        if (p.value < p.validMin || p.value > p.validMax) errors.push(label + "初期値が有効範囲の外です。");
      }
    }
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

  // 書き出し: 選んだフォルダに <名前>.ffx と <名前>_ffx.jsx を作る
  function exportFiles() {
    var def = currentDefinition();
    var errors = validate(def);
    if (errors.length) return alert(errors.join("\n"), TITLE);

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

  // 選択中のレイヤーにその場で適用して見た目を確認する
  function preview() {
    var def = currentDefinition();
    var errors = validate(def);
    if (errors.length) return alert(errors.join("\n"), TITLE);
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem) || comp.selectedLayers.length === 0) {
      return alert("プレビューするレイヤーを選択してください。", TITLE);
    }
    var tmp = new File(Folder.temp.fsName + "/ck_preview.ffx");
    writeBinary(tmp, CK_FFXWriter.build(def));
    app.beginUndoGroup(TITLE + " プレビュー");
    try {
      comp.selectedLayers[0].applyPreset(tmp);
    } finally {
      app.endUndoGroup();
      tmp.remove();
    }
  }

  function loadSettings() {
    var f = File.openDialog("設定ファイル（.ck.json）を選んでください", "*.json");
    if (!f) return;
    try {
      var def = eval("(" + readText(f) + ")");
      state.name = def.name;
      state.matchName = def.matchName || "";
      state.params = def.params || [];
      refreshAll();
    } catch (e) {
      alert("読み込めませんでした: " + e.toString(), TITLE);
    }
  }

  // ---------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------
  var win =
    thisObj instanceof Panel ? thisObj : new Window("palette", TITLE, undefined, { resizeable: true });
  win.orientation = "column";
  win.alignChildren = ["fill", "top"];

  var head = win.add("panel", undefined, "エフェクト");
  head.alignChildren = ["fill", "top"];
  var rowName = head.add("group");
  rowName.add("statictext", undefined, "名前");
  var etName = rowName.add("edittext", undefined, state.name);
  etName.characters = 20;
  var rowMatch = head.add("group");
  rowMatch.add("statictext", undefined, "内部名");
  var etMatch = rowMatch.add("edittext", undefined, "");
  etMatch.characters = 20;
  etMatch.helpTip = "空欄なら「" + MATCHNAME_PREFIX + "名前」になります。ほかの疑似エフェクトと重ならない名前にしてください。";

  var listPanel = win.add("panel", undefined, "項目");
  listPanel.alignChildren = ["fill", "top"];
  var lb = listPanel.add("listbox", undefined, [], { multiselect: false });
  lb.preferredSize = [260, 140];
  var rowBtns = listPanel.add("group");
  var btnAddSlider = rowBtns.add("button", undefined, "+スライダー");
  var btnAddColor = rowBtns.add("button", undefined, "+カラー");
  var rowBtns2 = listPanel.add("group");
  var btnUp = rowBtns2.add("button", undefined, "↑");
  var btnDown = rowBtns2.add("button", undefined, "↓");
  var btnRemove = rowBtns2.add("button", undefined, "削除");

  var edit = win.add("panel", undefined, "選択中の項目");
  edit.alignChildren = ["fill", "top"];
  var rowPName = edit.add("group");
  rowPName.add("statictext", undefined, "名前");
  var etPName = rowPName.add("edittext", undefined, "");
  etPName.characters = 20;

  var sliderGroup = edit.add("group");
  sliderGroup.orientation = "column";
  sliderGroup.alignChildren = ["fill", "top"];
  function numberRow(parent, label) {
    var g = parent.add("group");
    var st = g.add("statictext", undefined, label);
    st.preferredSize.width = 110;
    var et = g.add("edittext", undefined, "0");
    et.characters = 8;
    return et;
  }
  var etValue = numberRow(sliderGroup, "初期値");
  var etSMin = numberRow(sliderGroup, "スライダー最小");
  var etSMax = numberRow(sliderGroup, "スライダー最大");
  var etVMin = numberRow(sliderGroup, "有効最小");
  var etVMax = numberRow(sliderGroup, "有効最大");

  var colorGroup = edit.add("group");
  colorGroup.add("statictext", undefined, "初期色 RGB");
  var etR = colorGroup.add("edittext", undefined, "255");
  var etG = colorGroup.add("edittext", undefined, "255");
  var etB = colorGroup.add("edittext", undefined, "255");
  etR.characters = etG.characters = etB.characters = 4;

  var actions = win.add("group");
  actions.orientation = "column";
  actions.alignChildren = ["fill", "top"];
  var btnPreview = actions.add("button", undefined, "選択レイヤーでプレビュー");
  var btnExport = actions.add("button", undefined, "書き出し（.ffx＋埋め込みコード）");
  var rowFile = actions.add("group");
  rowFile.alignChildren = ["fill", "center"];
  var btnLoad = rowFile.add("button", undefined, "設定を読み込み");
  var btnConvert = rowFile.add("button", undefined, "既存.ffxを変換");

  function labelFor(p) {
    return (p.type === "slider" ? "[スライダー] " : "[カラー] ") + p.name;
  }

  function selectedParam() {
    return lb.selection ? state.params[lb.selection.index] : null;
  }

  function refreshList(selectIndex) {
    lb.removeAll();
    for (var i = 0; i < state.params.length; i++) lb.add("item", labelFor(state.params[i]));
    if (selectIndex !== undefined && selectIndex >= 0 && selectIndex < state.params.length) {
      lb.selection = selectIndex;
    }
    refreshEditor();
  }

  function refreshEditor() {
    var p = selectedParam();
    edit.enabled = !!p;
    sliderGroup.visible = !!p && p.type === "slider";
    colorGroup.visible = !!p && p.type === "color";
    if (!p) return;
    etPName.text = p.name;
    if (p.type === "slider") {
      etValue.text = p.value;
      etSMin.text = p.sliderMin;
      etSMax.text = p.sliderMax;
      etVMin.text = p.validMin;
      etVMax.text = p.validMax;
    } else {
      etR.text = p.value[0];
      etG.text = p.value[1];
      etB.text = p.value[2];
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

  function byte(et) {
    var v = Math.round(num(et));
    return Math.max(0, Math.min(255, v));
  }

  function applyEditor() {
    var p = selectedParam();
    if (!p) return;
    p.name = etPName.text;
    if (p.type === "slider") {
      p.value = num(etValue);
      p.sliderMin = num(etSMin);
      p.sliderMax = num(etSMax);
      p.validMin = num(etVMin);
      p.validMax = num(etVMax);
    } else {
      p.value = [byte(etR), byte(etG), byte(etB)];
    }
    lb.selection.text = labelFor(p);
  }

  function addParam(p) {
    state.params.push(p);
    refreshList(state.params.length - 1);
  }

  function move(delta) {
    if (!lb.selection) return;
    var i = lb.selection.index;
    var j = i + delta;
    if (j < 0 || j >= state.params.length) return;
    var t = state.params[i];
    state.params[i] = state.params[j];
    state.params[j] = t;
    refreshList(j);
  }

  etName.onChanging = function () {
    state.name = etName.text;
  };
  etMatch.onChanging = function () {
    state.matchName = etMatch.text;
  };
  lb.onChange = refreshEditor;
  btnAddSlider.onClick = function () {
    addParam(newSlider());
  };
  btnAddColor.onClick = function () {
    addParam(newColor());
  };
  btnUp.onClick = function () {
    move(-1);
  };
  btnDown.onClick = function () {
    move(1);
  };
  btnRemove.onClick = function () {
    if (!lb.selection) return;
    var i = lb.selection.index;
    state.params.splice(i, 1);
    refreshList(Math.min(i, state.params.length - 1));
  };
  var editors = [etPName, etValue, etSMin, etSMax, etVMin, etVMax, etR, etG, etB];
  for (var k = 0; k < editors.length; k++) editors[k].onChange = applyEditor;

  function guarded(fn) {
    return function () {
      try {
        fn();
      } catch (e) {
        alert("エラー: " + e.toString(), TITLE);
      }
    };
  }
  btnPreview.onClick = guarded(preview);
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
