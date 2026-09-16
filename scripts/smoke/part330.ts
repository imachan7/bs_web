// smoke パート330（BS15 共通器：色をまたぐ判定・虚神のコスト固定・神将のライフ上限。
// カードデータ非依存のテスト用合成カードで確認する。CLAUDE.md「実装前に設計を示して確認する」に基づき
// 確定した仕様: opponentFieldColorCount（色の種類数）／ownFieldOnlyColor（1色しかない）／
// lifeDamagePerSpiritRemaining（神将）／costSetOverrideのownBurstSet条件（虚神）／
// costModTotalのbeforeReduction・amountCounter（軽減前のコスト増）
import { act, assert, createGame, createInstance, effectiveCost, resolveAction, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { CARD_DB } from "../../server/src/logic/GameState"
import type { CardData } from "../../server/src/type"
import { lifeDamagePerSpiritRemaining, opponentFieldColorCount, ownFieldOnlyColor } from "../../shared/rules"

function makeCard(cardId: string, over: Partial<CardData> = {}): CardData {
    const c: CardData = {
        cardId,
        name: `テスト${cardId}`,
        type: "spirit",
        colors: ["red"],
        cost: 3,
        reduction: [],
        family: [],
        levels: [{ level: 1, cores: 1, bp: 1000 }],
        symbol: ["red"],
        flash: false,
        rarity: "C",
        limited: false,
        effect: "（テスト用）",
        effects: [],
        ...over,
    }
    CARD_DB.set(cardId, c)
    return c
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== 1. opponentFieldColorCount：色の種類数 ===")
{
    makeCard("T330-MULTI", { colors: ["red", "white"] })
    makeCard("T330-RED-A", { colors: ["red"] })
    makeCard("T330-RED-B", { colors: ["red"] })
    makeCard("T330-BLUE-NEXUS", { type: "nexus", colors: ["blue"] })
    makeCard("T330-COLORLESS", { colors: ["green"] })

    const s = game("p330-colorcount-multi")
    putSpirit(s, "p2", "T330-MULTI")
    assert(opponentFieldColorCount(s, "p1") === 2, "多色1枚（赤白）は2色として数える")

    const s2 = game("p330-colorcount-same")
    putSpirit(s2, "p2", "T330-RED-A")
    putSpirit(s2, "p2", "T330-RED-B")
    assert(opponentFieldColorCount(s2, "p1") === 1, "同色2枚は1色（重複除く）")

    const s3 = game("p330-colorcount-nexus")
    putSpirit(s3, "p2", "T330-RED-A")
    putNexus(s3, "p2", "T330-BLUE-NEXUS")
    assert(opponentFieldColorCount(s3, "p1") === 2, "ネクサスも数える（赤+青=2色）")
    assert(opponentFieldColorCount(s3, "p1", true) === 1, "spiritsOnly指定時はネクサスを除外（赤のみ=1色）")

    const s4 = game("p330-colorcount-brave")
    const host = putSpirit(s4, "p2", "T330-RED-A")
    host.braveComposite = { cost: 0, colors: ["blue"], symbols: [] }
    assert(opponentFieldColorCount(s4, "p1") === 2, "合体中ブレイヴの色（青）も足される（赤+青=2色）")

    const s5 = game("p330-colorcount-colorless")
    const cl = putSpirit(s5, "p2", "T330-COLORLESS")
    cl.colorlessThisBattle = true
    assert(opponentFieldColorCount(s5, "p1") === 0, "colorlessThisBattleの個体は数えない")
}

console.log("=== 2. ownFieldOnlyColor：自分のフィールドが◯色しかない ===")
{
    const s = game("p330-only-single")
    putSpirit(s, "p1", "T330-RED-A")
    putSpirit(s, "p1", "T330-RED-B")
    assert(ownFieldOnlyColor(s, "p1", "red") === true, "赤だけのフィールドはtrue")

    const s2 = game("p330-only-multi")
    putSpirit(s2, "p1", "T330-RED-A")
    putSpirit(s2, "p1", "T330-MULTI") // 赤白の多色が1枚混ざる
    assert(ownFieldOnlyColor(s2, "p1", "red") === false, "多色が1枚でもあれば不成立")

    const s3 = game("p330-only-empty")
    assert(ownFieldOnlyColor(s3, "p1", "red") === false, "0枚なら不成立（空虚な真にしない）")

    const s4 = game("p330-only-spiritsonly")
    putSpirit(s4, "p1", "T330-RED-A")
    putNexus(s4, "p1", "T330-BLUE-NEXUS")
    assert(ownFieldOnlyColor(s4, "p1", "red") === false, "spiritsOnly省略時はネクサスの色も見るので不成立")
    assert(ownFieldOnlyColor(s4, "p1", "red", true) === true, "spiritsOnly指定時はネクサスを無視して成立")
}

console.log("=== 3. 神将：スピリット1体からのライフ減少はターンごとにmaxまで（お互いに効く） ===")
{
    makeCard("T330-SHINSHOU", {
        type: "nexus",
        colors: ["purple"],
        effects: [
            {
                id: "cap",
                kind: "globalConstraint",
                levels: null,
                whileOwnBurstSet: true,
                constraint: { type: "lifeDamagePerSpiritPerTurn", max: 1 },
            },
        ],
    })
    makeCard("T330-ATK-2SYM", { symbol: ["red", "red"], levels: [{ level: 1, cores: 1, bp: 1000 }] }) // シンボル2つ

    function setup(seed: string, burstSet: boolean) {
        const s = game(seed)
        // 神将の発生源は**相手（p2）**のフィールドに置く。「お互いに効く」ことを確かめるため
        putNexus(s, "p2", "T330-SHINSHOU")
        s.players.p2.burstSet = burstSet
        return s
    }

    console.log("--- ダブルシンボルでも1しか減らない ---")
    {
        const s = setup("p330-shinshou-double", true)
        const atk = putSpirit(s, "p1", "T330-ATK-2SYM")
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
        assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
        assert(s.players.p2.life === 4, "シンボル2つでも1しか減らない（5→4）")
    }

    console.log("--- 別のスピリットならまた1（アタッカーごとの累計） ---")
    {
        const s = setup("p330-shinshou-another", true)
        const atk1 = putSpirit(s, "p1", "T330-ATK-2SYM")
        const atk2 = putSpirit(s, "p1", "T330-ATK-2SYM")
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        assert(act(s, "p1", { type: "attack", instanceId: atk1.instanceId }) === null, "1体目アタック")
        assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
        assert(s.players.p2.life === 4, "1体目で1減る（5→4）")
        assert(act(s, "p1", { type: "attack", instanceId: atk2.instanceId }) === null, "2体目アタック")
        assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
        assert(s.players.p2.life === 3, "別のスピリットならまた1減る（4→3）")
    }

    console.log("--- 効果によるライフ減少も同じ累計に合算される ---")
    {
        const s = setup("p330-shinshou-effect", true)
        const atk = putSpirit(s, "p1", "T330-ATK-2SYM")
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
        assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける（1減る）")
        assert(s.players.p2.life === 4, "アタックで1減る（5→4）")
        // 同じスピリットの効果で追加でライフを減らそうとしても、累計が既に1なので0しか減らない
        resolveAction(s, "p1", atk, { type: "lifeCrush", count: 5 }, undefined, undefined, "spirit")
        assert(s.players.p2.life === 4, "同じスピリットの効果ぶんは既に累計1に達しているため減らない")
    }

    console.log("--- バーストをセットしていなければ効かない ---")
    {
        const s = setup("p330-shinshou-noburst", false)
        const atk = putSpirit(s, "p1", "T330-ATK-2SYM")
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
        assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
        assert(s.players.p2.life === 3, "バーストをセットしていなければシンボル2つぶん減る（5→3）")
    }

    console.log("--- 次のターンはリセットされる ---")
    {
        const s = setup("p330-shinshou-reset", true)
        const atk = putSpirit(s, "p1", "T330-ATK-2SYM")
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
        assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
        assert(s.players.p2.life === 4, "1ターン目は1しか減らない（5→4）")
        assert(act(s, "p1", { type: "endTurn" }) === null, "p1のターン終了")
        assert(act(s, "p2", { type: "endTurn" }) === null, "p2のターン終了、p1のターンへ")
        assert(atk.lifeDealtThisTurn === undefined || atk.lifeDealtThisTurn === 0, "ターンが変わると累計がリセットされる")
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
        assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
        assert(s.players.p2.life === 3, "次のターンはまた1減る（4→3）")
    }
}

console.log("=== 4. 虚神：ownBurstSet条件によるコスト固定 ===")
{
    makeCard("T330-KOSHIN-SET-TRUE", {
        type: "nexus",
        colors: ["purple"],
        effects: [
            { id: "fix1", kind: "costMod", levels: null, mode: "set", setTo: 2, condition: { ownBurstSet: true } },
        ],
    })
    makeCard("T330-KOSHIN-SET-FALSE", {
        type: "nexus",
        colors: ["purple"],
        effects: [
            { id: "fix2", kind: "costMod", levels: null, mode: "set", setTo: 2, condition: { ownBurstSet: false } },
        ],
    })
    makeCard("T330-TARGET", { cost: 5, colors: ["purple"] })

    console.log("--- ownBurstSet:true はセット中だけ固定 ---")
    {
        const s = game("p330-koshin-true-set")
        putNexus(s, "p1", "T330-KOSHIN-SET-TRUE")
        s.players.p1.burstSet = true
        assert(effectiveCost(s, "p1", CARD_DB.get("T330-TARGET")!) === 2, "セット中はコスト2に固定")
        s.players.p1.burstSet = false
        assert(effectiveCost(s, "p1", CARD_DB.get("T330-TARGET")!) === 5, "セットしていない間は素のコストのまま")
    }

    console.log("--- ownBurstSet:false はセットしていない間だけ固定 ---")
    {
        const s = game("p330-koshin-false-set")
        putNexus(s, "p1", "T330-KOSHIN-SET-FALSE")
        s.players.p1.burstSet = false
        assert(effectiveCost(s, "p1", CARD_DB.get("T330-TARGET")!) === 2, "セットしていない間はコスト2に固定")
        s.players.p1.burstSet = true
        assert(effectiveCost(s, "p1", CARD_DB.get("T330-TARGET")!) === 5, "セット中は素のコストのまま")
    }
}

console.log("=== 5. 軽減前のコスト増：beforeReduction は軽減で打ち消せる（従来の加算は打ち消せない） ===")
{
    // コスト1・赤の軽減シンボル2つ（フィールドの赤シンボル2つで満額軽減できる状況）
    makeCard("T330-CHEAP", { cost: 1, colors: ["red"], reduction: ["red", "red"] })
    makeCard("T330-SYMBOL-A", { symbol: ["red"] })
    makeCard("T330-SYMBOL-B", { symbol: ["red"] })
    makeCard("T330-COSTUP-BEFORE", {
        type: "nexus",
        colors: ["purple"],
        effects: [{ id: "up1", kind: "costMod", levels: null, amount: 1, beforeReduction: true }],
    })
    makeCard("T330-COSTUP-AFTER", {
        type: "nexus",
        colors: ["purple"],
        effects: [{ id: "up2", kind: "costMod", levels: null, amount: 1 }],
    })

    console.log("--- beforeReduction: 軽減前に足すので軽減で打ち消せる ---")
    {
        const s = game("p330-before-reduction")
        putSpirit(s, "p1", "T330-SYMBOL-A")
        putSpirit(s, "p1", "T330-SYMBOL-B")
        putNexus(s, "p1", "T330-COSTUP-BEFORE")
        // 総コスト(1+1=2) - 軽減(赤2つで最大2) = 0
        assert(effectiveCost(s, "p1", CARD_DB.get("T330-CHEAP")!) === 0, "軽減前の+1は軽減で完全に打ち消せる")
    }

    console.log("--- 従来の加算（余分に支払う）：軽減の後に足すので打ち消せない ---")
    {
        const s = game("p330-after-reduction")
        putSpirit(s, "p1", "T330-SYMBOL-A")
        putSpirit(s, "p1", "T330-SYMBOL-B")
        putNexus(s, "p1", "T330-COSTUP-AFTER")
        // 軽減後(max(1-2,0)=0) + 余分な+1 = 1
        assert(effectiveCost(s, "p1", CARD_DB.get("T330-CHEAP")!) === 1, "軽減の後に足す+1は残る")
    }

    console.log("--- amountCounter・condition：相手フィールドの色の数ぶん加算、しきい値未満なら不発 ---")
    {
        makeCard("T330-COSTUP-COUNTER", {
            type: "nexus",
            colors: ["purple"],
            effects: [
                { id: "up3", kind: "costMod", levels: null, amount: 1, amountCounter: "opponentFieldColors" },
            ],
        })
        makeCard("T330-COSTUP-COND", {
            type: "nexus",
            colors: ["purple"],
            effects: [
                {
                    id: "up4",
                    kind: "costMod",
                    levels: null,
                    amount: 10,
                    condition: { opponentFieldColorsAtLeast: 3 },
                },
            ],
        })
        makeCard("T330-FLAT", { cost: 3, colors: ["yellow"] })

        const s = game("p330-amountcounter")
        putNexus(s, "p1", "T330-COSTUP-COUNTER")
        putSpirit(s, "p2", "T330-MULTI") // 赤白の2色
        assert(effectiveCost(s, "p1", CARD_DB.get("T330-FLAT")!) === 5, "相手フィールド2色ぶん+2（3+1×2）")

        const s2 = game("p330-condition-unmet")
        putNexus(s2, "p1", "T330-COSTUP-COND")
        putSpirit(s2, "p2", "T330-MULTI") // 2色（しきい値3未満）
        assert(effectiveCost(s2, "p1", CARD_DB.get("T330-FLAT")!) === 3, "しきい値3未満なので+10は発動しない")
    }
}

console.log("すべてのチェックに合格しました 🎉（part330）")
