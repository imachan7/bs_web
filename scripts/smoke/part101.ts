// smoke パート101（アタックステップの手順修正：フラッシュタイミング中はブロック／ライフ受けを
// 宣言できないことの検証）
//
// 背景：実プレイの正しい手順は
//   アタック宣言 → フラッシュ①（防御側→攻撃側、両者連続パスで終了）
//     → ブロック宣言（→フラッシュ②→バトル解決） または ライフで受ける（即座にライフダメージ解決）
// だったが、旧実装は「フラッシュタイミング中でも優先権さえあればブロック／ライフ受けを宣言できる」
// 状態になっていた（validateBlock / validateTakeLife が isFlashTiming && pid !== priorityPlayer
// のときだけ拒否しており、優先権を持っていれば通ってしまっていた）。
// isFlashTiming中は優先権の有無に関わらず拒否するよう修正した。
//
// 収録セクション:
//   - アタック宣言直後（フラッシュ①中）は、防御側が優先権を持っていてもblock/takeLifeとも拒否される
//   - 両者が連続パスしてフラッシュ①が閉じると、そこで初めてblock/takeLifeが通る
//   - ブロック宣言後はフラッシュ②が開き、両者パスでバトルが解決する（回帰確認）
//   - ライフ受け宣言後はフラッシュ②を開かず、その場でライフダメージが解決する（回帰確認）
//   - フラッシュ①で防御側がフラッシュマジックを使うと優先権が攻撃側へ移り、
//     その後も両者が連続パスするまではブロックできない（1回使っただけでは手順が進まない）
import { act, assert, createGame, createInstance, declareBlock, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState } from "./helpers"

function setup(seed: string): { s: GameState; atk: ReturnType<typeof createInstance>; blk: ReturnType<typeof createInstance> } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const atk = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    const blk = createInstance("BS01-001", s.turn, 1) // 同型のブロック候補
    s.players.p1.field.spirits.push(atk)
    s.players.p2.field.spirits.push(blk)
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ゴラドンでアタック")
    return { s, atk, blk }
}

console.log("=== アタック宣言直後（フラッシュ①中）はblock/takeLifeとも拒否される（優先権があっても） ===")
{
    const { s, blk } = setup("part101-flash1-blocks-both")
    assert(s.isFlashTiming === true, "アタック直後はフラッシュ①中")
    assert(s.priorityPlayer === "p2", "優先権は防御側にある")
    const blockErr = act(s, "p2", { type: "block", instanceId: blk.instanceId })
    assert(blockErr !== null, "優先権があってもフラッシュ①中はブロックを宣言できない")
    assert(
        String(blockErr).includes("フラッシュタイミング"),
        `拒否理由がフラッシュタイミング中であること（実際: ${blockErr}）`,
    )
    const lifeErr = act(s, "p2", { type: "takeLife" })
    assert(lifeErr !== null, "優先権があってもフラッシュ①中はライフで受けられない")
    assert(
        String(lifeErr).includes("フラッシュタイミング"),
        `拒否理由がフラッシュタイミング中であること（実際: ${lifeErr}）`,
    )
}

console.log("=== 両者が連続パスしてフラッシュ①が閉じると、そこで初めてblockが通る ===")
{
    const { s, blk } = setup("part101-flash1-close-then-block")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(s.isFlashTiming === true, "1回のパスだけではまだフラッシュ①は閉じない")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（両者連続でフラッシュ①終了）")
    assert(s.isFlashTiming === false, "フラッシュ①が閉じる")
    assert(act(s, "p2", { type: "block", instanceId: blk.instanceId }) === null, "フラッシュ①終了後はブロックを宣言できる")
}

console.log("=== 両者が連続パスしてフラッシュ①が閉じると、そこで初めてtakeLifeが通る ===")
{
    const { s } = setup("part101-flash1-close-then-takelife")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    const lifeBefore = s.players.p2.life
    assert(act(s, "p2", { type: "takeLife" }) === null, "フラッシュ①終了後はライフで受けられる")
    assert(s.players.p2.life === lifeBefore - 1, "宣言した場でライフダメージが解決する")
}

console.log("=== ブロック宣言後はフラッシュ②が開き、両者パスでバトルが解決する（回帰確認） ===")
{
    const { s, blk } = setup("part101-block-reopens-flash2")
    assert(declareBlock(s, "p2", blk.instanceId) === null, "フラッシュ①を閉じてからブロック宣言")
    assert(s.battle !== null, "ブロック宣言では即解決しない")
    assert(s.isFlashTiming === true, "ブロック宣言でフラッシュ②が開く")
    assert(s.priorityPlayer === "p2", "フラッシュ②は防御側から優先権を持つ")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（両者連続パスで解決）")
    assert(s.battle === null, "バトルが解決される（同BPで相打ち）")
}

console.log("=== ライフ受け宣言後はフラッシュ②を開かず、その場でライフダメージが解決する（回帰確認） ===")
{
    const { s } = setup("part101-takelife-no-flash2")
    const lifeBefore = s.players.p2.life
    assert(takeLifeAndResolve(s, "p2") === null, "フラッシュ①を閉じてからライフで受ける")
    assert(s.players.p2.life === lifeBefore - 1, "ライフダメージが即座に解決される")
    assert(s.battle === null, "バトルはその場で終了する（フラッシュ②は開かない）")
    assert(s.isFlashTiming === false, "フラッシュ②は開かない")
}

console.log("=== フラッシュ①で防御側がフラッシュマジックを使っても、それだけではブロックに進めない ===")
{
    const { s, blk } = setup("part101-flash-magic-once-not-enough")
    s.players.p2.hand[0] = "BS01-123" // リターンドロー: フラッシュ bpBuff+1000
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: blk.instanceId }) === null,
        "防御側がフラッシュ①中にリターンドローを使用",
    )
    assert(s.priorityPlayer === "p1", "使用で優先権が攻撃側へ移る")
    assert(s.isFlashTiming === true, "1回使っただけではフラッシュ①は終わらない")
    // 優先権が攻撃側にある状態でも、防御側は依然としてブロック／ライフ受けを宣言できない
    const blockErr = act(s, "p2", { type: "block", instanceId: blk.instanceId })
    assert(blockErr !== null, "マジック使用直後もフラッシュ①中はブロックを宣言できない")
    const lifeErr = act(s, "p2", { type: "takeLife" })
    assert(lifeErr !== null, "マジック使用直後もフラッシュ①中はライフで受けられない")
    // 優先権を持つ攻撃側がパスし、防御側もパスして初めてフラッシュ①が閉じる
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（優先権を得て）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（両者連続パスでフラッシュ①終了）")
    assert(s.isFlashTiming === false, "フラッシュ①が閉じる")
    assert(act(s, "p2", { type: "block", instanceId: blk.instanceId }) === null, "フラッシュ①終了後はブロックできる")
}
