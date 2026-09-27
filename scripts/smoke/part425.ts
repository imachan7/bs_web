// smoke パート425（R5：「疲労させる」1枚専用type3種をexhaust＋軸で書き直す。
// TargetFilter.sameFamilyAsDestroyed／exhaust.nexus "only"・"also" の確認）
import {
    act,
    assert,
    createGame,
    createInstance,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const byName = (n: string) => {
    const c = ALL_CARDS.find((x) => x.name === n)
    assert(c !== undefined, `テスト前提: ${n} がカードデータにいる`)
    return c!
}

const COKA = byName("コーカサス・リョフ・ビートル") // BS16-027（緑・コスト9・同じ系統を疲労）
const KUMATTER = byName("きぐるみクマッター") // BS10-074（黄・コスト4・相手ネクサスすべて疲労）
const KRAKEN = byName("エル・クラーケン") // BS10-018（紫・コスト5・スピリット/ネクサス合計3個まで疲労）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const OTHER_FAMILY = byName("極彩鳥ヴァルペルチャー") // BS01-073（系統「爪鳥」＝コーカサス・リョフ・ビートルと共有しない。BP7000）
assert(
    !(COKA.family ?? []).some((f) => (OTHER_FAMILY.family ?? []).includes(f)),
    "テスト前提: フェニックスはコーカサス・リョフ・ビートルと系統を共有しない",
)

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== 1. BS16-027：sameFamilyAsDestroyed（同じ系統だけ疲労） ===")
{
    const s = game("027-same-family")
    const me = put(s, "p1", COKA.cardId, 1)
    const target = put(s, "p2", COKA.cardId, 1) // 同じカードなので系統が一致する
    const other = put(s, "p2", OTHER_FAMILY.cardId, 1) // 系統が違う相手
    s.lastOpponentSpiritDestroyedFamilies = COKA.family ?? []
    resolveAction(s, "p1", me, { type: "exhaust", count: 1, all: true, filter: { sameFamilyAsDestroyed: true } })
    assert(target.isRested === true, "同じ系統の相手が疲労した")
    assert(other.isRested === false, "系統が異なる相手は疲労しない")
}
console.log("=== 2. BS16-027：記録が空なら何もしない ===")
{
    const s = game("027-no-record")
    const me = put(s, "p1", COKA.cardId, 1)
    const target = put(s, "p2", COKA.cardId, 1)
    s.lastOpponentSpiritDestroyedFamilies = []
    resolveAction(s, "p1", me, { type: "exhaust", count: 1, all: true, filter: { sameFamilyAsDestroyed: true } })
    assert(target.isRested === false, "破壊の記録が無いので発動しなかった")
}

console.log("=== 3. BS10-074：nexus:\"only\"（相手の回復状態ネクサスすべて。スピリットは含めない） ===")
{
    const s = game("074-nexus-only")
    const me = put(s, "p1", KUMATTER.cardId, 1)
    const oppSpirit = put(s, "p2", VANILLA, 1)
    const nx1 = putNexus(s, "p2", byName("六分儀天文台").cardId, 0)
    const nx2 = putNexus(s, "p2", byName("六分儀天文台").cardId, 0)
    nx2.isRested = true // すでに疲労中のネクサスは対象外（疲労数のログでのみ差が出る）
    resolveAction(s, "p1", me, { type: "exhaust", count: 1, all: true, nexus: "only" })
    assert(nx1.isRested === true, "回復状態だった相手のネクサスが疲労した")
    assert(oppSpirit.isRested === false, "スピリットは対象に含まれない")
}

console.log("=== 4. BS10-018：nexus:\"also\" 非対話（スピリットを実効BP最大から優先、残り枠をネクサスへ） ===")
{
    const s = game("018-also-auto", false)
    const me = put(s, "p1", KRAKEN.cardId, 1)
    const spLow = put(s, "p2", VANILLA, 1) // BP 4000
    const spHigh = put(s, "p2", OTHER_FAMILY.cardId, 1) // BP7000で実効BP最大
    const nx1 = putNexus(s, "p2", byName("六分儀天文台").cardId, 0)
    resolveAction(s, "p1", me, { type: "exhaust", count: 3, nexus: "also" })
    assert(spLow.isRested && spHigh.isRested && nx1.isRested, "スピリット2体・ネクサス1つがすべて疲労した（合計3＝候補ちょうど）")
}
console.log("=== 5. BS10-018：nexus:\"also\" 候補が3未満（できるだけ疲労させる） ===")
{
    const s = game("018-also-short", false)
    const me = put(s, "p1", KRAKEN.cardId, 1)
    const spOnly = put(s, "p2", VANILLA, 1)
    resolveAction(s, "p1", me, { type: "exhaust", count: 3, nexus: "also" })
    assert(spOnly.isRested === true, "候補が1件しかなくても、その1件は疲労した")
}
console.log("=== 6. BS10-018：nexus:\"also\" 対話時はスピリット/ネクサスを混ぜて1つずつ選べる ===")
{
    const s = game("018-also-interactive", true)
    const me = put(s, "p1", KRAKEN.cardId, 1)
    const sp1 = put(s, "p2", VANILLA, 1)
    const sp2 = put(s, "p2", VANILLA, 1)
    const nx1 = putNexus(s, "p2", byName("六分儀天文台").cardId, 0)
    resolveAction(s, "p1", me, { type: "exhaust", count: 3, nexus: "also" })
    assert(s.pendingChoice !== null && s.pendingChoice?.kind === "target", "候補が2件以上あるので選択を待つ")
    assert(
        (s.pendingChoice?.candidates.length ?? 0) === 3 &&
            [sp1.instanceId, sp2.instanceId, nx1.instanceId].every((id) => s.pendingChoice?.candidates.includes(id)),
        "候補一覧にスピリット2体・ネクサス1つが並ぶ",
    )
    act(s, "p1", { type: "resolveChoice", instanceId: nx1.instanceId }) // 使用者がネクサスを先に選ぶ
    assert(nx1.isRested === true, "選んだネクサスが疲労した")
    assert(s.pendingChoice !== null, "残り2回ぶんの選択が続く")
    act(s, "p1", { type: "resolveChoice", instanceId: sp1.instanceId })
    assert(s.pendingChoice?.optional === true, "候補が1つでも「選ばない」を選べるので聞く")
    act(s, "p1", { type: "resolveChoice", instanceId: sp2.instanceId })
    assert(sp1.isRested && sp2.isRested, "残りのスピリット2体も選んだ順に疲労した")
}

console.log("=== 7. BS10-018：「3つまで」は0〜3（途中で選ばずに終えたら残りも疲労させない） ===")
{
    const s = game("018-also-stop", true)
    const me = put(s, "p1", KRAKEN.cardId, 1)
    const sp1 = put(s, "p2", VANILLA, 1)
    const sp2 = put(s, "p2", VANILLA, 1)
    const nx1 = putNexus(s, "p2", byName("六分儀天文台").cardId, 0)
    resolveAction(s, "p1", me, { type: "exhaust", count: 3, nexus: "also" })
    act(s, "p1", { type: "resolveChoice", instanceId: sp1.instanceId })
    act(s, "p1", { type: "resolveChoice" })
    assert(s.pendingChoice === null, "選ばずに終えたら選択は続かない")
    assert(sp1.isRested && !sp2.isRested && !nx1.isRested, "選んだ1体だけが疲労した")

    const s2 = game("018-also-zero", true)
    const me2 = put(s2, "p1", KRAKEN.cardId, 1)
    const only = put(s2, "p2", VANILLA, 1)
    resolveAction(s2, "p1", me2, { type: "exhaust", count: 3, nexus: "also" })
    assert(s2.pendingChoice?.optional === true, "候補が1体だけでも聞く")
    act(s2, "p1", { type: "resolveChoice" })
    assert(!only.isRested && s2.pendingChoice === null, "0個を選べる")
}

console.log("すべてのチェックに合格しました 🎉（part425）")
