// smoke パート49（FieldEvent "ownSpiritSummoned" と maxBpFromSelf）
// 「自分のフィールドに系統◯◯のスピリットが召喚されたとき、召喚されたスピリットのBP以下の相手1体を〜」
//   - BS04-077 七龍帝の玉座 Lv2（古竜/龍帝 → 破壊）
//   - BS04-083 鋼葉の樹林 Lv2（甲獣/巨獣 → 手札に戻す）／Lv1・Lv2 スタートステップの甲獣回収
// self には「召喚されたスピリット」が渡るため、召喚レベルを上げるほど参照BPが上がる
// （召喚レベル指定＝part48 と組み合わせて初めて意味を持つ効果）
import { assert, act, createGame, createInstance, fireStepTriggers, runTurnStart } from "./helpers"

console.log("=== BS04-077 七龍帝の玉座 Lv2: Lv1召喚（BP3000）では BP4000 の相手を破壊できない ===")
{
    const s = createGame("bs04-077-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-077", s.turn, 3)) // 七龍帝の玉座 Lv2
    const enemy = createInstance("BS01-007", s.turn, 1) // ハンマドレイク Lv1 BP4000
    s.players.p2.field.spirits.push(enemy)
    s.players.p1.hand[0] = "BS04-008" // 古竜魔人バ・ゴゥ（古竜。Lv1 BP3000 / Lv2 BP5000）
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "バ・ゴゥをLv1で召喚")
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === enemy.instanceId),
        "召喚されたスピリットのBP3000 < 相手BP4000 なので破壊されない",
    )
}

console.log("=== BS04-077 七龍帝の玉座 Lv2: Lv2召喚（BP5000）なら BP4000 の相手を破壊する ===")
{
    const s = createGame("bs04-077-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-077", s.turn, 3)) // 七龍帝の玉座 Lv2
    const enemy = createInstance("BS01-007", s.turn, 1) // ハンマドレイク Lv1 BP4000
    s.players.p2.field.spirits.push(enemy)
    s.players.p1.hand[0] = "BS04-008"
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0, level: 2 }) === null, "バ・ゴゥをLv2で召喚")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === enemy.instanceId),
        "召喚レベルを上げるとBP5000となり、BP4000の相手を破壊できる",
    )
}

console.log("=== BS04-077 Lv1では発揮されない／系統が違えば発火しない ===")
{
    const s = createGame("bs04-077-negative", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-077", s.turn, 0)) // 玉座 Lv1（効果はLv2のみ）
    const enemy = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(enemy)
    s.players.p1.hand[0] = "BS04-008"
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0, level: 2 }) === null, "玉座Lv1のもとで古竜を召喚")
    assert(s.players.p2.field.spirits.length === 1, "ネクサスがLv1なので発火しない")

    s.players.p1.field.nexuses[0]!.cores = 3 // 玉座をLv2にする
    s.players.p1.hand[0] = "BS01-001" // ゴラドン（爬獣＝古竜/龍帝いずれでもない）
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "系統が一致しないスピリットを召喚")
    assert(s.players.p2.field.spirits.length === 1, "系統が一致しないため発火しない")
}

console.log("=== BS04-083 鋼葉の樹林 Lv2: 甲獣/巨獣の召喚でBP以下の相手を手札に戻す（OR配列） ===")
{
    const s = createGame("bs04-083-kouju", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-083", s.turn, 3)) // 鋼葉の樹林 Lv2
    const weak = createInstance("BS01-007", s.turn, 1) // ハンマドレイク Lv1 BP4000（4000以下）
    const strong = createInstance("BS01-016", s.turn, 1) // スケルトン・ジョウ Lv1 BP5000（4000超）
    s.players.p2.field.spirits.push(strong)
    s.players.p2.field.spirits.push(weak)
    const handBefore = s.players.p2.hand.length
    s.players.p1.hand[0] = "BS04-037" // 鎧装獣ヘイズ・ルーン（甲獣。Lv1 BP4000）
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "甲獣スピリットを召喚")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === weak.instanceId), "BP4000の相手は手札に戻る")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === strong.instanceId), "BP5000の相手は対象外で場に残る")
    assert(s.players.p2.hand.length === handBefore + 1, "相手の手札が1枚増える")
}
{
    const s = createGame("bs04-083-kyoju", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-083", s.turn, 3)) // 鋼葉の樹林 Lv2
    const enemy = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(enemy)
    s.players.p1.hand[0] = "BS01-058" // ヘラクレス・ジオ（巨獣。Lv1 BP4000）
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "巨獣スピリットを召喚")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === enemy.instanceId), "OR配列のもう一方（巨獣）でも発火する")
}

console.log("=== BS04-083 Lv1・Lv2: 自分のスタートステップに甲獣スピリットをトラッシュから回収 ===")
{
    const s = createGame("bs04-083-start", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-083", s.turn, 0)) // 鋼葉の樹林 Lv1
    // 甲獣を先に、非該当（爬獣）を後ろに積む。自動選択は末尾からだが、系統フィルタで甲獣まで遡る必要がある
    s.players.p1.trashCards = ["BS04-037", "BS01-001"]
    s.players.p1.hand = []
    fireStepTriggers(s, "start")
    assert(s.players.p1.hand.includes("BS04-037"), "甲獣の鎧装獣ヘイズ・ルーンが手札に戻る")
    assert(s.players.p1.trashCards.includes("BS01-001"), "系統が一致しないゴラドンはトラッシュに残る")
}

console.log("パート49 完了")
