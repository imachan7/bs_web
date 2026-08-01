// smoke パート84（【神速】召喚のコア取得元 ＝ BS04-033 Lv2-3 / BS04-080 Lv2）
//
// 基礎ルール: **【神速】召喚のコストはリザーブからのみ支払える**（通常召喚と違い、
// フィールドのスピリット/ネクサス上のコアは使えない）。
// kind "sokuPaySourceGrant" が、その取得元を広げる:
//   - BS04-080 旋風渦巻く渓谷 Lv2 : scope "anyField"（自分のフィールドすべて＝制限が無くなる）
//   - BS04-033 甲殻戦士ロングホーン Lv2-3: scope "self"（ロングホーン上か自分のリザーブから）
// どちらも『自分のアタックステップ』限定（phase:"attack" / turn:"own"）。
//
// なお【神速】そのものは自分・相手どちらのターンでもフラッシュタイミングで使える（part80 で確認済み）。
import { act, assert, createGame, createInstance, effectiveCost, getCard } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

// p1 が神速召喚する側。バトル中のフラッシュタイミングを作る
function setup(seed: string, turnPlayer: PlayerId): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.phase = "attack"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 0 // リザーブを空にして「フィールドから払えるか」だけを見る
    s.players.p2.reserve = 20
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

// 神速召喚を試す。支払い元を1つ指定し、そこから**実効コスト全額**を払わせる
// （ジガ・ワスプは緑の軽減を持つため、場の緑シンボル数で実効コストが変わる。固定値で書かない）
function trySokuSummon(s: GameState, instanceId: string): string | null {
    s.players.p1.hand[0] = "BS01-064" // ジガ・ワスプ（【神速】）
    s.priorityPlayer = "p1"
    s.isFlashTiming = true
    const cost = effectiveCost(s, "p1", getCard("BS01-064"))
    return act(s, "p1", { type: "summon", handIndex: 0, paySources: [{ instanceId, count: cost }] })
}

// 実効コスト（テスト内でコア減少を検証するため）
function sokuCost(s: GameState): number {
    return effectiveCost(s, "p1", getCard("BS01-064"))
}

console.log("=== 基礎ルール：【神速】召喚のコストはリザーブからのみ支払える ===")
{
    const s = setup("soku-pay-base-test", "p1")
    const bank = put(s, "p1", "BS01-050", 8) // ビートビートル（コア8個＝支払い元候補）
    s.battle = {
        attackerInstanceId: bank.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    const err = trySokuSummon(s, bank.instanceId)
    assert(err !== null, "フィールドのコアで神速召喚しようとすると拒否される")
    assert(
        !s.players.p1.field.spirits.some((x) => x.cardId === "BS01-064"),
        "ジガ・ワスプは場に出ていない",
    )
}

console.log("--- 通常召喚（メインステップ）では従来どおりフィールドから支払える ---")
{
    const s = setup("soku-pay-normal-test", "p1")
    s.phase = "main"
    s.isFlashTiming = false
    const bank = put(s, "p1", "BS01-050", 8)
    s.players.p1.reserve = 1 // 置くコア1個ぶんだけ残す
    s.players.p1.hand[0] = "BS01-064"
    const cost = effectiveCost(s, "p1", getCard("BS01-064"))
    assert(
        act(s, "p1", { type: "summon", handIndex: 0, paySources: [{ instanceId: bank.instanceId, count: cost }] }) === null,
        "メインステップの通常召喚はフィールドのコアで支払える",
    )
    assert(
        s.players.p1.field.spirits.some((x) => x.cardId === "BS01-064"),
        "ジガ・ワスプが場に出た",
    )
}

console.log("=== BS04-080 旋風渦巻く渓谷 Lv2：神速召喚の取得元の制限が無くなる ===")
{
    const s = setup("valley-anyfield-test", "p1")
    const nexus = createInstance("BS04-080", s.turn, 3) // 旋風渦巻く渓谷 Lv2（維持コア3）
    s.players.p1.field.nexuses.push(nexus)
    const bank = put(s, "p1", "BS01-050", 8)
    s.battle = {
        attackerInstanceId: bank.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    s.players.p1.reserve = 1 // 置くコア1個ぶんはリザーブから
    const paid = sokuCost(s)
    assert(
        trySokuSummon(s, bank.instanceId) === null,
        "渓谷Lv2があればフィールドのスピリット上のコアで神速召喚できる",
    )
    assert(bank.cores === 8 - paid, `支払い元から実効コスト（${paid}個）ぶんのコアが減った`)
    assert(
        s.players.p1.field.spirits.some((x) => x.cardId === "BS01-064"),
        "ジガ・ワスプが場に出た",
    )
}

console.log("--- 渓谷が Lv1 のときは制限が残る ---")
{
    const s = setup("valley-lv1-test", "p1")
    const nexus = createInstance("BS04-080", s.turn, 0) // Lv1（維持コア0）
    s.players.p1.field.nexuses.push(nexus)
    const bank = put(s, "p1", "BS01-050", 8)
    s.battle = {
        attackerInstanceId: bank.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    assert(
        trySokuSummon(s, bank.instanceId) !== null,
        "Lv1では取得元の制限が残る",
    )
}

console.log("--- 相手のターンでは働かない（『自分のアタックステップ』限定） ---")
{
    const s = setup("valley-oppturn-test", "p2") // p2 のターン
    const nexus = createInstance("BS04-080", s.turn, 3)
    s.players.p1.field.nexuses.push(nexus)
    const bank = put(s, "p1", "BS01-050", 8)
    const attacker = put(s, "p2", "BS01-001", 1)
    s.battle = {
        attackerInstanceId: attacker.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    assert(
        trySokuSummon(s, bank.instanceId) !== null,
        "相手のターンではフィールドから支払えない",
    )
}

console.log("=== BS04-033 甲殻戦士ロングホーン Lv2-3：ロングホーン上か自分のリザーブからのみ ===")
{
    const s = setup("longhorn-self-test", "p1")
    const longhorn = put(s, "p1", "BS04-033", 6) // ロングホーン Lv3（維持コア5）。コア6個持たせる
    const other = put(s, "p1", "BS01-050", 8) // 別のスピリット（こちらからは払えない）
    s.battle = {
        attackerInstanceId: longhorn.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    s.players.p1.reserve = 1 // 置くコア1個ぶん

    assert(
        trySokuSummon(s, other.instanceId) !== null,
        "ロングホーン以外のスピリット上のコアでは支払えない",
    )
    const paid = sokuCost(s)
    assert(
        trySokuSummon(s, longhorn.instanceId) === null,
        "ロングホーン上のコアでは支払える",
    )
    assert(longhorn.cores === 6 - paid, `ロングホーンから実効コスト（${paid}個）ぶんのコアが減った`)
}

console.log("--- ロングホーンが Lv1 のときは制限が残る ---")
{
    const s = setup("longhorn-lv1-test", "p1")
    const longhorn = put(s, "p1", "BS04-033", 1) // Lv1（維持コア1）
    s.battle = {
        attackerInstanceId: longhorn.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    assert(
        trySokuSummon(s, longhorn.instanceId) !== null,
        "Lv1では自身の上のコアからも支払えない",
    )
}
