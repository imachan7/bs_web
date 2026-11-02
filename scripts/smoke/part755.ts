// smoke パート755（SD11 白：SD11-012〜016・X01・X02 の場面テスト）
// 期待値役が効果文と属性だけから書いた。effects は未実装なので落ちてよい（例外で止まらないこと）。
// 参照：docs/design/STARTER_PLAN.md §2・BS19_PLAN.md §2（連鎖）・SEMANTICS_AUDIT §3.20（耐性は対象に選べない）
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

console.log("=== 前提: カードの機械確認 ===")
{
    const C = (id: string) => getCard(id)
    // 主役7枚
    assert(C("SD11-012").name === "氷刃の地底湖" && C("SD11-012").type === "nexus" && C("SD11-012").colors.join() === "white" && C("SD11-012").cost === 3, "SD11-012は白コスト3のネクサス")
    assert(C("SD11-013").name === "迷子水晶" && C("SD11-013").type === "nexus" && C("SD11-013").colors.join() === "white" && C("SD11-013").cost === 4, "SD11-013は白コスト4のネクサス")
    assert(C("SD11-014").name === "ウィンドウォール" && C("SD11-014").type === "magic" && C("SD11-014").colors.join() === "white" && C("SD11-014").cost === 4, "SD11-014は白コスト4のマジック")
    assert(C("SD11-015").name === "ドリームホライゾン" && C("SD11-015").type === "magic" && C("SD11-015").colors.join() === "white" && C("SD11-015").cost === 4, "SD11-015は白コスト4のマジック")
    assert(C("SD11-016").name === "バーストブレイク" && C("SD11-016").type === "magic" && C("SD11-016").colors.join() === "white" && C("SD11-016").cost === 5, "SD11-016は白コスト5のマジック")
    assert(C("SD11-X01").name === "闇皇ナインテイル・ダーク" && C("SD11-X01").type === "spirit" && C("SD11-X01").colors.join() === "white" && C("SD11-X01").cost === 6 && (C("SD11-X01").family ?? []).includes("機獣"), "SD11-X01は白コスト6の機獣")
    assert(C("SD11-X02").name === "白夜の宝剣ミッドナイト・サン" && C("SD11-X02").type === "brave" && C("SD11-X02").colors.join() === "white" && C("SD11-X02").cost === 6 && (C("SD11-X02").family ?? []).includes("剣刃"), "SD11-X02は白コスト6の剣刃ブレイヴ")
    // 脇役
    assert(C("BS01-002").name === "ロクケラトプス" && C("BS01-002").cost === 1 && C("BS01-002").colors.join() === "red" && (C("BS01-002").family ?? []).join() === "地竜", "BS01-002は赤コスト1のバニラ")
    assert(C("BS10-031").name === "ジャンガリー" && C("BS10-031").colors.join() === "white" && (C("BS10-031").family ?? []).includes("機獣"), "BS10-031は白の機獣バニラ")
    assert(C("BS01-074").name === "バーサーカー・ガン" && C("BS01-074").colors.join() === "white" && !(C("BS01-074").family ?? []).includes("機獣"), "BS01-074は白の非機獣バニラ")
    assert(C("BS01-051").name === "フライングミラージュ" && C("BS01-051").colors.join() === "green" && C("BS01-051").symbol.join() === "green", "BS01-051は緑シンボルのバニラ")
    assert(C("BS05-045").name === "ドワッフー・セブン" && C("BS05-045").cost === 7 && C("BS05-045").colors.join() === "yellow", "BS05-045はコスト7のバニラ")
    assert(C("SD16-X01").name === "巨人帝王アレクサンダー13世" && C("SD16-X01").cost === 7 && C("SD16-X01").colors.join() === "blue", "SD16-X01はコスト7のバニラ")
    assert(C("BS01-114").name === "バスタースピア" && C("BS01-114").type === "magic" && C("BS01-114").colors.join() === "red" && C("BS01-114").cost === 3, "BS01-114は赤コスト3のマジック")
    assert(C("BS01-121").name === "フレイムダンス" && C("BS01-121").type === "magic" && C("BS01-121").colors.join() === "red" && C("BS01-121").cost === 5, "BS01-121は赤コスト5のマジック")
    assert(C("BS01-134").name === "バインディングソーン" && C("BS01-134").type === "magic" && C("BS01-134").colors.join() === "green" && C("BS01-134").cost === 2, "BS01-134は緑コスト2のマジック")
    assert(C("SD06-015").name === "覇王爆炎撃" && C("SD06-015").type === "magic" && C("SD06-015").colors.join() === "red", "SD06-015は赤のバースト付きマジック")
}

console.log("=== SD11-012 氷刃の地底湖 ===")
// 節1（Lv1･Lv2『相手のアタックステップ』機獣すべてBP+2000）：起きる場面
scenario({
    name: "sd11-012-a1",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "BS10-031" }], nexuses: [{ card: "SD11-012", cores: 1 }] }, opp: { spirits: [{ card: "BS01-002" }] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        // フラッシュ①を開いたまま、相手アタックステップ中のBPを写像で見る
    },
    expect: ["相手.ロクケラトプス.疲労: false → true", "自分.ジャンガリー.BP: 2000 → 4000"],
})
// 節1：起きない場面（機獣でないスピリットには乗らない）
scenario({
    name: "sd11-012-a1x",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "BS01-074" }], nexuses: [{ card: "SD11-012", cores: 1 }] }, opp: { spirits: [{ card: "BS01-002" }] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
    },
    expect: ["相手.ロクケラトプス.疲労: false → true"],
})
// 節2（Lv2：機獣がブロックしたときボイドからコア1個）：起きる場面
scenario({
    name: "sd11-012-a2",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "BS10-031" }], nexuses: [{ card: "SD11-012", cores: 1 }] }, opp: { spirits: [{ card: "BS01-002" }] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ジャンガリー") })
        t.closeFlash()
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "自分.ジャンガリー.疲労: false → true",
        "自分.ジャンガリー.コア: 1 → 2",
        "自分.ジャンガリー.BP: 2000 → 4000",
    ],
})
// 節2：起きない場面（ネクサスがLv1）
scenario({
    name: "sd11-012-a2x",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "BS10-031" }], nexuses: [{ card: "SD11-012", cores: 0 }] }, opp: { spirits: [{ card: "BS01-002" }] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ジャンガリー") })
        t.closeFlash()
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "自分.ジャンガリー.疲労: false → true",
        "自分.ジャンガリー.BP: 2000 → 4000",
    ],
})

console.log("=== SD11-013 迷子水晶 ===")
// 節1（『このネクサスの破壊時』手札の白のスピリット1枚をコストを支払わずに召喚できる）：起きる場面
scenario({
    name: "sd11-013-d1",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: "BS01-002" }], nexuses: [{ card: "SD11-013", cores: 0 }], hand: ["BS10-031"] },
        opp: { hand: ["BS01-114"] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.迷子水晶.場所: ネクサス → なし",
        "自分.トラッシュ: なし → 迷子水晶",
        "自分.手札: ジャンガリー → なし",
        "自分.ジャンガリー.場所: なし → フィールド",
        "自分.ジャンガリー.疲労: なし → false",
        "自分.ジャンガリー.コア: なし → 1",
        "自分.ジャンガリー.Lv: なし → 1",
        "自分.ジャンガリー.BP: なし → 2000",
        "自分.リザーブ: 10 → 9",
        "自分.ロクケラトプス.疲労: false → true",
        "相手.手札: バスタースピア → なし",
        "相手.トラッシュ: なし → バスタースピア",
        "相手.トラッシュのコア: 0 → 3",
        "相手.リザーブ: 10 → 8",
        "相手.ライフ: 5 → 4",
    ],
})
// 節1：起きない場面（手札に白のスピリットカードがない）
scenario({
    name: "sd11-013-d1x",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: "BS01-002" }], nexuses: [{ card: "SD11-013", cores: 0 }], hand: ["BS01-051"] },
        opp: { hand: ["BS01-114"] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.迷子水晶.場所: ネクサス → なし",
        "自分.トラッシュ: なし → 迷子水晶",
        "自分.ロクケラトプス.疲労: false → true",
        "相手.手札: バスタースピア → なし",
        "相手.トラッシュ: なし → バスタースピア",
        "相手.トラッシュのコア: 0 → 3",
        "相手.リザーブ: 10 → 8",
        "相手.ライフ: 5 → 4",
    ],
})
// 節2（Lv2：機獣すべてに【重装甲：赤】を与える）：起きる場面（赤マジックの対象に選べない）
scenario({
    name: "sd11-013-a2",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: "BS01-002" }, { card: "BS10-031" }], nexuses: [{ card: "SD11-013", cores: 2 }] },
        opp: { hand: ["BS01-121"] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ジャンガリー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ロクケラトプス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
// 節2：起きない場面（ネクサスがLv1）
scenario({
    name: "sd11-013-a2x",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: "BS01-002" }, { card: "BS10-031" }], nexuses: [{ card: "SD11-013", cores: 1 }] },
        opp: { hand: ["BS01-121"] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ジャンガリー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ジャンガリー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ジャンガリー",
        "自分.リザーブ: 10 → 11",
        "自分.ロクケラトプス.疲労: false → true",
        "相手.手札: フレイムダンス → なし",
        "相手.トラッシュ: なし → フレイムダンス",
        "相手.トラッシュのコア: 0 → 5",
        "相手.リザーブ: 10 → 6",
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== SD11-014 ウィンドウォール ===")
// 節1（フラッシュ：このバトルが終了したときアタックステップを終了する）：起きる場面
scenario({
    name: "sd11-014-f1",
    start: { turn: "opp", phase: "attack", me: { hand: ["SD11-014"] }, opp: { spirits: [{ card: "BS01-002", label: "A" }, { card: "BS01-002", label: "B" }] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("A") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        // アタックステップが終わっているので、2体目では攻撃できない
        t.actRejected("opp", { type: "attack", instanceId: t.id("B") })
    },
    expect: [
        "相手.A.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 7",
        "自分.手札: ウィンドウォール → なし",
        "自分.トラッシュ: なし → ウィンドウォール",
        "自分.トラッシュのコア: 0 → 4",
    ],
})
// 節2（【連鎖：条件《緑シンボル》】[緑]：相手のスピリット1体を疲労させる）：起きる場面
scenario({
    name: "sd11-014-ren",
    start: {
        turn: "opp", phase: "attack", interactive: true,
        me: { spirits: [{ card: "BS01-051" }], hand: ["SD11-014"] },
        opp: { spirits: [{ card: "BS01-002", label: "A" }, { card: "BS01-002", label: "B" }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("A") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        const p = t.state.pendingChoice
        assert(p !== null && p.pid === t.me, "連鎖の疲労対象の選択待ちが出る")
        if (p !== null) t.act("me", { type: "resolveChoice", instanceId: t.id("B") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.A.疲労: false → true",
        "相手.B.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 7",
        "自分.手札: ウィンドウォール → なし",
        "自分.トラッシュ: なし → ウィンドウォール",
        "自分.トラッシュのコア: 0 → 4",
    ],
})
// 節2：起きない場面（自分の緑シンボルがない）
scenario({
    name: "sd11-014-renx",
    start: { turn: "opp", phase: "attack", me: { hand: ["SD11-014"] }, opp: { spirits: [{ card: "BS01-002", label: "A" }, { card: "BS01-002", label: "B" }] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("A") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.A.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 7",
        "自分.手札: ウィンドウォール → なし",
        "自分.トラッシュ: なし → ウィンドウォール",
        "自分.トラッシュのコア: 0 → 4",
    ],
})

console.log("=== SD11-015 ドリームホライゾン ===")
// 節1（フラッシュ：相手のスピリット1体を手札に戻す）：起きる場面
scenario({
    name: "sd11-015-f1",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: "BS01-002" }], hand: ["SD11-015"] },
        opp: { spirits: [{ card: "BS01-002", label: "C", rested: true }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("C") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.C.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
        "自分.ロクケラトプス.疲労: false → true",
        "自分.リザーブ: 10 → 6",
        "自分.手札: ドリームホライゾン → なし",
        "自分.トラッシュ: なし → ドリームホライゾン",
        "自分.トラッシュのコア: 0 → 4",
    ],
})
// 節2（【連鎖：条件《緑シンボル》】[緑]：自分の白のスピリット1体を回復させる）：起きる場面
scenario({
    name: "sd11-015-ren",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: "BS01-002" }, { card: "BS10-031", rested: true }, { card: "BS01-051" }], hand: ["SD11-015"] },
        opp: { spirits: [{ card: "BS01-002", label: "C", rested: true }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("C") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.C.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
        "自分.ジャンガリー.疲労: true → false",
        "自分.ロクケラトプス.疲労: false → true",
        "自分.リザーブ: 10 → 7",
        "自分.手札: ドリームホライゾン → なし",
        "自分.トラッシュ: なし → ドリームホライゾン",
        "自分.トラッシュのコア: 0 → 3",
    ],
})
// 節2：起きない場面（自分の緑シンボルがない）
scenario({
    name: "sd11-015-renx",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: "BS01-002" }, { card: "BS10-031", rested: true }], hand: ["SD11-015"] },
        opp: { spirits: [{ card: "BS01-002", label: "C", rested: true }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("C") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.C.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
        "自分.ロクケラトプス.疲労: false → true",
        "自分.リザーブ: 10 → 7",
        "自分.手札: ドリームホライゾン → なし",
        "自分.トラッシュ: なし → ドリームホライゾン",
        "自分.トラッシュのコア: 0 → 3",
    ],
})

console.log("=== SD11-016 バーストブレイク ===")
// 節1（フラッシュ：BP合計5000まで相手のスピリットを好きなだけ手札に戻す）：起きる場面
scenario({
    name: "sd11-016-m1",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: "BS01-002" }], hand: ["SD11-016"] },
        opp: { spirits: [{ card: "BS01-002", label: "C1", rested: true }, { card: "BS01-002", label: "C2", cores: 2, rested: true }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.C1.場所: フィールド → なし",
        "相手.C2.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス、ロクケラトプス",
        "相手.リザーブ: 10 → 14",
        "相手.ライフ: 5 → 4",
        "自分.ロクケラトプス.疲労: false → true",
        "自分.リザーブ: 10 → 5",
        "自分.手札: バーストブレイク → なし",
        "自分.トラッシュ: なし → バーストブレイク",
        "自分.トラッシュのコア: 0 → 5",
    ],
})
// 節1（または、相手のバースト1つを破棄する）：起きる場面
scenario({
    name: "sd11-016-m2",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: "BS01-002" }], hand: ["SD11-016"] },
        opp: { burst: "SD06-015" },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.バースト: 覇王爆炎撃 → なし",
        "相手.トラッシュ: なし → 覇王爆炎撃",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.ロクケラトプス.疲労: false → true",
        "自分.リザーブ: 10 → 5",
        "自分.手札: バーストブレイク → なし",
        "自分.トラッシュ: なし → バーストブレイク",
        "自分.トラッシュのコア: 0 → 5",
    ],
})
// 節2（この効果は、メインステップで使えない）：起きない場面
scenario({
    name: "sd11-016-main",
    start: { turn: "me", phase: "main", me: { hand: ["SD11-016"] }, opp: { spirits: [{ card: "BS01-002" }], burst: "SD06-015" } },
    steps: (t) => {
        t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [],
})

console.log("=== SD11-X01 闇皇ナインテイル・ダーク ===")
// 節1（Lv1〜3『ブロック時』BPを比べ勝ったら回復しBP+3000）：起きる場面
scenario({
    name: "sd11-x01-b1",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "SD11-X01", cores: 1 }] }, opp: { spirits: [{ card: "BS01-002", cores: 2 }] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("闇皇ナインテイル・ダーク") })
        t.closeFlash()
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "自分.闇皇ナインテイル・ダーク.BP: 5000 → 8000",
    ],
})
// 節1：起きない場面（BPを比べで負ける）
scenario({
    name: "sd11-x01-b1x",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "SD11-X01", cores: 1 }] }, opp: { spirits: [{ card: "SD16-X01", cores: 1 }] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("巨人帝王アレクサンダー13世") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("闇皇ナインテイル・ダーク") })
        t.closeFlash()
    },
    expect: [
        "自分.闇皇ナインテイル・ダーク.場所: フィールド → なし",
        "自分.トラッシュ: なし → 闇皇ナインテイル・ダーク",
        "自分.リザーブ: 10 → 11",
        "相手.巨人帝王アレクサンダー13世.疲労: false → true",
    ],
})
// 節2（Lv3『バトル時』コスト6以下の相手のスピリット1体を手札に戻す）：起きる場面
scenario({
    name: "sd11-x01-b2",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: "SD11-X01", cores: 4 }] }, opp: { spirits: [{ card: "BS01-002", rested: true }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("闇皇ナインテイル・ダーク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
        "自分.闇皇ナインテイル・ダーク.疲労: false → true",
    ],
})
// 節2：起きない場面（相手のスピリットがコスト7）
scenario({
    name: "sd11-x01-b2x",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: "SD11-X01", cores: 4 }] }, opp: { spirits: [{ card: "BS05-045", rested: true }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("闇皇ナインテイル・ダーク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.闇皇ナインテイル・ダーク.疲労: false → true",
    ],
})
// 節3（【連鎖：条件《緑シンボル》】[緑]：相手のスピリット1体を疲労させる）：起きる場面
// （連鎖元のバトル時の対象がいなくても、連鎖は条件を満たせば発揮する：Q773）
scenario({
    name: "sd11-x01-ren",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: "SD11-X01", cores: 4 }, { card: "BS01-051" }] },
        opp: { spirits: [{ card: "BS01-002", rested: true }, { card: "BS05-045", label: "B" }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("闇皇ナインテイル・ダーク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
        "相手.B.疲労: false → true",
        "自分.闇皇ナインテイル・ダーク.疲労: false → true",
    ],
})
// 節3：起きない場面（自分の緑シンボルがない）
scenario({
    name: "sd11-x01-renx",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: "SD11-X01", cores: 4 }] },
        opp: { spirits: [{ card: "BS01-002", rested: true }, { card: "BS05-045", label: "B" }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("闇皇ナインテイル・ダーク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
        "自分.闇皇ナインテイル・ダーク.疲労: false → true",
    ],
})

console.log("=== SD11-X02 白夜の宝剣ミッドナイト・サン ===")
// 節1（【合体時】【重装甲：緑/白/黄/青】）：起きる場面（緑マジックの対象に選べない）
scenario({
    name: "sd11-x02-armor",
    start: { turn: "me", phase: "main", me: { spirits: [{ card: "SD11-X01", cores: 4 }], hand: ["SD11-X02"] }, opp: { hand: ["BS01-134"] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("闇皇ナインテイル・ダーク") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("闇皇ナインテイル・ダーク") })
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("闇皇ナインテイル・ダーク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 5",
        "自分.手札: 白夜の宝剣ミッドナイト・サン → なし",
        "自分.闇皇ナインテイル・ダーク.BP: 10000 → 15000",
        "自分.闇皇ナインテイル・ダーク.疲労: false → true",
        "自分.白夜の宝剣ミッドナイト・サン.場所: なし → 合体",
        "自分.白夜の宝剣ミッドナイト・サン.疲労: なし → false",
        "自分.白夜の宝剣ミッドナイト・サン.コア: なし → 0",
        "自分.白夜の宝剣ミッドナイト・サン.Lv: なし → 1",
        "自分.トラッシュのコア: 0 → 5",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// 節1：起きない場面（合体していない）
scenario({
    name: "sd11-x02-armorx",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: "SD11-X01", cores: 4 }, { card: "SD11-X02", cores: 1, rested: true }] },
        opp: { spirits: [{ card: "BS05-045", cores: 1 }], hand: ["BS01-134"] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("ドワッフー・セブン") })
        t.act("me", { type: "pass" })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("闇皇ナインテイル・ダーク") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.闇皇ナインテイル・ダーク.疲労: false → true",
        "相手.ドワッフー・セブン.疲労: false → true",
        "相手.手札: バインディングソーン → なし",
        "相手.トラッシュ: なし → バインディングソーン",
        "相手.トラッシュのコア: 0 → 2",
        "相手.リザーブ: 10 → 9",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})
// 節2（【合体時】このスピリットの【連鎖】は、条件を無視して発揮する）：起きる場面
// （緑シンボルが無くても、合体している間はX01の【連鎖】が発揮する）
scenario({
    name: "sd11-x02-ren",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: "SD11-X01", cores: 4 }], hand: ["SD11-X02"] },
        opp: { spirits: [{ card: "BS01-002", rested: true }, { card: "BS05-045", label: "B" }] },
    },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("闇皇ナインテイル・ダーク") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("闇皇ナインテイル・ダーク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 5",
        "自分.手札: 白夜の宝剣ミッドナイト・サン → なし",
        "自分.闇皇ナインテイル・ダーク.BP: 10000 → 15000",
        "自分.闇皇ナインテイル・ダーク.疲労: false → true",
        "自分.白夜の宝剣ミッドナイト・サン.場所: なし → 合体",
        "自分.白夜の宝剣ミッドナイト・サン.疲労: なし → false",
        "自分.白夜の宝剣ミッドナイト・サン.コア: なし → 0",
        "自分.白夜の宝剣ミッドナイト・サン.Lv: なし → 1",
        "自分.トラッシュのコア: 0 → 5",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
        "相手.B.疲労: false → true",
    ],
})
// 節2：起きない場面（合体していない）
scenario({
    name: "sd11-x02-renx",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: "SD11-X01", cores: 4 }, { card: "SD11-X02", cores: 1, rested: true }] },
        opp: { spirits: [{ card: "BS05-045", cores: 1 }, { card: "BS05-045", label: "B", cores: 1 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("ドワッフー・セブン") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("闇皇ナインテイル・ダーク") })
        t.closeFlash()
    },
    expect: [
        "相手.ドワッフー・セブン.場所: フィールド → なし",
        "相手.トラッシュ: なし → ドワッフー・セブン",
        "相手.リザーブ: 10 → 11",
        "自分.闇皇ナインテイル・ダーク.BP: 10000 → 13000",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part755）")
