// smoke パート180（バトル解決を再開可能なステップ列にした件）
//
// 2026-08-14：バトル解決（＞５BP比較 → ＞６破壊処理 → ＞７バトル終了宣言）を
// runBattleStep の1ステップずつに割り、途中で選択待ちが立ったら battleResolve フレームで
// 再開するようにした。あわせて「同時に発揮する効果はターンプレイヤーが解決順を決める」を
// 復活の確認へ適用した。仕様の一次資料は docs/design/TIMING_CHART.md。
//
// ここで検査するのは3点:
//   A. 相打ち（＞６の同時破壊）で復活の確認が2件出るとき、**先にターンプレイヤーが順番を決める**。
//      答え切ったあとバトルが最後（clearBattle）まで解決される＝再開が効いている
//   B. ＞６で「フィールドに残る」を使って生き残った個体も、＞７の【呪撃】の対象になる
//   C. ＞５のBP比較は＞６より先なので、敗者が生き残っても
//      『BPを比べ相手のスピリットだけを破壊したとき』は発揮する
import { act, assert, createGame, createInstance, declareBlock, refreshLevelAsOverrides, runTurnStart } from "./helpers"
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

function findCard(pred: (c: CardRow) => boolean, label: string): CardRow {
    const found = CARDS.find(pred)
    if (!found) throw new Error(`${label} に合うカードが見つかりません`)
    return found
}
const hasEffect = (c: CardRow, pred: (e: Record<string, unknown>) => boolean): boolean =>
    (c.effects ?? []).some(pred)
const coresOf = (c: CardRow, level: number): number => c.levels?.[level - 1]?.cores ?? 1

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): void {
    s.players[pid].field.nexuses.push(createInstance(cardId, s.turn, cores))
    refreshLevelAsOverrides(s)
}
const ALIVE = (s: GameState, pid: PlayerId, id: string): boolean =>
    s.players[pid].field.spirits.some((x) => x.instanceId === id)
// フラッシュタイミングを両者パスで閉じる（選択待ちが立ったら止める）
function closeFlash(s: GameState): void {
    while (s.isFlashTiming && s.battle && !s.pendingChoice && !s.winner) {
        if (act(s, s.priorityPlayer, { type: "pass" })) return
    }
}
function ownerOf(s: GameState, instanceId: string): PlayerId {
    return s.players.p1.field.spirits.some((x) => x.instanceId === instanceId) ? "p1" : "p2"
}

// 果て無き地平線Lv2：【神速】を持つ自分のスピリットが、BPを比べ破壊されたとき、
// リザーブのコア1個をトラッシュに置く"ことで"手札に戻る（optional＝確認が出る／お互いのアタックステップ）
const HORIZON = findCard(
    (c) =>
        c.type === "nexus" &&
        hasEffect(
            c,
            (e) =>
                e["kind"] === "reviveOnDestroy" &&
                e["optional"] === true &&
                e["keywordFilter"] === "soku" &&
                (e["when"] as Record<string, unknown> | undefined)?.["byBattle"] === true,
        ),
    "【神速】持ちを手札に戻す任意の復活ネクサス",
)
const HORIZON_LEVEL = 2
// 【神速】だけを持つ素直なスピリット（他の効果が解決順に混ざらないもの）
const SOKU = findCard(
    (c) =>
        c.type === "spirit" &&
        (c.effects ?? []).length === 1 &&
        hasEffect(c, (e) => e["kind"] === "keyword" && e["keyword"] === "soku") &&
        (c.levels?.[1]?.bp ?? 0) > 0,
    "【神速】だけを持つスピリット",
)

console.log("=== 相打ちの破壊処理は、ターンプレイヤーが解決順を決めてから進む ===")
{
    const s: GameState = createGame("battle-mutual-order", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "green" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    // 両者に同じ復活ネクサスを置き、同じ【神速】スピリットをLv2で立てて相打ちにする
    // （Lv2で揃えるのは、このネクサスのLv1BP読み替え効果を噛ませないため）
    putNexus(s, "p1", HORIZON.cardId, coresOf(HORIZON, HORIZON_LEVEL))
    putNexus(s, "p2", HORIZON.cardId, coresOf(HORIZON, HORIZON_LEVEL))
    const attacker = put(s, "p1", SOKU.cardId, coresOf(SOKU, 2))
    const blocker = put(s, "p2", SOKU.cardId, coresOf(SOKU, 2))

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "p2がブロック宣言")
    closeFlash(s)

    // ＞６：同時破壊。復活の確認が2件出るので、まずターンプレイヤーが順番を決める
    assert(s.pendingChoice?.destroyOrder !== undefined, "相打ちでは解決順の選択が先に立つ")
    assert(s.pendingChoice?.pid === s.turnPlayer, "順番を決めるのはターンプレイヤー")
    const ids = s.pendingChoice?.destroyOrder?.instanceIds ?? []
    assert(ids.length === 2, "候補はアタッカーとブロッカーの2体")
    assert(
        ids.includes(attacker.instanceId) && ids.includes(blocker.instanceId),
        "候補は相打ちになった2体そのもの",
    )
    const firstId = ids[0]!
    const firstPid = ownerOf(s, firstId)
    const secondId = ids.find((x) => x !== firstId)!
    const secondPid = ownerOf(s, secondId)
    const firstOption = (s.pendingChoice?.options ?? [])[0]!
    assert(
        act(s, s.turnPlayer, { type: "resolveChoice", option: firstOption }) === null,
        "先に解決する1体を指名する",
    )

    // 指名した側の復活確認 → 復活させる（手札に戻る）
    assert(s.pendingChoice?.reviveConfirm?.instanceId === firstId, "指名した体の確認が先に立つ")
    assert(act(s, firstPid, { type: "resolveChoice", option: "復活させる" }) === null, "1体目は復活させる")
    // 残る候補は1体だけなので、順番はもう聞かれない
    assert(s.pendingChoice?.destroyOrder === undefined, "候補が1体になれば順番は聞かない")
    assert(s.pendingChoice?.reviveConfirm?.instanceId === secondId, "続けて2体目の確認が立つ")
    assert(act(s, secondPid, { type: "resolveChoice" }) === null, "2体目は復活させない")

    // 中断していたバトル解決が最後（＞７のバトル終了宣言）まで再開されている
    assert(s.pendingChoice === null, "すべて解決すると選択待ちが無くなる")
    assert(s.battle === null, "バトルが最後まで解決されている（再開が効いている）")
    assert(!ALIVE(s, firstPid, firstId), "復活した側もフィールドには残らない（手札に戻る効果）")
    assert(s.players[firstPid].hand.includes(SOKU.cardId), "復活した側は手札に戻っている")
    assert(!ALIVE(s, secondPid, secondId), "復活しなかった側は破壊されている")
    assert(s.players[secondPid].trashCards.includes(SOKU.cardId), "復活しなかった側はトラッシュにある")
}

// 勝者のグリーンフィールドLv2：系統「四道」を持つ自分のスピリットが、
// BP7000以下の相手にBPを比べ破壊されたとき、**回復状態でフィールドに戻る**（＝場に残る／確認は出ない）。
// Lv1･Lv2 の常時効果で「四道」はBP+2000される
const GREENFIELD = findCard(
    (c) =>
        c.type === "nexus" &&
        hasEffect(
            c,
            (e) =>
                e["kind"] === "reviveOnDestroy" &&
                (e["when"] as Record<string, unknown> | undefined)?.["byBattleKillerMaxBp"] !== undefined,
        ),
    "BP上限つきで場に残す復活ネクサス",
)
const GREENFIELD_REVIVE = (GREENFIELD.effects ?? []).find(
    (e) => e["kind"] === "reviveOnDestroy",
)!
const GREENFIELD_FAMILY = GREENFIELD_REVIVE["familyFilter"] as string
const GREENFIELD_MAXBP = (GREENFIELD_REVIVE["when"] as Record<string, number>)["byBattleKillerMaxBp"]!
const GREENFIELD_AURA = 2000 // 同じネクサスが「四道」に与えるBP+
// 守られる側：その系統を持ち、召喚時などの余計な誘発が解決順に混ざらないスピリット
const WARDED = findCard(
    (c) =>
        c.type === "spirit" &&
        (c.family ?? []).includes(GREENFIELD_FAMILY) &&
        (c.levels?.[0]?.bp ?? 0) > 0 &&
        (c.effects ?? []).every((e) => e["kind"] === "triggered" && e["trigger"] === "onSummon"),
    `系統「${GREENFIELD_FAMILY}」を持つスピリット`,
)
const WARDED_BP = (WARDED.levels?.[0]?.bp ?? 0) + GREENFIELD_AURA

// 守る側のネクサスが機能する範囲（BP GREENFIELD_MAXBP 以下）で、ブロッカーより強い【呪撃】持ち
const JUGEKI = findCard(
    (c) =>
        c.type === "spirit" &&
        hasEffect(
            c,
            (e) => e["kind"] === "keyword" && e["keyword"] === "jugeki" && (e["levels"] as number[]).includes(2),
        ) &&
        (c.levels?.[1]?.bp ?? 0) > WARDED_BP &&
        (c.levels?.[1]?.bp ?? 0) <= GREENFIELD_MAXBP,
    "【呪撃】持ちの勝てるアタッカー",
)

// 防御側に「BPを比べ破壊されたら場に戻る」ネクサスと、その対象になるブロッカーを置く
function setupWardedBlocker(seed: string, attackerCard: CardRow, attackerLevel: number) {
    const s: GameState = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "yellow" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    putNexus(s, "p2", GREENFIELD.cardId, coresOf(GREENFIELD, 2))
    const attacker = put(s, "p1", attackerCard.cardId, coresOf(attackerCard, attackerLevel))
    const blocker = put(s, "p2", WARDED.cardId, coresOf(WARDED, 1))
    return { s, attacker, blocker }
}

console.log("=== ＞６で場に残った個体も、＞７の【呪撃】では破壊される ===")
{
    const { s, attacker, blocker } = setupWardedBlocker("battle-jugeki-after-revive", JUGEKI, 2)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "p2がブロック宣言")
    closeFlash(s)

    assert(s.battle === null, "バトルが解決している")
    assert(
        s.log.some((l) => l.includes("破壊される代わりに")),
        "＞６では「破壊される代わりに」場へ戻っている",
    )
    assert(
        s.log.some((l) => l.includes("【呪撃】")),
        "＞７で【呪撃】が発揮している",
    )
    assert(!ALIVE(s, "p2", blocker.instanceId), "場に残った個体が【呪撃】で破壊されている")
}

// 太古の断層Lv2：『BPを比べ相手のスピリットだけを破壊したとき』自分は1枚ドローする
const BATTLE_WON = findCard(
    (c) =>
        c.type === "nexus" &&
        hasEffect(
            c,
            (e) =>
                e["kind"] === "battleWon" &&
                e["role"] === "attacker" &&
                (e["action"] as Record<string, unknown> | undefined)?.["type"] === "draw",
        ),
    "勝利でドローするネクサス",
)
// 太古の断層のBP+はコスト2のスピリットにかかるので、それを避けた素のアタッカーを選ぶ
const PLAIN_ATTACKER = findCard(
    (c) =>
        c.type === "spirit" &&
        (c.effects ?? []).length === 0 &&
        c.cost !== 2 &&
        (c.levels?.[0]?.bp ?? 0) > WARDED_BP &&
        (c.levels?.[0]?.bp ?? 0) <= GREENFIELD_MAXBP,
    "効果を持たない勝てるアタッカー",
)

console.log("=== ＞５のBP比較は＞６より先：敗者が場に残っても勝者側の効果は発揮する ===")
{
    const { s, attacker, blocker } = setupWardedBlocker("battle-won-despite-revive", PLAIN_ATTACKER, 1)
    putNexus(s, "p1", BATTLE_WON.cardId, coresOf(BATTLE_WON, 2))
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    const handBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "p2がブロック宣言")
    closeFlash(s)

    assert(s.battle === null, "バトルが解決している")
    assert(ALIVE(s, "p2", blocker.instanceId), "敗者は「フィールドに残る」で場に残っている")
    assert(
        s.players.p1.hand.length === handBefore + 1,
        `残られても勝者側の効果は発揮する（手札 ${String(handBefore)} → ${String(s.players.p1.hand.length)}）`,
    )
}
