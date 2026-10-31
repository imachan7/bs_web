// smoke パート711（条件の「いる」系を ownSpiritMatches に、バトル相手を battleOpponentMatches に、
// reviveOnDestroy の絞り込みを filter に、fieldEvent の相手役の軸を partnerFilter に寄せた。docs/design/FILTER_UNIFY.md §7）
import { assert, bpBuffOf, createGame, createInstance, currentLevel, destroySpirit, effectiveBp, fireTrigger, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const OCHOGO = "BS03-056" // オチョゴ（黄。Lv1・自分のフィールドに緑のスピリットがいるとアタック時にコアが置かれる）
const KUNANOMI = "BS04-001" // クナノミ（赤。覚醒持ちが自分にいるとアタック時BP+2000）
const BURACCHIO = "BS10-002" // 首長竜人ブラッキオ（合体スピリットがいる間Lv3として扱う）
const CANCERD = "BS10-X03" // 巨蟹武神キャンサード（Lv2：合体スピリットがいるとき、ライフを減らすとライフ1つ破壊）
const VULM = "BS11-X02" // 滅神星龍ダークヴルム・ノヴァ（Lv2-3：バトル相手が合体スピリットならBP+10000）
const VIPER = "BS17-014" // チェーンバイパー（アタックステップ、バトル相手が装甲/重装甲を持つとBP+3000）
const DURAKU = "BS07-034" // デュラクダール（白・【装甲】持ち）
const PEACH = "BS06-087" // 夢中漂う桃幻郷（Lv2：バトルで破壊された自分の黄のスピリットが復活）
const GREEN = "BS01-054" // ショックイーター（緑）
const AWAKEN = "BS01-013" // タウロスナイト（赤・覚醒持ち）
const PLAIN_RED = "BS01-001" // ゴラドン（赤・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [
        [OCHOGO, "オチョゴ"], [KUNANOMI, "クナノミ"], [BURACCHIO, "首長竜人ブラッキオ"], [CANCERD, "巨蟹武神キャンサード"],
        [VULM, "滅神星龍ダークヴルム・ノヴァ"], [VIPER, "チェーンバイパー"], [DURAKU, "デュラクダール"], [PEACH, "夢中漂う桃幻郷"],
        [GREEN, "ショックイーター"], [AWAKEN, "タウロスナイト"], [PLAIN_RED, "ゴラドン"],
    ]
    for (const [id, name] of names) assert(getCard(id).name === name, `${id} は${name}`)
    assert(getCard(GREEN).colors.includes("green") && getCard(PLAIN_RED).colors.includes("red"), "ショックイーターは緑・ゴラドンは赤")
    const find = (id: string, kind: string): Record<string, unknown>[] => getCard(id).effects.filter((e) => e.kind === kind) as unknown as Record<string, unknown>[]
    for (const id of ["BS08-055", "BS08-078", "SD02-004"]) {
        const fe = find(id, "fieldEvent").filter((e) => "partnerFilter" in e)
        assert(fe.length === 1 && !("condition" in fe[0]!), `${id} の相手役の軸は partnerFilter（condition には残らない）`)
    }
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. triggered.ownSpiritMatches{color}（オチョゴ） ===")
{
    const s = game("ochogo-no")
    const o = put(s, "p1", OCHOGO, 1)
    put(s, "p1", PLAIN_RED, 1)
    fireTrigger(s, "p1", o, "onAttack")
    assert(o.cores === 1, "緑のスピリットがいなければコアは置かれない")
    const s2 = game("ochogo-yes")
    const o2 = put(s2, "p1", OCHOGO, 1)
    put(s2, "p1", GREEN, 1)
    fireTrigger(s2, "p1", o2, "onAttack")
    assert(o2.cores === 2, "緑のスピリットがいればコアが置かれる")
}

console.log("=== 2. triggered.ownSpiritMatches{keyword}（クナノミ） ===")
{
    const s = game("kunanomi-no")
    const k = put(s, "p1", KUNANOMI, 1)
    put(s, "p1", PLAIN_RED, 1)
    fireTrigger(s, "p1", k, "onAttack")
    assert(bpBuffOf(s, k) === 0, "覚醒持ちがいなければBPは増えない")
    const s2 = game("kunanomi-yes")
    const k2 = put(s2, "p1", KUNANOMI, 1)
    put(s2, "p1", AWAKEN, 1)
    fireTrigger(s2, "p1", k2, "onAttack")
    assert(bpBuffOf(s2, k2) === 2000, "覚醒持ちがいればBP+2000")
}

console.log("=== 3. levelAs.ownSpiritMatches{combined}（ブラッキオ） ===")
{
    const s = game("bura-no")
    const b = put(s, "p1", BURACCHIO, 1)
    put(s, "p1", PLAIN_RED, 1)
    assert(currentLevel(b).level === 1, "合体スピリットがいなければLv1のまま")
    const s2 = game("bura-yes")
    const b2 = put(s2, "p1", BURACCHIO, 1)
    const host = put(s2, "p1", PLAIN_RED, 1)
    host.braveRefs = [{ slot: "single", instanceId: "smoke711-brave" }]
    refreshLevelAsOverrides(s2)
    assert(currentLevel(b2).level === 3, "合体スピリットがいればLv3として扱う")
}

console.log("=== 4. triggered.ownSpiritMatches{combined}（キャンサード Lv2） ===")
{
    const lv2 = getCard(CANCERD).levels[1]!.cores
    const life = (s: GameState): number => s.players.p2.life
    const s = game("cancer-no")
    const c = put(s, "p1", CANCERD, lv2)
    put(s, "p1", PLAIN_RED, 1)
    const before = life(s)
    fireTrigger(s, "p1", c, "onLifeDealt")
    assert(life(s) === before, "合体スピリットがいなければライフは壊れない")
    const s2 = game("cancer-yes")
    const c2 = put(s2, "p1", CANCERD, lv2)
    const host = put(s2, "p1", PLAIN_RED, 1)
    host.braveRefs = [{ slot: "single", instanceId: "smoke711-brave" }]
    const before2 = life(s2)
    fireTrigger(s2, "p1", c2, "onLifeDealt")
    assert(life(s2) === before2 - 1, "合体スピリットがいれば相手のライフが1つ減る")
}

console.log("=== 5. triggered.battleOpponentMatches{combined}（ヴルム Lv2：発生源がアタッカーなら相手はブロッカー） ===")
{
    const lv2 = getCard(VULM).levels[1]!.cores
    for (const combined of [false, true]) {
        const s = game(`vulm-${combined}`)
        s.phase = "attack"
        const v = put(s, "p1", VULM, lv2)
        const foe = put(s, "p2", PLAIN_RED, 1)
        if (combined) foe.braveRefs = [{ slot: "single", instanceId: "smoke711-brave" }]
        s.battle = { attackerInstanceId: v.instanceId, blockerInstanceId: foe.instanceId, directed: false }
        const base = effectiveBp(s, "p1", v)
        fireTrigger(s, "p1", v, "onBattleStart", undefined, foe.instanceId)
        assert(effectiveBp(s, "p1", v) === base + (combined ? 10000 : 0), combined ? "相手が合体スピリットならBP+10000" : "相手が合体スピリットでなければBPは増えない")
    }
    // 発生源がブロッカーのときは、もう一方（アタッカー）を見る
    const s = game("vulm-blocker")
    s.turnPlayer = "p2"
    s.phase = "attack"
    const v = put(s, "p1", VULM, lv2)
    const atk = put(s, "p2", PLAIN_RED, 1)
    atk.braveRefs = [{ slot: "single", instanceId: "smoke711-brave" }]
    s.battle = { attackerInstanceId: atk.instanceId, blockerInstanceId: v.instanceId, directed: false }
    const base = effectiveBp(s, "p1", v)
    fireTrigger(s, "p1", v, "onBattleStart", undefined, atk.instanceId)
    assert(effectiveBp(s, "p1", v) === base + 10000, "発生源がブロッカーなら、合体スピリットのアタッカーを見てBP+10000")
}

console.log("=== 6. AuraCondition.battleOpponentMatches{keyword}（チェーンバイパー） ===")
{
    for (const armored of [false, true]) {
        const s = game(`viper-${armored}`)
        s.phase = "attack"
        const v = put(s, "p1", VIPER, 1)
        const foe = put(s, "p2", armored ? DURAKU : PLAIN_RED, 1)
        s.battle = { attackerInstanceId: v.instanceId, blockerInstanceId: foe.instanceId, directed: false }
        assert(effectiveBp(s, "p1", v) === getCard(VIPER).levels[0]!.bp + (armored ? 3000 : 0), armored ? "相手が【装甲】持ちならBP+3000" : "相手が【装甲】を持たなければ上がらない")
    }
}

console.log("=== 7. reviveOnDestroy.filter.color（桃幻郷） ===")
{
    const yellowId = "BS03-056"
    for (const id of [yellowId, PLAIN_RED]) {
        const s = game(`peach-${id}`)
        s.phase = "attack"
        const n = createInstance(PEACH, s.turn, getCard(PEACH).levels[1]!.cores)
        s.players.p1.field.nexuses.push(n)
        const victim = put(s, "p1", id, 1)
        refreshLevelAsOverrides(s)
        destroySpirit(s, "p1", victim.instanceId, "destroy", { battle: { attackerColors: [] } })
        while (s.pendingChoice) s.pendingChoice = null
        const alive = s.players.p1.field.spirits.some((x) => x.instanceId === victim.instanceId)
        assert(alive === (id === yellowId), id === yellowId ? "黄のスピリットはバトルで破壊されても復活する" : "黄でないスピリットは復活しない")
    }
}

console.log("すべてのチェックに合格しました 🎉（part711）")
