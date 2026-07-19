// smoke パート11（pendingChoice基盤 + BS02-022 魔界侯爵コキュートス）
// 収録セクション:
//   - server/src/logic/GameState.ts: findInstanceAnywhere・viewFor の pendingChoice マスク
//   - server/src/logic/EffectModules.ts: requestChoice ヘルパー・fireTrigger/resolveMagic の
//     中断→queue積みリファクタ・resolveAction の coreToOpponentTrashChoice ケース
//   - server/src/logic/PhaseManager.ts: リフレッシュステップでの refreshedInstanceIds 収集
//   - server/src/logic/GameEngine.ts: dispatchAction の pendingChoice ガード・resolveChoice アクション
//   - data/cards.json: BS02-022 魔界侯爵コキュートス（Lv1/2はコア1個・Lv3はコア2個を相手トラッシュへ）
import {
    act,
    assert,
    createGame,
    createInstance,
    runTurnStart,
    viewFor,
} from "./helpers"
import { endTurn } from "../../server/src/logic/PhaseManager"

console.log("=== BS02-022 魔界侯爵コキュートス e1：自分のリフレッシュステップで回復時、相手候補2体以上ならpendingChoiceが立つ ===")
{
    const s = createGame(
        "bs02-022-choice-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s) // p1のターン開始（turn=3に進む、phase=main）
    const cocytus = createInstance("BS02-022", s.turn, 1) // Lv1（維持コア1）
    cocytus.isRested = true // 疲労状態から次の自分のリフレッシュステップで回復させる
    s.players.p1.field.spirits.push(cocytus)
    const enemy1 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1（維持コア1）
    const enemy2 = createInstance("BS01-002", s.turn, 1) // ロクケラトプス Lv1（維持コア1）
    s.players.p2.field.spirits.push(enemy1, enemy2)

    endTurn(s) // p1 → p2（cocytusはturn:"own"のためp2のターンでは発火しない）
    endTurn(s) // p2 → p1（p1のリフレッシュステップでcocytusが回復 → pendingChoiceが立つ）

    assert(s.pendingChoice !== null, "pendingChoiceが立つ")
    assert(s.pendingChoice?.pid === "p1", "選択者は効果の所有者p1")
    assert(s.pendingChoice?.candidates.length === 2, "候補は相手の2体")

    console.log("=== viewFor：相手視点ではcandidates/promptがマスクされる ===")
    const viewP1 = viewFor(s, "p1")
    const viewP2 = viewFor(s, "p2")
    assert((viewP1.pendingChoice?.candidates.length ?? 0) === 2, "自分視点では候補が見える")
    assert((viewP2.pendingChoice?.candidates.length ?? 0) === 0, "相手視点では候補が空配列にマスクされる")
    assert(viewP2.pendingChoice?.prompt === "相手が対象を選択中…", "相手視点ではpromptがマスクされる")

    console.log("=== pendingChoice中は resolveChoice 以外のアクションが拒否される ===")
    const errOtherAction = act(s, "p1", { type: "endTurn" })
    assert(errOtherAction === "対象の選択待ちです", "pendingChoice中はendTurnが拒否される")

    console.log("=== resolveChoiceの検証：選択者以外・候補外は拒否される ===")
    const errWrongPlayer = act(s, "p2", { type: "resolveChoice", instanceId: enemy1.instanceId })
    assert(errWrongPlayer === "あなたが選択するタイミングではありません", "選択者でないp2のresolveChoiceは拒否される")
    const errInvalidTarget = act(s, "p1", { type: "resolveChoice", instanceId: cocytus.instanceId })
    assert(errInvalidTarget === "選択できない対象です", "候補外のinstanceIdを指定したresolveChoiceは拒否される")

    console.log("=== 正しい選択：相手のコアがトラッシュへ、維持コア割れなら消滅する ===")
    const beforeTrash = s.players.p2.trashCores
    const result = act(s, "p1", { type: "resolveChoice", instanceId: enemy1.instanceId })
    assert(result === null, "候補内のinstanceIdを指定したresolveChoiceは成功する")
    assert(s.pendingChoice === null, "選択後pendingChoiceは解消される")
    assert(s.players.p2.trashCores === beforeTrash + 1, "相手のトラッシュコアが1個増える")
    assert(!s.players.p2.field.spirits.includes(enemy1), "維持コア割れでenemy1は消滅する")
}

console.log("=== 相手候補が1件のみのとき、pendingChoiceを立てず即座に解決する ===")
{
    const s = createGame(
        "bs02-022-single-candidate-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const cocytus = createInstance("BS02-022", s.turn, 1)
    cocytus.isRested = true
    s.players.p1.field.spirits.push(cocytus)
    const enemy1 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1（維持コア1）
    s.players.p2.field.spirits.push(enemy1)

    endTurn(s)
    endTurn(s)

    assert(s.pendingChoice === null, "候補1件のときpendingChoiceは立たない")
    assert(s.players.p2.trashCores === 1, "候補1件は即座に解決され相手のトラッシュコアが1個増える")
    assert(!s.players.p2.field.spirits.includes(enemy1), "維持コア割れでenemy1は消滅している")
}

console.log("=== 相手フィールドが空（候補0件）のとき、不発でゲームが続行する ===")
{
    const s = createGame(
        "bs02-022-no-candidate-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const cocytus = createInstance("BS02-022", s.turn, 1)
    cocytus.isRested = true
    s.players.p1.field.spirits.push(cocytus)
    // p2のフィールドは空のまま

    endTurn(s)
    endTurn(s)

    assert(s.pendingChoice === null, "候補0件でもpendingChoiceは立たない")
    assert(s.winner === null, "ゲームはエラーにならず続行する")
}
