// smoke パート53（個別設計バッチA）
//   - BS04-018 水蛇シーサーペンタ: 相手スタートステップに手札枚数条件でバウンス（step condition ownHandAtLeast）
//   - BS04-059 薬師ギルママール: 破壊時にボイドからコア1個を自分のネクサス1つへ（voidCoreToOwnNexuses single）
//   - BS04-080 旋風渦巻く渓谷 Lv1: 両者ともスピリットを5体以上召喚できない（globalConstraint maxSpiritsOnField）
//   - BS04-110 レッドウォール: このターン「ブロックされない」効果を無視してブロックできる
//   - BS04-112 マッシブアップ: Lv3を持つ青のスピリット1体をLv3として扱う（levelOverrideTarget の対象フィルタ）
import { assert, act, createGame, createInstance, currentLevel, destroySpirit, fireStepTriggers, runTurnStart } from "./helpers"

console.log("=== BS04-018 水蛇シーサーペンタ: 手札枚数の条件を満たすときだけバウンス ===")
{
    const s = createGame("bs04-018", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    // p2 が所有し、p1 のターン（＝p2から見て相手のスタートステップ）に発火する
    s.players.p2.field.spirits.push(createInstance("BS04-018", s.turn, 1)) // Lv1（手札10枚以上が条件）
    const enemy = createInstance("BS01-007", s.turn, 1)
    s.players.p1.field.spirits.push(enemy)
    s.players.p2.hand = new Array(9).fill("BS01-001") // 9枚＝条件未達
    fireStepTriggers(s, "start")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === enemy.instanceId), "手札9枚では発火しない")

    s.players.p2.hand = new Array(10).fill("BS01-001") // 10枚＝条件達成
    fireStepTriggers(s, "start")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === enemy.instanceId), "手札10枚で相手スピリットが手札に戻る")
}
{
    const s = createGame("bs04-018-lv3", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.players.p2.field.spirits.push(createInstance("BS04-018", s.turn, 6)) // Lv3（手札6枚以上が条件）
    const enemy = createInstance("BS01-007", s.turn, 1)
    s.players.p1.field.spirits.push(enemy)
    s.players.p2.hand = new Array(6).fill("BS01-001")
    fireStepTriggers(s, "start")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === enemy.instanceId), "Lv3なら手札6枚で発火する")
}

console.log("=== BS04-059 薬師ギルママール: 破壊時にネクサス1つへコア1個 ===")
{
    const s = createGame("bs04-059", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const medic = createInstance("BS04-059", s.turn, 1)
    s.players.p1.field.spirits.push(medic)
    const nexusA = createInstance("BS04-076", s.turn, 2) // コア2個
    const nexusB = createInstance("BS04-080", s.turn, 0) // コア0個（こちらが自動選択される）
    s.players.p1.field.nexuses.push(nexusA)
    s.players.p1.field.nexuses.push(nexusB)
    destroySpirit(s, "p1", medic.instanceId, "destroy")
    assert(nexusB.cores === 1, "コアが最も少ないネクサスに1個置かれる")
    assert(nexusA.cores === 2, "もう一方のネクサスは変化しない（single）")
}

console.log("=== BS04-080 旋風渦巻く渓谷: スピリット4体のとき5体目を召喚できない ===")
{
    const s = createGame("bs04-080", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-080", s.turn, 0)) // 旋風渦巻く渓谷 Lv1
    for (let i = 0; i < 3; i++) s.players.p1.field.spirits.push(createInstance("BS01-001", s.turn, 1))
    s.players.p1.hand[0] = "BS01-001"
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "3体→4体目の召喚は可能")
    s.players.p1.hand[0] = "BS01-001"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) !== null, "4体いる状態で5体目の召喚は拒否される")
    // 相手側にも同じ制限がかかる（両陣営）
    for (let i = 0; i < 4; i++) s.players.p2.field.spirits.push(createInstance("BS01-001", s.turn, 1))
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1のターンを終了")
    s.players.p2.hand[0] = "BS01-001"
    s.players.p2.reserve = 20
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) !== null, "相手側も4体で打ち止めになる")
}

console.log("=== BS04-110 レッドウォール: 「ブロックされない」効果を無視してブロックできる ===")
{
    const s = createGame("bs04-110", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "green" })
    runTurnStart(s)
    const attacker = createInstance("BS01-035", s.turn, 1) // ボーン・グラディエイター（緑にブロックされない）
    s.players.p1.field.spirits.push(attacker)
    const greenBlocker = createInstance("BS01-058", s.turn, 1) // ヘラクレス・ジオ（緑）
    s.players.p2.field.spirits.push(greenBlocker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(act(s, "p2", { type: "block", instanceId: greenBlocker.instanceId }) !== null, "通常は緑スピリットでブロックできない")
    s.players.p2.hand = ["BS04-110"]
    s.players.p2.reserve = 20
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "レッドウォールをフラッシュで使用")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: greenBlocker.instanceId }) === null, "使用後は「ブロックされない」を無視してブロックできる")
}

console.log("=== BS04-112 マッシブアップ: Lv3を持つ青のスピリットをLv3として扱う ===")
{
    const s = createGame("bs04-112", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const blue = createInstance("BS03-083", s.turn, 1) // 熊男ベアード（青。Lv1 BP3000 / Lv3 BP8000）
    s.players.p1.field.spirits.push(blue)
    assert(currentLevel(blue).level === 1, "使用前はコア1個でLv1")
    s.players.p1.hand = ["BS04-112"]
    s.players.p1.reserve = 20
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: blue.instanceId }) === null,
        "マッシブアップを使用",
    )
    assert(currentLevel(blue).level === 3, "このターンの間Lv3として扱われる")
    assert(currentLevel(blue).bp === 8000, "BPもLv3の値になる")
}
{
    const s = createGame("bs04-112-ng", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const red = createInstance("BS01-007", s.turn, 1) // ハンマドレイク（赤。Lv3は持つが青ではない）
    s.players.p2.field.spirits.push(red)
    s.players.p1.hand = ["BS04-112"]
    s.players.p1.reserve = 20
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: red.instanceId }) === null,
        "赤のスピリットを対象にマッシブアップを使用",
    )
    assert(currentLevel(red).level === 1, "青でない対象には効果がない")
}

console.log("パート53 完了")
