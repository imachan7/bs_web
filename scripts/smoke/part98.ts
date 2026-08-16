// smoke パート98（効果文の「スピリット」＝自分と相手の両方、の修正検証）
//
// 背景：バトルスピリッツでは、効果文で単に「スピリット」と書かれた対象は自分と相手の両方を指す
// （「相手のスピリット」と明記されているときだけ片側に限定される）。ところが destroy / exhaust /
// destroyExhausted / returnToHand / coreRemove などのアクションは既定が「相手のみ」で、
// data/cards.json 側で anySide を付け忘れたカードが相手しか対象にできない状態だった。
//
// 収録セクション:
//   - BS01-040 ダークウィッチ：『アタック時』自分か相手の疲労スピリット1体を破壊（destroyExhausted anySide）
//   - BS01-036 シャ・ズー：『破壊時』スピリット2体までを疲労（exhaust anySide）
//   - BS01-090 ヘル・ブリンディ：『召喚時』スピリット1体を持ち主の手札へ（returnToHand anySide）
//   - BS01-017 ランスラプトル：『召喚時』BP2000以下のスピリット1体を破壊できる（destroy anySide）
//   - BS01-129 ポイズンシュート：フラッシュでスピリット1体のコア1個を持ち主のリザーブへ（coreRemove anySide）
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function put(
    s: GameState,
    pid: PlayerId,
    cardId: string,
    cores: number,
    opts: { rested?: boolean; bpBuff?: number } = {},
): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    if (opts.rested) inst.isRested = true
    if (opts.bpBuff) inst.tempBpBuff = opts.bpBuff
    s.players[pid].field.spirits.push(inst)
    return inst
}

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    return s
}

function toAttackStep(s: GameState): void {
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")
}

console.log("=== BS01-040 ダークウィッチ：『自分か相手の』疲労スピリットを破壊できる ===")
{
    const s = setup("anyside-darkwitch")
    // 自分側の疲労スピリットの方が実効BPが高い状況を作る（自動選択は両陣営から実効BP最大を選ぶ）
    const ownRested = put(s, "p1", "BS01-001", 1, { rested: true, bpBuff: 5000 }) // ゴラドンLv1 1000+5000=6000
    const oppRested = put(s, "p2", "BS01-001", 1, { rested: true }) // ゴラドンLv1 1000
    const witch = put(s, "p1", "BS01-040", 3) // ダークウィッチLv2（BP3000）
    toAttackStep(s)

    assert(act(s, "p1", { type: "attack", instanceId: witch.instanceId }) === null, "ダークウィッチでアタック宣言")
    assert(
        s.players.p1.field.spirits.every((sp) => sp.instanceId !== ownRested.instanceId),
        "実効BP最大だった自分の疲労スピリットが破壊される（anySideが効いている）",
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === oppRested.instanceId),
        "相手の疲労スピリットは残る（選ばれなかっただけ）",
    )
}

console.log("--- 相手側の実効BPが最大なら従来どおり相手が対象になる（回帰確認） ---")
{
    const s = setup("anyside-darkwitch-opponly")
    // アタック宣言でダークウィッチ自身（BP3000）も疲労して候補に入るため、
    // 相手側をそれより高いBPにして「相手が選ばれる」ことを確かめる
    const oppRested = put(s, "p2", "BS01-001", 1, { rested: true, bpBuff: 5000 }) // 実効6000
    const witch = put(s, "p1", "BS01-040", 3)
    toAttackStep(s)

    assert(act(s, "p1", { type: "attack", instanceId: witch.instanceId }) === null, "ダークウィッチでアタック宣言")
    assert(
        s.players.p2.field.spirits.every((sp) => sp.instanceId !== oppRested.instanceId),
        "相手の疲労スピリットが破壊される",
    )
}

console.log("=== BS01-036 シャ・ズー：『破壊時』の疲労が両陣営に及ぶ ===")
{
    const s = setup("anyside-shazoo")
    const shazoo = put(s, "p1", "BS01-036", 1) // シャ・ズーLv1（BP2000）
    const ownOther = put(s, "p1", "BS01-001", 1) // 自分の回復状態スピリット
    const blocker = put(s, "p2", "BS01-001", 3) // ゴラドンLv2（BP3000）＝バトルで勝つ側
    const oppOther = put(s, "p2", "BS01-001", 1) // 相手の回復状態スピリット
    toAttackStep(s)

    assert(act(s, "p1", { type: "attack", instanceId: shazoo.instanceId }) === null, "シャ・ズーでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ゴラドンLv2でブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決＝シャ・ズー破壊）")

    assert(
        s.players.p1.field.spirits.every((sp) => sp.instanceId !== shazoo.instanceId),
        "シャ・ズーはBP負けで破壊された",
    )
    const ownAfter = s.players.p1.field.spirits.find((sp) => sp.instanceId === ownOther.instanceId)
    const oppAfter = s.players.p2.field.spirits.find((sp) => sp.instanceId === oppOther.instanceId)
    assert(ownAfter?.isRested === true, "自分のスピリットも疲労させられる（anySideが効いている）")
    assert(oppAfter?.isRested === true, "相手のスピリットも疲労させられる")
}

console.log("=== BS01-090 ヘル・ブリンディ：『召喚時』自分のスピリットも手札に戻せる ===")
{
    const s = setup("anyside-brindi")
    const ownBig = put(s, "p1", "BS01-001", 1, { bpBuff: 5000 }) // 実効BP6000＝両陣営で最大
    const oppSmall = put(s, "p2", "BS01-001", 1)
    s.players.p1.hand[0] = "BS01-090"
    s.players.p1.reserve = 10
    const handBefore = s.players.p1.hand.length

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ヘル・ブリンディを召喚")
    assert(
        s.players.p1.field.spirits.every((sp) => sp.instanceId !== ownBig.instanceId),
        "実効BP最大だった自分のスピリットが手札に戻る（anySideが効いている）",
    )
    assert(s.players.p1.hand.length === handBefore, "手札は1枚使って1枚戻るので増減なし")
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === oppSmall.instanceId),
        "相手のスピリットは残る",
    )
}

console.log("=== BS01-017 ランスラプトル：『召喚時』自分のスピリットも破壊対象にできる ===")
{
    const s = setup("anyside-lanceraptor")
    // 相手フィールドは空。anySide 化前はここで不発だったが、いまは自分側が候補になる。
    // 非対話時の自動選択は実効BP最大なので、ゴラドンLv1（1000）ではなく
    // ランスラプトル自身（Lv1 BP2000）が選ばれる（実対戦は interactiveTargets で選択できる）
    const ownSmall = put(s, "p1", "BS01-001", 1) // ゴラドンLv1（BP1000）
    s.players.p1.hand[0] = "BS01-017"
    s.players.p1.reserve = 10

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ランスラプトルを召喚")
    assert(
        s.players.p1.field.spirits.every((sp) => sp.cardId !== "BS01-017"),
        "相手がいなくても自分側から対象が選ばれる（実効BP最大＝ランスラプトル自身が破壊された）",
    )
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === ownSmall.instanceId),
        "実効BPが低いゴラドンは選ばれず残る",
    )
}

console.log("=== BS01-129 ポイズンシュート：フラッシュで自分のスピリットのコアも減らせる ===")
{
    const s = setup("anyside-poisonshot")
    const attacker = put(s, "p1", "BS01-001", 1)
    const ownTarget = put(s, "p1", "BS01-001", 3) // コア3
    s.players.p1.hand[0] = "BS01-129"
    s.players.p1.reserve = 10
    toAttackStep(s)

    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパスして攻撃側に優先権が移る")
    const reserveBefore = s.players.p1.reserve
    assert(
        act(s, "p1", {
            type: "castMagic",
            handIndex: 0,
            targetInstanceId: ownTarget.instanceId,
        }) === null,
        "自分のスピリットを対象にポイズンシュートを使用",
    )
    const after = s.players.p1.field.spirits.find((sp) => sp.instanceId === ownTarget.instanceId)
    assert(after?.cores === 2, "自分のスピリットのコアが1個減る（anySideが効いている）")
    // コスト5を支払った後にコア1個がリザーブへ戻るため、支払い後より1多い
    assert(s.players.p1.reserve === reserveBefore - 5 + 1, "取り除いたコアは持ち主（自分）のリザーブへ")
}
