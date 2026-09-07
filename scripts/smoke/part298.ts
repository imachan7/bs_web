// smoke パート298（BS13 赤バッチ前半8枚：新しく足した5つの器）
// C=本来のコスト（軽減前）で判定する軸／D=アタック時に合体しその後だけ『合体アタック時』を発揮／
// J=BP合計(系統)版の好きなだけ破壊／N=【超覚醒】の支払い元をリザーブへ変える継続付与／
// O=【超覚醒】を持つ合体スピリットは分離できない
import { assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart, getCard, resolveAction, handleAction } from "./helpers"
import type { GameState } from "./helpers"
import { attachBrave, detachBraveByEffect } from "../../server/src/logic/removal"
import { canAwakenFromReserve, instanceSymbolCount, AWAKEN_FROM_RESERVE } from "../../shared/rules"
import { fireCombinedAttackTrigger } from "../../server/src/logic/EffectModules"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: BS13-001〜008 のカード定義 ===")
{
    assert(getCard("BS13-003").name === "カメレオプス", "BS13-003はカメレオプス")
    assert(getCard("BS13-005").name === "強暴竜ディラノ・レックス", "BS13-005は強暴竜ディラノ・レックス")
    assert(getCard("BS13-007").name === "豹竜パンドランサー", "BS13-007は豹竜パンドランサー")
}

console.log("=== C: 本来のコスト（軽減前）で判定する軸（BS13-003カメレオプス） ===")
{
    const s = game("c-original-cost")
    const p1 = s.players.p1
    const cham = createInstance("BS13-003", s.turn, 1) // Lv1
    p1.field.spirits.push(cham)
    // 赤シンボルを3つ揃えて、原始鳥フェニキオス（コスト7・軽減:赤赤赤）の実質コストを7→4に下げる
    p1.field.spirits.push(createInstance("BS13-001", s.turn, 1)) // ヒクイック：赤シンボル1
    p1.field.spirits.push(createInstance("BS13-001", s.turn, 1)) // 赤シンボル1
    refreshLevelAsOverrides(s)

    // まずコスト7未満のカードを召喚しても発火しない
    p1.hand[0] = "BS01-001" // ゴラドン：コスト0
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "コスト0のゴラドンを召喚")
    assert((cham.extraSymbolsPermanent?.length ?? 0) === 0, "コスト7未満の召喚では発火しない")

    // 次に本来のコスト7の晶輝龍ディアマットを召喚（実質コストは軽減で4になっている）。
    // 召喚時効果は「【神速】を持つスピリット1体を破壊できる」で、場に神速持ちがいないため無害
    p1.hand[0] = "BS01-024" // 晶輝龍ディアマット：コスト7・軽減赤赤赤
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "本来のコスト7の晶輝龍ディアマットを召喚（軽減で実質4）")
    assert(
        (cham.extraSymbolsPermanent?.length ?? 0) === 2,
        "軽減で実質コストが下がっても、本来のコストが7以上なら赤シンボル2つが永続的に追加される",
    )
    assert(instanceSymbolCount(cham) === 3, "カメレオプス自身のシンボル数は1（静的）+2（永続追加）=3")
}

console.log("=== D: アタック時に合体し、合体できたときだけ『合体アタック時』を発揮 ===")
{
    // 合体先はバニラの BS13-001（ヒクイック）。骸戦車ゲパルバート（BS10-064）は合体条件がバニラで、
    // 【合体時】『このスピリットのアタック時』に「疲労状態の相手のスピリット1体を破壊する」を持つ
    const s = game("d-combine-then-fire")
    const p1 = s.players.p1
    const p2 = s.players.p2
    const host = createInstance("BS13-001", s.turn, 1)
    p1.field.spirits.push(host)
    const brave = createInstance("BS10-064", s.turn, 0) // スピリット状態のブレイヴ
    p1.field.spirits.push(brave)
    const restedEnemy = createInstance("BS01-001", s.turn, 1)
    restedEnemy.isRested = true
    p2.field.spirits.push(restedEnemy)
    refreshLevelAsOverrides(s)

    // 合体そのものは attachBrave で成立させる（BS13-007のcombineOwnBrave.hostSelf自体は既存の
    // 合体先選択ロジックを通すだけなので単体では検証しない）。ここでは fireCombinedAttackTrigger が
    // 「新たに合体したブレイヴが持つ whileCombined onAttack エントリ」を実際に発揮させることを確認する
    attachBrave(s, "p1", host, brave)
    refreshLevelAsOverrides(s)
    fireCombinedAttackTrigger(s, "p1", host, "onAttack")
    assert(
        p2.field.spirits.every((sp) => sp.instanceId !== restedEnemy.instanceId),
        "合体が成立したので、新たに合体したブレイヴの『合体アタック時』効果（疲労状態の相手を破壊）が発揮された",
    )
}
{
    // 合体しなかった（できなかった）場合は発揮しない
    const s = game("d-no-combine-no-fire")
    const p1 = s.players.p1
    const p2 = s.players.p2
    const host = createInstance("BS13-001", s.turn, 1)
    p1.field.spirits.push(host) // ブレイヴを合体させない
    const restedEnemy = createInstance("BS01-001", s.turn, 1)
    restedEnemy.isRested = true
    p2.field.spirits.push(restedEnemy)
    refreshLevelAsOverrides(s)

    fireCombinedAttackTrigger(s, "p1", host, "onAttack")
    assert(
        p2.field.spirits.some((sp) => sp.instanceId === restedEnemy.instanceId),
        "合体していない（bravesOfが空）ので『合体アタック時』は何も発揮せず、相手は破壊されない",
    )
}

console.log("=== O: 【超覚醒】を持つ合体スピリットは分離できない ===")
{
    const s = game("o-cant-separate")
    const p1 = s.players.p1
    const dyranno = createInstance("BS13-005", s.turn, 1) // 発生源。分離禁止はレベル問わず有効
    p1.field.spirits.push(dyranno)

    const superHost = createInstance("BS10-X01", s.turn, 1) // 【超覚醒】持ち
    p1.field.spirits.push(superHost)
    const superBrave = createInstance("BS11-049", s.turn, 0) // minCost:3。BS10-X01のコストで満たす
    p1.field.spirits.push(superBrave)
    attachBrave(s, "p1", superHost, superBrave)
    refreshLevelAsOverrides(s)

    const normalHost = createInstance("BS13-001", s.turn, 1) // 【超覚醒】を持たない
    p1.field.spirits.push(normalHost)
    const normalBrave = createInstance("BS10-064", s.turn, 0) // 合体条件バニラ
    p1.field.spirits.push(normalBrave)
    attachBrave(s, "p1", normalHost, normalBrave)
    refreshLevelAsOverrides(s)

    detachBraveByEffect(s, "p1", superHost, superBrave)
    assert(
        (superHost.braveRefs?.length ?? 0) === 1,
        "【超覚醒】を持つ合体スピリットは分離が拒否される（braveRefsが残ったまま）",
    )

    detachBraveByEffect(s, "p1", normalHost, normalBrave)
    assert(
        normalHost.braveRefs === undefined,
        "【超覚醒】を持たない合体スピリットは従来どおり分離できる",
    )
}

console.log("=== J: BP合計（系統）まで好きなだけ破壊 ===")
{
    const s = game("j-family-bp-budget")
    const p1 = s.players.p1
    const p2 = s.players.p2
    // 系統「竜人」を持つ自分のスピリットのBP合計＝2000＋3000＝5000（BS11-005はバニラで自己BP増加のアウラを持たない）
    p1.field.spirits.push(createInstance("BS01-004", s.turn, 1)) // ドラグノ偵察兵：竜人・Lv1 BP2000
    p1.field.spirits.push(createInstance("BS11-005", s.turn, 1)) // 頭竜人パキケファロン：竜人・Lv1 BP3000・バニラ
    const cheap = createInstance("BS01-003", s.turn, 1) // テラノセイバー：Lv1 BP4000
    const cheap2 = createInstance("BS01-001", s.turn, 1) // ゴラドン：Lv1 BP1000（4000+1000=5000でちょうど収まる）
    const expensive = createInstance("BS10-028", s.turn, 1) // マタンゴル：バニラ・Lv1 BP6000（予算オーバー）
    p2.field.spirits.push(cheap, cheap2, expensive)
    refreshLevelAsOverrides(s)

    resolveAction(s, "p1", null, { type: "destroyByBpBudget", budgetFromFamilyBpSum: ["竜人"] })

    assert(p2.field.spirits.every((sp) => sp.instanceId !== cheap.instanceId), "BP4000は予算5000に収まり破壊された")
    assert(p2.field.spirits.every((sp) => sp.instanceId !== cheap2.instanceId), "BP1000も合わせて予算ちょうどまで破壊された")
    assert(p2.field.spirits.some((sp) => sp.instanceId === expensive.instanceId), "BP6000は系統BP合計の予算5000を超えるので生き残る")
}

console.log("=== N: 【超覚醒】の支払い元をリザーブへ変える継続付与 ===")
{
    const s = game("n-awaken-from-reserve")
    const p1 = s.players.p1
    const ankylo = createInstance("BS13-002", s.turn, 2) // Lv2でリザーブからの覚醒を許可
    p1.field.spirits.push(ankylo)
    const superSpirit = createInstance("BS10-X01", s.turn, 1) // 【超覚醒】持ち
    superSpirit.isRested = true
    p1.field.spirits.push(superSpirit)
    const normalSpirit = createInstance("BS13-001", s.turn, 1) // 【超覚醒】を持たない
    p1.field.spirits.push(normalSpirit)
    p1.reserve = 5
    refreshLevelAsOverrides(s)
    // 【覚醒】はフラッシュタイミング限定のアクション（validateAwaken）なので、その場を作る
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"

    assert(
        canAwakenFromReserve(s, "p1", superSpirit) === true,
        "【超覚醒】持ちにはリザーブからの【覚醒】が許可される",
    )
    assert(
        canAwakenFromReserve(s, "p1", normalSpirit) === false,
        "【超覚醒】を持たないスピリットにはsuperAwakenOnlyの付与が及ばない",
    )

    const before = p1.reserve
    const err = handleAction(s, "p1", {
        type: "awaken",
        instanceId: superSpirit.instanceId,
        fromInstanceId: AWAKEN_FROM_RESERVE,
        count: 1,
    })
    assert(err === null, `リザーブからの【覚醒】が通る: ${err}`)
    assert(p1.reserve === before - 1, "リザーブのコアが1個減った")
    assert(superSpirit.cores === 2, "対象のコアが1個増えた")
    assert(!superSpirit.isRested, "【超覚醒】なのでコアを置いたことで回復した")
}

console.log("すべてのチェックに合格しました 🎉（part298）")
