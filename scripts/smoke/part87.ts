// smoke パート87（簡略化の解消：fieldEvent の装甲判定は「発生源の色」で行う）
//
// BS04-077 七龍帝の玉座 / BS04-083 鋼葉の樹林 は、召喚をきっかけに相手スピリットを
// 破壊／手札へ戻す fieldEvent を持つ。従来は resolveAction へ渡す発生源の色を明示しておらず、
// **self（＝召喚されたスピリット）の色**から導出されていたため、装甲の判定色が誤っていた
// （例: 赤のネクサスの効果なのに、召喚された白スピリットの色で装甲を見ていた）。
// 効果の発生源はエントリを持つカード（ネクサス）なので、その色・種別を明示的に渡すよう修正した。
import { act, assert, createGame, createInstance } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function setup(seed: string, p1Color: string, p2Color: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: p1Color, p2: p2Color })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 30
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== BS04-077 七龍帝の玉座 Lv2：破壊の装甲判定は玉座（赤）の色で行われる ===")
{
    const s = setup("throne-armor-test", "red", "white")
    const throne = createInstance("BS04-077", s.turn, 3) // 七龍帝の玉座 Lv2
    s.players.p1.field.nexuses.push(throne)

    // 【装甲：赤】を持つ相手スピリット。玉座は赤なので、armorで守られて破壊されないのが正しい
    const armored = put(s, "p2", "BS03-037", 1) // ラタトスカ Lv1（白・BP1000・装甲:赤）
    // 装甲を持たない相手スピリット（比較用）
    const plain = put(s, "p2", "BS01-050", 1) // ビートビートル（BP1000）

    // 古竜を持つスピリットを召喚して fieldEvent を起こす
    s.players.p1.hand[0] = "BS01-X01" // 龍皇ジークフリード（古竜・BP4000）
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "龍皇ジークフリードを召喚")

    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === armored.instanceId),
        "【装甲：赤】持ちは、赤のネクサス（玉座）の効果を受けず破壊されない",
    )
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === plain.instanceId),
        "装甲を持たないスピリットは破壊される",
    )
}

console.log("=== BS04-083 鋼葉の樹林 Lv2：手札へ戻す判定も樹林（白）の色で行われる ===")
{
    const s = setup("forest-armor-test", "white", "white")
    const forest = createInstance("BS04-083", s.turn, 3) // 鋼葉の樹林 Lv2
    s.players.p1.field.nexuses.push(forest)

    // 【装甲：赤/白】持ち＝白の樹林の効果を受けない
    const armoredWhite = put(s, "p2", "BS05-032", 2) // 珊瑚蟹シオマネキッド Lv2（装甲:赤/白・BP3000）
    // 【装甲：赤】だけの持ち＝白の樹林は防げない
    const armoredRedOnly = put(s, "p2", "BS03-037", 1) // ラタトスカ Lv1（装甲:赤・BP1000）

    s.players.p1.hand[0] = "BS04-037" // 鎧装獣ヘイズ・ルーン（甲獣・BP4000）
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "鎧装獣ヘイズ・ルーンを召喚")

    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === armoredWhite.instanceId),
        "【装甲：赤/白】持ちは、白のネクサス（樹林）の効果を受けず手札へ戻らない",
    )
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === armoredRedOnly.instanceId),
        "【装甲：赤】だけでは白の効果を防げず手札へ戻る",
    )
}
