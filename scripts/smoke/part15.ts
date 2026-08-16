// smoke パート15（対戦体験の改善第一弾: 誘発効果の対象選択をプレイヤー選択式にする）
// 収録セクション:
//   - server/src/type.ts: GameState.interactiveTargets（既定false。opt-in）
//   - server/src/logic/GameState.ts: createGameでinteractiveTargets:falseに初期化
//   - server/src/index.ts: ゲーム作成直後にinteractiveTargets=trueを設定（実対戦のみ選択式）
//   - server/src/logic/EffectModules.ts: destroy/coreRemove/exhaust/destroyExhausted/
//     returnToHand/returnToDeckTop の対象選択をpendingChoice(kind:"target")に委譲
//     （候補0/1件は従来どおり不発/自動選択、2件以上のみ選択式。destroyのcount>=2は
//     1体選択→残りをpendingChoice.queueへ積んで連続選択にする）
import { act, assert, createGame, createInstance, fireStepTriggers, resolveAction, runTurnStart } from "./helpers"

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
    // 「BP2000以下のスピリット1体を破壊**できる**」＝ optional のため、まず発動確認が入る
    assert(s.pendingChoice?.kind === "option", "先に発動確認のpendingChoiceが立つ")
    assert(s.pendingChoice?.confirm === true, "発動確認（confirm）である")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動を選ぶ")
    assert(s.pendingChoice !== null, "候補3件のためpendingChoiceが立つ")
    // anySide化により、ランスラプトル自身（Lv1 BP2000＝maxBp2000の境界値）も候補に入る
    assert(s.pendingChoice?.candidates.length === 3, "候補は3件（両方のゴラドン＋自分自身）")
    assert(s.players.p2.field.spirits.length === 2, "選択待ち中はまだ破壊されていない")

    assert(act(s, "p1", { type: "resolveChoice", instanceId: gora1.instanceId }) === null, "1体目を選んで解決")
    assert(s.pendingChoice === null, "選択後pendingChoiceは解消される")
    assert(s.players.p2.field.spirits.length === 1, "選んだ1体だけ破壊された")
    assert(s.players.p2.field.spirits[0]?.instanceId === gora2.instanceId, "選ばなかった方は残る")
}

console.log("--- 候補1件なら choice なしで即座に自動破壊（相手フィールドが空＝自分自身のみが候補） ---")
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
    // 相手フィールドは空。anySide化によりランスラプトル自身（Lv1 BP2000）が唯一の候補になる
    const before = new Set(s.players.p1.field.spirits.map((sp) => sp.instanceId))

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ランスラプトルを召喚")
    assert(s.pendingChoice?.confirm === true, "optional のため発動確認が立つ")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動を選ぶ")
    assert(s.pendingChoice === null, "候補1件（自分自身）なのでそのまま解決される")
    const summoned = s.players.p1.field.spirits.find((sp) => !before.has(sp.instanceId))
    assert(summoned === undefined, "唯一の候補である自分自身が自動選択で破壊される")
}

console.log("--- 発動確認をスキップすると効果は発揮されない ---")
{
    const s = createGame(
        "interactive-optional-skip",
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
    assert(s.pendingChoice?.optional === true, "発動確認はスキップ可")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "発動しないことを選ぶ")
    assert(s.pendingChoice === null, "選択は解消される")
    assert(s.players.p2.field.spirits.length === 1, "破壊されない（「できる」を選ばなかった）")
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
    // anySide化によりランスラプトル自身（Lv1 BP2000＝maxBp2000の境界値）も候補になる。
    // destroyのfilter（maxBp2000）を満たしたまま自分自身と実効BPを並べる必要があるため、
    // 相手はBP2000ちょうどのシャ・ズー（Lv1）にする（同値のため自動選択は相手側を優先する）
    const gora1 = createInstance("BS01-036", s.turn, 1) // シャ・ズー Lv1 BP2000
    const gora2 = createInstance("BS01-036", s.turn, 1)
    s.players.p2.field.spirits.push(gora1, gora2)

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ランスラプトルを召喚")
    assert(s.pendingChoice === null, "interactiveTargetsがfalseならpendingChoiceは立たない")
    assert(s.players.p2.field.spirits.length === 1, "従来どおり自動選択で1体だけ破壊される")
}

console.log("=== [interactiveTargets] step誘発の「できる」も発動確認が入る（BS02-073 皇帝アンプルール） ===")
{
    const s = createGame(
        "interactive-step-optional",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.interactiveTargets = true
    s.turnPlayer = "p1"
    s.phase = "main"
    // 皇帝アンプルール Lv3（維持コア6）。Lv3『お互いのスタートステップ』にリザーブのコア1個を
    // ボイドへ置くことで、相手のネクサスすべてをLv1として扱える（＝任意コスト）
    const emperor = createInstance("BS02-073", s.turn, 6)
    s.players.p1.field.spirits.push(emperor)
    // 効果の対象（相手のネクサス）が無いとコストを払えない＝発揮できない（COST_MODEL.md §1。2026-08-13）。
    // ここで見たいのは発動確認の流れなので、対象を置いて成立する盤面にしておく
    s.players.p2.field.nexuses.push(createInstance("BS06-080", s.turn, 0))
    s.players.p1.reserve = 5
    const reserveBefore = s.players.p1.reserve

    fireStepTriggers(s, "start")
    assert(s.pendingChoice?.confirm === true, "「できる」効果なので発動確認が立つ")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "発動しないことを選ぶ")
    assert(s.players.p1.reserve === reserveBefore, "発動しなければリザーブのコアも減らない")

    fireStepTriggers(s, "start")
    assert(s.pendingChoice?.confirm === true, "もう一度発動確認が立つ")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動を選ぶ")
    assert(s.players.p1.reserve === reserveBefore - 1, "発動するとリザーブのコア1個がボイドへ")
}
