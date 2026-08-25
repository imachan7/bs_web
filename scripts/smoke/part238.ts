// smoke パート238（ブレイヴ 段階2：合体・分離のエンジン処理。docs/design/BRAVE.md §5・§6）
//
// ブレイヴのカードはプールに1枚も無い（BS10以降が未取り込み）ので、
// **テスト用の合成カードを CARD_DB に登録して**進める（§9 の段6前提）。
// 合体条件はホストの実データ（系統・コスト・名前）から組み立てる＝ハードコードしない。
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { CARD_DB } from "../../server/src/logic/GameState"
import { destroySpirit, returnSpiritToHand, flushBounces } from "../../server/src/logic/removal"
import { bravesOf, hostsOf, braveLevelOf, matchesBraveCondition } from "../../shared/rules"
import type { CardData } from "../../server/src/type"

const HOST = "BS01-001" // ゴラドン（赤・コスト0・系統「爬獣」・Lv1=1コア）
const hostCard = getCard(HOST)
const HOST_FAMILY = hostCard.family[0]!
assert(HOST_FAMILY !== undefined, `テスト前提: ${HOST} は系統を持つ（${hostCard.family.join("/")}）`)

// テスト用ブレイヴ。合体状態Lv1は必ず0コア（validate-cards.ts と同じ規則）
function makeBrave(cardId: string, over: Partial<CardData> = {}): CardData {
    const c: CardData = {
        cardId, name: `テストブレイヴ${cardId}`, type: "brave", colors: ["blue"], cost: 2,
        reduction: ["blue"], family: ["機獣"],
        levels: [{ level: 1, cores: 2, bp: 2000 }, { level: 2, cores: 4, bp: 4000 }], // スピリット状態
        braveLevels: [{ level: 1, cores: 0, bp: 3000 }, { level: 2, cores: 3, bp: 5000 }], // 合体状態
        braveCondition: { family: HOST_FAMILY },
        symbol: ["blue"], flash: false, rarity: "C", limited: false, effect: "（テスト用）", effects: [],
        ...over,
    }
    CARD_DB.set(cardId, c)
    return c
}
const BRAVE = makeBrave("TEST-BRAVE-1").cardId
const BRAVE_MISMATCH = makeBrave("TEST-BRAVE-2", { braveCondition: { family: "存在しない系統" } }).cardId

function base(): GameState {
    const s = createGame("brave-stage2", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function putHost(s: GameState, pid: PlayerId, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(HOST, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== §A 合体条件（系統・コスト・カード名。読点区切りはOR） ===")
{
    const s = base()
    const host = putHost(s, "p1")
    assert(matchesBraveCondition(s, "p1", host, BRAVE), "系統が一致すれば合体できる")
    assert(!matchesBraveCondition(s, "p1", host, BRAVE_MISMATCH), "系統が違えば合体できない")

    const byName = makeBrave("TEST-BRAVE-3", { braveCondition: { cardName: hostCard.name } }).cardId
    assert(matchesBraveCondition(s, "p1", host, byName), "カード名指定でも合体できる")

    const byCost = makeBrave("TEST-BRAVE-4", { braveCondition: { minCost: hostCard.cost + 1 } }).cardId
    assert(!matchesBraveCondition(s, "p1", host, byCost), `コスト${hostCard.cost + 1}以上を要求すれば合体できない`)

    const orCond = makeBrave("TEST-BRAVE-5", {
        braveCondition: [{ family: "存在しない系統" }, { cardName: hostCard.name }],
    }).cardId
    assert(matchesBraveCondition(s, "p1", host, orCond), "配列＝ORなので、どれか1つ満たせば合体できる")
}

console.log("=== §B ダイレクトブレイヴ召喚：実体は combinedBraves、維持コアは置かない ===")
{
    const s = base()
    const host = putHost(s, "p1")
    s.players.p1.hand = [BRAVE]
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null,
        "ダイレクトブレイヴで召喚できる")

    assert(s.players.p1.field.spirits.length === 1, "フィールドのスピリットは1体のまま（合体スピリットは1体）")
    assert(s.players.p1.field.combinedBraves.length === 1, "ブレイヴの実体は combinedBraves にある")
    const brave = s.players.p1.field.combinedBraves[0]!
    assert(brave.cores === 0, "合体中のブレイヴはコアを持たない")
    assert((host.braveRefs ?? []).length === 1, "ホストが参照を1本持つ")
    assert(host.braveRefs![0]!.slot === "single", "通常のブレイヴは slot:\"single\"")
    // コスト2のみ消費（維持コアは置かない）
    assert(reserveBefore - s.players.p1.reserve === getCard(BRAVE).cost,
        `リザーブの減りはコスト分だけ（維持コアを置かない）：${reserveBefore - s.players.p1.reserve}`)

    assert(bravesOf(s.players.p1, host).length === 1, "bravesOf がホストからブレイヴを引ける")
    assert(hostsOf(s.players.p1, brave)[0]?.instanceId === host.instanceId, "hostsOf が逆向きに引ける")
    // 合体状態のレベルは**ホストのコア数**を braveLevels で引く（Lv1は0コアなので必ず成立する）
    assert(braveLevelOf(host, brave) === 1, "ホストのコア1個では合体状態Lv1")
    host.cores = 3
    assert(braveLevelOf(host, brave) === 2, "ホストのコア3個で合体状態Lv2")
    // ⚠️ ホストの「Lvコスト+N」はブレイヴに効かない（BRAVE.md §12 の5）
    host.levelCostBonusContinuous = 3
    assert(braveLevelOf(host, brave) === 2, "ホストのLvコスト+3はブレイヴの合体状態レベルを下げない")
}

console.log("=== §C 検証：条件を満たさない／既に合体済み／ブレイヴでない ===")
{
    const s = base()
    const host = putHost(s, "p1")
    s.players.p1.hand = [BRAVE_MISMATCH, BRAVE, BRAVE]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) !== null,
        "合体条件を満たさないホストには合体できない")
    assert(act(s, "p1", { type: "summon", handIndex: 1, braveTargetInstanceId: "no-such-id" }) !== null,
        "存在しないホストは指定できない")
    assert(act(s, "p1", { type: "summon", handIndex: 1, braveTargetInstanceId: host.instanceId }) === null,
        "1つ目は合体できる")
    assert(act(s, "p1", { type: "summon", handIndex: 1, braveTargetInstanceId: host.instanceId }) !== null,
        "1体のスピリットに合体できるブレイヴは1つまで")
}

console.log("=== §D 合体時の疲労合成：どちらかが疲労なら合体スピリットは疲労（§1.3） ===")
{
    const s = base()
    const host = putHost(s, "p1")
    host.isRested = true
    s.players.p1.hand = [BRAVE]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    assert(host.isRested === true, "疲労状態のホストに合体しても疲労のまま")
}

console.log("=== §E 分離：Lv1維持コスト以上のコアを置けば残る、置けなければ一緒にトラッシュ ===")
{
    // 残せる場合
    const s = base()
    const host = putHost(s, "p1")
    s.players.p1.hand = [BRAVE]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    const need = getCard(BRAVE).levels[0]!.cores // スピリット状態のLv1維持コスト
    s.players.p1.reserve = need
    const hostCores = host.cores // 破壊されたホストのコアはリザーブへ戻る
    destroySpirit(s, "p1", host.instanceId, "destroy")
    assert(s.players.p1.field.combinedBraves.length === 0, "合体中の置き場は空になる")
    assert(s.players.p1.field.spirits.length === 1, "ブレイヴがスピリット状態で場に残る")
    assert(s.players.p1.field.spirits[0]!.cardId === BRAVE, "残ったのはブレイヴ")
    assert(s.players.p1.field.spirits[0]!.cores === need, `Lv1維持コスト（${need}個）が置かれる`)
    assert(s.players.p1.reserve === hostCores, `置いた分だけリザーブが減る（ホストのコア${hostCores}個は戻る）`)
    assert(!s.players.p1.trashCards.includes(BRAVE), "ブレイヴはトラッシュに行っていない")

    // 残せない場合
    const s2 = base()
    const host2 = putHost(s2, "p1")
    s2.players.p1.hand = [BRAVE]
    act(s2, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host2.instanceId })
    s2.players.p1.reserve = need - 1
    destroySpirit(s2, "p1", host2.instanceId, "destroy")
    assert(s2.players.p1.field.combinedBraves.length === 0, "合体中の置き場は空になる")
    assert(s2.players.p1.field.spirits.length === 0, "コアを置けないのでブレイヴは残らない")
    assert(s2.players.p1.trashCards.includes(BRAVE), "合体元と一緒にトラッシュへ置かれる")
}

console.log("=== §F 分離は破壊以外の出口でも起きる（維持コア割れ／手札へ戻る） ===")
{
    // 維持コア割れの消滅
    const s = base()
    const host = putHost(s, "p1")
    s.players.p1.hand = [BRAVE]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    const need = getCard(BRAVE).levels[0]!.cores
    s.players.p1.reserve = need
    host.cores = 0
    destroySpirit(s, "p1", host.instanceId, "deplete")
    assert(s.players.p1.field.spirits[0]?.cardId === BRAVE, "維持コア割れの消滅でもブレイヴは分離して残る")

    // 手札へ戻る（バウンス）
    const s2 = base()
    const host2 = putHost(s2, "p1")
    s2.players.p1.hand = [BRAVE]
    act(s2, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host2.instanceId })
    s2.players.p1.reserve = need
    returnSpiritToHand(s2, "p1", host2)
    flushBounces(s2)
    assert(s2.players.p1.field.combinedBraves.length === 0, "手札へ戻る経路でも合体は解ける")
    assert(s2.players.p1.field.spirits[0]?.cardId === BRAVE, "ブレイヴは分離して場に残る")
}

console.log("=== §G アタック中に分離したら、ブレイヴがアタックを引き継ぐ（§6.2 の5） ===")
{
    const s = base()
    const host = putHost(s, "p1")
    s.players.p1.hand = [BRAVE]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    const need = getCard(BRAVE).levels[0]!.cores
    s.players.p1.reserve = need
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    assert(s.battle?.attackerInstanceId === host.instanceId, "アタッカーはホスト")
    destroySpirit(s, "p1", host.instanceId, "destroy")
    const brave = s.players.p1.field.spirits.find((sp) => sp.cardId === BRAVE)
    assert(brave !== undefined, "ブレイヴは分離して場に残る")
    assert(s.battle?.attackerInstanceId === brave!.instanceId, "アタッカーがブレイヴに差し替わる（アタックは継続）")
    // 合体スピリットはアタックで疲労していたので、その状態を引き継ぐ（§1.3）
    assert(brave!.isRested === true, "アタックで疲労した状態をそのまま引き継ぐ")
}
