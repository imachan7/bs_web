// smoke パート336（064冥府へ続く魔門：Lv2【不死】の無償召喚＝kind:"fushiFreeByExhaust"。
// Lv1-2の既存実装の簡略化（手札末尾の自動破棄）を直す＝手札破棄選択を使う）
//
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械確認してから使う。
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fushiCandidates, fushiSummonOrConfirm } from "../../server/src/logic/revive"
import { fireFieldEventTriggers } from "../../server/src/logic/triggers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "white" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.phase = "attack"
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    const meimon = getCard("BS15-064")
    assert(meimon.name === "冥府へ続く魔門" && meimon.type === "nexus" && meimon.colors.includes("purple"), "BS15-064 は紫の冥府へ続く魔門")
    const fognix = getCard("BS14-021")
    assert(fognix.name === "不紫鳥フォグニクス" && fognix.cost === 6, "BS14-021 は不紫鳥フォグニクス（コスト6・【不死：コスト4/5】・召喚時Lv枚数ドロー）")
    const nezado = getCard("BS15-X02")
    assert(nezado.name === "虚皇帝ネザード・バァラル" && nezado.cost === 7, "BS15-X02 は虚皇帝ネザード・バァラル（コスト7・【不死：夜族】）")
}

console.log("=== §A fushiCandidates：通常コストが払えなくても、未疲労のLv2魔門があれば維持コアだけで候補になる ===")
{
    const s = game("p336-a", false)
    const meimon = putNexus(s, "p1", "BS15-064", 2) // Lv2
    s.players.p1.trashCards.push("BS14-021") // コスト6・維持コア1
    s.players.p1.reserve = 1 // 通常コスト(6)+維持コア(1)は払えないが、維持コア(1)だけなら払える
    const candidates = fushiCandidates(s, "p1", [4]) // コスト4のスピリットが破壊された
    assert(candidates.includes(0), "未疲労のLv2魔門があれば、維持コアだけで候補になる")
    void meimon
}

console.log("=== 対照: 魔門が疲労状態だと候補にならない ===")
{
    const s = game("p336-a2", false)
    const meimon = putNexus(s, "p1", "BS15-064", 2)
    meimon.isRested = true
    s.players.p1.trashCards.push("BS14-021")
    s.players.p1.reserve = 1
    const candidates = fushiCandidates(s, "p1", [4])
    assert(!candidates.includes(0), "疲労状態の魔門では無償召喚の候補にならない（対照）")
}

console.log("=== 対照: コスト7（maxCost超）は魔門があっても維持コアだけでは候補にならない ===")
{
    const s = game("p336-a3", false)
    putNexus(s, "p1", "BS15-064", 2)
    s.players.p1.trashCards.push("BS15-X02") // コスト7・維持コア1・【不死：夜族】
    s.players.p1.reserve = 1
    const candidates = fushiCandidates(s, "p1", [], ["夜族"])
    assert(!candidates.includes(0), "コスト7はmaxCost(6)を超えるので無償召喚の候補にならない（対照）")
}

console.log("=== §B 対話：選択肢は払える側だけ出る（通常コスト不可・無償のみ） ===")
{
    const s = game("p336-b", true)
    putNexus(s, "p1", "BS15-064", 2)
    s.players.p1.trashCards.push("BS14-021")
    s.players.p1.reserve = 1
    assert(act(s, "p1", { type: "attack", instanceId: put(s, "p1", "BS01-001", 1).instanceId }) === null, "アタック宣言（フラッシュ開始。fushiCandidatesのphase===attack前提を満たすため）")
    // fushiの確認はremoval.fushiSummonOrConfirm経由（破壊誘発から呼ばれる）。ここではsuspendFushiSummonの
    // 選択肢だけを直接見るため、破壊誘発を経由せず、pendingChoiceの立て方を共有するfushiSummonOrConfirmを
    // 直接呼ぶ（removalモジュールの既存の呼び出し方。part300と同じ白箱テスト）
    fushiSummonOrConfirm(s, "p1", 0)
    const options = s.pendingChoice?.options ?? []
    assert(options.includes("魔門を疲労させて無償で召喚する"), "無償で召喚する選択肢が出る")
    assert(!options.includes("コストを支払って召喚する"), "通常コストを払う選択肢は出ない（払えないため）")
}

console.log("=== §B2 対話：両方払えるときは両方の選択肢が出る ===")
{
    const s = game("p336-b2", true)
    putNexus(s, "p1", "BS15-064", 2)
    s.players.p1.trashCards.push("BS14-021")
    s.players.p1.reserve = 20 // 通常コストも払える
    fushiSummonOrConfirm(s, "p1", 0)
    const options = s.pendingChoice?.options ?? []
    assert(options.includes("魔門を疲労させて無償で召喚する"), "無償で召喚する選択肢が出る")
    assert(options.includes("コストを支払って召喚する"), "通常コストを払う選択肢も出る")
}

console.log("=== §C 無償召喚を選ぶと、魔門が疲労し、召喚時効果（Lv枚数ドロー）は発揮されない ===")
{
    const s = game("p336-c", true)
    const meimon = putNexus(s, "p1", "BS15-064", 2)
    s.players.p1.trashCards.push("BS14-021")
    s.players.p1.reserve = 1
    const handBefore = s.players.p1.hand.length
    fushiSummonOrConfirm(s, "p1", 0)
    assert(act(s, "p1", { type: "resolveChoice", option: "魔門を疲労させて無償で召喚する" }) === null, "無償で召喚するを選ぶ")
    assert(meimon.isRested, "魔門が疲労する")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-021"), "コストを支払わずに召喚された")
    assert(s.players.p1.reserve === 0, "維持コア1個ぶんだけリザーブが減る（召喚コストは0）")
    assert(s.players.p1.hand.length === handBefore, "『召喚時』効果（Lvぶんドロー）は発揮されない")
}

console.log("=== 対照: 通常どおりコストを支払って召喚すると、召喚時効果は発揮される ===")
{
    const s = game("p336-c2", true)
    const meimon = putNexus(s, "p1", "BS15-064", 2)
    s.players.p1.trashCards.push("BS14-021")
    s.players.p1.reserve = 20
    const handBefore = s.players.p1.hand.length
    fushiSummonOrConfirm(s, "p1", 0)
    assert(act(s, "p1", { type: "resolveChoice", option: "コストを支払って召喚する" }) === null, "コストを支払って召喚するを選ぶ")
    assert(!meimon.isRested, "対照：通常召喚では魔門は疲労しない")
    assert(s.players.p1.hand.length === handBefore + 1, "対照：『召喚時』効果（Lv1ぶん1枚ドロー）が発揮される")
}

console.log("=== §D Lv1-2の手札破棄は持ち主が選ぶ（末尾の自動破棄という簡略化を直す） ===")
{
    const s = game("p336-d", true)
    putNexus(s, "p1", "BS15-064", 0) // Lv1でも発揮する
    const attacker = put(s, "p1", "BS15-011", 1) // 紫のスピリット（アタックする本人）
    s.players.p1.hand = ["BS01-001", "BS02-040"] // 破棄候補2枚（末尾=BS02-040が旧実装での自動選択先）
    fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p1", inst: attacker }, getCard(attacker.cardId).colors)
    assert(s.pendingChoice?.kind === "card" && s.pendingChoice.cardZone === "hand", "破棄する手札の選択待ちになる（自動で決め打ちしない）")
    const cardIndices = s.pendingChoice?.cardIndices ?? []
    assert(cardIndices.length === 2, "手札2枚とも候補に出る")
    // 持ち主は先頭（BS01-001）を選ぶ。旧実装（末尾の自動破棄）ならBS02-040が破棄されていたはず
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, "先頭の手札を選んで破棄する")
    assert(!s.players.p1.hand.includes("BS01-001"), "選んだ手札（先頭）が破棄された")
    assert(s.players.p1.hand.includes("BS02-040"), "選ばなかった手札（末尾）は残る（旧実装なら消えていたはず）")
    assert(attacker.colorlessThisBattle === true, "このバトルの間、アタッカーの色は無いものとして扱われる")
}

console.log("=== 対照: 非対話では決定的に選ぶ（先頭の1枚） ===")
{
    const s = game("p336-d2", false)
    putNexus(s, "p1", "BS15-064", 0)
    const attacker = put(s, "p1", "BS15-011", 1)
    s.players.p1.hand = ["BS01-001", "BS02-040"]
    fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p1", inst: attacker }, getCard(attacker.cardId).colors)
    assert(!s.players.p1.hand.includes("BS01-001"), "非対話では先頭の手札が破棄される（決定的簡略化）")
    assert(s.players.p1.hand.includes("BS02-040"), "末尾の手札は残る")
}

console.log("すべてのチェックに合格しました 🎉（part336）")
