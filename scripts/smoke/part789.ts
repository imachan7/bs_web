// smoke パート789（BS20-002〜005・007〜009・055・056・067・073：赤スピリット・ブレイヴ・ネクサス・マジックの各効果節。BS20_PLAN §1・§2 の確定読み）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, effectiveBp, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const CORONA = "BS20-002" // 炎楯の守護者コロナ・ドラゴン（赤・コスト3・星竜）
const HARPU = "BS20-003" // ハルパードニクス（赤・コスト3・地竜）
const SINTAL = "BS20-004" // シンタル・ザウル（赤・コスト4・地竜・【激突】＋連鎖青）
const QUICK = "BS20-005" // クイックサンド・ドラゴン（赤・コスト4・星竜・召喚時BP4000以下破壊）
const GAIAS = "BS20-007" // スレイヴ・ガイアスラ（赤・コスト6・滅龍/星竜・コア除去不可＋【超覚醒】）
const NEBULA = "BS20-008" // ネビュラ・ドラゴン（赤・コスト6・星竜・【強化】赤）
const DINO = "BS20-009" // 破壊恐竜ダイノ・ブレイカー（赤・コスト8・地竜・覇皇破壊＋指定アタック＋連鎖青）
const TIRO = "BS20-055" // ティロック・ケファレ（赤・ブレイヴ・コスト3・合体条件コスト4以上・合体時BP+4000）
const HOTJUP = "BS20-056" // ホットジュピター・ドラゴン（赤・ブレイヴ・コスト5・召喚時BP合計5000まで破壊・合体時ドロー）
const CANYON = "BS20-067" // ボルカニックキャニオン（赤・ネクサス・コスト3・地竜数BP+1000・Lv2回復）
const POWER = "BS20-073" // パワーブースト（赤・マジック・コスト3・BP+3000＋連鎖青）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・BP1000・効果なし）
const RAINY = "BS07-001" // レイニードル（赤・コスト1・星竜・BP1000・効果なし）
const SABER = "BS01-003" // テラノセイバー（赤・コスト2・BP4000・効果なし）
const LIME = "BS16-035" // 樹氷竜シルバー・ライム（白・コスト6・BP5000）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・BP3000・効果なし）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3・BP2000・召喚時ドロー）
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・BP6000/8000・効果なし）
const DOLPHIN = "BS06-061" // ドルフィーノ（青・コスト0・BP1000・効果なし）青シンボル確保用
const NEEDS = "BS01-081" // 銀燐竜ニーズホッグ（白・コスト3・Lv2BP3000・ブロック時BP+4000）
const BENKEI = "BS14-030" // グラント・ベンケイ（覇皇）
const ESPADA = "BS06-008" // 刀剣魚エスパーダ（赤・コスト4・Lv2BP7000）
const FLAMEGUST = "BS09-069" // フレイムガスト（赤・マジック・コスト6・フラッシュBP6000以下破壊）
const PURPLEHAZE = "BS19-102" // パープルヘイズ（紫・マジック・コスト6・フラッシュ：相手のスピリット1体のコア1個をリザーブに）
const ELIXIR = "BS01-142" // ピュアエリクサー（白・マジック・コスト3）
const SPEARS = "BS01-104" // 千本槍の古戦場（紫・ネクサス）

console.log("=== 前提: カードの機械確認（BS20 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS20.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; levels: { level: number; cores: number }[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    assert(byId(CORONA)?.name === "炎楯の守護者コロナ・ドラゴン" && byId(CORONA)!.type === "spirit" && byId(CORONA)!.cost === 3 && byId(CORONA)!.levels.map((l) => l.cores).join("/") === "1/3/4", "CORONAは炎楯の守護者コロナ・ドラゴン（スピリット・コスト3・Lvコア1/3/4）")
    assert(byId(HARPU)?.name === "ハルパードニクス" && byId(HARPU)!.type === "spirit" && byId(HARPU)!.cost === 3, "HARPUはハルパードニクス（スピリット・コスト3）")
    assert(byId(SINTAL)?.name === "シンタル・ザウル" && byId(SINTAL)!.type === "spirit" && byId(SINTAL)!.cost === 4, "SINTALはシンタル・ザウル（スピリット・コスト4）")
    assert(byId(QUICK)?.name === "クイックサンド・ドラゴン" && byId(QUICK)!.type === "spirit" && byId(QUICK)!.cost === 4, "QUICKはクイックサンド・ドラゴン（スピリット・コスト4）")
    assert(byId(GAIAS)?.name === "スレイヴ・ガイアスラ" && byId(GAIAS)!.type === "spirit" && byId(GAIAS)!.cost === 6, "GAIASはスレイヴ・ガイアスラ（スピリット・コスト6）")
    assert(byId(NEBULA)?.name === "ネビュラ・ドラゴン" && byId(NEBULA)!.type === "spirit" && byId(NEBULA)!.cost === 6, "NEBULAはネビュラ・ドラゴン（スピリット・コスト6）")
    assert(byId(DINO)?.name === "破壊恐竜ダイノ・ブレイカー" && byId(DINO)!.type === "spirit" && byId(DINO)!.cost === 8, "DINOは破壊恐竜ダイノ・ブレイカー（スピリット・コスト8）")
    assert(byId(TIRO)?.name === "ティロック・ケファレ" && byId(TIRO)!.type === "brave" && byId(TIRO)!.cost === 3, "TIROはティロック・ケファレ（ブレイヴ・コスト3）")
    assert(byId(HOTJUP)?.name === "ホットジュピター・ドラゴン" && byId(HOTJUP)!.type === "brave" && byId(HOTJUP)!.cost === 5, "HOTJUPはホットジュピター・ドラゴン（ブレイヴ・コスト5）")
    assert(byId(CANYON)?.name === "ボルカニックキャニオン" && byId(CANYON)!.type === "nexus" && byId(CANYON)!.cost === 3 && byId(CANYON)!.levels.map((l) => l.cores).join("/") === "0/2", "CANYONはボルカニックキャニオン（ネクサス・コスト3・Lvコア0/2）")
    assert(byId(POWER)?.name === "パワーブースト" && byId(POWER)!.type === "magic" && byId(POWER)!.cost === 3, "POWERはパワーブースト（マジック・コスト3）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1 && getCard(VAN).levels[0]!.bp === 1000, "VANはロクケラトプス（コスト1・BP1000・地竜）")
    assert(getCard(RAINY).name === "レイニードル" && getCard(RAINY).family.includes("星竜") && getCard(RAINY).effect === "", "RAINYはレイニードル（星竜・効果なし）")
    assert(getCard(SABER).name === "テラノセイバー" && getCard(SABER).levels[0]!.bp === 4000, "SABERはテラノセイバー（BP4000）")
    assert(getCard(LIME).name === "樹氷竜シルバー・ライム" && getCard(LIME).levels[0]!.bp === 5000, "LIMEはシルバー・ライム（BP5000）")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).cost === 4 && getCard(BELL).levels[0]!.bp === 3000, "BELLはデュアルキャノン・ベル（コスト4・BP3000）")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).cost === 3, "GRIPはグリプ・ハンズ（コスト3）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).levels[0]!.bp === 6000, "TARANはタランドーズ（BP6000）")
    assert(getCard(DOLPHIN).name === "ドルフィーノ" && getCard(DOLPHIN).colors[0] === "blue", "DOLPHINはドルフィーノ（青）")
    assert(getCard(NEEDS).name === "銀燐竜ニーズホッグ" && getCard(NEEDS).levels[1]!.bp === 3000 && getCard(NEEDS).effect.includes("ブロック時"), "NEEDSは銀燐竜ニーズホッグ（Lv2BP3000・ブロック時BP+4000）")
    assert(getCard(BENKEI).name === "グラント・ベンケイ" && getCard(BENKEI).family.includes("覇皇"), "BENKEIはグラント・ベンケイ（覇皇）")
    assert(getCard(ESPADA).name === "刀剣魚エスパーダ" && getCard(ESPADA).levels[1]!.bp === 7000, "ESPADAは刀剣魚エスパーダ（Lv2BP7000）")
    assert(getCard(FLAMEGUST).name === "フレイムガスト" && getCard(FLAMEGUST).type === "magic" && getCard(FLAMEGUST).effect.includes("BP6000以下"), "FLAMEGUSTはフレイムガスト（BP6000以下破壊）")
    assert(getCard(PURPLEHAZE).name === "パープルヘイズ" && getCard(PURPLEHAZE).type === "magic", "PURPLEHAZEはパープルヘイズ（コア除去マジック）")
    assert(getCard(ELIXIR).name === "ピュアエリクサー" && getCard(ELIXIR).type === "magic" && getCard(ELIXIR).colors[0] === "white", "ELIXIRはピュアエリクサー（白マジック）")
    assert(getCard(SPEARS).name === "千本槍の古戦場" && getCard(SPEARS).type === "nexus", "SPEARSは千本槍の古戦場（ネクサス）")
}

function game(seed: string, p2Color: "blue" | "purple" | "green" | "white" = "blue"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: p2Color })
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
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

// pendingChoice を答える（option は「残る／発動する」を優先、target は picks に入っていればそれを選ぶ）
function settle(s: GameState, picks: string[] = []): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = o.find((x) => x.includes("残る")) ?? o.find((x) => x.includes("発動")) ?? o.find((x) => x.includes("破壊")) ?? o[0] ?? ""
            err = act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// フラッシュタイミングを連続パスで閉じる
function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

console.log("=== 1. 002 Lv1：コスト3以下の自分のスピリットは相手の効果で破壊されても疲労状態で残る ===")
{
    const s = game("corona-remain")
    put(s, "p1", CORONA, 1)
    const van = put(s, "p1", VAN, 1)
    destroySpirit(s, "p1", van.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s)
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "相手の効果で破壊されたロクケラトプスは場に残る")
    assert(van.isRested, "残るとき疲労状態になる")
}

console.log("=== 2. 002 の境目：コスト4以上は残れない／BPを比べの破壊では残れない ===")
{
    const s = game("corona-cost4")
    put(s, "p1", CORONA, 1)
    const bell = put(s, "p1", BELL, 1)
    destroySpirit(s, "p1", bell.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === bell.instanceId), "コスト4のスピリットは破壊される（対象外）")
}
{
    const s = game("corona-bp")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    put(s, "p1", CORONA, 1)
    const van = put(s, "p1", VAN, 1)
    const taran = put(s, "p2", TARAN, 1)
    assert(act(s, "p2", { type: "attack", instanceId: taran.instanceId }) === null, "タランドーズでアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側（アタック側）のパス")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p1", van.instanceId) === null, "ロクケラトプスでブロック")
    passFlash(s)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "BPを比べで破壊されたので「相手の効果で破壊」ではなく場に残らない")
}

console.log("=== 3. 002 Lv2：アタックステップの間、星竜すべてをBP+2000（非星竜は上がらない・Lv1では効かない） ===")
{
    const s = game("corona-bp")
    const corona = put(s, "p1", CORONA, 3) // Lv2
    const rainy = put(s, "p1", RAINY, 1)
    const van = put(s, "p1", VAN, 1)
    assert(effectiveBp(s, "p1", corona) === 5000, "コロナ（Lv2BP3000）は星竜なのでBP+2000で5000")
    assert(effectiveBp(s, "p1", rainy) === 3000, "レイニードル（星竜・BP1000）はBP+2000で3000")
    assert(effectiveBp(s, "p1", van) === 1000, "ロクケラトプス（地竜）はBP+2000されない")
}
{
    const s = game("corona-lv1")
    const corona = put(s, "p1", CORONA, 1) // Lv1
    assert(effectiveBp(s, "p1", corona) === 2000, "Lv1ではBP+2000されない")
}

console.log("=== 4. 003：このスピリットはブロックできない（ほかのスピリットはブロックできる） ===")
{
    const s = game("harpu-block")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    const harpu = put(s, "p1", HARPU, 1)
    const van = put(s, "p1", VAN, 1)
    const taran = put(s, "p2", TARAN, 1)
    assert(act(s, "p2", { type: "attack", instanceId: taran.instanceId }) === null, "タランドーズでアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p1", harpu.instanceId) !== null, "ハルパードニクスはブロックできない")
    assert(declareBlock(s, "p1", van.instanceId) === null, "ロクケラトプスはブロックできる")
    passFlash(s)
}

console.log("=== 5. 003 Lv2『アタック時』：このバトルの間BP+3000（Lv1では上がらない） ===")
{
    const s = game("harpu-atk")
    const harpu = put(s, "p1", HARPU, 3) // Lv2
    assert(act(s, "p1", { type: "attack", instanceId: harpu.instanceId }) === null, "ハルパードニクスでアタック")
    assert(effectiveBp(s, "p1", harpu) === 8000, "Lv2BP5000が『アタック時』のBP+3000で8000")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("harpu-lv1")
    const harpu = put(s, "p1", HARPU, 1) // Lv1
    assert(act(s, "p1", { type: "attack", instanceId: harpu.instanceId }) === null, "Lv1でもアタックできる")
    assert(effectiveBp(s, "p1", harpu) === 4000, "Lv1は『アタック時』のBP+3000を持たないので4000のまま")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 6. 004【激突】：相手は可能ならば必ずブロックする（ライフを受けられない） ===")
{
    const s = game("sintal-gekisho")
    const sintal = put(s, "p1", SINTAL, 1)
    const blocker = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: sintal.instanceId }) === null, "シンタル・ザウルでアタック")
    assert(act(s, "p2", { type: "takeLife" }) !== null, "ブロッカーがいるのでライフを受けることはできない")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックはできる")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "BP比べでブロッカーは破壊される")
    assert(s.players.p2.life === 5, "ライフは減らない")
}

console.log("=== 7. 004【激突】の境目：ブロッカーがいなければライフを受けられる ===")
{
    const s = game("sintal-noblocker")
    const sintal = put(s, "p1", SINTAL, 1)
    assert(act(s, "p1", { type: "attack", instanceId: sintal.instanceId }) === null, "シンタル・ザウルでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側もパス")
    takeLifeAndResolve(s, "p2")
    assert(s.players.p2.life === 4, "ブロッカーがいないのでライフが減る")
}

console.log("=== 8. 004 連鎖［青］：自分の青シンボルがあると、そのアタックの間相手は白のマジックを使用できない ===")
{
    const s = game("sintal-chain")
    const sintal = put(s, "p1", SINTAL, 1)
    put(s, "p1", DOLPHIN, 1) // 青シンボル
    s.players.p2.hand = [ELIXIR]
    assert(act(s, "p1", { type: "attack", instanceId: sintal.instanceId }) === null, "シンタル・ザウルでアタック")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) !== null, "連鎖で白のマジックが使用できない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 9. 004 連鎖の境目：青シンボルがなければ白のマジックが使える ===")
{
    const s = game("sintal-nochain")
    const sintal = put(s, "p1", SINTAL, 1)
    s.players.p2.hand = [ELIXIR]
    assert(act(s, "p1", { type: "attack", instanceId: sintal.instanceId }) === null, "シンタル・ザウルでアタック")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "青シンボルがないので白のマジックが使える")
    settle(s)
    takeLifeAndResolve(s, "p2")
}

console.log("=== 10. 005『召喚時』：BP4000以下の相手のスピリット1体を破壊する ===")
{
    const s = game("quick-summon")
    const saber = put(s, "p2", SABER, 1) // BP4000
    const lime = put(s, "p2", LIME, 1) // BP5000
    s.phase = "main" // 召喚時効果の確認なのでメインステップで召喚する
    s.players.p1.hand = [QUICK]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "クイックサンド・ドラゴンを召喚できる")
    settle(s, [saber.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === saber.instanceId), "BP4000のテラノセイバーは破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === lime.instanceId), "BP5000のシルバー・ライムは破壊されない")
}

console.log("=== 11. 005 の境目：相手のスピリットがすべてBP4000より大きいときは不発 ===")
{
    const s = game("quick-none")
    const lime = put(s, "p2", LIME, 1) // BP5000
    s.phase = "main" // 召喚時効果の確認なのでメインステップで召喚する
    s.players.p1.hand = [QUICK]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "クイックサンド・ドラゴンを召喚できる")
    settle(s)
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === lime.instanceId), "対象がいないので何も破壊されない")
}

console.log("=== 12. 007 Lv1：お互い、このスピリットのコアは取り除くことができない ===")
{
    const s = game("gaias-core", "purple")
    const gaias = put(s, "p1", GAIAS, 2)
    const van = put(s, "p1", VAN, 1)
    const atk = put(s, "p1", RAINY, 1)
    s.players.p2.hand = [PURPLEHAZE]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "レイニードルでアタック（フラッシュタイミングを作る）")
    const reserve2 = s.players.p2.reserve
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "パープルヘイズを使用できる")
    settle(s, [gaias.instanceId])
    assert(gaias.cores === 2, "ガイアスラのコアは取り除かれない")
    assert(s.players.p2.reserve === reserve2 - 6, "マジックのコストは支払われる")
    takeLifeAndResolve(s, "p2")
    assert(van.cores === 1, "他のスピリットは影響を受けない")
}

console.log("=== 13. 007 の境目：ガイアスラ以外のコアは取り除かれる ===")
{
    const s = game("gaias-other", "purple")
    put(s, "p1", GAIAS, 2)
    const grip = put(s, "p1", GRIP, 2)
    const atk = put(s, "p1", RAINY, 1)
    s.players.p2.hand = [PURPLEHAZE]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "レイニードルでアタック")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "パープルヘイズを使用できる")
    settle(s, [grip.instanceId])
    assert(grip.cores === 1, "ガイアスラ以外はコアを1個取り除かれる")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 14. 007：フラッシュ【超覚醒】自分のスピリットのコアをこのスピリットに置くことができ、置かれたとき回復する ===")
{
    const s = game("gaias-awaken")
    const gaias = put(s, "p1", GAIAS, 1)
    const van = put(s, "p1", VAN, 2)
    assert(act(s, "p1", { type: "attack", instanceId: gaias.instanceId }) === null, "ガイアスラでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパス")
    assert(act(s, "p1", { type: "awaken", instanceId: gaias.instanceId, fromInstanceId: van.instanceId, count: 1 }) === null, "フラッシュ【超覚醒】でコアを置ける")
    assert(gaias.cores === 2, "ロクケラトプスからコア1個がガイアスラに置かれる（1→2）")
    assert(van.cores === 1, "ロクケラトプスのコアは1個になる")
    assert(!gaias.isRested, "コアが置かれたのでガイアスラは回復する")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 15. 007【超覚醒】の境目：他に自分のスピリットがいなければコアを置けないので回復しない ===")
{
    const s = game("gaias-alone")
    const gaias = put(s, "p1", GAIAS, 1)
    assert(act(s, "p1", { type: "attack", instanceId: gaias.instanceId }) === null, "ガイアスラでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p1", { type: "awaken", instanceId: gaias.instanceId, fromInstanceId: gaias.instanceId, count: 1 }) !== null, "ほかに自分のスピリットがいないので【超覚醒】でコアは置けない")
    assert(gaias.cores === 1, "コアを置けないのでコア数は変わらない")
    assert(gaias.isRested, "コアが置かれないので回復しない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 16. 008【強化】：自分の「BP破壊効果」の上限を+1000する（BP6000以下破壊がBP7000まで届く） ===")
{
    const s = game("nebula-kyoka")
    put(s, "p1", NEBULA, 1)
    const atk = put(s, "p1", RAINY, 1)
    const espada = put(s, "p2", ESPADA, 3) // Lv2 BP7000
    s.players.p1.hand = [FLAMEGUST]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "レイニードルでアタック（フラッシュタイミングを作る）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "フレイムガストを使用できる")
    settle(s, [espada.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === espada.instanceId), "上限6000+1000でBP7000のエスパーダが破壊される")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 17. 008 の境目：【強化】がなければBP7000は破壊されない ===")
{
    const s = game("nebula-none")
    const atk = put(s, "p1", RAINY, 1)
    const espada = put(s, "p2", ESPADA, 3) // Lv2 BP7000
    put(s, "p2", BELL, 1) // BP3000：マジックの対象がいるようにする（BP7000だけでは使用できない）
    s.players.p1.hand = [FLAMEGUST]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "レイニードルでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "フレイムガストを使用できる")
    settle(s, [espada.instanceId])
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === espada.instanceId), "上限6000のままなのでBP7000は破壊されない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 18. 009『召喚時』：覇皇を持つ相手のスピリット1体を破壊する ===")
{
    const s = game("dino-summon")
    const benkei = put(s, "p2", BENKEI, 1)
    const van = put(s, "p2", VAN, 1)
    s.phase = "main" // 召喚時効果の確認なのでメインステップで召喚する
    s.players.p1.hand = [DINO]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ダイノ・ブレイカーを召喚できる")
    settle(s, [benkei.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === benkei.instanceId), "覇皇のグラント・ベンケイは破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "覇皇でないロクケラトプスは破壊されない")
}

console.log("=== 19. 009『アタック時』：相手のスピリット1体を指定し、そのスピリットにアタックできる（ブロックされなければライフを減らせる） ===")
{
    const s = game("dino-designate")
    const dino = put(s, "p1", DINO, 1)
    const van = put(s, "p2", VAN, 1)
    const saber = put(s, "p2", SABER, 1)
    assert(act(s, "p1", { type: "attack", instanceId: dino.instanceId }) === null, "ダイノ・ブレイカーでアタック")
    settle(s, [van.instanceId]) // ロクケラトプスを指定
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパス（指定されたロクケラトプスはブロックしない）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側もパス")
    takeLifeAndResolve(s, "p2")
    assert(s.players.p2.life === 4, "指定されたスピリットがブロックしなければライフが減る")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === saber.instanceId), "指定していないテラノセイバーは残る")
}

console.log("=== 20. 009 指定アタックの境目：指定されたスピリットがブロックしたらバトルになる ===")
{
    const s = game("dino-blocked")
    const dino = put(s, "p1", DINO, 1)
    const van = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: dino.instanceId }) === null, "ダイノ・ブレイカーでアタック")
    settle(s, [van.instanceId]) // ロクケラトプスを指定
    assert(declareBlock(s, "p2", van.instanceId) === null, "指定されたロクケラトプスがブロックできる")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "BP比べでブロッカーは破壊される")
    assert(s.players.p2.life === 5, "ブロックされたのでライフは減らない")
}

console.log("=== 21. 009 連鎖［青］：ブロックしているスピリットの効果すべては発揮されない ===")
{
    const s = game("dino-chain")
    const dino = put(s, "p1", DINO, 1)
    put(s, "p1", DOLPHIN, 1) // 青シンボル
    const needs = put(s, "p2", NEEDS, 2) // Lv2 BP3000・ブロック時BP+4000
    assert(act(s, "p1", { type: "attack", instanceId: dino.instanceId }) === null, "ダイノ・ブレイカーでアタック")
    settle(s, [needs.instanceId])
    assert(declareBlock(s, "p2", needs.instanceId) === null, "ニーズホッグがブロックできる")
    assert(effectiveBp(s, "p2", needs) === 3000, "連鎖でブロッカーの『ブロック時』BP+4000は発揮されない")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === needs.instanceId), "BP3000のままなのでBP比べで破壊される")
}

console.log("=== 22. 009 連鎖の境目：青シンボルがなければブロッカーの『ブロック時』効果が発揮される ===")
{
    const s = game("dino-nochain")
    const dino = put(s, "p1", DINO, 1)
    const needs = put(s, "p2", NEEDS, 2) // Lv2 BP3000・ブロック時BP+4000
    assert(act(s, "p1", { type: "attack", instanceId: dino.instanceId }) === null, "ダイノ・ブレイカーでアタック")
    settle(s, [needs.instanceId])
    assert(declareBlock(s, "p2", needs.instanceId) === null, "ニーズホッグがブロックできる")
    assert(effectiveBp(s, "p2", needs) === 7000, "連鎖しないので『ブロック時』BP+4000が発揮される")
    passFlash(s)
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === needs.instanceId), "BP7000なのでBP比べで破壊されない")
}

console.log("=== 23. 055【合体時】『アタック時』：このスピリットをBP+4000する ===")
{
    const s = game("tiro-combined")
    const bell = put(s, "p1", BELL, 1) // コスト4のホスト
    combine(s, "p1", bell, TIRO)
    assert(act(s, "p1", { type: "attack", instanceId: bell.instanceId }) === null, "合体スピリットでアタック")
    assert(effectiveBp(s, "p1", bell) === 11000, "BP3000+4000（ブレイヴ）+4000（『アタック時』）で11000")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 24. 055 の境目：合体していなければ『アタック時』のBP+4000は発揮されない ===")
{
    const s = game("tiro-alone")
    const bell = put(s, "p1", BELL, 1)
    assert(act(s, "p1", { type: "attack", instanceId: bell.instanceId }) === null, "ブレイヴなしのホストでアタック")
    assert(effectiveBp(s, "p1", bell) === 3000, "BP+4000されないので3000のまま")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 25. 056『このブレイヴの召喚時』：BP合計5000まで相手のスピリットを好きなだけ破壊する ===")
{
    const s = game("hotjup-summon")
    const saber = put(s, "p2", SABER, 1) // BP4000
    const van = put(s, "p2", VAN, 1) // BP1000
    s.phase = "main" // 召喚時効果の確認なのでメインステップで召喚する
    s.players.p1.hand = [HOTJUP]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ホットジュピター・ドラゴンを召喚できる")
    // BP合計5000までの選択は1体ずつ選んでから「これで破壊する」で確定する（settle では確定できない）
    for (const id of [saber.instanceId, van.instanceId]) {
        assert(act(s, "p1", { type: "resolveChoice", instanceId: id }) === null, "破壊対象を選ぶ")
    }
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "これで破壊する")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === saber.instanceId), "BP4000のテラノセイバーは破壊される")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "BP1000のロクケラトプスも破壊される（合計5000）")
}

console.log("=== 26. 056 の境目：BP合計5000を超えるのでBP5000のスピリットは破壊されない ===")
{
    const s = game("hotjup-over")
    const saber = put(s, "p2", SABER, 1) // BP4000
    const lime = put(s, "p2", LIME, 1) // BP5000
    s.phase = "main" // 召喚時効果の確認なのでメインステップで召喚する
    s.players.p1.hand = [HOTJUP]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ホットジュピター・ドラゴンを召喚できる")
    // BP合計5000までの選択は1体ずつ選んでから「これで破壊する」で確定する（settle では確定できない）
    assert(act(s, "p1", { type: "resolveChoice", instanceId: saber.instanceId }) === null, "破壊対象を選ぶ")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "これで破壊する")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === saber.instanceId), "BP4000のテラノセイバーは破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === lime.instanceId), "BP合計が5000を超えるのでシルバー・ライムは破壊されない")
}

console.log("=== 27. 056【合体時】『合体アタック時』：自分はデッキから1枚ドローする ===")
{
    const s = game("hotjup-draw")
    const grip = put(s, "p1", GRIP, 1) // コスト3のホスト
    combine(s, "p1", grip, HOTJUP)
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "attack", instanceId: grip.instanceId }) === null, "合体スピリットでアタック")
    assert(s.players.p1.deck.length === deckBefore - 1, "デッキから1枚ドローする")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 28. 056 の境目：合体していなければドローしない ===")
{
    const s = game("hotjup-nodraw")
    const grip = put(s, "p1", GRIP, 1)
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "attack", instanceId: grip.instanceId }) === null, "ブレイヴなしのホストでアタック")
    assert(s.players.p1.deck.length === deckBefore, "ドローしない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 29. 067 Lv1『自分のアタックステップ』：地竜1体につき自分のスピリットすべてをBP+1000する ===")
{
    const s = game("canyon-bp")
    putNexus(s, "p1", CANYON, 1) // Lv1
    const van1 = put(s, "p1", VAN, 1) // 地竜
    const van2 = put(s, "p1", VAN, 1) // 地竜
    const bell = put(s, "p1", BELL, 1) // 地竜ではない
    const blocker = put(s, "p2", ESPADA, 1) // BP4000（テラノセイバーは効果でブロックできないので使わない）
    assert(effectiveBp(s, "p1", van1) === 3000 && effectiveBp(s, "p1", van2) === 3000, "地竜2体につきロクケラトプスはBP+2000で3000")
    assert(effectiveBp(s, "p1", bell) === 5000, "地竜でないスピリットも「自分のスピリットすべて」でBP+2000される")
    assert(act(s, "p1", { type: "attack", instanceId: bell.instanceId }) === null, "デュアルキャノン・ベルでアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "エスパーダがブロック")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "BP5000対4000でブロッカーだけが破壊される")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === bell.instanceId), "アタッカーは破壊されない")
}

console.log("=== 30. 067 の境目：ネクサスがなければBP+されない（BP比べで負ける） ===")
{
    const s = game("canyon-none")
    const bell = put(s, "p1", BELL, 1)
    const blocker = put(s, "p2", ESPADA, 1) // BP4000（テラノセイバーは効果でブロックできないので使わない）
    assert(act(s, "p1", { type: "attack", instanceId: bell.instanceId }) === null, "デュアルキャノン・ベルでアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "エスパーダがブロック")
    passFlash(s)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === bell.instanceId), "BP3000対4000でアタッカーが破壊される")
}

console.log("=== 31. 067 Lv2『自分のアタックステップ』：赤のスピリットはBPを比べ相手だけを破壊したとき回復する ===")
{
    const s = game("canyon-recover")
    putNexus(s, "p1", CANYON, 2) // Lv2
    const van = put(s, "p1", VAN, 1) // 地竜1体でBP+1000 → 2000
    const blocker = put(s, "p2", VAN, 1) // BP1000
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手のロクケラトプスがブロック")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "BP比べでブロッカーだけが破壊される")
    assert(!van.isRested, "相手のスピリットだけを破壊したのでアタッカーは回復する")
}

console.log("=== 32. 067 の境目：Lv1では回復しない／赤でなければ回復しない ===")
{
    const s = game("canyon-lv1")
    putNexus(s, "p1", CANYON, 1) // Lv1
    const van = put(s, "p1", VAN, 1)
    const blocker = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "ブロッカーは破壊される")
    assert(van.isRested, "Lv1なので回復しない")
}
{
    const s = game("canyon-white")
    putNexus(s, "p1", CANYON, 2) // Lv2
    const bell = put(s, "p1", BELL, 1) // 白・BP3000+1000
    const blocker = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: bell.instanceId }) === null, "デュアルキャノン・ベルでアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "ブロッカーは破壊される")
    assert(bell.isRested, "赤のスピリットではないので回復しない")
}

console.log("=== 33. 073 フラッシュ：このターンの間、自分のスピリット1体をBP+3000する ===")
{
    const s = game("power-bp")
    const van = put(s, "p1", VAN, 1)
    const atk = put(s, "p1", RAINY, 1)
    s.players.p1.hand = [POWER]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "レイニードルでアタック（フラッシュタイミングを作る）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "パワーブーストを使用できる")
    settle(s, [van.instanceId])
    assert(effectiveBp(s, "p1", van) === 4000, "このターンの間ロクケラトプスはBP+3000で4000")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 34. 073 連鎖［青］：自分のネクサス1つを破壊することで、自分のスピリット1体を回復させる ===")
{
    const s = game("power-chain")
    put(s, "p1", DOLPHIN, 1) // 青シンボル
    const van = put(s, "p1", VAN, 1)
    van.isRested = true
    const spears = putNexus(s, "p1", SPEARS, 1)
    const atk = put(s, "p1", RAINY, 1)
    s.players.p1.hand = [POWER]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "レイニードルでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "パワーブーストを使用できる")
    settle(s, [spears.instanceId, van.instanceId])
    assert(!s.players.p1.field.nexuses.some((x) => x.instanceId === spears.instanceId), "自分のネクサス1つが破壊される")
    assert(!van.isRested, "ロクケラトプスは回復する")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 35. 073 連鎖の境目：青シンボルがなければ連鎖しない／ネクサスがなければ回復しない（連鎖元のBP+3000は発揮する） ===")
{
    const s = game("power-nochain")
    const van = put(s, "p1", VAN, 1)
    van.isRested = true
    putNexus(s, "p1", SPEARS, 1)
    const atk = put(s, "p1", RAINY, 1)
    s.players.p1.hand = [POWER]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "レイニードルでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "パワーブーストを使用できる")
    settle(s, [van.instanceId])
    assert(effectiveBp(s, "p1", van) === 4000, "連鎖元のBP+3000は発揮する")
    assert(s.players.p1.field.nexuses.length === 1, "青シンボルがないのでネクサスは破壊されない")
    assert(van.isRested, "回復しない")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("power-nonexus")
    put(s, "p1", DOLPHIN, 1) // 青シンボル
    const van = put(s, "p1", VAN, 1)
    van.isRested = true
    const atk = put(s, "p1", RAINY, 1)
    s.players.p1.hand = [POWER]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "レイニードルでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "パワーブーストを使用できる")
    settle(s, [van.instanceId])
    assert(effectiveBp(s, "p1", van) === 4000, "連鎖元のBP+3000は発揮する")
    assert(van.isRested, "破壊するネクサスがないので回復しない")
    takeLifeAndResolve(s, "p2")
}

console.log("すべてのチェックに合格しました 🎉（part789）")
