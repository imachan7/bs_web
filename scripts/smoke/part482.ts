// smoke パート482（BS13/BS14：実行実績0の効果節の場面テスト。効果文だけから期待値を書いた）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, name: string, type: string) => assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}（${type}）`)
    chk("BS13-015", "冥総裁ハーゲン", "spirit")
    chk("BS13-053", "モクバオー", "brave")
    chk("BS02-030", "兵隊アントマン", "spirit")
    chk("BS01-002", "ロクケラトプス", "spirit")
    assert(getCard(VANILLA).effects.length === 0, "VANILLAは効果なし")
}


const OPP_DRAW = ["相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11", "相手.手札: なし → ロクケラトプス"]
const ME_DRAW = ["自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 11", "自分.手札: なし → ロクケラトプス"]

console.log("=== A1. ハーゲン：自分のエンドステップに、自分のトラッシュから手札に戻る ===")
scenario({
    name: "hagen-own-end",
    start: { turn: "me", me: { trash: ["BS13-015"] } },
    steps: (t) => { t.act("me", { type: "endTurn" }) },
    expect: [...OPP_DRAW, "自分.トラッシュ: 冥総裁ハーゲン → なし", "自分.手札: なし → 冥総裁ハーゲン"],
})

console.log("=== A2. ハーゲン：相手のエンドステップでは戻らない ===")
scenario({
    name: "hagen-opp-end",
    start: { turn: "opp", me: { trash: ["BS13-015"] } },
    steps: (t) => { t.act("opp", { type: "endTurn" }) },
    expect: [...ME_DRAW],
})

console.log("=== A3. ハーゲン：相手のトラッシュにあるハーゲンは、自分のエンドステップでは戻らない ===")
scenario({
    name: "hagen-in-opp-trash",
    start: { turn: "me", opp: { trash: ["BS13-015"] } },
    steps: (t) => { t.act("me", { type: "endTurn" }) },
    expect: [...OPP_DRAW],
})

// ---- B モクバオー ----
const ANTMAN = "BS02-030" // 兵隊アントマン（緑・コスト3・【神速】）
const MOKUBA = "BS13-053"
console.log("=== B1. モクバオー：【神速】のスピリットが召喚されたら、疲労したモクバオーが回復する ===")
scenario({
    name: "mokuba-swift",
    start: { turn: "opp", me: { hand: [ANTMAN], spirits: [{ card: MOKUBA, rested: true }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "相手.ロクケラトプス.疲労: false → true",
        "自分.トラッシュのコア: 0 → 3",
        "自分.リザーブ: 10 → 6",
        "自分.手札: 兵隊アントマン → なし",
        "自分.兵隊アントマン.場所: なし → フィールド",
        "自分.兵隊アントマン.疲労: なし → false",
        "自分.兵隊アントマン.コア: なし → 1",
        "自分.兵隊アントマン.Lv: なし → 1",
        `自分.兵隊アントマン.BP: なし → ${getCard(ANTMAN).levels[0]!.bp + getCard(MOKUBA).levels[0]!.bp}`,
        "自分.モクバオー.疲労: true → false",
        "自分.モクバオー.場所: フィールド → 合体",
        "自分.モクバオー.BP: 4000 → なし",
    ],
})

console.log("=== B2. モクバオー：相手の【神速】スピリットの召喚では回復しない ===")
scenario({
    name: "mokuba-opp-swift",
    start: { turn: "opp", me: { spirits: [{ card: MOKUBA, rested: true }] }, opp: { hand: [ANTMAN], spirits: [{ card: VANILLA }] } },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.act("me", { type: "pass" })
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: [
        "相手.ロクケラトプス.疲労: false → true",
        "相手.トラッシュのコア: 0 → 3",
        "相手.リザーブ: 10 → 6",
        "相手.手札: 兵隊アントマン → なし",
        "相手.兵隊アントマン.場所: なし → フィールド",
        "相手.兵隊アントマン.疲労: なし → false",
        "相手.兵隊アントマン.コア: なし → 1",
        "相手.兵隊アントマン.Lv: なし → 1",
        "相手.兵隊アントマン.BP: なし → 1000",
    ],
})

// ---- C 巨人港 ----
const GIANT = "BS13-071"
const AURA = "BS01-135" // パワーオーラ（緑・コスト3・フラッシュ：1枚ドロー、全員BP+1000）
const TWO_AURAS = [
    "相手.デッキ枚数: 40 → 38",
    "相手.トラッシュ: なし → パワーオーラ、パワーオーラ",
    "相手.トラッシュのコア: 0 → 6",
    "相手.リザーブ: 10 → 4",
    "相手.手札: パワーオーラ、パワーオーラ → ロクケラトプス、ロクケラトプス",
]
console.log("=== C1. 巨人港 Lv2：相手がマジックを2回使用したら、その効果発揮後に相手のメインステップが終わる ===")
scenario({
    name: "giant-two-magics",
    start: { turn: "opp", me: { nexuses: [{ card: GIANT, cores: 2 }] }, opp: { hand: [AURA, AURA] } },
    steps: (t) => {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        assert(t.state.phase === "main", "1回目の後はまだメインステップ")
        t.act("opp", { type: "castMagic", handIndex: 0 })
        assert(t.state.phase === "attack", `2回目の効果発揮後にメインステップが終わる（実際 ${t.state.phase}）`)
        // 効果発揮後に終わるので、2回目のドローは済んでいる（TWO_AURAS のデッキ枚数）
    },
    expect: TWO_AURAS,
})

console.log("=== C2. 巨人港 Lv2：1回だけでは終わらない ===")
scenario({
    name: "giant-one-magic",
    start: { turn: "opp", me: { nexuses: [{ card: GIANT, cores: 2 }] }, opp: { hand: [AURA] } },
    steps: (t) => {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        assert(t.state.phase === "main", "1回ではメインステップは終わらない")
    },
    expect: [
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュ: なし → パワーオーラ",
        "相手.トラッシュのコア: 0 → 3",
        "相手.リザーブ: 10 → 7",
        "相手.手札: パワーオーラ → ロクケラトプス",
    ],
})

console.log("=== C3. 巨人港 Lv1（コア0）：Lv2の効果は無いので2回使っても終わらない ===")
scenario({
    name: "giant-lv1",
    start: { turn: "opp", me: { nexuses: [{ card: GIANT, cores: 0 }] }, opp: { hand: [AURA, AURA] } },
    steps: (t) => {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        t.act("opp", { type: "castMagic", handIndex: 0 })
        assert(t.state.phase === "main", "Lv1では2回使ってもメインステップは終わらない")
    },
    expect: TWO_AURAS,
})

console.log("=== C4. 巨人港 Lv2：自分のターンに自分が2回使っても終わらない ===")
scenario({
    name: "giant-own-turn",
    start: { turn: "me", me: { nexuses: [{ card: GIANT, cores: 2 }], hand: [AURA, AURA] } },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.act("me", { type: "castMagic", handIndex: 0 })
        assert(t.state.phase === "main", "自分のメインステップは終わらない")
    },
    expect: [
        "自分.デッキ枚数: 40 → 38",
        "自分.トラッシュ: なし → パワーオーラ、パワーオーラ",
        "自分.トラッシュのコア: 0 → 6",
        "自分.リザーブ: 10 → 4",
        "自分.手札: パワーオーラ、パワーオーラ → ロクケラトプス、ロクケラトプス",
    ],
})

// ---- D 賛美するパイプオルガン ----
const ORGAN = "BS14-085"
const CAVALRY = "BS06-103" // キャバルリー（白・コスト3・フラッシュ：疲労状態の自分のスピリットすべてを回復）
const BEETLE = "BS01-050" // ビートビートル（緑・コスト0・バニラ）
const GUN = "BS01-074" // バーサーカー・ガン（白・コスト1・バニラ）
const BULL = "BS03-071" // 戦闘獣ブルトップ（青・コスト0・バニラ）
const PIYON = "BS02-049" // ピヨン（黄・コスト0・バニラ）
console.log("=== 前提D: カードの機械確認 ===")
{
    assert(getCard(ORGAN).name === "賛美するパイプオルガン" && getCard(ORGAN).type === "nexus", "ORGANはパイプオルガン")
    assert(getCard(CAVALRY).name === "キャバルリー" && getCard(CAVALRY).type === "magic", "CAVALRYはキャバルリー")
    const vanilla = (id: string, name: string, color: string) => {
        const c = getCard(id)
        assert(c.name === name && c.type === "spirit" && c.colors.length === 1 && c.colors[0] === color && c.effects.length === 0, `${id}は${name}（${color}のバニラ）`)
    }
    vanilla(BEETLE, "ビートビートル", "green")
    vanilla(GUN, "バーサーカー・ガン", "white")
    vanilla(BULL, "戦闘獣ブルトップ", "blue")
    vanilla(PIYON, "ピヨン", "yellow")
}
const nameList = (...ids: string[]) => ids.map((c) => getCard(c).name).sort().join("、")
const restedFive = [
    { card: BEETLE, rested: true },
    { card: GUN, rested: true },
    { card: BULL, rested: true },
    { card: PIYON, rested: true },
    { card: VANILLA, rested: true, label: "赤" },
]
console.log("=== D1. オルガン Lv2：相手のターンに効果で回復した緑/白/青/赤のスピリットは破壊され、黄は残る ===")
scenario({
    name: "organ-lv2-opp-turn",
    start: { turn: "opp", me: { nexuses: [{ card: ORGAN, cores: 2 }] }, opp: { hand: [CAVALRY], spirits: restedFive } },
    steps: (t) => { t.act("opp", { type: "castMagic", handIndex: 0 }) },
    // キャバルリーのコスト3は、場の白シンボル（ガン）の軽減で2になる。破壊された4体のコア1個ずつはリザーブへ
    expect: [
        `相手.トラッシュ: なし → ${nameList("BS06-103", BEETLE, GUN, BULL, VANILLA)}`,
        "相手.手札: キャバルリー → なし",
        "相手.トラッシュのコア: 0 → 2",
        "相手.リザーブ: 10 → 12",
        "相手.ビートビートル.場所: フィールド → なし",
        "相手.バーサーカー・ガン.場所: フィールド → なし",
        "相手.戦闘獣ブルトップ.場所: フィールド → なし",
        "相手.赤.場所: フィールド → なし",
        "相手.ピヨン.疲労: true → false",
    ],
})

console.log("=== D2. オルガン Lv1（コア0）：回復しても破壊されない ===")
scenario({
    name: "organ-lv1",
    start: { turn: "opp", me: { nexuses: [{ card: ORGAN, cores: 0 }] }, opp: { hand: [CAVALRY], spirits: restedFive } },
    steps: (t) => { t.act("opp", { type: "castMagic", handIndex: 0 }) },
    expect: [
        `相手.トラッシュ: なし → ${nameList("BS06-103")}`,
        "相手.手札: キャバルリー → なし",
        "相手.トラッシュのコア: 0 → 2",
        "相手.リザーブ: 10 → 8",
        "相手.ビートビートル.疲労: true → false",
        "相手.バーサーカー・ガン.疲労: true → false",
        "相手.戦闘獣ブルトップ.疲労: true → false",
        "相手.ピヨン.疲労: true → false",
        "相手.赤.疲労: true → false",
    ],
})

console.log("=== D3. オルガン Lv2：自分のターンに自分が回復させたスピリットは（相手のターンではないので）破壊されない ===")
scenario({
    name: "organ-lv2-own-turn",
    start: { turn: "me", me: { nexuses: [{ card: ORGAN, cores: 2 }], hand: [CAVALRY], spirits: restedFive } },
    steps: (t) => { t.act("me", { type: "castMagic", handIndex: 0 }) },
    expect: [
        `自分.トラッシュ: なし → ${nameList("BS06-103")}`,
        "自分.手札: キャバルリー → なし",
        "自分.トラッシュのコア: 0 → 2",
        "自分.リザーブ: 10 → 8",
        "自分.ビートビートル.疲労: true → false",
        "自分.バーサーカー・ガン.疲労: true → false",
        "自分.戦闘獣ブルトップ.疲労: true → false",
        "自分.ピヨン.疲労: true → false",
        "自分.赤.疲労: true → false",
    ],
})

// ---- E サジット・アポロドラゴン ----
const SAGIT = "BS13-X01"
const HYOU = "BS13-054" // ヒョウ・カッチュー（ブレイヴ・緑・コスト4）
const LEO = "BS13-X04"
console.log("=== 前提E: カードの機械確認 ===")
{
    assert(getCard(SAGIT).name === "光龍騎神サジット・アポロドラゴン" && getCard(SAGIT).type === "spirit", "SAGITはサジット")
    assert(getCard(HYOU).name === "ヒョウ・カッチュー" && getCard(HYOU).type === "brave", "HYOUはヒョウ・カッチュー")
    assert(getCard(LEO).name === "獅機龍神ストライクヴルム・レオ" && getCard(LEO).levels.find((l) => l.level === 3)?.bp === 12000, "LEOはLv3でBP12000")
}
// 選択待ちに対して、候補の中から label のものを選んで答える
function pickByLabel(t: ScenarioCtx, labels: string[]) {
    for (const label of labels) {
        const pc = t.state.pendingChoice
        assert(pc !== null && pc.pid === t.me, `「${label}」を選ぶ選択待ちが自分に出ている`)
        if (!pc) return
        t.act("me", { type: "resolveChoice", instanceId: t.id(label) })
    }
}
const COMBINED_HYOU = ["自分.ヒョウ・カッチュー.BP: 0 → なし", "自分.ヒョウ・カッチュー.Lv: 0 → 1", "自分.ヒョウ・カッチュー.場所: フィールド → 合体"]
const COMBINED_MOKUBA = ["自分.モクバオー.BP: 0 → なし", "自分.モクバオー.Lv: 0 → 1", "自分.モクバオー.場所: フィールド → 合体"]
const SAGIT_NAME = "光龍騎神サジット・アポロドラゴン"
console.log("=== E1. サジット Lv3：ブレイヴ1つにつき、BP10000以下の相手のスピリット1体を破壊する（2つなら2体） ===")
scenario({
    name: "sagit-two-braves",
    start: {
        turn: "me",
        interactive: true,
        me: { spirits: [{ card: SAGIT, cores: 5 }, { card: HYOU, cores: 0 }, { card: "BS13-053", cores: 0 }] },
        opp: { spirits: [{ card: VANILLA, label: "A" }, { card: VANILLA, label: "B" }, { card: LEO, cores: 4 }] },
    },
    steps: (t) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ヒョウ・カッチュー"), hostInstanceId: t.id("光龍騎神サジット・アポロドラゴン") })
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("モクバオー"), hostInstanceId: t.id("光龍騎神サジット・アポロドラゴン") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("光龍騎神サジット・アポロドラゴン") })
        // 候補は BP10000以下の A・B だけ（レオ 12000 は選べない）。2体を破壊するので、片方を選べば残りも破壊される
        pickByLabel(t, ["相手.A"])
        assert(t.state.pendingChoice === null, "2体とも破壊し終えて選択待ちが残らない")
    },
    expect: [
        "相手.A.場所: フィールド → なし",
        "相手.B.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        ...COMBINED_HYOU,
        ...COMBINED_MOKUBA,
        "自分.光龍騎神サジット・アポロドラゴン.BP: 13000 → 20000",
        "自分.光龍騎神サジット・アポロドラゴン.疲労: false → true",
    ],
})

console.log("=== E2. サジット Lv3：ブレイヴが1つなら破壊は1体だけ（選んだBの方が破壊され、Aは残る） ===")
scenario({
    name: "sagit-one-brave",
    start: {
        turn: "me",
        interactive: true,
        me: { spirits: [{ card: SAGIT, cores: 5 }, { card: HYOU, cores: 0 }] },
        opp: { spirits: [{ card: VANILLA, label: "A" }, { card: VANILLA, label: "B" }, { card: LEO, cores: 4 }] },
    },
    steps: (t) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ヒョウ・カッチュー"), hostInstanceId: t.id(SAGIT_NAME) })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id(SAGIT_NAME) })
        pickByLabel(t, ["相手.B"])
        assert(t.state.pendingChoice === null, "1体破壊して選択待ちが残らない")
    },
    expect: [
        "相手.B.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        ...COMBINED_HYOU,
        `自分.${SAGIT_NAME}.BP: 13000 → 16000`,
        `自分.${SAGIT_NAME}.疲労: false → true`,
    ],
})

console.log("=== E3. サジット Lv2（Lv3ではない）：ブレイヴを2つ付けてアタックしても破壊しない ===")
scenario({
    name: "sagit-lv2",
    start: {
        turn: "me",
        interactive: true,
        me: { spirits: [{ card: SAGIT, cores: 3 }, { card: HYOU, cores: 0 }, { card: "BS13-053", cores: 0 }] },
        opp: { spirits: [{ card: VANILLA, label: "A" }, { card: VANILLA, label: "B" }] },
    },
    steps: (t) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ヒョウ・カッチュー"), hostInstanceId: t.id(SAGIT_NAME) })
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("モクバオー"), hostInstanceId: t.id(SAGIT_NAME) })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id(SAGIT_NAME) })
        assert(t.state.pendingChoice === null, "Lv2では破壊の選択待ちは出ない")
    },
    expect: [
        ...COMBINED_HYOU,
        ...COMBINED_MOKUBA,
        `自分.${SAGIT_NAME}.BP: 10000 → 17000`,
        `自分.${SAGIT_NAME}.疲労: false → true`,
    ],
})

// ---- G ヒョウ・カッチュー ----
const SUMMON_HYOU = [
    "自分.手札: ヒョウ・カッチュー → なし",
    "自分.リザーブ: 10 → 5",
    "自分.トラッシュのコア: 0 → 4",
    "自分.ヒョウ・カッチュー.場所: なし → フィールド",
    "自分.ヒョウ・カッチュー.疲労: なし → false",
    "自分.ヒョウ・カッチュー.コア: なし → 1",
    "自分.ヒョウ・カッチュー.Lv: なし → 1",
    "自分.ヒョウ・カッチュー.BP: なし → 3000",
]
console.log("=== G1. ヒョウ・カッチュー：召喚時、相手のスピリット2体が疲労する（相手が2体ならその2体） ===")
scenario({
    name: "hyou-two",
    start: { turn: "me", me: { hand: [HYOU] }, opp: { spirits: [{ card: VANILLA, label: "A" }, { card: VANILLA, label: "B" }] } },
    steps: (t) => { t.act("me", { type: "summon", handIndex: 0 }) },
    expect: [...SUMMON_HYOU, "相手.A.疲労: false → true", "相手.B.疲労: false → true"],
})

console.log("=== G2. ヒョウ・カッチュー：相手が1体なら、その1体だけが疲労する ===")
scenario({
    name: "hyou-one",
    start: { turn: "me", me: { hand: [HYOU] }, opp: { spirits: [{ card: VANILLA, label: "A" }] } },
    steps: (t) => { t.act("me", { type: "summon", handIndex: 0 }) },
    expect: [...SUMMON_HYOU, "相手.A.疲労: false → true"],
})

console.log("=== G3. ヒョウ・カッチュー：対話中は「相手が」3体の中から2体を選ぶ（選ぶのは相手側） ===")
scenario({
    name: "hyou-opp-chooses",
    start: {
        turn: "me",
        interactive: true,
        me: { hand: [HYOU] },
        opp: { spirits: [{ card: VANILLA, label: "A" }, { card: VANILLA, label: "B" }, { card: VANILLA, label: "C" }] },
    },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        for (const label of ["相手.A", "相手.C"]) {
            const pc = t.state.pendingChoice
            assert(pc !== null && pc.pid === t.opp, `疲労させるスピリットを選ぶのは相手（${label}）`)
            if (!pc) return
            t.act("opp", { type: "resolveChoice", instanceId: t.id(label) })
        }
        assert(t.state.pendingChoice === null, "2体選び終えて選択待ちが残らない")
    },
    expect: [...SUMMON_HYOU, "相手.A.疲労: false → true", "相手.C.疲労: false → true"],
})

// ---- H リーサルウェポンドラゴン ----
const LETHAL = "BS13-030"
const DRAIN = "BS06-096" // レベルドレイン（紫・コスト3・フラッシュ：相手のスピリット1体の上のコアを1つ下のLvコストまで相手のトラッシュへ）
const THORN = "BS01-134" // バインディングソーン（緑・コスト2・フラッシュ：相手のスピリット1体を疲労させる）
const PHANTASMA = "BS02-014" // ファンタズマ（紫・コスト2・バニラ）
console.log("=== 前提H: カードの機械確認 ===")
{
    assert(getCard(LETHAL).name === "リーサルウェポンドラゴン" && getCard(LETHAL).levels.find((l) => l.level === 2)?.cores === 3, "LETHALはコア3でLv2")
    assert(getCard(DRAIN).name === "レベルドレイン" && getCard(DRAIN).type === "magic" && getCard(DRAIN).colors[0] === "purple", "DRAINは紫のマジック")
    assert(getCard(THORN).name === "バインディングソーン" && getCard(THORN).type === "magic" && getCard(THORN).colors[0] === "green", "THORNは緑のマジック")
    assert(getCard(PHANTASMA).name === "ファンタズマ" && getCard(PHANTASMA).colors[0] === "purple" && getCard(PHANTASMA).effects.length === 0, "PHANTASMAは紫のバニラ")
}
console.log("=== H1. リーサル：相手の紫のマジックは対象にできない（【重装甲：紫/青】） ===")
scenario({
    name: "lethal-purple-magic",
    start: { turn: "opp", me: { spirits: [{ card: LETHAL, cores: 3 }] }, opp: { hand: [DRAIN] } },
    steps: (t) => { t.actRejected("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("リーサルウェポンドラゴン") }) },
    expect: [],
})

console.log("=== H2. リーサル：重装甲の色ではない緑のマジックは受ける ===")
scenario({
    name: "lethal-green-magic",
    start: { turn: "opp", me: { spirits: [{ card: LETHAL, cores: 3 }] }, opp: { hand: [THORN] } },
    steps: (t) => { t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("リーサルウェポンドラゴン") }) },
    expect: [
        "相手.手札: バインディングソーン → なし",
        "相手.トラッシュ: なし → バインディングソーン",
        "相手.トラッシュのコア: 0 → 2",
        "相手.リザーブ: 10 → 8",
        "自分.リーサルウェポンドラゴン.疲労: false → true",
    ],
})

const LETHAL_COMBINED = (hostBp: number) => [
    ...COMBINED_HYOU,
    `自分.リーサルウェポンドラゴン.BP: ${hostBp} → ${hostBp + 3000}`,
    "自分.リーサルウェポンドラゴン.疲労: false → true",
]
console.log("=== H3. リーサル Lv2＋ブレイヴ：バトル時、紫と青の相手のスピリットを1体ずつ手札に戻す（赤は残る） ===")
scenario({
    name: "lethal-bounce",
    start: {
        turn: "me",
        me: { spirits: [{ card: LETHAL, cores: 3 }, { card: HYOU, cores: 0 }] },
        opp: { spirits: [{ card: PHANTASMA }, { card: BULL }, { card: VANILLA, label: "赤" }] },
    },
    steps: (t) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ヒョウ・カッチュー"), hostInstanceId: t.id("リーサルウェポンドラゴン") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("リーサルウェポンドラゴン") })
    },
    expect: [
        ...LETHAL_COMBINED(7000),
        "相手.ファンタズマ.場所: フィールド → なし",
        "相手.戦闘獣ブルトップ.場所: フィールド → なし",
        `相手.手札: なし → ${nameList(PHANTASMA, BULL)}`,
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== H4. リーサル Lv1＋ブレイヴ：合体時の効果はLv2限定なので戻さない ===")
scenario({
    name: "lethal-bounce-lv1",
    start: {
        turn: "me",
        me: { spirits: [{ card: LETHAL, cores: 1 }, { card: HYOU, cores: 0 }] },
        opp: { spirits: [{ card: PHANTASMA }, { card: BULL }] },
    },
    steps: (t) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ヒョウ・カッチュー"), hostInstanceId: t.id("リーサルウェポンドラゴン") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("リーサルウェポンドラゴン") })
    },
    expect: LETHAL_COMBINED(4000),
})

// ---- I ホーク・ブレイカー ----
const HAWK = "BS13-056"
const WINGAL = "BS02-046" // ウィンガル（白・コスト6・バニラ・Lv1 BP5000）
console.log("=== 前提I: カードの機械確認 ===")
{
    assert(getCard(HAWK).name === "ホーク・ブレイカー" && getCard(HAWK).type === "brave" && getCard(HAWK).levels[0]!.bp === 7000, "HAWKはBP7000のブレイヴ")
    assert(getCard(WINGAL).name === "ウィンガル" && getCard(WINGAL).effects.length === 0 && getCard(WINGAL).levels[0]!.bp === 5000, "WINGALはBP5000のバニラ")
    assert(getCard(VANILLA).symbol.length === 1, "ロクケラトプスのシンボルは1つ")
}
// 自分のターンに合体してターンを終え、相手がアタックして自分がブロックする
function hawkBlock(t: ScenarioCtx, combine: boolean) {
    if (combine) t.act("me", { type: "combineBrave", braveInstanceId: t.id("ホーク・ブレイカー"), hostInstanceId: t.id("ウィンガル") })
    t.act("me", { type: "endTurn" })
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id("ウィンガル") })
}
const HAWK_COMBINED = ["自分.ホーク・ブレイカー.BP: 0 → なし", "自分.ホーク・ブレイカー.Lv: 0 → 1", "自分.ホーク・ブレイカー.場所: フィールド → 合体"]
console.log("=== I1. ホーク：合体中にブロックすると、相手のスピリットのシンボル1つにつきBP+5000（シンボル1つ。合体で+3000、ブロックで+5000） ===")
scenario({
    name: "hawk-block",
    start: { turn: "me", me: { spirits: [{ card: WINGAL, cores: 1 }, { card: HAWK, cores: 0 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => hawkBlock(t, true),
    expect: [...OPP_DRAW, ...HAWK_COMBINED, "相手.ロクケラトプス.疲労: false → true", "自分.ウィンガル.疲労: false → true", "自分.ウィンガル.BP: 5000 → 13000"],
})

console.log("=== I2. ホーク：合体していなければ（ブレイヴがスピリット状態のままなら）ブロックしてもBPは上がらない ===")
scenario({
    name: "hawk-block-not-combined",
    start: { turn: "me", me: { spirits: [{ card: WINGAL, cores: 1 }, { card: HAWK, cores: 1 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => hawkBlock(t, false),
    expect: [...OPP_DRAW, "相手.ロクケラトプス.疲労: false → true", "自分.ウィンガル.疲労: false → true"],
})

// ---- J ヴィーナ・フェーザー ----
const VENA = "BS13-040"
const braveBp = (id: string) => getCard(id).braveLevels![0]!.bp
console.log("=== 前提J: カードの機械確認 ===")
{
    assert(getCard(VENA).name === "金星神龍ヴィーナ・フェーザー" && getCard(VENA).symbol.length === 1, "VENAはシンボル1つ")
    assert(getCard(HAWK).symbol.length === 0, "HAWKはシンボルを持たない")
}
const VENA_NAME = "金星神龍ヴィーナ・フェーザー"
const HAWK_ON_VENA = [
    "自分.ホーク・ブレイカー.BP: 0 → なし",
    "自分.ホーク・ブレイカー.Lv: 0 → 1",
    "自分.ホーク・ブレイカー.場所: フィールド → 合体",
]
function venaAttack(t: ScenarioCtx, blocker: boolean) {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("ホーク・ブレイカー"), hostInstanceId: t.id(VENA_NAME) })
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id(VENA_NAME) })
    t.closeFlash()
    if (blocker) t.act("opp", { type: "block", instanceId: t.id("相手.ロクケラトプス") })
    else t.act("opp", { type: "takeLife" })
}
console.log("=== J1. ヴィーナ Lv3＋ブレイヴ：ブロックされたら、シンボル1つにつきボイドからコア1個をライフに置く ===")
scenario({
    name: "vena-blocked",
    start: { turn: "me", me: { spirits: [{ card: VENA, cores: 4 }, { card: HAWK, cores: 0 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => venaAttack(t, true),
    expect: [
        ...HAWK_ON_VENA,
        `自分.${VENA_NAME}.BP: 8000 → ${8000 + braveBp(HAWK)}`,
        `自分.${VENA_NAME}.疲労: false → true`,
        "相手.ロクケラトプス.疲労: false → true",
        "自分.ライフ: 5 → 6",
    ],
})

console.log("=== J2. ヴィーナ Lv3＋ブレイヴ：ブロックされなければライフは増えない（相手のライフが減るだけ） ===")
scenario({
    name: "vena-unblocked",
    start: { turn: "me", me: { spirits: [{ card: VENA, cores: 4 }, { card: HAWK, cores: 0 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => venaAttack(t, false),
    expect: [
        ...HAWK_ON_VENA,
        `自分.${VENA_NAME}.BP: 8000 → ${8000 + braveBp(HAWK)}`,
        `自分.${VENA_NAME}.疲労: false → true`,
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== J3. ヴィーナ Lv2（Lv3ではない）：ブロックされてもライフは増えない ===")
scenario({
    name: "vena-lv2",
    start: { turn: "me", me: { spirits: [{ card: VENA, cores: 2 }, { card: HAWK, cores: 0 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => venaAttack(t, true),
    expect: [
        ...HAWK_ON_VENA,
        `自分.${VENA_NAME}.BP: 6000 → ${6000 + braveBp(HAWK)}`,
        `自分.${VENA_NAME}.疲労: false → true`,
        "相手.ロクケラトプス.疲労: false → true",
    ],
})

// ---- K シユウ ----
const SHIYU = "BS13-058"
console.log("=== 前提K: カードの機械確認 ===")
{
    assert(getCard(SHIYU).name === "シユウ" && getCard(SHIYU).type === "brave", "SHIYUはシユウ")
}
const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option" && (pc.options ?? []).includes("発動する")
}
const SHIYU_ON_WINGAL = [
    "自分.シユウ.BP: 0 → なし",
    "自分.シユウ.Lv: 0 → 1",
    "自分.シユウ.場所: フィールド → 合体",
    `自分.ウィンガル.BP: 5000 → ${5000 + braveBp(SHIYU)}`,
    "自分.ウィンガル.疲労: false → true",
]
const FIVE_MILLED = ["自分.デッキ枚数: 40 → 35", "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス", "自分.ライフ: 5 → 6"]
function shiyuAttack(t: ScenarioCtx, answer: "confirm" | "decline" | "none"): number {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("シユウ"), hostInstanceId: t.id("ウィンガル") })
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("ウィンガル") })
    let confirms = 0
    if (isConfirm(t)) {
        confirms++
        if (answer === "confirm") t.act("me", { type: "resolveChoice", option: "発動する" })
        else t.act("me", { type: "resolveChoice", option: t.state.pendingChoice!.options!.find((o) => o !== "発動する")! })
    }
    t.closeFlash()
    return confirms
}
console.log("=== K1. シユウ（非対話）：アタック時にデッキを5枚破棄してライフ+1。Lv1の相手はブロックできない ===")
scenario({
    name: "shiyu-auto",
    start: { turn: "me", me: { spirits: [{ card: WINGAL, cores: 1 }, { card: SHIYU, cores: 0 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => {
        shiyuAttack(t, "none")
        t.actRejected("opp", { type: "block", instanceId: t.id("相手.ロクケラトプス") })
    },
    expect: [...SHIYU_ON_WINGAL, ...FIVE_MILLED],
})

console.log("=== K2. シユウ（対話）：確認は1回。押すと同じ結果 ===")
scenario({
    name: "shiyu-confirm",
    start: { turn: "me", interactive: true, me: { spirits: [{ card: WINGAL, cores: 1 }, { card: SHIYU, cores: 0 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => {
        const n = shiyuAttack(t, "confirm")
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
        t.actRejected("opp", { type: "block", instanceId: t.id("相手.ロクケラトプス") })
    },
    expect: [...SHIYU_ON_WINGAL, ...FIVE_MILLED],
})

console.log("=== K3. シユウ（対話）：断るとデッキもライフも動かず、Lv1の相手もブロックできる ===")
scenario({
    name: "shiyu-decline",
    start: { turn: "me", interactive: true, me: { spirits: [{ card: WINGAL, cores: 1 }, { card: SHIYU, cores: 0 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => {
        const n = shiyuAttack(t, "decline")
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
        t.act("opp", { type: "block", instanceId: t.id("相手.ロクケラトプス") })
    },
    expect: [...SHIYU_ON_WINGAL, "相手.ロクケラトプス.疲労: false → true"],
})

console.log("=== K4. シユウ（対話）：デッキが4枚しかなければ払えないので確認は出ず、何も起きない ===")
scenario({
    name: "shiyu-short-deck",
    start: { turn: "me", interactive: true, me: { deck: [VANILLA, VANILLA, VANILLA, VANILLA], spirits: [{ card: WINGAL, cores: 1 }, { card: SHIYU, cores: 0 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => {
        const n = shiyuAttack(t, "confirm")
        assert(n === 0, `確認は出ない（実際 ${n} 回）`)
        t.act("opp", { type: "block", instanceId: t.id("相手.ロクケラトプス") })
    },
    expect: [...SHIYU_ON_WINGAL, "相手.ロクケラトプス.疲労: false → true"],
})

console.log("=== K5. シユウ：相手のスピリットがLv3ならブロックできる ===")
scenario({
    name: "shiyu-lv3-blocker",
    start: { turn: "me", me: { spirits: [{ card: WINGAL, cores: 1 }, { card: SHIYU, cores: 0 }] }, opp: { spirits: [{ card: VANILLA, cores: 3 }] } },
    steps: (t) => {
        shiyuAttack(t, "none")
        t.act("opp", { type: "block", instanceId: t.id("相手.ロクケラトプス") })
    },
    expect: [...SHIYU_ON_WINGAL, ...FIVE_MILLED, "相手.ロクケラトプス.疲労: false → true"],
})

// ---- L フォビッド・バルチャー ----
const VULTURE = "BS13-059"
const NX_BLUE = "BS03-113" // 力奪う凱旋門（青）
const NX_PURPLE = "BS04-079" // 王蛇の住処（紫）
const NX_GREEN = "BS04-080" // 旋風渦巻く渓谷（緑）
const NX_YELLOW = "BS02-085" // トパーズの流星（黄）
console.log("=== 前提L: カードの機械確認 ===")
{
    assert(getCard(VULTURE).name === "フォビッド・バルチャー" && getCard(VULTURE).type === "brave" && getCard(VULTURE).cost === 5, "VULTUREはコスト5のブレイヴ")
    const nx = (id: string, name: string, color: string) => assert(getCard(id).name === name && getCard(id).type === "nexus" && getCard(id).colors[0] === color, `${id}は${name}（${color}のネクサス）`)
    nx(NX_BLUE, "力奪う凱旋門", "blue")
    nx(NX_PURPLE, "王蛇の住処", "purple")
    nx(NX_GREEN, "旋風渦巻く渓谷", "green")
    nx(NX_YELLOW, "トパーズの流星", "yellow")
}
const SUMMON_VULTURE = [
    "自分.手札: フォビッド・バルチャー → なし",
    "自分.リザーブ: 10 → 4",
    "自分.トラッシュのコア: 0 → 5",
    "自分.フォビッド・バルチャー.場所: なし → フィールド",
    "自分.フォビッド・バルチャー.疲労: なし → false",
    "自分.フォビッド・バルチャー.コア: なし → 1",
    "自分.フォビッド・バルチャー.Lv: なし → 1",
    "自分.フォビッド・バルチャー.BP: なし → 4000",
]
const placed = (name: string) => [`自分.${name}.場所: なし → ネクサス`, `自分.${name}.疲労: なし → false`, `自分.${name}.コア: なし → 0`, `自分.${name}.Lv: なし → 1`]
console.log("=== L1. バルチャー：召喚時、トラッシュの紫/緑/青のネクサスすべてをコスト無しで配置する（黄は置かない） ===")
scenario({
    name: "vulture-nexuses",
    start: { turn: "me", me: { hand: [VULTURE], trash: [NX_BLUE, NX_PURPLE, NX_GREEN, NX_YELLOW, VANILLA] } },
    steps: (t) => { t.act("me", { type: "summon", handIndex: 0 }) },
    expect: [
        ...SUMMON_VULTURE,
        `自分.トラッシュ: ${nameList(NX_BLUE, NX_PURPLE, NX_GREEN, NX_YELLOW, VANILLA)} → ${nameList(NX_YELLOW, VANILLA)}`,
        ...placed("力奪う凱旋門"),
        ...placed("王蛇の住処"),
        ...placed("旋風渦巻く渓谷"),
    ],
})

console.log("=== L2. バルチャー：トラッシュに紫/緑/青のネクサスが無ければ何も置かない ===")
scenario({
    name: "vulture-no-nexus",
    start: { turn: "me", me: { hand: [VULTURE], trash: [NX_YELLOW, VANILLA] } },
    steps: (t) => { t.act("me", { type: "summon", handIndex: 0 }) },
    expect: SUMMON_VULTURE,
})
console.log("すべてのチェックに合格しました 🎉（part482）")
