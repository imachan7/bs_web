// smoke パート837（BS23-055 太陽剣カーディナル・サン／BS23-056 炎月剣スカーレット・ムーン：召喚時・合体アタック時・追加の合体）
// 公式Q&A：Q20336〜Q20342（docs/design/BS23_PLAN.md §1）
import { act, assert, getCard } from "./helpers"
import type { GameState } from "./helpers"
import { C, VANILLA, attack, board, braveNames, braves, combine, handNames, onField, put, ready, toAttackStep, tryCombine } from "./bs23b2"

if (ready("part837")) {
    const N = (id: string) => getCard(id).name
    // 031 はコスト4なので 056 の通常の合体条件（コスト5以上）を満たさない。追加の合体の試験に使う（Lv1 では剣刃の守りだけが働く）
    const lowHost = (s: GameState) => put(s, "p1", C.f031, 1)

    console.log("=== 055 召喚時：自分のスピリットに直接合体するように召喚したときだけ、BP6000以下の相手のスピリット1体を破壊する ===")
    function summon055(label: string, direct: boolean): { s: GameState; small: ReturnType<typeof put>; big: ReturnType<typeof put> } {
        const s = board(`837-${label}`)
        const host = put(s, "p1", C.pardo, 1)
        const small = put(s, "p2", C.mattango, 1) // BP6000（境界）
        const big = put(s, "p2", C.tornedra, 3) // Lv2 BP9000
        s.players.p1.hand = [C.b055]
        const err = act(s, "p1", direct ? { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId } : { type: "summon", handIndex: 0 })
        assert(err === null, `${label}: 055 を召喚できる${err ? `（拒否: ${err}）` : ""}`)
        if (direct) assert(braveNames(s, "p1", host) === N(C.b055), `${label}: 055 が合体している`)
        else assert(onField(s, "p1", s.players.p1.field.spirits.find((x) => x.cardId === C.b055)!), `${label}: 055 がスピリット状態で出ている`)
        return { s, small, big }
    }
    {
        const r = summon055("直接合体", true)
        assert(!onField(r.s, "p2", r.small), "直接合体で召喚したとき、BP6000の相手のスピリットが破壊される")
        assert(onField(r.s, "p2", r.big), "BP9000の相手のスピリットは破壊されない")
    }
    {
        const r = summon055("スピリット状態", false)
        assert(onField(r.s, "p2", r.small) && onField(r.s, "p2", r.big), "スピリット状態で召喚したときは召喚時の破壊が起きない（Q20338）")
    }

    console.log("=== 055 合体アタック時：ドロー1枚と、トラッシュの 056 を手札へ ===")
    {
        const s = board("837-055アタック")
        const host = put(s, "p1", C.pardo, 1)
        combine(s, "p1", host, C.b055)
        s.players.p1.trashCards = [C.b056]
        toAttackStep(s, "p1")
        assert(attack(s, "p1", host) === null, "055 と合体したスピリットがアタックできる")
        assert(handNames(s, "p1") === [N(C.b056), N(VANILLA)].sort().join("、"), `ドロー1枚と 056 の回収（手札: ${handNames(s, "p1")}）`)
        assert(s.players.p1.trashCards.length === 0, "056 がトラッシュから消えた")
    }
    {
        const s = board("837-055アタック・056なし")
        const host = put(s, "p1", C.pardo, 1)
        combine(s, "p1", host, C.b055)
        toAttackStep(s, "p1")
        assert(attack(s, "p1", host) === null, "アタックできる")
        assert(handNames(s, "p1") === N(VANILLA), `トラッシュに 056 が無くてもドローは起きる（手札: ${handNames(s, "p1")}）`)
    }

    console.log("=== 056 追加の合体：055 と合体中のスピリットに、合体条件・ブレイヴ数を無視して1枚だけ（Q20340〜Q20342） ===")
    {
        // 手札から直接合体で召喚する経路
        const s = board("837-056召喚")
        const host = lowHost(s)
        combine(s, "p1", host, C.b055)
        s.players.p1.hand = [C.b056]
        const err = act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
        assert(err === null, `055 と合体中のコスト4のスピリットに 056 を直接合体で召喚できる${err ? `（拒否: ${err}）` : ""}`)
        assert(braveNames(s, "p1", host) === [N(C.b055), N(C.b056)].sort().join("、"), `055 と 056 の2枚が合体している（${braveNames(s, "p1", host)}）`)
    }
    {
        // スピリット状態の 056 を任意合体する経路
        const s = board("837-056任意合体")
        const host = lowHost(s)
        combine(s, "p1", host, C.b055)
        const b = put(s, "p1", C.b056, 1)
        assert(tryCombine(s, "p1", b, host) === null, "スピリット状態の 056 を 055 と合体中のコスト4のスピリットに合体できる")
        assert(braves(s, "p1", host).length === 2, "ブレイヴが2枚")
    }
    {
        const s = board("837-056・055なし")
        const host = lowHost(s)
        const b = put(s, "p1", C.b056, 1)
        assert(tryCombine(s, "p1", b, host) !== null, "ブレイヴの付いていないコスト4のスピリットには 056 を合体できない（条件を満たさない）")
    }
    {
        const s = board("837-056・別のブレイヴ")
        const host = lowHost(s)
        combine(s, "p1", host, C.tirok)
        const b = put(s, "p1", C.b056, 1)
        assert(tryCombine(s, "p1", b, host) !== null, "055 でないブレイヴと合体中のスピリットには、追加の合体は使えない")
    }
    {
        const s = board("837-056が先")
        const host = put(s, "p1", C.pardo, 1) // 剣使・コスト5：056 の通常の条件を満たす
        combine(s, "p1", host, C.b056)
        const b = put(s, "p1", C.b055, 1)
        assert(tryCombine(s, "p1", b, host) !== null, "056 が先に合体していると 055 は合体できない（Q20340）")
    }
    {
        const s = board("837-056・2枚目")
        const host = lowHost(s)
        combine(s, "p1", host, C.b055)
        combine(s, "p1", host, C.b056)
        const b2 = put(s, "p1", C.b056, 1)
        assert(tryCombine(s, "p1", b2, host) !== null, "追加で合体できるのは1枚だけ。2枚目の 056 は合体できない（Q20342）")
    }
    {
        const s = board("837-X01に055と056")
        const x = put(s, "p1", C.x01, 1)
        combine(s, "p1", x, C.b055)
        combine(s, "p1", x, C.b056)
        const third = put(s, "p1", C.gornik, 1)
        assert(tryCombine(s, "p1", third, x) === null, "X01 に 055＋056 が合体していても、さらに別のブレイヴを1つ合体できる（Q20341）")
        assert(braves(s, "p1", x).length === 3, "X01 のブレイヴが3枚")
        const fourth = put(s, "p1", C.tirok, 1)
        assert(tryCombine(s, "p1", fourth, x) !== null, "さらに4枚目は合体できない")
    }
    {
        const s = board("837-055が2つ")
        const x = put(s, "p1", C.x01, 1)
        combine(s, "p1", x, C.b055)
        combine(s, "p1", x, C.b055)
        const b = put(s, "p1", C.b056, 1)
        assert(tryCombine(s, "p1", b, x) === null, "055 が2つ合体していても 056 は1つ追加で合体できる")
        const b2 = put(s, "p1", C.b056, 1)
        assert(tryCombine(s, "p1", b2, x) !== null, "数を無視できるのは1つだけなので、2枚目の 056 は合体できない（Q20342）")
    }

    console.log("=== 056 合体アタック時：BP5000以下の相手のスピリット1体を破壊。055 も合体していれば、さらに相手の合体スピリットのブレイヴ1つを破壊 ===")
    function attack056(label: string, with055: boolean): { s: GameState; five: ReturnType<typeof put>; six: ReturnType<typeof put>; opp: ReturnType<typeof put> } {
        const s = board(`837-${label}`)
        const host = with055 ? lowHost(s) : put(s, "p1", C.pardo, 1)
        if (with055) combine(s, "p1", host, C.b055)
        combine(s, "p1", host, C.b056)
        const five = put(s, "p2", C.megalon, 1) // BP5000（境界）
        const six = put(s, "p2", C.mattango, 1) // BP6000
        const opp = put(s, "p2", C.wingal, 1) // 合体スピリット（ゴルニックで BP8000 になり、5000以下の対象にならない）
        combine(s, "p2", opp, C.gornik)
        toAttackStep(s, "p1")
        assert(attack(s, "p1", host) === null, `${label}: 合体スピリットがアタックできる`)
        return { s, five, six, opp }
    }
    {
        const r = attack056("055あり", true)
        assert(!onField(r.s, "p2", r.five), "BP5000の相手のスピリットが破壊される")
        assert(onField(r.s, "p2", r.six) && onField(r.s, "p2", r.opp), "BP6000のスピリットと相手の合体スピリット自体は破壊されない")
        assert((r.opp.braveRefs ?? []).length === 0, "055 も合体しているので、相手の合体スピリットのブレイヴが1つ破壊される")
        assert(r.s.players.p2.trashCards.includes(C.gornik), "破壊された相手のブレイヴは相手のトラッシュへ")
    }
    {
        const r = attack056("055なし", false)
        assert(!onField(r.s, "p2", r.five), "055 が無くても BP5000以下の破壊は起きる")
        assert((r.opp.braveRefs ?? []).length === 1, "055 が合体していないときは相手のブレイヴを破壊しない")
    }
}

console.log("すべてのチェックに合格しました 🎉（part837）")
