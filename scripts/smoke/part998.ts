// smoke パート998（P13-15 マジックスイーツ：公式 Q26733・Q26734／P13-25 十二代目ゴドフリー：好きなだけ同時に無償召喚）
import { assert, createGame, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { scenario } from "./scenario"

const SWEETS = "P13-15" // マジックスイーツ（黄マジック・コスト4・フラッシュ）
const GODFREY = "P13-25" // 十二代目ゴドフリー（青・コスト6）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000）
const BERSERK = "BS01-074" // バーサーカー・ガン（白・コスト1・BP1000）
const WOLF = "BS21-002" // ウォルフドラゴン（赤・コスト2・Lv1 BP2000・【強化】）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SWEETS).name === "マジックスイーツ" && getCard(SWEETS).type === "magic", "SWEETSはマジック")
    assert(getCard(GODFREY).name === "十二代目ゴドフリー" && getCard(GODFREY).cost === 6, "GODFREYはコスト6")
    assert(getCard(BERSERK).levels[0]!.bp === 1000 && getCard(WOLF).levels[0]!.bp === 2000, "BP1000と2000の相手役")
}

const cast = (t: Parameters<Parameters<typeof scenario>[0]["steps"]>[0], target: string) => {
    t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id(target) })
    t.closeFlash()
}
const castLines = ["自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4", "自分.手札: マジックスイーツ → なし", "自分.トラッシュ: なし → マジックスイーツ"]

// 「この効果でそのスピリットがターンで初めてBP0になったとき」＝BP1000の相手が-1000で0になる場面
scenario({
    name: "sweets-bp0-first-time-recovers",
    start: { me: { hand: [SWEETS], spirits: [{ card: VANILLA, rested: true }] }, opp: { spirits: [{ card: BERSERK }] } },
    steps: (t) => cast(t, "バーサーカー・ガン"),
    expect: [...castLines, "自分.ロクケラトプス.疲労: true → false", "相手.バーサーカー・ガン.BP: 1000 → 0"] // BP0 になっても破壊されない（Q26732）,
})
// BP0にならない：回復しない
scenario({
    name: "sweets-bp-not-zero-no-recover",
    start: { me: { hand: [SWEETS], spirits: [{ card: VANILLA, rested: true }] }, opp: { spirits: [{ card: WOLF }] } },
    steps: (t) => cast(t, "ウォルフドラゴン"),
    expect: [...castLines, "相手.ウォルフドラゴン.BP: 2000 → 1000"],
})
// 回復させるのは「自分のスピリット」。相手側の疲労スピリットは回復しない
scenario({
    name: "sweets-recover-mine-not-opp-rested",
    start: { me: { hand: [SWEETS], spirits: [{ card: VANILLA, rested: true }] }, opp: { spirits: [{ card: BERSERK }, { card: WOLF, rested: true }] } },
    steps: (t) => cast(t, "バーサーカー・ガン"),
    expect: [...castLines, "自分.ロクケラトプス.疲労: true → false", "相手.バーサーカー・ガン.BP: 1000 → 0"] // BP0 になっても破壊されない（Q26732）,
})
// 回復が任意でなく、回復状態の味方しかいなくても処理は成立する（変化は相手の破壊と使用コストだけ）
scenario({
    name: "sweets-bp0-no-rested-ally",
    start: { me: { hand: [SWEETS], spirits: [{ card: VANILLA }] }, opp: { spirits: [{ card: BERSERK }] } },
    steps: (t) => cast(t, "バーサーカー・ガン"),
    expect: [...castLines, "相手.バーサーカー・ガン.BP: 1000 → 0"] // BP0 になっても破壊されない（Q26732）,
})

console.log("=== P13-25 ゴドフリー ===")
function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 12
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}
{
    const s = game("godfrey-1")
    // 対象：SD16-002（青コスト2【強化】）＝手札、BS19-057（青コスト1【強化】）・BS19-061（青コスト3【強化】）＝トラッシュ
    // 対象外：BS21-049（青コスト3・強化なし）、BS06-069（青コスト4・強化なし）、WOLF（赤コスト2【強化】）
    s.players.p1.hand = [GODFREY, "SD16-002", "BS21-049", "BS06-069", WOLF]
    s.players.p1.trashCards = ["BS19-057", "BS19-061"]
    handleAction(s, "p1", { type: "summon", handIndex: 0 })
    const onField = s.players.p1.field.spirits.map((x) => getCard(x.cardId).name)
    for (const n of ["十二代目ゴドフリー", "豪拳のロジャー", "光の衛士アドリアン", "光の闘士ランダル"]) assert(onField.includes(n), `${n}がフィールドにいる`)
    assert(onField.length === 4, "条件外の3枚は召喚されない")
    const hand = s.players.p1.hand.map((c) => getCard(c).name)
    assert(hand.length === 3 && hand.includes("海の彫刻家ナポレオ") && hand.includes("ツァトゥグァ") && hand.includes("ウォルフドラゴン"), "条件外の3枚は手札に残る")
    assert(s.players.p1.trashCards.length === 0, "トラッシュの対象は2枚とも召喚された")
}
{
    const s = game("godfrey-2")
    s.players.p1.hand = [GODFREY, "BS21-049", WOLF]
    handleAction(s, "p1", { type: "summon", handIndex: 0 })
    assert(s.players.p1.field.spirits.length === 1 && s.players.p1.hand.length === 2, "対象が無ければゴドフリーだけが召喚される")
}
{
    const s = game("godfrey-3")
    s.players.p2.hand = ["SD16-002"]
    s.players.p2.trashCards = ["BS19-057"]
    s.players.p1.hand = [GODFREY]
    handleAction(s, "p1", { type: "summon", handIndex: 0 })
    assert(s.players.p2.field.spirits.length === 0 && s.players.p1.field.spirits.length === 1, "相手の手札・トラッシュは対象外")
}

console.log("すべてのチェックに合格しました 🎉（part998）")
