// smoke パート590（SD02-013 転召の祭壇：「コストを支払わずに」の召喚でも余分の1コストは払う。同時に複数体を召喚しても1回ぶん）
// 公式Q&A（ベルゼビートで2体を召喚しても余分は1コスト）／2026-10-15 ユーザー確認。コアはリザーブから払う盤面で書く
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const BEELZE = "BS06-X22" // 魔界七将ベルゼビート（紫・コスト7。召喚時：トラッシュの【呪撃】持ちを合計13までコスト不要で召喚できる）
const ALTAR = "SD02-013" // 転召の祭壇（青ネクサス）
const CAP = "BS05-011" // レッドキャップ（コスト2・【呪撃】・転召なし）
const NECRO = "BS07-011" // ネクロウ（コスト2・【呪撃】・転召なし）
const MUALE = "BS06-019" // 冥楽士ムール（コスト4・【呪撃】）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BEELZE).name === "魔界七将ベルゼビート" && getCard(BEELZE).cost === 7, "BEELZEはベルゼビート")
    assert(getCard(ALTAR).name === "転召の祭壇" && getCard(ALTAR).type === "nexus", "ALTARは転召の祭壇")
    assert(getCard(CAP).name === "レッドキャップ" && getCard(CAP).cost === 2, "CAPはコスト2")
    assert(getCard(NECRO).name === "ネクロウ" && getCard(NECRO).cost === 2, "NECROはコスト2")
    assert(getCard(MUALE).name === "冥楽士ムール" && getCard(MUALE).cost === 4, "MUALEはコスト4")
}

// 基準の盤面：ベルゼビート（コスト7）をリザーブ11から召喚。ベルゼビートが1コア、コスト不要で出る各スピリットが1コアをリザーブから受ける
// （祭壇なしでリザーブ10・2体だと 10→0、トラッシュのコア+7 になることから逆算した値で、効果文からは決まらない）
const BEELZE_ME = [
    "自分.手札: 魔界七将ベルゼビート → なし",
    "自分.魔界七将ベルゼビート.場所: なし → フィールド",
    "自分.魔界七将ベルゼビート.疲労: なし → false",
    "自分.魔界七将ベルゼビート.コア: なし → 1",
    "自分.魔界七将ベルゼビート.Lv: なし → 1",
    "自分.魔界七将ベルゼビート.BP: なし → 6000",
]
const arrives = (name: string) => [
    `自分.${name}.場所: なし → フィールド`,
    `自分.${name}.疲労: なし → false`,
    `自分.${name}.コア: なし → 1`,
    `自分.${name}.Lv: なし → 1`,
    `自分.${name}.BP: なし → 2000`,
]

console.log("=== 1. 祭壇あり・2体を同時に召喚 → 余分は合計1（トラッシュのコア 7+1、リザーブ 11→0） ===")
scenario({
    name: "altar-two",
    start: { me: { reserve: 11, hand: [BEELZE], trash: [CAP, NECRO] }, opp: { nexuses: [{ card: ALTAR, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [...BEELZE_ME, ...arrives("レッドキャップ"), ...arrives("ネクロウ"), "自分.トラッシュ: ネクロウ、レッドキャップ → なし",
        "自分.リザーブ: 11 → 0", "自分.トラッシュのコア: 0 → 8"],
})

console.log("=== 2. 祭壇あり・1体だけ召喚 → 余分1（リザーブ 11→1、トラッシュのコア 8） ===")
scenario({
    name: "altar-one",
    start: { me: { reserve: 11, hand: [BEELZE], trash: [CAP] }, opp: { nexuses: [{ card: ALTAR, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [...BEELZE_ME, ...arrives("レッドキャップ"), "自分.トラッシュ: レッドキャップ → なし", "自分.リザーブ: 11 → 1", "自分.トラッシュのコア: 0 → 8"],
})

console.log("=== 3. 祭壇なし・2体 → 余分0（リザーブ 11→1、トラッシュのコア 7） ===")
scenario({
    name: "no-altar",
    start: { me: { reserve: 11, hand: [BEELZE], trash: [CAP, NECRO] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [...BEELZE_ME, ...arrives("レッドキャップ"), ...arrives("ネクロウ"), "自分.トラッシュ: ネクロウ、レッドキャップ → なし",
        "自分.リザーブ: 11 → 1", "自分.トラッシュのコア: 0 → 7"],
})

console.log("=== 4. 祭壇あり・コスト4のスピリットだけ → 余分0（リザーブ 11→2、トラッシュのコア 7） ===")
scenario({
    name: "altar-cost4",
    start: { me: { reserve: 11, hand: [BEELZE], trash: [MUALE] }, opp: { nexuses: [{ card: ALTAR, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [...BEELZE_ME, "自分.冥楽士ムール.場所: なし → フィールド", "自分.冥楽士ムール.疲労: なし → false", "自分.冥楽士ムール.コア: なし → 1",
        "自分.冥楽士ムール.Lv: なし → 1", "自分.冥楽士ムール.BP: なし → 2000", "自分.トラッシュ: 冥楽士ムール → なし", "自分.リザーブ: 11 → 2", "自分.トラッシュのコア: 0 → 7"],
})

console.log("=== 5. 祭壇あり・余分の1コストを払えない → その召喚はできず、カードはトラッシュに残る ===")
// リザーブ9＝ベルゼビートの7コスト＋1コアの後に1個残る。レッドキャップのLv1のコア1個は置けるが、余分の1コストまでは払えない
// （ベルゼビートのコアは維持コアなので払いに使わない）。祭壇が無ければ出る盤面で「払えないから出ない」だけを見る
scenario({
    name: "altar-cannot-pay",
    start: { me: { reserve: 9, hand: [BEELZE], trash: [CAP] }, opp: { nexuses: [{ card: ALTAR, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [...BEELZE_ME, "自分.リザーブ: 9 → 1", "自分.トラッシュのコア: 0 → 7"],
})

console.log("すべてのチェックに合格しました 🎉（part590）")
