// smoke パート439（BS16バッチ3・組D：atTurnEnd／burstMagicFreeEffect／summonFromHandFreeのalsoFrom・nameExcludes）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    handleAction,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { endTurn } from "../../server/src/logic/PhaseManager"
import { continueBurstActivation } from "../../server/src/logic/EffectModules"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const BURST_MAGIC_MAIN = "BS14-092" // 烈光閃刃（メイン効果のみ持つバーストマジック。thenPay:"main"）
const RED_RECOVER_TARGET = "BS01-002" // 烈光閃刃メイン効果（トラッシュの赤スピリット/ブレイヴを手札に戻す）の対象用
const PIYON = "BS02-049" // ピヨン（黄・コスト0）
const KORISTAL = "BS02-050" // コリスタル（黄・コスト0）
const CHUNPOPO = "BS02-051" // チュンポポ（黄・コスト1）
const ARCANA_KEN = "BS02-056" // アルカナビースト・ケン（黄・コスト2。nameExcludesで除く対象）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BURST_MAGIC_MAIN).name === "烈光閃刃" && getCard(BURST_MAGIC_MAIN).type === "magic", "BURST_MAGIC_MAINは烈光閃刃")
    assert(getCard(PIYON).colors.includes("yellow") && getCard(PIYON).cost === 0, "PIYONは黄コスト0")
    assert(getCard(ARCANA_KEN).name.includes("アルカナ") && getCard(ARCANA_KEN).colors.includes("yellow"), "ARCANA_KENは名前にアルカナを含む黄")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "blue" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

console.log("=== 1. atTurnEnd：記録したactionはこのターン終了時に1回だけ解決され、発生源が先に場を離れていても解決する ===")
{
    const s = game("p439-turnend")
    const src = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(src)
    refreshLevelAsOverrides(s)
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", src, { type: "atTurnEnd", action: { type: "draw", count: 1 } })
    assert(s.players.p1.hand.length === handBefore, "解決した時点ではdrawしない")
    assert((s.turnEndActions ?? []).length === 1 && s.turnEndActions?.[0]?.ownerPid === "p1", "GameState.turnEndActionsへ記録される")
    // 発生源が場を離れてもターン終了時には解決する（公式Q&A Q22394〜Q22396）
    s.players.p1.field.spirits = s.players.p1.field.spirits.filter((sp) => sp.instanceId !== src.instanceId)
    endTurn(s)
    assert(s.players.p1.hand.length === handBefore + 1, `ターン終了時に1回だけdrawする（実際の増分 ${s.players.p1.hand.length - handBefore}）`)
    assert((s.turnEndActions ?? []).length === 0, "解決後は記録が空になる")
}

console.log("=== 2. burstMagicFreeEffect：持ち主がいれば、バースト解決後に無償でメイン効果を発揮できる（コストは減らない） ===")
{
    const s = game("p439-burstfree", true)
    const card = getCard(VANILLA)
    const savedEffects = card.effects
    try {
        card.effects = [...savedEffects, { id: "smoke439-grant", kind: "burstMagicFreeEffect", levels: null }] as typeof card.effects
        const grantHolder = createInstance(VANILLA, s.turn, 1)
        s.players.p1.field.spirits.push(grantHolder)
        refreshLevelAsOverrides(s)
        s.players.p1.trashCards.push(RED_RECOVER_TARGET)
        s.players.p1.burst = BURST_MAGIC_MAIN
        s.players.p1.burstSet = true
        const reserveBefore = s.players.p1.reserve
        continueBurstActivation(s, { kind: "burstFinish", stage: "finish", pid: "p1", cardId: BURST_MAGIC_MAIN, actionType: "draw", thenPay: "main", before: [] })
        assert(s.pendingChoice?.kind === "option" && s.pendingChoice.confirm !== true, "コスト払い/無償の選択肢が立つ（発動確認confirmではない）")
        const options = s.pendingChoice?.options ?? []
        assert(options.some((o) => o.includes("コストを支払わずにメイン")), "無償でメイン効果の選択肢がある")
        assert(!options.some((o) => o.includes("フラッシュ")), "メイン効果しか持たないカードなので無償フラッシュの選択肢は無い")
        const freeOpt = options.find((o) => o.includes("コストを支払わずに"))!
        const error = handleAction(s, "p1", { type: "resolveChoice", option: freeOpt })
        assert(!error, `選択への応答が通る（${error ?? ""}）`)
        assert(s.players.p1.reserve === reserveBefore, "無償で発揮したのでコストは減っていない")
        assert(s.players.p1.hand.includes(RED_RECOVER_TARGET), "メイン効果（トラッシュの赤スピリットを手札に戻す）が発揮された")
    } finally {
        card.effects = savedEffects
    }
}

console.log("=== 3. burstMagicFreeEffectを持たなければ、従来どおりコストを払うthenPayの発動確認だけになる ===")
{
    const s = game("p439-burstfree-none", true)
    s.players.p1.burst = BURST_MAGIC_MAIN
    s.players.p1.burstSet = true
    continueBurstActivation(s, { kind: "burstFinish", stage: "finish", pid: "p1", cardId: BURST_MAGIC_MAIN, actionType: "draw", thenPay: "main", before: [] })
    assert(s.pendingChoice?.confirm === true, "burstMagicFreeEffectが無ければ従来どおりの発動確認（confirm）になる")
}

console.log("=== 4. summonFromHandFree：alsoFrom:trash＋nameExcludes＋upTo（手札とトラッシュ合計count枚まで、1枚ずつゾーンを選べる） ===")
{
    const s = game("p439-alsofrom", true)
    s.players.p1.hand = [PIYON, ARCANA_KEN, CHUNPOPO]
    s.players.p1.trashCards.push(KORISTAL, ARCANA_KEN)
    const action = {
        type: "summonFromHandFree" as const,
        colorFilter: "yellow" as const,
        nameExcludes: "アルカナ",
        alsoFrom: "trash" as const,
        count: 3,
        upTo: true as const,
        skipOnSummon: true as const,
    }
    resolveAction(s, "p1", null, action)
    assert(s.pendingChoice?.kind === "option", "手札・トラッシュ両方に候補があるのでゾーンを選ばせる")
    assert((s.pendingChoice?.options ?? []).length === 2, "選択肢は「手札から」「トラッシュから」の2つ")
    handleAction(s, "p1", { type: "resolveChoice", option: "手札から選ぶ" })
    assert(s.pendingChoice?.kind === "card" && s.pendingChoice.cardZone === "hand", "手札のカード選択になる")
    const handIdxs = s.pendingChoice?.cardIndices ?? []
    assert(handIdxs.every((i) => s.players.p1.hand[i] !== ARCANA_KEN), "nameExcludesで除いたカードは候補に出ない")
    const piyonIdx = handIdxs.find((i) => s.players.p1.hand[i] === PIYON)!
    handleAction(s, "p1", { type: "resolveChoice", cardIndex: piyonIdx })
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === PIYON), "手札から1体目（ピヨン）を無償召喚した")

    assert(s.pendingChoice?.kind === "option", "残り2枚まで、続けてゾーンを選ばせる")
    handleAction(s, "p1", { type: "resolveChoice", option: "トラッシュから選ぶ" })
    assert(s.pendingChoice?.kind === "card" && s.pendingChoice.cardZone === "trash", "トラッシュのカード選択になる")
    const trashIdxs = s.pendingChoice?.cardIndices ?? []
    assert(trashIdxs.every((i) => s.players.p1.trashCards[i] !== ARCANA_KEN), "トラッシュ側もnameExcludesで除かれる")
    const koristalIdx = trashIdxs.find((i) => s.players.p1.trashCards[i] === KORISTAL)!
    handleAction(s, "p1", { type: "resolveChoice", cardIndex: koristalIdx })
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === KORISTAL), "トラッシュから2体目（コリスタル）を無償召喚した")

    // 残り1枚：この時点でトラッシュ側の候補は尽きている（アルカナは除外）ので、ゾーン選択を挟まず手札のカード選択になる
    assert(s.pendingChoice?.kind === "card" && s.pendingChoice.cardZone === "hand", "候補が手札にしかないのでゾーン選択を挟まない")
    const lastIdxs = s.pendingChoice?.cardIndices ?? []
    const chunpopoIdx = lastIdxs.find((i) => s.players.p1.hand[i] === CHUNPOPO)!
    handleAction(s, "p1", { type: "resolveChoice", cardIndex: chunpopoIdx })
    assert(s.players.p1.field.spirits.filter((sp) => [PIYON, KORISTAL, CHUNPOPO].includes(sp.cardId)).length === 3, "合計3体（手札2＋トラッシュ1）を無償召喚した")
    assert(s.players.p1.hand.includes(ARCANA_KEN) && s.players.p1.trashCards.includes(ARCANA_KEN), "除外したカードは手札・トラッシュにそのまま残る")
}

console.log("=== 5. 非対話（自動解決）：手札とトラッシュを合わせてコスト最大から貪欲に、count枚まで ===")
{
    const s = game("p439-alsofrom-auto", false)
    s.players.p1.hand = [PIYON, ARCANA_KEN, CHUNPOPO]
    s.players.p1.trashCards.push(KORISTAL, ARCANA_KEN)
    const action = {
        type: "summonFromHandFree" as const,
        colorFilter: "yellow" as const,
        nameExcludes: "アルカナ",
        alsoFrom: "trash" as const,
        count: 2,
        upTo: true as const,
        skipOnSummon: true as const,
    }
    resolveAction(s, "p1", null, action)
    assert(!s.pendingChoice, "非対話では選択待ちにならない")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === CHUNPOPO), "コスト最大（チュンポポ：コスト1）から選ばれる")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === PIYON), "次点（ピヨン：コスト0。手札優先で同コストのコリスタルより先）が選ばれる")
    assert(s.players.p1.trashCards.includes(KORISTAL), "count2枚で打ち切るので、トラッシュのコリスタルは残る")
    assert(s.players.p1.hand.includes(ARCANA_KEN) && s.players.p1.trashCards.includes(ARCANA_KEN), "除外したカードは対象にならない")
}

console.log("すべてのチェックに合格しました 🎉（part439）")
