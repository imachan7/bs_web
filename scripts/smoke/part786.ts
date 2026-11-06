// smoke パート786（BS20-X03 鳥武神シシグイ・BS20-061 近衛機メッセンジャー：爪鳥アタック時のBP以下疲労・爪鳥数×緑BP+1000・エンドステップの爪鳥回復・合体時コスト未満回復のターンに1回）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import { fireStepTriggers } from "../../server/src/logic/EffectModules"
import type { GameState, PlayerId } from "./helpers"

const X03 = "BS20-X03" // 鳥武神シシグイ（緑・コスト5・爪鳥・Lvコア1/3/5）
const MESSENGER = "BS20-061" // 近衛機メッセンジャー（白・ブレイヴ・コスト4・武装・合体条件コスト4以上）
const SHIDA = "BS01-059" // シダフクロウ（緑・コスト3・爪鳥・Lv1 BP3000）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・コスト3・効果なし・Lv1 BP4000）
const METAB = "BS01-008" // メタルバーン（赤・コスト3・効果なし・Lv1 BP3000）
const HADES = "BS01-031" // デス・ハーデス（紫・コスト3・効果なし・Lv1 BP4000）
const MELT = "BS03-009" // 火吹きメルト（赤・コスト5・効果なし）061のホスト（合体スピリットのコスト9）
const VALPER = "BS01-073" // 極彩鳥ヴァルペルチャー（緑・コスト8）【神速】のみで誘発しない
const LEEN = "BS05-X17" // 幻獣王リーン（緑・コスト9）召喚時効果のみで置いただけでは誘発しない
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認（BS20 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS20.json", "utf8")) as {
        cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]
        levels: { level: number; cores: number; bp: number }[]; symbol: string[]; effect?: string
    }[]
    const x03 = staging.find((c) => c.cardId === X03)
    const mes = staging.find((c) => c.cardId === MESSENGER)
    assert(x03?.name === "鳥武神シシグイ" && x03.type === "spirit" && x03.cost === 5 && x03.colors.includes("green"), "X03は鳥武神シシグイ（スピリット・緑・コスト5）")
    assert(x03?.family.includes("爪鳥") === true && x03.levels.map((l) => l.cores).join("/") === "1/3/5" && x03.symbol.join("/") === "green", "X03は爪鳥・Lvコア1/3/5・シンボル緑")
    assert(mes?.name === "近衛機メッセンジャー" && mes.type === "brave" && mes.cost === 4 && mes.colors.includes("white"), "MESSENGERは近衛機メッセンジャー（ブレイヴ・白・コスト4）")
    assert((mes?.effect ?? "").includes("ターンに1回"), "MESSENGERの効果はターンに1回")
    assert(getCard(SHIDA).name === "シダフクロウ" && getCard(SHIDA).family.includes("爪鳥"), "SHIDAはシダフクロウ（爪鳥）")
    assert(getCard(HERA).name === "ヘラクレス・ジオ" && getCard(HERA).colors.includes("green") && !(getCard(HERA).family ?? []).includes("爪鳥"), "HERAはヘラクレス・ジオ（緑・爪鳥でない）")
    assert(getCard(MELT).name === "火吹きメルト" && getCard(MELT).cost === 5, "MELTは火吹きメルト（コスト5）")
    assert(getCard(VALPER).cost === 8 && getCard(LEEN).cost === 9, "VALPERはコスト8・LEENはコスト9")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1, "VANはロクケラトプス（コスト1のバニラ）")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
    s.interactiveTargets = interactive
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

// pendingChoice を答える（target は picks に入っていればそれを選ぶ）
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

console.log("=== A. X03 Lv1：爪鳥がアタックしたとき、そのBP以下の相手スピリット1体を疲労させる（同じBPは含む・高いBPは含まない） ===")
{
    const s = game("a", true)
    put(s, "p1", X03, 1) // Lv1
    const shida = put(s, "p1", SHIDA, 1) // Lv1 BP3000
    const sameBp = put(s, "p2", METAB, 1) // Lv1 BP3000（アタッカーと同じBP）
    const highBp = put(s, "p2", HADES, 1) // Lv1 BP4000（アタッカーより高いBP）
    assert(act(s, "p1", { type: "attack", instanceId: shida.instanceId }) === null, "シダフクロウでアタックできる")
    const pc = s.pendingChoice as { kind: string; candidates?: string[] } | null
    if (pc?.kind === "target") {
        assert((pc.candidates ?? []).includes(sameBp.instanceId), "同じBP3000の相手スピリットは候補に入る")
        assert(!(pc.candidates ?? []).includes(highBp.instanceId), "BP4000の相手スピリットは候補に入らない")
    }
    settle(s, [sameBp.instanceId])
    assert(sameBp.isRested, "同じBPの相手スピリットは疲労する")
    assert(!highBp.isRested, "高いBPの相手スピリットは疲労しない")
    passFlash(s)
    takeLifeAndResolve(s, "p2")
}

console.log("=== B. X03 Lv2：爪鳥1体につき自分の緑のスピリットすべてをBP+1000（自分のアタックステップのみ） ===")
{
    const s = game("b")
    const x03 = put(s, "p1", X03, 3) // Lv2（爪鳥1体目）
    const shida = put(s, "p1", SHIDA, 1) // 爪鳥2体目
    const hera = put(s, "p1", HERA, 1) // 緑・爪鳥でない
    const red = put(s, "p1", METAB, 1) // 緑でない
    assert(effectiveBp(s, "p1", x03) === 7000 + 2000, "自分のアタックステップ中はX03のBPが+2000（7000→9000）")
    assert(effectiveBp(s, "p1", shida) === 3000 + 2000, "緑の爪鳥シダフクロウも+2000（3000→5000）")
    assert(effectiveBp(s, "p1", hera) === 4000 + 2000, "緑のスピリットはすべて+2000（4000→6000）")
    assert(effectiveBp(s, "p1", red) === 3000, "緑でないスピリットは+されない（3000のまま）")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    assert(effectiveBp(s, "p1", x03) === 7000, "相手のアタックステップではX03のBPは+されない（7000のまま）")
    assert(effectiveBp(s, "p1", hera) === 4000, "相手のアタックステップではヘラクレス・ジオのBPも+されない（4000のまま）")
}

console.log("=== C. X03 Lv3：自分のエンドステップに爪鳥すべてを回復させる（爪鳥でない疲労スピリットは回復しない） ===")
{
    const s = game("c")
    const x03 = put(s, "p1", X03, 5) // Lv3
    const shida = put(s, "p1", SHIDA, 1)
    const hera = put(s, "p1", HERA, 1)
    x03.isRested = true
    shida.isRested = true
    hera.isRested = true
    fireStepTriggers(s, "end")
    assert(!x03.isRested && !shida.isRested, "疲労状態の爪鳥（X03とシダフクロウ）は回復する")
    assert(hera.isRested, "爪鳥でないヘラクレス・ジオは回復しない")
}

console.log("=== D. 061【合体時】：合体アタック時にこの合体スピリット（コスト9）より低いコストの自分のスピリット1体を回復させる。ターンに1回 ===")
{
    const s = game("d", true)
    const host = put(s, "p1", MELT, 1) // コスト5のホスト
    const brave = createInstance(MESSENGER, s.turn, 0)
    s.players.p1.field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    const cost8 = put(s, "p1", VALPER, 1) // コスト8（合体スピリットのコスト9より低い）
    const cost9 = put(s, "p1", LEEN, 1) // コスト9（同じコストは含まない）
    cost8.isRested = true
    cost9.isRested = true
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリット（コスト9）でアタックできる")
    const pc = s.pendingChoice as { kind: string; candidates?: string[] } | null
    if (pc?.kind === "target") {
        assert((pc.candidates ?? []).includes(cost8.instanceId), "コスト8の自分のスピリットは候補に入る")
        assert(!(pc.candidates ?? []).includes(cost9.instanceId), "コスト9の自分のスピリットは候補に入らない")
    }
    settle(s, [cost8.instanceId])
    assert(!cost8.isRested, "コスト8のスピリットは回復する")
    assert(cost9.isRested, "コスト9のスピリットは回復しない")
    passFlash(s)
    takeLifeAndResolve(s, "p2")
    // 同じターンの2回目の合体アタックではもう発揮しない（ターンに1回）
    host.isRested = false
    cost8.isRested = true
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "同じターンに2回目の合体アタックができる")
    settle(s, [cost8.instanceId])
    assert(cost8.isRested, "ターンに1回なので2回目ではコスト8のスピリットは回復しない")
    passFlash(s)
    takeLifeAndResolve(s, "p2")
}

console.log("すべてのチェックに合格しました 🎉（part786）")
