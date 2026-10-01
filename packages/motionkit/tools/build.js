#!/usr/bin/env node
/*
 * motionkit.jsx の埋め込み部分（@MK_BUILD_START〜@MK_BUILD_END）を作り直す。
 * effects/*.json（調整項目の一覧）と src/expressions.jsxinc を埋め込む。
 *
 *   node packages/motionkit/tools/build.js          … motionkit.jsx を更新
 *   node packages/motionkit/tools/build.js --check  … motionkit.jsx が最新か確かめる（古ければ終了コード 1）
 */
var fs = require("fs");
var path = require("path");

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

function params() {
  var out = {};
  EFFECTS.forEach(function (key) {
    out[key] = JSON.parse(read(path.join(root, "effects", key + ".json")));
  });
  return out;
}

function block() {
  var p = params();
  var out = [];
  out.push("// 以下は tools/build.js が生成（直接編集しない）");
  out.push("// 調整項目の一覧（effects/*.json）");
  out.push(
    "var MK_PARAMS = {\n" +
      EFFECTS.map(function (key) {
        return "  " + key + ": [\n" + p[key].map(function (x) { return "    " + JSON.stringify(x); }).join(",\n") + "\n  ]";
      }).join(",\n") +
      "\n};"
  );
  out.push("// src/expressions.jsxinc");
  out.push(read(path.join(root, "src", "expressions.jsxinc")));
  return out.join("\n");
}

function render(src) {
  var a = src.indexOf(START), b = src.indexOf(END);
  if (a < 0 || b < a) throw new Error("motionkit.jsx に " + START + " / " + END + " がありません");
  var lineStart = src.lastIndexOf("\n", a) + 1;
  var pad = src.substring(lineStart, a);
  return src.substring(0, a + START.length) + "\n" + indent(block(), pad) + "\n" + pad + src.substring(b);
}

module.exports = { render: render, params: params };

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
