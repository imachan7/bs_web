// smoke パート72（カードデータ経由が未検証だった action の回帰・BS01〜BS02 分担）
//
// `npm run coverage:effects` の (b)「テストが手で組んだ action でしか実行されていない」に
// 出ていた21種のうち、**使用カードが BS01〜BS02 を含む8種**をこちらが担当する
// （BS03〜BS05 のみの13種は実装担当が part68。chatbox 2026-07-26 の分担）。
//
// (b) は「機構は動くが cards.json の記述（trigger / timing / levels / カウンタ指定）が
// 一度も検証されていない」層。**必ずカードを実際に使う経路で書く**
// （`resolveAction` を直接叩くと機構は通るが (b) から消えない＝データの誤りを拾えない）。
import { act, assert, createGame, createInstance, effectiveBp, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

// p1 のメインステップ（召喚・メインマジックが使える状態）を作る
function setupMain(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20 // コスト検証で落ちないようにする（本題はコストではない）
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

// 手札の先頭にカードを置いて召喚する（カードデータ経由の召喚時効果を通すため）
function summonFromHand(s: GameState, pid: PlayerId, cardId: string, level?: number): string | null {
    s.players[pid].hand = [cardId]
    const before = new Set(s.players[pid].field.spirits.map((sp) => sp.instanceId))
    const err = act(s, pid, level === undefined ? { type: "summon", handIndex: 0 } : { type: "summon", handIndex: 0, level })
    if (err !== null) return null
    const added = s.players[pid].field.spirits.find((sp) => !before.has(sp.instanceId))
    return added?.instanceId ?? null
}

console.log("=== §A bothSidesCoreToTrash（BS01-087 メタルディー・バグ・召喚時） ===")
{
    const s = setupMain("both-sides-core")
    const mine = put(s, "p1", "BS01-001", 3) // ゴラドン（コア3個。1個減っても消えない）
    const theirs = put(s, "p2", "BS01-001", 3)
    const p1Trash = s.players.p1.trashCores
    const p2Trash = s.players.p2.trashCores
    const p1Reserve = s.players.p1.reserve

    const summoned = summonFromHand(s, "p1", "BS01-087") // 白・コスト4
    assert(summoned !== null, "メタルディー・バグを召喚できる")
    // 召喚時効果: お互いのスピリット1体からコア1個ずつを**それぞれの持ち主の**トラッシュへ
    assert(spiritOf(s, "p1", mine)?.cores === 2, "自分のスピリットのコアが1個減る")
    assert(spiritOf(s, "p2", theirs)?.cores === 2, "相手のスピリットのコアが1個減る")
    // 自分側は召喚コストのコアもトラッシュへ行くので、支払い分を差し引いて見る
    // （リザーブの減少 = 支払ったコスト + 維持コア1個。トラッシュへ行くのは支払ったコストのみ）
    const paidCost = p1Reserve - s.players.p1.reserve - 1
    assert(
        s.players.p1.trashCores === p1Trash + paidCost + 1,
        `減ったコアは自分のトラッシュへ（コスト${paidCost}＋効果1個）`,
    )
    assert(s.players.p2.trashCores === p2Trash + 1, "減ったコアは相手のトラッシュへ")
}

console.log("=== §B coreDrainAllOthers（BS01-X02 魔界七将デスペラード・召喚時） ===")
{
    const s = setupMain("core-drain")
    const survivor = put(s, "p1", "BS01-001", 3) // コア3個＝1個抜かれても生存
    const doomed = put(s, "p2", "BS01-001", 1) // コア1個＝抜かれて消滅する
    const p1Reserve = s.players.p1.reserve
    const p2Reserve = s.players.p2.reserve

    const desperado = summonFromHand(s, "p1", "BS01-X02") // 紫・コスト8
    assert(desperado !== null, "デスペラードを召喚できる")
    assert(spiritOf(s, "p1", survivor)?.cores === 2, "self 以外の自分スピリットもコア1個を失う")
    assert(spiritOf(s, "p2", doomed) === undefined, "コア1個の相手スピリットは消滅する")
    // 抜いたコアは持ち主のリザーブへ（自分は召喚コストを払っているので増分で見る）
    assert(s.players.p2.reserve === p2Reserve + 1, "相手のコアは相手のリザーブへ")
    assert(s.players.p1.reserve < p1Reserve, "自分はコストを支払っている（リザーブが減っている）")
    // 消滅した数ぶん、ボイドから self にコアが置かれる（維持コア1個＋1個＝2個）
    const self = spiritOf(s, "p1", desperado ?? "")
    assert(self !== undefined && self.cores >= 2, `消滅数ぶん self にコアが置かれる（実際: ${self?.cores}）`)
}

console.log("=== §C deckReveal（BS01-067 スワロウアイヴィー・召喚時 / BS03-142 サルベージ・メイン） ===")
{
    const s = setupMain("deck-reveal-spirit")
    // デッキ上5枚のうち2枚目をネクサスにする（pickType:"nexus" が選ぶのは最初の1枚）
    s.players.p1.deck = ["BS01-001", "BS04-082", "BS01-001", "BS01-050", "BS01-074", ...s.players.p1.deck]
    const deckBefore = s.players.p1.deck.length

    const summoned = summonFromHand(s, "p1", "BS01-067") // 緑・コスト5
    assert(summoned !== null, "スワロウアイヴィーを召喚できる")
    assert(s.players.p1.hand.includes("BS04-082"), "公開5枚のネクサスカードが手札に加わる")
    assert(
        s.players.p1.deck.length === deckBefore - 1,
        "手札に加えた1枚だけデッキから減る（残り4枚は下に戻る）",
    )
    assert(
        s.players.p1.deck.slice(-4).every((c) => ["BS01-001", "BS01-050", "BS01-074"].includes(c)),
        "残り4枚はデッキの下に戻る",
    )
}
{
    const s = setupMain("deck-reveal-magic")
    s.players.p1.deck = ["BS01-001", "BS01-001", "BS04-082", "BS01-050", "BS01-074", ...s.players.p1.deck]
    s.players.p1.hand = ["BS03-142"] // サルベージ（青・コスト4・メイン）
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "サルベージをメインで使用できる")
    assert(s.players.p1.hand.includes("BS04-082"), "メインタイミングの deckReveal でもネクサスを回収する")
    assert(s.players.p1.trashCards.includes("BS03-142"), "使用したマジックはトラッシュへ")
}
{
    // countPer / pickAllOfType の分岐（BS02-X08 ミカファール）: 黄のスピリット/ネクサス数ぶん公開し、
    // その中のマジックカード**すべて**を手札に加える
    const s = setupMain("deck-reveal-per")
    put(s, "p1", "BS02-049", 1) // 黄スピリット
    putNexus(s, "p1", "BS03-110", 0) // 黄ネクサス → 公開枚数は2枚
    s.players.p1.deck = ["BS01-137", "BS01-147", "BS01-001", ...s.players.p1.deck] // 上2枚はマジック
    const summoned = summonFromHand(s, "p1", "BS02-X08") // 黄・コスト7
    assert(summoned !== null, "ミカファールを召喚できる")
    assert(
        s.players.p1.hand.includes("BS01-137") && s.players.p1.hand.includes("BS01-147"),
        "公開した中のマジックカードすべてが手札に加わる（countPer + pickAllOfType）",
    )
}

console.log("=== §D destroyAllNexusesExceptChosenColors（BS02-010 溶海竜プレシオス・召喚時） ===")
{
    const s = setupMain("nexus-except-colors")
    // 合計3色以上が条件。p1: 赤2＋緑1 → 最多は赤／p2: 白1 → 白
    const red1 = putNexus(s, "p1", "BS03-102", 0)
    const red2 = putNexus(s, "p1", "BS01-098", 0)
    const green = putNexus(s, "p1", "BS02-080", 0)
    const white = putNexus(s, "p2", "BS04-082", 0)

    const summoned = summonFromHand(s, "p1", "BS02-010") // 赤・コスト6
    assert(summoned !== null, "プレシオスを召喚できる")
    const p1Nexuses = s.players.p1.field.nexuses.map((n) => n.instanceId)
    assert(p1Nexuses.includes(red1) && p1Nexuses.includes(red2), "自分の指定色（赤）のネクサスは残る")
    assert(!p1Nexuses.includes(green), "指定されなかった色（緑）のネクサスは破壊される")
    assert(
        s.players.p2.field.nexuses.some((n) => n.instanceId === white),
        "相手の指定色（白）のネクサスは残る",
    )
}
{
    // 条件（合計3色以上）を満たさないときは何も起きない。
    // ⚠️ この節は**条件を外したときに壊れる配置**にしないと意味がない。
    // 「p1が赤・p2が白」の2色だと、条件を無視して発動しても双方が自色を指定して誰も破壊されず、
    // 変異テストで落ちなかった（テストが空回りしていた）。
    // そこで**同じ陣営に赤2＋緑1**を置く: 条件を無視して発動すれば緑が破壊されるので差が出る
    const s = setupMain("nexus-except-colors-nocond")
    const red1 = putNexus(s, "p1", "BS03-102", 0)
    const red2 = putNexus(s, "p1", "BS01-098", 0)
    const green = putNexus(s, "p1", "BS02-080", 0) // 合計2色（赤・緑）＝条件未達
    assert(summonFromHand(s, "p1", "BS02-010") !== null, "プレシオスを召喚できる（2色）")
    const ids = s.players.p1.field.nexuses.map((n) => n.instanceId)
    assert(
        ids.includes(red1) && ids.includes(red2) && ids.includes(green),
        "ネクサスが2色しかないときは1つも破壊されない（minTotalColors:3 の条件が効いている）",
    )
}

console.log("=== §E exhaustAllByColor（BS01-140 バインディングウッズ・メイン） ===")
{
    const s = setupMain("exhaust-by-color")
    // 相手（p2）の最多色が自動指定される。
    // ⚠️ **自分と相手の最多色を別の色にする**こと。同じ色だと「相手側を見る」判定を壊しても
    // 結果が変わらず、変異テストで落ちない（実際にこの配置で空回りしていた）。
    //   p2（相手）: 赤2体・白1体 → 指定は赤
    //   p1（自分）: 白2体・赤1体 → 自分側を見る実装なら白が指定されてしまう
    const red1 = put(s, "p2", "BS01-001", 1)
    const red2 = put(s, "p2", "BS01-002", 1)
    const white = put(s, "p2", "BS01-074", 1)
    const ownRed = put(s, "p1", "BS01-001", 1) // 指定色は「お互いの」スピリットが対象
    const ownWhite1 = put(s, "p1", "BS01-074", 1)
    const ownWhite2 = put(s, "p1", "BS01-086", 1) // クイーン・ワルキューレ（白）

    s.players.p1.hand = ["BS01-140"] // 緑・コスト7・メイン
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "バインディングウッズをメインで使用できる")
    assert(spiritOf(s, "p2", red1)?.isRested === true, "指定色の相手スピリットが疲労する")
    assert(spiritOf(s, "p2", red2)?.isRested === true, "指定色の相手スピリットが疲労する（2体目）")
    assert(spiritOf(s, "p2", white)?.isRested === false, "指定色でない相手スピリットは疲労しない")
    assert(spiritOf(s, "p1", ownRed)?.isRested === true, "自分の同色スピリットも疲労する（お互いが対象）")
    assert(
        spiritOf(s, "p1", ownWhite1)?.isRested === false &&
            spiritOf(s, "p1", ownWhite2)?.isRested === false,
        "指定色は相手フィールドの最多色（自分の最多色＝白は指定されない）",
    )
}

console.log("=== §F bpBuffPer（BS01-137 リレイションソウル・フラッシュ） ===")
{
    const s = setupMain("bp-buff-per")
    const target = put(s, "p2", "BS01-001", 1) // p2 のスピリット（BP1000）
    const attacker = put(s, "p1", "BS01-002", 1)
    // p1（=リレイションソウルを使う p2 から見た相手）に疲労スピリットを2体用意する
    const rested1 = put(s, "p1", "BS01-001", 1)
    const rested2 = put(s, "p1", "BS01-001", 1)
    spiritOf(s, "p1", rested1)!.isRested = true
    spiritOf(s, "p1", rested2)!.isRested = true

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")
    const bpBefore = effectiveBp(s, "p2", spiritOf(s, "p2", target)!)

    s.players.p2.hand = ["BS01-137"] // 緑・コスト4・フラッシュ
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: target }) === null,
        "リレイションソウルをフラッシュで使用できる",
    )
    // アタック宣言でアタッカーも疲労するため、疲労中の相手は3体（+3000）
    const bpAfter = effectiveBp(s, "p2", spiritOf(s, "p2", target)!)
    assert(
        bpAfter === bpBefore + 3000,
        `相手の疲労スピリット数×1000 だけBPが上がる（${bpBefore} → ${bpAfter}）`,
    )
}

console.log("=== §G grantColorChoice（BS02-104 アディショナルカラー・フラッシュ） ===")
{
    const s = setupMain("grant-color")
    const target = put(s, "p1", "BS01-001", 1) // 赤のゴラドン
    const attacker = put(s, "p1", "BS01-002", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")

    // アタック宣言後の優先権は防御側から。防御側がパスしてからアタック側が使う
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパス（優先権がアタック側へ）")
    s.players.p1.hand = ["BS02-104"] // 黄・コスト2・フラッシュ
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: target }) === null,
        "アディショナルカラーをフラッシュで使用できる",
    )
    // 対象は castMagic で渡したので、残るのは「どの色を与えるか」の選択（kind:"option"）。
    // option の選択は候補1件でも自動解決されない仕様なので、明示的に応答する
    assert(s.pendingChoice?.kind === "option", "色の選択（kind: option）が要求される")
    // ⚠️ 現在の実装は**6色すべて**を選択肢に出す（本来の色＝赤も含む）。
    // カード文は「本来持っている色とは別に、もう1色」なので、厳密には自色を除くべき。
    // ただし自色を選んでも tempColors に同じ色が入るだけで挙動は変わらない（意味のない選択肢が出るだけ）ため、
    // ここでは**現状の挙動を固定**しておく（忠実化する場合はこの assert を反転させる）
    assert(
        (s.pendingChoice?.options ?? []).length === 6,
        `選択肢は6色（現状は自色も含む。実際: ${JSON.stringify(s.pendingChoice?.options)}）`,
    )
    assert(act(s, "p1", { type: "resolveChoice", option: "白" }) === null, "色「白」を選ぶ")

    const inst = spiritOf(s, "p1", target)
    assert(
        inst !== undefined && inst.tempColors.length === 1 && inst.tempColors.includes("white"),
        `本来の色とは別の1色（白）が付与される（実際: ${JSON.stringify(inst?.tempColors)}）`,
    )
}

console.log("=== §H returnToDeckTop（BS01-147 ドリームチェスト・フラッシュ） ===")
{
    const s = setupMain("return-deck-top")
    const victim = put(s, "p2", "BS01-002", 1)
    const attacker = put(s, "p1", "BS01-001", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")

    const deckBefore = s.players.p2.deck.length
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパス（優先権がアタック側へ）")
    s.players.p1.hand = ["BS01-147"] // 白・コスト5・フラッシュ
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: victim }) === null,
        "ドリームチェストをフラッシュで使用できる",
    )
    assert(spiritOf(s, "p2", victim) === undefined, "対象スピリットがフィールドを離れる")
    assert(s.players.p2.deck[0] === "BS01-002", "持ち主のデッキの一番上に戻る")
    assert(s.players.p2.deck.length === deckBefore + 1, "デッキが1枚増えている")
    assert(!s.players.p2.trashCards.includes("BS01-002"), "トラッシュには行かない（破壊ではない）")
    assert(getCard("BS01-002").name === "ロクケラトプス", "対象カードの同定（cards.json と照合）")
}
