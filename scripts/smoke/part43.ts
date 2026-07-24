// smoke パート43（BS04構造化スキップ解消・エンジン拡張バッチ1の検証）
// 拡張1: familyFilter の OR配列対応（bpBuffAll / bpBuff）— BS04-029 ブラックモノケイロス
// 拡張2: シンボル数条件（magic condition ownFieldHasMinSymbolSpirit）・
//        対象フィルタ（bpBuff の minSymbols）— BS04-091 ライトニングバリスタ
// 拡張3: 光芒（kobo）の一時付与対応（resolveKoboOnBattleEndがtempKeywordsも見るように）— BS04-106 グリームホープ
import { assert, act, createGame, createInstance, runTurnStart } from "./helpers"

console.log("=== 拡張1: BS04-029 ブラックモノケイロス（召喚時、系統「殻人」/「殻虫」のいずれかでBP+3000） ===")
{
    const s = createGame(
        "bs04-029-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "white" },
    )
    runTurnStart(s)
    const shellAlly = createInstance("BS01-050", s.turn, 1) // ビートビートル（殻虫）BP1000
    s.players.p1.field.spirits.push(shellAlly)
    const unrelated = createInstance("BS01-001", s.turn, 1) // ゴラドン（爬獣。系統不一致）BP1000
    s.players.p1.field.spirits.push(unrelated)
    s.players.p1.hand[0] = "BS04-029"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ブラックモノケイロスを召喚")
    const monoceros = s.players.p1.field.spirits.find((sp) => sp.cardId === "BS04-029")
    assert(monoceros !== undefined, "ブラックモノケイロスが場に出た")
    assert(monoceros?.tempBpBuff === 3000, "自身（系統「殻人」）もBP+3000される")
    assert(shellAlly.tempBpBuff === 3000, "系統「殻虫」のビートビートルもBP+3000される（OR一致）")
    assert(unrelated.tempBpBuff === 0, "系統が一致しないゴラドンはBP+3000されない")
}

console.log("=== 拡張1 既存回帰: BS03-145 スクランブル（familyFilterが単一文字列でも従来通り動く） ===")
{
    const s = createGame(
        "bs03-145-regress-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "white" },
    )
    runTurnStart(s)
    const jeffry = createInstance("BS03-072", s.turn, 1) // 槍兵のジェフリー（闘神）BP2000
    s.players.p1.field.spirits.push(jeffry)
    const unrelated = createInstance("BS01-001", s.turn, 1) // ゴラドン（系統不一致）
    s.players.p1.field.spirits.push(unrelated)
    s.players.p1.hand[0] = "BS03-145"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "スクランブルを使用")
    assert(jeffry.tempBpBuff === 3000, "系統「闘神」のジェフリーはBP+3000される（単一文字列は従来通り）")
    assert(unrelated.tempBpBuff === 0, "系統が一致しないゴラドンはBP+3000されない")
}

console.log("=== 拡張2: BS04-091 ライトニングバリスタ メイン（シンボル2つ以上の自陣スピリットがいないと発動しない） ===")
{
    const s = createGame(
        "bs04-091-main-fail-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const oneSymbolAlly = createInstance("BS01-007", s.turn, 1) // ハンマドレイク（シンボル1つ）
    s.players.p1.field.spirits.push(oneSymbolAlly)
    const enemy = createInstance("BS01-007", s.turn, 1) // 相手BP4000（7000以下）
    s.players.p2.field.spirits.push(enemy)
    s.players.p1.hand[0] = "BS04-091"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ライトニングバリスタを使用（発動条件未達）")
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === enemy.instanceId),
        "シンボル2つ以上の自陣スピリットがいないため破壊が発動せず、相手スピリットは残る",
    )
}

console.log("=== 拡張2: BS04-091 メイン（シンボル2つのジークフリードがいれば発動する） ===")
{
    const s = createGame(
        "bs04-091-main-ok-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const twoSymbolAlly = createInstance("BS04-X13", s.turn, 1) // 魔龍帝ジークフリード（シンボル2つ）
    s.players.p1.field.spirits.push(twoSymbolAlly)
    const enemy = createInstance("BS01-007", s.turn, 1) // 相手BP4000（7000以下）
    s.players.p2.field.spirits.push(enemy)
    s.players.p1.hand[0] = "BS04-091"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ライトニングバリスタを使用（発動条件達成）")
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === enemy.instanceId),
        "シンボル2つ以上のジークフリードがいるため、BP7000以下の相手スピリットが破壊される",
    )
}

console.log("=== 拡張2: BS04-091 フラッシュ（minSymbols対象フィルタ。バトル中に自動選択で判定） ===")
{
    const s = createGame(
        "bs04-091-flash-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const twoSymbolAlly = createInstance("BS04-X13", s.turn, 1) // シンボル2つ
    s.players.p1.field.spirits.push(twoSymbolAlly)
    const oneSymbolAlly = createInstance("BS01-007", s.turn, 1) // シンボル1つ
    s.players.p1.field.spirits.push(oneSymbolAlly)
    const attacker = createInstance("BS01-007", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)
    s.players.p1.hand[0] = "BS04-091"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック開始（バトル中にする）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（攻撃側に優先権）")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0 }) === null,
        "フラッシュでライトニングバリスタを使用（対象未指定）",
    )
    assert(twoSymbolAlly.tempBpBuff === 5000, "シンボル2つのジークフリードが自動選択されBP+5000される")
    assert(oneSymbolAlly.tempBpBuff === 0, "シンボル1つのハンマドレイクはminSymbols未達のため対象外")
}

console.log("=== 拡張2: BS04-091 フラッシュ（minSymbols未達のみの場合は不発） ===")
{
    const s = createGame(
        "bs04-091-flash-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const oneSymbolAlly = createInstance("BS01-007", s.turn, 1) // シンボル1つのみ
    s.players.p1.field.spirits.push(oneSymbolAlly)
    const attacker = createInstance("BS01-007", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)
    s.players.p1.hand[0] = "BS04-091"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック開始（バトル中にする）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（攻撃側に優先権）")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0 }) === null,
        "フラッシュでライトニングバリスタを使用（対象になれるスピリットがいない）",
    )
    assert(oneSymbolAlly.tempBpBuff === 0, "シンボル2つ以上のスピリットがいないため誰もBP+5000されない")
    assert(attacker.tempBpBuff === 0, "アタッカー自身もシンボル1つのため対象にならない")
}

console.log("=== 拡張3: BS04-106 グリームホープ（メイン：光芒の一時付与） ===")
{
    const s = createGame(
        "bs04-106-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "purple" },
    )
    runTurnStart(s)
    const attacker = createInstance("BS01-007", s.turn, 1) // ハンマドレイク（光芒を持たない）
    s.players.p1.field.spirits.push(attacker)
    s.players.p1.hand[0] = "BS04-106"
    s.players.p1.reserve = 10
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: attacker.instanceId }) === null,
        "グリームホープでハンマドレイクに光芒を一時付与",
    )
    assert(
        attacker.tempKeywords.some((k) => k.keyword === "kobo"),
        "ハンマドレイクにtempKeywordsとして【光芒】が付与された",
    )
    s.players.p1.hand[0] = "BS01-123" // リターンドロー（フラッシュ：BP+1000、コスト2）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ハンマドレイクでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（攻撃側に優先権が移る）")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0 }) === null,
        "フラッシュでリターンドローを使用",
    )
    assert(s.players.p1.trashCards.includes("BS01-123"), "使用直後はトラッシュにある")
    assert(act(s, "p2", { type: "takeLife" }) === null, "防御側はライフで受ける（バトル終了）")
    assert(
        s.players.p1.hand.includes("BS01-123"),
        "一時付与された【光芒】でリターンドローが手札に戻った",
    )
    assert(!s.players.p1.trashCards.includes("BS01-123"), "トラッシュからは消えている")
}

console.log("パート43 完了")
