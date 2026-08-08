// smoke パート127（第六弾 BS06 バッチ4：紫20枚 ＋ エンジン拡張A/B/D/E/F）
//
// 実装したカード:
//   BS06-013/014/015/016/017/018/019/020/021/022/023/024（スピリット）
//   BS06-076/077/078（ネクサス）／BS06-095/096/097/098（マジック）／BS06-X22（スピリット）
// エンジン拡張:
//   A: fieldEvent anySpiritAttacked に ownOnly／keywordFilter（動的判定）を追加
//   B: reviveOnDestroy に cost.handDiscardOne／oncePerTurn を追加
//   C: keywordGrant.familyFilter を string→FamilyFilter へ（型のみ）
//   D: 新アクション coreDrainToLowerLevel
//   E: summonFromTrashFree に keywordFilter／costBudget を追加
//   F: 新 FieldEvent "ownSpiritDealtLife"
// BS06-098 カウンターカースは実装しない（card-notes.json に理由を記載）。
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    destroySpirit,
    effectiveBp,
    effectiveCost,
    getCard,
    hasKeyword,
    resolveAction,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardData } from "../../server/src/type"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
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
    for (const [cid, name] of [
        ["BS06-013", "ピジョンヘディレス"],
        ["BS06-014", "スモッグゴート"],
        ["BS06-015", "ストレイソウル"],
        ["BS06-016", "ブロンズメイデン"],
        ["BS06-017", "冥空士ブーネイ"],
        ["BS06-018", "人狼ルー・ガウル"],
        ["BS06-019", "冥楽士ムール"],
        ["BS06-020", "スカルゴイル"],
        ["BS06-021", "蛇后妃メドゥーサ"],
        ["BS06-022", "斬首刀のシャドウスライサー"],
        ["BS06-023", "闇司教バクルス"],
        ["BS06-024", "冥騎士アンドラー"],
        ["BS06-076", "暴かれた墓石"],
        ["BS06-077", "冥府の深淵"],
        ["BS06-078", "魔帝の寝所"],
        ["BS06-095", "ベリアルドロー"],
        ["BS06-096", "レベルドレイン"],
        ["BS06-097", "ブラッディコフィン"],
        ["BS06-098", "カウンターカース"],
        ["BS06-X22", "魔界七将ベルゼビート"],
    ] as const) {
        assert(getCard(cid).name === name, `${cid} は${name}`)
    }
    assert(hasKeyword("BS06-015", "jugeki"), "ストレイソウルは【呪撃】を持つ")
    assert(hasKeyword("BS06-019", "jugeki"), "冥楽士ムールは【呪撃】を持つ")
    assert(getCard("BS06-098").effects.length === 0, "カウンターカースは未実装（effects空）")
}

console.log("=== BS06-014 スモッグゴート：leaveAtLeast=1（コア1個の相手からは取れない） ===")
{
    const s = createGame("t127-smoggoat-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const target = put(s, "p2", "BS06-013", 1) // コア1個
    s.players.p1.hand[0] = "BS06-014"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "スモッグゴートを召喚")
    assert(target.cores === 1, `コア1個からは取れない（実際: ${String(target.cores)}個）`)
}
{
    const s = createGame("t127-smoggoat-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const target = put(s, "p2", "BS06-013", 2) // コア2個
    s.players.p1.hand[0] = "BS06-014"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "スモッグゴートを召喚")
    assert(target.cores === 1, `コア2個からは1個まで取れる（実際: ${String(target.cores)}個）`)
}

console.log("=== BS06-018 人狼ルー・ガウル：召喚時コア1個残し ===")
{
    const s = createGame("t127-lougarou", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const target = put(s, "p2", "BS06-021", 3) // Lv2（コア3個）
    s.players.p1.hand[0] = "BS06-018"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "人狼ルー・ガウルを召喚")
    assert(target.cores === 1, `相手のコアが1個だけ残る（実際: ${String(target.cores)}個）`)
}

console.log("=== BS06-023 闇司教バクルス：召喚時に全体コア1個残し（両陣営） ===")
{
    const s = createGame("t127-bacullus", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const ally = put(s, "p1", "BS06-021", 3)
    const enemy = put(s, "p2", "BS06-021", 3)
    s.players.p1.hand[0] = "BS06-023"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "闇司教バクルスを召喚")
    assert(ally.cores === 1, `自分のスピリットもコア1個になる（実際: ${String(ally.cores)}個）`)
    assert(enemy.cores === 1, `相手のスピリットもコア1個になる（実際: ${String(enemy.cores)}個）`)
}

console.log("=== BS06-022 斬首刀のシャドウスライサー：虚神コスト6 ／ 無魔カウントのBP加算 ===")
{
    const s = createGame("t127-shadowslicer-cost", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    put(s, "p1", "BS06-022", 1) // Lv1
    // BS06-X23天帝ホウオウガ（コスト10・系統「虚神」）はこのバッチの対象外で data/cards/BS06.json に
    // まだ存在しないため、同条件の合成CardDataで代用する（相談事項として報告に記載）
    const kyoshin: CardData = {
        cardId: "BS06-X23",
        name: "天帝ホウオウガ（テスト用）",
        type: "spirit",
        colors: ["green"],
        cost: 10,
        reduction: ["green", "green", "green", "green", "green", "green"],
        family: ["虚神", "爪鳥"],
        levels: [{ level: 1, cores: 1, bp: 6000 }],
        symbol: ["green"],
        flash: false,
        rarity: "X",
        limited: false,
        effect: "",
        effects: [],
    }
    assert(effectiveCost(s, "p1", kyoshin) === 6, `虚神持ちのコストは6になる（実際: ${String(effectiveCost(s, "p1", kyoshin))}）`)
    const nonKyoshin: CardData = { ...kyoshin, family: ["爪鳥"] }
    assert(
        effectiveCost(s, "p1", nonKyoshin) === 10,
        `虚神を持たなければコストは変わらない（実際: ${String(effectiveCost(s, "p1", nonKyoshin))}）`,
    )
}
{
    const s = createGame("t127-shadowslicer-aura", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const caster = put(s, "p1", "BS06-022", 3) // Lv2
    const before = effectiveBp(s, "p1", caster)
    put(s, "p1", "BS06-013", 1) // 無魔をもう1体
    const after = effectiveBp(s, "p1", caster)
    assert(after === before + 1000, `無魔1体につきBP+1000（実際: +${String(after - before)}）`)
}

console.log("=== 拡張A：【呪撃】を持つ自分のスピリットのアタックでコア除去 ===")
{
    const s = createGame("t127-extA-andrer", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    put(s, "p1", "BS06-024", 3) // Lv2（発生源）
    const attacker = put(s, "p1", "BS06-015", 2) // Lv2【呪撃】持ち
    const target = put(s, "p2", "BS06-021", 3)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(target.cores === 2, `相手のコアが1個減る（実際: ${String(target.cores)}個）`)
}
console.log("=== 拡張A：冥府の深淵の継続付与【呪撃】でも発火する ===")
{
    const s = createGame("t127-extA-abyss", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-077", 3) // Lv2（keywordGrant＋fieldEvent両方有効）
    const attacker = put(s, "p1", "BS06-013", 1) // 静的には呪撃を持たない（系統：無魔）
    assert(!hasKeyword("BS06-013", "jugeki"), "ピジョンヘディレスは静的には呪撃を持たない（前提確認）")
    const target = put(s, "p2", "BS06-021", 3)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(target.cores === 2, `継続付与の呪撃でもコアが1個減る（実際: ${String(target.cores)}個）`)
}

console.log("=== 拡張B：暴かれた墓石Lv2（手札破棄コスト・ターン1回制限） ===")
{
    const s = createGame("t127-extB", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const nexus = putNexus(s, "p1", "BS06-076", 3) // Lv2
    const spirit1 = put(s, "p1", "BS06-013", 1) // 系統：無魔
    s.players.p1.hand = ["BS06-001"]
    destroySpirit(s, "p1", spirit1.instanceId, "destroy")
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === spirit1.instanceId),
        "手札1枚を破棄して回復状態で場に残る",
    )
    assert(s.players.p1.hand.length === 0, "手札が1枚破棄された")
    assert(nexus.reviveOnDestroyUsedTurn === s.turn, "発生源にターン使用済みが記録される")

    const spirit2 = put(s, "p1", "BS06-013", 1)
    s.players.p1.hand = ["BS06-001"]
    destroySpirit(s, "p1", spirit2.instanceId, "destroy")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === spirit2.instanceId),
        "同じターン2回目は不発（そのまま破壊される）",
    )
}
{
    const s = createGame("t127-extB-nohand", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-076", 3)
    const spirit = put(s, "p1", "BS06-013", 1)
    s.players.p1.hand = []
    destroySpirit(s, "p1", spirit.instanceId, "destroy")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === spirit.instanceId),
        "手札が0枚ならコストを払えず残らない",
    )
}

console.log("=== 拡張D：レベルドレイン（Lv3→Lv2ぶんまでトラッシュ） ===")
{
    const s = createGame("t127-extD-lv3", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const target = put(s, "p2", "BS06-021", 6) // Lv3（コア6個）
    const trashBefore = s.players.p2.trashCores
    resolveAction(s, "p1", null, { type: "coreDrainToLowerLevel" }, undefined, undefined, "magic")
    assert(target.cores === 3, `Lv2ぶん（コア3個）まで減る（実際: ${String(target.cores)}個）`)
    assert(s.players.p2.trashCores === trashBefore + 3, "取り除いたコアは相手のトラッシュへ")
}
{
    const s = createGame("t127-extD-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const target = put(s, "p2", "BS06-021", 1) // Lv1
    resolveAction(s, "p1", null, { type: "coreDrainToLowerLevel" }, undefined, undefined, "magic")
    assert(target.cores === 1, `Lv1は対象にしても何も起きない（実際: ${String(target.cores)}個）`)
}

console.log("=== 拡張E：魔界七将ベルゼビート（コスト合計13まで【呪撃】持ちを複数召喚） ===")
{
    const s = createGame("t127-extE", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.players.p1.trashCards = ["BS06-019", "BS06-015", "BS06-019", "BS06-015", "BS06-013"]
    s.players.p1.hand[0] = "BS06-X22"
    s.players.p1.reserve = 30
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "魔界七将ベルゼビートを召喚")
    assert(s.players.p1.field.spirits.length === 5, `X22＋トラッシュから4体召喚（実際: ${String(s.players.p1.field.spirits.length)}体）`)
    assert(
        s.players.p1.trashCards.length === 1 && s.players.p1.trashCards[0] === "BS06-013",
        `呪撃を持たないカードは残る（実際: ${JSON.stringify(s.players.p1.trashCards)}）`,
    )
}

console.log("=== 拡張F：ベルゼビートLv2（呪撃持ちがライフを減らしたら相手1体破壊） ===")
{
    const s = createGame("t127-extF", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    put(s, "p1", "BS06-X22", 3) // Lv2
    const attacker = put(s, "p1", "BS06-015", 2) // Lv2【呪撃】持ち
    const target = put(s, "p2", "BS06-013", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === target.instanceId),
        "呪撃持ちがライフを減らしたので相手のスピリットが1体破壊される",
    )
}
