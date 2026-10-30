// smoke パート695（手札の破棄の問い合わせ。2026-10-30 ユーザー確認の5規則）
// 規則1「〜することで」のコストも効果の一部／規則2 召喚・マジックの使用コストと、ブロックのために払う破棄は効果ではない／
// 規則3 満天の牧草地は効果・コスト・使用コストのすべてを止める／規則4 チョウハッカイは効果と規則1のコストだけを止める／
// 規則5 月光集める塔・五角形の砦は相手の効果による自分の手札の破棄を止める
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, answerPayConfirm } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const PASTURE = "BS11-065" // 満天の牧草地（緑ネクサス。Lv1 お互いのメインステップ：お互い、手札を破棄できない）
const HACHI = "BS15-052" // 天蒼元帥チョウハッカイ（青スピリット。お互い、〜の効果で、手札を増やす/破棄することができない）
const TOWER = "BS12-067" // 月光集める塔（白ネクサス。自分の手札は相手の効果を受けない）
const FORT = "BS14-082" // 五角形の砦（白ネクサス。同上）
const ORFE = "BS13-044" // 吟遊詩人のオルフェ（青スピリット。召喚時：自分の手札1枚を破棄することで、相手の手札の中のマジック1枚を破棄）
const TOTEN = "BS11-075" // トーテンタンツ（紫フラッシュマジック：手札のスピリット/ブレイヴ1枚を破棄することで相手のコア2個をリザーブへ）
const MIA = "BS15-011" // ミーアバット（紫スピリット。手札のこのカードを破棄することで BP+2000。アタックステップのフラッシュ）
const VICTIM = "BS08-071" // ビクティム（紫マジック。メイン：このターン、召喚コストを手札の破棄で払える）
const NOGU = "BS13-047" // 深海大帝ノーグ・デンス（青スピリット。召喚時：このターン、これがアタックしたとき相手は手札のマジックを破棄しなければブロックできない）
const MERC = "BS10-058" // 水星神龍メルクリウス・サーペント（【合体時】合体アタック時：相手の手札1枚を内容を見ないで選び、マジックなら破棄）
const RETICLE = "BS11-059" // レチクル・アームズ（青ブレイヴ。メルクリウス・サーペントに合体させる役）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const MAGIC = "BS01-121" // フレイムダンス（赤フラッシュ・マジック）。破棄される側の「マジック」役
const FILL = "BS01-003" // 手札の埋め草（スピリット）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [[PASTURE, "満天の牧草地"], [HACHI, "天蒼元帥チョウハッカイ"], [TOWER, "月光集める塔"], [FORT, "五角形の砦"],
        [ORFE, "吟遊詩人のオルフェ"], [TOTEN, "トーテンタンツ"], [MIA, "ミーアバット"], [VICTIM, "ビクティム"], [NOGU, "深海大帝ノーグ・デンス"],
        [MERC, "水星神龍メルクリウス・サーペント"], [VAN, "ロクケラトプス"], [MAGIC, "フレイムダンス"]]
    for (const [id, n] of names) assert(getCard(id).name === n, `${id}は${n}`)
    assert(getCard(MAGIC).type === "magic", "フレイムダンスはマジック")
    assert(getCard(FILL).type === "spirit", "FILL はスピリット")
}

function game(seed: string, turnPlayer: PlayerId, p1Hand: string[] = [], p2Hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
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

console.log("=== A. 規則1・3: 牧草地の下、メインステップでは「手札を破棄することで」のコストが払えない（オルフェ） ===")
// 手札: [オルフェ, FILL]。オルフェを召喚すると手札は [FILL]。コストで FILL を破棄できれば手札が空になる
for (const pasture of [true, false]) {
    const s = game(`a-${pasture}`, "p1", [ORFE, FILL], [MAGIC])
    if (pasture) put(s, "p2", PASTURE, 1, "nexuses") // 牧草地は「お互い」なので相手側に置いても効く
    const e = act(s, "p1", { type: "summon", handIndex: 0 })
    assert(e === null, `A: オルフェを召喚できる（召喚コストの支払いは手札の破棄ではない）（${e}）`)
    answerPayConfirm(s, "p1")
    assert(s.players.p1.field.spirits.some(x => x.cardId === ORFE), "A: オルフェは場に出る")
    assert(s.players.p1.hand.length === (pasture ? 1 : 0), `A(${pasture}): 手札の枚数（${s.players.p1.hand.length}）`)
    assert(s.players.p2.hand.length === (pasture ? 1 : 0), `A(${pasture}): 相手のマジックが破棄されるのはコストを払えたときだけ（${s.players.p2.hand.length}）`)
}

console.log("=== B. 規則2・3: 牧草地の下、ビクティムの「手札の破棄で召喚コストを払う」ができない ===")
// ビクティム（メイン）→ コスト2のスピリットを、手札の破棄2枚で召喚する。コストの支払いは効果ではないが牧草地は止める
for (const pasture of [true, false]) {
    const s = game(`b-${pasture}`, "p1", [VICTIM, VAN, FILL, FILL])
    s.players.p1.reserve = 4 + 1 // ビクティム自身のコスト4と、スピリットを置くコア1個だけ。召喚コストは手札の破棄で払う
    if (pasture) put(s, "p2", PASTURE, 1, "nexuses")
    s.players.p1.hand = [VICTIM, VAN, FILL, FILL]
    const e1 = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" })
    assert(e1 === null, `B: ビクティムを使える（${e1}）`)
    const fillCost = getCard(FILL).cost
    const e2 = act(s, "p1", { type: "summon", handIndex: 2, discardHandIndices: [0, 1].slice(0, Math.min(2, fillCost)) })
    const summoned = s.players.p1.field.spirits.some(x => x.cardId === FILL)
    assert(summoned === !pasture && (e2 === null) === !pasture, `B(${pasture}): 手札の破棄で召喚コストを払って召喚できるのは牧草地が無いときだけ（${e2}）`)
}

console.log("=== C. 規則1・2・4: チョウハッカイの下、召喚コストの破棄は通り、「〜することで」の手札破棄コストは払えない ===")
for (const hachi of [true, false]) {
    // C1: ビクティムの「手札の破棄で払える」は効果が与えた払い方なので、その破棄は効果による破棄＝チョウハッカイが止める（10-30 ユーザー決定）
    const s = game(`c1-${hachi}`, "p1", [VICTIM, FILL, FILL, FILL])
    s.players.p1.reserve = 4 + 1
    if (hachi) put(s, "p2", HACHI, 2)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "C1: ビクティムを使える")
    const n = getCard(FILL).cost
    const e = act(s, "p1", { type: "summon", handIndex: 0, discardHandIndices: [1, 2].slice(0, n) })
    assert((e === null && s.players.p1.field.spirits.some(x => x.cardId === FILL)) === !hachi, `C1(${hachi}): 手札の破棄で召喚コストを払えるのはチョウハッカイが無いときだけ（${e}）`)
    // C2: オルフェの召喚時「手札1枚を破棄することで」は規則1のコストなのでチョウハッカイが止める
    const t = game(`c2-${hachi}`, "p1", [ORFE, FILL], [MAGIC])
    if (hachi) put(t, "p2", HACHI, 2)
    assert(act(t, "p1", { type: "summon", handIndex: 0 }) === null, "C2: オルフェを召喚できる")
    answerPayConfirm(t, "p1")
    assert(t.players.p1.hand.length === (hachi ? 1 : 0), `C2(${hachi}): 手札の破棄コストは払えない（${t.players.p1.hand.length}）`)
    assert(t.players.p2.hand.length === (hachi ? 1 : 0), `C2(${hachi}): 相手のマジックが破棄されるのはコストを払えたときだけ（${t.players.p2.hand.length}）`)
}
// C3: 手札のミーアバットを破棄するフラッシュ能力も規則1のコスト
for (const hachi of [true, false]) {
    const s = game(`c3-${hachi}`, "p1", [MIA])
    s.phase = "attack"
    const atk = put(s, "p1", VAN, 1)
    if (hachi) put(s, "p2", HACHI, 2)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "C3: アタックできる")
    for (let i = 0; i < 3 && s.priorityPlayer !== "p1"; i++) act(s, s.priorityPlayer, { type: "pass" })
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    const e = act(s, "p1", { type: "useHandAbility", handIndex: 0, effectId: getCard(MIA).effects.find(x => x.kind === "handActivated")?.id ?? "" })
    answerPayConfirm(s, "p1")
    const used = s.players.p1.hand.length === 0
    assert(used === !hachi, `C3(${hachi}): ミーアバットを手札から破棄して使えるのはチョウハッカイが無いときだけ（${e}）`)
}

// 効果が要求する破棄は効果による破棄なので、チョウハッカイの下では払えずブロックできない（10-30 ユーザー決定）
console.log("=== D. チョウハッカイの下、「手札のマジックを破棄しなければブロックできない」は払えずブロックできない ===")
for (const hachi of [true, false]) {
    const s = game(`d-${hachi}`, "p1", [NOGU], [MAGIC])
    const host = put(s, "p1", MERC, 3) // 【転召：異合】の転召元（異合のスピリット）
    host.isRested = true
    const se = act(s, "p1", { type: "summon", handIndex: 0 })
    assert(se === null, `D: ノーグ・デンスを召喚（${se}）`)
    const nogu = s.players.p1.field.spirits.find(x => x.cardId === NOGU)!
    nogu.summonedTurn = s.turn - 1 // アタックできるようにする
    const blocker = put(s, "p2", VAN, 1)
    if (hachi) put(s, "p2", HACHI, 2)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: nogu.instanceId }) === null, "D: アタックできる")
    for (let i = 0; i < 3 && s.isFlashTiming; i++) act(s, s.priorityPlayer, { type: "pass" })
    const e = act(s, "p2", { type: "block", instanceId: blocker.instanceId })
    assert((e === null) === !hachi, `D(${hachi}): ブロックできるのはチョウハッカイが無いときだけ（${e}）`)
    assert(s.players.p2.hand.length === (hachi ? 1 : 0), `D(${hachi}): マジックを破棄して払うのはチョウハッカイが無いときだけ（${s.players.p2.hand.length}）`)
}

console.log("=== E. 規則5: 塔・砦の持ち主の手札は、相手の「手札1枚を内容を見ないで選び、マジックなら破棄」で破棄されない ===")
// 合体したメルクリウス・サーペントの合体アタック時。相手の手札はマジック1枚だけにして、選ばれるカードを確定させる
for (const guard of [TOWER, FORT, null]) {
    const s = game(`e-${guard}`, "p1", [], [MAGIC])
    const host = put(s, "p1", MERC, 4) // Lv2
    const brave = put(s, "p1", RETICLE, 1)
    const ce = act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    assert(ce === null, `E: 合体できる（${ce}）`)
    if (guard) put(s, "p2", guard, 2, "nexuses")
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "E: 合体アタックできる")
    for (let i = 0; i < 6 && s.pendingChoice === undefined && s.priorityPlayer !== "p1"; i++) act(s, s.priorityPlayer, { type: "pass" })
    assert(s.players.p2.hand.length === (guard ? 1 : 0), `E(${guard}): 塔・砦が無いときだけマジックが破棄される`)
}

console.log("すべてのチェックに合格しました 🎉（part695）")
