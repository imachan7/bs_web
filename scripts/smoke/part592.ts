// smoke パート592（効果文に「コストを支払わずに」が無い召喚は通常のコストを払う：BS08-013・BS10-084・BS08-059。
// COST_MODEL §6、2026-10-15 ユーザー確認。持ち込み時の調べで3枚だけ無償になっていた）
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import { effectiveCost } from "../../server/src/logic/RuleValidator"
import type { EffectAction } from "../../server/src/type"

const ANDRE = "BS08-013" // アンドレアルファス
const MOUTH = "BS10-084" // 虚実の口
const PILLAR = "BS08-059" // 聖なる柱状彫刻
const HERO = "BS07-021" // 天刃の勇者ヴォルザ（コスト3）
const RIN = "BS13-X05" // 麒麟星獣リーン（【合体時】効果を持つ・コスト2）
const RAI = "BS04-010" // 雷帝エール・クレル（【転召】・コスト6）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ANDRE).name === "アンドレアルファス", "ANDREはアンドレアルファス")
    assert(getCard(MOUTH).name === "虚実の口" && getCard(MOUTH).type === "nexus", "MOUTHは虚実の口")
    assert(getCard(PILLAR).name === "聖なる柱状彫刻" && getCard(PILLAR).type === "nexus", "PILLARは聖なる柱状彫刻")
    assert(getCard(HERO).name.includes("勇者") && getCard(HERO).cost === 3, "HEROはコスト3の勇者")
    assert(getCard(RIN).name === "麒麟星獣リーン", "RINはリーン")
    assert(getCard(RAI).name === "雷帝エール・クレル" && getCard(RAI).effects.some((e) => e.kind === "keyword" && e.keyword === "tensho"), "RAIは【転召】持ち")
}

function actionOf(cardId: string, effectId: string): EffectAction {
    const e = getCard(cardId).effects.find((x) => x.id === effectId)
    assert(e !== undefined && "action" in e, `${effectId} がある`)
    return (e as { action: EffectAction }).action
}

function run(label: string, src: string, effectId: string, target: string, zone: "trash" | "hand", reserve: number): void {
    const s = createGame(`p592-${src}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    const p = s.players.p1
    const self = createInstance(src, s.turn, getCard(src).type === "nexus" ? 1 : 2)
    if (getCard(src).type === "nexus") p.field.nexuses.push(self)
    else p.field.spirits.push(self)
    p.trashCards = zone === "trash" ? [target] : []
    p.hand = zone === "hand" ? [target] : []
    p.reserve = reserve
    const trashCores = p.trashCores
    const cost = effectiveCost(s, "p1", getCard(target))
    const before = p.field.spirits.length
    resolveAction(s, "p1", self, actionOf(src, effectId))
    const summoned = p.field.spirits.length === before + 1
    if (reserve >= cost + 1) {
        assert(summoned, `${label}：召喚した`)
        assert(p.trashCores === trashCores + cost, `${label}：コスト${cost}をトラッシュに置いた（${p.trashCores - trashCores}）`)
        assert(p.reserve === reserve - cost - 1, `${label}：リザーブはコスト＋維持コアぶん減る（${reserve}→${p.reserve}）`)
    } else {
        assert(!summoned, `${label}：コストを払えないので召喚しない`)
        assert(p.reserve === reserve, `${label}：リザーブは減らない`)
    }
}

console.log("=== 1. コストを払える → 払って召喚する ===")
run("アンドレアルファス", ANDRE, "BS08-013-e1", HERO, "trash", 10)
run("虚実の口", MOUTH, "BS10-084-e2", RIN, "trash", 10)
run("聖なる柱状彫刻", PILLAR, "BS08-059-e2", RAI, "hand", 10)

console.log("=== 2. コストを払えない → 召喚しない ===")
run("アンドレアルファス（リザーブ1）", ANDRE, "BS08-013-e1", HERO, "trash", 1)
run("聖なる柱状彫刻（リザーブ1）", PILLAR, "BS08-059-e2", RAI, "hand", 1)

console.log("すべてのチェックに合格しました 🎉（part592）")
