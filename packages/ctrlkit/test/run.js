// Node で ExtendScript 用のコードを読み込んでテストする
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ctx = {};
vm.createContext(ctx);
for (const f of ["binary.jsxinc", "ffx-writer.jsxinc", "embed.jsxinc"]) {
  const p = path.join(__dirname, "../src", f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f });
}
const toBuf = (s) => Buffer.from([...s].map((c) => c.charCodeAt(0)));
let failed = 0;
function check(name, ok, info) {
  console.log((ok ? "ok   " : "FAIL ") + name + (ok || !info ? "" : "\n     " + info));
  if (!ok) failed++;
}

// 1) Zabuton の定義から作った .ffx が、元ファイル（RIFX部分）と一致するか
const orig = fs.readFileSync(path.join(__dirname, "../../zabuton/effectControl_zabuton.ffx"));
const riffLen = 8 + orig.readUInt32BE(4);
// 元ファイルの内部名（エフェクトの tdmn）をそのまま使う
const parade = orig.indexOf("ADBE Effect Parade");
const mnAt = orig.indexOf("tdmn", parade + 40) + 8;
const origMatchName = orig.toString("latin1", mnAt, mnAt + 40).replace(/\0+$/, "");
const zabuton = {
  name: "Zabuton",
  matchName: origMatchName,
  params: [
    { type: "slider", name: "X_position_Padding", validMin: 0, validMax: 5000, sliderMin: 0, sliderMax: 5000, value: 0, hold: true },
    { type: "slider", name: "Y_position_Padding", validMin: 0, validMax: 5000, sliderMin: 0, sliderMax: 5000, value: 0 },
    { type: "slider", name: "zabuton_radius", validMin: 0, validMax: 1000, sliderMin: 0, sliderMax: 1000, value: 0 },
    { type: "color", name: "BG_Color", value: [255, 0, 0] },
  ],
};
const built = toBuf(ctx.CK_FFXWriter.build(zabuton));
let firstDiff = -1;
for (let i = 0; i < Math.max(built.length, riffLen); i++) if (built[i] !== orig[i]) { firstDiff = i; break; }
check("Zabuton の .ffx をバイト単位で再現", built.length === riffLen && firstDiff === -1,
  `長さ ${built.length} / 期待 ${riffLen}, 最初の違い @${firstDiff}`);

// 2) 浮動小数の書き出し
const f64 = (v) => toBuf(ctx.CK_Binary.f64(v)).toString("hex");
const f32 = (v) => toBuf(ctx.CK_Binary.f32(v)).toString("hex");
const exp64 = (v) => { const b = Buffer.alloc(8); b.writeDoubleBE(v); return b.toString("hex"); };
const exp32 = (v) => { const b = Buffer.alloc(4); b.writeFloatBE(v); return b.toString("hex"); };
const nums = [0, 1, -1, 0.0001, 12.5, 255, 5000, -100, 200, 1 / 3, 123456.789];
check("f64", nums.every((v) => f64(v) === exp64(v)), nums.filter((v) => f64(v) !== exp64(v)).join(","));
check("f32", nums.every((v) => f32(v) === exp32(v)), nums.filter((v) => f32(v) !== exp32(v)).join(","));

// 3) 埋め込み文字列が元のバイト列に戻るか
if (ctx.CK_Embed) {
  const bytes = [...orig].map((b) => String.fromCharCode(b)).join("");
  const code = ctx.CK_Embed.toStringLiteral(bytes, "FFX");
  const back = vm.runInNewContext(code + "; FFX");
  check("埋め込み文字列の往復", back === bytes);
  const snippet = ctx.CK_Embed.snippet(bytes, { varName: "ZABUTON_FFX", functionName: "applyZabuton", effectName: "Zabuton" });
  check("スニペットが構文として正しい", (() => { try { new Function(snippet); return true; } catch (e) { return e.message; } })() === true);
}

// 4) 別の定義でも RIFX のチャンク構造（サイズ）が壊れていないか
function walk(buf, off, end) {
  while (off + 8 <= end) {
    const tag = buf.toString("latin1", off, off + 4);
    const size = buf.readUInt32BE(off + 4);
    if (off + 8 + size > end) return false;
    if ((tag === "LIST" || tag === "RIFX") && !walk(buf, off + 12, off + 8 + size)) return false;
    off += 8 + size + (size & 1);
  }
  return off === end;
}
const other = toBuf(ctx.CK_FFXWriter.build({
  name: "Test Effect",
  matchName: "Pseudo/CK Test",
  params: [
    { type: "color", name: "Tint", value: [10, 20, 30] },
    { type: "slider", name: "Amount", validMin: -100, validMax: 200, sliderMin: -50, sliderMax: 150, value: 12.5 },
  ],
}));
check("別の定義でもチャンク構造が正しい", walk(other, 0, other.length));
check("内部名が入っている", other.includes(Buffer.from("Pseudo/CK Test-0002")));

process.exit(failed ? 1 : 0);
