// smoke パート466（「〜することで」の期待値：BS16-063 釣魂台 Lv2／BS13-027 ムーンショウウオ／
// BS04-101 ミストカーテン・BS14-103 幻影氷結晶の「相手のスピリット1体を指定」は持ち主が選ぶ）。
// 期待値は効果文とユーザー確認済みの一般則だけから書いた（実装を見ていない）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const TSURI = "BS16-063"
const MOON = "BS13-027"
const MIST = "BS04-101"
const CRYSTAL = "BS14-103"
const VANILLA = "BS01-002"
const HONEDEER = "BS16-010" // 骨鹿（無魔のスピリット・コスト1）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(TSURI).name === "釣魂台" && getCard(TSURI).type === "nexus", "TSURIは釣魂台")
    assert(getCard(TSURI).levels.find((l) => l.level === 2)?.cores === 1, "釣魂台はコア1個でLv2")
    assert(getCard(TSURI).levels.find((l) => l.level === 1)?.cores === 0, "釣魂台はコア0個でLv1")
    assert(getCard(MOON).name === "ムーンショウウオ" && getCard(MOON).type === "spirit", "MOONはムーンショウウオ")
    assert(getCard(MOON).levels.find((l) => l.level === 2)?.cores === 3, "ムーンショウウオはコア3個でLv2")
    assert(getCard(MIST).name === "ミストカーテン" && getCard(MIST).type === "magic" && getCard(MIST).cost === 2, "MISTはミストカーテン")
    assert(getCard(CRYSTAL).name === "幻影氷結晶" && getCard(CRYSTAL).type === "magic" && getCard(CRYSTAL).cost === 2, "CRYSTALは幻影氷結晶")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).effects.length === 0, "VANILLAは効果なし")
    assert(getCard(HONEDEER).name === "骨鹿" && getCard(HONEDEER).type === "spirit" && getCard(HONEDEER).family.includes("無魔"), "HONEDEERは無魔のスピリット")
    assert(!getCard(VANILLA).family.includes("無魔"), "VANILLAは無魔ではない")
}

type Ctx = ScenarioCtx
interface Policy {
    confirm?: boolean // false＝確認を断る（スキップ）。既定は押す
    pick?: (pc: NonNullable<Ctx["state"]["pendingChoice"]>) => string // 対象選択の答え。既定は候補の先頭
}
interface Rec {
    confirms: number
    targets: { byMe: boolean; candidates: string[] }[]
}

const isConfirm = (pc: NonNullable<Ctx["state"]["pendingChoice"]>) => pc.kind === "option" && ((pc.options ?? []).includes("発動する") || pc.confirm === true)

// 選択待ちがなくなるまで答える。確認の回数と、対象選択の持ち主・候補を記録する
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

// 相手の1回のアタックを最後まで進める（ブロッカーなし。自分はライフで受ける）。確認の回数を返す
function oppAttack(t: Ctx, who: string, policy: Policy = {}): number {
    t.act("opp", { type: "attack", instanceId: t.id(who) })
    let n = drive(t, policy).confirms
    if (t.state.battle) {
        t.closeFlash()
        n += drive(t, policy).confirms
        if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" })
        n += drive(t, policy).confirms
    }
    return n
}

// 相手のターン開始（ドロー・コアステップ）で起きる変化。「エンドステップ」「ターン終了」の場面の期待値に足す
const oppTurnStart = ["相手.手札: なし → ロクケラトプス", "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11"]

// ───────────────────────── BS16-063 釣魂台 Lv2『自分のエンドステップ』 ─────────────────────────
console.log("=== BS16-063 釣魂台 ===")

function endTurn(t: Ctx, policy: Policy = {}): Rec {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "endTurn" })
    return drive(t, policy)
}

const paid = ["自分.手札: ロクケラトプス、骨鹿 → ロクケラトプス", "自分.トラッシュ: なし → 骨鹿"]
const drew = ["自分.デッキ枚数: 40 → 39"]
// 手札: ロクケラトプス(無魔でない)＋骨鹿。骨鹿を破棄 → 1枚ドロー(ロクケラトプス)なので手札の名前は「ロクケラトプス、ロクケラトプス」
const paidAndDrew = ["自分.手札: ロクケラトプス、骨鹿 → ロクケラトプス、ロクケラトプス", "自分.トラッシュ: なし → 骨鹿", ...drew]

console.log("=== 1. 対話・Lv2・無魔のスピリットが手札にある：確認は1回、押すと骨鹿を破棄して1枚ドロー ===")
scenario({
    name: "tsuri-pay",
    start: { interactive: true, me: { nexuses: [{ card: TSURI, cores: 1 }], hand: [VANILLA, HONEDEER] } },
    steps(t) {
        assert(endTurn(t).confirms === 1, "確認は1回")
    },
    expect: [...paidAndDrew, ...oppTurnStart],
})

console.log("=== 2. 非対話・Lv2・無魔のスピリットが手札にある：払えるので自動で払う ===")
scenario({
    name: "tsuri-pay-auto",
    start: { me: { nexuses: [{ card: TSURI, cores: 1 }], hand: [VANILLA, HONEDEER] } },
    steps(t) {
        assert(endTurn(t).confirms === 0, "非対話は確認なし")
    },
    expect: [...paidAndDrew, ...oppTurnStart],
})

console.log("=== 3. 対話・Lv2・手札に無魔のスピリットがない：確認は出るが、押しても払えず何も起きない ===")
scenario({
    name: "tsuri-cannot-pay",
    start: { interactive: true, me: { nexuses: [{ card: TSURI, cores: 1 }], hand: [VANILLA] } },
    steps(t) {
        assert(endTurn(t).confirms === 1, "払えなくても確認は1回出る")
    },
    expect: [...oppTurnStart],
})

console.log("=== 4. 非対話・Lv2・手札に無魔のスピリットがない：何も起きない ===")
scenario({
    name: "tsuri-cannot-pay-auto",
    start: { me: { nexuses: [{ card: TSURI, cores: 1 }], hand: [VANILLA] } },
    steps(t) {
        assert(endTurn(t).confirms === 0, "非対話は確認なし")
    },
    expect: [...oppTurnStart],
})

console.log("=== 5. 対話・Lv2・払えるが断る：何も起きない（骨鹿は手札に残る） ===")
scenario({
    name: "tsuri-decline",
    start: { interactive: true, me: { nexuses: [{ card: TSURI, cores: 1 }], hand: [HONEDEER] } },
    steps(t) {
        assert(endTurn(t, { confirm: false }).confirms === 1, "確認は1回")
    },
    expect: [...oppTurnStart],
})

console.log("=== 6. Lv1（コア0個）：Lv2の効果なので確認も出ず何も起きない ===")
scenario({
    name: "tsuri-lv1",
    start: { interactive: true, me: { nexuses: [{ card: TSURI, cores: 0 }], hand: [HONEDEER] } },
    steps(t) {
        assert(endTurn(t).confirms === 0, "Lv1は確認なし")
    },
    expect: [...oppTurnStart],
})

console.log("=== 7. 相手のエンドステップ：『自分のエンドステップ』ではないので何も起きない ===")
scenario({
    name: "tsuri-opp-end",
    start: { turn: "opp", interactive: true, me: { nexuses: [{ card: TSURI, cores: 1 }], hand: [HONEDEER] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "endTurn" })
        assert(drive(t).confirms === 0, "相手のエンドステップでは確認なし")
    },
    // 自分のターン開始のドロー・コアステップだけ
    expect: ["自分.手札: 骨鹿 → ロクケラトプス、骨鹿", "自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 11"],
})

// ───────────────────────── BS13-027 ムーンショウウオ ─────────────────────────
console.log("=== BS13-027 ムーンショウウオ Lv1･Lv2『相手のアタックステップ』 ===")

const moonSide = (cores: number) => ({ spirits: [{ card: MOON, cores }] })
const oppAB = { spirits: [{ card: VANILLA, label: "A" }, { card: VANILLA, label: "B" }] }

console.log("=== 8. 対話・Lv1・Aを指定：確認1回、指定は自分が選ぶ。Aのアタックではライフが減らず、Bのアタックでは減る ===")
scenario({
    name: "moon-pick-a",
    start: { turn: "opp", interactive: true, me: moonSide(1), opp: oppAB },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        const rec = drive(t, { pick: () => t.id("A") })
        assert(rec.confirms === 1, "確認は1回")
        assert(rec.targets.length === 1 && rec.targets[0]?.byMe === true && rec.targets[0]?.candidates.length === 2, "相手スピリット2体から自分が選ぶ")
        oppAttack(t, "A")
        oppAttack(t, "B")
    },
    expect: [
        "自分.ムーンショウウオ.場所: フィールド → なし",
        "自分.手札: なし → ムーンショウウオ",
        "自分.リザーブ: 10 → 12", // 戻ったコア1個＋Bのアタックで減ったライフ
        "自分.ライフ: 5 → 4",
        "相手.A.疲労: false → true",
        "相手.B.疲労: false → true",
    ],
})

console.log("=== 9. 対話・Lv1・Bを指定：Aのアタックでは減り、Bのアタックでは減らない ===")
scenario({
    name: "moon-pick-b",
    start: { turn: "opp", interactive: true, me: moonSide(1), opp: oppAB },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        assert(drive(t, { pick: () => t.id("B") }).confirms === 1, "確認は1回")
        oppAttack(t, "A")
        oppAttack(t, "B")
    },
    expect: [
        "自分.ムーンショウウオ.場所: フィールド → なし",
        "自分.手札: なし → ムーンショウウオ",
        "自分.リザーブ: 10 → 12",
        "自分.ライフ: 5 → 4",
        "相手.A.疲労: false → true",
        "相手.B.疲労: false → true",
    ],
})

console.log("=== 10. 対話・Lv1・断る：手札に戻らず、2体のアタックでライフが2減る ===")
scenario({
    name: "moon-decline",
    start: { turn: "opp", interactive: true, me: moonSide(1), opp: oppAB },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        const rec = drive(t, { confirm: false })
        assert(rec.confirms === 1 && rec.targets.length === 0, "確認は1回、対象選択は出ない")
        oppAttack(t, "A")
        oppAttack(t, "B")
    },
    expect: ["自分.ライフ: 5 → 3", "自分.リザーブ: 10 → 12", "相手.A.疲労: false → true", "相手.B.疲労: false → true"],
})

console.log("=== 11. 非対話・Lv1・相手スピリット1体：払えるので自動で戻し、そのスピリットのアタックではライフが減らない ===")
scenario({
    name: "moon-auto",
    start: { turn: "opp", me: moonSide(1), opp: { spirits: [{ card: VANILLA, label: "A" }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        assert(drive(t).confirms === 0, "非対話は確認なし")
        oppAttack(t, "A")
    },
    expect: [
        "自分.ムーンショウウオ.場所: フィールド → なし",
        "自分.手札: なし → ムーンショウウオ",
        "自分.リザーブ: 10 → 11",
        "相手.A.疲労: false → true",
    ],
})

console.log("=== 12. 対話・Lv2（コア3個）：Lv2でも同じ。戻ったコア3個がリザーブに入る ===")
scenario({
    name: "moon-lv2",
    start: { turn: "opp", interactive: true, me: moonSide(3), opp: oppAB },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        assert(drive(t, { pick: () => t.id("A") }).confirms === 1, "確認は1回")
        oppAttack(t, "A")
    },
    expect: [
        "自分.ムーンショウウオ.場所: フィールド → なし",
        "自分.手札: なし → ムーンショウウオ",
        "自分.リザーブ: 10 → 13",
        "相手.A.疲労: false → true",
    ],
})

console.log("=== 13. 自分のアタックステップ：『相手のアタックステップ』ではないので確認も出ず、何も起きない ===")
scenario({
    name: "moon-own-turn",
    start: { turn: "me", interactive: true, me: moonSide(1), opp: oppAB },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        assert(drive(t).confirms === 0, "自分のターンでは確認なし")
    },
    expect: [],
})

// ───────────────────────── BS04-101 ミストカーテン ─────────────────────────
console.log("=== BS04-101 ミストカーテン（フラッシュ） ===")

// 相手がAでアタック → 自分がフラッシュで使用 → 対象を選ぶ。その後の相手のアタックも続ける
function mistRun(t: Ctx, pickLabel: string, thenB: boolean) {
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("A") })
    t.act("me", { type: "castMagic", handIndex: 0 })
    const rec = drive(t, { pick: () => t.id(pickLabel) })
    assert(rec.targets.length === 1, "対象選択が1回出る")
    assert(rec.targets[0]?.byMe === true, "選ぶのは魔法の持ち主（自分）")
    const cands = rec.targets[0]?.candidates ?? []
    assert(cands.length === 2 && cands.includes(t.id("A")) && cands.includes(t.id("B")), "候補は相手のスピリット2体")
    t.closeFlash()
    drive(t)
    if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" })
    drive(t)
    if (thenB) oppAttack(t, "B")
}
const mistBase = ["自分.手札: ミストカーテン → なし", "自分.トラッシュ: なし → ミストカーテン", "自分.トラッシュのコア: 0 → 2", "相手.A.疲労: false → true"]

console.log("=== 14. 対話・Bを指定（アタック中のAではない）：Aのアタックでライフが減る ===")
scenario({
    name: "mist-pick-b",
    start: { turn: "opp", interactive: true, me: { hand: [MIST] }, opp: oppAB },
    steps: (t) => mistRun(t, "B", false),
    expect: [...mistBase, "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 9"], // コスト2を払い、ライフ1がリザーブに入る
})

console.log("=== 15. 対話・Aを指定（アタック中）：Aのアタックでライフが減らない ===")
scenario({
    name: "mist-pick-a",
    start: { turn: "opp", interactive: true, me: { hand: [MIST] }, opp: oppAB },
    steps: (t) => mistRun(t, "A", false),
    expect: [...mistBase, "自分.リザーブ: 10 → 8"],
})

console.log("=== 16. 対話・Aを指定してそのあとBがアタック：指定したAだけが守られ、Bでは減る ===")
scenario({
    name: "mist-a-then-b",
    start: { turn: "opp", interactive: true, me: { hand: [MIST] }, opp: oppAB },
    steps: (t) => mistRun(t, "A", true),
    expect: [...mistBase, "相手.B.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 9"],
})

console.log("=== 17. 対話・Bを指定してAがアタック、そのあとBがアタック：Aでは減り、指定したBでは減らない ===")
scenario({
    name: "mist-b-then-b",
    start: { turn: "opp", interactive: true, me: { hand: [MIST] }, opp: oppAB },
    steps: (t) => mistRun(t, "B", true),
    expect: [...mistBase, "相手.B.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 9"],
})

console.log("=== 18. 非対話・相手スピリット1体：自動でそのスピリットが指定され、ライフが減らない ===")
scenario({
    name: "mist-auto",
    start: { turn: "opp", me: { hand: [MIST] }, opp: { spirits: [{ card: VANILLA, label: "A" }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("A") })
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.closeFlash()
        if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" })
    },
    expect: [...mistBase, "自分.リザーブ: 10 → 8"],
})

// ───────────────────────── BS14-103 幻影氷結晶 ─────────────────────────
console.log("=== BS14-103 幻影氷結晶（バースト後のフラッシュ効果） ===")

// 相手Aが自分のブロッカーVをBPで破壊 → バースト発動 → 続けて相手のBがアタック
const crystalOpp = { spirits: [{ card: VANILLA, label: "A", cores: 2 }, { card: VANILLA, label: "B" }] }
function crystalRun(t: Ctx, policy: Policy): Rec {
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("A") })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id("V") })
    t.closeFlash()
    const rec = drive(t, policy)
    t.closeFlash()
    const more = drive(t, policy)
    rec.confirms += more.confirms
    rec.targets.push(...more.targets)
    oppAttack(t, "B", policy)
    return rec
}
const crystalBase = [
    "自分.V.場所: フィールド → なし",
    "自分.バースト: 幻影氷結晶 → なし",
    "自分.トラッシュ: なし → 幻影氷結晶", // 破壊されたロクケラトプスは手札へ
    "自分.手札: なし → ロクケラトプス",
    "相手.A.疲労: false → true",
    "相手.B.疲労: false → true",
]
const crystalMe = (reserve: number) => ({ reserve, spirits: [{ card: VANILLA, label: "V" }], burst: CRYSTAL })

console.log("=== 19. 対話・Bを指定：確認は発動とコスト支払いの2回、指定は自分が選ぶ。Bのアタックでライフが減らない ===")
scenario({
    name: "crystal-pick-b",
    start: { turn: "opp", interactive: true, me: crystalMe(10), opp: crystalOpp },
    steps(t) {
        const rec = crystalRun(t, { pick: () => t.id("B") })
        assert(rec.targets.length === 1 && rec.targets[0]?.byMe === true, "指定は持ち主（自分）が選ぶ")
        assert(rec.targets[0]?.candidates.length === 2, "候補は相手のスピリット2体")
        assert(rec.confirms === 2, `確認は2回（バースト発動＋コストを払うか）（実際 ${rec.confirms} 回）`)
    },
    // V のコア1個がリザーブへ、コスト2を支払う
    expect: [...crystalBase, "自分.リザーブ: 10 → 9", "自分.トラッシュのコア: 0 → 2"],
})

console.log("=== 20. 対話・Aを指定：Bのアタックでライフが減る ===")
scenario({
    name: "crystal-pick-a",
    start: { turn: "opp", interactive: true, me: crystalMe(10), opp: crystalOpp },
    steps(t) {
        const rec = crystalRun(t, { pick: () => t.id("A") })
        assert(rec.targets.length === 1 && rec.targets[0]?.byMe === true, "指定は持ち主（自分）が選ぶ")
    },
    // リザーブは +1(Vのコア) −2(コスト) +1(ライフ) で変わらない
    expect: [...crystalBase, "自分.ライフ: 5 → 4", "自分.トラッシュのコア: 0 → 2"],
})

console.log("=== 21. 対話・リザーブ0でコストが払えない：確認は出て、押しても不発（手札に戻るところまでは起きる）。Bのアタックでライフが減る ===")
scenario({
    name: "crystal-cannot-pay",
    start: { turn: "opp", interactive: true, me: crystalMe(0), opp: crystalOpp },
    steps(t) {
        const rec = crystalRun(t, {})
        assert(rec.targets.length === 0, "対象選択は出ない")
        assert(rec.confirms === 2, `払えなくても確認は出る（実際 ${rec.confirms} 回）`)
    },
    // V のコア1個がリザーブへ、Bのアタックのライフ1個もリザーブへ
    expect: [...crystalBase, "自分.ライフ: 5 → 4", "自分.リザーブ: 0 → 2"],
})

console.log("=== 22. 対話・払えるが断る：コストは払わず指定もなし。Bのアタックでライフが減る ===")
scenario({
    name: "crystal-decline",
    start: { turn: "opp", interactive: true, me: crystalMe(10), opp: crystalOpp },
    steps(t) {
        // 発動の確認は押し、コストを払う確認だけ断る
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("A") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("V") })
        t.closeFlash()
        let n = 0
        while (t.state.pendingChoice) {
            const pc = t.state.pendingChoice
            n++
            assert(pc.kind === "option" && pc.pid === t.me, "選択待ちは自分の確認")
            t.act("me", n === 1 ? { type: "resolveChoice", option: (pc.options ?? ["発動する"])[0]! } : { type: "resolveChoice" })
            if (n > 4) throw new Error("確認が終わらない")
        }
        t.closeFlash()
        drive(t)
        oppAttack(t, "B")
        assert(n === 2, `確認は2回（実際 ${n} 回）`)
    },
    expect: [...crystalBase, "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 12"],
})

console.log("すべてのチェックに合格しました 🎉（part466）")
