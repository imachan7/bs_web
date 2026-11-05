// smoke パート777（『このスピリットのバトル時』BPを比べ破壊されたとき、は破壊待機の間に発揮する。合体時のブレイヴ効果も同じく。2026-11-05 ユーザー確認）
import { act, assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const PIGO = "BS03-036" // 神鳥ピーゴッド（緑・スピリット・コスト8・Lv1 BP4000）バトル時：BPを比べ破壊されたとき、ボイドからコア4個をリザーブに
const HAM = "BS15-059" // スターハム（黄・ブレイヴ・コスト4）合体時バトル時：BPを比べ破壊されたとき、ボイドからコア1個をライフに
const MATA = "BS15-055" // マタドーラ（赤・ブレイヴ・コスト4）合体時破壊時：相手に色1色を指定させ、指定されなかった色の相手のスピリットとネクサスすべてを破壊する
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・Lv1 BP3000・効果なし）コスト4以上の合体条件のホスト
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・Lv1 BP6000/Lv2 BP8000・効果なし）ブロッカー
const ANTMAN = "BS05-024" // 用心棒アントマン（緑・コスト4・Lv1 BP5000・効果なし）相打ち用ブロッカー
const DOLPHIN = "BS06-061" // ドルフィーノ（青・コスト0・Lv1 BP1000・効果なし）
const SPEARS = "BS01-104" // 千本槍の古戦場（紫・ネクサス）
const RUINS = "BS14-078" // 幽鬼集う廃都（紫・ネクサス・コスト5）相手によって破壊されたスピリット1体を疲労状態でフィールドに残す
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(PIGO).name === "神鳥ピーゴッド" && getCard(PIGO).type === "spirit" && getCard(PIGO).colors[0] === "green" && getCard(PIGO).cost === 8 && getCard(PIGO).levels[0]!.bp === 4000, "PIGOは神鳥ピーゴッド（緑・スピリット・コスト8・Lv1 BP4000）")
    assert(getCard(HAM).name === "スターハム" && getCard(HAM).type === "brave" && getCard(HAM).colors[0] === "yellow" && getCard(HAM).cost === 4, "HAMはスターハム（ブレイヴ・黄・コスト4）")
    assert(getCard(MATA).name === "マタドーラ" && getCard(MATA).type === "brave" && getCard(MATA).colors[0] === "red" && getCard(MATA).cost === 4, "MATAはマタドーラ（ブレイヴ・赤・コスト4）")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).cost === 4 && getCard(BELL).effect === "" && getCard(BELL).levels[0]!.bp === 3000, "BELLはデュアルキャノン・ベル（白・コスト4・効果なし・BP3000）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).cost === 6 && getCard(TARAN).effect === "" && getCard(TARAN).levels[0]!.bp === 6000 && getCard(TARAN).levels[1]!.bp === 8000, "TARANはタランドーズ（緑・コスト6・効果なし・Lv1 BP6000/Lv2 BP8000）")
    assert(getCard(ANTMAN).name === "用心棒アントマン" && getCard(ANTMAN).cost === 4 && getCard(ANTMAN).effect === "" && getCard(ANTMAN).levels[0]!.bp === 5000, "ANTMANは用心棒アントマン（緑・コスト4・効果なし・BP5000）")
    assert(getCard(DOLPHIN).name === "ドルフィーノ" && getCard(DOLPHIN).colors[0] === "blue" && getCard(DOLPHIN).effect === "", "DOLPHINはドルフィーノ（青・効果なし）")
    assert(getCard(SPEARS).name === "千本槍の古戦場" && getCard(SPEARS).type === "nexus" && getCard(SPEARS).colors[0] === "purple", "SPEARSは千本槍の古戦場（紫・ネクサス）")
    assert(getCard(RUINS).name === "幽鬼集う廃都" && getCard(RUINS).type === "nexus" && getCard(RUINS).colors[0] === "purple", "RUINSは幽鬼集う廃都（紫・ネクサス）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).colors[0] === "red" && getCard(VANILLA).effect === "", "VANILLAはロクケラトプス（赤・効果なし）")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
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

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): ReturnType<typeof createInstance> {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

function answer(s: GameState, pick: (options: string[]) => string | undefined, target?: (c: string[]) => string | undefined): string[] {
    const prompts: string[] = []
    for (let i = 0; i < 10 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        prompts.push(pc.prompt)
        const res: Record<string, unknown> = { type: "resolveChoice" }
        if (pc.kind === "option") res["option"] = pick(pc.options ?? []) ?? pc.options![0]
        else if (pc.kind === "target") res["instanceId"] = target?.(pc.candidates ?? []) ?? pc.candidates![0]
        else res["cardIndex"] = pc.cardIndices?.[0]
        if (handleAction(s, pc.pid as PlayerId, res as never) !== null) break
    }
    return prompts
}

function battleLose(s: GameState, attacker: ReturnType<typeof createInstance>, blocker: ReturnType<typeof createInstance>) {
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：攻撃側パス")
}

console.log("=== A（規則1）: ピーゴッドのバトル時：BPを比べ破壊されたとき、ボイドからコア4個をリザーブに ===")
{
    const s = game("pigo-lose")
    const pigo = put(s, "p1", PIGO, 1) // Lv1 BP4000
    const blocker = put(s, "p2", TARAN, 1) // Lv1 BP6000
    battleLose(s, pigo, blocker)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === pigo.instanceId), "ピーゴッドは破壊される")
    assert(s.players.p1.reserve === 15, `ボイドからコア4個をリザーブに（破壊されたピーゴッドのコア1個も戻る。reserve=${s.players.p1.reserve}）`)
}

console.log("=== B（規則1・ブレイヴ）: スターハム合体時バトル時：BPを比べ破壊されたとき、ボイドからコア1個をライフに ===")
{
    const s = game("ham-lose")
    const host = put(s, "p1", BELL, 1)
    combine(s, "p1", host, HAM) // BP5000
    const blocker = put(s, "p2", TARAN, 1) // Lv1 BP6000
    const lifeBefore = s.players.p1.life
    battleLose(s, host, blocker)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "合体スピリットは破壊される")
    assert(s.players.p1.life === lifeBefore + 1, `ボイドからコア1個をライフに（life=${s.players.p1.life}）`)
}

console.log("=== C（規則2）: 相打ち（同じBP）では破壊されたときにならないので、ライフは増えない ===")
{
    const s = game("ham-tie")
    const host = put(s, "p1", BELL, 1)
    combine(s, "p1", host, HAM) // BP5000
    const blocker = put(s, "p2", ANTMAN, 1) // BP5000
    const lifeBefore = s.players.p1.life
    battleLose(s, host, blocker)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "相打ちで合体スピリットも破壊される")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "相打ちでブロッカーも破壊される")
    assert(s.players.p1.life === lifeBefore, `相打ちではライフは増えない（life=${s.players.p1.life}）`)
}

console.log("=== D（規則2）: 「フィールドに残る」で生き残っても、バトル時の効果は発揮する ===")
{
    const s = game("pigo-survive", true)
    const pigo = put(s, "p1", PIGO, 1) // Lv1 BP4000
    s.players.p1.field.nexuses.push(createInstance(RUINS, s.turn, 0))
    const blocker = put(s, "p2", TARAN, 1) // Lv1 BP6000
    battleLose(s, pigo, blocker)
    answer(
        s,
        (o) => o.find((x) => x.includes("破棄")) ?? o[0],
        (c) => c.find((x) => x === pigo.instanceId) ?? c[0],
    )
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === pigo.instanceId), "幽鬼集う廃都でピーゴッドは疲労状態でフィールドに残る")
    assert(s.players.p1.reserve === 14, `生き残ってもボイドからコア4個をリザーブに（reserve=${s.players.p1.reserve}）`)
}

console.log("=== E（規則3）: 合体スピリットの破壊で、マタドーラ合体時の破壊時も発揮する（相手が「赤」を指定） ===")
{
    const s = game("mata-red", true)
    const host = put(s, "p1", BELL, 1)
    combine(s, "p1", host, MATA) // BP6000
    const blocker = put(s, "p2", TARAN, 3) // Lv2 BP8000
    const red = put(s, "p2", VANILLA, 1)
    const blue = put(s, "p2", DOLPHIN, 1)
    s.players.p2.field.nexuses.push(createInstance(SPEARS, s.turn, 0))
    battleLose(s, host, blocker)
    const prompts = answer(s, (o) => o.find((x) => x.includes("赤")) ?? o[0])
    assert(prompts.some((p) => p.includes("色")), `相手が色1色を指定する（${prompts.join("/")}）`)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "合体スピリットは破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === red.instanceId), "指定された赤のスピリットは残る")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blue.instanceId), "指定されなかった青のスピリットは破壊される")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "指定されなかった緑のブロッカーも破壊される")
    assert(s.players.p2.field.nexuses.length === 0, "指定されなかった色のネクサスも破壊される")
}

console.log("=== F（規則3の境目）: 合体していないマタドーラが破壊されても、この効果は発揮しない ===")
{
    const s = game("mata-spirit", true)
    const mata = put(s, "p1", MATA, 1) // スピリット状態 BP3000
    const blocker = put(s, "p2", TARAN, 1) // Lv1 BP6000
    const red = put(s, "p2", VANILLA, 1)
    const blue = put(s, "p2", DOLPHIN, 1)
    s.players.p2.field.nexuses.push(createInstance(SPEARS, s.turn, 0))
    battleLose(s, mata, blocker)
    const prompts = answer(s, (o) => o[0])
    assert(!prompts.some((p) => p.includes("色")), `スピリット状態では色指定は出ない（${prompts.join("/")}）`)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === mata.instanceId), "マタドーラは破壊される")
    assert(s.players.p2.field.spirits.length === 3, "相手のスピリットはすべて残る")
    assert(s.players.p2.field.nexuses.length === 1, "相手のネクサスは残る")
}

console.log("すべてのチェックに合格しました 🎉（part777）")
