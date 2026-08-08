// smoke パート132（第六弾 BS06 バッチ9：青19枚。これでBS06 118枚が完成）
//
// 実装したカード:
//   BS06-061〜072（12枚）／BS06-088〜090（ネクサス3枚）／BS06-111〜114（マジック4枚）
// エンジン拡張:
//   magicRestriction に noFlashAll / noFlashOpponent を追加（validateCastMagicのメインステップ経由フラッシュ判定）
//   globalConstraint に noTrashRecovery を追加（recoverSpiritFromTrash等3ハンドラの冒頭で判定）
//   ConstraintDef に canBlockWhileRested（targetMaxCost付き）を追加（shared/block.canBlock）
//   constraintGrant に familyFilter を追加
//   TargetFilter に sameCostAsBlocker、destroy アクションに excludeTarget を追加
//   levelAs の target に ownSpiritsByFamily、turn に "opponent" を追加
//   funsaiBonus / 新設 millCapBonus に lentOnly を追加（EffectModules.funsaiBonusTotal/millCapBonusFor）
//   triggered.condition に lastFunsaiHasSpirit を追加
//   action:"millPerLoserCost" を追加（GameState.lastBattleDestroyedCost）、refreshAllByKeyword に side を追加
//   summonFromHandFree の costFilter を範囲指定対応、costDestroyOwnNexus を追加
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    declareBlock,
    effectiveBp,
    effectiveCost,
    fireStepTriggers,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
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
    for (const [cid, name] of [
        ["BS06-061", "ドルフィーノ"],
        ["BS06-062", "戦闘獣ゾウウチ"],
        ["BS06-063", "造兵技師ガタン"],
        ["BS06-064", "マンティゴア"],
        ["BS06-065", "ブロック・ゴレム"],
        ["BS06-066", "力自慢のハンフリー"],
        ["BS06-067", "武器商人ゴロン・ガラン"],
        ["BS06-068", "軍師ショウジョウジ"],
        ["BS06-069", "ツァトゥグァ"],
        ["BS06-070", "爆砕巨人ダグラス"],
        ["BS06-071", "重槍のモーガン"],
        ["BS06-072", "大巨人エウリュトス"],
        ["BS06-088", "計画された場外乱闘"],
        ["BS06-089", "鎖縛の武舞台"],
        ["BS06-090", "名誉ある御前試合"],
        ["BS06-111", "リクラメーション"],
        ["BS06-112", "マッスルチャージ"],
        ["BS06-113", "マキシマムブレイク"],
        ["BS06-114", "デモリッシュ"],
    ] as const) {
        assert(getCard(cid).name === name, `${cid} は${name}`)
    }
}

console.log("=== 虚神サイクルの完成：BS06-071が場にいると手札のX21・X23（コスト10）が両方コスト6になる ===")
{
    const s = createGame("t132-kyoshin", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    put(s, "p1", "BS06-071", 1) // Lv1
    assert(effectiveCost(s, "p1", getCard("BS06-X21")) === 6, "X21がコスト6になる")
    assert(effectiveCost(s, "p1", getCard("BS06-X23")) === 6, "X23がコスト6になる")
}

console.log("=== BS06-062：獣頭が場にいる間だけLv2として扱われる ===")
{
    const s = createGame("t132-zouuchi", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    const zouuchi = put(s, "p1", "BS06-062", 1) // Lv1
    refreshLevelAsOverrides(s)
    assert(currentLevel(zouuchi).level === 1, "獣頭がいないときはLv1のまま")
    put(s, "p1", "BS06-061", 1) // ドルフィーノ（獣頭）
    refreshLevelAsOverrides(s)
    assert(currentLevel(zouuchi).level === 2, "獣頭が場にいる間はLv2として扱われる")
}

console.log("=== BS06-064：相手のアタックステップ中のみ、バニラの自分のLv1/2スピリットをLv2として扱う ===")
{
    const s = createGame("t132-mantigoa", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    put(s, "p1", "BS06-064", 2) // Lv1
    const vanillaAlly = put(s, "p1", "BS06-061", 1) // ドルフィーノ（バニラ）Lv1
    const nonVanillaAlly = put(s, "p1", "BS01-004", 1) // 効果持ち（バニラでない）Lv1
    s.turnPlayer = "p2"
    s.phase = "attack"
    refreshLevelAsOverrides(s)
    assert(currentLevel(vanillaAlly).level === 2, "相手のアタックステップ中、バニラはLv2扱いになる")
    assert(currentLevel(nonVanillaAlly).level === 1, "効果を持つスピリットは対象外")
    s.turnPlayer = "p1"
    refreshLevelAsOverrides(s)
    assert(currentLevel(vanillaAlly).level === 1, "自分のアタックステップでは適用されない")
}

console.log("=== BS06-063：造兵全体+1000／造兵が勝つとガタン自身（selfMode:source）にコアが乗る ===")
{
    const s = createGame("t132-gatan", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    const gatan = put(s, "p1", "BS06-063", 3) // Lv2
    const ally = put(s, "p1", "BS06-065", 1) // 造兵 Lv1 BP3000
    assert(effectiveBp(s, "p1", ally) === 4000, `造兵は+1000される（実際: ${String(effectiveBp(s, "p1", ally))}）`)
    assert(effectiveBp(s, "p1", gatan) === 4000, "ガタン自身（創手）はこのオーラの対象外")
    const blocker = put(s, "p2", "BS01-002", 1) // BP1000
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: ally.instanceId }) === null, "造兵でアタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "ブロッカーが破壊される")
    assert(gatan.cores === 4, "造兵の勝利でガタン自身にボイドからコアが乗る（3→4）")
}

console.log("=== BS06-065：ネクサス1つにつき2枚破棄・上限4枚 ===")
{
    const s = createGame("t132-golem", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    const golem = put(s, "p1", "BS06-065", 1) // Lv1
    for (let i = 0; i < 7; i++) putNexus(s, "p1", "BS01-098", 0)
    const deckBefore = s.players.p2.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: golem.instanceId }) === null, "アタック宣言")
    assert(deckBefore - s.players.p2.deck.length === 4, `ネクサス7つ（本来14枚）でも上限4枚（実際: ${String(deckBefore - s.players.p2.deck.length)}）`)
}

console.log("=== BS06-070 Lv2：粉砕でスピリットカードが落ちたときだけコスト3以下を破壊する ===")
{
    const s = createGame("t132-douglas-hit", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    const douglas = put(s, "p1", "BS06-070", 4) // Lv2
    s.players.p2.deck.unshift("BS01-001") // 粉砕の1枚目にスピリットカード
    const victim = put(s, "p2", "BS01-001", 1) // コスト0
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: douglas.instanceId }) === null, "アタック宣言（粉砕2枚破棄）")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === victim.instanceId), "スピリットが落ちたのでコスト3以下が破壊される")
}
{
    const s = createGame("t132-douglas-miss", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    const douglas = put(s, "p1", "BS06-070", 4) // Lv2
    s.players.p2.deck.unshift("BS01-098", "BS01-146") // ネクサス・マジックのみ（スピリットなし）
    const victim = put(s, "p2", "BS01-001", 1) // コスト0
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: douglas.instanceId }) === null, "アタック宣言（粉砕2枚破棄）")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === victim.instanceId), "スピリットが落ちなかったので破壊されない")
}

console.log("=== BS06-071：コスト4のスピリットだけが全滅する（コスト3・5は残る） ===")
{
    const s = createGame("t132-morgan-summon", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    s.players.p1.hand = ["BS06-071"]
    s.players.p1.reserve = 20
    const c3 = put(s, "p2", "BS01-008", 1) // コスト3
    const c4 = put(s, "p2", "BS01-012", 1) // コスト4
    const c5 = put(s, "p2", "BS01-016", 1) // コスト5
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "重槍のモーガンを召喚")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === c4.instanceId), "コスト4は破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === c3.instanceId), "コスト3は残る")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === c5.instanceId), "コスト5は残る")
}

console.log("=== BS06-072：召喚時、両陣営のコスト3以下がすべて破壊される ===")
{
    const s = createGame("t132-eurytos", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    s.players.p1.hand = ["BS06-072"]
    s.players.p1.reserve = 20
    const p1low = put(s, "p1", "BS01-008", 1) // コスト3
    const p2low = put(s, "p2", "BS01-008", 1) // コスト3
    const p2high = put(s, "p2", "BS01-016", 1) // コスト5
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "大巨人エウリュトスを召喚")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === p1low.instanceId), "自陣コスト3以下も破壊される（anySide）")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === p2low.instanceId), "相手コスト3以下も破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === p2high.instanceId), "コスト5は残る")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === "BS06-072"), "エウリュトス自身（コスト7）は残る")
}

console.log("=== B4: BS06-088 Lv1-2：闘神は疲労状態でも相手コスト1以下をブロックできる（コスト2は不可） ===")
{
    const s = createGame("t132-gaigairantou-cost1", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-088", 0) // Lv1
    const blocker = put(s, "p1", "BS06-066", 1) // 闘神
    blocker.isRested = true
    const attacker = put(s, "p2", "BS01-002", 1) // コスト1
    s.turnPlayer = "p2"
    s.phase = "attack"
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "コスト1でアタック宣言")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "疲労状態でもコスト1以下はブロックできる")
}
{
    const s = createGame("t132-gaigairantou-cost2", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-088", 0) // Lv1
    const blocker = put(s, "p1", "BS06-066", 1) // 闘神
    blocker.isRested = true
    const attacker = put(s, "p2", "BS01-003", 1) // コスト2
    s.turnPlayer = "p2"
    s.phase = "attack"
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "コスト2でアタック宣言")
    assert(declareBlock(s, "p1", blocker.instanceId) !== null, "コスト2は疲労状態のままブロックできない")
}

console.log("=== B5: BS06-088 Lv2：闘神がブロックされたとき、ブロッカーと同コストの他の相手スピリットを破壊（ブロッカー自身は残る） ===")
{
    const s = createGame("t132-gaigairantou-lv2", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-088", 3) // Lv2
    const attacker = put(s, "p1", "BS06-066", 1) // 闘神
    const blocker = put(s, "p2", "BS01-004", 1) // コスト2
    const other = put(s, "p2", "BS01-005", 1) // コスト2（同コスト。破壊対象）
    const survivor = put(s, "p2", "BS01-008", 1) // コスト3（対象外）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "闘神でアタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "ブロッカー自身は残る（excludeTarget）")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === other.instanceId), "同コストの他のスピリットは破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === survivor.instanceId), "異なるコストは残る")
}

console.log("=== B2: BS06-089 Lv1-2：お互い、トラッシュからカードを手札に戻せない ===")
{
    const s = createGame("t132-sasaku", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-089", 0) // Lv1
    s.players.p1.trashCards.push("BS01-001")
    resolveAction(s, "p1", null, { type: "recoverSpiritFromTrash", count: 1 })
    assert(s.players.p1.trashCards.includes("BS01-001"), "トラッシュ回収が不発（noTrashRecovery）")
    assert(!s.players.p1.hand.includes("BS01-001"), "手札に戻っていない")
}

console.log("=== B1: BS06-068 Lv1-2：お互いのメインステップ、マジックのフラッシュ効果を使用できない（バトル中は使える） ===")
{
    const s = createGame("t132-shoujouji-main", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    put(s, "p1", "BS06-068", 1) // Lv1
    s.players.p1.hand[0] = "BS06-112" // フラッシュのみのマジック
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) !== null, "自分のメインステップでもフラッシュ効果は使用できない（お互い禁止）")
}
{
    const s = createGame("t132-shoujouji-battle", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    put(s, "p1", "BS06-068", 1)
    const attacker = put(s, "p1", "BS01-005", 1)
    s.players.p1.hand[0] = "BS06-112"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言（フラッシュ①オープン、優先権は防御側）")
    assert(act(s, "p2", { type: "pass" }) === null, "p2がパスして優先権をp1へ")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインステップ以外（バトル中のフラッシュ）では使える")
}

console.log("=== B1: BS06-089 Lv2：相手のメインステップのみフラッシュ効果を禁止（自分は使える） ===")
{
    const s = createGame("t132-sasaku-flash", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-089", 2) // Lv2
    s.turnPlayer = "p2"
    s.phase = "main"
    s.players.p2.hand[0] = "BS06-112"
    s.players.p2.reserve = 10
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) !== null, "相手のメインステップ、フラッシュ効果は使用できない")
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.hand[0] = "BS06-112"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ネクサスの持ち主自身は使える（noFlashOpponent）")
}

console.log("=== BS06-090：粉砕持ちが勝つと破壊した相手のコストぶんミル／エンドステップに粉砕持ちだけ回復 ===")
{
    const s = createGame("t132-gozenjiai-win", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-090", 0) // Lv1
    const attacker = put(s, "p1", "BS06-066", 1) // Lv1 粉砕 BP3000
    const blocker = put(s, "p2", "BS01-002", 1) // コスト1 BP1000
    const deckBefore = s.players.p2.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言（粉砕で1枚破棄）")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "ブロッカーが破壊される")
    assert(
        deckBefore - s.players.p2.deck.length === 2,
        `粉砕1枚＋破壊した相手のコスト1枚＝合計2枚破棄（実際: ${String(deckBefore - s.players.p2.deck.length)}）`,
    )
}
{
    const s = createGame("t132-gozenjiai-end", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-090", 3) // Lv2
    const funsaiSpirit = put(s, "p1", "BS06-066", 1)
    funsaiSpirit.isRested = true as boolean
    const plainSpirit = put(s, "p1", "BS01-005", 1) // 粉砕を持たない
    plainSpirit.isRested = true
    const enemyFunsai = put(s, "p2", "BS06-070", 1) // 相手側の粉砕持ち
    enemyFunsai.isRested = true
    fireStepTriggers(s, "end")
    assert(funsaiSpirit.isRested === false, "自分の粉砕持ちは回復する")
    assert(plainSpirit.isRested === true, "粉砕を持たない自分のスピリットは回復しない")
    assert(enemyFunsai.isRested === true, "相手の粉砕持ちは回復しない（side:own）")
}

console.log("=== BS06-111：自分のネクサスを破壊してコスト4以下の青を無償召喚（ネクサスが無ければ不発） ===")
{
    const s = createGame("t132-reclamation-hit", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    const nexus = putNexus(s, "p1", "BS01-098", 0)
    s.players.p1.hand = ["BS06-065"] // 青コスト3
    s.players.p1.reserve = 10
    resolveMagic(s, "p1", "BS06-111", "main")
    assert(!s.players.p1.field.nexuses.some((x) => x.instanceId === nexus.instanceId), "ネクサスが破壊される")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === "BS06-065"), "コスト4以下の青が無償召喚される")
    assert(!s.players.p1.hand.includes("BS06-065"), "手札から消える")
}
{
    const s = createGame("t132-reclamation-miss", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    s.players.p1.hand = ["BS06-065"]
    s.players.p1.reserve = 10
    resolveMagic(s, "p1", "BS06-111", "main")
    assert(s.players.p1.hand.includes("BS06-065"), "ネクサスが無ければ不発（手札に残る）")
    assert(!s.players.p1.field.spirits.some((x) => x.cardId === "BS06-065"), "召喚されない")
}

console.log("=== BS06-112：闘神を持つ自分のスピリットが、そのカードの最高Lvとして扱われる ===")
{
    const s = createGame("t132-musclecharge", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    const fighter = put(s, "p1", "BS06-066", 1) // 闘神 Lv1（最高Lv3）
    const other = put(s, "p1", "BS01-005", 1) // 闘神でない
    resolveMagic(s, "p1", "BS06-112", "flash")
    refreshLevelAsOverrides(s)
    assert(currentLevel(fighter).level === 3, "闘神スピリットは最高Lv（3）として扱われる")
    assert(currentLevel(other).level === 1, "闘神以外は対象外")
}

console.log("=== B3: BS06-113：millPerの上限（4）を+10して14になる ===")
{
    const s = createGame("t132-maxbreak-no", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    const golem = put(s, "p1", "BS06-065", 1)
    for (let i = 0; i < 7; i++) putNexus(s, "p1", "BS01-098", 0)
    const deckBefore = s.players.p2.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: golem.instanceId }) === null, "アタック宣言（貸与なし）")
    assert(deckBefore - s.players.p2.deck.length === 4, "貸与前は上限4枚のまま")
}
{
    const s = createGame("t132-maxbreak-yes", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    const golem = put(s, "p1", "BS06-065", 1)
    for (let i = 0; i < 7; i++) putNexus(s, "p1", "BS01-098", 0)
    resolveMagic(s, "p1", "BS06-113", "main")
    const deckBefore = s.players.p2.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: golem.instanceId }) === null, "アタック宣言（マキシマムブレイク貸与あり）")
    assert(
        deckBefore - s.players.p2.deck.length === 14,
        `上限が4→14になる（ネクサス7つ×2=14がそのまま通る。実際: ${String(deckBefore - s.players.p2.deck.length)}）`,
    )
}

console.log("=== BS06-114：粉砕の破棄枚数を+3する ===")
{
    const s = createGame("t132-demolish", { p1: "blue", p2: "blue" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS06-066", 1) // Lv1 粉砕
    resolveMagic(s, "p1", "BS06-114", "main")
    const deckBefore = s.players.p2.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(
        deckBefore - s.players.p2.deck.length === 4,
        `粉砕の破棄枚数がLv1（1枚）+3=4枚になる（実際: ${String(deckBefore - s.players.p2.deck.length)}）`,
    )
}
