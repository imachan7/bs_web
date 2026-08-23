// smoke パート224（【転召】の対象は、召喚コストの支払いで消えるスピリットを数えない。2026-08-21 利用者報告）
//
// 【転召】は**召喚コストの支払い後**に「自分のスピリット1体の上のコアすべて」を置く必須コスト。
// 可否の判定は支払い**前**の盤面で行っていたため、フィールドのコアを支払い元にして
// 唯一の候補が維持コアを割ると、**対象がいないまま召喚が成立**していた
// （payCost が支払い後に維持コア割れを "deplete" で消滅させる）。
//
// 収録セクション:
//   - 唯一の候補を支払いで消すと召喚できない
//   - 候補が2体いて片方だけ消えるなら召喚できる（もう片方が対象になる）
//   - 支払っても維持コアが残るなら従来どおり召喚できる
//   - 候補が元からいない場合は従来どおりのメッセージで拒否される
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const ZABURUGAN = "BS07-017" // 冥獣士ザブルガン：コスト6・【転召：コスト3以上/トラッシュ】・Lv1 維持コア1
const JOU = "BS01-016" // スケルトン・ジョウ：コスト5（＝転召の対象になれる）・Lv1 維持コア1
const SMALL = "BS01-004" // ドラグノ偵察兵：コスト2（＝コスト3以上の条件に合わない）

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

function setup(name: string): GameState {
    const s = createGame(name, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 20
    s.players.p1.hand = [ZABURUGAN]
    return s
}

console.log("=== 【転召】：唯一の対象を支払いで消すと召喚できない ===")
{
    const s = setup("tensho-pay-vanish")
    // 維持コア1に対してコア2個。2個とも支払いに使うと維持コアを割って消滅する
    const jou = putSpirit(s, "p1", JOU, 2)
    const error = act(s, "p1", { type: "summon", handIndex: 0, paySources: [{ instanceId: jou, count: 2 }] })
    assert(error !== null, `召喚が拒否される（実際: ${error}）`)
    assert(s.players.p1.hand.includes(ZABURUGAN), "手札に残っている")
    assert(s.players.p1.field.spirits.length === 1, "場は変わらない（支払いも起きない）")
    assert(
        s.players.p1.field.spirits[0]!.cores === 2,
        `支払い元のコアも減らない（実際: ${s.players.p1.field.spirits[0]!.cores}）`,
    )
}

console.log("=== 【転召】：対象が2体いて片方だけ消えるなら召喚できる ===")
{
    const s = setup("tensho-pay-one-left")
    const jou1 = putSpirit(s, "p1", JOU, 2)
    putSpirit(s, "p1", JOU, 2) // こちらは支払いに使わないので残る
    const error = act(s, "p1", { type: "summon", handIndex: 0, paySources: [{ instanceId: jou1, count: 2 }] })
    assert(error === null, `召喚できる（実際: ${error}）`)
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === ZABURUGAN),
        "ザブルガンが場に出る",
    )
}

console.log("=== 【転召】：支払っても維持コアが残るなら従来どおり召喚できる ===")
{
    const s = setup("tensho-pay-survives")
    const jou = putSpirit(s, "p1", JOU, 3) // 3個のうち2個払っても1個残る（維持コア1）
    const error = act(s, "p1", { type: "summon", handIndex: 0, paySources: [{ instanceId: jou, count: 2 }] })
    assert(error === null, `召喚できる（実際: ${error}）`)
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === ZABURUGAN),
        "ザブルガンが場に出る",
    )
}

console.log("=== 【転召】：対象が元からいなければ従来どおり拒否する ===")
{
    const s = setup("tensho-no-candidate")
    putSpirit(s, "p1", SMALL, 2) // コスト2＝「コスト3以上」に合わない
    const error = act(s, "p1", { type: "summon", handIndex: 0 })
    assert(error !== null, "召喚が拒否される")
    assert(
        (error ?? "").includes("コスト3以上"),
        `候補がいない旨のメッセージになる（実際: ${error}）`,
    )
}
