// smoke パート76（「このターンの間、自分のスピリットすべてをBP+X」の継続効果化・回帰）
//
// 従来は bpBuffAll / bpBuff(attackingAll) が tempBpBuff を**キャスト時点で場にいる個体へ**
// 直接加算していたため、使用後に召喚したスピリットへ乗らなかった（原作より弱い）。
// TURN_EFFECT_SOURCES.md の lendSelfThisTurn（PlayerState.turnVirtualInstances）を使い、
// kind:"aura"（lentOnly:true）へ移行することで、召喚済みかどうかを問わず毎回動的に評価されるようにした。
// AuraDef.lentOnly / attackingOnly の回帰。
//
// 2026-07-31: 残り9枚（BS02-101／BS03-145／BS04-029／BS05-078／BS04-097／
// BS01-055／BS01-060／BS01-070／BS05-008）も移行完了（validate-cards.ts の checkLentEffects の
// 誤検出は先に修正済み）。既存 smoke/part12・part43・part68・part70 も新データ形状（effectiveBp /
// spiritHasKeyword による動的評価）に合わせて更新した。ここでは移行できた3枚とエンジン機構そのものに加え、
// 「triggered から lendSelfThisTurn を撃つ」形の代表2枚（BS01-055 エメアント／BS05-078 アイシクルアサルト）で
// 「使用後に召喚したスピリットにも乗る」ことを追加確認する。
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    destroySpirit,
    effectiveBp,
    resolveAction,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { Color } from "../../server/src/type"

function setup(seed: string, p1Color: string, p2Color: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: p1Color, p2: p2Color })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

// lendSelfThisTurn を resolveMagic と同じ呼び出し形（self=null、srcCardId明示）で発火させる。
// マジックの唯一の用途で self を参照すると必ず no-op になる罠（TURN_EFFECT_SOURCES.md §3.3）を踏んでいないことも兼ねて確認する
function lendMagic(s: GameState, pid: PlayerId, cardId: string, colors: Color[]): void {
    resolveAction(s, pid, null, { type: "lendSelfThisTurn" }, undefined, colors, "magic", undefined, undefined, cardId)
}

console.log("=== 1. パワーオーラ：使用後に召喚したスピリットにも+1000が乗る（従来は素通りしていたバグの核心）===")
{
    const s = setup("lend-summon-after", "green", "red")
    const before = put(s, "p1", "BS01-050", 1)
    lendMagic(s, "p1", "BS01-135", ["green"])
    assert(effectiveBp(s, "p1", before) === currentLevel(before).bp + 1000, "使用前からいたスピリットは+1000")

    // 使用後に手札から召喚する（新しいインスタンスは lendSelfThisTurn 呼び出し時点では存在しなかった）
    s.players.p1.hand = ["BS01-051"]
    const beforeIds = new Set(s.players.p1.field.spirits.map((sp) => sp.instanceId))
    const err = act(s, "p1", { type: "summon", handIndex: 0 })
    assert(err === null, `召喚が成功する（${err}）`)
    const after = s.players.p1.field.spirits.find((sp) => !beforeIds.has(sp.instanceId))!
    assert(
        effectiveBp(s, "p1", after) === currentLevel(after).bp + 1000,
        "使用後に召喚したスピリットにも+1000が乗る（修正の核心）",
    )
}

console.log("=== 2. 恒久化しないこと（lentOnly）：貸与前は+0、ターンが変わると消える ===")
{
    const s = setup("lend-not-permanent", "green", "red")
    const ally = put(s, "p1", "BS01-050", 1)
    assert(effectiveBp(s, "p1", ally) === currentLevel(ally).bp, "貸与前は+0")

    lendMagic(s, "p1", "BS01-135", ["green"])
    assert(effectiveBp(s, "p1", ally) === currentLevel(ally).bp + 1000, "貸与直後は+1000")

    s.phase = "main"
    s.battle = null
    const err = act(s, "p1", { type: "endTurn" })
    assert(err === null, `ターン終了が成功する（${err}）`)
    assert(
        effectiveBp(s, "p1", ally) === currentLevel(ally).bp,
        "ターンが変わると仮想発生源がリセットされ+1000は消える",
    )
}

console.log("=== 3. オフェンシブオーラ：フラッシュで使用→アタック中のスピリットに+2000、同ターン2体目のアタックにも再キャストなしで+2000 ===")
{
    const s = setup("offensive-aura-persist", "red", "blue")
    const attackerA = put(s, "p1", "BS01-001", 1)
    const attackerB = put(s, "p1", "BS01-002", 1)
    s.battle = { attackerInstanceId: attackerA.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    lendMagic(s, "p1", "BS01-116", ["red"])
    assert(
        effectiveBp(s, "p1", attackerA) === currentLevel(attackerA).bp + 2000,
        "1体目のアタック中のスピリットに+2000",
    )
    assert(effectiveBp(s, "p1", attackerB) === currentLevel(attackerB).bp, "アタックしていない2体目には乗らない")

    // 同じターンの2体目のバトル（再キャスト不要。仮想発生源はターン内で持続し、現在のアタッカーを動的に見る＝
    // tempBpBuffのような静的な対象固定ではないことの証明）
    s.battle = { attackerInstanceId: attackerB.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    assert(
        effectiveBp(s, "p1", attackerB) === currentLevel(attackerB).bp + 2000,
        "同ターン2体目のアタックにも再キャストなしで+2000",
    )
    assert(
        effectiveBp(s, "p1", attackerA) === currentLevel(attackerA).bp,
        "アタックを終えた1体目にはもう乗らない（動的にアタッカーを見ている証拠）",
    )
}

console.log("=== 4. attackingOnly と battlingOnly の違い：自分のブロッカーには乗らない ===")
{
    const s = setup("offensive-aura-blocker", "red", "blue")
    const blocker = put(s, "p1", "BS01-001", 1)
    const enemyAttacker = put(s, "p2", "BS01-001", 1)
    s.battle = { attackerInstanceId: enemyAttacker.instanceId, blockerInstanceId: blocker.instanceId, flashLockedPlayer: null, directed: false }
    lendMagic(s, "p1", "BS01-116", ["red"])
    assert(
        effectiveBp(s, "p1", blocker) === currentLevel(blocker).bp,
        "attackingOnlyはアタッカー限定のため、自分のブロッカーには乗らない（battlingOnlyとの違い）",
    )
}

console.log("=== 5. エメアント（triggeredからのlendSelfThisTurn。破壊時貸与）：使用後に召喚したスピリットにも+1000が乗る ===")
{
    const s = setup("lend-emeant-summon-after", "green", "red")
    const ally = put(s, "p1", "BS01-050", 1) // 破壊前からいたスピリット
    const emeant = put(s, "p1", "BS01-055", 1) // エメアント Lv1
    destroySpirit(s, "p1", emeant.instanceId) // onDestroy発火 → triggered.action の lendSelfThisTurn
    assert(effectiveBp(s, "p1", ally) === currentLevel(ally).bp + 1000, "破壊前からいたスピリットは+1000")

    // 破壊後に手札から召喚する（新しいインスタンスは lendSelfThisTurn 呼び出し時点では存在しなかった）
    s.players.p1.hand = ["BS01-051"]
    const beforeIds = new Set(s.players.p1.field.spirits.map((sp) => sp.instanceId))
    const err = act(s, "p1", { type: "summon", handIndex: 0 })
    assert(err === null, `召喚が成功する（${err}）`)
    const after = s.players.p1.field.spirits.find((sp) => !beforeIds.has(sp.instanceId))!
    assert(
        effectiveBp(s, "p1", after) === currentLevel(after).bp + 1000,
        "破壊後に召喚したスピリットにも+1000が乗る（triggeredからの貸与でも成立）",
    )
}

console.log("=== 6. アイシクルアサルト（counter:targetArmorColors）：対象ごとに量が変わり、使用後に召喚したスピリットにも動的に乗る ===")
{
    const s = setup("lend-icicle-summon-after", "white", "red")
    const twoColor = put(s, "p1", "BS03-044", 1) // 鋼人スルト（装甲：赤/白＝2色）
    lendMagic(s, "p1", "BS05-078", ["white"])
    assert(
        effectiveBp(s, "p1", twoColor) === currentLevel(twoColor).bp + 2000,
        "装甲2色のスピリットは+2000（1000×2、対象ごとに量が変わる）",
    )

    // 使用後に、装甲1色のスピリットを新たに召喚する（再キャストなしで動的に量が決まる）
    s.players.p1.hand = ["BS02-040"] // ロブスターク（装甲：赤＝1色）
    const beforeIds = new Set(s.players.p1.field.spirits.map((sp) => sp.instanceId))
    const err = act(s, "p1", { type: "summon", handIndex: 0 })
    assert(err === null, `召喚が成功する（${err}）`)
    const oneColor = s.players.p1.field.spirits.find((sp) => !beforeIds.has(sp.instanceId))!
    assert(
        effectiveBp(s, "p1", oneColor) === currentLevel(oneColor).bp + 1000,
        "使用後に召喚した装甲1色のスピリットには+1000（再キャスト不要で動的に評価される）",
    )
}
