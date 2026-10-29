// smoke パート673（「このスピリット」「そのスピリット」を手札／デッキの上に戻す・疲労させる効果の回帰。
// BS01-032・BS01-045・BS02-020・BS07-039・BS14-020・BS16-069・BS06-050・BS06-060・BS11-064。効果文のみから書いた期待値）
import { assert, createGame, endTurn, createInstance, currentLevel, destroySpirit, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const SHIDO = "BS02-056" // アルカナビースト・ケン（黄・コスト2・系統「四道」）
const EMPEROR = "BS02-073" // 皇帝アンプルール
const EMPRESS = "BS07-043" // 女帝ペンプレス

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        "BS01-032": "ガウルム", "BS01-045": "切り裂きヘディレス", "BS02-020": "レディ・フランケリー", "BS07-039": "マカロニペンタン",
        "BS14-020": "ナスノ・アーチャー", "BS16-069": "セブンブリッジ", "BS06-050": "雪ん子イエティ", "BS06-060": "天使長ファニム",
        "BS11-064": "闇の聖剣", "BS02-056": "アルカナビースト・ケン", "BS02-073": "皇帝アンプルール", "BS07-043": "女帝ペンプレス",
        "BS13-055": "重装合体シールド・ドラゴンMk-II", "BS01-123": "リターンドロー",
    }
    for (const [id, n] of Object.entries(names)) assert(getCard(id).name === n, `${id}は${n}`)
    assert(getCard(SHIDO).family?.includes("四道") === true, "ケンは四道")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1, rested = false) {
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

const inHand = (s: GameState, pid: PlayerId, c: string) => s.players[pid].hand.filter((x) => x === c).length
const inTrash = (s: GameState, pid: PlayerId, c: string) => s.players[pid].trashCards.filter((x) => x === c).length
const onField = (s: GameState, pid: PlayerId, id: string) => s.players[pid].field.spirits.some((x) => x.instanceId === id)

// 『このスピリットの破壊時』の「手札に戻る」: 戻る場面と戻らない場面
function returnCase(label: string, cardId: string, cores: number, level: number, returns: boolean, setup?: (s: GameState) => void) {
    const s = game(label)
    setup?.(s)
    const me = put(s, "p1", cardId, cores)
    assert(currentLevel(me).level === level, `${label}: Lv${level}`)
    const handBefore = inHand(s, "p1", cardId)
    const trashBefore = inTrash(s, "p1", cardId)
    const reserveBefore = s.players.p1.reserve
    destroySpirit(s, "p1", me.instanceId)
    assert(!onField(s, "p1", me.instanceId), `${label}: 破壊されて場を離れる`)
    if (returns) {
        assert(inHand(s, "p1", cardId) === handBefore + 1, `${label}: 自分の手札に戻る`)
        assert(inTrash(s, "p1", cardId) === trashBefore, `${label}: トラッシュには行かない`)
    } else {
        assert(inHand(s, "p1", cardId) === handBefore, `${label}: 手札には戻らない`)
        assert(inTrash(s, "p1", cardId) === trashBefore + 1, `${label}: トラッシュへ行く`)
    }
    assert(s.players.p1.reserve === reserveBefore + cores, `${label}: 乗っていたコア${cores}個はリザーブへ`)
    return s
}

console.log("=== BS01-032 ガウルム Lv2『破壊時』手札に戻る ===")
returnCase("ガウルムLv2", "BS01-032", 3, 2, true)
returnCase("ガウルムLv1(起きない)", "BS01-032", 1, 1, false)

console.log("=== BS01-045 切り裂きヘディレス Lv1･Lv2 ===")
returnCase("ヘディレスLv1", "BS01-045", 1, 1, true)
returnCase("ヘディレスLv2", "BS01-045", 2, 2, true)

console.log("=== BS02-020 レディ・フランケリー Lv3『破壊時』手札に戻す ===")
returnCase("フランケリーLv3", "BS02-020", 6, 3, true)
returnCase("フランケリーLv2(起きない)", "BS02-020", 2, 2, false)

console.log("=== BS07-039 マカロニペンタン: アンプルール／ペンプレスが自分の場にいるとき戻る ===")
returnCase("ペンタン+皇帝", "BS07-039", 1, 1, true, (s) => put(s, "p1", EMPEROR, 1))
returnCase("ペンタン+女帝", "BS07-039", 1, 1, true, (s) => put(s, "p1", EMPRESS, 1))
returnCase("ペンタン単独(起きない)", "BS07-039", 1, 1, false)
returnCase("ペンタン+相手の皇帝のみ(起きない)", "BS07-039", 1, 1, false, (s) => put(s, "p2", EMPEROR, 1))

console.log("=== BS14-020 ナスノ・アーチャー: 全Lv=疲労相手を破壊／Lv3=手札に戻る ===")
for (const [cores, lv, back] of [[5, 3, true], [3, 2, false]] as const) {
    const label = `ナスノLv${lv}`
    const s = game(label)
    const me = put(s, "p1", "BS14-020", cores)
    const tired = put(s, "p2", VANILLA, 1, true)
    const fresh = put(s, "p2", VANILLA, 1, false)
    assert(currentLevel(me).level === lv, `${label}: Lv${lv}`)
    destroySpirit(s, "p1", me.instanceId)
    assert(s.pendingChoice === null || answer(s, tired.instanceId), `${label}: 疲労状態の相手を選べる`)
    assert(!onField(s, "p2", tired.instanceId), `${label}: 疲労状態の相手スピリットが破壊される`)
    assert(onField(s, "p2", fresh.instanceId), `${label}: 回復状態の相手スピリットは破壊されない`)
    assert(inHand(s, "p1", "BS14-020") === (back ? 1 : 0), `${label}: 手札に${back ? "戻る" : "戻らない"}`)
    assert(inTrash(s, "p1", "BS14-020") === (back ? 0 : 1), `${label}: トラッシュに${back ? "行かない" : "行く"}`)
}

function answer(s: GameState, pick: string): boolean {
    const pc = s.pendingChoice
    if (!pc || !pc.candidates?.includes(pick)) return false
    return handleAction(s, pc.pid, { type: "resolveChoice", instanceId: pick }) === null
}

console.log("=== BS16-069 セブンブリッジ Lv2: 四道スピリット破壊時、デッキの上に戻すことができる ===")
{
    const s = game("bridge-accept")
    putNexus(s, "p1", "BS16-069", 2)
    const me = put(s, "p1", SHIDO, 1)
    const deckBefore = s.players.p1.deck.length
    destroySpirit(s, "p1", me.instanceId)
    assert(s.pendingChoice !== null && s.pendingChoice.pid === "p1", "戻すかどうかの確認が自分に立つ")
    const pc = s.pendingChoice
    const optYes = pc?.options?.find((o) => /発動|戻す|はい/.test(o))
    assert(optYes !== undefined, "「戻す」の選択肢がある")
    if (optYes) handleAction(s, "p1", { type: "resolveChoice", option: optYes })
    assert(s.players.p1.deck.length === deckBefore + 1 && s.players.p1.deck[0] === SHIDO, "デッキの一番上に戻る")
    assert(inTrash(s, "p1", SHIDO) === 0 && inHand(s, "p1", SHIDO) === 0, "トラッシュにも手札にもない")
}
{
    const s = game("bridge-decline")
    putNexus(s, "p1", "BS16-069", 2)
    const me = put(s, "p1", SHIDO, 1)
    destroySpirit(s, "p1", me.instanceId)
    assert(s.pendingChoice !== null, "確認が立つ（任意）")
    if (s.pendingChoice) handleAction(s, "p1", { type: "resolveChoice" })
    assert(s.pendingChoice === null, "戻さないで解決できる")
    assert(inTrash(s, "p1", SHIDO) === 1 && s.players.p1.deck[0] === VANILLA, "戻さなければトラッシュに残る")
}
console.log("=== BS16-069: 起きない場面（Lv1／四道でない／相手の四道） ===")
{
    const s = game("bridge-lv1")
    const nx = putNexus(s, "p1", "BS16-069", 0)
    assert(currentLevel(nx).level === 1, "Lv1")
    const me = put(s, "p1", SHIDO, 1)
    destroySpirit(s, "p1", me.instanceId)
    assert(s.pendingChoice === null && inTrash(s, "p1", SHIDO) === 1, "Lv1では戻せない")
}
{
    const s = game("bridge-nonshido")
    putNexus(s, "p1", "BS16-069", 2)
    const me = put(s, "p1", VANILLA, 1)
    destroySpirit(s, "p1", me.instanceId)
    assert(s.pendingChoice === null && inTrash(s, "p1", VANILLA) === 1, "四道でなければ確認も出ない")
}
{
    const s = game("bridge-opp")
    putNexus(s, "p1", "BS16-069", 2)
    const them = put(s, "p2", SHIDO, 1)
    destroySpirit(s, "p2", them.instanceId)
    assert(s.pendingChoice === null && inTrash(s, "p2", SHIDO) === 1 && s.players.p2.deck[0] === VANILLA, "相手の四道は戻せない（自分のスピリットだけ）")
}

console.log("=== BS06-050 雪ん子イエティ: 召喚時にこのスピリットが疲労 ===")
{
    const s = game("yeti-summon")
    s.players.p1.hand = ["BS06-050"]
    s.players.p2.field.spirits.push(createInstance(VANILLA, 1, 1))
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    const y = s.players.p1.field.spirits.find((x) => x.cardId === "BS06-050")
    assert(y !== undefined && y.isRested, "召喚したイエティ自身が疲労する")
    assert(s.players.p2.field.spirits.every((x) => !x.isRested), "相手のスピリットは疲労しない")
}
// caster のターンのアタックステップで caster が攻撃し、防御側がパスしたあとのフラッシュで BS01-123 を使う
function attackAndCast(s: GameState, caster: PlayerId, targetId: string, label: string) {
    const other: PlayerId = caster === "p1" ? "p2" : "p1"
    if (s.turnPlayer !== caster) endTurn(s)
    assert(handleAction(s, caster, { type: "nextPhase" }) === null, `${label}: アタックステップへ`)
    assert(handleAction(s, caster, { type: "attack", instanceId: targetId }) === null, `${label}: アタックする`)
    assert(handleAction(s, other, { type: "pass" }) === null, `${label}: 防御側がパス`)
    const r = handleAction(s, caster, { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: targetId })
    assert(r === null, `${label}: フラッシュマジックを使用できる ${JSON.stringify(r)}`)
}

console.log("=== BS06-050 Lv2: 相手のアタックステップに相手がマジックを使用したとき回復 ===")
for (const [cores, lv, recovers] of [[3, 2, true], [1, 1, false]] as const) {
    const label = `イエティLv${lv}`
    const s = game(label)
    const y = put(s, "p1", "BS06-050", cores, true)
    const theirs = put(s, "p2", VANILLA, 1)
    assert(currentLevel(y).level === lv, `${label}: Lv${lv}`)
    s.players.p2.hand = ["BS01-123"]
    attackAndCast(s, "p2", theirs.instanceId, label)
    while (s.pendingChoice) handleAction(s, s.pendingChoice.pid, { type: "resolveChoice" })
    assert(y.isRested === !recovers, `${label}: ${recovers ? "回復する" : "回復しない"}`)
}
{
    const s = game("yeti-self-magic")
    const y = put(s, "p1", "BS06-050", 3, true)
    const mine = put(s, "p1", VANILLA, 1)
    s.players.p1.hand = ["BS01-123"]
    attackAndCast(s, "p1", mine.instanceId, "イエティ自分使用")
    while (s.pendingChoice) handleAction(s, s.pendingChoice.pid, { type: "resolveChoice" })
    assert(y.isRested, "自分のアタックステップで自分がマジックを使っても回復しない")
}

console.log("=== BS06-060 天使長ファニム: 召喚時にこのスピリットが疲労 ===")
{
    const s = game("fanim-summon")
    s.players.p1.hand = ["BS06-060"]
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    const f = s.players.p1.field.spirits.find((x) => x.cardId === "BS06-060")
    assert(f !== undefined && f.isRested, "ファニム自身が疲労する")
}
console.log("=== BS06-060 Lv2･Lv3: 疲労状態の間、相手のスピリットすべては召喚されたとき疲労 ===")
for (const [label, cores, rested, who, tiredAfter] of [
    ["Lv2疲労中・相手の召喚", 2, true, "p2", true],
    ["Lv2回復中・相手の召喚(起きない)", 2, false, "p2", false],
    ["Lv1疲労中・相手の召喚(起きない)", 1, true, "p2", false],
    ["Lv2疲労中・自分の召喚(起きない)", 2, true, "p1", false],
] as const) {
    const s = game(`fanim-${label}`)
    put(s, "p1", "BS06-060", cores, rested)
    if (who === "p2") {
        s.turnPlayer = "p2"
        s.phase = "main"
    }
    s.players[who].hand = [VANILLA]
    assert(handleAction(s, who, { type: "summon", handIndex: 0 }) === null, `${label}: 召喚できる`)
    const summoned = s.players[who].field.spirits.find((x) => x.cardId === VANILLA)
    assert(summoned !== undefined && summoned.isRested === tiredAfter, `${label}: 召喚されたスピリットは${tiredAfter ? "疲労する" : "疲労しない"}`)
}

console.log("=== BS11-064 闇の聖剣 Lv2: 相手のスピリットが合体したとき、その合体スピリットは疲労 ===")
for (const [label, cores, who, tiredAfter] of [
    ["Lv2・相手が合体", 1, "p2", true],
    ["Lv1・相手が合体(起きない)", 0, "p2", false],
    ["Lv2・自分が合体(起きない)", 1, "p1", false],
] as const) {
    const s = game(`sword-${label}`)
    putNexus(s, "p1", "BS11-064", cores)
    const other: PlayerId = who === "p1" ? "p2" : "p1"
    assert(other !== who, "前提")
    const host = put(s, who, "BS06-060", 3) // コスト7（合体条件コスト4以上を満たす）
    const brave = put(s, who, "BS13-055", 1)
    s.turnPlayer = who
    s.phase = "main"
    const r = handleAction(s, who, { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    assert(r === null, `${label}: 合体できる`)
    while (s.pendingChoice) handleAction(s, s.pendingChoice.pid, { type: "resolveChoice" })
    assert(host.isRested === tiredAfter, `${label}: 合体スピリットは${tiredAfter ? "疲労する" : "疲労しない"}`)
}

console.log("すべてのチェックに合格しました 🎉（part673）")
