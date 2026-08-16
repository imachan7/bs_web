// smoke パート200（カバレッジ最後の10件を、条件を満たす盤面で働かせる）
//
// part198・199 の続き。残っていたのは条件がとくに細かいもの:
//   『相手のアタックステップ』＋コスト条件のフィールド誘発／【転召】＋カード名条件／
//   手でコアを置いたら疲労する／マジックのBP増加が増える／バトル破壊からの復活／
//   マジックが貸すブロック制限／マジックの使用そのものが弾かれる
import {
    act,
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { destroySpirit, fireFieldEventTriggers, resolveAction } from "../../server/src/logic/EffectModules"
import { instColors } from "../../shared/rules"
import { COLOR_LABELS } from "../../data/constants"
import { canBlock } from "../../shared/block"
import { loadAllCards } from "../../data/loadCards"
import type { Color, Phase } from "../../server/src/type"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    colors?: string[]
    family?: string[]
    effects?: Record<string, unknown>[]
    levels?: { cores: number; bp: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const byId = (id: string): CardRow => {
    const c = CARDS.find((x) => x.cardId === id)
    if (!c) throw new Error(`カードが見つかりません: ${id}`)
    return c
}
const coresFor = (c: CardRow, level: number): number => c.levels?.[level - 1]?.cores ?? 1
const topLevel = (c: CardRow): number => c.levels?.length ?? 1
function entryOf(card: CardRow, suffix: string): Record<string, unknown> {
    const e = (card.effects ?? []).find((x) => String(x["id"]).endsWith(`-${suffix}`))
    if (!e) throw new Error(`${card.name} に ${suffix} がありません`)
    return e
}
function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    return s
}
function put(s: GameState, pid: PlayerId, card: CardRow, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, card: CardRow, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== パート200：カバレッジ最後の10件 ===")

console.log("--- 『相手のアタックステップ』にコスト条件つきで働くフィールド誘発 ---")
// ※ BS08-065 五行寺院 は `selfMode:"source"` が**データから抜けていた**ため、
//    効果がアタックした相手側で解決されてしまい（ログ：「〈相手の駒〉：コアを置く対象がいなかった」）、
//    「自分の獣頭にコアを置く」が一度も働いていなかった（2026-08-16 にデータを修正）。
//    同じ形のゼンマイ平原は最初から持っている
for (const [id, suffix] of [["BS07-061", "e1"], ["BS08-065", "e1"]] as const) {
    const card = byId(id)
    const entry = entryOf(card, suffix)
    const level = (entry["levels"] as number[])[0]!
    const maxCost = Number((entry["costFilter"] as Record<string, unknown>)["max"])
    // アタックする側は**相手**（『相手のアタックステップ』なので）。コスト条件を満たす駒を使う
    const attackerCard = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 99) <= maxCost)!
    const s = base(`fe-${id}`)
    // 「ボイドからコアを置く」効果のために、リザーブを絞ってボイドにコアを残す
    s.players.p1.reserve = 3
    s.players.p2.reserve = 3
    s.turnPlayer = "p2"
    s.phase = (entry["phase"] as Phase | undefined) ?? "attack"
    putNexus(s, "p1", card, coresFor(card, level))
    const attacker = put(s, "p2", attackerCard, coresFor(attackerCard, 1))
    // 効果の対象になる駒（回復させる／コアを置く）を自分側に用意する
    const actFams = new Set<string>()
    const action = entry["action"] as Record<string, unknown>
    const famRaw = action["familyFilter"]
    if (typeof famRaw === "string") actFams.add(famRaw)
    else if (Array.isArray(famRaw)) for (const x of famRaw) actFams.add(String(x))
    let mine: ReturnType<typeof createInstance> | null = null
    for (const f of actFams) {
        const helper = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes(f))
        if (helper) mine = put(s, "p1", helper, coresFor(helper, topLevel(helper)))
    }
    if (!mine) {
        const vanilla = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!
        mine = put(s, "p1", vanilla, coresFor(vanilla, 1))
    }
    mine.isRested = true
    const coresBefore = mine.cores
    refreshLevelAsOverrides(s)

    // 対象は渡さない（渡すと「明示ターゲット」扱いになり、自分側を対象にする効果が相手を見てしまう）。
    // **コスト条件は eventInfo.costs を見る**ので、アタックした側のコストを渡す必要がある
    fireFieldEventTriggers(
        s,
        "p1",
        entry["event"] as never,
        { pid: "p2", inst: attacker },
        undefined,
        undefined,
        undefined,
        { costs: [attackerCard.cost ?? 0] },
    )
    assert(
        !mine.isRested || mine.cores !== coresBefore,
        `${card.name} Lv${level}：相手のコスト${maxCost}以下がアタックしたときに働く`,
    )
}

console.log("--- 【転召】したスピリットの名前を見るフィールド誘発 ---")
for (const [id, suffix] of [["BS09-X35", "e2"], ["BS09-X37", "e3"]] as const) {
    const card = byId(id)
    const entry = entryOf(card, suffix)
    const names = entry["nameIncludes"] as string[]
    const subjectCard = CARDS.find((c) => c.type === "spirit" && names.some((n) => c.name.includes(n)))
    if (!subjectCard) {
        // 【転召】の条件になるカード名がまだ収録されていない（例：鉄騎皇イグドラシル）。
        // 条件を満たす盤面を作れないので、収録されるまで検証できない
        console.log(`  （${card.name}：「${names.join("/")}」が未収録のため検証できません）`)
        continue
    }
    const s = base(`tensho-${id}`)
    s.players.p1.life = 2 // 「ライフが5になるように置く」が働くように減らしておく
    const self = put(s, "p1", card, coresFor(card, topLevel(card)))
    const subject = put(s, "p1", subjectCard, coresFor(subjectCard, topLevel(subjectCard)))
    refreshLevelAsOverrides(s)
    const lifeBefore = s.players.p1.life
    const coresBefore = self.cores

    fireFieldEventTriggers(s, "p1", "ownTensho" as never, { pid: "p1", inst: subject }, undefined, subject.instanceId)
    assert(
        s.players.p1.life !== lifeBefore || self.cores !== coresBefore,
        `${card.name}：「${names.join("/")}」を含むスピリットで【転召】したときに働く`,
    )
}

console.log("--- 青のスピリットが召喚されたときのフィールド誘発 ---")
{
    const card = byId("BS09-006") // 蛇竜キング・ゴルゴー
    assert(card.name === "蛇竜キング・ゴルゴー", "前提: BS09-006 は蛇竜キング・ゴルゴー")
    const entry = entryOf(card, "e2")
    const level = (entry["levels"] as number[])[0]!
    const color = String(entry["colorFilter"])
    const filter = (entry["action"] as Record<string, unknown>)["filter"] as Record<string, unknown>
    const maxBp = Number(filter["maxBp"])
    const summoned = CARDS.find((c) => c.type === "spirit" && (c.colors ?? []).includes(color as Color))!
    const prey = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.bp ?? 99999) <= maxBp,
    )!
    const s = base("bs09-006")
    s.phase = String(entry["phase"]) as Phase
    s.turnPlayer = "p1"
    put(s, "p1", card, coresFor(card, level))
    const subject = put(s, "p1", summoned, coresFor(summoned, 1))
    const target = put(s, "p2", prey, coresFor(prey, 1))
    refreshLevelAsOverrides(s)

    // **色条件は eventColors を見る**ので、召喚されたスピリットの色を渡す
    fireFieldEventTriggers(s, "p1", "ownSpiritSummoned" as never, { pid: "p1", inst: subject }, instColors(subject))
    while (s.pendingChoice) {
        const pc = s.pendingChoice
        s.pendingChoice = null
        if (pc.action.type === "noop") break
    }
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === target.instanceId),
        `${card.name} Lv${level}：${color}のスピリットが召喚されたとき、BP${maxBp}以下の相手を破壊する`,
    )
}

console.log("--- 手でコアを置いたスピリットが疲労する ---")
{
    const card = byId("BS06-078") // 魔帝の寝所
    assert(card.name === "魔帝の寝所", "前提: BS06-078 は魔帝の寝所")
    const entry = entryOf(card, "e1")
    const level = (entry["levels"] as number[])[0]!
    const vanilla = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!
    const s = base("bs06-078")
    s.phase = "main"
    putNexus(s, "p1", card, coresFor(card, level))
    const inst = put(s, "p1", vanilla, coresFor(vanilla, 1))
    refreshLevelAsOverrides(s)
    assert(!inst.isRested, "前提: 置く前は回復状態")
    assert(act(s, "p1", { type: "moveCore", instanceId: inst.instanceId, direction: "add" }) === null, "手でコアを1個置く")
    assert(inst.isRested, `${card.name} Lv${level}：手でコアを置いたスピリットは疲労する`)
}

console.log("--- マジックのBP増加が上乗せされる ---")
{
    const card = byId("BS06-085") // 混迷する魔法実験場
    assert(card.name === "混迷する魔法実験場", "前提: BS06-085 は混迷する魔法実験場")
    const entry = entryOf(card, "e1")
    const level = (entry["levels"] as number[])[0]!
    const bonus = Number(entry["amountBonus"])
    // 「このターンの間、スピリット1体をBP+N」のマジック
    const buffMagic = CARDS.find(
        (c) =>
            c.type === "magic" &&
            (c.effects ?? []).some(
                (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "bpBuff",
            ),
    )!
    const vanilla = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!

    const withoutBonus = base("bs06-085-without")
    const t1 = put(withoutBonus, "p1", vanilla, coresFor(vanilla, 1))
    refreshLevelAsOverrides(withoutBonus)
    resolveAction(withoutBonus, "p1", null, { type: "bpBuff", amount: 1000 }, t1.instanceId, undefined, "magic")
    const plain = t1.tempBpBuff

    const withBonus = base("bs06-085-with")
    putNexus(withBonus, "p1", card, coresFor(card, level))
    const t2 = put(withBonus, "p1", vanilla, coresFor(vanilla, 1))
    refreshLevelAsOverrides(withBonus)
    resolveAction(withBonus, "p1", null, { type: "bpBuff", amount: 1000 }, t2.instanceId, undefined, "magic")

    assert(
        t2.tempBpBuff === plain + bonus,
        `${card.name} Lv${level}：マジックのBP増加が+${bonus}上乗せされる（${plain}→${t2.tempBpBuff}）`,
    )
}

console.log("--- マジックの使用そのものが弾かれる ---")
{
    // 青嵐の虚空Lv2：【転召】を持つ自分のスピリットがいるとき、コスト4以下のマジックは使用できない
    const card = byId("BS05-065")
    const entry = entryOf(card, "e2")
    const level = (entry["levels"] as number[])[0]!
    const maxCost = Number(entry["maxCost"])
    const needKw = String(entry["requireOwnKeyword"])
    const magic = CARDS.find((c) => c.type === "magic" && (c.cost ?? 99) <= maxCost)!
    const tensho = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === needKw),
    )!
    const s = base("bs05-065-cast")
    s.phase = String(entry["phase"]) as Phase
    putNexus(s, "p1", card, coresFor(card, level))
    put(s, "p1", tensho, coresFor(tensho, 1))
    refreshLevelAsOverrides(s)
    s.players.p1.hand[0] = magic.cardId
    // **実際に使おうとして弾かれる**ことを見る（判定関数を呼ぶだけでは使用の入口を通らない）
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0 }) !== null,
        `${card.name} Lv${level}：【${needKw}】持ちがいる間はコスト${maxCost}以下のマジックを使用できない`,
    )
}

console.log("--- バトルで破壊されたスピリットが復活する ---")
{
    // 夢中漂う桃幻郷Lv2：『自分のアタックステップ』相手のフィールドのシンボルが1色以下のとき、
    // バトルで破壊された自分の黄のスピリットは疲労状態で復活する
    const card = byId("BS06-087")
    assert(card.name === "夢中漂う桃幻郷", "前提: BS06-087 は夢中漂う桃幻郷")
    const entry = entryOf(card, "e2")
    const level = (entry["levels"] as number[])[0]!
    const color = String(entry["colorFilter"])
    const yellow = CARDS.find(
        (c) => c.type === "spirit" && (c.colors ?? []).includes(color as Color) && (c.effects ?? []).length === 0,
    ) ?? CARDS.find((c) => c.type === "spirit" && (c.colors ?? []).includes(color as Color))!
    const s = base("bs06-087")
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", card, coresFor(card, level))
    const victim = put(s, "p1", yellow, coresFor(yellow, 1))
    // 相手のフィールドのシンボルは1色以下にする（条件）＝何も置かない
    refreshLevelAsOverrides(s)

    // バトルによる破壊（when.byBattle の条件）
    destroySpirit(s, "p1", victim.instanceId, "destroy", { battle: { attackerColors: [] } })
    while (s.pendingChoice) {
        const pc = s.pendingChoice
        s.pendingChoice = null
        if (pc.action.type === "noop") break
    }
    assert(
        s.players.p1.field.spirits.some((x) => getCard(x.cardId).name === yellow.name),
        `${card.name} Lv${level}：バトルで破壊された自分の${color}のスピリットが復活する`,
    )
}

console.log("--- マジックが色を指定して貸すブロック制限 ---")
{
    // サマーソルトターン：色を1色指定し、系統「楽族」の自分のスピリットは
    // その色の相手のスピリットからブロックされない
    const card = byId("BS09-081")
    assert(card.name === "サマーソルトターン", "前提: BS09-081 はサマーソルトターン")
    const entry = entryOf(card, "e2")
    const fam = String(entry["familyFilter"])
    const attackerCard = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes(fam))!
    // 指定する色と、その色を持つブロック役／持たないブロック役
    const chosen: Color = "red"
    const same = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.colors ?? []).includes(chosen))!
    const other = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0 && !(c.colors ?? []).includes(chosen))!

    const s = base("bs09-081")
    const attacker = put(s, "p1", attackerCard, coresFor(attackerCard, topLevel(attackerCard)))
    const sameInst = put(s, "p2", same, coresFor(same, 1))
    const otherInst = put(s, "p2", other, coresFor(other, 1))
    refreshLevelAsOverrides(s)
    s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    assert(canBlock(s, "p2", sameInst, "p1", attacker) === null, "前提: マジックを使う前は同じ色でもブロックできる")

    // 色を選んで、このターンの間だけ効果を貸す
    // 色は**表示ラベル**（日本語）で渡し、発生源は action の sourceCardId で指定する
    resolveAction(
        s,
        "p1",
        null,
        { type: "colorChoiceLendThisTurn", sourceCardId: card.cardId },
        undefined,
        (card.colors ?? ["green"]) as Color[],
        "magic",
        COLOR_LABELS[chosen],
        undefined,
        card.cardId,
    )
    refreshLevelAsOverrides(s)

    assert(
        canBlock(s, "p2", sameInst, "p1", attacker) !== null,
        `${card.name}：指定した色（${chosen}）の相手からはブロックされない`,
    )
    assert(
        canBlock(s, "p2", otherInst, "p1", attacker) === null,
        `${card.name}：指定していない色なら通常どおりブロックできる`,
    )
}
