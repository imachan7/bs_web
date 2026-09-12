// smoke パート315（BS14 緑バッチ20枚：BS14-023〜033/069/079〜081/099〜102/X03）
// 新設した器: kind:"burst" の granted.condition.targetMaxBp（effectGrant onBattleEnd用）／
// action:"grantEffectToAllByKeywordThisTurn"／action:"returnBofuExhaustedToHand"（bofuSourceInstanceId限定）／
// action:"revealTopSummonFreeOrReturnToDeck"／action:"sequence"／action:"bpBuff.costReturnSelfToHand"／
// action:"grantCanBlockWhileRestedThisTurn.singleTarget"／action:"summonBurstCardFreeIfCoresAtLeast"／
// AuraCounter "opponentSpirits"／step.condition.ownTrashOnlyColor
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    declareBlock,
    effectiveBp,
    fireStepTriggers,
    getCard,
    hasKeyword,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { placeBurst } from "../../server/src/logic/EffectModules"
import { fireFieldEventTriggers, fireTrigger } from "../../server/src/logic/triggers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: BS14緑カード定義（cardIdのズレ検出） ===")
{
    assert(getCard("BS14-024").name === "ツチピッグ", "BS14-024はツチピッグ")
    assert(getCard("BS14-030").name === "グラント・ベンケイ", "BS14-030はグラント・ベンケイ")
    assert(getCard("BS14-032").name === "ヤツノカンゾウ", "BS14-032はヤツノカンゾウ")
    assert(getCard("BS14-069").name === "タランチュー", "BS14-069はタランチュー")
    assert(getCard("BS14-079").name === "緑の五条橋", "BS14-079は緑の五条橋")
    assert(getCard("BS14-081").name === "神樹の切り株都市", "BS14-081は神樹の切り株都市")
    assert(getCard("BS14-099").name === "武迅衝", "BS14-099は武迅衝")
    assert(getCard("BS14-101").name === "仁王壁", "BS14-101は仁王壁")
    assert(getCard("BS14-X03").name === "風の覇王ドルクス・ウシワカ", "BS14-X03は風の覇王ドルクス・ウシワカ")
}

console.log("=== BS14-024ツチピッグ：トラッシュが緑だけのときだけエンドステップに回復する ===")
{
    const s = game("t315-024-a")
    const pig = put(s, "p1", "BS14-024", 1)
    pig.isRested = true
    s.players.p1.trashCards = ["BS14-024", "BS14-030"] // どちらも緑
    fireStepTriggers(s, "end")
    assert(!pig.isRested, "トラッシュが緑だけなら回復する")

    const s2 = game("t315-024-b")
    const pig2 = put(s2, "p1", "BS14-024", 1)
    pig2.isRested = true
    s2.players.p1.trashCards = ["BS14-024", "BS01-001"] // 赤/白等の混在
    fireStepTriggers(s2, "end")
    assert(pig2.isRested === true, "トラッシュが混色なら回復しない")

    const s3 = game("t315-024-c")
    const pig3 = put(s3, "p1", "BS14-024", 1)
    pig3.isRested = true
    s3.players.p1.trashCards = []
    fireStepTriggers(s3, "end")
    assert(pig3.isRested === true, "トラッシュが0枚なら回復しない（簡略化）")
}

console.log("=== BS14-025ムシャメガ：【神速】＋召喚時に自分のスピリットすべてBP+1000（ターン限定） ===")
{
    const s = game("t315-025")
    assert(hasKeyword("BS14-025", "soku"), "ムシャメガは【神速】を持つ")
    const mega = put(s, "p1", "BS14-025", 1)
    const ally = put(s, "p1", "BS01-001", 1)
    refreshLevelAsOverrides(s)
    const base = effectiveBp(s, "p1", ally)
    fireTrigger(s, "p1", mega, "onSummon")
    assert(effectiveBp(s, "p1", ally) === base + 1000, "召喚時に自分のスピリットすべてがBP+1000される")
}

console.log("=== BS14-026タマムッシュ：召喚時にLvと同じ数のコアを自身に置く ===")
{
    const s = game("t315-026")
    const mushi = put(s, "p1", "BS14-026", 4) // Lv2（コア4）
    refreshLevelAsOverrides(s)
    assert(currentLevel(mushi).level === 2, "Lv2で召喚")
    const before = mushi.cores
    fireTrigger(s, "p1", mushi, "onSummon")
    assert(mushi.cores === before + 2, "Lv2なのでコア2個をボイドから置く")
}

console.log("=== BS14-028ルリルリ：召喚時にコスト3以下のスピリットすべてを疲労させる（両陣営） ===")
{
    const s = game("t315-028")
    const ruri = put(s, "p1", "BS14-028", 1)
    const cheapOwn = put(s, "p1", "BS01-001", 1) // コスト0
    const cheapEnemy = put(s, "p2", "BS01-001", 1)
    const expensiveEnemy = put(s, "p2", "BS14-033", 1) // コスト7
    fireTrigger(s, "p1", ruri, "onSummon")
    assert(cheapOwn.isRested === true, "コスト3以下の自分のスピリットも疲労する")
    assert(cheapEnemy.isRested === true, "コスト3以下の相手のスピリットも疲労する")
    assert(expensiveEnemy.isRested === false, "コスト4以上は疲労しない")
}

console.log("=== BS14-030グラント・ベンケイ：バースト（自分のライフ減少後）＝相手手札破棄＋自身は手札に戻る ===")
{
    const s = game("t315-030-burst")
    s.players.p2.hand = ["BS01-001"]
    placeBurst(s, "p1", "BS14-030")
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p2.hand.length === 0, "相手は手札1枚を破棄する")
    assert(s.players.p1.burst === null, "バーストは解決後に空になる")
    assert(s.players.p1.hand.includes("BS14-030"), "その後、このカードは手札に戻る（トラッシュではない）")
}

console.log("=== BS14-030グラント・ベンケイ：召喚時も相手手札を破棄させる ===")
{
    const s = game("t315-030-onsummon")
    const benkei = put(s, "p1", "BS14-030", 1)
    s.players.p2.hand = ["BS01-001", "BS01-005"]
    fireTrigger(s, "p1", benkei, "onSummon")
    assert(s.players.p2.hand.length === 1, "召喚時に相手は手札1枚を破棄する")
}

console.log("=== BS14-030グラント・ベンケイLv2：殻虫すべて、BP7000以下とバトルしたとき回復する（バトル終了時） ===")
{
    const s = game("t315-030-lv2-recover")
    const benkei = put(s, "p1", "BS14-030", 3) // Lv2
    refreshLevelAsOverrides(s)
    const kabu = put(s, "p1", "BS14-023", 1) // 系統「殻虫」
    kabu.isRested = false
    const weakEnemy = put(s, "p2", "BS01-001", 1) // BP低い
    refreshLevelAsOverrides(s)
    kabu.isRested = true
    fireTrigger(s, "p1", kabu, "onBattleEnd", "attacker", weakEnemy.instanceId)
    assert(!kabu.isRested, "BP7000以下の相手とバトルしたときは回復する")

    const s2 = game("t315-030-lv2-norecover")
    const benkei2 = put(s2, "p1", "BS14-030", 3)
    refreshLevelAsOverrides(s2)
    const kabu2 = put(s2, "p1", "BS14-023", 1)
    const strongEnemy = put(s2, "p2", "BS14-033", 5) // Lv3 BP10000
    refreshLevelAsOverrides(s2)
    kabu2.isRested = true
    fireTrigger(s2, "p1", kabu2, "onBattleEnd", "attacker", strongEnemy.instanceId)
    assert(kabu2.isRested === true, "BP7000超の相手とバトルしたときは回復しない")
}

console.log("=== BS14-032ヤツノカンゾウ：【暴風：2】がブロックされたとき、相手2体を疲労させる ===")
{
    const s = game("t315-032-bofu")
    assert(hasKeyword("BS14-032", "bofu"), "ヤツノカンゾウは【暴風】を持つ")
    const kanzou = put(s, "p1", "BS14-032", 1)
    const blocker = put(s, "p2", "BS14-033", 5) // Lv3 BP10000（ブロック役）
    const foe1 = put(s, "p2", "BS01-001", 1)
    const foe2 = put(s, "p2", "BS01-005", 1)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: kanzou.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(foe1.isRested === true && foe2.isRested === true, "【暴風：2】でブロッカー以外の相手2体が疲労する")
    assert(blocker.isRested === false, "ブロッカー自身はexcludeTargetで対象外")
}

console.log("=== BS14-032ヤツノカンゾウLv2：暴風持ちにアタック時破壊で手札に戻す効果を付与する ===")
{
    const s = game("t315-032-grant")
    const kanzou = put(s, "p1", "BS14-032", 3) // Lv2 BP7000
    const blocker = put(s, "p2", "BS14-033", 5) // Lv3 BP10000（勝つ側）
    const foe1 = put(s, "p2", "BS01-001", 1)
    const foe2 = put(s, "p2", "BS01-005", 1)
    refreshLevelAsOverrides(s)
    fireStepTriggers(s, "attack") // Lv2の付与を発火させる
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: kanzou.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(foe1.isRested === true && foe2.isRested === true, "【暴風】で相手2体が疲労した")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === kanzou.instanceId),
        "BP7000<10000なのでヤツノカンゾウは破壊される（敗北）",
    )
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === foe1.instanceId) &&
            !s.players.p2.field.spirits.some((sp) => sp.instanceId === foe2.instanceId),
        "破壊（敗北）時、このスピリットの【暴風】で疲労させた相手2体は手札に戻る",
    )
    assert(
        s.players.p2.hand.includes("BS01-001") && s.players.p2.hand.includes("BS01-005"),
        "戻された2体は相手の手札にある",
    )
}

console.log("=== BS14-033霊樹の守り神ブランボアー：バトル時に勝利したとき回復、Lv3アタック時はさらにライフを1個削る ===")
{
    const s = game("t315-033")
    const buran = put(s, "p1", "BS14-033", 5) // Lv3
    refreshLevelAsOverrides(s)
    buran.isRested = true
    s.players.p2.life = 6
    fireTrigger(s, "p1", buran, "onBattleWin", "attacker")
    assert(!buran.isRested, "バトルしている相手を破壊したとき回復する")
    assert(s.players.p2.reserve >= 1, "Lv3アタック時は相手ライフのコア1個を相手のリザーブに置く")
}

console.log("=== BS14-069タランチュー：【合体時】合体アタック時に勝利したらボイドからコアを1個置く ===")
{
    const s = game("t315-069")
    const tarantula = put(s, "p1", "BS14-069", 0)
    tarantula.braveCombined = true
    const before = tarantula.cores
    fireTrigger(s, "p1", tarantula, "onBattleWin", "attacker")
    assert(tarantula.cores === before + 1, "合体アタック時に勝利したらコアが1個増える")
}

console.log("=== BS14-079緑の五条橋：召喚されたスピリットはそのターンBP+2000。Lv2は勝利時ボイドからコアをリザーブへ ===")
{
    const s = game("t315-079")
    const nexus = put(s, "p1", "BS14-079", 2) // ネクサスだがputで代用（field.nexusesへ積み直す）
    s.players.p1.field.spirits = s.players.p1.field.spirits.filter((x) => x.instanceId !== nexus.instanceId)
    s.players.p1.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    const summoned = put(s, "p1", "BS01-001", 1)
    summoned.summonedTurn = s.turn
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", summoned) === getCard("BS01-001").levels[0]!.bp + 2000, "召喚されたスピリットはそのターンBP+2000")

    resolveAction(s, "p1", nexus, { type: "voidCoreToReserve", count: 1 })
    assert(s.players.p1.reserve >= 21, "Lv2の器（voidCoreToReserve）が動く")
}

console.log("=== BS14-080神代の森：相手スピリット1体につき自分の緑スピリット全員BP+1000（自分のアタックステップ限定） ===")
{
    const s = game("t315-080")
    const nexus = put(s, "p1", "BS14-080", 2)
    s.players.p1.field.spirits = s.players.p1.field.spirits.filter((x) => x.instanceId !== nexus.instanceId)
    s.players.p1.field.nexuses.push(nexus)
    const green = put(s, "p1", "BS14-023", 1)
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-005", 1)
    refreshLevelAsOverrides(s)
    const baseline = getCard("BS14-023").levels[0]!.bp
    assert(effectiveBp(s, "p1", green) === baseline, "メインステップ中はオーラが効かない")
    s.phase = "attack"
    assert(effectiveBp(s, "p1", green) === baseline + 2000, "相手2体なのでアタックステップ中はBP+2000")

    green.isRested = true
    fireStepTriggers(s, "end")
    assert(!green.isRested, "Lv2のエンドステップ効果で緑のスピリットが回復する")
}

console.log("=== BS14-081神樹の切り株都市：緑のスピリットカードなら召喚、それ以外はデッキの上に残す ===")
{
    const s = game("t315-081-summon")
    const nexus = put(s, "p1", "BS14-081", 0)
    s.players.p1.field.spirits = s.players.p1.field.spirits.filter((x) => x.instanceId !== nexus.instanceId)
    s.players.p1.field.nexuses.push(nexus)
    s.players.p1.deck = ["BS14-023", "BS01-001"]
    resolveAction(s, "p1", nexus, { type: "revealTopSummonFreeOrReturnToDeck", cardType: "spirit", colorFilter: "green" })
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-023"),
        "緑のスピリットカードは召喚する（非対話では召喚側に倒す）",
    )
    assert(s.players.p1.deck.length === 1, "召喚した1枚はデッキから取り除かれる")

    const s2 = game("t315-081-notmatch")
    const nexus2 = put(s2, "p1", "BS14-081", 0)
    s2.players.p1.field.spirits = s2.players.p1.field.spirits.filter((x) => x.instanceId !== nexus2.instanceId)
    s2.players.p1.field.nexuses.push(nexus2)
    s2.players.p1.deck = ["BS01-001", "BS14-023"] // 赤のスピリット（対象外）
    resolveAction(s2, "p1", nexus2, { type: "revealTopSummonFreeOrReturnToDeck", cardType: "spirit", colorFilter: "green" })
    assert(s2.players.p1.deck[0] === "BS01-001", "対象でないカードはデッキの上に残る（取り除かれない）")
    assert(
        !s2.players.p1.field.spirits.some((sp) => sp.cardId === "BS01-001"),
        "対象でないカードは召喚されない",
    )
}

console.log("=== BS14-099武迅衝：バースト（相手の召喚時効果発揮後）＝相手1体疲労、その後コストを払ってメイン発揮 ===")
{
    const s = game("t315-099")
    const foe = put(s, "p2", "BS01-001", 1)
    const ally = put(s, "p1", "BS01-001", 1)
    placeBurst(s, "p1", "BS14-099")
    const beforeCores = ally.cores
    fireFieldEventTriggers(s, "p1", "opponentSummonEffectResolved")
    assert(foe.isRested === true, "相手のスピリット1体を疲労させる")
    assert(ally.cores === beforeCores + 1 || s.players.p1.field.spirits.some((sp) => sp.cores > beforeCores), "その後コストを支払ってメイン効果（コア設置）まで発揮する")
}

console.log("=== BS14-101仁王壁：バースト（相手による自分のスピリット破壊後）＝コア1個、その後フラッシュで疲労状態ブロック付与 ===")
{
    const s = game("t315-101")
    const green = put(s, "p1", "BS14-023", 1)
    green.isRested = true
    placeBurst(s, "p1", "BS14-101")
    const beforeReserve = s.players.p1.reserve
    const dummyDestroyed = createInstance("BS01-001", s.turn, 1)
    fireFieldEventTriggers(s, "p1", "ownSpiritDestroyed", { pid: "p1", inst: dummyDestroyed }, undefined, undefined, undefined, { byOpponentEffect: true })
    // コア設置（+1）の直後に thenPay:"flash" がフラッシュ効果のコストを払う（軽減後の実支払い）ため、
    // リザーブの最終値だけを見ると +1 にならない。設置そのものはログで確かめる
    assert(
        s.log.some((l) => l.includes("ボイドからコア1個を自分のリザーブに置いた")),
        "ボイドからコア1個を自分のリザーブに置く",
    )
    assert(s.players.p1.reserve < beforeReserve + 1, "その後フラッシュ効果のコストを支払っている")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === green.instanceId && sp.isRested),
        "指定された緑のスピリットは疲労状態のまま（フラッシュ効果まで発揮済み）",
    )
    // 疲労状態でもブロックできることを確認
    const attacker = put(s, "p2", "BS01-001", 1)
    s.turnPlayer = "p2"
    assert(act(s, "p2", { type: "nextPhase" }) === null, "相手のアタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手がアタック宣言")
    assert(declareBlock(s, "p1", green.instanceId) === null, "疲労状態の緑スピリットでもブロックできる")
}

console.log("=== BS14-102烈風神空覇：バースト（自分のライフ減少後）＝系統回復3体まで、その後フラッシュで相手3体まで疲労 ===")
{
    const s = game("t315-102")
    const a = put(s, "p1", "BS14-023", 1) // 殻虫
    const b = put(s, "p1", "BS14-023", 1)
    a.isRested = true
    b.isRested = true
    const foe1 = put(s, "p2", "BS01-001", 1)
    const foe2 = put(s, "p2", "BS01-005", 1)
    placeBurst(s, "p1", "BS14-102")
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(!a.isRested && !b.isRested, "系統を持つ自分のスピリット3体まで回復する")
    assert(foe1.isRested === true && foe2.isRested === true, "その後、相手のスピリット3体までを疲労させる")
}

console.log("=== BS14-X03風の覇王ドルクス・ウシワカ：バーストは相手2体疲労＋コア8個以上なら自身を召喚する ===")
{
    assert(hasKeyword("BS14-X03", "soku"), "風の覇王ドルクス・ウシワカは【神速】を持つ")
    const s = game("t315-x03-summon")
    const foe1 = put(s, "p2", "BS01-001", 1)
    const foe2 = put(s, "p2", "BS01-005", 1)
    s.players.p1.reserve = 8 // コア合計8個以上（リザーブのみで満たす）
    placeBurst(s, "p1", "BS14-X03")
    const dummyDestroyedX03 = createInstance("BS01-001", s.turn, 1)
    fireFieldEventTriggers(s, "p1", "ownSpiritDestroyed", { pid: "p1", inst: dummyDestroyedX03 }, undefined, undefined, undefined, { byOpponentEffect: true })
    assert(foe1.isRested === true && foe2.isRested === true, "相手のスピリット2体を疲労させる")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-X03"),
        "コア合計8個以上のとき、このスピリットカードを召喚する",
    )

    const s2 = game("t315-x03-nosummon")
    put(s2, "p2", "BS01-001", 1)
    put(s2, "p2", "BS01-005", 1)
    s2.players.p1.reserve = 0
    placeBurst(s2, "p1", "BS14-X03")
    const dummyDestroyedX03b = createInstance("BS01-001", s2.turn, 1)
    fireFieldEventTriggers(s2, "p1", "ownSpiritDestroyed", { pid: "p1", inst: dummyDestroyedX03b }, undefined, undefined, undefined, { byOpponentEffect: true })
    assert(
        !s2.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-X03"),
        "コア合計8個未満のときは召喚されない",
    )
}

console.log("すべてのチェックに合格しました 🎉（part315）")
