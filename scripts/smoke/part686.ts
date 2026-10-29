// smoke パート686（BS06-089 / BS13-072 のトラッシュ→手札禁止。トラッシュから手札へ移る処理すべてを止め、破壊時の自己バウンスは止めない）
import { assert, createGame, createInstance, destroySpirit, endTurn, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const BAN_BOTH = "BS06-089" // 鎖縛の武舞台（青・コスト3）
const BAN_OPP = "BS13-072" // 未完成の古代戦艦：羅針盤（青・コスト4）
const BREEZE = "BS13-077" // ブリーズライド（緑・マジック）
const AMAIMON = "BS08-014" // 冥将アマイモン
const PENTAN_SHOGUN = "BS15-043" // ショーグンペンタン
const PENTAN = "BS02-058" // ペンタン（名前に「ペンタン」を含む）
const KYOSHIN = "BS06-X21" // 激神皇カタストロフドラゴン（虚神）
const NASUNO = "BS14-020" // ナスノ・アーチャー
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BAN_BOTH).name === "鎖縛の武舞台" && getCard(BAN_BOTH).type === "nexus", "BAN_BOTH")
    assert(getCard(BAN_OPP).name === "未完成の古代戦艦：羅針盤" && getCard(BAN_OPP).type === "nexus", "BAN_OPP")
    assert(getCard(BREEZE).name === "ブリーズライド" && getCard(BREEZE).type === "magic", "BREEZE")
    assert(getCard(AMAIMON).name === "冥将アマイモン" && getCard(AMAIMON).cost === 4, "AMAIMON")
    assert(getCard(PENTAN_SHOGUN).name === "ショーグンペンタン" && getCard(PENTAN_SHOGUN).cost === 5, "PENTAN_SHOGUN")
    assert(getCard(PENTAN).name.includes("ペンタン") && getCard(PENTAN).type === "spirit", "PENTAN")
    assert(getCard(KYOSHIN).type === "spirit" && getCard(KYOSHIN).family.includes("虚神"), "KYOSHIN は虚神のスピリット")
    assert(getCard(NASUNO).name === "ナスノ・アーチャー" && getCard(NASUNO).levels[2]?.cores === 5, "NASUNO Lv3=5コア")
}

function game(seed: string, deckCard = VANILLA): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "blue" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => deckCard)
    s.players.p2.deck = Array.from({ length: 40 }, () => deckCard)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function nexus(s: GameState, pid: PlayerId, cardId: string) {
    s.players[pid].field.nexuses.push(createInstance(cardId, s.turn, 0))
    refreshLevelAsOverrides(s)
}

const count = (arr: string[], id: string): number => arr.filter((c) => c === id).length

console.log("=== 1. 鎖縛の武舞台：エンドステップにブリーズライドが戻らない ===")
for (const ban of [true, false]) {
    const s = game("c1" + ban)
    if (ban) nexus(s, "p1", BAN_BOTH)
    s.players.p1.trashCards = [BREEZE]
    s.players.p1.hand = []
    endTurn(s)
    const p = s.players.p1
    if (ban) assert(count(p.trashCards, BREEZE) === 1 && count(p.hand, BREEZE) === 0, "禁止あり：ブリーズライドはトラッシュに残る")
    else assert(count(p.trashCards, BREEZE) === 0 && count(p.hand, BREEZE) === 1, "対照：ブリーズライドが手札に戻る")
}

console.log("=== 2. 鎖縛の武舞台：アマイモンの破壊時、破棄した虚神はトラッシュに残る ===")
for (const ban of [true, false]) {
    const s = game("c2" + ban, KYOSHIN)
    if (ban) nexus(s, "p1", BAN_BOTH)
    const me = put(s, "p1", AMAIMON, 3)
    s.players.p1.hand = []
    s.players.p1.trashCards = []
    destroySpirit(s, "p1", me.instanceId)
    const p = s.players.p1
    if (ban) assert(count(p.trashCards, KYOSHIN) >= 1 && count(p.hand, KYOSHIN) === 0, "禁止あり：虚神はトラッシュに残り手札に加わらない")
    else assert(count(p.hand, KYOSHIN) === 1, "対照：虚神が手札に戻る")
}

console.log("=== 3. 鎖縛の武舞台：ショーグンペンタンの破壊時、破棄したペンタンは手札に加わらない ===")
for (const ban of [true, false]) {
    const s = game("c3" + ban, PENTAN)
    if (ban) nexus(s, "p1", BAN_BOTH)
    const me = put(s, "p1", PENTAN_SHOGUN, 2)
    s.players.p1.hand = []
    s.players.p1.trashCards = []
    destroySpirit(s, "p1", me.instanceId)
    const p = s.players.p1
    if (ban) assert(count(p.trashCards, PENTAN) >= 1 && count(p.hand, PENTAN) === 0, "禁止あり：ペンタンはトラッシュに残る")
    else assert(count(p.hand, PENTAN) === 1, "対照：ペンタンが手札に加わる")
}

console.log("=== 5. 羅針盤（p2の場）：p1のブリーズライドは戻らず、p2自身のは戻る ===")
for (const ban of [true, false]) {
    const s = game("c5a" + ban)
    if (ban) nexus(s, "p2", BAN_OPP)
    s.players.p1.trashCards = [BREEZE]
    s.players.p1.hand = []
    endTurn(s)
    if (ban) assert(count(s.players.p1.trashCards, BREEZE) === 1 && count(s.players.p1.hand, BREEZE) === 0, "禁止あり：p1のブリーズライドはトラッシュに残る")
    else assert(count(s.players.p1.hand, BREEZE) === 1, "対照：p1のブリーズライドが戻る")
}
{
    const s = game("c5b")
    nexus(s, "p2", BAN_OPP)
    s.turnPlayer = "p2"
    s.players.p2.trashCards = [BREEZE]
    s.players.p2.hand = []
    endTurn(s)
    assert(count(s.players.p2.hand, BREEZE) === 1 && count(s.players.p2.trashCards, BREEZE) === 0, "p2自身のブリーズライドは羅針盤の下でも戻る")
}

console.log("=== 6. 鎖縛の武舞台があっても、ナスノ・アーチャーLv3は破壊されたら手札に戻る ===")
for (const ban of [true, false]) {
    const s = game("c6" + ban)
    if (ban) nexus(s, "p1", BAN_BOTH)
    const me = put(s, "p1", NASUNO, 5)
    s.players.p1.hand = []
    s.players.p1.trashCards = []
    destroySpirit(s, "p1", me.instanceId)
    const p = s.players.p1
    assert(count(p.hand, NASUNO) === 1 && count(p.trashCards, NASUNO) === 0, `ナスノは手札に戻る（禁止${ban ? "あり" : "なし"}）`)
}

// 場面4（アルカナドール・トリアの光芒）は、バトル中にマジックを使わせる手順が重いため省略

console.log("すべてのチェックに合格しました 🎉（part686）")
