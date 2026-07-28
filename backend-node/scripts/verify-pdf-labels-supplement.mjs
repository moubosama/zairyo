// verify-pdf-labels-supplement.mjs — レバー1第9段: PDFテキスト層の「ラベル情報」がAI読み落としを補える量の測定
//
// 【問い】「PDFなら文字が読み取れるんでしょ？」に数字で答える。
//   第6段（値照合＝検出力なし）・第7/8段（寸法の部屋帰属＝否）で、**寸法の帰属**は否と確定済み。
//   残る確定資産は「帰属を要しない情報」＝部屋名・壁記号・建具符号（テキスト層から100%取れる）。
//   本スクリプトはそれがAIの読み落としを**実際に何件補えるか**を別府A〜Dで測る（課金ゼロ・測定のみ）。
//
// 入力（いずれも測定側でのみ正解JSONを参照＝抽出側は正解非参照の構造的分離を維持）:
//   ・scripts/out-pdf-dims-beppu-{a,b,c,d}.json  … pdf-dim-extract.py の抽出結果（正解JSON非参照）
//   ・scripts/recordings/beppu-{a..d}-gemini-read-gemini-2.5-flash.json … AI実読み記録（2026-07-25 E2E）
//   ・scripts/beppu-room-truth.json … XLS部屋ブロック正解（1845項目検証済み）＝「拾うべき部屋」の判定に使う
//
// 測定項目:
//   (1) 部屋名   PDF vs AI平面 vs AI展開図。「PDFにあるがAI展開図に無い」＝補完余地の粗値
//   (2) 壁記号   PDF実測の種類×個数 vs AIの記号分布（特に遮/G枠＝別府の暴れ源）
//   (3) 建具符号 PDF vs AI door_schedule のカバー率
//   (4) 効果の上限 (1)の補完余地を正解の部屋ブロック有無で「拾うべき/拾わなくてよい」に分離
//   各項目に対照（PDFなしの現状値）を併記する。
//
// exit codeは常に0（回帰ゲートではない実測レポート。目標値を設けない）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const J = (f) => JSON.parse(readFileSync(join(HERE, f), 'utf-8'));

// 別府タイプ → 平面詳細図/展開図のPDFページ（1始まり・CLAUDE.md記録の対応表）。
// 抽出JSONは pdf-dim-extract.py <plan> <elev> --out=out-pdf-dims-beppu-<t>.json で生成済み。
const TYPES = [
  { t: 'A', key: 'a', plan: 36, elev: 37 },
  { t: 'B', key: 'b', plan: 38, elev: 39 },
  { t: 'C', key: 'c', plan: 40, elev: 41 },
  { t: 'D', key: 'd', plan: 42, elev: 43 },
];

const truth = J('beppu-room-truth.json');

// ---- 部屋名の正規化（src/services/buildupCalculator.js の normalizeRoomName と同一定義の複製） ----
// src非import（測定スクリプトはエンジン非接触）。将来normalizeRoomNameを変えたらここも合わせること。
function normalizeRoomName(name) {
  return String(name || '')
    .replace(/[\s　]/g, '')
    .replace(/ー/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}
// 全角英字の半角化（PDF側は'ＷＣＬ'、AI側は'WCL'。normalizeRoomNameは数字しか畳まないため追加）
const toHalfAlpha = (s) => s.replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

// 部屋名の突合キー（3ソースの表記ゆれを吸収して同一部屋を同一キーへ）。
//   PDF:'洋室１' / AI平面:'洋室1' / AI展開:'洋室1' / 正解:'洋室(１)' → すべて '洋室1'
//   PDF:'ＬＤＫ' / AI:'LDK' / 正解:'台所'（正解XLSはLDKを「台所」ブロックに記帳）→ 'LDK'（ROOM_MAPで対応）
//   PDF:'玄関'+'廊下' / AI展開:'玄関・廊下' → 玄関系は '玄関' に寄せる（正解も玄関1ブロックに合算）
function roomKey(raw) {
  let s = toHalfAlpha(normalizeRoomName(raw)).toUpperCase();
  s = s.replace(/[()]/g, '');            // 洋室(1) → 洋室1
  s = s.replace(/[・･]/g, '');            // 玄関・廊下 → 玄関廊下
  if (/^玄関/.test(s) || s === '廊下' || s === 'ホール' || s === '玄関廊下') return '玄関';
  if (/^(LDK|台所|キッチン|DK)/.test(s)) return 'LDK';
  if (/^洋室1/.test(s)) return '洋室1';
  if (/^洋室2/.test(s)) return '洋室2';
  if (/^洋室3/.test(s)) return '洋室3';
  if (/^洋室$/.test(s)) return '洋室?';   // 番号なし（PDF凡例・注記由来）＝部屋実体に紐づかない
  if (/^(洗面|パウダ)/.test(s)) return '洗面';
  if (/^(トイレ|便所|WC)$/.test(s)) return 'トイレ';
  if (/^(UB|浴室|ユニットバス)/.test(s)) return 'UB';
  return s;
}

// PDF抽出の部屋語のうち、住戸内の部屋を指さないもの（共用部・注記・凡例）。
// 「PDFで補える」件数を水増ししないため測定前に除く（判断根拠を各語に明記）。
const PDF_ROOM_NOISE = new Set([
  '共用廊下',   // 住戸外（共用部）
  'EVホール',   // 住戸外（共用部）
  'バルコニー', // 屋外（正解に壁ボード行なし）
  '3LDK', '2LDK', // 間取りタイプ表記（部屋名でない）
  '洋室?',      // 番号なしの'洋室'＝凡例/注記語（実部屋に紐づかない）
]);

// 正解（XLS）の部屋ブロック名 → 突合キー。正解は玄関/和室/洋室(1)(2)(3)/台所/便所/洗面所/押入/物入(1)の
// 10スロット固定テンプレート（タイプにより中身が空のスロットあり）。
//
// 【主スコープ】エンジンが現在出力している壁ボード4部位（集計表 r54/r56/r58/r60 に対応）。
const TRUTH_WALL_PARTS = new Set(['壁（ボ－ド）', '壁（ﾎﾞ-ﾄﾞ）', '遮音壁ＰＢ張り', '遮音壁耐水ＰＢ張']);
// 【副スコープ】主スコープ外だが**壁面のボード張り**として実在する部位（A〜Dの全部位名を列挙して確認）。
//   これを見ないと「拾うべき部屋」の判定が甘くなる（実測でB洋室(3)=界壁耐水PB 11.42㎡のみ・
//   A/B物入(1)=EV面遮音壁 8.02/13.93㎡のみ、という主スコープ0の部屋が実在した）。
//   ※ 部分界壁/界壁（耐水ＰＢ）/防露ふかし壁（ＰＢ）/EV面遮音壁（界壁）/壁（不燃材）。
//   エンジンでは 防露ふかし壁→ev_wall_pb / EV面遮音壁→界壁系 に相当し、資材行の対応は部位ごとに違う。
const TRUTH_WALL_PARTS_SECONDARY = new Set([
  '部分界壁', '界壁（耐水ＰＢ）', '防露ふかし壁（ＰＢ）', 'EV面遮音壁（界壁）', '壁（不燃材）',
]);
const stripSp = (s) => String(s).replace(/[\s　]/g, '');

/** 正解の「壁系部位を実際に持つ部屋」＝拾うべき部屋（キー→{主スコープ㎡, 副スコープ㎡}） */
function truthWallRooms(type, { includeSecondary = false } = {}) {
  const out = new Map();
  for (const room of truth.types[type].rooms) {
    let sqm = 0, sqm2 = 0;
    for (const b of room.blocks) {
      const p = stripSp(b.part);
      if (TRUTH_WALL_PARTS.has(p)) sqm += Number(b.subtotal_P) || 0;
      else if (TRUTH_WALL_PARTS_SECONDARY.has(p)) sqm2 += Number(b.subtotal_P) || 0;
    }
    const total = includeSecondary ? sqm + sqm2 : sqm;
    if (total > 0) {
      out.set(roomKey(room.name), {
        name: room.name,
        sqm: Math.round(total * 100) / 100,
        primary: Math.round(sqm * 100) / 100,
        secondary: Math.round(sqm2 * 100) / 100,
      });
    }
  }
  return out;
}

// ---- 壁記号: 別府1文字記号（PDF）とAIコード語彙の対応 ----
// 別府凡例（p48実測・CLAUDE.md記録）: 丸囲み1文字Ａ〜Ｇ＋遮。AI側は '遮'/'G枠'（別府マーカー）と
// アルファ由来の3桁（C04/I14/G24/D64）が混在する。ここでは**遮音系だけ**を厳密に対応づけ、
// 他はAI語彙の分布を並記するに留める（1文字Ａ〜Ｇ ↔ 3桁の写像は凡例が別体系のため機械確定できない）。
const AI_SOUND_CODES = new Set(['遮', 'G枠']); // isBeppuSoundCode相当（別府の戸境二重壁）
const PDF_SOUND_CHAR = '遮';                    // PDF側の遮音記号（丸囲み'遮'）
const PDF_G_CHAR = 'Ｇ';                        // PDF側の'Ｇ'（凡例=戸境二重壁 胴縁+PB9.5+GW24K）

// 【重要・第9段で判明】PDFの1文字記号68件の過半は**凡例表/仕上表のセル**であって
//   図面上の壁への配置ではない（A実測: x=745〜777 y=70〜162 に 7行×5列 のＡ〜Ｇ格子＝壁仕上凡例表、
//   さらに y≈484 に Ａ〜Ｇ が7個並ぶ行＝室仕上表のヘッダ）。
//   第1段の記録「壁記号68件」はこの表セルを含んだ数＝配置記号としては過大だった（本段で訂正）。
//   表セルの機械判別: 同一y帯（±LEGEND_BAND_PT）または同一x列に LEGEND_MIN_CELLS 個以上が整列。
//   図面上の実配置記号は壁に沿って散らばるため、この密度で整列しない。
//   ※ 閾値4は「Ａ〜Ｇ7種の表なら1行/1列に4個以上並ぶ」という表構造由来。実配置側の最大整列数は
//     実測でA=3（y≈413/448/473の壁沿い）＝谷が空いており一致率を見て選んだ値ではない。
const LEGEND_BAND_PT = 2.0;
const LEGEND_MIN_CELLS = 4;

/** 1文字記号を「凡例/仕上表セル」と「図面上の配置」に分離する（座標整列による機械判別） */
function splitLegendCells(wallCodes) {
  const byBand = (idx) => {
    const m = new Map();
    for (const w of wallCodes) {
      const k = Math.round((w.bbox[idx] + w.bbox[idx + 2]) / 2 / LEGEND_BAND_PT);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(w);
    }
    return m;
  };
  const flagged = new Set();
  for (const idx of [0, 1]) {          // 0=x列整列, 1=y行整列
    for (const group of byBand(idx).values()) {
      if (group.length >= LEGEND_MIN_CELLS) for (const w of group) flagged.add(w);
    }
  }
  return {
    legend: wallCodes.filter((w) => flagged.has(w)),
    placed: wallCodes.filter((w) => !flagged.has(w)),
  };
}

const num = (n) => (Number.isFinite(n) ? n : 0);
const pct = (a, b) => (b > 0 ? ((100 * a) / b).toFixed(1) + '%' : 'n/a');
const pad = (s, n) => String(s).padEnd(n, ' ');
const padJ = (s, n) => String(s).padEnd(n, '　'); // 全角詰め

console.log('=== レバー1第9段: PDFテキスト層ラベル（部屋名/壁記号/建具符号）の補完力測定 ===');
console.log('対象: 別府A〜D（PDFテキスト層 vs Gemini実読み記録 2026-07-25 vs XLS部屋ブロック正解）');
console.log('スコープ: 帰属不要の情報のみ。**寸法の部屋帰属は第7/8段で否と確定済み＝本測定の対象外**');
console.log('課金ゼロ・測定のみ（エンジン非import・exit常に0）\n');

const summary = [];

for (const spec of TYPES) {
  const pdf = J(`out-pdf-dims-beppu-${spec.key}.json`);
  const ai = J(`recordings/beppu-${spec.key}-gemini-read-gemini-2.5-flash.json`);
  const planPage = pdf.extracted_pages[String(spec.plan)];
  const elevPage = pdf.extracted_pages[String(spec.elev)];

  console.log('='.repeat(96));
  console.log(`### ${spec.t}タイプ（PDF平面 p${spec.plan} / PDF展開 p${spec.elev}）`);
  console.log('='.repeat(96));

  // ================= (1) 部屋名 =================
  // PDF側は同一部屋名が複数箇所に出る（室名+設備注記等）ので集合化して数える。
  const pdfPlanRooms = new Map(); // key -> 生テキストのセット
  for (const r of planPage.rooms) {
    const k = roomKey(r.text);
    if (!pdfPlanRooms.has(k)) pdfPlanRooms.set(k, new Set());
    pdfPlanRooms.get(k).add(r.text);
  }
  const pdfElevRooms = new Set(elevPage.rooms.map((r) => roomKey(r.text)));
  const aiPlanRooms = new Set((ai.rooms || []).map((r) => roomKey(r.name)));
  const aiElevRooms = new Set(((ai.elevations || {}).rooms || []).map((r) => roomKey(r.name)));
  const aiWfcRooms = new Set((ai.wall_finish_codes || []).map((w) => roomKey(w.room)));

  const pdfPlanKeys = [...pdfPlanRooms.keys()].filter((k) => !PDF_ROOM_NOISE.has(k));
  const pdfNoise = [...pdfPlanRooms.keys()].filter((k) => PDF_ROOM_NOISE.has(k));
  const tw = truthWallRooms(spec.t);                              // 主スコープ（壁ボード4部位）
  const twAll = truthWallRooms(spec.t, { includeSecondary: true }); // 主+副（界壁/EV面/防露/不燃材 込み）

  console.log('\n--- (1) 部屋名の突合');
  console.log(`  PDF平面(除ノイズ) ${pdfPlanKeys.length}種: [${pdfPlanKeys.join(', ')}]`);
  console.log(`    └ 除外したPDF語(住戸外/注記) ${pdfNoise.length}種: [${pdfNoise.join(', ') || 'なし'}]`);
  console.log(`  PDF展開 ${pdfElevRooms.size}種: [${[...pdfElevRooms].join(', ')}]`);
  console.log(`  AI平面  ${aiPlanRooms.size}種: [${[...aiPlanRooms].join(', ')}]`);
  console.log(`  AI展開  ${aiElevRooms.size}種: [${[...aiElevRooms].join(', ')}]`);
  console.log(`  正解(壁系部位を持つ=拾うべき) ${tw.size}種: [${[...tw.entries()].map(([k, v]) => `${k}(${v.sqm}㎡)`).join(', ')}]`);

  // 補完余地の粗値: PDF平面にあってAI展開に無い
  const gapRaw = pdfPlanKeys.filter((k) => !aiElevRooms.has(k));
  // 対照(PDFなしの現状): AI平面にあってAI展開に無い ＝ 現行パイプラインが既に持っている情報だけで分かる欠落
  const gapAiOnly = [...aiPlanRooms].filter((k) => !aiElevRooms.has(k));

  console.log(`\n  [補完余地 粗値] PDF平面にあってAI展開に無い: ${gapRaw.length}件 [${gapRaw.join(', ') || 'なし'}]`);
  console.log(`  [対照 PDFなし]  AI平面にあってAI展開に無い: ${gapAiOnly.length}件 [${gapAiOnly.join(', ') || 'なし'}]`);
  const pdfOnlyGap = gapRaw.filter((k) => !aiPlanRooms.has(k));
  console.log(`  [PDF固有の上積み] 上記のうちAI平面も読めていない部屋: ${pdfOnlyGap.length}件 [${pdfOnlyGap.join(', ') || 'なし'}]`);

  // ================= (4) 効果の上限（正解で分離） =================
  // 「拾うべきなのにAI展開図に無い」＝補完が実際に数量へ効きうる件数。
  // 「正解に壁系部位が無い部屋」を補完しても数量は増えない（むしろ収納は除外対象＝入れると害）。
  const gapNeeded = gapRaw.filter((k) => tw.has(k));
  const gapUseless = gapRaw.filter((k) => !tw.has(k));
  // AI展開が読めている部屋のうち、正解でも拾うべき部屋（現状の充足）
  const covered = [...tw.keys()].filter((k) => aiElevRooms.has(k));
  const missing = [...tw.keys()].filter((k) => !aiElevRooms.has(k));
  // 欠落のうちPDFで所在が分かるもの／PDFでも分からないもの
  const missingPdfKnown = missing.filter((k) => pdfPlanKeys.includes(k) || pdfElevRooms.has(k));
  const missingPdfUnknown = missing.filter((k) => !(pdfPlanKeys.includes(k) || pdfElevRooms.has(k)));
  const missSqm = (arr) => Math.round(arr.reduce((s, k) => s + tw.get(k).sqm, 0) * 100) / 100;

  console.log('\n--- (4) 補完余地の分離（正解の部屋ブロック有無で「効く/効かない」を分ける）');
  console.log(`  正解で拾うべき部屋 ${tw.size}件 のうち`);
  console.log(`    AI展開が読めている  : ${covered.length}件 [${covered.join(', ') || 'なし'}] = ${missSqm(covered)}㎡`);
  console.log(`    AI展開が落としている: ${missing.length}件 [${missing.join(', ') || 'なし'}] = ${missSqm(missing)}㎡`);
  console.log(`      ├ PDFで所在が分かる（＝部屋名を渡せば探させられる）: ${missingPdfKnown.length}件`
    + ` [${missingPdfKnown.join(', ') || 'なし'}] = ${missSqm(missingPdfKnown)}㎡`);
  console.log(`      └ PDFにも部屋名が無い（＝PDFでも補えない）        : ${missingPdfUnknown.length}件`
    + ` [${missingPdfUnknown.join(', ') || 'なし'}] = ${missSqm(missingPdfUnknown)}㎡`);
  console.log(`  補完しても数量に効かない部屋（正解に壁系部位なし）: ${gapUseless.length}件 [${gapUseless.join(', ') || 'なし'}]`);
  console.log(`  ※ 収納系(SCL/WCL/押入/物入)は BEPPU_CLOSET_SCOPE_ROOM_RE で除外対象＝補完すると害になる側`);

  // 副スコープ込みの再判定（主スコープ0だが界壁/EV面/防露のボードを持つ部屋を落としていないか）
  const extraRooms = [...twAll.entries()].filter(([k, v]) => !tw.has(k) && v.secondary > 0);
  if (extraRooms.length) {
    console.log(`\n  [副スコープ] 主スコープ0だが壁面ボードを持つ部屋 ${extraRooms.length}件:`);
    for (const [k, v] of extraRooms) {
      const inElev = aiElevRooms.has(k), inPdf = pdfPlanKeys.includes(k) || pdfElevRooms.has(k);
      console.log(`    ${v.name}（key=${k}）副スコープ${v.secondary}㎡`
        + ` | AI展開:${inElev ? '読めた' : '落とした'} | PDF部屋名:${inPdf ? 'あり' : 'なし'}`);
    }
    const missing2 = extraRooms.filter(([k]) => !aiElevRooms.has(k));
    const missing2Pdf = missing2.filter(([k]) => pdfPlanKeys.includes(k) || pdfElevRooms.has(k));
    console.log(`    → AI展開が落とした ${missing2.length}件`
      + `（うちPDF部屋名で所在が分かる ${missing2Pdf.length}件`
      + ` = ${Math.round(missing2Pdf.reduce((s, [, v]) => s + v.secondary, 0) * 100) / 100}㎡）`);
    console.log(`    ※ これらは「AIが部屋を見落とした」のではなく**部屋名で辿れない部位**の可能性が高い`);
    console.log(`       （XLSは10スロット固定テンプレートで、空きスロットを界壁行の置き場に使う。`);
    console.log(`        実測: B洋室(3)は界壁（耐水ＰＢ）1ブロックのみ＝Bは2LDKで洋室3は物理的に存在しない。`);
    console.log(`        物入(1)のEV面遮音壁（界壁）も部屋の壁でなくEV面の界壁）＝**PDF部屋名では原理的に補えない**`);
  }

  // --- 突合キー写像の監査（over-mergeで欠落を隠していないことの確認） ---
  // 正解の各部屋名がどのキーへ落ちたか、同一キーに複数の正解部屋が衝突していないかを出す。
  const collide = new Map();
  for (const room of truth.types[spec.t].rooms) {
    const k = roomKey(room.name);
    if (!collide.has(k)) collide.set(k, []);
    collide.get(k).push(room.name);
  }
  const collisions = [...collide.entries()].filter(([, v]) => v.length > 1);
  console.log(`\n  [写像監査] 正解部屋→キー: `
    + [...collide.entries()].map(([k, v]) => `${v.join('+')}→${k}`).join(' / '));
  console.log(`    キー衝突（複数の正解部屋が同一キー）: `
    + (collisions.length ? collisions.map(([k, v]) => `${k}←[${v.join(',')}]`).join(' ') : 'なし'));

  // ================= (2) 壁記号 =================
  const { legend: pdfLegendCells, placed: pdfPlacedCodes } = splitLegendCells(planPage.wall_codes);
  const pdfCodeCountAll = {};
  for (const w of planPage.wall_codes) pdfCodeCountAll[w.text] = (pdfCodeCountAll[w.text] || 0) + 1;
  const pdfCodeCount = {};   // 凡例表セルを除いた「図面上の配置記号」
  for (const w of pdfPlacedCodes) pdfCodeCount[w.text] = (pdfCodeCount[w.text] || 0) + 1;
  const pdfLegendCount = {};
  for (const w of pdfLegendCells) pdfLegendCount[w.text] = (pdfLegendCount[w.text] || 0) + 1;
  const pdfSound = num(pdfCodeCount[PDF_SOUND_CHAR]);
  const pdfG = num(pdfCodeCount[PDF_G_CHAR]);

  // AI側: 遮/G枠の検出個数を2経路（wall_finish_codes.placements / elevations.plan_placements / faces.wall_code）で数える。
  // エンジンは①plan_placements ②face.wall_code の2経路で遮音を計上する（buildupCalculator.js）ので両方出す。
  const aiCodeCount = {};
  for (const w of ai.wall_finish_codes || []) {
    for (const p of w.placements || []) aiCodeCount[p.code] = (aiCodeCount[p.code] || 0) + 1;
  }
  const aiElevPlacementCount = {};
  const aiFaceCodeCount = {};
  for (const r of ((ai.elevations || {}).rooms) || []) {
    for (const p of r.plan_placements || []) aiElevPlacementCount[p.code] = (aiElevPlacementCount[p.code] || 0) + 1;
    for (const f of r.faces || []) if (f.wall_code) aiFaceCodeCount[f.wall_code] = (aiFaceCodeCount[f.wall_code] || 0) + 1;
  }
  const sumSound = (obj) => [...AI_SOUND_CODES].reduce((s, c) => s + num(obj[c]), 0);

  console.log('\n--- (2) 壁記号の突合（PDFは丸囲み1文字Ａ〜Ｇ＋遮・AIは別府マーカー遮/G枠＋アルファ3桁の混在）');
  console.log(`  PDF平面の1文字記号 計${planPage.wall_codes.length}件: `
    + Object.entries(pdfCodeCountAll).sort().map(([k, v]) => `${k}=${v}`).join(' '));
  console.log(`    ├ 凡例表/仕上表セル（座標整列で機械判別）${pdfLegendCells.length}件: `
    + Object.entries(pdfLegendCount).sort().map(([k, v]) => `${k}=${v}`).join(' '));
  console.log(`    └ **図面上の配置記号** ${pdfPlacedCodes.length}件: `
    + Object.entries(pdfCodeCount).sort().map(([k, v]) => `${k}=${v}`).join(' '));
  console.log(`    ※ 第1段の記録「壁記号68件」は凡例表セル込みの数＝配置記号としては過大（本段で訂正）`);
  console.log(`  AI wall_finish_codes.placements 計${Object.values(aiCodeCount).reduce((a, b) => a + b, 0)}件: `
    + Object.entries(aiCodeCount).sort().map(([k, v]) => `${k}=${v}`).join(' '));
  console.log(`  AI elevations.plan_placements   計${Object.values(aiElevPlacementCount).reduce((a, b) => a + b, 0)}件: `
    + (Object.entries(aiElevPlacementCount).sort().map(([k, v]) => `${k}=${v}`).join(' ') || 'なし'));
  console.log(`  AI elevations.faces.wall_code   計${Object.values(aiFaceCodeCount).reduce((a, b) => a + b, 0)}件: `
    + (Object.entries(aiFaceCodeCount).sort().map(([k, v]) => `${k}=${v}`).join(' ') || 'なし'));
  console.log(`\n  【遮音系の個数比較（別府の暴れ源）】`);
  console.log(`    PDF実測: 遮=${pdfSound}個 / Ｇ=${pdfG}個（凡例Ｇ=戸境二重壁 胴縁+PB9.5+GW24K）→ 戸境系計 ${pdfSound + pdfG}個`);
  console.log(`    AI読み : wfc経路 遮/G枠=${sumSound(aiCodeCount)}個`
    + ` / 展開図経路=${sumSound(aiElevPlacementCount)}個 / face経路=${sumSound(aiFaceCodeCount)}個`);
  const aiSoundMax = Math.max(sumSound(aiCodeCount), sumSound(aiElevPlacementCount), sumSound(aiFaceCodeCount));
  console.log(`    差分   : AI最大経路 ${aiSoundMax}個 − PDF戸境系 ${pdfSound + pdfG}個 = ${aiSoundMax - (pdfSound + pdfG)}個`
    + `（正=AIの過剰検出 / 負=AIの取り漏れ）`);

  // 【壁記号を使うには部屋帰属が要る】記号は「どの部屋のどの壁に付くか」で初めて数量になる。
  // 記号自体は帰属不要で取れるが、**使うには帰属が要る**＝第8段で否と出た問題に戻る。
  // ここでは配置記号ごとの最寄り部屋名までの距離を出し、帰属の見込みを測る（対照: 部屋ラベル間の典型距離）。
  const scaleMmPerPt = 60.0; // 1/60（第5段で機械推定した縮尺・ここでは距離の目安表示にのみ使用）
  const roomPts = planPage.rooms
    .filter((r) => !PDF_ROOM_NOISE.has(roomKey(r.text)))
    .map((r) => ({ k: roomKey(r.text), cx: (r.bbox[0] + r.bbox[2]) / 2, cy: (r.bbox[1] + r.bbox[3]) / 2 }));
  const nearestRoom = (w) => {
    const cx = (w.bbox[0] + w.bbox[2]) / 2, cy = (w.bbox[1] + w.bbox[3]) / 2;
    let best = null, bd = Infinity;
    for (const r of roomPts) {
      const d = Math.hypot(cx - r.cx, cy - r.cy);
      if (d < bd) { bd = d; best = r.k; }
    }
    return { room: best, distPt: bd, distMm: bd * scaleMmPerPt };
  };
  const soundPlaced = pdfPlacedCodes.filter((w) => w.text === PDF_SOUND_CHAR || w.text === PDF_G_CHAR);
  console.log(`\n  【配置記号の部屋帰属の見込み】遮/Ｇ の配置記号 ${soundPlaced.length}件について最寄り部屋名までの距離`);
  const distBuckets = { '≤1500mm': 0, '≤3000mm': 0, '≤6000mm': 0, '>6000mm': 0 };
  for (const w of soundPlaced) {
    const n = nearestRoom(w);
    const b = n.distMm <= 1500 ? '≤1500mm' : n.distMm <= 3000 ? '≤3000mm' : n.distMm <= 6000 ? '≤6000mm' : '>6000mm';
    distBuckets[b]++;
    console.log(`    ${w.text} → 最寄り「${n.room}」 ${n.distMm.toFixed(0)}mm (${n.distPt.toFixed(0)}pt)`);
  }
  console.log(`    分布: ` + Object.entries(distBuckets).map(([k, v]) => `${k}=${v}`).join(' ')
    + `（1500mm以内でないと部屋の一意特定は困難＝第8段と同じ帰属の壁）`);

  // 【個数のキャリブレーション】PDF配置記号の個数が正解のどの粒度に対応するかを見る。
  //   帰属できなくても「戸あたり戸境壁が何本あるか」の**総数の当たり**としては使える可能性があるため。
  let soundRooms = 0, soundSegs = 0;
  for (const room of truth.types[spec.t].rooms) {
    let n = 0;
    for (const b of room.blocks) {
      if (stripSp(b.part) !== '遮音壁ＰＢ張り') continue;
      for (const f of Object.values(b.faces || {})) for (const s of f) if (!s.ded) n++;
    }
    if (n > 0) { soundRooms++; soundSegs += n; }
  }
  console.log(`    [個数キャリブレーション] 正解の遮音壁PB: ${soundRooms}部屋 / ${soundSegs}セグメント(控除除く)`
    + ` vs PDF配置記号 ${soundPlaced.length}件 vs AI最大 ${aiSoundMax}件`);
  console.log(`      → PDF記号数はセグメント数(${soundSegs})より部屋数(${soundRooms})に近い＝記号は壁走り1本につき1個の粒度`);

  // ================= (3) 建具符号 =================
  // PDF側: 'ＷＤ'語+隣接数字。凡例欄の説明用サンプル（'木製建具記号を示す'の近傍）も1件混じる。
  const pdfDoorSyms = [...new Set(planPage.door_symbols.map((d) => d.symbol))].sort();
  const pdfDoorCount = planPage.door_symbols.length;
  const aiDoors = (ai.door_schedule || []).map((d) => String(d.symbol || ''));
  // 符号正規化: 'WD-1' ↔ 'WD1'（PDF側はハイフンが別語or図形のため落ちる）
  const normDoor = (s) => toHalfAlpha(String(s)).toUpperCase().replace(/[-‐－ー\s]/g, '');
  const aiDoorSet = new Set(aiDoors.map(normDoor));
  const pdfDoorSet = new Set(pdfDoorSyms.map(normDoor));
  const doorHit = [...pdfDoorSet].filter((s) => aiDoorSet.has(s));
  const doorPdfOnly = [...pdfDoorSet].filter((s) => !aiDoorSet.has(s));
  const doorAiOnly = [...aiDoorSet].filter((s) => !pdfDoorSet.has(s));

  console.log('\n--- (3) 建具符号の突合');
  console.log(`  PDF平面 ${pdfDoorCount}件（ユニーク${pdfDoorSet.size}種）: [${[...pdfDoorSet].sort().join(', ')}]`);
  console.log(`    ※ 'WD0'は凡例欄の説明サンプル（'木製建具記号を示す'の近傍・実配置でない）＝抽出の既知ノイズ`);
  console.log(`  AI door_schedule ${aiDoors.length}件（ユニーク${aiDoorSet.size}種）: [${[...aiDoorSet].sort().join(', ')}]`);
  console.log(`  PDF符号のうちAIが持つもの: ${doorHit.length}/${pdfDoorSet.size} (${pct(doorHit.length, pdfDoorSet.size)})`);
  console.log(`  PDFのみ（AIに無い）: [${doorPdfOnly.sort().join(', ') || 'なし'}]`);
  console.log(`  AIのみ（PDF平面に無い）: ${doorAiOnly.length}種 [${doorAiOnly.sort().join(', ')}]`);
  console.log(`  ※ AIのdoor_scheduleは全タイプ共通の建具表ページ(p69)由来＝A〜Dで同一20件。`);
  console.log(`     PDF平面の符号は「どの符号がこの住戸のどこに在るか」の**配置情報**で、性質が異なる`);

  const covered2 = [...twAll.keys()].filter((k) => aiElevRooms.has(k));
  const missing2All = [...twAll.keys()].filter((k) => !aiElevRooms.has(k));
  const missing2Pdf = missing2All.filter((k) => pdfPlanKeys.includes(k) || pdfElevRooms.has(k));
  summary.push({
    type: spec.t,
    twAll: twAll.size, covered2: covered2.length, missing2: missing2All.length,
    missing2Pdf: missing2Pdf.length,
    missing2Sqm: Math.round(missing2All.reduce((s, k) => s + twAll.get(k).sqm, 0) * 100) / 100,
    truthRooms: tw.size, covered: covered.length, missing: missing.length,
    missingPdfKnown: missingPdfKnown.length, missingPdfUnknown: missingPdfUnknown.length,
    missSqm: missSqm(missing), knownSqm: missSqm(missingPdfKnown),
    gapRaw: gapRaw.length, gapUseless: gapUseless.length, pdfOnlyGap: pdfOnlyGap.length,
    pdfSound: pdfSound + pdfG, aiSound: aiSoundMax,
    pdfCodesAll: planPage.wall_codes.length, pdfCodesLegend: pdfLegendCells.length,
    pdfCodesPlaced: pdfPlacedCodes.length,
    soundNear1500: distBuckets['≤1500mm'], soundPlaced: soundPlaced.length,
    doorHit: doorHit.length, doorTotal: pdfDoorSet.size,
  });
  console.log('');
}

// ================= 総括 =================
console.log('='.repeat(96));
console.log('### 総括（A〜D）');
console.log('='.repeat(96));
console.log('\n[部屋名] 正解で拾うべき部屋に対するAI展開図の充足と、PDF部屋名で補える量');
console.log('  type | 拾うべき | AI読めた | 落とした | PDFで所在判明 | PDFでも不明 | 落とした㎡ | うちPDF既知㎡');
let sT = 0, sC = 0, sM = 0, sK = 0, sU = 0, sMS = 0, sKS = 0;
for (const s of summary) {
  console.log(`  ${pad(s.type, 4)} | ${pad(s.truthRooms, 8)} | ${pad(s.covered, 8)} | ${pad(s.missing, 8)} |`
    + ` ${pad(s.missingPdfKnown, 13)} | ${pad(s.missingPdfUnknown, 11)} | ${pad(s.missSqm, 10)} | ${s.knownSqm}`);
  sT += s.truthRooms; sC += s.covered; sM += s.missing;
  sK += s.missingPdfKnown; sU += s.missingPdfUnknown; sMS += s.missSqm; sKS += s.knownSqm;
}
console.log(`  ${pad('計', 4)} | ${pad(sT, 8)} | ${pad(sC, 8)} | ${pad(sM, 8)} | ${pad(sK, 13)} | ${pad(sU, 11)} |`
  + ` ${pad(Math.round(sMS * 100) / 100, 10)} | ${Math.round(sKS * 100) / 100}`);
console.log(`\n  AI展開図の充足率: ${sC}/${sT} = ${pct(sC, sT)}`);
console.log(`  PDF部屋名で「探させられる」欠落: ${sK}/${sM} = ${pct(sK, sM)}（欠落全体の面積 ${Math.round(sMS * 100) / 100}㎡ 中 ${Math.round(sKS * 100) / 100}㎡）`);
console.log(`  PDFでも所在不明の欠落: ${sU}/${sM} = ${pct(sU, sM)}`);

console.log('\n[部屋名・副スコープ込み] 界壁/EV面遮音壁/防露ふかし壁/不燃材も「壁面ボード」に数えた場合');
console.log('  type | 拾うべき | AI読めた | 落とした | うちPDFで所在判明 | 落とした㎡');
let s2T = 0, s2C = 0, s2M = 0, s2K = 0, s2S = 0;
for (const s of summary) {
  console.log(`  ${pad(s.type, 4)} | ${pad(s.twAll, 8)} | ${pad(s.covered2, 8)} | ${pad(s.missing2, 8)} |`
    + ` ${pad(s.missing2Pdf, 17)} | ${s.missing2Sqm}`);
  s2T += s.twAll; s2C += s.covered2; s2M += s.missing2; s2K += s.missing2Pdf; s2S += s.missing2Sqm;
}
console.log(`  ${pad('計', 4)} | ${pad(s2T, 8)} | ${pad(s2C, 8)} | ${pad(s2M, 8)} | ${pad(s2K, 17)} | ${Math.round(s2S * 100) / 100}`);
console.log(`  充足率 ${s2C}/${s2T} = ${pct(s2C, s2T)} / PDFで所在が分かる欠落 ${s2K}/${s2M} = ${pct(s2K, s2M)}`);

console.log('\n[壁記号] PDF1文字記号の内訳（凡例表セルの分離＝第1段記録の訂正）');
console.log('  type | 抽出計 | 凡例表セル | 図面上の配置 | 凡例比率');
for (const s of summary) {
  console.log(`  ${pad(s.type, 4)} | ${pad(s.pdfCodesAll, 6)} | ${pad(s.pdfCodesLegend, 10)} | ${pad(s.pdfCodesPlaced, 12)} |`
    + ` ${pct(s.pdfCodesLegend, s.pdfCodesAll)}`);
}

console.log('\n[壁記号] 遮音系（戸境二重壁）の個数: PDF配置記号 vs AI最大経路');
console.log('  type | PDF配置(遮+Ｇ) | AI(最大経路) | 差 | 判定 | うち部屋ラベル≤1500mm');
for (const s of summary) {
  const d = s.aiSound - s.pdfSound;
  console.log(`  ${pad(s.type, 4)} | ${pad(s.pdfSound, 14)} | ${pad(s.aiSound, 12)} | ${pad(d >= 0 ? '+' + d : d, 3)} |`
    + ` ${pad(d > 0 ? 'AI過剰検出' : d < 0 ? 'AI取り漏れ' : '一致', 10)} | ${s.soundNear1500}/${s.soundPlaced}`);
}
const totPlaced = summary.reduce((a, s) => a + s.soundPlaced, 0);
const totNear = summary.reduce((a, s) => a + s.soundNear1500, 0);
console.log(`  [計] 遮/Ｇ配置記号 ${totPlaced}件中、部屋ラベル1500mm以内 ${totNear}件 = ${pct(totNear, totPlaced)}`
  + ` ＝ 記号は取れても**どの部屋の壁か**は座標近接では決まらない（第8段と同じ帰属の壁）`);

console.log('\n[建具符号] PDF平面の配置符号をAIのdoor_scheduleがカバーする率');
for (const s of summary) console.log(`  ${s.type}: ${s.doorHit}/${s.doorTotal} (${pct(s.doorHit, s.doorTotal)})`);

console.log('\n[補完余地の粗値と正味]');
console.log('  type | 粗値(PDF平面−AI展開) | うち数量に効く | うち効かない | AI平面も読めてないPDF固有分');
for (const s of summary) {
  const eff = s.gapRaw - s.gapUseless;
  console.log(`  ${pad(s.type, 4)} | ${pad(s.gapRaw, 20)} | ${pad(eff, 14)} | ${pad(s.gapUseless, 12)} | ${s.pdfOnlyGap}`);
}
console.log('\n' + '='.repeat(96));
console.log('### 結論（測定が示すこと・誇張なし）');
console.log('='.repeat(96));
console.log(`1. 部屋名: PDFの補完余地は**0件**。正解で壁系部位を持つ27部屋（A〜D計）は`);
console.log(`   AIの展開図読みが既に ${sC}/${sT}=${pct(sC, sT)} 読めている。「PDFの部屋名を渡せば読み落としが減る」の`);
console.log(`   上限値は0㎡＝**この仮説はA〜Dでは成立しない**（補完すべき対象が存在しない）。`);
console.log(`   ※ CLAUDE.md記録「展開図が平面13〜14室中6〜8室しか対応づかない」は事実だが、`);
console.log(`     落ちている室は収納・UB・バルコニー・宅配スペース等で**正解に壁ボード行が無い部屋**。`);
console.log(`     室数の欠落率は数量の欠落率ではなかった（本段で分離）。`);
console.log(`2. 壁記号: PDFの1文字記号は過半が凡例表セル。図面上の配置は約27〜34件で、`);
console.log(`   遮/Ｇの配置記号は ${totNear}/${totPlaced} しか部屋ラベル1500mm以内に無い＝**記号は取れるが帰属できない**。`);
console.log(`   帰属できない記号は数量に変換できないため、遮音PB残差の是正には**そのままでは使えない**。`);
console.log(`3. 建具符号: AIのdoor_scheduleは建具表ページ由来で全符号を網羅済み（PDF平面符号の85〜89%を包含）。`);
console.log(`   PDF側の付加価値は「符号の**配置**（どの住戸のどこにWD-8があるか）」だが、これも帰属問題に帰着する。`);
console.log(`4. 総合: 「帰属不要の情報なら補える」という期待は、**補うべき欠落がそもそも無かった**ため`);
console.log(`   効果ゼロ。第6〜8段（値照合✗・寸法帰属✗）と合わせ、レバー1で残る確定資産は`);
console.log(`   スケール校正1/60・t=120則・hasDimensionTextLayer判定・偽陽性対照の測定規律に留まる。`);
console.log('\n（本レポートは測定のみ。exit code 0固定・エンジン非接触・src非改変）');
