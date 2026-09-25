// smoke パート380（誘発効果の付与：1体は timedEffect の内容 grantTrigger、見出しのステップ限定は effectGrant の phaseTurn）
import { assert, createGame, createInstance, fireTrigger, getCard, refreshLevelAsOverrides, resolveAction, timedHas } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"

function grantAction(cardId: string): Extract<EffectAction, { type: "timedEffect" }> {
    let found: EffectAction | undefined
    const walk = (o: unknown): void => {
        if (found || !o || typeof o !== "object") return
        if (Array.isArray(o)) return o.forEach(walk)
        const r = o as Record<string, unknown>
        if (r.type === "timedEffect" && JSON.stringify(r.content).includes('"grantTrigger"')) found = r as unknown as EffectAction
        Object.values(r).forEach(walk)
    }
    walk(getCard(cardId).effects)
    assert(found !== undefined, `${cardId}：カードデータに grantTrigger がある`)
    return found as Extract<EffectAction, { type: "timedEffect" }>
}

const VANILLA = "BS01-002" // ロクケラトプス
const YATSU = "BS14-032" // ヤツノカンゾウ
const HAOU = "BS14-010" // 皇牙獣キンタローグ・ベアー（系統：覇皇）

function game(): GameState {
    const s = createGame("p380", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS08-068").name === "メテオストーム", "BS08-068 はメテオストーム")
    assert(getCard(YATSU).name === "ヤツノカンゾウ", "BS14-032 はヤツノカンゾウ")
    assert(getCard("BS15-077").name === "ヒートライド", "BS15-077 はヒートライド")
    assert(getCard("BS16-074").name === "爆覇炎神剣", "BS16-074 は爆覇炎神剣")
    assert(getCard(HAOU).family.includes("覇皇"), "HAOU は覇皇")
}

console.log("=== 1. 1体：ヒートライド＝実効BP最大の自分のスピリットに『ライフを減らしたとき』 ===")
{
    const s = game()
    const weak = createInstance(VANILLA, 1, 1)
    const strong = createInstance(VANILLA, 1, 3)
    s.players.p1.field.spirits = [weak, strong]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, grantAction("BS15-077"), undefined, undefined, "magic")
    assert(timedHas(s, strong, "grantTrigger") && !timedHas(s, weak, "grantTrigger"), "実効BP最大の1体にだけ付く")
    const before = s.players.p1.reserve
    fireTrigger(s, "p1", strong, "onLifeDealt")
    assert(s.players.p1.reserve === before + 1, "付与した効果でボイドからコア1個")
}

console.log("=== 2. 1体：爆覇炎神剣＝系統：覇皇だけが候補 ===")
{
    const s = game()
    const other = createInstance(VANILLA, 1, 5)
    const haou = createInstance(HAOU, 1, 1)
    s.players.p1.field.spirits = [other, haou]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, grantAction("BS16-074"), undefined, undefined, "magic")
    assert(timedHas(s, haou, "grantTrigger", "onBattleWin"), "覇皇に『アタック時・BP比較で破壊したとき』が付く")
    assert(!timedHas(s, other, "grantTrigger"), "覇皇でない方には付かない")
}

console.log("=== 3. ヤツノカンゾウ Lv2：自分のアタックステップの間、【暴風】を持つ自分のスピリットに付く（継続効果） ===")
{
    const entry = getCard(YATSU).effects.find((e) => e.kind === "effectGrant")
    assert(entry?.kind === "effectGrant" && entry.phaseTurn?.phase === "attack" && entry.phaseTurn.turn === "own", "カードデータは effectGrant・自分のアタックステップ")
    // X の【暴風】で疲労させた相手を用意し、X が『バトル時』に負けたときを発火させる
    function scene(opts: { phase: GameState["phase"]; turnPlayer: "p1" | "p2"; bofu: boolean; kanzouLv2: boolean }) {
        const s = game()
        s.phase = opts.phase
        s.turnPlayer = opts.turnPlayer
        const kanzou = createInstance(YATSU, 1, opts.kanzouLv2 ? 3 : 1)
        const x = createInstance(VANILLA, 1, 1)
        if (opts.bofu) x.tempKeywords.push({ keyword: "bofu" })
        const foe = createInstance(VANILLA, 1, 1)
        s.players.p1.field.spirits = [kanzou, x]
        s.players.p2.field.spirits = [foe]
        refreshLevelAsOverrides(s)
        s.bofuExhaustedThisBattle = [{ pid: "p2", instanceId: foe.instanceId, bofuSourceInstanceId: x.instanceId }]
        fireTrigger(s, "p1", x, "onBattleLose")
        return !s.players.p2.field.spirits.includes(foe)
    }
    assert(scene({ phase: "attack", turnPlayer: "p1", bofu: true, kanzouLv2: true }), "自分のアタックステップ：効果で【暴風】を得たスピリットにも付き、相手が手札に戻る")
    assert(!scene({ phase: "attack", turnPlayer: "p1", bofu: false, kanzouLv2: true }), "【暴風】を持たないスピリットには付かない")
    assert(!scene({ phase: "main", turnPlayer: "p1", bofu: true, kanzouLv2: true }), "メインステップには付かない")
    assert(!scene({ phase: "attack", turnPlayer: "p2", bofu: true, kanzouLv2: true }), "相手のアタックステップには付かない")
    assert(!scene({ phase: "attack", turnPlayer: "p1", bofu: true, kanzouLv2: false }), "ヤツノカンゾウが Lv1 なら付かない")
}

console.log("すべてのチェックに合格しました 🎉（part380）")
