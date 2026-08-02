// smoke パート106（効果節の実装漏れ埋め・マジックのメイン側＋スピリット/ネクサスの2つ目の効果）
// 対象: BS01-132 ストームドロー／BS04-088 栄光の表彰台／BS03-146 ネクサスレジスター／
//       BS02-098 キャストオフ／BS02-096 ディバインウィンド／BS04-108 ストレートフラッシュ／
//       BS02-088 クロスファイア／BS02-090 マインドフレア／BS02-094 ブラッディレイン／
//       BS01-130 チェンジングコア／BS02-091 セブンスクリムゾン／BS04-104 グラシアルブレス／
//       BS04-114 タイダルタイド／BS03-062 チワール／BS02-080 エメラルドに輝く鍾乳洞／
//       BS04-008 古竜魔人バ・ゴゥ／BS04-050 ハートレス・ティン／BS03-097 鷹人ホークアイ／
//       BS05-054 鉄槌のオズワルド
import {
    act,
    assert,
    createGame,
    createInstance,
    destroySpirit,
    fireStepTriggers,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireBattleWonTriggers, fireTrigger, resolveMagic } from "../../server/src/logic/EffectModules"
import { activeConstraints } from "../../shared/rules"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== BS01-132 ストームドロー：メインは3枚ドロー→手札2枚破棄 ===")
{
    const s = createGame("stormdraw-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const before = s.players.p1.hand.length
    const trashBefore = s.players.p1.trashCards.length
    resolveMagic(s, "p1", "BS01-132", "main")
    // 3枚引いて2枚破棄なので手札は差し引き+1枚、トラッシュは+2枚
    assert(s.players.p1.hand.length === before + 1, "手札は3枚引いて2枚破棄で差し引き+1枚")
    assert(s.players.p1.trashCards.length === trashBefore + 2, "破棄した2枚がトラッシュへ")
}

console.log("=== BS01-132 ストームドロー：フラッシュ側は従来どおりBP+3000 ===")
{
    const s = createGame("stormdraw-flash", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const target = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p1.field.spirits.push(target)
    resolveMagic(s, "p1", "BS01-132", "flash", target.instanceId)
    assert(target.tempBpBuff === 3000, "フラッシュ側でBP+3000")
}

console.log("=== BS04-088 栄光の表彰台：Lv2はネクサス配置のたびにリザーブへコア1個 ===")
{
    const s = createGame("hyoshodai-deploy", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS04-088", 3) // Lv2（コア3個）
    // 手札に燃えさかる戦場（コスト3）を仕込み、リザーブを十分に用意して配置する
    s.players.p1.hand.push("BS01-098")
    const handIndex = s.players.p1.hand.length - 1
    s.players.p1.reserve = 8
    const reserveBefore = s.players.p1.reserve
    assert(
        act(s, "p1", { type: "setNexus", handIndex }) === null,
        "ネクサスを配置できる",
    )
    // コスト3を支払い（-3）、配置の誘発でボイドからコア1個が戻る（+1）
    assert(
        s.players.p1.reserve === reserveBefore - 3 + 1,
        `配置コスト3を払いつつ誘発で+1個（実際: ${String(s.players.p1.reserve)}）`,
    )
}

console.log("=== BS04-088 栄光の表彰台：Lv1では発揮されない ===")
{
    const s = createGame("hyoshodai-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS04-088", 0) // Lv1（コア0個）
    s.players.p1.hand.push("BS01-098")
    const handIndex = s.players.p1.hand.length - 1
    s.players.p1.reserve = 8
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "setNexus", handIndex }) === null, "ネクサスを配置できる")
    assert(s.players.p1.reserve === reserveBefore - 3, "Lv1なので誘発せずコストぶんだけ減る")
}

console.log("=== BS03-146 ネクサスレジスター：メインは手札のネクサスを全破棄して枚数ぶんドロー ===")
{
    const s = createGame("nexusregister-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.players.p1.hand = ["BS01-098", "BS01-098", "BS01-001"] // ネクサス2枚＋スピリット1枚
    const trashBefore = s.players.p1.trashCards.length
    resolveMagic(s, "p1", "BS03-146", "main")
    // ネクサス2枚を破棄して2枚ドロー → 手札はスピリット1枚＋引いた2枚＝3枚
    assert(s.players.p1.hand.length === 3, `手札は3枚（実際: ${String(s.players.p1.hand.length)}）`)
    assert(s.players.p1.trashCards.length === trashBefore + 2, "破棄したネクサス2枚がトラッシュへ")
    assert(s.players.p1.hand.filter((c) => c === "BS01-098").length === 0, "手札にネクサスは残らない")
}

console.log("=== BS03-146 ネクサスレジスター：手札にネクサスが無ければ不発 ===")
{
    const s = createGame("nexusregister-none", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.players.p1.hand = ["BS01-001"]
    resolveMagic(s, "p1", "BS03-146", "main")
    assert(s.players.p1.hand.length === 1, "ネクサスが無いのでドローしない")
}

console.log("=== BS02-098 キャストオフ：怪虫1体を破壊してコスト5のスピリットをノーコスト召喚 ===")
{
    const s = createGame("castoff-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    put(s, "p1", "BS01-055", 1) // エメアント（系統：怪虫）
    s.players.p1.hand = ["BS01-017"] // ランスラプトル（コスト5）
    s.players.p1.reserve = 5
    resolveMagic(s, "p1", "BS02-098", "main")
    assert(s.players.p1.field.spirits.length === 1, "怪虫が破壊され、代わりに1体召喚されている")
    assert(
        s.players.p1.field.spirits[0]!.cardId === "BS01-017",
        "召喚されたのはコスト5のランスラプトル",
    )
}

console.log("=== BS02-098 キャストオフ：怪虫がいなければ不発（手札も減らない） ===")
{
    const s = createGame("castoff-nocost", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.hand = ["BS01-017"]
    s.players.p1.reserve = 5
    resolveMagic(s, "p1", "BS02-098", "main")
    assert(s.players.p1.field.spirits.length === 0, "召喚されない")
    assert(s.players.p1.hand.length === 1, "手札は減らない")
}

console.log("=== BS02-096 ディバインウィンド：トラッシュのコア数以下のコストだけ召喚できる ===")
{
    const s = createGame("divinewind-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.hand = ["BS01-017"] // コスト5
    s.players.p1.reserve = 5
    s.players.p1.trashCores = 4 // コスト5には足りない
    resolveMagic(s, "p1", "BS02-096", "main")
    assert(s.players.p1.field.spirits.length === 0, "トラッシュのコアが4個ならコスト5は召喚できない")
    s.players.p1.trashCores = 5
    resolveMagic(s, "p1", "BS02-096", "main")
    assert(s.players.p1.field.spirits.length === 1, "5個あればコスト5を召喚できる")
}

console.log("=== BS04-108 ストレートフラッシュ：四道5体以上で自分の四道と相手のスピリットを全破壊 ===")
{
    const s = createGame("straightflush-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    for (let i = 0; i < 4; i++) put(s, "p1", "BS02-056", 1) // アルカナビースト・ケン（四道）
    put(s, "p1", "BS01-001", 1) // 四道でないスピリット（残るはず）
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-017", 1)
    resolveMagic(s, "p1", "BS04-108", "main")
    assert(s.players.p1.field.spirits.length === 5, "四道が5体未満なので発動しない")

    put(s, "p1", "BS02-056", 1) // 5体目の四道
    resolveMagic(s, "p1", "BS04-108", "main")
    assert(
        s.players.p1.field.spirits.length === 1 &&
            s.players.p1.field.spirits[0]!.cardId === "BS01-001",
        "自分の四道だけ全滅し、四道でないスピリットは残る",
    )
    assert(s.players.p2.field.spirits.length === 0, "相手のスピリットは全滅する")
}

console.log("=== BS02-088 クロスファイア：お互いのネクサスを1つずつ破壊。片方に無ければ不発 ===")
{
    const s = createGame("crossfire-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS01-098", 0)
    resolveMagic(s, "p1", "BS02-088", "main")
    assert(s.players.p1.field.nexuses.length === 1, "相手にネクサスが無ければ発動しない")

    putNexus(s, "p2", "BS01-098", 0)
    putNexus(s, "p2", "BS01-098", 0)
    resolveMagic(s, "p1", "BS02-088", "main")
    assert(s.players.p1.field.nexuses.length === 0, "自分のネクサスも1つ破壊される")
    assert(s.players.p2.field.nexuses.length === 1, "相手のネクサスも1つだけ破壊される")
}

console.log("=== BS02-090 マインドフレア：同名スピリットを1体だけ残して破壊 ===")
{
    const s = createGame("mindflare-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-017", 1)
    resolveMagic(s, "p1", "BS02-090", "main")
    assert(s.players.p2.field.spirits.length === 2, "同名3体は1体だけ残る（＋別名1体）")
    assert(
        s.players.p2.field.spirits.filter((x) => x.cardId === "BS01-001").length === 1,
        "ゴラドンは1体だけ残る",
    )
}

console.log("=== BS02-094 ブラッディレイン：相手のコア合計に応じてボイドへ（10〜19→2個 / 20以上→6個） ===")
{
    const s = createGame("bloodyrain-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.players.p2.reserve = 12
    s.players.p2.trashCores = 0
    resolveMagic(s, "p1", "BS02-094", "main")
    assert(s.players.p2.reserve === 10, `合計12個なら2個ボイドへ（実際: ${String(s.players.p2.reserve)}）`)

    const s2 = createGame("bloodyrain-6", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s2)
    s2.players.p2.reserve = 20
    s2.players.p2.trashCores = 0
    resolveMagic(s2, "p1", "BS02-094", "main")
    assert(s2.players.p2.reserve === 14, `合計20個なら6個ボイドへ（実際: ${String(s2.players.p2.reserve)}）`)

    const s3 = createGame("bloodyrain-none", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s3)
    s3.players.p2.reserve = 5
    s3.players.p2.trashCores = 0
    resolveMagic(s3, "p1", "BS02-094", "main")
    assert(s3.players.p2.reserve === 5, "合計10個未満なら何も起きない")
}

console.log("=== BS01-130 チェンジングコア：コア1個だけ残して同じフィールドの別スピリットへ移す ===")
{
    const s = createGame("changingcore-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const src = put(s, "p1", "BS01-007", 5) // ハンマドレイク（コア5個）
    const dest = put(s, "p1", "BS01-001", 1)
    resolveMagic(s, "p1", "BS01-130", "main", src.instanceId)
    assert(src.cores === 1, "指定したスピリットのコアは1個だけ残る")
    assert(dest.cores === 5, `移し先は1+4で5個（実際: ${String(dest.cores)}）`)
}

console.log("=== BS01-130 チェンジングコア：移し先がいなければ不発 ===")
{
    const s = createGame("changingcore-nodest", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const src = put(s, "p1", "BS01-007", 5)
    resolveMagic(s, "p1", "BS01-130", "main", src.instanceId)
    assert(src.cores === 5, "同じフィールドに別のスピリットがいなければコアは動かない")
}

console.log("=== BS02-091 セブンスクリムゾン：BP7000以上のコアを払って相手のコア7個をリザーブへ ===")
{
    const s = createGame("seventhcrimson-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const payer = put(s, "p1", "BS01-007", 7) // ハンマドレイク Lv3 BP9000
    const enemy = put(s, "p2", "BS01-007", 8)
    const reserveBefore = s.players.p2.reserve
    resolveMagic(s, "p1", "BS02-091", "main")
    assert(payer.cores === 0 || !s.players.p1.field.spirits.includes(payer), "コストで自分のコアはすべてボイドへ")
    assert(enemy.cores === 1, `相手のコアは8-7=1個（実際: ${String(enemy.cores)}）`)
    assert(s.players.p2.reserve === reserveBefore + 7, "取り除いたコアは相手のリザーブへ")
}

console.log("=== BS02-091 セブンスクリムゾン：BP7000以上がいなければ不発 ===")
{
    const s = createGame("seventhcrimson-nocost", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const enemy = put(s, "p2", "BS01-007", 8)
    resolveMagic(s, "p1", "BS02-091", "main")
    assert(enemy.cores === 8, "コストを払えないので相手のコアは動かない")
}

console.log("=== BS04-104 グラシアルブレス：自分2体と相手2体をデッキの下へ（シンボル2以上が必要） ===")
{
    const s = createGame("glacialbreath-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    put(s, "p1", "BS01-001", 1)
    put(s, "p1", "BS01-017", 1)
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-017", 1)
    resolveMagic(s, "p1", "BS04-104", "main")
    assert(s.players.p1.field.spirits.length === 2, "シンボル2つ以上のスピリットがいなければ発動しない")

    put(s, "p1", "BS04-010", 1) // 雷帝エール・クレル（シンボル2つ）
    const deckBefore = s.players.p1.deck.length
    resolveMagic(s, "p1", "BS04-104", "main")
    assert(s.players.p1.field.spirits.length === 1, "自分のスピリット2体がデッキの下へ")
    assert(s.players.p2.field.spirits.length === 0, "相手のスピリット2体もデッキの下へ")
    assert(s.players.p1.deck.length === deckBefore + 2, "自分のデッキが2枚増える")
}

console.log("=== BS04-114 タイダルタイド：自分のネクサスを全破壊し、その数だけ相手がスピリットを破壊 ===")
{
    const s = createGame("tidaltide-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    put(s, "p1", "BS04-010", 1) // シンボル2つ（使用条件）
    putNexus(s, "p1", "BS01-098", 0)
    putNexus(s, "p1", "BS01-098", 0)
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-017", 1)
    put(s, "p2", "BS01-007", 1)
    resolveMagic(s, "p1", "BS04-114", "main")
    assert(s.players.p1.field.nexuses.length === 0, "自分のネクサスはすべて破壊される")
    assert(
        s.players.p2.field.spirits.length === 1,
        `相手はネクサス2つぶん＝2体を破壊する（実際: ${String(s.players.p2.field.spirits.length)}体残り）`,
    )
}

console.log("=== BS03-062 チワール：Lv2以上で系統「小玩」の自分のスピリットは破壊時に手札へ戻る ===")
{
    const s = createGame("chiwal-komono", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS01-098", 0) // ダミー（発生源以外の並びを作る）
    put(s, "p1", "BS03-062", 3) // チワール Lv2
    const komono = put(s, "p1", "BS02-054", 1) // ポム（系統：小玩）
    const handBefore = s.players.p1.hand.length
    destroySpirit(s, "p1", komono.instanceId, "destroy")
    assert(s.players.p1.field.spirits.every((x) => x.instanceId !== komono.instanceId), "ポムは場を離れる")
    assert(s.players.p1.hand.length === handBefore + 1, "手札に戻る（トラッシュではない）")
    assert(s.players.p1.hand.includes("BS02-054"), "戻ったのはポム")
}

console.log("=== BS02-080 エメラルドに輝く鍾乳洞：Lv2はコア3個以上の勝利でネクサスにコア1個 ===")
{
    const s = createGame("emerald-battlewon", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const nexus = putNexus(s, "p1", "BS02-080", 3) // Lv2
    const winner = put(s, "p1", "BS01-007", 3) // コア3個
    fireBattleWonTriggers(s, "p1", winner, "attacker")
    assert(nexus.cores === 4, `ネクサスにコア1個追加（実際: ${String(nexus.cores)}）`)

    const s2 = createGame("emerald-fewcores", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s2)
    const nexus2 = putNexus(s2, "p1", "BS02-080", 3)
    const winner2 = put(s2, "p1", "BS01-007", 2) // コア2個
    fireBattleWonTriggers(s2, "p1", winner2, "attacker")
    assert(nexus2.cores === 3, "コア2個の勝利では発火しない")
}

console.log("=== BS04-008 古竜魔人バ・ゴゥ：Lv2以上で竜人/古竜の勝利時に1ドロー ===")
{
    const s = createGame("bagou-battlewon", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const bagou = put(s, "p1", "BS04-008", 3) // Lv2（コア3個）
    const handBefore = s.players.p1.hand.length
    fireBattleWonTriggers(s, "p1", bagou, "attacker") // バ・ゴゥ自身が竜人/古竜
    assert(s.players.p1.hand.length === handBefore + 1, "竜人/古竜の勝利で1ドロー")

    const other = put(s, "p1", "BS01-001", 1) // ゴラドン（爬獣）
    const handBefore2 = s.players.p1.hand.length
    fireBattleWonTriggers(s, "p1", other, "attacker")
    assert(s.players.p1.hand.length === handBefore2, "系統が違えばドローしない")
}

console.log("=== BS04-050 ハートレス・ティン：Lv2は相手エンドステップに白シンボル3つ＋ノーアタックで1ドロー ===")
{
    const s = createGame("heartless-end", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p2" // 相手のターン
    s.phase = "end"
    put(s, "p1", "BS04-050", 3) // ハートレス・ティン Lv2（黄シンボル）
    // 白シンボルを3つ用意する（燃えさかる戦場は赤なので白のカードを使う）
    put(s, "p1", "BS01-093", 1) // 甲精ディース（白）
    put(s, "p1", "BS01-093", 1)
    put(s, "p1", "BS01-093", 1)
    s.attacksThisTurn = 0
    const handBefore = s.players.p1.hand.length
    fireStepTriggers(s, "end")
    assert(s.players.p1.hand.length === handBefore + 1, "条件を満たすと1ドロー")

    s.attacksThisTurn = 1
    const handBefore2 = s.players.p1.hand.length
    fireStepTriggers(s, "end")
    assert(s.players.p1.hand.length === handBefore2, "このターンにアタックがあればドローしない")
}

console.log("=== BS03-097 鷹人ホークアイ：Lv2は自分の紫ネクサスがある間ブロックされない ===")
{
    const s = createGame("hawkeye-unblockable", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const hawk = put(s, "p1", "BS03-097", 5) // Lv2（コア5個）
    const cons = () => activeConstraints(s, "p1", hawk).some((c) => c.type === "unblockableBy")
    assert(!cons(), "紫のネクサスが無ければブロックされない制約は働かない")
    putNexus(s, "p1", "BS02-079", 0) // 紫水晶の森（紫のネクサス）
    assert(cons(), "紫のネクサスがあるとブロックされない")
}

console.log("=== BS05-054 鉄槌のオズワルド：Lv2はネクサス破壊に加えて相手の手札を1枚破棄 ===")
{
    const s = createGame("oswald-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const oswald = put(s, "p1", "BS05-054", 6) // Lv2（コア6個）
    putNexus(s, "p2", "BS01-098", 0)
    s.players.p2.hand = ["BS01-001", "BS01-017"]
    fireTrigger(s, "p1", oswald, "onAttack")
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサスを破壊する")
    assert(s.players.p2.hand.length === 1, "相手の手札が1枚破棄される")
}

console.log("=== BS05-054 鉄槌のオズワルド：Lv1では手札破棄はしない ===")
{
    const s = createGame("oswald-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const oswald = put(s, "p1", "BS05-054", 1) // Lv1
    putNexus(s, "p2", "BS01-098", 0)
    s.players.p2.hand = ["BS01-001", "BS01-017"]
    fireTrigger(s, "p1", oswald, "onAttack")
    assert(s.players.p2.field.nexuses.length === 0, "ネクサスは破壊される")
    assert(s.players.p2.hand.length === 2, "Lv1では手札は破棄されない")
}
