// smoke パート839（BS23 B3: 003 シャイニング・ブレイドラ／068 偽りの地下帝国。召喚コストの置き換え）
// 期待値は効果文と公式Q&A（Q4457・Q4458・Q22543・Q22544）だけから書いた
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"

const SHINING = "BS23-003" // シャイニング・ブレイドラ（赤・コスト4・赤軽減2・赤シンボル1）
const DRAGON = "SD10-X01" // 輝龍シャイニング・ドラゴン（赤・コスト6・赤軽減3・召喚時は手札に赤ブレイヴが無ければ何も起きない）
const NEXUS068 = "BS23-068" // 偽りの地下帝国（Lv2＝コア2。紫シンボル1）
const BAARAL = "BS09-017" // 蛇凰神バァラル（紫・コスト10・紫軽減6。召喚時効果なし）
const ASKLE = "BS13-X02" // 蛇皇神帝アスクレピオーズ（紫・コスト9。召喚時は星魂を破壊できなければ何も起きない）
const PHOENIX = "BS07-054" // 神凰兵フェニックス・ゴレム（青・コスト10。召喚時は手札にネクサスが無ければ何も起きない）
const ALDEUS = "BS23-017" // シャドー・アルデウス（紫）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1）

console.log("=== 前提: カードの機械確認 ===")
{
    const n = (id: string) => getCard(id)
    assert(n(SHINING).name === "シャイニング・ブレイドラ" && n(SHINING).cost === 4 && n(SHINING).reduction.length === 2, "003")
    assert(n(DRAGON).name === "輝龍シャイニング・ドラゴン" && n(DRAGON).cost === 6 && n(DRAGON).reduction.length === 3, "SD10-X01")
    assert(n(NEXUS068).name === "偽りの地下帝国" && n(NEXUS068).type === "nexus" && n(NEXUS068).symbol.join() === "purple", "068")
    assert(n(BAARAL).name === "蛇凰神バァラル" && n(BAARAL).cost === 10 && n(BAARAL).colors.join() === "purple" && n(BAARAL).reduction.length === 6, "バァラル")
    assert(n(ASKLE).name === "蛇皇神帝アスクレピオーズ" && n(ASKLE).cost === 9 && n(ASKLE).colors.join() === "purple", "アスクレピオーズ")
    assert(n(PHOENIX).name === "神凰兵フェニックス・ゴレム" && n(PHOENIX).cost === 10 && n(PHOENIX).colors.join() === "blue", "フェニックス・ゴレム")
    assert(n(ALDEUS).name === "シャドー・アルデウス" && n(ALDEUS).name.includes("アルデウス"), "アルデウス")
}

const nm = (...ids: string[]) => ids.map((i) => getCard(i).name).sort().join("、")
const born = (label: string, bp: number, cores = 1, lv = 1) => [
    `自分.${label}.場所: なし → フィールド`,
    `自分.${label}.疲労: なし → false`,
    `自分.${label}.コア: なし → ${cores}`,
    `自分.${label}.Lv: なし → ${lv}`,
    `自分.${label}.BP: なし → ${bp}`,
]
const DRAGON_NAME = getCard(DRAGON).name
const SHINING_NAME = getCard(SHINING).name

console.log("=== 003-1. 召喚した後、手札のドラゴンのコストは自分のライフと同じになり、そのあと軽減も使える（Q4457・Q4458） ===")
// 003: コスト4＋維持1 → リザーブ 10-5=5。ドラゴン: ライフ3 − 場の赤シンボル1（003）＝2、＋維持1 → 5-3=2
scenario({
    name: "003-dragon-cost-life",
    start: { me: { life: 3, hand: [SHINING, DRAGON] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        `自分.手札: ${nm(SHINING, DRAGON)} → なし`,
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 6",
        ...born(SHINING_NAME, 2000),
        ...born(DRAGON_NAME, 5000),
    ],
})

console.log("=== 003-2. ライフが違えばコストも変わる（ライフ5 → 5−1＝4） ===")
scenario({
    name: "003-dragon-cost-life5",
    start: { me: { life: 5, hand: [SHINING, DRAGON] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        `自分.手札: ${nm(SHINING, DRAGON)} → なし`,
        "自分.リザーブ: 10 → 1",
        "自分.トラッシュのコア: 0 → 8",
        ...born(SHINING_NAME, 2000),
        ...born(DRAGON_NAME, 5000),
    ],
})

console.log("=== 003-3. 1枚だけ。2枚目のドラゴンは元のコスト（6 − 赤シンボル2＝4） ===")
// 003=4+1 → 9。1枚目: 3-1=2、+1 → 6。2枚目: 6-2=4、+1 → 1
scenario({
    name: "003-only-one-dragon",
    start: { me: { life: 3, reserve: 14, hand: [SHINING, DRAGON, DRAGON] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        `自分.手札: ${nm(SHINING, DRAGON, DRAGON)} → なし`,
        "自分.リザーブ: 14 → 1",
        "自分.トラッシュのコア: 0 → 10",
        ...born(SHINING_NAME, 2000),
        ...born(DRAGON_NAME, 5000),
        ...born(`${DRAGON_NAME}#2`, 5000),
    ],
})

console.log("=== 003-4. 003 を召喚する前のドラゴンは元のコスト（6、軽減なし）。シャイニング・ドラゴンと入らない手札は変わらない ===")
scenario({
    name: "003-not-before-not-others",
    start: { me: { life: 3, hand: [DRAGON, SHINING, VANILLA] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        `自分.手札: ${nm(DRAGON, SHINING, VANILLA)} → ${nm(SHINING, VANILLA)}`,
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        ...born(DRAGON_NAME, 5000),
    ],
})

console.log("=== 003-5. 003 の効果は自分のライフを数える（相手のライフは見ない） ===")
scenario({
    name: "003-own-life-only",
    start: { me: { life: 3, hand: [SHINING, DRAGON] }, opp: { life: 1 } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        `自分.手札: ${nm(SHINING, DRAGON)} → なし`,
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 6",
        ...born(SHINING_NAME, 2000),
        ...born(DRAGON_NAME, 5000),
    ],
})

console.log("=== 003-6. ターンが変われば元に戻る ===")
{
    const s: GameState = createGame("b3-003-turn", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.life = 3
    s.players.p1.reserve = 14
    s.players.p1.hand = [SHINING, DRAGON]
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "003を召喚")
    assert(act(s, "p1", { type: "endTurn" }) === null, "自分のターン終了")
    assert(s.turnPlayer === "p2" && act(s, "p2", { type: "endTurn" }) === null, "相手のターン終了")
    assert(s.turnPlayer === "p1" && s.pendingChoice === null, "次の自分のターンになった")
    const dragonIdx = s.players.p1.hand.indexOf(DRAGON)
    const before = s.players.p1.reserve
    assert(act(s, "p1", { type: "summon", handIndex: dragonIdx }) === null, "ドラゴンを召喚")
    // 6 − 場の赤シンボル1（003）＋ 維持コア1
    assert(before - s.players.p1.reserve === 6, `次のターンのドラゴンは元のコスト（払った ${before - s.players.p1.reserve}）`)
}

console.log("=== 068-1. Lv2: 印刷コスト10以上の紫は6として扱い、そのあと軽減も使える ===")
// バァラル: 6 − 紫シンボル1（068）＝5、＋維持1 → 12-6=6
scenario({
    name: "068-lv2-baaral",
    start: { me: { reserve: 12, hand: [BAARAL], nexuses: [{ card: NEXUS068, cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [`自分.手札: ${getCard(BAARAL).name} → なし`, "自分.リザーブ: 12 → 6", "自分.トラッシュのコア: 0 → 5", ...born(getCard(BAARAL).name, 6000)],
})

console.log("=== 068-2. Lv1 では効かない（10 − 1＝9） ===")
scenario({
    name: "068-lv1-no-effect",
    start: { me: { reserve: 12, hand: [BAARAL], nexuses: [{ card: NEXUS068, cores: 0 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [`自分.手札: ${getCard(BAARAL).name} → なし`, "自分.リザーブ: 12 → 2", "自分.トラッシュのコア: 0 → 9", ...born(getCard(BAARAL).name, 6000)],
})

console.log("=== 068-3. 何回でも：2枚目は紫シンボルが2つなので 6 − 2＝4 ===")
scenario({
    name: "068-lv2-twice",
    start: { me: { reserve: 14, hand: [BAARAL, BAARAL], nexuses: [{ card: NEXUS068, cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        `自分.手札: ${nm(BAARAL, BAARAL)} → なし`,
        "自分.リザーブ: 14 → 3",
        "自分.トラッシュのコア: 0 → 9",
        ...born(getCard(BAARAL).name, 6000),
        ...born(`${getCard(BAARAL).name}#2`, 6000),
    ],
})

console.log("=== 068-4. 紫でも印刷コスト9は対象外（9 − 1＝8）／紫でないコスト10も対象外（10） ===")
scenario({
    name: "068-purple-cost9",
    start: { me: { reserve: 12, hand: [ASKLE], nexuses: [{ card: NEXUS068, cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [`自分.手札: ${getCard(ASKLE).name} → なし`, "自分.リザーブ: 12 → 3", "自分.トラッシュのコア: 0 → 8", ...born(getCard(ASKLE).name, 7000)],
})
scenario({
    name: "068-blue-cost10",
    start: { me: { reserve: 12, hand: [PHOENIX], nexuses: [{ card: NEXUS068, cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [`自分.手札: ${getCard(PHOENIX).name} → なし`, "自分.リザーブ: 12 → 1", "自分.トラッシュのコア: 0 → 10", ...born(getCard(PHOENIX).name, 7000)],
})

console.log("=== 068-5. 相手の 068 は自分の召喚に効かない（自分のメインステップ・自分の手札） ===")
scenario({
    name: "068-opp-nexus",
    start: { me: { reserve: 12, hand: [BAARAL] }, opp: { nexuses: [{ card: NEXUS068, cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [`自分.手札: ${getCard(BAARAL).name} → なし`, "自分.リザーブ: 12 → 1", "自分.トラッシュのコア: 0 → 10", ...born(getCard(BAARAL).name, 6000)],
})

console.log("=== 068-6. エンドステップ：トラッシュの「アルデウス」1枚を手札に戻せる（任意）。Lv1・Lv2 とも ===")
for (const cores of [0, 2]) {
    for (const accept of [true, false]) {
        const s: GameState = createGame(`b3-068-end-${cores}-${accept}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
        s.interactiveTargets = true
        runTurnStart(s)
        s.turn = 3
        s.players.p1.hand = []
        s.players.p1.trashCards = [ALDEUS, VANILLA]
        s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
        s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
        s.players.p1.field.nexuses.push(createInstance(NEXUS068, s.turn - 1, cores))
        refreshLevelAsOverrides(s)
        assert(act(s, "p1", { type: "endTurn" }) === null, `[コア${cores}] ターン終了`)
        assert(s.pendingChoice !== null && s.pendingChoice.pid === "p1", `[コア${cores}] 戻すかどうかを聞かれる`)
        assert(act(s, "p1", accept ? { type: "resolveChoice", cardIndex: 0 } : { type: "resolveChoice" }) === null, `[コア${cores}] 答える`)
        const h = s.players.p1.hand
        if (accept) assert(h.length === 1 && h[0] === ALDEUS && !s.players.p1.trashCards.includes(ALDEUS) && s.players.p1.trashCards.includes(VANILLA), `[コア${cores}] アルデウスだけが手札へ`)
        else assert(!h.includes(ALDEUS) && s.players.p1.trashCards.includes(ALDEUS), `[コア${cores}] 断れば戻らない`)
    }
}
{
    const s: GameState = createGame("b3-068-end-none", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.trashCards = [VANILLA]
    s.players.p1.field.nexuses.push(createInstance(NEXUS068, s.turn - 1, 2))
    refreshLevelAsOverrides(s)
    act(s, "p1", { type: "endTurn" })
    assert(s.players.p1.trashCards.includes(VANILLA) && s.pendingChoice === null, "アルデウスと入らないカードは戻せず、選択も出ない")
}

console.log("すべてのチェックに合格しました 🎉（part839）")
