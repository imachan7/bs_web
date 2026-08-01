// smoke パート3（scripts/smoke.ts から機械分割）
// 収録セクション:
//   - battleRole: onBattleの役割限定（キングタウロス大公）
//   - battleWon: ネクサスのバトル結果誘発（無限蟲の蟻塚）
//   - battleWon: 古龍の縄張り（アタッカー勝利でドロー）
//   - 制約：必ずアタック（mustAttack、ウィル・オーブ）
//   - フィールドイベント誘発：命の果実（BS01-107、ownLifeDamaged）
//   - オーラ拡張（summonedThisTurnOnly）：風吹く丘陵 e2（BS01-109、このターン召喚されたスピリットのみBP+1000）
//   - ステップ誘発（coreRemoveSelf）：メラット（BS01-006、自分のスタートステップにコア1個をリザーブへ）
//   - フィールドイベント誘発：侵食されゆく銀世界 e2（BS01-113、相手のアタックステップに自分のスピリット破壊でコア獲得）
//   - selfBuffPer：スケルトン・ジョウ（BS01-016、アタック時に相手の回復スピリット数×BP+1000）
//   - voidCoreToSelf：キリカブト（BS01-065）／征空の翼アクィリーズ（BS01-069）の実召喚
//   - voidCoreToOther：スタッグローブ（BS01-066、アタック時に他のスピリットへボイドからコア1個）
//   - coreSqueezeAll：幻龍シェイロン e1（BS01-046、召喚時に全スピリットのコアを1個ずつだけ残す）
//   - unblockableBy maxCores：幻龍シェイロン e2（Lv2はコア1個のスピリットにブロックされない）
//   - バスタースピア（BS01-114、ネクサス破壊＋破壊できたら1ドロー）
//   - ステップ誘発の条件：主無き古城 e2（BS01-102 Lv2、手札が相手以下ならスタートステップに1ドロー）
//   - 遅延アタックステップ終了：サイレントウォール（BS01-144）
//   - フィールド全体制約：魔帝の墓標（BS01-105）singleCoreCantAct
//   - 魔帝の墓標Lv2（e2）：アタック宣言でコア1個をトラッシュへ
//   - 破壊耐性：要塞皇オーディーン（BS01-X04）nexusIndestructible
import {
    createGame,
    createInstance,
    draw,
    getCard,
    minLevelCores,
    validateDeckCards,
    viewFor,
    engineRunTurnStart,
    handleAction,
    destroySpirit,
    effectiveBp,
    hasKeyword,
    resolveAction,
    spiritHasKeyword,
    effectiveCost,
    DECK_RECIPES,
    DECK_SIZE,
    assert,
    act,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"

console.log("=== battleRole: onBattleの役割限定（キングタウロス大公） ===")
{
    const s = createGame(
        "battlerole-attacker-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const king = createInstance("BS01-X03", s.turn, 5) // キングタウロス大公 Lv2（コア5）BP6000
    s.players.p1.field.spirits.push(king)
    const weakBlocker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(weakBlocker)

    const p2LifeBefore = s.players.p2.life
    const p2ReserveBefore = s.players.p2.reserve

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: king.instanceId }) === null, "キングタウロス大公でアタック")
    assert(act(s, "p2", { type: "block", instanceId: weakBlocker.instanceId }) === null, "ゴラドンでブロック（アタッカー勝利）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(s.players.p2.life === p2LifeBefore - 1, "battleRole=attackerで勝利：相手のライフが1減る（lifeCrush）")
    // +1はlifeCrushで移ったライフのコア、+1は破壊されたゴラドン自身が持っていたコア（1個）がリザーブへ戻る分
    assert(s.players.p2.reserve === p2ReserveBefore + 2, "減ったライフのコア＋破壊されたゴラドンのコアが相手のリザーブへ移る")

    console.log("--- ブロッカーとして勝利したときは発火しない ---")
    const s2 = createGame(
        "battlerole-blocker-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s2)

    const king2 = createInstance("BS01-X03", s2.turn, 5) // Lv2 BP6000
    s2.players.p1.field.spirits.push(king2)
    const weakAttacker = createInstance("BS01-001", s2.turn, 1) // ゴラドン Lv1 BP1000
    s2.players.p2.field.spirits.push(weakAttacker)

    assert(act(s2, "p1", { type: "endTurn" }) === null, "p1ターン終了")
    assert(act(s2, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ移行")
    assert(act(s2, "p2", { type: "attack", instanceId: weakAttacker.instanceId }) === null, "p2のゴラドンでアタック")
    assert(act(s2, "p1", { type: "block", instanceId: king2.instanceId }) === null, "キングタウロス大公でブロック（ブロッカー勝利）")
    assert(act(s2, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s2, "p2", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(
        s2.players.p2.life === 5,
        "battleRole=attacker指定のため、ブロッカーとして勝利しても発火しない（相手ライフ不変）",
    )
}

console.log("=== battleWon: ネクサスのバトル結果誘発（無限蟲の蟻塚） ===")
{
    const s = createGame(
        "battlewon-anthill-blocker-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    console.log("--- Lv1: ブロッカー勝利で自分のブロックしたスピリットが回復する ---")
    const anthill = createInstance("BS01-108", s.turn, 0) // 無限蟲の蟻塚 Lv1（コア0）
    s.players.p1.field.nexuses.push(anthill)
    const strongBlocker = createInstance("BS01-047", s.turn, 1) // 魔女ナージャ Lv1 BP3000
    s.players.p1.field.spirits.push(strongBlocker)
    const weakAttacker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(weakAttacker)

    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ移行")
    assert(act(s, "p2", { type: "attack", instanceId: weakAttacker.instanceId }) === null, "p2のゴラドンでアタック")
    assert(act(s, "p1", { type: "block", instanceId: strongBlocker.instanceId }) === null, "ナージャでブロック（ブロッカー勝利）")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(!s.players.p2.field.spirits.includes(weakAttacker), "BPで負けたゴラドンが破壊される")
    assert(
        strongBlocker.isRested === false,
        "蟻塚Lv1誘発：ブロックしたナージャは回復する（resolveBattleで疲労させた後に回復で上書き）",
    )

    console.log("--- Lv1（e2はlevels:[2]のため対象外）: アタッカー勝利では発火しない ---")
    const s2 = createGame(
        "battlewon-anthill-attacker-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s2)

    const anthill2 = createInstance("BS01-108", s2.turn, 0) // Lv1（コア0）
    s2.players.p1.field.nexuses.push(anthill2)
    const attacker1 = createInstance("BS01-047", s2.turn, 1) // 魔女ナージャ Lv1 BP3000
    s2.players.p1.field.spirits.push(attacker1)
    const weakBlocker1 = createInstance("BS01-001", s2.turn, 1) // ゴラドン Lv1 BP1000
    s2.players.p2.field.spirits.push(weakBlocker1)

    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker1.instanceId }) === null, "ナージャでアタック")
    assert(act(s2, "p2", { type: "block", instanceId: weakBlocker1.instanceId }) === null, "ゴラドンでブロック（アタッカー勝利）")
    assert(act(s2, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(
        attacker1.isRested === true,
        "蟻塚Lv1（レベル条件外）：e2は発火せずアタッカーは疲労したまま",
    )

    console.log("--- Lv2に育てると、アタッカー勝利で自分のアタッカーが回復する ---")
    anthill2.cores = 2 // Lv2
    const attacker2 = createInstance("BS01-047", s2.turn, 1) // 魔女ナージャ Lv1 BP3000
    s2.players.p1.field.spirits.push(attacker2)
    const weakBlocker2 = createInstance("BS01-001", s2.turn, 1) // ゴラドン Lv1 BP1000
    s2.players.p2.field.spirits.push(weakBlocker2)

    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "2体目のナージャでアタック")
    assert(act(s2, "p2", { type: "block", instanceId: weakBlocker2.instanceId }) === null, "ゴラドンでブロック（アタッカー勝利）")
    assert(act(s2, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(attacker2.isRested === false, "蟻塚Lv2誘発：アタッカー勝利でアタックしたナージャが回復する")
}

console.log("=== battleWon: 古龍の縄張り（アタッカー勝利でドロー） ===")
{
    const s = createGame(
        "battlewon-dragon-territory-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const territory = createInstance("BS01-101", s.turn, 3) // 古龍の縄張り Lv2（コア3）
    s.players.p1.field.nexuses.push(territory)
    const attacker = createInstance("BS01-047", s.turn, 1) // 魔女ナージャ Lv1 BP3000
    s.players.p1.field.spirits.push(attacker)
    const weakBlocker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(weakBlocker)

    const handBefore = s.players.p1.hand.length

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ナージャでアタック")
    assert(act(s, "p2", { type: "block", instanceId: weakBlocker.instanceId }) === null, "ゴラドンでブロック（アタッカー勝利）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(s.players.p1.hand.length === handBefore + 1, "古龍の縄張りLv2誘発：アタッカー勝利で1ドロー")
}

console.log("=== 制約：必ずアタック（mustAttack、ウィル・オーブ） ===")
{
    const s = createGame(
        "constraint-mustattack-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const orb = createInstance("BS01-027", s.turn, 1) // ウィル・オーブ Lv1: mustAttack
    s.players.p1.field.spirits.push(orb)

    // メインステップからのendTurnも拒否される（アタックステップに入っていなくても強制）
    const err1 = act(s, "p1", { type: "endTurn" })
    assert(err1 !== null && err1.includes("必ずアタック"), "メインからのendTurnはmustAttackで拒否される")

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    const err2 = act(s, "p1", { type: "endTurn" })
    assert(err2 !== null && err2.includes("必ずアタック"), "アタックステップでもアタック前のendTurnは拒否される")

    assert(act(s, "p1", { type: "attack", instanceId: orb.instanceId }) === null, "ウィル・オーブでアタック")
    assert(act(s, "p2", { type: "takeLife" }) === null, "p2はライフで受ける")
    assert(act(s, "p1", { type: "endTurn" }) === null, "アタック後（疲労状態）ならendTurnできる")

    console.log("--- cantAttackThisTurn付与時はmustAttackが働かない ---")
    const s2 = createGame(
        "constraint-mustattack-cantattack-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s2)
    const orb2 = createInstance("BS01-027", s2.turn, 1)
    orb2.cantAttackThisTurn = true
    s2.players.p1.field.spirits.push(orb2)
    assert(
        act(s2, "p1", { type: "endTurn" }) === null,
        "cantAttackThisTurn付与時はmustAttackが働かずendTurnできる",
    )
}

console.log("=== フィールドイベント誘発：命の果実（BS01-107、ownLifeDamaged） ===")
{
    const s = createGame(
        "fieldevent-fruit-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const fruit = createInstance("BS01-107", s.turn, 0) // Lv1: コア0
    s.players.p1.field.nexuses.push(fruit)

    // p1のターンを終了し、p2のターンへ（p2からp1へアタックさせるため）
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了、p2のターンへ")

    console.log("--- Lv1：ライフが減ると1ドロー ---")
    const attacker1 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000（シンボル1＝ダメージ1）
    s.players.p2.field.spirits.push(attacker1)
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker1.instanceId }) === null, "p2がアタック")

    const handBefore1 = s.players.p1.hand.length
    assert(act(s, "p1", { type: "takeLife" }) === null, "p1がライフで受ける")
    assert(s.players.p1.life === 4, "p1のライフが1減る")
    assert(s.players.p1.hand.length === handBefore1 + 1, "命の果実Lv1：ライフが減ったので1ドローする")

    console.log("--- Lv2：ドローに加えてボイドからコア1個をリザーブへ ---")
    fruit.cores = 3 // Lv2へ
    const attacker2 = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(attacker2)
    assert(act(s, "p2", { type: "attack", instanceId: attacker2.instanceId }) === null, "p2が2体目でアタック")

    const handBefore2 = s.players.p1.hand.length
    const reserveBefore2 = s.players.p1.reserve
    assert(act(s, "p1", { type: "takeLife" }) === null, "p1がライフで受ける")
    assert(s.players.p1.life === 3, "p1のライフがさらに1減る")
    assert(s.players.p1.hand.length === handBefore2 + 1, "Lv2でもドローは継続する")
    // +1はライフのコアがリザーブへ移る通常処理分、+1がLv2の追加コア獲得（コアGain）分
    assert(s.players.p1.reserve === reserveBefore2 + 1 + 1, "Lv2：ボイドからコア1個がリザーブへ追加される")

    console.log("--- ライフ0で敗北が決まる場合は発火しない ---")
    s.players.p1.life = 1
    const attacker3 = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(attacker3)
    assert(act(s, "p2", { type: "attack", instanceId: attacker3.instanceId }) === null, "p2が3体目でアタック（致命傷）")

    const handBefore3 = s.players.p1.hand.length
    const reserveBefore3 = s.players.p1.reserve
    assert(act(s, "p1", { type: "takeLife" }) === null, "p1がライフで受ける")
    assert(s.players.p1.life === 0, "p1のライフが0になる")
    assert(s.winner === "p2", "p2の勝利が決まる")
    assert(s.players.p1.hand.length === handBefore3, "ライフ0で敗北が決まった場合はドローが発火しない")
    // +1はライフのコアがリザーブへ移る通常処理分のみ（fieldEvent由来の追加コア獲得+1は発火しない）
    assert(
        s.players.p1.reserve === reserveBefore3 + 1,
        "ライフ0で敗北が決まった場合はコア獲得（fieldEvent由来）が発火しない",
    )
}

console.log('=== ステップ誘発（refreshOne）：風吹く丘陵 e1（BS01-109、相手のスタートステップに【神速】持ちのみ回復） ===')
{
    const s = createGame(
        "fieldevent-hill-e1-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const hill = createInstance("BS01-109", s.turn, 0) // Lv1: コア0
    s.players.p1.field.nexuses.push(hill)

    // p1フィールドに疲労した【神速】持ち（リーヴォルフ）と、疲労した【神速】なし（ゴラドン）を配置
    const sokuSpirit = createInstance("BS01-053", s.turn, 1) // リーヴォルフ：【神速】Lv1-2
    const plainSpirit = createInstance("BS01-001", s.turn, 1) // ゴラドン：【神速】なし
    sokuSpirit.isRested = true
    plainSpirit.isRested = true
    s.players.p1.field.spirits.push(sokuSpirit, plainSpirit)

    // p1のターンを終了し、p2のスタートステップ（風吹く丘陵にとって「相手のスタートステップ」）を起こす
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了、p2のターンへ")

    assert(!sokuSpirit.isRested, "【神速】持ちの疲労スピリットが回復する")
    assert(plainSpirit.isRested === true, "【神速】を持たないスピリットは回復しない")
}

console.log("=== オーラ拡張（summonedThisTurnOnly）：風吹く丘陵 e2（BS01-109、このターン召喚されたスピリットのみBP+1000） ===")
{
    const s = createGame(
        "fieldevent-hill-e2-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const hill = createInstance("BS01-109", s.turn, 2) // Lv2: コア2
    s.players.p1.field.nexuses.push(hill)

    // このターン召喚されたスピリット（summonedTurn === s.turn）
    const freshSpirit = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(freshSpirit)

    // 前のターンから場にいるスピリット（summonedTurn が現在のターンより前）
    const oldSpirit = createInstance("BS01-001", s.turn - 1, 1)
    s.players.p1.field.spirits.push(oldSpirit)

    assert(
        effectiveBp(s, "p1", freshSpirit) === 1000 + 1000,
        "このターン召喚されたスピリットは実効BP+1000される",
    )
    assert(
        effectiveBp(s, "p1", oldSpirit) === 1000,
        "前のターンから場にいるスピリットは対象外（実効BPは変化しない）",
    )
}

console.log("=== ステップ誘発（coreRemoveSelf）：メラット（BS01-006、自分のスタートステップにコア1個をリザーブへ） ===")
{
    const s = createGame(
        "fieldevent-merat-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    console.log("--- 通常：コアが1個減ってリザーブへ ---")
    const merat = createInstance("BS01-006", s.turn, 3) // Lv2: コア3
    s.players.p1.field.spirits.push(merat)

    // p1のターンを再度スタートステップから起こす（turn===1のためドローはスキップされ、デッキアウトの心配がない）
    const reserveBefore = s.players.p1.reserve
    runTurnStart(s)
    assert(merat.cores === 2, "メラットLv1-2：自分のスタートステップでコアが1個減る")
    assert(
        s.players.p1.reserve === reserveBefore + 1 + 1,
        "取り除いたコア1個＋コアステップの+1でリザーブが2増える",
    )

    console.log("--- 維持コア割れなら消滅する ---")
    const merat2 = createInstance("BS01-006", s.turn, 1) // Lv1: コア1（維持コアぴったり）
    s.players.p2.field.spirits.push(merat2)
    s.turnPlayer = "p2" // p2のターン開始処理を直接検証するため切り替える
    runTurnStart(s)
    assert(!s.players.p2.field.spirits.includes(merat2), "コアを取り除いて維持コア割れになると消滅する")
    assert(s.players.p2.trashCards.includes("BS01-006"), "消滅したメラットがトラッシュへ")
    s.turnPlayer = "p1" // 後続に影響しないよう戻す
}

console.log("=== フィールドイベント誘発：侵食されゆく銀世界 e2（BS01-113、相手のアタックステップに自分のスピリット破壊でコア獲得） ===")
{
    const s = createGame(
        "fieldevent-permafrost-e2-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)

    const permafrost = createInstance("BS01-113", s.turn, 4) // Lv2: コア4
    s.players.p1.field.nexuses.push(permafrost)

    console.log('--- 条件を満たす（相手のアタックステップ）：破壊で発火 ---')
    // p1のターンを終了してp2のターンへ（「相手のアタックステップ」を起こすため）
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了、p2のターンへ")

    // p2に強いアタッカー、p1に弱いブロッカーを配置し、バトルでp1のスピリットを破壊させる
    const attacker = createInstance("BS01-053", s.turn, 4) // リーヴォルフ Lv2 BP3000
    const blocker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000・維持コア1
    s.players.p2.field.spirits.push(attacker)
    s.players.p1.field.spirits.push(blocker)

    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2がアタック")
    assert(act(s, "p1", { type: "block", instanceId: blocker.instanceId }) === null, "p1がブロック")

    const reserveBefore = s.players.p1.reserve
    const blockerCores = blocker.cores
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(!s.players.p1.field.spirits.includes(blocker), "BPの低いゴラドンがブロックで破壊される")
    assert(
        s.players.p1.reserve === reserveBefore + blockerCores + 1,
        "侵食Lv2誘発：破壊コアの戻り＋ボイドからのコア獲得1個でリザーブが増える",
    )

    console.log('--- 自分のアタックステップでは発火しない（turn="opponent"限定） ---')
    assert(act(s, "p2", { type: "endTurn" }) === null, "p2ターン終了、p1のターンへ")

    const attacker2 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000（p1のアタッカー、破壊される想定）
    const blocker2 = createInstance("BS01-053", s.turn, 4) // リーヴォルフ Lv2 BP3000（p2のブロッカー）
    s.players.p1.field.spirits.push(attacker2)
    s.players.p2.field.spirits.push(blocker2)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker2.instanceId }) === null, "p2がブロック")

    const reserveBefore2 = s.players.p1.reserve
    const attacker2Cores = attacker2.cores
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(!s.players.p1.field.spirits.includes(attacker2), "p1のゴラドンがバトルで破壊される")
    assert(
        s.players.p1.reserve === reserveBefore2 + attacker2Cores,
        "自分のアタックステップでは侵食Lv2が発火しない（破壊コアの戻りのみ、コア獲得+1なし）",
    )
}

console.log("=== selfBuffPer：スケルトン・ジョウ（BS01-016、アタック時に相手の回復スピリット数×BP+1000） ===")
{
    const s = createGame(
        "selfbuffper-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    console.log("--- 相手の回復状態スピリット2体でBP+2000 ---")
    const jaw = createInstance("BS01-016", s.turn, 2) // Lv2（levels [2,3] で有効）
    s.players.p1.field.spirits.push(jaw)
    const ready1 = createInstance("BS01-001", s.turn, 1)
    const ready2 = createInstance("BS01-053", s.turn, 1)
    s.players.p2.field.spirits.push(ready1, ready2)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: jaw.instanceId }) === null, "スケルトン・ジョウでアタック")
    assert(jaw.tempBpBuff === 2000, "相手の回復状態2体でBP+2000")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ライフで受けてバトル終了")

    console.log("--- 相手が全疲労なら増加0 ---")
    ready1.isRested = true
    ready2.isRested = true
    const jaw2 = createInstance("BS01-016", s.turn, 2)
    s.players.p1.field.spirits.push(jaw2)
    const logLen = s.log.length
    assert(act(s, "p1", { type: "attack", instanceId: jaw2.instanceId }) === null, "2体目のジョウでアタック")
    assert(jaw2.tempBpBuff === 0, "相手が全疲労ならBP増加なし")
    assert(s.log.length > logLen, "カウント0のログが出る")
}

console.log("=== voidCoreToSelf：キリカブト（BS01-065）／征空の翼アクィリーズ（BS01-069）の実召喚 ===")
{
    const s = createGame(
        "voidcoretoself-summon-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    console.log("--- キリカブト：召喚時にボイドからコア+1 ---")
    s.players.p1.hand[0] = "BS01-065"
    s.players.p1.reserve = 20
    const cost65 = effectiveCost(s, "p1", getCard("BS01-065"))
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "キリカブトを召喚できる")
    const kirikabuto = s.players.p1.field.spirits.find((x) => x.cardId === "BS01-065")!
    assert(kirikabuto.cores === minLevelCores(getCard("BS01-065")) + 1, "維持コア1＋ボイドから1でコア2個")
    assert(
        s.players.p1.reserve === 20 - cost65 - minLevelCores(getCard("BS01-065")),
        "増えたコアはボイド由来（リザーブはコスト・維持分のみ減る）",
    )

    console.log("--- アクィリーズ：召喚時にボイドからコア+1 ---")
    s.players.p1.hand[0] = "BS01-069"
    const reserveBefore = s.players.p1.reserve
    const cost69 = effectiveCost(s, "p1", getCard("BS01-069"))
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "アクィリーズを召喚できる")
    const aquilies = s.players.p1.field.spirits.find((x) => x.cardId === "BS01-069")!
    assert(aquilies.cores === minLevelCores(getCard("BS01-069")) + 1, "維持コア1＋ボイドから1でコア2個")
    assert(
        s.players.p1.reserve === reserveBefore - cost69 - minLevelCores(getCard("BS01-069")),
        "増えたコアはボイド由来（リザーブはコスト・維持分のみ減る）",
    )
}

console.log("=== voidCoreToOther：スタッグローブ（BS01-066、アタック時に他のスピリットへボイドからコア1個） ===")
{
    const s = createGame(
        "voidcoretoother-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    console.log("--- 他スピリットのうち実効BP最大に+1 ---")
    const stag = createInstance("BS01-066", s.turn, 2) // Lv2（levels [2] で有効）
    const weak = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    const strong = createInstance("BS01-053", s.turn, 4) // リーヴォルフ Lv2 BP3000
    s.players.p1.field.spirits.push(stag, weak, strong)
    const reserveBefore = s.players.p1.reserve

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: stag.instanceId }) === null, "スタッグローブでアタック")
    assert(strong.cores === 5, "実効BP最大のリーヴォルフにコア+1")
    assert(weak.cores === 1 && stag.cores === 2, "他のスピリットと自身のコアは変化しない")
    assert(s.players.p1.reserve === reserveBefore, "コアはボイド由来（リザーブは変化しない）")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ライフで受けてバトル終了")

    console.log("--- 候補なしは no-op ---")
    const s2 = createGame(
        "voidcoretoother-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s2)
    const lone = createInstance("BS01-066", s2.turn, 2)
    s2.players.p1.field.spirits.push(lone)
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    const logLen = s2.log.length
    assert(act(s2, "p1", { type: "attack", instanceId: lone.instanceId }) === null, "単独のスタッグローブでアタック")
    assert(lone.cores === 2, "候補がいなければ自身にもコアは置かれない")
    assert(s2.log.length > logLen, "候補なしのログが出る")
}

console.log("=== coreSqueezeAll：幻龍シェイロン e1（BS01-046、召喚時に全スピリットのコアを1個ずつだけ残す） ===")
{
    const s = createGame(
        "coresqueeze-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const mine3 = createInstance("BS01-001", s.turn, 3) // コア3個
    s.players.p1.field.spirits.push(mine3)
    const enemy2 = createInstance("BS01-053", s.turn, 2) // コア2個
    const enemy1 = createInstance("BS01-001", s.turn, 1) // コア1個
    s.players.p2.field.spirits.push(enemy2, enemy1)

    s.players.p1.hand[0] = "BS01-046"
    s.players.p1.reserve = 20
    const cost = effectiveCost(s, "p1", getCard("BS01-046"))
    const p2ReserveBefore = s.players.p2.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "シェイロンを召喚できる")

    assert(mine3.cores === 1, "コア3個の自分スピリットが1個になる")
    assert(enemy2.cores === 1, "コア2個の相手スピリットが1個になる")
    assert(enemy1.cores === 1, "コア1個のスピリットは変化しない")
    assert(
        s.players.p1.reserve === 20 - cost - minLevelCores(getCard("BS01-046")) + 2,
        "自分の超過コア2個が自分のリザーブへ",
    )
    assert(s.players.p2.reserve === p2ReserveBefore + 1, "相手の超過コア1個が相手のリザーブへ")
    const sheiron = s.players.p1.field.spirits.find((x) => x.cardId === "BS01-046")!
    assert(sheiron.cores === 1, "シェイロン自身（維持コア1）は影響を受けない")
    // 注: 第一弾にはLv1維持コアが2個以上のスピリットが存在しないため、消滅ケースのテストは省略
}

console.log("=== unblockableBy maxCores：幻龍シェイロン e2（Lv2はコア1個のスピリットにブロックされない） ===")
{
    const s = createGame(
        "maxcores-block-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const sheiron = createInstance("BS01-046", s.turn, 3) // Lv2（e2 levels [2] で有効）
    s.players.p1.field.spirits.push(sheiron)
    const blocker1 = createInstance("BS01-001", s.turn, 1) // コア1個
    const blocker2 = createInstance("BS01-001", s.turn, 2) // コア2個
    s.players.p2.field.spirits.push(blocker1, blocker2)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: sheiron.instanceId }) === null, "シェイロンLv2でアタック")
    assert(
        act(s, "p2", { type: "block", instanceId: blocker1.instanceId }) !== null,
        "コア1個のブロッカーは拒否される",
    )
    assert(
        act(s, "p2", { type: "block", instanceId: blocker2.instanceId }) === null,
        "コア2個のブロッカーはブロックできる",
    )
}

console.log("=== バスタースピア（BS01-114、ネクサス破壊＋破壊できたら1ドロー） ===")
{
    const s = createGame(
        "busterspear-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    console.log("--- 相手ネクサスあり：破壊＋1ドロー ---")
    const nexus = createInstance("BS01-102", s.turn, 0)
    s.players.p2.field.nexuses.push(nexus)
    s.players.p1.hand[0] = "BS01-114"
    s.players.p1.reserve = 10
    const handBefore = s.players.p1.hand.length
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "バスタースピアを使用できる")
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサスが破壊される")
    assert(s.players.p1.deck.length === deckBefore - 1, "破壊できたので1ドロー（デッキ-1）")
    assert(s.players.p1.hand.length === handBefore, "使用で-1・ドローで+1（手札枚数は変わらない）")

    console.log("--- 相手ネクサスなし：破壊0・ドロー0 ---")
    s.players.p1.hand[0] = "BS01-114"
    const handBefore2 = s.players.p1.hand.length
    const deckBefore2 = s.players.p1.deck.length
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "対象なしでも使用はできる")
    assert(s.players.p1.deck.length === deckBefore2, "破壊できなかったのでドローなし")
    assert(s.players.p1.hand.length === handBefore2 - 1, "手札は使用分の-1のみ")
}

console.log("=== ステップ誘発の条件：主無き古城 e2（BS01-102 Lv2、手札が相手以下ならスタートステップに1ドロー） ===")
{
    const s = createGame(
        "handcondition-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const castle = createInstance("BS01-102", s.turn, 2) // Lv2（e2 levels [2] で有効）
    s.players.p1.field.nexuses.push(castle)

    console.log("--- 手札同数：スタートステップに1ドロー ---")
    s.players.p1.hand = ["BS01-001", "BS01-001"]
    s.players.p2.hand = ["BS01-001", "BS01-001"]
    // p1のターンを再度スタートステップから起こす（スタートステップの古城ドロー→通常ドローの順。
    // 1ターン目扱い（turn=1）でもドローステップは行われるため、古城分+通常分の2枚増を観測する）
    s.turn = 1
    engineRunTurnStart(s)
    assert(s.players.p1.hand.length === 4, "手札同数なら古城Lv2で1ドロー（+通常ドローで計2枚増）")

    console.log("--- 自分の手札が多いときは古城のドローなし ---")
    // 直前の2ドローで p1:4枚 > p2:2枚 になっている
    s.turn = 1
    engineRunTurnStart(s)
    assert(s.players.p1.hand.length === 5, "自分の手札が多いときは古城のドローはなし（通常ドローの1枚増のみ）")
}

console.log("=== 遅延アタックステップ終了：サイレントウォール（BS01-144） ===")
{
    console.log("--- ライフ受け経路：バトル終了後に自動でターンが終了する ---")
    const s = createGame(
        "silentwall-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.hand[0] = "BS01-144"
    s.players.p2.reserve = 10

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック")
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0 }) === null,
        "防御側がフラッシュでサイレントウォールを使用",
    )
    assert(s.endAttackStepAfterBattle === true, "遅延終了フラグが立つ")
    assert(s.turnPlayer === "p1", "バトル解決前はまだp1のターン")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "takeLife" }) === null, "防御側がライフで受ける")
    assert(s.battle === null, "バトルが終了している")
    assert(s.turnPlayer === "p2", "バトル終了後に自動でターンが終了しp2のターンになる")
    assert(s.phase === "main", "p2のターンがメインステップから始まる")
    assert(s.endAttackStepAfterBattle === false, "フラグは消費されて戻る")

    console.log("--- ブロック解決経路：バトル解決後に自動でターンが終了する ---")
    const s2 = createGame(
        "silentwall-block-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s2)

    const attacker2 = createInstance("BS01-053", s2.turn, 4) // リーヴォルフ Lv2 BP3000
    s2.players.p1.field.spirits.push(attacker2)
    const blocker = createInstance("BS01-001", s2.turn, 1) // ゴラドン Lv1 BP1000
    s2.players.p2.field.spirits.push(blocker)
    s2.players.p2.hand[0] = "BS01-144"
    s2.players.p2.reserve = 10

    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "p1がアタック")
    assert(act(s2, "p2", { type: "castMagic", handIndex: 0 }) === null, "サイレントウォールを使用")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s2, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "防御側がブロック")
    assert(act(s2, "p2", { type: "pass" }) === null, "ブロック後フラッシュで防御側パス")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s2.players.p2.field.spirits.includes(blocker), "BPの低いブロッカーが破壊される")
    assert(s2.turnPlayer === "p2", "バトル解決後に自動でターンが終了しp2のターンになる")
    assert(s2.endAttackStepAfterBattle === false, "フラグは消費されて戻る")

    console.log("--- バトル外での使用は no-op ---")
    const s3 = createGame(
        "silentwall-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s3)
    s3.players.p1.hand[0] = "BS01-144"
    s3.players.p1.reserve = 10
    assert(act(s3, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインステップでも使用自体はできる")
    assert(s3.endAttackStepAfterBattle === false, "バトル外ではフラグは立たない（no-opログのみ）")
    assert(s3.turnPlayer === "p1", "ターンは終了しない")

    console.log("--- endBattle（ラークドライブ）経路でも発火する ---")
    const s4 = createGame(
        "silentwall-endbattle-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "white" },
    )
    runTurnStart(s4)
    const attacker4 = createInstance("BS01-001", s4.turn, 1)
    s4.players.p1.field.spirits.push(attacker4)
    s4.players.p1.hand[0] = "BS01-148" // ラークドライブ: バトル即終了
    s4.players.p2.hand[0] = "BS01-144" // サイレントウォール
    s4.players.p1.reserve = 10
    s4.players.p2.reserve = 10

    assert(act(s4, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s4, "p1", { type: "attack", instanceId: attacker4.instanceId }) === null, "p1がアタック")
    assert(act(s4, "p2", { type: "castMagic", handIndex: 0 }) === null, "防御側がサイレントウォールを使用")
    assert(s4.endAttackStepAfterBattle === true, "遅延終了フラグが立つ")
    // 優先権が攻撃側に移っているので、攻撃側がラークドライブでバトルを即終了させる
    assert(act(s4, "p1", { type: "castMagic", handIndex: 0 }) === null, "攻撃側がラークドライブを使用")
    assert(s4.battle === null, "バトルが即終了する")
    assert(s4.turnPlayer === "p2", "endBattle経由でもアタックステップが終了しp2のターンになる")
    assert(s4.endAttackStepAfterBattle === false, "フラグは消費されて戻る")
}

console.log("=== フィールド全体制約：魔帝の墓標（BS01-105）singleCoreCantAct ===")
{
    const s = createGame(
        "gravestone-constraint-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    // p2のフィールドに魔帝の墓標（コア0＝Lv1。e1 は Lv1-2 で有効）
    const gravestone = createInstance("BS01-105", s.turn, 0)
    s.players.p2.field.nexuses.push(gravestone)
    // p1: コア1個のゴラドン
    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)

    console.log("--- コア1個のスピリットはアタックできない ---")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) !== null,
        "コア1個のスピリットのアタックは拒否される",
    )

    console.log("--- コア2個ならアタックでき、コア1個のブロックは拒否される ---")
    attacker.cores = 2
    assert(
        act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null,
        "コア2個ならアタックできる",
    )
    const blocker = createInstance("BS01-053", s.turn, 1) // リーヴォルフ コア1個
    s.players.p2.field.spirits.push(blocker)
    assert(
        act(s, "p2", { type: "block", instanceId: blocker.instanceId }) !== null,
        "コア1個のスピリットのブロックは拒否される",
    )
    blocker.cores = 2
    assert(
        act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null,
        "コア2個ならブロックできる",
    )
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    console.log("--- 墓標を除去すればコア1個でもアタックできる ---")
    const attacker2 = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(attacker2)
    assert(
        act(s, "p1", { type: "attack", instanceId: attacker2.instanceId }) !== null,
        "墓標がある間はコア1個のアタックは拒否される",
    )
    s.players.p2.field.nexuses = s.players.p2.field.nexuses.filter(
        (n) => n.instanceId !== gravestone.instanceId,
    )
    assert(
        act(s, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null,
        "墓標を除去すればコア1個でもアタックできる",
    )
}

console.log("=== 魔帝の墓標Lv2（e2）：アタック宣言でコア1個をトラッシュへ ===")
{
    const s = createGame(
        "gravestone-coretrash-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    // p2のフィールドに魔帝の墓標（コア3＝Lv2。e2 が有効）
    const gravestone = createInstance("BS01-105", s.turn, 3)
    s.players.p2.field.nexuses.push(gravestone)
    // p1: コア3個のゴラドン（コア1個ではないのでアタック可能）
    const attacker = createInstance("BS01-001", s.turn, 3)
    s.players.p1.field.spirits.push(attacker)

    console.log("--- 相手の墓標でもアタッカーのコアが持ち主のトラッシュへ ---")
    const trashBefore = s.players.p1.trashCores
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null,
        "コア3個のスピリットはアタックできる",
    )
    assert(attacker.cores === 2, "アタック宣言でアタッカーのコアが1個減る")
    assert(
        s.players.p1.trashCores === trashBefore + 1,
        "減ったコアはアタッカーの持ち主のトラッシュへ置かれる",
    )
    assert(s.battle !== null, "バトル自体は継続する")
    assert(act(s, "p2", { type: "takeLife" }) === null, "防御側はライフで受けられる")

    console.log("--- 墓標の持ち主自身のアタックでも発火する ---")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了")
    const ownAttacker = createInstance("BS01-053", s.turn, 4) // リーヴォルフ Lv2
    s.players.p2.field.spirits.push(ownAttacker)
    const p2TrashBefore = s.players.p2.trashCores
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ移行")
    assert(
        act(s, "p2", { type: "attack", instanceId: ownAttacker.instanceId }) === null,
        "墓標の持ち主のスピリットもアタックできる",
    )
    assert(ownAttacker.cores === 3, "持ち主のアタッカーもコアが1個減る")
    assert(
        s.players.p2.trashCores === p2TrashBefore + 1,
        "減ったコアは持ち主（p2）のトラッシュへ",
    )

    console.log("--- コアが維持コアを下回る場合は消滅する（coreToTrashSelf） ---")
    // 第一弾に維持コア2のスピリットは存在せず、コア1個の個体は e1 でアタック自体が拒否されるため、
    // 消滅経路はアクション単体（resolveAction）で検証する
    const fragile = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(fragile)
    const p1TrashBefore = s.players.p1.trashCores
    resolveAction(s, "p1", fragile, { type: "coreToTrashSelf", count: 1 })
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === fragile.instanceId),
        "維持コア割れで消滅する",
    )
    assert(s.players.p1.trashCores === p1TrashBefore + 1, "コアはトラッシュへ置かれている")
}

console.log("=== 破壊耐性：要塞皇オーディーン（BS01-X04）nexusIndestructible ===")
{
    const s = createGame(
        "odin-indestructible-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)

    // p2: オーディーン Lv2（コア3）＋守られるネクサス（主無き古城）
    const odin = createInstance("BS01-X04", s.turn, 3)
    s.players.p2.field.spirits.push(odin)
    const nexus = createInstance("BS01-102", s.turn, 0)
    s.players.p2.field.nexuses.push(nexus)

    console.log("--- オーディーンLv2がいる間はネクサスを破壊できない ---")
    s.players.p1.hand[0] = "BS01-114" // バスタースピア（ネクサス破壊＋破壊数ドロー）
    s.players.p1.reserve = 10
    const handBefore = s.players.p1.hand.length
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0 }) === null,
        "バスタースピアは使用できる",
    )
    assert(s.players.p2.field.nexuses.length === 1, "ネクサスは破壊されず残る")
    assert(
        s.players.p1.hand.length === handBefore - 1,
        "破壊できなかったのでドローも発生しない（手札は使用分-1のみ）",
    )
    assert(
        s.log.some((l) => l.includes("破壊されなかった（破壊耐性）")),
        "破壊耐性のログが出る",
    )

    console.log("--- バウンス（returnNexusToHand）は破壊ではないため防げない ---")
    resolveAction(s, "p1", null, { type: "returnNexusToHand", count: 1 })
    assert(s.players.p2.field.nexuses.length === 0, "ネクサスは手札に戻る（バウンスは通る）")
    assert(s.players.p2.hand.includes("BS01-102"), "戻ったネクサスが手札にある")

    console.log("--- オーディーンがLv1に下がると破壊できる ---")
    s.players.p2.field.nexuses.push(createInstance("BS01-102", s.turn, 0))
    odin.cores = 1 // Lv1（e2 は Lv2-3 のみ有効）
    s.players.p1.hand[0] = "BS01-114"
    const handBefore2 = s.players.p1.hand.length
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0 }) === null,
        "バスタースピアを再使用",
    )
    assert(s.players.p2.field.nexuses.length === 0, "Lv1に下がるとネクサスは破壊される")
    assert(
        s.players.p1.hand.length === handBefore2 - 1 + 1,
        "破壊数ぶんのドローも発生する（使用分-1＋ドロー1）",
    )

    console.log("--- 自分（オーディーン側）のネクサスだけでなく相手のネクサスも守られる ---")
    odin.cores = 3 // Lv2に戻す
    const p1Nexus = createInstance("BS01-102", s.turn, 0)
    s.players.p1.field.nexuses.push(p1Nexus)
    resolveAction(s, "p2", null, { type: "destroyNexus", count: 1 })
    assert(s.players.p1.field.nexuses.length === 1, "相手側のネクサスも破壊されない（お互い）")
}

