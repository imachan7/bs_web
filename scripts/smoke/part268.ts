// smoke パート268（ブレイヴ 段階5：**場を離れるときに残すかを聞く**。docs/design/BRAVE.md §6.3）
//
// 非対話（テスト・AI）の自動処理は part238 §E が見ている。ここは**対話経路**が本題:
// 「残す／残さない」の確認が出ること・置くコアをフィールドからも払えること・
// 払えるコアが足りなければ確認を出さずトラッシュへ行くこと。
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { CARD_DB } from "../../server/src/logic/GameState"
import { destroySpirit } from "../../server/src/logic/removal"
import type { CardData } from "../../server/src/type"

const HOST = "BS01-001" // ゴラドン（赤・コスト0・系統「爬獣」・Lv1=1コア）
const hostCard = getCard(HOST)
const HOST_FAMILY = hostCard.family[0]!

// テスト用ブレイヴ（part238 と同じ作り。合体状態Lv1は必ず0コア）
const BRAVE = "TEST-BRAVE-KEEP"
{
    const c: CardData = {
        cardId: BRAVE, name: "テストブレイヴ（残す確認）", type: "brave", colors: ["blue"], cost: 2,
        reduction: ["blue"], family: ["機獣"],
        levels: [{ level: 1, cores: 2, bp: 2000 }, { level: 2, cores: 4, bp: 4000 }],
        braveLevels: [{ level: 1, cores: 0, bp: 3000 }, { level: 2, cores: 3, bp: 5000 }],
        braveCondition: { family: HOST_FAMILY },
        symbol: ["blue"], flash: false, rarity: "C", limited: false, effect: "（テスト用）", effects: [],
    }
    CARD_DB.set(BRAVE, c)
}
const NEED = getCard(BRAVE).levels[0]!.cores // スピリット状態のLv1維持コスト

// 対話モードで、ホストにブレイヴを合体させた盤面を作る
function combined(reserve: number, hostCores = 1): { s: GameState; hostId: string } {
    const s = createGame("brave-keep", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    const host = createInstance(HOST, s.turn, hostCores)
    s.players.p1.field.spirits.push(host)
    refreshLevelAsOverrides(s)
    s.players.p1.hand = [BRAVE]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null, "合体して召喚")
    s.players.p1.reserve = reserve
    s.interactiveTargets = true // ここから対話モード
    return { s, hostId: host.instanceId }
}

console.log("=== §A 対話：ホストが場を離れると「残しますか？」の確認が出る ===")
{
    const { s, hostId } = combined(NEED)
    destroySpirit(s, "p1", hostId, "destroy")
    const pc = s.pendingChoice
    assert(pc !== null, "確認が出る（自動では残さない）")
    assert(pc!.braveKeep?.cardId === BRAVE, "確認の対象は分けて置いたブレイヴ")
    assert(pc!.braveKeep?.need === NEED, `必要なコアはスピリット状態のLv1維持コスト（${NEED}個）`)
    assert(pc!.optional === true, "残さないことも選べる")
    assert(s.players.p1.field.spirits.length === 0, "答えるまでブレイヴは場に出ていない")
    assert(!s.players.p1.trashCards.includes(BRAVE), "答えるまでトラッシュにも行っていない")
    assert(s.players.p1.field.combinedBraves.length === 0, "合体中の置き場からは抜けている")
}

console.log("=== §B 「残す」：リザーブから維持コストを払ってスピリット状態で残る ===")
{
    const { s, hostId } = combined(NEED)
    const hostCores = s.players.p1.field.spirits.find((sp) => sp.instanceId === hostId)!.cores
    destroySpirit(s, "p1", hostId, "destroy")
    assert(act(s, "p1", { type: "resolveChoice", option: "残す" }) === null, "「残す」を選ぶ")
    const brave = s.players.p1.field.spirits.find((sp) => sp.cardId === BRAVE)
    assert(brave !== undefined, "ブレイヴがスピリット状態で場に残る")
    assert(brave!.cores === NEED, `Lv1維持コスト（${NEED}個）が置かれる`)
    // ホストのコアは**先にリザーブへ戻ってから**払われる（§6.3.1）
    assert(s.players.p1.reserve === NEED + hostCores - NEED, "ホストのコアはリザーブへ戻り、置いた分だけ減る")
    assert(s.pendingChoice === null, "確認は解決済み")
}

console.log("=== §C 「残さない」：合体元と一緒にトラッシュへ ===")
{
    const { s, hostId } = combined(NEED)
    destroySpirit(s, "p1", hostId, "destroy")
    const before = s.players.p1.reserve
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "スキップ＝残さない")
    assert(s.players.p1.trashCards.includes(BRAVE), "ブレイヴはトラッシュへ")
    assert(s.players.p1.field.spirits.length === 0, "場には出ない")
    assert(s.players.p1.reserve === before, "コアは払わない")
}

console.log("=== §D 置くコアはフィールドからも払える（paySources） ===")
{
    const { s, hostId } = combined(0)
    // リザーブ0。別のスピリットに乗っているコアで払う
    const other = createInstance(HOST, s.turn, NEED + 1)
    s.players.p1.field.spirits.push(other)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", hostId, "destroy")
    assert(s.pendingChoice?.braveKeep !== undefined, "リザーブが空でもフィールドに払えるコアがあれば確認が出る")
    assert(
        act(s, "p1", {
            type: "resolveChoice",
            option: "残す",
            paySources: [{ instanceId: other.instanceId, count: NEED }],
        }) === null,
        "フィールドのコアを指定して残す",
    )
    const brave = s.players.p1.field.spirits.find((sp) => sp.cardId === BRAVE)
    assert(brave !== undefined && brave.cores === NEED, "指定したコアがブレイヴに置かれる")
    assert(other.cores === 1, "払った分だけ支払い元から減る")
    assert(s.players.p1.reserve === 1, "ホストのコア1個はリザーブへ戻ったまま")
}

console.log("=== §D2 支払い元を指定しない応答（AI・自動応答）はフィールドのコアから自動で補う ===")
{
    const { s, hostId } = combined(0)
    const other = createInstance(HOST, s.turn, NEED + 1) // Lv1維持コアは1個なので余剰は NEED 個
    s.players.p1.field.spirits.push(other)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", hostId, "destroy")
    assert(act(s, "p1", { type: "resolveChoice", option: "残す" }) === null, "支払い元を指定せず「残す」")
    const brave = s.players.p1.field.spirits.find((sp) => sp.cardId === BRAVE)
    assert(brave !== undefined && brave.cores === NEED, "自動で集めたコアが置かれる")
    assert(other.cores >= 1, "維持コアを割らない余剰から先に取る")
}

console.log("=== §E 払えるコアが足りなければ、確認を出さずトラッシュへ ===")
{
    const { s, hostId } = combined(0, NEED - 1)
    // リザーブ0・ホストのコアは NEED-1・他に払えるコアは無い
    destroySpirit(s, "p1", hostId, "destroy")
    assert(s.pendingChoice === null, "選べないので確認は出さない")
    assert(s.players.p1.trashCards.includes(BRAVE), "合体元と一緒にトラッシュへ置かれる")
}

console.log("=== §F アタック中に残せば、ブレイヴがアタックを引き継ぐ（§6.2 の5） ===")
{
    const { s, hostId } = combined(NEED)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: hostId }) === null, "合体スピリットでアタック")
    assert(s.battle?.attackerInstanceId === hostId, "アタッカーはホスト")
    destroySpirit(s, "p1", hostId, "destroy")
    assert(s.pendingChoice?.braveKeep !== undefined, "バトル中でも確認が出る")
    assert(act(s, "p1", { type: "resolveChoice", option: "残す" }) === null, "「残す」を選ぶ")
    const brave = s.players.p1.field.spirits.find((sp) => sp.cardId === BRAVE)
    assert(brave !== undefined, "ブレイヴは場に残る")
    assert(s.battle?.attackerInstanceId === brave!.instanceId, "アタッカーがブレイヴに差し替わる")
    assert(brave!.isRested === true, "アタックで疲労した状態を引き継ぐ")
}

console.log("すべてのチェックに合格しました 🎉（part268）")
