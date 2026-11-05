// smoke パート780（BRAVE.md §6.3.2：合体スピリットが場を離れるとき、残さないブレイヴはホストと同じ領域へ行く。残す確認の順・非対話の自動残し）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const HOST = "BS01-089" // デュアルキャノン・ベル（白・コスト4・Lv1BP3000・効果なし）minCost4のブレイヴの合体条件を満たすホスト
const JACK = "BS19-076" // ジャッククリ（ブレイヴ・コスト4・合体時BP2000・合体条件コスト4以上・効果は合体アタック時だけ）
const HAM = "BS15-059" // スターハム（黄・ブレイヴ・コスト4・小玩・合体時BP2000・合体条件コスト4以上）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1BP1000・バニラ）
const DREAM = "BS01-146" // ドリームリボン（白・マジック・コスト4・フラッシュ：相手のスピリット1体を手札に戻す）
const CHEST = "BS01-147" // ドリームチェスト（白・マジック・コスト5・フラッシュ：スピリット1体をデッキの上に戻す）
const FLAMEGUST = "BS09-069" // フレイムガスト（赤・マジック・コスト6・フラッシュ：BP6000以下の相手のスピリット1体を破壊する）
const GLORIA = "PX11" // 天戒機神グロリアス・ソリュート（白・コスト7・召喚時：BP5000以下の相手のスピリットすべてを手札に戻す）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HOST).name === "デュアルキャノン・ベル" && getCard(HOST).type === "spirit" && getCard(HOST).cost === 4 && getCard(HOST).levels[0]!.bp === 3000, "HOSTはデュアルキャノン・ベル（白・コスト4・Lv1BP3000）")
    assert(getCard(JACK).name === "ジャッククリ" && getCard(JACK).type === "brave" && getCard(JACK).cost === 4 && getCard(JACK).braveLevels![0]!.bp === 2000, "JACKはジャッククリ（ブレイヴ・コスト4・合体時BP2000）")
    assert(getCard(HAM).name === "スターハム" && getCard(HAM).type === "brave" && getCard(HAM).cost === 4 && getCard(HAM).braveLevels![0]!.bp === 2000, "HAMはスターハム（ブレイヴ・コスト4・合体時BP2000）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1 && getCard(VAN).levels[0]!.bp === 1000, "VANはロクケラトプス（コスト1・BP1000）")
    assert(getCard(DREAM).name === "ドリームリボン" && getCard(DREAM).type === "magic" && getCard(DREAM).cost === 4, "DREAMはドリームリボン（白・マジック・コスト4）")
    assert(getCard(CHEST).name === "ドリームチェスト" && getCard(CHEST).type === "magic" && getCard(CHEST).cost === 5, "CHESTはドリームチェスト（白・マジック・コスト5）")
    assert(getCard(FLAMEGUST).name === "フレイムガスト" && getCard(FLAMEGUST).type === "magic" && getCard(FLAMEGUST).cost === 6, "FLAMEGUSTはフレイムガスト（赤・マジック・コスト6）")
    assert(getCard(GLORIA).name === "天戒機神グロリアス・ソリュート" && getCard(GLORIA).type === "spirit" && getCard(GLORIA).cost === 7, "GLORIAは天戒機神グロリアス・ソリュート（白・コスト7）")
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
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

// ブレイヴをホストに合体させた合体スピリットを作る
function combined(s: GameState, pid: PlayerId, hostCardId: string, braveCardId: string): { host: ReturnType<typeof createInstance>; brave: ReturnType<typeof createInstance> } {
    const host = put(s, pid, hostCardId, 1)
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return { host, brave }
}

// p1がバニラでアタックしてフラッシュタイミングを開き、p2がフラッシュマジックをp1の合体スピリットに使う
function flashOnCombined(s: GameState, magic: string, hostId: string): void {
    const attacker = put(s, "p1", VAN, 1)
    s.players.p2.hand = [magic]
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタックしてフラッシュタイミングが始まる")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: hostId }) === null, "p2がフラッシュマジックを合体スピリットに使う")
}

console.log("=== 1. 規則1：手札に戻す＋「残さない」→ ブレイヴもホストと同じく手札へ（トラッシュではない） ===")
{
    const s = game("hand-keep-no", true)
    const { host, brave } = combined(s, "p1", HOST, JACK)
    flashOnCombined(s, DREAM, host.instanceId)
    const pc = s.pendingChoice
    assert(pc !== null && pc.pid === "p1", "持ち主に「残しますか？」の確認が出る")
    assert(pc!.braveKeep?.cardId === JACK, "確認の対象は合体していたジャッククリ")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "スキップ＝「残さない」")
    assert(s.players.p1.hand.includes(HOST) && s.players.p1.hand.includes(JACK), "ホストもブレイヴも手札にある")
    assert(!s.players.p1.trashCards.includes(HOST) && !s.players.p1.trashCards.includes(JACK), "トラッシュには無い")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "ホストは場にいない")
    assert(s.players.p1.field.combinedBraves.length === 0 && s.players.p1.field.spirits.every((x) => x.instanceId !== brave.instanceId), "ブレイヴは場にも合体中にもいない")
}

console.log("=== 2. 規則4：手札に戻す＋「残す」→ ブレイヴはコアを置いてスピリット状態で場、ホストは手札 ===")
{
    const s = game("hand-keep-yes", true)
    const { host, brave } = combined(s, "p1", HOST, JACK)
    flashOnCombined(s, DREAM, host.instanceId)
    assert(s.pendingChoice?.braveKeep?.cardId === JACK, "「残しますか？」の確認")
    assert(act(s, "p1", { type: "resolveChoice", option: "残す" }) === null, "「残す」を選ぶ")
    const kept = s.players.p1.field.spirits.find((x) => x.instanceId === brave.instanceId)
    assert(kept !== undefined && kept.cores === getCard(JACK).levels[0]!.cores, "ブレイヴはLv1維持コアを置いてスピリット状態で場に残る")
    assert(s.players.p1.hand.includes(HOST) && !s.players.p1.hand.includes(JACK), "ホストは手札、ブレイヴは手札に無い")
    assert(!s.players.p1.trashCards.includes(JACK), "ブレイヴはトラッシュに無い")
}

console.log("=== 3. 規則2：デッキの上に戻す＋「残さない」→ ホストとブレイヴがデッキの上の隣り合う2枚になる ===")
{
    const s = game("deck-keep-no", true)
    const { host } = combined(s, "p1", HOST, JACK)
    flashOnCombined(s, CHEST, host.instanceId)
    assert(s.pendingChoice?.braveKeep?.cardId === JACK, "「残しますか？」の確認")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "スキップ＝「残さない」")
    const deck = s.players.p1.deck
    assert(deck.length === 42, "デッキは40枚＋ホストとブレイヴの2枚")
    const hi = deck.indexOf(HOST)
    const bi = deck.indexOf(JACK)
    assert(hi !== -1 && bi !== -1, "ホストもブレイヴもデッキにある")
    assert(Math.abs(hi - bi) === 1, "ブレイヴはホストのすぐ隣")
    assert(Math.min(hi, bi) === 0 || Math.max(hi, bi) === deck.length - 1, "2枚はデッキの端（上）に並ぶ")
    assert(!s.players.p1.hand.includes(HOST) && !s.players.p1.trashCards.includes(JACK), "手札にもトラッシュにも無い")
}

console.log("=== 4. 規則3：破壊＋「残さない」→ ホストもブレイヴもトラッシュへ（今までどおり） ===")
{
    const s = game("destroy-keep-no", true)
    const { host } = combined(s, "p1", HOST, JACK)
    flashOnCombined(s, FLAMEGUST, host.instanceId)
    assert(s.pendingChoice?.braveKeep?.cardId === JACK, "「残しますか？」の確認")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "スキップ＝「残さない」")
    assert(s.players.p1.trashCards.includes(HOST) && s.players.p1.trashCards.includes(JACK), "ホストもブレイヴもトラッシュへ")
    assert(s.players.p1.field.spirits.length === 1 && s.players.p1.field.spirits[0]!.cardId === VAN, "場にはアタッカーのロクケラトプスだけ")
    assert(s.players.p1.field.combinedBraves.length === 0, "合体中の置き場は空")
}

console.log("=== 5. 規則5：同じ持ち主の合体スピリット2体が同時に手札に戻る→先に「どのブレイヴから残すか」の確認、選んだブレイヴの「残しますか？」が次 ===")
{
    const s = game("two-combined", true)
    const a = combined(s, "p1", HOST, JACK)
    const b = combined(s, "p1", HOST, HAM)
    s.phase = "main"
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.players.p2.hand = [GLORIA]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "p2がグロリアスを召喚（BP5000以下の相手のスピリットすべてを手札に戻す）")
    const pc0 = s.pendingChoice
    assert(pc0 !== null && pc0.pid === "p1", "持ち主p1に確認が出る")
    const pc1 = pc0!
    const ids1 = [...(pc1.options ?? []), ...(pc1.candidates ?? [])]
    assert(
        (pc1.prompt.includes("ブレイヴ") || pc1.prompt.includes("残す")) && ids1.length >= 2,
        "最初の確認は「どのブレイヴから残すか」を選ぶ確認（2体のブレイヴから）",
    )
    assert(s.players.p1.hand.filter((x) => x === HOST).length === 2, "手順どおりホストは先に手札へ移され、ブレイヴの確認が答え待ち")
    // スターハム側から残す順を選ぶ
    let err: string | null = null
    if (pc1.kind === "target") err = act(s, "p1", { type: "resolveChoice", instanceId: b.brave.instanceId })
    else {
        const opt = (pc1.options ?? []).find((x) => x.includes("スターハム")) ?? (pc1.options ?? [])[0] ?? ""
        err = act(s, "p1", { type: "resolveChoice", option: opt })
    }
    assert(err === null, "残す順のブレイヴにスターハムを選ぶ")
    const pc2 = s.pendingChoice
    assert(pc2 !== null && pc2.braveKeep?.cardId === HAM, "選んだスターハムの「残しますか？」が次に出る")
    assert(act(s, "p1", { type: "resolveChoice", option: "残す" }) === null, "スターハムを残す")
    const pc3 = s.pendingChoice
    assert(pc3 !== null && pc3.braveKeep?.cardId === JACK, "残りのジャッククリの「残しますか？」が出る")
    assert(act(s, "p1", { type: "resolveChoice", option: "残す" }) === null, "ジャッククリも残す")
    assert(s.players.p1.hand.filter((x) => x === HOST).length === 2, "ホスト2体は手札へ")
    const kept = s.players.p1.field.spirits.filter((x) => x.cardId === JACK || x.cardId === HAM)
    assert(kept.length === 2 && kept.every((x) => x.cores === 1), "ブレイヴ2体はコア1個を置いてスピリット状態で場に残る")
    assert(s.players.p1.trashCards.length === 0, "トラッシュには何も行っていない")
}

console.log("=== 6. 規則5の境目：非対話では確認は出ず、リザーブが足りれば両方とも自動で残る ===")
{
    const s = game("two-combined-auto", false)
    combined(s, "p1", HOST, JACK)
    combined(s, "p1", HOST, HAM)
    s.phase = "main"
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.players.p2.hand = [GLORIA]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "p2がグロリアスを召喚")
    assert(s.pendingChoice === null, "非対話では確認は出ない")
    assert(s.players.p1.hand.filter((x) => x === HOST).length === 2, "ホスト2体は手札へ")
    const kept = s.players.p1.field.spirits.filter((x) => x.cardId === JACK || x.cardId === HAM)
    assert(kept.length === 2 && kept.every((x) => x.cores === 1), "リザーブが足りるのでブレイヴ2体は自動で残る")
    assert(s.players.p1.trashCards.length === 0, "トラッシュには何も行っていない")
}

console.log("すべてのチェックに合格しました 🎉（part780）")
