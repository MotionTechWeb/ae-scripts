// CtrlKit の設定ファイル（.ck.json）から .ffx と埋め込み用コードを作る（Node 用）
//   node packages/ctrlkit/tools/build.js <設定.ck.json> <出力.ffx> [出力_ffx.jsx]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = {};
vm.createContext(ctx);
for (const f of ["binary.jsxinc", "ffx-writer.jsxinc", "embed.jsxinc"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", f), "utf8"), ctx, { filename: f });
}

function build(def) {
  const bytes = ctx.CK_FFXWriter.build(def);
  return { bytes, buffer: Buffer.from([...bytes].map((c) => c.charCodeAt(0))) };
}

module.exports = { ctx, build };

if (require.main === module) {
  const [src, outFfx, outJsx] = process.argv.slice(2);
  if (!src || !outFfx) {
    console.error("使い方: node build.js <設定.ck.json> <出力.ffx> [出力_ffx.jsx]");
    process.exit(1);
  }
  const def = JSON.parse(fs.readFileSync(src, "utf8"));
  const { bytes, buffer } = build(def);
  fs.writeFileSync(outFfx, buffer);
  if (outJsx) {
    const id = def.name.replace(/[^A-Za-z0-9_]/g, "_");
    fs.writeFileSync(
      outJsx,
      ctx.CK_Embed.snippet(bytes, {
        varName: id.toUpperCase() + "_FFX",
        functionName: "apply" + id.charAt(0).toUpperCase() + id.slice(1),
        effectName: def.name,
      })
    );
  }
  console.log("書き出しました: " + [outFfx, outJsx].filter(Boolean).join(", "));
}
