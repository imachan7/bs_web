// smoke パート635（BS18 軸4〜7：unblockableBy filter.cost.in／immunityGrant.nameIncludes／reviveOnDestroy.nameIncludes／revived.handOrDeckTop）
import { hasMagicImmunity } from "../../shared/rules"
import { canBlock } from "../../shared/block"
import { assert, createGame, createInstance, destroySpirit, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const SRC = "BS01-001" // ゴラドン（コスト0・効果なし）
const A = "BS01-002" // ロクケラトプス（コスト1）
const B = "BS01-005" // アイバーン（コスト2）
const C = "BS01-008" // メタルバーン（コスト3）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SRC).name === "ゴラドン" && getCard(SRC).effects.length === 0, "SRCはゴラドン（効果なし）")
    assert(getCard(A).name === "ロクケラトプス" && getCard(A).cost === 1, "Aはロクケラトプス")
    assert(getCard(B).name === "アイバーン" && getCard(B).cost === 2, "Bはアイバーン")
    assert(getCard(C).name === "メタルバーン" && getCard(C).cost === 3, "Cはメタルバーン")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    return s
}

function withEffects(cardId: string, effects: unknown[], body: () => void): void {
    const c = getCard(cardId)
    const saved = c.effects
    c.effects = effects as typeof c.effects
    try {
        body()
    } finally {
        c.effects = saved
    }
}

console.log("=== 4. unblockableBy filter.cost.in ===")
withEffects(SRC, [{ id: "t1", kind: "constraint", levels: null, constraint: { type: "unblockableBy", filter: { cost: { in: [1, 3] } } } }], () => {
    const s = game("c4")
    const atk = createInstance(SRC, s.turn, 1)
    const a = createInstance(A, s.turn, 1)
    const b = createInstance(B, s.turn, 1)
    const c = createInstance(C, s.turn, 1)
    s.players.p1.field.spirits.push(atk)
    s.players.p2.field.spirits.push(a, b, c)
    refreshLevelAsOverrides(s)
    assert(canBlock(s, "p2", a, "p1", atk) !== null, "コスト1（一覧内）のスピリットはブロックできない")
    assert(canBlock(s, "p2", c, "p1", atk) !== null, "コスト3（一覧内）のスピリットはブロックできない")
    assert(canBlock(s, "p2", b, "p1", atk) === null, "コスト2（一覧外）のスピリットはブロックできる")
})

console.log("=== 5. immunityGrant.nameIncludes ===")
withEffects(SRC, [{ id: "t1", kind: "immunityGrant", levels: null, target: "ownAll", against: "magic", nameIncludes: ["ロク", "バーン"] }], () => {
    const s = game("c5")
    const src = createInstance(SRC, s.turn, 1)
    const a = createInstance(A, s.turn, 1)
    const b = createInstance(B, s.turn, 1)
    const other = createInstance("BS01-051", s.turn, 1) // フライングミラージュ
    s.players.p1.field.spirits.push(src, a, b, other)
    refreshLevelAsOverrides(s)
    assert(hasMagicImmunity(s, "p1", a), "名前に「ロク」を含むスピリットは受けない")
    assert(hasMagicImmunity(s, "p1", b), "名前に「バーン」を含む（配列のOR）")
    assert(!hasMagicImmunity(s, "p1", other), "どの名前も含まないスピリットは受ける")
    assert(!hasMagicImmunity(s, "p1", src), "発生源自身も名前が合わなければ対象外")
})

function reviveEntry(revived: unknown): unknown[] {
    return [{ id: "t1", kind: "reviveOnDestroy", levels: null, scope: "ownAll", filter: { nameContains: ["ロク"] }, when: {}, revived }]
}

console.log("=== 6. reviveOnDestroy.nameIncludes（復活先は場に残る） ===")
withEffects(SRC, reviveEntry({ rested: false }), () => {
    const s = game("c6")
    const src = createInstance(SRC, s.turn, 1)
    const a = createInstance(A, s.turn, 2)
    const b = createInstance(B, s.turn, 2)
    s.players.p1.field.spirits.push(src, a, b)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", a.instanceId, "destroy")
    destroySpirit(s, "p1", b.instanceId, "destroy")
    const ids = s.players.p1.field.spirits.map((i) => i.instanceId)
    assert(ids.includes(a.instanceId), "名前が合うスピリットは破壊されず場に残る")
    assert(!ids.includes(b.instanceId), "名前が合わないスピリットは通常どおり破壊される")
})

console.log("=== 7. revived.handOrDeckTop ===")
withEffects(SRC, reviveEntry({ handOrDeckTop: true }), () => {
    // 非対話：手札へ
    const s = game("c7a")
    const src = createInstance(SRC, s.turn, 1)
    const a = createInstance(A, s.turn, 2)
    s.players.p1.field.spirits.push(src, a)
    refreshLevelAsOverrides(s)
    const reserve0 = s.players.p1.reserve
    const hand0 = s.players.p1.hand.length
    destroySpirit(s, "p1", a.instanceId, "destroy")
    assert(!s.players.p1.field.spirits.some((i) => i.instanceId === a.instanceId), "場から離れる")
    assert(s.players.p1.hand.length === hand0 + 1 && s.players.p1.hand.includes(A), "非対話は手札に入る")
    assert(s.players.p1.reserve === reserve0 + 2, "コアはリザーブへ")
    assert(s.pendingChoice === null, "非対話では選択待ちにならない")
})
withEffects(SRC, reviveEntry({ handOrDeckTop: true }), () => {
    for (const pick of ["デッキの上に置く", "手札に残す"] as const) {
        const s = game("c7b-" + pick, true)
        const src = createInstance(SRC, s.turn, 1)
        const a = createInstance(A, s.turn, 2)
        s.players.p1.field.spirits.push(src, a)
        refreshLevelAsOverrides(s)
        const hand0 = s.players.p1.hand.length
        const deck0 = s.players.p1.deck.length
        destroySpirit(s, "p1", a.instanceId, "destroy")
        handleAction(s, "p1", { type: "nextPhase" }) // handleAction の末尾で行き先の確認が立つ
        assert(!s.players.p1.field.spirits.some((i) => i.instanceId === a.instanceId) && s.players.p1.hand.length === hand0, `${pick}：行き先が決まるまで手札にもない`)
        const pc = s.pendingChoice
        assert(pc !== null && pc.kind === "option" && pc.pid === "p1", `${pick}：持ち主に行き先を聞く`)
        assert((pc?.options ?? []).join("/") === "手札に残す/デッキの上に置く", `${pick}：選択肢は2つ`)
        handleAction(s, "p1", { type: "resolveChoice", option: pick })
        assert(s.pendingChoice === null, `${pick}：選択後に待ちが消える`)
        if (pick === "デッキの上に置く") {
            assert(s.players.p1.deck.length === deck0 + 1 && s.players.p1.deck[0] === A, "デッキの一番上にある")
            assert(s.players.p1.hand.length === hand0, "手札の枚数が戻る（手札に残らない）")
        } else {
            assert(s.players.p1.deck.length === deck0 && s.players.p1.hand.length === hand0 + 1, "手札に残る")
        }
    }
})

console.log("=== 7b. デッキの上を選んでも手札が増えた誘発は起きない／手札を選べば起きる ===")
{
    const orig = getCard(B).effects
    for (const pick of ["デッキの上に置く", "手札に残す"] as const) {
        withEffects(SRC, reviveEntry({ handOrDeckTop: true }), () => {
            const s = game("c7c-" + pick, true)
            const a = createInstance(A, s.turn, 2)
            const watcher = createInstance(B, s.turn, 1) // 相手側の発生源（手札が増えたとき自分のBPを+する）
            s.players.p1.field.spirits.push(createInstance(SRC, s.turn, 1), a)
            s.players.p2.field.spirits.push(watcher)
            getCard(B).effects = [{ id: "w", kind: "fieldEvent", levels: null, event: "opponentHandAdded", action: { type: "draw", count: 1 } }] as typeof orig
            try {
                refreshLevelAsOverrides(s)
                const draws0 = s.players.p2.hand.length
                destroySpirit(s, "p1", a.instanceId, "destroy")
                handleAction(s, "p1", { type: "nextPhase" })
                handleAction(s, "p1", { type: "resolveChoice", option: pick })
                const fired = s.players.p2.hand.length > draws0
                assert(fired === (pick === "手札に残す"), `${pick}：手札が増えた誘発は ${pick === "手札に残す" ? "起きる" : "起きない"}`)
            } finally {
                getCard(B).effects = orig
            }
        })
    }
}

console.log("すべてのチェックに合格しました 🎉（part635）")
