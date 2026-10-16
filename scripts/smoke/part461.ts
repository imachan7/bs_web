// smoke パート461（『このスピリットのブロック時』の「相手のスピリットN体」は、アタッカーに限らず新たに選ぶ。
// 「ブロックした／バトルしている〜相手のスピリット」はアタッカーを指す）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const IWAZAAL = "BS09-040"
const BRONTAL = "BS16-034"
const REINDEER = "BS06-044"
const TRICKSTER = "BS12-039"
const VANILLA = "BS01-002" // ロクケラトプス（コスト1・効果なし）
const SKY_A = "BS03-001" // 火精サラマンダート（空牙・効果なし）
const SKY_B = "BS13-001" // ヒクイック（空牙・効果なし）
const expensive = ALL_CARDS.find((c) => c.type === "spirit" && c.effects.length === 0 && c.cost >= 4)!

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(IWAZAAL).name === "イワザール" && getCard(BRONTAL).name === "ブロンタール", "イワザール・ブロンタール")
assert(getCard(REINDEER).name === "レインディア" && getCard(TRICKSTER).name === "導化姫トリックスター", "レインディア・トリックスター")
for (const id of [VANILLA, SKY_A, SKY_B]) assert(getCard(id).type === "spirit" && getCard(id).effects.length === 0 && getCard(id).cost <= 3, `${getCard(id).name} は効果なしでコスト3以下`)
for (const id of [SKY_A, SKY_B]) assert((getCard(id).family ?? []).includes("空牙"), `${getCard(id).name} は空牙`)
assert(expensive.cost >= 4, `${expensive.name} は効果なしでコスト4以上`)
const lv2 = (id: string) => getCard(id).levels.find((l) => l.level === 2)!.cores

// 自分のターンにアタックし、相手がブロックする（ブロックしたスピリットは疲労する）。バトルの決着までは進めない
function attackAndBlock(attacker: string, blocker: string) {
    return (t: ScenarioCtx) => {
        t.act("me", { type: "attack", instanceId: t.id(attacker) })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id(blocker) })
    }
}

console.log("=== 1. イワザール：コスト3以下の回復状態2体が疲労する（アタッカーは選ばれない） ===")
scenario({
    name: "iwazaal-two",
    start: {
        phase: "attack",
        me: { spirits: [{ card: VANILLA, label: "アタッカー" }, { card: VANILLA, label: "味方1" }, { card: VANILLA, label: "味方2" }] },
        opp: { spirits: [{ card: IWAZAAL }] },
    },
    steps: attackAndBlock("アタッカー", "イワザール"),
    expect: ["自分.アタッカー.疲労: false → true", "自分.味方1.疲労: false → true", "自分.味方2.疲労: false → true", "相手.イワザール.疲労: false → true"],
})

console.log("=== 2. イワザール：コスト4以上は対象外 ===")
scenario({
    name: "iwazaal-cost",
    start: {
        phase: "attack",
        me: { spirits: [{ card: VANILLA, label: "アタッカー" }, { card: VANILLA, label: "味方1" }, { card: expensive.cardId, label: "高コスト" }] },
        opp: { spirits: [{ card: IWAZAAL }] },
    },
    steps: attackAndBlock("アタッカー", "イワザール"),
    expect: ["自分.アタッカー.疲労: false → true", "自分.味方1.疲労: false → true", "相手.イワザール.疲労: false → true"],
})

console.log("=== 3a. ブロンタール：相手（ブロック側）のバーストがあれば回復状態の1体が疲労する ===")
scenario({
    name: "brontal-burst",
    start: {
        phase: "attack",
        me: { spirits: [{ card: VANILLA, label: "アタッカー" }, { card: VANILLA, label: "味方" }] },
        opp: { spirits: [{ card: BRONTAL }], burst: VANILLA },
    },
    steps: attackAndBlock("アタッカー", "ブロンタール"),
    expect: ["自分.アタッカー.疲労: false → true", "自分.味方.疲労: false → true", "相手.ブロンタール.疲労: false → true"],
})

console.log("=== 3b. ブロンタール：バーストが無ければ何も起きない ===")
scenario({
    name: "brontal-noburst",
    start: {
        phase: "attack",
        me: { spirits: [{ card: VANILLA, label: "アタッカー" }, { card: VANILLA, label: "味方" }] },
        opp: { spirits: [{ card: BRONTAL }] },
    },
    steps: attackAndBlock("アタッカー", "ブロンタール"),
    expect: ["自分.アタッカー.疲労: false → true", "相手.ブロンタール.疲労: false → true"],
})

console.log("=== 4. レインディア Lv2：ブロックされた空牙のアタッカーだけが手札に戻る ===")
scenario({
    name: "reindeer-attacker",
    start: {
        phase: "attack",
        me: { spirits: [{ card: SKY_A, label: "アタッカー" }, { card: SKY_B, label: "他の空牙" }] },
        opp: { spirits: [{ card: REINDEER, cores: lv2(REINDEER) }] },
    },
    steps: (t) => {
        attackAndBlock("アタッカー", "レインディア")(t)
        t.closeFlash()
    },
    expect: ["自分.アタッカー.場所: フィールド → なし", "自分.手札: なし → 火精サラマンダート", "自分.リザーブ: 10 → 11", "相手.レインディア.疲労: false → true"],
})

console.log("=== 5. トリックスター Lv2：疲労したアタッカーは回復状態でないので破壊されない。他の回復状態も対象外 ===")
scenario({
    name: "trickster-rested-attacker",
    start: {
        phase: "attack",
        me: { spirits: [{ card: VANILLA, label: "アタッカー" }, { card: VANILLA, label: "味方" }] },
        opp: { spirits: [{ card: TRICKSTER, cores: lv2(TRICKSTER) }] },
    },
    steps: attackAndBlock("アタッカー", "導化姫トリックスター"),
    expect: ["自分.アタッカー.疲労: false → true", "相手.導化姫トリックスター.疲労: false → true"],
})

console.log("すべてのチェックに合格しました 🎉（part461）")
