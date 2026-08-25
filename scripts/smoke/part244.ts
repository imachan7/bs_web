// smoke パート244（BS10 紫バッチ：新規に追加した器の動作確認。2026-08-26）
//
// このバッチで新設した軸（DestroyContext.sourceInstanceId / fieldEvent.byOpponentSpiritEffectOnly /
// destroyerCoresToTrash / exhaustSpiritsAndNexusesUpTo / costDiscardHandThenDraw /
// recoverSpiritFromTrash.vanillaFilter・bravesOnly / keywordGrant.braveInSpiritState /
// summonFromTrashFree.whileCombinedFilter / destroy.chooserIsTarget / coreDrainAllOthers.rewardDraw /
// discardBothHands.countCounter / EffectCounter.ownFamily の配列OR）は既存 smoke のどのパートも
// 通らないため、ここで最低限の発火を確認する。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, destroySpirit, refreshLevelAsOverrides, resolveAction, runTurnStart, spiritHasKeyword } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { countEffectCounter } from "../../server/src/logic/EffectModules"

const byName = (n: string) => {
    const c = ALL_CARDS.find((x) => x.name === n)
    assert(c !== undefined, `テスト前提: ${n} がカードデータにいる`)
    return c!
}

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== §A アントイーター：byOpponentSpiritEffectOnly + destroyerCoresToTrash ===")
{
    const ant = byName("アントイーター")
    const s = setup("bs10-ant")
    const antInst = put(s, "p1", ant.cardId, 1)
    const destroyer = put(s, "p2", "BS01-001", 3)
    assert(s.players.p2.trashCores === 0, "前提：p2のトラッシュコアは0")
    destroySpirit(s, "p1", antInst.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        sourceColors: ["purple"],
        sourceInstanceId: destroyer.instanceId,
    })
    assert(destroyer.cores === 0, "発生源スピリットのコアがすべて取り除かれた")
    assert(s.players.p2.trashCores === 3, "発生源スピリットのコア3個がp2のトラッシュに置かれた")
}

console.log("=== §B エル・クラーケン：exhaustSpiritsAndNexusesUpTo（スピリット/ネクサス混合で合計count個まで） ===")
{
    const s = setup("bs10-kraken")
    const sp1 = put(s, "p2", "BS01-001", 1)
    const sp2 = put(s, "p2", "BS01-001", 1)
    const nx1 = putNexus(s, "p2", byName("六分儀天文台").cardId, 0)
    resolveAction(s, "p1", null, { type: "exhaustSpiritsAndNexusesUpTo", count: 3 })
    assert(sp1.isRested && sp2.isRested && nx1.isRested, "相手のスピリット2体・ネクサス1つがすべて疲労した（合計3）")
}

console.log("=== §C 土星神龍クロノ・ボロス：costDiscardHandThenDraw（コストを完全に払えるときだけ発揮） ===")
{
    const s = setup("bs10-chronoboros")
    s.players.p1.hand = ["BS01-001"]
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "costDiscardHandThenDraw", discardCount: 2, drawCount: 3 })
    assert(s.players.p1.hand.length === 1, "手札が2枚に満たないため発動せず、手札は減らない")
    assert(s.players.p1.deck.length === deckBefore, "コストを払えないのでドローもしない")

    s.players.p1.hand = ["BS01-001", "BS01-001", "BS01-001"]
    const deckBefore2 = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "costDiscardHandThenDraw", discardCount: 2, drawCount: 3 })
    assert(s.players.p1.hand.length === 4, "手札2枚を破棄し、デッキから3枚ドローした（3-2+3=4）")
    assert(s.players.p1.deck.length === deckBefore2 - 3, "デッキから3枚引かれた")
    assert(s.players.p1.trashCards.length === 2, "破棄した2枚がトラッシュにある")
}

console.log("=== §D recoverSpiritFromTrash：vanillaFilter / bravesOnly ===")
{
    const s = setup("bs10-recover")
    const vanilla = byName("オニグモン") // BS10-011：effect=""のバニラ
    const withEffect = byName("アントイーター")
    s.players.p1.trashCards = [withEffect.cardId, vanilla.cardId]
    resolveAction(s, "p1", null, { type: "recoverSpiritFromTrash", count: 1, vanillaFilter: true })
    assert(s.players.p1.hand.includes(vanilla.cardId), "バニラのオニグモンだけが手札に戻った")
    assert(s.players.p1.trashCards.includes(withEffect.cardId), "効果ありのアントイーターはトラッシュに残った")

    const brave = ALL_CARDS.find((c) => c.type === "brave")
    assert(brave !== undefined, "テスト前提：ブレイヴカードが1枚は存在する")
    s.players.p1.trashCards = [withEffect.cardId, brave!.cardId]
    s.players.p1.hand = []
    resolveAction(s, "p1", null, { type: "recoverSpiritFromTrash", count: 1, bravesOnly: true })
    assert(s.players.p1.hand.includes(brave!.cardId), "bravesOnly指定時はブレイヴカードだけが対象になった")
    assert(!s.players.p1.hand.includes(withEffect.cardId), "スピリットカードは対象にならなかった")
}

console.log("=== §E 魔星輝く古戦場：keywordGrant.braveInSpiritState（スピリット状態のブレイヴだけに【呪撃】を与える） ===")
{
    const s = setup("bs10-kosenjo")
    const kosenjo = byName("魔星輝く古戦場")
    const lv2 = kosenjo.levels.find((l) => l.level === 2)!
    putNexus(s, "p1", kosenjo.cardId, lv2.cores)
    const brave = ALL_CARDS.find((c) => c.type === "brave")
    assert(brave !== undefined, "テスト前提：ブレイヴカードが1枚は存在する")
    const braveInst = put(s, "p1", brave!.cardId, 1) // 合体せずフィールドのspiritsに直接置く＝スピリット状態
    const nonBrave = put(s, "p1", "BS01-001", 1)
    refreshLevelAsOverrides(s)
    assert(spiritHasKeyword(s, "p1", braveInst, "jugeki"), "スピリット状態のブレイヴには【呪撃】が付与される")
    assert(!spiritHasKeyword(s, "p1", nonBrave, "jugeki"), "ブレイヴでないスピリットには付与されない")
}

console.log("=== §F 虚実の口：summonFromTrashFree.whileCombinedFilter ===")
{
    const s = setup("bs10-kojitsu")
    const withWhileCombined = byName("火星神龍アレス・ドラグーン") // BS10-008：【合体時】Lv2のstepエントリを持つスピリットカード
    const plain = byName("オニグモン")
    s.players.p1.trashCards = [plain.cardId, withWhileCombined.cardId]
    s.players.p1.reserve = 10
    resolveAction(s, "p1", null, { type: "summonFromTrashFree", whileCombinedFilter: true })
    const summonedIds = s.players.p1.field.spirits.map((sp) => sp.cardId)
    assert(summonedIds.includes(withWhileCombined.cardId), "【合体時】効果を持つカードが召喚された")
    assert(s.players.p1.trashCards.includes(plain.cardId), "【合体時】を持たないカードはトラッシュに残った")
}

console.log("=== §G ハングドマン：destroy.chooserIsTarget（相手が対象を選ぶ） ===")
{
    const s = setup("bs10-hangdman")
    s.interactiveTargets = true
    const oppA = put(s, "p2", "BS01-001", 1)
    const oppB = put(s, "p2", "BS02-015", 1)
    resolveAction(s, "p1", null, { type: "destroy", count: 1, chooserIsTarget: true })
    assert(s.pendingChoice !== null, "対象の選択待ちになっている")
    assert(s.pendingChoice?.pid === "p2", "選ぶのは相手（破壊される側）")
    assert(
        act(s, "p2", { type: "resolveChoice", instanceId: oppB.instanceId }) === null,
        "相手が対象を選んで解決",
    )
    assert(s.players.p2.field.spirits.includes(oppA), "選ばれなかった側は残っている")
    assert(!s.players.p2.field.spirits.includes(oppB), "相手が選んだ自分のスピリットが破壊された")
}

console.log("=== §H 双魚賊神ピスケガレオン：coreDrainAllOthers.rewardDraw / discardBothHands.countCounter（ownFamilyの配列OR） ===")
{
    const s = setup("bs10-piskeg")
    const pg = byName("双魚賊神ピスケガレオン")
    const selfInst = put(s, "p1", pg.cardId, 1)
    put(s, "p1", "BS01-001", 1) // 維持コア1のバニラ：-1で消滅する
    put(s, "p2", "BS01-001", 2) // 維持コア1・コア2：-1で1個残り消滅しない
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", selfInst, { type: "coreDrainAllOthers", rewardDraw: true })
    assert(s.players.p1.deck.length === deckBefore - 1, "消滅した1体ぶん自分がドローした（コアがselfへ乗らない）")
    assert(selfInst.cores === 1, "rewardDraw指定時はselfにコアを乗せない")

    const s2 = setup("bs10-piskeg-discard")
    const koudou = ALL_CARDS.find((c) => c.family.includes("光導"))
    assert(koudou !== undefined, "テスト前提：系統「光導」を持つカードが1枚は存在する")
    put(s2, "p1", koudou!.cardId, koudou!.levels[0]!.cores)
    const n = countEffectCounter(s2, "p1", null, { ownFamily: ["光導", "星魂"] }, undefined)
    assert(n === 1, "配列OR：系統「光導」/「星魂」のいずれかを持つスピリット数を数えられる")
    s2.players.p1.hand = ["BS01-001", "BS01-001"]
    s2.players.p2.hand = ["BS01-001", "BS01-001"]
    resolveAction(s2, "p1", null, { type: "discardBothHands", count: 0, countCounter: { ownFamily: ["光導", "星魂"] } })
    assert(s2.players.p1.hand.length === 1, "自分は光導/星魂1体ぶん＝1枚破棄した")
    assert(s2.players.p2.hand.length === 1, "相手も同じ枚数破棄した（お互いに）")
}
