// smoke パート17（対戦体験の改善第三弾: 手札・トラッシュからのカード選択のchoice化）
// 収録セクション:
//   - server/src/type.ts: PendingChoice.kind:"card"（cardZone/cardOwner/cardIndices）、
//     GameAction "resolveChoice" の cardIndex、EffectAction "discardOpponent" の
//     forcedTargetPid（内部専用）、EffectDef kind:"magic" の mainForbidden
//   - server/src/logic/EffectModules.ts: requestCardChoice/tryInteractiveCardChoice、
//     discardOpponent/recoverSpiritFromTrash/recoverMagicFromTrash/summonFromHandFree/
//     deployNexus のinteractiveTargets時choice化
//   - server/src/logic/RuleValidator.ts: validateCastMagicのmainForbiddenチェック
//     （BS02-097 ネイチャーフォース：メインステップでは使用不可）
import {
    act,
    assert,
    createGame,
    createInstance,
    resolveAction,
    runTurnStart,
} from "./helpers"

console.log("=== [interactiveTargets] discardOpponent：選択者は破棄される相手本人（BS01-056 マッチュラ） ===")
{
    const s = createGame(
        "interactive-discard-opponent",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "purple" },
    )
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p1.hand[0] = "BS01-056" // マッチュラ：コスト3・召喚時 discardOpponent count:1
    s.players.p1.reserve = 10
    s.players.p2.hand = ["BS01-001", "BS01-002", "BS01-003"]

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "マッチュラを召喚")
    assert(s.pendingChoice !== null, "相手(p2)側にpendingChoiceが立つ")
    assert(s.pendingChoice?.pid === "p2", "選択者は破棄される相手(p2)")
    assert(s.pendingChoice?.kind === "card", "kindはcard")
    assert(s.pendingChoice?.cardZone === "hand", "cardZoneはhand")
    assert(s.pendingChoice?.cardOwner === "p2", "cardOwnerは選択者自身(p2)")
    assert(
        JSON.stringify(s.pendingChoice?.cardIndices) === JSON.stringify([0, 1, 2]),
        "候補はp2の手札全インデックス",
    )
    assert(s.players.p2.hand.length === 3, "選択待ち中はまだ破棄されていない")

    assert(
        act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) !== null,
        "本人(効果の使用者p1)のresolveChoiceは拒否される",
    )
    assert(
        act(s, "p2", { type: "resolveChoice", cardIndex: 5 }) !== null,
        "候補外インデックスは拒否される",
    )
    assert(s.pendingChoice !== null, "拒否された操作ではpendingChoiceは消費されない")
    assert(s.players.p2.hand.length === 3, "拒否された操作では手札は変化しない")

    assert(
        act(s, "p2", { type: "resolveChoice", cardIndex: 1 }) === null,
        "p2がインデックス1（BS01-002）を選んで解決",
    )
    assert(s.pendingChoice === null, "選択後pendingChoiceは解消される")
    assert(s.players.p2.hand.length === 2, "手札が1枚減る")
    assert(!s.players.p2.hand.includes("BS01-002"), "選んだカードは手札からなくなる")
    assert(s.players.p2.trashCards.includes("BS01-002"), "選んだカードがトラッシュへ")
}

console.log("--- count:2の直接resolveAction検証：連続選択でも選択者(forcedTargetPid)が正しく引き継がれる ---")
{
    const s = createGame(
        "interactive-discard-count2",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "purple" },
    )
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p2.hand = ["BS01-001", "BS01-002", "BS01-003", "BS01-004"]

    resolveAction(s, "p1", null, { type: "discardOpponent", count: 2 })
    assert(s.pendingChoice !== null, "1回目のpendingChoiceが立つ")
    assert(s.pendingChoice?.pid === "p2", "1回目も選択者はp2")
    assert(s.pendingChoice?.cardIndices?.length === 4, "候補は手札4件")

    assert(act(s, "p2", { type: "resolveChoice", cardIndex: 0 }) === null, "1枚目を選択")
    assert(s.players.p2.hand.length === 3, "1枚破棄された")
    assert(s.pendingChoice !== null, "残りcount-1分の2回目のpendingChoiceが連続で立つ")
    assert(s.pendingChoice?.pid === "p2", "2回目も選択者はp2のまま")

    assert(act(s, "p2", { type: "resolveChoice", cardIndex: 0 }) === null, "2枚目を選択")
    assert(s.pendingChoice === null, "2回選択後pendingChoiceは解消される")
    assert(s.players.p2.hand.length === 2, "2枚破棄され2枚残る")
}

console.log("=== [interactiveTargets] recoverMagicFromTrash：トラッシュのマジック2枚から選んで手札へ（BS02-072 トリックスター） ===")
{
    const s = createGame(
        "interactive-recover-magic",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p1.trashCards.push("BS01-114", "BS01-115") // バスタースピア／アウェイクン（いずれもマジック）
    s.players.p1.hand[0] = "BS02-072" // トリックスター：コスト6・召喚時 recoverMagicFromTrash
    s.players.p1.reserve = 10

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "トリックスターを召喚")
    assert(s.pendingChoice !== null, "候補2件のためpendingChoiceが立つ")
    assert(s.pendingChoice?.pid === "p1", "選択者は使用者(p1)")
    assert(s.pendingChoice?.kind === "card", "kindはcard")
    assert(s.pendingChoice?.cardZone === "trash", "cardZoneはtrash")
    assert(s.pendingChoice?.cardOwner === "p1", "cardOwnerは使用者自身(p1)")
    assert(
        JSON.stringify(s.pendingChoice?.cardIndices) === JSON.stringify([0, 1]),
        "候補はトラッシュのマジック2枚のインデックス",
    )

    assert(
        act(s, "p1", { type: "resolveChoice", cardIndex: 1 }) === null,
        "p1がインデックス1（アウェイクン）を選んで解決",
    )
    assert(s.pendingChoice === null, "選択後pendingChoiceは解消される")
    assert(s.players.p1.hand.includes("BS01-115"), "選んだアウェイクンが手札へ")
    assert(s.players.p1.trashCards.includes("BS01-114"), "選ばなかったバスタースピアはトラッシュに残る")
    assert(!s.players.p1.trashCards.includes("BS01-115"), "選んだアウェイクンはトラッシュからなくなる")
}

console.log("=== [interactiveTargets] summonFromHandFree：手札の緑スピリット2枚から選んで無料召喚（BS02-034 老賢樹トレントン） ===")
{
    const s = createGame(
        "interactive-summon-free",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    s.interactiveTargets = true
    // エイプウィップ（緑・コスト4・onSummon:coreGain）とビートビートル（緑・コスト0・効果なし）を候補にする
    s.players.p1.hand = ["BS02-034", "BS01-061", "BS01-050"]
    s.players.p1.reserve = 20

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "老賢樹トレントンを召喚")
    // 「コストを支払わずに召喚できる」＝optional のため、まず発動確認が入る（2026-08-16 confirm式へ移行）
    assert(s.pendingChoice?.confirm === true, "先に発動確認のpendingChoiceが立つ")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動を選ぶ")
    assert(s.pendingChoice !== null, "候補2件のためpendingChoiceが立つ")
    assert(s.pendingChoice?.pid === "p1", "選択者は使用者(p1)")
    assert(s.pendingChoice?.kind === "card", "kindはcard")
    assert(s.pendingChoice?.cardZone === "hand", "cardZoneはhand")
    assert(
        JSON.stringify(s.pendingChoice?.cardIndices) === JSON.stringify([0, 1]),
        "候補は残り手札（緑スピリット2枚）のインデックス",
    )

    assert(
        act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null,
        "p1がインデックス0（エイプウィップ）を選んで無料召喚",
    )
    assert(s.pendingChoice === null, "選択後pendingChoiceは解消される")
    assert(
        s.players.p1.field.spirits.some((i) => i.cardId === "BS01-061"),
        "選んだエイプウィップが無料召喚される",
    )
    assert(
        s.players.p1.hand.length === 1 && s.players.p1.hand[0] === "BS01-050",
        "選ばなかったビートビートルだけが手札に残る",
    )
    assert(
        // 2026-08-17：コストを支払わない召喚でも**召喚時効果は発揮される**ように直した
        // （効果文にその制限が書かれていないため。part215）。
        // エイプウィップの onSummon（coreGain 1）でボイドからリザーブへ1個戻るので +1 される
        s.players.p1.reserve === 20 - 7 - 1 + 1,
        "コスト6+維持1（トレントン）と維持1（エイプウィップ）を消費し、エイプウィップのonSummon:coreGainで+1される",
    )
}

console.log("=== interactiveTargets 既定false（未設定）では従来どおり決定的選択（choiceなし） ===")
{
    const s = createGame(
        "interactive-discard-default-off",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "purple" },
    )
    runTurnStart(s)
    assert(s.interactiveTargets === false, "createGameの既定値はfalse")
    s.players.p1.hand[0] = "BS01-056" // マッチュラ
    s.players.p1.reserve = 10
    s.players.p2.hand = ["BS01-001", "BS01-002", "BS01-003"]

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "マッチュラを召喚")
    assert(s.pendingChoice === null, "interactiveTargetsがfalseならpendingChoiceは立たない")
    assert(s.players.p2.hand.length === 2, "従来どおり手札末尾（決定的選択）が破棄される")
    assert(!s.players.p2.hand.includes("BS01-003"), "手札末尾のカードが破棄される")
}

console.log("=== BS02-097 ネイチャーフォース（mainForbidden）：メインステップでは使用不可・バトル中フラッシュでは使用可 ===")
{
    console.log("--- メインステップでのcastMagicは拒否される ---")
    const s = createGame(
        "natureforce-mainforbidden-reject",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.hand[0] = "BS02-097"
    s.players.p1.reserve = 10

    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0 }) !== null,
        "メインステップでのネイチャーフォース使用は拒否される",
    )
    assert(s.players.p1.hand.includes("BS02-097"), "拒否されたため手札に残ったまま")

    console.log("--- バトル中のフラッシュタイミングでは使用できる ---")
    const s2 = createGame(
        "natureforce-mainforbidden-flash-ok",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s2)
    s2.players.p1.hand[0] = "BS02-097"
    s2.players.p1.reserve = 10
    const inst = createInstance("BS01-001", s2.turn, 1)
    s2.players.p1.field.spirits.push(inst)

    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s2, "p1", { type: "attack", instanceId: inst.instanceId }) === null,
        "アタックしてフラッシュタイミングを開始",
    )
    assert(act(s2, "p2", { type: "pass" }) === null, "p2がパスしてp1に優先権を戻す")
    assert(
        act(s2, "p1", {
            type: "castMagic",
            handIndex: 0,
            targetInstanceId: inst.instanceId,
        }) === null,
        "バトル中のフラッシュでネイチャーフォースを使用できる",
    )
}
