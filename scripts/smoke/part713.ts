// smoke パート713（プロモ A2：P032 超龍皇アルティメットドラゴン／P036 月光竜機クレセントール／P024 ふわねこ／P078 ハイビスカスの妖精アオイ。期待値役が効果文だけから書いた場面テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string, string][] = [
        ["P032", "超龍皇アルティメットドラゴン", "spirit"],
        ["P036", "月光竜機クレセントール", "spirit"],
        ["P024", "ふわねこ", "spirit"],
        ["P078", "ハイビスカスの妖精アオイ", "spirit"],
        ["BS01-002", "ロクケラトプス", "spirit"], // 赤・コスト1・バニラ
        ["BS01-005", "アイバーン", "spirit"], // 赤・コスト2・バニラ
        ["BS01-058", "ヘラクレス・ジオ", "spirit"], // 緑・コスト3・バニラ
        ["BS02-046", "ウィンガル", "spirit"], // 白・コスト6・バニラ
        ["BS02-049", "ピヨン", "spirit"], // 黄・コスト0・バニラ
        ["BS03-042", "海獣ジューゴン", "spirit"], // 白・コスト4・バニラ
        ["BS05-006", "城塞龍メガロン", "spirit"], // 赤・コスト5・バニラ
        ["BS10-009", "トルネードラ", "spirit"], // 赤・コスト6・バニラ。Lv2(コア3)でBP9000・Lv3(コア5)でBP10000
        ["BS10-039", "ビアンコ・ティーガー", "spirit"], // 白・コスト6・バニラ。Lv2(コア2)でBP9000
        ["BS08-042", "天使サラティ", "spirit"], // 黄・【聖命】持ち（Lv1から）
        ["BS10-065", "ヘッジボルグ", "brave"], // 紫・コスト4・合体条件コスト4以上（P036の合体相手）
        ["BS10-068", "ビーム・ビートル", "brave"], // 緑・コスト4・合体条件コスト4以上・合体アタック時に相手スピリット1体を疲労（相手のブレイヴの効果の例）
    ]
    for (const [id, name, type] of expect) assert(getCard(id).name === name && getCard(id).type === type, `${id} は ${name}(${type})`)
    const c = (id: string) => getCard(id)
    assert(c("P036").cost === 4 && c("P036").family.includes("武装") && c("P036").name.includes("月光"), "P036 はコスト4・武装・名前に月光")
    assert(c("P032").cost === 9 && c("P032").levels[2]?.bp === 20000, "P032 はコスト9・Lv3でBP20000")
    assert(c("P024").cost === 3 && c("P078").cost === 3, "P024・P078 はコスト3")
    assert(c("BS10-009").levels[1]?.bp === 9000 && c("BS10-009").levels[2]?.bp === 10000, "トルネードラのBP")
    assert(c("BS10-039").levels[1]?.bp === 9000 && c("BS02-046").levels[0]?.bp === 5000, "脇役のBP")
    assert(c("BS08-042").effect.includes("【聖命】"), "天使サラティは【聖命】を持つ")
    assert(c("BS10-065").levels[0]?.bp === 3000 && c("BS10-068").cost === 4, "ブレイヴの属性")
    for (const id of ["BS02-049"]) assert(!c(id).colors.some((x) => ["green", "white", "red", "purple", "blue"].includes(x)), `${id} は黄のみ`)
    assert(c("BS01-058").colors[0] === "green" && c("BS02-046").colors[0] === "white" && c("BS01-002").colors[0] === "red", "ヘラクレス緑・ウィンガル白・ロクケラトプス赤")
}

function settle(t: ScenarioCtx, attacker: Side): void {
    const defender: Side = attacker === "me" ? "opp" : "me"
    t.act(defender, { type: "pass" })
    t.act(attacker, { type: "pass" })
}

console.log("=== P032 / アタック時：このターンにBPを比べ自分のスピリットが破壊されているとき、ブロックされない ===")
scenario({
    name: "P032-自分が破壊されたあとはブロックされない",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "BS01-002", label: "先発", cores: 1 }, { card: "P032", cores: 1 }] },
        opp: { spirits: [{ card: "BS10-039", cores: 2 }, { card: "BS02-046", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("先発") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ビアンコ・ティーガー") })
        t.closeFlash()
        // 先発(BP1000)がビアンコ(9000)にBP比べで破壊された。続けてP032がアタックする
        t.act("me", { type: "attack", instanceId: t.id("超龍皇アルティメットドラゴン") })
        settle(t, "me")
        t.actRejected("opp", { type: "block", instanceId: t.id("ウィンガル") })
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.先発.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
        "自分.超龍皇アルティメットドラゴン.疲労: false → true",
        "相手.ビアンコ・ティーガー.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== P032 / 破壊されたのが相手のスピリットだけなら、ブロックされうる（自分のスピリットが破壊されているとき限定） ===")
scenario({
    name: "P032-相手だけ破壊されてもブロックされる",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "BS10-039", label: "先発", cores: 2 }, { card: "P032", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-002", cores: 1 }, { card: "BS02-046", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("先発") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        // 相手のロクケラトプスが破壊されただけ。P032はブロックされうる
        t.act("me", { type: "attack", instanceId: t.id("超龍皇アルティメットドラゴン") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ウィンガル") })
        t.closeFlash()
    },
    // 先発(9000)がロクケラトプス(1000)を、P032(8000)がウィンガル(5000)を倒す
    expect: [
        "自分.先発.疲労: false → true",
        "自分.超龍皇アルティメットドラゴン.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.ウィンガル.場所: フィールド → なし",
        "相手.トラッシュ: なし → ウィンガル、ロクケラトプス",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== P032 / 自分のスピリットが破壊されていなければブロックされうる（P032 単独のアタック） ===")
scenario({
    name: "P032-何も破壊されていなければブロックされる",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "P032", cores: 1 }] },
        opp: { spirits: [{ card: "BS02-046", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("超龍皇アルティメットドラゴン") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ウィンガル") })
        t.closeFlash()
    },
    expect: ["自分.超龍皇アルティメットドラゴン.疲労: false → true", "相手.ウィンガル.場所: フィールド → なし", "相手.トラッシュ: なし → ウィンガル", "相手.リザーブ: 10 → 11"],
})

// 色の指定（選択待ち）に、候補の文字列から「赤」または「青」を選んで答える。実装が選択を出さなければ何もしない
function chooseColor(t: ScenarioCtx, names: string[]): void {
    const pc = t.state.pendingChoice
    if (!pc) return
    assert(pc.kind === "option" && pc.pid === t.me, "色の指定は自分（P032の持ち主）への選択待ち")
    const opt = pc.options?.find((o) => names.some((n) => o.includes(n)))
    assert(opt !== undefined, `色の候補に ${names.join("/")} がある`)
    if (opt !== undefined) t.act("me", { type: "resolveChoice", option: opt })
}

// 自分のターンを終え、相手のターンのスタートステップで色を指定し、相手が赤のスピリットでアタックする場面
function p032StartStepScene(name: string, cores: number, colors: string[], expectLines: string[]): void {
    scenario({
        name,
        start: {
            turn: "me",
            phase: "main",
            interactive: true,
            me: { spirits: [{ card: "P032", cores }] },
            opp: { spirits: [{ card: "BS01-005", label: "アタッカー", cores: 1 }] },
        },
        steps: (t) => {
            t.act("me", { type: "endTurn" })
            chooseColor(t, colors)
            t.act("opp", { type: "nextPhase" })
            t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
            settle(t, "opp")
            t.act("me", { type: "takeLife" })
        },
        expect: expectLines,
        mirror: false,
    })
}
// 相手のターン開始で入る差（ドロー1・コア+1）と、攻撃で疲労する差
const OPP_TURN = ["相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス", "相手.リザーブ: 10 → 11", "相手.アタッカー.疲労: false → true"]

console.log("=== P032 Lv3 / お互いのスタートステップ：赤を指定すると、赤の相手スピリットはシンボルを失い、アタックでライフが減らない ===")
p032StartStepScene("P032-Lv3で赤を指定", 5, ["赤", "red"], [...OPP_TURN])

console.log("=== P032 Lv3 / 赤以外（青）を指定したなら、赤のスピリットはシンボルを失わず、ライフが1減る ===")
p032StartStepScene("P032-Lv3で青を指定", 5, ["青", "blue"], [...OPP_TURN, "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"])

console.log("=== P032 Lv2 / この節はLv3限定：色の指定はなく、アタックでライフが1減る ===")
p032StartStepScene("P032-Lv2では働かない", 3, ["赤", "red"], [...OPP_TURN, "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"])

// ── P036 月光竜機クレセントール ──
// 相手が ジューゴン(コスト4)＋ビーム・ビートル（合体アタック時に相手のスピリット1体を疲労）で攻撃する。ビーム・ビートルは相手のブレイヴの例
const oppBraveAttack = (t: ScenarioCtx): void => {
    t.act("opp", { type: "combineBrave", braveInstanceId: t.id("ビーム・ビートル"), hostInstanceId: t.id("海獣ジューゴン") })
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("海獣ジューゴン") })
    settle(t, "opp")
    t.act("me", { type: "takeLife" })
}
// 相手の合体の差（合体するとブレイヴのコアはホストへ載り、ホストのBPにブレイヴのBPが乗る。シンボルが2つになるのでライフは2減る）
const OPP_COMBINE = [
    "相手.ビーム・ビートル.場所: フィールド → 合体",
    "相手.ビーム・ビートル.コア: 1 → 0",
    "相手.ビーム・ビートル.BP: 2000 → なし",
    "相手.海獣ジューゴン.BP: 3000 → 8000",
    "相手.海獣ジューゴン.Lv: 1 → 2",
    "相手.海獣ジューゴン.コア: 1 → 2",
    "相手.海獣ジューゴン.疲労: false → true",
    "自分.ライフ: 5 → 3",
    "自分.リザーブ: 10 → 12",
]

console.log("=== P036 / 月光の名前を持つ自分のスピリット（自身）は相手のブレイヴの効果を受けない：疲労させられない ===")
scenario({
    name: "P036-相手のブレイヴの効果を受けない",
    start: {
        turn: "opp",
        phase: "main",
        me: { spirits: [{ card: "P036", cores: 1 }] },
        opp: { spirits: [{ card: "BS03-042", cores: 1 }, { card: "BS10-068", cores: 1 }] },
    },
    steps: oppBraveAttack,
    expect: OPP_COMBINE,
})

console.log("=== P036 / 名前に月光が入っていない自分のスピリットは守られず、疲労させられる（P036 は対象にならない） ===")
scenario({
    name: "P036-月光でないスピリットは守られない",
    start: {
        turn: "opp",
        phase: "main",
        me: { spirits: [{ card: "P036", cores: 1 }, { card: "BS01-002", cores: 1 }] },
        opp: { spirits: [{ card: "BS03-042", cores: 1 }, { card: "BS10-068", cores: 1 }] },
    },
    steps: oppBraveAttack,
    expect: [...OPP_COMBINE, "自分.ロクケラトプス.疲労: false → true"],
})

console.log("=== P036 / 相手のブレイヴが無い場面の対照：P036 がいなければ P036 相当のスピリットも疲労する ===")
scenario({
    name: "P036-いなければ疲労する",
    start: {
        turn: "opp",
        phase: "main",
        me: { spirits: [{ card: "BS01-002", cores: 1 }] },
        opp: { spirits: [{ card: "BS03-042", cores: 1 }, { card: "BS10-068", cores: 1 }] },
    },
    steps: oppBraveAttack,
    expect: [...OPP_COMBINE, "自分.ロクケラトプス.疲労: false → true"],
})

// 合体時のブロック時の効果を試す。自分のターンにヘッジボルグと合体してターンを終え、相手が攻撃してくる
function p036BlockScene(name: string, p036Cores: number, combine: boolean, attacker: { card: string; cores: number }, expectLines: string[]): void {
    scenario({
        name,
        start: {
            turn: "me",
            phase: "main",
            me: { spirits: [{ card: "P036", cores: p036Cores }, ...(combine ? [{ card: "BS10-065", cores: 1 }] : [])] },
            opp: { spirits: [{ card: attacker.card, label: "アタッカー", cores: attacker.cores }] },
        },
        steps: (t) => {
            if (combine) t.act("me", { type: "combineBrave", braveInstanceId: t.id("ヘッジボルグ"), hostInstanceId: t.id("月光竜機クレセントール") })
            t.act("me", { type: "endTurn" })
            t.act("opp", { type: "nextPhase" })
            t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
            settle(t, "opp")
            t.act("me", { type: "block", instanceId: t.id("月光竜機クレセントール") })
            t.closeFlash()
        },
        expect: expectLines,
        mirror: false,
    })
}
// 相手のターン開始の差と、攻撃の疲労
const OPP_TURN_36 = ["相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス", "相手.リザーブ: 10 → 11", "相手.アタッカー.疲労: false → true"]
// 合体の差。ブレイヴのコアはホスト(P036)へ移る（コア3→4）ので、リザーブは動かない
const COMBINE_36 = [
    "自分.ヘッジボルグ.場所: フィールド → 合体",
    "自分.ヘッジボルグ.コア: 1 → 0",
    "自分.ヘッジボルグ.BP: 3000 → なし",
]

console.log("=== P036 Lv2・合体中のブロック時：BP10000ちょうどの相手に破壊されたら、コア1個をトラッシュに置いて回復状態で戻る ===")
p036BlockScene("P036-BP10000に破壊されて戻る", 3, true, { card: "BS10-009", cores: 5 }, [
    ...OPP_TURN_36,
    ...COMBINE_36,
    // 合体でコア4・BP8000。コア1個を置いて3個に。ブロックで疲労したが回復状態で戻る（合体中のブレイヴも一緒に回復状態）。Lv2のまま
    "自分.月光竜機クレセントール.BP: 5000 → 8000",
    "自分.トラッシュのコア: 0 → 1",
])

console.log("=== P036 Lv2・合体中／BP9000の相手に破壊されたときは戻らない（10000未満） ===")
p036BlockScene("P036-BP9000では戻らない", 3, true, { card: "BS10-009", cores: 3 }, [
    ...OPP_TURN_36,
    // 破壊されるとブレイヴは分離してスピリット状態でフィールドに残り、ブロックの疲労のまま
    "自分.ヘッジボルグ.疲労: false → true",
    "自分.月光竜機クレセントール.場所: フィールド → なし",
    "自分.トラッシュ: なし → 月光竜機クレセントール",
    "自分.リザーブ: 10 → 13",
])

console.log("=== P036 Lv2／合体していなければ（BP10000に破壊されても）戻らない ===")
p036BlockScene("P036-合体していない", 3, false, { card: "BS10-009", cores: 5 }, [
    ...OPP_TURN_36,
    "自分.月光竜機クレセントール.場所: フィールド → なし",
    "自分.トラッシュ: なし → 月光竜機クレセントール",
    "自分.リザーブ: 10 → 13",
])

console.log("=== P036 Lv1／合体していてもLv2限定の節は働かない（BP10000に破壊されても戻らない） ===")
p036BlockScene("P036-Lv1では戻らない", 1, true, { card: "BS10-009", cores: 5 }, [
    ...OPP_TURN_36,
    "自分.ヘッジボルグ.疲労: false → true",
    "自分.月光竜機クレセントール.場所: フィールド → なし",
    "自分.トラッシュ: なし → 月光竜機クレセントール",
    "自分.リザーブ: 10 → 11",
])

// ── P024 ふわねこ ──
// 相手のウィンガル(Lv1=5000)が攻撃し、P024(Lv1=1000)がブロックして破壊される。ブロックしたスピリットは疲労するので、戻ったかは「場所」で見る
const p024Scene = (name: string, mine: { card: string; cores?: number }[], oppExtra: { card: string; cores?: number }[], lines: string[]): void =>
    scenario({
        name,
        start: {
            turn: "opp",
            phase: "attack",
            me: { spirits: [{ card: "P024", cores: 1 }, ...mine] },
            opp: { spirits: [{ card: "BS02-046", label: "アタッカー", cores: 1 }, ...oppExtra] },
        },
        steps: (t) => {
            t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
            settle(t, "opp")
            t.act("me", { type: "block", instanceId: t.id("ふわねこ") })
            t.closeFlash()
        },
        expect: lines,
        mirror: true,
    })

console.log("=== P024 / 自分のフィールドに【聖命】を持つスピリットがいる間、破壊されても疲労状態でフィールドに戻る ===")
p024Scene("P024-聖命がいれば戻る", [{ card: "BS08-042", cores: 1 }], [], [
    "相手.アタッカー.疲労: false → true",
    "自分.ふわねこ.疲労: false → true",
])

console.log("=== P024 / 【聖命】を持つスピリットがいなければ、そのまま破壊される ===")
p024Scene("P024-聖命がいなければ破壊", [], [], [
    "相手.アタッカー.疲労: false → true",
    "自分.ふわねこ.場所: フィールド → なし",
    "自分.トラッシュ: なし → ふわねこ",
    "自分.リザーブ: 10 → 11",
])

console.log("=== P024 / 【聖命】を持つのが相手のスピリットだけなら、戻らない（自分のフィールド限定） ===")
p024Scene("P024-相手の聖命では戻らない", [], [{ card: "BS08-042", cores: 1 }], [
    "相手.アタッカー.疲労: false → true",
    "自分.ふわねこ.場所: フィールド → なし",
    "自分.トラッシュ: なし → ふわねこ",
    "自分.リザーブ: 10 → 11",
])

// ── P078 ハイビスカスの妖精アオイ ──
const p078Block = (name: string, mine: { card: string; cores?: number }[], oppExtra: { card: string; cores?: number }[], lines: string[]): void =>
    scenario({
        name,
        start: {
            turn: "opp",
            phase: "attack",
            me: { spirits: [{ card: "P078", cores: 1 }, ...mine] },
            opp: { spirits: [{ card: "BS02-046", label: "アタッカー", cores: 1 }, ...oppExtra] },
        },
        steps: (t) => {
            t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
            settle(t, "opp")
            t.act("me", { type: "block", instanceId: t.id("ハイビスカスの妖精アオイ") })
            t.closeFlash()
        },
        expect: lines,
    })

console.log("=== P078 / 自分の緑/白のスピリットがいる間、相手に破壊されたとき疲労状態でフィールドに残る（緑のヘラクレス・ジオがいる） ===")
p078Block("P078-緑がいれば残る", [{ card: "BS01-058", cores: 1 }], [], [
    "相手.アタッカー.疲労: false → true",
    "自分.ハイビスカスの妖精アオイ.疲労: false → true",
])

console.log("=== P078 / 白のスピリットでもよい ===")
p078Block("P078-白がいれば残る", [{ card: "BS03-042", cores: 1 }], [], [
    "相手.アタッカー.疲労: false → true",
    "自分.ハイビスカスの妖精アオイ.疲労: false → true",
])

console.log("=== P078 / 緑/白がいなければ（赤だけ）破壊される ===")
p078Block("P078-赤だけなら破壊", [{ card: "BS01-002", cores: 1 }], [], [
    "相手.アタッカー.疲労: false → true",
    "自分.ハイビスカスの妖精アオイ.場所: フィールド → なし",
    "自分.トラッシュ: なし → ハイビスカスの妖精アオイ",
    "自分.リザーブ: 10 → 11",
])

console.log("=== P078 / 緑のスピリットが相手側にしかいなければ破壊される（自分の緑/白限定） ===")
p078Block("P078-相手の緑では残らない", [], [{ card: "BS01-058", cores: 1 }], [
    "相手.アタッカー.疲労: false → true",
    "自分.ハイビスカスの妖精アオイ.場所: フィールド → なし",
    "自分.トラッシュ: なし → ハイビスカスの妖精アオイ",
    "自分.リザーブ: 10 → 11",
])

console.log("=== P078 Lv2 アタック時 / 自分の赤/紫/青のスピリットがいる間、コスト6以上の相手スピリットにブロックされない ===")
scenario({
    name: "P078-コスト6以上にブロックされない",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "P078", cores: 2 }, { card: "BS01-002", cores: 1 }] },
        opp: { spirits: [{ card: "BS10-039", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ハイビスカスの妖精アオイ") })
        settle(t, "me")
        t.actRejected("opp", { type: "block", instanceId: t.id("ビアンコ・ティーガー") })
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ハイビスカスの妖精アオイ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== P078 Lv2 / コスト5以下の相手スピリットにはブロックされうる（境界：メガロンはコスト5） ===")
scenario({
    name: "P078-コスト5はブロックできる",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "P078", cores: 2 }, { card: "BS01-002", cores: 1 }] },
        opp: { spirits: [{ card: "BS05-006", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ハイビスカスの妖精アオイ") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("城塞龍メガロン") })
        t.closeFlash()
    },
    // アオイ(Lv2=3000)がメガロン(Lv1=5000)に負ける。緑/白がいないので残らない
    expect: [
        "自分.ハイビスカスの妖精アオイ.場所: フィールド → なし",
        "自分.トラッシュ: なし → ハイビスカスの妖精アオイ",
        "自分.リザーブ: 10 → 12",
        "相手.城塞龍メガロン.疲労: false → true",
    ],
})

console.log("=== P078 Lv2 / 自分に赤/紫/青がいなければ（黄のピヨンだけ）、コスト6の相手にブロックされうる ===")
scenario({
    name: "P078-赤紫青がいなければブロックされる",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "P078", cores: 2 }, { card: "BS02-049", cores: 1 }] },
        opp: { spirits: [{ card: "BS10-039", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ハイビスカスの妖精アオイ") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ビアンコ・ティーガー") })
        t.closeFlash()
    },
    expect: [
        "自分.ハイビスカスの妖精アオイ.場所: フィールド → なし",
        "自分.トラッシュ: なし → ハイビスカスの妖精アオイ",
        "自分.リザーブ: 10 → 12",
        "相手.ビアンコ・ティーガー.疲労: false → true",
    ],
})

console.log("=== P078 Lv1 / アタック時の節はLv2限定：赤がいてもコスト6にブロックされうる ===")
scenario({
    name: "P078-Lv1ではブロックされる",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "P078", cores: 1 }, { card: "BS01-002", cores: 1 }] },
        opp: { spirits: [{ card: "BS10-039", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ハイビスカスの妖精アオイ") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ビアンコ・ティーガー") })
        t.closeFlash()
    },
    expect: [
        "自分.ハイビスカスの妖精アオイ.場所: フィールド → なし",
        "自分.トラッシュ: なし → ハイビスカスの妖精アオイ",
        "自分.リザーブ: 10 → 11",
        "相手.ビアンコ・ティーガー.疲労: false → true",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part713）")
