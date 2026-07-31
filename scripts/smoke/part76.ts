// smoke パート76（「このターンの間、自分のスピリットすべてをBP+X」の継続効果化・回帰）
//
// 従来は bpBuffAll / bpBuff(attackingAll) が tempBpBuff を**キャスト時点で場にいる個体へ**
// 直接加算していたため、使用後に召喚したスピリットへ乗らなかった（原作より弱い）。
// TURN_EFFECT_SOURCES.md の lendSelfThisTurn（PlayerState.turnVirtualInstances）を使い、
// kind:"aura"（lentOnly:true）へ移行することで、召喚済みかどうかを問わず毎回動的に評価されるようにした。
// AuraDef.lentOnly / attackingOnly の回帰。
//
// ⚠️ 12枚中 3枚（BS01-135パワーオーラ／BS01-116オフェンシブオーラ／BS05-082サーキュラーソー・アーム）のみ
// data/cards.json を移行している。残り9枚（BS02-101／BS03-145／BS04-029／BS05-078／BS04-097／
// BS01-055／BS01-060／BS01-070／BS05-008）は既存の smoke/part12・part43・part68・part70 が
// 旧データ形状（tempBpBuff直書き・tempKeywords・real castMagic経由の断定）を前提に固定回帰しており、
// かつ validate-cards.ts の checkLentEffects が kind:"triggered" の貸与エントリを「貸される側」と
// 誤認識して levels:null 要求を出す（自身は貸す側の呼び出しエントリ）ため、既存の触ってはいけないファイルを
// 壊さずに移行できなかった。詳細は完了報告を参照。ここでは移行できた3枚とエンジン機構そのものを検証する。
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
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
