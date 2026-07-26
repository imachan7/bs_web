// smoke パート16（対戦体験の改善第二弾: ネクサス上のコアからのコスト支払い）
// 収録セクション:
//   - server/src/logic/GameState.ts: findNexus（findSpiritと同型のネクサス版）
//   - server/src/logic/RuleValidator.ts: validatePaySourcesがfindNexusも参照
//   - server/src/logic/GameEngine.ts: payCostがfindNexusも参照（維持コア割れチェックは
//     findSpiritのみのまま。ネクサスは維持コアの概念がなく消滅対象から自然に除外される）
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectiveCost,
    getCard,
    minLevelCores,
    runTurnStart,
} from "./helpers"

console.log("=== ネクサス上のコアのみで支払い（BS01-098 燃えさかる戦場） ===")
{
    const s = createGame(
        "paysource-nexus-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const leewolfCard = getCard("BS01-053")
    const leewolfMaintain = minLevelCores(leewolfCard)

    // p1フィールドにネクサス支払い元（燃えさかる戦場、コア3個＝Lv2状態）を配置
    const nexus = createInstance("BS01-098", s.turn, 3)
    s.players.p1.field.nexuses.push(nexus)
    assert(currentLevel(nexus).level === 2, "ネクサスはコア3個でLv2")

    s.players.p1.hand[0] = "BS01-053"
    const cost = effectiveCost(s, "p1", leewolfCard)
    s.players.p1.reserve = leewolfMaintain // 維持コア分だけ確保し、実コストは全額ネクサス上のコアで賄う

    const trashCoresBefore = s.players.p1.trashCores
    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySources: [{ instanceId: nexus.instanceId, count: cost }],
        }) === null,
        "ネクサス上のコアでコストを支払い召喚できる",
    )
    assert(nexus.cores === 3 - cost, "ネクサスのコアがコスト分だけ減る")
    assert(s.players.p1.trashCores === trashCoresBefore + cost, "支払ったコアがトラッシュへ")
    assert(s.players.p1.field.nexuses.includes(nexus), "支払い後もネクサスは消滅せず場に残る")
    assert(currentLevel(nexus).level === 1, "コアが2未満に減りネクサスのレベルが2→1に下がる")
}

console.log("=== スピリット＋ネクサス併用でコストを分割払い ===")
{
    const s = createGame(
        "paysource-nexus-mixed-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const leewolfCard = getCard("BS01-053")
    const leewolfMaintain = minLevelCores(leewolfCard)

    const spiritPayer = createInstance("BS01-001", s.turn, 5)
    s.players.p1.field.spirits.push(spiritPayer)
    const nexusPayer = createInstance("BS01-098", s.turn, 3)
    s.players.p1.field.nexuses.push(nexusPayer)

    s.players.p1.hand[0] = "BS01-053"
    const cost = effectiveCost(s, "p1", leewolfCard)
    s.players.p1.reserve = leewolfMaintain
    const half = Math.floor(cost / 2)
    const rest = cost - half

    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySources: [
                { instanceId: spiritPayer.instanceId, count: half },
                { instanceId: nexusPayer.instanceId, count: rest },
            ],
        }) === null,
        "スピリットとネクサスに分割してコストを支払い召喚できる",
    )
    assert(spiritPayer.cores === 5 - half, "支払い元スピリットのコアが減る")
    assert(nexusPayer.cores === 3 - rest, "支払い元ネクサスのコアが減る")
    assert(
        s.players.p1.field.spirits.includes(spiritPayer),
        "維持コアを上回るため支払い元スピリットは生存",
    )
    assert(s.players.p1.field.nexuses.includes(nexusPayer), "支払い元ネクサスは消滅しない")
}

console.log("=== 不正な支払いの拒否（ネクサス版） ===")
{
    const s = createGame(
        "paysource-nexus-invalid-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const nexus = createInstance("BS01-098", s.turn, 3)
    s.players.p1.field.nexuses.push(nexus)

    s.players.p1.hand[0] = "BS01-053"
    s.players.p1.reserve = 10

    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySources: [{ instanceId: nexus.instanceId, count: 99 }],
        }) !== null,
        "支払い元ネクサスのコア不足は拒否される",
    )
    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySources: [
                { instanceId: nexus.instanceId, count: 1 },
                { instanceId: nexus.instanceId, count: 1 },
            ],
        }) !== null,
        "同一ネクサスの重複指定は拒否される",
    )
    assert(nexus.cores === 3, "拒否された支払いではネクサスのコアは変化しない")
}

console.log("=== paySources合計がコストを超える場合の拒否（ネクサス版） ===")
{
    const s = createGame(
        "paysource-nexus-overpay-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const leewolfCard = getCard("BS01-053")
    const nexus = createInstance("BS01-098", s.turn, 5)
    s.players.p1.field.nexuses.push(nexus)

    s.players.p1.hand[0] = "BS01-053"
    s.players.p1.reserve = 10
    const cost = effectiveCost(s, "p1", leewolfCard)

    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySources: [{ instanceId: nexus.instanceId, count: cost + 1 }],
        }) !== null,
        "ネクサス経由でも過払い（合計 > コスト）は拒否される（維持コアは必ずリザーブから）",
    )
    assert(nexus.cores === 5, "拒否された支払いではネクサスのコアは変化しない")
}
