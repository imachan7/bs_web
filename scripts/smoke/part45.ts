// smoke パート45（BS04構造化スキップ解消・エンジン拡張バッチ3の検証）
// 拡張A: triggered condition ownFieldHasKeyword — BS04-001 クナノミ（覚醒持ちがいるときアタック時BP+2000）
// 拡張B: exhaustAll{side,minBp,maxBp} — BS04-099 グラウンドハウリング main（BP4000以上の相手を疲労）
// 拡張C: returnAllToHand{side,costFilter} — BS04-102 ドリームハンド（両陣営コスト1以下を手札へ）
// 拡張D: refreshByFamily{familyFilter(OR),count} — BS04-103 ハイエーテル（巨獣/甲獣を3体回復）
// 拡張E: trashCoresToKeywordSpirit{keyword} — BS04-089 グレートリンク（トラッシュのコアを覚醒スピリットへ）
import { assert, act, createGame, createInstance, resolveAction, runTurnStart } from "./helpers"

console.log("=== 拡張A: BS04-001 クナノミ（覚醒持ちがいればアタック時BP+2000／いなければ発動しない） ===")
{
    const s = createGame("bs04-001-ok", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    const clanomi = createInstance("BS04-001", s.turn, 1) // クナノミ Lv1
    s.players.p1.field.spirits.push(clanomi)
    const awakenAlly = createInstance("BS01-013", s.turn, 1) // タウロスナイト（覚醒持ち）
    s.players.p1.field.spirits.push(awakenAlly)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: clanomi.instanceId }) === null, "クナノミでアタック")
    assert(clanomi.tempBpBuff === 2000, "覚醒持ちが自陣にいるためBP+2000が発動")
}
{
    const s = createGame("bs04-001-ng", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    const clanomi = createInstance("BS04-001", s.turn, 1)
    s.players.p1.field.spirits.push(clanomi)
    const plainAlly = createInstance("BS01-001", s.turn, 1) // ゴラドン（覚醒なし）
    s.players.p1.field.spirits.push(plainAlly)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: clanomi.instanceId }) === null, "クナノミでアタック")
    assert(clanomi.tempBpBuff === 0, "覚醒持ちがいないためBP+2000は発動しない")
}

console.log("=== 拡張B: BS04-099 グラウンドハウリング main（BP4000以上の相手を疲労。シンボル2条件） ===")
{
    const s = createGame("bs04-099", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const twoSymbol = createInstance("BS04-X13", s.turn, 1) // 魔龍帝ジークフリード（シンボル2つ＝条件達成用）
    s.players.p1.field.spirits.push(twoSymbol)
    const bigEnemy = createInstance("BS01-007", s.turn, 1) // ハンマドレイク Lv1 BP4000（4000以上）
    s.players.p2.field.spirits.push(bigEnemy)
    const smallEnemy = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000（4000未満）
    s.players.p2.field.spirits.push(smallEnemy)
    s.players.p1.hand[0] = "BS04-099"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "グラウンドハウリングを使用")
    assert(bigEnemy.isRested, "BP4000以上のハンマドレイクは疲労する")
    assert(!smallEnemy.isRested, "BP4000未満のゴラドンは疲労しない")
}

console.log("=== 拡張C: BS04-102 ドリームハンド（両陣営コスト1以下を手札へ） ===")
{
    const s = createGame("bs04-102", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const myCheap = createInstance("BS01-001", s.turn, 1) // ゴラドン コスト0（自分）
    s.players.p1.field.spirits.push(myCheap)
    const enemyCheap = createInstance("BS01-002", s.turn, 1) // ロクケラトプス コスト1以下（相手）
    s.players.p2.field.spirits.push(enemyCheap)
    const enemyBig = createInstance("BS01-007", s.turn, 1) // ハンマドレイク コスト3（相手・対象外）
    s.players.p2.field.spirits.push(enemyBig)
    s.players.p1.hand = ["BS04-102"]
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ドリームハンドを使用")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === myCheap.instanceId), "自分のコスト0スピリットが手札へ")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === enemyCheap.instanceId), "相手のコスト1以下スピリットが手札へ")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === enemyBig.instanceId), "コスト3の相手スピリットは残る")
}

console.log("=== 拡張D: BS04-103 ハイエーテル（巨獣/甲獣を3体回復。OR配列） ===")
{
    const s = createGame("bs04-103", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const kyoju = createInstance("BS01-088", s.turn, 1) // タワーミットクラブ（巨獣）
    const koju = createInstance("BS01-081", s.turn, 1) // 銀燐竜ニーズホッグ（甲獣）
    const kyoju2 = createInstance("BS01-058", s.turn, 1) // ヘラクレス・ジオ（巨獣）
    const other = createInstance("BS01-001", s.turn, 1) // ゴラドン（爬獣・対象外）
    for (const sp of [kyoju, koju, kyoju2, other]) {
        sp.isRested = true
        s.players.p1.field.spirits.push(sp)
    }
    s.players.p1.hand = ["BS04-103"]
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ハイエーテルを使用")
    assert(!kyoju.isRested && !koju.isRested && !kyoju2.isRested, "巨獣2体・甲獣1体の計3体が回復（OR配列）")
    assert(other.isRested, "系統不一致のゴラドンは回復しない")
}

console.log("=== 拡張E: BS04-089 グレートリンク（トラッシュのコアを覚醒スピリットへ。actionを直接検証） ===")
{
    const s = createGame("bs04-089", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    const awakenSpirit = createInstance("BS01-013", s.turn, 1) // タウロスナイト（覚醒）コア1個
    s.players.p1.field.spirits.push(awakenSpirit)
    s.players.p1.trashCores = 3
    const before = awakenSpirit.cores
    resolveAction(s, "p1", null, { type: "trashCoresToKeywordSpirit", keyword: "awaken" }, undefined, ["red"], "magic")
    assert(awakenSpirit.cores === before + 3, "トラッシュのコア3個が覚醒スピリットへ置かれる")
    assert(s.players.p1.trashCores === 0, "トラッシュのコアは0になる")
}

console.log("パート45 完了")
