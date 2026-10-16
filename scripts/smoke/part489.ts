// smoke パート489(ソウルコア段1: 状態ポインタ・初期内訳・ビュー配信・不変条件)
// 仕様(docs/design/SOULCORE.md・2026-10-05 ユーザー確定):
//   - 案A-outside: ソウルコアはコアの数値に含めない。PlayerState.soulCore は居場所ポインタのみ
//   - 開始時リザーブは「通常3＋ソウル1」(INITIAL_RESERVE=3)。zone:"instance" はinstanceIdで特定
//   - 公開情報なので viewFor は両者分をそのまま配信する
//   - smoke の createGame は旧プール互換(ソウルなし・通常4)に戻す。ソウルコアを試すテストは enableSoulCore で戻す
import {
    act,
    assert,
    assertSoulCoreConsistent,
    createGame,
    createInstance,
    enableSoulCore,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import { createGame as engineCreateGame, viewFor } from "../../server/src/logic/GameState"
import { moveSoulCore, soulCoreInReserve, soulCoreInTrash, soulCoreOnInstance } from "../../server/src/logic/soulCore"

const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 1. エンジンの初期状態: 旧カードの対戦ではソウルコアなし・通常4（2026-10-15 ユーザー決定） ===")
{
    const s = engineCreateGame("soulcore-init" as never, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    assert(s.players.p1.reserve === 4, `初期リザーブは通常4（実際は${String(s.players.p1.reserve)}）`)
    assert(s.players.p1.soulCore === null && s.players.p2.soulCore === null, "ソウルコアは無効(null)")
    assert(!soulCoreInReserve(s.players.p1) && !soulCoreInTrash(s.players.p1), "soulCoreInReserve / soulCoreInTrash は false")
    assert(assertSoulCoreConsistent(s) === null, "不変条件: 初期状態は健全")
}

console.log("=== 2. smokeのcreateGameは旧プール互換（ソウルなし・通常4） ===")
{
    const s = createGame("soulcore-legacy", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    assert(s.players.p1.reserve === 4, `旧構成の初期リザーブは4（実際は${String(s.players.p1.reserve)}）`)
    assert(s.players.p1.soulCore === null && s.players.p2.soulCore === null, "smoke標準ではソウルコアなし(null)")
}

console.log("=== 3. enableSoulCore: ルール構成に戻す ===")
{
    const s = createGame("soulcore-enable", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    enableSoulCore(s)
    assert(s.players.p1.reserve === 4, "数値は4のまま（通常コアのうち1個が[ソウルコア]と見なされる）")
    assert(soulCoreInReserve(s.players.p1) && soulCoreInReserve(s.players.p2), "両者のソウルコアがリザーブに復帰")
    assert(assertSoulCoreConsistent(s) === null, "不変条件: enable直後は健全")
}

console.log("=== 4. 個体の上への移動と不変条件（ポインタは moveSoulCore だけが書き換える） ===")
{
    const s = createGame("soulcore-instance", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    enableSoulCore(s)
    runTurnStart(s)
    const inst = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    const reserveBeforeMove = s.players.p1.reserve
    moveSoulCore(s.players.p1, { zone: "instance", instanceId: inst.instanceId })
    assert(soulCoreOnInstance(s.players.p1, inst.instanceId), "soulCoreOnInstance は true")
    assert(!soulCoreInReserve(s.players.p1), "リザーブにはもういない")
    assert(inst.cores === 2, "cores は+1（[ソウルコア]もコアとして数値に入る・案B-inside）")
    assert(s.players.p1.reserve === reserveBeforeMove - 1, "reserve は-1（ソウルコアぶんがリザーブを離れた）")
    assert(assertSoulCoreConsistent(s) === null, "不変条件: 場にいる個体を指す分は健全")
    // 場から消えた個体を指したままの検査（不変条件がそれを弾くことの変異テスト）
    s.players.p1.field.spirits.splice(0, 1)
    const problem = assertSoulCoreConsistent(s)
    assert(problem !== null && problem.includes("場にいない個体"), "場を離れた個体を指すと不変条件が落ちる")
    moveSoulCore(s.players.p1, { zone: "reserve" })
    assert(assertSoulCoreConsistent(s) === null, "リザーブへ戻せば健全")
}

console.log("=== 5. viewFor はソウルコアの居場所を両者に配信する ===")
{
    const s = createGame("soulcore-view", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    enableSoulCore(s)
    const myView = viewFor(s, "p1")
    assert(myView.players.p1.soulCore !== null && myView.players.p1.soulCore.zone === "reserve", "自分のソウルコア居場所が見える")
    assert(myView.players.p2.soulCore !== null && myView.players.p2.soulCore.zone === "reserve", "相手のソウルコア居場所も見える（公開情報）")
}

console.log("=== 6. 通常のコア操作では[ソウルコア]は動かない＋数値とポインタの整合（案B-inside） ===")
{
    const s = createGame("soulcore-unmoved", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    enableSoulCore(s)
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    // 通常のmoveCore（＋）で置いたコアは通常コアで、ポインタはリザーブのまま
    const inst = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    const reserveBefore = s.players.p1.reserve
    assert(
        act(s, "p1", { type: "moveCore", instanceId: inst.instanceId, direction: "add" }) === null,
        "通常コアの移動は成功する",
    )
    assert(soulCoreInReserve(s.players.p1), "通常コアを置いても[ソウルコア]の居場所はリザーブのまま")
    assert(s.players.p1.reserve === reserveBefore - 1 && inst.cores === 2, "通常コアぶんの数値だけが動く")
    // 変異テスト: 案B-insideでは数値とポインタの整合を見る（リザーブが空なのにリザーブを指すと落ちる）
    s.players.p1.reserve = 0
    const problem = assertSoulCoreConsistent(s)
    assert(problem !== null && problem.includes("リザーブ"), "リザーブが空なのに[ソウルコア]がリザーブを指すと不変条件が落ちる")
    s.players.p1.reserve = 1
}

console.log("すべてのチェックに合格しました 🎉(part489)")
