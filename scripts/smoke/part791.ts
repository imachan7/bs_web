// smoke パート791（BS20-020〜027・059・060・077・078：緑【強化】の疲労+1体・【神速】と白連鎖・相手効果破壊での疲労残存・アタック時のコア・バトル終了時の手札戻し・合体時の回復・マジックのBP+とBP比べ回復）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, effectiveBp, endTurn, getCard, handleAction, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const KIJ = "BS20-020" // ケンゴーキジ（緑・コスト2・Lv2【強化】）
const YAGO = "BS20-021" // ヤゴイソバナ（緑・コスト3・【神速】・白連鎖：BP3000以下を手札に戻す）
const TOBIMARU = "BS20-022" // 風楯の守護者トビマル（緑・コスト3・Lv1残存・Lv2バトル時：相手は相手のスピリット1体を疲労させる）
const SHINJU = "BS20-023" // シンジュリウス（緑・コスト4・アタック時：ボイドからコア1個をリザーブか自分のスピリットに）
const HAYATO = "BS20-024" // ビャッコウ・ハヤト（緑・コスト4・召喚時：相手のスピリット1体を疲労させる）
const CHUHI = "BS20-026" // シノビ・チュウヒ（緑・コスト5・召喚時：疲労またはコア・Lv2バトル終了時：手札に戻れる）
const AMARAN = "BS20-027" // アマランサス・パイパー（緑・コスト7・アタック時：BP3000以下全疲労・白連鎖：手札に戻す）
const SUSUKI = "BS20-059" // ススキンケイ（緑・ブレイヴ・コスト4・合体条件コスト5以上・合体アタック時：リザーブ3コア→トラッシュで回復）
const KARAKURI = "BS20-060" // カラクリバッタ（緑・ブレイヴ・コスト4・合体条件コスト4以上・自分のエンドステップに回復）
const WIND = "BS20-077" // ウィンドプレッシャー（緑・マジック・コスト2・メイン：爪鳥全員BP+2000／フラッシュ：相手1体を疲労させる）
const ABSORB = "BS20-078" // アブソーブパワー（緑・マジック・コスト5・フラッシュ：BP比べで相手だけ破壊したとき回復・白連鎖：手札に戻す）

const SEAZAR = "BS01-063" // エメラルドシーザー（緑・コスト4・召喚時：相手のスピリット1体を疲労させる）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・Lv1 BP3000・効果なし）白シンボルとBP3000の境目
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const SABER = "BS01-003" // テラノセイバー（赤・コスト2・BP4000）BP3000超え
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・効果なし）コスト5以上の合体条件のホスト

console.log("=== 前提: カードの機械確認（BS20 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS20.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors?: string[]; levels: { level: number; cores: number }[]; family?: string[] }[]
    const find = (id: string) => staging.find((c) => c.cardId === id)
    assert(find(KIJ)?.name === "ケンゴーキジ" && find(KIJ)!.type === "spirit" && find(KIJ)!.cost === 2 && find(KIJ)!.levels.map((l) => l.cores).join("/") === "1/3", "KIJはケンゴーキジ（緑・コスト2・Lvコア1/3）")
    assert(find(YAGO)?.name === "ヤゴイソバナ" && find(YAGO)!.type === "spirit" && find(YAGO)!.cost === 3 && find(YAGO)!.levels.map((l) => l.cores).join("/") === "1/3", "YAGOはヤゴイソバナ（緑・コスト3・Lvコア1/3）")
    assert(find(TOBIMARU)?.name === "風楯の守護者トビマル" && find(TOBIMARU)!.type === "spirit" && find(TOBIMARU)!.cost === 3 && find(TOBIMARU)!.levels.map((l) => l.cores).join("/") === "1/3", "TOBIMARUは風楯の守護者トビマル（緑・コスト3・Lvコア1/3）")
    assert(find(SHINJU)?.name === "シンジュリウス" && find(SHINJU)!.type === "spirit" && find(SHINJU)!.cost === 4 && find(SHINJU)!.levels.map((l) => l.cores).join("/") === "1/3/5", "SHINJUはシンジュリウス（緑・コスト4・Lvコア1/3/5）")
    assert(find(HAYATO)?.name === "ビャッコウ・ハヤト" && find(HAYATO)!.type === "spirit" && find(HAYATO)!.cost === 4 && find(HAYATO)!.levels.map((l) => l.cores).join("/") === "1/2", "HAYATOはビャッコウ・ハヤト（緑・コスト4・Lvコア1/2）")
    assert(find(CHUHI)?.name === "シノビ・チュウヒ" && find(CHUHI)!.type === "spirit" && find(CHUHI)!.cost === 5 && find(CHUHI)!.levels.map((l) => l.cores).join("/") === "1/3", "CHUHIはシノビ・チュウヒ（緑・コスト5・Lvコア1/3）")
    assert(find(AMARAN)?.name === "アマランサス・パイパー" && find(AMARAN)!.type === "spirit" && find(AMARAN)!.cost === 7 && find(AMARAN)!.levels.map((l) => l.cores).join("/") === "1/3", "AMARANはアマランサス・パイパー（緑・コスト7・Lvコア1/3）")
    assert(find(SUSUKI)?.name === "ススキンケイ" && find(SUSUKI)!.type === "brave" && find(SUSUKI)!.cost === 4, "SUSUKIはススキンケイ（緑・ブレイヴ・コスト4）")
    assert(find(KARAKURI)?.name === "カラクリバッタ" && find(KARAKURI)!.type === "brave" && find(KARAKURI)!.cost === 4, "KARAKURIはカラクリバッタ（緑・ブレイヴ・コスト4）")
    assert(find(WIND)?.name === "ウィンドプレッシャー" && find(WIND)!.type === "magic" && find(WIND)!.cost === 2, "WINDはウィンドプレッシャー（緑・マジック・コスト2）")
    assert(find(ABSORB)?.name === "アブソーブパワー" && find(ABSORB)!.type === "magic" && find(ABSORB)!.cost === 5, "ABSORBはアブソーブパワー（緑・マジック・コスト5）")
    assert(getCard(SEAZAR).name === "エメラルドシーザー" && getCard(SEAZAR).colors[0] === "green" && getCard(SEAZAR).cost === 4, "SEAZARはエメラルドシーザー（緑・コスト4・召喚時：相手1体を疲労させる）")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).colors[0] === "white" && getCard(BELL).cost === 4 && getCard(BELL).levels[0]!.bp === 3000, "BELLはデュアルキャノン・ベル（白・コスト4・BP3000）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1 && getCard(VAN).levels[0]!.bp === 1000, "VANはロクケラトプス（赤・コスト1・BP1000）")
    assert(getCard(SABER).name === "テラノセイバー" && getCard(SABER).levels[0]!.bp === 4000, "SABERはテラノセイバー（BP4000）")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).cost === 5 && getCard(STIRA).effect === "", "STIRAはスティラホーン（赤・コスト5・効果なし）")
}

function game(seed: string, turnPlayer: "p1" | "p2" = "p1", phase: "main" | "attack" = "attack"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
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

// ブレイヴをホストに合体させる（part776 と同じ作り方）
function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): ReturnType<typeof createInstance> {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

// pendingChoice を答える。option は optionPick が決め、target は picks に入っていればそれを選ぶ
function settle(s: GameState, picks: string[] = [], optionPick?: (prompt: string, options: string[]) => string | undefined): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; prompt: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const picked = optionPick?.(pc.prompt, pc.options ?? []) ?? (pc.options ?? []).find((x) => x === "発動する" || x === "はい") ?? (pc.options ?? [])[0]
            err = act(s, who, { type: "resolveChoice", option: picked ?? "" })
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

console.log("=== A. 020 Lv2【強化】：自分の「相手への疲労効果」の体数が+1体される（エメラルドシーザーの召喚時で2体疲労） ===")
{
    const s = game("a", "p1", "main")
    put(s, "p1", KIJ, 3) // Lv2【強化】
    const v1 = put(s, "p2", VAN, 1)
    const v2 = put(s, "p2", VAN, 1)
    s.players.p1.hand = [SEAZAR]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "エメラルドシーザーを召喚できる")
    settle(s, [v1.instanceId, v2.instanceId])
    assert(v1.isRested && v2.isRested, "【強化】で相手のスピリット2体が疲労する")
}
{
    const s = game("a2", "p1", "main")
    put(s, "p1", KIJ, 1) // Lv1【強化】無し
    const v1 = put(s, "p2", VAN, 1)
    const v2 = put(s, "p2", VAN, 1)
    s.players.p1.hand = [SEAZAR]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "エメラルドシーザーを召喚できる")
    settle(s, [v1.instanceId, v2.instanceId])
    assert((v1.isRested ? 1 : 0) + (v2.isRested ? 1 : 0) === 1, "Lv1では疲労効果は+1体されず1体だけ疲労する")
}

console.log("=== B. 021【神速】：フラッシュタイミングに手札から召喚でき、白シンボルがあれば連鎖でBP3000以下の相手1体を手札に戻す ===")
{
    const s = game("b")
    put(s, "p1", BELL, 1) // 白シンボル
    const attacker = put(s, "p1", VAN, 1)
    const target = put(s, "p2", VAN, 1)
    s.players.p1.hand = [YAGO]
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "【神速】でフラッシュタイミングにヤゴイソバナを召喚できる")
    settle(s, [target.instanceId])
    assert(s.players.p1.field.spirits.some((x) => x.cardId === YAGO), "ヤゴイソバナは場に出ている")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === target.instanceId), "連鎖でBP1000の相手のスピリットが場を離れる")
    assert(s.players.p2.hand.includes(YAGO) === false && s.players.p1.hand.includes(YAGO) === false, "戻したのは相手のスピリットでヤゴイソバナではない")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("b2")
    const attacker = put(s, "p1", VAN, 1)
    const target = put(s, "p2", VAN, 1)
    s.players.p1.hand = [YAGO]
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "【神速】でフラッシュタイミングにヤゴイソバナを召喚できる")
    settle(s, [target.instanceId])
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === target.instanceId), "白シンボルが無いので連鎖は発揮せず相手のスピリットは戻らない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== C. 022 Lv1：コスト3以下の自分のスピリットが相手の効果で破壊されたとき疲労状態で残る。BP比べの破壊では残らない ===")
{
    const s = game("c")
    put(s, "p1", TOBIMARU, 1) // Lv1
    const ally = put(s, "p1", VAN, 1)
    destroySpirit(s, "p1", ally.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s, [], (p, o) => (p.includes("残") ? o.find((x) => x.includes("残")) ?? o[0] : undefined))
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === ally.instanceId), "相手の効果で破壊されたコスト1のスピリットはフィールドに残る")
    assert(ally.isRested, "残るときは疲労状態で残る")
}
{
    const s = game("c2", "p2")
    put(s, "p1", TOBIMARU, 1) // Lv1
    const ally = put(s, "p1", VAN, 1)
    const attacker = put(s, "p2", SABER, 1)
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "テラノセイバーでアタックできる")
    assert(declareBlock(s, "p1", ally.instanceId) === null, "コスト1のスピリットでブロックできる")
    passFlash(s)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === ally.instanceId), "BP比べで破壊されたときはフィールドに残れない")
}

console.log("=== D. 022 Lv2『バトル時』：相手は相手のスピリット1体を疲労させる（相手が選ぶ） ===")
{
    const s = game("d")
    const tobimaru = put(s, "p1", TOBIMARU, 3) // Lv2
    const a = put(s, "p2", VAN, 1)
    const b = put(s, "p2", VAN, 1)
    b.isRested = true // すでに疲労しているほうは選べないことを見る
    assert(act(s, "p1", { type: "attack", instanceId: tobimaru.instanceId }) === null, "トビマルでアタックできる")
    settle(s, [a.instanceId])
    assert(a.isRested, "相手が選んだ相手のスピリット1体が疲労する")
    takeLifeAndResolve(s, "p2")
}

console.log("=== E. 023『アタック時』：ボイドからコア1個を自分のリザーブか自分のスピリットに置く ===")
{
    const s = game("e")
    const shinju = put(s, "p1", SHINJU, 1)
    const ally = put(s, "p1", VAN, 1)
    const reserve = s.players.p1.reserve
    assert(act(s, "p1", { type: "attack", instanceId: shinju.instanceId }) === null, "シンジュリウスでアタックできる")
    settle(s, [ally.instanceId])
    assert(ally.cores === 2, "ボイドからのコア1個を自分のスピリットに置く（1→2）")
    assert(s.players.p1.reserve === reserve, "リザーブを選んだのでリザーブは増えない")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("e2")
    const shinju = put(s, "p1", SHINJU, 1)
    const ally = put(s, "p1", VAN, 1)
    const reserve = s.players.p1.reserve
    assert(act(s, "p1", { type: "attack", instanceId: shinju.instanceId }) === null, "シンジュリウスでアタックできる")
    // リザーブのほうを選ぶ（スピリットでない候補を探す）
    for (let i = 0; i < 10 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; candidates?: string[]; options?: string[] }
        const reserveOption = pc.kind === "option" ? pc.options?.find((x) => x.includes("リザーブ")) : undefined
        if (reserveOption !== undefined) {
            act(s, pc.pid ?? "p1", { type: "resolveChoice", option: reserveOption })
            continue
        }
        const spiritIds = s.players.p1.field.spirits.map((x) => x.instanceId)
        const toReserve = (pc.candidates ?? []).find((x) => !spiritIds.includes(x))
        const next = toReserve ?? (pc.candidates ?? [])[0]
        if (pc.kind === "target" && next !== undefined) act(s, pc.pid ?? "p1", { type: "resolveChoice", instanceId: next })
        else act(s, pc.pid ?? "p1", { type: "resolveChoice" })
    }
    assert(s.players.p1.reserve === reserve + 1, "ボイドからのコア1個を自分のリザーブに置く")
    assert(ally.cores === 1, "スピリットを選んでいないのでコアは増えない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== F. 024『召喚時』：相手のスピリット1体を疲労させる ===")
{
    const s = game("f", "p1", "main")
    const target = put(s, "p2", VAN, 1)
    s.players.p1.hand = [HAYATO]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ビャッコウ・ハヤトを召喚できる")
    settle(s, [target.instanceId])
    assert(target.isRested, "相手のスピリット1体が疲労する")
}

console.log("=== G. 026『召喚時』の「または」：疲労させるほう・コアを置くほうのどちらも選べる ===")
{
    const s = game("g", "p1", "main")
    const target = put(s, "p2", VAN, 1)
    s.players.p1.hand = [CHUHI]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "シノビ・チュウヒを召喚できる")
    settle(s, [target.instanceId], (p, o) => (p.includes("疲労") ? o.find((x) => x.includes("疲労")) ?? o[0] : o.find((x) => x.includes("疲労")) ?? o[0]))
    assert(target.isRested, "「または」で疲労させるほうを選ぶと相手のスピリット1体が疲労する")
}
{
    const s = game("g2", "p1", "main")
    const ally = put(s, "p1", VAN, 1)
    s.players.p1.hand = [CHUHI]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "シノビ・チュウヒを召喚できる")
    settle(s, [ally.instanceId], (p, o) => (p.includes("コア") || p.includes("または") ? o.find((x) => x.includes("コア")) ?? o[0] : o.find((x) => x.includes("コア")) ?? o[0]))
    assert(ally.cores === 2, "「または」でコアを置くほうを選ぶとボイドからコア1個が置かれる（1→2）")
}

console.log("=== H. 026 Lv2『アタック/ブロック時』：バトル終了時にこのスピリットは手札に戻ることができる（戻る・断る） ===")
{
    const s = game("h")
    const chuhi = put(s, "p1", CHUHI, 3) // Lv2
    assert(act(s, "p1", { type: "attack", instanceId: chuhi.instanceId }) === null, "シノビ・チュウヒでアタックできる")
    settle(s, [], (p, o) => (p.includes("戻") ? o.find((x) => x.includes("はい") || x.includes("戻")) ?? o[0] : undefined))
    takeLifeAndResolve(s, "p2")
    settle(s, [], (p, o) => (p.includes("戻") ? o.find((x) => x.includes("はい") || x.includes("戻")) ?? o[0] : undefined))
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === chuhi.instanceId), "バトル終了時にシノビ・チュウヒはフィールドを離れる")
    assert(s.players.p1.hand.includes(CHUHI), "シノビ・チュウヒは手札に戻る")
}
{
    const s = game("h2")
    const chuhi = put(s, "p1", CHUHI, 3) // Lv2
    assert(act(s, "p1", { type: "attack", instanceId: chuhi.instanceId }) === null, "シノビ・チュウヒでアタックできる")
    takeLifeAndResolve(s, "p2")
    settle(s, [], (_p, o) => o.find((x) => x === "戻らない")) // 戻るかを聞かれても断る
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === chuhi.instanceId), "断ればフィールドに残る")
    assert(!s.players.p1.hand.includes(CHUHI), "手札には戻らない")
}

console.log("=== I. 027『アタック時』：BP3000以下のスピリットすべてを疲労させる（BP3000は含まれBP4000は含まれない）。白連鎖で相手1体を手札に戻す ===")
{
    const s = game("i")
    put(s, "p1", BELL, 1) // 白シンボル
    const amaran = put(s, "p1", AMARAN, 1)
    const low = put(s, "p2", VAN, 1) // BP1000
    const edge = put(s, "p2", BELL, 1) // BP3000
    const high = put(s, "p2", SABER, 1) // BP4000
    const bounced = put(s, "p2", SABER, 1)
    assert(act(s, "p1", { type: "attack", instanceId: amaran.instanceId }) === null, "アマランサス・パイパーでアタックできる")
    settle(s, [bounced.instanceId])
    assert(low.isRested && edge.isRested, "BP1000とBP3000の相手のスピリットは疲労する")
    assert(!high.isRested, "BP4000の相手のスピリットは疲労しない")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === bounced.instanceId), "白連鎖で相手のスピリット1体が場を離れる")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("i2")
    const amaran = put(s, "p1", AMARAN, 1)
    const low = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: amaran.instanceId }) === null, "アマランサス・パイパーでアタックできる")
    settle(s, [low.instanceId])
    assert(low.isRested, "白シンボルが無くても連鎖元の疲労は発揮する")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === low.instanceId), "白シンボルが無いので連鎖の手札戻しは発揮しない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== J. 059【合体時】『合体アタック時』：リザーブのコア3個をトラッシュに置くことで回復する。ターンに1回・コアが足りなければ発揮しない ===")
{
    const s = game("j")
    const host = put(s, "p1", STIRA, 1)
    combine(s, "p1", host, SUSUKI)
    s.players.p1.reserve = 5
    s.players.p1.trashCores = 0
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットで合体アタックできる")
    settle(s, [], (p, o) => (p.includes("回復") || p.includes("コア") ? o.find((x) => x === "発動する" || x.includes("はい")) ?? o[0] : undefined))
    assert(!host.isRested, "リザーブのコア3個をトラッシュに置くことで合体スピリットは回復する")
    assert(s.players.p1.reserve === 2, "リザーブは3個減る（5→2）")
    assert(s.players.p1.trashCores === 3, "トラッシュのコアは3個増える")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("j2")
    const host = put(s, "p1", STIRA, 1)
    combine(s, "p1", host, SUSUKI)
    s.players.p1.reserve = 2 // コア3個を払えない
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットで合体アタックできる")
    settle(s, [], (p, o) => (p.includes("回復") || p.includes("コア") ? o.find((x) => x === "発動する" || x.includes("はい")) ?? o[0] : undefined))
    assert(host.isRested, "リザーブのコアが3個無いので回復しない")
    assert(s.players.p1.reserve === 2 && s.players.p1.trashCores === 0, "コアは動かない")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("j3")
    const host = put(s, "p1", STIRA, 1)
    combine(s, "p1", host, SUSUKI)
    s.players.p1.reserve = 10
    s.players.p1.trashCores = 0
    for (let i = 0; i < 2; i++) {
        assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, `${i + 1}回目の合体アタックができる`)
        settle(s, [], (p, o) => (p.includes("回復") || p.includes("コア") ? o.find((x) => x === "発動する" || x.includes("はい")) ?? o[0] : undefined))
        takeLifeAndResolve(s, "p2")
    }
    assert(host.isRested, "2回目のアタックでは回復しないので疲労したまま")
    assert(s.players.p1.trashCores === 3, "1回目でトラッシュに置いたコアは3個だけ（2回目は発揮していない）")
    assert(s.players.p1.reserve === 7, "2回目のアタックではターンに1回なのでコアを置かない")
}

console.log("=== K. 060【合体時】『自分のエンドステップ』：このスピリット（合体スピリット）は回復する ===")
{
    const s = game("k", "p1", "main")
    const host = put(s, "p1", BELL, 1) // コスト4以上のホスト
    combine(s, "p1", host, KARAKURI)
    host.isRested = true
    const other = put(s, "p1", VAN, 1)
    other.isRested = true
    endTurn(s)
    assert(!host.isRested, "自分のエンドステップに合体スピリットは回復する")
    assert(other.isRested, "合体していないスピリットは回復しない")
}

console.log("=== L. 077 メイン：このターンの間、系統：「爪鳥」を持つ自分のスピリットすべてをBP+2000する（爪鳥以外はされない） ===")
{
    const s = game("l", "p1", "main")
    const torig = put(s, "p1", KIJ, 1) // 爪鳥
    const mushi = put(s, "p1", SHINJU, 1) // 怪虫（爪鳥ではない）
    s.players.p1.hand = [WIND]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "メインでウィンドプレッシャーを使用できる")
    settle(s)
    assert(effectiveBp(s, "p1", torig) === 5000, "爪鳥のケンゴーキジはBP+2000される（3000→5000）")
    assert(effectiveBp(s, "p1", mushi) === 2000, "爪鳥以外のシンジュリウスはBP+2000されない")
}

console.log("=== M. 077 フラッシュ：相手のスピリット1体を疲労させる ===")
{
    const s = game("m")
    const attacker = put(s, "p1", VAN, 1)
    const target = put(s, "p2", VAN, 1)
    s.players.p1.hand = [WIND]
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュでウィンドプレッシャーを使用できる")
    settle(s, [target.instanceId])
    assert(target.isRested, "フラッシュ効果で相手のスピリット1体が疲労する")
    takeLifeAndResolve(s, "p2")
}

console.log("=== N. 078 フラッシュ：指定したスピリットはBPを比べ相手のスピリットだけを破壊したとき回復する。白連鎖で相手1体を手札に戻す ===")
{
    const s = game("n")
    put(s, "p1", BELL, 1) // 白シンボル
    const attacker = put(s, "p1", SABER, 1) // BP4000
    const blocker = put(s, "p2", VAN, 1) // BP1000
    const bounced = put(s, "p2", VAN, 1)
    s.players.p1.hand = [ABSORB]
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "テラノセイバーでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュでアブソーブパワーを使用できる")
    settle(s, [attacker.instanceId, bounced.instanceId])
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "BP1000のスピリットでブロックできる")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "BP比べでブロッカーだけが破壊される")
    assert(!attacker.isRested, "相手のスピリットだけを破壊したので指定したスピリットは回復する")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === bounced.instanceId), "白連鎖で相手のスピリット1体が場を離れる")
}
{
    const s = game("n2")
    const attacker = put(s, "p1", VAN, 1) // BP1000
    const blocker = put(s, "p2", VAN, 1) // BP1000（同じBPで相討ち）
    s.players.p1.hand = [ABSORB]
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュでアブソーブパワーを使用できる")
    settle(s, [attacker.instanceId])
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "同じBPのスピリットでブロックできる")
    passFlash(s)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === attacker.instanceId), "同じBPなのでアタッカーも破壊される")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "ブロッカーも破壊される")
}

console.log("すべてのチェックに合格しました 🎉（part791）")
