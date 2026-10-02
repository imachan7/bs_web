// smoke パート464（「〜することで」の節：BS15-032 / BS14-043 / BS12-043 / BS13-004 / BS15-067）
// 効果文だけから書いた期待値役のテスト。実装に合わせて期待値を変えないこと
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const SNOW = "BS15-032" // スノーフレイクン（白・コスト4・甲竜）
const MARNI = "BS14-043" // 月光姫マーニ（白・コスト7・氷姫）
const CONDRAD = "BS12-043" // 大地の狩人コンドラッド（青・コスト3）
const FOBOS = "BS13-004" // フォボス・ドラグーン（赤・コスト4・星竜）
const TREE = "BS15-067" // 雪の結晶樹（白・ネクサス）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const PYTHON = "BS01-034" // バイ・パイソン（紫・コスト3。アタック時にデッキから1枚ドロー）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・効果なし）
const SHOGORUS = "BS12-059" // ショゴルス（青・ブレイヴ・コスト3・シンボル1・合体条件コスト3以上）
const MARS = "BS10-008" // 火星神龍アレス・ドラグーン（赤・コスト6・神星）
const GATHER = "BS01-136" // ギャザーフォース（緑マジック・コスト3）

console.log("=== 前提: カードの機械確認 ===")
{
    const eq = (id: string, name: string, type: string) => assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}`)
    eq(SNOW, "スノーフレイクン", "spirit")
    eq(MARNI, "月光姫マーニ", "spirit")
    eq(CONDRAD, "大地の狩人コンドラッド", "spirit")
    eq(FOBOS, "フォボス・ドラグーン", "spirit")
    eq(TREE, "雪の結晶樹", "nexus")
    eq(PYTHON, "バイ・パイソン", "spirit")
    eq(METAL, "メタルバーン", "spirit")
    eq(SHOGORUS, "ショゴルス", "brave")
    eq(MARS, "火星神龍アレス・ドラグーン", "spirit")
    eq(GATHER, "ギャザーフォース", "magic")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).effects.length === 0, "VANILLAは効果なし")
    assert(getCard(SNOW).levels.find((l) => l.level === 2)?.cores === 2, "スノーフレイクンはコア2個でLv2")
    assert(getCard(MARNI).levels.find((l) => l.level === 2)?.cores === 2, "マーニはコア2個でLv2")
    assert(getCard(FOBOS).levels.find((l) => l.level === 3)?.cores === 4, "フォボスはコア4個でLv3")
    assert(getCard(METAL).cost === 3 && getCard(MARS).family.includes("神星"), "メタルバーンはコスト3／火星神龍は神星")
}

const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    // 確認の選択肢は「発動する」「無効にする」（氷壁）など。confirm:true の単一選択肢を確認として数える
    return pc !== null && pc.kind === "option" && pc.confirm === true
}

// 確認が出たら answers[i]（既定 true）で答える。確認の回数を返す。確認以外は pick（候補にいれば）か先頭で答える
function drive(t: ScenarioCtx, answers: boolean[] = [], pick?: string): number {
    let confirms = 0
    let guard = 0
    while (t.state.pendingChoice) {
        if (++guard > 20) throw new Error("選択待ちが終わらない")
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(t)) {
            const yes = answers[confirms] ?? true
            confirms++
            t.act(side, yes ? { type: "resolveChoice", option: pc.options![0]! } : { type: "resolveChoice" })
        } else if (pc.kind === "option") {
            t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        } else {
            const want = pick === undefined ? undefined : t.id(pick)
            t.act(side, { type: "resolveChoice", instanceId: want !== undefined && pc.candidates.includes(want) ? want : pc.candidates[0]! })
        }
    }
    return confirms
}

// アタックを宣言し、防御側（ブロックなし）がライフで受けるところまで進める。確認の回数を返す
// blocker を渡すと、ライフで受けずにそのスピリットでブロックする
function attackAndTakeLife(t: ScenarioCtx, attacker: "me" | "opp", who: string, answers: boolean[] = [], pick?: string, blocker?: string): number {
    const defender = attacker === "me" ? "opp" : "me"
    t.act(attacker, { type: "attack", instanceId: t.id(who) })
    let n = drive(t, answers, pick)
    if (t.state.battle) {
        t.closeFlash()
        n += drive(t, answers, pick)
        if (t.state.battle && !t.state.pendingChoice) {
            if (blocker !== undefined) {
                t.act(defender, { type: "block", instanceId: t.id(blocker) })
                n += drive(t, answers, pick)
                t.closeFlash()
            } else t.act(defender, { type: "takeLife" })
        }
        n += drive(t, answers, pick)
    }
    return n
}

// ============================================================
// BS15-032 スノーフレイクン Lv1･Lv2『相手のアタックステップ』ステップ開始時
//   自分のリザーブのコア1個を自分のトラッシュに置くことで、相手のスピリット1体を指定する。
//   そのスピリットは可能ならば必ずアタックする。
// ============================================================
const snowMe = (cores: number, reserve = 10) => ({ reserve, spirits: [{ card: SNOW, cores }] })
const snowOpp = { spirits: [{ card: VANILLA, label: "A" }, { card: VANILLA, label: "B" }] }
const snowOne = { spirits: [{ card: VANILLA, label: "A" }] }

// ライフ1減ると、そのコアがリザーブへ移る（払った1個と相殺されて、リザーブの増減は出ない）
const snowPaid = ["自分.トラッシュのコア: 0 → 1"]
const aHits = ["相手.A.疲労: false → true", "自分.ライフ: 5 → 4"]

console.log("=== S1. 非対話・Lv2：リザーブのコアが1個トラッシュへ。指定された唯一のスピリットは必ずアタックする ===")
scenario({
    name: "snow-pay",
    start: { turn: "opp", me: snowMe(2), opp: snowOne },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        t.actRejected("opp", { type: "endTurn" })
        attackAndTakeLife(t, "opp", "A")
    },
    expect: [...snowPaid, ...aHits],
})

console.log("=== S2. 非対話・Lv1：Lv1でも同じ（「Lv1･Lv2」の節） ===")
scenario({
    name: "snow-pay-lv1",
    start: { turn: "opp", me: snowMe(1), opp: snowOne },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        t.actRejected("opp", { type: "endTurn" })
        attackAndTakeLife(t, "opp", "A")
    },
    expect: [...snowPaid, ...aHits],
})

console.log("=== S3. 非対話・リザーブ0：払えないので何も起きず、指定もされない（Bが先にアタックしてよい） ===")
scenario({
    name: "snow-nopay",
    start: { turn: "opp", me: snowMe(2, 0), opp: snowOpp },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        attackAndTakeLife(t, "opp", "B")
    },
    expect: ["相手.B.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 0 → 1"],
})

console.log("=== S4. 対話：確認1回→押す→自分が相手のスピリットAを指定→Aは必ずアタック ===")
scenario({
    name: "snow-interactive",
    start: { turn: "opp", interactive: true, me: snowMe(2), opp: snowOpp },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        const pc = t.state.pendingChoice
        assert(pc !== null && pc.pid === t.me, "スノーフレイクンの持ち主に確認が出る")
        const n = drive(t, [true], "A")
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
        t.actRejected("opp", { type: "endTurn" })
        attackAndTakeLife(t, "opp", "A")
    },
    expect: [...snowPaid, ...aHits],
})

console.log("=== S5. 対話：確認で断ると払わず、指定もされない ===")
scenario({
    name: "snow-decline",
    start: { turn: "opp", interactive: true, me: snowMe(2), opp: snowOpp },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        const n = drive(t, [false])
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
        attackAndTakeLife(t, "opp", "B")
    },
    expect: ["相手.B.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})

console.log("=== S6. 対話：リザーブ0でも確認は出る。押しても払えず不発（指定の選択待ちは出ない） ===")
scenario({
    name: "snow-interactive-nopay",
    start: { turn: "opp", interactive: true, me: snowMe(2, 0), opp: snowOpp },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        const n = drive(t, [true])
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
        assert(t.state.pendingChoice === null, "不発なので選択待ちは残らない")
        attackAndTakeLife(t, "opp", "B")
    },
    expect: ["相手.B.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 0 → 1"],
})

// ============================================================
// BS14-043 月光姫マーニ Lv2『相手のアタックステップ』ステップ開始時
//   このスピリットを疲労させることで、相手のスピリット1体を指定する。
//   このターンの間、指定されたスピリットの『このスピリットのアタック時』効果すべては発揮されない。
//   （相手のスピリットはバイ・パイソン：アタック時にデッキから1枚ドロー）
// ============================================================
const marniOpp = { spirits: [{ card: PYTHON, label: "P" }] }
const pyHits = ["相手.P.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"]
const pyDraw = ["相手.手札: なし → ロクケラトプス", "相手.デッキ枚数: 40 → 39"]

console.log("=== M1. 非対話：マーニが疲労し、Pのアタック時のドローは発揮されない ===")
scenario({
    name: "marni-pay",
    start: { turn: "opp", me: { spirits: [{ card: MARNI, cores: 2 }] }, opp: marniOpp },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        attackAndTakeLife(t, "opp", "P")
    },
    expect: ["自分.月光姫マーニ.疲労: false → true", ...pyHits],
})

console.log("=== M2. 非対話・マーニがすでに疲労：払えないので指定されず、Pはドローする ===")
scenario({
    name: "marni-rested",
    start: { turn: "opp", me: { spirits: [{ card: MARNI, cores: 2, rested: true }] }, opp: marniOpp },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        attackAndTakeLife(t, "opp", "P")
    },
    expect: [...pyHits, ...pyDraw],
})

console.log("=== M3. 非対話・Lv1（コア1個）：この節はLv2限定なので何も起きず、Pはドローする ===")
scenario({
    name: "marni-lv1",
    start: { turn: "opp", me: { spirits: [{ card: MARNI, cores: 1 }] }, opp: marniOpp },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        attackAndTakeLife(t, "opp", "P")
    },
    expect: [...pyHits, ...pyDraw],
})

console.log("=== M4. 対話：確認1回→押す→マーニが疲労しPのドローは発揮されない ===")
scenario({
    name: "marni-interactive",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: MARNI, cores: 2 }] }, opp: marniOpp },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        const n = drive(t, [true], "P") + attackAndTakeLife(t, "opp", "P", [true], "P")
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: ["自分.月光姫マーニ.疲労: false → true", ...pyHits],
})

console.log("=== M5. 対話：断るとマーニは疲労せず、Pはドローする ===")
scenario({
    name: "marni-decline",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: MARNI, cores: 2 }] }, opp: marniOpp },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        const n = drive(t, [false]) + attackAndTakeLife(t, "opp", "P", [false])
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [...pyHits, ...pyDraw],
})

console.log("=== M6. 対話・マーニがすでに疲労：確認は出るが押しても払えず、Pはドローする ===")
scenario({
    name: "marni-interactive-rested",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: MARNI, cores: 2, rested: true }] }, opp: marniOpp },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        const n = drive(t, [true]) + attackAndTakeLife(t, "opp", "P", [true])
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [...pyHits, ...pyDraw],
})

// ============================================================
// BS12-043 大地の狩人コンドラッド Lv1･Lv2『相手のアタックステップ』ステップ開始時
//   このスピリットを疲労させることで、このターンの間、シンボル2つを持つ合体スピリットのアタックでは、自分のライフは減らない。
//   （相手はメタルバーン＋ショゴルス（シンボル1＋1）を合体させてからアタックステップへ入る）
// ============================================================
const condOpp = { hand: [SHOGORUS], spirits: [{ card: METAL, label: "合体体" }] }
const condMe = (cores: number, rested = false) => ({ spirits: [{ card: CONDRAD, cores, rested }] })
const combine = (t: ScenarioCtx) => t.act("opp", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("合体体") })
const combineLines = [
    "相手.手札: ショゴルス → なし",
    "相手.ショゴルス.場所: なし → 合体",
    "相手.リザーブ: 10 → 7",
    "相手.トラッシュのコア: 0 → 3",
    "相手.ショゴルス.Lv: なし → 1",
    "相手.ショゴルス.コア: なし → 0",
    "相手.ショゴルス.疲労: なし → false",
    "相手.合体体.BP: 3000 → 7000",
]

console.log("=== C1. 非対話・Lv2：コンドラッドが疲労し、2シンボルの合体スピリットのアタックでライフが減らない ===")
scenario({
    name: "cond-pay",
    start: { turn: "opp", me: condMe(3), opp: condOpp },
    steps: (t) => {
        combine(t)
        t.act("opp", { type: "nextPhase" })
        attackAndTakeLife(t, "opp", "合体体")
    },
    expect: [...combineLines, "自分.大地の狩人コンドラッド.疲労: false → true", "相手.合体体.疲労: false → true"],
})

console.log("=== C2. 非対話・Lv1（コア1個）：Lv1でも同じ ===")
scenario({
    name: "cond-pay-lv1",
    start: { turn: "opp", me: condMe(1), opp: condOpp },
    steps: (t) => {
        combine(t)
        t.act("opp", { type: "nextPhase" })
        attackAndTakeLife(t, "opp", "合体体")
    },
    expect: [...combineLines, "自分.大地の狩人コンドラッド.疲労: false → true", "相手.合体体.疲労: false → true"],
})

console.log("=== C3. 非対話・コンドラッドがすでに疲労：払えないので守られず、ライフは2減る ===")
scenario({
    name: "cond-rested",
    start: { turn: "opp", me: condMe(3, true), opp: condOpp },
    steps: (t) => {
        combine(t)
        t.act("opp", { type: "nextPhase" })
        attackAndTakeLife(t, "opp", "合体体")
    },
    expect: [...combineLines, "相手.合体体.疲労: false → true", "自分.ライフ: 5 → 3", "自分.リザーブ: 10 → 12"],
})

console.log("=== C4. 非対話・合体していない（1シンボル）スピリットのアタック：払っても守られず、ライフは1減る ===")
scenario({
    name: "cond-single",
    start: { turn: "opp", me: condMe(3), opp: { spirits: [{ card: METAL, label: "合体体" }] } },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        attackAndTakeLife(t, "opp", "合体体")
    },
    expect: ["自分.大地の狩人コンドラッド.疲労: false → true", "相手.合体体.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})

console.log("=== C5. 対話：確認1回→押す→ライフは減らない ===")
scenario({
    name: "cond-interactive",
    start: { turn: "opp", interactive: true, me: condMe(3), opp: condOpp },
    steps: (t) => {
        combine(t)
        t.act("opp", { type: "nextPhase" })
        const n = drive(t, [true]) + attackAndTakeLife(t, "opp", "合体体", [true])
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [...combineLines, "自分.大地の狩人コンドラッド.疲労: false → true", "相手.合体体.疲労: false → true"],
})

console.log("=== C6. 対話：断るとコンドラッドは疲労せず、ライフは2減る ===")
scenario({
    name: "cond-decline",
    start: { turn: "opp", interactive: true, me: condMe(3), opp: condOpp },
    steps: (t) => {
        combine(t)
        t.act("opp", { type: "nextPhase" })
        const n = drive(t, [false]) + attackAndTakeLife(t, "opp", "合体体", [false])
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [...combineLines, "相手.合体体.疲労: false → true", "自分.ライフ: 5 → 3", "自分.リザーブ: 10 → 12"],
})

// ============================================================
// BS13-004 フォボス・ドラグーン Lv3『このスピリットのアタック時』
//   バトル終了時、このスピリットと自分のコスト3以上のスピリット1体を破壊することで、
//   自分の手札にある系統：「神星」を持つスピリットカード1枚を、コストを支払わずに召喚する。
//   （【激突】で相手のロクケラトプスがブロックし、フォボスが勝つ）
// ============================================================
const fobosMe = (cores: number, ally: string, hand = [MARS]) => ({ hand, spirits: [{ card: FOBOS, cores }, { card: ally, label: "味方", cores: 1 }] })
const fobosOpp = { spirits: [{ card: VANILLA, label: "ブロッカー" }] }
const fobosFight = (t: ScenarioCtx, answers: boolean[] = []) => attackAndTakeLife(t, "me", "フォボス・ドラグーン", answers, undefined, "ブロッカー")
// 破壊された2体のコア5個がリザーブへ戻り、召喚した火星神龍にコア1個が乗る
const marsLines = [
    "自分.リザーブ: 10 → 14",
    "自分.火星神龍アレス・ドラグーン.BP: なし → 4000",
    "自分.火星神龍アレス・ドラグーン.Lv: なし → 1",
    "自分.火星神龍アレス・ドラグーン.コア: なし → 1",
    "自分.火星神龍アレス・ドラグーン.疲労: なし → false",
]
const winOnly = [
    "相手.ブロッカー.場所: フィールド → なし",
    "相手.トラッシュ: なし → ロクケラトプス",
    "相手.リザーブ: 10 → 11",
]

console.log("=== F1. 非対話・Lv3：フォボスと味方（コスト3）が同時に破壊され、火星神龍が召喚される ===")
scenario({
    name: "fobos-pay",
    start: { turn: "me", phase: "attack", me: fobosMe(4, METAL), opp: fobosOpp },
    steps: (t) => {
        fobosFight(t)
        assert(t.state.players[t.me].field.spirits.some((x) => getCard(x.cardId).name === "火星神龍アレス・ドラグーン"), "火星神龍が召喚される")
    },
    expect: [
        ...winOnly,
        "自分.フォボス・ドラグーン.場所: フィールド → なし",
        "自分.味方.場所: フィールド → なし",
        "自分.手札: 火星神龍アレス・ドラグーン → なし",
        "自分.火星神龍アレス・ドラグーン.場所: なし → フィールド",
        "自分.トラッシュ: なし → フォボス・ドラグーン、メタルバーン",
        ...marsLines,
    ],
})

console.log("=== F2. 非対話・味方がコスト1：コストを払えないので何も壊れず、召喚もされない ===")
scenario({
    name: "fobos-cost1",
    start: { turn: "me", phase: "attack", me: fobosMe(4, VANILLA), opp: fobosOpp },
    steps: (t) => {
        fobosFight(t)
    },
    expect: [...winOnly, "自分.フォボス・ドラグーン.疲労: false → true"],
})

console.log("=== F3. 非対話・Lv2（コア3個）：この節はLv3限定なので何も起きない ===")
scenario({
    name: "fobos-lv2",
    start: { turn: "me", phase: "attack", me: fobosMe(3, METAL), opp: fobosOpp },
    steps: (t) => {
        fobosFight(t)
    },
    expect: [...winOnly, "自分.フォボス・ドラグーン.疲労: false → true"],
})

console.log("=== F4. 非対話・手札に神星スピリットがいない：召喚するものがないので破壊もしない ===")
scenario({
    name: "fobos-nohand",
    start: { turn: "me", phase: "attack", me: fobosMe(4, METAL, [VANILLA]), opp: fobosOpp },
    steps: (t) => {
        fobosFight(t)
    },
    expect: [...winOnly, "自分.フォボス・ドラグーン.疲労: false → true"],
})

console.log("=== F5. 対話：確認1回→押す→フォボスと味方が破壊され火星神龍が召喚される ===")
scenario({
    name: "fobos-interactive",
    start: { turn: "me", phase: "attack", interactive: true, me: fobosMe(4, METAL), opp: fobosOpp },
    steps: (t) => {
        const n = fobosFight(t, [true])
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [
        ...winOnly,
        "自分.フォボス・ドラグーン.場所: フィールド → なし",
        "自分.味方.場所: フィールド → なし",
        "自分.手札: 火星神龍アレス・ドラグーン → なし",
        "自分.火星神龍アレス・ドラグーン.場所: なし → フィールド",
        "自分.トラッシュ: なし → フォボス・ドラグーン、メタルバーン",
        ...marsLines,
    ],
})

console.log("=== F6. 対話：断ると何も壊れず召喚もされない ===")
scenario({
    name: "fobos-decline",
    start: { turn: "me", phase: "attack", interactive: true, me: fobosMe(4, METAL), opp: fobosOpp },
    steps: (t) => {
        const n = fobosFight(t, [false])
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [...winOnly, "自分.フォボス・ドラグーン.疲労: false → true"],
})

console.log("=== F7. 対話・味方がコスト1：確認は出るが押しても払えず不発 ===")
scenario({
    name: "fobos-interactive-cost1",
    start: { turn: "me", phase: "attack", interactive: true, me: fobosMe(4, VANILLA), opp: fobosOpp },
    steps: (t) => {
        const n = fobosFight(t, [true])
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [...winOnly, "自分.フォボス・ドラグーン.疲労: false → true"],
})

// ============================================================
// BS15-067 雪の結晶樹 Lv2『相手のターン』
//   自分のスピリットが【氷壁】を使用したとき、このネクサスのコア1個を自分のトラッシュに置くことで、そのスピリットを回復させる。
//   （自分のスノーフレイクン Lv2【氷壁：緑】が、相手の緑マジック ギャザーフォース（コスト3）を無効にする）
// ============================================================
const treeMe = (treeCores: number) => ({ spirits: [{ card: SNOW, cores: 2 }], nexuses: [{ card: TREE, cores: treeCores }] })
const treeOpp = { hand: [GATHER] }
const gatherNegated = [
    "相手.手札: ギャザーフォース → なし",
    "相手.トラッシュ: なし → ギャザーフォース",
    "相手.リザーブ: 10 → 7",
    "相手.トラッシュのコア: 0 → 3",
]
const cast = (t: ScenarioCtx) => t.act("opp", { type: "castMagic", handIndex: 0 })

console.log("=== T1. 非対話：氷壁を使用したスノーフレイクンが回復し（疲労は残らない）、ネクサスのコアが1個トラッシュへ ===")
scenario({
    name: "tree-pay",
    start: { turn: "opp", me: treeMe(2), opp: treeOpp },
    steps: (t) => cast(t),
    expect: [...gatherNegated, "自分.雪の結晶樹.コア: 2 → 1", "自分.トラッシュのコア: 0 → 1"],
})

console.log("=== T2. 非対話・ネクサスのコアが0個（Lv1）：この節はLv2限定。スノーフレイクンは疲労したまま ===")
scenario({
    name: "tree-lv1",
    start: { turn: "opp", me: treeMe(0), opp: treeOpp },
    steps: (t) => cast(t),
    expect: [...gatherNegated, "自分.スノーフレイクン.疲労: false → true"],
})

console.log("=== T3. 非対話・ネクサスのコアが1個：払ってコア0（Lv1）になっても効果は発揮される（Q3576） ===")
scenario({
    name: "tree-last-core",
    start: { turn: "opp", me: treeMe(1), opp: treeOpp },
    steps: (t) => cast(t),
    expect: [...gatherNegated, "自分.雪の結晶樹.コア: 1 → 0", "自分.雪の結晶樹.Lv: 2 → 1", "自分.トラッシュのコア: 0 → 1"],
})

console.log("=== T4. 対話：氷壁の確認とネクサスの確認で計2回。両方押すとスノーフレイクンが回復し、コアが1個トラッシュへ ===")
scenario({
    name: "tree-interactive",
    start: { turn: "opp", interactive: true, me: treeMe(2), opp: treeOpp },
    steps: (t) => {
        cast(t)
        const n = drive(t, [true, true])
        assert(n === 2, `確認は2回（氷壁の分とネクサスの分。実際 ${n} 回）`)
    },
    expect: [...gatherNegated, "自分.雪の結晶樹.コア: 2 → 1", "自分.トラッシュのコア: 0 → 1"],
})

console.log("=== T5. 対話：氷壁は押し、ネクサスは断る：コアは動かず、スノーフレイクンは疲労したまま ===")
scenario({
    name: "tree-decline",
    start: { turn: "opp", interactive: true, me: treeMe(2), opp: treeOpp },
    steps: (t) => {
        cast(t)
        const n = drive(t, [true, false])
        assert(n === 2, `確認は2回（実際 ${n} 回）`)
    },
    expect: [...gatherNegated, "自分.スノーフレイクン.疲労: false → true"],
})

console.log("すべてのチェックに合格しました 🎉（part464）")
