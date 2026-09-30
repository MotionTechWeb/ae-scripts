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

// 1) Zabuton の設定ファイルから作った .ffx が、リポジトリの effectControl_zabuton.ffx と一致するか
const orig = fs.readFileSync(path.join(__dirname, "../../zabuton/effectControl_zabuton.ffx"));
const zabuton = JSON.parse(fs.readFileSync(path.join(__dirname, "../../zabuton/zabuton.ck.json"), "utf8"));
const built = toBuf(ctx.CK_FFXWriter.build(zabuton));
check("Zabuton の .ffx を設定ファイルから再現", built.equals(orig), `長さ ${built.length} / 期待 ${orig.length}`);

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

// 4) 全種類の見本（samples/SampleA.ffx があるときだけ）
const samplePath = path.join(__dirname, "../samples/SampleA.ffx");
if (fs.existsSync(samplePath)) {
  const sample = fs.readFileSync(samplePath);
  const sampleLen = 8 + sample.readUInt32BE(4);
  const pm = sample.indexOf("tdmn", sample.indexOf("ADBE Effect Parade") + 40) + 8;
  const sampleDef = {
    name: "Pseudo Effect Name",
    matchName: sample.toString("latin1", pm, pm + 40).replace(/\0+$/, ""),
    params: [
      { type: "slider", name: "sl", value: 12.5, sliderMin: 0, sliderMax: 150, validMin: -100, validMax: 200, precision: 2 },
      { type: "angle", name: "ang", value: 1845 },
      { type: "checkbox", name: "chk", value: true, label: "chkLabel", invisible: true, hold: true },
      { type: "color", name: "col", value: [16, 32, 48], invisible: true, hold: true },
      { type: "group", name: "grp", invisible: true, params: [
        { type: "slider", name: "inner", value: 0, sliderMin: -10, sliderMax: 10, validMin: -100, validMax: 100,
          precision: 2, percent: true, pixel: true, invisible: true, hold: true },
      ] },
      { type: "label", name: "lbl", dim: true },
      { type: "layer", name: "lyr" },
      { type: "point", name: "pt", value: [100, 200], current: [14, 40] },
      { type: "point3d", name: "pt3", value: [10, 20, 30], current: [1.4, 4, 6] },
      { type: "popup", name: "pop", items: ["AA", "BB", "CC"], value: 2, hold: true },
    ],
  };
  const b = toBuf(ctx.CK_FFXWriter.build(sampleDef));
  const diffs = [];
  for (let i = 0; i < Math.max(b.length, sampleLen); i++) if (b[i] !== sample[i]) diffs.push(i);
  check("全種類の見本をバイト単位で再現", b.length === sampleLen && diffs.length === 0,
    `長さ ${b.length} / 期待 ${sampleLen}, 違い ${diffs.length}か所: ` + diffs.slice(0, 8).map((i) => `@${i} ${b[i]?.toString(16)}≠${sample[i]?.toString(16)}`).join(" "));
} else {
  console.log("skip 全種類の見本（samples/SampleA.ffx がありません）");
}

// 5) 別の定義でも RIFX のチャンク構造（サイズ）が壊れていないか
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
