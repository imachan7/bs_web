// smoke パート51（ドロー枚数修正）
// 「自分のドローステップにドローの枚数を+1枚する」を、既存の百識の谷と同じ
// 「ドローステップに追加で1枚引く step 誘発」で表現する。条件は step の condition に新設した2種:
//   - ownNameIncludesCountAtLeast: BS04-052 郵便ペンタン Lv3（ペンタン/アンプルールが合計3体以上）
//   - ownFamilyCountAtLeast:       BS04-079 王蛇の住処（妖蛇/無魔が合計3体以上）
import { assert, createGame, createInstance, fireStepTriggers, runTurnStart } from "./helpers"

console.log("=== BS04-052 郵便ペンタン Lv3: ペンタン/アンプルールが3体以上ならドロー+1 ===")
{
    const s = createGame("bs04-052-ng", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits.push(createInstance("BS04-052", s.turn, 6)) // 郵便ペンタン Lv3
    s.players.p1.field.spirits.push(createInstance("BS02-058", s.turn, 1)) // ペンタン（計2体）
    const before = s.players.p1.hand.length
    fireStepTriggers(s, "draw")
    assert(s.players.p1.hand.length === before, "対象が2体では条件未達でドローしない")

    s.players.p1.field.spirits.push(createInstance("BS02-073", s.turn, 1)) // 皇帝アンプルール（計3体）
    fireStepTriggers(s, "draw")
    assert(s.players.p1.hand.length === before + 1, "ペンタン2体＋アンプルール1体の合計3体でドロー+1")
}

console.log("=== BS04-052 は Lv3 でのみ発揮される ===")
{
    const s = createGame("bs04-052-lv", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits.push(createInstance("BS04-052", s.turn, 1)) // 郵便ペンタン Lv1
    s.players.p1.field.spirits.push(createInstance("BS02-058", s.turn, 1))
    s.players.p1.field.spirits.push(createInstance("BS02-073", s.turn, 1))
    const before = s.players.p1.hand.length
    fireStepTriggers(s, "draw")
    assert(s.players.p1.hand.length === before, "Lv1では条件を満たしていてもドローしない")
}

console.log("=== BS04-079 王蛇の住処: 妖蛇/無魔が合計3体以上ならドロー+1（OR配列） ===")
{
    const s = createGame("bs04-079", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-079", s.turn, 0)) // 王蛇の住処 Lv1
    s.players.p1.field.spirits.push(createInstance("BS01-034", s.turn, 1)) // バイ・パイソン（妖蛇）
    s.players.p1.field.spirits.push(createInstance("BS01-029", s.turn, 1)) // リブ・リーパー（無魔）
    const before = s.players.p1.hand.length
    fireStepTriggers(s, "draw")
    assert(s.players.p1.hand.length === before, "2体では条件未達")

    s.players.p1.field.spirits.push(createInstance("BS01-032", s.turn, 1)) // ガウルム（無魔。妖蛇1＋無魔2＝3体）
    fireStepTriggers(s, "draw")
    assert(s.players.p1.hand.length === before + 1, "妖蛇1体＋無魔2体の合計3体でドロー+1（OR配列）")
}

console.log("=== 相手のドローステップでは発揮されない（turn: own） ===")
{
    const s = createGame("bs04-079-turn", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.players.p2.field.nexuses.push(createInstance("BS04-079", s.turn, 0)) // 相手（p2）が所有
    for (const cid of ["BS01-034", "BS01-029", "BS01-032"]) {
        s.players.p2.field.spirits.push(createInstance(cid, s.turn, 1))
    }
    const before = s.players.p2.hand.length
    fireStepTriggers(s, "draw") // 現在は p1 のターン
    assert(s.players.p2.hand.length === before, "自分のターンでなければドロー+1は発揮されない")
}

console.log("パート51 完了")
