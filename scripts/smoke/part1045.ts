// smoke パート1045（#673：効果の中の合体による「合体したとき」は効果の後。DERIVED_AFTER_EFFECT §10）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const SUN = "BS13-073" // バーニングサン
const SWORD = "BS11-064" // 闇の聖剣
const APOLLO = "BS11-X01" // 太陽神龍ライジング・アポロドラゴン
const GUNNER = "SD03-010" // 砲竜バル・ガンナー
const DOMINION = "X012A" // 英雄皇ロード・ドラゴン・ドミニオン
const GANRYU = "BS15-062" // 決戦の巌龍島
const ROKU = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
for (const [id, name, type] of [
    [SUN, "バーニングサン", "magic"], [SWORD, "闇の聖剣", "nexus"], [APOLLO, "太陽神龍ライジング・アポロドラゴン", "spirit"], [GUNNER, "砲竜バル・ガンナー", "brave"],
    [DOMINION, "英雄皇ロード・ドラゴン・ドミニオン", "spirit"], [GANRYU, "決戦の巌龍島", "nexus"], [ROKU, "ロクケラトプス", "spirit"],
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

// 2026-11-22 ユーザー確認：効果で起きた出来事（バースト設置など）の誘発は、その効果の処理をすべて終えてから
scenario({
    name: "dominion-召喚時のバースト設置による巌龍島の破壊は、召喚時のドローの後",
    start: {
        phase: "main", interactive: true,
        me: { hand: [DOMINION, DOMINION], nexuses: [{ card: GANRYU, cores: 1 }] },
        opp: { spirits: [{ card: ROKU, label: "U" }, { card: ROKU, label: "V" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        let deckAtDestroy = -1
        for (let i = 0; t.state.pendingChoice && i < 10; i++) {
            const pc = t.state.pendingChoice
            if (pc.pid === t.me && JSON.stringify(pc).includes(t.id("U"))) {
                deckAtDestroy = t.state.players[t.me].deck.length
                t.act("me", { type: "resolveChoice", instanceId: t.id("U") })
            } else if (pc.kind === "option") t.act("me", { type: "resolveChoice", option: pc.options![0]! })
            else t.act(pc.pid === t.me ? "me" : "opp", { type: "resolveChoice" })
        }
        assert(deckAtDestroy === 39, `巌龍島の対象を選ぶ時点で、ドミニオンのドローは済んでいる（デッキ${deckAtDestroy}枚）`)
    },
    expect: [
        "相手.U.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11",
        "自分.デッキ枚数: 40 → 39", "自分.トラッシュのコア: 0 → 6", "自分.バースト: なし → 英雄皇ロード・ドラゴン・ドミニオン", "自分.リザーブ: 10 → 3",
        "自分.手札: 英雄皇ロード・ドラゴン・ドミニオン、英雄皇ロード・ドラゴン・ドミニオン → ロクケラトプス",
        "自分.英雄皇ロード・ドラゴン・ドミニオン.BP: なし → 5000", "自分.英雄皇ロード・ドラゴン・ドミニオン.Lv: なし → 1", "自分.英雄皇ロード・ドラゴン・ドミニオン.コア: なし → 1",
        "自分.英雄皇ロード・ドラゴン・ドミニオン.場所: なし → フィールド", "自分.英雄皇ロード・ドラゴン・ドミニオン.疲労: なし → false",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part1045）")
