// smoke パート981（効果の途中で起きた疲労・ドロー・ボイドからのコア配置などの派生は、その効果を解決し終えてから1本の列で解決する。
// docs/design/DERIVED_AFTER_EFFECT.md。2026-11-17 ユーザー確認済みの規則）。期待値役が効果文と規則だけから書いた
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const STORM_ATTACK = "BS14-100" // ストームアタック（緑・コスト4・フラッシュ：相手1体を疲労→その後、自分1体を回復）
const TRIANGLE = "BS10-104" // トライアングルトラップ（緑・コスト3・フラッシュ：コスト4以下の相手3体を疲労）
const CASSIOPEIA = "BS12-078" // カシオペアシール（緑・コスト5・メイン：相手1体を疲労→この効果発揮後、ボイドからコア5個をデッキの横に置く）
const TOWER = "BS13-067" // 光導く巨塔（白ネクサス。Lv2『相手のメインステップ』相手が効果でドローしたとき、その効果発揮後、相手のメインステップを終了）
const STORMDRAW = "BS01-132" // ストームドロー（緑・コスト2・メイン：3枚ドロー→その後、手札2枚を破棄）
const IDOL = "BS12-064" // 偶像の館（紫ネクサス。Lv2(コア1)：相手の効果で自分のスピリットが疲労したとき、その疲労した1体につき相手のスピリット1体を疲労）
const HAKUEN = "BS12-062" // 白煙の大山脈（赤ネクサス。相手の効果で自分のスピリットが疲労したとき、疲労したスピリットのBP以下の相手のスピリット1体を破壊）
const UNITED = "BS03-131" // ユナイテッドパワー（白・コスト5・フラッシュ：自分のスピリット1体を疲労させることで、スピリット1体をBP+(疲労させたスピリットのBP)）
const LEO = "BS13-X04" // 獅機龍神ストライクヴルム・レオ（白・コスト8。他の系統「光導/星魂」の自分のスピリットが疲労したとき、このスピリットは回復）
const CRYSTAL = "BS10-036" // 水晶魚クリスティール（白・コスト4・系統「星魂」・効果なし）
const KAMOONE = "BS20-049" // カモオネ（青・コスト4。『アタック時』ボイドからコア1個を自分のネクサスへ。【連鎖：緑シンボル】続けてボイドからコア1個を自分のスピリットへ）
const GREENVAN = "BS01-051" // フライングミラージュ（緑・コスト1・バニラ。緑シンボル要員）
const PENTAN = "BS18-040" // 詩人ペンタン（黄・コスト3。相手のスピリット/ネクサスの効果でボイドからコアが増えたとき、増えたコア1個につき1枚ドローできる）
const SAVIOR = "BS18-074" // 救世神撃覇（赤・コスト4・フラッシュ：1枚ドロー→その後、手札のバーストカード1枚をセットできる）
const BURSTCARD = "BS16-074" // 爆覇炎神剣（赤のバーストカード。セットされる側）
const OWL = "BS01-059" // シダフクロウ（緑・コスト3。相手がドローするとき（する時点で）このスピリットは回復する）
const ARMS_NEXUS = "BS02-082" // 生み出される尖兵（白ネクサス。Lv2(コア2)『お互いのアタックステップ』系統「武装」の自分のスピリットが疲労したとき、ボイドからコア1個をリザーブへ。白コスト2のスピリットに「武装」を与える）
const WHITE2 = "BS04-035" // バーサーカー・マグナム（白・コスト2・バニラ。上のネクサスで「武装」になる）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk: [string, string, string][] = [
        [VAN, "ロクケラトプス", "spirit"], [STORM_ATTACK, "ストームアタック", "magic"], [TRIANGLE, "トライアングルトラップ", "magic"],
        [CASSIOPEIA, "カシオペアシール", "magic"], [TOWER, "光導く巨塔", "nexus"], [STORMDRAW, "ストームドロー", "magic"],
        [IDOL, "偶像の館", "nexus"], [HAKUEN, "白煙の大山脈", "nexus"], [UNITED, "ユナイテッドパワー", "magic"],
        [LEO, "獅機龍神ストライクヴルム・レオ", "spirit"], [CRYSTAL, "水晶魚クリスティール", "spirit"], [KAMOONE, "カモオネ", "spirit"],
        [GREENVAN, "フライングミラージュ", "spirit"], [PENTAN, "詩人ペンタン", "spirit"], [SAVIOR, "救世神撃覇", "magic"],
        [BURSTCARD, "爆覇炎神剣", "magic"], [OWL, "シダフクロウ", "spirit"], [ARMS_NEXUS, "生み出される尖兵", "nexus"],
        [WHITE2, "バーサーカー・マグナム", "spirit"],
    ]
    for (const [id, name, type] of chk) assert(getCard(id).name === name && getCard(id).type === type, `${id} は ${name}`)
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

// ---- 1. ストームアタック ----
console.log("=== 1. ストームアタック: 疲労の派生（相手の偶像の館）は、その後の自分の回復が済んでから解決される ===")
{
    // 規則「効果の続きは、派生を解決する前の盤面を読む」。回復する前に偶像の館が先に解決すると、疲労済みの自分のスピリットは疲労のままで、後の回復で元に戻ってしまう
    const { s, ids } = build("derived-1", "me", "main",
        { hand: [STORM_ATTACK], spirits: [{ card: VAN, cores: 1, rested: true }] },
        { spirits: [{ card: CRYSTAL, cores: 1 }], nexuses: [{ card: IDOL, cores: 1 }] })
    const r = runner(s)
    r.go("p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    r.until(() => false)
    const mine = inst(s, "p1", ids["p1." + VAN]!)
    assert(inst(s, "p2", ids["p2." + CRYSTAL]!)?.isRested === true, "相手のスピリットは疲労した")
    assert(mine?.isRested === true, `自分の疲労していたスピリットは、回復された後で偶像の館に疲労させられ、最終的に疲労状態（経過: ${r.trace.join(" / ")}）`)
}

// ---- 2. トライアングルトラップ ----
console.log("=== 2. トライアングルトラップ: 3体を疲労させる間は派生を解決せず、効果の後に1本の列になり、ターンプレイヤーが順番を決める ===")
{
    // 規則「1つの効果の中で何度起きても全部を1本の列にまとめ、ターンプレイヤーが順番を決める」
    const { s, ids } = build("derived-2", "me", "main",
        { hand: [TRIANGLE], spirits: [{ card: VAN, cores: 1 }, { card: VAN, cores: 1 }] },
        { spirits: [{ card: VAN, cores: 1 }, { card: GREENVAN, cores: 1 }, { card: CRYSTAL, cores: 1 }], nexuses: [{ card: IDOL, cores: 1 }, { card: HAKUEN, cores: 1 }] })
    const r = runner(s)
    r.go("p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    // 「3体を疲労」のモードを選ぶ。ほかは既定の答え
    const pc = r.until((c) => /どれから解決/.test(c.prompt), (c) => {
        const o = c.options?.find((x) => /3体/.test(x))
        return c.kind === "option" && o ? { type: "resolveChoice", option: o } : null
    })
    assert(pc !== null, `偶像の館と白煙の大山脈の2つが効果の後に1本の列になり、順番を聞かれる（経過: ${r.trace.join(" / ")}）`)
    if (pc) {
        assert(pc.pid === "p1", "順番を決めるのはターンプレイヤー（自分）")
        assert(s.players.p2.field.spirits.every((x) => x.isRested), "順番を聞かれた時点で、相手の3体はすべて疲労している")
        assert(s.players.p1.field.spirits.length === 2 && s.players.p1.field.spirits.every((x) => !x.isRested), "自分のスピリットは疲労も破壊もまだされていない（派生は未解決）")
        void ids
    }
}

// ---- 3. 光導く巨塔 ----
console.log("=== 3. 光導く巨塔 × ストームドロー: ドローの後の破棄が終わってから相手のメインステップが終了する ===")
{
    // 規則「この効果発揮後」だけは、その前の部分の派生を解決してから続きへ進む…のではなく、効果文自体が「効果発揮後に終了」。ドローの派生（forceEndMainStep）は破棄まで済んでから
    const { s } = build("derived-3", "opp", "main",
        { nexuses: [{ card: TOWER, cores: 1 }] },
        { hand: [STORMDRAW, VAN, VAN] })
    const r = runner(s)
    r.go("p2", { type: "castMagic", handIndex: 0, timing: "main" })
    const pc = r.until((c) => c.kind === "card" && c.pid === "p2")
    assert(pc !== null, `ドローの後に破棄の選択に着く（経過: ${r.trace.join(" / ")}）`)
    assert(s.phase === "main", "破棄を選ぶ時点では、相手のメインステップはまだ終了していない")
    assert(s.players.p2.hand.length === 5, "3枚ドロー済みで破棄前（手札5枚）")
    r.until(() => false)
    assert(s.players.p2.hand.length === 3, "2枚破棄され手札3枚")
    assert(s.phase !== "main", "破棄まで終えた後で相手のメインステップが終了している")
}

// ---- 4. ユナイテッドパワー（コストで疲労） ----
console.log("=== 4. ユナイテッドパワー: 「疲労させることで」のコストで起きた派生（レオの回復）は、恩恵（BP+）の後に解決される ===")
{
    // 規則「コストで起きた派生も、恩恵（〜の部分）の後に解決する」
    const { s, ids } = build("derived-4", "me", "main",
        { hand: [UNITED], spirits: [{ card: LEO, cores: 1, rested: true }, { card: CRYSTAL, cores: 1 }] },
        { spirits: [{ card: VAN, cores: 1 }] })
    const r = runner(s)
    r.go("p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    const crystal = ids["p1." + CRYSTAL]!
    const pc = r.until((c) => c.kind === "target" && inst(s, "p1", crystal)?.isRested === true)
    assert(pc !== null, `コスト（クリスティールの疲労）を払った後、BP+の対象を選ぶ待ちに着く（経過: ${r.trace.join(" / ")}）`)
    assert(inst(s, "p1", ids["p1." + LEO]!)?.isRested === true, "BP+の対象を選ぶ時点では、レオはまだ回復していない（派生は恩恵の後）")
    r.until(() => false)
    assert(inst(s, "p1", ids["p1." + LEO]!)?.isRested === false, "恩恵の後にレオの回復が解決される")
}

// ---- 5. ボイドからのコア配置 ----
console.log("=== 5. カモオネ × ペンタン: ボイドからのコア配置の派生（ペンタンのドロー）は、続きの連鎖の配置が済んでから ===")
{
    // 規則「効果の続きが先、派生は列にして後」。1個目をネクサスに置いた時点では解決せず、2個目をスピリットに置いた後に解決する
    const { s, ids } = build("derived-5", "me", "attack",
        { spirits: [{ card: KAMOONE, cores: 1 }, { card: GREENVAN, cores: 1 }], nexuses: [{ card: ARMS_NEXUS, cores: 0 }] },
        { spirits: [{ card: PENTAN, cores: 1 }] })
    const r = runner(s)
    r.go("p1", { type: "attack", instanceId: ids["p1." + KAMOONE]! })
    const pc = r.until((c) => c.pid === "p2")
    assert(pc !== null, `ペンタンのドローの確認・解決順が相手側に出る（経過: ${r.trace.join(" / ")}）`)
    const coresOnSpirits = s.players.p1.field.spirits.reduce((n, x) => n + x.cores, 0)
    assert(s.players.p1.field.nexuses[0]!.cores === 1, "ネクサスにコア1個が置かれている")
    assert(coresOnSpirits === 3, `ペンタンの派生を解決する前に、連鎖のスピリットへのコア配置まで済んでいる（スピリットのコア合計: ${coresOnSpirits}）`)
    r.until(() => false)
    assert(s.players.p1.field.spirits.reduce((n, x) => n + x.cores, 0) === 3, "（場面の確認）最終的に連鎖でスピリットにもコアが置かれる")
}

// ---- 6. ドロー ----
console.log("=== 6. 救世神撃覇 × シダフクロウ: ドローの派生（フクロウの回復）は、ドローの後の「バーストをセット」の確認が済んでから ===")
{
    // 規則「ドローを見張る誘発と、ドローの後に続きがある効果：続きが先」
    const { s, ids } = build("derived-6", "me", "main",
        { hand: [SAVIOR, BURSTCARD] },
        { spirits: [{ card: OWL, cores: 1, rested: true }] })
    const r = runner(s)
    r.go("p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    const pc = r.until((c) => c.pid === "p1" && /バースト|セット/.test(c.prompt))
    assert(pc !== null, `ドローの後に「バーストをセットするか」の確認に着く（経過: ${r.trace.join(" / ")}）`)
    assert(inst(s, "p2", ids["p2." + OWL]!)?.isRested === true, "バーストの確認の時点では、フクロウはまだ回復していない")
    r.until(() => false)
    assert(inst(s, "p2", ids["p2." + OWL]!)?.isRested === false, "続きの後にフクロウが回復する")
}

// ---- 7. 回帰: 効果の外の疲労 ----
console.log("=== 7. 回帰: アタック宣言の疲労で誘発する効果は、今までどおりその場で解決される ===")
{
    // 規則「効果の外の出来事（アタック宣言の疲労）は今のまますぐ解決する」
    const { s, ids } = build("derived-7", "me", "attack",
        { spirits: [{ card: WHITE2, cores: 1 }], nexuses: [{ card: ARMS_NEXUS, cores: 2 }] },
        { spirits: [{ card: VAN, cores: 1 }] })
    const before = s.players.p1.reserve
    const r = runner(s)
    r.go("p1", { type: "attack", instanceId: ids["p1." + WHITE2]! })
    r.until((c) => false) // 選択待ちがあれば止める（答えない）
    assert(inst(s, "p1", ids["p1." + WHITE2]!)?.isRested === true, "アタックしたスピリットが疲労している")
    assert(s.players.p1.reserve === before + 1, `アタック宣言の直後（フラッシュの前）にボイドからリザーブへコア1個（リザーブ ${before} → ${s.players.p1.reserve}）`)
}

// ---- 8. カシオペアシール ----
console.log("=== 8. カシオペアシール: 疲労の派生は、「この効果発揮後」のコア5個の配置より先に解決される ===")
{
    // 規則「『この効果発揮後』だけは、その前の部分の派生を解決してから続きへ進む」
    const { s, ids } = build("derived-8", "me", "main",
        { hand: [CASSIOPEIA], spirits: [{ card: VAN, cores: 1 }, { card: GREENVAN, cores: 1 }] }, // 疲労させる相手側の選択が出るよう2体
        { spirits: [{ card: CRYSTAL, cores: 1 }], nexuses: [{ card: IDOL, cores: 1 }] })
    const r = runner(s)
    r.go("p1", { type: "castMagic", handIndex: 0, timing: "main" })
    // 偶像の館の派生（相手が自分のスピリットを選んで疲労）の対象選択に着いた時点で、デッキの横にはまだ置かれていない
    const pc = r.until((c) => c.pid === "p2" && c.kind === "target")
    assert(pc !== null, `偶像の館の派生で、相手が疲労させる自分のスピリットを選ぶ（経過: ${r.trace.join(" / ")}）`)
    assert(s.players.p1.deckSideCores === 0, `派生の解決時点では、デッキの横にコアはまだ置かれていない（${s.players.p1.deckSideCores}個）`)
    r.until(() => false)
    assert(s.players.p1.deckSideCores === 5, "派生の後でデッキの横にコア5個が置かれる")
    assert(s.players.p1.field.spirits.filter((x) => x.isRested).length === 1, "自分のスピリット1体が偶像の館に疲労させられている")
    void ids
}

console.log("すべてのチェックに合格しました 🎉（part981）")
