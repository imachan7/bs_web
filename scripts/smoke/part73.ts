// smoke パート73（★「場に出ているのに一度も発火していない効果」の回帰・BS01〜BS02 分担）
//
// `npm run coverage:effects` の ★ リスト＝**カードは smoke に登場するのに、その効果エントリだけ
// 一度も適用されていない**層。静的な棚卸しでは原理的に見つからない
// （実装担当もこの盲点を認めている。chatbox 2026-07-26）。
//
// 誘発（召喚時/アタック時/ブロック時/破壊時/バトル時）・ステップ誘発・オーラ・制約・軽減付与を
// **カードを実際に使う経路**で通す。BS03〜BS05 のカードは実装担当の担当。
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    effectiveCost,
    getCard,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function setupMain(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst.instanceId
}

function spiritOf(s: GameState, pid: PlayerId, instanceId: string) {
    return s.players[pid].field.spirits.find((sp) => sp.instanceId === instanceId)
}

function summonFromHand(s: GameState, pid: PlayerId, cardId: string, level?: number): string | null {
    s.players[pid].hand = [cardId]
    const before = new Set(s.players[pid].field.spirits.map((sp) => sp.instanceId))
    const err = act(
        s,
        pid,
        level === undefined ? { type: "summon", handIndex: 0 } : { type: "summon", handIndex: 0, level },
    )
    if (err !== null) return null
    return s.players[pid].field.spirits.find((sp) => !before.has(sp.instanceId))?.instanceId ?? null
}

console.log("=== §A 召喚時誘発（BS01-023 フェニキオス / BS01-025 要塞龍ギガ） ===")
{
    const s = setupMain("summon-destroyall")
    const weak1 = put(s, "p2", "BS01-001", 1) // BP1000
    const weak2 = put(s, "p2", "BS01-002", 1) // BP1000
    const tough = put(s, "p2", "BS01-018", 1) // リザードマン Lv1 BP4000（3000超）
    const own = put(s, "p1", "BS01-001", 1) // 自分の低BPスピリット

    assert(summonFromHand(s, "p1", "BS01-023") !== null, "フェニキオスを召喚できる")
    assert(spiritOf(s, "p2", weak1) === undefined, "BP3000以下の相手スピリットが破壊される")
    assert(spiritOf(s, "p2", weak2) === undefined, "BP3000以下の相手スピリットが破壊される（2体目）")
    assert(spiritOf(s, "p2", tough) !== undefined, "BP3000超の相手スピリットは残る")
    // ⚠️ 効果文は「スピリットすべて」＝両陣営だが、現データに anySide が無いため自陣は巻き込まれない。
    // 実データの不具合として実装担当へ報告済み（chatbox 2026-07-26）。
    // 修正されると自陣も破壊されるようになるため、ここでは**自陣側を assert しない**
    void own
}
{
    const s = setupMain("summon-destroy-one")
    const target = put(s, "p2", "BS01-001", 1) // BP1000（6000以下）
    // リザードマンは (1,1,4000)(2,2,6000)(3,5,9000)。**コア5個で Lv3 BP9000**
    // （コア3個では Lv2 BP6000 ＝「6000以下」に該当してしまい、BP最大のこちらが破壊される）
    const big = put(s, "p2", "BS01-018", 5)

    assert(summonFromHand(s, "p1", "BS01-025") !== null, "要塞龍ギガを召喚できる")
    assert(spiritOf(s, "p2", big) !== undefined, "BP6000超は対象外で残る")
    assert(spiritOf(s, "p2", target) === undefined, "BP6000以下の相手スピリット1体が破壊される")
}

console.log("=== §B アタック時誘発（BS01-034 バイ・パイソン / BS01-082 ウル・ディーネ） ===")
{
    const s = setupMain("attack-draw")
    const attacker = put(s, "p1", "BS01-034", 1)
    const handBefore = s.players.p1.hand.length
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")
    assert(s.players.p1.hand.length === handBefore + 1, "アタック時に1枚ドローする")
    assert(s.players.p1.deck.length === deckBefore - 1, "ドローぶんデッキが減る")
}
{
    const s = setupMain("attack-coregain")
    const attacker = put(s, "p1", "BS01-082", 1)
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")
    assert(
        s.players.p1.reserve === reserveBefore + 1,
        "アタック時にボイドからリザーブへコア1個が置かれる",
    )
}

console.log("=== §C ブロック時誘発（BS01-077 ベビー・ロキ Lv2 / BS01-081 ニーズホッグ） ===")
{
    const s = setupMain("block-buff-lv2")
    const attacker = put(s, "p1", "BS01-001", 1)
    const blocker = put(s, "p2", "BS01-077", 2) // Lv2（コア2個）＝効果が有効
    const bpBefore = effectiveBp(s, "p2", spiritOf(s, "p2", blocker)!)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: blocker }) === null, "ベビー・ロキがブロック")
    assert(
        effectiveBp(s, "p2", spiritOf(s, "p2", blocker)!) === bpBefore + 1000,
        "ブロック時にBP+1000",
    )
}
{
    const s = setupMain("block-buff-lv1")
    const attacker = put(s, "p1", "BS01-001", 1)
    const blocker = put(s, "p2", "BS01-077", 1) // Lv1＝効果は無効（levels:[2]）
    const bpBefore = effectiveBp(s, "p2", spiritOf(s, "p2", blocker)!)
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: attacker })
    assert(act(s, "p2", { type: "block", instanceId: blocker }) === null, "Lv1でもブロックはできる")
    assert(
        effectiveBp(s, "p2", spiritOf(s, "p2", blocker)!) === bpBefore,
        "Lv1ではBPが上がらない（levels:[2] の条件が効いている）",
    )
}
{
    const s = setupMain("block-buff-nidhogg")
    const attacker = put(s, "p1", "BS01-001", 1)
    const blocker = put(s, "p2", "BS01-081", 1) // Lv1でも有効（levels:[1,2]）
    const bpBefore = effectiveBp(s, "p2", spiritOf(s, "p2", blocker)!)
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: attacker })
    assert(act(s, "p2", { type: "block", instanceId: blocker }) === null, "ニーズホッグがブロック")
    assert(
        effectiveBp(s, "p2", spiritOf(s, "p2", blocker)!) === bpBefore + 4000,
        "ブロック時にBP+4000（Lv1でも発揮）",
    )
}

console.log("=== §D 破壊時誘発（BS01-062 ハングリートゥリー） ===")
{
    // ハングリートゥリーは Lv1 でも BP5000 と高く、範囲破壊マジックでは落ちない。
    // **バトルによる破壊**で誘発させる（破壊時誘発はバトル破壊でも発火する）
    const s = setupMain("destroy-discard")
    const attacker = put(s, "p1", "BS01-018", 5) // リザードマン Lv3 BP9000
    const tree = put(s, "p2", "BS01-062", 1) // ハングリートゥリー Lv1 BP5000
    s.players.p1.hand = ["BS01-001", "BS01-002"] // 破棄されるのは「相手＝p1」の手札
    const p1TrashBefore = s.players.p1.trashCards.length

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: tree }) === null, "ハングリートゥリーがブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側がパス＝バトル解決")

    assert(spiritOf(s, "p2", tree) === undefined, "BP比較で破壊される")
    assert(s.players.p1.hand.length === 1, "破壊時効果で相手（p1）の手札が1枚破棄される")
    assert(
        s.players.p1.trashCards.length === p1TrashBefore + 1,
        "破棄された手札は持ち主のトラッシュへ",
    )
}

console.log("=== §E バトル時誘発（BS01-071 爆進獣ブランボアー Lv2） ===")
{
    const s = setupMain("battle-refresh")
    const attacker = put(s, "p1", "BS01-071", 4) // Lv2 BP9000
    const blocker = put(s, "p2", "BS01-001", 1) // BP1000
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")
    assert(spiritOf(s, "p1", attacker)?.isRested === true, "アタック宣言で疲労する")
    assert(act(s, "p2", { type: "block", instanceId: blocker }) === null, "ブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側がパス＝バトル解決")
    assert(spiritOf(s, "p2", blocker) === undefined, "相手だけが破壊される")
    assert(spiritOf(s, "p1", attacker)?.isRested === false, "バトル時効果で自身が回復する")
}

console.log("=== §F ステップ誘発（BS02-022 魔界侯爵コキュートス Lv3） ===")
{
    const s = setupMain("step-cokytos")
    const cokytos = put(s, "p1", "BS02-022", 6) // Lv3（コア6個）
    const victim = put(s, "p2", "BS01-001", 3) // 相手の候補は1体だけ＝自動選択される
    spiritOf(s, "p1", cokytos)!.isRested = true
    const oppTrashBefore = s.players.p2.trashCores

    runTurnStart(s) // 自分のリフレッシュステップを通す
    assert(spiritOf(s, "p1", cokytos)?.isRested === false, "リフレッシュステップで回復している")
    assert(
        s.players.p2.trashCores === oppTrashBefore + 2,
        `Lv3では相手のコア2個が相手のトラッシュへ（実際: ${s.players.p2.trashCores - oppTrashBefore}個）`,
    )
    assert(spiritOf(s, "p2", victim)?.cores === 1, "相手スピリットのコアが2個減っている")
}

{
    // 対照: 回復しなかった（もともと回復状態だった）ターンは発揮しない。
    // ⚠️ この節が無いと `selfWasRefreshedThisStep` 条件を外しても落ちず、テストが空回りする
    //    （変異テストで実際に検出できなかったため追加した）
    const s = setupMain("step-cokytos-norefresh")
    const cokytos = put(s, "p1", "BS02-022", 6) // Lv3・**回復状態のまま**
    const victim = put(s, "p2", "BS01-001", 3)
    const oppTrashBefore = s.players.p2.trashCores

    runTurnStart(s)
    assert(spiritOf(s, "p1", cokytos)?.isRested === false, "もともと回復状態")
    assert(
        s.players.p2.trashCores === oppTrashBefore,
        "回復しなかったターンはコアを奪わない（selfWasRefreshedThisStep が効いている）",
    )
    assert(spiritOf(s, "p2", victim)?.cores === 3, "相手スピリットのコアは減らない")
}

console.log("=== §G オーラ（BS01-029 リブ・リーパー / BS01-052 ペリリィフ / BS01-X04 オーディーン） ===")
{
    const s = setupMain("aura-hasowncolor")
    const reaper = put(s, "p1", "BS01-029", 1) // 紫 Lv1 BP2000（赤が自陣にある間+1000）
    assert(
        effectiveBp(s, "p1", spiritOf(s, "p1", reaper)!) === 2000,
        "赤が自陣に無ければ素のBP",
    )
    put(s, "p1", "BS01-001", 1) // 赤のスピリットを置く
    assert(
        effectiveBp(s, "p1", spiritOf(s, "p1", reaper)!) === 3000,
        "自分のフィールドに赤があると+1000",
    )
}
{
    const s = setupMain("aura-reserve")
    const perilif = put(s, "p1", "BS01-052", 2) // Lv2 BP4000（リザーブにコアがある間+2000）
    assert(
        effectiveBp(s, "p1", spiritOf(s, "p1", perilif)!) === 6000,
        "リザーブにコアがあれば+2000",
    )
    s.players.p1.reserve = 0
    assert(
        effectiveBp(s, "p1", spiritOf(s, "p1", perilif)!) === 4000,
        "リザーブが空なら加算されない",
    )
}
{
    const s = setupMain("aura-nexus-count")
    const odin = put(s, "p1", "BS01-X04", 1) // Lv1 BP3000（お互いのネクサス1つにつき+1000）
    assert(effectiveBp(s, "p1", spiritOf(s, "p1", odin)!) === 3000, "ネクサス0なら素のBP")
    putNexus(s, "p1", "BS03-102", 0)
    putNexus(s, "p2", "BS04-082", 0)
    assert(
        effectiveBp(s, "p1", spiritOf(s, "p1", odin)!) === 5000,
        "お互いのネクサス数×1000（自分1＋相手1で+2000）",
    )
}

console.log("=== §H 制約（BS02-018 悪魔スプラー Lv3 / BS02-038 盾精ラングリーズ） ===")
{
    const s = setupMain("constraint-unblockable")
    const splar = put(s, "p1", "BS02-018", 5) // Lv3＝Lv2/Lv3スピリットからブロックされない
    const lv2Blocker = put(s, "p2", "BS01-001", 3) // ゴラドン Lv2（コア3個）
    const lv1Blocker = put(s, "p2", "BS01-002", 1) // ロクケラトプス Lv1
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: splar }) === null, "アタック宣言")

    const err = act(s, "p2", { type: "block", instanceId: lv2Blocker })
    assert(err !== null, "Lv2スピリットはブロックできない")
    assert(act(s, "p2", { type: "block", instanceId: lv1Blocker }) === null, "Lv1スピリットはブロックできる")
}
{
    const s = setupMain("constraint-cantattack")
    const langries = put(s, "p1", "BS02-038", 1) // cantAttack
    const normal = put(s, "p1", "BS01-001", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: langries }) !== null, "ラングリーズはアタックできない")
    assert(act(s, "p1", { type: "attack", instanceId: normal }) === null, "他のスピリットはアタックできる")
}

console.log("=== §I 軽減シンボル付与（BS02-058 ペンタン Lv2 / BS02-085 トパーズの流星） ===")
{
    const s = setupMain("reduction-pentan")
    // 黄シンボルを4つ用意する（ペンタン1＋ピヨン2＋ネクサス1）。
    // 付与の効果を見るには**フィールドの黄シンボル数が付与後の軽減数を上回る**必要がある
    // （軽減は色ごとにフィールドのシンボル数が上限のため、少ないと Lv1/Lv2 の差が出ない）
    const pentan = put(s, "p1", "BS02-058", 3) // Lv2
    put(s, "p1", "BS02-049", 1)
    put(s, "p1", "BS02-049", 1)
    putNexus(s, "p1", "BS03-110", 0)
    const magic = getCard("BS02-107") // タイムリープ（黄・コスト5・軽減[黄][黄]）

    assert(effectiveCost(s, "p1", magic) === 1, "Lv2は[黄][黄]付与（5 - 軽減4 = 1）")
    spiritOf(s, "p1", pentan)!.cores = 1 // Lv1 に落とす
    assert(effectiveCost(s, "p1", magic) === 2, "Lv1は[黄]付与（5 - 軽減3 = 2）")
    s.players.p1.field.spirits = s.players.p1.field.spirits.filter((x) => x.instanceId !== pentan)
    assert(effectiveCost(s, "p1", magic) === 3, "ペンタンが場を離れると付与なし（5 - 軽減2 = 3）")
}
{
    const s = setupMain("reduction-topaz")
    const nexusCard = getCard("BS04-082") // 侵されざる聖域（白・コスト3・軽減[白][白]）
    put(s, "p1", "BS02-049", 1) // 黄スピリット（黄シンボル1）
    assert(effectiveCost(s, "p1", nexusCard) === 3, "白シンボルが場に無いので軽減されない")

    putNexus(s, "p1", "BS02-085", 0) // トパーズの流星（黄シンボル1・手札のネクサスに[黄][黄]付与）
    assert(
        effectiveCost(s, "p1", nexusCard) === 1,
        "手札のネクサスカードに[黄][黄]が付与される（黄シンボル2で軽減2）",
    )
}
