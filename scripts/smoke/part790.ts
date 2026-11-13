// smoke パート790（BS20-011〜016・018・057・058・068・075・076：破壊時ドロー・召喚時ドローと連鎖・相手効果破壊で疲労状態で残る・ブロック時のコア除去・トラッシュ回収・合体スピリット破壊・コア除去と指定アタックの連鎖・【強化】の境目・合体時コア除去・ネクサスのBP+とアタック誘発・マジックのメイン/フラッシュ）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, effectiveBp, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const PECKER = "BS20-011" // スモッグペッカー（紫・コスト2）破壊時：1枚ドロー
const TOPS = "BS20-012" // ボーン・トプス（紫・コスト3）召喚時：1枚ドロー／連鎖[赤]：相手のネクサス1つを破壊
const NAGAN = "BS20-013" // 闇楯の守護者ナーガン（紫・コスト3）コスト3以下は相手の効果破壊で疲労状態で残れる／Lv2ブロック時：コアを1個だけに
const FRAU = "BS20-014" // 冥導師フラウロー（紫・コスト4）Lv2アタック時：トラッシュの【連鎖】持ちスピリットカード1枚を手札に
const HEDLESS = "BS20-015" // ナイト・ヘディレス（紫・コスト4）Lv2アタック時：疲労状態の相手の合体スピリット1体を破壊／連鎖[赤]：1枚ドロー
const WYVERN = "BS20-016" // ワイボーン（紫・コスト5）アタック時：相手のコア1個をリザーブに／連鎖[赤]：相手スピリット1体を指定してアタック
const ANACON = "BS20-018" // 翼蛇アナコンガー（紫・コスト7）【強化】／Lv2アタック時：相手のコア1個をリザーブに
const SNEAK = "BS20-057" // スネイカース（紫・ブレイヴ・コスト4・合体条件コスト4以上）合体時合体アタック時：相手のコア1個をリザーブに
const SKULL = "BS20-058" // スカルプレイン（紫・ブレイヴ・コスト5・合体条件コスト5以上）合体時アタック時：コアを1個だけに／連鎖[赤]：指定してアタック
const FALL = "BS20-068" // 腐食する大瀑布（紫・ネクサス・コスト3）紫スピリットBP+1000／Lv2相手アタックステップ：BP6000以下のアタック時に相手はコア1個をトラッシュに
const SPIRAL = "BS20-075" // スパイラルヴェイン（紫・マジック・コスト3）メイン：コスト4以上の色を無しに／連鎖[赤]：ネクサス1つ破壊／フラッシュ：BP+2000
const DEATH = "BS20-076" // デスアカンパニー（紫・マジック・コスト4）メイン：相手によって破壊されたとき相手のコア2個をリザーブに／フラッシュ：BP+3000

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・バニラ）赤シンボル兼コア除去の対象
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・BP3000・効果なし）コスト4以上の合体条件のホスト
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・BP3000・効果なし）コスト5以上の合体条件のホスト
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・Lv1BP6000/Lv2BP8000・効果なし）ブロッカー
const SPEARS = "BS01-104" // 千本槍の古戦場（ネクサス）連鎖[赤]の破壊対象

console.log("=== 前提: カードの機械確認（BS20 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS20.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; levels: { cores: number }[]; effect: string }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    const cores = (id: string) => byId(id)?.levels.map((l) => l.cores).join("/")
    assert(byId(PECKER)?.name === "スモッグペッカー" && byId(PECKER)!.type === "spirit" && byId(PECKER)!.cost === 2 && cores(PECKER) === "1/3", "PECKERはスモッグペッカー（スピリット・コスト2・Lvコア1/3）")
    assert(byId(TOPS)?.name === "ボーン・トプス" && byId(TOPS)!.type === "spirit" && byId(TOPS)!.cost === 3 && cores(TOPS) === "1/3", "TOPSはボーン・トプス（スピリット・コスト3・Lvコア1/3）")
    assert(byId(NAGAN)?.name === "闇楯の守護者ナーガン" && byId(NAGAN)!.type === "spirit" && byId(NAGAN)!.cost === 3 && cores(NAGAN) === "1/3/5", "NAGANは闇楯の守護者ナーガン（スピリット・コスト3・Lvコア1/3/5）")
    assert(byId(FRAU)?.name === "冥導師フラウロー" && byId(FRAU)!.type === "spirit" && byId(FRAU)!.cost === 4 && cores(FRAU) === "1/2/4", "FRAUは冥導師フラウロー（スピリット・コスト4・Lvコア1/2/4）")
    assert(byId(HEDLESS)?.name === "ナイト・ヘディレス" && byId(HEDLESS)!.type === "spirit" && byId(HEDLESS)!.cost === 4 && cores(HEDLESS) === "1/3", "HEDLESSはナイト・ヘディレス（スピリット・コスト4・Lvコア1/3）")
    assert(byId(WYVERN)?.name === "ワイボーン" && byId(WYVERN)!.type === "spirit" && byId(WYVERN)!.cost === 5 && cores(WYVERN) === "1/2/4", "WYVERNはワイボーン（スピリット・コスト5・Lvコア1/2/4）")
    assert(byId(ANACON)?.name === "翼蛇アナコンガー" && byId(ANACON)!.type === "spirit" && byId(ANACON)!.cost === 7 && cores(ANACON) === "1/2", "ANACONは翼蛇アナコンガー（スピリット・コスト7・Lvコア1/2）")
    assert(byId(SNEAK)?.name === "スネイカース" && byId(SNEAK)!.type === "brave" && byId(SNEAK)!.cost === 4, "SNEAKはスネイカース（ブレイヴ・コスト4）")
    assert(byId(SKULL)?.name === "スカルプレイン" && byId(SKULL)!.type === "brave" && byId(SKULL)!.cost === 5, "SKULLはスカルプレイン（ブレイヴ・コスト5）")
    assert(byId(FALL)?.name === "腐食する大瀑布" && byId(FALL)!.type === "nexus" && byId(FALL)!.cost === 3 && cores(FALL) === "0/2", "FALLは腐食する大瀑布（ネクサス・コスト3・Lvコア0/2）")
    assert(byId(SPIRAL)?.name === "スパイラルヴェイン" && byId(SPIRAL)!.type === "magic" && byId(SPIRAL)!.cost === 3, "SPIRALはスパイラルヴェイン（マジック・コスト3）")
    assert(byId(DEATH)?.name === "デスアカンパニー" && byId(DEATH)!.type === "magic" && byId(DEATH)!.cost === 4, "DEATHはデスアカンパニー（マジック・コスト4）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1 && getCard(VAN).effect === "", "VANはロクケラトプス（赤・コスト1・効果なし）")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).cost === 4 && getCard(BELL).effect === "", "BELLはデュアルキャノン・ベル（白・コスト4・効果なし）")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).cost === 5 && getCard(STIRA).effect === "", "STIRAはスティラホーン（赤・コスト5・効果なし）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).cost === 6 && getCard(TARAN).effect === "" && getCard(TARAN).levels[1]!.bp === 8000, "TARANはタランドーズ（緑・コスト6・効果なし・Lv2BP8000）")
    assert(getCard(SPEARS).name === "千本槍の古戦場" && getCard(SPEARS).type === "nexus", "SPEARSは千本槍の古戦場（ネクサス）")
}

function game(seed: string, phase: "main" | "attack" = "attack", turnPlayer: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = phase
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

// ブレイヴをホストに合体させた盤面を作る（合体条件を満たすホストを選ぶこと）
function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): ReturnType<typeof createInstance> {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

type OptionPick = (prompt: string, options: string[]) => string | undefined

// pendingChoice を答える（target は picks に入っていればそれを選ぶ。option は optionPick に従う）
function settle(s: GameState, picks: string[] = [], optionPick?: OptionPick): string[] {
    const prompts: string[] = []
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; prompt: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        prompts.push(pc.prompt)
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = optionPick ? optionPick(pc.prompt, o) : o.includes("発動する") ? "発動する" : o[0] ?? ""
            err = pick !== undefined ? act(s, who, { type: "resolveChoice", option: pick }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
    return prompts
}

// 「疲労状態でフィールドに残ることができる」の確認で「残る」側を選ぶ
const acceptRemain: OptionPick = (_p, o) => o.find((x) => x.includes("残")) ?? o.find((x) => x.includes("発動")) ?? o[0]
// 「残る」を断る側を選ぶ
const declineRemain: OptionPick = (_p, o) => {
    // 復活の確認は「復活させる」1択の任意確認なので、断る＝選択肢を選ばずに答える
    const stay = o.find((x) => x.includes("残") || x.includes("復活"))
    return stay !== undefined ? o.find((x) => x !== stay) : o[0]
}

// フラッシュタイミングを連続パスで閉じる
function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

// ブロックされずライフを減らすまで進める（アタック宣言の直後のフラッシュは防御側が先にパスする）
function noBlockFinish(s: GameState, attacker: PlayerId, defender: PlayerId): void {
    assert(act(s, defender, { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, attacker, { type: "pass" }) === null, "攻撃側もパスする")
    takeLifeAndResolve(s, defender)
}

// BPを比べて blocker 側が勝つバトルを進める
function battleLose(s: GameState, attacker: ReturnType<typeof createInstance>, blocker: ReturnType<typeof createInstance>, attackerPid: PlayerId, blockerPid: PlayerId): void {
    assert(act(s, attackerPid, { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(act(s, blockerPid, { type: "pass" }) === null, "防御側パス")
    assert(act(s, attackerPid, { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, blockerPid, blocker.instanceId) === null, "ブロック宣言")
    assert(act(s, blockerPid, { type: "pass" }) === null, "ブロック後のフラッシュ：防御側パス")
    assert(act(s, attackerPid, { type: "pass" }) === null, "ブロック後のフラッシュ：攻撃側パス")
}

console.log("=== 1. 011 スモッグペッカー：破壊時（効果による破壊）に1枚ドローする ===")
{
    const s = game("pecker-effect")
    const pecker = put(s, "p1", PECKER, 1)
    destroySpirit(s, "p1", pecker.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s)
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === VAN, "破壊されたのでデッキから1枚ドローする")
}

console.log("=== 2. 011：BPを比べで破壊されても破壊時ドローは起きる ===")
{
    const s = game("pecker-battle")
    const pecker = put(s, "p1", PECKER, 1) // BP2000
    const blocker = put(s, "p2", TARAN, 1) // BP6000
    battleLose(s, pecker, blocker, "p1", "p2")
    settle(s)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === pecker.instanceId), "ペッカーはBP比べで破壊される")
    assert(s.players.p1.hand.length === 1, "破壊時ドローが起きる")
}

console.log("=== 3. 012 ボーン・トプス：召喚時に1枚ドロー。赤シンボルがあれば連鎖[赤]で相手のネクサス1つを破壊する ===")
{
    const s = game("tops-chain", "main")
    put(s, "p1", VAN, 1) // 赤シンボル
    putNexus(s, "p2", SPEARS, 1)
    s.players.p1.hand = [TOPS]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ボーン・トプスを召喚できる")
    settle(s)
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === VAN, "召喚時にデッキから1枚ドローする")
    assert(s.players.p2.field.nexuses.length === 0, "連鎖[赤]で相手のネクサス1つを破壊する")
}

console.log("=== 4. 012：赤シンボルが無ければ連鎖は発揮せず、ドローだけする ===")
{
    const s = game("tops-nochain", "main")
    putNexus(s, "p2", SPEARS, 1)
    s.players.p1.hand = [TOPS]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ボーン・トプスを召喚できる")
    settle(s)
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === VAN, "召喚時ドローはする")
    assert(s.players.p2.field.nexuses.length === 1, "赤シンボルが無いのでネクサスは破壊されない")
}

console.log("=== 5. 013 ナーガン：コスト3以下の自分のスピリットが相手の効果で破壊されたとき、疲労状態でフィールドに残る（残るを選ぶ） ===")
{
    const s = game("nagan-remain")
    put(s, "p1", NAGAN, 1) // Lv1
    const tops = put(s, "p1", TOPS, 2) // コスト3
    const reserve = s.players.p1.reserve
    destroySpirit(s, "p1", tops.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s, [], acceptRemain)
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === tops.instanceId), "コスト3以下なのでフィールドに残ることができる")
    assert(tops.isRested, "疲労状態で残る")
    assert(tops.cores === 2 && s.players.p1.reserve === reserve, "コアは動かずリザーブも増えない")
}

console.log("=== 6. 013：残ることを断れば通常どおり破壊される ===")
{
    const s = game("nagan-decline")
    put(s, "p1", NAGAN, 1)
    const tops = put(s, "p1", TOPS, 2)
    const reserve = s.players.p1.reserve
    destroySpirit(s, "p1", tops.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s, [], declineRemain)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === tops.instanceId), "断れば破壊される")
    assert(s.players.p1.reserve === reserve + 2, "コア2個はリザーブへ戻る")
}

console.log("=== 7. 013：BPを比べの破壊では「相手の効果で破壊されたとき」ではないので残れない（残るを選んでも破壊される） ===")
{
    const s = game("nagan-bp", "attack", "p2")
    put(s, "p1", NAGAN, 1)
    const tops = put(s, "p1", TOPS, 2) // BP2000
    const taran = put(s, "p2", TARAN, 1) // BP6000
    battleLose(s, taran, tops, "p2", "p1")
    settle(s, [], acceptRemain)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === tops.instanceId), "BP比べの破壊では効果が効かず破壊される")
}

console.log("=== 8. 013：コスト4以上の自分のスピリットは対象外（残るを選んでも破壊される） ===")
{
    const s = game("nagan-cost4")
    put(s, "p1", NAGAN, 1)
    const frau = put(s, "p1", FRAU, 1) // コスト4
    destroySpirit(s, "p1", frau.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s, [], acceptRemain)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === frau.instanceId), "コスト4なので通常どおり破壊される")
}

console.log("=== 9. 013 Lv2：ブロック時、相手のスピリット1体のコアを1個だけになるように相手のリザーブに置く ===")
{
    const s = game("nagan-block", "attack", "p2")
    const nagan = put(s, "p1", NAGAN, 3) // Lv2
    const van = put(s, "p2", VAN, 3)
    const reserve = s.players.p2.reserve
    assert(act(s, "p2", { type: "attack", instanceId: van.instanceId }) === null, "アタック宣言")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, "p1", nagan.instanceId) === null, "ナーガンでブロックする")
    settle(s)
    assert(van.cores === 1, "アタッカーのコアは1個だけになる")
    assert(s.players.p2.reserve === reserve + 2, "余ったコア2個は相手のリザーブに置かれる")
    passFlash(s)
    settle(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "BP比べでアタッカーは破壊される")
}

console.log("=== 10. 013 Lv1：ブロック時のコア除去は起きない ===")
{
    const s = game("nagan-lv1-block", "attack", "p2")
    const nagan = put(s, "p1", NAGAN, 1) // Lv1
    const van = put(s, "p2", VAN, 3)
    const reserve = s.players.p2.reserve
    assert(act(s, "p2", { type: "attack", instanceId: van.instanceId }) === null, "アタック宣言")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, "p1", nagan.instanceId) === null, "ナーガンでブロックする")
    settle(s)
    assert(van.cores === 3 && s.players.p2.reserve === reserve, "Lv1なのでコアは動かない")
    passFlash(s)
    settle(s)
}

console.log("=== 11. 014 フラウロー：Lv2アタック時、トラッシュの【連鎖】を持つスピリットカード1枚を手札に戻す ===")
{
    const s = game("frau-lv2")
    const frau = put(s, "p1", FRAU, 2) // Lv2
    s.players.p1.trashCards = [TOPS]
    assert(act(s, "p1", { type: "attack", instanceId: frau.instanceId }) === null, "フラウローでアタックできる")
    settle(s)
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === TOPS, "トラッシュの【連鎖】持ちスピリットカード1枚を手札に戻す")
    assert(s.players.p1.trashCards.length === 0, "トラッシュからは離れる")
    noBlockFinish(s, "p1", "p2")
}

console.log("=== 12. 014：Lv1のアタックでは戻さない ===")
{
    const s = game("frau-lv1")
    const frau = put(s, "p1", FRAU, 1) // Lv1
    s.players.p1.trashCards = [TOPS]
    assert(act(s, "p1", { type: "attack", instanceId: frau.instanceId }) === null, "フラウローでアタックできる")
    settle(s)
    assert(s.players.p1.hand.length === 0 && s.players.p1.trashCards.length === 1, "Lv1なのでトラッシュのカードは戻らない")
    noBlockFinish(s, "p1", "p2")
}

console.log("=== 13. 014：【連鎖】を持たないスピリットカードは戻らない ===")
{
    const s = game("frau-nochain")
    const frau = put(s, "p1", FRAU, 2) // Lv2
    s.players.p1.trashCards = [VAN]
    assert(act(s, "p1", { type: "attack", instanceId: frau.instanceId }) === null, "フラウローでアタックできる")
    settle(s)
    assert(s.players.p1.hand.length === 0 && s.players.p1.trashCards.length === 1 && s.players.p1.trashCards[0] === VAN, "【連鎖】を持たないカードは戻らない")
    noBlockFinish(s, "p1", "p2")
}

console.log("=== 14. 015 ナイト・ヘディレス：Lv2アタック時、疲労状態の相手の合体スピリット1体を破壊。連鎖[赤]で1枚ドロー ===")
{
    const s = game("hedless-main")
    const hedless = put(s, "p1", HEDLESS, 3) // Lv2
    put(s, "p1", VAN, 1) // 赤シンボル
    const host = put(s, "p2", BELL, 1)
    combine(s, "p2", host, SNEAK)
    host.isRested = true // 疲労状態の合体スピリット
    assert(act(s, "p1", { type: "attack", instanceId: hedless.instanceId }) === null, "ヘディレスでアタックできる")
    settle(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === host.instanceId), "疲労状態の合体スピリットは破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.cardId === SNEAK), "ブレイヴはスピリット状態で場に残る")
    assert(s.players.p1.hand.length === 1, "連鎖[赤]でデッキから1枚ドローする")
    noBlockFinish(s, "p1", "p2")
}

console.log("=== 15. 015：Lv1（赤シンボルあり）では合体スピリットを破壊せず、連鎖も発揮しない ===")
{
    const s = game("hedless-lv1")
    const hedless = put(s, "p1", HEDLESS, 1) // Lv1
    put(s, "p1", VAN, 1) // 赤シンボル
    const host = put(s, "p2", BELL, 1)
    combine(s, "p2", host, SNEAK)
    host.isRested = true
    assert(act(s, "p1", { type: "attack", instanceId: hedless.instanceId }) === null, "ヘディレスでアタックできる")
    settle(s)
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === host.instanceId), "Lv1なので合体スピリットは破壊されない")
    assert(s.players.p1.hand.length === 0, "連鎖元が発揮されないので連鎖のドローもしない")
    noBlockFinish(s, "p1", "p2")
}

console.log("=== 16. 015：Lv2でも疲労状態の合体スピリットがいなければ連鎖元は不発だが、連鎖[赤]は発揮してドローする ===")
{
    const s = game("hedless-notarget")
    const hedless = put(s, "p1", HEDLESS, 3) // Lv2
    put(s, "p1", VAN, 1) // 赤シンボル
    const host = put(s, "p2", BELL, 1)
    combine(s, "p2", host, SNEAK)
    host.isRested = false // 疲労状態ではない合体スピリット
    assert(act(s, "p1", { type: "attack", instanceId: hedless.instanceId }) === null, "ヘディレスでアタックできる")
    settle(s)
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === host.instanceId), "疲労状態でないので破壊されない")
    assert(s.players.p1.hand.length === 1, "連鎖元が不発でもタイミングが来ていれば連鎖は発揮する")
    noBlockFinish(s, "p1", "p2")
}

console.log("=== 17. 015：赤シンボルが無ければ合体スピリットを破壊するがドローしない ===")
{
    const s = game("hedless-nored")
    const hedless = put(s, "p1", HEDLESS, 3) // Lv2
    const host = put(s, "p2", BELL, 1)
    combine(s, "p2", host, SNEAK)
    host.isRested = true
    assert(act(s, "p1", { type: "attack", instanceId: hedless.instanceId }) === null, "ヘディレスでアタックできる")
    settle(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === host.instanceId), "疲労状態の合体スピリットは破壊される")
    assert(s.players.p1.hand.length === 0, "赤シンボルが無いので連鎖のドローはしない")
    noBlockFinish(s, "p1", "p2")
}

console.log("=== 18. 016 ワイボーン：アタック時に相手のコア1個をリザーブへ。連鎖[赤]で相手スピリット1体を指定してアタックできる ===")
{
    const s = game("wyvern-chain")
    const wyvern = put(s, "p1", WYVERN, 1) // Lv1
    put(s, "p1", VAN, 1) // 赤シンボル
    const opp = put(s, "p2", VAN, 3)
    const reserve = s.players.p2.reserve
    // 指定アタック（アタック宣言で相手を指定する。BS20_PLAN。#534）
    assert(act(s, "p1", { type: "attack", instanceId: wyvern.instanceId, targetSpiritInstanceId: opp.instanceId }) === null, "連鎖[赤]で相手スピリットを指定してアタックできる")
    settle(s)
    assert(opp.cores === 2 && s.players.p2.reserve === reserve + 1, "アタック時に相手のコア1個を相手のリザーブに置く")
    // アタック時効果の解決が終わった時点で、フラッシュを挟まず指定先のブロックが確定する（TIMING_CHART §1.10）
    assert(s.battle?.blockerInstanceId === opp.instanceId, "指定したスピリットがブロックする")
    passFlash(s)
    settle(s)
    assert(s.players.p2.life === 5, "ライフは減らない")
}

console.log("=== 19. 016：赤シンボルが無ければ指定は出ず、コア除去だけ起きる ===")
{
    const s = game("wyvern-nored")
    const wyvern = put(s, "p1", WYVERN, 1)
    const opp = put(s, "p2", VAN, 3)
    const reserve = s.players.p2.reserve
    assert(act(s, "p1", { type: "attack", instanceId: wyvern.instanceId, targetSpiritInstanceId: opp.instanceId }) !== null, "赤シンボルが無いので指定アタックはできない")
    assert(act(s, "p1", { type: "attack", instanceId: wyvern.instanceId }) === null, "ワイボーンでアタックできる")
    settle(s)
    assert(opp.cores === 2 && s.players.p2.reserve === reserve + 1, "コア除去は起きる")
    noBlockFinish(s, "p1", "p2")
    assert(s.players.p2.life === 4, "ライフは減る")
}

console.log("=== 20. 018 アナコンガー：Lv2アタック時のコア除去は【強化】で+1され、2個になる ===")
{
    const s = game("anacon-lv2")
    const anacon = put(s, "p1", ANACON, 2) // Lv2
    const opp = put(s, "p2", VAN, 3)
    const reserve = s.players.p2.reserve
    assert(act(s, "p1", { type: "attack", instanceId: anacon.instanceId }) === null, "アナコンガーでアタックできる")
    settle(s)
    assert(opp.cores === 1 && s.players.p2.reserve === reserve + 2, "【強化】でコア2個を相手のリザーブに置く")
    noBlockFinish(s, "p1", "p2")
}

console.log("=== 21. 018：Lv1のアタックではコア除去は起きない ===")
{
    const s = game("anacon-lv1")
    const anacon = put(s, "p1", ANACON, 1) // Lv1
    const opp = put(s, "p2", VAN, 3)
    const reserve = s.players.p2.reserve
    assert(act(s, "p1", { type: "attack", instanceId: anacon.instanceId }) === null, "アナコンガーでアタックできる")
    settle(s)
    assert(opp.cores === 3 && s.players.p2.reserve === reserve, "Lv2の効果なのでLv1では起きない")
    noBlockFinish(s, "p1", "p2")
}

console.log("=== 22. 018：【強化】は他の自分のコア除去にも効く（ワイボーンの除去が2個になる） ===")
{
    const s = game("anacon-boost")
    put(s, "p1", ANACON, 1) // 【強化】はLv1から有効
    const wyvern = put(s, "p1", WYVERN, 1)
    const opp = put(s, "p2", VAN, 3)
    const reserve = s.players.p2.reserve
    assert(act(s, "p1", { type: "attack", instanceId: wyvern.instanceId }) === null, "ワイボーンでアタックできる")
    settle(s)
    assert(opp.cores === 1 && s.players.p2.reserve === reserve + 2, "ワイボーンの「コア1個」が【強化】で2個になる")
    noBlockFinish(s, "p1", "p2")
}

console.log("=== 23. 018：【強化】は「1個だけになるように」には効かない（Q761。ナーガンのブロック時は2個動くだけ） ===")
{
    const s = game("anacon-setone", "attack", "p2")
    put(s, "p1", ANACON, 1) // 【強化】
    const nagan = put(s, "p1", NAGAN, 3) // Lv2
    const van = put(s, "p2", VAN, 3)
    const reserve = s.players.p2.reserve
    assert(act(s, "p2", { type: "attack", instanceId: van.instanceId }) === null, "アタック宣言")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, "p1", nagan.instanceId) === null, "ナーガンでブロックする")
    settle(s)
    assert(van.cores === 1 && s.players.p2.reserve === reserve + 2, "「1個だけになるように」は【強化】で増えない（3個動かない）")
    passFlash(s)
    settle(s)
}

console.log("=== 24. 057 スネイカース：合体時の合体アタック時、相手のコア1個を相手のリザーブに置く ===")
{
    const s = game("sneak-combined")
    const host = put(s, "p1", BELL, 1) // コスト4以上
    combine(s, "p1", host, SNEAK)
    const opp = put(s, "p2", VAN, 3)
    const reserve = s.players.p2.reserve
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
    settle(s)
    assert(opp.cores === 2 && s.players.p2.reserve === reserve + 1, "合体アタック時に相手のコア1個をリザーブに置く")
    noBlockFinish(s, "p1", "p2")
}

console.log("=== 25. 057：スピリット状態のスネイカースのアタックではコア除去は起きない ===")
{
    const s = game("sneak-spirit")
    const sneak = put(s, "p1", SNEAK, 1) // スピリット状態
    const opp = put(s, "p2", VAN, 3)
    const reserve = s.players.p2.reserve
    assert(act(s, "p1", { type: "attack", instanceId: sneak.instanceId }) === null, "スピリット状態のスネイカースでアタックできる")
    settle(s)
    assert(opp.cores === 3 && s.players.p2.reserve === reserve, "【合体時】の効果なのでスピリット状態では起きない")
    noBlockFinish(s, "p1", "p2")
}

console.log("=== 26. 058 スカルプレイン：合体時のアタック時、相手スピリット1体のコアを1個だけに。連鎖[赤]で相手スピリット1体を指定してアタック ===")
{
    const s = game("skull-chain")
    const host = put(s, "p1", STIRA, 1) // コスト5以上
    combine(s, "p1", host, SKULL)
    put(s, "p1", VAN, 1) // 赤シンボル
    const opp = put(s, "p2", VAN, 3)
    const reserve = s.players.p2.reserve
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId, targetSpiritInstanceId: opp.instanceId }) === null, "連鎖[赤]で相手スピリットを指定してアタックできる")
    settle(s)
    assert(opp.cores === 1 && s.players.p2.reserve === reserve + 2, "相手スピリット1体のコアを1個だけになるようにリザーブに置く")
    // アタック時効果の解決が終わった時点で、フラッシュを挟まず指定先のブロックが確定する（TIMING_CHART §1.10）
    assert(s.battle?.blockerInstanceId === opp.instanceId, "指定したスピリットがブロックする")
    passFlash(s)
    settle(s)
    assert(s.players.p2.life === 5, "ライフは減らない")
}

console.log("=== 27. 058：赤シンボルが無ければ指定は出ない ===")
{
    const s = game("skull-nored")
    const host = put(s, "p1", TARAN, 1) // 緑・コスト6（赤シンボルを持たないホスト）
    combine(s, "p1", host, SKULL)
    const opp = put(s, "p2", VAN, 3)
    const reserve = s.players.p2.reserve
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId, targetSpiritInstanceId: opp.instanceId }) !== null, "赤シンボルが無いので指定アタックはできない")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
    settle(s)
    assert(opp.cores === 1 && s.players.p2.reserve === reserve + 2, "コアを1個だけにする効果は起きる")
    noBlockFinish(s, "p1", "p2")
}

console.log("=== 28. 068 腐食する大瀑布：Lv1から自分の紫のスピリットすべてをBP+1000（紫以外は対象外） ===")
{
    const s = game("fall-bp")
    putNexus(s, "p1", FALL, 1) // Lv1
    const pecker = put(s, "p1", PECKER, 1) // 紫・Lv1BP2000
    const van = put(s, "p1", VAN, 1) // 赤・BP1000
    assert(effectiveBp(s, "p1", pecker) === 3000, "紫のスピリットはBP+1000される")
    assert(effectiveBp(s, "p1", van) === 1000, "紫以外のスピリットはBP+1000されない")
}

console.log("=== 29. 068 Lv2：相手のアタックステップでBP6000以下のスピリットがアタックしたとき、相手は自分のスピリットのコア1個をトラッシュに置く ===")
{
    const s = game("fall-lv2", "attack", "p2")
    putNexus(s, "p1", FALL, 2) // Lv2
    const attacker = put(s, "p2", VAN, 2) // BP1000
    const other = put(s, "p2", TARAN, 2)
    const trashCores = s.players.p2.trashCores
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "BP6000以下のスピリットでアタックする")
    settle(s, [other.instanceId]) // 「相手は、〜」なので相手（p2）が置くスピリットを選ぶ
    assert(other.cores === 1 && s.players.p2.trashCores === trashCores + 1, "相手は自分のスピリットのコア1個を相手のトラッシュに置く")
    noBlockFinish(s, "p2", "p1")
}

console.log("=== 30. 068：Lv1ではアタックの誘発は起きない ===")
{
    const s = game("fall-lv1", "attack", "p2")
    putNexus(s, "p1", FALL, 1) // Lv1
    const attacker = put(s, "p2", VAN, 2)
    const other = put(s, "p2", TARAN, 2)
    const trashCores = s.players.p2.trashCores
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタックする")
    settle(s, [other.instanceId])
    assert(other.cores === 2 && s.players.p2.trashCores === trashCores, "Lv2の効果なのでLv1では起きない")
    noBlockFinish(s, "p2", "p1")
}

console.log("=== 31. 068：BP6000を超えるスピリットのアタックでは起きない ===")
{
    const s = game("fall-overbp", "attack", "p2")
    putNexus(s, "p1", FALL, 2) // Lv2
    const attacker = put(s, "p2", TARAN, 3) // Lv2BP8000
    const other = put(s, "p2", VAN, 2)
    const trashCores = s.players.p2.trashCores
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "BP8000のスピリットでアタックする")
    settle(s, [other.instanceId])
    assert(other.cores === 2 && s.players.p2.trashCores === trashCores, "BP6000以下ではないので起きない")
    noBlockFinish(s, "p2", "p1")
}

console.log("=== 32. 075 スパイラルヴェイン メイン：このターンの間、コスト4以上の自分のスピリットすべての色を無いものとして扱う（068のBP+1000が外れる） ===")
{
    const s = game("spiral-main", "main")
    putNexus(s, "p1", FALL, 1) // Lv1：紫のスピリットをBP+1000
    const frau = put(s, "p1", FRAU, 1) // 紫・コスト4・Lv1BP3000
    const tops = put(s, "p1", TOPS, 1) // 紫・コスト3・Lv1BP2000
    assert(effectiveBp(s, "p1", frau) === 4000 && effectiveBp(s, "p1", tops) === 3000, "使用前は紫なのでどちらもBP+1000されている")
    s.players.p1.hand = [SPIRAL]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "スパイラルヴェインをメインで使用できる")
    settle(s)
    assert(effectiveBp(s, "p1", frau) === 3000, "コスト4以上のスピリットの色は無いものとして扱われ、BP+1000されない")
    assert(effectiveBp(s, "p1", tops) === 3000, "コスト3のスピリットは色が無くならないのでBP+1000のまま")
}

console.log("=== 33. 075 連鎖[赤]：赤シンボルがあれば相手のネクサス1つを破壊する ===")
{
    const s = game("spiral-chain", "main")
    put(s, "p1", VAN, 1) // 赤シンボル
    putNexus(s, "p2", SPEARS, 1)
    s.players.p1.hand = [SPIRAL]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "スパイラルヴェインをメインで使用できる")
    settle(s)
    assert(s.players.p2.field.nexuses.length === 0, "連鎖[赤]で相手のネクサス1つを破壊する")
}

console.log("=== 34. 075：赤シンボルが無ければ連鎖は発揮しない ===")
{
    const s = game("spiral-nored", "main")
    putNexus(s, "p2", SPEARS, 1)
    s.players.p1.hand = [SPIRAL]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "スパイラルヴェインをメインで使用できる")
    settle(s)
    assert(s.players.p2.field.nexuses.length === 1, "赤シンボルが無いのでネクサスは破壊されない")
}

console.log("=== 35. 075 フラッシュ：このターンの間、スピリット1体をBP+2000する ===")
{
    const s = game("spiral-flash")
    const pecker = put(s, "p1", PECKER, 1) // BP2000
    assert(act(s, "p1", { type: "attack", instanceId: pecker.instanceId }) === null, "ペッカーでアタックする")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    s.players.p1.hand = [SPIRAL]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: pecker.instanceId }) === null, "フラッシュでスパイラルヴェインを使用できる")
    settle(s, [pecker.instanceId])
    assert(effectiveBp(s, "p1", pecker) === 4000, "フラッシュの効果でこのターンの間BP+2000される")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 36. 076 デスアカンパニー メイン：このターン、自分のスピリットが相手によって（効果で）破壊されたとき、相手のスピリットのコア2個を相手のリザーブに置く ===")
{
    const s = game("death-effect", "main")
    s.players.p1.hand = [DEATH]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "デスアカンパニーをメインで使用できる")
    settle(s)
    s.phase = "attack"
    const mine = put(s, "p1", VAN, 1)
    const opp = put(s, "p2", VAN, 4)
    const reserve = s.players.p2.reserve
    destroySpirit(s, "p1", mine.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s)
    assert(opp.cores === 2 && s.players.p2.reserve === reserve + 2, "相手の効果で破壊されたので相手のスピリットのコア2個を相手のリザーブに置く")
}

console.log("=== 37. 076：自分の効果で破壊されたときは起きない ===")
{
    const s = game("death-own", "main")
    s.players.p1.hand = [DEATH]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "デスアカンパニーをメインで使用できる")
    settle(s)
    s.phase = "attack"
    const mine = put(s, "p1", VAN, 1)
    const opp = put(s, "p2", VAN, 4)
    const reserve = s.players.p2.reserve
    destroySpirit(s, "p1", mine.instanceId, "destroy", { sourcePid: "p1", sourceType: "spirit" })
    settle(s)
    assert(opp.cores === 4 && s.players.p2.reserve === reserve, "相手によって破壊されたときではないので起きない")
}

console.log("=== 38. 076：BPを比べで破壊されても「相手によって破壊されたとき」なので起きる ===")
{
    const s = game("death-battle", "main")
    s.players.p1.hand = [DEATH]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "デスアカンパニーをメインで使用できる")
    settle(s)
    s.phase = "attack"
    const mine = put(s, "p1", VAN, 1) // BP1000
    const blocker = put(s, "p2", TARAN, 1) // BP6000
    const opp = put(s, "p2", VAN, 4)
    const reserve = s.players.p2.reserve
    battleLose(s, mine, blocker, "p1", "p2")
    settle(s, [opp.instanceId])
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === mine.instanceId), "アタッカーはBP比べで破壊される")
    assert(opp.cores === 2 && s.players.p2.reserve === reserve + 2, "BP比べの破壊でも相手のスピリットのコア2個を相手のリザーブに置く")
}

console.log("=== 39. 076 フラッシュ：このターンの間、スピリット1体をBP+3000する ===")
{
    const s = game("death-flash")
    const pecker = put(s, "p1", PECKER, 1) // BP2000
    assert(act(s, "p1", { type: "attack", instanceId: pecker.instanceId }) === null, "ペッカーでアタックする")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    s.players.p1.hand = [DEATH]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: pecker.instanceId }) === null, "フラッシュでデスアカンパニーを使用できる")
    settle(s, [pecker.instanceId])
    assert(effectiveBp(s, "p1", pecker) === 5000, "フラッシュの効果でこのターンの間BP+3000される")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    takeLifeAndResolve(s, "p2")
}

console.log("すべてのチェックに合格しました 🎉（part790）")
