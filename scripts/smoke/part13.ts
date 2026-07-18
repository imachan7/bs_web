// smoke パート13（BS02構造化 波3b: 機構A＝破壊への割り込み＝復活）
// 収録セクション:
//   - server/src/type.ts: DestroyContext・EffectDef の kind:"reviveOnDestroy"
//   - server/src/logic/EffectModules.ts: destroySpirit のcontext引数・tryReviveOnDestroy
//   - server/src/logic/GameEngine.ts: resolveBattleのdestroySpirit呼び出しへのbattleコンテキスト付与
//   - data/cards.json: BS02-052 チャガマル・BS02-079 紫水晶の森・BS02-083 鏡の回廊
import {
    act,
    assert,
    createGame,
    createInstance,
    destroySpirit,
    resolveAction,
    runTurnStart,
} from "./helpers"

console.log("=== BS02-052 チャガマルLv3：相手の効果による相手ターンの破壊は割り込んで復活する ===")
{
    const s = createGame(
        "chagamaru-revive-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)

    const chaga = createInstance("BS02-052", s.turn, 3) // チャガマル Lv3 cores3
    s.players.p1.field.spirits.push(chaga)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行")
    s.turnPlayer = "p2" // 相手（p2）のアタックステップをシミュレート（フェーズはattackのまま）

    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, undefined, undefined, "spirit")

    assert(s.players.p1.field.spirits.includes(chaga), "相手ターンのアタックステップ中の相手効果による破壊は割り込んで場に残る")
    assert(chaga.cores === 1, "コアは1個だけ残る")
    assert(s.players.p1.trashCores === 2, "超過コア2個は自分のトラッシュに置かれる")
    assert(!chaga.isRested, "回復状態のまま戻る")
    assert(s.players.p1.reserve === reserveBefore, "コストはトラッシュ送りのためリザーブは増えない")

    s.turnPlayer = "p1" // 後続に影響しないよう戻す
}

console.log("--- 自分のターン中（相手のアタックステップでない）は通常通り破壊される ---")
{
    const s = createGame(
        "chagamaru-ownturn-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)

    const chaga = createInstance("BS02-052", s.turn, 3)
    s.players.p1.field.spirits.push(chaga)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行")
    // turnPlayerはp1のまま（p1自身のアタックステップ＝相手のアタックステップではない）

    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, undefined, undefined, "spirit")

    assert(!s.players.p1.field.spirits.includes(chaga), "自分のアタックステップ中は復活条件を満たさず破壊される")
    assert(s.players.p1.trashCards.includes("BS02-052"), "通常通りトラッシュへ")
}

console.log("--- 自分（持ち主）の効果による破壊は復活しない ---")
{
    const s = createGame(
        "chagamaru-selfeffect-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)

    const chaga = createInstance("BS02-052", s.turn, 3)
    s.players.p1.field.spirits.push(chaga)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行")
    s.turnPlayer = "p2" // 相手のアタックステップ

    destroySpirit(s, "p1", chaga.instanceId, "destroy", { sourcePid: "p1", sourceType: "spirit" })

    assert(!s.players.p1.field.spirits.includes(chaga), "sourcePidが自分自身のため相手の効果とみなされず破壊される")

    s.turnPlayer = "p1"
}

console.log("=== BS02-079 紫水晶の森Lv1：自分のアタックステップ中の相手効果による破壊はコア1個をボイドに置き復活する ===")
{
    const s = createGame(
        "koseki-revive-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const koseki = createInstance("BS02-079", s.turn, 0) // 紫水晶の森 Lv1 cores0
    s.players.p1.field.nexuses.push(koseki)
    const guard = createInstance("BS02-001", s.turn, 2) // リザドエッジ Lv2 cores2（無効果の埋め合わせ用）
    s.players.p1.field.spirits.push(guard)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行（自分のアタックステップ）")

    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, undefined, undefined, "spirit")

    assert(s.players.p1.field.spirits.includes(guard), "自分のアタックステップ中の相手効果による破壊は割り込んで場に残る")
    assert(guard.cores === 1, "コア1個をボイドに置き、残り1個で場に残る")
    assert(!guard.isRested, "回復状態のまま戻る")
}

console.log("--- コア1個しか持たない個体は不発（コストが払えず通常通り破壊される） ---")
{
    const s = createGame(
        "koseki-unfunded-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const koseki = createInstance("BS02-079", s.turn, 0)
    s.players.p1.field.nexuses.push(koseki)
    const guard = createInstance("BS02-001", s.turn, 1) // Lv1 cores1（維持コアのみ＝支払うと消滅する）
    s.players.p1.field.spirits.push(guard)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行")

    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, undefined, undefined, "spirit")

    assert(!s.players.p1.field.spirits.includes(guard), "コア1個ではコストを支払えず通常通り破壊される")
}

console.log("=== BS02-083 鏡の回廊Lv1：【装甲】持ちが指定色とのBP比較で破壊されたとき疲労状態で復活する ===")
{
    const s = createGame(
        "kagami-revive-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)

    const atk = createInstance("BS02-001", s.turn, 4) // リザドエッジ Lv3 cores4 BP4000（赤）
    s.players.p1.field.spirits.push(atk)
    const kagami = createInstance("BS02-083", s.turn, 0) // 鏡の回廊 Lv1 cores0
    s.players.p2.field.nexuses.push(kagami)
    const rob = createInstance("BS02-040", s.turn, 1) // ロブスターク Lv1 cores1 BP1000（装甲：赤）
    s.players.p2.field.spirits.push(rob)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "リザドエッジでアタック")
    assert(act(s, "p2", { type: "block", instanceId: rob.instanceId }) === null, "ロブスタークでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(s.players.p2.field.spirits.includes(rob), "赤の攻撃側とのBP比較による破壊は割り込んで場に残る")
    assert(rob.isRested, "疲労状態で戻る")
}

console.log("--- 赤以外の相手とのバトルでは復活しない ---")
{
    const s = createGame(
        "kagami-nonred-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "white" },
    )
    runTurnStart(s)

    const atk = createInstance("BS02-074", s.turn, 1) // 風船魔人バーバル Lv1 cores1 BP5000（黄）
    s.players.p1.field.spirits.push(atk)
    const kagami = createInstance("BS02-083", s.turn, 0)
    s.players.p2.field.nexuses.push(kagami)
    const rob = createInstance("BS02-040", s.turn, 1) // ロブスターク Lv1 cores1 BP1000（装甲：赤のみ）
    s.players.p2.field.spirits.push(rob)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "バーバルでアタック")
    assert(act(s, "p2", { type: "block", instanceId: rob.instanceId }) === null, "ロブスタークでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(!s.players.p2.field.spirits.includes(rob), "黄の攻撃側には装甲が効かず通常通り破壊される")
}
