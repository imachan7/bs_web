// クライアントが出すボタンと、サーバーが受理する操作がズレていないかを**総当たりで**検査する監査。
//
// 背景（2026-09-13）: 『自分のアタックステップ』限定の起動能力が、相手のアタックステップでも
// 「効果を発動」ボタンとして出て、押すとサーバーに拒否される不具合があった。原因は
// サーバー validateActivateAbility にある phaseTurn 判定が、クライアントが使う
// shared/rules.ts の activatableAbilityOf に**無かった**こと。
//
// ⚠️ 最初はAI同士の自己対戦で突き合わせる作りにしたが、**既知の不具合を検出できなかった**。
//    該当カードが場に出て、かつ相手のアタックステップで優先権を持つ、という場面に
//    ランダムな対戦ではまず到達しないため。そこで**場面を直接構成して総当たり**に変えた。
//    （監査ツールは「既知のバグを検出できること」を確かめてから信用すること）
//
//   npm run audit:parity
import { createGame, viewFor } from "../server/src/logic/GameState"
import { validateActivateAbility } from "../server/src/logic/RuleValidator"
import { activatableAbility } from "../shared/rules"
import { createInstance } from "../server/src/logic/GameState"
import { refreshLevelAsOverrides } from "../server/src/logic/EffectModules"
import { loadAllCards } from "../data/loadCards"
import type { GameState, PlayerId, Phase } from "../server/src/type"

interface CardRow {
    cardId: string
    name: string
    type?: string
    levels?: { level?: number; cores?: number }[]
    effects?: Record<string, unknown>[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

// 起動能力（kind:"activated"）を持つスピリット／ネクサスをすべて集める
const TARGETS = CARDS.filter((c) => (c.effects ?? []).some((e) => e["kind"] === "activated"))

// 検査する場面。フラッシュ窓は「バトル中」と「自分のメインステップ」の2つがありうる
interface Situation {
    label: string
    phase: Phase
    ownTurn: boolean // 検査対象の持ち主がターンプレイヤーか
    battle: boolean
    flash: boolean
    priority: boolean // 検査対象の持ち主が優先権を持つか
}
const SITUATIONS: Situation[] = [
    { label: "自分のメインステップ", phase: "main", ownTurn: true, battle: false, flash: false, priority: true },
    { label: "相手のメインステップ", phase: "main", ownTurn: false, battle: false, flash: false, priority: false },
    { label: "自分のアタックステップ・フラッシュ・優先権あり", phase: "attack", ownTurn: true, battle: true, flash: true, priority: true },
    { label: "自分のアタックステップ・フラッシュ・優先権なし", phase: "attack", ownTurn: true, battle: true, flash: true, priority: false },
    { label: "相手のアタックステップ・フラッシュ・優先権あり", phase: "attack", ownTurn: false, battle: true, flash: true, priority: true },
    { label: "相手のアタックステップ・フラッシュ・優先権なし", phase: "attack", ownTurn: false, battle: true, flash: true, priority: false },
    { label: "自分のアタックステップ・フラッシュ外", phase: "attack", ownTurn: true, battle: true, flash: false, priority: true },
]

interface Mismatch { cardId: string; name: string; effectId: string; situation: string; server: string }
const mismatches: Mismatch[] = []

// 「その効果を持つカードが場にいる」盤面を1つ作る。pid は常に p2 を検査対象にする
function buildBoard(card: CardRow, sit: Situation): { state: GameState; instanceId: string } | null {
    const state: GameState = createGame(`parity-${card.cardId}`, { p1: "A", p2: "B" }, { p1: "red", p2: "red" })
    const me: PlayerId = "p2"
    state.phase = sit.phase
    state.turnPlayer = sit.ownTurn ? me : "p1"
    state.players.p1.reserve = 20
    state.players.p2.reserve = 20
    // 最大レベルまで上げたいので、必要コアを多めに載せる
    const maxCores = Math.max(...(card.levels ?? [{ cores: 1 }]).map((l) => l.cores ?? 1), 1)
    const inst = createInstance(card.cardId, state.turn, maxCores)
    if (card.type === "nexus") state.players[me].field.nexuses.push(inst)
    else state.players[me].field.spirits.push(inst)
    // バーストもセットしておく（コストにバースト破棄を要求する効果のため）
    state.players[me].burst = "SD06-013"
    state.players[me].burstSet = true
    refreshLevelAsOverrides(state)
    if (sit.battle) {
        const atkPid: PlayerId = state.turnPlayer
        const atk = createInstance("BS01-001", state.turn, 1)
        state.players[atkPid].field.spirits.push(atk)
        refreshLevelAsOverrides(state)
        state.battle = { attackerInstanceId: atk.instanceId, blockerInstanceId: null } as never
    }
    state.isFlashTiming = sit.flash
    state.priorityPlayer = sit.priority ? me : "p1"
    return { state, instanceId: inst.instanceId }
}

for (const card of TARGETS) {
    for (const sit of SITUATIONS) {
        const built = buildBoard(card, sit)
        if (!built) continue
        const { state, instanceId } = built
        const me: PlayerId = "p2"
        const inst = [...state.players[me].field.spirits, ...state.players[me].field.nexuses]
            .find((x) => x.instanceId === instanceId)
        if (!inst) continue
        // クライアントが「効果を発動」ボタンを出すか
        const client = activatableAbility(viewFor(state, me) as never, me, inst)
        if (!client) continue
        // 出すなら、サーバーが受理しなければならない
        const err = validateActivateAbility(state, me, instanceId, client.effectId)
        if (err !== null) {
            mismatches.push({ cardId: card.cardId, name: card.name, effectId: client.effectId, situation: sit.label, server: err })
        }
    }
}

console.log(`起動能力を持つカード ${String(TARGETS.length)}枚 × ${String(SITUATIONS.length)}場面を総当たり`)
console.log()
if (mismatches.length === 0) {
    console.log("クライアントが出すボタンは、すべてサーバーが受理します ✅")
} else {
    console.log(`★ 食い違い ${String(mismatches.length)}件（クライアントはボタンを出すが、サーバーが拒否する）`)
    for (const m of mismatches) {
        console.log(`  ${m.cardId} ${m.name} [${m.effectId}]`)
        console.log(`      場面: ${m.situation}`)
        console.log(`      サーバー: 「${m.server}」`)
    }
    process.exitCode = 1
}
