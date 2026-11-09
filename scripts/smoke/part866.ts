// smoke パート866（BS23 黄バッチ：071 聖ミカファール大聖堂・081 サンダーウォール・X13-10 ヴィエルジェ。効果文だけを根拠にした期待値。docs/design/BS23_PLAN.md §1・§2）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const CATHEDRAL = "BS23-071" // 聖ミカファール大聖堂（Lv1 は 0 コア、Lv2 は 1 コア）
const THUNDER = "BS23-081" // サンダーウォール（フラッシュマジック・コスト3・黄軽減2）
const VIERGE = "X13-10" // 渚の乙女ヴィエルジェ（コスト6）
const TRICK = "X13-09" // 渚のトリックスター（コスト6・名前に「渚」）
const MAIYA = "BS23-037" // 舞踏の魔女マイヤ
const BEHE = "BS21-X05" // 陸獣神ベヒモス
const ORION = "BS10-060" // 巨人猟兵オライオン（青・コスト7・召喚時に相手のデッキ12枚破棄）
const ANGEL = "BS10-048" // 天使パワー（天霊・コスト5・Lv1 BP3000）
const MARIEL = "BS23-040" // 人形遣いの天使マリエル（天霊・コスト3）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1。3 コアで Lv3 BP4000）
const METAL = "BS01-008" // メタルバーン（赤・3 コアで Lv2 BP4000）
const BOJA = "BS21-038" // ボジャノーイ（黄・コスト2・Lv1 BP2000）
const TORN = "BS10-009" // トルネードラ（赤・3 コアで Lv2 BP9000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(CATHEDRAL).name === "聖ミカファール大聖堂" && getCard(CATHEDRAL).type === "nexus", "CATHEDRAL")
    assert(getCard(THUNDER).name === "サンダーウォール" && getCard(THUNDER).flash === true && getCard(THUNDER).cost === 3, "THUNDER")
    assert(getCard(VIERGE).name === "渚の乙女ヴィエルジェ" && getCard(TRICK).name === "渚のトリックスター", "VIERGE / TRICK")
    assert(getCard(TRICK).cost === 6 && getCard(TRICK).levels[0]!.bp === 3000, "TRICK")
    assert(getCard(ORION).name === "巨人猟兵オライオン" && getCard(ORION).cost === 7 && getCard(ORION).levels[0]!.bp === 6000, "ORION")
    assert(getCard(ANGEL).family.includes("天霊") && getCard(ANGEL).cost === 5, "ANGEL")
    assert(getCard(MARIEL).family.includes("天霊") && getCard(MARIEL).cost === 3, "MARIEL")
    assert(getCard(TORN).levels[1]!.cores === 3 && getCard(TORN).levels[1]!.bp === 9000, "TORN")
}

const handIdx = (t: ScenarioCtx, cardId: string) => t.state.players[t.me].hand.indexOf(cardId)
const names = (n: number, cardId: string) => Array.from({ length: n }, () => getCard(cardId).name).join("、")

// 相手のターン：相手の攻撃を自分がブロックする（ブロック後のフラッシュで止める＝バトルはまだ解決しない）
const oppAttackBlocked = (t: ScenarioCtx, blocker: string, resolve: boolean) => {
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("A") })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id(blocker) })
    if (resolve) t.closeFlash()
}

// ───────────── 071 聖ミカファール大聖堂 ─────────────
const orionRows = (side: "自分" | "相手") => [
    `${side}.手札: ${getCard(ORION).name} → なし`, `${side}.リザーブ: 10 → 2`, `${side}.トラッシュのコア: 0 → 7`,
    `${side}.巨人猟兵オライオン.場所: なし → フィールド`, `${side}.巨人猟兵オライオン.疲労: なし → false`, `${side}.巨人猟兵オライオン.コア: なし → 1`,
    `${side}.巨人猟兵オライオン.Lv: なし → 1`, `${side}.巨人猟兵オライオン.BP: なし → 6000`,
]
console.log("=== 1. 071：お互いのデッキは破棄されない（対照：無ければ相手のデッキが12枚破棄される） ===")
scenario({
    name: "cathedral-no-mill-opp-deck",
    start: { me: { hand: [ORION], nexuses: [{ card: CATHEDRAL, label: "大聖堂", cores: 1 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: orionRows("自分"),
})
scenario({
    name: "cathedral-no-mill-control",
    start: { me: { hand: [ORION] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...orionRows("自分"), "相手.デッキ枚数: 40 → 28", `相手.トラッシュ: なし → ${names(12, VAN)}`],
})
console.log("=== 2. 071：自分のデッキも破棄されない（相手のターン、相手側のネクサス） ===")
scenario({
    name: "cathedral-no-mill-own-deck",
    start: { turn: "opp", opp: { hand: [ORION], nexuses: [{ card: CATHEDRAL, label: "大聖堂", cores: 1 }] } },
    steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
    expect: orionRows("相手"),
})
console.log("=== 3. 071：効果で疲労しない。マイヤの「疲労させることで」は払えない（Q22553） ===")
scenario({
    name: "cathedral-no-exhaust-cost",
    start: { me: { hand: [BEHE], spirits: [{ card: MAIYA, label: "マイヤ" }], nexuses: [{ card: CATHEDRAL, label: "大聖堂", cores: 1 }] } },
    steps: (t) => t.actRejected("me", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [t.id("マイヤ")] }),
    expect: [],
})
console.log("=== 4. 071：アタック・ブロックの宣言による疲労は止めない ===")
scenario({
    name: "cathedral-attack-block-rest",
    start: {
        turn: "opp",
        me: { spirits: [{ card: BOJA, label: "ボジャ" }], nexuses: [{ card: CATHEDRAL, label: "大聖堂", cores: 1 }] },
        opp: { spirits: [{ card: VAN, label: "A" }] },
    },
    steps: (t) => oppAttackBlocked(t, "ボジャ", false),
    expect: ["相手.A.疲労: false → true", "自分.ボジャ.疲労: false → true"],
})

// Lv2 の効果：天霊・コスト5以上の自分のスピリットが相手によって破壊され、トラッシュに置かれたとき2枚引く
const oppMetal = { spirits: [{ card: METAL, label: "A", cores: 3 }] }
const angelDestroyed = ["自分.天使パワー.場所: フィールド → なし", "自分.トラッシュ: なし → 天使パワー", "自分.リザーブ: 10 → 11", "相手.A.疲労: false → true"]
console.log("=== 5. 071 Lv2：相手のターン、天霊コスト5以上が相手によって破壊されたら2枚引く ===")
scenario({
    name: "cathedral-draw2-opp-turn",
    start: { turn: "opp", me: { spirits: [{ card: ANGEL, label: "天使パワー" }], nexuses: [{ card: CATHEDRAL, label: "大聖堂", cores: 1 }] }, opp: oppMetal },
    steps: (t) => oppAttackBlocked(t, "天使パワー", true),
    expect: [...angelDestroyed, `自分.手札: なし → ${names(2, VAN)}`, "自分.デッキ枚数: 40 → 38"],
})
console.log("=== 6. 071 Lv2：自分のターンでも（お互いのアタックステップ） ===")
scenario({
    name: "cathedral-draw2-own-turn",
    start: { me: { spirits: [{ card: ANGEL, label: "天使パワー" }], nexuses: [{ card: CATHEDRAL, label: "大聖堂", cores: 1 }] }, opp: oppMetal },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("天使パワー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("A") })
        t.closeFlash()
    },
    expect: [
        "自分.天使パワー.場所: フィールド → なし", "自分.トラッシュ: なし → 天使パワー", "自分.リザーブ: 10 → 11",
        `自分.手札: なし → ${names(2, VAN)}`, "自分.デッキ枚数: 40 → 38", "相手.A.疲労: false → true",
    ],
})
console.log("=== 7. 071：Lv1 なら引かない／天霊でもコスト4以下なら引かない ===")
scenario({
    name: "cathedral-draw2-lv1",
    start: { turn: "opp", me: { spirits: [{ card: ANGEL, label: "天使パワー" }], nexuses: [{ card: CATHEDRAL, label: "大聖堂", cores: 0 }] }, opp: oppMetal },
    steps: (t) => oppAttackBlocked(t, "天使パワー", true),
    expect: angelDestroyed,
})
scenario({
    name: "cathedral-draw2-cost3",
    start: { turn: "opp", me: { spirits: [{ card: MARIEL, label: "マリエル" }], nexuses: [{ card: CATHEDRAL, label: "大聖堂", cores: 1 }] }, opp: oppMetal },
    steps: (t) => oppAttackBlocked(t, "マリエル", true),
    expect: ["自分.マリエル.場所: フィールド → なし", "自分.トラッシュ: なし → 人形遣いの天使マリエル", "自分.リザーブ: 10 → 11", "相手.A.疲労: false → true"],
})

// ───────────── 081 サンダーウォール ─────────────
// 相手のターン。ボジャノーイ（黄シンボル1）で軽減され、コスト3→2。バトルのフラッシュで使う
const thunderStart = (life: number) => ({
    turn: "opp" as const,
    me: { life, hand: [THUNDER], spirits: [{ card: BOJA, label: "ボジャ" }] },
    opp: { spirits: [{ card: VAN, label: "A" }, { card: VAN, label: "B" }] },
})
function thunderBattle(t: ScenarioCtx): void {
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("A") })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id("ボジャ") })
    if (t.state.priorityPlayer !== t.me) t.act("opp", { type: "pass" })
    t.act("me", { type: "castMagic", handIndex: handIdx(t, THUNDER), timing: "flash" })
    t.closeFlash()
}
const thunderRows = [
    "自分.手札: サンダーウォール → なし", "自分.トラッシュ: なし → サンダーウォール", "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 2",
    "自分.ボジャ.疲労: false → true", "相手.A.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11",
]
console.log("=== 8. 081：バトル終了時にライフのコアが2個以下なら、アタックステップを終了する（もう1体はアタックできない） ===")
scenario({
    name: "thunder-ends-attack-step",
    start: thunderStart(2),
    steps(t) {
        thunderBattle(t)
        t.actRejected("opp", { type: "attack", instanceId: t.id("B") })
    },
    expect: thunderRows,
})
console.log("=== 9. 081：ライフのコアが3個なら終了しない（もう1体がアタックできる） ===")
scenario({
    name: "thunder-life3-continues",
    start: thunderStart(3),
    steps(t) {
        thunderBattle(t)
        t.act("opp", { type: "attack", instanceId: t.id("B") })
    },
    expect: [...thunderRows, "相手.B.疲労: false → true"],
})

// ───────────── X13-10 渚の乙女ヴィエルジェ ─────────────
// 相手のターン：ロクケラトプス（3 コアで BP4000）のアタックを、自分のスピリットがブロックして破壊される
const oppA = { spirits: [{ card: VAN, label: "A", cores: 3 }] }
const oppAttack = (t: ScenarioCtx, blocker: string) => oppAttackBlocked(t, blocker, true)
const trickDestroyed = ["自分.渚のトリックスター.場所: フィールド → なし", "自分.トラッシュ: なし → 渚のトリックスター", "自分.リザーブ: 10 → 11", "相手.A.疲労: false → true"]
console.log("=== 10. X13-10：「渚」の自分のスピリットが相手によって破壊されたとき、ライフが5以下ならライフ+1 ===")
scenario({
    name: "vierge-life-gain",
    start: { turn: "opp", me: { spirits: [{ card: VIERGE, label: "ヴィエルジェ" }, { card: TRICK, label: "渚のトリックスター" }] }, opp: oppA },
    steps: (t) => oppAttack(t, "渚のトリックスター"),
    expect: [...trickDestroyed, "自分.ライフ: 5 → 6"],
})
console.log("=== 11. X13-10：ライフが6なら増えない／「渚」でないスピリットなら増えない ===")
scenario({
    name: "vierge-life6",
    start: { turn: "opp", me: { life: 6, spirits: [{ card: VIERGE, label: "ヴィエルジェ" }, { card: TRICK, label: "渚のトリックスター" }] }, opp: oppA },
    steps: (t) => oppAttack(t, "渚のトリックスター"),
    expect: trickDestroyed,
})
scenario({
    name: "vierge-not-nagisa",
    start: { turn: "opp", me: { spirits: [{ card: VIERGE, label: "ヴィエルジェ" }, { card: BOJA, label: "ボジャ" }] }, opp: oppA },
    steps: (t) => oppAttack(t, "ボジャ"),
    expect: ["自分.ボジャ.場所: フィールド → なし", "自分.トラッシュ: なし → ボジャノーイ", "自分.リザーブ: 10 → 11", "相手.A.疲労: false → true"],
})
console.log("=== 12. X13-10：自身も名前に「渚」と入っているので、自身が破壊されても発揮する ===")
scenario({
    name: "vierge-self",
    start: { turn: "opp", me: { spirits: [{ card: VIERGE, label: "ヴィエルジェ" }] }, opp: { spirits: [{ card: TORN, label: "A", cores: 3 }] } },
    steps: (t) => oppAttack(t, "ヴィエルジェ"),
    expect: [
        "自分.ヴィエルジェ.場所: フィールド → なし", "自分.トラッシュ: なし → 渚の乙女ヴィエルジェ", "自分.リザーブ: 10 → 11", "自分.ライフ: 5 → 6", "相手.A.疲労: false → true",
    ],
})
console.log("=== 13. X13-10：コア0の消滅は「相手によって破壊」ではない（Q18924） ===")
scenario({
    name: "vierge-vanish",
    start: { me: { spirits: [{ card: VIERGE, label: "ヴィエルジェ" }, { card: TRICK, label: "渚のトリックスター" }] } },
    steps: (t) => t.act("me", { type: "moveCore", instanceId: t.id("渚のトリックスター"), direction: "remove", confirmDeplete: true }),
    expect: ["自分.渚のトリックスター.場所: フィールド → なし", "自分.トラッシュ: なし → 渚のトリックスター", "自分.リザーブ: 10 → 11"],
})

console.log("すべてのチェックに合格しました 🎉（part866）")
