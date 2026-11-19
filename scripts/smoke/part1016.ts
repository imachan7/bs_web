// smoke パート1016（#631 LM13・PB12・PB13・X：既存の器で書ける節。docs/design/IMPORT_631_PLAN.md §3）
// 期待値役：効果文だけから書いた。staging のカードは data に入るまで節ごと（未実装）で飛ばす
// 書いていない節：LM13-01・LM13-03（強化・合体時のみ）、KF-08（合体時）、PB13-02 の召喚時（好きなだけ破壊の選択手順）・フラッシュ、色扱い（PB13-04・X019・X020）
import { act, assert, currentLevel, effectiveBp } from "./helpers"
import { born, check, fix, magicOut, resolveAll, summonOut, VAN } from "./lib631"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const TODOL = "BS17-030" // トドール（白・コスト3・機獣・Lv1 BP1000／Lv2(コア3) 6000・バニラ）
const ILUR = "BS16-053" // イルルヤンカッシュ（青・コスト6・Lv1 BP5000）
const RIO = "BS17-040" // 呪術士リオ（黄・コスト3・Lv1 BP2000・バニラ）
const MARIEL = "BS23-040" // 人形遣いの天使マリエル（黄・天霊・コスト3・バニラ）
const CLEDONE = "BS21-002" // ウォルフドラゴン（赤・コスト2・星魂・Lv1 BP2000／Lv2(コア2) 4000）
const GEMINI = "BS11-X05" // 魔導双神ジェミナイズ（黄・コスト7・光導・Lv1 BP5000／Lv2(コア2)／Lv3(コア3)）
const AQUA = "BS11-X04" // 宝瓶神機アクア・エリシオン（白・コスト7・光導・Lv1 BP6000）
const HERO = "SD06-007" // 英雄龍ロード・ドラゴン（赤・コスト6・覇皇・Lv1 BP4000）
const NOVA = "BS09-X35" // 超神星龍ジークヴルム・ノヴァ（赤・コスト8・Lv1 BP7000）
const BAL = "BS01-097" // 飛龍ヴァルキュリウス（白・コスト8）
const COFFIN = "BS01-131" // ダークコフィン（紫マジック・コスト7・メイン：疲労状態のスピリット1体を破壊）

console.log("=== 前提: カードの機械確認 ===")
fix(TODOL, "トドール", "spirit", 3)
fix(ILUR, "イルルヤンカッシュ", "spirit", 6)
fix(RIO, "呪術士リオ", "spirit", 3)
fix(MARIEL, "人形遣いの天使マリエル", "spirit", 3)
fix(CLEDONE, "ウォルフドラゴン", "spirit", 2)
fix(GEMINI, "魔導双神ジェミナイズ", "spirit", 7)
fix(AQUA, "宝瓶神機アクア・エリシオン", "spirit", 7)
fix(HERO, "英雄龍ロード・ドラゴン", "spirit", 6)
fix(NOVA, "超神星龍ジークヴルム・ノヴァ", "spirit", 8)
fix(BAL, "飛龍ヴァルキュリウス", "spirit", 8)
fix(COFFIN, "ダークコフィン", "magic", 7)
const LM2 = "LM13-02"
const PB1 = "PB12-01"
const PB2 = "PB12-02"
const PB32 = "PB13-02"
const PB33 = "PB13-03"
const PB34 = "PB13-04"
const X17 = "X017"
const X19 = "X019"
const X20 = "X020"
const okLM2 = check(LM2, "疾風の妖刀ウスバ・ハヤテ", "brave", 6)
const okPB1 = check(PB1, "ブタデビルサイボーグ", "spirit", 3)
const okPB2 = check(PB2, "ドリルの貴公子ラインハルト", "spirit", 6)
const okPB32 = check(PB32, "光翼の騎神ペガシオーネ・カスタム", "spirit", 8)
const okPB33 = check(PB33, "天使のたまご ほちゃー", "spirit", 7)
const okPB34 = check(PB34, "星の巫女クシナ", "spirit", 5)
const ok17 = check(X17, "アルティメットヒーローインパクト", "magic", 5)
const ok19 = check(X19, "交渉人ミクス", "spirit", 3)
const ok20 = check(X20, "星文学者リリア", "spirit", 6)

const bpOf = (t: ScenarioCtx, label: string): number => effectiveBp(t.state, t.me, t.inst(label))
const coffinOn = (label: string) => (t: ScenarioCtx): void => t.act("opp", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: t.id(label) })

// ==== LM13-02 疾風の妖刀ウスバ・ハヤテ ====
if (okLM2) {
    console.log("=== LM13-02 Lv1 召喚時：相手のスピリット1体を疲労させる ===")
    scenario({
        name: "LM13-02-召喚時、相手のスピリット1体が疲労する（選ばれなかった方は疲労しない）",
        start: { interactive: true, me: { hand: [LM2] }, opp: { spirits: [{ card: VAN, label: "U" }, { card: VAN, label: "V" }] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            resolveAll(t, ["U"])
        },
        expect: [...summonOut("自分", "疾風の妖刀ウスバ・ハヤテ", 6, 3000), "相手.U.疲労: false → true"],
    })
}

// ==== PB12-01 ブタデビルサイボーグ ====
if (okPB1) {
    console.log("=== PB12-01 Lv1-2『相手のターン』：系統「機獣」の自分のスピリットすべてをBP+2000 ===")
    const board = (turn: "me" | "opp", cores = 1) => ({
        turn, phase: "main" as const,
        me: { spirits: [{ card: PB1, label: "P", cores }, { card: TODOL, label: "T" }, { card: VAN, label: "R" }] },
        opp: { spirits: [{ card: TODOL, label: "OT" }] },
    })
    scenario({
        name: "PB12-01-相手のターンは、機獣の自分のスピリット（自身を含む）だけBP+2000される",
        start: board("opp"),
        steps(t) {
            assert(bpOf(t, "P") === 5000 && bpOf(t, "T") === 3000, "機獣のPB12-01とトドールがBP+2000")
            assert(bpOf(t, "R") === 1000, "機獣でないロクケラトプスは変わらない")
            assert(effectiveBp(t.state, t.opp, t.inst("OT")) === 1000, "相手の機獣は自分のスピリットではないので変わらない")
        },
        expect: [],
    })
    scenario({
        name: "PB12-01-自分のターンはBPが上がらない",
        start: board("me"),
        steps(t) {
            assert(bpOf(t, "P") === 3000 && bpOf(t, "T") === 1000, "BP+2000されない")
        },
        expect: [],
    })
    scenario({
        name: "PB12-01-Lv2でも相手のターンにBP+2000される",
        start: board("opp", 2),
        steps(t) {
            assert(bpOf(t, "P") === 8000, "Lv2（BP6000）+2000")
        },
        expect: [],
    })
}

// ==== PB12-02 ドリルの貴公子ラインハルト ====
if (okPB2) {
    console.log("=== PB12-02 Lv1-3 召喚時：このスピリットを疲労させることで、コスト8以上の相手のスピリットすべてを疲労させる ===")
    const hand = { me: { hand: [PB2] }, interactive: true }
    const summoned = summonOut("自分", "ドリルの貴公子ラインハルト", 6, 5000)
    scenario({
        name: "PB12-02-疲労させて、コスト8以上の相手のスピリットすべてを疲労させる（コスト3は対象外）",
        start: { ...hand, opp: { spirits: [{ card: BAL, label: "C" }, { card: BAL, label: "D" }, { card: TODOL, label: "E" }] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            resolveAll(t)
        },
        expect: [...summoned.map((l) => (l === "自分.ドリルの貴公子ラインハルト.疲労: なし → false" ? "自分.ドリルの貴公子ラインハルト.疲労: なし → true" : l)), "相手.C.疲労: false → true", "相手.D.疲労: false → true"],
    })
    scenario({
        name: "PB12-02-疲労させないことを選ぶと、誰も疲労しない",
        start: { ...hand, opp: { spirits: [{ card: BAL, label: "C" }] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            resolveAll(t, [], false)
        },
        expect: summoned,
    })
    scenario({
        name: "PB12-02-コスト8以上の相手のスピリットがいなければ、疲労させる必要がなく何も起きない",
        start: { ...hand, opp: { spirits: [{ card: TODOL, label: "E" }] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            resolveAll(t)
        },
        expect: summoned,
    })
}

// ==== PB13-02 ペガシオーネ・カスタム（Lv2-3 疲労状態でブロックできる） ====
if (okPB32) {
    console.log("=== PB13-02 Lv2-3『相手のアタックステップ』：このスピリットは疲労状態でブロックできる ===")
    const board = (cores: number) => ({
        turn: "opp" as const, phase: "attack" as const,
        me: { spirits: [{ card: PB32, label: "P", cores, rested: true }] },
        opp: { spirits: [{ card: VAN, label: "O" }] },
    })
    scenario({
        name: "PB13-02-Lv2は疲労状態でも相手のアタックをブロックできる",
        start: board(3),
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id("P") })
        },
        expect: ["相手.O.疲労: false → true"],
    })
    scenario({
        name: "PB13-02-Lv1は疲労状態ではブロックできない",
        start: board(1),
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.closeFlash()
            t.actRejected("me", { type: "block", instanceId: t.id("P") })
        },
        expect: ["相手.O.疲労: false → true"],
    })
}

// ==== PB13-03 天使のたまご ほちゃー ====
if (okPB33) {
    console.log("=== PB13-03 バースト：自分の黄のスピリットすべてを回復、その後このスピリットカードを召喚 ===")
    scenario({
        name: "PB13-03-ライフ減少後、自分の黄のスピリットすべてを回復して召喚する（黄でないスピリットは回復しない）",
        start: {
            turn: "opp", phase: "attack", interactive: true,
            me: { burst: PB33, spirits: [{ card: RIO, label: "Y", rested: true }, { card: VAN, label: "R", rested: true }] },
            opp: { spirits: [{ card: VAN, label: "O" }] },
        },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.closeFlash()
            t.act("me", { type: "takeLife" })
            resolveAll(t)
        },
        expect: ["相手.O.疲労: false → true", "自分.ライフ: 5 → 4", "自分.バースト: 天使のたまご ほちゃー → なし", "自分.Y.疲労: true → false", ...born("自分", "天使のたまご ほちゃー", 4000)],
    })
    console.log("=== PB13-03 Lv2-3 バトル時：このターンの間、相手のスピリット1体をBP-3000 ===")
    scenario({
        name: "PB13-03-Lv2でブロックしてバトルになると、相手のスピリット1体がBP-3000される",
        start: {
            turn: "opp", phase: "attack", interactive: true,
            me: { spirits: [{ card: PB33, label: "P", cores: 3 }] },
            opp: { spirits: [{ card: VAN, label: "O" }, { card: ILUR, label: "X" }] },
        },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id("P") })
            resolveAll(t, ["X"])
        },
        expect: ["相手.O.疲労: false → true", "自分.P.疲労: false → true", "相手.X.BP: 5000 → 2000"],
    })
    console.log("=== PB13-03 Lv2-3：相手に破壊されたとき、系統「天霊」の自分の1体を疲労させることで回復状態で残る ===")
    const board = (withTenrei: boolean) => ({
        turn: "opp" as const, interactive: true,
        me: { spirits: [{ card: PB33, label: "P", cores: 3, rested: true }, ...(withTenrei ? [{ card: MARIEL, label: "T" }] : [])] },
        opp: { hand: [COFFIN] },
    })
    scenario({
        name: "PB13-03-天霊の自分のスピリットを疲労させて、回復状態で場に残る",
        start: board(true),
        steps(t) {
            coffinOn("P")(t)
            resolveAll(t)
        },
        expect: [...magicOut("相手", "ダークコフィン", 7), "自分.P.疲労: true → false", "自分.T.疲労: false → true"],
    })
    scenario({
        name: "PB13-03-疲労させる天霊のスピリットがいなければ破壊される",
        start: board(false),
        steps(t) {
            coffinOn("P")(t)
            resolveAll(t)
        },
        expect: [...magicOut("相手", "ダークコフィン", 7), "自分.P.場所: フィールド → なし", "自分.トラッシュ: なし → 天使のたまご ほちゃー", "自分.リザーブ: 10 → 13"],
    })
}

// ==== PB13-04 星の巫女クシナ ====
if (okPB34) {
    console.log("=== PB13-04 フラッシュ：このスピリットを破壊することで、手札の[超神星龍ジークヴルム・ノヴァ]1枚を無償召喚 ===")
    const board = (hand: string[]) => ({
        turn: "opp" as const, phase: "attack" as const, interactive: true,
        me: { hand, spirits: [{ card: PB34, label: "K" }] },
        opp: { spirits: [{ card: VAN, label: "O" }] },
    })
    scenario({
        name: "PB13-04-自身を破壊して、手札のジークヴルム・ノヴァを無償召喚する",
        start: board([NOVA]),
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.closeFlash()
            t.act("me", { type: "activateAbility", instanceId: t.id("K"), effectId: "PB13-04-e1" })
            resolveAll(t)
        },
        expect: ["相手.O.疲労: false → true", "自分.K.場所: フィールド → なし", "自分.トラッシュ: なし → 星の巫女クシナ", "自分.手札: 超神星龍ジークヴルム・ノヴァ → なし", ...born("自分", "超神星龍ジークヴルム・ノヴァ", 7000)],
    })
    scenario({
        name: "PB13-04-手札にノヴァがいなければ、自身を破壊しない（破壊することで召喚できないので発揮されない）",
        start: board([VAN]),
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.closeFlash()
            act(t.state, t.me, { type: "activateAbility", instanceId: t.id("K"), effectId: "PB13-04-e1" })
            resolveAll(t, [], false)
        },
        expect: ["相手.O.疲労: false → true"],
    })
}

// ==== X017 アルティメットヒーローインパクト ====
if (ok17) {
    console.log("=== X017 メイン：系統「覇皇」の相手のスピリット1体を破壊。破壊したとき1枚ドロー／フラッシュ：覇皇の自分のスピリット1体BP+5000 ===")
    scenario({
        name: "X017-覇皇の相手のスピリットを破壊したとき、1枚ドローする",
        start: { me: { hand: [X17] }, opp: { spirits: [{ card: HERO, label: "H" }, { card: VAN, label: "U" }] } },
        steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: t.id("H") }),
        expect: [
            ...magicOut("自分", "アルティメットヒーローインパクト", 5).filter((l) => !l.startsWith("自分.手札")), "自分.手札: アルティメットヒーローインパクト → ロクケラトプス", "自分.デッキ枚数: 40 → 39",
            "相手.H.場所: フィールド → なし", "相手.トラッシュ: なし → 英雄龍ロード・ドラゴン", "相手.リザーブ: 10 → 11",
        ],
    })
    scenario({
        name: "X017-覇皇でない相手のスピリットは対象にできない",
        start: { me: { hand: [X17] }, opp: { spirits: [{ card: HERO, label: "H" }, { card: VAN, label: "U" }] } },
        steps: (t) => t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: t.id("U") }),
        expect: [],
    })
    scenario({
        name: "X017-フラッシュで覇皇の自分のスピリット1体がBP+5000される",
        start: { me: { hand: [X17], spirits: [{ card: HERO, label: "H" }, { card: VAN, label: "R" }] } },
        steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("H") }),
        expect: [...magicOut("自分", "アルティメットヒーローインパクト", 5), "自分.H.BP: 4000 → 9000"],
    })
    scenario({
        name: "X017-フラッシュは覇皇でない自分のスピリットを対象にできない",
        start: { me: { hand: [X17], spirits: [{ card: HERO, label: "H" }, { card: VAN, label: "R" }] } },
        steps: (t) => t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("R") }),
        expect: [],
    })
}

// ==== X019 交渉人ミクス ====
if (ok19) {
    console.log("=== X019 Lv1-2『自分のアタックステップ』：系統「神星」/「光導」/「星魂」の自分のスピリットすべてBP+1000 ===")
    const board = (phase: "main" | "attack") => ({
        phase,
        me: { spirits: [{ card: X19, label: "X" }, { card: CLEDONE, label: "S" }, { card: AQUA, label: "L" }, { card: VAN, label: "R" }] },
        opp: { spirits: [{ card: CLEDONE, label: "OS" }] },
    })
    scenario({
        name: "X019-自分のアタックステップ中、星魂・光導の自分のスピリットがBP+1000される（それ以外と相手は変わらない）",
        start: board("attack"),
        steps(t) {
            assert(bpOf(t, "S") === 3000 && bpOf(t, "L") === 7000, "星魂・光導は+1000")
            assert(bpOf(t, "R") === 1000 && bpOf(t, "X") === 2000, "その他の系統は変わらない")
            assert(effectiveBp(t.state, t.opp, t.inst("OS")) === 2000, "相手の星魂は変わらない")
        },
        expect: [],
    })
    scenario({
        name: "X019-メインステップ中はBPが上がらない",
        start: board("main"),
        steps(t) {
            assert(bpOf(t, "S") === 2000 && bpOf(t, "L") === 6000, "メインステップは+1000されない")
        },
        expect: [],
    })
    console.log("=== X019 Lv2：このスピリットと自分の[星文学者リリア]すべては、相手によって破壊されたとき手札に戻る ===")
    const kill = (cores: number, withLilia: boolean) => ({
        turn: "opp" as const,
        me: { spirits: [{ card: X19, label: "X", cores, rested: true }, ...(withLilia ? [{ card: X20, label: "L", rested: true }] : [])] },
        opp: { hand: [COFFIN] },
    })
    scenario({
        name: "X019-Lv2で相手に破壊されると、手札に戻る",
        start: kill(2, false),
        steps: coffinOn("X"),
        expect: [...magicOut("相手", "ダークコフィン", 7), "自分.X.場所: フィールド → なし", "自分.手札: なし → 交渉人ミクス", "自分.リザーブ: 10 → 12"],
    })
    scenario({
        name: "X019-Lv1では破壊されたらトラッシュへ置かれる",
        start: kill(1, false),
        steps: coffinOn("X"),
        expect: [...magicOut("相手", "ダークコフィン", 7), "自分.X.場所: フィールド → なし", "自分.トラッシュ: なし → 交渉人ミクス", "自分.リザーブ: 10 → 11"],
    })
    if (ok20) {
        scenario({
            name: "X019-Lv2のとき、自分の星文学者リリアも相手に破壊されたら手札に戻る",
            start: kill(2, true),
            steps: coffinOn("L"),
            expect: [...magicOut("相手", "ダークコフィン", 7), "自分.L.場所: フィールド → なし", "自分.手札: なし → 星文学者リリア", "自分.リザーブ: 10 → 11"],
        })
        scenario({
            name: "X019-Lv1のとき、自分の星文学者リリアは破壊されたらトラッシュへ置かれる",
            start: kill(1, true),
            steps: coffinOn("L"),
            expect: [...magicOut("相手", "ダークコフィン", 7), "自分.L.場所: フィールド → なし", "自分.トラッシュ: なし → 星文学者リリア", "自分.リザーブ: 10 → 11"],
        })
    }
}

// ==== X020 星文学者リリア ====
if (ok20) {
    console.log("=== X020 Lv1-2：相手のライフが減ったとき、手札の系統「光導」のスピリット1枚を無償召喚できる ===")
    const board = (hand: string[]) => ({
        phase: "attack" as const, interactive: true,
        me: { hand, spirits: [{ card: X20, label: "L" }, { card: TODOL, label: "A" }] },
    })
    const run = (accept: boolean) => (t: ScenarioCtx): void => {
        t.act("me", { type: "attack", instanceId: t.id("A") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        resolveAll(t, [], accept)
    }
    const life = ["自分.A.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]
    scenario({
        name: "X020-相手のライフが減ったとき、手札の光導のスピリットを無償召喚する",
        start: board([AQUA]),
        steps: run(true),
        expect: [...life, "自分.手札: 宝瓶神機アクア・エリシオン → なし", "自分.リザーブ: 10 → 9", ...born("自分", "宝瓶神機アクア・エリシオン", 6000)],
    })
    scenario({
        name: "X020-召喚できるを断ると、手札に残る",
        start: board([AQUA]),
        steps: run(false),
        expect: life,
    })
    scenario({
        name: "X020-手札に光導のスピリットがいなければ何も起きない",
        start: board([TODOL]),
        steps: run(true),
        expect: life,
    })
    console.log("=== X020 Lv2：自分の[交渉人ミクス]がいる間、系統「光導」/「星魂」の自分のスピリットすべてを最高Lvとして扱う ===")
    const lvBoard = (cores: number, withMix: boolean) => ({
        me: { spirits: [{ card: X20, label: "L", cores }, { card: GEMINI, label: "G" }, { card: CLEDONE, label: "S" }, { card: VAN, label: "R" }, ...(withMix ? [{ card: X19!, label: "M" }] : [])] },
    })
    if (ok19) {
        scenario({
            name: "X020-Lv2でミクスがいると、光導・星魂の自分のスピリットは最高Lvとして扱われる（その他は変わらない）",
            start: lvBoard(4, true),
            steps(t) {
                assert(currentLevel(t.inst("G")).level === 3 && currentLevel(t.inst("S")).level === 2, "光導は最高Lv3、星魂は最高Lv2")
                assert(currentLevel(t.inst("R")).level === 1, "ロクケラトプスは変わらない")
            },
            expect: [],
        })
        scenario({
            name: "X020-Lv2でもミクスがいなければLvは変わらない",
            start: lvBoard(4, false),
            steps(t) {
                assert(currentLevel(t.inst("G")).level === 1, "ミクスがいないので変わらない")
            },
            expect: [],
        })
        scenario({
            name: "X020-Lv1ではミクスがいてもLvは変わらない",
            start: lvBoard(1, true),
            steps(t) {
                assert(currentLevel(t.inst("G")).level === 1, "この効果はLv2のみ")
            },
            expect: [],
        })
    }
}

console.log("すべてのチェックに合格しました 🎉（part1016）")
