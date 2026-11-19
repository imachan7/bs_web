// smoke パート1007（古の魔王城：timedEffect の残りの place* への付け替え。TARGET_REDIRECT.md §2.3 の 2b-2。Q23559・Q23560）
import { assert, getCard, timedHas } from "./helpers"
import { scenario } from "./scenario"

const CASTLE = "BSC05-017" // 古の魔王城
const CATSEYE = "BS08-079" // キャッツアイ（黄マジック・コスト3・メイン：相手のスピリット1体をLv1として扱う）
const STEEL = "BS20-081" // スティールハート（黄マジック・コスト3・フラッシュ：相手のスピリット1体のシンボルを0）
const CLOAK = "BS01-141" // インビジブルクローク（白マジック・コスト3・フラッシュ：自分のスピリット1体はブロックされない）
const THREE = "BS05-079" // スリーカード（黄マジック・コスト3・フラッシュ：スピリット1体を3体分として数える）
const GEKISHO = "P079" // 激翔（白黄マジック・コスト2・メイン：スピリット1体に色を与える）
const ILLUSION = "BS02-111" // スピリットイリュージョン（黄マジック・コスト6・メイン：指定した色のスピリットすべてを最高Lvとして扱う）
const IBARN = "BS01-005" // アイバーン（赤・コスト2）

console.log("=== 前提: カードの機械確認 ===")
for (const [id, name, cost, type] of [
    [CASTLE, "古の魔王城", 4, "nexus"], [CATSEYE, "キャッツアイ", 3, "magic"], [STEEL, "スティールハート", 3, "magic"], [CLOAK, "インビジブルクローク", 3, "magic"],
    [THREE, "スリーカード", 3, "magic"], [GEKISHO, "激翔", 2, "magic"], [ILLUSION, "スピリットイリュージョン", 6, "magic"], [IBARN, "アイバーン", 2, "spirit"],
] as const) {
    assert(getCard(id).name === name && getCard(id).cost === cost && getCard(id).type === type, `${id}は${name}（${type}・コスト${cost}）`)
}

type T = Parameters<Parameters<typeof scenario>[0]["steps"]>[0]
const board = (hand: string[], phase: "main" | "attack" = "main", turn: "me" | "opp" = "opp") => ({
    turn, phase, interactive: true,
    me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: IBARN, label: "A", cores: 3 }, { card: IBARN, label: "B", cores: 3 }] },
    opp: { hand, spirits: [{ card: IBARN, label: "U", cores: 3 }] },
})
const cast = (t: T, timing: "main" | "flash"): void => t.act("opp", { type: "castMagic", handIndex: 0, timing })
const magicOnly = (cost: number, name: string): string[] => [
    `相手.手札: ${name} → なし`, `相手.トラッシュ: なし → ${name}`, `相手.リザーブ: 10 → ${10 - cost}`, `相手.トラッシュのコア: 0 → ${cost}`,
]

console.log("=== Lv（1体） ===")
scenario({
    name: "castle-Lv1として扱う対象を付け替えると、付け替え先だけがLv1として扱われる",
    start: board([CATSEYE]),
    steps(t) {
        cast(t, "main")
        t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        t.act("me", { type: "resolveChoice", instanceId: t.id("B") })
        assert(!timedHas(t.state, t.inst("A"), "level") && timedHas(t.state, t.inst("B"), "level"), "付け替え先のBだけにLvの置き換えが掛かる")
    },
    expect: [...magicOnly(3, "キャッツアイ")],
})
scenario({
    name: "castle-Lvの対象を付け替えないと、選んだ個体がLv1として扱われる",
    start: board([CATSEYE]),
    steps(t) {
        cast(t, "main")
        t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        t.act("me", { type: "resolveChoice" })
        assert(timedHas(t.state, t.inst("A"), "level") && !timedHas(t.state, t.inst("B"), "level"), "Aだけが掛かる")
    },
    expect: [...magicOnly(3, "キャッツアイ")],
})

console.log("=== シンボル（1体） ===")
scenario({
    name: "castle-シンボルを0にする対象を付け替えると、付け替え先だけが0になる",
    start: board([STEEL], "attack"),
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("U") })
        t.act("me", { type: "pass" })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("A") })
        t.act("me", { type: "resolveChoice", instanceId: t.id("B") })
        assert(!timedHas(t.state, t.inst("A"), "symbolSet") && timedHas(t.state, t.inst("B"), "symbolSet"), "付け替え先のBだけ")
    },
    expect: [...magicOnly(3, "スティールハート"), "相手.U.疲労: false → true"],
})
scenario({
    name: "castle-シンボルの対象を付け替えないと、選んだ個体が0になる",
    start: board([STEEL], "attack"),
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("U") })
        t.act("me", { type: "pass" })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("A") })
        t.act("me", { type: "resolveChoice" })
        assert(timedHas(t.state, t.inst("A"), "symbolSet") && !timedHas(t.state, t.inst("B"), "symbolSet"), "Aだけ")
    },
    expect: [...magicOnly(3, "スティールハート"), "相手.U.疲労: false → true"],
})

console.log("=== ブロックされない（自分のスピリットだけを選ぶ） ===")
scenario({
    name: "castle-自分のスピリットを選ぶ効果には付け替えを聞かない",
    start: board([CLOAK]),
    steps(t) {
        cast(t, "flash")
        if (t.state.pendingChoice?.pid === t.opp) t.act("opp", { type: "resolveChoice", instanceId: t.id("U") })
        assert(t.state.pendingChoice === null, "持ち主への確認は出ない")
        assert(timedHas(t.state, t.inst("U"), "unblockable"), "Uがブロックされない")
    },
    expect: [...magicOnly(3, "インビジブルクローク")],
})

console.log("=== 数え方（1体） ===")
scenario({
    name: "castle-3体分として数える対象を付け替えると、付け替え先だけが3体分になる",
    start: board([THREE]),
    steps(t) {
        cast(t, "flash")
        if (t.state.pendingChoice?.pid === t.opp) t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        t.act("me", { type: "resolveChoice", instanceId: t.id("B") })
        assert(!timedHas(t.state, t.inst("A"), "countAs") && timedHas(t.state, t.inst("B"), "countAs"), "付け替え先のBだけ")
    },
    expect: [...magicOnly(3, "スリーカード")],
})
scenario({
    name: "castle-数え方の対象を付け替えないと、元の対象が3体分になる",
    start: board([THREE]),
    steps(t) {
        cast(t, "flash")
        const first = t.state.pendingChoice
        const asked = first?.pid === t.opp
        if (asked) t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        t.act("me", { type: "resolveChoice" })
        assert(timedHas(t.state, t.inst("A"), "countAs") || timedHas(t.state, t.inst("B"), "countAs"), "元の対象に掛かる")
    },
    expect: [...magicOnly(3, "スリーカード")],
})

console.log("=== 色（1体） ===")
scenario({
    name: "castle-色を与える対象を付け替えると、付け替え先だけが色を得る",
    start: board([GEKISHO]),
    steps(t) {
        cast(t, "main")
        t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        t.act("me", { type: "resolveChoice", instanceId: t.id("B") })
        t.act("opp", { type: "resolveChoice", option: "青" })
        assert(!timedHas(t.state, t.inst("A"), "color") && timedHas(t.state, t.inst("B"), "color"), "付け替え先のBだけ")
    },
    expect: [...magicOnly(2, "激翔")],
})
scenario({
    name: "castle-色の対象を付け替えないと、選んだ個体が色を得る",
    start: board([GEKISHO]),
    steps(t) {
        cast(t, "main")
        t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        t.act("me", { type: "resolveChoice" })
        t.act("opp", { type: "resolveChoice", option: "青" })
        assert(timedHas(t.state, t.inst("A"), "color") && !timedHas(t.state, t.inst("B"), "color"), "Aだけ")
    },
    expect: [...magicOnly(2, "激翔")],
})

console.log("=== Lv（すべて） ===")
scenario({
    name: "castle-指定色すべてを最高Lvにする効果を付け替えると、付け替え先だけが対象で、後から出たスピリットには効かない",
    start: { ...board([ILLUSION]), opp: { hand: [ILLUSION, IBARN], spirits: [{ card: IBARN, label: "U", cores: 3 }] } },
    steps(t) {
        cast(t, "main")
        t.act("opp", { type: "resolveChoice", option: "赤" })
        t.act("me", { type: "resolveChoice", instanceId: t.id("A") })
        assert(timedHas(t.state, t.inst("A"), "level") && !timedHas(t.state, t.inst("B"), "level") && !timedHas(t.state, t.inst("U"), "level"), "付け替え先のAだけ")
        t.act("opp", { type: "summon", handIndex: 0 })
        const fresh = t.state.players[t.opp].field.spirits.find((s) => s.instanceId !== t.id("U"))
        assert(fresh !== undefined && !timedHas(t.state, fresh, "level"), "同じターンに新しく出たスピリットは効果を受けない")
    },
    expect: [
        "相手.手札: アイバーン、スピリットイリュージョン → なし", "相手.トラッシュ: なし → スピリットイリュージョン", "相手.リザーブ: 10 → 2", "相手.トラッシュのコア: 0 → 7",
        "相手.アイバーン.場所: なし → フィールド", "相手.アイバーン.疲労: なし → false", "相手.アイバーン.コア: なし → 1", "相手.アイバーン.Lv: なし → 1", "相手.アイバーン.BP: なし → 2000",
        "自分.A.BP: 2000 → 6000", "自分.A.Lv: 1 → 2",
    ],
})
console.log("すべてのチェックに合格しました 🎉（part1007）")
