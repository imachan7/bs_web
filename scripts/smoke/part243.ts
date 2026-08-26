// smoke パート243（BS10 赤バッチ：新規に追加した器の動作確認。2026-08-26）
//
// このバッチで server/src/type.ts に新設した軸（kind:"step" の whileCombined/oncePerTurn、
// AuraDef.turn/combinedFilter、recoverSpiritFromTrash.includeBraves、reductionGrant.vanillaFilter、
// constraint:"coresCantBeRemoved"）は既存 smoke のどのパートも通らないため、ここで最低限の発火を確認する。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, currentLevel, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { bravesOf, instIsCombined, matchesBraveCondition } from "../../shared/rules"
import { effectiveCost } from "../../shared/cost"

const byName = (n: string) => {
    const c = ALL_CARDS.find((x) => x.name === n)
    assert(c !== undefined, `テスト前提: ${n} がカードデータにいる`)
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

// host のコストを満たす、host が合体できるブレイヴを1枚探す（vanilla条件は host が効果ありなら除外）
function findCompatibleBrave(host: { cost: number; effect: string }) {
    return ALL_CARDS.find((c) => {
        if (c.type !== "brave") return false
        const cond = c.braveCondition
        const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
        const t = terms[0]
        if (t === undefined) return true
        if (t.vanilla === true) return host.effect === ""
        return host.cost >= (t.minCost ?? 0)
    })
}

console.log("=== §A 火星神龍アレス・ドラグーン：【合体時】Lv2 ターン終了時に【激突】持ちを回復させ、アタック+エンドステップをもう1回（ターンに1回） ===")
{
    const host = byName("火星神龍アレス・ドラグーン")
    const brave = findCompatibleBrave(host)
    assert(brave !== undefined, "テスト前提: 火星神龍アレス・ドラグーンが合体できるブレイヴが1枚は存在する")

    const s = game("bs10-ares")
    const lv2 = host.levels.find((l) => l.level === 2)!
    const hostInst = createInstance(host.cardId, s.turn, lv2.cores)
    s.players.p1.field.spirits.push(hostInst)
    refreshLevelAsOverrides(s)
    assert(matchesBraveCondition(s, "p1", hostInst, brave!.cardId), `${brave!.name} は${host.name}に合体できる`)
    s.players.p1.hand = [brave!.cardId]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: hostInst.instanceId }) === null,
        `${brave!.name} を合体召喚`)
    assert(instIsCombined(hostInst), "合体スピリットになっている")
    assert(bravesOf(s.players.p1, hostInst).length === 1, "ブレイヴが1体合体している")

    // 1回目のアタック：ブロックなしでライフダメージを与え、疲労状態にする
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: hostInst.instanceId }) === null, "1回目のアタック宣言")
    assert(takeLifeAndResolve(s, "p2") === null, "相手がライフで受ける")
    assert(hostInst.isRested, "アタック直後は疲労している")

    const turnBefore = s.turn
    assert(act(s, "p1", { type: "endTurn" }) === null, "ターン終了 → 【合体時】Lv2 の効果でアタックステップとエンドステップをもう1回")
    assert(s.turnPlayer === "p1", "ターンプレイヤーは変わらない（追加のアタックステップに入った）")
    assert(s.turn === turnBefore, "ターン番号は増えていない（同じターンの延長）")
    assert(s.phase === "attack", "追加のアタックステップに入っている")
    assert(!hostInst.isRested, "【激突】持ちの自分のスピリットが回復している")

    // 追加のアタックステップでも実際にアタックできる
    assert(act(s, "p1", { type: "attack", instanceId: hostInst.instanceId }) === null, "2回目（追加ステップ）のアタック宣言")
    assert(takeLifeAndResolve(s, "p2") === null, "追加のアタックステップでも実際にバトルできる")

    // ここでもう一度エンドステップに入る。「ターンに1回」が効いていれば、
    // 2回目の【合体時】発火は起きず、そのままターンが相手に渡る（起きなければ無限ループでこの行に到達しない）
    assert(act(s, "p1", { type: "endTurn" }) === null, "追加ステップのターン終了 → 今度は普通にターンが終わる")
    assert(s.turnPlayer === "p2", "「ターンに1回」で2回目の追加ステップは発生せず、ターンが相手に渡った")
    assert(s.turn === turnBefore + 1, "ターン番号が1つ進んだ")
}

console.log("=== §B 首長竜人ブラッキオ：自分のフィールドに合体スピリットがいる間、Lv3として扱う ===")
{
    const brakio = byName("首長竜人ブラッキオ")
    const s = game("bs10-brakio")
    const lv2 = brakio.levels.find((l) => l.level === 2)!
    const inst = createInstance(brakio.cardId, s.turn, lv2.cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    assert(currentLevel(inst).level === 2, "合体スピリットがいない間はLv3として扱われない（levelAsのcondition不成立）")

    // 適当な合体スピリットを1体、同じフィールドに用意する
    const host2 = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0)!
    const brave2 = findCompatibleBrave(host2)!
    const host2Inst = createInstance(host2.cardId, s.turn, host2.levels[0]!.cores)
    s.players.p1.field.spirits.push(host2Inst)
    refreshLevelAsOverrides(s)
    s.players.p1.hand = [brave2.cardId]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host2Inst.instanceId })
    refreshLevelAsOverrides(s)
    assert(instIsCombined(host2Inst), "テスト前提: 2体目が合体スピリットになった")
    assert(currentLevel(inst).level === 3, "自分のフィールドに合体スピリットがいる間、ブラッキオはLv3として扱われる")
}

console.log("=== §C そびえる机山群：自分のターンの間、自分のスピリットすべてをBP+1000（フェーズ不問の継続効果） ===")
{
    const nexusCard = byName("そびえる机山群")
    const s = game("bs10-tsukiyama")
    const nexusInst = createInstance(nexusCard.cardId, s.turn, nexusCard.levels[0]!.cores)
    s.players.p1.field.nexuses.push(nexusInst)
    const spiritCard = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0)!
    const spiritInst = createInstance(spiritCard.cardId, s.turn, spiritCard.levels[0]!.cores)
    s.players.p1.field.spirits.push(spiritInst)
    refreshLevelAsOverrides(s)
    const baseBp = spiritCard.levels[0]!.bp
    assert(effectiveBp(s, "p1", spiritInst) === baseBp + 1000, "自分のターン中は自分のスピリットがBP+1000される")

    assert(act(s, "p1", { type: "endTurn" }) === null, "ターン終了")
    assert(s.turnPlayer === "p2", "相手のターンになった")
    assert(effectiveBp(s, "p1", spiritInst) === baseBp, "相手のターン中はBP+1000されない（フェーズを問わずturn条件だけで判定）")
}

console.log("=== §D ブレイヴオーラ：アタックしている自分の合体スピリットに追加でBP+3000（combinedFilter） ===")
{
    const magicCard = byName("ブレイヴオーラ")
    const host = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0)!
    const brave = findCompatibleBrave(host)
    assert(brave !== undefined, "テスト前提: 適当なホストに合体できるブレイヴが1枚は存在する")

    const s = game("bs10-braveaura")
    const hostInst = createInstance(host.cardId, s.turn, host.levels[0]!.cores)
    s.players.p1.field.spirits.push(hostInst)
    refreshLevelAsOverrides(s)
    s.players.p1.hand = [brave!.cardId]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: hostInst.instanceId }) === null,
        `${brave!.name} を合体召喚`)
    assert(instIsCombined(hostInst), "合体スピリットになった")

    // 通常のスピリットも1体、比較用に用意する
    const plainCard = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0 && c.cardId !== host.cardId)!
    const plainInst = createInstance(plainCard.cardId, s.turn, plainCard.levels[0]!.cores)
    s.players.p1.field.spirits.push(plainInst)
    refreshLevelAsOverrides(s)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: hostInst.instanceId }) === null, "合体スピリットでアタック宣言")
    // 効果適用前のBP（ブレイヴの合体時BP+分は含む。effectiveBpは currentLevel.bp + braveBpBonus + オーラの合計）
    const combinedBaseBp = effectiveBp(s, "p1", hostInst)
    const plainBaseBp = effectiveBp(s, "p1", plainInst)
    // アタック後は防御側（p2）から優先権を持つため、まずp2がパスしてp1へ優先権を渡す
    assert(act(s, "p2", { type: "pass" }) === null, "p2がパスして優先権をp1へ")
    s.players.p1.hand = [magicCard.cardId]
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ブレイヴオーラをフラッシュで使用")
    assert(effectiveBp(s, "p1", hostInst) === combinedBaseBp + 1000 + 3000,
        "アタックしている合体スピリットはBP+1000とBP+3000の両方を受ける")
    assert(effectiveBp(s, "p1", plainInst) === plainBaseBp,
        "アタックしていない・合体していないスピリットは対象外")
}

console.log("=== §E ヤシウム：召喚時にトラッシュのスピリットカード/ブレイヴカードを1枚手札に戻す（includeBraves） ===")
{
    const yashium = byName("ヤシウム")
    const braveCardInTrash = ALL_CARDS.find((c) => c.type === "brave")!
    const s = game("bs10-yashium")
    s.players.p1.trashCards = [braveCardInTrash.cardId]
    s.players.p1.hand = [yashium.cardId]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ヤシウムを召喚")
    assert(s.players.p1.hand.includes(braveCardInTrash.cardId), "トラッシュのブレイヴカードが手札に戻る")
    assert(!s.players.p1.trashCards.includes(braveCardInTrash.cardId), "トラッシュからは無くなっている")
}

console.log("=== §F 炎の結晶石：効果の記述を持たない自分のスピリットカードに軽減シンボル[赤]を与える（vanillaFilter） ===")
{
    const crystal = byName("炎の結晶石")
    const s = game("bs10-crystal")
    const nexusInst = createInstance(crystal.cardId, s.turn, crystal.levels[0]!.cores)
    s.players.p1.field.nexuses.push(nexusInst)
    const vanillaCard = ALL_CARDS.find((c) => c.type === "spirit" && c.effect === "" && c.cost > 0)!
    const nonVanillaCard = ALL_CARDS.find((c) => c.type === "spirit" && c.effect !== "")!
    assert(
        effectiveCost(s, "p1", vanillaCard) < vanillaCard.cost,
        `バニラのスピリットカードは軽減される（${vanillaCard.cost} → ${effectiveCost(s, "p1", vanillaCard)}）`,
    )
    assert(
        effectiveCost(s, "p1", nonVanillaCard) === nonVanillaCard.cost,
        "効果を持つスピリットカードは軽減されない",
    )
}

console.log("=== §G 幻羅星龍ガイ・アスラ：お互い、このスピリットのコアを取り除けない ===")
{
    const gaiAsura = byName("幻羅星龍ガイ・アスラ")
    const s = game("bs10-gaiasura")
    const lv1 = gaiAsura.levels.find((l) => l.level === 1)!
    const inst = createInstance(gaiAsura.cardId, s.turn, lv1.cores + 2)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    const before = inst.cores
    // 自分の操作でもコアを動かせないことを確認（moveCore: direction "remove"）
    const err = act(s, "p1", { type: "moveCore", instanceId: inst.instanceId, direction: "remove" })
    assert(err !== null, "コアを取り除く操作はエラーになる")
    assert(inst.cores === before, "コア数は変化しない（お互い取り除けない）")
}
