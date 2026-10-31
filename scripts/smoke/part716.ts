// smoke パート716（プロモ バッチC2：P047 甲角龍ビート・ドラゴン／PX15 蜂王フォン・ニード。期待値役が効果文だけから書いた場面テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const P047 = "P047"
const PX15 = "PX15"
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・バニラ）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・Lv1 BP3000）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・コスト3・Lv1 BP4000）
const TAIGA = "BS03-099" // 虎拳士タイガ（青・コスト7・Lv1 BP5000／Lv2(コア4) BP8000／Lv3(コア7) BP10000）
const WINGAL = "BS02-046" // ウィンガル（白・コスト6・Lv1 BP5000）
const FENRIR = "BS10-071" // フェンリルキャノンType-B（白・ブレイヴ・コスト4）
const AMEMI = "BS10-078" // 聖鎧獣アメミード（青・ブレイヴ・コスト5）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    assert(c(P047).name === "甲角龍ビート・ドラゴン" && c(P047).type === "spirit" && c(P047).colors.join() === "red" && c(P047).cost === 8, "P047は赤コスト8")
    assert(c(PX15).name === "蜂王フォン・ニード" && c(PX15).colors.join() === "green" && c(PX15).cost === 7, "PX15は緑コスト7")
    assert(c(ROKU).name === "ロクケラトプス" && c(ROKU).cost === 1 && c(ROKU).levels[0]!.bp === 1000, "ROKUはBP1000")
    assert(c(METAL).name === "メタルバーン" && c(METAL).cost === 3 && c(METAL).levels[0]!.bp === 3000, "METALはコスト3・BP3000")
    assert(c(HERA).name === "ヘラクレス・ジオ" && c(HERA).cost === 3 && c(HERA).levels[0]!.bp === 4000, "HERAはコスト3・BP4000")
    assert(c(TAIGA).name === "虎拳士タイガ" && c(TAIGA).cost === 7 && c(TAIGA).levels[0]!.bp === 5000 && c(TAIGA).levels[1]!.cores === 4 && c(TAIGA).levels[1]!.bp === 8000, "TAIGAはLv1 5000・Lv2(コア4) 8000")
    assert(c(WINGAL).name === "ウィンガル" && c(WINGAL).cost === 6 && c(WINGAL).levels[0]!.bp === 5000, "WINGALはコスト6・BP5000")
    assert(c(FENRIR).name === "フェンリルキャノンType-B" && c(FENRIR).type === "brave" && c(FENRIR).cost === 4, "FENRIRはコスト4のブレイヴ")
    assert(c(AMEMI).name === "聖鎧獣アメミード" && c(AMEMI).type === "brave" && c(AMEMI).cost === 5, "AMEMIはコスト5のブレイヴ")
    for (const id of [ROKU, METAL, HERA, TAIGA, WINGAL]) assert(c(id).effects.length === 0 && c(id).type === "spirit", `${id}は効果なしのスピリット`)
}

// 選択待ちを最後まで答える。prefer に挙げたラベルのインスタンスがあれば優先する
function resolveAll(t: ScenarioCtx, prefer: string[] = []): void {
    for (let i = 0; i < 20 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "target") {
            const ids = prefer.map((l) => t.id(l))
            const hit = ids.find((id) => pc.candidates.includes(id) && !(pc.selectedIds ?? []).includes(id))
            t.act(side, { type: "resolveChoice", instanceId: hit ?? pc.candidates[0]! })
        } else if (pc.kind === "option") t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        else t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices![0]! })
    }
}

// 召喚してすぐ出る効果の場面。P047 は赤コスト8（シンボル無しなら 8＋コア1個）
const SUMMON_LINES = [
    "自分.手札: 甲角龍ビート・ドラゴン → なし",
    "自分.甲角龍ビート・ドラゴン.場所: なし → フィールド",
    "自分.甲角龍ビート・ドラゴン.疲労: なし → false",
    "自分.甲角龍ビート・ドラゴン.コア: なし → 1",
    "自分.甲角龍ビート・ドラゴン.Lv: なし → 1",
    "自分.甲角龍ビート・ドラゴン.BP: なし → 7000",
]
const COST = (reserveAfter: number, trashCores: number) => [`自分.リザーブ: 10 → ${reserveAfter}`, `自分.トラッシュのコア: 0 → ${trashCores}`]

console.log("=== 1. P047 召喚時：BP4000以下を2体まで破壊し、破壊した数だけドロー（境界4000を含む／5000は対象外） ===")
scenario({
    name: "p047-two",
    start: { me: { hand: [P047] }, opp: { spirits: [{ card: METAL }, { card: HERA }, { card: TAIGA }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [
        ...SUMMON_LINES,
        ...COST(1, 8),
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.ヘラクレス・ジオ.場所: フィールド → なし",
        "相手.リザーブ: 10 → 12",
        "相手.トラッシュ: なし → ヘラクレス・ジオ、メタルバーン",
        "自分.手札: 甲角龍ビート・ドラゴン → ロクケラトプス、ロクケラトプス",
        "自分.デッキ枚数: 40 → 38",
    ],
})

console.log("=== 2. P047 召喚時：対象が1体なら破壊も1体・ドローも1枚 ===")
scenario({
    name: "p047-one",
    start: { me: { hand: [P047] }, opp: { spirits: [{ card: ROKU }, { card: TAIGA }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [
        ...SUMMON_LINES.slice(1),
        "自分.手札: 甲角龍ビート・ドラゴン → ロクケラトプス",
        ...COST(1, 8),
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
    ],
})

console.log("=== 3. P047 召喚時：BP4000以下がいなければ破壊もドローも起きない ===")
scenario({
    name: "p047-none",
    start: { me: { hand: [P047] }, opp: { spirits: [{ card: TAIGA }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [...SUMMON_LINES, ...COST(1, 8)],
})

console.log("=== 4. P047 召喚時：「自分の」と書かれていないので、相手側に候補がなければ自分のスピリットに当たる（赤シンボルでコスト7） ===")
scenario({
    name: "p047-own",
    start: { me: { hand: [P047], spirits: [{ card: ROKU }] }, opp: { spirits: [{ card: TAIGA }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [
        ...SUMMON_LINES.slice(1),
        "自分.手札: 甲角龍ビート・ドラゴン → ロクケラトプス",
        "自分.リザーブ: 10 → 3", // コスト7＋コア1個＝8、破壊されたロクケラトプスのコア1個が戻る
        "自分.トラッシュのコア: 0 → 7",
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
    ],
})

// ブレイヴを合体させてアタックしたときの、効果と関係ない変化（合体したブレイヴのコアはホストへ移る）
const COMBINE_LINES = ["自分.フェンリルキャノンType-B.場所: フィールド → 合体", "自分.フェンリルキャノンType-B.コア: 1 → 0", "自分.フェンリルキャノンType-B.BP: 3000 → なし", "自分.甲角龍ビート・ドラゴン.疲労: false → true"]

// 合体アタックの場面。P047 は Lv3（コア5）／Lv2（コア3）。ブレイヴを合体させてアタックし、ブロックされずにライフで受ける
function combinedAttack(t: ScenarioCtx, prefer: string[] = []): void {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("自分.フェンリルキャノンType-B"), hostInstanceId: t.id("自分.甲角龍ビート・ドラゴン") })
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("自分.甲角龍ビート・ドラゴン") })
    resolveAll(t, prefer)
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
}

console.log("=== 5. P047 Lv3 合体アタック時：スピリット状態のブレイヴ1体＋合体のブレイヴ1つ＝2体を破壊（BP7000以下。8000は対象外） ===")
scenario({
    name: "p047-lv3-two",
    start: {
        me: { spirits: [{ card: P047, cores: 5 }, { card: FENRIR }, { card: AMEMI }] },
        opp: { spirits: [{ card: ROKU }, { card: METAL }, { card: TAIGA, cores: 4 }] },
    },
    steps: (t) => combinedAttack(t),
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.リザーブ: 10 → 14", // 破壊2体のコア2個＋ライフ2点ぶんのコア2個（合体で赤1＋白1のシンボル2つ）
        "相手.トラッシュ: なし → メタルバーン、ロクケラトプス",
        "相手.ライフ: 5 → 3",
        ...COMBINE_LINES,
        "自分.甲角龍ビート・ドラゴン.コア: 5 → 6",
        "自分.甲角龍ビート・ドラゴン.BP: 15000 → 18000",
    ],
})

console.log("=== 6. P047 Lv3 合体アタック時：合体のブレイヴ1つだけなら1体（相手が選ぶ対象を自分が選ぶ） ===")
scenario({
    name: "p047-lv3-one",
    start: {
        me: { spirits: [{ card: P047, cores: 5 }, { card: FENRIR }] },
        opp: { spirits: [{ card: ROKU }, { card: METAL }, { card: TAIGA, cores: 4 }] },
        // 候補が2体いるので選ぶ場面を作る
    },
    steps: (t) => {
        t.state.interactiveTargets = true
        combinedAttack(t, ["相手.メタルバーン"])
    },
    expect: [
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.リザーブ: 10 → 13", // 破壊1体のコア1個＋ライフ2点ぶんのコア2個
        "相手.トラッシュ: なし → メタルバーン",
        "相手.ライフ: 5 → 3",
        ...COMBINE_LINES,
        "自分.甲角龍ビート・ドラゴン.コア: 5 → 6",
        "自分.甲角龍ビート・ドラゴン.BP: 15000 → 18000",
    ],
})

console.log("=== 7. P047 合体アタック時はLv3のみ：Lv2（コア3）では何も破壊しない ===")
scenario({
    name: "p047-lv2-nothing",
    start: {
        me: { spirits: [{ card: P047, cores: 3 }, { card: FENRIR }, { card: AMEMI }] },
        opp: { spirits: [{ card: ROKU }, { card: METAL }] },
    },
    steps: (t) => combinedAttack(t),
    expect: [
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
        ...COMBINE_LINES,
        "自分.甲角龍ビート・ドラゴン.コア: 3 → 4",
        "自分.甲角龍ビート・ドラゴン.BP: 10000 → 13000",
    ],
})

// ---------------- PX15 ----------------

console.log("=== 8. PX15 召喚時：ボイドからコア3個がこのスピリットに置かれ、Lv2（コア4・BP10000）になる ===")
scenario({
    name: "px15-summon",
    start: { me: { hand: [PX15] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 蜂王フォン・ニード → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 7",
        "自分.蜂王フォン・ニード.場所: なし → フィールド",
        "自分.蜂王フォン・ニード.疲労: なし → false",
        "自分.蜂王フォン・ニード.コア: なし → 4",
        "自分.蜂王フォン・ニード.Lv: なし → 2",
        "自分.蜂王フォン・ニード.BP: なし → 10000",
    ],
})

console.log("=== 9. PX15 アタック時：BP合計10000まで好きなだけ疲労。10000に達したら残りは選べない（Lv1・コア1） ===")
scenario({
    name: "px15-rest-cap",
    start: {
        me: { spirits: [{ card: PX15 }] },
        opp: { spirits: [{ card: TAIGA }, { card: WINGAL }, { card: ROKU }] },
    },
    steps: (t) => {
        t.state.interactiveTargets = true
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("蜂王フォン・ニード") })
        for (const l of ["相手.虎拳士タイガ", "相手.ウィンガル"]) {
            const pc = t.state.pendingChoice
            assert(pc !== null && pc.kind === "target" && pc.candidates.includes(t.id(l)), `${l}を疲労の対象に選べる`)
            if (pc) t.act("me", { type: "resolveChoice", instanceId: t.id(l) })
        }
        // 5000＋5000で上限。1000のロクケラトプスを足すと11000になるので、もう選べない
        const rest = t.state.pendingChoice
        assert(rest === null || !(rest.kind === "target" && rest.candidates.includes(t.id("相手.ロクケラトプス"))), "合計が10000に達したら、ロクケラトプスは候補にならない")
        if (rest) t.act("me", { type: "resolveChoice" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.虎拳士タイガ.疲労: false → true",
        "相手.ウィンガル.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.蜂王フォン・ニード.疲労: false → true",
    ],
})

console.log("=== 10. PX15 Lv2 アタック時：相手のライフを減らしたら、コア3個を払って回復（コア4→1でLv1に戻る） ===")
scenario({
    name: "px15-recover",
    start: { me: { spirits: [{ card: PX15, cores: 4 }] } },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("蜂王フォン・ニード") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        const pc = t.state.pendingChoice
        assert(pc !== null && pc.kind === "option" && pc.pid === t.me, "払う確認が出る")
        resolveAll(t)
    },
    expect: [
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.トラッシュのコア: 0 → 3",
        "自分.蜂王フォン・ニード.コア: 4 → 1",
        "自分.蜂王フォン・ニード.Lv: 2 → 1",
        "自分.蜂王フォン・ニード.BP: 10000 → 6000",
    ],
})

console.log("=== 11. PX15 の回復はLv2のみ：Lv1（コア3）ではライフを減らしても回復しない ===")
scenario({
    name: "px15-lv1-no-recover",
    start: { me: { spirits: [{ card: PX15, cores: 3 }] } },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("蜂王フォン・ニード") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        resolveAll(t)
    },
    expect: [
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.蜂王フォン・ニード.疲労: false → true",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part716）")
