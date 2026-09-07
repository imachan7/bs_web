// smoke パート293（BS12 青バッチ：新しく足した器を1件ずつ発火させる）
// #13=vanillaAsGrantの自己言及一般則（発揮は止まらない）／BB=levelAs ownSpiritsVanilla treatAs:"max"／
// BD=noSummonTriggerByCostの両陣営（既存挙動を変えていないことも確認）／
// BJ=step kind cost:{exhaustSelf}＋protectLifeByCostThisTurn symbolCount+combinedOnly／
// BA/BC=immunityGrant vanillaFilter+phaseTurn／H=magicRestriction noSpiritCoresOpponent・whileCombined／
// BH=destroyByOwnFamilyCostSet／BI=refreshSelf costDestroyOwnVanillaSpirit／BG=destroy lowestCost／
// BF=discardOpponent revealAllHandIfNone／G=globalConstraint noSummonByEffect／
// F=capOpponentTrashCoreReturnNextRefresh／BE=handReductionColorAsThisTurn／colorAs ownNexusesAll／
// 083=revealAndPlaceNexusFree・bpBuff vanillaFilter
import {
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectiveCost,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { attachBrave } from "../../server/src/logic/removal"
import { summonFreeFromHandIndex } from "../../server/src/logic/EffectModules"
import { endTurn } from "../../server/src/logic/PhaseManager"
import { fireStepTriggers } from "../../server/src/logic/triggers"
import {
    effectSources,
    hasMagicImmunity,
    instIsVanilla,
    lifeProtectedByCostThisTurn,
    noSummonTriggerByCost,
} from "../../shared/rules"
import { hasMagicRestriction } from "../../shared/cost"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

console.log("=== #13: vanillaAsGrantの自己言及（バニラ化されても効果は発揮し続ける） ===")
{
    const s = game("13-self-ref")
    const x06 = createInstance("BS12-X06", s.turn, 6) // Lv3
    s.players.p1.field.spirits.push(x06)
    const other = createInstance("BS12-041", s.turn, 1)
    s.players.p1.field.spirits.push(other)
    refreshLevelAsOverrides(s)
    assert(instIsVanilla(x06), "X06 自身も自分の Lv3 効果でバニラ化される")
    assert(instIsVanilla(other), "X06 がバニラでも、e3（自分のスピリットすべてをバニラ化）は発揮し続け、他のスピリットもバニラ化する")
    assert(
        effectSources(s, "p1").some((i) => i.instanceId === x06.instanceId),
        "バニラ化は effectsDisabledContinuous とは別物なので、X06 は引き続き effectSources に含まれる（発揮を止めない）",
    )
}

console.log("=== BB: 045黒獣王ケフェウスLv2（バニラのスピリットは最高Lvとして扱われる） ===")
{
    const s = game("bb-maxlevel")
    const kepheus = createInstance("BS12-045", s.turn, 4) // Lv2
    s.players.p1.field.spirits.push(kepheus)
    const target = createInstance("BS12-X06", s.turn, 1) // 系統「獣頭」・生コアではLv1、レベル表の最大はLv3
    s.players.p1.field.spirits.push(target)
    s.phase = "attack"
    s.turnPlayer = "p1"
    refreshLevelAsOverrides(s)
    assert(instIsVanilla(target), "獣頭のスピリットは045 e1でバニラ扱いになる")
    assert(currentLevel(target).level === 3, `045 e2でバニラの自分のスピリットは最高Lv(3)として扱われる（実際 ${currentLevel(target).level}）`)
}

console.log("=== BD: 043大地の狩人コンドラッドLv2（両陣営のコスト3以下『召喚時』が発揮されない） ===")
{
    const s = game("bd-nosummontrigger")
    const kondrad = createInstance("BS12-043", s.turn, 3) // Lv2
    s.players.p1.field.spirits.push(kondrad)
    const p1cheap = createInstance("BS12-041", s.turn, 1) // コスト1
    const p2cheap = createInstance("BS12-041", s.turn, 1)
    s.phase = "main"
    s.turnPlayer = "p2" // 相手（043所有者から見て）のメインステップ
    assert(noSummonTriggerByCost(s, p1cheap), "自分側のコスト3以下も発揮されない（両陣営・主語なし）")
    assert(noSummonTriggerByCost(s, p2cheap), "相手側のコスト3以下も発揮されない")
    s.turnPlayer = "p1" // 自分のメインステップに戻すと『相手のメインステップ』限定から外れる
    assert(!noSummonTriggerByCost(s, p1cheap), "『相手のメインステップ』限定なので、自分のメインステップでは発揮される（既存挙動を壊していない）")
}

console.log("=== BJ: 043Lv1 ステップ開始時、疲労させることで symbolCount+combinedOnly のライフ保護 ===")
{
    const s = game("bj-protectlife")
    const kondrad = createInstance("BS12-043", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(kondrad)
    s.phase = "attack"
    s.turnPlayer = "p2" // 相手のアタックステップ
    fireStepTriggers(s, "attack")
    assert(kondrad.isRested, "cost:{exhaustSelf} により、発火が確定した時点で自身が疲労する")
    const attacker2sym = createInstance("BS12-047", s.turn, 4) // シンボル2つ・合体扱いにする
    attacker2sym.braveRefs = [{ slot: "single", instanceId: "dummy" }]
    assert(
        lifeProtectedByCostThisTurn(s, "p1", attacker2sym),
        "symbolCount:2 + combinedOnly のアタックでは自分のライフが保護される",
    )
    const attacker1sym = createInstance("BS12-041", s.turn, 1) // シンボル1つ
    assert(!lifeProtectedByCostThisTurn(s, "p1", attacker1sym), "シンボル数が一致しないアタックは保護されない")
}

console.log("=== BA/BC: 071のvanillaFilter+phaseTurn immunityGrant ===")
{
    const s = game("ba-immunity")
    const nexus = createInstance("BS12-071", s.turn, 0) // Lv1
    s.players.p1.field.nexuses.push(nexus)
    const vanillaSpirit = createInstance("BS12-041", s.turn, 1)
    s.players.p1.field.spirits.push(vanillaSpirit)
    s.phase = "attack"
    s.turnPlayer = "p1"
    assert(hasMagicImmunity(s, "p1", vanillaSpirit), "自分のアタックステップ中、バニラの自分のスピリットは相手のマジックの効果を受けない")
    s.phase = "main"
    assert(!hasMagicImmunity(s, "p1", vanillaSpirit), "phaseTurn限定なのでメインステップでは効かない")
}

console.log("=== H: 046ナタ・ゴレムLv1（noSpiritCoresOpponent）／047【合体時】（whileCombinedのreserveOnlyOpponent） ===")
{
    const s = game("h-magicrestriction")
    const nata = createInstance("BS12-046", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(nata)
    s.phase = "attack"
    s.turnPlayer = "p1"
    assert(
        hasMagicRestriction(s, "p2", "noSpiritCoresOpponent"),
        "046の相手（p2）は、マジックのコストをスピリット上のコアでは支払えない",
    )

    const mercurius = createInstance("BS12-047", s.turn, 4) // Lv2
    s.players.p1.field.spirits.push(mercurius)
    assert(
        !hasMagicRestriction(s, "p2", "reserveOnlyOpponent"),
        "047 e3はwhileCombined限定なので、合体していない間は発揮されない",
    )
    const brave = createInstance("BS12-059", s.turn, 2)
    attachBrave(s, "p1", mercurius, brave)
    assert(
        hasMagicRestriction(s, "p2", "reserveOnlyOpponent"),
        "合体すると047 e3が発揮され、相手はフィールドのコアでマジックのコストを支払えない",
    )
}

console.log("=== BH: X06召喚時 destroyByOwnFamilyCostSet（自身のコストも数える） ===")
{
    const s = game("bh-destroybycostset")
    const x06 = createInstance("BS12-X06", s.turn, 1) // コスト7・系統「獣頭」
    s.players.p1.field.spirits.push(x06)
    const matchCost7 = createInstance("BS12-X06", s.turn, 1)
    matchCost7.instanceId = "p2-match-7"
    s.players.p2.field.spirits.push(matchCost7)
    const noMatch = createInstance("BS12-041", s.turn, 1) // コスト1
    s.players.p2.field.spirits.push(noMatch)
    resolveAction(s, "p1", x06, { type: "destroyByOwnFamilyCostSet", familyFilter: "獣頭" })
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === "p2-match-7"),
        "自身(X06)と同じコスト7の相手のスピリットは破壊される（自身も数える。§1 #16）",
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === noMatch.instanceId),
        "コストが一致しない相手のスピリットは破壊されない",
    )
}

console.log("=== BI: X06 refreshSelf costDestroyOwnVanillaSpirit ===")
{
    const s = game("bi-refreshself")
    const x06 = createInstance("BS12-X06", s.turn, 4) // Lv2
    x06.isRested = true
    s.players.p1.field.spirits.push(x06)
    const vanillaAlly = createInstance("BS12-041", s.turn, 1)
    s.players.p1.field.spirits.push(vanillaAlly)
    resolveAction(s, "p1", x06, { type: "refreshSelf", costDestroyOwnVanillaSpirit: true })
    assert(!x06.isRested, "効果の記述を持たない自分のスピリットを破壊するコストを払えたので回復する")
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === vanillaAlly.instanceId),
        "コストとしてバニラの自分のスピリットが破壊された",
    )

    const s2 = game("bi-refreshself-nocandidate")
    const x06b = createInstance("BS12-X06", s2.turn, 4)
    x06b.isRested = true
    s2.players.p1.field.spirits.push(x06b)
    resolveAction(s2, "p1", x06b, { type: "refreshSelf", costDestroyOwnVanillaSpirit: true })
    assert(x06b.isRested, "AとBの両方が完全に解決できるときだけ発揮される：バニラの候補がいなければコストが払えず不発")
}

console.log("=== BG: 084 destroy lowestCost（最もコストが低いスピリットを破壊） ===")
{
    const s = game("bg-lowestcost")
    const cheap = createInstance("BS12-041", s.turn, 1) // コスト1
    const pricey = createInstance("BS12-X06", s.turn, 1) // コスト7
    s.players.p2.field.spirits.push(pricey)
    s.players.p2.field.spirits.push(cheap)
    resolveAction(s, "p1", null, { type: "destroy", count: 1, lowestCost: true })
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === cheap.instanceId),
        "コストが最も低いスピリットが破壊される",
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === pricey.instanceId),
        "コストが高いスピリットは残る",
    )
}

console.log("=== BF: 072Lv2 discardOpponent revealAllHandIfNone（破棄できないとき手札を公開） ===")
{
    const s = game("bf-revealhand")
    s.players.p2.hand = ["BS12-041"] // マジックカードが無い
    resolveAction(s, "p1", null, {
        type: "discardOpponent",
        count: 1,
        cardTypeFilter: "magic",
        revealAllHandIfNone: true,
    })
    assert(
        s.log.some((l) => l.includes("手札すべてを公開した")),
        "破棄できるマジックが無いとき、代わりに手札すべてを公開したログが出る",
    )
    assert(s.players.p2.hand.length === 1, "公開しただけで手札の中身は変わらない（その場で見せて終わり）")
}

console.log("=== G: 072Lv1 globalConstraint noSummonByEffect（両陣営・メインステップ限定） ===")
{
    const s = game("g-nosummonbyeffect")
    const nexus = createInstance("BS12-072", s.turn, 0) // Lv1
    s.players.p1.field.nexuses.push(nexus)
    s.players.p1.hand = ["BS12-041"]
    s.phase = "main"
    const before = s.players.p1.field.spirits.length
    summonFreeFromHandIndex(s, "p1", "テスト", 0)
    assert(s.players.p1.field.spirits.length === before, "noSummonByEffectが有効な間は効果による召喚が発動しない")
    assert(s.players.p1.hand.length === 1, "手札のカードも消費されない")
}

console.log("=== F: 047召喚時 capOpponentTrashCoreReturnNextRefresh（次の相手のリフレッシュステップだけ制限） ===")
{
    const s = game("f-caprefresh")
    s.players.p2.trashCores = 10
    resolveAction(s, "p1", null, { type: "capOpponentTrashCoreReturnNextRefresh", max: 3 })
    assert(s.players.p2.trashCoreReturnCapNext === 3, "相手の次のリフレッシュステップ用の上限が立つ")
    const reserveBefore = s.players.p2.reserve
    endTurn(s) // p1 -> p2 のターン開始（p2のリフレッシュステップを実行）
    // +3はトラッシュからの戻し上限、+1は通常のコアステップ（先攻1ターン目でなければ毎ターン+1リザーブ）ぶん
    assert(s.players.p2.reserve === reserveBefore + 3 + 1, `トラッシュから戻るコアが3個までに制限される（実際のリザーブ増分 ${s.players.p2.reserve - reserveBefore}）`)
    assert(s.players.p2.trashCores === 7, `超過分の7個はトラッシュに残る（実際 ${s.players.p2.trashCores}）`)
    assert(s.players.p2.trashCoreReturnCapNext === undefined, "上限は消費後に消える（次回以降は通常どおり）")
}

console.log("=== BE/colorAs: 042ヒノキ・ゴレム（手札ネクサスの軽減シンボルを青扱い・自分のネクサスは青扱い） ===")
{
    const s = game("be-reduction")
    const nexusCardId = "BS12-071" // 青ネクサス（読み替え後もeffectiveCostが計算できることを確認する）
    s.players.p1.hand = [nexusCardId]
    resolveAction(s, "p1", null, { type: "handReductionColorAsThisTurn", color: "blue", cardType: "nexus" })
    const constraint = s.turnConstraints.find((c) => c.type === "handReductionColorAsForPid")
    assert(constraint !== undefined, "手札の軽減シンボルを読み替えるturnConstraintsが積まれる")
    const cardData = getCard(nexusCardId)
    const cost = effectiveCost(s, "p1", cardData)
    assert(cost <= cardData.cost, "軽減シンボルの読み替え後もeffectiveCostが計算できる（クラッシュしない）")

    const gorem = createInstance("BS12-042", s.turn, 2) // Lv2
    s.players.p1.field.spirits.push(gorem)
    const ownNexus = createInstance("BS12-071", s.turn, 0)
    s.players.p1.field.nexuses.push(ownNexus)
    refreshLevelAsOverrides(s)
    assert(
        (ownNexus.colorsAsContinuous ?? []).includes("blue"),
        "042 Lv2により自分のネクサスすべては青のネクサスとしても扱われる（colorAs ownNexusesAll）",
    )
}

console.log("=== 083マジックランプ：revealAndPlaceNexusFree・bpBuff vanillaFilter ===")
{
    const s = game("083-lamp")
    s.players.p1.deck = ["BS12-071", "BS12-041", "BS12-041", ...s.players.p1.deck]
    const before = s.players.p1.field.nexuses.length
    resolveAction(s, "p1", null, { type: "revealAndPlaceNexusFree", count: 3 })
    assert(s.players.p1.field.nexuses.length === before + 1, "公開した中のネクサスカード1枚がコストを支払わず配置される")

    const s2 = game("083-lamp-bp")
    const vanillaTarget = createInstance("BS12-041", s2.turn, 1)
    s2.players.p1.field.spirits.push(vanillaTarget)
    const before2 = vanillaTarget.tempBpBuff
    resolveAction(s2, "p1", null, { type: "bpBuff", amount: 5000, filter: { vanilla: true }, anySide: true })
    assert(vanillaTarget.tempBpBuff === before2 + 5000, "効果の記述を持たないスピリットにBP+5000が乗る（filter.vanilla）")
}

console.log("すべてのチェックに合格しました 🎉（part293）")
