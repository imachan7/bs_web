// smoke パート619（BS17 緑の場面テスト：効果文だけから先に書いた期待値）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1=1000/Lv2=3000(2コア)/Lv3=4000(3コア)）
const SHOCK = "BS01-054" // ショックイーター（緑・コスト2・Lv1=3000/Lv2=4000(2コア)）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・コスト3・Lv1=4000/Lv2=6000(3コア)/Lv3=8000(5コア)）
const MELT = "BS03-009" // 火吹きメルト（赤・コスト5・Lv1=4000/Lv2=6000(3コア)）
const WHITE = "BS01-074" // バーサーカー・ガン（白・コスト1・Lv1=1000/Lv2=3000(2コア)）
const FLAME = "BS01-121" // フレイムダンス（赤・コスト5・フラッシュ：BP4000以下のスピリット1体を破壊）
const ELIXIR = "BS01-142" // ピュアエリクサー（白・コスト3・フラッシュ：自分の疲労スピリットすべて回復）
const DOUBLE = "BS01-117" // ダブルドロー（赤・コスト4・メイン）
const JIGEN = "BS16-080" // 次元断（白・コスト4・【バースト：自分のライフ減少後】相手のスピリット1体を手札に戻す）
const GABU = "BS06-028" // ガブノハシ（緑・コスト3・Lv1･Lv2【暴風：1】）
const ARAYAMA = "BS03-102" // 無法者の荒野（赤ネクサス：Lv1･Lv2 効果の記述を持たない自分のスピリットすべてをBP+2000）
const TANI = "BS01-099" // 百識の谷（赤ネクサス）
const KOJO = "BS01-102" // 主無き古城（紫ネクサス）

const JIRA = "BS17-020"
const FALCO = "BS17-021"
const TARZ = "BS17-022"
const JANE = "BS17-023"
const ELES = "BS17-024"
const RAI = "BS17-025"
const JAB = "BS17-026"
const ARD = "BS17-027"
const GYO = "BS17-057"
const PARA = "BS17-065"
const FRUIT = "BS17-066"
const WILD = "BS17-077"
const WAR = "BS17-078"
const SON = "BS17-X03"

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        [ROKU]: "ロクケラトプス", [SHOCK]: "ショックイーター", [HERA]: "ヘラクレス・ジオ", [MELT]: "火吹きメルト",
        [WHITE]: "バーサーカー・ガン", [FLAME]: "フレイムダンス", [ELIXIR]: "ピュアエリクサー", [DOUBLE]: "ダブルドロー",
        [JIGEN]: "次元断", [GABU]: "ガブノハシ", [ARAYAMA]: "無法者の荒野", [TANI]: "百識の谷", [KOJO]: "主無き古城",
        [JIRA]: "ジラッフィー", [FALCO]: "ピクシーファルコ", [TARZ]: "ターザニア・グレート", [JANE]: "ジェーンバード",
        [ELES]: "エレステラ", [RAI]: "ライ・シュウユ", [JAB]: "ジャドバルジャー", [ARD]: "翠玉の怪鳥アルディード",
        [GYO]: "ギョクジーグ", [PARA]: "獣の楽園", [FRUIT]: "聖者の樹の実", [WILD]: "ワイルドウィング",
        [WAR]: "ウォークライ", [SON]: "大牙帝ビャクガロード・ソンケン",
    }
    for (const [id, name] of Object.entries(names)) assert(getCard(id).name === name, `${id} は ${name}`)
}

// ---- 道具 ----
// 手札・トラッシュの表記は場面テストの写像と同じ並べ方（名前の昇順を「、」でつなぐ）
const L = (...n: string[]) => n.sort().join("、")
const deckOf = (card: string) => Array.from({ length: 40 }, () => card)
const pidOf = (t: ScenarioCtx, side: Side) => (side === "me" ? t.me : t.opp)

// 選択待ちを順に答える。undefined は「スキップ／断る」
function answers(t: ScenarioCtx, side: Side, opts: (string | undefined)[]): void {
    for (const o of opts) {
        assert(t.state.pendingChoice?.pid === pidOf(t, side), `${side}に選択待ちが立つ`)
        const pc = t.state.pendingChoice
        // kind:"card"（オープンしたカードの選択など）は option ではなく cardIndex で答える
        if (o !== undefined && pc?.kind === "card") t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices?.[0] ?? 0 })
        else t.act(side, o === undefined ? { type: "resolveChoice" } : { type: "resolveChoice", option: o })
    }
}
function noPending(t: ScenarioCtx): void {
    assert(t.state.pendingChoice === null, "選択待ちは立たない")
}
function pick(t: ScenarioCtx, side: Side, label: string): void {
    assert(t.state.pendingChoice?.pid === pidOf(t, side), `${side}に対象の選択待ちが立つ`)
    t.act(side, { type: "resolveChoice", instanceId: t.id(label) })
}

// 召喚で場に出た個体の行（コスト分の支払いは含まない）
const appear = (side: "自分" | "相手", name: string, bp: number, lv: number, cores: number, rested = false) => [
    `${side}.${name}.BP: なし → ${bp}`, `${side}.${name}.Lv: なし → ${lv}`, `${side}.${name}.コア: なし → ${cores}`,
    `${side}.${name}.場所: なし → フィールド`, `${side}.${name}.疲労: なし → ${rested}`,
]
// コストNのスピリットを通常に召喚したときの支払い（コスト分がトラッシュ、上に置く1個もリザーブから）
const pay = (side: "自分" | "相手", cost: number) => [`${side}.リザーブ: 10 → ${10 - cost - 1}`, `${side}.トラッシュのコア: 0 → ${cost}`]
// 手札のフレイムダンスを使った側の支払い（コスト5）
const flameCast = (side: "自分" | "相手") => [
    `${side}.手札: ${getCard(FLAME).name} → なし`, `${side}.トラッシュ: なし → ${getCard(FLAME).name}`, `${side}.リザーブ: 10 → 5`, `${side}.トラッシュのコア: 0 → 5`,
]
// 次元断（相手のバースト）が発動し、アタックした自分のスピリット（コア1個）が手札に戻った
const jigenFired = (name: string) => [
    "相手.バースト: 次元断 → なし", "相手.トラッシュ: なし → 次元断", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11",
    `自分.${name}.場所: フィールド → なし`, `自分.手札: なし → ${name}`, "自分.リザーブ: 10 → 11",
]
// ターンを終えたとき相手のターン開始で起きること（相手の手札は空）
const ENDTURN = ["相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11", "相手.手札: なし → ロクケラトプス"]

// =====================================================================
// BS17-020 ジラッフィー（Lv1･Lv2『このスピリットの破壊時』相手は、相手のスピリット1体を疲労させる）
// =====================================================================
console.log("=== BS17-020 ジラッフィー ===")
scenario({
    name: "jira-lv1-destroyed-opp-chooses",
    start: {
        turn: "opp", interactive: true,
        me: { spirits: [{ card: JIRA, cores: 1 }] },
        opp: { hand: [FLAME], spirits: [{ card: SHOCK, label: "甲" }, { card: WHITE, label: "乙" }] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ジラッフィー") })
        t.closeFlash()
        pick(t, "opp", "乙") // 「相手は」＝選ぶのは相手（ジラッフィーの持ち主の相手）
        t.closeFlash()
    },
    expect: [
        ...flameCast("相手"), "自分.ジラッフィー.場所: フィールド → なし", "自分.トラッシュ: なし → ジラッフィー", "自分.リザーブ: 10 → 11",
        "相手.乙.疲労: false → true",
    ],
})
scenario({
    name: "jira-lv2-destroyed",
    start: {
        turn: "opp",
        me: { spirits: [{ card: JIRA, cores: 2 }] },
        opp: { hand: [FLAME], spirits: [{ card: SHOCK, label: "甲" }] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ジラッフィー") })
        t.closeFlash()
    },
    expect: [
        ...flameCast("相手"), "自分.ジラッフィー.場所: フィールド → なし", "自分.トラッシュ: なし → ジラッフィー", "自分.リザーブ: 10 → 12",
        "相手.甲.疲労: false → true",
    ],
})
scenario({
    name: "jira-other-spirit-destroyed",
    start: {
        turn: "opp",
        me: { spirits: [{ card: JIRA }, { card: ROKU, label: "他" }] },
        opp: { hand: [FLAME], spirits: [{ card: SHOCK, label: "甲" }] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("他") })
        t.closeFlash()
    },
    expect: [...flameCast("相手"), "自分.他.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11"],
})

// =====================================================================
// BS17-021 ピクシーファルコ（Lv2『アタック時』このスピリットのアタックで相手のライフが減ったとき、相手はバーストを発動できない）
// =====================================================================
console.log("=== BS17-021 ピクシーファルコ ===")
scenario({
    name: "falco-lv2-blocks-burst",
    start: { phase: "attack", interactive: true, me: { spirits: [{ card: FALCO, cores: 3 }] }, opp: { burst: JIGEN } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ピクシーファルコ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        noPending(t)
    },
    expect: ["自分.ピクシーファルコ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "falco-lv1-burst-fires",
    start: { phase: "attack", interactive: true, me: { spirits: [{ card: FALCO, cores: 1 }] }, opp: { burst: JIGEN } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ピクシーファルコ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        answers(t, "opp", ["発動する", undefined]) // 発動 → 「その後コストを支払うことで」は断る
    },
    expect: jigenFired("ピクシーファルコ"),
})

// =====================================================================
// BS17-022 ターザニア・グレート
// =====================================================================
console.log("=== BS17-022 ターザニア・グレート ===")
// 【バースト：相手による自分のスピリット破壊後】このスピリットカードをコストを支払わずに召喚する
scenario({
    name: "tarz-burst-summon",
    start: {
        turn: "opp", interactive: true,
        me: { spirits: [{ card: ROKU, label: "的" }], burst: TARZ },
        opp: { hand: [FLAME], spirits: [{ card: SHOCK, label: "甲" }] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("的") })
        t.closeFlash()
        answers(t, "me", ["発動する"])
    },
    // 破壊されたコア1個がリザーブへ戻り、召喚のコア1個がリザーブから載る（コストは払わない）
    expect: [
        ...flameCast("相手"), "自分.的.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス",
        "自分.バースト: ターザニア・グレート → なし", ...appear("自分", "ターザニア・グレート", 3000, 1, 1),
    ],
})
scenario({
    name: "tarz-burst-not-for-opp-spirit",
    start: {
        interactive: true,
        me: { hand: [FLAME], spirits: [{ card: WHITE, label: "弱" }], burst: TARZ },
        opp: { spirits: [{ card: SHOCK, label: "敵" }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("敵") })
        t.closeFlash()
        noPending(t)
    },
    expect: [...flameCast("自分"), "相手.敵.場所: フィールド → なし", "相手.トラッシュ: なし → ショックイーター", "相手.リザーブ: 10 → 11"],
})
// Lv1･Lv2･Lv3『アタック時』デッキを上から1枚オープンできる。コスト3以下のスピリットカードのとき、コストを支払わずに召喚できる。召喚しない、または、他のカードのときは破棄する
const tarzAttack = (name: string, topCard: string, ans: (string | undefined)[], extra: string[], cores = 1) =>
    scenario({
        name,
        start: { phase: "attack", interactive: true, me: { spirits: [{ card: TARZ, cores }], deck: deckOf(topCard) } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("ターザニア・グレート") })
            answers(t, "me", ans)
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.ターザニア・グレート.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", ...extra],
    })
tarzAttack("tarz-attack-open-and-summon", ROKU, ["発動する", "発動する"],
    ["自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 9", ...appear("自分", "ロクケラトプス", 1000, 1, 1)])
tarzAttack("tarz-attack-open-decline-summon", ROKU, ["発動する", undefined],
    ["自分.デッキ枚数: 40 → 39", "自分.トラッシュ: なし → ロクケラトプス"])
tarzAttack("tarz-attack-open-cost5-spirit", MELT, ["発動する"],
    ["自分.デッキ枚数: 40 → 39", "自分.トラッシュ: なし → 火吹きメルト"])
tarzAttack("tarz-attack-open-magic", ELIXIR, ["発動する"],
    ["自分.デッキ枚数: 40 → 39", "自分.トラッシュ: なし → ピュアエリクサー"])
tarzAttack("tarz-attack-decline-open", ROKU, [undefined], [])
tarzAttack("tarz-lv3-attack-open-and-summon", HERA, ["発動する", "発動する"],
    ["自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 9", ...appear("自分", "ヘラクレス・ジオ", 4000, 1, 1)], 8)

// =====================================================================
// BS17-023 ジェーンバード
// =====================================================================
console.log("=== BS17-023 ジェーンバード ===")
// Lv1･Lv2『自分のアタックステップ』コスト3以下の自分のスピリットすべては、バトルでBPを比べるとき、そのスピリットが持つ最高LvのBPを使用する
scenario({
    name: "jane-cost1-uses-max-lv-bp",
    start: {
        phase: "attack",
        me: { spirits: [{ card: JANE }, { card: ROKU, label: "攻" }] },
        opp: { spirits: [{ card: SHOCK, label: "守" }] }, // 3000
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("攻") }) // Lv1=1000 だが最高Lv(Lv3)の4000で比べる
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("守") })
        t.closeFlash()
    },
    expect: ["自分.攻.疲労: false → true", "相手.守.場所: フィールド → なし", "相手.トラッシュ: なし → ショックイーター", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "jane-cost5-not-raised",
    start: {
        phase: "attack",
        me: { spirits: [{ card: JANE }, { card: MELT, label: "攻" }] }, // コスト5＝対象外。Lv1の4000で比べる
        opp: { spirits: [{ card: HERA, cores: 3, label: "守" }] }, // 6000
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("攻") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("守") })
        t.closeFlash()
    },
    expect: ["自分.攻.場所: フィールド → なし", "自分.トラッシュ: なし → 火吹きメルト", "自分.リザーブ: 10 → 11", "相手.守.疲労: false → true"],
})
scenario({
    name: "jane-not-in-opp-attack-step",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: JANE }, { card: ROKU, label: "守" }] },
        opp: { spirits: [{ card: SHOCK, label: "攻" }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("攻") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("守") }) // 自分のアタックステップではない＝1000のまま
        t.closeFlash()
    },
    expect: ["相手.攻.疲労: false → true", "自分.守.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11"],
})
// Lv2【暴風：1】『アタック時』このスピリットがブロックされたとき、相手は、相手のスピリット1体を疲労させる
scenario({
    name: "jane-lv2-blocked-opp-fatigues",
    start: {
        phase: "attack", interactive: true,
        me: { spirits: [{ card: JANE, cores: 3 }] },
        opp: { spirits: [{ card: WHITE, label: "守" }, { card: ROKU, label: "控" }, { card: ROKU, label: "控2" }] }, // 疲労させる候補が2体いないと選択待ちが立たない（1体なら自動で選ばれる）
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ジェーンバード") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("守") })
        pick(t, "opp", "控") // 疲労させる1体を選ぶのは相手
        t.closeFlash()
    },
    expect: [
        "自分.ジェーンバード.疲労: false → true", "相手.控.疲労: false → true",
        "相手.守.場所: フィールド → なし", "相手.トラッシュ: なし → バーサーカー・ガン", "相手.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "jane-lv1-blocked-no-fatigue",
    start: {
        phase: "attack", interactive: true,
        me: { spirits: [{ card: JANE, cores: 1 }] },
        opp: { spirits: [{ card: WHITE, label: "守" }, { card: ROKU, label: "控" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ジェーンバード") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("守") })
        noPending(t)
        t.closeFlash()
    },
    expect: [
        "自分.ジェーンバード.疲労: false → true",
        "相手.守.場所: フィールド → なし", "相手.トラッシュ: なし → バーサーカー・ガン", "相手.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "jane-lv2-unblocked-no-fatigue",
    start: {
        phase: "attack", interactive: true,
        me: { spirits: [{ card: JANE, cores: 3 }] },
        opp: { spirits: [{ card: ROKU, label: "控" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ジェーンバード") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        noPending(t)
    },
    expect: ["自分.ジェーンバード.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// =====================================================================
// BS17-024 エレステラ
// =====================================================================
console.log("=== BS17-024 エレステラ ===")
// Lv1･Lv2『アタック時』ボイドからコア1個をこのスピリットに置く
scenario({
    name: "eles-attack-lv1",
    start: { phase: "attack", me: { spirits: [{ card: ELES, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("エレステラ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.エレステラ.疲労: false → true", "自分.エレステラ.コア: 1 → 2", "自分.エレステラ.Lv: 1 → 2", "自分.エレステラ.BP: 3000 → 4000",
        "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "eles-attack-lv2",
    start: { phase: "attack", me: { spirits: [{ card: ELES, cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("エレステラ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.エレステラ.疲労: false → true", "自分.エレステラ.コア: 2 → 3", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "eles-other-spirit-attacks",
    start: { phase: "attack", me: { spirits: [{ card: ELES, cores: 1 }, { card: ROKU, label: "攻" }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("攻") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.攻.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
// Lv2『自分のエンドステップ』このスピリットのコア1個を自分のトラッシュに置くことで、このスピリットは回復する
scenario({
    name: "eles-end-step-pay-recover",
    start: { interactive: true, me: { spirits: [{ card: ELES, cores: 2, rested: true }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
        answers(t, "me", ["発動する"])
    },
    expect: [
        "自分.エレステラ.コア: 2 → 1", "自分.エレステラ.Lv: 2 → 1", "自分.エレステラ.BP: 4000 → 3000", "自分.エレステラ.疲労: true → false",
        "自分.トラッシュのコア: 0 → 1", ...ENDTURN,
    ],
})
scenario({
    name: "eles-end-step-decline",
    start: { interactive: true, me: { spirits: [{ card: ELES, cores: 2, rested: true }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
        answers(t, "me", [undefined])
    },
    expect: ENDTURN,
})
scenario({
    name: "eles-end-step-lv1",
    start: { interactive: true, me: { spirits: [{ card: ELES, cores: 1, rested: true }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
        noPending(t)
    },
    expect: ENDTURN,
})

// =====================================================================
// BS17-025 ライ・シュウユ
// =====================================================================
console.log("=== BS17-025 ライ・シュウユ ===")
// Lv1･Lv2『召喚時』相手のネクサス2つを手札に戻す。この効果で手札に戻したネクサス1つにつき、相手のスピリット1体を疲労させる
scenario({
    name: "rai-summon-two-nexus",
    start: {
        me: { hand: [RAI] },
        opp: {
            nexuses: [{ card: TANI, label: "谷" }, { card: KOJO, label: "古城" }],
            spirits: [{ card: SHOCK, label: "甲" }, { card: WHITE, label: "乙" }],
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ライ・シュウユ → なし", ...pay("自分", 5), ...appear("自分", "ライ・シュウユ", 4000, 1, 1),
        "相手.谷.場所: ネクサス → なし", "相手.古城.場所: ネクサス → なし", `相手.手札: なし → ${L("百識の谷", "主無き古城")}`, "相手.リザーブ: 10 → 12",
        "相手.甲.疲労: false → true", "相手.乙.疲労: false → true",
    ],
})
scenario({
    name: "rai-summon-one-nexus-i-choose-spirit",
    start: {
        interactive: true,
        me: { hand: [RAI] },
        opp: { nexuses: [{ card: TANI, label: "谷" }], spirits: [{ card: SHOCK, label: "甲" }, { card: WHITE, label: "乙" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        pick(t, "me", "乙") // 「相手は」と書かれていない＝疲労させる1体を選ぶのは自分
    },
    expect: [
        "自分.手札: ライ・シュウユ → なし", ...pay("自分", 5), ...appear("自分", "ライ・シュウユ", 4000, 1, 1),
        "相手.谷.場所: ネクサス → なし", "相手.手札: なし → 百識の谷", "相手.リザーブ: 10 → 11", "相手.乙.疲労: false → true",
    ],
})
scenario({
    name: "rai-summon-no-nexus",
    start: { interactive: true, me: { hand: [RAI] }, opp: { spirits: [{ card: SHOCK, label: "甲" }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        noPending(t)
    },
    expect: ["自分.手札: ライ・シュウユ → なし", ...pay("自分", 5), ...appear("自分", "ライ・シュウユ", 4000, 1, 1)],
})
// Lv1･Lv2【暴風：1】『アタック時』（ジェーンバードと同文）
scenario({
    name: "rai-lv1-blocked-opp-fatigues",
    start: {
        phase: "attack", interactive: true,
        me: { spirits: [{ card: RAI, cores: 1 }] },
        opp: { spirits: [{ card: WHITE, label: "守" }, { card: ROKU, label: "控" }, { card: ROKU, label: "控2" }] }, // 疲労させる候補が2体いないと選択待ちが立たない（1体なら自動で選ばれる）
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ライ・シュウユ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("守") })
        pick(t, "opp", "控")
        t.closeFlash()
    },
    expect: [
        "自分.ライ・シュウユ.疲労: false → true", "相手.控.疲労: false → true",
        "相手.守.場所: フィールド → なし", "相手.トラッシュ: なし → バーサーカー・ガン", "相手.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "rai-unblocked-no-fatigue",
    start: {
        phase: "attack", interactive: true,
        me: { spirits: [{ card: RAI, cores: 1 }] },
        opp: { spirits: [{ card: ROKU, label: "控" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ライ・シュウユ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        noPending(t)
    },
    expect: ["自分.ライ・シュウユ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
// Lv2『自分のエンドステップ』系統：「雄将」を持つ自分のスピリットすべてを回復させる
scenario({
    name: "rai-lv2-end-recover-yusho",
    start: {
        me: { spirits: [{ card: RAI, cores: 3, rested: true }, { card: JANE, rested: true }, { card: ROKU, label: "他", rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "endTurn" })
    },
    expect: ["自分.ライ・シュウユ.疲労: true → false", "自分.ジェーンバード.疲労: true → false", ...ENDTURN],
})
scenario({
    name: "rai-lv1-end-no-recover",
    start: { me: { spirits: [{ card: RAI, cores: 1, rested: true }, { card: JANE, rested: true }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
    },
    expect: ENDTURN,
})

// =====================================================================
// BS17-026 ジャドバルジャー
// =====================================================================
console.log("=== BS17-026 ジャドバルジャー ===")
scenario({
    name: "jab-summoned-rested",
    start: { me: { hand: [JAB] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: ["自分.手札: ジャドバルジャー → なし", ...pay("自分", 5), ...appear("自分", "ジャドバルジャー", 7000, 1, 1, true)],
})
// 「効果の記述を持たないスピリットとして扱う」→ 数え方だけが変わる（無法者の荒野の対象になる）
scenario({
    name: "jab-counts-as-no-text",
    start: {
        me: {
            nexuses: [{ card: ARAYAMA, cores: 1 }],
            spirits: [{ card: JAB }, { card: JIRA, label: "効果持ち" }],
        },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
    },
    expect: ["自分.ジャドバルジャー.BP: 7000 → 9000"],
})

// =====================================================================
// BS17-027 翠玉の怪鳥アルディード（フラッシュ【神速】）
// =====================================================================
console.log("=== BS17-027 翠玉の怪鳥アルディード ===")
scenario({
    name: "ard-flash-summon",
    start: { phase: "attack", me: { hand: [ARD], spirits: [{ card: ROKU, label: "攻" }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("攻") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "summon", handIndex: 0 })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.攻.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11",
        "自分.手札: 翠玉の怪鳥アルディード → なし", ...pay("自分", 7), ...appear("自分", "翠玉の怪鳥アルディード", 4000, 1, 1),
    ],
})
// フラッシュでの召喚はリザーブのコアだけで払う（フィールドのコアでは払えない）
scenario({
    name: "ard-flash-summon-reserve-only",
    start: {
        phase: "attack", me: { reserve: 6, hand: [ARD], spirits: [{ card: ROKU, label: "攻" }, { card: ROKU, label: "資", cores: 4 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("攻") })
        t.act("opp", { type: "pass" })
        t.actRejected("me", { type: "summon", handIndex: 0 })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.攻.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
// 【神速】を持たないスピリットはフラッシュタイミングに召喚できない
scenario({
    name: "ard-other-spirit-not-flash-summonable",
    start: { phase: "attack", me: { hand: [ROKU], spirits: [{ card: WHITE, label: "攻" }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("攻") })
        t.act("opp", { type: "pass" })
        t.actRejected("me", { type: "summon", handIndex: 0 })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.攻.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// =====================================================================
// BS17-057 ギョクジーグ（ブレイヴ）
// =====================================================================
console.log("=== BS17-057 ギョクジーグ ===")
// 【バースト：相手による自分のスピリット破壊後】自分のスピリット1体を回復する。この効果発揮後、このブレイヴカードを召喚する
scenario({
    name: "gyo-burst-recover-then-summon",
    start: {
        turn: "opp", interactive: true,
        me: { spirits: [{ card: ROKU, label: "的" }, { card: MELT, label: "傷", rested: true }], burst: GYO },
        opp: { hand: [FLAME], spirits: [{ card: SHOCK, label: "甲" }] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("的") })
        t.closeFlash()
        answers(t, "me", ["発動する"])
    },
    // 「コストを支払わずに」とは書かれていない＝召喚コスト2を払う（破壊された的のコア1個がリザーブへ戻っている）
    expect: [
        ...flameCast("相手"), "自分.的.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス",
        "自分.傷.疲労: true → false", "自分.バースト: ギョクジーグ → なし",
        "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 2", ...appear("自分", "ギョクジーグ", 2000, 1, 1),
    ],
})
scenario({
    name: "gyo-burst-not-for-opp-spirit",
    start: {
        interactive: true,
        me: { hand: [FLAME], spirits: [{ card: WHITE, label: "弱" }], burst: GYO },
        opp: { spirits: [{ card: SHOCK, label: "敵" }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("敵") })
        t.closeFlash()
        noPending(t)
    },
    expect: [...flameCast("自分"), "相手.敵.場所: フィールド → なし", "相手.トラッシュ: なし → ショックイーター", "相手.リザーブ: 10 → 11"],
})
// 合体条件：コスト0/1/2
scenario({
    name: "gyo-combine-cost1-host",
    start: { me: { spirits: [{ card: GYO }, { card: ROKU, label: "宿" }] } },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ギョクジーグ"), hostInstanceId: t.id("宿") })
    },
    expect: [
        "自分.ギョクジーグ.BP: 2000 → なし", "自分.ギョクジーグ.コア: 1 → 0", "自分.ギョクジーグ.場所: フィールド → 合体",
        // 合体でブレイヴのコア1個がホストへ移る（ホスト1→2個でLv2）
        "自分.宿.BP: 1000 → 5000", "自分.宿.Lv: 1 → 2", "自分.宿.コア: 1 → 2",
    ],
})
scenario({
    name: "gyo-combine-cost5-host-rejected",
    start: { me: { spirits: [{ card: GYO }, { card: MELT, label: "宿" }] } },
    steps(t) {
        t.actRejected("me", { type: "combineBrave", braveInstanceId: t.id("ギョクジーグ"), hostInstanceId: t.id("宿") })
    },
    expect: [],
})
// 【合体時】『合体アタック時』このスピリットのコアが2個の間、相手はバーストを発動できない
scenario({
    name: "gyo-combined-attack-2cores-blocks-burst",
    start: {
        interactive: true,
        me: { spirits: [{ card: GYO }, { card: ROKU, label: "宿", cores: 1 }] }, // 合体でブレイヴのコア1個が移り、ホストのコアはちょうど2個になる
        opp: { burst: JIGEN },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ギョクジーグ"), hostInstanceId: t.id("宿") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("宿") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        noPending(t)
    },
    expect: [
        "自分.ギョクジーグ.BP: 2000 → なし", "自分.ギョクジーグ.コア: 1 → 0", "自分.ギョクジーグ.場所: フィールド → 合体",
        "自分.宿.BP: 1000 → 5000", "自分.宿.Lv: 1 → 2", "自分.宿.コア: 1 → 2", "自分.宿.疲労: false → true",
        "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11",
    ],
})
// コアが2個でなければ封じない（ホスト2個＋ブレイヴ1個＝合体後3個）。合体していない単体のブレイヴはシンボルが無く、ライフを減らせない
scenario({
    name: "gyo-combined-attack-3cores-burst-fires",
    start: {
        interactive: true,
        me: { spirits: [{ card: GYO }, { card: ROKU, label: "宿", cores: 2 }] },
        opp: { burst: JIGEN },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ギョクジーグ"), hostInstanceId: t.id("宿") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("宿") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        answers(t, "opp", [undefined]) // バーストを発動できる＝確認が立つ。ここでは発動しない
    },
    expect: [
        "自分.ギョクジーグ.BP: 2000 → なし", "自分.ギョクジーグ.コア: 1 → 0", "自分.ギョクジーグ.場所: フィールド → 合体",
        "自分.宿.BP: 3000 → 6000", "自分.宿.Lv: 2 → 3", "自分.宿.コア: 2 → 3", "自分.宿.疲労: false → true",
        "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11",
    ],
})

// =====================================================================
// BS17-065 獣の楽園（ネクサス）
// =====================================================================
console.log("=== BS17-065 獣の楽園 ===")
// Lv1･Lv2『自分のアタックステップ』Lv1の自分のスピリットすべてをBP+2000する
for (const cores of [1, 2]) {
    scenario({
        name: `para-lv${cores}-attack-step-bp`,
        start: {
            me: { nexuses: [{ card: PARA, cores }], spirits: [{ card: ROKU, label: "弱" }, { card: ROKU, label: "中", cores: 2 }] },
            opp: { spirits: [{ card: ROKU, label: "敵" }] },
        },
        steps(t) {
            t.act("me", { type: "nextPhase" })
        },
        expect: ["自分.弱.BP: 1000 → 3000"],
    })
}
scenario({
    name: "para-not-in-opp-attack-step",
    start: {
        turn: "opp",
        me: { nexuses: [{ card: PARA, cores: 1 }], spirits: [{ card: ROKU, label: "弱" }] },
        opp: { spirits: [{ card: ROKU, label: "敵" }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
    },
    expect: [],
})
// Lv2『自分のエンドステップ』自分のスピリットすべてを回復させる
scenario({
    name: "para-lv2-end-recover-all",
    start: {
        me: { nexuses: [{ card: PARA, cores: 2 }], spirits: [{ card: ROKU, label: "甲", rested: true }, { card: WHITE, label: "乙", rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "endTurn" })
    },
    expect: ["自分.甲.疲労: true → false", "自分.乙.疲労: true → false", ...ENDTURN],
})
scenario({
    name: "para-lv1-end-no-recover",
    start: { me: { nexuses: [{ card: PARA, cores: 1 }], spirits: [{ card: ROKU, label: "甲", rested: true }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
    },
    expect: ENDTURN,
})

// =====================================================================
// BS17-066 聖者の樹の実（ネクサス。Lv1=コア0個、Lv2=コア1個以上）
// =====================================================================
console.log("=== BS17-066 聖者の樹の実 ===")
// Lv1･Lv2『相手のアタックステップ』相手のスピリットによって自分のライフが減ったとき、ボイドからコア1個を自分のリザーブに置く
for (const cores of [0, 1]) {
    scenario({
        name: `fruit-lv${cores + 1}-life-reduced-by-spirit`,
        start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: FRUIT, cores }] }, opp: { spirits: [{ card: ROKU, label: "攻" }] } },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("攻") })
            t.closeFlash()
            t.act("me", { type: "takeLife" })
        },
        // ライフのコア1個がリザーブへ＋ボイドから1個
        expect: ["相手.攻.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 12"],
    })
}
scenario({
    name: "fruit-blocked-no-life-loss",
    start: {
        turn: "opp", phase: "attack",
        me: { nexuses: [{ card: FRUIT, cores: 0 }], spirits: [{ card: WHITE, label: "守", cores: 2 }] },
        opp: { spirits: [{ card: ROKU, label: "攻" }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("攻") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("守") })
        t.closeFlash()
    },
    expect: [
        "自分.守.疲労: false → true", "相手.攻.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11",
    ],
})
// Lv2『相手のメインステップ』相手がマジックカードを2回以上使用したとき、その効果発揮後、相手のメインステップを終了する
scenario({
    name: "fruit-lv2-second-magic-ends-main",
    start: { turn: "opp", me: { nexuses: [{ card: FRUIT, cores: 1 }] }, opp: { reserve: 20, hand: [ELIXIR, ELIXIR, DOUBLE] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        assert(t.state.phase === "main", "1回目ではメインステップが続く")
        t.act("opp", { type: "castMagic", handIndex: 0 })
        assert(t.state.phase !== "main", "2回目の効果発揮後にメインステップが終わる")
        t.actRejected("opp", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        `相手.手札: ${L("ピュアエリクサー", "ピュアエリクサー", "ダブルドロー")} → ダブルドロー`,
        "相手.トラッシュ: なし → ピュアエリクサー、ピュアエリクサー", "相手.リザーブ: 20 → 14", "相手.トラッシュのコア: 0 → 6",
    ],
})
scenario({
    name: "fruit-lv2-one-magic-keeps-main",
    start: { turn: "opp", me: { nexuses: [{ card: FRUIT, cores: 1 }] }, opp: { hand: [ELIXIR] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        assert(t.state.phase === "main", "1回ではメインステップが続く")
    },
    expect: ["相手.手札: ピュアエリクサー → なし", "相手.トラッシュ: なし → ピュアエリクサー", "相手.リザーブ: 10 → 7", "相手.トラッシュのコア: 0 → 3"],
})
scenario({
    name: "fruit-lv1-two-magics-keeps-main",
    start: { turn: "opp", me: { nexuses: [{ card: FRUIT, cores: 0 }] }, opp: { hand: [ELIXIR, ELIXIR] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        t.act("opp", { type: "castMagic", handIndex: 0 })
        assert(t.state.phase === "main", "Lv1では2回使ってもメインステップが続く")
    },
    expect: ["相手.手札: ピュアエリクサー、ピュアエリクサー → なし", "相手.トラッシュ: なし → ピュアエリクサー、ピュアエリクサー", "相手.リザーブ: 10 → 4", "相手.トラッシュのコア: 0 → 6"],
})
scenario({
    name: "fruit-lv2-own-two-magics-keeps-main",
    start: { me: { nexuses: [{ card: FRUIT, cores: 1 }], hand: [ELIXIR, ELIXIR] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.act("me", { type: "castMagic", handIndex: 0 })
        assert(t.state.phase === "main", "自分のメインステップは終わらない")
    },
    expect: ["自分.手札: ピュアエリクサー、ピュアエリクサー → なし", "自分.トラッシュ: なし → ピュアエリクサー、ピュアエリクサー", "自分.リザーブ: 10 → 4", "自分.トラッシュのコア: 0 → 6"],
})

// =====================================================================
// BS17-077 ワイルドウィング（フラッシュ）
// =====================================================================
console.log("=== BS17-077 ワイルドウィング ===")
const wildCast = ["自分.手札: ワイルドウィング → なし", "自分.トラッシュ: なし → ワイルドウィング", "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 2"]
scenario({
    name: "wild-more-spirits",
    start: {
        me: { hand: [WILD], spirits: [{ card: ROKU, label: "甲" }, { card: WHITE, label: "乙" }] },
        opp: { spirits: [{ card: SHOCK, label: "敵" }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [...wildCast, "自分.甲.BP: 1000 → 4000", "自分.乙.BP: 1000 → 4000"],
})
// 「以上」＝同数でも発揮。このターンの間は、そのあとに出たスピリットにも効く
scenario({
    name: "wild-equal-later-summon",
    start: { me: { hand: [WILD, WHITE], spirits: [{ card: ROKU, label: "甲" }] }, opp: { spirits: [{ card: SHOCK, label: "敵" }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: バーサーカー・ガン、ワイルドウィング → なし", "自分.トラッシュ: なし → ワイルドウィング",
        "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 3", "自分.甲.BP: 1000 → 4000",
        ...appear("自分", "バーサーカー・ガン", 4000, 1, 1),
    ],
})
scenario({
    name: "wild-fewer-spirits",
    start: {
        me: { hand: [WILD], spirits: [{ card: ROKU, label: "甲" }] },
        opp: { spirits: [{ card: SHOCK, label: "敵1" }, { card: SHOCK, label: "敵2" }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: wildCast,
})

// =====================================================================
// BS17-078 ウォークライ
// =====================================================================
console.log("=== BS17-078 ウォークライ ===")
// 【バースト：相手による自分のスピリット破壊後】Lv1のスピリットすべてを疲労させる。その後コストを支払うことで、このカードのフラッシュ効果を発揮する
const warBurstStart = {
    turn: "opp" as const, interactive: true,
    me: {
        spirits: [{ card: ROKU, label: "的" }, { card: WHITE, label: "弱" }, { card: MELT, label: "中", cores: 3 }],
        burst: WAR,
    },
    opp: {
        hand: [FLAME],
        spirits: [{ card: SHOCK, label: "敵1" }, { card: HERA, label: "敵2", cores: 3 }],
    },
}
const warBurstCommon = [
    ...flameCast("相手"), "自分.的.場所: フィールド → なし", "自分.バースト: ウォークライ → なし",
    "自分.弱.疲労: false → true", "相手.敵1.疲労: false → true", // Lv1 は敵味方すべて
]
scenario({
    name: "war-burst-pay",
    start: warBurstStart,
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("的") })
        t.closeFlash()
        answers(t, "me", ["発動する", "発動する"]) // 発動 → コストを支払う
    },
    expect: [
        ...warBurstCommon, "自分.トラッシュ: なし → " + L("ウォークライ", "ロクケラトプス"),
        "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 4", // 的のコア+1、コスト4
        "自分.中.疲労: false → true", "相手.敵2.疲労: false → true", // フラッシュ効果：Lv2 は敵味方すべて
    ],
})
scenario({
    name: "war-burst-decline-pay",
    start: warBurstStart,
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("的") })
        t.closeFlash()
        answers(t, "me", ["発動する", undefined])
    },
    expect: [...warBurstCommon, "自分.トラッシュ: なし → " + L("ウォークライ", "ロクケラトプス"), "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "war-burst-not-for-opp-spirit",
    start: {
        interactive: true,
        me: { hand: [FLAME], spirits: [{ card: WHITE, label: "弱" }], burst: WAR },
        opp: { spirits: [{ card: SHOCK, label: "敵" }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("敵") })
        t.closeFlash()
        noPending(t)
    },
    expect: [...flameCast("自分"), "相手.敵.場所: フィールド → なし", "相手.トラッシュ: なし → ショックイーター", "相手.リザーブ: 10 → 11"],
})
// フラッシュ：Lv2のスピリットすべてを疲労させる（使うだけで撃てるのはこちらだけ）
scenario({
    name: "war-flash-lv2-only",
    start: {
        me: { hand: [WAR], spirits: [{ card: ROKU, label: "甲" }, { card: WHITE, label: "乙", cores: 2 }] },
        opp: { spirits: [{ card: SHOCK, label: "敵1" }, { card: MELT, label: "敵2", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.手札: ウォークライ → なし", "自分.トラッシュ: なし → ウォークライ", "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4",
        "自分.乙.疲労: false → true", "相手.敵2.疲労: false → true",
    ],
})

// =====================================================================
// BS17-X03 大牙帝ビャクガロード・ソンケン
// =====================================================================
console.log("=== BS17-X03 大牙帝ビャクガロード・ソンケン ===")
// Lv1･Lv2 【暴風】を持つ自分のスピリットすべてに“『このスピリットのアタック時』相手はバーストを発動できない”を与える
const sonAttack = (name: string, mine: { card: string; label?: string; cores?: number }[], attacker: string, expect: string[], answerBurst: boolean) =>
    scenario({
        name,
        start: { phase: "attack", interactive: true, me: { spirits: mine }, opp: { burst: JIGEN } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id(attacker) })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
            if (answerBurst) {
                answers(t, "opp", ["発動する"])
                // 手札に戻す自分のスピリットが2体以上いれば対象選択が立つ（1体なら自動）。戻すのは攻撃した側
                if (t.state.pendingChoice?.kind === "target") pick(t, "opp", attacker)
                answers(t, "opp", [undefined]) // 「その後コストを支払うことで」は断る
            } else noPending(t)
        },
        expect,
    })
sonAttack("son-bofu-spirit-blocks-burst", [{ card: SON }, { card: GABU }], "ガブノハシ",
    ["自分.ガブノハシ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"], false)
sonAttack("son-lv2-bofu-spirit-blocks-burst", [{ card: SON, cores: 3 }, { card: GABU }], "ガブノハシ",
    ["自分.ガブノハシ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"], false)
sonAttack("son-absent-bofu-spirit-burst-fires", [{ card: GABU }], "ガブノハシ", jigenFired("ガブノハシ"), true)
sonAttack("son-non-bofu-spirit-burst-fires", [{ card: SON }, { card: ROKU }], "ロクケラトプス", jigenFired("ロクケラトプス"), true)
// Lv2『アタック時』このスピリットがブロックされたとき、相手のスピリット2体を疲労させる
scenario({
    name: "son-lv2-blocked-fatigues-two",
    start: {
        phase: "attack",
        me: { spirits: [{ card: SON, cores: 3 }] },
        opp: { spirits: [{ card: WHITE, label: "守" }, { card: ROKU, label: "控" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("大牙帝ビャクガロード・ソンケン") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("守") })
        t.closeFlash()
    },
    expect: [
        "自分.大牙帝ビャクガロード・ソンケン.疲労: false → true", "相手.控.疲労: false → true",
        "相手.守.場所: フィールド → なし", "相手.トラッシュ: なし → バーサーカー・ガン", "相手.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "son-lv1-blocked-no-fatigue",
    start: {
        phase: "attack",
        me: { spirits: [{ card: SON, cores: 1 }] },
        opp: { spirits: [{ card: WHITE, label: "守" }, { card: ROKU, label: "控" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("大牙帝ビャクガロード・ソンケン") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("守") })
        t.closeFlash()
    },
    expect: [
        "自分.大牙帝ビャクガロード・ソンケン.疲労: false → true",
        "相手.守.場所: フィールド → なし", "相手.トラッシュ: なし → バーサーカー・ガン", "相手.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "son-lv2-unblocked-no-fatigue",
    start: { phase: "attack", me: { spirits: [{ card: SON, cores: 3 }] }, opp: { spirits: [{ card: ROKU, label: "控" }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("大牙帝ビャクガロード・ソンケン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.大牙帝ビャクガロード・ソンケン.疲労: false → true", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"], // ダブルシンボル
})

console.log("すべてのチェックに合格しました 🎉（part619）")
