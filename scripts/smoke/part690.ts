// smoke パート690（疲労の問い合わせ。2026-10-30 ユーザー確認の4規則）
// 「疲労しない／疲労させられない」は対象に取ることを防がない／コストでは使えない／「相手の〜の効果」は持ち主の効果とコストを止めない／アタック宣言は効果ではない
import { act, assert, createGame, createInstance, getCard, giveBp, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const DIL = "BS12-012" // 戦車皇ディルガン（Lv2以上で相手のスピリット/ブレイヴ/ネクサス/マジックの効果では疲労しない）
const TRUMP = "BS03-112" // トランプの王国（働くステップ＝自分のアタックステップ。系統「四道」の自分のスピリットを守る）
const PALACE = "BS09-063" // 花の宮殿（Lv2 お互いのアタックステップ：相手のネクサスすべては疲労させることができない）
const BIND = "BS01-134" // バインディングソーン（緑フラッシュ：相手のスピリット1体を疲労させる）
const HOWL = "BS04-099" // グラウンドハウリング（緑メイン：BP4000以上の相手のスピリットすべてを疲労。自分に2シンボルのスピリットが要る）
const KEN = "BS02-056" // アルカナビースト・ケン（四道・Lv1 BP2000）
const LEO = "BS16-043" // スペードビースト・レオ（四道・黄2シンボル・Lv1 BP4000）
const TARAN = "BS16-025" // タランドーズ（緑2シンボル・Lv1 BP6000）
const FALCON = "BS07-052" // 隼の剣士ファルコニア（Lv1【強襲：1】）
const KUMA = "BS10-074" // きぐるみクマッター（ブレイヴ。【合体時】バトル時に相手のネクサスすべてを疲労させる）
const ARCHER = "BS16-006" // アーチャー・ドラゴン（コスト5。クマッターの合体先）
const VAN = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [[DIL, "戦車皇ディルガン"], [TRUMP, "トランプの王国"], [PALACE, "花の宮殿"], [BIND, "バインディングソーン"],
        [HOWL, "グラウンドハウリング"], [KEN, "アルカナビースト・ケン"], [LEO, "スペードビースト・レオ"], [TARAN, "タランドーズ"],
        [FALCON, "隼の剣士ファルコニア"], [KUMA, "きぐるみクマッター"], [ARCHER, "アーチャー・ドラゴン"], [VAN, "ロクケラトプス"]]
    for (const [id, n] of names) assert(getCard(id).name === n, `${id}は${n}`)
}

// 開始盤面: turnPlayer が turnPlayer、メインステップ。盤面は空にして自分で置く
function game(seed: string, turnPlayer: PlayerId, p1Hand: string[] = [], p2Hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = "main"
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

console.log("=== A. 規則1: ディルガン Lv2 は相手のマジックの対象に取れるが疲労しない ===")
for (const [cores, rested] of [[3, false], [1, true]] as const) {
    const s = game(`a-${cores}`, "p2", [], [BIND])
    const dil = put(s, "p1", DIL, cores) // 3個=Lv2 / 1個=Lv1
    flash(s, "p2")
    const err = act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: dil.instanceId })
    assert(err === null, `A: ディルガンを対象に取れる（Lv${cores === 3 ? 2 : 1}）（${err}）`)
    assert(dil.isRested === rested, cores === 3 ? "A: Lv2 は疲労しない" : "A対照: Lv1 は疲労する")
}

console.log("=== B. 規則1: 「すべてを疲労」でもディルガン Lv2 だけ疲労しない ===")
for (const cores of [3, 1]) {
    const s = game(`b-${cores}`, "p2", [], [HOWL])
    const dil = put(s, "p1", DIL, cores)
    if (cores === 1) giveBp(s, dil, 1000) // Lv1のBP3000はHOWLの下限4000に届かないので足す
    const leo = put(s, "p1", LEO, 1) // BP4000
    put(s, "p2", TARAN, 1) // 自分の2シンボルのスピリット（使用条件）
    const err = act(s, "p2", { type: "castMagic", handIndex: 0, timing: "main" })
    assert(err === null, `B: 使える（${err}）`)
    assert(leo.isRested === true, "B: 並んでいる別のスピリットは疲労する")
    assert(dil.isRested === (cores === 1), cores === 3 ? "B: ディルガン Lv2 は疲労しない" : "B対照: Lv1 のディルガンは疲労する")
}

console.log("=== C. 規則3: トランプの王国は働くステップに限り、四道の自分のスピリットを相手のマジックから守る ===")
{
    // p1 のアタックステップ中に p2 がフラッシュで撃つ。working=false は p2 のターンのメインで撃つ（トランプの王国の働くステップではない）
    const make = (working: boolean, withTrump: boolean, targetCard = KEN) => {
        const s = game(`c-${working}-${withTrump}-${targetCard}`, working ? "p1" : "p2", [], [BIND])
        if (withTrump) put(s, "p1", TRUMP, 1, "nexuses") // Lv1
        const target = put(s, "p1", targetCard, 1)
        if (working) {
            s.phase = "attack"
            const atk = put(s, "p1", VAN, 1)
            assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "C: アタックできる")
            for (let i = 0; i < 3 && s.priorityPlayer !== "p2"; i++) act(s, s.priorityPlayer, { type: "pass" })
        }
        flash(s, "p2")
        return { s, target }
    }
    const cast = (m: { s: GameState; target: { instanceId: string } }) =>
        act(m.s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: m.target.instanceId })
    const a = make(true, true)
    assert(cast(a) === null, "C: 対象に取れる")
    assert(a.target.isRested === false, "C: 自分のアタックステップ中、四道のスピリットは疲労しない")
    const b = make(false, true)
    assert(cast(b) === null && b.target.isRested === true, "C対照: 働かないステップ（相手のターン）では疲労する")
    const c = make(true, false)
    assert(cast(c) === null && c.target.isRested === true, "C対照: ネクサスが無ければ疲労する")
    const d = make(true, true, VAN)
    assert(cast(d) === null && d.target.isRested === true, "C対照: 四道でないスピリットは疲労する")
}
// 規則3のブレイヴ自身の効果（召喚時）は、相手のアタックステップ中に相手が召喚できる場面が組めないため書いていない

console.log("=== D. 規則3: 花の宮殿は持ち主自身の効果でも相手のネクサスを疲労させない ===")
{
    const make = (palaceCores: number) => {
        const s = game(`d-${palaceCores}`, "p1")
        put(s, "p1", PALACE, palaceCores, "nexuses") // 2個=Lv2 / 0個=Lv1
        const host = put(s, "p1", ARCHER, 3)
        const brave = put(s, "p1", KUMA, 1)
        const err = act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
        assert(err === null, `D: クマッターが合体できる（${err}）`)
        s.phase = "attack"
        const foeNexus = put(s, "p2", TRUMP, 1, "nexuses")
        const blk = put(s, "p2", VAN, 3)
        assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "D: アタックできる")
        for (let i = 0; i < 5 && s.isFlashTiming; i++) act(s, s.priorityPlayer, { type: "pass" })
        assert(act(s, "p2", { type: "block", instanceId: blk.instanceId }) === null, "D: ブロックできる")
        for (let i = 0; i < 20 && s.battle; i++) if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
        return foeNexus
    }
    assert(make(2).isRested === false, "D: Lv2 の花の宮殿の下では、持ち主の効果でも相手のネクサスは疲労しない")
    assert(make(0).isRested === true, "D対照: Lv1 なら相手のネクサスは疲労する")
}

console.log("=== E. 規則2: 花の宮殿の下で、相手は【強襲】の支払いに自分のネクサスを使えない ===")
{
    const make = (palace: boolean) => {
        const s = game(`e-${palace}`, "p2")
        s.phase = "attack"
        if (palace) put(s, "p1", PALACE, 2, "nexuses")
        const fal = put(s, "p2", FALCON, 1)
        const nex = put(s, "p2", TRUMP, 1, "nexuses")
        assert(act(s, "p2", { type: "attack", instanceId: fal.instanceId }) === null, "E: アタックできる")
        for (let i = 0; i < 5 && s.isFlashTiming; i++) act(s, s.priorityPlayer, { type: "pass" })
        return { fal, nex }
    }
    const ctrl = make(false)
    assert(ctrl.fal.isRested === false && ctrl.nex.isRested === true, `E対照: 花の宮殿が無ければ【強襲】でネクサスを疲労させて回復する（${ctrl.fal.isRested}/${ctrl.nex.isRested}）`)
    const lim = make(true)
    assert(lim.nex.isRested === false, "E: ネクサスは疲労させられない")
    assert(lim.fal.isRested === true, "E: 払えないので回復しない")
}

console.log("=== F. 規則4: アタック宣言による疲労は効果ではないので、ディルガン Lv2 も疲労する ===")
{
    const s = game("f", "p1")
    s.phase = "attack"
    const dil = put(s, "p1", DIL, 3)
    assert(act(s, "p1", { type: "attack", instanceId: dil.instanceId }) === null, "F: アタックできる")
    assert(dil.isRested === true, "F: アタック宣言で疲労する")
}

console.log("すべてのチェックに合格しました 🎉（part690）")
