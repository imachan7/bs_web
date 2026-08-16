// smoke パート1（scripts/smoke.ts から機械分割）
// 収録セクション:
//   - ゲーム生成
//   - 召喚（ゴラドンを手札に仕込む）
//   - 不正アクションの拒否
//   - コア移動
//   - アタックとライフ受け
//   - ターン終了 → p2のターン
//   - p2: 召喚 → ブロックの流れ
//   - マジック（フレイムテンペスト：全体破壊）
//   - フラッシュ優先権（交互パス）
//   - ブロック宣言後の追加フラッシュ
//   - 覚醒（フラッシュ優先権との整合）
//   - コア除去・BP増加アクション
//   - 疲労付与・疲労破壊アクション
//   - 可変数ドロー・可変数BP増加・全体対象アクション
//   - 複合効果（1タイミングに複数エントリ、配列順に実行）
//   - ビュー（情報秘匿）の確認
//   - コスト支払い（スピリット上のコア）
//   - バウンス系・コア操作系アクション
//   - 疲労回復・アタック制御アクション（refreshAllOwn）
//   - バトル制御アクション（endBattle）
//   - 色選択の疲労アクション（exhaustAllByColor）
//   - 色選択の疲労アクション：相手フィールドが0体（no-op）
import {
    createGame,
    createInstance,
    draw,
    getCard,
    minLevelCores,
    validateDeckCards,
    viewFor,
    engineRunTurnStart,
    handleAction,
    destroySpirit,
    effectiveBp,
    hasKeyword,
    resolveAction,
    spiritHasKeyword,
    effectiveCost,
    DECK_RECIPES,
    DECK_SIZE,
    assert,
    act,
    declareBlock,
    takeLifeAndResolve,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"

console.log("=== ゲーム生成 ===")
const state = createGame(
    "smoke-test",
    { p1: "アキラ", p2: "ユウキ" },
    { p1: "red", p2: "purple" },
)
runTurnStart(state)

assert(state.players.p1.deck.length + state.players.p1.hand.length === 40, "p1のデッキ+手札が40枚")
assert(state.players.p2.deck.length + state.players.p2.hand.length === 40, "p2のデッキ+手札が40枚")
assert(state.players.p1.hand.length === 4, "p1の手札は4枚（テストヘルパーは通常ターン相当でドロー分を戻す）")
assert(state.players.p1.life === 5, "初期ライフは5")
assert(state.players.p1.reserve === 5, "通常ターンのリザーブは4+1=5")
assert(state.phase === "main", "ターン開始処理後はメインステップ")

console.log("=== 先攻1ターン目の固有ルール（コアステップなし・ドローあり） ===")
{
    const t1 = createGame(
        "turn1-rule-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    engineRunTurnStart(t1)
    assert(t1.players.p1.reserve === 4, "先攻1ターン目はコアステップがなくリザーブ4のまま")
    assert(t1.players.p1.hand.length === 5, "先攻1ターン目もドローステップはあり手札4+1=5枚")
}

console.log("=== 召喚（ゴラドンを手札に仕込む） ===")
state.players.p1.hand[0] = "BS01-001" // ゴラドン: コスト0・維持1
const before = state.players.p1.reserve
assert(act(state, "p1", { type: "summon", handIndex: 0 }) === null, "ゴラドンを召喚できる")
assert(state.players.p1.field.spirits.length === 1, "フィールドにスピリットが1体")
assert(state.players.p1.reserve === before - 1, "維持コア1個が消費される")

console.log("=== 不正アクションの拒否 ===")
assert(act(state, "p2", { type: "summon", handIndex: 0 }) !== null, "相手ターンの召喚は拒否")
assert(act(state, "p1", { type: "attack", instanceId: "x" }) !== null, "メインステップのアタックは拒否")

console.log("=== コア移動 ===")
const inst = state.players.p1.field.spirits[0]!
assert(act(state, "p1", { type: "moveCore", instanceId: inst.instanceId, direction: "add" }) === null, "コアを置ける")
assert(inst.cores === 2, "コアが2個になる")
assert(act(state, "p1", { type: "moveCore", instanceId: inst.instanceId, direction: "remove" }) === null, "コアを戻せる")
const removeToZero = act(state, "p1", { type: "moveCore", instanceId: inst.instanceId, direction: "remove" })
assert(removeToZero !== null, "維持コアを下回る移動は拒否")

console.log("=== アタックとライフ受け ===")
assert(act(state, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
assert(act(state, "p1", { type: "attack", instanceId: inst.instanceId }) === null, "アタック宣言できる")
assert(state.battle !== null, "バトルが発生")
assert(act(state, "p1", { type: "takeLife" }) !== null, "アタック側のライフ受けは拒否")
assert(takeLifeAndResolve(state, "p2") === null, "防御側はライフで受けられる")
assert(state.players.p2.life === 4, "p2のライフが4になる")
assert(state.players.p2.reserve === 5, "ライフのコアがリザーブへ移動（4+1）")
assert(state.battle === null, "バトル終了")

console.log("=== ターン終了 → p2のターン ===")
assert(act(state, "p1", { type: "endTurn" }) === null, "ターン終了できる")
assert(state.turnPlayer === "p2", "ターンプレイヤーがp2に交代")
assert(state.turn === 4, "ターン数が進む（テスト用に開始を3としているため4）")
assert(state.players.p2.hand.length === 5, "p2はドローして手札5枚")
assert(state.phase === "main", "メインステップから開始")

console.log("=== p2: 召喚 → ブロックの流れ ===")
state.players.p2.hand[0] = "BS01-053" // リーヴォルフ: コスト2・維持1
assert(act(state, "p2", { type: "summon", handIndex: 0 }) === null, "リーヴォルフを召喚")
assert(act(state, "p2", { type: "endTurn" }) === null, "p2ターン終了")

// p1: ゴラドンでアタック → p2がリーヴォルフでブロック（BP2000 > BP1000）
assert(act(state, "p1", { type: "nextPhase" }) === null, "p1アタックステップ")
const goradon = state.players.p1.field.spirits[0]!
assert(act(state, "p1", { type: "attack", instanceId: goradon.instanceId }) === null, "ゴラドンでアタック")
const leewolf = state.players.p2.field.spirits[0]!
assert(declareBlock(state, "p2", leewolf.instanceId) === null, "リーヴォルフでブロック")
// ブロック宣言では即解決せず、フラッシュが再オープンされる（防御側に優先権）
assert(state.battle !== null, "ブロック宣言直後はバトル継続")
assert(state.isFlashTiming === true && state.priorityPlayer === "p2", "ブロック後フラッシュ再オープン・防御側に優先権")
// 両者連続パスでバトル解決
assert(act(state, "p2", { type: "pass" }) === null, "防御側パス")
assert(act(state, "p1", { type: "pass" }) === null, "攻撃側パス")
assert(state.players.p1.field.spirits.length === 0, "BPの低いゴラドンが破壊される")
assert(state.players.p1.trashCards.includes("BS01-001"), "ゴラドンがトラッシュへ")
assert(state.players.p2.field.spirits.length === 1, "リーヴォルフは生存")

console.log("=== マジック（フレイムテンペスト：全体破壊） ===")
state.players.p1.hand[0] = "BS01-122" // フレイムテンペスト: コスト6
state.players.p1.reserve = 10
assert(act(state, "p1", { type: "endTurn" }) === null, "p1ターン終了")
assert(act(state, "p2", { type: "endTurn" }) === null, "p2ターン終了")
assert(act(state, "p1", { type: "castMagic", handIndex: 0 }) === null, "フレイムテンペストを使用")
assert(state.players.p2.field.spirits.length === 0, "BP3000以下のリーヴォルフが全体破壊される")

console.log("=== フラッシュ優先権（交互パス） ===")
{
    const s = createGame(
        "flash-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    // p1にアタッカー（ゴラドン）を召喚し、p2にブロッカーを直接配置
    s.players.p1.hand[0] = "BS01-001" // ゴラドン: コスト0・維持1・Lv1 BP1000
    act(s, "p1", { type: "summon", handIndex: 0 })
    const atk = s.players.p1.field.spirits[0]!
    const blocker = createInstance("BS01-001", s.turn, 1) // Lv1 BP1000
    s.players.p2.field.spirits.push(blocker)

    // フラッシュマジックを両者の手札に仕込む
    s.players.p1.hand[0] = "BS01-118" // コールオブロスト: フラッシュ bpBuff+2000
    s.players.p2.hand[0] = "BS01-123" // リターンドロー: フラッシュ bpBuff+1000
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10

    // アタック直後：防御側に優先権
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ゴラドンでアタック")
    assert(s.isFlashTiming === true, "アタックでフラッシュタイミング開始")
    assert(s.priorityPlayer === "p2", "アタック直後は防御側に優先権")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId }) !== null,
        "優先権のない攻撃側のマジックは拒否",
    )
    assert(act(s, "p1", { type: "pass" }) !== null, "優先権のない攻撃側のパスは拒否")

    // 防御側パス → 攻撃側に優先権が移る
    assert(act(s, "p2", { type: "pass" }) === null, "防御側はパスできる")
    assert(s.priorityPlayer === "p1", "パスで優先権が攻撃側へ移る")
    assert(s.flashCount === 1, "パスでフラッシュカウントが1になる")
    assert(
        act(s, "p2", { type: "block", instanceId: blocker.instanceId }) !== null,
        "攻撃側に優先権がある間のブロックは拒否",
    )
    assert(act(s, "p2", { type: "takeLife" }) !== null, "攻撃側に優先権がある間のライフ受けは拒否")

    // 攻撃側がフラッシュマジックを使用できる
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId }) === null,
        "優先権を得た攻撃側がフラッシュマジックを使える",
    )
    assert(atk.tempBpBuff === 2000, "コールオブロストでBP+2000")
    assert(s.priorityPlayer === "p2", "使用後は優先権が防御側へ戻る")
    assert(s.flashCount === 0, "使用後はフラッシュカウントがリセットされる")

    // 両者連続パスでフラッシュ終了
    assert(act(s, "p2", { type: "pass" }) === null, "防御側の再パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側もパス")
    assert(s.isFlashTiming === false, "両者連続パスでフラッシュ終了")
    assert(s.battle !== null, "フラッシュ終了後もバトルは継続")
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: blocker.instanceId }) !== null,
        "フラッシュ終了後のマジックは拒否",
    )
    assert(act(s, "p2", { type: "pass" }) !== null, "フラッシュ終了後のパスは拒否")

    // フラッシュ終了後はブロックできる（BP3000 vs BP1000 でブロッカー破壊）
    assert(
        act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null,
        "フラッシュ終了後はブロックできる",
    )
    // ブロック宣言でフラッシュが再オープンされる（即解決しない）
    assert(s.battle !== null, "ブロック宣言直後はバトル継続")
    assert(s.isFlashTiming === true && s.priorityPlayer === "p2", "ブロック後フラッシュ再オープン・防御側に優先権")
    // 両者連続パスでバトル解決
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後フラッシュで防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後フラッシュで攻撃側パス")
    assert(s.battle === null, "バトルが解決される")
    assert(s.players.p2.field.spirits.length === 0, "BPで負けたブロッカーが破壊される")
    assert(s.players.p1.field.spirits.includes(atk), "BP増加したアタッカーは生存")

    // 2回目のバトル：フラッシュ終了後のライフ受けを確認
    const atk2 = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(atk2)
    assert(act(s, "p1", { type: "attack", instanceId: atk2.instanceId }) === null, "2体目でアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(s.isFlashTiming === false, "2回連続パスでフラッシュ終了")
    const lifeBefore = s.players.p2.life
    assert(takeLifeAndResolve(s, "p2") === null, "フラッシュ終了後はライフで受けられる")
    assert(s.players.p2.life === lifeBefore - 1, "ライフが1減る")
    assert(s.battle === null, "バトル終了でフラッシュ状態もリセット")
}

console.log("=== ブロック宣言後の追加フラッシュ ===")
{
    const s = createGame(
        "block-flash-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    // p1: ゴラドン（Lv1 BP1000）を攻撃側、p2: リーヴォルフ（Lv1 BP2000）を防御側に直接配置
    const atk = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    const blk = createInstance("BS01-053", s.turn, 1) // リーヴォルフ Lv1 BP2000
    s.players.p1.field.spirits.push(atk)
    s.players.p2.field.spirits.push(blk)

    // p1 が攻撃側でフラッシュマジック（コールオブロスト：bpBuff+2000）を握る
    s.players.p1.hand[0] = "BS01-118"
    s.players.p1.reserve = 10

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ゴラドンでアタック")
    assert(s.priorityPlayer === "p2", "アタック直後は防御側に優先権")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")

    // ブロック宣言 → 即解決せずフラッシュ再オープン（防御側から優先権）
    assert(act(s, "p2", { type: "block", instanceId: blk.instanceId }) === null, "リーヴォルフでブロック")
    assert(s.battle !== null, "ブロック宣言では即解決しない")
    assert(s.battle?.blockerInstanceId === blk.instanceId, "ブロッカーがセットされる")
    assert(s.isFlashTiming === true, "ブロック後にフラッシュが再オープンされる")
    assert(s.priorityPlayer === "p2", "ブロック後フラッシュは防御側から優先権を持つ")

    // ブロック済みなのでライフ受け・再ブロックは拒否
    assert(act(s, "p2", { type: "takeLife" }) !== null, "ブロック済みのライフ受けは拒否")
    assert(act(s, "p2", { type: "block", instanceId: blk.instanceId }) !== null, "ブロック済みの再ブロックは拒否")

    // 防御側パス → 攻撃側に優先権 → 攻撃側が bpBuff（1000→3000）
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(s.priorityPlayer === "p1", "パスで優先権が攻撃側へ")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId }) === null,
        "ブロック後フラッシュで攻撃側がコールオブロストを使用",
    )
    assert(atk.tempBpBuff === 2000, "ゴラドンにBP+2000（実効BP3000）")
    assert(s.priorityPlayer === "p2", "使用後は優先権が防御側へ戻る")

    // 両者連続パスでバトル解決：素なら1000<2000で負ける攻撃側が、バフで3000>2000となり勝つ
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(s.battle === null, "両者連続パスでバトルが解決される")
    assert(!s.players.p2.field.spirits.includes(blk), "バフで負けたブロッカーが破壊される")
    assert(s.players.p1.field.spirits.includes(atk), "バフで勝った攻撃側は生存")
}

console.log("=== 覚醒（フラッシュ優先権との整合） ===")
{
    const s = createGame(
        "awaken-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    // 覚醒持ち（タウロスナイト）とコアの移動元（ゴラドン）を直接配置
    const awakener = createInstance("BS01-013", s.turn, 1) // タウロスナイト: 【覚醒】Lv1-3
    const source = createInstance("BS01-001", s.turn, 3) // ゴラドン: 維持コア1
    s.players.p1.field.spirits.push(awakener, source)

    // フラッシュ外の覚醒は拒否
    assert(
        act(s, "p1", { type: "awaken", instanceId: awakener.instanceId, fromInstanceId: source.instanceId, count: 1 }) !== null,
        "フラッシュ外の覚醒は拒否",
    )

    // アタック → フラッシュ開始（優先権は防御側）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: awakener.instanceId }) === null, "タウロスナイトでアタック")
    assert(s.isFlashTiming === true, "アタックでフラッシュタイミング開始")
    assert(s.priorityPlayer === "p2", "アタック直後は防御側に優先権")
    assert(
        act(s, "p1", { type: "awaken", instanceId: awakener.instanceId, fromInstanceId: source.instanceId, count: 1 }) !== null,
        "優先権のない攻撃側の覚醒は拒否",
    )

    // 防御側がパス → 優先権を得た攻撃側が覚醒できる
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(s.flashCount === 1, "パスでフラッシュカウントが1になる")
    assert(
        act(s, "p1", { type: "awaken", instanceId: source.instanceId, fromInstanceId: awakener.instanceId, count: 1 }) !== null,
        "覚醒を持たないスピリットへの覚醒は拒否",
    )
    assert(
        act(s, "p1", { type: "awaken", instanceId: awakener.instanceId, fromInstanceId: source.instanceId, count: 1 }) === null,
        "優先権を得た攻撃側が覚醒できる",
    )
    assert(awakener.cores === 2 && source.cores === 2, "コアが1個移動する")
    assert(s.priorityPlayer === "p2", "覚醒後は優先権が相手へ移る")
    assert(s.flashCount === 0, "覚醒後はフラッシュカウントがリセットされる")

    // 再び優先権を得て残りをまとめて移す → 移動元は維持コア割れで消滅
    assert(act(s, "p2", { type: "pass" }) === null, "防御側の再パス")
    assert(
        act(s, "p1", { type: "awaken", instanceId: awakener.instanceId, fromInstanceId: source.instanceId, count: 2 }) === null,
        "残り2個をまとめて覚醒で移せる",
    )
    assert(awakener.cores === 4, "タウロスナイトのコアが4個になる")
    assert(!s.players.p1.field.spirits.includes(source), "維持コア割れの移動元は消滅する")
    assert(s.players.p1.trashCards.includes("BS01-001"), "消滅した移動元がトラッシュへ")
    assert(s.priorityPlayer === "p2", "2回目の覚醒でも優先権が相手へ移る")
}

console.log("=== コア除去・BP増加アクション ===")
{
    const s = createGame(
        "action-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    // 維持コア1のゴラドンを召喚し、コアを3個まで増やしておく
    s.players.p1.hand[0] = "BS01-001"
    act(s, "p1", { type: "summon", handIndex: 0 })
    const sp = s.players.p1.field.spirits[0]!
    s.players.p1.reserve += 2
    sp.cores = 3

    // coreRemove: 対象のコアが減り、リザーブが増える
    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p1", null, { type: "coreRemove", count: 2 }, sp.instanceId)
    assert(sp.cores === 1, "コア除去で対象のコアが2個減る")
    assert(s.players.p1.reserve === reserveBefore + 2, "除去したコアがリザーブへ2個戻る")

    // coreRemove: 維持コア（Lv1）を下回ると消滅する
    resolveAction(s, "p1", null, { type: "coreRemove", count: 1 }, sp.instanceId)
    assert(s.players.p1.field.spirits.length === 0, "維持コア割れでスピリットが消滅する")
    assert(s.players.p1.trashCards.includes("BS01-001"), "消滅したスピリットがトラッシュへ")

    // bpBuff: 対象のtempBpBuffが増える
    s.players.p1.hand[0] = "BS01-001"
    act(s, "p1", { type: "summon", handIndex: 0 })
    const sp2 = s.players.p1.field.spirits[0]!
    const buffBefore = sp2.tempBpBuff
    resolveAction(s, "p1", null, { type: "bpBuff", amount: 2000 }, sp2.instanceId)
    assert(sp2.tempBpBuff === buffBefore + 2000, "BP増加でtempBpBuffが増える")
}

console.log("=== 疲労付与・疲労破壊アクション ===")
{
    const s = createGame(
        "exhaust-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    // p2フィールドにBPの異なるゴラドンを2体直接配置（低BP1000・高BP3000、共に回復状態）
    const low = createInstance("BS01-001", s.turn, 1) // Lv1: BP1000
    const high = createInstance("BS01-001", s.turn, 3) // Lv2: BP3000
    s.players.p2.field.spirits.push(low, high)

    // exhaust: 対象未指定 → 回復状態の中でBP最大（high）が自動選択され疲労する
    resolveAction(s, "p1", null, { type: "exhaust", count: 1 })
    assert(high.isRested === true, "exhaustでBP最大の対象が疲労する（自動選択）")
    assert(low.isRested === false, "BPの低い方は疲労しない")

    // exhaust: 疲労済みの対象を指定 → no-op（状態が変わらない）
    resolveAction(s, "p1", null, { type: "exhaust", count: 1 }, high.instanceId)
    assert(high.isRested === true, "疲労済みの対象へのexhaustはno-op（疲労状態のまま）")
    assert(low.isRested === false, "no-opの間に他の対象が疲労することはない")

    // destroyExhausted: 回復状態の対象を指定 → no-op（破壊されない）
    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { rested: true } }, low.instanceId)
    assert(s.players.p2.field.spirits.includes(low), "回復状態の対象へのdestroyExhaustedはno-op")

    // destroyExhausted: 対象未指定 → 疲労状態のスピリット（high）が自動選択され破壊される
    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { rested: true } })
    assert(!s.players.p2.field.spirits.includes(high), "疲労状態のスピリットが破壊される")
    assert(s.players.p2.field.spirits.includes(low), "回復状態のスピリットはdestroyExhaustedの自動選択で選ばれない")
    assert(s.players.p2.trashCards.includes("BS01-001"), "破壊されたスピリットがトラッシュへ送られる")
}

console.log("=== 可変数ドロー・可変数BP増加・全体対象アクション ===")
{
    const s = createGame(
        "variable-action-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    console.log("--- drawPer: exhaustedEnemies ---")
    const e1 = createInstance("BS01-001", s.turn, 1)
    const e2 = createInstance("BS01-001", s.turn, 1)
    e1.isRested = true
    e2.isRested = true
    s.players.p2.field.spirits.push(e1, e2)

    const handBefore1 = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "drawPer", counter: "exhaustedEnemies" })
    assert(s.players.p1.hand.length === handBefore1 + 2, "相手の疲労スピリット2体で2枚ドローする")

    // 疲労スピリットがいなければドローしない（ログのみ）
    e1.isRested = false
    e2.isRested = false
    const handBefore2 = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "drawPer", counter: "exhaustedEnemies" })
    assert(s.players.p1.hand.length === handBefore2, "疲労スピリットが0体ならドローしない")

    console.log("--- drawPer: opponentHand ---")
    s.players.p2.hand = ["BS01-001", "BS01-002", "BS01-003"]
    const handBefore3 = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "drawPer", counter: "opponentHand" })
    assert(s.players.p1.hand.length === handBefore3 + 3, "相手の手札枚数（3枚）ぶんドローする")

    console.log("--- bpBuffPer ---")
    e1.isRested = true
    e2.isRested = true
    const buffTarget = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(buffTarget)
    resolveAction(
        s,
        "p1",
        null,
        { type: "bpBuffPer", counter: "exhaustedEnemies", amountPer: 1000 },
        buffTarget.instanceId,
    )
    assert(buffTarget.tempBpBuff === 2000, "疲労2体×1000でtempBpBuffが2000増える")

    // 疲労スピリットがいなければ増加しない（ログのみ）
    e1.isRested = false
    e2.isRested = false
    const buffBefore = buffTarget.tempBpBuff
    resolveAction(
        s,
        "p1",
        null,
        { type: "bpBuffPer", counter: "exhaustedEnemies", amountPer: 1000 },
        buffTarget.instanceId,
    )
    assert(buffTarget.tempBpBuff === buffBefore, "疲労スピリットが0体ならBPが増加しない")

    console.log("--- discardHandAll ---")
    s.players.p1.hand = ["BS01-004", "BS01-005"]
    resolveAction(s, "p1", null, { type: "discardHandAll" })
    assert(s.players.p1.hand.length === 0, "discardHandAllで手札が空になる")
    assert(
        s.players.p1.trashCards.includes("BS01-004") &&
            s.players.p1.trashCards.includes("BS01-005"),
        "discardHandAllで手札がすべてトラッシュへ送られる",
    )

    console.log("--- bpBuffAll ---")
    const spA = createInstance("BS01-001", s.turn, 1)
    const spB = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(spA, spB)
    resolveAction(s, "p1", null, { type: "bpBuffAll", amount: 1000 })
    assert(
        spA.tempBpBuff === 1000 && spB.tempBpBuff === 1000,
        "bpBuffAllで自分のスピリット全員のtempBpBuffが増える",
    )
}

console.log("=== 複合効果（1タイミングに複数エントリ、配列順に実行） ===")
{
    const s = createGame(
        "composite-magic-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "green" },
    )
    runTurnStart(s)

    // ハンドリバース（メイン：discardHandAll → drawPer opponentHand の複合効果）
    s.players.p1.hand[0] = "BS01-138"
    s.players.p1.reserve = 10
    s.players.p2.hand = ["BS01-001", "BS01-002", "BS01-003"] // 相手の手札3枚

    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ハンドリバースを使用できる")
    assert(s.players.p1.trashCards.includes("BS01-138"), "使用したハンドリバース自身がトラッシュへ")
    assert(
        s.players.p1.hand.length === 3,
        "破棄後に相手の手札3枚ぶんドローし直すため手札は3枚になる",
    )

    // ログの並び順で「破棄」が「ドロー」より先に実行されたことを確認（配列順=discardHandAll→drawPer）
    const discardIdx = s.log.findIndex((m) => m.includes("破棄した"))
    const drawIdx = s.log.findIndex((m) => m.includes("3枚ドローした"))
    assert(
        discardIdx !== -1 && drawIdx !== -1 && discardIdx < drawIdx,
        "同一timing内の複数効果が配列順（破棄→ドロー）で実行される",
    )
}

console.log("=== ビュー（情報秘匿）の確認 ===")
const view = viewFor(state, "p1")
assert(view.players.p1.hand !== null, "自分の手札は見える")
assert(view.players.p2.hand === null, "相手の手札は見えない")
assert(view.players.p2.handCount === state.players.p2.hand.length, "相手の手札枚数は見える")

console.log("=== コスト支払い（スピリット上のコア） ===")
{
    const s = createGame(
        "paysource-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    // リーヴォルフ（コスト2・維持1、緑軽減1）。緑シンボル持ちが場に出るたびに軽減が乗るため、
    // 実コストは召喚のたびに effectiveCost で動的に取得する（ハードコードしない）
    const leewolfCard = getCard("BS01-053")
    const leewolfMaintain = minLevelCores(leewolfCard)

    // p1フィールドに支払い元スピリット（ゴラドン: 維持コア1、コア5個）を直接配置
    const payer = createInstance("BS01-001", s.turn, 5)
    s.players.p1.field.spirits.push(payer)
    // p2フィールドにも比較用スピリットを配置（相手指定の拒否確認用）
    const oppSpirit = createInstance("BS01-001", s.turn, 3)
    s.players.p2.field.spirits.push(oppSpirit)

    // 1回目の召喚：まだ場に緑シンボル持ちがいないので軽減なし
    s.players.p1.hand[0] = "BS01-053"
    let cost = effectiveCost(s, "p1", leewolfCard)
    s.players.p1.reserve = leewolfMaintain // コストは全額スピリット上のコアで賄い、維持コア分だけ確保

    const trashCoresBefore1 = s.players.p1.trashCores
    const payerCoresBefore1 = payer.cores
    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySources: [{ instanceId: payer.instanceId, count: cost }],
        }) === null,
        "スピリット上のコアでコストを支払い召喚できる",
    )
    assert(payer.cores === payerCoresBefore1 - cost, "支払い元のコアがコスト分だけ減る")
    assert(s.players.p1.trashCores === trashCoresBefore1 + cost, "支払ったコアがトラッシュへ")
    assert(s.players.p1.reserve === 0, "維持コア分はリザーブから払われる")
    assert(
        s.players.p1.field.spirits.filter((sp) => sp.cardId === "BS01-053").length === 1,
        "リーヴォルフが召喚されている",
    )

    console.log("--- 維持コア割れで消滅 ---")
    // 場にリーヴォルフ（緑シンボル）が1体出たので以後は軽減後の実コストになる。
    // 支払い元のコアをちょうど実コスト分まで減らし、全額支払わせて維持コアを割らせる
    cost = effectiveCost(s, "p1", leewolfCard)
    payer.cores = cost
    s.players.p1.hand[0] = "BS01-053"
    s.players.p1.reserve = leewolfMaintain
    const trashCardsBefore = s.players.p1.trashCards.length
    const trashCoresBefore2 = s.players.p1.trashCores
    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySources: [{ instanceId: payer.instanceId, count: cost }],
        }) === null,
        "支払い元のコアを使い切る召喚ができる",
    )
    assert(!s.players.p1.field.spirits.includes(payer), "維持コア割れの支払い元が消滅する")
    assert(
        s.players.p1.trashCards.length === trashCardsBefore + 1 &&
            s.players.p1.trashCards.includes("BS01-001"),
        "消滅した支払い元のカードがトラッシュへ",
    )
    assert(s.players.p1.trashCores === trashCoresBefore2 + cost, "支払ったコアがトラッシュへ")

    console.log("--- 不正な支払いの拒否 ---")
    const payer2 = createInstance("BS01-001", s.turn, 5)
    s.players.p1.field.spirits.push(payer2)
    s.players.p1.hand[0] = "BS01-053"
    s.players.p1.reserve = 10
    cost = effectiveCost(s, "p1", leewolfCard)

    // フィールドのコアはコストにも「置くコア」にも充当できるため、上限は cost + 維持コア。
    // それを1個でも超えると拒否される（2026-08-01 利用者確認により上限を cost から広げた）
    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySources: [{ instanceId: payer2.instanceId, count: cost + leewolfMaintain + 1 }],
        }) !== null,
        "過払い（合計 > コスト+置くコア）は拒否される",
    )
    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySources: [{ instanceId: payer2.instanceId, count: 99 }],
        }) !== null,
        "支払い元のコア不足は拒否される",
    )
    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySources: [{ instanceId: oppSpirit.instanceId, count: 1 }],
        }) !== null,
        "相手スピリットを支払い元に指定すると拒否される",
    )
    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySources: [
                { instanceId: payer2.instanceId, count: 1 },
                { instanceId: payer2.instanceId, count: 1 },
            ],
        }) !== null,
        "同一支払い元の重複指定は拒否される",
    )
    assert(payer2.cores === 5, "拒否された支払いでは支払い元のコアは変化しない")

    console.log("--- paySourcesなしの従来動作 ---")
    s.players.p1.hand[0] = "BS01-053"
    cost = effectiveCost(s, "p1", leewolfCard)
    s.players.p1.reserve = cost + leewolfMaintain
    const reserveBefore = s.players.p1.reserve
    const trashCoresBefore3 = s.players.p1.trashCores
    assert(
        act(s, "p1", { type: "summon", handIndex: 0 }) === null,
        "paySources未指定でも従来通りリザーブのみで召喚できる",
    )
    assert(
        s.players.p1.reserve === reserveBefore - (cost + leewolfMaintain),
        "リザーブがコスト+維持コア分減る",
    )
    assert(s.players.p1.trashCores === trashCoresBefore3 + cost, "コスト分がトラッシュへ")
    assert(payer2.cores === 5, "従来動作ではスピリット上のコアは変化しない")

    console.log("--- castMagicでもスピリット上のコアを併用できる ---")
    // フレイムテンペスト（コスト6・赤軽減2）を手札に。支払い元スピリットを先に配置してから実コストを動的に取得する
    // （赤シンボル持ちスピリットの数で軽減されるため、配置後に effectiveCost を計算しないと実際の支払い時と値がずれる）
    s.players.p1.hand[0] = "BS01-122"
    // 支払い元は BP4000 のロクケラトプス（バニラ・コア5でLv3）。フレイムテンペストは
    // BP3000以下のスピリットを**両陣営**破壊するため（anySide）、支払い後もBP4000を保つ個体を使う
    const magicPayer1 = createInstance("BS01-002", s.turn, 5)
    const magicPayer2 = createInstance("BS01-002", s.turn, 5)
    // 直前のサブテストで置いた低BPスピリットは、破壊されるとコアがリザーブへ戻ってしまい
    // 「リザーブは変化しない」の検証を汚すため、フィールドを支払い元2体だけにする
    s.players.p1.field.spirits = [magicPayer1, magicPayer2]
    const magicCard = getCard("BS01-122")
    const magicCost = effectiveCost(s, "p1", magicCard)
    s.players.p1.reserve = 0 // リザーブは0、全額をスピリット上のコアで賄う
    // 2体の支払い元に分割してちょうど実コスト分を支払う（維持コア1を下回らない範囲）
    const half = Math.floor(magicCost / 2)
    const rest = magicCost - half
    assert(
        act(s, "p1", {
            type: "castMagic",
            handIndex: 0,
            paySources: [
                { instanceId: magicPayer1.instanceId, count: half },
                { instanceId: magicPayer2.instanceId, count: rest },
            ],
        }) === null,
        "マジックのコストを複数のスピリット上のコアに分割して支払える",
    )
    assert(magicPayer1.cores === 5 - half, "支払い元1のコアが減る")
    assert(magicPayer2.cores === 5 - rest, "支払い元2のコアが減る")
    assert(s.players.p1.field.spirits.includes(magicPayer1), "維持コアを上回るため支払い元1は生存")
    assert(s.players.p1.field.spirits.includes(magicPayer2), "維持コアを上回るため支払い元2は生存")
    assert(s.players.p1.reserve === 0, "リザーブは変化しない（全額スピリット上のコアで支払った）")
}

console.log("=== バウンス系・コア操作系アクション ===")
{
    const s = createGame(
        "bounce-core-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    console.log("--- returnToHand: 破壊ではないため onDestroy が誘発しない ---")
    // ミストウィゼル（BS01-042）はonDestroy（Lv1/2）でdraw3を持つ。
    // 誤ってdestroySpiritを呼んでいればp2の手札が4枚（戻り1+ドロー3）増えてしまう
    const mistwizel = createInstance("BS01-042", s.turn, 3) // Lv1 BP2000、コア3個
    s.players.p2.field.spirits.push(mistwizel)
    const p2HandBefore = s.players.p2.hand.length
    const p2ReserveBefore = s.players.p2.reserve
    resolveAction(s, "p1", null, { type: "returnToHand", count: 1 })
    assert(!s.players.p2.field.spirits.includes(mistwizel), "対象がp2フィールドから消える")
    assert(
        s.players.p2.hand.length === p2HandBefore + 1,
        "p2の手札はちょうど1枚増える（onDestroyのdraw3は誘発しない）",
    )
    assert(s.players.p2.hand.includes("BS01-042"), "戻したカードがp2の手札に入る")
    assert(!s.players.p2.trashCards.includes("BS01-042"), "破壊ではないのでトラッシュへは行かない")
    assert(s.players.p2.reserve === p2ReserveBefore + 3, "コア3個が持ち主のリザーブへ戻る")

    console.log("--- returnToDeckTop: デッキの一番上に戻り、次のドローで引く ---")
    const goradonOnField = createInstance("BS01-001", s.turn, 1) // Lv1 BP1000、コア1個
    s.players.p2.field.spirits.push(goradonOnField)
    const p2DeckBefore = s.players.p2.deck.length
    const p2ReserveBefore2 = s.players.p2.reserve
    resolveAction(s, "p1", null, { type: "returnToDeckTop" })
    assert(!s.players.p2.field.spirits.includes(goradonOnField), "対象がp2フィールドから消える")
    assert(s.players.p2.deck.length === p2DeckBefore + 1, "p2のデッキが1枚増える")
    assert(s.players.p2.deck[0] === "BS01-001", "戻したカードがデッキの一番上になる")
    assert(s.players.p2.reserve === p2ReserveBefore2 + 1, "コア1個が持ち主のリザーブへ戻る")
    const p2HandBeforeDraw = s.players.p2.hand.length
    draw(s, "p2", 1)
    assert(
        s.players.p2.hand[s.players.p2.hand.length - 1] === "BS01-001",
        "次のドローでデッキトップに戻したカードを引く",
    )
    assert(s.players.p2.hand.length === p2HandBeforeDraw + 1, "ドローで手札が1枚増える")

    console.log("--- coreCharge: 対象のコアが増えリザーブが減る（不足時は可能な分だけ） ---")
    const chargeTarget = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(chargeTarget)
    s.players.p1.reserve = 5
    resolveAction(s, "p1", null, { type: "coreCharge", count: 3 }, chargeTarget.instanceId)
    assert(chargeTarget.cores === 4, "リザーブが十分なら指定数ぶんコアが増える（1→4）")
    assert(s.players.p1.reserve === 2, "置いた分だけリザーブが減る（5→2）")

    s.players.p1.reserve = 1 // リザーブ不足（count=3に対して1しかない）
    resolveAction(s, "p1", null, { type: "coreCharge", count: 3 }, chargeTarget.instanceId)
    assert(chargeTarget.cores === 5, "リザーブ不足時は置ける分だけコアが増える（4→5）")
    assert(s.players.p1.reserve === 0, "リザーブは0まで減って止まる")

    console.log("--- lifeCharge: ライフ+・リザーブ-（不足時は可能な分だけ） ---")
    const lifeBefore = s.players.p1.life
    s.players.p1.reserve = 5
    resolveAction(s, "p1", null, { type: "lifeCharge", count: 1 })
    assert(s.players.p1.life === lifeBefore + 1, "ライフが1増える")
    assert(s.players.p1.reserve === 4, "リザーブが1減る")

    s.players.p1.reserve = 0
    const lifeBefore2 = s.players.p1.life
    resolveAction(s, "p1", null, { type: "lifeCharge", count: 1 })
    assert(s.players.p1.life === lifeBefore2, "リザーブ不足時はライフが増えない")
    assert(s.players.p1.reserve === 0, "リザーブ不足時はリザーブも変化しない")

    console.log("--- coreGain: ボイドからリザーブ+（他は減らない） ---")
    const p1ReserveBefore = s.players.p1.reserve
    const p2ReserveBefore3 = s.players.p2.reserve
    resolveAction(s, "p1", null, { type: "coreGain", count: 1 })
    assert(s.players.p1.reserve === p1ReserveBefore + 1, "自分のリザーブが1増える")
    assert(s.players.p2.reserve === p2ReserveBefore3, "相手のリザーブは変化しない（ボイドから湧くため）")

    console.log("--- 実カード経由（castMagic）：アウェイクンの複合効果（コア置き＋ドロー） ---")
    const awakenerTarget = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(awakenerTarget)
    s.players.p1.hand[0] = "BS01-115" // アウェイクン: フラッシュ [coreCharge 3, draw 1]
    s.players.p1.reserve = 20
    const deckBeforeCast = s.players.p1.deck.length
    const coresBeforeCast = awakenerTarget.cores
    const reserveBeforeCast = s.players.p1.reserve
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: awakenerTarget.instanceId }) === null,
        "アウェイクンを使用できる（対象は自分のスピリット）",
    )
    assert(s.players.p1.trashCards.includes("BS01-115"), "使用したアウェイクン自身がトラッシュへ")
    assert(awakenerTarget.cores === coresBeforeCast + 3, "対象のコアが3個増える")
    assert(
        s.players.p1.reserve === reserveBeforeCast - effectiveCost(s, "p1", getCard("BS01-115")) - 3,
        "リザーブがコスト支払い分＋コアチャージ3個ぶん減る",
    )
    assert(s.players.p1.deck.length === deckBeforeCast - 1, "複合効果のドローでデッキが1枚減る")
}

console.log("=== 疲労回復・アタック制御アクション（refreshAllOwn） ===")
{
    const s = createGame(
        "refresh-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    // 疲労状態2体（restA/restB）と回復状態1体（freshC）を直接配置
    const restA = createInstance("BS01-001", s.turn, 1) // Lv1 BP1000
    const restB = createInstance("BS01-001", s.turn, 1)
    const freshC = createInstance("BS01-001", s.turn, 1)
    restA.isRested = true
    restB.isRested = true
    s.players.p1.field.spirits.push(restA, restB, freshC)

    resolveAction(s, "p1", null, { type: "refreshAllOwn" })
    assert(!restA.isRested && !restB.isRested, "疲労していた2体が回復する")
    assert(
        restA.cantAttackThisTurn === true && restB.cantAttackThisTurn === true,
        "回復した2体はこのターンアタック不可になる",
    )
    assert(freshC.cantAttackThisTurn === false, "元から回復状態だった個体はアタック不可にならない")

    // 疲労状態のスピリットが0体になった状態で再実行 → no-op（ログのみで安全）
    const logLenBefore = s.log.length
    resolveAction(s, "p1", null, { type: "refreshAllOwn" })
    assert(s.log.length === logLenBefore + 1, "疲労スピリットが0体でもログのみで安全に処理される")

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: restA.instanceId }) !== null,
        "refreshAllOwnで回復した個体のアタックは拒否される",
    )
    assert(
        act(s, "p1", { type: "attack", instanceId: freshC.instanceId }) === null,
        "アタック不可扱いでない個体は通常通りアタックできる",
    )
    assert(takeLifeAndResolve(s, "p2") === null, "バトルを解決してテストを進める")

    assert(act(s, "p1", { type: "endTurn" }) === null, "ターン終了できる")
    assert(
        restA.cantAttackThisTurn === false && restB.cantAttackThisTurn === false,
        "ターン終了でアタック不可状態が解除される",
    )
}

console.log("=== バトル制御アクション（endBattle） ===")
{
    const s = createGame(
        "endbattle-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const atk = createInstance("BS01-001", s.turn, 1)
    const blk = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(atk)
    s.players.p2.field.spirits.push(blk)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(s.battle !== null, "バトルが発生している")

    const p1LifeBefore = s.players.p1.life
    const p2LifeBefore = s.players.p2.life
    resolveAction(s, "p1", null, { type: "endBattle" })
    assert(s.battle === null, "endBattleでバトルが即終了する")
    assert(s.players.p1.field.spirits.includes(atk), "endBattleではアタック側スピリットは破壊されない")
    assert(s.players.p2.field.spirits.includes(blk), "endBattleでは防御側スピリットも破壊されない")
    assert(
        s.players.p1.life === p1LifeBefore && s.players.p2.life === p2LifeBefore,
        "endBattleではライフダメージが発生しない",
    )

    // バトル外でのendBattleはno-op（ログのみで安全）
    const logLenBefore = s.log.length
    resolveAction(s, "p1", null, { type: "endBattle" })
    assert(s.log.length === logLenBefore + 1, "バトル外でのendBattleはログのみで安全")
}

console.log("=== 色選択の疲労アクション（exhaustAllByColor） ===")
{
    const s = createGame(
        "exhaust-color-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    // 相手（p2）フィールド：赤2体・紫1体 → 最多色は赤
    const oppRed1 = createInstance("BS01-001", s.turn, 1) // 赤
    const oppRed2 = createInstance("BS01-001", s.turn, 1) // 赤
    const oppPurple = createInstance("BS01-027", s.turn, 1) // 紫
    s.players.p2.field.spirits.push(oppRed1, oppRed2, oppPurple)

    // 自分（p1）フィールド：赤1体・紫1体（両陣営が対象になることを確認する）
    const ownRed = createInstance("BS01-001", s.turn, 1)
    const ownPurple = createInstance("BS01-027", s.turn, 1)
    s.players.p1.field.spirits.push(ownRed, ownPurple)

    resolveAction(s, "p1", null, { type: "exhaustAllByColor" })
    assert(oppRed1.isRested === true && oppRed2.isRested === true, "相手の赤スピリットは疲労する")
    assert(ownRed.isRested === true, "自分の赤スピリットも疲労する（両陣営が対象）")
    assert(oppPurple.isRested === false, "相手の紫スピリットは疲労しない")
    assert(ownPurple.isRested === false, "自分の紫スピリットは疲労しない")
}

console.log("=== 色選択の疲労アクション：相手フィールドが0体（no-op） ===")
{
    const s = createGame(
        "exhaust-color-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const logLenBefore = s.log.length
    resolveAction(s, "p1", null, { type: "exhaustAllByColor" })
    assert(s.log.length === logLenBefore + 1, "相手フィールドが0体ならログのみで安全")
}

