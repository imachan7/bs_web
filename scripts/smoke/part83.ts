// smoke パート83（BS04-054 アルカナソルジャー・サンク Lv2 ＝ マジックの対象の絞り込み）
//
// kind "magicTargetRedirect"：相手が使用したマジックがサンクを対象に含むとき、
// そのマジックの効果の対象をサンク**のみ**にする（＝同じ持ち主の他のスピリットは効果を受けない）。
// 「対象に含む」には全体効果も含まれる（利用者確認。DECISIONS.md）。
// 実装は GameState.magicRedirectTo を resolveMagic が立て、isEffectBlocked が各ガード地点で参照する。
// 「できる」は自動適用の簡略化。
import { act, assert, createGame, createInstance } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

// p1 = サンクの持ち主 / p2 = マジックを使う側。『相手のターン』のため turnPlayer は p2
function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p2"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

const alive = (s: GameState, pid: PlayerId, inst: ReturnType<typeof createInstance>): boolean =>
    s.players[pid].field.spirits.some((x) => x.instanceId === inst.instanceId)

console.log("=== BS04-054 アルカナソルジャー・サンク Lv2：相手の全体マジックの対象を自身のみに絞る ===")
{
    const s = setup("sank-redirect-test")
    const sank = put(s, "p1", "BS04-054", 2) // サンク Lv2（BP4000）
    const ally1 = put(s, "p1", "BS02-049", 1) // ピヨン（BP1000）
    const ally2 = put(s, "p1", "BS02-051", 1) // チュンポポ（BP1000）

    // BS01-122 フレイムテンペスト：BP3000以下のスピリットすべてを破壊（anySide）
    // サンク自身は BP4000 のため対象外 → 絞り込みは起きず、味方2体が巻き込まれる
    s.players.p2.hand[0] = "BS01-122"
    s.players.p2.reserve = 20
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "フレイムテンペストを使用")
    assert(alive(s, "p1", sank), "BP4000のサンクはBP3000以下の効果を受けない")
    assert(!alive(s, "p1", ally1), "サンクが対象に含まれないので、味方は通常どおり巻き込まれる")
    assert(!alive(s, "p1", ally2), "同上")
}

console.log("--- サンクが対象に含まれる全体マジックでは、味方が守られる ---")
{
    const s = setup("sank-redirect-hit-test")
    const sank = put(s, "p1", "BS04-054", 1) // サンク Lv1（BP3000）＝フレイムテンペストの対象に入る
    const ally1 = put(s, "p1", "BS02-049", 1)
    const ally2 = put(s, "p1", "BS02-051", 1)

    // Lv1 では効果を持たないため、まず「絞り込みが起きない」ことを確認する
    s.players.p2.hand[0] = "BS01-122"
    s.players.p2.reserve = 20
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "フレイムテンペストを使用")
    assert(!alive(s, "p1", sank), "Lv1のサンクは効果を持たないため破壊される")
    assert(!alive(s, "p1", ally1), "Lv1では味方も守られない")
    assert(!alive(s, "p1", ally2), "同上")
}

console.log("--- Lv2 でサンクが対象に含まれるとき、サンクだけが効果を受ける ---")
{
    const s = setup("sank-redirect-lv2-test")
    // サンク Lv2（cores2・BP4000）。BP4000以下を破壊するマジックで「対象に含む」状況を作る
    const sank = put(s, "p1", "BS04-054", 2)
    const ally1 = put(s, "p1", "BS02-049", 1)
    const ally2 = put(s, "p1", "BS02-051", 1)

    s.players.p2.hand[0] = "BS01-122" // フレイムテンペスト（BP3000以下を全体破壊）
    s.players.p2.reserve = 20
    // コアを減らして BP3000 にすると Lv1 になり効果自体が無効になってしまうため、
    // 「Lv2 のままBP3000以下」を tempBpBuff で作って対象に入れる
    sank.tempBpBuff = -1000 // BP4000 → 3000（Lv2のまま対象に入る）
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "フレイムテンペストを使用")

    assert(!alive(s, "p1", sank), "対象に含まれたサンク自身は効果を受ける")
    assert(alive(s, "p1", ally1), "対象がサンクのみに絞られ、味方は効果を受けない")
    assert(alive(s, "p1", ally2), "同上")
}

console.log("--- 自分のターン（サンクの持ち主のターン）には働かない ---")
{
    const s = setup("sank-ownturn-test")
    s.turnPlayer = "p1" // サンクの持ち主のターン＝『相手のターン』ではない
    const sank = put(s, "p1", "BS04-054", 2)
    sank.tempBpBuff = -1000
    const ally1 = put(s, "p1", "BS02-049", 1)

    // 自分（p1）のターンなので、相手（p2）はバトル中のフラッシュでしか使用できない。
    // バトルを作って優先権を p2 に渡す（アタッカーは BP4000 でテンペストの対象外）
    const attacker = put(s, "p1", "BS01-020", 1) // 翼刃竜スティラノドン Lv1（BP4000）
    s.phase = "attack"
    s.battle = {
        attackerInstanceId: attacker.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    s.players.p2.hand[0] = "BS01-122"
    s.players.p2.reserve = 20
    s.isFlashTiming = true
    s.priorityPlayer = "p2"
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "相手がフラッシュでフレイムテンペストを使用")
    assert(!alive(s, "p1", sank), "サンクは破壊される")
    assert(!alive(s, "p1", ally1), "自分のターンでは絞り込みが働かず、味方も巻き込まれる")
}

console.log("--- 絞り込みは解決中のマジックにのみ効き、次のマジックには持ち越さない ---")
{
    const s = setup("sank-notpersist-test")
    const sank = put(s, "p1", "BS04-054", 2)
    sank.tempBpBuff = -1000
    const ally1 = put(s, "p1", "BS02-049", 1)

    s.players.p2.hand[0] = "BS01-122"
    s.players.p2.reserve = 20
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "1枚目のフレイムテンペスト")
    assert(alive(s, "p1", ally1), "1枚目では味方が守られる")
    assert(s.magicRedirectTo === undefined, "解決後に絞り込みフラグが解除されている")

    // サンクがいなくなった状態で2枚目 → 通常どおり全体に当たる
    s.players.p2.hand[0] = "BS01-122"
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "2枚目のフレイムテンペスト")
    assert(!alive(s, "p1", ally1), "サンク不在なら味方は守られない")
}

console.log("=== 実対戦では絞り込むかを守る側に確認する（『〜にできる』の任意性） ===")
{
    // 2026-08-10 修正: 以前は「できる」を選べず常に自動で絞り込んでいた。
    // 対話モードでは、マジックの解決に入る前に守る側（サンクの持ち主）へ1回だけ確認する
    const s = setup("sank-redirect-confirm")
    s.interactiveTargets = true
    const sank = put(s, "p1", "BS04-054", 2) // Lv2＝効果が有効
    sank.tempBpBuff = -1000 // BP4000→3000。Lv2のままフレイムテンペストの対象に入れる
    const ally1 = put(s, "p1", "BS02-049", 1)
    const ally2 = put(s, "p1", "BS02-051", 1)
    s.players.p2.hand[0] = "BS01-122" // フレイムテンペスト（BP3000以下を全体破壊）

    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "相手がマジックを使用")
    assert(s.pendingChoice !== null, "絞り込むかの確認が立つ")
    assert(s.pendingChoice?.pid === "p1", "選択するのは守る側（サンクの持ち主）")
    assert(alive(s, "p1", ally1), "確認中はマジックの効果がまだ解決されていない")

    assert(
        act(s, "p1", { type: "resolveChoice", option: "このスピリットのみにする" }) === null,
        "「このスピリットのみにする」を選ぶ",
    )
    assert(s.pendingChoice === null, "選択待ちが解消される")
    assert(!alive(s, "p1", sank), "対象がサンクのみになるので、サンクは破壊される")
    assert(alive(s, "p1", ally1) && alive(s, "p1", ally2), "味方は守られる")
}

console.log("--- 絞り込まないことも選べる（味方が巻き込まれる） ---")
{
    const s = setup("sank-redirect-decline")
    s.interactiveTargets = true
    const sank = put(s, "p1", "BS04-054", 2)
    sank.tempBpBuff = -1000
    const ally1 = put(s, "p1", "BS02-049", 1)
    const ally2 = put(s, "p1", "BS02-051", 1)
    s.players.p2.hand[0] = "BS01-122"

    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "相手がマジックを使用")
    assert(s.pendingChoice !== null, "絞り込むかの確認が立つ")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "スキップ（絞り込まない）")
    assert(s.pendingChoice === null, "選択待ちが解消される")
    assert(!alive(s, "p1", sank), "絞り込まなくてもサンク自身は対象なので破壊される")
    assert(!alive(s, "p1", ally1) && !alive(s, "p1", ally2), "味方も通常どおり巻き込まれる")
}

console.log("--- 絞り込みが起こりえない場面では確認を出さない ---")
{
    const s = setup("sank-redirect-no-prompt")
    s.interactiveTargets = true
    const sank = put(s, "p1", "BS04-054", 2) // BP4000
    const ally1 = put(s, "p1", "BS02-049", 1)
    s.players.p2.hand[0] = "BS01-122" // BP3000以下＝サンクは対象外

    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "相手がマジックを使用")
    assert(s.pendingChoice === null, "サンクが対象に含まれないので確認は出さない")
    assert(alive(s, "p1", sank), "サンクは対象外なので残る")
    assert(!alive(s, "p1", ally1), "味方は通常どおり巻き込まれる")
}
