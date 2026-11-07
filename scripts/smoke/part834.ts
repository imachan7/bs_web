// smoke パート834（BS23 B1：062・063 のブレイヴ召喚時の無償召喚、074 ソードレイド。公式Q&A Q20353〜Q20357・Q25237）
// 効果文だけから書いた期待値役のテスト。実装に合わせて期待値を変えないこと
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import { appear, drive, handRow, trashRow } from "./b1helpers"

const BREAKER = "BS23-062" // 極光剣ソルブレイカー（剣刃ブレイヴ・コスト4・合体条件コスト3以上・BP4000）
const HALO = "BS23-063" // 光輪剣エンジェルハイロゥ（剣刃ブレイヴ・コスト4・合体条件コスト4以上・BP2000）
const FILANDER = "BS23-052" // 剣聖将軍フィランダー（青・コスト5・剣使・抜刀。召喚時にデッキから2枚ドロー→手札2枚破棄）
const MINO = "BS23-033" // 機甲剣聖ミノタウロス（コスト5・剣使・抜刀・Lv1 BP3000）
const SHOOT = "BS23-005" // 流星の剣聖シューティングスター（コスト5・剣使・抜刀）
const SHUBU = "BS23-050" // 異海剣聖シュブ・ニグラ（コスト4・剣使・抜刀）
const AMARTIA = "BS23-043" // 月影の剣聖アマルティア（剣使だが【抜刀】を持たない）
const NICHI = "BS23-060" // 翡翠の小太刀 日輪丸（剣刃ブレイヴ）
const ZAGNA = "BS23-057" // ザグナ・オリックス（剣刃でないブレイヴ）
const SWORDRAID = "BS23-074" // ソードレイド（赤マジック・コスト5）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）
const AIBURN = "BS01-005" // アイバーン（赤・コスト2・効果なし）
const SHOCK = "BS01-054" // ショックイーター（緑・コスト2・効果なし）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・効果なし）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    const eq = (id: string, name: string, type: string) => assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}`)
    eq(BREAKER, "極光剣ソルブレイカー", "brave")
    eq(HALO, "光輪剣エンジェルハイロゥ", "brave")
    eq(FILANDER, "剣聖将軍フィランダー", "spirit")
    eq(MINO, "機甲剣聖ミノタウロス", "spirit")
    eq(SHOOT, "流星の剣聖シューティングスター", "spirit")
    eq(SHUBU, "異海剣聖シュブ・ニグラ", "spirit")
    eq(AMARTIA, "月影の剣聖アマルティア", "spirit")
    eq(NICHI, "翡翠の小太刀 日輪丸", "brave")
    eq(ZAGNA, "ザグナ・オリックス", "brave")
    eq(SWORDRAID, "ソードレイド", "magic")
    for (const [id, n] of [[ROKU, "ロクケラトプス"], [AIBURN, "アイバーン"], [SHOCK, "ショックイーター"], [METAL, "メタルバーン"], [BELL, "デュアルキャノン・ベル"]] as const) {
        assert(getCard(id).name === n && getCard(id).effects.length === 0, `${id}は効果なしの${n}`)
    }
}

// 062・063：スピリット状態で出すか直接合体で出すかは毎回選ぶ。召喚は手札の先頭（ブレイヴ）から
console.log("=== D1. 直接合体で出すとスピリットは増えない：自分のスピリットが1体なので、手札の【抜刀】持ちスピリットをコストなしで召喚でき、その召喚時効果は発揮されない ===")
scenario({
    name: "braveSummon-combine-then-free-summon-no-summon-effect",
    start: { interactive: true, me: { hand: [BREAKER, FILANDER], spirits: [{ card: MINO, label: "ミノ" }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ミノ") })
        drive(t, { card: FILANDER })
    },
    // フィランダーの召喚時のドロー2・破棄2は発揮されないので、手札・デッキは動かない
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.ミノ.BP: 3000 → 7000",
        handRow("自分", [BREAKER, FILANDER], []),
        ...appear("自分", BREAKER, { where: "合体", cores: 0 }),
        ...appear("自分", FILANDER, { cores: 1, bp: 4000 }),
    ],
})

console.log("=== D2. 3体の場にスピリット状態で出すと4体になるので、無償召喚は発揮されない（Q20353〜Q20357） ===")
scenario({
    name: "braveSummon-spirit-state-makes-four",
    start: {
        interactive: true,
        me: {
            hand: [BREAKER, FILANDER],
            spirits: [{ card: AIBURN, label: "A" }, { card: SHOCK, label: "S" }, { card: METAL, label: "M" }],
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        drive(t, { card: FILANDER })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        handRow("自分", [BREAKER, FILANDER], [FILANDER]),
        ...appear("自分", BREAKER, { cores: 1, bp: 4000 }),
    ],
})

console.log("=== D3. 3体の場に直接合体で出すと3体のままなので、無償召喚は発揮される ===")
scenario({
    name: "braveSummon-combine-with-three-spirits",
    start: {
        interactive: true,
        me: {
            hand: [BREAKER, FILANDER],
            spirits: [{ card: AIBURN, label: "A" }, { card: SHOCK, label: "S" }, { card: METAL, label: "M" }],
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("M") })
        drive(t, { card: FILANDER })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.M.BP: 3000 → 7000",
        handRow("自分", [BREAKER, FILANDER], []),
        ...appear("自分", BREAKER, { where: "合体", cores: 0 }),
        ...appear("自分", FILANDER, { cores: 1, bp: 4000 }),
    ],
})

console.log("=== D4. 手札の【抜刀】を持たないスピリットは選べない（063） ===")
scenario({
    name: "braveSummon-063-not-batto",
    start: { interactive: true, me: { hand: [HALO, AMARTIA, ROKU], spirits: [{ card: BELL, label: "ベル" }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ベル") })
        drive(t, { card: AMARTIA })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ベル.BP: 3000 → 5000",
        handRow("自分", [HALO, AMARTIA, ROKU], [AMARTIA, ROKU]),
        ...appear("自分", HALO, { where: "合体", cores: 0 }),
    ],
})

console.log("=== D5. 063 でも【抜刀】持ちを無償召喚でき、断ることもできる ===")
scenario({
    name: "braveSummon-063-decline",
    start: { interactive: true, me: { hand: [HALO, SHUBU], spirits: [{ card: BELL, label: "ベル" }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ベル") })
        drive(t, { decline: true })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ベル.BP: 3000 → 5000",
        handRow("自分", [HALO, SHUBU], [SHUBU]),
        ...appear("自分", HALO, { where: "合体", cores: 0 }),
    ],
})

// 074 ソードレイド：赤マジック・コスト5（メイン）。山札を5枚ちょうどにして、上下どちらから開いても同じ結果にする
console.log("=== E1. 【抜刀】持ちの自分のスピリット2体で3＋2＝5枚オープン。抜刀持ちスピリットと剣刃ブレイヴは手札、それ以外は破棄（Q25237） ===")
scenario({
    name: "swordraid-open-five",
    start: {
        me: {
            hand: [SWORDRAID],
            deck: [FILANDER, NICHI, AMARTIA, ZAGNA, SHUBU],
            spirits: [{ card: SHOOT, label: "シュー" }, { card: MINO, label: "ミノ" }],
        },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
        drive(t)
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.デッキ枚数: 5 → 0",
        handRow("自分", [SWORDRAID], [FILANDER, NICHI, SHUBU]),
        trashRow("自分", [], [SWORDRAID, AMARTIA, ZAGNA]),
    ],
})

console.log("=== E2. 【抜刀】持ちがいなければ3枚だけオープン（剣刃4枚の山から3枚が手札、1枚残る） ===")
scenario({
    name: "swordraid-open-three",
    start: {
        me: { hand: [SWORDRAID], deck: [NICHI, NICHI, NICHI, NICHI], spirits: [{ card: AMARTIA, label: "アマ" }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
        drive(t)
    },
    expect: [
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.デッキ枚数: 4 → 1",
        handRow("自分", [SWORDRAID], [NICHI, NICHI, NICHI]),
        trashRow("自分", [], [SWORDRAID]),
    ],
})

console.log("=== E3. 【抜刀】持ち1体なら4枚オープン ===")
scenario({
    name: "swordraid-open-four",
    start: {
        me: { hand: [SWORDRAID], deck: [NICHI, NICHI, NICHI, NICHI, NICHI], spirits: [{ card: SHOOT, label: "シュー" }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
        drive(t)
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.デッキ枚数: 5 → 1",
        handRow("自分", [SWORDRAID], [NICHI, NICHI, NICHI, NICHI]),
        trashRow("自分", [], [SWORDRAID]),
    ],
})

console.log("=== E4. 相手の【抜刀】持ちスピリットは数えない（「自分のスピリット」） ===")
scenario({
    name: "swordraid-opp-batto-not-counted",
    start: {
        me: { hand: [SWORDRAID], deck: [NICHI, NICHI, NICHI, NICHI], spirits: [{ card: AMARTIA, label: "アマ" }] },
        opp: { spirits: [{ card: SHOOT, label: "シュー" }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
        drive(t)
    },
    expect: [
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.デッキ枚数: 4 → 1",
        handRow("自分", [SWORDRAID], [NICHI, NICHI, NICHI]),
        trashRow("自分", [], [SWORDRAID]),
    ],
})

console.log("=== F1. フラッシュ：このターンの間、スピリット1体をBP+3000する ===")
scenario({
    name: "swordraid-flash-bp",
    start: { phase: "main", me: { hand: [SWORDRAID], spirits: [{ card: SHOOT, label: "シュー" }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("シュー") })
        drive(t, { picks: [SHOOT] })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.シュー.BP: 4000 → 7000",
        handRow("自分", [SWORDRAID], []),
        trashRow("自分", [], [SWORDRAID]),
    ],
})

console.log("すべてのチェックに合格しました 🎉（part834）")
