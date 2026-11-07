// smoke パート818（BS22 B6：049 海皇子イオン／084 レゾリューション／015 ミイラ・ファント／017 ボーン・ベア。効果文と docs/design/BS22_PLAN.md §1 の読み）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const ION = "BS22-049" // 海皇子イオン（青・コスト5・Lv1 BP4000 / Lv2 BP6000）
const RESOLUTION = "BS22-084" // レゾリューション（青・マジック・コスト5・フラッシュ）
const FANT = "BS22-015" // ミイラ・ファント（紫・コスト4）
const BEAR = "BS22-017" // ボーン・ベア（紫・コスト5・Lv2 3コア）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）
const AIBURN = "BS01-005" // アイバーン（赤・コスト2・効果なし）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・効果なし）
const DANSTON = "BS03-081" // 人馬巨兵ダンストン（青・コスト3・効果なし）
const DEEP = "BS03-089" // ディープ・アーノルド（青・コスト4・効果なし）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・効果なし）
const GAU = "BS01-072" // ガウシルヴィア（緑・コスト6・Lv2:リザーブのコア1個につきBP+1000）
const EURY = "BS06-072" // 大巨人エウリュトス（青・コスト7・召喚時 コスト3以下のスピリットすべてを破壊）
const JEFF = "BS03-072" // 槍兵のジェフリー（青・コスト1・効果なし）青シンボル
const KARAKURI = "BS20-060" // カラクリバッタ（ブレイヴ・コスト4）
const B092 = "BS14-092" // 烈光閃刃（マジック。バースト：自分のライフ減少後 BP3000以下のスピリットすべてを破壊）
const B078 = "BS15-078" // 飛雷震之計（マジック。バースト：相手のスピリットのアタック後）
const B020 = "BS14-020" // ナスノ・アーチャー（スピリット。バースト：自分のライフ減少後）

console.log("=== 前提: カードの機械確認（BS22 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS22.json", "utf8")) as {
        cardId: string; name: string; type: string; colors: string[]; cost: number
        levels: { level: number; cores: number; bp: number }[]
    }[]
    const f = (id: string) => staging.find((c) => c.cardId === id)
    assert(f(ION)?.name === "海皇子イオン" && f(ION)?.type === "spirit" && f(ION)?.colors[0] === "blue" && f(ION)?.cost === 5, "ION は海皇子イオン（青・スピリット・コスト5）")
    assert(f(ION)?.levels.map((l) => l.cores).join("/") === "1/3", "ION の Lv コアは 1/3")
    assert(f(RESOLUTION)?.name === "レゾリューション" && f(RESOLUTION)?.type === "magic" && f(RESOLUTION)?.cost === 5, "RESOLUTION はレゾリューション（マジック・コスト5）")
    assert(f(FANT)?.name === "ミイラ・ファント" && f(FANT)?.colors[0] === "purple" && f(FANT)?.cost === 4, "FANT はミイラ・ファント（紫・コスト4）")
    assert(f(BEAR)?.name === "ボーン・ベア" && f(BEAR)?.colors[0] === "purple" && f(BEAR)?.cost === 5, "BEAR はボーン・ベア（紫・コスト5）")
    assert(f(BEAR)?.levels.map((l) => l.cores).join("/") === "1/3", "BEAR の Lv コアは 1/3")
    const chk = (id: string, name: string, type: string, cost: number, effEmpty = false) =>
        assert(getCard(id).name === name && getCard(id).type === type && getCard(id).cost === cost && (!effEmpty || getCard(id).effect === ""), `${id} は ${name}（${type}・コスト${cost}）`)
    chk(VAN, "ロクケラトプス", "spirit", 1, true)
    chk(AIBURN, "アイバーン", "spirit", 2, true)
    chk(METAL, "メタルバーン", "spirit", 3, true)
    chk(DANSTON, "人馬巨兵ダンストン", "spirit", 3, true)
    chk(DEEP, "ディープ・アーノルド", "spirit", 4, true)
    chk(STIRA, "スティラホーン", "spirit", 5, true)
    chk(GAU, "ガウシルヴィア", "spirit", 6)
    chk(EURY, "大巨人エウリュトス", "spirit", 7)
    chk(JEFF, "槍兵のジェフリー", "spirit", 1, true)
    chk(KARAKURI, "カラクリバッタ", "brave", 4)
    chk(B092, "烈光閃刃", "magic", 4)
    chk(B078, "飛雷震之計", "magic", 5)
    chk(B020, "ナスノ・アーチャー", "spirit", 5)
    assert(getCard(JEFF).colors[0] === "blue" && getCard(GAU).colors[0] === "green", "JEFF は青・GAU は緑")
    assert(getCard(GAU).levels.map((l) => l.cores).join("/") === "1/3/5", "GAU の Lv コアは 1/3/5")
}

type Inst = ReturnType<typeof createInstance>

function game(seed: string, phase: "main" | "attack", turnPlayer: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "purple" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = phase
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 5
        p.burst = null
        p.burstSet = false
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): Inst {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: Inst, braveCardId: string): void {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

function setBurst(s: GameState, pid: PlayerId, cardId: string): void {
    s.players[pid].burst = cardId
    s.players[pid].burstSet = true
}

const onField = (s: GameState, pid: PlayerId, i: Inst): boolean => s.players[pid].field.spirits.some((x) => x.instanceId === i.instanceId)

// accept=false のときは確認に選択肢を付けずに答える。target は picks にあるものを選び、無ければ選ばずに確定する
function settle(s: GameState, picks: string[] = [], accept = true): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            err = accept ? act(s, who, { type: "resolveChoice", option: o.find((x) => x === "発動する" || x.includes("見せる")) ?? o[0] ?? "" }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x))
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

function summon(s: GameState, pid: PlayerId, hand: string[], picks: string[] = [], accept = true): void {
    s.players[pid].hand = hand
    assert(act(s, pid, { type: "summon", handIndex: 0 }) === null, `${hand[0]} を召喚できる`)
    settle(s, picks, accept)
}

console.log("=== 049 Lv1･Lv2『召喚時』：手札のスピリット/ブレイヴ1枚を見せることで、同じコストの相手のスピリット1体を破壊する ===")
{
    const s = game("ion-spirit", "main")
    const t5 = put(s, "p2", STIRA, 1) // コスト5
    const t1 = put(s, "p2", VAN, 1) // コスト1
    summon(s, "p1", [ION, STIRA], [t5.instanceId, t1.instanceId])
    assert(!onField(s, "p2", t5) && s.players.p2.trashCards.includes(STIRA), "手札のスピリットと同じコスト5の相手のスピリットが破壊される")
    assert(onField(s, "p2", t1), "コストの違う相手のスピリットは破壊されない")
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === STIRA, "見せた手札のカードは手札に残る")
}
{
    const s = game("ion-brave", "main")
    const t4 = put(s, "p2", DEEP, 1) // コスト4
    summon(s, "p1", [ION, KARAKURI], [t4.instanceId])
    assert(!onField(s, "p2", t4), "手札のブレイヴ（コスト4）と同じコストの相手のスピリットが破壊される")
    assert(s.players.p1.hand[0] === KARAKURI, "見せたブレイヴは手札に残る")
}
{
    const s = game("ion-nomatch", "main")
    const t1 = put(s, "p2", VAN, 1)
    summon(s, "p1", [ION, STIRA], [t1.instanceId])
    assert(onField(s, "p2", t1), "同じコストの相手のスピリットがいなければ何も破壊されない")
    assert(s.players.p1.hand[0] === STIRA, "見せられないので手札は変わらない")
}
{
    const s = game("ion-magic-only", "main")
    const t4 = put(s, "p2", DEEP, 1)
    summon(s, "p1", [ION, B092], [t4.instanceId]) // マジックはコスト4でも見せる対象ではない
    assert(onField(s, "p2", t4), "手札がマジックだけなら（コスト4が同じでも）破壊されない")
}
{
    const s = game("ion-decline", "main")
    const t5 = put(s, "p2", STIRA, 1)
    summon(s, "p1", [ION, STIRA], [t5.instanceId], false)
    assert(onField(s, "p2", t5), "見せることを選ばなければ破壊されない")
    assert(s.players.p1.hand[0] === STIRA, "断っても手札は変わらない")
}

console.log("=== 049 Lv2：[海皇子イオン]以外のコスト6/7のスピリットすべての効果は発揮しない（お互い） ===")
{
    const s = game("ion-lv2-self", "main")
    put(s, "p1", ION, 3) // Lv2
    const small = put(s, "p2", METAL, 1) // コスト3
    summon(s, "p1", [EURY])
    assert(onField(s, "p2", small), "Lv2 のイオンがいると、コスト7のエウリュトスの召喚時効果は発揮しない（コスト3が残る）")
}
{
    const s = game("ion-lv1-ctrl", "main")
    put(s, "p1", ION, 1) // Lv1
    const small = put(s, "p2", METAL, 1)
    summon(s, "p1", [EURY])
    assert(!onField(s, "p2", small), "Lv1 のイオンは止めない：エウリュトスの召喚時効果で破壊される")
}
{
    const s = game("ion-lv2-opp", "main", "p2")
    put(s, "p1", ION, 3) // 相手側のイオン Lv2
    const mine = put(s, "p2", METAL, 1)
    const theirs = put(s, "p1", DANSTON, 1)
    summon(s, "p2", [EURY])
    assert(onField(s, "p2", mine) && onField(s, "p1", theirs), "相手のイオン Lv2 もお互いに効く：p2 のエウリュトスの効果も発揮しない")
}
{
    const s = game("ion-lv2-bp", "main")
    put(s, "p1", ION, 3)
    const gau = put(s, "p2", GAU, 3) // Lv2・コスト6
    s.players.p2.reserve = 5
    assert(effectiveBp(s, "p2", gau) === 4000, "コスト6のガウシルヴィアの BP+（リザーブ連動）は発揮しない：4000")
}
{
    const s = game("ion-none-bp", "main")
    const gau = put(s, "p2", GAU, 3)
    s.players.p2.reserve = 5
    assert(effectiveBp(s, "p2", gau) === 9000, "イオンがいなければガウシルヴィアは 4000+5000=9000")
}

console.log("=== 084 フラッシュ：合体していない自分のスピリット1体を破壊することで、そのスピリット以下のコストの相手のスピリット1体を破壊する ===")
function flashCast(s: GameState, attacker: Inst, picks: string[], payable = true): void {
    s.players.p1.hand = [RESOLUTION]
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパス")
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    if (!payable) {
        assert(err !== null, "払えない「〜ことで」のマジックは使用そのものができない（COST_MODEL）")
        assert(s.players.p1.hand[0] === RESOLUTION, "拒否されたマジックは手札に残る")
        return
    }
    assert(err === null, "フラッシュでレゾリューションを使用できる")
    settle(s, picks)
}
{
    const s = game("res-same", "attack")
    const atk = put(s, "p1", VAN, 1)
    const own = put(s, "p1", METAL, 1) // コスト3
    const o3 = put(s, "p2", DANSTON, 1) // コスト3
    const o5 = put(s, "p2", STIRA, 1) // コスト5
    flashCast(s, atk, [own.instanceId, o3.instanceId, o5.instanceId])
    assert(!onField(s, "p1", own) && s.players.p1.trashCards.includes(METAL), "自分のスピリットが破壊される")
    assert(!onField(s, "p2", o3), "同じコスト3の相手のスピリットが破壊される")
    assert(onField(s, "p2", o5), "コスト5（破壊したスピリットより高い）は破壊されない")
    assert(s.players.p1.trashCards.includes(RESOLUTION), "マジックはトラッシュへ")
}
{
    const s = game("res-lower", "attack")
    const atk = put(s, "p1", VAN, 1)
    const own = put(s, "p1", METAL, 1) // コスト3
    const o1 = put(s, "p2", AIBURN, 1) // コスト2（以下）
    flashCast(s, atk, [own.instanceId, o1.instanceId])
    assert(!onField(s, "p1", own) && !onField(s, "p2", o1), "コストが低い相手のスピリットも破壊される")
}
{
    const s = game("res-nopay", "attack")
    const atk = put(s, "p1", VAN, 1) // コスト1
    const o5 = put(s, "p2", STIRA, 1)
    flashCast(s, atk, [atk.instanceId, o5.instanceId], false)
    assert(onField(s, "p1", atk) && onField(s, "p2", o5), "相手にコスト1以下のスピリットがいなければ使用できず、自分のスピリットも破壊されない")
}
{
    const s = game("res-combined", "attack")
    const host = put(s, "p1", METAL, 1)
    combine(s, "p1", host, KARAKURI)
    const o1 = put(s, "p2", VAN, 1)
    flashCast(s, host, [host.instanceId, o1.instanceId], false)
    assert(onField(s, "p1", host) && onField(s, "p2", o1), "合体しているスピリットしかいなければ払えず、使用できない：何も破壊されない")
}

console.log("=== 015 Lv1･Lv2『召喚時』：1枚ドロー。連鎖[青]：相手のバーストを見て、条件が【自分のライフ減少後】ならこのターン相手はバーストを発動できない ===")
{
    const s = game("fant-lock", "main")
    put(s, "p1", JEFF, 1) // 青シンボル
    const vet = put(s, "p1", VAN, 1)
    setBurst(s, "p2", B092)
    summon(s, "p1", [FANT])
    assert(s.players.p1.hand.length === 1, "召喚時に1枚ドローする")
    assert(s.players.p2.burst === B092 && s.players.p2.burstSet, "見るだけで相手のバーストはセットされたまま")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: vet.instanceId }) === null, "アタックする")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    settle(s)
    assert(s.players.p2.life === 4 && s.players.p2.burst === B092, "ライフは減るがバーストは発動されず残る")
    assert(onField(s, "p1", vet), "烈光閃刃が発動していないので BP1000 のスピリットも残る")
}
{
    const s = game("fant-other-cond", "main")
    put(s, "p1", JEFF, 1)
    setBurst(s, "p2", B078)
    summon(s, "p1", [FANT])
    assert(s.players.p1.hand.length === 1, "召喚時に1枚ドローする")
    assert(s.players.p2.burst === B078, "見ただけでバーストは残る")
}
{
    const s = game("fant-nosymbol", "main")
    const vet = put(s, "p1", VAN, 1)
    setBurst(s, "p2", B092)
    summon(s, "p1", [FANT])
    assert(s.players.p1.hand.length === 1, "青シンボルが無くても召喚時のドローはする")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: vet.instanceId }) === null, "アタックする")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    settle(s)
    assert(s.players.p2.burst === null && s.players.p2.trashCards.includes(B092), "封じていないのでバーストが発動する（トラッシュへ）")
    assert(!onField(s, "p1", vet), "烈光閃刃で BP3000 以下のロクケラトプスが破壊される")
}
{
    const s = game("fant-noburst", "main")
    put(s, "p1", JEFF, 1)
    summon(s, "p1", [FANT])
    assert(s.players.p1.hand.length === 1, "相手のバーストが無ければ何も起きない（ドローのみ）")
}

console.log("=== 017 Lv2『アタック時』：相手のスピリットのコア1個を相手のトラッシュに置く。連鎖[青]：相手のバーストを見て、スピリットカードなら破棄する ===")
function bearAttack(s: GameState, cores: number, target: Inst): Inst {
    const bear = put(s, "p1", BEAR, cores)
    assert(act(s, "p1", { type: "attack", instanceId: bear.instanceId }) === null, "ボーン・ベアでアタックできる")
    settle(s, [target.instanceId])
    return bear
}
{
    const s = game("bear-spirit-burst", "attack")
    put(s, "p1", JEFF, 1) // 青シンボル
    const t = put(s, "p2", AIBURN, 2)
    setBurst(s, "p2", B020)
    bearAttack(s, 3, t)
    assert(t.cores === 1 && s.players.p2.trashCores === 1, "相手のスピリットのコア1個が相手のトラッシュに置かれる")
    assert(s.players.p2.burst === null && s.players.p2.trashCards.includes(B020), "バーストがスピリットカードなので破棄される（相手のトラッシュへ）")
}
{
    const s = game("bear-magic-burst", "attack")
    put(s, "p1", JEFF, 1)
    const t = put(s, "p2", AIBURN, 2)
    setBurst(s, "p2", B092)
    bearAttack(s, 3, t)
    assert(t.cores === 1 && s.players.p2.trashCores === 1, "コアは置かれる")
    assert(s.players.p2.burst === B092 && s.players.p2.burstSet, "マジックカードのバーストは破棄しない")
}
{
    const s = game("bear-nosymbol", "attack")
    const t = put(s, "p2", AIBURN, 2)
    setBurst(s, "p2", B020)
    bearAttack(s, 3, t)
    assert(t.cores === 1 && s.players.p2.trashCores === 1, "青シンボルが無くてもコアは置かれる")
    assert(s.players.p2.burst === B020, "青シンボルが無ければ連鎖は発揮せず、バーストは破棄されない")
}
{
    const s = game("bear-lv1", "attack")
    put(s, "p1", JEFF, 1)
    const t = put(s, "p2", AIBURN, 2)
    setBurst(s, "p2", B020)
    bearAttack(s, 1, t) // Lv1
    assert(t.cores === 2 && s.players.p2.trashCores === 0, "Lv1 ではコアを置かない")
    assert(s.players.p2.burst === B020, "Lv1 ではバーストも破棄しない")
}
{
    const s = game("bear-noburst", "attack")
    put(s, "p1", JEFF, 1)
    const t = put(s, "p2", AIBURN, 2)
    bearAttack(s, 3, t)
    assert(t.cores === 1 && s.players.p2.trashCores === 1, "バーストが無くてもコアは置かれる（連鎖は何も起きない）")
}

console.log("すべてのチェックに合格しました 🎉（part818）")
