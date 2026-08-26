// smoke パート240（BS10 のブレイヴ10枚を実カードで通す。2026-08-25）
//
// **合成カードではなく実データ**で、合体条件・【合体時】効果・召喚時効果が動くことを見る。
// 対象は data/cards/BS10.json に入れたブレイヴ18枚すべて。
//
// ⚠️ cardId はハードコードせず、必ず名前と型をカードデータで機械検証してから使う
//    （CLAUDE.md「cardId のハードコード注意」）。
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { bravesOf, currentLevel, effectSources, effectiveBp, instIsCombined, matchesBraveCondition, spiritHasKeyword } from "../../shared/rules"
import { effectiveCost } from "../../shared/cost"
import { canBlock } from "../../shared/block"

const BRAVES = ALL_CARDS.filter((c) => c.cardId.startsWith("BS10-") && c.type === "brave")
assert(BRAVES.length === 18, `テスト前提: data/cards の BS10 ブレイヴは18枚すべて（実際 ${BRAVES.length}枚）`)

function base(): GameState {
    const s = createGame("bs10-braves", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    return s
}
// 合体条件を満たすホストをカードデータから機械的に選ぶ（ハードコードしない）
function hostFor(braveCardId: string): string {
    const cond = getCard(braveCardId).braveCondition
    const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
    const t = terms[0]!
    const found = ALL_CARDS.find(
        (c) =>
            c.type === "spirit" &&
            c.levels.length > 0 &&
            (t.vanilla === true ? c.effect === "" : c.cost >= (t.minCost ?? 0)),
    )
    assert(found !== undefined, `${braveCardId} の合体条件を満たすホストが見つかる`)
    return found!.cardId
}
function combine(s: GameState, pid: PlayerId, braveCardId: string): { host: ReturnType<typeof createInstance>; brave: ReturnType<typeof createInstance> } {
    const hostCard = getCard(hostFor(braveCardId))
    const host = createInstance(hostCard.cardId, s.turn, hostCard.levels[0]!.cores)
    s.players[pid].field.spirits.push(host)
    refreshLevelAsOverrides(s)
    assert(matchesBraveCondition(s, pid, host, braveCardId),
        `${getCard(braveCardId).name} は ${hostCard.name} に合体できる`)
    s.players[pid].hand = [braveCardId]
    assert(act(s, pid, { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null,
        `${getCard(braveCardId).name} をダイレクトブレイヴで召喚できる`)
    const brave = bravesOf(s.players[pid], host)[0]!
    return { host, brave }
}

console.log("=== §A 10枚すべて：合体条件を満たすホストへ合体でき、BPが合成される ===")
for (const b of BRAVES) {
    const s = base()
    const { host, brave } = combine(s, "p1", b.cardId)
    assert(instIsCombined(host), `${b.name}：ホストが合体状態になる`)
    assert(brave.cardId === b.cardId, `${b.name}：実体が combinedBraves にいる`)
    const hostBp = getCard(host.cardId).levels[0]!.bp
    // 召喚時効果で自分自身をBP+するブレイヴがいる（剣鎧竜バスター・ドラゴン）ので、
    // ターン限りの増減（tempBpBuff）を差し引いて「レベルBP＋合体時BP+」だけを見る
    assert(effectiveBp(s, "p1", host) - host.tempBpBuff === hostBp + b.braveLevels![0]!.bp,
        `${b.name}：合体時BP+${b.braveLevels![0]!.bp} が乗る`)
}

console.log("=== §B 【合体時】のキーワードは、合体しているときだけ持つ ===")
{
    const cases: { name: string; keyword: Parameters<typeof spiritHasKeyword>[3] }[] = [
        { name: "砲凰竜フェニック・キャノン", keyword: "clash" },
        { name: "千刀鳥カクレイン", keyword: "bofu" },
        { name: "フェンリルキャノンType-B", keyword: "armor" },
        { name: "オニユリン", keyword: "seimei" },
    ]
    for (const c of cases) {
        const card = BRAVES.find((b) => b.name === c.name)!
        assert(card !== undefined, `テスト前提: ${c.name} が BS10 のブレイヴにいる`)
        const s = base()
        // スピリット状態では持たない
        const alone = createInstance(card.cardId, s.turn, card.levels[0]!.cores)
        s.players.p1.field.spirits.push(alone)
        refreshLevelAsOverrides(s)
        assert(!spiritHasKeyword(s, "p1", alone, c.keyword),
            `${c.name}：スピリット状態では【${c.keyword}】を持たない`)
        // 合体すると持つ
        const { brave } = combine(s, "p1", card.cardId)
        assert(spiritHasKeyword(s, "p1", brave, c.keyword),
            `${c.name}：合体中は【${c.keyword}】を持つ`)
    }
}

console.log("=== §C 召喚時効果（ダイレクトブレイヴでも発揮される） ===")
{
    // 骸戦車ゲパルバート：召喚時に1枚ドロー
    const gepal = BRAVES.find((b) => b.name === "骸戦車ゲパルバート")!
    const s = base()
    const hostCard = getCard(hostFor(gepal.cardId))
    const host = createInstance(hostCard.cardId, s.turn, hostCard.levels[0]!.cores)
    s.players.p1.field.spirits.push(host)
    refreshLevelAsOverrides(s)
    s.players.p1.hand = [gepal.cardId]
    const handBefore = s.players.p1.hand.length - 1 // 召喚するカードは手札から出る
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    assert(s.players.p1.hand.length === handBefore + 1, "骸戦車ゲパルバート：召喚時に1枚ドローする")

    // 剣鎧竜バスター・ドラゴン：召喚時に自分のスピリットすべてBP+2000
    const buster = BRAVES.find((b) => b.name === "剣鎧竜バスター・ドラゴン")!
    const s2 = base()
    const hostCard2 = getCard(hostFor(buster.cardId))
    const host2 = createInstance(hostCard2.cardId, s2.turn, hostCard2.levels[0]!.cores)
    s2.players.p1.field.spirits.push(host2)
    const ally = createInstance(hostCard2.cardId, s2.turn, hostCard2.levels[0]!.cores)
    s2.players.p1.field.spirits.push(ally)
    refreshLevelAsOverrides(s2)
    const allyBefore = effectiveBp(s2, "p1", ally)
    s2.players.p1.hand = [buster.cardId]
    act(s2, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host2.instanceId })
    assert(effectiveBp(s2, "p1", ally) === allyBefore + 2000,
        "剣鎧竜バスター・ドラゴン：召喚時に味方全体がBP+2000")
}

console.log("=== §D 【合体時】の継続効果：聖鎧獣アメミードは自分のアタックステップだけ最高Lv ===")
{
    const ame = BRAVES.find((b) => b.name === "聖鎧獣アメミード")!
    const s = base()
    const { host, brave } = combine(s, "p1", ame.cardId)
    const maxLevel = getCard(brave.cardId).braveLevels!.reduce((m, l) => Math.max(m, l.level), 0)
    // メインステップでは効かない（phase:"attack" 指定のため）
    refreshLevelAsOverrides(s)
    assert(brave.levelAsContinuous === undefined, "メインステップでは最高Lv扱いにならない")
    s.phase = "attack"
    refreshLevelAsOverrides(s)
    assert(brave.levelAsContinuous === maxLevel, `自分のアタックステップでは最高Lv（Lv${maxLevel}）として扱う`)
    // 分離したら止まる
    delete host.braveRefs
    refreshLevelAsOverrides(s)
    assert(brave.levelAsContinuous === undefined, "合体していなければ効かない（【合体時】のゲート）")
}

console.log("=== §E 新しく足した器を実カードで通す ===")
{
    const byName = (n: string) => BRAVES.find((b) => b.name === n)!

    // ① 騎士王蛇ペンドラゴン：召喚時にコア2個をリザーブへ。0個になったらドロー
    {
        const pen = byName("騎士王蛇ペンドラゴン")
        const s = base()
        const hostCard = getCard(hostFor(pen.cardId))
        const host = createInstance(hostCard.cardId, s.turn, hostCard.levels[0]!.cores)
        s.players.p1.field.spirits.push(host)
        // コア2個の相手を置く（この効果でちょうど0個になる）
        const victimCard = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0 && c.levels[0]!.cores <= 2)!
        const victim = createInstance(victimCard.cardId, s.turn, 2)
        s.players.p2.field.spirits.push(victim)
        refreshLevelAsOverrides(s)
        s.players.p1.hand = [pen.cardId]
        const handBefore = s.players.p1.hand.length - 1
        act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
        assert(s.players.p1.hand.length === handBefore + 1,
            "騎士王蛇ペンドラゴン：この効果でコアが0個になったので1枚ドローする")
    }

    // ② ギョクリューン：【合体時】相手のマジック使用に+2コスト
    {
        const gyo = byName("ギョクリューン")
        const s = base()
        const magic = ALL_CARDS.find((c) => c.type === "magic")!
        // ⚠️ コストは**軽減シンボル**で下がるので、p1 と p2 の基準値は別に取る
        //    （合体でフィールドのシンボルが増えると自分側の値だけ動く）
        const { host } = combine(s, "p1", gyo.cardId)
        refreshLevelAsOverrides(s)
        const oppWith = effectiveCost(s, "p2", magic)
        const ownWith = effectiveCost(s, "p1", magic)
        delete host.braveRefs // 分離（【合体時】のゲートが外れる）
        refreshLevelAsOverrides(s)
        const oppWithout = effectiveCost(s, "p2", magic)
        const ownWithout = effectiveCost(s, "p1", magic)
        assert(oppWith === oppWithout + 2,
            `ギョクリューン：相手のマジックが+2コストになる（${oppWithout}→${oppWith}）`)
        assert(ownWith === ownWithout, "自分のマジックには効かない")
    }

    // ③ きぐるみクマッター：【合体時】疲労状態のネクサスすべての効果は発揮されない
    {
        const kuma = byName("きぐるみクマッター")
        const s = base()
        const nexusCard = ALL_CARDS.find((c) => c.type === "nexus" && c.effects.length > 0)!
        const nexus = createInstance(nexusCard.cardId, s.turn, 0)
        s.players.p2.field.nexuses.push(nexus)
        const { host } = combine(s, "p1", kuma.cardId)
        refreshLevelAsOverrides(s)
        assert(effectSources(s, "p2").some((x) => x.instanceId === nexus.instanceId),
            "回復状態のネクサスは発生源のまま")
        nexus.isRested = true
        assert(!effectSources(s, "p2").some((x) => x.instanceId === nexus.instanceId),
            "疲労状態のネクサスは効果を発揮しない")
        // 分離したら元に戻る
        delete host.braveRefs
        refreshLevelAsOverrides(s)
        assert(effectSources(s, "p2").some((x) => x.instanceId === nexus.instanceId),
            "合体していなければ疲労していても発生源のまま")
    }

    // ④ エンジェドール：召喚時、自分のスピリットすべてはLv2の相手からブロックされない
    {
        const ange = byName("エンジェドール")
        const s = base()
        const hostCard = getCard(hostFor(ange.cardId))
        const host = createInstance(hostCard.cardId, s.turn, hostCard.levels[0]!.cores)
        s.players.p1.field.spirits.push(host)
        // Lv2 になる相手ブロッカー
        const blockerCard = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length >= 2)!
        const blocker = createInstance(blockerCard.cardId, s.turn, blockerCard.levels[1]!.cores)
        s.players.p2.field.spirits.push(blocker)
        refreshLevelAsOverrides(s)
        assert(currentLevel(blocker).level === 2, "前提：ブロッカーはLv2")
        s.players.p1.hand = [ange.cardId]
        act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
        assert(canBlock(s, "p2", blocker, "p1", host) !== null,
            "エンジェドール：Lv2の相手にはブロックされない")
    }
}
