// smoke パート7（BS02構造化バッチ6：レベル置換「〜として扱う」）
// 収録セクション:
//   - BS02-002 ナイフ投げのジャグリーン：自分のスピリットが2体以下の間Lv3として扱う（継続・kind:levelAs）
//   - BS02-085 トパーズの流星：Lv2のとき自分のネクサスすべてをLv2として扱う（継続・kind:levelAs）
//   - BS02-073 皇帝アンプルール：Lv3のスタートステップでコア1個をボイドに置き、
//     相手のネクサスすべてをこのターンLv1として扱う（kind:step + levelOverrideOpponentNexuses）
//     ターン終了でのリセット、リザーブ不足による不発も確認する
import {
    act,
    createGame,
    createInstance,
    currentLevel,
    fireStepTriggers,
    refreshLevelAsOverrides,
    runTurnStart,
    assert,
} from "./helpers"

console.log("=== BS02-002 ナイフ投げのジャグリーン：自分のスピリットが2体以下の間Lv3として扱う ===")
{
    const s = createGame(
        "bs02-jugurin-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    const jugurin = createInstance("BS02-002", s.turn, 1) // コア1個（本来Lv1 BP1000）
    s.players.p1.field.spirits.push(jugurin)
    refreshLevelAsOverrides(s)
    assert(
        currentLevel(jugurin).level === 3 && currentLevel(jugurin).bp === 5000,
        "自分のスピリットが1体（ジャグリーンのみ）のときLv3として扱われる（BP5000）",
    )

    // コスト0のゴラドンを2体召喚し、自分のフィールドを3体にする（事後フックで再計算される）
    s.players.p1.hand[0] = "BS01-001"
    s.players.p1.hand[1] = "BS01-001"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "1体目のゴラドンを召喚")
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "2体目のゴラドンを召喚")
    assert(
        currentLevel(jugurin).level === 1 && currentLevel(jugurin).bp === 1000,
        "自分のスピリットが3体になると通常のLv1（BP1000）に戻る",
    )
}

console.log("=== BS02-085 トパーズの流星：Lv2のとき自分のネクサスすべてをLv2として扱う ===")
{
    const s = createGame(
        "bs02-topaz-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const topaz = createInstance("BS02-085", s.turn, 5) // コア5個（Lv2）
    const other = createInstance("BS01-098", s.turn, 0) // 燃えさかる戦場：コア0（本来Lv1）
    s.players.p1.field.nexuses.push(topaz, other)
    refreshLevelAsOverrides(s)
    assert(
        currentLevel(other).level === 2,
        "トパーズの流星がLv2のとき、コア0の自分の他ネクサスもLv2として扱われる",
    )
}

console.log("=== BS02-073 皇帝アンプルール：Lv3のスタートステップで相手のネクサスをLv1として扱う ===")
{
    const s = createGame(
        "bs02-amplure-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const amplure = createInstance("BS02-073", s.turn, 6) // コア6個（Lv3）
    s.players.p1.field.spirits.push(amplure)
    const enemyNexus = createInstance("BS01-098", s.turn, 2) // 燃えさかる戦場：コア2（本来Lv2）
    s.players.p2.field.nexuses.push(enemyNexus)
    s.players.p1.reserve = 3

    fireStepTriggers(s, "start")
    assert(s.players.p1.reserve === 2, "リザーブのコア1個を払ってボイドに置いた")
    assert(
        currentLevel(enemyNexus).level === 1,
        "相手ネクサス（本来Lv2）がこのターンの間Lv1として扱われる",
    )

    // ターン終了で解除されることを確認する（再発火を避けるためアンプルールを退場させてから終了する）
    s.players.p1.field.spirits = s.players.p1.field.spirits.filter((i) => i !== amplure)
    assert(act(s, "p1", { type: "endTurn" }) === null, "ターンを終了")
    assert(
        currentLevel(enemyNexus).level === 2,
        "ターン終了でレベル上書きが解除され、本来のLv2に戻る",
    )
}

console.log("=== BS02-073 皇帝アンプルール：リザーブ不足なら不発 ===")
{
    const s = createGame(
        "bs02-amplure-insufficient-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const amplure = createInstance("BS02-073", s.turn, 6) // コア6個（Lv3）
    s.players.p1.field.spirits.push(amplure)
    const enemyNexus = createInstance("BS01-098", s.turn, 2) // 本来Lv2
    s.players.p2.field.nexuses.push(enemyNexus)
    s.players.p1.reserve = 0

    fireStepTriggers(s, "start")
    assert(s.players.p1.reserve === 0, "リザーブ不足のためコアは減らない")
    assert(
        currentLevel(enemyNexus).level === 2,
        "リザーブ不足で不発のため、相手ネクサスは本来のLv2のまま",
    )
}
