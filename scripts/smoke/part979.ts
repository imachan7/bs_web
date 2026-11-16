// smoke パート979（効果の途中で待機に入ったカードの誘発は、効果を解決し終えてから1本の列で解決する。
// docs/design/DERIVED_AFTER_EFFECT.md §0・§8、CONJUNCTION.md の早見表）。期待値役が効果文とルールだけから書いた
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・バニラ）
const CAMERON = "BS21-037" // カメロンパン（黄・コスト2。Lv1(1コア)BP2000／Lv2(3コア)BP3000。Lv1･Lv2『破壊時』ドロー1）
const ELEC = "BSC05-027" // エレキトリック（黄・コスト3・フラッシュ）
const SMOKE = "BS11-009" // スモークロコ（紫・コスト1・Lv1 BP1000。『破壊時』ドロー1）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3・Lv1 BP2000。『召喚時』ドロー1）
const KINTARO = "BS14-010" // 皇牙獣キンタローグ・ベアー（赤。バースト：破壊2体→その後ドロー1）
const GEN = "BS22-073" // ジェネレートファイア（赤・コスト5。メイン：BP3000以下すべて破壊→この効果発揮後、手札のスピリットを召喚できる）
const ZENITH = "BS15-007" // ゼニス・ドラグーン（赤・コスト6。Lv1･Lv2『召喚時』破壊→手札1枚破棄することで、さらに破壊）
const SIEG = "BS01-X01" // 龍皇ジークフリード（赤・コスト6。Lv3(5コア)BP10000『破壊時』ボイドからライフ+1）
const HOWL = "BS13-080" // クレッセントハウリング（白・コスト4・フラッシュ：手札に戻す→その後ストライク持ちがいれば、もう1体）
const LEO = "BS13-X04" // 獅機龍神ストライクヴルム・レオ（白・コスト8。名前に「ストライク」）
const OBSID = "PX13" // 冥府魔神オブシディオン（紫・コスト7。相手によって自分のスピリットが手札に戻るとき、戻る1体につき相手は手札1枚を破棄）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk: [string, string, string][] = [
        [VAN, "ロクケラトプス", "spirit"], [CAMERON, "カメロンパン", "spirit"], [ELEC, "エレキトリック", "magic"],
        [SMOKE, "スモークロコ", "spirit"], [GRIP, "グリプ・ハンズ", "spirit"], [KINTARO, "皇牙獣キンタローグ・ベアー", "spirit"],
        [GEN, "ジェネレートファイア", "magic"], [ZENITH, "ゼニス・ドラグーン", "spirit"], [SIEG, "龍皇ジークフリード", "spirit"],
        [HOWL, "クレッセントハウリング", "magic"], [LEO, "獅機龍神ストライクヴルム・レオ", "spirit"], [OBSID, "冥府魔神オブシディオン", "spirit"],
    ]
    for (const [id, name, type] of chk) assert(getCard(id).name === name && getCard(id).type === type, `${id} は ${name}`)
}

// ---- テンプレート形式の場面用 ----
interface Side {
    life?: number
    hand?: string[]
    spirits?: { card: string; cores: number }[]
    burst?: string
}

function build(seed: string, turn: "me" | "opp", phase: "main" | "attack", me: Side, opp: Side, interactive = true) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turn === "me" ? "p1" : "p2"
    s.priorityPlayer = s.turnPlayer
    s.phase = phase
    s.interactiveTargets = interactive
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
        p.burst = spec.burst ?? null
        p.burstSet = spec.burst !== undefined
        p.soulCore = null
        for (const x of spec.spirits ?? []) {
            const inst = createInstance(x.card, s.turn - 1, x.cores)
            p.field.spirits.push(inst)
            ids[`${pid}.${x.card}`] = inst.instanceId
        }
    }
    refreshLevelAsOverrides(s)
    return { s, ids }
}

// 1アクションごとに GameState.events が消えるので、実行のたびに溜める
type Ev = GameState["events"][number]
function runner(s: GameState) {
    const events: Ev[] = []
    const trace: string[] = []
    const go = (pid: PlayerId, action: GameAction): void => {
        const err = act(s, pid, action)
        assert(err === null, `${action.type} が通る${err === null ? "" : `（拒否: ${err}）`}`)
        events.push(...s.events)
    }
    // 選択待ちに既定の答えを返す。pred が真になる選択待ちで止めて返す
    const until = (pred: (pc: NonNullable<GameState["pendingChoice"]>) => boolean, pick?: (pc: NonNullable<GameState["pendingChoice"]>) => GameAction | null) => {
        for (let i = 0; i < 14; i++) {
            const pc = s.pendingChoice
            if (!pc) return null
            trace.push(`${pc.kind}:${pc.prompt}`)
            if (pred(pc)) return pc
            const custom = pick?.(pc) ?? null
            if (custom) { go(pc.pid, custom); continue }
            if (pc.kind === "target") go(pc.pid, { type: "resolveChoice", instanceId: pc.candidates[0]! })
            else if (pc.kind === "card") go(pc.pid, { type: "resolveChoice", cardIndex: pc.cardIndices?.[0] ?? 0 })
            else go(pc.pid, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        }
        return null
    }
    return { go, until, events, trace }
}

const nameList = (ids: string[]) => ids.map((c) => getCard(c).name).sort().join("、") || "なし"

// ---- 1・2・7: 盤面の差分で見る場面 ----
console.log("=== 1. エレキトリック Q26091: コア2個のスピリットを払う→コア1個がライフへ、残り1個はリザーブ、その後に『破壊時』 ===")
scenario({
    name: "elec-two-cores",
    start: {
        phase: "attack",
        me: { hand: [ELEC], spirits: [{ card: CAMERON, cores: 2 }] },
        opp: { spirits: [{ card: VAN }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("カメロンパン") })
        t.closeFlash() // ブロック宣言前のフラッシュタイミング
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        if (t.state.priorityPlayer === t.opp) t.act("opp", { type: "pass" }) // ブロック後のフラッシュは攻撃側から
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
    },
    expect: [
        "自分.ライフ: 5 → 6",
        "自分.リザーブ: 10 → 9", // コスト3－黄シンボル1の軽減＝2を払い、残りのコア1個が戻る
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: エレキトリック → ロクケラトプス", // 『破壊時』のドロー（山札は既定でバニラ）
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュ: なし → エレキトリック、カメロンパン",
        "自分.カメロンパン.場所: フィールド → なし",
        "相手.ロクケラトプス.疲労: false → true",
    ],
})

console.log("=== 2. エレキトリック Q26092: コア1個のスピリットを払う→コア0で消滅扱い、『破壊時』は発揮されない ===")
scenario({
    name: "elec-one-core",
    start: {
        phase: "attack",
        me: { hand: [ELEC], spirits: [{ card: CAMERON, cores: 1 }] },
        opp: { spirits: [{ card: VAN }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("カメロンパン") })
        t.closeFlash() // ブロック宣言前のフラッシュタイミング
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        if (t.state.priorityPlayer === t.opp) t.act("opp", { type: "pass" }) // ブロック後のフラッシュは攻撃側から
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
    },
    expect: [
        "自分.ライフ: 5 → 6",
        "自分.リザーブ: 10 → 8", // コスト3－黄シンボル1の軽減＝2のみ。戻るコアは無い
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: エレキトリック → なし", // ドローしない
        "自分.トラッシュ: なし → エレキトリック、カメロンパン",
        "自分.カメロンパン.場所: フィールド → なし",
        "相手.ロクケラトプス.疲労: false → true",
    ],
})

console.log("=== 7. 変わらないこと: バトルのBP比較での破壊は今までどおり（破壊時効果は破壊の直後に解決される） ===")
scenario({
    name: "battle-bp-destroy",
    start: {
        phase: "attack",
        me: { spirits: [{ card: CAMERON, cores: 3 }] }, // Lv2 BP3000
        opp: { spirits: [{ card: SMOKE }] }, // BP1000
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("カメロンパン") })
        t.closeFlash() // ブロック宣言前のフラッシュタイミング
        t.act("opp", { type: "block", instanceId: t.id("スモークロコ") })
        t.closeFlash()
    },
    expect: [
        "自分.カメロンパン.疲労: false → true",
        "相手.スモークロコ.場所: フィールド → なし",
        "相手.トラッシュ: なし → スモークロコ",
        "相手.リザーブ: 10 → 11",
        "相手.手札: なし → ロクケラトプス", // 『破壊時』のドロー
        "相手.デッキ枚数: 40 → 39",
    ],
})

// ---- 3: 破壊する。その後、ドロー ----
console.log("=== 3. 「破壊する。その後、ドロー」: 自分のドローが先、相手の『破壊時』が後（バースト キンタローグ・ベアー） ===")
{
    const { s, ids } = build("derived-3", "opp", "main", { burst: KINTARO }, { hand: [GRIP], spirits: [{ card: CAMERON, cores: 1 }] })
    const r = runner(s)
    r.go("p2", { type: "summon", handIndex: 0 })
    // バーストの確認・対象選択は既定の答え（最初の候補・最初の選択肢）で進める
    r.until(() => false)
    const draws = r.events.filter((e) => e.type === "draw").map((e) => (e as { pid: PlayerId }).pid)
    // グリプの『召喚時』（相手）→ バーストの「その後ドロー」（自分）→ カメロンパンの『破壊時』（相手）
    assert(draws.join(",") === "p2,p1,p2", `ドローの順は 相手(召喚時)→自分(その後)→相手(破壊時)（実際: ${draws.join(",")}）`)
    assert(s.players.p2.field.spirits.length === 0, "BP4000以下の相手のスピリット2体（カメロンパン・グリプ）が破壊される")
    assert(!!ids["p2." + CAMERON], "（ID確認）")
}

// ---- 4: この効果発揮後 ----
console.log("=== 4. 「この効果発揮後」: Aの破壊の派生（相手の『破壊時』）がBの召喚より先に解決される ===")
{
    const { s } = build("derived-4", "me", "main", { hand: [GEN, VAN] }, { spirits: [{ card: CAMERON, cores: 1 }] })
    const r = runner(s)
    r.go("p1", { type: "castMagic", handIndex: 0, timing: "main" })
    // 「召喚できる」の選択に着いた時点で、相手の『破壊時』（ドロー）はもう解決済み
    const pc = r.until((c) => c.kind === "card" && /召喚/.test(c.prompt))
    assert(pc !== null, `召喚するスピリットを選ぶ待ちに着く（経過: ${r.trace.join(" / ")}）`)
    assert(s.players.p2.hand.length === 1, "召喚の選択の前に、相手の『破壊時』のドローが解決されている")
    assert(s.players.p2.trashCards.includes(CAMERON), "カメロンパンはトラッシュに置かれている")
    r.until(() => false)
    assert(s.players.p1.field.spirits.some((x) => x.cardId === VAN), "手札のロクケラトプスが召喚された")
}

// ---- 5: 1つの効果で2回に分けて破壊 ----
console.log("=== 5. 1つの効果で2回に分けて破壊（ゼニス・ドラグーン）: 2体の『破壊時』が効果の後に1本の列になり、順番を聞かれる ===")
{
    const { s } = build("derived-5", "me", "main",
        { hand: [ZENITH, VAN] },
        { spirits: [{ card: CAMERON, cores: 1 }, { card: SIEG, cores: 5 }] })
    const r = runner(s)
    r.go("p1", { type: "summon", handIndex: 0 })
    // 「コアの数」「破壊対象」「手札を1枚破棄することで」には既定の答え。順番を聞かれたらそこで止める
    const pc = r.until((c) => /どれから解決/.test(c.prompt))
    assert(pc !== null, `2体ぶんの『破壊時』の解決順をターンプレイヤー（自分）が聞かれる（経過: ${r.trace.join(" / ")}）`)
    if (pc) {
        assert(pc.pid === "p1", "順番を決めるのはターンプレイヤー")
        assert(s.players.p2.field.spirits.length === 2, "順番を聞かれた時点で、2体とも待機のまま場に残っている")
        assert(s.players.p2.hand.length === 0 && s.players.p2.life === 5, "『破壊時』（ドロー・ライフ+1）はまだ解決されていない")
        r.go("p1", { type: "resolveChoice", ...(pc.kind === "target" ? { instanceId: pc.candidates[0]! } : { option: pc.options?.[0] ?? "" }) })
    }
    r.until(() => false)
    assert(s.players.p2.field.spirits.length === 0, "列の後に2体ともトラッシュへ")
    assert(nameList(s.players.p2.trashCards) === nameList([CAMERON, SIEG]), "相手のトラッシュにカメロンパンとジークフリード")
    assert(s.players.p2.hand.length === 1 && s.players.p2.life === 6, "相手のドロー1枚とライフ+1の両方が解決される")
}

// ---- 6: 戻す ----
console.log("=== 6. 戻す（クレッセントハウリング）: 1体目と2体目を戻した後で、オブシディオンの『戻るとき』が解決される ===")
{
    const { s, ids } = build("derived-6", "me", "main",
        { hand: [HOWL, VAN, VAN], spirits: [{ card: LEO, cores: 1 }] },
        { spirits: [{ card: OBSID, cores: 1 }, { card: VAN, cores: 1 }, { card: GRIP, cores: 1 }] })
    const idA = ids["p2." + VAN]!, idB = ids["p2." + GRIP]!
    const r = runner(s)
    r.go("p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    // 1体目（ロクケラトプス）を選ぶ
    const first = r.until((c) => c.kind === "target" && c.candidates.includes(idA) && c.candidates.includes(idB))
    assert(first !== null, `1体目を選ぶ（経過: ${r.trace.join(" / ")}）`)
    r.go("p1", { type: "resolveChoice", instanceId: idA })
    const second = s.pendingChoice
    assert(second !== null && second.kind === "target" && second.candidates.includes(idB),
        "次に聞かれるのは2体目の対象（オブシディオンの『戻るとき』の破棄ではない）")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === idA), "1体目は効果が終わるまで待機のまま場に残る")
    assert(s.players.p2.hand.length === 0, "まだ手札に戻っていない")
    r.go("p1", { type: "resolveChoice", instanceId: idB })
    r.until(() => false)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === idA || x.instanceId === idB), "2体とも場を離れた")
    assert(nameList(s.players.p2.hand) === nameList([VAN, GRIP]), "2体とも相手の手札へ戻る")
}

console.log("すべてのチェックに合格しました 🎉（part979）")
