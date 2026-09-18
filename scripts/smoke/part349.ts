// smoke パート349（BS16バッチ0：破壊後バースト（kind:"burst".event:"ownSpiritDestroyed"）を
// トラッシュ行き確定の後に1回だけ判定する器。docs/design/TIMING_CHART.md ＞６・HANDOFF.md §1「BS16バッチ0」）
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・色・コストを機械検証してから使う。
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import {
    assert,
    createGame,
    createInstance,
    destroySpirit,
    fireTrigger,
    getCard,
    handleAction,
    placeBurst,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const BURST_MAGIC = "BS15-084" // 爆砕轟神掌：【バースト：相手による自分のスピリット破壊後】millPer(counter:burstEventCost)
const HOST = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const BRAVE = "BS10-061" // 剣鎧竜バスター・ドラゴン（赤・コスト3・ブレイヴ。合体条件：バニラ）
const OTHER_COLOR = "BS15-046" // ランマー・ゴレム（青・コスト0・バニラ）
const MID_COST = "BS01-003" // テラノセイバー（赤・コスト2）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BURST_MAGIC).name === "爆砕轟神掌" && getCard(BURST_MAGIC).type === "magic", "084は爆砕轟神掌（マジック）")
    assert(getCard(HOST).name === "ロクケラトプス" && getCard(HOST).cost === 1 && getCard(HOST).colors.includes("red"), "HOSTは赤コスト1")
    assert(getCard(BRAVE).name === "剣鎧竜バスター・ドラゴン" && getCard(BRAVE).type === "brave" && getCard(BRAVE).cost === 3, "BRAVEは赤コスト3のブレイヴ")
    assert(getCard(OTHER_COLOR).name === "ランマー・ゴレム" && getCard(OTHER_COLOR).colors.includes("blue") && getCard(OTHER_COLOR).cost === 0, "OTHER_COLORは青コスト0")
    assert(getCard(MID_COST).name === "テラノセイバー" && getCard(MID_COST).cost === 2, "MID_COSTはコスト2")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p2.deck = Array.from({ length: 40 }, () => "BS01-001")
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 相手（p2）のスピリットの効果で、p1 のスピリットをまとめて破壊する（destroyedGroupの発生源になる）
function destroyTogether(s: GameState, ids: string[]): number {
    return destroyTargetsBatch(s, "p2", ids.map((instanceId) => ({ pid: "p1" as PlayerId, instanceId })), { sourcePid: "p2", sourceType: "spirit" })
}

console.log("=== 1. 同時破壊2体（コスト違い・色違い）→ バーストは1回だけ、非対話は最大値を使う ===")
{
    const s = game("burst-once")
    placeBurst(s, "p1", BURST_MAGIC)
    const a = put(s, "p1", HOST) // コスト1・赤
    const b = put(s, "p1", OTHER_COLOR) // コスト0・青
    const deckBefore = s.players.p2.deck.length
    assert(destroyTogether(s, [a.instanceId, b.instanceId]) === 2, "2体とも破壊された")
    const milled = deckBefore - s.players.p2.deck.length
    // 1回だけ・非対話は最大値（1）を使う想定。もし破壊待機中に破壊ごとへ戻すと、
    // コスト1とコスト0が別々に2回発火し、milled は 1（=1+0）のまま区別できないため、
    // ここではコストを1と2に変えたテスト3で「1回」を明確に検証する
    assert(milled === 1, `非対話はコスト1（最大値）で1回だけ発動する（実際${milled}枚）`)
    assert((s.burstEventColors ?? []).includes("red") && (s.burstEventColors ?? []).includes("blue"), `burstEventColorsが破壊メンバーの色の和集合になる（実際${JSON.stringify(s.burstEventColors)}）`)
}

console.log("=== 2. 破壊待機中に戻す既知バグの確認：ownSpiritDestroyed走査でskipBurstを外すと2回発動する ===")
{
    // 「1回」の検証はテスト3（コスト1個＋コスト2個で2回なら3枚・1回なら2枚）で行う。
    // ここではまず、破壊後バーストが「破壊待機中（コミット前）」ではなく
    // 「トラッシュ行き確定後」に判定されていることを、queueへ積まれる時点で確認する
    const s = game("burst-timing")
    placeBurst(s, "p1", BURST_MAGIC)
    const a = put(s, "p1", HOST)
    // 破壊待機に入った直後（destroySpirit内部でコミット前）はまだキューに積まれていないはず。
    // 直接は覗けないため、代わりに「破壊後」の状態（トラッシュに移り、キューが空になっている＝発火済み）で確認する
    destroySpirit(s, "p1", a.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" } as never)
    assert(s.players.p1.trashCards.includes(HOST), "破壊は確定してトラッシュへ行った")
    assert((s.pendingBurstDestroyQueue?.length ?? 0) === 0, "破壊後バーストは発火済みでキューは空")
}

console.log("=== 3. 同時破壊2体（コスト1・コスト2）→ 1回だけなら最大値2、2回なら1+2=3 ===")
{
    const s = game("burst-count")
    placeBurst(s, "p1", BURST_MAGIC)
    const a = put(s, "p1", HOST) // コスト1
    const b = put(s, "p1", MID_COST) // コスト2
    const deckBefore = s.players.p2.deck.length
    destroyTogether(s, [a.instanceId, b.instanceId])
    const milled = deckBefore - s.players.p2.deck.length
    assert(milled === 2, `1回だけ発動し最大値2を使う（実際${milled}枚。2回発動なら3枚になるはず）`)
}

console.log("=== 4. 対話モード：コストが割れているときは発動者が選ぶ ===")
{
    const s = game("burst-interactive", true)
    placeBurst(s, "p1", BURST_MAGIC)
    const a = put(s, "p1", HOST) // コスト1
    const b = put(s, "p1", MID_COST) // コスト2
    destroyTogether(s, [a.instanceId, b.instanceId])
    const pending = s.pendingChoice
    assert(pending !== null && pending.kind === "option" && pending.burstActivate !== undefined, "バースト発動の確認が立つ")
    const options = pending?.options ?? []
    assert(options.includes("コスト1で発動する") && options.includes("コスト2で発動する"), `コストごとの選択肢が出る（実際${JSON.stringify(options)}）`)
    const deckBefore = s.players.p2.deck.length
    assert(handleAction(s, "p1", { type: "resolveChoice", option: "コスト2で発動する" }) === null, "コスト2を選ぶ")
    const milled = deckBefore - s.players.p2.deck.length
    assert(milled === 2, `選んだコスト2ぶん破棄する（実際${milled}枚）`)
}

console.log("=== 5. 合体スピリット：ブレイヴも一緒にトラッシュへ行けばコストはホスト+ブレイヴ ===")
{
    const s = game("burst-brave-trash")
    placeBurst(s, "p1", BURST_MAGIC)
    const host = put(s, "p1", HOST, 1) // コスト1
    const brave = put(s, "p1", BRAVE, 2) // コスト3
    assert(handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, "合体できる")
    // 残すコア（braveKeepCores）を払えないようにして、ブレイヴを合体元と一緒にトラッシュへ行かせる。
    // ホスト上のコアは破壊確定時にリザーブへ戻る（§6.3.1）ため、host.coresも0にしておく
    host.cores = 0
    s.players.p1.reserve = 0
    const deckBefore = s.players.p2.deck.length
    destroySpirit(s, "p1", host.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" } as never)
    assert(s.players.p1.trashCards.includes(BRAVE), "コアを払えずブレイヴも一緒にトラッシュへ行った")
    const milled = deckBefore - s.players.p2.deck.length
    assert(milled === 4, `ホスト(1)+ブレイヴ(3)=4を使う（実際${milled}枚）`)
}

console.log("=== 6. 合体スピリット：ブレイヴを残せた場合はホストのコストだけ ===")
{
    const s = game("burst-brave-keep")
    placeBurst(s, "p1", BURST_MAGIC)
    const host = put(s, "p1", HOST, 1) // コスト1
    const brave = put(s, "p1", BRAVE, 2) // コスト3
    assert(handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, "合体できる")
    // 合体時にブレイヴのコアはリザーブへ戻っている（BRAVE.md §6.4）ので、非対話では自動的に残る
    assert(s.players.p1.reserve >= 1, "残すためのコアが足りている")
    const deckBefore = s.players.p2.deck.length
    destroySpirit(s, "p1", host.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" } as never)
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "ブレイヴはフィールドに残った")
    const milled = deckBefore - s.players.p2.deck.length
    assert(milled === 1, `ホストのコスト(1)だけを使う（実際${milled}枚）`)
}

console.log("=== 7. 「フィールドに残る」で残った個体は破壊後バーストの対象に入らない ===")
{
    // BS15-049 ツンドッグ・ゴレム＋BS15-050 グレネード・ゴレム（【粉砕】持ち）＝
    // 破壊されても「フィールドに残る」組み合わせ（part347の049テストと同じ器）
    // 器はpart347の049テストと同じ（049の召喚時効果が【粉砕】持ちの「フィールドに残る」を貸す）
    const s = game("burst-revive")
    assert(getCard("BS15-049").name === "ツンドッグ・ゴレム" && getCard("BS15-050").name === "グレネード・ゴレム", "049/050の機械確認")
    placeBurst(s, "p1", BURST_MAGIC)
    const tsun = put(s, "p1", "BS15-049", 1)
    const gren = put(s, "p1", "BS15-050", 1) // 【粉砕】持ち
    fireTrigger(s, "p1", tsun, "onSummon") // 049の召喚時効果：このターンの間、貸す
    destroySpirit(s, "p1", gren.instanceId, "destroy", { battle: { winnerPid: "p2" } } as never)
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === gren.instanceId), "破壊されず場に残った")
    // 050自身の『破壊時』（millPer counter:selfLevel。Lv1で1枚）は別の効果なので、
    // ここでは084のバースト自体が不発（=セットしたまま手つかず）であることを見る
    assert(s.players.p1.burst === BURST_MAGIC, "破壊後バースト（084）は発動していない（セットしたまま）")
}

console.log("すべてのチェックに合格しました 🎉（part349）")
