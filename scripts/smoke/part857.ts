// smoke パート857（BS23 緑バッチ前半：019 水忍ガモン・020 ヨロイバッタ・021 ムシャタヌキ・022 火忍ハシビロウ）
// 期待値は効果文と公式Q&A（BS23_PLAN §1）だけから書いた。分身の基本は BS22_PLAN の B1 行
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import { BN, arrive, braved, bunshin, giveFlash, names, settle } from "./bs23green"

const GAMON = "BS23-019"
const BATTA = "BS23-020"
const TANUKI = "BS23-021"
const HASHI = "BS23-022"
const JU = "BS23-025"
const BRAVE = "BS23-060"
const ROK = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000）
const SHOCK = "BS01-054" // ショックイーター（緑・コスト2・樹魔・BP3000）
const WHT = "BS01-074" // バーサーカー・ガン（白・コスト1）
const BLU = "BS17-046" // オリクス盗賊団（青・コスト1）
const NEXUS = "BS08-061" // 共鳴する音叉の塔（白・ネクサス）

console.log("=== 前提: カードの機械確認 ===")
{
    const n = (id: string) => getCard(id).name
    assert(n(GAMON) === "水忍ガモン" && n(BATTA) === "ヨロイバッタ" && n(TANUKI) === "ムシャタヌキ" && n(HASHI) === "火忍ハシビロウ", "対象4枚の名前")
    assert(n(JU) === "忍鳥ジューイチ" && n(BRAVE) === "翡翠の小太刀 日輪丸" && getCard(BRAVE).family.includes("剣刃"), "JU は分身持ち・BRAVE は剣刃")
    assert(getCard(GAMON).family.includes("爪鳥") && !getCard(SHOCK).family.includes("爪鳥"), "ガモンの対象は爪鳥だけ・ショックイーターは爪鳥でない")
    assert(getCard(SHOCK).cost === 2 && getCard(ROK).cost === 1 && getCard(WHT).colors[0] === "white" && getCard(BLU).colors[0] === "blue", "脇役の属性")
}

const JUN = names([JU])

console.log("=== 019 ガモン：アタックステップに、自分の分身1体につき爪鳥すべてBP+1000（自身も含む。Q4494） ===")
// 軽減：ガモン＋ショックイーターの緑2つ → JU はコスト5-2=3。リザーブ 10-3(支払い)-1(維持)-1(分身) = 5
scenario({
    name: "gamon-bp-attack-step",
    start: { me: { spirits: [{ card: GAMON, label: "ガモン", cores: 1 }, { card: SHOCK, label: "ショック" }], hand: [JU] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
        t.act("me", { type: "nextPhase" })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 3", `自分.手札: ${JUN} → なし`, "自分.デッキ枚数: 40 → 39",
        "自分.ガモン.BP: 1000 → 2000",
        ...arrive("忍鳥ジューイチ", { cores: 1, lv: 1, bp: 4000 }),
        ...bunshin(1, 1),
    ],
})

console.log("=== 019 ガモン：メインステップではBP+されない／Lv1 では出たコアも置かれない ===")
scenario({
    name: "gamon-bp-main-step",
    start: { me: { spirits: [{ card: GAMON, label: "ガモン", cores: 1 }, { card: SHOCK, label: "ショック" }], hand: [JU] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 3", `自分.手札: ${JUN} → なし`, "自分.デッキ枚数: 40 → 39",
        ...arrive("忍鳥ジューイチ", { cores: 1, lv: 1, bp: 3000 }),
        ...bunshin(1, 1),
    ],
})

console.log("=== 019 ガモン Lv2：分身が出たときボイドからコア1個をその分身へ（ターンに1回）。分身2体でBP+2000 ===")
// JU1: 緑1つ → コスト4。14-4-1-1=8。JU2: 緑3つ（上限は軽減シンボル2つ）→ コスト3。8-3-1-1=3
scenario({
    name: "gamon-lv2-void-core-once",
    start: { me: { reserve: 14, spirits: [{ card: GAMON, label: "ガモン", cores: 2 }], hand: [JU, JU] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
        t.act("me", { type: "nextPhase" })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 14 → 3", "自分.トラッシュのコア: 0 → 7", `自分.手札: ${names([JU, JU])} → なし`, "自分.デッキ枚数: 40 → 38",
        "自分.ガモン.BP: 2000 → 4000",
        ...arrive("忍鳥ジューイチ", { cores: 1, lv: 1, bp: 5000 }),
        ...arrive("忍鳥ジューイチ#2", { cores: 1, lv: 1, bp: 5000 }),
        ...bunshin(1, 2), // 1体目：リザーブから1個＋ボイドから1個
        ...bunshin(2, 1), // 2体目：ターンに1回なのでボイドのコアは来ない
    ],
})

console.log("=== 020 ヨロイバッタ：【神速】で相手のアタックにフラッシュで出し、白シンボルがあれば【連鎖】白でコスト4以下を手札へ（青は無いのでBP+3000なし） ===")
scenario({
    name: "batta-shinsoku-chain-white",
    start: {
        turn: "opp",
        me: { spirits: [{ card: WHT, label: "白味方" }], hand: [BATTA] },
        opp: { spirits: [{ card: ROK, label: "攻撃役" }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
        giveFlash(t, "me")
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
        t.closeFlash()
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 2", `自分.手札: ${names([BATTA])} → なし`,
        ...arrive("ヨロイバッタ", { cores: 1, lv: 1, bp: 2000 }),
        "相手.攻撃役.場所: フィールド → なし", `相手.手札: なし → ${names([ROK])}`, "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 020 ヨロイバッタ：【神速】で出し、青シンボルだけなら【連鎖】青でBP+3000・相手は手札に戻らない（連鎖は神速で召喚したときだけ。BS19 Q776） ===")
scenario({
    name: "batta-chain-blue",
    start: {
        turn: "opp",
        me: { spirits: [{ card: BLU, label: "青味方" }], hand: [BATTA] },
        opp: { spirits: [{ card: ROK, label: "攻撃役" }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
        giveFlash(t, "me")
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
        t.closeFlash()
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 2", `自分.手札: ${names([BATTA])} → なし`,
        ...arrive("ヨロイバッタ", { cores: 1, lv: 1, bp: 5000 }),
        "相手.攻撃役.疲労: false → true",
    ],
})

console.log("=== 020 ヨロイバッタ：通常の召喚では【連鎖】は出ない ===")
scenario({
    name: "batta-normal-summon-no-chain",
    start: {
        me: { spirits: [{ card: BLU, label: "青味方" }], hand: [BATTA] },
        opp: { spirits: [{ card: ROK, label: "標的" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 2", `自分.手札: ${names([BATTA])} → なし`,
        ...arrive("ヨロイバッタ", { cores: 1, lv: 1, bp: 2000 }),
    ],
})

console.log("=== 021 ムシャタヌキ：破壊時にボイドからコア1個を自分へ。赤シンボルなら【連鎖】赤でBP4000以下を破壊（白は無い） ===")
// 破壊時に置いたコアも含め、タヌキの2個がリザーブへ戻る：10+2
scenario({
    name: "tanuki-destroyed-chain-red",
    start: {
        turn: "opp",
        me: { spirits: [{ card: TANUKI, label: "タヌキ", cores: 1 }, { card: ROK, label: "赤味方" }] },
        opp: { spirits: [{ card: SHOCK, label: "攻撃役" }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("タヌキ") })
        t.closeFlash()
        settle(t)
    },
    expect: [
        "自分.タヌキ.場所: フィールド → なし", "自分.リザーブ: 10 → 12", `自分.トラッシュ: なし → ${names([TANUKI])}`,
        "相手.攻撃役.場所: フィールド → なし", `相手.トラッシュ: なし → ${names([SHOCK])}`, "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 021 ムシャタヌキ：白シンボルなら【連鎖】白で相手のネクサスを手札へ（赤は無いのでスピリットは破壊されない） ===")
scenario({
    name: "tanuki-destroyed-chain-white",
    start: {
        turn: "opp",
        me: { spirits: [{ card: TANUKI, label: "タヌキ", cores: 1 }, { card: WHT, label: "白味方" }] },
        opp: { spirits: [{ card: SHOCK, label: "攻撃役" }], nexuses: [{ card: NEXUS, cores: 0 }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("タヌキ") })
        t.closeFlash()
        settle(t)
    },
    expect: [
        "自分.タヌキ.場所: フィールド → なし", "自分.リザーブ: 10 → 12", `自分.トラッシュ: なし → ${names([TANUKI])}`,
        "相手.攻撃役.疲労: false → true",
        "相手.共鳴する音叉の塔.場所: ネクサス → なし", `相手.手札: なし → ${names([NEXUS])}`,
    ],
})

console.log("=== 022 ハシビロウ：召喚時【分身：1】 ===")
scenario({
    name: "hashibirou-summon-bunshin",
    start: { me: { hand: [HASHI] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 4", "自分.トラッシュのコア: 0 → 4", `自分.手札: ${names([HASHI])} → なし`, "自分.デッキ枚数: 40 → 39",
        ...arrive("火忍ハシビロウ", { cores: 1, lv: 1, bp: 3000 }),
        ...bunshin(1, 1),
    ],
})

console.log("=== 022 ハシビロウ Lv2：メインステップに剣刃のブレイヴが召喚されたとき、自分のスピリット1体の【分身】を発揮させる ===")
// 日輪丸：緑シンボル1つで軽減1 → コスト3（合体召喚は維持コアなし）。7-1(分身)=6
scenario({
    name: "hashibirou-lv2-braved-bunshin",
    start: { me: { spirits: [{ card: HASHI, label: "ハシビロ", cores: 2 }], hand: [BRAVE] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ハシビロ") })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 3", `自分.手札: ${names([BRAVE])} → なし`, "自分.デッキ枚数: 40 → 39",
        "自分.ハシビロ.BP: 4000 → 7000",
        ...braved("翡翠の小太刀 日輪丸"),
        ...bunshin(1, 1),
    ],
})

console.log("=== 022 ハシビロウ Lv1：同じ場面でも【分身】は発揮されない ===")
scenario({
    name: "hashibirou-lv1-braved-nothing",
    start: { me: { spirits: [{ card: HASHI, label: "ハシビロ", cores: 1 }], hand: [BRAVE] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ハシビロ") })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3", `自分.手札: ${names([BRAVE])} → なし`,
        "自分.ハシビロ.BP: 3000 → 6000",
        ...braved("翡翠の小太刀 日輪丸"),
    ],
})

void BN
console.log("すべてのチェックに合格しました 🎉（part857）")
