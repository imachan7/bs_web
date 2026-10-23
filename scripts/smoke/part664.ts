// smoke パート664（実行時カバレッジの穴埋め：costMod／reductionGrant／levelCostMod ほか。効果文から期待値を書く）
import {
    assert,
    createGame,
    createInstance,
    effectiveCost,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
    placeBurst,
    act,
    endTurn,
    destroySpirit,
    refreshSpirit,
    resolveAction,
    spiritHasKeyword,
    effectiveBp,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// ブレイヴをスピリット状態でフィールドに出してから host に合体させる
function combine(s: GameState, pid: PlayerId, braveId: string, hostId: string): { brave: ReturnType<typeof createInstance>; host: ReturnType<typeof createInstance> } {
    const host = put(s, pid, hostId, 1)
    const brave = put(s, pid, braveId, 1)
    const keep = [s.turnPlayer, s.priorityPlayer] as const
    s.turnPlayer = pid
    s.priorityPlayer = pid
    const err = act(s, pid, { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    s.turnPlayer = keep[0]
    s.priorityPlayer = keep[1]
    assert(err === null || err === undefined, `合体が通る（${String(err)}）`)
    assert(host.braveRefs !== undefined && host.braveRefs.length > 0, "合体した")
    return { brave, host }
}
function closeFlash(s: GameState): void {
    while (s.isFlashTiming && s.battle) {
        const err = act(s, s.priorityPlayer, { type: "pass" })
        if (err) throw new Error(`フラッシュを閉じられない: ${err}`)
    }
}
const cost = (s: GameState, pid: PlayerId, id: string): number => effectiveCost(s, pid, getCard(id))

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        "BS10-059": "フォート・ゴレム",
        "BS11-X03": "星騎士ハーキュリーΩ",
        "BS12-016": "骸巨人ギ・ガッシャ",
        "BS15-009": "虚龍帝カタストロフドラゴン",
        "BS15-027": "虚天帝ホウオウガ",
        "BS15-036": "虚械帝インフェニット・ヴォルス",
        "BS15-X02": "虚皇帝ネザード・バァラル",
        "BS13-039": "神獣バーロン",
        "BS15-015": "吸血令嬢エサルフリーダ",
    }
    for (const [id, n] of Object.entries(names)) assert(getCard(id).name === n, `${id}は${n}`)
}

console.log("=== 1. 手札のコストを置き換える（条件が成り立つ／成り立たない） ===")
{
    const s = game("cost1")
    assert(cost(s, "p1", "BS10-059") === 6, "フォート・ゴレム：ネクサスが無ければ6")
    putNexus(s, "p1", "BS12-061")
    assert(cost(s, "p1", "BS10-059") === 4, "フォート・ゴレム：自分のネクサスがあれば4")

    const sOpp = game("cost1b")
    putNexus(sOpp, "p2", "BS12-061")
    assert(cost(sOpp, "p1", "BS10-059") === 6, "フォート・ゴレム：相手のネクサスでは4にならない")

    const s2 = game("cost2")
    assert(s2.players.p1.life === 5, "前提：初期ライフ5")
    assert(cost(s2, "p1", "BS11-X03") === 7, "ハーキュリーΩ：ライフ5なら7のまま")
    s2.players.p1.life = 3
    assert(cost(s2, "p1", "BS11-X03") === 4, "ハーキュリーΩ：ライフ3以下で4")

    const s3 = game("cost3")
    for (let i = 0; i < 4; i++) s3.players.p1.trashCards.push("BS06-013")
    assert(cost(s3, "p1", "BS12-016") === 8, "ギ・ガッシャ：無魔スピリットが4枚なら8のまま")
    s3.players.p1.trashCards.push("BS16-010")
    assert(cost(s3, "p1", "BS12-016") === 3, "ギ・ガッシャ：無魔スピリットが5枚で3")
}

console.log("=== 2. 虚神：バーストをセットしている間／していない間 ===")
{
    const s = game("kyoshin")
    for (const id of ["BS15-009", "BS15-027", "BS15-036"]) assert(cost(s, "p1", id) === 11, `${id}：バースト無しは11のまま`)
    assert(cost(s, "p1", "BS15-X02") === 11, "ネザード・バァラル：バースト無しは11")
    placeBurst(s, "p1", VANILLA)
    for (const id of ["BS15-009", "BS15-027", "BS15-036"]) assert(cost(s, "p1", id) === 7, `${id}：自分のバーストがあれば7`)
    assert(cost(s, "p1", "BS15-X02") === 7, "ネザード・バァラル：バーストをセットしていれば元の7")
    assert(cost(s, "p2", "BS15-009") === 11, "相手のバーストでは自分のコストは変わらない")
}

console.log("=== 3. 神獣バーロン：戯狩1体につき軽減シンボル[黄] ===")
{
    const s = game("baron")
    for (let i = 0; i < 3; i++) put(s, "p1", "BS11-033")
    const base = getCard("BS13-039")
    assert(base.cost === 6 && base.reduction?.length === 2, "前提：コスト6・軽減2")
    // 黄シンボル3つ：元の軽減2＋戯狩3体ぶんの付与3＝5個のうち、場の黄シンボル3つぶんまで軽減できる
    assert(cost(s, "p1", "BS13-039") === 3, "戯狩3体（黄シンボル3）で6-3=3")
    const s0 = game("baron0")
    put(s0, "p1", "BS01-002")
    put(s0, "p1", "BS11-033")
    assert(cost(s0, "p1", "BS13-039") === 5, "戯狩が1体なら付与は1個で、黄シンボル1つぶんの軽減（6-1）")
}

console.log("=== 4. エサルフリーダ：相手のネクサスのLvコスト+1 ===")
{
    const s = game("esal")
    const mine = putNexus(s, "p1", "BS12-061", 2)
    const theirs = putNexus(s, "p2", "BS12-061", 2)
    put(s, "p1", "BS15-015", 2)
    refreshLevelAsOverrides(s)
    assert((theirs.levelCostBonusContinuous ?? 0) === 1, "相手のネクサスのLvコストが+1")
    assert((mine.levelCostBonusContinuous ?? 0) === 0, "自分のネクサスは変わらない")
}

console.log("=== 5. 神将：バーストをセットしている間、ライフはスピリット1体から1までしか減らない ===")
const DOUBLE = "BS04-010" // 雷帝エール・クレル（シンボル2・効果は【転召】のみ）
{
    assert(getCard(DOUBLE).name === "雷帝エール・クレル" && getCard(DOUBLE).symbol.length === 2, "DOUBLEはシンボル2")
    for (const id of ["BS15-005", "BS15-014", "BS15-021", "BS15-031", "BS15-042", "BS15-051"]) {
        assert(getCard(id).effects.some((e) => e.kind === "globalConstraint" && e.constraint.type === "lifeDamagePerSpiritPerTurn"), `${id}は1体から1まで`)
        scenario({
            name: `life-cap-${id}`,
            start: {
                turn: "opp",
                me: { spirits: [{ card: id }], burst: VANILLA },
                opp: { spirits: [{ card: DOUBLE, label: "帝" }] },
            },
            steps(t) {
                t.act("opp", { type: "nextPhase" })
                t.act("opp", { type: "attack", instanceId: t.id("帝") })
                t.closeFlash()
                t.act("me", { type: "takeLife" })
            },
            expect: ["相手.帝.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
        })
    }
    scenario({
        name: "life-cap-noburst",
        start: {
            turn: "opp",
            me: { spirits: [{ card: "BS15-005" }] },
            opp: { spirits: [{ card: DOUBLE, label: "帝" }] },
        },
        steps(t) {
            t.act("opp", { type: "nextPhase" })
            t.act("opp", { type: "attack", instanceId: t.id("帝") })
            t.closeFlash()
            t.act("me", { type: "takeLife" })
        },
        expect: ["相手.帝.疲労: false → true", "自分.ライフ: 5 → 3", "自分.リザーブ: 10 → 12"],
    })
}

console.log("=== 6. 合体時の全体制約 ===")
{
    const MAGIC = "BS01-123" // リターンドロー（コスト2）
    assert(getCard(MAGIC).type === "magic" && getCard(MAGIC).cost === 2, "MAGICはコスト2のマジック")
    assert(getCard("BS10-077").name === "ギョクリューン" && getCard("BS11-X04").name === "宝瓶神機アクア・エリシオン", "前提カード")
    const s = game("gyoku")
    assert(cost(s, "p2", MAGIC) === 2, "合体前：相手のマジックは2のまま")
    combine(s, "p1", "BS10-077", DOUBLE)
    assert(cost(s, "p2", MAGIC) === 4, "ギョクリューン合体中：相手のマジックは2コスト余分（4）")
    assert(cost(s, "p1", MAGIC) === 2, "自分のマジックは変わらない")
}
{
    // アクア・エリシオン【合体中】Lv3：相手の合体スピリットはリフレッシュステップで回復できない
    const run = (mine: boolean): boolean => {
        const s = game(mine ? "aqua-on" : "aqua-off")
        s.players.p1.field.spirits.length = 0
        if (mine) combine(s, "p1", "BS10-077", "BS11-X04")
        else put(s, "p1", "BS11-X04", 5)
        if (mine) { const x = s.players.p1.field.spirits.find((i) => i.cardId === "BS11-X04")!; x.cores = 5; refreshLevelAsOverrides(s) }
        const { host } = combine(s, "p2", "BS10-077", DOUBLE)
        host.isRested = true
        endTurn(s)
        return host.isRested
    }
    assert(run(true) === true, "合体したアクア・エリシオン(Lv3)がいると、相手の合体スピリットは回復しない")
    assert(run(false) === false, "合体していなければ相手の合体スピリットは通常どおり回復する")
}

console.log("=== 7. ムーンショウウオ：相手のスピリットの効果では自分のライフが減らない ===")
{
    assert(getCard("BS13-027").name === "ムーンショウウオ" && getCard("BS07-026").name === "烈針獣マツノアラシ", "前提カード")
    // p1 のマツノアラシが p2 のブロッカーに勝つとライフ1（スピリットの効果）。p2 側のムーンショウウオ(Lv2)の有無で比べる
    const oppLifeAfter = (moon: boolean, moonCores = 3): number => {
        const s = game(moon ? "moon-on" : "moon-off", true)
        const atk = put(s, "p1", "BS07-026", 3)
        const blocker = put(s, "p2", VANILLA, 1)
        if (moon) put(s, "p2", "BS13-027", moonCores)
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        if (moon) assert(act(s, "p2", { type: "resolveChoice" }) === null, "ムーンショウウオ自身の「手札に戻す」は断る")
        assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック")
        closeFlash(s)
        assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ブロック")
        closeFlash(s)
        return s.players.p2.life
    }
    assert(oppLifeAfter(false) === 4, "基準：マツノアラシが勝つと相手のライフが1減る")
    assert(oppLifeAfter(true) === 5, "ムーンショウウオ Lv2 がいると、スピリットの効果ではライフが減らない")
    assert(oppLifeAfter(true, 1) === 4, "Lv1 では効かない")
}

console.log("=== 8. 覇王の【合体時】『アタックできない』と大海峡 ===")
{
    assert(getCard("SD06-010").name === "海皇龍シーマ・クリーク" && getCard("BS15-072").name === "渦巻く大海峡", "前提カード")
    const canAttack = (seaCores: number): boolean => {
        const s = game("sea" + seaCores)
        put(s, "p1", "SD06-010", seaCores)
        const small = put(s, "p1", VANILLA, 1)
        small.isRested = false
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        return act(s, "p1", { type: "attack", instanceId: small.instanceId }) === null
    }
    assert(canAttack(1) === false, "シーマ・クリーク Lv1：コスト2以下のスピリットはアタックできない")
    assert(canAttack(5) === true, "Lv3 では制限が無い")
}
{
    // 渦巻く大海峡 Lv2：自分のバーストがある間、『このスピリットの破壊時』は両陣営で発揮されない
    assert(getCard("BS02-032").name === "ダッチョーノ", "前提：ダッチョーノ")
    const reserveAfterDestroy = (strait: boolean, burst: boolean): number => {
        const s = game(`strait${strait}${burst}`)
        const d = put(s, "p2", "BS02-032", 2)
        if (strait) putNexus(s, "p1", "BS15-072", 2)
        if (burst) placeBurst(s, "p1", VANILLA)
        const before = s.players.p2.reserve
        destroySpirit(s, "p2", d.instanceId)
        return s.players.p2.reserve - before
    }
    const base = reserveAfterDestroy(false, false)
    assert(reserveAfterDestroy(true, true) === base - 2, "大海峡Lv2＋バーストで、破壊時の「コア2個をリザーブに」が発揮されない")
    assert(reserveAfterDestroy(true, false) === base, "バーストが無ければ発揮される")
}

console.log("=== 9. 誘発：ブレイヴ召喚時の破棄／月光神龍の合体中アタック・ブロック時 ===")
{
    assert(getCard("BS11-059").name === "レチクル・アームズ" && getCard("BS11-059").type === "brave", "前提：レチクル・アームズ")
    const s = game("reticle")
    s.players.p1.hand = ["BS11-059"]
    const deckBefore = s.players.p2.deck.length
    const trashBefore = s.players.p2.trashCards.length
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "レチクル・アームズを召喚")
    assert(s.players.p2.deck.length === deckBefore - 3, "召喚時：相手のデッキを上から3枚破棄")
    assert(s.players.p2.trashCards.length === trashBefore + 3, "破棄したカードは相手のトラッシュへ")
    assert(s.players.p1.deck.length === 40, "自分のデッキは減らない")
}
{
    assert(getCard("BS12-X04").name === "月光神龍ルナテック・ストライクヴルム", "前提：ルナテック")
    // 合体中 Lv2：アタック時、このスピリットのBP以下の相手のスピリット1体を手札に戻す
    const attackCase = (combined: boolean): number => {
        const s = game(`luna-atk-${combined}`)
        let luna
        if (combined) luna = combine(s, "p1", "BS10-077", "BS12-X04").host
        else luna = put(s, "p1", "BS12-X04", 3)
        luna.cores = 3
        refreshLevelAsOverrides(s)
        put(s, "p2", VANILLA, 1)
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        assert(act(s, "p1", { type: "attack", instanceId: luna.instanceId }) === null, "ルナテックでアタック")
        return s.players.p2.hand.length
    }
    const handBase = game("x").players.p2.hand.length
    assert(attackCase(true) === handBase + 1, "合体中のアタック時に、相手のスピリットが手札に戻る")
    assert(attackCase(false) === handBase, "合体していなければ戻らない")
    // ブロック時：アタックしてきた相手のスピリット（BP以下）を手札に戻す
    const blockCase = (combined: boolean): number => {
        const s = game(`luna-blk-${combined}`)
        let luna
        if (combined) luna = combine(s, "p1", "BS10-077", "BS12-X04").host
        else luna = put(s, "p1", "BS12-X04", 3)
        luna.cores = 3
        refreshLevelAsOverrides(s)
        const foe = put(s, "p2", VANILLA, 1)
        s.turnPlayer = "p2"
        s.priorityPlayer = "p2"
        assert(act(s, "p2", { type: "nextPhase" }) === null, "相手がアタックステップへ")
        assert(act(s, "p2", { type: "attack", instanceId: foe.instanceId }) === null, "相手のアタック")
        closeFlash(s)
        assert(act(s, "p1", { type: "block", instanceId: luna.instanceId }) === null, "ルナテックでブロック")
        return s.players.p2.hand.length
    }
    assert(blockCase(true) === handBase + 1, "合体中のブロック時に、アタックしてきた相手のスピリットが手札に戻る")
    assert(blockCase(false) === handBase, "合体していなければ戻らない")
}

console.log("=== 10. 賛美するパイプオルガン：相手のターン、スピリット/マジックの効果で回復した緑/白/青は破壊 ===")
{
    assert(getCard("BS14-085").name === "賛美するパイプオルガン", "前提：パイプオルガン")
    const colored: [string, string][] = [["BS01-050", "緑"], ["BS01-074", "白"], ["BS03-071", "青"]]
    for (const [id, col] of colored) {
        const run = (sourceType: "spirit" | "magic" | "nexus", lv2 = true): boolean => {
            const s = game(`organ-${id}-${sourceType}-${lv2}`)
            putNexus(s, "p1", "BS14-085", lv2 ? 2 : 0)
            const x = put(s, "p2", id, 1)
            x.isRested = true
            s.turnPlayer = "p2"
            s.priorityPlayer = "p2"
            refreshSpirit(s, "p2", x, sourceType)
            return s.players.p2.field.spirits.includes(x)
        }
        assert(run("spirit") === false, `${col}：スピリットの効果で回復したら破壊される`)
        assert(run("magic") === false, `${col}：マジックの効果で回復したら破壊される`)
        assert(run("nexus") === true, `${col}：ネクサスの効果で回復しても破壊されない`)
    }
}

console.log("=== 11. デッキ破棄されたとき ===")
{
    const MILLER = "BS03-073" // ストン・スタチュー（召喚時：相手のデッキを上から1枚破棄）
    assert(getCard(MILLER).name === "ストン・スタチュー" && getCard(MILLER).cost === 1, "前提：ストン・スタチュー")
    const names: Record<string, string> = { "BS13-034": "ミノガメン", "BS14-049": "執事ペンタン", "BS16-014": "オカピエン", "BS16-002": "パイルドラコ" }
    for (const [id, n] of Object.entries(names)) assert(getCard(id).name === n, `前提：${n}`)
    const run = (top: string): GameState => {
        const s = game(`milled-${top}`)
        s.players.p2.deck = [top, ...Array.from({ length: 39 }, () => VANILLA)]
        s.players.p1.hand = [MILLER]
        assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ストン・スタチューを召喚")
        return s
    }
    for (const id of ["BS13-034", "BS14-049"]) {
        const s = run(id)
        assert(s.players.p2.field.spirits.some((x) => x.cardId === id), `${id}：破棄されたら、コストを支払わずに召喚される`)
        assert(!s.players.p2.trashCards.includes(id), `${id}：トラッシュには残らない`)
    }
    {
        const s = run("BS16-014")
        assert(s.players.p1.life === 4, "オカピエン：破棄した側のライフのコア1個がボイドへ")
        assert(s.players.p2.trashCards.includes("BS16-014"), "オカピエン自身はトラッシュに残る")
    }
    {
        const s = run("BS16-002")
        assert(!s.players.p1.field.spirits.some((x) => x.cardId === MILLER), "パイルドラコ：破棄させた相手のスピリットが破壊される")
    }
    {
        const s = game("milled-plain")
        s.players.p2.deck = ["BS16-002", ...Array.from({ length: 39 }, () => VANILLA)]
        resolveAction(s, "p1", null, { type: "mill", count: 1 }, undefined, undefined, "magic")
        assert(s.players.p1.field.spirits.length === 0, "スピリットの効果でなければ（マジックでは）何も壊れない")
    }
}

console.log("=== 12. 効果の記述を持たない扱い／効果を失わせる付与 ===")
{
    for (const [id, n] of Object.entries({ "BS12-046": "ナタ・ゴレム", "BS12-059": "ショゴルス", "BS12-081": "メロディアスハープ", "BS17-026": "ジャドバルジャー" })) assert(getCard(id).name === n, `前提：${n}`)
    // ナタ・ゴレム Lv2 の【合体時】：このスピリットは効果の記述を持たないスピリットとして扱う
    const nata = (combined: boolean, cores: number): boolean => {
        const s = game(`nata-${combined}-${cores}`)
        const host = combined ? combine(s, "p1", "BS10-077", "BS12-046").host : put(s, "p1", "BS12-046", cores)
        host.cores = cores
        refreshLevelAsOverrides(s)
        return host.treatedAsVanillaContinuous === true
    }
    assert(nata(true, 3) === true, "ナタ・ゴレム：合体しているLv2は効果の記述を持たない扱い")
    assert(nata(false, 3) === false, "合体していなければ通常")
    assert(nata(true, 1) === false, "Lv1 では扱われない")
    // ショゴルス：合体したホストが効果の記述を持たない扱いになる
    {
        const s = game("shogo")
        const { host } = combine(s, "p1", "BS12-059", DOUBLE)
        assert(host.treatedAsVanillaContinuous === true, "ショゴルス合体中：ホストは効果の記述を持たない扱い")
        const s2 = game("shogo2")
        const lone = put(s2, "p1", DOUBLE, 1)
        assert(lone.treatedAsVanillaContinuous !== true, "合体していないスピリットは変わらない")
    }
    // ジャドバルジャー：常に効果の記述を持たない扱い
    {
        const s = game("jado")
        const j = put(s, "p1", "BS17-026", 1)
        assert(j.treatedAsVanillaContinuous === true, "ジャドバルジャーは効果の記述を持たないスピリットとして扱う")
    }
    // メロディアスハープ：選んだ1体は効果すべてを失い、効果の記述を持たない扱いにもなる
    {
        const s = game("harp")
        const target = put(s, "p2", "BS02-040", 4) // ロブスターク Lv2（【装甲：赤】を静的に持つ）
        assert(spiritHasKeyword(s, "p2", target, "armor"), "貸与前は【装甲】を持つ")
        resolveAction(s, "p1", null, { type: "targetChoiceLendThisTurn" }, undefined, undefined, "magic", undefined, undefined, "BS12-081")
        refreshLevelAsOverrides(s)
        assert(target.effectsDisabledContinuous === true && target.treatedAsVanillaContinuous === true, "選んだ1体は効果を失い、効果の記述を持たない扱いになる")
        assert(!spiritHasKeyword(s, "p2", target, "armor"), "【装甲】も発揮されない")
    }
}

console.log("=== 13. 重装甲の付与 ===")
{
    assert(getCard("BS13-056").name === "ホーク・ブレイカー" && getCard("BS17-067").name === "凍えるフィヨルド", "前提カード")
    // ホーク・ブレイカー：スピリット状態の間、自分のスピリットすべてに【重装甲：赤】
    {
        const s = game("hawk")
        const ally = put(s, "p1", DOUBLE, 1)
        assert(!spiritHasKeyword(s, "p1", ally, "heavyArmor"), "前提：付与前は持たない")
        const hawk = put(s, "p1", "BS13-056", 1)
        refreshLevelAsOverrides(s)
        assert(spiritHasKeyword(s, "p1", ally, "heavyArmor"), "ホーク・ブレイカーがスピリット状態の間、味方は【重装甲】を得る")
        assert(!spiritHasKeyword(s, "p2", put(s, "p2", VANILLA, 1), "heavyArmor"), "相手のスピリットは得ない")
        const err = act(s, "p1", { type: "combineBrave", braveInstanceId: hawk.instanceId, hostInstanceId: ally.instanceId })
        assert(err === null, `合体する（${String(err)}）`)
        assert(!spiritHasKeyword(s, "p1", ally, "heavyArmor"), "合体してスピリット状態でなくなると付与は止まる")
    }
    // 凍えるフィヨルド Lv2：相手のアタックステップの間、自分の合体スピリットすべてに【重装甲：赤/青】
    {
        const check = (combined: boolean, oppAttackStep: boolean): boolean => {
            const s = game(`fjord-${combined}-${oppAttackStep}`)
            putNexus(s, "p1", "BS17-067", 2)
            const host = combined ? combine(s, "p1", "BS10-077", DOUBLE).host : put(s, "p1", DOUBLE, 1)
            if (oppAttackStep) {
                s.turnPlayer = "p2"
                s.priorityPlayer = "p2"
                assert(act(s, "p2", { type: "nextPhase" }) === null, "相手がアタックステップへ")
            }
            return spiritHasKeyword(s, "p1", host, "heavyArmor")
        }
        assert(check(true, true) === true, "相手のアタックステップ中、合体スピリットは【重装甲】を得る")
        assert(check(false, true) === false, "合体していなければ得ない")
        assert(check(true, false) === false, "相手のアタックステップでなければ得ない")
    }
}

console.log("=== 14. 闇の聖剣：破壊されたスピリットをコスト3/4としても扱う（【不死】の引き金） ===")
{
    assert(getCard("BS11-064").name === "闇の聖剣" && getCard("BS09-X36").name === "魔界七将ベルドゴール", "前提カード")
    assert(getCard("BS09-X36").effects.some((e) => e.kind === "keyword" && e.keyword === "fushi" && (e.triggerCosts ?? []).includes(4)), "前提：ベルドゴールはコスト4の破壊で【不死】")
    assert(getCard(VANILLA).cost === 1, "前提：破壊されるのはコスト1")
    const asked = (sword: boolean, lv: number): boolean => {
        const s = game(`sword-${sword}-${lv}`, true)
        if (sword) putNexus(s, "p1", "BS11-064", lv)
        s.players.p1.trashCards.push("BS09-X36")
        const d = put(s, "p1", VANILLA, 1)
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        destroySpirit(s, "p1", d.instanceId)
        return s.pendingChoice !== null && s.pendingChoice.pid === "p1"
    }
    assert(asked(false, 1) === false, "闇の聖剣が無ければコスト1のままなので【不死】の確認は出ない")
    assert(asked(true, 1) === true, "闇の聖剣Lv1があれば、コスト4としても扱われて【不死】の確認が出る")
}

console.log("=== 15. 剣の誕生地／偶像の館／巨木の門：【転召】の生贄を、ネクサスの疲労で代替する ===")
{
    const MARS = "BS12-007" // 炎星神龍マルス・ドラグーン（【転召：星魂/ボイド】）
    const BEARD = "BS10-033" // ノーザンベアード（星魂・コスト3）
    assert(getCard(MARS).name === "炎星神龍マルス・ドラグーン" && getCard(BEARD).name === "ノーザンベアード" && getCard(BEARD).cost === 3 && getCard(BEARD).family.includes("星魂"), "前提カード")
    for (const id of ["BS12-061", "BS12-064", "BS12-066"]) {
        const run = (option: string): { nexusRested: boolean; beardAlive: boolean } => {
            const s = game(`tensho-${id}-${option}`, true)
            s.players.p1.hand = [MARS]
            const nx = putNexus(s, "p1", id, 0)
            const beard = put(s, "p1", BEARD, 2)
            assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "マルスを召喚")
            assert(s.pendingChoice !== null && (s.pendingChoice.options ?? []).includes(option), `${id}：「${option}」が選べる`)
            assert(act(s, "p1", { type: "resolveChoice", option }) === null, "選ぶ")
            return { nexusRested: nx.isRested, beardAlive: s.players.p1.field.spirits.includes(beard) }
        }
        const rest = run("疲労してコアを維持する")
        assert(rest.nexusRested && rest.beardAlive, `${id}：ネクサスを疲労させれば、生贄のコスト3の星魂は残る`)
        const keep = run("疲労せずコアを置く")
        assert(!keep.nexusRested && !keep.beardAlive, `${id}：疲労しない場合は通常どおり生贄が消える`)
    }
}

console.log("=== 16. ツンドッグ・ゴレム：【大粉砕】持ちが戦闘で破壊されたら疲労状態で残る ===")
{
    assert(getCard("BS15-049").name === "ツンドッグ・ゴレム" && getCard("BS15-X06").name === "鉄の覇王サイゴード・ゴレム", "前提カード")
    const survives = (summonTsundog: boolean): boolean => {
        const s = game(`tsundog-${summonTsundog}`)
        if (summonTsundog) {
            s.players.p1.hand = ["BS15-049"]
            assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ツンドッグ・ゴレムを召喚")
        }
        const big = put(s, "p1", "BS15-X06", 1)
        const wall = put(s, "p2", DOUBLE, 5) // Lv3 BP9000
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        assert(act(s, "p1", { type: "attack", instanceId: big.instanceId }) === null, "サイゴード・ゴレムでアタック")
        closeFlash(s)
        assert(act(s, "p2", { type: "block", instanceId: wall.instanceId }) === null, "ブロック")
        closeFlash(s)
        return s.players.p1.field.spirits.includes(big) && big.isRested
    }
    assert(survives(true) === true, "このターンの間、BP比べで破壊された【大粉砕】持ちは疲労状態で残る")
    assert(survives(false) === false, "召喚していなければ通常どおり破壊される")
}

console.log("=== 17. 創造主グリム・ジェイ：グリム・ウィルにも「コスト0/2/4/6/8にブロックされない」を与える ===")
{
    assert(getCard("BS18-044").name === "創造主グリム・ジェイ" && getCard("BS18-043").name === "創造主グリム・ウィル", "前提カード")
    assert(getCard("BS01-089").cost === 4, "前提：ブロッカーはコスト4")
    const blockResult = (blockerId: string, jay: boolean): string | null => {
        const s = game(`grim-${blockerId}-${jay}`)
        if (jay) put(s, "p1", "BS18-044", 1)
        const will = put(s, "p1", "BS18-043", 1)
        const blocker = put(s, "p2", blockerId, 1)
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        assert(act(s, "p1", { type: "attack", instanceId: will.instanceId }) === null, "ウィルでアタック")
        closeFlash(s)
        return act(s, "p2", { type: "block", instanceId: blocker.instanceId })
    }
    assert(blockResult("BS01-089", true) !== null, "ジェイがいれば、コスト4のスピリットはウィルをブロックできない")
    assert(blockResult("BS01-089", false) === null, "ジェイがいなければ、コスト4のスピリットはウィルをブロックできる（ウィル自身の制限は0/1/3/5/7）")
}

console.log("すべてのチェックに合格しました 🎉（part664）")
