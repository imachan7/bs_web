// smoke パート1045（#673：効果の中の合体による「合体したとき」は効果の後。DERIVED_AFTER_EFFECT §10）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const SUN = "BS13-073" // バーニングサン
const SWORD = "BS11-064" // 闇の聖剣
const APOLLO = "BS11-X01" // 太陽神龍ライジング・アポロドラゴン
const GUNNER = "SD03-010" // 砲竜バル・ガンナー

console.log("=== 前提: カードの機械確認 ===")
for (const [id, name, type] of [
    [SUN, "バーニングサン", "magic"], [SWORD, "闇の聖剣", "nexus"], [APOLLO, "太陽神龍ライジング・アポロドラゴン", "spirit"], [GUNNER, "砲竜バル・ガンナー", "brave"],
] as const) {
    assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}（${type}）`)
}

scenario({
    name: "burning-sun-合体して回復した後に、闇の聖剣Lv2で疲労する",
    start: {
        phase: "main",
        me: { hand: [SUN, GUNNER], spirits: [{ card: APOLLO, label: "A", cores: 3 }] },
        opp: { nexuses: [{ card: SWORD, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        while (t.state.pendingChoice) t.act(t.state.pendingChoice.pid === t.me ? "me" : "opp", { type: "resolveChoice" })
        assert(t.state.players[t.me].field.combinedBraves.length === 1, "バル・ガンナーが合体している")
        assert(t.inst("A").isRested, "効果の後に闇の聖剣が発揮し、合体スピリットは疲労している")
    },
    expect: [
        "自分.A.BP: 9000 → 11000", "自分.A.疲労: false → true",
        "自分.トラッシュ: なし → バーニングサン", "自分.トラッシュのコア: 0 → 2", "自分.リザーブ: 10 → 8", "自分.手札: バーニングサン、砲竜バル・ガンナー → なし",
        "自分.砲竜バル・ガンナー.Lv: なし → 1", "自分.砲竜バル・ガンナー.コア: なし → 0", "自分.砲竜バル・ガンナー.場所: なし → 合体", "自分.砲竜バル・ガンナー.疲労: なし → false",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part1045）")
