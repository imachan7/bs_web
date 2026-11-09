// smoke パート821（BS22-009 合体アタック時のもう1度・BS22-045 トラッシュの召喚時を借りる・BS22-081 相手が選ぶフラッシュ。BS22_PLAN §1・§2）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const MESSIAH = "BS22-009" // 剣星メサイア・ドラゴン（赤・コスト9・Lvコア1/3/4・アタック時BP7000以下破壊）
const GRANDIS = "BS22-045" // 時空の魔女グランディース（黄・コスト9・召喚時にトラッシュのスピリットの召喚時を借りる）
const BUTTERFLY = "BS22-081" // ドリーミングバタフライ（黄・マジック・コスト3・フラッシュ）
const HOTJUP = "BS20-056" // ホットジュピター・ドラゴン（赤ブレイヴ。合体アタック時：1枚ドロー）
const GUNNER = "SD03-010" // 砲竜バル・ガンナー（赤ブレイヴ。【合体時】『このスピリットのアタック時』：ドロー＋BP4000以下破壊。見出しが『合体アタック時』ではない）
const DUST = "SD10-011" // ダストワール（赤ブレイヴ。合体アタック時：BP3000以下の相手のスピリット1体を破壊）
const MIRANSA = "BS19-049" // 天使ミランサ（黄・召喚時：相手のスピリット1体をBP-2000）
const ENJU = "BS02-061" // 天使エンジュ（黄・召喚時：自分の黄のスピリット1体を回復）
const TOPS = "BS20-012" // ボーン・トプス（紫・コスト3）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・Lv1BP3000）
const TARAN = "BS16-025" // タランドーズ（緑・Lv1BP6000・3コアでBP8000）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS22.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; levels: { cores: number; bp: number }[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    assert(byId(MESSIAH)?.name === "剣星メサイア・ドラゴン" && byId(MESSIAH)!.type === "spirit" && byId(MESSIAH)!.colors[0] === "red" && byId(MESSIAH)!.levels.map((l) => l.cores).join("/") === "1/3/4", "MESSIAHは剣星メサイア・ドラゴン（赤・Lvコア1/3/4）")
    assert(byId(GRANDIS)?.name === "時空の魔女グランディース" && byId(GRANDIS)!.type === "spirit" && byId(GRANDIS)!.colors[0] === "yellow" && byId(GRANDIS)!.cost === 9, "GRANDISは時空の魔女グランディース（黄・コスト9）")
    assert(byId(BUTTERFLY)?.name === "ドリーミングバタフライ" && byId(BUTTERFLY)!.type === "magic" && byId(BUTTERFLY)!.colors[0] === "yellow" && byId(BUTTERFLY)!.cost === 3, "BUTTERFLYはドリーミングバタフライ（黄マジック・コスト3）")
    assert(getCard(HOTJUP).name === "ホットジュピター・ドラゴン" && getCard(HOTJUP).type === "brave", "HOTJUPはホットジュピター・ドラゴン（ブレイヴ）")
    assert(getCard(GUNNER).name === "砲竜バル・ガンナー" && getCard(GUNNER).type === "brave" && getCard(GUNNER).effect.includes("【合体時】『このスピリットのアタック時』") && !getCard(GUNNER).effect.includes("合体アタック時"), "GUNNERは砲竜バル・ガンナー（見出しが『このスピリットのアタック時』のブレイヴ）")
    assert(getCard(DUST).name === "ダストワール" && getCard(DUST).type === "brave", "DUSTはダストワール（ブレイヴ）")
    assert(getCard(MIRANSA).name === "天使ミランサ" && getCard(MIRANSA).colors[0] === "yellow" && getCard(MIRANSA).effect.includes("BP-2000"), "MIRANSAは天使ミランサ（黄・召喚時BP-2000）")
    assert(getCard(ENJU).name === "天使エンジュ" && getCard(ENJU).colors[0] === "yellow" && getCard(ENJU).effect.includes("回復"), "ENJUは天使エンジュ（黄・召喚時回復）")
    assert(getCard(TOPS).name === "ボーン・トプス" && getCard(TOPS).colors[0] === "purple", "TOPSはボーン・トプス（紫）")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).levels[0]!.bp === 3000, "STIRAはスティラホーン（Lv1BP3000）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).levels[0]!.bp === 6000 && getCard(TARAN).levels[1]!.bp === 8000 && getCard(TARAN).levels[1]!.cores === 3, "TARANはタランドーズ（BP6000・3コアで8000）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).effect === "", "VANはロクケラトプス（効果なし）")
}

function game(seed: string, turnPlayer: PlayerId, phase: "main" | "attack", colors: { p1: "red" | "yellow"; p2: "green" | "red" | "yellow" }): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, colors)
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
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1, rested = false): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): void {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

type OptionPick = (prompt: string, options: string[]) => string | undefined
// option は optionPick（"" なら選択肢を付けずに答える＝断る）、target は picks、card は cardPick のカードID（無ければ先頭）
function settle(s: GameState, picks: string[] = [], optionPick?: OptionPick, cardPick?: (pid: PlayerId) => string | undefined): void {
    for (let i = 0; i < 40 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; prompt: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const picked = optionPick?.(pc.prompt, pc.options ?? []) ?? (pc.options ?? []).find((x) => x === "発動する" || x === "はい") ?? (pc.options ?? [])[0]
            err = picked === "" ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: picked ?? "" })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) {
            const want = cardPick?.(who)
            const idx = want !== undefined ? pc.cardIndices.find((k) => s.players[who].trashCards[k] === want) : undefined
            err = act(s, who, { type: "resolveChoice", cardIndex: idx ?? pc.cardIndices[0] })
        } else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

const decline: OptionPick = () => ""

console.log("=== 009 Lv2 合体アタック時：ブレイヴの『合体アタック時』効果が発揮したとき、もう1度だけ発揮できる（ホットジュピター：ドローが2枚に） ===")
{
    const s = game("messiah-draw-twice", "p1", "attack", { p1: "red", p2: "green" })
    const m = put(s, "p1", MESSIAH, 3) // Lv2
    combine(s, "p1", m, HOTJUP)
    const stira = put(s, "p2", STIRA, 1)
    const stira2 = put(s, "p2", STIRA, 1)
    const taran = put(s, "p2", TARAN, 3) // BP8000
    assert(act(s, "p1", { type: "attack", instanceId: m.instanceId }) === null, "合体したメサイアでアタックできる")
    settle(s, [stira.instanceId])
    assert(s.players.p1.hand.length === 2, "ブレイヴの合体アタック時のドローをもう1度発揮して合計2枚引く")
    const left = s.players.p2.field.spirits.map((x) => x.instanceId)
    assert(left.includes(taran.instanceId), "BP8000のタランドーズは破壊されない")
    assert(left.length === 2 && left.includes(stira2.instanceId) !== left.includes(stira.instanceId), "メサイア自身のアタック時（BP7000以下を破壊）はもう1度にならず、ちょうど1体だけ破壊される")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("messiah-draw-decline", "p1", "attack", { p1: "red", p2: "green" })
    const m = put(s, "p1", MESSIAH, 3)
    combine(s, "p1", m, HOTJUP)
    put(s, "p2", STIRA, 1)
    assert(act(s, "p1", { type: "attack", instanceId: m.instanceId }) === null, "合体したメサイアでアタックできる")
    settle(s, [], decline)
    assert(s.players.p1.hand.length === 1, "もう1度を断ると、ドローは1枚だけ")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("messiah-lv1", "p1", "attack", { p1: "red", p2: "green" })
    const m = put(s, "p1", MESSIAH, 1) // Lv1
    combine(s, "p1", m, HOTJUP)
    const stira = put(s, "p2", STIRA, 1)
    assert(act(s, "p1", { type: "attack", instanceId: m.instanceId }) === null, "Lv1の合体メサイアでアタックできる")
    settle(s, [stira.instanceId])
    assert(s.players.p1.hand.length === 1, "Lv1ではもう1度は発揮せず、ドローは1枚だけ")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === stira.instanceId), "Lv1でも自身のアタック時（BP7000以下を破壊）は発揮する")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("messiah-alone", "p1", "attack", { p1: "red", p2: "green" })
    const m = put(s, "p1", MESSIAH, 3)
    const stira = put(s, "p2", STIRA, 1)
    assert(act(s, "p1", { type: "attack", instanceId: m.instanceId }) === null, "メサイア単体でアタックできる")
    settle(s, [stira.instanceId])
    assert(s.players.p1.hand.length === 0, "ブレイヴがいなければドローは起きない")
    assert(s.players.p2.field.spirits.length === 0, "自身のアタック時でスティラホーンを破壊する")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 009：見出しが【合体時】『このスピリットのアタック時』のブレイヴ（バル・ガンナー）の効果ももう1度になる（2026-11-08 ユーザー決定。Q4332 の見出しの区別はしない） ===")
{
    const s = game("messiah-gunner", "p1", "attack", { p1: "red", p2: "green" })
    const m = put(s, "p1", MESSIAH, 3)
    combine(s, "p1", m, GUNNER)
    for (let i = 0; i < 4; i++) put(s, "p2", STIRA, 1)
    assert(act(s, "p1", { type: "attack", instanceId: m.instanceId }) === null, "合体したメサイアでアタックできる")
    settle(s)
    assert(s.players.p1.hand.length === 2, "もう1度でドローも2枚になる")
    assert(s.players.p2.field.spirits.length === 1, "メサイア自身1体＋バル・ガンナー2回で計3体破壊される（4体中1体が残る）")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 009：ダストワール（BP3000以下を破壊）をもう1度発揮すると、新しく対象を選んで合計2体破壊できる ===")
for (const again of [true, false]) {
    const s = game(again ? "messiah-dust-again" : "messiah-dust-decline", "p1", "attack", { p1: "red", p2: "green" })
    const m = put(s, "p1", MESSIAH, 3)
    combine(s, "p1", m, DUST)
    for (let i = 0; i < 4; i++) put(s, "p2", STIRA, 1)
    assert(act(s, "p1", { type: "attack", instanceId: m.instanceId }) === null, "合体したメサイアでアタックできる")
    settle(s, [], again ? undefined : decline)
    // 自身のアタック時1体＋ダストワール1体（＋もう1度で1体）
    assert(s.players.p2.field.spirits.length === (again ? 1 : 2), again ? "もう1度を受けると合計3体破壊される（4体中1体が残る）" : "もう1度を断ると合計2体破壊される（4体中2体が残る）")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 045 召喚時：トラッシュの[グランディース]以外のスピリットカード1枚の『召喚時』効果を、自分の効果として発揮できる ===")
{
    const s = game("grandis-borrow", "p1", "main", { p1: "yellow", p2: "red" })
    const rested = put(s, "p1", ENJU, 1, true) // エンジュの回復が選ばれた場合に回復してしまう黄のスピリット
    const stira = put(s, "p2", STIRA, 1)
    s.players.p1.trashCards = [VAN, ENJU, MIRANSA]
    s.players.p1.hand = [GRANDIS]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "グランディースを召喚できる")
    settle(s, [stira.instanceId], undefined, () => MIRANSA)
    assert(effectiveBp(s, "p2", stira) === 1000, "ミランサの召喚時を借りて相手のスピリットがBP-2000される（3000→1000）")
    assert(rested.isRested, "選ばなかったエンジュの回復は発揮されない")
    assert(s.players.p1.trashCards.length === 3 && s.players.p1.trashCards.includes(MIRANSA), "借りるだけで、トラッシュのカードは動かない")
}
{
    const s = game("grandis-decline", "p1", "main", { p1: "yellow", p2: "red" })
    const stira = put(s, "p2", STIRA, 1)
    s.players.p1.trashCards = [MIRANSA]
    s.players.p1.hand = [GRANDIS]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "グランディースを召喚できる")
    settle(s, [stira.instanceId], decline)
    assert(effectiveBp(s, "p2", stira) === 3000, "断れば何も発揮しない")
    assert(s.players.p1.trashCards.length === 1, "トラッシュは動かない")
}
{
    const s = game("grandis-recover", "p1", "main", { p1: "yellow", p2: "red" })
    const rested = put(s, "p1", ENJU, 1, true)
    s.players.p1.trashCards = [ENJU]
    s.players.p1.hand = [GRANDIS]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "グランディースを召喚できる")
    settle(s, [rested.instanceId])
    assert(!rested.isRested, "エンジュの召喚時を借りて、自分の黄のスピリットが回復する")
}
{
    const s = game("grandis-not-eligible", "p1", "main", { p1: "yellow", p2: "red" })
    const stira = put(s, "p2", STIRA, 1)
    // グランディース自身・召喚時の無いスピリット・マジック（ミランサの効果文を持たない）しかトラッシュに無い
    s.players.p1.trashCards = [GRANDIS, VAN, BUTTERFLY]
    s.players.p1.hand = [GRANDIS]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "グランディースを召喚できる")
    settle(s, [stira.instanceId])
    assert(effectiveBp(s, "p2", stira) === 3000, "借りられる召喚時が無ければ何も起きない（グランディース自身・効果なし・マジックは対象外）")
}
{
    const s = game("grandis-tops-draw", "p1", "main", { p1: "yellow", p2: "red" })
    s.players.p1.trashCards = [TOPS]
    s.players.p1.hand = [GRANDIS]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "グランディースを召喚できる")
    settle(s)
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === VAN, "ボーン・トプス（紫）の召喚時も色を問わず借りられ、1枚ドローする")
}
{
    const s = game("grandis-opp-trash", "p1", "main", { p1: "yellow", p2: "red" })
    const stira = put(s, "p2", STIRA, 1)
    s.players.p2.trashCards = [MIRANSA] // 相手のトラッシュは対象外（「自分のトラッシュ」）
    s.players.p1.hand = [GRANDIS]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "グランディースを召喚できる")
    settle(s, [stira.instanceId])
    assert(effectiveBp(s, "p2", stira) === 3000, "相手のトラッシュのカードの召喚時は借りられない")
}

console.log("=== 081 フラッシュ：相手が2つの効果から1つを選び、その効果を発揮する。ターンに1回 ===")
// p2 のターンに p2 がアタック。防御側 p1 が 081 をフラッシュで使い、選ぶのは相手（p2）
function flashGame(seed: string): { s: GameState; yellowSp: ReturnType<typeof createInstance>; purpleSp: ReturnType<typeof createInstance>; redSp: ReturnType<typeof createInstance>; atk: ReturnType<typeof createInstance>; idle: ReturnType<typeof createInstance> } {
    const s = game(seed, "p2", "attack", { p1: "yellow", p2: "red" })
    const yellowSp = put(s, "p1", MIRANSA, 1, true)
    const purpleSp = put(s, "p1", TOPS, 1, true)
    const redSp = put(s, "p1", VAN, 1, true)
    const atk = put(s, "p2", STIRA, 1)
    const idle = put(s, "p2", STIRA, 1)
    s.players.p1.hand = [BUTTERFLY, BUTTERFLY]
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "p2がアタックする")
    return { s, yellowSp, purpleSp, redSp, atk, idle }
}
const pickRecover: OptionPick = (_p, o) => o.find((x) => x.includes("回復")) ?? o[0]
const pickNoAttack: OptionPick = (_p, o) => o.find((x) => x.includes("アタックできない")) ?? o[o.length - 1]
{
    const { s, yellowSp, purpleSp, redSp } = flashGame("butterfly-recover")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "防御側がドリーミングバタフライをフラッシュで使える")
    assert((s.pendingChoice as { pid?: PlayerId } | null)?.pid === "p2", "2つの効果から選ぶのは相手（p2）")
    settle(s, [], pickRecover)
    assert(!yellowSp.isRested && !purpleSp.isRested, "『紫/黄のスピリットすべてを回復』が選ばれると、使用者の黄と紫のスピリットが回復する")
    assert(redSp.isRested, "赤のスピリットは回復しない")
    assert(s.players.p1.trashCards.includes(BUTTERFLY), "使ったマジックはトラッシュへ")
}
{
    const { s, yellowSp, purpleSp, idle } = flashGame("butterfly-noattack")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "ドリーミングバタフライをフラッシュで使える")
    settle(s, [], pickNoAttack)
    assert(yellowSp.isRested && purpleSp.isRested, "『アタックできない』が選ばれたときは回復しない")
    // バトルを終えて、同じターンにアタックしていない相手のスピリットでアタックしようとしても通らない
    for (let i = 0; i < 6 && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
    takeLifeAndResolve(s, "p1")
    s.phase = "attack"
    s.priorityPlayer = "p2"
    assert(act(s, "p2", { type: "attack", instanceId: idle.instanceId }) !== null, "このターンの間、相手のスピリットすべてはアタックできない")
}
{
    const { s, yellowSp, purpleSp } = flashGame("butterfly-once")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "1枚目を使える")
    settle(s, [], pickRecover)
    assert(!yellowSp.isRested && !purpleSp.isRested, "1枚目で回復する")
    yellowSp.isRested = true
    purpleSp.isRested = true
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) !== null, "この効果はターンに1回しか使えないので、2枚目は使用できない")
    assert(s.players.p1.hand.length === 1 && yellowSp.isRested && purpleSp.isRested, "2枚目は手札に残り、回復もしない")
}

console.log("すべてのチェックに合格しました 🎉（part821）")
