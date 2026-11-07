// smoke パート813（BS22 B1 分身：BS22-X03・024・069・077。BS22_PLAN §1・§2 の確定読み。カードは staging にしか無いので実装前は落ちる）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, destroySpirit, effectiveBp, getCard, cardHasColor, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const X03 = "BS22-X03" // 光牙鳳凰レックウマル（緑・コスト7・爪鳥・Lv1/2/3 コア1/3/4）
const TOMBI = "BS22-024" // ジョーニン・トンビ（緑・コスト4・爪鳥・Lv1BP4000）
const NINJA = "BS22-069" // 光牙の忍び里（緑・ネクサス・Lv1コア0/Lv2コア1）
const SHADOW = "BS22-077" // シャイニングシャドウ（緑・マジック・フラッシュ）
const MODS = "BS13-018" // モッズ（緑・コスト2・爪鳥・Lv1BP2000）
const BEETLE = "BS01-050" // ビートビートル（緑・コスト0・殻虫・Lv1BP1000）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・召喚時ドロー）山札の上に置く目印
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・BP3000・効果なし）
const QUICK = "BS20-005" // クイックサンド・ドラゴン（赤・コスト4・召喚時BP4000以下の相手のスピリット1体を破壊）
const RIBBON = "BS01-146" // ドリームリボン（白・マジック・フラッシュ：相手のスピリット1体を手札に戻す）

console.log("=== 前提: カードの機械確認（BS22 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS22.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    assert(byId(X03)?.name === "光牙鳳凰レックウマル" && byId(X03)!.type === "spirit" && byId(X03)!.cost === 7 && byId(X03)!.family.includes("爪鳥"), "X03は光牙鳳凰レックウマル（スピリット・コスト7・爪鳥）")
    assert(byId(TOMBI)?.name === "ジョーニン・トンビ" && byId(TOMBI)!.type === "spirit" && byId(TOMBI)!.cost === 4 && byId(TOMBI)!.family.includes("爪鳥"), "TOMBIはジョーニン・トンビ（スピリット・コスト4・爪鳥）")
    assert(byId(NINJA)?.name === "光牙の忍び里" && byId(NINJA)!.type === "nexus", "NINJAは光牙の忍び里（ネクサス）")
    assert(byId(SHADOW)?.name === "シャイニングシャドウ" && byId(SHADOW)!.type === "magic" && byId(SHADOW)!.cost === 2, "SHADOWはシャイニングシャドウ（マジック・コスト2）")
    assert(getCard(MODS).name === "モッズ" && getCard(MODS).family.includes("爪鳥") && getCard(MODS).levels[0]!.bp === 2000, "MODSはモッズ（爪鳥・Lv1BP2000）")
    assert(getCard(BEETLE).name === "ビートビートル" && !getCard(BEETLE).family.includes("爪鳥") && getCard(BEETLE).levels[0]!.bp === 1000, "BEETLEはビートビートル（爪鳥でない・BP1000）")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).effect.includes("召喚時"), "GRIPはグリプ・ハンズ（召喚時効果あり）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).effect === "", "VANはロクケラトプス（効果なし）")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).colors[0] === "white", "BELLはデュアルキャノン・ベル（白）")
    assert(getCard(RIBBON).name === "ドリームリボン" && getCard(RIBBON).effect.includes("手札に戻す"), "RIBBONはドリームリボン（手札に戻す）")
}

function game(seed: string, turnPlayer: PlayerId = "p1", phase: "main" | "attack" = "main"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "white" })
    s.interactiveTargets = true
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
        p.deck = Array.from({ length: 40 }, () => BEETLE)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    s.players.p1.deck[0] = GRIP // 山札の上2枚を見分ける
    s.players.p1.deck[1] = MODS
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

function isBunshin(cardId: string): boolean {
    try {
        return getCard(cardId).family.includes("分身")
    } catch {
        return true // 仮のカード定義が getCard で引けない作りでも分身として数える
    }
}

function bunshins(s: GameState, pid: PlayerId = "p1") {
    return s.players[pid].field.spirits.filter((x) => isBunshin(x.cardId))
}

// 数値の選択（枚数・コアの個数）は answers を前から使う。無い・選択肢に無いときは最後の選択肢。数値でない確認は先頭を選ぶ
function settle(s: GameState, picks: string[] = [], answers: number[] = [0]): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            if (o.length > 0 && o.every((x) => /^\d+$/.test(x))) {
                const a = answers.shift()
                const pick = a !== undefined && o.includes(String(a)) ? String(a) : o[a === undefined ? 0 : o.length - 1]!
                err = act(s, who, { type: "resolveChoice", option: pick })
            } else err = act(s, who, { type: "resolveChoice", option: o[0] ?? "" })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// X03 を手札から召喚して【分身：2】を答える
function summonX03(s: GameState, answers: number[]): void {
    s.players.p1.hand = [X03]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "X03を召喚できる")
    settle(s, [], answers)
}

// フラッシュを作る：攻撃側がアタックし、防御側が先にパスする
function startAttack(s: GameState, atk: ReturnType<typeof createInstance>): void {
    const def: PlayerId = s.turnPlayer === "p1" ? "p2" : "p1"
    assert(act(s, s.turnPlayer, { type: "attack", instanceId: atk.instanceId }) === null, "アタックできる")
    assert(act(s, def, { type: "pass" }) === null, "防御側が先にパス")
}

console.log("=== 1. X03【分身：2】召喚時：2枚を裏向きで置き、1体ずつコア1個以上で分身スピリットにする（BP3000・緑・系統分身・Lv1） ===")
{
    const s = game("x03-two")
    const deck0 = s.players.p1.deck.length
    summonX03(s, [2, 1, 2])
    const b = bunshins(s)
    assert(b.length === 2, "分身スピリットが2体場にいる")
    assert(s.players.p1.deck.length === deck0 - 2, "山札の上から2枚が使われた")
    assert(b.every((x) => effectiveBp(s, "p1", x) === 3000 && cardHasColor(getCard(x.cardId), "green")), "分身はBP3000の緑")
    assert(b.every((x) => getCard(x.cardId).family.includes("分身") && getCard(x.cardId).cost === 0), "系統は分身・コスト0")
    assert(b.map((x) => x.cores).sort().join() === "1,2", "1体ずつ選んだ個数（1個と2個）のコアが置かれた")
    assert(s.players.p1.hand.length === 0, "山札の上のグリプ・ハンズの召喚時ドローは起きない（分身は召喚ではない）")
    assert(s.players.p1.trashCards.length === 0, "元のカードはまだトラッシュに行かない")
}

console.log("=== 2. X03【分身：2】は「2枚まで」：0枚を選べば置かない／1枚だけも選べる ===")
{
    const s = game("x03-zero")
    const deck0 = s.players.p1.deck.length
    summonX03(s, [0])
    assert(bunshins(s).length === 0 && s.players.p1.deck.length === deck0, "0枚なら山札は減らず分身も出ない")
}
{
    const s = game("x03-one")
    const deck0 = s.players.p1.deck.length
    summonX03(s, [1, 3])
    assert(bunshins(s).length === 1 && s.players.p1.deck.length === deck0 - 1, "1枚なら山札の上1枚だけが分身になる")
    assert(bunshins(s)[0]!.cores === 3, "選んだ3個のコアが置かれる")
    assert(s.players.p1.deck[0] === MODS, "2枚目（モッズ）は山札の上に残る")
}
{
    const s = game("x03-shortdeck")
    s.players.p1.deck = [GRIP]
    summonX03(s, [2, 1, 1])
    assert(bunshins(s).length === 1 && s.players.p1.deck.length === 0, "山札が1枚しかなければある分（1枚）だけ")
}

console.log("=== 3. 分身が破壊される：元のカードが表向きでトラッシュへ（手札に戻らない） ===")
{
    const s = game("bunshin-destroy")
    summonX03(s, [2, 1, 1])
    const hand0 = s.players.p1.hand.length
    const b = bunshins(s)[0]!
    destroySpirit(s, "p1", b.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === b.instanceId), "分身は場からいなくなる")
    assert(s.players.p1.trashCards.length === 1 && (s.players.p1.trashCards[0] === GRIP || s.players.p1.trashCards[0] === MODS), "トラッシュには分身ではなく元のカードが置かれる")
    assert(s.players.p1.hand.length === hand0, "手札は増えない")
}

console.log("=== 4. 手札に戻る効果（ドリームリボン）でも手札に入らずトラッシュへ ===")
{
    const s = game("bunshin-bounce", "p2", "attack")
    summonX03Quiet(s)
    const b = bunshins(s)[0]!
    const bell = put(s, "p2", BELL, 1)
    s.players.p2.hand = [RIBBON]
    const hand0 = s.players.p1.hand.length
    startAttack(s, bell)
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "ドリームリボンを使用できる")
    settle(s, [b.instanceId])
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === b.instanceId), "分身は場からいなくなる")
    assert(s.players.p1.hand.length === hand0, "分身は手札に入らない")
    assert(s.players.p1.trashCards.length === 1 && (s.players.p1.trashCards[0] === GRIP || s.players.p1.trashCards[0] === MODS), "元のカードが表向きでトラッシュに置かれる")
}
// p2 のターンに入る前に p1 側で X03 を出して分身を1体作る
function summonX03Quiet(s: GameState): void {
    const turnPlayer = s.turnPlayer
    const phase = s.phase
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    summonX03(s, [1, 1])
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = phase
}

console.log("=== 5. X03 Lv2・Lv3【強化】と Lv3『アタック時』：相手のスピリット1体を疲労させる ===")
{
    const s = game("x03-lv3-attack", "p1", "attack")
    const x03 = put(s, "p1", X03, 4) // Lv3
    const v1 = put(s, "p2", VAN, 1)
    const v2 = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: x03.instanceId }) === null, "X03でアタックできる")
    settle(s, [v1.instanceId, v2.instanceId], [0])
    assert(v1.isRested && v2.isRested, "Lv3のアタック時：【強化】込みで相手のスピリット2体が疲労する")
}
{
    const s = game("x03-lv2-attack", "p1", "attack")
    const x03 = put(s, "p1", X03, 3) // Lv2：アタック時の疲労は無い
    const v1 = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: x03.instanceId }) === null, "X03でアタックできる")
    settle(s, [v1.instanceId])
    assert(!v1.isRested, "Lv2にはアタック時の疲労が無い")
}

console.log("=== 6. 077 シャイニングシャドウ：相手のスピリットを疲労させ、レックウマルがいれば【分身：2】を発揮させる ===")
{
    const s = game("shadow-with-x03", "p1", "attack")
    const x03 = put(s, "p1", X03, 1) // Lv1（【強化】なし）
    const atk = put(s, "p1", BEETLE, 1)
    const v1 = put(s, "p2", VAN, 1)
    const v2 = put(s, "p2", VAN, 1)
    s.players.p1.hand = [SHADOW]
    const deck0 = s.players.p1.deck.length
    startAttack(s, atk)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "シャイニングシャドウを使用できる")
    settle(s, [v1.instanceId, v2.instanceId], [2, 1, 1])
    assert(v1.isRested && !v2.isRested, "Lv1では【強化】がなく、相手のスピリット1体だけが疲労する")
    assert(bunshins(s).length === 2 && s.players.p1.deck.length === deck0 - 2, "X03の【分身：2】が発揮されて分身が2体出る")
    assert(s.players.p1.trashCards.includes(SHADOW), "使ったマジックはトラッシュへ")
    assert(x03.cores === 1, "X03本体のコアは変わらない")
}
{
    const s = game("shadow-decline", "p1", "attack")
    put(s, "p1", X03, 1)
    const atk = put(s, "p1", BEETLE, 1)
    const v1 = put(s, "p2", VAN, 1)
    s.players.p1.hand = [SHADOW]
    startAttack(s, atk)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "シャイニングシャドウを使用できる")
    settle(s, [v1.instanceId], [0])
    assert(v1.isRested && bunshins(s).length === 0, "分身を0枚にすれば出ない（疲労は起きている）")
}
{
    const s = game("shadow-without-x03", "p1", "attack")
    const atk = put(s, "p1", BEETLE, 1)
    const v1 = put(s, "p2", VAN, 1)
    s.players.p1.hand = [SHADOW]
    const deck0 = s.players.p1.deck.length
    startAttack(s, atk)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "シャイニングシャドウを使用できる")
    settle(s, [v1.instanceId], [2, 1, 1])
    assert(v1.isRested, "疲労は起きる")
    assert(bunshins(s).length === 0 && s.players.p1.deck.length === deck0, "レックウマルがいなければ分身は出ない")
}

console.log("=== 7. 024 Lv1･Lv2【強化】：自分の「相手への疲労効果」の体数+1（077 で2体疲労） ===")
{
    const s = game("tombi-kyoka", "p1", "attack")
    put(s, "p1", TOMBI, 1) // Lv1
    const atk = put(s, "p1", BEETLE, 1)
    const v1 = put(s, "p2", VAN, 1)
    const v2 = put(s, "p2", VAN, 1)
    s.players.p1.hand = [SHADOW]
    startAttack(s, atk)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "シャイニングシャドウを使用できる")
    settle(s, [v1.instanceId, v2.instanceId])
    assert(v1.isRested && v2.isRested, "トンビの【強化】で相手のスピリット2体が疲労する")
}

console.log("=== 8. 024 Lv1･Lv2【分身：1】『相手によるこのスピリットの破壊時』 ===")
{
    const s = game("tombi-opp")
    const tombi = put(s, "p1", TOMBI, 1)
    const reserve0 = s.players.p1.reserve
    const deck0 = s.players.p1.deck.length
    destroySpirit(s, "p1", tombi.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s, [], [1, 2])
    assert(bunshins(s).length === 1 && s.players.p1.deck.length === deck0 - 1, "相手に破壊されたら山札の上1枚が分身スピリットになる")
    assert(bunshins(s)[0]!.cores === 2 && s.players.p1.reserve === reserve0 - 2 + 1, "リザーブから選んだ2個のコアが分身に置かれる（破壊されたトンビのコア1個はリザーブへ戻る）")
    assert(s.players.p1.trashCards.includes(TOMBI), "トンビ自身はトラッシュへ")
}
{
    const s = game("tombi-decline")
    const tombi = put(s, "p1", TOMBI, 1)
    const deck0 = s.players.p1.deck.length
    destroySpirit(s, "p1", tombi.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s, [], [0])
    assert(bunshins(s).length === 0 && s.players.p1.deck.length === deck0, "0枚（置かない）を選べば分身は出ない")
}
{
    const s = game("tombi-self")
    const tombi = put(s, "p1", TOMBI, 1)
    const deck0 = s.players.p1.deck.length
    destroySpirit(s, "p1", tombi.instanceId, "destroy", { sourcePid: "p1", sourceType: "magic" })
    settle(s, [], [1, 1])
    assert(bunshins(s).length === 0 && s.players.p1.deck.length === deck0, "自分の効果による破壊では分身は出ない")
}

console.log("=== 9. 069 Lv1･Lv2『お互いのアタックステップ』：爪鳥のスピリットと分身スピリットすべてをBP+2000 ===")
{
    const s = game("ninja-bp", "p1", "attack")
    putNexus(s, "p1", NINJA, 0) // Lv1
    const mods = put(s, "p1", MODS, 1)
    const beetle = put(s, "p1", BEETLE, 1)
    s.players.p1.hand = []
    summonX03Quiet(s)
    const b = bunshins(s)[0]!
    assert(effectiveBp(s, "p1", mods) === 4000, "爪鳥のモッズはBP+2000（2000→4000）")
    assert(effectiveBp(s, "p1", b) === 5000, "分身スピリットもBP+2000（3000→5000）")
    assert(effectiveBp(s, "p1", beetle) === 1000, "爪鳥でも分身でもないビートビートルはそのまま")
}
{
    const s = game("ninja-main", "p1", "main")
    putNexus(s, "p1", NINJA, 0)
    const mods = put(s, "p1", MODS, 1)
    assert(effectiveBp(s, "p1", mods) === 2000, "アタックステップ以外（メイン）ではBP+されない")
}
{
    const s = game("ninja-opp-turn", "p2", "attack")
    putNexus(s, "p1", NINJA, 0)
    const mods = put(s, "p1", MODS, 1)
    assert(effectiveBp(s, "p1", mods) === 4000, "お互いのアタックステップ：相手のターンのアタックステップでもBP+2000")
}

console.log("=== 10. 069 Lv2：自分の分身スピリットがいる間、爪鳥のスピリットは相手のスピリット/ネクサスの効果を受けない（マジックは受ける・Lv1や分身なしでは受ける） ===")
// p2 がメインで QUICK を召喚（召喚時：BP4000以下の相手のスピリット1体を破壊）。結果としてモッズが場に残ったか
function quickVsMods(seed: string, nexusCores: number, withBunshin: boolean): boolean {
    const s = game(seed, "p2", "main")
    putNexus(s, "p1", NINJA, nexusCores)
    const mods = put(s, "p1", MODS, 1)
    if (withBunshin) summonX03Quiet(s)
    s.players.p2.hand = [QUICK]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "クイックサンド・ドラゴンを召喚できる")
    settle(s, [mods.instanceId])
    return s.players.p1.field.spirits.some((x) => x.instanceId === mods.instanceId)
}
// Lv2 の耐性は『お互いのアタックステップ』だけ（アタックステップの場面は part823）
assert(quickVsMods("ninja-guard", 1, true) === false, "Lv2＋分身ありでもメインステップでは受ける（破壊される）")
assert(quickVsMods("ninja-noBunshin", 1, false) === false, "分身がいなければ受ける（破壊される）")
assert(quickVsMods("ninja-lv1", 0, true) === false, "Lv1では耐性が無い（破壊される）")
{
    const s = game("ninja-magic", "p2", "attack")
    putNexus(s, "p1", NINJA, 1)
    const mods = put(s, "p1", MODS, 1)
    summonX03Quiet(s)
    const bell = put(s, "p2", BELL, 1)
    s.players.p2.hand = [RIBBON]
    startAttack(s, bell)
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "ドリームリボンを使用できる")
    settle(s, [mods.instanceId])
    assert(s.players.p1.hand.includes(MODS), "マジックの効果は受ける（モッズが手札に戻る）")
}

console.log("すべてのチェックに合格しました 🎉（part813）")
