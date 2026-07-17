// ゲームエンジンの簡易動作確認スクリプト（npm run smoke で実行）
// ソケットを介さず、エンジンを直接叩いて一連の流れを検証する
import {
    createGame,
    createInstance,
    draw,
    getCard,
    lv1Cores,
    validateDeckCards,
    viewFor,
} from "../../server/src/logic/GameState"
import { runTurnStart as engineRunTurnStart } from "../../server/src/logic/PhaseManager"

// テスト用ラッパー: 「先攻1ターン目はアタック不可」ルールの影響を受けずに
// 既存テストを動かすため、ターン開始処理の後にターン数を3（先攻の2ターン目相当）へ進める。
// 1ターン目固有の挙動（初回ドローなし等）は engineRunTurnStart 内で処理済みのため影響しない。
// 1ターン目そのものを検証するテストは engineRunTurnStart を直接使う
function runTurnStart(s: GameState): void {
    engineRunTurnStart(s)
    s.turn = 3
}
import { handleAction } from "../../server/src/logic/GameEngine"
import { destroySpirit, effectiveBp, hasKeyword, resolveAction, spiritHasKeyword } from "../../server/src/logic/EffectModules"
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
    draw,
    getCard,
    lv1Cores,
    validateDeckCards,
    viewFor,
    engineRunTurnStart,
    handleAction,
    destroySpirit,
    effectiveBp,
    hasKeyword,
    resolveAction,
    spiritHasKeyword,
    effectiveCost,
    DECK_RECIPES,
    DECK_SIZE,
    assert,
    act,
    runTurnStart,
}
export type { GameAction, GameState, PlayerId }
