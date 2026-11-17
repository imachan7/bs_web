// smoke パート983（効果で召喚したスピリットの『召喚時』と「召喚されたとき」の誘発は、召喚した効果を解決し終えてから1本の列で解決する。
// docs/design/DERIVED_AFTER_EFFECT.md §11。2026-11-17 ユーザー確認済みの規則）。期待値役が効果文と規則だけから書いた
import { act, assert, resolveAction, takeLifeAndResolve, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const GENERATE = "BS22-073" // ジェネレートファイア（赤・コスト5・メイン：BP3000以下の相手のスピリットすべてを破壊。この効果発揮後、手札のスピリット1枚を召喚できる）
const SKEL = "BS01-038" // スケル・バイパー（紫・コスト4・妖蛇。『召喚時』1枚ドロー）
const MAHA5 = "P025" // マハーヴァスキ（紫・コスト5・妖蛇。『召喚時』1枚ドロー）
const DRAGONAGA = "BS13-016" // 呪王ドラゴナーガ（紫・コスト7。Lv1～：系統「妖蛇」の自分のスピリットが召喚されたとき1枚ドロー）
const MENASHI = "BS05-012" // メナシヘビ（紫・コスト3・妖蛇。効果なし）
const KRISHNA = "BS17-005" // ドラグ・クリシュナー（赤・コスト5。バースト：相手の『召喚時』発揮後に召喚）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3。『召喚時』1枚ドロー）
const ZIEG = "BS14-X01" // 龍の覇王ジーク・ヤマト・フリード（赤・コスト8。バースト：ライフ減少後、ライフ3以下ならBP15000以下を破壊。この効果発揮後、召喚）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk: [string, string, string][] = [
        [VAN, "ロクケラトプス", "spirit"], [GENERATE, "ジェネレートファイア", "magic"], [SKEL, "スケル・バイパー", "spirit"],
        [MAHA5, "マハーヴァスキ", "spirit"], [DRAGONAGA, "呪王ドラゴナーガ", "spirit"], [KRISHNA, "ドラグ・クリシュナー", "spirit"],
        [GRIP, "グリプ・ハンズ", "spirit"], [ZIEG, "龍の覇王ジーク・ヤマト・フリード", "spirit"],
    ]
    for (const [id, name, type] of chk) assert(getCard(id).name === name && getCard(id).type === type, `${id} は ${name}`)
    assert(getCard(MAHA5).family?.includes("妖蛇") === true && getCard(SKEL).family?.includes("妖蛇") === true, "マハーヴァスキ・スケル・バイパーは妖蛇")
}

interface Unit { card: string; cores: number; rested?: boolean }
interface Side { life?: number; hand?: string[]; spirits?: Unit[]; nexuses?: Unit[] }

function build(seed: string, turn: "me" | "opp", phase: "main" | "attack", me: Side, opp: Side) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turn === "me" ? "p1" : "p2"
    s.priorityPlayer = s.turnPlayer
    s.phase = phase
    s.interactiveTargets = true
    const ids: Record<string, string> = {}
    for (const [pid, spec] of [["p1", me], ["p2", opp]] as [PlayerId, Side][]) {
        const p = s.players[pid]
        p.life = spec.life ?? 5
        p.reserve = 10
        p.hand = [...(spec.hand ?? [])]
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
        p.burst = null
        p.burstSet = false
        p.soulCore = null
        const place = (list: Unit[] | undefined, zone: typeof p.field.spirits) => {
            for (const x of list ?? []) {
                const inst = createInstance(x.card, s.turn - 1, x.cores)
                inst.isRested = x.rested ?? false
                zone.push(inst)
                ids[`${pid}.${x.card}`] = inst.instanceId
            }
        }
        place(spec.spirits, p.field.spirits)
        place(spec.nexuses, p.field.nexuses)
    }
    refreshLevelAsOverrides(s)
    return { s, ids }
}

type PC = NonNullable<GameState["pendingChoice"]>
function runner(s: GameState) {
    const trace: string[] = []
    const go = (pid: PlayerId, action: GameAction): void => {
        const err = act(s, pid, action)
        assert(err === null, `${action.type} が通る${err === null ? "" : `（拒否: ${err}）`}`)
    }
    // 選択待ちに既定の答え（最初の候補・最初の選択肢）を返しながら進める。pred が真になる選択待ちで止めて返す
    const until = (pred: (pc: PC) => boolean, pick?: (pc: PC) => GameAction | null): PC | null => {
        for (let i = 0; i < 20; i++) {
            const pc = s.pendingChoice
            if (!pc) return null
            trace.push(`${pc.pid}:${pc.kind}:${pc.prompt}`)
            if (pred(pc)) return pc
            const custom = pick?.(pc) ?? null
            if (custom) { go(pc.pid, custom); continue }
            if (pc.kind === "target") go(pc.pid, { type: "resolveChoice", instanceId: pc.candidates[0]! })
            else if (pc.kind === "card") go(pc.pid, { type: "resolveChoice", cardIndex: pc.cardIndices?.[0] ?? 0 })
            else go(pc.pid, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        }
        return null
    }
    return { go, until, trace }
}

const inst = (s: GameState, pid: PlayerId, id: string) => s.players[pid].field.spirits.find((x) => x.instanceId === id)


// ---- 1. ジェネレートファイア ----
console.log("=== 1. ジェネレートファイア: 効果で召喚したスピリットの『召喚時』と呪王ドラゴナーガの誘発は、効果の後に1本の列になり、ターンプレイヤーが順番を決める ===")
{
    // 規則「効果で召喚したスピリットの『召喚時』と『召喚されたとき』は、召喚した効果を解決し終えてから1本の列。2件以上ならターンプレイヤーが順番を決める」
    const { s } = build("summon-1", "me", "main",
        { hand: [GENERATE, MAHA5], spirits: [{ card: DRAGONAGA, cores: 1 }] },
        { spirits: [{ card: VAN, cores: 1 }] })
    const r = runner(s)
    r.go("p1", { type: "castMagic", handIndex: 0, timing: "main" })
    const pc = r.until((c) => /どれから/.test(c.prompt))
    assert(pc !== null, `『召喚時』のドローと呪王ドラゴナーガのドローの2つが1本の列になり、順番を聞かれる（経過: ${r.trace.join(" / ")}）`)
    if (pc) {
        assert(pc.pid === "p1", "順番を決めるのはターンプレイヤー（自分）")
        assert(s.players.p1.field.spirits.some((x) => x.cardId === MAHA5), "順番を聞かれた時点で、マハーヴァスキは召喚済み")
        assert(s.players.p2.field.spirits.length === 0, "相手のスピリットは破壊済み")
        assert(s.players.p1.hand.length === 0, `順番を聞かれた時点で、2件のドローはどちらも未解決（手札 ${s.players.p1.hand.length}枚）`)
    }
    r.until(() => false)
    assert(s.players.p1.hand.length === 2, `2件のドローが解決され手札2枚（${s.players.p1.hand.length}枚）`)
}

// ---- 2. 回帰: 手札からの通常召喚 ----
console.log("=== 2. 回帰: 手札からの通常召喚では、『召喚時』が召喚の直後にすぐ解決される ===")
{
    // 規則「効果の外の召喚（通常召喚）は今までどおりすぐ『召喚時』を解決する」
    const { s } = build("summon-2", "me", "main", { hand: [SKEL] }, {})
    const r = runner(s)
    r.go("p1", { type: "summon", handIndex: 0 })
    assert(s.players.p1.hand.length === 1, `召喚の直後（選択待ちが無ければそのまま）に『召喚時』の1枚ドローが解決済み（手札 ${s.players.p1.hand.length}枚）`)
    assert(s.pendingChoice === null || !/どれから/.test(s.pendingChoice.prompt), "1件だけなので順番は聞かれない")
}

// ---- 3. 回帰: バースト（ドラグ・クリシュナー） ----
console.log("=== 3. 回帰: 相手の『召喚時』発揮後のバーストで召喚できる（セットの有無は見ていない） ===")
{
    // 規則「バーストの発動の宣言は条件を満たした時点、適用は効果の後（変わらない）」
    const { s } = build("summon-3", "opp", "main", { hand: [GRIP] }, { hand: [GRIP] })
    s.players.p1.burst = KRISHNA
    s.players.p1.burstSet = true
    const r = runner(s)
    r.go("p2", { type: "summon", handIndex: 0 })
    r.until(() => false)
    assert(s.players.p1.field.spirits.some((x) => x.cardId === KRISHNA), `クリシュナーが召喚された（経過: ${r.trace.join(" / ")}）`)
    assert(s.players.p2.hand.length === 1, "相手の『召喚時』のドローも解決された")
}

// ---- 4. 「この効果発揮後」の区切り ----
console.log("=== 4. 龍の覇王ジーク・ヤマト・フリード: 破壊の派生を解決してから、続きの召喚へ進む（区切りが壊れていない） ===")
{
    // 規則「『この効果発揮後』だけは、その前の部分の派生を解決してから続きへ進む」
    const { s } = build("summon-4", "opp", "attack", { life: 4 }, { spirits: [{ card: VAN, cores: 1 }, { card: GRIP, cores: 1 }] })
    s.players.p1.burst = ZIEG
    s.players.p1.burstSet = true
    const r = runner(s)
    const attacker = s.players.p2.field.spirits[0]!.instanceId
    r.go("p2", { type: "attack", instanceId: attacker })
    assert(takeLifeAndResolve(s, "p1") === null, "自分（p1）はライフで受ける")
    r.until(() => false)
    assert(s.players.p1.field.spirits.some((x) => x.cardId === ZIEG), `ライフ3以下で破壊の後、ジークが召喚された（ライフ ${s.players.p1.life}、経過: ${r.trace.join(" / ")}）`)
}


// 以下は実カードで観測できる札が無いため、テスト内で合成した効果（召喚→相手1体を疲労）を直接解決する
const SEQ = { type: "sequence", actions: [{ type: "summon", from: "hand", count: 1 }, { type: "exhaust", count: 1 }] } as never
function synth(seed: string, summon: string, mineSpirits: Unit[]) {
    const { s } = build(seed, "me", "main", { hand: [summon], spirits: mineSpirits }, { spirits: [{ card: VAN, cores: 1 }, { card: GRIP, cores: 1 }] })
    const r = runner(s)
    resolveAction(s, "p1", null, SEQ)
    return { s, r }
}

console.log("=== 1'. 合成（召喚→疲労）: 疲労の対象選択の時点で、召喚したスピリットの『召喚時』ドローはまだ起きていない ===")
{
    // 規則「召喚の派生（『召喚時』）は、召喚した効果を最後まで解決し終えてから」
    const { s, r } = synth("synth-1", MAHA5, [])
    const pc = r.until((c) => c.kind === "target" && c.pid === "p1")
    assert(pc !== null, `疲労の対象選択が出る（経過: ${r.trace.join(" / ")}）`)
    assert(s.players.p1.field.spirits.some((x) => x.cardId === MAHA5), "マハーヴァスキは召喚済み")
    assert(s.players.p1.hand.length === 0, `対象選択の時点で『召喚時』のドローは未解決（手札 ${s.players.p1.hand.length}枚）`)
    r.until(() => false)
    assert(s.players.p1.hand.length === 1, "選択を解決した後にドローが起きる")
}

console.log("=== 2'. 合成（召喚→疲労）: 疲労の対象選択の時点で、呪王ドラゴナーガの『召喚されたとき』ドローはまだ起きていない ===")
{
    // 規則「ほかのカードの『スピリットが召喚されたとき』も、召喚した効果を解決し終えてから」
    const { s, r } = synth("synth-2", MENASHI, [{ card: DRAGONAGA, cores: 1 }])
    const pc = r.until((c) => c.kind === "target" && c.pid === "p1")
    assert(pc !== null, `疲労の対象選択が出る（経過: ${r.trace.join(" / ")}）`)
    assert(s.players.p1.hand.length === 0, `対象選択の時点でドラゴナーガのドローは未解決（手札 ${s.players.p1.hand.length}枚）`)
    r.until(() => false)
    assert(s.players.p1.hand.length === 1, "選択を解決した後にドローが起きる")
}

console.log("=== 3'. 合成（召喚→疲労）: 『召喚時』と『召喚されたとき』の2件は、疲労の選択の後に1本の列になり、順番がターンプレイヤーに出る ===")
{
    // 規則「派生は1本の列、2件以上ならターンプレイヤーが順番を決める」
    const { s, r } = synth("synth-3", MAHA5, [{ card: DRAGONAGA, cores: 1 }])
    const first = r.until((c) => c.kind === "target" && c.pid === "p1")
    assert(first !== null && !/どれから/.test(first.prompt), `最初の選択待ちは疲労の対象（経過: ${r.trace.join(" / ")}）`)
    assert(s.players.p1.hand.length === 0, "その時点でどちらのドローも未解決")
    const pc = r.until((c) => /どれから/.test(c.prompt))
    assert(pc !== null && pc.pid === "p1", "疲労の選択の後に、ターンプレイヤーが順番を決める")
    r.until(() => false)
    assert(s.players.p1.hand.length === 2, "2件のドローが解決される")
}

console.log("すべてのチェックに合格しました 🎉（part983）")
