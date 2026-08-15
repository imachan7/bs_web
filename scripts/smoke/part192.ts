// smoke パート192（マジックの無償化と再発揮を、使用者に選ばせる）
//
// 2026-08-15 にユーザー確認で決めた仕様:
//   - 「コストを支払わずに使用できる」は、**無償化を持つカードすべてで毎回聞く**。
//     あえて払う道を残すのは、無償化の枠が1枚きりのカード（大天使イスフィール）で
//     **枠を温存できる**ようにするため
//   - 「同じ効果をもう1度だけ発揮できる」も**任意**。1回目が解決しきってから聞く
//     （効果文が『マジックの効果発揮後』なので順序が決まっている）
//   - 発揮しないことを選んだときは枠を使っていないので**消費しない**
//
// **非対話（テスト・自動解決）では従来どおり**自動で無償・自動で2回発揮する（part138 が固定している）。
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function findByEffect(pred: (e: Record<string, unknown>, c: CardRow) => boolean): CardRow {
    const found = CARDS.find((c) => (c.effects ?? []).some((e) => pred(e, c)))
    if (!found) throw new Error("条件に合うカードが見つかりません")
    return found
}
function kindOf(c: CardRow, kind: string): Record<string, unknown> {
    const found = (c.effects ?? []).find((e) => e["kind"] === kind)
    if (!found) throw new Error(`${c.name} に kind:${kind} のエントリがありません`)
    return found
}
function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    s.interactiveTargets = true // 実サーバーと同じく選択を出す
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const FILLER = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.cores ?? 99) === 1,
)
if (!FILLER) throw new Error("バニラが見つかりません")

// 大天使イスフィール（無償化・再発揮のどちらも oncePerBattle で持つ唯一のカード）
const ISFIL = findByEffect((e) => e["kind"] === "magicRepeatGrant")
const ISFIL_LEVEL = (kindOf(ISFIL, "magicRepeatGrant")["levels"] as number[])[0]!
const ISFIL_CORES = ISFIL.levels?.[ISFIL_LEVEL - 1]?.cores ?? 1

// 検証しやすい単純なマジック：フラッシュでBP+する1エントリだけのもの（part138 と同じ選び方）
const BUFF_MAGIC = CARDS.find(
    (c) =>
        c.type === "magic" &&
        (c.effects ?? []).length === 1 &&
        (c.effects ?? []).some(
            (e) =>
                e["kind"] === "magic" &&
                e["timing"] === "flash" &&
                (e["action"] as Record<string, unknown> | undefined)?.["type"] === "bpBuff" &&
                (e["action"] as Record<string, unknown>)["filter"] === undefined,
        ) &&
        (c.cost ?? 0) > 0,
)
if (!BUFF_MAGIC) throw new Error("検証用のフラッシュBP+マジックが見つかりません")
const BUFF_AMOUNT = Number(((BUFF_MAGIC.effects ?? [])[0]!["action"] as Record<string, unknown>)["amount"])
const BUFF_COST = BUFF_MAGIC.cost ?? 0

console.log("=== パート192：マジックの無償化と再発揮を使用者に選ばせる ===")

// イスフィールがバトルに参加した状態（＝無償化・再発揮が成立する）を作り、
// 手札のマジックを使うところまで進める
function battleWithIsfil(seed: string): {
    s: GameState
    isfil: ReturnType<typeof createInstance>
    handIndex: number
} {
    const s = base(seed)
    const isfil = put(s, "p1", ISFIL.cardId, ISFIL_CORES)
    put(s, "p2", FILLER!.cardId, 1)
    s.players.p1.hand.push(BUFF_MAGIC!.cardId)
    const handIndex = s.players.p1.hand.length - 1
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s, "p1", { type: "attack", instanceId: isfil.instanceId }) === null,
        "イスフィール自身がアタック（＝バトル当事者）",
    )
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパスして優先権が攻撃側へ")
    return { s, isfil, handIndex }
}

console.log("--- 無償で使えるときは2択が出る ---")
{
    const { s, handIndex } = battleWithIsfil("isfil-ask")
    assert(act(s, "p1", { type: "castMagic", handIndex }) === null, `${BUFF_MAGIC.name}を使用`)
    const pc = s.pendingChoice
    assert(pc !== null && pc.magicFreeChoice !== undefined, "無償化の確認が出る")
    assert(pc!.pid === "p1", "聞くのは使用者")
    assert((pc!.options ?? []).length === 2, "2択（支払わずに／支払って）")
}

console.log("--- 「支払わずに使用する」を選ぶとコアが減らない ---")
{
    const { s, isfil, handIndex } = battleWithIsfil("isfil-free")
    const reserveBefore = s.players.p1.reserve
    const bpBefore = effectiveBp(s, "p1", isfil)
    assert(act(s, "p1", { type: "castMagic", handIndex }) === null, `${BUFF_MAGIC.name}を使用`)
    assert(
        act(s, "p1", { type: "resolveChoice", option: "コストを支払わずに使用する" }) === null,
        "「支払わずに使用する」を選ぶ",
    )
    assert(s.players.p1.reserve === reserveBefore, `コスト（${BUFF_COST}）を払っていない`)
    // 続けて再発揮の確認が出る（1周目は解決済み）
    assert(s.pendingChoice?.magicRepeat !== undefined, "続けて再発揮の確認が出る")
    assert(
        effectiveBp(s, "p1", isfil) === bpBefore + BUFF_AMOUNT,
        "この時点では1回ぶんだけ発揮している",
    )
}

console.log("--- 「支払って使用する」を選ぶとコアが減り、1枚きりの無償枠が残る ---")
{
    const { s, handIndex } = battleWithIsfil("isfil-paid")
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "castMagic", handIndex }) === null, `${BUFF_MAGIC.name}を使用`)
    assert(
        act(s, "p1", { type: "resolveChoice", option: "コストを支払って使用する" }) === null,
        "「支払って使用する」を選ぶ",
    )
    assert(
        s.players.p1.reserve === reserveBefore - BUFF_COST,
        `コスト${BUFF_COST}を払った（${reserveBefore}→${s.players.p1.reserve}）`,
    )
    assert(
        (s.battle?.oncePerBattleMagicFreeUsed ?? []).length === 0,
        "払って使ったので、1枚きりの無償枠は消費されていない",
    )
}

console.log("--- 再発揮は任意で、「発揮しない」を選ぶと1回だけで終わり枠も残る ---")
{
    const { s, isfil, handIndex } = battleWithIsfil("isfil-repeat-decline")
    const bpBefore = effectiveBp(s, "p1", isfil)
    assert(act(s, "p1", { type: "castMagic", handIndex }) === null, `${BUFF_MAGIC.name}を使用`)
    assert(
        act(s, "p1", { type: "resolveChoice", option: "コストを支払わずに使用する" }) === null,
        "無償で使う",
    )
    const pc = s.pendingChoice
    assert(pc !== null && pc.magicRepeat !== undefined, "再発揮の確認が出る")
    assert((pc!.options ?? []).length === 2, "2択（もう1度発揮する／発揮しない）")
    assert(act(s, "p1", { type: "resolveChoice", option: "発揮しない" }) === null, "「発揮しない」を選ぶ")
    assert(
        effectiveBp(s, "p1", isfil) === bpBefore + BUFF_AMOUNT,
        `1回ぶんしか発揮していない（+${BUFF_AMOUNT}）`,
    )
    assert(
        (s.battle?.oncePerBattleMagicRepeatUsed ?? []).length === 0,
        "発揮しなかったので再発揮の枠も消費されていない",
    )
}

console.log("--- 「もう1度発揮する」を選ぶと2回ぶん発揮する（従来の自動挙動と一致） ---")
{
    const { s, isfil, handIndex } = battleWithIsfil("isfil-repeat-accept")
    const bpBefore = effectiveBp(s, "p1", isfil)
    assert(act(s, "p1", { type: "castMagic", handIndex }) === null, `${BUFF_MAGIC.name}を使用`)
    assert(
        act(s, "p1", { type: "resolveChoice", option: "コストを支払わずに使用する" }) === null,
        "無償で使う",
    )
    assert(act(s, "p1", { type: "resolveChoice", option: "もう1度発揮する" }) === null, "「もう1度発揮する」を選ぶ")
    assert(
        effectiveBp(s, "p1", isfil) === bpBefore + BUFF_AMOUNT * 2,
        `2回ぶん発揮する（+${BUFF_AMOUNT}×2）`,
    )
    assert(
        (s.battle?.oncePerBattleMagicRepeatUsed ?? []).length === 1,
        "発揮したので再発揮の枠は消費される",
    )
}

console.log("--- コストを払えないときは無償化の確認を出さない ---")
{
    const { s, handIndex } = battleWithIsfil("isfil-cannot-pay")
    s.players.p1.reserve = 0 // 払う道が無いので聞いても意味がない
    assert(act(s, "p1", { type: "castMagic", handIndex }) === null, `${BUFF_MAGIC.name}を使用`)
    assert(s.pendingChoice?.magicFreeChoice === undefined, "無償化の確認は出ない")
    assert(s.pendingChoice?.magicRepeat !== undefined, "そのまま無償で使われ、再発揮の確認へ進む")
}
