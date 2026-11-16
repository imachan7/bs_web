// smoke パート964（BS12-X02 魔羯邪神シュタイン・ボルグ Lv2・Lv3 の coresToOpponentReserveGoToTrash と、BS19-017 大蛇サイドロン Lv2 の【強化】）
// Q765：リザーブへ置くコアが相手のトラッシュへ振り替わるときは、【強化】の+1を乗せない。
import {
    act,
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const STEINBORG = "BS12-X02" // 魔羯邪神シュタイン・ボルグ（系統「光導」「冥主」。Lv2・Lv3 で相手のリザーブ行きのコアをトラッシュへ）
const SIDOLON = "BS19-017" // 大蛇サイドロン（Lv2 で【強化】：コアを取り除く効果でリザーブに置くコアが+1）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ。相手のスピリット役）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(STEINBORG).name === "魔羯邪神シュタイン・ボルグ" && getCard(STEINBORG).type === "spirit", "STEINBORGはスピリット")
    assert(getCard(SIDOLON).name === "大蛇サイドロン" && getCard(SIDOLON).type === "spirit", "SIDOLONはスピリット")
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).cost === 1, "ROKUはコスト1のバニラ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p2.deck = Array.from({ length: 40 }, () => ROKU)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn - 1, cores) // 1ターン前に出ていたことにして、アタックの召喚酔いを避ける
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== A. シュタイン・ボルグ Lv2（行き先がトラッシュに変わる）：【強化】の+1は乗らない ===")
{
    const s = game("kyoka-trash-lv2")
    const stein = put(s, "p1", STEINBORG, 3) // cores3＝Lv2（levels cores[1,3,6]）
    put(s, "p1", SIDOLON, 3) // cores3＝Lv2で【強化】（coreRemove）が有効
    const target = put(s, "p2", ROKU, 5)
    const reserveBefore = s.players.p2.reserve
    const trashBefore = s.players.p2.trashCores
    assert(act(s, "p1", { type: "attack", instanceId: stein.instanceId }) === null, "シュタイン・ボルグでアタック")
    // 除去の結果はライフで受ける前に見る（ライフで受けると、攻撃の効果と無関係にリザーブへ1個増える。素のアタックでも起きる）
    assert(target.cores === 4, "相手のスピリットのコアは1個だけ減る（+1されない）")
    assert(s.players.p2.trashCores === trashBefore + 1, "減ったコア1個が相手のトラッシュに置かれた")
    assert(s.players.p2.reserve === reserveBefore, "相手のリザーブは増えていない")
    assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
}

console.log("=== B. 対照：シュタイン・ボルグ Lv1（行き先変更なし）：【強化】の+1が乗り、2個ともリザーブへ ===")
{
    const s = game("kyoka-reserve-lv1")
    const stein = put(s, "p1", STEINBORG, 1) // cores1＝Lv1（constraintは Lv2・Lv3 のみ）
    put(s, "p1", SIDOLON, 3)
    const target = put(s, "p2", ROKU, 5)
    const reserveBefore = s.players.p2.reserve
    const trashBefore = s.players.p2.trashCores
    assert(act(s, "p1", { type: "attack", instanceId: stein.instanceId }) === null, "シュタイン・ボルグ Lv1 でアタック")
    assert(target.cores === 3, "相手のスピリットのコアは2個減る（【強化】で+1）")
    assert(s.players.p2.reserve === reserveBefore + 2, "減ったコア2個が相手のリザーブに置かれた")
    assert(s.players.p2.trashCores === trashBefore, "相手のトラッシュは増えていない")
    assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
}

console.log("すべてのチェックに合格しました 🎉（part964）")
