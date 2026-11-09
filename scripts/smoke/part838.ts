// smoke パート838（BS23-X01 龍輝神シャイニング・ドラゴン・オーバーレイ：合体数+1／X13-11 ソードディスティニー）
// 公式Q&A：Q4584・Q4585・Q4588（X01）、Q26786・Q26787（X13-11）。docs/design/BS23_PLAN.md §1
import { act, assert, destroySpirit, getCard } from "./helpers"
import type { GameState } from "./helpers"
import { C, attack, board, braveNames, braves, closeFlash, combine, flashAs, handNames, onField, put, ready, toAttackStep, tryCombine, trashNames } from "./bs23b2"

if (ready("part838")) {
    const N = (id: string) => getCard(id).name

    console.log("=== X01 Lv1：系統「剣使」の自分のスピリットすべてがブレイヴ2つまで合体できる（自身も） ===")
    {
        const s = board("838-X01なし")
        const h = put(s, "p1", C.pardo, 1)
        combine(s, "p1", h, C.gornik)
        const second = put(s, "p1", C.tirok, 1)
        assert(tryCombine(s, "p1", second, h) !== null, "X01 がいないとき、剣使のスピリットも合体できるのは1つまで")
    }
    {
        const s = board("838-X01あり")
        put(s, "p1", C.x01, 1)
        const h = put(s, "p1", C.pardo, 1)
        combine(s, "p1", h, C.gornik)
        const second = put(s, "p1", C.tirok, 1)
        assert(tryCombine(s, "p1", second, h) === null, "X01 がいるとき、剣使の自分のスピリットはブレイヴ2つまで合体できる")
        assert(braves(s, "p1", h).length === 2, "2つ合体している")
        const third = put(s, "p1", C.b055, 1)
        assert(tryCombine(s, "p1", third, h) !== null, "3つ目は合体できない")
    }
    {
        const s = board("838-X01自身")
        const x = put(s, "p1", C.x01, 1)
        combine(s, "p1", x, C.gornik)
        const second = put(s, "p1", C.tirok, 1)
        assert(tryCombine(s, "p1", second, x) === null, "X01 自身もブレイヴ2つまで合体できる（Q4584）")
    }
    {
        const s = board("838-剣使でない")
        put(s, "p1", C.x01, 1)
        const h = put(s, "p1", C.wingal, 1) // 武装・剣使ではない
        combine(s, "p1", h, C.gornik)
        const second = put(s, "p1", C.tirok, 1)
        assert(tryCombine(s, "p1", second, h) !== null, "剣使でないスピリットには効かない")
    }
    {
        const s = board("838-相手の剣使")
        put(s, "p1", C.x01, 1)
        const h = put(s, "p2", C.pardo, 1)
        combine(s, "p2", h, C.gornik)
        const second = put(s, "p2", C.tirok, 1)
        assert(tryCombine(s, "p2", second, h) !== null, "X01 の持ち主の側のスピリットだけに効く（相手の剣使には効かない）")
    }
    {
        // Q4588：X01 が場を離れて数があふれたら、持ち主が1つ選んで分離する
        const s = board("838-X01が離れる")
        const x = put(s, "p1", C.x01, 1)
        const h = put(s, "p1", C.pardo, 1)
        combine(s, "p1", h, C.gornik)
        combine(s, "p1", h, C.tirok)
        destroySpirit(s, "p1", x.instanceId)
        assert(!onField(s, "p1", x), "X01 が破壊された")
        assert(braves(s, "p1", h).length === 1, `X01 が離れると、合体数が1つにあふれた分が分離される（合体中: ${braveNames(s, "p1", h)}）`)
    }

    console.log("=== X13-11：バトルしている剣使に合体数+1、手札のブレイヴを直接合体でコストなしに召喚（召喚時は発揮しない）。バトル終了時に破壊 ===")
    // 剣使の host が opp のスピリットなしでアタックし、アタック宣言直後のフラッシュで X13-11 を使う
    function sword(label: string, setup: (s: GameState, host: ReturnType<typeof put>) => void, hostId = C.pardo): { s: GameState; host: ReturnType<typeof put> } {
        const s = board(`838-${label}`)
        const host = put(s, "p1", hostId, 1)
        setup(s, host)
        s.players.p1.hand = [C.sword, C.b055]
        toAttackStep(s, "p1")
        assert(attack(s, "p1", host) === null, `${label}: 剣使のスピリットがアタックできる`)
        return { s, host }
    }
    const cast = (s: GameState, host: ReturnType<typeof put>, handIndex = 0) => flashAs(s, "p1", { type: "castMagic", handIndex, timing: "flash", targetInstanceId: host.instanceId })
    {
        const { s, host } = sword("基本", (st) => {
            const m = put(st, "p2", C.mattango, 1) // 055 の召喚時が発揮されたら破壊されるはずの BP6000。疲労させてブロックの余地を消す
            m.isRested = true
        })
        const reserveBefore = s.players.p1.reserve
        const err = cast(s, host)
        assert(err === null, `バトル中の剣使がいる場面で X13-11 を使える${err ? `（拒否: ${err}）` : ""}`)
        assert(braveNames(s, "p1", host) === N(C.b055), `手札の 055 が直接合体で召喚された（合体中: ${braveNames(s, "p1", host)}）`)
        assert(handNames(s, "p1") === "なし", `X13-11 は使用済み・055 は召喚済みで手札は空（${handNames(s, "p1")}）`)
        assert(s.players.p1.reserve >= reserveBefore - 5, "055 のコストは支払っていない（支払いは X13-11 の5コストまで）")
        assert(s.players.p2.field.spirits.length === 1, "055 の『このブレイヴの召喚時』は発揮されない（BP6000の相手のスピリットが残る）")
        closeFlash(s)
        assert(act(s, "p2", { type: "takeLife" }) === null, "ブロックなしでライフを受けてバトルが終わる")
        assert(braves(s, "p1", host).length === 0 && !s.players.p1.field.spirits.some((x) => x.cardId === C.b055), "バトル終了時に、この効果で召喚したブレイヴは破壊される（スピリット状態でも残らない）")
        assert(trashNames(s, "p1").includes(N(C.b055)), "破壊された 055 は持ち主のトラッシュにある")
        assert(onField(s, "p1", host), "合体元のスピリットは場に残る")
    }
    {
        const { s, host } = sword("すでに1つ合体", (st, h) => {
            combine(st, "p1", h, C.gornik)
        })
        assert(cast(s, host) === null, "すでに1つ合体している剣使にも、合体数+1で 055 を直接合体できる")
        assert(braves(s, "p1", host).length === 2, "合体しているブレイヴが2つ")
    }
    {
        // Q26787：X01 が2つと合体中でも3つ目
        const { s, host } = sword("X01が2つ", (st, h) => {
            combine(st, "p1", h, C.gornik)
            combine(st, "p1", h, C.tirok)
        }, C.x01)
        assert(cast(s, host) === null, "X01 が2つと合体していても、合体数+1で3つ目を合体できる（Q26787）")
        assert(braves(s, "p1", host).length === 3, "合体しているブレイヴが3つ")
    }
    {
        const { s, host } = sword("ターンに1回", () => {})
        s.players.p1.hand = [C.sword, C.sword, C.b055, C.b055]
        assert(cast(s, host) === null, "1回目は使える")
        for (let i = 0; i < 3 && s.isFlashTiming && s.priorityPlayer !== "p1"; i++) act(s, s.priorityPlayer, { type: "pass" })
        // 優先権が自分に戻る場面でなければ、拒否の理由が回数制限かどうか区別できない
        assert(s.isFlashTiming && s.priorityPlayer === "p1", "1回目の解決後、同じフラッシュで自分に優先権が戻る")
        assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: host.instanceId }) !== null, "2枚目の X13-11 はターンに1回の制限で使えない")
    }
    {
        const s = board("838-剣使でない")
        const a = put(s, "p1", C.wingal, 1)
        s.players.p1.hand = [C.sword, C.b055]
        toAttackStep(s, "p1")
        assert(attack(s, "p1", a) === null, "武装のウィンガルがアタックできる")
        assert(flashAs(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: a.instanceId }) !== null, "バトルしているのが剣使でなければ使えない")
    }
    {
        const { s, host } = sword("手札にブレイヴなし", () => {})
        s.players.p1.hand = [C.sword]
        assert(cast(s, host) !== null, "手札にブレイヴが無ければ使えない（効果が解決できない）")
    }
}

console.log("すべてのチェックに合格しました 🎉（part838）")
