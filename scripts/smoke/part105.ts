// smoke パート105（効果節の実装漏れ埋め・14枚）
// 対象: BS01-016 スケルトン・ジョウ／BS02-047 機神官フレイ／BS03-011 竜騎将ディライダロス／
//       BS03-012 水龍王リヴァイア／BS03-059 アルカナビースト・ペイラ／BS03-070 天使長エクスシア／
//       BS03-084 巨猫ブリンクス／BS03-100 武器コレクターのゴドフリー／BS04-039 宝石虫スカラベール／
//       BS04-084 奇跡の丘／BS05-059 緑眼の虚空（+BS05-065青嵐の虚空のcosts修正）／
//       BS04-043 ワルキューレ・ヒルド／BS03-024 吸血騎士ノスフェラト／BS05-016 吸血女王カーミラ
import {
    act,
    assert,
    createGame,
    createInstance,
    destroySpirit,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireTrigger } from "../../server/src/logic/EffectModules"
import { activeConstraints, costCantAct, effectiveBp, hasFullEffectImmunity } from "../../shared/rules"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== BS01-016 スケルトン・ジョウ：Lv1-3『相手のアタックステップ』ブロックできない ===")
{
    const s = createGame("jo-cantblock", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS01-001", 1) // ゴラドン Lv1 BP1000
    const jo = put(s, "p2", "BS01-016", 1) // スケルトン・ジョウ Lv1
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ゴラドンでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    const err = act(s, "p2", { type: "block", instanceId: jo.instanceId })
    assert(err !== null && err.includes("ブロックできません"), "Lv1のジョウはcantBlockでブロック拒否される")
}

console.log("=== BS02-047 機神官フレイ：Lv1-3『召喚時』ボイドから自分のネクサスすべてにコア1個ずつ ===")
{
    const s = createGame("frey-nexuscore", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const frey = put(s, "p1", "BS02-047", 1)
    const nexus1 = putNexus(s, "p1", "BS01-098", 0)
    const nexus2 = putNexus(s, "p1", "BS01-098", 1)
    fireTrigger(s, "p1", frey, "onSummon")
    assert(nexus1.cores === 1, "ネクサス1にコア1個追加")
    assert(nexus2.cores === 2, "ネクサス2にもコア1個追加")
}

console.log("=== BS03-011 竜騎将ディライダロス：Lv2『自分のアタックステップ』コア1個だけのスピリットすべてBP+2000 ===")
{
    const s = createGame("dilaidalos-aura", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.phase = "attack"
    s.turnPlayer = "p1"
    put(s, "p1", "BS03-011", 2) // ディライダロス Lv2
    const oneCore = put(s, "p1", "BS01-001", 1) // コア1個
    const twoCore = put(s, "p1", "BS03-028", 2) // コア2個（対象外）
    assert(effectiveBp(s, "p1", oneCore) === 1000 + 2000, "コア1個の自分のスピリットはBP+2000")
    assert(effectiveBp(s, "p1", twoCore) === 2000, "コア2個は対象外で据え置き")
}

console.log("=== BS03-012 水龍王リヴァイア：Lv1-3『召喚時』コア3個以下のスピリット1体を破壊できる ===")
{
    const s = createGame("leviathan-destroy", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    const leviathan = put(s, "p1", "BS03-012", 7) // Lv3（コア7・maxCores3の対象外にする）
    const eligible = put(s, "p2", "BS01-001", 3) // コア3個：対象
    const tooMany = put(s, "p2", "BS03-028", 4) // コア4個：対象外
    fireTrigger(s, "p1", leviathan, "onSummon")
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === eligible.instanceId),
        "コア3個の相手スピリットは破壊される",
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === tooMany.instanceId),
        "コア4個の相手スピリットは対象外で残る",
    )
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === leviathan.instanceId),
        "リヴァイア自身はコア7個で対象外のため残る",
    )
}

console.log("=== BS03-059 アルカナビースト・ペイラ：Lv3『自分のアタックステップ』カード名『アルカナ』全体BP+2000 ===")
{
    const s = createGame("peira-aura", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.phase = "attack"
    s.turnPlayer = "p1"
    put(s, "p1", "BS03-059", 4) // ペイラ Lv3
    const arcana = put(s, "p1", "BS02-056", 1) // アルカナビースト・ケン：名前に「アルカナ」
    const nonArcana = put(s, "p1", "BS01-001", 1)
    assert(effectiveBp(s, "p1", arcana) === 2000 + 2000, "「アルカナ」を含むスピリットはBP+2000")
    assert(effectiveBp(s, "p1", nonArcana) === 1000, "含まないスピリットは据え置き")
}

console.log("=== BS03-070 天使長エクスシア：Lv2-3『アタック時』紫のネクサスがあれば1ドロー ===")
{
    const s = createGame("exsia-draw", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const exsia = put(s, "p1", "BS03-070", 4) // Lv2
    const before = s.players.p1.hand.length
    fireTrigger(s, "p1", exsia, "onAttack")
    assert(s.players.p1.hand.length === before, "紫のネクサスが無ければドローしない")
    putNexus(s, "p1", "BS01-102", 0) // 主無き古城：紫のネクサス
    fireTrigger(s, "p1", exsia, "onAttack")
    assert(s.players.p1.hand.length === before + 1, "紫のネクサスがあれば1枚ドロー")
}

console.log("=== BS03-084 巨猫ブリンクス：Lv1-2『アタック時』お互いデッキから1枚ドロー ===")
{
    const s = createGame("brinkus-draw", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const brinkus = put(s, "p1", "BS03-084", 1)
    const p1Before = s.players.p1.hand.length
    const p2Before = s.players.p2.hand.length
    fireTrigger(s, "p1", brinkus, "onAttack")
    assert(s.players.p1.hand.length === p1Before + 1, "自分がドロー")
    assert(s.players.p2.hand.length === p2Before + 1, "相手もドロー（自分→相手の順）")
}

console.log("=== BS03-100 武器コレクターのゴドフリー：Lv2-3『アタック時』自分の青のネクサス1つにつきBP+1000 ===")
{
    const s = createGame("godfrey-buff", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const godfrey = put(s, "p1", "BS03-100", 4) // Lv2
    putNexus(s, "p1", "BS03-113", 0) // 青のネクサス
    putNexus(s, "p1", "BS03-114", 0) // 青のネクサス
    putNexus(s, "p1", "BS01-098", 0) // 赤のネクサス（対象外）
    fireTrigger(s, "p1", godfrey, "onAttack")
    assert(godfrey.tempBpBuff === 2000, "青のネクサス2つぶんBP+2000（赤ネクサスはカウントしない）")
}

console.log("=== BS04-039 宝石虫スカラベール：Lv2『自分のアタックステップ』神速持ちがバトル破壊時、コア1個でトラッシュから手札へ ===")
{
    const s = createGame("scarabael-revive", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.phase = "attack"
    s.turnPlayer = "p1"
    const scarabael = put(s, "p1", "BS04-039", 3) // Lv2（コスト用のフィールドコア源も兼ねる）
    const sokuSpirit = put(s, "p1", "BS03-028", 2) // モグランナー：神速持ち
    s.players.p1.reserve = 0 // リザーブ0なのでフィールド（スカラベール自身）から支払う
    destroySpirit(s, "p1", sokuSpirit.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["red"], attackerLevel: 1 },
    })
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === sokuSpirit.instanceId),
        "神速持ちはフィールドから除去される",
    )
    assert(s.players.p1.hand.includes("BS03-028"), "手札に戻る")
    assert(scarabael.cores === 2, "リザーブ0のためフィールド（スカラベール自身）のコア1個で支払う（3→2）")
    assert(s.players.p1.trashCores === 1, "支払ったコアはトラッシュへ")
}

console.log("=== BS04-084 奇跡の丘：Lv2『自分のアタックステップ』系統「天霊」がバトル破壊時、手札に戻る ===")
{
    const s = createGame("miracle-hill-revive", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.phase = "attack"
    s.turnPlayer = "p1"
    putNexus(s, "p1", "BS04-084", 4) // 奇跡の丘 Lv2
    const tenrei = put(s, "p1", "BS03-070", 4) // 天使長エクスシア：系統「天霊」
    s.players.p1.reserve = 0
    destroySpirit(s, "p1", tenrei.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["red"], attackerLevel: 1 },
    })
    assert(s.players.p1.hand.includes("BS03-070"), "コストなしで手札に戻る")
}

console.log("=== BS05-059 緑眼の虚空：Lv1-2『お互いのアタックステップ』コスト0/3はアタック/ブロック不可 ===")
{
    const s = createGame("green-void", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS05-059", 0) // Lv1
    assert(costCantAct(s, 0), "コスト0は行動不可")
    assert(costCantAct(s, 3), "コスト3は行動不可")
    assert(!costCantAct(s, 1), "コスト1は対象外")
    assert(!costCantAct(s, 2), "コスト2は対象外")
    assert(!costCantAct(s, 4), "コスト4は対象外")
}

console.log("=== BS05-065 青嵐の虚空：costs修正確認（コスト0/2のみ、旧maxCost:2バグでは1も拾ってしまう） ===")
{
    const s = createGame("blue-storm-void", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS05-065", 0) // Lv1
    assert(costCantAct(s, 0), "コスト0は行動不可")
    assert(costCantAct(s, 2), "コスト2は行動不可")
    assert(!costCantAct(s, 1), "コスト1は対象外（修正前はmaxCost:2でtrueになっていた）")
}

console.log("=== BS04-043 ワルキューレ・ヒルド：Lv1-2 相手のスピリット/マジックの効果を受けない（範囲効果にも有効） ===")
{
    const s = createGame("hild-immunity", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const hild = put(s, "p1", "BS04-043", 1) // Lv1
    const p2Source = put(s, "p2", "BS01-001", 1)
    // 単体破壊（srcType:"spirit"、selfから自動導出）：ヒルドが唯一の相手候補のため不発
    resolveAction(s, "p2", p2Source, { type: "destroy", count: 1 })
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === hild.instanceId),
        "スピリット効果を受けず破壊されない（単体選択）",
    )
    // マジック由来（srcType明示）でも同様
    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, undefined, undefined, "magic")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === hild.instanceId),
        "マジック効果も受けない",
    )
    // 範囲効果（destroyAll）でも無力にならないことを確認
    const other = put(s, "p1", "BS01-001", 1) // 免疫を持たない自分のスピリット
    resolveAction(s, "p2", p2Source, { type: "destroyAll" })
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === hild.instanceId),
        "範囲破壊（destroyAll）でもヒルドは残る",
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === other.instanceId),
        "免疫を持たない同じ側のスピリットは範囲破壊で破壊される",
    )
    assert(hasFullEffectImmunity(hild, "spirit"), "hasFullEffectImmunityがtrueを返す")
}

console.log("=== BS03-024 吸血騎士ノスフェラト：Lv2【呪撃】持ちの自分のスピリットすべてもLv1にブロックされない ===")
{
    const s = createGame("nosferato-grant", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    put(s, "p1", "BS03-024", 4) // ノスフェラト Lv2
    const jugekiSpirit = put(s, "p1", "BS03-017", 1) // 幽霊船長シルバーシャーク：【呪撃】持ち Lv1
    const constraints = activeConstraints(s, "p1", jugekiSpirit)
    assert(
        constraints.some((c) => c.type === "unblockableBy" && c.levelFilter?.includes(1)),
        "呪撃持ちの自分のスピリットにもunblockableBy(Lv1)が付与される",
    )
}

console.log("=== BS05-016 吸血女王カーミラ：Lv3『アタック時』お互いフィールドから1体ずつ選び破壊（非対話） ===")
{
    const s = createGame("carmilla-mutual-auto", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const carmilla = put(s, "p1", "BS05-016", 7) // Lv3
    const p1Spare = put(s, "p1", "BS01-016", 7) // スケルトン・ジョウ Lv3 BP10000（カーミラより高BPにして自動選択させる）
    const p2Spirit = put(s, "p2", "BS01-001", 1)
    fireTrigger(s, "p1", carmilla, "onAttack")
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === p2Spirit.instanceId),
        "相手フィールドの実効BP最大が破壊される",
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === p1Spare.instanceId),
        "自分フィールドの実効BP最大（カーミラより高BP）も破壊される",
    )
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === carmilla.instanceId),
        "カーミラ自身はBPが低いため選ばれず残る",
    )
}

console.log("=== BS05-016 吸血女王カーミラ：Lv3 mutualDestroyChoiceの2段階choice（対話モード） ===")
{
    const s = createGame("carmilla-mutual-interactive", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    const carmilla = put(s, "p1", "BS05-016", 7)
    const p1Spare = put(s, "p1", "BS01-016", 7)
    const p2A = put(s, "p2", "BS01-001", 1)
    const p2B = put(s, "p2", "BS03-028", 1)
    fireTrigger(s, "p1", carmilla, "onAttack")
    assert(s.pendingChoice !== null, "1段階目：自分（発生源の持ち主）の選択待ちになる")
    assert(s.pendingChoice?.pid === "p1", "選択者は自分（own）")
    assert(
        act(s, "p1", { type: "resolveChoice", instanceId: p2A.instanceId }) === null,
        "own側がp2Aを選択",
    )
    assert(s.pendingChoice !== null, "2段階目：相手の選択待ちになる")
    assert(s.pendingChoice?.pid === "p2", "選択者は相手（opponent）")
    assert(
        act(s, "p2", { type: "resolveChoice", instanceId: p1Spare.instanceId }) === null,
        "opponent側がp1Spareを選択",
    )
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === p2A.instanceId),
        "own側が選んだp2Aは破壊される",
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === p1Spare.instanceId),
        "opponent側が選んだp1Spareは破壊される",
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === p2B.instanceId),
        "選ばれなかったp2Bは残る",
    )
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === carmilla.instanceId),
        "カーミラ自身は残る",
    )
}
