// smoke パート649（BS18 部品バッチ3：exhaustPreventByPay／placeCores の複数取り元・ownSpirits・life・to:self・count:any）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { canPayResolve } from "../../server/src/logic/actions/pay"

const SRC = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）。一時的に効果を足す発生源
const PLAIN = "BS01-001" // ゴラドン（赤・コスト0・バニラ）
const PURPLE = "BS03-013" // ヘルスコルピオ（紫・コスト1）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SRC).name === "ロクケラトプス" && getCard(SRC).effects.length === 0, "SRCはバニラのロクケラトプス")
    assert(getCard(PLAIN).name === "ゴラドン" && getCard(PLAIN).effects.length === 0, "PLAINはバニラのゴラドン")
    assert(getCard(PURPLE).name === "ヘルスコルピオ" && getCard(PURPLE).colors.includes("purple"), "PURPLEは紫のヘルスコルピオ")
}

function withEffect(cardId: string, entry: object, body: () => void): void {
    const effects = getCard(cardId).effects as unknown[]
    effects.push(entry)
    try {
        body()
    } finally {
        effects.pop()
    }
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p2"
    s.phase = "main"
    s.interactiveTargets = interactive
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => PLAIN)
    s.players.p2.deck = Array.from({ length: 40 }, () => PLAIN)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const prevent = {
    id: "t649p",
    kind: "exhaustPreventByPay",
    levels: null,
    filter: { color: "purple" },
    bySourceTypes: ["spirit", "brave"],
    cost: { type: "mill", count: 1, side: "own" },
}

// p2 のスピリットが p1 のスピリットすべてを疲労させる
function exhaustAllOfP1(s: GameState, srcType: "spirit" | "magic" = "spirit"): void {
    const attacker = put(s, "p2", PLAIN)
    resolveAction(s, "p2", attacker, { type: "exhaust", all: true, count: 1 }, undefined, undefined, srcType)
}

console.log("=== 1. exhaustPreventByPay（非対話）：合う1体ごとに払い、払えた体は疲労しない ===")
withEffect(SRC, prevent, () => {
    const s = game("prevent-basic")
    put(s, "p1", SRC)
    const a = put(s, "p1", PURPLE)
    const b = put(s, "p1", PURPLE)
    const red = s.players.p1.field.spirits[0]!
    exhaustAllOfP1(s)
    assert(!a.isRested && !b.isRested, "紫のスピリット2体は疲労しない")
    assert(s.players.p1.deck.length === 38, `1体につき1枚、計2枚を破棄した（実際 ${40 - s.players.p1.deck.length}枚）`)
    assert(red.isRested, "紫でない発生源自身は疲労する（filter 外）")
})

console.log("=== 2. 境界：魔法の効果・自分の効果・デッキ不足・デッキ破棄不可は防げない ===")
withEffect(SRC, prevent, () => {
    const s = game("prevent-magic")
    put(s, "p1", SRC)
    const a = put(s, "p1", PURPLE)
    exhaustAllOfP1(s, "magic")
    assert(a.isRested && s.players.p1.deck.length === 40, "bySourceTypes に無い魔法の効果では払わず疲労する")

    const t = game("prevent-own")
    put(t, "p1", SRC)
    const b = put(t, "p1", PURPLE)
    const mine = put(t, "p1", PLAIN)
    resolveAction(t, "p1", mine, { type: "exhaust", count: 1, side: "own", filter: { color: "purple" } }, undefined, undefined, "spirit")
    assert(b.isRested && t.players.p1.deck.length === 40, "自分の効果による疲労は対象外（払わず疲労）")

    const u = game("prevent-empty")
    put(u, "p1", SRC)
    const c = put(u, "p1", PURPLE)
    u.players.p1.deck = []
    exhaustAllOfP1(u)
    assert(c.isRested, "デッキが無く払えないなら疲労する")

    const v = game("prevent-nomill")
    put(v, "p1", SRC)
    const d = put(v, "p1", PURPLE)
    withEffect(PLAIN, { id: "t649n", kind: "globalConstraint", levels: null, constraint: { type: "noDeckMill" } }, () => {
        const holder = put(v, "p2", PLAIN)
        void holder
        exhaustAllOfP1(v)
    })
    assert(d.isRested && v.players.p1.deck.length === 40, "お互いのデッキが破棄されない間はコストを払えず疲労する")
})

console.log("=== 3. 対話：体ごとに払うか選べる（払う／払わない） ===")
withEffect(SRC, prevent, () => {
    const s = game("prevent-ask", true)
    put(s, "p1", SRC)
    const a = put(s, "p1", PURPLE)
    const b = put(s, "p1", PURPLE)
    exhaustAllOfP1(s)
    assert(s.pendingChoice?.pid === "p1" && s.pendingChoice.kind === "option", "持ち主に払うかの確認が出る")
    assert(handleAction(s, "p1", { type: "resolveChoice", option: "支払う" }) === null, "1体目は払う")
    assert(s.pendingChoice?.pid === "p1", "2体目の確認が続けて出る")
    assert(handleAction(s, "p1", { type: "resolveChoice", option: "支払わない" }) === null, "2体目は払わない")
    assert(s.pendingChoice === null, "確認が済んだ")
    const rested = [a, b].filter((x) => x.isRested).length
    assert(rested === 1 && s.players.p1.deck.length === 39, `払った1体だけが疲労せず、1枚だけ破棄した（疲労 ${rested}体・破棄 ${40 - s.players.p1.deck.length}枚）`)
})

console.log("=== 4. placeCores：ownSpirits→self（BS18-008 の形） ===")
{
    const s = game("pc-own-self")
    const host = put(s, "p1", SRC, 1)
    const rich = put(s, "p1", PLAIN, 3)
    resolveAction(s, "p1", host, { type: "placeCores", from: "ownSpirits", to: "self", count: 1 })
    assert(host.cores === 2 && rich.cores === 2, "他のスピリットのコア1個がこのスピリットに移った")

    const t = game("pc-own-self-alone")
    const solo = put(t, "p1", SRC, 1)
    resolveAction(t, "p1", solo, { type: "placeCores", from: "ownSpirits", to: "self", count: 1 })
    assert(solo.cores === 1, "他のスピリットがいなければ何も動かない（自分から自分へは動かさない）")
}

console.log("=== 5. placeCores：消滅しない取り方を優先し、次にリザーブ、最後に消滅する取り方 ===")
{
    const s = game("pc-auto")
    const host = put(s, "p1", SRC, 1)
    const rich = put(s, "p1", PLAIN, 3)
    const poor = put(s, "p1", PLAIN, 1)
    s.players.p1.reserve = 5
    resolveAction(s, "p1", host, { type: "placeCores", from: ["ownSpirits", "reserve"], to: "self", count: 3 })
    assert(rich.cores === 1 && s.players.p1.reserve === 4 && host.cores === 4, `余裕のあるスピリットから2個、次にリザーブから1個（rich=${rich.cores} reserve=${s.players.p1.reserve} host=${host.cores}）`)
    assert(poor.cores === 1 && s.players.p1.field.spirits.includes(poor), "コア1個の（取ると消滅する）スピリットには手を付けない")

    const t = game("pc-vanish")
    const host2 = put(t, "p1", SRC, 1)
    const poor2 = put(t, "p1", PLAIN, 1)
    t.players.p1.reserve = 0
    resolveAction(t, "p1", host2, { type: "placeCores", from: ["ownSpirits", "reserve"], to: "self", count: 1 })
    assert(host2.cores === 2 && !t.players.p1.field.spirits.includes(poor2), "ほかに取り元が無ければ、取ったスピリットは通常どおり消滅する")
}

console.log("=== 6. placeCores：好きなだけ・fillTo（BS18-X01 の形） ===")
{
    const s = game("pc-fill")
    const host = put(s, "p1", SRC, 1)
    const rich = put(s, "p1", PLAIN, 3)
    s.players.p1.life = 3
    s.players.p1.reserve = 10
    resolveAction(s, "p1", host, { type: "placeCores", from: ["ownSpirits", "reserve"], to: "life", fillTo: 5, count: "any" })
    assert(s.players.p1.life === 5, "ライフが5になるまで置いた")
    assert(rich.cores === 1 && s.players.p1.reserve === 10, "取り元はまず消滅しない余裕のあるスピリット")

    const t = game("pc-fill-full")
    const h = put(t, "p1", SRC, 1)
    t.players.p1.life = 5
    resolveAction(t, "p1", h, { type: "placeCores", from: ["ownSpirits", "reserve"], to: "life", fillTo: 5, count: "any" })
    assert(t.players.p1.life === 5 && t.players.p1.reserve === 10, "すでに5なら何も動かない")

    const u = game("pc-fill-short")
    const h2 = put(u, "p1", SRC, 1)
    u.players.p1.life = 3
    u.players.p1.reserve = 1
    resolveAction(u, "p1", h2, { type: "placeCores", from: ["ownSpirits", "reserve"], to: "life", fillTo: 5, count: "any" })
    assert(u.players.p1.life === 4 && u.players.p1.reserve === 0 && u.players.p1.field.spirits.includes(h2), "足りなければあるだけで止まり、自壊するまでは取らない")
}

console.log("=== 7. placeCores：from:life → self（コスト）と払えるかの判定 ===")
{
    const s = game("pc-life-cost")
    const host = put(s, "p1", SRC, 1)
    s.players.p1.life = 5
    const act = { type: "placeCores", from: "life", to: "self", count: 1 } as const
    assert(canPayResolve(s, "p1", host, act, undefined, "spirit"), "ライフがあれば払える")
    resolveAction(s, "p1", host, act)
    assert(s.players.p1.life === 4 && host.cores === 2, "ライフのコア1個がこのスピリットに置かれた")
    s.players.p1.life = 0
    assert(!canPayResolve(s, "p1", host, act, undefined, "spirit"), "ライフが無ければ払えない")
    assert(!canPayResolve(s, "p1", null, act, undefined, "spirit"), "置き先（このスピリット）が場にいなければ払えない")
}

console.log("=== 8. placeCores 対話：どこから何個取るか持ち主が選ぶ ===")
{
    const s = game("pc-ask", true)
    const host = put(s, "p1", SRC, 1)
    put(s, "p1", PLAIN, 3)
    s.players.p1.life = 3
    s.players.p1.reserve = 10
    resolveAction(s, "p1", host, { type: "placeCores", from: ["ownSpirits", "reserve"], to: "life", fillTo: 5, count: "any" })
    const first = s.pendingChoice
    assert(first?.kind === "option" && (first.options ?? []).some((o) => o.startsWith("リザーブ")) && (first.options ?? []).includes("やめる"), "取り元の選択（リザーブ・スピリット・やめる）が出る")
    const reserveLabel = (first?.options ?? []).find((o) => o.startsWith("リザーブ"))!
    assert(handleAction(s, "p1", { type: "resolveChoice", option: reserveLabel }) === null, "リザーブを選ぶ")
    assert(s.pendingChoice?.kind === "option" && (s.pendingChoice.options ?? []).join() === "1,2", "個数の選択（最大2個）が出る")
    assert(handleAction(s, "p1", { type: "resolveChoice", option: "2" }) === null, "2個を選ぶ")
    assert(s.pendingChoice === null && s.players.p1.life === 5 && s.players.p1.reserve === 8, "リザーブから2個取り、ライフが5になった")

    const t = game("pc-ask-stop", true)
    const h = put(t, "p1", SRC, 1)
    t.players.p1.life = 3
    resolveAction(t, "p1", h, { type: "placeCores", from: ["ownSpirits", "reserve"], to: "life", fillTo: 5, count: "any" })
    assert(handleAction(t, "p1", { type: "resolveChoice", option: "やめる" }) === null, "やめるを選ぶ")
    assert(t.pendingChoice === null && t.players.p1.life === 3, "好きなだけ＝0個でもよい")
}

console.log("すべてのチェックに合格しました 🎉（part649）")
