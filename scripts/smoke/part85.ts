// smoke パート85（召喚/配置の「置くコア」をフィールドのコアで賄う）
//
// 2026-08-01 利用者確認: **召喚時に置くコア（指定Lvぶんのコア）も、コストと同じく
// 自分のフィールドのスピリット/ネクサス上のコアから取得できる**。
// 従来は置くコアが必ずリザーブからだったため、盤面にコアが大量にあってもリザーブが空だと
// Lv2召喚ができなかった。
//
// 支払いの振り分け: paySources から取ったコアは**先にコストへ充当し、余りを置くコアへ**回す。
// コスト充当分はトラッシュへ、置くコア分は召喚/配置したカードの上へ（トラッシュを経由しない）。
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveCost,
    getCard,
    minLevelCores,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 0
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== 置くコアもフィールドのコアで賄える（リザーブ0でもLv2召喚できる） ===")
{
    const s = setup("place-from-field-test")
    // 支払い元：ロクケラトプス（バニラ・Lv3維持3）にコア12個。ここから全額を出す
    const bank = put(s, "p1", "BS01-002", 12)
    s.players.p1.hand[0] = "BS01-001" // ゴラドン（コスト0・Lv2は3コア）
    const card = getCard("BS01-001")
    const cost = effectiveCost(s, "p1", card)
    const lv2Cores = card.levels.find((l) => l.level === 2)!.cores
    const need = cost + lv2Cores
    const trashBefore = s.players.p1.trashCores

    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            level: 2,
            paySources: [{ instanceId: bank.instanceId, count: need }],
        }) === null,
        "リザーブ0でも、フィールドのコアだけでLv2召喚できる",
    )
    const summoned = s.players.p1.field.spirits.find((x) => x.cardId === "BS01-001")
    assert(summoned !== undefined, "ゴラドンが場に出た")
    assert(summoned!.cores === lv2Cores, `召喚したスピリットにLv2ぶんのコア（${lv2Cores}個）が乗っている`)
    assert(bank.cores === 12 - need, `支払い元から合計${need}個のコアが減った`)
    assert(s.players.p1.reserve === 0, "リザーブは使われていない")
    assert(
        s.players.p1.trashCores === trashBefore + cost,
        "トラッシュへ行くのはコスト分だけ（置くコア分はスピリットの上へ）",
    )
}

console.log("--- コスト分はトラッシュ、余りが置くコアへ回る（振り分けの確認） ---")
{
    const s = setup("place-split-test")
    const bank = put(s, "p1", "BS01-002", 12)
    s.players.p1.hand[0] = "BS01-053" // リーヴォルフ（コストあり）
    const card = getCard("BS01-053")
    const cost = effectiveCost(s, "p1", card)
    const maintain = minLevelCores(card)
    const need = cost + maintain
    const trashBefore = s.players.p1.trashCores

    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySources: [{ instanceId: bank.instanceId, count: need }],
        }) === null,
        "コスト+置くコアをすべてフィールドから支払える",
    )
    const summoned = s.players.p1.field.spirits.find((x) => x.cardId === "BS01-053")
    assert(summoned !== undefined && summoned.cores === maintain, "置くコアぶんが召喚したスピリットに乗る")
    assert(s.players.p1.trashCores === trashBefore + cost, `トラッシュに増えたのはコスト（${cost}個）ぶんだけ`)
    assert(bank.cores === 12 - need, "支払い元からは合計ぶん減っている")
}

console.log("--- 必要数（コスト+置くコア）を超える指定は拒否される ---")
{
    const s = setup("place-overpay-test")
    const bank = put(s, "p1", "BS01-002", 12)
    s.players.p1.hand[0] = "BS01-001"
    const card = getCard("BS01-001")
    const need = effectiveCost(s, "p1", card) + card.levels.find((l) => l.level === 2)!.cores

    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            level: 2,
            paySources: [{ instanceId: bank.instanceId, count: need + 1 }],
        }) !== null,
        "必要数+1は拒否される",
    )
    assert(bank.cores === 12, "拒否された支払いでは支払い元のコアは変化しない")
}

console.log("--- ネクサスの配置でも置くコアをフィールドから賄える ---")
{
    const s = setup("place-nexus-test")
    const bank = put(s, "p1", "BS01-002", 12)
    s.players.p1.hand[0] = "BS01-098" // 燃えさかる戦場（Lv1=0コア / Lv2=2コア）
    const card = getCard("BS01-098")
    const cost = effectiveCost(s, "p1", card)
    const lv2Cores = card.levels.find((l) => l.level === 2)!.cores
    const need = cost + lv2Cores

    assert(
        act(s, "p1", {
            type: "setNexus",
            handIndex: 0,
            level: 2,
            paySources: [{ instanceId: bank.instanceId, count: need }],
        }) === null,
        "リザーブ0でもフィールドのコアだけでLv2配置できる",
    )
    const nexus = s.players.p1.field.nexuses.find((x) => x.cardId === "BS01-098")
    assert(nexus !== undefined && nexus.cores === lv2Cores, "配置したネクサスにLv2ぶんのコアが乗っている")
    assert(s.players.p1.reserve === 0, "リザーブは使われていない")
}

console.log("--- リザーブとフィールドの併用（不足分だけリザーブから出る） ---")
{
    const s = setup("place-mixed-test")
    const bank = put(s, "p1", "BS01-002", 12)
    s.players.p1.hand[0] = "BS01-001"
    const card = getCard("BS01-001")
    const cost = effectiveCost(s, "p1", card)
    const lv2Cores = card.levels.find((l) => l.level === 2)!.cores
    const need = cost + lv2Cores
    const fromField = need - 1 // 1個だけリザーブから出させる
    s.players.p1.reserve = 5

    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            level: 2,
            paySources: [{ instanceId: bank.instanceId, count: fromField }],
        }) === null,
        "フィールドとリザーブを併用して召喚できる",
    )
    assert(s.players.p1.reserve === 4, "不足していた1個だけリザーブから減る")
    assert(bank.cores === 12 - fromField, "残りはフィールドから出ている")
}
