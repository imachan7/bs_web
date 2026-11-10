// smoke パート882（BS13-038 魔女タランダ・BS10-046 龍仙公主：復活を戻す体の複数選択にする）
//
// 期待値は効果文と 2026-11-10 ユーザー確定の操作の流れだけから書いた（実装は読んでいない）。
// 龍仙公主は効果文に系統の限定が無いので、導魔でない体も候補に入る（タランダは導魔だけ）。
// バトル破壊の実戦は組まず、「1体だけ破壊」で従来の確認になることだけを見る。
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart, viewFor } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { destroyTargetsBatch } from "../../server/src/logic/removal"

const TARANDA = "BS13-038"
const RYUSEN = "BS10-046"
const DOMA_A = "BS17-040" // 呪術士リオ（導魔）
const DOMA_B = "BS10-045" // 闇魔女サブリナ（導魔）
const NON_DOMA = "BS01-001" // ゴラドン（爬獣）
const SPIRITS = ["BS01-002", "BS01-003", "BS01-004"]
const MAGICS = ["BS03-134", "BS02-104", "BS01-123"]

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(TARANDA).name === "魔女タランダ" && getCard(RYUSEN).name === "龍仙公主", "主役2枚の名前")
    assert(getCard(DOMA_A).name === "呪術士リオ" && getCard(DOMA_B).name === "闇魔女サブリナ", "導魔の2体の名前")
    assert(getCard(NON_DOMA).name === "ゴラドン", "導魔でない体の名前")
    assert(SPIRITS.every((c) => getCard(c).type === "spirit") && MAGICS.every((c) => getCard(c).type === "magic"), "手札用の種別")
}

interface Cfg {
    name: string
    master: string
    handKind: string[] // 破棄できる手札
    otherKind: string[] // 破棄できない種別の手札
    victims: string[] // 同時に破壊される体（先頭2体が導魔）
}
const CFGS: Cfg[] = [
    { name: "タランダ", master: TARANDA, handKind: SPIRITS, otherKind: MAGICS, victims: [DOMA_A, DOMA_B] },
    { name: "龍仙公主", master: RYUSEN, handKind: MAGICS, otherKind: SPIRITS, victims: [DOMA_A, DOMA_B] },
]

function game(seed: string, hand: string[]): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => "BS01-002")
    s.players.p2.deck = Array.from({ length: 40 }, () => "BS01-002")
    s.players.p1.hand = [...hand]
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function destroyAll(s: GameState, ids: string[]): void {
    destroyTargetsBatch(s, "p2", ids.map((instanceId) => ({ pid: "p1" as PlayerId, instanceId })), { sourcePid: "p2", sourceType: "spirit" })
}
const onField = (s: GameState, cardId: string) => s.players.p1.field.spirits.find((x) => x.cardId === cardId)
const trashHas = (s: GameState, cardId: string) => s.players.p1.trashCards.includes(cardId)
const choose = (s: GameState, instanceId: string) => act(s, "p1", { type: "resolveChoice", instanceId })
const confirm = (s: GameState) => act(s, "p1", { type: "resolveChoice" })
const pickCard = (s: GameState, cardIndex: number) => act(s, "p1", { type: "resolveChoice", cardIndex })

/** 主役と導魔2体（と任意の追加の体）を並べ、同時に破壊して、戻す体の選択待ちまで進める */
function setup(seed: string, cfg: Cfg, hand: string[], extra: string[] = []) {
    const s = game(seed, hand)
    put(s, "p1", cfg.master, 1)
    const vs = [...cfg.victims, ...extra].map((c) => put(s, "p1", c, 1))
    destroyAll(s, vs.map((v) => v.instanceId))
    return { s, vs }
}

for (const cfg of CFGS) {
    const N = cfg.name
    const H = cfg.handKind
    console.log(`=== ${N}: 同時2体・手札3枚で2体選ぶ ===`)
    {
        const hand = [cfg.otherKind[0]!, H[0]!, H[1]!, H[2]!]
        const { s, vs } = setup(`${N}-two`, cfg, hand)
        const pc = s.pendingChoice
        assert(pc?.kind === "target" && pc.pid === "p1", "1回の誘発で、持ち主に戻す体のトグル選択が立つ")
        assert(pc?.candidates.length === 2 && vs.every((v) => pc.candidates.includes(v.instanceId)), "候補は破壊された2体")
        assert(JSON.stringify(pc?.counter) === JSON.stringify({ label: "戻す", current: 0, max: 2 }), "counter は 戻す 0/2")
        assert(choose(s, vs[0]!.instanceId) === null && choose(s, vs[1]!.instanceId) === null, "2体を選べる")
        assert(s.pendingChoice?.selectedIds?.length === 2 && s.pendingChoice.counter?.current === 2, "選んだ体が selectedIds に入り counter は 2/2")
        assert(confirm(s) === null, "確定")
        const pc2 = s.pendingChoice
        assert(pc2?.kind === "card" && pc2.pid === "p1", "続けて破棄する手札のトグル選択")
        assert(JSON.stringify(pc2?.counter) === JSON.stringify({ label: "捨てる", current: 0, max: 2 }), "counter は 捨てる 0/2")
        assert(JSON.stringify([...(pc2?.cardIndices ?? [])].sort()) === JSON.stringify([1, 2, 3]), "候補は該当種別の3枚だけ（種別違いは出ない）")
        assert(pickCard(s, 1) === null && pickCard(s, 3) === null, "3枚から2枚を選ぶ")
        assert(confirm(s) === null && s.pendingChoice === null, "ちょうど2枚で確定すると選択待ちが消える")
        assert(trashHas(s, H[0]!) && trashHas(s, H[2]!) && !trashHas(s, H[1]!), "選んだ2枚（1枚目と3枚目）が捨てられ、選ばなかった1枚は残る")
        assert(s.players.p1.hand.includes(H[1]!) && s.players.p1.hand.includes(cfg.otherKind[0]!), "手札に残るのは選ばなかった1枚と種別違いの1枚")
        const a = onField(s, DOMA_A)
        const b = onField(s, DOMA_B)
        assert(a?.isRested === true && b?.isRested === true, "2体とも疲労状態で場に残る")
    }

    console.log(`=== ${N}: 1体だけ選ぶ（残りは破壊される） ===`)
    {
        const { s, vs } = setup(`${N}-one`, cfg, [H[0]!, H[1]!, H[2]!])
        choose(s, vs[1]!.instanceId)
        assert(s.pendingChoice?.counter?.current === 1, "counter は 1/2")
        confirm(s)
        assert(s.pendingChoice?.kind === "card" && s.pendingChoice.counter?.max === 1, "破棄は1枚ぶん")
        assert(JSON.stringify(s.pendingChoice?.counter) === JSON.stringify({ label: "捨てる", current: 0, max: 1 }), "counter は 捨てる 0/1")
        pickCard(s, 0)
        confirm(s)
        assert(s.pendingChoice === null, "選択待ちが消える")
        assert(onField(s, DOMA_B)?.isRested === true, "選んだ体が疲労状態で残る")
        assert(!onField(s, DOMA_A) && trashHas(s, DOMA_A), "選ばなかった体は破壊されてトラッシュへ")
        assert(trashHas(s, H[0]!) && s.players.p1.hand.length === 2, "手札から1枚だけ捨てられた")
    }

    console.log(`=== ${N}: 0体で確定すると何も戻さない ===`)
    {
        const { s } = setup(`${N}-zero`, cfg, [H[0]!, H[1]!])
        assert(confirm(s) === null, "0体のまま確定できる")
        assert(s.pendingChoice === null, "破棄の選択に進まない")
        assert(!onField(s, DOMA_A) && !onField(s, DOMA_B), "どちらも戻らず破壊される")
        assert(s.players.p1.hand.length === 2 && !trashHas(s, H[0]!), "手札は捨てられない")
    }

    console.log(`=== ${N}: 手札の該当カードが1枚なら上限1で、2体目は選べない ===`)
    {
        const { s, vs } = setup(`${N}-cap`, cfg, [H[0]!, cfg.otherKind[0]!])
        assert(JSON.stringify(s.pendingChoice?.counter) === JSON.stringify({ label: "戻す", current: 0, max: 1 }), "上限は min(2体, 該当1枚)=1")
        assert(choose(s, vs[0]!.instanceId) === null, "1体目は選べる")
        assert(choose(s, vs[1]!.instanceId) !== null, "上限に達したので2体目はエラー")
        assert(s.pendingChoice?.selectedIds?.length === 1, "選択は1体のまま")
        assert(choose(s, vs[0]!.instanceId) === null && s.pendingChoice?.selectedIds?.length === 0, "もう一度選ぶと解除される")
        assert(choose(s, vs[1]!.instanceId) === null, "解除したあとなら別の体を選べる")
    }

    console.log(`=== ${N}: ちょうど k 枚そろわない確定はエラー ===`)
    {
        const { s, vs } = setup(`${N}-short`, cfg, [H[0]!, H[1]!, H[2]!])
        choose(s, vs[0]!.instanceId)
        choose(s, vs[1]!.instanceId)
        confirm(s)
        pickCard(s, 0)
        assert(confirm(s) !== null, "2体ぶんなのに1枚だけでの確定はエラー")
        assert(s.pendingChoice?.kind === "card", "選択待ちは続く")
        assert(!trashHas(s, H[0]!), "エラーのあいだ手札は捨てられない")
        pickCard(s, 1)
        assert(confirm(s) === null && s.pendingChoice === null, "2枚そろえれば確定できる")
        assert(onField(s, DOMA_A)?.isRested === true && onField(s, DOMA_B)?.isRested === true, "2体とも戻る")
    }

    console.log(`=== ${N}: 手札に該当カードが0枚なら選択も確認も出ず破壊される ===`)
    {
        const { s } = setup(`${N}-nohand`, cfg, [...cfg.otherKind])
        assert(s.pendingChoice === null, "選択待ちが立たない")
        assert(!onField(s, DOMA_A) && !onField(s, DOMA_B), "そのまま破壊される")
    }

    console.log(`=== ${N}: 破壊が1体だけなら従来の確認（option） ===`)
    {
        const s = game(`${N}-single-ok`, [H[0]!, H[1]!])
        put(s, "p1", cfg.master, 1)
        const v = put(s, "p1", DOMA_A, 1)
        destroyAll(s, [v.instanceId])
        const pc = s.pendingChoice
        assert(pc?.kind === "option" && pc.pid === "p1" && pc.options?.includes("復活させる") === true, "確認（復活させる）が立つ")
        assert(act(s, "p1", { type: "resolveChoice", option: "復活させる" }) === null, "承認する")
        if (s.pendingChoice?.kind === "card") {
            assert(pickCard(s, 0) === null && confirm(s) === null, "手札1枚を選んで破棄")
        }
        assert(s.pendingChoice === null && onField(s, DOMA_A)?.isRested === true, "疲労状態で戻る")
        assert(s.players.p1.hand.length === 1, "手札から1枚捨てられた")

        const t = game(`${N}-single-skip`, [H[0]!])
        put(t, "p1", cfg.master, 1)
        const w = put(t, "p1", DOMA_A, 1)
        destroyAll(t, [w.instanceId])
        assert(confirm(t) === null && t.pendingChoice === null, "スキップで断る")
        assert(!onField(t, DOMA_A) && t.players.p1.hand.length === 1, "断ると破壊され、手札も捨てない")
    }

    console.log(`=== ${N}: 相手の画面には counter が見えない ===`)
    {
        const { s } = setup(`${N}-view`, cfg, [H[0]!, H[1]!])
        assert(viewFor(s, "p1").pendingChoice?.counter !== undefined, "持ち主には counter が見える")
        const opp = viewFor(s, "p2").pendingChoice
        assert(opp === null || opp.counter === undefined, "相手には counter が渡らない")
    }
}

console.log("=== タランダ: 導魔でない体は候補に入らない ===")
{
    const cfg = CFGS[0]!
    const { s, vs } = setup("taranda-nondoma", cfg, SPIRITS, [NON_DOMA])
    const pc = s.pendingChoice
    assert(pc?.kind === "target" && pc.candidates.length === 2, "候補は導魔の2体だけ")
    assert(!pc?.candidates.includes(vs[2]!.instanceId), "ゴラドン（爬獣）は候補にない")
    assert(pc?.counter?.max === 2, "上限は導魔の体数と手札で決まる（3体破壊でも 2）")
    choose(s, vs[0]!.instanceId)
    choose(s, vs[1]!.instanceId)
    confirm(s)
    pickCard(s, 0)
    pickCard(s, 1)
    confirm(s)
    assert(!onField(s, NON_DOMA) && trashHas(s, NON_DOMA), "導魔でない体は戻らず破壊される")
}

console.log("=== タランダ: 導魔でない体だけが破壊されても誘発しない ===")
{
    const s = game("taranda-nondoma-only", SPIRITS)
    put(s, "p1", TARANDA, 1)
    const v = put(s, "p1", NON_DOMA, 1)
    destroyAll(s, [v.instanceId])
    assert(s.pendingChoice === null && !onField(s, NON_DOMA), "選択も確認も出ず破壊される")
}

console.log("=== 龍仙公主: 系統の限定が無いので導魔でない体も候補に入る ===")
{
    const s = game("ryusen-nondoma", MAGICS)
    put(s, "p1", RYUSEN, 1)
    const a = put(s, "p1", DOMA_A, 1)
    const g = put(s, "p1", NON_DOMA, 1)
    destroyAll(s, [a.instanceId, g.instanceId])
    const pc = s.pendingChoice
    assert(pc?.kind === "target" && pc.candidates.length === 2 && pc.candidates.includes(g.instanceId) === true, "ゴラドンも候補に入る")
    choose(s, g.instanceId)
    confirm(s)
    pickCard(s, 0)
    confirm(s)
    assert(onField(s, NON_DOMA)?.isRested === true && !onField(s, DOMA_A), "選んだ導魔でない体だけが疲労状態で戻る")
}

console.log("=== 発生源自身も候補に入る（「このスピリット以外」の記載が無い。2026-10-29 ユーザー確認） ===")
{
    const s = game("ryusen-self-both", [MAGICS[0]!, MAGICS[1]!])
    const r = put(s, "p1", RYUSEN, 1)
    const a = put(s, "p1", DOMA_A, 1)
    destroyAll(s, [r.instanceId, a.instanceId])
    const pc = s.pendingChoice
    assert(pc?.kind === "target" && pc.candidates.length === 2 && pc.candidates.includes(r.instanceId) === true, "龍仙公主自身も戻す候補に入る")
    assert(choose(s, r.instanceId) === null && choose(s, a.instanceId) === null && confirm(s) === null, "2体とも選んで確定")
    pickCard(s, 0)
    pickCard(s, 1)
    confirm(s)
    assert(s.pendingChoice === null && onField(s, RYUSEN)?.isRested === true && onField(s, DOMA_A)?.isRested === true, "公主も他の1体も疲労状態で戻る")

    const t = game("ryusen-self-only", [MAGICS[0]!, MAGICS[1]!])
    const r2 = put(t, "p1", RYUSEN, 1)
    const a2 = put(t, "p1", DOMA_A, 1)
    destroyAll(t, [r2.instanceId, a2.instanceId])
    choose(t, r2.instanceId)
    confirm(t)
    pickCard(t, 0)
    confirm(t)
    assert(t.pendingChoice === null && onField(t, RYUSEN)?.isRested === true, "公主だけを選んでも戻る")
    assert(!onField(t, DOMA_A), "選ばなかった体は破壊される")
}

console.log("=== タランダ: 自身（導魔）も候補に入る ===")
{
    const s = game("taranda-self", SPIRITS)
    const r = put(s, "p1", TARANDA, 1)
    const a = put(s, "p1", DOMA_A, 1)
    destroyAll(s, [r.instanceId, a.instanceId])
    const pc = s.pendingChoice
    assert(pc?.kind === "target" && pc.candidates.length === 2 && pc.candidates.includes(r.instanceId) === true, "タランダ自身も候補に入る")
    choose(s, r.instanceId)
    choose(s, a.instanceId)
    confirm(s)
    pickCard(s, 0)
    pickCard(s, 1)
    confirm(s)
    assert(s.pendingChoice === null && onField(s, TARANDA)?.isRested === true && onField(s, DOMA_A)?.isRested === true, "2体とも疲労状態で戻る")
}

console.log("すべてのチェックに合格しました 🎉（part882）")
