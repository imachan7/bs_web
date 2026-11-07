// smoke パート819（BS22 B7 コアの守り：020 アライゴヤ・079 クリスタルフィールド・058 ソー・スネーク・038 ロールマイマイ。BS22_PLAN §1）
import { readFileSync } from "node:fs"
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import { act, assert, createGame, createInstance, destroySpirit, effectiveBp, endTurn, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const ARAI = "BS22-020" // アライゴヤ（緑・コスト2）
const MAIMAI = "BS22-038" // ロールマイマイ（黄・コスト2）
const SNAKE = "BS22-058" // ソー・スネーク（紫・ブレイヴ・コスト5）
const FIELD = "BS22-079" // クリスタルフィールド（白・マジック・コスト3）
const HAZE = "BS19-102" // パープルヘイズ（紫・コスト6・フラッシュ：相手のスピリット1体のコア1個をリザーブへ）
const CRACK = "BS18-076" // クリスタルクラック（紫・コスト5・フラッシュ：相手のスピリット1体のコアを1個だけになるようトラッシュへ）
const MATCH = "BS01-056" // マッチュラ（緑・コスト3・召喚時：相手は手札1枚を破棄）
const DIO = "BS19-025" // ダーク・ディオマンティス（緑・コスト3・アタック時：自分のスピリットのコア3個までをリザーブへ）
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・BP6000・効果なし）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・効果なし）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS22.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    assert(byId(ARAI)?.name === "アライゴヤ" && byId(ARAI)!.type === "spirit" && byId(ARAI)!.cost === 2 && byId(ARAI)!.colors[0] === "green", "ARAIはアライゴヤ（緑・コスト2）")
    assert(byId(MAIMAI)?.name === "ロールマイマイ" && byId(MAIMAI)!.type === "spirit" && byId(MAIMAI)!.colors[0] === "yellow", "MAIMAIはロールマイマイ（黄）")
    assert(byId(SNAKE)?.name === "ソー・スネーク" && byId(SNAKE)!.type === "brave" && byId(SNAKE)!.cost === 5, "SNAKEはソー・スネーク（ブレイヴ・コスト5）")
    assert(byId(FIELD)?.name === "クリスタルフィールド" && byId(FIELD)!.type === "magic" && byId(FIELD)!.cost === 3, "FIELDはクリスタルフィールド（マジック・コスト3）")
    assert(getCard(HAZE).name === "パープルヘイズ" && getCard(HAZE).type === "magic" && getCard(HAZE).cost === 6, "HAZEはパープルヘイズ")
    assert(getCard(CRACK).name === "クリスタルクラック" && getCard(CRACK).type === "magic" && getCard(CRACK).cost === 5, "CRACKはクリスタルクラック")
    assert(getCard(MATCH).name === "マッチュラ" && getCard(MATCH).cost === 3 && getCard(MATCH).effect.includes("手札1枚を破棄"), "MATCHはマッチュラ（召喚時に相手の手札1枚を破棄）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).cost === 6 && getCard(TARAN).colors[0] === "green", "TARANはタランドーズ（緑・コスト6）")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).cost === 5 && getCard(STIRA).effect === "", "STIRAはスティラホーン（コスト5・効果なし）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1 && getCard(VAN).effect === "", "VANはロクケラトプス")
}

function game(seed: string, phase: "main" | "attack" = "attack"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
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

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): void {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

// 対象は picks を優先して選び、確認は accept に従う（断るときは選択肢を付けない）
function settle(s: GameState, picks: string[] = [], accept = true): void {
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        const pick = pc.kind === "target" ? (picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]) : undefined
        if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else if (pick !== undefined) err = act(s, who, { type: "resolveChoice", instanceId: pick })
        else if (accept && pc.options?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", option: pc.options[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// p1 がアタックし、p2 が先にフラッシュをパスしたあと p1 がマジックを使う
function p1AttackThenFlash(s: GameState, attackerId: string, handIndex: number): void {
    assert(act(s, "p1", { type: "attack", instanceId: attackerId }) === null, "アタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex, timing: "flash" }) === null, "フラッシュでマジックを使用できる")
}

console.log("=== 020 Lv1『コスト5以下の自分のスピリットは相手によってコアをリザーブに置かれない』：コスト5以下は守られ、コスト6は置かれる ===")
for (const [label, cardId, expected] of [["コスト2（自身）", ARAI, 2], ["コスト1", VAN, 2], ["コスト6", TARAN, 1]] as const) {
    const s = game("arai-" + label)
    put(s, "p1", ARAI, 2)
    const target = cardId === ARAI ? s.players.p1.field.spirits[0]! : put(s, "p1", cardId, 2)
    const atk = put(s, "p1", VAN, 1)
    s.players.p2.hand = [HAZE]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタックする")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "パープルヘイズを使用できる")
    settle(s, [target.instanceId])
    assert(target.cores === expected, `${label}：パープルヘイズ後のコアは${expected}個`)
}
{
    const s = game("arai-own")
    const arai = put(s, "p1", ARAI, 2)
    const dio = put(s, "p1", DIO, 3)
    assert(act(s, "p1", { type: "attack", instanceId: dio.instanceId }) === null, "ダーク・ディオマンティスでアタック")
    assert(act(s, "p1", { type: "resolveChoice", option: "2" }) === null, "コアを置く数に2を選ぶ")
    settle(s, [arai.instanceId])
    assert(arai.cores + dio.cores < 5, "自分の効果でのコア移動は止めない（相手によって、だけ）")
}
{
    const s = game("arai-trash")
    put(s, "p1", ARAI, 2)
    const van = put(s, "p1", VAN, 3)
    const atk = put(s, "p1", VAN, 1)
    s.players.p2.hand = [CRACK]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタックする")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "クリスタルクラックを使用できる")
    settle(s, [van.instanceId])
    assert(van.cores === 1, "行き先がトラッシュのコア移動は止めない（3→1）")
}

console.log("=== 020 Lv1『このスピリットの破壊時』：ボイドからコア1個を自分のリザーブに置く ===")
{
    const s = game("arai-destroy")
    const arai = put(s, "p1", ARAI, 2)
    const before = s.players.p1.reserve
    destroySpirit(s, "p1", arai.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s)
    assert(s.players.p1.reserve === before + 3, "自身のコア2個＋ボイドから1個でリザーブ+3")
}
{
    const s = game("arai-destroy-other")
    put(s, "p1", ARAI, 2)
    const van = put(s, "p1", VAN, 2)
    const before = s.players.p1.reserve
    destroySpirit(s, "p1", van.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s)
    assert(s.players.p1.reserve === before + 2, "ほかのスピリットの破壊ではボイドからは置かれない（リザーブ+2）")
}

console.log("=== 079 メイン：手札は相手の効果を受けない／スピリットのコアは相手によって0個にならない ===")
{
    const s = game("field-hand", "main")
    s.players.p1.hand = [FIELD, VAN, VAN]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "メインでクリスタルフィールドを使用できる")
    settle(s)
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.players.p2.hand = [MATCH]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手がマッチュラを召喚できる")
    settle(s)
    assert(s.players.p1.hand.length === 2, "相手の召喚時効果による手札の破棄を受けない")
}
{
    const s = game("field-hand-control", "main")
    s.players.p1.hand = [VAN, VAN]
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.players.p2.hand = [MATCH]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手がマッチュラを召喚できる")
    settle(s)
    assert(s.players.p1.hand.length === 1, "対照：クリスタルフィールドが無ければ手札1枚を破棄する")
}
{
    const s = game("field-core", "main")
    const one = put(s, "p1", VAN, 1)
    const two = put(s, "p1", VAN, 2)
    s.players.p1.hand = [FIELD]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "メインでクリスタルフィールドを使用できる")
    settle(s)
    s.phase = "attack"
    const atk = put(s, "p1", VAN, 1)
    s.players.p2.hand = [HAZE, HAZE]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタックする")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "パープルヘイズ（1個のスピリット）")
    settle(s, [one.instanceId])
    assert(one.cores === 1 && s.players.p1.field.spirits.includes(one), "コア1個のスピリットは0個にされず場に残る")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側もパスして優先権を渡す")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "パープルヘイズ（2個のスピリット）")
    settle(s, [two.instanceId])
    assert(two.cores === 1, "0個にならなければ通常どおりコアは移る（2→1）")
}
{
    const s = game("field-end", "main")
    s.players.p1.hand = [FIELD, VAN]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "メインでクリスタルフィールドを使用できる")
    settle(s)
    endTurn(s)
    for (let i = 0; i < 4 && s.phase !== "attack"; i++) act(s, "p2", { type: "nextPhase" })
    const atk = put(s, "p2", VAN, 1)
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手のスピリットがアタックする")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    takeLifeAndResolve(s, "p1")
    assert(s.players.p1.trashCards.includes(FIELD), "相手のスピリットのアタックでライフが減ったので置いておく効果は終わりトラッシュへ")
}

console.log("=== 079 フラッシュ：このターンの間、スピリット1体をBP+2000する ===")
{
    const s = game("field-flash")
    const a = put(s, "p1", VAN, 1)
    const b = put(s, "p1", VAN, 1)
    s.players.p1.hand = [FIELD]
    p1AttackThenFlash(s, a.instanceId, 0)
    settle(s, [a.instanceId])
    assert(effectiveBp(s, "p1", a) === 3000, "選んだスピリットはBP+2000（1000→3000）")
    assert(effectiveBp(s, "p1", b) === 1000, "選ばなかったスピリットはそのまま")
    assert(s.players.p1.trashCards.includes(FIELD), "フラッシュで使ったマジックはトラッシュへ")
}

console.log("=== 058 召喚時：このターンの間、自分の効果で相手のスピリットのコアをリザーブに置いたとき、そのスピリットすべてを疲労させる ===")
{
    const s = game("snake-summon", "main")
    put(s, "p1", STIRA, 1)
    const atk = put(s, "p1", VAN, 1)
    const a = put(s, "p2", VAN, 2)
    const b = put(s, "p2", VAN, 2)
    s.players.p1.hand = [SNAKE, HAZE]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: s.players.p1.field.spirits[0]!.instanceId }) === null, "ソー・スネークをスティラホーンに合体召喚できる")
    settle(s)
    s.phase = "attack"
    p1AttackThenFlash(s, atk.instanceId, 0)
    settle(s, [a.instanceId])
    assert(a.cores === 1 && a.isRested, "コアを置かれたスピリットは疲労する")
    assert(!b.isRested && b.cores === 2, "コアを置かれていないスピリットは疲労しない")
}
{
    const s = game("snake-opp-effect", "main")
    put(s, "p1", STIRA, 1)
    const z = put(s, "p1", VAN, 2)
    const atk = put(s, "p1", VAN, 1)
    const a = put(s, "p2", VAN, 2)
    s.players.p1.hand = [SNAKE]
    s.players.p2.hand = [HAZE]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: s.players.p1.field.spirits[0]!.instanceId }) === null, "合体召喚できる")
    settle(s)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタックする")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "相手がパープルヘイズを使用できる")
    settle(s, [z.instanceId])
    assert(z.cores === 1 && !z.isRested, "相手の効果で自分のスピリットのコアを置かれても疲労しない（自分の効果で相手のスピリットのとき、だけ）")
    assert(!a.isRested, "相手のスピリットも疲労しない")
}
{
    const s = game("snake-expired", "main")
    put(s, "p1", STIRA, 1)
    const a = put(s, "p2", VAN, 2)
    s.players.p1.hand = [SNAKE, HAZE]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: s.players.p1.field.spirits[0]!.instanceId }) === null, "合体召喚できる")
    settle(s)
    endTurn(s)
    for (let i = 0; i < 4 && s.phase !== "attack"; i++) act(s, "p2", { type: "nextPhase" })
    const atk = put(s, "p2", VAN, 1)
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタックする")
    assert(act(s, "p1", { type: "castMagic", handIndex: s.players.p1.hand.indexOf(HAZE), timing: "flash" }) === null, "自分がパープルヘイズを使用できる")
    settle(s, [a.instanceId])
    assert(a.cores === 1 && !a.isRested, "召喚したターンが終わったあとは疲労させない（このターンの間）")
}

console.log("=== 058【合体時】『合体アタック時』：相手のスピリットのコア1個を相手のリザーブに置く ===")
{
    const s = game("snake-attack")
    const host = put(s, "p1", STIRA, 1)
    combine(s, "p1", host, SNAKE)
    const a = put(s, "p2", VAN, 2)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
    settle(s, [a.instanceId])
    assert(a.cores === 1, "相手のスピリットのコア1個がリザーブへ（2→1）")
    assert(!a.isRested, "召喚時の効果が無いターンは疲労しない")
}
{
    const s = game("snake-attack-alone")
    const host = put(s, "p1", STIRA, 1)
    const a = put(s, "p2", VAN, 2)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "ブレイヴの付いていないスピリットでアタック")
    settle(s, [a.instanceId])
    assert(a.cores === 2, "合体していなければコアは置かれない")
}
{
    const s = game("snake-attack-rested", "main")
    const filler = put(s, "p1", STIRA, 1)
    const a = put(s, "p2", VAN, 2)
    s.players.p1.hand = [SNAKE]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: filler.instanceId }) === null, "合体召喚できる")
    settle(s)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: filler.instanceId }) === null, "合体スピリットでアタックできる")
    settle(s, [a.instanceId])
    assert(a.cores === 1 && a.isRested, "召喚時の効果が働くターンは、合体アタック時でコアを置かれたスピリットも疲労する")
}

console.log("=== 038『自分の緑のスピリットが相手によって破壊されたとき、破壊されたスピリットからコア1個を自分のライフに置くことができる』 ===")
{
    const s = game("maimai-accept")
    put(s, "p1", MAIMAI, 1)
    const g = put(s, "p1", TARAN, 2)
    const res = s.players.p1.reserve
    destroySpirit(s, "p1", g.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s, [], true)
    assert(s.players.p1.life === 6, "受けたときライフが1つ増える（5→6）")
    assert(s.players.p1.reserve === res + 1, "残りのコア1個はリザーブへ")
}
{
    const s = game("maimai-decline")
    put(s, "p1", MAIMAI, 1)
    const g = put(s, "p1", TARAN, 2)
    const res = s.players.p1.reserve
    destroySpirit(s, "p1", g.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s, [], false)
    assert(s.players.p1.life === 5, "断ったときライフは増えない")
    assert(s.players.p1.reserve === res + 2, "コアは2個ともリザーブへ")
}
{
    const s = game("maimai-simul")
    put(s, "p1", MAIMAI, 1)
    const g1 = put(s, "p1", TARAN, 2)
    const g2 = put(s, "p1", TARAN, 2)
    destroyTargetsBatch(s, "p2", [{ pid: "p1", instanceId: g1.instanceId }, { pid: "p1", instanceId: g2.instanceId }], { sourcePid: "p2", sourceType: "magic" })
    settle(s, [], true)
    assert(s.players.p1.life === 6, "同時に2体破壊されても、ライフに置けるコアは1個だけ（Q4389。5→6）")
}
{
    const s = game("maimai-red")
    put(s, "p1", MAIMAI, 1)
    const r = put(s, "p1", VAN, 2)
    destroySpirit(s, "p1", r.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s, [], true)
    assert(s.players.p1.life === 5, "緑でないスピリットの破壊では置かない")
}
{
    const s = game("maimai-own")
    put(s, "p1", MAIMAI, 1)
    const g = put(s, "p1", TARAN, 2)
    destroySpirit(s, "p1", g.instanceId, "destroy", { sourcePid: "p1", sourceType: "magic" })
    settle(s, [], true)
    assert(s.players.p1.life === 5, "自分の効果による破壊では置かない（相手によって、だけ）")
}
{
    const s = game("maimai-opp-side")
    put(s, "p2", MAIMAI, 1)
    const g = put(s, "p1", TARAN, 2)
    destroySpirit(s, "p1", g.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s, [], true)
    assert(s.players.p2.life === 5, "相手側にいるロールマイマイは自分の緑のスピリットではないので置かない")
}

console.log("すべてのチェックに合格しました 🎉（part819）")
