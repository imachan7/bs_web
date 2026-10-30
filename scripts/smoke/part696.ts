// smoke パート696（BS15-052 天蒼元帥チョウハッカイ「お互い、スピリット/ブレイヴ/ネクサス/マジックの効果で、手札を増やす/破棄することができない」
// 公式Q&A Q3589〜Q3593・Q22193 だけを根拠にした期待値。それぞれ対照にチョウハッカイ無しの場面を置く）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart, answerPayConfirm } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { placeBurst } from "../../server/src/logic/EffectModules"

const CHOU = "BS15-052" // 天蒼元帥チョウハッカイ
const SANSATSU = "BS15-074" // 三札之術（赤マジック。メイン：2枚ドロー、1枚オープンして赤スピリットなら手札へ）
const VULCAN = "BS12-060" // バルカン・アームズ（ブレイヴ。召喚時：3枚ドロー、手札2枚破棄）
const SHAKUNETSU = "BS06-073" // 灼熱の谷（ネクサス。Lv1 ドロー+1枚、ドロー後に手札1枚破棄）
const BENKEI = "BS14-030" // グラント・ベンケイ（バースト：手札1枚破棄、その後手札に戻す）
const INOCHI = "BS10-087" // 戦場に息づく命（ネクサス。コアを置かないことで1枚ドロー）
const RIBBON = "BS01-146" // ドリームリボン（白フラッシュ：相手のスピリット1体を手札に戻す）
const VAN = "BS01-002" // ロクケラトプス（フィラー）
const RED = "BS01-003" // テラノセイバー（赤スピリット）
const H1 = "BS01-004" // ドラグノ偵察兵（手札のおもり）
const H2 = "BS01-006" // メラット（手札のおもり）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [[CHOU, "天蒼元帥チョウハッカイ"], [SANSATSU, "三札之術"], [VULCAN, "バルカン・アームズ"], [SHAKUNETSU, "灼熱の谷"],
        [BENKEI, "グラント・ベンケイ"], [INOCHI, "戦場に息づく命"], [RIBBON, "ドリームリボン"], [VAN, "ロクケラトプス"], [RED, "テラノセイバー"], [H1, "ドラグノ偵察兵"], [H2, "メラット"]]
    for (const [id, n] of names) assert(getCard(id).name === n, `${id}は${n}`)
    assert(getCard(RED).type === "spirit" && getCard(RED).colors.includes("red"), "REDは赤のスピリット")
}

function game(seed: string, turnPlayer: PlayerId, p1Hand: string[] = [], p2Hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = "main"
    s.interactiveTargets = false
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.hand = [...(pid === "p1" ? p1Hand : p2Hand)]
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number, kind: "spirits" | "nexuses" = "spirits") {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field[kind].push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== Q3589: 三札之術。チョウハッカイがいると、オープンした赤スピリットは手札に加わらずデッキの上にも戻らず破棄される ===")
for (const chou of [true, false]) {
    const s = game(`q3589-${chou}`, "p1", [SANSATSU])
    s.players.p1.deck = [RED, RED, RED, ...Array.from({ length: 37 }, () => VAN)] // ドローが起きても起きなくても開くのは赤スピリット
    if (chou) put(s, "p2", CHOU, 1)
    const e = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" })
    assert(e === null, `Q3589: 三札之術を使える（${e}）`)
    const p = s.players.p1
    if (chou) {
        assert(!p.hand.includes(RED), "Q3589: 赤スピリットは手札に加えられない")
        assert(p.deck.length === 39, `Q3589: デッキの上にも戻らず1枚減る（${p.deck.length}）`)
        assert(p.trashCards.includes(RED), "Q3589: 破棄される（トラッシュにある）")
    } else {
        assert(p.hand.includes(RED), "Q3589対照: 赤スピリットが手札に加わる")
        assert(!p.trashCards.includes(RED), "Q3589対照: 破棄されない")
    }
}

console.log("=== Q3590: 手札に戻す効果は、手札を増やせないのでまるごと解決されない（スピリットは場に残る） ===")
for (const chou of [true, false]) {
    const s = game(`q3590-${chou}`, "p1", [RIBBON])
    const target = put(s, "p2", VAN, 1)
    if (chou) put(s, "p1", CHOU, 1)
    s.isFlashTiming = true
    const e = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: target.instanceId })
    s.isFlashTiming = false
    assert(e === null, `Q3590: ドリームリボンを使える（${e}）`)
    const onField = s.players.p2.field.spirits.some(x => x.instanceId === target.instanceId)
    assert(onField === chou, chou ? "Q3590: 戻すはずのスピリットは場に残る" : "Q3590対照: 手札に戻る")
    assert(s.players.p2.hand.length === (chou ? 0 : 1), `Q3590: 相手の手札の枚数（${s.players.p2.hand.length}）`)
}

console.log("=== Q3591: バルカン・アームズの召喚時効果。3枚ドローも2枚破棄も起きない ===")
for (const chou of [true, false]) {
    const s = game(`q3591-${chou}`, "p1", [VULCAN, H1, H2])
    if (chou) put(s, "p2", CHOU, 1)
    const e = act(s, "p1", { type: "summon", handIndex: 0 })
    assert(e === null, `Q3591: バルカン・アームズを召喚できる（${e}）`)
    assert(s.players.p1.hand.length === (chou ? 2 : 3), `Q3591: 手札の枚数（${s.players.p1.hand.length}）。召喚で1枚減り、対照だけ+3-2`)
    assert(s.players.p1.deck.length === (chou ? 40 : 37), `Q3591: デッキの枚数（${s.players.p1.deck.length}）`)
    assert(s.players.p1.trashCards.length === (chou ? 0 : 2), `Q3591: 破棄された枚数（${s.players.p1.trashCards.length}）`)
}

console.log("=== Q3592: 灼熱の谷 Lv1。ドローステップは2枚引く（ドロー枚数+1は手札を増やす効果ではない）が、ドロー後の1枚破棄は起きない ===")
for (const chou of [true, false]) {
    const s = game(`q3592-${chou}`, "p1")
    s.turn = 4
    s.turnPlayer = "p1"
    s.players.p1.hand = [H1, H2]
    put(s, "p1", SHAKUNETSU, 0, "nexuses")
    if (chou) put(s, "p2", CHOU, 1)
    runTurnStart(s)
    assert(s.turnPlayer === "p1", `Q3592: p1 のターンになった（${s.turnPlayer}）`)
    assert(s.players.p1.hand.length === (chou ? 4 : 3), `Q3592: 手札の枚数（${s.players.p1.hand.length}）。2枚引き、対照だけ1枚破棄`)
    assert(s.players.p1.trashCards.length === (chou ? 0 : 1), `Q3592: 破棄の枚数（${s.players.p1.trashCards.length}）`)
}

console.log("=== Q3593: 相手のベンケイのバースト。手札は破棄されず、ベンケイは手札に戻れずトラッシュに置かれる ===")
for (const chou of [true, false]) {
    const s = game(`q3593-${chou}`, "p1")
    s.phase = "attack"
    s.players.p1.hand = [H1] // 「相手は、相手の手札1枚を破棄する」＝バーストの持ち主（p2）から見た相手、つまりアタックした p1 が自分の手札を破棄する
    s.players.p2.life = 2
    placeBurst(s, "p2", BENKEI)
    if (chou) put(s, "p1", CHOU, 1)
    const atk = put(s, "p1", VAN, 1)
    atk.isRested = false
    const e = act(s, "p1", { type: "attack", instanceId: atk.instanceId })
    assert(e === null, `Q3593: アタックできる（${e}）`)
    for (let i = 0; i < 2; i++) act(s, s.priorityPlayer, { type: "pass" }) // アタック後のフラッシュを両者パス
    const e2 = act(s, "p2", { type: "takeLife" })
    assert(e2 === null, `Q3593: ライフで受ける（${e2}）`)
    if (s.pendingChoice !== null) {
        const pc = s.pendingChoice
        const opts = (pc as { options?: string[] }).options ?? []
        act(s, pc.pid, { type: "resolveChoice", option: opts.includes("発動する") ? "発動する" : opts[0] ?? "" })
    }
    const p = s.players.p2
    const q = s.players.p1
    assert(p.life === 1, `Q3593: ライフが減った（${p.life}）`)
    if (chou) {
        assert(q.hand.includes(H1) && !q.trashCards.includes(H1), "Q3593: 手札は破棄されない")
        assert(!p.hand.includes(BENKEI) && p.trashCards.includes(BENKEI), "Q3593: ベンケイは手札に戻れずトラッシュに置かれる")
    } else {
        assert(!q.hand.includes(H1) && q.trashCards.includes(H1), "Q3593対照: 手札1枚が破棄される")
        assert(p.hand.includes(BENKEI), "Q3593対照: ベンケイは手札に戻る")
    }
}

console.log("=== Q22193: 戦場に息づく命のコアステップ。相手のチョウハッカイがいると「置かない」方は選べず、コアはボイドから置かれる ===")
for (const chou of [true, false]) {
    const s = game(`q22193-${chou}`, "p1")
    s.turn = 4
    s.turnPlayer = "p1"
    s.players.p1.reserve = 0
    put(s, "p1", INOCHI, 0, "nexuses")
    if (chou) put(s, "p2", CHOU, 1)
    runTurnStart(s)
    const pc = s.pendingChoice
    const offered = pc !== null && pc.kind === "option" && ((pc as { options?: string[] }).options ?? []).includes("発動する")
    assert(!(chou && offered), "Q22193: 「置かない」選択は出ない")
    if (!chou) answerPayConfirm(s, "p1") // 対照は確認が出ずに自動で解決されることがある
    assert(s.players.p1.reserve === (chou ? 1 : 0), `Q22193: コアステップのコアはボイドからリザーブへ（${s.players.p1.reserve}）。対照は置かず代わりにドロー`)
    assert(s.players.p1.hand.length === (chou ? 1 : 2), `Q22193: 手札（${s.players.p1.hand.length}）。ドローステップの1枚だけ、対照は+1`)
}

console.log("すべてのチェックに合格しました 🎉（part696）")
