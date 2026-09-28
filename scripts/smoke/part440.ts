// smoke パート440（BS16バッチ3・黄15＋緑白の残り6：新しい部品を使ったカードの動作確認）
import {
    assert,
    createGame,
    createInstance,
    currentLevel,
    draw,
    effectSources,
    fireFieldEventTriggers,
    fireTrigger,
    getCard,
    placeBurst,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireBurstOnEvent } from "../../server/src/logic/keywords/burst"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS16-040").name === "ハートナイト・ティン" && getCard("BS16-040").family.includes("四道"), "040は四道を持つ")
    assert(getCard("BS16-041").name === "グリムの天使赤ずきん", "041の名前")
    assert(getCard("BS16-042").name === "グリムの天使シンデレラ", "042の名前")
    assert(getCard("BS16-044").name === "ダイヤプリンセス・ドロシー", "044の名前")
    assert(getCard("BS16-045").name === "オリンピアの天使長オフィエル", "045の名前")
    assert(getCard("BS16-066").name === "浮遊関" && getCard("BS16-066").type === "nexus", "066はネクサス")
    assert(getCard("BS16-068").name === "イ・ケダヤンの階段山脈" && getCard("BS16-068").type === "nexus", "068はネクサス")
    assert(getCard("BS16-069").name === "セブンブリッジ" && getCard("BS16-069").type === "nexus", "069はネクサス")
    assert(getCard("BS16-070").name === "創造の原典" && getCard("BS16-070").type === "nexus", "070はネクサス")
    assert(getCard("BS16-081").name === "マジック・オブ・オズ" && getCard("BS16-081").type === "magic", "081はマジック")
    assert(getCard("BS16-X05").name === "アルカナマスター・オズ", "X05の名前")
    assert(getCard("BS16-022").name === "マー・バチョウ", "022の名前")
    assert(getCard("BS16-026").name === "クマタカンウ", "026の名前")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    s.interactiveTargets = false
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function actionOf(cardId: string, effectId: string): any {
    const e = getCard(cardId).effects.find((x: any) => x.id === effectId) as any
    if (!e) throw new Error(`${cardId}: ${effectId} が見つからない`)
    return e
}

console.log("=== 1. BS16-040 draw countMax：四道1体につきドロー、上限4枚 ===")
{
    const s = game("case1")
    const self = put(s, "p1", "BS16-040", 3) // Lv2到達
    for (let i = 0; i < 5; i++) put(s, "p1", "BS16-038", 1) // 四道の別カードを5体並べる（selfと合わせて6体）
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", self, actionOf("BS16-040", "BS16-040-e1").action)
    assert(deckBefore - s.players.p1.deck.length === 4, "四道6体でも上限4枚しかドローしない")
}

console.log("=== 2. BS16-041 nexusEffectsDisabled：相手のLv1ネクサスだけ、お互いのアタックステップに効果を止める ===")
{
    const s = game("case2")
    put(s, "p1", "BS16-041", 4) // Lv3到達
    const lv1Nexus = putNexus(s, "p2", "BS16-066", 0) // Lv1（cores0）
    const lv2Nexus = putNexus(s, "p2", "BS16-069", 2) // Lv2（cores2で到達）
    s.phase = "attack"
    const sources = effectSources(s, "p2").map((x) => x.instanceId)
    assert(!sources.includes(lv1Nexus.instanceId), "相手のLv1ネクサスはeffectSourcesから除外される")
    assert(sources.includes(lv2Nexus.instanceId), "相手のLv2ネクサスは除外されない")
    s.phase = "main"
    const sourcesMain = effectSources(s, "p2").map((x) => x.instanceId)
    assert(sourcesMain.includes(lv1Nexus.instanceId), "メインステップでは止まらない（phase限定）")
}

console.log("=== 3. BS16-042 バースト：天霊がいるとき召喚 ===")
{
    const s = game("case3a")
    put(s, "p1", "BS16-039", 3) // 天霊を持つ別カード（グリムの天使ラプンツェル：雄将/天霊）
    placeBurst(s, "p1", "BS16-042")
    s.players.p1.hand = []
    fireBurstOnEvent(s, "p1", "ownLifeDamaged", { pid: "p1" }, undefined, undefined)
    assert(
        s.players.p1.field.spirits.some((x) => x.cardId === "BS16-042"),
        "天霊がいるのでバーストからBS16-042が召喚される",
    )
}
{
    const s = game("case3b")
    placeBurst(s, "p1", "BS16-042")
    const before = s.players.p1.field.spirits.length
    fireBurstOnEvent(s, "p1", "ownLifeDamaged", { pid: "p1" }, undefined, undefined)
    assert(s.players.p1.field.spirits.length === before, "天霊がいなければ召喚されない（条件不成立）")
}

console.log("=== 4. BS16-042 Lv2-3：自分のアタックステップに相手のライフが減ったとき、トラッシュのマジックを手札に戻す ===")
{
    const s = game("case4")
    const self = put(s, "p1", "BS16-042", 2) // Lv2到達
    s.players.p1.trashCards = ["BS16-081"] // 黄のマジック
    s.phase = "attack"
    fireFieldEventTriggers(s, "p1", "ownSpiritDealtLife", { pid: "p1", inst: self }, undefined, undefined, undefined, {})
    assert(s.players.p1.hand.includes("BS16-081"), "トラッシュのマジックが手札に戻る")
}

console.log("=== 5. BS16-042 Lv3：アタック時、バースト1つ破棄でブロックされない ===")
{
    const s = game("case5")
    const self = put(s, "p1", "BS16-042", 5) // Lv3到達
    placeBurst(s, "p1", "BS16-039")
    resolveAction(s, "p1", self, actionOf("BS16-042", "BS16-042-e3").action)
    assert(s.players.p1.burst === null, "バーストを1つ破棄した")
    const timed = s.timedEffects.some((r) => r.target.kind === "instance" && r.target.instanceId === self.instanceId && r.content.some((c) => c.type === "unblockable"))
    assert(timed, "このバトルの間ブロックされない効果が付いた")
}
{
    const s = game("case5b")
    const self = put(s, "p1", "BS16-042", 5)
    // バーストが無いので払えない
    resolveAction(s, "p1", self, actionOf("BS16-042", "BS16-042-e3").action)
    const timed = s.timedEffects.some((r) => r.target.kind === "instance" && r.target.instanceId === self.instanceId && r.content.some((c) => c.type === "unblockable"))
    assert(!timed, "バーストが無ければ発揮しない")
}

console.log("=== 6. BS16-044 reveal pickCount=2：四道2枚まで無償召喚、残りは破棄 ===")
{
    const s = game("case6")
    const self = put(s, "p1", "BS16-044", 4)
    s.players.p1.deck = ["BS16-038", "BS16-040", VANILLA, VANILLA, VANILLA, VANILLA, ...s.players.p1.deck]
    resolveAction(s, "p1", self, actionOf("BS16-044", "BS16-044-e1").action)
    const summonedFour = s.players.p1.field.spirits.filter((x) => x.cardId === "BS16-038" || x.cardId === "BS16-040")
    assert(summonedFour.length === 2, "四道2枚が無償召喚される")
    assert(s.players.p1.trashCards.length === 4, "残り4枚は破棄される")
}

console.log("=== 7. BS16-045 召喚時：バースト破棄でライフが5になるようにコアを置く ===")
{
    const s = game("case7")
    const self = put(s, "p1", "BS16-045", 1)
    placeBurst(s, "p1", "BS16-039")
    s.players.p1.life = 2
    resolveAction(s, "p1", self, actionOf("BS16-045", "BS16-045-e1").action)
    assert(s.players.p1.life === 5, "ライフが5になるようにコアを置く")
    assert(s.players.p1.burst === null, "バーストを1つ破棄した")
}
{
    const s = game("case7b")
    const self = put(s, "p1", "BS16-045", 1)
    s.players.p1.life = 2
    // バーストが無いので払えない
    resolveAction(s, "p1", self, actionOf("BS16-045", "BS16-045-e1").action)
    assert(s.players.p1.life === 2, "バーストが無ければライフは変わらない")
}

console.log("=== 8. BS16-066 エンドステップ：神速を手札に戻すことで、ボイドからコア1個をリザーブに置く ===")
{
    const s = game("case8")
    put(s, "p1", "BS16-066", 1) // Lv2到達
    const sokuSpirit = put(s, "p1", "BS16-022", 0) // 神速持ち（コア0で作り、戻り値の増分を分離して確認する）
    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p1", null, actionOf("BS16-066", "BS16-066-e2").action)
    assert(s.players.p1.hand.includes("BS16-022"), "神速持ちが手札に戻った")
    assert(!s.players.p1.field.spirits.includes(sokuSpirit), "場から離れた")
    assert(s.players.p1.reserve === reserveBefore + 1, "リザーブにコア1個増えた")
}
{
    const s = game("case8b")
    put(s, "p1", "BS16-066", 1)
    const reserveBefore = s.players.p1.reserve
    // 神速持ちがいないので払えない
    resolveAction(s, "p1", null, actionOf("BS16-066", "BS16-066-e2").action)
    assert(s.players.p1.reserve === reserveBefore, "神速持ちがいなければ発揮しない")
}

console.log("=== 9. BS16-068 配置時：手札から配置したとき、このターン終了時に自分のスピリットすべてを回復 ===")
{
    const s = game("case9")
    const rested = put(s, "p1", VANILLA, 1)
    rested.isRested = true
    const inst = createInstance("BS16-068", s.turn, 0)
    s.players.p1.field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", inst, actionOf("BS16-068", "BS16-068-e1").action, undefined, undefined, undefined, undefined, undefined, "BS16-068")
    assert(s.turnEndActions !== undefined && s.turnEndActions.length > 0, "ターン終了時アクションが積まれる")
    assert(rested.isRested === true, "まだ回復していない（エンドステップまで待つ）")
}

console.log("=== 10. BS16-068 symbolFix：メインステップに召喚するとき、このネクサスのシンボルを白3つにする ===")
{
    const s = game("case10")
    const inst = putNexus(s, "p1", "BS16-068", 1) // Lv2到達
    s.phase = "main"
    const hasFix = getCard(inst.cardId).effects.some((e: any) => e.kind === "symbolFix" && e.count === 3 && e.color === "white")
    assert(hasFix, "symbolFixエントリがLv2に存在する")
}

console.log("=== 11. BS16-069 ドローステップ：スピリット1枚破棄でドロー+1 ===")
{
    const s = game("case11")
    put(s, "p1", "BS16-069", 1) // Lv2到達
    s.players.p1.hand = [VANILLA]
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, actionOf("BS16-069", "BS16-069-e1").action)
    assert(s.players.p1.hand.length === 0, "手札のスピリット1枚を破棄した")
    assert(deckBefore - s.players.p1.deck.length === 1, "デッキから1枚ドローした")
}
{
    const s = game("case11b")
    put(s, "p1", "BS16-069", 1)
    s.players.p1.hand = []
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, actionOf("BS16-069", "BS16-069-e1").action)
    assert(deckBefore - s.players.p1.deck.length === 0, "破棄できるスピリットが無ければドローしない")
}

console.log("=== 12. BS16-069 Lv2：四道が破壊されたとき、その1体をデッキの上に戻せる ===")
{
    const s = game("case12")
    put(s, "p1", "BS16-069", 3) // Lv2到達
    const destroyed = put(s, "p1", "BS16-038", 1) // 四道
    s.players.p1.trashCards = [destroyed.cardId]
    const deckBefore = s.players.p1.deck.slice()
    fireFieldEventTriggers(s, "p1", "ownSpiritDestroyed", { pid: "p1", inst: destroyed }, undefined, undefined, 1)
    assert(s.players.p1.deck[0] === "BS16-038" && s.players.p1.deck.length === deckBefore.length + 1, "破壊された四道がデッキの上に戻る")
}

console.log("=== 13. BS16-070 kind burstMagicFreeEffect：Lv2に存在する ===")
{
    const has = getCard("BS16-070").effects.some((e: any) => e.kind === "burstMagicFreeEffect" && (e.levels as number[]).includes(2))
    assert(has, "BS16-070 Lv2にburstMagicFreeEffectがある")
}
console.log("=== 13b. BS16-070 配置時：手札から配置したとき、トラッシュの黄マジックを手札に戻す ===")
{
    const s = game("case13b")
    const inst = createInstance("BS16-070", s.turn, 0)
    s.players.p1.field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    s.players.p1.trashCards = ["BS16-081"]
    resolveAction(s, "p1", inst, actionOf("BS16-070", "BS16-070-e1").action)
    assert(s.players.p1.hand.includes("BS16-081"), "トラッシュの黄マジックが手札に戻る")
}

console.log("=== 14. BS16-081 メイン：手札1枚以上のときだけ、全破棄して3ドロー ===")
{
    const s = game("case14")
    s.players.p1.hand = [VANILLA, VANILLA]
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, actionOf("BS16-081", "BS16-081-e1").action)
    assert(s.players.p1.hand.length === 3 && deckBefore - s.players.p1.deck.length === 3, "手札を全破棄してデッキから3枚ドローした")
}
{
    const s = game("case14b")
    s.players.p1.hand = []
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, actionOf("BS16-081", "BS16-081-e1").action)
    assert(deckBefore - s.players.p1.deck.length === 0, "手札が0枚のときはドローしない")
}

console.log("=== 15. BS16-X05 召喚時：四道6体以上いるとき、相手の全スピリットをデッキの上に戻す ===")
{
    const s = game("case15")
    const self = put(s, "p1", "BS16-X05", 3)
    for (let i = 0; i < 5; i++) put(s, "p1", "BS16-038", 1) // 四道5体+self=6体
    put(s, "p2", VANILLA, 1)
    put(s, "p2", VANILLA, 1)
    fireTrigger(s, "p1", self, "onSummon")
    assert(s.players.p2.field.spirits.length === 0, "四道6体以上なので相手の全スピリットが戻る")
}
{
    const s = game("case15b")
    const self = put(s, "p1", "BS16-X05", 3)
    for (let i = 0; i < 3; i++) put(s, "p1", "BS16-038", 1) // self含めて4体（6体未満）
    put(s, "p2", VANILLA, 1)
    fireTrigger(s, "p1", self, "onSummon")
    assert(s.players.p2.field.spirits.length === 1, "四道6体未満なら発揮しない")
}

console.log("=== 16. BS16-X05 Lv2-3：相手によって破壊されたとき、手札/トラッシュの[アルカナマスター・オズ]以外の黄スピリット3枚まで無償召喚 ===")
{
    const s = game("case16")
    const self = put(s, "p1", "BS16-X05", 3) // Lv2到達
    s.players.p1.hand = ["BS16-038", "BS16-X05"]
    s.players.p1.trashCards = ["BS16-040"]
    fireFieldEventTriggers(s, "p1", "ownSpiritDestroyed", { pid: "p1", inst: self }, undefined, undefined, 1, { byOpponentEffect: true })
    const summoned = s.players.p1.field.spirits.filter((x) => x.cardId === "BS16-038" || x.cardId === "BS16-040")
    assert(summoned.length === 2, "自身以外の黄スピリットが手札・トラッシュ合わせて無償召喚される")
    assert(!s.players.p1.field.spirits.some((x) => x.cardId === "BS16-X05"), "[アルカナマスター・オズ]自身は候補から除外される")
}

console.log("=== 17. BS16-022 フラッシュ神速＋『お互いのアタックステップ』で召喚されたとき、ボイドからコアをリザーブに ===")
{
    const s = game("case17")
    s.phase = "attack"
    const self = put(s, "p1", "BS16-022", 1)
    const reserveBefore = s.players.p1.reserve
    fireFieldEventTriggers(s, "p1", "ownSpiritSummoned", { pid: "p1", inst: self }, undefined, self.instanceId)
    assert(s.players.p1.reserve === reserveBefore + 1, "アタックステップの召喚でコアが増える")
}
{
    const s = game("case17b")
    s.phase = "main"
    const self = put(s, "p1", "BS16-022", 1)
    const reserveBefore = s.players.p1.reserve
    fireFieldEventTriggers(s, "p1", "ownSpiritSummoned", { pid: "p1", inst: self }, undefined, self.instanceId)
    assert(s.players.p1.reserve === reserveBefore, "メインステップの召喚では増えない")
}

console.log("=== 18. BS16-026 バトル時：BP比較で相手だけ破壊したとき、神速/烈神速持ちを手札に戻すことでコア2個をリザーブに ===")
{
    const s = game("case18")
    const self = put(s, "p1", "BS16-026", 4) // Lv2到達
    const sokuSpirit = put(s, "p1", "BS16-022", 0)
    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p1", self, actionOf("BS16-026", "BS16-026-e2").action)
    assert(s.players.p1.hand.includes("BS16-022"), "神速持ちが手札に戻った")
    assert(!s.players.p1.field.spirits.includes(sokuSpirit), "場から離れた")
    assert(s.players.p1.reserve === reserveBefore + 2, "リザーブにコア2個増えた")
}

console.log("すべてのチェックに合格しました 🎉（part440）")
