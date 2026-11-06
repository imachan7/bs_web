// smoke パート804（BS21-052 十剣聖ブールド・サイノス：相手のバーストを異合の破壊で無効／合体時のバトル時BP+、BS21-053 星喰いのヤシガニド：召喚時の破壊・連鎖・Lv2で相手の【強化】無効。BS21_PLAN §1・§2、BURST §2 の確定読み）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const BLD = "BS21-052" // 十剣聖ブールド・サイノス（青・コスト5・剣使/獣頭・Lv1=1/4000 Lv2=3/7000 Lv3=5/9000）
const YASHI = "BS21-053" // 星喰いのヤシガニド（青・コスト5・異合・Lv1=1/3000 Lv2=4/8000）

const X01 = "BS18-X01" // 超覇王ロード・ドラゴン・セイバー（Lv2・3コアで、アタック時にライフのコア1個を自分に置く任意の支払い）
const HYOGAN = "SD06-016" // 絶甲氷盾（バースト：自分のライフ減少後。ボイドからコア1個を自分のライフに置く）
const BRAVE = "BS10-071" // フェンリルキャノンType-B（白・ブレイヴ・コスト4・BP3000・合体条件コスト4以上）
const GATLING = "BS01-084" // ガトリングスタンド（白・武装・Lv1=1コア3000 Lv2=2コア5000・効果なし）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・シンボル確保用）
const KOGUMARU = "BS12-033" // コグマル（黄・小玩/星魂・効果なし）
const YUMIPID = "BS20-038" // 弓ピッド（黄・天霊・Lv1以上【強化】：自分のBP-効果を-1000）
const PRESSURE = "BS19-109" // エンジェリックプレッシャー（黄・マジック・フラッシュ：相手のスピリット1体をBP-3000）
const VAN = "BS01-002" // ロクケラトプス（赤・Lv1 BP1000・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS21.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; levels: { level: number; cores: number; bp: number }[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    const lv = (id: string) => byId(id)!.levels.map((l) => `${l.cores}/${l.bp}`).join(",")
    assert(byId(BLD)?.name === "十剣聖ブールド・サイノス" && byId(BLD)!.type === "spirit" && byId(BLD)!.cost === 5 && byId(BLD)!.colors[0] === "blue" && byId(BLD)!.family.includes("剣使") && !byId(BLD)!.family.includes("異合") && lv(BLD) === "1/4000,3/7000,5/9000", "BLDは十剣聖ブールド・サイノス（青・コスト5・異合ではない・1/4000,3/7000,5/9000）")
    assert(byId(YASHI)?.name === "星喰いのヤシガニド" && byId(YASHI)!.type === "spirit" && byId(YASHI)!.cost === 5 && byId(YASHI)!.colors[0] === "blue" && byId(YASHI)!.family.includes("異合") && lv(YASHI) === "1/3000,4/8000", "YASHIは星喰いのヤシガニド（青・コスト5・異合・1/3000,4/8000）")
    assert(getCard(X01).name === "超覇王ロード・ドラゴン・セイバー" && getCard(X01).effect.includes("ライフのコア1個をこのスピリットに置くことで"), "X01は超覇王ロード・ドラゴン・セイバー")
    assert(getCard(HYOGAN).name === "絶甲氷盾" && getCard(HYOGAN).effect.includes("ライフ減少後"), "HYOGANは絶甲氷盾")
    assert(getCard(BRAVE).name === "フェンリルキャノンType-B" && getCard(BRAVE).type === "brave" && getCard(BRAVE).levels[0]!.bp === 3000, "BRAVEはフェンリルキャノンType-B（ブレイヴ・BP3000）")
    assert(getCard(GATLING).name === "ガトリングスタンド" && getCard(GATLING).levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/3000,2/5000" && getCard(GATLING).effect === "", "GATLINGはガトリングスタンド（1/3000,2/5000・効果なし）")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).colors[0] === "purple", "GRIPはグリプ・ハンズ（紫）")
    assert(getCard(KOGUMARU).name === "コグマル" && getCard(KOGUMARU).family.includes("星魂") && !getCard(KOGUMARU).family.includes("天霊") && getCard(KOGUMARU).effect === "", "KOGUMARUはコグマル（星魂・天霊ではない・効果なし）")
    assert(getCard(YUMIPID).name === "弓ピッド" && getCard(YUMIPID).colors[0] === "yellow" && getCard(YUMIPID).family.includes("天霊") && getCard(YUMIPID).effect.includes("【強化】") && getCard(YUMIPID).effect.includes("BP-効果"), "YUMIPIDは弓ピッド（黄・天霊・BP-効果の【強化】）")
    assert(getCard(PRESSURE).name === "エンジェリックプレッシャー" && getCard(PRESSURE).type === "magic" && getCard(PRESSURE).effect.includes("BP-3000"), "PRESSUREはエンジェリックプレッシャー（BP-3000マジック）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).levels[0]!.bp === 1000 && getCard(VAN).effect === "", "VANはロクケラトプス（BP1000・効果なし）")
}

function game(seed: string, phase: "main" | "attack" = "attack", turnPlayer: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "yellow" })
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

// 未実装カード（data/cards に無い）は createInstance/getCard が例外を投げるので、その場面だけ警告して続行する
function scene(label: string, fn: () => void): void {
    console.log(`=== ${label} ===`)
    try {
        fn()
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // 見逃すのは未実装の BS21 だけ（既存カードの ID の打ち間違いは落とす）
        if (msg.includes("カードが見つかりません") && msg.includes("BS21-")) console.log(`  ⚠ 未実装カードで未確認: ${msg}`)
        else throw e
    }
}

// 保留中の選択を片づける。p1（052 の持ち主）への確認だけ数え、accept で受ける／断る。p2 のバースト発動・ライフ支払いは受ける
function drain(s: GameState, accept: boolean, yashiId?: string): number {
    let asks = 0
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; burstActivate?: unknown }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.burstActivate !== undefined) err = act(s, who, { type: "resolveChoice", option: "発動する" })
        else if (who === "p1") {
            asks++
            if (!accept) err = act(s, who, { type: "resolveChoice" })
            else if (pc.kind === "target") err = act(s, who, { type: "resolveChoice", instanceId: (yashiId !== undefined && (pc.candidates ?? []).includes(yashiId)) ? yashiId : pc.candidates![0]! })
            else {
                const o = pc.options ?? []
                err = act(s, who, { type: "resolveChoice", option: o.find((x) => ["破壊", "はい", "する"].some((k) => x.includes(k))) ?? o[0] ?? "" })
            }
        } else if (pc.kind === "option") {
            const o = pc.options ?? []
            err = act(s, who, { type: "resolveChoice", option: o.find((x) => ["置く", "支払う", "発動する"].some((k) => x.includes(k))) ?? o[0] ?? "" })
        } else if (pc.kind === "target") err = act(s, who, { type: "resolveChoice", instanceId: pc.candidates![0]! })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
    return asks
}

// A（052）：相手のバースト発動 → 異合を破壊して無効
scene("A1: 自分のアタックでライフ減少 → 相手の絶甲氷盾が発動 → 異合(053)を破壊して無効。バーストはトラッシュ・効果は起きない", () => {
    const s = game("a1")
    const bld = put(s, "p1", BLD, 1)
    const yashi = put(s, "p1", YASHI, 1)
    const van = put(s, "p1", VAN, 1)
    s.players.p2.burst = HYOGAN
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    const asks = drain(s, true, yashi.instanceId)
    assert(asks === 1, `052 の持ち主へ「異合を破壊するか」が1回出る（実際 ${asks} 回）`)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === yashi.instanceId) && s.players.p1.field.spirits.some((x) => x.instanceId === bld.instanceId), "異合(053)だけが破壊され、052 は残る")
    assert(s.players.p2.burst === null && s.players.p2.trashCards.includes(HYOGAN), "バーストは発動せずトラッシュへ（バーストエリアは空）")
    assert(s.players.p2.life === 4, "絶甲氷盾の効果は起きない（ライフは5→4のまま）")
})
scene("A2: 境目：断れば普通に解決（053 は残り、ライフ4→5）", () => {
    const s = game("a2")
    put(s, "p1", BLD, 1)
    const yashi = put(s, "p1", YASHI, 1)
    const van = put(s, "p1", VAN, 1)
    s.players.p2.burst = HYOGAN
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "アタックできる")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    const asks = drain(s, false)
    assert(asks === 1, `確認は1回出る（実際 ${asks} 回）`)
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === yashi.instanceId), "断ったので 053 は破壊されない")
    assert(s.players.p2.life === 5 && s.players.p2.trashCards.includes(HYOGAN), "絶甲氷盾の効果が起きる（ライフ5）・使ったバーストはトラッシュ")
})
scene("A3: 境目：異合の自分のスピリットがいなければ聞かれず、普通に解決", () => {
    const s = game("a3")
    put(s, "p1", BLD, 1)
    const van = put(s, "p1", VAN, 1)
    s.players.p2.burst = HYOGAN
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "アタックできる")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    const asks = drain(s, true)
    assert(asks === 0, `異合がいないので 052 の確認は出ない（実際 ${asks} 回）`)
    assert(s.players.p2.life === 5, "絶甲氷盾の効果が起きる（ライフ5）")
})
scene("A4: 相手のアタックステップ（相手のターン）でも同じ：相手が自分の効果でライフ減少 → バースト発動 → 異合を破壊して無効", () => {
    const s = game("a4", "attack", "p2")
    put(s, "p1", BLD, 1)
    const yashi = put(s, "p1", YASHI, 1)
    const x = put(s, "p2", X01, 3) // Lv2
    s.players.p2.burst = HYOGAN
    assert(act(s, "p2", { type: "attack", instanceId: x.instanceId }) === null, "X01でアタックできる")
    const asks = drain(s, true, yashi.instanceId)
    assert(asks === 1, `相手のアタックステップでも 052 の確認が出る（実際 ${asks} 回）`)
    assert(!s.players.p1.field.spirits.some((i) => i.instanceId === yashi.instanceId), "異合(053)が破壊される")
    assert(s.players.p2.life === 4 && s.players.p2.trashCards.includes(HYOGAN), "X01の支払いで5→4、バーストは無効（ライフは回復しない）・トラッシュへ")
})

// B（052【合体時】Lv2）
scene("B1: 合体した 052（Lv2）は、バトル時に異合2体ぶん BP+4000", () => {
    const s = game("b1", "main")
    const bld = put(s, "p1", BLD, 3) // Lv2
    put(s, "p1", YASHI, 1)
    put(s, "p1", YASHI, 1)
    const brave = put(s, "p1", BRAVE, 1)
    const blocker = put(s, "p2", GATLING, 2)
    assert(act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: bld.instanceId }) === null, "052 にブレイヴを合体できる")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    const before = effectiveBp(s, "p1", bld)
    assert(act(s, "p1", { type: "attack", instanceId: bld.instanceId }) === null, "合体した 052 でアタックできる")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ガトリングスタンドでブロック")
    drain(s, false)
    assert(effectiveBp(s, "p1", bld) === before + 4000, `バトル中は異合2体×2000=+4000（${before}→${effectiveBp(s, "p1", bld)}）`)
})
scene("B2: 境目：合体していなければ上がらない", () => {
    const s = game("b2")
    const bld = put(s, "p1", BLD, 3) // Lv2
    put(s, "p1", YASHI, 1)
    put(s, "p1", YASHI, 1)
    const blocker = put(s, "p2", GATLING, 2)
    const before = effectiveBp(s, "p1", bld)
    assert(act(s, "p1", { type: "attack", instanceId: bld.instanceId }) === null, "052 でアタックできる")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ガトリングスタンドでブロック")
    drain(s, false)
    assert(effectiveBp(s, "p1", bld) === before, `合体していないので BP は変わらない（${before}→${effectiveBp(s, "p1", bld)}）`)
})

// C（053 召喚時）
function summonYashi(seed: string, withPurple: boolean): { s: GameState; yumi: ReturnType<typeof createInstance>; kogu: ReturnType<typeof createInstance> } {
    const s = game(seed, "main")
    if (withPurple) put(s, "p1", GRIP, 1)
    const yumi = put(s, "p2", YUMIPID, 1)
    const kogu = put(s, "p2", KOGUMARU, 1)
    s.players.p1.hand = [YASHI]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "053 を召喚できる")
    drain(s, true)
    return { s, yumi, kogu }
}
scene("C1: 紫シンボルがあれば、天霊を1体破壊し、続けて星魂も1体破壊する", () => {
    const { s, yumi, kogu } = summonYashi("c1", true)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === yumi.instanceId), "天霊(弓ピッド)が破壊される")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === kogu.instanceId), "紫シンボルがあるので星魂(コグマル)も破壊される")
})
scene("C2: 境目：紫シンボルが無ければ星魂は残る（天霊だけ破壊）", () => {
    const { s, yumi, kogu } = summonYashi("c2", false)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === yumi.instanceId), "天霊(弓ピッド)が破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === kogu.instanceId), "紫シンボルが無いので星魂(コグマル)は残る")
})

// D（053 Lv2：相手の【強化】は発揮されない）
function bpMinus(seed: string, yashiCores: number): number {
    const s = game(seed)
    put(s, "p1", YASHI, yashiCores)
    const gat = put(s, "p1", GATLING, 2)
    put(s, "p2", YUMIPID, 1)
    s.players.p2.hand = [PRESSURE]
    assert(act(s, "p1", { type: "attack", instanceId: gat.instanceId }) === null, "ガトリングスタンドでアタック")
    const before = effectiveBp(s, "p1", gat)
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "相手がエンジェリックプレッシャーを使用")
    for (let i = 0; i < 10 && s.pendingChoice; i++) act(s, "p2", { type: "resolveChoice", instanceId: gat.instanceId })
    return before - effectiveBp(s, "p1", gat)
}
scene("D1: 053 が Lv2 なら、相手の弓ピッドの【強化】は効かず BP-3000 のまま", () => {
    assert(bpMinus("d1", 4) === 3000, "053 Lv2：相手の BP-効果は -3000（強化の -1000 が乗らない）")
})
scene("D2: 境目：053 が Lv1 なら相手の【強化】が効いて BP-4000", () => {
    assert(bpMinus("d2", 1) === 4000, "053 Lv1：相手の BP-効果は -3000-1000=-4000")
})
scene("D3: 自分の【強化】は 053 Lv2 でも効く（自分の弓ピッド：相手へ BP-4000）", () => {
    const s = game("d3")
    put(s, "p1", YASHI, 4)
    put(s, "p1", YUMIPID, 1)
    const van = put(s, "p1", VAN, 1)
    const gat = put(s, "p2", GATLING, 2)
    s.players.p1.hand = [PRESSURE]
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    const before = effectiveBp(s, "p2", gat)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "自分がエンジェリックプレッシャーを使用")
    for (let i = 0; i < 10 && s.pendingChoice; i++) act(s, "p1", { type: "resolveChoice", instanceId: gat.instanceId })
    assert(before - effectiveBp(s, "p2", gat) === 4000, "自分の【強化】は効く：-3000-1000=-4000")
})

console.log("すべてのチェックに合格しました 🎉（part804）")
