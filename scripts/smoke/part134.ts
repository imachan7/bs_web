// smoke パート134（キーワード【神速】【覚醒】【激突】をカードプール全体で1枚ずつ通す）
//
// 実行時カバレッジ（npm run coverage:effects）で、これらのキーワードを持つカードのうち
// 13枚のエントリが一度も発火していなかった（2026-08-08）。キーワードの機構そのものは
// 他のカードで検証済みなので、ここで潰したいのは**そのカード固有の取りこぼし**——
// levels の指定ミスや、他の効果と噛み合って一度も成立しない組み合わせ——のほう。
//
// そのため個別にシナリオを書かず、**プールから該当キーワードを持つカードを全部拾って回す**。
// 新しい弾で増えても自動的に検証対象に入る（カードIDを直書きしない）。
// 発揮レベルは keyword エントリの levels の最小値を使い、必要なコア数はカードデータから引く。
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    symbol?: unknown[]
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}

const CARDS = loadAllCards() as unknown as CardRow[]

// キーワードのエントリが最も低い何レベルで有効か（levels 未指定＝全レベル）
function minActiveLevel(entry: Record<string, unknown>): number {
    const levels = entry["levels"]
    if (!Array.isArray(levels) || levels.length === 0) return 1
    return Math.min(...levels.map((v) => Number(v)))
}

// そのレベルに乗せるのに必要なコア数（データから引く。BPやコア数の直書きをしない）
function coresForLevel(card: CardRow, level: number): number {
    return card.levels?.[level - 1]?.cores ?? 1
}

function withKeyword(keyword: string): { card: CardRow; level: number }[] {
    const out: { card: CardRow; level: number }[] = []
    for (const c of CARDS) {
        if (c.type !== "spirit") continue
        for (const e of c.effects ?? []) {
            if (e["kind"] !== "keyword" || e["keyword"] !== keyword) continue
            out.push({ card: c, level: minActiveLevel(e) })
        }
    }
    return out
}

// 盤面に干渉しないバニラ（効果の記述なし）スピリットをデータから選ぶ
function pickVanilla(minBp: number): CardRow {
    const found = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).length === 0 &&
            (c.levels?.[0]?.cores ?? 99) === 1 &&
            (c.levels?.[0]?.bp ?? 0) >= minBp,
    )
    if (!found) throw new Error(`Lv1でBP${String(minBp)}以上のバニラが見つかりません`)
    return found
}

// アタック役／コアの移動元に使う軽いバニラと、BP比較や除去に巻き込まれにくい壁役
const FILLER = pickVanilla(0)
// 巨竜ギガノトンのアタック時効果（BP4000以下を1体破壊）に巻き込まれない壁が要る
const WALL = pickVanilla(5000)

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    // コスト最大10＋レベル上げのコアを軽減なしで払えるだけ積む
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== キーワード【神速】【覚醒】【激突】をプール全体で通す ===")
{
    assert(FILLER.cardId !== WALL.cardId, `詰め物（${FILLER.name}）と壁役（${WALL.name}）をデータから選べる`)
}

// ---- 【神速】：フラッシュタイミング中に手札から召喚できる ----
{
    const targets = withKeyword("soku")
    let ok = 0
    for (const { card, level } of targets) {
        const s = base(`soku-${card.cardId}`)
        const opener = put(s, "p1", FILLER.cardId, 1)
        if (
            act(s, "p1", { type: "nextPhase" }) !== null ||
            act(s, "p1", { type: "attack", instanceId: opener.instanceId }) !== null ||
            // 防御側パスでフラッシュ①の優先権が攻撃側へ移る
            act(s, "p2", { type: "pass" }) !== null
        ) {
            assert(false, `${card.cardId} ${card.name}：フラッシュタイミングまで進められる`)
            continue
        }
        s.players.p1.hand = [card.cardId]
        const before = s.players.p1.field.spirits.length
        const error = act(s, "p1", { type: "summon", handIndex: 0, level })
        if (error !== null) {
            assert(false, `${card.cardId} ${card.name}：Lv${level}で神速召喚できる（${error}）`)
            continue
        }
        if (s.players.p1.field.spirits.length !== before + 1) {
            assert(false, `${card.cardId} ${card.name}：召喚したスピリットが場に出る`)
            continue
        }
        ok++
    }
    assert(targets.length >= 12, `【神速】持ちを列挙できる（${targets.length}枚）`)
    assert(ok === targets.length, `【神速】持ち全${targets.length}枚がフラッシュ中に召喚できる（成功${ok}枚）`)
}

// ---- 【覚醒】：フラッシュタイミング中に自分のスピリットからコアを移せる ----
{
    const targets = withKeyword("awaken")
    let ok = 0
    for (const { card, level } of targets) {
        const s = base(`awaken-${card.cardId}`)
        const opener = put(s, "p1", FILLER.cardId, 1)
        const awakener = put(s, "p1", card.cardId, coresForLevel(card, level))
        // 移動元は維持コア1のバニラに3個積む（1個抜いても維持コア割れで消えない）
        const source = put(s, "p1", FILLER.cardId, 3)
        if (
            act(s, "p1", { type: "nextPhase" }) !== null ||
            act(s, "p1", { type: "attack", instanceId: opener.instanceId }) !== null ||
            act(s, "p2", { type: "pass" }) !== null
        ) {
            assert(false, `${card.cardId} ${card.name}：フラッシュタイミングまで進められる`)
            continue
        }
        const before = awakener.cores
        const error = act(s, "p1", {
            type: "awaken",
            instanceId: awakener.instanceId,
            fromInstanceId: source.instanceId,
            count: 1,
        })
        if (error !== null) {
            assert(false, `${card.cardId} ${card.name}：Lv${level}で覚醒できる（${error}）`)
            continue
        }
        if (awakener.cores !== before + 1 || source.cores !== 2) {
            assert(
                false,
                `${card.cardId} ${card.name}：コアが1個移る（覚醒先${before}→${awakener.cores} / 移動元${source.cores}）`,
            )
            continue
        }
        ok++
    }
    assert(targets.length >= 10, `【覚醒】持ちを列挙できる（${targets.length}枚）`)
    assert(ok === targets.length, `【覚醒】持ち全${targets.length}枚がフラッシュ中に覚醒できる（成功${ok}枚）`)
}

// ---- 【激突】：ブロックできる相手はライフで受けられない ----
// takeLife が拒否されること自体は他の理由でも起きうるので、
// **同じ手順で激突を持たないアタッカーならライフ受けが通る**ことを対照実験として先に確かめる
function clashScenario(s: GameState, attackerInstanceId: string): string | null {
    if (act(s, "p1", { type: "nextPhase" }) !== null) return "アタックステップへ移行できない"
    if (act(s, "p1", { type: "attack", instanceId: attackerInstanceId }) !== null) return "アタックできない"
    // 両者パスでフラッシュ①を閉じる（ライフ受けはフラッシュ①終了後にのみ宣言できる）
    if (act(s, "p2", { type: "pass" }) !== null) return "防御側パスができない"
    if (act(s, "p1", { type: "pass" }) !== null) return "攻撃側パスができない"
    return null
}
{
    // 対照実験：激突なしなら同じ盤面でライフ受けが通る
    const s = base("clash-baseline")
    const attacker = put(s, "p1", FILLER.cardId, 1)
    put(s, "p2", WALL.cardId, 1)
    assert(clashScenario(s, attacker.instanceId) === null, "対照実験：フラッシュ①終了まで進む")
    assert(act(s, "p2", { type: "takeLife" }) === null, "対照実験：激突がなければライフで受けられる")

    const targets = withKeyword("clash")
    let ok = 0
    for (const { card, level } of targets) {
        const s2 = base(`clash-${card.cardId}`)
        const clasher = put(s2, "p1", card.cardId, coresForLevel(card, level))
        // ブロックできる相手が居てはじめて激突が効く（壁役はBP5000でアタック時除去に巻き込まれない）
        put(s2, "p2", WALL.cardId, 1)
        const setupError = clashScenario(s2, clasher.instanceId)
        if (setupError !== null) {
            assert(false, `${card.cardId} ${card.name}：${setupError}`)
            continue
        }
        if (act(s2, "p2", { type: "takeLife" }) === null) {
            assert(false, `${card.cardId} ${card.name}：Lv${level}の【激突】でライフ受けが拒否される`)
            continue
        }
        ok++
    }
    assert(targets.length >= 4, `【激突】持ちを列挙できる（${targets.length}枚）`)
    assert(ok === targets.length, `【激突】持ち全${targets.length}枚がライフ受けを拒否する（成功${ok}枚）`)
}
