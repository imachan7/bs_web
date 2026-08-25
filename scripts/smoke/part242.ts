// smoke パート242（BS10 のブレイヴを**実際のバトルで**動かす。part241 の続き）
//
// coverage:effects が「場に出ているのに一度も適用されていない」と報告した残り11件のうち、
// keyword経由のもの（armor/clash/kyoshu/bofu-e1/seimei-e1）を除いた6件を潰す。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, declareBlock, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { effectSources } from "../../shared/rules"
import { effectiveCost } from "../../shared/cost"

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
    act(s, "p1", { type: "endTurn" })
    act(s, "p2", { type: "endTurn" })
    return s
}
function hostCardFor(braveCardId: string) {
    const cond = getCard(braveCardId).braveCondition
    const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
    const t = terms[0]!
    // cantBlock 持ちはホストに選ばない（§K セイバーシャークのブロックテストが壊れるため）
    const found = ALL_CARDS.find(
        (c) =>
            c.type === "spirit" &&
            c.levels.length > 0 &&
            !c.effects.some((e) => e.kind === "constraint" && e.constraint.type === "cantBlock") &&
            (t.vanilla === true ? c.effect === "" : c.cost >= (t.minCost ?? 0)),
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
    s.players[pid].hand = [b.cardId]
    assert(act(s, pid, { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null,
        `${braveName} を合体召喚`)
    return { host, hostCard: hc }
}
function weakEnemy(s: GameState, side: PlayerId, cores = 1) {
    const card = ALL_CARDS.reduce((min, c) =>
        c.type === "spirit" && c.levels.length > 0 && c.effect === "" && c.levels[0]!.bp < (min?.levels[0]!.bp ?? Infinity) ? c : min,
        undefined as (typeof ALL_CARDS)[number] | undefined)!
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[side].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== §I ギョクリューン：【合体時】相手はマジックの効果を使用するとき2コスト余分に支払う ===")
{
    const s = game("bs10-gyoku")
    combine(s, "p1", "ギョクリューン")
    const magicCard = ALL_CARDS.find((c) => c.type === "magic")!
    const cost = effectiveCost(s, "p2", magicCard)
    assert(cost === magicCard.cost + 2, `相手のマジックコストが+2になる（本来${magicCard.cost}→実効${cost}）`)
}

console.log("=== §J きぐるみクマッター：【合体時】バトル時に相手ネクサスを疲労、疲労ネクサスの効果は発揮されない ===")
{
    const s = game("bs10-kumatta")
    const { host } = combine(s, "p1", "きぐるみクマッター")
    const nexusCard = ALL_CARDS.find((c) => c.type === "nexus")!
    const nexus = createInstance(nexusCard.cardId, s.turn, nexusCard.levels[0]!.cores)
    s.players.p2.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    assert(!nexus.isRested, "配置直後のネクサスは回復状態")
    assert(effectSources(s, "p2").some((i) => i.instanceId === nexus.instanceId),
        "回復状態のネクサスはeffectSourcesに含まれる")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    assert(nexus.isRested, "バトル時に相手ネクサスが疲労する")
    assert(!effectSources(s, "p2").some((i) => i.instanceId === nexus.instanceId),
        "疲労状態のネクサスの効果は発揮されない（effectSourcesから除外される）")
}

console.log("=== §K セイバーシャーク：【合体時】ブロック時にBPを比べ相手のスピリットだけを破壊したとき、相手のライフのコアをリザーブへ ===")
{
    const s = game("bs10-saber")
    const { host } = combine(s, "p1", "セイバーシャーク")
    const attacker = weakEnemy(s, "p2")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1のターンを終了")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2のアタックステップへ")
    // コアステップを通過した後で基準値を取る（p2のターン開始時のコア置きを差分に混ぜない）
    const lifeBefore = s.players.p2.life
    const reserveBefore = s.players.p2.reserve
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2がアタック")
    act(s, "p1", { type: "pass" })
    assert(declareBlock(s, "p1", host.instanceId) === null, "p1がブロック")
    act(s, "p1", { type: "pass" })
    act(s, "p2", { type: "pass" })
    // +2の内訳：破壊された相手のコア1個（通常のリザーブ還元）＋lifeCrushでライフから移した1個
    assert(s.players.p2.life === lifeBefore - 1, `相手のライフのコア1個が減る（${lifeBefore}→${s.players.p2.life}）`)
    assert(s.players.p2.reserve === reserveBefore + 2, `相手のリザーブが2増える（破壊分1＋lifeCrush分1。${reserveBefore}→${s.players.p2.reserve}）`)
}

console.log("=== §L エンジェドール：【合体時】合体アタック時、バトル解決時にBPのかわりにLvを比べる ===")
{
    const s = game("bs10-angel")
    // host を Lv2（cores=lv2.cores）にする。合体条件がvanillaの最初のバニラをホストに使う
    const hostCardData = hostCardFor(byName("エンジェドール").cardId)
    const hostLv2 = hostCardData.levels.find((l) => l.level === 2)
    assert(hostLv2 !== undefined, "テスト前提: ホスト候補がLv2を持つ")
    const { host } = combine(s, "p1", "エンジェドール", hostLv2!.cores)
    const hostBp = hostLv2!.bp
    // Lv1でBPがhostより高いバニラを相手に置く：BP比較なら相手が勝つが、Lv比較なら
    // 「Lvの低い方（相手＝Lv1）」が破壊されるはずなので、逆転すればLv比較が効いている証拠になる
    const candidate = ALL_CARDS.find((c) => c.type === "spirit" && c.effect === "" && c.levels[0]!.bp > hostBp)
    assert(candidate !== undefined, `テスト前提: Lv1でBP${hostBp}超のバニラスピリットが見つかる`)
    const enemy = createInstance(candidate!.cardId, s.turn, candidate!.levels[0]!.cores)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    act(s, "p2", { type: "pass" })
    assert(declareBlock(s, "p2", enemy.instanceId) === null, "相手がブロック")
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === enemy.instanceId),
        "Lv比較でLvの低い相手（Lv1）が破壊される（BP比較なら逆に相手が勝つはずの組み合わせ）")
}
