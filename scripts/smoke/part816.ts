// smoke パート816（BS22 B4：016・062・034・018・068 の各効果節。BS22_PLAN §1・§2 の確定読み。カードは staging にのみ存在）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const PRISCILLA = "BS22-016" // 魔剣使プリシラ（紫・コスト5・Lvコア1/3/4・召喚時ドロー／召喚時効果持ちを戻させない／合体時Lv2アタック時：疲労相手を破壊）
const MANATEE = "BS22-062" // 獣爆マナティ・マローダ（白・ブレイヴ・コスト4・召喚時：相手1体を手札に戻す。合体スピリットならブレイヴは残せない）
const KONAN = "BS22-034" // 戦術機神コナン・バウル（白・コスト5・Lvコア1/3・重装甲：紫/緑/白・相手アタック時に武装を回復・Lv2ブロック時ブレイヴ戻し）
const BALOR = "BS22-018" // 魔王バロール（紫・コスト9・Lvコア1/3/8・召喚時：コスト13以下の合体スピリットを分離・コスト7以下は合体不可・Lv2アタック時ドロー2）
const MAUSOLEUM = "BS22-068" // 万魔の霊廟（紫・ネクサス・コスト4・配置時：剣刃を持たないブレイヴを分離・コスト4/6/7は合体不可）

const KARAKURI = "BS20-060" // カラクリバッタ（緑・ブレイヴ・コスト4・剣刃ではない）
const SOLAR = "BS21-X07" // クラウン・ソーラー（白・ブレイヴ・コスト5・系統：剣刃）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・BP3000・効果なし）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3・召喚時ドロー）
const BRINDI = "BS01-090" // ヘル・ブリンディ（白・コスト4・召喚時：スピリット1体を持ち主の手札に戻す）
const PATRO = "BS20-054" // 戦騎将パトロクロス（青・コスト8）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・系統：武装・効果なし）
const BLADE = "BS21-005" // ブレード・プテラス（赤・コスト4・効果なし）
const VAJRA = "BS17-007" // ヴァジュランガ（赤・コスト6）
const LEO = "BS04-056" // ブレイブレス・レオ（黄・コスト7）
const FLAMEGUST = "BS09-069" // フレイムガスト（赤・マジック・フラッシュ：BP6000以下の相手のスピリット1体を破壊）
const PURPLEHAZE = "BS19-102" // パープルヘイズ（紫・マジック・フラッシュ：相手のスピリット1体のコア1個をリザーブに）

console.log("=== 前提: カードの機械確認（BS22 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS22.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; family: string[]; levels: { level: number; cores: number }[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    assert(byId(PRISCILLA)?.name === "魔剣使プリシラ" && byId(PRISCILLA)!.type === "spirit" && byId(PRISCILLA)!.cost === 5 && byId(PRISCILLA)!.levels.map((l) => l.cores).join("/") === "1/3/4", "PRISCILLAは魔剣使プリシラ（コスト5・Lvコア1/3/4）")
    assert(byId(MANATEE)?.name === "獣爆マナティ・マローダ" && byId(MANATEE)!.type === "brave" && byId(MANATEE)!.cost === 4, "MANATEEは獣爆マナティ・マローダ（ブレイヴ・コスト4）")
    assert(byId(KONAN)?.name === "戦術機神コナン・バウル" && byId(KONAN)!.family.includes("武装") && byId(KONAN)!.levels.map((l) => l.cores).join("/") === "1/3", "KONANは戦術機神コナン・バウル（武装・Lvコア1/3）")
    assert(byId(BALOR)?.name === "魔王バロール" && byId(BALOR)!.cost === 9 && byId(BALOR)!.levels.map((l) => l.cores).join("/") === "1/3/8", "BALORは魔王バロール（コスト9・Lvコア1/3/8）")
    assert(byId(MAUSOLEUM)?.name === "万魔の霊廟" && byId(MAUSOLEUM)!.type === "nexus" && byId(MAUSOLEUM)!.cost === 4, "MAUSOLEUMは万魔の霊廟（ネクサス・コスト4）")
    assert(getCard(KARAKURI).name === "カラクリバッタ" && getCard(KARAKURI).type === "brave" && getCard(KARAKURI).cost === 4 && !getCard(KARAKURI).family.includes("剣刃"), "KARAKURIはカラクリバッタ（剣刃ではない）")
    assert(getCard(SOLAR).name === "天空の光剣クラウン・ソーラー" && getCard(SOLAR).type === "brave" && getCard(SOLAR).family.includes("剣刃"), "SOLARはクラウン・ソーラー（剣刃）")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).cost === 5 && getCard(STIRA).effect === "", "STIRAはスティラホーン（コスト5・効果なし）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).effect === "", "VANはロクケラトプス（効果なし）")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).effect.includes("召喚時"), "GRIPはグリプ・ハンズ（召喚時）")
    assert(getCard(BRINDI).name === "ヘル・ブリンディ" && getCard(BRINDI).effect.includes("手札に戻す"), "BRINDIはヘル・ブリンディ（手札に戻す）")
    assert(getCard(PATRO).name === "戦騎将パトロクロス" && getCard(PATRO).cost === 8, "PATROはパトロクロス（コスト8）")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).family.includes("武装") && getCard(BELL).effect === "", "BELLはデュアルキャノン・ベル（武装・効果なし）")
    assert(getCard(BLADE).name === "ブレード・プテラス" && getCard(BLADE).cost === 4 && getCard(BLADE).effect === "", "BLADEはブレード・プテラス（コスト4・効果なし）")
    assert(getCard(VAJRA).name === "ヴァジュランガ" && getCard(VAJRA).cost === 6, "VAJRAはヴァジュランガ（コスト6）")
    assert(getCard(LEO).name === "ブレイブレス・レオ" && getCard(LEO).cost === 7, "LEOはブレイブレス・レオ（コスト7）")
    assert(getCard(FLAMEGUST).name === "フレイムガスト" && getCard(FLAMEGUST).type === "magic", "FLAMEGUSTはフレイムガスト（マジック）")
    assert(getCard(PURPLEHAZE).name === "パープルヘイズ" && getCard(PURPLEHAZE).type === "magic", "PURPLEHAZEはパープルヘイズ（マジック）")
}

function game(seed: string, turnPlayer: PlayerId = "p1", phase: "main" | "attack" = "main"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "white" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = phase
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

function putNexus(s: GameState, pid: PlayerId, cardId: string): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, 0)
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

// 対象の選択は picks を優先、任意の確認は optionPick が "" を返したら断る
function settle(s: GameState, picks: string[] = [], optionPick?: (options: string[]) => string | undefined): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const picked = optionPick?.(pc.options ?? []) ?? (pc.options ?? []).find((x) => x === "発動する" || x === "はい") ?? (pc.options ?? [])[0]
            err = picked === "" ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: picked ?? "" })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

const inSpirits = (s: GameState, pid: PlayerId, id: string): boolean => s.players[pid].field.spirits.some((x) => x.instanceId === id)

console.log("=== 016 召喚時：自分はデッキから1枚ドローする ===")
{
    const s = game("p016-draw")
    s.players.p1.hand = [PRISCILLA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "メインでプリシラを召喚できる")
    settle(s)
    assert(s.players.p1.hand.length === 1, "召喚した1枚が出て、ドローで手札は1枚")
    assert(s.players.p2.hand.length === 0, "相手は引かない")
}

console.log("=== 016 『召喚時』効果を持つスピリットすべては、フィールドから手札に戻らない（持たないスピリットは戻る） ===")
{
    const s = game("p016-protect", "p2")
    put(s, "p1", PRISCILLA, 1)
    const grip = put(s, "p1", GRIP, 1)
    const van = put(s, "p1", VAN, 1)
    const gripOpp = put(s, "p2", GRIP, 1)
    s.players.p2.hand = [BRINDI]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手がヘル・ブリンディを召喚")
    // ブリンディが戻すのは1体だけ。グリプ・ハンズを選んだときに戻らないことは part823 の場面で見る
    settle(s, [van.instanceId])
    assert(s.players.p1.hand.includes(VAN) && !inSpirits(s, "p1", van.instanceId), "召喚時効果を持たないロクケラトプスは手札に戻る")
    assert(inSpirits(s, "p1", grip.instanceId) && !s.players.p1.hand.includes(GRIP), "召喚時効果を持つ自分のグリプ・ハンズは戻らない")
    assert(inSpirits(s, "p2", gripOpp.instanceId) && !s.players.p2.hand.includes(GRIP), "相手のグリプ・ハンズも戻らない（陣営の限定なし）")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === PRISCILLA), "召喚時効果を持つプリシラ自身も戻らない")
}
{
    const s = game("p016-protect-none", "p2")
    const grip = put(s, "p1", GRIP, 1)
    s.players.p2.hand = [BRINDI]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手がヘル・ブリンディを召喚")
    settle(s, [grip.instanceId])
    assert(s.players.p1.hand.includes(GRIP), "プリシラがいなければグリプ・ハンズは手札に戻る")
}

console.log("=== 016 【合体時】Lv2『アタック時』：疲労状態の相手のスピリット1体を破壊する ===")
{
    const s = game("p016-attack", "p1", "attack")
    const host = put(s, "p1", PRISCILLA, 3) // Lv2
    combine(s, "p1", host, KARAKURI)
    const tired = put(s, "p2", STIRA, 1)
    tired.isRested = true
    const fresh = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体したプリシラでアタック")
    settle(s, [fresh.instanceId, tired.instanceId])
    assert(!inSpirits(s, "p2", tired.instanceId) && s.players.p2.trashCards.includes(STIRA), "疲労状態のスティラホーンが破壊される")
    assert(inSpirits(s, "p2", fresh.instanceId), "回復状態のロクケラトプスは破壊されない")
}
{
    const s = game("p016-attack-combined-target", "p1", "attack")
    const host = put(s, "p1", PRISCILLA, 3)
    combine(s, "p1", host, KARAKURI)
    const tiredHost = put(s, "p2", STIRA, 1)
    tiredHost.isRested = true
    combine(s, "p2", tiredHost, KARAKURI)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体したプリシラでアタック")
    settle(s, [tiredHost.instanceId])
    assert(s.players.p2.trashCards.includes(STIRA), "疲労した相手の合体スピリットが破壊される")
    assert(s.players.p2.trashCards.includes(KARAKURI), "この効果で合体スピリットを破壊したとき、ブレイヴはトラッシュへ")
    assert(!s.players.p2.field.spirits.some((x) => x.cardId === KARAKURI), "ブレイヴはフィールドに残らない（コアは十分にあるのに）")
}
{
    const s = game("p016-attack-alone", "p1", "attack")
    const host = put(s, "p1", PRISCILLA, 3) // 合体していない
    const tired = put(s, "p2", STIRA, 1)
    tired.isRested = true
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "プリシラ単体でアタック")
    settle(s, [tired.instanceId])
    assert(inSpirits(s, "p2", tired.instanceId), "合体していなければ破壊しない")
}
{
    const s = game("p016-attack-lv1", "p1", "attack")
    const host = put(s, "p1", PRISCILLA, 1) // Lv1
    combine(s, "p1", host, KARAKURI)
    const tired = put(s, "p2", STIRA, 1)
    tired.isRested = true
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "Lv1の合体プリシラでアタック")
    settle(s, [tired.instanceId])
    assert(inSpirits(s, "p2", tired.instanceId), "Lv1では破壊しない")
}

console.log("=== 062 召喚時：相手のスピリット1体を手札に戻す。合体スピリットが戻るときブレイヴは残せない ===")
{
    const s = game("p062-combined")
    s.players.p1.hand = [MANATEE]
    const host = put(s, "p2", STIRA, 1)
    combine(s, "p2", host, KARAKURI)
    const van = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "マナティ・マローダを召喚")
    settle(s, [host.instanceId, van.instanceId])
    assert(s.players.p2.hand.includes(STIRA) && !inSpirits(s, "p2", host.instanceId), "相手の合体スピリットのホストが手札に戻る")
    assert(s.players.p2.hand.includes(KARAKURI), "残せないブレイヴはホストと同じ領域（相手の手札）へ（BRAVE §6.3.2）")
    assert(!s.players.p2.trashCards.includes(KARAKURI) && !s.players.p2.field.spirits.some((x) => x.cardId === KARAKURI), "ブレイヴはトラッシュにもフィールドにも残らない")
    assert(inSpirits(s, "p2", van.instanceId), "選ばなかったスピリットはそのまま")
}
{
    const s = game("p062-plain")
    s.players.p1.hand = [MANATEE]
    const van = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "マナティ・マローダを召喚")
    settle(s, [van.instanceId])
    assert(s.players.p2.hand.includes(VAN) && !inSpirits(s, "p2", van.instanceId), "合体していないスピリットはふつうに手札へ")
}
{
    const s = game("p062-own-untouched")
    s.players.p1.hand = [MANATEE]
    const mine = put(s, "p1", VAN, 1)
    const theirs = put(s, "p2", STIRA, 1)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "マナティ・マローダを召喚")
    settle(s, [mine.instanceId, theirs.instanceId])
    assert(inSpirits(s, "p1", mine.instanceId), "自分のスピリットは戻せない（相手のスピリットが対象）")
    assert(s.players.p2.hand.includes(STIRA), "相手のスピリットが戻る")
}

console.log("=== 034 重装甲：相手の紫/緑/白の効果を受けない（赤の効果は受ける） ===")
{
    const s = game("p034-immune-purple", "p2", "attack")
    const konan = put(s, "p1", KONAN, 3)
    const atk = put(s, "p2", VAN, 1)
    s.players.p2.hand = [PURPLEHAZE]
    const before = konan.cores
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "紫のパープルヘイズを使用")
    settle(s, [konan.instanceId])
    assert(konan.cores === before, "相手の紫の効果ではコアを外されない")
}
{
    const s = game("p034-hit-red", "p2", "attack")
    const konan = put(s, "p1", KONAN, 1) // BP5000
    const atk = put(s, "p2", VAN, 1)
    s.players.p2.hand = [FLAMEGUST]
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側が先にパス")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "赤のフレイムガストを使用")
    settle(s, [konan.instanceId])
    assert(!inSpirits(s, "p1", konan.instanceId), "赤の効果は受けて破壊される")
}

console.log("=== 034 『相手のアタックステップ』：相手のスピリットがアタックしたとき、系統：武装を持つ自分のスピリット1体を回復 ===")
{
    const s = game("p034-recover", "p2", "attack")
    put(s, "p1", KONAN, 1)
    const bell = put(s, "p1", BELL, 1)
    bell.isRested = true
    const van = put(s, "p1", VAN, 1)
    van.isRested = true
    const atk = put(s, "p2", VAN, 1)
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    settle(s, [van.instanceId, bell.instanceId])
    assert(!bell.isRested, "疲労した武装のスピリットが回復する")
    assert(!!van.isRested, "武装ではないスピリットは回復しない")
}
{
    const s = game("p034-own-attack", "p1", "attack")
    const konan = put(s, "p1", KONAN, 1)
    const bell = put(s, "p1", BELL, 1)
    bell.isRested = true
    assert(act(s, "p1", { type: "attack", instanceId: konan.instanceId }) === null, "自分のスピリットがアタック")
    settle(s, [bell.instanceId])
    assert(!!bell.isRested, "自分のアタックでは回復しない")
}

console.log("=== 034 Lv2『ブロック時』：アタックしている相手の合体スピリットのブレイヴ1つを手札に戻すことができる ===")
for (const mode of ["accept", "decline", "lv1", "not-combined"] as const) {
    const s = game("p034-block-" + mode, "p2", "attack")
    const konan = put(s, "p1", KONAN, mode === "lv1" ? 1 : 3)
    const atk = put(s, "p2", STIRA, 1)
    if (mode !== "not-combined") combine(s, "p2", atk, KARAKURI)
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    settle(s)
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, "p1", konan.instanceId) === null, "コナン・バウルでブロック")
    settle(s, [], () => (mode === "decline" ? "" : undefined))
    const returned = s.players.p2.hand.includes(KARAKURI)
    const stillCombined = s.players.p2.field.combinedBraves.some((x) => x.cardId === KARAKURI)
    if (mode === "accept") {
        assert(returned && !stillCombined, "受けるとブレイヴが手札に戻る")
        assert(inSpirits(s, "p2", atk.instanceId), "ホストはフィールドに残る")
    } else if (mode === "decline") assert(!returned && stillCombined, "断るとブレイヴは合体したまま")
    else if (mode === "lv1") assert(!returned && stillCombined, "Lv1ではブロックしても戻さない")
    else assert(!returned, "相手が合体していなければ何も戻らない")
}

console.log("=== 018 召喚時：コスト13以下の合体スピリットすべてを分離させる（コスト14は分離しない・両陣営） ===")
{
    const s = game("p018-summon")
    s.players.p1.hand = [BALOR]
    const mine = put(s, "p1", STIRA, 1)
    const myBrave = combine(s, "p1", mine, KARAKURI) // 合計9
    const theirs = put(s, "p2", STIRA, 1)
    const theirBrave = combine(s, "p2", theirs, KARAKURI)
    const big = put(s, "p2", PATRO, 3)
    const bigBrave = combine(s, "p2", big, "BS19-X08") // 8+6=14
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "バロールを召喚")
    settle(s)
    assert(!mine.braveRefs?.length && inSpirits(s, "p1", myBrave.instanceId), "自分のコスト9の合体スピリットが分離（ブレイヴはスピリットとして残る）")
    assert(!theirs.braveRefs?.length && inSpirits(s, "p2", theirBrave.instanceId), "相手のコスト9の合体スピリットも分離")
    assert(big.braveRefs?.length === 1 && s.players.p2.field.combinedBraves.some((x) => x.instanceId === bigBrave.instanceId), "コスト14の合体スピリットは分離しない")
}

console.log("=== 018 Lv2･Lv3『アタック時』：疲労状態の相手のスピリット1体を破壊することで、自分はデッキから2枚ドロー ===")
for (const mode of ["pay", "no-target", "lv1"] as const) {
    const s = game("p018-attack-" + mode, "p1", "attack")
    const balor = put(s, "p1", BALOR, mode === "lv1" ? 1 : 3)
    const target = put(s, "p2", STIRA, 1)
    if (mode !== "no-target") target.isRested = true
    assert(act(s, "p1", { type: "attack", instanceId: balor.instanceId }) === null, "バロールでアタック")
    settle(s, [target.instanceId])
    if (mode === "pay") {
        assert(!inSpirits(s, "p2", target.instanceId), "疲労した相手のスピリットが破壊される")
        assert(s.players.p1.hand.length === 2, "破壊したので2枚ドロー")
    } else {
        assert(inSpirits(s, "p2", target.instanceId), mode === "lv1" ? "Lv1では破壊しない" : "疲労していなければ破壊しない")
        assert(s.players.p1.hand.length === 0, "破壊できないのでドローしない")
    }
}

console.log("=== 018 コスト7以下のスピリットすべては合体できない（お互い・コスト8は合体できる） ===")
for (const mode of ["with-balor", "without-balor", "big-host"] as const) {
    const s = game("p018-nocombine-" + mode)
    if (mode !== "without-balor") put(s, "p1", BALOR, 3)
    const host = put(s, "p1", mode === "big-host" ? PATRO : STIRA, 1)
    s.players.p1.hand = [KARAKURI]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    settle(s)
    const combined = s.players.p1.field.combinedBraves.length === 1 && host.braveRefs?.length === 1
    assert(combined === (mode !== "with-balor"), mode === "with-balor" ? "バロールがいるとコスト5のスピリットには合体できない" : "合体できる")
}

console.log("=== 068 配置時：合体スピリットの、系統：剣刃を持たないブレイヴすべてを分離させる（両陣営・剣刃は残る） ===")
{
    const s = game("p068-place")
    s.players.p1.hand = [MAUSOLEUM]
    const mine = put(s, "p1", STIRA, 1)
    const myBrave = combine(s, "p1", mine, KARAKURI)
    const sword = put(s, "p1", PATRO, 3)
    combine(s, "p1", sword, SOLAR)
    const theirs = put(s, "p2", STIRA, 1)
    const theirBrave = combine(s, "p2", theirs, KARAKURI)
    assert(act(s, "p1", { type: "setNexus", handIndex: 0 }) === null, "万魔の霊廟を配置")
    settle(s)
    assert(!mine.braveRefs?.length && inSpirits(s, "p1", myBrave.instanceId), "自分の剣刃でないブレイヴが分離する")
    assert(!theirs.braveRefs?.length && inSpirits(s, "p2", theirBrave.instanceId), "相手の剣刃でないブレイヴも分離する")
    assert(sword.braveRefs?.length === 1, "剣刃のブレイヴは合体したまま")
}

console.log("=== 068 コスト4/6/7のスピリットすべては合体できない（コスト5は合体できる） ===")
for (const [label, hostCard, expected] of [["4", BLADE, false], ["5", STIRA, true], ["6", VAJRA, false], ["7", LEO, false]] as [string, string, boolean][]) {
    const s = game("p068-nocombine-" + label)
    putNexus(s, "p1", MAUSOLEUM)
    const host = put(s, "p1", hostCard, 1)
    s.players.p1.hand = [KARAKURI]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    settle(s)
    const combined = s.players.p1.field.combinedBraves.length === 1 && host.braveRefs?.length === 1
    assert(combined === expected, expected ? `コスト${label}には合体できる` : `コスト${label}には合体できない`)
}
{
    const s = game("p068-nocombine-gone")
    const host = put(s, "p1", BLADE, 1)
    s.players.p1.hand = [KARAKURI]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    settle(s)
    assert(s.players.p1.field.combinedBraves.length === 1, "ネクサスが無ければコスト4にも合体できる")
}

console.log("すべてのチェックに合格しました 🎉（part816）")
