// smoke パート858（BS23 緑バッチ中盤：023 グレイスキャタピラー・025 忍鳥ジューイチ・026 剣聖仙忍ジライヤ・X03 蝶の女皇帝グレイス・パピヨン）
// 期待値は効果文と公式Q&A（BS23_PLAN §1）だけから書いた。分身の基本は BS22_PLAN の B1 行
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"
import { arrive, braved, bunshin, names, settle } from "./bs23green"

const CATER = "BS23-023"
const MORPH = "BS23-024"
const JU = "BS23-025"
const JIRAIYA = "BS23-026"
const BRAVE = "BS23-060"
const X03 = "BS23-X03"
const ROK = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000）
const SHOCK = "BS01-054" // ショックイーター（緑・コスト2・BP3000）
const WHT = "BS01-074" // バーサーカー・ガン（白・コスト1）
const MATANGO = "BS10-028" // マタンゴル（緑・コスト5・Lv1 BP6000）
const BAG = "BS04-030" // 食蟲花バグ・レシア（緑・コスト6）

console.log("=== 前提: カードの機械確認 ===")
{
    const n = (id: string) => getCard(id).name
    assert(n(CATER) === "グレイスキャタピラー" && n(MORPH) === "夜蝶剣聖モルフォナイト" && n(JU) === "忍鳥ジューイチ", "023・024・025 の名前")
    assert(n(JIRAIYA) === "剣聖仙忍ジライヤ" && n(X03) === "蝶の女皇帝グレイス・パピヨン" && getCard(X03).cost === 8, "026・X03（コスト8）")
    assert(n(MORPH).includes("蝶") && getCard(MORPH).type === "spirit" && !n(ROK).includes("蝶"), "手札の蝶入りスピリットは024。ロクケラトプスは蝶でない")
    assert(getCard(BAG).cost === 6 && getCard(BAG).type === "spirit" && getCard(MATANGO).cost === 5, "コスト8/9でないスピリットを用意")
}

// 相手のターンから進めて、自分のドローステップの選択待ちまで送る
function toMyDraw(t: ScenarioCtx): void {
    t.act("opp", { type: "endTurn" })
}
const deckWithTop = (top: string): string[] => [top, ...Array.from({ length: 39 }, () => ROK)]

console.log("=== 023 キャタピラー：ドローのかわりにオープンしたコスト8/9のスピリットは手札へ入り、ボイドからコア1個がこのスピリットへ ===")
// ターン開始のコア+1で 10→11
scenario({
    name: "cater-draw-open-cost8",
    start: { turn: "opp", me: { spirits: [{ card: CATER, label: "キャタ" }], deck: deckWithTop(X03) } },
    steps(t) {
        toMyDraw(t)
        settle(t, "yes")
    },
    expect: ["自分.リザーブ: 10 → 11", `自分.手札: なし → ${names([X03])}`, "自分.デッキ枚数: 40 → 39", "自分.キャタ.コア: 1 → 2"],
})

console.log("=== 023 キャタピラー：コスト6のスピリットをオープンしても手札には入るがコアは置かれない ===")
scenario({
    name: "cater-draw-open-cost6",
    start: { turn: "opp", me: { spirits: [{ card: CATER, label: "キャタ" }], deck: deckWithTop(BAG) } },
    steps(t) {
        toMyDraw(t)
        settle(t, "yes")
    },
    expect: ["自分.リザーブ: 10 → 11", `自分.手札: なし → ${names([BAG])}`, "自分.デッキ枚数: 40 → 39"],
})

console.log("=== 023 キャタピラー：「できる」を断れば通常どおりドローする（コスト8は引くだけでコアは置かれない） ===")
scenario({
    name: "cater-draw-declined",
    start: { interactive: true, turn: "opp", me: { spirits: [{ card: CATER, label: "キャタ" }], deck: deckWithTop(X03) } },
    steps(t) {
        toMyDraw(t)
        settle(t, "no")
    },
    expect: ["自分.リザーブ: 10 → 11", `自分.手札: なし → ${names([X03])}`, "自分.デッキ枚数: 40 → 39"],
})

console.log("=== 023 キャタピラー：破壊時、手札の名前に「蝶」を含むスピリットを無償召喚できる（含まないカードは出ない） ===")
// 無償召喚の維持コア-1と、破壊されたキャタピラーのコア+1が相殺してリザーブは変わらない
scenario({
    name: "cater-destroyed-summon-butterfly",
    start: {
        turn: "opp",
        me: { spirits: [{ card: CATER, label: "キャタ" }], hand: [ROK, MORPH] },
        opp: { spirits: [{ card: MATANGO, label: "攻撃役" }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("キャタ") })
        t.closeFlash()
        settle(t, "yes")
    },
    expect: [
        "自分.キャタ.場所: フィールド → なし", `自分.トラッシュ: なし → ${names([CATER])}`,
        `自分.手札: ${names([ROK, MORPH])} → ${names([ROK])}`,
        ...arrive("夜蝶剣聖モルフォナイト", { cores: 1, lv: 1, bp: 3000 }),
        "相手.攻撃役.疲労: false → true",
    ],
})

console.log("=== 025 ジューイチ：召喚時【分身：1】 ===")
scenario({
    name: "ju-summon-bunshin",
    start: { me: { hand: [JU] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 5", `自分.手札: ${names([JU])} → なし`, "自分.デッキ枚数: 40 → 39",
        ...arrive("忍鳥ジューイチ", { cores: 1, lv: 1, bp: 3000 }),
        ...bunshin(1, 1),
    ],
})

console.log("=== 025 ジューイチ：デッキが空なら分身は出ない（「N枚まで」。BS22_PLAN の未決1） ===")
scenario({
    name: "ju-summon-empty-deck",
    start: { me: { hand: [JU], deck: [] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 4", "自分.トラッシュのコア: 0 → 5", `自分.手札: ${names([JU])} → なし`,
        ...arrive("忍鳥ジューイチ", { cores: 1, lv: 1, bp: 3000 }),
    ],
})

console.log("=== 026 ジライヤ：召喚時、自分のスピリット1体（JU）の【分身】を発揮させる ===")
// JU の緑1つで軽減1 → コスト5。10-5-1(維持)-1(分身)=3
scenario({
    name: "jiraiya-summon-fires-bunshin",
    start: { me: { spirits: [{ card: JU, label: "JU" }], hand: [JIRAIYA] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 5", `自分.手札: ${names([JIRAIYA])} → なし`, "自分.デッキ枚数: 40 → 39",
        ...arrive("剣聖仙忍ジライヤ", { cores: 1, lv: 1, bp: 5000 }),
        ...bunshin(1, 1),
    ],
})

console.log("=== 026 ジライヤ：【分身】を持つスピリットが自分にいなければ何も起きない ===")
scenario({
    name: "jiraiya-summon-no-bunshin-holder",
    start: { me: { spirits: [{ card: SHOCK, label: "ショック" }], hand: [JIRAIYA] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 4", "自分.トラッシュのコア: 0 → 5", `自分.手札: ${names([JIRAIYA])} → なし`,
        ...arrive("剣聖仙忍ジライヤ", { cores: 1, lv: 1, bp: 5000 }),
    ],
})

// 合体アタック時の【合体時】。分身を先に JU で作り、日輪丸を合体してアタック宣言まで進める（バトルの途中で写像を取る）
// JU：緑1つ → コスト4（14-4-1-1=8）。日輪丸：緑2つ以上で軽減2 → コスト2（8-2=6）
function jiraiyaCombined(name: string, hostCores: number, bp: [number, number]): void {
    scenario({
        name,
        start: { me: { reserve: 14, spirits: [{ card: JIRAIYA, label: "ジライヤ", cores: hostCores }], hand: [JU, BRAVE] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            settle(t)
            t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ジライヤ") })
            settle(t)
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("ジライヤ") })
            settle(t)
        },
        expect: [
            "自分.リザーブ: 14 → 6", "自分.トラッシュのコア: 0 → 6", `自分.手札: ${names([JU, BRAVE])} → なし`, "自分.デッキ枚数: 40 → 39",
            "自分.ジライヤ.疲労: false → true", `自分.ジライヤ.BP: ${bp[0]} → ${bp[1]}`,
            ...braved("翡翠の小太刀 日輪丸"),
            ...arrive("忍鳥ジューイチ", { cores: 1, lv: 1, bp: 3000 }),
            ...bunshin(1, 1),
        ],
    })
}
console.log("=== 026 ジライヤ Lv2：合体アタック時、自分の分身1体につきBP+3000（ブレイヴ+3000と合わせて 7000→13000） ===")
jiraiyaCombined("jiraiya-lv2-combined-attack", 3, [7000, 13000])
console.log("=== 026 ジライヤ Lv1：【合体時】Lv2･3 なので分身がいてもBP+されない（5000→ブレイヴ分だけ8000） ===")
jiraiyaCombined("jiraiya-lv1-combined-attack", 1, [5000, 8000])

// 軽減：赤シンボルを持つ脇役がいればコスト8→7（X03 の軽減に赤がある）。14-7-1(維持)-1(無償召喚の維持)=5
function x03(name: string, ally: string, destroyedAndBounced: boolean): void {
    scenario({
        name,
        start: {
            me: { reserve: 14, spirits: [{ card: ally, label: "味方" }], hand: [X03, X03, BAG] },
            opp: { spirits: [{ card: ROK, label: "A" }, { card: ROK, label: "B" }, { card: ROK, label: "C" }] },
        },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            settle(t)
        },
        expect: [
            "自分.リザーブ: 14 → 5", "自分.トラッシュのコア: 0 → 7", `自分.手札: ${names([X03, X03, BAG])} → ${names([BAG])}`,
            ...arrive("蝶の女皇帝グレイス・パピヨン", { cores: 1, lv: 1, bp: 6000 }),
            ...arrive("蝶の女皇帝グレイス・パピヨン#2", { cores: 1, lv: 1, bp: 6000 }),
            ...(destroyedAndBounced
                ? [
                      "相手.A.場所: フィールド → なし", "相手.B.場所: フィールド → なし", "相手.C.場所: フィールド → なし",
                      `相手.トラッシュ: なし → ${names([ROK])}`, `相手.手札: なし → ${names([ROK, ROK])}`, "相手.リザーブ: 10 → 13",
                  ]
                : []),
        ],
    })
}
console.log("=== X03：召喚時に手札のコスト8/9を好きなだけ無償召喚（コスト6は出ない）。赤と白のシンボルがあれば【連鎖】で赤：1体破壊・白：自分のコスト8/9が2体なので2体手札へ ===")
// 味方に赤と白の両方が要るので、場の脇役を2体にして呼び分ける
scenario({
    name: "x03-summon-chain-both",
    start: {
        me: { reserve: 14, spirits: [{ card: ROK, label: "赤味方" }, { card: WHT, label: "白味方" }], hand: [X03, X03, BAG] },
        opp: { spirits: [{ card: ROK, label: "A" }, { card: ROK, label: "B" }, { card: ROK, label: "C" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 14 → 5", "自分.トラッシュのコア: 0 → 7", `自分.手札: ${names([X03, X03, BAG])} → ${names([BAG])}`,
        ...arrive("蝶の女皇帝グレイス・パピヨン", { cores: 1, lv: 1, bp: 6000 }),
        ...arrive("蝶の女皇帝グレイス・パピヨン#2", { cores: 1, lv: 1, bp: 6000 }),
        "相手.A.場所: フィールド → なし", "相手.B.場所: フィールド → なし", "相手.C.場所: フィールド → なし",
        `相手.トラッシュ: なし → ${names([ROK])}`, `相手.手札: なし → ${names([ROK, ROK])}`, "相手.リザーブ: 10 → 13",
    ],
})

console.log("=== X03：赤/白のシンボルが無ければ【連鎖】は出ない（無償召喚だけ） ===")
// 緑のショックイーターで軽減（緑1つ → コスト7）
x03("x03-summon-no-chain", SHOCK, false)

console.log("すべてのチェックに合格しました 🎉（part858）")
