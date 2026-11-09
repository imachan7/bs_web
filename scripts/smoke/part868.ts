// smoke パート868（BS23 青 050 異海剣聖シュブ・ニグラ【合体時】・051 鍛冶屋のベータ・052 剣聖将軍フィランダー【合体時】：効果文だけを根拠にした期待値）
// 公式Q&A：051=Q4573（コストを支払わない召喚は対象外）・Q4574（カード名ごとにターン1回）／052=Q4576（破壊しなければブレイヴも破壊しない）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const SHUBU = "BS23-050" // 異海剣聖シュブ・ニグラ（剣使/異合）
const BETA = "BS23-051"
const FILANDER = "BS23-052"
const TRIWAVE = "BS23-065" // 海皇剣トライウェーブ（剣刃・合体条件 剣使・コスト4）
const ANGEL_HALO = "BS23-063" // 光輪剣エンジェルハイロゥ（剣刃・コスト4）
const DRACO = "BS23-002" // 恐竜剣聖ドラコレックス（剣使）
const UGARULUM = "BS04-064" // ウガルルム（異合・Lv1 コア2）
const ROKU = "BS01-002"
const NEXUS_A = "BS06-089" // 鎖縛の武舞台
const NEXUS_B = "BS11-072" // 未完成の古代戦艦：船尾
const VOLCANO = "BS03-101" // ボルカノ・ゴレム（コスト8）
const DURANZAM = "BS22-X06" // 海皇巨神デュランザム（コスト10）
const IVERN = "BS01-005"

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string, string, number][] = [
        [SHUBU, "異海剣聖シュブ・ニグラ", "spirit", 4], [BETA, "鍛冶屋のベータ", "spirit", 4], [FILANDER, "剣聖将軍フィランダー", "spirit", 5],
        [TRIWAVE, "海皇剣トライウェーブ", "brave", 4], [ANGEL_HALO, "光輪剣エンジェルハイロゥ", "brave", 4], [DRACO, "恐竜剣聖ドラコレックス", "spirit", 3],
        [UGARULUM, "ウガルルム", "spirit", 2], [ROKU, "ロクケラトプス", "spirit", 1], [NEXUS_A, "鎖縛の武舞台", "nexus", 3],
        [NEXUS_B, "未完成の古代戦艦：船尾", "nexus", 3], [VOLCANO, "ボルカノ・ゴレム", "spirit", 8], [DURANZAM, "海皇巨神デュランザム", "spirit", 10],
        [IVERN, "アイバーン", "spirit", 2],
    ]
    for (const [id, name, type, cost] of expect) {
        const c = getCard(id)
        assert(c.name === name && c.type === type && c.cost === cost, `${id} は ${name}（${type}・コスト${cost}）`)
    }
    assert(getCard(TRIWAVE).family.includes("剣刃") && getCard(ANGEL_HALO).family.includes("剣刃"), "065・063 は剣刃")
    assert(getCard(SHUBU).family.includes("剣使") && getCard(SHUBU).family.includes("異合"), "050 は剣使・異合")
}

// 「発動する」を答え、対象・カード選択は picks／cards の順に選ぶ。yes=false の確認は断る（スキップ＝発動しない）
function answerAll(s: GameState, o: { yes?: boolean; picks?: string[]; cards?: string[] } = {}): void {
    const yes = o.yes ?? true
    const picks = [...(o.picks ?? [])]
    const cards = [...(o.cards ?? [])]
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
            const zone = pc.cardZone === "trash" ? s.players[pc.cardOwner!].trashCards : s.players[pc.cardOwner!].hand
            const idx = (pc.cardIndices ?? []).find((n) => cards.includes(zone[n]!))
            action = idx !== undefined ? { type: "resolveChoice", cardIndex: idx } : pc.optional ? { type: "resolveChoice" } : { type: "resolveChoice", cardIndex: pc.cardIndices![0]! }
        }
        const err = act(s, pc.pid, action)
        if (err !== null) break
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
// ホストにブレイヴ（スピリット状態で置いたもの）を合体させる
function combine(s: GameState, host: ReturnType<typeof put>, brave: ReturnType<typeof put>): void {
    const err = act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    assert(err === null, `合体できる${err === null ? "" : `（拒否: ${err}）`}`)
}

console.log("=== 050: 【合体時】Lv2･Lv3 剣使/異合の自分のスピリットがアタックしたとき、ボイドからこのスピリットにコア1個 ===")
// 合体中のシュブ・ニグラ(Lv2)。剣使のドラコレックスがアタック→コア+1
function shubuGame(combined: boolean) {
    const s = game("shubu")
    const host = put(s, "p1", SHUBU, 2)
    const draco = put(s, "p1", DRACO, 1)
    const ugarulum = put(s, "p1", UGARULUM, 2)
    const roku = put(s, "p1", ROKU, 1)
    if (combined) combine(s, host, put(s, "p1", TRIWAVE, 1))
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    return { s, host, draco, ugarulum, roku }
}
{
    const { s, host, draco } = shubuGame(true)
    const before = host.cores
    assert(act(s, "p1", { type: "attack", instanceId: draco.instanceId }) === null, "ドラコレックス（剣使）がアタックできる")
    assert(host.cores === before + 1, `剣使のスピリットのアタックでシュブ・ニグラにコア+1（${before} → ${host.cores}）`)
}
{
    const { s, host, ugarulum } = shubuGame(true)
    const before = host.cores
    assert(act(s, "p1", { type: "attack", instanceId: ugarulum.instanceId }) === null, "ウガルルム（異合）がアタックできる")
    assert(host.cores === before + 1, `異合のスピリットのアタックでコア+1（${before} → ${host.cores}）`)
}
// 「このスピリット以外」と書かれていないので、シュブ・ニグラ自身のアタックも数える（2026-10-29）
{
    const { s, host } = shubuGame(true)
    const before = host.cores
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体したシュブ・ニグラがアタックできる")
    assert(host.cores === before + 1, `自身のアタックでもコア+1（${before} → ${host.cores}）`)
}
{
    const { s, host, roku } = shubuGame(true)
    const before = host.cores
    assert(act(s, "p1", { type: "attack", instanceId: roku.instanceId }) === null, "ロクケラトプス（系統が違う）がアタックできる")
    assert(host.cores === before, `剣使でも異合でもないスピリットのアタックではコアは増えない（${before} → ${host.cores}）`)
}
// 合体していない（【合体時】の効果ではない状態）ならコアは増えない
{
    const { s, host, draco } = shubuGame(false)
    const before = host.cores
    assert(act(s, "p1", { type: "attack", instanceId: draco.instanceId }) === null, "合体していないときも剣使がアタックできる")
    assert(host.cores === before, `合体していないシュブ・ニグラにはコアは増えない（${before} → ${host.cores}）`)
}

console.log("=== 051: 剣刃ブレイヴをコストを支払って召喚したとき、手札のネクサス1枚をコストを支払わず配置できる（ターン1回） ===")
const names = (xs: string[]) => xs.map((x) => getCard(x).name).sort().join("、")
const betaSide = (hand: string[], extra: { card: string; label: string }[] = [{ card: BETA, label: "ベータ" }]) => ({ me: { hand, spirits: extra } })
const answerYes = (t: ScenarioCtx, o: { yes?: boolean; cards?: string[] } = {}) => answerAll(t.state, o)
const nexusLines = (name: string) => [
    `自分.${name}.場所: なし → ネクサス`,
    `自分.${name}.疲労: なし → false`,
    `自分.${name}.コア: なし → 0`,
    `自分.${name}.Lv: なし → 1`,
]
const braveLines = [
    "自分.海皇剣トライウェーブ.場所: なし → フィールド",
    "自分.海皇剣トライウェーブ.疲労: なし → false",
    "自分.海皇剣トライウェーブ.コア: なし → 1",
    "自分.海皇剣トライウェーブ.Lv: なし → 1",
    "自分.海皇剣トライウェーブ.BP: なし → 4000",
]
// コスト4 - ベータの青シンボル1 = 3、Lv1の維持コア1
scenario({
    name: "beta-accept",
    start: { interactive: true, ...betaSide([TRIWAVE, NEXUS_A]) },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        answerYes(t, { cards: [NEXUS_A] })
    },
    expect: [`自分.手札: ${names([TRIWAVE, NEXUS_A])} → なし`, "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 3", ...braveLines, ...nexusLines("鎖縛の武舞台")],
})
// 「配置できる」なので断れる
scenario({
    name: "beta-decline",
    start: { interactive: true, ...betaSide([TRIWAVE, NEXUS_A]) },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        answerYes(t, { yes: false })
    },
    expect: [`自分.手札: ${names([TRIWAVE, NEXUS_A])} → 鎖縛の武舞台`, "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 3", ...braveLines],
})
// 剣刃でないスピリットの召喚では出ない
scenario({
    name: "beta-non-brave",
    start: { interactive: true, ...betaSide([ROKU, NEXUS_A]) },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        answerYes(t)
    },
    expect: [
        `自分.手札: ${names([ROKU, NEXUS_A])} → 鎖縛の武舞台`,
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 1",
        "自分.ロクケラトプス.場所: なし → フィールド",
        "自分.ロクケラトプス.疲労: なし → false",
        "自分.ロクケラトプス.コア: なし → 1",
        "自分.ロクケラトプス.Lv: なし → 1",
        "自分.ロクケラトプス.BP: なし → 1000",
    ],
})
// ターン1回：2体目の剣刃ブレイヴを召喚しても、ネクサスはもう置けない
scenario({
    name: "beta-once-per-turn",
    start: { interactive: true, ...betaSide([TRIWAVE, ANGEL_HALO, NEXUS_A, NEXUS_B]) },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        answerYes(t, { cards: [NEXUS_A] })
        t.act("me", { type: "summon", handIndex: 0 })
        answerYes(t, { cards: [NEXUS_B] })
    },
    expect: [
        `自分.手札: ${names([TRIWAVE, ANGEL_HALO, NEXUS_A, NEXUS_B])} → ${names([NEXUS_B])}`,
        "自分.リザーブ: 10 → 1", // 065は3+1、063は4+1
        "自分.トラッシュのコア: 0 → 7",
        ...braveLines,
        "自分.光輪剣エンジェルハイロゥ.場所: なし → フィールド",
        "自分.光輪剣エンジェルハイロゥ.疲労: なし → false",
        "自分.光輪剣エンジェルハイロゥ.コア: なし → 1",
        "自分.光輪剣エンジェルハイロゥ.Lv: なし → 1",
        "自分.光輪剣エンジェルハイロゥ.BP: なし → 2000",
        ...nexusLines("鎖縛の武舞台"),
    ],
})
// ベータが2体いても、同じ召喚でネクサスは1枚だけ（カード名ごとにターン1回。Q4574）。コスト4 - 青2 = 2、維持コア1
scenario({
    name: "beta-two-betas",
    start: { interactive: true, ...betaSide([TRIWAVE, NEXUS_A, NEXUS_B], [{ card: BETA, label: "ベータA" }, { card: BETA, label: "ベータB" }]) },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        answerYes(t, { cards: [NEXUS_A, NEXUS_B] })
    },
    expect: [
        `自分.手札: ${names([TRIWAVE, NEXUS_A, NEXUS_B])} → ${names([NEXUS_B])}`,
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 2",
        ...braveLines,
        ...nexusLines("鎖縛の武舞台"),
    ],
})
// コストを支払わない召喚（052の【抜刀】）では出ない
{
    const s = game("beta-batto")
    s.players.p1.hand = [FILANDER, TRIWAVE, NEXUS_A, ROKU, ROKU]
    put(s, "p1", BETA, 1)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "052を召喚できる")
    answerAll(s, { cards: [ROKU], picks: [] })
    const mine = s.players.p1
    const brave = [...mine.field.spirits, ...mine.field.combinedBraves].some((x) => x.cardId === TRIWAVE)
    assert(brave, "【抜刀】で065が出ている")
    assert(mine.field.nexuses.length === 0, "【抜刀】（コストを支払わない召喚）ではネクサスは置かれない")
}

console.log("=== 052: 【合体時】Lv2･Lv3 アタック時 このスピリットのコスト以下の相手のスピリット1体を破壊できる。発揮後、ブレイヴ1つを破壊 ===")
// 合体スピリットのコストはスピリット5＋ブレイヴ4＝9。コスト8のボルカノ・ゴレムは対象、コスト10のデュランザムは対象外
function fil(oppSpirits: string[], combined = true) {
    const s = game("fil")
    const host = put(s, "p1", FILANDER, 3)
    const brave = put(s, "p1", TRIWAVE, 1)
    if (combined) combine(s, host, brave)
    const opp = oppSpirits.map((c) => put(s, "p2", c, 1))
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    return { s, host, brave, opp }
}
{
    const { s, host, brave, opp } = fil([VOLCANO, DURANZAM])
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体したフィランダーがアタックできる")
    const pc = s.pendingChoice
    if (pc && pc.confirm) answerAll(s, { picks: [] })
    const pc2 = s.pendingChoice
    assert(pc2 !== null && pc2.kind === "target" && pc2.candidates.includes(opp[0]!.instanceId) && !pc2.candidates.includes(opp[1]!.instanceId), "対象の候補は合計コスト9以下（ボルカノ・ゴレム）だけ")
    answerAll(s, { picks: [opp[0]!.instanceId] })
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === opp[0]!.instanceId), "ボルカノ・ゴレムが破壊された")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === opp[1]!.instanceId), "デュランザムは破壊されない")
    assert(s.players.p1.field.combinedBraves.every((x) => x.instanceId !== brave.instanceId), "破壊した後にブレイヴ1つが破壊された")
    assert(s.players.p1.trashCards.includes(TRIWAVE), "破壊されたブレイヴはトラッシュにある")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "フィランダー本体は場に残る")
}
// 破壊しなければブレイヴも破壊しない（Q4576）：対象がいない場合
{
    const { s, host, brave, opp } = fil([DURANZAM])
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "アタックできる")
    answerAll(s)
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === opp[0]!.instanceId), "対象外のデュランザムは破壊されない")
    assert(s.players.p1.field.combinedBraves.some((x) => x.instanceId === brave.instanceId), "破壊しなかったのでブレイヴも破壊されない（Q4576）")
}
// 破壊しなければブレイヴも破壊しない（Q4576）：確認を断った場合
{
    const { s, host, brave, opp } = fil([VOLCANO])
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "アタックできる")
    answerAll(s, { yes: false })
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === opp[0]!.instanceId), "断ったので破壊されない")
    assert(s.players.p1.field.combinedBraves.some((x) => x.instanceId === brave.instanceId), "断ったのでブレイヴも破壊されない（Q4576）")
}
// 合体していなければ【合体時】の効果は発揮されない
{
    const { s, host, opp } = fil([IVERN], false)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体していないフィランダーがアタックできる")
    answerAll(s)
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === opp[0]!.instanceId), "合体していなければ破壊されない")
}

void IVERN
console.log("すべてのチェックに合格しました 🎉（part868）")
