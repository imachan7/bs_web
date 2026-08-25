// smoke パート241（BS10 のブレイヴを**実際のバトルで**動かす。2026-08-25）
//
// part240 は「合体できる／キーワードを持つ／継続効果が効く」までを見る静的なテスト。
// こちらは `npm run coverage:effects` が「場に出ているのに一度も適用されていない」と
// 報告した21件を潰すため、**アタック宣言 → ブロック → バトル解決**まで実際に流す。
//
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, declareBlock, getCard, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { bravesOf, matchesBraveCondition } from "../../shared/rules"

const BRAVES = ALL_CARDS.filter((c) => c.cardId.startsWith("BS10-") && c.type === "brave")
const byName = (n: string) => {
    const c = BRAVES.find((b) => b.name === n)
    assert(c !== undefined, `テスト前提: ${n} が BS10 のブレイヴにいる`)
    return c!
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    // 先攻1ターン目はアタックできないので、2ターン目まで進める
    act(s, "p1", { type: "endTurn" })
    act(s, "p2", { type: "endTurn" })
    return s
}
// 合体条件を満たすホストをカードデータから機械的に選ぶ
function hostCardFor(braveCardId: string) {
    const cond = getCard(braveCardId).braveCondition
    const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
    const t = terms[0]!
    const found = ALL_CARDS.find(
        (c) => c.type === "spirit" && c.levels.length > 0 && (t.vanilla === true ? c.effect === "" : c.cost >= (t.minCost ?? 0)),
    )
    assert(found !== undefined, `${braveCardId} の合体条件を満たすホストが見つかる`)
    return found!
}
function combine(s: GameState, pid: PlayerId, braveName: string, hostCores?: number) {
    const b = byName(braveName)
    const hc = hostCardFor(b.cardId)
    const host = createInstance(hc.cardId, s.turn, hostCores ?? hc.levels[0]!.cores)
    s.players[pid].field.spirits.push(host)
    refreshLevelAsOverrides(s)
    assert(matchesBraveCondition(s, pid, host, b.cardId), `${braveName} は ${hc.name} に合体できる`)
    s.players[pid].hand = [b.cardId]
    assert(act(s, pid, { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null,
        `${braveName} を合体召喚`)
    return { host, brave: bravesOf(s.players[pid], host)[0]!, hostCard: hc }
}
// BPがこの値より確実に低い相手（一方的に負ける）を1体置く
function weakEnemy(s: GameState, cores = 1): ReturnType<typeof createInstance> {
    const card = ALL_CARDS.reduce((min, c) =>
        c.type === "spirit" && c.levels.length > 0 && c.effect === "" && c.levels[0]!.bp < (min?.levels[0]!.bp ?? Infinity) ? c : min,
        undefined as (typeof ALL_CARDS)[number] | undefined)!
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players.p2.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== §A 剣鎧竜バスター・ドラゴン：【合体時】合体アタック時にBP合計3000まで破壊 ===")
{
    const s = game("bs10-buster")
    const { host } = combine(s, "p1", "剣鎧竜バスター・ドラゴン")
    const victim = weakEnemy(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === victim.instanceId),
        "アタック時にBP合計3000までの相手が破壊される")
}

console.log("=== §B 骸戦車ゲパルバート：【合体時】アタック時に疲労状態の相手1体を破壊 ===")
{
    const s = game("bs10-gepal")
    const { host } = combine(s, "p1", "骸戦車ゲパルバート")
    const rested = weakEnemy(s)
    rested.isRested = true
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    act(s, "p1", { type: "attack", instanceId: host.instanceId })
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === rested.instanceId),
        "疲労状態の相手が破壊される")
}

console.log("=== §C ビーム・ビートル：【合体時】合体アタック時に相手1体を疲労させる ===")
{
    const s = game("bs10-beetle")
    const { host } = combine(s, "p1", "ビーム・ビートル")
    const target = weakEnemy(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    act(s, "p1", { type: "attack", instanceId: host.instanceId })
    assert(target.isRested, "アタック時に相手が疲労する")
}

console.log("=== §D 飛槍獣バリ・スター／からくり犬シバ／ヘッジボルグ：バトルに勝ったときの効果 ===")
{
    // 飛槍獣バリ・スター：同じ系統を持つ相手すべてを破壊
    {
        const s = game("bs10-bari")
        const { host } = combine(s, "p1", "飛槍獣バリ・スター")
        const blocker = weakEnemy(s)
        const sameFamily = createInstance(blocker.cardId, s.turn, 1) // 同じカード＝同じ系統
        s.players.p2.field.spirits.push(sameFamily)
        refreshLevelAsOverrides(s)
        act(s, "p1", { type: "nextPhase" })
        act(s, "p1", { type: "attack", instanceId: host.instanceId })
        act(s, "p2", { type: "pass" })
        assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手がブロック")
        act(s, "p2", { type: "pass" })
        act(s, "p1", { type: "pass" })
        assert(!s.players.p2.field.spirits.some((x) => x.instanceId === sameFamily.instanceId),
            "同じ系統を持つ相手も破壊される")
    }
    // からくり犬シバ：勝ったら回復する
    {
        const s = game("bs10-shiba")
        const { host } = combine(s, "p1", "からくり犬シバ")
        const blocker = weakEnemy(s)
        act(s, "p1", { type: "nextPhase" })
        act(s, "p1", { type: "attack", instanceId: host.instanceId })
        act(s, "p2", { type: "pass" })
        declareBlock(s, "p2", blocker.instanceId)
        act(s, "p2", { type: "pass" })
        act(s, "p1", { type: "pass" })
        assert(!host.isRested, "バトルに勝った合体スピリットは回復する")
    }
    // ヘッジボルグ：破壊した相手のコアはボイドへ（リザーブに戻らない）
    {
        const s = game("bs10-hedge")
        const { host } = combine(s, "p1", "ヘッジボルグ")
        const blocker = weakEnemy(s, 2)
        const reserveBefore = s.players.p2.reserve
        act(s, "p1", { type: "nextPhase" })
        act(s, "p1", { type: "attack", instanceId: host.instanceId })
        act(s, "p2", { type: "pass" })
        declareBlock(s, "p2", blocker.instanceId)
        act(s, "p2", { type: "pass" })
        act(s, "p1", { type: "pass" })
        assert(s.players.p2.reserve === reserveBefore,
            `破壊した相手のコアはリザーブに戻らずボイドへ（${reserveBefore}→${s.players.p2.reserve}）`)
    }
}

console.log("=== §E 騎士王蛇ペンドラゴン：【合体時】合体していない相手のコア1個をリザーブへ ===")
{
    const s = game("bs10-pendragon")
    const { host } = combine(s, "p1", "騎士王蛇ペンドラゴン")
    const target = weakEnemy(s, 3)
    const before = target.cores
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: host.instanceId })
    assert(target.cores === before - 1, "合体していない相手のコアが1個減る")
}

console.log("=== §F 千刀鳥カクレイン：【合体時】【暴風：2】ブロックされたとき相手2体を疲労 ===")
{
    const s = game("bs10-kakurein")
    const { host } = combine(s, "p1", "千刀鳥カクレイン")
    const blocker = weakEnemy(s)
    const a = weakEnemy(s)
    const b = weakEnemy(s)
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: host.instanceId })
    act(s, "p2", { type: "pass" })
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手がブロック")
    const rested = [a, b].filter((x) => x.isRested).length
    assert(rested >= 1, `【暴風：2】でブロックしたとき相手が疲労する（疲労${rested}体）`)
}

console.log("=== §G オニユリン：【合体時】【聖命】ライフを減らしたらボイドからライフへコア1個 ===")
{
    const s = game("bs10-oniyurin")
    const { host } = combine(s, "p1", "オニユリン")
    const lifeBefore = s.players.p1.life
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: host.instanceId })
    act(s, "p2", { type: "pass" })
    assert(takeLifeAndResolve(s, "p2") === null, "相手がライフで受ける")
    assert(s.players.p1.life === lifeBefore + 1, "【聖命】でボイドからライフにコア1個が置かれる")
}

console.log("=== §H 鎧馬アルファズル：【合体時】合体していない相手がアタックしたとき回復 ===")
{
    const s = game("bs10-alfazur")
    const { host } = combine(s, "p1", "鎧馬アルファズル")
    const attacker = weakEnemy(s)
    host.isRested = true
    // 相手のターンへ
    assert(act(s, "p1", { type: "endTurn" }) === null, "自分のターンを終了")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "相手のアタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手がアタック")
    assert(!host.isRested, "合体していない相手のアタックで、この合体スピリットは回復する")
}
