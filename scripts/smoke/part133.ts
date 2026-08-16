// smoke パート133（マジックのフラッシュ側「このターンの間、スピリット1体をBP+N」を全件通す）
//
// 実行時カバレッジ（npm run coverage:effects）で、**フラッシュ側の bpBuff が16件も一度も
// 発火していない**ことが判明した（2026-08-08）。原因はバグではなくテストの穴で、
// 「メイン：〈固有効果〉／フラッシュ：BP+N」型のマジックはメイン側（lendSelfThisTurn 等）だけを
// 検証しており、フラッシュ側を撃つ経路が誰も通っていなかった。
//
// 個別に書くと同じ手順が82回並ぶだけなので、**カードデータから対象を列挙して回す**。
// 新しい弾で同型のマジックが増えても自動的に検証対象に入る（カードIDの直書きもしない）。
//
// 検証手順は実プレイと同じ: p1がアタック → p2がパス（フラッシュ①の優先権がp1へ）→
// p1が自分のアタッカーを対象にフラッシュでマジックを使用 → BP増減が amount ぶん乗る
// （寿命はターン終了までの tempBpBuff とバトル終了までの battleBpBuff の2種類。ここでは合算で見る）。
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

// 対象にできるスピリットを制限する filter は minSymbols（BS04のシンボル2つ以上を要求する6枚）・
// nameContains（BS07の「勇者」を含むスピリット）・family（BS07ニードルショットの「剣獣」）のみ。
// それ以外の filter が現れたらこのパートの前提が崩れるので、下の列挙で検出して落とす
interface FlashBpEntry {
    cardId: string
    name: string
    eid: string
    amount: number
    minSymbols: number
    nameContains?: string
    family?: string
}

const cards = loadAllCards() as unknown as {
    cardId: string
    name: string
    effects?: Record<string, unknown>[]
}[]

const entries: FlashBpEntry[] = []
const unexpectedFilters: string[] = []
for (const c of cards) {
    for (const e of c.effects ?? []) {
        if (e["kind"] !== "magic" || e["timing"] !== "flash") continue
        const action = e["action"] as Record<string, unknown> | undefined
        if (!action || action["type"] !== "bpBuff") continue
        const filter = action["filter"] as Record<string, unknown> | undefined
        const filterKeys = Object.keys(filter ?? {})
        if (filterKeys.some((k) => k !== "minSymbols" && k !== "nameContains" && k !== "family")) {
            unexpectedFilters.push(`${c.cardId} ${c.name}（${filterKeys.join(",")}）`)
            continue
        }
        const nameContains = filter?.["nameContains"]
        const family = filter?.["family"]
        entries.push({
            cardId: c.cardId,
            name: c.name,
            eid: String(e["id"] ?? c.cardId),
            amount: Number(action["amount"] ?? 0),
            minSymbols: Number(filter?.["minSymbols"] ?? 1),
            ...(typeof nameContains === "string" ? { nameContains } : {}),
            ...(typeof family === "string" ? { family } : {}),
        })
    }
}

// 対象にするアタッカー。minSymbols:2 の6枚だけはシンボル2つのスピリットを立てる必要がある。
// カードIDの直書きは事故のもとなので、**データから条件で選び**、選んだ結果も検証する
function pickAttacker(minSymbols: number, nameContains?: string, family?: string): { cardId: string; name: string } {
    const all = loadAllCards() as unknown as {
        cardId: string
        name: string
        type?: string
        symbol?: unknown[]
        effects?: unknown[]
        levels?: { cores?: number }[]
    }[]
    // nameContains 指定時は「カード名にその文字列を含むスピリット」でなければ対象にできないので、
    // バニラ縛りを外して名前だけで選ぶ（BS07の「勇者」持ちはいずれも効果を持つ）
    if (nameContains !== undefined) {
        const named = all.find(
            (c) => c.type === "spirit" && c.name.includes(nameContains) && (c.levels?.[0]?.cores ?? 99) === 1,
        )
        if (!named) throw new Error(`カード名に「${nameContains}」を含むアタッカー候補が見つかりません`)
        return { cardId: named.cardId, name: named.name }
    }
    // family 指定時も同じ理由でバニラ縛りを外し、系統だけで選ぶ（BS07ニードルショット＝「剣獣」）
    if (family !== undefined) {
        const byFamily = (all as unknown as { cardId: string; name: string; type?: string; family?: string[]; levels?: { cores?: number }[] }[]).find(
            (c) => c.type === "spirit" && (c.family ?? []).includes(family) && (c.levels?.[0]?.cores ?? 99) === 1,
        )
        if (!byFamily) throw new Error(`系統「${family}」のアタッカー候補が見つかりません`)
        return { cardId: byFamily.cardId, name: byFamily.name }
    }
    const found = all.find(
        (c) =>
            c.type === "spirit" &&
            (c.symbol ?? []).length >= minSymbols &&
            (c.levels?.[0]?.cores ?? 99) === 1 &&
            // 効果なし（バニラ）を優先する。シンボル2つのバニラは存在しないため、
            // その場合だけ「継続効果を持たない＝場に置いても盤面に干渉しない」ものを許す
            (minSymbols === 1
                ? (c.effects ?? []).length === 0
                : (c.effects as { kind?: string }[] | undefined)?.every((e) => e.kind === "keyword") === true),
    )
    if (!found) throw new Error(`シンボル${String(minSymbols)}以上のアタッカー候補が見つかりません`)
    return { cardId: found.cardId, name: found.name }
}

const ATTACKER_1SYM = pickAttacker(1)
const ATTACKER_2SYM = pickAttacker(2)

console.log("=== マジックのフラッシュ側『このターンの間、スピリット1体をBP+N』を全件通す ===")
{
    assert(unexpectedFilters.length === 0, `想定外の bpBuff filter が無い（${unexpectedFilters.join(" / ")}）`)
    assert(entries.length >= 80, `フラッシュ側BP+Nのマジックを列挙できる（${entries.length}件）`)
    assert(
        ATTACKER_1SYM.cardId !== ATTACKER_2SYM.cardId,
        `シンボル1用（${ATTACKER_1SYM.name}）とシンボル2用（${ATTACKER_2SYM.name}）のアタッカーを選べる`,
    )
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

// 「1件も回っていないのに全緑」を防ぐため、失敗数だけでなく**成功数**も数えて突き合わせる
let failedCards = 0
let okCards = 0
for (const e of entries) {
    const s = createGame(`flashbp-${e.cardId}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    // コスト最大8のマジックを軽減なしで払えるだけのリザーブを積む
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20

    const attackerCard =
        e.nameContains !== undefined
            ? pickAttacker(1, e.nameContains)
            : e.family !== undefined
              ? pickAttacker(1, undefined, e.family)
              : e.minSymbols >= 2
                ? ATTACKER_2SYM
                : ATTACKER_1SYM
    const attacker = put(s, "p1", attackerCard.cardId, 1)
    s.players.p1.hand = [e.cardId]

    const label = `${e.cardId} ${e.name}`
    let ok = true
    ok = ok && act(s, "p1", { type: "nextPhase" }) === null
    ok = ok && act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null
    // 防御側パスでフラッシュ①の優先権が攻撃側へ移る
    ok = ok && act(s, "p2", { type: "pass" }) === null
    if (!ok) {
        assert(false, `${label}：フラッシュタイミングまで進められる`)
        failedCards++
        continue
    }
    const castError = act(s, "p1", {
        type: "castMagic",
        handIndex: 0,
        targetInstanceId: attacker.instanceId,
    })
    if (castError !== null) {
        assert(false, `${label}：フラッシュで使用できる（${castError}）`)
        failedCards++
        continue
    }
    // 「このバトルの間」と書かれたカード（scope:"battle"。BS07ニードルショット）は
    // battleBpBuff に積まれるので、寿命の違いを問わず合算で見る
    const gained = attacker.tempBpBuff + (attacker.battleBpBuff ?? 0)
    if (gained !== e.amount) {
        assert(false, `${label}：BP+${e.amount}（実際は+${gained}）`)
        failedCards++
        continue
    }
    okCards++
}

// 82件それぞれに ✅ を出すと出力が膨らむため、合否は1行にまとめる
assert(failedCards === 0, `フラッシュ側BP+Nのマジックがすべて発揮する（失敗${failedCards}件）`)
assert(okCards === entries.length, `列挙した${entries.length}件をすべて実際に使用した（成功${okCards}件）`)
