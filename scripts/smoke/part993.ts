// smoke パート993（SJ13-02 ウェポンマスター・ドラゴン／SJ13-23 獅魂の剣刃レオンエクスカリバー／SJ13-24 鎖鎌のクロヅル）
// 剣刃でないブレイヴ・分身スピリットが要る場面は、start で置く方法／カードが決まるまで書いていない（質問欄）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

const WEAPON = "SJ13-02" // ウェポンマスター・ドラゴン（赤・コスト8・Lv1 BP7000(1コア)）
const SCISSORS = "SJ13-03" // 大魔鋏デス・シザー（紫ブレイヴ・コスト4・剣刃。召喚時効果なし）
const LANCE = "SJ13-23" // 獅魂の剣刃レオンエクスカリバー（白ブレイヴ・コスト4・剣刃）
const KUZURU = "SJ13-24" // 鎖鎌のクロヅル（緑・コスト4・Lv1 BP3000）
const HADES = "BS01-031" // デス・ハーデス（紫・コスト3・Lv2 BP7000・4コア）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・コスト3・Lv3 BP8000・5コア）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4）
const METAL = "BS01-008" // メタルバーン（赤・コスト3）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1 BP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(WEAPON).name === "ウェポンマスター・ドラゴン" && getCard(LANCE).name === "獅魂の剣刃レオンエクスカリバー" && getCard(KUZURU).name === "鎖鎌のクロヅル", "SJの名前")
    assert(getCard(SCISSORS).type === "brave" && getCard(SCISSORS).family?.includes("剣刃") === true, "デス・シザーは剣刃のブレイヴ")
    assert(getCard(HADES).cost === 3 && getCard(BELL).cost === 4 && getCard(METAL).cost === 3, "バニラのコスト")
}

function settle(t: ScenarioCtx, opt: { decline?: true } = {}): void {
    for (let i = 0; i < 10 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side: Side = pc.pid === t.me ? "me" : "opp"
        if (opt.decline) t.act(side, { type: "resolveChoice" })
        else if (pc.kind === "card") t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices![0]! })
        else if (pc.kind === "option") t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        else t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0]! })
    }
}

// 召喚された個体が盤面に現れたときの写像の行
const appears = (label: string, lv: number, cores: number, bp: number) => [
    `${label}.場所: なし → フィールド`,
    `${label}.疲労: なし → false`,
    `${label}.コア: なし → ${cores}`,
    `${label}.Lv: なし → ${lv}`,
    `${label}.BP: なし → ${bp}`,
]

console.log("=== SJ13-02 1. 召喚時：手札のブレイヴ（剣刃）を無償召喚 → BP7000以下の相手1体を破壊（8000は破壊しない） ===")
scenario({
    name: "sj1302-sword-brave",
    start: {
        interactive: true,
        me: { reserve: 15, hand: [WEAPON, SCISSORS] },
        opp: { spirits: [{ card: HADES, label: "的", cores: 4 }, { card: HERA, label: "大物", cores: 5 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        ...appears("自分.ウェポンマスター・ドラゴン", 1, 1, 10000),
        "自分.大魔鋏デス・シザー.場所: なし → 合体",
        "自分.大魔鋏デス・シザー.疲労: なし → false",
        "自分.大魔鋏デス・シザー.コア: なし → 0",
        "自分.大魔鋏デス・シザー.Lv: なし → 1",
        "自分.手札: ウェポンマスター・ドラゴン、大魔鋏デス・シザー → なし",
        "自分.リザーブ: 15 → 6",
        "自分.トラッシュのコア: 0 → 8",
        "相手.的.場所: フィールド → なし",
        "相手.トラッシュ: なし → デス・ハーデス",
        "相手.リザーブ: 10 → 14",
    ],
})

console.log("=== SJ13-02 2. 無償召喚を断る（任意）：ブレイヴは手札に残り、何も破壊されない ===")
scenario({
    name: "sj1302-decline",
    start: {
        interactive: true,
        me: { reserve: 15, hand: [WEAPON, SCISSORS] },
        opp: { spirits: [{ card: HADES, label: "的", cores: 4 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t, { decline: true })
    },
    expect: [
        ...appears("自分.ウェポンマスター・ドラゴン", 1, 1, 7000),
        "自分.手札: ウェポンマスター・ドラゴン、大魔鋏デス・シザー → 大魔鋏デス・シザー",
        "自分.リザーブ: 15 → 6",
        "自分.トラッシュのコア: 0 → 8",
    ],
})

console.log("=== SJ13-02 3. 召喚したブレイヴは剣刃だが、相手に BP7000以下がいない：召喚だけ起きて破壊は起きない ===")
scenario({
    name: "sj1302-no-target",
    start: {
        interactive: true,
        me: { reserve: 15, hand: [WEAPON, SCISSORS] },
        opp: { spirits: [{ card: HERA, label: "大物", cores: 5 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        ...appears("自分.ウェポンマスター・ドラゴン", 1, 1, 10000),
        "自分.大魔鋏デス・シザー.場所: なし → 合体",
        "自分.大魔鋏デス・シザー.疲労: なし → false",
        "自分.大魔鋏デス・シザー.コア: なし → 0",
        "自分.大魔鋏デス・シザー.Lv: なし → 1",
        "自分.手札: ウェポンマスター・ドラゴン、大魔鋏デス・シザー → なし",
        "自分.リザーブ: 15 → 6",
        "自分.トラッシュのコア: 0 → 8",
    ],
})

console.log("=== SJ13-23 1. 召喚時：コスト4以下の相手1体を手札へ。コスト4を戻したのでボイドからコア1個がリザーブへ ===")
scenario({
    name: "sj1323-cost4",
    start: {
        interactive: true,
        me: { hand: [LANCE] },
        opp: { spirits: [{ card: BELL, label: "ベル" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        ...appears("自分.獅魂の剣刃レオンエクスカリバー", 1, 1, 3000),
        "自分.手札: 獅魂の剣刃レオンエクスカリバー → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "相手.ベル.場所: フィールド → なし",
        "相手.手札: なし → デュアルキャノン・ベル",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== SJ13-23 2. 戻したのがコスト3：コアは増えない ===")
scenario({
    name: "sj1323-cost3",
    start: {
        interactive: true,
        me: { hand: [LANCE] },
        opp: { spirits: [{ card: METAL, label: "メタル" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        ...appears("自分.獅魂の剣刃レオンエクスカリバー", 1, 1, 3000),
        "自分.手札: 獅魂の剣刃レオンエクスカリバー → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "相手.メタル.場所: フィールド → なし",
        "相手.手札: なし → メタルバーン",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== SJ13-23 3. ソウルコアが載った相手のコスト4を戻す：ソウルコアは相手のリザーブへ、ボイドから自分へ通常コア1個 ===")
scenario({
    name: "sj1323-soulcore",
    start: {
        interactive: true,
        me: { hand: [LANCE] },
        opp: { soulCore: "ベル", spirits: [{ card: BELL, label: "ベル" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        ...appears("自分.獅魂の剣刃レオンエクスカリバー", 1, 1, 3000),
        "自分.手札: 獅魂の剣刃レオンエクスカリバー → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "相手.ベル.場所: フィールド → なし",
        "相手.手札: なし → デュアルキャノン・ベル",
        "相手.リザーブ: 10 → 11",
        "相手.ソウルコア: 相手.ベル → リザーブ",
    ],
})

console.log("=== SJ13-24 1. アタック時BP+2000。自分の分身スピリットがいなければ、相手は何も疲労させない ===")
scenario({
    name: "sj1324-no-bunshin",
    start: {
        me: { spirits: [{ card: KUZURU, label: "クロヅル" }] },
        opp: { spirits: [{ card: ROKU, label: "ロク" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("クロヅル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.クロヅル.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("すべてのチェックに合格しました 🎉（part993）")
