// smoke パート443（BS17部品バッチ2：免疫まわり。immuneToOpponentEffects.against配列／constraintGrantのcombinedBraveColors・symbolCount／timedImmuneのagainst）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
    giveTimed,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { CARD_DB } from "../../server/src/logic/GameState"
import { activeConstraints, boardResistanceAgainst, hasFullEffectImmunity } from "../../shared/rules"
import type { CardData } from "../../server/src/type"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ・シンボル1）
const SYMBOL2 = "BS04-010" // 雷帝エール・クレル（赤・シンボル2）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).symbol.length === 1, "VANILLAはシンボル1")
    assert(getCard(SYMBOL2).symbol.length === 2, "SYMBOL2はシンボル2")
}

// テスト専用カードをCARD_DBへ直接登録する（カードデータファイルは触らない。プロセス内だけの一時登録）
function registerCard(c: Partial<CardData> & { cardId: string; type: CardData["type"] }): void {
    const base: CardData = {
        cardId: c.cardId,
        name: c.cardId,
        type: c.type,
        colors: c.colors ?? ["red"],
        cost: c.cost ?? 1,
        reduction: [],
        family: [],
        levels: c.levels ?? [{ level: 1, cores: 0, bp: 1000 }],
        symbol: c.symbol ?? [],
        flash: false,
        rarity: "",
        limited: false,
        effect: "",
        effects: c.effects ?? [],
        ...(c.braveLevels ? { braveLevels: c.braveLevels } : {}),
    }
    CARD_DB.set(c.cardId, base)
}

registerCard({
    cardId: "ZTEST443-SELFIMM",
    type: "spirit",
    effects: [
        { id: "t1", kind: "constraint", levels: [1], constraint: { type: "immuneToOpponentEffects", against: ["spirit", "brave"] } },
    ],
})
registerCard({
    cardId: "ZTEST443-GRANT-COLOR",
    type: "spirit",
    effects: [
        { id: "t2", kind: "constraintGrant", levels: [1], target: "ownAll", combinedBraveColors: ["red"], constraint: { type: "mustAttack" } },
    ],
})
registerCard({
    cardId: "ZTEST443-GRANT-SYMBOL",
    type: "spirit",
    effects: [
        { id: "t3", kind: "constraintGrant", levels: [1], target: "ownAll", symbolCount: 1, constraint: { type: "mustAttack" } },
    ],
})
registerCard({ cardId: "ZTEST443-BRAVE-RED", type: "brave", colors: ["red"], levels: [{ level: 1, cores: 1, bp: 1000 }], braveLevels: [{ level: 1, cores: 0, bp: 0 }] })
registerCard({ cardId: "ZTEST443-BRAVE-PURPLE", type: "brave", colors: ["purple"], levels: [{ level: 1, cores: 1, bp: 1000 }], braveLevels: [{ level: 1, cores: 0, bp: 0 }] })

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. immuneToOpponentEffects.against配列：スピリット/ブレイヴは止まりマジックは通る ===")
{
    const s = game("case1")
    const me = put(s, "p2", "ZTEST443-SELFIMM", 1)
    assert(hasFullEffectImmunity(s, "p2", me, "spirit") === true, "against配列にspiritを含むので相手のスピリットの効果は届かない")
    assert(hasFullEffectImmunity(s, "p2", me, "brave") === true, "against配列にbraveを含むので相手のブレイヴの効果は届かない")
    assert(hasFullEffectImmunity(s, "p2", me, "magic") === false, "against配列にmagicは無いので相手のマジックの効果は届く")
}

console.log("=== 2. constraintGrant.combinedBraveColors：色が合わないブレイヴとの合体では無効 ===")
{
    const s = game("case2")
    const src = put(s, "p1", "ZTEST443-GRANT-COLOR", 1)
    const target = put(s, "p1", VANILLA, 1)
    assert(!activeConstraints(s, "p1", target).some((c) => c.type === "mustAttack"), "合体前は付与されない")

    const purpleBrave = createInstance("ZTEST443-BRAVE-PURPLE", s.turn, 0)
    s.players.p1.field.combinedBraves.push(purpleBrave)
    src.braveRefs = [{ slot: "single", instanceId: purpleBrave.instanceId }]
    refreshLevelAsOverrides(s)
    assert(!activeConstraints(s, "p1", target).some((c) => c.type === "mustAttack"), "色が合わないブレイヴとの合体では付与されない")

    const redBrave = createInstance("ZTEST443-BRAVE-RED", s.turn, 0)
    s.players.p1.field.combinedBraves = s.players.p1.field.combinedBraves.filter((b) => b.instanceId !== purpleBrave.instanceId)
    s.players.p1.field.combinedBraves.push(redBrave)
    src.braveRefs = [{ slot: "single", instanceId: redBrave.instanceId }]
    refreshLevelAsOverrides(s)
    assert(activeConstraints(s, "p1", target).some((c) => c.type === "mustAttack"), "色が合うブレイヴとの合体では付与される")
}

console.log("=== 3. constraintGrant.symbolCount：シンボル数が一致するスピリットだけに付与 ===")
{
    const s = game("case3")
    put(s, "p1", "ZTEST443-GRANT-SYMBOL", 1)
    const one = put(s, "p1", VANILLA, 1)
    const two = put(s, "p1", SYMBOL2, 1)
    assert(activeConstraints(s, "p1", one).some((c) => c.type === "mustAttack"), "シンボル1のスピリットには付与される")
    assert(!activeConstraints(s, "p1", two).some((c) => c.type === "mustAttack"), "シンボル2のスピリットには付与されない")
}

console.log("=== 4. timedEffect(immune).against：相手のスピリットの効果だけ止め、マジックは通す ===")
{
    const s = game("case4")
    const target = put(s, "p2", VANILLA, 1)
    giveTimed(s, target, { type: "immune", against: ["spirit"] }, "turn", "p2")
    const blockedSpirit = boardResistanceAgainst(s, "p2", target, { op: "destroy", scope: "targeted", actorPid: "p1", sourceType: "spirit" })
    const passedMagic = boardResistanceAgainst(s, "p2", target, { op: "destroy", scope: "targeted", actorPid: "p1", sourceType: "magic" })
    assert(blockedSpirit !== null, "against:['spirit']は相手のスピリットの効果を止める")
    assert(passedMagic === null, "against:['spirit']は相手のマジックの効果を止めない")
}

console.log("=== 5. timedEffect(immune)：against省略時の既存挙動は変わらない（全面免疫） ===")
{
    const s = game("case5")
    const target = put(s, "p2", VANILLA, 1)
    giveTimed(s, target, { type: "immune" }, "turn", "p2")
    const blockedSpirit = boardResistanceAgainst(s, "p2", target, { op: "destroy", scope: "targeted", actorPid: "p1", sourceType: "spirit" })
    const blockedMagic = boardResistanceAgainst(s, "p2", target, { op: "destroy", scope: "targeted", actorPid: "p1", sourceType: "magic" })
    assert(blockedSpirit !== null, "against省略時は相手のスピリットの効果も止める")
    assert(blockedMagic !== null, "against省略時は相手のマジックの効果も止める（従来どおり）")
}

console.log("すべてのチェックに合格しました 🎉（part443）")
