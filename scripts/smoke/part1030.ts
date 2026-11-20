// smoke パート1030（#631 配布系の未実行エントリ：GX12-01-e1・KA12-01-e3・LM13-01-e1・LM13-02-e1・LM13-03-e1・PB13-02-e3 を実際に使う場面）
import { assert, getCard } from "./helpers"
import { continuousKeywordGrantCount } from "../../shared/rules"
import { check, nm, resolveAll, summonOut } from "./lib631"
import { scenario } from "./scenario"

const VAN = "BS01-002"
const ILUR = "BS16-053" // イルルヤンカッシュ（青・コスト6・Lv1 BP5000）
const ARDER = "BS17-073" // アーダーフレイム（赤マジック・コスト4・BP4000以下を破壊）
const ENJU = "BS02-061" // 天使エンジュ（黄・コスト3・召喚時：自分の黄のスピリット1体を回復）
const RIO = "BS17-040" // 呪術士リオ（黄・Lv1 BP2000）
const BACHO = "BS16-022" // マー・バチョウ（緑・華兵・コスト3・Lv1 BP2000）
assert(getCard(ARDER).name === "アーダーフレイム" && getCard(ENJU).name === "天使エンジュ" && getCard(RIO).name === "呪術士リオ" && getCard(BACHO).name === "マー・バチョウ" && getCard(ILUR).name === "イルルヤンカッシュ", "既存カードの前提")

const okL1 = check("LM13-01", "光と闇の聖剣シャイニング・オブ・ダーク", "brave", 7)
const okL2 = check("LM13-02", "疾風の妖刀ウスバ・ハヤテ", "brave", 6)
const okL3 = check("LM13-03", "白夜の光剣ミッドナイト・ソーラー", "brave", 5)
const okKA = check("KA12-01", "カンネイド・エース", "spirit", 4)
const okPB = check("PB13-02", "光翼の騎神ペガシオーネ・カスタム", "spirit", 8)
const okGX = check("GX12-01", "偽☆ギャラクシー", "spirit", 12)

if (okL1) {
    console.log("=== LM13-01 Lv1【強化】：自分のBP破壊効果の上限+1000 ===")
    const board = (withBrave: boolean) => ({
        me: { hand: [ARDER], spirits: withBrave ? [{ card: "LM13-01", label: "B" }] : [] },
        opp: { spirits: [{ card: ILUR, label: "I" }] },
    })
    scenario({
        name: "LM13-01-BP4000以下破壊のマジックが、BP5000の相手スピリットを破壊できる",
        start: board(true),
        steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("I") }),
        expect: ["自分.手札: アーダーフレイム → なし", "自分.トラッシュ: なし → アーダーフレイム", "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3", "相手.I.場所: フィールド → なし", "相手.トラッシュ: なし → イルルヤンカッシュ", "相手.リザーブ: 10 → 11"],
        mirror: false,
    })
}

if (okL2) {
    console.log("=== LM13-02 フラッシュ【神速】：手札から召喚できる ===")
    scenario({
        name: "LM13-02-相手のアタックステップのフラッシュで手札から召喚できる",
        start: { turn: "opp", phase: "attack", interactive: true, me: { hand: ["LM13-02"] }, opp: { spirits: [{ card: VAN, label: "O" }, { card: VAN, label: "P" }] } },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.act("me", { type: "summon", handIndex: 0 })
            resolveAll(t, ["P"])
        },
        expect: [...summonOut("自分", "疾風の妖刀ウスバ・ハヤテ", 6, 3000), "相手.O.疲労: false → true", "相手.P.疲労: false → true"],
        mirror: false,
    })
}

if (okL3) {
    console.log("=== LM13-03 Lv1【強化】：自分のスピリット回復効果の体数+1 ===")
    scenario({
        name: "LM13-03-黄のスピリット1体を回復する召喚時効果で、黄のスピリット2体が回復する",
        start: { me: { hand: [ENJU], spirits: [{ card: "LM13-03", label: "B" }, { card: RIO, label: "R1", rested: true }, { card: RIO, label: "R2", rested: true }] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: ["自分.手札: 天使エンジュ → なし", "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 1", "自分.天使エンジュ.場所: なし → フィールド", "自分.天使エンジュ.疲労: なし → false", "自分.天使エンジュ.コア: なし → 1", "自分.天使エンジュ.Lv: なし → 1", "自分.天使エンジュ.BP: なし → 2000", "自分.R1.疲労: true → false", "自分.R2.疲労: true → false"],
        mirror: false,
    })
}

if (okKA) {
    console.log("=== KA12-01 Lv2：華兵の自分のスピリットすべてに【暴風：1】を与える ===")
    scenario({
        name: "KA12-01-Lv2なら他の華兵のスピリットが【暴風：1】を持つ。Lv1では持たない",
        start: { me: { spirits: [{ card: "KA12-01", label: "K", cores: 3 }, { card: BACHO, label: "H" }, { card: VAN, label: "N" }] } },
        steps(t) {
            assert(continuousKeywordGrantCount(t.state, t.me, t.inst("H"), "bofu") === 1, "華兵のマー・バチョウは【暴風：1】")
            assert(continuousKeywordGrantCount(t.state, t.me, t.inst("N"), "bofu") === 0, "華兵でないロクケラトプスは持たない")
        },
        expect: [],
        mirror: false,
    })
    scenario({
        name: "KA12-01-Lv1では与えない",
        start: { me: { spirits: [{ card: "KA12-01", label: "K" }, { card: BACHO, label: "H" }] } },
        steps: (t) => assert(continuousKeywordGrantCount(t.state, t.me, t.inst("H"), "bofu") === 0, "Lv1では他の華兵に与えない"),
        expect: [],
        mirror: false,
    })
}

if (okPB) {
    console.log("=== PB13-02 Lv3 フラッシュ：このスピリットを破壊しトラッシュに置くことで、相手のスピリット1体を破壊 ===")
    scenario({
        name: "PB13-02-自分を破壊して相手のスピリット1体を破壊する",
        start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [{ card: "PB13-02", label: "P", cores: 6 }] }, opp: { spirits: [{ card: VAN, label: "O" }] } },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.act("me", { type: "activateAbility", instanceId: t.id("P"), effectId: "PB13-02-e3" })
            resolveAll(t, ["O"])
        },
        expect: ["相手.O.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11", "自分.P.場所: フィールド → なし", "自分.トラッシュ: なし → 光翼の騎神ペガシオーネ・カスタム", "自分.リザーブ: 10 → 16"],
        mirror: false,
    })
}

if (okGX) {
    console.log("=== GX12-01 バースト（ライフ減少後）：ライフ1のとき、お互いのデッキを5枚以下にして召喚 ===")
    scenario({
        name: "GX12-01-ライフが1になったら、お互いの山札が5枚になりこのスピリットが召喚される",
        start: { names: { me: "諏訪部順一", opp: "ユウキ" }, turn: "opp", phase: "attack", interactive: true, me: { life: 2, reserve: 20, burst: "GX12-01" }, opp: { spirits: [{ card: VAN, label: "O" }] } },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.closeFlash()
            t.act("me", { type: "takeLife" })
            t.closeFlash()
            resolveAll(t)
            assert(t.state.players[t.me].deck.length === 5 && t.state.players[t.opp].deck.length === 5, "お互いの山札が5枚になる")
            assert(t.state.players[t.me].field.spirits.some((i) => i.cardId === "GX12-01"), "偽☆ギャラクシーが召喚される")
        },
        expect: [
            "相手.O.疲労: false → true", "相手.デッキ枚数: 40 → 5", `相手.トラッシュ: なし → ${nm(...Array(35).fill("ロクケラトプス"))}`,
            "自分.デッキ枚数: 40 → 5", `自分.トラッシュ: なし → ${nm(...Array(35).fill("ロクケラトプス"))}`, "自分.バースト: 偽☆ギャラクシー → なし", "自分.ライフ: 2 → 1",
            "自分.偽☆ギャラクシー.BP: なし → 10000", "自分.偽☆ギャラクシー.Lv: なし → 1", "自分.偽☆ギャラクシー.コア: なし → 1", "自分.偽☆ギャラクシー.場所: なし → フィールド", "自分.偽☆ギャラクシー.疲労: なし → false",
        ],
        mirror: false,
    })
}
console.log("すべてのチェックに合格しました 🎉（part1030）")
