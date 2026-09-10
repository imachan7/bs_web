// smoke パート310（復活のコスト「自分のスピリット1体を疲労させることで」は、どれを疲労させるか持ち主が選ぶ）
// 効果文が「〜自分のスピリット1体を疲労させることで」なので、選ぶのは持ち主
// （docs/design/PROCEDURES_AUDIT.md §5 の一般則。実装は実効BP最小の自動選択だった）。
// 見本は BS13-X05 麒麟星獣リーン（このスピリットと同じ系統を持つ自分のスピリット1体を疲労させる）。
import {
    act,
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { destroySpiritsFrom } from "../../server/src/logic/removal"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.interactiveTargets = true
    return s
}

console.log("=== カードデータの機械確認 ===")
{
    assert(getCard("BS13-X05").name === "麒麟星獣リーン" && getCard("BS13-X05").family.includes("戯狩"), "BS13-X05は麒麟星獣リーン（戯狩）")
    assert(getCard("BS04-056").name === "ブレイブレス・レオ" && getCard("BS04-056").family.includes("戯狩"), "BS04-056はブレイブレス・レオ（戯狩＝同じ系統・効果なし）")
}

console.log("=== BS13-X05：疲労させるスピリットが2体以上なら持ち主に選ばせる ===")
{
    const s = game("x05-exhaust-pick")
    const rin = createInstance("BS13-X05", s.turn, getCard("BS13-X05").levels[1]!.cores) // Lv2
    const kigariA = createInstance("BS04-056", s.turn, 1) // 戯狩・回復状態（Lv1＝BP5000）
    const kigariB = createInstance("BS04-056", s.turn, 2) // 戯狩・回復状態（Lv2＝BP7000。自動選択なら選ばれない側）
    s.players.p1.field.spirits.push(rin, kigariA, kigariB)
    refreshLevelAsOverrides(s)

    destroySpiritsFrom(s, [{ pid: "p1", instanceId: rin.instanceId }], 0, 0)
    assert(s.pendingChoice?.reviveConfirm !== undefined, "まず「復活させますか？」の確認が出る（「〜できる」）")
    assert(act(s, "p1", { type: "resolveChoice", option: "復活させる" }) === null, "復活させることを選ぶ")

    assert(s.pendingChoice?.reviveExhaustPick !== undefined, "続けて「どれを疲労させるか」を聞く")
    assert(s.pendingChoice?.pid === "p1", "選ぶのはコストを払う持ち主")
    assert(
        [...(s.pendingChoice?.candidates ?? [])].sort().join(",") === [kigariA.instanceId, kigariB.instanceId].sort().join(","),
        "候補は同じ系統の回復状態のスピリットだけ（自分自身は除く）",
    )
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === rin.instanceId), "選び終わるまで破壊されない")

    // 実効BP最大の方（自動選択なら選ばれない側）を選べることを見る
    assert(act(s, "p1", { type: "resolveChoice", instanceId: kigariB.instanceId }) === null, "BPの高い方を疲労させる")
    assert(kigariB.isRested === true, "選んだスピリットが疲労した")
    assert(kigariA.isRested === false, "選ばなかった方はそのまま")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === rin.instanceId),
        "コストを払ったので破壊されず場に残る",
    )
    assert(!s.players.p1.trashCards.includes("BS13-X05"), "トラッシュには置かれない")
}

console.log("=== BS13-X05：候補が1体なら聞かない（選ぶ余地がない） ===")
{
    const s = game("x05-single-candidate")
    const rin = createInstance("BS13-X05", s.turn, getCard("BS13-X05").levels[1]!.cores) // Lv2
    const only = createInstance("BS04-056", s.turn, 1)
    s.players.p1.field.spirits.push(rin, only)
    refreshLevelAsOverrides(s)

    destroySpiritsFrom(s, [{ pid: "p1", instanceId: rin.instanceId }], 0, 0)
    assert(act(s, "p1", { type: "resolveChoice", option: "復活させる" }) === null, "復活させることを選ぶ")
    assert(s.pendingChoice?.reviveExhaustPick === undefined, "候補が1体なので選択は挟まらない")
    assert(only.isRested === true, "その1体が疲労した")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === rin.instanceId), "破壊されず場に残る")
}

console.log("=== BS13-X05：疲労させられるスピリットが居なければ復活できない ===")
{
    const s = game("x05-no-candidate")
    const rin = createInstance("BS13-X05", s.turn, getCard("BS13-X05").levels[1]!.cores) // Lv2
    s.players.p1.field.spirits.push(rin)
    refreshLevelAsOverrides(s)

    destroySpiritsFrom(s, [{ pid: "p1", instanceId: rin.instanceId }], 0, 0)
    assert(act(s, "p1", { type: "resolveChoice", option: "復活させる" }) === null, "復活させることを選ぶ")
    assert(s.pendingChoice?.reviveExhaustPick === undefined, "候補が居ないので選択は挟まらない")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === rin.instanceId), "コストが払えず破壊される")
    assert(s.players.p1.trashCards.includes("BS13-X05"), "トラッシュへ置かれる")
}

console.log("すべてのチェックに合格しました 🎉（part310）")
