// smoke パート1062（#709：マジック使用時の誘発は、コストを払った時点で決め、効果の解決後に処理する）
// 対象：BS11-X05 魔導双神ジェミナイズ Lv2（ownMagicUsed）／BS04-045 氷の女神フリッグ（opponentMagicUsed）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
    act,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { decideMagicUsedTriggers, runMagicUsedTriggers } from "../../server/src/logic/magic/usedTriggers"

const GEMINI = "BS11-X05" // 魔導双神ジェミナイズ（Lv2＝コア2）
const FRIGG = "BS04-045" // 氷の女神フリッグ（opponentMagicUsed。Lv2＝コア3）
const ZODIAC = "BS13-074" // ゾディアックコンダクト（デッキ上4枚から光導のスピリットを召喚）
const COFFIN = "BS01-131" // ダークコフィン（疲労スピリット1体を破壊）
const WEAKNESS = "BS03-125" // ウィークネス（スピリット1体のコアを1個だけ残して取り除く）
const SWIFT = "BS14-099" // 武迅衝（スピリット1体にボイドからコア1個）
const GATHER = "BS01-136" // ギャザーフォース（ジェミナイズが無償使用する手札のマジック）
const MIND = "BS02-093" // マインドコントロール（コスト4）
const FOREST = "BS17-070" // 密林の秘境都市（Lv2・アタックステップ・自分のターン・ターンに1回：ownMagicUsed でドロー）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [
        [GEMINI, "魔導双神ジェミナイズ"], [FRIGG, "氷の女神フリッグ"], [ZODIAC, "ゾディアックコンダクト"], [COFFIN, "ダークコフィン"],
        [WEAKNESS, "ウィークネス"], [SWIFT, "武迅衝"], [GATHER, "ギャザーフォース"], [MIND, "マインドコントロール"],
    ]
    for (const [id, name] of names) assert(getCard(id).name === name, `${id}は${name}`)
    assert(getCard(MIND).cost === 4, "マインドコントロールはコスト4")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 12
    s.players.p2.reserve = 12
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = []
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// ジェミナイズが発動すると、手札のギャザーフォースが無償で使用されてトラッシュへ行く
const geminiFired = (s: GameState): boolean => !s.players.p1.hand.includes(GATHER)

function cast(s: GameState, magic: string, targetInstanceId?: string): void {
    s.players.p1.hand = [magic, GATHER]
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, ...(targetInstanceId !== undefined ? { targetInstanceId } : {}) })
    assert(err === null, `${getCard(magic).name}を使用できる（${err}）`)
}

console.log("=== 1. 解決中に Lv2 で召喚されたジェミナイズは、そのマジックに反応しない（#709 の再現） ===")
{
    // コア数を選ぶ（Lv2 で出す）のは対話モードの選択なので、ここだけ interactiveTargets を立てる
    const s = game("c1")
    s.interactiveTargets = true
    s.players.p1.deck = [GEMINI, ...Array.from({ length: 39 }, () => VANILLA)]
    cast(s, ZODIAC)
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, "ジェミナイズを選ぶ")
    assert(act(s, "p1", { type: "resolveChoice", option: "コア2個（Lv2）" }) === null, "コア2個（Lv2）で召喚する")
    const g = s.players.p1.field.spirits.find((x) => x.cardId === GEMINI)
    assert(g !== undefined && g.cores === 2, "ジェミナイズが Lv2 で召喚された")
    assert(s.pendingChoice === null, "ジェミナイズの発動確認が出ない")
    assert(!geminiFired(s), "解決中に出たジェミナイズは発動しない")
}

console.log("=== 2. 最初から場にいる Lv2 のジェミナイズは発動する（対照） ===")
{
    const s = game("c2")
    put(s, "p1", GEMINI, 2)
    cast(s, ZODIAC)
    assert(geminiFired(s), "使用時に場にいた Lv2 のジェミナイズは発動する")
    assert(s.events.some((e) => e.type === "effect" && e.cardName === "魔導双神ジェミナイズ"), "効果の通知（effect イベント）が出る")
}

console.log("=== 3. 使用時に場にいたジェミナイズが、解決中に場を離れたら発動しない ===")
{
    const s = game("c3")
    const g = put(s, "p1", GEMINI, 2)
    g.isRested = true
    cast(s, COFFIN)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === g.instanceId), "ジェミナイズは破壊された")
    assert(!geminiFired(s), "場を離れたジェミナイズは発動しない")
}

console.log("=== 4. 使用時 Lv2 が、解決中に Lv1 に下がったら発動しない ===")
{
    const s = game("c4")
    const g = put(s, "p1", GEMINI, 2)
    cast(s, WEAKNESS)
    assert(g.cores === 1, "ジェミナイズのコアが1個になった")
    assert(!geminiFired(s), "Lv1 に下がったジェミナイズは発動しない")
}

console.log("=== 5. 使用時 Lv1 が、解決中に Lv2 に上がっても発動しない ===")
{
    const s = game("c5")
    const g = put(s, "p1", GEMINI, 1)
    cast(s, SWIFT)
    assert(g.cores === 2, "ジェミナイズのコアが2個になった（Lv2）")
    assert(!geminiFired(s), "決めた時点で Lv1 だったジェミナイズは発動しない")
}

console.log("=== 6. 相手側（opponentMagicUsed）：解決中に出たフリッグ・Lv が上がったフリッグは反応しない ===")
{
    // 相手のスピリットを出す・Lv を上げる効果を持つマジックが無いので、決める→場を変える→処理する、を直接呼ぶ
    const base = (): GameState => {
        const s = game("c6")
        s.phase = "attack"
        return s
    }
    const run = (prep: (s: GameState) => void, change: (s: GameState) => void, magic = MIND): number => {
        const s = base()
        prep(s)
        const before = s.players.p1.reserve
        const decision = decideMagicUsedTriggers(s, "p1", getCard(magic), "flash", true)
        change(s)
        runMagicUsedTriggers(s, "p1", getCard(magic), decision)
        return before - s.players.p1.reserve
    }
    assert(run((s) => put(s, "p2", FRIGG, 3), () => {}) === 4, "対照：最初から場にいる Lv2 のフリッグは反応する（コア4個をトラッシュへ）")
    assert(run(() => {}, (s) => { put(s, "p2", FRIGG, 3) }) === 0, "解決中に場に出たフリッグは反応しない")
    // コスト3の効果は Lv2 のみ（コスト4の効果は Lv1 から）。ギャザーフォースはコスト3
    const lvUp = (s: GameState): void => { s.players.p2.field.spirits[0]!.cores = 3; refreshLevelAsOverrides(s) }
    assert(run((s) => put(s, "p2", FRIGG, 3), () => {}, GATHER) === 3, "対照：Lv2 のフリッグはコスト3で反応する")
    assert(run((s) => put(s, "p2", FRIGG, 1), lvUp, GATHER) === 0, "決めた時点で Lv1 だったフリッグは Lv2 になっても反応しない")
    assert(run((s) => put(s, "p2", FRIGG, 3), (s) => { s.players.p2.field.spirits.length = 0 }) === 0, "場を離れたフリッグは反応しない")
}

console.log("=== 7. 決めたあとに場を離れて発揮しなかった誘発は、「ターンに1回」の枠を使わない ===")
{
    assert(getCard(FOREST).name === "密林の秘境都市", "FORESTは密林の秘境都市")
    const s = game("c7")
    s.phase = "attack"
    const forest = createInstance(FOREST, s.turn, 2)
    s.players.p1.field.nexuses.push(forest)
    refreshLevelAsOverrides(s)
    const hand0 = s.players.p1.hand.length
    const once = (): void => {
        const d = decideMagicUsedTriggers(s, "p1", getCard(GATHER), "main", true)
        if (!s.players.p1.field.nexuses.includes(forest)) s.players.p1.field.nexuses.push(forest)
        runMagicUsedTriggers(s, "p1", getCard(GATHER), d)
    }
    const d1 = decideMagicUsedTriggers(s, "p1", getCard(GATHER), "main", true)
    s.players.p1.field.nexuses.length = 0
    runMagicUsedTriggers(s, "p1", getCard(GATHER), d1)
    assert(s.players.p1.hand.length === hand0, "決めたあと場を離れたネクサスは発揮しない")
    s.players.p1.field.nexuses.push(forest)
    refreshLevelAsOverrides(s)
    once()
    assert(s.players.p1.hand.length === hand0 + 1, "次のマジックでは、枠が残っているのでまた反応できる")
    once()
    assert(s.players.p1.hand.length === hand0 + 1, "同じターンの3回目は、ターンに1回なので反応しない")
}

console.log("すべてのチェックに合格しました 🎉（part1062）")
