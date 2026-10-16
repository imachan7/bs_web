// smoke パート452（fieldEvent の self が「発生源」か「イベント対象」かの取り違えを落とす）
// BS13-X04 獅機龍神ストライクヴルム・レオ／BS11-X03 星騎士ハーキュリーΩ。
// 静的検査：selfOverride を渡すイベントで「〜Self」系アクションを selfMode 無しで書いたら、検証済み一覧に無い限り落とす
import { assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS, getCard } from "../../server/src/logic/GameState"
import { exhaustSpirit, fireSummonSequence } from "../../server/src/logic/EffectModules"

const LEO = "BS13-X04"
const HERCULES = "BS11-X03"

// fireFieldEventTriggers が selfOverride（イベント対象）を渡すイベント。ここでは self がイベント対象になる
const EVENTS_WITH_TARGET_SELF = new Set([
    "ownSpiritExhausted", "anySpiritExhausted", "ownSpiritSummoned", "anySpiritAttacked", "anySpiritCombined",
    "ownSpiritBlocked", "ownSpiritDestroyed", "ownSpiritRefreshed", "anySpiritRefreshed",
    "ownSpiritReturnedToHand", "ownSpiritDealtLife", "ownSpiritDeclaredBlock", "anySpiritDeclaredBlock",
])

// 効果文が「そのスピリット」＝イベント対象を指すと確認済みのエントリ（selfMode 不要）
const TARGET_IS_EVENT_SUBJECT = new Set([
    "BS05-064-e2", "BS06-075-e2", "BS11-064-e1", "BS13-006-e1", "BS13-061-e1", "BS13-063-e1", "BS13-019-e2",
    "BS14-085-e2r", "BS14-085-e2g", "BS14-085-e2w", "BS14-085-e2b",
])

function selfActionsOf(node: unknown, out: string[] = []): string[] {
    if (Array.isArray(node)) node.forEach((n) => selfActionsOf(n, out))
    else if (node && typeof node === "object") {
        const o = node as Record<string, unknown>
        if (typeof o.type === "string" && o.type.endsWith("Self")) out.push(o.type)
        Object.values(o).forEach((v) => selfActionsOf(v, out))
    }
    return out
}

console.log("=== 1. 静的検査：selfMode の書き忘れ ===")
{
    const bad: string[] = []
    for (const c of ALL_CARDS) {
        for (const e of c.effects as any[]) {
            if (e.kind !== "fieldEvent" || !EVENTS_WITH_TARGET_SELF.has(e.event) || e.selfMode === "source") continue
            if (selfActionsOf(e.action).length > 0 && !TARGET_IS_EVENT_SUBJECT.has(e.id)) bad.push(`${c.cardId} ${e.id}`)
        }
    }
    assert(bad.length === 0, `selfMode:"source" の書き忘れ（イベント対象に効いてしまう）: ${bad.join(", ")}`)
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    return s
}

console.log("=== 2. BS13-X04：光導/星魂の他のスピリットが疲労したとき、レオが回復する ===")
{
    const ally = ALL_CARDS.find((c) => c.type === "spirit" && c.cardId !== LEO && c.family?.includes("光導"))!
    const other = ALL_CARDS.find((c) => c.type === "spirit" && !c.family?.some((f) => ["光導", "星魂"].includes(f)))!
    assert(getCard(LEO).name.includes("ストライクヴルム・レオ"), "LEOは獅機龍神ストライクヴルム・レオ")

    const s = game("leo")
    const leo = createInstance(LEO, s.turn, 1)
    const a = createInstance(ally.cardId, s.turn, 1)
    s.players.p1.field.spirits.push(leo, a)
    refreshLevelAsOverrides(s)
    leo.isRested = true
    exhaustSpirit(s, "p1", a)
    assert(a.isRested === true, "疲労させた味方は疲労状態のまま")
    assert((leo.isRested as boolean) === false, "レオが回復した")

    const s2 = game("leo-other")
    const leo2 = createInstance(LEO, s2.turn, 1)
    const b = createInstance(other.cardId, s2.turn, 1)
    s2.players.p1.field.spirits.push(leo2, b)
    refreshLevelAsOverrides(s2)
    leo2.isRested = true
    exhaustSpirit(s2, "p1", b)
    assert(leo2.isRested === true, "系統が違う味方の疲労では回復しない")
}

console.log("=== 3. BS11-X03：合体中、【神速】持ちが召喚されたとき、ハーキュリーΩが回復する ===")
{
    const soku = ALL_CARDS.find((c) => c.type === "spirit" && c.effects.some((e: any) => e.kind === "keyword" && e.keyword === "soku"))!
    const s = game("hercules")
    const host = createInstance(ALL_CARDS.find((c) => c.type === "spirit" && c.effects.length === 0)!.cardId, s.turn, 3)
    const herc = createInstance(HERCULES, s.turn, 3)
    s.players.p1.field.spirits.push(host)
    s.players.p1.field.combinedBraves.push(herc)
    host.braveRefs = [{ instanceId: herc.instanceId } as any]
    herc.braveCombined = true
    refreshLevelAsOverrides(s)
    host.isRested = true
    const summoned = createInstance(soku.cardId, s.turn, 1)
    s.players.p1.field.spirits.push(summoned)
    fireSummonSequence(s, "p1", summoned)
    assert((host.isRested as boolean) === false, "合体スピリット（ハーキュリーΩ側）が回復した")
    assert(summoned.isRested === false, "召喚されたスピリット自身の状態は変わらない")
}

console.log("すべてのチェックに合格しました 🎉（part452）")
