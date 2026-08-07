// smoke パート109（BS05-X17 幻獣王リーン Lv3：効果を持つスピリットからブロックされない）
//
// このカードは効果テキストが3ブロック（【転召】/ Lv1-3 召喚時 / Lv3 アタック時）あるのに
// effects[] が2件しかなく、【転召】が見出しとして数えられないせいでブロック数チェックにも
// 引っかかっていなかった。check-effect-gaps.ts の「対象レベルの不一致」検査で発見した実装漏れ。
//
// 新設した機構:
//   - ConstraintDef.unblockableBy の nonVanilla（カードに効果の記述を持つスピリットにブロックされない）
//   - ConstraintDef.unblockableBy の requireOwnCostCountAtLeast（持ち主の場に指定コストがN体以上いる間だけ有効）
import { assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { canBlock } from "../../shared/block"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS05-X17").name === "幻獣王リーン", "BS05-X17 は幻獣王リーン")
    assert(getCard("BS01-001").effect === "", "BS01-001 ゴラドンは効果の記述を持たない（バニラ）")
    assert(getCard("BS01-004").effect !== "", "BS01-004 ドラグノ偵察兵は効果の記述を持つ")
    assert(getCard("BS01-077").cost === 2, "BS01-077 ベビー・ロキはコスト2")
}

console.log("=== BS05-X17 Lv3：コスト2が3体以上いる間、効果を持つスピリットからブロックされない ===")
{
    const s = createGame("bs05-x17-unblockable", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    const lean = putSpirit(s, "p1", "BS05-X17", 4) // Lv3（コア4）
    // 条件：自分のコスト2のスピリットが3体以上
    putSpirit(s, "p1", "BS01-077", 1)
    putSpirit(s, "p1", "BS01-077", 1)
    putSpirit(s, "p1", "BS01-077", 1)
    const effectful = putSpirit(s, "p2", "BS01-004", 1) // 効果の記述を持つ
    const vanilla = putSpirit(s, "p2", "BS01-001", 1) // 効果の記述を持たない

    assert(
        canBlock(s, "p2", effectful, "p1", lean) !== null,
        "効果を持つスピリットはブロックできない",
    )
    assert(
        canBlock(s, "p2", vanilla, "p1", lean) === null,
        "バニラのスピリットはブロックできる",
    )
}

console.log("=== BS05-X17 Lv3：コスト2が2体以下なら制約は効かない ===")
{
    const s = createGame("bs05-x17-cond", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    const lean = putSpirit(s, "p1", "BS05-X17", 4) // Lv3
    putSpirit(s, "p1", "BS01-077", 1)
    putSpirit(s, "p1", "BS01-077", 1) // コスト2は2体だけ
    const effectful = putSpirit(s, "p2", "BS01-004", 1)
    assert(
        canBlock(s, "p2", effectful, "p1", lean) === null,
        "コスト2が3体未満なら効果を持つスピリットもブロックできる",
    )
}

console.log("=== BS05-X17 Lv2以下では発揮されない（levels:[3]） ===")
{
    const s = createGame("bs05-x17-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    const lean = putSpirit(s, "p1", "BS05-X17", 2) // Lv2（コア2）
    putSpirit(s, "p1", "BS01-077", 1)
    putSpirit(s, "p1", "BS01-077", 1)
    putSpirit(s, "p1", "BS01-077", 1)
    const effectful = putSpirit(s, "p2", "BS01-004", 1)
    assert(
        canBlock(s, "p2", effectful, "p1", lean) === null,
        "Lv2ではブロックされない効果を持たない",
    )
}
