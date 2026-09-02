// ゲームエンジンの簡易動作確認スクリプト（npm run smoke で実行）
// ソケットを介さず、エンジンを直接叩いて一連の流れを検証する
import {
    createGame as engineCreateGame,
    createInstance,
    currentLevel,
    draw,
    getCard,
    minLevelCores,
    takeMutationAfterSuspend,
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
import { DECK_RECIPES, DECK_MIN_SIZE, DECK_SIZE } from "../../data/constants"

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

// ── 対話モード（SMOKE_INTERACTIVE=1）────────────────────────────────────────
// 実サーバーは常に interactiveTargets = true だが、smoke は既定 false で走るため
// **中断・再開の経路が178パート中30本ほどしか通っていない**。そこで createGame と act に
// 薄いドライバを噛ませ、既存パートをそのまま「割り込まれる側」のテストとして再実行する。
//
// このモードで見るのは**アサーションの合否ではない**（自動選択と選択結果が変わるため、
// 期待値が落ちるのは正常）。見るのは次の3つ:
//   1. 例外を投げずに走り切るか
//   2. 応答しても pendingChoice が解消しない（＝再開が壊れている）状態にならないか
//   3. 中断中に盤面が変更されないか（後述の変更検出ガード。段階2で追加）
const INTERACTIVE =
    process.argv.includes("--interactive") || process.env.SMOKE_INTERACTIVE === "1"

// 対話モードで検出した異常（アサーション失敗とは別に数える）
let interactiveAnomalies = 0
// 1回の act で消化する選択の上限。これを超えたら再開の無限ループとみなす
const MAX_CHOICES_PER_ACTION = 200

// createGame のラッパー: 対話モードでは実サーバーと同じ interactiveTargets = true で開始する
function createGame(...args: Parameters<typeof engineCreateGame>): GameState {
    const state = engineCreateGame(...args)
    if (INTERACTIVE) state.interactiveTargets = true
    return state
}

// 立っている pendingChoice に「候補の先頭」で自動応答し、解消するまで繰り返す。
// 先頭を選ぶのは、スキップより多くの解決経路を通すため（スキップだと非対話時と同じ道になりやすい）。
// 自動応答が kind:"target" の選択待ちへ返す候補。
//
// トグル選択（PendingChoice.selectedIds。予算内で好きなだけ破壊する）は
// **選択済みも候補に残る**ため、candidates[0] をそのまま押すと選択と解除を往復して終わらない。
// まだ選んでいないものを1つずつ足していき、足せるものが無くなったらスキップ＝確定させる
export function autoPickTarget(pending: { candidates: string[]; selectedIds?: string[] }): string | undefined {
    const selected = pending.selectedIds
    if (selected) return pending.candidates.find((id) => !selected.includes(id))
    return pending.candidates[0]
}

function drainPendingChoices(state: GameState, label: string): void {
    let n = 0
    while (state.pendingChoice && !state.winner) {
        if (++n > MAX_CHOICES_PER_ACTION) {
            interactiveAnomalies++
            console.error(`  ❌ [対話] 選択が${MAX_CHOICES_PER_ACTION}回を超えても解消しない（${label}）`)
            state.pendingChoice = null
            return
        }
        const pending = state.pendingChoice
        const response: GameAction = { type: "resolveChoice" }
        if (pending.kind === "target") {
            const first = autoPickTarget(pending)
            if (first !== undefined) response.instanceId = first
        } else if (pending.kind === "option") {
            // confirm:true は選択肢1つの発動確認。ラベルは渡さない仕様だが、
            // 応答としては option を送れば発動する（送らない＝スキップ＝発動しない）
            const first = pending.options?.[0]
            if (first !== undefined) response.option = first
        } else {
            const first = pending.cardIndices?.[0]
            if (first !== undefined) response.cardIndex = first
        }
        const before = pending
        const error = handleAction(state, pending.pid, response)
        if (error) {
            interactiveAnomalies++
            console.error(`  ❌ [対話] 選択への応答が拒否された: ${error}（${label}）`)
            state.pendingChoice = null
            return
        }
        // 同一の選択待ちが解消されないまま残っている＝再開が進んでいない
        if (state.pendingChoice === before) {
            interactiveAnomalies++
            console.error(`  ❌ [対話] 応答しても同じ選択待ちが残り続けている（${label}）`)
            state.pendingChoice = null
            return
        }
    }
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

// ── 保存則の検査 ────────────────────────────────────────────────────────────
// カードは増えも減りもしない：デッキ・手札・トラッシュ・手元・フィールド・公開ゾーンの
// 総数は1回の handleAction をまたいで変わらない。
// **固定のベースラインとは比べない**：smoke はテスト準備で createInstance を直接フィールドへ
// 積むため総数が動く。エンジンの責任範囲は「1アクションの前後で変わらないこと」なので差分で見る。
//
// 実績：実対戦で出た deckReveal のデッキ流出（選ぶたびにデッキ上から count 枚が消えていた）は
// 手順書では防げず、この検査でしか捕まらない種類のバグ（HANDOFF §5.1）。
//
// コアは保存則が成り立たない（ボイドは無尽蔵の供給源で、出入りが正当）ため総数は見ない。
// 代わりに負値・非整数だけを弾く。
function countCards(state: GameState): number {
    let total = 0
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = state.players[pid]
        total +=
            p.deck.length +
            p.hand.length +
            p.trashCards.length +
            p.tegamoto.length +
            p.field.spirits.length +
            p.field.nexuses.length +
            // 合体中のブレイヴ（docs/design/BRAVE.md §2.3）。**フィールド走査の対象ではないが、
            // カードとしては場に存在する**ので保存則には数える。数え忘れると
            // 「合体するたびに1枚消えた」と誤検出される（2026-08-25 に実際に出た）
            p.field.combinedBraves.length
    }
    // 公開ゾーンは解決中だけ存在する一時領域。ここに滞留したぶんも数に入れる
    total += state.revealedCards?.cardIds.length ?? 0
    // 召喚の途中（【転召】の対象選択で中断中）は、召喚するカードが手札から出ていて
    // フィールドにもまだ無い。この1枚も数に入れる（RESUME_STACK.md §6 の手順どおりに
    // 「コストを支払う → 転召 → 維持コアを置く → 召喚完了」と進めるため。2026-08-20）
    total += state.summoningInstanceId !== undefined ? 1 : 0
    // 場を離れた合体スピリットから外されて、残すかの確認を待っているブレイヴ（BRAVE.md §6.3）。
    // 「コアを乗せずに分けて置いてある」状態で場のどのゾーンにも属さないので、ここで数える
    total += state.pendingBraveKeeps?.length ?? 0
    return total
}

// コアの健全性（負値・非整数がないか）。違反があれば説明文字列を返す
function checkCoreSanity(state: GameState): string | null {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = state.players[pid]
        for (const [name, v] of [
            ["ライフ", p.life],
            ["リザーブ", p.reserve],
            ["トラッシュのコア", p.trashCores],
        ] as [string, number][]) {
            if (!Number.isInteger(v) || v < 0) return `${pid}の${name}が不正: ${v}`
        }
        for (const inst of [...p.field.spirits, ...p.field.nexuses, ...p.field.combinedBraves]) {
            if (!Number.isInteger(inst.cores) || inst.cores < 0) {
                return `${pid}の${inst.instanceId}のコアが不正: ${inst.cores}`
            }
        }
    }
    return null
}

// 保存則の違反件数（アサーション失敗とは別に数え、対話・非対話どちらでも落とす）
let invariantViolations = 0

function checkInvariants(state: GameState, before: number, label: string): void {
    // 中断中の盤面変更ガード（エンジン側 GameState.checkNoMutationAfterSuspend が記録したもの）
    for (const problem of takeMutationAfterSuspend()) {
        invariantViolations++
        console.error(`  ❌ [中断ガード] ${problem}（${label}）`)
    }
    const after = countCards(state)
    if (after !== before) {
        invariantViolations++
        console.error(
            `  ❌ [保存則] カード総数が ${before} → ${after}（差${after - before}）に変化した（${label}）`,
        )
    }
    const coreProblem = checkCoreSanity(state)
    if (coreProblem) {
        invariantViolations++
        console.error(`  ❌ [保存則] ${coreProblem}（${label}）`)
    }
}

function act(state: GameState, pid: PlayerId, action: GameAction): string | null {
    const label = `${pid}: ${action.type}`
    const before = countCards(state)
    if (INTERACTIVE) {
        // 対話モードでは例外で走行を止めない（1件の異常で残り全パートが走らなくなるため）。
        // 例外そのものを異常として数え、次のアクションへ進む
        try {
            const error = handleAction(state, pid, action)
            if (error) console.log(`  （${label} → ${error}）`)
            drainPendingChoices(state, label)
            checkInvariants(state, before, label)
            return error
        } catch (e) {
            interactiveAnomalies++
            console.error(`  ❌ [対話] 例外: ${label} → ${(e as Error).message}`)
            state.pendingChoice = null
            return null
        }
    }
    const error = handleAction(state, pid, action)
    if (error) console.log(`  （${label} → ${error}）`)
    checkInvariants(state, before, label)
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


// 対話モードで**テスト本体**が投げた例外（期待した位置にカードが無い等）。
// エンジンの異常（interactiveAnomalies）とは別に数える：こちらは選択結果が変わったことによる
// テストコードの前提崩れで、原則として想定内
let harnessErrors: string[] = []
export function noteHarnessError(partName: string, e: Error): void {
    harnessErrors.push(`${partName}: ${e.message}`)
}

// 全パート実行後にランナー（scripts/smoke.ts）から呼ぶ最終集計。
// 対話モードでは合否の基準が変わる（アサーション失敗は想定内。異常だけを落とす）
export function summary(): void {
    console.log("")
    if (INTERACTIVE) {
        console.log(
            `[対話モード] アサーション: 合格${passed}件 / 失敗${failed}件（選択結果が変わるため失敗は想定内）`,
        )
        console.log(`[対話モード] テスト本体の例外: ${harnessErrors.length}件（前提崩れ。想定内）`)
        for (const h of harnessErrors) console.log(`    - ${h}`)
        console.log(`[対話モード] 保存則違反: ${invariantViolations}件`)
        if (interactiveAnomalies > 0 || invariantViolations > 0) {
            console.error(
                `[対話モード] 異常${interactiveAnomalies}件（例外・再開不能・応答拒否）／保存則違反${invariantViolations}件`,
            )
            process.exit(1)
        }
        console.log("[対話モード] 異常0件（例外なし・すべての選択待ちが解消・保存則を維持）")
        return
    }
    if (invariantViolations > 0) {
        console.error(`保存則違反が${invariantViolations}件あります（合格${passed}件／失敗${failed}件）`)
        process.exit(1)
    }
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
    DECK_MIN_SIZE,
    assert,
    act,
    declareBlock,
    takeLifeAndResolve,
    runTurnStart,
}
export type { GameAction, GameState, PlayerId }
