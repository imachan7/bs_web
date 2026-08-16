// smoke パート128（第六弾 BS06 バッチ5：白20枚 ＋ エンジン拡張W1〜W8・W10）
//
// 実装したカード:
//   BS06-037/038/039/040/041/042/043/044/045/046/047/048（スピリット）
//   BS06-082/083/084（ネクサス）／BS06-103/104/105/106（マジック）／BS06-X24（スピリット）
// エンジン拡張:
//   W1: returnToHand に filter を追加（対象自動選択・明示ターゲット両方）
//   W2: triggered.condition に targetMinBp を追加
//   W3: familyGrant.familyFilter を string→FamilyFilter へ
//   W4: fieldEvent ownSpiritCoresRemovedByOpponent に repeatPerCount+countMode:"cores" を追加
//   W5: aura.blockingOnly を追加（attackingOnlyの対）
//   W6: refreshAllOwn に exemptFamily を追加
//   W7: returnNexusToHand に all/side を追加
//   W8: 【装甲：∞】= keyword.colorsFrom:"opponentFieldSymbols"
//   W9（不要）: BS06-X24 Lv2-3 は既存の selfBuffByExhaustFamily でそのまま書けたため拡張なし
//   W10: returnAllToHand に filter を追加
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    declareBlock,
    effectiveBp,
    fireStepTriggers,
    getCard,
    hasArmorAgainst,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireTrigger, removeCores } from "../../server/src/logic/EffectModules"

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
    for (const [cid, name] of [
        ["BS06-037", "双子妖精フギン＆ムニン"],
        ["BS06-038", "センザンゴウ"],
        ["BS06-039", "浮遊魚モラモラー"],
        ["BS06-040", "薄氷の侍女長フッラ"],
        ["BS06-041", "鎧装獣アウドムラ"],
        ["BS06-042", "機海兵ゼーロイヴァー"],
        ["BS06-043", "盾機兵バルドル"],
        ["BS06-044", "レインディア"],
        ["BS06-045", "トンビュール"],
        ["BS06-046", "鍵鎚のヴァルグリンド"],
        ["BS06-047", "輝竜殿ブレイザブリク"],
        ["BS06-048", "銀狼皇ガグンラーズ"],
        ["BS06-082", "無限なる軌道母艦"],
        ["BS06-083", "希望の大灯台"],
        ["BS06-084", "侵食されゆく尖塔"],
        ["BS06-103", "キャバルリー"],
        ["BS06-104", "アバランチオーラ"],
        ["BS06-105", "ホーリーエリクサー"],
        ["BS06-106", "ホワイトホール"],
        ["BS06-X24", "鎧神機ヴァルハランス"],
    ] as const) {
        assert(getCard(cid).name === name, `${cid} は${name}`)
    }
    for (const cid of ["BS06-039", "BS06-040", "BS06-045"]) {
        assert(getCard(cid).effects.length === 0, `${cid}：効果文なしのためeffects空`)
    }
}

console.log("=== BS06-042 機海兵ゼーロイヴァー：コスト4/5のマジックで発火、コスト3では発火しない ===")
{
    const s = createGame("t128-zeroiver-4", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "green" })
    runTurnStart(s)
    put(s, "p1", "BS06-042", 3) // Lv2
    const attacker = put(s, "p1", "BS06-013", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック（フラッシュ開始）")
    assert(getCard("BS02-106").cost === 4, "テスト前提：ローヤルポーションのコストは4")
    s.players.p2.hand = ["BS02-106"]
    s.players.p2.reserve = 12
    const opponentSpirit = put(s, "p2", "BS06-013", 1)
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "相手がコスト4のマジックを使用")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === opponentSpirit.instanceId),
        "コスト4のマジック使用で相手のスピリットが手札に戻る",
    )
}
{
    const s = createGame("t128-zeroiver-5", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "green" })
    runTurnStart(s)
    put(s, "p1", "BS06-042", 3) // Lv2
    const attacker = put(s, "p1", "BS06-013", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック（フラッシュ開始）")
    assert(getCard("BS01-120").cost === 5, "テスト前提：バスターファランクスのコストは5")
    s.players.p2.hand = ["BS01-120"]
    s.players.p2.reserve = 12
    const opponentSpirit = put(s, "p2", "BS06-013", 1)
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "相手がコスト5のマジックを使用")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === opponentSpirit.instanceId),
        "コスト5のマジック使用でも相手のスピリットが手札に戻る",
    )
}
{
    const s = createGame("t128-zeroiver-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "green" })
    runTurnStart(s)
    put(s, "p1", "BS06-042", 3) // Lv2
    const attacker = put(s, "p1", "BS06-013", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック（フラッシュ開始）")
    assert(getCard("BS01-114").cost === 3, "テスト前提：バスタースピアのコストは3")
    s.players.p2.hand = ["BS01-114"]
    s.players.p2.reserve = 12
    const opponentSpirit = put(s, "p2", "BS06-013", 1)
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "相手がコスト3のマジックを使用")
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === opponentSpirit.instanceId),
        "コスト3のマジックでは発火しない（相手のスピリットは場に残る）",
    )
}

console.log("=== BS06-044 レインディア：ブロックした「空牙」持ちのみ手札へ戻る ===")
{
    const s = createGame("t128-reindeer-hit", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const blocker = put(s, "p1", "BS06-044", 3) // Lv2
    s.turnPlayer = "p2"
    const attacker = put(s, "p2", "BS01-003", 1) // テラノセイバー（系統：空牙）
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "レインディアでブロック")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === attacker.instanceId),
        "系統「空牙」のアタッカーは手札に戻る",
    )
    assert(s.players.p2.hand.includes("BS01-003"), "戻したカードは手札にある")
}
{
    const s = createGame("t128-reindeer-miss", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const blocker = put(s, "p1", "BS06-044", 3) // Lv2
    s.turnPlayer = "p2"
    const attacker = put(s, "p2", "BS06-013", 1) // 系統：無魔（空牙ではない）
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "レインディアでブロック")
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === attacker.instanceId),
        "系統「空牙」を持たないアタッカーは戻らない",
    )
}

console.log("=== BS06-046 鍵鎚のヴァルグリンドLv2：targetMinBp条件（W2拡張） ===")
// ⚠️ 実際のブロック宣言ではブロッカーは回復状態でなければならず（validateBlock）、
// 疲労は resolveBattle（フラッシュ終了後）まで起きないため、宣言直後に発火する
// onBlockトリガーでの refreshSelf は通常のゲーム進行では常に無効化（既に回復状態でno-op）。
// ここではW2拡張（targetMinBp条件）そのものの正しさを、fireTriggerを直接呼んで検証する
// （相談事項として報告に記載）
{
    const s = createGame("t128-valgrind-low", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const blocker = put(s, "p1", "BS06-046", 3) // Lv2
    blocker.isRested = true
    const attacker = put(s, "p2", "BS06-013", 1) // BP1000（4000未満）
    fireTrigger(s, "p1", blocker, "onBlock", undefined, attacker.instanceId)
    assert(blocker.isRested === true, "BP4000未満をブロックした対象では発火しない（targetMinBp条件）")
}
{
    const s = createGame("t128-valgrind-high", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const blocker = put(s, "p1", "BS06-046", 3) // Lv2
    blocker.isRested = true
    const attacker = put(s, "p2", "BS06-048", 1) // BP5000（4000以上）
    fireTrigger(s, "p1", blocker, "onBlock", undefined, attacker.instanceId)
    assert(!blocker.isRested, "BP4000以上をブロックした対象では発火する（targetMinBp条件成立でrefreshSelf）")
}

console.log("=== BS06-047 輝竜殿ブレイザブリクLv3：2エントリが両方発揮される（コア+1・BP+4000） ===")
{
    const s = createGame("t128-blazabreak", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const blocker = put(s, "p1", "BS06-047", 4) // Lv3
    const coresBefore = blocker.cores
    const bpBefore = currentLevel(blocker).bp
    s.turnPlayer = "p2"
    const attacker = put(s, "p2", "BS06-013", 1)
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "ブレイザブリクでブロック")
    assert(blocker.cores === coresBefore + 1, `コアが1個増える（実際: ${String(blocker.cores)}個）`)
    assert(
        effectiveBp(s, "p1", blocker) === bpBefore + 4000,
        `BP+4000も同時に乗る（実際: ${String(effectiveBp(s, "p1", blocker))}）`,
    )
}

console.log("=== BS06-082 無限なる軌道母艦：付与された「武装」がLv2の手札戻りの対象になる ===")
{
    const s = createGame("t128-orbital", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-082", 2) // Lv2（武装付与＋バトル敗北時手札戻り）
    const buddy = put(s, "p1", "BS06-043", 1) // 盾機兵バルドル（系統：機人。BP3000）
    const strongEnemy = put(s, "p2", "BS06-048", 4) // 銀狼皇ガグンラーズLv2（BP7000）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: buddy.instanceId }) === null, "武装付与された自分のスピリットでアタック")
    assert(declareBlock(s, "p2", strongEnemy.instanceId) === null, "強いブロッカーでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === buddy.instanceId),
        "バトルに敗北したので場からは消える",
    )
    assert(s.players.p1.hand.includes("BS06-043"), "破壊される代わりに手札へ戻る（付与された武装が対象になった）")
}

console.log("=== BS06-083 希望の大灯台Lv1：コアを2個取られたらリザーブに2個戻る（countMode:cores） ===")
{
    const s = createGame("t128-lighthouse-l1", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-083", 0) // Lv1
    const spirit = put(s, "p1", "BS06-021", 3) // コア3個
    const reserveBefore = s.players.p1.reserve
    removeCores(s, "p1", spirit, 2, "p2") // 相手の効果で2個取り除く
    assert(
        s.players.p1.reserve === reserveBefore + 2 + 2,
        `取り除かれたコア(2個はリザーブへ)に加え、ボイドから2個がリザーブへ追加される（実際の増加: ${String(s.players.p1.reserve - reserveBefore)}）`,
    )
}
console.log("=== BS06-083 希望の大灯台Lv2：ブロック中の自分のスピリットのみ加算 ===")
{
    const s = createGame("t128-lighthouse-l2", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-083", 1) // Lv2
    const rested = put(s, "p1", "BS06-013", 1)
    rested.isRested = true
    const blocker = put(s, "p1", "BS06-021", 3)
    const bystander = put(s, "p1", "BS06-021", 3)
    s.turnPlayer = "p2"
    s.phase = "attack"
    const attacker = put(s, "p2", "BS06-048", 4)
    s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: blocker.instanceId, flashLockedPlayer: null, directed: false }
    assert(
        effectiveBp(s, "p1", blocker) === currentLevel(blocker).bp + 1000,
        `ブロック中は疲労1体ぶんBP+1000（実際: ${String(effectiveBp(s, "p1", blocker))}）`,
    )
    assert(
        effectiveBp(s, "p1", bystander) === currentLevel(bystander).bp,
        "ブロックしていないスピリットには乗らない",
    )
}

console.log("=== BS06-103 キャバルリー：戦騎はアタック可、それ以外はアタック不可 ===")
{
    const s = createGame("t128-cavalry", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const cavalry = put(s, "p1", "BS06-048", 1) // 系統：武装/戦騎
    const other = put(s, "p1", "BS06-013", 1) // 系統：無魔
    cavalry.isRested = true
    other.isRested = true
    resolveAction(s, "p1", null, { type: "refreshAllOwn", exemptFamily: "戦騎" }, undefined, ["white"], "magic")
    assert(!cavalry.isRested && !other.isRested, "両方とも回復する")
    assert(cavalry.cantAttackThisTurn === false, "系統「戦騎」持ちはこのターンもアタックできる")
    assert(other.cantAttackThisTurn === true, "系統「戦騎」を持たないスピリットはアタックできない")
}

console.log("=== BS06-104 アバランチオーラ：ブロック中+2000、装甲持ちはさらに+2000で合計+4000 ===")
{
    const s = createGame("t128-avalanche", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.turnPlayer = "p2"
    s.phase = "attack"
    const armored = put(s, "p1", "BS06-037", 2) // Lv2【装甲】持ち・ブロッカー
    const plain = put(s, "p1", "BS06-013", 1) // 装甲なし・ブロッカーではない
    const attacker = put(s, "p2", "BS06-048", 4)
    s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: armored.instanceId, flashLockedPlayer: null, directed: false }
    resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined, ["white"], "magic", undefined, undefined, "BS06-104")
    assert(
        effectiveBp(s, "p1", armored) === currentLevel(armored).bp + 4000,
        `ブロック中の装甲持ちはBP+2000+2000＝+4000（実際: +${String(effectiveBp(s, "p1", armored) - currentLevel(armored).bp)}）`,
    )
    assert(
        effectiveBp(s, "p1", plain) === currentLevel(plain).bp,
        "ブロックしていないスピリットには乗らない",
    )
}

console.log("=== BS06-106 メイン：両陣営のネクサスすべてが手札へ戻る ===")
{
    const s = createGame("t128-whitehole", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-082", 0)
    putNexus(s, "p1", "BS06-083", 0)
    putNexus(s, "p2", "BS06-084", 0)
    resolveAction(s, "p1", null, { type: "returnNexusToHand", count: 0, all: true, side: "both" }, undefined, ["white"], "magic")
    assert(s.players.p1.field.nexuses.length === 0, "自分のネクサスもすべて戻る")
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサスもすべて戻る")
    assert(
        s.players.p1.hand.includes("BS06-082") && s.players.p1.hand.includes("BS06-083"),
        "自分の手札に両方戻る",
    )
    assert(s.players.p2.hand.includes("BS06-084"), "相手の手札にも戻る")
}

console.log("=== BS06-X24 鎧神機ヴァルハランス：装甲：∞ ===")
{
    const s = createGame("t128-valhallance-empty", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const self = put(s, "p1", "BS06-X24", 1) // Lv1
    refreshLevelAsOverrides(s)
    assert(!hasArmorAgainst(self, ["red"]), "相手の場が空なら装甲は成立しない")
}
{
    const s = createGame("t128-valhallance-red", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const self = put(s, "p1", "BS06-X24", 1) // Lv1
    put(s, "p2", "BS06-001", 1) // 相手の場にシンボル：赤
    refreshLevelAsOverrides(s)
    assert(hasArmorAgainst(self, ["red"]), "相手のフィールドのシンボル色（赤）への効果を受けない")
    assert(!hasArmorAgainst(self, ["blue"]), "相手のフィールドにないシンボル色（青）は防げない")
}

console.log("=== BS06-X24 Lv3：BP4000以下の相手のスピリットすべてを手札に戻す ===")
{
    const s = createGame("t128-valhallance-attack", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const self = put(s, "p1", "BS06-X24", 5) // Lv3
    const weak = put(s, "p2", "BS06-013", 1) // BP1000（4000以下）
    const strong = put(s, "p2", "BS06-048", 1) // BP5000（4000超）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: self.instanceId }) === null, "ヴァルハランスでアタック宣言")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === weak.instanceId),
        "BP4000以下の相手のスピリットは手札に戻る",
    )
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === strong.instanceId),
        "BP4000超の相手のスピリットは戻らない",
    )
}
