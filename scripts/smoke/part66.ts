// smoke パート66（BS05 batchA 残り8枚：エンジン小拡張が必要だった分）
//
// 新設した機構:
//   - globalConstraint "costCantAct"（コスト以下は両陣営アタック/ブロック不可。白夜の虚空／青嵐の虚空）
//   - kind:"costMod" の mode:"set"（コスト置換。パントマイスター／ゴッドスピード）
//   - globalConstraint "millCap"（相手効果によるミルの上限。エターナルシールド。effectSources経由でlendSelfThisTurn対応）
//   - action "coreRemoveMulti"（複数対象への同時コア除去。ガストラス）
//   - action "summonFromTrashFree"（トラッシュからの無償召喚。妖狐キュービック）
//   - kind:"keywordGrant" の colors（継続付与の装甲。CardInstance.armorColorsGranted。白夜の虚空Lv2）
//   - kind:"keywordGrant" の keyword:"awaken"（既存機構の再利用。紅蓮の虚空Lv2）
import {
    assert,
    act,
    canAwaken,
    costCantAct,
    createGame,
    createInstance,
    effectiveBp,
    effectiveCost,
    getCard,
    hasArmorAgainst,
    refreshLevelAsOverrides,
    resolveAction,
    destroySpirit,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst.instanceId
}

console.log("=== BS05-004 妖狐キュービック：破壊時にトラッシュから紫コスト5/6/7を無償召喚 ===")
{
    const s = createGame("bs05-004", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    const kyubikku = putSpirit(s, "p1", "BS05-004", 1)
    // onSummon(coreSqueezeAll＝場の全スピリットのコアを1個化)を持つデコイを、コア3個のまま観測できるようにする
    const bystander = putSpirit(s, "p1", "BS01-005", 3)
    // コスト5紫（ミストウィゼル）・コスト6紫（幻龍シェイロン。onSummonでcoreSqueezeAllを持つ）・
    // コスト7赤（デコイ・原始鳥フェニキオス、colorFilterで除外されるはず）
    s.players.p1.trashCards = ["BS01-042", "BS01-046", "BS01-023"]
    s.players.p1.reserve = 20
    destroySpirit(s, "p1", kyubikku, "destroy")

    assert(
        s.players.p1.field.spirits.some((x) => getCard(x.cardId).name === "幻龍シェイロン"),
        "コスト最大(6)の紫スピリットが場に出る（コスト7の赤デコイでなく、コスト5の紫でもない）",
    )
    assert(!s.players.p1.trashCards.includes("BS01-046"), "召喚されたカードはトラッシュから除かれる")
    assert(s.players.p1.trashCards.includes("BS01-042"), "コスト5の紫は選ばれず残る")
    assert(s.players.p1.trashCards.includes("BS01-023"), "赤のデコイはcolorFilterで除外され残る")
    const summoned = s.players.p1.field.spirits.find((x) => getCard(x.cardId).name === "幻龍シェイロン")!
    assert(summoned.cores === 1, "維持コア1個のみリザーブから払われる（幻龍シェイロンLv1）")
    const bystanderAfter = s.players.p1.field.spirits.find((x) => x.instanceId === bystander)!
    assert(
        bystanderAfter.cores === 3,
        "召喚された幻龍シェイロンのonSummon(coreSqueezeAll)は発揮されない（他のスピリットのコアが1個化されていない）",
    )
}

console.log("=== BS05-013 ガストラス：破壊時に相手コスト1以下2体からコア2個ずつをトラッシュへ ===")
{
    const s = createGame("bs05-013", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const gastoras = putSpirit(s, "p1", "BS05-013", 1)
    const target1 = putSpirit(s, "p2", "BS01-002", 3) // ロクケラトプス コスト1・cores3
    const target2 = putSpirit(s, "p2", "BS02-050", 3) // コリスタル コスト0・cores3
    const nonTarget = putSpirit(s, "p2", "BS01-005", 3) // アイバーン コスト2（対象外）
    const ownSide = putSpirit(s, "p1", "BS01-002", 3) // 自分の同名（対象外＝相手限定）
    destroySpirit(s, "p1", gastoras, "destroy")

    const t1 = s.players.p2.field.spirits.find((x) => x.instanceId === target1)!
    const t2 = s.players.p2.field.spirits.find((x) => x.instanceId === target2)!
    const nt = s.players.p2.field.spirits.find((x) => x.instanceId === nonTarget)!
    const os = s.players.p1.field.spirits.find((x) => x.instanceId === ownSide)!
    assert(t1.cores === 1, "コスト1以下の対象1体目はコア2個減る（3→1）")
    assert(t2.cores === 1, "コスト1以下の対象2体目もコア2個減る（3→1）")
    assert(nt.cores === 3, "コスト2の相手スピリットは対象外")
    assert(os.cores === 3, "自分側のスピリットは対象外（相手限定）")
    assert(s.players.p2.trashCores === 4, "取り除かれたコア4個は持ち主のトラッシュへ（リザーブでなく）")
}

console.log("=== BS05-030 パントマイスター：Lv2で手札の系統「氷姫」のコストを5に置換 ===")
{
    const s = createGame("bs05-030", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    putSpirit(s, "p1", "BS05-030", 1) // Lv1（コスト置換なし）
    const snowWhite = getCard("BS05-040") // プリンセス・スノーホワイト コスト3・系統氷姫
    assert(effectiveCost(s, "p1", snowWhite) === 3, "パントマイスターLv1では置換されない")

    s.players.p1.field.spirits = [] // Lv1版を除去してLv2のみにする
    putSpirit(s, "p1", "BS05-030", 2) // Lv2（コア2）
    assert(effectiveCost(s, "p1", snowWhite) === 5, "パントマイスターLv2で氷姫のコストが5に置換される")

    const otherWhite = getCard("BS01-074") // バーサーカー・ガン コスト1・系統氷姫でない
    assert(effectiveCost(s, "p1", otherWhite) === otherWhite.cost, "氷姫でないカードは置換されず通常コストのまま")
}

console.log("=== BS05-055 紅蓮の虚空：Lv1オーラ(自分アタックステップ限定)とLv2覚醒付与(転召限定) ===")
{
    const s = createGame("bs05-055", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    const kogure = putNexus(s, "p1", "BS05-055", 0) // Lv1
    const dragonKing = putSpirit(s, "p1", "BS04-010", 1) // 雷帝エール・クレル Lv1（コア1）系統龍帝/翼竜・転召
    const plain = putSpirit(s, "p1", "BS01-002", 1) // 系統なし・転召なし

    const dk = s.players.p1.field.spirits.find((x) => x.instanceId === dragonKing)!
    assert(effectiveBp(s, "p1", dk) === 4000, "メインステップでは自分アタックステップ限定オーラが乗らない（Lv1・BP基礎4000のまま）")

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(effectiveBp(s, "p1", dk) === 6000, "自分のアタックステップでは系統龍帝条件成立によりBP+2000")

    assert(canAwaken(s, "p1", dk) === false, "Lv1では覚醒は付与されない")

    // Lv2へ（コア1）
    s.players.p1.field.nexuses = s.players.p1.field.nexuses.filter((x) => x.instanceId !== kogure)
    putNexus(s, "p1", "BS05-055", 1)
    assert(canAwaken(s, "p1", dk) === true, "Lv2では【転召】持ちに覚醒が継続付与される")
    const plainInst = s.players.p1.field.spirits.find((x) => x.instanceId === plain)!
    assert(canAwaken(s, "p1", plainInst) === false, "転召を持たないスピリットには付与されない（keywordFilter）")
}

console.log("=== BS05-061 白夜の虚空：Lv1コスト1以下アタブロ禁止／Lv2転召持ちに装甲付与 ===")
{
    const s = createGame("bs05-061", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS05-061", 0) // Lv1
    const cost1 = putSpirit(s, "p1", "BS01-002", 1) // コスト1
    const cost2 = putSpirit(s, "p1", "BS01-005", 1) // コスト2（対象外の境界確認）

    assert(costCantAct(s, 1) === true, "costCantAct(1)はtrue（コスト1以下は禁止）")
    assert(costCantAct(s, 2) === false, "costCantAct(2)はfalse（コスト2は対象外）")

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    const err1 = act(s, "p1", { type: "attack", instanceId: cost1 })
    assert(err1 !== null, "コスト1のスピリットはアタックできない")
    const err2 = act(s, "p1", { type: "attack", instanceId: cost2 })
    assert(err2 === null, "コスト2のスピリットは通常どおりアタックできる")

    // Lv2（装甲付与）の検証は別ゲームで（アタック済みで状態が進むため作り直す）
    const s2 = createGame("bs05-061-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s2)
    putNexus(s2, "p1", "BS05-061", 3) // Lv2
    const tensho = putSpirit(s2, "p1", "BS04-010", 3) // 雷帝エール・クレル（転召）
    const plain = putSpirit(s2, "p1", "BS01-002", 1) // 転召なし
    refreshLevelAsOverrides(s2)
    const tenshoInst = s2.players.p1.field.spirits.find((x) => x.instanceId === tensho)!
    const plainInst = s2.players.p1.field.spirits.find((x) => x.instanceId === plain)!
    assert(hasArmorAgainst(tenshoInst, ["red"]) === true, "転召持ちは付与された装甲：赤を受ける")
    assert(hasArmorAgainst(tenshoInst, ["yellow"]) === false, "付与色以外(黄)には装甲が効かない")
    assert(hasArmorAgainst(plainInst, ["red"]) === false, "転召を持たないスピリットには装甲が付与されない")
}

console.log("=== BS05-065 青嵐の虚空：Lv1コスト2以下アタブロ禁止 ===")
{
    const s = createGame("bs05-065", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS05-065", 0) // Lv1
    const cost2 = putSpirit(s, "p1", "BS01-005", 1) // コスト2
    const cost3 = putSpirit(s, "p1", "BS01-008", 1) // コスト3（境界確認）

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    const err2 = act(s, "p1", { type: "attack", instanceId: cost2 })
    assert(err2 !== null, "コスト2のスピリットはアタックできない")
    const err3 = act(s, "p1", { type: "attack", instanceId: cost3 })
    assert(err3 === null, "コスト3のスピリットは通常どおりアタックできる")
}

// 1回のバトルをアタック宣言〜ブロックまで進め、防御側からブロック後フラッシュを開く共通手順
function attackAndBlock(s: GameState, attackerId: string, blockerId: string): void {
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attackerId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "block", instanceId: blockerId }) === null, "p2がブロック")
    assert(
        s.isFlashTiming === true && s.priorityPlayer === "p2",
        "ブロック後フラッシュ再オープン・防御側(p2)に優先権",
    )
}

console.log("=== BS05-073 ゴッドスピード：実際にcastMagicで使用しコスト置換が効き、ターン終了で消える ===")
{
    const s = createGame("bs05-073", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const attacker = putSpirit(s, "p1", "BS01-008", 1) // メタルバーン（雑魚アタッカー）
    const blocker = putSpirit(s, "p2", "BS01-008", 1)
    s.players.p1.hand = ["BS05-025", "BS05-073"] // 神樹ディオネアス（神速・コスト6）／ゴッドスピード
    s.players.p1.reserve = 20

    const dionaeus = getCard("BS05-025")
    const kaze = getCard("BS01-068") // 風虎ティガルド（神速・コスト5＝costFilter min:6未満）
    assert(effectiveCost(s, "p1", dionaeus) === 6, "使用前は神樹ディオネアスのコストは通常の6")

    attackAndBlock(s, attacker, blocker)
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス→優先権が攻撃側へ")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 1 }) === null,
        "攻撃側(p1)がゴッドスピードをフラッシュで使用",
    )

    assert(effectiveCost(s, "p1", dionaeus) === 4, "使用後は【神速】コスト6以上の神樹ディオネアスが4になる")
    assert(effectiveCost(s, "p1", kaze) === 5, "コスト6未満の風虎ティガルドはcostFilterで対象外のまま")

    // castMagicで優先権が防御側(p2)へ移るため、p2→p1の順でパスしてバトルを解決する
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")

    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了")
    assert(effectiveCost(s, "p1", dionaeus) === 6, "ターン終了で置換が消え、通常の6に戻る")
}

console.log("=== BS05-076 エターナルシールド：実際にcastMagicで使用し相手のミルが5枚に制限され、ターン終了で消える ===")
{
    const s = createGame("bs05-076", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const attacker = putSpirit(s, "p1", "BS01-008", 1)
    const blocker = putSpirit(s, "p2", "BS01-008", 1)
    s.players.p2.hand = ["BS05-076"]
    s.players.p2.reserve = 20
    const deckBefore = s.players.p2.deck.length
    assert(deckBefore >= 20, "テスト前提：p2のデッキが十分な枚数残っている")

    attackAndBlock(s, attacker, blocker)
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0 }) === null,
        "防御側(p2)がエターナルシールドをフラッシュで使用",
    )

    // 相手(p1)の効果でp2のデッキを10枚破棄しようとする → millCapで5枚に制限される
    resolveAction(s, "p1", null, { type: "mill", count: 10 })
    assert(
        s.players.p2.deck.length === deckBefore - 5,
        "相手の効果によるミルは5枚に制限される（10枚破棄しようとしても5枚のみ）",
    )

    // 自分自身によるミルは制限されない（actorPid===pidのため対象外）
    const deckBefore2 = s.players.p2.deck.length
    resolveAction(s, "p2", null, { type: "mill", count: 10, side: "own" })
    assert(
        s.players.p2.deck.length === deckBefore2 - 10,
        "自分自身の効果によるミルはmillCapの対象外（10枚とも破棄される）",
    )

    // バトルを解決してターンを終了する
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス→バトル解決")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了")

    const deckBefore3 = s.players.p2.deck.length
    assert(deckBefore3 >= 10, "テスト前提：まだ十分な枚数が残っている")
    resolveAction(s, "p1", null, { type: "mill", count: 10 })
    assert(
        s.players.p2.deck.length === deckBefore3 - 10,
        "ターン終了で貸与が消え、相手の効果によるミルは制限なく10枚破棄される",
    )
}
