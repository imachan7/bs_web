// smoke パート148（第八弾「戦嵐」黄15枚：新規エンジン拡張の経路確認）
//
// 黄15枚の取り込みで追加したエンジン拡張を実カード経由で1回ずつ通す:
//   TriggerEvent"onTenshoTarget"（【転召】の対象になったとき自身に発火。BS08天使オリフィア）／
//   levelAs.condition"ownSpiritCountBelowOpponent"（BS08ダークチュンポポLv2）／
//   ConstraintDef.unblockableBy.keywordFilterAbsent（BS08光帝竜騎アルカナジョーカーLv3）／
//   reviveOnDestroy.when.byBattleKillerMaxBp（BS08勝者のグリーンフィールドLv2）／
//   action"recoverSpiritFromTrash".nameIncludes（BS08アルカナクィーン・パラス）／
//   action"refreshSelfByReturnToDeckTopName"（BS08勇者フェニックスペンタンLv2）／
//   action"drawPerHandDiscard"（BS08堕天使ミカファールLv1-3）／
//   action"castMagicFromTrashByColor"（BS08堕天使ミカファールLv2-3）／
//   action"magicMirrorRepeat"・GameState.lastMagicCast（BS08マジックミラー）／
//   magic.condition"ownFieldHasAllNames"（BS08ロイヤルストレートフラッシュ）
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    declareBlock,
    destroySpirit,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { dumpAllCoresTensho, fireSummonTrigger, fireTrigger, resolveMagic } from "../../server/src/logic/EffectModules"
import { canBlock } from "../../shared/block"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 40
    s.players.p2.reserve = 40
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS08-040").name === "天使オリフィア", "BS08-040 は天使オリフィア")
    assert(getCard("BS08-039").name === "ダークチュンポポ", "BS08-039 はダークチュンポポ")
    assert(getCard("BS08-043").name === "光帝竜騎アルカナジョーカー", "BS08-043 は光帝竜騎アルカナジョーカー")
    assert(getCard("BS08-063").name === "勝者のグリーンフィールド", "BS08-063 は勝者のグリーンフィールド")
    assert(getCard("BS08-044").name === "アルカナクィーン・パラス", "BS08-044 はアルカナクィーン・パラス")
    assert(getCard("BS08-045").name === "勇者フェニックスペンタン", "BS08-045 は勇者フェニックスペンタン")
    assert(getCard("BS08-X33").name === "堕天使ミカファール", "BS08-X33 は堕天使ミカファール")
    assert(getCard("BS08-080").name === "マジックミラー", "BS08-080 はマジックミラー")
    assert(getCard("BS08-081").name === "ロイヤルストレートフラッシュ", "BS08-081 はロイヤルストレートフラッシュ")
    assert(getCard("BS04-055").name === "光帝リュミエール" && getCard("BS04-055").family.includes("龍帝"), "BS04-055 は光帝リュミエール（龍帝）")
    assert(getCard("BS08-007").name === "火砕竜プロメテオーズ", "BS08-007 は火砕竜プロメテオーズ（【転召】持ち）")
    assert(getCard("BS02-070").name === "アルカナプリンス・オベロ", "BS02-070 はアルカナプリンス・オベロ")
    assert(getCard("BS03-067").name === "アルカナプリンセス・アン", "BS03-067 はアルカナプリンセス・アン")
    assert(getCard("BS06-057").name === "アルカナキング・カール", "BS06-057 はアルカナキング・カール")
}

console.log("=== BS08天使オリフィア：TriggerEvent onTenshoTarget（【転召】の対象になったとき自身に発火） ===")
{
    const s = base("orifia-tensho-target")
    const orifia = put(s, "p1", "BS08-040", 1) // Lv1
    const lifeBefore = s.players.p1.life
    dumpAllCoresTensho(s, "p1", orifia, "trash")
    assert(s.players.p1.life === lifeBefore + 1, "対象になった時点でボイドからコア1個がライフに置かれる")
    assert(s.players.p1.trashCores === 1, "コアはトラッシュへ（通常どおりの転召処理も継続する）")
}

console.log("=== BS08ダークチュンポポLv2：levelAs.condition ownSpiritCountBelowOpponent ===")
{
    const s = base("chunpopo-below-opponent")
    s.phase = "attack"
    s.turnPlayer = "p2" // 発生源(p1)から見て相手のアタックステップ
    const chunpopo = put(s, "p1", "BS08-039", 3) // raw Lv2（cores3）
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-002", 1)
    refreshLevelAsOverrides(s)
    assert(currentLevel(chunpopo).level === 2, "自分1体<相手2体：想獣を持つ自身も最高Lv（この場合raw Lvと同じ2）として扱われる")
}
{
    const s = base("chunpopo-below-opponent-raw-lv1")
    s.phase = "attack"
    s.turnPlayer = "p2"
    const chunpopo = put(s, "p1", "BS08-039", 1) // raw Lv1（cores1）
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-002", 1)
    refreshLevelAsOverrides(s)
    assert(currentLevel(chunpopo).level === 2, "自分1体<相手2体：raw Lv1でも最高Lv（2）まで引き上げられる")

    put(s, "p1", "BS01-003", 1) // 自分2体目
    refreshLevelAsOverrides(s)
    assert(currentLevel(chunpopo).level === 1, "自分2体＝相手2体（未満でなくなる）と、通常のLv（コア基準＝1）に戻る")
}
{
    const s = base("chunpopo-wrong-turn")
    s.phase = "attack"
    s.turnPlayer = "p1" // 自分のアタックステップ（条件を満たさない）
    const chunpopo = put(s, "p1", "BS08-039", 1) // Lv1
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-002", 1)
    refreshLevelAsOverrides(s)
    assert(currentLevel(chunpopo).level === 1, "自分のアタックステップでは（相手のアタックステップ限定のため）発動しない")
}

console.log("=== BS08光帝竜騎アルカナジョーカーLv3：ConstraintDef.unblockableBy.keywordFilterAbsent ===")
{
    const s = base("joker-unblockable-absent")
    s.phase = "attack"
    s.turnPlayer = "p1"
    put(s, "p1", "BS08-043", 3) // Lv3（cores3）
    const lumiere = put(s, "p1", "BS04-055", 1) // 龍帝を持つ別のスピリット（ジョーカー自身は龍帝を持たない）
    const noTensho = put(s, "p2", "BS01-001", 1) // 【転召】を持たない
    const hasTensho = put(s, "p2", "BS08-007", 1) // 【転召】を持つ

    assert(
        canBlock(s, "p2", noTensho, "p1", lumiere) !== null,
        "【転召】を持たない相手スピリットからはブロックされない",
    )
    assert(
        canBlock(s, "p2", hasTensho, "p1", lumiere) === null,
        "【転召】を持つ相手スピリットからは通常どおりブロックされる",
    )
}

console.log("=== BS08勝者のグリーンフィールドLv2：reviveOnDestroy.when.byBattleKillerMaxBp ===")
{
    const s = base("greenfield-revive-low-bp")
    s.phase = "attack"
    s.turnPlayer = "p2" // 発生源(p1)から見て相手のアタックステップ
    putNexus(s, "p1", "BS08-063", 2) // Lv2
    const oberon = put(s, "p1", "BS02-070", 1) // 四道を持つ
    destroySpirit(s, "p1", oberon.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["red"], attackerLevel: 1, attackerBp: 7000 },
    })
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === oberon.instanceId),
        "破壊した側の実効BPが7000以下のため、回復状態で戻る",
    )
    assert(oberon.isRested === false, "回復状態で戻る（revived.rested:false）")
}
{
    const s = base("greenfield-revive-high-bp")
    s.phase = "attack"
    s.turnPlayer = "p2"
    putNexus(s, "p1", "BS08-063", 2)
    const oberon = put(s, "p1", "BS02-070", 1)
    destroySpirit(s, "p1", oberon.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["red"], attackerLevel: 1, attackerBp: 7001 },
    })
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === oberon.instanceId),
        "破壊した側の実効BPが7000を超えるため、通常どおり破壊される",
    )
}

console.log("=== BS08アルカナクィーン・パラス：action recoverSpiritFromTrash.nameIncludes ===")
{
    const s = base("palas-recover-namefilter")
    s.players.p1.trashCards.push("BS02-070", "BS03-067", "BS06-057", "BS01-001")
    resolveAction(s, "p1", null, { type: "recoverSpiritFromTrash", count: 3, nameIncludes: "アルカナ" }, undefined, undefined, "spirit")
    assert(s.players.p1.hand.includes("BS02-070"), "「アルカナ」を含むカードは手札に戻る（1）")
    assert(s.players.p1.hand.includes("BS03-067"), "「アルカナ」を含むカードは手札に戻る（2）")
    assert(s.players.p1.hand.includes("BS06-057"), "「アルカナ」を含むカードは手札に戻る（3）")
    assert(s.players.p1.trashCards.includes("BS01-001"), "「アルカナ」を含まないカードはトラッシュに残る")
}

console.log("=== BS08勇者フェニックスペンタンLv2：action refreshSelfByReturnToDeckTopName ===")
{
    const s = base("phoenixpentan-return-deck-top")
    const pentan1 = put(s, "p1", "BS08-045", 3) // Lv2、疲労状態にする
    pentan1.isRested = true
    const pentan2 = put(s, "p1", "BS02-058", 1) // 「ペンタン」を含む別のスピリット
    const deckBefore = [...s.players.p1.deck]
    resolveAction(s, "p1", pentan1, { type: "refreshSelfByReturnToDeckTopName", nameIncludes: "ペンタン" }, undefined, undefined, "spirit")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === pentan2.instanceId), "対象はフィールドから離れる")
    assert(s.players.p1.deck[0] === "BS02-058", "対象はデッキの一番上に戻る")
    assert(s.players.p1.deck.length === deckBefore.length + 1, "デッキ枚数が1枚増える")
    assert(!pentan1.isRested, "このスピリット自身は回復する")
}

console.log("=== BS08堕天使ミカファールLv1-3：action drawPerHandDiscard ===")
{
    const s = base("mikafael-draw-per-discard")
    s.players.p1.hand = ["BS01-001", "BS01-002", "BS01-003"]
    const deckBefore = s.players.p1.deck.length
    const trashBefore = s.players.p1.trashCards.length
    resolveAction(s, "p1", null, { type: "drawPerHandDiscard" }, undefined, undefined, "spirit")
    assert(s.players.p1.trashCards.length === trashBefore + 3, "破棄した3枚はトラッシュへ")
    assert(s.players.p1.hand.length === 3, "破棄した枚数ぶんドローする（3枚）")
    assert(s.players.p1.deck.length === deckBefore - 3, "デッキが3枚減る")
}

console.log("=== BS08堕天使ミカファールLv2-3：action castMagicFromTrashByColor ===")
{
    const s = base("mikafael-cast-from-trash")
    const own = put(s, "p1", "BS01-005", 3) // Lv2扱いの対象（levelOverrideTarget確認用の的）
    s.players.p1.trashCards.push("BS08-079") // キャッツアイ（黄・コスト3）
    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p1", null, { type: "castMagicFromTrashByColor", colorFilter: "yellow" }, undefined, undefined, "spirit")
    assert(s.players.p1.reserve === reserveBefore - 3, "コスト3がリザーブから支払われる")
    assert(s.players.p1.trashCards.includes("BS08-079"), "使用後もトラッシュに留まる（元々トラッシュのカードのため）")
    assert(own.levelOverrideThisTurn === 1, "メイン効果（levelOverrideTarget）が手札にあるときと同様に発揮される")
}
{
    const s = base("mikafael-cast-from-trash-no-color-match")
    s.players.p1.trashCards.push("BS01-114") // 黄以外のマジック
    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p1", null, { type: "castMagicFromTrashByColor", colorFilter: "yellow" }, undefined, undefined, "spirit")
    assert(s.players.p1.reserve === reserveBefore, "色が一致するカードが無ければ不発")
}

console.log("=== BS08マジックミラー：action magicMirrorRepeat・GameState.lastMagicCast ===")
{
    const s = base("magicmirror-repeat")
    const attacker = put(s, "p1", "BS01-005", 3)
    const blocker = put(s, "p2", "BS01-001", 3)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "フラッシュ①を閉じてからブロック宣言")

    s.players.p2.hand[0] = "BS01-127" // キラーテレスコープ（フラッシュ：スピリット1体をBP+2000）
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "p2がキラーテレスコープを使用（防御側優先権）")
    assert(blocker.tempBpBuff === 2000, "前提: p2自身のバトル中スピリット（blocker）がBP+2000される")
    assert(s.lastMagicCast?.pid === "p2" && s.lastMagicCast.cardId === "BS01-127", "lastMagicCastが記録される")

    s.players.p1.hand[0] = "BS08-080" // マジックミラー
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "p1がマジックミラーを使用")
    assert(attacker.tempBpBuff === 2000, "p1が使用したものとして再解決され、p1自身のバトル中スピリット（attacker）がBP+2000される")
    assert(s.lastMagicCast?.pid === "p1" && s.lastMagicCast.cardId === "BS01-127", "lastMagicCastはp1によるキラーテレスコープの使用に更新される")

    assert(act(s, "p2", { type: "pass" }) === null, "p2がパスして優先権をp1へ戻す（フラッシュ終了ではない）")
    s.players.p1.hand[0] = "BS08-080" // もう一度マジックミラー（直前がp1自身の使用のため不発）
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "続けてマジックミラーを使用")
    assert(attacker.tempBpBuff === 2000, "直前の使用者が自分自身のため追加のBP+は発生しない")

    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.battle === null, "バトルが解決される")
    assert(s.lastMagicCast === undefined, "バトル終了でlastMagicCastはクリアされる")
}
{
    const s = base("magicmirror-cannot-mirror-itself")
    s.lastMagicCast = { pid: "p2", cardId: "BS08-080", timing: "flash" }
    resolveAction(s, "p1", null, { type: "magicMirrorRepeat" }, undefined, undefined, "magic")
    assert(
        s.lastMagicCast.cardId === "BS08-080" && s.lastMagicCast.pid === "p2",
        "[マジックミラー]自身は対象にできないため、lastMagicCastは変化しない",
    )
}

console.log("=== BS08ロイヤルストレートフラッシュ：magic.condition ownFieldHasAllNames ===")
{
    const s = base("royal-straight-flush-condition-met")
    put(s, "p1", "BS02-070", 1) // アルカナプリンス・オベロ
    put(s, "p1", "BS03-067", 1) // アルカナプリンセス・アン
    put(s, "p1", "BS06-057", 1) // アルカナキング・カール
    put(s, "p1", "BS08-044", 1) // アルカナクィーン・パラス
    put(s, "p1", "BS08-043", 1) // 光帝竜騎アルカナジョーカー
    put(s, "p2", "BS01-001", 1)
    putNexus(s, "p2", "BS01-098", 0)
    resolveMagic(s, "p1", "BS08-081", "main")
    assert(s.players.p2.field.spirits.length === 0, "5枚が揃っているとき：相手のスピリットは全破壊される")
    assert(s.players.p2.field.nexuses.length === 0, "5枚が揃っているとき：相手のネクサスも全破壊される")
}
{
    const s = base("royal-straight-flush-condition-not-met")
    put(s, "p1", "BS02-070", 1)
    put(s, "p1", "BS03-067", 1)
    put(s, "p1", "BS06-057", 1)
    put(s, "p1", "BS08-044", 1)
    // BS08-043（光帝竜騎アルカナジョーカー）が欠けている
    put(s, "p2", "BS01-001", 1)
    putNexus(s, "p2", "BS01-098", 0)
    resolveMagic(s, "p1", "BS08-081", "main")
    assert(s.players.p2.field.spirits.length === 1, "5枚が揃っていないとき：メイン効果は発動しない")
    assert(s.players.p2.field.nexuses.length === 1, "5枚が揃っていないとき：ネクサスも破壊されない")
}

// ---- 誘発経由の確認（2026-08-09 の実行時カバレッジで見つかった穴） ----
//
// 上の各テストは resolveAction を直接叩いており、**カードデータ側の記述**
// （trigger 名・levels・action の引数）を一度も通していなかった。
// たとえば trigger を "onAttack" でなく "onSummon" と書き間違えても、上のテストは
// 全緑のまま通ってしまう。ここでは実インスタンスの誘発として発火させる。
console.log("=== BS08勇者フェニックスペンタン／堕天使ミカファール：カードデータの誘発記述を通す ===")
{
    // ID のハードコードに対する保険（過去に cardId が全面的にズレた事故があるため）
    assert(getCard("BS08-045").name === "勇者フェニックスペンタン", "BS08-045 は勇者フェニックスペンタン")
    assert(getCard("BS08-X33").name === "堕天使ミカファール", "BS08-X33 は堕天使ミカファール")
    assert(getCard("BS02-058").name === "ペンタン", "BS02-058 はペンタン")
    assert(getCard("BS08-079").name === "キャッツアイ", "BS08-079 はキャッツアイ（黄のマジック）")
}
{
    const s = base("phoenixpentan-trigger-onattack")
    const pentan = put(s, "p1", "BS08-045", 3) // Lv2：e2 の levels に入る
    pentan.isRested = true
    put(s, "p1", "BS02-058", 1)
    fireTrigger(s, "p1", pentan, "onAttack")
    assert(!pentan.isRested, "『このスピリットのアタック時』の誘発として回復する")
    assert(s.players.p1.deck[0] === "BS02-058", "[ペンタン]がデッキの一番上に戻る")
}
{
    const s = base("phoenixpentan-trigger-level1")
    const pentan = put(s, "p1", "BS08-045", 1) // Lv1：e2 の levels [2,3] に入らない
    pentan.isRested = true
    put(s, "p1", "BS02-058", 1)
    fireTrigger(s, "p1", pentan, "onAttack")
    assert(pentan.isRested, "Lv1では発揮しない（levels の指定が効いている）")
}
{
    const s = base("mikafael-trigger-onsummon")
    const mika = put(s, "p1", "BS08-X33", 1)
    s.players.p1.hand = ["BS01-001", "BS01-002"]
    const deckBefore = s.players.p1.deck.length
    fireSummonTrigger(s, "p1", mika)
    assert(s.players.p1.hand.length === 2, "『召喚時』の誘発として、破棄した枚数ぶん引き直す")
    assert(s.players.p1.deck.length === deckBefore - 2, "デッキが破棄した枚数ぶん減る")
}
{
    const s = base("mikafael-trigger-onattack")
    // 使用されるキャッツアイの levelOverrideTarget は、対象未指定のとき
    // **持ち主のフィールドの先頭**を自動選択する（非対話モードのフォールバック）。
    // ミカファールより先に置いて、どちらが選ばれるかを決定的にする
    const target = put(s, "p1", "BS01-005", 3)
    const mika = put(s, "p1", "BS08-X33", 2) // Lv2：e2 の levels に入る
    s.players.p1.trashCards.push("BS08-079")
    const reserveBefore = s.players.p1.reserve
    fireTrigger(s, "p1", mika, "onAttack")
    // 支払い額はカード静的なコストではなく**軽減後**（自分の黄シンボルぶん減る）
    assert(s.players.p1.reserve < reserveBefore, "『アタック時』の誘発としてトラッシュのマジックを使用する")
    assert(target.levelOverrideThisTurn === 1, "使用したマジックのメイン効果が発揮される")
}
