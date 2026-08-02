// smoke パート21（第三弾 BS03 緑・白カードの効果構造化バッチ）
import {
    act,
    assert,
    createGame,
    createInstance,
    draw,
    effectiveBp,
    hasKeyword,
    runTurnStart,
} from "./helpers"
import { hasArmorAgainst } from "../../server/src/logic/EffectModules"

console.log("=== BS03-028 モグランナー：【神速】＋相手ドロー時に回復 ===")
{
    const s = createGame(
        "bs03-028-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    assert(hasKeyword("BS03-028", "soku"), "モグランナーは【神速】を持つ")
    const mogu = createInstance("BS03-028", s.turn, 3) // Lv2 cores3 bp4000
    s.players.p1.field.spirits.push(mogu)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: mogu.instanceId }) === null, "モグランナーでアタック（疲労させる）")
    assert(mogu.isRested === true, "アタック宣言で疲労状態になる")
    draw(s, "p2", 1)
    assert(mogu.isRested === false, "相手（p2）のドローでLv2のモグランナーが回復した")
}

console.log("=== BS03-034 闘鶏ビシャモン：Lv2/3で系統「爪鳥」自身+1000 ===")
{
    const s = createGame(
        "bs03-034-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const bishaLv1 = createInstance("BS03-034", s.turn, 1) // Lv1 cores1 bp5000（オーラ対象外）
    s.players.p1.field.spirits.push(bishaLv1)
    assert(effectiveBp(s, "p1", bishaLv1) === 5000, "Lv1ではオーラなし（BP5000のまま）")

    const s2 = createGame(
        "bs03-034-test2",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s2)
    const bishaLv2 = createInstance("BS03-034", s2.turn, 3) // Lv2 cores3 bp7000
    s2.players.p1.field.spirits.push(bishaLv2)
    assert(effectiveBp(s2, "p1", bishaLv2) === 8000, "Lv2では自身が系統「爪鳥」としてBP+1000（7000→8000）")
}

console.log("=== BS03-037 ラタトスカ／BS03-044 鋼人スルト：【装甲】色の実装確認 ===")
{
    const s = createGame(
        "bs03-037-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const rata = createInstance("BS03-037", s.turn, 1) // Lv1 cores1
    s.players.p1.field.spirits.push(rata)
    assert(hasArmorAgainst(rata, ["red"]) === true, "ラタトスカは赤の効果を受けない")
    assert(hasArmorAgainst(rata, ["purple"]) === false, "ラタトスカは紫の効果を防げない")

    const surtLv1 = createInstance("BS03-044", s.turn, 1) // Lv1 cores1：装甲は赤/白のみ
    s.players.p1.field.spirits.push(surtLv1)
    assert(hasArmorAgainst(surtLv1, ["red"]) === true, "鋼人スルトLv1は赤の効果を受けない")
    assert(hasArmorAgainst(surtLv1, ["purple"]) === false, "鋼人スルトLv1はまだ紫を防げない")

    const surtLv2 = createInstance("BS03-044", s.turn, 3) // Lv2 cores3：装甲が赤/紫/白に拡大
    s.players.p1.field.spirits.push(surtLv2)
    assert(hasArmorAgainst(surtLv2, ["purple"]) === true, "鋼人スルトLv2は紫の効果も受けない")
}

console.log("=== BS03-039 笛吹きのヘイムダル：Lv2ブロック時にフラッシュ封印 ===")
{
    const s = createGame(
        "bs03-039-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const atk = createInstance("BS01-001", s.turn, 1) // ゴラドン：BP1000
    const heimdal = createInstance("BS03-039", s.turn, 2) // Lv2 cores2 bp4000
    s.players.p1.field.spirits.push(atk)
    s.players.p2.field.spirits.push(heimdal)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ゴラドンでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: heimdal.instanceId }) === null, "ヘイムダルでブロック")
    assert(s.battle?.flashLockedPlayer === "p1", "ブロック時に相手（攻撃側）のフラッシュが封印される")
}

console.log("=== BS03-048 鎧蛇竜ミッドガルズ：Lv2ブロック勝利時に回復 ===")
{
    const s = createGame(
        "bs03-048-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const atk = createInstance("BS01-001", s.turn, 1) // ゴラドン：BP1000
    const midgard = createInstance("BS03-048", s.turn, 5) // Lv2 cores5 bp9000
    s.players.p1.field.spirits.push(atk)
    s.players.p2.field.spirits.push(midgard)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ゴラドンでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: midgard.instanceId }) === null, "ミッドガルズでブロック")
    midgard.isRested = true as boolean // バトル解決前に疲労させておき、回復を検証しやすくする
    assert(act(s, "p2", { type: "pass" }) === null, "防御側の再パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側もパス（バトル解決）")
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === atk.instanceId),
        "BPで負けたゴラドンが破壊された",
    )
    assert(midgard.isRested === false, "相手だけを破壊したミッドガルズが回復した")
}
