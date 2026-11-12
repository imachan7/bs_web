// smoke パート906（トラッシュから取り出す口を zones/trash.ts の takeFromTrash 1つにする。#437 R4-4）
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { collectMilledMagicToTegamoto } from "../../server/src/logic/zones/mill"
import type { EffectAction } from "../../server/src/type"

const ROYAL = "BS14-084" // 永久凍土の王都（トラッシュで一切の効果を受けない・ネクサス）
const SEAL = "BS10-108" // ルナティックシール（トラッシュで一切の効果を受けない・マジック）
const PLAIN_NEXUS = "BS15-064" // 冥府へ続く魔門（保護なし）
const LAB = "BS06-085" // 混迷する魔法実験場（Lv2：破棄されたマジックを手元へ）

console.log("=== 前提: カードの機械確認 ===")
{
    for (const id of [ROYAL, SEAL]) assert(getCard(id).effects.some((e) => e.kind === "trashImmunity"), `${getCard(id).name}はトラッシュで効果を受けない`)
    assert(!getCard(PLAIN_NEXUS).effects.some((e) => e.kind === "trashImmunity") && getCard(PLAIN_NEXUS).type === "nexus", "魔門は保護なしのネクサス")
    assert(getCard(LAB).effects.some((e) => e.kind === "milledMagicToTegamoto"), "魔法実験場は破棄されたマジックを手元へ置く")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "white" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    return s
}

console.log("=== トラッシュのネクサスをすべて配置する効果でも、王都は配置されない ===")
{
    const s = game("p906-deploy")
    s.players.p1.trashCards = [ROYAL, PLAIN_NEXUS]
    resolveAction(s, "p1", null, { type: "deployNexus", from: "trash", all: true } as EffectAction)
    const deployed = s.players.p1.field.nexuses.map((n) => n.cardId)
    assert(deployed.includes(PLAIN_NEXUS) && !deployed.includes(ROYAL), `魔門だけ配置（${deployed.join("、")}）`)
    assert(s.players.p1.trashCards.includes(ROYAL), "王都はトラッシュに残る")
}

console.log("=== 破棄されたマジックを手元へ置く効果でも、シールはトラッシュに残る ===")
{
    const s = game("p906-lab")
    s.players.p1.field.nexuses.push(createInstance(LAB, s.turn, 2))
    refreshLevelAsOverrides(s)
    const other = "BS02-096" // ディバインウィンド（保護なしのマジック）
    s.players.p1.trashCards = [SEAL, other]
    collectMilledMagicToTegamoto(s, "p1", [SEAL, other])
    assert(s.players.p1.trashCards.includes(SEAL) && !s.players.p1.tegamoto.includes(SEAL), "シールはトラッシュに残る")
    assert(s.players.p1.tegamoto.includes(other), "保護の無いマジックは手元へ")
}

console.log("=== 直前に使ったマジックを手札に戻す効果でも、シールは戻らない ===")
{
    const s = game("p906-lastmagic")
    s.players.p1.trashCards = [SEAL]
    s.lastMagicUsed = { pid: "p1", cardId: SEAL }
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "returnLastUsedMagicToHand" } as EffectAction)
    assert(s.players.p1.trashCards.includes(SEAL) && s.players.p1.hand.length === hand, "シールはトラッシュに残る")
}

console.log("=== トラッシュを直接いじるのは zones/trash.ts だけ（新しい経路が保護を書き忘れないため） ===")
{
    const root = join(__dirname, "../../server/src/logic")
    const offenders: string[] = []
    const walk = (dir: string): void => {
        for (const name of readdirSync(dir)) {
            const p = join(dir, name)
            if (statSync(p).isDirectory()) walk(p)
            else if (p.endsWith(".ts") && !p.endsWith(join("zones", "trash.ts")) && readFileSync(p, "utf-8").includes("trashCards.splice(")) offenders.push(p.slice(root.length + 1))
        }
    }
    walk(root)
    assert(offenders.length === 0, `trashCards.splice を直接使うファイルなし（${offenders.join("、") || "なし"}）`)
}

console.log("すべてのチェックに合格しました 🎉（part906）")
