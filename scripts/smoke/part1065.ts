// smoke パート1065（バトル終了の一本化：ブロックの有無・ブロッカーが離れたかを問わず『バトル終了時』を通す）
// 2026-11-27 ユーザー確認：規則はアタックした時点でバトル。ブロックされずライフで受けたアタックも対象。
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave } from "../../server/src/logic/EffectModules"
import { matchesBraveCondition } from "../../shared/rules"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const FEN = "BS17-002" // フェンサー・ドラゴン（赤・コスト3・系統戦竜）
const ANT = "BS05-024" // 用心棒アントマン（緑・コスト4・BP5000・バニラ）
const BSET = "BS14-099" // 武迅衝（緑マジック・コスト2）バースト効果を持つ
const GUNNER = "BS18-006" // ガンナー・ドラゴン（系統戦竜の自分のスピリットのバトル終了時）
const NEXUS = "BS10-086" // 巨星望む大樹（Lv2：合体スピリットのバトル終了時に分離して回復）
const EXUSIA = "BS03-070" // 天使長エクスシア（Lv1〜3【光芒】）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).type === "spirit", "ROKUはロクケラトプス")
    assert(getCard(FEN).name === "フェンサー・ドラゴン" && getCard(FEN).type === "spirit", "FENはフェンサー・ドラゴン")
    assert(getCard(ANT).name === "用心棒アントマン" && getCard(ANT).type === "spirit", "ANTは用心棒アントマン")
    assert(getCard(BSET).name === "武迅衝" && getCard(BSET).type === "magic", "BSETは武迅衝（マジック）")
    assert(getCard(GUNNER).name === "ガンナー・ドラゴン" && getCard(GUNNER).type === "spirit", "GUNNERはガンナー・ドラゴン")
    assert(getCard(NEXUS).name === "巨星望む大樹" && getCard(NEXUS).type === "nexus", "NEXUSは巨星望む大樹（ネクサス）")
    assert(getCard(EXUSIA).name === "天使長エクスシア" && getCard(EXUSIA).effects.some((e) => e.kind === "keyword" && e.keyword === "kobo"), "EXUSIAは【光芒】持ちの天使長エクスシア")
}

type Ans = "yes" | "no" | { card: number }

function pc(t: ScenarioCtx) {
    const p = t.state.pendingChoice
    assert(p !== null, "選択待ちがあるはず")
    return p!
}

function ans(t: ScenarioCtx, a: Ans): void {
    const p = pc(t)
    const side = p.pid === t.me ? "me" : "opp"
    if (a === "yes") t.act(side, { type: "resolveChoice", option: p.options![0]! })
    else if (a === "no") t.act(side, { type: "resolveChoice" })
    else t.act(side, { type: "resolveChoice", cardIndex: a.card })
}

function noChoice(t: ScenarioCtx, msg: string): void {
    assert(t.state.pendingChoice === null, msg)
}

const atk = { phase: "attack" as const, interactive: true }
const gone = (prefix: string, zone = "フィールド") => `${prefix}.場所: ${zone} → なし`

console.log("=== A. ガンナー・ドラゴン：ブロックされずライフで受けたバトル終了時にバーストをセットできる ===")
{
    scenario({
        name: "gunner-unblocked-set-burst",
        start: { ...atk, me: { hand: [BSET, ROKU], spirits: [{ card: GUNNER }, { card: FEN, label: "F" }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("F") })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
            const p = pc(t)
            const idx = p.cardIndices?.[0] ?? -1
            assert(p.cardIndices?.length === 1 && getCard(t.state.players[t.me].hand[idx]!).name === "武迅衝", "セットできるのはバースト効果を持つカードだけ")
            ans(t, { card: idx })
        },
        expect: [
            "自分.F.疲労: false → true",
            "相手.ライフ: 5 → 4",
            "相手.リザーブ: 10 → 11",
            `自分.手札: ${getCard(ROKU).name}、${getCard(BSET).name} → ${getCard(ROKU).name}`,
            `自分.バースト: なし → ${getCard(BSET).name}`,
        ],
    })
}

console.log("=== B. ガンナー・ドラゴン：自分のバーストがセット済みならセットは起きない ===")
{
    scenario({
        name: "gunner-unblocked-burst-already-set",
        start: { ...atk, me: { hand: [BSET], burst: ROKU, spirits: [{ card: GUNNER }, { card: FEN, label: "F" }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("F") })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
            noChoice(t, "バーストがセット済みならセットできない")
        },
        expect: ["自分.F.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
}

console.log("=== E. ガンナー・ドラゴン：ブロック後にブロッカーが場を離れてバトルが終わったときもセットが起きる ===")
{
    scenario({
        name: "gunner-blocker-left-during-flash",
        start: { ...atk, me: { hand: [BSET], spirits: [{ card: GUNNER }, { card: FEN, label: "F" }] }, opp: { spirits: [{ card: ANT, label: "A" }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("F") })
            t.closeFlash()
            t.act("opp", { type: "block", instanceId: t.id("A") })
            const blockerId = t.id("A")
            const field = t.state.players[t.opp].field.spirits
            field.splice(field.findIndex((x) => x.instanceId === blockerId), 1)
            t.closeFlash()
            const p = pc(t)
            const idx = p.cardIndices?.[0] ?? -1
            assert(p.cardIndices?.length === 1, "ブロッカーが離れてもセットの選択が出る")
            ans(t, { card: idx })
        },
        expect: [
            "自分.F.疲労: false → true",
            "相手.A.場所: フィールド → なし",
            "自分.手札: 武迅衝 → なし",
            "自分.バースト: なし → 武迅衝",
        ],
    })
}

console.log("=== F. 【光芒】：ブロック後にブロッカーが場を離れてバトルが終わったときも、使ったマジックが手札に戻る ===")
{
    scenario({
        name: "kobo-blocker-left-during-flash",
        start: { ...atk, me: { spirits: [{ card: EXUSIA, label: "X" }] }, opp: { spirits: [{ card: ANT, label: "A" }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("X") })
            t.closeFlash()
            t.act("opp", { type: "block", instanceId: t.id("A") })
            // このバトルで武迅衝を使ってトラッシュに置いた状態を作る
            t.state.players[t.me].trashCards.push(BSET)
            const used = { p1: [] as string[], p2: [] as string[] }
            used[t.me] = [BSET]
            t.state.battle!.usedMagicCardIds = used
            const field = t.state.players[t.opp].field.spirits
            field.splice(field.findIndex((x) => x.instanceId === t.id("A")), 1)
            t.closeFlash()
        },
        expect: ["自分.X.疲労: false → true", "相手.A.場所: フィールド → なし", "自分.手札: なし → 武迅衝"],
    })
}

// C・D：巨星望む大樹（合体スピリットのバトル終了時）。合体させるブレイヴとホストは実データから探す（part263 と同じ手法）
const SPIRITS = ALL_CARDS.filter((c) => c.type === "spirit" && c.levels.length > 0)
const BRAVES = ALL_CARDS.filter((c) => c.type === "brave")
const combineBrave = BRAVES.find((b) => {
    const cond = b.braveCondition
    const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
    return terms.length > 0
})
assert(combineBrave !== undefined, "テスト前提：合体条件を持つブレイヴが1枚以上ある")
const braveId = combineBrave!.cardId

function base(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function findHost(): string {
    for (const c of SPIRITS) {
        const probe = createInstance(c.cardId, 3, c.levels[0]!.cores)
        const s = base("host-probe-1065", false)
        s.players.p1.field.spirits = [probe]
        refreshLevelAsOverrides(s)
        if (matchesBraveCondition(s, "p1", probe, braveId)) return c.cardId
    }
    throw new Error("合体条件を満たすホストが見つからない")
}
const hostCardId = findHost()

function setupCombinedHost(s: GameState, pid: PlayerId): { host: ReturnType<typeof createInstance>; brave: ReturnType<typeof createInstance> } {
    const host = createInstance(hostCardId, s.turn, getCard(hostCardId).levels[0]!.cores)
    const brave = createInstance(braveId, s.turn, 0)
    s.players[pid].field.spirits.push(host)
    attachBrave(s, pid, host, brave)
    return { host, brave }
}

console.log("=== C. 巨星望む大樹 Lv2：合体スピリットがブロックされずライフで受けたバトル終了時に分離し、ホストが回復する ===")
{
    const s = base("086-unblocked-lv2", false)
    s.players.p1.field.nexuses.push(createInstance(NEXUS, s.turn, getCard(NEXUS).levels[1]!.cores))
    const { host, brave } = setupCombinedHost(s, "p1")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    assert(host.isRested, "アタック宣言で疲労する")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ブロックされずライフで受ける")
    assert(host.braveRefs === undefined, "バトル終了時に分離する")
    assert(!host.isRested, "分離することでホストが回復する")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "分離したブレイヴはスピリット状態で残る")
}

console.log("=== D. 巨星望む大樹 Lv1：同じ場面でも分離しない・回復しない ===")
{
    const s = base("086-unblocked-lv1", false)
    s.players.p1.field.nexuses.push(createInstance(NEXUS, s.turn, 0))
    const { host } = setupCombinedHost(s, "p1")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ブロックされずライフで受ける")
    assert((host.braveRefs ?? []).length === 1, "Lv1では発揮しないので分離しない")
    assert(host.isRested, "Lv1では回復しない")
}

console.log("すべてのチェックに合格しました 🎉（part1065）")
