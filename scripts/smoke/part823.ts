// smoke パート823（BS22 B11：014 魔術師ハクジャ・016 の「召喚時を持つスピリットは戻らない」節・069 Lv2 の効果を受けない節・X02 冥府三巨頭ザンデ・ミリオン。BS22_PLAN §1・§2。実装前に書いた期待値テスト）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const HAKUJA = "BS22-014" // 魔術師ハクジャ（紫・コスト4・妖蛇・Lvコア1/3/4）
const PRISCILLA = "BS22-016" // 魔剣使プリシラ（紫・コスト5・剣使/夜族・召喚時ドロー）
const SHINOBI = "BS22-069" // 光牙の忍び里（緑・ネクサス・Lvコア0/1）
const ZANDE = "BS22-X02" // 冥府三巨頭ザンデ・ミリオン（紫・コスト8・無魔・Lvコア1/3/6）

const LAZARUS = "BS03-076" // 爪剣のラザラス（青・コスト2・【粉砕】Lv1 で1枚）
const STON = "BS03-073" // ストン・スタチュー（青・コスト1・召喚時：相手のデッキを1枚破棄）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3・幽魔・召喚時ドロー）
const RIOC = "BS18-025" // 大怪虫リオック（緑・コスト4・アタック時ボイドからコア1個を自分のスピリットに）
const AUDOMURA = "BS06-041" // 鎧装獣アウドムラ（白・コスト3・Lv1コア2・ブロック時ボイドからコア1個をこのスピリットに）
const VICTO = "BS19-018" // ヴィクトローラー（紫・コスト4・召喚時 相手のスピリットのコア1個を相手のリザーブに）
const EIL = "BS10-035" // 樹氷の女神エイル（白・コスト4・召喚時 相手のスピリット1体を手札に戻す）
const PIXY = "BS17-021" // ピクシーファルコ（緑・コスト2・爪鳥・Lv1 BP2000）
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・BP6000・効果なし。分身の代役）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const STAVA = "BS19-007" // スタバ・ドラゴン（赤・コスト4・Lv2アタック時 BP4000以下の相手のスピリット1体を破壊）
const QUICK = "BS20-005" // クイックサンド・ドラゴン（赤・コスト4・召喚時 BP4000以下の相手のスピリット1体を破壊）
const FLAMEGUST = "BS09-069" // フレイムガスト（赤・マジック・コスト6・フラッシュ BP6000以下破壊）
const HONEDEER = "BS16-010" // 骨鹿（紫・コスト1・無魔・Lv1 BP2000）
const VIZOF = "BS04-034" // ヴィゾフニル（白・コスト1・【装甲：紫】）
const TOPS = "BS20-012" // ボーン・トプス（紫・コスト3・無魔・Lv1 BP2000）

console.log("=== 前提: カードの機械確認（BS22 と BS20 は staging にしか無い） ===")
{
    const staging = [...JSON.parse(readFileSync("data/staging/BS22.json", "utf8")), ...JSON.parse(readFileSync("data/staging/BS20.json", "utf8"))] as { cardId: string; name: string; type: string; cost: number; family: string[]; levels: { level: number; cores: number; bp: number }[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    const lv = (id: string) => byId(id)!.levels.map((l) => l.cores).join("/")
    assert(byId(HAKUJA)?.name === "魔術師ハクジャ" && byId(HAKUJA)!.cost === 4 && lv(HAKUJA) === "1/3/4", "HAKUJAは魔術師ハクジャ（コスト4・Lvコア1/3/4）")
    assert(byId(PRISCILLA)?.name === "魔剣使プリシラ" && byId(PRISCILLA)!.cost === 5, "PRISCILLAは魔剣使プリシラ（コスト5）")
    assert(byId(SHINOBI)?.name === "光牙の忍び里" && byId(SHINOBI)!.type === "nexus" && lv(SHINOBI) === "0/1", "SHINOBIは光牙の忍び里（ネクサス・Lvコア0/1）")
    assert(byId(ZANDE)?.name === "冥府三巨頭ザンデ・ミリオン" && byId(ZANDE)!.family.includes("無魔") && lv(ZANDE) === "1/3/6", "ZANDEは冥府三巨頭ザンデ・ミリオン（無魔・Lvコア1/3/6）")
    assert(byId(QUICK)?.name === "クイックサンド・ドラゴン" && byId(QUICK)!.cost === 4, "QUICKはクイックサンド・ドラゴン")
    assert(byId(TOPS)?.name === "ボーン・トプス" && byId(TOPS)!.family.includes("無魔") && byId(TOPS)!.cost === 3, "TOPSはボーン・トプス（無魔・コスト3）")
    assert(getCard(LAZARUS).name === "爪剣のラザラス" && getCard(LAZARUS).effect.includes("【粉砕】"), "LAZARUSはラザラス（【粉砕】）")
    assert(getCard(STON).name === "ストン・スタチュー" && getCard(STON).cost === 1 && getCard(STON).effect.includes("召喚時"), "STONはストン・スタチュー（コスト1・召喚時）")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).cost === 3 && !getCard(GRIP).family.includes("無魔") && getCard(GRIP).effect.includes("召喚時"), "GRIPはグリプ・ハンズ（コスト3・無魔でない・召喚時）")
    assert(getCard(RIOC).name === "大怪虫リオック" && getCard(RIOC).colors[0] === "green", "RIOCは大怪虫リオック（緑）")
    assert(getCard(AUDOMURA).name === "鎧装獣アウドムラ" && getCard(AUDOMURA).colors[0] === "white", "AUDOMURAはアウドムラ（白）")
    assert(getCard(VICTO).name === "ヴィクトローラー" && getCard(VICTO).cost === 4, "VICTOはヴィクトローラー")
    assert(getCard(EIL).name === "樹氷の女神エイル" && getCard(EIL).cost === 4, "EILは樹氷の女神エイル")
    assert(getCard(PIXY).name === "ピクシーファルコ" && getCard(PIXY).family.includes("爪鳥"), "PIXYはピクシーファルコ（爪鳥）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).colors[0] === "green" && getCard(TARAN).effect === "", "TARANはタランドーズ（緑・効果なし）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).effect === "", "VANはロクケラトプス")
    assert(getCard(STAVA).name === "スタバ・ドラゴン" && getCard(STAVA).effect.includes("BP4000以下"), "STAVAはスタバ・ドラゴン")
    assert(getCard(FLAMEGUST).name === "フレイムガスト" && getCard(FLAMEGUST).type === "magic", "FLAMEGUSTはフレイムガスト")
    assert(getCard(VIZOF).name === "ヴィゾフニル" && getCard(VIZOF).effect.includes("【装甲：") && getCard(VIZOF).effect.includes("紫"), "VIZOFはヴィゾフニル（【装甲：紫】）")
    assert(getCard(HONEDEER).name === "骨鹿" && getCard(HONEDEER).family.includes("無魔"), "HONEDEERは骨鹿（無魔）")
}

function game(seed: string, p1Color: "purple" | "green" = "purple", p2Color: "red" | "white" | "green" = "red", phase: "main" | "attack" = "attack", turnPlayer: PlayerId = "p1", interactive = true): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: p1Color, p2: p2Color })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = phase
    s.interactiveTargets = interactive
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// B1 の【分身】個体（仮定義 BS22-T001＋bunshinOf）
function putBunshin(s: GameState, pid: PlayerId): ReturnType<typeof createInstance> {
    const inst = put(s, pid, "BS22-T001", 1)
    ;(inst as unknown as Record<string, unknown>).bunshinOf = VAN
    return inst
}

const onField = (s: GameState, pid: PlayerId, inst: { instanceId: string }) => s.players[pid].field.spirits.some((x) => x.instanceId === inst.instanceId)

// 対象は picks を優先。picks に無い候補の選択・任意の確認は decline で断る（選択肢を付けずに resolveChoice）
function settle(s: GameState, picks: string[] = [], decline = false): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        const hit = picks.find((x) => (pc.candidates ?? []).includes(x))
        let err: string | null
        if (pc.kind === "target" && hit !== undefined) err = act(s, who, { type: "resolveChoice", instanceId: hit })
        else if (decline) err = act(s, who, { type: "resolveChoice" })
        else if (pc.kind === "option") err = act(s, who, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        else if (pc.kind === "target" && pc.candidates?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", instanceId: pc.candidates[0] })
        else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

// 防御側（優先権が先）に回っていればそのまま、まだなら攻撃側がパスして回す
function flashCast(s: GameState, pid: PlayerId, handIndex = 0): string | null {
    const first = act(s, pid, { type: "castMagic", handIndex, timing: "flash" })
    if (first === null) return null
    act(s, s.priorityPlayer, { type: "pass" })
    return act(s, pid, { type: "castMagic", handIndex, timing: "flash" })
}

console.log("=== 014 節1：お互いのデッキは破棄されない（自分がいても相手がいても【粉砕】は効かない） ===")
for (const [label, owner] of [["自分のハクジャ", "p1"], ["相手のハクジャ", "p2"], ["ハクジャ無し", null]] as const) {
    const s = game(`hakuja-deck-${label}`, "purple", "red", "attack", "p1", false)
    if (owner) put(s, owner, HAKUJA, 1)
    const laz = put(s, "p1", LAZARUS, 1) // Lv1 で1枚
    const deck = s.players.p2.deck.length
    assert(act(s, "p1", { type: "attack", instanceId: laz.instanceId }) === null, `${label}：ラザラスでアタックできる`)
    settle(s)
    assert(s.players.p2.deck.length === (owner ? deck : deck - 1), owner ? `${label}：【粉砕】でも相手のデッキは破棄されない` : "ハクジャ無しなら【粉砕】Lv1 で1枚破棄される")
}

console.log("=== 014 節2：緑のスピリットの効果でボイドからコアが増えたとき、増えたコアと発揮したスピリットのコアすべてをボイドに置く ===")
for (const owner of ["p1", "p2"] as const) {
    const s = game(`hakuja-green-${owner}`, "green", "red", "attack", "p1", false)
    put(s, owner, HAKUJA, 1)
    const rioc = put(s, "p1", RIOC, 1)
    const reserve = s.players.p1.reserve
    assert(act(s, "p1", { type: "attack", instanceId: rioc.instanceId }) === null, `${owner}のハクジャ：リオックでアタックできる`)
    settle(s)
    assert(s.players.p1.reserve === reserve, "コアはリザーブに増えない")
    assert(!onField(s, "p1", rioc), "リオックはコアすべてがボイドに置かれて場に残らない")
}
{
    const s = game("hakuja-green-none", "green", "red", "attack", "p1", false)
    const rioc = put(s, "p1", RIOC, 1)
    assert(act(s, "p1", { type: "attack", instanceId: rioc.instanceId }) === null, "ハクジャ無し：リオックでアタックできる")
    settle(s)
    assert(onField(s, "p1", rioc) && rioc.cores === 2, "ハクジャ無しならリオックにコアが1個増えて2個")
}
{
    // 緑でないスピリットの効果には働かない
    const s = game("hakuja-nongreen", "purple", "white", "attack", "p2", false)
    put(s, "p1", HAKUJA, 1)
    const aud = put(s, "p1", AUDOMURA, 2)
    const taran = put(s, "p2", TARAN, 1)
    assert(act(s, "p2", { type: "attack", instanceId: taran.instanceId }) === null, "相手のタランドーズでアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p1", aud.instanceId) === null, "アウドムラでブロック")
    settle(s)
    assert(aud.cores === 3, "白のアウドムラの効果で増えたコアは置き直されない（2→3）")
}

console.log("=== 014 Lv3【強化】：自分の「コア除去効果」でリザーブに置くコアを+1個（Lv2・相手のハクジャでは増えない） ===")
for (const [label, ownerPid, cores, expected] of [["自分の Lv3", "p1", 4, 2], ["自分の Lv2", "p1", 3, 1], ["相手の Lv3", "p2", 4, 1]] as const) {
    const s = game(`hakuja-kyoka-${label}`, "purple", "red", "main", "p1", false)
    put(s, ownerPid, HAKUJA, cores)
    const target = put(s, "p2", TARAN, 4)
    s.players.p1.hand = [VICTO]
    const reserve = s.players.p2.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, `${label}：ヴィクトローラーを召喚できる`)
    settle(s, [target.instanceId])
    assert(target.cores === 4 - expected && s.players.p2.reserve === reserve + expected, `${label}：相手のスピリットから${expected}個のコアがリザーブへ`)
}

console.log("=== 016：『召喚時』効果を持つスピリットすべては手札/デッキに戻らない（持たないスピリットは戻る） ===")
for (const [label, owner] of [["自分のプリシラ", "p1"], ["相手のプリシラ", "p2"]] as const) {
    const s = game(`pris-${label}`, "purple", "white", "main", "p2", true)
    put(s, owner, PRISCILLA, 1)
    const grip = put(s, "p1", GRIP, 1)
    s.players.p2.hand = [EIL]
    const hand = s.players.p1.hand.length
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, `${label}：エイルを召喚できる`)
    settle(s, [grip.instanceId])
    assert(onField(s, "p1", grip) && s.players.p1.hand.length === hand, `${label}：召喚時を持つグリプ・ハンズは手札に戻らない`)
}
{
    const s = game("pris-van", "purple", "white", "main", "p2", true)
    put(s, "p1", PRISCILLA, 1)
    const van = put(s, "p1", VAN, 1)
    s.players.p2.hand = [EIL]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "エイルを召喚できる")
    settle(s, [van.instanceId])
    assert(!onField(s, "p1", van) && s.players.p1.hand.includes(VAN), "召喚時を持たないロクケラトプスは手札に戻る")
}
{
    const s = game("pris-none", "purple", "white", "main", "p2", true)
    const grip = put(s, "p1", GRIP, 1)
    s.players.p2.hand = [EIL]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "エイルを召喚できる")
    settle(s, [grip.instanceId])
    assert(!onField(s, "p1", grip) && s.players.p1.hand.includes(GRIP), "プリシラ無しならグリプ・ハンズは手札に戻る")
}
{
    const s = game("pris-self", "purple", "white", "main", "p2", true)
    const pris = put(s, "p1", PRISCILLA, 1)
    s.players.p2.hand = [EIL]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "エイルを召喚できる")
    settle(s, [pris.instanceId])
    assert(onField(s, "p1", pris), "プリシラ自身も召喚時効果を持つので手札に戻らない")
}

console.log("=== 069 Lv2：お互いのアタックステップ、自分の分身がいる間、爪鳥の自分のスピリットは相手のスピリット/ネクサスの効果を受けない ===")
{
    const s = game("shinobi-immune", "green", "red", "attack", "p2", true)
    putNexus(s, "p1", SHINOBI, 1) // Lv2
    const pixy = put(s, "p1", PIXY, 1) // Lv1 BP2000 +2000 = 4000
    const van = put(s, "p1", VAN, 1) // 爪鳥でない BP1000
    putBunshin(s, "p1")
    const stava = put(s, "p2", STAVA, 2) // Lv2
    assert(act(s, "p2", { type: "attack", instanceId: stava.instanceId }) === null, "スタバ・ドラゴンでアタック")
    settle(s, [pixy.instanceId, van.instanceId])
    assert(onField(s, "p1", pixy), "爪鳥のピクシーファルコは相手のスピリットの効果で破壊されない")
    assert(!onField(s, "p1", van), "爪鳥でないロクケラトプスは破壊される")
}
{
    const s = game("shinobi-nobunshin", "green", "red", "attack", "p2", true)
    putNexus(s, "p1", SHINOBI, 1)
    const pixy = put(s, "p1", PIXY, 1)
    const stava = put(s, "p2", STAVA, 2)
    assert(act(s, "p2", { type: "attack", instanceId: stava.instanceId }) === null, "スタバ・ドラゴンでアタック")
    settle(s, [pixy.instanceId])
    assert(!onField(s, "p1", pixy), "分身がいなければ受ける（BP4000以下で破壊される）")
}
{
    const s = game("shinobi-lv1", "green", "red", "attack", "p2", true)
    putNexus(s, "p1", SHINOBI, 0) // Lv1
    const pixy = put(s, "p1", PIXY, 1)
    putBunshin(s, "p1")
    const stava = put(s, "p2", STAVA, 2)
    assert(act(s, "p2", { type: "attack", instanceId: stava.instanceId }) === null, "スタバ・ドラゴンでアタック")
    settle(s, [pixy.instanceId])
    assert(!onField(s, "p1", pixy), "Lv1 では効果を受けない節は働かない（Lv1 でも BP+2000 は付くので BP4000で破壊される）")
}
{
    // マジックの効果は「スピリット/ネクサスの効果」ではない
    const s = game("shinobi-magic", "green", "red", "attack", "p2", true)
    putNexus(s, "p1", SHINOBI, 1)
    const pixy = put(s, "p1", PIXY, 1)
    putBunshin(s, "p1")
    const stava = put(s, "p2", STAVA, 2)
    put(s, "p2", VAN, 1)
    s.players.p2.hand = [FLAMEGUST]
    assert(act(s, "p2", { type: "attack", instanceId: stava.instanceId }) === null, "スタバ・ドラゴンでアタック")
    assert(flashCast(s, "p2") === null, "フレイムガストをフラッシュで使用できる")
    settle(s, [pixy.instanceId])
    assert(!onField(s, "p1", pixy), "相手のマジックの効果は受ける（BP6000以下なので破壊される）")
}
{
    // アタックステップの外（相手のメインステップの召喚時効果）では受ける
    const s = game("shinobi-main", "green", "red", "main", "p2", true)
    putNexus(s, "p1", SHINOBI, 1)
    const pixy = put(s, "p1", PIXY, 1)
    putBunshin(s, "p1")
    s.players.p2.hand = [QUICK]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "クイックサンド・ドラゴンを召喚できる")
    settle(s, [pixy.instanceId])
    assert(!onField(s, "p1", pixy), "アタックステップ以外では効果を受けて破壊される")
}

console.log("=== X02 節1：無魔の自分のスピリットがアタックしたとき、相手は相手のスピリット1体を破壊しなければブロックできない ===")
{
    const s = game("zande-cost")
    const zande = put(s, "p1", ZANDE, 1)
    const a = put(s, "p2", VAN, 1)
    const b = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: zande.instanceId }) === null, "ザンデでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p2", a.instanceId) === null, "もう1体を破壊するならブロックできる")
    settle(s, [b.instanceId])
    assert(!onField(s, "p2", b), "ブロックするスピリット以外の1体が破壊される")
    assert(s.battle?.blockerInstanceId === a.instanceId || !onField(s, "p2", a), "ブロックは成立している")
}
{
    const s = game("zande-alone")
    const zande = put(s, "p1", ZANDE, 1)
    const a = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: zande.instanceId }) === null, "ザンデでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p2", a.instanceId) !== null, "ブロックするスピリット以外に破壊できる相手のスピリットがいなければブロックできない")
}
{
    // Q4432：ほかのスピリットがすべて【装甲：紫】なら破壊できずブロックできない
    const s = game("zande-armor", "purple", "white")
    const zande = put(s, "p1", ZANDE, 1)
    const a = put(s, "p2", VIZOF, 1)
    const b = put(s, "p2", VIZOF, 1)
    assert(act(s, "p1", { type: "attack", instanceId: zande.instanceId }) === null, "ザンデでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p2", a.instanceId) !== null, "ほかのスピリットがすべて【装甲：紫】ならブロックできない")
    assert(onField(s, "p2", b), "【装甲：紫】のスピリットは破壊されない")
    const c = put(s, "p2", VAN, 1)
    assert(declareBlock(s, "p2", a.instanceId) === null, "装甲を持たないスピリットがいればブロックできる")
    settle(s, [c.instanceId])
    assert(!onField(s, "p2", c) && onField(s, "p2", b), "破壊されるのは装甲を持たない側")
}
{
    const s = game("zande-nonmama")
    put(s, "p1", ZANDE, 1)
    const van = put(s, "p1", VAN, 1) // 無魔でない
    const a = put(s, "p2", VAN, 1)
    const b = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p2", a.instanceId) === null, "無魔でないスピリットのアタックには破壊の条件がない")
    settle(s)
    assert(onField(s, "p2", b), "もう1体は破壊されない")
}
{
    const s = game("zande-opp")
    const hone = put(s, "p1", HONEDEER, 1) // 無魔だが、ザンデは相手の場にいる
    put(s, "p2", ZANDE, 1)
    const a = put(s, "p2", VAN, 1)
    const b = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: hone.instanceId }) === null, "骨鹿でアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p2", a.instanceId) === null, "ザンデは「自分の」アタックステップだけなので条件はない")
    settle(s)
    assert(onField(s, "p2", b), "もう1体は破壊されない")
}

console.log("=== X02 Lv2･Lv3：無魔の自分のスピリットが相手によって破壊されたとき、トラッシュのコストの低いスピリット1枚をコストを支払わずに召喚できる（召喚時は発揮されない） ===")
// 自分のアタックステップにザンデでアタック → 相手がフラッシュのフレイムガストで無魔のボーン・トプス（コスト3）を破壊
function zandeScene(seed: string, opts: { zandeCores?: number; trash: string[]; destroyed?: string; turnPlayer?: PlayerId }): { s: GameState; victim: ReturnType<typeof createInstance>; deck2: number } {
    const tp = opts.turnPlayer ?? "p1"
    const s = game(seed, "purple", "red", "attack", tp, true)
    const mine = tp === "p1"
    put(s, "p1", ZANDE, opts.zandeCores ?? 3)
    const victim = put(s, "p1", opts.destroyed ?? TOPS, 1)
    s.players.p1.trashCards = [...opts.trash]
    const deck2 = s.players.p2.deck.length
    if (mine) {
        const zande = s.players.p1.field.spirits[0]!
        put(s, "p2", VAN, 1)
        s.players.p2.hand = [FLAMEGUST]
        assert(act(s, "p1", { type: "attack", instanceId: zande.instanceId }) === null, `${seed}：ザンデでアタック`)
        assert(flashCast(s, "p2") === null, `${seed}：相手がフレイムガストをフラッシュで使用できる`)
        settle(s, [victim.instanceId], false)
    } else {
        const stava = put(s, "p2", STAVA, 2)
        assert(act(s, "p2", { type: "attack", instanceId: stava.instanceId }) === null, `${seed}：スタバ・ドラゴンでアタック`)
        settle(s, [victim.instanceId])
    }
    return { s, victim, deck2 }
}
{
    const { s, victim, deck2 } = zandeScene("zande-summon", { trash: [STON, GRIP] })
    assert(!onField(s, "p1", victim), "ボーン・トプスは破壊された")
    const ston = s.players.p1.field.spirits.find((x) => x.cardId === STON)
    assert(ston !== undefined, "コストの低いストン・スタチューが召喚される")
    assert(!s.players.p1.trashCards.includes(STON) && s.players.p1.trashCards.includes(GRIP), "ストンはトラッシュから離れ、コストが同じグリプ・ハンズは対象外で残る")
    assert(s.players.p2.deck.length === deck2, "『召喚時』効果は発揮されず相手のデッキは破棄されない")
}
{
    const s = game("zande-decline", "purple", "red", "attack", "p1", true)
    put(s, "p1", ZANDE, 3)
    const victim = put(s, "p1", TOPS, 1)
    s.players.p1.trashCards = [STON]
    put(s, "p2", VAN, 1)
    s.players.p2.hand = [FLAMEGUST]
    const zande = s.players.p1.field.spirits[0]!
    assert(act(s, "p1", { type: "attack", instanceId: zande.instanceId }) === null, "ザンデでアタック")
    assert(flashCast(s, "p2") === null, "フレイムガストをフラッシュで使用できる")
    settle(s, [victim.instanceId], true) // 「できる」の確認は選択肢を付けずに resolveChoice で断る
    assert(!s.players.p1.field.spirits.some((x) => x.cardId === STON) && s.players.p1.trashCards.includes(STON), "断ればストン・スタチューはトラッシュに残る")
}
{
    const { s } = zandeScene("zande-samecost", { trash: [GRIP] })
    assert(!s.players.p1.field.spirits.some((x) => x.cardId === GRIP) && s.players.p1.trashCards.includes(GRIP), "破壊されたスピリットと同じコスト（3）のスピリットは召喚できない")
}
{
    const { s } = zandeScene("zande-lv1", { zandeCores: 1, trash: [STON] })
    assert(!s.players.p1.field.spirits.some((x) => x.cardId === STON) && s.players.p1.trashCards.includes(STON), "ザンデが Lv1 なら召喚できない")
}
{
    const { s } = zandeScene("zande-nonmama", { trash: [STON], destroyed: GRIP })
    assert(!s.players.p1.field.spirits.some((x) => x.cardId === STON) && s.players.p1.trashCards.includes(STON), "無魔でないスピリットが破壊されても召喚できない")
}
{
    const { s, victim } = zandeScene("zande-oppturn", { trash: [STON], turnPlayer: "p2" })
    assert(!onField(s, "p1", victim), "相手のアタックステップにボーン・トプスは破壊された")
    assert(!s.players.p1.field.spirits.some((x) => x.cardId === STON) && s.players.p1.trashCards.includes(STON), "自分のアタックステップの外では召喚できない")
}
{
    // 自分の効果による破壊は「相手によって」ではない
    const s = game("zande-own", "purple", "red", "attack", "p1", true)
    const zande = put(s, "p1", ZANDE, 3)
    const victim = put(s, "p1", TOPS, 1)
    s.players.p1.trashCards = [STON]
    s.players.p1.hand = [FLAMEGUST]
    put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: zande.instanceId }) === null, "ザンデでアタック")
    assert(flashCast(s, "p1") === null, "自分でフレイムガストをフラッシュで使用できる")
    settle(s, [victim.instanceId], false)
    assert(!s.players.p1.field.spirits.some((x) => x.cardId === STON) && s.players.p1.trashCards.includes(STON), "自分の効果で破壊しても召喚できない")
}

console.log("すべてのチェックに合格しました 🎉（part823）")
