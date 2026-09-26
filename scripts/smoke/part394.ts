// smoke パート394（オープン統合の器 reveal：from3種／count・countPer・countFromSelfLevel／
// pickの各条件／pickCount 1・all・0／optional／dest6種（summonのtensho既定・asIfDone・none・
// noSummonEffects、cast、placeNexus、tegamoto、deckBottom）／orHand／rest4種／相手のデッキ公開）
import {
    act,
    assert,
    createGame,
    createInstance,
    getCard,
    resolveAction,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const RED = "BS01-002" // ロクケラトプス（赤・コスト1・系統[地竜]・Lv1コア1・BP1000）
const GREEN = "BS01-051" // フライングミラージュ（緑・コスト1・系統[殻虫]・Lv1コア1・BP2000）
const NEXUS = "BS01-098" // 燃えさかる戦場（赤ネクサス・コスト3・Lv1コア0）
const MAGIC = "BS01-133" // ワイルドパワー（緑マジック・コスト2・フラッシュ：スピリット1体をBP+2000）
const BURST_MAGIC = "BS14-091" // 双光気弾（赤マジック・コスト3・バースト持ち）
const TENSHO_SPIRIT = "BS04-010" // 雷帝エール・クレル（赤・コスト6・系統[龍帝,翼竜]・キーワード【転召】・Lv1コア1）
const EXPENSIVE = "BS01-101" // 古龍の縄張り（赤ネクサス・コスト6・Lv1コア0）※タイプ不一致確認用ではなく単なる高コスト参照

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(RED).name === "ロクケラトプス" && getCard(RED).family.includes("地竜"), "REDは地竜")
    assert(getCard(GREEN).name === "フライングミラージュ" && getCard(GREEN).family.includes("殻虫"), "GREENは殻虫")
    assert(getCard(NEXUS).name === "燃えさかる戦場" && getCard(NEXUS).type === "nexus", "NEXUSはネクサス")
    assert(getCard(MAGIC).name === "ワイルドパワー" && getCard(MAGIC).type === "magic", "MAGICはマジック")
    assert(getCard(BURST_MAGIC).name === "双光気弾" && getCard(BURST_MAGIC).effects.some((e) => e.kind === "burst"), "BURST_MAGICはバースト持ち")
    assert(getCard(TENSHO_SPIRIT).name === "雷帝エール・クレル" && getCard(TENSHO_SPIRIT).effects.some((e) => e.kind === "keyword" && (e as { keyword?: string }).keyword === "tensho"), "TENSHO_SPIRITは【転召】持ち")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = []
    s.players.p2.deck = []
    s.players.p1.hand = []
    s.players.p2.hand = []
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. from ownDeck・count・pick cardType：一致1枚のみ手札へ、残りはデッキ下（既定rest） ===")
{
    const s = game("case1")
    s.players.p1.deck = [RED, NEXUS, MAGIC]
    resolveAction(s, "p1", null, { type: "reveal", count: 3, pick: { cardType: "spirit" } })
    assert(s.players.p1.hand.includes(RED), "RED（唯一のspirit）が手札に入る")
    assert(s.players.p1.deck.length === 2 && s.players.p1.deck.includes(NEXUS) && s.players.p1.deck.includes(MAGIC), "残り2枚はデッキ下（既定rest）")
}

console.log("=== 2. countPer ownColorTotal：自分の赤の合計数ぶん公開 ===")
{
    const s = game("case2")
    put(s, "p1", RED) // 赤スピリット1体
    s.players.p1.deck = [GREEN, RED]
    resolveAction(s, "p1", null, { type: "reveal", countPer: { ownColorTotal: "red" }, pick: { cardType: "spirit" }, rest: "trash" })
    assert(s.players.p1.deck.length === 1, "count=1（赤1体ぶん）しか公開しない")
}

console.log("=== 3. countFromSelfLevel：selfの現Lv枚数ぶん公開 ===")
{
    const s = game("case3")
    const self = put(s, "p1", TENSHO_SPIRIT, 3) // Lv2（コア3）
    s.players.p1.deck = [RED, GREEN, MAGIC, NEXUS]
    const before = self.instanceId
    resolveAction(s, "p1", self, { type: "reveal", countFromSelfLevel: true, pickCount: 0, rest: "trash" })
    assert(before === self.instanceId, "selfは変化しない")
    assert(s.players.p1.trashCards.length === 2, "Lv2ぶん＝2枚が公開されすべてトラッシュへ（pickCount:0）")
}

console.log("=== 4. pickの各条件（family・color・keyword・cost・nameIncludes・hasBurst） ===")
{
    const s = game("case4")
    s.players.p1.deck = [RED, GREEN]
    resolveAction(s, "p1", null, { type: "reveal", count: 2, pick: { family: "殻虫" }, rest: "trash" })
    assert(s.players.p1.hand.includes(GREEN) && !s.players.p1.hand.includes(RED), "familyで殻虫のみ一致")
}
{
    const s = game("case4b")
    s.players.p1.deck = [RED, GREEN]
    resolveAction(s, "p1", null, { type: "reveal", count: 2, pick: { color: "green" }, rest: "trash" })
    assert(s.players.p1.hand.includes(GREEN) && !s.players.p1.hand.includes(RED), "colorで緑のみ一致")
}
{
    const s = game("case4c")
    s.players.p1.deck = [RED, TENSHO_SPIRIT]
    resolveAction(s, "p1", null, { type: "reveal", count: 2, pick: { keyword: "tensho" }, rest: "trash" })
    assert(s.players.p1.hand.includes(TENSHO_SPIRIT) && !s.players.p1.hand.includes(RED), "keywordで転召持ちのみ一致")
}
{
    const s = game("case4d")
    s.players.p1.deck = [RED, NEXUS]
    resolveAction(s, "p1", null, { type: "reveal", count: 2, pick: { cost: { min: 2 } }, rest: "trash" })
    assert(s.players.p1.hand.includes(NEXUS) && !s.players.p1.hand.includes(RED), "cost.minでコスト2以上のみ一致")
}
{
    const s = game("case4e")
    s.players.p1.deck = [RED, GREEN]
    resolveAction(s, "p1", null, { type: "reveal", count: 2, pick: { nameIncludes: "ロクケラ" }, rest: "trash" })
    assert(s.players.p1.hand.includes(RED) && !s.players.p1.hand.includes(GREEN), "nameIncludesで名前一致のみ")
}
{
    const s = game("case4f")
    s.players.p1.deck = [RED, BURST_MAGIC]
    resolveAction(s, "p1", null, { type: "reveal", count: 2, pick: { hasBurst: true }, rest: "trash" })
    assert(s.players.p1.hand.includes(BURST_MAGIC) && !s.players.p1.hand.includes(RED), "hasBurstでバースト持ちのみ一致")
}

console.log("=== 5. pickCount 1：候補2枚以上で対話なら選択待ち、AIはコスト最大 ===")
{
    const s = game("case5", true)
    s.players.p1.deck = [RED, TENSHO_SPIRIT]
    resolveAction(s, "p1", null, { type: "reveal", count: 2, pick: { cardType: "spirit" }, rest: "trash" })
    assert(s.pendingChoice?.kind === "card" && s.pendingChoice.cardZone === "reveal", "候補2枚で選択待ちになる")
    act(s, "p1", { type: "resolveChoice", cardIndex: s.pendingChoice!.cardIndices!.indexOf(1) })
    assert(s.players.p1.hand.includes(TENSHO_SPIRIT), "選んだ方（TENSHO_SPIRIT）が手札に入る")
}
{
    const s = game("case5b") // 非対話
    s.players.p1.deck = [RED, TENSHO_SPIRIT]
    resolveAction(s, "p1", null, { type: "reveal", count: 2, pick: { cardType: "spirit" }, rest: "trash" })
    assert(s.players.p1.hand.includes(TENSHO_SPIRIT) && !s.players.p1.hand.includes(RED), "AIはコスト最大（TENSHO_SPIRIT）を選ぶ")
}

console.log("=== 6. pickCount all：条件に合うすべてを手札へ、残りはトラッシュ ===")
{
    const s = game("case6")
    s.players.p1.deck = [RED, GREEN, NEXUS]
    resolveAction(s, "p1", null, { type: "reveal", count: 3, pick: { cardType: "spirit" }, pickCount: "all", rest: "trash" })
    assert(s.players.p1.hand.includes(RED) && s.players.p1.hand.includes(GREEN), "spirit2枚とも手札へ")
    assert(s.players.p1.trashCards.includes(NEXUS), "非該当のNEXUSはトラッシュへ")
}

console.log("=== 7. pickCount 0：選ばず公開して戻すだけ ===")
{
    const s = game("case7")
    s.players.p1.deck = [RED, GREEN]
    resolveAction(s, "p1", null, { type: "reveal", count: 2, pickCount: 0, rest: "deckTop" })
    assert(s.players.p1.hand.length === 0, "手札には何も入らない")
    assert(s.players.p1.deck.length === 2, "2枚とも山札へ戻る（deckTop）")
}

console.log("=== 8. optionalで選ばない（対話でスキップ） ===")
{
    const s = game("case8", true)
    s.players.p1.deck = [RED]
    resolveAction(s, "p1", null, { type: "reveal", count: 1, pick: { cardType: "spirit" }, optional: true, dest: "summon", rest: "trash" })
    assert(s.pendingChoice?.kind === "card", "optionalは候補1枚でも必ず選ばせる")
    act(s, "p1", { type: "resolveChoice" }) // スキップ
    assert(s.players.p1.field.spirits.length === 0, "召喚しないことを選べる")
    assert(s.players.p1.trashCards.includes(RED), "選ばなかったカードはrest（trash）へ")
}

console.log("=== 9. dest summon：tensho既定（【転召】で自分のスピリット1体を犠牲にする） ===")
{
    const s = game("case9")
    // 【転召】の犠牲はコスト5以上が条件なので、同じカード（コスト6）を犠牲にする
    const sac = put(s, "p1", TENSHO_SPIRIT, 1)
    s.players.p1.deck = [TENSHO_SPIRIT]
    resolveAction(s, "p1", null, { type: "reveal", count: 1, pick: { cardType: "spirit" }, dest: "summon", rest: "trash" })
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === sac.instanceId), "犠牲にしたスピリットは場を離れる（転召は必ず発揮）")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === TENSHO_SPIRIT), "TENSHO_SPIRITが召喚されている")
}

console.log("=== 10. dest summon：tensho asIfDone（転召を発揮したものとして扱う＝犠牲不要） ===")
{
    const s = game("case10")
    const kept = put(s, "p1", GREEN, 1)
    s.players.p1.deck = [TENSHO_SPIRIT]
    resolveAction(s, "p1", null, { type: "reveal", count: 1, pick: { cardType: "spirit" }, dest: "summon", tensho: "asIfDone", rest: "trash" })
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === kept.instanceId), "既存のGREENは犠牲にならず場に残る")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === TENSHO_SPIRIT), "TENSHO_SPIRITが召喚されている")
}

console.log("=== 11. dest summon：tensho none（転召させない） ===")
{
    const s = game("case11")
    const kept = put(s, "p1", GREEN, 1)
    s.players.p1.deck = [TENSHO_SPIRIT]
    resolveAction(s, "p1", null, { type: "reveal", count: 1, pick: { cardType: "spirit" }, dest: "summon", tensho: "none", rest: "trash" })
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === kept.instanceId), "既存のGREENは犠牲にならず場に残る")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === TENSHO_SPIRIT), "TENSHO_SPIRITが召喚されている")
}

console.log("=== 12. dest summon：noSummonEffects（転召なし・召喚時効果も発揮されない） ===")
{
    const s = game("case12")
    s.players.p1.deck = [RED]
    resolveAction(s, "p1", null, { type: "reveal", count: 1, pick: { cardType: "spirit" }, dest: "summon", tensho: "none", noSummonEffects: true, rest: "trash" })
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === RED), "召喚自体は成立する")
    assert(s.players.p1.reserve === 9, "維持コア1が引かれる（コスト自体は不要）")
}

console.log("=== 13. dest cast：マジックならフラッシュ効果を無償で即時使用 ===")
{
    const s = game("case13")
    s.players.p1.deck = [MAGIC]
    resolveAction(s, "p1", null, { type: "reveal", count: 1, dest: "cast", rest: "trash" })
    assert(!s.players.p1.hand.includes(MAGIC) && !s.players.p1.deck.includes(MAGIC), "マジックは手札にもデッキにも残らない（使用済み）")
}

console.log("=== 14. dest placeNexus：ネクサスをコストを支払わず配置 ===")
{
    const s = game("case14")
    s.players.p1.deck = [NEXUS]
    resolveAction(s, "p1", null, { type: "reveal", count: 1, pick: { cardType: "nexus" }, dest: "placeNexus", rest: "trash" })
    assert(s.players.p1.field.nexuses.some((n) => n.cardId === NEXUS), "ネクサスが場に出る")
}

console.log("=== 15. dest tegamoto：手元に置く ===")
{
    const s = game("case15")
    s.players.p1.deck = [MAGIC]
    resolveAction(s, "p1", null, { type: "reveal", count: 1, dest: "tegamoto", rest: "trash" })
    assert(s.players.p1.tegamoto.includes(MAGIC), "手元ゾーンに置かれる")
}

console.log("=== 16. dest deckBottom：選んだ1枚を（自分の）デッキの下へ ===")
{
    const s = game("case16")
    s.players.p1.deck = [MAGIC, RED]
    resolveAction(s, "p1", null, { type: "reveal", count: 2, pick: { cardType: "magic" }, dest: "deckBottom", rest: "trash" })
    assert(s.players.p1.deck[s.players.p1.deck.length - 1] === MAGIC, "選んだMAGICはデッキの下")
    assert(s.players.p1.trashCards.includes(RED), "非該当のREDはrest（trash）")
}

console.log("=== 17. orHand：summonできない（維持コア不足）ときは手札へ ===")
{
    const s = game("case17")
    s.players.p1.reserve = 0
    s.players.p1.deck = [RED]
    resolveAction(s, "p1", null, { type: "reveal", count: 1, pick: { cardType: "spirit" }, dest: "summon", orHand: true, rest: "trash" })
    assert(s.players.p1.field.spirits.length === 0, "リザーブ不足で召喚は不成立")
    assert(s.players.p1.hand.includes(RED), "orHand指定なので手札へ（トラッシュではない）")
}
{
    const s = game("case17b") // 比較：orHandなしはトラッシュ
    s.players.p1.reserve = 0
    s.players.p1.deck = [RED]
    resolveAction(s, "p1", null, { type: "reveal", count: 1, pick: { cardType: "spirit" }, dest: "summon", rest: "trash" })
    assert(s.players.p1.trashCards.includes(RED), "orHandなしはトラッシュへ")
}

console.log("=== 18. rest：trash・hand・deckTop・deckBottom（デッキへ戻すときは順番を選ぶ） ===")
{
    const s = game("case18trash")
    s.players.p1.deck = [RED, GREEN, NEXUS]
    resolveAction(s, "p1", null, { type: "reveal", count: 3, pick: { cardType: "magic" }, rest: "trash" })
    assert(s.players.p1.trashCards.length === 3, "一致なしですべてトラッシュへ")
}
{
    const s = game("case18hand")
    s.players.p1.deck = [RED, GREEN]
    resolveAction(s, "p1", null, { type: "reveal", count: 2, pick: { cardType: "magic" }, rest: "hand" })
    assert(s.players.p1.hand.includes(RED) && s.players.p1.hand.includes(GREEN), "rest:handで2枚とも手札へ")
}
{
    const s = game("case18order", true)
    s.players.p1.deck = [RED, GREEN, NEXUS]
    resolveAction(s, "p1", null, { type: "reveal", count: 3, pick: { cardType: "magic" }, rest: "deckBottom" })
    assert(s.pendingChoice?.kind === "card" && s.pendingChoice.cardZone === "reveal", "3枚とも非該当→デッキへ戻す順番を選ばせる")
    // 最後の1枚は選ぶ余地が無いので自動で戻る（旧 revealReturnToDeck と同じ）
    let picks = 0
    while (s.pendingChoice && picks < 5) {
        act(s, "p1", { type: "resolveChoice", cardIndex: s.pendingChoice.cardIndices![0]! })
        picks++
    }
    assert(picks === 2, "選ぶのは2回（最後の1枚は自動）")
    assert(!s.pendingChoice, "選び終えて選択待ちが解消する")
    assert(s.players.p1.deck.length === 3, "3枚とも山札へ戻っている")
}

console.log("=== 19. 相手のデッキを公開しても選ぶのは使用者（rest deckBottomの順番も使用者が選ぶ） ===")
{
    const s = game("case19", true)
    s.players.p2.deck = [RED, TENSHO_SPIRIT]
    resolveAction(s, "p1", null, { type: "reveal", from: "opponentDeck", count: 2, pick: { cardType: "spirit" }, rest: "deckBottom" })
    assert(s.pendingChoice?.pid === "p1", "相手のデッキでも選ぶのはp1（使用者）")
    act(s, "p1", { type: "resolveChoice", cardIndex: s.pendingChoice!.cardIndices!.indexOf(1) })
    assert(s.players.p1.hand.includes(TENSHO_SPIRIT), "p1の手札にTENSHO_SPIRITが入る")
    assert(!s.pendingChoice, "残り1枚のrestは選択なしでそのままp2のデッキ下へ")
    assert(s.players.p2.deck.includes(RED), "残ったREDはp2のデッキへ戻る（トラッシュ等には行かない）")
}

console.log("=== 20. 候補が1枚なら（任意でなければ）選ばせずに決める／ブレイヴはスピリット状態で召喚する ===")
{
    const BRAVE = "BS10-061"
    assert(getCard(BRAVE).name === "剣鎧竜バスター・ドラゴン" && getCard(BRAVE).type === "brave", "BRAVEはブレイヴ")
    const s = game("case20single", true)
    s.players.p1.deck = [RED, MAGIC]
    resolveAction(s, "p1", null, { type: "reveal", count: 2, pick: { cardType: "magic" }, rest: "trash" })
    assert(s.pendingChoice === null, "候補1枚・任意でない：選択待ちは立たない")
    assert(s.players.p1.hand.includes(MAGIC), "その1枚が手札に入る")

    const s2 = game("case20brave")
    s2.players.p1.reserve = 5
    s2.players.p1.deck = [BRAVE]
    resolveAction(s2, "p1", null, { type: "reveal", count: 1, pick: { cardType: ["spirit", "brave"] }, dest: "summon", orHand: true, rest: "hand" })
    assert(s2.players.p1.field.spirits.some((sp) => sp.cardId === BRAVE), "ブレイヴがスピリット状態で召喚される")
    assert(!s2.players.p1.hand.includes(BRAVE), "手札には回らない")
}

console.log("すべてのチェックに合格しました 🎉（part394）")
