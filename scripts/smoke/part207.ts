// smoke パート207（BS03-133 ハイエリクサー：マジックの「(この効果はターンに1回しか使えない)」）
//
// 確定済みの仕様（2026-08-16 ユーザー確認）:
//   - 制限は使用者ごと・cardIdごとに「そのターン1回」
//   - 2枚目は使用自体はできる（コストは払う）が、効果が発揮されない（ログを出す）
//   - 相手が同じカードを使うのは別勘定
import { act, assert, createGame, createInstance, endTurn, getCard, runTurnStart } from "./helpers"

const HAI_ELIXIR = "BS03-133" // ハイエリクサー（白マジック。フラッシュ：リザーブからライフにコア2個。ターンに1回）

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    const card = getCard(HAI_ELIXIR)
    assert(card.name === "ハイエリクサー" && card.type === "magic", "BS03-133 はハイエリクサー（マジック）")
    assert(card.colors[0] === "white" && card.cost === 8, "ハイエリクサーは白・コスト8")
    assert(
        card.effects.some((e) => e.kind === "magic" && e.oncePerTurn === true),
        "エントリに oncePerTurn:true が付与されている",
    )
}

console.log("=== BS03-133 ハイエリクサー：1枚目でライフにコア2個 ===")
{
    const s = createGame("bs03-133-a-test", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "blue" })
    runTurnStart(s)
    s.players.p1.hand[0] = HAI_ELIXIR
    s.players.p1.reserve = 30

    const life0 = s.players.p1.life
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "1枚目の使用は成功")
    assert(s.players.p1.life === life0 + 2, "ライフにコア2個が置かれた")
}

console.log("=== BS03-133 ハイエリクサー：同じターンに2枚目を使ってもライフは増えない ===")
{
    const s = createGame("bs03-133-b-test", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "blue" })
    runTurnStart(s)
    s.players.p1.hand[0] = HAI_ELIXIR
    s.players.p1.hand[1] = HAI_ELIXIR
    s.players.p1.reserve = 30

    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "1枚目の使用は成功")
    const lifeAfterFirst = s.players.p1.life
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "2枚目も使用自体は成功する（コストは払う）")
    assert(s.players.p1.life === lifeAfterFirst, "2枚目ではライフが増えない")
    assert(
        s.log.some((l) => l.includes("この効果はターンに1回しか使えないため、発揮されなかった")),
        "ログに「ターンに1回」の不発ログが出る",
    )
}

console.log("=== BS03-133 ハイエリクサー：相手が使うぶんは別勘定 ===")
{
    const s = createGame("bs03-133-c-test", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "white" })
    runTurnStart(s)
    const atk = createInstance("BS01-001", s.turn, 1) // ゴラドン（アタック役。相手に優先権を渡すためだけに使う）
    s.players.p1.field.spirits.push(atk)
    s.players.p1.hand[0] = HAI_ELIXIR
    s.players.p1.reserve = 30
    s.players.p2.hand[0] = HAI_ELIXIR
    s.players.p2.reserve = 30

    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "p1が自分のメインステップで使用")
    const p1LifeAfterFirst = s.players.p1.life

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "p1がアタック宣言（優先権はp2へ）")

    const p2Life0 = s.players.p2.life
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0 }) === null,
        "p2はフラッシュで自分のぶんを使用できる（同じ state.turn でもp1とは別勘定）",
    )
    assert(s.players.p2.life === p2Life0 + 2, "p2のライフにコア2個が置かれた")
    assert(s.players.p1.life === p1LifeAfterFirst, "p1のライフは変化しない")
}

console.log("=== BS03-133 ハイエリクサー：次のターンにはまた発揮できる ===")
{
    const s = createGame("bs03-133-d-test", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "blue" })
    runTurnStart(s)
    s.players.p1.hand[0] = HAI_ELIXIR
    s.players.p1.reserve = 30

    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "1枚目の使用は成功")
    const lifeAfterFirst = s.players.p1.life

    endTurn(s) // p1 → p2
    endTurn(s) // p2 → p1

    s.players.p1.hand[0] = HAI_ELIXIR
    s.players.p1.reserve = 30
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "次のp1ターンでの使用は成功")
    assert(s.players.p1.life === lifeAfterFirst + 2, "次のターンにはまたライフにコア2個が置かれる")
}
