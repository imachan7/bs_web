// smoke パート593（SD02-013 転召の祭壇の「1コスト余分」の支払い元：リザーブとフィールドのコア。2026-10-15 ユーザー確認）
// 「コストの支払いはフィールドも含む」。対話中は効果のコストと同じ effectCostPay の選択待ちで paySources を答える。非対話（AI）はリザーブ優先で、足りなければフィールドから自動で補う
// 盤面は part590 と同じ（ベルゼビートの召喚時でトラッシュのレッドキャップを無償召喚）。リザーブ9だとベルゼビートに7＋1、キャップの1コアで余分に払えるリザーブが残らない
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const BEELZE = "BS06-X22" // 魔界七将ベルゼビート（コスト7）
const ALTAR = "SD02-013" // 転召の祭壇
const CAP = "BS05-011" // レッドキャップ（コスト2・転召なし）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ。Lv1=1コア/Lv2=2コア/Lv3=3コア、BP 1000/3000/4000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BEELZE).name === "魔界七将ベルゼビート" && getCard(BEELZE).cost === 7, "BEELZEはベルゼビート")
    assert(getCard(ALTAR).name === "転召の祭壇" && getCard(ALTAR).type === "nexus", "ALTARは転召の祭壇")
    assert(getCard(CAP).name === "レッドキャップ" && getCard(CAP).cost === 2, "CAPはコスト2")
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).levels.length === 3, "ROKUはLv3まである")
}

const BEELZE_ME = [
    "自分.手札: 魔界七将ベルゼビート → なし",
    "自分.魔界七将ベルゼビート.場所: なし → フィールド",
    "自分.魔界七将ベルゼビート.疲労: なし → false",
    "自分.魔界七将ベルゼビート.コア: なし → 1",
    "自分.魔界七将ベルゼビート.Lv: なし → 1",
    "自分.魔界七将ベルゼビート.BP: なし → 6000",
]
const CAP_ARRIVES = [
    "自分.レッドキャップ.場所: なし → フィールド",
    "自分.レッドキャップ.疲労: なし → false",
    "自分.レッドキャップ.コア: なし → 1",
    "自分.レッドキャップ.Lv: なし → 1",
    "自分.レッドキャップ.BP: なし → 2000",
    "自分.トラッシュ: レッドキャップ → なし",
]
// 余分1をフィールドのロクケラトプス（3コア→2コア）から払った結果。リザーブ 9→0、トラッシュのコア 7(ベルゼビート)+1(余分)=8
const ROKU_PAID_1 = [
    "自分.ロクケラトプス.コア: 3 → 2",
    "自分.ロクケラトプス.Lv: 3 → 2",
    "自分.ロクケラトプス.BP: 4000 → 3000",
    "自分.リザーブ: 9 → 0",
    "自分.トラッシュのコア: 0 → 8",
]
const START = { reserve: 9, hand: [BEELZE], trash: [CAP], spirits: [{ card: ROKU, cores: 3 }] }
const OPP = { nexuses: [{ card: ALTAR, cores: 1 }] }

console.log("=== 1. 非対話・リザーブが尽きる → 余分1をフィールドのコアから自動で払って召喚 ===")
scenario({
    name: "field-auto",
    start: { me: START, opp: OPP },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [...BEELZE_ME, ...CAP_ARRIVES, ...ROKU_PAID_1],
})

// 対話中の選択待ちを順に処理する。effectCostPay だけ paySources で答え、他の確認系は最初の選択肢（あれば）で進める
function answerAll(t: Parameters<Parameters<typeof scenario>[0]["steps"]>[0], pay: { label: string; count: number } | null): { sawCostPay: boolean } {
    let sawCostPay = false
    for (let i = 0; i < 10 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice as any
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.effectCostPay) {
            sawCostPay = true
            t.act(side, { type: "resolveChoice", option: pc.options?.[0], ...(pay ? { paySources: [{ instanceId: t.id(pay.label), count: pay.count }] } : {}) })
        } else {
            t.act(side, { type: "resolveChoice", option: pc.options?.[0], ...(pc.candidates ? { instanceId: pc.candidates[0] } : { cardIndex: 0 }) })
        }
    }
    return { sawCostPay }
}

console.log("=== 2. 対話・paySources でフィールドの個体を指定 → その個体のコアが減る ===")
scenario({
    name: "field-chosen",
    start: { interactive: true, me: START, opp: OPP },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        const r = answerAll(t, { label: "ロクケラトプス", count: 1 })
        assert(r.sawCostPay, "余分の支払い元を選ぶ待ち（effectCostPay）が出る")
    },
    expect: [...BEELZE_ME, ...CAP_ARRIVES, ...ROKU_PAID_1],
})

console.log("=== 3. 対話・リザーブで足りる → 待ちは出る。paySources なしで答えればリザーブから払う ===")
scenario({
    name: "reserve-chosen",
    start: { interactive: true, me: { ...START, reserve: 11 }, opp: OPP },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        const r = answerAll(t, null)
        assert(r.sawCostPay, "リザーブで足りても支払い元を選ぶ待ち（effectCostPay）が出る")
    },
    // リザーブ 11 → 7+1+1+1(余分) で 1 残る。ロクケラトプスは変わらない
    expect: [...BEELZE_ME, ...CAP_ARRIVES, "自分.リザーブ: 11 → 1", "自分.トラッシュのコア: 0 → 8"],
})

console.log("=== 4. 払える所がどこにも無い（リザーブ0・フィールドに維持コア1個だけ）→ 召喚しない ===")
// ロクケラトプスの1コアはLv1の維持コアで払えない（維持コアを割る払い方は既存の支払いと同じ扱い。割ると消滅するのでここでは払えない側に倒す）
scenario({
    name: "nowhere-to-pay",
    start: { me: { reserve: 9, hand: [BEELZE], trash: [CAP], spirits: [{ card: ROKU, cores: 1 }] }, opp: OPP },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [...BEELZE_ME, "自分.リザーブ: 9 → 1", "自分.トラッシュのコア: 0 → 7"],
})

console.log("すべてのチェックに合格しました 🎉（part593）")
