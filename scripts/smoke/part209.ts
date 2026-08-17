// smoke パート209（効果文と実装の意味照合＝`npm run audit:semantics` の S6 軸で見つかった実バグ）
//
// BS08-060 無限蟻の地底都市 Lv1-2『相手のアタックステップ』
// 「BP6000以下の相手のスピリットがアタックしたとき、ボイドからコア1個を、
//   系統：「殻虫」/「殻人」を持つ**自分の**スピリット1体の上に置く。」
//
// fieldEvent の anySpiritAttacked は selfOverride に**アタックしたスピリット**を渡すため、
// そのままだと resolveAction の owner がアタック側（＝相手）になり、
// 「自分のスピリット」が**相手のスピリット**を指してしまっていた
// （相手に殻虫/殻人がいなければ不発、いればコアを与えてしまう）。
// SEMANTICS_AUDIT.md §3.1 のとおり selfMode:"source" で発生源側に固定する。
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const CITY = "BS08-060" // 無限蟻の地底都市（ネクサス）
const BEETLE = "BS01-050" // ビートビートル（殻虫・バニラ・Lv1 BP1000）
const STAG = "BS03-025" // スタッグシザー（殻虫・バニラ・Lv1 BP1000）
const PHANTASMA = "BS02-014" // ファンタズマ（霊獣・バニラ・Lv2 BP4000＝BP6000以下）

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard(CITY).name === "無限蟻の地底都市" && getCard(CITY).type === "nexus", "BS08-060 は無限蟻の地底都市（ネクサス）")
    assert(getCard(BEETLE).name === "ビートビートル" && getCard(BEETLE).family.includes("殻虫"), "BS01-050 はビートビートル（殻虫）")
    assert(getCard(STAG).name === "スタッグシザー" && getCard(STAG).family.includes("殻虫"), "BS03-025 はスタッグシザー（殻虫）")
    assert(
        getCard(PHANTASMA).name === "ファンタズマ" && !getCard(PHANTASMA).family.includes("殻虫"),
        "BS02-014 はファンタズマ（殻虫ではない）",
    )
}

interface Setup {
    s: GameState
    attackerId: string
    ownBeetleId: string
    oppStagId: string
}

// p1（非ターンプレイヤー）に無限蟻の地底都市と殻虫、p2 に BP6000以下のアタッカー。
// opts.oppHasKarachu で「相手側にも殻虫がいる」状況を作る（主体が入れ替わっていれば
// そちらにコアが乗ってしまうので、向きの誤りが検出できる）
function setup(seed: string, opts: { oppHasKarachu?: boolean; ownHasKarachu?: boolean } = {}): Setup {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "purple" })
    runTurnStart(s)
    const nexus = createInstance(CITY, s.turn, 1)
    s.players.p1.field.nexuses.push(nexus)
    let ownBeetleId = ""
    if (opts.ownHasKarachu !== false) {
        const beetle = createInstance(BEETLE, s.turn, 1)
        s.players.p1.field.spirits.push(beetle)
        ownBeetleId = beetle.instanceId
    }
    s.turnPlayer = "p2"
    s.phase = "attack"
    const attacker = createInstance(PHANTASMA, s.turn, 3) // Lv2 BP4000
    s.players.p2.field.spirits.push(attacker)
    let oppStagId = ""
    if (opts.oppHasKarachu) {
        const stag = createInstance(STAG, s.turn, 1)
        s.players.p2.field.spirits.push(stag)
        oppStagId = stag.instanceId
    }
    return { s, attackerId: attacker.instanceId, ownBeetleId, oppStagId }
}

function coresOf(s: GameState, pid: "p1" | "p2", instanceId: string): number {
    return s.players[pid].field.spirits.find((x) => x.instanceId === instanceId)?.cores ?? -1
}

console.log("=== コアが乗るのは「自分の」殻虫（発生源の持ち主側） ===")
{
    const { s, attackerId, ownBeetleId } = setup("mugiari-own")
    assert(act(s, "p2", { type: "attack", instanceId: attackerId }) === null, "BP6000以下の相手スピリットがアタック")
    assert(coresOf(s, "p1", ownBeetleId) === 2, "自分（p1）の殻虫にボイドからコアが1個乗る")
}

console.log("=== 相手にも殻虫がいるとき、相手側には乗らない ===")
{
    const { s, attackerId, ownBeetleId, oppStagId } = setup("mugiari-both", { oppHasKarachu: true })
    assert(act(s, "p2", { type: "attack", instanceId: attackerId }) === null, "アタック")
    assert(coresOf(s, "p1", ownBeetleId) === 2, "自分の殻虫にコアが乗る")
    assert(coresOf(s, "p2", oppStagId) === 1, "相手の殻虫にはコアが乗らない（主体が入れ替わっていない）")
}

console.log("=== 自分に殻虫がいなければ、相手に殻虫がいても不発 ===")
{
    const { s, attackerId, oppStagId } = setup("mugiari-none", { ownHasKarachu: false, oppHasKarachu: true })
    assert(act(s, "p2", { type: "attack", instanceId: attackerId }) === null, "アタック")
    assert(coresOf(s, "p2", oppStagId) === 1, "相手の殻虫は増えない（対象がいないので不発）")
}
