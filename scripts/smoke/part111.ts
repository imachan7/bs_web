// smoke パート111（§5-B バッチ：小さな器を足せば書ける4枚）
// 新設した機構:
//   - exhaust の excludeTarget（誘発が渡すイベント対象を「除外」として扱う。甲精ディース）
//   - kind:"coreReturnBonus"（効果でリザーブへ置かれるコアを+N。coreBonus の逆向き。チャウーLv2）
//   - battleWon の winnerKeywordFilter（勝利したスピリットのキーワードで絞る。熾烈極める最前線Lv2）
//   - TargetFilter.sameBpAsBattleLoser ＋ GameState.lastBattleDestroyedBp
//   - ConstraintDef.immuneToOpponentSummonEffects ＋ GameState.resolvingSummonTriggerPid
//     （『このスピリットの召喚時』効果の解決中だけ立つフラグ。リトルナイト・ランスロットLv3）
import {
    assert,
    act,
    declareBlock,
    createGame,
    createInstance,
    getCard,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number) {
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
    assert(getCard("BS01-093").name === "甲精ディース", "BS01-093 は甲精ディース")
    assert(getCard("BS02-055").name === "チャウー", "BS02-055 はチャウー")
    assert(getCard("BS03-103").name === "熾烈極める最前線", "BS03-103 は熾烈極める最前線")
    assert(getCard("BS05-044").name === "リトルナイト・ランスロット", "BS05-044 はリトルナイト・ランスロット")
    assert(getCard("BS01-013").name === "タウロスナイト", "BS01-013 はタウロスナイト（覚醒持ち）")
    assert(getCard("BS01-063").name === "エメラルドシーザー", "BS01-063 はエメラルドシーザー（召喚時に相手1体を疲労）")
}

console.log("=== BS01-093 甲精ディース Lv1：ブロック宣言時、ブロックするスピリット以外を1体疲労させる ===")
{
    const s = createGame("bs01-093-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    const dis = putSpirit(s, "p1", "BS01-093", 1) // Lv1
    const blocker = putSpirit(s, "p2", "BS01-002", 3) // ロクケラトプス Lv3（BP最大側）
    const bystander = putSpirit(s, "p2", "BS01-001", 1) // ゴラドン
    assert(act(s, "p1", { type: "attack", instanceId: dis.instanceId }) === null, "ディースでアタックできる")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックできる")
    // ディースの『ブロックされたとき』効果はブロック宣言の時点で解決する（バトル解決はまだ先）
    assert(bystander.isRested === true, "ブロックしていない側が効果で疲労した（excludeTarget）")
    assert(blocker.isRested === false, "ブロックしたスピリットは効果の対象から除外される")
}

console.log("=== BS01-093：ブロッカー以外に候補がいなければ不発（ブロッカーを疲労させ直さない） ===")
{
    const s = createGame("bs01-093-none", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    const dis = putSpirit(s, "p1", "BS01-093", 1)
    const blocker = putSpirit(s, "p2", "BS01-002", 1) // 相手はこの1体だけ
    assert(act(s, "p1", { type: "attack", instanceId: dis.instanceId }) === null, "アタックできる")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックできる")
    // 自分側（ディース自身）は既にアタックで疲労しているので、疲労できる候補は他にいない
    assert(blocker.isRested === false, "唯一のブロッカーは除外されるため疲労しない（不発）")
}

console.log("=== BS02-055 チャウー Lv2：効果でリザーブへ置かれるコアが+1個される ===")
{
    const s = createGame("bs02-055-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    putSpirit(s, "p1", "BS02-055", 3) // チャウー Lv2
    const src = putSpirit(s, "p1", "BS01-001", 1)
    const victim = putSpirit(s, "p2", "BS01-002", 3) // コア3個
    const reserveBefore = s.players.p2.reserve
    resolveAction(s, "p1", src, { type: "coreRemove", count: 1 })
    assert(victim.cores === 1, `コア1個の除去が+1されて2個抜ける（実際 残り${victim.cores}）`)
    assert(
        s.players.p2.reserve === reserveBefore + 2,
        `抜けた2個は持ち主のリザーブへ（実際${s.players.p2.reserve - reserveBefore}）`,
    )
}

console.log("=== BS02-055 Lv1：coreReturnBonus は発揮されない（levels:[2]） ===")
{
    const s = createGame("bs02-055-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    putSpirit(s, "p1", "BS02-055", 1) // Lv1
    const src = putSpirit(s, "p1", "BS01-001", 1)
    const victim = putSpirit(s, "p2", "BS01-002", 3)
    resolveAction(s, "p1", src, { type: "coreRemove", count: 1 })
    assert(victim.cores === 2, `Lv1では+1されない（実際 残り${victim.cores}）`)
}

console.log("=== BS02-055 Lv2：元のコア数を超えては取れない ===")
{
    const s = createGame("bs02-055-cap", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    putSpirit(s, "p1", "BS02-055", 3) // Lv2
    const src = putSpirit(s, "p1", "BS01-001", 1)
    const victim = putSpirit(s, "p2", "BS01-002", 1) // コア1個しかない
    const reserveBefore = s.players.p2.reserve
    resolveAction(s, "p1", src, { type: "coreRemove", count: 1 })
    assert(
        s.players.p2.reserve === reserveBefore + 1,
        `置かれているコアを超えて取らない（実際${s.players.p2.reserve - reserveBefore}）`,
    )
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === victim.instanceId),
        "維持コア割れで消滅する",
    )
}

console.log("=== BS03-103 熾烈極める最前線 Lv2：覚醒持ちの勝利で、破壊された側と同BPの相手1体を破壊 ===")
{
    const s = createGame("bs03-103-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS03-103", 3) // Lv2
    const awaken = putSpirit(s, "p1", "BS01-013", 3) // タウロスナイト Lv2＝BP5000（覚醒持ち）
    const loser = putSpirit(s, "p2", "BS01-002", 3) // ロクケラトプス Lv3＝BP4000
    const sameBp = putSpirit(s, "p2", "BS01-002", 3) // もう1体のロクケラトプス Lv3＝同BP
    assert(getCard("BS01-002").levels[2]!.bp === 4000, "BS01-002 のLv3は BP4000（同BP判定の前提）")
    assert(act(s, "p1", { type: "attack", instanceId: awaken.instanceId }) === null, "アタックできる")
    assert(declareBlock(s, "p2", loser.instanceId) === null, "BP3000でブロックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === loser.instanceId),
        "BP比較でブロッカーが破壊される",
    )
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === sameBp.instanceId),
        "破壊された側と同BPの相手スピリットも破壊される（sameBpAsBattleLoser）",
    )
}

console.log("=== BS03-103 Lv2：覚醒を持たないスピリットの勝利では発火しない ===")
{
    const s = createGame("bs03-103-nokw", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS03-103", 3)
    const plain = putSpirit(s, "p1", "BS01-025", 3) // 要塞龍ギガ Lv2＝BP10000（覚醒を持たない）
    const loser = putSpirit(s, "p2", "BS01-002", 3) // BP4000
    const sameBp = putSpirit(s, "p2", "BS01-002", 3) // 同BP
    assert(act(s, "p1", { type: "attack", instanceId: plain.instanceId }) === null, "アタックできる")
    assert(declareBlock(s, "p2", loser.instanceId) === null, "ブロックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === sameBp.instanceId),
        "覚醒を持たない勝利では追加の破壊が起きない（winnerKeywordFilter）",
    )
}

console.log("=== BS05-044 リトルナイト・ランスロット Lv3：相手スピリットの召喚時効果を受けない ===")
{
    const s = createGame("bs05-044-lv3", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    s.phase = "main"
    const lancelot = putSpirit(s, "p1", "BS05-044", 5) // Lv3（コア5）
    s.players.p2.reserve = 30
    s.players.p2.hand[0] = "BS01-063" // エメラルドシーザー（召喚時：相手のスピリット1体を疲労）
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "エメラルドシーザーを召喚できる")
    assert(lancelot.isRested === false, "Lv3のランスロットは相手の召喚時効果を受けない")
    assert(s.resolvingSummonTriggerPid === undefined, "召喚時効果の解決後はフラグが片付いている")
}

console.log("=== BS05-044 Lv2：召喚時効果を受ける（levels:[3]） ===")
{
    const s = createGame("bs05-044-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    s.phase = "main"
    const lancelot = putSpirit(s, "p1", "BS05-044", 3) // Lv2（コア3）
    s.players.p2.reserve = 30
    s.players.p2.hand[0] = "BS01-063"
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    assert(lancelot.isRested === true, "Lv2では相手の召喚時効果で疲労する")
}

console.log("=== BS05-044 Lv3：自分の召喚時効果は受ける（相手の効果限定） ===")
{
    const s = createGame("bs05-044-own", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    const lancelot = putSpirit(s, "p1", "BS05-044", 5) // Lv3
    const src = putSpirit(s, "p1", "BS01-001", 1)
    // 自分の召喚時効果として解決する（フラグの持ち主＝p1＝ランスロットの持ち主なので免疫は効かない）
    s.resolvingSummonTriggerPid = "p1"
    resolveAction(s, "p1", src, { type: "exhaust", count: 1, anySide: true })
    delete s.resolvingSummonTriggerPid
    assert(lancelot.isRested === true, "自分の召喚時効果は通常どおり受ける")
}
