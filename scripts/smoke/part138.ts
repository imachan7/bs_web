// smoke パート138（第七弾 黄バッチ：新要素の発揮確認）
//
// 黄15枚が持ち込んだ新要素を**実カードデータ経由**で確かめる:
//   【聖命】（keyword + onLifeDealt → lifeCharge from:"void"）／
//   activated の cost:{exhaustSelf} と filter.attackingOnly ／
//   triggered.condition の ownNameIncludesCountAtLeast / targetNotMaxLevel ／
//   reviveOnDestroy.cost.exhaustOwnFamilyOne ／ costMod set の nameContains ／
//   unblockableBy.maxCost ／ protectLifeByCostThisTurn ／
//   spiritEffectsDisabledGrant ／ magicRepeatGrant ／ markUnblockableThisTurn target:"self"
//
// カードIDは直書きせず、**カードデータから条件で引いて**使う（IDズレ事故の予防）。
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    declareBlock,
    destroyNexus,
    destroySpirit,
    effectiveBp,
    effectiveCost,
    fireStepTriggers,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    family?: string[]
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function byId(cardId: string): CardRow {
    const found = CARDS.find((c) => c.cardId === cardId)
    if (!found) throw new Error(`${cardId} が見つかりません`)
    return found
}

// 効果の中身から1枚を引く（カードIDの直書きを避けるため）
function findByEffect(pred: (e: Record<string, unknown>, c: CardRow) => boolean): CardRow {
    const found = CARDS.find((c) => (c.effects ?? []).some((e) => pred(e, c)))
    if (!found) throw new Error("条件に合うカードが見つかりません")
    return found
}
function kindOf(c: CardRow, kind: string): Record<string, unknown> {
    const found = (c.effects ?? []).find((e) => e["kind"] === kind)
    if (!found) throw new Error(`${c.name} に kind:${kind} のエントリがありません`)
    return found
}

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// レベル1でコア1のバニラ（盤面に干渉しない詰め物）
const FILLER = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.cores ?? 99) === 1,
)
if (!FILLER) throw new Error("バニラが見つかりません")

// 【聖命】をLv2から持つスピリット（百合の妖精ユリィ）
const SEIMEI_L2 = findByEffect(
    (e) =>
        e["kind"] === "keyword" &&
        e["keyword"] === "seimei" &&
        Array.isArray(e["levels"]) &&
        !(e["levels"] as number[]).includes(1) &&
        (e["levels"] as number[]).includes(2),
)

console.log("=== BS07 黄：【聖命】はライフを減らしたときボイドからライフにコアを置く ===")
{
    // Lv2（【聖命】が有効）でアタックしてライフを減らす
    const s = base("seimei-on")
    const cores2 = SEIMEI_L2.levels?.[1]?.cores ?? 2
    const attacker = put(s, "p1", SEIMEI_L2.cardId, cores2)
    const lifeBefore = s.players.p1.life
    const oppLife = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, `${SEIMEI_L2.name}がアタック`)
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    assert(s.players.p2.life < oppLife, "相手のライフが減っている")
    assert(
        s.players.p1.life === lifeBefore + 1,
        `【聖命】で自分のライフが1増える（${lifeBefore}→${s.players.p1.life}）`,
    )
    // ボイド由来なのでリザーブは減っていない（from:"void" の確認）
    assert(s.players.p1.reserve === 30, "リザーブを消費していない（ボイドから置いている）")
}
{
    // 対照実験：Lv1（【聖命】が無効なレベル）ではライフは増えない
    const s = base("seimei-off")
    const attacker = put(s, "p1", SEIMEI_L2.cardId, SEIMEI_L2.levels?.[0]?.cores ?? 1)
    const lifeBefore = s.players.p1.life
    assert(currentLevel(attacker).level === 1, "Lv1で立てている")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    assert(s.players.p1.life === lifeBefore, "対照実験：Lv1では【聖命】が働かない")
}

console.log("=== BS07 黄：起動能力を「自身を疲労させて」発動し、アタック中の【聖命】持ちをBP+する ===")
{
    // 桜の妖精オウカ：cost:{exhaustSelf} を持つ唯一の起動能力
    const ouka = findByEffect(
        (e) => e["kind"] === "activated" && (e["cost"] as Record<string, unknown> | undefined)?.["exhaustSelf"] === true,
    )
    const amount = Number((kindOf(ouka, "activated")["action"] as Record<string, unknown>)["amount"])
    const s = base("activated-exhaust-self")
    const ability = put(s, "p1", ouka.cardId, 1)
    const attacker = put(s, "p1", SEIMEI_L2.cardId, SEIMEI_L2.levels?.[1]?.cores ?? 2)
    // 同じ【聖命】持ちだがアタックしない個体（attackingOnly の対照）
    const bench = put(s, "p1", SEIMEI_L2.cardId, SEIMEI_L2.levels?.[1]?.cores ?? 2)
    put(s, "p2", FILLER.cardId, 1)
    const attackerRaw = effectiveBp(s, "p1", attacker)
    const benchRaw = effectiveBp(s, "p1", bench)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言（フラッシュが開く）")
    // フラッシュは防御側（非ターンプレイヤー）から優先権を持つので、1度パスさせて攻撃側へ回す
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパスして優先権が攻撃側へ")
    const effectId = String(kindOf(ouka, "activated")["id"])
    assert(
        act(s, "p1", { type: "activateAbility", instanceId: ability.instanceId, effectId }) === null,
        `${ouka.name}の起動能力を発動`,
    )
    assert(ability.isRested === true, "コストとして自身が疲労している")
    assert(s.players.p1.reserve === 30, "リザーブは支払っていない")
    assert(
        effectiveBp(s, "p1", attacker) === attackerRaw + amount,
        `アタックしている【聖命】持ちがBP+${amount}（${attackerRaw}→${effectiveBp(s, "p1", attacker)}）`,
    )
    assert(effectiveBp(s, "p1", bench) === benchRaw, "対照実験：アタックしていない【聖命】持ちは対象外")
    // 2回目は既に疲労しているので発動できない
    assert(
        act(s, "p1", { type: "activateAbility", instanceId: ability.instanceId, effectId }) !== null,
        "疲労済みなので再発動できない",
    )
}

console.log("=== BS07 黄：破壊時に特定のカード名が自分の場にいれば手札に戻る ===")
{
    // マカロニペンタン：condition.ownNameIncludesCountAtLeast を持つ唯一のカード
    const pentan = findByEffect(
        (e) =>
            e["kind"] === "triggered" &&
            (e["condition"] as Record<string, unknown> | undefined)?.["ownNameIncludesCountAtLeast"] !== undefined,
    )
    const names = (
        (kindOf(pentan, "triggered")["condition"] as Record<string, unknown>)[
            "ownNameIncludesCountAtLeast"
        ] as Record<string, unknown>
    )["names"] as string[]
    // 条件に合うカード名を持つスピリットをデータから引く
    const anchor = CARDS.find((c) => c.type === "spirit" && names.some((n) => c.name.includes(n)))
    if (!anchor) throw new Error("条件のカード名を持つスピリットが見つかりません")

    const s = base("pentan-return")
    const target = put(s, "p1", pentan.cardId, 1)
    put(s, "p1", anchor.cardId, 1)
    const handBefore = s.players.p1.hand.length
    destroySpirit(s, "p1", target.instanceId)
    assert(
        s.players.p1.hand.filter((id) => id === pentan.cardId).length === 1,
        `${anchor.name}がいるので${pentan.name}は手札に戻る`,
    )
    assert(s.players.p1.hand.length === handBefore + 1, "手札が1枚増えている")
    assert(!s.players.p1.trashCards.includes(pentan.cardId), "トラッシュには残っていない")

    // 対照実験：条件のカードがいなければトラッシュのまま
    const s2 = base("pentan-no-anchor")
    const target2 = put(s2, "p1", pentan.cardId, 1)
    destroySpirit(s2, "p1", target2.instanceId)
    assert(s2.players.p1.trashCards.includes(pentan.cardId), "対照実験：条件を満たさなければ手札に戻らない")
}

console.log("=== BS07 黄：破壊されるとき同系統1体を疲労させて回復状態で残る ===")
{
    // パオ・ペイール：reviveOnDestroy.cost.exhaustOwnFamilyOne を持つ唯一のカード
    const pao = findByEffect(
        (e) =>
            e["kind"] === "reviveOnDestroy" &&
            (e["cost"] as Record<string, unknown> | undefined)?.["exhaustOwnFamilyOne"] !== undefined,
    )
    const family = String(
        (kindOf(pao, "reviveOnDestroy")["cost"] as Record<string, unknown>)["exhaustOwnFamilyOne"],
    )
    const sameFamily = CARDS.find(
        (c) => c.type === "spirit" && c.cardId !== pao.cardId && (c.family ?? []).includes(family),
    )
    if (!sameFamily) throw new Error(`系統「${family}」の別カードが見つかりません`)

    const s = base("pao-revive")
    const pao1 = put(s, "p1", pao.cardId, 1)
    const cost1 = put(s, "p1", sameFamily.cardId, 1)
    pao1.isRested = true
    destroySpirit(s, "p1", pao1.instanceId)
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === pao1.instanceId),
        `${pao.name}は破壊されずフィールドに残る`,
    )
    assert(!pao1.isRested, "回復状態で残る")
    assert(cost1.isRested === true, `コストとして系統「${family}」の1体が疲労している`)

    // 対照実験：疲労させられる同系統がいなければ通常どおり破壊される
    const s2 = base("pao-no-cost")
    const pao2 = put(s2, "p1", pao.cardId, 1)
    destroySpirit(s2, "p1", pao2.instanceId)
    assert(
        !s2.players.p1.field.spirits.some((sp) => sp.instanceId === pao2.instanceId),
        "対照実験：コストを払えなければ破壊される",
    )
}

console.log("=== BS07 黄：手札のカード名一致スピリットのコストを置換する ===")
{
    // 女帝ペンプレス：costMod mode:"set" に nameContains を持つ唯一のカード
    const empress = findByEffect(
        (e) => e["kind"] === "costMod" && e["mode"] === "set" && e["nameContains"] !== undefined,
    )
    const setEntry = (empress.effects ?? []).find((e) => e["kind"] === "costMod" && e["mode"] === "set")!
    const nameContains = String(setEntry["nameContains"])
    const setTo = Number(setEntry["setTo"])
    const levels = setEntry["levels"] as number[]
    // 名前が一致するスピリットカードと、一致しないスピリットカード（対照）
    const match = CARDS.find(
        (c) => c.type === "spirit" && c.name.includes(nameContains) && (c.cost ?? 0) !== setTo,
    )
    const other = CARDS.find(
        (c) => c.type === "spirit" && !c.name.includes(nameContains) && (c.cost ?? 0) > setTo && (c.effects ?? []).length === 0,
    )
    const magicMatch = CARDS.find((c) => c.type === "magic" && c.name.includes(nameContains))
    if (!match || !other) throw new Error("コスト置換の検証に使えるカードが見つかりません")

    const s = base("cost-set-name")
    const coresForLevel = empress.levels?.[levels[0]! - 1]?.cores ?? 2
    put(s, "p1", empress.cardId, coresForLevel)
    assert(
        effectiveCost(s, "p1", byId(match.cardId) as never) === setTo,
        `${match.name}（元コスト${match.cost}）のコストが${setTo}になる`,
    )
    assert(
        effectiveCost(s, "p1", byId(other.cardId) as never) !== setTo || (other.cost ?? 0) === setTo,
        `対照実験：${other.name}は置換されない`,
    )
    if (magicMatch) {
        assert(
            effectiveCost(s, "p1", byId(magicMatch.cardId) as never) !== setTo ||
                (magicMatch.cost ?? 0) === setTo,
            `対照実験：同名を含んでもマジックカード（${magicMatch.name}）は cardTypeFilter で除外される`,
        )
    }

    // Lv1（置換が無効なレベル）では元のコストのまま
    const s2 = base("cost-set-level")
    put(s2, "p1", empress.cardId, empress.levels?.[0]?.cores ?? 1)
    assert(
        effectiveCost(s2, "p1", byId(match.cardId) as never) !== setTo,
        "対照実験：レベル条件を満たさなければ置換されない",
    )
}

console.log("=== BS07 黄：カード名一致スピリットが破壊されると回復する（アタックステップ限定） ===")
{
    const empress = findByEffect(
        (e) => e["kind"] === "fieldEvent" && e["event"] === "ownSpiritDestroyed" && Array.isArray(e["nameIncludes"]),
    )
    const entry = (empress.effects ?? []).find((e) => e["kind"] === "fieldEvent")!
    const names = entry["nameIncludes"] as string[]
    const pentan = CARDS.find((c) => c.type === "spirit" && names.some((n) => c.name.includes(n)))
    if (!pentan) throw new Error("カード名一致スピリットが見つかりません")

    const s = base("empress-refresh")
    const boss = put(s, "p1", empress.cardId, 1)
    const minion = put(s, "p1", pentan.cardId, 1)
    boss.isRested = true
    assert(act(s, "p1", { type: "nextPhase" }) === null, "自分のアタックステップへ")
    destroySpirit(s, "p1", minion.instanceId)
    assert(!boss.isRested, `${pentan.name}の破壊で${empress.name}が回復する`)

    // 対照実験：メインステップ（phase 条件を満たさない）では回復しない
    const s2 = base("empress-refresh-phase")
    const boss2 = put(s2, "p1", empress.cardId, 1)
    const minion2 = put(s2, "p1", pentan.cardId, 1)
    boss2.isRested = true
    destroySpirit(s2, "p1", minion2.instanceId)
    assert(boss2.isRested === true, "対照実験：メインステップでは回復しない")
}

console.log("=== BS07 黄：召喚時に自分自身が「ブロックされない」印を得る ===")
{
    // 天使長トロン：markUnblockableThisTurn の target:"self" を持つ唯一のカード
    const tron = findByEffect(
        (e) =>
            e["kind"] === "triggered" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "markUnblockableThisTurn" &&
            (e["action"] as Record<string, unknown>)["target"] === "self",
    )
    const s = base("tron-unblockable")
    // BP最大の別スピリットを先に置いておく（自動選択なら誤ってこちらが選ばれる）
    const decoy = put(s, "p1", SEIMEI_L2.cardId, SEIMEI_L2.levels?.[1]?.cores ?? 2)
    const tronInst = put(s, "p1", tron.cardId, 1)
    resolveAction(s, "p1", tronInst, { type: "markUnblockableThisTurn", minBp: 0, target: "self" })
    assert(tronInst.unblockableOnceThisTurn === true, `${tron.name}自身に印が付く`)
    assert(decoy.unblockableOnceThisTurn !== true, "対照実験：BPが上の別スピリットには付かない")
}

console.log("=== BS07 黄：最高Lvではない相手にブロックされたとき回復する ===")
{
    // 神帝獣スフィン・クロス：condition.targetNotMaxLevel を持つ唯一のカード
    const sphinx = findByEffect(
        (e) =>
            e["kind"] === "triggered" &&
            (e["condition"] as Record<string, unknown> | undefined)?.["targetNotMaxLevel"] === true,
    )
    const entry = (sphinx.effects ?? []).find(
        (e) => (e["condition"] as Record<string, unknown> | undefined)?.["targetNotMaxLevel"] === true,
    )!
    const level = (entry["levels"] as number[])[0]!
    const cores = sphinx.levels?.[level - 1]?.cores ?? 10
    // Lv3を持つバニラ（ブロッカー側のレベルを作り分けるため）
    const blockerCard = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.length ?? 0) >= 3,
    )
    if (!blockerCard) throw new Error("Lv3を持つバニラが見つかりません")

    const s = base("sphinx-refresh")
    const attacker = put(s, "p1", sphinx.cardId, cores)
    const blocker = put(s, "p2", blockerCard.cardId, blockerCard.levels?.[0]?.cores ?? 1)
    blocker.tempBpBuff = 999999 // アタッカーが倒されないようにブロッカー側を勝たせない
    blocker.tempBpBuff = 0
    attacker.tempBpBuff = 999999 // BP比較でアタッカーが勝つようにする
    assert(currentLevel(blocker).level === 1, "ブロッカーはLv1（最高Lvではない）")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(attacker.isRested === false, "最高Lvでない相手にブロックされたので回復している")

    // 対照実験：最高Lvのブロッカーなら回復しない
    const s2 = base("sphinx-max-level")
    const attacker2 = put(s2, "p1", sphinx.cardId, cores)
    const maxCores = blockerCard.levels?.[blockerCard.levels.length - 1]?.cores ?? 3
    const blocker2 = put(s2, "p2", blockerCard.cardId, maxCores)
    attacker2.tempBpBuff = 999999
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "アタック")
    assert(declareBlock(s2, "p2", blocker2.instanceId) === null, "ブロック宣言")
    assert(attacker2.isRested === true, "対照実験：最高Lvの相手にブロックされたら回復しない")
}

console.log("=== BS07 黄：自分のネクサスが破壊されるとボイドからライフにコアを置く ===")
{
    // 秘密の花園：ownNexusDestroyed → lifeCharge from:"void"
    const garden = findByEffect(
        (e) =>
            e["kind"] === "fieldEvent" &&
            e["event"] === "ownNexusDestroyed" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "lifeCharge",
    )
    const s = base("garden-life")
    putNexus(s, "p1", garden.cardId, 0)
    const victim = putNexus(s, "p1", byId("BS07-065").cardId, 0)
    const lifeBefore = s.players.p1.life
    destroyNexus(s, "p1", victim.instanceId)
    assert(
        s.players.p1.life === lifeBefore + 1,
        `自分のネクサス破壊でライフ+1（${lifeBefore}→${s.players.p1.life}）`,
    )
    assert(s.players.p1.reserve === 30, "リザーブは消費しない（ボイドから置いている）")
}

console.log("=== BS07 黄：楽族を疲労させて、このターン自分だけコスト3以下のアタックでライフが減らない ===")
{
    // 秘密の花園Lv2：protectLifeByCostThisTurn を持つ唯一のカード
    const garden = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "protectLifeByCostThisTurn",
    )
    const stepEntry = (garden.effects ?? []).find(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "protectLifeByCostThisTurn",
    )!
    const action = stepEntry["action"] as Record<string, unknown>
    const maxCost = Number(action["maxCost"])
    const family = String(action["costExhaustFamily"])
    const gakuzoku = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes(family))
    const cheap = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 99) <= maxCost,
    )
    if (!gakuzoku || !cheap) throw new Error("ライフ保護の検証に使えるカードが見つかりません")

    const s = base("garden-protect")
    // p1 のネクサス（Lv2）と楽族。p2 のターンのスタートステップで発火する
    const nexusCores = Number((garden.levels ?? [])[1]?.cores ?? 3)
    putNexus(s, "p1", garden.cardId, nexusCores)
    const musician = put(s, "p1", gakuzoku.cardId, gakuzoku.levels?.[0]?.cores ?? 1)
    const attacker = put(s, "p2", cheap.cardId, 1)
    // p2 のターンに切り替えてスタートステップ誘発を起こす
    s.turnPlayer = "p2"
    s.phase = "start"
    fireStepTriggers(s, "start")
    assert(musician.isRested === true, `コストとして系統「${family}」の1体が疲労している`)
    assert(
        s.turnConstraints.some((c) => c.type === "noLifeDamageByCostForPid" && c.pid === "p1"),
        "p1 限定のライフ保護が積まれている",
    )
    // p2 がコスト条件を満たすスピリットでアタックしてもライフは減らない
    s.phase = "main"
    const lifeBefore = s.players.p1.life
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2 のアタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, `${cheap.name}でアタック`)
    assert(takeLifeAndResolve(s, "p1") === null, "ライフで受ける宣言")
    assert(s.players.p1.life === lifeBefore, `コスト${maxCost}以下のアタックでライフが減らない`)
}
{
    // 対照実験：保護は片側だけ（積んでいない側のライフは通常どおり減る）
    const garden = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "protectLifeByCostThisTurn",
    )
    const action = (garden.effects ?? []).find(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "protectLifeByCostThisTurn",
    )!["action"] as Record<string, unknown>
    const maxCost = Number(action["maxCost"])
    const cheap = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 99) <= maxCost,
    )!
    const s = base("garden-protect-oneside")
    s.turnConstraints.push({ type: "noLifeDamageByCostForPid", maxCost, pid: "p1" })
    const attacker = put(s, "p1", cheap.cardId, 1)
    const lifeBefore = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1 がアタック")
    assert(takeLifeAndResolve(s, "p2") === null, "p2 がライフで受ける")
    assert(s.players.p2.life < lifeBefore, "対照実験：保護を積んでいない p2 のライフは減る")
}

console.log("=== BS07 黄：【聖命】持ちは相手のコスト3以下からブロックされない ===")
{
    // 聖なる命の泉：unblockableBy.maxCost を持つ唯一のカード
    const fountain = findByEffect(
        (e) =>
            e["kind"] === "constraintGrant" &&
            (e["constraint"] as Record<string, unknown> | undefined)?.["maxCost"] !== undefined,
    )
    const grant = (fountain.effects ?? []).find((e) => e["kind"] === "constraintGrant")!
    const maxCost = Number((grant["constraint"] as Record<string, unknown>)["maxCost"])
    const nexusCores = Number((fountain.levels ?? [])[(grant["levels"] as number[])[0]! - 1]?.cores ?? 3)
    const cheapBlocker = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 99) <= maxCost,
    )
    const bigBlocker = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).length === 0 &&
            (c.cost ?? 0) > maxCost &&
            (c.levels?.[0]?.cores ?? 99) === 1,
    )
    if (!cheapBlocker || !bigBlocker) throw new Error("ブロッカー候補が見つかりません")

    const s = base("fountain-unblockable")
    putNexus(s, "p1", fountain.cardId, nexusCores)
    const attacker = put(s, "p1", SEIMEI_L2.cardId, SEIMEI_L2.levels?.[1]?.cores ?? 2)
    const cheap = put(s, "p2", cheapBlocker.cardId, 1)
    const big = put(s, "p2", bigBlocker.cardId, 1)
    // オーラ（Lv1-2：【聖命】持ちをBP+1000）も同時に確認する
    const auraEntry = (fountain.effects ?? []).find((e) => e["kind"] === "aura")!
    const auraAmount = Number((auraEntry["aura"] as Record<string, unknown>)["amount"])
    const rawBp = SEIMEI_L2.levels?.[1]?.bp ?? 0
    assert(
        effectiveBp(s, "p1", attacker) === rawBp + auraAmount,
        `【聖命】持ちがBP+${auraAmount}（${rawBp}→${effectiveBp(s, "p1", attacker)}）`,
    )
    assert(act(s, "p1", { type: "nextPhase" }) === null, "自分のアタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p2", cheap.instanceId) !== null, `コスト${maxCost}以下ではブロックできない`)
    assert(declareBlock(s, "p2", big.instanceId) === null, "対照実験：コストが上回るスピリットならブロックできる")
}

console.log("=== BS07 黄：【聖命】持ちがブロックされるとライフにコアを置く（ブルームフルート） ===")
{
    // fieldEvent ownSpiritBlocked + keywordFilter:"seimei" を持つマジック
    const bloom = findByEffect(
        (e) => e["kind"] === "fieldEvent" && e["event"] === "ownSpiritBlocked" && e["keywordFilter"] === "seimei",
    )
    const s = base("bloom-flute")
    const attacker = put(s, "p1", SEIMEI_L2.cardId, SEIMEI_L2.levels?.[1]?.cores ?? 2)
    attacker.tempBpBuff = 999999
    const blocker = put(s, "p2", FILLER.cardId, 1)
    s.players.p1.hand.push(bloom.cardId)
    const handIndex = s.players.p1.hand.length - 1
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパスして優先権が攻撃側へ")
    assert(act(s, "p1", { type: "castMagic", handIndex }) === null, `${bloom.name}をフラッシュで使用`)
    const lifeBefore = s.players.p1.life
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(
        s.players.p1.life === lifeBefore + 1,
        `【聖命】持ちがブロックされてライフ+1（${lifeBefore}→${s.players.p1.life}）`,
    )
}

console.log("=== BS07 黄：ブロックした【転召】なしの相手は効果を発揮しない（ルナースラッシュ） ===")
{
    const luna = findByEffect((e) => e["kind"] === "spiritEffectsDisabledGrant")
    const grant = kindOf(luna, "spiritEffectsDisabledGrant")
    const excluded = String(grant["keywordExclude"])
    // 自分自身をBP+する常時オーラを持ち、制約（cantBlock 等）と【転召】を持たないスピリット。
    // ブロックできて、かつ無効化の効き目がBPで観測できる個体を選ぶ
    const victim = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).some(
                (e) =>
                    e["kind"] === "aura" &&
                    (e["aura"] as Record<string, unknown> | undefined)?.["target"] === "self" &&
                    (e["aura"] as Record<string, unknown>)["phaseTurn"] === undefined &&
                    (e["aura"] as Record<string, unknown>)["condition"] === undefined &&
                    ((e["aura"] as Record<string, unknown>)["amount"] !== undefined ||
                        (e["aura"] as Record<string, unknown>)["counter"] === "ownReserve"),
            ) &&
            !(c.effects ?? []).some((e) => e["kind"] === "constraint") &&
            !(c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === excluded),
    )
    // 【転召】持ち（対照実験用）
    const immune = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === excluded),
    )
    if (!victim || !immune) throw new Error("ルナースラッシュの検証に使えるスピリットが見つかりません")

    const s = base("luna-disable")
    const attacker = put(s, "p1", FILLER.cardId, 1)
    // オーラの levels 条件を満たすよう最高レベルで立てる
    const blocker = put(s, "p2", victim.cardId, victim.levels?.[victim.levels.length - 1]?.cores ?? 1)
    s.players.p1.hand.push(luna.cardId)
    const handIndex = s.players.p1.hand.length - 1
    assert(act(s, "p1", { type: "castMagic", handIndex }) === null, `${luna.name}をメインで使用`)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    const bpWithAura = effectiveBp(s, "p2", blocker)
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    refreshLevelAsOverrides(s)
    assert(blocker.effectsDisabledContinuous === true, `ブロックした${victim.name}の効果が発揮されなくなる`)
    assert(
        effectiveBp(s, "p2", blocker) < bpWithAura,
        `自己BPオーラも止まる（${bpWithAura}→${effectiveBp(s, "p2", blocker)}）`,
    )

    // 対照実験：【転召】持ちのブロッカーは無効化されない
    const s2 = base("luna-tensho")
    const attacker2 = put(s2, "p1", FILLER.cardId, 1)
    const blocker2 = put(s2, "p2", immune.cardId, immune.levels?.[0]?.cores ?? 1)
    s2.players.p1.hand.push(luna.cardId)
    const handIndex2 = s2.players.p1.hand.length - 1
    assert(act(s2, "p1", { type: "castMagic", handIndex: handIndex2 }) === null, "ルナースラッシュを使用")
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "アタック")
    assert(declareBlock(s2, "p2", blocker2.instanceId) === null, "ブロック宣言")
    refreshLevelAsOverrides(s2)
    assert(
        blocker2.effectsDisabledContinuous !== true,
        `対照実験：【${excluded}】持ちの${immune.name}は無効化されない`,
    )
}

console.log("=== BS07 黄：バトル中はマジックが無償になり、効果がもう1度発揮される（大天使イスフィール） ===")
{
    const isfil = findByEffect((e) => e["kind"] === "magicRepeatGrant")
    const repeatEntry = kindOf(isfil, "magicRepeatGrant")
    const level = (repeatEntry["levels"] as number[])[0]!
    const cores = isfil.levels?.[level - 1]?.cores ?? 1
    // 検証しやすい単純なマジック：フラッシュでBP+する1エントリのもの
    const buffMagic = CARDS.find(
        (c) =>
            c.type === "magic" &&
            (c.effects ?? []).length === 1 &&
            (c.effects ?? []).some(
                (e) =>
                    e["kind"] === "magic" &&
                    e["timing"] === "flash" &&
                    (e["action"] as Record<string, unknown> | undefined)?.["type"] === "bpBuff" &&
                    (e["action"] as Record<string, unknown>)["filter"] === undefined,
            ) &&
            (c.cost ?? 0) > 0,
    )
    if (!buffMagic) throw new Error("検証用のフラッシュBP+マジックが見つかりません")
    const buffAmount = Number(
        ((buffMagic.effects ?? [])[0]!["action"] as Record<string, unknown>)["amount"],
    )

    const s = base("isfil-repeat")
    const isfilInst = put(s, "p1", isfil.cardId, cores)
    put(s, "p2", FILLER.cardId, 1)
    s.players.p1.hand.push(buffMagic.cardId)
    const handIndex = s.players.p1.hand.length - 1
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: isfilInst.instanceId }) === null, "イスフィール自身がアタック（＝バトル当事者）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパスして優先権が攻撃側へ")
    const bpBefore = effectiveBp(s, "p1", isfilInst)
    assert(act(s, "p1", { type: "castMagic", handIndex }) === null, `${buffMagic.name}を使用`)
    assert(s.players.p1.reserve === reserveBefore, `バトル中なのでコスト（${buffMagic.cost}）を払っていない`)
    assert(
        effectiveBp(s, "p1", isfilInst) === bpBefore + buffAmount * 2,
        `効果が2回発揮される（+${buffAmount}×2。${bpBefore}→${effectiveBp(s, "p1", isfilInst)}）`,
    )
}
{
    // 対照実験：バトルに参加していなければ無償化も反復も起きない
    const isfil = findByEffect((e) => e["kind"] === "magicRepeatGrant")
    const level = (kindOf(isfil, "magicRepeatGrant")["levels"] as number[])[0]!
    const cores = isfil.levels?.[level - 1]?.cores ?? 1
    const buffMagic = CARDS.find(
        (c) =>
            c.type === "magic" &&
            (c.effects ?? []).length === 1 &&
            (c.effects ?? []).some(
                (e) =>
                    e["kind"] === "magic" &&
                    e["timing"] === "flash" &&
                    (e["action"] as Record<string, unknown> | undefined)?.["type"] === "bpBuff" &&
                    (e["action"] as Record<string, unknown>)["filter"] === undefined,
            ) &&
            (c.cost ?? 0) > 0,
    )!
    const buffAmount = Number(((buffMagic.effects ?? [])[0]!["action"] as Record<string, unknown>)["amount"])

    const s = base("isfil-not-in-battle")
    put(s, "p1", isfil.cardId, cores) // バトルには出さない
    const attacker = put(s, "p1", FILLER.cardId, 1)
    put(s, "p2", FILLER.cardId, 1)
    s.players.p1.hand.push(buffMagic.cardId)
    const handIndex = s.players.p1.hand.length - 1
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "別のスピリットでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパスして優先権が攻撃側へ")
    const bpBefore = effectiveBp(s, "p1", attacker)
    assert(act(s, "p1", { type: "castMagic", handIndex }) === null, "マジックを使用")
    assert(s.players.p1.reserve < reserveBefore, "対照実験：無償化されずコストを払う")
    assert(
        effectiveBp(s, "p1", attacker) === bpBefore + buffAmount,
        "対照実験：効果は1回だけ発揮される",
    )
}

console.log("=== BS07大天使イスフィール：無償化と再発揮は1バトルにつき1枚まで（magicFreeGrant/magicRepeatGrant の oncePerBattle） ===")
{
    // 2026-08-10 修正: 効果文は「自分のマジックカード**1枚**を」なのに、以前は
    // バトル中に使うマジックすべてが無償かつ2回発揮になっていた
    const isfil = findByEffect((e) => e["kind"] === "magicRepeatGrant")
    const repeatEntry = kindOf(isfil, "magicRepeatGrant")
    assert(repeatEntry["oncePerBattle"] === true, "再発揮エントリに oncePerBattle が指定されている")
    assert(kindOf(isfil, "magicFreeGrant")["oncePerBattle"] === true, "無償化エントリにも oncePerBattle が指定されている")
    const level = (repeatEntry["levels"] as number[])[0]!
    const cores = isfil.levels?.[level - 1]?.cores ?? 1
    const buffMagic = CARDS.find(
        (c) =>
            c.type === "magic" &&
            (c.effects ?? []).length === 1 &&
            (c.effects ?? []).some(
                (e) =>
                    e["kind"] === "magic" &&
                    e["timing"] === "flash" &&
                    (e["action"] as Record<string, unknown> | undefined)?.["type"] === "bpBuff" &&
                    (e["action"] as Record<string, unknown>)["filter"] === undefined,
            ) &&
            (c.cost ?? 0) > 0,
    )!
    const buffAmount = Number(((buffMagic.effects ?? [])[0]!["action"] as Record<string, unknown>)["amount"])

    const s = base("isfil-once-per-battle")
    const isfilInst = put(s, "p1", isfil.cardId, cores)
    put(s, "p2", FILLER.cardId, 1)
    s.players.p1.hand.push(buffMagic.cardId, buffMagic.cardId) // 同じマジックを2枚使う
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: isfilInst.instanceId }) === null, "イスフィール自身がアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパスして優先権が攻撃側へ")

    // 1枚目：無償かつ効果が2回
    const reserve1 = s.players.p1.reserve
    const bp1 = effectiveBp(s, "p1", isfilInst)
    assert(act(s, "p1", { type: "castMagic", handIndex: s.players.p1.hand.length - 1 }) === null, "1枚目を使用")
    assert(s.players.p1.reserve === reserve1, "1枚目はコストを払わない")
    assert(effectiveBp(s, "p1", isfilInst) === bp1 + buffAmount * 2, "1枚目は効果が2回発揮される")

    // 2枚目：同じバトルなので通常どおりコストを払い、効果は1回だけ
    // （マジックを使うたび優先権は相手へ渡るので、もう一度パスしてもらう）
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が再度パスして優先権が戻る")
    const reserve2 = s.players.p1.reserve
    const bp2 = effectiveBp(s, "p1", isfilInst)
    assert(act(s, "p1", { type: "castMagic", handIndex: s.players.p1.hand.length - 1 }) === null, "2枚目を使用")
    assert(s.players.p1.reserve < reserve2, "2枚目はコストを払う（無償化は1枚で使い切っている）")
    assert(effectiveBp(s, "p1", isfilInst) === bp2 + buffAmount, "2枚目の効果は1回だけ")

    // 消費の記録はバトル状態に載る＝バトルが終われば破棄され、次のバトルでまた1枚使える
    assert(
        s.battle?.oncePerBattleMagicFreeUsed?.includes(isfilInst.instanceId) === true,
        "消費はBattleStateに記録される（バトル終了時に破棄されるので次のバトルでは復活する）",
    )
    assert(
        s.battle?.oncePerBattleMagicRepeatUsed?.includes(isfilInst.instanceId) === true,
        "再発揮側の消費も同様に記録される",
    )
}
