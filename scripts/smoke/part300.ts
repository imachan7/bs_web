// smoke パート300（BS13 紫バッチ：新しく足した器）
// S=無色化（色とシンボルを無いものとして扱う。バトル寿命）／V=破壊時効果の借用（借り元自身が発揮・現在Lv限定）／
// X=コア数での絞り込み（両陣営に効く）／Y=ドロー枚数の追加／Z=ライフ減少先の置換／T=不死の系統指定／
// U=不死経由限定の召喚時／trashReturnAtEndStep／costDestroyOwnSpirit（destroy）／countAttackerSymbols（discardOpponent）
import { assert, createGame, createInstance, endTurn, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { instColors, instHasColor, countSymbols, activeConstraints } from "../../shared/rules"
import { clearBattle } from "../../server/src/logic/GameState"
import { fireFieldEventTriggers } from "../../server/src/logic/triggers"
import { fushiCandidates, applyFushiSummon } from "../../server/src/logic/removal"
import { fireSummonSequence } from "../../server/src/logic/EffectModules"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: BS13 紫バッチのカード定義 ===")
{
    assert(getCard("BS13-011").name === "暗殺者ドラゴナーガ", "BS13-011は暗殺者ドラゴナーガ")
    assert(getCard("BS13-052").name === "イビルグライダー", "BS13-052はイビルグライダー")
    assert(getCard("BS13-063").name === "血塗られた魔具", "BS13-063は血塗られた魔具")
    assert(getCard("BS13-064").name === "蛇教徒の宮殿", "BS13-064は蛇教徒の宮殿")
    assert(getCard("BS13-014").name === "闇騎士アグラヴェイン", "BS13-014は闇騎士アグラヴェイン")
    assert(getCard("BS13-015").name === "冥総裁ハーゲン", "BS13-015は冥総裁ハーゲン")
}

console.log("=== S: 無色化（色とシンボルを無いものとして扱う。バトル寿命） ===")
{
    const s = game("s-colorless")
    const p1 = s.players.p1
    const spirit = createInstance("BS13-011", s.turn, 1)
    p1.field.spirits.push(spirit)
    assert(instHasColor(spirit, "purple"), "付与前は紫を持つ")
    assert(countSymbols(p1, ["purple"]) === 1, "付与前はシンボル1つとして軽減に数えられる")

    resolveAction(s, "p1", spirit, { type: "colorlessSelfThisBattle" })
    assert(spirit.colorlessThisBattle === true, "colorlessThisBattleが立った")
    assert(!instHasColor(spirit, "purple"), "無色化後は紫を持たない")
    assert(instColors(spirit).length === 0, "無色化後はinstColorsが空配列")
    assert(countSymbols(p1, ["purple"]) === 0, "無色化後はそのスピリットのシンボルが紫の軽減に使えない（丸ごと飛ぶ）")

    s.battle = { attackerInstanceId: spirit.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    clearBattle(s)
    assert(spirit.colorlessThisBattle === undefined, "clearBattleでcolorlessThisBattleが戻る")
    assert(instHasColor(spirit, "purple"), "バトル終了後は紫の色が戻る")
    assert(countSymbols(p1, ["purple"]) === 1, "バトル終了後はシンボルの軽減も戻る")
}

console.log("=== V: 破壊時効果の借用（借り元自身が発揮。現在Lvで有効なエントリだけが候補） ===")
{
    // BS11-038天星馬ペガシーダ：onDestroy が levels:[2]（e1:draw3）／levels:[1,2]（e2:mill）の2エントリ。
    // Lv1では draw3（e1）は無効なエントリなので候補にならない
    const s = game("v-borrow-lv1")
    const p1 = s.players.p1
    const borrower = createInstance("BS13-052", s.turn, 1)
    p1.field.spirits.push(borrower)
    const lender = createInstance("BS11-038", s.turn, 1) // Lv1固定（維持コア1）
    p1.field.spirits.push(lender)
    refreshLevelAsOverrides(s)
    const handBefore = p1.hand.length
    resolveAction(s, "p1", borrower, { type: "borrowDestroyEffect" })
    assert(p1.hand.length !== handBefore + 3, "Lv1では『破壊時』のdraw3エントリは候補にならない（現在Lvで無効なため）")
    assert(lender.pendingDestruction === undefined, "借り元は破壊されない")
    assert(p1.field.spirits.some((sp) => sp.instanceId === lender.instanceId), "借り元はフィールドに残ったまま")
}
{
    const s = game("v-borrow-lv2")
    const p1 = s.players.p1
    const borrower = createInstance("BS13-052", s.turn, 1)
    p1.field.spirits.push(borrower)
    const lender = createInstance("BS11-038", s.turn, 3) // Lv2（維持コア3）
    p1.field.spirits.push(lender)
    refreshLevelAsOverrides(s)
    const handBefore = p1.hand.length
    resolveAction(s, "p1", borrower, { type: "borrowDestroyEffect" })
    assert(p1.hand.length === handBefore + 3, "Lv2ではdraw3エントリ（先頭のエントリ）が候補に入り発揮する")
    assert(lender.pendingDestruction === undefined, "借り元自身は破壊されない（発揮するのは借り元自身）")
    assert(p1.field.spirits.some((sp) => sp.instanceId === lender.instanceId), "借り元はフィールドに残ったまま")
    assert(lender.cores === 3, "破壊させずに発揮したのでコアもそのまま")
}
{
    // 候補が無いとき：借りるスピリットがいない
    const s = game("v-borrow-none")
    const p1 = s.players.p1
    const borrower = createInstance("BS13-052", s.turn, 1)
    p1.field.spirits.push(borrower)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", borrower, { type: "borrowDestroyEffect" })
    assert(true, "候補が無くても例外を投げない")
}

console.log("=== X: コア数での絞り込み（両陣営に効く。BS13-063血塗られた魔具） ===")
{
    const s = game("x-max-cores")
    const p1 = s.players.p1
    const p2 = s.players.p2
    s.phase = "attack"
    const nexus = createInstance("BS13-063", s.turn, 0)
    p1.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)

    const ownWeak = createInstance("BS13-009", s.turn, 1) // Lv1コア1個（≤2）
    p1.field.spirits.push(ownWeak)
    fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p1", inst: ownWeak })
    assert(!p1.field.spirits.some((sp) => sp.instanceId === ownWeak.instanceId), "自分のスピリットもコア2個以下でアタックすれば破壊される（両陣営に効く）")

    const oppWeak = createInstance("BS13-009", s.turn, 1)
    p2.field.spirits.push(oppWeak)
    fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p2", inst: oppWeak })
    assert(!p2.field.spirits.some((sp) => sp.instanceId === oppWeak.instanceId), "相手のスピリットもコア2個以下でアタックすれば破壊される")

    const strong = createInstance("BS13-009", s.turn, 1)
    strong.cores = 3
    p1.field.spirits.push(strong)
    fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p1", inst: strong })
    assert(p1.field.spirits.some((sp) => sp.instanceId === strong.instanceId), "コア3個以上のスピリットは破壊されない")
}

console.log("=== Y: ドロー枚数の追加（keyword配列でOR。BS13-063 Lv2） ===")
{
    const s = game("y-extra-draw")
    const p1 = s.players.p1
    const jugeki = createInstance("BS13-011", s.turn, 1)
    p1.hand.push(jugeki.cardId)
    const before = p1.deck.length
    resolveAction(s, "p1", null, { type: "costDiscardHandKeywordThenDraw", keyword: ["jugeki", "fushi"], count: 2 })
    assert(p1.deck.length === before - 2, "【呪撃】/【不死】いずれかの手札を破棄してドロー+2できた（OR判定）")
    assert(!p1.hand.includes("BS13-011"), "コストとして手札の該当カードが破棄された")
}

console.log("=== Z: ライフ減少先の置換（constraintGrant + lifeDamageToVoid。BS13-064） ===")
{
    const s = game("z-life-to-void")
    const p1 = s.players.p1
    const nexus = createInstance("BS13-064", s.turn, 0)
    p1.field.nexuses.push(nexus)
    const attackerLv2 = createInstance("BS13-011", s.turn, 3) // 妖蛇/竜人・Lv2
    p1.field.spirits.push(attackerLv2)
    refreshLevelAsOverrides(s)
    assert(
        activeConstraints(s, "p1", attackerLv2).some((c) => c.type === "lifeDamageToVoid"),
        "系統：妖蛇を持つLv2以上の自分のスピリットはlifeDamageToVoidを受け取る",
    )

    const attackerLv1 = createInstance("BS13-011", s.turn, 1) // Lv1なのでminLevel未達
    p1.field.spirits.push(attackerLv1)
    refreshLevelAsOverrides(s)
    assert(
        !activeConstraints(s, "p1", attackerLv1).some((c) => c.type === "lifeDamageToVoid"),
        "Lv1のスピリットにはminLevel:2の制約が付与されない",
    )

    const other = createInstance("BS13-013", s.turn, 3) // 無魔・Lv2（系統：妖蛇を持たない）
    p1.field.spirits.push(other)
    refreshLevelAsOverrides(s)
    assert(
        !activeConstraints(s, "p1", other).some((c) => c.type === "lifeDamageToVoid"),
        "系統：妖蛇を持たないスピリットには付与されない",
    )
}

console.log("=== discardOpponent（countAttackerSymbols）：アタッカーのシンボル数ぶん相手が手札を破棄 ===")
{
    const s = game("discard-attacker-symbols")
    const p1 = s.players.p1
    const p2 = s.players.p2
    const attacker = createInstance("BS13-011", s.turn, 1) // シンボル1つ
    p1.field.spirits.push(attacker)
    p2.hand.push("BS13-009", "BS13-010", "BS13-012")
    const handBefore = p2.hand.length
    resolveAction(s, "p1", null, { type: "discardOpponent", count: 0, countAttackerSymbols: true }, attacker.instanceId)
    assert(p2.hand.length === handBefore - 1, "アタッカーのシンボル数（1つ）ぶん相手の手札が破棄された")
}

console.log("=== trashReturnAtEndStep：自分のエンドステップに手札へ戻る（BS13-015） ===")
{
    const s = game("trash-return-endstep")
    const p1 = s.players.p1
    p1.trashCards.push("BS13-015")
    s.phase = "attack"
    endTurn(s)
    assert(p1.hand.includes("BS13-015"), "自分のエンドステップにトラッシュのBS13-015が手札へ戻った")
    assert(!p1.trashCards.includes("BS13-015"), "トラッシュからは消えた")
}

console.log("=== T: 不死の系統指定（keyword.triggerFamilies。BS13-014） ===")
{
    const s = game("fushi-family")
    const p1 = s.players.p1
    s.phase = "attack"
    p1.trashCards.push("BS13-014")
    p1.reserve = 20
    const snakeFamily = getCard("BS13-011").family // ["妖蛇","竜人"]
    assert(snakeFamily.includes("妖蛇"), "前提: BS13-011は系統「妖蛇」を持つ")
    const candidatesSnake = fushiCandidates(s, "p1", [999], snakeFamily)
    assert(candidatesSnake.includes(0), "系統「妖蛇」を持つスピリットが破壊されたとき、【不死：妖蛇】が候補に入る")
    const candidatesOther = fushiCandidates(s, "p1", [999], ["無魔"])
    assert(!candidatesOther.includes(0), "系統「妖蛇」を持たない破壊では候補に入らない")
}

console.log("=== U: 不死経由限定の召喚時（selfSummonedByFushi。BS13-014） ===")
{
    const s = game("fushi-summon-only")
    const p1 = s.players.p1
    s.phase = "attack"
    p1.trashCards.push("BS13-014")
    p1.trashCards.push("BS13-016") // コスト7（不死の召喚時効果の対象）
    p1.reserve = 20
    applyFushiSummon(s, { pid: "p1", cardId: "BS13-014", trashIndex: 0 })
    assert(p1.field.spirits.some((sp) => sp.cardId === "BS13-014"), "【不死】でBS13-014が召喚された")
    assert(
        p1.field.spirits.some((sp) => sp.cardId === "BS13-016"),
        "【不死】経由の召喚時：条件つき『召喚時』が発揮し、コスト7以上のBS13-016が無償召喚された",
    )
}
{
    const s = game("normal-summon-no-fushi-effect")
    const p1 = s.players.p1
    p1.trashCards.push("BS13-016")
    const inst = createInstance("BS13-014", s.turn, 1)
    p1.field.spirits.push(inst)
    fireSummonSequence(s, "p1", inst, false) // 通常召喚（byFushi=false）
    assert(
        !p1.field.spirits.some((sp) => sp.cardId === "BS13-016"),
        "【不死】経由でない通常の召喚では、条件つき『召喚時』は発揮しない",
    )
}

console.log("=== destroy.costDestroyOwnSpirit（BS13-051ズガネーク）：自分のスピリットを破壊することがコスト ===")
{
    const s = game("destroy-cost-own-spirit")
    const p1 = s.players.p1
    const p2 = s.players.p2
    const sac = createInstance("BS13-009", s.turn, 1)
    p1.field.spirits.push(sac)
    const oppTarget = createInstance("BS13-009", s.turn, 1)
    p2.field.spirits.push(oppTarget)
    resolveAction(s, "p1", null, { type: "destroy", count: 1, chooserIsTarget: true, costDestroyOwnSpirit: true })
    assert(!p1.field.spirits.some((sp) => sp.instanceId === sac.instanceId), "コストとして自分のスピリットが破壊された")
    assert(!p2.field.spirits.some((sp) => sp.instanceId === oppTarget.instanceId), "相手のスピリットも破壊された")
}
{
    // 対象条件を満たす相手のスピリットが1体もいなければコストも払わない（COST_MODEL.md §1）
    const s = game("destroy-cost-own-spirit-no-target")
    const p1 = s.players.p1
    const sac = createInstance("BS13-009", s.turn, 1)
    p1.field.spirits.push(sac)
    resolveAction(s, "p1", null, { type: "destroy", count: 1, chooserIsTarget: true, costDestroyOwnSpirit: true })
    assert(p1.field.spirits.some((sp) => sp.instanceId === sac.instanceId), "相手に対象がいなければ、自分のスピリットも破壊されない（コストも払わない）")
}

console.log("すべてのチェックに合格しました 🎉（part300）")
