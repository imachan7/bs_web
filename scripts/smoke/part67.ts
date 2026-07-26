// smoke パート67（BS05 batchB 残り5枚＋BS04-082侵されざる聖域：エンジン拡張の検証）
// 新設した機構:
//   - constraint "tenshoCoreSubstitute"（【転召】対象時、疲労することでコアを維持する代替。白亜の竜使いアルブス）
//   - immunityGrant の familyFilter（OR配列）・includeSelf・colorFilter・condition ownCostCountAtLeast
//     （白亜の竜使いアルブスLv2-3／リトルナイト・ランスロット）
//   - globalConstraint "battlingCoresProtected"（バトル中の両陣営スピリットのコアが効果で取り除かれない。茨の決戦地）
//   - fieldEvent "anySpiritAttacked" の colorFilter（アタックしたスピリットの色で絞る。天焦がす大聖火）
//   - action "deckReveal" の nameIncludes/discardNonMatching（天焦がす大聖火）
//   - kind:"exhaustOnManualCoreAdd" の trigger:"effect"/onRemove（効果によるコア増減で疲労。アブソーブシンボル）
//   - kind:"keywordGrant" の costFilter（コスト範囲で対象を絞る継続付与。侵されざる聖域）
//   - globalConstraint "millCap" の perTurn（ターン累計の破棄上限。侵されざる聖域Lv2）
import {
    assert,
    act,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { hasArmorAgainst, hasMagicImmunity } from "../../shared/rules"
import { effectiveCost } from "../../server/src/logic/RuleValidator"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst.instanceId
}

console.log("=== BS05-034 白亜の竜使いアルブス：【転召】対象時、疲労していなければ疲労することでコアを維持する ===")
{
    const s = createGame("bs05-034-tensho", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    const albus = putSpirit(s, "p1", "BS05-034", 3) // コスト6・転召の候補になれる（>=5）
    s.players.p1.reserve = 30
    s.players.p1.hand[0] = "BS04-010" // 雷帝エール・クレル（転召：コスト5以上/トラッシュ）
    const trashCoresBefore = s.players.p1.trashCores
    const summonCost = effectiveCost(s, "p1", getCard("BS04-010"))
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "雷帝エール・クレルを召喚できる")
    const albusInst = s.players.p1.field.spirits.find((x) => x.instanceId === albus)!
    assert(albusInst.cores === 3, "アルブスはコアを失わない（疲労することで代替）")
    assert(albusInst.isRested === true, "アルブスは疲労する")
    assert(
        s.players.p1.trashCores === trashCoresBefore + summonCost,
        "トラッシュのコアは召喚コスト分のみ増える（転召でコアを実際には失っていない）",
    )
}

console.log("=== BS05-034：すでに疲労中の場合は代替が使えず、通常の転召（コアをトラッシュへ）になる ===")
{
    const s = createGame("bs05-034-tensho-rested", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    const albus = putSpirit(s, "p1", "BS05-034", 3)
    s.players.p1.field.spirits.find((x) => x.instanceId === albus)!.isRested = true
    s.players.p1.reserve = 30
    s.players.p1.hand[0] = "BS04-010"
    const trashCoresBefore = s.players.p1.trashCores
    const summonCost = effectiveCost(s, "p1", getCard("BS04-010"))
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === albus),
        "疲労中は代替が使えず、維持コア割れでアルブスは消滅する",
    )
    assert(s.players.p1.trashCards.includes("BS05-034"), "アルブスはトラッシュへ")
    assert(
        s.players.p1.trashCores === trashCoresBefore + summonCost + 3,
        "召喚コスト分＋転召で移したコア3個がトラッシュに置かれる（通常の転召と同じ挙動）",
    )
}

console.log("=== BS05-034 Lv2-3：このスピリットと系統「龍帝」/「虚神」を持つ自分のスピリットは相手のマジックの効果を受けない ===")
{
    const s = createGame("bs05-034-immunity", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const albus = putSpirit(s, "p1", "BS05-034", 3) // Lv2（cores3）。系統は竜騎/機人で「龍帝」を持たない
    const ryutei = putSpirit(s, "p1", "BS04-010", 1) // 雷帝エール・クレル：系統に「龍帝」を持つ
    const other = putSpirit(s, "p1", "BS01-001", 1) // 系統無関係
    const albusInst = s.players.p1.field.spirits.find((x) => x.instanceId === albus)!
    const ryuteiInst = s.players.p1.field.spirits.find((x) => x.instanceId === ryutei)!
    const otherInst = s.players.p1.field.spirits.find((x) => x.instanceId === other)!
    assert(
        hasMagicImmunity(s, "p1", albusInst) === true,
        "アルブス自身は「龍帝」を持たないが、includeSelfにより免疫を持つ",
    )
    assert(hasMagicImmunity(s, "p1", ryuteiInst) === true, "「龍帝」系統を持つ自分のスピリットも免疫を持つ")
    assert(hasMagicImmunity(s, "p1", otherInst) === false, "系統も自身でもないスピリットは免疫を持たない")
}

console.log("=== BS05-044 リトルナイト・ランスロット：コスト2が3体以上いる間、自分の黄のスピリットは相手のマジックの効果を受けない ===")
{
    const s = createGame("bs05-044-immunity", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    putSpirit(s, "p1", "BS05-044", 1) // ランスロット本体
    const c1 = putSpirit(s, "p1", "BS01-003", 1) // コスト2
    const c2 = putSpirit(s, "p1", "BS01-004", 1) // コスト2
    const c3 = putSpirit(s, "p1", "BS01-005", 1) // コスト2（これで3体）
    const yellow = putSpirit(s, "p1", "BS02-049", 1) // 黄のスピリット
    const yellowInst = s.players.p1.field.spirits.find((x) => x.instanceId === yellow)!
    const c1Inst = s.players.p1.field.spirits.find((x) => x.instanceId === c1)!
    assert(hasMagicImmunity(s, "p1", yellowInst) === true, "コスト2が3体以上いる間、黄のスピリットは免疫を持つ")
    assert(hasMagicImmunity(s, "p1", c1Inst) === false, "黄でないスピリットは対象外（colorFilter）")

    // 境界確認：コスト2が2体に減ると条件を満たさなくなる
    s.players.p1.field.spirits = s.players.p1.field.spirits.filter((x) => x.instanceId !== c3)
    assert(
        hasMagicImmunity(s, "p1", yellowInst) === false,
        "コスト2のスピリットが2体に減ると免疫を失う（条件の閾値確認）",
    )
}

console.log("=== BS05-060 茨の決戦地：自分のアタックステップ中、バトルをしている両陣営スピリットのコアは効果で取り除かれない ===")
{
    const s = createGame("bs05-060-protect", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS05-060", 1) // Lv2
    const attacker = putSpirit(s, "p1", "BS01-001", 3)
    const blocker = putSpirit(s, "p2", "BS01-002", 3)
    s.battle = {
        attackerInstanceId: attacker,
        blockerInstanceId: blocker,
        flashLockedPlayer: null,
        directed: false,
    }
    const attackerInst = s.players.p1.field.spirits.find((x) => x.instanceId === attacker)!
    const blockerInst = s.players.p2.field.spirits.find((x) => x.instanceId === blocker)!

    resolveAction(s, "p2", null, { type: "coreRemove", count: 5 }, attacker)
    resolveAction(s, "p1", null, { type: "coreRemove", count: 5 }, blocker)
    assert(attackerInst.cores === 3, "バトル中のアタッカーはコアを取り除かれない")
    assert(blockerInst.cores === 3, "バトル中のブロッカーも取り除かれない（両陣営が対象）")

    // 対照：自分（茨の決戦地の持ち主）のアタックステップでなくなれば保護されない
    s.phase = "main"
    resolveAction(s, "p2", null, { type: "coreRemove", count: 5 }, attacker)
    assert(attackerInst.cores === 0, "自分のアタックステップ以外では保護されない（対照実験）")
}

console.log("=== BS05-066 天焦がす大聖火：自分の青のスピリットのアタックでデッキ上1枚を公開し、「巨人」なら手札へ・それ以外は破棄 ===")
{
    const s = createGame("bs05-066-pick", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS05-066", 0) // Lv1
    const blueSpirit = putSpirit(s, "p1", "BS03-071", 1)
    s.players.p1.deck.unshift("BS05-033") // 巨人機ユミール
    const handBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: blueSpirit }) === null, "青スピリットでアタック")
    assert(s.players.p1.hand.includes("BS05-033"), "「巨人」を含むスピリットカードは手札に加わる")
    assert(s.players.p1.hand.length === handBefore + 1, "手札が1枚増える")
}

console.log("=== BS05-066：「巨人」を含まないカードはトラッシュへ破棄される（discardNonMatching） ===")
{
    const s = createGame("bs05-066-discard", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS05-066", 0)
    const blueSpirit = putSpirit(s, "p1", "BS03-071", 1)
    s.players.p1.deck.unshift("BS01-001") // 「巨人」を含まないスピリット
    const handBefore = s.players.p1.hand.length
    const trashBefore = s.players.p1.trashCards.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: blueSpirit }) === null, "青スピリットでアタック")
    assert(s.players.p1.hand.length === handBefore, "手札は増えない")
    assert(
        s.players.p1.trashCards.length === trashBefore + 1 && s.players.p1.trashCards.includes("BS01-001"),
        "一致しなかったカードはデッキの下でなくトラッシュへ破棄される",
    )
}

console.log("=== BS05-066：赤のスピリットのアタックでは発火しない（colorFilter） ===")
{
    const s = createGame("bs05-066-colorfilter", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS05-066", 0)
    const redSpirit = putSpirit(s, "p1", "BS01-001", 1) // 赤
    s.players.p1.deck.unshift("BS05-033")
    const deckBefore = [...s.players.p1.deck]
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: redSpirit }) === null, "赤スピリットでアタック")
    assert(
        s.players.p1.deck.length === deckBefore.length && s.players.p1.deck[0] === "BS05-033",
        "赤のスピリットのアタックではデッキ公開が発火しない",
    )
}

// 1回のバトルをアタック宣言〜ブロック省略まで進め、防御側パスで攻撃側に優先権を渡す共通手順
function attackThenPassToAttacker(s: GameState, attackerId: string): void {
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attackerId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "p2がパスし、p1に優先権が移る")
    assert(s.priorityPlayer === "p1", "p1が優先権を持つ")
}

console.log(
    "=== BS05-072 アブソーブシンボル：実際にcastMagicで使用し、相手スピリットへの効果によるコア増加・減少どちらでも疲労する（ターン終了で消える） ===",
)
{
    const s = createGame("bs05-072", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const attacker = putSpirit(s, "p1", "BS01-008", 1)
    s.players.p1.hand = ["BS05-072"]
    s.players.p1.reserve = 20
    attackThenPassToAttacker(s, attacker)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "p1がアブソーブシンボルをフラッシュで使用")
    assert(act(s, "p2", { type: "takeLife" }) === null, "p2がライフで受けてバトル終了")

    s.players.p2.reserve = 20
    const target = putSpirit(s, "p2", "BS01-005", 2)
    const targetInst = s.players.p2.field.spirits.find((x) => x.instanceId === target)!

    resolveAction(s, "p2", null, { type: "coreCharge", count: 1 }, target)
    assert(targetInst.isRested === true, "相手(p1)の貸与中の効果で、コアが増えたp2のスピリットは疲労する")

    targetInst.isRested = false
    resolveAction(s, "p2", targetInst, { type: "coreRemoveSelf", count: 1 })
    assert((targetInst.isRested as boolean) === true, "コアが減った場合も疲労する（onRemove）")

    targetInst.isRested = false
    targetInst.cores = 2
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了→貸与が消える")
    resolveAction(s, "p2", null, { type: "coreCharge", count: 1 }, target)
    assert(targetInst.isRested === false, "ターン終了後は貸与が消え、コア増加では疲労しない")
}

console.log(
    "=== BS02-078 夢魔の寝所：既存のtrigger省略(=manual)の挙動は変わらない（相手の手動コア増加でのみ疲労、効果によるコア増加では疲労しない） ===",
)
{
    const s = createGame("bs02-078-regression", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS02-078", 3) // 夢魔の寝所（p1所有）
    s.turnPlayer = "p2"
    s.phase = "main"
    const target = putSpirit(s, "p2", "BS01-005", 2)
    s.players.p2.reserve = 10
    const targetInst = s.players.p2.field.spirits.find((x) => x.instanceId === target)!

    assert(act(s, "p2", { type: "moveCore", instanceId: target, direction: "add" }) === null, "p2が手動でコアを追加")
    assert(targetInst.isRested === true, "相手(p1視点)の手動コア増加で疲労する（従来通り）")

    targetInst.isRested = false
    resolveAction(s, "p2", null, { type: "coreCharge", count: 1 }, target)
    assert(
        targetInst.isRested === false,
        "trigger省略(=manual)は効果によるコア増加には反応しない（trigger:\"effect\"との切り分け）",
    )
}

console.log("=== BS04-082 侵されざる聖域：Lv1-2でコスト8以上の自分のスピリットに装甲：紫/緑/白/黄/青を付与、コスト7以下は対象外 ===")
{
    const s = createGame("bs04-082-armor", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS04-082", 0) // Lv1
    const big = putSpirit(s, "p1", "BS01-025", 1) // コスト8
    const small = putSpirit(s, "p1", "BS01-023", 1) // コスト7（境界確認）
    refreshLevelAsOverrides(s)
    const bigInst = s.players.p1.field.spirits.find((x) => x.instanceId === big)!
    const smallInst = s.players.p1.field.spirits.find((x) => x.instanceId === small)!
    assert(hasArmorAgainst(bigInst, ["purple"]) === true, "コスト8以上は装甲：紫を受ける")
    assert(hasArmorAgainst(bigInst, ["red"]) === false, "指定色以外(赤)には装甲が効かない")
    assert(hasArmorAgainst(smallInst, ["purple"]) === false, "コスト7は対象外（costFilterの境界確認）")
}

console.log("=== BS04-082 侵されざる聖域Lv2：自分のデッキは相手の効果でターンに5枚までしか破棄されない（累計） ===")
{
    const s = createGame("bs04-082-mill", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS04-082", 2) // Lv2
    const deckBefore = s.players.p1.deck.length
    assert(deckBefore >= 20, "テスト前提：p1のデッキが十分残っている")

    resolveAction(s, "p2", null, { type: "mill", count: 3 })
    assert(s.players.p1.deck.length === deckBefore - 3, "1回目の3枚は上限内でそのまま破棄される")

    resolveAction(s, "p2", null, { type: "mill", count: 10 })
    assert(
        s.players.p1.deck.length === deckBefore - 5,
        "ターン累計5枚を超える分は追加破棄されない（3+10のうち合計5枚のみ）",
    )

    const deckBefore2 = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "mill", count: 10, side: "own" })
    assert(s.players.p1.deck.length === deckBefore2 - 10, "自分自身の効果によるミルはmillCapの対象外")

    assert(act(s, "p1", { type: "endTurn" }) === null, "ターン終了でmillCountThisTurnがリセットされる")
    const deckBefore3 = s.players.p1.deck.length
    resolveAction(s, "p2", null, { type: "mill", count: 10 })
    assert(
        s.players.p1.deck.length === deckBefore3 - 5,
        "ターンが変わればまた5枚まで破棄できる",
    )
}
