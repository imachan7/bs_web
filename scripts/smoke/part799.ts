// smoke パート799（BS21-007・034・062：星魂数破壊・【強化】への星魂付与・白ブロックBP+3000・必ずアタック・合体時ブロックのコア獲得。BS21_PLAN §1・§2 の確定読み）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, refreshLevelAsOverrides, spiritHasFamily, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const PEACOCK = "BS21-007" // 極彩竜ピーコック・ワイバーン（赤・コスト5・星竜/星魂）
const DEARY = "BS21-034" // 天眼機神ディアリーン（白・コスト5・武装）
const BONGO = "BS21-062" // 弩弓獣クロス・ボンゴ（白・ブレイヴ・コスト4・機獣・合体条件コスト4以上）
const WOLF = "BS21-002" // ウォルフドラゴン（赤・コスト2・星竜/星魂・staging）

const NEBULA = "BS20-008" // ネビュラ・ドラゴン（赤・コスト6・星竜・【強化】）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・BP3000・効果なし）
const SABER = "BS01-003" // テラノセイバー（赤・コスト2・BP4000・効果なし）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・BP3000・効果なし）
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・BP6000・効果なし）
const LIME = "BS16-035" // 樹氷竜シルバー・ライム（白・コスト6・BP5000・効果なし）
const DURAHAN = "P011" // 首無し騎士デュラハン（紫・コスト4・BP3000・効果なし）
const KARAKURI = "BS20-060" // カラクリバッタ（ブレイヴ・合体条件コスト4以上）

console.log("=== 前提: カードの機械確認（BS21 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS21.json", "utf8")) as { cardId: string; name: string; type: string; colors: string[]; cost: number; family: string[]; levels: { level: number; cores: number; bp?: number }[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    assert(byId(PEACOCK)?.name === "極彩竜ピーコック・ワイバーン" && byId(PEACOCK)!.type === "spirit" && byId(PEACOCK)!.colors[0] === "red" && byId(PEACOCK)!.cost === 5 && byId(PEACOCK)!.family.join("/") === "星竜/星魂" && byId(PEACOCK)!.levels.map((l) => `${l.cores}:${l.bp}`).join("/") === "1:4000/3:6000", "PEACOCKは極彩竜ピーコック・ワイバーン（赤・コスト5・星竜/星魂・Lv1コア1BP4000・Lv2コア3BP6000）")
    assert(byId(DEARY)?.name === "天眼機神ディアリーン" && byId(DEARY)!.type === "spirit" && byId(DEARY)!.colors[0] === "white" && byId(DEARY)!.cost === 5 && byId(DEARY)!.family.join("/") === "武装" && byId(DEARY)!.levels.map((l) => `${l.cores}:${l.bp}`).join("/") === "1:5000/2:7000/4:9000", "DEARYは天眼機神ディアリーン（白・コスト5・武装・Lvコア1/2/4・BP5000/7000/9000）")
    assert(byId(BONGO)?.name === "弩弓獣クロス・ボンゴ" && byId(BONGO)!.type === "brave" && byId(BONGO)!.colors[0] === "white" && byId(BONGO)!.cost === 4 && byId(BONGO)!.family.join("/") === "機獣" && byId(BONGO)!.levels[0]!.bp === 3000, "BONGOは弩弓獣クロス・ボンゴ（白・ブレイヴ・コスト4・機獣・BP3000）")
    assert(byId(WOLF)?.name === "ウォルフドラゴン" && byId(WOLF)!.family.includes("星魂"), "WOLFはウォルフドラゴン（星魂）")
    assert(getCard(NEBULA).name === "ネビュラ・ドラゴン" && getCard(NEBULA).effect.includes("【強化】"), "NEBULAはネビュラ・ドラゴン（【強化】）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).levels[0]!.bp === 1000 && getCard(VAN).effect === "", "VANはロクケラトプス（BP1000・効果なし）")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).levels[0]!.bp === 3000 && getCard(STIRA).effect === "", "STIRAはスティラホーン（BP3000・効果なし）")
    assert(getCard(SABER).name === "テラノセイバー" && getCard(SABER).levels[0]!.bp === 4000, "SABERはテラノセイバー（BP4000）")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).colors[0] === "white" && getCard(BELL).levels[0]!.bp === 3000 && getCard(BELL).effect === "", "BELLはデュアルキャノン・ベル（白・BP3000・効果なし）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).colors[0] === "green" && getCard(TARAN).levels[0]!.bp === 6000 && getCard(TARAN).effect === "", "TARANはタランドーズ（緑・BP6000・効果なし）")
    assert(getCard(LIME).name === "樹氷竜シルバー・ライム" && getCard(LIME).colors[0] === "white" && getCard(LIME).levels[0]!.bp === 5000 && getCard(LIME).effect === "", "LIMEはシルバー・ライム（白・BP5000・効果なし）")
    assert(getCard(DURAHAN).name === "首無し騎士デュラハン" && getCard(DURAHAN).colors[0] === "purple" && getCard(DURAHAN).cost === 4 && getCard(DURAHAN).effect === "", "DURAHANは首無し騎士デュラハン（紫・コスト4・効果なし）")
    assert(getCard(KARAKURI).name === "カラクリバッタ" && getCard(KARAKURI).type === "brave", "KARAKURIはカラクリバッタ（ブレイヴ）")
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

// 対象の選択は picks を優先して答える
function settle(s: GameState, picks: string[] = []): void {
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[] }
        const who = pc.pid ?? "p1"
        const next = pc.kind === "target" ? (picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]) : undefined
        const err = next !== undefined
            ? act(s, who, { type: "resolveChoice", instanceId: next })
            : pc.kind === "option" ? act(s, who, { type: "resolveChoice", option: pc.options?.[0] ?? "" }) : act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

console.log("=== A. 007 Lv1『このスピリットのアタック時』：星魂2体（007自身＋ウォルフドラゴン）でBP3000以下の相手2体を破壊。BP4000は対象外 ===")
{
    const s = game("peacock-lv1")
    const peacock = put(s, "p1", PEACOCK, 1) // Lv1
    put(s, "p1", WOLF, 1)
    const van = put(s, "p2", VAN, 1) // BP1000
    const stira = put(s, "p2", STIRA, 1) // BP3000
    const saber = put(s, "p2", SABER, 1) // BP4000
    assert(act(s, "p1", { type: "attack", instanceId: peacock.instanceId }) === null, "ピーコックでアタックできる")
    settle(s, [van.instanceId, stira.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "BP1000のロクケラトプスは破壊される（1体目）")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === stira.instanceId), "BP3000のスティラホーンは破壊される（2体目）")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === saber.instanceId), "BP4000のテラノセイバーは破壊されない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== B. 007 Lv2『自分のアタックステップ』：【強化】持ちすべてに星魂を与える（メインでは持たない）。Lv2のアタック時はこの星魂も数に入口 ===")
{
    const s = game("peacock-lv2")
    s.phase = "main"
    const peacock = put(s, "p1", PEACOCK, 3) // Lv2
    const nebula = put(s, "p1", NEBULA, 1) // 【強化】
    assert(!spiritHasFamily(s, "p1", nebula, "星魂"), "メインステップではネビュラ・ドラゴンは星魂を持たない")
    s.phase = "attack"
    assert(spiritHasFamily(s, "p1", nebula, "星魂"), "自分のアタックステップで【強化】持ちのネビュラ・ドラゴンは星魂を持つ")
    const van = put(s, "p2", VAN, 1)
    const stira = put(s, "p2", STIRA, 1)
    assert(act(s, "p1", { type: "attack", instanceId: peacock.instanceId }) === null, "Lv2ピーコックでアタックできる")
    settle(s, [van.instanceId, stira.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "星魂2体（ピーコック＋強化で星魂を得たネビュラ）でBP1000が破壊される")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === stira.instanceId), "BP3000も破壊される（2体分）")
    takeLifeAndResolve(s, "p2")
}

console.log("=== C. 034 Lv1『相手のアタックステップ』：自分の白のスピリットがブロックしたときBP+3000。白でなければ変わらない ===")
{
    const s = game("deary-white-block")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    const deary = put(s, "p1", DEARY, 1) // Lv1・白・BP5000
    const attacker = put(s, "p2", STIRA, 1) // BP3000
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のスティラホーンがアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, "p1", deary.instanceId) === null, "白のディアリーンでブロックできる")
    settle(s)
    assert(effectiveBp(s, "p1", deary) === 8000, "白のスピリットのブロックでBP+3000（5000→8000）")
}
{
    const s = game("deary-green-block")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    put(s, "p1", DEARY, 1) // Lv1
    const taran = put(s, "p1", TARAN, 1) // 緑・BP6000
    const attacker = put(s, "p2", STIRA, 1)
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のスティラホーンがアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, "p1", taran.instanceId) === null, "緑のタランドーズでブロックできる")
    settle(s)
    assert(effectiveBp(s, "p1", taran) === 6000, "白でないスピリットのブロックではBPは変わらない")
}

console.log("=== D. 034 Lv3『相手のアタックステップ』：合体していない相手スピリットは必ずアタック。合体しているだけなら終えられる ===")
{
    const s = game("deary-lv3-mustattack")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    put(s, "p1", DEARY, 4) // Lv3
    const van = put(s, "p2", VAN, 1) // 合体していない・未アタック
    const err = act(s, "p2", { type: "endTurn" })
    assert(err !== null, "合体していないスピリットが残っているのにアタックステップを終えようとすると拒否される")
    assert(act(s, "p2", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタックできる")
    takeLifeAndResolve(s, "p1")
    assert(act(s, "p2", { type: "endTurn" }) === null, "アタック後はendTurnできる")
}
{
    const s = game("deary-lv3-combined-only")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    put(s, "p1", DEARY, 4) // Lv3
    const host = put(s, "p2", STIRA, 1)
    combine(s, "p2", host, KARAKURI) // 合体している相手スピリットのみ
    assert(act(s, "p2", { type: "endTurn" }) === null, "合体しているスピリットだけならアタックせずに終えられる")
}

console.log("=== E. 062【合体時】『このスピリットのブロック時』：コア+1。紫のシンボルを持つとき相手のフィールドのコア1個をリザーブへ ===")
{
    const s = game("bongo-purple-host")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    const host = put(s, "p1", DURAHAN, 1) // 紫・コスト4
    combine(s, "p1", host, BONGO) // 合体スピリットのシンボルは紫＋白
    const attacker = put(s, "p2", STIRA, 2) // BP3000・コア2
    const p2Reserve = s.players.p2.reserve
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のスティラホーンがアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, "p1", host.instanceId) === null, "紫ホストとの合体スピリットでブロックできる")
    settle(s, [attacker.instanceId])
    assert(host.cores === 2, "ボイドからコア1個を合体スピリットに置く（1→2）")
    assert(attacker.cores === 1 && s.players.p2.reserve === p2Reserve + 1, "紫のシンボルを持つので相手のフィールドのコア1個がリザーブへ（アタッカー2→1・リザーブ+1）")
}
{
    const s = game("bongo-white-host")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    const host = put(s, "p1", LIME, 1) // 白・コスト6（紫のシンボル無し）
    combine(s, "p1", host, BONGO) // シンボルは白＋白
    const attacker = put(s, "p2", STIRA, 2)
    const p2Reserve = s.players.p2.reserve
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のスティラホーンがアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, "p1", host.instanceId) === null, "白ホストとの合体スピリットでブロックできる")
    settle(s)
    assert(host.cores === 2, "ボイドからコア1個を合体スピリットに置く（1→2）")
    assert(attacker.cores === 2 && s.players.p2.reserve === p2Reserve, "紫のシンボルが無ければ相手のコアは動かない")
}

console.log("すべてのチェックに合格しました 🎉（part799）")
