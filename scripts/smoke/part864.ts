// smoke パート864（BS23 黄バッチ前半の場面テスト：037 マイヤ・039 アドペンタン・042 キャプリンメル。効果文だけを根拠にした期待値。docs/design/BS23_PLAN.md §1）
import { assert, getCard } from "./helpers"
import { instHasColor } from "../../shared/rules/level"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const MAIYA = "BS23-037" // 舞踏の魔女マイヤ
const ADOP = "BS23-039" // 冒険家アドペンタン
const KAP = "BS23-042" // キャプリンメル
const BEHE = "BS21-X05" // 陸獣神ベヒモス（コスト8・黄軽減5）
const CHARL = "BS23-038" // 冒険天使チャール（黄シンボル1・コスト3）
const SWORD = "BS23-063" // 光輪剣エンジェルハイロゥ（剣刃のブレイヴ）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1。Lv3 は 3 コアで BP4000）
const BOJA = "BS21-038" // ボジャノーイ（黄・コスト2・Lv1 BP2000）
const PANDA = "BS06-053" // レーザーパンダ（黄・コスト3・Lv1 BP3000）
const METAL = "BS01-008" // メタルバーン（赤・コスト3。Lv1 3000／3 コアで Lv2 4000）
const PTERA = "BS21-005" // ブレード・プテラス（赤・コスト4・Lv1 BP4000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(MAIYA).name === "舞踏の魔女マイヤ" && getCard(MAIYA).cost === 2, "MAIYA")
    assert(getCard(ADOP).name === "冒険家アドペンタン" && getCard(KAP).name === "キャプリンメル", "ADOP / KAP")
    assert(getCard(BEHE).name === "陸獣神ベヒモス" && getCard(BEHE).cost === 8 && getCard(BEHE).reduction.length === 5, "BEHE")
    assert(getCard(CHARL).name === "冒険天使チャール" && getCard(CHARL).symbol.length === 1, "CHARL")
    assert(getCard(SWORD).type === "brave" && getCard(SWORD).family.includes("剣刃"), "SWORD")
    assert(getCard(BOJA).cost === 2 && getCard(PANDA).cost === 3 && getCard(PTERA).levels[0]!.bp === 4000, "BOJA / PANDA / PTERA")
    assert(getCard(METAL).levels[1]!.cores === 3 && getCard(METAL).levels[1]!.bp === 4000, "METAL")
}

const handIdx = (t: ScenarioCtx, cardId: string) => t.state.players[t.me].hand.indexOf(cardId)
const deckTop = (top: string[]) => [...top, ...Array.from({ length: 40 - top.length }, () => VAN)]
const braves = (n: number) => Array.from({ length: n }, () => getCard(SWORD).name).join("、")

// ───────────── 037 舞踏の魔女マイヤ ─────────────
console.log("=== 1. 037：ベヒモスの召喚で、疲労させることでコストを-2する（軽減1＋2で 8→5） ===")
scenario({
    name: "maiya-assist",
    start: { me: { hand: [BEHE], spirits: [{ card: MAIYA, label: "マイヤ" }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [t.id("マイヤ")] }),
    expect: [
        "自分.手札: 陸獣神ベヒモス → なし", "自分.リザーブ: 10 → 4", "自分.トラッシュのコア: 0 → 5", "自分.マイヤ.疲労: false → true",
        "自分.陸獣神ベヒモス.場所: なし → フィールド", "自分.陸獣神ベヒモス.疲労: なし → false", "自分.陸獣神ベヒモス.コア: なし → 1",
        "自分.陸獣神ベヒモス.Lv: なし → 1", "自分.陸獣神ベヒモス.BP: なし → 6000",
    ],
})
console.log("=== 2. 037：任意。使わなければ 8→7 で払い、マイヤは疲労しない ===")
scenario({
    name: "maiya-decline",
    start: { me: { hand: [BEHE], spirits: [{ card: MAIYA, label: "マイヤ" }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 陸獣神ベヒモス → なし", "自分.リザーブ: 10 → 2", "自分.トラッシュのコア: 0 → 7",
        "自分.陸獣神ベヒモス.場所: なし → フィールド", "自分.陸獣神ベヒモス.疲労: なし → false", "自分.陸獣神ベヒモス.コア: なし → 1",
        "自分.陸獣神ベヒモス.Lv: なし → 1", "自分.陸獣神ベヒモス.BP: なし → 6000",
    ],
})
console.log("=== 3. 037：疲労済みなら払えない／ベヒモス以外の召喚には使えない ===")
scenario({
    name: "maiya-rested",
    start: { me: { hand: [BEHE], spirits: [{ card: MAIYA, label: "マイヤ", rested: true }] } },
    steps: (t) => t.actRejected("me", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [t.id("マイヤ")] }),
    expect: [],
})
scenario({
    name: "maiya-not-behemoth",
    start: { me: { hand: [CHARL], spirits: [{ card: MAIYA, label: "マイヤ" }] } },
    steps: (t) => t.actRejected("me", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [t.id("マイヤ")] }),
    expect: [],
})
console.log("=== 4. 037：Lv2 以上は緑のスピリットとしても扱う（Lv1 は黄のみ） ===")
scenario({
    name: "maiya-green",
    start: { me: { spirits: [{ card: MAIYA, label: "マイヤ2", cores: 2 }, { card: MAIYA, label: "マイヤ1", cores: 1 }] } },
    steps(t) {
        assert(instHasColor(t.inst("マイヤ2"), "green") && instHasColor(t.inst("マイヤ2"), "yellow"), "Lv2 は緑でも黄でもある")
        assert(!instHasColor(t.inst("マイヤ1"), "green"), "Lv1 は緑として扱わない")
    },
    expect: [],
})

// ───────────── 039 冒険家アドペンタン ─────────────
console.log("=== 5. 039：上から3枚を開き、剣刃のブレイヴすべてを手札へ。残りは破棄（4枚目は開かない） ===")
scenario({
    name: "adop-3",
    start: { me: { hand: [ADOP], deck: deckTop([SWORD, VAN, SWORD, SWORD]) } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        `自分.手札: ${getCard(ADOP).name} → ${braves(2)}`, "自分.デッキ枚数: 40 → 37", "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 3",
        "自分.冒険家アドペンタン.場所: なし → フィールド", "自分.冒険家アドペンタン.疲労: なし → false", "自分.冒険家アドペンタン.コア: なし → 1",
        "自分.冒険家アドペンタン.Lv: なし → 1", "自分.冒険家アドペンタン.BP: なし → 3000",
    ],
})
console.log("=== 6. 039：「チャール」の自分のスピリットがいれば5枚開く（黄シンボル1で 3→2） ===")
scenario({
    name: "adop-5",
    start: { me: { hand: [ADOP], spirits: [{ card: CHARL, label: "チャール" }], deck: deckTop([SWORD, VAN, SWORD, VAN, SWORD, SWORD]) } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        `自分.手札: ${getCard(ADOP).name} → ${braves(3)}`, "自分.デッキ枚数: 40 → 35", "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 2",
        "自分.冒険家アドペンタン.場所: なし → フィールド", "自分.冒険家アドペンタン.疲労: なし → false", "自分.冒険家アドペンタン.コア: なし → 1",
        "自分.冒険家アドペンタン.Lv: なし → 1", "自分.冒険家アドペンタン.BP: なし → 3000",
    ],
})
console.log("=== 7. 039：ターンに1回（カード名ごと。Q4545）。2枚目の召喚時は何も起きない ===")
scenario({
    name: "adop-once",
    start: { me: { hand: [ADOP, ADOP], deck: deckTop([SWORD, VAN, SWORD, SWORD]) } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "summon", handIndex: handIdx(t, ADOP) })
    },
    expect: [
        `自分.手札: ${getCard(ADOP).name}、${getCard(ADOP).name} → ${braves(2)}`, "自分.デッキ枚数: 40 → 37", "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 5",
        "自分.冒険家アドペンタン.場所: なし → フィールド", "自分.冒険家アドペンタン.疲労: なし → false", "自分.冒険家アドペンタン.コア: なし → 1",
        "自分.冒険家アドペンタン.Lv: なし → 1", "自分.冒険家アドペンタン.BP: なし → 3000",
        "自分.冒険家アドペンタン#2.場所: なし → フィールド", "自分.冒険家アドペンタン#2.疲労: なし → false", "自分.冒険家アドペンタン#2.コア: なし → 1",
        "自分.冒険家アドペンタン#2.Lv: なし → 1", "自分.冒険家アドペンタン#2.BP: なし → 3000",
    ],
})

// ───────────── 042 キャプリンメル ─────────────
// 自分のターン：ボジャノーイ（コスト2）がアタックし、BP の大きい相手がブロックする。攻撃側が BP 比べで破壊される
const atkStep = (t: ScenarioCtx, attacker: string, blocker: string) => {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id(attacker) })
    t.closeFlash()
    t.act("opp", { type: "block", instanceId: t.id(blocker) })
    t.closeFlash()
}
console.log("=== 8. 042：コスト2の自分のスピリットをブロックしたLv1の相手を、バトル終了時に破壊（攻撃側が先に破壊されても。Q4550〜Q4551） ===")
scenario({
    name: "kap-destroy",
    start: { me: { spirits: [{ card: KAP, label: "キャプ" }, { card: BOJA, label: "ボジャ" }] }, opp: { spirits: [{ card: METAL, label: "メタル" }] } },
    steps: (t) => atkStep(t, "ボジャ", "メタル"),
    expect: [
        "自分.ボジャ.場所: フィールド → なし", "自分.トラッシュ: なし → ボジャノーイ", "自分.リザーブ: 10 → 11",
        "相手.メタル.場所: フィールド → なし", "相手.トラッシュ: なし → メタルバーン", "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 9. 042：ブロックしたのがLv2、または攻撃側がコスト3なら破壊しない ===")
scenario({
    name: "kap-blocker-lv2",
    start: { me: { spirits: [{ card: KAP, label: "キャプ" }, { card: BOJA, label: "ボジャ" }] }, opp: { spirits: [{ card: METAL, label: "メタル", cores: 3 }] } },
    steps: (t) => atkStep(t, "ボジャ", "メタル"),
    expect: ["自分.ボジャ.場所: フィールド → なし", "自分.トラッシュ: なし → ボジャノーイ", "自分.リザーブ: 10 → 11", "相手.メタル.疲労: false → true"],
})
scenario({
    name: "kap-attacker-cost3",
    start: { me: { spirits: [{ card: KAP, label: "キャプ" }, { card: PANDA, label: "パンダ" }] }, opp: { spirits: [{ card: PTERA, label: "プテラス" }] } },
    steps: (t) => atkStep(t, "パンダ", "プテラス"),
    expect: ["自分.パンダ.場所: フィールド → なし", "自分.トラッシュ: なし → レーザーパンダ", "自分.リザーブ: 10 → 11", "相手.プテラス.疲労: false → true"],
})

// 相手のターン：ロクケラトプス（3 コアで BP4000）のアタックを、自分のスピリットがブロックして破壊される
const oppAttack = (t: ScenarioCtx, blocker: string) => {
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("A") })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id(blocker) })
    t.closeFlash()
}
const oppA = { spirits: [{ card: VAN, label: "A", cores: 3 }] }
console.log("=== 10. 042 Lv2：コスト2の自分のスピリットが相手によって破壊されたとき1枚引く ===")
scenario({
    name: "kap-draw",
    start: { turn: "opp", me: { spirits: [{ card: KAP, label: "キャプ", cores: 2 }, { card: BOJA, label: "ボジャ" }] }, opp: oppA },
    steps: (t) => oppAttack(t, "ボジャ"),
    expect: [
        "自分.ボジャ.場所: フィールド → なし", "自分.トラッシュ: なし → ボジャノーイ", "自分.リザーブ: 10 → 11",
        "自分.手札: なし → ロクケラトプス", "自分.デッキ枚数: 40 → 39", "相手.A.疲労: false → true",
    ],
})
console.log("=== 11. 042：Lv1 なら引かない／コスト3が破壊されても引かない ===")
scenario({
    name: "kap-draw-lv1",
    start: { turn: "opp", me: { spirits: [{ card: KAP, label: "キャプ", cores: 1 }, { card: BOJA, label: "ボジャ" }] }, opp: oppA },
    steps: (t) => oppAttack(t, "ボジャ"),
    expect: ["自分.ボジャ.場所: フィールド → なし", "自分.トラッシュ: なし → ボジャノーイ", "自分.リザーブ: 10 → 11", "相手.A.疲労: false → true"],
})
scenario({
    name: "kap-draw-cost3",
    start: { turn: "opp", me: { spirits: [{ card: KAP, label: "キャプ", cores: 2 }, { card: PANDA, label: "パンダ" }] }, opp: oppA },
    steps: (t) => oppAttack(t, "パンダ"),
    expect: ["自分.パンダ.場所: フィールド → なし", "自分.トラッシュ: なし → レーザーパンダ", "自分.リザーブ: 10 → 11", "相手.A.疲労: false → true"],
})
console.log("=== 12. 042：コア0の消滅は「相手によって破壊」ではない（Q4555） ===")
scenario({
    name: "kap-no-draw-on-vanish",
    start: { me: { spirits: [{ card: KAP, label: "キャプ", cores: 2 }, { card: BOJA, label: "ボジャ" }] } },
    steps: (t) => t.act("me", { type: "moveCore", instanceId: t.id("ボジャ"), direction: "remove", confirmDeplete: true }),
    expect: ["自分.ボジャ.場所: フィールド → なし", "自分.トラッシュ: なし → ボジャノーイ", "自分.リザーブ: 10 → 11"],
})

console.log("すべてのチェックに合格しました 🎉（part864）")
