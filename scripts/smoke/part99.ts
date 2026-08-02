// smoke パート99（ライフ受けのフラッシュタイミング修正の検証）
//
// 背景：実プレイでは、フラッシュタイミングは防御側→攻撃側の順に1つずつフラッシュを使い、
// 両者が連続で「使わない」を選んだ時点で終わる。ブロック宣言はこの手順どおりフラッシュを
// 再オープンしていたが、ライフ受け（takeLife）は宣言と同時にライフダメージまで解決して
// バトルを終わらせていたため、フラッシュタイミングが丸ごと消えるバグがあった。
// takeLife を「宣言」（フラッシュ再オープン）と「解決」（resolveLifeDamage、両者パスで発火）に分割し、
// ブロック宣言と同じ手順に揃えた。
//
// 収録セクション:
//   - ライフ受け宣言は即解決せず、フラッシュタイミングを開く（優先権は防御側）
//   - 両者がパスするとライフダメージが解決される
//   - 宣言後のフラッシュで攻撃側がフラッシュマジックを使える（本題の修正）
//   - フラッシュ中にアタッカーが破壊されたら、ライフダメージなしでバトルが終了する
//   - 宣言後は block／再度の takeLife が拒否される
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

console.log("=== ライフ受け宣言は即解決せず、フラッシュタイミングを開く ===")
{
    const { s } = setup("takelife-declare")
    const lifeBefore = s.players.p2.life
    const reserveBefore = s.players.p2.reserve
    assert(act(s, "p2", { type: "takeLife" }) === null, "p2: ライフで受けることを宣言")
    assert(s.players.p2.life === lifeBefore, "宣言しただけではライフは減らない")
    assert(s.players.p2.reserve === reserveBefore, "宣言しただけではリザーブも増えない")
    assert(s.battle !== null, "バトルは継続中")
    assert(s.battle?.lifeDeclared === true, "battle.lifeDeclared が立つ")
    assert(s.isFlashTiming === true, "フラッシュタイミングが再オープンされる")
    assert(s.priorityPlayer === "p2", "優先権は防御側（宣言した側）")
    assert(s.flashCount === 0, "フラッシュカウントはリセットされる")
}

console.log("=== 両者がパスするとライフダメージが解決される ===")
{
    const { s } = setup("takelife-resolve-by-pass")
    const lifeBefore = s.players.p2.life
    const reserveBefore = s.players.p2.reserve
    assert(act(s, "p2", { type: "takeLife" }) === null, "p2: ライフで受けることを宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(s.battle !== null, "1回目のパスではまだ解決しない")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（両者連続パスで解決）")
    assert(s.players.p2.life === lifeBefore - 1, "ライフダメージ1が解決される（ゴラドンのシンボル数）")
    assert(s.players.p2.reserve === reserveBefore + 1, "ダメージ分のコアがリザーブへ")
    assert(s.battle === null, "バトルが終了する")
    assert(s.isFlashTiming === false, "フラッシュタイミングも終了する")
}

console.log("=== ライフ受け宣言後のフラッシュで、攻撃側がフラッシュマジックを使える（本題） ===")
{
    const { s, atk } = setup("takelife-attacker-flash")
    s.players.p1.hand[0] = "BS01-118" // コールオブロスト: フラッシュ bpBuff+2000（targetInstanceId必須）
    const lifeBefore = s.players.p2.life

    assert(act(s, "p2", { type: "takeLife" }) === null, "p2: ライフで受けることを宣言")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId }) !== null,
        "優先権のない攻撃側のマジックはまだ拒否される",
    )
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス → 優先権が攻撃側へ")
    assert(s.priorityPlayer === "p1", "優先権は攻撃側へ移る")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId }) === null,
        "優先権を得た攻撃側がフラッシュマジックを使える（旧バグではここに到達しなかった）",
    )
    assert(atk.tempBpBuff === 2000, "コールオブロストでBP+2000が適用される")
    assert(s.priorityPlayer === "p2", "使用後は優先権が防御側へ戻る")

    assert(act(s, "p2", { type: "pass" }) === null, "防御側の再パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側もパス（両者連続パスで解決）")
    assert(s.players.p2.life === lifeBefore - 1, "ライフダメージは通常どおり解決される")
    assert(s.battle === null, "バトルが終了する")
}

console.log("=== フラッシュ中にアタッカーが破壊されたら、ライフダメージなしでバトルが終了する ===")
{
    const { s, atk } = setup("takelife-attacker-destroyed")
    s.players.p2.hand[0] = "BS01-121" // フレイムダンス: フラッシュ destroy（maxBp4000・anySide）コスト5
    const lifeBefore = s.players.p2.life
    const reserveBefore = s.players.p2.reserve

    assert(act(s, "p2", { type: "takeLife" }) === null, "p2: ライフで受けることを宣言")
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId }) === null,
        "防御側がフレイムダンスでアタッカー（BP1000）を破壊",
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === atk.instanceId),
        "アタッカーは場を離れる",
    )
    assert(s.battle !== null, "破壊直後もバトル自体はまだ解決していない")
    // フレイムダンスのコスト5を支払った後のリザーブを基準にする（コスト支払いはこの検証の対象外）
    const reserveAfterMagic = s.players.p2.reserve
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側もパス（両者連続パスで解決）")
    assert(s.players.p2.life === lifeBefore, "アタッカー不在のためライフダメージは発生しない")
    assert(s.players.p2.reserve === reserveAfterMagic, "ライフダメージ解決によるリザーブ増減は発生しない")
    assert(s.battle === null, "バトルは終了する")
    assert(s.winner === null, "勝敗はまだ決まらない")
}

console.log("=== ライフ受け宣言後は block・再度の takeLife が拒否される ===")
{
    const { s } = setup("takelife-no-switch")
    const blocker = createInstance("BS01-001", s.turn, 1) // Lv1 BP1000（ブロック候補）
    s.players.p2.field.spirits.push(blocker)

    assert(act(s, "p2", { type: "takeLife" }) === null, "p2: ライフで受けることを宣言")
    assert(
        act(s, "p2", { type: "block", instanceId: blocker.instanceId }) !== null,
        "ライフ受け宣言後はブロックへ切り替えられない",
    )
    assert(
        act(s, "p2", { type: "takeLife" }) !== null,
        "ライフ受け宣言後は再度の宣言も拒否される",
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
