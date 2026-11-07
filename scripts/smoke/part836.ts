// smoke パート836（BS23-031 大空の剣聖フィンヴェール・BS23-044 氷火の剣聖スフィエル：ブレイヴの「合体中のアタック時」効果を借りる）
// 2026-11-08 ユーザー決定：公式の改定（『合体アタック時』は無くなった）には従わず、見出しが『合体アタック時』でも
// 【合体時】『アタック時』でも、ブレイヴが持つ「合体しているときのアタック時」の効果すべてを対象にする（docs/design/BS23_PLAN.md §2 の1）。
// 効果の「このスピリット」は、効果を借りて実際にアタックしたスピリット（031 や 044 ではない）
import { assert, getCard } from "./helpers"
import type { GameState } from "./helpers"
import { C, VANILLA, attack, board, bp, braves, closeFlash, combine, flashAs, handNames, put, ready, toAttackStep, trashNames } from "./bs23b2"

if (ready("part836")) {
    // 031 の剣刃以外のブレイヴ（ゴルニック＝『合体アタック時』／ティロック＝【合体時】『アタック時』）で、借りる側の BP の動きを見る
    function lend(label: string, opts: { f031Cores: number; f031Brave?: string; attacker: string; attackerBrave?: string; attackerCores?: number; combined031?: boolean }, expectDelta: number): void {
        const s = board(`836-${label}`)
        const f = put(s, "p1", C.f031, opts.f031Cores)
        if (opts.f031Brave && opts.combined031 !== false) combine(s, "p1", f, opts.f031Brave)
        const a = put(s, "p1", opts.attacker, opts.attackerCores ?? 1)
        if (opts.attackerBrave) combine(s, "p1", a, opts.attackerBrave)
        toAttackStep(s, "p1")
        const before = bp(s, "p1", a)
        const err = attack(s, "p1", a)
        assert(err === null, `${label}: アタックできる${err ? `（拒否: ${err}）` : ""}`)
        assert(bp(s, "p1", a) - before === expectDelta, `${label}: アタックしたスピリットのBPが ${expectDelta >= 0 ? "+" : ""}${expectDelta}（実際 ${bp(s, "p1", a) - before}）`)
    }

    console.log("=== 031 Lv3：合体していない武装・コスト5以上の自分のスピリットに、031 のブレイヴの合体アタック時効果を与える ===")
    lend("031が『合体アタック時』を貸す", { f031Cores: 4, f031Brave: C.gornik, attacker: C.wingal }, 5000)
    lend("031が【合体時】『アタック時』を貸す（見出しを区別しない）", { f031Cores: 4, f031Brave: C.tirok, attacker: C.wingal }, 4000)
    console.log("=== 031：与えない場面（条件を1つだけ外す） ===")
    lend("031がLv2", { f031Cores: 2, f031Brave: C.gornik, attacker: C.wingal }, 0)
    lend("031が合体していない", { f031Cores: 4, attacker: C.wingal }, 0)
    lend("コスト4（境界）の武装", { f031Cores: 4, f031Brave: C.gornik, attacker: C.cannon }, 0)
    lend("コスト3の武装", { f031Cores: 4, f031Brave: C.gornik, attacker: C.gatling }, 0)
    lend("武装でないコスト5", { f031Cores: 4, f031Brave: C.gornik, attacker: C.melt }, 0)
    // 合体しているスピリットには与えない：自分のブレイヴ（ゴルニック＝+5000）だけが働き、031 のティロック（+4000）は上乗せされない
    lend("合体している武装", { f031Cores: 4, f031Brave: C.tirok, attacker: C.wingal, attackerBrave: C.gornik }, 5000)

    console.log("=== 031：与えるのは自分のアタックステップだけ（相手のアタックでは与えない） ===")
    {
        const s = board("836-相手のアタック")
        const f = put(s, "p1", C.f031, 4)
        combine(s, "p1", f, C.gornik)
        const a = put(s, "p2", C.wingal, 1)
        toAttackStep(s, "p2")
        const before = bp(s, "p2", a)
        assert(attack(s, "p2", a) === null, "相手のウィンガルがアタックできる")
        assert(bp(s, "p2", a) - before === 0, "031 の持ち主でない側の武装スピリットには与えない（031 の『自分の』）")
    }

    console.log("=== 031 Lv1：自分の合体スピリットの剣刃ブレイヴは相手によって破壊されない（ブレイヴ破壊は相手のフラッシュで撃つ） ===")
    function breakBrave(label: string, hostId: string, hostCores: number, braveId: string): { braveCount: number; s: GameState } {
        const s = board(`836-${label}`)
        const host = put(s, "p1", hostId, hostCores)
        combine(s, "p1", host, braveId)
        s.players.p2.hand = [C.breakMagic]
        toAttackStep(s, "p1")
        assert(attack(s, "p1", host) === null, `${label}: 合体スピリットがアタックできる`)
        const err = flashAs(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: host.instanceId })
        assert(err === null, `${label}: 相手がブレイヴブレイクを撃てる${err ? `（拒否: ${err}）` : ""}`)
        closeFlash(s)
        return { braveCount: (host.braveRefs ?? []).length, s }
    }
    {
        const r = breakBrave("剣刃は守られる", C.f031, 1, C.b055)
        assert(r.braveCount === 1 && r.s.players.p1.field.combinedBraves.length === 1, "031 に合体している剣刃（055）は相手のブレイヴ破壊で残る")
        assert(r.s.players.p2.trashCards.includes(C.breakMagic), "ブレイヴブレイク自体は使用済みでトラッシュに行く")
    }
    {
        const r = breakBrave("剣刃でないブレイヴ", C.f031, 1, C.tirok)
        assert(r.braveCount === 0 && r.s.players.p1.field.combinedBraves.length === 0, "031 に合体している剣刃でないブレイヴ（ティロック）は破壊される")
        assert(trashNames(r.s, "p1") === getCard(C.tirok).name, "破壊されたブレイヴは持ち主のトラッシュに行く")
    }
    {
        const r = breakBrave("031がいなければ剣刃も壊れる", C.pardo, 1, C.b055)
        assert(r.braveCount === 0 && r.s.players.p1.field.combinedBraves.length === 0, "031 がいなければ剣刃（055）も破壊される")
    }

    console.log("=== 044 Lv2：スピリット状態の剣刃ブレイヴがアタックしたとき、そのブレイヴの合体アタック時効果すべてを発揮させる ===")
    // 055 の合体アタック時＝ドロー1枚＋トラッシュの 056 を手札へ（剣刃で効果がドローなのは 055 だけなので、手札で見分ける）
    function spiritBrave(label: string, opts: { cores044: number; combined044: boolean; braveId?: string; side?: "p1" | "p2"; trash056?: boolean }): { s: GameState; hand: string; trash: string } {
        const s = board(`836-${label}`)
        const side = opts.side ?? "p1"
        const h = put(s, side, C.s044, opts.cores044)
        if (opts.combined044) combine(s, side, h, C.tirok)
        const b = put(s, side, opts.braveId ?? C.b055, 1)
        if (opts.trash056 !== false) s.players[side].trashCards = [C.b056]
        toAttackStep(s, side)
        assert(attack(s, side, b) === null, `${label}: スピリット状態のブレイヴがアタックできる`)
        return { s, hand: handNames(s, side), trash: trashNames(s, side) }
    }
    {
        const r = spiritBrave("044が働く", { cores044: 2, combined044: true })
        assert(r.hand === [getCard(C.b056).name, getCard(VANILLA).name].sort().join("、"), `スピリット状態の 055 のアタックで、ドロー1枚と 056 の回収が起きる（手札: ${r.hand}）`)
        assert(r.trash === "なし", "056 がトラッシュから手札へ移った")
    }
    {
        const r = spiritBrave("相手側でも同じ", { cores044: 2, combined044: true, side: "p2" })
        assert(handNames(r.s, "p2") === [getCard(C.b056).name, getCard(VANILLA).name].sort().join("、"), `相手の 044 でも相手のスピリット状態の剣刃に働く（手札: ${handNames(r.s, "p2")}）`)
    }
    for (const [label, o] of [
        ["044がLv1", { cores044: 1, combined044: true }],
        ["044が合体していない", { cores044: 2, combined044: false }],
        ["スピリット状態が剣刃でない", { cores044: 2, combined044: true, braveId: C.gornik }],
    ] as const) {
        const r = spiritBrave(label, o)
        assert(handNames(r.s, "p1") === "なし", `${label}: 手札は増えない（実際 ${r.hand}）`)
    }
    {
        // 相手側の 044 は自分のスピリット状態ブレイヴに効かない
        const s = board("836-044は持ち主の側だけ")
        const h = put(s, "p2", C.s044, 2)
        combine(s, "p2", h, C.tirok)
        const b = put(s, "p1", C.b055, 1)
        s.players.p1.trashCards = [C.b056]
        toAttackStep(s, "p1")
        assert(attack(s, "p1", b) === null, "自分の 055 がアタックできる")
        assert(handNames(s, "p1") === "なし", "相手の 044 は自分のスピリット状態のブレイヴには効かない（044 の『自分の』）")
    }
    {
        // 非剣刃のスピリット状態（ゴルニック）では「このスピリットをBP+5000」も出ない
        const s = board("836-非剣刃のBP")
        const h = put(s, "p1", C.s044, 2)
        combine(s, "p1", h, C.tirok)
        const b = put(s, "p1", C.gornik, 1)
        toAttackStep(s, "p1")
        const before = bp(s, "p1", b)
        assert(attack(s, "p1", b) === null, "ゴルニックがアタックできる")
        assert(bp(s, "p1", b) - before === 0, "剣刃でないスピリット状態のブレイヴには効果を発揮させない（BP変化なし）")
    }
}

console.log("すべてのチェックに合格しました 🎉（part836）")
