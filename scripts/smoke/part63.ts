// smoke パート63（BS05 黄・青バッチ3で追加したエンジン拡張の動作確認）
//
// このパートは smoke.ts にまだ import されていない（統合はメインループが行う）。
//
// 対象の新規拡張:
// ① fieldEvent ownSpiritDestroyed の costFilter — BS05-037 天使クレイオ
// ② reviveOnDestroy の requireOwnFieldHasName — BS05-040 プリンセス・スノーホワイト
// ③ keywordGrant の keywordFilter — BS05-063 黄道の虚空Lv2
// ④ AuraCondition hasOwnFamily の配列（OR）対応 — BS05-063 黄道の虚空Lv1
// ⑤ reviveLastDestroyedNexus の coreCost — BS05-047 ブロンズ・ゴレム
// ⑥ summonFromHandFree の costFilter / nameIncludes — BS05-038 シーサーズ／BS05-064 ペンタン帝国
// ⑦ grantKeywordAll の vanillaFilter — BS05-082 サーキュラーソー・アーム
// ⑧ returnToHand の countPerOpponentNexus — BS05-X17 幻獣王リーン
// ⑨ destroy の countPerOpponentTrashMagicColors — BS05-X18 超獣王ベヒードス
// ⑩ voidCoresAndMillByCost（新規アクション） — BS05-083 マジックスパナ
import {
    assert,
    createGame,
    createInstance,
    destroySpirit,
    effectiveBp,
    getCard,
    resolveAction,
    spiritHasKeyword,
} from "./helpers"

console.log("=== ① fieldEvent ownSpiritDestroyed costFilter：コスト2一致のみドロー ===")
{
    const s = createGame("bs05-037-costfilter", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    s.turnPlayer = "p1"
    s.phase = "attack"
    const kreio = createInstance("BS05-037", s.turn, 1) // 天使クレイオLv1（発生源）
    const cost2 = createInstance("BS05-039", s.turn, 1) // アサガオの妖精ナパルコ：コスト2
    assert(getCard("BS05-039").cost === 2, "テスト前提: BS05-039はコスト2")
    s.players.p1.field.spirits.push(kreio, cost2)
    const handBefore = s.players.p1.hand.length
    const deckBefore = s.players.p1.deck.length
    destroySpirit(s, "p1", cost2.instanceId, "destroy")
    assert(
        s.players.p1.hand.length === handBefore + 1 && s.players.p1.deck.length === deckBefore - 1,
        "コスト2の自分のスピリットが破壊されたのでドローした",
    )
}
{
    const s = createGame("bs05-037-costfilter-mismatch", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    s.turnPlayer = "p1"
    s.phase = "attack"
    const kreio = createInstance("BS05-037", s.turn, 1)
    const cost6 = createInstance("BS05-042", s.turn, 1) // 天使長ソフィア：コスト6
    assert(getCard("BS05-042").cost === 6, "テスト前提: BS05-042はコスト6")
    s.players.p1.field.spirits.push(kreio, cost6)
    const handBefore = s.players.p1.hand.length
    destroySpirit(s, "p1", cost6.instanceId, "destroy")
    assert(s.players.p1.hand.length === handBefore, "コスト不一致（コスト6）ではドローしなかった")
}

console.log("=== ② reviveOnDestroy requireOwnFieldHasName：[ドワッフー・セブン]がいるときのみ復活 ===")
{
    const s = createGame("bs05-040-nofield", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    const snow = createInstance("BS05-040", s.turn, 2) // プリンセス・スノーホワイトLv2
    s.players.p1.field.spirits.push(snow)
    const handBefore = s.players.p1.hand.length
    destroySpirit(s, "p1", snow.instanceId, "destroy")
    assert(s.players.p1.trashCards.includes("BS05-040"), "[ドワッフー・セブン]不在のため通常どおりトラッシュへ")
    assert(s.players.p1.hand.length === handBefore, "手札には戻らなかった")
}
{
    const s = createGame("bs05-040-withfield", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    const snow = createInstance("BS05-040", s.turn, 2)
    const dwaffoo = createInstance("BS05-045", s.turn, 1) // ドワッフー・セブン
    s.players.p1.field.spirits.push(snow, dwaffoo)
    const handBefore = s.players.p1.hand.length
    destroySpirit(s, "p1", snow.instanceId, "destroy")
    assert(s.players.p1.hand.length === handBefore + 1, "[ドワッフー・セブン]がいたので手札に戻った")
    assert(s.players.p1.field.spirits.every((sp) => sp.instanceId !== snow.instanceId), "場からは除去されている")
}

console.log("=== ③④ 黄道の虚空：keywordGrant keywordFilter と AuraCondition hasOwnFamily（配列OR） ===")
{
    const s = createGame("bs05-063-keywordfilter", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    const kodo = createInstance("BS05-063", s.turn, 3) // 黄道の虚空Lv2
    const tenshoHolder = createInstance("BS05-X17", s.turn, 1) // 幻獣王リーン：転召持ち
    const nonTensho = createInstance("BS05-037", s.turn, 1) // 天使クレイオ：転召を持たない
    s.players.p1.field.nexuses.push(kodo)
    s.players.p1.field.spirits.push(tenshoHolder, nonTensho)
    assert(spiritHasKeyword(s, "p1", tenshoHolder, "kobo"), "転召持ちには光芒が継続付与される")
    assert(!spiritHasKeyword(s, "p1", nonTensho, "kobo"), "転召を持たないスピリットには付与されない")
}
{
    const s = createGame("bs05-063-aurafamily", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    s.turnPlayer = "p2"
    s.phase = "attack"
    const kodo = createInstance("BS05-063", s.turn, 1) // Lv1（配列いずれかの系統で判定）
    const target = createInstance("BS05-037", s.turn, 1)
    s.players.p1.field.nexuses.push(kodo)
    s.players.p1.field.spirits.push(target)
    const baseBp = getCard("BS05-037").levels[0]!.bp
    assert(
        effectiveBp(s, "p1", target) === baseBp,
        "系統：「龍帝」/「竜騎」/「虚神」を持つスピリットがいないためBP+2000は乗らない",
    )
    const dragoon = createInstance("BS05-043", s.turn, 1) // 黄昏の竜使いフラウム：系統「竜騎」
    s.players.p1.field.spirits.push(dragoon)
    assert(
        effectiveBp(s, "p1", target) === baseBp + 2000,
        "系統「竜騎」（配列内の1つ）が存在するのでBP+2000が乗った",
    )
}

console.log("=== ⑤ reviveLastDestroyedNexus coreCost：コスト不足なら不発、足りれば1個だけ支払う ===")
{
    const s = createGame("bs05-047-corecost-insufficient", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    const golem = createInstance("BS05-047", s.turn, 1) // ブロンズ・ゴレム：コア1個（coreCost:2には足りない）
    s.players.p1.field.spirits.push(golem)
    s.players.p1.trashCards.push("BS01-098")
    s.lastDestroyedNexus = { pid: "p1", cardId: "BS01-098" }
    resolveAction(s, "p1", golem, { type: "reviveLastDestroyedNexus", coreCost: 2 })
    assert(s.players.p1.field.nexuses.length === 0, "コア不足（1個<2個）のため復活しなかった")
    assert(s.lastDestroyedNexus !== null, "lastDestroyedNexusは消費されていない")
    assert(golem.cores === 1, "コアは支払われていない")
}
{
    const s = createGame("bs05-047-corecost-ok", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    const golem = createInstance("BS05-047", s.turn, 2) // コア2個（維持コア1を上回る）
    s.players.p1.field.spirits.push(golem)
    s.players.p1.trashCards.push("BS01-098")
    s.lastDestroyedNexus = { pid: "p1", cardId: "BS01-098" }
    resolveAction(s, "p1", golem, { type: "reviveLastDestroyedNexus", coreCost: 1 })
    assert(s.players.p1.field.nexuses.some((n) => n.cardId === "BS01-098"), "コア1個を支払って燃えさかる戦場が戻った")
    assert(golem.cores === 1, "ゴレムはコアを1個だけ支払った（すべてではない）")
    assert(s.lastDestroyedNexus === null, "lastDestroyedNexusは消費された")
}

console.log("=== ⑥ summonFromHandFree：costFilter と nameIncludes ===")
{
    const s = createGame("bs05-038-costfilter", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    const seesers = createInstance("BS05-038", s.turn, 1)
    s.players.p1.field.spirits.push(seesers)
    s.players.p1.hand = ["BS05-046", "BS05-039"] // コスト1の戦闘獣バビーバーとコスト2のナパルコ（初期手札の影響を避けるため置き換える）
    assert(getCard("BS05-046").cost === 1 && getCard("BS05-039").cost === 2, "テスト前提のコスト確認")
    resolveAction(s, "p1", seesers, { type: "summonFromHandFree", costFilter: 2 })
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS05-039"),
        "costFilter:2一致のナパルコが無償召喚された",
    )
    assert(s.players.p1.hand.includes("BS05-046"), "コスト1のバビーバーは手札に残った")
}
{
    const s = createGame("bs05-064-nameincludes", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    const pentanEmpire = createInstance("BS05-064", s.turn, 1)
    s.players.p1.field.nexuses.push(pentanEmpire)
    s.players.p1.hand = ["BS05-046", "BS02-058"] // 無関係のバビーバーと「ペンタン」（初期手札の影響を避けるため置き換える）
    resolveAction(s, "p1", pentanEmpire, { type: "summonFromHandFree", nameIncludes: "ペンタン" })
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS02-058"),
        "nameIncludes「ペンタン」一致のペンタンが無償召喚された",
    )
    assert(s.players.p1.hand.includes("BS05-046"), "無関係のバビーバーは手札に残った")
}

console.log("=== ⑦ grantKeywordAll vanillaFilter：バニラのみに粉砕を付与 ===")
{
    const s = createGame("bs05-082-vanillafilter", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    const vanilla = createInstance("BS05-046", s.turn, 1) // 戦闘獣バビーバー：効果テキストなし（バニラ）
    const nonVanilla = createInstance("BS05-047", s.turn, 1) // ブロンズ・ゴレム：効果あり
    assert(getCard("BS05-046").effect === "", "テスト前提: BS05-046はバニラ")
    s.players.p1.field.spirits.push(vanilla, nonVanilla)
    resolveAction(s, "p1", null, { type: "grantKeywordAll", keyword: "funsai", vanillaFilter: true })
    assert(vanilla.tempKeywords.some((k) => k.keyword === "funsai"), "バニラのバビーバーには粉砕が付与された")
    assert(!nonVanilla.tempKeywords.some((k) => k.keyword === "funsai"), "非バニラのゴレムには付与されない")
}

console.log("=== ⑧ returnToHand countPerOpponentNexus：相手のネクサス数ぶんバウンス ===")
{
    const s = createGame("bs05-x17-countpernexus", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    const reen = createInstance("BS05-X17", s.turn, 1)
    s.players.p1.field.spirits.push(reen)
    s.players.p2.field.nexuses.push(createInstance("BS01-098", s.turn, 0), createInstance("BS01-098", s.turn, 0))
    s.players.p2.field.spirits.push(
        createInstance("BS01-001", s.turn, 1),
        createInstance("BS01-001", s.turn, 1),
        createInstance("BS01-001", s.turn, 1),
    )
    const handBefore = s.players.p2.hand.length
    resolveAction(s, "p1", reen, { type: "returnToHand", count: 1, countPerOpponentNexus: true })
    assert(s.players.p2.hand.length === handBefore + 2, "相手のネクサス2つぶん、2体が手札に戻った")
    assert(s.players.p2.field.spirits.length === 1, "相手フィールドには1体だけ残った")
}

console.log("=== ⑨ destroy countPerOpponentTrashMagicColors：相手トラッシュのマジック色数ぶん破壊 ===")
{
    const s = createGame("bs05-x18-countpercolors", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    const behedos = createInstance("BS05-X18", s.turn, 1)
    s.players.p1.field.spirits.push(behedos)
    s.players.p2.trashCards.push("BS01-114", "BS03-141") // 赤マジックと青マジック＝2色
    s.players.p2.field.spirits.push(
        createInstance("BS01-001", s.turn, 1),
        createInstance("BS01-001", s.turn, 1),
        createInstance("BS01-001", s.turn, 1),
    )
    resolveAction(s, "p1", behedos, { type: "destroy", count: 1, countPerOpponentTrashMagicColors: true })
    assert(s.players.p2.field.spirits.length === 1, "トラッシュのマジック2色ぶん、相手スピリット2体が破壊された")
}

console.log("=== ⑩ voidCoresAndMillByCost：造兵の中でコスト最大を選び、そのコストぶん相手デッキを破棄 ===")
{
    const s = createGame("bs05-083-voidmill", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    const low = createInstance("BS05-047", s.turn, 1) // 造兵・コスト3
    const high = createInstance("BS05-052", s.turn, 2) // 造兵・コスト6
    assert(getCard("BS05-047").cost === 3 && getCard("BS05-052").cost === 6, "テスト前提のコスト確認")
    s.players.p1.field.spirits.push(low, high)
    const deckBefore = s.players.p2.deck.length
    resolveAction(s, "p1", null, { type: "voidCoresAndMillByCost", familyFilter: "造兵" })
    assert(high.cores === 0, "コスト最大（6）のスピリットのコアがボイドに置かれた")
    assert(low.cores === 1, "コスト3のスピリットは対象にならなかった")
    assert(s.players.p2.deck.length === deckBefore - 6, "対象スピリットのコスト（6）ぶん相手デッキが破棄された")
}
