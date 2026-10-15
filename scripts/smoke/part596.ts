// smoke パート596（コストの支払い元にフィールドのコアを使う効果の場面。2026-10-15 ユーザー確認）
// A 兵隊アントマン破壊時：破壊待機のアントマンのコアは、リザーブへ移らずフィールドのコアとして全部（維持コアぶんも）支払いに使える
// B 破壊時の召喚で【転召】持ちを出すとき、「決定」の後・支払いの前に転召で使うスピリットを選ぶ（候補2体以上のときだけ。破壊待機のアントマンは候補外）
// C 【不死】の召喚コストもフィールドのコアから払える／D ミノガメンの祭壇の余分もフィールドから払える
// 盤面の前提：破壊待機のスピリットのコアは乗ったまま支払いに使え、払わずに残ったぶんは破壊でリザーブへ戻る（2026-10-15 ユーザー確認）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const ANT = "BS02-030" // 兵隊アントマン（緑・コスト3・Lv2は2コア BP4000）
const FLY = "BS03-029" // マッハフライ（緑・コスト3・軽減 緑2・怪虫・効果なし）
const SRC = "BS01-055" // エメアント（緑・コスト2・怪虫・効果なし）
const QUEEN = "BS08-025" // 女王アントレーヌ（緑・コスト5・軽減 緑4・怪虫・【転召：コスト1以上/トラッシュ】）
const BOSS = "BS10-028" // マタンゴル（相手のアタッカー Lv1 BP6000）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・3コアでLv3）
const GAHERIS = "BS11-010" // 闇騎士ガヘリス（紫・コスト2・軽減なし・【不死：コスト3】）
const ALTAR = "SD02-013" // 転召の祭壇（青ネクサス）
const STATUE = "BS03-073" // ストン・スタチュー（青・コスト1・召喚時：相手のデッキを上から1枚破棄）
const MINO = "BS13-034" // ミノガメン（黄・コスト2・相手のデッキ破棄効果で破棄されたら無償召喚）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ANT).name === "兵隊アントマン" && getCard(ANT).levels[1]?.cores === 2 && getCard(ANT).cost === 3, "ANTはLv2が2コア・コスト3")
    assert(getCard(FLY).cost === 3 && (getCard(FLY).reduction ?? []).join() === "green,green" && (getCard(FLY).family ?? []).includes("怪虫"), "FLYはコスト3・軽減 緑2の怪虫")
    assert(getCard(SRC).cost === 2 && (getCard(SRC).family ?? []).includes("怪虫"), "SRCはコスト2の怪虫")
    assert(getCard(QUEEN).name === "女王アントレーヌ" && getCard(QUEEN).cost === 5 && (getCard(QUEEN).reduction ?? []).join() === "green,green,green,green" && (getCard(QUEEN).family ?? []).includes("怪虫"), "QUEENはコスト5・軽減 緑4の怪虫")
    assert(getCard(BOSS).name === "マタンゴル" && getCard(BOSS).levels[0]?.bp === 6000, "BOSSはBP6000")
    assert(getCard(ROKU).levels.length === 3 && getCard(ROKU).levels[2]?.cores === 3, "ROKUは3コアでLv3")
    assert(getCard(GAHERIS).name === "闇騎士ガヘリス" && getCard(GAHERIS).cost === 2 && (getCard(GAHERIS).reduction ?? []).length === 0, "GAHERISはコスト2・軽減なし")
    assert(getCard(GAHERIS).effects.some((e: any) => e.keyword === "fushi"), "GAHERISは【不死】持ち")
    assert(getCard(ALTAR).name === "転召の祭壇" && getCard(STATUE).name === "ストン・スタチュー" && getCard(STATUE).cost === 1, "ALTAR・STATUE")
    assert(getCard(MINO).name === "ミノガメン" && getCard(MINO).cost === 2, "MINOはコスト2")
}

// 対話中の選択待ちを順に処理する。支払い待ち（effectCostPay）は pay の指定で答える。target 待ちは pick で答える
function drive(t: ScenarioCtx, pay: { label: string; count: number } | { label: string; count: number }[] | null, pick?: string): { sawCostPay: boolean; sawTarget: boolean } {
    const seen = { sawCostPay: false, sawTarget: false }
    for (let i = 0; i < 10 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice as any
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.effectCostPay) {
            seen.sawCostPay = true
            t.act(side, { type: "resolveChoice", option: pc.options?.[0], ...(pay ? { paySources: [pay].flat().map((p) => ({ instanceId: t.id(p.label), count: p.count })) } : {}) })
        } else if (pc.kind === "target") {
            seen.sawTarget = true
            t.act(side, { type: "resolveChoice", instanceId: pick ? t.id(pick) : pc.candidates[0] })
        } else {
            t.act(side, { type: "resolveChoice", option: pc.options?.[0] })
        }
    }
    return seen
}

function destroyAndConfirm(t: ScenarioCtx, blocker: string): void {
    t.act("opp", { type: "attack", instanceId: t.id("マタンゴル") })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id(blocker) })
    t.closeFlash()
}
function confirmAnt(t: ScenarioCtx): void {
    const pc = t.state.pendingChoice as any
    assert(pc?.pid === t.me && pc.confirm === true, "アントマンの破壊時の発動確認が出る")
    t.act("me", { type: "resolveChoice", option: pc.options[0] })
}
// part594 と同じ複数選択の操作（手札 cardIndex でトグル→「決定」）
function chooseHand(t: ScenarioCtx, idx: number[]): void {
    assert(t.state.pendingChoice?.pid === t.me, "手札から召喚するものを選ぶ待ちが出る")
    for (const i of idx) t.act("me", { type: "resolveChoice", cardIndex: i })
    t.act("me", { type: "resolveChoice", option: "決定" })
}

const BATTLE_ANT = ["相手.マタンゴル.疲労: false → true", "自分.兵隊アントマン.場所: フィールド → なし"]
const arrives = (label: string, bp: number) => [
    `自分.${label}.場所: なし → フィールド`,
    `自分.${label}.疲労: なし → false`,
    `自分.${label}.コア: なし → 1`,
    `自分.${label}.Lv: なし → 1`,
    `自分.${label}.BP: なし → ${bp}`,
]

console.log("=== A. リザーブが足りない → 破壊待機のアントマンのコア2個（維持コア含む）を全部フィールドのコアとして払う ===")
// FLYのコスト 3-1(アントマンの緑)=2 をアントマンの2コアで払う。置くコア1個はリザーブ1から。アントマンはトラッシュへ
scenario({
    name: "ant-pay-all-own-cores",
    mirror: false,
    start: {
        turn: "opp", phase: "attack", interactive: true,
        me: { reserve: 1, hand: [FLY], spirits: [{ card: ANT, cores: 2 }] },
        opp: { spirits: [{ card: BOSS, cores: 1 }] },
    },
    steps(t) {
        destroyAndConfirm(t, "兵隊アントマン")
        confirmAnt(t)
        chooseHand(t, [0])
        const r = drive(t, { label: "兵隊アントマン", count: 2 })
        assert(r.sawCostPay, "支払い元を選ぶ待ち（effectCostPay）が出る")
    },
    expect: [...BATTLE_ANT, "自分.トラッシュ: なし → 兵隊アントマン", ...arrives("マッハフライ", 2000), "自分.手札: マッハフライ → なし", "自分.リザーブ: 1 → 0", "自分.トラッシュのコア: 0 → 2"],
})

console.log("=== B. 【転召】持ちの怪虫 → 決定の後・支払いの前に転召で使うスピリットを選ぶ（破壊待機のアントマンも候補＝TIMING_CHART「【転召】との相互作用」） ===")
// QUEENのコスト 5-3(アントマン・FLY・SRCの緑)=2。リザーブ 10+2-2-1=9。FLYを選ぶと1コアすべてトラッシュへ→維持コアを割って消滅
scenario({
    name: "ant-tensho-choose",
    mirror: false,
    start: {
        turn: "opp", phase: "attack", interactive: true,
        me: { reserve: 10, hand: [QUEEN], spirits: [{ card: ANT, cores: 2 }, { card: FLY, cores: 1 }, { card: SRC, cores: 1 }] },
        opp: { spirits: [{ card: BOSS, cores: 1 }] },
    },
    steps(t) {
        destroyAndConfirm(t, "兵隊アントマン")
        confirmAnt(t)
        chooseHand(t, [0])
        const pc = t.state.pendingChoice as any
        assert(pc?.pid === t.me && pc.kind === "target" && !pc.effectCostPay, "「決定」の直後は支払いでなく転召の対象を選ぶ待ちが出る")
        assert(pc.candidates.length === 3 && pc.candidates.includes(t.id("マッハフライ")) && pc.candidates.includes(t.id("エメアント")), "候補はFLY・SRC・アントマンの3体")
        assert(pc.candidates.includes(t.id("兵隊アントマン")), "破壊待機のアントマンも候補に入る")
        t.act("me", { type: "resolveChoice", instanceId: t.id("マッハフライ") })
        const r = drive(t, null)
        assert(r.sawCostPay, "転召の対象を選んだあとに支払い待ちが出る")
    },
    expect: [
        ...BATTLE_ANT,
        ...arrives("女王アントレーヌ", 4000),
        "自分.手札: 女王アントレーヌ → なし",
        "自分.マッハフライ.場所: フィールド → なし",
        "自分.トラッシュ: なし → マッハフライ、兵隊アントマン",
        "自分.リザーブ: 10 → 9",
        "自分.トラッシュのコア: 0 → 3",
    ],
})

console.log("=== B2. 転召の候補が破壊待機のアントマン1体だけ → 選ばせず自動。アントマンのコアがトラッシュへ置かれ、破壊待機のままトラッシュへ ===")
scenario({
    name: "ant-tensho-auto",
    mirror: false,
    start: {
        turn: "opp", phase: "attack", interactive: true,
        me: { reserve: 10, hand: [QUEEN], spirits: [{ card: ANT, cores: 2 }] },
        opp: { spirits: [{ card: BOSS, cores: 1 }] },
    },
    steps(t) {
        destroyAndConfirm(t, "兵隊アントマン")
        confirmAnt(t)
        chooseHand(t, [0])
        const pc = t.state.pendingChoice as any
        assert(!(pc?.kind === "target"), "候補が1体なら転召の対象を選ばせない")
        drive(t, null)
    },
    // QUEENのコスト 5-1(アントマン)=4。リザーブ 10-4-1=5。アントマンの2コアは転召でトラッシュへ（リザーブには戻らない）。
    // QUEENの「アントマンで転召したとき」は『召喚時』の一部なので、召喚時効果が発揮されないこの召喚では起きない
    expect: [
        ...BATTLE_ANT,
        ...arrives("女王アントレーヌ", 4000),
        "自分.手札: 女王アントレーヌ → なし",
        "自分.トラッシュ: なし → 兵隊アントマン",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 6",
    ],
})

// C：FLY（コスト3）が破壊され、トラッシュのガヘリスを【不死】で召喚する。ガヘリスはコスト2で軽減なし
// 破壊待機のFLYの1コアも支払いに使える。コスト2＋置くコア1＝3を、FLYの1とロクケラトプスの余り2で払う
const FUSHI_ME = [
    "自分.マッハフライ.場所: フィールド → なし",
    "自分.トラッシュ: 闇騎士ガヘリス → マッハフライ",
    ...arrives("闇騎士ガヘリス", 1000),
    "自分.ロクケラトプス.コア: 3 → 1",
    "自分.ロクケラトプス.Lv: 3 → 1",
    "自分.ロクケラトプス.BP: 4000 → 1000",
    "相手.マタンゴル.疲労: false → true",
    "自分.トラッシュのコア: 0 → 2",
]
const fushiStart = (interactive: boolean) => ({
    turn: "opp" as const, phase: "attack" as const, interactive,
    me: { reserve: 0, trash: [GAHERIS], spirits: [{ card: FLY, cores: 1 }, { card: ROKU, cores: 3 }] },
    opp: { spirits: [{ card: BOSS, cores: 1 }] },
})

console.log("=== C1. 【不死】対話：支払い待ちが出て、paySources でフィールドのロクケラトプスから払う ===")
scenario({
    name: "fushi-field-chosen",
    mirror: false,
    start: fushiStart(true),
    steps(t) {
        destroyAndConfirm(t, "マッハフライ")
        // 破壊待機のマッハフライのコアはまだ乗っていて、支払いに使える（2026-10-15 ユーザー確認）。コスト2＋置くコア1を ロクケラトプス2＋マッハフライ1 で払う
        const r = drive(t, [{ label: "ロクケラトプス", count: 2 }, { label: "マッハフライ", count: 1 }])
        assert(r.sawCostPay, "【不死】の支払い元を選ぶ待ち（effectCostPay）が出る")
    },
    expect: [...FUSHI_ME],
})

console.log("=== C2. 【不死】非対話：リザーブで足りないぶんはフィールドのコアから自動で補う ===")
scenario({
    name: "fushi-field-auto",
    mirror: false,
    start: fushiStart(false),
    steps(t) {
        destroyAndConfirm(t, "マッハフライ")
    },
    expect: [...FUSHI_ME],
})

console.log("=== D. ミノガメンの無償召喚＋祭壇の余分1をフィールドのロクケラトプスから払う ===")
// 相手がスタチューを召喚（コスト1だが祭壇の青シンボルで軽減0、置くコア1のみ）→召喚時で自分のデッキの上のミノガメンが破棄される→無償召喚（祭壇で余分1）
// 置くコア1個はリザーブ1から。余分1はロクケラトプス 3→2
scenario({
    name: "mino-altar-field",
    mirror: false,
    start: {
        turn: "opp", phase: "main", interactive: true,
        me: { reserve: 1, deck: [MINO, ROKU, ROKU, ROKU, ROKU, ROKU], spirits: [{ card: ROKU, cores: 3 }] },
        opp: { reserve: 10, hand: [STATUE], nexuses: [{ card: ALTAR, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        let sawPay = false
        for (let i = 0; i < 10 && t.state.pendingChoice; i++) {
            const pc = t.state.pendingChoice as any
            const side = pc.pid === t.me ? "me" : "opp"
            if (pc.effectCostPay) {
                sawPay = true
                t.act(side, { type: "resolveChoice", option: pc.options?.[0], paySources: [{ instanceId: t.id("ロクケラトプス"), count: 1 }] })
            } else {
                t.act(side, { type: "resolveChoice", option: pc.options?.[0] })
            }
        }
        assert(sawPay, "「召喚する」のあとに余分の支払い待ち（effectCostPay）が出る")
    },
    expect: [
        "相手.手札: ストン・スタチュー → なし",
        ...["場所: なし → フィールド", "疲労: なし → false", "コア: なし → 1", "Lv: なし → 1", "BP: なし → 2000"].map(s => `相手.ストン・スタチュー.${s}`),
        "相手.リザーブ: 10 → 9",
        "自分.デッキ枚数: 6 → 5",
        ...["場所: なし → フィールド", "疲労: なし → false", "コア: なし → 1", "Lv: なし → 1", "BP: なし → 1000"].map(s => `自分.ミノガメン.${s}`),
        "自分.ロクケラトプス.コア: 3 → 2",
        "自分.ロクケラトプス.Lv: 3 → 2",
        "自分.ロクケラトプス.BP: 4000 → 3000",
        "自分.リザーブ: 1 → 0",
        "自分.トラッシュのコア: 0 → 1",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part596）")
