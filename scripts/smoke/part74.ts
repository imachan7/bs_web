// smoke パート74（★「場に出ているのに一度も発火していない効果」の回帰・BS05 分担）
//
// `npm run coverage:effects` の ★ リスト＝**カードは smoke に登場するのに、その効果エントリだけ
// 一度も適用されていない**層。BS05 の16件を、実際にその効果が発揮される状況（召喚・アタック・
// バトル・ステップ進行・ネクサス破壊）を作って通す。resolveAction への手組みは使わない。
import {
    act,
    assert,
    createGame,
    createInstance,
    destroyNexus,
    effectiveBp,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
    hasArmorAgainst,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function setupMain(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst.instanceId
}

function spiritOf(s: GameState, pid: PlayerId, instanceId: string) {
    return s.players[pid].field.spirits.find((sp) => sp.instanceId === instanceId)
}

// 実際の summon アクション経由で召喚する（onSummon誘発の実経路を通すため）。
// hand を丸ごと置き換え、handIndex を指定して召喚する
function summonAt(s: GameState, pid: PlayerId, hand: string[], index: number, level?: number): string | null {
    s.players[pid].hand = hand
    const before = new Set(s.players[pid].field.spirits.map((sp) => sp.instanceId))
    const err = act(
        s,
        pid,
        level === undefined ? { type: "summon", handIndex: index } : { type: "summon", handIndex: index, level },
    )
    if (err !== null) return null
    return s.players[pid].field.spirits.find((sp) => !before.has(sp.instanceId))?.instanceId ?? null
}

console.log("=== BS05-027 双剣虎ジェン・フー（召喚時：コア1個の両陣営スピリットを疲労／アタック時：神速ぶんBP+） ===")
{
    // e1: onSummon exhaustAll side both filter{cores:1, excludeSelf:true}
    const s = setupMain("jenfu-e1")
    const oneCoreOwn = put(s, "p1", "BS01-001", 1) // ゴラドン コア1個
    const threeCoreOwn = put(s, "p1", "BS01-018", 5) // リザードマン コア5個（対象外）
    const oneCoreOpp = put(s, "p2", "BS01-002", 1) // ロクケラトプス コア1個
    const threeCoreOpp = put(s, "p2", "BS01-018", 5)
    const jenfuId = summonAt(s, "p1", ["BS05-027"], 0)
    assert(jenfuId !== null, "ジェン・フーを召喚できる")
    assert(spiritOf(s, "p1", oneCoreOwn)?.isRested === true, "自分のコア1個スピリットが疲労する")
    assert(spiritOf(s, "p1", threeCoreOwn)?.isRested === false, "コア1個でない自分のスピリットは対象外")
    assert(spiritOf(s, "p2", oneCoreOpp)?.isRested === true, "相手のコア1個スピリットも疲労する（sideがboth）")
    assert(spiritOf(s, "p2", threeCoreOpp)?.isRested === false, "コア1個でない相手スピリットは対象外")
    assert(
        jenfuId !== null && spiritOf(s, "p1", jenfuId)?.isRested === false,
        "excludeSelfにより自身（コア1個で条件に該当する）は疲労しない",
    )
}
{
    // e2: onAttack selfBuffPer counter{ownKeyword:"soku"} amountPer1000
    const s = setupMain("jenfu-e2")
    put(s, "p1", "BS01-053", 1) // リーヴォルフ（神速）
    put(s, "p1", "BS01-064", 1) // ジガ・ワスプ（神速）
    const jenfuId = put(s, "p1", "BS05-027", 3) // Lv2（コア3個）
    const jenfu = spiritOf(s, "p1", jenfuId)!
    const before = effectiveBp(s, "p1", jenfu)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: jenfuId }) === null, "アタック宣言")
    const after = effectiveBp(s, "p1", jenfu)
    assert(after === before + 2 * 1000, `神速2体ぶんBP+2000（実際: +${after - before}）`)
}

console.log("=== BS05-036 氷の魔女ヘル：召喚時、氷姫の自分の手札スピリットを無償召喚 ===")
{
    const s = setupMain("hel-e1")
    const helId = summonAt(s, "p1", ["BS05-036", "BS01-096"], 0)
    assert(helId !== null, "ヘルを召喚できる")
    assert(s.players.p1.hand.length === 0, "無償召喚された分、手札が空になる")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS01-096"),
        "氷姫の妖機妃ソールが無償召喚される",
    )
}

console.log("=== BS05-038 シーサーズ：破壊時、コスト2の自分の手札スピリットを無償召喚 ===")
{
    const s = setupMain("seasars-onDestroy")
    const seasars = put(s, "p1", "BS05-038", 1) // Lv1 BP2000
    const strong = put(s, "p2", "BS03-009", 5) // 火吹きメルト Lv3 BP8000（cantBlockLowerBpなし）
    s.players.p1.hand = ["BS01-003"] // テラノセイバー（コスト2）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: seasars }) === null, "シーサーズがアタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: strong }) === null, "リザードマンがブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側がパス＝バトル解決")
    assert(spiritOf(s, "p1", seasars) === undefined, "シーサーズがBP比較で破壊される")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS01-003"),
        "破壊時効果でコスト2のテラノセイバーが無償召喚される",
    )
}

console.log("=== BS05-042 天使長ソフィア：召喚時、想獣の自分の手札スピリットを無償召喚 ===")
{
    const s = setupMain("sophia-e2")
    const sophiaId = summonAt(s, "p1", ["BS05-042", "BS03-063"], 0)
    assert(sophiaId !== null, "ソフィアを召喚できる")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS03-063"),
        "想獣のポニサスが無償召喚される",
    )
}

console.log("=== BS05-043 黄昏の竜使いフラウム：自分のエンドステップ（Lv3）で自身回復＋龍帝/虚神全回復 ===")
{
    const s = setupMain("fraum-end")
    const fraumId = put(s, "p1", "BS05-043", 3) // Lv3
    const dragonEmpId = put(s, "p1", "BS04-010", 1) // 雷帝エール・クレル（龍帝）
    const otherId = put(s, "p1", "BS01-001", 1) // 龍帝/虚神ではない
    spiritOf(s, "p1", fraumId)!.isRested = true
    spiritOf(s, "p1", dragonEmpId)!.isRested = true
    spiritOf(s, "p1", otherId)!.isRested = true
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了（自分のエンドステップでフラウムLv3が発動）")
    assert(spiritOf(s, "p1", fraumId)?.isRested === false, "e1: フラウム自身が回復する")
    assert(spiritOf(s, "p1", dragonEmpId)?.isRested === false, "e2: 龍帝の雷帝エール・クレルが回復する")
    assert(spiritOf(s, "p1", otherId)?.isRested === true, "龍帝/虚神でないスピリットは回復しない")
}

console.log("=== BS05-047 ブロンズ・ゴレム：自分のネクサス破壊に反応し、コア1個でネクサスを戻す ===")
{
    const s = setupMain("bronze-golem")
    const golemId = put(s, "p1", "BS05-047", 2) // Lv2（コア2個）
    const fillerNexus = putNexus(s, "p1", "BS03-102", 0) // 破壊させるだけのネクサス
    assert(destroyNexus(s, "p1", fillerNexus) === true, "自分のネクサスを破壊する")
    assert(spiritOf(s, "p1", golemId)?.cores === 1, "コア1個を支払う（2個→1個）")
    assert(
        s.players.p1.field.nexuses.some((n) => n.cardId === "BS03-102"),
        "破壊されたネクサスがフィールドに戻る",
    )
}

console.log("=== BS05-061 白夜の虚空：Lv2で、転召を持つ自分のスピリットに装甲：赤/紫/緑/白を付与 ===")
{
    const s = setupMain("byakuya-kokuu")
    const nexusId = putNexus(s, "p1", "BS05-061", 0) // Lv1（未発動）
    const tenshoHolder = put(s, "p1", "BS05-X17", 1) // 幻獣王リーン（転召持ち）
    const nonTensho = put(s, "p1", "BS01-001", 1) // 転召を持たない
    refreshLevelAsOverrides(s)
    const holderInst = spiritOf(s, "p1", tenshoHolder)!
    const nonInst = spiritOf(s, "p1", nonTensho)!
    assert(hasArmorAgainst(holderInst, ["red"]) === false, "Lv1（コア0）ではまだ装甲が付与されない")

    s.players.p1.field.nexuses.find((n) => n.instanceId === nexusId)!.cores = 3 // Lv2へ
    refreshLevelAsOverrides(s)
    assert(hasArmorAgainst(holderInst, ["red"]) === true, "Lv2：転召持ちは装甲：赤を受ける")
    assert(hasArmorAgainst(holderInst, ["white"]) === true, "Lv2：転召持ちは装甲：白を受ける")
    assert(hasArmorAgainst(holderInst, ["yellow"]) === false, "指定されていない色（黄）の装甲は受けない")
    assert(hasArmorAgainst(nonInst, ["red"]) === false, "転召を持たないスピリットには付与されない")
}

console.log("=== BS05-062 永久氷殿：氷姫スピリットにBP+1000（Lv1-2）／Lv2でアタックステップの破壊に反応し手札へ ===")
{
    // e1: aura bp target ownAll familyFilter 氷姫
    const s = setupMain("eikyu-hyoden-aura")
    const nexusId = putNexus(s, "p1", "BS05-062", 0) // Lv1で発動（levels:[1,2]）
    const sourl = put(s, "p1", "BS01-096", 1) // 妖機妃ソール（氷姫）Lv1 BP2000
    assert(effectiveBp(s, "p1", spiritOf(s, "p1", sourl)!) === 3000, "氷姫スピリットはBP+1000（2000→3000）")
    s.players.p1.field.nexuses = s.players.p1.field.nexuses.filter((n) => n.instanceId !== nexusId)
    assert(effectiveBp(s, "p1", spiritOf(s, "p1", sourl)!) === 2000, "永久氷殿が場を離れると加算なし")
}
{
    // e2: fieldEvent ownSpiritDestroyed phase:"attack" familyFilter:"氷姫" → returnToHand maxBpFromSelf
    const s = setupMain("eikyu-hyoden-fieldevent")
    putNexus(s, "p1", "BS05-062", 2) // Lv2（levels:[2]で発動）
    const attacker = put(s, "p1", "BS01-096", 1) // 妖機妃ソール（氷姫）Lv1 実効BP3000（aura込み）
    const blocker = put(s, "p2", "BS03-009", 5) // 火吹きメルト Lv3 BP8000（cantBlockLowerBpなし）
    const weak = put(s, "p2", "BS01-001", 1) // BP1000（3000以下）
    const p2HandBefore = s.players.p2.hand.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "ソールがアタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: blocker }) === null, "リザードマンがブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側がパス＝バトル解決")
    assert(spiritOf(s, "p1", attacker) === undefined, "氷姫のソールがBP比較で破壊される")
    assert(spiritOf(s, "p2", weak) === undefined, "相手のBP3000以下のスピリットが手札へ戻る")
    assert(s.players.p2.hand.length === p2HandBefore + 1, "戻された相手スピリットが手札に加わる")
}

console.log("=== BS05-064 ペンタン帝国：相手ターン中に黄スピリットが破壊されたら「ペンタン」を無償召喚 ===")
{
    const s = setupMain("pentan-teikoku")
    putNexus(s, "p1", "BS05-064", 0) // Lv1で発動（levels:[1,2]）
    const piyon = put(s, "p1", "BS02-049", 1) // ピヨン（黄）Lv1 BP1000
    s.players.p1.hand = ["BS02-058"] // ペンタン（黄・コスト3）
    const attacker = put(s, "p2", "BS01-018", 5) // リザードマン Lv3 BP9000
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了")
    assert(s.turnPlayer === "p2", "p2のターンになる")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2がアタックステップへ移行")
    assert(act(s, "p2", { type: "attack", instanceId: attacker }) === null, "p2がアタック宣言")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p1", { type: "block", instanceId: piyon }) === null, "p1がピヨンでブロック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側（p1）がパス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側（p2）がパス＝バトル解決")
    assert(spiritOf(s, "p1", piyon) === undefined, "ピヨンがBP比較で破壊される")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS02-058"),
        "相手ターン中の黄スピリット破壊でペンタンが無償召喚される",
    )
}

console.log("=== BS05-X17 幻獣王リーン：召喚時、相手のネクサス数ぶん相手スピリットを手札へ戻す ===")
{
    const s = setupMain("rean-x17")
    putNexus(s, "p2", "BS03-102", 0)
    putNexus(s, "p2", "BS03-102", 0)
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-002", 1)
    const p2HandBefore = s.players.p2.hand.length
    put(s, "p1", "BS02-023", 1) // 【転召:コスト6以上】の犠牲（効果を持たないコスト6のスピリット）
    const reanId = summonAt(s, "p1", ["BS05-X17"], 0)
    assert(reanId !== null, "リーンを召喚できる（転召の犠牲あり）")
    assert(s.players.p2.field.spirits.length === 0, "相手ネクサス2つぶん、相手スピリット2体が手札へ戻る")
    assert(s.players.p2.hand.length === p2HandBefore + 2, "戻された2体が相手の手札に加わる")
}

console.log("=== BS05-X18 超獣王ベヒードス：召喚時破壊／アタック時・ブロック時フラッシュ封印 ===")
{
    // e2: onSummon destroy countPerOpponentTrashMagicColors（相手トラッシュのマジックの色数ぶん破壊）
    const s = setupMain("behedosu-e2")
    s.players.p2.trashCards = ["BS01-114", "BS01-142"] // 赤マジック・白マジック＝2色
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-002", 1)
    put(s, "p1", "BS02-023", 1) // 【転召:コスト6以上】の犠牲
    const behedosuId = summonAt(s, "p1", ["BS05-X18"], 0)
    assert(behedosuId !== null, "ベヒードスを召喚できる（転召の犠牲あり）")
    assert(s.players.p2.field.spirits.length === 0, "相手トラッシュのマジック色数（2色）ぶん相手スピリットが破壊される")
}
{
    // e3: onAttack lockFlash（levels:[3]）
    const s = setupMain("behedosu-e3")
    const behedosuId = put(s, "p1", "BS05-X18", 6) // Lv3
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: behedosuId }) === null, "ベヒードスがアタック宣言")
    assert(s.battle?.flashLockedPlayer === "p2", "アタック時に相手（p2）がフラッシュ封印される")
}
{
    // e4: onBlock lockFlash（levels:[3]）
    const s = setupMain("behedosu-e4")
    const attacker = put(s, "p1", "BS01-001", 1)
    const behedosuId = put(s, "p2", "BS05-X18", 6) // Lv3
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "p1がアタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: behedosuId }) === null, "ベヒードスがブロック")
    assert(s.battle?.flashLockedPlayer === "p1", "ブロック時に攻撃側（p1）がフラッシュ封印される")
}

console.log("=== BS05-X19 聖皇ジークフリーデン：アタック時（Lv3）、BP7000以下の相手スピリットを2体破壊 ===")
{
    const s = setupMain("siegfrieden-x19")
    const attacker = put(s, "p1", "BS05-X19", 6) // Lv3
    const weak1 = put(s, "p2", "BS01-001", 1) // BP1000
    const weak2 = put(s, "p2", "BS02-049", 1) // BP1000
    const tough = put(s, "p2", "BS01-018", 5) // リザードマン Lv3 BP9000（7000超）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")
    assert(spiritOf(s, "p2", weak1) === undefined, "BP7000以下の相手スピリットが破壊される")
    assert(spiritOf(s, "p2", weak2) === undefined, "BP7000以下の相手スピリットが破壊される（2体目）")
    assert(spiritOf(s, "p2", tough) !== undefined, "BP7000超は対象外で残る")
}
