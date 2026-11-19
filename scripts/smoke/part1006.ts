// smoke パート1006（古の魔王城：timedEffect の指定の段への付け替え。TARGET_REDIRECT.md §2.3 の 2b-1。Q23559・Q23560）
import { assert, getCard, timedHas } from "./helpers"
import { scenario } from "./scenario"

const CASTLE = "BSC05-017" // 古の魔王城
const FAIRWAIRE = "BS18-081" // フェアヴァイレ（黄マジック・コスト3・フラッシュ：相手のスピリット1体はアタック/ブロックできない）
const BREEZE = "BS13-077" // ブリーズライド（緑マジック・コスト2・フラッシュ：スピリット1体をBP+3000）
const HEAVY = "BS02-110" // ヘビィゲート（黄マジック・コスト5・フラッシュ：コスト1以下のスピリットすべてはアタック/ブロックできない）
const ABSOLUTE = "BS12-079" // アブソリュートストライク（白マジック・コスト3・フラッシュ：相手のスピリットを好きなだけ指定→必ずアタック）
const STRIKE = "BS10-X04" // 月光龍ストライク・ジークヴルム（白・コスト6。名前に「ストライク」）
const FALEGH = "BS12-038" // オリンピアの天使ファレグ（黄・コスト5。召喚時：天霊1体につき相手のスピリット1体はブロックできない）
const KUREIO = "BS05-037" // 天使クレイオ（黄・コスト2・天霊）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1。Lv1 BP1000）
const IBARN = "BS01-005" // アイバーン（赤・コスト2）

console.log("=== 前提: カードの機械確認 ===")
for (const [id, name, cost, type] of [
    [CASTLE, "古の魔王城", 4, "nexus"], [FAIRWAIRE, "フェアヴァイレ", 3, "magic"], [BREEZE, "ブリーズライド", 2, "magic"], [HEAVY, "ヘビィゲート", 5, "magic"],
    [ABSOLUTE, "アブソリュートストライク", 3, "magic"], [STRIKE, "月光龍ストライク・ジークヴルム", 6, "spirit"], [FALEGH, "オリンピアの天使ファレグ", 5, "spirit"],
    [KUREIO, "天使クレイオ", 2, "spirit"], [ROKU, "ロクケラトプス", 1, "spirit"], [IBARN, "アイバーン", 2, "spirit"],
] as const) {
    assert(getCard(id).name === name && getCard(id).cost === cost && getCard(id).type === type, `${id}は${name}（${type}・コスト${cost}）`)
}
assert(getCard(KUREIO).family.includes("天霊"), "クレイオは天霊")

type T = Parameters<Parameters<typeof scenario>[0]["steps"]>[0]
const cast = (t: T): void => t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
const magicOnly = (cost: number, name: string, hand = "なし"): string[] => [
    `相手.手札: ${name}${hand === "なし" ? "" : "、ロクケラトプス"} → ${hand}`, `相手.トラッシュ: なし → ${name}`, `相手.リザーブ: 10 → ${10 - cost}`, `相手.トラッシュのコア: 0 → ${cost}`,
]

console.log("=== 場面1: 1体指定（アタック/ブロック不可） ===")
scenario({
    name: "castle-timedEffect の1体指定を持ち主の別の1体へ付け替えると、付け替え先だけがアタック・ブロックできない",
    start: {
        turn: "opp", interactive: true,
        me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: IBARN, label: "A" }, { card: IBARN, label: "B" }] },
        opp: { hand: [FAIRWAIRE], spirits: [{ card: IBARN, label: "U" }] },
    },
    steps(t) {
        cast(t)
        t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        assert(t.state.pendingChoice?.pid === t.me && t.state.pendingChoice.candidates?.includes(t.id("B")) === true, "持ち主に付け替え先が出る")
        t.act("me", { type: "resolveChoice", instanceId: t.id("B") })
        assert(!timedHas(t.state, t.inst("A"), "cantAttack") && !timedHas(t.state, t.inst("A"), "cantBlock"), "選ばれたAは効果を受けない")
        assert(timedHas(t.state, t.inst("B"), "cantAttack") && timedHas(t.state, t.inst("B"), "cantBlock"), "付け替え先のBはアタック・ブロックできない")
    },
    expect: magicOnly(3, "フェアヴァイレ"),
})
scenario({
    name: "castle-付け替えないと、選んだ個体がアタック・ブロックできない",
    start: {
        turn: "opp", interactive: true,
        me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: IBARN, label: "A" }, { card: IBARN, label: "B" }] },
        opp: { hand: [FAIRWAIRE], spirits: [{ card: IBARN, label: "U" }] },
    },
    steps(t) {
        cast(t)
        t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        t.act("me", { type: "resolveChoice" })
        assert(timedHas(t.state, t.inst("A"), "cantAttack") && !timedHas(t.state, t.inst("B"), "cantAttack"), "Aだけがアタックできない")
    },
    expect: magicOnly(3, "フェアヴァイレ"),
})

console.log("=== 場面2: BP増加（両陣営から1体） ===")
scenario({
    name: "castle-BP増加の対象に持ち主のスピリットを選ぶと、付け替え先だけBP+3000",
    start: {
        turn: "opp", interactive: true,
        me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: IBARN, label: "A" }, { card: IBARN, label: "B" }] },
        opp: { hand: [BREEZE], spirits: [{ card: IBARN, label: "U" }] },
    },
    steps(t) {
        cast(t)
        t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        assert(t.state.pendingChoice?.pid === t.me, "持ち主に付け替えの確認が出る")
        t.act("me", { type: "resolveChoice", instanceId: t.id("B") })
    },
    expect: ["自分.B.BP: 2000 → 5000", ...magicOnly(2, "ブリーズライド")],
})

console.log("=== 場面3・4: ルール型（すべて） ===")
const heavy = {
    turn: "opp" as const, interactive: true,
    me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: ROKU, label: "A" }, { card: ROKU, label: "B" }] },
    opp: { hand: [HEAVY, ROKU], spirits: [{ card: ROKU, label: "U" }] },
}
scenario({
    name: "castle-コスト1以下すべてを付け替えると、付け替え先だけが効果を受け、使った側と後から出たスピリットは受けない",
    start: heavy,
    steps(t) {
        cast(t)
        t.act("me", { type: "resolveChoice", instanceId: t.id("A") })
        assert(timedHas(t.state, t.inst("A"), "cantAttack") && timedHas(t.state, t.inst("A"), "cantBlock"), "付け替え先のAはアタック・ブロックできない")
        assert(!timedHas(t.state, t.inst("B"), "cantAttack") && !timedHas(t.state, t.inst("U"), "cantAttack") && !timedHas(t.state, t.inst("U"), "cantBlock"), "BもUも受けない")
        t.act("opp", { type: "summon", handIndex: 0 })
        const fresh = t.state.players[t.opp].field.spirits.find((s) => s.instanceId !== t.id("U"))
        assert(fresh !== undefined && !timedHas(t.state, fresh, "cantAttack"), "同じターンに新しく出たコスト1以下は効果を受けない")
    },
    expect: [
        "相手.手札: ヘビィゲート、ロクケラトプス → なし", "相手.トラッシュ: なし → ヘビィゲート", "相手.リザーブ: 10 → 4", "相手.トラッシュのコア: 0 → 5",
        "相手.ロクケラトプス.場所: なし → フィールド", "相手.ロクケラトプス.疲労: なし → false", "相手.ロクケラトプス.コア: なし → 1", "相手.ロクケラトプス.Lv: なし → 1", "相手.ロクケラトプス.BP: なし → 1000",
    ],
})
scenario({
    name: "castle-該当が元から1体だけでも、その1体に付け替えたら後から出たスピリットは受けない",
    start: { ...heavy, me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: ROKU, label: "A" }] }, opp: { hand: [HEAVY, ROKU], spirits: [{ card: IBARN, label: "U" }] } },
    steps(t) {
        cast(t)
        t.act("me", { type: "resolveChoice", instanceId: t.id("A") })
        assert(timedHas(t.state, t.inst("A"), "cantAttack"), "付け替え先のAはアタックできない")
        t.act("opp", { type: "summon", handIndex: 0 })
        const fresh = t.state.players[t.opp].field.spirits.find((s) => s.instanceId !== t.id("U"))
        assert(fresh !== undefined && !timedHas(t.state, fresh, "cantAttack") && !timedHas(t.state, fresh, "cantBlock"), "同じターンに新しく出たコスト1以下は効果を受けない")
    },
    expect: [
        "相手.手札: ヘビィゲート、ロクケラトプス → なし", "相手.トラッシュ: なし → ヘビィゲート", "相手.リザーブ: 10 → 4", "相手.トラッシュのコア: 0 → 5",
        "相手.ロクケラトプス.場所: なし → フィールド", "相手.ロクケラトプス.疲労: なし → false", "相手.ロクケラトプス.コア: なし → 1", "相手.ロクケラトプス.Lv: なし → 1", "相手.ロクケラトプス.BP: なし → 1000",
    ],
})
scenario({
    name: "castle-付け替えないと、今までどおり両陣営のコスト1以下すべてに効く",
    start: heavy,
    steps(t) {
        cast(t)
        t.act("me", { type: "resolveChoice" })
        for (const l of ["A", "B", "U"]) assert(timedHas(t.state, t.inst(l), "cantAttack") && timedHas(t.state, t.inst(l), "cantBlock"), `${l}はアタック・ブロックできない`)
    },
    expect: magicOnly(5, "ヘビィゲート", "ロクケラトプス"),
})

console.log("=== 場面5: 好きなだけ指定（placeAny） ===")
scenario({
    name: "castle-好きなだけ指定した2体を付け替えると、付け替え先1体だけが必ずアタックする",
    start: {
        turn: "opp", interactive: true,
        me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: IBARN, label: "A" }, { card: IBARN, label: "B" }, { card: IBARN, label: "C" }] },
        opp: { hand: [ABSOLUTE], spirits: [{ card: STRIKE, label: "S" }] },
    },
    steps(t) {
        cast(t)
        t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        t.act("opp", { type: "resolveChoice", instanceId: t.id("B") })
        t.act("opp", { type: "resolveChoice" })
        assert(t.state.pendingChoice?.pid === t.me, "2体指定が出そろってから持ち主に聞く")
        t.act("me", { type: "resolveChoice", instanceId: t.id("C") })
        assert(timedHas(t.state, t.inst("C"), "mustAttack") && !timedHas(t.state, t.inst("A"), "mustAttack") && !timedHas(t.state, t.inst("B"), "mustAttack"), "Cだけが必ずアタックする")
    },
    expect: ["相手.手札: アブソリュートストライク → なし", "相手.トラッシュ: なし → アブソリュートストライク", "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 2"], // 自分の「ストライク」で軽減（コスト3→2）
})

console.log("=== 場面6: 相手N体（魔王城なし・対話） ===")
scenario({
    name: "timedEffect-相手2体を全部選んでから適用する（魔王城なし）",
    start: {
        turn: "opp", interactive: true,
        me: { spirits: [{ card: IBARN, label: "A" }, { card: IBARN, label: "B" }, { card: IBARN, label: "C" }] },
        opp: { hand: [FALEGH], spirits: [{ card: KUREIO, label: "K" }] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        assert(!timedHas(t.state, t.inst("A"), "cantBlock"), "2体選び終えるまでは適用されない")
        t.act("opp", { type: "resolveChoice", instanceId: t.id("C") })
        assert(timedHas(t.state, t.inst("A"), "cantBlock") && timedHas(t.state, t.inst("C"), "cantBlock") && !timedHas(t.state, t.inst("B"), "cantBlock"), "AとCがブロックできない")
    },
    expect: [
        "相手.手札: オリンピアの天使ファレグ → なし", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4",
        "相手.オリンピアの天使ファレグ.場所: なし → フィールド", "相手.オリンピアの天使ファレグ.疲労: なし → false", "相手.オリンピアの天使ファレグ.コア: なし → 1",
        "相手.オリンピアの天使ファレグ.Lv: なし → 1", "相手.オリンピアの天使ファレグ.BP: なし → 3000",
    ],
})
console.log("すべてのチェックに合格しました 🎉（part1006）")
