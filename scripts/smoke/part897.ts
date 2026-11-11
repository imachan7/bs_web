// smoke パート897（監査で確定した「使ってからの合計」の期待値：SEMANTICS_AUDIT §3.29。期待値役が効果文だけから書いた）
import { act, assert, createGame, createInstance, destroySpirit, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const SHIELD = "BS05-076" // エターナルシールド（白・マジック・フラッシュ：このターンの間、自分のデッキは相手の効果では6枚以上破棄されない）
const BLIZZARD = "SD01-039" // ブリザードウォール（白・マジック・フラッシュ：このターンの間、ブロックされなかった相手のスピリットのアタックでは、自分のライフは1しか減らない）
const CLAY = "BS11-041" // クレイ・ゴレム（青・コスト1・破壊時：相手のデッキを上から2枚破棄）
const HOWL = "BS09-084" // ドラゴニックハウル（青・マジック・フラッシュ：自分のデッキを上から1枚破棄。同コストの相手のスピリットすべてを破壊）
const BEAT = "BS01-050" // ビートビートル（緑・コスト0・デッキの詰め物。ハウルで破棄されても相手のコスト0はいない）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・シンボル1・バニラ）
const KOKASUS = "BS23-009" // コーカサストリケラ（赤+緑・シンボル2・Lv1BP7000）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, name: string, type: string, cost: number, eff?: string) => {
        const c = getCard(id)
        assert(c.name === name && c.type === type && c.cost === cost && (eff === undefined || c.effect.includes(eff)), `${id}は${name}`)
    }
    chk(SHIELD, "エターナルシールド", "magic", 4, "6枚以上破棄されない")
    chk(BLIZZARD, "ブリザードウォール", "magic", 5, "1しか減らない")
    chk(CLAY, "クレイ・ゴレム", "spirit", 1, "相手のデッキを上から2枚破棄する")
    chk(HOWL, "ドラゴニックハウル", "magic", 6, "自分のデッキを上から1枚破棄する")
    chk(BEAT, "ビートビートル", "spirit", 0)
    chk(VAN, "ロクケラトプス", "spirit", 1)
    chk(KOKASUS, "コーカサストリケラ", "spirit", 8)
    assert(getCard(VAN).symbol.length === 1 && getCard(KOKASUS).symbol.length === 2, "シンボル数: VAN 1／KOKASUS 2")
}

function game(seed: string, turnPlayer: PlayerId): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "blue" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = "attack"
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 5
        p.burst = null
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => BEAT)
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

function settle(s: GameState): void {
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[] }
        const who = pc.pid ?? "p1"
        const err =
            pc.kind === "target" && pc.candidates?.[0] !== undefined
                ? act(s, who, { type: "resolveChoice", instanceId: pc.candidates[0] })
                : pc.kind === "option"
                  ? act(s, who, { type: "resolveChoice", option: (pc.options ?? []).includes("発動する") ? "発動する" : (pc.options ?? [""])[0]! })
                  : act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// フラッシュを両者パスで閉じる
function closeFlash(s: GameState): void {
    for (let i = 0; i < 10 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

console.log("=== 8. BS05-076 エターナルシールド：使ってからの合計で6枚以上破棄されない ===")
{
    const s = game("shield-total", "p1")
    const p1 = s.players.p1
    const atk = put(s, "p1", VAN, 1)
    const atk2 = put(s, "p1", VAN, 1)
    const clay0 = put(s, "p2", CLAY, 1)
    const clays = [put(s, "p2", CLAY, 1), put(s, "p2", CLAY, 1), put(s, "p2", CLAY, 1)]
    p1.hand = [SHIELD, HOWL]
    destroySpirit(s, "p2", clay0.instanceId, "destroy")
    assert(p1.deck.length === 38, "使う前の相手の効果で2枚破棄される（数えない）")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "フラッシュでエターナルシールドを使用")
    settle(s)
    const before = p1.deck.length
    assert(before === 38, "使っただけではデッキは減らない")
    // 自分の効果での破棄は数えない（ハウルの1枚）
    closeFlash(s)
    takeLifeAndResolve(s, "p2")
    // 2体目のアタックのフラッシュで、自分の効果による破棄（ハウル）をする
    assert(act(s, "p1", { type: "attack", instanceId: atk2.instanceId }) === null, "2体目でアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    const err = act(s, "p1", { type: "castMagic", handIndex: 0 })
    assert(err === null, `フラッシュでドラゴニックハウルも使用${err === null ? "" : `（拒否: ${err}）`}`)
    settle(s)
    assert(p1.deck.length === 37, "自分の効果で1枚破棄")
    destroySpirit(s, "p2", clays[0]!.instanceId, "destroy")
    destroySpirit(s, "p2", clays[1]!.instanceId, "destroy")
    assert(p1.deck.length === 33, "相手の効果で2枚＋2枚＝4枚破棄（ここまでは上限未満）")
    destroySpirit(s, "p2", clays[2]!.instanceId, "destroy")
    assert(p1.deck.length === 32, "3回目は残り1枚だけ破棄される（使ってからの合計5枚で止まる）")
    assert(p1.trashCards.length === 2 + 1 + 5 + 2, "トラッシュは使う前の2枚＋自分の1枚＋相手の効果の5枚＋使ったマジック2枚（エターナルシールド・ドラゴニックハウル）")
}
{
    const s = game("shield-none", "p1")
    const p1 = s.players.p1
    const clays = [put(s, "p2", CLAY, 1), put(s, "p2", CLAY, 1), put(s, "p2", CLAY, 1)]
    for (const c of clays) destroySpirit(s, "p2", c.instanceId, "destroy")
    assert(p1.deck.length === 34, "シールドを使っていなければ6枚とも破棄される")
}

console.log("=== 9. SD01-039 ブリザードウォール：使ってからの合計で1しか減らない ===")
{
    const s = game("blizzard-total", "p2")
    const p1 = s.players.p1
    const a = put(s, "p2", VAN, 1)
    const b = put(s, "p2", VAN, 1)
    const c = put(s, "p2", VAN, 1)
    p1.hand = [BLIZZARD]
    // 1体目：使う前。通常どおり1減る
    assert(act(s, "p2", { type: "attack", instanceId: a.instanceId }) === null, "1体目でアタック")
    closeFlash(s)
    takeLifeAndResolve(s, "p1")
    assert(p1.life === 4, "使う前のアタックは通常どおり1減る")
    // 2体目：このアタックのフラッシュで使う
    assert(act(s, "p2", { type: "attack", instanceId: b.instanceId }) === null, "2体目でアタック")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "フラッシュでブリザードウォールを使用")
    closeFlash(s)
    takeLifeAndResolve(s, "p1")
    assert(p1.life === 3, "使ってからの最初のアタックで1減る")
    // 3体目：使ってから合計1を超えるので減らない
    assert(act(s, "p2", { type: "attack", instanceId: c.instanceId }) === null, "3体目でアタック")
    closeFlash(s)
    takeLifeAndResolve(s, "p1")
    assert(p1.life === 3, "使ってからの合計が1に達しているので、3体目のアタックでは減らない")
}
{
    const s = game("blizzard-symbols", "p2")
    const p1 = s.players.p1
    const ko = put(s, "p2", KOKASUS, 1)
    p1.hand = [BLIZZARD]
    assert(act(s, "p2", { type: "attack", instanceId: ko.instanceId }) === null, "シンボル2のスピリットでアタック")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ブリザードウォールを使用")
    closeFlash(s)
    takeLifeAndResolve(s, "p1")
    assert(p1.life === 4, "シンボル2でもライフは1しか減らない")
}
{
    const s = game("blizzard-none", "p2")
    const ko = put(s, "p2", KOKASUS, 1)
    assert(act(s, "p2", { type: "attack", instanceId: ko.instanceId }) === null, "シンボル2でアタック")
    closeFlash(s)
    takeLifeAndResolve(s, "p1")
    assert(s.players.p1.life === 3, "使っていなければシンボル2で2減る")
}

console.log("すべてのチェックに合格しました 🎉（part897）")
