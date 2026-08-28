// smoke パート262（効果によるネクサス配置でも『このネクサスの配置時』が発揮される。2026-08-28）
//
// ⚠️ 2026-08-28 まで、ネクサス自身の『このネクサスの配置時』（trigger:"onSummon"）を発火して
// いたのは手札からの通常配置（GameEngine.doSetNexus）だけで、効果による配置では黙って消えていた。
// BS09-066 目覚める要塞城の『配置時』が長期間死んでいたのがこれ。
// 「配置であることに変わりはないので発揮させる」がユーザー判断（docs/design/SEMANTICS_AUDIT.md §3.15）。
//
// 配置の経路は3種類のアクションに集約される。ここでは実データのカードで踏める2つを実際に通す:
//   deployNexus（BS04-113 ネクサスリペアー＝トラッシュから）
//   deployNexusFromTrashByFieldCores（BS09-065 名工集いし大工房 Lv2）
// 残る deployThisNexusFree（デッキ破棄されたネクサスの配置）は、それを持つ唯一のカード
// BS08-064 鳳翼の聖剣が『配置時』を持たないため実カードでは踏めない。3経路とも triggers.ts の
// fireNexusDeployed 1本を通しているので、そちらは呼び出しの共有で担保する。
//
// ⚠️ cardId はハードコードで信用せず、カードデータで名前・種別を機械検証してから使う。
import {
    act,
    assert,
    createGame,
    createInstance,
    fireStepTriggers,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const FORTRESS = "BS09-066" // 目覚める要塞城（『配置時』＝手札のコスト4以下の青スピリットを無償召喚）
const REPAIR = "BS04-113" // ネクサスリペアー（マジック：トラッシュのネクサスを配置）
const WORKSHOP = "BS09-065" // 名工集いし大工房（Lv2『自分のエンドステップ』トラッシュのネクサスをフィールドのコアで配置）
assert(getCard(FORTRESS).name === "目覚める要塞城" && getCard(FORTRESS).type === "nexus", "BS09-066 は目覚める要塞城")
assert(getCard(REPAIR).name === "ネクサスリペアー" && getCard(REPAIR).type === "magic", "BS04-113 はネクサスリペアー")
assert(getCard(WORKSHOP).name === "名工集いし大工房" && getCard(WORKSHOP).type === "nexus", "BS09-065 は名工集いし大工房")

// 『配置時』が呼ぶ summonFromHandFree の対象になる青スピリット（コスト4以下）を実データから選ぶ
const PREY = ALL_CARDS.find((c) => c.type === "spirit" && c.cost <= 4 && c.colors.includes("blue") && c.levels.length > 0)
assert(PREY !== undefined, "テスト前提：コスト4以下の青スピリットが実データにある")
const PREY_ID = PREY!.cardId

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.players.p1.reserve = 20
    s.players.p1.trashCards.push(FORTRESS)
    s.players.p1.hand = [PREY_ID]
    return s
}
// 『配置時』は optional:true なので、対話で確認が立ったら「発動する」を選ぶ
function confirmIfAsked(s: GameState): void {
    while (s.pendingChoice?.confirm) act(s, "p1", { type: "resolveChoice", option: "発動する" })
}
function summonedPrey(s: GameState): boolean {
    return s.players.p1.field.spirits.some((x) => x.cardId === PREY_ID)
}

console.log("=== 効果でトラッシュから配置されたネクサスの『配置時』が発揮される（ネクサスリペアー） ===")
{
    const s = base("nexus-deploy-trigger-magic")
    s.players.p1.hand = [REPAIR, PREY_ID]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ネクサスリペアーを使用できる")
    confirmIfAsked(s)
    assert(s.players.p1.field.nexuses.some((n) => n.cardId === FORTRESS), "前提：目覚める要塞城が配置される")
    assert(summonedPrey(s), "配置されたネクサス自身の『配置時』が発揮され、手札の青スピリットが召喚される")
}

console.log("=== フィールドのコアで配置されたネクサスの『配置時』が発揮される（名工集いし大工房 Lv2） ===")
{
    const s = base("nexus-deploy-trigger-workshop")
    const workshop = createInstance(WORKSHOP, s.turn, 1) // Lv2
    s.players.p1.field.nexuses.push(workshop)
    refreshLevelAsOverrides(s)
    // 配置コスト（5）を賄えるだけのコアをフィールドに用意する
    const holder = createInstance(PREY_ID, s.turn, 10)
    s.players.p1.field.spirits.push(holder)
    fireStepTriggers(s, "end")
    confirmIfAsked(s)
    assert(s.players.p1.field.nexuses.some((n) => n.cardId === FORTRESS), "前提：目覚める要塞城が配置される")
    assert(
        s.players.p1.field.spirits.filter((x) => x.cardId === PREY_ID).length === 2,
        "『配置時』が発揮され、手札の青スピリットが召喚される（場のコア持ちとあわせて2体）",
    )
}
