// smoke パート745（合体中のブレイヴは【合体時】の効果だけが働く。docs/design/BRAVE.md §12 の表の #8。
// 2026-11-02 ユーザー確認。BS19-X08 の Lv1【強化】はスピリット状態のときだけ効き、合体中は
// 【合体時】【強化】の1つだけが効く。マジックハンマー（メイン：相手のデッキを上から5枚破棄）で確かめる）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const X08 = "BS19-X08" // 蒼海の大剣メイルシュトロム（青・ブレイヴ・コスト6・剣刃。Lv1【強化】と【合体時】【強化】の2つ持ち）
const HAMMER = "BS03-144" // マジックハンマー（青・マジック・コスト4・メイン：相手のデッキを上から5枚破棄）
const BANFA = "BS03-091" // 戦闘獣バン・ファロー（青・コスト5・戦獣。バニラ BP4000。合体条件「コスト5以上」を満たす）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    const x08 = getCard(X08)
    assert(x08.name === "蒼海の大剣メイルシュトロム" && x08.type === "brave" && x08.cost === 6, "X08はコスト6のブレイヴ")
    // Lv1【強化】（whileCombined なし）と【合体時】【強化】（whileCombined）の2エントリ
    const kyoka = x08.effects.filter((e) => e.kind === "keyword" && e.keyword === "kyoka" && e.kyoka === "deckMill")
    assert(kyoka.length === 2, "X08の【強化】（デッキ破棄+1）は2エントリ")
    assert(kyoka.some((e) => (e as { whileCombined?: true }).whileCombined !== true) && kyoka.some((e) => (e as { whileCombined?: true }).whileCombined === true), "片方はLv1・片方は【合体時】")
    const mh = getCard(HAMMER)
    assert(mh.name === "マジックハンマー" && mh.type === "magic" && mh.cost === 4, "HAMMERはコスト4のマジック")
    assert(mh.effects.some((e) => e.kind === "magic" && e.timing === "main"), "HAMMERのメイン効果がある")
    const banfa = getCard(BANFA)
    assert(banfa.name === "戦闘獣バン・ファロー" && banfa.type === "spirit" && banfa.cost === 5, "BANFAはコスト5のスピリット")
}

console.log("=== 1. 合体中のX08：【合体時】【強化】の1つだけが効き、破棄は6枚（Lv1【強化】は働かない） ===")
scenario({
    name: "x08-combined-kyoka-6",
    start: {
        me: { spirits: [{ card: BANFA }], hand: [X08, HAMMER], reserve: 10 },
        opp: { reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("戦闘獣バン・ファロー") })
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.手札: マジックハンマー、蒼海の大剣メイルシュトロム → なし",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 7",
        "自分.トラッシュ: なし → マジックハンマー",
        "自分.蒼海の大剣メイルシュトロム.場所: なし → 合体",
        "自分.蒼海の大剣メイルシュトロム.疲労: なし → false",
        "自分.蒼海の大剣メイルシュトロム.コア: なし → 0",
        "自分.蒼海の大剣メイルシュトロム.Lv: なし → 1",
        "自分.戦闘獣バン・ファロー.BP: 4000 → 9000", // 合体時BP+5000
        "相手.デッキ枚数: 40 → 34", // 5枚＋【合体時】【強化】の+1枚＝6枚
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
    ],
})

console.log("=== 2. スピリット状態のX08（合体していない）：Lv1【強化】が効き、破棄は6枚 ===")
scenario({
    name: "x08-spirit-kyoka-6",
    start: {
        me: { spirits: [{ card: BANFA }], hand: [X08, HAMMER], reserve: 10 },
        opp: { reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // 合体先を指定しない＝スピリット状態で召喚
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.手札: マジックハンマー、蒼海の大剣メイルシュトロム → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 7",
        "自分.トラッシュ: なし → マジックハンマー",
        "自分.蒼海の大剣メイルシュトロム.場所: なし → フィールド",
        "自分.蒼海の大剣メイルシュトロム.BP: なし → 5000",
        "自分.蒼海の大剣メイルシュトロム.疲労: なし → false",
        "自分.蒼海の大剣メイルシュトロム.コア: なし → 1",
        "自分.蒼海の大剣メイルシュトロム.Lv: なし → 1",
        "相手.デッキ枚数: 40 → 34", // 5枚＋Lv1【強化】の+1枚＝6枚
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part745）")
