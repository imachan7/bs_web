// smoke パート1008（古の魔王城：個体指定で耐性を見ていた残りの経路への付け替え。TARGET_REDIRECT.md §2.3 の 2c。Q23559・Q23560）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const CASTLE = "BSC05-017" // 古の魔王城
const SOURCE = "BS01-134" // バインディングソーン（マジック・コスト2・フラッシュ：相手のスピリット1体を疲労）
const RIBBON = "BS01-146" // ドリームリボン（マジック・コスト4・フラッシュ：相手のスピリット1体を手札へ）
const BOLT = "BS15-080" // 光速三段突（マジック・コスト6・フラッシュ：相手のスピリットをデッキの下へ）
const GAST = "BS09-069" // フレイムガスト（マジック・コスト6・フラッシュ：BP6000以下の相手のスピリット1体を破壊）
const PRESSURE = "BS19-109" // エンジェリックプレッシャー（マジック・コスト3・フラッシュ：相手のスピリット1体をBP-3000）
const IBARN = "BS01-005" // アイバーン（赤・コスト2）

console.log("=== 前提: カードの機械確認 ===")
for (const [id, name, cost, type] of [
    [CASTLE, "古の魔王城", 4, "nexus"], [SOURCE, "バインディングソーン", 2, "magic"], [RIBBON, "ドリームリボン", 4, "magic"], [BOLT, "光速三段突", 6, "magic"],
    [GAST, "フレイムガスト", 6, "magic"], [PRESSURE, "エンジェリックプレッシャー", 3, "magic"], [IBARN, "アイバーン", 2, "spirit"],
] as const) {
    assert(getCard(id).name === name && getCard(id).cost === cost && getCard(id).type === type, `${id}は${name}（${type}・コスト${cost}）`)
}

const board = (hand: string[]) => ({
    turn: "opp" as const, phase: "main" as const, interactive: true,
    me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: IBARN, label: "A", cores: 3 }, { card: IBARN, label: "B", cores: 3 }] },
    opp: { hand, spirits: [{ card: IBARN, label: "U", cores: 3 }] },
})
const magicOnly = (cost: number, name: string): string[] => [
    `相手.手札: ${name} → なし`, `相手.トラッシュ: なし → ${name}`, `相手.リザーブ: 10 → ${10 - cost}`, `相手.トラッシュのコア: 0 → ${cost}`,
]

const onField = (t: Parameters<Parameters<typeof scenario>[0]["steps"]>[0], id: string): boolean => t.state.players[t.me].field.spirits.some((s) => s.instanceId === id)
const cast = (t: Parameters<Parameters<typeof scenario>[0]["steps"]>[0], target: string): void =>
    t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id(target) })

console.log("=== 疲労（個体指定） ===")
scenario({
    name: "castle-疲労させる対象（個体指定）を付け替えると、付け替え先だけが疲労する",
    start: board([SOURCE]),
    steps(t) {
        cast(t, "A")
        t.act("me", { type: "resolveChoice", instanceId: t.id("B") })
        assert(!t.inst("A").isRested && t.inst("B").isRested, "付け替え先のBだけが疲労")
    },
    expect: [...magicOnly(2, "バインディングソーン"), "自分.B.疲労: false → true"],
})
scenario({
    name: "castle-疲労させる対象（個体指定）を付け替えないと、選んだ個体が疲労する",
    start: board([SOURCE]),
    steps(t) {
        cast(t, "A")
        t.act("me", { type: "resolveChoice" })
        assert(t.inst("A").isRested && !t.inst("B").isRested, "Aだけが疲労")
    },
    expect: [...magicOnly(2, "バインディングソーン"), "自分.A.疲労: false → true"],
})

console.log("=== 手札に戻す（個体指定） ===")
scenario({
    name: "castle-手札に戻す対象（個体指定）を付け替えると、付け替え先だけが手札に戻る",
    start: board([RIBBON]),
    steps(t) {
        const [a, b] = [t.id("A"), t.id("B")]
        cast(t, "A")
        t.act("me", { type: "resolveChoice", instanceId: b })
        assert(onField(t, a) && !onField(t, b), "Bだけが場を離れる")
    },
    expect: [...magicOnly(4, "ドリームリボン"), "自分.B.場所: フィールド → なし", "自分.リザーブ: 10 → 13", "自分.手札: なし → アイバーン"],
})

console.log("=== デッキの下に戻す（個体指定） ===")
scenario({
    name: "castle-デッキに戻す対象（個体指定）を付け替えると、付け替え先だけが戻る",
    start: board([BOLT]),
    steps(t) {
        const [a, b] = [t.id("A"), t.id("B")]
        cast(t, "A")
        t.act("me", { type: "resolveChoice", instanceId: b })
        assert(onField(t, a) && !onField(t, b), "Bだけが場を離れる")
    },
    expect: [...magicOnly(6, "光速三段突"), "自分.B.場所: フィールド → なし", "自分.デッキ枚数: 40 → 41", "自分.リザーブ: 10 → 13"],
})

console.log("=== 破壊（個体指定） ===")
scenario({
    name: "castle-破壊する対象（個体指定）を付け替えると、付け替え先だけが破壊される",
    start: board([GAST]),
    steps(t) {
        const [a, b] = [t.id("A"), t.id("B")]
        cast(t, "A")
        t.act("me", { type: "resolveChoice", instanceId: b })
        assert(onField(t, a) && !onField(t, b), "Bだけが場を離れる")
    },
    expect: [
        "相手.手札: フレイムガスト → なし", "相手.トラッシュ: なし → フレイムガスト", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 5",
        "自分.B.場所: フィールド → なし", "自分.トラッシュ: なし → アイバーン", "自分.リザーブ: 10 → 13",
    ],
})

console.log("=== BP- ===")
scenario({
    name: "castle-BP-する対象を付け替えると、付け替え先だけがBP-される",
    start: board([PRESSURE]),
    steps(t) {
        cast(t, "A")
        t.act("me", { type: "resolveChoice", instanceId: t.id("B") })
    },
    expect: [...magicOnly(3, "エンジェリックプレッシャー"), "自分.B.BP: 2000 → 0"],
})
scenario({
    name: "castle-BP-する対象を付け替えないと、選んだ個体がBP-される",
    start: board([PRESSURE]),
    steps(t) {
        cast(t, "A")
        t.act("me", { type: "resolveChoice" })
    },
    expect: [...magicOnly(3, "エンジェリックプレッシャー"), "自分.A.BP: 2000 → 0"],
})

console.log("=== 疲労させてブロックさせる ===")
const PANIC = "BS18-082" // パニックヴォイス（黄マジック・コスト7・フラッシュ：アタックしていない相手のスピリット1体を疲労させ、そのスピリットでブロックさせる）
assert(getCard(PANIC).name === "パニックヴォイス" && getCard(PANIC).cost === 7 && getCard(PANIC).type === "magic", "BS18-082はパニックヴォイス（magic・コスト7）")
scenario({
    name: "castle-ブロックさせる相手を付け替えると、付け替え先が疲労してブロックを宣言する",
    start: {
        turn: "me", phase: "attack", interactive: true,
        me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: IBARN, label: "A", cores: 3 }, { card: IBARN, label: "B", cores: 1 }, { card: IBARN, label: "C", cores: 1 }] },
        opp: { hand: [PANIC], spirits: [{ card: IBARN, label: "U", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("A") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.act("opp", { type: "resolveChoice", instanceId: t.id("B") })
        t.act("me", { type: "resolveChoice", instanceId: t.id("C") })
        assert(!t.inst("B").isRested && t.inst("C").isRested, "付け替え先のCだけが疲労")
        assert(t.state.battle?.forcedBlockerInstanceId === t.id("C"), "Cがブロックを宣言する")
    },
    expect: [...magicOnly(7, "パニックヴォイス"), "自分.A.疲労: false → true", "自分.C.疲労: false → true"],
})


console.log("=== 回復できなくする指定 ===")
const SKULD = "BS02-042" // スクルディア（白・コスト4・Lv2：このスピリットが疲労したとき、相手の疲労状態のスピリット1体を回復できなくする）
assert(getCard(SKULD).name === "スクルディア" && getCard(SKULD).cost === 4 && getCard(SKULD).type === "spirit", "BS02-042はスクルディア（spirit・コスト4）")
scenario({
    name: "castle-回復できなくする対象を付け替えると、付け替え先が指定される",
    start: {
        turn: "opp", phase: "attack", interactive: true,
        me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: IBARN, label: "A", cores: 1, rested: true }, { card: IBARN, label: "B", cores: 1, rested: true }] },
        opp: { spirits: [{ card: SKULD, label: "S", cores: 3 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("S") })
        t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        t.act("me", { type: "resolveChoice", instanceId: t.id("B") })
        assert(t.inst("S").noRefreshTargetInstanceId === t.id("B"), "Bが指定される")
    },
    expect: ["相手.S.疲労: false → true"],
})


console.log("=== 疲労（スピリット／ネクサス） ===")
const KRAKEN = "BS10-018" // エル・クラーケン（紫・コスト5・Lv1・2：破壊されたとき、相手のスピリット／ネクサスを3つまで疲労させる）
assert(getCard(KRAKEN).name === "エル・クラーケン" && getCard(KRAKEN).cost === 5 && getCard(KRAKEN).type === "spirit", "BS10-018はエル・クラーケン（spirit・コスト5）")
scenario({
    name: "castle-スピリット／ネクサスを疲労させる対象を付け替えると、付け替え先が疲労する",
    start: {
        turn: "opp", phase: "attack", interactive: true,
        me: { hand: [GAST], nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: IBARN, label: "A", cores: 3 }, { card: IBARN, label: "B", cores: 3 }] },
        opp: { spirits: [{ card: KRAKEN, label: "K", cores: 3 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("K") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("K") })
        t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        t.act("me", { type: "resolveChoice", instanceId: t.id("B") })
        assert(!t.inst("A").isRested && t.inst("B").isRested, "付け替え先のBが疲労")
        t.act("opp", { type: "resolveChoice" })
    },
    expect: [
        "相手.K.場所: フィールド → なし", "相手.トラッシュ: なし → エル・クラーケン", "相手.リザーブ: 10 → 13", "自分.B.疲労: false → true",
        "自分.トラッシュ: なし → フレイムガスト", "自分.トラッシュのコア: 0 → 4", "自分.リザーブ: 10 → 6", "自分.手札: フレイムガスト → なし",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part1008）")
