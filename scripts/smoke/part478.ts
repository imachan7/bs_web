// smoke パート478（BS11 の未発火エントリ：効果文だけから書いた場面テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1）
const BRAVE = "BS10-071" // フェンリルキャノンType-B（白・コスト4・シンボル1。合体時は【装甲：赤/紫】だけ）
const HAMP = "BS03-020" // メガ・ハンプダンプ（紫・コスト5・バニラ）
const WINGAL = "BS02-046" // ウィンガル（白・コスト6・バニラ BP5000）
const METEOR = "BS07-067" // メテオフォール（赤マジック・コスト2・フラッシュ）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, name: string, type: string, cost: number) => {
        const c = getCard(id)
        assert(c.name === name && c.type === type && c.cost === cost, `${id} は ${name}（${type}・コスト${cost}）`)
    }
    chk("BS11-016", "邪眼皇ゼナス", "spirit", 7)
    chk("BS11-013", "グラシャハウンド", "spirit", 4)
    chk(VANILLA, "ロクケラトプス", "spirit", 1)
    chk(BRAVE, "フェンリルキャノンType-B", "brave", 4)
    chk(HAMP, "メガ・ハンプダンプ", "spirit", 5)
    chk(WINGAL, "ウィンガル", "spirit", 6)
    chk(METEOR, "メテオフォール", "magic", 2)
}

const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option" && (pc.options ?? []).includes("発動する")
}

// 選択待ちを答え切る。確認（「発動する」）は押して回数を返す。確認以外は先頭の候補
function drive(t: ScenarioCtx, decline = false): number {
    let confirms = 0
    while (t.state.pendingChoice) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(t)) {
            confirms++
            const no = (pc.options ?? []).find((o) => o !== "発動する")
            t.act(side, { type: "resolveChoice", option: decline && no ? no : "発動する" })
        } else {
            t.act(side, pc.kind === "option" ? { type: "resolveChoice", option: pc.options![0]! } : { type: "resolveChoice", instanceId: pc.candidates[0]! })
        }
        if (confirms > 6) throw new Error("確認が繰り返し出ている")
    }
    return confirms
}

// フラッシュの優先権を side に回す（相手が先に持っているときは相手がパスする）
function takePriority(t: ScenarioCtx, side: "me" | "opp"): void {
    const want = side === "me" ? t.me : t.opp
    if (t.state.priorityPlayer !== want) t.act(side === "me" ? "opp" : "me", { type: "pass" })
    assert(t.state.priorityPlayer === want && t.state.isFlashTiming, "フラッシュの優先権が回ってきた")
}

// side のスピリット who がアタックし、相手が blocker でブロックする（省略時はブロックしない→ライフで受ける）
function fight(t: ScenarioCtx, side: "me" | "opp", who: string, blocker?: string, targetLabel?: string): number {
    const other = side === "me" ? "opp" : "me"
    let n = 0
    t.act(side, { type: "nextPhase" })
    t.act(side, { type: "attack", instanceId: t.id(who), ...(targetLabel ? { targetSpiritInstanceId: t.id(targetLabel) } : {}) })
    n += drive(t)
    if (t.state.battle) {
        t.closeFlash()
        n += drive(t)
        if (blocker) {
            t.act(other, { type: "block", instanceId: t.id(blocker) })
            n += drive(t)
            t.closeFlash()
            n += drive(t)
        } else if (t.state.battle && !t.state.pendingChoice) {
            t.act(other, { type: "takeLife" })
            n += drive(t)
        }
    }
    return n
}


// ===== BS11-016 邪眼皇ゼナス：自分のスピリットが【不死】の効果で召喚されたとき、疲労状態の相手のスピリット1体を破壊 =====
const ZENAS = "BS11-016"
const GRASHA = "BS11-013" // 【不死：コスト5/6】

// ブロッカーは白（紫の軽減シンボルを増やさない）。ゼナスは紫シンボル1つ
const zenasMe = (trash: string[]) => ({
    trash,
    spirits: [{ card: ZENAS }, { card: WINGAL, label: "ブロッカー" }],
})
const zenasOpp = { spirits: [{ card: WINGAL, label: "アタッカー", cores: 4 }] }

console.log("=== ゼナス1. 不死で召喚されたら、疲労した相手のスピリットを破壊する ===")
scenario({
    name: "zenas-undead",
    start: { turn: "opp", me: zenasMe([GRASHA]), opp: zenasOpp },
    steps: (t) => fight(t, "opp", "アタッカー", "ブロッカー"),
    expect: [
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.トラッシュ: グラシャハウンド → ウィンガル",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.グラシャハウンド.BP: なし → 3000",
        "自分.グラシャハウンド.Lv: なし → 1",
        "自分.グラシャハウンド.コア: なし → 1",
        "自分.グラシャハウンド.場所: なし → フィールド",
        "自分.グラシャハウンド.疲労: なし → false",
        "相手.アタッカー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ウィンガル",
        "相手.リザーブ: 10 → 14",
    ],
})

console.log("=== ゼナス2. 不死のカードがトラッシュに無ければ、相手のスピリットは破壊されない ===")
scenario({
    name: "zenas-no-undead",
    start: { turn: "opp", me: zenasMe([]), opp: zenasOpp },
    steps: (t) => fight(t, "opp", "アタッカー", "ブロッカー"),
    expect: [
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ウィンガル",
        "自分.リザーブ: 10 → 11",
        "相手.アタッカー.疲労: false → true",
    ],
})

console.log("=== ゼナス3. 手札から普通に召喚した場合は破壊されない（不死の効果ではない） ===")
scenario({
    name: "zenas-normal-summon",
    start: { me: { hand: [GRASHA], spirits: [{ card: ZENAS }] }, opp: { spirits: [{ card: WINGAL, label: "アタッカー", rested: true }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        drive(t)
    },
    expect: [
        "自分.手札: グラシャハウンド → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.グラシャハウンド.BP: なし → 3000",
        "自分.グラシャハウンド.Lv: なし → 1",
        "自分.グラシャハウンド.コア: なし → 1",
        "自分.グラシャハウンド.場所: なし → フィールド",
        "自分.グラシャハウンド.疲労: なし → false",
    ],
})

// ===== BS11-034 星馬コルット：相手のスピリットの効果で破壊されたとき、シンボル2つ以上の相手の合体スピリットすべてを分離させる =====
const COLT = "BS11-034"
const ARC = "BS07-005" // 天槍の勇者アーク（赤・コスト4・シンボル1）Lv2『アタック時』BP2000以下の相手のスピリット1体を破壊

const coltOpp = (cores: number) => ({ spirits: [{ card: ARC, label: "アーク", cores }, { card: BRAVE, label: "ブレイヴ" }] })
const combinedCount = (t: ScenarioCtx) => t.state.players[t.opp].field.combinedBraves.length

console.log("=== コルット1. 相手のスピリットの効果で破壊されたら、シンボル2つの合体スピリットが分離する ===")
scenario({
    name: "colt-separate",
    start: { turn: "opp", me: { spirits: [{ card: COLT }] }, opp: coltOpp(3) },
    steps: (t) => {
        t.act("opp", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("アーク") })
        assert(combinedCount(t) === 1, "アタック前は合体している")
        fight(t, "opp", "アーク")
        assert(combinedCount(t) === 0, "コルットが破壊されたあと、合体スピリットは分離している")
    },
    expect: [
        "自分.星馬コルット.場所: フィールド → なし",
        "自分.トラッシュ: なし → 星馬コルット",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 12",
        "相手.アーク.疲労: false → true",
        "相手.ブレイヴ.疲労: false → true",
    ],
})

console.log("=== コルット2. バトルで破壊されたときは分離しない（スピリットの効果ではない） ===")
scenario({
    name: "colt-battle",
    start: { turn: "opp", me: { spirits: [{ card: COLT }] }, opp: coltOpp(1) },
    steps: (t) => {
        t.act("opp", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("アーク") })
        fight(t, "opp", "アーク", "星馬コルット")
        assert(combinedCount(t) === 1, "バトルで破壊されても合体したまま")
    },
    expect: [
        "自分.星馬コルット.場所: フィールド → なし",
        "自分.トラッシュ: なし → 星馬コルット",
        "自分.リザーブ: 10 → 11",
        "相手.アーク.疲労: false → true",
        "相手.アーク.BP: 3000 → 6000",
        "相手.ブレイヴ.BP: 3000 → なし",
        "相手.ブレイヴ.コア: 1 → 0",
        "相手.ブレイヴ.場所: フィールド → 合体",
        "相手.リザーブ: 10 → 11",
    ],
})

// ===== BS11-040 神獣ヒキュー：【合体時】Lv2･Lv3 合体アタック時、自分がマジックの効果を使用したとき、このスピリットは回復する =====
const HIKYU = "BS11-040"

const hikyuMe = (combined: boolean) => ({
    hand: [METEOR],
    spirits: [{ card: HIKYU, cores: 2 }, { card: VANILLA, label: "標的" }, ...(combined ? [{ card: BRAVE, label: "ブレイヴ" }] : [])],
})
const combineBraveStep = (t: ScenarioCtx) => t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("神獣ヒキュー") })
const combineLines = ["自分.ブレイヴ.BP: 3000 → なし", "自分.ブレイヴ.コア: 1 → 0", "自分.ブレイヴ.場所: フィールド → 合体"]

console.log("=== ヒキュー1. 合体アタック中にマジックを使うと回復する ===")
scenario({
    name: "hikyu-magic",
    start: { me: hikyuMe(true) },
    steps: (t) => {
        combineBraveStep(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("神獣ヒキュー") })
        assert(t.inst("神獣ヒキュー").isRested, "アタックして疲労している")
        takePriority(t, "me")
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("標的") })
        drive(t)
        assert(!t.inst("神獣ヒキュー").isRested, "マジックを使ったので回復した")
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        ...combineLines,
        "自分.神獣ヒキュー.BP: 5000 → 8000",
        "自分.トラッシュのコア: 0 → 1",
        "自分.標的.BP: 1000 → 3000",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== ヒキュー2. マジックを使わなければ回復しない ===")
scenario({
    name: "hikyu-no-magic",
    start: { me: hikyuMe(true) },
    steps: (t) => {
        combineBraveStep(t)
        fight(t, "me", "神獣ヒキュー")
    },
    expect: [
        ...combineLines,
        "自分.神獣ヒキュー.BP: 5000 → 8000",
        "自分.神獣ヒキュー.疲労: false → true",
        "自分.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== ヒキュー3. 合体していなければ（合体アタックではないので）回復しない ===")
scenario({
    name: "hikyu-not-combined",
    start: { me: hikyuMe(false) },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("神獣ヒキュー") })
        takePriority(t, "me")
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("標的") })
        drive(t)
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.神獣ヒキュー.疲労: false → true",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 9",
        "自分.標的.BP: 1000 → 3000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ===== BS11-X05 魔導双神ジェミナイズ：系統「神星」/「光導」/「星魂」の自分のスピリットが手札から召喚されたとき、デッキの上を1枚オープン =====
const GEMINI = "BS11-X05"
const deckOf = (top: string[]) => [...top, ...Array.from({ length: 38 }, () => VANILLA)]

console.log("=== ジェミナイズ1. 星魂のコルットを召喚 → 山札の上がスピリットなら、コストを払わず召喚される ===")
scenario({
    name: "gemini-spirit",
    start: { me: { hand: [COLT], deck: deckOf([WINGAL]), spirits: [{ card: GEMINI }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        drive(t)
    },
    expect: [
        "自分.デッキ枚数: 39 → 38",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 7",
        "自分.手札: 星馬コルット → なし",
        "自分.星馬コルット.BP: なし → 2000",
        "自分.星馬コルット.Lv: なし → 1",
        "自分.星馬コルット.コア: なし → 1",
        "自分.星馬コルット.場所: なし → フィールド",
        "自分.星馬コルット.疲労: なし → false",
        "自分.ウィンガル.BP: なし → 5000",
        "自分.ウィンガル.Lv: なし → 1",
        "自分.ウィンガル.コア: なし → 1",
        "自分.ウィンガル.場所: なし → フィールド",
        "自分.ウィンガル.疲労: なし → false",
    ],
})

console.log("=== ジェミナイズ2. 山札の上がスピリット/ブレイヴ以外なら、手札に加わる ===")
scenario({
    name: "gemini-magic",
    start: { me: { hand: [COLT], deck: deckOf([METEOR]), spirits: [{ card: GEMINI }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        drive(t)
    },
    expect: [
        "自分.デッキ枚数: 39 → 38",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 8",
        "自分.手札: 星馬コルット → メテオフォール",
        "自分.星馬コルット.BP: なし → 2000",
        "自分.星馬コルット.Lv: なし → 1",
        "自分.星馬コルット.コア: なし → 1",
        "自分.星馬コルット.場所: なし → フィールド",
        "自分.星馬コルット.疲労: なし → false",
    ],
})

console.log("=== ジェミナイズ3. 系統が合わないスピリットを召喚しても、オープンしない ===")
scenario({
    name: "gemini-wrong-family",
    start: { me: { hand: [VANILLA], deck: deckOf([WINGAL]), spirits: [{ card: GEMINI }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        drive(t)
    },
    expect: [
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 8",
        "自分.手札: ロクケラトプス → なし",
        "自分.ロクケラトプス.BP: なし → 1000",
        "自分.ロクケラトプス.Lv: なし → 1",
        "自分.ロクケラトプス.コア: なし → 1",
        "自分.ロクケラトプス.場所: なし → フィールド",
        "自分.ロクケラトプス.疲労: なし → false",
    ],
})

// ===== BS11-052 魔銃ヴェスパー：【合体時】合体アタック時、このスピリットのシンボル1つにつき、相手のスピリット上のコア1個を相手のリザーブに置く =====
const VESPER = "BS11-052"

const vesperMe = (combined: boolean) => ({
    spirits: [{ card: HAMP, label: "ホスト" }, ...(combined ? [{ card: VESPER, label: "ヴェスパー" }] : [])],
})
const vesperOpp = { spirits: [{ card: VANILLA, label: "標的", cores: 3 }] }

console.log("=== ヴェスパー1. 合体アタックで、合体スピリットのシンボル（2つ）の数だけ相手のスピリット上のコアが外れる ===")
scenario({
    name: "vesper-combined",
    start: { me: vesperMe(true), opp: vesperOpp },
    steps: (t) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ヴェスパー"), hostInstanceId: t.id("ホスト") })
        fight(t, "me", "ホスト")
    },
    expect: [
        "自分.ヴェスパー.BP: 3000 → なし",
        "自分.ヴェスパー.コア: 1 → 0",
        "自分.ヴェスパー.場所: フィールド → 合体",
        "自分.リザーブ: 10 → 11",
        "自分.ホスト.BP: 3000 → 6000",
        "自分.ホスト.疲労: false → true",
        "相手.標的.コア: 3 → 1",
        "相手.標的.Lv: 3 → 1",
        "相手.標的.BP: 4000 → 1000",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 14",
    ],
})

console.log("=== ヴェスパー2. 合体していなければ（ホストだけのアタックでは）コアは外れない ===")
scenario({
    name: "vesper-not-combined",
    start: { me: vesperMe(false), opp: vesperOpp },
    steps: (t) => fight(t, "me", "ホスト"),
    expect: ["自分.ホスト.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ===== BS11-053 カーミュラ1 =====
const KARMURA = "BS11-053" // 緑ブレイヴ・コスト4・シンボル0
const JAMBI = "BS11-049" // 神速を持たない赤ブレイヴ・コスト4

console.log("=== カーミュラ1-a. 合体アタックで相手のライフを減らしたとき、さらにライフのコア1個が相手のリザーブへ ===")
scenario({
    name: "karmura-life",
    start: { me: { spirits: [{ card: HAMP, label: "ホスト" }, { card: KARMURA, label: "カーミュラ" }] }, opp: {} },
    steps: (t) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("カーミュラ"), hostInstanceId: t.id("ホスト") })
        fight(t, "me", "ホスト")
    },
    expect: [
        "自分.カーミュラ.BP: 3000 → なし",
        "自分.カーミュラ.コア: 1 → 0",
        "自分.カーミュラ.場所: フィールド → 合体",
        "自分.ホスト.BP: 3000 → 6000",
        "自分.ホスト.疲労: false → true",
        "自分.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== カーミュラ1-b. ブロックされてライフが減らなかったときは、何も起きない ===")
scenario({
    name: "karmura-blocked",
    start: { me: { spirits: [{ card: HAMP, label: "ホスト" }, { card: KARMURA, label: "カーミュラ" }] }, opp: { spirits: [{ card: VANILLA, label: "ブロッカー" }] } },
    steps: (t) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("カーミュラ"), hostInstanceId: t.id("ホスト") })
        fight(t, "me", "ホスト", "ブロッカー")
    },
    expect: [
        "自分.カーミュラ.BP: 3000 → なし",
        "自分.カーミュラ.コア: 1 → 0",
        "自分.カーミュラ.場所: フィールド → 合体",
        "自分.ホスト.BP: 3000 → 6000",
        "自分.ホスト.疲労: false → true",
        "自分.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ブロッカー.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== カーミュラ1-c. 【神速】：フラッシュタイミングに手札から召喚できる ===")
scenario({
    name: "karmura-shinsoku",
    start: { me: { hand: [KARMURA], spirits: [{ card: HAMP, label: "ホスト" }] }, opp: { spirits: [{ card: VANILLA, label: "ブロッカー" }] } },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ホスト") })
        takePriority(t, "me")
        t.act("me", { type: "summon", handIndex: 0 })
        drive(t)
    },
    expect: [
        "自分.カーミュラ1.BP: なし → 3000",
        "自分.カーミュラ1.Lv: なし → 1",
        "自分.カーミュラ1.コア: なし → 1",
        "自分.カーミュラ1.場所: なし → フィールド",
        "自分.カーミュラ1.疲労: なし → false",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ホスト.疲労: false → true",
        "自分.リザーブ: 10 → 5",
        "自分.手札: カーミュラ1 → なし",
    ],
})

console.log("=== カーミュラ1-d. 【神速】を持たないブレイヴは、フラッシュタイミングに召喚できない ===")
scenario({
    name: "jambi-no-shinsoku",
    start: { me: { hand: [JAMBI], spirits: [{ card: HAMP, label: "ホスト" }] }, opp: { spirits: [{ card: VANILLA, label: "ブロッカー" }] } },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ホスト") })
        takePriority(t, "me")
        t.actRejected("me", { type: "summon", handIndex: 0 })
    },
    expect: ["自分.ホスト.疲労: false → true"],
})

// ===== BS11-X01 太陽神龍ライジング・アポロドラゴン：【合体中】Lv3 アタック時、BPを比べ相手のスピリットだけを破壊したとき、相手のスピリット/ブレイヴ/ネクサス1つを破壊 =====
const APOLLO = "BS11-X01"
const CASTLE = "BS01-102" // 主無き古城（紫ネクサス）

const apolloOpp = { spirits: [{ card: VANILLA, label: "ブロッカー" }], nexuses: [{ card: CASTLE, cores: 0 }] }
const apolloMe = (cores: number, combined: boolean) => ({ spirits: [{ card: APOLLO, cores }, ...(combined ? [{ card: BRAVE, label: "ブレイヴ" }] : [])] })
const apolloAttack = (combined: boolean) => (t: ScenarioCtx) => {
    if (combined) t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("太陽神龍ライジング・アポロドラゴン") })
    fight(t, "me", "太陽神龍ライジング・アポロドラゴン", "ブロッカー")
}
const apolloCombine = ["自分.ブレイヴ.BP: 3000 → なし", "自分.ブレイヴ.コア: 1 → 0", "自分.ブレイヴ.場所: フィールド → 合体", "自分.リザーブ: 10 → 11"]

console.log("=== アポロ1. 合体中のLv3：ブロッカーだけを破壊したら、相手のネクサスも破壊される ===")
scenario({
    name: "apollo-extra",
    start: { me: apolloMe(5, true), opp: apolloOpp },
    steps: apolloAttack(true),
    expect: [
        ...apolloCombine,
        "自分.太陽神龍ライジング・アポロドラゴン.BP: 11000 → 14000",
        "自分.太陽神龍ライジング・アポロドラゴン.疲労: false → true",
        "相手.ブロッカー.場所: フィールド → なし",
        "相手.主無き古城.場所: ネクサス → なし",
        "相手.トラッシュ: なし → ロクケラトプス、主無き古城",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== アポロ2. Lv2 のときは追加の破壊は起きない ===")
scenario({
    name: "apollo-lv2",
    start: { me: apolloMe(3, true), opp: apolloOpp },
    steps: apolloAttack(true),
    expect: [
        ...apolloCombine,
        "自分.太陽神龍ライジング・アポロドラゴン.BP: 9000 → 12000",
        "自分.太陽神龍ライジング・アポロドラゴン.疲労: false → true",
        "相手.ブロッカー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== アポロ3. 合体していなければ（Lv3でも）追加の破壊は起きない ===")
scenario({
    name: "apollo-not-combined",
    start: { me: apolloMe(5, false), opp: apolloOpp },
    steps: apolloAttack(false),
    expect: [
        "自分.太陽神龍ライジング・アポロドラゴン.疲労: false → true",
        "相手.ブロッカー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ===== BS11-X06 天秤造神リブラ・ゴレム：Lv3 アタック時、【粉砕】で相手のデッキからスピリットカードが破棄されたとき、このスピリットは回復する =====
const LIBRA = "BS11-X06"
const oppDeck = (top: string[]) => [...top, ...Array.from({ length: 40 - top.length }, () => VANILLA)]

console.log("=== リブラ1. 粉砕（3枚）の中にスピリットがあれば回復する（回復状態の間はライフを減らせない） ===")
scenario({
    name: "libra-spirit",
    start: { me: { spirits: [{ card: LIBRA, cores: 4 }] }, opp: { deck: oppDeck([METEOR, METEOR, VANILLA]) } },
    steps: (t) => {
        fight(t, "me", "天秤造神リブラ・ゴレム")
        assert(!t.inst("天秤造神リブラ・ゴレム").isRested, "回復している")
    },
    expect: ["相手.デッキ枚数: 40 → 37", "相手.トラッシュ: なし → メテオフォール、メテオフォール、ロクケラトプス"],
})

console.log("=== リブラ2. 粉砕した3枚にスピリットが無ければ回復しない（4枚目のスピリットは対象外） ===")
scenario({
    name: "libra-no-spirit",
    start: { me: { spirits: [{ card: LIBRA, cores: 4 }] }, opp: { deck: oppDeck([METEOR, METEOR, METEOR]) } },
    steps: (t) => {
        fight(t, "me", "天秤造神リブラ・ゴレム")
        assert(t.inst("天秤造神リブラ・ゴレム").isRested, "疲労したまま")
    },
    expect: [
        "相手.デッキ枚数: 40 → 37",
        "相手.トラッシュ: なし → メテオフォール、メテオフォール、メテオフォール",
        "自分.天秤造神リブラ・ゴレム.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== リブラ3. Lv2 では回復しない（Lv3 の効果） ===")
scenario({
    name: "libra-lv2",
    start: { me: { spirits: [{ card: LIBRA, cores: 2 }] }, opp: { deck: oppDeck([VANILLA, VANILLA, VANILLA]) } },
    steps: (t) => fight(t, "me", "天秤造神リブラ・ゴレム"),
    expect: [
        "相手.デッキ枚数: 40 → 38",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "自分.天秤造神リブラ・ゴレム.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("すべてのチェックに合格しました 🎉（part478）")
