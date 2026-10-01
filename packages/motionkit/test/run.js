// MotionKit のテスト（Node）
//   node packages/motionkit/test/run.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");

const root = path.join(__dirname, "..");
let failed = 0;
function check(name, ok, info) {
  console.log((ok ? "ok   " : "FAIL ") + name + (ok || info === undefined ? "" : "\n     " + info));
  if (!ok) failed++;
}
const near = (a, b) => Math.abs(a - b) < 1e-6;
const nearV = (a, b) => a.length === b.length && a.every((v, i) => near(v, b[i]));

// 1) 埋め込み部分が最新か
const chk = cp.spawnSync(process.execPath, [path.join(root, "tools", "build.js"), "--check"], { encoding: "utf8" });
check("motionkit.jsx の埋め込み部分が最新", chk.status === 0, chk.stderr.trim());

// 2) motionkit.jsx が構文として正しい
const jsx = fs.readFileSync(path.join(root, "motionkit.jsx"), "utf8");
// #targetengine などの ExtendScript の指示行は JavaScript ではないので外して確かめる
check("motionkit.jsx が構文として正しい", (() => { try { new Function(jsx.replace(/^#\w+.*$/gm, "")); return true; } catch (e) { return false; } })());
check("専用のエンジンを指定している（浮きウィンドウで固まらないように）", /^#targetengine "MotionKit"$/m.test(jsx));

// 3) 疑似エフェクトの定義
const defs = {};
for (const key of ["shape", "anim", "layout"]) defs[key] = JSON.parse(fs.readFileSync(path.join(root, "effects", key + ".ck.json"), "utf8"));
const paramNames = (def) => def.params.map((p) => p.name);
for (const key in defs) {
  const d = defs[key];
  check(`${d.name}: 項目名は31文字以内・ASCII`, d.params.every((p) => p.name.length <= 31 && /^[\x20-\x7e]+$/.test(p.name)));
  check(`${d.name}: 元の名前は英数字と _ だけ`, /^[A-Za-z0-9_]+$/.test(d.name));
  // AE 2025 でチェックボックス・角度の項目をエクスプレッションから読むと「Actual missing plugin」で落ちたため使わない
  check(`${d.name}: チェックボックス・角度を使っていない`, d.params.every((p) => p.type !== "checkbox" && p.type !== "angle"));
}

// setParams({...}) で使っている項目名がエフェクトにあるか
const effectOfBlock = [
  [/createShape[\s\S]*?setParams\(fx, \{([\s\S]*?)\}\);/, "shape"],
  [/applyAnim[\s\S]*?setParams\(fx, \{([\s\S]*?)\}\);/, "anim"],
  [/applyLayout[\s\S]*?setParams\(fx, \{([\s\S]*?)\}\);/, "layout"],
];
for (const [re, key] of effectOfBlock) {
  const body = re.exec(jsx)[1];
  const keys = [...body.matchAll(/^\s*(?:"([^"]+)"|(\w+)):/gm)].map((m) => m[1] || m[2]);
  const missing = keys.filter((k) => !paramNames(defs[key]).includes(k));
  check(`${defs[key].name}: パネルが設定する項目がすべてある`, keys.length > 0 && missing.length === 0, missing.join(", "));
}

// 4) エクスプレッションを擬似的な AE 環境で動かす
const built = require(path.join(root, "tools", "build.js")).effectDefs();
const ctx = { MK_EFFECT_NAME: { shape: built.shape.name, anim: built.anim.name, layout: built.layout.name } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "src", "expressions.jsxinc"), "utf8"), ctx);
const E = ctx.MK_Expr;
check("エクスプレッションが付けた名前のエフェクトを読む", E.SHAPE === built.shape.name && /^MK_Shape_[0-9a-f]{6}$/.test(E.SHAPE));

function makeEffect(def, values) {
  const names = paramNames(def);
  const v = {};
  def.params.forEach((p) => (v[p.name] = p.type === "checkbox" ? (p.value ? 1 : 0) : p.value));
  Object.assign(v, values || {});
  return (name) => {
    if (!names.includes(name)) throw new Error("項目がありません: " + name);
    return { value: v[name] };
  };
}

// env: { value, time, inPoint, outPoint, effects: { "MK_Anim": {...} }, layers: { name: { anchor, layout: {...} } } }
function evalExpr(code, env) {
  let rnd = 0;
  const sandbox = {
    value: env.value,
    time: env.time || 0,
    inPoint: env.inPoint || 0,
    outPoint: env.outPoint === undefined ? 10 : env.outPoint,
    effect(name) {
      const key = { [E.SHAPE]: "shape", [E.ANIM]: "anim" }[name];
      if (!env.effects || !env.effects[name]) throw new Error("エフェクトがありません: " + name);
      return makeEffect(defs[key], env.effects[name]);
    },
    thisComp: {
      layer(name) {
        const l = (env.layers || {})[name];
        if (!l) throw new Error("レイヤーがありません: " + name);
        return {
          effect: (n) => {
            if (n !== E.LAYOUT) throw new Error("エフェクトがありません: " + n);
            return makeEffect(defs.layout, l.layout);
          },
          transform: { anchorPoint: { value: l.anchor || [50, 50] } },
        };
      },
    },
    createPath: (points, inT, outT, closed) => ({ points, closed }),
    seedRandom: (s) => (rnd = s),
    random: (a, b) => a + (b - a) * 0.25,
  };
  return vm.runInNewContext(code, sandbox);
}

// シェイプ
const shapeEnv = (vals) => ({ effects: { [E.SHAPE]: vals || {} } });
check("シェイプ: サイズ", nearV(evalExpr(E.shape.size, shapeEnv({ Width: 300, Height: 120 })), [300, 120]));
check("シェイプ: 星の内側の半径", near(evalExpr(E.shape.innerRadius, shapeEnv({ Width: 400, "Inner Radius": 25 })), 50));
check("シェイプ: 塗りのオン／オフ", evalExpr(E.shape.fillOpacity, shapeEnv({ Fill: 0 })) === 0 && evalExpr(E.shape.fillOpacity, shapeEnv({ Fill: 1 })) === 100);
const line = evalExpr(E.shape.line, shapeEnv({ Width: 600 }));
check("シェイプ: ライン", JSON.stringify(line.points) === "[[-300,0],[300,0]]" && line.closed === false);
const head = evalExpr(E.shape.arrowHead, shapeEnv({ Width: 600, "Head Size": 40 }));
check("シェイプ: 矢じり", nearV(head.points[1], [300, 0]) && nearV(head.points[0], [260, -32]));
for (const k in E.shape) {
  check(`シェイプ: ${k} が動く`, (() => { try { evalExpr(E.shape[k], shapeEnv()); return true; } catch (e) { return e.message; } })() === true);
}

// アニメ
const anim = (vals, extra) => Object.assign({ effects: { [E.ANIM]: vals } }, extra);
check("アニメ: エフェクトが無ければ元の値", nearV(evalExpr(E.animScale(), { value: [100, 100], time: 0 }), [100, 100]));
check("アニメ: ポップの開始は0", nearV(evalExpr(E.animScale(), anim({ Type: 1 }, { value: [100, 100], time: 0 })), [0, 0]));
check("アニメ: ポップの終わりは元の値", nearV(evalExpr(E.animScale(), anim({ Type: 1 }, { value: [100, 80], time: 0.5 })), [100, 80]));
const mid = evalExpr(E.animScale(), anim({ Type: 1, Easing: 3 }, { value: [100, 100], time: 0.4 }))[0];
check("アニメ: オーバーシュートで一度大きくなる", mid > 100, mid);
const noOver = evalExpr(E.animScale(), anim({ Type: 1, Easing: 3, Overshoot: 0 }, { value: [100, 100], time: 0.4 }))[0];
check("アニメ: 強さ0なら行き過ぎない", noOver <= 100, noOver);
check("アニメ: ポップ以外はスケールを変えない", nearV(evalExpr(E.animScale(), anim({ Type: 2 }, { value: [100, 100, 100], time: 0 })), [100, 100, 100]));
check("アニメ: 遅延", nearV(evalExpr(E.animScale(), anim({ Type: 1, Delay: 1 }, { value: [100, 100], time: 0.9 })), [0, 0]));
check("アニメ: レイヤーの開始から数える", nearV(evalExpr(E.animScale(), anim({ Type: 1 }, { value: [100, 100], time: 2, inPoint: 2 })), [0, 0]));
check("アニメ: フェード（開始）", near(evalExpr(E.animOpacity(), anim({ Type: 2 }, { value: 100, time: 0 })), 0));
check("アニメ: フェード（途中はイーズ）", evalExpr(E.animOpacity(), anim({ Type: 2, Easing: 1 }, { value: 100, time: 0.25 })) > 50);
check("アニメ: フェードも付ける", near(evalExpr(E.animOpacity(), anim({ Type: 1, Fade: 1 }, { value: 100, time: 0.25 })), 50));
check("アニメ: フェードを付けない", near(evalExpr(E.animOpacity(), anim({ Type: 1, Fade: 0 }, { value: 100, time: 0 })), 100));
check("アニメ: 退場", near(evalExpr(E.animOpacity(), anim({ Type: 2, Out: 1, Easing: 6 }, { value: 100, time: 9.75, outPoint: 10 })), 50));
check("アニメ: 退場しない設定", near(evalExpr(E.animOpacity(), anim({ Type: 2, Out: 0 }, { value: 100, time: 9.9, outPoint: 10 })), 100));
check("アニメ: スライド（下から）", nearV(evalExpr(E.position(null), anim({ Type: 3 }, { value: [960, 540], time: 0 })), [960, 740]));
check("アニメ: スライド（左から, 3D）", nearV(evalExpr(E.position(null), anim({ Type: 3, Direction: 1 }, { value: [960, 540, 0], time: 0 })), [760, 540, 0]));
check("アニメ: スライドの終わり", nearV(evalExpr(E.position(null), anim({ Type: 3 }, { value: [960, 540], time: 1 })), [960, 540]));
check("アニメ: 回転", near(evalExpr(E.rotation(null), anim({ Type: 4 }, { value: 10, time: 0 })), -80));
check("アニメ: ワイプ", near(evalExpr(E.animTrimEnd(), anim({ Type: 5, Easing: 6 }, { time: 0.25 })), 50));
check("アニメ: ワイプ以外は線を全部出す", near(evalExpr(E.animTrimEnd(), anim({ Type: 1 }, { time: 0 })), 100));
for (let ez = 1; ez <= 6; ez++) {
  const s = evalExpr(E.animScale(), anim({ Type: 1, Easing: ez }, { value: [100, 100], time: 0 }))[0];
  const e = evalExpr(E.animScale(), anim({ Type: 1, Easing: ez }, { value: [100, 100], time: 0.5 }))[0];
  check(`アニメ: イージング${ez} は0で始まり元の値で終わる`, near(s, 0) && near(e, 100), `${s} → ${e}`);
}

// 配置
const info = (i, n, ctrl) => ({ ctrl: ctrl || "MK_Layout", i, n });
const lay = (layout, extra) => Object.assign({ layers: { "MK_Layout": { anchor: [50, 50], layout } } }, extra);
const gridPos = [0, 1, 2, 3].map((i) => evalExpr(E.position(info(i, 4)), lay({ Mode: 1, Columns: 2 }, { value: [0, 0] })));
check("配置: グリッド", JSON.stringify(gridPos) === JSON.stringify([[-50, -50], [150, -50], [-50, 150], [150, 150]]), JSON.stringify(gridPos));
const circ = evalExpr(E.position(info(1, 4)), lay({ Mode: 2, Radius: 100, "Start Angle": 0 }, { value: [0, 0] }));
check("配置: 円", nearV(circ, [50, 150]), circ);
check("配置: 円の外向き", near(evalExpr(E.rotation(info(1, 4)), lay({ Mode: 2, "Start Angle": 0, "Align Rotation": 1 }, { value: 0 })), 180));
check("配置: 円の範囲が360未満なら両端まで", nearV(evalExpr(E.position(info(2, 3)), lay({ Mode: 2, Radius: 100, "Start Angle": 0, Arc: 180 }, { value: [0, 0] })), [-50, 50]));
check("配置: 直線", nearV(evalExpr(E.position(info(0, 3)), lay({ Mode: 3, "Spacing X": 100, "Spacing Y": 0 }, { value: [0, 0] })), [-50, 50]));
check("配置: ランダム", nearV(evalExpr(E.position(info(0, 3)), lay({ Mode: 4, "Scatter Width": 1000, "Scatter Height": 100 }, { value: [0, 0] })), [-200, 25]));
check("配置: 3Dレイヤーは Z を残す", nearV(evalExpr(E.position(info(0, 1)), lay({ Mode: 3 }, { value: [0, 0, -300] })), [50, 50, -300]));
const both = evalExpr(E.position(info(0, 1)), Object.assign(lay({ Mode: 3 }, { value: [0, 0], time: 0 }), { effects: { [E.ANIM]: { Type: 3 } } }));
check("配置＋スライド", nearV(both, [50, 250]), both);
const back = E.parseLayout(E.position(info(3, 7, 'My "Grid" 2')));
check("配置の目印を読み戻せる", back.i === 3 && back.n === 7 && back.ctrl === 'My "Grid" 2', JSON.stringify(back));
check("配置の名前に \" があっても動く", nearV(evalExpr(E.position(info(0, 1, 'a"b')), { layers: { 'a"b': { layout: { Mode: 3 } } }, value: [0, 0] }), [50, 50]));
check("目印の無い式は配置なし", E.parseLayout(E.position(null)) === null && E.parseLayout("wiggle(1,1)") === null);
check("自分の式を見分ける", E.isOurs(E.animScale()) && E.isOurs(E.position(info(0, 1))) && !E.isOurs("wiggle(1,1)"));

process.exit(failed ? 1 : 0);
