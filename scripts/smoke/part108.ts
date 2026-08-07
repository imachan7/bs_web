// smoke パート108（疲労の一元化 ＋ 「スピリットが疲労したとき」誘発の3枚）
// 新設した機構:
//   - EffectModules.exhaustSpirit（疲労の唯一の入口。13箇所に散っていた isRested = true を集約）
//   - FieldEvent "ownSpiritExhausted" / "anySpiritExhausted"（self＝疲労したスピリット）
//   - fieldEvent の eventTargetIsSelf（「**この**スピリットが疲労したとき」。スクルディア）
//   - fieldEvent の familyFilter を、疲労イベントでは継続付与された系統も見て判定する
//   - action "markNoRefreshTarget" ＋ CardInstance.noRefreshTargetInstanceId
// 実装したカード:
//   - BS05-057 藍紫の虚空 Lv1･Lv2（コスト1以下が疲労したとき、そのコア2個を持ち主のトラッシュへ）
//   - BS02-082 生み出される尖兵 Lv2（「武装」を持つ自分のスピリットが疲労するたびボイドからリザーブへ1個）
//   - BS02-042 スクルディア Lv2･Lv3（自身が疲労したとき、相手の疲労スピリット1体を回復不可にする）
import {
    assert,
    act,
    createGame,
    createInstance,
    engineRunTurnStart,
    getCard,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS05-057").name === "藍紫の虚空", "BS05-057 は藍紫の虚空")
    assert(getCard("BS02-082").name === "生み出される尖兵", "BS02-082 は生み出される尖兵")
    assert(getCard("BS02-042").name === "スクルディア", "BS02-042 はスクルディア")
    assert(getCard("BS01-002").name === "ロクケラトプス" && getCard("BS01-002").cost === 1, "BS01-002 はコスト1のロクケラトプス")
    assert(getCard("BS01-077").name === "ベビー・ロキ" && getCard("BS01-077").cost === 2, "BS01-077 はコスト2のベビー・ロキ")
    assert(getCard("BS02-039").name === "神機ミョルニール", "BS02-039 は神機ミョルニール")
}

console.log("=== BS05-057 藍紫の虚空 Lv1：アタック宣言の疲労でもコスト1以下ならコア2個がトラッシュへ ===")
{
    const s = createGame("bs05-057-attack", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS05-057", 0) // Lv1
    const rokke = putSpirit(s, "p1", "BS01-002", 3) // ロクケラトプス（コスト1）Lv3＝コア3
    const trashBefore = s.players.p1.trashCores
    assert(act(s, "p1", { type: "attack", instanceId: rokke.instanceId }) === null, "アタックできる")
    assert(rokke.cores === 1, `疲労したコスト1のスピリットからコア2個が抜ける（実際${rokke.cores}）`)
    assert(
        s.players.p1.trashCores === trashBefore + 2,
        `抜けたコア2個は持ち主のトラッシュへ（実際${s.players.p1.trashCores - trashBefore}）`,
    )
}

console.log("=== BS05-057：相手のスピリットが疲労したときも発火する（anySpiritExhausted） ===")
{
    const s = createGame("bs05-057-opponent", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS05-057", 0)
    const src = putSpirit(s, "p1", "BS01-001", 1)
    const victim = putSpirit(s, "p2", "BS01-002", 3) // 相手のコスト1
    const trashBefore = s.players.p2.trashCores
    resolveAction(s, "p1", src, { type: "exhaust", count: 1 })
    assert(victim.isRested === true, "相手のスピリットが疲労した")
    assert(victim.cores === 1, `相手のスピリットからもコア2個が抜ける（実際${victim.cores}）`)
    assert(
        s.players.p2.trashCores === trashBefore + 2,
        "抜けたコアは**持ち主（相手）**のトラッシュへ置かれる",
    )
}

console.log("=== BS05-057：コスト2以上は対象外／アタックステップ以外では発火しない ===")
{
    const s = createGame("bs05-057-filters", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS05-057", 0)
    const src = putSpirit(s, "p1", "BS01-001", 1)
    const big = putSpirit(s, "p2", "BS01-077", 3) // コスト2
    resolveAction(s, "p1", src, { type: "exhaust", count: 1 })
    assert(big.isRested === true && big.cores === 3, "コスト2のスピリットはコアを失わない（costFilter max:1）")

    // メインステップでは発火しない（『お互いのアタックステップ』限定）
    s.phase = "main"
    const small = putSpirit(s, "p2", "BS01-002", 3)
    resolveAction(s, "p1", src, { type: "exhaust", count: 1 })
    assert(small.isRested === true, "メインステップでも疲労自体はする")
    assert(small.cores === 3, "アタックステップ以外では藍紫の虚空は発火しない")
}

console.log("=== BS02-082 生み出される尖兵 Lv2：武装が疲労するたびボイドからリザーブへコア1個 ===")
{
    const s = createGame("bs02-082-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS02-082", 2) // Lv2
    // ベビー・ロキ（白・コスト2）は静的には「武装」を持たない。Lv1の familyGrant で付与される
    const loki = putSpirit(s, "p1", "BS01-077", 2)
    assert(!getCard("BS01-077").family.includes("武装"), "ベビー・ロキは静的には武装を持たない（付与経路の検証）")
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "attack", instanceId: loki.instanceId }) === null, "アタックできる")
    assert(
        s.players.p1.reserve === reserveBefore + 1,
        `継続付与された「武装」でも発火してリザーブが1増える（実際${s.players.p1.reserve - reserveBefore}）`,
    )
}

console.log("=== BS02-082 Lv2：武装を持たない自分のスピリットが疲労しても増えない ===")
{
    const s = createGame("bs02-082-nofamily", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS02-082", 2)
    const plain = putSpirit(s, "p1", "BS01-001", 1) // 赤・コスト0＝Lv1の付与条件（白・コスト2）に合わない
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "attack", instanceId: plain.instanceId }) === null, "アタックできる")
    assert(s.players.p1.reserve === reserveBefore, "武装を持たないスピリットの疲労では増えない")
}

console.log("=== BS02-082 Lv1のみ（Lv2未満）では疲労してもコアを得ない ===")
{
    const s = createGame("bs02-082-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS02-082", 0) // Lv1
    const mjolnir = putSpirit(s, "p1", "BS02-039", 2) // 静的に「武装」を持つ
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "attack", instanceId: mjolnir.instanceId }) === null, "アタックできる")
    assert(s.players.p1.reserve === reserveBefore, "Lv1では発火しない（levels:[2]）")
}

console.log("=== BS02-042 スクルディア Lv2：自身が疲労したとき、相手の疲労スピリット1体を回復不可にする ===")
{
    const s = createGame("bs02-042-mark", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const skrudia = putSpirit(s, "p1", "BS02-042", 2) // Lv2
    const marked = putSpirit(s, "p2", "BS01-002", 3) // 相手の疲労スピリット（BP最大側）
    const other = putSpirit(s, "p2", "BS01-001", 1)
    marked.isRested = true
    other.isRested = true
    // p2 の効果でスクルディアを疲労させる（＝「このスピリットが疲労したとき」を起こす）
    const p2src = putSpirit(s, "p2", "BS01-050", 1)
    resolveAction(s, "p2", p2src, { type: "exhaust", count: 1 })
    assert(skrudia.isRested === true, "スクルディアが疲労した")
    assert(
        skrudia.noRefreshTargetInstanceId === marked.instanceId,
        "相手の疲労スピリット（実効BP最大）を指定した",
    )

    // p2 のリフレッシュステップ：指定されたスピリットだけ回復しない
    s.turnPlayer = "p2"
    s.turn = 1
    engineRunTurnStart(s)
    assert(marked.isRested === true, "指定されたスピリットは回復しない")
    assert(!other.isRested, "指定されていないスピリットは通常どおり回復する")

    // スクルディアが回復すると縛りは解ける
    skrudia.isRested = false
    s.turnPlayer = "p2"
    s.turn = 1
    engineRunTurnStart(s)
    assert(!marked.isRested, "指定元が回復状態になれば、指定されたスピリットも回復する")
}

console.log("=== BS02-042 Lv1では指定しない（levels:[2,3]） ===")
{
    const s = createGame("bs02-042-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const skrudia = putSpirit(s, "p1", "BS02-042", 1) // Lv1
    const marked = putSpirit(s, "p2", "BS01-002", 3)
    marked.isRested = true
    const p2src = putSpirit(s, "p2", "BS01-050", 1)
    resolveAction(s, "p2", p2src, { type: "exhaust", count: 1 })
    assert(skrudia.isRested === true, "スクルディアが疲労した")
    assert(skrudia.noRefreshTargetInstanceId === undefined, "Lv1では指定が発生しない")
}

console.log("=== 疲労の一元化：すでに疲労している個体を疲労させ直しても誘発しない ===")
{
    const s = createGame("exhaust-idempotent", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS05-057", 0)
    const src = putSpirit(s, "p1", "BS01-001", 1)
    const victim = putSpirit(s, "p2", "BS01-002", 3)
    resolveAction(s, "p1", src, { type: "exhaust", count: 1 })
    assert(victim.cores === 1, "1回目の疲労でコア2個が抜ける")
    resolveAction(s, "p1", src, { type: "exhaust", count: 1 })
    assert(victim.cores === 1, "すでに疲労している個体には再発火しない")
}
