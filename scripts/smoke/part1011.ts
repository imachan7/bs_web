// smoke パート1011（対象の選択が効果文と食い違っていた4枚：インビジブルクローク・スティールハート・スリーカード・グラストラップ）
import { assert, getCard, resolveAction, timedHas } from "./helpers"
import { scenario } from "./scenario"

const CASTLE = "BSC05-017" // 古の魔王城
const CLOAK = "BS01-141" // インビジブルクローク（白マジック・コスト3・フラッシュ：自分か相手のスピリット1体はブロックされない）
const STEEL = "BS20-081" // スティールハート（黄マジック・コスト3・フラッシュ：相手のスピリット1体のシンボルを0）
const THREE = "BS05-079" // スリーカード（黄マジック・コスト3・フラッシュ：スピリット1体を3体分として数える）
const GRASS = "BSC05-023" // グラストラップ（緑マジック・コスト3・フラッシュ：相手のスピリット1体を疲労・このターン回復できない）
const IBARN = "BS01-005" // アイバーン（赤・コスト2）

console.log("=== 前提: カードの機械確認 ===")
for (const [id, name, cost, type] of [
    [CASTLE, "古の魔王城", 4, "nexus"], [CLOAK, "インビジブルクローク", 3, "magic"], [STEEL, "スティールハート", 3, "magic"],
    [THREE, "スリーカード", 3, "magic"], [GRASS, "グラストラップ", 3, "magic"], [IBARN, "アイバーン", 2, "spirit"],
] as const) {
    assert(getCard(id).name === name && getCard(id).cost === cost && getCard(id).type === type, `${id}は${name}（${type}・コスト${cost}）`)
}

type T = Parameters<Parameters<typeof scenario>[0]["steps"]>[0]
const board = (hand: string[], castle = false, phase: "main" | "attack" = "main") => ({
    turn: "opp" as const, phase, interactive: true,
    me: { ...(castle ? { nexuses: [{ card: CASTLE, cores: 1 }] } : {}), spirits: [{ card: IBARN, label: "A", cores: 3 }, { card: IBARN, label: "B", cores: 3 }] },
    opp: { hand, spirits: [{ card: IBARN, label: "U", cores: 3 }, { card: IBARN, label: "V", cores: 3 }] },
})
const cast = (t: T): void => t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
// メインステップで使えない札用：アタックステップに入って相手（自分）がパスしてから使う
const castInAttack = (t: T): void => {
    t.act("opp", { type: "attack", instanceId: t.id("U") })
    t.act("me", { type: "pass" })
    cast(t)
}
const magicOnly = (cost: number, name: string): string[] => [
    `相手.手札: ${name} → なし`, `相手.トラッシュ: なし → ${name}`, `相手.リザーブ: 10 → ${10 - cost}`, `相手.トラッシュのコア: 0 → ${cost}`,
]
const candidates = (t: T): string[] => (t.state.pendingChoice?.candidates ?? []).slice().sort()

console.log("=== インビジブルクローク：両陣営から選ぶ ===")
scenario({
    name: "cloak-相手のスピリットも候補に出て、選んだ相手のスピリットがブロックされない",
    start: board([CLOAK]),
    steps(t) {
        cast(t)
        assert(candidates(t).join() === [t.id("A"), t.id("B"), t.id("U"), t.id("V")].sort().join(), "候補は両陣営の4体")
        t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        assert(timedHas(t.state, t.inst("A"), "unblockable") && !timedHas(t.state, t.inst("U"), "unblockable"), "Aだけがブロックされない")
    },
    expect: [...magicOnly(3, "インビジブルクローク")],
})

console.log("=== スティールハート：相手のスピリットから選ぶ ===")
scenario({
    name: "steel-選べるのは相手のスピリットだけで、選んだスピリットのシンボルが0になる",
    start: board([STEEL], false, "attack"),
    steps(t) {
        castInAttack(t)
        assert(candidates(t).join() === [t.id("A"), t.id("B")].sort().join(), "候補は相手（自分から見た相手）のA・Bだけ")
        t.act("opp", { type: "resolveChoice", instanceId: t.id("B") })
        assert(timedHas(t.state, t.inst("B"), "symbolSet") && !timedHas(t.state, t.inst("A"), "symbolSet") && !timedHas(t.state, t.inst("U"), "symbolSet"), "Bだけが0")
    },
    expect: [...magicOnly(3, "スティールハート"), "相手.U.疲労: false → true"],
})
scenario({
    name: "steel-魔王城の持ち主に使うと付け替えを聞かれ、付け替え先が0になる",
    start: board([STEEL], true, "attack"),
    steps(t) {
        castInAttack(t)
        t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        t.act("me", { type: "resolveChoice", instanceId: t.id("B") })
        assert(!timedHas(t.state, t.inst("A"), "symbolSet") && timedHas(t.state, t.inst("B"), "symbolSet"), "付け替え先のBだけ")
    },
    expect: [...magicOnly(3, "スティールハート"), "相手.U.疲労: false → true"],
})

console.log("=== スリーカード：両陣営から選ぶ ===")
scenario({
    name: "three-両陣営のスピリットが候補に出て、選んだスピリットが3体分になる",
    start: board([THREE]),
    steps(t) {
        cast(t)
        assert(candidates(t).join() === [t.id("A"), t.id("B"), t.id("U"), t.id("V")].sort().join(), "候補は両陣営の4体")
        t.act("opp", { type: "resolveChoice", instanceId: t.id("V") })
        assert(timedHas(t.state, t.inst("V"), "countAs") && !timedHas(t.state, t.inst("U"), "countAs"), "Vだけが3体分")
    },
    expect: [...magicOnly(3, "スリーカード")],
})

console.log("=== グラストラップ：疲労させ、このターン回復できない ===")
scenario({
    name: "grass-疲労したスピリットはこのターン効果で回復できず、ターンが変わると回復する",
    start: board([GRASS]),
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("A") })
        if (t.state.pendingChoice) t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        assert(t.inst("A").isRested && !t.inst("B").isRested, "Aだけが疲労")
        resolveAction(t.state, t.me, null, { type: "refresh", all: true }, undefined, ["white"], "magic")
        assert(t.inst("A").isRested, "同じターンの効果による回復は止まる")
        t.act("opp", { type: "endTurn" })
        assert(!t.inst("A").isRested, "次の自分のリフレッシュステップで回復する")
    },
    expect: [...magicOnly(3, "グラストラップ"), "自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 11", "自分.手札: なし → ロクケラトプス"],
})

console.log("すべてのチェックに合格しました 🎉（part1011）")
