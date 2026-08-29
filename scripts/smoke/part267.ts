// smoke パート267（分離のコアの分け直し。BRAVE.md §12.5 の 2026-08-29 改定）
//
// 改定前は「効果による分離にコアは要らない」＝ホストにコアを全部残し、ブレイヴは0コアで場に出ていた。
// BS11-015 冥王神獣インフェルド・ハデス「相手の合体スピリット1体を分離させる。ただし、分離するときの
// コアの移動は相手が行う」を受けて、**合体スピリット上のコアをホストとブレイヴに分け直す**形に改めた。
//
// 変えた機構:
//   - detachBraveByEffect（server/src/logic/removal.ts）に coresToBrave を足した。総数は変わらず、
//     分けた結果 Lv1維持コアを下回った側は消滅する（cause:"deplete"＝復活判定に入らない）
//   - autoDetachCoresToBrave：非対話（テスト・AI）の既定値。ブレイヴの維持ぶんだけ渡し、
//     渡すとホストが維持できなくなるなら渡さない
//   - action:"detachBrave" の splitHostInstanceId（内部専用）：対話時は増減式（stepper）で
//     「ブレイヴに載せるコアの数」を持ち主に選ばせてから分離する
//
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして機械検証してから使う。
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave, detachBraveByEffect } from "../../server/src/logic/EffectModules"
import { matchesBraveCondition } from "../../shared/rules"

function base(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

// 合体条件を持つブレイヴと、それを満たすホストを実データから探す（part263 と同じ手法）
const braveCard = ALL_CARDS.find((c) => {
    if (c.type !== "brave") return false
    const cond = c.braveCondition
    const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
    return terms.length > 0 && c.levels.length > 0 && c.levels[0]!.cores > 0
})
assert(braveCard !== undefined, "テスト前提：合体条件を持ち、Lv1維持コアが1個以上のブレイヴがある")
const braveId = braveCard!.cardId
const BRAVE_KEEP = braveCard!.levels[0]!.cores

function findHost(): string {
    for (const c of ALL_CARDS) {
        if (c.type !== "spirit" || c.levels.length === 0) continue
        const probe = createInstance(c.cardId, 3, c.levels[0]!.cores)
        const s = base("host-probe", false)
        s.players.p1.field.spirits = [probe]
        refreshLevelAsOverrides(s)
        if (matchesBraveCondition(s, "p1", probe, braveId)) return c.cardId
    }
    throw new Error("合体条件を満たすホストが見つからない")
}
const hostCardId = findHost()
const HOST_KEEP = getCard(hostCardId).levels[0]!.cores

console.log("=== テスト前提の機械確認 ===")
{
    assert(getCard(braveId).type === "brave", `${braveId} はブレイヴ`)
    assert(BRAVE_KEEP >= 1, "ブレイヴのLv1維持コアは1個以上（0個だと分け直しの検査にならない）")
    assert(HOST_KEEP >= 1, "ホストのLv1維持コアは1個以上")
}

// ホスト上に cores 個のコアを載せた合体状態を作る
function combined(s: GameState, pid: PlayerId, cores: number): { host: ReturnType<typeof createInstance>; brave: ReturnType<typeof createInstance> } {
    const host = createInstance(hostCardId, s.turn, cores)
    const brave = createInstance(braveId, s.turn, 0)
    s.players[pid].field.spirits.push(host)
    attachBrave(s, pid, host, brave)
    return { host, brave }
}

console.log("=== 非対話：ブレイヴの維持ぶんだけ移り、コアの総数は変わらない ===")
{
    const s = base("split-auto", false)
    const total = HOST_KEEP + BRAVE_KEEP
    const { host, brave } = combined(s, "p1", total)
    detachBraveByEffect(s, "p1", host, brave)
    assert(brave.cores === BRAVE_KEEP, "ブレイヴにはLv1維持ぶんが移る")
    assert(host.cores === HOST_KEEP, "移したぶんだけホストが減る")
    assert(host.cores + brave.cores === total, "コアの総数は変わらない（ボイド・リザーブへ漏れない）")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "ブレイヴはスピリット状態で場に残る")
}

console.log("=== 非対話：ホストのぶんしかなければ渡さず、ブレイヴが維持コア割れで消滅する ===")
{
    const s = base("split-auto-tight", false)
    const { host, brave } = combined(s, "p1", HOST_KEEP)
    detachBraveByEffect(s, "p1", host, brave)
    assert(host.cores === HOST_KEEP, "ホストは維持できるので残る")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "ブレイヴは維持コア割れで場から消える")
    assert(s.players.p1.trashCards.includes(braveId), "消えたブレイヴはトラッシュへ行く")
}

console.log("=== 対話：分け方は合体スピリットの持ち主が増減式で選ぶ ===")
{
    const s = base("split-interactive", true)
    const total = HOST_KEEP + BRAVE_KEEP + 2
    const { host, brave } = combined(s, "p1", total)
    const src = createInstance(hostCardId, s.turn, HOST_KEEP)
    resolveAction(s, "p1", src, { type: "detachBrave" })

    assert(s.pendingChoice?.kind === "option", "コアの分け方の選択待ちになる")
    assert(s.pendingChoice?.stepper === true, "増減式（0〜ホスト上のコア数）で選ばせる")
    assert(s.pendingChoice?.pid === "p1", "選ぶのは合体スピリットの持ち主")
    assert((s.pendingChoice?.options ?? []).length === total + 1, "0個から全部までを選べる")

    assert(act(s, "p1", { type: "resolveChoice", option: String(BRAVE_KEEP + 1) }) === null, "分けるコア数を選べる")
    assert(brave.cores === BRAVE_KEEP + 1, "選んだ数だけブレイヴに移る（自動の既定値より多く渡せる）")
    assert(host.cores === total - (BRAVE_KEEP + 1), "残りはホストに残る")
    assert(s.pendingChoice === null, "選び終われば選択待ちは残らない")
}

console.log("=== 対話：全部ブレイヴに渡すと、ホストが維持コア割れで消滅する ===")
{
    const s = base("split-give-all", true)
    const total = HOST_KEEP + BRAVE_KEEP
    const { host, brave } = combined(s, "p1", total)
    const src = createInstance(hostCardId, s.turn, HOST_KEEP)
    resolveAction(s, "p1", src, { type: "detachBrave" })

    assert(act(s, "p1", { type: "resolveChoice", option: String(total) }) === null, "全部をブレイヴに渡せる")
    assert(brave.cores === total, "ブレイヴにコアが全部移る")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === host.instanceId), "ホストは維持コア割れで場から消える")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "ブレイヴの方は場に残る")
}

console.log("=== 対話：0個を選べば、ブレイヴだけが消える（渡さない選択も取れる） ===")
{
    const s = base("split-give-zero", true)
    const total = HOST_KEEP + BRAVE_KEEP
    const { host, brave } = combined(s, "p1", total)
    const src = createInstance(hostCardId, s.turn, HOST_KEEP)
    resolveAction(s, "p1", src, { type: "detachBrave" })

    assert(act(s, "p1", { type: "resolveChoice", option: "0" }) === null, "0個を選べる")
    assert(host.cores === total, "ホストがコアを全部持ったまま残る")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "ブレイヴは維持コア割れで消える")
}
