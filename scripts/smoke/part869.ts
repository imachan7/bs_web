// smoke パート869（BS23 青 065 海皇剣トライウェーブ・066 ハイドラ・アームズ・083 スピニングソード：効果文だけを根拠にした期待値）
// 公式Q&A：065=Q20359（マジックでなければバーストは戻し、効果も止めない）・Q20360（止めるのは相手のフィールドの効果だけ）／
// 083=Q25249（見たバーストは戻す）・Q25250（バーストが無ければ5枚も破棄しない）・Q25251（【強化】は合計に+1）・Q25252（カード名ごとにターン1回）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"

const TRIWAVE = "BS23-065"
const HYDRA = "BS23-066"
const SPINNING = "BS23-083"
const FALCON = "BS23-048"
const DRACO = "BS23-002" // 恐竜剣聖ドラコレックス（剣使・コスト3・赤）
const ADRIAN = "BS19-057" // 光の衛士アドリアン（【強化】青・青シンボル1）
const ILULYANKASH = "BS16-053" // イルルヤンカッシュ（コスト6・軽減青2）
const ROKU = "BS01-002"
const METAL = "BS01-008" // メタルバーン（コスト3）
const SHOCK = "BS01-054" // ショックイーター（コスト2）
const DARKRAYS = "BS03-018" // ダークレイス（コスト4）
const WILD_POWER = "BS01-133" // ワイルドパワー（マジック）

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string, string, number][] = [
        [TRIWAVE, "海皇剣トライウェーブ", "brave", 4], [HYDRA, "ハイドラ・アームズ", "brave", 5], [SPINNING, "スピニングソード", "magic", 2],
        [FALCON, "ファルコパンサー", "spirit", 3], [DRACO, "恐竜剣聖ドラコレックス", "spirit", 3], [ADRIAN, "光の衛士アドリアン", "spirit", 1],
        [ILULYANKASH, "イルルヤンカッシュ", "spirit", 6], [ROKU, "ロクケラトプス", "spirit", 1], [METAL, "メタルバーン", "spirit", 3],
        [SHOCK, "ショックイーター", "spirit", 2], [DARKRAYS, "ダークレイス", "spirit", 4], [WILD_POWER, "ワイルドパワー", "magic", 2],
    ]
    for (const [id, name, type, cost] of expect) {
        const c = getCard(id)
        assert(c.name === name && c.type === type && c.cost === cost, `${id} は ${name}（${type}・コスト${cost}）`)
    }
}

const names = (xs: string[]) => xs.map((x) => getCard(x).name).sort().join("、")

function answerAll(s: GameState, o: { yes?: boolean; picks?: string[] } = {}): void {
    const yes = o.yes ?? true
    const picks = [...(o.picks ?? [])]
    for (let i = 0; i < 12 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        let action: GameAction
        if (pc.kind === "option") {
            action = pc.confirm && !yes ? { type: "resolveChoice" } : { type: "resolveChoice", option: (pc.options ?? []).find((x) => x.includes("発動する")) ?? pc.options![0]! }
        } else if (pc.kind === "target") {
            const want = picks.find((x) => pc.candidates.includes(x))
            if (want) {
                picks.splice(picks.indexOf(want), 1)
                action = { type: "resolveChoice", instanceId: want }
            } else action = pc.optional ? { type: "resolveChoice" } : { type: "resolveChoice", instanceId: pc.candidates[0]! }
        } else {
            action = pc.optional ? { type: "resolveChoice" } : { type: "resolveChoice", cardIndex: pc.cardIndices![0]! }
        }
        if (act(s, pc.pid, action) !== null) break
    }
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.interactiveTargets = true
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p2.deck = Array.from({ length: 40 }, () => ROKU)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function combine(s: GameState, host: ReturnType<typeof put>, brave: ReturnType<typeof put>): void {
    const err = act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    assert(err === null, `合体できる${err === null ? "" : `（拒否: ${err}）`}`)
}
function closeFlash(s: GameState): void {
    for (let i = 0; i < 6 && s.isFlashTiming && s.battle; i++) if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
}
const onField = (s: GameState, pid: PlayerId, instanceId: string) =>
    [...s.players[pid].field.spirits, ...s.players[pid].field.combinedBraves].some((x) => x.instanceId === instanceId)

console.log("=== 065: 【合体時】合体アタック時 相手のバーストを見て、マジックなら破棄し、このバトルの間 相手のフィールドの効果は発揮されない ===")
// ドラコレックス(赤)＋トライウェーブ(青)＝シンボル2つ・BP3000+4000=7000。相手のファルコパンサーは「シンボル2つ以上をブロックしたときBP+7000」で、効果が止まらなければ10000で勝つ
function triwaveGame(burst: string | null) {
    const s = game("triwave")
    const host = put(s, "p1", DRACO, 1)
    combine(s, host, put(s, "p1", TRIWAVE, 1))
    const falcon = put(s, "p2", FALCON, 1)
    if (burst !== null) {
        s.players.p2.burst = burst
        s.players.p2.burstSet = true
    }
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体アタックできる")
    return { s, host, falcon }
}
function blockWithFalcon(s: GameState, falconId: string): void {
    closeFlash(s)
    assert(act(s, "p2", { type: "block", instanceId: falconId }) === null, "ファルコパンサーがブロックできる")
    closeFlash(s)
}
{
    const { s, host, falcon } = triwaveGame(WILD_POWER)
    assert(s.players.p2.burst === null, "マジックのバーストは破棄される")
    assert(s.players.p2.trashCards.includes(WILD_POWER), "破棄されたバーストは相手のトラッシュにある")
    blockWithFalcon(s, falcon.instanceId)
    assert(onField(s, "p1", host.instanceId), "相手の効果（ファルコのBP+7000）が止まるので、BP7000の合体スピリットが勝って残る")
    assert(!onField(s, "p2", falcon.instanceId), "ファルコパンサー（BP3000）が破壊される")
}
// マジックでなければバーストは戻し、効果も止めない（Q20359）
{
    const { s, host, falcon } = triwaveGame(METAL)
    assert(s.players.p2.burst === METAL, "マジックでないバーストは戻される（伏せたまま）")
    assert(!s.players.p2.trashCards.includes(METAL), "マジックでないバーストは破棄されない")
    blockWithFalcon(s, falcon.instanceId)
    assert(!onField(s, "p1", host.instanceId), "効果は止まらないので、ファルコがBP10000で勝つ")
}
// バーストが無ければ何も起きない
{
    const { s, host, falcon } = triwaveGame(null)
    blockWithFalcon(s, falcon.instanceId)
    assert(!onField(s, "p1", host.instanceId), "バーストが無ければ効果は止まらず、ファルコがBP10000で勝つ")
}

console.log("=== 066: 召喚時 相手のライフのコア1個につき、コスト3以下の相手のスピリット1体を破壊 ／ 【合体時】手札3枚以下なら青のシンボル1つを追加 ===")
function hydraSummon(life: number) {
    const s = game("hydra")
    s.players.p1.hand = [HYDRA]
    s.players.p2.life = life
    const a = put(s, "p2", ROKU, 1)
    const b = put(s, "p2", METAL, 1)
    const c = put(s, "p2", SHOCK, 1)
    const d = put(s, "p2", DARKRAYS, 1)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ハイドラ・アームズを召喚できる")
    return { s, a, b, c, d }
}
{
    const { s, a, b, c, d } = hydraSummon(2)
    const pc = s.pendingChoice
    assert(pc !== null && pc.kind === "target" && pc.candidates.includes(a.instanceId) && !pc.candidates.includes(d.instanceId), "候補はコスト3以下だけ（ダークレイス・コスト4は含まない）")
    answerAll(s, { picks: [a.instanceId, b.instanceId] })
    assert(!onField(s, "p2", a.instanceId) && !onField(s, "p2", b.instanceId), "ライフ2つぶんで選んだ2体が破壊される")
    assert(onField(s, "p2", c.instanceId) && onField(s, "p2", d.instanceId), "3体目（コスト2）とコスト4は残る")
}
{
    const { s, a, b, c, d } = hydraSummon(5)
    answerAll(s, { picks: [a.instanceId, b.instanceId, c.instanceId] })
    assert(!onField(s, "p2", a.instanceId) && !onField(s, "p2", b.instanceId) && !onField(s, "p2", c.instanceId), "ライフ5でも対象はコスト3以下の3体だけ")
    assert(onField(s, "p2", d.instanceId), "コスト4は破壊されない")
}
{
    // 青のシンボルが増えたかは、あとから召喚するイルルヤンカッシュ（コスト6・軽減青2）の支払いで見る
    const reserveSpentOnIlulyankash = (handFiller: number): number => {
        const s = game("hydra-symbol")
        s.players.p1.hand = [ILULYANKASH, ...Array.from({ length: handFiller }, () => ROKU)]
        const host = put(s, "p1", DRACO, 1) // コスト3・赤シンボル
        combine(s, host, put(s, "p1", HYDRA, 1))
        answerAll(s)
        const before = s.players.p1.reserve
        assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "イルルヤンカッシュを召喚できる")
        return before - s.players.p1.reserve
    }
    assert(reserveSpentOnIlulyankash(2) === 6, "手札3枚以下で合体すると青シンボル+1：コスト6-1+維持コア1=6個を支払う")
    assert(reserveSpentOnIlulyankash(3) === 7, "手札4枚以上なら追加されない：コスト6+維持コア1=7個を支払う")
}

console.log("=== 083: フラッシュ 相手のバーストを見て、そのコストと同じ枚数デッキ破棄。剣使がいればさらに5枚。ターン1回 ===")
const trashOf = (n: number) => Array.from({ length: n }, () => "ロクケラトプス").join("、")
const castLines = (reserve: number, trashCores: number) => [
    `自分.手札: スピニングソード → なし`,
    `自分.リザーブ: 10 → ${reserve}`,
    `自分.トラッシュのコア: 0 → ${trashCores}`,
    "自分.トラッシュ: なし → スピニングソード",
]
const cast = (hand = 0): GameAction => ({ type: "castMagic", handIndex: hand, timing: "flash" })
// 剣使がいない：バーストのコスト3ぶんだけ。見たバーストは戻す（Q25249）
scenario({
    name: "spinning-no-kenshi",
    start: { me: { hand: [SPINNING], spirits: [{ card: ROKU }] }, opp: { burst: METAL } },
    steps(t) {
        t.act("me", cast())
    },
    expect: [...castLines(8, 2), "相手.デッキ枚数: 40 → 37", `相手.トラッシュ: なし → ${trashOf(3)}`],
})
// 剣使がいる：3枚に加えてさらに5枚＝8枚
scenario({
    name: "spinning-kenshi",
    start: { me: { hand: [SPINNING], spirits: [{ card: DRACO }] }, opp: { burst: METAL } },
    steps(t) {
        t.act("me", cast())
    },
    expect: [...castLines(8, 2), "相手.デッキ枚数: 40 → 32", `相手.トラッシュ: なし → ${trashOf(8)}`],
})
// バーストが無ければ、剣使がいても5枚も破棄しない（Q25250）
scenario({
    name: "spinning-no-burst",
    start: { me: { hand: [SPINNING], spirits: [{ card: DRACO }] } },
    steps(t) {
        t.act("me", cast())
    },
    expect: castLines(8, 2),
})
// 【強化】（青）：最終の枚数に+1が合計で1回（Q25251）。アドリアンの青シンボルでコスト1に軽減される
scenario({
    name: "spinning-kyoka",
    start: { me: { hand: [SPINNING], spirits: [{ card: ADRIAN }] }, opp: { burst: METAL } },
    steps(t) {
        t.act("me", cast())
    },
    expect: [...castLines(9, 1), "相手.デッキ枚数: 40 → 36", `相手.トラッシュ: なし → ${trashOf(4)}`],
})
scenario({
    name: "spinning-kyoka-kenshi",
    start: { me: { hand: [SPINNING], spirits: [{ card: ADRIAN }, { card: DRACO }] }, opp: { burst: METAL } },
    steps(t) {
        t.act("me", cast())
    },
    expect: [...castLines(9, 1), "相手.デッキ枚数: 40 → 31", `相手.トラッシュ: なし → ${trashOf(9)}`],
})
// 同じ名前のカードは同じターンに2枚目を使えない（Q25252）
scenario({
    name: "spinning-once-per-turn",
    start: { me: { hand: [SPINNING, SPINNING], spirits: [{ card: ROKU }] }, opp: { burst: METAL } },
    steps(t) {
        t.act("me", cast())
        t.actRejected("me", cast())
    },
    expect: [
        `自分.手札: ${names([SPINNING, SPINNING])} → ${names([SPINNING])}`,
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.トラッシュ: なし → スピニングソード",
        "相手.デッキ枚数: 40 → 37",
        `相手.トラッシュ: なし → ${trashOf(3)}`,
    ],
})

console.log("すべてのチェックに合格しました 🎉（part869）")
