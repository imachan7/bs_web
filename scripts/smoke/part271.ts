// smoke パート271（BS11 で足した軸 その1）
//
// docs/design/BS11_PLAN.md §2.3 A のうち、この回で足したもの:
//   - destroy.drawPerDestroyed：**実際に破壊できた**1体につき1枚ドローする（BS11-006 獅龍皇子レオグルス）
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, destroyNexus, destroySpirit, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { noSummonTriggerByCost } from "../../shared/rules"

const byName = (n: string) => {
    const c = ALL_CARDS.find((x) => x.name === n)
    assert(c !== undefined, `テスト前提: ${n} がカードデータにいる`)
    return c!
}
const leo = byName("獅龍皇子レオグルス")
const summonEffect = leo.effects.find((e) => e.kind === "triggered" && e.trigger === "onSummon")
assert(summonEffect !== undefined && "action" in summonEffect, "テスト前提: レオグルスは『召喚時』効果を持つ")
const action = (summonEffect as { action: Parameters<typeof resolveAction>[3] }).action
assert(
    (action as { drawPerDestroyed?: true }).drawPerDestroyed === true,
    "テスト前提: 『破壊したときドロー』が drawPerDestroyed で書かれている",
)
// BP5000以下の相手（破壊される側）と、BP5000より大きい相手（破壊されない側）をデータから引く
const lowBp = ALL_CARDS.find((c) => c.type === "spirit" && (c.levels[0]?.bp ?? 0) <= 5000 && c.effects.length === 0)
const highBp = ALL_CARDS.find((c) => c.type === "spirit" && (c.levels[0]?.bp ?? 0) > 5000 && c.effects.length === 0)
assert(lowBp !== undefined && highBp !== undefined, "テスト前提: BP5000以下と5000超のバニラがいる")

function game(): GameState {
    const s = createGame("bs11-axis-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== §A 破壊できたときだけ1枚ドローする ===")
{
    const s = game()
    const self = put(s, "p1", leo.cardId, 2)
    put(s, "p2", lowBp!.cardId, 1)
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", self, action)
    assert(s.players.p2.field.spirits.length === 0, "BP5000以下の相手が破壊される")
    assert(s.players.p1.hand.length === handBefore + 1, "破壊できたので1枚引く")
}

console.log("=== §B 破壊できなければ引かない ===")
{
    const s = game()
    const self = put(s, "p1", leo.cardId, 2)
    put(s, "p2", highBp!.cardId, 1) // BP5000より大きいので対象外
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", self, action)
    assert(s.players.p2.field.spirits.length === 1, "対象外なので破壊されない")
    assert(s.players.p1.hand.length === handBefore, "破壊できなかったので引かない")
}

console.log("=== §C 相手がいなければ引かない ===")
{
    const s = game()
    const self = put(s, "p1", leo.cardId, 2)
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", self, action)
    assert(s.players.p1.hand.length === handBefore, "対象がいなければ引かない")
}

console.log("=== §D バスターハンマー：色を指定して、その色のネクサスすべてを破壊する ===")
{
    const hammer = byName("バスターハンマー")
    const e = hammer.effects.find((x) => x.kind === "magic")
    assert(e !== undefined && "action" in e, "テスト前提: バスターハンマーはマジック効果を持つ")
    const hammerAction = (e as { action: Parameters<typeof resolveAction>[3] }).action
    const nexusOf = (color: string) => {
        const c = ALL_CARDS.find((x) => x.type === "nexus" && x.colors.length === 1 && x.colors[0] === color)
        assert(c !== undefined, `テスト前提: ${color}の単色ネクサスがいる`)
        return c!.cardId
    }

    // 対話：色を選ばせ、選んだ色だけが両陣営から破壊される
    const s = game()
    s.interactiveTargets = true
    const putNexus = (pid: PlayerId, cardId: string) => {
        const inst = createInstance(cardId, s.turn, 1)
        s.players[pid].field.nexuses.push(inst)
        return inst
    }
    putNexus("p1", nexusOf("red"))
    putNexus("p2", nexusOf("red"))
    putNexus("p2", nexusOf("blue"))
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", null, hammerAction)
    assert(s.pendingChoice?.kind === "option", "色の選択待ちが立つ")
    assert((s.pendingChoice?.options ?? []).length === 6, "6色から選ぶ")
    assert(act(s, "p1", { type: "resolveChoice", option: "red" }) === null, "赤を指定する")
    assert(s.players.p1.field.nexuses.length === 0, "自分の赤ネクサスも破壊される（指定した色すべて）")
    assert(s.players.p2.field.nexuses.length === 1, "相手は赤だけ破壊され、青は残る")
    assert(s.players.p1.hand.length === handBefore + 2, "破壊できた2つぶん引く")
}

console.log("=== §E ダンデラビット：「このスピリット以外の」でコアを置く先から自分を外す ===")
{
    const dande = byName("ダンデラビット")
    const e2 = dande.effects.find((x) => "action" in x && (x as { action: { type: string } }).action.type === "voidCoreToTarget")
    assert(e2 !== undefined, "テスト前提: ダンデラビットは voidCoreToTarget を持つ")
    const action2 = (e2 as { action: Parameters<typeof resolveAction>[3] }).action
    // 系統「星魂」を持つスピリットをデータから引く
    const seikon = ALL_CARDS.filter((c) => c.type === "spirit" && c.family.includes("星魂"))
    assert(seikon.length >= 1, "テスト前提: 系統「星魂」のスピリットがいる")

    const s = game()
    const self = put(s, "p1", dande.cardId, 1)
    assert(dande.family.includes("星魂"), "テスト前提: ダンデラビット自身も「星魂」を持つ（＝除外が効くか見える）")
    const other = put(s, "p1", seikon.find((c) => c.cardId !== dande.cardId)!.cardId, 1)
    const selfCores = self.cores
    resolveAction(s, "p1", self, action2)
    assert(other.cores === 2, "自分以外の「星魂」にコアが置かれる")
    assert(self.cores === selfCores, "発生源自身には置かれない")
}

console.log("=== §F リブートコード：回復しても、合体スピリットだけはアタックできる ===")
{
    const reboot = byName("リブートコード")
    const e = reboot.effects.find((x) => x.kind === "magic")
    assert(e !== undefined && "action" in e, "テスト前提: リブートコードはマジック効果を持つ")
    const rebootAction = (e as { action: Parameters<typeof resolveAction>[3] }).action

    const s = game()
    const host = put(s, "p1", ALL_CARDS.find((c) => c.type === "spirit")!.cardId, 3)
    const plain = put(s, "p1", ALL_CARDS.find((c) => c.type === "spirit")!.cardId, 3)
    // ホストにブレイヴを合体させる（合体中のブレイヴは field.combinedBraves に置き、braveRefs で参照する）
    const brave = ALL_CARDS.find((c) => c.type === "brave")
    assert(brave !== undefined, "テスト前提: ブレイヴカードがいる")
    const braveInst = createInstance(brave!.cardId, s.turn, 0)
    s.players.p1.field.combinedBraves.push(braveInst)
    host.braveRefs = [{ slot: "single", instanceId: braveInst.instanceId }]
    host.isRested = true
    plain.isRested = true
    resolveAction(s, "p1", null, rebootAction)
    assert(!host.isRested && !plain.isRested, "疲労していた自分のスピリットはすべて回復する")
    assert(plain.cantAttackThisTurn === true, "合体していないスピリットはこのターンアタックできない")
    assert(host.cantAttackThisTurn !== true, "合体スピリットはアタックできる")
}

console.log("=== §G 発見されし世界樹：『自分の緑のネクサスが破壊されたとき』の色の絞り込みが効く ===")
{
    // ⚠️ ownNexusDestroyed の誘発は、破壊されたネクサスの色が渡っておらず
    // **colorFilter が常に外れていた**（2026-09-02 に配線した）。ここはその回帰テスト。
    const tree = byName("発見されし世界樹")
    const e = tree.effects.find((x) => x.kind === "fieldEvent")
    assert(e !== undefined && (e as { colorFilter?: string }).colorFilter === "green", "テスト前提: 緑に絞る誘発を持つ")
    const nexusOf = (color: string) => {
        const c = ALL_CARDS.find((x) => x.type === "nexus" && x.colors.length === 1 && x.colors[0] === color && x.cardId !== tree.cardId)
        assert(c !== undefined, `テスト前提: ${color}の単色ネクサスがいる`)
        return c!.cardId
    }
    const setup = (destroyedColor: string) => {
        const s = game()
        const src = createInstance(tree.cardId, s.turn, 3) // 支払い用のコアを載せておく
        s.players.p1.field.nexuses.push(src)
        const victim = createInstance(nexusOf(destroyedColor), s.turn, 1)
        s.players.p1.field.nexuses.push(victim)
        return { s, src, victim }
    }
    // 緑のネクサスが破壊された → 戻る（コア1個を払う）
    const g = setup("green")
    destroyNexus(g.s, "p1", g.victim.instanceId)
    assert(g.s.players.p1.field.nexuses.some((n) => n.cardId === g.victim.cardId), "緑なら破壊されたネクサスが戻る")
    assert(g.src.cores === 2, "戻すコストとして自身のコア1個がトラッシュへ")

    // 緑以外が破壊された → 戻らない（色の絞り込みが効いている）
    const r = setup("red")
    destroyNexus(r.s, "p1", r.victim.instanceId)
    assert(!r.s.players.p1.field.nexuses.some((n) => n.cardId === r.victim.cardId), "緑以外は戻らない")
    assert(r.src.cores === 3, "払われていない")
}

console.log("=== §H 黄金の鐘楼：自分のネクサスがすべて黄の間だけ、ネクサスが破壊されない ===")
{
    const bell = byName("黄金の鐘楼")
    const nexusOf = (color: string) => {
        const c = ALL_CARDS.find((x) => x.type === "nexus" && x.colors.length === 1 && x.colors[0] === color && x.cardId !== bell.cardId)
        assert(c !== undefined, `テスト前提: ${color}の単色ネクサスがいる`)
        return c!.cardId
    }
    assert(bell.colors.length === 1 && bell.colors[0] === "yellow", "テスト前提: 黄金の鐘楼は黄の単色")
    const setup = (otherColor: string) => {
        const s = game()
        s.turnPlayer = "p2" // 『相手のターン』限定なので、相手のターンにする
        const src = createInstance(bell.cardId, s.turn, 2) // Lv1
        s.players.p1.field.nexuses.push(src)
        const other = createInstance(nexusOf(otherColor), s.turn, 1)
        s.players.p1.field.nexuses.push(other)
        return { s, other }
    }
    // すべて黄 → 守られる
    const y = setup("yellow")
    destroyNexus(y.s, "p1", y.other.instanceId, { sourcePid: "p2", sourceType: "spirit" })
    assert(y.s.players.p1.field.nexuses.length === 2, "自分のネクサスがすべて黄なら破壊されない")
    // 黄以外が混ざる → 守られない
    const b = setup("blue")
    destroyNexus(b.s, "p1", b.other.instanceId, { sourcePid: "p2", sourceType: "spirit" })
    assert(b.s.players.p1.field.nexuses.length === 1, "黄以外が混ざっていれば破壊される")
}

console.log("=== §I 黄金の鐘楼Lv2：【聖命】を持つ自分のスピリットが破壊されたときだけライフに置く ===")
{
    const bell = byName("黄金の鐘楼")
    const seimei = ALL_CARDS.find((c) => c.type === "spirit" && c.effects.some((e) => e.kind === "keyword" && e.keyword === "seimei"))
    const plain = ALL_CARDS.find((c) => c.type === "spirit" && c.effects.length === 0)
    assert(seimei !== undefined && plain !== undefined, "テスト前提: 【聖命】持ちとバニラがいる")
    const setup = (cardId: string) => {
        const s = game()
        s.phase = "attack"
        const src = createInstance(bell.cardId, s.turn, 6) // Lv2
        s.players.p1.field.nexuses.push(src)
        const victim = put(s, "p1", cardId, 3)
        s.players.p1.life = 3
        return { s, victim }
    }
    const a = setup(seimei!.cardId)
    destroySpirit(a.s, "p1", a.victim.instanceId, "destroy")
    assert(a.s.players.p1.life === 4, "【聖命】持ちが破壊されたらライフにコアが置かれる")
    const b = setup(plain!.cardId)
    destroySpirit(b.s, "p1", b.victim.instanceId, "destroy")
    assert(b.s.players.p1.life === 3, "【聖命】を持たないスピリットでは発火しない")
}

console.log("=== §J 未完成の古代戦艦：船尾 ===")
{
    const ship = byName("未完成の古代戦艦：船尾")
    // Lv1-2：お互い、ボイドからライフにコアを置けない
    const s = game()
    const nexus = createInstance(ship.cardId, s.turn, 1)
    s.players.p1.field.nexuses.push(nexus)
    s.players.p1.life = 3
    s.players.p2.life = 3
    resolveAction(s, "p1", null, { type: "lifeCharge", count: 1, from: "void" })
    assert(s.players.p1.life === 3, "自分もボイドからライフにコアを置けない")
    // リザーブからは置ける（止めるのはボイドからだけ）
    s.players.p1.reserve = 5
    resolveAction(s, "p1", null, { type: "lifeCharge", count: 1, from: "reserve" })
    assert(s.players.p1.life === 4, "リザーブからは置ける")

    // Lv2『相手のメインステップ』：『召喚時』効果は発揮されない
    const s2 = game()
    const nexus2 = createInstance(ship.cardId, s2.turn, 3) // Lv2
    s2.players.p1.field.nexuses.push(nexus2)
    const summoner = ALL_CARDS.find(
        (c) => c.type === "spirit" && c.effects.some((e) => e.kind === "triggered" && e.trigger === "onSummon"),
    )
    assert(summoner !== undefined, "テスト前提: 『召喚時』効果を持つスピリットがいる")
    // 相手のメインステップ（p2のターン）では止まる
    s2.turnPlayer = "p2"
    s2.phase = "main"
    assert(noSummonTriggerByCost(s2, createInstance(summoner!.cardId, s2.turn, 1)), "相手のメインステップでは『召喚時』が止まる")
    // 自分のターンでは止まらない（『相手のメインステップ』限定）
    s2.turnPlayer = "p1"
    assert(!noSummonTriggerByCost(s2, createInstance(summoner!.cardId, s2.turn, 1)), "自分のターンでは止まらない")
}

console.log("=== §K デルタバリア：ライフは0にならない（下限までは減る） ===")
{
    const barrier = byName("デルタバリア")
    const e = barrier.effects.find((x) => x.kind === "magic")
    assert(e !== undefined && "action" in e, "テスト前提: デルタバリアはマジック効果を持つ")
    const barrierAction = (e as { action: Parameters<typeof resolveAction>[3] }).action

    // 効果（スピリット/マジック）によるライフ減少は1で止まる
    const s = game()
    resolveAction(s, "p1", null, barrierAction)
    s.players.p1.life = 2
    // 相手（p2）の効果として lifeCrush を解決する＝p1のライフを2個減らそうとする
    resolveAction(s, "p2", null, { type: "lifeCrush", count: 2 }, undefined, ["red"], "spirit")
    assert(s.players.p1.life === 1, "スピリットの効果ではライフ1で止まる（0にならない）")
    assert(s.winner === null, "勝敗は決まらない")

    // 下限までは普通に減る
    const s2 = game()
    resolveAction(s2, "p1", null, barrierAction)
    s2.players.p1.life = 3
    resolveAction(s2, "p2", null, { type: "lifeCrush", count: 1 }, undefined, ["red"], "spirit")
    assert(s2.players.p1.life === 2, "下限に達するまでは普通に減る")

    // ネクサスの効果は対象外（byEffectSourceTypes に含まれない）
    const s3 = game()
    resolveAction(s3, "p1", null, barrierAction)
    s3.players.p1.life = 1
    resolveAction(s3, "p2", null, { type: "lifeCrush", count: 1 }, undefined, ["red"], "nexus")
    assert(s3.players.p1.life === 0, "ネクサスの効果では守られない（効果文どおり）")
}

console.log("すべてのチェックに合格しました 🎉（part271）")
