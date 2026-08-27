// smoke パート245（BS10 緑バッチ：BS10-021/022/023/024/025/026/028/030/104/105 の10枚を新規構造化。2026-08-27）
//
// 最低限の発火確認: BS10-021（紫としても扱う＝colorAs）・BS10-025（召喚時、相手を疲労）・
// BS10-030（系統「殻人」の数でBP+＝aura。発生源自身も数に含む）・
// BS10-104（chooseActionModeの両モード）・BS10-105（コスト3以上を破壊するコストと、対象なしの不発）。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { instHasColor } from "../../shared/rules"

const byName = (n: string) => {
    const c = ALL_CARDS.find((x) => x.name === n)
    assert(c !== undefined, `テスト前提: ${n} がカードデータにいる`)
    return c!
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== §A モスピード：紫のスピリットとしても扱う（colorAs） ===")
{
    const card = byName("モスピード")
    const s = game("bs10-mospid")
    const inst = createInstance(card.cardId, s.turn, card.levels[0]!.cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    assert(instHasColor(inst, "green"), "元の色（緑）はそのまま持つ")
    assert(instHasColor(inst, "purple"), "紫のスピリットとしても扱われる")
}

console.log("=== §B ヘラジグサ：召喚時、相手のスピリット1体を疲労させる ===")
{
    const card = byName("ヘラジグサ")
    const s = game("bs10-herajigusa")
    const enemyCard = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0)!
    const enemyInst = createInstance(enemyCard.cardId, s.turn, enemyCard.levels[0]!.cores)
    s.players.p2.field.spirits.push(enemyInst)
    s.players.p1.hand = [card.cardId]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ヘラジグサを召喚")
    assert(enemyInst.isRested, "召喚時効果で相手のスピリットが疲労した")
}

console.log("=== §C 将軍アントマン：系統「殻人」を持つ自分のスピリット1体につきBP+2000（発生源自身も数える） ===")
{
    const card = byName("将軍アントマン")
    const s = game("bs10-antman")
    const inst = createInstance(card.cardId, s.turn, card.levels[0]!.cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    const baseBp = card.levels[0]!.bp
    assert(effectiveBp(s, "p1", inst) === baseBp + 2000, "自分自身も系統「殻人」を持つため+2000（1体ぶん）")

    const inst2 = createInstance(card.cardId, s.turn, card.levels[0]!.cores)
    s.players.p1.field.spirits.push(inst2)
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", inst) === baseBp + 4000, "殻人が2体になると+4000")
}

console.log("=== §D トライアングルトラップ：chooseActionModeの両モード ===")
{
    const card = byName("トライアングルトラップ")
    // モード1（非対話・既定＝先頭）：相手のスピリット1体を疲労
    {
        const s = game("bs10-triangle-1")
        const enemy = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0)!
        const enemyInst = createInstance(enemy.cardId, s.turn, enemy.levels[0]!.cores)
        s.players.p2.field.spirits.push(enemyInst)
        s.players.p1.hand = [card.cardId]
        assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "トライアングルトラップを使用（モード1）")
        assert(enemyInst.isRested, "相手のスピリット1体が疲労した")
    }
    // モード2（対話・明示選択）：コスト4以下の相手のスピリット3体を疲労
    {
        const s = game("bs10-triangle-2")
        s.interactiveTargets = true
        const cheap = ALL_CARDS.find((c) => c.type === "spirit" && c.cost <= 4 && c.levels.length > 0)!
        const expensive = ALL_CARDS.find((c) => c.type === "spirit" && c.cost > 4 && c.levels.length > 0)!
        const cheapInsts = [0, 1, 2].map(() => {
            const inst = createInstance(cheap.cardId, s.turn, cheap.levels[0]!.cores)
            s.players.p2.field.spirits.push(inst)
            return inst
        })
        const expensiveInst = createInstance(expensive.cardId, s.turn, expensive.levels[0]!.cores)
        s.players.p2.field.spirits.push(expensiveInst)
        s.players.p1.hand = [card.cardId]
        assert(
            act(s, "p1", { type: "castMagic", handIndex: 0 }) === null,
            "トライアングルトラップを使用",
        )
        assert(
            act(s, "p1", { type: "resolveChoice", option: "コスト4以下の相手のスピリット3体を疲労" }) === null,
            "モード2を選択",
        )
        // 対話モードでは対象を1体ずつ選ぶ再入が続く（count:3 は1体ずつの選択）
        let guard = 0
        while (s.pendingChoice && guard < 10) {
            const candidate = s.pendingChoice.candidates[0]
            assert(candidate !== undefined, "疲労させる対象の候補がある")
            assert(
                act(s, "p1", { type: "resolveChoice", instanceId: candidate! }) === null,
                "対象を1体選ぶ",
            )
            guard++
        }
        assert(cheapInsts.every((i) => i.isRested), "コスト4以下の相手のスピリットが疲労した")
        assert(!expensiveInst.isRested, "コスト4超はモード2の対象にならない")
    }
}

console.log("=== §E ライフチャージ：コスト3以上の自分のスピリット1体を破壊することで、コア3個をリザーブに置く ===")
{
    const card = byName("ライフチャージ")
    // 成立ケース：破壊できる対象がいる
    {
        const s = game("bs10-lifecharge-ok")
        const sac = ALL_CARDS.find((c) => c.type === "spirit" && c.cost >= 3 && c.levels.length > 0)!
        const sacCores = sac.levels[0]!.cores
        const sacInst = createInstance(sac.cardId, s.turn, sacCores)
        s.players.p1.field.spirits.push(sacInst)
        s.players.p1.hand = [card.cardId]
        const reserveBefore = s.players.p1.reserve
        assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ライフチャージを使用")
        assert(
            !s.players.p1.field.spirits.includes(sacInst),
            "コストとして自分のスピリットが破壊された",
        )
        // 破壊されたスピリット上のコア（sacCores）はリザーブへ戻る。それに加えて
        // マジックのコストを払い、効果でボイドから3個獲得する
        assert(
            s.players.p1.reserve === reserveBefore - getCard(card.cardId).cost + sacCores + 3,
            "ボイドからコア3個がリザーブに置かれた（破壊したスピリットのコアも別途リザーブへ戻る）",
        )
    }
    // 不発ケース：コスト3以上の自分のスピリットがいない
    {
        const s = game("bs10-lifecharge-fizzle")
        const weak = ALL_CARDS.find((c) => c.type === "spirit" && c.cost < 3 && c.levels.length > 0)!
        const weakInst = createInstance(weak.cardId, s.turn, weak.levels[0]!.cores)
        s.players.p1.field.spirits.push(weakInst)
        s.players.p1.hand = [card.cardId]
        const reserveBefore = s.players.p1.reserve
        assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ライフチャージを使用（コストを払って発動はする）")
        assert(s.players.p1.field.spirits.includes(weakInst), "対象がいないため自分のスピリットは破壊されない")
        assert(
            s.players.p1.reserve === reserveBefore - getCard(card.cardId).cost,
            "コアは獲得できず、リザーブはマジックのコスト分だけ減った",
        )
    }
}
