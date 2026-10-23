// smoke パート662（「持つ効果すべては発揮されない」スピリットの効果を、場を直接見る計算でも止める。entryActive。docs/design/ENTRY_ACTIVE.md）
import { assert, createGame, createInstance, getCard, effectiveCost, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { hasMagicRestriction } from "../../shared/cost"

const PANTO = "BS05-030" // パントマイスター（Lv2：手札の氷姫のコストを5にする）
const SOL = "BS01-096" // 妖機妃ソール（氷姫・コスト8）
const FOXIN = "BS03-079" // 作戦参謀フォクシン（お互いマジックはターンに1回。場を直接見る判定）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(PANTO).name === "パントマイスター" && getCard(PANTO).type === "spirit", "PANTOはパントマイスター")
    assert(getCard(FOXIN).name === "作戦参謀フォクシン", "FOXINは作戦参謀フォクシン")
    assert(getCard(SOL).name === "妖機妃ソール" && getCard(SOL).cost === 8 && (getCard(SOL).family ?? []).includes("氷姫"), "SOLはコスト8の氷姫")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function costWith(cores: number, suppressed: boolean): number {
    const s = game(`p662-${cores}-${suppressed}`)
    const inst = createInstance(PANTO, s.turn, cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    // 期間つきの一覧から作り直される印なので、作り直しの後に立てる
    if (suppressed) inst.timedEffectsDisabled = true
    return effectiveCost(s, "p1" as PlayerId, getCard(SOL))
}

console.log("=== 1. コストの置き換えは、効果が止まっているスピリットからは出ない ===")
{
    const lv1 = costWith(1, false) // Lv1 では効果がない（シンボルによる軽減だけが残る）
    const lv2 = costWith(2, false)
    const lv2Suppressed = costWith(2, true)
    assert(lv2 !== lv1, `Lv2 ならコストが置き換わる（Lv1: ${lv1} / Lv2: ${lv2}）`)
    assert(lv2Suppressed === lv1, `効果すべてが発揮されない間は置き換わらない（${lv2Suppressed}）`)
}

console.log("=== 2. 場を直接見るマジックの制限も、効果が止まっているスピリットからは出ない ===")
for (const suppressed of [false, true]) {
    const s = game(`p662-foxin-${suppressed}`)
    const inst = createInstance(FOXIN, s.turn, 1)
    s.players.p2.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    if (suppressed) inst.timedEffectsDisabled = true
    const restricted = hasMagicRestriction(s, "p1", "oncePerTurnAll")
    assert(restricted === !suppressed, suppressed ? "効果すべてが発揮されない間は制限が掛からない" : "相手のフォクシンの制限が掛かる")
}

console.log("すべてのチェックに合格しました 🎉（part662）")
