// smoke パート267（メインステップの任意合体・分離。docs/design/BRAVE.md §6.4。2026-09-02）
//
// 確定した規則（2026-09-02 ユーザー確定）:
//   - 自分のメインステップには、合体も分離も任意で何度でも行える
//   - 合体：ブレイヴが載せていたコアは**リザーブへ戻す**（§1.1 の出典とは異なる。
//     分離でリザーブから払うことと対称にするための決定）
//   - 分離：braveKeepCores（スピリット状態のLv1維持コスト）以上のコアを置く。
//     paySources 省略時はリザーブから自動。リザーブが足りなければ**拒否**する
//     （クライアントが支払いUIへ入って paySources を付けて再送する）
//   - 効果による分離（Effect の detachBrave）は**コア不要**のまま。混ぜないこと
//
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・合体条件を機械検証してから使う。
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const BRAVE = "BS10-061" // 剣鎧竜バスター・ドラゴン（合体条件：バニラ・Lv1維持コスト1）
const VANILLA = "BS01-002" // ロクケラトプス（バニラ＝合体条件を満たす）
const NON_VANILLA = "BS01-003" // テラノセイバー（効果を持つ＝バニラではない。合体条件を満たさない側の確認用）

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    const b = getCard(BRAVE)
    assert(b.name === "剣鎧竜バスター・ドラゴン" && b.type === "brave", "BS10-061は剣鎧竜バスター・ドラゴン（ブレイヴ）")
    // BraveCondition は単項か配列（読点区切り＝OR）。ここは単項の { vanilla: true }
    assert(JSON.stringify(b.braveCondition) === '{"vanilla":true}', "合体条件はバニラ")
    assert(b.levels[0]!.cores === 1, "スピリット状態のLv1維持コストは1")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).effect === "", "BS01-002はロクケラトプス（バニラ）")
    assert(getCard(NON_VANILLA).effects.length > 0, "BS01-003は効果を持つ（バニラではない）")
}

// スピリット状態のブレイヴ1体＋バニラのスピリット1体が自分の場にいる盤面
function setup(seed: string, opts: { braveCores?: number; reserve?: number } = {}): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = false
    const p = s.players.p1
    p.field.spirits = []
    p.field.nexuses = []
    p.reserve = opts.reserve ?? 5
    p.field.spirits.push(createInstance(VANILLA, s.turn, 3)) // ホスト
    p.field.spirits.push(createInstance(BRAVE, s.turn, opts.braveCores ?? 2)) // スピリット状態のブレイヴ
    refreshLevelAsOverrides(s)
    return s
}

console.log("=== 合体：ブレイヴのコアはリザーブへ戻る ===")
{
    const s = setup("combine-basic")
    const p = s.players.p1
    const host = p.field.spirits[0]!
    const brave = p.field.spirits[1]!
    const reserveBefore = p.reserve

    const err = handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    assert(err === null, `合体できる（${err}）`)

    assert(p.field.spirits.length === 1, "ブレイヴは field.spirits から抜ける")
    assert(p.field.combinedBraves.some((b) => b.instanceId === brave.instanceId), "実体は combinedBraves へ入る（参照方式 §2.3）")
    assert((host.braveRefs ?? []).some((r) => r.instanceId === brave.instanceId), "ホストが braveRefs で参照する")
    assert(p.reserve === reserveBefore + 2, "ブレイヴが載せていたコア2個はリザーブへ戻る（§6.4）")
    assert(brave.cores === 0, "合体中のブレイヴはコアを持たない")
    assert(host.cores === 3, "ホストのコアは増えない（出典 §1.1 とは違う決定）")
}

console.log("=== 合体：疲労はどちらかが疲労なら合体スピリットも疲労（§1.3） ===")
{
    const s = setup("combine-rested")
    const p = s.players.p1
    const host = p.field.spirits[0]!
    const brave = p.field.spirits[1]!
    brave.isRested = true

    handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    assert(host.isRested === true, "疲労したブレイヴを合体させると合体スピリットも疲労状態になる")
}

console.log("=== 合体：条件を満たさないスピリットへは合体できない ===")
{
    const s = setup("combine-reject")
    const p = s.players.p1
    p.field.spirits[0] = createInstance(NON_VANILLA, s.turn, 3) // バニラではないホスト
    refreshLevelAsOverrides(s)
    const host = p.field.spirits[0]!
    const brave = p.field.spirits[1]!

    const err = handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    assert(err !== null, "合体条件を満たさないスピリットへは合体できない")
    assert(p.field.combinedBraves.length === 0, "拒否されたとき盤面は変わらない")
}

console.log("=== 分離：Lv1維持コストぶんをリザーブから自動で払う ===")
{
    const s = setup("detach-auto")
    const p = s.players.p1
    const host = p.field.spirits[0]!
    const brave = p.field.spirits[1]!
    handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    const reserveBefore = p.reserve // 5 + 戻った2 = 7

    const err = handleAction(s, "p1", { type: "detachBrave", braveInstanceId: brave.instanceId })
    assert(err === null, `分離できる（${err}）`)

    assert(p.field.combinedBraves.length === 0, "実体は combinedBraves から抜ける")
    assert(host.braveRefs === undefined, "ホストの braveRefs は消える")
    assert(p.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "ブレイヴはスピリット状態で場に残る")
    assert(brave.cores === 1, "Lv1維持コスト1個が置かれる")
    assert(p.reserve === reserveBefore - 1, "その1個はリザーブから出る")
}

console.log("=== 分離：リザーブが足りなければ拒否する（クライアントが支払いUIへ入る合図） ===")
{
    const s = setup("detach-poor", { braveCores: 0, reserve: 0 })
    const p = s.players.p1
    const host = p.field.spirits[0]!
    const brave = p.field.spirits[1]!
    handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    assert(p.reserve === 0, "前提：リザーブは0")

    const err = handleAction(s, "p1", { type: "detachBrave", braveInstanceId: brave.instanceId })
    assert(err !== null, "リザーブが足りなければ拒否される")
    assert(p.field.combinedBraves.length === 1, "拒否されたとき合体したまま")

    // フィールドのコアを支払い元に指定すれば分離できる（paySources 経由）
    const err2 = handleAction(s, "p1", {
        type: "detachBrave",
        braveInstanceId: brave.instanceId,
        paySources: [{ instanceId: host.instanceId, count: 1 }],
    })
    assert(err2 === null, `フィールドのコアを指定すれば分離できる（${err2}）`)
    assert(brave.cores === 1, "指定したコアがブレイヴの上に置かれる")
    assert(host.cores === 2, "支払い元のホストからコアが1個減る")
}

console.log("=== 分離：疲労状態はホストから引き継ぐ（§12.5） ===")
{
    const s = setup("detach-rested")
    const p = s.players.p1
    const host = p.field.spirits[0]!
    const brave = p.field.spirits[1]!
    handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    host.isRested = true

    handleAction(s, "p1", { type: "detachBrave", braveInstanceId: brave.instanceId })
    assert(brave.isRested === true, "疲労した合体スピリットから分離したブレイヴは疲労状態")
}

console.log("=== タイミング：アタックステップでは合体も分離もできない ===")
{
    const s = setup("timing")
    const p = s.players.p1
    const host = p.field.spirits[0]!
    const brave = p.field.spirits[1]!
    handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    s.phase = "attack"

    assert(
        handleAction(s, "p1", { type: "detachBrave", braveInstanceId: brave.instanceId }) !== null,
        "メインステップ以外では分離できない",
    )
    assert(
        handleAction(s, "p2", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) !== null,
        "相手のターンではないプレイヤーは合体できない",
    )
}

console.log("すべてのチェックに合格しました 🎉（part267）")
