// smoke パート1013（CardData.onlyUsableBy：プレイヤー名が一覧と一致するときだけ使える。docs/design/IMPORT_631_PLAN.md §0・§2 #1）
// staging のカードは data に無いので、既存カードにテストの中だけで欄を付ける
import { enumerateLegalMoves } from "../../server/src/ai/legalMoves"
import { act, assert, createGame, getCard } from "./helpers"
import type { GameState } from "./helpers"

const MAGIC = "BS01-118" // コールオブロスト（マジック）
const SPIRIT = "BS01-002" // ロクケラトプス（赤・コスト1）
const NEXUS = "BS01-098" // 燃えさかる戦場（赤・コスト3）
const BURST = "BS14-101" // 仁王壁（バースト持ち）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(MAGIC).name === "コールオブロスト" && getCard(MAGIC).type === "magic", "MAGICはマジック")
    assert(getCard(SPIRIT).name === "ロクケラトプス" && getCard(SPIRIT).type === "spirit", "SPIRITはスピリット")
    assert(getCard(NEXUS).name === "燃えさかる戦場" && getCard(NEXUS).type === "nexus", "NEXUSはネクサス")
    assert(getCard(BURST).name === "仁王壁" && getCard(BURST).effects.some((e) => e.kind === "burst"), "BURSTはバースト持ち")
}

function game(seed: string, names: string[]): GameState {
    const s = createGame(seed, { p1: "馬神 弾", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.hand = [SPIRIT, MAGIC, NEXUS, BURST]
    for (const id of [SPIRIT, MAGIC, NEXUS, BURST]) getCard(id).onlyUsableBy = names
    return s
}

function clear(): void {
    for (const id of [SPIRIT, MAGIC, NEXUS, BURST]) delete getCard(id).onlyUsableBy
}

const actions = [
    { label: "召喚", handIndex: 0, action: { type: "summon", handIndex: 0 } },
    { label: "マジック", handIndex: 1, action: { type: "castMagic", handIndex: 1 } },
    { label: "ネクサス", handIndex: 2, action: { type: "setNexus", handIndex: 2 } },
    { label: "バーストのセット", handIndex: 3, action: { type: "setBurst", handIndex: 3 } },
] as const

try {
    console.log("=== 1. 名前が一致する（空白の違いは同じ扱い）：すべて使える ===")
    for (const a of actions) {
        const s = game("only-ok-" + a.label, ["馬神弾"])
        const r = act(s, "p1", a.action as never)
        assert(r === null, `${a.label}ができる（結果: ${r}）`)
    }

    console.log("=== 2. 一致しない：拒否され、文言が出る ===")
    for (const a of actions) {
        const s = game("only-ng-" + a.label, ["暗黒戦士ボンバー"])
        const r = act(s, "p1", a.action as never)
        assert(r === "このカードは暗黒戦士ボンバーしか使えません", `${a.label}は拒否される（結果: ${r}）`)
    }

    console.log("=== 3. 一覧に複数名：どれでも使える ===")
    {
        const s = game("only-multi", ["ギャラクシー渡辺", "馬神ダン", "馬神　弾"])
        assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "全角空白を含む一覧の3件目と一致して召喚できる")
    }

    console.log("=== 4. 欄の無いカードは誰でも使える ===")
    {
        const s = game("only-none", [])
        assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "空の一覧は制限なし")
    }

    console.log("=== 5. AI の合法手に使えないカードの手が出ない ===")
    {
        const s = game("only-ai-ng", ["暗黒戦士ボンバー"])
        const moves = enumerateLegalMoves(s, "p1").map((m) => m.action)
        const used = moves.filter((m) => "handIndex" in m && m.handIndex !== undefined && m.handIndex <= 3)
        assert(used.length === 0, `手札の4枚を使う手が無い（${JSON.stringify(used).slice(0, 120)}）`)
        const ok = game("only-ai-ok", ["馬神弾"])
        const okMoves = enumerateLegalMoves(ok, "p1").map((m) => m.action)
        assert(okMoves.some((m) => m.type === "summon"), "一致するときは召喚の手が出る")
    }
} finally {
    clear()
}

console.log("すべてのチェックに合格しました 🎉（part1013）")
