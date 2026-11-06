// smoke パート815（BS22 B3：055 合体時BP+を0／050 ブレイヴのコスト0・バトル時破壊・コスト6/7の制限／054 召喚時のコスト指定破壊・アタック時のバースト破棄。BS22_PLAN §1・§2）
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, placeBurst, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import { instBaseCost } from "../../shared/rules/level"
import type { GameState, PlayerId } from "./helpers"

const B055 = "BS22-055" // 剣星竜スターダスト・キャリバーン（赤ブレイヴ・コスト5・合体条件コスト4以上・合体時BP+4000）
const AIVAN = "BS22-050" // 海皇帝アイヴァン（青・コスト5・Lv2=2コア・Lv3=4コア）
const HYDRA = "BS22-054" // インペリアル・ハイドラ（青・コスト8・Lv2=4コア）
const KARAKURI = "BS20-060" // カラクリバッタ（ブレイヴ・コスト4・合体時BP+4000）
const TILOCK = "BS20-055" // ティロック・ケファレ（赤ブレイヴ・コスト3・合体時BP+4000）
const WYARM = "BS05-005" // ワイアーム（赤・コスト4・Lv1(2コア)BP4000）
const DIATRI = "BS04-070" // 戦闘獣ディアトリマー（青・コスト4・Lv1 BP3000）
const ARNOLD = "BS03-089" // ディープ・アーノルド（青・コスト4・Lv1 BP4000）
const DUNSTON = "BS03-081" // 人馬巨兵ダンストン（青・コスト3・Lv1(2コア)BP5000）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・Lv1 BP3000）
const MELT = "BS03-009" // 火吹きメルト（赤・コスト5・Lv1 BP4000）
const TORN = "BS10-009" // トルネードラ（赤・コスト6）
const MITHRIL = "BS05-052" // ミスリル・ゴレム（青・コスト6）
const TIGER = "BS03-099" // 虎拳士タイガ（青・コスト7）
const BOSE = "BS14-018" // ボース・ハンズ（紫・コスト4・Lv2(3コア)『破壊時』2枚ドロー）
const JEFF = "BS03-072" // 槍兵のジェフリー（青・コスト1・系統闘神）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・系統地竜）
const BURST6 = "BS14-094" // 天翔龍神覇（赤マジック・コスト6・バースト持ち）
const BURST3 = "BS14-091" // 双光気弾（赤マジック・コスト3・バースト持ち）

console.log("=== 前提: カードの機械確認 ===")
{
    const stg = JSON.parse(require("node:fs").readFileSync("data/staging/BS22.json", "utf8")) as { cardId: string; name: string; cost: number; type: string; family?: string[] }[]
    const st = (id: string) => stg.find((c) => c.cardId === id)!
    assert(st(B055).name === "剣星竜スターダスト・キャリバーン" && st(B055).type === "brave", "B055は055")
    assert(st(AIVAN).name === "海皇帝アイヴァン" && st(AIVAN).family?.includes("闘神") === true, "AIVANは050（闘神）")
    assert(st(HYDRA).name === "インペリアル・ハイドラ" && st(HYDRA).cost === 8, "HYDRAは054")
    const exp: [string, string, number][] = [[KARAKURI, "カラクリバッタ", 4], [TILOCK, "ティロック・ケファレ", 3], [WYARM, "ワイアーム", 4], [DIATRI, "戦闘獣ディアトリマー", 4], [ARNOLD, "ディープ・アーノルド", 4], [DUNSTON, "人馬巨兵ダンストン", 3], [METAL, "メタルバーン", 3], [MELT, "火吹きメルト", 5], [TORN, "トルネードラ", 6], [MITHRIL, "ミスリル・ゴレム", 6], [TIGER, "虎拳士タイガ", 7], [BOSE, "ボース・ハンズ", 4], [JEFF, "槍兵のジェフリー", 1], [VAN, "ロクケラトプス", 1], [BURST6, "天翔龍神覇", 6], [BURST3, "双光気弾", 3]]
    for (const [id, name, cost] of exp) assert(getCard(id).name === name && getCard(id).cost === cost, `${id}は${name}（コスト${cost}）`)
    assert(getCard(JEFF).family?.includes("闘神") === true, "ジェフリーは闘神")
}

function game(seed: string, phase: "main" | "attack" = "attack", turnPlayer: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = phase
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.life = 5
        p.burst = null
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): void {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

const alive = (s: GameState, pid: PlayerId, id: string): boolean => s.players[pid].field.spirits.some((x) => x.instanceId === id)

// picks は対象の優先、cost は「コスト4/6/7」の選択肢を数字で選ぶ
function settle(s: GameState, picks: string[] = [], cost?: number): void {
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[] }
        const who = pc.pid ?? "p1"
        const next = pc.kind === "target" ? (picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]) : undefined
        const opt = pc.kind === "option" ? ((cost !== undefined ? pc.options?.find((o) => o.includes(String(cost))) : undefined) ?? pc.options?.[0] ?? "") : undefined
        const err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next })
            : opt !== undefined ? act(s, who, { type: "resolveChoice", option: opt }) : act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

function candidatesNow(s: GameState): string[] {
    return ((s.pendingChoice as { candidates?: string[] } | null)?.candidates) ?? []
}

// 攻撃側 atk のアタック→防御側が blk でブロック宣言まで進める
function attackAndBlock(s: GameState, atkPid: PlayerId, atkId: string, blkId: string): string | null {
    const def: PlayerId = atkPid === "p1" ? "p2" : "p1"
    assert(act(s, atkPid, { type: "attack", instanceId: atkId }) === null, "アタックできる")
    settle(s)
    assert(act(s, def, { type: "pass" }) === null, "防御側パス")
    assert(act(s, atkPid, { type: "pass" }) === null, "攻撃側パス")
    return declareBlock(s, def, blkId)
}

console.log("=== 055【合体時】『合体アタック時』：相手の合体スピリットの合体時BP+を0として扱い、その後BP4000以下の相手のスピリット1体を破壊する ===")
for (const pickCombined of [true, false]) {
    const s = game(pickCombined ? "b055-combined" : "b055-other")
    const host = put(s, "p1", WYARM, 2) // BP4000
    combine(s, "p1", host, B055) // 合体時BP+4000 → 8000
    const dia = put(s, "p2", DIATRI, 1) // BP3000
    combine(s, "p2", dia, KARAKURI) // 3000+4000=7000
    const arnold = put(s, "p2", ARNOLD, 1) // BP4000
    const dun = put(s, "p2", DUNSTON, 2) // BP5000
    assert(effectiveBp(s, "p2", dia) === 7000, "前提：相手の合体スピリットは7000")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "055の合体スピリットでアタックできる")
    assert(candidatesNow(s).includes(dia.instanceId), "合体時BP+が0になった相手の合体スピリット（3000）は破壊の候補")
    assert(candidatesNow(s).includes(arnold.instanceId) && !candidatesNow(s).includes(dun.instanceId), "BP4000は候補・BP5000は候補外")
    settle(s, [pickCombined ? dia.instanceId : arnold.instanceId])
    if (pickCombined) {
        assert(!alive(s, "p2", dia.instanceId), "BP+を0にした後のBP3000として破壊される")
        assert(alive(s, "p2", arnold.instanceId), "選ばなかったアーノルドは残る")
    } else {
        assert(!alive(s, "p2", arnold.instanceId) && alive(s, "p2", dia.instanceId), "アーノルドだけ破壊")
        assert(effectiveBp(s, "p2", dia) === 3000, "そのアタックの間、相手の合体スピリットは合体時BP+が0（BP3000）")
    }
    assert(alive(s, "p2", dun.instanceId), "BP5000のダンストンは破壊されない")
    assert(effectiveBp(s, "p1", host) === 8000, "自分の合体スピリットの合体時BP+は0にならない")
    takeLifeAndResolve(s, "p2")
    if (!pickCombined) assert(effectiveBp(s, "p2", dia) === 7000, "アタックが終わると相手の合体スピリットのBPは7000に戻る")
}

console.log("=== 050 Lv1『このスピリットのバトル時』：アタッカーはアタック宣言の時点で発揮（TIMING_CHART §2A）。コスト3/4の相手のスピリット1体を破壊する ===")
{
    const s = game("a050-attack")
    const aivan = put(s, "p1", AIVAN, 1) // Lv1 BP4000
    const blocker = put(s, "p2", VAN, 1)
    const metal = put(s, "p2", METAL, 1) // コスト3
    const arnold = put(s, "p2", ARNOLD, 1) // コスト4
    const melt = put(s, "p2", MELT, 1) // コスト5
    assert(act(s, "p1", { type: "attack", instanceId: aivan.instanceId }) === null, "アタックできる")
    const c = candidatesNow(s)
    assert(c.includes(metal.instanceId) && c.includes(arnold.instanceId), "アタック直後にコスト3・4が候補")
    assert(!c.includes(melt.instanceId) && !c.includes(blocker.instanceId), "コスト5・1は候補外")
    settle(s, [arnold.instanceId])
    assert(!alive(s, "p2", arnold.instanceId), "選んだコスト4のスピリットが破壊される")
    assert(alive(s, "p2", metal.instanceId) && alive(s, "p2", melt.instanceId), "1体だけ破壊（コスト3・5は残る）")
}
{
    const s = game("a050-nocand")
    const aivan = put(s, "p1", AIVAN, 1)
    put(s, "p2", VAN, 1)
    const melt = put(s, "p2", MELT, 1)
    assert(act(s, "p1", { type: "attack", instanceId: aivan.instanceId }) === null, "アタックできる")
    settle(s)
    assert(alive(s, "p2", melt.instanceId), "コスト3/4が居なければ何も破壊されない")
}
{
    const s = game("a050-block", "attack", "p2")
    const aivan = put(s, "p1", AIVAN, 1)
    const atk = put(s, "p2", VAN, 1)
    const metal = put(s, "p2", METAL, 1)
    const melt = put(s, "p2", MELT, 1)
    assert(attackAndBlock(s, "p2", atk.instanceId, aivan.instanceId) === null, "050でブロックできる")
    settle(s, [metal.instanceId])
    assert(!alive(s, "p2", metal.instanceId) && alive(s, "p2", melt.instanceId), "ブロックしたときもバトル時にコスト3を破壊する")
}

console.log("=== 050 Lv2『お互いのアタックステップ』：コスト6/7のスピリットはアタック/ブロックできない（Lv1は制限なし） ===")
{
    const s = game("a050-lv2-atk")
    put(s, "p1", AIVAN, 2)
    const torn = put(s, "p1", TORN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: torn.instanceId }) !== null, "コスト6の自分のスピリットはアタックできない")
}
{
    const s = game("a050-lv2-atk-melt")
    put(s, "p1", AIVAN, 2)
    const melt = put(s, "p1", MELT, 1)
    assert(act(s, "p1", { type: "attack", instanceId: melt.instanceId }) === null, "コスト5はアタックできる")
}
{
    const s = game("a050-lv1-atk")
    put(s, "p1", AIVAN, 1)
    const torn = put(s, "p1", TORN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: torn.instanceId }) === null, "Lv1ではコスト6もアタックできる")
}
{
    const s = game("a050-lv2-opp-atk", "attack", "p2")
    put(s, "p1", AIVAN, 2)
    const tiger = put(s, "p2", TIGER, 1)
    assert(act(s, "p2", { type: "attack", instanceId: tiger.instanceId }) !== null, "相手のコスト7もアタックできない（お互い）")
}
{
    const s = game("a050-lv2-block")
    put(s, "p1", AIVAN, 2)
    const atk = put(s, "p1", VAN, 1)
    const tiger = put(s, "p2", TIGER, 1)
    const mith = put(s, "p2", MITHRIL, 1)
    const melt = put(s, "p2", MELT, 1)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック")
    assert(act(s, "p2", { type: "pass" }) === null && act(s, "p1", { type: "pass" }) === null, "フラッシュを両者パス")
    assert(declareBlock(s, "p2", tiger.instanceId) !== null, "コスト7はブロックできない")
    assert(declareBlock(s, "p2", mith.instanceId) !== null, "コスト6はブロックできない")
    assert(declareBlock(s, "p2", melt.instanceId) === null, "コスト5はブロックできる")
}

console.log("=== 050『お互いの合体スピリットのブレイヴすべてをコスト0として扱う』：コスト7相当の合体スピリットがコスト4として扱われる ===")
{
    const s = game("a050-brave0-atk")
    put(s, "p1", AIVAN, 2)
    const host = put(s, "p1", WYARM, 2)
    combine(s, "p1", host, TILOCK) // 4+3=7 → ブレイヴ0で4
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "自分の合体スピリットはブレイヴ分が0なのでアタックできる")
}
{
    const s = game("a050-brave0-block")
    put(s, "p1", AIVAN, 2)
    const atk = put(s, "p1", VAN, 1)
    const host = put(s, "p2", DIATRI, 1)
    combine(s, "p2", host, TILOCK) // 4+3=7 → 相手のブレイヴも0で4
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック")
    assert(act(s, "p2", { type: "pass" }) === null && act(s, "p1", { type: "pass" }) === null, "フラッシュを両者パス")
    assert(declareBlock(s, "p2", host.instanceId) === null, "相手の合体スピリットもブレイヴが0なのでブロックできる")
}

console.log("=== 054『召喚時』：ブレイヴすべてをコスト0として扱い、コスト4/6/7から指定→そのコストのスピリットすべてを破壊（効果は発揮されない） ===")
function summon054(seed: string): GameState {
    const s = game(seed, "main")
    s.players.p1.hand = [HYDRA]
    return s
}
{
    const s = summon054("h054-cost4")
    const wy = put(s, "p1", WYARM, 2) // 自分もコスト4
    const mine5 = put(s, "p1", MELT, 1)
    const dia = put(s, "p2", DIATRI, 1)
    const bose = put(s, "p2", BOSE, 3) // Lv2『破壊時』2枚ドロー
    const mel2 = put(s, "p2", MELT, 1)
    const hand = s.players.p2.hand.length
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ハイドラを召喚できる")
    settle(s, [], 4)
    assert(!alive(s, "p1", wy.instanceId) && !alive(s, "p2", dia.instanceId) && !alive(s, "p2", bose.instanceId), "コスト4のスピリットすべて（自分のも）が破壊される")
    assert(alive(s, "p1", mine5.instanceId) && alive(s, "p2", mel2.instanceId), "コスト5は残る")
    assert(s.players.p2.hand.length === hand, "この効果で破壊したスピリットの『破壊時』は発揮されない（ドローなし）")
}
{
    const s = summon054("h054-cost7")
    const tiger = put(s, "p1", TIGER, 1)
    const mith = put(s, "p2", MITHRIL, 1)
    const dia = put(s, "p2", DIATRI, 1)
    combine(s, "p2", dia, TILOCK) // 4+3=7 だがブレイヴはコスト0で扱うので4
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ハイドラを召喚できる")
    settle(s, [], 7)
    assert(!alive(s, "p1", tiger.instanceId), "コスト7のタイガは破壊される")
    assert(alive(s, "p2", dia.instanceId), "合体スピリットのブレイヴはコスト0なので7ではなく残る")
    assert(alive(s, "p2", mith.instanceId), "コスト6は残る")
    assert(instBaseCost(dia) === 7, "解決が終わると合体スピリットのコストはホスト＋ブレイヴの7に戻る（Q4418・Q4419）")
}
{
    const s = summon054("h054-brave-cost4")
    const tiger = put(s, "p1", TIGER, 1)
    const dia = put(s, "p2", DIATRI, 1)
    combine(s, "p2", dia, TILOCK)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ハイドラを召喚できる")
    settle(s, [], 4)
    assert(!alive(s, "p2", dia.instanceId), "ブレイヴ0としてコスト4の合体スピリットは破壊される")
    assert(alive(s, "p1", tiger.instanceId), "コスト7は残る")
}

console.log("=== 054 Lv2『自分のアタックステップ』：闘神/海首の自分のスピリットがアタックしたとき、相手のバーストの内容を見てコスト6以上なら破棄 ===")
function burstGame(seed: string, hydraCores: number, burstId: string): GameState {
    const s = game(seed)
    put(s, "p1", HYDRA, hydraCores)
    placeBurst(s, "p2", burstId)
    return s
}
{
    const s = burstGame("h054-burst6", 4, BURST6)
    const jeff = put(s, "p1", JEFF, 1)
    assert(act(s, "p1", { type: "attack", instanceId: jeff.instanceId }) === null, "闘神のスピリットでアタック")
    settle(s)
    assert(s.players.p2.burst === null && s.players.p2.trashCards.includes(BURST6), "コスト6のバーストは破棄される")
}
{
    const s = burstGame("h054-burst3", 4, BURST3)
    const jeff = put(s, "p1", JEFF, 1)
    assert(act(s, "p1", { type: "attack", instanceId: jeff.instanceId }) === null, "闘神のスピリットでアタック")
    settle(s)
    assert(s.players.p2.burst === BURST3 && !s.players.p2.trashCards.includes(BURST3), "コスト3のバーストは伏せたまま残る")
}
{
    const s = burstGame("h054-nofamily", 4, BURST6)
    const van = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "系統の違うスピリットでアタック")
    settle(s)
    assert(s.players.p2.burst === BURST6, "闘神/海首でなければバーストは見ない・破棄しない")
}
{
    const s = burstGame("h054-lv1", 1, BURST6)
    const jeff = put(s, "p1", JEFF, 1)
    assert(act(s, "p1", { type: "attack", instanceId: jeff.instanceId }) === null, "闘神のスピリットでアタック")
    settle(s)
    assert(s.players.p2.burst === BURST6, "Lv1ではこの効果は働かない")
}

console.log("すべてのチェックに合格しました 🎉（part815）")
