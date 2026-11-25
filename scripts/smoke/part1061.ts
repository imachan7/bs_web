// smoke パート1061（#707 合体条件を満たさなくなったブレイヴは、その時点で分離する：効果の途中でも1つのアクションを解決したら次の手の前に。docs/design/BRAVE.md）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import type { GameState, PlayerId } from "./helpers"

const OROCHI = "BS19-017" // 大蛇サイドロン（コスト4・Lv2=3コア。【強化】はLv2・3のみ）
const FESKINA = "BS19-077" // フェスキーナ・アームズ（ブレイヴ・コスト3・合体条件【強化】を持つ）
const HOST5 = "BS03-009" // 火吹きメルト（コスト5・効果なし）
const EAGLE = "BS21-055" // ゴルニック・イーグル（ブレイヴ・コスト3・合体条件コスト3以上）
const GENESIS = "X13-12" // 裁きの神剣リ・ジェネシス（ブレイヴ・コスト6・合体条件コスト8以上）
const SUSUKIN = "BS20-059" // ススキンケイ（ブレイヴ・コスト4・合体条件コスト5以上）
const OVERLAY = "BS23-X01" // 龍輝神シャイニング・ドラゴン・オーバーレイ（コスト8・Lv3=4コアで自分の赤すべてに【強化】を与える）
const GORADON = "BS01-001" // ゴラドン（赤・コスト0・効果なし）
const VAN = "BS01-002" // ロクケラトプス（コスト1・効果なし）
const RINN = "BS13-X05" // 麒麟星獣リーン（コスト2・合体条件を無視して合体できる）
const LUXION = "BS21-X06" // 異海神ディスト・ルクシオン（Lv2以上で相手の合体条件がコスト7以上）
const ROLO = "X015" // 放浪者ロロ（コスト6・このスピリット以外の一切の効果を受けない）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk: [string, string, string, number][] = [
        [OROCHI, "大蛇サイドロン", "spirit", 4], [FESKINA, "フェスキーナ・アームズ", "brave", 3], [HOST5, "火吹きメルト", "spirit", 5],
        [EAGLE, "ゴルニック・イーグル", "brave", 3], [GENESIS, "裁きの神剣リ・ジェネシス", "brave", 6], [SUSUKIN, "ススキンケイ", "brave", 4],
        [VAN, "ロクケラトプス", "spirit", 1], [RINN, "麒麟星獣リーン", "spirit", 2], [LUXION, "異海神ディスト・ルクシオン", "spirit", 8], [ROLO, "放浪者ロロ", "spirit", 6], [OVERLAY, "龍輝神シャイニング・ドラゴン・オーバーレイ", "spirit", 8], [GORADON, "ゴラドン", "spirit", 0],
    ]
    for (const [id, name, type, cost] of chk) assert(getCard(id).name === name && getCard(id).type === type && getCard(id).cost === cost, `${id} は ${name}（${type}・コスト${cost}）`)
    assert(getCard(GORADON).colors[0] === "red" && getCard(OVERLAY).colors[0] === "red", "ゴラドンとオーバーレイは赤")
    assert(JSON.stringify(getCard(FESKINA).braveCondition) === JSON.stringify([{ keyword: "kyoka" }]) || JSON.stringify(getCard(FESKINA).braveCondition) === JSON.stringify({ keyword: "kyoka" }), "FESKINAの合体条件は【強化】")
    assert(JSON.stringify(getCard(GENESIS).braveCondition).includes('"minCost":8') && JSON.stringify(getCard(SUSUKIN).braveCondition).includes('"minCost":5') && JSON.stringify(getCard(EAGLE).braveCondition).includes('"minCost":3'), "コスト条件の3枚")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 5
        p.burst = null
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveId: string) {
    const brave = createInstance(braveId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}
const holds = (host: ReturnType<typeof createInstance>) => (host.braveRefs ?? []).length
// 条件に関係しない操作（別スピリットへのコア移動）で、操作後のフックだけを走らせる
function noop(s: GameState): void {
    const other = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "moveCore", instanceId: other.instanceId, direction: "add" }) === null, "別スピリットへコアを足す")
}
const timed = (s: GameState, host: { instanceId: string }, content: object[]) => {
    s.timedEffects = [...s.timedEffects, { content, target: { kind: "instance", instanceId: host.instanceId }, until: "turn", ownerPid: "p1" }] as never
    refreshLevelAsOverrides(s)
}

console.log("=== 1. コアの移動：Lv2 でだけ【強化】を持つホストが Lv1 に下がると、持ち主の選択のあと分離（残す） ===")
{
    const s = game("p1-keep")
    const host = put(s, "p1", OROCHI, 3)
    const brave = combine(s, "p1", host, FESKINA)
    assert(holds(host) === 1, "Lv2 の間は合体したまま")
    assert(act(s, "p1", { type: "moveCore", instanceId: host.instanceId, direction: "remove" }) === null, "コアを1個外して Lv1 にする")
    assert(s.pendingChoice?.braveKeep !== undefined && s.pendingChoice.pid === "p1", "ブレイヴの持ち主に残すかを聞く")
    assert(act(s, "p1", { type: "resolveChoice", option: "残す" }) === null, "残す")
    assert(holds(host) === 0 && s.players.p1.field.spirits.some((x) => x.instanceId === brave.instanceId), "分離してスピリット状態で残る")
}

console.log("=== 2. 同じ場面で「残さない」→トラッシュ ===")
{
    const s = game("p1-trash")
    const host = put(s, "p1", OROCHI, 3)
    const brave = combine(s, "p1", host, FESKINA)
    act(s, "p1", { type: "moveCore", instanceId: host.instanceId, direction: "remove" })
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "残さない")
    assert(holds(host) === 0 && s.players.p1.trashCards.includes(brave.cardId), "ブレイヴはトラッシュへ")
}

console.log("=== 3. 期限つき：このターンの間のコスト+で条件を満たした合体は、ターン終了で失効して分離 ===")
{
    const s = game("timed")
    const host = put(s, "p1", VAN, 1) // コスト1
    timed(s, host, [{ type: "cost", amount: 4 }]) // コスト5
    const brave = combine(s, "p1", host, SUSUKIN) // 合体条件コスト5以上
    noop(s)
    assert(holds(host) === 1, "期限内は合体したまま")
    assert(act(s, "p1", { type: "endTurn" }) === null, "ターンを終える")
    assert(s.pendingChoice?.braveKeep !== undefined && s.pendingChoice.pid === "p1", "ターン終了で失効し、持ち主に残すかを聞く")
    act(s, "p1", { type: "resolveChoice", option: "残す" })
    assert(holds(host) === 0 && s.players.p1.field.spirits.some((x) => x.instanceId === brave.instanceId), "分離した")
}

console.log("=== 4. 発生源の離場：Lv3 のオーバーレイの【強化】付与で合体していたホストが、付与元が場を離れて条件を失い分離 ===")
{
    const s = game("source-gone")
    const overlay = put(s, "p1", OVERLAY, 4) // Lv3
    const host = put(s, "p1", GORADON, 1)
    const brave = combine(s, "p1", host, FESKINA)
    noop(s)
    assert(holds(host) === 1, "付与が効いている間は合体したまま")
    s.players.p1.field.spirits = s.players.p1.field.spirits.filter((x) => x.instanceId !== overlay.instanceId)
    refreshLevelAsOverrides(s)
    const other = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "moveCore", instanceId: other.instanceId, direction: "add" }) === null, "別スピリットへコアを足す")
    assert(s.pendingChoice?.braveKeep?.instanceId === brave.instanceId, "付与元が離れた後の操作で、残すかを聞く")
    act(s, "p1", { type: "resolveChoice", option: "残す" })
    assert(holds(host) === 0 && s.players.p1.field.spirits.some((x) => x.instanceId === brave.instanceId), "分離した")
}

console.log("=== 5. コスト：別のブレイヴの寄与で条件を満たしていた合体は、別のブレイヴが外れたら分離（自分のコストでは満たさない） ===")
{
    const s = game("cost-other-brave")
    const host = put(s, "p1", HOST5, 1) // コスト5
    timed(s, host, [{ type: "combineLimitBonus", amount: 1 }])
    const eagle = combine(s, "p1", host, EAGLE) // コスト3 → ホスト8
    const genesis = combine(s, "p1", host, GENESIS) // 条件コスト8以上（コスト6の自分は数えない）
    noop(s)
    assert(holds(host) === 2, "コスト8の間は2枚とも合体したまま（自分を除いても 5+3=8）")
    // イーグルがいなくなる（効果で場を離れた）
    host.braveRefs = host.braveRefs!.filter((r) => r.instanceId !== eagle.instanceId)
    s.players.p1.field.combinedBraves = s.players.p1.field.combinedBraves.filter((b) => b.instanceId !== eagle.instanceId)
    refreshLevelAsOverrides(s)
    const other = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "moveCore", instanceId: other.instanceId, direction: "add" }) === null, "別スピリットへコアを足す")
    assert(s.pendingChoice?.braveKeep?.instanceId === genesis.instanceId, "ジェネシスだけが分離の対象（自分のコスト6を足して満たしたことにしない）")
    act(s, "p1", { type: "resolveChoice", option: "残す" })
    assert(holds(host) === 0, "分離した")
}

console.log("=== 6. 分離しない：素で条件を満たすホスト ===")
{
    const s = game("natural")
    const host = put(s, "p1", OROCHI, 3)
    combine(s, "p1", host, FESKINA)
    noop(s)
    assert(s.pendingChoice === null && holds(host) === 1, "Lv2 のままなら分離しない")
}

console.log("=== 7. 分離しない：待機状態のホスト ===")
{
    const s = game("waiting")
    const host = put(s, "p1", OROCHI, 1) // Lv1 で【強化】なし
    combine(s, "p1", host, FESKINA)
    host.waiting = { kind: "destroy" } as never
    noop(s)
    assert(s.pendingChoice === null && holds(host) === 1, "待機状態は条件を満たさなくても合体したまま")
}

console.log("=== 8. 分離しない：合体条件を無視して合体しているホスト ===")
{
    const s = game("ignore")
    const host = put(s, "p1", RINN, 1)
    combine(s, "p1", host, GENESIS) // コスト8以上の条件だがリーンはコスト2
    noop(s)
    assert(s.pendingChoice === null && holds(host) === 1, "リーンに合体したブレイヴは分離しない")
}

console.log("=== 9. X06：効果を受けるホストは追加下限で分離、効果を受けないホストは分離しない ===")
{
    const s = game("x06")
    put(s, "p2", LUXION, 3) // Lv2 以上
    const weak = put(s, "p1", HOST5, 1) // コスト5＜7
    combine(s, "p1", weak, EAGLE)
    const rolo = put(s, "p1", ROLO, 1) // コスト6＜7、効果を受けない
    const eagle2 = combine(s, "p1", rolo, EAGLE)
    noop(s)
    assert(s.pendingChoice?.braveKeep !== undefined, "効果を受けるホストは分離の対象")
    act(s, "p1", { type: "resolveChoice", option: "残す" })
    assert(holds(weak) === 0 && holds(rolo) === 1 && eagle2.braveCombined === true, "ロロへの合体だけが残る")
}

console.log("=== 10. 連鎖：1枚目の分離で2枚目の条件も崩れたら、同じ後始末の中で2枚目も分離する ===")
for (const interactive of [false, true]) {
    const s = game(`chain-${interactive}`)
    s.interactiveTargets = interactive
    const host = put(s, "p1", OROCHI, 3) // コスト4・Lv2で【強化】
    timed(s, host, [{ type: "cost", amount: 1 }, { type: "combineLimitBonus", amount: 1 }])
    const feskina = combine(s, "p1", host, FESKINA) // 【強化】が条件・コスト3
    const genesis = combine(s, "p1", host, GENESIS) // コスト8以上が条件。自分を除いて 4+1+3=8
    noop(s)
    assert(s.pendingChoice === null && holds(host) === 2, `${interactive ? "対話" : "非対話"}：はじめは2枚とも合体したまま`)
    assert(act(s, "p1", { type: "moveCore", instanceId: host.instanceId, direction: "remove" }) === null, "コアを外して Lv1 にする")
    if (interactive) {
        assert(s.pendingChoice?.braveKeep?.instanceId === feskina.instanceId, "対話：まずフェスキーナを聞く")
        act(s, "p1", { type: "resolveChoice", option: "残す" })
        assert(s.pendingChoice?.braveKeep?.instanceId === genesis.instanceId, "対話：答えた後にジェネシスを聞く（5 では条件コスト8を満たさない）")
        act(s, "p1", { type: "resolveChoice", option: "残す" })
    }
    assert(s.pendingChoice === null && holds(host) === 0, `${interactive ? "対話" : "非対話"}：2枚とも分離した`)
}

console.log("=== 11. 効果の途中：「コアを外す → その後 ドロー」なら、外した直後（ドローの前）に分離する ===")
for (const interactive of [true, false]) {
    const s = game(`mid-effect-${interactive}`)
    s.interactiveTargets = interactive
    const host = put(s, "p1", OROCHI, 3) // Lv2 で【強化】
    const brave = combine(s, "p1", host, FESKINA)
    noop(s)
    const hand0 = s.players.p1.hand.length
    const seq = { type: "sequence", actions: [{ type: "removeCores", side: "own", target: "self", to: "trash", count: 1 }, { type: "draw", count: 1 }] } as EffectAction
    resolveAction(s, "p1", host, seq)
    if (interactive) {
        assert(s.pendingChoice?.braveKeep?.instanceId === brave.instanceId, "対話：コアを外した直後に、残すかを聞く")
        assert(s.players.p1.hand.length === hand0, "対話：答える前にはドローしていない（分離が先）")
        act(s, "p1", { type: "resolveChoice", option: "残す" })
        assert(s.players.p1.hand.length === hand0 + 1, "対話：答えた後にドローする")
    } else {
        assert(holds(host) === 0 && s.players.p1.hand.length === hand0 + 1, "非対話：分離してからドローまで進む")
    }
    assert(holds(host) === 0, `${interactive ? "対話" : "非対話"}：分離した`)
}

console.log("すべてのチェックに合格しました 🎉（part1061）")
