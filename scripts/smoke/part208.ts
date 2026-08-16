// smoke パート208（効果文と実装の意味照合＝`npm run audit:semantics` で見つかった実バグ）
//
// どちらも「効果文の見出しがステップを限定しているのに、実装に限定が無く**常時効いていた**」もの。
// 検出は S4（タイミング）軸。判定の一覧は docs/design/SEMANTICS_AUDIT.md
import { assert, createGame, createInstance, currentLevel, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resolveMagic } from "../../server/src/logic/EffectModules"

const ANKYLO = "SD01-003" // アンキラーザウルス（Lv1-3『お互いのアタックステップ』BP+1000）
const RAIBRITZ = "BS08-006" // 雷帝竜騎レイブリッツ（Lv2『自分のアタックステップ』龍帝/竜騎を最高Lv扱い）
const ROSSO = "BS05-007" // 真紅の竜使いロッソ（系統「竜騎」・Lv3まである）
const TINKA = "BS09-038" // スズランの妖精ティンカ（Lv1-3『相手のアタックステップ』対象を自分に付け替える）
const OUKA = "BS07-038" // 桜の妖精オウカ（系統「楽族」・BP2000。守られる側）
const FLAME_CYCLONE = "BS03-120" // フレイムサイクロン（フラッシュ：BP5000以下のスピリット1体を破壊）
const SLEIPHORSE = "BS02-033" // 騎獣スレイプホース（緑のBP+マジックにボーナス）
const WILD_POWER = "BS01-133" // ワイルドパワー（緑・フラッシュ：BP+2000）
const AWAKEN_HOLDER = "BS07-002" // 翼竜人プテラディア（【覚醒】持ち。アンキラーザウルスの条件を満たす）

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard(ANKYLO).name === "アンキラーザウルス", "SD01-003 はアンキラーザウルス")
    assert(getCard(RAIBRITZ).name === "雷帝竜騎レイブリッツ", "BS08-006 は雷帝竜騎レイブリッツ")
    assert(getCard(ROSSO).name === "真紅の竜使いロッソ" && getCard(ROSSO).family.includes("竜騎"), "BS05-007 は真紅の竜使いロッソ（竜騎）")
    assert(getCard(AWAKEN_HOLDER).name === "翼竜人プテラディア", "BS07-002 は翼竜人プテラディア")
    assert(getCard(TINKA).name === "スズランの妖精ティンカ", "BS09-038 はスズランの妖精ティンカ")
    assert(getCard(OUKA).name === "桜の妖精オウカ" && getCard(OUKA).family.includes("楽族"), "BS07-038 は桜の妖精オウカ（楽族）")
    assert(getCard(FLAME_CYCLONE).name === "フレイムサイクロン", "BS03-120 はフレイムサイクロン")
    assert(getCard(SLEIPHORSE).name === "騎獣スレイプホース", "BS02-033 は騎獣スレイプホース")
    assert(getCard(WILD_POWER).name === "ワイルドパワー" && getCard(WILD_POWER).colors[0] === "green", "BS01-133 はワイルドパワー（緑）")
    assert(
        getCard(AWAKEN_HOLDER).effects.some((e) => e.kind === "keyword" && e.keyword === "awaken"),
        "翼竜人プテラディアは【覚醒】を持つ（アンキラーザウルスの条件）",
    )
}

console.log("=== SD01-003 アンキラーザウルス：BP+1000 は『お互いのアタックステップ』の間だけ ===")
{
    const s = base("ankylo-phase")
    put(s, "p1", AWAKEN_HOLDER, 1) // 【覚醒】持ちを自分のフィールドに置く（条件成立）
    const self = put(s, "p1", ANKYLO, 1)
    const baseBp = getCard(ANKYLO).levels[0]?.bp ?? 0
    assert(baseBp > 0, "Lv1のBPが取れている（前提）")

    s.phase = "main"
    assert(
        effectiveBp(s, "p1", self) === baseBp,
        `メインステップではBP+1000されない（実際: ${String(effectiveBp(s, "p1", self))}）`,
    )

    s.phase = "attack"
    assert(
        effectiveBp(s, "p1", self) === baseBp + 1000,
        "自分のアタックステップではBP+1000される",
    )

    // 『お互いの』なので、相手のアタックステップでも効く
    s.turnPlayer = "p2"
    assert(
        effectiveBp(s, "p1", self) === baseBp + 1000,
        "相手のアタックステップでもBP+1000される（『お互いの』）",
    )
}

console.log("--- 【覚醒】/【激突】持ちがいなければ、アタックステップでも上がらない（条件は従来どおり） ---")
{
    const s = base("ankylo-condition")
    const self = put(s, "p1", ANKYLO, 1)
    const baseBp = getCard(ANKYLO).levels[0]?.bp ?? 0
    s.phase = "attack"
    assert(effectiveBp(s, "p1", self) === baseBp, "条件を満たさなければ上がらない")
}

console.log("=== BS08-006 雷帝竜騎レイブリッツ Lv2：最高Lv扱いは『自分のアタックステップ』の間だけ ===")
{
    const s = base("raibritz-phase")
    const source = put(s, "p1", RAIBRITZ, 3) // Lv2 になるコア数はカードデータから取る
    const lv2Cores = getCard(RAIBRITZ).levels[1]?.cores ?? 3
    source.cores = lv2Cores
    assert(currentLevel(source).level === 2, "レイブリッツがLv2になっている（前提）")

    // 対象は系統「龍帝」/「竜騎」を持つ自分のスピリット。レイブリッツ自身はLv2までしか無いので、
    // 最高Lvへの読み替えが目に見えるLv3持ちの「竜騎」（真紅の竜使いロッソ）を並べて確かめる
    const target = put(s, "p1", ROSSO, 1)
    const maxLevel = getCard(ROSSO).levels[getCard(ROSSO).levels.length - 1]?.level ?? 3
    assert(maxLevel === 3, "ロッソはLv3まである（前提）")

    s.phase = "main"
    refreshLevelAsOverrides(s)
    assert(
        currentLevel(target).level === 1,
        `メインステップでは最高Lv扱いにならない（実際: Lv${String(currentLevel(target).level)}）`,
    )

    s.phase = "attack"
    s.turnPlayer = "p1"
    refreshLevelAsOverrides(s)
    assert(
        currentLevel(target).level === maxLevel,
        `自分のアタックステップでは最高Lv（Lv${String(maxLevel)}）として扱われる`,
    )

    s.turnPlayer = "p2"
    refreshLevelAsOverrides(s)
    assert(
        currentLevel(target).level === 1,
        "相手のアタックステップでは最高Lv扱いにならない（『自分の』アタックステップ限定）",
    )
}

console.log("=== BS09-038 スズランの妖精ティンカ：対象の付け替えは『相手のアタックステップ』の間だけ ===")
{
    // 相手のアタックステップ：楽族を狙った効果はティンカへ付け替えられる（従来どおり）
    const s = base("tinka-attack-step")
    const tinka = put(s, "p1", TINKA, 1)
    const ouka = put(s, "p1", OUKA, 3) // Lv2（BP4000）＝フレイムサイクロンの自動選択で狙われる側
    s.turnPlayer = "p2"
    s.phase = "attack"
    resolveMagic(s, "p2", FLAME_CYCLONE, "flash")
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === ouka.instanceId),
        "楽族（オウカ）は守られる",
    )
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === tinka.instanceId),
        "代わりにティンカが破壊される",
    )
}
{
    // 相手のメインステップ：付け替えない（ここが 2026-08-16 に直した点）
    const s = base("tinka-main-step")
    const tinka = put(s, "p1", TINKA, 1)
    const ouka = put(s, "p1", OUKA, 3) // Lv2（BP4000）＝フレイムサイクロンの自動選択で狙われる側
    s.turnPlayer = "p2"
    s.phase = "main"
    resolveMagic(s, "p2", FLAME_CYCLONE, "flash")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === ouka.instanceId),
        "相手のメインステップでは付け替えず、狙われた楽族が破壊される",
    )
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === tinka.instanceId),
        "ティンカは残る",
    )
}

console.log("=== BS02-033 騎獣スレイプホース：BP+マジックへのボーナスは自分のアタックステップだけ ===")
{
    // 自分のアタックステップ：ワイルドパワー（BP+2000）に、さらに+2000が乗る
    const s = base("sleiphorse-own-turn")
    const self = put(s, "p1", SLEIPHORSE, 1)
    s.turnPlayer = "p1"
    s.phase = "attack"
    resolveMagic(s, "p1", WILD_POWER, "flash", self.instanceId)
    assert(
        self.tempBpBuff === 4000,
        `自分のアタックステップではBP+2000にボーナス+2000が乗る（実際: ${String(self.tempBpBuff)}）`,
    )
}
{
    // 相手のアタックステップ：ボーナスは乗らない（ここが 2026-08-16 に直した点）
    const s = base("sleiphorse-opponent-turn")
    const self = put(s, "p1", SLEIPHORSE, 1)
    s.turnPlayer = "p2"
    s.phase = "attack"
    resolveMagic(s, "p1", WILD_POWER, "flash", self.instanceId)
    assert(
        self.tempBpBuff === 2000,
        `相手のアタックステップではマジック本体のBP+2000だけ（実際: ${String(self.tempBpBuff)}）`,
    )
}
