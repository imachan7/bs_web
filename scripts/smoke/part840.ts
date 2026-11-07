// smoke パート840（BS23 B3: 084 ディープシーイリュージョン。ネクサスを疲労させて召喚コストを払う）
// Q25253・Q25254・Q25255。ネクサスを疲労させる指定は召喚アクションに shinsokuAssistInstanceIds を付ける想定（未実装の仮の名前。設計で変わったら直す）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameAction, GameState } from "./helpers"
import { scenario } from "./scenario"

const MAGIC = "BS23-084" // ディープシーイリュージョン（青・コスト3・青軽減2）
const SPIRIT = "BS21-005" // ブレード・プテラス（赤・コスト4・赤軽減4・効果なし）
const BRAVE = "BS23-055" // 太陽剣カーディナル・サン（赤・コスト4・赤軽減1）
const NX_A = "BS01-107" // 命の果実（緑シンボル）
const NX_B = "BS02-081" // 緑芽吹く原野（緑シンボル）
const NX_C = "BS03-106" // 深緑の樹海（緑シンボル）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1）

console.log("=== 前提: カードの機械確認 ===")
{
    const n = (id: string) => getCard(id)
    assert(n(MAGIC).name === "ディープシーイリュージョン" && n(MAGIC).type === "magic" && n(MAGIC).cost === 3, "084")
    assert(n(SPIRIT).name === "ブレード・プテラス" && n(SPIRIT).cost === 4 && n(SPIRIT).reduction.length === 4 && !n(SPIRIT).effect, "プテラス")
    assert(n(BRAVE).name === "太陽剣カーディナル・サン" && n(BRAVE).type === "brave" && n(BRAVE).cost === 4, "カーディナル・サン")
    assert([NX_A, NX_B, NX_C].every((i) => getCard(i).type === "nexus" && getCard(i).symbol.join() === "green"), "ネクサスは緑シンボル（青のマジックと赤のスピリットの軽減に絡まない）")
}

const nm = (...ids: string[]) => ids.map((i) => getCard(i).name).sort().join("、")
const SPIRIT_NAME = getCard(SPIRIT).name
const born = (label: string, bp: number) => [
    `自分.${label}.場所: なし → フィールド`,
    `自分.${label}.疲労: なし → false`,
    `自分.${label}.コア: なし → 1`,
    `自分.${label}.Lv: なし → 1`,
    `自分.${label}.BP: なし → ${bp}`,
]
const nexuses = [
    { card: NX_A, label: "A", cores: 0 },
    { card: NX_B, label: "B", cores: 0 },
    { card: NX_C, label: "C", cores: 0 },
]
const withNexus = (handIndex: number, ...ids: string[]) => ({ type: "summon", handIndex, shinsokuAssistInstanceIds: ids }) as unknown as GameAction
const MAGIC_NAME = getCard(MAGIC).name

console.log("=== 1. 一部だけネクサス（2つ）、残りはコア：4 − 2 ＝ 2 をリザーブから払う（Q25254） ===")
// 084: コスト3 → リザーブ 10-3=7。召喚: 2＋維持1 → 4
scenario({
    name: "084-partial",
    start: { me: { hand: [MAGIC, SPIRIT], nexuses } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.act("me", withNexus(0, t.id("A"), t.id("B")))
    },
    expect: [
        `自分.手札: ${nm(MAGIC, SPIRIT)} → なし`,
        `自分.トラッシュ: なし → ${MAGIC_NAME}`,
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.A.疲労: false → true",
        "自分.B.疲労: false → true",
        ...born(SPIRIT_NAME, 4000),
    ],
})

console.log("=== 2. ネクサスを好きなだけ（3つ）：4 − 3 ＝ 1 ===")
scenario({
    name: "084-three",
    start: { me: { hand: [MAGIC, SPIRIT], nexuses } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.act("me", withNexus(0, t.id("A"), t.id("B"), t.id("C")))
    },
    expect: [
        `自分.手札: ${nm(MAGIC, SPIRIT)} → なし`,
        `自分.トラッシュ: なし → ${MAGIC_NAME}`,
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.A.疲労: false → true",
        "自分.B.疲労: false → true",
        "自分.C.疲労: false → true",
        ...born(SPIRIT_NAME, 4000),
    ],
})

console.log("=== 3. ネクサスを使わない召喚は通常どおり（疲労させなくてよい）。2枚目は使えない（Q25255） ===")
// 1枚目: A だけ（4−1＋維持1＝4）。リザーブ 14-3=11 → 7。2枚目はネクサスを指定すると拒否、指定しなければ 4＋1 → 2
scenario({
    name: "084-only-one-summon",
    start: { me: { reserve: 14, hand: [MAGIC, SPIRIT, SPIRIT], nexuses } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.act("me", withNexus(0, t.id("A")))
        t.actRejected("me", withNexus(0, t.id("B")))
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        `自分.手札: ${nm(MAGIC, SPIRIT, SPIRIT)} → なし`,
        `自分.トラッシュ: なし → ${MAGIC_NAME}`,
        "自分.リザーブ: 14 → 3",
        "自分.トラッシュのコア: 0 → 9",
        "自分.A.疲労: false → true",
        ...born(SPIRIT_NAME, 4000),
        ...born(`${SPIRIT_NAME}#2`, 4000),
    ],
})

console.log("=== 4. 084 を使っていないターンはネクサスで払えない／相手のネクサス・疲労済みのネクサスは使えない ===")
scenario({
    name: "084-not-used",
    start: { me: { hand: [SPIRIT], nexuses } },
    steps(t) {
        t.actRejected("me", withNexus(0, t.id("A")))
    },
    expect: [],
})
scenario({
    name: "084-opp-or-rested-nexus",
    start: {
        me: { hand: [MAGIC, SPIRIT], nexuses: [{ card: NX_A, label: "A", cores: 0 }, { card: NX_B, label: "B", cores: 0, rested: true }] },
        opp: { nexuses: [{ card: NX_C, label: "C", cores: 0 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.actRejected("me", withNexus(0, t.id("相手.C")))
        t.actRejected("me", withNexus(0, t.id("自分.B")))
    },
    expect: [`自分.手札: ${nm(MAGIC, SPIRIT)} → ${getCard(SPIRIT).name}`, `自分.トラッシュ: なし → ${MAGIC_NAME}`, "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3"],
})

console.log("=== 5. ブレイヴカードの召喚にも使える（4 − 1 ＝ 3、＋維持1） ===")
{
    const s: GameState = createGame("b3-084-brave", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p1.hand = [MAGIC, BRAVE]
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    const nx = createInstance(NX_A, s.turn - 1, 0)
    s.players.p1.field.nexuses.push(nx)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "084 を使用")
    const before = s.players.p1.reserve
    assert(act(s, "p1", withNexus(0, nx.instanceId)) === null, "ブレイヴをネクサス1つで召喚")
    assert(before - s.players.p1.reserve === 4 && nx.isRested, `ブレイヴ: リザーブから ${before - s.players.p1.reserve}（4のはず）、ネクサスは疲労`)
}

console.log("=== 6. フラッシュ：このターンの間、スピリット1体をBP+1000 ===")
scenario({
    name: "084-flash-bp",
    start: { me: { hand: [MAGIC], spirits: [{ card: VANILLA, label: "ロク" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ロク") })
        if (t.state.priorityPlayer !== t.me) t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ロク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        `自分.手札: ${MAGIC_NAME} → なし`,
        `自分.トラッシュ: なし → ${MAGIC_NAME}`,
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.ロク.疲労: false → true",
        "自分.ロク.BP: 1000 → 2000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part840）")
