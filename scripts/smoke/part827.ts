// smoke パート827（BS22 白の残り：028・029・030・033・035・036・061・080・X04・X13-04 の各効果節。BS22_PLAN §1・§2、BS19_PLAN §2.1 の確定読み）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, placeBurst, refreshLevelAsOverrides, resolveAction, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const CALI = "BS22-028" // キャリバラー（白・コスト2・Lvコア1/2）
const DOBER = "BS22-029" // ダーク・ドーベル（白・コスト3・Lvコア1/2）
const MATA = "BS22-030" // 透輝亀マタマタ（白・コスト3・Lvコア1/2）
const JAKO = "BS22-033" // ジャコウ・キャット（白・コスト4・Lvコア1/2）
const BISON = "BS22-035" // ダーク・バイソン（白・コスト5・Lvコア1/2）
const MORI = "BS22-036" // 氷剣使モリガン（白・コスト8・Lvコア1/3）
const HORN = "BS22-061" // 近衛機ホルノート1号（白・ブレイヴ・コスト4・合体条件コスト4以上）
const PHASE = "BS22-080" // フェーズチェンジ（白・マジック・コスト4・フラッシュ）
const X04 = "BS22-X04" // 黒皇機獣ダークネス・グリフォン（白・コスト8・Lvコア1/2/4）
const LEONX = "X13-04" // 獅機鎧神ヴァルハランス・レオ（白・コスト7・Lvコア1/2/4）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・Lv1BP3000・効果なし）
const SABER = "BS01-003" // テラノセイバー（赤・コスト2・BP4000）
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・BP6000・効果なし）
const KIJI = "BS20-020" // ケンゴーキジ（緑・コスト2・Lv2【強化】疲労、Lv2はコア3）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3）紫シンボル確保用
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・Lv1BP3000・効果なし）
const MATCH = "BS01-056" // マッチュラ（緑・コスト3・召喚時：相手は手札1枚を破棄）
const DRAT = "BS20-046" // ドラットフィッシュ（青・コスト2・系統「異合」・効果なし）
const KARAKURI = "BS20-060" // カラクリバッタ（緑・ブレイヴ・合体条件コスト4以上）
const VALK = "BS01-097" // 飛龍ヴァルキュリウス（白・コスト8）
const LEO = "BS16-043" // スペードビースト・レオ（黄・コスト6・効果なし）
const HYOGAN = "SD06-016" // 絶甲氷盾（白・マジック・バースト）

console.log("=== 前提: カードの機械確認 ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS22.json", "utf8")) as { cardId: string; name: string; type: string; colors: string[]; cost: number; levels: { cores: number }[] }[]
    const by = (id: string) => staging.find((c) => c.cardId === id)
    const chk = (id: string, name: string, type: string, cost: number, cores: string) => {
        const c = by(id)
        assert(c?.name === name && c.type === type && c.cost === cost && c.colors.join() === "white" && c.levels.map((l) => l.cores).join("/") === cores, `${id}は白の${name}（${type}・コスト${cost}・Lvコア${cores}）`)
    }
    chk(CALI, "キャリバラー", "spirit", 2, "1/2")
    chk(DOBER, "ダーク・ドーベル", "spirit", 3, "1/2")
    chk(MATA, "透輝亀マタマタ", "spirit", 3, "1/2")
    chk(JAKO, "ジャコウ・キャット", "spirit", 4, "1/2")
    chk(BISON, "ダーク・バイソン", "spirit", 5, "1/2")
    chk(MORI, "氷剣使モリガン", "spirit", 8, "1/3")
    chk(HORN, "近衛機ホルノート1号", "brave", 4, "1")
    chk(PHASE, "フェーズチェンジ", "magic", 4, "")
    chk(X04, "黒皇機獣ダークネス・グリフォン", "spirit", 8, "1/2/4")
    chk(LEONX, "獅機鎧神ヴァルハランス・レオ", "spirit", 7, "1/2/4")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).effect === "", "VANは効果なしのロクケラトプス")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).cost === 5 && getCard(STIRA).effect === "", "STIRAはコスト5の効果なし")
    assert(getCard(SABER).name === "テラノセイバー" && getCard(SABER).cost === 2, "SABERはコスト2")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).cost === 6 && getCard(TARAN).effect === "", "TARANはコスト6の効果なし")
    assert(getCard(KIJI).name === "ケンゴーキジ" && getCard(KIJI).effect.includes("Lv2【強化】"), "KIJIはLv2に【強化】を持つ")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).symbol.join() === "purple", "GRIPは紫シンボル")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).colors.join() === "white" && getCard(BELL).levels[0]!.bp === 3000 && getCard(BELL).effect === "", "BELLは白・BP3000・効果なし")
    assert(getCard(MATCH).name === "マッチュラ" && getCard(MATCH).cost === 3 && getCard(MATCH).effect.includes("手札1枚を破棄"), "MATCHは召喚時に手札を破棄させる")
    assert(getCard(DRAT).name === "ドラットフィッシュ" && getCard(DRAT).family.includes("異合") && getCard(DRAT).effect === "", "DRATは系統「異合」の効果なし")
    assert(getCard(KARAKURI).name === "カラクリバッタ" && getCard(KARAKURI).type === "brave", "KARAKURIはブレイヴ")
    assert(getCard(VALK).name === "飛龍ヴァルキュリウス" && getCard(VALK).cost === 8 && getCard(VALK).type === "spirit", "VALKはコスト8のスピリット")
    assert(getCard(LEO).name === "スペードビースト・レオ" && getCard(LEO).cost === 6, "LEOはコスト6")
    assert(getCard(HYOGAN).name === "絶甲氷盾" && getCard(HYOGAN).type === "magic", "HYOGANはバースト持ちのマジック")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
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

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): ReturnType<typeof createInstance> {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

function turnOf(s: GameState, pid: PlayerId): void {
    s.turnPlayer = pid
    s.priorityPlayer = pid
}

type Answer = "accept" | "decline"
// target は picks 優先。確認は accept＝先頭の選択肢、decline＝選択肢を付けずに応答
function settle(s: GameState, answer: Answer = "accept", picks: string[] = []): void {
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (answer === "decline") err = act(s, who, { type: "resolveChoice" })
        else if (pc.kind === "option") err = act(s, who, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// 防御側が先にパス→攻撃側パス→ブロックせずライフで受ける
function unblocked(s: GameState, attacker: PlayerId, defender: PlayerId, answer: Answer = "accept"): void {
    settle(s, answer)
    assert(act(s, defender, { type: "pass" }) === null, "アタック直後は防御側が先にパス")
    assert(act(s, attacker, { type: "pass" }) === null, "攻撃側もパス")
    settle(s, answer)
    takeLifeAndResolve(s, defender)
    settle(s, answer)
}

// 相手（p2）がアタックして、防御側（p1）が両者パスのあとブロック宣言できる状態にする
function opponentAttacks(s: GameState, attackerId: string, answer: Answer = "accept", picks: string[] = []): void {
    turnOf(s, "p2")
    assert(act(s, "p2", { type: "attack", instanceId: attackerId }) === null, "相手がアタック")
    settle(s, answer, picks)
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
}

const alive = (s: GameState, pid: PlayerId, inst: { instanceId: string }): boolean => s.players[pid].field.spirits.some((x) => x.instanceId === inst.instanceId)

// 相手（p2）の発生源から p1 の個体 target へ色つきの破壊効果を当てる
function destroyBy(s: GameState, target: { instanceId: string }, color: "red" | "purple" | "green" | "white" | "yellow" | "blue", type: "spirit" | "magic" = "spirit"): void {
    const src = put(s, "p2", VAN, 1)
    resolveAction(s, "p2", type === "spirit" ? src : null, { type: "destroy", count: 1 }, target.instanceId, [color], type)
    settle(s, "accept", [target.instanceId])
}

console.log("=== 028 Lv1･Lv2：このスピリットはアタックできない ===")
for (const cores of [1, 2]) {
    const s = game(`cali-attack-${cores}`)
    const cali = put(s, "p1", CALI, cores)
    assert(act(s, "p1", { type: "attack", instanceId: cali.instanceId }) !== null, `Lv${cores}のキャリバラーはアタックできない`)
    const van = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ほかのスピリットはアタックできる")
}

console.log("=== 028 Lv2：相手のスピリットの効果を受けない（Lv1・相手のマジックの効果は受ける） ===")
{
    const s = game("cali-lv2-spirit")
    const cali = put(s, "p1", CALI, 2)
    destroyBy(s, cali, "red", "spirit")
    assert(alive(s, "p1", cali), "Lv2は相手のスピリットの破壊効果を受けず残る")
}
{
    const s = game("cali-lv1-spirit")
    const cali = put(s, "p1", CALI, 1)
    destroyBy(s, cali, "red", "spirit")
    assert(!alive(s, "p1", cali), "Lv1は相手のスピリットの破壊効果を受けて破壊される")
}
{
    const s = game("cali-lv2-magic")
    const cali = put(s, "p1", CALI, 2)
    destroyBy(s, cali, "red", "magic")
    assert(!alive(s, "p1", cali), "Lv2でも相手のマジックの破壊効果は受ける")
}

console.log("=== 029 Lv1･Lv2『ブロック時』：【強化】を持つ相手のスピリット1体を手札に戻す（持たないものは戻さない） ===")
for (const [label, cores] of [["Lv1", 1], ["Lv2", 2]] as const) {
    const s = game(`dober-${label}`)
    const dober = put(s, "p1", DOBER, cores)
    const attacker = put(s, "p2", STIRA, 1)
    const kyoka = put(s, "p2", KIJI, 3) // Lv2＝【強化】あり
    const noKyoka = put(s, "p2", KIJI, 1) // Lv1＝【強化】なし
    const van = put(s, "p2", VAN, 1)
    opponentAttacks(s, attacker.instanceId)
    assert(declareBlock(s, "p1", dober.instanceId) === null, `${label}のドーベルでブロック`)
    settle(s, "accept", [kyoka.instanceId])
    assert(!alive(s, "p2", kyoka) && s.players.p2.hand.includes(KIJI), `${label}：【強化】を持つケンゴーキジは手札に戻る`)
    assert(alive(s, "p2", noKyoka) && alive(s, "p2", van) && alive(s, "p2", attacker), `${label}：【強化】を持たないスピリットは戻らない`)
}
{
    const s = game("dober-none")
    const dober = put(s, "p1", DOBER, 1)
    const attacker = put(s, "p2", STIRA, 1)
    const van = put(s, "p2", VAN, 1)
    opponentAttacks(s, attacker.instanceId)
    assert(declareBlock(s, "p1", dober.instanceId) === null, "ドーベルでブロック")
    settle(s)
    assert(alive(s, "p2", van) && alive(s, "p2", attacker) && s.players.p2.hand.length === 0, "【強化】持ちがいなければ何も戻らない")
}

console.log("=== 030 Lv1･Lv2【重装甲：紫】：相手の紫の効果を受けない（赤は受ける）。Lv2：系統「異合」の自分のスピリットすべてに【重装甲：紫】を与える ===")
for (const cores of [1, 2]) {
    const s = game(`mata-armor-${cores}`)
    const mata = put(s, "p1", MATA, cores)
    destroyBy(s, mata, "purple")
    assert(alive(s, "p1", mata), `Lv${cores}は紫の効果で破壊されない`)
    destroyBy(s, mata, "red")
    assert(!alive(s, "p1", mata), `Lv${cores}でも赤の効果では破壊される`)
}
{
    const s = game("mata-grant-lv2")
    put(s, "p1", MATA, 2)
    const ihe = put(s, "p1", DRAT, 1) // 異合
    const van = put(s, "p1", VAN, 1) // 異合でない
    destroyBy(s, ihe, "purple")
    assert(alive(s, "p1", ihe), "Lv2：異合のスピリットは紫の効果で破壊されない")
    destroyBy(s, ihe, "red")
    assert(!alive(s, "p1", ihe), "与えられるのは紫だけなので赤では破壊される")
    destroyBy(s, van, "purple")
    assert(!alive(s, "p1", van), "異合でないスピリットには与えない")
}
{
    const s = game("mata-grant-lv1")
    put(s, "p1", MATA, 1)
    const ihe = put(s, "p1", DRAT, 1)
    destroyBy(s, ihe, "purple")
    assert(!alive(s, "p1", ihe), "Lv1は異合のスピリットに与えない")
}

console.log("=== 033 『召喚時』：相手のスピリット1体を手札に戻す。【連鎖：紫】自分はデッキから1枚ドロー（紫シンボルが無ければしない・Lv2：自分の手札は相手の効果を受けない） ===")
for (const purple of [true, false]) {
    const s = game(`jako-summon-${purple}`)
    s.phase = "main"
    if (purple) put(s, "p1", GRIP, 1)
    const target = put(s, "p2", VAN, 1)
    s.players.p1.hand = [JAKO]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ジャコウ・キャットを召喚")
    settle(s, "accept", [target.instanceId])
    assert(!alive(s, "p2", target) && s.players.p2.hand.includes(VAN), "相手のスピリット1体が手札に戻る")
    assert(s.players.p1.hand.length === (purple ? 1 : 0), purple ? "紫シンボルがあれば1枚ドロー" : "紫シンボルが無ければドローしない")
}
{
    const s = game("jako-summon-nobody")
    s.phase = "main"
    put(s, "p1", GRIP, 1)
    s.players.p1.hand = [JAKO]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "相手のスピリットがいなくても召喚できる")
    settle(s)
    assert(s.players.p1.hand.length === 1, "戻す相手がいなくても連鎖のドローは発揮する（Q773）")
}
for (const [label, cores, kept] of [["Lv2", 2, 2], ["Lv1", 1, 1]] as const) {
    const s = game(`jako-hand-${label}`)
    s.phase = "main"
    turnOf(s, "p2")
    put(s, "p1", JAKO, cores)
    s.players.p1.hand = [VAN, VAN]
    s.players.p2.hand = [MATCH]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手がマッチュラを召喚")
    settle(s)
    assert(s.players.p1.hand.length === kept, `${label}：相手の効果で手札を破棄させられた後の枚数は${kept}枚（${s.players.p1.hand.length}）`)
}

console.log("=== 035 『ブロック時』：BP+4000。【連鎖：紫】疲労状態のコスト5以下の相手のスピリット1体を破壊する ===")
for (const purple of [true, false]) {
    const s = game(`bison-block-${purple}`)
    if (purple) put(s, "p1", GRIP, 1)
    const bison = put(s, "p1", BISON, 1) // Lv1・BP4000
    const attacker = put(s, "p2", TARAN, 1) // 疲労するコスト6
    const restedLow = put(s, "p2", SABER, 1)
    restedLow.isRested = true
    const readyLow = put(s, "p2", VAN, 1)
    const restedHigh = put(s, "p2", TARAN, 1)
    restedHigh.isRested = true
    opponentAttacks(s, attacker.instanceId)
    assert(declareBlock(s, "p1", bison.instanceId) === null, "バイソンでブロック")
    settle(s, "accept", [restedLow.instanceId])
    assert(effectiveBp(s, "p1", bison) === 8000, `ブロック時にBP+4000（4000→${effectiveBp(s, "p1", bison)}）`)
    assert(alive(s, "p2", restedLow) === !purple, purple ? "紫シンボルがあれば疲労状態のコスト5以下は破壊される" : "紫シンボルが無ければ破壊しない")
    assert(alive(s, "p2", readyLow) && alive(s, "p2", restedHigh), "回復状態のもの・コスト6は破壊されない")
}
for (const [label, cores, expect] of [["Lv2", 2, ["red", "white", "green"]], ["Lv1", 1, []]] as const) {
    for (const color of ["red", "green", "white"] as const) {
        const s = game(`bison-armor-${label}-${color}`)
        const bison = put(s, "p1", BISON, cores)
        destroyBy(s, bison, color)
        assert(alive(s, "p1", bison) === (expect as readonly string[]).includes(color), `${label}：${color}の効果で${(expect as readonly string[]).includes(color) ? "破壊されない" : "破壊される"}`)
    }
}
for (const color of ["purple", "blue", "yellow"] as const) {
    const s = game(`bison-armor-lv2-${color}`)
    const bison = put(s, "p1", BISON, 2)
    destroyBy(s, bison, color)
    assert(!alive(s, "p1", bison), `Lv2【重装甲：赤/緑/白】でも${color}の効果では破壊される`)
}

console.log("=== 036 『相手のアタックステップ』疲労状態でブロックできる ===")
{
    const s = game("mori-rested-block")
    const mori = put(s, "p1", MORI, 1)
    mori.isRested = true
    const attacker = put(s, "p2", STIRA, 1)
    opponentAttacks(s, attacker.instanceId)
    assert(declareBlock(s, "p1", mori.instanceId) === null, "疲労状態のモリガンはブロックできる")
}
{
    const s = game("van-rested-block")
    const van = put(s, "p1", VAN, 1)
    van.isRested = true
    const attacker = put(s, "p2", STIRA, 1)
    opponentAttacks(s, attacker.instanceId)
    assert(declareBlock(s, "p1", van.instanceId) !== null, "対照：疲労状態のほかのスピリットはブロックできない")
}

console.log("=== 036 『ブロック時』相手の合体スピリットをブロックしたとき BP+8000（合体でなければ+8000しない） ===")
for (const combined of [true, false]) {
    const s = game(`mori-block-${combined}`)
    const mori = put(s, "p1", MORI, 1) // Lv1・BP7000
    const attacker = put(s, "p2", STIRA, 1)
    if (combined) combine(s, "p2", attacker, KARAKURI)
    opponentAttacks(s, attacker.instanceId)
    assert(declareBlock(s, "p1", mori.instanceId) === null, "モリガンでブロック")
    settle(s)
    assert(effectiveBp(s, "p1", mori) === (combined ? 15000 : 7000), `相手が${combined ? "合体スピリットなら7000+8000" : "合体でなければ7000のまま"}（${effectiveBp(s, "p1", mori)}）`)
}

console.log("=== 036 【合体時】Lv2『合体アタック時』相手のバーストがセットされているとき、このバトルの間ブロックされない ===")
for (const [label, cores, burst, blockable] of [["Lv2・バーストあり", 3, true, false], ["Lv2・バーストなし", 3, false, true], ["Lv1・バーストあり", 1, true, true]] as const) {
    const s = game(`mori-unblockable-${label}`)
    const mori = put(s, "p1", MORI, cores)
    combine(s, "p1", mori, KARAKURI)
    const blocker = put(s, "p2", VAN, 1)
    if (burst) placeBurst(s, "p2", HYOGAN)
    assert(act(s, "p1", { type: "attack", instanceId: mori.instanceId }) === null, "合体したモリガンでアタック")
    settle(s)
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert((declareBlock(s, "p2", blocker.instanceId) === null) === blockable, `${label}：ブロック${blockable ? "できる" : "できない"}`)
}

console.log("=== 061 【合体時】自分の手札は相手の効果を受けない（合体していなければ受ける） ===")
for (const combined of [true, false]) {
    const s = game(`horn-hand-${combined}`)
    s.phase = "main"
    turnOf(s, "p2")
    const host = put(s, "p1", STIRA, 1) // コスト5＝合体条件を満たす
    if (combined) combine(s, "p1", host, HORN)
    s.players.p1.hand = [VAN, VAN]
    s.players.p2.hand = [MATCH]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手がマッチュラを召喚")
    settle(s)
    assert(s.players.p1.hand.length === (combined ? 2 : 1), `${combined ? "合体中は手札を破棄させられない" : "合体していなければ手札を1枚破棄させられる"}（${s.players.p1.hand.length}）`)
}

console.log("=== 080 フラッシュ：このターンの間、自分のライフは相手のスピリットの効果とコスト4以上の相手のスピリットのアタックでは0にならない ===")
for (const [label, attackerId, cast, survives] of [["コスト5のアタック・使用", STIRA, true, true], ["コスト1のアタック・使用", VAN, true, false], ["コスト5のアタック・使用しない", STIRA, false, false]] as const) {
    const s = game(`phase-attack-${label}`)
    turnOf(s, "p2")
    s.players.p1.life = 1
    s.players.p1.hand = cast ? [PHASE] : []
    const atk = put(s, "p2", attackerId, 1)
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    if (cast) {
        assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュでフェーズチェンジを使用")
        settle(s, "decline")
    }
    takeLifeAndResolve(s, "p1")
    settle(s, "decline")
    assert((s.winner === null || s.winner === undefined) === survives, `${label}：${survives ? "ライフは0にならず敗北しない" : "ライフが0になり敗北する"}（life=${s.players.p1.life}）`)
    if (survives) assert(s.players.p1.life >= 1, "ライフは1以上のまま")
}
for (const cast of [true, false]) {
    const s = game(`phase-effect-${cast}`)
    turnOf(s, "p2")
    s.players.p1.life = 1
    s.players.p1.hand = cast ? [PHASE] : []
    const atk = put(s, "p2", VAN, 1)
    const src = put(s, "p2", VAN, 1)
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    if (cast) assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュでフェーズチェンジを使用")
    settle(s, "decline")
    resolveAction(s, "p2", src, { type: "lifeCrush", count: 1 })
    assert((s.winner === null || s.winner === undefined) === cast, `相手のスピリットの効果でライフを減らされるとき：${cast ? "0にならず敗北しない" : "ライフ0で敗北する"}`)
}

console.log("=== 080 【連鎖：紫】自分のトラッシュにあるコスト8以上のスピリット1枚を召喚できる（断れる・紫シンボルが無ければ出ない・コスト7以下は出ない） ===")
for (const [label, purple, answer, summoned] of [["紫あり・受ける", true, "accept", true], ["紫あり・断る", true, "decline", false], ["紫なし", false, "accept", false]] as const) {
    const s = game(`phase-chain-${label}`)
    if (purple) put(s, "p1", GRIP, 1)
    const atk = put(s, "p1", VAN, 1)
    s.players.p1.hand = [PHASE]
    s.players.p1.trashCards = [LEO, VALK]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュでフェーズチェンジを使用")
    settle(s, answer)
    assert(s.players.p1.field.spirits.some((x) => x.cardId === VALK) === summoned, `${label}：ヴァルキュリウスが${summoned ? "召喚される" : "召喚されない"}`)
    assert(!s.players.p1.field.spirits.some((x) => x.cardId === LEO), "コスト6のレオは対象外で召喚されない")
    assert(s.players.p1.trashCards.includes(VALK) === !summoned, "召喚したカードはトラッシュから出る")
    takeLifeAndResolve(s, "p2")
}

console.log("=== X04 『召喚時』相手のスピリット2体までを手札に戻す。【連鎖：紫】自分はデッキから2枚ドロー ===")
for (const purple of [true, false]) {
    const s = game(`x04-summon-${purple}`)
    s.phase = "main"
    if (purple) put(s, "p1", GRIP, 1)
    const a = put(s, "p2", VAN, 1)
    const b = put(s, "p2", VAN, 1)
    const c = put(s, "p2", VAN, 1)
    s.players.p1.hand = [X04]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "グリフォンを召喚")
    settle(s, "accept", [a.instanceId, b.instanceId])
    assert(s.players.p2.hand.length === 2 && !alive(s, "p2", a) && !alive(s, "p2", b) && alive(s, "p2", c), "相手の2体が手札に戻り、残りの1体は場に残る")
    assert(s.players.p1.hand.length === (purple ? 2 : 0), purple ? "紫シンボルがあれば2枚ドロー" : "紫シンボルが無ければドローしない")
}

console.log("=== X04 【合体中】Lv2･Lv3『アタック/ブロック時』ターンに1回回復する。【連鎖：紫】相手のスピリットのコア2個を相手のトラッシュに置く ===")
for (const [label, cores, combined, purple, refreshes] of [
    ["Lv2・合体・紫", 2, true, true, true],
    ["Lv2・合体・紫なし", 2, true, false, true],
    ["Lv3・合体・紫", 4, true, true, true],
    ["Lv2・合体なし", 2, false, true, false],
    ["Lv1・合体", 1, true, true, false],
] as const) {
    const s = game(`x04-attack-${label}`)
    if (purple) put(s, "p1", GRIP, 1)
    const x04 = put(s, "p1", X04, cores)
    if (combined) combine(s, "p1", x04, KARAKURI)
    const target = put(s, "p2", TARAN, 3)
    assert(act(s, "p1", { type: "attack", instanceId: x04.instanceId }) === null, "グリフォンでアタック")
    settle(s)
    assert(x04.isRested === !refreshes, `${label}：アタック時に${refreshes ? "回復する" : "回復しない"}`)
    assert(s.players.p2.trashCores === (refreshes && purple ? 2 : 0), `${label}：相手のトラッシュのコア ${refreshes && purple ? "2個" : "0個"}（${s.players.p2.trashCores}）`)
    assert(target.cores === (refreshes && purple ? 1 : 3), `${label}：相手のスピリットのコアは${refreshes && purple ? "1個" : "3個のまま"}`)
}
{
    const s = game("x04-once-per-turn")
    put(s, "p1", GRIP, 1)
    const x04 = put(s, "p1", X04, 2)
    combine(s, "p1", x04, KARAKURI)
    put(s, "p2", TARAN, 3)
    put(s, "p2", TARAN, 3)
    assert(act(s, "p1", { type: "attack", instanceId: x04.instanceId }) === null, "1回目のアタック")
    unblocked(s, "p1", "p2")
    assert(!x04.isRested && s.players.p2.trashCores === 2, "1回目：回復して連鎖でコア2個がトラッシュへ")
    assert(act(s, "p1", { type: "attack", instanceId: x04.instanceId }) === null, "回復したので2回目のアタック")
    settle(s)
    assert(x04.isRested, "2回目：ターンに1回を使い切っているので回復しない")
    assert(s.players.p2.trashCores === 2, "2回目：回復が発揮されないので連鎖も出ない")
}
{
    const s = game("x04-block")
    put(s, "p1", GRIP, 1)
    const x04 = put(s, "p1", X04, 2)
    combine(s, "p1", x04, KARAKURI)
    const attacker = put(s, "p2", TARAN, 3)
    opponentAttacks(s, attacker.instanceId)
    assert(declareBlock(s, "p1", x04.instanceId) === null, "合体したグリフォンでブロック")
    settle(s)
    assert(s.players.p2.trashCores === 2, "ブロック時にも連鎖でコア2個が相手のトラッシュへ")
}

console.log("=== X13-04 Lv1〜3【重装甲：紫/緑/白/黄】（赤・青の効果は受ける） ===")
for (const cores of [1, 2, 4]) {
    for (const [color, immune] of [["purple", true], ["green", true], ["white", true], ["yellow", true], ["red", false], ["blue", false]] as const) {
        const s = game(`leo-armor-${cores}-${color}`)
        const leo = put(s, "p1", LEONX, cores)
        destroyBy(s, leo, color)
        assert(alive(s, "p1", leo) === immune, `コア${cores}：${color}の効果で${immune ? "破壊されない" : "破壊される"}`)
    }
}

console.log("=== X13-04 『相手のアタックステップ』相手のスピリットがアタックしたとき、自分のスピリット1体を回復させる（自分のアタックでは回復しない） ===")
{
    const s = game("leo-refresh-opp")
    put(s, "p1", LEONX, 1)
    const rested1 = put(s, "p1", VAN, 1)
    const rested2 = put(s, "p1", VAN, 1)
    rested1.isRested = true
    rested2.isRested = true
    const atk = put(s, "p2", STIRA, 1)
    turnOf(s, "p2")
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    settle(s, "accept", [rested1.instanceId])
    assert(!rested1.isRested && rested2.isRested, "選んだ1体だけが回復する")
}
{
    const s = game("leo-refresh-own")
    const leo = put(s, "p1", LEONX, 1)
    const rested = put(s, "p1", VAN, 1)
    rested.isRested = true
    assert(act(s, "p1", { type: "attack", instanceId: leo.instanceId }) === null, "自分のレオでアタック")
    settle(s)
    assert(rested.isRested && leo.isRested, "自分のアタックでは回復しない")
}

console.log("=== X13-04 Lv2･Lv3『バトル時』自分の白のスピリット1体を疲労させることで、このスピリットをBP+(疲労させたスピリットのBP) ===")
for (const [label, cores, answer, withWhite, gain] of [
    ["Lv2・受ける", 2, "accept", true, true],
    ["Lv2・断る", 2, "decline", true, false],
    ["Lv2・白がいない", 2, "accept", false, false],
    ["Lv1", 1, "accept", true, false],
] as const) {
    const s = game(`leo-battle-${label}`)
    const leo = put(s, "p1", LEONX, cores)
    const bell = put(s, "p1", withWhite ? BELL : VAN, 1) // BP3000
    const base = effectiveBp(s, "p1", leo)
    assert(act(s, "p1", { type: "attack", instanceId: leo.instanceId }) === null, "レオでアタック")
    settle(s, answer, [bell.instanceId])
    assert(bell.isRested === gain, `${label}：白のスピリットが${gain ? "疲労する" : "疲労しない"}`)
    assert(effectiveBp(s, "p1", leo) === base + (gain ? 3000 : 0), `${label}：BPは${gain ? "+3000" : "そのまま"}（${base}→${effectiveBp(s, "p1", leo)}）`)
}
{
    const s = game("leo-battle-block")
    const leo = put(s, "p1", LEONX, 2)
    const bell = put(s, "p1", BELL, 1)
    const base = effectiveBp(s, "p1", leo)
    const attacker = put(s, "p2", STIRA, 1)
    opponentAttacks(s, attacker.instanceId, "accept", [bell.instanceId])
    assert(declareBlock(s, "p1", leo.instanceId) === null, "レオでブロック")
    settle(s, "accept", [bell.instanceId])
    assert(bell.isRested && effectiveBp(s, "p1", leo) === base + 3000, "ブロックしたバトル時にも疲労させてBP+3000")
}

console.log("すべてのチェックに合格しました 🎉（part827）")
