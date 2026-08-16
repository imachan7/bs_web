// smoke パート196（effectGrant：付与された効果が、付与先で実際に働くか）
//
// `kind:"effectGrant"` は「自分の系統◯◯のスピリットすべてに“『△△時』〜する”という効果を与える」。
// **付与先のスピリットの誘発を撃たないと一度も働かない**ため、
// カバレッジで「盤面にあるのに一度も適用されていない」と出ていた（8件）。
//
// ここでは付与元と付与先を並べ、**付与前には起きず、付与後には起きる**ことを盤面の変化で確かめる。
// 付与される action は draw / selfBuff / exhaust など様々なので、
// 「何が起きるか」ではなく「**付与によって盤面が動くこと**」を共通の物差しにしている。
import { assert, createGame, createInstance, effectiveBp, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireTrigger, resolveAction, spiritHasKeyword } from "../../server/src/logic/EffectModules"
import type { Color } from "../../server/src/type"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    colors?: string[]
    family?: string[]
    effects?: Record<string, unknown>[]
    levels?: { cores: number; bp: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const coresFor = (c: CardRow, level: number): number => c.levels?.[level - 1]?.cores ?? 1
function activeLevel(c: CardRow, entry: Record<string, unknown>): number {
    const levels = entry["levels"] as number[] | null
    if (levels && levels.length > 0) return Math.max(...levels)
    return c.levels?.length ?? 1
}

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, card: CardRow, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, card: CardRow, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 付与される action が指定している系統を集める（コストに使う駒を用意するため）
function collectFamilies(node: unknown, acc: Set<string>): void {
    if (Array.isArray(node)) {
        for (const v of node) collectFamilies(v, acc)
        return
    }
    if (node === null || typeof node !== "object") return
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (/family/i.test(k)) {
            if (typeof v === "string") acc.add(v)
            else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") acc.add(x)
        }
        collectFamilies(v, acc)
    }
}

// 盤面が動いたかを測る物差し（付与される action の種類に依存しない）
function snapshot(s: GameState): string {
    const parts: string[] = []
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = s.players[pid]
        parts.push(
            `${p.hand.length}/${p.deck.length}/${p.trashCards.length}/${p.reserve}/${p.trashCores}/${p.life}/${p.field.spirits.length}`,
        )
        // **インスタンスの中身まで**見る。印を付けるだけの効果
        // （treatAsUnblockedIfBlockerLevel1 等）は BP もコアも動かさないため
        for (const sp of p.field.spirits) parts.push(`${effectiveBp(s, pid, sp)}:${JSON.stringify(sp)}`)
    }
    // バトルに付く印（「ブロックされなかったものとして扱う」等）も見る
    parts.push(JSON.stringify(s.battle))
    return parts.join("|")
}

console.log("=== パート196：effectGrant で付与された効果が、付与先で働く ===")
{
    const sources = CARDS.filter((c) => (c.effects ?? []).some((e) => e["kind"] === "effectGrant"))
    assert(sources.length > 0, "effectGrant を持つカードが実データにある")
    let checked = 0
    for (const src of sources) {
        for (const entry of (src.effects ?? []).filter((e) => e["kind"] === "effectGrant")) {
            const granted = entry["granted"] as Record<string, unknown> | undefined
            const trigger = granted?.["trigger"] as string | undefined
            if (!trigger) continue
            // 付与先の絞り込みは**系統だけではない**（名前・色・キーワードもある）。
            // どれか1つでも見落とすと、その付与は永久に働かない
            const fam = entry["familyFilter"]
            const wantFams = typeof fam === "string" ? [fam] : Array.isArray(fam) ? (fam as string[]) : []
            const wantName = entry["nameIncludes"] as string | undefined
            const colorFilter = entry["colorFilter"]
            const wantColors = typeof colorFilter === "string" ? [colorFilter] : Array.isArray(colorFilter) ? (colorFilter as string[]) : []
            const wantKeyword = entry["keywordFilter"] as string | undefined
            const grantee = CARDS.find(
                (c) =>
                    c.type === "spirit" &&
                    c.cardId !== src.cardId &&
                    (wantFams.length === 0 || wantFams.some((f) => (c.family ?? []).includes(f))) &&
                    (wantName === undefined || c.name.includes(wantName)) &&
                    (wantColors.length === 0 || wantColors.some((col) => (c.colors ?? []).includes(col))) &&
                    (wantKeyword === undefined ||
                        (c.effects ?? []).some((e2) => e2["kind"] === "keyword" && e2["keyword"] === wantKeyword)),
            )
            if (!grantee) continue

            const level = activeLevel(src, entry)
            const s = base(`grant-${src.cardId}-${String(entry["id"])}`)
            const target = put(s, "p1", grantee, coresFor(grantee, grantee.levels?.length ?? 1))
            // 相手に2体（うち1体は疲労状態）。「疲労状態の相手を破壊する」ような
            // 付与効果が空振りしないように
            // 相手の駒は**コスト3以下**を**Lv1**で置く：付与される効果には
            // 「ブロックしたスピリットのコストが3以下なら」「ブロッカーがLv1なら」という
            // 条件を持つものがあり、大きい駒だと永久に条件を満たさない
            const foe = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 99) <= 3)
                ?? CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!
            put(s, "p2", foe, coresFor(foe, 1))
            put(s, "p2", foe, coresFor(foe, 1)).isRested = true
            // 自分側にも、コストに使える駒を用意する:
            //   - ネクサス1つ（「自分のネクサスを疲労させることで〜」）
            //   - 付与される action が系統を指定していれば、その系統のスピリット
            //     （「系統：地竜を疲労させることで〜」）
            const anyNexus = CARDS.find((c) => c.type === "nexus")!
            putNexus(s, "p1", anyNexus, coresFor(anyNexus, 1))
            const actFams = new Set<string>()
            collectFamilies(granted?.["action"], actFams)
            for (const f of actFams) {
                const helper = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes(f))
                if (helper) put(s, "p1", helper, coresFor(helper, helper.levels?.length ?? 1))
            }
            // 付与先は疲労状態にしておく（「〜することで回復する」系は、回復状態だと何も変わらない）
            target.isRested = true
            // バトルを成立させる（バトル中でないと印が付かない付与効果のため）。
            // **『ブロック時』の付与は自分がブロック側**なので、そのときだけ向きを入れ替える
            // （向きが逆だと「ブロックした相手のコストが3以下なら」のような条件が読めない）
            const blockSide = trigger === "onBlock"
            const foeInst = s.players.p2.field.spirits[0]?.instanceId ?? null
            s.battle = blockSide
                ? {
                      attackerInstanceId: foeInst ?? target.instanceId,
                      blockerInstanceId: target.instanceId,
                      flashLockedPlayer: null,
                      directed: false,
                  }
                : {
                      attackerInstanceId: target.instanceId,
                      blockerInstanceId: foeInst,
                      flashLockedPlayer: null,
                      directed: false,
                  }
            refreshLevelAsOverrides(s)

            // 付与前：同じ誘発を撃っても何も起きない
            // 役割（アタッカー／ブロッカー）は常に渡す。
            // **対象（バトルの相手）は、付与に condition があるときだけ**渡す：
            //   - condition 付き（「ブロックした相手のコストが3以下なら」）は
            //     fireTrigger が渡す対象を見るので、渡さないと永久に発火しない
            //   - 一方、条件を持たない付与に渡すと「明示ターゲット」扱いになり、
            //     filter に合わない場合にそこで不発になる（藍紫の虚空＝疲労状態のみ破壊）
            const role = trigger === "onBlock" || trigger === "onBlocked" ? "blocker" : "attacker"
            const foeId = granted?.["condition"] !== undefined ? s.players.p2.field.spirits[0]?.instanceId : undefined
            const before = snapshot(s)
            fireTrigger(s, "p1", target, trigger as never, role, foeId)
            const afterNoGrant = snapshot(s)

            // 付与元を置いてから、同じ誘発をもう一度撃つ。
            // **マジックは場に置けない**ので、「このターンの間だけ効果を貸す」経路を通す（lentOnly）
            if (src.type === "magic") {
                resolveAction(
                    s,
                    "p1",
                    null,
                    { type: "lendSelfThisTurn" },
                    undefined,
                    (src.colors ?? ["blue"]) as Color[],
                    "magic",
                    undefined,
                    undefined,
                    src.cardId,
                )
            } else if (src.type === "nexus") {
                putNexus(s, "p1", src, coresFor(src, level))
            } else {
                put(s, "p1", src, coresFor(src, level))
            }
            refreshLevelAsOverrides(s)
            const beforeGrant = snapshot(s)
            fireTrigger(s, "p1", target, trigger as never, role, foeId)
            const afterGrant = snapshot(s)

            assert(
                afterNoGrant === before,
                `${src.name}：付与元がいなければ『${trigger}』を撃っても何も起きない`,
            )
            assert(
                afterGrant !== beforeGrant,
                `${src.name}：付与された『${trigger}』の効果が付与先（${grantee.name}）で働く`,
            )
            checked++
        }
    }
    assert(checked > 0, "effectGrant のエントリを1件以上検証した")
    console.log(`  （検証した effectGrant エントリ: ${checked}件）`)
}
