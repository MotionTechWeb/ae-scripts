#!/usr/bin/env node
/*
 * CtrlKit Web 版のビルド。
 * template.html の <!-- @CTRLKIT_LIB@ --> に packages/ctrlkit/src の .jsxinc を埋め込み、
 * ダブルクリックで開ける 1 ファイルの ctrlkit.html を書き出す。
 *
 *   node tools/ctrlkit-web/build.js          … ctrlkit.html を更新
 *   node tools/ctrlkit-web/build.js --check  … ctrlkit.html が最新か確かめる（古ければ終了コード 1）
 */
var fs = require("fs");
var path = require("path");

var here = __dirname;
var srcDir = path.join(here, "..", "..", "packages", "ctrlkit", "src");
var LIBS = ["binary.jsxinc", "ffx-writer.jsxinc", "embed.jsxinc"];
var PLACEHOLDER = "<!-- @CTRLKIT_LIB@ -->";

function render() {
  var template = fs.readFileSync(path.join(here, "template.html"), "utf8");
  if (template.indexOf(PLACEHOLDER) < 0) throw new Error("template.html に " + PLACEHOLDER + " がありません");
  var lib = LIBS.map(function (name) {
    var code = fs.readFileSync(path.join(srcDir, name), "utf8").replace(/<\/script/gi, "<\\/script");
    return "<!-- packages/ctrlkit/src/" + name + " -->\n<script>\n" + code + "\n</script>";
  }).join("\n");
  var html = template.split(PLACEHOLDER).join(lib);
  return html.replace(/^(<!doctype html>\n)/i, "$1<!-- このファイルは build.js が生成しています。編集は template.html へ。 -->\n");
}

var out = path.join(here, "ctrlkit.html");
var html = render();
if (process.argv.indexOf("--check") >= 0) {
  var current = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  // Windows で改行が CRLF で取り出されていても最新とみなす
  var lf = function (t) { return t.replace(/\r\n/g, "\n"); };
  if (lf(current) !== lf(html)) {
    console.error("ctrlkit.html が古いです。node tools/ctrlkit-web/build.js を実行してください。");
    process.exit(1);
  }
  console.log("ctrlkit.html は最新です");
} else {
  fs.writeFileSync(out, html);
  console.log("wrote " + path.relative(process.cwd(), out));
}
