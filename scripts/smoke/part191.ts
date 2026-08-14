// smoke パート191（封印された魔導書Lv1：対象の変更を、持ち主に3択で聞く）
//
// 2026-08-15 にユーザー確認で決めた仕様:
//   - 選択肢は**3択**（変更しない／相手のみ／自分のみ）。「変更できる」＝変更しない選択も残る
//   - 選ぶのは**魔導書の持ち主**。**相手が使ったマジック**にも効く（『自分のターン』中のフラッシュ）
//   - 効く範囲は「お互いを対象とする効果」だけでなく、**陣営を指定していない単体対象**
//     （action.anySide の「スピリット1体」「スピリットすべて」）も含む
//
// 従来は「持ち主に有利な側へ自動で固定」だった。**非対話（テスト・自動解決）では今もそのまま**なので、
// このパートは s.interactiveTargets = true を立てて実サーバーと同じ経路を通す。
import {
    act,
    assert,
    createGame,
    createInstance,
    refreshLevelAsOverrides,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

// カードデータは Wiki 実データ由来で、過去に ID が全面的にズレた事故がある。
// cardId を書く箇所では名前の一致を機械検証する（CLAUDE.md「重要な罠」）
const MADOUSHO = "BS02-087" // 封印された魔導書（ネクサス）
const FLAME_DANCE = "BS01-121" // フレイムダンス（BP4000以下のスピリット1体を破壊・anySide）
const FLAME_TEMPEST = "BS01-122" // フレイムテンペスト（BP3000以下のスピリット**すべて**を破壊・anySide）
const MIND_CONTROL = "BS02-093" // マインドコントロール（**お互い**のスピリットのコア4個ずつをトラッシュへ）
function nameOf(cardId: string): string {
    return CARDS.find((c) => c.cardId === cardId)?.name ?? "?"
}

console.log("=== パート191：封印された魔導書Lv1 の対象変更を3択で聞く ===")
assert(nameOf(MADOUSHO) === "封印された魔導書", "前提: BS02-087 は封印された魔導書")
assert(nameOf(FLAME_DANCE) === "フレイムダンス", "前提: BS01-121 はフレイムダンス")
assert(nameOf(FLAME_TEMPEST) === "フレイムテンペスト", "前提: BS01-122 はフレイムテンペスト")
assert(nameOf(MIND_CONTROL) === "マインドコントロール", "前提: BS02-093 はマインドコントロール")

// フレイムダンスの対象になれる（Lv1のBPが4000以下の）スピリットを2種類選ぶ
const smalls = CARDS.filter(
    (c) => c.type === "spirit" && (c.levels?.[0]?.bp ?? 0) > 0 && (c.levels?.[0]?.bp ?? 0) <= 4000,
)
assert(smalls.length >= 2, "前提: BP4000以下のスピリットが2種類以上ある")
const OWN_SPIRIT = smalls[0]!.cardId
const OPP_SPIRIT = smalls[1]!.cardId

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1" // 魔導書は『自分のターン』なので、持ち主 p1 のターンにする
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    s.interactiveTargets = true
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 魔導書あり・両陣営にスピリット2体ずつ・使用者の手札にフレイムダンス、の盤面を作る。
// **2体ずつ置く**のは、候補が1体だと選択待ちを立てずに自動で解決してしまい、
// 「候補が片側だけになったか」を見られないため
function board(seed: string, caster: PlayerId): {
    s: GameState
    own: string[]
    opp: string[]
} {
    const s = setup(seed)
    putNexus(s, "p1", MADOUSHO, 0) // Lv1（cores 0）
    const own = [put(s, "p1", OWN_SPIRIT, 1), put(s, "p1", OWN_SPIRIT, 1)].map((i) => i.instanceId)
    const opp = [put(s, "p2", OPP_SPIRIT, 1), put(s, "p2", OPP_SPIRIT, 1)].map((i) => i.instanceId)
    s.players[caster].hand[0] = FLAME_DANCE
    return { s, own, opp }
}

// 確認が出ていることを検かめ、options のラベルを返す
function expectAsk(s: GameState, askedTo: PlayerId): string[] {
    const pc = s.pendingChoice
    assert(pc !== null, "封印された魔導書の確認が出る")
    assert(pc!.pid === askedTo, `確認は魔導書の持ち主（${askedTo}）に出る`)
    assert(pc!.kind === "option", "確認は option（文字列ボタン）で出る")
    return pc!.options ?? []
}

console.log("--- 3択が出て、「自分のみ」を選ぶと候補が持ち主側だけになる ---")
{
    const { s, own } = board("madousho-own", "p1")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "p1 がフレイムダンスを使用")
    const options = expectAsk(s, "p1")
    assert(options.length === 3, `3択で出る（実際: ${options.join("／")}）`)
    assert(options[0] === "変更しない", "1つ目は「変更しない」（『変更できる』の任意性）")

    assert(act(s, "p1", { type: "resolveChoice", option: "自分のみ" }) === null, "「自分のみ」を選ぶ")
    const pc = s.pendingChoice
    assert(pc !== null, "続けて破壊対象の選択待ちになる")
    const ids = pc!.candidates ?? [] // candidates は instanceId の配列
    assert(
        ids.length === 2 && ids.every((id) => own.includes(id)),
        `候補は持ち主（p1）のスピリットだけになる（実際: ${ids.length}体）`,
    )
}

console.log("--- 「相手のみ」を選ぶと候補が相手側だけになる ---")
{
    const { s, opp } = board("madousho-opp", "p1")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "p1 がフレイムダンスを使用")
    expectAsk(s, "p1")
    assert(act(s, "p1", { type: "resolveChoice", option: "相手のみ" }) === null, "「相手のみ」を選ぶ")
    const ids = s.pendingChoice?.candidates ?? []
    assert(
        ids.length === 2 && ids.every((id) => opp.includes(id)),
        `候補は相手（p2）のスピリットだけになる（実際: ${ids.length}体）`,
    )
}

console.log("--- 「変更しない」を選ぶと両陣営が候補のまま ---")
{
    const { s, own, opp } = board("madousho-none", "p1")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "p1 がフレイムダンスを使用")
    expectAsk(s, "p1")
    assert(act(s, "p1", { type: "resolveChoice", option: "変更しない" }) === null, "「変更しない」を選ぶ")
    const ids = s.pendingChoice?.candidates ?? []
    assert(ids.length === 4, `両陣営が候補のまま（実際: ${ids.length}体）`)
    assert(
        own.every((id) => ids.includes(id)) && opp.every((id) => ids.includes(id)),
        "自分・相手のどちらも選べる",
    )
}

console.log("--- 相手が使ったマジックにも効き、選ぶのは魔導書の持ち主 ---")
{
    // フラッシュのマジックを相手が使える局面（アタック宣言でフラッシュタイミングが開く）を作る
    const { s, own } = board("madousho-opponent-cast", "p2")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s, "p1", { type: "attack", instanceId: own[0]! }) === null,
        "p1 がアタック宣言（フラッシュ開始）",
    )
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "p2 がフレイムダンスを使用")
    const options = expectAsk(s, "p1") // 選ぶのは使用者 p2 ではなく持ち主 p1
    assert(options.length === 3, "相手のマジックでも3択で出る")
    assert(act(s, "p1", { type: "resolveChoice", option: "自分のみ" }) === null, "持ち主が「自分のみ」を選ぶ")
    const ids = s.pendingChoice?.candidates ?? []
    assert(
        ids.length === 2 && ids.every((id) => own.includes(id)),
        "「自分のみ」は**魔導書の持ち主**から見た自分（p1）を指す",
    )
}

console.log("--- 魔導書が無ければ確認は出ない（回帰） ---")
{
    const s = setup("madousho-absent")
    put(s, "p1", OWN_SPIRIT, 1)
    put(s, "p1", OWN_SPIRIT, 1)
    put(s, "p2", OPP_SPIRIT, 1)
    put(s, "p2", OPP_SPIRIT, 1)
    s.players.p1.hand[0] = FLAME_DANCE
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "p1 がフレイムダンスを使用")
    const pc = s.pendingChoice
    assert(pc !== null, "破壊対象の選択待ちにはなる")
    assert(pc!.magicSideChoice === undefined, "封印された魔導書の確認は出ない")
    assert((pc!.candidates ?? []).length === 4, "候補は両陣営のまま")
}

console.log("--- 相手のターン中は『自分のターン』の条件を満たさず確認が出ない（回帰） ---")
{
    const { s } = board("madousho-opponent-turn", "p2")
    s.turnPlayer = "p2" // 魔導書の持ち主 p1 のターンではない
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "p2 が自分のターンにフレイムダンスを使用")
    // ここは魔導書が働かないので、確認なしでそのまま破壊対象の選択待ちになる
    assert(s.pendingChoice?.magicSideChoice === undefined, "『自分のターン』でないので確認は出ない")
    assert((s.pendingChoice?.candidates ?? []).length === 4, "候補は両陣営のまま")
}

// ここからは単体対象（anySide）ではなく、「**すべて**」と「**お互い**」に効くかを見る。
// ユーザー確認（2026-08-15）で、この2つも変更の対象に含めることになった
const tinies = CARDS.filter(
    (c) => c.type === "spirit" && (c.levels?.[0]?.bp ?? 0) > 0 && (c.levels?.[0]?.bp ?? 0) <= 3000,
)
assert(tinies.length >= 2, "前提: BP3000以下のスピリットが2種類以上ある")

console.log("--- 「スピリットすべて」（destroyAll）も片側だけになる ---")
{
    const s = setup("madousho-all")
    putNexus(s, "p1", MADOUSHO, 0)
    const own = put(s, "p1", tinies[0]!.cardId, 1)
    const opp = put(s, "p2", tinies[1]!.cardId, 1)
    s.players.p1.hand[0] = FLAME_TEMPEST
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "p1 がフレイムテンペストを使用")
    expectAsk(s, "p1")
    assert(act(s, "p1", { type: "resolveChoice", option: "相手のみ" }) === null, "「相手のみ」を選ぶ")
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === own.instanceId),
        "自分のスピリットは破壊されない",
    )
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === opp.instanceId),
        "相手のスピリットだけが破壊される",
    )
}

console.log("--- 「お互いの〜」（side:\"both\"）も片側だけになる ---")
{
    const s = setup("madousho-both")
    putNexus(s, "p1", MADOUSHO, 0)
    const own = put(s, "p1", OWN_SPIRIT, 5)
    const opp = put(s, "p2", OPP_SPIRIT, 5)
    s.players.p1.hand[0] = MIND_CONTROL
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "p1 がマインドコントロールを使用")
    expectAsk(s, "p1")
    assert(act(s, "p1", { type: "resolveChoice", option: "相手のみ" }) === null, "「相手のみ」を選ぶ")
    assert(own.cores === 5, `自分のスピリットのコアは減らない（実際: ${own.cores}個）`)
    assert(opp.cores < 5, `相手のスピリットのコアだけが減る（実際: ${opp.cores}個）`)
}
