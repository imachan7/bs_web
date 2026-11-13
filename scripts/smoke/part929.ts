// smoke パート929（効果の見出しをタグとして読む。shared/rules/effectHeading.ts。2026-11-13 ユーザー確定。#505）
//   - 書き換え（アタックシフト等）は「追加」：元の時にも発揮する（Q24527・Q1953）
//   - 結果連動型（BPを比べ破壊したとき 等）も書き換えに従う（Q20008 セイバーシャーク）
//   - 「『アタック時』効果は発揮されない」は印刷された見出しで照合する：書き換えで発揮する『ブロック時』効果は止めない（Q24751）。
//     『アタック時』の結果連動型は止める
//   - 『アタック時』の結果連動型は、ブロックして勝っても発揮しない（旧 battleRole を見出しで置き換え）
import { act, assert, createGame, createInstance, effectiveBp, getCard, resolveAction, runTurnStart, timedHas } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { attachBrave, fireTrigger } from "../../server/src/logic/EffectModules"
import { currentLevel } from "../../shared/rules"

const HATI = "BS03-045" // 銀狐ハティ：『このスピリットのブロック時』BP+5000
const SCOUT = "BS01-004" // ドラグノ偵察兵：『このスピリットのアタック時』BP+2000
const SHARK = "BS10-072" // セイバーシャーク：【合体時】『ブロック時』BPを比べ相手のスピリットだけを破壊したとき、相手のライフ1個をリザーブへ
const CONDOR = "BS04-025" // ファル・コンドル：『アタック時』BPを比べ破壊したとき、ボイドからリザーブへコア1個
const GORADON = "BS01-001" // ゴラドン：BP1000 のバニラ
const SNAKE = "SD01-012" // 双頭ヘビ：Lv2『アタック時』BPを比べ破壊したとき、1枚ドロー

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HATI).name === "銀狐ハティ" && getCard(HATI).type === "spirit", "HATI は銀狐ハティ")
    assert(getCard(SCOUT).name === "ドラグノ偵察兵", "SCOUT はドラグノ偵察兵")
    assert(getCard(SHARK).name === "セイバーシャーク" && getCard(SHARK).type === "brave", "SHARK はセイバーシャーク")
    assert(getCard(CONDOR).name === "ファル・コンドル", "CONDOR はファル・コンドル")
    assert(getCard(SNAKE).name === "双頭ヘビ", "SNAKE は双頭ヘビ")
    assert(getCard(GORADON).name === "ゴラドン", "GORADON はゴラドン")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        s.players[pid].field.spirits = []
        s.players[pid].field.nexuses = []
        s.players[pid].reserve = 20
        s.players[pid].deck = Array.from({ length: 20 }, () => SCOUT)
    }
    return s
}
const put = (s: GameState, pid: PlayerId, cardId: string, cores = 1) => {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}
// all＝アタックシフトの形（両陣営すべて）。それ以外は指定した1体：triggerSwap は自分のスピリット（マクラーンスラッシュの形）、
// suppressTrigger は相手（p2）が p1 のスピリットに掛ける（月光姫マーニの形）
type C = { type: "triggerSwap"; from: "onBlock" | "onAttack" } | { type: "suppressTrigger"; trigger: "onAttack" }
const timed = (s: GameState, targetId: string, c: C, all = false): void => {
    const actor: PlayerId = c.type === "suppressTrigger" ? "p2" : "p1"
    const action = all ? { type: "timedEffect", content: [c], duration: "turn", side: "both", all: true } : { type: "timedEffect", content: [c], duration: "turn", count: 1, ...(actor === "p1" ? { side: "own" } : {}) }
    resolveAction(s, actor, null, action as never, all ? undefined : targetId, undefined, "magic")
    const inst = s.players.p1.field.spirits.find((sp) => sp.instanceId === targetId)!
    assert(timedHas(s, inst, c.type), `テスト前提: ${c.type} の印が付く`)
}

console.log("=== アタックシフト：『ブロック時』効果はアタック時にも、ブロック時にも発揮する（追加。Q24527） ===")
{
    const s = game("t929-shift")
    const hati = put(s, "p1", HATI)
    const base = effectiveBp(s, "p1", hati)
    timed(s, hati.instanceId, { type: "triggerSwap", from: "onBlock" }, true)
    fireTrigger(s, "p1", hati, "onAttack")
    assert(effectiveBp(s, "p1", hati) === base + 5000, "アタック時に『ブロック時』効果が発揮される")
    fireTrigger(s, "p1", hati, "onBlock")
    assert(effectiveBp(s, "p1", hati) === base + 10000, "ブロック時にも引き続き発揮される")
}

console.log("=== セイバーシャーク：書き換え後は、アタックして勝っても『ブロック時』の結果連動型が発揮する（Q20008） ===")
{
    const s = game("t929-shark-plain")
    const hati = put(s, "p1", HATI)
    attachBrave(s, "p1", hati, createInstance(SHARK, s.turn, 0))
    const life = s.players.p2.life
    fireTrigger(s, "p1", hati, "onBattleWin", "attacker")
    assert(s.players.p2.life === life, "書き換えが無ければ、アタックして勝っても発揮しない")
    fireTrigger(s, "p1", hati, "onBattleWin", "blocker")
    assert(s.players.p2.life === life - 1, "ブロックして勝てば発揮する")
}
{
    const s = game("t929-shark-swap")
    const hati = put(s, "p1", HATI)
    attachBrave(s, "p1", hati, createInstance(SHARK, s.turn, 0))
    timed(s, hati.instanceId, { type: "triggerSwap", from: "onBlock" })
    const life = s.players.p2.life
    fireTrigger(s, "p1", hati, "onBattleWin", "attacker")
    assert(s.players.p2.life === life - 1, "書き換え後は、アタックして勝ったときに発揮する")
}

console.log("=== 月光姫マーニ型：書き換えで発揮する『ブロック時』効果は止めない（Q24751） ===")
{
    const s = game("t929-marni-swap")
    const hati = put(s, "p1", HATI)
    const scout = put(s, "p1", SCOUT)
    timed(s, hati.instanceId, { type: "triggerSwap", from: "onBlock" })
    timed(s, hati.instanceId, { type: "suppressTrigger", trigger: "onAttack" })
    timed(s, scout.instanceId, { type: "suppressTrigger", trigger: "onAttack" })
    const hatiBase = effectiveBp(s, "p1", hati)
    const scoutBase = effectiveBp(s, "p1", scout)
    fireTrigger(s, "p1", hati, "onAttack")
    assert(effectiveBp(s, "p1", hati) === hatiBase + 5000, "印刷が『ブロック時』の効果は、アタック時に発揮しても止まらない")
    fireTrigger(s, "p1", scout, "onAttack")
    assert(effectiveBp(s, "p1", scout) === scoutBase, "印刷が『アタック時』の効果は止まる")
}

console.log("=== 月光姫マーニ型：『アタック時』の結果連動型（BPを比べ破壊したとき）も止める ===")
{
    const s = game("t929-marni-result")
    const condor = put(s, "p1", CONDOR)
    const reserve = s.players.p1.reserve
    fireTrigger(s, "p1", condor, "onBattleWin", "attacker")
    assert(s.players.p1.reserve === reserve + 1, "対照：抑止が無ければアタックして勝ったときコアが増える")
    timed(s, condor.instanceId, { type: "suppressTrigger", trigger: "onAttack" })
    fireTrigger(s, "p1", condor, "onBattleWin", "attacker")
    assert(s.players.p1.reserve === reserve + 1, "『アタック時』効果が発揮されない間は増えない")
}

console.log("=== 『アタック時』の結果連動型は、ブロックして勝っても発揮しない ===")
{
    const s = game("t929-snake")
    const snake = put(s, "p1", SNAKE, 3)
    assert(currentLevel(snake).level === 2, "テスト前提: 双頭ヘビは Lv2")
    const hand = s.players.p1.hand.length
    fireTrigger(s, "p1", snake, "onBattleWin", "blocker")
    assert(s.players.p1.hand.length === hand, "ブロックして勝ってもドローしない")
    fireTrigger(s, "p1", snake, "onBattleWin", "attacker")
    assert(s.players.p1.hand.length === hand + 1, "アタックして勝てばドローする")
}

console.log("=== セイバーシャーク：実際のバトルの流れ（アタック→ブロック→BP比較）でも、書き換え後はアタック側で発揮する（Q20008） ===")
for (const swap of [false, true]) {
    const s = createGame(`t929-shark-flow-${swap}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const hati = createInstance(HATI, s.turn, 1)
    s.players.p1.field.spirits.push(hati)
    attachBrave(s, "p1", hati, createInstance(SHARK, s.turn, 0))
    const goradon = createInstance(GORADON, s.turn, 1)
    s.players.p2.field.spirits.push(goradon)
    if (swap) timed(s, hati.instanceId, { type: "triggerSwap", from: "onBlock" })
    const life = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: hati.instanceId }) === null, "ハティでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: goradon.instanceId }) === null, "ゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === goradon.instanceId), "テスト前提: ゴラドンだけが破壊される")
    assert(s.players.p2.life === life - (swap ? 1 : 0), swap ? "書き換え後は相手のライフが1減る" : "書き換えが無ければライフは減らない（ブロックされている）")
}

console.log("=== 逆向き（ブレイブチャージの形）：『アタック時』の結果連動型は、ブロックして勝ったときにも発揮する ===")
{
    const s = game("t929-condor-reverse")
    const condor = put(s, "p1", CONDOR)
    const reserve = s.players.p1.reserve
    fireTrigger(s, "p1", condor, "onBattleWin", "blocker")
    assert(s.players.p1.reserve === reserve, "対照：書き換えが無ければ、ブロックして勝っても増えない")
    timed(s, condor.instanceId, { type: "triggerSwap", from: "onAttack" })
    fireTrigger(s, "p1", condor, "onBattleWin", "blocker")
    assert(s.players.p1.reserve === reserve + 1, "書き換え後は、ブロックして勝ったときにも増える")
}

console.log("=== 海の主の大口（コアを置かなかったアタッカーの『アタック時』効果を止める）も、『アタック時』の結果連動型を止める ===")
{
    const s = game("t929-toll")
    const condor = put(s, "p1", CONDOR)
    s.battle = { attackerInstanceId: condor.instanceId, attackEffectsSuppressed: true } as never
    const reserve = s.players.p1.reserve
    fireTrigger(s, "p1", condor, "onBattleWin", "attacker")
    assert(s.players.p1.reserve === reserve, "コアが増えない")
}

console.log("すべてのチェックに合格しました 🎉（part929）")
