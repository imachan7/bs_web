// smoke パート667（破棄系16枚：誰が選ぶか・どのゾーンから・何枚・どちらの陣営か。効果文だけから書いた期待値）
import { assert, createGame, createInstance, destroyNexus, destroySpirit, endTurn, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"

const V = "BS01-002" // ロクケラトプス（バニラ）
const SPIRIT = "BS01-056" // マッチュラ（スピリット）の手札役。召喚はしない場面でのみ使う
const MAGIC_A = "BS01-138" // ハンドリバース
const MAGIC_B = "BS01-123" // リターンドロー

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        "BS10-111": "ハンドタイフーン", "BS04-X14": "魔界七将パンデミウム", "BS10-X02": "双魚賊神ピスケガレオン", "BS14-015": "トウダー",
        "BS01-138": "ハンドリバース", "BS12-053": "オオヅツナナフシ", "BS08-009": "関将龍皇ドラグロン", "BS12-072": "海賊王の秘宝島",
        "BS01-056": "マッチュラ", "BS13-064": "蛇教徒の宮殿", "BS03-095": "奇術師オリバー", "BS02-021": "髑髏騎士ズ・ガイン",
        "BS03-016": "透明人間エクリア", "BS01-099": "百識の谷", "BS03-019": "魔界軍師ヘルミア", "BS01-123": "リターンドロー",
        "BS01-002": "ロクケラトプス", "BS01-014": "ドラグノ祈祷師", "BS11-X05": "魔導双神ジェミナイズ", "BS11-003": "アクゥイラム",
    }
    for (const [id, n] of Object.entries(names)) assert(getCard(id).name === n, `${id}は${n}`)
}

function game(seed: string, interactive = true): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    for (const pid of ["p1", "p2"] as const) {
        s.players[pid].reserve = 10
        s.players[pid].deck = Array.from({ length: 40 }, () => V)
        s.players[pid].hand = []
        s.players[pid].trashCards = []
    }
    return s
}
const other = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1")
function put(s: GameState, pid: PlayerId, cardId: string, cores: number, rested = false) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const names = (ids: string[]) => ids.map((c) => getCard(c).name).sort().join("、")
const eq = (a: string[], b: string[]) => names(a) === names(b)
function ok(s: GameState, pid: PlayerId, a: GameAction, msg: string) {
    const err = handleAction(s, pid, a)
    assert(err === null, `${msg}${err === null ? "" : `（拒否: ${err}）`}`)
}

// 選択待ちが無くなるまで答える。誰に何が立ったかを記録して返す（"p2:card:hand" など）
function drain(s: GameState): string[] {
    const seen: string[] = []
    for (let i = 0; i < 40 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        seen.push(`${pc.pid}:${pc.kind}${pc.cardZone ? ":" + pc.cardZone : ""}`)
        let a: GameAction
        if (pc.kind === "card") {
            const free = (pc.cardIndices ?? []).filter((x) => !(pc.selectedCardIndices ?? []).includes(x))
            a = free[0] !== undefined ? { type: "resolveChoice", cardIndex: free[0] } : { type: "resolveChoice" }
        } else if (pc.kind === "target") a = { type: "resolveChoice", instanceId: pc.candidates[0]! }
        else a = { type: "resolveChoice", option: pc.options?.[0]! }
        if (handleAction(s, pc.pid, a) !== null) break
    }
    return seen
}
const cnt = (xs: string[], x: string) => xs.filter((y) => y === x).length

console.log("=== 1. BS10-111 ハンドタイフーン：お互い手札すべてを破棄 → その後お互い4枚ドロー ===")
{
    const s = game("p667-1")
    s.players.p1.hand = ["BS10-111", SPIRIT, MAGIC_A]
    s.players.p2.hand = [SPIRIT, SPIRIT, MAGIC_B]
    s.players.p2.reserve = 10
    ok(s, "p1", { type: "castMagic", handIndex: 0 }, "メインでハンドタイフーンを使う")
    assert(s.pendingChoice === null, "「すべて」なので選択待ちは立たない")
    assert(eq(s.players.p1.hand, [V, V, V, V]), "自分：破棄したあとに4枚引いた（引いたバニラ4枚だけが残る）")
    assert(eq(s.players.p2.hand, [V, V, V, V]), "相手：破棄したあとに4枚引いた")
    assert(eq(s.players.p1.trashCards, ["BS10-111", SPIRIT, MAGIC_A]), "自分のトラッシュ：マジック本体＋破棄した2枚")
    assert(eq(s.players.p2.trashCards, [SPIRIT, SPIRIT, MAGIC_B]), "相手のトラッシュ：手札3枚")
    assert(s.players.p1.deck.length === 36 && s.players.p2.deck.length === 36, "お互いデッキ4枚減")
}
{
    const s = game("p667-1b")
    s.players.p1.hand = ["BS10-111"]
    s.players.p2.hand = []
    ok(s, "p1", { type: "castMagic", handIndex: 0 }, "お互い手札が空でも使える")
    assert(s.players.p1.hand.length === 4 && s.players.p2.hand.length === 4, "手札が無くてもお互い4枚引く")
}

console.log("=== 2. BS01-138 ハンドリバース：自分の手札すべてを破棄 → 相手の手札1枚につき自分がドロー ===")
{
    const s = game("p667-2")
    s.players.p1.hand = [MAGIC_A, SPIRIT, SPIRIT]
    s.players.p2.hand = [MAGIC_B, MAGIC_B, SPIRIT]
    ok(s, "p1", { type: "castMagic", handIndex: 0 }, "メインでハンドリバースを使う")
    assert(s.pendingChoice === null, "選択待ちは立たない")
    assert(eq(s.players.p1.hand, [V, V, V]), "自分：手札2枚を破棄し、相手の手札3枚ぶん（3枚）を引いた")
    assert(eq(s.players.p2.hand, [MAGIC_B, MAGIC_B, SPIRIT]) && s.players.p2.trashCards.length === 0, "相手の手札は破棄されない")
    assert(eq(s.players.p1.trashCards, [MAGIC_A, SPIRIT, SPIRIT]), "自分のトラッシュ：マジック本体＋破棄した2枚")
}
{
    const s = game("p667-2b")
    s.players.p1.hand = [MAGIC_A, SPIRIT]
    s.players.p2.hand = []
    ok(s, "p1", { type: "castMagic", handIndex: 0 }, "相手の手札が0でも使える")
    assert(s.players.p1.hand.length === 0 && s.players.p1.trashCards.length === 2, "手札は破棄され、相手の手札0枚なので引かない")
}

console.log("=== 3. BS01-056 マッチュラ：相手が、相手の手札1枚を破棄する（選ぶのは相手） ===")
{
    const s = game("p667-3")
    s.players.p1.hand = [SPIRIT]
    s.players.p2.hand = [MAGIC_A, V]
    ok(s, "p1", { type: "summon", handIndex: 0 }, "マッチュラを召喚")
    const pc = s.pendingChoice
    assert(pc?.pid === "p2" && pc.kind === "card" && pc.cardZone === "hand" && pc.cardOwner === "p2", "選択待ちは相手に立ち、相手の手札から選ぶ")
    assert(handleAction(s, "p1", { type: "resolveChoice", cardIndex: 0 }) !== null, "召喚した側は代わりに答えられない")
    ok(s, "p2", { type: "resolveChoice", cardIndex: 0 }, "相手が1枚目（ハンドリバース）を選ぶ")
    assert(eq(s.players.p2.hand, [V]) && eq(s.players.p2.trashCards, [MAGIC_A]), "選んだ1枚だけが相手のトラッシュへ")
    assert(s.players.p1.hand.length === 0 && s.players.p1.trashCards.length === 0, "自分の手札・トラッシュは変わらない")
}
{
    const s = game("p667-3b")
    s.players.p1.hand = [SPIRIT]
    s.players.p2.hand = []
    ok(s, "p1", { type: "summon", handIndex: 0 }, "相手の手札が0でも召喚できる")
    assert(s.pendingChoice === null, "破棄するカードが無ければ選択待ちは立たない")
}

console.log("=== 4. BS01-099 百識の谷：Lv1 自分のドローステップ ドロー+1、ドロー後に自分が手札1枚を破棄 ===")
{
    const s = game("p667-4")
    putNexus(s, "p1", "BS01-099", 1) // Lv1
    s.players.p1.hand = [SPIRIT, MAGIC_A]
    s.players.p2.hand = [SPIRIT, MAGIC_A]
    endTurn(s) // 相手のターン：相手のドローステップでは効かない
    assert(s.turnPlayer === "p2" && s.pendingChoice === null, "相手のドローステップでは破棄の選択は立たない")
    assert(s.players.p2.hand.length === 3, "相手のドローは通常の1枚だけ")
    endTurn(s) // 自分のターン
    assert(s.turnPlayer === "p1", "自分のターンになった")
    assert(s.players.p1.hand.length === 4, "ドローは1+1の2枚")
    const pc = s.pendingChoice
    assert(pc?.pid === "p1" && pc.kind === "card" && pc.cardZone === "hand" && (pc.cardIndices ?? []).length === 4, "ドロー後に、自分が（引いたカードも含めた）手札4枚から選ぶ")
    ok(s, "p1", { type: "resolveChoice", cardIndex: 0 }, "手札1枚を選んで破棄")
    assert(s.players.p1.hand.length === 3 && s.players.p1.trashCards.length === 1, "手札1枚がトラッシュへ")
}
{
    const s = game("p667-4b")
    putNexus(s, "p1", "BS01-099", 3) // Lv2：ドロー+1のみ
    s.players.p1.hand = [SPIRIT, MAGIC_A]
    endTurn(s)
    endTurn(s)
    assert(s.players.p1.hand.length === 4 && s.pendingChoice === null && s.players.p1.trashCards.length === 0, "Lv2は2枚引くだけで破棄は無い")
}

console.log("=== 5. BS02-021 髑髏騎士ズ・ガイン：Lv3 アタック時、相手の手札1枚を内容を見ないで破棄（ランダム）。Lv1-2は手札に触れない ===")
{
    const s = game("p667-5")
    const gain = put(s, "p1", "BS02-021", 8) // Lv3
    const foe = put(s, "p2", V, 3)
    s.players.p2.hand = [V, V] // 乱数に依存しないよう同一カード
    s.players.p1.hand = [V]
    ok(s, "p1", { type: "nextPhase" }, "アタックステップへ")
    ok(s, "p1", { type: "attack", instanceId: gain.instanceId }, "ズ・ガインでアタック")
    const seen = drain(s).filter((x) => x.endsWith(":card:hand"))
    assert(seen.length === 0, "内容を見ないで破棄するので、誰にも手札の選択待ちは立たない")
    assert(s.players.p2.hand.length === 1 && s.players.p2.trashCards.length === 1, "相手の手札が1枚だけ破棄された")
    assert(s.players.p1.hand.length === 1, "自分の手札は減らない")
    assert(foe.cores === 2 && s.players.p2.reserve === 11, "相手スピリットのコア1個が相手のリザーブへ（Lv1-3共通の節）")
}
{
    const s = game("p667-5b")
    const gain = put(s, "p1", "BS02-021", 3) // Lv2
    put(s, "p2", V, 3)
    s.players.p2.hand = [V, V]
    ok(s, "p1", { type: "nextPhase" }, "アタックステップへ")
    ok(s, "p1", { type: "attack", instanceId: gain.instanceId }, "Lv2でアタック")
    drain(s)
    assert(s.players.p2.hand.length === 2 && s.players.p2.trashCards.length === 0, "Lv2では相手の手札は破棄されない")
}
{
    const s = game("p667-5c")
    const gain = put(s, "p1", "BS02-021", 8)
    put(s, "p2", V, 3)
    s.players.p2.hand = []
    ok(s, "p1", { type: "nextPhase" }, "アタックステップへ")
    ok(s, "p1", { type: "attack", instanceId: gain.instanceId }, "相手の手札0枚でもアタックできる")
    drain(s)
    assert(s.players.p2.hand.length === 0 && s.players.p2.trashCards.length === 0, "破棄するカードが無ければ何も起きない")
}

console.log("=== 6. BS03-016 透明人間エクリア：相手の手元のカードすべてを破棄し、1枚につき相手のスピリット1体を破壊（選ぶのは自分） ===")
{
    const s = game("p667-6")
    s.players.p1.hand = ["BS03-016"]
    s.players.p1.tegamoto = [V]
    s.players.p2.tegamoto = [SPIRIT, MAGIC_A]
    const foes = [put(s, "p2", V, 1), put(s, "p2", V, 1), put(s, "p2", V, 1)]
    ok(s, "p1", { type: "summon", handIndex: 0 }, "エクリアを召喚")
    const first = s.pendingChoice
    assert(first?.pid === "p1" && first.kind === "target", "破壊するスピリットを選ぶのは自分")
    drain(s)
    assert(s.players.p2.tegamoto.length === 0 && eq(s.players.p2.trashCards.slice(0, 2), [SPIRIT, MAGIC_A]), "相手の手元2枚がトラッシュへ")
    assert(s.players.p2.field.spirits.length === 1, "手元1枚につき1体＝2体が破壊され1体残る")
    assert(foes.length === 3 && s.players.p1.tegamoto.length === 1, "自分の手元は破棄されない")
}
{
    const s = game("p667-6b")
    s.players.p1.hand = ["BS03-016"]
    s.players.p1.tegamoto = [V]
    put(s, "p2", V, 1)
    ok(s, "p1", { type: "summon", handIndex: 0 }, "相手の手元が0枚でも召喚できる")
    drain(s)
    assert(s.players.p2.field.spirits.length === 1 && s.players.p1.tegamoto.length === 1, "破壊は起きず、自分の手元も破棄されない")
}

console.log("=== 7. BS03-019 魔界軍師ヘルミア：自分は手札1枚を選んで破棄（選ぶのは自分・自分の手札） ===")
{
    const s = game("p667-7")
    s.players.p1.hand = ["BS03-019", SPIRIT, MAGIC_A]
    s.players.p2.hand = [SPIRIT, SPIRIT]
    ok(s, "p1", { type: "summon", handIndex: 0 }, "ヘルミアを召喚")
    const pc = s.pendingChoice
    assert(pc?.pid === "p1" && pc.kind === "card" && pc.cardZone === "hand" && (pc.cardIndices ?? []).length === 2, "自分が自分の手札2枚から選ぶ")
    ok(s, "p1", { type: "resolveChoice", cardIndex: 1 }, "2枚目（ハンドリバース）を選ぶ")
    assert(eq(s.players.p1.hand, [SPIRIT]) && eq(s.players.p1.trashCards, [MAGIC_A]), "選んだ1枚だけが自分のトラッシュへ")
    assert(s.players.p2.hand.length === 2, "相手の手札は変わらない")
}
{
    const s = game("p667-7b")
    s.players.p1.hand = ["BS03-019"]
    ok(s, "p1", { type: "summon", handIndex: 0 }, "手札が他に無くても召喚できる")
    assert(s.pendingChoice === null && s.players.p1.trashCards.length === 0, "破棄するカードが無ければ選択待ちは立たない")
}

console.log("=== 8. BS03-095 奇術師オリバー：相手のスタートステップ、相手の手札4枚以上なら相手が3枚になるよう選んで破棄 ===")
for (const [n, expectDiscard] of [[5, 2], [4, 1], [3, 0]] as const) {
    const s = game(`p667-8-${n}`)
    put(s, "p1", "BS03-095", 1)
    s.players.p1.hand = [V, V, V, V, V, V]
    s.players.p2.hand = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? SPIRIT : MAGIC_A))
    endTurn(s)
    const seen = drain(s)
    assert(s.turnPlayer === "p2", "相手のターンになった")
    assert(cnt(seen, "p2:card:hand") >= (expectDiscard > 0 ? 1 : 0) && seen.every((x) => x.startsWith("p2:")), `手札${n}枚：選ぶのは相手だけ`)
    assert(s.players.p2.trashCards.length === expectDiscard, `手札${n}枚：${expectDiscard}枚が破棄される（3枚になるまで）`)
    assert(s.players.p2.hand.length === 3 + 1, `手札${n}枚：破棄後3枚、その後のドローで4枚`)
}
{
    const s = game("p667-8x")
    put(s, "p1", "BS03-095", 1)
    s.players.p1.hand = [V, V, V, V, V, V]
    endTurn(s)
    drain(s)
    endTurn(s)
    drain(s)
    assert(s.turnPlayer === "p1" && s.players.p1.hand.length === 7 && s.players.p1.trashCards.length === 0, "自分のスタートステップでは自分の手札は破棄されない")
}

console.log("=== 9. BS04-X14 パンデミウム：Lv3 破壊時、お互い手札5枚を破棄（各自が自分の手札から選ぶ）。Lv2は破棄なし ===")
{
    const s = game("p667-9")
    const pan = put(s, "p1", "BS04-X14", 6)
    s.players.p1.hand = Array.from({ length: 7 }, () => SPIRIT)
    s.players.p2.hand = Array.from({ length: 7 }, () => MAGIC_A)
    destroySpirit(s, "p1", pan.instanceId)
    const seen = drain(s)
    assert(cnt(seen, "p1:card:hand") >= 1 && cnt(seen, "p2:card:hand") >= 1, `お互いに手札の選択待ちが立つ（順番: ${seen.join(" ")}）`)
    assert(s.players.p1.hand.length === 2 && s.players.p2.hand.length === 2, "お互い7枚から5枚が破棄され2枚残る")
    assert(s.players.p1.trashCards.filter((c) => c === SPIRIT).length === 5 && s.players.p2.trashCards.length === 5, "各自のトラッシュへ5枚")
}
{
    const s = game("p667-9b")
    const pan = put(s, "p1", "BS04-X14", 6)
    s.players.p1.hand = [SPIRIT, SPIRIT, SPIRIT]
    s.players.p2.hand = [MAGIC_A]
    destroySpirit(s, "p1", pan.instanceId)
    drain(s)
    assert(s.players.p1.hand.length === 0 && s.players.p2.hand.length === 0, "5枚に満たなければある分だけ（すべて）破棄する")
}
{
    const s = game("p667-9c")
    const pan = put(s, "p1", "BS04-X14", 3) // Lv2
    s.players.p1.hand = Array.from({ length: 7 }, () => SPIRIT)
    s.players.p2.hand = Array.from({ length: 7 }, () => MAGIC_A)
    destroySpirit(s, "p1", pan.instanceId)
    drain(s)
    assert(s.players.p1.hand.length === 7 && s.players.p2.hand.length === 7, "Lv2の破壊では手札は破棄されない")
}

console.log("=== 10. BS08-009 ドラグロン：竜人で【転召】したとき、相手の手札すべてを見て、その中のスピリット1枚を破棄（選ぶのは自分） ===")
{
    const s = game("p667-10")
    const src = put(s, "p1", "BS01-014", 5) // ドラグノ祈祷師（竜人・コスト4）
    s.players.p1.hand = ["BS08-009"]
    s.players.p2.hand = [MAGIC_A, SPIRIT, MAGIC_B, V]
    ok(s, "p1", { type: "summon", handIndex: 0 }, "竜人のスピリットを転召元にしてドラグロンを召喚")
    let guard = 0
    while (s.pendingChoice && s.pendingChoice.pid === "p1" && s.pendingChoice.kind === "target" && guard++ < 5) {
        if (!s.pendingChoice.candidates.includes(src.instanceId)) break
        ok(s, "p1", { type: "resolveChoice", instanceId: src.instanceId }, "転召で置くコアのスピリットを選ぶ")
    }
    const pc = s.pendingChoice
    assert(pc?.pid === "p1" && pc.kind === "card" && pc.cardZone === "reveal", "自分が、公開された相手の手札から選ぶ")
    assert(pc !== null && (pc.cardIndices ?? []).length === 2, "候補はスピリットカード2枚だけ（マジックは選べない）")
    drain(s)
    assert(s.players.p2.trashCards.length === 1 && [SPIRIT, V].includes(s.players.p2.trashCards[0]!) && s.players.p2.hand.length === 3, "選んだスピリット1枚だけが相手のトラッシュへ")
}
{
    const s = game("p667-10c")
    const src = put(s, "p1", "BS01-056", 5) // 怪虫（竜人でない）・コスト3
    s.players.p1.hand = ["BS08-009"]
    s.players.p2.hand = [SPIRIT]
    ok(s, "p1", { type: "summon", handIndex: 0 }, "竜人でないスピリットで転召")
    let guard = 0
    while (s.pendingChoice && s.pendingChoice.pid === "p1" && s.pendingChoice.kind === "target" && guard++ < 5) {
        if (!s.pendingChoice.candidates.includes(src.instanceId)) break
        ok(s, "p1", { type: "resolveChoice", instanceId: src.instanceId }, "転召元を選ぶ")
    }
    drain(s)
    assert(s.players.p2.hand.length === 1 && s.players.p2.trashCards.length === 0, "竜人以外で転召したら相手の手札は破棄されない")
}

console.log("=== 11. BS10-X02 ピスケガレオン：Lv2 破壊時、光導/星魂の自分のスピリット1体につき、お互いが手札1枚を破棄 ===")
for (const [lvCores, withMatch, label] of [[3, true, "Lv2・光導/星魂が2体"], [1, true, "Lv1"], [3, false, "Lv2・該当スピリット無し"]] as const) {
    const s = game(`p667-11-${label}`)
    const pisce = put(s, "p1", "BS10-X02", lvCores)
    if (withMatch) { put(s, "p1", "BS11-X05", 1); put(s, "p1", "BS11-003", 1) }
    put(s, "p1", V, 1) // 該当しない系統
    s.players.p1.hand = [SPIRIT, SPIRIT, SPIRIT, SPIRIT, SPIRIT]
    s.players.p2.hand = [MAGIC_A, MAGIC_A, MAGIC_A, MAGIC_A, MAGIC_A]
    destroySpirit(s, "p1", pisce.instanceId)
    const seen = drain(s)
    const d1 = s.players.p1.trashCards.filter((c) => c === SPIRIT).length
    const d2 = s.players.p2.trashCards.length
    assert(d1 === d2, `${label}：お互い同じ枚数を破棄する（自分${d1}・相手${d2}）`)
    if (lvCores === 1) assert(d1 === 0, `${label}：破棄は起きない`)
    else if (withMatch) assert(d1 === 2 || d1 === 3, `${label}：光導/星魂の他2体ぶん（自身を数えるかは要裁定。実測${d1}）`)
    else assert(d1 <= 1, `${label}：他に該当なし（自身を数えても最大1。実測${d1}）`)
    if (d1 > 0) assert(seen.includes("p1:card:hand") && seen.includes("p2:card:hand"), `${label}：各自が自分の手札から選ぶ`)
}

console.log("=== 12. BS12-053 オオヅツナナフシ：手札すべて(最低1枚)を破棄できる → そうしたとき相手の手札と同じ枚数ドロー ===")
{
    const s = game("p667-12")
    s.players.p1.hand = ["BS12-053", SPIRIT, MAGIC_A]
    s.players.p2.hand = [V, V, V, V, V]
    ok(s, "p1", { type: "summon", handIndex: 0 }, "ナナフシを召喚")
    const pc = s.pendingChoice
    assert(pc?.pid === "p1" && pc.kind === "option" && pc.confirm === true, "「〜できる」なので自分に発動確認が出る")
    ok(s, "p1", { type: "resolveChoice", option: pc?.options?.[0]! }, "破棄する")
    drain(s)
    assert(eq(s.players.p1.trashCards, [SPIRIT, MAGIC_A]), "手札2枚すべて（選ばずに）破棄")
    assert(s.players.p1.hand.length === 5, "自分の破棄枚数でなく、相手の手札と同じ5枚を引いた")
    assert(s.players.p2.hand.length === 5 && s.players.p2.trashCards.length === 0, "相手の手札は破棄されない")
}
{
    const s = game("p667-12b")
    s.players.p1.hand = ["BS12-053", SPIRIT, MAGIC_A]
    s.players.p2.hand = [V, V, V]
    ok(s, "p1", { type: "summon", handIndex: 0 }, "ナナフシを召喚")
    ok(s, "p1", { type: "resolveChoice" }, "破棄しないを選ぶ")
    drain(s)
    assert(s.players.p1.hand.length === 2 && s.players.p1.trashCards.length === 0 && s.players.p1.deck.length === 40, "断れば破棄もドローも起きない")
}
{
    const s = game("p667-12c")
    s.players.p1.hand = ["BS12-053"]
    s.players.p2.hand = [V, V, V]
    ok(s, "p1", { type: "summon", handIndex: 0 }, "手札がブレイヴだけでも召喚できる")
    assert(s.pendingChoice === null && s.players.p1.hand.length === 0 && s.players.p1.deck.length === 40, "最低1枚以上＝手札0枚なら確認も出ず、引きもしない")
}

console.log("=== 14. BS13-064 蛇教徒の宮殿：Lv2 相手のアタックでライフが減ったとき、シンボル1つにつき相手が手札1枚を破棄 ===")
function snakeAttack(seed: string, nexusCores: number, block: boolean): GameState {
    const s = game(seed)
    putNexus(s, "p1", "BS13-064", nexusCores)
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.phase = "main"
    const atk = put(s, "p2", V, 1)
    s.players.p2.hand = [SPIRIT, MAGIC_A, MAGIC_B]
    if (block) put(s, "p1", V, 1)
    ok(s, "p2", { type: "nextPhase" }, "相手がアタックステップへ")
    ok(s, "p2", { type: "attack", instanceId: atk.instanceId }, "相手がアタック")
    for (let i = 0; i < 6 && s.isFlashTiming && s.battle; i++) handleAction(s, s.priorityPlayer, { type: "pass" })
    if (block) ok(s, "p1", { type: "block", instanceId: s.players.p1.field.spirits[0]!.instanceId }, "ブロックする")
    for (let i = 0; i < 6 && s.isFlashTiming && s.battle; i++) handleAction(s, s.priorityPlayer, { type: "pass" })
    if (!block) ok(s, "p1", { type: "takeLife" }, "ライフで受ける")
    return s
}
{
    const s = snakeAttack("p667-14", 1, false) // Lv2
    const pc = s.pendingChoice
    assert(pc?.pid === "p2" && pc.kind === "card" && pc.cardZone === "hand", "手札を選んで破棄するのはアタックした相手")
    drain(s)
    assert(s.players.p1.life === 4, "自分のライフが1減った")
    assert(s.players.p2.hand.length === 2 && s.players.p2.trashCards.length === 1, "シンボル1つ＝相手の手札1枚が破棄された")
}
{
    const s = snakeAttack("p667-14b", 0, false) // Lv1
    drain(s)
    assert(s.players.p2.hand.length === 3 && s.players.p2.trashCards.length === 0, "Lv1では破棄は起きない")
}
{
    const s = snakeAttack("p667-14c", 1, true)
    drain(s)
    assert(s.players.p1.life === 5 && s.players.p2.hand.length === 3, "ブロックされてライフが減らなければ破棄は起きない")
}

console.log("=== 15. BS14-015 トウダー：Lv2 破壊時、自分のバースト1つを破棄することで疲労状態の相手のスピリット1体を破壊 ===")
{
    const s = game("p667-15")
    const toda = put(s, "p1", "BS14-015", 3)
    s.players.p1.burst = MAGIC_A
    s.players.p1.burstSet = true
    const tired = put(s, "p2", V, 1, true)
    const fresh = put(s, "p2", V, 1, false)
    destroySpirit(s, "p1", toda.instanceId)
    const seen = drain(s)
    assert(seen.every((x) => x.startsWith("p1:")), "選ぶのは自分（トウダーの持ち主）だけ")
    assert(s.players.p1.burst === null && s.players.p1.trashCards.includes(MAGIC_A), "自分のバーストが破棄された")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === tired.instanceId), "疲労状態の相手スピリットが破壊された")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === fresh.instanceId), "回復状態のスピリットは破壊されない")
}
{
    const s = game("p667-15b")
    const toda = put(s, "p1", "BS14-015", 3)
    s.players.p1.burst = MAGIC_A
    s.players.p1.burstSet = true
    const fresh = put(s, "p2", V, 1, false)
    destroySpirit(s, "p1", toda.instanceId)
    drain(s)
    assert(s.players.p1.burst === MAGIC_A && s.players.p2.field.spirits.some((x) => x.instanceId === fresh.instanceId), "疲労状態の相手がいなければ、バーストも破棄されない（「ことで」は両方できるときだけ）")
}
{
    const s = game("p667-15c")
    const toda = put(s, "p1", "BS14-015", 3)
    const tired = put(s, "p2", V, 1, true)
    destroySpirit(s, "p1", toda.instanceId)
    drain(s)
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === tired.instanceId), "バーストが無ければ破壊されない")
}
{
    const s = game("p667-15d")
    const toda = put(s, "p1", "BS14-015", 1) // Lv1
    s.players.p1.burst = MAGIC_A
    s.players.p1.burstSet = true
    const tired = put(s, "p2", V, 1, true)
    destroySpirit(s, "p1", toda.instanceId)
    drain(s)
    assert(s.players.p1.burst === MAGIC_A && s.players.p2.field.spirits.some((x) => x.instanceId === tired.instanceId), "Lv1では何も起きない")
}

// BS16-X04 ミブロック・ブレイヴァー：【合体時】相手の手札が増えたとき相手のバースト1つを破棄。
// 合体状態の組み立てが場面テストの範囲を超えるため、この part では扱わない（報告に記載）。

console.log("すべてのチェックに合格しました 🎉（part667）")
