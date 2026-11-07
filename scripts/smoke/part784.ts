// smoke パート784（BS20-006 魔炎の剣使いシュマルド・BS20-017 十剣聖コブラージャ・BS20-X02 黒き骸王バルトアンデルス：自分のアタックステップ中の赤スピリットのマジック耐性・合体時のコア0個での回復・破壊時の手札破棄での残存）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import type { GameState, PlayerId } from "./helpers"

const SHUMARUDO = "BS20-006" // 魔炎の剣使いシュマルド（赤・コスト5・Lv1=1・Lv2=3・Lv3=4）
const COBRAJA = "BS20-017" // 十剣聖コブラージャ（紫・コスト6・Lv1=1・Lv2=4・Lv3=6）
const X02 = "BS20-X02" // 黒き骸王バルトアンデルス（紫・コスト7・Lv1=1・Lv2=3・Lv3=6）
const RIBBON = "BS01-146" // ドリームリボン（白・マジック・コスト4）フラッシュ：相手のスピリット1体を手札に戻す
const CHEST = "BS01-147" // ドリームチェスト（白・マジック・コスト5）フラッシュ：スピリット1体をデッキの上に戻す
const ANOL = "BS15-056" // ナイト・アノール（紫・ブレイヴ・コスト4・魔影）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）
const SKULL = "BS06-020" // スカルゴイル（紫・効果なしのスピリット）
const ZUGAIN = "BS02-021" // 髑髏騎士ズ・ガイン（紫・アタック時：相手のスピリット1体のコア1個を相手のリザーブに置く）

console.log("=== 前提: カードの機械確認（BS20 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS20.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors?: string[]; levels: { level: number; cores: number }[] }[]
    const s006 = staging.find((c) => c.cardId === SHUMARUDO)
    const s017 = staging.find((c) => c.cardId === COBRAJA)
    const x02 = staging.find((c) => c.cardId === X02)
    assert(s006?.name === "魔炎の剣使いシュマルド" && s006.type === "spirit" && s006.cost === 5 && s006.colors?.[0] === "red", "SHUMARUDOは魔炎の剣使いシュマルド（赤・スピリット・コスト5）")
    assert(s006?.levels.map((l) => l.cores).join("/") === "1/3/4", "SHUMARUDOのLvコアは1/3/4")
    assert(s017?.name === "十剣聖コブラージャ" && s017.type === "spirit" && s017.cost === 6 && s017.colors?.[0] === "purple", "COBRAJAは十剣聖コブラージャ（紫・スピリット・コスト6）")
    assert(s017?.levels.map((l) => l.cores).join("/") === "1/4/6", "COBRAJAのLvコアは1/4/6")
    assert(x02?.name === "黒き骸王バルトアンデルス" && x02.type === "spirit" && x02.cost === 7 && x02.colors?.[0] === "purple", "X02は黒き骸王バルトアンデルス（紫・スピリット・コスト7）")
    assert(x02?.levels.map((l) => l.cores).join("/") === "1/3/6", "X02のLvコアは1/3/6")
    assert(getCard(RIBBON).name === "ドリームリボン" && getCard(RIBBON).type === "magic" && getCard(RIBBON).cost === 4, "RIBBONはドリームリボン（マジック・コスト4）")
    assert(getCard(CHEST).name === "ドリームチェスト" && getCard(CHEST).type === "magic" && getCard(CHEST).cost === 5, "CHESTはドリームチェスト（マジック・コスト5）")
    assert(getCard(ANOL).name === "ナイト・アノール" && getCard(ANOL).type === "brave" && getCard(ANOL).cost === 4, "ANOLはナイト・アノール（ブレイヴ・コスト4）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1 && getCard(VANILLA).colors[0] === "red", "VANILLAはロクケラトプス（赤・コスト1）")
    assert(getCard(SKULL).name === "スカルゴイル" && getCard(SKULL).colors[0] === "purple" && getCard(SKULL).effect === "", "SKULLはスカルゴイル（紫・効果なし）")
}

function game(seed: string, turnPlayer: "p1" | "p2" = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = "attack"
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 5
        p.burst = null
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VANILLA)
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

// ブレイヴをホストに合体させる（part776 と同じ作り方）
function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): ReturnType<typeof createInstance> {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
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

console.log("=== A. 006 Lv1：自分のアタックステップ中、相手のマジックでは自分の赤スピリットは手札にもデッキにも戻らない ===")
{
    const s = game("a")
    put(s, "p1", SHUMARUDO, 1) // Lv1
    const attacker = put(s, "p1", VANILLA, 1)
    const redAlly = put(s, "p1", VANILLA, 1)
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "赤スピリットでアタックできる")
    s.players.p2.hand = [RIBBON]
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: redAlly.instanceId }) === null, "防御側が優先権を持つフラッシュでドリームリボンを使用できる")
    settle(s, [redAlly.instanceId])
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === redAlly.instanceId), "相手のマジック（手札に戻す）では赤スピリットは戻らない")
    assert(s.players.p1.hand.length === 0, "手札にも戻っていない")
    passFlash(s)
}
{
    const s = game("a2")
    put(s, "p1", SHUMARUDO, 1) // Lv1
    const attacker = put(s, "p1", VANILLA, 1)
    const redAlly = put(s, "p1", VANILLA, 1)
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "赤スピリットでアタックできる")
    s.players.p2.hand = [CHEST]
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: redAlly.instanceId }) === null, "防御側が優先権を持つフラッシュでドリームチェストを使用できる")
    settle(s, [redAlly.instanceId])
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === redAlly.instanceId), "相手のマジック（デッキの上に戻す）でも赤スピリットは戻らない")
    assert(s.players.p1.deck.length === deckBefore, "デッキにも戻っていない")
    passFlash(s)
}

console.log("=== B. 006 の境目：相手のターンなら戻る／赤でなければ自分のアタックステップでも戻る ===")
{
    const s = game("b", "p2")
    put(s, "p1", SHUMARUDO, 1)
    const redAlly = put(s, "p1", VANILLA, 1)
    const oppAttacker = put(s, "p2", SKULL, 1)
    assert(act(s, "p2", { type: "attack", instanceId: oppAttacker.instanceId }) === null, "相手がアタックできる")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    s.players.p2.hand = [RIBBON]
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: redAlly.instanceId }) === null, "防御側がパスした後でドリームリボンを使用できる")
    settle(s, [redAlly.instanceId])
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === redAlly.instanceId), "相手のターン（自分のアタックステップではない）なので赤スピリットは手札に戻る")
    assert(s.players.p1.hand.includes(VANILLA), "戻ったカードは手札にある")
    passFlash(s)
}
{
    const s = game("b2")
    put(s, "p1", SHUMARUDO, 1)
    const attacker = put(s, "p1", VANILLA, 1)
    const purpleAlly = put(s, "p1", SKULL, 1)
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "赤スピリットでアタックできる")
    s.players.p2.hand = [RIBBON]
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: purpleAlly.instanceId }) === null, "防御側が優先権を持つフラッシュでドリームリボンを使用できる")
    settle(s, [purpleAlly.instanceId])
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === purpleAlly.instanceId), "赤でない自分のスピリットは手札に戻る")
    assert(s.players.p1.hand.includes(SKULL), "戻ったカードは手札にある")
    passFlash(s)
}

console.log("=== C. 017【合体時】Lv2：自分のスピリットの効果で相手スピリットのコアが0個になったらコブラージャは回復する ===")
{
    const s = game("c")
    const cob = put(s, "p1", COBRAJA, 4) // Lv2
    combine(s, "p1", cob, ANOL)
    const victim = put(s, "p2", SKULL, 1)
    assert(act(s, "p1", { type: "attack", instanceId: cob.instanceId }) === null, "合体したコブラージャでアタックできる")
    // アタック時効果は act(attack) 内で解決し終わる（候補1体なので自動で決まる）。疲労は回復によって間接的に確かめる
    settle(s, [victim.instanceId]) // アタック時：相手のスピリットのコア1個を相手のリザーブに
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === victim.instanceId), "コア1個の相手スピリットはコアが0個になり場を離れる")
    assert(!cob.isRested, "アタック前は回復状態でアタックし、アタック後も回復状態＝疲労して回復した")
    passFlash(s)
}

console.log("=== D. 017 の境目：合体していなければ回復しない／コアが0個にならなければ回復しない ===")
{
    const s = game("d")
    const cob = put(s, "p1", COBRAJA, 4) // Lv2（合体なし）
    const victim = put(s, "p2", SKULL, 1)
    assert(act(s, "p1", { type: "attack", instanceId: cob.instanceId }) === null, "合体していないコブラージャでアタックできる")
    settle(s, [victim.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === victim.instanceId), "コア1個の相手スピリットはコアが0個になり場を離れる")
    assert(cob.isRested, "合体していないのでコブラージャは回復しない")
    passFlash(s)
}
{
    const s = game("d2")
    const cob = put(s, "p1", COBRAJA, 4) // Lv2
    combine(s, "p1", cob, ANOL)
    const tough = put(s, "p2", SKULL, 2)
    assert(act(s, "p1", { type: "attack", instanceId: cob.instanceId }) === null, "合体したコブラージャでアタックできる")
    settle(s, [tough.instanceId])
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === tough.instanceId) && tough.cores === 1, "コア2個の相手スピリットはコア1個になり場に残る")
    assert(cob.isRested, "相手スピリットのコアが0個になっていないので、コブラージャは回復しない")
    passFlash(s)
}

console.log("=== E. X02 Lv2『破壊時』：相手の手札1枚を破棄し、それがスピリットカードなら回復状態で場に残る ===")
{
    const s = game("e")
    const x02 = put(s, "p1", X02, 3) // Lv2
    s.players.p2.hand = [VANILLA]
    destroySpirit(s, "p1", x02.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s)
    assert(s.players.p2.hand.length === 0, "相手の手札1枚は破棄される")
    assert(s.players.p2.trashCards.includes(VANILLA), "破棄したスピリットカードは相手のトラッシュにある")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === x02.instanceId), "スピリットカードを破棄したのでX02はフィールドに残る")
    assert(!x02.isRested, "X02は回復状態で残る")
    assert(!s.players.p1.trashCards.includes(X02), "X02はトラッシュに落ちていない")
}

console.log("=== F. X02 の境目：マジックカードを破棄したらトラッシュへ／相手の手札0枚でもトラッシュへ ===")
{
    const s = game("f")
    const x02 = put(s, "p1", X02, 3) // Lv2
    s.players.p2.hand = [RIBBON]
    destroySpirit(s, "p1", x02.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s)
    assert(s.players.p2.hand.length === 0 && s.players.p2.trashCards.includes(RIBBON), "相手のマジックカード1枚は破棄される")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === x02.instanceId), "スピリットカードでなければX02は破壊される")
    assert(s.players.p1.trashCards.includes(X02), "X02はトラッシュへ置かれる")
}
{
    const s = game("f2")
    const x02 = put(s, "p1", X02, 3) // Lv2
    s.players.p2.hand = []
    destroySpirit(s, "p1", x02.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s)
    assert(s.players.p2.hand.length === 0, "相手の手札は0枚のまま")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === x02.instanceId), "破棄できなければX02は破壊される")
    assert(s.players.p1.trashCards.includes(X02), "X02はトラッシュへ置かれる")
}

console.log("=== G. 017【合体時】Lv2：コブラージャ自身でなくとも、自分の別スピリットの効果で相手スピリットのコアが0個になったら回復する ===")
{
    const s = game("g")
    const cob = put(s, "p1", COBRAJA, 4) // Lv2
    combine(s, "p1", cob, ANOL)
    cob.isRested = true // 疲労状態から回復するかを見る
    const ally = put(s, "p1", ZUGAIN, 1) // 自分の別のスピリット（アタック時：相手のスピリット1体のコア1個を相手のリザーブに置く）
    const victim = put(s, "p2", SKULL, 1)
    // 別スピリットのコア除去効果を自分の効果として解決する（コア1個の相手スピリットが0個になる形）
    resolveAction(s, "p1", ally, { type: "removeCores", count: 1 }, victim.instanceId)
    settle(s, [victim.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === victim.instanceId), "別スピリットの効果で相手スピリットのコアは0個になり場を離れる")
    assert(!cob.isRested, "自分の別スピリットの効果で0個になったので、コブラージャは回復する")
    passFlash(s)
}
{
    const s = game("g2")
    const cob = put(s, "p1", COBRAJA, 4) // Lv2
    combine(s, "p1", cob, ANOL)
    cob.isRested = true
    const victim = put(s, "p2", SKULL, 1)
    // 境目：同じコア除去でもマジックの効果（self=null・sourceType="magic"）では回復しない
    resolveAction(s, "p1", null, { type: "removeCores", count: 1 }, victim.instanceId, undefined, "magic")
    settle(s, [victim.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === victim.instanceId), "マジックの効果でも相手スピリットのコアは0個になり場を離れる")
    assert(cob.isRested, "マジックの効果で0個になったので、コブラージャは回復しない")
    passFlash(s)
}

console.log("=== G3. 017【合体時】Lv2：マミーラの効果（カードデータの action）で相手スピリットのコアが0個になったら回復する ===")
{
    const s = game("g3")
    const cob = put(s, "p1", COBRAJA, 4) // Lv2
    combine(s, "p1", cob, ANOL)
    cob.isRested = true
    const ally = put(s, "p1", "BS02-017", 1) // マミーラ（召喚時：相手のスピリット1体のコア1個を相手のリザーブに置く）
    const victim = put(s, "p2", SKULL, 1)
    const action = (getCard("BS02-017").effects.find((e) => e.id === "BS02-017-e1") as { action: EffectAction }).action
    resolveAction(s, "p1", ally, action, victim.instanceId)
    settle(s, [victim.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === victim.instanceId), "マミーラの効果で相手スピリットのコアは0個になり場を離れる")
    assert(!cob.isRested, "自分の別スピリット（マミーラ）の効果で0個になったので、コブラージャは回復する")
    passFlash(s)
}

console.log("=== G4. 017【合体時】Lv2：ダンピールの効果（カードデータの action）でコスト4以下の相手スピリット2体が0個になったら回復する ===")
{
    const s = game("g4")
    const cob = put(s, "p1", COBRAJA, 4) // Lv2
    combine(s, "p1", cob, ANOL)
    cob.isRested = true
    const ally = put(s, "p1", "BS04-021", 1) // 吸血鬼ダンピール（召喚時：コスト4以下の相手スピリットすべてのコア1個ずつを相手のトラッシュに）
    const victim1 = put(s, "p2", SKULL, 1)
    const victim2 = put(s, "p2", VANILLA, 1)
    const action = (getCard("BS04-021").effects.find((e) => e.id === "BS04-021-e2") as { action: EffectAction }).action
    resolveAction(s, "p1", ally, action)
    settle(s, [victim1.instanceId, victim2.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === victim1.instanceId) && !s.players.p2.field.spirits.some((x) => x.instanceId === victim2.instanceId), "コア1個のコスト4以下の相手スピリット2体はどちらもコアが0個になり場を離れる")
    assert(!cob.isRested, "自分の別スピリット（ダンピール）の効果で2体とも0個になったので、コブラージャは回復する")
    passFlash(s)
}

console.log("すべてのチェックに合格しました 🎉（part784）")
