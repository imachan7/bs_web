// smoke パート1079（アルティメットの土台 段6c：アルティメットとの合体。ULTIMATE.md §8・B13・ULTIMATE_STAGE6.md §10）
import { assert, createGame, createInstance, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { CARD_DB } from "../../server/src/logic/GameState"
import { attachBrave } from "../../server/src/logic/brave"
import { countEffectCounter } from "../../server/src/logic/EffectModules"
import { braveCombineCandidates } from "../../shared/summon"
import { matchesBraveCondition } from "../../shared/rules"

const BASE = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const REAL_BRAVE = "BS10-061" // 剣鎧竜バスター・ドラゴン（ブレイヴ・コスト3・合体条件 vanilla）
const lv = [{ level: 3, cores: 1, bp: 5000 }, { level: 4, cores: 3, bp: 7000 }]

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(REAL_BRAVE).name === "剣鎧竜バスター・ドラゴン" && getCard(REAL_BRAVE).type === "brave" && getCard(REAL_BRAVE).cost === 3, "REAL_BRAVEはコスト3のブレイヴ")
assert((getCard(REAL_BRAVE).braveCondition as { kind?: unknown }).kind === undefined, "実データのブレイヴは kind を持たない")

// 合体条件 kind を持つ偽ブレイヴ（コスト2）。kind＝["ultimate"] / ["spirit","ultimate"] / 省略
const mkBrave = (id: string, kind?: object): string => {
    CARD_DB.set(id, { ...getCard(REAL_BRAVE), cardId: id, cost: 2, braveCondition: { ...(kind ?? {}) } })
    return id
}
const BU = mkBrave("TEST-BU", { kind: ["ultimate"] })
const BSU = mkBrave("TEST-BSU", { kind: ["spirit", "ultimate"] })
const BNO = mkBrave("TEST-BNO")
const ULT = "TEST-ULT"
CARD_DB.set(ULT, { ...getCard(BASE), cardId: ULT, type: "ultimate", cost: 5, levels: lv, effects: [] })

function scene(seed: string): { s: GameState; ult: ReturnType<typeof createInstance>; sp: ReturnType<typeof createInstance> } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    const ult = createInstance(ULT, 1, 1)
    const sp = createInstance(BASE, 1, 1)
    s.players.p1.field.ultimates = [ult]
    s.players.p1.field.spirits = [sp]
    return { s, ult, sp }
}
const cands = (s: GameState, id: string): string[] => braveCombineCandidates(s, "p1", id)

console.log("=== 合体条件 kind（B13） ===")
{
    const { s, ult, sp } = scene("b13-a")
    assert(cands(s, BU).includes(ult.instanceId) && !cands(s, BU).includes(sp.instanceId), "kind:ultimate のブレイヴはアルティメットだけに合体できる")
    assert(cands(s, BSU).includes(ult.instanceId) && cands(s, BSU).includes(sp.instanceId), "kind に両方書けば両方に合体できる")
    assert(!cands(s, BNO).includes(ult.instanceId) && cands(s, BNO).includes(sp.instanceId), "kind の無い偽ブレイヴはアルティメットに合体できない")
    assert(!cands(s, REAL_BRAVE).includes(ult.instanceId), "実データのブレイヴ（kind なし）はアルティメットに合体できない")
    assert(!matchesBraveCondition(s, "p1", ult, REAL_BRAVE), "matchesBraveCondition もアルティメット×kind なしを拒む")
}

console.log("=== 合体の実行（召喚の検証〜配置） ===")
{
    const { s, ult } = scene("b13-b")
    s.phase = "main"
    s.players.p1.hand = [BU]
    s.players.p1.field.ultimates[0]!.cores = 3
    const err = handleAction(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: ult.instanceId } as never)
    assert(!err || typeof err !== "string", `アルティメットへ直接合体で召喚できる ${String(err)}`)
    assert(s.players.p1.field.combinedBraves.length === 1 && (ult.braveRefs ?? []).length === 1, "ブレイヴの実体は combinedBraves・アルティメットが参照を持つ")
}
{
    const { s, ult } = scene("b13-c")
    s.phase = "main"
    s.players.p1.hand = [BNO]
    ult.cores = 3
    const err = handleAction(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: ult.instanceId } as never)
    assert(typeof err === "string", "kind の無いブレイヴは検証で拒まれる")
    assert(s.players.p1.field.combinedBraves.length === 0, "拒まれたら合体しない")
}

console.log("=== braveComposite（C3）：コスト合算で Uトリガーを判定 ===")
{
    // コスト5のアルティメット＋コスト2のブレイヴ＝7。デッキ札コスト6は、合体前はミス・合体後はヒット
    const mk = (attach: boolean): GameState => {
        CARD_DB.set("TEST-D6", { ...getCard(BASE), cardId: "TEST-D6", cost: 6 })
        CARD_DB.set("TEST-UU", { ...getCard(BASE), cardId: "TEST-UU", type: "ultimate", cost: 5, levels: lv, effects: [{ id: "TEST-UU-e1", kind: "triggered", trigger: "onAttack", levels: null, action: { type: "uTrigger", count: 1, hit: [{ type: "draw", count: 2 }] } }] as never })
        const s = createGame("c3", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
        runTurnStart(s)
        s.turn = 3
        s.turnPlayer = "p1"
        s.phase = "attack"
        s.players.p1.deck = Array.from({ length: 60 }, () => BASE)
        s.players.p1.hand = []
        s.players.p2.deck = ["TEST-D6"]
        s.players.p2.trashCards = []
        s.players.p1.field.spirits = []
        s.players.p2.field.spirits = [createInstance(BASE, 1, 1)]
        const ult = createInstance("TEST-UU", 1, 1)
        s.players.p1.field.ultimates = [ult]
        if (attach) attachBrave(s, "p1", ult, createInstance(BU, 1, 1))
        const err = handleAction(s, "p1", { type: "attack", instanceId: ult.instanceId } as never)
        assert(err === null || err === undefined || typeof err !== "string", `（前提）アタックできる ${String(err)}`)
        return s
    }
    const miss = mk(false)
    assert(miss.players.p1.hand.length === 0, "合体前：コスト6の札はコスト5にミス")
    const hit = mk(true)
    assert(hit.players.p1.field.ultimates[0]!.braveComposite?.cost === 2, "アルティメットに braveComposite が作られる")
    assert(hit.players.p1.hand.length === 2, "合体後：コスト7（5+2）でコスト6の札がヒット")
}

console.log("=== 「合体スピリット」を数える counter に入らない ===")
{
    const { s, ult, sp } = scene("cnt")
    attachBrave(s, "p1", ult, createInstance(BU, 1, 1))
    assert(countEffectCounter(s, "p1", null, "ownCombinedSpirits", undefined) === 0, "合体アルティメットは ownCombinedSpirits に入らない")
    attachBrave(s, "p1", sp, createInstance(BSU, 1, 1))
    assert(countEffectCounter(s, "p1", null, "ownCombinedSpirits", undefined) === 1, "合体スピリットだけ数える")
    assert(countEffectCounter(s, "p1", null, "ownCombinedBraves", undefined) === 1, "「合体スピリットのブレイヴ」に合体アルティメットのブレイヴは入らない（B13）")
}

console.log("すべてのチェックに合格しました 🎉（part1079）")
