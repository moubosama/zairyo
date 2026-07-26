/**
 * 別府XLS タイプ別シート（Ａ〜Ｉ）の部屋ブロック正解を構造化JSON化する抽出スクリプト。
 *
 * 【置き場所の理由】xlsx(SheetJS)依存のためリポジトリ外（scratchpad）で実行する
 * （xlsxは脆弱性でリポジトリから削除済み・依存追加禁止。CLAUDE.md記載）。
 * 出力JSONは backend-node/scripts/beppu-room-truth.json（データのみ・依存なし）。
 *
 * 【シート構造（2026-07-26実測）】
 *   - 1シート=12ブロック。ブロック先頭は A列='工事名：' の行（次の同ヘッダまでがブロック）。
 *   - ヘッダ4行（工事名/タイプ/室名見出し/面ラベル Ａ〜Ｄ面）＋データ行。
 *   - 部屋名はブロック内データ行のA列（例: 玄　関）。台所ブロックは A275=台所/A276=食事室 の
 *     2ラベル、洋室ブロックは2行目に「ＣＬ」注記があるため、先頭ラベル=部屋名・残りはextra扱い。
 *   - 行種別はP列数式で機械判別:
 *       乗算行:  P = SUM(Fr+Ir+Lr+Or)  … D/E=Ａ面w/h, G/H=Ｂ面, J/K=Ｃ面, M/N=Ｄ面（F/I/L/O=面積=w*h）
 *       直入行:  P = SUM(Dr:Or)        … 巾木・際根太等（m直入力・負値=控除）
 *       小計行:  P = Pa+Pb-Pc 等       … 部位計（+行=加算・-行=控除）
 *   - 集計表C列（戸当）= タイプ別シートPセルの直接参照合算。参照P行は9タイプ全列で同一
 *     （本スクリプトが全列の数式をパースして同一性をassert）。
 *
 * 実行: node extract-beppu-room-truth.mjs
 */
import xlsx from 'xlsx';
import fs from 'node:fs';

const XLS = 'C:/Users/81804/Pictures/zairyoの資料/20260723084638/20260723084638/(仮称)別府4丁目プロジェクト（木及び_建材）R7,03,08.XLS';
const OUT = 'C:/Users/81804/Desktop/workspeace/zairyo/backend-node/scripts/beppu-room-truth.json';

const wb = xlsx.readFile(XLS, { cellFormula: true });

const TYPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const SHEET_OF = Object.fromEntries(TYPES.map((t) => [t, ({
  A: 'Ａタイプ', B: 'Ｂタイプ', C: 'Ｃタイプ', D: 'Ｄタイプ', E: 'Ｅタイプ',
  F: 'Ｆタイプ', G: 'Ｇタイプ', H: 'Ｈタイプ', I: 'Ｉタイプ',
})[t]]));

// 集計表: 10部位（beppu-9types-ground-truth.json と同キー）→ 集計表の行番号
const AGG_ROWS = {
  '際根太': 9, 'フローリング': 12, '巾木': 46, '遮音壁PB': 54, '壁PB': 56,
  '壁耐水PB': 58, '遮音壁耐水PB': 60, '間仕切GW': 71, '天井下り': 75, '天井PB': 77,
};
// 集計表の戸当列（eval-beppu-truthの実測と同じ）
const AGG_COLS = { A: 'C', B: 'E', C: 'G', D: 'I', E: 'K', F: 'M', G: 'O', H: 'Q', I: 'S' };

const round6 = (x) => Math.round(x * 1e6) / 1e6;

// ------------------------------------------------------------
// 1) 集計表の参照P行を全タイプ列からパースし、同一性をassert
// ------------------------------------------------------------
const sumSheet = wb.Sheets['集計表'];
const aggRefs = {};
for (const [part, row] of Object.entries(AGG_ROWS)) {
  let base = null;
  for (const t of TYPES) {
    const cell = sumSheet[AGG_COLS[t] + row];
    if (!cell || !cell.f) throw new Error(`集計表 ${AGG_COLS[t]}${row}（${part}/${t}）に数式なし`);
    const rows = [...cell.f.matchAll(/P(\d+)/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
    if (base == null) base = rows;
    else if (JSON.stringify(base) !== JSON.stringify(rows)) {
      throw new Error(`${part}: タイプ${t}の参照P行が他タイプと不一致 ${rows} vs ${base}`);
    }
  }
  aggRefs[part] = { agg_row: row, p_rows: base };
}

// ------------------------------------------------------------
// 2) タイプ別シートの部屋ブロック抽出
// ------------------------------------------------------------
const num = (cell) => (cell && typeof cell.v === 'number' ? cell.v : null);
const str = (cell) => (cell && cell.v != null ? String(cell.v).trim() : '');
// 室名セルの実質判定: 空白（半角/全角）と '*'（脚注マーカー行）だけなら室名ではない
const isRoomLabel = (s) => s !== '' && /[^\s*　]/.test(s);

const PROD_RE = /^SUM\(F(\d+)\+I\1\+L\1\+O\1\)$/;
const LINEAR_RE = /^SUM\(D(\d+):O\1\)$/;
const SUBTOTAL_RE = /^P\d+([+-]P\d+)*$/;

const types = {};
const warnings = [];

for (const t of TYPES) {
  const ws = wb.Sheets[SHEET_OF[t]];
  if (!ws) throw new Error(`シート ${SHEET_OF[t]} なし`);
  const range = xlsx.utils.decode_range(ws['!ref']);
  const lastRow = range.e.r + 1;

  // ブロック境界
  const headers = [];
  for (let r = 1; r <= lastRow; r++) {
    if (str(ws['A' + r]) === '工事名：') headers.push(r);
  }
  if (headers.length === 0) throw new Error(`${t}: 工事名ヘッダが見つからない`);

  // 戸数（Q列 = 現場名等!B$4 参照。最初のデータ行から）
  const households = num(ws['Q' + (headers[0] + 4)]);

  const rooms = [];
  const skippedZeroRows = [];

  for (let bi = 0; bi < headers.length; bi++) {
    const bs = headers[bi];
    const be = (bi + 1 < headers.length ? headers[bi + 1] : lastRow + 1) - 1;
    const dataStart = bs + 4;

    // 部屋名ラベル
    const labels = [];
    for (let r = dataStart; r <= be; r++) {
      const s = str(ws['A' + r]);
      if (s === '工事名：' || s === 'タイプ:' || s === '室名') continue;
      if (isRoomLabel(s)) labels.push({ row: r, name: s.replace(/[\s　]+/g, '') });
    }
    const roomName = labels.length ? labels[0].name : null;
    const extraLabels = labels.slice(1);

    // 行分類
    const prodRows = new Map();   // row -> {faces:[{face,w,h,area}]}
    const linearRows = new Map(); // row -> {values:[num...], P}
    const subtotals = [];         // {row, addRefs, dedRefs, P}
    for (let r = dataStart; r <= be; r++) {
      const p = ws['P' + r];
      if (!p || !p.f) continue;
      const f = p.f.replace(/\s+/g, '');
      let m;
      if ((m = f.match(PROD_RE))) {
        const faces = [];
        const faceCols = { A: ['D', 'E', 'F'], B: ['G', 'H', 'I'], C: ['J', 'K', 'L'], D: ['M', 'N', 'O'] };
        for (const [face, [cw, ch, ca]] of Object.entries(faceCols)) {
          const area = num(ws[ca + r]);
          if (area == null || Math.abs(area) < 1e-9) continue;
          faces.push({ face, w: round6(num(ws[cw + r]) ?? 0), h: round6(num(ws[ch + r]) ?? 0), area: round6(area) });
        }
        prodRows.set(r, { faces });
      } else if ((m = f.match(LINEAR_RE))) {
        const values = [];
        for (const col of ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O']) {
          const v = num(ws[col + r]);
          if (v != null && Math.abs(v) > 1e-9) values.push(round6(v));
        }
        linearRows.set(r, { values, P: round6(num(p) ?? 0) });
      } else if (SUBTOTAL_RE.test(f)) {
        const addRefs = []; const dedRefs = [];
        for (const term of f.match(/[+-]?P\d+/g)) {
          const row = Number(term.match(/\d+/)[0]);
          (term.startsWith('-') ? dedRefs : addRefs).push(row);
        }
        subtotals.push({ row: r, addRefs, dedRefs, P: round6(num(p) ?? 0) });
      } else {
        warnings.push(`${t} P${r}: 未知の数式 ${p.f}`);
      }
    }

    // グループ化（小計行→乗算行群 / 単独直入行）
    const consumed = new Set();
    const blocks = [];
    for (const st of subtotals) {
      const refs = [...st.addRefs, ...st.dedRefs].sort((a, b) => a - b);
      const first = refs[0];
      const facesByLabel = { A: [], B: [], C: [], D: [] };
      let any = false;
      for (const r of refs) {
        const pr = prodRows.get(r);
        consumed.add(r);
        if (!pr) continue; // 数式のない空行参照（面積0扱い）
        const ded = st.dedRefs.includes(r);
        for (const fc of pr.faces) {
          facesByLabel[fc.face].push(ded ? { ...fc, ded: true } : fc);
          any = true;
        }
      }
      if (!any && Math.abs(st.P) < 1e-9) { skippedZeroRows.push(st.row); continue; }
      blocks.push({
        part: str(ws['B' + first]) || null,
        spec: str(ws['C' + first]) || null,
        kind: 'faces',
        rows: refs,
        subtotal_row: st.row,
        subtotal_P: st.P,
        faces: facesByLabel,
      });
    }
    for (const [r, lr] of linearRows) {
      if (consumed.has(r)) continue;
      if (lr.values.length === 0 && Math.abs(lr.P) < 1e-9) { skippedZeroRows.push(r); continue; }
      blocks.push({
        part: str(ws['B' + r]) || null,
        spec: str(ws['C' + r]) || null,
        kind: 'linear',
        rows: [r],
        subtotal_row: r,
        subtotal_P: lr.P,
        values: lr.values,
      });
    }
    // 乗算行が小計に参照されず孤立していないか（構造理解の検算）
    for (const r of prodRows.keys()) {
      if (!consumed.has(r)) warnings.push(`${t} P${r}: 乗算行がどの小計にも参照されない`);
    }
    blocks.sort((a, b) => a.subtotal_row - b.subtotal_row);

    if (blocks.length === 0) continue; // 全部位0のブロック（未使用部屋）はスキップ
    rooms.push({
      name: roomName,
      block_header_row: bs,
      ...(extraLabels.length ? { extra_room_labels: extraLabels } : {}),
      blocks,
    });
  }

  types[t] = { sheet: SHEET_OF[t], households, rooms, skipped_zero_subtotal_rows: skippedZeroRows.sort((a, b) => a - b) };
}

if (warnings.length) {
  console.log('--- 警告 ---');
  warnings.forEach((w) => console.log('  ' + w));
}

// ------------------------------------------------------------
// 3) 出力
// ------------------------------------------------------------
const out = {
  _meta: {
    source_xls: XLS,
    extracted: new Date().toISOString().slice(0, 10),
    extractor: 'scratchpad/extract-beppu-room-truth.mjs（xlsx/SheetJS使用のためリポジトリ外。再現はこのXLSに対して再実行）',
    structure: [
      'タイプ別シート＝12ブロック（A列「工事名：」で区切り）。部屋名=ブロック先頭のA列ラベル（空白除去）。',
      'blocks[].kind=faces: 展開図式の面拾い。faces.A〜D=各面の{w,h,area}配列。ded:true=控除行（開口等）。',
      '  subtotal_P = Σ(加算行の面積) − Σ(控除行ded:trueの面積)（XLS小計行 P=Pa+Pb-Pc の計算値）。',
      'blocks[].kind=linear: m直入力部位（巾木・際根太等）。values=D〜O列の生値（負値=控除）。subtotal_P=Σvalues。',
      'subtotal_row=XLSの小計行番号。集計表C列（戸当正解）= _meta.agg_refs[部位].p_rows の subtotal_P 合算。',
      'p_rowsに在って本JSONに無い行は全て小計0（skipped_zero_subtotal_rowsに列挙・0部位はスキップ）。',
      '数式セルは計算値(.v)を採用。数値は6桁丸め。',
    ],
    agg_refs_note: '集計表の参照P行は9タイプ全列（C/E/G/I/K/M/O/Q/S列）で同一（抽出時にassert済み）。',
    agg_refs: aggRefs,
  },
  types,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

// サマリ
for (const t of TYPES) {
  const ty = types[t];
  const nBlocks = ty.rooms.reduce((s, r) => s + r.blocks.length, 0);
  console.log(`${t}: 部屋${ty.rooms.length}（${ty.rooms.map((r) => r.name).join('/')}）ブロック${nBlocks} 戸数${ty.households} skipped0=${ty.skipped_zero_subtotal_rows.length}`);
}
console.log('WROTE', OUT);
