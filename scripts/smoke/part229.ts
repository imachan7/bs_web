// smoke パート229（anySide のマジックは、両陣営から対象を選べる。2026-08-23）
//
// part223 で「マジックの対象は条件に合うものだけ採用する」を入れたが、anySide
// （陣営を書いていない「スピリット1体を〜」）の8枚だけはクライアント側の制限で救えなかった。
// クライアントは片側しか選ばせられず、選べるはずの側がサーバーへ届かなかったためである。
//
//   BS01-121 フレイムダンス      「BP4000以下のスピリット1体を破壊」なのに相手しか選べなかった
//   SD02-017 ストロングドロー    「スピリット1体をBP+3000」なのに自分しか選べなかった
//   BS01-131 ダークコフィン      同文のフラッシュ側に anySide が付いておらず、自分しか選べなかった
//
// renderer.ts の magicTargetSide が anySide の効果を先取りしなくなった（対象未指定で送る）ので、
// ここではサーバーが対象未指定を受けたときに両陣営から選ばせることを確かめる。
//
// castMagic だけ handleAction を直接呼ぶ（helpers.act は対話モードで pendingChoice を先に消化するため）
import { act, assert, createGame, createInstance, handleAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const FLAME_DANCE = "BS01-121" // フレイムダンス：BP4000以下のスピリット1体を破壊（anySide）
const STRONG_DRAW = "SD02-017" // ストロングドロー：フラッシュでスピリット1体をBP+3000（anySide）
const DARK_COFFIN = "BS01-131" // ダークコフィン：フラッシュでスピリット1体をBP+4000（anySide）
const SMALL = "BS01-004" // ドラグノ偵察兵：コスト2 / Lv1 BP2000

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

// フラッシュのマジックを使えるところまで進める（アタック宣言 → 防御側パスで優先権が攻撃側へ）。
// 自分側・相手側それぞれにスピリットが1体ずついる状態を作る
function setup(name: string, hand: string[]): { s: GameState; mine: string; theirs: string } {
    const s = createGame(name, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p1.reserve = 20
    s.players.p1.hand = hand
    const mine = putSpirit(s, "p1", SMALL, 1)
    const theirs = putSpirit(s, "p2", SMALL, 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: mine }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（優先権が攻撃側へ）")
    return { s, mine, theirs }
}

console.log("=== フレイムダンス：破壊の候補に自分のスピリットも並ぶ ===")
{
    const { s, mine, theirs } = setup("flame-dance-anyside", [FLAME_DANCE])
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(!!s.pendingChoice, "対象未指定なのでサーバーが選ばせる")
    assert(s.pendingChoice!.candidates.includes(theirs), "相手のスピリットが候補に入る")
    assert(s.pendingChoice!.candidates.includes(mine), "自分のスピリットも候補に入る（anySide）")
}

console.log("=== フレイムダンス：自分のスピリットを選ぶと、自分のスピリットが破壊される ===")
{
    const { s, mine } = setup("flame-dance-pick-own", [FLAME_DANCE])
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: mine }) === null, "自分のスピリットを選ぶ")
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === mine),
        "選んだ自分のスピリットが破壊された",
    )
}

console.log("=== ストロングドロー：BP増加の候補に相手のスピリットも並ぶ ===")
{
    const { s, mine, theirs } = setup("strong-draw-anyside", [STRONG_DRAW])
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(!!s.pendingChoice, "対象未指定なのでサーバーが選ばせる")
    assert(s.pendingChoice!.candidates.includes(mine), "自分のスピリットが候補に入る")
    assert(s.pendingChoice!.candidates.includes(theirs), "相手のスピリットも候補に入る（anySide）")

    assert(act(s, "p1", { type: "resolveChoice", instanceId: theirs }) === null, "相手のスピリットを選ぶ")
    const buffed = s.players.p2.field.spirits.find((sp) => sp.instanceId === theirs)!
    assert(buffed.tempBpBuff === 3000, `選んだ相手のスピリットがBP+3000（実際は${buffed.tempBpBuff}）`)
}

console.log("=== ダークコフィンのフラッシュ：BP増加の候補に相手のスピリットも並ぶ ===")
{
    const { s, mine, theirs } = setup("dark-coffin-flash-anyside", [DARK_COFFIN])
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(!!s.pendingChoice, "対象未指定なのでサーバーが選ばせる")
    assert(
        s.pendingChoice!.candidates.includes(mine) && s.pendingChoice!.candidates.includes(theirs),
        "両陣営が候補に入る",
    )

    assert(act(s, "p1", { type: "resolveChoice", instanceId: theirs }) === null, "相手のスピリットを選ぶ")
    const buffed = s.players.p2.field.spirits.find((sp) => sp.instanceId === theirs)!
    assert(buffed.tempBpBuff === 4000, `選んだ相手のスピリットがBP+4000（実際は${buffed.tempBpBuff}）`)
}

console.log("=== 非対話（テスト・自動解決）では、従来どおり自分の場から自動選択する ===")
{
    const { s, mine } = setup("strong-draw-non-interactive", [STRONG_DRAW])
    s.interactiveTargets = false
    // このアタッカーは【アタック時】で既にBP+2000されているため、増分で見る
    const before = s.players.p1.field.spirits.find((sp) => sp.instanceId === mine)!.tempBpBuff
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(!s.pendingChoice, "非対話なので選択待ちにならない")
    const buffed = s.players.p1.field.spirits.find((sp) => sp.instanceId === mine)!
    assert(
        buffed.tempBpBuff - before === 3000,
        `自分のスピリットがBP+3000（実際は+${buffed.tempBpBuff - before}）`,
    )
}
