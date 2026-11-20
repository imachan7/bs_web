// smoke パート1015（#631 KA12・KF：配布カードの既存の器で書ける節。docs/design/IMPORT_631_PLAN.md §3）
// 期待値役：効果文だけから書いた。staging のカードは data に入るまで節ごと（未実装）で飛ばす
import { assert, effectiveBp } from "./helpers"
import { born, check, fix, magicOut, nm, resolveAll, summonOut, VAN } from "./lib631"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const TODOL = "BS17-030" // トドール（白・コスト3・Lv1 BP1000／Lv2(コア3) 6000・バニラ）
const ILUR = "BS16-053" // イルルヤンカッシュ（青・コスト6・Lv1 BP5000／Lv2(コア4) 9000）
const RAIL = "BS17-033" // レールガンフィッシュ（白・コスト5・Lv1 BP3000）
const COFFIN = "BS01-131" // ダークコフィン（紫マジック・コスト7・メイン：疲労状態のスピリット1体を破壊）

console.log("=== 前提: カードの機械確認 ===")
fix(TODOL, "トドール", "spirit", 3)
fix(ILUR, "イルルヤンカッシュ", "spirit", 6)
fix(RAIL, "レールガンフィッシュ", "spirit", 5)
fix(COFFIN, "ダークコフィン", "magic", 7)
fix(VAN, "ロクケラトプス", "spirit", 1)
const KA = "KA12-01"
const KF01 = "KF-01"
const KF03 = "KF-03"
const KF04 = "KF-04"
const KF05 = "KF-05"
const KF06 = "KF-06"
const KF09 = "KF-09"
const KF10 = "KF-10"
const KF11 = "KF-11"
const KF12 = "KF-12"
const KF13 = "KF-13"
const okKA = check(KA, "カンネイド・エース", "spirit", 4)
const ok01 = check(KF01, "カーネル・ドラゴン", "spirit", 6)
const ok03 = check(KF03, "カーネル・ゴレム", "spirit", 5)
const ok04 = check(KF04, "チキンフィレサンドナイト", "spirit", 4)
const ok05 = check(KF05, "コールス・トータス", "spirit", 2)
const ok06 = check(KF06, "フライド・フェニックス", "spirit", 6)
const ok09 = check(KF09, "ピヨケット", "spirit", 2)
const ok10 = check(KF10, "武者ムシャ・チキンカツサンダース", "spirit", 3)
const ok11 = check(KF11, "クリスピー・コブラ", "spirit", 4)
const ok12 = check(KF12, "ポテトアロー", "magic", 5)
const ok13 = check(KF13, "鶏肉の覇王ジーク・ケンタ・フリード", "spirit", 8)

// 自分のアタックを宣言してフラッシュを閉じ、ブロックか takeLife を待つ状態まで進める
const attackTo = (t: ScenarioCtx, label: string): void => {
    t.act("me", { type: "attack", instanceId: t.id(label) })
    resolveAll(t)
    t.closeFlash()
}

// ==== KA12-01 カンネイド・エース ====
if (okKA) {
    console.log("=== KA12-01 Lv1-2【暴風：1】：ブロックされたとき、相手は自分のスピリット1体を疲労させる ===")
    const board = (extraOpp: { card: string; label: string }[]) => ({
        phase: "attack" as const, interactive: true,
        me: { spirits: [{ card: KA, label: "K" }] },
        opp: { spirits: [{ card: VAN, label: "B" }, ...extraOpp] },
    })
    scenario({
        name: "KA12-01-ブロックされると、相手が選んだ相手のスピリット1体だけが疲労する",
        start: board([{ card: VAN, label: "Z" }, { card: VAN, label: "W" }]),
        steps(t) {
            attackTo(t, "K")
            t.act("opp", { type: "block", instanceId: t.id("B") })
            resolveAll(t, ["Z"])
        },
        expect: ["自分.K.疲労: false → true", "相手.B.疲労: false → true", "相手.Z.疲労: false → true"],
    })
    scenario({
        name: "KA12-01-ブロックされなければ疲労させない（ライフを減らす）",
        start: board([{ card: VAN, label: "Z" }]),
        steps(t) {
            attackTo(t, "K")
            t.act("opp", { type: "takeLife" })
            resolveAll(t)
        },
        expect: ["自分.K.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
}

// ==== KF-01 カーネル・ドラゴン ====
if (ok01) {
    console.log("=== KF-01 Lv1-3 アタック時BP+3000／Lv2-3【激突】アタック時：相手は可能ならば必ずブロックする ===")
    scenario({
        name: "KF-01-Lv1のアタック時にBP+3000され、激突は無いのでブロックせずライフで受けられる",
        start: { phase: "attack", me: { spirits: [{ card: KF01, label: "K" }] }, opp: { spirits: [{ card: VAN, label: "U" }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("K") })
            assert(effectiveBp(t.state, t.me, t.inst("K")) === 7000, "Lv1のアタック宣言時にBP4000→7000になる")
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.K.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "KF-01-Lv2のアタック時にBP+3000され、相手はブロックできるなら必ずブロックする",
        start: { phase: "attack", me: { spirits: [{ card: KF01, label: "K", cores: 3 }] }, opp: { spirits: [{ card: VAN, label: "U" }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("K") })
            t.closeFlash()
            t.actRejected("opp", { type: "takeLife" })
        },
        expect: ["自分.K.疲労: false → true", "自分.K.BP: 6000 → 9000"],
    })
    scenario({
        name: "KF-01-Lv2でも相手にブロックできるスピリットがいなければライフで受ける",
        start: { phase: "attack", me: { spirits: [{ card: KF01, label: "K", cores: 3 }] }, opp: { spirits: [{ card: VAN, label: "U", rested: true }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("K") })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.K.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
}
// ==== KF-03 カーネル・ゴレム ====
if (ok03) {
    console.log("=== KF-03 Lv2 アタック時：コスト4以下の相手のスピリット1体を破壊する ===")
    const board = (cores: number) => ({
        phase: "attack" as const, interactive: true,
        me: { spirits: [{ card: KF03, label: "K", cores }] },
        opp: { spirits: [{ card: VAN, label: "U" }, { card: RAIL, label: "Y" }] },
    })
    scenario({
        name: "KF-03-Lv2のアタック時、コスト4以下の相手のスピリットを破壊する（コスト5は対象外）",
        start: board(4),
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("K") })
            resolveAll(t, ["U"])
        },
        expect: ["自分.K.疲労: false → true", "相手.U.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "KF-03-Lv1のアタック時は破壊しない",
        start: board(1),
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("K") })
            resolveAll(t, ["U"])
        },
        expect: ["自分.K.疲労: false → true"],
    })
}

// ==== KF-04 チキンフィレサンドナイト ====
if (ok04) {
    console.log("=== KF-04 Lv1-3 召喚時：相手のスピリットのコア1個を相手のリザーブに置く ===")
    const opp = { spirits: [{ card: VAN, label: "U", cores: 2 }] }
    const lines = [
        ...summonOut("自分", "チキンフィレサンドナイト", 4, 1000), "相手.U.コア: 2 → 1", "相手.U.Lv: 2 → 1", "相手.U.BP: 3000 → 1000", "相手.リザーブ: 10 → 11",
    ]
    scenario({
        name: "KF-04-召喚時、相手のスピリットのコア1個が相手のリザーブへ移る",
        start: { me: { hand: [KF04] }, opp },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            resolveAll(t)
        },
        expect: lines,
    })
    scenario({
        name: "KF-04-ソウルコアがリザーブにあっても同じ（ソウルコアは動かない）",
        start: { me: { hand: [KF04], soulCore: "リザーブ" }, opp },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            resolveAll(t)
        },
        expect: lines,
    })
}

// ==== KF-05 コールス・トータス ====
if (ok05) {
    console.log("=== KF-05 Lv2 ブロック時：このスピリットをBP+3000する ===")
    const run = (cores: number) => ({
        start: { turn: "opp" as const, phase: "attack" as const, me: { spirits: [{ card: KF05, label: "K", cores }] }, opp: { spirits: [{ card: VAN, label: "O" }] } },
        steps(t: ScenarioCtx) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id("K") })
        },
    })
    scenario({ name: "KF-05-Lv2でブロックするとBP+3000される", ...run(2), expect: ["相手.O.疲労: false → true", "自分.K.疲労: false → true", "自分.K.BP: 3000 → 6000"] })
    scenario({ name: "KF-05-Lv1でブロックしてもBPは変わらない", ...run(1), expect: ["相手.O.疲労: false → true", "自分.K.疲労: false → true"] })
}

// ==== KF-06 フライド・フェニックス ====
if (ok06) {
    console.log("=== KF-06 Lv1-2 アタック時：BPを比べ相手のスピリットだけを破壊したとき、このスピリットは回復する ===")
    const board = (uCores: number) => ({
        phase: "attack" as const,
        me: { spirits: [{ card: KF06, label: "F" }] },
        opp: { spirits: [{ card: VAN, label: "U", cores: uCores }] },
    })
    const fight = (t: ScenarioCtx): void => {
        attackTo(t, "F")
        t.act("opp", { type: "block", instanceId: t.id("U") })
        t.closeFlash()
    }
    scenario({
        name: "KF-06-相手のブロッカーだけを破壊すると回復する（疲労の変化が残らない）",
        start: board(1),
        steps: fight,
        expect: ["相手.U.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "KF-06-相打ち（自分も破壊される）なら回復しない",
        start: board(3),
        steps: fight,
        expect: [
            "相手.U.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 13",
            "自分.F.場所: フィールド → なし", "自分.トラッシュ: なし → フライド・フェニックス", "自分.リザーブ: 10 → 11",
        ],
    })
    scenario({
        name: "KF-06-ブロックされなければ回復しない",
        start: board(1),
        steps(t) {
            attackTo(t, "F")
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.F.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
}

// ==== KF-09 ピヨケット ====
if (ok09) {
    console.log("=== KF-09 Lv2-3 破壊時：自分のスピリット1体を回復させる ===")
    const board = (cores: number) => ({
        turn: "opp" as const,
        me: { spirits: [{ card: KF09, label: "K", cores, rested: true }, { card: VAN, label: "A", rested: true }] },
        opp: { hand: [COFFIN] },
    })
    const kill = (t: ScenarioCtx): void => t.act("opp", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: t.id("K") })
    const gone = (reserve: number) => ["自分.K.場所: フィールド → なし", "自分.トラッシュ: なし → ピヨケット", `自分.リザーブ: 10 → ${reserve}`]
    scenario({
        name: "KF-09-Lv2で破壊されると、自分のスピリット1体が回復する",
        start: board(2),
        steps: kill,
        expect: [...magicOut("相手", "ダークコフィン", 7), ...gone(12), "自分.A.疲労: true → false"],
    })
    scenario({
        name: "KF-09-Lv1で破壊されても回復しない",
        start: board(1),
        steps: kill,
        expect: [...magicOut("相手", "ダークコフィン", 7), ...gone(11)],
    })
}

// ==== KF-10 武者ムシャ・チキンカツサンダース ====
if (ok10) {
    console.log("=== KF-10 Lv1-2 召喚時：ボイドからコア1個を自分のリザーブに置く ===")
    const lines = [...summonOut("自分", "武者ムシャ・チキンカツサンダース", 3, 2000).filter((l) => !l.startsWith("自分.リザーブ")), "自分.リザーブ: 10 → 7"]
    scenario({ name: "KF-10-召喚時、ボイドからコア1個がリザーブに置かれる", start: { me: { hand: [KF10] } }, steps: (t) => t.act("me", { type: "summon", handIndex: 0 }), expect: lines })
    scenario({
        name: "KF-10-ソウルコアがリザーブにあってもソウルコアは動かず、通常のコアが置かれる",
        start: { me: { hand: [KF10], soulCore: "リザーブ" } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: lines,
    })
}

// ==== KF-11 クリスピー・コブラ ====
if (ok11) {
    console.log("=== KF-11 Lv1-2 召喚時：自分はデッキから1枚ドローする ===")
    scenario({
        name: "KF-11-召喚時に1枚ドローする",
        start: { me: { hand: [KF11] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: [...summonOut("自分", "クリスピー・コブラ", 4, 3000).filter((l) => !l.startsWith("自分.手札")), "自分.手札: クリスピー・コブラ → ロクケラトプス", "自分.デッキ枚数: 40 → 39"],
    })
}

// ==== KF-12 ポテトアロー ====
if (ok12) {
    console.log("=== KF-12 メイン：BP4000以下のスピリットすべてを破壊する／フラッシュ：このターンの間、スピリット1体をBP+4000 ===")
    const board = {
        me: { hand: [KF12], spirits: [{ card: TODOL, label: "A" }, { card: ILUR, label: "B" }] },
        opp: { spirits: [{ card: VAN, label: "U" }, { card: VAN, label: "T", cores: 3 }, { card: ILUR, label: "V" }] },
    }
    scenario({
        name: "KF-12-メインでBP4000以下（4000ちょうどを含む）のスピリットが両陣営からすべて破壊される",
        start: board,
        steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "main" }),
        expect: [
            "自分.手札: ポテトアロー → なし", `自分.トラッシュ: なし → ${nm("ポテトアロー", "トドール")}`, "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 5",
            "自分.A.場所: フィールド → なし",
            "相手.U.場所: フィールド → なし", "相手.T.場所: フィールド → なし", "相手.トラッシュ: なし → " + nm("ロクケラトプス", "ロクケラトプス"), "相手.リザーブ: 10 → 14",
        ],
    })
    scenario({
        name: "KF-12-フラッシュは相手のスピリットにもBP+4000できる",
        start: board,
        steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("U") }),
        expect: [...magicOut("自分", "ポテトアロー", 5), "相手.U.BP: 1000 → 5000"],
    })
}

// ==== KF-13 鶏肉の覇王ジーク・ケンタ・フリード ====
if (ok13) {
    console.log("=== KF-13 バースト（ライフ減少後）：ライフ3以下のとき BP10000以下の相手1体を破壊。この効果発揮後このスピリットカードを召喚 ===")
    const burstBoard = (life: number) => ({
        turn: "opp" as const, phase: "attack" as const, interactive: true,
        me: { life, burst: KF13 },
        opp: { spirits: [{ card: VAN, label: "O" }, { card: ILUR, label: "X" }] },
    })
    const run = (t: ScenarioCtx): void => {
        t.act("opp", { type: "attack", instanceId: t.id("O") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        resolveAll(t, ["X"])
    }
    scenario({
        name: "KF-13-ライフが3になるとバーストで相手を破壊し、このスピリットが召喚される",
        start: burstBoard(4),
        steps: run,
        expect: [
            "相手.O.疲労: false → true", "自分.ライフ: 4 → 3", "自分.バースト: 鶏肉の覇王ジーク・ケンタ・フリード → なし",
            "相手.X.場所: フィールド → なし", "相手.トラッシュ: なし → イルルヤンカッシュ", "相手.リザーブ: 10 → 11", ...born("自分", "鶏肉の覇王ジーク・ケンタ・フリード", 6000),
        ],
    })
    scenario({
        name: "KF-13-ライフが4のままなら破壊も召喚も起きない（バーストのカードはトラッシュへ）",
        start: burstBoard(5),
        steps: run,
        expect: ["相手.O.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", "自分.バースト: 鶏肉の覇王ジーク・ケンタ・フリード → なし", "自分.トラッシュ: なし → 鶏肉の覇王ジーク・ケンタ・フリード"],
    })
    if (ok01) {
        console.log("=== KF-13 Lv2-4 アタック時：名前に「カーネル」の自分のスピリットがいるとき、このスピリットのBP以下の相手1体を破壊 ===")
        const atk = (withKernel: boolean) => ({
            phase: "attack" as const, interactive: true,
            me: { spirits: [{ card: KF13, label: "K", cores: 3 }, ...(withKernel ? [{ card: KF01, label: "C" }] : [])] },
            opp: { spirits: [{ card: ILUR, label: "X" }, { card: ILUR, label: "Y", cores: 4 }] },
        })
        scenario({
            name: "KF-13-カーネルがいると、このスピリットのBP（8000）以下の相手のスピリットを破壊する（9000は対象外）",
            start: atk(true),
            steps(t) {
                t.act("me", { type: "attack", instanceId: t.id("K") })
                resolveAll(t, ["X"])
            },
            expect: ["自分.K.疲労: false → true", "相手.X.場所: フィールド → なし", "相手.トラッシュ: なし → イルルヤンカッシュ", "相手.リザーブ: 10 → 11"],
        })
        scenario({
            name: "KF-13-カーネルがいなければ破壊しない",
            start: atk(false),
            steps(t) {
                t.act("me", { type: "attack", instanceId: t.id("K") })
                resolveAll(t, ["X"])
            },
            expect: ["自分.K.疲労: false → true"],
        })
    }
}

console.log("すべてのチェックに合格しました 🎉（part1015）")
