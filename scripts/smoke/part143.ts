// smoke パート143（第七弾：実行時カバレッジで「一度も発火していなかった」経路を塞ぐ）
//
// npm run coverage:effects が、BS07 の取り込み後に「データには書いたが実行実績0」の
// エントリを挙げた。ここはそれらを実カード経由で1回ずつ通すためのパート:
//   BS07-018 fireOwnDestroyTriggers（召喚経由）／虚神・神将の levelAs（Lv3）／
//   BS07-074 ニードルショットの battleWon（貸与）／BS07-058 ドローステップの回収／
//   BS07-026・BS07-043 のオーラ
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    declareBlock,
    effectiveBp,
    fireStepTriggers,
    refreshLevelAsOverrides,
    runTurnStart,
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
function findByEffect(pred: (e: Record<string, unknown>, c: CardRow) => boolean): CardRow {
    const found = CARDS.find((c) => (c.effects ?? []).some((e) => pred(e, c)))
    if (!found) throw new Error("条件に合うカードが見つかりません")
    return found
}
function entryOf(c: CardRow, pred: (e: Record<string, unknown>) => boolean): Record<string, unknown> {
    const found = (c.effects ?? []).find(pred)
    if (!found) throw new Error(`${c.name} に該当エントリがありません`)
    return found
}
function coresFor(c: CardRow, level: number): number {
    return c.levels?.[level - 1]?.cores ?? 1
}
function maxLevelOf(c: CardRow): number {
    return (c.levels ?? []).reduce((m, lv) => Math.max(m, lv.level ?? 0), 0)
}

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 40
    s.players.p2.reserve = 40
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function resolveBattle(s: GameState): void {
    let guard = 0
    while (s.battle && guard++ < 10) {
        if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
    }
}

const FILLER = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.cores ?? 99) === 1,
)!

console.log("=== BS07：召喚時に自分全体の『破壊時』効果を発揮させる（実カードの召喚経由） ===")
{
    const pope = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "fireOwnDestroyTriggers",
    )
    const helperCard = findByEffect(
        (e, c) =>
            c.type === "spirit" &&
            e["kind"] === "triggered" &&
            e["trigger"] === "onDestroy" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "coreRemove",
    )
    const helperEntry = entryOf(helperCard, (e) => e["kind"] === "triggered" && e["trigger"] === "onDestroy")
    const helperLevel = ((helperEntry["levels"] as number[] | null) ?? [1])[0]!

    const s = base("pope-summon")
    const helper = put(s, "p1", helperCard.cardId, coresFor(helperCard, helperLevel))
    const enemy = put(s, "p2", FILLER.cardId, 3)
    s.players.p1.hand = [pope.cardId]
    const coresBefore = enemy.cores
    assert(
        act(s, "p1", { type: "summon", handIndex: 0 }) === null,
        `${pope.name}を手札から召喚する`,
    )
    assert(enemy.cores === coresBefore - 1, `召喚時に${helperCard.name}の『破壊時』効果が発揮される`)
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === helper.instanceId),
        `${helperCard.name}は破壊されず残る`,
    )
}

console.log("=== BS07：Lv3で「虚神」/「神将」を最高Lvとして扱う（levelAs） ===")
{
    // levelAs（ownSpiritsByFamily／treatAs:"max"）を sourceLevels:[3] で持つカード
    const isTarget = (e: Record<string, unknown>): boolean =>
        e["kind"] === "levelAs" &&
        e["target"] === "ownSpiritsByFamily" &&
        Array.isArray(e["sourceLevels"]) &&
        e["treatAs"] === "max"
    const source = findByEffect(isTarget)
    const entry = entryOf(source, isTarget)
    const families = entry["familyFilter"] as string[]
    const sourceLevel = (entry["sourceLevels"] as number[])[0]!
    // 対象：該当系統を持ち、Lv2以上を持つ別カード（Lv1で立てて最高Lv扱いになるかを見る）
    const target = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            c.cardId !== source.cardId &&
            families.some((f) => (c.family ?? []).includes(f)) &&
            maxLevelOf(c) >= 2,
    )!

    const s = base("levelas-max")
    const inst = put(s, "p1", target.cardId, 1)
    assert(currentLevel(inst).level === 1, `${target.name}はコア1個ならLv1`)
    put(s, "p1", source.cardId, coresFor(source, sourceLevel))
    refreshLevelAsOverrides(s)
    assert(
        currentLevel(inst).level === maxLevelOf(target),
        `${source.name}のLv${sourceLevel}で${target.name}が最高Lv${maxLevelOf(target)}として扱われる（実際Lv${currentLevel(inst).level}）`,
    )

    // 対照実験：発生源のレベルが足りなければ扱いは変わらない
    const s2 = base("levelas-low")
    const inst2 = put(s2, "p1", target.cardId, 1)
    put(s2, "p1", source.cardId, coresFor(source, 1))
    refreshLevelAsOverrides(s2)
    assert(currentLevel(inst2).level === 1, "対照実験：発生源がLv1なら最高Lv扱いにならない")
}

console.log("=== BS07：ニードルショットが貸した battleWon（剣獣が勝ったら相手を疲労させる） ===")
{
    // 貸与された battleWon のうち winnerFamilyFilter を持つもの（＝ニードルショット）に絞る
    // （lentOnly だけだと BS04ニーベルングリング等も該当してしまう）
    const isNeedle = (e: Record<string, unknown>): boolean =>
        e["kind"] === "battleWon" && e["lentOnly"] === true && e["winnerFamilyFilter"] !== undefined
    const needle = findByEffect(isNeedle)
    const grant = entryOf(needle, isNeedle)
    const family = String(grant["winnerFamilyFilter"])
    const winner = CARDS.find(
        (c) => c.type === "spirit" && (c.family ?? []).includes(family) && (c.levels?.[0]?.cores ?? 99) === 1,
    )!

    const s = base("needle-shot")
    const attacker = put(s, "p1", winner.cardId, 1)
    const blocker = put(s, "p2", FILLER.cardId, 1)
    const spare = put(s, "p2", FILLER.cardId, 1)
    // アタッカーが確実にBP比較で勝つようにする
    attacker.tempBpBuff = 999999
    s.players.p1.hand.push(needle.cardId)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパスして優先権が攻撃側へ")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: s.players.p1.hand.length - 1 }) === null,
        `${needle.name}をフラッシュで使用`,
    )
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手がブロック")
    resolveBattle(s)
    assert(
        spare.isRested,
        `系統「${family}」が勝ったので相手のスピリットが疲労する`,
    )
}

console.log("=== BS07：ドローステップにトラッシュの「夜族」を手札に戻す（常闇の聖堂Lv2） ===")
{
    const cathedral = findByEffect(
        (e) =>
            e["kind"] === "step" &&
            e["step"] === "draw" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "recoverSpiritFromTrash",
    )
    const entry = entryOf(cathedral, (e) => e["kind"] === "step" && e["step"] === "draw")
    const family = String((entry["action"] as Record<string, unknown>)["familyFilter"])
    const level = (entry["levels"] as number[])[0]!
    const target = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes(family))!
    const outsider = CARDS.find(
        (c) => c.type === "spirit" && !(c.family ?? []).includes(family) && (c.effects ?? []).length === 0,
    )!

    const s = base("cathedral-draw")
    const nexus = createInstance(cathedral.cardId, s.turn, coresFor(cathedral, level))
    s.players.p1.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    s.players.p1.trashCards.push(outsider.cardId, target.cardId)
    s.phase = "draw"
    fireStepTriggers(s, "draw")
    assert(s.players.p1.hand.includes(target.cardId), `系統「${family}」の${target.name}が手札に戻る`)
    assert(!s.players.p1.hand.includes(outsider.cardId), `対照実験：系統が違う${outsider.name}は戻らない`)
}

console.log("=== BS07：オーラ（剣獣すべてBP+／「ペンタン」1体につきBP+） ===")
{
    // BS07-026 烈針獣マツノアラシLv2：系統「剣獣」すべてをBP+
    const matsuno = byId("BS07-026")
    const aura = entryOf(matsuno, (e) => e["kind"] === "aura")
    const amount = Number((aura["aura"] as Record<string, unknown>)["amount"])
    const family = String((aura["aura"] as Record<string, unknown>)["familyFilter"])
    const level = (aura["levels"] as number[])[0]!
    const member = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            c.cardId !== matsuno.cardId &&
            (c.family ?? []).includes(family) &&
            (c.levels?.[0]?.cores ?? 99) === 1,
    )!

    const s = base("matsuno-aura")
    const target = put(s, "p1", member.cardId, 1)
    const raw = effectiveBp(s, "p1", target)
    put(s, "p1", matsuno.cardId, coresFor(matsuno, level))
    assert(
        effectiveBp(s, "p1", target) === raw + amount,
        `系統「${family}」がBP+${amount}（${raw}→${effectiveBp(s, "p1", target)}）`,
    )
}
{
    // BS07-043 女帝ペンプレスLv3：「ペンタン」1体につき自身をBP+
    const empress = byId("BS07-043")
    const aura = entryOf(empress, (e) => e["kind"] === "aura")
    const amountPer = Number((aura["aura"] as Record<string, unknown>)["amountPer"])
    const nameIncludes = String(
        ((aura["aura"] as Record<string, unknown>)["counter"] as Record<string, unknown>)["ownNameIncludes"],
    )
    const level = (aura["levels"] as number[])[0]!
    const pentan = CARDS.find(
        (c) => c.type === "spirit" && c.name.includes(nameIncludes) && (c.levels?.[0]?.cores ?? 99) === 1,
    )!

    const s = base("empress-aura")
    const boss = put(s, "p1", empress.cardId, coresFor(empress, level))
    const alone = effectiveBp(s, "p1", boss)
    put(s, "p1", pentan.cardId, 1)
    put(s, "p1", pentan.cardId, 1)
    assert(
        effectiveBp(s, "p1", boss) === alone + amountPer * 2,
        `「${nameIncludes}」2体ぶんBP+${amountPer * 2}（${alone}→${effectiveBp(s, "p1", boss)}）`,
    )
}

console.log("=== BS07：バトル中の[カラカロッサム]と入れ替えて疲労状態で召喚する（ブラックカラカロッサム） ===")
{
    const black = findByEffect((e) => e["kind"] === "battleSwapSummon")
    const swap = entryOf(black, (e) => e["kind"] === "battleSwapSummon")
    const substituteName = String(swap["substituteName"])
    const original = CARDS.find((c) => c.type === "spirit" && c.name === substituteName)!

    // ブロッカー側で入れ替える（自分のスピリットがバトルしていれば攻守どちらでもよい）
    const s = base("black-karakarossum")
    const blocker = put(s, "p1", original.cardId, 1)
    const attacker = put(s, "p2", FILLER.cardId, 1)
    s.players.p1.hand.push(black.cardId)
    const handIndex = s.players.p1.hand.length - 1
    s.turnPlayer = "p2"
    s.phase = "main"
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2 のアタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2 がアタック")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, `${original.name}でブロック`)
    // ブロック宣言後のフラッシュは防御側（p1）から優先権を持つ
    assert(
        act(s, "p1", { type: "summon", handIndex, substituteInstanceId: blocker.instanceId }) === null,
        `${black.name}を入れ替え召喚する`,
    )
    const summoned = s.players.p1.field.spirits.find((sp) => sp.cardId === black.cardId)
    assert(summoned !== undefined, `${black.name}がフィールドに出る`)
    assert(summoned?.isRested === true, "疲労状態で召喚される")
    assert(
        s.players.p1.hand.includes(original.cardId),
        `入れ替え元の${original.name}は手札に戻る`,
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === blocker.instanceId),
        `${original.name}はフィールドから離れる`,
    )
    assert(
        s.battle?.blockerInstanceId === summoned?.instanceId,
        "バトルのブロッカー枠が新しいスピリットに引き継がれる",
    )

    // 対照実験1：バトルしていない[カラカロッサム]とは入れ替えられない
    const s2 = base("black-not-in-battle")
    const bench = put(s2, "p1", original.cardId, 1)
    const blocker2 = put(s2, "p1", FILLER.cardId, 1)
    const attacker2 = put(s2, "p2", FILLER.cardId, 1)
    s2.players.p1.hand.push(black.cardId)
    s2.turnPlayer = "p2"
    s2.phase = "main"
    assert(act(s2, "p2", { type: "nextPhase" }) === null, "p2 のアタックステップへ")
    assert(act(s2, "p2", { type: "attack", instanceId: attacker2.instanceId }) === null, "p2 がアタック")
    assert(declareBlock(s2, "p1", blocker2.instanceId) === null, "別のスピリットでブロック")
    assert(
        act(s2, "p1", {
            type: "summon",
            handIndex: s2.players.p1.hand.length - 1,
            substituteInstanceId: bench.instanceId,
        }) !== null,
        "対照実験：バトルしていない個体とは入れ替えられない",
    )

    // 対照実験2：カード名が違えば入れ替えられない（[カード名]は完全一致）
    const s3 = base("black-wrong-name")
    const wrong = put(s3, "p1", FILLER.cardId, 1)
    const attacker3 = put(s3, "p2", FILLER.cardId, 1)
    s3.players.p1.hand.push(black.cardId)
    s3.turnPlayer = "p2"
    s3.phase = "main"
    assert(act(s3, "p2", { type: "nextPhase" }) === null, "p2 のアタックステップへ")
    assert(act(s3, "p2", { type: "attack", instanceId: attacker3.instanceId }) === null, "p2 がアタック")
    assert(declareBlock(s3, "p1", wrong.instanceId) === null, "別名のスピリットでブロック")
    assert(
        act(s3, "p1", {
            type: "summon",
            handIndex: s3.players.p1.hand.length - 1,
            substituteInstanceId: wrong.instanceId,
        }) !== null,
        `対照実験：[${substituteName}]でなければ入れ替えられない`,
    )
}

console.log("=== BS07：ライフセービングはコスト3以下をブロックしたときだけ発揮する ===")
{
    const saving = findByEffect(
        (e) =>
            ((e["granted"] as Record<string, unknown> | undefined)?.["condition"] as Record<string, unknown> | undefined)?.[
                "targetMaxCost"
            ] !== undefined,
    )
    const grant = entryOf(saving, (e) => e["kind"] === "effectGrant")
    const family = String(grant["familyFilter"])
    const maxCost = Number(
        ((grant["granted"] as Record<string, unknown>)["condition"] as Record<string, unknown>)["targetMaxCost"],
    )
    const blockerCard = CARDS.find(
        (c) => c.type === "spirit" && (c.family ?? []).includes(family) && (c.levels?.[0]?.cores ?? 99) === 1,
    )!
    const pricey = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).length === 0 &&
            (c.cost ?? 0) > maxCost &&
            (c.levels?.[0]?.cores ?? 99) === 1,
    )!

    const s = base("saving-cost-limit")
    const blocker = put(s, "p1", blockerCard.cardId, 3)
    const attacker = put(s, "p2", pricey.cardId, 1)
    s.players.p1.hand.push(saving.cardId)
    s.turnPlayer = "p2"
    s.phase = "main"
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2 のアタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2 がアタック")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: s.players.p1.hand.length - 1 }) === null,
        `${saving.name}をフラッシュで使用`,
    )
    const lifeBefore = s.players.p1.life
    const coresBefore = blocker.cores
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "ブロック")
    assert(
        s.players.p1.life === lifeBefore && blocker.cores === coresBefore,
        `対照実験：コストが${maxCost}を超える${pricey.name}をブロックしても発揮しない`,
    )
}
