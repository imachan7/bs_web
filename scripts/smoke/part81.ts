// smoke パート81（継続効果・マジックの未到達カード：条件が複雑で一度も適用実績のない7件）
//
// coverage:effects の「★ 場に出ているのに一度も適用されていない効果」のうち、
// keyword 以外（levelAs / colorAs / magicBuffBonus / magic）を対象にする。
//
// 注意（マジック4件: BS01-116/BS04-097/BS03-145/BS05-078）: 必ず resolveMagic() 経由で発火させること。
// 既存の part39/part70 は resolveAction に手組みの action オブジェクト
// （例: { type: "lendSelfThisTurn" }）を直接渡しており、これだとカード由来の __eid が
// 乗らないため、coverage-effects.ts 上は「機構は動いたがカードデータ経由は一度も未検証」の
// ままになる（今回このカバレッジの穴を埋めるのが目的）。resolveMagic は card.effects の
// action オブジェクトをそのまま resolveAction へ渡すため、__eid が保持される。
import {
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectiveBp,
    refreshLevelAsOverrides,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resolveMagic } from "../../server/src/logic/EffectModules"
import { instHasColor } from "../../shared/rules"

function setup(seed: string, p1Color: string, p2Color: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: p1Color, p2: p2Color })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== BS03-115 崩壊する戦線 Lv2：自分のアタックステップ中、【粉砕】持ちの自分スピリットを最大Lvとして扱う ===")
{
    const s = setup("houkai-sensen-levelas", "blue", "red")
    const nexus = createInstance("BS03-115", s.turn, 4) // 崩壊する戦線 Lv2（維持コア4）
    s.players.p1.field.nexuses.push(nexus)
    const funsaiSpirit = put(s, "p1", "BS03-076", 1) // 爪剣のラザラス Lv1（【粉砕】静的持ち。最大Lvは3）

    assert(currentLevel(funsaiSpirit).level === 1, "levelAs適用前はコア基準のLv1のまま")

    s.phase = "attack"
    refreshLevelAsOverrides(s)
    assert(currentLevel(funsaiSpirit).level === 3, "自分のアタックステップ中は最大Lv(3)として扱われる")

    s.phase = "main"
    refreshLevelAsOverrides(s)
    assert(currentLevel(funsaiSpirit).level === 1, "アタックステップを離れるとLvは元のコア基準に戻る")

    s.phase = "attack"
    s.turnPlayer = "p2"
    refreshLevelAsOverrides(s)
    assert(currentLevel(funsaiSpirit).level === 1, "相手のアタックステップでは適用されない（turn:own）")
    s.turnPlayer = "p1"

    nexus.cores = 0 // 崩壊する戦線をLv1へ（sourceMinLevel:2未満）
    s.phase = "attack"
    refreshLevelAsOverrides(s)
    assert(currentLevel(funsaiSpirit).level === 1, "発生源（崩壊する戦線）がLv2未満だと適用されない（sourceMinLevel）")
}

console.log("=== BS02-033 騎獣スレイプホース Lv3：自分の他の緑スピリットへの緑マジックのBP強化にさらにBP+2000 ===")
{
    const s = setup("sleipnir-magicbuffbonus-others", "green", "red")
    put(s, "p1", "BS02-033", 5) // 騎獣スレイプホース Lv3（維持コア5）
    const ally = put(s, "p1", "BS01-052", 1) // ペリリィフ（自分の他の緑スピリット）
    s.phase = "attack"

    const before = currentLevel(ally).bp
    resolveMagic(s, "p1", "BS01-133", "flash", ally.instanceId) // ワイルドパワー（緑マジック、BP+2000）
    assert(
        currentLevel(ally).bp === before + 2000 + 2000,
        "ワイルドパワーのBP+2000に加え、スレイプホースの効果でさらにBP+2000（合計+4000）が乗る",
    )
}

console.log("=== BS02-033 Lv3：自分自身への緑マジックにはownOthers(e2)は乗らない（e1の自己分+2000のみ） ===")
{
    const s = setup("sleipnir-magicbuffbonus-self", "green", "red")
    const sleipnir = put(s, "p1", "BS02-033", 5)
    s.phase = "attack"

    const before = currentLevel(sleipnir).bp
    resolveMagic(s, "p1", "BS01-133", "flash", sleipnir.instanceId)
    assert(
        currentLevel(sleipnir).bp === before + 2000 + 2000,
        "自身が対象のときはe1(self)の+2000のみが乗り、e2(ownOthers)は重複しない（合計+4000。+6000にならない）",
    )
}

console.log("=== BS04-053 天使スローン Lv3：自身を紫のスピリットとしても扱う ===")
{
    const s = setup("angel-throne-coloras", "yellow", "red")
    const throne = put(s, "p1", "BS04-053", 1) // Lv1（維持コア1）
    assert(!instHasColor(throne, "purple"), "Lv1では紫として扱われない")

    throne.cores = 4 // Lv3へ（維持コア4）
    refreshLevelAsOverrides(s)
    assert(instHasColor(throne, "purple"), "Lv3では紫のスピリットとしても扱われる")
    assert(instHasColor(throne, "yellow"), "本来の色（黄）も引き続き持つ")

    throne.cores = 1 // Lv1に戻す
    refreshLevelAsOverrides(s)
    assert(!instHasColor(throne, "purple"), "Lv1に戻ると紫としては扱われなくなる（都度再構築）")
}

console.log("=== BS01-116 オフェンシブオーラ（フラッシュ）：アタック中の自分スピリットにBP+2000（resolveMagic経由） ===")
{
    const s = setup("offensive-aura-resolvemagic", "red", "blue")
    const attacker = put(s, "p1", "BS01-001", 1) // ゴラドン（アタッカー）
    const bystander = put(s, "p1", "BS01-002", 1) // ロクケラトプス（アタックしていない味方）
    s.phase = "attack"
    s.battle = {
        attackerInstanceId: attacker.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    resolveMagic(s, "p1", "BS01-116", "flash")
    assert(
        effectiveBp(s, "p1", attacker) === currentLevel(attacker).bp + 2000,
        "アタッカーにBP+2000が乗る",
    )
    assert(
        effectiveBp(s, "p1", bystander) === currentLevel(bystander).bp,
        "アタックしていない味方には乗らない",
    )
}

console.log("=== BS04-097 フォレストオーラ（フラッシュ）：アタック中の系統「樹魔」持ち自分スピリットにBP+3000（resolveMagic経由） ===")
{
    const s = setup("forest-aura-resolvemagic", "green", "red")
    const attacker = put(s, "p1", "BS01-054", 1) // ショックイーター（系統：樹魔・アタッカー）
    s.phase = "attack"
    s.battle = {
        attackerInstanceId: attacker.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    resolveMagic(s, "p1", "BS04-097", "flash")
    assert(
        effectiveBp(s, "p1", attacker) === currentLevel(attacker).bp + 3000,
        "系統「樹魔」を持つアタッカーにBP+3000が乗る",
    )
}

console.log("=== BS03-145 スクランブル（フラッシュ）：スピリット1体をBP+3000（resolveMagic経由） ===")
{
    const s = setup("scramble-bpbuff", "blue", "red")
    const target = put(s, "p1", "BS01-001", 1)
    const before = currentLevel(target).bp
    resolveMagic(s, "p1", "BS03-145", "flash", target.instanceId)
    assert(currentLevel(target).bp === before + 3000, "指定したスピリットにBP+3000が乗る")
}

console.log("=== BS05-078 アイシクルアサルト（フラッシュ）：スピリット1体をBP+3000（resolveMagic経由） ===")
{
    const s = setup("icicle-assault-bpbuff", "white", "red")
    const target = put(s, "p1", "BS01-001", 1)
    const before = currentLevel(target).bp
    resolveMagic(s, "p1", "BS05-078", "flash", target.instanceId)
    assert(currentLevel(target).bp === before + 3000, "指定したスピリットにBP+3000が乗る")
}
