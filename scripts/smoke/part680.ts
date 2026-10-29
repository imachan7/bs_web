// smoke パート680（召喚の制限は「通常の召喚」と書かれていなければ効果による召喚にも効く。2026-10-29 ユーザー確認。効果文だけから書いた期待値）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const SENPU = "BS04-080" // 旋風渦巻く渓谷（緑・ネクサス・コスト3）
const SANZORU = "BS08-053" // 夢想法師サンゾール（青・スピリット・コスト5）
const HO = "BS12-071" // 未完成の古代戦艦：帆（青・ネクサス・コスト3）
const TAKARA = "BS12-072" // 海賊王の秘宝島（青・ネクサス・コスト4）
const V1 = "BS01-002" // ロクケラトプス（コスト1・バニラ）
const V2 = "BS01-005" // アイバーン（コスト2・バニラ）
const V3 = "BS01-008" // メタルバーン（コスト3・バニラ）
const V5 = "BS03-009" // 火吹きメルト（コスト5・バニラ）
const E2 = "BS01-004" // ドラグノ偵察兵（コスト2・効果あり）
const E3 = "BS01-010" // チャクラムバット（コスト3・効果あり）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        [SENPU]: "旋風渦巻く渓谷", [SANZORU]: "夢想法師サンゾール", [HO]: "未完成の古代戦艦：帆", [TAKARA]: "海賊王の秘宝島",
        [V1]: "ロクケラトプス", [V2]: "アイバーン", [V3]: "メタルバーン", [V5]: "火吹きメルト", [E2]: "ドラグノ偵察兵", [E3]: "チャクラムバット",
    }
    for (const [id, name] of Object.entries(names)) assert(getCard(id).name === name, `${id} は ${name}`)
    assert(getCard(SENPU).type === "nexus" && getCard(HO).type === "nexus" && getCard(TAKARA).type === "nexus" && getCard(SANZORU).type === "spirit", "種別")
    for (const id of [V1, V2, V3, V5]) assert(getCard(id).type === "spirit" && !getCard(id).effect, `${id} は効果の記述を持たないスピリット`)
    for (const id of [E2, E3]) assert(getCard(id).type === "spirit" && !!getCard(id).effect, `${id} は効果の記述を持つスピリット`)
    assert(getCard(V2).cost === 2 && getCard(V3).cost === 3 && getCard(V5).cost === 5 && getCard(E2).cost === 2 && getCard(E3).cost === 3, "コスト")
}

const other = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1")

interface Setup {
    turn: PlayerId
    phase?: "main" | "attack"
    nexus?: { owner: PlayerId; card: string; cores: number }
    spirit?: { owner: PlayerId; card: string; cores: number }
    spirits?: Partial<Record<PlayerId, string[]>>
    hand?: Partial<Record<PlayerId, string[]>>
    trash?: Partial<Record<PlayerId, string[]>>
}
function game(seed: string, o: Setup): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "green" })
    s.interactiveTargets = false
    s.turn = 3
    s.turnPlayer = o.turn
    s.priorityPlayer = o.turn
    s.phase = o.phase ?? "main"
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.deck = Array.from({ length: 40 }, () => V1)
        p.hand = o.hand?.[pid] ?? []
        p.trashCards = o.trash?.[pid] ?? []
        p.field.spirits = (o.spirits?.[pid] ?? []).map((c) => createInstance(c, 1, 1))
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    if (o.nexus) s.players[o.nexus.owner].field.nexuses.push(createInstance(o.nexus.card, 1, o.nexus.cores))
    if (o.spirit) s.players[o.spirit.owner].field.spirits.push(createInstance(o.spirit.card, 1, o.spirit.cores))
    refreshLevelAsOverrides(s)
    return s
}
const n = (s: GameState, pid: PlayerId) => s.players[pid].field.spirits.length
const normal = (s: GameState, pid: PlayerId, card: string) => act(s, pid, { type: "summon", handIndex: s.players[pid].hand.indexOf(card) })
function viaEffect(s: GameState, pid: PlayerId, filter: object = {}, trash = false): void {
    try {
        resolveAction(s, pid, null, { type: "summon", from: "hand", count: 1, ...(trash ? { alsoFrom: "trash", upTo: true } : {}), ...filter } as never)
    } catch (e) {
        assert(false, `効果による召喚が例外で止まった: ${(e as Error).message}`)
    }
}
const five = [V1, V1, V1, V1, V1]

console.log("=== 1. 旋風渦巻く渓谷：5体のとき通常の召喚ができない ===")
{
    const s = game("1", { turn: "p1", nexus: { owner: "p2", card: SENPU, cores: 3 }, spirits: { p1: five }, hand: { p1: [V2] } })
    assert(normal(s, "p1", V2) !== null && n(s, "p1") === 5, "通常の召喚は拒否される")
}
console.log("=== 1b. 旋風渦巻く渓谷：5体のとき効果による召喚も起きない ===")
{
    const s = game("1b", { turn: "p1", nexus: { owner: "p1", card: SENPU, cores: 3 }, spirits: { p1: five }, hand: { p1: [V2] } })
    viaEffect(s, "p1", { costFilter: 2 })
    assert(n(s, "p1") === 5 && s.players.p1.hand.includes(V2), "手札から効果で召喚されず5体のまま")
}
// 「5体以上召喚できない」＝召喚の結果フィールドが5体以上になる召喚ができない。4体いれば5体目は出せない（2026-10-30 ユーザー確認）
console.log("=== 1c. 旋風渦巻く渓谷：3体なら効果で4体目を召喚でき、4体では5体目を召喚できない ===")
{
    const s = game("1c", { turn: "p1", nexus: { owner: "p1", card: SENPU, cores: 3 }, spirits: { p1: five.slice(0, 3) }, hand: { p1: [V2, V3] } })
    viaEffect(s, "p1", { costFilter: 2 })
    assert(n(s, "p1") === 4, "4体目は召喚される")
    viaEffect(s, "p1", { costFilter: 3 })
    assert(n(s, "p1") === 4 && s.players.p1.hand.includes(V3), "5体目は召喚されない")
}
console.log("=== 1d. 旋風渦巻く渓谷：相手側（お互い）にも効く ===")
{
    const s = game("1d", { turn: "p1", nexus: { owner: "p1", card: SENPU, cores: 3 }, spirits: { p2: five }, hand: { p2: [V2] } })
    viaEffect(s, "p2", { costFilter: 2 })
    assert(n(s, "p2") === 5 && s.players.p2.hand.includes(V2), "相手のフィールドが5体でも効果で召喚されない")
}
console.log("=== 1e. 旋風渦巻く渓谷：アタックステップでは止めない ===")
{
    const s = game("1e", { turn: "p1", phase: "attack", nexus: { owner: "p1", card: SENPU, cores: 3 }, spirits: { p1: five }, hand: { p1: [V2] } })
    viaEffect(s, "p1", { costFilter: 2 })
    assert(n(s, "p1") === 6, "メインステップ以外なので6体目が召喚される")
}

console.log("=== 2. サンゾール Lv2：相手は通常の召喚の後、通常も効果も召喚できない ===")
{
    const s = game("2", { turn: "p2", spirit: { owner: "p1", card: SANZORU, cores: 2 }, hand: { p2: [V2, V3, V1] } })
    assert(normal(s, "p2", V2) === null && n(s, "p2") === 1, "1体目（コスト2）は召喚できる")
    assert(normal(s, "p2", V3) !== null && n(s, "p2") === 1, "2体目（コスト3）の通常の召喚は拒否")
    viaEffect(s, "p2", { costFilter: 1 })
    assert(n(s, "p2") === 1 && s.players.p2.hand.includes(V1), "効果による召喚も起きない")
}
console.log("=== 2b. サンゾール Lv2：効果で1体召喚した後の通常の召喚も止まる ===")
{
    const s = game("2b", { turn: "p2", spirit: { owner: "p1", card: SANZORU, cores: 2 }, hand: { p2: [V2, V3] } })
    viaEffect(s, "p2", { costFilter: 2 })
    assert(n(s, "p2") === 1, "効果で1体召喚できる")
    assert(normal(s, "p2", V3) !== null && n(s, "p2") === 1, "その後の通常の召喚は拒否")
}
console.log("=== 2c. サンゾール Lv2：コスト5以上と持ち主自身は止めない ===")
{
    const s = game("2c", { turn: "p2", spirit: { owner: "p1", card: SANZORU, cores: 2 }, hand: { p2: [V2, V5, V3] } })
    assert(normal(s, "p2", V2) === null, "コスト2を1体召喚")
    assert(normal(s, "p2", V5) === null && n(s, "p2") === 2, "コスト5は召喚できる")
    const t = game("2d", { turn: "p1", spirit: { owner: "p1", card: SANZORU, cores: 2 }, hand: { p1: [V2, V3] } })
    assert(normal(t, "p1", V2) === null && normal(t, "p1", V3) === null && n(t, "p1") === 3, "持ち主は2体召喚できる")
}

console.log("=== 3. 帆 Lv2：手札から効果の記述を持つスピリットを召喚した後、手札からの効果による召喚も止まる ===")
{
    const s = game("3", { turn: "p2", nexus: { owner: "p1", card: HO, cores: 3 }, hand: { p2: [E2, E3, V2] } })
    assert(normal(s, "p2", E2) === null && n(s, "p2") === 1, "1体目（効果あり）は召喚できる")
    viaEffect(s, "p2", { costFilter: 3 })
    assert(n(s, "p2") === 1 && s.players.p2.hand.includes(E3), "効果ありスピリットの手札からの効果召喚は起きない")
    viaEffect(s, "p2", { costFilter: 2 })
    assert(n(s, "p2") === 2, "効果の記述を持たないスピリットは止めない")
}
console.log("=== 3b. 帆 Lv2：トラッシュからの効果による召喚は止めない ===")
{
    const s = game("3b", { turn: "p2", nexus: { owner: "p1", card: HO, cores: 3 }, hand: { p2: [E2] }, trash: { p2: [E3] } })
    assert(normal(s, "p2", E2) === null, "1体目を召喚")
    viaEffect(s, "p2", { costFilter: 3, pendingZone: undefined }, true)
    assert(s.players.p2.field.spirits.some((x) => x.cardId === E3), "トラッシュから効果ありスピリットが召喚される")
}

console.log("=== 4. 海賊王の秘宝島：効果による召喚は止まり、通常の召喚は止まらない（お互い） ===")
for (const pid of ["p1", "p2"] as const) {
    const s = game(`4-${pid}`, { turn: pid, nexus: { owner: other(pid), card: TAKARA, cores: 1 }, hand: { [pid]: [V2, V3] } })
    viaEffect(s, pid, { costFilter: 2 })
    assert(n(s, pid) === 0 && s.players[pid].hand.includes(V2), `${pid}: 効果による召喚は起きない`)
    assert(normal(s, pid, V3) === null && n(s, pid) === 1, `${pid}: 通常の召喚は通る`)
}

console.log("すべてのチェックに合格しました 🎉（part680）")
