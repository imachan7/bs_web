// smoke パート94（メイン/フラッシュ複合マジックの「メイン」側16枚を構造化）
//
// 「メイン：〈固有効果〉／フラッシュ：〈BP+N〉」構造のうち、フラッシュ側だけが構造化され
// メイン側が丸ごと未実装だった48枚のうち、コア操作・ゾーン操作系の16枚を実装した。
//   - 既存アクションのみ: BS01-118 コールオブロスト・BS02-103 リロードコア・
//     BS03-127 アイビィーケイジ・BS03-136 フォーカスライト
//   - 既存アクションの小拡張: destroyNexus(side/levelFilter)・recoverSpiritFromTrash(all)・
//     coreSqueezeOne(anySide)・returnNexusToHand(anySide/voidCoreToOwnTrashIfOpponent)・
//     bothSidesCoreToTrash(コアの多い個体から順に合計count個へアルゴリズム変更)
//   - 新規アクション: nexusCoresToTrash・drawUpTo・trashSpiritsToDeckBottom・
//     voidCoresToNexusLevel・opponentNexusOrReserveCoreToTrash・bothSidesCoreToVoid
//
// すべて実際の castMagic（GameAction）経由でcards.jsonのmainエントリを通す
import { act, assert, createGame, createInstance } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

// メインステップ・非バトル中の状態を作る（castMagicがそのままmainエントリを解決できる）
function setupMain(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== BS01-118 コールオブロスト：メイン＝自分のトラッシュのスピリットカード1枚を手札に戻す ===")
{
    const s = setupMain("callofglost-main")
    s.players.p1.hand = ["BS01-118"]
    s.players.p1.trashCards = ["BS01-001"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(s.players.p1.hand.includes("BS01-001"), "トラッシュのスピリットカードが手札に戻る")
    assert(!s.players.p1.trashCards.includes("BS01-001"), "トラッシュからは消える")
}

console.log("=== BS02-103 リロードコア：メイン＝系統「武装」1体につきボイドからコア1個をリザーブへ ===")
{
    const s = setupMain("reloadcore-main")
    s.players.p1.hand = ["BS02-103"]
    put(s, "p1", "BS01-084", 1) // ガトリングスタンド（武装）
    put(s, "p1", "BS01-084", 1) // 武装2体目
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    // 白シンボル2つ（武装2体）が軽減シンボル[white,white]に一致し、コストは5-2=3に軽減される
    assert(s.players.p1.reserve === 10 - 3 + 2, "軽減後コスト3支払い後、武装2体ぶんコア2個をリザーブへ")
}

console.log("=== BS03-127 アイビィーケイジ：メイン＝BP2000以下のスピリットすべてを疲労させる（両陣営） ===")
{
    const s = setupMain("ivycage-main")
    s.players.p1.hand = ["BS03-127"]
    const lowP1 = put(s, "p1", "BS01-001", 1) // ゴラドン Lv1 BP1000
    const highP1 = put(s, "p1", "BS01-001", 3) // ゴラドン Lv2 BP3000
    const lowP2 = put(s, "p2", "BS01-001", 1)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(lowP1.isRested, "自分側のBP2000以下は疲労する")
    assert(!highP1.isRested, "自分側のBP2000超は疲労しない")
    assert(lowP2.isRested, "相手側のBP2000以下も疲労する（side:both）")
}

console.log("=== BS03-136 フォーカスライト：メイン＝【光芒】1体につき自分がデッキから1枚ドロー ===")
{
    const s = setupMain("focuslight-main")
    s.players.p1.hand = ["BS03-136"]
    put(s, "p1", "BS03-054", 1) // アルカナドール・トリア（光芒）
    put(s, "p1", "BS03-059", 1) // アルカナビースト・ペイラ（光芒）
    const handBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    // 使用したカード自身が手札から抜けた分(-1)＋光芒2体ぶんドロー(+2)
    assert(s.players.p1.hand.length === handBefore - 1 + 2, "光芒2体ぶん2枚ドローする")
}

console.log("=== BS01-120 バスターファランクス：メイン＝ネクサスすべてを破壊する（両陣営） ===")
{
    const s = setupMain("busterphalanx-main")
    s.players.p1.hand = ["BS01-120"]
    putNexus(s, "p1", "BS01-108", 0)
    putNexus(s, "p2", "BS01-108", 0)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(s.players.p1.field.nexuses.length === 0, "自分のネクサスも破壊される")
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサスも破壊される")
}

console.log("=== BS03-119 バスターランス：メイン＝Lv1のネクサスすべてを破壊する（両陣営） ===")
{
    const s = setupMain("busterlance-main")
    s.players.p1.hand = ["BS03-119"]
    putNexus(s, "p1", "BS01-108", 0) // Lv1（cores0）
    putNexus(s, "p2", "BS01-108", 2) // Lv2（cores2）
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(s.players.p1.field.nexuses.length === 0, "Lv1のネクサスは破壊される")
    assert(s.players.p2.field.nexuses.length === 1, "Lv2のネクサスは対象外")
}

console.log("=== BS03-123 ネクロマンシー：メイン＝系統「無魔」のトラッシュのスピリットカードすべてを手札に戻す ===")
{
    const s = setupMain("necromancy-main")
    s.players.p1.hand = ["BS03-123"]
    s.players.p1.trashCards = ["BS01-029", "BS01-032", "BS01-001"] // 無魔・無魔・爬獣
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(s.players.p1.hand.includes("BS01-029"), "無魔1枚目が手札に戻る")
    assert(s.players.p1.hand.includes("BS01-032"), "無魔2枚目が手札に戻る")
    assert(s.players.p1.trashCards.includes("BS01-001"), "無魔以外はトラッシュに残る")
}

console.log("=== BS03-125 ウィークネス：メイン＝スピリット1体のコアを1個だけ残す（非対話時は相手BP最大） ===")
{
    const s = setupMain("weakness-main")
    s.players.p1.hand = ["BS03-125"]
    const target = put(s, "p2", "BS01-001", 3)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(target.cores === 1, "対象のコアは1個だけ残る")
    assert(s.players.p2.reserve === 10 + 2, "超過分2個は持ち主のリザーブへ")
}

console.log("=== BS03-130 メビウスリング：メイン＝ネクサス1つを手札に戻す（相手なら自分のトラッシュにコア） ===")
{
    const s = setupMain("mebiusring-main")
    s.players.p1.hand = ["BS03-130"]
    putNexus(s, "p2", "BS01-108", 1)
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサスが場から消える")
    assert(s.players.p2.hand.includes("BS01-108"), "相手の手札に戻る")
    // trashCoresには使用コスト支払い分（コスト軽減後の実コスト）も入るため、
    // 支払ったコスト分＋効果分1個で比較する（軽減計算をテスト側でハードコードしない）
    const costPaid = reserveBefore - s.players.p1.reserve
    assert(s.players.p1.trashCores === costPaid + 1, "相手のネクサスを戻したので自分のトラッシュにコア1個（コスト支払い分＋1）")
}

console.log("=== BS02-093 マインドコントロール：メイン＝お互いのスピリットのコア4個ずつをトラッシュへ ===")
{
    const s = setupMain("mindcontrol-main")
    s.players.p1.hand = ["BS02-093"]
    const p1Rich = put(s, "p1", "BS01-001", 3)
    const p1Poor = put(s, "p1", "BS01-001", 2)
    put(s, "p2", "BS01-001", 2)
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === p1Rich.instanceId), "コア最多の1体目は0個で消滅する")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === p1Poor.instanceId && sp.cores === 1), "残りの1個は次の1体から")
    // trashCoresには使用コスト支払い分も入るため、支払ったコスト分＋効果分4個で比較する
    const costPaid = reserveBefore - s.players.p1.reserve
    assert(s.players.p1.trashCores === costPaid + 4, "自分側は合計4個トラッシュへ（コスト支払い分＋4）")
    assert(s.players.p2.field.spirits.length === 0, "相手側は保有コア(2個)ぶんで消滅する")
    assert(s.players.p2.trashCores === 2, "相手側は上限の2個だけトラッシュへ")
}

console.log("=== BS03-122 フォールダウン：メイン＝ネクサスすべての上のコアをすべてトラッシュへ ===")
{
    const s = setupMain("falldown-main")
    s.players.p1.hand = ["BS03-122"]
    const n1 = putNexus(s, "p1", "BS01-108", 2)
    const n2 = putNexus(s, "p2", "BS01-108", 3)
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(n1.cores === 0 && n2.cores === 0, "両陣営のネクサスのコアが0になる")
    assert(s.players.p1.field.nexuses.length === 1 && s.players.p2.field.nexuses.length === 1, "ネクサス自体は消滅しない")
    // trashCoresには使用コスト支払い分も入るため、支払ったコスト分＋効果分2個で比較する
    const costPaid = reserveBefore - s.players.p1.reserve
    assert(s.players.p1.trashCores === costPaid + 2, "自分のトラッシュにコア2個（コスト支払い分＋2）")
    assert(s.players.p2.trashCores === 3, "相手のトラッシュにコア3個")
}

console.log("=== BS03-118 フォースドロー：メイン＝手札が4枚になるまでドローする ===")
{
    const s = setupMain("forcedraw-main")
    s.players.p1.hand = ["BS03-118", "BS01-001", "BS01-001"] // 使用後は残り2枚
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(s.players.p1.hand.length === 4, "手札が4枚になるまでドローする")
}

console.log("=== BS04-105 トリックプランク：メイン＝トラッシュのスピリットカード5枚をデッキの下へ ===")
{
    const s = setupMain("trickplank-main")
    s.players.p1.hand = ["BS04-105"]
    s.players.p1.trashCards = ["BS01-001", "BS01-029", "BS01-032", "BS01-084", "BS03-054"]
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    // 使用したカード自身(BS04-105)だけがトラッシュに残る
    assert(s.players.p1.trashCards.length === 1 && s.players.p1.trashCards[0] === "BS04-105", "スピリットカード5枚はトラッシュから消える")
    assert(s.players.p1.deck.length === deckBefore + 5, "デッキの下に5枚戻る")
}

console.log("=== BS04-098 フルアッド：メイン＝自分のネクサス1つがLv2になるようボイドからコアを置く ===")
{
    const s = setupMain("fullload-main")
    s.players.p1.hand = ["BS04-098"]
    const nexus = putNexus(s, "p1", "BS01-108", 0) // Lv1（cores0、Lv2は要cores2）
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(nexus.cores === 2, "Lv2に必要な分（2個）だけコアが置かれる")
}

console.log("=== BS02-092 エナジードレイン：メイン＝相手のネクサス/リザーブのコア1個をトラッシュへ ===")
{
    const s = setupMain("energydrain-main")
    s.players.p1.hand = ["BS02-092"]
    const nexus = putNexus(s, "p2", "BS01-108", 3)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(nexus.cores === 2, "相手ネクサスのコアが優先して減る")
    assert(s.players.p2.reserve === 10, "ネクサスにコアがある間はリザーブは減らない")
    assert(s.players.p2.trashCores === 1, "相手のトラッシュにコア1個")
}

console.log("=== BS04-096 インフェルノアイズ：メイン＝お互いのスピリット/ネクサスのコア4個をボイドへ（条件付き） ===")
{
    const s = setupMain("infernoeyes-main")
    s.players.p1.hand = ["BS04-096"]
    const p1Spirit = put(s, "p1", "BS04-010", 2) // 雷帝エール・クレル（シンボル2つ）＝条件を満たす発生源
    const p1Nexus = putNexus(s, "p1", "BS01-108", 5) // コア最多はこちら（スピリットより優先して取られる）
    put(s, "p2", "BS01-001", 2)
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(p1Nexus.cores === 1, "自分側はコアの多いネクサスから優先して4個ボイドへ")
    assert(p1Spirit.cores === 2, "ネクサスだけで4個に達するため、自分のスピリットは対象にならない")
    assert(s.players.p2.field.spirits.length === 0, "相手側は保有コアぶんで消滅する")
    // p1.trashCoresに入るのは使用コスト支払い分のみ（効果自体はボイド送りでトラッシュを増やさない）
    const costPaid = reserveBefore - s.players.p1.reserve
    assert(s.players.p1.trashCores === costPaid, "自分のトラッシュはコスト支払い分のみ（効果はボイド送りで増やさない）")
    assert(s.players.p2.trashCores === 0, "相手はコストを払っていないのでトラッシュは増えない（ボイド送りのため）")
}

console.log("=== BS04-096 インフェルノアイズ：条件不成立（シンボル2つ以上のスピリットがいない）ならメインは不発 ===")
{
    const s = setupMain("infernoeyes-noop-main")
    s.players.p1.hand = ["BS04-096"]
    const p1Spirit = put(s, "p1", "BS01-001", 2) // シンボル1つのみ
    const p2Spirit = put(s, "p2", "BS01-001", 2)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(p1Spirit.cores === 2 && p2Spirit.cores === 2, "条件不成立のためコアは変化しない")
}
