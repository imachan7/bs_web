// smoke パート1026（#631 GX05・GX20・GX07・GX01：lendSelfThisGame／フィルタ軸 rarity／removeDeckFromGame）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart, hasArmorAgainst, endTurn } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1）
const RARE_X = "BS13-X05" // 麒麟星獣リーン（黄・X）
const RARE_PX = "PX01" // 獅龍王レオン・ハウル（赤・PX）
const RARE_R = "BS22-003" // プロフェット・ドラゴン（赤・R）
const KOUDOU = "BS10-X06" // 天蠍神騎スコル・スピア（青・コスト5・系統「光導」）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard("GX05").name === "パーフェクトバリア" && getCard("GX05").cost === 4, "GX05")
assert(getCard("GX20").name === "ゾディアックプレッシャー" && getCard("GX20").cost === 1, "GX20")
assert(getCard("GX07").name === "エックスクラッシュ" && getCard("GX07").cost === 6, "GX07")
assert(getCard("GX01").name === "ギャラクシードロー" && getCard("GX01").cost === 7, "GX01")
assert(getCard(RARE_X).name === "麒麟星獣リーン" && getCard(RARE_X).rarity === "X", "RARE_XはXレア")
assert(getCard(RARE_PX).name === "獅龍王レオン・ハウル" && getCard(RARE_PX).rarity === "PX", "RARE_PXはPXレア")
assert(getCard(RARE_R).name === "プロフェット・ドラゴン" && getCard(RARE_R).rarity === "R", "RARE_RはRレア")
assert(getCard(KOUDOU).name === "天蠍神騎スコル・スピア" && getCard(KOUDOU).family.includes("光導"), "KOUDOUは光導")

function game(seed: string, name: string): GameState {
    const s = createGame(seed, { p1: name, p2: "ユウキ" }, { p1: "blue", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 12
    s.players.p2.reserve = 12
    s.players.p1.deck = Array.from({ length: 30 }, () => VAN)
    s.players.p2.deck = Array.from({ length: 40 }, () => VAN)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const cast = (s: GameState, cardId: string): void => {
    s.players.p1.hand = [cardId]
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, `${cardId}を使えた`)
}
const ALL = ["red", "purple", "green", "white", "yellow", "blue"] as const

console.log("=== 1. GX05：このゲームの間、後から出たスピリットにも装甲・次のターン以降も残る ===")
{
    const s = game("gx05", "馬神弾")
    const early = put(s, "p1", VAN)
    cast(s, "GX05")
    assert(s.players.p1.gameVirtualInstances.length === 1 && s.players.p1.turnVirtualInstances.length === 0, "ゲーム用の貸与に積まれる")
    assert(ALL.every((c) => hasArmorAgainst(s, early, [c])), "いるスピリットは全色の装甲")
    const late = put(s, "p1", VAN)
    assert(ALL.every((c) => hasArmorAgainst(s, late, [c])), "後から出たスピリットにも付く")
    assert(!hasArmorAgainst(s, put(s, "p2", VAN), ["red"]), "相手のスピリットには付かない")
    endTurn(s)
    endTurn(s)
    assert(s.players.p1.gameVirtualInstances.length === 1, "ターンをまたいでも残る")
    assert(ALL.every((c) => hasArmorAgainst(s, late, [c])), "次の自分のターンでも装甲のまま")
}

console.log("=== 2. GX20：このゲームの間、光導が召喚されたら相手のデッキを12枚破棄（両陣営の召喚で） ===")
{
    const s = game("gx20", "硯秀斗")
    cast(s, "GX20")
    s.players.p1.hand = [KOUDOU]
    const d2 = s.players.p2.deck.length
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "自分が光導を召喚")
    assert(s.players.p2.deck.length === d2 - 12, "相手のデッキが12枚減る")
    s.players.p1.hand = [VAN]
    handleAction(s, "p1", { type: "summon", handIndex: 0 })
    assert(s.players.p2.deck.length === d2 - 12, "光導でないスピリットでは減らない")
    endTurn(s)
    assert((s.turnPlayer as string) === "p2", "相手のターン")
    s.players.p2.hand = [KOUDOU]
    s.players.p2.reserve = 12
    const d1 = s.players.p1.deck.length
    const d2b = s.players.p2.deck.length
    assert(handleAction(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手が光導を召喚")
    assert(s.players.p2.deck.length === d2b - 12 && s.players.p1.deck.length === d1, "次のターン以降も、相手が召喚したときも、貸した本人から見た相手（召喚した側）のデッキが12枚減る")
}

console.log("=== 3. GX07：このターンの間、自分のXレア（X・PX）のアタックで相手のデッキ10枚破棄 ===")
{
    const attackDelta = (cardId: string, withMagic = true): number => {
        const s = game(`gx07-${cardId}`, "馬神弾")
        const a = put(s, "p1", cardId)
        if (withMagic) cast(s, "GX07")
        s.players.p1.field.spirits.find((x) => x.instanceId === a.instanceId)!.isRested = false
        handleAction(s, "p1", { type: "nextPhase" })
        const d2 = s.players.p2.deck.length
        handleAction(s, "p1", { type: "attack", instanceId: a.instanceId })
        return d2 - s.players.p2.deck.length
    }
    assert(attackDelta(RARE_X) === 10, "Xレアのアタックで10枚")
    assert(attackDelta(RARE_PX) === 10, "PXレアのアタックでも10枚")
    assert(attackDelta(RARE_R) === 0, "Rレアには効かない")
    assert(attackDelta(RARE_X, false) === 0, "マジックを使っていなければ破棄しない")
    // 相手のXレアのアタックでは発揮しない
    const s = game("gx07-opp", "馬神弾")
    cast(s, "GX07")
    endTurn(s)
    const o = put(s, "p2", RARE_X)
    handleAction(s, "p2", { type: "nextPhase" })
    const d1 = s.players.p1.deck.length
    handleAction(s, "p2", { type: "attack", instanceId: o.instanceId })
    assert(s.players.p1.deck.length === d1, "相手のXレアのアタックでは破棄しない")
}

console.log("=== 4. GX01：7枚ドロー後、デッキすべてがゲームから取り除かれる ===")
{
    const s = game("gx01", "ギャラクシー渡辺")
    const total = s.players.p1.deck.length
    cast(s, "GX01")
    assert(s.players.p1.hand.length === 7, "7枚引いた")
    assert(s.players.p1.deck.length === 0, "デッキが0枚")
    assert(s.players.p1.excludedCards.length === total - 7, "残り全部が除外ゾーンへ")
    assert(s.players.p2.deck.length === 40 && s.players.p2.excludedCards.length === 0, "相手のデッキには触れない")
}

console.log("すべてのチェックに合格しました 🎉（part1026）")
