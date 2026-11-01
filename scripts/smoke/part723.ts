// smoke パート723（プロモ 青の組：P009 プロト・ゴレム／P012 三叉槍のヒューゴー／P027 巨人皇子アレクサンダー4世／P058 狼人イゾウルフ／PX06 異海王ダ・ゴン。期待値役が効果文だけから書いた場面テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string, string, number][] = [
        ["P009", "プロト・ゴレム", "spirit", 2],
        ["P012", "三叉槍のヒューゴー", "spirit", 4],
        ["P027", "巨人皇子アレクサンダー4世", "spirit", 5],
        ["P058", "狼人イゾウルフ", "spirit", 4],
        ["PX06", "異海王ダ・ゴン", "spirit", 8],
        ["BS01-002", "ロクケラトプス", "spirit", 1], // 赤・Lv1でBP1000
        ["SD01-002", "カタナカサゴ", "spirit", 1], // 赤・Lv1でBP2000
        ["BS01-031", "デス・ハーデス", "spirit", 3], // 紫・Lv1でBP4000
        ["BS01-058", "ヘラクレス・ジオ", "spirit", 3], // 緑・Lv1でBP4000
        ["BS03-042", "海獣ジューゴン", "spirit", 4], // 白・Lv1でBP3000
        ["BS02-046", "ウィンガル", "spirit", 6], // 白・山札の詰め物
        ["BS14-090", "勇壮なる船上都市", "nexus", 5], // 青・コスト5・疲労させられるネクサス
    ]
    for (const [id, name, type, cost] of expect) {
        const c = getCard(id)
        assert(c.name === name && c.type === type && c.cost === cost, `${id} は ${name}(${type}・コスト${cost})`)
    }
    assert(getCard("P009").levels[0]?.bp === 2000 && getCard("SD01-002").levels[0]?.bp === 2000, "P009 と SD01-002 はLv1でBP2000")
    assert(getCard("BS01-002").levels[0]?.bp === 1000 && getCard("BS01-031").levels[0]?.bp === 4000, "脇役のBP")
    assert(getCard("P012").levels[2]?.cores === 6 && getCard("P012").levels[2]?.bp === 7000, "P012 のLv3はコア6・BP7000")
    assert(getCard("P027").levels[1]?.cores === 4 && getCard("PX06").levels[1]?.cores === 4, "P027・PX06 のLv2はコア4")
}

const FILL = Array.from({ length: 40 }, () => "BS02-046") // 山札の詰め物（トラッシュで見分けるため）

function settle(t: ScenarioCtx, attacker: Side): void {
    const defender: Side = attacker === "me" ? "opp" : "me"
    t.act(defender, { type: "pass" })
    t.act(attacker, { type: "pass" })
}

console.log("=== P009 / BP比較で相手のスピリットだけを破壊 → 相手の山札を1枚破棄 ===")
scenario({
    name: "P009-相手だけ破壊",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "P009", cores: 1 }] },
        opp: { deck: FILL, spirits: [{ card: "BS01-002", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("プロト・ゴレム") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.プロト・ゴレム.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → ウィンガル、ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
    ],
})

console.log("=== P009 / 相打ち（自分も破壊された）なら破棄しない ===")
scenario({
    name: "P009-相打ち",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "P009", cores: 1 }] },
        opp: { deck: FILL, spirits: [{ card: "SD01-002", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("プロト・ゴレム") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("カタナカサゴ") })
        t.closeFlash()
    },
    expect: [
        "自分.プロト・ゴレム.場所: フィールド → なし",
        "自分.リザーブ: 10 → 11",
        "自分.トラッシュ: なし → プロト・ゴレム",
        "相手.カタナカサゴ.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → カタナカサゴ",
    ],
})

console.log("=== P009 / ブロックされず相手のスピリットを破壊していないなら破棄しない ===")
scenario({
    name: "P009-ブロックなし",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "P009", cores: 1 }] },
        opp: { deck: FILL },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("プロト・ゴレム") })
        settle(t, "me")
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.プロト・ゴレム.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== P012 / Lv1（コア1）：アタック時、相手の山札を1枚破棄 ===")
scenario({
    name: "P012-Lv1",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "P012", cores: 1 }] },
        opp: { deck: FILL },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("三叉槍のヒューゴー") })
        settle(t, "me")
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.三叉槍のヒューゴー.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュ: なし → ウィンガル",
    ],
})

console.log("=== P012 / Lv3（コア6）：Lvと同じ3枚破棄 ===")
scenario({
    name: "P012-Lv3",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "P012", cores: 6 }] },
        opp: { deck: FILL },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("三叉槍のヒューゴー") })
        settle(t, "me")
        t.act("opp", { type: "takeLife" })
    },
    // 効果文は【粉砕】の説明そのもの。破棄はアタックにつき1回、Lvの枚数だけ（二重に破棄しない）
    expect: [
        "自分.三叉槍のヒューゴー.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "相手.デッキ枚数: 40 → 37",
        "相手.トラッシュ: なし → ウィンガル、ウィンガル、ウィンガル",
    ],
})

console.log("=== P027 / 【強襲：1】：ネクサスを疲労させてこのスピリットを回復 ===")
scenario({
    name: "P027-強襲",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "P027", cores: 1 }], nexuses: [{ card: "BS14-090", cores: 1 }] },
        opp: {},
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("巨人皇子アレクサンダー4世") })
    },
    expect: ["自分.勇壮なる船上都市.疲労: false → true"],
})

console.log("=== P027 / ネクサスが無ければ回復できず疲労したまま ===")
scenario({
    name: "P027-強襲-ネクサスなし",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "P027", cores: 1 }] },
        opp: {},
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("巨人皇子アレクサンダー4世") })
    },
    expect: ["自分.巨人皇子アレクサンダー4世.疲労: false → true"],
})

console.log("=== P027 / Lv2：アタック時、コスト3以下の相手スピリット1体を破壊（コスト4は壊さない） ===")
scenario({
    name: "P027-Lv2破壊",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "P027", cores: 4 }] },
        opp: { spirits: [{ card: "BS01-031", cores: 1 }, { card: "BS03-042", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("巨人皇子アレクサンダー4世") })
    },
    expect: [
        "自分.巨人皇子アレクサンダー4世.疲労: false → true",
        "相手.デス・ハーデス.場所: フィールド → なし",
        "相手.トラッシュ: なし → デス・ハーデス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== P027 / Lv1では破壊しない（コア1） ===")
scenario({
    name: "P027-Lv1は破壊なし",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "P027", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-031", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("巨人皇子アレクサンダー4世") })
    },
    expect: ["自分.巨人皇子アレクサンダー4世.疲労: false → true"],
})

console.log("=== P058 / 召喚時：指定した自分のスピリットと同じコストの相手スピリット1体を破壊（コスト3指定→コスト3だけ） ===")
scenario({
    name: "P058-召喚時",
    start: {
        interactive: true,
        me: { hand: ["P058"], reserve: 10, spirits: [{ card: "BS01-058", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-031", cores: 1 }, { card: "BS03-042", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "resolveChoice", instanceId: t.id("ヘラクレス・ジオ") }) // 相手側の候補はコスト3の1体だけなので選択は出ない
    },
    expect: [
        "自分.手札: 狼人イゾウルフ → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.狼人イゾウルフ.場所: なし → フィールド",
        "自分.狼人イゾウルフ.疲労: なし → false",
        "自分.狼人イゾウルフ.コア: なし → 1",
        "自分.狼人イゾウルフ.Lv: なし → 1",
        "自分.狼人イゾウルフ.BP: なし → 3000",
        "相手.デス・ハーデス.場所: フィールド → なし",
        "相手.トラッシュ: なし → デス・ハーデス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== P058 / 同じコストの相手スピリットがいなければ何も壊れない ===")
scenario({
    name: "P058-同コストなし",
    start: {
        interactive: true,
        me: { hand: ["P058"], reserve: 10, spirits: [{ card: "BS01-058", cores: 1 }] },
        opp: { spirits: [{ card: "BS03-042", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "resolveChoice", instanceId: t.id("ヘラクレス・ジオ") })
    },
    expect: [
        "自分.手札: 狼人イゾウルフ → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.狼人イゾウルフ.場所: なし → フィールド",
        "自分.狼人イゾウルフ.疲労: なし → false",
        "自分.狼人イゾウルフ.コア: なし → 1",
        "自分.狼人イゾウルフ.Lv: なし → 1",
        "自分.狼人イゾウルフ.BP: なし → 3000",
    ],
})

console.log("=== P058 / Lv2：自分のネクサスが配置されたとき、コスト3以下の相手スピリット1体を破壊 ===")
scenario({
    name: "P058-Lv2ネクサス配置",
    start: {
        me: { hand: ["BS14-090"], reserve: 10, spirits: [{ card: "P058", cores: 4 }] },
        opp: { spirits: [{ card: "BS01-031", cores: 1 }, { card: "BS03-042", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "setNexus", handIndex: 0 })
    },
    expect: [
        "自分.手札: 勇壮なる船上都市 → なし",
        "自分.リザーブ: 10 → 6", // コスト5を青シンボル(P058)の軽減1で4払う
        "自分.トラッシュのコア: 0 → 4",
        "自分.勇壮なる船上都市.場所: なし → ネクサス",
        "自分.勇壮なる船上都市.疲労: なし → false",
        "自分.勇壮なる船上都市.コア: なし → 0",
        "自分.勇壮なる船上都市.Lv: なし → 1",
        "相手.デス・ハーデス.場所: フィールド → なし",
        "相手.トラッシュ: なし → デス・ハーデス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== P058 / Lv1（コア1）ではネクサス配置で破壊しない ===")
scenario({
    name: "P058-Lv1ネクサス配置",
    start: {
        me: { hand: ["BS14-090"], reserve: 10, spirits: [{ card: "P058", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-031", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "setNexus", handIndex: 0 })
    },
    expect: [
        "自分.手札: 勇壮なる船上都市 → なし",
        "自分.リザーブ: 10 → 6", // コスト5を青シンボル(P058)の軽減1で4払う
        "自分.トラッシュのコア: 0 → 4",
        "自分.勇壮なる船上都市.場所: なし → ネクサス",
        "自分.勇壮なる船上都市.疲労: なし → false",
        "自分.勇壮なる船上都市.コア: なし → 0",
        "自分.勇壮なる船上都市.Lv: なし → 1",
    ],
})

console.log("=== PX06 / 召喚時：コスト3以下のスピリットすべて（お互い）を破壊、破壊した1体につき相手の山札を2枚破棄 ===")
scenario({
    name: "PX06-召喚時",
    start: {
        me: { hand: ["PX06"], reserve: 10, spirits: [{ card: "BS01-002", cores: 1 }] },
        opp: { deck: FILL, spirits: [{ card: "BS01-002", label: "相手ロク", cores: 1 }, { card: "BS01-031", cores: 1 }, { card: "BS03-042", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    // 自分1体＋相手2体の計3体が破壊され、6枚破棄。コスト4のジューゴンは残る
    expect: [
        "自分.手札: 異海王ダ・ゴン → なし",
        "自分.リザーブ: 10 → 2", // コスト8＋スピリットに1個、破壊した自分のロクケラトプスのコア1個が戻る
        "自分.トラッシュのコア: 0 → 8",
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.異海王ダ・ゴン.場所: なし → フィールド",
        "自分.異海王ダ・ゴン.疲労: なし → false",
        "自分.異海王ダ・ゴン.コア: なし → 1",
        "自分.異海王ダ・ゴン.Lv: なし → 1",
        "自分.異海王ダ・ゴン.BP: なし → 6000",
        "相手.相手ロク.場所: フィールド → なし",
        "相手.デス・ハーデス.場所: フィールド → なし",
        "相手.リザーブ: 10 → 12",
        "相手.デッキ枚数: 40 → 34",
        "相手.トラッシュ: なし → ウィンガル、ウィンガル、ウィンガル、ウィンガル、ウィンガル、ウィンガル、デス・ハーデス、ロクケラトプス",
    ],
})

console.log("=== PX06 / 破壊するスピリットがいなければ破棄は0枚 ===")
scenario({
    name: "PX06-対象なし",
    start: {
        me: { hand: ["PX06"], reserve: 10 },
        opp: { deck: FILL, spirits: [{ card: "BS03-042", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 異海王ダ・ゴン → なし",
        "自分.リザーブ: 10 → 1",
        "自分.トラッシュのコア: 0 → 8",
        "自分.異海王ダ・ゴン.場所: なし → フィールド",
        "自分.異海王ダ・ゴン.疲労: なし → false",
        "自分.異海王ダ・ゴン.コア: なし → 1",
        "自分.異海王ダ・ゴン.Lv: なし → 1",
        "自分.異海王ダ・ゴン.BP: なし → 6000",
    ],
})

console.log("=== PX06 / Lv2：アタック時、相手の山札を3枚破棄 ===")
scenario({
    name: "PX06-Lv2アタック",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "PX06", cores: 4 }] },
        opp: { deck: FILL },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("異海王ダ・ゴン") })
        settle(t, "me")
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.異海王ダ・ゴン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "相手.デッキ枚数: 40 → 37",
        "相手.トラッシュ: なし → ウィンガル、ウィンガル、ウィンガル",
    ],
})

console.log("=== PX06 / Lv2：ブロック時にも相手の山札を3枚破棄（バトル相手はアタックした側） ===")
scenario({
    name: "PX06-Lv2ブロック",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: "PX06", cores: 4 }] },
        opp: { deck: FILL, spirits: [{ card: "BS01-002", cores: 1 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        settle(t, "opp")
        t.act("me", { type: "block", instanceId: t.id("異海王ダ・ゴン") })
        t.closeFlash()
    },
    expect: [
        "自分.異海王ダ・ゴン.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "相手.デッキ枚数: 40 → 37",
        "相手.トラッシュ: なし → ウィンガル、ウィンガル、ウィンガル、ロクケラトプス",
    ],
})

console.log("=== PX06 / Lv1（コア1）ではバトル時に破棄しない ===")
scenario({
    name: "PX06-Lv1アタック",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "PX06", cores: 1 }] },
        opp: { deck: FILL },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("異海王ダ・ゴン") })
        settle(t, "me")
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.異海王ダ・ゴン.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("すべてのチェックに合格しました 🎉（part723）")
