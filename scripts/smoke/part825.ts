// smoke パート825（BS22 紫の残り：010・011・057・075・076・X13-02 の各効果節。BS22_PLAN §1・§2 の確定読み）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, destroySpirit, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { countSymbols } from "../../shared/rules"

const BONE = "BS22-010" // ボーン・ダイル（紫・コスト2・Lv1/2『自分のメインステップ』白シンボル2つ追加）
const SHAX = "BS22-011" // 冥術士シャクス（紫・コスト2・破壊時：疲労したコスト12以下の相手の合体スピリット1体を破壊）
const GARUDA = "BS22-057" // スカル・ガルダ（紫・ブレイヴ・コスト4・召喚時ドロー）
const SOUL = "BS22-075" // ソウルリッパー（紫・マジック・フラッシュ。ブレイヴ破壊でドロー＋連鎖青）
const TRIPLE = "BS22-076" // トリプルデッドリィ（紫・マジック・コスト6・フラッシュ）
const PEND = "X13-02" // 闇王蛇ペンドクルス（紫・コスト6）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・効果なし）
const DOLPHIN = "BS06-061" // ドルフィーノ（青・コスト0・青シンボル確保用）
const PATRO = "BS20-054" // 戦騎将パトロクロス（青・コスト8）合体ホスト
const KARAKURI = "BS20-060" // カラクリバッタ（ブレイヴ・コスト4）：ホスト+ブレイヴ=12
const HOTJUP = "BS20-056" // ホットジュピター・ドラゴン（ブレイヴ・コスト5）：ホスト+ブレイヴ=13

console.log("=== 前提: カードの機械確認 ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS22.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[] }[]
    const by = (id: string) => staging.find((c) => c.cardId === id)
    assert(by(BONE)?.name === "ボーン・ダイル" && by(BONE)!.type === "spirit" && by(BONE)!.cost === 2, "BONEはボーン・ダイル")
    assert(by(SHAX)?.name === "冥術士シャクス" && by(SHAX)!.type === "spirit" && by(SHAX)!.cost === 2, "SHAXは冥術士シャクス")
    assert(by(GARUDA)?.name === "スカル・ガルダ" && by(GARUDA)!.type === "brave" && by(GARUDA)!.cost === 4, "GARUDAはスカル・ガルダ")
    assert(by(SOUL)?.name === "ソウルリッパー" && by(SOUL)!.type === "magic" && by(SOUL)!.cost === 3, "SOULはソウルリッパー")
    assert(by(TRIPLE)?.name === "トリプルデッドリィ" && by(TRIPLE)!.type === "magic" && by(TRIPLE)!.cost === 6, "TRIPLEはトリプルデッドリィ")
    assert(by(PEND)?.name === "闇王蛇ペンドクルス" && by(PEND)!.type === "spirit" && by(PEND)!.cost === 6, "PENDは闇王蛇ペンドクルス")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1 && getCard(VAN).effect === "", "VANはロクケラトプス")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).cost === 5 && getCard(STIRA).effect === "", "STIRAはスティラホーン")
    assert(getCard(DOLPHIN).name === "ドルフィーノ" && getCard(DOLPHIN).colors[0] === "blue", "DOLPHINはドルフィーノ（青）")
    assert(getCard(PATRO).name === "戦騎将パトロクロス" && getCard(PATRO).cost === 8, "PATROはパトロクロス（コスト8）")
    assert(getCard(KARAKURI).name === "カラクリバッタ" && getCard(KARAKURI).type === "brave" && getCard(KARAKURI).cost === 4, "KARAKURIはカラクリバッタ（コスト4）")
    assert(getCard(HOTJUP).name === "ホットジュピター・ドラゴン" && getCard(HOTJUP).type === "brave" && getCard(HOTJUP).cost === 5, "HOTJUPはホットジュピター（コスト5）")
}

function game(seed: string, phase: "main" | "attack" = "attack", turnPlayer: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
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

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): ReturnType<typeof createInstance> {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

function settle(s: GameState, picks: string[] = []): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = o.find((x) => x.includes("発動")) ?? o.find((x) => x.includes("破壊")) ?? o[0] ?? ""
            err = act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

const onField = (s: GameState, pid: PlayerId, id: string): boolean => s.players[pid].field.spirits.some((x) => x.instanceId === id)

// p1 がアタックし、防御側がパスしたあとのフラッシュで p1 が手札0番を使う
function attackThenFlash(s: GameState, attackerId: string): string | null {
    assert(act(s, "p1", { type: "attack", instanceId: attackerId }) === null, "アタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    return act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" })
}

console.log("=== 010 Lv1･Lv2『自分のメインステップ』：このスピリットに白のシンボル2つを追加する ===")
{
    const s = game("bone-main", "main")
    put(s, "p1", BONE, 1)
    assert(countSymbols(s.players.p1, ["white"]) === 2, "自分のメインステップ中は白シンボルが2つ")
    assert(countSymbols(s.players.p1, ["purple"]) === 1, "紫シンボルは元の1つのまま")
}
{
    const s = game("bone-lv2", "main")
    put(s, "p1", BONE, 3) // Lv2
    assert(countSymbols(s.players.p1, ["white"]) === 2, "Lv2でも白シンボルは2つ")
}
{
    const s = game("bone-attack", "attack")
    put(s, "p1", BONE, 1)
    assert(countSymbols(s.players.p1, ["white"]) === 0, "自分のアタックステップでは白シンボルは増えない")
}
{
    const s = game("bone-opp", "main", "p2")
    put(s, "p1", BONE, 1)
    assert(countSymbols(s.players.p1, ["white"]) === 0, "相手のターンでは白シンボルは増えない")
}

console.log("=== 011『このスピリットの破壊時』：疲労状態のコスト12以下の相手の合体スピリット1体を破壊する ===")
{
    const s = game("shax-hit")
    const shax = put(s, "p1", SHAX, 1)
    const ok = put(s, "p2", PATRO, 1) // 8+4=12
    combine(s, "p2", ok, KARAKURI)
    ok.isRested = true
    const big = put(s, "p2", PATRO, 1) // 8+5=13
    combine(s, "p2", big, HOTJUP)
    big.isRested = true
    const active = put(s, "p2", PATRO, 1) // 回復状態
    combine(s, "p2", active, KARAKURI)
    const single = put(s, "p2", VAN, 1) // 合体していない疲労
    single.isRested = true
    destroySpirit(s, "p1", shax.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s, [big.instanceId, active.instanceId, single.instanceId, ok.instanceId])
    assert(!onField(s, "p2", ok.instanceId), "疲労状態でコスト12の合体スピリットは破壊される")
    assert(onField(s, "p2", big.instanceId), "コスト13の合体スピリットは破壊されない")
    assert(onField(s, "p2", active.instanceId), "回復状態の合体スピリットは破壊されない")
    assert(onField(s, "p2", single.instanceId), "合体していないスピリットは破壊されない")
}
{
    const s = game("shax-none")
    const shax = put(s, "p1", SHAX, 1)
    const big = put(s, "p2", PATRO, 1)
    combine(s, "p2", big, HOTJUP)
    big.isRested = true
    const single = put(s, "p2", VAN, 1)
    single.isRested = true
    destroySpirit(s, "p1", shax.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s)
    assert(onField(s, "p2", big.instanceId) && onField(s, "p2", single.instanceId), "対象が無ければ何も破壊されない")
}

console.log("=== 057 Lv1『このブレイヴの召喚時』：自分はデッキから1枚ドローする ===")
{
    const s = game("garuda-summon", "main")
    s.players.p1.hand = [GARUDA]
    const deck = s.players.p1.deck.length
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "スカル・ガルダを召喚できる")
    settle(s)
    assert(s.players.p1.hand.length === 1 && s.players.p1.deck.length === deck - 1, "召喚時に1枚ドローする")
}

console.log("=== 075 フラッシュ：相手の合体スピリットのブレイヴ1つを破壊することで1枚ドロー。連鎖青で コスト4以下の相手のスピリット1体を破壊 ===")
{
    const s = game("soul-chain")
    const atk = put(s, "p1", VAN, 1)
    put(s, "p1", DOLPHIN, 1) // 青シンボル
    const host = put(s, "p2", PATRO, 1)
    const brave = combine(s, "p2", host, KARAKURI)
    const small = put(s, "p2", VAN, 1) // コスト1
    const big = put(s, "p2", STIRA, 1) // コスト5
    s.players.p1.hand = [SOUL]
    assert(attackThenFlash(s, atk.instanceId) === null, "フラッシュでソウルリッパーを使用できる")
    settle(s, [brave.instanceId, small.instanceId, big.instanceId])
    assert(!s.players.p2.field.combinedBraves.some((b) => b.instanceId === brave.instanceId), "相手のブレイヴ1つが破壊される")
    assert(onField(s, "p2", host.instanceId), "ホストのスピリット自体は残る")
    assert(s.players.p1.hand.length === 1, "1枚ドローする")
    assert(!onField(s, "p2", small.instanceId), "連鎖：コスト4以下のスピリットが破壊される")
    assert(onField(s, "p2", big.instanceId), "コスト5のスピリットは破壊されない")
    assert(s.players.p1.trashCards.includes(SOUL), "使用したマジックはトラッシュへ")
}
{
    const s = game("soul-nochain")
    const atk = put(s, "p1", VAN, 1) // 青シンボルなし
    const host = put(s, "p2", PATRO, 1)
    const brave = combine(s, "p2", host, KARAKURI)
    const small = put(s, "p2", VAN, 1)
    s.players.p1.hand = [SOUL]
    assert(attackThenFlash(s, atk.instanceId) === null, "青シンボルが無くても使用できる")
    settle(s, [brave.instanceId, small.instanceId])
    assert(!s.players.p2.field.combinedBraves.some((b) => b.instanceId === brave.instanceId), "ブレイヴは破壊される")
    assert(s.players.p1.hand.length === 1, "ドローはする")
    assert(onField(s, "p2", small.instanceId), "青シンボルが無いので連鎖は発揮しない")
}
{
    const s = game("soul-nobrave")
    const atk = put(s, "p1", VAN, 1)
    put(s, "p1", DOLPHIN, 1)
    put(s, "p2", STIRA, 1) // 合体していない
    s.players.p1.hand = [SOUL]
    assert(attackThenFlash(s, atk.instanceId) !== null, "相手に合体スピリットが居なければ（コストが払えず）使用できない")
    assert(s.players.p1.hand[0] === SOUL && s.players.p1.hand.length === 1, "手札に残りドローもしない")
}

console.log("=== 076 フラッシュ：自分のスピリット3体のコアすべてをリザーブに置くことで、相手は相手のスピリット3体のコアすべてをリザーブに置く（両方3体以上のときだけ） ===")
{
    const s = game("triple-ok")
    const mine = [put(s, "p1", VAN, 1), put(s, "p1", VAN, 2), put(s, "p1", VAN, 1)]
    const theirs = [put(s, "p2", VAN, 1), put(s, "p2", VAN, 3), put(s, "p2", VAN, 2)]
    s.players.p1.hand = [TRIPLE]
    const oppReserve = s.players.p2.reserve
    assert(attackThenFlash(s, mine[0]!.instanceId) === null, "両方3体なのでトリプルデッドリィを使用できる")
    settle(s)
    assert(mine.every((x) => !onField(s, "p1", x.instanceId)), "自分の3体はコアが0になりフィールドを離れる")
    assert(theirs.every((x) => !onField(s, "p2", x.instanceId)), "相手の3体もコアが0になりフィールドを離れる")
    assert(s.players.p2.reserve === oppReserve + 6, "相手のリザーブに6個（1+3+2）置かれる")
}
{
    const s = game("triple-opp2")
    const mine = [put(s, "p1", VAN, 1), put(s, "p1", VAN, 1), put(s, "p1", VAN, 1)]
    put(s, "p2", VAN, 1)
    put(s, "p2", VAN, 1)
    s.players.p1.hand = [TRIPLE]
    assert(attackThenFlash(s, mine[0]!.instanceId) !== null, "相手のスピリットが2体なら使用できない")
    assert(mine.every((x) => onField(s, "p1", x.instanceId)), "自分のスピリットはそのまま")
}
{
    const s = game("triple-me2")
    const mine = [put(s, "p1", VAN, 1), put(s, "p1", VAN, 1)]
    for (let i = 0; i < 3; i++) put(s, "p2", VAN, 1)
    s.players.p1.hand = [TRIPLE]
    assert(attackThenFlash(s, mine[0]!.instanceId) !== null, "自分のスピリットが2体なら使用できない")
    assert(s.players.p2.field.spirits.length === 3, "相手のスピリットはそのまま")
}

console.log("=== X13-02 Lv1･Lv2『召喚時』：相手のスピリットすべてのコアを、それぞれ1個だけになるように相手のリザーブに置く ===")
{
    const s = game("pend-summon", "main")
    const a = put(s, "p2", VAN, 3)
    const b = put(s, "p2", VAN, 1)
    const c = put(s, "p2", STIRA, 2)
    const oppReserve = s.players.p2.reserve
    s.players.p1.hand = [PEND]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ペンドクルスを召喚できる")
    settle(s)
    assert(a.cores === 1 && b.cores === 1 && c.cores === 1, "相手のスピリットすべてがコア1個になる")
    assert(s.players.p2.reserve === oppReserve + 3, "相手のリザーブに3個（2+0+1）置かれる")
    assert(onField(s, "p2", a.instanceId) && onField(s, "p2", b.instanceId) && onField(s, "p2", c.instanceId), "スピリットは破壊されない")
}

console.log("=== X13-02 Lv2『アタック時』：相手のスピリットのコア1個をリザーブへ。0個になったらドロー（Lv1では発揮しない） ===")
{
    const s = game("pend-zero")
    const pend = put(s, "p1", PEND, 2) // Lv2
    const one = put(s, "p2", VAN, 1)
    const three = put(s, "p2", STIRA, 3)
    assert(act(s, "p1", { type: "attack", instanceId: pend.instanceId }) === null, "ペンドクルスでアタックできる")
    settle(s, [one.instanceId, three.instanceId])
    assert(!onField(s, "p2", one.instanceId), "コア1個のスピリットはコアが0個になりフィールドを離れる")
    assert(three.cores === 3, "選ばなかったスピリットのコアは動かない")
    assert(s.players.p1.hand.length === 1, "コアが0個になったので1枚ドローする")
}
{
    const s = game("pend-nonzero")
    const pend = put(s, "p1", PEND, 2)
    put(s, "p2", VAN, 1)
    const three = put(s, "p2", STIRA, 3)
    const oppReserve = s.players.p2.reserve
    assert(act(s, "p1", { type: "attack", instanceId: pend.instanceId }) === null, "ペンドクルスでアタックできる")
    settle(s, [three.instanceId])
    assert(three.cores === 2 && s.players.p2.reserve === oppReserve + 1, "コア1個が相手のリザーブに置かれる")
    assert(s.players.p1.hand.length === 0, "0個にならなければドローしない")
}
{
    const s = game("pend-lv1")
    const pend = put(s, "p1", PEND, 1) // Lv1
    const one = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: pend.instanceId }) === null, "Lv1のペンドクルスでアタックできる")
    settle(s, [one.instanceId])
    assert(onField(s, "p2", one.instanceId) && one.cores === 1, "Lv1ではアタック時効果を発揮しない")
    assert(s.players.p1.hand.length === 0, "ドローもしない")
}

console.log("すべてのチェックに合格しました 🎉（part825）")
