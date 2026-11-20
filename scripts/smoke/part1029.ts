// smoke パート1029（#631 GX15 ブレイヴホライゾン：moveCards combineToEach＝「アポロ」入りの各スピリットへ別のブレイヴを同時に直接合体）
import { assert, bpBuffOf, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1）
const APO1 = "BS06-010" // 戦斧のアポロディノス（赤・コスト5）
const APO2 = "X005R" // 北斗七星龍ジーク・アポロドラゴン（赤・コスト6）
const RET = "BS11-059" // レチクル・アームズ（ブレイヴ・コスト3・合体条件コスト3以上・召喚時：相手のデッキを上から3枚破棄）
const BAN = "BS19-071" // バンブール（ブレイヴ・コスト3・合体条件コスト3以上）
const HIHI = "BS19-069" // ヒヒ・ボーン（ブレイヴ・コスト3・合体条件コスト3以下・召喚時：1枚ドロー）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("GX15").name === "ブレイヴホライゾン" && getCard("GX15").cost === 3, "GX15")
    assert(getCard(APO1).name.includes("アポロ") && getCard(APO2).name.includes("アポロ") && getCard(APO1).cost === 5 && getCard(APO2).cost === 6, "アポロ2体")
    assert(getCard(RET).name === "レチクル・アームズ" && getCard(RET).type === "brave", "RET")
    assert(getCard(BAN).name === "バンブール" && getCard(BAN).type === "brave", "BAN")
    assert(getCard(HIHI).name === "ヒヒ・ボーン" && getCard(HIHI).type === "brave", "HIHI")
}

function game(seed: string, name: string, deckHead: string[]): GameState {
    const s = createGame(seed, { p1: name, p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 12
    s.players.p2.reserve = 12
    s.players.p1.deck = [...deckHead, ...Array.from({ length: 20 }, () => VAN)]
    s.players.p2.deck = Array.from({ length: 30 }, () => VAN)
    s.players.p1.field.spirits.length = 0
    s.players.p2.field.spirits.length = 0
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn - 1, 3)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const cast = (s: GameState): void => {
    s.players.p1.hand = ["GX15"]
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "GX15を使えた")
}
// 「発動する」の確認が出たら承認し、カード選択には picks（デッキのカードID。無ければ null＝選ばずに終える）を順に答える
function run(s: GameState, picks: (string | null)[]): string[][] {
    const shown: string[][] = []
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        if (pc.kind === "option") {
            handleAction(s, "p1", { type: "resolveChoice", option: pc.options![0]! })
        } else if (pc.kind === "card" && pc.cardZone === "deck") {
            const deck = s.players[pc.cardOwner!].deck
            shown.push(pc.cardIndices!.map((j) => deck[j]!))
            const want = picks.shift()
            if (want === null || want === undefined) handleAction(s, "p1", { type: "resolveChoice" })
            else handleAction(s, "p1", { type: "resolveChoice", cardIndex: pc.cardIndices!.find((j) => deck[j] === want)! })
        } else {
            handleAction(s, "p1", { type: "resolveChoice" })
        }
    }
    return shown
}
const bravesOn = (s: GameState, host: ReturnType<typeof createInstance>): string[] =>
    (host.braveRefs ?? []).map((r) => s.players.p1.field.combinedBraves.find((b) => b.instanceId === r.instanceId)!.cardId)
const sorted = (a: string[]): string => [...a].sort().join(",")

console.log("=== 1. アポロ2体に別々のブレイヴを選んで同時に合体・合体条件を満たさない組は選べない・デッキはシャッフル ===")
{
    const head = [HIHI, RET, BAN]
    const s = game("gx15-a", "馬神弾", head)
    const h1 = put(s, "p1", APO1)
    const h2 = put(s, "p1", APO2)
    const other = put(s, "p1", VAN)
    const before = [...s.players.p1.deck]
    const oppDeck = s.players.p2.deck.length
    cast(s)
    const shown = run(s, [RET, BAN])
    assert(shown.length === 2, `選択は2回（実際${shown.length}）`)
    assert(!shown[0]!.includes(HIHI), "コスト3以下の条件のヒヒ・ボーンは、コスト5・6のホストには選べない")
    assert(shown[0]!.includes(RET) && shown[0]!.includes(BAN), "1体目の候補はレチクルとバンブール")
    assert(shown[1]!.includes(BAN) && !shown[1]!.includes(RET), "2体目の候補は、1体目に選んだレチクルを除いたバンブール")
    assert(bravesOn(s, h1).length === 1 && bravesOn(s, h2).length === 1 && sorted([...bravesOn(s, h1), ...bravesOn(s, h2)]) === sorted([RET, BAN]), "2体にそれぞれ別のブレイヴが合体")
    assert(bravesOn(s, other).length === 0, "名前に「アポロ」が入っていないスピリットには合体しない")
    assert(s.players.p2.deck.length === oppDeck - 3, "レチクルの召喚時効果（相手のデッキ3枚破棄）が発揮")
    const d = s.players.p1.deck
    assert(d.length === before.length - 2, "デッキは2枚減る")
    assert(sorted(d) === sorted(before.filter((_, i) => i !== before.indexOf(RET)).filter((id, i, a) => i !== a.indexOf(BAN))), "デッキの中身の集合は選んだ2枚を除いたもの")
    const logs = s.log.map((l) => (typeof l === "string" ? l : JSON.stringify(l)))
    const iSummon = Math.max(...logs.map((l, i) => (l.includes("レチクル・アームズ") && l.includes("召喚") && !l.includes("破棄") ? i : -1)))
    const iBanSummon = Math.max(...logs.map((l, i) => (l.includes("バンブール") && l.includes("召喚") ? i : -1)))
    const iMill = logs.findIndex((l) => l.includes("ユウキのデッキを上から3枚"))
    assert(iMill >= 0 && iSummon >= 0 && iBanSummon >= 0 && iMill > iSummon && iMill > iBanSummon, "召喚時効果は2枚とも召喚し終えてから")
}

console.log("=== 2. ブレイヴが1枚しか選べなければ1体だけ ===")
{
    const s = game("gx15-b", "馬神弾", [RET, HIHI])
    const h1 = put(s, "p1", APO1)
    const h2 = put(s, "p1", APO2)
    cast(s)
    const shown = run(s, [RET])
    assert(shown.length === 1, "選択は1回だけ（2体目は選べるブレイヴが無いので聞かない）")
    assert(bravesOn(s, h1).length + bravesOn(s, h2).length === 1, "1体だけ合体")
}

console.log("=== 3. 選ばずに飛ばす（1体目だけ選んで2体目は飛ばす・全員飛ばす） ===")
{
    const s = game("gx15-c", "馬神弾", [RET, BAN])
    const h1 = put(s, "p1", APO1)
    const h2 = put(s, "p1", APO2)
    cast(s)
    run(s, [RET, null])
    assert(bravesOn(s, h1).length + bravesOn(s, h2).length === 1, "2体目を飛ばせば、その分だけ合体")
    assert(s.players.p1.deck.length === 21, "選ばなかったブレイヴはデッキに残る（22枚から1枚）")
    const s2 = game("gx15-c2", "馬神弾", [RET, BAN])
    const g1 = put(s2, "p1", APO1)
    cast(s2)
    const before = [...s2.players.p1.deck]
    run(s2, [null])
    assert(bravesOn(s2, g1).length === 0, "最初から選ばなければ合体しない")
    assert(sorted(s2.players.p1.deck) === sorted(before) && s2.players.p1.deck.length === before.length, "選ばなくてもシャッフル後の枚数・中身は同じ")
}

console.log("=== 3b. 1体目を飛ばして2体目にだけ付ける ===")
{
    const s = game("gx15-g", "馬神弾", [RET, BAN])
    const h1 = put(s, "p1", APO1)
    const h2 = put(s, "p1", APO2)
    cast(s)
    const shown = run(s, [null, BAN])
    assert(shown.length === 2, `選択は2回（実際${shown.length}）`)
    assert(bravesOn(s, h1).length === 0 && sorted(bravesOn(s, h2)) === BAN, "1体目は付けず、2体目にだけバンブール")
    assert(s.players.p1.deck.length === 21, "デッキは1枚だけ減る")
}

console.log("=== 4. シャッフルは前を発揮しなくても行う・実際に並びが変わる ===")
{
    let changed = 0
    for (let k = 0; k < 5; k++) {
        const s = game(`gx15-d${k}`, "馬神弾", [RET, BAN, HIHI])
        s.players.p1.deck = [RET, BAN, HIHI, ...Array.from({ length: 30 }, (_, i) => (i % 2 ? VAN : "BS01-001"))]
        const before = [...s.players.p1.deck]
        cast(s) // アポロがいない＝合体なし
        run(s, [])
        const d = s.players.p1.deck
        assert(d.length === before.length && sorted(d) === sorted(before), "アポロがいなくても枚数・中身は同じ")
        if (d.join() !== before.join()) changed++
    }
    assert(changed >= 4, `5回中${changed}回で並びが変わった（シャッフルされている）`)
}

console.log("=== 5. 「馬神弾」でなければ使えない ===")
{
    const s = game("gx15-e", "アキラ", [RET])
    put(s, "p1", APO1)
    s.players.p1.hand = ["GX15"]
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) !== null, "名前が違えば使えない")
}

console.log("=== 6. フラッシュ：スピリット1体をBP+3000（フラッシュはバトル中だけ使えるので、効果だけを解決して確かめる） ===")
{
    const s = game("gx15-f", "馬神弾", [])
    s.interactiveTargets = false
    const v = put(s, "p1", VAN)
    const e = getCard("GX15").effects!.find((x) => x.id === "GX15-e2")!
    assert(e.kind === "magic" && e.timing === "flash" && "action" in e, "GX15-e2はフラッシュのマジック効果")
    if (e.kind === "magic" && "action" in e) resolveAction(s, "p1", null, e.action, undefined, undefined, "magic")
    assert(bpBuffOf(s, v) === 3000, `BP+3000（実際${bpBuffOf(s, v)}）`)
}

console.log("すべてのチェックに合格しました 🎉（part1029）")
