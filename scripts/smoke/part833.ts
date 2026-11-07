// smoke パート833（BS23 B1：【抜刀】の召喚時版・アタック時版。公式Q&A Q794〜Q802）
// 効果文だけから書いた期待値役のテスト。実装に合わせて期待値を変えないこと
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"
import { appear, drive, handRow, left, settle, trashRow } from "./b1helpers"

const SHOOT = "BS23-005" // 流星の剣聖シューティングスター（赤・コスト5・剣使・抜刀＝召喚時・Lv1 BP4000）
const MINO = "BS23-033" // 機甲剣聖ミノタウロス（白・コスト5・剣使・抜刀＝召喚時・Lv1 BP3000）
const DRACO = "BS23-002" // 恐竜剣聖ドラコレックス（赤・コスト3・剣使・抜刀＝アタック時・Lv1 BP3000）
const SHUBU = "BS23-050" // 異海剣聖シュブ・ニグラ（青・コスト4・剣使・抜刀＝アタック時・Lv1 BP3000）
const X01 = "BS23-X01" // 龍輝神シャイニング・ドラゴン・オーバーレイ（コスト8・剣使。Lv1 から剣使はブレイヴ2つまで合体できる）
const NICHI = "BS23-060" // 翡翠の小太刀 日輪丸（剣刃ブレイヴ・コスト4・合体条件コスト4以上・BP3000）
const SUN = "BS23-055" // 太陽剣カーディナル・サン（剣刃ブレイヴ・コスト4・合体条件剣使・BP3000。直接合体の召喚時に BP6000以下を破壊）
const BREAKER = "BS23-062" // 極光剣ソルブレイカー（剣刃ブレイヴ・コスト4・合体条件コスト3以上・BP4000）
const HALO = "BS23-063" // 光輪剣エンジェルハイロゥ（剣刃ブレイヴ・コスト4・合体条件コスト4以上・BP2000）
const ZAGNA = "BS23-057" // ザグナ・オリックス（無魔ブレイヴ・コスト4・合体条件コスト4以上・剣刃ではない）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・BP3000・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    const eq = (id: string, name: string, type: string) => assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}`)
    eq(SHOOT, "流星の剣聖シューティングスター", "spirit")
    eq(MINO, "機甲剣聖ミノタウロス", "spirit")
    eq(DRACO, "恐竜剣聖ドラコレックス", "spirit")
    eq(SHUBU, "異海剣聖シュブ・ニグラ", "spirit")
    eq(X01, "龍輝神シャイニング・ドラゴン・オーバーレイ", "spirit")
    eq(NICHI, "翡翠の小太刀 日輪丸", "brave")
    eq(SUN, "太陽剣カーディナル・サン", "brave")
    eq(BREAKER, "極光剣ソルブレイカー", "brave")
    eq(HALO, "光輪剣エンジェルハイロゥ", "brave")
    eq(ZAGNA, "ザグナ・オリックス", "brave")
    eq(ROKU, "ロクケラトプス", "spirit")
    eq(METAL, "メタルバーン", "spirit")
    assert(getCard(NICHI).family.includes("剣刃") && getCard(SUN).family.includes("剣刃") && getCard(BREAKER).family.includes("剣刃") && getCard(HALO).family.includes("剣刃"), "4枚は剣刃")
    assert(!getCard(ZAGNA).family.includes("剣刃"), "ザグナは剣刃ではない")
    assert(getCard(DRACO).cost === 3 && getCard(SHOOT).cost === 5, "ドラコレックスはコスト3、シューティングスターはコスト5")
}

// ---- 召喚時版（シューティングスターを手札の先頭から召喚する） ----
const summonFirst = (t: ScenarioCtx) => t.act("me", { type: "summon", handIndex: 0 })

console.log("=== A1. 手札の剣刃ブレイヴをスピリット状態でコストなしで出せる ===")
scenario({
    name: "batto-summon-spirit-state",
    start: { interactive: true, me: { hand: [SHOOT, NICHI] } },
    steps(t) {
        summonFirst(t)
        drive(t, { card: NICHI })
    },
    expect: [
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 5",
        handRow("自分", [SHOOT, NICHI], []),
        ...appear("自分", SHOOT, { cores: 1, bp: 4000 }),
        ...appear("自分", NICHI, { cores: 1, bp: 3000 }),
    ],
})

console.log("=== A2. 【抜刀】を発揮したスピリット自身へ直接合体して出せる（コストは払わない） ===")
scenario({
    name: "batto-summon-combine-self",
    start: { interactive: true, me: { hand: [SHOOT, NICHI] } },
    steps(t) {
        summonFirst(t)
        drive(t, { card: NICHI, picks: [SHOOT] })
    },
    expect: [
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        handRow("自分", [SHOOT, NICHI], []),
        ...appear("自分", SHOOT, { cores: 1, bp: 7000 }),
        ...appear("自分", NICHI, { where: "合体", cores: 0 }),
    ],
})

console.log("=== A3. 【抜刀】を発揮したスピリット以外の自分のスピリットに直接合体でき、ブレイヴの召喚時効果が発揮される（Q796・Q797） ===")
scenario({
    name: "batto-summon-combine-other-and-summon-effect",
    start: {
        interactive: true,
        me: { hand: [SHOOT, SUN], spirits: [{ card: MINO, label: "ミノ" }] },
        opp: { spirits: [{ card: ROKU }] },
    },
    steps(t) {
        summonFirst(t)
        drive(t, { card: SUN, picks: [MINO] })
    },
    expect: [
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        handRow("自分", [SHOOT, SUN], []),
        ...appear("自分", SHOOT, { cores: 1, bp: 4000 }),
        ...appear("自分", SUN, { where: "合体", cores: 0 }),
        "自分.ミノ.BP: 3000 → 6000",
        left("相手", "ロクケラトプス"),
        "相手.リザーブ: 10 → 11",
        trashRow("相手", [], [ROKU]),
    ],
})

console.log("=== A4. スピリット状態で出したときは「直接合体するように召喚したとき」の効果は発揮されない（Q797の裏） ===")
scenario({
    name: "batto-summon-spirit-state-no-direct-effect",
    start: {
        interactive: true,
        me: { hand: [SHOOT, SUN] },
        opp: { spirits: [{ card: ROKU }] },
    },
    steps(t) {
        summonFirst(t)
        drive(t, { card: SUN })
    },
    expect: [
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 5",
        handRow("自分", [SHOOT, SUN], []),
        ...appear("自分", SHOOT, { cores: 1, bp: 4000 }),
        ...appear("自分", SUN, { cores: 1, bp: 3000 }),
    ],
})

console.log("=== A5. 剣刃でないブレイヴは選べない ===")
scenario({
    name: "batto-summon-not-kenjin",
    start: { interactive: true, me: { hand: [SHOOT, ZAGNA] } },
    steps(t) {
        summonFirst(t)
        drive(t, { card: ZAGNA })
    },
    expect: [
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        handRow("自分", [SHOOT, ZAGNA], [ZAGNA]),
        ...appear("自分", SHOOT, { cores: 1, bp: 4000 }),
    ],
})

console.log("=== A6. 出さないことも選べる（任意） ===")
scenario({
    name: "batto-summon-decline",
    start: { interactive: true, me: { hand: [SHOOT, NICHI] } },
    steps(t) {
        summonFirst(t)
        drive(t, { decline: true })
    },
    expect: [
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        handRow("自分", [SHOOT, NICHI], [NICHI]),
        ...appear("自分", SHOOT, { cores: 1, bp: 4000 }),
    ],
})

console.log("=== A7. 手札に合体可能な剣刃ブレイヴが無ければ何も起きない（相手側でも同じ） ===")
scenario({
    name: "batto-summon-no-brave-in-hand",
    start: { interactive: true, me: { hand: [SHOOT, ROKU] } },
    steps(t) {
        summonFirst(t)
        drive(t, {})
    },
    expect: [
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        handRow("自分", [SHOOT, ROKU], [ROKU]),
        ...appear("自分", SHOOT, { cores: 1, bp: 4000 }),
    ],
})

// ---- アタック時版（ドラコレックス・シュブ・ニグラ） ----
const attackWith = (t: ScenarioCtx, attacker: string, blocker: string | null, want = {}) => {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id(attacker) })
    if (blocker !== null) t.act("opp", { type: "block", instanceId: t.id(blocker) })
    else t.act("opp", { type: "takeLife" })
    settle(t, want)
}

console.log("=== B1. BPを比べ相手のスピリットだけを破壊したとき、剣刃ブレイヴをスピリット状態で出せる ===")
scenario({
    name: "batto-attack-spirit-state",
    start: {
        interactive: true,
        me: { hand: [BREAKER], spirits: [{ card: DRACO, label: "ドラコ" }] },
        opp: { spirits: [{ card: ROKU }] },
    },
    steps(t) {
        attackWith(t, "ドラコ", "ロクケラトプス", { card: BREAKER })
    },
    expect: [
        "自分.ドラコ.疲労: false → true",
        "自分.リザーブ: 10 → 9",
        handRow("自分", [BREAKER], []),
        ...appear("自分", BREAKER, { cores: 1, bp: 4000 }),
        left("相手", "ロクケラトプス"),
        "相手.リザーブ: 10 → 11",
        trashRow("相手", [], [ROKU]),
    ],
})

console.log("=== B2. アタック時版でも【抜刀】を発揮したスピリットへ直接合体して出せる ===")
scenario({
    name: "batto-attack-combine",
    start: {
        interactive: true,
        me: { hand: [BREAKER], spirits: [{ card: DRACO, label: "ドラコ" }] },
        opp: { spirits: [{ card: ROKU }] },
    },
    steps(t) {
        attackWith(t, "ドラコ", "ロクケラトプス", { card: BREAKER, picks: [DRACO] })
    },
    expect: [
        "自分.ドラコ.疲労: false → true",
        "自分.ドラコ.BP: 3000 → 7000",
        handRow("自分", [BREAKER], []),
        ...appear("自分", BREAKER, { where: "合体", cores: 0 }),
        left("相手", "ロクケラトプス"),
        "相手.リザーブ: 10 → 11",
        trashRow("相手", [], [ROKU]),
    ],
})

console.log("=== B3. 相打ち（自分のスピリットも破壊された）なら出ない ===")
scenario({
    name: "batto-attack-both-destroyed",
    start: {
        interactive: true,
        me: { hand: [BREAKER], spirits: [{ card: DRACO, label: "ドラコ" }] },
        opp: { spirits: [{ card: METAL }] },
    },
    steps(t) {
        attackWith(t, "ドラコ", "メタルバーン", { card: BREAKER })
    },
    expect: [
        left("自分", "ドラコ"),
        "自分.リザーブ: 10 → 11",
        trashRow("自分", [], [DRACO]),
        left("相手", "メタルバーン"),
        "相手.リザーブ: 10 → 11",
        trashRow("相手", [], [METAL]),
    ],
})

console.log("=== B4. ブロックされずライフを減らしただけなら出ない ===")
scenario({
    name: "batto-attack-unblocked",
    start: {
        interactive: true,
        me: { hand: [BREAKER], spirits: [{ card: DRACO, label: "ドラコ" }] },
        opp: { spirits: [{ card: ROKU }] },
    },
    steps(t) {
        attackWith(t, "ドラコ", null, { card: BREAKER })
    },
    expect: ["自分.ドラコ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== B5. 合体条件を満たさない剣刃ブレイヴ（コスト3のドラコレックスにコスト4以上の条件）は選べない ===")
scenario({
    name: "batto-attack-condition-mismatch",
    start: {
        interactive: true,
        me: { hand: [HALO, NICHI], spirits: [{ card: DRACO, label: "ドラコ" }] },
        opp: { spirits: [{ card: ROKU }] },
    },
    steps(t) {
        attackWith(t, "ドラコ", "ロクケラトプス", { card: HALO })
    },
    expect: [
        "自分.ドラコ.疲労: false → true",
        left("相手", "ロクケラトプス"),
        "相手.リザーブ: 10 → 11",
        trashRow("相手", [], [ROKU]),
    ],
})

console.log("=== B6. 剣刃でないブレイヴは、合体条件を満たしていても選べない ===")
scenario({
    name: "batto-attack-not-kenjin",
    start: {
        interactive: true,
        me: { hand: [ZAGNA], spirits: [{ card: SHUBU, label: "シュブ" }] },
        opp: { spirits: [{ card: ROKU }] },
    },
    steps(t) {
        attackWith(t, "シュブ", "ロクケラトプス", { card: ZAGNA })
    },
    expect: [
        "自分.シュブ.疲労: false → true",
        left("相手", "ロクケラトプス"),
        "相手.リザーブ: 10 → 11",
        trashRow("相手", [], [ROKU]),
    ],
})

console.log("=== B7. 出さないことも選べる（アタック時版） ===")
scenario({
    name: "batto-attack-decline",
    start: {
        interactive: true,
        me: { hand: [BREAKER], spirits: [{ card: SHUBU, label: "シュブ" }] },
        opp: { spirits: [{ card: ROKU }] },
    },
    steps(t) {
        attackWith(t, "シュブ", "ロクケラトプス", { decline: true })
    },
    expect: [
        "自分.シュブ.疲労: false → true",
        left("相手", "ロクケラトプス"),
        "相手.リザーブ: 10 → 11",
        trashRow("相手", [], [ROKU]),
    ],
})

// ---- 合体条件のコストの数え方（Q800・Q802）。先にメインステップでソルブレイカーを直接合体させてからアタックする ----
console.log("=== C1. 合体数が埋まっているなら元のコストで数える（Q800）。コスト3のドラコレックスは、コスト4のブレイヴが合体していてもコスト4以上の条件を満たさない ===")
scenario({
    name: "batto-cost-full-slots-uses-printed-cost",
    start: {
        interactive: true,
        me: { hand: [BREAKER, HALO], spirits: [{ card: DRACO, label: "ドラコ" }] },
        opp: { spirits: [{ card: ROKU }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ドラコ") })
        drive(t, { decline: true })
        attackWith(t, "ドラコ", "ロクケラトプス", { card: HALO, picks: [DRACO] })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ドラコ.疲労: false → true",
        "自分.ドラコ.BP: 3000 → 7000",
        handRow("自分", [BREAKER, HALO], [HALO]),
        ...appear("自分", BREAKER, { where: "合体", cores: 0 }),
        left("相手", "ロクケラトプス"),
        "相手.リザーブ: 10 → 11",
        trashRow("相手", [], [ROKU]),
    ],
})

console.log("=== C2. 合体数に空きがあるなら合体中のブレイヴ込みのコストで数える（Q802）。X01 でブレイヴ2つまで合体できる剣使なら、コスト3＋4＝7でコスト4以上の条件を満たす ===")
scenario({
    name: "batto-cost-free-slot-includes-braves",
    start: {
        interactive: true,
        me: { hand: [BREAKER, HALO], spirits: [{ card: DRACO, label: "ドラコ" }, { card: X01, label: "X01" }] },
        opp: { spirits: [{ card: ROKU }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ドラコ") })
        drive(t, { decline: true })
        attackWith(t, "ドラコ", "ロクケラトプス", { card: HALO, picks: [DRACO] })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ドラコ.疲労: false → true",
        "自分.ドラコ.BP: 3000 → 9000",
        handRow("自分", [BREAKER, HALO], []),
        ...appear("自分", BREAKER, { where: "合体", cores: 0 }),
        ...appear("自分", HALO, { where: "合体", cores: 0 }),
        left("相手", "ロクケラトプス"),
        "相手.リザーブ: 10 → 11",
        trashRow("相手", [], [ROKU]),
    ],
})

console.log("すべてのチェックに合格しました 🎉（part833）")
