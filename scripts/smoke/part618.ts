// smoke パート618（BS17 紫15枚の場面テスト。効果文だけから起こした期待値。実装を見ずに書いてある）
import { act, assert, createGame, createInstance, effectiveBp, getCard, declareBlock, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"
import type { Side, SideSpec } from "./scenario"
import type { CardInstance } from "../../server/src/type"

const CAMELOT = "BS17-011"
const AGRO = "BS17-012"
const SMOCK = "BS17-013"
const VIPER = "BS17-014"
const PALOM = "BS17-015"
const LANCE = "BS17-016"
const FOOL = "BS17-017"
const ZAUM = "BS17-018"
const ALON = "BS17-056"
const GRAIL = "BS17-063"
const LAKE = "BS17-064"
const FOG = "BS17-075"
const ROUND = "BS17-076"
const ARTHUR = "BS17-X02"

const R0 = "BS01-001" // ゴラドン（赤・コスト0・バニラ）
const R1 = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const R2 = "BS01-005" // アイバーン（赤・コスト2・バニラ。4コアでLv2・BP6000）
const R3 = "BS01-008" // メタルバーン（赤・コスト3・バニラ・BP3000）
const R4 = "BS06-008" // 刀剣魚エスパーダ（赤・コスト4・バニラ）
const R5 = "BS05-006" // 城塞龍メガロン（赤・コスト5・バニラ）
const R6 = "BS10-009" // トルネードラ（赤・コスト6・バニラ。3コアでLv2・BP9000）
const P0 = "BS10-011" // オニグモン（紫・コスト0・バニラ）
const PURP3 = "BS04-015" // サイクロ・ワインダー（紫・コスト3・バニラ）
const HEL = "BS03-013" // ヘルスコルピオ（紫・コスト1・バニラ）
const GAHERIS = "BS11-010" // 闇騎士ガヘリス（紫・コスト2。不死のみ）
const ARMOR = "BS03-037" // ラタトスカ（白・コスト1・【装甲：赤】のみ）
const HEAVY = "BS14-035" // ラクーンガード（白・コスト1・Lv2【重装甲：白】のみ）
const COFFIN = "BS01-131" // ダークコフィン（紫・メイン：疲労状態のスピリット1体を破壊）
const HEAL = "BS09-078" // ヒーリングサークル（白・メイン：ボイドからコア1個を自分のライフに置く）
const HOPPER = "BS02-029" // バットホッパー（緑・アタック時：ボイドからコア1個をこのスピリットに置く）
const SHOGO = "BS12-059" // ショゴルス（青・ブレイヴ・合体条件コスト3以上）
const DRAW2 = "BS15-076" // 妖華吸血爪（紫・バースト：自分のライフ減少後 2枚ドロー）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        [CAMELOT]: "キャメロット・ナイト", [AGRO]: "闇騎士アグロヴァル", [SMOCK]: "スモックジラ", [VIPER]: "チェーンバイパー",
        [PALOM]: "闇騎士パロミデス", [LANCE]: "闇騎士ランスロット", [FOOL]: "冥天獣フル・フール", [ZAUM]: "紫晶の大蛇ザウム",
        [ALON]: "アロンダイザー", [GRAIL]: "黒き聖杯", [LAKE]: "死者の湖", [FOG]: "ストラングルフォッグ",
        [ROUND]: "ラウンドテーブルナイツ", [ARTHUR]: "騎士の覇王ソーディアス・アーサー",
        [R0]: "ゴラドン", [R1]: "ロクケラトプス", [R2]: "アイバーン", [R3]: "メタルバーン", [R4]: "刀剣魚エスパーダ",
        [R5]: "城塞龍メガロン", [R6]: "トルネードラ", [P0]: "オニグモン", [PURP3]: "サイクロ・ワインダー", [HEL]: "ヘルスコルピオ",
        [GAHERIS]: "闇騎士ガヘリス", [ARMOR]: "ラタトスカ", [HEAVY]: "ラクーンガード", [COFFIN]: "ダークコフィン",
        [HEAL]: "ヒーリングサークル", [HOPPER]: "バットホッパー", [SHOGO]: "ショゴルス", [DRAW2]: "妖華吸血爪",
    }
    for (const [id, name] of Object.entries(names)) assert(getCard(id).name === name, `${id} は ${name}`)
    const costs: Record<string, number> = { [R0]: 0, [R1]: 1, [R2]: 2, [R3]: 3, [R4]: 4, [R5]: 5, [R6]: 6, [PURP3]: 3 }
    for (const [id, cost] of Object.entries(costs)) assert(getCard(id).cost === cost, `${id} はコスト${cost}`)
}

// ---------------------------------------------------------------------------------------------
// 道具。盤面の差分で書けない場面（コストの支払いや召喚が絡む）は、結果の事実だけを assert する
// ---------------------------------------------------------------------------------------------
type Pc = NonNullable<GameState["pendingChoice"]>
type Player = GameState["players"][PlayerId]

interface Spec {
    turn?: Side
    phase?: "main" | "attack"
    interactive?: boolean
    me?: SideSpec
    opp?: SideSpec
}

interface T {
    s: GameState
    tag: string
    pid(side: Side): PlayerId
    p(side: Side): Player
    act(side: Side, a: GameAction): void
    rej(side: Side, a: GameAction): void
    inst(label: string): CardInstance
    fieldCount(side: Side, cardId: string): number
    trashCount(side: Side, cardId: string): number
    handCount(side: Side, cardId: string): number
}

const sideName = (side: Side) => (side === "me" ? "自分" : "相手")
const fieldOf = (p: Player) => [...p.field.spirits, ...p.field.nexuses, ...p.field.combinedBraves]

function build(name: string, spec: Spec, me: PlayerId): T {
    const opp: PlayerId = me === "p1" ? "p2" : "p1"
    const pid = (side: Side) => (side === "me" ? me : opp)
    const tag = `[${name}｜自分=${me}]`
    const s = createGame(`p618-${name}-${me}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = pid(spec.turn ?? "me")
    s.priorityPlayer = s.turnPlayer
    s.phase = spec.phase ?? "main"
    s.interactiveTargets = spec.interactive ?? true
    const labels = new Map<string, CardInstance>()
    for (const side of ["me", "opp"] as const) {
        const sp = (side === "me" ? spec.me : spec.opp) ?? {}
        const p = s.players[pid(side)]
        p.life = sp.life ?? 5
        p.reserve = sp.reserve ?? 10
        p.hand = [...(sp.hand ?? [])]
        p.deck = [...(sp.deck ?? Array.from({ length: 40 }, () => R1))]
        p.trashCards = [...(sp.trash ?? [])]
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
        p.burst = sp.burst ?? null
        p.burstSet = sp.burst !== undefined
        const place = (list: SideSpec["spirits"], zone: CardInstance[]) => {
            for (const x of list ?? []) {
                const inst = createInstance(x.card, s.turn - 1, x.cores ?? 1)
                inst.isRested = x.rested ?? false
                const label = x.label ?? getCard(x.card).name
                if (labels.has(label)) throw new Error(`${tag} ラベル重複: ${label}`)
                labels.set(label, inst)
                zone.push(inst)
            }
        }
        place(sp.spirits, p.field.spirits)
        place(sp.nexuses, p.field.nexuses)
    }
    refreshLevelAsOverrides(s)
    return {
        s,
        tag,
        pid,
        p: (side) => s.players[pid(side)],
        act(side, a) {
            const err = act(s, pid(side), a)
            assert(err === null, `${tag} ${sideName(side)}の ${a.type} が通る${err === null ? "" : `（拒否: ${err}）`}`)
        },
        rej(side, a) {
            assert(act(s, pid(side), a) !== null, `${tag} ${sideName(side)}の ${a.type} は拒否されるはず`)
        },
        inst(label) {
            const hit = labels.get(label)
            if (!hit) throw new Error(`${tag} ラベル「${label}」が無い`)
            return hit
        },
        fieldCount: (side, cardId) => fieldOf(s.players[pid(side)]).filter((x) => x.cardId === cardId).length,
        trashCount: (side, cardId) => s.players[pid(side)].trashCards.filter((c) => c === cardId).length,
        handCount: (side, cardId) => s.players[pid(side)].hand.filter((c) => c === cardId).length,
    }
}

function play(name: string, spec: Spec, steps: (t: T) => void): void {
    for (const me of ["p1", "p2"] as const) steps(build(name, spec, me))
}

interface Ans {
    by: Side
    yes?: boolean // option の確認に応じる(true)／断る(false)
    target?: string // フィールドの個体をラベルで選ぶ
    card?: string // 手札・トラッシュのカードを名前で選ぶ
}

// 選択待ちが立っていること・選ぶ人が合っていることを確かめてから答える。答える前の選択待ちを返す（候補の検査用）
function answer(t: T, a: Ans, what: string): Pc | null {
    const pc = t.s.pendingChoice
    assert(pc !== null && pc !== undefined, `${t.tag} 選択待ちが立つ：${what}`)
    if (!pc) return null
    assert(pc.pid === t.pid(a.by), `${t.tag} 選ぶのは${sideName(a.by)}：${what}`)
    if (a.yes === true) {
        assert(pc.kind === "option", `${t.tag} 確認は option：${what}`)
        t.act(a.by, pc.options?.[0] === undefined ? { type: "resolveChoice" } : { type: "resolveChoice", option: pc.options[0] })
    } else if (a.yes === false) {
        t.act(a.by, { type: "resolveChoice" })
    } else if (a.target !== undefined) {
        assert(pc.kind === "target", `${t.tag} 対象選択は target：${what}`)
        const id = t.inst(a.target).instanceId
        assert(pc.candidates.includes(id), `${t.tag} 候補に「${a.target}」がいる：${what}`)
        t.act(a.by, { type: "resolveChoice", instanceId: id })
    } else if (a.card !== undefined) {
        assert(pc.kind === "card", `${t.tag} カード選択は card：${what}`)
        const owner = pc.cardOwner ?? pc.pid
        const zone = pc.cardZone === "hand" ? t.s.players[owner].hand : t.s.players[owner].trashCards
        const idx = (pc.cardIndices ?? []).find((i) => getCard(zone[i] as string).name === a.card && !(pc.selectedCardIndices ?? []).includes(i))
        assert(idx !== undefined, `${t.tag} 候補に「${a.card}」がある：${what}`)
        if (idx !== undefined) t.act(a.by, { type: "resolveChoice", cardIndex: idx })
    }
    return pc
}

function noPending(t: T, what: string): void {
    assert(!t.s.pendingChoice, `${t.tag} 選択待ちは立たない：${what}`)
}

// 残っている選択待ちを既定で片付ける（確認は承諾、それ以外は候補の先頭、任意ならスキップ）。検査の対象外の後始末用
function finish(t: T): void {
    for (let i = 0; i < 8 && t.s.pendingChoice; i++) {
        const pc = t.s.pendingChoice
        const side: Side = pc.pid === t.pid("me") ? "me" : "opp"
        if (pc.kind === "option" && pc.options?.[0] !== undefined) t.act(side, { type: "resolveChoice", option: pc.options[0] })
        else if (pc.kind === "target" && pc.candidates.length > 0) t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0] as string })
        else t.act(side, { type: "resolveChoice" })
    }
}

// フラッシュを両者パスで閉じる。選択待ちが立ったらそこで止める
function settleFlash(t: T): void {
    for (let i = 0; i < 12 && t.s.isFlashTiming && t.s.battle && !t.s.pendingChoice; i++) {
        const err = act(t.s, t.s.priorityPlayer, { type: "pass" })
        assert(err === null, `${t.tag} フラッシュを閉じられる${err === null ? "" : `（拒否: ${err}）`}`)
    }
}

// attackerSide が攻撃し、相手側が blocker でブロックして解決まで進める
function battle(t: T, attackerSide: Side, attacker: string, blocker: string): void {
    t.act(attackerSide, { type: "attack", instanceId: t.inst(attacker).instanceId })
    const defender: Side = attackerSide === "me" ? "opp" : "me"
    const err = declareBlock(t.s, t.pid(defender), t.inst(blocker).instanceId)
    assert(err === null, `${t.tag} ブロックできる${err === null ? "" : `（拒否: ${err}）`}`)
    settleFlash(t)
}

// attackerSide が攻撃し、守る側はブロックせずライフで受ける
function hitLife(t: T, attackerSide: Side, attacker: string): void {
    t.act(attackerSide, { type: "attack", instanceId: t.inst(attacker).instanceId })
    const defender: Side = attackerSide === "me" ? "opp" : "me"
    const err = takeLifeAndResolve(t.s, t.pid(defender))
    assert(err === null, `${t.tag} ライフで受けられる${err === null ? "" : `（拒否: ${err}）`}`)
}

// 攻撃宣言後のフラッシュタイミングで side に優先権が回るまで進める
function flashPriority(t: T, side: Side, attacker: string): void {
    t.act(side, { type: "attack", instanceId: t.inst(attacker).instanceId })
    for (let i = 0; i < 2 && t.s.isFlashTiming && t.s.priorityPlayer !== t.pid(side); i++) {
        const err = act(t.s, t.s.priorityPlayer, { type: "pass" })
        assert(err === null, `${t.tag} 優先権を渡せる${err === null ? "" : `（拒否: ${err}）`}`)
    }
    assert(t.s.isFlashTiming && t.s.priorityPlayer === t.pid(side), `${t.tag} ${sideName(side)}にフラッシュの優先権がある`)
}

function cast(t: T, side: Side, handIndex: number, target?: string): void {
    t.act(side, target === undefined ? { type: "castMagic", handIndex } : { type: "castMagic", handIndex, targetInstanceId: t.inst(target).instanceId })
}

const coresOnField = (p: Player) => fieldOf(p).reduce((n, x) => n + x.cores, 0)
const totalCores = (p: Player) => p.life + p.reserve + p.trashCores + coresOnField(p)

// ---------------------------------------------------------------------------------------------
console.log("=== BS17-011 キャメロット・ナイト：【不死：コスト0】 ===")
// ---------------------------------------------------------------------------------------------
// 相手のR6(Lv2・9000)に自分のブロッカーが倒される共通の場面
const undyingSpec = (victim: string, extraTrash: string[], label?: string): Spec => ({
    turn: "opp", phase: "attack",
    me: { spirits: [label === undefined ? { card: victim } : { card: victim, label }], trash: extraTrash },
    opp: { spirits: [{ card: R6, cores: 3, label: "攻撃役" }] },
})
const attackerLabel = "攻撃役"
const victimLabel = (cardId: string) => getCard(cardId).name

play("011 不死:コスト0を満たす→召喚できる", undyingSpec(R0, [CAMELOT]), (t) => {
    battle(t, "opp", attackerLabel, victimLabel(R0))
    answer(t, { by: "me", yes: true }, "不死の召喚確認")
    finish(t)
    assert(t.fieldCount("me", CAMELOT) === 1 && t.trashCount("me", CAMELOT) === 0, `${t.tag} キャメロット・ナイトが場に出てトラッシュから消える`)
    assert(t.trashCount("me", R0) === 1, `${t.tag} 破壊されたゴラドンはトラッシュにいる`)
})
play("011 不死を断る", undyingSpec(R0, [CAMELOT]), (t) => {
    battle(t, "opp", attackerLabel, victimLabel(R0))
    answer(t, { by: "me", yes: false }, "不死の召喚確認")
    noPending(t, "断ったあと")
    assert(t.fieldCount("me", CAMELOT) === 0 && t.trashCount("me", CAMELOT) === 1, `${t.tag} 断ればトラッシュに残る`)
})
play("011 コスト1のスピリットが破壊されても不死は出ない", undyingSpec(R1, [CAMELOT]), (t) => {
    battle(t, "opp", attackerLabel, victimLabel(R1))
    noPending(t, "コスト違い")
    assert(t.fieldCount("me", CAMELOT) === 0 && t.trashCount("me", CAMELOT) === 1, `${t.tag} トラッシュに残る`)
})
play("011 相手のコスト0が破壊されても出ない（自分の、が条件）", {
    turn: "me", phase: "attack",
    me: { spirits: [{ card: R6, cores: 3, label: "攻撃役" }], trash: [CAMELOT] },
    opp: { spirits: [{ card: R0 }] },
}, (t) => {
    battle(t, "me", attackerLabel, victimLabel(R0))
    noPending(t, "相手のスピリットが破壊された")
    assert(t.fieldCount("me", CAMELOT) === 0, `${t.tag} 出ない`)
    assert(t.trashCount("opp", R0) === 1, `${t.tag} 相手のゴラドンは破壊された`)
})
play("011 自分のターンのアタックステップでも不死は使える（お互い）", {
    turn: "me", phase: "attack",
    me: { spirits: [{ card: R0, cores: 1, label: "攻撃役" }], trash: [CAMELOT] },
    opp: { spirits: [{ card: R6, cores: 3, label: "ブロッカー" }] },
}, (t) => {
    battle(t, "me", attackerLabel, "ブロッカー")
    answer(t, { by: "me", yes: true }, "不死の召喚確認")
    finish(t)
    assert(t.fieldCount("me", CAMELOT) === 1, `${t.tag} 自分のターンでも召喚できる`)
})
play("011 メインステップでは不死の召喚は起きない", {
    turn: "me", phase: "main",
    me: { spirits: [{ card: R0, rested: true }], hand: [COFFIN], trash: [CAMELOT] },
}, (t) => {
    cast(t, "me", 0, victimLabel(R0))
    noPending(t, "メインステップ")
    assert(t.trashCount("me", R0) === 1 && t.fieldCount("me", CAMELOT) === 0, `${t.tag} ゴラドンは破壊されたがキャメロットは出ない`)
})

// ---------------------------------------------------------------------------------------------
console.log("=== BS17-012 闇騎士アグロヴァル ===")
// ---------------------------------------------------------------------------------------------
play("012 不死:コスト4を満たす→召喚できる", undyingSpec(R4, [AGRO]), (t) => {
    battle(t, "opp", attackerLabel, victimLabel(R4))
    answer(t, { by: "me", yes: true }, "不死の召喚確認")
    finish(t)
    assert(t.fieldCount("me", AGRO) === 1 && t.trashCount("me", AGRO) === 0, `${t.tag} 場に出る`)
})
play("012 コスト3が破壊されても不死は出ない（コスト4のみ）", undyingSpec(R3, [AGRO]), (t) => {
    battle(t, "opp", attackerLabel, victimLabel(R3))
    noPending(t, "コスト違い")
    assert(t.fieldCount("me", AGRO) === 0, `${t.tag} 出ない`)
})

// Lv2：コスト3の自分のスピリットが相手によって破壊されたとき、相手のスピリット/ネクサスのコア1個を相手のリザーブに置く
const agroLv2 = (victim: string, agroCores: number, turn: Side): Spec => ({
    turn, phase: "main",
    me: { spirits: [{ card: AGRO, cores: agroCores }, { card: victim, rested: true }] },
    opp: { spirits: [{ card: P0, cores: 2, label: "狙い" }, { card: PURP3, label: "他" }], hand: [COFFIN] },
})
play("012 Lv2：コスト3が相手の効果で破壊→相手のスピリットのコア1個を相手のリザーブへ", agroLv2(R3, 2, "opp"), (t) => {
    const before = totalCores(t.p("opp"))
    cast(t, "opp", 0, victimLabel(R3))
    const pc = answer(t, { by: "me", target: "狙い" }, "コアを置かせる相手のスピリットを選ぶ")
    assert(!!pc && !pc.candidates.includes(t.inst(victimLabel(AGRO)).instanceId), `${t.tag} 自分のスピリットは候補にならない`)
    assert(t.inst("狙い").cores === 1, `${t.tag} 狙ったスピリットのコアが1個減る`)
    assert(totalCores(t.p("opp")) === before, `${t.tag} コアはリザーブへ移っただけで相手の合計は変わらない（コスト支払いはリザーブ→トラッシュ）`)
    assert(t.inst("他").cores === 1, `${t.tag} 他のスピリットは変わらない`)
})
play("012 Lv2：コスト2が破壊されても発揮しない", agroLv2(R2, 2, "opp"), (t) => {
    cast(t, "opp", 0, victimLabel(R2))
    noPending(t, "コスト違い")
    assert(t.inst("狙い").cores === 2, `${t.tag} コアは動かない`)
})
play("012 Lv1では発揮しない", agroLv2(R3, 1, "opp"), (t) => {
    cast(t, "opp", 0, victimLabel(R3))
    noPending(t, "Lv1")
    assert(t.inst("狙い").cores === 2, `${t.tag} コアは動かない`)
})
play("012 Lv2：自分の効果で破壊しても発揮しない（相手によって、が条件）", { ...agroLv2(R3, 2, "me"), me: { spirits: [{ card: AGRO, cores: 2 }, { card: R3, rested: true }], hand: [COFFIN] } }, (t) => {
    cast(t, "me", 0, victimLabel(R3))
    noPending(t, "自分が破壊した")
    assert(t.inst("狙い").cores === 2, `${t.tag} コアは動かない`)
})

// ---------------------------------------------------------------------------------------------
console.log("=== BS17-013 スモックジラ ===")
// ---------------------------------------------------------------------------------------------
const smock = (victim: string, turn: Side): Spec => ({
    turn, phase: "main",
    me: { spirits: [{ card: SMOCK }, { card: victim, rested: true }] },
    opp: { spirits: [{ card: PURP3, label: "標的" }, { card: R4, label: "大物" }], hand: [COFFIN] },
})
play("013 コスト3が相手の効果で破壊→コスト3以下のスピリット1体を破壊できる", smock(R3, "opp"), (t) => {
    cast(t, "opp", 0, victimLabel(R3))
    answer(t, { by: "me", yes: true }, "発動確認")
    const pc = answer(t, { by: "me", target: "標的" }, "破壊するスピリットを選ぶ")
    assert(!!pc && !pc.candidates.includes(t.inst("大物").instanceId), `${t.tag} コスト4は候補にならない`)
    assert(!!pc && pc.candidates.includes(t.inst(victimLabel(SMOCK)).instanceId), `${t.tag} 自分のコスト3も候補になる`)
    assert(t.trashCount("opp", PURP3) === 1 && t.fieldCount("opp", R4) === 1, `${t.tag} 標的だけが破壊される`)
})
play("013 断れば何も起きない", smock(R3, "opp"), (t) => {
    cast(t, "opp", 0, victimLabel(R3))
    answer(t, { by: "me", yes: false }, "発動確認")
    noPending(t, "断ったあと")
    assert(t.fieldCount("opp", PURP3) === 1, `${t.tag} 標的は残る`)
})
play("013 コスト4が破壊されても発揮しない", smock(R4, "opp"), (t) => {
    cast(t, "opp", 0, victimLabel(R4))
    noPending(t, "コスト違い")
    assert(t.fieldCount("opp", PURP3) === 1, `${t.tag} 標的は残る`)
})
play("013 自分の効果で破壊しても発揮しない", { ...smock(R3, "me"), me: { spirits: [{ card: SMOCK }, { card: R3, rested: true }], hand: [COFFIN] } }, (t) => {
    cast(t, "me", 0, victimLabel(R3))
    noPending(t, "自分が破壊した")
    assert(t.fieldCount("opp", PURP3) === 1, `${t.tag} 標的は残る`)
})
play("013 相手のコスト3が相手自身の効果で破壊されても発揮しない（自分の、が条件）", {
    turn: "opp", phase: "main",
    me: { spirits: [{ card: SMOCK }] },
    opp: { spirits: [{ card: R3, rested: true, label: "自滅" }, { card: PURP3, label: "標的" }], hand: [COFFIN] },
}, (t) => {
    cast(t, "opp", 0, "自滅")
    noPending(t, "相手のスピリットが破壊された")
    assert(t.fieldCount("opp", PURP3) === 1, `${t.tag} 標的は残る`)
})

// ---------------------------------------------------------------------------------------------
console.log("=== BS17-014 チェーンバイパー ===")
// ---------------------------------------------------------------------------------------------
const viperBattle = (blocker: string, blockerCores = 1): Spec => ({
    turn: "me", phase: "attack",
    me: { spirits: [{ card: VIPER, cores: 1 }, { card: R3, label: "別働隊" }] },
    opp: { spirits: [{ card: blocker, cores: blockerCores, label: "ブロッカー" }] },
})
play("014 【装甲】持ちとバトル中の自分のスピリットはBP+3000", viperBattle(ARMOR), (t) => {
    const viper = t.inst(victimLabel(VIPER))
    t.act("me", { type: "attack", instanceId: viper.instanceId })
    assert(declareBlock(t.s, t.pid("opp"), t.inst("ブロッカー").instanceId) === null, `${t.tag} ブロックできる`)
    assert(effectiveBp(t.s, t.pid("me"), viper) === 5000, `${t.tag} 2000+3000=5000`)
    assert(effectiveBp(t.s, t.pid("me"), t.inst("別働隊")) === 3000, `${t.tag} バトルしていない味方は変わらない`)
})
play("014 【重装甲】持ちでも同じ", viperBattle(HEAVY, 2), (t) => {
    const viper = t.inst(victimLabel(VIPER))
    t.act("me", { type: "attack", instanceId: viper.instanceId })
    assert(declareBlock(t.s, t.pid("opp"), t.inst("ブロッカー").instanceId) === null, `${t.tag} ブロックできる`)
    assert(effectiveBp(t.s, t.pid("me"), viper) === 5000, `${t.tag} 2000+3000=5000`)
})
play("014 装甲を持たない相手ならBPは増えない", viperBattle(R1), (t) => {
    const viper = t.inst(victimLabel(VIPER))
    t.act("me", { type: "attack", instanceId: viper.instanceId })
    assert(declareBlock(t.s, t.pid("opp"), t.inst("ブロッカー").instanceId) === null, `${t.tag} ブロックできる`)
    assert(effectiveBp(t.s, t.pid("me"), viper) === 2000, `${t.tag} 2000のまま`)
})
play("014 バイパー以外の自分のスピリットがバトルしていても+3000（すべて）", viperBattle(ARMOR), (t) => {
    const other = t.inst("別働隊")
    t.act("me", { type: "attack", instanceId: other.instanceId })
    assert(declareBlock(t.s, t.pid("opp"), t.inst("ブロッカー").instanceId) === null, `${t.tag} ブロックできる`)
    assert(effectiveBp(t.s, t.pid("me"), other) === 6000, `${t.tag} 3000+3000=6000`)
    assert(effectiveBp(t.s, t.pid("me"), t.inst(victimLabel(VIPER))) === 2000, `${t.tag} バトルしていないバイパーは2000`)
})
play("014 相手のアタックステップでは+3000されない", {
    turn: "opp", phase: "attack",
    me: { spirits: [{ card: VIPER }, { card: R3, label: "守り" }] },
    opp: { spirits: [{ card: ARMOR, label: "攻撃役" }] },
}, (t) => {
    const guard = t.inst("守り")
    t.act("opp", { type: "attack", instanceId: t.inst("攻撃役").instanceId })
    assert(declareBlock(t.s, t.pid("me"), guard.instanceId) === null, `${t.tag} ブロックできる`)
    assert(effectiveBp(t.s, t.pid("me"), guard) === 3000, `${t.tag} 3000のまま`)
})

// Lv2：ボイドから相手のライフにコアが置かれたとき、置かれたコア1個につき、相手は、相手の手札2枚を破棄する
const viperLife = (viperCores: number, turn: Side, caster: Side): Spec => ({
    turn, phase: "main",
    me: { spirits: [{ card: VIPER, cores: viperCores }], hand: caster === "me" ? [HEAL] : [] },
    opp: { hand: caster === "opp" ? [HEAL, R0, R1, R3] : [R0, R1, R3] },
})
play("014 Lv2：相手のライフにボイドからコアが置かれた→相手が手札2枚を破棄", viperLife(2, "opp", "opp"), (t) => {
    cast(t, "opp", 0)
    assert(t.p("opp").life === 6, `${t.tag} 相手のライフが1増えた`)
    answer(t, { by: "opp", card: victimLabel(R0) }, "相手が破棄する1枚目")
    answer(t, { by: "opp", card: victimLabel(R1) }, "相手が破棄する2枚目")
    assert(t.p("opp").hand.length === 1 && t.handCount("opp", R3) === 1, `${t.tag} 手札は3枚→1枚（選んだ2枚を破棄）`)
    assert(t.trashCount("opp", R0) === 1 && t.trashCount("opp", R1) === 1, `${t.tag} 破棄した2枚はトラッシュにある`)
})
play("014 Lv1では発揮しない", viperLife(1, "opp", "opp"), (t) => {
    cast(t, "opp", 0)
    noPending(t, "Lv1")
    assert(t.p("opp").hand.length === 3, `${t.tag} 手札は減らない`)
})
play("014 Lv2：自分のライフにコアを置いても発揮しない（相手のライフ、が条件）", viperLife(2, "me", "me"), (t) => {
    cast(t, "me", 0)
    noPending(t, "自分のライフ")
    assert(t.p("opp").hand.length === 3, `${t.tag} 相手の手札は減らない`)
})

// ---------------------------------------------------------------------------------------------
console.log("=== BS17-015 闇騎士パロミデス：【不死：コスト3】 ===")
// ---------------------------------------------------------------------------------------------
play("015 コスト3が破壊→召喚できる", undyingSpec(R3, [PALOM]), (t) => {
    battle(t, "opp", attackerLabel, victimLabel(R3))
    answer(t, { by: "me", yes: true }, "不死の召喚確認")
    finish(t)
    assert(t.fieldCount("me", PALOM) === 1 && t.trashCount("me", PALOM) === 0, `${t.tag} 場に出る`)
})
play("015 コスト4が破壊されても出ない", undyingSpec(R4, [PALOM]), (t) => {
    battle(t, "opp", attackerLabel, victimLabel(R4))
    noPending(t, "コスト違い")
    assert(t.fieldCount("me", PALOM) === 0, `${t.tag} 出ない`)
})
play("015 断れば出ない", undyingSpec(R3, [PALOM]), (t) => {
    battle(t, "opp", attackerLabel, victimLabel(R3))
    answer(t, { by: "me", yes: false }, "不死の召喚確認")
    assert(t.fieldCount("me", PALOM) === 0 && t.trashCount("me", PALOM) === 1, `${t.tag} トラッシュに残る`)
})

// ---------------------------------------------------------------------------------------------
console.log("=== BS17-016 闇騎士ランスロット ===")
// ---------------------------------------------------------------------------------------------
play("016 不死:コスト6が破壊→召喚できる", { ...undyingSpec(R6, [LANCE], "味方"), opp: { spirits: [{ card: R6, cores: 3, label: "攻撃役" }] } }, (t) => {
    battle(t, "opp", attackerLabel, "味方")
    answer(t, { by: "me", yes: true }, "不死の召喚確認")
    finish(t)
    assert(t.fieldCount("me", LANCE) === 1, `${t.tag} 場に出る`)
})
play("016 コスト5が破壊されても不死は出ない", undyingSpec(R5, [LANCE]), (t) => {
    battle(t, "opp", attackerLabel, victimLabel(R5))
    noPending(t, "コスト違い")
    assert(t.fieldCount("me", LANCE) === 0, `${t.tag} 出ない`)
})

// バースト：相手による自分のスピリット破壊後。紫のスピリットカード2枚を手札に戻すことで召喚する。召喚時に疲労状態のコスト5以下の相手のスピリットを破壊
const lanceBurst = (trash: string[]): Spec => ({
    turn: "opp", phase: "main",
    me: { spirits: [{ card: R3, rested: true }], burst: LANCE, trash, reserve: 30 },
    opp: {
        spirits: [{ card: R5, rested: true, label: "疲労5" }, { card: R4, rested: true, label: "疲労4" }, { card: R5, label: "回復5" }, { card: R6, rested: true, label: "疲労6" }],
        hand: [COFFIN],
    },
})
play("016 バースト：紫2枚を戻して召喚→召喚時に疲労コスト5以下を破壊", lanceBurst([HEL, HEL, PURP3]), (t) => {
    cast(t, "opp", 0, victimLabel(R3))
    answer(t, { by: "me", yes: true }, "バースト発動の確認")
    answer(t, { by: "me", card: victimLabel(HEL) }, "戻す1枚目")
    answer(t, { by: "me", card: victimLabel(HEL) }, "戻す2枚目")
    if (t.s.pendingChoice?.kind === "card") t.act("me", { type: "resolveChoice" }) // 選択の確定
    const pc = answer(t, { by: "me", target: "疲労4" }, "破壊する疲労状態のスピリットを選ぶ")
    assert(!!pc && pc.candidates.length === 2, `${t.tag} 候補は疲労状態のコスト5以下の2体だけ（回復中・コスト6は除く）`)
    assert(!!pc && pc.candidates.includes(t.inst("疲労5").instanceId), `${t.tag} 疲労状態のコスト5が候補`)
    assert(t.fieldCount("me", LANCE) === 1, `${t.tag} ランスロットが場に出る`)
    assert(t.handCount("me", HEL) === 2 && t.trashCount("me", HEL) === 0, `${t.tag} ヘルスコルピオ2枚が手札へ戻る`)
    assert(t.trashCount("opp", R4) === 1 && t.fieldCount("opp", R5) === 2 && t.fieldCount("opp", R6) === 1, `${t.tag} 疲労4だけが破壊される`)
    assert(t.p("me").burst === null, `${t.tag} バーストエリアは空になる`)
})
play("016 バースト：紫が1枚しか無ければ戻せず召喚できない（ことで）", lanceBurst([HEL]), (t) => {
    cast(t, "opp", 0, victimLabel(R3))
    answer(t, { by: "me", yes: true }, "バースト発動の確認")
    finish(t)
    assert(t.fieldCount("me", LANCE) === 0, `${t.tag} 召喚されない`)
    assert(t.trashCount("me", HEL) === 1 && t.handCount("me", HEL) === 0, `${t.tag} ヘルスコルピオはトラッシュに残る`)
    assert(t.fieldCount("opp", R4) === 1, `${t.tag} 召喚時効果も起きない`)
})
play("016 バースト：自分の効果で自分のスピリットを破壊しても誘発しない（相手による、が条件）", {
    turn: "me", phase: "main",
    me: { spirits: [{ card: R3, rested: true }], burst: LANCE, trash: [HEL, HEL], hand: [COFFIN] },
}, (t) => {
    cast(t, "me", 0, victimLabel(R3))
    noPending(t, "自分が破壊した")
    assert(t.p("me").burst === LANCE, `${t.tag} バーストはセットされたまま`)
})
play("016 召喚時：疲労状態のコスト5以下の相手のスピリット1体を破壊", {
    turn: "me", phase: "main",
    me: { hand: [LANCE], reserve: 12 },
    opp: { spirits: [{ card: R5, rested: true, label: "疲労5" }, { card: R4, rested: true, label: "疲労4" }, { card: R5, label: "回復5" }, { card: R6, rested: true, label: "疲労6" }] },
}, (t) => {
    t.act("me", { type: "summon", handIndex: 0 })
    const pc = answer(t, { by: "me", target: "疲労5" }, "破壊するスピリットを選ぶ")
    assert(!!pc && pc.candidates.length === 2 && !pc.candidates.includes(t.inst("回復5").instanceId) && !pc.candidates.includes(t.inst("疲労6").instanceId), `${t.tag} 候補は疲労状態のコスト5以下の2体`)
    assert(t.trashCount("opp", R5) === 1 && t.fieldCount("opp", R5) === 1 && t.fieldCount("opp", R4) === 1, `${t.tag} 疲労5だけが破壊される`)
})
play("016 召喚時：疲労状態のコスト5以下がいなければ何も起きない", {
    turn: "me", phase: "main",
    me: { hand: [LANCE], reserve: 12 },
    opp: { spirits: [{ card: R5, label: "回復5" }, { card: R6, rested: true, label: "疲労6" }] },
}, (t) => {
    t.act("me", { type: "summon", handIndex: 0 })
    noPending(t, "候補なし")
    assert(t.fieldCount("opp", R5) === 1 && t.fieldCount("opp", R6) === 1, `${t.tag} どちらも残る`)
})

// ---------------------------------------------------------------------------------------------
console.log("=== BS17-017 冥天獣フル・フール ===")
// ---------------------------------------------------------------------------------------------
scenario({
    name: "017 自分のバーストをセットしたとき、相手のスピリットのコア1個を相手のトラッシュへ",
    start: {
        interactive: true,
        me: { hand: [DRAW2], spirits: [{ card: FOOL }] },
        opp: { spirits: [{ card: R5, cores: 2, label: "A" }, { card: R6, cores: 3, label: "B" }] },
    },
    steps: (t) => {
        t.act("me", { type: "setBurst", handIndex: 0 })
        const pc = t.state.pendingChoice
        assert(!!pc && pc.pid === t.me && pc.kind === "target", "コアを置く相手のスピリットを自分が選ぶ")
        assert(!!pc && pc.candidates.length === 2 && !pc.candidates.includes(t.id("冥天獣フル・フール")), "候補は相手のスピリット2体だけ")
        t.act("me", { type: "resolveChoice", instanceId: t.id("A") })
    },
    expect: [
        "自分.手札: 妖華吸血爪 → なし",
        "自分.バースト: なし → 妖華吸血爪",
        "相手.A.コア: 2 → 1",
        "相手.トラッシュのコア: 0 → 1",
    ],
})
scenario({
    name: "017 相手のバーストのセットでは発揮しない",
    start: {
        turn: "opp", interactive: true,
        me: { spirits: [{ card: FOOL }, { card: R5, cores: 2, label: "A" }] },
        opp: { hand: [DRAW2], spirits: [{ card: R6, cores: 3, label: "B" }] },
    },
    steps: (t) => {
        t.act("opp", { type: "setBurst", handIndex: 0 })
        assert(!t.state.pendingChoice, "選択待ちは立たない")
    },
    expect: [
        "相手.手札: 妖華吸血爪 → なし",
        "相手.バースト: なし → 妖華吸血爪",
    ],
})

// ---------------------------------------------------------------------------------------------
console.log("=== BS17-018 紫晶の大蛇ザウム：【呪撃】 ===")
// ---------------------------------------------------------------------------------------------
// ⚠️ ブロッカーのBPがザウムより高く、ザウムが先にBPで破壊される場面でも、呪撃の破壊が残るかは効果文だけでは決まらない（質問欄）
scenario({
    name: "018 ブロックした相手のスピリットをバトル終了時に破壊する",
    start: {
        phase: "attack",
        me: { spirits: [{ card: ZAUM }] },
        opp: { spirits: [{ card: R2, cores: 4, label: "ブロッカー" }, { card: R1, label: "控え" }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("紫晶の大蛇ザウム") })
        assert(declareBlock(t.state, t.opp, t.id("ブロッカー")) === null, "ブロックできる")
        t.closeFlash()
    },
    expect: [
        "自分.紫晶の大蛇ザウム.場所: フィールド → なし",
        "自分.リザーブ: 10 → 11",
        "自分.トラッシュ: なし → 紫晶の大蛇ザウム",
        "相手.ブロッカー.場所: フィールド → なし",
        "相手.リザーブ: 10 → 14",
        "相手.トラッシュ: なし → アイバーン",
    ],
})
scenario({
    name: "018 ブロックされなければ呪撃は何も起こさない（相手のスピリットは壊れない）",
    start: {
        phase: "attack",
        me: { spirits: [{ card: ZAUM }] },
        opp: { spirits: [{ card: R2, cores: 4, label: "ブロッカー" }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("紫晶の大蛇ザウム") })
        assert(takeLifeAndResolve(t.state, t.opp) === null, "ライフで受ける")
    },
    expect: [
        "自分.紫晶の大蛇ザウム.疲労: false → true",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

// ---------------------------------------------------------------------------------------------
console.log("=== BS17-056 アロンダイザー ===")
// ---------------------------------------------------------------------------------------------
const alonBurst = (blocker: boolean): Spec => ({
    turn: "opp", phase: "attack",
    me: { burst: ALON, reserve: 30, spirits: blocker ? [{ card: R1, label: "守り" }] : [] },
    opp: { spirits: [{ card: R6, cores: 3, label: "攻撃役" }, { card: R5, cores: 3, label: "狙い" }] },
})
play("056 バースト：ライフ減少後→相手のスピリットのコア2個を相手のリザーブへ、発揮後にこのブレイヴを召喚", alonBurst(false), (t) => {
    const before = totalCores(t.p("opp"))
    hitLife(t, "opp", attackerLabel)
    answer(t, { by: "me", yes: true }, "バースト発動の確認")
    answer(t, { by: "me", target: "狙い" }, "コアを置かせる相手のスピリットを選ぶ")
    finish(t)
    assert(t.inst("狙い").cores === 1, `${t.tag} 狙ったスピリットのコアが2個減る`)
    assert(t.inst(attackerLabel).cores === 3, `${t.tag} 他のスピリットは変わらない`)
    assert(totalCores(t.p("opp")) === before, `${t.tag} コアはリザーブへ移っただけ`)
    assert(t.fieldCount("me", ALON) === 1, `${t.tag} アロンダイザーが場に出る`)
    assert(t.p("me").burst === null, `${t.tag} バーストエリアは空になる`)
})
play("056 バースト：ライフが減らなければ誘発しない", alonBurst(true), (t) => {
    battle(t, "opp", attackerLabel, "守り")
    noPending(t, "ライフは減っていない")
    assert(t.p("me").burst === ALON, `${t.tag} バーストはセットされたまま`)
    assert(t.p("me").life === 5, `${t.tag} ライフは減っていない`)
})

const alonCombine: Spec = {
    turn: "me", phase: "main",
    me: { spirits: [{ card: GAHERIS, label: "ホスト" }, { card: ALON, label: "ブレイヴ" }, { card: R3, label: "別系統" }] },
    opp: { spirits: [{ card: R5, rested: true, label: "疲労A" }, { card: R4, rested: true, label: "疲労B" }, { card: R1, label: "回復" }] },
}
play("056 合体アタック時：疲労状態の相手のスピリット1体を破壊", alonCombine, (t) => {
    t.act("me", { type: "combineBrave", braveInstanceId: t.inst("ブレイヴ").instanceId, hostInstanceId: t.inst("ホスト").instanceId })
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.inst("ホスト").instanceId })
    const pc = answer(t, { by: "me", target: "疲労A" }, "破壊する疲労状態のスピリットを選ぶ")
    assert(!!pc && pc.candidates.length === 2 && !pc.candidates.includes(t.inst("回復").instanceId), `${t.tag} 候補は疲労状態の2体だけ`)
    assert(t.trashCount("opp", R5) === 1 && t.fieldCount("opp", R4) === 1 && t.fieldCount("opp", R1) === 1, `${t.tag} 疲労Aだけが破壊される`)
})
play("056 合体条件：覇皇/雄将/魔影のどれも持たないスピリットには合体できない", alonCombine, (t) => {
    t.rej("me", { type: "combineBrave", braveInstanceId: t.inst("ブレイヴ").instanceId, hostInstanceId: t.inst("別系統").instanceId })
})

// ---------------------------------------------------------------------------------------------
console.log("=== BS17-063 黒き聖杯 ===")
// ---------------------------------------------------------------------------------------------
// Lv1･Lv2：相手の効果では、ターンに1個までしか、相手のボイド/トラッシュからコアを相手のライフ/フィールド/リザーブに置けない
const hopperTurn = (grail: boolean, turn: Side): Spec => {
    const hoppers = [{ card: HOPPER, label: "一匹目" }, { card: HOPPER, label: "二匹目" }]
    const blockers = [{ card: R1 }]
    return {
        turn, phase: "attack",
        me: { spirits: turn === "me" ? hoppers : blockers, nexuses: grail ? [{ card: GRAIL }] : [] },
        opp: { spirits: turn === "opp" ? hoppers : blockers },
    }
}
play("063 相手のスピリット効果でボイドから置けるのはターンに1個まで", hopperTurn(true, "opp"), (t) => {
    hitLife(t, "opp", "一匹目")
    t.act("opp", { type: "attack", instanceId: t.inst("二匹目").instanceId })
    assert(t.inst("一匹目").cores === 2, `${t.tag} 1回目はコアが置かれる`)
    assert(t.inst("二匹目").cores === 1, `${t.tag} 2回目は置けない`)
})
play("063 対照：聖杯が無ければ2回とも置ける", hopperTurn(false, "opp"), (t) => {
    hitLife(t, "opp", "一匹目")
    t.act("opp", { type: "attack", instanceId: t.inst("二匹目").instanceId })
    assert(t.inst("一匹目").cores === 2 && t.inst("二匹目").cores === 2, `${t.tag} 2個とも置かれる`)
})
play("063 自分の効果は制限されない", hopperTurn(true, "me"), (t) => {
    hitLife(t, "me", "一匹目")
    t.act("me", { type: "attack", instanceId: t.inst("二匹目").instanceId })
    assert(t.inst("一匹目").cores === 2 && t.inst("二匹目").cores === 2, `${t.tag} 自分は2個とも置ける`)
})
play("063 マジックの効果は制限されない（スピリット/ブレイヴ/ネクサスの効果のみ）", {
    turn: "opp", phase: "main",
    me: { nexuses: [{ card: GRAIL }] },
    opp: { hand: [HEAL, HEAL], reserve: 20 },
}, (t) => {
    cast(t, "opp", 0)
    cast(t, "opp", 0)
    assert(t.p("opp").life === 7, `${t.tag} ヒーリングサークルは2回とも通る`)
})

// Lv2：カード名に「闇騎士」と入っている自分のスピリットが相手のスピリット/マジックの効果で破壊されたとき、相手は、相手のスピリット1体を破壊する
const grailLv2 = (victim: string, victimCores: number, grailCores: number, turn: Side): Spec => ({
    turn, phase: "main",
    me: { nexuses: [{ card: GRAIL, cores: grailCores }], spirits: [{ card: victim, cores: victimCores, rested: true, label: "被害" }], hand: turn === "me" ? [COFFIN] : [] },
    opp: { spirits: [{ card: P0, label: "壊す1" }, { card: R1, label: "壊す2" }], hand: turn === "opp" ? [COFFIN] : [] },
})
play("063 Lv2：闇騎士の名前のスピリットが相手のマジックで破壊→相手が自分のスピリット1体を破壊", grailLv2(GAHERIS, 1, 2, "opp"), (t) => {
    cast(t, "opp", 0, "被害")
    const pc = answer(t, { by: "opp", target: "壊す2" }, "相手が破壊する自分のスピリットを選ぶ")
    assert(!!pc && pc.candidates.length === 2, `${t.tag} 候補は相手のスピリット2体`)
    assert(t.trashCount("opp", R1) === 1 && t.fieldCount("opp", P0) === 1, `${t.tag} 選んだスピリットだけが破壊される`)
})
play("063 Lv2：キャメロット・ナイトはLv2なら闇騎士の名前として扱われる", grailLv2(CAMELOT, 2, 2, "opp"), (t) => {
    cast(t, "opp", 0, "被害")
    answer(t, { by: "opp", target: "壊す2" }, "相手が破壊する自分のスピリットを選ぶ")
    assert(t.trashCount("opp", R1) === 1, `${t.tag} 破壊される`)
})
play("063 Lv2：キャメロット・ナイトはLv1なら闇騎士ではない", grailLv2(CAMELOT, 1, 2, "opp"), (t) => {
    cast(t, "opp", 0, "被害")
    noPending(t, "Lv1のキャメロット")
    assert(t.fieldCount("opp", R1) === 1 && t.fieldCount("opp", P0) === 1, `${t.tag} 相手のスピリットは壊れない`)
})
play("063 闇騎士の名前でないスピリットでは発揮しない", grailLv2(R3, 1, 2, "opp"), (t) => {
    cast(t, "opp", 0, "被害")
    noPending(t, "名前違い")
    assert(t.fieldCount("opp", R1) === 1, `${t.tag} 相手のスピリットは壊れない`)
})
play("063 Lv1では2つ目の効果は発揮しない", grailLv2(GAHERIS, 1, 1, "opp"), (t) => {
    cast(t, "opp", 0, "被害")
    noPending(t, "Lv1の聖杯")
    assert(t.fieldCount("opp", R1) === 1, `${t.tag} 相手のスピリットは壊れない`)
})
play("063 バトルでの破壊は対象外（スピリット/マジックの効果、が条件）", {
    turn: "opp", phase: "attack",
    me: { nexuses: [{ card: GRAIL, cores: 2 }], spirits: [{ card: GAHERIS, label: "被害" }] },
    opp: { spirits: [{ card: R6, cores: 3, label: "攻撃役" }, { card: R1, label: "壊す2" }] },
}, (t) => {
    battle(t, "opp", attackerLabel, "被害")
    noPending(t, "バトルで破壊された")
    assert(t.fieldCount("opp", R1) === 1, `${t.tag} 相手のスピリットは壊れない`)
})
play("063 自分の効果で破壊しても発揮しない", grailLv2(GAHERIS, 1, 2, "me"), (t) => {
    cast(t, "me", 0, "被害")
    noPending(t, "自分が破壊した")
    assert(t.fieldCount("opp", R1) === 1, `${t.tag} 相手のスピリットは壊れない`)
})

// ---------------------------------------------------------------------------------------------
console.log("=== BS17-064 死者の湖 ===")
// ---------------------------------------------------------------------------------------------
// Lv1･Lv2『自分のバースト発動後』：相手の合体スピリットのブレイヴ1つを破壊する
const lakeBurst = (combined: boolean, lakeCores: number): Spec => ({
    turn: "opp", phase: "main",
    me: { burst: DRAW2, nexuses: [{ card: LAKE, cores: lakeCores }] },
    opp: { spirits: [{ card: R3, label: "ホスト" }, { card: SHOGO, cores: 2, label: "ブレイヴ" }] },
})
const lakeAttack = (t: T, combine: boolean): void => {
    if (combine) t.act("opp", { type: "combineBrave", braveInstanceId: t.inst("ブレイヴ").instanceId, hostInstanceId: t.inst("ホスト").instanceId })
    t.act("opp", { type: "nextPhase" })
    hitLife(t, "opp", "ホスト")
    answer(t, { by: "me", yes: true }, "バースト発動の確認")
    if (t.s.pendingChoice) answer(t, { by: "me", yes: false }, "カードを使うコスト支払いは断る")
    finish(t)
}
play("064 自分のバースト発動後→相手の合体スピリットのブレイヴを破壊（Lv1）", lakeBurst(true, 1), (t) => {
    lakeAttack(t, true)
    assert(t.handCount("me", R1) === 2, `${t.tag} バーストの2枚ドローは行われた`)
    assert(t.fieldCount("opp", SHOGO) === 0 && t.trashCount("opp", SHOGO) === 1, `${t.tag} ブレイヴが破壊されてトラッシュへ`)
    assert(t.fieldCount("opp", R3) === 1, `${t.tag} ホストのスピリットは残る`)
})
play("064 合体していないブレイヴ（スピリット状態）は破壊されない", lakeBurst(false, 2), (t) => {
    lakeAttack(t, false)
    assert(t.fieldCount("opp", SHOGO) === 1, `${t.tag} スピリット状態のブレイヴは残る`)
})
scenario({
    name: "064 Lv2：コスト3の自分のスピリットが疲労したとき1枚ドロー",
    start: { phase: "attack", me: { spirits: [{ card: R3 }], nexuses: [{ card: LAKE, cores: 3 }] } },
    steps: (t) => t.act("me", { type: "attack", instanceId: t.id("メタルバーン") }),
    expect: [
        "自分.メタルバーン.疲労: false → true",
        "自分.手札: なし → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
    ],
})
scenario({
    name: "064 Lv2：コスト4のスピリットが疲労してもドローしない",
    start: { phase: "attack", me: { spirits: [{ card: R4 }], nexuses: [{ card: LAKE, cores: 3 }] } },
    steps: (t) => t.act("me", { type: "attack", instanceId: t.id("刀剣魚エスパーダ") }),
    expect: ["自分.刀剣魚エスパーダ.疲労: false → true"],
})
scenario({
    name: "064 Lv1ではドローしない",
    start: { phase: "attack", me: { spirits: [{ card: R3 }], nexuses: [{ card: LAKE, cores: 1 }] } },
    steps: (t) => t.act("me", { type: "attack", instanceId: t.id("メタルバーン") }),
    expect: ["自分.メタルバーン.疲労: false → true"],
})
scenario({
    name: "064 Lv2：相手のコスト3のスピリットが疲労しても自分はドローしない（自分の、が条件）",
    start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: LAKE, cores: 3 }] }, opp: { spirits: [{ card: R3 }] } },
    steps: (t) => t.act("opp", { type: "attack", instanceId: t.id("メタルバーン") }),
    expect: ["相手.メタルバーン.疲労: false → true"],
})

// ---------------------------------------------------------------------------------------------
console.log("=== BS17-075 ストラングルフォッグ ===")
// ---------------------------------------------------------------------------------------------
// 相手のライフ/フィールド/リザーブ/トラッシュのコアの合計が自分より diff 個多いとき、さらにコア3個をボイドへ
const fogSpec: Spec = {
    turn: "me", phase: "attack",
    me: { spirits: [{ card: R1, label: "攻撃役" }], hand: [FOG] },
    opp: { spirits: [{ card: R6, cores: 5, label: "標的" }] },
}
const fogRun = (t: T, diff: number): void => {
    // 相手の合計が自分より diff 多くなるようにリザーブを調整する（開始盤面の一部）
    const gap = totalCores(t.p("me")) + diff - totalCores(t.p("opp"))
    t.p("opp").reserve += gap
    flashPriority(t, "me", "攻撃役")
    cast(t, "me", 0)
    finish(t)
}
play("075 コアの合計が自分より3個多い→1個をリザーブへ、さらに3個をボイドへ", fogSpec, (t) => {
    fogRun(t, 3)
    assert(t.inst("標的").cores === 1, `${t.tag} 5-1-3=1`)
})
play("075 合計が2個多いだけなら1個をリザーブへ置くだけ", fogSpec, (t) => {
    const reserveBefore = () => t.p("opp").reserve
    fogRun(t, 2)
    assert(t.inst("標的").cores === 4, `${t.tag} 5-1=4`)
    assert(reserveBefore() > 0, `${t.tag} 相手のリザーブへ置かれた`)
})
play("075 相手のほうが少ないなら1個だけ", fogSpec, (t) => {
    fogRun(t, -5)
    assert(t.inst("標的").cores === 4, `${t.tag} 5-1=4`)
})

// ---------------------------------------------------------------------------------------------
console.log("=== BS17-076 ラウンドテーブルナイツ ===")
// ---------------------------------------------------------------------------------------------
// バースト：自分のライフ減少後→トラッシュのコスト5以下のスピリットを召喚→その後コストを支払うことでフラッシュ効果
const roundBurst: Spec = {
    turn: "opp", phase: "attack",
    me: { burst: ROUND, reserve: 30, trash: [GAHERIS, R6, R2] },
    opp: { spirits: [{ card: R6, cores: 3, label: "攻撃役" }, { card: R5, cores: 4, label: "狙い" }] },
}
play("076 バースト：コスト5以下を召喚→支払ってフラッシュ効果（闇騎士の数だけコアをリザーブへ）", roundBurst, (t) => {
    hitLife(t, "opp", attackerLabel)
    answer(t, { by: "me", yes: true }, "バースト発動の確認")
    const pc = answer(t, { by: "me", card: victimLabel(GAHERIS) }, "召喚するスピリットを選ぶ")
    assert(!!pc && (pc.cardIndices ?? []).length === 2, `${t.tag} 候補はコスト5以下の2枚だけ（コスト6は除く）`)
    assert(t.fieldCount("me", GAHERIS) === 1, `${t.tag} 闇騎士ガヘリスが召喚される`)
    answer(t, { by: "me", yes: true }, "フラッシュ効果のコスト支払い確認")
    answer(t, { by: "me", target: "狙い" }, "コアを置かせる相手のスピリットを選ぶ")
    assert(t.inst("狙い").cores === 3, `${t.tag} 闇騎士1体につきコア1個（4→3）`)
    assert(t.p("me").burst === null, `${t.tag} バーストエリアは空になる`)
})
play("076 バースト：支払いを断ればフラッシュ効果は発揮しない（召喚はそのまま）", roundBurst, (t) => {
    hitLife(t, "opp", attackerLabel)
    answer(t, { by: "me", yes: true }, "バースト発動の確認")
    answer(t, { by: "me", card: victimLabel(GAHERIS) }, "召喚するスピリットを選ぶ")
    answer(t, { by: "me", yes: false }, "フラッシュ効果のコスト支払い確認")
    noPending(t, "断ったあと")
    assert(t.fieldCount("me", GAHERIS) === 1 && t.inst("狙い").cores === 4, `${t.tag} 召喚は済み、コアは動かない`)
})
play("076 フラッシュ：カード名に闇騎士と入っている自分のスピリット1体につきコア1個（Lv2のキャメロットも数える）", {
    turn: "me", phase: "attack",
    me: {
        spirits: [{ card: R1, label: "攻撃役" }, { card: GAHERIS }, { card: CAMELOT, cores: 2, label: "キャメロット2" }, { card: CAMELOT, cores: 1, label: "キャメロット1" }, { card: R3 }],
        hand: [ROUND],
    },
    opp: { spirits: [{ card: R5, cores: 4, label: "標的A" }, { card: R4, cores: 3, label: "標的B" }] },
}, (t) => {
    flashPriority(t, "me", "攻撃役")
    cast(t, "me", 0)
    answer(t, { by: "me", target: "標的A" }, "1個目")
    answer(t, { by: "me", target: "標的B" }, "2個目")
    noPending(t, "闇騎士は2体（ガヘリスとLv2のキャメロット）なので3個目は無い")
    assert(t.inst("標的A").cores === 3 && t.inst("標的B").cores === 2, `${t.tag} 2個がリザーブへ`)
})

// ---------------------------------------------------------------------------------------------
console.log("=== BS17-X02 騎士の覇王ソーディアス・アーサー ===")
// ---------------------------------------------------------------------------------------------
const arthurBurst = (life: number): Spec => ({
    turn: "opp", phase: "attack",
    me: { burst: ARTHUR, life, reserve: 30 },
    opp: { spirits: [{ card: R6, cores: 3, label: "攻撃役" }] },
})
play("X02 バースト：ライフ減少後に自分のライフが3以下→召喚する", arthurBurst(4), (t) => {
    hitLife(t, "opp", attackerLabel)
    assert(t.p("me").life === 3, `${t.tag} ライフは3`)
    answer(t, { by: "me", yes: true }, "バースト発動の確認")
    finish(t)
    assert(t.fieldCount("me", ARTHUR) === 1, `${t.tag} 召喚される`)
})
play("X02 バースト：ライフが4あれば召喚しない", arthurBurst(5), (t) => {
    hitLife(t, "opp", attackerLabel)
    assert(t.p("me").life === 4, `${t.tag} ライフは4`)
    answer(t, { by: "me", yes: true }, "バースト発動の確認")
    finish(t)
    assert(t.fieldCount("me", ARTHUR) === 0, `${t.tag} 召喚されない`)
})

const arthurAttack = (cores: number, trash: string[]): Spec => ({
    turn: "me", phase: "attack",
    me: { spirits: [{ card: ARTHUR, cores }], trash },
})
play("X02 Lv2･Lv3 アタック時：トラッシュの【不死】持ちをコストを支払わずに召喚できる", arthurAttack(3, [CAMELOT, R3, GAHERIS]), (t) => {
    const trashCores = t.p("me").trashCores
    t.act("me", { type: "attack", instanceId: t.inst(victimLabel(ARTHUR)).instanceId })
    answer(t, { by: "me", yes: true }, "発動確認")
    const pc = answer(t, { by: "me", card: victimLabel(CAMELOT) }, "召喚する不死持ちを選ぶ")
    assert(!!pc && (pc.cardIndices ?? []).length === 2, `${t.tag} 候補は不死持ちの2枚だけ（メタルバーンは除く）`)
    finish(t)
    assert(t.fieldCount("me", CAMELOT) === 1 && t.trashCount("me", R3) === 1, `${t.tag} キャメロットだけが場に出る`)
    assert(t.p("me").trashCores === trashCores, `${t.tag} コストは支払っていない（トラッシュのコアが増えない）`)
})
play("X02 Lv1では発揮しない", arthurAttack(1, [CAMELOT]), (t) => {
    t.act("me", { type: "attack", instanceId: t.inst(victimLabel(ARTHUR)).instanceId })
    noPending(t, "Lv1")
    assert(t.fieldCount("me", CAMELOT) === 0, `${t.tag} 召喚されない`)
})
play("X02 トラッシュに不死持ちがいなければ何も起きない", arthurAttack(3, [R3]), (t) => {
    t.act("me", { type: "attack", instanceId: t.inst(victimLabel(ARTHUR)).instanceId })
    noPending(t, "候補なし")
    assert(t.fieldCount("me", R3) === 0, `${t.tag} メタルバーンは召喚されない`)
})

const arthurCombined = (cores: number, combine: boolean): Spec => ({
    turn: "me", phase: "main",
    me: { spirits: [{ card: ARTHUR, cores }, { card: ALON, label: "ブレイヴ" }] },
    opp: { spirits: [{ card: R5, cores: 3, label: "標的A" }, { card: R4, cores: 2, label: "標的B" }] },
})
const arthurRun = (t: T, combine: boolean): void => {
    if (combine) t.act("me", { type: "combineBrave", braveInstanceId: t.inst("ブレイヴ").instanceId, hostInstanceId: t.inst(victimLabel(ARTHUR)).instanceId })
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.inst(victimLabel(ARTHUR)).instanceId })
}
play("X02 【合体時】Lv3 合体アタック時：相手のスピリットのコア1個をボイドへ", arthurCombined(6, true), (t) => {
    const reserve = t.p("opp").reserve
    const trashCores = t.p("opp").trashCores
    arthurRun(t, true)
    answer(t, { by: "me", target: "標的A" }, "コアをボイドに置く相手のスピリットを選ぶ")
    assert(t.inst("標的A").cores === 2 && t.inst("標的B").cores === 2, `${t.tag} 標的Aのコアが1個減る`)
    assert(t.p("opp").reserve === reserve && t.p("opp").trashCores === trashCores, `${t.tag} コアはボイドへ行きリザーブにもトラッシュにも増えない`)
})
play("X02 合体していなければ発揮しない", arthurCombined(6, false), (t) => {
    arthurRun(t, false)
    noPending(t, "合体していない")
    assert(t.inst("標的A").cores === 3, `${t.tag} コアは動かない`)
})
play("X02 合体していてもLv2なら発揮しない", arthurCombined(3, true), (t) => {
    arthurRun(t, true)
    noPending(t, "Lv2")
    assert(t.inst("標的A").cores === 3, `${t.tag} コアは動かない`)
})

console.log("すべてのチェックに合格しました 🎉（part618）")
