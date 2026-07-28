// 別府A〜Fの記録済みAI読み取り（scripts/recordings/beppu-{a..f}-gemini-read-gemini-2.5-flash.json）を
// エンジンに通し、①正解JSONとの乖離%を単位厳密で表示（情報表示のみ）②現HEADスナップショットとの
// 回帰判定（ズレたら✗でexit 1）を行う（AI呼び出しゼロ・replay-gtype.mjsの別府版）。
//
// 【なぜ必要か・2026-07-26】別府の精度数値はこれまで会話内で手転記されており、
//   ①単位混同（資材行「遮音壁PB張り」は**㎡**なのに枚の正解と比較する事故が実際に発生）
//   ②時点ズレ（フィルタ導入前後の値の混在）が起きた。このスクリプトが機械再現の口になる。
//
// 【使い方】エンジン（src/services/）を変更したら必ず実行すること。
//   node scripts/replay-beppu.mjs
//   別府数値が動く変更は、差分（どの行がなぜ動いたか）をレビューに明記した上で
//   下の SNAPSHOT を更新する（commit-hygiene-replay-gate型のガード。黙って更新しない）。
//
// 【判定の設計】
//   ・回帰判定はSNAPSHOT（現HEADの実行値・2026-07-26採取）とのみ比較する。
//     正解JSONとの乖離%は情報表示のみ＝「正解に寄せる」判定はしない
//     （残差は読み取り品質起因と確定済み。CLAUDE.md「別府主要3部位の現到達度」参照）。
//   ・許容: 枚=±0（整数丸め済み）/ ㎡=±0.02（浮動小数の表示丸めのみ吸収）/ カウンタ=±0。
//   ・警告数は表示のみ（時点の可視化。判定には使わない）。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  computeElevationTakeoff, applyElevationTakeoff, filterKenzaiScope, validateTakeoffSanity,
} from '../src/services/buildupCalculator.js';
import { calculateMaterials } from '../src/services/materialCalculator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const recDir = path.join(__dirname, 'recordings');

// 専有面積（各平面図の「住戸面積」記載値。記録のtotal_floor_area_sqmと同値のはずだが、
// 記録が欠けた場合のサニティ判定フォールバックとして明記しておく）
const AREAS = { A: 83.43, B: 57.22, C: 70.12, D: 69.35, E: 67.90, F: 71.29 };

// 別府物件プロファイル（文書化済みoverride一式。出典: CLAUDE.md「別府A〜F Gemini実読みE2E」節・
// e2e-beppu-a.mjs末尾のプロファイルコメント）。本番/calculateのoverridesObjと同じ文字列形式。
const OVERRIDES = {
  building_type: 'new',          // 別府は新築（推定パス=周長×階高ベースの新築式）
  glasswool_coverage: '0.5',     // 別府のGW被覆率（アルファ既定0.135と別）
  stud_height: '2720',           // 一般部下地高mm（アルファ2570と別）
  stud_height_wet: '2820',       // 水回り下地高mm
  ceiling_pb_extra_sheets: '0',  // 別府は集計表A74「ﾊﾟｳﾀﾞｰ･ﾄｲﾚ」加算行が無い（アルファG=4）
  closet_rc_sqm: '0',            // 別府に収納面PBの概念なし（作り付けシステム収納）
  households: '5',               // EV廻り壁PBの総量方式用（B〜G=5戸。E2E記録時の共通値）
};

// ============================================================================
// 回帰スナップショット（現HEAD・2026-07-26実行値。正解値ではない＝正解との乖離は下の表で別掲）
// ============================================================================
// エンジン変更でここがズレたら✗（exit 1）。意図した変更なら差分を明記してこの表を更新する。
// takeoff: true=展開図実測置換済み / false=推定パス値（E・Fは展開図が記録に無い=API失敗の記録
//   をそのまま再生するため、遮音壁PBはアルファ実績の固定13㎡[推定]が出る。0㎡ではない点に注意）。
// counters: [nonparty, face_label, face_cap, span_cap, wet_rerouted, closet_excluded]
//   （戸境壁フィルタ4種の棄却数 + 部位スコープ整合2件のカウンタ。時点の指紋になる）
// soundWet: takeoff.sound_wall_waterproof_pb_sqm（②振替バケット・表示スコープ外の㎡。資材行なし）
//
// 【2026-07-26 部位スコープ整合2件での更新（変化理由の部位単位内訳）】
//   ① 収納室スコープ除外（XLSに収納の部屋ブロックなし=何も拾わないが正）による壁PB減:
//     A 71→55枚（SCL 17.86㎡ + WCL 3.29㎡ = -21.15㎡ → 98.13→76.98㎡・正解75.50に対し+30%→+2%）
//     B 42→42枚（SCL 0.74㎡減=58.74→58.00㎡だがceil境界を跨がず枚数不変）
//     C 45→41枚（WCL 4.92㎡減 → 61.99→57.07㎡。正解74.37に対し-17%→-23%＝**見かけ悪化**。
//       これは収納の過大が玄関/台所の読み欠落過少と相殺していたのが剥がれた正直化。
//       部屋単位ではWCL行の+4.92誤計上が消え、残る過少は読み取り欠落起因=診断表参照）
//     D 34→23枚（WCL 14.40㎡減 → 46.45→32.05㎡。-1%→-32%＝同じく相殺剥がれの正直化。
//       部屋レベルでは玄関-12.66/台所-13.04の読み欠落過少が残存＝読み取り側の課題）
//   ② 水回り遮/G枠の耐水バケット振替（棄却→遮音壁耐水PB=XLS集計表r60実在部位の検出へ）:
//     nonpartyカウンタ A1→0 / B1→0 / D3→0（D内訳: 洗面+トイレ→wet 2件・WCL→①closet除外1室）。
//     壁PB・遮音壁PBの数値は②では1バイトも動かない（棄却時も計上していなかったため）。
//     soundWet= A6.35 / B6.20 / D8.45㎡（正解23.7〜35.2㎡に対し-72〜-82%の過少=AI検出限界を受容）
//
// 【2026-07-28 戸境壁セグメントの辺長物理上限（span_cap）での更新（Bのみ変化・変化理由）】
//   上限＝住戸外形（通り芯）の最大辺。記録の outer_dimensions_mm を opts.outerDimensionsMm へ
//   渡すようにした（本番 /calculate は未配線＝本番は従来どおり上限なし。将来配線の先取り）。
//   ・B のみ変化: 遮音壁PB 53.75→**34.16㎡**（+101.3%→+27.9%）。内訳（±0.01㎡まで一致）:
//       −26.38㎡ … LDKの 遮@9700mm を棄却（B自身の最大辺8500を1200mm超過＝物理的に存在し得ない。
//                  9700はA/D/E/Fの奥行き＝建物の通り芯グリッド値をAIが拾った帰属間違い）
//       +6.80㎡ … 上限内のセグメント 遮@2500（LDK）が新たに採用される。辺長上限を面数上限より
//                  先に適用する結果、面数上限（1部屋2面）の枠に空きが生まれるため。
//                  **この+6.80㎡は過大の上乗せ**（下記の順序トレードオフを参照）
//     → face_cap カウンタ 1→0 / span_cap 0→1 はこの枠の空きによる。
//     壁PB（42枚）・天井PB（34枚）・耐水振替・収納除外は不変（棄却＝「検出が無かった」扱いで
//     soundDeductByFace 未登録＝壁PB側の計上経路に触れないため）。
//
//   【正直な残差＝採用した順序はBを正解から遠ざけている（測定事実）】
//     ・現実装（辺長→面数）: 34.16㎡（正解26.704㎡比 **+27.9%**）face_cap=0 / span_cap=1
//     ・逆順（面数→辺長）  : 27.36㎡（同 **+2.5%**）             face_cap=1 / span_cap=1
//     ・上限なし（実装前）  : 53.75㎡（同 +101.3%）               face_cap=1 / span_cap=0
//     逆順の方が正解に近いが、順序は「単体で棄却できるものを先に落としてから集合を評価する」
//     という正解値に依存しない一般原則で決めている（buildupCalculator.js soundSpanCap の注記）。
//     +2.5%になる逆順を選ぶのは、特定タイプの正解値を見て順序を決める＝答え合わせになるため
//     採らない。なお「@2500が本物で@3070が偽」といった個別セグメントの真偽は判定していない。
//     また本上限は「住戸の最大辺」＝実質かなり緩い上限であり（真の上限は隣戸接触辺の長さだが
//     どの辺が接触面かは図面から特定できない＝レバー1第8段）、遮音PBの過大を削り切ってはいない。
//   ・A/C/D/E/F は完全不変: A(最大辺9700・セグメント最長3250)・D(9700・最長5550)は全て上限内、
//     C は記録に外形が無く上限なし、E/F は展開図が無い（推定パス）。
const SNAPSHOT = {
  A: { wall: 55, sound: 29.92, ceil: 51, wallTakeoff: true,  soundTakeoff: true,  counters: [0, 0, 0, 0, 1, 2], soundWet: 6.35 },
  B: { wall: 42, sound: 34.16, ceil: 34, wallTakeoff: true,  soundTakeoff: true,  counters: [0, 0, 0, 1, 1, 1], soundWet: 6.20 },
  C: { wall: 41, sound: 35.36, ceil: 42, wallTakeoff: true,  soundTakeoff: true,  counters: [0, 0, 0, 0, 0, 2], soundWet: 0 },
  D: { wall: 23, sound: 44.88, ceil: 41, wallTakeoff: true,  soundTakeoff: true,  counters: [0, 5, 5, 0, 2, 1], soundWet: 8.45 },
  E: { wall: 76, sound: 13,    ceil: 41, wallTakeoff: false, soundTakeoff: false, counters: null, soundWet: null },
  F: { wall: 79, sound: 13,    ceil: 43, wallTakeoff: false, soundTakeoff: false, counters: null, soundWet: null },
};

// 正解: 別府9タイプ正解JSON（XLS集計表の戸当セル・90セル一致検証済み）
const truth = JSON.parse(fs.readFileSync(path.join(__dirname, 'beppu-9types-ground-truth.json'), 'utf8'));

const fmtPct = (got, exp) => {
  if (!(exp > 0)) return '-';
  const p = (got / exp - 1) * 100;
  return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
};

let ng = 0;
console.log('=== 別府A〜F 記録リプレイ（エンジン再生・AI呼び出しゼロ） ===');
console.log('override:', JSON.stringify(OVERRIDES));

for (const T of ['A', 'B', 'C', 'D', 'E', 'F']) {
  const file = path.join(recDir, `beppu-${T.toLowerCase()}-gemini-read-gemini-2.5-flash.json`);
  if (!fs.existsSync(file)) {
    console.error(`✗ ${T}: 記録がありません: ${file}`);
    ng++;
    continue;
  }
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));

  // ── 本番 /calculate と同等の組み立て ──────────────────────────────
  // calculateMaterials → 展開図があれば computeElevationTakeoff → validateTakeoffSanity
  // → OKなら applyElevationTakeoff → filterKenzaiScope（routes/projects.js:1007-1075と同順）
  const result = calculateMaterials(rec, {}, OVERRIDES);
  let takeoff = null;
  let sanityLabel = '展開図なし（記録にelevationsが無い=E2E時のAPI失敗も含む）';
  if (rec.elevations?.rooms?.length) {
    takeoff = computeElevationTakeoff(rec.elevations, rec.door_schedule || [], {
      planRooms: rec.rooms || [],                       // 本番と同じ: 収納内の間仕切下地推定用
      closetInteriors: rec.closet_interiors || [],
      studHeight: { default_mm: 2720, wet_mm: 2820 },   // parseStudHeightOverrides(OVERRIDES)と同値
      // アルファG専用の既定遮音ペアを無効化（別府E2Eプロファイル）。
      // ※注意（reviewer SF-1）: sound_wall_rule系overrideは本番/calculateに配線されておらず、
      //   本番は常にDEFAULT_SOUND_WALL_PAIRSが有効。現A〜D記録では幅ゲート1450/1050±80が
      //   非成立のため pairs:[] でも未指定でも数値は完全一致（実測済み）だが、将来の再読みで
      //   LDK↔洋室(1)幅1450±80mmの面が現れると本番とreplayの遮音値が割れる（+約12.85㎡）。
      soundWallRule: { pairs: [] },
      // 戸境二重壁セグメントの辺長物理上限（2026-07-28・resolveSoundSpanCapMm）。
      // 住戸の外形（通り芯）の最大辺を超える遮/G枠は住戸内に存在し得ない＝帰属間違いとして棄却。
      // ※ 本番 /calculate への配線は本サイクルのスコープ外（未配線）。ここでは
      //   parsedData.outer_dimensions_mm をそのまま渡す＝将来の本番配線と同じ値の与え方を
      //   先取りして効果を測る（記録に外形が無いタイプ=C は null → 上限なし＝棄却ゼロ）。
      outerDimensionsMm: rec.outer_dimensions_mm,
    });
    const sanity = validateTakeoffSanity(takeoff, {
      // ※AREASフォールバックは本番に無い（本番は記録の値をそのまま渡す＝欠落時undefined）。
      //   現記録は全タイプ値ありで不活性（reviewer N-1）
      totalFloorAreaSqm: rec.total_floor_area_sqm ?? AREAS[T],
      elevations: rec.elevations,
    });
    if (sanity.ok) {
      applyElevationTakeoff(result, takeoff, { households: OVERRIDES.households });
      sanityLabel = 'サニティOK→実測採用';
    } else {
      sanityLabel = `サニティNG→推定のまま (${sanity.reasons.map((r) => r.code).join(',')})`;
    }
  }
  result.materials = filterKenzaiScope(result.materials);

  const get = (name) => result.materials.find((m) => m.name === name);
  const wall = get('壁 石膏ボード');
  const sound = get('遮音壁PB張り');
  const ceil = get('天井 石膏ボード');
  const parts = truth.types[T]?.parts || {};
  // 単位を厳密に:
  //   壁PB・天井PB = 枚 vs 枚（正解はarea_or_length÷係数のsheets_converted）
  //   遮音壁PB    = ㎡ vs ㎡（資材行「遮音壁PB張り」の単位は㎡。枚の正解と比較しないこと！
  //                 2026-07-26に「A遮音+3%✅」の誤報を生んだ単位混同の再発防止）
  const expWall = parts['壁PB']?.sheets_converted;      // 枚
  const expSound = parts['遮音壁PB']?.area_or_length;   // ㎡
  const expCeil = parts['天井PB']?.sheets_converted;    // 枚

  const tk = (m) => (m?.takeoff ? '[実測]' : '[推定]');
  console.log(`\n--- ${T}タイプ（専有${rec.total_floor_area_sqm}㎡・展開図${rec.elevations?.rooms?.length ?? 0}室・${sanityLabel}） ---`);
  console.log(`  壁PB      : ${wall?.quantity}${wall?.unit} ${tk(wall)} vs 正解${expWall?.toFixed(1)}枚 (${fmtPct(wall?.quantity, expWall)}) ※情報表示のみ`);
  console.log(`  遮音壁PB  : ${sound?.quantity}${sound?.unit} ${tk(sound)} vs 正解${expSound?.toFixed(1)}㎡ (${fmtPct(sound?.quantity, expSound)}) ※㎡同士の比較・情報表示のみ`);
  console.log(`  天井PB    : ${ceil?.quantity}${ceil?.unit} ${tk(ceil)} vs 正解${expCeil?.toFixed(1)}枚 (${fmtPct(ceil?.quantity, expCeil)}) ※情報表示のみ`);
  if (takeoff) {
    console.log(`  フィルタ棄却: nonparty=${takeoff.beppu_sound_nonparty_dropped}`
      + ` / face_label=${takeoff.beppu_sound_face_label_dropped}`
      + ` / face_cap=${takeoff.beppu_sound_face_cap_dropped}`
      + ` / span_cap=${takeoff.beppu_sound_span_cap_dropped}`
      + ` / 耐水振替=${takeoff.beppu_sound_wet_rerouted}件`
      + ` / 収納除外=${takeoff.beppu_closet_rooms_excluded}室`
      + ` / 警告${(result._warnings || []).length}件（表示のみ・判定外）`);
    const expSoundWet = parts['遮音壁耐水PB']?.area_or_length;
    console.log(`  遮音壁耐水PB: ${takeoff.sound_wall_waterproof_pb_sqm}㎡（②振替バケット・表示スコープ外・資材行なし）`
      + ` vs 正解${expSoundWet?.toFixed(1) ?? '-'}㎡ (${fmtPct(takeoff.sound_wall_waterproof_pb_sqm, expSoundWet)}) ※情報表示のみ・過少はAI検出限界を受容`);
  } else {
    console.log(`  フィルタ棄却: -（展開図なし） / 警告${(result._warnings || []).length}件（表示のみ・判定外）`);
  }

  // ── 回帰スナップショット判定（現HEAD既知値と比較・正解には寄せない） ──
  const snap = SNAPSHOT[T];
  const errs = [];
  if (wall?.quantity !== snap.wall) errs.push(`壁PB ${wall?.quantity} ≠ snap ${snap.wall}`);
  if (Math.abs((sound?.quantity ?? NaN) - snap.sound) > 0.02) errs.push(`遮音壁PB ${sound?.quantity} ≠ snap ${snap.sound}（±0.02㎡超）`);
  if (ceil?.quantity !== snap.ceil) errs.push(`天井PB ${ceil?.quantity} ≠ snap ${snap.ceil}`);
  if (!!wall?.takeoff !== snap.wallTakeoff) errs.push(`壁PB takeoff ${!!wall?.takeoff} ≠ snap ${snap.wallTakeoff}`);
  if (!!sound?.takeoff !== snap.soundTakeoff) errs.push(`遮音壁PB takeoff ${!!sound?.takeoff} ≠ snap ${snap.soundTakeoff}`);
  const gotCounters = takeoff
    ? [takeoff.beppu_sound_nonparty_dropped, takeoff.beppu_sound_face_label_dropped, takeoff.beppu_sound_face_cap_dropped,
       takeoff.beppu_sound_span_cap_dropped,
       takeoff.beppu_sound_wet_rerouted, takeoff.beppu_closet_rooms_excluded]
    : null;
  if (JSON.stringify(gotCounters) !== JSON.stringify(snap.counters)) {
    errs.push(`フィルタ棄却カウンタ ${JSON.stringify(gotCounters)} ≠ snap ${JSON.stringify(snap.counters)}`);
  }
  // ②振替バケット（表示スコープ外＝資材行は無い。takeoff値そのものを指紋にする）
  const gotSoundWet = takeoff ? takeoff.sound_wall_waterproof_pb_sqm : null;
  if (snap.soundWet === null ? gotSoundWet !== null
    : !(Number.isFinite(gotSoundWet) && Math.abs(gotSoundWet - snap.soundWet) <= 0.02)) {
    errs.push(`遮音壁耐水PB(振替バケット) ${gotSoundWet} ≠ snap ${snap.soundWet}（±0.02㎡超）`);
  }
  if (errs.length > 0) {
    ng++;
    console.log(`  ✗ スナップショット不一致: ${errs.join(' / ')}`);
  } else {
    console.log('  ✅ スナップショット一致（現HEAD・2026-07-26採取値）');
  }
}

console.log(`\n判定: ${ng === 0 ? '✅ 全6タイプ一致' : `✗ ${ng}タイプ不一致`}`
  + '（回帰判定はスナップショットのみ。正解との乖離%は読み取り品質の現在地の情報表示）');
process.exit(ng > 0 ? 1 : 0);
