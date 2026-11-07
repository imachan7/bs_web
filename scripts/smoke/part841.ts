// smoke パート841（BS23 B3: X07 真・裁きの神剣トゥルース・エデン／X13-12 裁きの神剣リ・ジェネシス。召喚の条件）
// Q20363・Q20364・Q4611。ブレイヴは合体先を指定せずに召喚する（フィールドの候補は合体条件に合わないスピリットだけ）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameAction, GameState } from "./helpers"
import { scenario } from "./scenario"

const X07 = "BS23-X07" // 真・裁きの神剣トゥルース・エデン（赤・コスト6・軽減は赤紫緑白黄青を1つずつ）
const X1312 = "X13-12" // 裁きの神剣リ・ジェネシス（赤・コスト6・赤軽減3）
const DRAGON = "SD10-X01" // 召喚時に手札の赤のブレイヴをコストなしで召喚できる
const SWORD_SPIRIT = "BS23-002" // ドラコレックス（剣使）
const SWORD_BRAVE = "BS23-055" // カーディナル・サン（剣刃）
const NEXUS = "BS01-107"
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1）
// 色ごとの効果なしスピリット（コスト2以下）。X07 の軽減を色ごとに満たすための役
const RED = "BS01-001"
const GREEN = "BS01-050"
const WHITE = "BS01-074"
const PURPLE = "BS03-013"
const YELLOW = "BS03-051"
const BLUE = "BS03-071"

console.log("=== 前提: カードの機械確認 ===")
{
    const n = (id: string) => getCard(id)
    assert(n(X07).name === "真・裁きの神剣トゥルース・エデン" && n(X07).type === "brave" && n(X07).cost === 6 && n(X07).reduction.join() === "red,purple,green,white,yellow,blue", "X07")
    assert(n(X1312).name === "裁きの神剣リ・ジェネシス" && n(X1312).type === "brave" && n(X1312).cost === 6 && n(X1312).reduction.join() === "red,red,red", "X13-12")
    assert(n(DRAGON).name === "輝龍シャイニング・ドラゴン" && n(DRAGON).type === "spirit", "SD10-X01")
    assert(n(SWORD_SPIRIT).family.includes("剣使") && n(SWORD_BRAVE).family.includes("剣刃"), "剣使・剣刃")
    const colors: [string, string][] = [[RED, "red"], [GREEN, "green"], [WHITE, "white"], [PURPLE, "purple"], [YELLOW, "yellow"], [BLUE, "blue"]]
    for (const [id, c] of colors) assert(n(id).type === "spirit" && n(id).colors.join() === c && !n(id).effect && n(id).cost <= 2, `${n(id).name} は ${c} の効果なし`)
}

const nm = (...ids: string[]) => ids.map((i) => getCard(i).name).sort().join("、")
const X07_NAME = getCard(X07).name
const field = (ids: string[]) => ids.map((card) => ({ card }))
const ALL_SIX = [RED, GREEN, WHITE, PURPLE, YELLOW, BLUE]
const FIVE = [RED, GREEN, WHITE, PURPLE, BLUE] // 黄を欠く

console.log("=== X07-1. 軽減で0コストになるときは召喚できない（Q20363・Q20364）。六色そろうと 6 − 6 ＝ 0 ===")
scenario({
    name: "x07-cost-zero",
    start: { me: { hand: [X07], spirits: field(ALL_SIX) } },
    steps(t) {
        t.actRejected("me", { type: "summon", handIndex: 0 })
    },
    expect: [],
})

console.log("=== X07-2. 1コスト払えるなら召喚できる（五色で 6 − 5 ＝ 1。維持コア1と合わせてリザーブ −2） ===")
scenario({
    name: "x07-cost-one",
    start: { me: { hand: [X07], spirits: field(FIVE) } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        `自分.手札: ${X07_NAME} → なし`,
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 1",
        `自分.${X07_NAME}.場所: なし → フィールド`,
        `自分.${X07_NAME}.疲労: なし → false`,
        `自分.${X07_NAME}.コア: なし → 1`,
        `自分.${X07_NAME}.Lv: なし → 1`,
        `自分.${X07_NAME}.BP: なし → 10000`,
    ],
})

console.log("=== X07-3. 効果によるコストなしの召喚もできない（手札に残る。Q4611 の読み） ===")
// ドラゴンの召喚時は手札の赤のブレイヴをコストなしで召喚できる。候補は X07 だけなので何も起きない
scenario({
    name: "x07-free-summon",
    start: { me: { hand: [DRAGON, X07] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        `自分.手札: ${nm(DRAGON, X07)} → ${X07_NAME}`,
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        `自分.${getCard(DRAGON).name}.場所: なし → フィールド`,
        `自分.${getCard(DRAGON).name}.疲労: なし → false`,
        `自分.${getCard(DRAGON).name}.コア: なし → 1`,
        `自分.${getCard(DRAGON).name}.Lv: なし → 1`,
        `自分.${getCard(DRAGON).name}.BP: なし → 5000`,
    ],
})

console.log("=== X07-4. 召喚時：手札の剣使スピリット・剣刃ブレイヴを好きなだけコストなしで召喚し、それらの召喚時効果は発揮されない ===")
{
    const s: GameState = createGame("b3-x07-summon", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 12
    s.players.p1.hand = [X07, SWORD_SPIRIT, SWORD_BRAVE, VANILLA]
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    for (const id of FIVE) s.players.p1.field.spirits.push(createInstance(id, s.turn - 1, 1))
    // 055 の召喚時（直接合体で召喚したときに BP6000以下の相手のスピリットを破壊）が発揮されれば、この相手スピリットが消える
    const target = createInstance(VANILLA, s.turn - 1, 1)
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    const x07Idx = s.players.p1.hand.indexOf(X07)
    assert(act(s, "p1", { type: "summon", handIndex: x07Idx }) === null, "X07 を召喚")
    while (s.pendingChoice !== null && s.pendingChoice.pid === "p1") {
        // 好きなだけ＝全部出す。選択が出る実装なら候補を順に選んで進める
        const err = act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
        if (err) break
    }
    const p1 = s.players.p1
    assert(!p1.hand.includes(SWORD_SPIRIT) && !p1.hand.includes(SWORD_BRAVE), "剣使スピリットと剣刃ブレイヴの両方が手札から出た")
    assert(p1.hand.includes(VANILLA), "剣使でも剣刃でもないカードは出ない")
    assert(p1.field.spirits.some((x) => x.cardId === SWORD_SPIRIT), "ドラコレックスがフィールドに出た")
    assert(s.players.p2.field.spirits.includes(target) && s.players.p2.field.spirits.length === 1, "カーディナル・サンの召喚時効果は発揮されない")
}

console.log("=== X13-12-1. 手札のスピリットカード1枚を破棄して召喚できる ===")
// 赤の軽減は場に赤シンボルが無いので使えない：コスト6＋維持1 → リザーブ 10-7=3
scenario({
    name: "x1312-discard",
    start: { me: { hand: [X1312, VANILLA] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, extraDiscardHandIndices: [1] } as GameAction)
    },
    expect: [
        `自分.手札: ${nm(X1312, VANILLA)} → なし`,
        `自分.トラッシュ: なし → ${getCard(VANILLA).name}`,
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        `自分.${getCard(X1312).name}.場所: なし → フィールド`,
        `自分.${getCard(X1312).name}.疲労: なし → false`,
        `自分.${getCard(X1312).name}.コア: なし → 1`,
        `自分.${getCard(X1312).name}.Lv: なし → 1`,
        `自分.${getCard(X1312).name}.BP: なし → 6000`,
    ],
})

console.log("=== X13-12-2. 手札にスピリットカードが無ければ召喚できない（ネクサスは破棄の代わりにならない） ===")
scenario({
    name: "x1312-no-spirit-in-hand",
    start: { me: { hand: [X1312, NEXUS] } },
    steps(t) {
        t.actRejected("me", { type: "summon", handIndex: 0 })
        t.actRejected("me", { type: "summon", handIndex: 0, extraDiscardHandIndices: [1] } as GameAction)
    },
    expect: [],
})
scenario({
    name: "x1312-alone",
    start: { me: { hand: [X1312] } },
    steps(t) {
        t.actRejected("me", { type: "summon", handIndex: 0 })
    },
    expect: [],
})

console.log("すべてのチェックに合格しました 🎉（part841）")
