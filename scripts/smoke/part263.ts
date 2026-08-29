// smoke パート263（BS10保留分4枚：027若武者ウンピョル／029木星神龍ノブナガード・ゼウシス／
// 086巨星望む大樹／X005R北斗七星龍ジーク・アポロドラゴン。2026-08-28）
//
// 新設した機構:
//   - attachBrave / detachBraveByEffect（server/src/logic/removal.ts）：合体・分離の共通入口。
//     効果による分離は§12.5どおりコアが要らず、ホストの疲労状態を引き継ぐ
//   - アクション detachBrave（combineToChosenSpirit / thenRefreshHost）
//   - summonFromHandFree.repeatWhileChosen（好きなだけ、1枚ずつ合体先を選ばせて繰り返す）
//   - summonFromHandFree.thenDraw（実際に召喚できたときだけ引く）
//   - AuraDef.braveOnly（自分のスピリット状態のブレイヴすべて）
//   - fieldEvent "ownCombinedSpiritBattleEnded"（ネクサスから見た「合体スピリットがバトルしたとき」）
//   - exhaust.countCounter + EffectCounter "ownCombinedSpirits"（自分の合体スピリット1体につき）
//
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・コストを機械検証してから使う。
import { act, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave, detachBraveByEffect, fireFieldEventTriggers, fireTrigger } from "../../server/src/logic/EffectModules"
import { instColors, matchesBraveCondition } from "../../shared/rules"

function base(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS10-027").name === "若武者ウンピョル" && getCard("BS10-027").type === "spirit", "BS10-027は若武者ウンピョル（スピリット）")
    assert(getCard("BS10-029").name === "木星神龍ノブナガード・ゼウシス" && getCard("BS10-029").type === "spirit", "BS10-029は木星神龍ノブナガード・ゼウシス（スピリット）")
    assert(getCard("BS10-086").name === "巨星望む大樹" && getCard("BS10-086").type === "nexus", "BS10-086は巨星望む大樹（ネクサス）")
    assert(getCard("X005R").name === "北斗七星龍ジーク・アポロドラゴン" && getCard("X005R").type === "spirit", "X005Rは北斗七星龍ジーク・アポロドラゴン（スピリット）")
}

const SPIRITS = ALL_CARDS.filter((c) => c.type === "spirit" && c.levels.length > 0)
const BRAVES = ALL_CARDS.filter((c) => c.type === "brave")

// 合体条件を持つブレイヴと、それを満たすホスト（実データから探す。part260と同じ手法）
const combineBrave = BRAVES.find((b) => {
    const cond = b.braveCondition
    const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
    return terms.length > 0
})
assert(combineBrave !== undefined, "テスト前提：合体条件を持つブレイヴが1枚以上ある")
const braveId = combineBrave!.cardId

function findHost(excludeCardId?: string): string {
    for (const c of SPIRITS) {
        if (c.cardId === excludeCardId) continue
        const probe = createInstance(c.cardId, 3, c.levels[0]!.cores)
        const s = base("host-probe", false)
        s.players.p1.field.spirits = [probe]
        refreshLevelAsOverrides(s)
        if (matchesBraveCondition(s, "p1", probe, braveId)) return c.cardId
    }
    throw new Error("合体条件を満たすホストが見つからない")
}
const hostCardId = findHost()
const hostCardId2 = findHost(hostCardId)

// 実際に合体させた状態を作る（attachBraveを使って本物のcombinedBraves参照を張る）
// ⚠️ ホストには**ホストのLv1維持コア＋ブレイヴのLv1維持コア**を載せる。分離時はコアを分け直すので
// （BRAVE.md §12.5。2026-08-29 改定）、ホストのぶんちょうどだと分離した側が維持コア割れで消滅する
function setupCombinedHost(s: GameState, pid: PlayerId, hostId: string, rested: boolean): { host: ReturnType<typeof createInstance>; brave: ReturnType<typeof createInstance> } {
    const host = createInstance(hostId, s.turn, getCard(hostId).levels[0]!.cores + getCard(braveId).levels[0]!.cores)
    const brave = createInstance(braveId, s.turn, 0)
    s.players[pid].field.spirits.push(host)
    attachBrave(s, pid, host, brave)
    host.isRested = rested
    brave.isRested = rested
    return { host, brave }
}

console.log("=== attachBrave/detachBraveByEffect：疲労状態を引き継ぐ ===")
{
    const s = base("detach-rest-inherit", false)
    const { host, brave } = setupCombinedHost(s, "p1", hostCardId, true)
    detachBraveByEffect(s, "p1", host, brave)
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "分離したブレイヴはfield.spiritsへ移る")
    assert(!s.players.p1.field.combinedBraves.some((b) => b.instanceId === brave.instanceId), "combinedBravesからは消える")
    assert(host.braveRefs === undefined, "ホストのbraveRefsも消える")
    assert(brave.isRested === true, "疲労状態のホストから分離すると、ブレイヴも疲労状態を引き継ぐ（ルール改定。BRAVE.md §12.5）")
    // 2026-08-29 改定：コアは合体スピリット上のぶんを**分け直す**（新たに置くのではない）
    assert(brave.cores === getCard(braveId).levels[0]!.cores, "分離したブレイヴにはLv1維持ぶんのコアが移る")
    assert(host.cores === getCard(hostCardId).levels[0]!.cores, "移したぶんだけホストのコアが減る")
    assert(host.cores + brave.cores === getCard(hostCardId).levels[0]!.cores + getCard(braveId).levels[0]!.cores, "コアの総数は変わらない")
}

console.log("=== BS10-027：合体スピリットが無ければ何も起きない ===")
{
    const s = base("027-none", false)
    const spirit = createInstance("BS10-027", s.turn, getCard("BS10-027").levels[0]!.cores)
    s.players.p1.field.spirits.push(spirit)
    fireTrigger(s, "p1", spirit, "onBattleEnd")
    assert(s.log[s.log.length - 1]?.includes("対象がいなかった") === true, "対象がいないとログに残る")
}

console.log("=== BS10-027：非対話では分離し、合体先は選ばずスピリット状態のままにする ===")
{
    const s = base("027-noninteractive", false)
    const spirit = createInstance("BS10-027", s.turn, getCard("BS10-027").levels[0]!.cores)
    s.players.p1.field.spirits.push(spirit)
    const { host, brave } = setupCombinedHost(s, "p1", hostCardId, false)
    fireTrigger(s, "p1", spirit, "onBattleEnd")
    assert(host.braveRefs === undefined, "分離してホストの参照が外れる")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "ブレイヴはスピリット状態で場に残る")
    assert(s.players.p1.field.combinedBraves.length === 0, "非対話では合体先を選ばせず終える（bravesOnly非対話フォールバックと同じ簡略化）")
}

console.log("=== BS10-027：対話では合体スピリット候補2体からホストを選ばせる ===")
{
    const s = base("027-choose-host", true)
    const spirit = createInstance("BS10-027", s.turn, getCard("BS10-027").levels[0]!.cores)
    s.players.p1.field.spirits.push(spirit)
    const combo1 = setupCombinedHost(s, "p1", hostCardId, false)
    const combo2 = setupCombinedHost(s, "p1", hostCardId2, false)
    fireTrigger(s, "p1", spirit, "onBattleEnd")
    assert(s.pendingChoice !== null && s.pendingChoice.kind === "target", "分離元ホストを選ぶ選択待ちが立つ")
    assert(
        (s.pendingChoice?.candidates ?? []).length === 2 &&
            (s.pendingChoice?.candidates ?? []).includes(combo1.host.instanceId) &&
            (s.pendingChoice?.candidates ?? []).includes(combo2.host.instanceId),
        "候補は合体スピリット2体すべて",
    )
    assert(act(s, "p1", { type: "resolveChoice", instanceId: combo1.host.instanceId }) === null, "ホストを選べる")
    // コアの分け直し（§12.5。2026-08-29 改定）の選択が続く
    assert(s.pendingChoice?.kind === "option" && s.pendingChoice.stepper === true, "ブレイヴに載せるコアの数を増減式で選ばせる")
    assert(act(s, "p1", { type: "resolveChoice", option: String(getCard(braveId).levels[0]!.cores) }) === null, "分けるコア数を選べる")
    assert(combo1.host.braveRefs === undefined, "選んだホストから分離する")
    assert((combo2.host.braveRefs ?? []).length === 1, "選ばなかったホストは合体したまま")
}

console.log("=== BS10-027：対話では分離後「自分のスピリット1体に合体できる」を選ばせる（再合体） ===")
{
    const s = base("027-recombine", true)
    const spirit = createInstance("BS10-027", s.turn, getCard("BS10-027").levels[0]!.cores)
    s.players.p1.field.spirits.push(spirit)
    const { host, brave } = setupCombinedHost(s, "p1", hostCardId, false)
    const newHost = createInstance(hostCardId2, s.turn, getCard(hostCardId2).levels[0]!.cores)
    s.players.p1.field.spirits.push(newHost)
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", spirit, "onBattleEnd")
    // 候補は元のホストが1体だけなので自動解決され、まずコアの分け方の選択が立つ
    assert(s.pendingChoice?.kind === "option", "先にコアの分け方を選ばせる")
    assert(act(s, "p1", { type: "resolveChoice", option: String(getCard(braveId).levels[0]!.cores) }) === null, "分けるコア数を選べる")
    // 続けて合体先選択の選択待ちが立つ
    assert(s.pendingChoice !== null && s.pendingChoice.kind === "target", "合体先を選ぶ選択待ちが立つ")
    assert((s.pendingChoice?.candidates ?? []).includes(newHost.instanceId), "新しいホストが合体先候補に出る")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: newHost.instanceId }) === null, "合体先を選べる")
    assert((newHost.braveRefs ?? []).some((r) => r.instanceId === brave.instanceId), "新しいホストへ再合体した")
    assert(
        s.players.p1.field.combinedBraves.some((b) => b.instanceId === brave.instanceId),
        "combinedBravesへ戻る",
    )
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "field.spiritsからは抜ける")
    void host
}

console.log("=== BS10-029 Lv1『召喚時』：非対話では手札のブレイヴを候補が尽きるまですべて召喚する ===")
{
    const s = base("029-repeat-noninteractive", false)
    const spirit = createInstance("BS10-029", s.turn, getCard("BS10-029").levels[0]!.cores)
    s.players.p1.field.spirits.push(spirit)
    const brave2 = BRAVES.find((b) => b.cardId !== braveId)
    assert(brave2 !== undefined, "テスト前提：ブレイヴが2種類以上ある")
    s.players.p1.hand = [braveId, brave2!.cardId]
    fireTrigger(s, "p1", spirit, "onSummon")
    assert(s.players.p1.hand.length === 0, "手札のブレイヴはすべて召喚される")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === braveId), "1枚目が場に出る")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === brave2!.cardId), "2枚目も場に出る")
    assert(s.players.p1.field.combinedBraves.length === 0, "非対話では合体先を選ばせずスピリット状態で出す")
}

console.log("=== BS10-029 Lv1『召喚時』：対話では発動確認→1枚ずつ選ばせ、選ばなくなったら終わる ===")
{
    const s = base("029-repeat-interactive", true)
    const spirit = createInstance("BS10-029", s.turn, getCard("BS10-029").levels[0]!.cores)
    s.players.p1.field.spirits.push(spirit)
    const brave2 = BRAVES.find((b) => b.cardId !== braveId)!
    s.players.p1.hand = [braveId, brave2.cardId]
    fireTrigger(s, "p1", spirit, "onSummon")
    assert(s.pendingChoice?.confirm === true, "「できる」の発動確認が先に出る")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動する")
    assert(s.pendingChoice !== null && s.pendingChoice.kind === "card", "1枚目を選ぶ選択待ちが立つ")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, "1枚目を選ぶ")
    // 合体候補があれば選択待ちが挟まる。スキップして単体召喚にする
    if (s.pendingChoice?.kind === "target") {
        assert(act(s, "p1", { type: "resolveChoice" }) === null, "合体先はスキップ（単体召喚）")
    }
    assert(s.pendingChoice !== null && s.pendingChoice.kind === "card", "続けて2枚目を選ぶ選択待ちが立つ")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, "2枚目を選ぶ")
    if (s.pendingChoice?.kind === "target") {
        assert(act(s, "p1", { type: "resolveChoice" }) === null, "合体先はスキップ（単体召喚）")
    }
    assert(s.pendingChoice === null, "手札のブレイヴが尽きたので選択待ちは立たない")
    assert(s.players.p1.hand.length === 0, "2枚とも召喚される")
}

console.log("=== BS10-029 Lv2-3【合体時】『合体アタック時』：合体スピリット1体につき相手を疲労させる ===")
{
    const s = base("029-attack-exhaust", false)
    const host = createInstance("BS10-029", s.turn, getCard("BS10-029").levels[1]!.cores) // Lv2
    s.players.p1.field.spirits.push(host)
    host.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }] // 合体スピリット扱いにする簡略化（instIsCombined）
    refreshLevelAsOverrides(s)
    // ⚠️ 合体スピリットが1体だけだと、countCounterが効いていなくてもデータのcount:1で1体疲労してしまい、
    // 「1体につき」が効いているかを検出できない。**2体にして初めて検査になる**（2026-08-28）
    const host2 = createInstance(hostCardId, s.turn, getCard(hostCardId).levels[0]!.cores)
    s.players.p1.field.spirits.push(host2)
    host2.braveRefs = [{ slot: "single", instanceId: "dummy-brave-2" }]
    refreshLevelAsOverrides(s)
    const enemy1 = createInstance("BS02-014", s.turn, 1)
    const enemy2 = createInstance("BS02-014", s.turn, 1)
    const enemy3 = createInstance("BS02-014", s.turn, 1)
    s.players.p2.field.spirits.push(enemy1, enemy2, enemy3)
    fireTrigger(s, "p1", host, "onAttack")
    const restedCount = s.players.p2.field.spirits.filter((sp) => sp.isRested).length
    assert(restedCount === 2, `自分の合体スピリット2体につき2体を疲労させる（実際: ${String(restedCount)}）`)
}

console.log("=== BS10-029 Lv1（未合体）では『合体アタック時』は発揮しない（whileCombined） ===")
{
    const s = base("029-attack-notcombined", false)
    const host = createInstance("BS10-029", s.turn, getCard("BS10-029").levels[0]!.cores) // Lv1
    s.players.p1.field.spirits.push(host)
    const enemy = createInstance("BS02-014", s.turn, 1)
    s.players.p2.field.spirits.push(enemy)
    fireTrigger(s, "p1", host, "onAttack")
    assert(!enemy.isRested, "合体していなければ発揮しない")
}

console.log("=== BS10-086 Lv1：自分のスピリット状態のブレイヴすべてをBP+2000（アタックステップ限定） ===")
{
    const s = base("086-aura", false)
    const nexus = createInstance("BS10-086", s.turn, 0) // Lv1
    s.players.p1.field.nexuses.push(nexus)
    const standaloneBrave = createInstance(braveId, s.turn, getCard(braveId).levels[0]!.cores)
    s.players.p1.field.spirits.push(standaloneBrave)
    const ordinarySpirit = createInstance(hostCardId, s.turn, getCard(hostCardId).levels[0]!.cores)
    s.players.p1.field.spirits.push(ordinarySpirit)
    refreshLevelAsOverrides(s)
    const baseBp = getCard(braveId).levels[0]!.bp
    const ordinaryBp = getCard(hostCardId).levels[0]!.bp
    s.phase = "main"
    assert(
        effectiveBp(s, "p1", standaloneBrave) === baseBp,
        "メインステップでは発揮しない（お互いのアタックステップ限定）",
    )
    s.phase = "attack"
    assert(
        effectiveBp(s, "p1", standaloneBrave) === baseBp + 2000,
        `アタックステップではスピリット状態のブレイヴがBP+2000される（実際: ${String(effectiveBp(s, "p1", standaloneBrave))}）`,
    )
    assert(
        effectiveBp(s, "p1", ordinarySpirit) === ordinaryBp,
        "ブレイヴでない自分のスピリットには効かない",
    )
}

console.log("=== BS10-086 Lv1：合体中のブレイヴ（スピリット状態でない）には効かない ===")
{
    const s = base("086-aura-combined-excluded", false)
    const nexus = createInstance("BS10-086", s.turn, 0)
    s.players.p1.field.nexuses.push(nexus)
    const { host } = setupCombinedHost(s, "p1", hostCardId, false)
    s.phase = "attack"
    refreshLevelAsOverrides(s)
    // 期待値はホストの素のBP＋ブレイヴの「合体時BP+」だけ（086の+2000は乗らない）。
    // 合体スピリットは field.spirits には見えないため、086のBP+2000は乗せようがないことを、
    // 「アタックステップに切り替えても値が変わらない」ことで確認する
    const combinedBpBeforePhase = effectiveBp(s, "p1", host)
    s.phase = "main"
    const combinedBpOtherPhase = effectiveBp(s, "p1", host)
    assert(
        combinedBpBeforePhase === combinedBpOtherPhase,
        "合体中はスピリット状態でないので、アタックステップに切り替えても巨星望む大樹の+2000は乗らない（BPが変わらない）",
    )
}

console.log("=== BS10-086 Lv2：合体スピリットがバトル終了時、分離することでそのホストを回復させる（非対話） ===")
{
    const s = base("086-refresh-noninteractive", false)
    const nexus = createInstance("BS10-086", s.turn, getCard("BS10-086").levels[1]!.cores) // Lv2
    s.players.p1.field.nexuses.push(nexus)
    const { host, brave } = setupCombinedHost(s, "p1", hostCardId, true) // 疲労状態でバトルに出た体で作る
    s.phase = "attack"
    fireFieldEventTriggers(s, "p1", "ownCombinedSpiritBattleEnded", { pid: "p1", inst: host }, instColors(host), host.instanceId)
    assert(host.braveRefs === undefined, "分離してホストの参照が外れる")
    assert(host.isRested === false, "分離することでホスト（そのスピリット）は回復する")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "分離したブレイヴはスピリット状態で残る")
    assert(brave.isRested === true, "分離して出てきたブレイヴ自身は回復しない（BRAVE.md §12.7：「そのスピリット」はホスト1体だけ）")
}

console.log("=== BS10-086 Lv2：実際のアタック→バトル終了から誘発する（発火経路の検査） ===")
{
    // ⚠️ 上のケースは fireFieldEventTriggers を直接呼んでおり、**GameEngine が実際にこの
    // フィールドイベントを発火しているか**は見ていない。「データは正しいのに実戦で呼ばれない」は
    // 2026-08-28 にネクサスの『配置時』で実際に起きた形なので、実アタック経由でも1本通す。
    // **ブロックさせるのが要点**：ブロックされなかったアタックはバトルにならないので、
    // 『バトル終了時』もこのフィールドイベントも発火しない（効果文も「バトルしたとき」）
    const s = base("086-refresh-realbattle", false)
    const nexus = createInstance("BS10-086", s.turn, getCard("BS10-086").levels[1]!.cores) // Lv2
    s.players.p1.field.nexuses.push(nexus)
    const { host, brave } = setupCombinedHost(s, "p1", hostCardId, false)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    assert(host.isRested, "アタック宣言で疲労する")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    const blocker = createInstance("BS02-014", s.turn, 1)
    s.players.p2.field.spirits.push(blocker)
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ブロックする")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後フラッシュで防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後フラッシュで攻撃側パス")
    assert(host.braveRefs === undefined, "バトル終了時に分離する")
    assert(!host.isRested, "分離することでホストが回復する")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "分離したブレイヴはスピリット状態で残る")
}

console.log("=== BS10-086 Lv2：対話では発動確認を出す（「〜することで〜する」＝任意発揮） ===")
{
    const s = base("086-refresh-interactive", true)
    const nexus = createInstance("BS10-086", s.turn, getCard("BS10-086").levels[1]!.cores)
    s.players.p1.field.nexuses.push(nexus)
    const { host } = setupCombinedHost(s, "p1", hostCardId, true)
    s.phase = "attack"
    fireFieldEventTriggers(s, "p1", "ownCombinedSpiritBattleEnded", { pid: "p1", inst: host }, instColors(host), host.instanceId)
    assert(s.pendingChoice?.confirm === true, "任意発揮なので発動確認が出る")
    assert((host.braveRefs ?? []).length === 1, "確認前はまだ分離していない")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動する")
    assert(s.pendingChoice?.kind === "option", "発動を選ぶとコアの分け方の選択が続く")
    assert(act(s, "p1", { type: "resolveChoice", option: String(getCard(braveId).levels[0]!.cores) }) === null, "分けるコア数を選べる")
    assert(host.braveRefs === undefined, "確認後に分離する")
    assert(host.isRested === false, "確認後にホストが回復する")
}

console.log("=== BS10-086 Lv1では『バトルしたとき』は発揮しない ===")
{
    const s = base("086-refresh-lv1", false)
    const nexus = createInstance("BS10-086", s.turn, 0) // Lv1
    s.players.p1.field.nexuses.push(nexus)
    const { host } = setupCombinedHost(s, "p1", hostCardId, true)
    s.phase = "attack"
    fireFieldEventTriggers(s, "p1", "ownCombinedSpiritBattleEnded", { pid: "p1", inst: host }, instColors(host), host.instanceId)
    assert((host.braveRefs ?? []).length === 1, "Lv1では発揮しないので分離しない")
}

console.log("=== X005R Lv1『召喚時』：ブレイヴを実際に召喚できたときだけドローする ===")
{
    const s = base("x005r-thendraw", false)
    const spirit = createInstance("X005R", s.turn, getCard("X005R").levels[0]!.cores)
    s.players.p1.field.spirits.push(spirit)
    s.players.p1.hand = [braveId]
    s.players.p1.deck = ["BS01-001", ...s.players.p1.deck]
    const deckLenBefore = s.players.p1.deck.length
    fireTrigger(s, "p1", spirit, "onSummon")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === braveId), "ブレイヴが場に出る")
    assert(s.players.p1.deck.length === deckLenBefore - 1, "召喚できたのでデッキから1枚引く")
}

console.log("=== X005R：召喚できなかった（リザーブ不足）ときは引かない ===")
{
    const s = base("x005r-thendraw-fail", false)
    const spirit = createInstance("X005R", s.turn, getCard("X005R").levels[0]!.cores)
    s.players.p1.field.spirits.push(spirit)
    s.players.p1.hand = [braveId]
    s.players.p1.reserve = 0
    const deckLenBefore = s.players.p1.deck.length
    fireTrigger(s, "p1", spirit, "onSummon")
    assert(s.players.p1.hand.length === 1, "維持コアが払えず召喚できない")
    assert(s.players.p1.deck.length === deckLenBefore, "召喚できなかったので引かない")
}

console.log("=== X005R Lv3【合体時】『アタック時』：BPを比べ相手のスピリットだけを破壊したとき、もう1体を破壊する ===")
{
    const s = base("x005r-battlewin-destroy", false)
    const host = createInstance("X005R", s.turn, getCard("X005R").levels[2]!.cores) // Lv3
    s.players.p1.field.spirits.push(host)
    host.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }] // 合体スピリット扱いにする簡略化
    refreshLevelAsOverrides(s)
    const victim = createInstance("BS02-014", s.turn, 1)
    s.players.p2.field.spirits.push(victim)
    fireTrigger(s, "p1", host, "onBattleWin", "attacker")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === victim.instanceId), "勝利時に相手のスピリット1体を破壊する")
}

console.log("=== X005R：ブロッカーとして勝ってもwhileCombinedなしでは発揮しない（battleRole限定） ===")
{
    const s = base("x005r-battlewin-blocker", false)
    const host = createInstance("X005R", s.turn, getCard("X005R").levels[2]!.cores)
    s.players.p1.field.spirits.push(host)
    host.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }]
    refreshLevelAsOverrides(s)
    const victim = createInstance("BS02-014", s.turn, 1)
    s.players.p2.field.spirits.push(victim)
    fireTrigger(s, "p1", host, "onBattleWin", "blocker")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === victim.instanceId), "ブロッカーとして勝っても発揮しない（battleRole:attacker限定）")
}
