// smoke パート617（BS17 赤の場面テスト：効果文だけから書いた期待値。実装前に書いたもの）
import { act, assert, createGame, createInstance, effectiveBp, getCard, playerHas, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

type Pending = NonNullable<GameState["pendingChoice"]>

// ---- 対象カード（BS17 赤） ----
const BALI = "BS17-001" // バリ・バーン
const FENCER = "BS17-002" // フェンサー・ドラゴン
const ARJ = "BS17-003" // アルジュナス
const RYU = "BS17-004" // リュー・ラーダー（雄将）
const KRISHNA = "BS17-005" // ドラグ・クリシュナー（覇皇）
const TSUKU = "BS17-006" // ツクヨミドラグーン
const VAJRA = "BS17-007" // ヴァジュランガ（バニラ。テストなし）
const BOLGAND = "BS17-008" // 紅玉の巨龍ボルガンド
const SWORDM = "BS17-009" // ソードマスター・ドラゴン
const YASAKANI = "BS17-055" // ヤサカニ・ウィング
const TAKAMA = "BS17-061" // 神焔の高天ヶ原
const TENKU = "BS17-062" // 彷徨う天空寺院
const ADER = "BS17-073" // アーダーフレイム
const SENKEN = "BS17-074" // 殲剣火炎陣
const SUSANO = "BS17-X01" // 天剣の覇王ジーク・スサノ・フリード（覇皇）

// ---- 脇役（既存カード。効果の無いものを選んだ） ----
const RED = "BS01-002" // ロクケラトプス（Lv1 1000 / Lv2 3000 / Lv3 4000）
const GORA = "BS01-001" // ゴラドン（Lv1 1000 / Lv2 3000）
const AIBARN = "BS01-005" // アイバーン（Lv1 2000 / Lv2 6000）
const SALA = "BS03-001" // 火精サラマンダート（Lv1 2000）
const METAL = "BS01-008" // メタルバーン（Lv1 3000 / Lv2 4000 / Lv3 8000 コア8）
const DINO = "BS02-003" // ディノハウンド（Lv1 4000 コア2）
const DIMET = "BS05-003" // ディメトロドロン（Lv2 5000 コア2）
const PENTA = "BS14-008" // ペンタケラトップ（コスト5・Lv2 7000 コア2・赤シンボル軽減4）
const MELT = "BS03-009" // 火吹きメルト（コスト5・Lv1 4000）
const BRAVE_STAR = "BS10-063" // 飛槍獣バリ・スター（ブレイヴ。合体条件：コスト5以上）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3。召喚時：1枚ドロー）
const SMOKE = "BS11-009" // スモークロコ（紫・Lv1 1000 / Lv2 2000。破壊時：1枚ドロー）
const BURST_MAGIC = "BS14-091" // 双光気弾（赤・バースト：相手による自分のスピリット破壊後。召喚時発揮後の条件ではない）
// バーストの「召喚する」はコストを支払わない（BURST.md。005・X01 の召喚も無償）
const BURST_SPIRIT = "BS14-010" // 皇牙獣キンタローグ・ベアー（バースト効果を持つ赤スピリット）
const BURST_SEAL = "BS14-112" // 封渦斬（バースト条件：相手の召喚時発揮後。相手はマジックを使用できない）
const COFFIN = "BS01-131" // ダークコフィン（紫・コスト7・メイン：疲労スピリット1体を破壊）
const FLAME = "BS01-121" // フレイムダンス（赤・コスト5・BP4000以下のスピリット1体を破壊）
const BURST_ALT = "SD06-013" // 双翼乱舞（赤・マジック。バースト条件が封渦斬と同じ「相手の召喚時発揮後」）
const NEXUS_A = "BS02-085" // トパーズの流星（黄）
const NEXUS_B = "BS03-108" // 鋼に覆われた高空（白）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        [BALI]: "バリ・バーン", [FENCER]: "フェンサー・ドラゴン", [ARJ]: "アルジュナス", [RYU]: "リュー・ラーダー",
        [KRISHNA]: "ドラグ・クリシュナー", [TSUKU]: "ツクヨミドラグーン", [VAJRA]: "ヴァジュランガ", [BOLGAND]: "紅玉の巨龍ボルガンド",
        [SWORDM]: "ソードマスター・ドラゴン", [YASAKANI]: "ヤサカニ・ウィング", [TAKAMA]: "神焔の高天ヶ原", [TENKU]: "彷徨う天空寺院",
        [ADER]: "アーダーフレイム", [SENKEN]: "殲剣火炎陣", [SUSANO]: "天剣の覇王ジーク・スサノ・フリード",
        [RED]: "ロクケラトプス", [GORA]: "ゴラドン", [AIBARN]: "アイバーン", [SALA]: "火精サラマンダート", [METAL]: "メタルバーン",
        [DINO]: "ディノハウンド", [DIMET]: "ディメトロドロン", [PENTA]: "ペンタケラトップ", [MELT]: "火吹きメルト",
        [BRAVE_STAR]: "飛槍獣バリ・スター", [GRIP]: "グリプ・ハンズ", [SMOKE]: "スモークロコ", [BURST_MAGIC]: "双光気弾",
        [BURST_SPIRIT]: "皇牙獣キンタローグ・ベアー", [BURST_SEAL]: "封渦斬", [COFFIN]: "ダークコフィン", [FLAME]: "フレイムダンス",
        [BURST_ALT]: "双翼乱舞", [NEXUS_A]: "トパーズの流星", [NEXUS_B]: "鋼に覆われた高空",
    }
    for (const [id, name] of Object.entries(names)) assert(getCard(id).name === name, `${id} は ${name}`)
}

// ==== 場面テスト用の道具 ====
// 優先権が回っている側でフラッシュを閉じる。選択待ちが立ったらそこで止める
function flash(t: ScenarioCtx): void {
    while (t.state.pendingChoice === null && t.state.isFlashTiming && t.state.battle) {
        t.act(t.state.priorityPlayer === t.me ? "me" : "opp", { type: "pass" })
    }
}
function declare(t: ScenarioCtx, attacker: string, target?: string): void {
    t.act("me", { type: "attack", instanceId: t.id(attacker), ...(target === undefined ? {} : { targetSpiritInstanceId: t.id(target) }) })
}
// アタック宣言 → 相手がブロック（blocker 省略時はライフで受ける）→ バトル終了まで
function battle(t: ScenarioCtx, attacker: string, blocker?: string): void {
    declare(t, attacker)
    flash(t)
    if (t.state.pendingChoice !== null) return
    if (blocker === undefined) t.act("opp", { type: "takeLife" })
    else t.act("opp", { type: "block", instanceId: t.id(blocker) })
    flash(t)
}
function pendingOf(t: ScenarioCtx): Pending {
    const p = t.state.pendingChoice
    assert(p !== null, "選択待ちが立っている")
    if (p === null) throw new Error("選択待ちが無い")
    return p
}

// ==== 生の状態を使うテスト用の道具（scenario で開始盤面に置けないもの：合体・ターン開始・召喚の連鎖） ====
function rawGame(seed: string, turn: PlayerId, phase: "main" | "attack", interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turn
    s.priorityPlayer = turn
    s.phase = phase
    s.interactiveTargets = interactive
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.life = 5
        p.reserve = 10
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => RED)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
        p.burst = null
        p.burstSet = false
    }
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1, rested = false) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function setBurst(s: GameState, pid: PlayerId, cardId: string): void {
    s.players[pid].burst = cardId
    s.players[pid].burstSet = true
}
function ok(err: string | null, msg: string): void {
    assert(err === null, `${msg}${err === null ? "" : `（拒否: ${err}）`}`)
}
function rejected(err: string | null, msg: string): void {
    assert(err !== null, `${msg}（拒否されるはず）`)
}
function other(me: PlayerId): PlayerId {
    return me === "p1" ? "p2" : "p1"
}
function pend(s: GameState): Pending {
    const p = s.pendingChoice
    assert(p !== null, "選択待ちが立っている")
    if (p === null) throw new Error("選択待ちが無い")
    return p
}
function reply(s: GameState, action: GameAction): void {
    const p = pend(s)
    ok(act(s, p.pid, action), `選択待ち（${p.prompt}）に答えられる`)
}
// 選択待ちを順に答えて空にする。target は prefer の先頭から（選択済みは飛ばす）、確認（option）は yes、card は先頭。decline なら全部スキップ
function drain(s: GameState, o: { prefer?: string[]; forbid?: string[]; decline?: boolean; limit?: number } = {}): number {
    let n = 0
    const chosen = new Set<string>()
    while (s.pendingChoice !== null && n < (o.limit ?? 8)) {
        const p = s.pendingChoice
        n++
        if (o.decline === true) {
            reply(s, { type: "resolveChoice" })
            continue
        }
        if (p.kind === "target") {
            for (const f of o.forbid ?? []) assert(!p.candidates.includes(f), `候補に入らない（${p.prompt}）`)
            const id = (o.prefer ?? []).find((x) => !chosen.has(x) && p.candidates.includes(x))
            if (id === undefined && (o.prefer ?? []).length > 0 && p.optional) {
                reply(s, { type: "resolveChoice" })
                continue
            }
            const pick = id ?? p.candidates[0] ?? ""
            chosen.add(pick)
            reply(s, { type: "resolveChoice", instanceId: pick })
        } else if (p.kind === "card") {
            reply(s, { type: "resolveChoice", cardIndex: p.cardIndices?.[0] ?? 0 })
        } else {
            reply(s, { type: "resolveChoice", option: p.options?.[0] ?? "" })
        }
    }
    return n
}
function flashRaw(s: GameState): void {
    while (s.pendingChoice === null && s.isFlashTiming && s.battle) if (act(s, s.priorityPlayer, { type: "pass" })) break
}
function onField(s: GameState, pid: PlayerId, instanceId: string): boolean {
    return s.players[pid].field.spirits.some((x) => x.instanceId === instanceId)
}
function fieldHas(s: GameState, pid: PlayerId, cardId: string): boolean {
    return s.players[pid].field.spirits.some((x) => x.cardId === cardId)
}

// ============================================================
// BS17-001 バリ・バーン（1節：アタック時 → バトル終了時、このターンの間、自分のスピリット1体をBP+3000）
// ============================================================
console.log("=== 001-a: バトル終了時、自分のスピリット1体（選ぶ）をBP+3000する ===")
scenario({
    name: "001-a",
    start: { turn: "me", phase: "attack", interactive: true, me: { spirits: [{ card: BALI }, { card: RED }] }, opp: { spirits: [{ card: GORA }] } },
    steps(t) {
        battle(t, "バリ・バーン", "ゴラドン")
        const p = pendingOf(t)
        assert(p.pid === t.me, "選ぶのは自分")
        assert(p.candidates.includes(t.id("バリ・バーン")) && p.candidates.includes(t.id("ロクケラトプス")), "自分のスピリット2体が候補（自分自身も含む）")
        t.act("me", { type: "resolveChoice", instanceId: t.id("ロクケラトプス") })
    },
    expect: [
        "自分.バリ・バーン.疲労: false → true",
        "自分.ロクケラトプス.BP: 1000 → 4000",
        "相手.ゴラドン.場所: フィールド → なし",
        "相手.トラッシュ: なし → ゴラドン",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 001-b: 自分のスピリットが自分だけなら自分自身がBP+3000される ===")
scenario({
    name: "001-b",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: BALI }] }, opp: { spirits: [{ card: GORA }] } },
    steps(t) {
        battle(t, "バリ・バーン", "ゴラドン")
    },
    expect: [
        "自分.バリ・バーン.疲労: false → true",
        "自分.バリ・バーン.BP: 2000 → 5000",
        "相手.ゴラドン.場所: フィールド → なし",
        "相手.トラッシュ: なし → ゴラドン",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 001-c: 起きない：同じ場にいる別のスピリットがアタックしても発揮されない ===")
scenario({
    name: "001-c",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: BALI }, { card: RED }] }, opp: {} },
    steps(t) {
        battle(t, "ロクケラトプス")
    },
    expect: ["自分.ロクケラトプス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== 001-d: ブロックされずライフで受けた場合もバトル終了時は来る ===")
scenario({
    name: "001-d",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: BALI }] }, opp: {} },
    steps(t) {
        battle(t, "バリ・バーン")
    },
    expect: ["自分.バリ・バーン.疲労: false → true", "自分.バリ・バーン.BP: 2000 → 5000", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ============================================================
// BS17-002 フェンサー・ドラゴン（2節：ブロックできない／アタック時、自分のバーストをセットしている間BP+2000）
// ============================================================
console.log("=== 002-a: ブロックできない ===")
scenario({
    name: "002-a",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: FENCER }] }, opp: { spirits: [{ card: RED }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        flash(t)
        t.actRejected("me", { type: "block", instanceId: t.id("フェンサー・ドラゴン") })
    },
    expect: ["相手.ロクケラトプス.疲労: false → true"],
})
console.log("=== 002-b: アタック時、自分のバーストをセットしている間BP+2000 ===")
scenario({
    name: "002-b",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: FENCER }], burst: BURST_MAGIC }, opp: {} },
    steps(t) {
        declare(t, "フェンサー・ドラゴン")
    },
    expect: ["自分.フェンサー・ドラゴン.疲労: false → true", "自分.フェンサー・ドラゴン.BP: 3000 → 5000"],
})
console.log("=== 002-c: 起きない：バーストをセットしていなければ+されない ===")
scenario({
    name: "002-c",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: FENCER }] }, opp: {} },
    steps(t) {
        declare(t, "フェンサー・ドラゴン")
    },
    expect: ["自分.フェンサー・ドラゴン.疲労: false → true"],
})
console.log("=== 002-d: 起きない：相手がバーストをセットしていても自分の条件は満たさない ===")
scenario({
    name: "002-d",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: FENCER }] }, opp: { burst: BURST_MAGIC } },
    steps(t) {
        declare(t, "フェンサー・ドラゴン")
    },
    expect: ["自分.フェンサー・ドラゴン.疲労: false → true"],
})

// ============================================================
// BS17-003 アルジュナス（2節：相手の合体スピリットにブロックされたときBP+4000／Lv2･3 バーストをセットしているとき相手の合体スピリットを指定してアタックできる）
// ============================================================
function r003(me: PlayerId): void {
    const opp = other(me)
    const build = (o: { cores: number; burst: boolean; combined: boolean }) => {
        const s = rawGame(`003-${me}-${o.cores}-${o.burst}-${o.combined}`, opp, "main")
        const arj = put(s, me, ARJ, o.cores)
        if (o.burst) setBurst(s, me, BURST_MAGIC)
        const host = put(s, opp, MELT, 1)
        if (o.combined) {
            const brave = put(s, opp, BRAVE_STAR, 1)
            ok(act(s, opp, { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }), "相手が合体できる")
            assert(s.players[opp].field.combinedBraves.length === 1, "合体した")
        }
        s.turnPlayer = me
        s.priorityPlayer = me
        s.phase = "attack"
        return { s, arj, host }
    }
    // 節1：合体スピリットにブロックされたとき
    {
        const { s, arj, host } = build({ cores: 1, burst: false, combined: true })
        ok(act(s, me, { type: "attack", instanceId: arj.instanceId }), "アタックできる")
        flashRaw(s)
        ok(act(s, opp, { type: "block", instanceId: host.instanceId }), "合体スピリットでブロックできる")
        assert(effectiveBp(s, me, arj) === 7000, `003: 合体スピリットにブロックされたらBP+4000（3000→7000。実際 ${effectiveBp(s, me, arj)}）`)
    }
    {
        const { s, arj, host } = build({ cores: 1, burst: false, combined: false })
        ok(act(s, me, { type: "attack", instanceId: arj.instanceId }), "アタックできる")
        flashRaw(s)
        ok(act(s, opp, { type: "block", instanceId: host.instanceId }), "通常のスピリットでブロックできる")
        assert(effectiveBp(s, me, arj) === 3000, `003: 合体していない相手にブロックされてもBPは変わらない（実際 ${effectiveBp(s, me, arj)}）`)
    }
    // 節2：指定アタック
    {
        const { s, arj, host } = build({ cores: 3, burst: true, combined: true })
        ok(act(s, me, { type: "attack", instanceId: arj.instanceId, targetSpiritInstanceId: host.instanceId }), "003: Lv2・バーストあり・合体スピリット指定ならアタックできる")
    }
    {
        const { s, arj, host } = build({ cores: 3, burst: false, combined: true })
        rejected(act(s, me, { type: "attack", instanceId: arj.instanceId, targetSpiritInstanceId: host.instanceId }), "003: バーストが無ければ指定アタックできない")
    }
    {
        const { s, arj, host } = build({ cores: 1, burst: true, combined: true })
        rejected(act(s, me, { type: "attack", instanceId: arj.instanceId, targetSpiritInstanceId: host.instanceId }), "003: Lv1では指定アタックできない")
    }
    {
        const { s, arj, host } = build({ cores: 3, burst: true, combined: false })
        rejected(act(s, me, { type: "attack", instanceId: arj.instanceId, targetSpiritInstanceId: host.instanceId }), "003: 合体していないスピリットは指定できない")
    }
}
console.log("=== 003: 合体スピリットにブロックされたときBP+4000／指定アタック ===")
r003("p1")
r003("p2")

// ============================================================
// BS17-004 リュー・ラーダー（1節：自分のスタートステップ、バーストが無いとき、バースト効果を持つ自分のスピリット1体をバーストとしてセットできる）
// ============================================================
function run004(me: PlayerId, mode: "accept" | "decline" | "burstSet" | "noBurstSpirit") {
    const s = rawGame(`004-${me}-${mode}`, me, "main", mode !== "noBurstSpirit")
    put(s, me, RYU, 1)
    const burstSpirit = mode === "noBurstSpirit" ? null : put(s, me, BURST_SPIRIT, 2)
    const plain = put(s, me, RED, 1)
    if (mode === "burstSet") setBurst(s, me, BURST_MAGIC)
    runTurnStart(s)
    const asked = s.pendingChoice !== null
    if (burstSpirit !== null) drain(s, { prefer: [burstSpirit.instanceId], forbid: [plain.instanceId], decline: mode === "decline" })
    else drain(s)
    return { s, asked, burstSpirit, reserve: s.players[me].reserve }
}
function r004(me: PlayerId): void {
    const acc = run004(me, "accept")
    assert(acc.asked, "004: セットするか確認される（〜できる）")
    assert(acc.s.players[me].burst === BURST_SPIRIT && acc.s.players[me].burstSet, "004: バースト効果を持つスピリットがバーストとしてセットされる")
    assert(acc.burstSpirit !== null && !onField(acc.s, me, acc.burstSpirit.instanceId), "004: セットしたスピリットは場を離れる")
    const dec = run004(me, "decline")
    assert(dec.s.players[me].burst === null && dec.burstSpirit !== null && onField(dec.s, me, dec.burstSpirit.instanceId), "004: 断ればセットされず場に残る")
    assert(acc.reserve === dec.reserve + 2, `004: 乗っていたコア2個はリザーブへ（セット ${acc.reserve} / 断る ${dec.reserve}）`)
    const set = run004(me, "burstSet")
    assert(!set.asked && set.s.players[me].burst === BURST_MAGIC, "004: すでにバーストをセットしていれば何も起きない")
    assert(set.burstSpirit !== null && onField(set.s, me, set.burstSpirit.instanceId), "004: バーストをセットしていれば場のスピリットは動かない")
    const none = run004(me, "noBurstSpirit")
    assert(!none.asked && none.s.players[me].burst === null, "004: バースト効果を持つスピリットがいなければ何も起きない")
}
console.log("=== 004: スタートステップ、バーストが無いとき、バースト効果を持つスピリットをバーストとしてセットできる ===")
r004("p1")
r004("p2")

// ============================================================
// BS17-005 ドラグ・クリシュナー
//   節1 バースト：相手の召喚時発揮後 → 召喚する／節2 その後、バーストが無いとき手札のバースト効果持ち1枚をセットできる
//   節3 Lv2･3：バーストをセットしている間、覇皇／雄将の自分のスピリットがアタックしたとき1枚ドロー
// ============================================================
function run005(me: PlayerId, oppCard: string, hand: string[]) {
    const opp = other(me)
    const s = rawGame(`005-${me}-${oppCard}-${hand.join(",")}`, opp, "main")
    s.players[me].reserve = 10
    s.players[me].hand = [...hand]
    setBurst(s, me, KRISHNA)
    s.players[opp].hand = [oppCard]
    ok(act(s, opp, { type: "summon", handIndex: 0 }), "相手が召喚できる")
    let sawCard = false
    let n = 0
    while (s.pendingChoice !== null && n++ < 8) {
        const p = s.pendingChoice
        if (p.kind === "card") {
            sawCard = true
            assert(p.cardIndices?.includes(0) === true && p.cardIndices.includes(1) === false, "005: 候補はバースト効果を持つカード（手札0枚目）だけ")
            reply(s, { type: "resolveChoice", cardIndex: 0 })
        } else if (p.kind === "target") reply(s, { type: "resolveChoice", instanceId: p.candidates[0] ?? "" })
        else reply(s, { type: "resolveChoice", option: p.options?.[0] ?? "" })
    }
    return { s, sawCard }
}
function r005(me: PlayerId): void {
    const a = run005(me, GRIP, [BURST_MAGIC, RED])
    assert(fieldHas(a.s, me, KRISHNA), "005: 相手の召喚時発揮後、このスピリットカードが召喚される")
    assert(a.sawCard && a.s.players[me].burst === BURST_MAGIC && a.s.players[me].burstSet, "005: その後、手札のバースト効果持ち1枚がバーストにセットされる")
    assert(a.s.players[me].hand.length === 1 && a.s.players[me].hand[0] === RED, "005: セットしたカードだけ手札から減る")
    const b = run005(me, GRIP, [RED])
    assert(fieldHas(b.s, me, KRISHNA), "005: 召喚される")
    assert(!b.sawCard && b.s.players[me].burst === null, "005: 手札にバースト効果を持つカードが無ければセットは起きない")
    const c = run005(me, RED, [BURST_MAGIC, RED])
    assert(!fieldHas(c.s, me, KRISHNA) && c.s.players[me].burst === KRISHNA, "005: 召喚時効果の無いスピリットでは発動しない（バーストはセットされたまま）")
}
console.log("=== 005: バースト（相手の召喚時発揮後）→召喚→手札のバースト効果持ちをセット ===")
r005("p1")
r005("p2")

console.log("=== 005-d: Lv2、バーストあり、雄将がアタックしたとき1枚ドロー ===")
scenario({
    name: "005-d",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: KRISHNA, cores: 3 }, { card: RYU }], burst: BURST_MAGIC }, opp: {} },
    steps(t) {
        declare(t, "リュー・ラーダー")
    },
    expect: ["自分.リュー・ラーダー.疲労: false → true", "自分.手札: なし → ロクケラトプス", "自分.デッキ枚数: 40 → 39"],
})
console.log("=== 005-e: 覇皇である自分自身がアタックしても1枚ドロー ===")
scenario({
    name: "005-e",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: KRISHNA, cores: 3 }], burst: BURST_MAGIC }, opp: {} },
    steps(t) {
        declare(t, "ドラグ・クリシュナー")
    },
    expect: ["自分.ドラグ・クリシュナー.疲労: false → true", "自分.手札: なし → ロクケラトプス", "自分.デッキ枚数: 40 → 39"],
})
console.log("=== 005-f: 起きない：バーストをセットしていない ===")
scenario({
    name: "005-f",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: KRISHNA, cores: 3 }, { card: RYU }] }, opp: {} },
    steps(t) {
        declare(t, "リュー・ラーダー")
    },
    expect: ["自分.リュー・ラーダー.疲労: false → true"],
})
console.log("=== 005-g: 起きない：Lv1 ===")
scenario({
    name: "005-g",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: KRISHNA, cores: 1 }, { card: RYU }], burst: BURST_MAGIC }, opp: {} },
    steps(t) {
        declare(t, "リュー・ラーダー")
    },
    expect: ["自分.リュー・ラーダー.疲労: false → true"],
})
console.log("=== 005-h: 起きない：覇皇／雄将を持たないスピリットのアタック ===")
scenario({
    name: "005-h",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: KRISHNA, cores: 3 }, { card: RED }], burst: BURST_MAGIC }, opp: {} },
    steps(t) {
        declare(t, "ロクケラトプス")
    },
    expect: ["自分.ロクケラトプス.疲労: false → true"],
})
console.log("=== 005-i: 起きない：相手の雄将のアタック（自分の効果は自分のスピリットだけ） ===")
scenario({
    name: "005-i",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: KRISHNA, cores: 3 }], burst: BURST_MAGIC }, opp: { spirits: [{ card: RYU }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.リュー・ラーダー") })
    },
    expect: ["相手.リュー・ラーダー.疲労: false → true"],
})

// ============================================================
// BS17-006 ツクヨミドラグーン（1節：アタック時、デッキの上3枚をオープンできる。その中のバースト条件が「相手の召喚時発揮後」の1枚のバーストを発動できる。残りは破棄）
// ============================================================
const deckTop = (...top: string[]): string[] => [...top, ...Array.from({ length: 40 - top.length }, () => RED)]
console.log("=== 006-a: 3枚オープン、条件の合うバースト1枚を発動、残りは破棄 ===")
scenario({
    name: "006-a",
    start: { interactive: true, turn: "me", phase: "attack", me: { reserve: 0, spirits: [{ card: TSUKU }], deck: deckTop(BURST_ALT, BURST_SEAL) }, opp: {} },
    steps(t) {
        declare(t, "ツクヨミドラグーン")
        const ask = pendingOf(t)
        assert(ask.pid === t.me, "006: オープンするかは自分が決める（〜できる）")
        t.act("me", { type: "resolveChoice", option: ask.options?.[0] ?? "" })
        const pick = pendingOf(t)
        assert(pick.kind === "card", "006: 発動するカードを選ぶ")
        assert(pick.cardIndices?.length === 2, "006: 候補は条件の合う2枚だけ（ロクケラトプスは入らない）")
        t.act("me", { type: "resolveChoice", cardIndex: pick.cardIndices?.find((i) => t.state.revealedCards?.cardIds[i] === BURST_SEAL) ?? -1 })
        for (let i = 0; i < 6 && t.state.pendingChoice !== null; i++) t.act("me", { type: "resolveChoice" }) // バーストの後ろにあるコスト支払いは払わない
        assert(playerHas(t.state, t.opp, "cantUseHandCardsForPid"), "006: 封渦斬のバースト効果で相手はマジックを使用できない")
    },
    expect: [
        "自分.ツクヨミドラグーン.疲労: false → true",
        "自分.デッキ枚数: 40 → 37",
        "自分.トラッシュ: なし → ロクケラトプス、双翼乱舞、封渦斬",
    ],
})
console.log("=== 006-b: 発動しないなら、オープンした3枚すべて破棄 ===")
scenario({
    name: "006-b",
    start: { interactive: true, turn: "me", phase: "attack", me: { reserve: 0, spirits: [{ card: TSUKU }], deck: deckTop(BURST_ALT, BURST_SEAL) }, opp: {} },
    steps(t) {
        declare(t, "ツクヨミドラグーン")
        t.act("me", { type: "resolveChoice", option: pendingOf(t).options?.[0] ?? "" })
        t.act("me", { type: "resolveChoice" }) // 発動しない
        for (let i = 0; i < 6 && t.state.pendingChoice !== null; i++) t.act("me", { type: "resolveChoice" })
        assert(!playerHas(t.state, t.opp, "cantUseHandCardsForPid"), "006: 発動していないので相手はマジックを使用できる")
    },
    expect: [
        "自分.ツクヨミドラグーン.疲労: false → true",
        "自分.デッキ枚数: 40 → 37",
        "自分.トラッシュ: なし → ロクケラトプス、双翼乱舞、封渦斬",
    ],
})
console.log("=== 006-c: 条件の合うカードが無ければ3枚とも破棄（条件違いのバーストは発動できない） ===")
scenario({
    name: "006-c",
    start: { interactive: true, turn: "me", phase: "attack", me: { reserve: 0, spirits: [{ card: TSUKU }], deck: deckTop(BURST_MAGIC) }, opp: {} },
    steps(t) {
        declare(t, "ツクヨミドラグーン")
        t.act("me", { type: "resolveChoice", option: pendingOf(t).options?.[0] ?? "" })
        while (t.state.pendingChoice !== null) {
            const p = pendingOf(t)
            assert(p.kind !== "card" || (p.cardIndices ?? []).length === 0, "006: 双光気弾（条件違い）は候補にならない")
            t.act("me", { type: "resolveChoice" })
        }
    },
    expect: [
        "自分.ツクヨミドラグーン.疲労: false → true",
        "自分.デッキ枚数: 40 → 37",
        "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス、双光気弾",
    ],
})
console.log("=== 006-d: 起きない：オープンしないと選べばデッキもトラッシュも変わらない ===")
scenario({
    name: "006-d",
    start: { interactive: true, turn: "me", phase: "attack", me: { reserve: 0, spirits: [{ card: TSUKU }], deck: deckTop(BURST_SEAL) }, opp: {} },
    steps(t) {
        declare(t, "ツクヨミドラグーン")
        t.act("me", { type: "resolveChoice" })
    },
    expect: ["自分.ツクヨミドラグーン.疲労: false → true"],
})

// ============================================================
// BS17-008 紅玉の巨龍ボルガンド（1節：フラッシュ【覚醒】自分のスピリットのコアを好きなだけこのスピリットに置く）
// ============================================================
console.log("=== 008-a: フラッシュで自分の他のスピリットのコア2個をこのスピリットへ ===")
scenario({
    name: "008-a",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: BOLGAND }, { card: RED, label: "ドナー", cores: 3 }] },
        opp: { spirits: [{ card: RED, label: "攻め手" }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("攻め手") })
        if (t.state.priorityPlayer !== t.me) t.act("opp", { type: "pass" })
        t.act("me", { type: "awaken", instanceId: t.id("紅玉の巨龍ボルガンド"), fromInstanceId: t.id("ドナー"), count: 2 })
    },
    expect: [
        "相手.攻め手.疲労: false → true",
        "自分.紅玉の巨龍ボルガンド.コア: 1 → 3",
        "自分.紅玉の巨龍ボルガンド.Lv: 1 → 2",
        "自分.紅玉の巨龍ボルガンド.BP: 4000 → 8000",
        "自分.ドナー.コア: 3 → 1",
        "自分.ドナー.Lv: 3 → 1",
        "自分.ドナー.BP: 4000 → 1000",
    ],
})
console.log("=== 008-b: 起きない：相手のスピリットのコアは動かせない ===")
scenario({
    name: "008-b",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: BOLGAND }] },
        opp: { spirits: [{ card: RED, label: "攻め手", cores: 3 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("攻め手") })
        if (t.state.priorityPlayer !== t.me) t.act("opp", { type: "pass" })
        t.actRejected("me", { type: "awaken", instanceId: t.id("紅玉の巨龍ボルガンド"), fromInstanceId: t.id("攻め手"), count: 1 })
    },
    expect: ["相手.攻め手.疲労: false → true"],
})

// ============================================================
// BS17-009 ソードマスター・ドラゴン
//   節1 全Lv【激突】：アタック時、相手は可能ならば必ずブロック
//   節2 Lv2･3：BPを比べ相手のスピリットだけを破壊したとき、上まわったBP3000につき相手のライフのコア1個を相手のリザーブへ（上限3個）
//   節3 Lv3：アタック時、BP+3000
// ============================================================
console.log("=== 009-a: 【激突】相手は可能ならばブロックしなければならない（ライフで受けられない） ===")
scenario({
    name: "009-a",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: SWORDM }] }, opp: { spirits: [{ card: RED }] } },
    steps(t) {
        declare(t, "ソードマスター・ドラゴン")
        flash(t)
        t.actRejected("opp", { type: "takeLife" })
    },
    expect: ["自分.ソードマスター・ドラゴン.疲労: false → true"],
})
console.log("=== 009-b: 起きない：ブロックできるスピリットがいなければライフで受けられる ===")
scenario({
    name: "009-b",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: SWORDM }] }, opp: { spirits: [{ card: RED, rested: true }] } },
    steps(t) {
        battle(t, "ソードマスター・ドラゴン")
    },
    expect: ["自分.ソードマスター・ドラゴン.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
console.log("=== 009-c: Lv2、BP7000で1000のスピリットだけを破壊→差6000＝2個 ===")
scenario({
    name: "009-c",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: SWORDM, cores: 3 }] }, opp: { spirits: [{ card: GORA }] } },
    steps(t) {
        battle(t, "ソードマスター・ドラゴン", "ゴラドン")
    },
    expect: [
        "自分.ソードマスター・ドラゴン.疲労: false → true",
        "相手.ゴラドン.場所: フィールド → なし",
        "相手.トラッシュ: なし → ゴラドン",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 13",
    ],
})
console.log("=== 009-d: 差が3000未満の端数は切り捨て（Lv2 7000 対 2000＝差5000＝1個） ===")
scenario({
    name: "009-d",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: SWORDM, cores: 3 }] }, opp: { spirits: [{ card: AIBARN }] } },
    steps(t) {
        battle(t, "ソードマスター・ドラゴン", "アイバーン")
    },
    expect: [
        "自分.ソードマスター・ドラゴン.疲労: false → true",
        "相手.アイバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → アイバーン",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})
console.log("=== 009-e: Lv3はアタック時BP+3000（9000→12000）。差11000＝3個 ===")
scenario({
    name: "009-e",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: SWORDM, cores: 5 }] }, opp: { spirits: [{ card: GORA }] } },
    steps(t) {
        battle(t, "ソードマスター・ドラゴン", "ゴラドン")
    },
    expect: [
        "自分.ソードマスター・ドラゴン.疲労: false → true",
        "相手.ゴラドン.場所: フィールド → なし",
        "相手.トラッシュ: なし → ゴラドン",
        "相手.ライフ: 5 → 2",
        "相手.リザーブ: 10 → 14",
    ],
})
console.log("=== 009-f: 起きない：Lv1 は相手のスピリットだけを破壊してもライフのコアは動かない ===")
scenario({
    name: "009-f",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: SWORDM, cores: 1 }] }, opp: { spirits: [{ card: GORA }] } },
    steps(t) {
        battle(t, "ソードマスター・ドラゴン", "ゴラドン")
    },
    expect: [
        "自分.ソードマスター・ドラゴン.疲労: false → true",
        "相手.ゴラドン.場所: フィールド → なし",
        "相手.トラッシュ: なし → ゴラドン",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 009-g: 起きない：相手のスピリットだけでなく自分も破壊された（BP同値） ===")
scenario({
    name: "009-g",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: SWORDM, cores: 3 }] }, opp: { spirits: [{ card: PENTA, cores: 2 }] } },
    steps(t) {
        battle(t, "ソードマスター・ドラゴン", "ペンタケラトップ")
    },
    expect: [
        "自分.ソードマスター・ドラゴン.場所: フィールド → なし",
        "自分.トラッシュ: なし → ソードマスター・ドラゴン",
        "自分.リザーブ: 10 → 13",
        "相手.ペンタケラトップ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ペンタケラトップ",
        "相手.リザーブ: 10 → 12",
    ],
})

// ============================================================
// BS17-055 ヤサカニ・ウィング（1節：召喚時、BP合計4000まで相手のスピリットを好きなだけ破壊。自分の[ジーク・スサノ・フリード]がいるときは、そのかわりに7000まで）
// ============================================================
function r055(me: PlayerId, withSusano: boolean) {
    const opp = other(me)
    const s = rawGame(`055-${me}-${withSusano}`, me, "main", true)
    s.players[me].hand = [YASAKANI]
    if (withSusano) put(s, me, SUSANO, 1)
    const a = put(s, opp, AIBARN, 1) // BP2000
    const b = put(s, opp, SALA, 1) // BP2000
    const c = put(s, opp, METAL, 1) // BP3000
    ok(act(s, me, { type: "summon", handIndex: 0 }), "ブレイヴを召喚できる")
    return { s, a, b, c }
}
function selectSeq(s: GameState, ids: string[], mustExclude: (string | null)[] = []): void {
    ids.forEach((id, i) => {
        const p = pend(s)
        assert(p.candidates.includes(id), "055: 選べる候補に入っている")
        const ex = mustExclude[i]
        if (ex !== undefined && ex !== null) assert(!p.candidates.includes(ex), "055: 合計BPが上限を超える個体は候補から外れる")
        reply(s, { type: "resolveChoice", instanceId: id })
    })
    if (s.pendingChoice !== null) reply(s, { type: "resolveChoice" }) // 選び終えて確定
    assert(s.pendingChoice === null, "055: 選択が終わった")
}
function t055(me: PlayerId): void {
    const opp = other(me)
    {
        const { s, a, b, c } = r055(me, false)
        const p = pend(s)
        assert(p.pid === me && p.candidates.length === 3, "055: 3体とも最初は候補（単体のBPは4000以下）")
        // 3000を選ぶと残り1000なので2000の2体は選べない
        const pick = pend(s)
        void pick
        ok(act(s, me, { type: "resolveChoice", instanceId: c.instanceId }), "055: 選べる")
        const after = s.pendingChoice
        if (after !== null) {
            assert(!after.candidates.includes(a.instanceId) && !after.candidates.includes(b.instanceId), "055: 合計4000を超える個体は候補から外れる")
            reply(s, { type: "resolveChoice" })
        }
        assert(s.pendingChoice === null, "055: 選択が終わった")
        assert(!onField(s, opp, c.instanceId) && onField(s, opp, a.instanceId) && onField(s, opp, b.instanceId), "055: 3000の1体だけ破壊（合計4000まで）")
    }
    {
        const { s, a, b, c } = r055(me, false)
        selectSeq(s, [a.instanceId, b.instanceId], [null, c.instanceId])
        assert(!onField(s, opp, a.instanceId) && !onField(s, opp, b.instanceId) && onField(s, opp, c.instanceId), "055: 2000＋2000で合計4000ちょうどまで選べる")
    }
    {
        const { s, a, b, c } = r055(me, true)
        selectSeq(s, [c.instanceId, a.instanceId, b.instanceId])
        assert(!onField(s, opp, a.instanceId) && !onField(s, opp, b.instanceId) && !onField(s, opp, c.instanceId), "055: ジーク・スサノ・フリードがいるときは合計7000まで（3体とも破壊）")
    }
}
console.log("=== 055: 召喚時、BP合計4000まで（ジーク・スサノ・フリードがいれば7000まで）好きなだけ破壊 ===")
t055("p1")
t055("p2")

// ============================================================
// BS17-061 神焔の高天ヶ原
//   節1 Lv1･2：覇皇の自分のスピリットがターンの最初にアタックするとき、相手のスピリット1体を指定してアタックできる
//   節2 Lv2：覇皇の自分の赤のスピリットが相手によって破壊されたとき、ライフのコア1個をボイドに置くことで、回復状態で残す
// ============================================================
function r061attack(me: PlayerId, o: { nexusCores: number | null; attacker: string; secondAttack: boolean }): string | null {
    const opp = other(me)
    const s = rawGame(`061-${me}-${o.nexusCores}-${o.attacker}-${o.secondAttack}`, me, "attack")
    if (o.nexusCores !== null) putNexus(s, me, TAKAMA, o.nexusCores)
    const atk = put(s, me, o.attacker, 1)
    const target = put(s, opp, RED, 1)
    if (o.secondAttack) {
        const first = put(s, me, SUSANO, 1)
        ok(act(s, me, { type: "attack", instanceId: first.instanceId }), "最初のアタック")
        flashRaw(s)
        ok(act(s, opp, { type: "takeLife" }), "ライフで受ける")
        flashRaw(s)
        drain(s)
    }
    return act(s, me, { type: "attack", instanceId: atk.instanceId, targetSpiritInstanceId: target.instanceId })
}
function t061(me: PlayerId): void {
    assert(r061attack(me, { nexusCores: 0, attacker: SUSANO, secondAttack: false }) === null, "061: Lv1、ターンの最初に覇皇がアタックするとき相手のスピリットを指定できる")
    assert(r061attack(me, { nexusCores: 3, attacker: SUSANO, secondAttack: false }) === null, "061: Lv2でも指定できる")
    rejected(r061attack(me, { nexusCores: 0, attacker: RYU, secondAttack: false }), "061: 覇皇を持たないスピリット（雄将）は指定できない")
    rejected(r061attack(me, { nexusCores: 0, attacker: KRISHNA, secondAttack: true }), "061: ターンの最初のアタックでなければ指定できない")
    rejected(r061attack(me, { nexusCores: null, attacker: SUSANO, secondAttack: false }), "061: ネクサスが無ければ指定できない")
}
console.log("=== 061: 覇皇がターンの最初にアタックするとき、相手のスピリットを指定してアタックできる ===")
t061("p1")
t061("p2")

const reviveStart = (nexusCores: number, spirit: string) => ({
    interactive: true,
    turn: "opp" as const,
    phase: "main" as const,
    me: { spirits: [{ card: spirit, rested: true }], nexuses: [{ card: TAKAMA, cores: nexusCores }] },
    opp: { hand: [COFFIN] },
})
console.log("=== 061-b: Lv2、覇皇の赤が相手に破壊されるとき、ライフ1個をボイドへ払えば回復状態で残る ===")
scenario({
    name: "061-b",
    start: reviveStart(3, SUSANO),
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id(getCard(SUSANO).name) })
        t.closeFlash()
        const p = pendingOf(t)
        assert(p.pid === t.me, "061: 払うかは自分が決める（〜ことで）")
        t.act("me", { type: "resolveChoice", option: p.options?.[0] ?? "" })
        t.closeFlash()
    },
    expect: [
        "相手.手札: ダークコフィン → なし",
        "相手.トラッシュ: なし → ダークコフィン",
        "相手.リザーブ: 10 → 3",
        "相手.トラッシュのコア: 0 → 7",
        "自分.ライフ: 5 → 4",
        "自分.天剣の覇王ジーク・スサノ・フリード.疲労: true → false",
    ],
})
console.log("=== 061-c: 払わないと選べば通常どおり破壊される ===")
scenario({
    name: "061-c",
    start: reviveStart(3, SUSANO),
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id(getCard(SUSANO).name) })
        t.closeFlash()
        if (t.state.pendingChoice !== null) t.act("me", { type: "resolveChoice" })
        t.closeFlash()
    },
    expect: [
        "相手.手札: ダークコフィン → なし",
        "相手.トラッシュ: なし → ダークコフィン",
        "相手.リザーブ: 10 → 3",
        "相手.トラッシュのコア: 0 → 7",
        "自分.天剣の覇王ジーク・スサノ・フリード.場所: フィールド → なし",
        "自分.トラッシュ: なし → 天剣の覇王ジーク・スサノ・フリード",
        "自分.リザーブ: 10 → 11",
    ],
})
console.log("=== 061-d: 起きない：Lv1（コア0）では破壊は止まらない ===")
scenario({
    name: "061-d",
    start: reviveStart(0, SUSANO),
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id(getCard(SUSANO).name) })
        t.closeFlash()
        assert(t.state.pendingChoice === null, "061: Lv1 では確認も出ない")
    },
    expect: [
        "相手.手札: ダークコフィン → なし",
        "相手.トラッシュ: なし → ダークコフィン",
        "相手.リザーブ: 10 → 3",
        "相手.トラッシュのコア: 0 → 7",
        "自分.天剣の覇王ジーク・スサノ・フリード.場所: フィールド → なし",
        "自分.トラッシュ: なし → 天剣の覇王ジーク・スサノ・フリード",
        "自分.リザーブ: 10 → 11",
    ],
})
console.log("=== 061-e: 起きない：覇皇を持たない赤のスピリット（雄将）は残らない ===")
scenario({
    name: "061-e",
    start: reviveStart(3, RYU),
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id(getCard(RYU).name) })
        t.closeFlash()
        assert(t.state.pendingChoice === null, "061: 覇皇でなければ確認も出ない")
    },
    expect: [
        "相手.手札: ダークコフィン → なし",
        "相手.トラッシュ: なし → ダークコフィン",
        "相手.リザーブ: 10 → 3",
        "相手.トラッシュのコア: 0 → 7",
        "自分.リュー・ラーダー.場所: フィールド → なし",
        "自分.トラッシュ: なし → リュー・ラーダー",
        "自分.リザーブ: 10 → 11",
    ],
})

// ============================================================
// BS17-062 彷徨う天空寺院（1節：本来のコストが8以上のスピリットを召喚するとき、このネクサスを疲労させることでリザーブから2コストまでを支払ったものとして扱う。ターンに1回）
// ============================================================
function run062(me: PlayerId, o: { nexus: boolean; card: string; assist: boolean }) {
    const s = rawGame(`062-${me}-${o.nexus}-${o.card}-${o.assist}`, me, "main", true)
    s.players[me].reserve = 20
    s.players[me].hand = [o.card]
    const nexus = o.nexus ? putNexus(s, me, TENKU, 0) : null
    // 肩代わりは summon の shinsokuAssistInstanceIds で明示する（確認の選択待ちは立たない）。ネクサス自身の赤シンボル軽減(2)は肩代わりと別に掛かる
    const err = act(s, me, { type: "summon", handIndex: 0, ...(nexus !== null && o.assist ? { shinsokuAssistInstanceIds: [nexus.instanceId] } : {}) })
    drain(s)
    return { err, reserve: s.players[me].reserve, rested: nexus?.isRested ?? false, onField: fieldHas(s, me, o.card) }
}
function t062(me: PlayerId): void {
    const base = run062(me, { nexus: false, card: SWORDM, assist: false })
    assert(base.onField, "062: 比較用の召喚が成立する")
    const noAssist = run062(me, { nexus: true, card: SWORDM, assist: false })
    assert(!noAssist.rested && noAssist.onField, "062: 使わなければネクサスは疲労しない")
    const use = run062(me, { nexus: true, card: SWORDM, assist: true })
    assert(use.err === null && use.rested, "062: 本来のコスト8のスピリットの召喚で使える（ネクサスが疲労する）")
    assert(use.reserve === noAssist.reserve + 2, `062: リザーブから2コストぶん払ったものとして扱う（使わない ${noAssist.reserve} / 使う ${use.reserve}）`)
    const no7 = run062(me, { nexus: true, card: BOLGAND, assist: false })
    const cost7 = run062(me, { nexus: true, card: BOLGAND, assist: true })
    assert(cost7.err !== null || (!cost7.rested && cost7.reserve === no7.reserve), "062: 本来のコストが7なら使えない")
    const x01No = run062(me, { nexus: true, card: SUSANO, assist: false })
    const x01Use = run062(me, { nexus: true, card: SUSANO, assist: true })
    assert(x01Use.reserve === x01No.reserve + 2 && x01Use.rested, "062: 本来のコスト9でも2コストぶん")
}
console.log("=== 062: 本来のコスト8以上のスピリットの召喚で、疲労させてリザーブ2コストぶんを払ったものとして扱う ===")
t062("p1")
t062("p2")

// ============================================================
// BS17-073 アーダーフレイム（フラッシュ：BP4000以下の相手のスピリット1体を破壊。破壊したスピリットの破壊時効果は発揮されない）
// ============================================================
console.log("=== 073-a: BP4000以下の相手のスピリットを破壊、破壊時効果は発揮されない ===")
scenario({
    name: "073-a",
    start: { turn: "me", me: { hand: [ADER] }, opp: { spirits: [{ card: SMOKE, cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("スモークロコ") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: アーダーフレイム → なし",
        "自分.トラッシュ: なし → アーダーフレイム",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "相手.スモークロコ.場所: フィールド → なし",
        "相手.トラッシュ: なし → スモークロコ",
        "相手.リザーブ: 10 → 12",
    ],
})
console.log("=== 073-b: 対照：別のマジックで破壊すると破壊時効果（ドロー）が発揮される ===")
scenario({
    name: "073-b",
    start: { turn: "me", me: { hand: [FLAME] }, opp: { spirits: [{ card: SMOKE, cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("スモークロコ") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: フレイムダンス → なし",
        "自分.トラッシュ: なし → フレイムダンス",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "相手.スモークロコ.場所: フィールド → なし",
        "相手.トラッシュ: なし → スモークロコ",
        "相手.リザーブ: 10 → 12",
        "相手.手札: なし → ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
    ],
})
console.log("=== 073-c: BP4000ちょうどは対象になる ===")
scenario({
    name: "073-c",
    start: { turn: "me", me: { hand: [ADER] }, opp: { spirits: [{ card: DINO, cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ディノハウンド") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: アーダーフレイム → なし",
        "自分.トラッシュ: なし → アーダーフレイム",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "相手.ディノハウンド.場所: フィールド → なし",
        "相手.トラッシュ: なし → ディノハウンド",
        "相手.リザーブ: 10 → 12",
    ],
})
console.log("=== 073-d: 起きない：BP5000は対象にできない／自分のスピリットも対象にできない ===")
scenario({
    name: "073-d",
    start: { interactive: true, turn: "me", me: { hand: [ADER], spirits: [{ card: GORA }] }, opp: { spirits: [{ card: DIMET, cores: 2 }] } },
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ディメトロドロン") })
    },
    expect: [],
})
scenario({
    name: "073-e",
    start: { interactive: true, turn: "me", me: { hand: [ADER], spirits: [{ card: GORA }] }, opp: { spirits: [{ card: DIMET, cores: 2 }] } },
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ゴラドン") })
    },
    expect: [],
})

// ============================================================
// BS17-074 殲剣火炎陣
//   節1 バースト（相手の召喚時発揮後）：相手のネクサス1つを指定→同名の相手のネクサスすべてを破壊
//   節2 その後コストを支払うことで、フラッシュ効果を発揮
//   節3 フラッシュ：同名2体以上の相手のスピリット1体を指定→同名のスピリットすべてを破壊
// ============================================================
console.log("=== 074-a: フラッシュ。同名2体以上の相手のスピリットを指定→同名すべて破壊（単体は指定できない） ===")
scenario({
    name: "074-a",
    start: {
        turn: "me",
        me: { hand: [SENKEN], spirits: [{ card: GORA, label: "自軍" }] },
        opp: { spirits: [{ card: RED, label: "ロクA" }, { card: RED, label: "ロクB" }, { card: GORA, label: "ゴラ" }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロクA") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: 殲剣火炎陣 → なし",
        "自分.トラッシュ: なし → 殲剣火炎陣",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "相手.ロクA.場所: フィールド → なし",
        "相手.ロクB.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.リザーブ: 10 → 12",
    ],
})
scenario({
    name: "074-a2",
    start: {
        interactive: true,
        turn: "me",
        me: { hand: [SENKEN], spirits: [{ card: GORA, label: "自軍" }] },
        opp: { spirits: [{ card: RED, label: "ロクA" }, { card: RED, label: "ロクB" }, { card: GORA, label: "ゴラ" }] },
    },
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ゴラ") })
    },
    expect: [],
})
scenario({
    name: "074-a3",
    start: {
        interactive: true,
        turn: "me",
        me: { hand: [SENKEN], spirits: [{ card: GORA, label: "自軍" }] },
        opp: { spirits: [{ card: RED, label: "ロクA" }, { card: RED, label: "ロクB" }, { card: GORA, label: "ゴラ" }] },
    },
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("自軍") })
    },
    expect: [],
})
console.log("=== 074-b: 起きない：同名が2体以上いなければ使えない ===")
scenario({
    name: "074-b",
    start: { interactive: true, turn: "me", me: { hand: [SENKEN] }, opp: { spirits: [{ card: RED, label: "ロク" }, { card: GORA, label: "ゴラ" }] } },
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロク") })
        t.actRejected("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ゴラ") })
    },
    expect: [],
})
function r074burst(me: PlayerId, pay: boolean): void {
    const opp = other(me)
    const s = rawGame(`074-${me}-${pay}`, opp, "main", true)
    setBurst(s, me, SENKEN)
    s.players[opp].hand = [GRIP]
    const n1a = putNexus(s, opp, NEXUS_A)
    const n1b = putNexus(s, opp, NEXUS_A)
    const n2 = putNexus(s, opp, NEXUS_B)
    const r1 = put(s, opp, RED, 1)
    const r2 = put(s, opp, RED, 1)
    ok(act(s, opp, { type: "summon", handIndex: 0 }), "相手が召喚時効果を持つスピリットを召喚できる")
    let confirms = 0
    let n = 0
    while (s.pendingChoice !== null && n++ < 10) {
        const p = s.pendingChoice
        if (p.kind === "target") {
            const prefer = [n1a.instanceId, r1.instanceId].find((x) => p.candidates.includes(x))
            reply(s, { type: "resolveChoice", instanceId: prefer ?? p.candidates[0] ?? "" })
        } else if (p.kind === "option" && p.confirm === true) {
            confirms++
            if (confirms === 1 || pay) reply(s, { type: "resolveChoice", option: p.options?.[0] ?? "" })
            else reply(s, { type: "resolveChoice" })
        } else if (p.kind === "option") {
            // 「カード名を1つ指定」：ネクサスの名前（1回目）→スピリットの名前（2回目）
            const want = [getCard(NEXUS_A).name, getCard(RED).name].find((x) => (p.options ?? []).includes(x))
            reply(s, { type: "resolveChoice", option: want ?? p.options?.[0] ?? "" })
        } else reply(s, { type: "resolveChoice" })
    }
    const nexusLeft = s.players[opp].field.nexuses.map((x) => x.instanceId)
    assert(!nexusLeft.includes(n1a.instanceId) && !nexusLeft.includes(n1b.instanceId), "074: 指定したネクサスと同名の相手のネクサスすべてが破壊される")
    assert(nexusLeft.includes(n2.instanceId), "074: 同名でないネクサスは残る")
    if (pay) assert(!onField(s, opp, r1.instanceId) && !onField(s, opp, r2.instanceId), "074: コストを支払えばフラッシュ効果で同名スピリットもすべて破壊される")
    else assert(onField(s, opp, r1.instanceId) && onField(s, opp, r2.instanceId), "074: 支払わなければフラッシュ効果は発揮されない")
    assert(s.players[me].trashCards.includes(SENKEN) && s.players[me].burst === null, "074: 使ったバーストはトラッシュへ")
}
console.log("=== 074-c: バースト（相手の召喚時発揮後）：同名ネクサスすべて破壊／その後コストを払えばフラッシュ効果 ===")
r074burst("p1", false)
r074burst("p1", true)
r074burst("p2", false)
r074burst("p2", true)

// ============================================================
// BS17-X01 天剣の覇王ジーク・スサノ・フリード
//   節1 バースト（自分のライフ減少後）：ライフが3以下のとき、自分の赤のスピリット1体につきBP6000以下の相手のスピリット1体を破壊。この効果発揮後、召喚する
//   節2 Lv2-4：アタック時 BP+10000
//   節3 Lv3-4：バーストをセットしている間、赤のシンボル1つを追加
// ============================================================
function runX01burst(me: PlayerId, life: number) {
    const opp = other(me)
    const s = rawGame(`X01-${me}-${life}`, opp, "attack", true)
    s.players[me].life = life
    s.players[me].reserve = 20
    setBurst(s, me, SUSANO)
    put(s, me, RED, 1)
    put(s, me, RED, 1)
    const p0 = put(s, opp, GORA, 1) // 攻撃側
    const q = put(s, opp, SALA, 1)
    const sa = put(s, opp, AIBARN, 1)
    const big = put(s, opp, METAL, 8) // BP8000
    ok(act(s, opp, { type: "attack", instanceId: p0.instanceId }), "相手がアタックできる")
    flashRaw(s)
    ok(act(s, me, { type: "takeLife" }), "ライフで受ける")
    let n = 0
    while (s.pendingChoice !== null && n++ < 10) {
        const p = s.pendingChoice
        if (p.kind === "target") {
            assert(!p.candidates.includes(big.instanceId), "X01: BP6000を超える個体は候補にならない")
            const prefer = [q.instanceId, sa.instanceId].find((x) => p.candidates.includes(x) && !(s.players[opp].field.spirits.every((y) => y.instanceId !== x)))
            reply(s, { type: "resolveChoice", instanceId: prefer ?? p.candidates[0] ?? "" })
        } else if (p.kind === "option") reply(s, { type: "resolveChoice", option: p.options?.[0] ?? "" })
        else reply(s, { type: "resolveChoice" })
    }
    return { s, p0, q, sa, big }
}
function tX01(me: PlayerId): void {
    const opp = other(me)
    {
        const { s, q, sa, big } = runX01burst(me, 4)
        assert(s.players[me].life === 3, "X01: ライフは3に減る")
        assert(!onField(s, opp, q.instanceId) && !onField(s, opp, sa.instanceId), "X01: ライフが3以下、赤のスピリット2体につきBP6000以下を2体破壊")
        assert(onField(s, opp, big.instanceId), "X01: BP6000を超える個体は破壊されない")
        assert(fieldHas(s, me, SUSANO), "X01: この効果発揮後、このスピリットカードが召喚される")
    }
    {
        const { s, p0, q, sa, big } = runX01burst(me, 5)
        assert(s.players[me].life === 4, "X01: ライフは4に減る")
        assert([p0, q, sa, big].every((x) => onField(s, opp, x.instanceId)), "X01: ライフが4なら何も破壊されない")
        assert(!fieldHas(s, me, SUSANO), "X01: 条件を満たさなければ召喚もされない（条件はこの効果発揮後まで掛かる）")
    }
}
console.log("=== X01-a: バースト（自分のライフ減少後）：ライフ3以下で赤のスピリット1体につき破壊→召喚 ===")
tX01("p1")
tX01("p2")

console.log("=== X01-b: Lv2、アタック時BP+10000 ===")
scenario({
    name: "X01-b",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: SUSANO, cores: 3 }] }, opp: {} },
    steps(t) {
        declare(t, "天剣の覇王ジーク・スサノ・フリード")
    },
    expect: ["自分.天剣の覇王ジーク・スサノ・フリード.疲労: false → true", "自分.天剣の覇王ジーク・スサノ・フリード.BP: 10000 → 20000"],
})
console.log("=== X01-c: 起きない：Lv1 ===")
scenario({
    name: "X01-c",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: SUSANO, cores: 1 }] }, opp: {} },
    steps(t) {
        declare(t, "天剣の覇王ジーク・スサノ・フリード")
    },
    expect: ["自分.天剣の覇王ジーク・スサノ・フリード.疲労: false → true"],
})
// 赤のシンボルが1つ増えたかは、赤のスピリットを召喚するときの軽減（赤1シンボルにつき-1）で見る
function summonReserve(me: PlayerId, susanoCores: number, burst: boolean): number {
    const s = rawGame(`X01sym-${me}-${susanoCores}-${burst}`, me, "main")
    s.players[me].reserve = 20
    s.players[me].hand = [PENTA]
    put(s, me, SUSANO, susanoCores)
    if (burst) setBurst(s, me, BURST_MAGIC)
    refreshLevelAsOverrides(s) // 継続のシンボル追加はバーストをセットした後に再計算させる
    ok(act(s, me, { type: "summon", handIndex: 0 }), "ペンタケラトップを召喚できる")
    drain(s)
    assert(fieldHas(s, me, PENTA), "召喚できた")
    return s.players[me].reserve
}
function tX01symbol(me: PlayerId): void {
    const lv3Burst = summonReserve(me, 5, true)
    const lv3Plain = summonReserve(me, 5, false)
    const lv2Burst = summonReserve(me, 3, true)
    assert(lv3Burst === lv3Plain + 1, `X01: Lv3でバーストをセットしていれば赤のシンボルが1つ増え、軽減が1大きい（なし ${lv3Plain} / あり ${lv3Burst}）`)
    assert(lv2Burst === lv3Plain, `X01: Lv2ではシンボルは増えない（Lv2+バースト ${lv2Burst} / Lv3 ${lv3Plain}）`)
}
console.log("=== X01-d: Lv3･4、バーストをセットしている間、赤のシンボル1つ追加 ===")
tX01symbol("p1")
tX01symbol("p2")

void VAJRA
console.log("すべてのチェックに合格しました 🎉（part617）")
