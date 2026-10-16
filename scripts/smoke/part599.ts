// smoke パート599（効果で複数体を同時に召喚したら、全員を場に出してから召喚時効果を選んだ順に発揮する。RESUME_STACK §6.2）
//
// 1体目の召喚時効果で場が変わってから2体目が出ることはない。順番はターンプレイヤーが選ぶ（同じカードだけなら聞かない）。
// 効果文に「召喚時効果は発揮されない」と書いていないカード（ハイドランディア・銀狼角）は召喚時効果を発揮する
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance, EffectAction } from "../../server/src/type"

const HYDRA = "BS12-057" // ハイドランディア（ブレイヴ）Lv1 召喚時：トラッシュのコスト2のスピリット3枚を召喚
const MUSHAMEGA = "BS14-025" // ムシャメガ（コスト2）召喚時：自分のスピリットすべてBP+1000
const YAMIYANMA = "BS09-020" // ヤミヤンマ（コスト2）召喚時：白のスピリットにボイドからコア1個
const HINOKI = "BS12-042" // ヒノキ・ゴレム（コスト2）
const GINRO = "BS16-011" // 銀狼角 召喚時：トラッシュの[金狐角]1枚を召喚
const KINKO = "BS16-012" // 金狐角 召喚時：トラッシュの[銀狼角]1枚を召喚
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string][] = [
        [HYDRA, "ハイドランディア"],
        [MUSHAMEGA, "ムシャメガ"],
        [YAMIYANMA, "ヤミヤンマ"],
        [HINOKI, "ヒノキ・ゴレム"],
        [GINRO, "銀狼角"],
        [KINKO, "金狐角"],
    ]
    for (const [id, name] of expect) assert(getCard(id).name === name, `${id} は ${name}`)
    for (const id of [MUSHAMEGA, YAMIYANMA, HINOKI]) assert(getCard(id).cost === 2 && getCard(id).type === "spirit", `${getCard(id).name} はコスト2のスピリット`)
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 20
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): CardInstance {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function actionOf(cardId: string): EffectAction {
    const e = getCard(cardId).effects.find((x) => x.kind === "triggered" && x.trigger === "onSummon")
    if (!e || e.kind !== "triggered") throw new Error(`${cardId} に召喚時効果が無い`)
    return e.action
}

const count = (s: GameState, cardId: string): number => s.players.p1.field.spirits.filter((x) => x.cardId === cardId).length

console.log("=== 1. ハイドランディアで3体を召喚：3体とも出し終えてから、それぞれの召喚時効果を発揮する ===")
{
    const s = game("p599-1")
    s.players.p1.trashCards = [MUSHAMEGA, MUSHAMEGA, MUSHAMEGA]
    const self = put(s, "p1", HYDRA, 1)
    const from = s.log.length
    resolveAction(s, "p1", self, actionOf(HYDRA))
    const lines = s.log.slice(from)
    const summoned = lines.map((l, i) => (l.includes("ムシャメガをコストを支払わずに召喚した") ? i : -1)).filter((i) => i >= 0)
    const buffs = lines.map((l, i) => (l.startsWith("ムシャメガ：このターンの間") ? i : -1)).filter((i) => i >= 0)
    assert(count(s, MUSHAMEGA) === 3, `ムシャメガが3体召喚される（${count(s, MUSHAMEGA)}体）`)
    assert(buffs.length === 3, `3体とも召喚時効果を発揮する（${buffs.length}回）`)
    assert(summoned.length === 3 && buffs.length > 0 && Math.max(...summoned) < Math.min(...buffs), "召喚時効果は3体目を出した後に始まる")
}

console.log("=== 2. 違うカードを同時に召喚したら、召喚時効果の順番をターンプレイヤーが選ぶ ===")
{
    const s = game("p599-2", true)
    s.players.p1.trashCards = [MUSHAMEGA, YAMIYANMA, HINOKI]
    const self = put(s, "p1", HYDRA, 1)
    resolveAction(s, "p1", self, actionOf(HYDRA))
    // 3枚を1枚ずつ選ぶ
    for (let i = 0; i < 3 && s.pendingChoice?.cardIndices; i++) {
        act(s, "p1", { type: "resolveChoice", cardIndex: s.pendingChoice.cardIndices[0]! })
    }
    assert(s.players.p1.field.spirits.length === 4, `3体とも場に出ている（場 ${s.players.p1.field.spirits.length}体）`)
    assert(s.pendingChoice?.triggerOrder !== undefined, "召喚時効果の解決順を聞かれる")
    assert(s.pendingChoice?.pid === s.turnPlayer, "聞かれるのはターンプレイヤー")
}

console.log("=== 3. 銀狼角で召喚した金狐角の召喚時効果も発揮する（効果文に制限が無い） ===")
{
    const s = game("p599-3")
    s.players.p1.trashCards = [KINKO, GINRO]
    const self = put(s, "p1", GINRO, 1)
    resolveAction(s, "p1", self, actionOf(GINRO))
    assert(count(s, KINKO) === 1, "金狐角が召喚される")
    assert(count(s, GINRO) === 2, `金狐角の召喚時効果で、トラッシュの銀狼角も召喚される（銀狼角 ${count(s, GINRO)}体）`)
}

console.log("すべてのチェックに合格しました 🎉（part599）")
