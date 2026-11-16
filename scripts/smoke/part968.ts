// smoke パート968（BS13-049イリテバンが、『合体アタック時』の指定アタック（canDirectAttack）を借りて立てる。#583）
// A 対話：BS20-058 のコア除去のあと指定の選択が出て、選んだ相手が指定先になる／B 赤シンボル無し：指定は出ない
// C 任意：BS18-056 の指定候補は疲労状態だけ・選ばなければ通常のアタック／D 指定の後に連鎖（白シンボル）も発揮
// E 非対話：指定は実効BPが最も低い相手になる
import { assert, act, createGame, createInstance, effectiveBp, getCard, giveBp, lockedFor, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { CardInstance } from "../../server/src/type"
import { attachBrave } from "../../server/src/logic/brave"
import { countSymbols } from "../../shared/rules"

assert(getCard("BS13-049").name === "イリテバン", "BS13-049はイリテバン")
assert(getCard("BS20-058").name === "スカルプレイン", "BS20-058はスカルプレイン")
assert(getCard("BS18-056").name === "聖剣竜エクス・ワイバーン", "BS18-056は聖剣竜エクス・ワイバーン")
assert(getCard("BS23-057").name === "ザグナ・オリックス", "BS23-057はザグナ・オリックス")
assert(getCard("BS17-030").name === "トドール" && getCard("BS17-030").type === "spirit", "BS17-030はトドール（白・機獣）")
assert(getCard("BS02-023").name === "双蛇ヒュドラム", "BS02-023は双蛇ヒュドラム（紫・赤シンボル無し）")

type Board = { host: CardInstance; iri: CardInstance; oppA: CardInstance; oppB: CardInstance }

// 自分：ホスト（恐竜王・赤）にイリテバンを合体させ、借り元のブレイヴをスピリット状態で置く。相手：A（コア3）・B（コア1）
function board(s: GameState, host: string, borrowed: string | null): Board {
    const p1 = s.players.p1
    const h = createInstance(host, s.turn, 1)
    p1.field.spirits.push(h)
    const iri = createInstance("BS13-049", s.turn, 1)
    p1.field.spirits.push(iri)
    attachBrave(s, "p1", h, iri)
    if (borrowed !== null) p1.field.spirits.push(createInstance(borrowed, s.turn, 1))
    const oppA = createInstance("BS01-001", s.turn, 3)
    const oppB = createInstance("BS01-002", s.turn, 1)
    s.players.p2.field.spirits.push(oppA, oppB)
    refreshLevelAsOverrides(s)
    return { host: h, iri, oppA, oppB }
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

type Pick = { borrow?: string; core?: string; directed?: string; option?: string; count?: string; onDirected?: (candidates: string[]) => void; onOption?: (options: string[]) => void }

// 選択待ちを答え続ける。確認は「発動する」、借りる元は pick.borrow、見出しの選択は pick.option（無ければ「発動する」）、コア除去は pick.core、指定は pick.directed（無ければスキップ）
function drive(s: GameState, pick: Pick): void {
    for (let n = 0; s.pendingChoice && !s.winner; n++) {
        if (n > 20) throw new Error("選択が終わらない")
        const pc = s.pendingChoice
        if (pc.kind === "option") {
            pick.onOption?.([...(pc.options ?? [])])
            // 【分身】の発揮は置く枚数・置くコアの数を聞く（stepper）。どちらも pick.count（無ければ1）
            const label = pick.option !== undefined && (pc.options ?? []).includes(pick.option) ? pick.option
                : pc.prompt.includes("枚数") || pc.prompt.includes("コアの数") ? (pick.count ?? "1") : "発動する"
            const err = act(s, pc.pid, { type: "resolveChoice", option: label })
            assert(err === null, `発動する: ${err}`)
            continue
        }
        let id: string | undefined
        if (pc.prompt.includes("指定してアタック")) {
            pick.onDirected?.([...pc.candidates])
            id = pick.directed
        }
        else if (pc.prompt.includes("借りる")) id = pick.borrow
        else id = pick.core ?? pc.candidates[0]
        if (id !== undefined && !pc.candidates.includes(id)) id = undefined
        const err = act(s, pc.pid, id === undefined ? { type: "resolveChoice" } : { type: "resolveChoice", instanceId: id })
        assert(err === null, `選択への応答: ${err}`)
    }
}

// フラッシュを閉じる。ブロッカーは閉じた後のバトル解決で消えるので、現れた値を返す（指定の確定はフラッシュ①を閉じる時）
function closeFlash(s: GameState): string | undefined {
    let blocker: string | undefined
    for (let n = 0; s.isFlashTiming && s.battle && n < 10; n++) {
        const err = act(s, s.priorityPlayer, { type: "pass" })
        if (err) throw new Error(`フラッシュを閉じられない: ${err}`)
        blocker = s.battle?.blockerInstanceId ?? blocker
    }
    return blocker
}

function attackWith(s: GameState, attacker: CardInstance): void {
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1がアタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "合体スピリットでアタック")
}

console.log("=== A. 対話：借りた BS20-058 のコア除去のあと指定の選択が出て、選んだ相手が指定先になる ===")
{
    const s = game("p968-a", true)
    const b = board(s, "BS13-008", "BS20-058")
    const lifeBefore = s.players.p2.life
    const borrowed = s.players.p1.field.spirits.find((x) => x.cardId === "BS20-058")!
    assert(countSymbols(s.players.p1, ["red"]) >= 1, "赤シンボルがある（ホスト・イリテバン）")
    attackWith(s, b.host)
    // 借りる元の候補は BS20-058 とイリテバン自身の2つ。確認→BS20-058→コア除去の対象（oppA）→指定（oppB）
    drive(s, { borrow: borrowed.instanceId, core: b.oppA.instanceId, directed: b.oppB.instanceId })
    assert(b.oppA.cores === 1, `コア除去：相手Aのコアが1個になる（${b.oppA.cores}）`)
    assert(s.battle?.directedTargetInstanceId === b.oppB.instanceId || s.battle?.blockerInstanceId === b.oppB.instanceId, "指定の相手にBを選んだ")
    assert(closeFlash(s) === b.oppB.instanceId, "指定先Bがブロッカーになる")
    assert(s.players.p2.life === lifeBefore, "相手はライフで受けない")
}

console.log("=== B. 対照：赤シンボルが無い → コア除去だけで指定の選択は出ない ===")
{
    const s = game("p968-b", true)
    const b = board(s, "BS02-023", "BS20-058")
    const borrowed = s.players.p1.field.spirits.find((x) => x.cardId === "BS20-058")!
    attackWith(s, b.host)
    // アタック宣言の後・借用の確認の前に、ホストを無色にする（合体中のイリテバンの赤もホストのシンボルとして数えられるため）
    resolveAction(s, "p1", b.host, { type: "timedEffect", content: [{ type: "colorless" }], duration: "battle", target: "self" })
    refreshLevelAsOverrides(s)
    assert(countSymbols(s.players.p1, ["red"]) === 0, "赤シンボルが無い（前提）")
    drive(s, { borrow: borrowed.instanceId, core: b.oppA.instanceId })
    assert(b.oppA.cores === 1, "コア除去は起きる")
    assert(s.pendingChoice === null, "指定の選択は出ない")
    assert(s.battle?.directedTargetInstanceId === undefined, "指定先は立たない")
}

console.log("=== C. 任意：BS18-056 の指定候補は疲労状態だけ。選ばなければ通常のアタック ===")
{
    const s = game("p968-c", true)
    const b = board(s, "BS13-008", "BS18-056")
    b.oppA.isRested = true // 疲労状態の相手だけが候補
    const borrowed = s.players.p1.field.spirits.find((x) => x.cardId === "BS18-056")!
    attackWith(s, b.host)
    let directedCandidates: string[] = []
    // 指定は選ばない（スキップ）。候補だけ記録する
    drive(s, { borrow: borrowed.instanceId, onDirected: (c) => { directedCandidates = c } })
    assert(directedCandidates.length === 1 && directedCandidates[0] === b.oppA.instanceId, "指定候補は疲労状態の相手Aだけ")
    assert(s.pendingChoice === null, "選ばなければ選択は終わる")
    assert(closeFlash(s) === undefined, "指定されず通常のアタック（ブロッカーなし）")
}

console.log("=== D. 指定の後に連鎖（白シンボル）も発揮する：BS23-057 ザグナ・オリックス ===")
{
    const s = game("p968-d", true)
    const b = board(s, "BS13-008", "BS23-057")
    b.oppA.isRested = true // ザグナの指定は疲労状態の相手だけ
    const toddle = createInstance("BS17-030", s.turn, 1) // 白シンボル・系統「機獣」
    s.players.p1.field.spirits.push(toddle)
    refreshLevelAsOverrides(s)
    const coresBefore = toddle.cores
    const borrowed = s.players.p1.field.spirits.find((x) => x.cardId === "BS23-057")!
    attackWith(s, b.host)
    drive(s, { borrow: borrowed.instanceId, directed: b.oppA.instanceId })
    assert(toddle.cores === coresBefore + 1, `連鎖：機獣のトドールにコア+1（${coresBefore}→${toddle.cores}）`)
    assert(closeFlash(s) === b.oppA.instanceId, "指定した疲労の相手Aがブロッカーになる")
}

console.log("=== E. 非対話：指定は実効BPが最も低い相手になる ===")
{
    const s = game("p968-e", false)
    const b = board(s, "BS13-008", "BS20-058")
    giveBp(s, b.oppA, 5000) // 相手A（コア3でBP3000＋5000）より相手B（BP1000）が低い。コア除去で相手Aのコアが減っても高いまま
    assert(effectiveBp(s, "p2", b.oppB) < effectiveBp(s, "p2", b.oppA), "前提：Bの方がBPが低い")
    attackWith(s, b.host)
    assert(closeFlash(s) === b.oppB.instanceId, "実効BPが最も低いBがブロッカーになる")
}

// F 系：BS23-060 日輪丸は『アタック時』の見出しが2つ（e1 バースト封じ／e2 【分身】の発揮）。借りるのは見出し1つ
// 分身の発揮は host（BS23-025 JU＝分身持ち）の分身が作られるかで見る（part859 の 060 と同じ観測）
console.log("=== F. 対話：日輪丸の見出しが2つ → 『相手はバーストを発動できない』を選ぶと、その効果だけが発揮される ===")
{
    const s = game("p968-f", true)
    const b = board(s, "BS23-025", "BS23-060")
    const brave = s.players.p1.field.spirits.find((x) => x.cardId === "BS23-060")!
    attackWith(s, b.host)
    let labels: string[] = []
    // 確認（「発動する」1つ）の選択肢は除き、見出しの選択肢（2つ）だけを記録する
    drive(s, { borrow: brave.instanceId, option: "相手はバーストを発動できない。", onOption: (o) => { if (o.length > 1) labels = o } })
    assert(labels.length === 2 && labels[0] === "相手はバーストを発動できない。" && labels[1]?.includes("分身") === true, `見出しの選択肢は2つ（${labels.join(" / ")}）`)
    assert(lockedFor(s, "p2", "burst"), "e1：相手はバーストを発動できない（借りた見出し）")
    assert(!s.players.p1.field.spirits.some((x) => x.bunshinOf !== undefined), "e2：【分身】は発揮されない（借りていない見出し）")
}

console.log("=== F2. 非対話：日輪丸は1つ目の見出し（バースト封じ）だけが発揮される ===")
{
    const s = game("p968-f2", false)
    const b = board(s, "BS23-025", "BS23-060")
    attackWith(s, b.host)
    assert(lockedFor(s, "p2", "burst"), "1つ目の見出し：相手はバーストを発動できない")
    assert(!s.players.p1.field.spirits.some((x) => x.bunshinOf !== undefined), "2つ目の見出し（【分身】）は発揮されない")
}

console.log("=== F3. 対照：2つ目の見出し（【分身】）を選ぶと分身が作られ、バーストは封じられない ===")
{
    const s = game("p968-f3", true)
    const b = board(s, "BS23-025", "BS23-060")
    const brave = s.players.p1.field.spirits.find((x) => x.cardId === "BS23-060")!
    attackWith(s, b.host)
    drive(s, { borrow: brave.instanceId, option: "このスピリットが持つ【分身】を発揮させる。" })
    assert(s.players.p1.field.spirits.some((x) => x.bunshinOf !== undefined), "【分身】が発揮されて分身ができる")
    assert(!lockedFor(s, "p2", "burst"), "バースト封じは掛からない")
}

console.log("すべてのチェックに合格しました 🎉（part968）")
