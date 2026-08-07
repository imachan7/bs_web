// smoke パート117（プレイブック §5-B の単発3枚）
//
// 新設した機構:
//   - magicRestriction "costLimitAll"（＋ maxCost / requireOwnKeyword / phase）。
//     判定は shared/cost.hasMagicCostLock（RuleValidator.validateMagic から呼ぶ）
//   - magicTargetRedirect の protectFamily / protectColor
//     （「発生源自身が対象」ではなく「持ち主の指定系統・指定色のスピリットが対象」で発動し、対象を発生源に付け替える）
//   - kind:"jugekiCoreToVoid"（【呪撃】で破壊する相手スピリット上のコアをボイドへ。破壊の直前に取り除く）
// 実装したカード:
//   - BS05-065 青嵐の虚空 Lv2（【転召】がいる間、お互いコスト4以下のマジックを使用できない）
//   - BS05-040 プリンセス・スノーホワイト Lv1-3（自分の白の「氷姫」への効果の対象を自分に付け替える）
//   - BS04-078 魔影街 Lv1（【呪撃】で破壊した相手スピリットのコア1個をボイドへ）
import { act, assert, createGame, createInstance, currentLevel, declareBlock, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { hasMagicCostLock } from "../../shared/cost"
import { resolveMagic } from "../../server/src/logic/EffectModules"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS05-065").name === "青嵐の虚空" && getCard("BS05-065").type === "nexus", "BS05-065 は青嵐の虚空（ネクサス）")
    assert(getCard("BS05-040").name === "プリンセス・スノーホワイト", "BS05-040 はプリンセス・スノーホワイト")
    assert(getCard("BS04-078").name === "魔影街" && getCard("BS04-078").type === "nexus", "BS04-078 は魔影街（ネクサス）")
    assert(getCard("BS04-044").name === "空帝ル・シエル", "BS04-044 は空帝ル・シエル（【転召】持ち）")
    assert(getCard("BS01-096").name === "妖機妃ソール" && getCard("BS01-096").colors[0] === "white", "BS01-096 は妖機妃ソール（白）")
    assert(getCard("BS01-096").family.includes("氷姫"), "妖機妃ソールは系統「氷姫」")
    assert(getCard("BS03-017").name === "幽霊船長シルバーシャーク", "BS03-017 は幽霊船長シルバーシャーク（【呪撃】持ち）")
    assert(getCard("BS01-117").name === "ダブルドロー" && getCard("BS01-117").cost === 4, "BS01-117 はダブルドロー（コスト4）")
    assert(getCard("BS03-118").name === "フォースドロー" && getCard("BS03-118").cost === 5, "BS03-118 はフォースドロー（コスト5）")
    assert(getCard("BS03-120").name === "フレイムサイクロン", "BS03-120 はフレイムサイクロン")
    assert(getCard("BS01-031").name === "デス・ハーデス", "BS01-031 はデス・ハーデス")
}

console.log("=== BS05-065 青嵐の虚空 Lv2：【転召】がいる間、お互いコスト4以下のマジックを使用できない ===")
{
    const s = createGame("t117-void-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const nexus = putNexus(s, "p1", "BS05-065", 2) // Lv2
    assert(currentLevel(nexus).level === 2, `青嵐の虚空は2コアでLv2（実際: ${String(currentLevel(nexus).level)}）`)
    put(s, "p1", "BS04-044", 1) // 空帝ル・シエル＝【転召】持ち
    s.phase = "attack"

    assert(hasMagicCostLock(s, getCard("BS01-117")), "コスト4のマジックは使用できない")
    assert(!hasMagicCostLock(s, getCard("BS03-118")), "コスト5のマジックは使用できる")
    // 「お互い」なので、発生源の持ち主自身も縛られる（usingPid を見ない）
    s.turnPlayer = "p2"
    assert(hasMagicCostLock(s, getCard("BS01-117")), "相手のターンでもコスト4は使用できない")
}

console.log("=== BS05-065 青嵐の虚空：転召なし／Lv1／アタックステップ外では縛らない ===")
{
    const s = createGame("t117-void-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const nexus = putNexus(s, "p1", "BS05-065", 2)
    s.phase = "attack"
    assert(!hasMagicCostLock(s, getCard("BS01-117")), "【転召】持ちがいなければ縛らない")

    const tensho = put(s, "p1", "BS04-044", 1)
    assert(hasMagicCostLock(s, getCard("BS01-117")), "【転召】持ちを置くと縛られる")

    s.phase = "main"
    assert(!hasMagicCostLock(s, getCard("BS01-117")), "メインステップでは縛らない（『お互いのアタックステップ』）")

    s.phase = "attack"
    nexus.cores = 0 // Lv1
    assert(!hasMagicCostLock(s, getCard("BS01-117")), "Lv1では縛らない")
    assert(tensho.cores === 1, "転召持ちはそのまま（前提の確認）")
}

console.log("=== BS05-065 青嵐の虚空 Lv2：castMagic が実際に弾かれる（配線確認） ===")
{
    const s = createGame("t117-void-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS05-065", 2)
    put(s, "p1", "BS04-044", 1)
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了（p2ターンへ）")
    s.players.p2.reserve = 20
    s.players.p2.hand[0] = "BS01-117" // ダブルドロー（コスト4・メイン）

    // メインステップでは縛られないので使用できる
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "メインステップならコスト4でも使用できる")

    s.players.p2.hand[0] = "BS01-117"
    s.phase = "attack"
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) !== null, "アタックステップではコスト4のマジックが弾かれる")
}

console.log("=== BS05-040 プリンセス・スノーホワイト：白の「氷姫」への相手マジックの対象を自分に付け替える ===")
{
    const s = createGame("t117-snow-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const snow = put(s, "p1", "BS05-040", 1) // Lv1
    const hime = put(s, "p1", "BS01-096", 1) // 妖機妃ソール（白の「氷姫」・BP2000）
    s.turnPlayer = "p2" // 『相手のターン』

    // フレイムサイクロン：BP5000以下の相手スピリット1体を破壊（対象未指定＝BP上位が自動選択される）
    resolveMagic(s, "p2", "BS03-120", "flash")
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === hime.instanceId),
        "白の「氷姫」は対象を付け替えられて生き残る",
    )
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === snow.instanceId),
        "代わりにスノーホワイトが破壊される",
    )
}

console.log("=== BS05-040 プリンセス・スノーホワイト：自分のターン／守る対象がいなければ付け替えない ===")
{
    // 『相手のターン』限定：スノーホワイトの持ち主がturnPlayerなら発動しない
    const s = createGame("t117-snow-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const snow = put(s, "p1", "BS05-040", 1)
    const hime = put(s, "p1", "BS01-096", 1)
    s.turnPlayer = "p1"
    resolveMagic(s, "p2", "BS03-120", "flash")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === hime.instanceId),
        "自分のターンでは付け替えず、BP上位の「氷姫」が破壊される",
    )
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === snow.instanceId), "スノーホワイトは残る")

    // 守る対象（白の「氷姫」）がいなければ発動しない
    const s2 = createGame("t117-snow-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s2)
    const snow2 = put(s2, "p1", "BS05-040", 1)
    const other = put(s2, "p1", "BS01-001", 1) // ゴラドン（赤・氷姫でない・BP1000）
    s2.turnPlayer = "p2"
    resolveMagic(s2, "p2", "BS03-120", "flash")
    assert(
        !s2.players.p1.field.spirits.some((x) => x.instanceId === snow2.instanceId) ||
            !s2.players.p1.field.spirits.some((x) => x.instanceId === other.instanceId),
        "誰か1体は破壊される（前提の確認）",
    )
    assert(
        s2.log.every((l) => !l.includes("このマジックの効果の対象を")),
        "守る対象がいないので対象の付け替えは起きない",
    )
}

console.log("=== BS04-078 魔影街 Lv1：【呪撃】で破壊した相手スピリットのコア1個をボイドへ ===")
{
    // 対照：魔影街なし。ブロッカー（4コア）が破壊され、コア4個がp2のリザーブへ戻る
    const base = createGame("t117-city-base", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(base)
    const atk0 = put(base, "p1", "BS03-017", 1) // 幽霊船長シルバーシャーク Lv1（【呪撃】・BP3000）
    const blk0 = put(base, "p2", "BS01-031", 4) // デス・ハーデス Lv2（BP7000）＝BP比較では勝つ
    assert(act(base, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    const beforeBase = base.players.p2.reserve
    assert(act(base, "p1", { type: "attack", instanceId: atk0.instanceId }) === null, "アタック宣言")
    assert(declareBlock(base, "p2", blk0.instanceId) === null, "ブロック宣言")
    assert(act(base, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(base, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        !base.players.p2.field.spirits.some((x) => x.instanceId === blk0.instanceId),
        "【呪撃】でブロッカーが破壊される",
    )
    const gainedBase = base.players.p2.reserve - beforeBase
    assert(gainedBase === 4, `魔影街なしならコア4個がリザーブへ戻る（実際: ${String(gainedBase)}）`)

    // 魔影街あり：コア1個がボイドへ行くので、リザーブへ戻るのは1個少ない
    const s = createGame("t117-city-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const nexus = putNexus(s, "p1", "BS04-078", 0) // Lv1
    assert(currentLevel(nexus).level === 1, `魔影街は0コアでLv1（実際: ${String(currentLevel(nexus).level)}）`)
    const atk = put(s, "p1", "BS03-017", 1)
    const blk = put(s, "p2", "BS01-031", 4)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    const before = s.players.p2.reserve
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blk.instanceId) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === blk.instanceId),
        "【呪撃】でブロッカーが破壊される",
    )
    const gained = s.players.p2.reserve - before
    assert(gained === 3, `コア1個はボイドへ行き、リザーブへ戻るのは3個（実際: ${String(gained)}）`)
}
