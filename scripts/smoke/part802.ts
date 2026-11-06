// smoke パート802（BS21-036 十剣聖ザンバー・コング・BS21-X03 黒樹神クワガ・ラブナ・BS21-077 ベロティカルウィンド：連鎖[青]回復・連鎖[緑]疲労・合体時ライフ除去・バースト封じ・爪鳥BP+5000手札戻り。BS21_PLAN §1・§2 の確定読み）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, lockedFor, placeBurst, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const ZAMBER = "BS21-036" // 十剣聖ザンバー・コング（白・コスト7・剣使/機獣・Lvコア1/2/4）
const KUWAGA = "BS21-X03" // 黒樹神クワガ・ラブナ（緑・コスト4・怪虫/殻虫・Lvコア1/3/5）
const WIND = "BS21-077" // ベロティカルウィンド（緑・マジック・コスト3）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし・赤シンボル用）
const DOLPHIN = "BS06-061" // ドルフィーノ（青・コスト0・BP1000・効果なし・青シンボル用）
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・BP6000・効果なし・緑シンボル用）
const ARENA = "SD03-014" // オリンスピア競技場（青・ネクサス・コスト3・Lv1はコア0で置く）
const FENRIR = "BS10-071" // フェンリルキャノンType-B（白・ブレイヴ・コスト4・合体条件コスト4以上・合体時BP+3000）
const RED_NEXUS = "BS01-098" // 燃えさかる戦場（赤・ネクサス・コスト3・青シンボル無し）
const ESPADA = "BS06-008" // 刀剣魚エスパーダ（赤・コスト4・Lv2BP7000・効果なし）
const EAGLAS = "BS01-060" // イーグラス（緑・コスト3・爪鳥・Lv2BP4000・Lv2破壊時自分全BP+2000）
const MUSYA = "BS11-017" // ムシャツバメ（緑・コスト1・爪鳥・Lv1BP1000）
const JAMBI = "BS11-049" // ジャンビ・オレピス（赤・ブレイヴ・コスト4・合体条件コスト3以上）
const SHINING = "BS20-074" // シャイニングフレイム（赤・マジック・コスト7・フラッシュBP10000以下破壊）
const LIFECHAIN = "BS10-105" // ライフチャージ（緑・マジック・コスト4・フラッシュ自分のコスト3以上を破壊しボイドからコア3個）
const SHIELD = "SD06-016" // 絶甲氷盾（白・マジック・【バースト：自分のライフ減少後】ボイドからコア1個をライフに）

console.log("=== 前提: カードの機械確認（BS21 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS21.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; levels: { level: number; cores: number; bp: number }[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    assert(byId(ZAMBER)?.name === "十剣聖ザンバー・コング" && byId(ZAMBER)!.type === "spirit" && byId(ZAMBER)!.cost === 7 && byId(ZAMBER)!.colors.join() === "white" && byId(ZAMBER)!.family.join() === "剣使,機獣" && byId(ZAMBER)!.levels.map((l) => l.cores).join("/") === "1/2/4" && byId(ZAMBER)!.levels.map((l) => l.bp).join("/") === "6000/7000/10000", "ZAMBERは十剣聖ザンバー・コング（白・コスト7・剣使/機獣・Lvコア1/2/4・BP6000/7000/10000）")
    assert(byId(KUWAGA)?.name === "黒樹神クワガ・ラブナ" && byId(KUWAGA)!.type === "spirit" && byId(KUWAGA)!.cost === 4 && byId(KUWAGA)!.colors.join() === "green" && byId(KUWAGA)!.family.join() === "怪虫,殻虫" && byId(KUWAGA)!.levels.map((l) => l.cores).join("/") === "1/3/5" && byId(KUWAGA)!.levels.map((l) => l.bp).join("/") === "3000/5000/8000", "KUWAGAは黒樹神クワガ・ラブナ（緑・コスト4・怪虫/殻虫・Lvコア1/3/5・BP3000/5000/8000）")
    assert(byId(WIND)?.name === "ベロティカルウィンド" && byId(WIND)!.type === "magic" && byId(WIND)!.cost === 3 && byId(WIND)!.colors.join() === "green", "WINDはベロティカルウィンド（緑・マジック・コスト3）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1 && getCard(VAN).levels[0]!.bp === 1000 && getCard(VAN).effect === "", "VANはロクケラトプス（赤・コスト1・BP1000・効果なし）")
    assert(getCard(DOLPHIN).name === "ドルフィーノ" && getCard(DOLPHIN).colors[0] === "blue" && getCard(DOLPHIN).cost === 0, "DOLPHINはドルフィーノ（青・コスト0）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).colors[0] === "green" && getCard(TARAN).levels[0]!.bp === 6000 && getCard(TARAN).effect === "", "TARANはタランドーズ（緑・BP6000・効果なし）")
    assert(getCard(RED_NEXUS).name === "燃えさかる戦場" && getCard(RED_NEXUS).type === "nexus" && getCard(RED_NEXUS).colors.join() === "red" && getCard(RED_NEXUS).cost === 3, "RED_NEXUSは燃えさかる戦場（赤・ネクサス・コスト3）")
    assert(getCard(ARENA).name === "オリンスピア競技場" && getCard(ARENA).type === "nexus" && getCard(ARENA).cost === 3, "ARENAはオリンスピア競技場（ネクサス・コスト3）")
    assert(getCard(FENRIR).name === "フェンリルキャノンType-B" && getCard(FENRIR).type === "brave" && getCard(FENRIR).cost === 4 && getCard(FENRIR).levels[0]!.bp === 3000, "FENRIRはフェンリルキャノンType-B（ブレイヴ・コスト4・BP3000）")
    assert(getCard(ESPADA).name === "刀剣魚エスパーダ" && getCard(ESPADA).levels[1]!.bp === 7000 && getCard(ESPADA).effect === "", "ESPADAは刀剣魚エスパーダ（Lv2BP7000・効果なし）")
    assert(getCard(EAGLAS).name === "イーグラス" && getCard(EAGLAS).family.includes("爪鳥") && getCard(EAGLAS).levels[1]!.bp === 4000 && getCard(EAGLAS).effect.includes("破壊時"), "EAGLASはイーグラス（爪鳥・Lv2BP4000・破壊時効果持ち）")
    assert(getCard(MUSYA).name === "ムシャツバメ" && getCard(MUSYA).family.includes("爪鳥") && getCard(MUSYA).levels[0]!.bp === 1000, "MUSYAはムシャツバメ（爪鳥・Lv1BP1000）")
    assert(getCard(JAMBI).name === "ジャンビ・オレピス" && getCard(JAMBI).type === "brave" && getCard(JAMBI).cost === 4, "JAMBIはジャンビ・オレピス（ブレイヴ・コスト4・合体条件コスト3以上）")
    assert(getCard(SHINING).name === "シャイニングフレイム" && getCard(SHINING).type === "magic" && getCard(SHINING).effect.includes("BP10000以下"), "SHININGはシャイニングフレイム（BP10000以下破壊）")
    assert(getCard(LIFECHAIN).name === "ライフチャージ" && getCard(LIFECHAIN).type === "magic" && getCard(LIFECHAIN).effect.includes("コスト3以上の自分のスピリット1体を破壊"), "LIFECHAINはライフチャージ（自分のコスト3以上を破壊）")
    assert(getCard(SHIELD).name === "絶甲氷盾" && getCard(SHIELD).type === "magic" && getCard(SHIELD).effect.includes("【バースト：自分のライフ減少後】"), "SHIELDは絶甲氷盾（バースト：ライフ減少後）")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "green" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): void {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

// pendingChoice を答える（option は「回復/発動」を優先、target は picks に入っていればそれを選ぶ）
function settle(s: GameState, picks: string[] = [], prefer?: string): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = (prefer ? o.find((x) => x.includes(prefer)) : undefined) ?? o.find((x) => x.includes("回復")) ?? o.find((x) => x.includes("残る")) ?? o.find((x) => x.includes("発動")) ?? o[0] ?? ""
            err = act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// 任意の確認（連鎖[青]の回復など）を断る：選択肢を付けずに resolveChoice
function decline(s: GameState): void {
    for (let i = 0; i < 10 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string }
        const who = pc.pid ?? "p1"
        const err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

console.log("=== A. 036 連鎖[青]：アタックの間にネクサス1つを疲労させて回復できる（青シンボル・ネクサスが必要・ターンに1回・断れる） ===")
{
    // 青シンボルと自分のネクサスがある → 回復を使う
    const s = game("zamber-chain-blue")
    const zamber = put(s, "p1", ZAMBER, 1) // Lv1（連鎖にLv条件は無い）
    put(s, "p1", DOLPHIN, 1) // 青シンボル
    const arena = putNexus(s, "p1", ARENA, 0)
    assert(act(s, "p1", { type: "attack", instanceId: zamber.instanceId }) === null, "ザンバー・コングでアタック")
    settle(s, [arena.instanceId])
    assert(!zamber.isRested, "連鎖[青]でネクサスを疲労させて回復できる")
    assert(arena.isRested, "回復に使ったネクサスは疲労する")
    takeLifeAndResolve(s, "p2")
    assert(s.players.p2.life === 4, "ブロックされないのでライフは減る")
}
{
    // 任意なので断れる → 回復しない
    const s = game("zamber-chain-decline")
    const zamber = put(s, "p1", ZAMBER, 1)
    put(s, "p1", DOLPHIN, 1)
    const arena = putNexus(s, "p1", ARENA, 0)
    assert(act(s, "p1", { type: "attack", instanceId: zamber.instanceId }) === null, "ザンバー・コングでアタック")
    decline(s)
    settle(s)
    assert(zamber.isRested, "断れば回復しない")
    assert(!arena.isRested, "ネクサスも疲労しない")
    takeLifeAndResolve(s, "p2")
}
{
    // ターンに1回：同じターンの2回目のアタックでは使えない
    const s = game("zamber-chain-once")
    const zamber = put(s, "p1", ZAMBER, 1)
    put(s, "p1", DOLPHIN, 1)
    const arena1 = putNexus(s, "p1", ARENA, 0)
    const arena2 = putNexus(s, "p1", ARENA, 0)
    assert(act(s, "p1", { type: "attack", instanceId: zamber.instanceId }) === null, "1回目のアタック")
    settle(s, [arena1.instanceId])
    assert(!zamber.isRested && arena1.isRested, "1回目は回復できる")
    takeLifeAndResolve(s, "p2")
    assert(act(s, "p1", { type: "attack", instanceId: zamber.instanceId }) === null, "回復したので同じターンに2回目のアタック")
    settle(s, [arena2.instanceId])
    assert(zamber.isRested, "ターンに1回までなので2回目は回復できない")
    assert(!arena2.isRested, "2つ目のネクサスも疲労しない")
    takeLifeAndResolve(s, "p2")
}
{
    // 青シンボルが無ければ使えない
    const s = game("zamber-chain-noblue")
    const zamber = put(s, "p1", ZAMBER, 1)
    const arena = putNexus(s, "p1", RED_NEXUS, 0)
    assert(act(s, "p1", { type: "attack", instanceId: zamber.instanceId }) === null, "ザンバー・コングでアタック")
    settle(s, [arena.instanceId])
    assert(zamber.isRested && !arena.isRested, "青シンボルが無いので回復できない")
    takeLifeAndResolve(s, "p2")
}
{
    // 自分のネクサスが無ければ使えない
    const s = game("zamber-chain-nonexus")
    const zamber = put(s, "p1", ZAMBER, 1)
    put(s, "p1", DOLPHIN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: zamber.instanceId }) === null, "ザンバー・コングでアタック")
    settle(s)
    assert(zamber.isRested, "ネクサスが無いので回復できない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== B. 036 Lv2『アタック時』＋連鎖[緑]：相手のネクサス1つを手札に戻し、緑シンボルがあれば相手1体を疲労 ===")
{
    const s = game("zamber-lv2-green")
    const zamber = put(s, "p1", ZAMBER, 2) // Lv2
    put(s, "p1", TARAN, 1) // 緑シンボル
    const oppNexus = putNexus(s, "p2", ARENA, 0)
    const oppVan = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: zamber.instanceId }) === null, "ザンバー・コング（Lv2）でアタック")
    settle(s, [oppNexus.instanceId, oppVan.instanceId])
    assert(!s.players.p2.field.nexuses.some((x) => x.instanceId === oppNexus.instanceId), "相手のネクサス1つが場を離れる")
    assert(s.players.p2.hand.includes(ARENA), "戻ったネクサスは相手の手札に入る")
    assert(oppVan.isRested, "連鎖[緑]で相手のスピリット1体が疲労する")
    takeLifeAndResolve(s, "p2")
    assert(s.players.p2.life === 4, "ブロックされないのでライフは減る")
}
{
    // 緑シンボルが無ければ疲労しない（ネクサス戻しはLv2効果なので起こる）
    const s = game("zamber-lv2-nogreen")
    const zamber = put(s, "p1", ZAMBER, 2) // Lv2
    const oppNexus = putNexus(s, "p2", ARENA, 0)
    const oppVan = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: zamber.instanceId }) === null, "ザンバー・コング（Lv2）でアタック")
    settle(s, [oppNexus.instanceId])
    assert(!s.players.p2.field.nexuses.some((x) => x.instanceId === oppNexus.instanceId) && s.players.p2.hand.includes(ARENA), "ネクサスは手札に戻る")
    assert(!oppVan.isRested, "緑シンボルが無いので相手は疲労しない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== C. 036【合体時】Lv3『相手のアタックステップ』：合体スピリットがBP比べで相手だけを破壊したとき相手のライフ-1 ===")
{
    // 036 が合体していて、036 自身がブロックして勝つ → ライフ-1
    const s = game("zamber-gattai-life")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    const zamber = put(s, "p1", ZAMBER, 4) // Lv3・BP10000
    combine(s, "p1", zamber, FENRIR) // 合体BP+3000
    const attacker = put(s, "p2", TARAN, 1) // BP6000
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のタランドーズがアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, "p1", zamber.instanceId) === null, "合体したザンバー・コングでブロック")
    passFlash(s)
    settle(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === attacker.instanceId), "BP比べで相手のスピリットだけが破壊される")
    assert(s.players.p2.life === 4, "相手のライフのコア1個がリザーブに置かれる")
    assert(s.players.p2.reserve === 22, "リザーブは20→22（ライフのコア1個＋破壊されたスピリットのコア1個）")
}
{
    // 境目：036 は合体していても、ブロックしたのが合体していないスピリットならライフは減らない
    const s = game("zamber-gattai-otherblock")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    const zamber = put(s, "p1", ZAMBER, 4) // Lv3・合体時効果を持つが、今回はブロックしない
    combine(s, "p1", zamber, FENRIR)
    const blocker = put(s, "p1", ESPADA, 3) // Lv2BP7000（Lv2はコア3個）・合体していない
    const attacker = put(s, "p2", TARAN, 1) // BP6000
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のタランドーズがアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "合体していないエスパーダでブロック")
    passFlash(s)
    settle(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === attacker.instanceId), "BP比べで相手のスピリットだけが破壊される")
    assert(s.players.p2.life === 5, "破壊したのが合体スピリットでないのでライフは減らない")
}
{
    // 境目：036 自身が合体していなければ発揮しない
    const s = game("zamber-alone-life")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    const zamber = put(s, "p1", ZAMBER, 4) // Lv3・合体していない
    const attacker = put(s, "p2", TARAN, 1) // BP6000
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のタランドーズがアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, "p1", zamber.instanceId) === null, "合体していないザンバー・コングでブロック")
    passFlash(s)
    settle(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === attacker.instanceId), "BP比べで相手のスピリットだけが破壊される")
    assert(s.players.p2.life === 5, "合体していないのでライフは減らない")
}

console.log("=== D. X03 Lv2『アタック時』：このアタックの間相手はバーストを発動できない。連鎖[赤]でドロー1・連鎖[青]でAと同じ回復 ===")
{
    const s = game("kuwaga-lv2-burstlock")
    const kuwaga = put(s, "p1", KUWAGA, 3) // Lv2
    put(s, "p1", VAN, 1) // 赤シンボル
    put(s, "p1", DOLPHIN, 1) // 青シンボル
    const arena = putNexus(s, "p1", ARENA, 0)
    placeBurst(s, "p2", SHIELD) // 条件「ライフ減少後」を満たせるバースト
    assert(act(s, "p1", { type: "attack", instanceId: kuwaga.instanceId }) === null, "クワガ・ラブナ（Lv2）でアタック")
    assert(lockedFor(s, "p2", "burst"), "このアタックの間、相手はバーストを発動できない")
    settle(s, [arena.instanceId])
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "連鎖[赤]でデッキから1枚ドローする")
    assert(!kuwaga.isRested && arena.isRested, "連鎖[青]でネクサスを疲労させて回復できる")
    takeLifeAndResolve(s, "p2")
    settle(s)
    assert(s.players.p2.life === 4, "ブロックされないのでライフは減る")
    assert(s.players.p2.burst !== null, "バーストは発動を聞かれずセットされたまま")
}
{
    // 境目：Lv1ではバーストを封じない（条件を満たせば発動される）
    const s = game("kuwaga-lv1-burst")
    const kuwaga = put(s, "p1", KUWAGA, 1) // Lv1
    put(s, "p1", VAN, 1)
    put(s, "p1", DOLPHIN, 1)
    placeBurst(s, "p2", SHIELD)
    assert(act(s, "p1", { type: "attack", instanceId: kuwaga.instanceId }) === null, "クワガ・ラブナ（Lv1）でアタック")
    assert(!lockedFor(s, "p2", "burst"), "Lv1ではバーストを封じない")
    settle(s)
    takeLifeAndResolve(s, "p2")
    settle(s)
    assert(s.players.p2.life === 5, "ライフは1減るが、絶甲氷盾のバーストでコア1個がライフに置かれ5のまま")
    assert(s.players.p2.burst === null, "条件を満たしたのでバーストは発動される")
}

console.log("=== E. 077：合体していない爪鳥1体をBP+5000し、相手によって破壊されたとき手札に戻る（破壊時効果も発揮） ===")
{
    // 相手の効果で破壊される → 手札に戻り、破壊時効果（自分すべてBP+2000）も発揮する
    const s = game("wind-destroy-return")
    const eagle = put(s, "p1", EAGLAS, 2) // Lv2・BP4000
    const van = put(s, "p1", VAN, 1) // BP1000
    put(s, "p2", VAN, 1) // 相手の赤シンボル（シャイニングフレイムの色）
    s.players.p1.hand = [WIND]
    s.players.p2.hand = [SHINING]
    const attacker = put(s, "p1", DOLPHIN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ドルフィーノでアタック（フラッシュタイミングを作る）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ベロティカルウィンドを使用")
    settle(s, [eagle.instanceId])
    assert(effectiveBp(s, "p1", eagle) === 9000, "イーグラス（Lv2BP4000）はBP+5000で9000")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "シャイニングフレイムを使用")
    settle(s, [eagle.instanceId], "破壊時") // 手札に戻る方を先に解決すると未解決の『破壊時』は空振りするので、破壊時を先に選ぶ
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === eagle.instanceId), "イーグラスは破壊されて場を離れる")
    assert(s.players.p1.hand.includes(EAGLAS), "相手によって破壊されたので手札に戻る")
    assert(!s.players.p1.trashCards.includes(EAGLAS), "トラッシュには行かない")
    assert(effectiveBp(s, "p1", van) === 3000, "破壊時効果も発揮され自分のスピリットすべてBP+2000（1000→3000）")
    takeLifeAndResolve(s, "p2")
}
{
    // 境目：自分の効果で破壊されたときは手札に戻らない
    const s = game("wind-own-destroy")
    const eagle = put(s, "p1", EAGLAS, 2) // コスト3以上
    put(s, "p2", VAN, 1)
    s.players.p1.hand = [WIND, LIFECHAIN]
    const attacker = put(s, "p1", DOLPHIN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ドルフィーノでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ベロティカルウィンドを使用")
    settle(s, [eagle.instanceId])
    assert(act(s, "p2", { type: "pass" }) === null, "マジックのあと優先権が移った相手がパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ライフチャージを使用")
    settle(s, [eagle.instanceId])
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === eagle.instanceId), "イーグラスは破壊されて場を離れる")
    assert(s.players.p1.trashCards.includes(EAGLAS), "自分の効果で破壊されたのでトラッシュに行く")
    assert(!s.players.p1.hand.includes(EAGLAS), "手札には戻らない")
    takeLifeAndResolve(s, "p2")
}
{
    // 境目：合体している爪鳥・爪鳥でないスピリットは選べない
    const s = game("wind-target-scope")
    const eagle = put(s, "p1", EAGLAS, 1)
    combine(s, "p1", eagle, JAMBI) // 合体した爪鳥
    const van = put(s, "p1", VAN, 1) // 爪鳥でない
    const musya = put(s, "p1", MUSYA, 1) // 合体していない爪鳥
    const musya2 = put(s, "p1", MUSYA, 1) // 合体していない爪鳥（候補が2体以上のときだけ選択が出る）
    put(s, "p2", VAN, 1)
    s.players.p1.hand = [WIND]
    const attacker = put(s, "p1", DOLPHIN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ドルフィーノでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ベロティカルウィンドを使用")
    const pc = s.pendingChoice as { kind: string; candidates?: string[] } | null
    assert(pc !== null && pc.kind === "target", "対象の選択が求められる")
    const cands = pc?.candidates ?? []
    assert(cands.includes(musya.instanceId) && cands.includes(musya2.instanceId), "合体していない爪鳥は選べる")
    assert(!cands.includes(eagle.instanceId), "合体している爪鳥は選べない")
    assert(!cands.includes(van.instanceId), "爪鳥でないスピリットは選べない")
    settle(s, [musya.instanceId])
    assert(effectiveBp(s, "p1", musya) === 6000, "ムシャツバメ（Lv1BP1000）はBP+5000で6000")
    takeLifeAndResolve(s, "p2")
}

console.log("すべてのチェックに合格しました 🎉（part802）")
