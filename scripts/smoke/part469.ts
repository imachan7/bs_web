// smoke パート469（【強襲】：「〜疲労させることで回復できる」の確認関門。期待値は効果文とユーザー確認済みの規則だけから書いた）
// 規則: docs/design/COST_MODEL.md §10 末尾「【強襲】」。回数N・既に回復状態・払えない場合の扱いはそこに従う
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

const RAVEN = "SD02-010" // 轟剣士レーヴェン
const GOLEM = "BS07-054" // 神凰兵フェニックス・ゴレム
const BAZOOKA = "BS10-076" // バズーカ・アームズ
const CHIMERA = "BS08-084" // キマイラアサルト
const PALACE = "BS09-063" // 花の宮殿
const KICK = "BS07-066" // 蹴撃の戦場跡
const VANILLA = "BS01-002"
const ISOU = "BS03-081" // 人馬巨兵ダンストン（異合・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    const n = (id: string) => getCard(id).name
    assert(n(RAVEN) === "轟剣士レーヴェン" && getCard(RAVEN).type === "spirit", "RAVENはレーヴェン")
    assert(n(GOLEM) === "神凰兵フェニックス・ゴレム" && getCard(GOLEM).type === "spirit", "GOLEMはフェニックス・ゴレム")
    assert(n(BAZOOKA) === "バズーカ・アームズ" && getCard(BAZOOKA).type === "brave", "BAZOOKAはバズーカ・アームズ")
    assert(n(CHIMERA) === "キマイラアサルト" && getCard(CHIMERA).type === "magic", "CHIMERAはキマイラアサルト")
    assert(n(PALACE) === "花の宮殿" && getCard(PALACE).type === "nexus", "PALACEは花の宮殿")
    assert(n(KICK) === "蹴撃の戦場跡" && getCard(KICK).type === "nexus", "KICKは蹴撃の戦場跡")
    assert(n(VANILLA) === "ロクケラトプス" && getCard(VANILLA).effects.length === 0, "VANILLAは効果なし")
    assert(n(ISOU) === "人馬巨兵ダンストン" && getCard(ISOU).family?.includes("異合") === true && getCard(ISOU).effects.length === 0, "ISOUは異合の効果なし")
    assert(getCard(VANILLA).family?.includes("異合") !== true, "VANILLAは異合でない")
}

const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option" && (pc.options ?? []).includes("発動する")
}

const coresOf = (t: ScenarioCtx, id: string): number => {
    for (const p of [t.state.players.p1, t.state.players.p2]) {
        for (const x of [...p.field.spirits, ...p.field.nexuses, ...p.field.combinedBraves]) if (x.instanceId === id) return x.cores
    }
    return 99
}

// 確認が出たら answer で答える。確認以外の選択はコアの少ない候補で答える。確認の回数と、候補の数を返す
function drive(t: ScenarioCtx, answer: "yes" | "no" = "yes"): { confirms: number; maxCandidates: number } {
    let confirms = 0
    let maxCandidates = 0
    let guard = 0
    while (t.state.pendingChoice) {
        if (++guard > 30) throw new Error("選択が終わらない")
        const pc = t.state.pendingChoice
        const side: Side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(t)) {
            confirms++
            const opts = pc.options ?? []
            t.act(side, { type: "resolveChoice", option: answer === "yes" ? "発動する" : opts.find((o) => o !== "発動する")! })
        } else if (pc.kind === "option") {
            t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        } else {
            maxCandidates = Math.max(maxCandidates, pc.candidates.length)
            const best = [...pc.candidates].sort((a, b) => coresOf(t, a) - coresOf(t, b))[0]!
            t.act(side, { type: "resolveChoice", instanceId: best })
        }
    }
    return { confirms, maxCandidates }
}

// 攻撃側 side の who でアタックし、バトルが終わるまで進める。確認の回数を返す
function swing(t: ScenarioCtx, side: Side, who: string, answer: "yes" | "no" = "yes"): { confirms: number; maxCandidates: number } {
    const defender: Side = side === "me" ? "opp" : "me"
    t.act(side, { type: "attack", instanceId: t.id(who) })
    const total = drive(t, answer)
    for (let i = 0; i < 6 && t.state.battle; i++) {
        if (t.state.pendingChoice) {
            const r = drive(t, answer)
            total.confirms += r.confirms
        } else if (t.state.isFlashTiming) t.closeFlash()
        else t.act(defender, { type: "takeLife" })
    }
    return total
}

const raven = (cores: number, label = "レーヴェン") => ({ card: RAVEN, label, cores })
const nexus = (label: string, cores = 1, rested = false) => ({ card: PALACE, label, cores, rested })
const hit = (n = 1) => [`相手.ライフ: 5 → ${5 - n}`, `相手.リザーブ: 10 → ${10 + n}`]

console.log("=== 1. レーヴェンLv2・非対話：確認なしでネクサスを疲労させて回復する ===")
scenario({
    name: "raven-auto",
    start: { phase: "attack", me: { spirits: [raven(4)], nexuses: [nexus("宮殿")] } },
    steps: (t) => assert(swing(t, "me", "自分.レーヴェン").confirms === 0, "非対話は確認なし"),
    expect: ["自分.宮殿.疲労: false → true", ...hit()],
})

console.log("=== 2. 対話・押す：確認は1回。ネクサスが疲労しレーヴェンは回復状態で終わる ===")
scenario({
    name: "raven-yes",
    start: { phase: "attack", interactive: true, me: { spirits: [raven(4)], nexuses: [nexus("宮殿")] } },
    steps: (t) => assert(swing(t, "me", "自分.レーヴェン").confirms === 1, "確認は1回"),
    expect: ["自分.宮殿.疲労: false → true", ...hit()],
})

console.log("=== 3. 対話・断る：ネクサスは疲労せず、レーヴェンは疲労状態のまま ===")
scenario({
    name: "raven-no",
    start: { phase: "attack", interactive: true, me: { spirits: [raven(4)], nexuses: [nexus("宮殿")] } },
    steps: (t) => assert(swing(t, "me", "自分.レーヴェン", "no").confirms === 1, "確認は1回"),
    expect: ["自分.レーヴェン.疲労: false → true", ...hit()],
})

console.log("=== 4. 対話：回復状態のネクサスが無い（全部疲労）→確認は出ず、何も起きない（2026-10-02 ユーザー決定） ===")
scenario({
    name: "raven-all-rested",
    start: { phase: "attack", interactive: true, me: { spirits: [raven(4)], nexuses: [nexus("宮殿", 1, true)] } },
    steps: (t) => assert(swing(t, "me", "自分.レーヴェン").confirms === 0, "確認は出ない"),
    expect: ["自分.レーヴェン.疲労: false → true", ...hit()],
})

console.log("=== 5. 対話：ネクサスが1つも無い→確認は出ず、何も起きない ===")
scenario({
    name: "raven-no-nexus",
    start: { phase: "attack", interactive: true, me: { spirits: [raven(4)] } },
    steps: (t) => assert(swing(t, "me", "自分.レーヴェン").confirms === 0, "確認は出ない"),
    expect: ["自分.レーヴェン.疲労: false → true", ...hit()],
})

console.log("=== 6. Lv1のレーヴェンは【強襲】を持たない：確認なし・回復しない ===")
scenario({
    name: "raven-lv1",
    start: { phase: "attack", interactive: true, me: { spirits: [raven(1)], nexuses: [nexus("宮殿")] } },
    steps: (t) => assert(swing(t, "me", "自分.レーヴェン").confirms === 0, "Lv1は確認なし"),
    expect: ["自分.レーヴェン.疲労: false → true", ...hit()],
})

console.log("=== 7. 【強襲：1】は1回まで：2回目のアタックでは確認が出ず、回復もしない ===")
scenario({
    name: "raven-twice",
    start: { phase: "attack", interactive: true, me: { spirits: [raven(4)], nexuses: [nexus("宮殿A", 1), nexus("宮殿B", 2)] } },
    steps: (t) => {
        assert(swing(t, "me", "自分.レーヴェン").confirms === 1, "1回目は確認が出る")
        assert(swing(t, "me", "自分.レーヴェン").confirms === 0, "2回目は確認が出ない")
    },
    expect: ["自分.宮殿A.疲労: false → true", "自分.レーヴェン.疲労: false → true", ...hit(2)],
})

console.log("=== 8. 対話：回復状態のネクサスが2つ→持ち主が選ぶ（選択肢は2つ） ===")
scenario({
    name: "raven-choose",
    start: { phase: "attack", interactive: true, me: { spirits: [raven(4)], nexuses: [nexus("宮殿A", 1), nexus("宮殿B", 3)] } },
    steps: (t) => {
        // drive はコアの少ない候補を選ぶ。選択肢が2つ出たことだけをここで確かめる
        const r = swing(t, "me", "自分.レーヴェン")
        assert(r.confirms === 1 && r.maxCandidates === 2, `確認1回・候補2つ（実際 ${r.confirms} 回・${r.maxCandidates} 個）`)
    },
    expect: ["自分.宮殿A.疲労: false → true", ...hit()],
})

console.log("=== 9. 非対話：ネクサスが2つならコア数が最も少ないほうを疲労させる ===")
scenario({
    name: "raven-fewest",
    start: { phase: "attack", me: { spirits: [raven(4)], nexuses: [nexus("宮殿A", 3), nexus("宮殿B", 1)] } },
    steps: (t) => swing(t, "me", "自分.レーヴェン"),
    expect: ["自分.宮殿B.疲労: false → true", ...hit()],
})

console.log("=== 10. 相手の花の宮殿Lv2：自分のネクサスは疲労させられない→確認は出ず、何も起きない ===")
scenario({
    name: "raven-vs-palace-lv2",
    start: { phase: "attack", interactive: true, me: { spirits: [raven(4)], nexuses: [nexus("宮殿")] }, opp: { nexuses: [nexus("敵宮殿", 2)] } },
    steps: (t) => assert(swing(t, "me", "自分.レーヴェン").confirms === 0, "確認は出ない"),
    expect: ["自分.レーヴェン.疲労: false → true", ...hit()],
})

console.log("=== 10b. 相手の花の宮殿Lv2・非対話：疲労させられず回復しない ===")
scenario({
    name: "raven-vs-palace-lv2-auto",
    start: { phase: "attack", me: { spirits: [raven(4)], nexuses: [nexus("宮殿")] }, opp: { nexuses: [nexus("敵宮殿", 2)] } },
    steps: (t) => swing(t, "me", "自分.レーヴェン"),
    expect: ["自分.レーヴェン.疲労: false → true", ...hit()],
})

console.log("=== 11. 相手の花の宮殿Lv1は妨げない：回復できる ===")
scenario({
    name: "raven-vs-palace-lv1",
    start: { phase: "attack", interactive: true, me: { spirits: [raven(4)], nexuses: [nexus("宮殿")] }, opp: { nexuses: [nexus("敵宮殿", 1)] } },
    steps: (t) => assert(swing(t, "me", "自分.レーヴェン").confirms === 1, "確認は出る"),
    expect: ["自分.宮殿.疲労: false → true", ...hit()],
})

console.log("=== 12. レーヴェンLv3『自分のアタックステップ』：【強襲】持ちの自分のスピリットすべてBP+3000（相手・持たない者は対象外） ===")
scenario({
    name: "raven-lv3-bp",
    start: {
        phase: "main",
        me: { spirits: [raven(5, "主"), raven(4, "副"), { card: VANILLA, label: "バニラ", cores: 1 }] },
        opp: { spirits: [raven(4, "敵")] },
    },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.主.BP: 9000 → 12000", "自分.副.BP: 8000 → 11000"],
})

console.log("=== 13. フェニックス・ゴレムLv3【強襲：3】：回復するたびに相手のデッキを4枚破棄。3回まで、4回目は確認も回復も無い ===")
scenario({
    name: "golem-three",
    start: {
        phase: "attack",
        interactive: true,
        me: { spirits: [{ card: GOLEM, label: "ゴレム", cores: 10 }], nexuses: [nexus("宮殿1", 1), nexus("宮殿2", 2), nexus("宮殿3", 3), nexus("宮殿4", 4)] },
    },
    steps: (t) => {
        for (let i = 1; i <= 3; i++) assert(swing(t, "me", "自分.ゴレム").confirms === 1, `${i}回目は確認が出る`)
        assert(swing(t, "me", "自分.ゴレム").confirms === 0, "4回目は確認が出ない")
    },
    expect: [
        "自分.宮殿1.疲労: false → true",
        "自分.宮殿2.疲労: false → true",
        "自分.宮殿3.疲労: false → true",
        "自分.ゴレム.疲労: false → true",
        "相手.デッキ枚数: 40 → 28",
        `相手.トラッシュ: なし → ${Array.from({ length: 12 }, () => "ロクケラトプス").join("、")}`,
        ...hit(4).map((l) => l.replace("5 → 1", "5 → 1")),
    ],
})

console.log("=== 14. ゴレムLv3・断る：回復せず、デッキも削れない ===")
scenario({
    name: "golem-no",
    start: { phase: "attack", interactive: true, me: { spirits: [{ card: GOLEM, label: "ゴレム", cores: 10 }], nexuses: [nexus("宮殿")] } },
    steps: (t) => assert(swing(t, "me", "自分.ゴレム", "no").confirms === 1, "確認は1回"),
    expect: ["自分.ゴレム.疲労: false → true", ...hit()],
})

console.log("=== 15. ゴレムLv2は【強襲】を持たない：確認なし・回復なし・デッキも削れない ===")
scenario({
    name: "golem-lv2",
    start: { phase: "attack", interactive: true, me: { spirits: [{ card: GOLEM, label: "ゴレム", cores: 5 }], nexuses: [nexus("宮殿")] } },
    steps: (t) => assert(swing(t, "me", "自分.ゴレム").confirms === 0, "確認なし"),
    expect: ["自分.ゴレム.疲労: false → true", ...hit()],
})

console.log("=== 16. バズーカ・アームズ：合体時のアタックで【強襲：1】。確認は1回 ===")
const bazookaSide = { spirits: [{ card: BAZOOKA, label: "バズーカ", cores: 1 }, { card: VANILLA, label: "ホスト", cores: 2 }], nexuses: [nexus("宮殿")] }
const combine = (t: ScenarioCtx) => t.act("me", { type: "combineBrave", braveInstanceId: t.id("自分.バズーカ"), hostInstanceId: t.id("自分.ホスト") })
scenario({
    name: "bazooka-combined",
    start: { phase: "main", interactive: true, me: bazookaSide },
    steps: (t) => {
        combine(t)
        t.act("me", { type: "nextPhase" })
        assert(swing(t, "me", "自分.ホスト").confirms === 1, "確認は1回")
    },
    expect: ["自分.宮殿.疲労: false → true", "自分.バズーカ.場所: フィールド → 合体", "自分.バズーカ.BP: 2000 → なし", "自分.バズーカ.コア: 1 → 0", "自分.リザーブ: 10 → 11", "自分.ホスト.BP: 3000 → 5000", ...hit()],
})

console.log("=== 16b. バズーカ・アームズ単独（合体していない）：【強襲】は無い ===")
scenario({
    name: "bazooka-alone",
    start: { phase: "attack", interactive: true, me: bazookaSide },
    steps: (t) => assert(swing(t, "me", "自分.バズーカ").confirms === 0, "確認なし"),
    expect: ["自分.バズーカ.疲労: false → true"],
})

console.log("=== 17. キマイラアサルト：異合のスピリットに【強襲：1】を与える。確認は1回、2回目のアタックでは出ない ===")
const cast = (t: ScenarioCtx) => {
    t.act("me", { type: "castMagic", handIndex: 0 })
    assert(drive(t).confirms === 0, "マジックの使用では確認を聞かない")
}
const chimeraStart = { phase: "main" as const, interactive: true, me: { hand: [CHIMERA], spirits: [{ card: ISOU, label: "異合", cores: 2 }, { card: VANILLA, label: "バニラ", cores: 1 }], nexuses: [nexus("宮殿A", 1), nexus("宮殿B", 2)] } }
const castLines = ["自分.手札: キマイラアサルト → なし", "自分.トラッシュ: なし → キマイラアサルト", "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3"]
scenario({
    name: "chimera-isou",
    start: chimeraStart,
    steps: (t) => {
        cast(t)
        t.act("me", { type: "nextPhase" })
        assert(swing(t, "me", "自分.異合").confirms === 1, "1回目は確認が出る")
        assert(swing(t, "me", "自分.異合").confirms === 0, "2回目は確認が出ない")
    },
    expect: [...castLines, "自分.宮殿A.疲労: false → true", "自分.異合.疲労: false → true", ...hit(2)],
})

console.log("=== 17b. キマイラアサルトの後、異合でないスピリットには付かない ===")
scenario({
    name: "chimera-not-isou",
    start: chimeraStart,
    steps: (t) => {
        cast(t)
        t.act("me", { type: "nextPhase" })
        assert(swing(t, "me", "自分.バニラ").confirms === 0, "確認なし")
    },
    expect: [...castLines, "自分.バニラ.疲労: false → true", ...hit()],
})

console.log("=== 17c. キマイラアサルトを使わなければ異合でも【強襲】は無い ===")
scenario({
    name: "chimera-unused",
    start: chimeraStart,
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        assert(swing(t, "me", "自分.異合").confirms === 0, "確認なし")
    },
    expect: ["自分.異合.疲労: false → true", ...hit()],
})

console.log("=== 18. 蹴撃の戦場跡Lv2：相手のアタックをブロックしたときにも【強襲】。確認は1回 ===")
const blockStart = (kickCores: number, interactive = true) => ({
    turn: "opp" as const,
    interactive,
    me: { spirits: [raven(4)], nexuses: [{ card: KICK, label: "蹴撃", cores: kickCores }, nexus("宮殿")] },
    opp: { spirits: [{ card: VANILLA, label: "アタッカー", cores: 1 }] },
})
function oppAttackBlocked(t: ScenarioCtx, answer: "yes" | "no"): number {
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("相手.アタッカー") })
    let n = drive(t, answer).confirms
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id("自分.レーヴェン") })
    n += drive(t, answer).confirms
    for (let i = 0; i < 6 && t.state.battle; i++) {
        if (t.state.pendingChoice) n += drive(t, answer).confirms
        else if (t.state.isFlashTiming) t.closeFlash()
        else t.act("me", { type: "takeLife" })
    }
    return n
}
const killed = ["相手.アタッカー.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"]
scenario({
    name: "kick-lv2-yes",
    start: blockStart(2),
    steps: (t) => assert(oppAttackBlocked(t, "yes") === 1, "確認は1回"),
    expect: ["自分.宮殿.疲労: false → true", ...killed],
})

console.log("=== 18b. 蹴撃の戦場跡Lv2・断る：ブロックしたレーヴェンは疲労状態のまま ===")
scenario({
    name: "kick-lv2-no",
    start: blockStart(2),
    steps: (t) => assert(oppAttackBlocked(t, "no") === 1, "確認は1回"),
    expect: ["自分.レーヴェン.疲労: false → true", ...killed],
})

console.log("=== 18c. 蹴撃の戦場跡Lv2・非対話：確認なしで回復する ===")
scenario({
    name: "kick-lv2-auto",
    start: blockStart(2, false),
    steps: (t) => assert(oppAttackBlocked(t, "yes") === 0, "確認なし"),
    expect: ["自分.宮殿.疲労: false → true", ...killed],
})

console.log("=== 18d. 蹴撃の戦場跡Lv1：ブロック時には【強襲】が発揮されない（確認なし・回復なし） ===")
scenario({
    name: "kick-lv1",
    start: blockStart(1),
    steps: (t) => assert(oppAttackBlocked(t, "yes") === 0, "確認なし"),
    expect: ["自分.レーヴェン.疲労: false → true", ...killed],
})

console.log("すべてのチェックに合格しました 🎉（part469）")
