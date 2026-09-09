// smoke パート303（BS13 緑バッチ16枚。docs/design/BS13_PLAN.md §9）
// 新しく足した器 AB〜AG を1つずつ固定する。特に #24（【装甲】等で防げない疲労強制で
// 『疲労時』は誘発しない）と #25（破壊等の離場に伴うコア移動は「コアを取り除けない」に含まれない）を明示的に確認する
import {
    act,
    assert,
    createGame,
    createInstance,
    destroySpirit,
    refreshLevelAsOverrides,
    refreshSpirit,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "green" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.interactiveTargets = true
    return s
}

console.log("=== 器AB：疲労状態での召喚強制（BS13-065八分儀の祠）。#24：『疲労時』は誘発しない ===")
{
    const s = game("ab-summon-exhausted")
    // 八分儀の祠Lv1-2：系統「遊精」/「星魂」を持たないコスト3以下のスピリットカードを召喚するとき、疲労状態で召喚する
    s.players.p1.field.nexuses.push(createInstance("BS13-065", s.turn, 0))
    // 検出役：翼神機グラン・ウォーデンLv2（系統「武装」を持つ**他の**自分のスピリットが疲労したとき、自身を回復させる）。
    // ownSpiritExhausted が誤って発火すればこれが回復してしまう
    const detector = createInstance("BS08-X32", s.turn, 3)
    detector.isRested = true
    s.players.p1.field.spirits.push(detector)
    refreshLevelAsOverrides(s)

    // 神機ミョルニール：コスト2・系統「武装」（遊精/星魂を持たない・コスト3以下）→ 器ABの対象
    s.players.p1.hand[0] = "BS02-039"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "神機ミョルニールを召喚")
    const summoned = s.players.p1.field.spirits.find((sp) => sp.cardId === "BS02-039")!
    assert(summoned.isRested, "疲労状態で召喚された（器AB）")
    assert(detector.isRested, "#24：ownSpiritExhaustedは発火しない（検出役は回復しないまま）")
}

console.log("=== 器AB：条件外（コスト4）は通常どおり回復状態で召喚される ===")
{
    const s = game("ab-summon-normal")
    s.players.p1.field.nexuses.push(createInstance("BS13-065", s.turn, 0))
    refreshLevelAsOverrides(s)
    s.players.p1.hand[0] = "BS13-021" // サイゾロング：コスト4（対象外）
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "コスト4のサイゾロングを召喚")
    const summoned = s.players.p1.field.spirits.find((sp) => sp.cardId === "BS13-021")!
    assert(!summoned.isRested, "コスト条件を満たさないので通常どおり回復状態")
}

console.log("=== 器AC：coresCantBeRemovedAll（BS13-X03白羊樹神セフィロ・アリエスLv3）。両陣営・【転召】以外で取り除けない ===")
{
    const s = game("ac-cores-locked")
    s.players.p1.field.spirits.push(createInstance("BS13-X03", s.turn, 4)) // Lv3
    const enemy = createInstance("BS02-039", s.turn, 2) // 神機ミョルニール：コアの入った適当な相手スピリット
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)

    const coresBefore = enemy.cores
    resolveAction(s, "p1", null, { type: "coreRemove", count: 1, dest: "trash", anySide: true }, enemy.instanceId)
    assert(enemy.cores === coresBefore, "明示的なコア除去は両陣営とも止まる（自分のコストと同じ経路）")

    console.log("  -- #25：破壊に伴うコア移動は止まらない --")
    const reserveBefore = s.players.p2.reserve
    destroySpirit(s, "p2", enemy.instanceId, "destroy")
    assert(s.players.p2.reserve === reserveBefore + coresBefore, "破壊で場を離れるコアの移動は素通しされる（#25）")
}

console.log("=== 器AC：side:opponent + exceptOwnerEffects（BS13-065八分儀の祠Lv2）。持ち主自身の効果は例外で通る ===")
{
    const s = game("ac-except-owner")
    s.players.p1.field.nexuses.push(createInstance("BS13-065", s.turn, 3)) // Lv2
    const target = createInstance("BS02-039", s.turn, 2)
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    s.turnPlayer = "p2" // 065Lv2は『相手のメインステップ』限定＝065の持ち主(p1)から見た相手(p2)のターン中
    s.phase = "main"

    const coresBefore = target.cores
    // p1（065の持ち主から見て自分＝相手の効果）が取り除こうとすると止まる
    resolveAction(s, "p1", null, { type: "coreRemove", count: 1, dest: "trash", anySide: true }, target.instanceId)
    assert(target.cores === coresBefore, "相手（065の持ち主）の効果では取り除けない")
    // target自身の持ち主（p2）の効果は例外で通る
    resolveAction(s, "p2", null, { type: "coreRemove", count: 1, dest: "trash" }, target.instanceId)
    assert(target.cores === coresBefore - 1, "持ち主自身の効果は例外で通る（exceptOwnerEffects）")
}

console.log("=== 器AD：ownSpiritRefreshed（BS13-024武神獣ディアル・ユキムラLv2） ===")
{
    const s = game("ad-refreshed-event")
    const yukimura = createInstance("BS13-024", s.turn, 3) // Lv2
    yukimura.isRested = true
    s.players.p1.field.spirits.push(yukimura)
    const other = createInstance("BS13-017", s.turn, 1)
    other.isRested = true
    s.players.p1.field.spirits.push(other)
    refreshLevelAsOverrides(s)

    refreshSpirit(s, "p1", other)
    assert(!other.isRested, "他のスピリットが回復した")
    assert(!yukimura.isRested, "武神獣ディアル・ユキムラも連鎖して回復する")
}

console.log("=== 器AD：[武神獣ディアル・ユキムラ]自身の回復では連鎖しない（excludeSelfAsEventTarget） ===")
{
    const s = game("ad-exclude-self")
    const yukimura = createInstance("BS13-024", s.turn, 3)
    yukimura.isRested = true
    s.players.p1.field.spirits.push(yukimura)
    const other = createInstance("BS13-017", s.turn, 1)
    other.isRested = true
    s.players.p1.field.spirits.push(other)
    refreshLevelAsOverrides(s)

    refreshSpirit(s, "p1", yukimura)
    assert(!yukimura.isRested, "自身が回復した")
    assert(other.isRested, "自身の回復では他のスピリットに波及しない（無関係の副作用なし）")
}

console.log("=== 器AE：refreshSelf.costReturnOwnSpiritKeyword（BS13-019コロコーン） ===")
{
    const s = game("ae-refresh-cost")
    const kolokon = createInstance("BS13-019", s.turn, 1)
    kolokon.isRested = true
    s.players.p1.field.spirits.push(kolokon)
    const soku = createInstance("BS01-053", s.turn, 1) // リーヴォルフ：【神速】持ち
    s.players.p1.field.spirits.push(soku)
    refreshLevelAsOverrides(s)

    resolveAction(s, "p1", kolokon, { type: "refreshSelf", costReturnOwnSpiritKeyword: "soku" })
    assert(!kolokon.isRested, "コストを払って回復した")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === soku.instanceId), "コストにしたスピリットは手札に戻った")
    assert(s.players.p1.hand.includes("BS01-053"), "手札に戻っている")
}

console.log("=== 器AE：候補がいなければ不発（COST_MODEL.md §1） ===")
{
    const s = game("ae-refresh-nocandidate")
    const kolokon = createInstance("BS13-019", s.turn, 1)
    kolokon.isRested = true
    s.players.p1.field.spirits.push(kolokon)
    refreshLevelAsOverrides(s)

    resolveAction(s, "p1", kolokon, { type: "refreshSelf", costReturnOwnSpiritKeyword: "soku" })
    assert(kolokon.isRested, "【神速】持ちがいないので発動しなかった")
}

console.log("=== 器AF：bpBuff.costExhaustFamily+amountFromExhaustedCost（BS13-024アタック時） ===")
{
    const s = game("af-bpbuff-cost")
    const yukimura = createInstance("BS13-024", s.turn, 1)
    yukimura.isRested = true // アタック宣言で自身も系統「遊精」だが、既に疲労しているので候補から自然に外れる
    s.players.p1.field.spirits.push(yukimura)
    const anaguma = createInstance("BS13-017", s.turn, 1) // 遊精・BP1000
    s.players.p1.field.spirits.push(anaguma)
    refreshLevelAsOverrides(s)

    resolveAction(s, "p1", yukimura, {
        type: "bpBuff",
        amount: 0,
        costExhaustFamily: "遊精",
        amountFromExhaustedCost: true,
    })
    assert(anaguma.isRested, "コストとして疲労した")
    assert(yukimura.tempBpBuff === 1000, "疲労させたスピリットのBPぶんBP+された")
}

console.log("=== 器AF：候補（回復状態の系統一致）がいなければ不発 ===")
{
    const s = game("af-bpbuff-nocandidate")
    const yukimura = createInstance("BS13-024", s.turn, 1)
    yukimura.isRested = true // 自身も系統「遊精」だが疲労済みなので候補にならない＝他に候補が無い
    s.players.p1.field.spirits.push(yukimura)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", yukimura, {
        type: "bpBuff",
        amount: 0,
        costExhaustFamily: "遊精",
        amountFromExhaustedCost: true,
    })
    assert(yukimura.tempBpBuff === 0, "系統「遊精」の候補がいないので発動しなかった")
}

console.log("=== 器AG：refreshSelfBraveThenCombine（BS13-053モクバオー）。回復と合体はセット（#16） ===")
{
    const s = game("ag-combine")
    const mokubao = createInstance("BS13-053", s.turn, 1)
    mokubao.isRested = true
    s.players.p1.field.spirits.push(mokubao)
    const host = createInstance("BS12-019", s.turn, 1) // くノ一ジョロウ：コスト3（合体条件：コスト3以上を満たす）
    s.players.p1.field.spirits.push(host)
    refreshLevelAsOverrides(s)

    resolveAction(s, "p1", mokubao, { type: "refreshSelfBraveThenCombine" }, host.instanceId)
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === mokubao.instanceId), "モクバオーはスピリット状態を離れた（合体した）")
    assert(s.players.p1.field.combinedBraves.some((b) => b.instanceId === mokubao.instanceId), "合体スピリットの一員になった")
    assert(host.braveRefs?.some((r) => r.instanceId === mokubao.instanceId) === true, "くノ一ジョロウに合体した")
    assert(!mokubao.isRested, "合体できたので回復した")
}

console.log("=== 器AG：合体条件を満たさない相手には回復も合体もしない（セット） ===")
{
    const s = game("ag-combine-fail")
    const mokubao = createInstance("BS13-053", s.turn, 1)
    mokubao.isRested = true
    s.players.p1.field.spirits.push(mokubao)
    const host = createInstance("BS13-017", s.turn, 1) // アナグマ・コスケ：コスト0（合体条件コスト3以上を満たさない）
    s.players.p1.field.spirits.push(host)
    refreshLevelAsOverrides(s)

    resolveAction(s, "p1", mokubao, { type: "refreshSelfBraveThenCombine" }, host.instanceId)
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === mokubao.instanceId), "モクバオーはスピリット状態のまま")
    assert(mokubao.isRested, "合体できないので回復もしない（回復と合体はセット）")
}

console.log("=== 器AG：バトルしているブレイヴは対象外 ===")
{
    const s = game("ag-combine-inbattle")
    const mokubao = createInstance("BS13-053", s.turn, 1)
    mokubao.isRested = true
    s.players.p1.field.spirits.push(mokubao)
    const host = createInstance("BS12-019", s.turn, 1)
    s.players.p1.field.spirits.push(host)
    refreshLevelAsOverrides(s)
    s.battle = { attackerInstanceId: mokubao.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }

    resolveAction(s, "p1", mokubao, { type: "refreshSelfBraveThenCombine" }, host.instanceId)
    assert(mokubao.isRested, "バトルしている間は回復も合体もしない")
    assert(!(host.braveRefs && host.braveRefs.length > 0), "合体しなかった")
}

console.log("=== 既存の器で書けるもの：selfBuffPer / coreGainPer（017・020・022の踏襲確認） ===")
{
    const s = game("existing-actions")
    const koske = createInstance("BS13-017", s.turn, 1)
    s.players.p1.field.spirits.push(koske)
    const other = createInstance("BS13-017", s.turn, 1)
    s.players.p1.field.spirits.push(other)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", koske, { type: "selfBuffPer", counter: { ownFamily: "遊精" }, amountPer: 1000 })
    assert(koske.tempBpBuff === 2000, "系統「遊精」2体（自身を含む）ぶんBP+2000（017）")

    const yanoga = createInstance("BS13-022", s.turn, 4) // Lv3
    resolveAction(s, "p1", yanoga, { type: "coreGainPer", counter: "selfLevel" })
    assert(s.players.p1.reserve === 23, "自身のLvと同じ個数のコアをリザーブへ（022：Lv3なら3個。20+3）")
}

console.log("すべてのチェックに合格しました 🎉（part303）")
