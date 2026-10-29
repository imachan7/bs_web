// smoke パート684（SD06-010 / BS15-005 / BS16-008：ライフの制限は原因を問わず効き、プレイヤーごと・スピリットごとに数える）
import {
    assert,
    createGame,
    createInstance,
    fireSummonTrigger,
    getCard,
    placeBurst,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const SHIMA = "SD06-010" // 海皇龍シーマ・クリーク（白・コスト5）
const BONGOL = "BS15-005" // 虚獣チャンプボンゴル（赤・コスト4）
const DARK = "BS16-008" // ダークナイト・ドラゴン（赤・コスト6）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SHIMA).name === "海皇龍シーマ・クリーク" && getCard(SHIMA).type === "spirit", "SHIMAはスピリット")
    assert(getCard(BONGOL).name === "虚獣チャンプボンゴル" && getCard(BONGOL).type === "spirit", "BONGOLはスピリット")
    assert(getCard(DARK).name === "ダークナイト・ドラゴン" && getCard(DARK).type === "spirit", "DARKはスピリット")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const crush = (s: GameState, pid: PlayerId, self: ReturnType<typeof createInstance>) =>
    resolveAction(s, pid, self, { type: "lifeCrush", count: 1 })

console.log("=== 1. シーマ・クリーク：同じスピリットの効果で2回目は減らない（効果どうし） ===")
{
    const s = game("case1")
    put(s, "p2", SHIMA, 3)
    const x = put(s, "p1", VANILLA, 1)
    const before = s.players.p2.life
    crush(s, "p1", x)
    assert(s.players.p2.life === before - 1, "1回目は1減る")
    crush(s, "p1", x)
    assert(s.players.p2.life === before - 1, "同じXからの2回目は減らない")
}
{
    const s = game("case1b")
    const x = put(s, "p1", VANILLA, 1)
    const before = s.players.p2.life
    crush(s, "p1", x)
    crush(s, "p1", x)
    assert(s.players.p2.life === before - 2, "対照：シーマがいなければ2減る")
}

console.log("=== 2. シーマ・クリーク：別のスピリットYの効果ならさらに減る ===")
{
    const s = game("case2")
    put(s, "p2", SHIMA, 3)
    const x = put(s, "p1", VANILLA, 1)
    const y = put(s, "p1", VANILLA, 1)
    const before = s.players.p2.life
    crush(s, "p1", x)
    crush(s, "p1", y)
    assert(s.players.p2.life === before - 2, "XのあとYで合計2減る")
}

function setupDark(seed: string, burst: boolean) {
    const s = game(seed)
    put(s, "p1", BONGOL, 1)
    if (burst) placeBurst(s, "p1", VANILLA)
    const dark = put(s, "p1", DARK, 1)
    const t1 = put(s, "p2", VANILLA, 1)
    const t2 = put(s, "p2", VANILLA, 1)
    return { s, dark, t1, t2 }
}
const alive = (s: GameState, id: string) => s.players.p2.field.spirits.some((i) => i.instanceId === id)

console.log("=== 3. チャンプボンゴル：召喚時のコストで自分のライフを払えるのは1回だけ ===")
{
    const { s, dark, t1, t2 } = setupDark("case3", true)
    const before = s.players.p1.life
    fireSummonTrigger(s, "p1", dark)
    assert(s.players.p1.life === before - 1, "1回目はライフ1を払う")
    assert(alive(s, t1.instanceId) !== alive(s, t2.instanceId), "1回目で相手が1体だけ破壊される")
    fireSummonTrigger(s, "p1", dark)
    assert(s.players.p1.life === before - 1, "2回目は払えずライフは減らない")
    assert(!alive(s, t1.instanceId) !== !alive(s, t2.instanceId) && s.players.p2.field.spirits.length === 1, "2回目は相手の2体目が破壊されない")
}
{
    const { s, dark, t1, t2 } = setupDark("case3b", false)
    const before = s.players.p1.life
    fireSummonTrigger(s, "p1", dark)
    fireSummonTrigger(s, "p1", dark)
    assert(s.players.p1.life === before - 2, "対照：バーストなしなら2回とも払える")
    assert(!alive(s, t1.instanceId) && !alive(s, t2.instanceId), "対照：相手の2体とも破壊される")
}

console.log("=== 4. チャンプボンゴル：相手のライフを減らした後でも自分のライフは払える（プレイヤーごと） ===")
{
    const { s, dark, t1 } = setupDark("case4", true)
    const mine = s.players.p1.life
    const theirs = s.players.p2.life
    crush(s, "p1", dark)
    assert(s.players.p2.life === theirs - 1, "ダークナイトが相手のライフを1減らす")
    fireSummonTrigger(s, "p1", dark)
    assert(s.players.p1.life === mine - 1, "自分のライフはコストとして1払える")
    assert(s.players.p2.life === theirs - 1, "相手のライフは追加で減らない")
    assert(!alive(s, t1.instanceId) || s.players.p2.field.spirits.length === 1, "相手が1体破壊される")
}

console.log("すべてのチェックに合格しました 🎉（part684）")
