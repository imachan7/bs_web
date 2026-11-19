// smoke パート1009（古の魔王城：個体指定の経路への付け替え。TARGET_REDIRECT.md §2.3 の 2c。Q23559・Q23560）
import { assert, getCard, timedHas } from "./helpers"
import { scenario } from "./scenario"

const CASTLE = "BSC05-017" // 古の魔王城
const CHANGING = "BS01-130" // チェンジングコア（紫マジック・コスト5・メイン：どちらかのスピリット1体のコアを1個残して別のスピリットへ移す）
const VENOM = "BS04-095" // ヴェノムショット（紫マジック・コスト5・メイン：相手のスピリット1体からコア1個をボイドへ）
const MIST = "BS04-101" // ミストカーテン（白マジック・コスト2・フラッシュ：相手のスピリット1体のアタックでは自分のライフが減らない）
const GASTON = "BS12-003" // 鎧竜人ガストン（赤スピリット・コスト3・破壊時：このスピリットのBP以下の相手のスピリット/ブレイヴ1つを破壊）
const IBARN = "BS01-005" // アイバーン（赤・コスト2・Lv1 BP2000・Lv2 BP6000）

console.log("=== 前提: カードの機械確認 ===")
for (const [id, name, cost, type] of [
    [CASTLE, "古の魔王城", 4, "nexus"], [CHANGING, "チェンジングコア", 5, "magic"], [VENOM, "ヴェノムショット", 5, "magic"],
    [MIST, "ミストカーテン", 2, "magic"], [GASTON, "鎧竜人ガストン", 3, "spirit"], [IBARN, "アイバーン", 2, "spirit"],
] as const) {
    assert(getCard(id).name === name && getCard(id).cost === cost && getCard(id).type === type, `${id}は${name}（${type}・コスト${cost}）`)
}

type T = Parameters<Parameters<typeof scenario>[0]["steps"]>[0]
const board = (hand: string[], phase: "main" | "attack" = "main") => ({
    turn: "opp" as const, phase, interactive: true,
    me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: IBARN, label: "A", cores: 3 }, { card: IBARN, label: "B", cores: 3 }] },
    opp: { hand, spirits: [{ card: IBARN, label: "U", cores: 3 }] },
})
const cores = (t: T, label: string): number => t.inst(label).cores

const magic = (cost: number, name: string): string[] => [
    `相手.手札: ${name} → なし`, `相手.トラッシュ: なし → ${name}`, `相手.リザーブ: 10 → ${10 - cost}`, `相手.トラッシュのコア: 0 → ${cost}`,
]

console.log("=== moveCoresLeavingOne ===")
scenario({
    name: "castle-コアを1個残して移す対象を付け替えると、付け替え先のコアが減る",
    start: board([CHANGING]),
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
        while (t.state.pendingChoice?.pid === t.opp) t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        const before = [cores(t, "A"), cores(t, "B")]
        t.act("me", { type: "resolveChoice", instanceId: t.id("B") })
        assert(cores(t, "B") === 1 && cores(t, "A") === before[0]! + before[1]! - 1, `付け替え先のBが1個になり、コアはAへ移る（A${before[0]} B${before[1]}）`)
    },
    expect: [...magic(5, "チェンジングコア"), "自分.A.BP: 2000 → 6000", "自分.A.Lv: 1 → 2", "自分.A.コア: 3 → 5", "自分.B.コア: 3 → 1"]
})
scenario({
    name: "castle-コアを移す対象を付け替えないと、選んだ個体のコアが減る",
    start: board([CHANGING]),
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
        while (t.state.pendingChoice?.pid === t.opp) t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
        t.act("me", { type: "resolveChoice" })
        assert(cores(t, "A") === 1 && cores(t, "B") === 5, "選んだAが1個になり、コアはBへ移る")
    },
    expect: [...magic(5, "チェンジングコア"), "自分.A.コア: 3 → 1", "自分.B.BP: 2000 → 6000", "自分.B.Lv: 1 → 2", "自分.B.コア: 3 → 5"]
})

console.log("=== negateLifeDamageFromTarget ===")
for (const redirect of [true, false]) {
    scenario({
        name: `castle-ライフを守る対象を${redirect ? "付け替えると、付け替え先だけが対象" : "付け替えないと、選んだ個体が対象"}`,
        start: board([MIST], "attack"),
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("U") })
            t.act("me", { type: "pass" })
            t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("A") })
            t.act("me", { type: "resolveChoice", ...(redirect ? { instanceId: t.id("B") } : {}) })
            const [hit, miss] = redirect ? ["B", "A"] : ["A", "B"]
            assert(timedHas(t.state, t.inst(hit!), "noLifeDamage") && !timedHas(t.state, t.inst(miss!), "noLifeDamage"), `${hit}だけにライフを減らさない記録が付く`)
        },
        expect: [...magic(2, "ミストカーテン"), "相手.U.疲労: false → true"]
    })
}

console.log("=== removeCores（1体を指定） ===")
for (const redirect of [true, false]) {
    scenario({
        name: `castle-コア除去の対象を${redirect ? "付け替えると、付け替え先のコアが減る" : "付け替えないと、選んだ個体のコアが減る"}`,
        start: board([VENOM]),
        steps(t) {
            t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
            if (t.state.pendingChoice?.pid === t.opp) t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
            t.act("me", { type: "resolveChoice", ...(redirect ? { instanceId: t.id("B") } : {}) })
            const [hit, miss] = redirect ? ["B", "A"] : ["A", "B"]
            assert(cores(t, hit!) === 2 && cores(t, miss!) === 3, `${hit}だけコアが1個減る`)
        },
        expect: [...magic(5, "ヴェノムショット"), `自分.${redirect ? "B" : "A"}.コア: 3 → 2`]
    })
}

console.log("=== removeOneOfAnyType ===")
const gaston = [
    "相手.G.場所: フィールド → なし", "相手.トラッシュ: なし → 鎧竜人ガストン", "相手.リザーブ: 10 → 11",
    "自分.C.疲労: false → true", "自分.トラッシュ: なし → アイバーン", "自分.リザーブ: 10 → 11",
]
for (const redirect of [true, false]) {
    scenario({
        name: `castle-スピリット/ブレイヴを破壊する対象を${redirect ? "付け替えると、付け替え先が破壊される" : "付け替えないと、選んだ個体が破壊される"}`,
        start: {
            turn: "opp", phase: "attack", interactive: true,
            me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: IBARN, label: "A", cores: 1 }, { card: IBARN, label: "B", cores: 1 }, { card: IBARN, label: "C", cores: 4 }] },
            opp: { spirits: [{ card: GASTON, label: "G", cores: 1 }] },
        },
        steps(t) {
            const ids = { A: t.id("A"), B: t.id("B") }
            t.act("opp", { type: "attack", instanceId: t.id("G") })
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id("C") })
            t.closeFlash()
            if (t.state.pendingChoice?.pid === t.opp) t.act("opp", { type: "resolveChoice", instanceId: t.id("A") })
            t.act("me", { type: "resolveChoice", ...(redirect ? { instanceId: t.id("B") } : {}) })
            const onField = (l: string): boolean => t.state.players[t.me].field.spirits.some((s) => s.instanceId === ids[l as "A" | "B"])
            const [gone, kept] = redirect ? ["B", "A"] : ["A", "B"]
            assert(!onField(gone!) && onField(kept!), `${gone}だけが破壊される`)
        },
        expect: [...gaston, `自分.${redirect ? "B" : "A"}.場所: フィールド → なし`]
    })
}
console.log("すべてのチェックに合格しました 🎉（part1009）")
