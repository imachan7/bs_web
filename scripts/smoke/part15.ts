// smoke パート15（対戦体験の改善第一弾: 誘発効果の対象選択をプレイヤー選択式にする）
// 収録セクション:
//   - server/src/type.ts: GameState.interactiveTargets（既定false。opt-in）
//   - server/src/logic/GameState.ts: createGameでinteractiveTargets:falseに初期化
//   - server/src/index.ts: ゲーム作成直後にinteractiveTargets=trueを設定（実対戦のみ選択式）
//   - server/src/logic/EffectModules.ts: destroy/coreRemove/exhaust/destroyExhausted/
//     returnToHand/returnToDeckTop の対象選択をpendingChoice(kind:"target")に委譲
//     （候補0/1件は従来どおり不発/自動選択、2件以上のみ選択式。destroyのcount>=2は
//     1体選択→残りをpendingChoice.queueへ積んで連続選択にする）
import { act, assert, createGame, createInstance, resolveAction, runTurnStart } from "./helpers"

console.log("=== [interactiveTargets] destroy 候補2件でchoiceが立つ（BS01-017 ランスラプトル） ===")
{
    const s = createGame(
        "interactive-destroy-choice",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p1.hand[0] = "BS01-017" // ランスラプトル：コスト5・召喚時 destroy maxBp:2000 count:1
    s.players.p1.reserve = 10
    const gora1 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1（bp1000）
    const gora2 = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(gora1, gora2)

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ランスラプトルを召喚")
    assert(s.pendingChoice !== null, "候補2件のためpendingChoiceが立つ")
    assert(s.pendingChoice?.candidates.length === 2, "候補は2件（両方のゴラドン）")
    assert(s.players.p2.field.spirits.length === 2, "選択待ち中はまだ破壊されていない")

    assert(act(s, "p1", { type: "resolveChoice", instanceId: gora1.instanceId }) === null, "1体目を選んで解決")
    assert(s.pendingChoice === null, "選択後pendingChoiceは解消される")
    assert(s.players.p2.field.spirits.length === 1, "選んだ1体だけ破壊された")
    assert(s.players.p2.field.spirits[0]?.instanceId === gora2.instanceId, "選ばなかった方は残る")
}

console.log("--- 候補1件なら choice なしで即座に自動破壊 ---")
{
    const s = createGame(
        "interactive-destroy-single",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p1.hand[0] = "BS01-017"
    s.players.p1.reserve = 10
    const gora = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(gora)

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ランスラプトルを召喚")
    assert(s.pendingChoice === null, "候補1件なのでpendingChoiceは立たない")
    assert(s.players.p2.field.spirits.length === 0, "自動選択でそのまま破壊される")
}

console.log("=== [interactiveTargets] destroy count:2 を直接resolveActionで検証：連続2回選択される ===")
{
    // count>=2のdestroy持ちカードは第一弾に存在しないため、resolveActionを直接呼んで検証する
    const s = createGame(
        "interactive-destroy-count2",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    s.interactiveTargets = true
    const gora1 = createInstance("BS01-001", s.turn, 1)
    const gora2 = createInstance("BS01-001", s.turn, 1)
    const gora3 = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(gora1, gora2, gora3)

    resolveAction(s, "p1", null, { type: "destroy", count: 2 })
    assert(s.pendingChoice !== null, "1回目のpendingChoiceが立つ")
    assert(s.pendingChoice?.candidates.length === 3, "候補は3件")

    assert(act(s, "p1", { type: "resolveChoice", instanceId: gora1.instanceId }) === null, "1体目を選択")
    assert(s.players.p2.field.spirits.length === 2, "1体目が破壊された")
    assert(s.pendingChoice !== null, "残りcount-1分の2回目のpendingChoiceが連続で立つ")
    assert(s.pendingChoice?.candidates.length === 2, "残り候補は2件")

    assert(act(s, "p1", { type: "resolveChoice", instanceId: gora2.instanceId }) === null, "2体目を選択")
    assert(s.pendingChoice === null, "2回選択後pendingChoiceは解消される")
    assert(s.players.p2.field.spirits.length === 1, "2体破壊され1体残る")
    assert(s.players.p2.field.spirits[0]?.instanceId === gora3.instanceId, "選ばなかった3体目が残る")
}

console.log("=== [interactiveTargets] exhaust：候補2件でchoiceが立ち、選んだ方だけ疲労する ===")
{
    const s = createGame(
        "interactive-exhaust-choice",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "purple" },
    )
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p1.hand[0] = "BS01-063" // エメラルドシーザー：コスト4・召喚時 exhaust count:1
    s.players.p1.reserve = 10
    const gora1 = createInstance("BS01-001", s.turn, 1)
    const gora2 = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(gora1, gora2)

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "エメラルドシーザーを召喚")
    assert(s.pendingChoice !== null, "候補2件のためpendingChoiceが立つ")

    assert(act(s, "p1", { type: "resolveChoice", instanceId: gora2.instanceId }) === null, "2体目を選んで疲労させる")
    assert(s.pendingChoice === null, "選択後pendingChoiceは解消される")
    assert(gora2.isRested, "選んだ方は疲労する")
    assert(!gora1.isRested, "選ばなかった方は疲労しない")
}

console.log("=== interactiveTargets 既定false（未設定）では従来どおり自動選択（choiceなし） ===")
{
    const s = createGame(
        "interactive-destroy-default-off",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    assert(s.interactiveTargets === false, "createGameの既定値はfalse")
    s.players.p1.hand[0] = "BS01-017"
    s.players.p1.reserve = 10
    const gora1 = createInstance("BS01-001", s.turn, 1)
    const gora2 = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(gora1, gora2)

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ランスラプトルを召喚")
    assert(s.pendingChoice === null, "interactiveTargetsがfalseならpendingChoiceは立たない")
    assert(s.players.p2.field.spirits.length === 1, "従来どおり自動選択で1体だけ破壊される")
}
