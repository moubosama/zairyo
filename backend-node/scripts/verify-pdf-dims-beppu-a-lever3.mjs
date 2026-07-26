// verify-pdf-dims-beppu-a-lever3.mjs — レバー1第3段: 芯々→内法変換（壁厚差し引き）+ 部屋帰属プロトタイプの測定
//
// 役割: scripts/out-pdf-dims-beppu-a.json（pdf-dim-extract.py抽出・正解JSON非参照）と
//   scripts/beppu-room-truth.json（XLS正解）を突合し、
//   (1) 壁厚変換込み一致率（芯々寸法 d − 壁厚 t = 内法幅 の仮説）
//   (2) 部屋帰属（部屋名ラベル座標×寸法座標）による部屋単位一致率
//   を、それぞれ50mm格子ベースレート対照とセットで測定する。
//
// 答え合わせ回避の構造（第2段と同一）:
//   - 壁厚候補は抽出側（pdf-dim-extract.py thickness_candidates）が図面自身から機械導出
//     （寸法頻度クラスタ+凡例t=NNN）。「未一致を最小化する厚み」を選ぶ最適化はしない。
//   - 本スクリプトは測定のみ。エンジン(src/)非import・目標値なし・exit常に0。
//
// 【必須の対照（第2段reviewer must-fix承継）】壁厚差し引きで候補集合が約4〜30倍に膨らむため、
//   全ての「変換込み一致率」に同変換適用後collectionの50mm格子カバー率（=当てずっぽうのヒット率）を併記する。
//   実測ヒット率−格子カバー率＝シグナル強度。これが0付近なら「効かない」。
//
// 変換規則（建築の標準・どの規則かを明記）:
//   ruleA: w = d − t          … 芯々寸法から両側の壁厚t/2ずつ控除（両側同厚仮定）
//   ruleB: w = d − (t1+t2)/2  … 両側異厚（整数mmになる組のみ。ruleAを包含）
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const extracted = JSON.parse(readFileSync(join(HERE, 'out-pdf-dims-beppu-a.json'), 'utf-8'));
const truth = JSON.parse(readFileSync(join(HERE, 'beppu-room-truth.json'), 'utf-8'));

const strip = (s) => s.replace(/[\s　]/g, '');
const PART_WALL = '壁（ボ－ド）';    // 第2段と同一の測定対象（見出し継続性のため）
const PART_SOUND = '遮音壁ＰＢ張り';
// 部屋帰属用の壁ボード系part（便所/洗面所は耐水系しか壁ボード行を持たないため広めに取る。
// 半角カナ'壁（ﾎﾞ-ﾄﾞ）'=耐水PB・'遮音壁耐水ＰＢ張'=水回り遮音）
const ROOM_WALL_PARTS = new Set([PART_WALL, PART_SOUND, '遮音壁耐水ＰＢ張', '壁（ﾎﾞ-ﾄﾞ）']);

// ---- 正解収集 ----
function collectWidths(partName) {
  const add = [];
  for (const room of truth.types.A.rooms) {
    for (const b of room.blocks) {
      if (b.kind !== 'faces' || strip(b.part) !== partName) continue;
      for (const face of Object.values(b.faces)) {
        for (const seg of face) if (!seg.ded) add.push(Math.round(seg.w * 1000));
      }
    }
  }
  return add;
}
const wallW = collectWidths(PART_WALL);
const soundW = collectWidths(PART_SOUND);

// 部屋別正解（帰属測定用。canonical名へ正規化）
function canonRoom(name) {
  const n = strip(name).normalize('NFKC').replace(/[()（）・]/g, '');
  if (/^\dLDK$/.test(n)) return null;              // 「３ＬＤＫ」=住戸タイプ表記であり部屋でない
  if (/LDK|台所|キッチン/.test(n)) return '台所(LDK)';
  if (/^共用廊下/.test(n)) return null;            // 住戸外
  if (/玄関|^廊下$/.test(n)) return '玄関';        // 正解XLSの玄関ブロックは廊下を含む
  if (/^トイレ|便所/.test(n)) return '便所(トイレ)';
  if (/洗面/.test(n)) return '洗面所';
  const y = n.match(/^洋室([123１２３])$/);
  if (y) return '洋室' + y[1].normalize('NFKC');
  return null; // 対象外（UB/収納/バルコニー/番号なし洋室 等）
}
const roomTruth = new Map(); // canonical -> Set(width mm)
for (const room of truth.types.A.rooms) {
  const c = canonRoom(room.name);
  if (!c) continue;
  for (const b of room.blocks) {
    if (b.kind !== 'faces' || !ROOM_WALL_PARTS.has(strip(b.part))) continue;
    for (const face of Object.values(b.faces)) {
      for (const seg of face) {
        if (seg.ded) continue;
        if (!roomTruth.has(c)) roomTruth.set(c, new Set());
        roomTruth.get(c).add(Math.round(seg.w * 1000));
      }
    }
  }
}

// ---- 抽出側集合 ----
const pages = Object.keys(extracted.extracted_pages).map(Number).sort((a, b) => a - b);
const D = new Set(); // 直接寸法（全ページ統合）
const S = new Set(); // チェーン連続部分和（全ページ統合）
for (const pn of pages) {
  const p = extracted.extracted_pages[String(pn)];
  for (const d of p.dims) D.add(d.value_mm);
  for (const s of p.chain_run_sums) S.add(s);
}

// ---- 対照: 50mm格子カバー率（第2段と同一レンジ=正解幅の存在レンジ） ----
const allTruth = [...wallW, ...soundW];
const LO = Math.min(...allTruth), HI = Math.max(...allTruth);
function gridCoverage(set) {
  let total = 0, hit = 0;
  for (let v = LO; v <= HI; v += 50) { total++; if (set.has(v)) hit++; }
  return (100 * hit) / total;
}
const pct = (x) => x.toFixed(1) + '%';

// ---- 壁厚候補（抽出側の機械導出をそのまま使用） ----
const tc = extracted.thickness_candidates;
console.log('=== レバー1第3段: 芯々→内法変換 + 部屋帰属（別府Aタイプ・課金ゼロ） ===');
console.log('--- 壁厚候補（図面自身から機械導出・正解逆算なし）');
console.log(`  導出規則: ${tc.rule}`);
console.log(`  頻度由来: [${tc.from_freq.join(', ')}] / 凡例由来: [${tc.from_legend.join(', ')}]`);
for (const l of tc.legend_hits) console.log(`    凡例実測 p${l.page}: "${l.text.slice(0, 40)}" → t=${l.t_mm}`);
console.log(`  頻度表(50-300mm): ${JSON.stringify(tc.freq_table)}`);

// ---- 変換集合の構築と測定 ----
function convert(base, diffs) {
  const out = new Set(base);
  for (const d of base) for (const t of diffs) if (d - t > 0) out.add(d - t);
  return out;
}
function pairDiffs(ts) {
  const out = new Set(ts);
  for (const a of ts) for (const b of ts) if ((a + b) % 2 === 0) out.add((a + b) / 2);
  return [...out].sort((x, y) => x - y);
}
function measure(label, set) {
  const hit = (ws) => {
    const uniq = [...new Set(ws)];
    const h = uniq.filter((v) => set.has(v));
    return { n: uniq.length, h: h.length, miss: uniq.filter((v) => !set.has(v)).sort((a, b) => a - b) };
  };
  const w = hit(wallW), s = hit(soundW), c = hit([...wallW, ...soundW]);
  const cov = gridCoverage(set);
  const margin = (100 * c.h) / c.n - cov;
  console.log(`  ${label}: 集合${set.size}種`
    + ` | 壁PB ${w.h}/${w.n}(${pct((100 * w.h) / w.n)}) 遮音PB ${s.h}/${s.n}(${pct((100 * s.h) / s.n)})`
    + ` 合算 ${c.h}/${c.n}(${pct((100 * c.h) / c.n)})`
    + ` | 対照格子 ${pct(cov)} | シグナル ${margin >= 0 ? '+' : ''}${margin.toFixed(1)}pt`);
  return { w, s, c, cov, margin };
}

console.log(`\n--- 変換込み一致率（見出し=直接寸法ベース。レンジ${LO}〜${HI}mm・格子${Math.floor((HI - LO) / 50) + 1}点）`);
console.log('  ※シグナル=合算ヒット率−格子カバー率。第2段の直接一致は +25.3pt が基準線');
const base = measure('無変換（第2段の直接一致・基準）', D);
const T1 = tc.values;
measure(`V0 凡例のみ ruleA t∈[${tc.from_legend.join(',')}]`, convert(D, tc.from_legend));
const v1 = measure(`V1 機械導出 ruleA t∈[${T1.join(',')}]`, convert(D, T1));
const v1p = measure('V1p 機械導出 ruleB(両側異厚ペア)', convert(D, pairDiffs(T1)));
const allSmall = Object.keys(tc.freq_table).map(Number).sort((a, b) => a - b);
measure(`V2 頻度1以上全部 ruleA（${allSmall.length}厚・飽和対照）`, convert(D, allSmall));
console.log('  [参考] チェーン和込みに変換を重ねた場合（第2段時点で格子90.8%飽和のため無意味の確認）:');
measure('  V1-chain ruleA over 直接∪チェーン和', convert(new Set([...D, ...S]), T1));
console.log(`  V1残りの未一致(合算): [${v1.c.miss.join(', ')}]`);
console.log(`  V1p残りの未一致(合算): [${v1p.c.miss.join(', ')}]`);

// ---- 診断: 残る未一致に必要な差分（採用はしない・報告のみ） ----
console.log('\n--- 診断: 直接未一致の各値に必要な差分 t\'（d∈直接寸法で d−t\'=未一致値 となる t\'。採用せず報告のみ）');
const baseMiss = [...new Set([...wallW, ...soundW])].filter((v) => !D.has(v)).sort((a, b) => a - b);
for (const m of baseMiss) {
  const need = [];
  for (let t = 40; t <= 400; t += 5) if (D.has(m + t)) need.push(`${t}(→${m + t})`);
  const needChain = [];
  for (let t = 40; t <= 400; t += 5) if (S.has(m + t)) needChain.push(t);
  console.log(`  ${m}: 直接から [${need.join(' ') || 'なし'}] / チェーン和から t'=[${needChain.slice(0, 8).join(',')}${needChain.length > 8 ? '…' : ''}]`);
}

// ---- 部屋帰属プロトタイプ ----
// p36(平面詳細図・rot=90): 部屋名ラベル中心の矩形近傍 ±R pt（R=80/120/160の感度を併記）
// p37(展開図・rot=90): ラベルは各段組列の下端キャプション＝列帯 [x0-5, x0+125)（列幅130pt実測）に属する寸法
// いずれも抽出座標空間そのまま（ラベルと寸法が同一空間なので回転の扱いは相殺）
function cx(b) { return (b[0] + b[2]) / 2; }
function cyy(b) { return (b[1] + b[3]) / 2; }
function roomSets(R) {
  const sets = new Map(); // canonical -> Set(mm)
  const add = (c, v) => { if (!sets.has(c)) sets.set(c, new Set()); sets.get(c).add(v); };
  const p36 = extracted.extracted_pages['36'];
  if (p36) {
    for (const r of p36.rooms) {
      const c = canonRoom(r.text);
      if (!c || !roomTruth.has(c)) continue;
      const rx = cx(r.bbox), ry = cyy(r.bbox);
      for (const d of p36.dims) {
        if (Math.abs(cx(d.bbox) - rx) <= R && Math.abs(cyy(d.bbox) - ry) <= R) add(c, d.value_mm);
      }
    }
  }
  const p37 = extracted.extracted_pages['37'];
  if (p37) {
    for (const r of p37.rooms) {
      const c = canonRoom(r.text);
      if (!c || !roomTruth.has(c)) continue;
      const x0 = r.bbox[0];
      for (const d of p37.dims) {
        const x = cx(d.bbox);
        if (x >= x0 - 5 && x < x0 + 125) add(c, d.value_mm);
      }
    }
  }
  return sets;
}
// p37列内チェーン和（参考: 列に完全内包されるチェーンの連続部分和）
function roomChainSums() {
  const sets = new Map();
  const p37 = extracted.extracted_pages['37'];
  if (!p37) return sets;
  for (const r of p37.rooms) {
    const c = canonRoom(r.text);
    if (!c || !roomTruth.has(c)) continue;
    const x0 = r.bbox[0];
    for (const ch of p37.chains) {
      const inside = ch.member_bboxes.every((b) => cx(b) >= x0 - 5 && cx(b) < x0 + 125);
      if (!inside) continue;
      if (!sets.has(c)) sets.set(c, new Set());
      for (const s of ch.run_sums) sets.get(c).add(s);
    }
  }
  return sets;
}

console.log('\n--- 部屋帰属プロトタイプ（部屋別壁ボード系正解幅との直接一致・R=矩形近傍半径pt）');
console.log('  正解part: 壁（ボ－ド）+遮音壁ＰＢ張り+遮音壁耐水ＰＢ張+壁（ﾎﾞ-ﾄﾞ）＝便所/洗面所も測定可能に');
console.log(`  帰属なし対照＝全ページ直接集合${D.size}種（格子${pct(base.cov)}）でのヒット`);
const chainSets = roomChainSums();
for (const R of [80, 120, 160]) {
  console.log(`  [R=${R}pt]（p37は列帯固定）`);
  const sets = roomSets(R);
  const order = ['玄関', '台所(LDK)', '洋室1', '洋室2', '洋室3', '便所(トイレ)', '洗面所'];
  let tShownOnce = R === 120;
  for (const c of order) {
    const tw = [...(roomTruth.get(c) || [])].sort((a, b) => a - b);
    if (!tw.length) { console.log(`    ${c}: 正解幅なし`); continue; }
    const rs = sets.get(c) || new Set();
    const hits = tw.filter((v) => rs.has(v));
    const pageHits = tw.filter((v) => D.has(v));
    const cov = rs.size ? gridCoverage(rs) : 0;
    const margin = (100 * hits.length) / tw.length - cov;
    let line = `    ${c}: 正解${tw.length}セグ | 帰属集合${rs.size}種 ヒット${hits.length}(${pct((100 * hits.length) / tw.length)})`
      + ` 対照格子${pct(cov)} シグナル${margin >= 0 ? '+' : ''}${margin.toFixed(1)}pt`
      + ` | 帰属なし${pageHits.length}(${pct((100 * pageHits.length) / tw.length)})`;
    const cs = chainSets.get(c);
    if (cs && tShownOnce) {
      const chHits = tw.filter((v) => rs.has(v) || cs.has(v));
      line += ` | [参考]p37列チェーン和込み${chHits.length}`;
    }
    console.log(line);
    if (R === 120) {
      const missR = tw.filter((v) => !rs.has(v));
      if (missR.length) console.log(`      未一致(R=120): [${missR.join(', ')}]（うち全ページにも無い: [${missR.filter((v) => !D.has(v)).join(', ')}]）`);
    }
  }
}
// ---- 帰属効果の直接比較（R=120固定）: 部屋別シグナル vs 同じ正解幅を帰属なし全ページ集合で当てた場合のシグナル ----
console.log('\n--- 帰属効果（R=120）: 帰属シグナル − 帰属なしシグナル（正= 帰属が信号を濃くしている）');
{
  const sets = roomSets(120);
  for (const c of ['玄関', '台所(LDK)', '洋室1', '洋室2', '洋室3', '便所(トイレ)', '洗面所']) {
    const tw = [...(roomTruth.get(c) || [])];
    if (!tw.length) continue;
    const rs = sets.get(c) || new Set();
    const rm = (100 * tw.filter((v) => rs.has(v)).length) / tw.length - gridCoverage(rs);
    const pm = (100 * tw.filter((v) => D.has(v)).length) / tw.length - base.cov;
    const d = rm - pm;
    console.log(`  ${c}: 帰属${rm >= 0 ? '+' : ''}${rm.toFixed(1)}pt vs 帰属なし${pm >= 0 ? '+' : ''}${pm.toFixed(1)}pt → 効果 ${d >= 0 ? '+' : ''}${d.toFixed(1)}pt`);
  }
}
console.log('\n[実測サマリ] 変換シグナル: 無変換+' + base.margin.toFixed(1) + 'pt → V1 '
  + (v1.margin >= 0 ? '+' : '') + v1.margin.toFixed(1) + 'pt / V1p '
  + (v1p.margin >= 0 ? '+' : '') + v1p.margin.toFixed(1) + 'pt'
  + '（シグナルが基準線+25.3ptから縮むなら変換は「効かない」）');
// exit codeは常に0（目標値を設けない実測レポート。回帰ゲートではない）
