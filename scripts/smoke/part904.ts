// smoke パート904（Muse 監査 #437 のデータ側の食い違い：R4-3・R5-1・R8-1・R8-6・R11B-5）
import { act, assert, giveBp, createGame, createInstance, currentLevel, effectiveBp, effectiveCost, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart, spiritHasKeyword, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { attachBrave } from "../../server/src/logic/EffectModules"
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import type { EffectAction } from "../../server/src/type"

const VANILLA = "BS01-002" // ロクケラトプス（BP1000）
const TENREI = "BS10-048" // 天使パワー（天霊・効果なし）
const KAISHU = "BS16-050" // ガイメイル・ヒドラ（海首）
const KENSHI = "BS21-006" // 長腕の剣使いアスキーナ（剣使・コスト5）
const MAMON = "BS15-064" // 冥府へ続く魔門（Lv2 はコア2）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(TENREI).family.includes("天霊") && getCard(KAISHU).family.includes("海首") && getCard(KENSHI).family.includes("剣使"), "系統の確認")
    assert(getCard(TENREI).effects.length === 0, "天使パワーは効果なし")
    assert(getCard(MAMON).levels[1]!.cores === 2 && getCard("BS16-071").levels[1]!.cores === 2, "魔門・海の主を祭る島の Lv2 はコア2")
}

function game(seed: string, phase: "main" | "attack" = "main"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = phase
    s.players.p1.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    ;(getCard(cardId).type === "nexus" ? s.players[pid].field.nexuses : s.players[pid].field.spirits).push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== R4-3. バーストをセットしている間、手札の虚造帝フェニックス・ゴレム／虚獣帝スフィン・クロスはコスト7 ===")
for (const id of ["BS15-054", "BS15-045"]) {
    const s = game(`p904-cost-${id}`)
    s.players.p1.hand = [id]
    assert(effectiveCost(s, "p1", getCard(id)) > 7, `${getCard(id).name}：バーストなしは元のコスト（${effectiveCost(s, "p1", getCard(id))}）`)
    s.players.p1.burst = VANILLA
    s.players.p1.burstSet = true
    assert(effectiveCost(s, "p1", getCard(id)) <= 7, `${getCard(id).name}：バーストありはコスト7（軽減後 ${effectiveCost(s, "p1", getCard(id))}）`)
}

console.log("=== R4-3. 【連鎖】は Lv2・Lv3 だけ（Lv1 で合体しても【連鎖】を持たない） ===")
for (const id of ["BS21-015", "BS21-042"]) {
    for (const [cores, want] of [[1, false], [3, true]] as const) {
        const s = game(`p904-rensa-${id}-${cores}`)
        const host = put(s, "p1", id, cores)
        attachBrave(s, "p1", host, createInstance("BS23-062", s.turn, 0))
        assert(spiritHasKeyword(s, "p1", host, "rensa") === want, `${getCard(id).name} Lv${currentLevel(host).level}：【連鎖】${want ? "あり" : "なし"}`)
    }
}

console.log("=== R5-1. ブレシングコア：ネクサス3つのうち2つにだけ1個ずつ置く ===")
{
    const s = game("p904-blessing")
    const nexuses = [put(s, "p1", MAMON, 0), put(s, "p1", MAMON, 0), put(s, "p1", MAMON, 0)]
    const action = getCard("BS09-083").effects.find((e) => e.id === "BS09-083-e1") as { action: EffectAction }
    resolveAction(s, "p1", null, action.action)
    const placed = nexuses.map((n) => n.cores)
    assert(placed.filter((c) => c === 1).length === 2 && placed.filter((c) => c === 0).length === 1, `2つに1個ずつ（${placed.join(",")}）`)
}

console.log("=== R8-1. 天使長エンジュ Lv3 が与えた【聖命】で、天霊のスピリットのアタックでもライフにコアが置かれる ===")
{
    const s = game("p904-enju", "attack")
    put(s, "p1", "BS14-054", 4)
    const tenrei = put(s, "p1", TENREI, 1)
    s.players.p2.field.spirits = []
    const life = s.players.p1.life
    assert(act(s, "p1", { type: "attack", instanceId: tenrei.instanceId }) === null, "天使パワーでアタック")
    assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
    assert(s.players.p1.life === life + 1, `自分のライフ +1（${life} → ${s.players.p1.life}）`)
}

console.log("=== R8-1. ジル・ド・レ／ラ・イールは【氷壁】を持つ ===")
for (const id of ["BS16-031", "BS16-032"]) {
    const s = game(`p904-hyoheki-${id}`)
    const inst = put(s, "p1", id, 1)
    assert(spiritHasKeyword(s, "p1", inst, "hyoheki"), `${getCard(id).name}：【氷壁】を持つ`)
}

console.log("=== R8-6. 竜鎧の巨人オージアスは Lv2 のときだけ自分のネクサスを Lv2 として扱う ===")
for (const [cores, want] of [[1, 1], [4, 2]] as const) {
    const s = game(`p904-ojias-${cores}`)
    const nexus = put(s, "p1", MAMON, 0)
    put(s, "p1", "BS09-051", cores)
    assert(currentLevel(nexus).level === want, `オージアスのコア${cores}：魔門は Lv${want}（${currentLevel(nexus).level}）`)
}

console.log("=== R8-6. 海の主を祭る島は Lv2 のときだけ、アタックステップで海首の Lv を1つ上として扱う ===")
for (const [cores, want] of [[0, 1], [2, 2]] as const) {
    const s = game(`p904-island-${cores}`, "attack")
    put(s, "p1", "BS16-071", cores)
    const kaishu = put(s, "p1", KAISHU, 1)
    assert(currentLevel(kaishu).level === want, `島のコア${cores}：ガイメイル・ヒドラは Lv${want}（${currentLevel(kaishu).level}）`)
}

console.log("=== R11B-5. 焔竜の城塞都市：同時に2体破壊したら2枚ドロー ===")
{
    const s = game("p904-fortress", "attack")
    put(s, "p1", "BS14-075", 0)
    const a = put(s, "p2", VANILLA, 1)
    const b = put(s, "p2", VANILLA, 1)
    const hand = s.players.p1.hand.length
    destroyTargetsBatch(s, "p1", [{ pid: "p2", instanceId: a.instanceId }, { pid: "p2", instanceId: b.instanceId }], { sourcePid: "p1", sourceType: "spirit" })
    assert(s.players.p1.hand.length === hand + 2, `2枚ドロー（${s.players.p1.hand.length - hand}枚）`)
}

console.log("=== R8-6. 極光剣ソルブレイカーの合体アタック時：剣使なら BP10000以上、そうでなければ BP5000以下を手札に戻す ===")
for (const [hostId, label] of [[KENSHI, "剣使"], [VANILLA, "剣使でない"]] as const) {
    const s = game(`p904-sol-${hostId}`, "attack")
    const host = put(s, "p1", hostId, 1)
    attachBrave(s, "p1", host, createInstance("BS23-062", s.turn, 0))
    const small = put(s, "p2", VANILLA, 1)
    const big = put(s, "p2", "BS17-053", 1)
    s.players.p2.field.spirits = [small, big]
    giveBp(s, big, 10000)
    const entry = getCard("BS23-062").effects.find((e) => e.id === "BS23-062-e2") as { action: EffectAction }
    resolveAction(s, "p1", host, entry.action)
    const returned = s.players.p2.hand.includes(hostId === KENSHI ? "BS17-053" : VANILLA)
    assert(returned && s.players.p2.field.spirits.length === 1, `${label}：${hostId === KENSHI ? `BP${effectiveBp(s, "p2", big)}の方` : "BP1000の方"}が手札に戻る`)
}

console.log("すべてのチェックに合格しました 🎉（part904）")
