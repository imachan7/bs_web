// smoke パート70（TargetFilter 第2段階の前提：絞り込み軸を使うのに未カバーだったカード）
//
// **なぜ必要か**: 第2段階では cards.json の旧フィールド（maxBp / keywordFilter / familyFilter …）を
// 新形式の filter へ移行した。しかし cards.json は fs 読み込みで **tsc の型検査対象外**なので、
// 移行を間違えても実行時まで分からない。**テストの無いカードは移行してはいけない。**
//
// ここで押さえるのは、絞り込み軸を使っているのに smoke に cardId が一度も出てこなかった15枚。
// 各テストは「軸が効いている（条件を満たすものだけが対象になる）」ことを確認する。
//
// 移行（2026-07-30 実施）で変わったのは、各カードの**データの形を機械確認する「テスト前提」の
// 読み出し先だけ**（action.maxBp → action.filter.maxBp など）。
// 効果の結果を検証する本体のアサーションは無変更で通っており、これが移行が正しかったことの根拠になる。
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectiveBp,
    getCard,
    resolveAction,
    runTurnStart,
    spiritHasFamily,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

// 相手フィールドに1体置いて instanceId を返す
function putEnemy(s: GameState, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players.p2.field.spirits.push(inst)
    return inst.instanceId
}
function putOwn(s: GameState, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players.p1.field.spirits.push(inst)
    return inst.instanceId
}
const enemyIds = (s: GameState): string[] => s.players.p2.field.spirits.map((x) => x.instanceId)
const newGame = (id: string): GameState => {
    const s = createGame(id, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    return s
}

console.log("=== maxBp 軸: BP以下だけが破壊される（BS01-022 / BS03-010 / 011 / 103 / 120） ===")
{
    // 5枚とも destroy/destroyAll の maxBp を使う。代表して各カードの実際の maxBp 値で検証する
    const cases: { cardId: string; effIndex: number }[] = [
        { cardId: "BS01-022", effIndex: 0 }, // 大鎌フール・ジョーカー: destroy maxBp 3000
        { cardId: "BS03-011", effIndex: 0 }, // 竜騎将ディライダロス: destroy maxBp 2000
        { cardId: "BS03-103", effIndex: 0 }, // 熾烈極める最前線: destroy maxBp 1000
        { cardId: "BS03-120", effIndex: 0 }, // フレイムサイクロン: destroy maxBp 5000
    ]
    for (const { cardId, effIndex } of cases) {
        const card = getCard(cardId)
        const eff = card.effects[effIndex] as { action?: { type?: string; filter?: { maxBp?: number } } }
        const maxBp = eff.action?.filter?.maxBp
        assert(typeof maxBp === "number", `テスト前提: ${card.name} は maxBp を持つ`)
        if (typeof maxBp !== "number") continue

        const s = newGame(`axis-maxbp-${cardId}`)
        // 閾値ちょうど（対象）と、閾値超え（対象外）を1体ずつ用意する
        const under = putEnemy(s, "BS01-001", 1) // ゴラドン Lv1 = BP1000
        const over = putEnemy(s, "BS01-025", 3) // 要塞龍ギガ Lv2 = BP10000
        const underBp = effectiveBp(s, "p2", s.players.p2.field.spirits[0]!)
        assert(underBp <= maxBp, `テスト前提: 低BP側(${underBp})が閾値(${maxBp})以下`)
        assert(effectiveBp(s, "p2", s.players.p2.field.spirits[1]!) > maxBp, "テスト前提: 高BP側が閾値超え")

        resolveAction(s, "p1", null, { type: "destroy", filter: { maxBp }, count: 1 })
        const remain = enemyIds(s)
        assert(!remain.includes(under), `${card.name}: maxBp${maxBp} 以下が破壊される`)
        assert(remain.includes(over), `${card.name}: maxBp${maxBp} 超えは残る`)
    }
}

console.log("--- destroyAll の maxBp（BS03-010 黒竜ヴリトラ: BP2000以下を全破壊） ---")
{
    const card = getCard("BS03-010")
    const eff = card.effects[0] as { action?: { filter?: { maxBp?: number } } }
    const maxBp = eff.action?.filter?.maxBp
    assert(maxBp === 2000, `テスト前提: ${card.name} は maxBp 2000（実際 ${String(maxBp)}）`)

    const s = newGame("axis-destroyall-vritra")
    putEnemy(s, "BS01-001", 1) // BP1000（対象）
    putEnemy(s, "BS01-001", 1) // BP1000（対象）
    const survivor = putEnemy(s, "BS01-025", 3) // BP10000（対象外）

    resolveAction(s, "p1", null, { type: "destroyAll", filter: { maxBp: 2000 } })
    const remain = enemyIds(s)
    assert(remain.length === 1 && remain[0] === survivor, "BP2000以下だけが全破壊され、超過は残る")
}

console.log("=== keywordFilter 軸: 指定キーワード持ちだけが破壊される（BS01-024 晶輝龍ディアマット） ===")
{
    const card = getCard("BS01-024")
    const eff = card.effects[0] as { action?: { filter?: { keyword?: string } } }
    assert(eff.action?.filter?.keyword === "soku", `テスト前提: ${card.name} は filter.keyword soku`)

    const s = newGame("axis-keyword-diamat")
    // 神速を持つカードと持たないカードを1体ずつ
    const sokuCard = getCard("BS01-064") // ジガ・ワスプ（【神速】持ち）
    const hasSoku = sokuCard.effects.some((e) => e.kind === "keyword" && e.keyword === "soku")
    assert(hasSoku, `テスト前提: ${sokuCard.name} は【神速】を持つ`)
    const soku = putEnemy(s, sokuCard.cardId, 1)
    const plain = putEnemy(s, "BS01-001", 1)

    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { keyword: "soku" } })
    const remain = enemyIds(s)
    assert(!remain.includes(soku), "【神速】持ちが破壊される")
    assert(remain.includes(plain), "【神速】を持たないものは残る")
}

console.log("=== minSymbols 軸: シンボル数が足りる対象のみ（BS04-096/104/107/114 の同型4枚） ===")
{
    // 4枚とも bpBuff amount:5000 minSymbols:2。データが同型であることを機械確認してから、
    // 代表1件で「シンボル2個には効き、1個には効かない」を検証する
    for (const id of ["BS04-096", "BS04-104", "BS04-107", "BS04-114"]) {
        const eff = getCard(id).effects[0] as { action?: { filter?: { minSymbols?: number }; amount?: number } }
        assert(
            eff.action?.filter?.minSymbols === 2 && eff.action?.amount === 5000,
            `テスト前提: ${getCard(id).name} は filter.minSymbols2 / amount5000`,
        )
    }

    const s = newGame("axis-minsymbols")
    const two = getCard("BS04-010") // 雷帝エール・クレル（シンボル2個）
    assert(two.symbol.length === 2, `テスト前提: ${two.name} はシンボル2個`)
    const one = getCard("BS01-001") // ゴラドン（シンボル1個）
    assert(one.symbol.length === 1, `テスト前提: ${one.name} はシンボル1個`)

    const twoId = putOwn(s, two.cardId, 1)
    const oneId = putOwn(s, one.cardId, 1)
    const find = (id: string) => s.players.p1.field.spirits.find((x) => x.instanceId === id)!

    // シンボル2個の側を対象指定 → 効く
    resolveAction(s, "p1", null, { type: "bpBuff", amount: 5000, filter: { minSymbols: 2 } }, twoId)
    assert(find(twoId).tempBpBuff === 5000, "シンボル2個の対象にはBP+5000が乗る")

    // シンボル1個の側を対象指定 → minSymbols を満たさないので効かない
    resolveAction(s, "p1", null, { type: "bpBuff", amount: 5000, filter: { minSymbols: 2 } }, oneId)
    assert(find(oneId).tempBpBuff === 0, "シンボル1個の対象には効かない（minSymbols 未達）")
}

console.log("=== familyFilter 軸: 指定系統だけがバフされる（BS04-097 フォレストオーラ） ===")
{
    // 2026-07-31: bpBuff(attackingAll)+filter.family から lendSelfThisTurn + kind:"aura"
    // （attackingOnly + familyFilter）へ移行済み（part76参照）。テスト前提は新データ形状で読む
    const card = getCard("BS04-097")
    const eff = card.effects.find((e) => e.kind === "aura") as
        | { aura?: { familyFilter?: string[]; attackingOnly?: boolean; amount?: number } }
        | undefined
    const families = eff?.aura?.familyFilter
    assert(
        Array.isArray(families) && families.includes("爪鳥") && families.includes("樹魔"),
        `テスト前提: ${card.name} は aura.familyFilter [爪鳥, 樹魔]`,
    )
    assert(eff?.aura?.attackingOnly === true, `テスト前提: ${card.name} は aura.attackingOnly`)
    assert(eff?.aura?.amount === 3000, `テスト前提: ${card.name} は aura.amount 3000`)

    const s = newGame("axis-family-forestaura")
    const bird = getCard("BS01-059") // シダフクロウ（爪鳥）
    const other = getCard("BS01-001") // ゴラドン（竜／対象外）
    const birdId = putOwn(s, bird.cardId, 1)
    const otherId = putOwn(s, other.cardId, 1)
    assert(spiritHasFamily(s, "p1", s.players.p1.field.spirits[0]!, "爪鳥"), "テスト前提: 爪鳥を持つ")

    // attackingOnly はアタック中のスピリットが対象。バトルを立ててアタッカーを爪鳥にする
    s.battle = {
        attackerInstanceId: birdId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined, ["green"], "magic", undefined, undefined, "BS04-097")
    const find = (id: string) => s.players.p1.field.spirits.find((x) => x.instanceId === id)!
    assert(
        effectiveBp(s, "p1", find(birdId)) === currentLevel(find(birdId)).bp + 3000,
        "系統一致のアタッカーにBP+3000が乗る",
    )
    assert(
        effectiveBp(s, "p1", find(otherId)) === currentLevel(find(otherId)).bp,
        "アタックしていない／系統不一致には乗らない",
    )

    // 系統が一致しないアタッカーには効かないことも確認する
    const s2 = newGame("axis-family-forestaura-miss")
    const plainId = putOwn(s2, "BS01-001", 1)
    s2.battle = {
        attackerInstanceId: plainId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    resolveAction(s2, "p1", null, { type: "lendSelfThisTurn" }, undefined, ["green"], "magic", undefined, undefined, "BS04-097")
    const plain = s2.players.p1.field.spirits[0]!
    assert(
        effectiveBp(s2, "p1", plain) === currentLevel(plain).bp,
        "系統が一致しないアタッカーには乗らない",
    )
}

console.log("=== vanillaFilter 軸: 効果を持たないカードだけ回復（BS03-108 鋼に覆われた高空） ===")
{
    const card = getCard("BS03-108")
    const eff = card.effects[0] as { action?: { filter?: { vanilla?: boolean } } }
    assert(eff.action?.filter?.vanilla === true, `テスト前提: ${card.name} は filter.vanilla`)

    const s = newGame("axis-vanilla-highsky")
    const vanilla = getCard("BS01-074") // バーサーカー・ガン（効果テキストなし）
    assert(vanilla.effect === "", `テスト前提: ${vanilla.name} はバニラ`)
    const withEffect = getCard("BS01-025") // 要塞龍ギガ（効果あり）
    assert(withEffect.effect !== "", `テスト前提: ${withEffect.name} は効果を持つ`)

    const vId = putOwn(s, vanilla.cardId, 1)
    const eId = putOwn(s, withEffect.cardId, 1)
    for (const x of s.players.p1.field.spirits) x.isRested = true

    resolveAction(s, "p1", null, { type: "refreshOne", filter: { vanilla: true } })
    const find = (id: string) => s.players.p1.field.spirits.find((x) => x.instanceId === id)!
    assert(!find(vId).isRested, "バニラが回復する")
    assert(find(eId).isRested, "効果持ちは疲労のまま")
}

console.log("=== all 軸: 条件を満たすものを全部（BS03-108 Lv2 の refreshOne all） ===")
{
    const s = newGame("axis-all-refresh")
    putOwn(s, "BS01-074", 1) // バニラ
    putOwn(s, "BS01-084", 1) // バニラ
    putOwn(s, "BS01-025", 1) // 効果持ち
    for (const x of s.players.p1.field.spirits) x.isRested = true

    resolveAction(s, "p1", null, { type: "refreshOne", filter: { vanilla: true }, all: true })
    const rested = s.players.p1.field.spirits.filter((x) => x.isRested)
    assert(rested.length === 1, `all 指定でバニラ2体がまとめて回復する（疲労のまま残るのは1体）`)
    assert(getCard(rested[0]!.cardId).effect !== "", "残ったのは効果持ちのほう")
}

console.log("=== familyFilter 軸（BS05-009 火龍王ボルケノス: 竜人の無償召喚） ===")
{
    const card = getCard("BS05-009")
    const eff = card.effects[0] as { action?: { type?: string; familyFilter?: string } }
    assert(
        eff.action?.type === "summonFromHandFree" && eff.action?.familyFilter === "竜人",
        `テスト前提: ${card.name} は summonFromHandFree familyFilter 竜人`,
    )

    const s = newGame("axis-family-volcanos")
    const dragoon = getCard("BS01-004") // ドラグノ偵察兵（竜人）
    assert(dragoon.family.includes("竜人"), `テスト前提: ${dragoon.name} は竜人`)
    const nonDragoon = getCard("BS01-001") // ゴラドン（竜人ではない）
    assert(!nonDragoon.family.includes("竜人"), `テスト前提: ${nonDragoon.name} は竜人でない`)

    // 手札を「竜人1枚＋非竜人1枚」にして、竜人だけが召喚されることを見る
    s.players.p1.hand = [nonDragoon.cardId, dragoon.cardId]
    const before = s.players.p1.field.spirits.length
    resolveAction(s, "p1", null, { type: "summonFromHandFree", familyFilter: "竜人" })
    assert(s.players.p1.field.spirits.length === before + 1, "1体が無償召喚される")
    const summoned = s.players.p1.field.spirits[s.players.p1.field.spirits.length - 1]!
    assert(summoned.cardId === dragoon.cardId, "召喚されたのは竜人のほう")
    assert(s.players.p1.hand.includes(nonDragoon.cardId), "竜人でないカードは手札に残る")
}

console.log("=== anySide 軸: 両陣営が対象（BS05-016 吸血女王カーミラ） ===")
{
    const card = getCard("BS05-016")
    const eff = card.effects[0] as {
        action?: { type?: string; anySide?: boolean; filter?: { rested?: boolean; cost?: { max?: number } } }
    }
    assert(eff.action?.anySide === true, `テスト前提: ${card.name} は anySide`)
    assert(eff.action?.filter?.rested === true, "テスト前提: filter.rested（疲労のみ）")
    assert(eff.action?.filter?.cost?.max === 1, "テスト前提: filter.cost.max 1")

    const s = newGame("axis-anyside-carmilla")
    const cheap = getCard("BS01-001") // ゴラドン（コスト0）
    assert(cheap.cost <= 1, `テスト前提: ${cheap.name} はコスト1以下`)
    const pricey = getCard("BS01-025") // 要塞龍ギガ（コスト8）
    assert(pricey.cost > 1, `テスト前提: ${pricey.name} はコスト1超`)

    // 自分側・相手側それぞれに「疲労した低コスト」と「疲労した高コスト」を置く
    const ownCheap = putOwn(s, cheap.cardId, 1)
    const ownPricey = putOwn(s, pricey.cardId, 1)
    const oppCheap = putEnemy(s, cheap.cardId, 1)
    const oppPricey = putEnemy(s, pricey.cardId, 1)
    for (const x of [...s.players.p1.field.spirits, ...s.players.p2.field.spirits]) x.isRested = true

    resolveAction(s, "p1", null, {
        type: "destroyAll",
        anySide: true,
        filter: { rested: true, cost: { max: 1 } },
    })
    const ownRemain = s.players.p1.field.spirits.map((x) => x.instanceId)
    const oppRemain = enemyIds(s)
    assert(!ownRemain.includes(ownCheap), "anySide: 自分側の低コスト疲労も破壊される")
    assert(!oppRemain.includes(oppCheap), "anySide: 相手側の低コスト疲労も破壊される")
    assert(ownRemain.includes(ownPricey), "コスト条件を満たさない自分側は残る")
    assert(oppRemain.includes(oppPricey), "コスト条件を満たさない相手側は残る")
}

console.log("=== all 軸（BS03-100 武器コレクターのゴドフリー: トラッシュのネクサスを全配置） ===")
{
    const card = getCard("BS03-100")
    const eff = card.effects[0] as { action?: { type?: string; all?: boolean; from?: string } }
    assert(
        eff.action?.type === "deployNexus" && eff.action?.all === true && eff.action?.from === "trash",
        `テスト前提: ${card.name} は deployNexus from:trash all`,
    )

    const s = newGame("axis-all-godfrey")
    // トラッシュにネクサス2枚とスピリット1枚を置き、ネクサスだけが全部出ることを見る
    const nexusA = "BS01-099" // 百識の谷
    const nexusB = "BS03-103" // 熾烈極める最前線
    assert(getCard(nexusA).type === "nexus" && getCard(nexusB).type === "nexus", "テスト前提: 2枚ともネクサス")
    s.players.p1.trashCards = [nexusA, "BS01-001", nexusB]

    const before = s.players.p1.field.nexuses.length
    resolveAction(s, "p1", null, {
        type: "deployNexus",
        from: "trash",
        colors: ["red", "purple", "green", "white", "yellow", "blue"],
        all: true,
    })
    assert(
        s.players.p1.field.nexuses.length === before + 2,
        `all 指定でトラッシュのネクサス2枚がまとめて配置される（実際 +${s.players.p1.field.nexuses.length - before}）`,
    )
    assert(s.players.p1.trashCards.includes("BS01-001"), "スピリットはトラッシュに残る")
}
