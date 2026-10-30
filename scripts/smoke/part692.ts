// smoke パート692（「手札に戻らない」系の保護。2026-10-30 ユーザー確認の4規則）
// 1: 対象に取ることは防がない／2: 手札へ戻すことだけを止める（デッキへは戻る）／3: 挙がっていない種類（ブレイヴ）の効果は止めない／4: 主語・原因を限らなければ自分の効果も止める
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const TARU = "SD01-005" // タルタルガー（Lv1･Lv2 相手のスピリット/ネクサス/マジックの効果では手札に戻らない）
const KITSUNE = "BS16-012" // 金狐角（自分のアタックステップ：スピリットすべてはフィールドから手札に戻らない）
const GRIM = "BS18-043" // 創造主グリム・ウィル（Lv2以上 相手の効果ではフィールドから手札に戻らない）
const RIBBON = "BS01-146" // ドリームリボン（白フラッシュ：相手のスピリット1体を手札に戻す）
const STRIKE = "BS15-080" // 光速三段突（白マジック。フラッシュ：相手のスピリット1体をデッキの下に戻す）
const CRADLE = "BS11-077" // スタークレイドル（緑フラッシュ：【神速】を持つ自分のスピリット1体を手札に戻す）
const SWALLOW = "BS11-017" // ムシャツバメ（【神速】）
const EIL = "BS10-035" // 樹氷の女神エイル（スピリット。召喚時：相手のスピリット1体を手札に戻す）
const ALFA = "BS10-070" // 鎧馬アルファズル（ブレイヴ。Lv1 このブレイヴの召喚時：相手のスピリット1体を手札に戻す）
const VAN = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [[TARU, "タルタルガー"], [KITSUNE, "金狐角"], [GRIM, "創造主グリム・ウィル"], [RIBBON, "ドリームリボン"],
        [STRIKE, "光速三段突"], [CRADLE, "スタークレイドル"], [SWALLOW, "ムシャツバメ"], [EIL, "樹氷の女神エイル"], [ALFA, "鎧馬アルファズル"], [VAN, "ロクケラトプス"]]
    for (const [id, n] of names) assert(getCard(id).name === n, `${id}は${n}`)
    assert(getCard(ALFA).type === "brave" && getCard(EIL).type === "spirit", "ALFAはブレイヴ・EILはスピリット")
}

function game(seed: string, turnPlayer: PlayerId, phase: GameState["phase"], p1Hand: string[] = [], p2Hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = phase
    s.interactiveTargets = false
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 10
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

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function flash(s: GameState, pid: PlayerId): void {
    s.isFlashTiming = true
    s.priorityPlayer = pid
}

// 自分のアタックステップのフラッシュ窓まで進める（アタック宣言のあと）。メインステップならそのままフラッシュ窓にする
function flashIn(s: GameState, phase: GameState["phase"]): void {
    if (phase === "attack") {
        const atk = put(s, "p1", VAN, 1)
        const e = act(s, "p1", { type: "attack", instanceId: atk.instanceId })
        assert(e === null, `アタックできる（${e}）`)
    }
    flash(s, "p1")
}

const onField = (s: GameState, pid: PlayerId, id: string) => s.players[pid].field.spirits.some((x) => x.instanceId === id)

console.log("=== A. 規則1・3: タルタルガーは相手のマジック/スピリットの効果では戻らないが、相手のブレイヴ自身の効果では戻る ===")
{
    const s = game("a1", "p2", "main", [], [RIBBON])
    const taru = put(s, "p1", TARU, 1)
    flash(s, "p2")
    const err = act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: taru.instanceId })
    assert(err === null, `A: 相手のマジックの対象に選べる（${err}）`)
    assert(onField(s, "p1", taru.instanceId) && !s.players.p1.hand.includes(TARU), "A: 選んでも戻らない")
}
{
    const s = game("a1c", "p2", "main", [], [RIBBON])
    const van = put(s, "p1", VAN, 1)
    put(s, "p1", TARU, 1)
    flash(s, "p2")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: van.instanceId }) === null, "A対照: 使える")
    assert(!onField(s, "p1", van.instanceId) && s.players.p1.hand.includes(VAN), "A対照: タルタルガー以外のスピリットは戻る")
}
{
    const s = game("a2", "p2", "main", [], [EIL])
    const taru = put(s, "p1", TARU, 1)
    const err = act(s, "p2", { type: "summon", handIndex: 0 })
    assert(err === null, `A: 相手がエイルを召喚できる（${err}）`)
    assert(onField(s, "p1", taru.instanceId) && !s.players.p1.hand.includes(TARU), "A: 相手のスピリットの効果では戻らない")
}
{
    const s = game("a3", "p2", "main", [], [ALFA])
    const taru = put(s, "p1", TARU, 1)
    const err = act(s, "p2", { type: "summon", handIndex: 0 })
    assert(err === null, `A: 相手がアルファズルを召喚できる（${err}）`)
    assert(!onField(s, "p1", taru.instanceId) && s.players.p1.hand.includes(TARU), "A: 相手のブレイヴ自身の効果は止められず戻る（規則3）")
}

{
    const s = game("a3c", "p2", "main", [], [ALFA])
    const van = put(s, "p1", VAN, 1)
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "A対照: アルファズルを召喚できる")
    assert(!onField(s, "p1", van.instanceId) && s.players.p1.hand.includes(VAN), "A対照: 保護の無いスピリットはブレイヴの効果で戻る（道具の確認）")
}

console.log("=== B. 規則2: タルタルガーは相手のデッキの下へ戻す効果では戻る ===")
{
    const s = game("b", "p2", "main", [], [STRIKE])
    const taru = put(s, "p1", TARU, 1)
    flash(s, "p2")
    const err = act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: taru.instanceId })
    assert(err === null, `B: 使える（${err}）`)
    assert(!onField(s, "p1", taru.instanceId), "B: フィールドから離れる")
    assert(s.players.p1.deck[s.players.p1.deck.length - 1] === TARU && !s.players.p1.hand.includes(TARU), "B: 手札ではなくデッキの下に戻る")
}

console.log("=== C. 規則4・2: 金狐角は働くステップ（自分のアタックステップ）に、自分の効果でも手札に戻らせない ===")
for (const [phase, works] of [["attack", true], ["main", false]] as const) {
    const tag = works ? "働く" : "対照・働かない"
    {
        const s = game(`c1-${phase}`, "p1", phase, [CRADLE])
        put(s, "p1", KITSUNE, 1)
        const sw = put(s, "p1", SWALLOW, 1)
        put(s, "p2", VAN, 1)
        flashIn(s, phase)
        { const e = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }); assert(e === null, `C(${tag}): スタークレイドルを使える（${e}）`) }
        assert(onField(s, "p1", sw.instanceId) === works, works ? "C: 自分の効果でも自分のスピリットは戻らない" : `C対照(${tag}): アタックステップ以外では戻る（自分のスピリット）`)
    }
    {
        const s = game(`c2-${phase}`, "p1", phase, [RIBBON])
        put(s, "p1", KITSUNE, 1)
        const foe = put(s, "p2", VAN, 1)
        flashIn(s, phase)
        { const e = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: foe.instanceId }); assert(e === null, `C(${tag}): ドリームリボンを使える（${e}）`) }
        assert(onField(s, "p2", foe.instanceId) === works, works ? "C: 相手のスピリットも戻らない（陣営を限らない）" : `C対照(${tag}): アタックステップ以外では戻る（相手のスピリット）`)
    }
    {
        const s = game(`c3-${phase}`, "p1", phase, [STRIKE])
        put(s, "p1", KITSUNE, 1)
        const foe = put(s, "p2", VAN, 1)
        flashIn(s, phase)
        { const e = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: foe.instanceId }); assert(e === null, `C(${tag}): 光速三段突を使える（${e}）`) }
        assert(!onField(s, "p2", foe.instanceId) && s.players.p2.deck[s.players.p2.deck.length - 1] === VAN && s.players.p2.deck.length === 41, `C(${tag}): デッキの下へ戻す効果は通る`)
    }
}
{
    // 相手の効果で自分のスピリットを戻す場合も同じ（自分のアタックステップ中に相手がフラッシュで撃つ）
    const s = game("c4", "p1", "attack", [], [RIBBON])
    put(s, "p1", KITSUNE, 1)
    const mine = put(s, "p1", VAN, 1)
    flashIn(s, "attack")
    flash(s, "p2")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: mine.instanceId }) === null, "C: 相手のドリームリボンを使える")
    assert(onField(s, "p1", mine.instanceId), "C: 相手の効果でも戻らない")
}

console.log("=== D. 規則3: 創造主グリム・ウィル Lv2 は相手の効果ではマジックでもブレイヴ自身の効果でも戻らない（種類が挙がっていない）。デッキへは戻る ===")
for (const [cores, safe] of [[2, true], [1, false]] as const) {
    const lv = cores === 2 ? "Lv2" : "対照 Lv1"
    {
        const s = game(`d1-${cores}`, "p2", "main", [], [RIBBON])
        const grim = put(s, "p1", GRIM, cores)
        flash(s, "p2")
        assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: grim.instanceId }) === null, `D(${lv}): 対象に取れる`)
        assert(onField(s, "p1", grim.instanceId) === safe, `D(${lv}): 相手のマジックで${safe ? "戻らない" : "戻る"}`)
    }
    {
        const s = game(`d2-${cores}`, "p2", "main", [], [ALFA])
        const grim = put(s, "p1", GRIM, cores)
        assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, `D(${lv}): 相手がアルファズルを召喚できる`)
        assert(onField(s, "p1", grim.instanceId) === safe, `D(${lv}): 相手のブレイヴ自身の効果で${safe ? "戻らない" : "戻る"}`)
    }
}
{
    const s = game("d3", "p2", "main", [], [STRIKE])
    const grim = put(s, "p1", GRIM, 2)
    flash(s, "p2")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: grim.instanceId }) === null, "D: 光速三段突を使える")
    assert(!onField(s, "p1", grim.instanceId) && s.players.p1.deck[s.players.p1.deck.length - 1] === GRIM, "D: デッキの下へは戻る（規則2）")
}

console.log("すべてのチェックに合格しました 🎉（part692）")
