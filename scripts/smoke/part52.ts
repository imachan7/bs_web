// smoke パート52（強制ブロックと「ターンの最初のアタック」）
// GameState.attacksThisTurn を新設し、次の3枚を構造化:
//   - BS04-076 翼持つ者の空域 Lv2: 翼竜/空牙のアタックに対して相手は必ずブロック（kind mustBlockGrant）
//   - BS01-098 燃えさかる戦場 Lv2: ターン最初のアタックに対して相手は必ずブロック（firstAttackOnly）
//   - BS04-024 ダックル: ターン最初のアタック時にBP+2000（triggered condition firstAttackOfTurn）
// 「可能ならば」の判定は validateBlock を通す（実際にブロックできる相手がいるときだけ強制）
import { assert, act, takeLifeAndResolve, createGame, createInstance, runTurnStart } from "./helpers"

console.log("=== BS04-076 Lv2: 翼竜のアタックはライフで受けられない（強制ブロック） ===")
{
    const s = createGame("bs04-076-must", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-076", s.turn, 3)) // 翼持つ者の空域 Lv2
    const yokuryu = createInstance("BS01-005", s.turn, 1) // アイバーン（翼竜）
    s.players.p1.field.spirits.push(yokuryu)
    s.players.p2.field.spirits.push(createInstance("BS01-001", s.turn, 1)) // 相手にブロック可能なゴラドン
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: yokuryu.instanceId }) === null, "翼竜でアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ終了）")
    assert(act(s, "p2", { type: "takeLife" }) !== null, "ブロック可能な相手がいるためライフ受けが拒否される")
}

console.log("=== BS04-076 Lv2: 系統が違えばライフで受けられる ===")
{
    const s = createGame("bs04-076-other", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-076", s.turn, 3)) // 翼持つ者の空域 Lv2
    const other = createInstance("BS01-001", s.turn, 1) // ゴラドン（爬獣）
    s.players.p1.field.spirits.push(other)
    s.players.p2.field.spirits.push(createInstance("BS01-001", s.turn, 1))
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: other.instanceId }) === null, "爬獣でアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(takeLifeAndResolve(s, "p2") === null, "系統が一致しないアタックはライフで受けられる")
}

console.log("=== BS04-076 Lv2: ブロックできる相手がいなければ強制されない（可能ならば） ===")
{
    const s = createGame("bs04-076-noblocker", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-076", s.turn, 3))
    const yokuryu = createInstance("BS01-005", s.turn, 1) // アイバーン（翼竜）
    s.players.p1.field.spirits.push(yokuryu)
    // 相手フィールドは空＝ブロックできるスピリットがいない
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: yokuryu.instanceId }) === null, "翼竜でアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(takeLifeAndResolve(s, "p2") === null, "ブロック可能なスピリットがいなければライフで受けられる")
}

console.log("=== BS01-098 燃えさかる戦場 Lv2: 最初のアタックのみ強制ブロック ===")
{
    const s = createGame("bs01-098-must", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS01-098", s.turn, 2)) // 燃えさかる戦場 Lv2
    const a1 = createInstance("BS01-001", s.turn, 1)
    const a2 = createInstance("BS01-002", s.turn, 1)
    s.players.p1.field.spirits.push(a1)
    s.players.p1.field.spirits.push(a2)
    const blocker = createInstance("BS01-007", s.turn, 1) // ハンマドレイク（ブロック可能）
    s.players.p2.field.spirits.push(blocker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")

    // 1回目のアタック（強制ブロック）
    assert(act(s, "p1", { type: "attack", instanceId: a1.instanceId }) === null, "1体目でアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "takeLife" }) !== null, "最初のアタックはライフで受けられない")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ブロックする")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    // 2回目のアタック（強制されない）
    assert(act(s, "p1", { type: "attack", instanceId: a2.instanceId }) === null, "2体目でアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(takeLifeAndResolve(s, "p2") === null, "2回目以降のアタックはライフで受けられる")
}

console.log("=== BS04-024 ダックル: ターン最初のアタックのときだけBP+2000 ===")
{
    const s = createGame("bs04-024", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const duck1 = createInstance("BS04-024", s.turn, 1)
    const duck2 = createInstance("BS04-024", s.turn, 1)
    s.players.p1.field.spirits.push(duck1)
    s.players.p1.field.spirits.push(duck2)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: duck1.instanceId }) === null, "1体目のダックルでアタック")
    assert(duck1.tempBpBuff === 2000, "ターン最初のアタックなのでBP+2000")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")

    assert(act(s, "p1", { type: "attack", instanceId: duck2.instanceId }) === null, "2体目のダックルでアタック")
    assert(duck2.tempBpBuff === 0, "2回目のアタックではBP+2000は発揮されない")
}

console.log("パート52 完了")
