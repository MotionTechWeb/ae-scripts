#!/usr/bin/env node
/*
 * motionkit.jsx の埋め込み部分（@MK_BUILD_START〜@MK_BUILD_END）を作り直す。
 * effects/*.ck.json から疑似エフェクトの .ffx を作って文字列にし、src/expressions.jsxinc と一緒に埋め込む。
 *
 *   node packages/motionkit/tools/build.js          … motionkit.jsx を更新
 *   node packages/motionkit/tools/build.js --check  … motionkit.jsx が最新か確かめる（古ければ終了コード 1）
 */
var fs = require("fs");
var path = require("path");
var ck = require("../../ctrlkit/tools/build.js");

var root = path.join(__dirname, "..");
var EFFECTS = ["shape", "anim", "layout"];
var START = "// ---- @MK_BUILD_START ----";
var END = "// ---- @MK_BUILD_END ----";

// Windows で CRLF で取り出されていても同じ結果になるよう LF にそろえる
function read(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function indent(code, pad) {
  return code
    .replace(/\n+$/, "")
    .split("\n")
    .map(function (l) { return l ? pad + l : l; })
    .join("\n");
}

function block() {
  var out = [];
  out.push("// 以下は tools/build.js が生成（直接編集しない）");
  out.push("// src/expressions.jsxinc");
  out.push(read(path.join(root, "src", "expressions.jsxinc")));
  var names = [], matchNames = [], lits = [];
  EFFECTS.forEach(function (key) {
    var def = JSON.parse(read(path.join(root, "effects", key + ".ck.json")));
    var built = ck.build(def);
    var v = "MK_FFX_" + key.toUpperCase();
    lits.push("// 疑似エフェクト「" + def.name + "」（effects/" + key + ".ck.json）\n" + ck.ctx.CK_Embed.toStringLiteral(built.bytes, v));
    names.push("  " + key + ": " + JSON.stringify(def.name));
    matchNames.push("  " + key + ": " + JSON.stringify(def.matchName));
  });
  out.push("var MK_EFFECT_NAME = {\n" + names.join(",\n") + "\n};");
  out.push("var MK_MATCHNAME = {\n" + matchNames.join(",\n") + "\n};");
  out.push(lits.join("\n"));
  out.push("var MK_FFX = {\n" + EFFECTS.map(function (k) { return "  " + k + ": MK_FFX_" + k.toUpperCase(); }).join(",\n") + "\n};");
  return out.join("\n");
}

function render(src) {
  var a = src.indexOf(START), b = src.indexOf(END);
  if (a < 0 || b < a) throw new Error("motionkit.jsx に " + START + " / " + END + " がありません");
  var lineStart = src.lastIndexOf("\n", a) + 1;
  var pad = src.substring(lineStart, a);
  return src.substring(0, a + START.length) + "\n" + indent(block(), pad) + "\n" + pad + src.substring(b);
}

module.exports = { render: render };

if (require.main === module) {
  var file = path.join(root, "motionkit.jsx");
  var current = read(file);
  var next = render(current);
  if (process.argv.indexOf("--check") >= 0) {
    if (current !== next) {
      console.error("motionkit.jsx が古いです。node packages/motionkit/tools/build.js を実行してください。");
      process.exit(1);
    }
    console.log("motionkit.jsx は最新です");
  } else {
    fs.writeFileSync(file, next);
    console.log("更新しました: " + file);
  }
}
