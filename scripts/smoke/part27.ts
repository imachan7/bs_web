// smoke パート27（BS03【粉砕】連動バッチ：修理屋バラン・バラン／斬竜刀のガイ／崩壊する戦線／士気高き大本営）
// 収録セクション:
//   - funsaiBonus: BS03-115 崩壊する戦線Lv1で【粉砕】の破棄枚数+2
//   - fieldEvent ownFunsaiMilled + repeatPerCount:true: BS03-086 修理屋バラン・バランが破棄枚数ぶんコアを得る
//   - fieldEvent ownFunsaiMilled（repeatPerCount省略=1回のみ）: BS03-117 士気高き大本営Lv2でコア+1（枚数に関わらず1回）
//   - funsaiOnBlock: BS03-117 士気高き大本営Lv1でブロック時にも【粉砕】が発揮される
//   - levelAs target:"ownSpiritsByKeyword" treatAs:"max" + condition anyFieldHasColorSpirit: BS03-090 斬竜刀のガイ
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    runTurnStart,
} from "./helpers"

console.log("=== funsaiBonus：BS03-115 崩壊する戦線Lv1で【粉砕】の破棄枚数+2 ===")
{
    const s = createGame(
        "funsaibonus-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const razarus = createInstance("BS03-076", s.turn, 1) // 爪剣のラザラス Lv1（粉砕）
    const kaihou = createInstance("BS03-115", s.turn, 0) // 崩壊する戦線 Lv1（cores0）
    s.players.p1.field.spirits.push(razarus)
    s.players.p1.field.nexuses.push(kaihou)
    const deckBefore = s.players.p2.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: razarus.instanceId }) === null,
        "ラザラスでアタック（粉砕発動）",
    )
    assert(
        s.players.p2.deck.length === deckBefore - 3,
        "崩壊する戦線の+2で本来1枚のところ3枚破棄される",
    )
}

console.log("=== ownFunsaiMilled repeatPerCount:true：BS03-086 修理屋バラン・バランが破棄枚数ぶんコアを得る ===")
{
    const s = createGame(
        "baranbaran-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const razarus = createInstance("BS03-076", s.turn, 2) // Lv2（粉砕2枚）
    const baran = createInstance("BS03-086", s.turn, 1) // 修理屋バラン・バラン Lv1
    const greenNexus = createInstance("BS01-106", s.turn, 0) // 隠されたる賢者の樹（緑ネクサス）
    s.players.p1.field.spirits.push(razarus)
    s.players.p1.field.nexuses.push(baran, greenNexus)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: razarus.instanceId }) === null,
        "ラザラスでアタック（粉砕2枚発動）",
    )
    assert(
        baran.cores === 3,
        "repeatPerCountにより破棄枚数(2)ぶんコアが置かれる（1→3）",
    )
}

console.log("=== ownFunsaiMilled（repeatPerCount省略）：BS03-117 士気高き大本営Lv2はコア+1で固定（枚数に依らず1回） ===")
{
    const s = createGame(
        "daihonei-e2-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const razarus = createInstance("BS03-076", s.turn, 2) // Lv2（粉砕2枚）
    const daihonei = createInstance("BS03-117", s.turn, 3) // 士気高き大本営 Lv2（cores3）
    s.players.p1.field.spirits.push(razarus)
    s.players.p1.field.nexuses.push(daihonei)
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: razarus.instanceId }) === null,
        "ラザラスでアタック（粉砕2枚発動）",
    )
    assert(
        s.players.p1.reserve === reserveBefore + 1,
        "repeatPerCount省略のため2枚破棄でもリザーブ+1のみ（+2にならない）",
    )
}

console.log("=== funsaiOnBlock：BS03-117 士気高き大本営Lv1でブロック時にも【粉砕】が発揮される ===")
{
    const s = createGame(
        "funsaionblock-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    runTurnStart(s)
    const atk = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1（非粉砕・単なる攻撃側）
    s.players.p1.field.spirits.push(atk)
    const razarus = createInstance("BS03-076", s.turn, 1) // Lv1（粉砕1枚）
    const daihonei = createInstance("BS03-117", s.turn, 0) // 士気高き大本営 Lv1（cores0）
    s.players.p2.field.spirits.push(razarus)
    s.players.p2.field.nexuses.push(daihonei)
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ゴラドンでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(
        act(s, "p2", { type: "block", instanceId: razarus.instanceId }) === null,
        "ラザラスでブロック（funsaiOnBlockにより粉砕発動）",
    )
    assert(
        s.players.p1.deck.length === deckBefore - 1,
        "ブロック時にも粉砕が発揮され、攻撃側（p1）のデッキが1枚破棄される",
    )
}

console.log("=== levelAs \"max\"：BS03-090 斬竜刀のガイ（赤スピリット条件の成立/不成立） ===")
{
    const s = createGame(
        "gai-levelas-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const gai = createInstance("BS03-090", s.turn, 1) // 斬竜刀のガイ
    const razarus = createInstance("BS03-076", s.turn, 1) // Lv1（本来は1枚破棄）最高Lvは3
    s.players.p1.field.spirits.push(gai, razarus)

    const deckBeforeNoCondition = s.players.p2.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        currentLevel(razarus).level === 1,
        "赤スピリットがいない間はガイの効果は無効（通常Lv1のまま）",
    )
    assert(
        act(s, "p1", { type: "attack", instanceId: razarus.instanceId }) === null,
        "赤スピリット不在でラザラスでアタック",
    )
    assert(
        s.players.p2.deck.length === deckBeforeNoCondition - 1,
        "条件不成立時は通常どおりLv1ぶん(1枚)だけ破棄される",
    )
}
{
    const s = createGame(
        "gai-levelas-test2",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const gai = createInstance("BS03-090", s.turn, 1) // 斬竜刀のガイ
    const razarus = createInstance("BS03-076", s.turn, 1) // Lv1（最高Lvは3）
    const redSpirit = createInstance("BS01-001", s.turn, 1) // ゴラドン（赤スピリット。条件用）
    s.players.p1.field.spirits.push(gai, razarus, redSpirit)

    const deckBefore = s.players.p2.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        currentLevel(razarus).level === 3,
        "赤スピリットがいる間、粉砕持ちのラザラスは最高Lv(3)として扱われる（攻撃ステップで再計算済み）",
    )
    assert(
        act(s, "p1", { type: "attack", instanceId: razarus.instanceId }) === null,
        "赤スピリットがいる状態でラザラスでアタック",
    )
    assert(
        s.players.p2.deck.length === deckBefore - 3,
        "最高Lv(3)扱いにより3枚破棄される",
    )
}
