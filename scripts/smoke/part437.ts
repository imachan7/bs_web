// smoke パート437（BS16バッチ3 組B：新設FieldEvent opponentLifeDamaged / opponentBurstSet / ownDeckMilled + toDeck.fromEvent）
//
// opponentLifeDamaged / opponentBurstSet はどちらも「ownLifeDamaged / ownBurstSet の鏡」で、
// 実在カードがまだ無い（このバッチはエンジン側のみ）。fireFieldEventTriggers はESMの読み取り専用
// バインディングとしてrequireされるため、この実行環境ではスパイ（差し替え）ができない
// （Object.definePropertyがconfigurable:falseで拒否される）。そのため発火の配線は
// scripts/coverage-effects.ts の checkPatchTargets / smoke/part160 と同じ考え方＝
// 呼び出し元ソースの文字列一致で確かめ、実際の状態変化（ライフ・バースト・破棄枚数）は
// 生産コードをそのまま実行して確かめる
import * as fs from "fs"
import * as path from "path"
import {
    assert,
    createGame,
    getCard,
    placeBurst,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"

const { millDeck } = require("../../server/src/logic/zones/mill") as { millDeck: (...args: unknown[]) => number }

const REPO = path.resolve(__dirname, "../..")
const src = (rel: string): string => fs.readFileSync(path.join(REPO, rel), "utf-8")

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const OTHER_CARD = "BS01-003" // テラノセイバー（VANILLAと別cardId。破棄より前からトラッシュにある1枚として使う）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
    assert(getCard(OTHER_CARD).name === "テラノセイバー" && OTHER_CARD !== VANILLA, "OTHER_CARDはVANILLAと別カード")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    refreshLevelAsOverrides(s)
    return s
}

console.log("=== 1. opponentLifeDamaged：原因を問わない（バトルでなく効果によるライフ減少でも発火する） ===")
{
    const s = game("case1")
    // p1の効果がp2のライフを2個減らす（アタックを介さない。srcType:"magic"扱い）
    resolveAction(s, "p1", null, { type: "lifeCrush", count: 2 }, undefined, undefined, "magic")
    assert(s.players.p2.life === 3, "p2のライフが2減った（前提5→3。効果によるライフ減少が正しく動く）")

    const flow = src("server/src/logic/actions/battleFlow.ts")
    assert(
        flow.includes('fireFieldEventTriggers(state, owner, "opponentLifeDamaged")'),
        "battleFlow.ts（lifeCrush＝効果によるライフ減少）がowner側でopponentLifeDamagedを発火する配線を持つ",
    )
    const battle = src("server/src/logic/battleResolve.ts")
    assert(
        battle.includes('fireFieldEventTriggers(state, attackerPid, "opponentLifeDamaged")'),
        "battleResolve.ts（アタックによるライフ減少）がattackerPid側でopponentLifeDamagedを発火する配線を持つ",
    )
}

console.log("=== 2. opponentBurstSet：セットのたびにplaceBurstから発火する配線・自分のバースト状態は変わる ===")
{
    const s = game("case2")
    assert(s.players.p2.burst === null, "セット前はp2のバーストが空")
    placeBurst(s, "p2", VANILLA) // p1から見て相手（p2）がセットした。placeBurstはカード種別を見ないので任意のcardIdでよい
    assert(s.players.p2.burst === VANILLA && s.players.p2.burstSet === true, "p2のバーストがセットされた")

    const burstSrc = src("server/src/logic/keywords/burst.ts")
    assert(
        burstSrc.includes('fireFieldEventTriggers(state, opponentOf(pid), "opponentBurstSet")'),
        "placeBurst（setBurst／setBurstFromHandの共通処理）が、セットした側から見た相手側でopponentBurstSetを発火する配線を持つ",
    )
    // ownBurstSetとopponentBurstSetは同じplaceBurst内の隣接する2行で発火するため、
    // 「自分のセットでは自分側にopponentBurstSetが出ない」は上のsrc一致（pidはpid自身でなくopponentOf(pid)）で保証される
}

console.log("=== 3. ownDeckMilled：10枚以上で発火・eventCountに実枚数を渡す（9枚との違い） ===")
{
    const s = game("case3")
    const actual10 = millDeck(s, "p1", 10, "p2", { sourceType: "spirit" })
    assert(actual10 === 10, "10枚破棄された")
    assert(s.lastDeckMill?.pid === "p1" && s.lastDeckMill.cardIds.length === 10, "lastDeckMillに10枚分のcardIdsが記録された（minEventCount:10のカードが読む材料）")

    const s2 = game("case3b")
    const actual9 = millDeck(s2, "p1", 9, "p2", { sourceType: "spirit" })
    assert(actual9 === 9, "9枚破棄された")
    assert(s2.lastDeckMill?.cardIds.length === 9, "lastDeckMillは9枚分だけを記録する（10枚のときと区別できる）")

    const mill = src("server/src/logic/zones/mill.ts")
    assert(
        mill.includes('fireFieldEventTriggers(state, pid, "ownDeckMilled", undefined, undefined, undefined, actual, {'),
        "millDeckが、破棄された側（pid）でownDeckMilledをeventCount=actual（実破棄枚数）付きで発火する配線を持つ。" +
            "9枚と10枚の違いは既存の汎用minEventCountフィルタ（triggers.ts）がeventCountで判定する",
    )
    assert(
        mill.includes("bySpiritEffect: byOpponent && cause?.sourceType === \"spirit\""),
        "相手のスピリットの効果による破棄だけbySpiritEffectがtrueになる配線を持つ（既存の汎用byOpponentSpiritEffectOnlyが読む）",
    )
}

console.log("=== 4. toDeck.fromEvent：その回に破棄されたカードだけを候補にする ===")
{
    const s = game("case4")
    // 破棄より前からトラッシュにある1枚（今回の破棄対象ではない）
    s.players.p1.trashCards.push(OTHER_CARD)
    const beforeCount = s.players.p1.trashCards.length
    millDeck(s, "p1", 10, "p2", { sourceType: "spirit" })
    assert(s.players.p1.trashCards.length === beforeCount + 10, "10枚破棄されてトラッシュに積まれた")
    const deckBeforeToDeck = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "toDeck", from: "trash", position: "top", count: 5, upTo: true, fromEvent: true }, undefined, undefined, "magic")
    assert(s.players.p1.deck.length === deckBeforeToDeck + 5, "非対話では候補5枚まですべて選ばれ、デッキの上に5枚戻る")
    assert(s.players.p1.trashCards.length === beforeCount + 10 - 5, "戻した5枚ぶんトラッシュが減った")
    // 破棄より前からあった1枚（OTHER_CARD）は、今回の破棄対象（トラッシュ末尾側の10枚）に含まれないため、
    // fromEventの候補にならず必ず残っているはず
    assert(s.players.p1.trashCards.includes(OTHER_CARD), "破棄より前からトラッシュにあったカードはfromEventの候補にならず残っている")
}

console.log("=== 5. toDeck.fromEvent：fromEvent無指定なら従来どおりトラッシュ全体が候補になる（回帰確認） ===")
{
    const s = game("case5")
    s.players.p1.trashCards.push(OTHER_CARD, OTHER_CARD)
    millDeck(s, "p1", 10, "p2", { sourceType: "spirit" })
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "toDeck", from: "trash", position: "top", count: 5, upTo: true }, undefined, undefined, "magic")
    assert(s.players.p1.deck.length === deckBefore + 5, "fromEvent無指定でも従来どおり5枚戻せる")
    // fromEvent無指定では新しく破棄された分から優先的に選ばれる（choosableが末尾優先で拾う既存挙動）ため、
    // OTHER_CARDが必ず残るとは限らない。ここでは件数の回帰のみ確認する
}

console.log("すべてのチェックに合格しました 🎉（part437）")
