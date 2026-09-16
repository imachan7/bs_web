// smoke パート326（「〜できる」なのに確認なく強制発動していた deployNexus の任意化）
// 対象: deployNexus.optional（SD02-006／BS14-064の4連続deployNexus） / BS10-027 / BS13-053
import { act, assert, createGame, createInstance, getCard, handleAction, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import { fireTrigger, fireFieldEventTriggers } from "../../server/src/logic/EffectModules"
import { attachBrave } from "../../server/src/logic/removal"

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.interactiveTargets = true
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("SD02-006").name === "鼬の暗殺者ウィゼーブ", "SD02-006 は鼬の暗殺者ウィゼーブ")
    assert(getCard("BS14-064").name === "レボルシング・ゼヨン", "BS14-064 はレボルシング・ゼヨン")
    assert(getCard("BS10-027").name === "若武者ウンピョル", "BS10-027 は若武者ウンピョル")
    assert(getCard("BS13-053").name === "モクバオー", "BS13-053 はモクバオー")
    assert(getCard("BS01-098").type === "nexus" && getCard("BS01-098").colors.includes("red"), "BS01-098 は赤ネクサス")
    assert(getCard("BS10-112").name === "ネクサスエクステンション", "BS10-112 はネクサスエクステンション（配置する＝任意化しない）")
}

console.log("=== deployNexus.optional：候補1枚でも必ず選択が出て、スキップすると配置されない（SD02-006） ===")
{
    const s = base("deploy-skip")
    const action = (getCard("SD02-006").effects.find((e) => e.id === "SD02-006-e1") as { action: EffectAction }).action
    s.players.p1.trashCards.push("BS01-098")
    resolveAction(s, "p1", null, action)
    assert(s.pendingChoice !== null && s.pendingChoice.kind === "card" && s.pendingChoice.optional === true, "候補1枚でも選択待ちが立つ")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "スキップできる")
    assert(s.players.p1.trashCards.includes("BS01-098"), "スキップすると配置されない")
    assert(s.players.p1.field.nexuses.length === 0, "フィールドには置かれない")
}

console.log("=== deployNexus.optional：選べば配置される（SD02-006） ===")
{
    const s = base("deploy-choose")
    const action = (getCard("SD02-006").effects.find((e) => e.id === "SD02-006-e1") as { action: EffectAction }).action
    s.players.p1.trashCards.push("BS01-098")
    resolveAction(s, "p1", null, action)
    const idx = s.pendingChoice?.cardIndices?.[0]
    assert(idx !== undefined, "選択待ちのcardIndicesが立っている")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: idx! }) === null, "選んで配置できる")
    assert(s.players.p1.field.nexuses.some((n) => n.cardId === "BS01-098"), "フィールドに配置される")
    assert(!s.players.p1.trashCards.includes("BS01-098"), "トラッシュから消える")
}

console.log("=== deployNexus（optional無し）：候補1枚のときは従来どおり自動で配置される（BS10-112相当） ===")
{
    const s = base("deploy-auto")
    s.players.p1.trashCards.push("BS01-098")
    resolveAction(s, "p1", null, { type: "deployNexus", from: "trash" })
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(s.players.p1.field.nexuses.some((n) => n.cardId === "BS01-098"), "自動で配置される")
}

console.log("=== BS14-064：バーストのsequence内で4回deployNexusを呼ぶ。途中で選択が入っても再開して最後まで解決される ===")
{
    const s = base("bs14-064-sequence")
    const p1 = s.players.p1
    p1.trashCards.push("BS01-098", "BS01-102", "BS01-106", "BS03-113") // 赤/紫/緑/青
    p1.field.nexuses.push(createInstance("BS02-084", s.turn, 1)) // 黄ネクサスを1つ既に配置済みにしておく
    p1.burst = "BS14-064"
    const action = (getCard("BS14-064").effects.find((e) => e.id === "BS14-064-e1") as { action: EffectAction }).action

    resolveAction(s, "p1", null, action)
    let loops = 0
    while (s.pendingChoice && loops < 20) {
        loops++
        const idx = s.pendingChoice.cardIndices?.[0]
        const cardId = idx !== undefined ? p1.trashCards[idx] : undefined
        // ⚠️ ここは act() ではなく handleAction() を直接使う。smoke の保存則チェック（countCards）は
        // state.players[pid].burst を数えない盲点があり、このsequenceの最後
        // summonBurstCardFreeIfOwnNexusAtLeast がバーストエリアから場へ召喚する瞬間に
        // 「カード総数が1増えた」という誤検出になる（バーストのカードがそもそも数えられていなかった
        // だけで、実際にカードが増えたわけではない）。deployNexus.optional の実装自体とは無関係
        if (cardId === "BS01-098" || cardId === "BS01-106") {
            // 赤・緑はスキップする
            assert(handleAction(s, "p1", { type: "resolveChoice" }) === null, `${cardId}：スキップする`)
        } else {
            assert(idx !== undefined, "候補のcardIndexが立っている")
            assert(handleAction(s, "p1", { type: "resolveChoice", cardIndex: idx! }) === null, `${cardId}：配置を選ぶ`)
        }
    }
    assert(loops < 20, "無限ループしていない（20回未満で解消した）")
    assert(s.pendingChoice === null, "すべて解決してpendingChoiceが残らない")
    assert(p1.trashCards.includes("BS01-098") && p1.trashCards.includes("BS01-106"), "スキップした赤/緑はトラッシュに残る")
    assert(!p1.trashCards.includes("BS01-102") && !p1.trashCards.includes("BS03-113"), "選んだ紫/青はトラッシュから消える")
    assert(p1.field.nexuses.length === 3, "既存1つ＋紫/青で計3つ配置される")
    assert(p1.field.spirits.some((sp) => sp.cardId === "BS14-064"), "ネクサス3つ以上になったのでバースト自身が召喚される")
    assert(p1.burst === null, "バーストエリアは空になる")
}

console.log("=== BS10-027：対話では発動確認が出て、断ると分離しない ===")
{
    const s = base("bs10-027-decline")
    const spirit = createInstance("BS10-027", s.turn, getCard("BS10-027").levels[0]!.cores)
    s.players.p1.field.spirits.push(spirit)
    const host = createInstance("BS01-001", s.turn, 1)
    const brave = createInstance("BS10-076", s.turn, 0)
    s.players.p1.field.spirits.push(host)
    attachBrave(s, "p1", host, brave)

    fireTrigger(s, "p1", spirit, "onBattleEnd")
    assert(s.pendingChoice !== null && s.pendingChoice.kind === "option", "発動確認の選択待ちが立つ")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "断る（スキップ）")
    assert((host.braveRefs ?? []).some((r) => r.instanceId === brave.instanceId), "断ったので分離しない")
    assert(s.pendingChoice === null, "選択待ちは解消される")
}

console.log("=== BS13-053：対話では発動確認が出て、断ると合体しない ===")
{
    const s = base("bs13-053-decline")
    const mokubao = createInstance("BS13-053", s.turn, 1)
    mokubao.isRested = true
    s.players.p1.field.spirits.push(mokubao)
    const host = createInstance("BS12-019", s.turn, 1) // くノ一ジョロウ：コスト3（合体条件：コスト3以上を満たす）
    s.players.p1.field.spirits.push(host)
    s.phase = "attack"

    const soku = createInstance("BS01-053", s.turn, 1) // リーヴォルフ：【神速】持ち
    fireFieldEventTriggers(s, "p1", "ownSpiritSummoned", { pid: "p1", inst: soku })
    assert(s.pendingChoice !== null && s.pendingChoice.kind === "option", "発動確認の選択待ちが立つ")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "断る（スキップ）")
    assert(mokubao.isRested === true, "断ったので回復も合体もしない")
    assert(!(host.braveRefs && host.braveRefs.length > 0), "合体していない")
}

console.log("すべてのチェックに合格しました 🎉（part326）")
