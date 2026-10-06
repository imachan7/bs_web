// smoke パート478（BS11 の未発火エントリ：効果文だけから書いた場面テスト）
import { assert, effectiveBp, getCard } from "./helpers"
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
    return pc !== null && pc.kind === "option" && (pc.options ?? []).some((o) => o === "発動する" || o === "無効にする")
}

// 選択待ちを答え切る。確認（「発動する」）は押して回数を返す。確認以外は先頭の候補
function drive(t: ScenarioCtx, decline = false): number {
    let confirms = 0
    while (t.state.pendingChoice) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(t)) {
            confirms++
            const yes = (pc.options ?? []).find((o) => o === "発動する" || o === "無効にする")!
            const no = (pc.options ?? []).find((o) => o !== yes)
            // 断る選択肢が文面にあればそれを、無ければ何も選ばずに答える（任意の選択のスキップ）
            t.act(side, decline ? (no ? { type: "resolveChoice", option: no } : { type: "resolveChoice" }) : { type: "resolveChoice", option: yes })
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

// ===== BS11-062 オールトの竜巣 =====
const OORT = "BS11-062"
const VOLGAMES = "BS11-001" // 系統「星竜」・赤・コスト1・軽減シンボルなし
const SALAMANDERT = "BS03-001" // 赤・コスト1・軽減シンボルなし・系統は「空牙」

console.log("=== オールト1-a. 手札の系統「星竜」のスピリットに軽減シンボル[赤]が付き、ネクサスの赤シンボルで軽減できる ===")
scenario({
    name: "oort-reduction",
    start: { me: { hand: [VOLGAMES], nexuses: [{ card: OORT, cores: 0 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: ボルガメス → なし",
        "自分.リザーブ: 10 → 9",
        "自分.ボルガメス.BP: なし → 1000",
        "自分.ボルガメス.Lv: なし → 1",
        "自分.ボルガメス.コア: なし → 1",
        "自分.ボルガメス.場所: なし → フィールド",
        "自分.ボルガメス.疲労: なし → false",
    ],
})

console.log("=== オールト1-b. 系統「星竜」を持たないスピリットには付かない ===")
scenario({
    name: "oort-reduction-other-family",
    start: { me: { hand: [SALAMANDERT], nexuses: [{ card: OORT, cores: 0 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 火精サラマンダート → なし",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 1",
        "自分.火精サラマンダート.BP: なし → 2000",
        "自分.火精サラマンダート.Lv: なし → 1",
        "自分.火精サラマンダート.コア: なし → 1",
        "自分.火精サラマンダート.場所: なし → フィールド",
        "自分.火精サラマンダート.疲労: なし → false",
    ],
})

const oortMe = (oortCores: number, combined: boolean) => ({
    trash: [WINGAL],
    nexuses: [{ card: OORT, cores: oortCores }],
    spirits: [{ card: HAMP, label: "ホスト" }, ...(combined ? [{ card: BRAVE, label: "ブレイヴ" }] : [])],
})
const oortRun = (combined: boolean) => (t: ScenarioCtx) => {
    if (combined) t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("ホスト") })
    fight(t, "me", "ホスト", "ブロッカー")
}
const oortOpp = { spirits: [{ card: VANILLA, label: "ブロッカー" }] }
const oortBattle = ["自分.ホスト.疲労: false → true", "相手.ブロッカー.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"]
const oortCombine = ["自分.ブレイヴ.BP: 3000 → なし", "自分.ブレイヴ.コア: 1 → 0", "自分.ブレイヴ.場所: フィールド → 合体", "自分.ホスト.BP: 3000 → 6000", "自分.リザーブ: 10 → 11"]

console.log("=== オールト2-a. Lv2：合体スピリットがBPを比べスピリットだけを破壊したら、トラッシュのスピリット1枚が手札に戻る ===")
scenario({
    name: "oort-battlewon",
    start: { me: oortMe(1, true), opp: oortOpp },
    steps: oortRun(true),
    expect: [...oortCombine, ...oortBattle, "自分.トラッシュ: ウィンガル → なし", "自分.手札: なし → ウィンガル"],
})

console.log("=== オールト2-b. Lv1 では戻らない ===")
scenario({
    name: "oort-battlewon-lv1",
    start: { me: oortMe(0, true), opp: oortOpp },
    steps: oortRun(true),
    expect: [...oortCombine, ...oortBattle],
})

console.log("=== オールト2-c. 合体していないスピリットでは戻らない ===")
scenario({
    name: "oort-battlewon-not-combined",
    start: { me: oortMe(1, false), opp: oortOpp },
    steps: oortRun(false),
    expect: oortBattle,
})

// ===== BS11-013 グラシャハウンド：自分のトラッシュにある【不死】を持つスピリットカードすべてに軽減シンボル[紫]を与える =====
const GAHERIS = "BS11-010" // 闇騎士ガヘリス（紫・コスト2・軽減シンボルなし・【不死：コスト3】）
const LOM = "BS02-059" // ロム（黄・コスト3・バニラ）

const grashaMe = (fieldCard: string) => ({ trash: [GAHERIS], spirits: [{ card: fieldCard, label: "紫の源" }, { card: LOM, label: "ブロッカー" }] })
const grashaOpp = { spirits: [{ card: WINGAL, label: "アタッカー", cores: 4 }] }
const gahDrop = ["自分.ブロッカー.場所: フィールド → なし", "自分.トラッシュ: ガヘリス → ロム".replace("ガヘリス", "闇騎士ガヘリス"), "相手.アタッカー.疲労: false → true"]
const gahSummoned = ["自分.闇騎士ガヘリス.BP: なし → 1000", "自分.闇騎士ガヘリス.Lv: なし → 1", "自分.闇騎士ガヘリス.コア: なし → 1", "自分.闇騎士ガヘリス.場所: なし → フィールド", "自分.闇騎士ガヘリス.疲労: なし → false"]

console.log("=== グラシャハウンド1. 場にいる間、トラッシュの不死スピリットは紫のシンボルで1だけ軽減して召喚できる ===")
scenario({
    name: "grasha-grant",
    start: { turn: "opp", me: grashaMe(GRASHA), opp: grashaOpp },
    steps: (t) => fight(t, "opp", "アタッカー", "ブロッカー"),
    expect: [...gahDrop, ...gahSummoned, "自分.リザーブ: 10 → 9", "自分.トラッシュのコア: 0 → 1"],
})

console.log("=== グラシャハウンド2. 同じ紫シンボル1つでも、グラシャハウンドがいなければ軽減されない ===")
scenario({
    name: "grasha-none",
    start: { turn: "opp", me: grashaMe(HAMP), opp: grashaOpp },
    steps: (t) => fight(t, "opp", "アタッカー", "ブロッカー"),
    expect: [...gahDrop, ...gahSummoned, "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 2"],
})

// ===== BS11-049 ジャンビ・オレピス：【合体時】フラッシュ【覚醒】 =====
console.log("=== ジャンビ1. 合体していれば、自分のスピリット上のコアを合体スピリット上に置ける ===")
scenario({
    name: "jambi-awaken",
    start: { me: { spirits: [{ card: HAMP, label: "ホスト" }, { card: JAMBI, label: "ジャンビ" }, { card: VANILLA, label: "供給元", cores: 3 }] } },
    steps: (t) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ジャンビ"), hostInstanceId: t.id("ホスト") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ホスト") })
        takePriority(t, "me")
        t.act("me", { type: "awaken", instanceId: t.id("ホスト"), fromInstanceId: t.id("供給元"), count: 2 })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ホスト.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.ジャンビ.BP: 2000 → なし",
        "自分.ジャンビ.コア: 1 → 0",
        "自分.ジャンビ.場所: フィールド → 合体",
        "自分.リザーブ: 10 → 11",
        "自分.ホスト.コア: 1 → 3",
        "自分.ホスト.Lv: 1 → 2",
        "自分.ホスト.BP: 3000 → 6000",
        "自分.供給元.コア: 3 → 1",
        "自分.供給元.Lv: 3 → 1",
        "自分.供給元.BP: 4000 → 1000",
    ],
})

console.log("=== ジャンビ2. 合体していなければ覚醒できない ===")
scenario({
    name: "jambi-not-combined",
    start: { me: { spirits: [{ card: HAMP, label: "ホスト" }, { card: JAMBI, label: "ジャンビ" }, { card: VANILLA, label: "供給元", cores: 3 }] } },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ホスト") })
        takePriority(t, "me")
        t.actRejected("me", { type: "awaken", instanceId: t.id("ホスト"), fromInstanceId: t.id("供給元"), count: 2 })
    },
    expect: ["自分.ホスト.疲労: false → true"],
})

// ===== BS11-047 海王神獣トライ・ポセイドス：『自分のアタックステップ』自分のコスト7以上のスピリットすべてを最高Lvとして扱う（Lv2 はさらに BP+3000） =====
const POSEIDOS = "BS11-047"
const DWAFFU = "BS05-045" // ドワッフー・セブン（黄・コスト7・バニラ。Lv1 BP5000 → Lv3 BP7000）
const TORNEDRA = "BS10-009" // トルネードラ（赤・コスト6・バニラ）

const poseidosField = (cores: number) => ({
    spirits: [{ card: POSEIDOS, cores }, { card: DWAFFU, label: "コスト7" }, { card: TORNEDRA, label: "コスト6" }],
})
const poseidosOpp = { spirits: [{ card: DWAFFU, label: "相手のコスト7" }] }

console.log("=== ポセイドス1. Lv1：アタックステップに入ると、コスト7のスピリットだけが最高Lv（Lv3）として扱われる ===")
scenario({
    name: "poseidos-lv1",
    start: { me: poseidosField(1), opp: poseidosOpp },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.コスト7.BP: 5000 → 7000", "自分.コスト7.Lv: 1 → 3"],
})

console.log("=== ポセイドス2. Lv2：さらにコスト7以上のスピリットがBP+3000される ===")
scenario({
    name: "poseidos-lv2",
    start: { me: poseidosField(4), opp: poseidosOpp },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.コスト7.BP: 5000 → 10000", "自分.コスト7.Lv: 1 → 3"],
})

console.log("=== ポセイドス3. 相手のアタックステップでは働かない ===")
scenario({
    name: "poseidos-opp-turn",
    start: { turn: "opp", me: poseidosField(4), opp: poseidosOpp },
    steps: (t) => t.act("opp", { type: "nextPhase" }),
    expect: [],
})

// ===== BS11-X03 星騎士ハーキュリーΩ：自分のライフが3以下の間、手札にあるこのスピリットカードのコストを4にする =====
const HERCULES = "BS11-X03" // 緑・コスト7

const hercSummon = (life: number, reserve: number, spent: number) => ({
    start: { me: { life, reserve, hand: [HERCULES] } },
    steps: (t: ScenarioCtx) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 星騎士ハーキュリーΩ → なし",
        `自分.リザーブ: ${reserve} → ${reserve - spent - 1}`,
        `自分.トラッシュのコア: 0 → ${spent}`,
        "自分.星騎士ハーキュリーΩ.BP: なし → 6000",
        "自分.星騎士ハーキュリーΩ.Lv: なし → 1",
        "自分.星騎士ハーキュリーΩ.コア: なし → 1",
        "自分.星騎士ハーキュリーΩ.場所: なし → フィールド",
        "自分.星騎士ハーキュリーΩ.疲労: なし → false",
    ],
})

console.log("=== ハーキュリー1. ライフ3：コスト4で召喚できる ===")
scenario({ name: "hercules-life3", ...hercSummon(3, 5, 4) })

console.log("=== ハーキュリー2. ライフ4：コストは7のまま（リザーブ5では召喚できない） ===")
scenario({
    name: "hercules-life4",
    start: { me: { life: 4, reserve: 5, hand: [HERCULES] } },
    steps: (t) => t.actRejected("me", { type: "summon", handIndex: 0 }),
    expect: [],
})

console.log("=== ハーキュリー3. ライフ4：リザーブ8ならコスト7を払って召喚できる ===")
scenario({ name: "hercules-life4-full", ...hercSummon(4, 8, 7) })

// ===== BS11-028 鳥人機フレスヴェルガー：【氷壁：白】『相手のターン』相手が白のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする =====
const FRES = "BS11-028"
const ELIXIR = "BS01-142" // ピュアエリクサー（白マジック・コスト3・フラッシュ：自分の疲労状態のすべてのスピリットを回復する）

const fresOpp = { hand: [ELIXIR], spirits: [{ card: VANILLA, label: "疲労者", rested: true }] }
const fresCast = (decline = false) => (t: ScenarioCtx) => {
    t.act("opp", { type: "castMagic", handIndex: 0 })
    return drive(t, decline)
}
const elixirPaid = ["相手.手札: ピュアエリクサー → なし", "相手.トラッシュ: なし → ピュアエリクサー", "相手.トラッシュのコア: 0 → 3", "相手.リザーブ: 10 → 7"]

console.log("=== フレスヴェルガー1. 非対話：相手の白マジックを、疲労して無効にする ===")
scenario({
    name: "fres-negate",
    start: { turn: "opp", me: { spirits: [{ card: FRES }] }, opp: fresOpp },
    steps: (t) => {
        fresCast()(t)
    },
    expect: [...elixirPaid, "自分.鳥人機フレスヴェルガー.疲労: false → true"],
})

console.log("=== フレスヴェルガー2. 対話：確認は1回。押すと無効になり、断ると効果が通る ===")
scenario({
    name: "fres-negate-interactive",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: FRES }] }, opp: fresOpp },
    steps: (t) => {
        const n = fresCast()(t)
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [...elixirPaid, "自分.鳥人機フレスヴェルガー.疲労: false → true"],
})
scenario({
    name: "fres-decline-interactive",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: FRES }] }, opp: fresOpp },
    steps: (t) => {
        const n = fresCast(true)(t)
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [...elixirPaid, "相手.疲労者.疲労: true → false"],
})

console.log("=== フレスヴェルガー3. 白以外のマジックは無効にしない ===")
scenario({
    name: "fres-not-white",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: FRES }] }, opp: { hand: [METEOR], spirits: [{ card: VANILLA, label: "疲労者", rested: true }] } },
    steps: (t) => {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("疲労者") })
        const n = drive(t)
        assert(n === 0, `確認は出ない（実際 ${n} 回）`)
    },
    expect: [
        "相手.手札: メテオフォール → なし",
        "相手.トラッシュ: なし → メテオフォール",
        "相手.トラッシュのコア: 0 → 1",
        "相手.リザーブ: 10 → 9",
        "相手.疲労者.BP: 1000 → 3000",
    ],
})

console.log("=== フレスヴェルガー4. すでに疲労していれば疲労できないので無効にできない ===")
scenario({
    name: "fres-rested",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: FRES, rested: true }] }, opp: fresOpp },
    steps: (t) => {
        const n = fresCast()(t)
        assert(n === 0, `確認は出ない（実際 ${n} 回）`)
    },
    expect: [...elixirPaid, "相手.疲労者.疲労: true → false"],
})

// ===== BS11-033 ニジノコ：Lv1 は赤のスピリットとしても、Lv2 は紫のスピリットとしても扱う =====
const NIJI = "BS11-033"
const RED_NEXUS = "BS14-073" // 赤き前方後円墳：『自分のアタックステップ』自分の赤のスピリットすべてをBP+1000
const nijiMe = (cores: number, nexus: string) => ({ spirits: [{ card: NIJI, cores }], nexuses: [{ card: nexus, cores: 0 }] })

console.log("=== ニジノコ1. Lv1：赤のスピリットとして、赤のスピリットへのBP+1000を受ける ===")
scenario({
    name: "niji-red",
    start: { me: nijiMe(1, RED_NEXUS) },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.ニジノコ.BP: 1000 → 2000"],
})

console.log("=== ニジノコ2. Lv2：赤としては扱わない（紫として扱う） ===")
scenario({
    name: "niji-lv2-not-red",
    start: { me: nijiMe(2, RED_NEXUS) },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: [],
})

console.log("=== ニジノコ3. Lv2：紫のスピリットとして、紫のスピリットへのBP+1000を受ける（Lv1 は受けない） ===")
for (const [cores, bp] of [[2, 3000], [1, 1000]] as const) {
    scenario({
        name: `niji-purple-lv${cores}`,
        start: { me: nijiMe(cores, CASTLE) },
        steps: (t) => assert(effectiveBp(t.state, t.me, t.inst("ニジノコ")) === bp, `Lv${cores} のニジノコのBPは${bp}`),
        expect: [],
    })
}

// ===== BS11-039 天使ティアエル：手札にあるこのカードは、自分のトラッシュにあるカードのシンボルでも召喚コストを軽減できる =====
const TIAEL = "BS11-039" // 黄・コスト5・軽減シンボル黄4つ
const CHUNPOPO = "BS02-051" // チュンポポ（黄・コスト1・バニラ・シンボル黄1つ）

const tiaelSummon = (trash: string[], spent: number) => ({
    start: { me: { hand: [TIAEL], trash } },
    steps: (t: ScenarioCtx) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 天使ティアエル → なし",
        `自分.リザーブ: 10 → ${10 - spent - 1}`,
        `自分.トラッシュのコア: 0 → ${spent}`,
        "自分.天使ティアエル.BP: なし → 3000",
        "自分.天使ティアエル.Lv: なし → 1",
        "自分.天使ティアエル.コア: なし → 1",
        "自分.天使ティアエル.場所: なし → フィールド",
        "自分.天使ティアエル.疲労: なし → false",
    ],
})

console.log("=== ティアエル1. トラッシュの黄のカード2枚のシンボルで、コスト5が3になる ===")
scenario({ name: "tiael-trash-symbols", ...tiaelSummon([CHUNPOPO, CHUNPOPO], 3) })

console.log("=== ティアエル2. トラッシュのカードが黄でなければ軽減されない ===")
scenario({ name: "tiael-trash-other-color", ...tiaelSummon([VANILLA, VANILLA], 5) })

// ===== BS11-045 MCギンガー：お互い、ターンに1回しかマジックの効果を使えない =====
const GINGA = "BS11-045"
const twoMagics = { hand: [METEOR, METEOR], spirits: [{ card: VANILLA, label: "標的" }] }
const castOnce = (side: "me" | "opp") => (t: ScenarioCtx) => t.act(side, { type: "castMagic", handIndex: 0, targetInstanceId: t.id(side === "me" ? "自分.標的" : "相手.標的") })
const afterOneCast = (k: string) => [`${k}.手札: メテオフォール、メテオフォール → メテオフォール`, `${k}.トラッシュ: なし → メテオフォール`, `${k}.トラッシュのコア: 0 → 1`, `${k}.リザーブ: 10 → 9`, `${k}.標的.BP: 1000 → 3000`]

console.log("=== ギンガー1. 自分のターン：1回目は使えて、2回目は使えない ===")
scenario({
    name: "ginga-me",
    start: { me: { ...twoMagics, spirits: [...twoMagics.spirits, { card: GINGA }] } },
    steps: (t) => {
        castOnce("me")(t)
        t.actRejected("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("自分.標的") })
    },
    expect: afterOneCast("自分"),
})

console.log("=== ギンガー2. 相手のターンも同じ（お互い）：相手の2回目は使えない ===")
scenario({
    name: "ginga-opp",
    start: { turn: "opp", me: { spirits: [{ card: GINGA }] }, opp: twoMagics },
    steps: (t) => {
        castOnce("opp")(t)
        t.actRejected("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("相手.標的") })
    },
    expect: afterOneCast("相手"),
})

console.log("=== ギンガー3. ギンガーがいなければ2回使える ===")
scenario({
    name: "ginga-none",
    start: { me: twoMagics },
    steps: (t) => {
        castOnce("me")(t)
        castOnce("me")(t)
    },
    expect: [
        "自分.手札: メテオフォール、メテオフォール → なし",
        "自分.トラッシュ: なし → メテオフォール、メテオフォール",
        "自分.トラッシュのコア: 0 → 2",
        "自分.リザーブ: 10 → 8",
        "自分.標的.BP: 1000 → 5000",
    ],
})

// ===== BS11-064 闇の聖剣：自分のスピリットが破壊されたとき、そのスピリットをコスト3/4のスピリットとしても扱う =====
const SWORD = "BS11-064"

const swordMe = (withSword: boolean) => ({
    trash: [GAHERIS], // 【不死：コスト3】
    spirits: [{ card: DWAFFU, label: "ブロッカー" }], // コスト7
    nexuses: withSword ? [{ card: SWORD, cores: 0 }] : [],
})
const swordOpp = { spirits: [{ card: WINGAL, label: "アタッカー", cores: 4 }] }

console.log("=== 闇の聖剣1. コスト7のスピリットが破壊されても、コスト3としても扱われ、コスト3用の不死が使える ===")
scenario({
    name: "sword-also-cost",
    start: { turn: "opp", me: swordMe(true), opp: swordOpp },
    steps: (t) => fight(t, "opp", "アタッカー", "ブロッカー"),
    expect: [
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.トラッシュ: 闇騎士ガヘリス → ドワッフー・セブン",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.闇騎士ガヘリス.BP: なし → 1000",
        "自分.闇騎士ガヘリス.Lv: なし → 1",
        "自分.闇騎士ガヘリス.コア: なし → 1",
        "自分.闇騎士ガヘリス.場所: なし → フィールド",
        "自分.闇騎士ガヘリス.疲労: なし → false",
        "相手.アタッカー.疲労: false → true",
    ],
})

console.log("=== 闇の聖剣2. 聖剣が無ければ、コスト7のスピリットの破壊では不死は使えない ===")
scenario({
    name: "sword-none",
    start: { turn: "opp", me: swordMe(false), opp: swordOpp },
    steps: (t) => fight(t, "opp", "アタッカー", "ブロッカー"),
    expect: [
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.トラッシュ: 闇騎士ガヘリス → ドワッフー・セブン、闇騎士ガヘリス",
        "自分.リザーブ: 10 → 11",
        "相手.アタッカー.疲労: false → true",
    ],
})
console.log("すべてのチェックに合格しました 🎉（part478）")
