// smoke パート205（BS01-104 千本槍の古戦場／スピリットイリュージョンの対象変更）
//
// 実装前にユーザーへ確認して確定した解釈:
//   - 千本槍の古戦場 Lv2 は「相手がブロックを宣言したとき」に持ち主へ確認する任意効果。
//     破壊は【呪撃】と同じ＞７（バトル終了）で、そのときまだ場にいれば実行する
//   - コアを払った結果 Lv1 に落ちても、発揮は成立したまま＝破壊はそのまま実行される
//   - 封印された魔導書Lv1でスピリットイリュージョンの対象を片側に変えたら、
//     その絞り込みは**ターン中ずっと**効く（継続効果なので、マジックの解決後も残る）
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    declareBlock,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { exhaustSpirit } from "../../server/src/logic/EffectModules"

const SENBONYARI = "BS01-104" // 千本槍の古戦場（紫のネクサス）
const MADOUSHO = "BS02-087" // 封印された魔導書
const ILLUSION = "BS02-111" // スピリットイリュージョン
const GORADON = "BS01-001" // ゴラドン（赤・バニラ。Lv1 BP1000）
const HADES = "BS01-031" // デス・ハーデス（紫・バニラ。Lv2 BP7000）
const VIDOFNIR = "BS04-034" // ヴィゾフニル（白・【装甲：紫】。Lv2 BP3000）
const ROKUKERA = "BS01-002" // ロクケラトプス（赤。最高Lv3 BP4000）
const TEMPLE = "SD01-028" // 呪われし神殿（同じ「相手のスピリットが疲労したとき」を持つ既存カード）

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

function onField(s: GameState, pid: PlayerId, instanceId: string): boolean {
    return s.players[pid].field.spirits.some((x) => x.instanceId === instanceId)
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    const nexus = getCard(SENBONYARI)
    assert(nexus.name === "千本槍の古戦場" && nexus.type === "nexus", "BS01-104 は千本槍の古戦場（ネクサス）")
    assert(nexus.colors[0] === "purple" && nexus.cost === 6, "千本槍の古戦場は紫・コスト6")
    assert(nexus.levels[1]?.cores === 3, "Lv2 は3コア")
    assert(getCard(GORADON).name === "ゴラドン" && getCard(GORADON).effects.length === 0, "BS01-001 はゴラドン（バニラ）")
    assert(getCard(HADES).name === "デス・ハーデス" && getCard(HADES).effects.length === 0, "BS01-031 はデス・ハーデス（バニラ）")
    assert(getCard(VIDOFNIR).name === "ヴィゾフニル", "BS04-034 はヴィゾフニル（【装甲：紫】）")
    assert(getCard(MADOUSHO).name === "封印された魔導書", "BS02-087 は封印された魔導書")
    assert(getCard(ILLUSION).name === "スピリットイリュージョン", "BS02-111 はスピリットイリュージョン")
    assert(getCard(ROKUKERA).name === "ロクケラトプス", "BS01-002 はロクケラトプス")
    assert(getCard(TEMPLE).name === "呪われし神殿" && getCard(TEMPLE).type === "nexus", "SD01-028 は呪われし神殿（ネクサス）")
}

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== BS01-104 Lv1･Lv2：相手のスピリットが疲労するたびに1枚ドローする ===")
{
    const s = base("senbon-draw-opponent")
    const nexus = putNexus(s, "p1", SENBONYARI, 0)
    assert(currentLevel(nexus).level === 1, "0コアでLv1")
    const enemy = put(s, "p2", GORADON, 1)
    const before = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "exhaust", count: 1 })
    assert(enemy.isRested, "相手のスピリットが疲労した（前提）")
    assert(s.players.p1.hand.length === before + 1, "Lv1でも相手の疲労で1枚ドローする")
}
{
    const s = base("senbon-draw-own-none")
    putNexus(s, "p1", SENBONYARI, 0)
    const own = put(s, "p1", GORADON, 1)
    const before = s.players.p1.hand.length
    exhaustSpirit(s, "p1", own)
    assert(own.isRested, "自分のスピリットが疲労した（前提）")
    assert(s.players.p1.hand.length === before, "自分のスピリットの疲労ではドローしない（subjectSide:opponent）")
}
{
    // ブロックによる疲労でも発火する（「疲労するたび」に手段の限定は無い）
    const s = base("senbon-draw-on-block")
    putNexus(s, "p1", SENBONYARI, 0)
    const attacker = put(s, "p1", GORADON, 1)
    const blocker = put(s, "p2", HADES, 4)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    const before = s.players.p1.hand.length
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.players.p1.hand.length >= before + 1, "ブロックでブロッカーが疲労したぶんドローしている")
}

console.log("--- 同じ書き方だった SD01-028 呪われし神殿Lv2 も『自分が』ドローする（回帰） ---")
{
    // fieldEvent はイベント対象（＝疲労した相手のスピリット）を self にして解決するため、
    // selfMode:"source" を付けないと**相手がドローしていた**（2026-08-16 に発見・修正）
    const s = base("cursed-temple-draws-owner")
    putNexus(s, "p1", TEMPLE, 2) // Lv2
    s.turnPlayer = "p2" // 『相手のアタックステップ』
    s.phase = "attack"
    put(s, "p2", GORADON, 1)
    const before = { p1: s.players.p1.hand.length, p2: s.players.p2.hand.length }
    resolveAction(s, "p1", null, { type: "exhaust", count: 1 })
    assert(s.players.p1.hand.length === before.p1 + 1, "ネクサスの持ち主（p1）が1枚ドローする")
    assert(s.players.p2.hand.length === before.p2, "相手（p2）はドローしない")
}

console.log("=== BS01-104 Lv2：コア1個をトラッシュに置き、ブロッカーをバトル終了後に破壊する ===")
{
    const s = base("senbon-destroy-blocker")
    const nexus = putNexus(s, "p1", SENBONYARI, 3)
    assert(currentLevel(nexus).level === 2, "3コアでLv2")
    const attacker = put(s, "p1", GORADON, 1) // BP1000
    const blocker = put(s, "p2", HADES, 4) // BP7000（BP比較ではブロッカーが勝つ）
    const trashBefore = s.players.p1.trashCores
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(nexus.cores === 2, "ブロック宣言の時点でコア1個を支払っている")
    assert(s.players.p1.trashCores === trashBefore + 1, "払ったコアは持ち主のトラッシュへ")
    assert(currentLevel(nexus).level === 1, "支払いでLv1へ落ちる（コア3個ちょうどだったため）")
    assert(onField(s, "p2", blocker.instanceId), "この時点ではまだ破壊されていない（バトル終了後）")

    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!onField(s, "p1", attacker.instanceId), "BP比較でアタッカーは破壊される")
    assert(
        !onField(s, "p2", blocker.instanceId),
        "Lv1に落ちてもバトル終了後の破壊は実行される（2026-08-16 ユーザー確認）",
    )
    assert(s.battle === null, "バトルは終了している")
}

console.log("--- Lv1（コア0）では発揮しない ---")
{
    const s = base("senbon-level1-no-effect")
    const nexus = putNexus(s, "p1", SENBONYARI, 0)
    const attacker = put(s, "p1", GORADON, 1)
    const blocker = put(s, "p2", HADES, 4)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(nexus.cores === 0, "Lv1ではコアを払わない")
    assert(onField(s, "p2", blocker.instanceId), "Lv1ではブロッカーは破壊されない")
}

console.log("--- BP比較で先に破壊されたブロッカーには何も起きない ---")
{
    const s = base("senbon-blocker-already-dead")
    const nexus = putNexus(s, "p1", SENBONYARI, 4) // 支払ってもLv2を保てる
    const attacker = put(s, "p1", HADES, 4) // BP7000
    const blocker = put(s, "p2", GORADON, 1) // BP1000（BP比較で破壊される）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(nexus.cores === 3, "コアは払われている（支払いはブロック宣言の時点）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!onField(s, "p2", blocker.instanceId), "ブロッカーはBP比較で破壊されている")
    assert(onField(s, "p1", attacker.instanceId), "アタッカーは生き残る")
    assert(s.battle === null, "予約が空振りしてもバトルは正常に終了する")
}

console.log("--- 【装甲：紫】を持つブロッカーは破壊されない（判定はバトル終了後の時点） ---")
{
    const s = base("senbon-armor")
    putNexus(s, "p1", SENBONYARI, 3)
    const attacker = put(s, "p1", GORADON, 1) // BP1000
    const blocker = put(s, "p2", VIDOFNIR, 2) // Lv2 BP3000・【装甲：紫】
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(onField(s, "p2", blocker.instanceId), "紫のネクサスの効果を受けないので破壊されない")
    assert(
        s.log.some((l) => l.includes("バトル終了後の破壊を受けなかった")),
        "装甲で防いだログが出る",
    )
}

console.log("--- 対話モードでは発動確認が出て、断れば何も起きない ---")
{
    const s = base("senbon-interactive-decline")
    s.interactiveTargets = true
    const nexus = putNexus(s, "p1", SENBONYARI, 3)
    const attacker = put(s, "p1", GORADON, 1)
    const blocker = put(s, "p2", HADES, 4)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    const pc = s.pendingChoice
    assert(pc !== null && pc.pid === "p1", "発動確認は千本槍の古戦場の持ち主に出る")
    assert((pc?.prompt ?? "").includes("千本槍の古戦場"), "確認の文面にカード名が出る")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "発動しないを選ぶ")
    assert(nexus.cores === 3, "断ればコアは減らない")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(onField(s, "p2", blocker.instanceId), "断ればブロッカーは破壊されない")
}

console.log("=== BS02-111 スピリットイリュージョン × 封印された魔導書Lv1（対象を片側のみに変更） ===")
{
    // 対照：魔導書が無ければ両陣営の指定色スピリットが最高Lv扱いになる（従来どおり）
    const s = base("illusion-no-book")
    const mine = put(s, "p1", ROKUKERA, 1)
    const theirs = put(s, "p2", ROKUKERA, 1)
    s.players.p1.hand = [ILLUSION]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(act(s, "p1", { type: "resolveChoice", option: "赤" }) === null, "色「赤」を選ぶ")
    assert(currentLevel(mine).level === 3 && currentLevel(theirs).level === 3, "両陣営の赤が最高Lv扱いになる")
}
{
    const s = base("illusion-book-own-only")
    s.interactiveTargets = true
    putNexus(s, "p1", MADOUSHO, 0) // Lv1
    const mine = put(s, "p1", ROKUKERA, 1)
    const theirs = put(s, "p2", ROKUKERA, 1)
    s.players.p1.hand = [ILLUSION]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    const pc = s.pendingChoice
    assert(pc !== null && pc.pid === "p1", "封印された魔導書の確認が魔導書の持ち主に出る")
    assert((pc?.options ?? []).length === 3, "3択（変更しない／相手のみ／自分のみ）で出る")
    assert(act(s, "p1", { type: "resolveChoice", option: "自分のみ" }) === null, "「自分のみ」を選ぶ")
    assert(act(s, "p1", { type: "resolveChoice", option: "赤" }) === null, "続けて色「赤」を選ぶ")
    assert(currentLevel(mine).level === 3, "魔導書の持ち主（p1）の赤は最高Lv扱いになる")
    assert(currentLevel(theirs).level === 1, "相手（p2）の赤はLv1のまま")

    // 継続効果なので、マジックの解決が終わった後もターン中ずっと片側だけに効く
    const later = put(s, "p2", ROKUKERA, 1)
    refreshLevelAsOverrides(s)
    assert(currentLevel(later).level === 1, "解決後に出てきた相手の赤も対象外のまま")
    assert(currentLevel(mine).level === 3, "持ち主側の効果は続いている")
}
{
    const s = base("illusion-book-opponent-only")
    s.interactiveTargets = true
    putNexus(s, "p1", MADOUSHO, 0)
    const mine = put(s, "p1", ROKUKERA, 1)
    const theirs = put(s, "p2", ROKUKERA, 1)
    s.players.p1.hand = [ILLUSION]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(act(s, "p1", { type: "resolveChoice", option: "相手のみ" }) === null, "「相手のみ」を選ぶ")
    assert(act(s, "p1", { type: "resolveChoice", option: "赤" }) === null, "続けて色「赤」を選ぶ")
    assert(currentLevel(theirs).level === 3, "相手（p2）の赤だけが最高Lv扱いになる")
    assert(currentLevel(mine).level === 1, "持ち主（p1）の赤はLv1のまま")
}
{
    const s = base("illusion-book-keep-both")
    s.interactiveTargets = true
    putNexus(s, "p1", MADOUSHO, 0)
    const mine = put(s, "p1", ROKUKERA, 1)
    const theirs = put(s, "p2", ROKUKERA, 1)
    s.players.p1.hand = [ILLUSION]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(act(s, "p1", { type: "resolveChoice", option: "変更しない" }) === null, "「変更しない」を選ぶ")
    assert(act(s, "p1", { type: "resolveChoice", option: "赤" }) === null, "続けて色「赤」を選ぶ")
    assert(
        currentLevel(mine).level === 3 && currentLevel(theirs).level === 3,
        "変更しなければ従来どおり両陣営に効く",
    )
}
