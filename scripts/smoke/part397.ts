// smoke パート397（removeCores from:["life"]：自分のライフのコアを置くことで〜する。COST_MODEL §9・PAY_UNIFY §4）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"

const KINGDOM = "BS14-084" // 永久凍土の王都
const BARRON = "BS13-039" // 神獣バーロン
const DARK_KNIGHT = "BS16-008" // ダークナイト・ドラゴン
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ。Lv1 BP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(KINGDOM).name === "永久凍土の王都" && getCard(KINGDOM).type === "nexus", "KINGDOMは永久凍土の王都")
    assert(getCard(BARRON).name === "神獣バーロン", "BARRONは神獣バーロン")
    assert(getCard(DARK_KNIGHT).name === "ダークナイト・ドラゴン", "DARK_KNIGHTはダークナイト・ドラゴン")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
}

function game(seed: string, life: number, withKingdom: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 0
    s.players.p1.life = life
    if (withKingdom) s.players.p1.field.nexuses.push(createInstance(KINGDOM, s.turn, 1))
    refreshLevelAsOverrides(s)
    return s
}

// カードデータの action をそのまま使う（書き方がずれたら検出できるように）
function cardPay(cardId: string): EffectAction {
    const e = getCard(cardId).effects.find((x) => "action" in x && (x as { action: EffectAction }).action.type === "pay")
    return (e as { action: EffectAction }).action
}

console.log("=== 1. 神獣バーロン：ライフのコア1個をリザーブに置いて回復する ===")
{
    const s = game("p397-1", 3, false)
    const self = createInstance(BARRON, s.turn, 3)
    self.isRested = true
    s.players.p1.field.spirits.push(self)
    resolveAction(s, "p1", self, cardPay(BARRON))
    assert(s.players.p1.life === 2 && s.players.p1.reserve === 1, "ライフ3→2、リザーブ+1")
    assert(!self.isRested, "回復した")
}

console.log("=== 2. 永久凍土の王都があると、ライフ1からは払えない（払わず回復もしない） ===")
{
    const s = game("p397-2", 1, true)
    const self = createInstance(BARRON, s.turn, 3)
    self.isRested = true
    s.players.p1.field.spirits.push(self)
    resolveAction(s, "p1", self, cardPay(BARRON))
    assert(s.players.p1.life === 1 && s.players.p1.reserve === 0, "ライフもリザーブも変わらない")
    assert(self.isRested, "回復しない")
}

console.log("=== 3. 王都が無ければライフ1からでも払え、0になれば敗北する ===")
{
    const s = game("p397-3", 1, false)
    const self = createInstance(BARRON, s.turn, 3)
    self.isRested = true
    s.players.p1.field.spirits.push(self)
    resolveAction(s, "p1", self, cardPay(BARRON))
    assert(s.players.p1.life === 0, "ライフ0")
    assert(s.winner === "p2", "p2 の勝利")
}

console.log("=== 4. 効果が解決できない（回復状態）ならライフも払わない ===")
{
    const s = game("p397-4", 3, false)
    const self = createInstance(BARRON, s.turn, 3)
    self.isRested = false
    s.players.p1.field.spirits.push(self)
    resolveAction(s, "p1", self, cardPay(BARRON))
    assert(s.players.p1.life === 3, "ライフは減らない")
}

console.log("=== 5. ダークナイト・ドラゴン：ライフのコア1個をボイドに置いて破壊／対象がいなければ払わない ===")
{
    const s = game("p397-5", 3, false)
    const self = createInstance(DARK_KNIGHT, s.turn, 3)
    s.players.p1.field.spirits.push(self)
    const enemy = createInstance(VANILLA, s.turn, 1)
    s.players.p2.field.spirits.push(enemy)
    resolveAction(s, "p1", self, cardPay(DARK_KNIGHT), undefined, getCard(DARK_KNIGHT).colors, "spirit")
    assert(s.players.p1.life === 2 && s.players.p1.reserve === 0, "ライフ3→2（ボイドへ）")
    assert(!s.players.p2.field.spirits.includes(enemy), "相手を破壊した")

    const s2 = game("p397-5b", 3, false)
    const self2 = createInstance(DARK_KNIGHT, s2.turn, 3)
    s2.players.p1.field.spirits.push(self2)
    resolveAction(s2, "p1", self2, cardPay(DARK_KNIGHT), undefined, getCard(DARK_KNIGHT).colors, "spirit")
    assert(s2.players.p1.life === 3, "対象がいないのでライフは減らない")
}

console.log("すべてのチェックに合格しました 🎉（part397）")
