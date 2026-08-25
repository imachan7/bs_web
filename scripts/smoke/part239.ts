// smoke パート239（BS10 で新しく要る3つの仕組み。2026-08-25 ユーザー確認）
//
//   §A 【超覚醒】       ＝【覚醒】＋「コアを置いたとき回復する」。**別枠のキーワード**だが
//                        「【覚醒】を持つ〜」の参照には引っかかる
//   §B コアを取り除けない ＝ 効果でもプレイヤー操作でも取り除けない（お互い）
//   §C Lvの相対シフト     ＝「Lvを1つ上のものとして扱う」。最高Lvで頭打ち
//
// 対象カード（BS10-X01 幻羅星龍ガイ・アスラ／BS10-094 未完成の古代戦艦：竜骨）は
// まだ data/cards に入っていないので、テスト用の合成カードで確かめる。
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { CARD_DB } from "../../server/src/logic/GameState"
import { validateMoveCore, validateAwaken } from "../../server/src/logic/RuleValidator"
import { boardResistanceAgainst, canAwaken, coresCantBeRemoved, currentLevel, spiritHasKeyword } from "../../shared/rules"
import type { CardData } from "../../server/src/type"

const BASE_SPIRIT = "BS01-001" // ゴラドン（赤・コスト0・Lv1=1コア/Lv2=3コア）
const baseCard = getCard(BASE_SPIRIT)

function make(cardId: string, over: Partial<CardData>): string {
    CARD_DB.set(cardId, { ...baseCard, cardId, name: `テスト${cardId}`, effects: [], ...over } as never)
    return cardId
}
function game(): GameState {
    const s = createGame("bs10-mechanisms", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== §A 【超覚醒】は別枠。ただし【覚醒】の参照には引っかかる ===")
{
    const SUPER = make("TEST-SUPERAWAKEN", {
        effects: [{ id: "TEST-SUPERAWAKEN-e1", kind: "keyword", keyword: "superAwaken", levels: null }],
    })
    const PLAIN = make("TEST-AWAKEN", {
        effects: [{ id: "TEST-AWAKEN-e1", kind: "keyword", keyword: "awaken", levels: null }],
    })
    const s = game()
    const sup = put(s, "p1", SUPER, 1)
    const plain = put(s, "p1", PLAIN, 1)

    assert(spiritHasKeyword(s, "p1", sup, "superAwaken"), "超覚醒持ちは【超覚醒】を持つ")
    assert(spiritHasKeyword(s, "p1", sup, "awaken"), "超覚醒持ちは【覚醒】の参照にも引っかかる（包含）")
    assert(!spiritHasKeyword(s, "p1", plain, "superAwaken"), "覚醒だけの個体は【超覚醒】には引っかからない（逆向きは効かない）")
    assert(canAwaken(s, "p1", sup), "超覚醒持ちはコアを集められる")

    // 疲労していても、コアを置いたときに回復する（これが【覚醒】との唯一の違い）
    const donor = put(s, "p1", BASE_SPIRIT, 3)
    sup.isRested = true
    s.isFlashTiming = true
    assert(act(s, "p1", { type: "awaken", instanceId: sup.instanceId, fromInstanceId: donor.instanceId, count: 1 }) === null,
        "超覚醒でコアを移せる")
    assert(!sup.isRested, "【超覚醒】はコアを置いたときに回復する")

    // 【覚醒】だけの個体は回復しない
    const s2 = game()
    const p = put(s2, "p1", PLAIN, 1)
    const donor2 = put(s2, "p1", BASE_SPIRIT, 3)
    p.isRested = true
    s2.isFlashTiming = true
    assert(act(s2, "p1", { type: "awaken", instanceId: p.instanceId, fromInstanceId: donor2.instanceId, count: 1 }) === null,
        "覚醒でコアを移せる")
    assert(p.isRested, "【覚醒】だけなら疲労したまま")
}

console.log("=== §B コアを取り除けない（効果でもプレイヤー操作でも。お互い） ===")
{
    const LOCKED = make("TEST-CORELOCK", {
        effects: [{ id: "TEST-CORELOCK-e1", kind: "constraint", levels: null, constraint: { type: "coresCantBeRemoved" } }],
    })
    const s = game()
    const locked = put(s, "p1", LOCKED, 3)
    const normal = put(s, "p1", BASE_SPIRIT, 3)
    assert(coresCantBeRemoved(s, "p1", locked), "コアロックが効いている")
    assert(!coresCantBeRemoved(s, "p1", normal), "普通のスピリットは効いていない")

    // ① 効果による取り除き（**相手の効果も自分の効果も**止まる）
    const attempt = (actorPid: PlayerId) =>
        boardResistanceAgainst(s, "p1", locked, { op: "coreRemove", scope: "targeted", actorPid, sourceType: "spirit" })
    assert(attempt("p2")?.category === "coresLocked", "相手の効果ではコアを取り除けない")
    assert(attempt("p1")?.category === "coresLocked", "**自分の効果でも**取り除けない（お互い、なので）")
    // 他の操作は止めない
    const destroyTry = boardResistanceAgainst(s, "p1", locked, { op: "destroy", scope: "targeted", actorPid: "p2", sourceType: "spirit" })
    assert(destroyTry === null, "コアの取り除き以外（破壊）は止めない")

    // ② プレイヤーによる手動のコア移動
    assert(validateMoveCore(s, "p1", locked.instanceId, "remove") !== null, "手動でもコアを取り除けない")
    assert(validateMoveCore(s, "p1", locked.instanceId, "add") === null, "置く方向は通る")
    assert(validateMoveCore(s, "p1", normal.instanceId, "remove") === null, "普通のスピリットは取り除ける")

    // ③ 【覚醒】の移動元にもできない
    const SUPER = "TEST-SUPERAWAKEN"
    const sup = put(s, "p1", SUPER, 1)
    s.isFlashTiming = true
    assert(validateAwaken(s, "p1", sup.instanceId, locked.instanceId, 1) !== null, "【覚醒】の移動元にもできない")
    assert(validateAwaken(s, "p1", sup.instanceId, normal.instanceId, 1) === null, "普通のスピリットからは移せる")
}

console.log("=== §C Lvの相対シフト（「Lvを1つ上のものとして扱う」。最高Lvで頭打ち） ===")
{
    // 自分自身のLvを1つ上として扱うテスト用スピリット
    const SHIFT = make("TEST-LEVELSHIFT", {
        effects: [{ id: "TEST-LEVELSHIFT-e1", kind: "levelAs", levels: null, target: "self", treatAs: { plus: 1 } }],
    })
    const s = game()
    const lv1 = put(s, "p1", SHIFT, 1) // コア1個 → 本来 Lv1
    assert(currentLevel(lv1).level === 2, "Lv1の個体は1つ上のLv2として扱われる")
    assert(currentLevel(lv1).bp === baseCard.levels[1]!.bp, "BPもLv2のものになる")

    const lv2 = put(s, "p1", SHIFT, 3) // コア3個 → 本来 Lv2（このカードの最高Lv）
    refreshLevelAsOverrides(s)
    const maxLevel = baseCard.levels.reduce((m, l) => Math.max(m, l.level), 0)
    assert(currentLevel(lv2).level === maxLevel,
        `最高Lv（Lv${maxLevel}）の個体は頭打ち＝そのまま（レベル表に無い値を入れると置き換えが無言で消えるため）`)
}
