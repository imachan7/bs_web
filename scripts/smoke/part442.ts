// smoke パート442（BS17部品バッチ1：AuraCondition maxOwnSpirits／battleOpponentHasKeyword、AuraDef.levelFilter、globalConstraint cantBlockByCost）
import {
    assert,
    act,
    createGame,
    createInstance,
    declareBlock,
    effectiveBp,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { instCantBlockByCost } from "../../shared/rules"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ。Lv1=1コア/Lv2=2コア）
const COST3_VANILLA = "BS01-008" // メタルバーン（赤・コスト3・バニラ）
const HOST = "BS01-001" // ゴラドン（赤・コスト0・バニラ。効果を一時的に差し替える発生源専用。VANILLAと別cardIdにして二重発生源を避ける）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
    assert(getCard(COST3_VANILLA).name === "メタルバーン" && getCard(COST3_VANILLA).cost === 3, "COST3_VANILLAはコスト3のバニラ")
    assert(getCard(HOST).name === "ゴラドン" && getCard(HOST).cost === 0, "HOSTはコスト0のバニラ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
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

console.log("=== 1. AuraCondition.maxOwnSpirits：発生源含む自分のスピリット数がこの値以下の間だけBP上昇 ===")
{
    const s = game("p442-maxownspirits")
    const card = getCard(HOST)
    const savedEffects = card.effects
    const baseBp = 1000 // ゴラドンのLv1 BP
    try {
        card.effects = [...savedEffects, { id: "smoke442-maxown", kind: "aura", levels: null, aura: { type: "bp", target: "self", amount: 2000, condition: { maxOwnSpirits: 3 } } }] as typeof card.effects
        const host = put(s, "p1", HOST, 1)
        assert(effectiveBp(s, "p1", host) === baseBp + 2000, "自分のスピリット1体（3体以下）ではBP+2000が乗る")
        put(s, "p1", VANILLA, 1)
        put(s, "p1", VANILLA, 1)
        assert(effectiveBp(s, "p1", host) === baseBp + 2000, "自分のスピリット3体（発生源含む。3体以下）でもBP+2000が乗る")
        put(s, "p1", VANILLA, 1)
        assert(effectiveBp(s, "p1", host) === baseBp, "自分のスピリット4体（3体超）ではBP+2000が乗らない")
    } finally {
        card.effects = savedEffects
    }
}

console.log("=== 2. AuraCondition.battleOpponentHasKeyword：バトル中の相手側当事者がキーワードを持つ間だけBP上昇 ===")
{
    const s = game("p442-battleopp")
    const card = getCard(VANILLA)
    const savedEffects = card.effects
    try {
        card.effects = [...savedEffects, { id: "smoke442-battleopp", kind: "aura", levels: null, aura: { type: "bp", target: "ownAll", battlingOnly: true, amount: 3000, condition: { battleOpponentHasKeyword: ["armor", "heavyArmor"] } } }] as typeof card.effects
        const attacker = put(s, "p1", VANILLA, 1)
        const blocker = put(s, "p2", VANILLA, 1)
        const baseBp = effectiveBp(s, "p1", attacker)
        s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: blocker.instanceId, directed: false }
        assert(effectiveBp(s, "p1", attacker) === baseBp, "相手側当事者が【装甲】/【重装甲】を持たない間はBP+3000が乗らない")
        // attacker/blockerは同じcardId（VANILLA）を使っているため、effects の再代入は両方に効く。
        // battleOpponentHasKeywordは相手側当事者だけを見るので、自分側にも装甲が付いても判定には影響しない
        card.effects = [...savedEffects, { id: "smoke442-battleopp", kind: "aura", levels: null, aura: { type: "bp", target: "ownAll", battlingOnly: true, amount: 3000, condition: { battleOpponentHasKeyword: ["armor", "heavyArmor"] } } }, { id: "smoke442-armor", kind: "keyword", keyword: "armor", levels: null }] as typeof card.effects
        assert(effectiveBp(s, "p1", attacker) === baseBp + 3000, "相手側当事者が【装甲】を持つ間はBP+3000が乗る")
    } finally {
        card.effects = savedEffects
    }
}

console.log("=== 3. AuraDef.levelFilter：ownAll対象の現在Lvが配列に含まれる間だけBP上昇 ===")
{
    const s = game("p442-levelfilter")
    const card = getCard(HOST)
    const savedEffects = card.effects
    try {
        card.effects = [...savedEffects, { id: "smoke442-lvfilter", kind: "aura", levels: null, aura: { type: "bp", target: "ownAll", amount: 2000, levelFilter: [1] } }] as typeof card.effects
        put(s, "p1", HOST, 1) // 発生源。levelFilterに関わらずownAllなので自分自身もLv1なら対象になるが、ここでは検証しない
        const lv1 = put(s, "p1", VANILLA, 1)
        const lv2 = put(s, "p1", VANILLA, 2)
        assert(lv1.cores === 1 && lv2.cores === 2, "前提：lv1は1コア、lv2は2コア")
        const baseLv1 = 1000
        const baseLv2 = 3000
        assert(effectiveBp(s, "p1", lv1) === baseLv1 + 2000, "Lv1のスピリットにはBP+2000が乗る")
        assert(effectiveBp(s, "p1", lv2) === baseLv2, "Lv2のスピリットにはBP+2000が乗らない（levelFilterに1しか無い）")
    } finally {
        card.effects = savedEffects
    }
}

console.log("=== 4. globalConstraint cantBlockByCost：コストが一致するスピリットはブロックできない（アタックは可能） ===")
{
    const s = game("p442-cantblockbycost")
    const card = getCard(VANILLA)
    const savedEffects = card.effects
    try {
        card.effects = [...savedEffects, { id: "smoke442-cantblock", kind: "globalConstraint", levels: null, constraint: { type: "cantBlockByCost", costs: [3] } }] as typeof card.effects
        const attacker = put(s, "p1", VANILLA, 1) // VANILLA自身がglobalConstraintの発生源も兼ねる
        const blocker3 = put(s, "p2", COST3_VANILLA, 1)
        const blocker1 = put(s, "p2", VANILLA, 1)
        assert(instCantBlockByCost(s, blocker3) === true, "コスト3のスピリットはinstCantBlockByCostでブロック不可と判定される")
        assert(instCantBlockByCost(s, blocker1) === false, "コスト1のスピリットはinstCantBlockByCostの対象外")
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言（cantBlockByCostはアタックを止めない）")
        assert(declareBlock(s, "p2", blocker3.instanceId) !== null, "コスト3のスピリットはサーバー側でもブロック宣言が拒否される")
        assert(declareBlock(s, "p2", blocker1.instanceId) === null, "コスト1のスピリットは通常どおりブロックできる")
    } finally {
        card.effects = savedEffects
    }
}

console.log("すべてのチェックに合格しました 🎉（part442）")
