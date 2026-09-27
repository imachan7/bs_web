// smoke パート401（「フィールドに残る」を先に解決したら、別の効果の「〜が破壊されたとき」は発揮しない。
// RESUME_STACK.md §7 ①（2026-08-13 ユーザー確認）。本番の操作＝召喚時効果による破壊から通し、左右も入れ替える）
import {
    act,
    assert,
    createGame,
    createInstance,
    getCard,
    handleAction,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const BELDGOAL = "BS09-X36" // 魔界七将ベルドゴール（紫・コスト3。召喚時：疲労状態のコスト4以下の相手1体を破壊）
const PAO = "BS07-042" // パオ・ペイール（コスト4。破壊時：「想獣」1体を疲労させることで回復状態で残る）
const HIPPO = "BS07-037" // ヒッポカンプー（想獣・コスト1。パオの残るコストで疲労させる）
const TREE = "BS13-066" // 生命司る大樹（相手によって自分のスピリットが破壊されたとき、ボイドからコア1個をリザーブへ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BELDGOAL).name === "魔界七将ベルドゴール" && getCard(BELDGOAL).cost === 3, "BELDGOALはベルドゴール")
    assert(getCard(PAO).name === "パオ・ペイール" && getCard(PAO).cost === 4 && getCard(PAO).family.includes("想獣"), "PAOはコスト4の想獣")
    assert(getCard(PAO).effects.some((e) => e.kind === "reviveOnDestroy"), "PAOはフィールドに残る効果を持つ")
    assert(getCard(HIPPO).family.includes("想獣"), "HIPPOは想獣")
    assert(getCard(TREE).name === "生命司る大樹" && getCard(TREE).type === "nexus", "TREEは生命司る大樹")
}

const other = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1")

// turn が BELDGOAL を召喚し、相手のパオを破壊する。解決順では want を含む項目を選ぶ
function run(turn: PlayerId, want: "大樹" | "残る"): { s: GameState; stayed: boolean; reserveGain: number; asked: boolean } {
    const victim = other(turn)
    const s = createGame(`p401-${turn}-${want}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "green" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.phase = "main"
    s.turnPlayer = turn
    s.priorityPlayer = turn
    s.players[turn].reserve = 10
    const pao = createInstance(PAO, s.turn, 1)
    pao.isRested = true
    s.players[victim].field.spirits.push(pao, createInstance(HIPPO, s.turn, 1))
    s.players[victim].field.nexuses.push(createInstance(TREE, s.turn, 0))
    refreshLevelAsOverrides(s)
    s.players[turn].hand = [BELDGOAL]
    const reserve = s.players[victim].reserve
    assert(handleAction(s, turn, { type: "summon", handIndex: 0 }) === null, "召喚が通った")
    let asked = false
    for (let i = 0; i < 10 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        if (pc.kind === "option" && pc.options?.some((o) => o.includes("フィールドに残る"))) {
            asked = pc.pid === turn
            act(s, pc.pid, { type: "resolveChoice", option: pc.options.find((o) => o.includes(want))! })
        } else if (pc.candidates.length > 0) {
            act(s, pc.pid, { type: "resolveChoice", instanceId: pc.candidates.includes(pao.instanceId) ? pao.instanceId : pc.candidates[0]! })
        } else {
            act(s, pc.pid, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        }
    }
    return {
        s,
        stayed: s.players[victim].field.spirits.some((x) => x.instanceId === pao.instanceId),
        reserveGain: s.players[victim].reserve - reserve,
        asked,
    }
}

for (const turn of ["p1", "p2"] as const) {
    console.log(`=== 残るを先に解決（ターンプレイヤー ${turn}） ===`)
    {
        const r = run(turn, "残る")
        assert(r.asked, "解決順をターンプレイヤーに聞く")
        assert(r.stayed, "パオは場に残る")
        assert(r.reserveGain === 0, "破壊が無かったことになったので、大樹の「破壊されたとき」は発揮しない")
    }
    console.log(`=== 大樹を先に解決（ターンプレイヤー ${turn}） ===`)
    {
        const r = run(turn, "大樹")
        assert(r.stayed, "そのあと残るを解決してパオは場に残る")
        assert(r.reserveGain === 1, "破壊待機のうちに解決したので、大樹は発揮する")
    }
}

console.log("すべてのチェックに合格しました 🎉（part401）")
