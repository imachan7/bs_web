// ゲームエンジンの簡易動作確認スクリプト（npm run smoke で実行）
// ソケットを介さず、エンジンを直接叩いて一連の流れを検証する
import {
    createGame,
    createInstance,
    currentLevel,
    draw,
    getCard,
    minLevelCores,
    validateDeckCards,
    viewFor,
} from "../../server/src/logic/GameState"
import { runTurnStart as engineRunTurnStart, endTurn } from "../../server/src/logic/PhaseManager"
// 色判定は必ず述語経由にする（多色カード対応。MULTICOLOR.md）
import { canAwaken, cardHasColor, costCantAct, effectSources, hasArmorAgainst, instHasCost, instMinLevelCores } from "../../shared/rules"

// テスト用ラッパー: 1ターン目固有ルール（コアステップなし・アタック不可）の影響を受けずに
// 既存テストを動かすため、ターン数を3（先攻の2ターン目相当）へ進めて通常ターンとして処理する。
// 既存テストの期待値（初回はコア+1・ドローなしの状態から開始）を保つため、
// 初回呼び出しのときだけ通常ドローの1枚をデッキへ戻して打ち消す。
// 1ターン目そのものを検証するテストは engineRunTurnStart を直接使う
function runTurnStart(s: GameState): void {
    const firstCall = s.turn === 1
    if (firstCall) s.turn = 3
    engineRunTurnStart(s)
    if (firstCall) {
        const pid = s.turnPlayer
        const drawn = s.players[pid].hand.pop()
        if (drawn !== undefined) s.players[pid].deck.unshift(drawn)
    }
    s.turn = 3
}
import { handleAction } from "../../server/src/logic/GameEngine"
import {
    destroyNexus,
    destroySpirit,
    effectiveBp,
    fireStepTriggers,
    hasKeyword,
    refreshLevelAsOverrides,
    resolveAction,
    spiritHasFamily,
    spiritHasKeyword,
} from "../../server/src/logic/EffectModules"
import { effectiveCost } from "../../server/src/logic/RuleValidator"
import type { GameAction, GameState, PlayerId } from "../../server/src/type"
import { DECK_RECIPES, DECK_SIZE } from "../../data/constants"

let failed = 0
let passed = 0

// --quiet（または SMOKE_QUIET=1）で成功行を抑制し、失敗と最終集計のみ表示する。
// トークン節約用: 全 ✅ 行（約600行）を出さず、結論だけを残す。
const QUIET =
    process.argv.includes("--quiet") || process.env.SMOKE_QUIET === "1"

// quiet 時は装飾出力（セクション見出し ===／---、空行、拒否ノート （…））も抑制し、
// 成功時は最終集計のみを残す。失敗（❌）は console.error なので常に表示される。
if (QUIET) {
    const realLog = console.log.bind(console)
    console.log = ((...args: unknown[]): void => {
        const head = String(args[0] ?? "").trimStart()
        if (
            head === "" ||
            head.startsWith("===") ||
            head.startsWith("---") ||
            head.startsWith("（")
        ) {
            return
        }
        realLog(...args)
    }) as typeof console.log
}

function assert(cond: boolean, label: string): void {
    if (cond) {
        passed++
        if (!QUIET) console.log(`  ✅ ${label}`)
    } else {
        failed++
        console.error(`  ❌ ${label}`)
    }
}

function act(state: GameState, pid: PlayerId, action: GameAction): string | null {
    const error = handleAction(state, pid, action)
    if (error) console.log(`  （${pid}: ${action.type} → ${error}）`)
    return error
}

// フラッシュタイミング中はblock/takeLifeを宣言できない（実プレイの手順：アタック宣言→フラッシュ①→
// ブロック/ライフ受け宣言→フラッシュ②→解決）ため、isFlashTiming中は両者が連続パスするまで
// state.priorityPlayer側からpassを送って閉じる共通ヘルパー。エラーが出たらそのまま返す
function closeFlashTiming(state: GameState): string | null {
    while (state.isFlashTiming && state.battle) {
        const passError = act(state, state.priorityPlayer, { type: "pass" })
        if (passError) return passError
    }
    return null
}

// declareBlock は「フラッシュタイミング①を閉じてからブロックを宣言する」ヘルパー。
// isFlashTiming中ならまずpassを送って①を閉じ、そのうえでblockを実行する。
// エラーが出た場合はそのアクションのエラーをそのまま返す（actと同じ戻り値の形なので assert(... === null, ...) のまま使える）
function declareBlock(state: GameState, pid: PlayerId, instanceId: string): string | null {
    const closeError = closeFlashTiming(state)
    if (closeError) return closeError
    return act(state, pid, { type: "block", instanceId })
}

// ライフで受けるのはフラッシュ①終了後にのみ宣言でき、宣言した場でそのまま解決する
// （ブロックと違いフラッシュ②は開かない）。フラッシュ①を閉じてからtakeLifeを宣言するラッパー。
// エラーが出た場合はそのアクションのエラーをそのまま返す（actと同じ戻り値の形なので assert(... === null, ...) のまま使える）
function takeLifeAndResolve(state: GameState, pid: PlayerId): string | null {
    const closeError = closeFlashTiming(state)
    if (closeError) return closeError
    return act(state, pid, { type: "takeLife" })
}


// 全パート実行後にランナー（scripts/smoke.ts）から呼ぶ最終集計
export function summary(): void {
    console.log("")
    if (failed > 0) {
        console.error(`${failed}件の失敗があります（合格${passed}件）`)
        process.exit(1)
    }
    console.log(`すべてのチェックに合格しました 🎉（${passed}件）`)
}

export {
    createGame,
    createInstance,
    currentLevel,
    draw,
    getCard,
    minLevelCores,
    validateDeckCards,
    viewFor,
    engineRunTurnStart,
    endTurn,
    effectSources,
    instHasCost,
    instMinLevelCores,
    handleAction,
    destroyNexus,
    destroySpirit,
    effectiveBp,
    fireStepTriggers,
    hasKeyword,
    refreshLevelAsOverrides,
    resolveAction,
    spiritHasFamily,
    spiritHasKeyword,
    effectiveCost,
    cardHasColor,
    canAwaken,
    costCantAct,
    hasArmorAgainst,
    DECK_RECIPES,
    DECK_SIZE,
    assert,
    act,
    declareBlock,
    takeLifeAndResolve,
    runTurnStart,
}
export type { GameAction, GameState, PlayerId }
