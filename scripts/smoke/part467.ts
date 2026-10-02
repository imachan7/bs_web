// smoke パート467（「〜することで」の期待値：BS13-023 マウンテン・セイカイ【合体時】Lv3／
// BS13-024 武神獣ディアル・ユキムラ アタック時／BS06-074 紅玉の火山弾 Lv2 の付与効果）。
// 期待値は効果文とユーザー確認済みの一般則だけから書いた（実装を見ていない）
import { assert, effectiveBp, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const SEIKAI = "BS13-023"
const BRAVE = "BS13-054" // ヒョウ・カッチュー（緑のブレイヴ・コスト4・BP3000）。合体時の効果なし
const YUKI = "BS13-024"
const MUSHA = "BS14-029" // ムシャ・ジオ（遊精・Lv1でBP5000）
const PINE = "BS05-019" // パイナッポポタマス（遊精・Lv1でBP2000）
const RUBY = "BS06-074"
const DIME = "BS05-003" // ディメトロドロン（赤・地竜・Lv1でBP3000）
const MOON = "BS13-027" // ムーンショウウオ（白。赤でも地竜でもない）
const VANILLA = "BS01-002" // ロクケラトプス（赤・地竜・Lv1でBP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    const lv = (id: string, n: number) => getCard(id).levels.find((l) => l.level === n)
    assert(getCard(SEIKAI).name === "マウンテン・セイカイ" && getCard(SEIKAI).type === "spirit", "SEIKAIはマウンテン・セイカイ")
    assert(lv(SEIKAI, 3)?.cores === 7 && lv(SEIKAI, 3)?.bp === 12000 && lv(SEIKAI, 2)?.cores === 3, "セイカイはコア7個でLv3(BP12000)・コア3個でLv2")
    assert(getCard(BRAVE).name === "ヒョウ・カッチュー" && getCard(BRAVE).type === "brave" && lv(BRAVE, 1)?.bp === 3000, "BRAVEはBP3000のブレイヴ")
    assert(getCard(YUKI).name === "武神獣ディアル・ユキムラ" && lv(YUKI, 1)?.bp === 5000 && lv(YUKI, 2)?.bp === 7000 && lv(YUKI, 2)?.cores === 3, "ユキムラ")
    assert(getCard(MUSHA).name === "ムシャ・ジオ" && getCard(MUSHA).family.includes("遊精") && lv(MUSHA, 1)?.bp === 5000, "MUSHAは遊精でBP5000")
    assert(getCard(PINE).name === "パイナッポポタマス" && getCard(PINE).family.includes("遊精") && lv(PINE, 1)?.bp === 2000, "PINEは遊精でBP2000")
    assert(getCard(RUBY).name === "紅玉の火山弾" && getCard(RUBY).type === "nexus" && lv(RUBY, 2)?.cores === 2 && lv(RUBY, 1)?.cores === 0, "RUBYはコア2個でLv2")
    assert(getCard(DIME).name === "ディメトロドロン" && getCard(DIME).family.includes("地竜") && lv(DIME, 1)?.bp === 3000 && getCard(DIME).colors.includes("red"), "DIMEは赤の地竜でBP3000")
    assert(getCard(MOON).name === "ムーンショウウオ" && !getCard(MOON).colors.includes("red") && !getCard(MOON).family.includes("地竜"), "MOONは赤でも地竜でもない")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).family.includes("地竜") && getCard(VANILLA).effects.length === 0, "VANILLAは効果なしの赤の地竜")
}

type Ctx = ScenarioCtx
type PC = NonNullable<Ctx["state"]["pendingChoice"]>
interface Policy {
    confirm?: boolean
    pick?: (pc: PC) => string
}
interface Rec {
    confirms: number
    targets: { byMe: boolean; candidates: string[] }[]
}

const isConfirm = (pc: PC) => pc.kind === "option" && ((pc.options ?? []).includes("発動する") || pc.confirm === true)

function drive(t: Ctx, policy: Policy = {}): Rec {
    const rec: Rec = { confirms: 0, targets: [] }
    for (let i = 0; t.state.pendingChoice; i++) {
        if (i > 8) throw new Error("選択待ちが終わらない")
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(pc)) {
            rec.confirms++
            if (policy.confirm === false) t.act(side, { type: "resolveChoice" })
            else t.act(side, { type: "resolveChoice", option: (pc.options ?? ["発動する"]).includes("発動する") ? "発動する" : pc.options![0]! })
        } else if (pc.kind === "target") {
            rec.targets.push({ byMe: pc.pid === t.me, candidates: [...pc.candidates] })
            t.act(side, { type: "resolveChoice", instanceId: policy.pick ? policy.pick(pc) : pc.candidates[0]! })
        } else if (pc.kind === "card") {
            t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices![0]! })
        } else {
            t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        }
    }
    return rec
}

const bpOf = (t: Ctx, label: string) => effectiveBp(t.state, label.startsWith("相手.") ? t.opp : t.me, t.inst(label))

// ───────────────────────── BS13-023 マウンテン・セイカイ【合体時】Lv3『このスピリットのバトル時』 ─────────────────────────
console.log("=== BS13-023 マウンテン・セイカイ ===")

function seikaiSide(cores: number, withBrave: boolean) {
    return { spirits: [{ card: SEIKAI, label: "セイカイ", cores }, ...(withBrave ? [{ card: BRAVE, label: "ブレイヴ" }] : [])] }
}
const blockerSide = { spirits: [{ card: VANILLA, label: "ブロッカー" }] }

// ブレイヴを合体 → アタック → 相手がブロック → バトル終了まで。バトルが終わる時点で確認が出るなら、押す前の状態を調べる
function seikaiRun(t: Ctx, withBrave: boolean, policy: Policy = {}): Rec {
    if (withBrave) t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("セイカイ") })
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("セイカイ") })
    t.closeFlash()
    t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
    t.closeFlash()
    if (t.state.pendingChoice && withBrave) {
        assert(t.inst("セイカイ").isRested === true, "確認の時点ではセイカイはまだ疲労状態")
        assert(t.state.players[t.me].field.combinedBraves.length === 1, "確認の時点ではブレイヴはまだ合体中")
    }
    return drive(t, policy)
}
const blockerDies = ["相手.ブロッカー.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"]
const braveReturned = [
    "自分.ブレイヴ.場所: フィールド → なし",
    "自分.手札: なし → ヒョウ・カッチュー",
    "自分.リザーブ: 10 → 11", // 合体でブレイヴのコアがリザーブに戻る分
]
const braveStays = (hostBp: [number, number]) => [
    "自分.セイカイ.疲労: false → true",
    `自分.セイカイ.BP: ${hostBp[0]} → ${hostBp[1]}`,
    "自分.ブレイヴ.BP: 3000 → なし",
    "自分.ブレイヴ.コア: 1 → 0",
    "自分.ブレイヴ.場所: フィールド → 合体",
    "自分.リザーブ: 10 → 11",
]

console.log("=== 1. 対話・Lv3・ブレイヴ合体中：確認は1回、押すとブレイヴが手札に戻り、セイカイが回復する ===")
scenario({
    name: "seikai-pay",
    start: { interactive: true, me: seikaiSide(7, true), opp: blockerSide },
    steps(t) {
        assert(seikaiRun(t, true).confirms === 1, "確認は1回")
        assert(t.inst("セイカイ").isRested === false, "セイカイは回復した")
    },
    expect: [...braveReturned, ...blockerDies],
})

console.log("=== 2. 非対話・Lv3・ブレイヴ合体中：払えるので自動で払い、回復する ===")
scenario({
    name: "seikai-pay-auto",
    start: { me: seikaiSide(7, true), opp: blockerSide },
    steps(t) {
        assert(seikaiRun(t, true).confirms === 0, "非対話は確認なし")
    },
    expect: [...braveReturned, ...blockerDies],
})

console.log("=== 3. 対話・Lv3・断る：ブレイヴは合体したまま、セイカイは疲労したまま ===")
scenario({
    name: "seikai-decline",
    start: { interactive: true, me: seikaiSide(7, true), opp: blockerSide },
    steps(t) {
        assert(seikaiRun(t, true, { confirm: false }).confirms === 1, "確認は1回")
    },
    expect: [...braveStays([12000, 15000]), ...blockerDies],
})

console.log("=== 4. 対話・Lv2（コア3個）：Lv3の効果なので確認も出ず、疲労したまま ===")
scenario({
    name: "seikai-lv2",
    start: { interactive: true, me: seikaiSide(3, true), opp: blockerSide },
    steps(t) {
        assert(seikaiRun(t, true).confirms === 0, "Lv2は確認なし")
    },
    expect: [...braveStays([6000, 9000]), ...blockerDies],
})

console.log("=== 5. 対話・Lv3だがブレイヴが合体していない：確認も出ず、疲労したまま ===")
scenario({
    name: "seikai-no-brave",
    start: { interactive: true, me: seikaiSide(7, false), opp: blockerSide },
    steps(t) {
        assert(seikaiRun(t, false).confirms === 0, "ブレイヴなしは確認なし")
    },
    expect: ["自分.セイカイ.疲労: false → true", ...blockerDies],
})

// ───────────────────────── BS13-024 武神獣ディアル・ユキムラ Lv1･Lv2『アタック時』 ─────────────────────────
console.log("=== BS13-024 武神獣ディアル・ユキムラ ===")

const yukiSide = (cores: number, allies: { card: string; label: string; rested?: boolean }[]) => ({
    spirits: [{ card: YUKI, label: "ユキムラ", cores }, ...allies],
})
const PINE_A = { card: PINE, label: "パイナッポ" }
const MUSHA_A = { card: MUSHA, label: "ムシャ" }
const ROKU_A = { card: VANILLA, label: "ロクケラ" }

// ユキムラがアタック → アタック時の効果（確認・選択）→ バトル中のBPを控える → バトルを終える
function yukiRun(t: Ctx, policy: Policy = {}): { rec: Rec; midBp: number } {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("ユキムラ") })
    const rec = drive(t, policy)
    const midBp = bpOf(t, "ユキムラ")
    t.closeFlash()
    drive(t)
    t.act("opp", { type: "takeLife" })
    drive(t)
    return { rec, midBp }
}
const yukiBase = ["自分.ユキムラ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]

console.log("=== 6. 対話・Lv1・遊精2体＋遊精でない1体：候補は遊精の2体、パイナッポ(BP2000)を疲労 → バトル中BP7000、バトル後は5000 ===")
scenario({
    name: "yuki-pine",
    start: { interactive: true, me: yukiSide(1, [MUSHA_A, PINE_A, ROKU_A]) },
    steps(t) {
        const { rec, midBp } = yukiRun(t, { pick: () => t.id("パイナッポ") })
        assert(rec.confirms === 1, "確認は1回")
        assert(rec.targets.length === 1 && rec.targets[0]?.byMe === true, "疲労させる遊精は自分が選ぶ")
        const c = rec.targets[0]?.candidates ?? []
        assert(c.length === 2 && c.includes(t.id("ムシャ")) && c.includes(t.id("パイナッポ")), "候補は遊精の2体（ロクケラトプスと、すでに疲労しているユキムラ自身は含まない）")
        assert(midBp === 7000, `バトル中のBPは5000+2000=7000（実際 ${midBp}）`)
        assert(bpOf(t, "ユキムラ") === 5000, "バトルが終わるとBPは5000に戻る")
    },
    expect: [...yukiBase, "自分.パイナッポ.疲労: false → true"],
})

console.log("=== 7. 対話・Lv1：ムシャ・ジオ(BP5000)を疲労 → バトル中BP10000 ===")
scenario({
    name: "yuki-musha",
    start: { interactive: true, me: yukiSide(1, [MUSHA_A, PINE_A]) },
    steps(t) {
        const { rec, midBp } = yukiRun(t, { pick: () => t.id("ムシャ") })
        assert(rec.confirms === 1, "確認は1回")
        assert(midBp === 10000, `バトル中のBPは5000+5000=10000（実際 ${midBp}）`)
    },
    expect: [...yukiBase, "自分.ムシャ.疲労: false → true"],
})

console.log("=== 8. 非対話・Lv1・遊精1体：払えるので自動で疲労させ、BP+2000 ===")
scenario({
    name: "yuki-auto",
    start: { me: yukiSide(1, [PINE_A]) },
    steps(t) {
        const { rec, midBp } = yukiRun(t)
        assert(rec.confirms === 0, "非対話は確認なし")
        assert(midBp === 7000, `バトル中のBPは7000（実際 ${midBp}）`)
    },
    expect: [...yukiBase, "自分.パイナッポ.疲労: false → true"],
})

console.log("=== 9. 対話・Lv2（コア3個・BP7000）：Lv2でも同じ。パイナッポを疲労 → バトル中BP9000 ===")
scenario({
    name: "yuki-lv2",
    start: { interactive: true, me: yukiSide(3, [PINE_A]) },
    steps(t) {
        const { rec, midBp } = yukiRun(t)
        assert(rec.confirms === 1, "確認は1回")
        assert(midBp === 9000, `バトル中のBPは7000+2000=9000（実際 ${midBp}）`)
    },
    expect: [...yukiBase, "自分.パイナッポ.疲労: false → true"],
})

console.log("=== 10. 対話・遊精が他にいない：確認は出るが、押しても払えずBPは5000のまま ===")
scenario({
    name: "yuki-cannot-pay",
    start: { interactive: true, me: yukiSide(1, [ROKU_A]) },
    steps(t) {
        const { rec, midBp } = yukiRun(t)
        assert(rec.confirms === 1, "払えなくても確認は1回出る")
        assert(midBp === 5000, `BPは5000のまま（実際 ${midBp}）`)
    },
    expect: [...yukiBase],
})

console.log("=== 11. 対話・払えるが断る：BPは5000のまま、遊精は疲労しない ===")
scenario({
    name: "yuki-decline",
    start: { interactive: true, me: yukiSide(1, [MUSHA_A]) },
    steps(t) {
        const { rec, midBp } = yukiRun(t, { confirm: false })
        assert(rec.confirms === 1, "確認は1回")
        assert(midBp === 5000, `BPは5000のまま（実際 ${midBp}）`)
    },
    expect: [...yukiBase],
})

console.log("=== 12. 非対話・遊精がすでに疲労している：疲労させられないのでBPは5000のまま ===")
scenario({
    name: "yuki-ally-rested",
    start: { me: { spirits: [{ card: YUKI, label: "ユキムラ", cores: 1 }, { card: MUSHA, label: "ムシャ", rested: true }] } },
    steps(t) {
        const { midBp } = yukiRun(t)
        assert(midBp === 5000, `BPは5000のまま（実際 ${midBp}）`)
    },
    expect: [...yukiBase],
})

console.log("=== 13. 非対話・遊精は相手にだけいる：「自分のスピリット」ではないのでBPは5000のまま、相手の遊精は疲労しない ===")
scenario({
    name: "yuki-opp-ally",
    start: { me: yukiSide(1, []), opp: { spirits: [{ card: PINE, label: "相手遊精" }] } },
    steps(t) {
        const { midBp } = yukiRun(t)
        assert(midBp === 5000, `BPは5000のまま（実際 ${midBp}）`)
    },
    expect: [...yukiBase],
})

// ───────────────────────── BS06-074 紅玉の火山弾 Lv2（赤のスピリットへの付与） ─────────────────────────
console.log("=== BS06-074 紅玉の火山弾 ===")

const rubySide = (cores: number, spirits: { card: string; label: string; cores?: number }[]) => ({
    nexuses: [{ card: RUBY, cores }],
    spirits,
})
const ROKU_ATK = { card: VANILLA, label: "アタッカー" }
const DIME_A = { card: DIME, label: "ディメ" }
const ROKU_C = { card: VANILLA, label: "ロクケラ" }

function rubyRun(t: Ctx, who: string, policy: Policy = {}): { rec: Rec; midBp: number } {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id(who) })
    const rec = drive(t, policy)
    const midBp = bpOf(t, who)
    t.closeFlash()
    drive(t)
    t.act("opp", { type: "takeLife" })
    drive(t)
    return { rec, midBp }
}
const rubyBase = (who: string) => [`自分.${who}.疲労: false → true`, "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]

console.log("=== 14. 対話・Lv2・赤の地竜がアタック：確認は1回、ディメトロドロン(BP3000)を疲労 → バトル中BP4000、バトル後は1000 ===")
scenario({
    name: "ruby-lv2",
    start: { interactive: true, me: rubySide(2, [ROKU_ATK, DIME_A, ROKU_C]) },
    steps(t) {
        const { rec, midBp } = rubyRun(t, "アタッカー", { pick: () => t.id("ディメ") })
        assert(rec.confirms === 1, "確認は1回")
        assert(rec.targets.length === 1 && rec.targets[0]?.byMe === true, "疲労させる地竜は自分が選ぶ")
        const c = rec.targets[0]?.candidates ?? []
        assert(c.length === 2 && c.includes(t.id("ディメ")) && c.includes(t.id("ロクケラ")), "候補は疲労していない地竜の2体（アタックして疲労した自身は含まない）")
        assert(midBp === 4000, `バトル中のBPは1000+3000=4000（実際 ${midBp}）`)
        assert(bpOf(t, "アタッカー") === 1000, "バトルが終わるとBPは1000に戻る")
    },
    expect: [...rubyBase("アタッカー"), "自分.ディメ.疲労: false → true"],
})

console.log("=== 15. 非対話・Lv2・地竜1体：払えるので自動で疲労させ、BP+3000 ===")
scenario({
    name: "ruby-auto",
    start: { me: rubySide(2, [ROKU_ATK, DIME_A]) },
    steps(t) {
        const { rec, midBp } = rubyRun(t, "アタッカー")
        assert(rec.confirms === 0, "非対話は確認なし")
        assert(midBp === 4000, `バトル中のBPは4000（実際 ${midBp}）`)
    },
    expect: [...rubyBase("アタッカー"), "自分.ディメ.疲労: false → true"],
})

console.log("=== 16. 対話・Lv1（コア1個）：Lv2の効果なので確認も出ず、BPは1000のまま ===")
scenario({
    name: "ruby-lv1",
    start: { interactive: true, me: rubySide(1, [ROKU_ATK, DIME_A]) },
    steps(t) {
        const { rec, midBp } = rubyRun(t, "アタッカー")
        assert(rec.confirms === 0, "Lv1は確認なし")
        assert(midBp === 1000, `BPは1000のまま（実際 ${midBp}）`)
    },
    expect: [...rubyBase("アタッカー")],
})

console.log("=== 17. 対話・Lv2・アタックするのが赤でないスピリット：付与の対象外なので確認も出ない ===")
scenario({
    name: "ruby-not-red",
    start: { interactive: true, me: rubySide(2, [{ card: MOON, label: "白", cores: 1 }, DIME_A]) },
    steps(t) {
        const { rec, midBp } = rubyRun(t, "白")
        assert(rec.confirms === 0, "赤でないスピリットは確認なし")
        assert(midBp === 2000, `BPは2000のまま（実際 ${midBp}）`)
    },
    expect: [...rubyBase("白")],
})

console.log("=== 18. 対話・Lv2・他に疲労させられる地竜がいない：確認は出るが、押しても払えずBPは1000のまま ===")
scenario({
    name: "ruby-cannot-pay",
    start: { interactive: true, me: rubySide(2, [ROKU_ATK]) },
    steps(t) {
        const { rec, midBp } = rubyRun(t, "アタッカー")
        assert(rec.confirms === 1, "払えなくても確認は1回出る")
        assert(midBp === 1000, `BPは1000のまま（実際 ${midBp}）`)
    },
    expect: [...rubyBase("アタッカー")],
})

console.log("=== 19. 対話・Lv2・断る：BPは1000のまま、地竜は疲労しない ===")
scenario({
    name: "ruby-decline",
    start: { interactive: true, me: rubySide(2, [ROKU_ATK, DIME_A]) },
    steps(t) {
        const { rec, midBp } = rubyRun(t, "アタッカー", { confirm: false })
        assert(rec.confirms === 1, "確認は1回")
        assert(midBp === 1000, `BPは1000のまま（実際 ${midBp}）`)
    },
    expect: [...rubyBase("アタッカー")],
})

console.log("=== 20. 相手が赤の地竜でアタック：自分のネクサスの付与は相手のスピリットに及ばない ===")
scenario({
    name: "ruby-opp-attacker",
    start: {
        turn: "opp",
        interactive: true,
        me: { nexuses: [{ card: RUBY, cores: 2 }] },
        opp: { spirits: [{ card: VANILLA, label: "相手アタッカー" }, { card: DIME, label: "相手ディメ" }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("相手アタッカー") })
        const rec = drive(t)
        assert(rec.confirms === 0, "相手のアタックでは確認なし")
        assert(bpOf(t, "相手.相手アタッカー") === 1000, "相手のBPは1000のまま")
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        drive(t)
    },
    expect: ["相手.相手アタッカー.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})

console.log("すべてのチェックに合格しました 🎉（part467）")
