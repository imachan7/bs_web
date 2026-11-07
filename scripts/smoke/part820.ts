// smoke パート820（BS22 B8 召喚：003 プロフェット・ドラゴン／073 ジェネレートファイア／012 骸魔インプ／072 アトライア海帝国。BS22_PLAN §1）
// 4枚とも data/staging/BS22.json にしか無い（実装前は読めず落ちる）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, destroySpirit, effectiveBp, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const PROPHET = "BS22-003" // プロフェット・ドラゴン（赤・コスト2・Lv1 BP2000・召喚時：コスト8以上のスピリットを手元に置いてドロー）
const GENERATE = "BS22-073" // ジェネレートファイア（赤・マジック・コスト5・メイン＋フラッシュ）
const IMP = "BS22-012" // 骸魔インプ（紫・コスト3・Lv1 BP3000）
const ATRAIA = "BS22-072" // アトライア海帝国（青・ネクサス・コスト4・Lv1=0コア／Lv2=1コア）

const GORA = "BS01-001" // ゴラドン（赤・コスト0・BP1000・コア1）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・BP3000）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・BP3000）
const MELT = "BS03-009" // 火吹きメルト（赤・コスト5・BP4000）
const HYDRA = "BS02-023" // 双蛇ヒュドラム（紫・コスト6・Lv1 BP4000・コア1）
const KUJA = "BS04-009" // 炎皇クジャラク（赤・コスト6・Lv1 BP5000・コア2）
const FORT = "BS03-068" // フォルトロス（黄・コスト7・Lv1 BP5000・コア1）
const SOL = "BS01-096" // 妖機妃ソール（白・コスト8）
const VAL = "BS01-097" // 飛龍ヴァルキュリウス（白・コスト8）
const HEDI = "BS01-045" // 切り裂きヘディレス（赤・コスト5・Lv1 BP2000・破壊時に手札へ戻る）
const MARU = "BS14-047" // マルティウサギ（コスト2・破壊時に手札のコスト2以下を無償召喚）
const BRAVE3 = "BS10-061" // 剣鎧竜バスター・ドラゴン（赤・ブレイヴ・コスト3）
const DATAS = "BS20-050" // トライデントのデータス（青・コスト4・【粉砕】）

const NAME: Record<string, string> = {
    [PROPHET]: "プロフェット・ドラゴン",
    [GENERATE]: "ジェネレートファイア",
    [IMP]: "骸魔インプ",
    [ATRAIA]: "アトライア海帝国",
}
const nameOf = (id: string) => NAME[id] ?? getCard(id).name
const names = (ids: string[]) => ids.map(nameOf).sort().join("、") || "なし"

console.log("=== 前提: カードの機械確認 ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS22.json", "utf8")) as { cardId: string; name: string; type: string; colors: string[]; cost: number; family: string[]; levels: { level: number; cores: number; bp: number }[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    const p = byId(PROPHET)
    assert(p?.name === "プロフェット・ドラゴン" && p.type === "spirit" && p.colors[0] === "red" && p.cost === 2 && p.levels[0]!.bp === 2000, "PROPHETはプロフェット・ドラゴン（赤・コスト2・Lv1 BP2000）")
    const g = byId(GENERATE)
    assert(g?.name === "ジェネレートファイア" && g.type === "magic" && g.colors[0] === "red" && g.cost === 5, "GENERATEはジェネレートファイア（赤・マジック・コスト5）")
    const i = byId(IMP)
    assert(i?.name === "骸魔インプ" && i.type === "spirit" && i.colors[0] === "purple" && i.cost === 3 && i.levels[0]!.cores === 1, "IMPは骸魔インプ（紫・コスト3・Lv1コア1）")
    const a = byId(ATRAIA)
    assert(a?.name === "アトライア海帝国" && a.type === "nexus" && a.colors[0] === "blue" && a.cost === 4 && a.levels.map((l) => l.cores).join("/") === "0/1", "ATRAIAはアトライア海帝国（青・ネクサス・Lvコア0/1）")
    const chk = (id: string, name: string, type: string, cost: number, cores?: number, bp?: number) => {
        const c = getCard(id)
        assert(c.name === name && c.type === type && c.cost === cost && (cores === undefined || c.levels[0]!.cores === cores) && (bp === undefined || c.levels[0]!.bp === bp), `${id}は${name}（${type}・コスト${cost}）`)
    }
    chk(GORA, "ゴラドン", "spirit", 0, 1, 1000)
    chk(ROKU, "ロクケラトプス", "spirit", 1, 1, 1000)
    chk(METAL, "メタルバーン", "spirit", 3, 1, 3000)
    chk(BELL, "デュアルキャノン・ベル", "spirit", 4, 1, 3000)
    chk(MELT, "火吹きメルト", "spirit", 5, 1, 4000)
    chk(HYDRA, "双蛇ヒュドラム", "spirit", 6, 1, 4000)
    chk(KUJA, "炎皇クジャラク", "spirit", 6, 2, 5000)
    chk(FORT, "フォルトロス", "spirit", 7, 1, 5000)
    chk(SOL, "妖機妃ソール", "spirit", 8)
    chk(VAL, "飛龍ヴァルキュリウス", "spirit", 8)
    chk(HEDI, "切り裂きヘディレス", "spirit", 5, 1, 2000)
    chk(MARU, "マルティウサギ", "spirit", 2, 1, 2000)
    chk(BRAVE3, "剣鎧竜バスター・ドラゴン", "brave", 3, 1)
    chk(DATAS, "トライデントのデータス", "spirit", 4)
}

function game(seed: string, turn: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    s.turn = 3
    s.turnPlayer = turn
    s.priorityPlayer = turn
    s.phase = "main"
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 5
        p.burst = null
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => ROKU)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): void {
    s.players[pid].field.nexuses.push(createInstance(cardId, s.turn, cores))
    refreshLevelAsOverrides(s)
}

// 手札の先頭を召喚し、拒否の有無・リザーブの減り・トラッシュのコアの増えを返す（余分・ボイドの通行料はリザーブから出る）
function summonFirst(s: GameState, pid: PlayerId): { err: string | null; spent: number; trash: number } {
    const p = s.players[pid]
    const r0 = p.reserve
    const t0 = p.trashCores
    const err = act(s, pid, { type: "summon", handIndex: 0 })
    return { err, spent: r0 - p.reserve, trash: p.trashCores - t0 }
}

// 選択待ちを順に答える。want＝手札から選ぶカード（選べるもののうち手札にあるもの）。null＝すべて断る。
// 確認は「発動する」、対象は先頭
function drive(s: GameState, me: PlayerId, want: string[] | null): void {
    const left = [...(want ?? [])]
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? me
        let err: string | null
        if (want === null) err = act(s, who, { type: "resolveChoice" })
        else if (pc.kind === "option") err = act(s, who, { type: "resolveChoice", option: (pc.options ?? []).includes("発動する") ? "発動する" : pc.options?.[0] ?? "" })
        else if (pc.kind === "target") err = act(s, who, pc.candidates?.[0] === undefined ? { type: "resolveChoice" } : { type: "resolveChoice", instanceId: pc.candidates[0] })
        else {
            const hand = s.players[who].hand
            const idx = hand.findIndex((c, k) => left.includes(c) && (pc.cardIndices === undefined || pc.cardIndices.includes(k)))
            if (idx < 0) err = act(s, who, { type: "resolveChoice" })
            else {
                left.splice(left.indexOf(hand[idx]!), 1)
                err = act(s, who, { type: "resolveChoice", cardIndex: idx })
            }
        }
        if (err) break
    }
}

const arrives = (label: string, cores: number, bp: number) => [
    `自分.${label}.場所: なし → フィールド`,
    `自分.${label}.疲労: なし → false`,
    `自分.${label}.コア: なし → ${cores}`,
    `自分.${label}.Lv: なし → 1`,
    `自分.${label}.BP: なし → ${bp}`,
]
const PROPHET_ME = arrives("プロフェット・ドラゴン", 1, 2000)

// 003：手札 [003, ...rest] から 003 を召喚する。handAfter＝召喚後の手札（003 は手札を離れる）、drawn＝引いた枚数
function prophet(name: string, rest: string[], want: string[] | null, handAfter: string[], drawn: number, after: (t: ScenarioCtx) => void): void {
    scenario({
        name,
        start: { interactive: true, me: { hand: [PROPHET, ...rest] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            drive(t.state, t.me, want)
            after(t)
        },
        expect: [
            ...PROPHET_ME,
            "自分.リザーブ: 10 → 7",
            "自分.トラッシュのコア: 0 → 2",
            `自分.手札: ${names([PROPHET, ...rest])} → ${names(handAfter)}`,
            ...(drawn ? [`自分.デッキ枚数: 40 → ${40 - drawn}`] : []),
        ],
    })
}

console.log("=== 003 召喚時：コスト8以上のスピリットを好きなだけオープンして手元に置き、1枚につき1枚ドロー（2枚置く） ===")
prophet("prophet-two", [SOL, VAL, FORT], [SOL, VAL], [FORT, ROKU, ROKU], 2, (t) => {
    const teg = t.state.players[t.me].tegamoto
    assert(teg.length === 2 && teg.includes(SOL) && teg.includes(VAL), "ソールとヴァルキュリウスが手元にある")
})

console.log("=== 003：1枚だけ置けば1枚引く（もう1枚のコスト8は手札に残る） ===")
prophet("prophet-one", [SOL, VAL, FORT], [SOL], [VAL, FORT, ROKU], 1, (t) => {
    const teg = t.state.players[t.me].tegamoto
    assert(teg.length === 1 && teg[0] === SOL, "選んだソールだけが手元にある")
})

console.log("=== 003：置く枚数は0でもよい／断ると引かない ===")
prophet("prophet-zero", [SOL, FORT], [], [SOL, FORT], 0, (t) => {
    assert(t.state.players[t.me].tegamoto.length === 0 && t.state.players[t.me].hand.length === 2, "0枚なら手元は空で手札はそのまま")
})
prophet("prophet-decline", [SOL, FORT], null, [SOL, FORT], 0, (t) => {
    assert(t.state.players[t.me].tegamoto.length === 0 && t.state.players[t.me].hand.length === 2, "断れば手元は空で手札はそのまま")
})

console.log("=== 003：コスト7以下（フォルトロス）は置けない（コスト8以上だけ） ===")
prophet("prophet-cost7", [FORT], [FORT], [FORT], 0, (t) => {
    assert(t.state.players[t.me].tegamoto.length === 0 && t.state.players[t.me].hand.includes(FORT), "コスト7は手元に置けず手札に残る")
})

console.log("=== 073 メイン：BP3000以下の相手のスピリットすべてを破壊し、手札のスピリット1枚を破壊した体数ぶん支払い済みとして召喚できる ===")
const OPP_FIELD = { spirits: [{ card: METAL }, { card: GORA }, { card: FORT }] }
const GEN_ME = ["自分.トラッシュ: なし → ジェネレートファイア"]
const DESTROYED_OPP = [
    "相手.メタルバーン.場所: フィールド → なし",
    "相手.ゴラドン.場所: フィールド → なし",
    `相手.トラッシュ: なし → ${names([METAL, GORA])}`,
    "相手.リザーブ: 10 → 12",
]
const castMain = (t: ScenarioCtx) => t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
scenario({
    name: "gen-summon2",
    start: { interactive: true, me: { reserve: 20, hand: [GENERATE, HYDRA] }, opp: OPP_FIELD },
    steps(t) {
        castMain(t)
        drive(t.state, t.me, [HYDRA])
    },
    // コスト6から2コストぶん支払い済み＝4を支払う。リザーブ：20 → マジック5・支払い4・Lv1のコア1
    expect: [...GEN_ME, ...DESTROYED_OPP, `自分.手札: ${names([GENERATE, HYDRA])} → なし`, "自分.リザーブ: 20 → 10", "自分.トラッシュのコア: 0 → 9", ...arrives("双蛇ヒュドラム", 1, 4000)],
})
console.log("=== 073：BP3000を超える相手のスピリット（フォルトロス）は破壊されない／破壊0体でも通常のコストで召喚できる ===")
scenario({
    name: "gen-summon0",
    start: { interactive: true, me: { reserve: 20, hand: [GENERATE, HYDRA] }, opp: { spirits: [{ card: FORT }] } },
    steps(t) {
        castMain(t)
        drive(t.state, t.me, [HYDRA])
    },
    expect: [...GEN_ME, `自分.手札: ${names([GENERATE, HYDRA])} → なし`, "自分.リザーブ: 20 → 8", "自分.トラッシュのコア: 0 → 11", ...arrives("双蛇ヒュドラム", 1, 4000)],
})
console.log("=== 073：召喚は任意（断ると手札に残る。破壊は起きる） ===")
scenario({
    name: "gen-decline",
    start: { interactive: true, me: { reserve: 20, hand: [GENERATE, HYDRA] }, opp: OPP_FIELD },
    steps(t) {
        castMain(t)
        drive(t.state, t.me, null)
        assert(t.state.players[t.me].hand.includes(HYDRA), "断ったのでヒュドラムは手札にある")
    },
    expect: [...GEN_ME, ...DESTROYED_OPP, `自分.手札: ${names([GENERATE, HYDRA])} → ${names([HYDRA])}`, "自分.リザーブ: 20 → 15", "自分.トラッシュのコア: 0 → 5"],
})
console.log("=== 073：支払い済みの数が召喚コストを超えても0未満にはならない（コスト1のロクケラトプスをコア1個だけで召喚） ===")
scenario({
    name: "gen-over",
    start: { interactive: true, me: { reserve: 20, hand: [GENERATE, ROKU] }, opp: OPP_FIELD },
    steps(t) {
        castMain(t)
        drive(t.state, t.me, [ROKU])
    },
    expect: [...GEN_ME, ...DESTROYED_OPP, `自分.手札: ${names([GENERATE, ROKU])} → なし`, "自分.リザーブ: 20 → 14", "自分.トラッシュのコア: 0 → 5", ...arrives("ロクケラトプス", 1, 1000)],
})

console.log("=== 073 フラッシュ：このターンの間スピリット1体をBP+3000（メインの破壊・召喚は起きない）。相手のスピリットも選べる ===")
for (const pickOpp of [false, true]) {
    const s = game(pickOpp ? "gen-flash-opp" : "gen-flash-own")
    s.phase = "attack"
    const attacker = put(s, "p1", GORA, 1)
    const metal = put(s, "p2", METAL, 1)
    metal.isRested = true // ブロックさせない
    s.players.p1.hand = [GENERATE, HYDRA]
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ゴラドンでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュでジェネレートファイアを使用できる")
    const target = pickOpp ? metal : attacker
    for (let i = 0; i < 5 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { kind: string; candidates?: string[] }
        assert(pc.kind === "target" && (pc.candidates ?? []).includes(target.instanceId), "BP+3000の対象に自分と相手のスピリットが選べる")
        act(s, "p1", { type: "resolveChoice", instanceId: target.instanceId })
    }
    assert(effectiveBp(s, pickOpp ? "p2" : "p1", target) === (pickOpp ? 6000 : 4000), pickOpp ? "相手のメタルバーンはBP+3000（3000→6000）" : "ゴラドンはBP+3000（1000→4000）")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === metal.instanceId), "フラッシュ側にはメインの破壊が無い（メタルバーンは場に残る）")
    assert(s.players.p1.hand.includes(HYDRA) && s.players.p1.field.spirits.length === 1, "召喚の選択も出ない（ヒュドラムは手札のまま）")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 012：お互いのデッキは破棄されない（【粉砕】のデッキ破棄がどちらの場にいても止まる。いなければ破棄される） ===")
for (const where of [null, "p1", "p2"] as const) {
    const s = game(`imp-mill-${where}`)
    s.phase = "attack"
    if (where) put(s, where, IMP, 1)
    const datas = put(s, "p1", DATAS, 1)
    const deck = s.players.p2.deck.length
    assert(act(s, "p1", { type: "attack", instanceId: datas.instanceId }) === null, "データスでアタックできる")
    drive(s, "p1", [])
    takeLifeAndResolve(s, "p2")
    drive(s, "p1", [])
    assert(deck - s.players.p2.deck.length === (where ? 0 : 1), where ? `インプが${where}にいるので【粉砕】で破棄されない` : "インプがいなければ【粉砕】Lv1で1枚破棄される")
}

console.log("=== 012 メインステップ：コスト4/6/7のスピリットは、持ち主のリザーブのコア1個をボイドに置かなければ召喚できない ===")
for (const [card, cost, cores, toll] of [[BELL, 4, 1, true], [KUJA, 6, 2, true], [FORT, 7, 1, true], [METAL, 3, 1, false], [MELT, 5, 1, false]] as const) {
    const s = game(`imp-toll-${card}`)
    put(s, "p1", IMP, 1)
    s.players.p1.hand = [card]
    const r = summonFirst(s, "p1")
    assert(r.err === null, `コスト${cost}の${getCard(card).name}を召喚できる`)
    assert(r.trash === cost, `コストの${cost}コアはトラッシュへ`)
    assert(r.spent === cost + cores + (toll ? 1 : 0), toll ? `コスト${cost}はボイドに1個余分に置く（リザーブ ${cost}+Lv1のコア${cores}+1）` : `コスト${cost}は通行料なし（リザーブ ${cost}+${cores}）`)
}
console.log("=== 012：リザーブが足りなければ（コスト4・Lv1のコア1・ボイド1＝6個）召喚できない／相手の召喚にも掛かり相手のリザーブから払う ===")
for (const [reserve, ok] of [[5, false], [6, true]] as const) {
    const s = game(`imp-short-${reserve}`)
    put(s, "p1", IMP, 1)
    s.players.p1.reserve = reserve
    s.players.p1.hand = [BELL]
    const r = summonFirst(s, "p1")
    assert((r.err === null) === ok, ok ? "リザーブ6個で召喚できる" : "リザーブ5個ではボイドに置けず召喚できない")
    if (ok) assert(s.players.p1.reserve === 0, "6個すべて使った")
}
{
    const s = game("imp-opp", "p2")
    put(s, "p1", IMP, 1)
    s.players.p2.hand = [BELL]
    const r = summonFirst(s, "p2")
    assert(r.err === null && r.spent === 6, "相手（インプの持ち主でない側）も4+1+1=6個を自分のリザーブから払う")
    assert(s.players.p1.reserve === 20, "インプの持ち主のリザーブは減らない")
}
console.log("=== 012：効果による召喚（073）にも掛かる（印刷のコスト7が対象。リザーブ 20 → マジック5・支払い5・Lv1のコア1・ボイド1） ===")
{
    const s = game("imp-effect")
    put(s, "p1", IMP, 1)
    put(s, "p2", METAL, 1)
    put(s, "p2", GORA, 1)
    s.players.p1.hand = [GENERATE, FORT]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "ジェネレートファイアを使用できる")
    drive(s, "p1", [FORT])
    assert(s.players.p1.field.spirits.some((x) => x.cardId === FORT), "フォルトロスが召喚される")
    assert(s.players.p1.reserve === 8 && s.players.p1.trashCores === 10, "リザーブ8・トラッシュのコア10（5+5。ボイドの1個はトラッシュに数えない）")
}

console.log("=== 072 Lv1：お互い、コスト0/3/4のスピリット/ブレイヴを召喚するとき1コスト余分に支払う（5・6・7には掛からない） ===")
for (const [card, cost, cores, extra] of [[GORA, 0, 1, 1], [METAL, 3, 1, 1], [BELL, 4, 1, 1], [MELT, 5, 1, 0], [KUJA, 6, 2, 0], [FORT, 7, 1, 0], [BRAVE3, 3, 1, 1]] as const) {
    const s = game(`atraia-lv1-${card}`)
    putNexus(s, "p1", ATRAIA, 0)
    s.players.p1.hand = [card]
    const r = summonFirst(s, "p1")
    assert(r.err === null, `コスト${cost}の${getCard(card).name}を召喚できる`)
    assert(r.spent === cost + cores + extra && r.trash === cost + extra, extra ? `コスト${cost}は1コスト余分（リザーブ ${cost}+1+Lv1のコア${cores}）` : `コスト${cost}は余分なし（リザーブ ${cost}+${cores}）`)
}
console.log("=== 072 Lv1：相手（ネクサスの持ち主でない側）が召喚するときも1コスト余分 ===")
{
    const s = game("atraia-lv1-opp", "p2")
    putNexus(s, "p1", ATRAIA, 0)
    s.players.p2.hand = [METAL]
    const r = summonFirst(s, "p2")
    assert(r.err === null && r.spent === 3 + 1 + 1 && r.trash === 4, "相手のメタルバーンも1コスト余分（リザーブ 3+1+1）")
}
console.log("=== 072 余分を払えなければ召喚できない（コスト3・Lv1のコア1・余分1＝5個） ===")
for (const [reserve, ok] of [[4, false], [5, true]] as const) {
    const s = game(`atraia-short-${reserve}`)
    putNexus(s, "p1", ATRAIA, 0)
    s.players.p1.reserve = reserve
    s.players.p1.hand = [METAL]
    assert((summonFirst(s, "p1").err === null) === ok, ok ? "リザーブ5個で召喚できる" : "リザーブ4個では余分を払えず召喚できない")
}
console.log("=== 072 Lv2『相手のメインステップ』：ネクサスの持ち主の相手だけ、コスト6/7を召喚するとき3コスト余分（自分には掛からない。5には掛からない） ===")
for (const [turn, card, cost, cores, extra] of [["p2", FORT, 7, 1, 3], ["p2", KUJA, 6, 2, 3], ["p2", MELT, 5, 1, 0], ["p2", METAL, 3, 1, 1], ["p1", FORT, 7, 1, 0], ["p1", METAL, 3, 1, 1]] as const) {
    const s = game(`atraia-lv2-${turn}-${card}`, turn)
    putNexus(s, "p1", ATRAIA, 1)
    s.players[turn].hand = [card]
    const r = summonFirst(s, turn)
    assert(r.err === null, `${turn}がコスト${cost}の${getCard(card).name}を召喚できる`)
    assert(r.spent === cost + cores + extra && r.trash === cost + extra, `Lv2：${turn}のコスト${cost}は余分${extra}（リザーブ ${cost}+${extra}+${cores}）`)
}
console.log("=== 072 Lv1では相手のコスト6/7に3コスト余分は掛からない ===")
{
    const s = game("atraia-lv1-opp7", "p2")
    putNexus(s, "p1", ATRAIA, 0)
    s.players.p2.hand = [FORT]
    const r = summonFirst(s, "p2")
    assert(r.err === null && r.spent === 8 && r.trash === 7, "Lv1の相手のフォルトロスは余分なし（リザーブ 7+1）")
}

console.log("=== 003 手元のカードは手札と同様に使用できる：手元のソールを召喚（コストを払う）。使用権は1回で消える ===")
{
    const s = game("prophet-use")
    s.players.p1.hand = [PROPHET, SOL, VAL]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "プロフェット・ドラゴンを召喚できる")
    drive(s, "p1", [SOL, VAL])
    const teg = s.players.p1.tegamoto
    assert(teg.includes(SOL) && teg.includes(VAL), "ソールとヴァルキュリウスが手元にある")
    const r0 = s.players.p1.reserve
    const t0 = s.players.p1.trashCores
    assert(act(s, "p1", { type: "summon", handIndex: teg.indexOf(SOL), fromTegamoto: true }) === null, "手元のソールを召喚できる")
    drive(s, "p1", [])
    assert(s.players.p1.field.spirits.some((x) => x.cardId === SOL), "ソールがフィールドに出る")
    assert(!s.players.p1.tegamoto.includes(SOL) && s.players.p1.tegamoto.includes(VAL), "使ったソールは手元から消え、ヴァルキュリウスは手元に残る")
    assert(r0 - s.players.p1.reserve === 8 + 1 && s.players.p1.trashCores - t0 === 8, "コスト8を払い、Lv1のコア1個を置く")
    const sol = s.players.p1.field.spirits.find((x) => x.cardId === SOL)!
    s.players.p1.reserve = 20
    act(s, "p1", { type: "moveCore", instanceId: sol.instanceId, direction: "remove" })
    assert(act(s, "p1", { type: "summon", handIndex: 0, fromTegamoto: true }) === null, "もう1枚（ヴァルキュリウス）は手元から召喚できる")
    drive(s, "p1", [])
    assert(s.players.p1.tegamoto.length === 0, "手元は空になる")
    assert(act(s, "p1", { type: "summon", handIndex: 0, fromTegamoto: true }) !== null, "手元に無いカードは召喚できない")
}

console.log("=== 073：破壊されたスピリットが破壊時に手札へ戻ったら、その分は1コストに数えない（Q25205）。メタルバーン・ヘディレス・ゴラドンを破壊し、ヘディレスは戻る ===")
{
    const s = game("gen-bounce")
    put(s, "p2", METAL, 1)
    put(s, "p2", HEDI, 1)
    put(s, "p2", GORA, 1)
    s.players.p1.hand = [GENERATE, HYDRA]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "ジェネレートファイアを使用できる")
    drive(s, "p1", [HYDRA])
    assert(s.players.p2.hand.includes(HEDI) && s.players.p2.field.spirits.length === 0, "ヘディレスは手札に戻り、ほかは破壊された")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === HYDRA), "ヒュドラムが召喚される")
    // 数えるのは手札に戻らなかった2体：コスト6−2＝4を支払う。マジック5・支払い4・Lv1のコア1
    assert(s.players.p1.reserve === 10 && s.players.p1.trashCores === 9, "支払い済みは2コスト分だけ（3コスト分なら支払い3でリザーブ11になる）")
}

console.log("=== 072：コストを支払わずに召喚する効果でも1コスト余分を払う（マルティウサギの破壊時でゴラドンを無償召喚）。払えなければ召喚できない ===")
for (const [reserve, ok] of [[1, true], [0, false]] as const) {
    const s = game(`atraia-free-${reserve}`)
    putNexus(s, "p1", ATRAIA, 0)
    const maru = put(s, "p1", MARU, 1)
    s.players.p1.reserve = reserve
    s.players.p1.hand = [GORA]
    destroySpirit(s, "p1", maru.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    drive(s, "p1", [GORA])
    const summoned = s.players.p1.field.spirits.some((x) => x.cardId === GORA)
    assert(summoned === ok, ok ? "破壊でコアが戻りリザーブ2（余分1＋Lv1のコア1）になるのでゴラドンを召喚できる" : "リザーブ1（戻ったコア）では余分を払えず召喚できない")
    if (ok) assert(s.players.p1.reserve === 0 && s.players.p1.trashCores === 1, "コスト0でも余分の1コストはトラッシュへ")
}

console.log("すべてのチェックに合格しました 🎉（part820）")
