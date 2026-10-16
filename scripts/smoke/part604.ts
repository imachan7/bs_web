// smoke パート604（BS16 ほか18枚：実行時カバレッジで未適用だった効果節の場面テスト）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const names: Record<string, string> = {
    "BS16-064": "宙吊りの五行山", "BS16-038": "クラブソーサラー・スケアクロウ", "BS03-054": "アルカナドール・トリア",
    "BS04-062": "猿人モンゴクウ", "BS04-064": "ウガルルム", "BS16-046": "サケビバード", "BS03-099": "虎拳士タイガ",
    "BS16-001": "ノデッポ", "BS03-X12": "英雄巨人タイタス", "BS16-066": "浮遊関", "BS16-062": "天下眺める絶景門",
    "BS16-031": "ジル・ド・レ", "BS15-082": "神閃月下", "P069": "ロード・ブレイバン", "P070": "カオティック・リクゴー", "P071": "サイゴード・アームズ", "BS05-049": "狼人ウルフィ", "BS16-006": "アーチャー・ドラゴン", "BS03-073": "ストン・スタチュー", "BS16-014": "オカピエン", "BS16-002": "パイルドラコ", "BS03-144": "マジックハンマー", "SD06-010": "海皇龍シーマ・クリーク", "BS01-030": "グリプ・ハンズ", "BS04-066": "猫人アビシニア", "BS16-039": "グリムの天使ラプンツェル", "BS16-033": "ミブロック・ザ・ワン", "BS01-146": "ドリームリボン", "BS01-134": "バインディングソーン", "BS16-013": "闇騎士フローレンス", "BS16-X03": "烈の覇王セイリュービ", "BS01-002": "ロクケラトプス", "X014": "超星覇龍ヤマトヴルム・ノヴァ",
}
for (const [id, n] of Object.entries(names)) assert(getCard(id).name === n, `${id} は ${n}`)

const MONGOKU = "BS04-062" // 青・コスト2 Lv1(1コア)=3000 Lv2(4コア)=5000
const UGARU = "BS04-064" // 青・コスト2 Lv1(2コア)=4000 Lv2(5コア)=6000
const TAIGA = "BS03-099" // 青・コスト7 Lv3(7コア)=10000
const BURST_CARD = "BS15-082" // 相手の召喚時効果の発揮後にだけ誘発するので、自分の操作では発火しない

const loses = (label: string, trash: string) => [`${label}.場所: フィールド → なし`, `自分.トラッシュ: なし → ${trash}`, "自分.リザーブ: 10 → 11"]

// 相手がアタックし、自分が label でブロックする
function oppAttackBlocked(t: ScenarioCtx, attacker: string, blocker: string): void {
    t.act("opp", { type: "attack", instanceId: t.id(attacker) })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id(blocker) })
    t.closeFlash()
}
function meAttackBlocked(t: ScenarioCtx, attacker: string, blocker: string): void {
    t.act("me", { type: "attack", instanceId: t.id(attacker) })
    t.closeFlash()
    t.act("opp", { type: "block", instanceId: t.id(blocker) })
    t.closeFlash()
}

console.log("=== BS16-038 スケアクロウ：「四道」が相手に破壊されたらドロー ===")
scenario({
    name: "scarecrow-self",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "BS16-038" }] }, opp: { spirits: [{ card: TAIGA, cores: 7 }] } },
    steps: (t) => oppAttackBlocked(t, "虎拳士タイガ", "クラブソーサラー・スケアクロウ"),
    expect: [...loses("自分.クラブソーサラー・スケアクロウ", "クラブソーサラー・スケアクロウ"), "相手.虎拳士タイガ.疲労: false → true",
        "自分.デッキ枚数: 40 → 39", "自分.手札: なし → ロクケラトプス"],
})
scenario({
    name: "scarecrow-other-shido",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: "BS16-038", label: "スケアクロウ" }, { card: "BS03-054" }] },
        opp: { spirits: [{ card: TAIGA, cores: 7 }] },
    },
    steps: (t) => oppAttackBlocked(t, "虎拳士タイガ", "アルカナドール・トリア"),
    expect: [...loses("自分.アルカナドール・トリア", "アルカナドール・トリア"), "相手.虎拳士タイガ.疲労: false → true",
        "自分.デッキ枚数: 40 → 39", "自分.手札: なし → ロクケラトプス"],
})
scenario({
    name: "scarecrow-not-shido",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: "BS16-038", label: "スケアクロウ" }, { card: MONGOKU }] },
        opp: { spirits: [{ card: TAIGA, cores: 7 }] },
    },
    steps: (t) => oppAttackBlocked(t, "虎拳士タイガ", "猿人モンゴクウ"),
    expect: [...loses("自分.猿人モンゴクウ", "猿人モンゴクウ"), "相手.虎拳士タイガ.疲労: false → true"],
})
scenario({
    // 相手のスケアクロウを自分が破壊したら、ドローするのは相手（スケアクロウの持ち主）
    name: "scarecrow-opp-side",
    start: { phase: "attack", me: { spirits: [{ card: TAIGA, cores: 7 }] }, opp: { spirits: [{ card: "BS16-038" }] } },
    steps: (t) => meAttackBlocked(t, "虎拳士タイガ", "クラブソーサラー・スケアクロウ"),
    expect: ["相手.クラブソーサラー・スケアクロウ.場所: フィールド → なし", "相手.トラッシュ: なし → クラブソーサラー・スケアクロウ", "相手.リザーブ: 10 → 11",
        "自分.虎拳士タイガ.疲労: false → true", "相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス"],
})

console.log("=== BS16-064 宙吊りの五行山：配置時（手札から配置） ===")
const nexusLines = (label: string, cost: number, cores = 0, lv = 1) => [
    `自分.${label}.場所: なし → ネクサス`, `自分.${label}.疲労: なし → false`, `自分.${label}.コア: なし → ${cores}`, `自分.${label}.Lv: なし → ${lv}`,
    `自分.手札: ${label} → なし`, `自分.リザーブ: 10 → ${10 - cost}`, `自分.トラッシュのコア: 0 → ${cost}`,
]
scenario({
    name: "gogyosan-deploy",
    start: {
        me: { hand: ["BS16-064"] },
        opp: { spirits: [{ card: MONGOKU, cores: 3, label: "モンゴクウ" }, { card: "BS16-046", cores: 2, label: "サケビバード" }] },
    },
    steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
    expect: [...nexusLines("宙吊りの五行山", 5), "相手.モンゴクウ.コア: 3 → 1", "相手.サケビバード.コア: 2 → 1", "相手.リザーブ: 10 → 13"],
})
scenario({
    // 3体いるときは2体だけが対象。選んだ2体だけが1個になる
    name: "gogyosan-choose-two",
    start: {
        interactive: true,
        me: { hand: ["BS16-064"] },
        opp: { spirits: [{ card: MONGOKU, cores: 3, label: "A" }, { card: "BS16-046", cores: 3, label: "B" }, { card: "BS16-046", cores: 3, label: "C" }] },
    },
    steps(t) {
        t.act("me", { type: "setNexus", handIndex: 0 })
        for (const l of ["相手.B", "相手.C"]) {
            if (t.state.pendingChoice) t.act("me", { type: "resolveChoice", instanceId: t.id(l) })
        }
    },
    expect: [...nexusLines("宙吊りの五行山", 5), "相手.B.コア: 3 → 1", "相手.C.コア: 3 → 1", "相手.リザーブ: 10 → 14"],
})

console.log("=== BS16-064 Lv2：「召喚時」効果を持つコスト5以下の自分のスピリットが破壊されたとき、手札に戻せる ===")
const returnStart = (spirit: string, nexusCores = 1) => ({
    turn: "opp" as const, phase: "attack" as const, interactive: true,
    me: { spirits: [{ card: spirit }], nexuses: [{ card: "BS16-064", cores: nexusCores }] },
    opp: { spirits: [{ card: TAIGA, cores: 7 }] },
})
const returned = (label: string) => [`自分.${label}.場所: フィールド → なし`, "自分.リザーブ: 10 → 11", "相手.虎拳士タイガ.疲労: false → true"]
const answerYes = (t: ScenarioCtx) => t.act("me", { type: "resolveChoice", option: "発動する" })
scenario({
    name: "gogyosan-return-decline",
    start: returnStart("BS16-001"),
    steps(t) {
        oppAttackBlocked(t, "虎拳士タイガ", "ノデッポ")
        t.act("me", { type: "resolveChoice" })
    },
    expect: [...returned("ノデッポ"), "自分.トラッシュ: なし → ノデッポ"],
})
scenario({
    name: "gogyosan-no-summon-effect",
    start: returnStart(MONGOKU),
    steps: (t) => oppAttackBlocked(t, "虎拳士タイガ", "猿人モンゴクウ"),
    expect: [...returned("猿人モンゴクウ"), "自分.トラッシュ: なし → 猿人モンゴクウ"],
})
scenario({
    // コスト8は「コスト5以下」を満たさない
    name: "gogyosan-cost-too-high",
    start: returnStart("BS03-X12"),
    steps: (t) => oppAttackBlocked(t, "虎拳士タイガ", "英雄巨人タイタス"),
    expect: [...returned("英雄巨人タイタス"), "自分.トラッシュ: なし → 英雄巨人タイタス"],
})
scenario({
    // ネクサスがLv1のときはLv2の効果は無い
    name: "gogyosan-nexus-lv1",
    start: returnStart("BS16-001", 0),
    steps: (t) => oppAttackBlocked(t, "虎拳士タイガ", "ノデッポ"),
    expect: [...returned("ノデッポ"), "自分.トラッシュ: なし → ノデッポ"],
})

console.log("=== BS16-066 浮遊関：配置時（手札から配置）、相手のスピリット2体を疲労させる ===")
scenario({
    name: "fuyukan-deploy",
    start: {
        me: { hand: ["BS16-066"] },
        opp: { spirits: [{ card: MONGOKU, label: "A" }, { card: MONGOKU, label: "B" }] },
    },
    steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
    expect: [...nexusLines("浮遊関", 5), "相手.A.疲労: false → true", "相手.B.疲労: false → true"],
})
scenario({
    name: "fuyukan-choose-two",
    start: {
        interactive: true,
        me: { hand: ["BS16-066"] },
        opp: { spirits: [{ card: MONGOKU, label: "A" }, { card: MONGOKU, label: "B" }, { card: MONGOKU, label: "C" }] },
    },
    steps(t) {
        t.act("me", { type: "setNexus", handIndex: 0 })
        for (const l of ["相手.B", "相手.C"]) if (t.state.pendingChoice) t.act("me", { type: "resolveChoice", instanceId: t.id(l) })
    },
    expect: [...nexusLines("浮遊関", 5), "相手.B.疲労: false → true", "相手.C.疲労: false → true"],
})

console.log("=== BS16-062 絶景門：配置時（手札から配置）、BP5000以下の相手のスピリット1体を破壊 ===")
scenario({
    name: "zekkeimon-hit",
    start: { me: { hand: ["BS16-062"] }, opp: { spirits: [{ card: MONGOKU, cores: 4 }] } },
    steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
    expect: [...nexusLines("天下眺める絶景門", 5), "相手.猿人モンゴクウ.場所: フィールド → なし", "相手.トラッシュ: なし → 猿人モンゴクウ", "相手.リザーブ: 10 → 14"],
})
scenario({
    name: "zekkeimon-too-strong",
    start: { me: { hand: ["BS16-062"] }, opp: { spirits: [{ card: UGARU, cores: 5 }] } },
    steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
    expect: nexusLines("天下眺める絶景門", 5),
})

console.log("=== X014 ヤマトヴルム・ノヴァ／BS16-001 ノデッポ：召喚時、バーストをセットしているとき相手のスピリットを破壊 ===")
// 召喚で手札から場に出る個体の行（コアは召喚コストを払った残りのうち最低Lvぶんが載る）
const summoned = (label: string, cost: number, hand: string, cores: number, lv: number, bp: number) => [
    `自分.${label}.場所: なし → フィールド`, `自分.${label}.疲労: なし → false`, `自分.${label}.コア: なし → ${cores}`, `自分.${label}.Lv: なし → ${lv}`,
    `自分.${label}.BP: なし → ${bp}`, `自分.手札: ${hand} → なし`, `自分.トラッシュのコア: 0 → ${cost}`,
]
scenario({
    name: "yamato-burst-set",
    start: { me: { hand: ["X014"], burst: BURST_CARD }, opp: { spirits: [{ card: TAIGA, cores: 7 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...summoned("超星覇龍ヤマトヴルム・ノヴァ", 8, "超星覇龍ヤマトヴルム・ノヴァ", 1, 1, 6000), "自分.リザーブ: 10 → 1",
        "相手.虎拳士タイガ.場所: フィールド → なし", "相手.トラッシュ: なし → 虎拳士タイガ", "相手.リザーブ: 10 → 17"],
})
scenario({
    name: "yamato-no-burst",
    start: { me: { hand: ["X014"] }, opp: { spirits: [{ card: TAIGA, cores: 7 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...summoned("超星覇龍ヤマトヴルム・ノヴァ", 8, "超星覇龍ヤマトヴルム・ノヴァ", 1, 1, 6000), "自分.リザーブ: 10 → 1"],
})
scenario({
    name: "nodeppo-burst-set",
    start: { me: { hand: ["BS16-001"], burst: BURST_CARD }, opp: { spirits: [{ card: MONGOKU, cores: 1 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...summoned("ノデッポ", 2, "ノデッポ", 1, 1, 1000), "自分.リザーブ: 10 → 7",
        "相手.猿人モンゴクウ.場所: フィールド → なし", "相手.トラッシュ: なし → 猿人モンゴクウ", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "nodeppo-no-burst",
    start: { me: { hand: ["BS16-001"] }, opp: { spirits: [{ card: MONGOKU, cores: 1 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...summoned("ノデッポ", 2, "ノデッポ", 1, 1, 1000), "自分.リザーブ: 10 → 7"],
})
scenario({
    // BP3000を超えるスピリットは対象にならない
    name: "nodeppo-too-strong",
    start: { me: { hand: ["BS16-001"], burst: BURST_CARD }, opp: { spirits: [{ card: UGARU, cores: 2 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...summoned("ノデッポ", 2, "ノデッポ", 1, 1, 1000), "自分.リザーブ: 10 → 7"],
})

console.log("=== BS16-031 ジル・ド・レ Lv2：ブロック時、BPを比べ相手のスピリットだけを破壊したとき回復 ===")
scenario({
    // ブロックで疲労するなら回復で元に戻る（疲労: false のまま）。ブロックしても疲労しないなら変化なし
    name: "jill-wins",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "BS16-031", cores: 2 }] }, opp: { spirits: [{ card: MONGOKU, cores: 1 }] } },
    steps: (t) => oppAttackBlocked(t, "猿人モンゴクウ", "ジル・ド・レ"),
    expect: ["相手.猿人モンゴクウ.場所: フィールド → なし", "相手.トラッシュ: なし → 猿人モンゴクウ", "相手.リザーブ: 10 → 11"],
})
scenario({
    // Lv1には効果が無い。ブロックで疲労したまま
    name: "jill-lv1",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "BS16-031", cores: 1 }] }, opp: { spirits: [{ card: MONGOKU, cores: 1 }] } },
    steps: (t) => oppAttackBlocked(t, "猿人モンゴクウ", "ジル・ド・レ"),
    expect: ["相手.猿人モンゴクウ.場所: フィールド → なし", "相手.トラッシュ: なし → 猿人モンゴクウ", "相手.リザーブ: 10 → 11", "自分.ジル・ド・レ.疲労: false → true"],
})
scenario({
    // BP同値は双方破壊。自分も破壊されるので回復しない
    name: "jill-tie",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "BS16-031", cores: 2 }] }, opp: { spirits: [{ card: UGARU, cores: 5 }] } },
    steps: (t) => oppAttackBlocked(t, "ウガルルム", "ジル・ド・レ"),
    expect: ["相手.ウガルルム.場所: フィールド → なし", "相手.トラッシュ: なし → ウガルルム", "相手.リザーブ: 10 → 15",
        ...loses("自分.ジル・ド・レ", "ジル・ド・レ").slice(0, 1), "自分.トラッシュ: なし → ジル・ド・レ", "自分.リザーブ: 10 → 12"],
})

console.log("=== P069／P070／P071 ブレイヴ：【バースト：自分のライフ減少後】で召喚 ===")
for (const [id, name, bp] of [["P069", "ロード・ブレイバン", 3000], ["P070", "カオティック・リクゴー", 3000], ["P071", "サイゴード・アームズ", 3000]] as const) {
    scenario({
        name: `${id}-burst`,
        start: { turn: "opp", phase: "attack", me: { burst: id }, opp: { spirits: [{ card: MONGOKU, cores: 1 }] } },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("猿人モンゴクウ") })
            t.closeFlash()
            t.act("me", { type: "takeLife" })
        },
        expect: ["自分.ライフ: 5 → 4", "自分.バースト: " + name + " → なし", "相手.猿人モンゴクウ.疲労: false → true",
            `自分.${name}.場所: なし → フィールド`, `自分.${name}.疲労: なし → false`, `自分.${name}.コア: なし → 1`, `自分.${name}.Lv: なし → 1`,
            `自分.${name}.BP: なし → ${bp}`],
    })
    scenario({
        // ライフが減らなければ誘発しない
        name: `${id}-burst-blocked`,
        start: { turn: "opp", phase: "attack", me: { burst: id, spirits: [{ card: TAIGA, cores: 7 }] }, opp: { spirits: [{ card: MONGOKU, cores: 1 }] } },
        steps: (t) => oppAttackBlocked(t, "猿人モンゴクウ", "虎拳士タイガ"),
        expect: ["相手.猿人モンゴクウ.場所: フィールド → なし", "相手.トラッシュ: なし → 猿人モンゴクウ", "相手.リザーブ: 10 → 11", "自分.虎拳士タイガ.疲労: false → true"],
    })
}

console.log("=== P069 合体アタック時：アタックで相手のライフを減らしたとき、ライフのコア1個をリザーブへ ===")
const WOLFY = "BS05-049" // 青・コスト4 Lv1=4000 シンボル1
function combinedAttack(t: ScenarioCtx, brave: string): void {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id(brave), hostInstanceId: t.id("狼人ウルフィ") })
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("狼人ウルフィ") })
    t.closeFlash()
}
// 合体そのものの変化（合体時のBP加算の数値はこのテストの対象外なので、ここだけ観測値をそのまま置く）
// 合体でブレイヴのコアはホストの上に置く（BRAVE.md §6 末尾）。ホストのコアを変える場面は hostCores を渡す
const combineLines = (brave: string, hostBp: number, hostCores = ["自分.狼人ウルフィ.コア: 1 → 2"]) => [
    `自分.${brave}.BP: 3000 → なし`, `自分.${brave}.コア: 1 → 0`, `自分.${brave}.場所: フィールド → 合体`, ...hostCores,
    `自分.狼人ウルフィ.BP: 4000 → ${hostBp}`, "自分.狼人ウルフィ.疲労: false → true",
]
scenario({
    name: "P069-combined-life",
    start: { me: { spirits: [{ card: WOLFY }, { card: "P069", label: "ブレイバン" }] } },
    steps(t) {
        combinedAttack(t, "ブレイバン")
        t.act("opp", { type: "takeLife" })
    },
    // 攻撃のダメージで1、ライフのコア1個で1
    expect: [...combineLines("ブレイバン", 9000), "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"],
})
scenario({
    // ブロックされてライフが減らなければ、ライフのコアは動かない
    name: "P069-combined-blocked",
    start: { me: { spirits: [{ card: WOLFY }, { card: "P069", label: "ブレイバン" }] }, opp: { spirits: [{ card: MONGOKU, cores: 4 }] } },
    steps(t) {
        combinedAttack(t, "ブレイバン")
        t.act("opp", { type: "block", instanceId: t.id("猿人モンゴクウ") })
        t.closeFlash()
    },
    expect: [...combineLines("ブレイバン", 9000), "相手.猿人モンゴクウ.場所: フィールド → なし", "相手.トラッシュ: なし → 猿人モンゴクウ", "相手.リザーブ: 10 → 14"],
})

console.log("=== P071 合体アタック時：相手のデッキを上から2枚破棄、バースト効果を持つカードが破棄されたらボイドからコア1個 ===")
const deckOf = (top: string[]) => [...top, ...Array.from({ length: 40 - top.length }, () => "BS01-002")]
scenario({
    name: "P071-mill-burst-card",
    start: { me: { spirits: [{ card: WOLFY }, { card: "P071", label: "アームズ" }] }, opp: { deck: deckOf([BURST_CARD, "BS01-002"]) } },
    steps(t) {
        combinedAttack(t, "アームズ")
        t.act("opp", { type: "takeLife" })
    },
    expect: [...combineLines("アームズ", 7000, ["自分.狼人ウルフィ.コア: 1 → 3"]),
        "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", "相手.デッキ枚数: 40 → 38", "相手.トラッシュ: なし → ロクケラトプス、神閃月下"],
})
scenario({
    name: "P071-mill-no-burst-card",
    start: { me: { spirits: [{ card: WOLFY }, { card: "P071", label: "アームズ" }] }, opp: { deck: deckOf(["BS01-002", "BS01-002"]) } },
    steps(t) {
        combinedAttack(t, "アームズ")
        t.act("opp", { type: "takeLife" })
    },
    expect: [...combineLines("アームズ", 7000), "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", "相手.デッキ枚数: 40 → 38", "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス"],
})
scenario({
    // 3枚目以降に burst があっても対象外（破棄は2枚）
    name: "P071-burst-card-third",
    start: { me: { spirits: [{ card: WOLFY }, { card: "P071", label: "アームズ" }] }, opp: { deck: deckOf(["BS01-002", "BS01-002", BURST_CARD]) } },
    steps(t) {
        combinedAttack(t, "アームズ")
        t.act("opp", { type: "takeLife" })
    },
    expect: [...combineLines("アームズ", 7000), "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", "相手.デッキ枚数: 40 → 38", "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス"],
})

console.log("=== BS16-006 アーチャー・ドラゴン Lv2：フラッシュ、コア2個をトラッシュに置いてBP4000以下の相手のスピリット1体を破壊 ===")
const ARCHER_E2 = "BS16-006-e2"
const archerPaid = ["自分.アーチャー・ドラゴン.コア: 3 → 1", "自分.アーチャー・ドラゴン.Lv: 2 → 1", "自分.アーチャー・ドラゴン.BP: 6000 → 4000", "自分.トラッシュのコア: 0 → 2"]
const archerUse = (t: ScenarioCtx) => t.act("me", { type: "activateAbility", instanceId: t.id("アーチャー・ドラゴン"), effectId: ARCHER_E2 })
const archerUseRejected = (t: ScenarioCtx) => t.actRejected("me", { type: "activateAbility", instanceId: t.id("アーチャー・ドラゴン"), effectId: ARCHER_E2 })
scenario({
    name: "archer-my-attack-step",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "BS16-006", cores: 3 }, { card: MONGOKU, label: "攻撃役" }] },
        opp: { spirits: [{ card: MONGOKU, cores: 1, label: "的" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("攻撃役") })
        t.act("opp", { type: "pass" })
        archerUse(t)
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [...archerPaid, "自分.攻撃役.疲労: false → true", "相手.的.場所: フィールド → なし", "相手.トラッシュ: なし → 猿人モンゴクウ", "相手.リザーブ: 10 → 12", "相手.ライフ: 5 → 4"],
})
scenario({
    // 「お互いのアタックステップ」なので相手のアタックステップでも使える。アタックしている相手を破壊すればバトルは起きない
    name: "archer-opp-attack-step",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "BS16-006", cores: 3 }] }, opp: { spirits: [{ card: MONGOKU, cores: 1, label: "攻撃役" }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
        archerUse(t)
        t.closeFlash()
    },
    expect: [...archerPaid, "相手.攻撃役.場所: フィールド → なし", "相手.トラッシュ: なし → 猿人モンゴクウ", "相手.リザーブ: 10 → 11"],
})
scenario({
    // 見出しはLv2・Lv3。Lv1（コア2個）では使えない
    name: "archer-lv1",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "BS16-006", cores: 2 }] }, opp: { spirits: [{ card: MONGOKU, cores: 1, label: "攻撃役" }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
        archerUseRejected(t)
    },
    expect: ["相手.攻撃役.疲労: false → true"],
})

console.log("=== BS16-014 オカピエン／BS16-002 パイルドラコ：相手によってデッキから破棄されたとき ===")
const STATUE = "BS03-073" // 青・コスト1 Lv1=2000。召喚時に相手のデッキを上から1枚破棄
const oppSummoned = (label: string, cost: number, hand: string, bp: number, reserve: number) => [
    `相手.${label}.場所: なし → フィールド`, `相手.${label}.疲労: なし → false`, `相手.${label}.コア: なし → 1`, `相手.${label}.Lv: なし → 1`,
    `相手.${label}.BP: なし → ${bp}`, `相手.手札: ${hand} → なし`, `相手.トラッシュのコア: 0 → ${cost}`, `相手.リザーブ: 10 → ${reserve}`,
]
const myDeck = (top: string[]) => [...top, ...Array.from({ length: 40 - top.length }, () => "BS01-002")]
scenario({
    name: "okapien-milled",
    start: { turn: "opp", me: { deck: myDeck(["BS16-014"]) }, opp: { hand: [STATUE] } },
    steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
    expect: [...oppSummoned("ストン・スタチュー", 1, "ストン・スタチュー", 2000, 8), "自分.デッキ枚数: 40 → 39", "自分.トラッシュ: なし → オカピエン", "相手.ライフ: 5 → 4"],
})
scenario({
    name: "okapien-other-card-milled",
    start: { turn: "opp", me: { deck: myDeck([]) }, opp: { hand: [STATUE] } },
    steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
    expect: [...oppSummoned("ストン・スタチュー", 1, "ストン・スタチュー", 2000, 8), "自分.デッキ枚数: 40 → 39", "自分.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    // マジックでも「相手によって」には当たる
    name: "okapien-milled-by-magic",
    start: { turn: "opp", me: { deck: myDeck(["BS16-014"]) }, opp: { hand: ["BS03-144"] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0 }),
    expect: ["相手.手札: マジックハンマー → なし", "相手.トラッシュ: なし → マジックハンマー", "相手.トラッシュのコア: 0 → 4", "相手.リザーブ: 10 → 6",
        "自分.デッキ枚数: 40 → 35", "自分.トラッシュ: なし → オカピエン、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス", "相手.ライフ: 5 → 4"],
})
scenario({
    name: "pairudorako-milled-by-spirit",
    start: { turn: "opp", me: { deck: myDeck(["BS16-002"]) }, opp: { hand: [STATUE, STATUE] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        // このターンの間、自分のデッキは破棄されない：2体目の召喚時効果は空振りする
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: ["相手.手札: ストン・スタチュー、ストン・スタチュー → なし", "相手.トラッシュ: なし → ストン・スタチュー", "相手.トラッシュのコア: 0 → 2", "相手.リザーブ: 10 → 7",
        "相手.ストン・スタチュー.場所: なし → フィールド", "相手.ストン・スタチュー.疲労: なし → false", "相手.ストン・スタチュー.コア: なし → 1",
        "相手.ストン・スタチュー.Lv: なし → 1", "相手.ストン・スタチュー.BP: なし → 2000",
        "自分.デッキ枚数: 40 → 39", "自分.トラッシュ: なし → パイルドラコ"],
})
scenario({
    // マジックによる破棄は「相手のスピリットの効果」ではない。破壊もされず、続く破棄も止まらない
    name: "pairudorako-milled-by-magic",
    start: { turn: "opp", me: { deck: myDeck(["BS16-002"]) }, opp: { hand: ["BS03-144", "BS03-144"] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        t.act("opp", { type: "castMagic", handIndex: 0 })
    },
    expect: ["相手.手札: マジックハンマー、マジックハンマー → なし", "相手.トラッシュ: なし → マジックハンマー、マジックハンマー", "相手.トラッシュのコア: 0 → 8", "相手.リザーブ: 10 → 2",
        "自分.デッキ枚数: 40 → 30", `自分.トラッシュ: なし → パイルドラコ、${Array(9).fill("ロクケラトプス").join("、")}`],
})

console.log("=== SD06-010 シーマ・クリーク ===")
scenario({
    name: "seema-burst",
    start: { turn: "opp", me: { burst: "SD06-010" }, opp: { hand: ["BS01-030"] } },
    steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
    expect: [...oppSummoned("グリプ・ハンズ", 3, "グリプ・ハンズ", 2000, 6).filter((l) => !l.startsWith("相手.手札")), "相手.デッキ枚数: 40 → 39", "相手.手札: グリプ・ハンズ → ロクケラトプス",
        "自分.バースト: 海皇龍シーマ・クリーク → なし", "自分.海皇龍シーマ・クリーク.場所: なし → フィールド", "自分.海皇龍シーマ・クリーク.疲労: なし → false",
        "自分.海皇龍シーマ・クリーク.コア: なし → 1", "自分.海皇龍シーマ・クリーク.Lv: なし → 1", "自分.海皇龍シーマ・クリーク.BP: なし → 4000", "自分.リザーブ: 10 → 9"],
})

console.log("=== BS16-039 ラプンツェル Lv2：相手のスピリットの効果で1度に10枚以上破棄されたとき、5枚までを好きな順でデッキの上へ ===")
const TITUS = "BS03-X12" // 青・コスト8。召喚時に相手のデッキを上から10枚破棄
const NAMED = ["BS01-002", "BS04-062", "BS04-064", "BS03-099", "BS16-046", "BS16-001", "BS03-073", "BS03-072", "BS04-060", "BS04-066"]
const trashNames = (ids: string[]) => ids.map((c) => getCard(c).name).sort().join("、")
const titusLines = ["相手.トラッシュのコア: 0 → 8", "相手.リザーブ: 10 → 1", "相手.手札: 英雄巨人タイタス → なし", "相手.英雄巨人タイタス.BP: なし → 6000",
    "相手.英雄巨人タイタス.Lv: なし → 1", "相手.英雄巨人タイタス.コア: なし → 1", "相手.英雄巨人タイタス.場所: なし → フィールド", "相手.英雄巨人タイタス.疲労: なし → false"]
function rapunzelStart(cores: number) {
    return { turn: "opp" as const, interactive: true, me: { spirits: [{ card: "BS16-039", cores }], deck: myDeck(NAMED) }, opp: { hand: [TITUS] } }
}
scenario({
    name: "rapunzel-return-two",
    start: rapunzelStart(2),
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        assert(t.state.pendingChoice?.kind === "card", "ラプンツェル：デッキに戻すカードの選択待ちになる")
        const trash = t.state.players[t.me].trashCards
        const picked = [trash[3], trash[7]]
        t.act("me", { type: "resolveChoice", cardIndex: 3 })
        t.act("me", { type: "resolveChoice", cardIndex: 7 })
        if (t.state.pendingChoice) t.act("me", { type: "resolveChoice" })
        const top = t.state.players[t.me].deck.slice(0, 2)
        assert(top.length === 2 && [...top].sort().join() === [...picked].sort().join(), "ラプンツェル：選んだ2枚がデッキの上に戻る")
    },
    // 戻した2枚は、デッキ枚数とトラッシュの内訳に反映される（どの2枚かは trashCards の3番・7番）
    expect: [...titusLines, "自分.デッキ枚数: 40 → 32", `自分.トラッシュ: なし → ${trashNames(NAMED.filter((_, i) => i !== 3 && i !== 7))}`],
})
scenario({
    name: "rapunzel-decline",
    start: rapunzelStart(2),
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        t.act("me", { type: "resolveChoice" })
    },
    expect: [...titusLines, "自分.デッキ枚数: 40 → 30", `自分.トラッシュ: なし → ${trashNames(NAMED)}`],
})
scenario({
    // Lv1では効果が無い
    name: "rapunzel-lv1",
    start: rapunzelStart(1),
    steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
    expect: [...titusLines, "自分.デッキ枚数: 40 → 30", `自分.トラッシュ: なし → ${trashNames(NAMED)}`],
})
scenario({
    // 5枚の破棄・マジックによる破棄は条件を満たさない
    name: "rapunzel-magic-5cards",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: "BS16-039", cores: 2 }], deck: myDeck(NAMED) }, opp: { hand: ["BS03-144"] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0 }),
    expect: ["相手.手札: マジックハンマー → なし", "相手.トラッシュ: なし → マジックハンマー", "相手.トラッシュのコア: 0 → 4", "相手.リザーブ: 10 → 6",
        "自分.デッキ枚数: 40 → 35", `自分.トラッシュ: なし → ${trashNames(NAMED.slice(0, 5))}`],
})

console.log("=== SD06-010 Lv1・Lv2：このスピリットとコスト2以下のスピリットはアタックできない（お互いに） ===")
const ABYSSINIA = "BS04-066" // 青・コスト3 Lv1=3000
const attackOf = (side: "me" | "opp", label: string) => (t: ScenarioCtx) => t.act(side, { type: "attack", instanceId: t.id(label) })
scenario({
    name: "seema-lv1-my-side",
    start: { phase: "attack", me: { spirits: [{ card: "SD06-010", cores: 1 }, { card: MONGOKU }, { card: ABYSSINIA }] } },
    steps(t) {
        t.actRejected("me", { type: "attack", instanceId: t.id("海皇龍シーマ・クリーク") })
        t.actRejected("me", { type: "attack", instanceId: t.id("猿人モンゴクウ") })
        attackOf("me", "猫人アビシニア")(t)
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.猫人アビシニア.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    // 相手のコスト2以下のスピリットも、シーマがいる間はアタックできない
    name: "seema-lv2-opp-side",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "SD06-010", cores: 3 }] }, opp: { spirits: [{ card: MONGOKU }, { card: ABYSSINIA }] } },
    steps(t) {
        t.actRejected("opp", { type: "attack", instanceId: t.id("猿人モンゴクウ") })
        attackOf("opp", "猫人アビシニア")(t)
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.猫人アビシニア.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})
scenario({
    // Lv3では制限が外れ、シーマ自身もアタックできる
    name: "seema-lv3",
    start: { phase: "attack", me: { spirits: [{ card: "SD06-010", cores: 5 }, { card: MONGOKU }] } },
    steps(t) {
        attackOf("me", "海皇龍シーマ・クリーク")(t)
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.海皇龍シーマ・クリーク.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== BS16-033 ミブロック・ザ・ワン：合体中のLv2・Lv3は、相手の赤/白/黄の効果を受けない ===")
const RIBBON = "BS01-146" // 白フラッシュ・コスト4：相手のスピリット1体を手札に戻す
const THORN = "BS01-134" // 緑フラッシュ・コスト2：相手のスピリット1体を疲労させる
function mibrockScenario(name: string, opts: { combine: boolean; cores: number; spell: string; accepted: boolean; expect: string[] }): void {
    const expect = [...opts.expect]
    scenario({
        name,
        start: {
            me: { spirits: [{ card: "BS16-033", cores: opts.cores }, { card: "P070", label: "リクゴー" }, { card: MONGOKU, label: "攻撃役" }] },
            opp: { hand: [opts.spell] },
        },
        steps(t) {
            if (opts.combine) {
                t.act("me", { type: "combineBrave", braveInstanceId: t.id("リクゴー"), hostInstanceId: t.id("ミブロック・ザ・ワン") })
            }
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("攻撃役") })
            const cast = { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ミブロック・ザ・ワン") } as const
            if (opts.accepted) t.act("opp", cast)
            else t.actRejected("opp", cast)
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect,
    })
}
const attackBase = ["自分.攻撃役.疲労: false → true", "相手.ライフ: 5 → 4"]
const combinedBase = (cores: number) => ["自分.リクゴー.BP: 3000 → なし", "自分.リクゴー.コア: 1 → 0", "自分.リクゴー.場所: フィールド → 合体", `自分.ミブロック・ザ・ワン.コア: ${cores} → ${cores + 1}`]
mibrockScenario("mibrock-combined-white", { combine: true, cores: 3, spell: RIBBON, accepted: false, expect: [...attackBase, ...combinedBase(3), "相手.リザーブ: 10 → 11"] })
mibrockScenario("mibrock-combined-lv3-white", { combine: true, cores: 5, spell: RIBBON, accepted: false, expect: [...attackBase, ...combinedBase(5), "相手.リザーブ: 10 → 11"] })
mibrockScenario("mibrock-combined-green", {
    combine: true, cores: 3, spell: THORN, accepted: true,
    expect: [...attackBase, ...combinedBase(3), "自分.ミブロック・ザ・ワン.疲労: false → true", "相手.手札: バインディングソーン → なし", "相手.トラッシュ: なし → バインディングソーン",
        "相手.トラッシュのコア: 0 → 2", "相手.リザーブ: 10 → 9"],
})
mibrockScenario("mibrock-not-combined-white", {
    combine: false, cores: 3, spell: RIBBON, accepted: true,
    expect: [...attackBase, "自分.ミブロック・ザ・ワン.場所: フィールド → なし", "自分.手札: なし → ミブロック・ザ・ワン", "自分.リザーブ: 10 → 13",
        "相手.手札: ドリームリボン → なし", "相手.トラッシュ: なし → ドリームリボン", "相手.トラッシュのコア: 0 → 4", "相手.リザーブ: 10 → 7"],
})
mibrockScenario("mibrock-combined-lv1-white", {
    // 重装甲はLv2・Lv3。Lv1（コア1個）の合体中は受ける
    combine: true, cores: 1, spell: RIBBON, accepted: true,
    expect: [...attackBase, "自分.ミブロック・ザ・ワン.場所: フィールド → なし", "自分.手札: なし → ミブロック・ザ・ワン",
        // 手札に戻ると合体は解け、ブレイヴはスピリットに戻る（合体で出たコア1個は分離で戻る）。残るのは Mibrock のコア1個だけ
        "自分.リザーブ: 10 → 11", "相手.手札: ドリームリボン → なし", "相手.トラッシュ: なし → ドリームリボン", "相手.トラッシュのコア: 0 → 4", "相手.リザーブ: 10 → 7"],
})

console.log("=== BS16-013 闇騎士フローレンス：【不死：コスト4/5】で召喚されたとき、相手の合体スピリットのブレイヴ1つを破壊 ===")
function florenceStart(mine: string) {
    return {
        turn: "opp" as const, interactive: true,
        me: { spirits: [{ card: mine, label: "盾" }], trash: ["BS16-013"] },
        opp: { spirits: [{ card: TAIGA, cores: 7, label: "攻撃役" }, { card: "P069", label: "ブレイヴ" }] },
    }
}
function florenceFlow(t: ScenarioCtx): void {
    t.act("opp", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("攻撃役") })
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id("盾") })
    t.closeFlash()
}
// 合体で出たコア1個・アタックによる疲労・合体の変化（BP加算量はこのテストの対象外なので観測値のまま）
const oppCombined = ["相手.攻撃役.コア: 7 → 8", "相手.攻撃役.疲労: false → true", "相手.攻撃役.BP: 10000 → 15000", "相手.ブレイヴ.BP: 3000 → なし",
    "相手.ブレイヴ.コア: 1 → 0", "相手.ブレイヴ.場所: フィールド → 合体"]
const florenceLines = ["自分.闇騎士フローレンス.場所: なし → フィールド", "自分.闇騎士フローレンス.疲労: なし → false", "自分.闇騎士フローレンス.コア: なし → 1",
    "自分.闇騎士フローレンス.Lv: なし → 1", "自分.闇騎士フローレンス.BP: なし → 2000"]
for (const [mine, label] of [["BS05-049", "狼人ウルフィ"], ["BS16-033", "ミブロック・ザ・ワン"]] as const) {
    scenario({
        name: `florence-fushi-${mine}`,
        start: florenceStart(mine),
        steps(t) {
            florenceFlow(t)
            t.act("me", { type: "resolveChoice", option: "召喚する" })
            t.act("me", { type: "resolveChoice", option: "支払う" })
        },
        // 【不死】はコストを支払って召喚する（コスト3）
        expect: ["相手.攻撃役.コア: 7 → 8", "相手.攻撃役.疲労: false → true", `自分.盾.場所: フィールド → なし`, `自分.トラッシュ: 闇騎士フローレンス → ${label}`, "自分.トラッシュのコア: 0 → 3", "自分.リザーブ: 10 → 7",
            ...florenceLines, "相手.ブレイヴ.場所: フィールド → なし", "相手.トラッシュ: なし → ロード・ブレイバン"],
    })
}
scenario({
    name: "florence-fushi-decline",
    start: florenceStart("BS05-049"),
    steps(t) {
        florenceFlow(t)
        t.act("me", { type: "resolveChoice" })
    },
    expect: [...oppCombined, "自分.盾.場所: フィールド → なし", "自分.トラッシュ: 闇騎士フローレンス → 狼人ウルフィ、闇騎士フローレンス", "自分.リザーブ: 10 → 11"],
})
scenario({
    // コスト4/5以外（コスト3）が破壊されても【不死】は使えない
    name: "florence-fushi-cost3",
    start: florenceStart(ABYSSINIA),
    steps(t) {
        florenceFlow(t)
        assert(t.state.pendingChoice === null, "コスト3の破壊では【不死】の確認が出ない")
    },
    expect: [...oppCombined, "自分.盾.場所: フィールド → なし", "自分.トラッシュ: 闇騎士フローレンス → 猫人アビシニア、闇騎士フローレンス", "自分.リザーブ: 10 → 11"],
})

console.log("=== BS16-X03 セイリュービ：【烈神速】（アタックステップ、トラッシュのコア5個以上） ===")
// 相手（p2）がアタックを宣言した直後のフラッシュで、p1 が【烈神速】を使う盤面
function resshinGame(trashCores: number, phase: "main" | "attack"): GameState {
    const s = createGame(`resshin-${trashCores}-${phase}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.phase = phase
    s.players.p1.reserve = 4
    s.players.p1.trashCores = trashCores
    s.players.p1.hand = ["BS16-X03"]
    s.players.p1.field.spirits = []
    const atk = createInstance(MONGOKU, s.turn - 1, 1)
    s.players.p2.field.spirits = [atk]
    refreshLevelAsOverrides(s)
    if (phase === "attack") assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手のアタック宣言が通る")
    return s
}
function pick(s: GameState, option: string): string | null {
    return act(s, "p1", { type: "resolveChoice", option })
}
{
    // トラッシュのコア5個すべてをこのスピリットへ。コストは支払わない（リザーブは4個のまま）
    const s = resshinGame(5, "attack")
    s.interactiveTargets = true
    assert(act(s, "p1", { type: "resshinsokuSummon", handIndex: 0 }) === null, "烈神速：トラッシュのコア5個で使える")
    assert(pick(s, "残り全部をこのスピリットに置く") === null && s.pendingChoice === null, "烈神速：置き先を決め切ると選択待ちが残らない")
    const me = s.players.p1.field.spirits
    assert(me.length === 1 && me[0]?.cardId === "BS16-X03" && me[0].cores === 5, "烈神速：セイリュービが5コアで場に出る")
    assert(s.players.p1.hand.length === 0 && s.players.p1.trashCores === 0 && s.players.p1.reserve === 4, "烈神速：手札から出て、トラッシュのコアは0・リザーブは変わらない")
}
{
    // 置き先を1個ずつ決める：2個をリザーブ、残りをこのスピリット
    const s = resshinGame(5, "attack")
    s.interactiveTargets = true
    assert(act(s, "p1", { type: "resshinsokuSummon", handIndex: 0 }) === null, "烈神速（分配）：使える")
    assert(pick(s, "リザーブに置く") === null && pick(s, "リザーブに置く") === null, "烈神速（分配）：リザーブへ2個")
    assert(pick(s, "残り全部をこのスピリットに置く") === null && s.pendingChoice === null, "烈神速（分配）：残りをこのスピリットへ")
    const me = s.players.p1.field.spirits
    assert(me.length === 1 && me[0]?.cores === 3 && s.players.p1.reserve === 6 && s.players.p1.trashCores === 0, "烈神速（分配）：リザーブ6個・セイリュービ3コア・トラッシュのコア0")
}
{
    const s = resshinGame(4, "attack")
    assert(act(s, "p1", { type: "resshinsokuSummon", handIndex: 0 }) !== null, "烈神速：トラッシュのコア4個では使えない")
    assert(s.players.p1.hand.length === 1 && s.players.p1.field.spirits.length === 0 && s.players.p1.trashCores === 4, "烈神速：拒否されたら何も動かない")
}
{
    const s = resshinGame(5, "main")
    assert(act(s, "p1", { type: "resshinsokuSummon", handIndex: 0 }) !== null, "烈神速：アタックステップ以外では使えない")
}

console.log("すべてのチェックに合格しました 🎉（part604）")
