// verify-elev-room-widths-beppu-a.mjs — 別府型PDF展開図(p37)の「部屋別面幅」AIなし抽出の実現可能性測定
//
// goal(2026-07-26): テキスト層の部屋ラベルと寸法数値を座標近接で対応づけ、部屋ごとの面幅候補を出し
//   正解（beppu-room-truth.json Aタイプの部屋ブロック幅）と突合して一致率を正直に報告する。
//   高一致率の強制ではなく可否の確定が目的（合わない場合は原因分析を添える）。
//
// 【入力】out-pdf-dims-beppu-a.json（pdf-dim-extract.pyの出力・正解JSON非参照で抽出済み）の p37。
//   正解JSONは突合（ラベル付け）にのみ使用（帰属ロジックには一切使わない＝既存の構造分離を維持）。
//
// 【p37レイアウト実測（このスクリプトの帰属前提）】rot=90・部屋区画は段組み:
//   ・行=ラベルx座標のクラスタ（実測 x≈22/152/282/412/541/671・ピッチ約130pt）
//   ・行内の区画=ラベルyが区画の開始。y降順に次ラベルまでが自区画（最後は行末まで）
//   ・近接ラベル（y差<70pt）は結合見出し（実測: 玄関・廊下＋（ＳＣＬ））
// 【測定のみ】エンジン非import・exit常に0。src非改変。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const page = JSON.parse(readFileSync(join(HERE, 'out-pdf-dims-beppu-a.json'), 'utf-8')).extracted_pages['37'];
const truth = JSON.parse(readFileSync(join(HERE, 'beppu-room-truth.json'), 'utf-8'));

// ── 1. 行（x帯）と区画（y範囲）の構成 ─────────────────────────────────────────
const ROW_TOL = 65;   // 行クラスタの許容（ピッチ130ptの半分）
const HEAD_MERGE = 70; // 結合見出しのy距離閾値（実測: 玄関・廊下→（ＳＣＬ）=57pt）
const labels = page.rooms.map((r) => ({ name: r.text, x: r.bbox[0], y: r.bbox[1] }));

// 行クラスタ
const rows = [];
for (const l of labels.sort((a, b) => a.x - b.x)) {
  const row = rows.find((r) => Math.abs(r.x - l.x) <= ROW_TOL);
  if (row) { row.labels.push(l); row.x = (row.x * (row.labels.length - 1) + l.x) / row.labels.length; }
  else rows.push({ x: l.x, labels: [l] });
}
rows.sort((a, b) => a.x - b.x);

// 行内: y降順に並べ、近接ラベルを結合見出しに畳んでから区画化
for (const row of rows) {
  row.labels.sort((a, b) => b.y - a.y);
  const merged = [];
  for (const l of row.labels) {
    const prev = merged[merged.length - 1];
    if (prev && prev.y - l.y < HEAD_MERGE) { prev.name += l.name; } // 結合見出し（yは先頭ラベルを維持）
    else merged.push({ ...l });
  }
  // 区画のy範囲: 自ラベルyの少し上から、次ラベルyまで（最後は0まで）
  row.sections = merged.map((m, i) => ({
    name: m.name,
    yTop: m.y + 30,                                  // ラベル自身と同じ高さの寸法も拾う余白
    yBottom: i + 1 < merged.length ? merged[i + 1].y + 30 : 0,
  }));
}
// 行のx帯: 「自ラベルx 〜 次ラベルx」（中点分割は誤り＝寸法は立面の下（x大側）に描かれるため、
// 中点だと自室の寸法が次行に落ちる。初版の実測でLDK面幅8200が洋室1区画に落ちたのはこれが原因）
for (let i = 0; i < rows.length; i++) {
  rows[i].xMin = rows[i].x - 5;
  rows[i].xMax = i + 1 < rows.length ? rows[i + 1].x - 5 : Infinity;
}

// ── 2. 寸法の帰属 ─────────────────────────────────────────────────────────────
const WIDTH_MIN = 300;
// 幅/高さの分離: チェーンの軸で判定（図面構造由来・正解は見ない）。
// rot=90ページでは 'horiz' 軸チェーン=高さ系（実測: [2200,110]=CH+床高）・'vert'=幅系。
// 除去は【インスタンス単位】（member_bboxesで照合）。値単位で消すと同じ数値の幅まで消える
// （初版の実測: 候補が12→2種/室に激減＝過修正）。チェーン未所属の寸法は幅候補に含める。
const bkey = (b) => b.map((v) => v.toFixed(1)).join(',');
const heightInstances = new Set();
for (const c of page.chains || []) {
  if (c.axis === 'horiz') for (const mb of c.member_bboxes || []) heightInstances.add(bkey(mb));
}
const assign = new Map(); // sectionName -> {direct:Set, items:[]}
for (const row of rows) for (const s of row.sections) assign.set(s.name, { direct: new Set(), items: [] });
let unassigned = 0, droppedHeights = 0;
for (const d of page.dims) {
  if (d.value_mm < WIDTH_MIN) continue;
  if (heightInstances.has(bkey(d.bbox))) { droppedHeights++; continue; } // 高さ系インスタンスは除外
  const cx = (d.bbox[0] + d.bbox[2]) / 2, cy = (d.bbox[1] + d.bbox[3]) / 2;
  const row = rows.find((r) => cx >= r.xMin && cx < r.xMax);
  const sec = row?.sections.find((s) => cy <= s.yTop && cy > s.yBottom);
  if (!sec) { unassigned++; continue; }
  const cell = assign.get(sec.name);
  cell.direct.add(d.value_mm);
  cell.items.push({ mm: d.value_mm, x: cx, y: cy });
}

// ── 3. 正解（部屋ブロック幅）との突合 ────────────────────────────────────────
// 展開図ラベル → 正解部屋名（帰属ロジック非依存・突合のみに使用）
const ROOM_MAP = {
  '玄関・廊下（ＳＣＬ）': '玄関', '玄関・廊下': '玄関',
  'ＬＤＫ': '台所', '洋室１': '洋室(１)', '洋室２': '洋室(2)', '洋室３': '洋室(3)',
  '洗面': '洗面所', 'トイレ': '便所',
};
// 正解は【壁系部位の面幅のみ】に限定する（展開図に描かれるのは壁立面＝床・天井・巾木の寸法は
// 展開図の比較対象として不公平。測定対象の適正化であり帰属ロジックには影響しない）
const WALL_PARTS = /壁|界壁|ふかし/;
const truthRoom = new Map(); // 正解部屋名 -> Set(mm)
for (const room of truth.types.A.rooms) {
  const set = new Set();
  for (const b of room.blocks || []) {
    if (!WALL_PARTS.test(b.part || '')) continue;
    for (const faceArr of Object.values(b.faces || {})) {
      for (const f of faceArr) {
        if (!f.ded && Number.isFinite(f.w)) {
          const mm = Math.round(f.w * 1000);
          if (mm >= WIDTH_MIN) set.add(mm);
        }
      }
    }
  }
  if (set.size) truthRoom.set(room.name.replace(/\s/g, ''), set);
}

const hit = (set, mm, tol) => { for (const v of set) if (Math.abs(v - mm) <= tol) return true; return false; };

console.log('=== 別府p37展開図: 部屋別面幅のAIなし抽出（テキスト層+座標近接・測定のみ） ===');
console.log(`行=${rows.length}帯（x: ${rows.map((r) => r.x.toFixed(0)).join('/')}）/ 区画=${[...assign.keys()].length} / 未帰属寸法=${unassigned}件`);
console.log('');
console.log('--- 部屋別: 正解幅のうち「その部屋に帰属した寸法」でヒットした数（±0mm / ±10mm） ---');
let totT = 0, totHit0 = 0, totHit10 = 0, totCand = 0;
// 対照: 帰属を無視した「全寸法集合」でのヒット（帰属の付加価値を測る基準線）
const allDims = new Set();
for (const d of page.dims) if (d.value_mm >= WIDTH_MIN) allDims.add(d.value_mm);
let totHitAll = 0;
for (const [elevName, truthName] of Object.entries(ROOM_MAP)) {
  const cell = assign.get(elevName);
  if (!cell) continue;
  const tset = truthRoom.get(truthName);
  if (!tset) { console.log(`  ${elevName}: 正解部屋 ${truthName} にブロックなし`); continue; }
  const tvals = [...tset];
  const h0 = tvals.filter((t) => cell.direct.has(t)).length;
  const h10 = tvals.filter((t) => hit(cell.direct, t, 10)).length;
  const hAll = tvals.filter((t) => hit(allDims, t, 10)).length;
  totT += tvals.length; totHit0 += h0; totHit10 += h10; totCand += cell.direct.size; totHitAll += hAll;
  const missed = tvals.filter((t) => !hit(cell.direct, t, 10));
  console.log(`  ${elevName.padEnd(12)}→${truthName.padEnd(7)} 正解${String(tvals.length).padStart(2)}種: `
    + `帰属候補${String(cell.direct.size).padStart(3)}種 ヒット±0 ${h0} / ±10 ${h10} (${((h10 / tvals.length) * 100).toFixed(0)}%)`
    + (missed.length ? ` 未一致:[${missed.join(',')}]` : ' 全一致'));
}
console.log(`  合計: 正解${totT}種 → 部屋帰属ヒット±10 ${totHit10} (${((totHit10 / totT) * 100).toFixed(1)}%)（±0: ${totHit0}）`);
console.log('');
console.log('--- 対照と付加価値 ---');
console.log(`  帰属なし（p37全寸法${allDims.size}種±10）でのヒット: ${totHitAll}/${totT} (${((totHitAll / totT) * 100).toFixed(1)}%)`);
console.log(`  平均候補数: 帰属あり ${(totCand / Object.keys(ROOM_MAP).length).toFixed(1)}種/室 vs 帰属なし ${allDims.size}種`
  + ` ＝ 候補の絞り込み ${(allDims.size / (totCand / Object.keys(ROOM_MAP).length)).toFixed(1)}倍`);
console.log('');
console.log('--- 参考: 各区画の帰属寸法（生データ・原因分析用） ---');
for (const [name, cell] of assign) {
  const vals = [...cell.direct].sort((a, b) => a - b);
  console.log(`  ${name.padEnd(12)} ${vals.length}種: [${vals.join(',')}]`);
}
console.log('');
console.log('※測定のみ・exit 0。一致率の解釈と原因分析は出力から行う（高一致率の強制なし）');
