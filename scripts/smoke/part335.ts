// smoke パート335（015吸血令嬢エサルフリーダ Lv1-3：自分が使用する紫のマジックカードの色を
// 無いものとして扱う。kind:"ownMagicColorless" / shared/cost.magicEffectiveColors）
//
// 目的は無効化・耐性をすり抜けること（軽減やコストの色条件には及ばない。2026-09-17 ユーザー確認）。
// バーストで発揮する紫のマジックにも及ぶ（BURST.md §7.2 の装甲・効果耐性はバースト効果にも効く前提の上で）。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械確認してから使う。
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireFieldEventTriggers } from "../../server/src/logic/triggers"
import { magicEffectiveColors } from "../../shared/cost"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "white" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    const esalfrida = getCard("BS15-015")
    assert(esalfrida.name === "吸血令嬢エサルフリーダ" && esalfrida.colors.includes("purple") && esalfrida.type === "spirit", "BS15-015 は紫の吸血令嬢エサルフリーダ")
    const darkCoffin = getCard("BS01-131")
    assert(darkCoffin.name === "ダークコフィン" && darkCoffin.colors.includes("purple") && darkCoffin.type === "magic", "BS01-131 は紫のダークコフィン（フラッシュ：スピリット1体をBP+4000、anySide）")
    const kimairon = getCard("BS10-034")
    assert(kimairon.name === "鎧装獣キマイロン", "BS10-034 は鎧装獣キマイロン（【氷壁：赤/紫】）")
    const heavyArmored = getCard("BS12-027")
    assert(heavyArmored.name === "近衛機クリザンテMk-VIII", "BS12-027 は近衛機クリザンテMk-VIII（【重装甲：紫】）")
    const meikoufuumetsuju = getCard("BS14-096")
    assert(meikoufuumetsuju.name === "冥皇封滅呪" && meikoufuumetsuju.colors.includes("purple"), "BS14-096 は紫の冥皇封滅呪（バースト：疲労状態のコスト5以下の相手のスピリット1体を破壊）")
}

console.log("=== §A magicEffectiveColors：バトル中だけ／バトル外では耐性どおり ===")
{
    const s = game("p335-a", false)
    const esalfrida = put(s, "p1", "BS15-015", 1)
    const magic = getCard("BS01-131")
    assert(
        magicEffectiveColors(s, "p1", magic).includes("purple"),
        "バトル外（エサルフリーダがバトルに参加していない）では紫のまま",
    )
    s.battle = { attackerInstanceId: esalfrida.instanceId, blockerInstanceId: null, directed: false }
    assert(
        magicEffectiveColors(s, "p1", magic).length === 0,
        "エサルフリーダがアタッカーとしてバトル中なら色が無くなる",
    )
    s.battle = null
    // 発生源（エサルフリーダ）自身がバトルの当事者でないと効かない（別のスピリットがバトルしていても及ばない）
    const other = put(s, "p1", "BS01-001", 1)
    s.battle = { attackerInstanceId: other.instanceId, blockerInstanceId: null, directed: false }
    assert(
        magicEffectiveColors(s, "p1", magic).includes("purple"),
        "エサルフリーダ自身が参加していないバトルでは効かない",
    )
}

function declareAttack(s: GameState, attackerInstanceId: string) {
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attackerInstanceId }) === null, "アタック宣言（フラッシュ開始）")
}

console.log("=== §B 紫の【重装甲】を持つ相手に紫のマジックが効く（バトル中） ===")
{
    const s = game("p335-b", true)
    const esalfrida = put(s, "p1", "BS15-015", 1)
    s.players.p1.hand = ["BS01-131"]
    declareAttack(s, esalfrida.instanceId)
    const armored = put(s, "p2", "BS12-027", 1) // 【重装甲：紫】
    s.priorityPlayer = "p1"
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ダークコフィンのフラッシュ効果を使用")
    // anySideの候補（対話）にエサルフリーダ自身と重装甲の相手が含まれる。
    // 015 が効いていれば、通常なら受けないはずの重装甲持ちも候補に出る
    const candidates = s.pendingChoice?.candidates ?? []
    assert(candidates.includes(armored.instanceId), "015が効いて、紫の【重装甲】を持つ相手にも候補として出る")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: armored.instanceId }) === null, "重装甲の相手を対象に選ぶ")
    assert(armored.tempBpBuff === 4000, "重装甲を持つ相手にBP+4000が実際に乗る")
}

console.log("=== 対照: エサルフリーダがバトルに参加していなければ紫の【重装甲】を持つ相手には効かない ===")
{
    const s = game("p335-b2", true)
    put(s, "p1", "BS15-015", 1) // 場にいるだけで、このバトルには参加していない
    s.players.p1.hand = ["BS01-131"]
    const bystander = put(s, "p1", "BS01-001", 1) // このカードがアタッカー（エサルフリーダではない）
    declareAttack(s, bystander.instanceId)
    const armored = put(s, "p2", "BS12-027", 1)
    s.priorityPlayer = "p1"
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ダークコフィンのフラッシュ効果を使用")
    const candidates = s.pendingChoice?.candidates ?? []
    assert(!candidates.includes(armored.instanceId), "エサルフリーダ自身がバトルに参加していないので、紫の【重装甲】を持つ相手には効かない（対照）")
    assert(candidates.includes(bystander.instanceId), "対照：自分のスピリットは候補に出る")
}

console.log("=== §C 【氷壁：紫】で無効にされない（バトル中） ===")
{
    const s = game("p335-c", false)
    const esalfrida = put(s, "p1", "BS15-015", 1)
    s.players.p1.hand = ["BS01-131"]
    declareAttack(s, esalfrida.instanceId)
    const hyoheki = put(s, "p2", "BS10-034", 1) // 【氷壁：赤/紫】
    s.priorityPlayer = "p1"
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ダークコフィンのフラッシュ効果を使用")
    assert(!hyoheki.isRested, "015が効いて、【氷壁：紫】は無効化のコストを払わない（発動しない）")
    assert(esalfrida.tempBpBuff === 4000, "無効化されずBP+4000が乗る（非対話はanySideで自分の場から自動選択）")
}

console.log("=== 対照: エサルフリーダがバトルに参加していなければ【氷壁：紫】に無効化される ===")
{
    const s = game("p335-c2", false)
    put(s, "p1", "BS15-015", 1) // バトルに参加していない
    s.players.p1.hand = ["BS01-131"]
    const bystander = put(s, "p1", "BS01-001", 1) // このカードがアタッカー（エサルフリーダではない）
    declareAttack(s, bystander.instanceId)
    const hyoheki = put(s, "p2", "BS10-034", 1)
    s.priorityPlayer = "p1"
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ダークコフィンのフラッシュ効果を使用")
    assert(hyoheki.isRested, "対照：エサルフリーダ自身がバトルに参加していないので【氷壁：紫】が無効化する（疲労する）")
    assert(bystander.tempBpBuff === 0, "対照：無効化されたのでBPは増加しない")
}

console.log("=== §D バーストで発揮する紫のマジックにも効く（装甲をすり抜ける） ===")
{
    const s = game("p335-d", false)
    const esalfrida = put(s, "p1", "BS15-015", 1)
    declareAttack(s, esalfrida.instanceId)
    // reserve=0：冥皇封滅呪の「その後コストを支払うことで発揮するフラッシュ効果」（自分のスピリットを
    // 破壊するのが別コストの thenPay）が発動すると、このバーストの本題（装甲をすり抜けるか）とは
    // 無関係な「相手が自分のスピリットを破壊する」別の破壊経路が混ざるため、コストを払えない状態にして防ぐ
    s.players.p1.reserve = 0
    s.players.p1.burst = "BS14-096" // 冥皇封滅呪：バースト＝疲労状態のコスト5以下の相手のスピリット1体を破壊
    s.players.p1.burstSet = true
    const armored = put(s, "p2", "BS12-027", 1) // 【重装甲：紫】コスト3・疲労状態
    armored.isRested = true
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === armored.instanceId),
        "015がバーストにも効いて、紫の【重装甲】を持つ相手でも破壊される",
    )
}

console.log("=== 対照: エサルフリーダがバトルに参加していなければバーストの紫マジックは装甲を抜けない ===")
{
    const s = game("p335-d2", false)
    put(s, "p1", "BS15-015", 1) // バトルに参加していない
    s.players.p1.reserve = 0 // §Dと同じ理由でthenPayを発動させない
    s.players.p1.burst = "BS14-096"
    s.players.p1.burstSet = true
    const armored = put(s, "p2", "BS12-027", 1)
    armored.isRested = true
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === armored.instanceId),
        "対照：バトルに参加していないので、紫の【重装甲】を持つ相手は破壊されない",
    )
}

console.log("すべてのチェックに合格しました 🎉（part335）")
