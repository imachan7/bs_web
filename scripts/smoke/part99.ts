// smoke パート99（ライフ受けのフラッシュタイミング修正の検証）
//
// 背景：実プレイでは、フラッシュタイミングは防御側→攻撃側の順に1つずつフラッシュを使い、
// 両者が連続で「使わない」を選んだ時点で終わる（フラッシュ①）。ブロック宣言はこの手順どおり
// フラッシュ②を再オープンするが、ライフで受ける場合はフラッシュ②を開かず、宣言した場で
// そのままライフダメージが解決する（ユーザー確認済み・2026-08-02）。
// takeLife はフラッシュ①終了後にのみ宣言でき、宣言と同時に resolveLifeDamage が解決する。
//
// 収録セクション:
//   - フラッシュ①を閉じてからライフで受けると、その場でライフダメージが解決する（フラッシュ②は開かない）
//   - 宣言後はフラッシュ②が開かないため、攻撃側はもうフラッシュマジックを使えない
//   - フラッシュ①中にアタッカーが破壊されていたら、ライフで受けてもダメージは発生しない
//   - 宣言後はバトルが終了しているため、block／再度の takeLife が拒否される
//   - 致死ダメージでも正しく勝敗が決まる
import { act, assert, createGame, createInstance, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState } from "./helpers"

function setup(seed: string): { s: GameState; atk: ReturnType<typeof createInstance> } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.players.p1.hand[0] = "BS01-001" // ゴラドン: コスト0・維持1・Lv1 BP1000・シンボル1
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "p1: ゴラドンを召喚")
    const atk = s.players.p1.field.spirits[0]!
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ゴラドンでアタック")
    return { s, atk }
}

console.log("=== フラッシュ①を閉じてからライフで受けると、その場でライフダメージが解決する ===")
{
    const { s } = setup("takelife-declare")
    // ライフ受け宣言はフラッシュタイミングの外（フラッシュ①終了後）でのみ行える
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(s.isFlashTiming === false, "フラッシュ①が閉じる")
    const lifeBefore = s.players.p2.life
    const reserveBefore = s.players.p2.reserve
    assert(act(s, "p2", { type: "takeLife" }) === null, "p2: ライフで受ける")
    assert(s.players.p2.life === lifeBefore - 1, "宣言した場でライフダメージが解決する（ゴラドンのシンボル数）")
    assert(s.players.p2.reserve === reserveBefore + 1, "ダメージ分のコアがリザーブへ")
    assert(s.battle === null, "バトルはその場で終了する")
    assert(s.isFlashTiming === false, "フラッシュ②は開かない")
}

console.log("=== 宣言後はフラッシュ②が開かないため、攻撃側はもうフラッシュマジックを使えない ===")
{
    const { s, atk } = setup("takelife-no-reopen")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    s.players.p1.hand[0] = "BS01-118" // コールオブロスト: フラッシュ bpBuff+2000（targetInstanceId必須）
    const lifeBefore = s.players.p2.life

    assert(act(s, "p2", { type: "takeLife" }) === null, "p2: ライフで受ける（即解決）")
    assert(s.players.p2.life === lifeBefore - 1, "ライフダメージは即座に解決される")
    assert(s.battle === null, "バトルはすでに終了している")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId }) !== null,
        "バトル終了後なのでフラッシュマジックは使えない（フラッシュ②が開かないことの確認・旧バグの修正確認）",
    )
}

console.log("=== フラッシュ①中にアタッカーが破壊されたら、その場でバトルが終了する ===")
{
    // ⚠️ **この節は 2026-08-23 に期待値を書き換えた**。
    // 以前はここで「パス → パス → ライフで受ける」を通し、
    // 「ライフで受けてもダメージは発生しない」ことだけを確かめていた。
    // それは当時の実装の写しで、**アタッカーが居ないのに防御側が選択を迫られる**という
    // 誤った手順を仕様として固定してしまっていた（利用者report → 2026-08-23 ユーザー確認）。
    // 正しくは、アタックしていたスピリットが場を離れた時点でそのアタックは終了する。
    const { s, atk } = setup("takelife-attacker-destroyed")
    s.players.p2.hand[0] = "BS01-121" // フレイムダンス: フラッシュ destroy（maxBp4000・anySide）コスト5
    const lifeBefore = s.players.p2.life

    // フラッシュ①中に防御側がアタッカーを破壊する
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId }) === null,
        "防御側がフレイムダンスでアタッカー（BP1000）を破壊",
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === atk.instanceId),
        "アタッカーは場を離れる",
    )
    // フレイムダンスのコスト5を支払った後のリザーブを基準にする（コスト支払いはこの検証の対象外）
    const reserveAfterMagic = s.players.p2.reserve

    assert(s.battle === null, "アタッカーが場を離れた時点でバトルが終了する")
    assert(!s.isFlashTiming, "フラッシュタイミングも閉じる")
    assert(act(s, "p2", { type: "takeLife" }) !== null, "ライフで受ける宣言はできない（バトルが無い）")
    assert(s.players.p2.life === lifeBefore, "ライフダメージは発生しない")
    assert(s.players.p2.reserve === reserveAfterMagic, "ライフダメージ解決によるリザーブ増減は発生しない")
    assert(s.winner === null, "勝敗はまだ決まらない")
}

console.log("=== 宣言後はバトルが終了しているため、block・再度の takeLife が拒否される ===")
{
    const { s } = setup("takelife-no-switch")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    const blocker = createInstance("BS01-001", s.turn, 1) // Lv1 BP1000（ブロック候補）
    s.players.p2.field.spirits.push(blocker)

    assert(act(s, "p2", { type: "takeLife" }) === null, "p2: ライフで受ける（即解決）")
    assert(s.battle === null, "バトルは終了している")
    assert(
        act(s, "p2", { type: "block", instanceId: blocker.instanceId }) !== null,
        "バトル終了後のためブロックはできない",
    )
    assert(
        act(s, "p2", { type: "takeLife" }) !== null,
        "バトル終了後のため再度のライフ受けもできない",
    )
}

console.log("=== 致死ダメージでも正しく勝敗が決まる ===")
{
    const { s } = setup("takelife-lethal")
    s.players.p2.life = 1
    assert(takeLifeAndResolve(s, "p2") === null, "p2: ライフで受けて解決（takeLifeAndResolve）")
    assert(s.players.p2.life <= 0, "ライフが0以下になる")
    assert(s.winner === "p1", "攻撃側の勝利が決まる")
}
