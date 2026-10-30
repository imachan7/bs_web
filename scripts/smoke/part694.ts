// smoke パート694（デッキの破棄の問い合わせ。2026-10-30 ユーザー確認の4規則）
// 規則1「〜することで」のコストも効果の一部／規則2「相手の効果で」が無い制限は誰の効果・コストも止める／
// 規則3「相手の〜の効果では」は種類が挙がっていなければ止めない／規則4「ターンにN枚まで」は合計で数える
import { act, assert, createGame, createInstance, getCard, giveBp, refreshLevelAsOverrides, answerPayConfirm } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const DISC = "BS06-108" // ディスコンティニュー（黄マジック。フラッシュ：このターン自分のデッキは破棄されない）
const ORGAN = "BS14-085" // 賛美するパイプオルガン（黄ネクサス。お互い、メインステップでデッキは破棄されない）
const VENUS = "BS13-040" // 金星神龍ヴィーナ・フェーザー（Lv2･Lv3 破壊時：デッキを上から3枚破棄することで疲労状態で戻る）
const SWAN = "BS13-026" // キグナ・スワンMk-II（お互いのデッキは、スピリット/ブレイヴ/ネクサス/マジックの効果ではターンに3枚までしか破棄されない）
const SANCT = "BS04-082" // 侵されざる聖域（Lv2 自分のデッキは相手のスピリット/ネクサス/マジックの効果ではターンに5枚までしか破棄されない）
const COFFIN = "BS01-131" // ダークコフィン（紫メイン：疲労状態のスピリット1体を破壊）
const FLAME = "BS01-121" // フレイムダンス（赤フラッシュ：BP4000以下のスピリット1体を破壊）
const HAMMER = "BS03-144" // マジックハンマー（青メイン：相手のデッキを上から5枚破棄）
const RETICLE = "BS11-059" // レチクル・アームズ（ブレイヴ。召喚時：相手のデッキを上から3枚破棄）
const VAN = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [[DISC, "ディスコンティニュー"], [ORGAN, "賛美するパイプオルガン"], [VENUS, "金星神龍ヴィーナ・フェーザー"],
        [SWAN, "キグナ・スワンMk-II"], [SANCT, "侵されざる聖域"], [COFFIN, "ダークコフィン"],
        [FLAME, "フレイムダンス"], [HAMMER, "マジックハンマー"], [RETICLE, "レチクル・アームズ"], [VAN, "ロクケラトプス"]]
    for (const [id, n] of names) assert(getCard(id).name === n, `${id}は${n}`)
}

function game(seed: string, turnPlayer: PlayerId, p1Hand: string[] = [], p2Hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = "main"
    s.interactiveTargets = false
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.hand = [...(pid === "p1" ? p1Hand : p2Hand)]
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number, kind: "spirits" | "nexuses" = "spirits") {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field[kind].push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function flash(s: GameState, pid: PlayerId): void {
    s.isFlashTiming = true
    s.priorityPlayer = pid
}

// pid が手札の idx 枚目のフラッシュ・マジックをこのターンのうちに使い、メインの優先権を turnPlayer に戻す
function flashCast(s: GameState, pid: PlayerId, idx: number, targetInstanceId?: string): string | null {
    flash(s, pid)
    const err = act(s, pid, targetInstanceId === undefined ? { type: "castMagic", handIndex: idx, timing: "flash" } : { type: "castMagic", handIndex: idx, timing: "flash", targetInstanceId })
    s.isFlashTiming = false
    s.priorityPlayer = s.turnPlayer
    return err
}

console.log("=== A. 規則2: ディスコンティニューは自分の効果・コストによる破棄も止める ===")
// フラッシュを手番外で使う場面は組めないので、手番は p1。相手の効果で破棄される場面は組めなかった
for (const disc of [true, false]) {
    const s = game(`a2-${disc}`, "p1", [DISC, COFFIN])
    const v = put(s, "p1", VENUS, 2) // 自分のコフィンで自分のヴィーナ・フェーザーを破壊し、破壊時のコスト（デッキ3枚）を払う
    v.isRested = true
    if (disc) { const e = flashCast(s, "p1", 0); assert(e === null, `A2: ディスコンティニューを使える（${e}）`) }
    const e2 = act(s, "p1", { type: "castMagic", handIndex: disc ? 0 : 1, timing: "main", targetInstanceId: v.instanceId })
    assert(e2 === null, `A2: コフィンを使える（${e2}）`)
    answerPayConfirm(s, "p1")
    const back = s.players.p1.field.spirits.some(x => x.instanceId === v.instanceId)
    assert(back === !disc, disc ? "A2: 自分の効果のコストでも払えないので戻らない" : "A2対照: 払えれば疲労状態で戻る")
    assert(s.players.p1.deck.length === (disc ? 40 : 37), `A2: デッキの枚数（${s.players.p1.deck.length}）`)
}

console.log("=== B. 規則1・2: パイプオルガンの下、メインステップでは「デッキを破棄することで」のコストが払えない ===")
for (const [label, organ, phase] of [["メイン・オルガンあり", true, "main"], ["メイン・オルガンなし", false, "main"], ["アタック・オルガンあり", true, "attack"]] as const) {
    const s = game(`b-${label}`, "p1", phase === "main" ? [COFFIN] : [FLAME])
    const v = put(s, "p1", VENUS, 2)
    if (organ) put(s, "p1", ORGAN, 0, "nexuses")
    let err: string | null
    if (phase === "main") {
        v.isRested = true
        err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: v.instanceId })
    } else {
        s.phase = "attack"
        const atk = put(s, "p1", VAN, 1)
        assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "B: アタックできる")
        for (let i = 0; i < 3 && s.priorityPlayer !== "p1"; i++) act(s, s.priorityPlayer, { type: "pass" })
        giveBp(s, v, -3000) // Lv2 の BP6000 を、フレイムダンスの上限4000以下に下げる
        err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: v.instanceId })
    }
    assert(err === null, `B(${label}): 破壊マジックを使える（${err}）`)
    answerPayConfirm(s, "p1")
    const back = s.players.p1.field.spirits.some(x => x.instanceId === v.instanceId)
    const blocked = organ && phase === "main"
    assert(back === !blocked, blocked ? "B: メインステップではコストが払えず戻らない" : `B対照(${label}): コストを払って戻る`)
    assert(s.players.p1.deck.length === (blocked ? 40 : 37), `B(${label}): デッキの枚数（${s.players.p1.deck.length}）`)
}

// C（ヴィーナ・ルシファーの「マジックが出るまで破棄」）は組めない: 発揮のきっかけが『合体アタック時』でアタックステップにしか起きず、
// 「メインステップのデッキの破棄の禁止」とぶつかる場面が作れない。

console.log("=== D. 規則1・4: スワンの下、自分のコストによる破棄も合計で3枚まで ===")
for (const swan of [true, false]) {
    const s = game(`d-${swan}`, "p2", [], [COFFIN, COFFIN])
    if (swan) put(s, "p1", SWAN, 1)
    const v1 = put(s, "p1", VENUS, 2)
    const v2 = put(s, "p1", VENUS, 2)
    v1.isRested = true
    v2.isRested = true
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: v1.instanceId }) === null, "D: 1回目のコフィン")
    answerPayConfirm(s, "p1")
    assert(s.players.p1.field.spirits.some(x => x.instanceId === v1.instanceId), "D: 1回目は3枚払って戻る")
    assert(s.players.p1.deck.length === 37, `D: 1回目で3枚破棄（${s.players.p1.deck.length}）`)
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: v2.instanceId }) === null, "D: 2回目のコフィン")
    answerPayConfirm(s, "p1")
    const back2 = s.players.p1.field.spirits.some(x => x.instanceId === v2.instanceId)
    assert(back2 === !swan, swan ? "D: 2回目は合計3枚を超えるので払えず戻らない" : "D対照: スワンが無ければ2回目も払って戻る")
    assert(s.players.p1.deck.length === (swan ? 37 : 34), `D: 2回目のあとの枚数（${s.players.p1.deck.length}）`)
}

console.log("=== E. 規則3・4: 侵されざる聖域 Lv2 は相手のマジックによる破棄を5枚で止める。ブレイヴ自身の効果は止めず数えない ===")
{
    const hammerTwice = (sanctCores: number) => {
        const s = game(`e1-${sanctCores}`, "p2", [], [HAMMER, HAMMER])
        put(s, "p1", SANCT, sanctCores, "nexuses")
        assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "E1: 1枚目のハンマー")
        const after1 = s.players.p1.deck.length
        assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "E1: 2枚目のハンマー")
        return [after1, s.players.p1.deck.length]
    }
    const lv2 = hammerTwice(2)
    assert(lv2[0] === 35 && lv2[1] === 35, `E1: Lv2 は5枚で上限。2枚目は破棄されない（${lv2}）`)
    const lv1 = hammerTwice(0)
    assert(lv1[0] === 35 && lv1[1] === 30, `E1対照: Lv1 は制限が無く10枚破棄される（${lv1}）`)
}
// エターナルシールド（E3）はフラッシュを手番外で使えず、相手の手番の破棄に重ねる場面が組めなかったので書いていない
{
    // 規則3: 聖域は「スピリット/ネクサス/マジック」の効果だけを止める。ブレイヴの召喚時の3枚は通り、聖域の5枚の枠にも数えない
    const s = game("e2", "p2", [], [RETICLE, HAMMER])
    put(s, "p1", SANCT, 2, "nexuses")
    const err = act(s, "p2", { type: "summon", handIndex: 0 })
    assert(err === null, `E2: レチクル・アームズを召喚（${err}）`)
    assert(s.players.p1.deck.length === 37, `E2: ブレイヴ自身の効果の3枚は止まらない（${s.players.p1.deck.length}）`)
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "E2: ハンマー")
    assert(s.players.p1.deck.length === 32, `E2: ブレイヴの3枚を数えず、マジックの5枚はまだ上限内（${s.players.p1.deck.length}）`)
}

console.log("すべてのチェックに合格しました 🎉（part694）")
