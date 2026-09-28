// smoke パート428（B組：「Nまで」＝0〜Nの好きな数を選べる。upTo軸の確認）
// 対象：BS01-115アウェイクン（placeCores）／BS02-024暗黒将軍ブラッディ・シーザー（removeCores count:"any"）／
// BS06-057アルカナキング・カール（summonFromHandFree）／BS13-010スカルザード（summonFromTrashFree）／
// BS15-082神閃月下（toDeck）。2026-09-28ユーザー決定：対話時は0〜Nの好きな数、途中でやめられる。非対話は従来どおり選べるだけ選ぶ
import {
    act,
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const AWAKEN = "BS01-115" // アウェイクン（赤・マジック・コスト3）
const CAESAR = "BS02-024" // 暗黒将軍ブラッディ・シーザー（紫・スピリット・コスト7）
const ARCANA_KING = "BS06-057" // アルカナキング・カール（黄・スピリット・コスト5）
const ARCANA_BEAST = "BS02-056" // アルカナビースト・ケン（黄・スピリット・コスト2）
const SKULLZARD = "BS13-010" // スカルザード（紫・スピリット・コスト2）
const GOLADON = "BS01-001" // ゴラドン（赤・スピリット・コスト0）
const SHINSENGEKKA = "BS15-082" // 神閃月下（黄・マジック・コスト7）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(AWAKEN).name === "アウェイクン" && getCard(AWAKEN).type === "magic", "AWAKENはマジック")
    assert(getCard(CAESAR).name === "暗黒将軍ブラッディ・シーザー" && getCard(CAESAR).cost === 7, "CAESARはコスト7")
    assert(getCard(ARCANA_KING).name === "アルカナキング・カール", "ARCANA_KINGの名前")
    assert(getCard(ARCANA_BEAST).name === "アルカナビースト・ケン" && getCard(ARCANA_BEAST).cost === 2, "ARCANA_BEASTはコスト2")
    assert(getCard(SKULLZARD).name === "スカルザード", "SKULLZARDの名前")
    assert(getCard(GOLADON).name === "ゴラドン" && getCard(GOLADON).cost === 0, "GOLADONはコスト0")
    assert(getCard(SHINSENGEKKA).name === "神閃月下", "SHINSENGEKKAの名前")
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. アウェイクン placeCores upTo：対話は0〜3をstepperで選べる ===")
{
    const s = game("case1-awaken", true)
    const target = put(s, "p1", VANILLA, 1)
    resolveAction(s, "p1", null, { type: "placeCores", from: "reserve", to: "spirit", count: 3, upTo: true })
    assert(s.pendingChoice?.kind === "option", "個数選択がoption")
    assert(s.pendingChoice?.stepper === true, "stepper表示")
    assert(JSON.stringify(s.pendingChoice?.options) === JSON.stringify(["0", "1", "2", "3"]), `候補は0〜3（実際:${JSON.stringify(s.pendingChoice?.options)}）`)
    act(s, "p1", { type: "resolveChoice", option: "2" })
    assert(target.cores === 3, `コア2個追加で3（実際:${target.cores}）`)
    assert(s.players.p1.reserve === 8, `リザーブ8（実際:${s.players.p1.reserve}）`)
}

console.log("=== 2. アウェイクン placeCores upTo：0を選んで終えられる ===")
{
    const s = game("case2-awaken-zero", true)
    const target = put(s, "p1", VANILLA, 1)
    resolveAction(s, "p1", null, { type: "placeCores", from: "reserve", to: "spirit", count: 3, upTo: true })
    act(s, "p1", { type: "resolveChoice", option: "0" })
    assert(target.cores === 1, "0を選んだのでコアは増えない")
    assert(s.players.p1.reserve === 10, "リザーブも減らない")
}

console.log("=== 3. アウェイクン placeCores upTo：非対話は従来どおり選べるだけ置く ===")
{
    const s = game("case3-awaken-auto", false)
    const target = put(s, "p1", VANILLA, 1)
    resolveAction(s, "p1", null, { type: "placeCores", from: "reserve", to: "spirit", count: 3, upTo: true })
    assert(target.cores === 4, `非対話はcount上限まで置く（実際:${target.cores}）`)
}

console.log("=== 4. ブラッディ・シーザー removeCores count:any：0〜2をstepperで選べ、途中でやめられる ===")
{
    const s = game("case4-caesar", true)
    const self = put(s, "p1", CAESAR, 3)
    const blocker = put(s, "p2", VANILLA, 3)
    blocker.cores = 3
    resolveAction(s, "p1", self, { type: "removeCores", count: "any", anyMax: 2 })
    assert(s.pendingChoice?.kind === "option" && s.pendingChoice.stepper === true, "個数選択がstepper")
    assert(JSON.stringify(s.pendingChoice?.options) === JSON.stringify(["0", "1", "2"]), `候補は0〜2（実際:${JSON.stringify(s.pendingChoice?.options)}）`)
    act(s, "p1", { type: "resolveChoice", option: "1" })
    assert(blocker.cores === 2, `1個だけ取って2（実際:${blocker.cores}）`)
}

console.log("=== 5. ブラッディ・シーザー removeCores count:any：非対話は従来どおり上限まで取る ===")
{
    const s = game("case5-caesar-auto", false)
    const self = put(s, "p1", CAESAR, 3)
    const blocker = put(s, "p2", VANILLA, 3)
    blocker.cores = 3
    resolveAction(s, "p1", self, { type: "removeCores", count: "any", anyMax: 2 })
    assert(blocker.cores === 1, `非対話は2個取る（実際:${blocker.cores}）`)
}

console.log("=== 6. アルカナキング・カール summonFromHandFree upTo：候補1枚でも聞き、途中でやめられる ===")
{
    const s = game("case6-arcanaking", true)
    s.players.p1.hand = [ARCANA_BEAST, ARCANA_BEAST]
    resolveAction(s, "p1", null, { type: "summonFromHandFree", nameIncludes: "アルカナ", count: 4, upTo: true })
    assert(s.pendingChoice?.kind === "card" && s.pendingChoice.cardIndices?.length === 2, "1回目は候補2枚")
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    assert(s.players.p1.field.spirits.length === 1, "1枚目を召喚した")
    assert(s.pendingChoice?.kind === "card" && s.pendingChoice.cardIndices?.length === 1, "残り候補1枚でも聞く")
    // ここで選ばずにやめる（スキップ＝cardIndexなし）
    act(s, "p1", { type: "resolveChoice" })
    assert(!s.pendingChoice, "選択が解消した")
    assert(s.players.p1.field.spirits.length === 1, "2枚目は召喚されず1体のまま（途中でやめられた）")
    assert(s.players.p1.hand.length === 1, "手札に1枚残る")
}

console.log("=== 7. アルカナキング・カール summonFromHandFree upTo：非対話は従来どおり選べるだけ召喚する ===")
{
    const s = game("case7-arcanaking-auto", false)
    s.players.p1.hand = [ARCANA_BEAST, ARCANA_BEAST]
    resolveAction(s, "p1", null, { type: "summonFromHandFree", nameIncludes: "アルカナ", count: 4, upTo: true })
    assert(s.players.p1.field.spirits.length === 2, `非対話は候補ぶんすべて召喚する（実際:${s.players.p1.field.spirits.length}）`)
}

console.log("=== 8. スカルザード summonFromTrashFree upTo：0で終えられる ===")
{
    const s = game("case8-skullzard-zero", true)
    const self = put(s, "p1", SKULLZARD, 2)
    s.players.p1.trashCards = [GOLADON, GOLADON]
    resolveAction(s, "p1", self, { type: "summonFromTrashFree", count: 2, costFilter: { max: 1 }, upTo: true })
    assert(s.pendingChoice?.kind === "card", "個数選択の前にカード選択が立つ")
    act(s, "p1", { type: "resolveChoice" }) // スキップ＝0体
    assert(s.players.p1.field.spirits.length === 1, "召喚されない（selfの1体のみ）")
    assert(s.players.p1.trashCards.length === 2, "トラッシュも減らない")
}

console.log("=== 9. スカルザード summonFromTrashFree upTo：対話でNまで選べる ===")
{
    const s = game("case9-skullzard-full", true)
    const self = put(s, "p1", SKULLZARD, 2)
    s.players.p1.trashCards = [GOLADON, GOLADON]
    resolveAction(s, "p1", self, { type: "summonFromTrashFree", count: 2, costFilter: { max: 1 }, upTo: true })
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    assert(s.pendingChoice?.kind === "card", "2枚目も聞く")
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    assert(!s.pendingChoice, "候補が尽きて終わる")
    assert(s.players.p1.field.spirits.length === 3, "self含め3体（2体召喚）")
    assert(s.players.p1.trashCards.length === 0, "トラッシュは空になる")
}

console.log("=== 10. 神閃月下 toDeck upTo：候補1枚でも聞き、0で終えられる ===")
{
    const s = game("case10-shinsengekka-zero", true)
    s.players.p1.trashCards = [VANILLA]
    const before = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "toDeck", from: "trash", position: "bottom", count: 10, upTo: true })
    assert(s.pendingChoice?.kind === "card" && s.pendingChoice.cardIndices?.length === 1, "候補1枚でも聞く")
    act(s, "p1", { type: "resolveChoice" }) // スキップ
    assert(!s.pendingChoice, "選択が解消した")
    assert(s.players.p1.trashCards.length === 1, "戻さなかったのでトラッシュは減らない")
    assert(s.players.p1.deck.length === before, "デッキ枚数も変わらない")
}

console.log("=== 11. 神閃月下 toDeck upTo：対話で途中までやめられる（Nまで） ===")
{
    const s = game("case11-shinsengekka-partial", true)
    s.players.p1.trashCards = [VANILLA, VANILLA, VANILLA]
    resolveAction(s, "p1", null, { type: "toDeck", from: "trash", position: "bottom", count: 10, upTo: true })
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    assert(s.pendingChoice?.kind === "card", "2枚目も聞く")
    // ここで2枚目以降はやめる
    act(s, "p1", { type: "resolveChoice" })
    assert(!s.pendingChoice, "選択が解消した")
    assert(s.players.p1.trashCards.length === 2, "1枚だけ戻り、トラッシュは2枚残る")
    assert(s.players.p1.deck[s.players.p1.deck.length - 1] === VANILLA, "デッキの下に積まれた")
}

console.log("=== 12. 神閃月下 toDeck upTo：非対話は従来どおり上限まで戻す ===")
{
    const s = game("case12-shinsengekka-auto", false)
    s.players.p1.trashCards = [VANILLA, VANILLA, VANILLA]
    resolveAction(s, "p1", null, { type: "toDeck", from: "trash", position: "bottom", count: 10, upTo: true })
    assert(s.players.p1.trashCards.length === 0, "非対話は候補ぶんすべて戻す")
}

console.log("すべてのチェックに合格しました 🎉（part428）")
