// smoke パート782（BS20-X01 滅龍帝ジエンド・ドラゴニス・BS20-054 戦騎将パトロクロス：破壊されたコアの置き場・ブロックされたときの回復・アタック時フラッシュ起動の回数上限・【強化】疲労コストの回復）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const X01 = "BS20-X01" // 滅龍帝ジエンド・ドラゴニス（赤・コスト9・Lv1=1・Lv2=3・Lv3=5・Lv4=8）
const PATRO = "BS20-054" // 戦騎将パトロクロス（青・コスト8・Lv1=1・Lv2=3・Lv3=6）
const RANDAL = "BS19-061" // 光の闘士ランダル（コスト3・Lv1･Lv2【強化】）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認（BS20 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS20.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; levels: { level: number; cores: number }[] }[]
    const x01 = staging.find((c) => c.cardId === X01)
    const patro = staging.find((c) => c.cardId === PATRO)
    assert(x01?.name === "滅龍帝ジエンド・ドラゴニス" && x01.type === "spirit" && x01.cost === 9, "X01は滅龍帝ジエンド・ドラゴニス（スピリット・コスト9）")
    assert(x01?.levels.map((l) => l.cores).join("/") === "1/3/5/8", "X01のLvコアは1/3/5/8")
    assert(patro?.name === "戦騎将パトロクロス" && patro.type === "spirit" && patro.cost === 8, "PATROは戦騎将パトロクロス（スピリット・コスト8）")
    assert(getCard(RANDAL).name === "光の闘士ランダル" && (getCard(RANDAL).effect ?? "").includes("【強化】"), "RANDALは光の闘士ランダル（【強化】持ち）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1, "VANはロクケラトプス（コスト1）")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 5
        p.burst = null
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// pendingChoice を答える（option は「発動する」を優先、target は picks に入っていればそれを選ぶ）
function settle(s: GameState, picks: string[] = []): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = o.includes("発動する") ? "発動する" : o[0] ?? ""
            err = act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// フラッシュタイミングを連続パスで閉じる
function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

console.log("=== A. X01 Lv1：X01以外の自分のスピリットが破壊されたら、そのコアはリザーブではなくX01へ ===")
{
    const s = game("a")
    const x01 = put(s, "p1", X01, 1) // Lv1
    const ally = put(s, "p1", VAN, 3)
    const reserve = s.players.p1.reserve
    destroySpirit(s, "p1", ally.instanceId, "destroy")
    assert(x01.cores === 4, "破壊されたスピリットのコア3個がX01に置かれる（1→4）")
    assert(s.players.p1.reserve === reserve, "リザーブは増えない")
}

console.log("=== B. X01 Lv1：X01自身が破壊されたら、そのコアはリザーブへ ===")
{
    const s = game("b")
    const x01 = put(s, "p1", X01, 2)
    const reserve = s.players.p1.reserve
    destroySpirit(s, "p1", x01.instanceId, "destroy")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === x01.instanceId), "X01自身は破壊される")
    assert(s.players.p1.reserve === reserve + 2, "X01のコア2個はリザーブへ置かれる")
}

console.log("=== C. X01 Lv2：X01以外の自分のスピリットがブロックされたらX01は回復する。X01自身がブロックされても回復しない ===")
{
    const s = game("c")
    const x01 = put(s, "p1", X01, 3) // Lv2
    x01.isRested = true
    const ally = put(s, "p1", VAN, 1)
    const blocker = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: ally.instanceId }) === null, "X01以外のスピリットでアタックできる")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手スピリットでブロックできる")
    passFlash(s)
    assert(!x01.isRested, "X01以外の自分のスピリットがブロックされたので、疲労状態のX01は回復する")
}
{
    const s = game("c2")
    const x01 = put(s, "p1", X01, 3) // Lv2
    const blocker = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: x01.instanceId }) === null, "X01でアタックできる")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手スピリットでX01をブロックできる")
    passFlash(s)
    assert(x01.isRested, "X01自身がブロックされてもX01は回復しない")
}

console.log("=== D. X01 Lv3：アタック中のフラッシュで自分のスピリット1体を破壊することでX01は回復する。破壊したスピリットのコアはLv1の効果でX01へ ===")
{
    const s = game("d")
    const x01 = put(s, "p1", X01, 5) // Lv3
    const ally = put(s, "p1", VAN, 1)
    const reserve = s.players.p1.reserve
    assert(act(s, "p1", { type: "attack", instanceId: x01.instanceId }) === null, "X01でアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    const effectId = getCard(X01).effects.find((e) => e.kind === "activated")!.id
    assert(act(s, "p1", { type: "activateAbility", instanceId: x01.instanceId, effectId }) === null, "防御側がパスした後でフラッシュ起動ができる")
    settle(s, [ally.instanceId])
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === ally.instanceId), "選んだ自分のスピリットが破壊される")
    assert(!x01.isRested, "X01は回復する")
    assert(x01.cores === 6, "破壊したスピリットのコア1個はX01に置かれる（5→6）")
    assert(s.players.p1.reserve === reserve, "リザーブは増えない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== E. X01 Lv3：回復効果はターンに3回まで（X01は回復できる＝疲労状態のときだけ起動できる）。同名2体でも合計3回 ===")
{
    const s = game("e")
    s.players.p2.life = 10 // X01のアタックを4回ライフで受ける（コスト9でライフを2つ減らすため余裕を持たせる）
    const x01a = put(s, "p1", X01, 5) // Lv3
    const x01b = put(s, "p1", X01, 5) // Lv3（同名のもう1体）
    const allies = [put(s, "p1", VAN, 1), put(s, "p1", VAN, 1), put(s, "p1", VAN, 1)]
    const effectId = getCard(X01).effects.find((e) => e.kind === "activated")!.id
    // 「破壊することで回復する」は回復まで完全に解決できるときだけ使える＝アタックして疲労した状態で起動する
    for (let i = 0; i < 2; i++) {
        assert(act(s, "p1", { type: "attack", instanceId: x01a.instanceId }) === null, `X01（1体目）の${i + 1}回目のアタックができる`)
        assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
        assert(act(s, "p1", { type: "activateAbility", instanceId: x01a.instanceId, effectId }) === null, `${i + 1}回目の起動ができる`)
        settle(s, [allies[i]!.instanceId])
        assert(!x01a.isRested, `${i + 1}回目でX01（1体目）は回復する`)
        takeLifeAndResolve(s, "p2")
    }
    assert(act(s, "p1", { type: "attack", instanceId: x01b.instanceId }) === null, "X01（2体目）のアタックができる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "activateAbility", instanceId: x01b.instanceId, effectId }) === null, "同名でも3回目の起動ができる")
    settle(s, [allies[2]!.instanceId])
    assert(!x01b.isRested, "3回目でX01（2体目）は回復する")
    takeLifeAndResolve(s, "p2")
    assert(act(s, "p1", { type: "attack", instanceId: x01b.instanceId }) === null, "回復したX01（2体目）はもう一度アタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "activateAbility", instanceId: x01b.instanceId, effectId }) !== null, "合計4回目は拒否される")
    assert(x01b.isRested, "4回目は拒否されるのでX01（2体目）は回復しない")
    assert(s.players.p1.field.spirits.filter((x) => x.cardId === VAN).length === 0, "4回目ではスピリットは破壊されない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== F. 054：アタック時に【強化】持ち（パトロクロス以外）を疲労させることで回復する。もう1体のパトロクロスは対象にならない ===")
{
    const s = game("f")
    const patro = put(s, "p1", PATRO, 1) // Lv1
    const patro2 = put(s, "p1", PATRO, 1) // もう1体のパトロクロス
    const randal = put(s, "p1", RANDAL, 1)
    assert(act(s, "p1", { type: "attack", instanceId: patro.instanceId }) === null, "パトロクロスでアタックできる")
    // 疲労させる1体を選ぶ選択待ちが出るなら、もう1体のパトロクロスが候補に入らないことを確かめる
    const pc = s.pendingChoice as { kind: string; candidates?: string[] } | null
    if (pc?.kind === "target") {
        assert((pc.candidates ?? []).includes(randal.instanceId), "【強化】を持つランダルは疲労の候補に入る")
        assert(!(pc.candidates ?? []).includes(patro2.instanceId), "もう1体のパトロクロスは候補に入らない")
    }
    settle(s, [randal.instanceId])
    assert(randal.isRested, "選んだランダルは疲労する")
    assert(!patro.isRested, "ランダルを疲労させたのでパトロクロスは回復する")
    assert(!patro2.isRested, "もう1体のパトロクロスは対象にならないので疲労しない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== G. 054：疲労させられる【強化】持ちがいなければ回復しない ===")
{
    const s = game("g")
    const patro = put(s, "p1", PATRO, 1) // Lv1
    const patro2 = put(s, "p1", PATRO, 1) // パトロクロス以外の条件を満たさない
    const randal = put(s, "p1", RANDAL, 1)
    randal.isRested = true // すでに疲労していて疲労させられない
    assert(act(s, "p1", { type: "attack", instanceId: patro.instanceId }) === null, "パトロクロスでアタックできる")
    settle(s)
    assert(patro.isRested, "疲労させられる【強化】持ちがいないのでパトロクロスは回復しない")
    assert(!patro2.isRested && randal.isRested, "もう1体のパトロクロスも疲労したランダルも変わらない")
    takeLifeAndResolve(s, "p2")
}

console.log("すべてのチェックに合格しました 🎉（part782）")
