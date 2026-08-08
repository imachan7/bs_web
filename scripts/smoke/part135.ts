// smoke パート135（キーワード【装甲】【転召】【粉砕】【呪撃】【光芒】【暴風】をプール全体で1枚ずつ通す）
//
// パート134（神速／覚醒／激突）の続き。実行時カバレッジで一度も発火していなかった残りの
// キーワードを、同じ方針——**プールから該当キーワード持ちを全部拾って回す**——で潰す。
// 発揮レベルは keyword エントリの levels の最小値、必要コア数はカードデータから引くので、
// カードIDもコア数も直書きしない（新しい弾で増えても自動的に検証対象に入る）。
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { Color } from "../../server/src/type"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    colors?: string[]
    symbol?: string[]
    flash?: boolean
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}

const CARDS = loadAllCards() as unknown as CardRow[]

function minActiveLevel(entry: Record<string, unknown>): number {
    const levels = entry["levels"]
    if (!Array.isArray(levels) || levels.length === 0) return 1
    return Math.min(...levels.map((v) => Number(v)))
}

function coresForLevel(card: CardRow, level: number): number {
    return card.levels?.[level - 1]?.cores ?? 1
}

// キーワードを持つスピリットを、エントリ単位で拾う
// （BS02-045 装甲機竜ファーブニルのようにレベル帯ごとに別エントリを持つカードがあるため）
function withKeyword(keyword: string): { card: CardRow; entry: Record<string, unknown>; level: number }[] {
    const out: { card: CardRow; entry: Record<string, unknown>; level: number }[] = []
    for (const c of CARDS) {
        if (c.type !== "spirit") continue
        for (const e of c.effects ?? []) {
            if (e["kind"] !== "keyword" || e["keyword"] !== keyword) continue
            out.push({ card: c, entry: e, level: minActiveLevel(e) })
        }
    }
    return out
}

function pickVanilla(pred: (c: CardRow) => boolean): CardRow {
    const found = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0 && pred(c))
    if (!found) throw new Error("条件に合うバニラが見つかりません")
    return found
}

// 詰め物（Lv1でコア1）／壁役（Lv1でBP5000。アタック時除去に巻き込まれにくい）／
// 転召の生け贄（コスト6以上。転召の minCost は最大6）
const FILLER = pickVanilla((c) => (c.levels?.[0]?.cores ?? 99) === 1)
const WALL = pickVanilla((c) => (c.levels?.[0]?.cores ?? 99) === 1 && (c.levels?.[0]?.bp ?? 0) >= 5000)
const SACRIFICE = pickVanilla((c) => (c.levels?.[0]?.cores ?? 99) === 1 && (c.cost ?? 0) >= 6)
// 【光芒】用：バトル中に使えるいちばん軽いフラッシュマジック（対象を1体取る BP+N のもの）
const FLASH_MAGIC = ((): CardRow => {
    const candidates = CARDS.filter(
        (c) =>
            c.flash === true &&
            (c.effects ?? []).some(
                (e) =>
                    e["kind"] === "magic" &&
                    e["timing"] === "flash" &&
                    (e["action"] as Record<string, unknown> | undefined)?.["type"] === "bpBuff" &&
                    (e["action"] as Record<string, unknown> | undefined)?.["filter"] === undefined,
            ),
    )
    const cheapest = candidates.sort((a, b) => (a.cost ?? 99) - (b.cost ?? 99))[0]
    if (!cheapest) throw new Error("フラッシュで使えるBP+Nマジックが見つかりません")
    return cheapest
})()

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    // コスト最大9＋レベル上げのコアを軽減なしで払えるだけ積む
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== キーワード【装甲】【転召】【粉砕】【呪撃】【光芒】【暴風】をプール全体で通す ===")
{
    assert(
        new Set([FILLER.cardId, WALL.cardId, SACRIFICE.cardId]).size === 3,
        `詰め物（${FILLER.name}）／壁役（${WALL.name}）／生け贄（${SACRIFICE.name}）をデータから選べる`,
    )
    assert(FLASH_MAGIC.cost !== undefined, `【光芒】用のフラッシュマジック（${FLASH_MAGIC.name}）を選べる`)
}

// ---- 【装甲】：指定色を発生源とする相手の効果を受けない ----
{
    const targets = withKeyword("armor")
    let ok = 0
    for (const { card, entry, level } of targets) {
        const s = base(`armor-${card.cardId}-lv${level}`)
        const armored = put(s, "p1", card.cardId, coresForLevel(card, level))
        // 【装甲：∞】（colorsFrom）は「相手フィールドのシンボル色」を装甲色にするため、
        // 相手の場に壁役を置き、その色を発生源の色として使う
        const wall = put(s, "p2", WALL.cardId, 1)
        const colors = entry["colors"] as Color[] | undefined
        const armorColor: Color | undefined =
            entry["colorsFrom"] === "opponentFieldSymbols" ? (WALL.symbol?.[0] as Color | undefined) : colors?.[0]
        if (armorColor === undefined) {
            assert(false, `${card.cardId} ${card.name}：装甲色を決められない`)
            continue
        }
        // armorColorsGranted は継続効果の都度再構築で入るので、判定前に必ず走らせる
        refreshLevelAsOverrides(s)
        resolveAction(s, "p2", wall, { type: "destroy", count: 1 }, undefined, [armorColor])
        if (!s.players.p1.field.spirits.some((x) => x.instanceId === armored.instanceId)) {
            assert(false, `${card.cardId} ${card.name}：Lv${level}の【装甲：${armorColor}】で破壊されない`)
            continue
        }
        ok++
    }
    // 対照実験：装甲を持たないスピリットは同じ効果で破壊される（判定が常に真になっていないことの確認）
    {
        const s = base("armor-baseline")
        const victim = put(s, "p1", FILLER.cardId, 1)
        const wall = put(s, "p2", WALL.cardId, 1)
        resolveAction(s, "p2", wall, { type: "destroy", count: 1 }, undefined, ["red"])
        assert(
            !s.players.p1.field.spirits.some((x) => x.instanceId === victim.instanceId),
            "対照実験：装甲がなければ相手の効果で破壊される",
        )
    }
    assert(targets.length >= 16, `【装甲】のエントリを列挙できる（${targets.length}件）`)
    assert(ok === targets.length, `【装甲】全${targets.length}件が該当色の効果を防ぐ（成功${ok}件）`)
}

// ---- 【転召】：召喚時、コストminCost以上の自分の他スピリットのコアをすべて置く ----
{
    const targets = withKeyword("tensho")
    let ok = 0
    for (const { card, level } of targets) {
        const s = base(`tensho-${card.cardId}`)
        // 生け贄は1体だけにする（2体以上あると選択待ちになりうる）
        const sacrifice = put(s, "p1", SACRIFICE.cardId, 2)
        s.players.p1.hand = [card.cardId]
        const error = act(s, "p1", { type: "summon", handIndex: 0, level })
        if (error !== null) {
            assert(false, `${card.cardId} ${card.name}：Lv${level}で召喚できる（${error}）`)
            continue
        }
        // コアをすべて置かれた生け贄は維持コア割れで場から消える
        if (s.players.p1.field.spirits.some((x) => x.instanceId === sacrifice.instanceId)) {
            assert(false, `${card.cardId} ${card.name}：【転召】で生け贄のコアが置かれる`)
            continue
        }
        ok++
    }
    assert(targets.length >= 12, `【転召】持ちを列挙できる（${targets.length}枚）`)
    assert(ok === targets.length, `【転召】持ち全${targets.length}枚が召喚時に発揮する（成功${ok}枚）`)
}

// ---- 【粉砕】：アタック時、相手のデッキを（現在レベル）枚破棄する ----
{
    const targets = withKeyword("funsai")
    let ok = 0
    for (const { card, level } of targets) {
        const s = base(`funsai-${card.cardId}`)
        const attacker = put(s, "p1", card.cardId, coresForLevel(card, level))
        put(s, "p2", WALL.cardId, 1)
        const before = s.players.p2.deck.length
        if (act(s, "p1", { type: "nextPhase" }) !== null || act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) !== null) {
            assert(false, `${card.cardId} ${card.name}：アタックできる`)
            continue
        }
        // 同じカードのアタック時効果が別途デッキを削ることがあるので「レベル枚以上」で見る
        const discarded = before - s.players.p2.deck.length
        if (discarded < level) {
            assert(false, `${card.cardId} ${card.name}：Lv${level}の【粉砕】で${level}枚以上破棄（実際${discarded}枚）`)
            continue
        }
        ok++
    }
    assert(targets.length >= 9, `【粉砕】持ちを列挙できる（${targets.length}枚）`)
    assert(ok === targets.length, `【粉砕】持ち全${targets.length}枚がアタック時にデッキを破棄する（成功${ok}枚）`)
}

// ---- 【呪撃】：バトル終了時、ブロックした相手スピリットを破壊する ----
{
    const targets = withKeyword("jugeki")
    let ok = 0
    for (const { card, level } of targets) {
        const s = base(`jugeki-${card.cardId}`)
        const attacker = put(s, "p1", card.cardId, coresForLevel(card, level))
        const blocker = put(s, "p2", WALL.cardId, 1)
        // 壁役のBPが上回っていてはじめて「BP比較ではなく呪撃で破壊された」と言える
        if (effectiveBp(s, "p2", blocker) <= effectiveBp(s, "p1", attacker)) {
            assert(false, `${card.cardId} ${card.name}：壁役のBPがアタッカーを上回る（対照条件）`)
            continue
        }
        if (act(s, "p1", { type: "nextPhase" }) !== null || act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) !== null) {
            assert(false, `${card.cardId} ${card.name}：アタックできる`)
            continue
        }
        if (
            act(s, "p2", { type: "pass" }) !== null ||
            act(s, "p1", { type: "pass" }) !== null ||
            act(s, "p2", { type: "block", instanceId: blocker.instanceId }) !== null ||
            act(s, "p2", { type: "pass" }) !== null ||
            act(s, "p1", { type: "pass" }) !== null
        ) {
            assert(false, `${card.cardId} ${card.name}：ブロックしてバトルを解決できる`)
            continue
        }
        if (s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId)) {
            assert(false, `${card.cardId} ${card.name}：Lv${level}の【呪撃】でブロッカーが破壊される`)
            continue
        }
        ok++
    }
    assert(targets.length >= 10, `【呪撃】持ちを列挙できる（${targets.length}枚）`)
    assert(ok === targets.length, `【呪撃】持ち全${targets.length}枚がブロッカーを破壊する（成功${ok}枚）`)
}

// ---- 【光芒】：バトル終了時、そのバトル中に使った自分のマジックをトラッシュから手札へ戻す ----
{
    const targets = withKeyword("kobo")
    let ok = 0
    for (const { card, level } of targets) {
        const s = base(`kobo-${card.cardId}`)
        const attacker = put(s, "p1", card.cardId, coresForLevel(card, level))
        put(s, "p2", WALL.cardId, 1)
        if (act(s, "p1", { type: "nextPhase" }) !== null || act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) !== null) {
            assert(false, `${card.cardId} ${card.name}：アタックできる`)
            continue
        }
        // 防御側パスで攻撃側に優先権 → バトル中にフラッシュマジックを使う（使ったカードはトラッシュへ）
        s.players.p1.hand = [FLASH_MAGIC.cardId]
        if (
            act(s, "p2", { type: "pass" }) !== null ||
            act(s, "p1", {
                type: "castMagic",
                handIndex: 0,
                targetInstanceId: attacker.instanceId,
            }) !== null
        ) {
            assert(false, `${card.cardId} ${card.name}：バトル中にフラッシュマジックを使える`)
            continue
        }
        if (!s.players.p1.trashCards.includes(FLASH_MAGIC.cardId)) {
            assert(false, `${card.cardId} ${card.name}：使ったマジックがいったんトラッシュへ行く`)
            continue
        }
        // 両者パスでフラッシュ①を閉じ、ライフ受けでバトルを終わらせる
        if (
            act(s, "p2", { type: "pass" }) !== null ||
            act(s, "p1", { type: "pass" }) !== null ||
            act(s, "p2", { type: "takeLife" }) !== null
        ) {
            assert(false, `${card.cardId} ${card.name}：ライフ受けでバトルを終えられる`)
            continue
        }
        if (!s.players.p1.hand.includes(FLASH_MAGIC.cardId)) {
            assert(false, `${card.cardId} ${card.name}：Lv${level}の【光芒】で使ったマジックが手札へ戻る`)
            continue
        }
        ok++
    }
    assert(targets.length >= 9, `【光芒】持ちを列挙できる（${targets.length}枚）`)
    assert(ok === targets.length, `【光芒】持ち全${targets.length}枚がマジックを回収する（成功${ok}枚）`)
}

// ---- 【暴風】：ブロックされたとき、相手は相手自身のスピリットを指定数だけ疲労させる ----
{
    const targets = withKeyword("bofu")
    let ok = 0
    for (const { card, entry, level } of targets) {
        const count = Number(entry["count"] ?? 1)
        const s = base(`bofu-${card.cardId}`)
        const attacker = put(s, "p1", card.cardId, coresForLevel(card, level))
        // ブロッカーに加えて、疲労させられる余地を指定数ぶん用意する
        const blocker = put(s, "p2", WALL.cardId, 1)
        for (let i = 0; i < count; i++) put(s, "p2", FILLER.cardId, 1)
        if (act(s, "p1", { type: "nextPhase" }) !== null || act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) !== null) {
            assert(false, `${card.cardId} ${card.name}：アタックできる`)
            continue
        }
        const restedBefore = s.players.p2.field.spirits.filter((x) => x.isRested).length
        if (
            act(s, "p2", { type: "pass" }) !== null ||
            act(s, "p1", { type: "pass" }) !== null ||
            act(s, "p2", { type: "block", instanceId: blocker.instanceId }) !== null
        ) {
            assert(false, `${card.cardId} ${card.name}：ブロックを宣言できる`)
            continue
        }
        const restedAfter = s.players.p2.field.spirits.filter((x) => x.isRested).length
        if (restedAfter - restedBefore < count) {
            assert(
                false,
                `${card.cardId} ${card.name}：Lv${level}の【暴風：${count}】で相手が${count}体疲労する（実際${restedAfter - restedBefore}体）`,
            )
            continue
        }
        ok++
    }
    assert(targets.length >= 4, `【暴風】持ちを列挙できる（${targets.length}枚）`)
    assert(ok === targets.length, `【暴風】持ち全${targets.length}枚がブロック時に相手を疲労させる（成功${ok}枚）`)

    // 【暴風】の keyword エントリ（指定数）そのものを読むのは颶風高原だけ——
    // ブロック時の疲労は対になる triggered エントリの担当なので、指定数の読み出しは別に確かめる。
    // ネクサスもIDを直書きせず、voidCoreToSelfPerBofuCount を持つカードとしてデータから引く
    const bofuNexus = CARDS.find((c) =>
        (c.effects ?? []).some(
            (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "voidCoreToSelfPerBofuCount",
        ),
    )
    assert(bofuNexus !== undefined, "【暴風】の指定数を読むネクサス（颶風高原）をデータから引ける")
    let okCount = 0
    for (const { card, entry, level } of targets) {
        if (!bofuNexus) break
        const count = Number(entry["count"] ?? 1)
        const s = base(`bofu-count-${card.cardId}`)
        const nexus = createInstance(bofuNexus.cardId, s.turn, 0)
        s.players.p1.field.nexuses.push(nexus)
        s.players.p1.hand = [card.cardId]
        if (act(s, "p1", { type: "summon", handIndex: 0, level }) !== null) {
            assert(false, `${card.cardId} ${card.name}：Lv${level}で召喚できる`)
            continue
        }
        const summoned = s.players.p1.field.spirits.find((x) => x.cardId === card.cardId)
        const expected = coresForLevel(card, level) + count
        if (summoned?.cores !== expected) {
            assert(
                false,
                `${card.cardId} ${card.name}：颶風高原で【暴風：${count}】ぶんコアが乗る（期待${expected}／実際${String(summoned?.cores)}）`,
            )
            continue
        }
        okCount++
    }
    assert(
        okCount === targets.length,
        `【暴風】全${targets.length}枚の指定数が颶風高原に読まれる（成功${okCount}枚）`,
    )
}
