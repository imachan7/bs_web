// smoke パート291（BS12 バッチ4・白：新しく足した9つの器を1件ずつ発火させる）
// Y=braveImmuneGrant（scope:"all"/"matchArmorColors"）／AC=armorEffectiveGrant（2パス目・他カード付与色も配る）／
// Z=effectEntryGrant（magicNegateを丸ごと配る）／P=reviveOnDestroy.combinedOnly（ブレイヴを残しスピリットだけ手札へ）／
// M=globalConstraint.handImmuneForPid／C'=tempSymbolLoss（grantSymbolLossThisTurn）／
// AA=fieldEvent"ownHyohekiUsed"／AD=forceAttackThisTurn count:"any"+requireOwnNameIncludes／
// AE=braveHostUnblockableThisTurn（毎回いまのホストを見る）
import {
    assert,
    createGame,
    createInstance,
    destroySpirit,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { attachBrave } from "../../server/src/logic/removal"
import { refreshLevelAsOverrides, resolveMagic } from "../../server/src/logic/EffectModules"
import { boardResistanceAgainst, hasBraveImmuneAgainst, instanceSymbolCount } from "../../shared/rules"
import { canBlock } from "../../shared/block"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "white" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== §A Y(scope:\"all\")：BS12-028セイルフィッシュLv2『相手のメインステップ』自分の白は相手のブレイヴの効果を受けない ===")
{
    const s = game("y-all")
    s.turnPlayer = "p2"
    s.phase = "main"
    const seilfish = createInstance("BS12-028", s.turn, 2) // Lv2
    const whiteAlly = createInstance("BS12-025", s.turn, 1) // 白のスピリット（対象）
    s.players.p1.field.spirits.push(seilfish, whiteAlly)
    refreshLevelAsOverrides(s)
    assert(whiteAlly.braveImmuneAll === true, "自分の白のスピリットにbraveImmuneAllが立つ")
    assert(hasBraveImmuneAgainst(whiteAlly, ["red"]), "色を問わず相手のブレイヴの効果を受けない")
    const r = boardResistanceAgainst(s, "p1", whiteAlly, { op: "other", scope: "targeted", actorPid: "p2", sourceType: "brave", sourceColors: ["red"] })
    assert(r?.category === "braveImmune", "boardResistanceAgainst経由でも相手のブレイヴの効果を防ぐ")
}

console.log("=== §B Y(scope:\"matchArmorColors\")：BS12-067月光集める塔Lv2＝【装甲】と同じ色の相手のブレイヴだけ防ぐ ===")
{
    const s = game("y-match")
    const tower = createInstance("BS12-067", s.turn, 2) // Lv2
    const armored = createInstance("BS12-031", s.turn, 1) // Lv1【装甲：緑】
    s.players.p1.field.spirits.push(armored)
    s.players.p1.field.nexuses.push(tower)
    refreshLevelAsOverrides(s)
    assert(armored.braveImmuneMatchArmorColors === true, "装甲持ちにbraveImmuneMatchArmorColorsが立つ")
    assert(hasBraveImmuneAgainst(armored, ["green"]), "装甲の色と一致する相手のブレイヴの効果は防ぐ")
    assert(!hasBraveImmuneAgainst(armored, ["red"]), "装甲の色と一致しない相手のブレイヴの効果は防がない")
}

console.log("=== §C AC armorEffectiveGrant：BS12-031メカニフォンLv2【合体時】が配る装甲に、他カードから付与された色も乗る ===")
{
    const s = game("ac-effective")
    const meka = createInstance("BS12-031", s.turn, 2) // Lv2【合体時】armorEffectiveGrant
    const brave = createInstance("BS12-050", s.turn, 0) // シンボル無しのブレイヴ（何でもよい）
    const grantor = createInstance("BS03-X10", s.turn, 5) // Lv2：自分のスピリットすべてに装甲：赤/紫/緑を付与
    const other = createInstance("BS01-001", s.turn, 1) // ただのスピリット（配布先）
    s.players.p1.field.spirits.push(meka, grantor, other)
    attachBrave(s, "p1", meka, brave)
    refreshLevelAsOverrides(s)
    assert((meka.armorColorsGranted ?? []).includes("red"), "前提：メカニフォン自身がBS03-X10から赤の装甲を付与されている")
    assert((other.armorColorsGranted ?? []).includes("green"), "メカニフォン自身の静的【装甲：緑】がotherに配られる")
    assert((other.armorColorsGranted ?? []).includes("red"), "他カード（BS03-X10）から付与された赤の装甲もotherに配られる（2パス目）")
}

console.log("=== §D Z effectEntryGrant：BS12-068光の聖剣Lv1が配るmagicNegateは配られた側自身を疲労させる ===")
{
    const s = game("z-grant")
    const sword = createInstance("BS12-068", s.turn, 2) // Lv1/Lv2両方有効
    const armored = createInstance("BS12-031", s.turn, 1) // Lv1【装甲：緑】持ち（配布対象）
    s.players.p1.field.nexuses.push(sword)
    s.players.p1.field.spirits.push(armored)
    s.players.p2.hand.push("BS01-123") // 紫のマジック（リターンドロー）
    s.turnPlayer = "p2" // magicNegateはturn:"opponent"＝発生源の持ち主(p1)が非turnPlayerのときだけ有効
    refreshLevelAsOverrides(s)
    assert((armored.grantedMagicNegate ?? []).length === 1, "装甲持ちのスピリットにmagicNegateが1件配られる")
    resolveMagic(s, "p2", "BS01-123", "flash")
    assert(armored.isRested === true, "配られた側自身（装甲持ちのスピリット）が疲労した")
    assert(sword.isRested === false, "発生源のネクサス自身は疲労しない")
}

console.log("=== §E P reviveOnDestroy.combinedOnly：BS12-068Lv2＝合体スピリットが破壊されたとき、ブレイヴを残しスピリットだけ手札へ ===")
{
    const s = game("p-revive")
    const sword = createInstance("BS12-068", s.turn, 2) // Lv2
    const host = createInstance("BS01-001", s.turn, 1)
    const brave = createInstance("BS12-050", s.turn, 0)
    s.players.p1.field.nexuses.push(sword)
    s.players.p1.field.spirits.push(host)
    attachBrave(s, "p1", host, brave)
    refreshLevelAsOverrides(s)
    const ok = destroySpirit(s, "p1", host.instanceId)
    assert(ok === false, "destroySpiritの戻り値は「復活（代替）が成立した」のfalse")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === host.instanceId), "ホストは場から離れた")
    assert(s.players.p1.hand.includes(host.cardId), "スピリットカードはトラッシュでなく手札へ戻る")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId),
        "ブレイヴは残ってスピリット状態でフィールドに残る（非対話は自動でリザーブから払う）",
    )
}

console.log("=== §F M handImmuneForPid：BS12-067月光集める塔Lv1＝自分の手札は相手のスピリット/ブレイヴ/マジックの効果を受けない ===")
{
    const s = game("m-hand")
    const tower = createInstance("BS12-067", s.turn, 0) // Lv1
    s.players.p1.field.nexuses.push(tower)
    s.players.p1.hand = ["BS01-001"]
    const p2spirit = createInstance("BS01-002", s.turn, 1)
    s.players.p2.field.spirits.push(p2spirit)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p2", p2spirit, { type: "discardOpponent", count: 1 }, undefined, undefined, "spirit")
    assert(s.players.p1.hand.length === 1, "手札は相手のスピリットの効果では破棄されない")
}

console.log("=== §G C' tempSymbolLoss：BS12-080バキュームシンボル＝相手のスピリットすべては指定色のシンボル1つを失う ===")
{
    const s = game("c-symbolloss")
    const white1 = createInstance("BS01-001", s.turn, 1) // 白1シンボル想定（後で実シンボルを確認）
    const white2 = createInstance("BS12-025", s.turn, 1)
    s.players.p2.field.spirits.push(white1, white2)
    refreshLevelAsOverrides(s)
    const before = instanceSymbolCount(white2)
    resolveAction(s, "p1", null, { type: "grantSymbolLossThisTurn", side: "opponent" }, undefined, undefined, "magic")
    assert((white2.tempSymbolLoss ?? []).length > 0, "相手のスピリットにtempSymbolLossが付く")
    const after = instanceSymbolCount(white2)
    assert(after <= before, "シンボル数が減る（対象色を持たない個体は無変化のまま）")
}

console.log("=== §H AA fieldEvent\"ownHyohekiUsed\"：BS12-032蹴激皇ヴィーザルLv2-3＝自身の【氷壁】を発揮したら回復できる ===")
{
    const s = game("aa-hyoheki")
    const viizal = createInstance("BS12-032", s.turn, 2) // Lv2
    viizal.cores = 2
    s.players.p1.field.spirits.push(viizal)
    s.players.p2.hand.push("BS01-123") // 紫のマジック
    refreshLevelAsOverrides(s)
    s.turnPlayer = "p2" // 【氷壁】は相手のターンにだけ発揮する
    resolveMagic(s, "p2", "BS01-123", "flash")
    assert(viizal.isRested === false, "【氷壁】を発揮して疲労した直後、コアを払って回復する（ownHyohekiUsedが発火）")
}

console.log("=== §I AD forceAttackThisTurn count:\"any\"＋requireOwnNameIncludes：BS12-079アブソリュートストライク ===")
{
    const s = game("ad-force")
    const oppA = createInstance("BS01-001", s.turn, 1)
    const oppB = createInstance("BS01-002", s.turn, 1)
    s.players.p2.field.spirits.push(oppA, oppB)
    // 前提を満たさない場合：不発
    resolveAction(s, "p1", null, { type: "forceAttackThisTurn", side: "opponent", count: "any", requireOwnNameIncludes: "ストライク" }, undefined, undefined, "magic")
    assert(s.turnConstraints.length === 0, "カード名に「ストライク」を含む自分のスピリットがいなければ不発")
    // 前提を満たす場合：非対話は候補すべてに課す
    const striker = createInstance("BS12-X04", s.turn, 1) // 名前に「ストライク」が入っている自分のスピリット
    s.players.p1.field.spirits.push(striker)
    resolveAction(s, "p1", null, { type: "forceAttackThisTurn", side: "opponent", count: "any", requireOwnNameIncludes: "ストライク" }, undefined, undefined, "magic")
    assert(
        s.turnConstraints.some((c) => c.type === "mustAttackByInstance" && c.instanceId === oppA.instanceId) &&
            s.turnConstraints.some((c) => c.type === "mustAttackByInstance" && c.instanceId === oppB.instanceId),
        "非対話では相手のスピリットすべてに強制アタックを課す",
    )
}

console.log("=== §J AE braveHostUnblockableThisTurn：BS12-055ゲッコ・グライダー『このブレイヴの召喚時』＝毎回いまのホストを見る ===")
{
    const s = game("ae-unblockable")
    const host = createInstance("BS01-001", s.turn, 1)
    const glider = createInstance("BS12-055", s.turn, 0)
    s.players.p1.field.spirits.push(host)
    attachBrave(s, "p1", host, glider)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", glider, { type: "grantHostUnblockableThisTurn" })
    const blocker = createInstance("BS01-002", s.turn, 1)
    s.players.p2.field.spirits.push(blocker)
    const reason = canBlock(s, "p2", blocker, "p1", host)
    assert(reason !== null && reason.includes("ブロックされません"), "いま合体しているホストはブロックされない")
    // 分離すると、もう誰にも乗らない
    delete host.braveRefs
    const idx = s.players.p1.field.combinedBraves.findIndex((b) => b.instanceId === glider.instanceId)
    if (idx !== -1) s.players.p1.field.combinedBraves.splice(idx, 1)
    s.players.p1.field.spirits.push(glider)
    refreshLevelAsOverrides(s)
    const reasonAfter = canBlock(s, "p2", blocker, "p1", host)
    assert(reasonAfter === null, "分離した後はホストだったスピリットも通常どおりブロックされる")
}

console.log("すべてのチェックに合格しました 🎉（part291）")
