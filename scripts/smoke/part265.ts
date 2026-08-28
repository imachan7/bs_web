// smoke パート265（BS10部分実装3枚の残り節：080炎の結晶石Lv2／X01幻羅星龍ガイ・アスラLv4／
// 108ルナティックシールのトラッシュ耐性。2026-08-29）
//
// 新設した機構:
//   - TargetFilter.maxLv1BpOfSelf（server/src/logic/actions/filter.ts）：selfのカードのLv1BP以下
//     （fieldEventではselfにイベント対象＝召喚されたスピリットが入る。実効BPでなく印刷値）
//   - action:"battleOpponentDestroyedCoresToVoid"（server/src/logic/actions/battleFlow.ts）：
//     state.battle.opponentDestroyedCoresToVoidPidを立て、commitPendingDestruction（removal.ts）が
//     このバトルが終わるまで相手のスピリットのコアをリザーブでなくボイドへ送る
//   - EffectDef kind:"trashImmunity" + isTrashCardProtected（shared/rules.ts）：
//     トラッシュにある間、このカード自身が一切の効果を受けない共通述語。
//     recoverSpiritFromTrash/recoverMagicFromTrash/recoverNexusFromTrash/castMagicFromTrashByColor/
//     recoverAllMagicFromTrashByColorChoice/summonFromTrashFree/trashSpiritsToDeckBottomの
//     候補フィルタから1つずつ呼ぶ
//
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・コストを機械検証してから使う。
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { isTrashCardProtected } from "../../shared/rules"

function base(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS10-080").name === "炎の結晶石" && getCard("BS10-080").type === "nexus", "BS10-080は炎の結晶石（ネクサス）")
    assert(getCard("BS10-X01").name === "幻羅星龍ガイ・アスラ" && getCard("BS10-X01").type === "spirit", "BS10-X01は幻羅星龍ガイ・アスラ（スピリット）")
    assert(getCard("BS10-108").name === "ルナティックシール" && getCard("BS10-108").type === "magic", "BS10-108はルナティックシール（マジック）")
    assert(getCard("BS01-001").name === "ゴラドン" && getCard("BS01-001").effect === "" && getCard("BS01-001").levels[0]!.bp === 1000, "BS01-001はゴラドン（バニラ・Lv1BP1000）")
    assert(getCard("BS01-002").name === "ロクケラトプス" && getCard("BS01-002").levels[0]!.bp === 1000, "BS01-002はロクケラトプス（Lv1BP1000＝境界ちょうど）")
    assert(getCard("BS01-004").name === "ドラグノ偵察兵" && getCard("BS01-004").levels[0]!.bp === 2000, "BS01-004はドラグノ偵察兵（Lv1BP2000＝境界より上）")
    assert(
        getCard("BS01-003").name === "テラノセイバー" && getCard("BS01-003").effect !== "" && getCard("BS01-003").levels[0]!.bp === 4000,
        "BS01-003はテラノセイバー（効果持ち・Lv1BP4000）",
    )
    assert(getCard("BS02-072").name === "トリックスター", "BS02-072はトリックスター（召喚時recoverMagicFromTrash）")
    assert(getCard("BS01-114").name === "バスタースピア" && getCard("BS01-114").type === "magic", "BS01-114はバスタースピア（マジック）")
}

console.log("=== BS10-080 炎の結晶石 Lv2：バニラの自分のスピリット召喚時、そのLv1BP以下の相手を破壊（境界ちょうど） ===")
{
    const s = base("crystal-080-boundary", false)
    const nexus = createInstance("BS10-080", s.turn, getCard("BS10-080").levels[1]!.cores) // Lv2
    s.players.p1.field.nexuses.push(nexus)
    // 相手：Lv1BPちょうど1000（ゴラドンのLv1BPと一致）→ 破壊される
    s.players.p2.field.spirits.push(createInstance("BS01-002", s.turn, getCard("BS01-002").levels[0]!.cores))
    s.players.p1.hand[0] = "BS01-001" // ゴラドン：バニラ・Lv1BP1000

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ゴラドン（バニラ）を召喚できる")
    assert(s.players.p2.field.spirits.length === 0, "相手のLv1BPちょうど（1000）のスピリットは破壊される")
}

console.log("=== BS10-080：Lv1BPが1000上回る相手は対象外（境界の外） ===")
{
    const s = base("crystal-080-above", false)
    const nexus = createInstance("BS10-080", s.turn, getCard("BS10-080").levels[1]!.cores) // Lv2
    s.players.p1.field.nexuses.push(nexus)
    // 相手：Lv1BP2000（ゴラドンのLv1BP1000より1000上）→ 破壊されない
    s.players.p2.field.spirits.push(createInstance("BS01-004", s.turn, getCard("BS01-004").levels[0]!.cores))
    s.players.p1.hand[0] = "BS01-001"

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ゴラドン（バニラ）を召喚できる")
    assert(s.players.p2.field.spirits.length === 1, "Lv1BPが1000上回る相手のスピリットは破壊されない")
}

console.log("=== BS10-080：効果を持つ（バニラでない）スピリットを召喚しても発揮しない ===")
{
    // ⚠️ 「効果の記述を持たない」の絞り込み（vanillaOnly）が効いているかは、**バニラでない側**を
    // 召喚して初めて検査になる。バニラだけ試していると、絞り込みを外しても通ってしまう（2026-08-29）
    const s = base("crystal-080-nonvanilla", false)
    const nexus = createInstance("BS10-080", s.turn, getCard("BS10-080").levels[1]!.cores) // Lv2
    s.players.p1.field.nexuses.push(nexus)
    // 相手：Lv1BP1000（テラノセイバーのLv1BP4000以下なので、絞り込みが無ければ破壊されてしまう）
    s.players.p2.field.spirits.push(createInstance("BS01-002", s.turn, getCard("BS01-002").levels[0]!.cores))
    s.players.p1.hand[0] = "BS01-003" // テラノセイバー：効果を持つ・Lv1BP4000

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "テラノセイバー（効果持ち）を召喚できる")
    assert(s.players.p2.field.spirits.length === 1, "効果を持つスピリットの召喚では発揮しない")
}

console.log("=== BS10-X01 幻羅星龍ガイ・アスラ Lv4：アタック時、このバトルの間、破壊した相手のコアはボイドへ（自分は対象外） ===")
{
    const s = base("x01-void", false)
    const guy = createInstance("BS10-X01", s.turn, getCard("BS10-X01").levels[3]!.cores) // Lv4
    s.players.p1.field.spirits.push(guy)

    // 巻き添えの自分のスピリット（このバトルに無関係）：コアはリザーブのまま戻るはず
    const bystander = createInstance("BS01-004", s.turn, getCard("BS01-004").levels[0]!.cores)
    bystander.cores = 3
    s.players.p1.field.spirits.push(bystander)
    const p1ReserveBefore = s.players.p1.reserve
    const p1TrashCoresBefore = s.players.p1.trashCores

    // 相手のブロッカー：BPで敗れて破壊され、コアはボイドへ置かれるはず
    const blocker = createInstance("BS01-002", s.turn, getCard("BS01-002").levels[0]!.cores)
    blocker.cores = 2
    s.players.p2.field.spirits.push(blocker)
    const p2ReserveBefore = s.players.p2.reserve
    const p2TrashCoresBefore = s.players.p2.trashCores

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: guy.instanceId }) === null, "ガイ・アスラでアタック宣言")
    assert(s.battle?.opponentDestroyedCoresToVoidPid === "p2", "アタック時に「相手のスピリットのコアはボイドへ」のフラグが立つ")

    // 巻き添え：フラグが立っている間でも、自分のスピリットの破壊は通常どおりリザーブへ
    assert(destroySpirit(s, "p1", bystander.instanceId) === true, "巻き添えの自分のスピリットを破壊")
    assert(s.players.p1.reserve === p1ReserveBefore + 3, "自分のスピリットのコアは通常どおりリザーブへ戻る")
    assert(s.players.p1.trashCores === p1TrashCoresBefore, "自分のスピリットのコアはボイドへ行かない（相手専用のフラグ）")

    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手がブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === blocker.instanceId), "BPで敗れたブロッカーは破壊される")
    assert(s.players.p2.reserve === p2ReserveBefore, "破壊された相手のスピリットのコアはリザーブへ戻らない")
    assert(s.players.p2.trashCores === p2TrashCoresBefore + 2, "破壊された相手のスピリットのコアはボイドに置かれる")
}

console.log("=== BS10-108 ルナティックシール：トラッシュにある間は一切の効果を受けない（自分の効果からも） ===")
{
    assert(isTrashCardProtected("BS10-108") === true, "isTrashCardProtectedはBS10-108を保護対象と判定する")
    assert(isTrashCardProtected("BS01-114") === false, "通常のマジックカードは保護対象ではない")

    const s = base("lunatic-seal", false)
    s.players.p1.trashCards.push("BS10-108") // トラッシュには回収候補がこれ1枚だけ
    s.players.p1.hand[0] = "BS02-072" // トリックスター：コスト6・召喚時recoverMagicFromTrash

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "トリックスターを召喚できる")
    assert(s.pendingChoice === null, "候補が0件のためpendingChoiceは立たない（BS10-108は候補から除外される）")
    assert(s.players.p1.trashCards.includes("BS10-108"), "ルナティックシールはトラッシュに残ったまま")
    assert(!s.players.p1.hand.includes("BS10-108"), "ルナティックシールは自分の効果でも手札に来ない")
}

console.log("すべてのチェックに合格しました 🎉（part265）")
