// smoke パート886（同時破壊は全員が破壊待機のまま誘発を解決して最後にまとめてトラッシュ／「すべては」型の「残る」は体ごとに効く）
//
// 期待値は効果文と 2026-11-10 ユーザー確定のルールだけから書いた（実装は読んでいない）。
// 根拠：TIMING_CHART §1.5・§0-3、「すべては」型は体ごと（BS20-002 は公式 Q4107 で自身も対象）、
// 「そのスピリットを残す」型は同時破壊につき1回（Q22359）。
// 処理順を聞くのはターンプレイヤー。相手のターンの設定にして、聞かれる側が相手になることも確かめる。
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { destroyTargetsBatch } from "../../server/src/logic/removal"

const CORONA = "BS20-002" // 炎楯の守護者コロナ・ドラゴン（コスト3以下の自分のスピリットすべては残ることができる）
const GORADON = "BS01-001" // ゴラドン（コスト0・バニラ）
const WYARM = "BS05-005" // ワイアーム（コスト4・バニラ）
const TARANDA = "BS13-038"
const SABRINA = "BS10-045"
const RIO = "BS17-040"
const CASTLE = "BS15-063" // 吊られた古城
const NIGHT_A = "BS07-010" // アシュタル（夜族・バニラ）
const NIGHT_B = "SD01-010" // コウモリブレラ（夜族・バニラ）
const SPIRITS = ["BS01-002", "BS01-003", "BS01-004"]

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(CORONA).name === "炎楯の守護者コロナ・ドラゴン" && getCard(CORONA).cost === 3, "コロナはコスト3")
    assert(getCard(GORADON).name === "ゴラドン" && getCard(GORADON).cost <= 3, "ゴラドンはコスト3以下")
    assert(getCard(WYARM).name === "ワイアーム" && getCard(WYARM).cost === 4, "ワイアームはコスト4")
    assert(getCard(TARANDA).name === "魔女タランダ" && getCard(SABRINA).name === "闇魔女サブリナ" && getCard(RIO).name === "呪術士リオ", "導魔3体の名前")
    assert(getCard(CASTLE).name === "吊られた古城" && getCard(CASTLE).type === "nexus", "吊られた古城")
    assert(getCard(NIGHT_A).family.includes("夜族") && getCard(NIGHT_B).family.includes("夜族"), "夜族2体")
    assert(SPIRITS.every((c) => getCard(c).type === "spirit"), "手札用はスピリット")
}

function game(seed: string, colors: { p1: "red" | "yellow" | "purple" }, hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: colors.p1, p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p2" // 相手のターンに相手の効果で破壊される＝処理順を決めるのは p2
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => "BS01-002")
    s.players.p2.deck = Array.from({ length: 40 }, () => "BS01-002")
    s.players.p1.hand = [...hand]
    return s
}
function put(s: GameState, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function destroyAll(s: GameState, ids: string[]): void {
    destroyTargetsBatch(s, "p2", ids.map((instanceId) => ({ pid: "p1" as PlayerId, instanceId })), { sourcePid: "p2", sourceType: "spirit" })
}
const onField = (s: GameState, id: string) => s.players.p1.field.spirits.find((x) => x.instanceId === id)
const inTrash = (s: GameState, cardId: string) => s.players.p1.trashCards.includes(cardId)
const who = (s: GameState) => s.pendingChoice!.pid
const send = (s: GameState, a: Record<string, unknown>) => act(s, who(s), { type: "resolveChoice", ...a } as never)

/** 処理順の選択が立っていれば firstId（無ければ先頭）を指名する。立っていなければ何もしない */
function pickOrderIfAsked(s: GameState, firstId?: string): boolean {
    const o = s.pendingChoice?.destroyOrder
    if (!o) return false
    assert(who(s) === "p2", "処理順を決めるのはターンプレイヤー（p2）")
    const i = firstId ? o.instanceIds.indexOf(firstId) : 0
    assert(send(s, { option: s.pendingChoice!.options![Math.max(i, 0)] }) === null, "処理順を指名する")
    return true
}

/**
 * 選択待ちを消化する。確認（kind:"option"）は decide(確認の通し番号) で承認／断るを決める。
 * 戻す体・捨てる手札のトグルは picks に従い、無ければ先頭を選ぶ。確認の回数と、確認が立った時点の盤面を返す。
 */
function drain(
    s: GameState,
    o: { first?: string; decide?: (n: number) => boolean; targets?: string[]; cards?: number[]; onConfirm?: () => void } = {},
): number {
    let confirms = 0
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        if (pc.destroyOrder) { pickOrderIfAsked(s, o.first); continue }
        if (pc.kind === "option") {
            o.onConfirm?.()
            const ok = (o.decide ?? (() => true))(confirms++)
            assert(ok ? send(s, { option: pc.options![0] }) === null : send(s, {}) === null, ok ? "確認を承認する" : "確認を断る")
        } else if (pc.kind === "target") {
            const picks = o.targets ?? [pc.candidates[0]!]
            for (const id of picks) {
                if (s.pendingChoice?.kind !== "target") break
                assert(send(s, { instanceId: id }) === null, "戻す体を選ぶ")
            }
            if (s.pendingChoice?.kind === "target") assert(send(s, {}) === null, "戻す体を確定する")
        } else if (pc.kind === "card") {
            const picks = o.cards ?? [pc.cardIndices![0]!]
            for (const c of picks) {
                if (s.pendingChoice?.kind !== "card") break // 1枚選んだ時点で確定する形でも通す
                assert(send(s, { cardIndex: c }) === null, "手札を選ぶ")
            }
            if (s.pendingChoice?.kind === "card") assert(send(s, {}) === null, "手札を確定する")
        } else break
    }
    return confirms
}

console.log("=== 1. コロナが自身の「残る」を断っても、ゴラドンに確認が出て、承認すれば残る ===")
{
    const s = game("c1", { p1: "red" })
    const corona = put(s, CORONA)
    const gora = put(s, GORADON)
    destroyAll(s, [corona.instanceId, gora.instanceId])
    const n = drain(s, { first: corona.instanceId, decide: (k) => k !== 0 })
    assert(n === 2, `確認は2体ぶん出る（${n}回）`)
    assert(s.pendingChoice === null, "選択待ちが消える")
    assert(!onField(s, corona.instanceId) && inTrash(s, CORONA), "コロナ（断った）はトラッシュ")
    assert(onField(s, gora.instanceId)?.isRested === true && !inTrash(s, GORADON), "ゴラドンは疲労状態で残る")
}

console.log("=== 2. 両方承認 → 2体とも疲労状態で残る（体ごとに効く）。処理順はどちらでも同じ ===")
for (const coronaFirst of [true, false]) {
    const s = game(`c2-${coronaFirst}`, { p1: "red" })
    const corona = put(s, CORONA)
    const gora = put(s, GORADON)
    destroyAll(s, [corona.instanceId, gora.instanceId])
    const n = drain(s, { first: coronaFirst ? corona.instanceId : gora.instanceId })
    assert(n === 2 && s.pendingChoice === null, `確認は2回で終わる（コロナ先=${coronaFirst}）`)
    assert(onField(s, corona.instanceId)?.isRested === true, "コロナ自身も疲労状態で残る（Q4107）")
    assert(onField(s, gora.instanceId)?.isRested === true, "ゴラドンも疲労状態で残る")
    assert(!inTrash(s, CORONA) && !inTrash(s, GORADON), "トラッシュには行かない")
}

console.log("=== 3. コスト4以上は対象外（確認が出ない） ===")
{
    const s = game("c3", { p1: "red" })
    const corona = put(s, CORONA)
    const wy = put(s, WYARM)
    destroyAll(s, [corona.instanceId, wy.instanceId])
    const n = drain(s)
    assert(n === 1, `確認はコロナの1回だけ（${n}回）`)
    assert(onField(s, corona.instanceId)?.isRested === true, "コロナは残る")
    assert(!onField(s, wy.instanceId) && inTrash(s, WYARM), "ワイアームはトラッシュ")
}

console.log("=== 4. タランダ・サブリナ・リオが同時に破壊 → タランダ以外の2体だけ戻す（処理順はどちらでも同じ） ===")
for (const tarandaFirst of [true, false]) {
    const s = game(`c4-${tarandaFirst}`, { p1: "yellow" }, [...SPIRITS])
    const t = put(s, TARANDA, 3)
    const sab = put(s, SABRINA)
    const rio = put(s, RIO)
    destroyAll(s, [t.instanceId, sab.instanceId, rio.instanceId])
    // 処理順の確認が出る場合だけ選ぶ
    pickOrderIfAsked(s, tarandaFirst ? t.instanceId : rio.instanceId)
    const pc = s.pendingChoice
    assert(pc?.kind === "target" && pc.pid === "p1", `戻す体の選択が持ち主に立つ（タランダ先=${tarandaFirst}）`)
    assert(pc?.candidates.includes(sab.instanceId) === true && pc.candidates.includes(rio.instanceId) === true, "サブリナとリオは候補")
    drain(s, { targets: [sab.instanceId, rio.instanceId], cards: [0, 1] })
    assert(s.pendingChoice === null, "選択待ちが消える")
    assert(onField(s, sab.instanceId)?.isRested === true && onField(s, rio.instanceId)?.isRested === true, "サブリナとリオは疲労状態で残る")
    assert(!onField(s, t.instanceId) && inTrash(s, TARANDA), "タランダはトラッシュ")
    assert(s.players.p1.hand.length === 1, "手札は3枚のうち2枚が捨てられて1枚")
}

console.log("=== 5. 吊られた古城：夜族2体の同時破壊で残せるのは1体だけ（Q22359） ===")
{
    const s = game("c5", { p1: "purple" }, ["BS01-002", "BS01-003"])
    const castle = createInstance(CASTLE, s.turn, 1) // Lv2 に要るコア1
    s.players.p1.field.nexuses.push(castle)
    const a = put(s, NIGHT_A)
    const b = put(s, NIGHT_B)
    refreshLevelAsOverrides(s)
    destroyAll(s, [a.instanceId, b.instanceId])
    drain(s)
    assert(s.pendingChoice === null, "選択待ちが消える")
    const alive = [a, b].filter((x) => onField(s, x.instanceId))
    assert(alive.length === 1 && alive[0]!.isRested === true, `残るのは疲労状態の1体だけ（${alive.length}体）`)
    assert(s.players.p1.hand.length === 1, "手札の破棄は1枚だけ")
}

console.log("=== 6. 同時破壊のあいだ、先に処理した体もまだフィールドに居て、最後にまとめてトラッシュへ ===")
{
    const s = game("c6", { p1: "red" })
    const corona = put(s, CORONA)
    const gora = put(s, GORADON)
    destroyAll(s, [corona.instanceId, gora.instanceId])
    let seen = 0
    const n = drain(s, {
        first: corona.instanceId,
        decide: () => false,
        onConfirm: () => {
            seen++
            assert(!!onField(s, corona.instanceId) && !!onField(s, gora.instanceId), `確認${seen}回目の時点で2体ともフィールドに居る`)
            assert(!inTrash(s, CORONA) && !inTrash(s, GORADON), `確認${seen}回目の時点でトラッシュには無い`)
        },
    })
    assert(n === 2, `確認は2回（${n}回）`)
    assert(!onField(s, corona.instanceId) && !onField(s, gora.instanceId), "全部終わったら両方フィールドに居ない")
    assert(inTrash(s, CORONA) && inTrash(s, GORADON), "両方トラッシュ")
}

console.log("すべてのチェックに合格しました 🎉（part886）")
