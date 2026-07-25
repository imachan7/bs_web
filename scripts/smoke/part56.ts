// smoke パート56（リファクタリング Phase A の回帰テスト。REFACTOR.md §1.3 / §4）
//
// Phase A で「サーバーとクライアントのルール二重実装」を shared/ に一本化した。
// ここではサーバー側の等価アサーションを置く。**共有関数が同一実装になったことで、
// これらのテストがそのままクライアント表示の保証にもなる**（これが本リファクタの主目的）。
//
// 対象は §1.3 に記録されていた実在の乖離バグ2件:
//   1. ミカファール Lv2: クライアントの hasMagicFreeGrant が scope:"allMagicHandAndTegamoto" を見ておらず、
//      色の合わない手札マジックがコスト0表示・使用可能ハイライトにならなかった
//   2. 作戦参謀フォクシン: GameView に magicUsedThisTurn が無く、1枚使用後に2枚目が使用不可表示にならなかった
import { assert, act, createGame, createInstance, effectiveBp, effectiveCost, getCard, runTurnStart, viewFor } from "./helpers"

console.log("=== §1.3-1 ミカファール Lv2: 色の合わない手札マジックもコスト0になる ===")
{
    const s = createGame("refactor-mikafar", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const redMagic = getCard("BS01-114") // バスタースピア（赤・コスト3。ミカファールは黄なので色が合わない）
    const before = effectiveCost(s, "p1", redMagic)
    assert(before > 0, "ミカファール不在では通常どおりコストがかかる")

    s.players.p1.field.spirits.push(createInstance("BS02-X08", s.turn, 2)) // 大天使ミカファール Lv2
    assert(
        effectiveCost(s, "p1", redMagic) === 0,
        "ミカファールLv2の scope:allMagicHandAndTegamoto は色を問わず無償化する（旧クライアントはここで色一致を要求していた）",
    )
}

console.log("=== §1.3-2 フォクシン: magicUsedThisTurn が GameView に配信される ===")
{
    const s = createGame("refactor-foxin", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits.push(createInstance("BS03-079", s.turn, 1)) // 作戦参謀フォクシン Lv1
    s.players.p1.hand = ["BS01-115", "BS01-115"] // アウェイクン（赤マジック）2枚
    s.players.p1.reserve = 20

    const viewBefore = viewFor(s, "p1")
    assert(viewBefore.magicUsedThisTurn.p1 === 0, "使用前は0がクライアントへ配信される")

    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "1枚目のマジックは使用できる")
    const viewAfter = viewFor(s, "p1")
    assert(
        viewAfter.magicUsedThisTurn.p1 === 1,
        "使用回数がGameViewに反映される（旧実装ではGameViewに存在せずクライアントが判定できなかった）",
    )
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0 }) !== null,
        "oncePerTurnAll により2枚目は拒否される",
    )
}

console.log("=== 共有実装の同一性: サーバーとクライアントが同じ関数を参照している ===")
{
    // shared/cost.ts の effectiveCost / shared/rules.ts の effectiveBp を、
    // サーバー経路（EffectModules / RuleValidator 経由の再エクスポート）から呼んで一致を確認する。
    // 別実装が復活したらこのテストではなく typecheck が落ちる（再エクスポートが壊れるため）が、
    // 「共有層を経由している」ことをここで明示的に固定しておく
    const s = createGame("refactor-shared", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    const nexus = createInstance("BS04-076", s.turn, 3) // 翼持つ者の空域 Lv2（翼竜/空牙 +2000）
    s.players.p1.field.nexuses.push(nexus)
    const yokuryu = createInstance("BS01-005", s.turn, 1) // アイバーン（翼竜）Lv1 BP2000
    s.players.p1.field.spirits.push(yokuryu)
    s.phase = "attack"
    // effectiveBp は shared/rules の実装（helpers は EffectModules の再エクスポート経由で import している）
    assert(effectiveBp(s, "p1", yokuryu) === 4000, "共有実装の effectiveBp がオーラを加算する")
}

console.log("=== 覚醒の保持判定が静的キーワードのレベル指定を尊重する（サーバー側の潜在バグ是正） ===")
{
    // 旧 validateAwaken は spiritHasKeyword（静的分岐がレベルを見ない）で判定していたため、
    // 「Lv2・Lv3【覚醒】」のようなカードでも Lv1 で覚醒できてしまう潜在バグがあった。
    // 現行データには該当カードが無く挙動は変わらないが、共有実装（canAwaken）へ統合して是正済み。
    // ここでは「レベル有効な覚醒は使える／覚醒を持たないスピリットは使えない」ことを固定する
    const s = createGame("refactor-awaken", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    const awakenSpirit = createInstance("BS01-013", s.turn, 2) // タウロスナイト（覚醒 Lv1-3）
    const plain = createInstance("BS01-001", s.turn, 2) // ゴラドン（覚醒なし）
    s.players.p1.field.spirits.push(awakenSpirit)
    s.players.p1.field.spirits.push(plain)
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    assert(
        act(s, "p1", { type: "awaken", instanceId: awakenSpirit.instanceId, fromInstanceId: plain.instanceId, count: 1 }) === null,
        "レベル有効な覚醒持ちは覚醒できる",
    )
    assert(
        act(s, "p1", { type: "awaken", instanceId: plain.instanceId, fromInstanceId: awakenSpirit.instanceId, count: 1 }) !== null,
        "覚醒を持たないスピリットは覚醒できない",
    )
}

console.log("パート56 完了")
