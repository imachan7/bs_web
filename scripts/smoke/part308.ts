// smoke パート308（バースト基盤。docs/design/BURST.md）
// **相手のバーストが viewFor で漏れないこと**を最優先で固定する。あわせてセットの検証
// （メインステップ限定・ターン1回・バースト効果を持たないカードの拒否）と、
// ターン終了でのターン1回制限のリセットを見る。
// ※ バーストの「発動」経路は SD06 の実カードを使う part309 が担当する（ここは器だけ）。
import {
    assert,
    createGame,
    endTurn,
    getCard,
    handleAction,
    runTurnStart,
    viewFor,
} from "./helpers"
import type { GameState } from "./helpers"
import { placeBurst } from "../../server/src/logic/EffectModules"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

// バースト効果を持たないカード（セット拒否の検証用）。ID のズレ検出も兼ねる
const NO_BURST = "BS01-001"

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard(NO_BURST).effects.every((e) => e.kind !== "burst"), `${NO_BURST}はバースト効果を持たない`)
}

console.log("=== 相手のバーストは viewFor で必ず伏せられる（最優先） ===")
{
    const s = game("burst-mask")
    placeBurst(s, "p1", NO_BURST)

    const own = viewFor(s, "p1")
    assert(own.players.p1.burst === NO_BURST, "自分のバーストの中身は自分には見える")
    assert(own.players.p1.burstSet === true, "セット済みフラグは自分から見える")

    const opp = viewFor(s, "p2")
    assert(opp.players.p1.burst === null, "相手のバーストの中身は必ず null")
    assert(opp.players.p1.burstSet === true, "セット済みか否かは公開情報なので相手にも見える")

    // 中身が別経路（ログ・events 等）から漏れていないかを、配信物まるごとで確認する
    assert(
        !JSON.stringify(opp).includes(NO_BURST),
        "相手へ配信する GameView のどこにもバーストのカードIDが含まれない",
    )
}

console.log("=== バーストをセットしていないときは burst が null・burstSet が false ===")
{
    const s = game("burst-empty")
    const v = viewFor(s, "p1")
    assert(v.players.p1.burst === null && v.players.p1.burstSet === false, "未セットなら両者とも空")
}

console.log("=== バースト効果を持たないカードはセットを拒否する（公式の敗北を拒否へ簡略化） ===")
{
    const s = game("burst-reject")
    s.players.p1.hand = [NO_BURST]
    const err = handleAction(s, "p1", { type: "setBurst", handIndex: 0 })
    assert(err !== null && err.includes("バースト効果"), "バースト効果を持たないカードは拒否される")
    assert(s.players.p1.burst === null, "拒否されたのでバーストエリアは空のまま")
    assert(s.players.p1.hand.length === 1, "拒否されたので手札も減らない")
}

console.log("=== セットはターンに1回まで。ターンが変われば戻る ===")
{
    const s = game("burst-once")
    s.players.p1.burstSetThisTurn = true
    s.players.p1.hand = [NO_BURST]
    const err = handleAction(s, "p1", { type: "setBurst", handIndex: 0 })
    assert(err !== null && err.includes("ターンに1回"), "同じターンの2回目のセットは拒否される")

    endTurn(s)
    // 直前の代入で true に絞られているので、読み直して比較する
    const resetDone = s.players.p1.burstSetThisTurn as boolean
    assert(resetDone === false, "ターン終了でターン1回制限はリセットされる")
}

console.log("=== セットし直すと、前にセットしていたカードはトラッシュへ置かれる ===")
{
    const s = game("burst-replace")
    placeBurst(s, "p1", NO_BURST)
    const second = "BS01-002"
    placeBurst(s, "p1", second)
    assert(s.players.p1.burst === second, "バーストエリアは後からセットしたカードになる")
    assert(s.players.p1.trashCards.includes(NO_BURST), "前のバーストはトラッシュへ置かれる")
}

console.log("すべてのチェックに合格しました 🎉（part308）")
