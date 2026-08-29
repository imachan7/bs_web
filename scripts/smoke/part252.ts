// smoke パート252（BS10黄バッチ：ティン・ソルジャー／カラドリアス／シャボンの湖畔／時刻む花時計）
// 新設した機構:
//   - action "returnToDeckBottom"（returnToHandの単体版。相手スピリット1体を持ち主のデッキの下に戻す）
//   - fieldEvent "ownSpiritDestroyed" の vanillaOnly を実際にカードで使用（既存の軸）
//   - constraintGrant の costFilter / turn / combinedFilter（AuraDefの同名軸をconstraintGrantにも追加）
//   - ConstraintDef "immuneToOpponentEffects" の against:"spirit"（マジックは通す絞り込み）
//   - action "lifeImmuneThisTurn" ＋ TurnConstraintDef "lifeImmuneForPid"（あらゆる原因でライフが減らない全面ロック）
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    destroySpirit,
    getCard,
    resolveAction,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { activeConstraints, boardResistanceAgainst, instIsCombined } from "../../shared/rules"
import type { EffectAttempt } from "../../shared/rules"

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
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

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS10-041").name === "ティン・ソルジャー", "BS10-041 はティン・ソルジャー")
    assert(getCard("BS10-042").name === "カラドリアス", "BS10-042 はカラドリアス")
    assert(getCard("BS10-091").name === "シャボンの湖畔", "BS10-091 はシャボンの湖畔")
    assert(getCard("BS10-093").name === "時刻む花時計", "BS10-093 は時刻む花時計")
}

console.log("=== BS10-041 ティン・ソルジャー：バトルに勝ってもバトル終了時に自壊する ===")
{
    const s = base("tin-soldier")
    s.turnPlayer = "p1"
    s.phase = "attack"
    const tin = put(s, "p1", "BS10-041", 1) // Lv1 BP3000
    const goradon = put(s, "p2", "BS01-001", 1) // Lv1 BP1000
    assert(act(s, "p1", { type: "attack", instanceId: tin.instanceId }) === null, "ティン・ソルジャーでアタック")
    assert(declareBlock(s, "p2", goradon.instanceId) === null, "ゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(s.players.p2.field.spirits.length === 0, "BPで負けたゴラドンは破壊される")
    assert(s.players.p1.field.spirits.length === 0, "勝ったティン・ソルジャーもバトル終了時に自壊する")
    assert(s.players.p1.trashCards.includes("BS10-041"), "ティン・ソルジャーはトラッシュへ")
}

console.log("=== BS10-042 カラドリアス：Lv2破壊時、【強襲】を持つ相手のスピリット1体をデッキの下に戻す ===")
{
    const s = base("karadrias-destroy")
    const kara = put(s, "p1", "BS10-042", 2) // Lv2
    const kyoshu = put(s, "p2", "BS07-051", 4) // Lv2で【強襲】持ち
    const nonKyoshu = put(s, "p2", "BS01-001", 1) // 【強襲】を持たない
    s.players.p2.deck = ["BS01-002", "BS01-003"]
    destroySpirit(s, "p1", kara.instanceId, "destroy")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === kyoshu.instanceId),
        "【強襲】持ちはフィールドを離れる",
    )
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === nonKyoshu.instanceId),
        "【強襲】を持たない方はfilterで除外され残る",
    )
    assert(s.players.p2.deck[s.players.p2.deck.length - 1] === "BS07-051", "デッキの一番下に戻る")
}

console.log("=== BS10-091 シャボンの湖畔：効果の記述を持たない自分のスピリットが相手のアタックステップ中に破壊されたらドロー ===")
{
    const s = base("shabon-vanilla")
    putNexus(s, "p1", "BS10-091", 3) // Lv2
    const vanilla = put(s, "p1", "BS01-001", 1) // 効果の記述なし
    const withEffect = put(s, "p1", "BS10-042", 1) // 効果の記述あり（kobo）
    s.players.p1.deck = ["BS01-002", "BS01-003"]
    s.turnPlayer = "p2" // 相手のアタックステップ
    s.phase = "attack"
    const handBefore = s.players.p1.hand.length
    destroySpirit(s, "p1", vanilla.instanceId, "destroy")
    assert(s.players.p1.hand.length === handBefore + 1, "バニラの破壊で1枚ドロー")
    destroySpirit(s, "p1", withEffect.instanceId, "destroy")
    assert(s.players.p1.hand.length === handBefore + 1, "効果を持つスピリットの破壊ではドローしない（vanillaOnly）")
}

console.log(
    "=== BS10-091 シャボンの湖畔Lv2：自分のコスト2のスピリットは相手のターン中のみ相手のスピリットの効果を受けない（マジックは通る） ===",
)
{
    const s = base("shabon-immune")
    putNexus(s, "p1", "BS10-091", 3) // Lv2
    const target = put(s, "p1", "BS01-005", 1) // コスト2
    const spiritAttempt: EffectAttempt = {
        op: "destroy",
        scope: "targeted",
        actorPid: "p2",
        sourceType: "spirit",
        sourceColors: ["red"],
    }
    const magicAttempt: EffectAttempt = { ...spiritAttempt, sourceType: "magic" }
    s.turnPlayer = "p2" // 相手のターン
    assert(
        boardResistanceAgainst(s, "p1", target, spiritAttempt)?.category === "fullImmune",
        "相手のターン中、相手のスピリットの効果は受けない",
    )
    assert(
        boardResistanceAgainst(s, "p1", target, magicAttempt) === null,
        "against:spirit指定なので相手のマジックの効果は通る",
    )
    s.turnPlayer = "p1" // 自分のターンに戻すと turn:"opponent" を満たさない
    assert(
        boardResistanceAgainst(s, "p1", target, spiritAttempt) === null,
        "自分のターン中は効かない（turn限定）",
    )
}

console.log("=== BS10-093 時刻む花時計：相手の効果で自分の黄のスピリットが破壊されたら、このターンはあらゆる原因でライフが減らない ===")
{
    const s = base("hanadokei-immune")
    putNexus(s, "p1", "BS10-093", 2) // Lv2（e1はlevels[1,2]）
    const yellowSpirit = put(s, "p1", "BS10-041", 1)
    s.turnPlayer = "p2"
    s.phase = "attack"
    destroySpirit(s, "p1", yellowSpirit.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    assert(
        s.turnConstraints.some((c) => c.type === "lifeImmuneForPid" && c.pid === "p1"),
        "p1にlifeImmuneForPidが積まれる",
    )

    const attacker = put(s, "p2", "BS01-005", 1) // BP2000・シンボル1
    const lifeBefore = s.players.p1.life
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2でアタック")
    assert(takeLifeAndResolve(s, "p1") === null, "p1はライフで受ける")
    assert(s.players.p1.life === lifeBefore, "アタックによるライフダメージも受けない")

    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p2", null, { type: "lifeCrush", count: 1 }, undefined, undefined, "spirit")
    assert(s.players.p1.life === lifeBefore, "lifeCrushアクションでもライフは減らない")
    assert(s.players.p1.reserve === reserveBefore, "コアも動かない（不発）")
}

console.log(
    "=== BS10-093 時刻む花時計Lv2：自分の合体スピリットは、自分のアタックステップ中のみ相手のコスト5以下からブロックされない ===",
)
{
    const s = base("hanadokei-combined")
    putNexus(s, "p1", "BS10-093", 2) // Lv2
    const combined = put(s, "p1", "BS01-001", 1)
    const notCombined = put(s, "p1", "BS01-002", 1)
    combined.braveCombined = true
    assert(instIsCombined(combined), "braveCombinedフラグで合体スピリット扱いになる")
    s.turnPlayer = "p1"
    s.phase = "attack"
    assert(
        activeConstraints(s, "p1", combined).some((c) => c.type === "unblockableBy" && c.maxCost === 5),
        "合体スピリットには相手コスト5以下からブロックされない制約が付く",
    )
    assert(
        !activeConstraints(s, "p1", notCombined).some((c) => c.type === "unblockableBy"),
        "合体していないスピリットには付かない（combinedFilter）",
    )
    s.phase = "main"
    assert(
        !activeConstraints(s, "p1", combined).some((c) => c.type === "unblockableBy"),
        "自分のアタックステップ以外では付かない（phaseTurn限定）",
    )
}

console.log("すべてのチェックに合格しました 🎉（part252）")
