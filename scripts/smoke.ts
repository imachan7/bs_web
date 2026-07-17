// ゲームエンジンの簡易動作確認スクリプト（npm run smoke で実行）
// ソケットを介さず、エンジンを直接叩いて一連の流れを検証する
import {
    createGame,
    createInstance,
    draw,
    getCard,
    lv1Cores,
    validateDeckCards,
    viewFor,
} from "../server/src/logic/GameState"
import { runTurnStart as engineRunTurnStart } from "../server/src/logic/PhaseManager"

// テスト用ラッパー: 「先攻1ターン目はアタック不可」ルールの影響を受けずに
// 既存テストを動かすため、ターン開始処理の後にターン数を3（先攻の2ターン目相当）へ進める。
// 1ターン目固有の挙動（初回ドローなし等）は engineRunTurnStart 内で処理済みのため影響しない。
// 1ターン目そのものを検証するテストは engineRunTurnStart を直接使う
function runTurnStart(s: GameState): void {
    engineRunTurnStart(s)
    s.turn = 3
}
import { handleAction } from "../server/src/logic/GameEngine"
import { destroySpirit, effectiveBp, hasKeyword, resolveAction, spiritHasKeyword } from "../server/src/logic/EffectModules"
import { effectiveCost } from "../server/src/logic/RuleValidator"
import type { GameAction, GameState, PlayerId } from "../server/src/type"
import { DECK_RECIPES, DECK_SIZE } from "../data/constants"

let failed = 0
let passed = 0

// --quiet（または SMOKE_QUIET=1）で成功行を抑制し、失敗と最終集計のみ表示する。
// トークン節約用: 全 ✅ 行（約600行）を出さず、結論だけを残す。
const QUIET =
    process.argv.includes("--quiet") || process.env.SMOKE_QUIET === "1"

// quiet 時は装飾出力（セクション見出し ===／---、空行、拒否ノート （…））も抑制し、
// 成功時は最終集計のみを残す。失敗（❌）は console.error なので常に表示される。
if (QUIET) {
    const realLog = console.log.bind(console)
    console.log = ((...args: unknown[]): void => {
        const head = String(args[0] ?? "").trimStart()
        if (
            head === "" ||
            head.startsWith("===") ||
            head.startsWith("---") ||
            head.startsWith("（")
        ) {
            return
        }
        realLog(...args)
    }) as typeof console.log
}

function assert(cond: boolean, label: string): void {
    if (cond) {
        passed++
        if (!QUIET) console.log(`  ✅ ${label}`)
    } else {
        failed++
        console.error(`  ❌ ${label}`)
    }
}

function act(state: GameState, pid: PlayerId, action: GameAction): string | null {
    const error = handleAction(state, pid, action)
    if (error) console.log(`  （${pid}: ${action.type} → ${error}）`)
    return error
}

console.log("=== ゲーム生成 ===")
const state = createGame(
    "smoke-test",
    { p1: "アキラ", p2: "ユウキ" },
    { p1: "red", p2: "purple" },
)
runTurnStart(state)

assert(state.players.p1.deck.length + state.players.p1.hand.length === 40, "p1のデッキ+手札が40枚")
assert(state.players.p2.deck.length + state.players.p2.hand.length === 40, "p2のデッキ+手札が40枚")
assert(state.players.p1.hand.length === 4, "p1の初期手札は4枚（先攻1ターン目ドローなし）")
assert(state.players.p1.life === 5, "初期ライフは5")
assert(state.players.p1.reserve === 5, "先攻ターン1のリザーブは4+1=5")
assert(state.phase === "main", "ターン開始処理後はメインステップ")

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
assert(act(state, "p2", { type: "takeLife" }) === null, "防御側はライフで受けられる")
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
assert(act(state, "p2", { type: "block", instanceId: leewolf.instanceId }) === null, "リーヴォルフでブロック")
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
    assert(act(s, "p2", { type: "takeLife" }) === null, "フラッシュ終了後はライフで受けられる")
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
    resolveAction(s, "p1", null, { type: "destroyExhausted", count: 1 }, low.instanceId)
    assert(s.players.p2.field.spirits.includes(low), "回復状態の対象へのdestroyExhaustedはno-op")

    // destroyExhausted: 対象未指定 → 疲労状態のスピリット（high）が自動選択され破壊される
    resolveAction(s, "p1", null, { type: "destroyExhausted", count: 1 })
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
    const leewolfMaintain = lv1Cores(leewolfCard)

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

    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySources: [{ instanceId: payer2.instanceId, count: cost + 1 }],
        }) !== null,
        "過払い（合計 > コスト）は拒否される",
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
    const magicPayer1 = createInstance("BS01-001", s.turn, 4)
    const magicPayer2 = createInstance("BS01-001", s.turn, 4)
    s.players.p1.field.spirits.push(magicPayer1, magicPayer2)
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
    assert(magicPayer1.cores === 4 - half, "支払い元1のコアが減る")
    assert(magicPayer2.cores === 4 - rest, "支払い元2のコアが減る")
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
    assert(act(s, "p2", { type: "takeLife" }) === null, "バトルを解決してテストを進める")

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

console.log("=== フラッシュ封じアクション（lockFlash） ===")
{
    const s = createGame(
        "lockflash-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const atk = createInstance("BS01-001", s.turn, 1) // Lv1 BP1000
    s.players.p1.field.spirits.push(atk)
    s.players.p1.hand[0] = "BS01-118" // コールオブロスト: フラッシュ bpBuff+2000（p1が使う用）
    s.players.p2.hand[0] = "BS01-123" // リターンドロー: フラッシュ（p2が使おうとして拒否される）
    s.players.p2.hand[1] = "BS01-053" // リーヴォルフ: 神速（p2が使おうとして拒否される）
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(s.priorityPlayer === "p2", "アタック直後は防御側に優先権")

    resolveAction(s, "p1", null, { type: "lockFlash" })
    assert(s.battle?.flashLockedPlayer === "p2", "lockFlashで相手（p2）がロックされる")

    const lockedMagicErr = act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId })
    assert(
        lockedMagicErr !== null && lockedMagicErr.includes("フラッシュで手札のカードを使用できません"),
        "ロックされた相手のフラッシュマジックは拒否される",
    )
    const lockedSummonErr = act(s, "p2", { type: "summon", handIndex: 1 })
    assert(
        lockedSummonErr !== null && lockedSummonErr.includes("フラッシュで手札のカードを使用できません"),
        "ロックされた相手の神速召喚も拒否される",
    )

    assert(act(s, "p2", { type: "pass" }) === null, "ロック中でもパスはできる")
    assert(s.priorityPlayer === "p1", "パスで優先権が攻撃側へ移る")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId }) === null,
        "ロックされていない自分はフラッシュマジックを使用できる",
    )
    assert(atk.tempBpBuff === 2000, "コールオブロストの効果が適用される")

    // 両者連続パスでフラッシュ終了 → このバトルを終える
    assert(act(s, "p2", { type: "pass" }) === null, "防御側の再パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(s.isFlashTiming === false, "両者連続パスでフラッシュ終了")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ライフで受けてバトルを終える")
    assert(s.battle === null, "バトルが終了する")

    // 2回目のバトル：新しいbattleではflashLockedPlayerがnullに戻っている
    const atk2 = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(atk2)
    s.players.p2.hand[0] = "BS01-123"
    assert(act(s, "p1", { type: "attack", instanceId: atk2.instanceId }) === null, "2体目でアタック")
    assert(s.battle?.flashLockedPlayer === null, "新しいバトルではflashLockedPlayerがリセットされている")
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: atk2.instanceId }) === null,
        "制限が残っていないため相手も通常通りフラッシュマジックを使える",
    )
}

console.log("=== 実カード経由（castMagic）：ラークドライブでバトル即終了 ===")
{
    const s = createGame(
        "real-card-endbattle-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const atk = createInstance("BS01-001", s.turn, 1)
    const blk = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(atk)
    s.players.p2.field.spirits.push(blk)

    s.players.p2.hand[0] = "BS01-148" // ラークドライブ: フラッシュ endBattle（コスト6）
    s.players.p2.reserve = 20

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(s.priorityPlayer === "p2", "防御側に優先権がある")

    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0 }) === null,
        "ラークドライブを実際に使用してバトルを終了させられる",
    )
    assert(s.battle === null, "castMagic経由でもバトルが即終了する")
    assert(s.players.p1.field.spirits.includes(atk), "アタック側スピリットは破壊されない")
    assert(s.players.p2.field.spirits.includes(blk), "防御側スピリットも破壊されない")
}

console.log("=== 新規構造化スピリットの誘発確認（実カード経由） ===")
{
    const s = createGame(
        "structured-spirit-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "purple" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20

    console.log("--- エメラルドシーザー（BS01-063）: 召喚時に相手スピリット1体を疲労 ---")
    const enemy = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000（回復状態）
    s.players.p2.field.spirits.push(enemy)
    s.players.p1.hand[0] = "BS01-063"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "エメラルドシーザーを召喚できる")
    assert(enemy.isRested === true, "召喚時効果（exhaust）で相手スピリットが疲労する")

    console.log("--- エイプウィップ（BS01-061）: 召喚時にボイドからコア1個をリザーブへ ---")
    s.players.p1.hand[0] = "BS01-061"
    const cost61 = effectiveCost(s, "p1", getCard("BS01-061"))
    const reserveBefore61 = s.players.p1.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "エイプウィップを召喚できる")
    assert(
        s.players.p1.reserve === reserveBefore61 - cost61 - 1 + 1,
        "コスト＋維持コア1個の支払い後、召喚時効果（coreGain）でリザーブが1個増える",
    )

    console.log("--- ヘル・ブリンディ（BS01-090）: 召喚時にスピリット1体を手札へ戻す ---")
    const p2HandBefore = s.players.p2.hand.length
    s.players.p1.hand[0] = "BS01-090"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ヘル・ブリンディを召喚できる")
    assert(
        !s.players.p2.field.spirits.includes(enemy),
        "召喚時効果（returnToHand）で相手スピリットがフィールドから消える",
    )
    assert(s.players.p2.hand.length === p2HandBefore + 1, "戻されたスピリットが持ち主の手札に入る")
    assert(s.players.p2.hand.includes("BS01-001"), "手札に戻ったのは対象のカードそのもの")
    assert(!s.players.p2.trashCards.includes("BS01-001"), "破壊ではないためトラッシュへは行かない")

    console.log("--- 吸血姫ヴァンピレス（BS01-048）: 召喚時に疲労状態のスピリット1体を破壊 ---")
    const restedEnemy = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1（疲労状態にする）
    restedEnemy.isRested = true
    const freshEnemy = createInstance("BS01-001", s.turn, 1) // 回復状態（破壊されないこと）
    s.players.p2.field.spirits.push(restedEnemy, freshEnemy)
    s.players.p1.reserve = 20
    s.players.p1.hand[0] = "BS01-048"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ヴァンピレスを召喚できる")
    assert(
        !s.players.p2.field.spirits.includes(restedEnemy),
        "召喚時効果（destroyExhausted）で疲労状態のスピリットが破壊される",
    )
    assert(s.players.p2.trashCards.includes("BS01-001"), "破壊されたカードがトラッシュへ")
    assert(s.players.p2.field.spirits.includes(freshEnemy), "回復状態のスピリットは破壊されない")
}

console.log("=== ステップ誘発効果：千年雪の尖塔（BS01-112） ===")
{
    const s = createGame(
        "step-trigger-spire-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)

    // p1フィールドに千年雪の尖塔（Lv1・コア0）、p2フィールドにネクサスとスピリットを配置
    const spire = createInstance("BS01-112", s.turn, 0) // Lv1: コア0
    s.players.p1.field.nexuses.push(spire)
    const oppNexus = createInstance("BS01-098", s.turn, 0) // 燃えさかる戦場（赤ネクサス）Lv1
    s.players.p2.field.nexuses.push(oppNexus)
    const oppSpirit = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1
    s.players.p2.field.spirits.push(oppSpirit)

    console.log("--- Lv1：p1のスタートステップでネクサスのみバウンス（スピリットはバウンスしない） ---")
    const p2HandBefore = s.players.p2.hand.length
    // p1のターンを再度スタートステップから実行する（turn===1のためドローはスキップされ、デッキアウトの心配がない）
    runTurnStart(s)
    assert(!s.players.p2.field.nexuses.includes(oppNexus), "p2のネクサスがフィールドから消える")
    assert(s.players.p2.hand.includes("BS01-098"), "p2のネクサスがp2の手札に戻る")
    assert(s.players.p2.hand.length === p2HandBefore + 1, "手札がちょうど1枚増える（Lv1ではスピリットバウンスなし）")
    assert(s.players.p2.field.spirits.includes(oppSpirit), "Lv1ではスピリットはバウンスされない（レベル不足で不発火）")

    console.log("--- Lv2：ネクサスバウンスに加えてスピリットバウンスも発火 ---")
    spire.cores = 4 // Lv2へ
    const oppNexus2 = createInstance("BS01-098", s.turn, 0)
    s.players.p2.field.nexuses.push(oppNexus2)
    const p2HandBefore2 = s.players.p2.hand.length
    runTurnStart(s)
    assert(!s.players.p2.field.nexuses.includes(oppNexus2), "Lv2でもネクサスがバウンスされる")
    assert(!s.players.p2.field.spirits.includes(oppSpirit), "Lv2ではスピリットもバウンスされる")
    assert(s.players.p2.hand.length === p2HandBefore2 + 2, "ネクサス＋スピリットの2枚ぶん手札が増える")

    console.log('--- turn="own"：p2のターン開始では発火しない ---')
    const oppNexus3 = createInstance("BS01-098", s.turn, 0)
    s.players.p2.field.nexuses.push(oppNexus3)
    s.turnPlayer = "p2" // p2のターン開始処理を直接検証するため切り替える
    runTurnStart(s)
    assert(
        s.players.p2.field.nexuses.includes(oppNexus3),
        "千年雪の尖塔の持ち主（p1）がturnPlayerでないため発火せず、p2のネクサスは残る",
    )
    s.turnPlayer = "p1" // 後続に影響しないよう戻す
}

console.log("=== ステップ誘発効果：侵食されゆく銀世界（BS01-113） ===")
{
    const s = createGame(
        "step-trigger-permafrost-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)

    const permafrost = createInstance("BS01-113", s.turn, 0) // Lv1: コア0
    s.players.p1.field.nexuses.push(permafrost)

    console.log('--- p1自身のアタックステップでは発火しない（turn="opponent"） ---')
    s.players.p1.trashCores = 3
    const p1ReserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1がアタックステップへ移行")
    assert(s.players.p1.trashCores === 3, "p1自身のターンではtrashCoresが動かない（不発火）")
    assert(s.players.p1.reserve === p1ReserveBefore, "p1自身のターンではreserveも変化しない")

    console.log("--- 相手（p2）のアタックステップで発火する ---")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了、p2のターンへ")
    assert(s.turnPlayer === "p2", "ターンプレイヤーがp2に交代")
    const p1ReserveBefore2 = s.players.p1.reserve
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2がアタックステップへ移行")
    assert(s.players.p1.trashCores === 0, "相手（p2）のアタックステップでp1のtrashCoresが0になる")
    assert(s.players.p1.reserve === p1ReserveBefore2 + 3, "trashCoresの3個がp1のリザーブへ移る")
}

console.log("=== 常時BP修正（オーラ）系のテスト ===")
{
    console.log("--- ガウシルヴィア（BS01-072）：自己参照カウンタ型（自分のリザーブのコア数） ---")
    const s = createGame(
        "aura-gausylvia-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const gausylvia = createInstance("BS01-072", s.turn, 3) // Lv2: コア3・素のBP4000
    s.players.p1.field.spirits.push(gausylvia)
    s.players.p1.reserve = 3
    assert(
        effectiveBp(s, "p1", gausylvia) === 4000 + 3 * 1000,
        "リザーブ3個ぶんBP+3000（素のBP4000+3000=7000）",
    )
    s.players.p1.reserve = 0
    assert(
        effectiveBp(s, "p1", gausylvia) === 4000,
        "リザーブが0個になると実効BPも素のBP4000まで下がる",
    )

    console.log("--- レインボウパピヨン（BS01-079）：条件型（自分フィールドに緑スピリット） ---")
    const papillon = createInstance("BS01-079", s.turn, 1) // Lv1: コア1・素のBP2000
    s.players.p2.field.spirits.push(papillon)
    assert(
        effectiveBp(s, "p2", papillon) === 2000,
        "緑スピリットがいない間は素のBPのまま",
    )
    const greenAlly = createInstance("BS01-052", s.turn, 1) // ペリリィフ（緑）
    s.players.p2.field.spirits.push(greenAlly)
    assert(
        effectiveBp(s, "p2", papillon) === 3000,
        "緑スピリットが自分フィールドに現れるとBP+1000",
    )
}

{
    console.log("--- 主無き古城（BS01-102）：全体オーラ（自分の紫スピリットのみ、色・持ち主・レベルで判定） ---")
    const s = createGame(
        "aura-castle-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "purple" },
    )
    runTurnStart(s)
    const castle = createInstance("BS01-102", s.turn, 0) // Lv1: コア0（levels: [1,2]で発動中）
    s.players.p1.field.nexuses.push(castle)
    const ownPurple = createInstance("BS01-027", s.turn, 1) // ウィル・オーブ（紫・p1）
    s.players.p1.field.spirits.push(ownPurple)
    const ownRed = createInstance("BS01-001", s.turn, 1) // ゴラドン（赤・p1）
    s.players.p1.field.spirits.push(ownRed)
    const oppPurple = createInstance("BS01-027", s.turn, 1) // ウィル・オーブ（紫・p2）
    s.players.p2.field.spirits.push(oppPurple)

    assert(
        effectiveBp(s, "p1", ownPurple) === 3000 + 1000,
        "p1の紫スピリットはBP+1000される（素のBP3000→実効4000、Lv1で発動中）",
    )
    assert(
        effectiveBp(s, "p1", ownRed) === 1000,
        "p1でも紫以外のスピリットには効かない",
    )
    assert(
        effectiveBp(s, "p2", oppPurple) === 3000,
        "相手（p2）の紫スピリットには効かない（発生源の持ち主基準）",
    )

    console.log("--- ネクサスのレベル条件：Lv2（コア2）でも発動継続 ---")
    castle.cores = 2 // Lv2へ
    assert(
        effectiveBp(s, "p1", ownPurple) === 4000,
        "主無き古城がLv2になってもp1の紫スピリットへのBP+1000は継続する",
    )
}

console.log("--- 燃えさかる戦場（BS01-098）：バトル限定オーラでresolveBattleの勝敗が変わる ---")
{
    const s = createGame(
        "aura-battlefield-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)

    // 燃えさかる戦場を2枚並べて、アタック中の自分スピリットにBP+1000×2する
    s.players.p1.field.nexuses.push(createInstance("BS01-098", s.turn, 0))
    s.players.p1.field.nexuses.push(createInstance("BS01-098", s.turn, 0))
    s.players.p1.hand[0] = "BS01-001" // ゴラドン：Lv1 素のBP1000
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ゴラドンを召喚")
    const attacker = s.players.p1.field.spirits[0]!

    const blocker = createInstance("BS01-053", s.turn, 1) // リーヴォルフ：Lv1 素のBP2000
    s.players.p2.field.spirits.push(blocker)

    assert(
        effectiveBp(s, "p1", attacker) === 1000,
        "バトル外では燃えさかる戦場は効かない（battlingOnly）",
    )

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ゴラドンでアタック")
    assert(
        effectiveBp(s, "p1", attacker) === 1000 + 2000,
        "アタック中は燃えさかる戦場2枚ぶんBP+2000（実効BP3000）",
    )
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "リーヴォルフでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    // 素のBPなら1000<2000でゴラドンが破壊されるはずが、実効BP3000>2000で逆転勝利する
    // → resolveBattle が currentLevel ではなく effectiveBp でBP比較していることの確認でもある
    assert(s.players.p1.field.spirits.includes(attacker), "実効BPで逆転し、ゴラドンは生存する")
    assert(!s.players.p2.field.spirits.includes(blocker), "リーヴォルフが破壊される")
}

console.log("--- 賢者の樹（BS01-106）：e1バトル限定カウンタ型 / e2エンドステップの全回復 ---")
{
    const s = createGame(
        "aura-sagetree-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const sageTree = createInstance("BS01-106", s.turn, 3) // Lv2: コア3
    s.players.p1.field.nexuses.push(sageTree)

    const battler = createInstance("BS01-053", s.turn, 1) // リーヴォルフ：Lv1 素のBP2000
    s.players.p1.field.spirits.push(battler)
    const rested1 = createInstance("BS01-001", s.turn, 1)
    rested1.isRested = true
    const rested2 = createInstance("BS01-001", s.turn, 1)
    rested2.isRested = true
    s.players.p1.field.spirits.push(rested1, rested2)

    s.battle = { attackerInstanceId: battler.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    assert(
        effectiveBp(s, "p1", battler) === 2000 + 2 * 1000,
        "疲労スピリット2体ぶん、バトル中のスピリットにBP+2000（e1: amountPer×ownExhausted）",
    )
    s.battle = null

    console.log("--- e2：Lv1（コア0）ではエンドステップの全回復は発動しない ---")
    sageTree.cores = 0 // Lv1へ
    rested1.isRested = true
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了")
    assert(rested1.isRested === true, "Lv1では自分のエンドステップでも回復しない（levels: [2]）")

    console.log("--- e2：Lv2（コア3）なら自分のエンドステップで自分のスピリットが全回復 ---")
    assert(act(s, "p2", { type: "endTurn" }) === null, "p2がターン終了、p1のターンへ")
    assert(s.turnPlayer === "p1", "p1のターンに戻る")
    sageTree.cores = 3 // Lv2へ
    rested1.isRested = true
    rested2.isRested = true
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了（エンドステップで賢者の樹e2が発動）")
    assert(!rested1.isRested, "Lv2では自分のエンドステップで疲労スピリットが回復する（rested1）")
    assert(!rested2.isRested, "Lv2では自分のエンドステップで疲労スピリットが回復する（rested2）")
}

console.log("=== バトル勝利時効果（onBattle: 相手だけ破壊したとき） ===")
{
    const s = createGame(
        "onbattle-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    console.log("--- 魔女ナージャ: バトル勝利で相手スピリット1体を疲労させる ---")
    // ナージャ Lv1（BP3000）でアタックし、ゴラドン Lv1（BP1000）にブロックさせて勝つ。
    // ブロッカーは破壊されるため、疲労付与の対象として回復状態の別スピリットを置いておく
    const nadja = createInstance("BS01-047", s.turn, 1) // 魔女ナージャ Lv1 BP3000
    s.players.p1.field.spirits.push(nadja)
    const blocker1 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    const bystander = createInstance("BS01-001", s.turn, 1) // 疲労付与の対象になる
    s.players.p2.field.spirits.push(blocker1, bystander)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: nadja.instanceId }) === null, "ナージャでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker1.instanceId }) === null, "ゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.includes(blocker1), "BPで負けたブロッカーが破壊される")
    assert(s.players.p1.field.spirits.includes(nadja), "勝ったナージャは生存")
    assert(bystander.isRested === true, "onBattle誘発：相手スピリット1体が疲労する")

    console.log("--- 相打ち（同BP）では onBattle が発火しない ---")
    bystander.isRested = false
    const nadja2 = createInstance("BS01-047", s.turn, 1) // Lv1 BP3000
    s.players.p1.field.spirits.push(nadja2)
    const blocker2 = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000（同BP）
    s.players.p2.field.spirits.push(blocker2)

    assert(act(s, "p1", { type: "attack", instanceId: nadja2.instanceId }) === null, "2体目のナージャでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker2.instanceId }) === null, "同BPのゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p1.field.spirits.includes(nadja2), "相打ちでナージャも破壊される")
    assert(!s.players.p2.field.spirits.includes(blocker2), "相打ちでブロッカーも破壊される")
    assert(bystander.isRested === false, "相打ちではonBattleが発火しない（疲労しない）")

    console.log("--- 原始鳥フェニキオス: バトル勝利でボイドからコア1個を自身の上に ---")
    const phenikios = createInstance("BS01-023", s.turn, 4) // フェニキオス Lv2（コア4）BP7000
    s.players.p1.field.spirits.push(phenikios)
    const blocker3 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(blocker3)
    const p1ReserveBefore = s.players.p1.reserve

    assert(act(s, "p1", { type: "attack", instanceId: phenikios.instanceId }) === null, "フェニキオスでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker3.instanceId }) === null, "ゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.includes(blocker3), "BPで負けたブロッカーが破壊される")
    assert(phenikios.cores === 5, "onBattle誘発：フェニキオスのコアが4→5に増える")
    assert(s.players.p1.reserve === p1ReserveBefore, "コアはボイド由来（自分のリザーブは変化しない）")
}

console.log("=== refreshSelf: このスピリットを回復 ===")
{
    const s = createGame(
        "refreshself-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const boar = createInstance("BS01-071", s.turn, 4) // 爆進獣ブランボアー Lv2
    boar.isRested = true
    s.players.p1.field.spirits.push(boar)

    resolveAction(s, "p1", boar, { type: "refreshSelf" })
    assert(!boar.isRested, "疲労していた自身が回復する")

    // すでに回復状態なら no-op（ログのみ）
    const logLen1 = s.log.length
    resolveAction(s, "p1", boar, { type: "refreshSelf" })
    assert(!boar.isRested && s.log.length === logLen1 + 1, "回復状態へのrefreshSelfはログのみで安全")

    // self が null（マジック等）でも安全に no-op
    const logLen2 = s.log.length
    resolveAction(s, "p1", null, { type: "refreshSelf" })
    assert(s.log.length === logLen2 + 1, "selfがnullでもログのみで安全")
}

console.log("=== lifeCrush: 相手のライフのコアをリザーブへ ===")
{
    const s = createGame(
        "lifecrush-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const p2ReserveBefore = s.players.p2.reserve
    resolveAction(s, "p1", null, { type: "lifeCrush", count: 2 })
    assert(s.players.p2.life === 3, "相手のライフが5→3に減る")
    assert(s.players.p2.reserve === p2ReserveBefore + 2, "減ったライフのコアが相手のリザーブへ移る")
    assert(s.winner === null, "ライフが残っていれば勝敗は付かない")

    // 残りライフを超える量は残量まで。ライフ0で勝敗が付く
    const p2ReserveBefore2 = s.players.p2.reserve
    resolveAction(s, "p1", null, { type: "lifeCrush", count: 99 })
    assert(s.players.p2.life === 0, "ライフが0になる")
    assert(s.players.p2.reserve === p2ReserveBefore2 + 3, "残りライフぶんだけリザーブへ移る（過剰分は無視）")
    assert(s.winner === "p1", "ライフ0で効果の使用者が勝利する")
}

console.log("=== voidCoreToSelf / voidCoreToSelfPer: ボイドから自身の上にコア ===")
{
    const s = createGame(
        "voidcore-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    console.log("--- voidCoreToSelf ---")
    const sp = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(sp)
    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p1", sp, { type: "voidCoreToSelf", count: 2 })
    assert(sp.cores === 3, "自身のコアが1→3に増える")
    assert(s.players.p1.reserve === reserveBefore, "コアはボイド由来（リザーブは変化しない）")

    // self が null なら no-op（ログのみ）
    const logLen1 = s.log.length
    resolveAction(s, "p1", null, { type: "voidCoreToSelf", count: 1 })
    assert(s.log.length === logLen1 + 1, "selfがnullでもログのみで安全")

    console.log("--- voidCoreToSelfPer: キングタウロス大公の召喚時 ---")
    // 自分の他スピリット2体を用意し、キングタウロス大公を召喚 → onSummonでコア2個増
    const other1 = createInstance("BS01-001", s.turn, 1)
    const other2 = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(other1, other2)
    s.players.p1.hand[0] = "BS01-X03" // キングタウロス大公: コスト8・緑軽減4
    s.players.p1.reserve = 20
    const reserveAfterPay = 20 - effectiveCost(s, "p1", getCard("BS01-X03")) - lv1Cores(getCard("BS01-X03"))
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "キングタウロス大公を召喚できる")
    const king = s.players.p1.field.spirits.find((x) => x.cardId === "BS01-X03")!
    // 維持コア1 ＋ onSummonで「自分の他スピリット数（sp/other1/other2の3体）」ぶんボイドから追加
    assert(king.cores === lv1Cores(getCard("BS01-X03")) + 3, "自分の他スピリット3体ぶんコアが増える（維持1+3）")
    assert(s.players.p1.reserve === reserveAfterPay, "増えたコアはボイド由来（リザーブはコスト・維持分のみ減る）")

    // 他スピリットが0体なら no-op（ログのみ）
    const s2 = createGame(
        "voidcore-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s2)
    const lone = createInstance("BS01-X03", s2.turn, 1)
    s2.players.p1.field.spirits.push(lone)
    const logLen2 = s2.log.length
    resolveAction(s2, "p1", lone, { type: "voidCoreToSelfPer", counter: "ownOtherSpirits" })
    assert(lone.cores === 1 && s2.log.length === logLen2 + 1, "他スピリットが0体ならコアは増えずログのみ")
}

console.log("=== カードデータの検証 ===")
for (const [name, recipe] of Object.entries(DECK_RECIPES)) {
    const total = Object.values(recipe.cards).reduce((a, b) => a + b, 0)
    assert(total === DECK_SIZE, `${name}デッキは${DECK_SIZE}枚（実際: ${total}）`)
    for (const cardId of Object.keys(recipe.cards)) {
        getCard(cardId)
    }
}

console.log("=== 第二弾（BS02）データの検証 ===")
{
    // cards.json に BS02 全115枚（通常111＋Xレア4）が入っていること
    const bs02 = ["001", "050", "063", "111", "X05", "X08"].map((n) => `BS02-${n}`)
    for (const cardId of bs02) getCard(cardId) // 実在チェック（無ければ throw）
    assert(getCard("BS02-063").limited === true, "冥犬ケルル・ベロスは禁止カード")
    assert(getCard("BS02-049").color === "yellow", "ピヨンは黄")
    assert(getCard("BS02-X05").name === "暴双龍ディラノス", "XレアのID・名前が一致")

    // 黄デッキでゲームを開始できる
    const s = createGame(
        "bs02-yellow-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    engineRunTurnStart(s)
    assert(
        s.players.p1.deck.length + s.players.p1.hand.length === 40,
        "黄デッキ40枚でゲーム開始できる",
    )
}

console.log("=== カスタムデッキ検証（validateDeckCards） ===")
{
    // DECK_RECIPES.red 相当の40枚（cardId はレシピ定義を流用。実在チェックは上のループ済み）
    const base: Record<string, number> = { ...DECK_RECIPES.red!.cards }
    assert(validateDeckCards(base) === null, "有効な40枚デッキは合格")

    const short: Record<string, number> = { ...base, "BS01-114": 2 }
    assert(
        (validateDeckCards(short) ?? "").includes("40枚"),
        "39枚のデッキは「40枚」エラー",
    )

    const sameName: Record<string, number> = { ...base, "BS01-001": 4, "BS01-114": 2 }
    assert(
        (validateDeckCards(sameName) ?? "").includes("同名"),
        "同名4枚のデッキは「同名」エラー",
    )

    const banned: Record<string, number> = { ...base, "BS01-132": 3 } // ストームドロー（禁止）
    delete banned["BS01-116"]
    assert(
        (validateDeckCards(banned) ?? "").includes("禁止"),
        "禁止カード入りのデッキは「禁止」エラー",
    )

    const unknown: Record<string, number> = { ...base, "BS01-999": 3 }
    assert(
        (validateDeckCards(unknown) ?? "").includes("存在しない"),
        "存在しないカードIDは「存在しない」エラー",
    )

    const fractional: Record<string, number> = { ...base, "BS01-114": 1.5 }
    assert(
        (validateDeckCards(fractional) ?? "").includes("枚数が不正"),
        "小数の枚数は「枚数が不正」エラー",
    )
}

console.log("=== destroy のキーワードフィルタ（ディアマット） ===")
{
    const s = createGame(
        "keyword-filter-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    // 相手フィールドに神速持ち（リーヴォルフ BP2000）と非神速の高BP（ゴラドン Lv2 BP3000）を配置
    const soku = createInstance("BS01-053", s.turn, 1) // リーヴォルフ: 神速持ち
    const plain = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2: BP3000（神速なし）
    s.players.p2.field.spirits.push(soku, plain)

    // keywordFilter: "soku" → BPが低くても神速持ちだけが対象になる
    resolveAction(s, "p1", null, { type: "destroy", count: 1, keywordFilter: "soku" })
    assert(s.players.p2.field.spirits.length === 1, "1体だけ破壊される")
    assert(
        s.players.p2.field.spirits[0]!.instanceId === plain.instanceId,
        "破壊されるのは神速持ちのリーヴォルフ（BP最大のゴラドンではない）",
    )

    // 神速持ちがいなくなったら no-op
    const logLen = s.log.length
    resolveAction(s, "p1", null, { type: "destroy", count: 1, keywordFilter: "soku" })
    assert(s.players.p2.field.spirits.length === 1, "神速持ち不在なら破壊されない")
    assert(s.log.length === logLen + 1, "対象なしのログが出る")

    // maxBp 省略（BP不問）の破壊も動くこと
    resolveAction(s, "p1", null, { type: "destroy", count: 1 })
    assert(s.players.p2.field.spirits.length === 0, "maxBp省略の破壊はBP不問で破壊できる")
}

console.log("=== 制約：ブロック不可（cantBlock） ===")
{
    const s = createGame(
        "constraint-cantblock-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "red" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    const blocker = createInstance("BS01-003", s.turn, 1) // テラノセイバー Lv1: cantBlock（levels:[1]）
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(blocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ゴラドンでアタック")
    const blockErr = act(s, "p2", { type: "block", instanceId: blocker.instanceId })
    assert(
        blockErr !== null && blockErr.includes("ブロックできません"),
        "Lv1のテラノセイバーはcantBlockでブロック拒否される",
    )

    // Lv2（コア3）ではcantBlockの対象外（levels:[1]）になり、ブロックできる
    blocker.cores = 3
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "Lv2ではcantBlockが効かずブロックできる")
}

console.log("=== 制約：ブロック不可（cantBlock、複数レベル） ===")
{
    const s = createGame(
        "constraint-cantblock-multilevel-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "red" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-001", s.turn, 1)
    const blocker = createInstance("BS01-009", s.turn, 1) // ヴォルク・バブーン Lv1: cantBlock（levels:[1,2]）
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(blocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ゴラドンでアタック")
    let err = act(s, "p2", { type: "block", instanceId: blocker.instanceId })
    assert(err !== null && err.includes("ブロックできません"), "Lv1でもcantBlockでブロック拒否される")

    blocker.cores = 3 // Lv2
    err = act(s, "p2", { type: "block", instanceId: blocker.instanceId })
    assert(err !== null && err.includes("ブロックできません"), "Lv2でもcantBlockでブロック拒否される（levels:[1,2]）")
}

console.log("=== 制約：BPの低いスピリットをブロックできない（cantBlockLowerBp） ===")
{
    const s = createGame(
        "constraint-cantblocklowerbp-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "red" },
    )
    runTurnStart(s)

    const weakAttacker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    const blocker = createInstance("BS01-012", s.turn, 4) // トライソードン Lv2: コア4 BP7000、cantBlockLowerBp（levels:[2]）
    s.players.p1.field.spirits.push(weakAttacker)
    s.players.p2.field.spirits.push(blocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: weakAttacker.instanceId }) === null, "BP1000のゴラドンでアタック")
    const err = act(s, "p2", { type: "block", instanceId: blocker.instanceId })
    assert(
        err !== null && err.includes("BPの低いスピリットはブロックできません"),
        "BP1000のゴラドンはBP7000のトライソードンにブロックされない",
    )

    // Lv1（コア1、BP1000）ならcantBlockLowerBpの対象外（levels:[2]）で、BPが同じなのでブロックできる
    blocker.cores = 1
    assert(
        act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null,
        "Lv1ではcantBlockLowerBpが効かずブロックできる（BP1000同士）",
    )
}

console.log("=== 制約：cantBlockLowerBp（同BP以上なら可能） ===")
{
    const s = createGame(
        "constraint-cantblocklowerbp-equal-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "red" },
    )
    runTurnStart(s)

    const strongAttacker = createInstance("BS01-012", s.turn, 4) // トライソードン Lv2 BP7000
    const blocker = createInstance("BS01-012", s.turn, 4) // トライソードン Lv2 BP7000、cantBlockLowerBp
    s.players.p1.field.spirits.push(strongAttacker)
    s.players.p2.field.spirits.push(blocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: strongAttacker.instanceId }) === null, "BP7000のトライソードンでアタック")
    assert(
        act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null,
        "アタッカーのBPがブロッカー以上（同BP）ならcantBlockLowerBpでもブロックできる",
    )
}

console.log("=== 制約：unblockableBy（キーワード：神速持ちにブロックされない） ===")
{
    const s = createGame(
        "constraint-unblockable-keyword-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "red" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-015", s.turn, 1) // スピノアックス Lv1: unblockableBy keywordFilter soku
    const sokuBlocker = createInstance("BS01-053", s.turn, 1) // リーヴォルフ：【神速】持ち
    const plainBlocker = createInstance("BS01-001", s.turn, 1) // ゴラドン：神速なし
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(sokuBlocker, plainBlocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "スピノアックスでアタック")
    const err = act(s, "p2", { type: "block", instanceId: sokuBlocker.instanceId })
    assert(
        err !== null && err.includes("ブロックされません"),
        "【神速】持ちのリーヴォルフはスピノアックスのアタックをブロックできない",
    )
    assert(
        act(s, "p2", { type: "block", instanceId: plainBlocker.instanceId }) === null,
        "【神速】を持たないゴラドンは通常通りブロックできる",
    )
}

console.log("=== 制約：unblockableBy（色フィルタ：緑にブロックされない） ===")
{
    const s = createGame(
        "constraint-unblockable-color-green-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-035", s.turn, 1) // ボーン・グラディエイター Lv1: unblockableBy colorFilter green
    const greenBlocker = createInstance("BS01-052", s.turn, 1) // ペリリィフ（緑）
    const otherBlocker = createInstance("BS01-001", s.turn, 1) // ゴラドン（赤）
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(greenBlocker, otherBlocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ボーン・グラディエイターでアタック")
    const err = act(s, "p2", { type: "block", instanceId: greenBlocker.instanceId })
    assert(err !== null && err.includes("ブロックされません"), "緑のペリリィフはブロックできない")
    assert(
        act(s, "p2", { type: "block", instanceId: otherBlocker.instanceId }) === null,
        "緑以外（赤）のゴラドンは通常通りブロックできる",
    )
}

console.log("=== 制約：unblockableBy（色フィルタ：赤にブロックされない） ===")
{
    const s = createGame(
        "constraint-unblockable-color-red-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-083", s.turn, 1) // ラビクリスタ Lv1: unblockableBy colorFilter red
    const redBlocker = createInstance("BS01-001", s.turn, 1) // ゴラドン（赤）
    const otherBlocker = createInstance("BS01-052", s.turn, 1) // ペリリィフ（緑）
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(redBlocker, otherBlocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ラビクリスタでアタック")
    const err = act(s, "p2", { type: "block", instanceId: redBlocker.instanceId })
    assert(err !== null && err.includes("ブロックされません"), "赤のゴラドンはブロックできない")
    assert(
        act(s, "p2", { type: "block", instanceId: otherBlocker.instanceId }) === null,
        "赤以外（緑）のペリリィフは通常通りブロックできる",
    )
}

console.log("=== discardOpponent: 相手の手札を破棄 ===")
{
    const s = createGame(
        "discard-opponent-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    s.players.p2.hand = ["BS01-001", "BS01-002", "BS01-003"]
    const trashBefore = s.players.p2.trashCards.length
    resolveAction(s, "p1", null, { type: "discardOpponent", count: 1 })
    assert(s.players.p2.hand.length === 2, "相手の手札が1枚減る")
    assert(s.players.p2.trashCards.length === trashBefore + 1, "破棄したカードがトラッシュへ増える")
    assert(s.players.p2.trashCards.includes("BS01-003"), "手札末尾のカードが破棄される（決定的選択）")

    console.log("--- 手札が足りない場合はある分だけ破棄 ---")
    s.players.p2.hand = ["BS01-001"]
    resolveAction(s, "p1", null, { type: "discardOpponent", count: 3 })
    assert(s.players.p2.hand.length === 0, "手札1枚に対しcount3でも1枚だけ破棄される")

    console.log("--- 手札0枚でも安全（no-op） ---")
    const logLenBefore = s.log.length
    resolveAction(s, "p1", null, { type: "discardOpponent", count: 1 })
    assert(s.players.p2.hand.length === 0, "手札0枚のままno-op")
    assert(s.log.length === logLenBefore + 1, "手札0枚でもログのみで安全に処理される")
}

console.log("=== 実カード経由（召喚）：マッチュラの召喚時手札破棄 ===")
{
    const s = createGame(
        "matchura-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    s.players.p1.hand[0] = "BS01-056" // マッチュラ: コスト1・維持1、召喚時 discardOpponent 1
    s.players.p1.reserve = 20
    s.players.p2.hand = ["BS01-001", "BS01-002"]
    const p2HandBefore = s.players.p2.hand.length
    const p2TrashBefore = s.players.p2.trashCards.length

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "マッチュラを召喚できる")
    assert(s.players.p2.hand.length === p2HandBefore - 1, "召喚時効果で相手の手札が1枚減る")
    assert(s.players.p2.trashCards.length === p2TrashBefore + 1, "破棄したカードが相手のトラッシュへ増える")
}

console.log("=== battleRole: onBattleの役割限定（キングタウロス大公） ===")
{
    const s = createGame(
        "battlerole-attacker-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const king = createInstance("BS01-X03", s.turn, 5) // キングタウロス大公 Lv2（コア5）BP6000
    s.players.p1.field.spirits.push(king)
    const weakBlocker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(weakBlocker)

    const p2LifeBefore = s.players.p2.life
    const p2ReserveBefore = s.players.p2.reserve

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: king.instanceId }) === null, "キングタウロス大公でアタック")
    assert(act(s, "p2", { type: "block", instanceId: weakBlocker.instanceId }) === null, "ゴラドンでブロック（アタッカー勝利）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(s.players.p2.life === p2LifeBefore - 1, "battleRole=attackerで勝利：相手のライフが1減る（lifeCrush）")
    // +1はlifeCrushで移ったライフのコア、+1は破壊されたゴラドン自身が持っていたコア（1個）がリザーブへ戻る分
    assert(s.players.p2.reserve === p2ReserveBefore + 2, "減ったライフのコア＋破壊されたゴラドンのコアが相手のリザーブへ移る")

    console.log("--- ブロッカーとして勝利したときは発火しない ---")
    const s2 = createGame(
        "battlerole-blocker-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s2)

    const king2 = createInstance("BS01-X03", s2.turn, 5) // Lv2 BP6000
    s2.players.p1.field.spirits.push(king2)
    const weakAttacker = createInstance("BS01-001", s2.turn, 1) // ゴラドン Lv1 BP1000
    s2.players.p2.field.spirits.push(weakAttacker)

    assert(act(s2, "p1", { type: "endTurn" }) === null, "p1ターン終了")
    assert(act(s2, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ移行")
    assert(act(s2, "p2", { type: "attack", instanceId: weakAttacker.instanceId }) === null, "p2のゴラドンでアタック")
    assert(act(s2, "p1", { type: "block", instanceId: king2.instanceId }) === null, "キングタウロス大公でブロック（ブロッカー勝利）")
    assert(act(s2, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s2, "p2", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(
        s2.players.p2.life === 5,
        "battleRole=attacker指定のため、ブロッカーとして勝利しても発火しない（相手ライフ不変）",
    )
}

console.log("=== battleWon: ネクサスのバトル結果誘発（無限蟲の蟻塚） ===")
{
    const s = createGame(
        "battlewon-anthill-blocker-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    console.log("--- Lv1: ブロッカー勝利で自分のブロックしたスピリットが回復する ---")
    const anthill = createInstance("BS01-108", s.turn, 0) // 無限蟲の蟻塚 Lv1（コア0）
    s.players.p1.field.nexuses.push(anthill)
    const strongBlocker = createInstance("BS01-047", s.turn, 1) // 魔女ナージャ Lv1 BP3000
    s.players.p1.field.spirits.push(strongBlocker)
    const weakAttacker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(weakAttacker)

    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ移行")
    assert(act(s, "p2", { type: "attack", instanceId: weakAttacker.instanceId }) === null, "p2のゴラドンでアタック")
    assert(act(s, "p1", { type: "block", instanceId: strongBlocker.instanceId }) === null, "ナージャでブロック（ブロッカー勝利）")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(!s.players.p2.field.spirits.includes(weakAttacker), "BPで負けたゴラドンが破壊される")
    assert(
        strongBlocker.isRested === false,
        "蟻塚Lv1誘発：ブロックしたナージャは回復する（resolveBattleで疲労させた後に回復で上書き）",
    )

    console.log("--- Lv1（e2はlevels:[2]のため対象外）: アタッカー勝利では発火しない ---")
    const s2 = createGame(
        "battlewon-anthill-attacker-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s2)

    const anthill2 = createInstance("BS01-108", s2.turn, 0) // Lv1（コア0）
    s2.players.p1.field.nexuses.push(anthill2)
    const attacker1 = createInstance("BS01-047", s2.turn, 1) // 魔女ナージャ Lv1 BP3000
    s2.players.p1.field.spirits.push(attacker1)
    const weakBlocker1 = createInstance("BS01-001", s2.turn, 1) // ゴラドン Lv1 BP1000
    s2.players.p2.field.spirits.push(weakBlocker1)

    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker1.instanceId }) === null, "ナージャでアタック")
    assert(act(s2, "p2", { type: "block", instanceId: weakBlocker1.instanceId }) === null, "ゴラドンでブロック（アタッカー勝利）")
    assert(act(s2, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(
        attacker1.isRested === true,
        "蟻塚Lv1（レベル条件外）：e2は発火せずアタッカーは疲労したまま",
    )

    console.log("--- Lv2に育てると、アタッカー勝利で自分のアタッカーが回復する ---")
    anthill2.cores = 2 // Lv2
    const attacker2 = createInstance("BS01-047", s2.turn, 1) // 魔女ナージャ Lv1 BP3000
    s2.players.p1.field.spirits.push(attacker2)
    const weakBlocker2 = createInstance("BS01-001", s2.turn, 1) // ゴラドン Lv1 BP1000
    s2.players.p2.field.spirits.push(weakBlocker2)

    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "2体目のナージャでアタック")
    assert(act(s2, "p2", { type: "block", instanceId: weakBlocker2.instanceId }) === null, "ゴラドンでブロック（アタッカー勝利）")
    assert(act(s2, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(attacker2.isRested === false, "蟻塚Lv2誘発：アタッカー勝利でアタックしたナージャが回復する")
}

console.log("=== battleWon: 古龍の縄張り（アタッカー勝利でドロー） ===")
{
    const s = createGame(
        "battlewon-dragon-territory-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const territory = createInstance("BS01-101", s.turn, 3) // 古龍の縄張り Lv2（コア3）
    s.players.p1.field.nexuses.push(territory)
    const attacker = createInstance("BS01-047", s.turn, 1) // 魔女ナージャ Lv1 BP3000
    s.players.p1.field.spirits.push(attacker)
    const weakBlocker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(weakBlocker)

    const handBefore = s.players.p1.hand.length

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ナージャでアタック")
    assert(act(s, "p2", { type: "block", instanceId: weakBlocker.instanceId }) === null, "ゴラドンでブロック（アタッカー勝利）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(s.players.p1.hand.length === handBefore + 1, "古龍の縄張りLv2誘発：アタッカー勝利で1ドロー")
}

console.log("=== 制約：必ずアタック（mustAttack、ウィル・オーブ） ===")
{
    const s = createGame(
        "constraint-mustattack-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const orb = createInstance("BS01-027", s.turn, 1) // ウィル・オーブ Lv1: mustAttack
    s.players.p1.field.spirits.push(orb)

    // メインステップからのendTurnも拒否される（アタックステップに入っていなくても強制）
    const err1 = act(s, "p1", { type: "endTurn" })
    assert(err1 !== null && err1.includes("必ずアタック"), "メインからのendTurnはmustAttackで拒否される")

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    const err2 = act(s, "p1", { type: "endTurn" })
    assert(err2 !== null && err2.includes("必ずアタック"), "アタックステップでもアタック前のendTurnは拒否される")

    assert(act(s, "p1", { type: "attack", instanceId: orb.instanceId }) === null, "ウィル・オーブでアタック")
    assert(act(s, "p2", { type: "takeLife" }) === null, "p2はライフで受ける")
    assert(act(s, "p1", { type: "endTurn" }) === null, "アタック後（疲労状態）ならendTurnできる")

    console.log("--- cantAttackThisTurn付与時はmustAttackが働かない ---")
    const s2 = createGame(
        "constraint-mustattack-cantattack-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s2)
    const orb2 = createInstance("BS01-027", s2.turn, 1)
    orb2.cantAttackThisTurn = true
    s2.players.p1.field.spirits.push(orb2)
    assert(
        act(s2, "p1", { type: "endTurn" }) === null,
        "cantAttackThisTurn付与時はmustAttackが働かずendTurnできる",
    )
}

console.log("=== フィールドイベント誘発：命の果実（BS01-107、ownLifeDamaged） ===")
{
    const s = createGame(
        "fieldevent-fruit-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const fruit = createInstance("BS01-107", s.turn, 0) // Lv1: コア0
    s.players.p1.field.nexuses.push(fruit)

    // p1のターンを終了し、p2のターンへ（p2からp1へアタックさせるため）
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了、p2のターンへ")

    console.log("--- Lv1：ライフが減ると1ドロー ---")
    const attacker1 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000（シンボル1＝ダメージ1）
    s.players.p2.field.spirits.push(attacker1)
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker1.instanceId }) === null, "p2がアタック")

    const handBefore1 = s.players.p1.hand.length
    assert(act(s, "p1", { type: "takeLife" }) === null, "p1がライフで受ける")
    assert(s.players.p1.life === 4, "p1のライフが1減る")
    assert(s.players.p1.hand.length === handBefore1 + 1, "命の果実Lv1：ライフが減ったので1ドローする")

    console.log("--- Lv2：ドローに加えてボイドからコア1個をリザーブへ ---")
    fruit.cores = 3 // Lv2へ
    const attacker2 = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(attacker2)
    assert(act(s, "p2", { type: "attack", instanceId: attacker2.instanceId }) === null, "p2が2体目でアタック")

    const handBefore2 = s.players.p1.hand.length
    const reserveBefore2 = s.players.p1.reserve
    assert(act(s, "p1", { type: "takeLife" }) === null, "p1がライフで受ける")
    assert(s.players.p1.life === 3, "p1のライフがさらに1減る")
    assert(s.players.p1.hand.length === handBefore2 + 1, "Lv2でもドローは継続する")
    // +1はライフのコアがリザーブへ移る通常処理分、+1がLv2の追加コア獲得（コアGain）分
    assert(s.players.p1.reserve === reserveBefore2 + 1 + 1, "Lv2：ボイドからコア1個がリザーブへ追加される")

    console.log("--- ライフ0で敗北が決まる場合は発火しない ---")
    s.players.p1.life = 1
    const attacker3 = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(attacker3)
    assert(act(s, "p2", { type: "attack", instanceId: attacker3.instanceId }) === null, "p2が3体目でアタック（致命傷）")

    const handBefore3 = s.players.p1.hand.length
    const reserveBefore3 = s.players.p1.reserve
    assert(act(s, "p1", { type: "takeLife" }) === null, "p1がライフで受ける")
    assert(s.players.p1.life === 0, "p1のライフが0になる")
    assert(s.winner === "p2", "p2の勝利が決まる")
    assert(s.players.p1.hand.length === handBefore3, "ライフ0で敗北が決まった場合はドローが発火しない")
    // +1はライフのコアがリザーブへ移る通常処理分のみ（fieldEvent由来の追加コア獲得+1は発火しない）
    assert(
        s.players.p1.reserve === reserveBefore3 + 1,
        "ライフ0で敗北が決まった場合はコア獲得（fieldEvent由来）が発火しない",
    )
}

console.log('=== ステップ誘発（refreshOne）：風吹く丘陵 e1（BS01-109、相手のスタートステップに【神速】持ちのみ回復） ===')
{
    const s = createGame(
        "fieldevent-hill-e1-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const hill = createInstance("BS01-109", s.turn, 0) // Lv1: コア0
    s.players.p1.field.nexuses.push(hill)

    // p1フィールドに疲労した【神速】持ち（リーヴォルフ）と、疲労した【神速】なし（ゴラドン）を配置
    const sokuSpirit = createInstance("BS01-053", s.turn, 1) // リーヴォルフ：【神速】Lv1-2
    const plainSpirit = createInstance("BS01-001", s.turn, 1) // ゴラドン：【神速】なし
    sokuSpirit.isRested = true
    plainSpirit.isRested = true
    s.players.p1.field.spirits.push(sokuSpirit, plainSpirit)

    // p1のターンを終了し、p2のスタートステップ（風吹く丘陵にとって「相手のスタートステップ」）を起こす
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了、p2のターンへ")

    assert(!sokuSpirit.isRested, "【神速】持ちの疲労スピリットが回復する")
    assert(plainSpirit.isRested === true, "【神速】を持たないスピリットは回復しない")
}

console.log("=== オーラ拡張（summonedThisTurnOnly）：風吹く丘陵 e2（BS01-109、このターン召喚されたスピリットのみBP+1000） ===")
{
    const s = createGame(
        "fieldevent-hill-e2-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const hill = createInstance("BS01-109", s.turn, 2) // Lv2: コア2
    s.players.p1.field.nexuses.push(hill)

    // このターン召喚されたスピリット（summonedTurn === s.turn）
    const freshSpirit = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(freshSpirit)

    // 前のターンから場にいるスピリット（summonedTurn が現在のターンより前）
    const oldSpirit = createInstance("BS01-001", s.turn - 1, 1)
    s.players.p1.field.spirits.push(oldSpirit)

    assert(
        effectiveBp(s, "p1", freshSpirit) === 1000 + 1000,
        "このターン召喚されたスピリットは実効BP+1000される",
    )
    assert(
        effectiveBp(s, "p1", oldSpirit) === 1000,
        "前のターンから場にいるスピリットは対象外（実効BPは変化しない）",
    )
}

console.log("=== ステップ誘発（coreRemoveSelf）：メラット（BS01-006、自分のスタートステップにコア1個をリザーブへ） ===")
{
    const s = createGame(
        "fieldevent-merat-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    console.log("--- 通常：コアが1個減ってリザーブへ ---")
    const merat = createInstance("BS01-006", s.turn, 3) // Lv2: コア3
    s.players.p1.field.spirits.push(merat)

    // p1のターンを再度スタートステップから起こす（turn===1のためドローはスキップされ、デッキアウトの心配がない）
    const reserveBefore = s.players.p1.reserve
    runTurnStart(s)
    assert(merat.cores === 2, "メラットLv1-2：自分のスタートステップでコアが1個減る")
    assert(
        s.players.p1.reserve === reserveBefore + 1 + 1,
        "取り除いたコア1個＋コアステップの+1でリザーブが2増える",
    )

    console.log("--- 維持コア割れなら消滅する ---")
    const merat2 = createInstance("BS01-006", s.turn, 1) // Lv1: コア1（維持コアぴったり）
    s.players.p2.field.spirits.push(merat2)
    s.turnPlayer = "p2" // p2のターン開始処理を直接検証するため切り替える
    runTurnStart(s)
    assert(!s.players.p2.field.spirits.includes(merat2), "コアを取り除いて維持コア割れになると消滅する")
    assert(s.players.p2.trashCards.includes("BS01-006"), "消滅したメラットがトラッシュへ")
    s.turnPlayer = "p1" // 後続に影響しないよう戻す
}

console.log("=== フィールドイベント誘発：侵食されゆく銀世界 e2（BS01-113、相手のアタックステップに自分のスピリット破壊でコア獲得） ===")
{
    const s = createGame(
        "fieldevent-permafrost-e2-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)

    const permafrost = createInstance("BS01-113", s.turn, 4) // Lv2: コア4
    s.players.p1.field.nexuses.push(permafrost)

    console.log('--- 条件を満たす（相手のアタックステップ）：破壊で発火 ---')
    // p1のターンを終了してp2のターンへ（「相手のアタックステップ」を起こすため）
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了、p2のターンへ")

    // p2に強いアタッカー、p1に弱いブロッカーを配置し、バトルでp1のスピリットを破壊させる
    const attacker = createInstance("BS01-053", s.turn, 4) // リーヴォルフ Lv2 BP3000
    const blocker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000・維持コア1
    s.players.p2.field.spirits.push(attacker)
    s.players.p1.field.spirits.push(blocker)

    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2がアタック")
    assert(act(s, "p1", { type: "block", instanceId: blocker.instanceId }) === null, "p1がブロック")

    const reserveBefore = s.players.p1.reserve
    const blockerCores = blocker.cores
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(!s.players.p1.field.spirits.includes(blocker), "BPの低いゴラドンがブロックで破壊される")
    assert(
        s.players.p1.reserve === reserveBefore + blockerCores + 1,
        "侵食Lv2誘発：破壊コアの戻り＋ボイドからのコア獲得1個でリザーブが増える",
    )

    console.log('--- 自分のアタックステップでは発火しない（turn="opponent"限定） ---')
    assert(act(s, "p2", { type: "endTurn" }) === null, "p2ターン終了、p1のターンへ")

    const attacker2 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000（p1のアタッカー、破壊される想定）
    const blocker2 = createInstance("BS01-053", s.turn, 4) // リーヴォルフ Lv2 BP3000（p2のブロッカー）
    s.players.p1.field.spirits.push(attacker2)
    s.players.p2.field.spirits.push(blocker2)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker2.instanceId }) === null, "p2がブロック")

    const reserveBefore2 = s.players.p1.reserve
    const attacker2Cores = attacker2.cores
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(!s.players.p1.field.spirits.includes(attacker2), "p1のゴラドンがバトルで破壊される")
    assert(
        s.players.p1.reserve === reserveBefore2 + attacker2Cores,
        "自分のアタックステップでは侵食Lv2が発火しない（破壊コアの戻りのみ、コア獲得+1なし）",
    )
}

console.log("=== selfBuffPer：スケルトン・ジョウ（BS01-016、アタック時に相手の回復スピリット数×BP+1000） ===")
{
    const s = createGame(
        "selfbuffper-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    console.log("--- 相手の回復状態スピリット2体でBP+2000 ---")
    const jaw = createInstance("BS01-016", s.turn, 2) // Lv2（levels [2,3] で有効）
    s.players.p1.field.spirits.push(jaw)
    const ready1 = createInstance("BS01-001", s.turn, 1)
    const ready2 = createInstance("BS01-053", s.turn, 1)
    s.players.p2.field.spirits.push(ready1, ready2)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: jaw.instanceId }) === null, "スケルトン・ジョウでアタック")
    assert(jaw.tempBpBuff === 2000, "相手の回復状態2体でBP+2000")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ライフで受けてバトル終了")

    console.log("--- 相手が全疲労なら増加0 ---")
    ready1.isRested = true
    ready2.isRested = true
    const jaw2 = createInstance("BS01-016", s.turn, 2)
    s.players.p1.field.spirits.push(jaw2)
    const logLen = s.log.length
    assert(act(s, "p1", { type: "attack", instanceId: jaw2.instanceId }) === null, "2体目のジョウでアタック")
    assert(jaw2.tempBpBuff === 0, "相手が全疲労ならBP増加なし")
    assert(s.log.length > logLen, "カウント0のログが出る")
}

console.log("=== voidCoreToSelf：キリカブト（BS01-065）／征空の翼アクィリーズ（BS01-069）の実召喚 ===")
{
    const s = createGame(
        "voidcoretoself-summon-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    console.log("--- キリカブト：召喚時にボイドからコア+1 ---")
    s.players.p1.hand[0] = "BS01-065"
    s.players.p1.reserve = 20
    const cost65 = effectiveCost(s, "p1", getCard("BS01-065"))
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "キリカブトを召喚できる")
    const kirikabuto = s.players.p1.field.spirits.find((x) => x.cardId === "BS01-065")!
    assert(kirikabuto.cores === lv1Cores(getCard("BS01-065")) + 1, "維持コア1＋ボイドから1でコア2個")
    assert(
        s.players.p1.reserve === 20 - cost65 - lv1Cores(getCard("BS01-065")),
        "増えたコアはボイド由来（リザーブはコスト・維持分のみ減る）",
    )

    console.log("--- アクィリーズ：召喚時にボイドからコア+1 ---")
    s.players.p1.hand[0] = "BS01-069"
    const reserveBefore = s.players.p1.reserve
    const cost69 = effectiveCost(s, "p1", getCard("BS01-069"))
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "アクィリーズを召喚できる")
    const aquilies = s.players.p1.field.spirits.find((x) => x.cardId === "BS01-069")!
    assert(aquilies.cores === lv1Cores(getCard("BS01-069")) + 1, "維持コア1＋ボイドから1でコア2個")
    assert(
        s.players.p1.reserve === reserveBefore - cost69 - lv1Cores(getCard("BS01-069")),
        "増えたコアはボイド由来（リザーブはコスト・維持分のみ減る）",
    )
}

console.log("=== voidCoreToOther：スタッグローブ（BS01-066、アタック時に他のスピリットへボイドからコア1個） ===")
{
    const s = createGame(
        "voidcoretoother-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    console.log("--- 他スピリットのうち実効BP最大に+1 ---")
    const stag = createInstance("BS01-066", s.turn, 2) // Lv2（levels [2] で有効）
    const weak = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    const strong = createInstance("BS01-053", s.turn, 4) // リーヴォルフ Lv2 BP3000
    s.players.p1.field.spirits.push(stag, weak, strong)
    const reserveBefore = s.players.p1.reserve

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: stag.instanceId }) === null, "スタッグローブでアタック")
    assert(strong.cores === 5, "実効BP最大のリーヴォルフにコア+1")
    assert(weak.cores === 1 && stag.cores === 2, "他のスピリットと自身のコアは変化しない")
    assert(s.players.p1.reserve === reserveBefore, "コアはボイド由来（リザーブは変化しない）")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ライフで受けてバトル終了")

    console.log("--- 候補なしは no-op ---")
    const s2 = createGame(
        "voidcoretoother-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s2)
    const lone = createInstance("BS01-066", s2.turn, 2)
    s2.players.p1.field.spirits.push(lone)
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    const logLen = s2.log.length
    assert(act(s2, "p1", { type: "attack", instanceId: lone.instanceId }) === null, "単独のスタッグローブでアタック")
    assert(lone.cores === 2, "候補がいなければ自身にもコアは置かれない")
    assert(s2.log.length > logLen, "候補なしのログが出る")
}

console.log("=== coreSqueezeAll：幻龍シェイロン e1（BS01-046、召喚時に全スピリットのコアを1個ずつだけ残す） ===")
{
    const s = createGame(
        "coresqueeze-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const mine3 = createInstance("BS01-001", s.turn, 3) // コア3個
    s.players.p1.field.spirits.push(mine3)
    const enemy2 = createInstance("BS01-053", s.turn, 2) // コア2個
    const enemy1 = createInstance("BS01-001", s.turn, 1) // コア1個
    s.players.p2.field.spirits.push(enemy2, enemy1)

    s.players.p1.hand[0] = "BS01-046"
    s.players.p1.reserve = 20
    const cost = effectiveCost(s, "p1", getCard("BS01-046"))
    const p2ReserveBefore = s.players.p2.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "シェイロンを召喚できる")

    assert(mine3.cores === 1, "コア3個の自分スピリットが1個になる")
    assert(enemy2.cores === 1, "コア2個の相手スピリットが1個になる")
    assert(enemy1.cores === 1, "コア1個のスピリットは変化しない")
    assert(
        s.players.p1.reserve === 20 - cost - lv1Cores(getCard("BS01-046")) + 2,
        "自分の超過コア2個が自分のリザーブへ",
    )
    assert(s.players.p2.reserve === p2ReserveBefore + 1, "相手の超過コア1個が相手のリザーブへ")
    const sheiron = s.players.p1.field.spirits.find((x) => x.cardId === "BS01-046")!
    assert(sheiron.cores === 1, "シェイロン自身（維持コア1）は影響を受けない")
    // 注: 第一弾にはLv1維持コアが2個以上のスピリットが存在しないため、消滅ケースのテストは省略
}

console.log("=== unblockableBy maxCores：幻龍シェイロン e2（Lv2はコア1個のスピリットにブロックされない） ===")
{
    const s = createGame(
        "maxcores-block-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const sheiron = createInstance("BS01-046", s.turn, 3) // Lv2（e2 levels [2] で有効）
    s.players.p1.field.spirits.push(sheiron)
    const blocker1 = createInstance("BS01-001", s.turn, 1) // コア1個
    const blocker2 = createInstance("BS01-001", s.turn, 2) // コア2個
    s.players.p2.field.spirits.push(blocker1, blocker2)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: sheiron.instanceId }) === null, "シェイロンLv2でアタック")
    assert(
        act(s, "p2", { type: "block", instanceId: blocker1.instanceId }) !== null,
        "コア1個のブロッカーは拒否される",
    )
    assert(
        act(s, "p2", { type: "block", instanceId: blocker2.instanceId }) === null,
        "コア2個のブロッカーはブロックできる",
    )
}

console.log("=== バスタースピア（BS01-114、ネクサス破壊＋破壊できたら1ドロー） ===")
{
    const s = createGame(
        "busterspear-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    console.log("--- 相手ネクサスあり：破壊＋1ドロー ---")
    const nexus = createInstance("BS01-102", s.turn, 0)
    s.players.p2.field.nexuses.push(nexus)
    s.players.p1.hand[0] = "BS01-114"
    s.players.p1.reserve = 10
    const handBefore = s.players.p1.hand.length
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "バスタースピアを使用できる")
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサスが破壊される")
    assert(s.players.p1.deck.length === deckBefore - 1, "破壊できたので1ドロー（デッキ-1）")
    assert(s.players.p1.hand.length === handBefore, "使用で-1・ドローで+1（手札枚数は変わらない）")

    console.log("--- 相手ネクサスなし：破壊0・ドロー0 ---")
    s.players.p1.hand[0] = "BS01-114"
    const handBefore2 = s.players.p1.hand.length
    const deckBefore2 = s.players.p1.deck.length
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "対象なしでも使用はできる")
    assert(s.players.p1.deck.length === deckBefore2, "破壊できなかったのでドローなし")
    assert(s.players.p1.hand.length === handBefore2 - 1, "手札は使用分の-1のみ")
}

console.log("=== ステップ誘発の条件：主無き古城 e2（BS01-102 Lv2、手札が相手以下ならスタートステップに1ドロー） ===")
{
    const s = createGame(
        "handcondition-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const castle = createInstance("BS01-102", s.turn, 2) // Lv2（e2 levels [2] で有効）
    s.players.p1.field.nexuses.push(castle)

    console.log("--- 手札同数：スタートステップに1ドロー ---")
    s.players.p1.hand = ["BS01-001", "BS01-001"]
    s.players.p2.hand = ["BS01-001", "BS01-001"]
    // p1のターンを再度スタートステップから起こす（turn===1に戻して通常ドローをスキップさせ、
    // 古城のドローだけを観測する）
    s.turn = 1
    engineRunTurnStart(s)
    assert(s.players.p1.hand.length === 3, "手札同数なら古城Lv2で1ドロー")

    console.log("--- 自分の手札が多いときはドローなし ---")
    // 直前のドローで p1:3枚 > p2:2枚 になっている
    s.turn = 1
    engineRunTurnStart(s)
    assert(s.players.p1.hand.length === 3, "自分の手札が多いときはドローしない")
}

console.log("=== 遅延アタックステップ終了：サイレントウォール（BS01-144） ===")
{
    console.log("--- ライフ受け経路：バトル終了後に自動でターンが終了する ---")
    const s = createGame(
        "silentwall-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.hand[0] = "BS01-144"
    s.players.p2.reserve = 10

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック")
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0 }) === null,
        "防御側がフラッシュでサイレントウォールを使用",
    )
    assert(s.endAttackStepAfterBattle === true, "遅延終了フラグが立つ")
    assert(s.turnPlayer === "p1", "バトル解決前はまだp1のターン")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "takeLife" }) === null, "防御側がライフで受ける")
    assert(s.battle === null, "バトルが終了している")
    assert(s.turnPlayer === "p2", "バトル終了後に自動でターンが終了しp2のターンになる")
    assert(s.phase === "main", "p2のターンがメインステップから始まる")
    assert(s.endAttackStepAfterBattle === false, "フラグは消費されて戻る")

    console.log("--- ブロック解決経路：バトル解決後に自動でターンが終了する ---")
    const s2 = createGame(
        "silentwall-block-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s2)

    const attacker2 = createInstance("BS01-053", s2.turn, 4) // リーヴォルフ Lv2 BP3000
    s2.players.p1.field.spirits.push(attacker2)
    const blocker = createInstance("BS01-001", s2.turn, 1) // ゴラドン Lv1 BP1000
    s2.players.p2.field.spirits.push(blocker)
    s2.players.p2.hand[0] = "BS01-144"
    s2.players.p2.reserve = 10

    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "p1がアタック")
    assert(act(s2, "p2", { type: "castMagic", handIndex: 0 }) === null, "サイレントウォールを使用")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s2, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "防御側がブロック")
    assert(act(s2, "p2", { type: "pass" }) === null, "ブロック後フラッシュで防御側パス")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s2.players.p2.field.spirits.includes(blocker), "BPの低いブロッカーが破壊される")
    assert(s2.turnPlayer === "p2", "バトル解決後に自動でターンが終了しp2のターンになる")
    assert(s2.endAttackStepAfterBattle === false, "フラグは消費されて戻る")

    console.log("--- バトル外での使用は no-op ---")
    const s3 = createGame(
        "silentwall-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s3)
    s3.players.p1.hand[0] = "BS01-144"
    s3.players.p1.reserve = 10
    assert(act(s3, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインステップでも使用自体はできる")
    assert(s3.endAttackStepAfterBattle === false, "バトル外ではフラグは立たない（no-opログのみ）")
    assert(s3.turnPlayer === "p1", "ターンは終了しない")

    console.log("--- endBattle（ラークドライブ）経路でも発火する ---")
    const s4 = createGame(
        "silentwall-endbattle-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "white" },
    )
    runTurnStart(s4)
    const attacker4 = createInstance("BS01-001", s4.turn, 1)
    s4.players.p1.field.spirits.push(attacker4)
    s4.players.p1.hand[0] = "BS01-148" // ラークドライブ: バトル即終了
    s4.players.p2.hand[0] = "BS01-144" // サイレントウォール
    s4.players.p1.reserve = 10
    s4.players.p2.reserve = 10

    assert(act(s4, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s4, "p1", { type: "attack", instanceId: attacker4.instanceId }) === null, "p1がアタック")
    assert(act(s4, "p2", { type: "castMagic", handIndex: 0 }) === null, "防御側がサイレントウォールを使用")
    assert(s4.endAttackStepAfterBattle === true, "遅延終了フラグが立つ")
    // 優先権が攻撃側に移っているので、攻撃側がラークドライブでバトルを即終了させる
    assert(act(s4, "p1", { type: "castMagic", handIndex: 0 }) === null, "攻撃側がラークドライブを使用")
    assert(s4.battle === null, "バトルが即終了する")
    assert(s4.turnPlayer === "p2", "endBattle経由でもアタックステップが終了しp2のターンになる")
    assert(s4.endAttackStepAfterBattle === false, "フラグは消費されて戻る")
}

console.log("=== フィールド全体制約：魔帝の墓標（BS01-105）singleCoreCantAct ===")
{
    const s = createGame(
        "gravestone-constraint-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    // p2のフィールドに魔帝の墓標（コア0＝Lv1。e1 は Lv1-2 で有効）
    const gravestone = createInstance("BS01-105", s.turn, 0)
    s.players.p2.field.nexuses.push(gravestone)
    // p1: コア1個のゴラドン
    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)

    console.log("--- コア1個のスピリットはアタックできない ---")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) !== null,
        "コア1個のスピリットのアタックは拒否される",
    )

    console.log("--- コア2個ならアタックでき、コア1個のブロックは拒否される ---")
    attacker.cores = 2
    assert(
        act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null,
        "コア2個ならアタックできる",
    )
    const blocker = createInstance("BS01-053", s.turn, 1) // リーヴォルフ コア1個
    s.players.p2.field.spirits.push(blocker)
    assert(
        act(s, "p2", { type: "block", instanceId: blocker.instanceId }) !== null,
        "コア1個のスピリットのブロックは拒否される",
    )
    blocker.cores = 2
    assert(
        act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null,
        "コア2個ならブロックできる",
    )
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    console.log("--- 墓標を除去すればコア1個でもアタックできる ---")
    const attacker2 = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(attacker2)
    assert(
        act(s, "p1", { type: "attack", instanceId: attacker2.instanceId }) !== null,
        "墓標がある間はコア1個のアタックは拒否される",
    )
    s.players.p2.field.nexuses = s.players.p2.field.nexuses.filter(
        (n) => n.instanceId !== gravestone.instanceId,
    )
    assert(
        act(s, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null,
        "墓標を除去すればコア1個でもアタックできる",
    )
}

console.log("=== 魔帝の墓標Lv2（e2）：アタック宣言でコア1個をトラッシュへ ===")
{
    const s = createGame(
        "gravestone-coretrash-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    // p2のフィールドに魔帝の墓標（コア3＝Lv2。e2 が有効）
    const gravestone = createInstance("BS01-105", s.turn, 3)
    s.players.p2.field.nexuses.push(gravestone)
    // p1: コア3個のゴラドン（コア1個ではないのでアタック可能）
    const attacker = createInstance("BS01-001", s.turn, 3)
    s.players.p1.field.spirits.push(attacker)

    console.log("--- 相手の墓標でもアタッカーのコアが持ち主のトラッシュへ ---")
    const trashBefore = s.players.p1.trashCores
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null,
        "コア3個のスピリットはアタックできる",
    )
    assert(attacker.cores === 2, "アタック宣言でアタッカーのコアが1個減る")
    assert(
        s.players.p1.trashCores === trashBefore + 1,
        "減ったコアはアタッカーの持ち主のトラッシュへ置かれる",
    )
    assert(s.battle !== null, "バトル自体は継続する")
    assert(act(s, "p2", { type: "takeLife" }) === null, "防御側はライフで受けられる")

    console.log("--- 墓標の持ち主自身のアタックでも発火する ---")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了")
    const ownAttacker = createInstance("BS01-053", s.turn, 4) // リーヴォルフ Lv2
    s.players.p2.field.spirits.push(ownAttacker)
    const p2TrashBefore = s.players.p2.trashCores
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ移行")
    assert(
        act(s, "p2", { type: "attack", instanceId: ownAttacker.instanceId }) === null,
        "墓標の持ち主のスピリットもアタックできる",
    )
    assert(ownAttacker.cores === 3, "持ち主のアタッカーもコアが1個減る")
    assert(
        s.players.p2.trashCores === p2TrashBefore + 1,
        "減ったコアは持ち主（p2）のトラッシュへ",
    )

    console.log("--- コアが維持コアを下回る場合は消滅する（coreToTrashSelf） ---")
    // 第一弾に維持コア2のスピリットは存在せず、コア1個の個体は e1 でアタック自体が拒否されるため、
    // 消滅経路はアクション単体（resolveAction）で検証する
    const fragile = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(fragile)
    const p1TrashBefore = s.players.p1.trashCores
    resolveAction(s, "p1", fragile, { type: "coreToTrashSelf", count: 1 })
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === fragile.instanceId),
        "維持コア割れで消滅する",
    )
    assert(s.players.p1.trashCores === p1TrashBefore + 1, "コアはトラッシュへ置かれている")
}

console.log("=== 破壊耐性：要塞皇オーディーン（BS01-X04）nexusIndestructible ===")
{
    const s = createGame(
        "odin-indestructible-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)

    // p2: オーディーン Lv2（コア3）＋守られるネクサス（主無き古城）
    const odin = createInstance("BS01-X04", s.turn, 3)
    s.players.p2.field.spirits.push(odin)
    const nexus = createInstance("BS01-102", s.turn, 0)
    s.players.p2.field.nexuses.push(nexus)

    console.log("--- オーディーンLv2がいる間はネクサスを破壊できない ---")
    s.players.p1.hand[0] = "BS01-114" // バスタースピア（ネクサス破壊＋破壊数ドロー）
    s.players.p1.reserve = 10
    const handBefore = s.players.p1.hand.length
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0 }) === null,
        "バスタースピアは使用できる",
    )
    assert(s.players.p2.field.nexuses.length === 1, "ネクサスは破壊されず残る")
    assert(
        s.players.p1.hand.length === handBefore - 1,
        "破壊できなかったのでドローも発生しない（手札は使用分-1のみ）",
    )
    assert(
        s.log.some((l) => l.includes("破壊されなかった（破壊耐性）")),
        "破壊耐性のログが出る",
    )

    console.log("--- バウンス（returnNexusToHand）は破壊ではないため防げない ---")
    resolveAction(s, "p1", null, { type: "returnNexusToHand", count: 1 })
    assert(s.players.p2.field.nexuses.length === 0, "ネクサスは手札に戻る（バウンスは通る）")
    assert(s.players.p2.hand.includes("BS01-102"), "戻ったネクサスが手札にある")

    console.log("--- オーディーンがLv1に下がると破壊できる ---")
    s.players.p2.field.nexuses.push(createInstance("BS01-102", s.turn, 0))
    odin.cores = 1 // Lv1（e2 は Lv2-3 のみ有効）
    s.players.p1.hand[0] = "BS01-114"
    const handBefore2 = s.players.p1.hand.length
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0 }) === null,
        "バスタースピアを再使用",
    )
    assert(s.players.p2.field.nexuses.length === 0, "Lv1に下がるとネクサスは破壊される")
    assert(
        s.players.p1.hand.length === handBefore2 - 1 + 1,
        "破壊数ぶんのドローも発生する（使用分-1＋ドロー1）",
    )

    console.log("--- 自分（オーディーン側）のネクサスだけでなく相手のネクサスも守られる ---")
    odin.cores = 3 // Lv2に戻す
    const p1Nexus = createInstance("BS01-102", s.turn, 0)
    s.players.p1.field.nexuses.push(p1Nexus)
    resolveAction(s, "p2", null, { type: "destroyNexus", count: 1 })
    assert(s.players.p1.field.nexuses.length === 1, "相手側のネクサスも破壊されない（お互い）")
}

console.log("=== recoverSpiritFromTrash：ドラグノ祈祷師 e1（BS01-014、召喚時に自分のトラッシュのスピリット1枚を手札へ） ===")
{
    const s = createGame(
        "recoverspirit-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    console.log("--- スピリットだけが手札に戻り、マジックは戻らない ---")
    // スピリット（ゴラドン）→マジック（バスタースピア）の順でトラッシュに積む（マジックが末尾＝新しい方）
    s.players.p1.trashCards.push("BS01-001", "BS01-114")
    s.players.p1.hand[0] = "BS01-014"
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ドラグノ祈祷師を召喚できる")
    assert(s.players.p1.hand.includes("BS01-001"), "スピリット（ゴラドン）が手札に戻る")
    assert(s.players.p1.trashCards.includes("BS01-114"), "マジック（バスタースピア）はトラッシュに残る")
    assert(!s.players.p1.trashCards.includes("BS01-001"), "回収したスピリットはトラッシュから消える")

    console.log("--- 該当なしはno-op ---")
    s.players.p1.trashCards = ["BS01-114"] // マジックのみ
    s.players.p1.hand[0] = "BS01-014"
    s.players.p1.reserve = 20
    const handBefore2 = s.players.p1.hand.length
    const logLen = s.log.length
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "対象なしでも召喚はできる")
    assert(s.players.p1.hand.length === handBefore2 - 1, "召喚分の-1のみ（回収は発生しない）")
    assert(s.log.length > logLen, "no-opのログが出る")
}

console.log("=== coreSqueezeOne：コブライガ e1（BS01-041、召喚時に相手の実効BP最大スピリットのコアを1個だけ残す） ===")
{
    const s = createGame(
        "coresqueezeone-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const enemyHigh = createInstance("BS01-053", s.turn, 3) // リーヴォルフ Lv1・BP2000（コア3）
    const enemyLow = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1・BP1000（コア1）
    s.players.p2.field.spirits.push(enemyHigh, enemyLow)

    s.players.p1.hand[0] = "BS01-041"
    s.players.p1.reserve = 20
    const p2ReserveBefore = s.players.p2.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "コブライガを召喚できる")

    assert(enemyHigh.cores === 1, "コア3個の相手スピリット（実効BP最大）が1個になる")
    assert(s.players.p2.reserve === p2ReserveBefore + 2, "超過コア2個が持ち主（相手）のリザーブへ")
    assert(enemyLow.cores === 1, "他のスピリットは不変")

    console.log("--- 対象なしはno-op ---")
    const s2 = createGame(
        "coresqueezeone-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s2)
    s2.players.p1.hand[0] = "BS01-041"
    s2.players.p1.reserve = 20
    const logLen = s2.log.length
    assert(act(s2, "p1", { type: "summon", handIndex: 0 }) === null, "相手フィールドが空でも召喚できる")
    assert(s2.log.length > logLen, "対象なしのログが出る")
}

console.log("=== coreToVoidOwn：ハンマドレイク e1（BS01-007、召喚時に自分のコア1個をボイドへ） ===")
{
    // 注: 通常の召喚（summon）はコスト支払い分もいったんtrashCoresへ積む仕様（次のリフレッシュで
    // リザーブへ戻る）ため、summon経由だとtrashCoresの検証にコスト支払い分が混ざってしまう。
    // このアクション自体の挙動（trashCores優先／フィールド優先）を厳密に検証するため、
    // resolveActionを直接呼んで（コスト支払いを経由せず）テストする。
    console.log("--- trashCoresがある場合はそこから減る（フィールド不変） ---")
    const s = createGame(
        "coretovoid-trash-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const hammer = createInstance("BS01-007", s.turn, 1) // ハンマドレイク自身（維持コア1）
    s.players.p1.field.spirits.push(hammer)
    s.players.p1.trashCores = 2
    resolveAction(s, "p1", hammer, { type: "coreToVoidOwn", count: 1 })
    assert(s.players.p1.trashCores === 1, "トラッシュのコアが1個減る")
    assert(hammer.cores === 1, "ハンマドレイク自身のコアは変化しない（維持コア1）")

    console.log(
        "--- trashCoresが0の場合はフィールドのコア（実効BP最小）が減りボイドへ（リザーブにもトラッシュにも増えない） ---",
    )
    const s2 = createGame(
        "coretovoid-field-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s2)
    const weak = createInstance("BS01-001", s2.turn, 2) // ゴラドン Lv1・BP1000（コア2）
    const hammer2 = createInstance("BS01-007", s2.turn, 1) // ハンマドレイク自身 Lv1・BP4000（コア1）
    s2.players.p1.field.spirits.push(weak, hammer2)
    const reserveBefore = s2.players.p1.reserve
    resolveAction(s2, "p1", hammer2, { type: "coreToVoidOwn", count: 1 })
    assert(weak.cores === 1, "実効BP最小のゴラドンのコアが1個減る")
    assert(hammer2.cores === 1, "ハンマドレイク自身は変化しない（自身よりBPが低い対象が優先される）")
    assert(s2.players.p1.trashCores === 0, "トラッシュのコアは増えない")
    assert(s2.players.p1.reserve === reserveBefore, "リザーブはボイド分では変化しない")
}

console.log(
    "=== bothSidesCoreToTrash：メタルディー・バグ e1（BS01-087、召喚時に両者の実効BP最大スピリットのコア1個をそれぞれのトラッシュへ） ===",
)
{
    // coreToVoidOwn同様、コスト支払いのtrashCores混入を避けるためresolveActionを直接呼ぶ
    const s = createGame(
        "bothsides-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)

    const bug = createInstance("BS01-087", s.turn, 1) // メタルディー・バグ自身（維持コア1）
    s.players.p1.field.spirits.push(bug)
    const p1Ally = createInstance("BS01-046", s.turn, 2) // 幻龍シェイロン Lv1・BP4000（コア2）
    s.players.p1.field.spirits.push(p1Ally)
    const p2Enemy = createInstance("BS01-053", s.turn, 2) // リーヴォルフ Lv1・BP2000（コア2）
    s.players.p2.field.spirits.push(p2Enemy)

    resolveAction(s, "p1", bug, { type: "bothSidesCoreToTrash", count: 1 })

    assert(p1Ally.cores === 1, "p1側の実効BP最大スピリット（シェイロン）のコアが1個減る")
    assert(s.players.p1.trashCores === 1, "p1側のトラッシュコアが1個増える")
    assert(p2Enemy.cores === 1, "p2側の実効BP最大スピリット（リーヴォルフ）のコアが1個減る")
    assert(s.players.p2.trashCores === 1, "p2側のトラッシュコアが1個増える")
    assert(bug.cores === 1, "メタルディー・バグ自身は対象にならなかった（p1側はBP最大のシェイロンが選ばれた）")

    console.log("--- 片側のみ対象がいてもその側は処理される（相手フィールドが空） ---")
    const s2 = createGame(
        "bothsides-oneside-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s2)
    const bug2 = createInstance("BS01-087", s2.turn, 1)
    s2.players.p1.field.spirits.push(bug2)
    const p1Ally2 = createInstance("BS01-046", s2.turn, 2) // 幻龍シェイロン Lv1・BP4000（コア2）
    s2.players.p1.field.spirits.push(p1Ally2)
    resolveAction(s2, "p1", bug2, { type: "bothSidesCoreToTrash", count: 1 })
    assert(p1Ally2.cores === 1, "p1側は処理される（シェイロンのコアが1個減る）")
    assert(s2.players.p1.trashCores === 1, "p1側のトラッシュコアが1個増える")
    assert(s2.players.p2.trashCores === 0, "p2側は対象がいなかったのでトラッシュコアは増えない")
}

console.log(
    "=== フィールドイベント誘発（opponentDrew）：シダフクロウ（BS01-059、相手がドローするとこのスピリットは回復する） ===",
)
{
    const s = createGame(
        "opponentdrew-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const owl = createInstance("BS01-059", s.turn, 1)
    s.players.p1.field.spirits.push(owl)
    owl.isRested = true

    console.log("--- 相手（p2）がドローすると回復する ---")
    draw(s, "p2", 1)
    assert(!owl.isRested, "p2がドローすると、p1のシダフクロウは回復する")

    console.log("--- 自分（p1）がドローしても回復しない ---")
    owl.isRested = true // いったん疲労させ直す
    draw(s, "p1", 1)
    assert(owl.isRested === true, "p1自身がドローしても、p1のシダフクロウは回復しない（疲労のまま）")
}

console.log(
    "=== onDestroy（refreshOne）：甲精ディース e2（BS01-093 Lv2、破壊されると自分の疲労スピリットを回復させる） ===",
)
{
    const s = createGame(
        "kouseidys-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)

    const dice = createInstance("BS01-093", s.turn, 4) // Lv2（e2はLv2のみ有効）
    s.players.p1.field.spirits.push(dice)
    const ally = createInstance("BS01-001", s.turn, 1) // ゴラドン（疲労状態にしておく）
    ally.isRested = true
    s.players.p1.field.spirits.push(ally)

    destroySpirit(s, "p1", dice.instanceId)
    assert(s.players.p1.field.spirits.length === 1, "甲精ディースは破壊されてフィールドから消える")
    assert(!ally.isRested, "自分の疲労スピリット（ゴラドン）が回復する")

    console.log("--- Lv1（破壊時効果なし）では回復効果が発火しない ---")
    const s2 = createGame(
        "kouseidys-lv1-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s2)
    const dice2 = createInstance("BS01-093", s2.turn, 1) // Lv1
    s2.players.p1.field.spirits.push(dice2)
    const ally2 = createInstance("BS01-001", s2.turn, 1)
    ally2.isRested = true
    s2.players.p1.field.spirits.push(ally2)
    destroySpirit(s2, "p1", dice2.instanceId)
    assert(ally2.isRested === true, "Lv1では破壊時効果が発火しないため、疲労スピリットは回復しない")
}

console.log(
    "=== costMod：ルビーの太陽 e1（BS01-100、白のカードは使用時+1コスト。両陣営の白カードに効く） ===",
)
{
    const s = createGame(
        "costmod-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)

    const whiteCard = getCard("BS01-074") // バーサーカー・ガン：白・コスト1・軽減なし
    const redCard = getCard("BS01-001") // ゴラドン：赤・コスト0・軽減なし

    assert(effectiveCost(s, "p1", whiteCard) === 1, "ルビーの太陽なしでは白カードは通常コスト1")

    console.log("--- 相手（p2）が出したルビーの太陽でも、自分（p1）の白カードが+1される ---")
    const ruby = createInstance("BS01-100", s.turn, 0) // ルビーの太陽 Lv1（コア0）
    s.players.p2.field.nexuses.push(ruby)
    assert(effectiveCost(s, "p1", whiteCard) === 2, "白カードのコストが+1される（発生源が相手でも効く）")
    assert(effectiveCost(s, "p2", whiteCard) === 2, "自分（p2）が白カードを使う場合も+1される（自分のカードも対象）")
    assert(effectiveCost(s, "p1", redCard) === 0, "白以外（赤）のカードは変化しない")

    console.log("--- ルビーの太陽が2枚あれば+2 ---")
    const ruby2 = createInstance("BS01-100", s.turn, 0)
    s.players.p1.field.nexuses.push(ruby2)
    assert(effectiveCost(s, "p1", whiteCard) === 3, "ルビーの太陽2枚で白カードは元コスト1+2=3")
}

console.log(
    "=== discardSelfOne：自分の手札末尾1枚をトラッシュへ（本来は自分が選ぶ処理の簡略化） ===",
)
{
    const s = createGame(
        "discardself-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    s.players.p1.hand = ["BS01-001", "BS01-002", "BS01-003"]
    resolveAction(s, "p1", null, { type: "discardSelfOne" })
    assert(s.players.p1.hand.length === 2, "手札が1枚減る")
    assert(s.players.p1.trashCards.includes("BS01-003"), "手札末尾のカードがトラッシュへ積まれる")

    console.log("--- 手札0はno-op ---")
    s.players.p1.hand = []
    const logLen = s.log.length
    resolveAction(s, "p1", null, { type: "discardSelfOne" })
    assert(s.players.p1.hand.length === 0, "手札0のまま変化しない")
    assert(s.log.length > logLen, "no-opのログが出る")
}

console.log(
    "=== 百識の谷（BS01-099、自分のドローステップにドロー+1。Lv1のみドロー後に手札1枚を破棄） ===",
)
{
    console.log("--- Lv2：ドロー+1のみ（破棄なし） ---")
    const s = createGame(
        "hyakushiki-lv2-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s) // turn1：p1（先攻のため通常ドローなし）
    const tani = createInstance("BS01-099", s.turn, 3) // 百識の谷 Lv2（コア3）
    s.players.p1.field.nexuses.push(tani)
    act(s, "p1", { type: "endTurn" }) // → turn2：p2

    const handBeforeTurn3 = s.players.p1.hand.length
    act(s, "p2", { type: "endTurn" }) // → turn3：p1（通常ドロー1枚＋百識の谷Lv2の+1枚が発火）
    assert(
        s.players.p1.hand.length === handBeforeTurn3 + 2,
        "通常ドロー1枚＋百識の谷Lv2の+1枚で、手札は+2枚になる",
    )

    console.log("--- 相手（p2）のドローステップでは発火しない ---")
    const handBeforeP2Draw = s.players.p1.hand.length
    act(s, "p1", { type: "endTurn" }) // → turn4：p2（p1の百識の谷はturn:"own"のため相手ターンには反応しない）
    assert(s.players.p1.hand.length === handBeforeP2Draw, "相手のドローステップではp1の手札は変化しない")
}

console.log("--- Lv1：ドロー+1のあと手札1枚を破棄（差し引き+1枚） ---")
{
    const s = createGame(
        "hyakushiki-lv1-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s) // turn1：p1（先攻のため通常ドローなし）
    const tani = createInstance("BS01-099", s.turn, 0) // 百識の谷 Lv1（コア0）
    s.players.p1.field.nexuses.push(tani)
    act(s, "p1", { type: "endTurn" }) // → turn2：p2

    const handBeforeTurn3 = s.players.p1.hand.length
    const trashBeforeTurn3 = s.players.p1.trashCards.length
    act(s, "p2", { type: "endTurn" }) // → turn3：p1（通常ドロー1枚＋Lv1の+1枚を引いてから1枚破棄）
    assert(
        s.players.p1.hand.length === handBeforeTurn3 + 1,
        "通常ドロー1枚＋百識の谷Lv1の+1枚のあと手札1枚を破棄＝差し引き+1枚",
    )
    assert(
        s.players.p1.trashCards.length === trashBeforeTurn3 + 1,
        "破棄した1枚がトラッシュに積まれる",
    )
}

console.log(
    "--- 既知の挙動：先攻1ターン目は通常ドローがスキップされても、ドローステップのstep効果は発火する ---",
)
{
    // PhaseManager.runTurnStart は turn===1 の通常ドロー（draw()）はスキップするが、
    // その直後の fireStepTriggers(state, "draw") は無条件に呼ばれる（既存の全step効果に共通の挙動で、
    // 今回の百識の谷実装で変更した箇所ではない）。そのため理論上は「先攻1ターン目でも
    // 百識の谷がすでに場にあれば、通常ドローなしでもstep効果のドロー+1だけは発火する」。
    // 実戦でネクサスをターン1開始前に場に出すことはできないため実運用上は起こらないが、
    // エンジンの既知の挙動として記録しておく。
    const s = createGame(
        "hyakushiki-turn1-quirk-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    s.players.p1.field.nexuses.push(createInstance("BS01-099", 1, 3)) // 百識の谷 Lv2
    const handBefore = s.players.p1.hand.length
    runTurnStart(s) // turn1：p1（通常ドローはスキップされるが、fireStepTriggers("draw")は呼ばれる）
    assert(
        s.players.p1.hand.length === handBefore + 1,
        "先攻1ターン目でも、場にある百識の谷のドローステップ効果（+1）自体は発火する（既存挙動）",
    )
}

console.log(
    "=== coreDrainAllOthers：魔界七将デスペラード e1（BS01-X02、召喚時にこのスピリット以外の全スピリット上からコアを1個ずつ持ち主のリザーブへ。この効果で消滅した数ぶんボイドから自身にコア） ===",
)
{
    const s = createGame(
        "coredrain-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const despe = createInstance("BS01-X02", s.turn, 1) // 魔界七将デスペラード自身 Lv1（維持コア1）
    s.players.p1.field.spirits.push(despe)
    const ally = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1（維持コア1、コア1個→1個減ると消滅）
    s.players.p1.field.spirits.push(ally)
    const ally2 = createInstance("BS01-046", s.turn, 2) // 幻龍シェイロン Lv1（維持コア1、コア2個→1個減っても消滅しない）
    s.players.p1.field.spirits.push(ally2)
    const enemy = createInstance("BS01-053", s.turn, 2) // リーヴォルフ Lv1（維持コア1、コア2個→1個減っても消滅しない）
    s.players.p2.field.spirits.push(enemy)

    const p1ReserveBefore = s.players.p1.reserve
    const p2ReserveBefore = s.players.p2.reserve

    resolveAction(s, "p1", despe, { type: "coreDrainAllOthers" })

    assert(despe.cores === 2, "消滅が1体（ゴラドン）発生したため、デスペラード自身のコアがボイドから1個増える（1→2）")
    assert(!s.players.p1.field.spirits.includes(ally), "維持コア1個のゴラドンはコアを1個失って消滅する")
    assert(ally2.cores === 1, "シェイロンはコアが2→1に減るが消滅しない（維持コア1）")
    assert(enemy.cores === 1, "相手（リーヴォルフ）のコアも2→1に減る（両陣営が対象）")
    assert(
        s.players.p1.reserve === p1ReserveBefore + 2,
        "p1側：ゴラドン分＋シェイロン分の合計2個が持ち主（p1）のリザーブへ",
    )
    assert(s.players.p2.reserve === p2ReserveBefore + 1, "p2側：リーヴォルフ分の1個が持ち主（p2）のリザーブへ")

    console.log("--- self以外に対象がいなければno-op ---")
    const s2 = createGame(
        "coredrain-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s2)
    const despe2 = createInstance("BS01-X02", s2.turn, 1)
    s2.players.p1.field.spirits.push(despe2)
    const logLen = s2.log.length
    resolveAction(s2, "p1", despe2, { type: "coreDrainAllOthers" })
    assert(despe2.cores === 1, "対象がいなければデスペラード自身のコアも変化しない")
    assert(s2.log.length > logLen, "no-opのログが出る")
}

console.log("=== 免疫・効果無効システム（ワルキューレ／フェザーバリア／バーストファイア） ===")
{
    // --- ワルキューレ: 相手の対象を取る効果（destroy）の対象にならない ---
    const s = createGame(
        "immune-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const walk = createInstance("BS01-086", s.turn, 1) // クイーン・ワルキューレ（untargetable）
    const other = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000
    s.players.p2.field.spirits.push(walk, other)

    resolveAction(s, "p1", null, { type: "destroy", count: 1 })
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === walk.instanceId),
        "destroyの自動選択はワルキューレを避ける",
    )
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === other.instanceId),
        "代わりに別のスピリットが破壊される",
    )
    // ワルキューレしかいない状態では destroy は no-op
    resolveAction(s, "p1", null, { type: "destroy", count: 1 })
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === walk.instanceId),
        "ワルキューレだけなら対象を取る破壊は当たらない",
    )
    // ただし範囲破壊（destroyAll）にはワルキューレも当たる
    resolveAction(s, "p1", null, { type: "destroyAll", maxBp: 9000 })
    assert(
        s.players.p2.field.spirits.length === 0,
        "範囲破壊(destroyAll)にはワルキューレも当たる",
    )

    // --- フェザーバリア: 免疫フラグは範囲破壊からも守る、ターン終了で解除 ---
    const s2 = createGame(
        "featherbarrier-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s2)
    const protectee = createInstance("BS01-001", s2.turn, 1)
    s2.players.p2.field.spirits.push(protectee)
    protectee.immuneToOpponentThisTurn = true
    resolveAction(s2, "p1", null, { type: "destroy", count: 1 })
    assert(
        s2.players.p2.field.spirits.length === 1,
        "フェザーバリア免疫スピリットは対象破壊されない",
    )
    resolveAction(s2, "p1", null, { type: "destroyAll", maxBp: 9000 })
    assert(
        s2.players.p2.field.spirits.length === 1,
        "フェザーバリア免疫スピリットは範囲破壊でも破壊されない",
    )

    // --- バーストファイア: cantBlock を無効化するとブロックできる ---
    const s3 = createGame(
        "burstfire-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s3)
    // p1にアタッカー、p2に cantBlock 持ち（テラノセイバー BS01-003 Lv1）
    const atk = createInstance("BS01-001", s3.turn, 1)
    s3.players.p1.field.spirits.push(atk)
    const cantBlocker = createInstance("BS01-003", s3.turn, 1) // テラノセイバー: cantBlock Lv1
    s3.players.p2.field.spirits.push(cantBlocker)
    act(s3, "p1", { type: "nextPhase" })
    act(s3, "p1", { type: "attack", instanceId: atk.instanceId })
    // 優先権を防御側→攻撃側と回してブロック可能タイミングへ（フラッシュ終了）
    act(s3, "p2", { type: "pass" })
    act(s3, "p1", { type: "pass" })
    assert(
        act(s3, "p2", { type: "block", instanceId: cantBlocker.instanceId }) !== null,
        "無効化前はcantBlock持ちはブロックできない",
    )
    // バーストファイアで無効化 → ブロック可能に
    cantBlocker.blockConstraintNegatedThisTurn = true
    assert(
        act(s3, "p2", { type: "block", instanceId: cantBlocker.instanceId }) === null,
        "無効化後はブロックできる",
    )
}

console.log("=== 遅延アタックステップ終了：妖機妃ソール（BS01-096、endAttackStep onlyOpponentTurn） ===")
{
    console.log("--- 相手ターンのバトルで破壊 → アタックステップ終了（ターン強制終了） ---")
    const s = createGame(
        "soul-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000
    s.players.p1.field.spirits.push(attacker)
    const soul = createInstance("BS01-096", s.turn, 1) // 妖機妃ソール Lv1 BP2000（p2が持ち主＝p1のターンでは相手ターン扱い）
    s.players.p2.field.spirits.push(soul)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ終了、ブロック待ち）")
    assert(act(s, "p2", { type: "block", instanceId: soul.instanceId }) === null, "p2がソールでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後フラッシュで防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.includes(soul), "BPで劣るソールが破壊される")
    assert(s.turnPlayer === "p2", "相手ターン中の破壊のため、アタックステップ終了でp1のターンが強制終了しp2のターンになる")
    assert(s.phase === "main", "p2のターンがメインステップから始まる")
    assert(s.endAttackStepAfterBattle === false, "フラグは消費されて戻る")

    console.log("--- 自分のターンの破壊では発動しない（onlyOpponentTurn） ---")
    const s2 = createGame(
        "soul-ownturn-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "green" },
    )
    runTurnStart(s2)

    const soul2 = createInstance("BS01-096", s2.turn, 1) // 妖機妃ソール Lv1 BP2000（p1が持ち主＝アタッカー側）
    s2.players.p1.field.spirits.push(soul2)
    const blocker2 = createInstance("BS01-053", s2.turn, 4) // リーヴォルフ Lv2 BP3000
    s2.players.p2.field.spirits.push(blocker2)

    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s2, "p1", { type: "attack", instanceId: soul2.instanceId }) === null, "p1がソールでアタック")
    assert(act(s2, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ終了、ブロック待ち）")
    assert(act(s2, "p2", { type: "block", instanceId: blocker2.instanceId }) === null, "p2がリーヴォルフでブロック")
    assert(act(s2, "p2", { type: "pass" }) === null, "ブロック後フラッシュで防御側パス")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s2.players.p1.field.spirits.includes(soul2), "BPで劣るソールが破壊される（アタッカー側）")
    assert(s2.turnPlayer === "p1", "自分（p1）のターン中の破壊のため、アタックステップは終了しない")
    assert(s2.endAttackStepAfterBattle === false, "フラグは立たない")

    console.log("--- アタックステップ外での発動はno-op ---")
    const s3 = createGame(
        "soul-phase-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s3)
    const soul3 = createInstance("BS01-096", s3.turn, 1)
    s3.players.p2.field.spirits.push(soul3)
    const logLen = s3.log.length
    resolveAction(s3, "p2", soul3, { type: "endAttackStep", onlyOpponentTurn: true })
    assert(s3.endAttackStepAfterBattle === false, "メインステップではフラグが立たない")
    assert(s3.log.length > logLen, "no-opのログが出る")
}

console.log("=== 指定アタック（canDirectAttack）：イリュージョナ（BS01-037、targetFilter:rested） ===")
{
    const s = createGame(
        "illusiona-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const illusiona = createInstance("BS01-037", s.turn, 2) // イリュージョナ Lv2 BP5000
    s.players.p1.field.spirits.push(illusiona)
    const restedTarget = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000（疲労状態）
    restedTarget.isRested = true
    s.players.p2.field.spirits.push(restedTarget)
    const readyOther = createInstance("BS01-001", s.turn, 1) // 回復状態のゴラドン
    s.players.p2.field.spirits.push(readyOther)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: illusiona.instanceId,
            targetSpiritInstanceId: readyOther.instanceId,
        }) !== null,
        "回復状態の相手は指定できない",
    )
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: illusiona.instanceId,
            targetSpiritInstanceId: restedTarget.instanceId,
        }) === null,
        "疲労状態の相手を指定してアタックできる",
    )
    assert(s.battle !== null, "バトルが発生")
    assert(s.battle?.blockerInstanceId === restedTarget.instanceId, "指定した相手がblockerInstanceIdにセットされる")
    assert(s.battle?.directed === true, "directedフラグが立つ")
    assert(
        s.log.some((line) => line.includes("指定してアタックした")),
        "指定アタックのログが出る",
    )
    assert(act(s, "p2", { type: "takeLife" }) !== null, "指定アタック成立後はライフで受けられない")
    assert(
        act(s, "p2", { type: "block", instanceId: readyOther.instanceId }) !== null,
        "指定アタック成立後は別のスピリットでブロックもできない",
    )
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.includes(restedTarget), "指定した相手（BP5000 vs BP1000）が敗北して破壊される")
    assert(s.battle === null, "バトル終了")
}

console.log("=== 指定アタック（canDirectAttack）：牛霊スモゥグ（BS01-044、targetFilter:singleCore） ===")
{
    const s = createGame(
        "sumogu-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const sumogu = createInstance("BS01-044", s.turn, 1) // 牛霊スモゥグ Lv1
    s.players.p1.field.spirits.push(sumogu)
    const singleCoreTarget = createInstance("BS01-001", s.turn, 1) // ゴラドン コア1個
    s.players.p2.field.spirits.push(singleCoreTarget)
    const multiCoreTarget = createInstance("BS01-001", s.turn, 3) // ゴラドン コア3個
    s.players.p2.field.spirits.push(multiCoreTarget)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: sumogu.instanceId,
            targetSpiritInstanceId: multiCoreTarget.instanceId,
        }) !== null,
        "コア2個以上の相手は指定できない",
    )
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: sumogu.instanceId,
            targetSpiritInstanceId: singleCoreTarget.instanceId,
        }) === null,
        "コア1個の相手を指定してアタックできる",
    )
    assert(s.battle?.blockerInstanceId === singleCoreTarget.instanceId, "指定した相手がblockerInstanceIdにセットされる")

    console.log("--- canDirectAttack を持たない通常スピリットは指定アタックを拒否 ---")
    const s2 = createGame(
        "direct-attack-reject-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s2)
    const plain = createInstance("BS01-001", s2.turn, 1) // ゴラドン（canDirectAttackを持たない）
    s2.players.p1.field.spirits.push(plain)
    const target = createInstance("BS01-001", s2.turn, 1)
    s2.players.p2.field.spirits.push(target)
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s2, "p1", {
            type: "attack",
            instanceId: plain.instanceId,
            targetSpiritInstanceId: target.instanceId,
        }) !== null,
        "canDirectAttackを持たないスピリットは指定アタックできない",
    )
}

console.log("=== 山札公開（スワロウアイヴィー）・起動能力（グラン）・コア配置修飾（グラーバ） ===")
{
    // --- deckReveal: 上5枚にネクサスがあれば手札へ、残りは下へ ---
    const s = createGame(
        "deckreveal-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    // デッキ先頭を既知の並びにする（先頭付近にネクサス BS01-088 タワーミットクラブ）
    const deckBefore = s.players.p1.deck.length
    s.players.p1.deck.splice(0, 5, "BS01-098", "BS01-001", "BS01-001", "BS01-001", "BS01-001")
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "deckReveal", count: 5, pickType: "nexus" })
    assert(s.players.p1.hand.includes("BS01-098"), "公開したネクサスが手札に入る")
    assert(s.players.p1.hand.length === handBefore + 1, "手札が1枚増える")
    assert(s.players.p1.deck.length === deckBefore - 1, "デッキは公開5枚のうち1枚が手札へ移り残り4枚が下へ（枚数-1）")

    // 上5枚にネクサスが無ければ手札に入らず全部下へ（枚数不変）
    const s2 = createGame(
        "deckreveal-none-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s2)
    s2.players.p1.deck.splice(0, 5, "BS01-001", "BS01-001", "BS01-001", "BS01-001", "BS01-001")
    const deck2 = s2.players.p1.deck.length
    const hand2 = s2.players.p1.hand.length
    resolveAction(s2, "p1", null, { type: "deckReveal", count: 5, pickType: "nexus" })
    assert(s2.players.p1.hand.length === hand2, "一致なしでは手札は増えない")
    assert(s2.players.p1.deck.length === deck2, "一致なしではデッキ枚数は変わらない（順だけ変わる）")

    // --- coreBonus: グラーバへの効果コア配置が+1される ---
    const s3 = createGame(
        "corebonus-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s3)
    const graba = createInstance("BS01-057", s3.turn, 1) // グラーバ（coreBonus +1）
    s3.players.p1.field.spirits.push(graba)
    // voidCoreToSelf 1 → グラーバは coreBonus で +1 され、計 +2
    resolveAction(s3, "p1", graba, { type: "voidCoreToSelf", count: 1 })
    assert(graba.cores === 1 + 2, "グラーバへのボイド配置は+1され計2個置かれる")
    // coreBonus を持たない通常スピリットは増えない
    const plain = createInstance("BS01-001", s3.turn, 1)
    s3.players.p1.field.spirits.push(plain)
    resolveAction(s3, "p1", plain, { type: "voidCoreToSelf", count: 1 })
    assert(plain.cores === 1 + 1, "通常スピリットは修飾なし（+1のみ）")

    // --- activateAbility: グランがバトル中フラッシュでコアを払い自分でバトル終了 ---
    const s4 = createGame(
        "activate-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s4)
    // p1にグラン（Lv3=コア5）を出し、アタッカーにする
    const gran = createInstance("BS01-094", s4.turn, 5)
    s4.players.p1.field.spirits.push(gran)
    const eff = getCard("BS01-094").effects[0]!
    const granEffectId = eff.id
    s4.players.p1.reserve = 3
    act(s4, "p1", { type: "nextPhase" })
    act(s4, "p1", { type: "attack", instanceId: gran.instanceId })
    // アタック直後は防御側(p2)に優先権 → グラン側(p1)は発動できない
    assert(
        act(s4, "p1", { type: "activateAbility", instanceId: gran.instanceId, effectId: granEffectId }) !== null,
        "優先権のない側は起動できない",
    )
    // 防御側パス → p1に優先権 → 発動できる
    act(s4, "p2", { type: "pass" })
    const reserveBefore = s4.players.p1.reserve
    const trashBefore = s4.players.p1.trashCores
    assert(
        act(s4, "p1", { type: "activateAbility", instanceId: gran.instanceId, effectId: granEffectId }) === null,
        "優先権保持側はコアを払って起動できる",
    )
    assert(s4.battle === null, "起動能力(endBattle)でバトルが終了する")
    assert(s4.players.p1.reserve === reserveBefore - 1, "リザーブのコアが1個減る")
    assert(s4.players.p1.trashCores === trashBefore + 1, "払ったコアがトラッシュへ")
}

console.log("=== 先攻1ターン目はアタック不可 ===")
{
    const s = createGame(
        "first-turn-attack-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    engineRunTurnStart(s) // ラッパーを使わず、実際のターン1のまま検証する
    assert(s.turn === 1, "開始直後はターン1")
    const sp = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(sp)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへは移行できる")
    assert(
        act(s, "p1", { type: "attack", instanceId: sp.instanceId }) !== null,
        "先攻1ターン目のアタックは拒否される",
    )
    assert(act(s, "p1", { type: "endTurn" }) === null, "ターン終了はできる")
    // ターン2（後攻p2）はアタックできる
    const sp2 = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(sp2)
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ移行")
    assert(
        act(s, "p2", { type: "attack", instanceId: sp2.instanceId }) === null,
        "ターン2（後攻）はアタックできる",
    )
}

console.log("=== 装甲：色（BS02-040 ロブスターク） ===")
{
    // --- 赤マジックの単体破壊：装甲：赤持ちのみだと対象が取れず破壊されない ---
    const s = createGame(
        "armor-destroy-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const rob = createInstance("BS02-040", s.turn, 1) // ロブスターク Lv1（装甲：赤）
    s.players.p2.field.spirits.push(rob)
    s.players.p1.hand[0] = "BS01-121" // フレイムダンス（赤・destroy maxBp4000）
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "フレイムダンスを使用")
    assert(s.players.p2.field.spirits.length === 1, "装甲：赤持ちは赤の破壊効果の対象にならず生存")

    // --- 赤マジックの範囲破壊：装甲：赤持ちだけ生き残り、無装甲は破壊される ---
    const s2 = createGame(
        "armor-destroyall-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s2)
    const rob2 = createInstance("BS02-040", s2.turn, 1) // ロブスターク Lv1（装甲：赤）
    const plain = createInstance("BS01-001", s2.turn, 1) // ゴラドン（無装甲）
    s2.players.p2.field.spirits.push(rob2, plain)
    s2.players.p1.hand[0] = "BS01-122" // フレイムテンペスト（赤・destroyAll maxBp3000）
    s2.players.p1.reserve = 10
    assert(act(s2, "p1", { type: "castMagic", handIndex: 0 }) === null, "フレイムテンペストを使用")
    assert(s2.players.p2.field.spirits.includes(rob2), "装甲：赤持ちは範囲破壊でも生存")
    assert(!s2.players.p2.field.spirits.includes(plain), "無装甲のゴラドンは範囲破壊で破壊される")

    // --- 紫ソースの効果は装甲：赤を貫通する ---
    const s3 = createGame(
        "armor-pierce-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "white" },
    )
    runTurnStart(s3)
    const rob3 = createInstance("BS02-040", s3.turn, 2) // ロブスターク Lv1（コア2）
    s3.players.p2.field.spirits.push(rob3)
    s3.players.p1.hand[0] = "BS01-129" // ポイズンシュート（紫・coreRemove count1）
    s3.players.p1.reserve = 10
    assert(
        act(s3, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: rob3.instanceId }) === null,
        "ポイズンシュートを使用（紫は装甲：赤を貫通）",
    )
    assert(rob3.cores === 1, "装甲：赤は紫の効果を防げず、コアが1個減る")

    // --- レベル不足（維持コア未満）なら装甲は働かない ---
    const s4 = createGame(
        "armor-level-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s4)
    const rob4 = createInstance("BS02-040", s4.turn, 0) // コア0＝Lv0（装甲の levels [1,2] 対象外）
    s4.players.p2.field.spirits.push(rob4)
    s4.players.p1.hand[0] = "BS01-121" // フレイムダンス
    s4.players.p1.reserve = 10
    assert(act(s4, "p1", { type: "castMagic", handIndex: 0 }) === null, "フレイムダンスを使用")
    assert(s4.players.p2.field.spirits.length === 0, "Lv条件外では装甲が働かず破壊される")
}

console.log("=== 呪撃（BS02-015 ハンプダンプ） ===")
{
    // --- アタック→ブロック→双方パスで、BP比較の勝敗に関わらずブロッカーが破壊される ---
    const s = createGame(
        "jugeki-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "green" },
    )
    runTurnStart(s)
    const hampdump = createInstance("BS02-015", s.turn, 3) // ハンプダンプ Lv2（呪撃）BP4000
    s.players.p1.field.spirits.push(hampdump)
    const leewolf = createInstance("BS01-053", s.turn, 6) // リーヴォルフ Lv3 BP5000（BP比較なら勝つ）
    s.players.p2.field.spirits.push(leewolf)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: hampdump.instanceId }) === null, "ハンプダンプでアタック")
    assert(act(s, "p2", { type: "block", instanceId: leewolf.instanceId }) === null, "リーヴォルフでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.players.p1.field.spirits.length === 0, "BP負けのハンプダンプはBP比較で破壊される")
    assert(s.players.p2.field.spirits.length === 0, "BP比較で勝ったリーヴォルフも【呪撃】で破壊される")

    // --- ブロックされなければ何も起きない ---
    const s2 = createGame(
        "jugeki-noblock-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "green" },
    )
    runTurnStart(s2)
    const hampdump2 = createInstance("BS02-015", s2.turn, 3) // ハンプダンプ Lv2（呪撃）
    s2.players.p1.field.spirits.push(hampdump2)
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s2, "p1", { type: "attack", instanceId: hampdump2.instanceId }) === null,
        "ハンプダンプでアタック（ブロッカーなし）",
    )
    assert(act(s2, "p2", { type: "takeLife" }) === null, "防御側はライフで受ける")
    assert(s2.players.p1.field.spirits.length === 1, "ブロックされなければ【呪撃】は発動せずアタッカーは生存")
    assert(s2.battle === null, "バトル終了")
}

console.log("=== BS02第二弾（赤・紫）構造化カードの確認 ===")
{
    console.log("--- BS02-005 ドラグノ突撃兵：cantBlock制約 + アタック時BP+2000 ---")
    const s = createGame(
        "bs02-005-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    const jassei = createInstance("BS02-005", s.turn, 3) // ドラグノ突撃兵 Lv2 BP6000
    s.players.p1.field.spirits.push(jassei)
    const enemyAtk = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(enemyAtk)

    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ移行")
    assert(act(s, "p2", { type: "attack", instanceId: enemyAtk.instanceId }) === null, "p2がゴラドンでアタック")
    assert(
        act(s, "p1", { type: "block", instanceId: jassei.instanceId }) !== null,
        "cantBlock制約でドラグノ突撃兵はブロックできない",
    )
    assert(act(s, "p1", { type: "takeLife" }) === null, "ブロックできないためライフで受ける")

    assert(act(s, "p2", { type: "endTurn" }) === null, "p2がターン終了")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: jassei.instanceId }) === null, "ドラグノ突撃兵でアタック")
    assert(jassei.tempBpBuff === 2000, "アタック時効果（selfBuff）でBP+2000")
}
{
    console.log("--- BS02-017 マミーラ：召喚時に相手スピリット上のコア1個をリザーブへ ---")
    const s = createGame(
        "bs02-017-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const enemy = createInstance("BS01-001", s.turn, 3) // ゴラドン（コア3個）
    s.players.p2.field.spirits.push(enemy)
    const p2ReserveBefore = s.players.p2.reserve
    s.players.p1.hand[0] = "BS02-017"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "マミーラを召喚できる")
    assert(enemy.cores === 2, "召喚時効果（coreRemove）で相手スピリットのコアが1個減る")
    assert(s.players.p2.reserve === p2ReserveBefore + 1, "除去されたコアは持ち主のリザーブへ")
}
{
    console.log("--- BS02-021 髑髏騎士ズ・ガイン：アタック時コア除去 + Lv3で相手手札破棄 ---")
    const s = createGame(
        "bs02-021-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const zugain = createInstance("BS02-021", s.turn, 8) // 髑髏騎士ズ・ガイン Lv3
    s.players.p1.field.spirits.push(zugain)
    const enemy = createInstance("BS01-001", s.turn, 3) // ゴラドン（コア3個）
    s.players.p2.field.spirits.push(enemy)
    s.players.p2.hand.push("BS01-001", "BS01-002")
    const p2HandBefore = s.players.p2.hand.length
    const p2ReserveBefore = s.players.p2.reserve

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: zugain.instanceId }) === null, "ズ・ガインでアタック")
    assert(enemy.cores === 2, "アタック時効果（coreRemove）で相手スピリットのコアが1個減る")
    assert(s.players.p2.reserve === p2ReserveBefore + 1, "除去されたコアは持ち主のリザーブへ")
    assert(s.players.p2.hand.length === p2HandBefore - 1, "Lv3効果（discardOpponent）で相手の手札が1枚減る")
}
{
    console.log("--- BS02-076 太古の断層：battleWon（アタッカー勝利/ブロッカー勝利）でドロー ---")
    const s = createGame(
        "bs02-076-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    const nexus = createInstance("BS02-076", s.turn, 3) // 太古の断層 Lv2
    s.players.p1.field.nexuses.push(nexus)

    // p1（アタッカー）が勝利 → battleWon(attacker)でp1がドロー
    const atk1 = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000
    s.players.p1.field.spirits.push(atk1)
    const def1 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(def1)
    const p1HandBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: atk1.instanceId }) === null, "atk1でアタック")
    assert(act(s, "p2", { type: "block", instanceId: def1.instanceId }) === null, "p2がブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.includes(def1), "BP勝負でブロッカーが破壊される")
    assert(s.players.p1.hand.length === p1HandBefore + 1, "battleWon(attacker)効果で太古の断層がドロー")

    // p2ターンでp1（ブロッカー）が勝利 → battleWon(blocker)でp1がドロー
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了")
    const atk2 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000（p2の攻撃側）
    s.players.p2.field.spirits.push(atk2)
    const def2 = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000（p1のブロッカー）
    s.players.p1.field.spirits.push(def2)
    const p1HandBefore2 = s.players.p1.hand.length
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: atk2.instanceId }) === null, "atk2でアタック")
    assert(act(s, "p1", { type: "block", instanceId: def2.instanceId }) === null, "p1がブロック宣言")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.includes(atk2), "BP勝負でアタッカーが破壊される")
    assert(s.players.p1.hand.length === p1HandBefore2 + 1, "battleWon(blocker)効果で太古の断層がドロー")
}
{
    console.log("--- BS02-077 決闘台地：相手のスタートステップに【覚醒】持ちを回復 ---")
    const s = createGame(
        "bs02-077-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    const ketto = createInstance("BS02-077", s.turn, 0) // 決闘台地 Lv1
    s.players.p1.field.nexuses.push(ketto)
    const balmunk = createInstance("BS02-007", s.turn, 1) // 昇龍バルムンク Lv1（覚醒持ち）
    balmunk.isRested = true
    s.players.p1.field.spirits.push(balmunk)
    const other = createInstance("BS01-001", s.turn, 1) // 覚醒を持たない疲労スピリット（対照）
    other.isRested = true
    s.players.p1.field.spirits.push(other)

    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了 → p2のスタートステップが発生")
    assert(!balmunk.isRested, "決闘台地の効果（refreshOne, keywordFilter:awaken）で覚醒持ちが回復")
    assert(other.isRested === true, "覚醒を持たないスピリットは対象外で疲労のまま")
}
{
    console.log("--- BS02-011 ツヴァイ・ハウル：【覚醒】+ アタック時BP2000以下を破壊 ---")
    const s = createGame(
        "bs02-011-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const hau = createInstance("BS02-011", s.turn, 4) // ツヴァイ・ハウル Lv2 BP5000
    s.players.p1.field.spirits.push(hau)
    const weak = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000（破壊対象）
    const strong = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000（対象外）
    s.players.p2.field.spirits.push(weak, strong)

    assert(hasKeyword("BS02-011", "awaken"), "ツヴァイ・ハウルは【覚醒】キーワードを持つ")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: hau.instanceId }) === null, "ツヴァイ・ハウルでアタック")
    assert(!s.players.p2.field.spirits.includes(weak), "アタック時効果（destroy maxBp2000）でBP1000のゴラドンが破壊される")
    assert(s.players.p2.field.spirits.includes(strong), "BP3000のゴラドンは対象外で生存")
}

console.log("=== BS02 緑・白の構造化効果 ===")
{
    console.log("--- ダッチョーノ：破壊時にボイドからリザーブへコア2個 ---")
    const s = createGame(
        "bs02-gw-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "white" },
    )
    runTurnStart(s)
    const dacho = createInstance("BS02-032", s.turn, 1)
    s.players.p1.field.spirits.push(dacho)
    const reserveBefore = s.players.p1.reserve
    destroySpirit(s, "p1", dacho.instanceId)
    // 破壊されたスピリット上のコア1個もリザーブへ戻るため、+1（自身のコア）+2（coreGain）= +3
    assert(s.players.p1.reserve === reserveBefore + 3, "破壊時にリザーブ+3（自身のコア1+coreGain2）")

    console.log("--- カイザレオン大帝Lv2：アタックで相手だけ破壊→ライフクラッシュ ---")
    const kaiser = createInstance("BS02-036", s.turn, 7) // Lv2 BP15000
    s.players.p1.field.spirits.push(kaiser)
    const gora = createInstance("BS01-001", s.turn, 1) // BP1000
    s.players.p2.field.spirits.push(gora)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: kaiser.instanceId }) === null, "大帝でアタック")
    assert(act(s, "p2", { type: "block", instanceId: gora.instanceId }) === null, "ゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    const lifeBefore = s.players.p2.life
    const oppReserveBefore = s.players.p2.reserve
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
    assert(s.players.p2.field.spirits.length === 0, "ブロッカーが破壊される")
    assert(s.players.p2.life === lifeBefore - 1, "onBattle(attacker)でライフクラッシュ")
    // ブロッカー破壊で戻るコア1個＋ライフクラッシュのコア1個 = +2
    assert(s.players.p2.reserve === oppReserveBefore + 2, "ブロッカーのコアとライフのコアが相手リザーブへ")
}

{
    console.log("--- ライオライダーLv2：ブロックで相手だけ破壊→自身回復 ---")
    const s = createGame(
        "bs02-gw-test2",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const gora = createInstance("BS01-001", s.turn, 1) // BP1000
    s.players.p1.field.spirits.push(gora)
    const lio = createInstance("BS02-041", s.turn, 3) // Lv2 BP5000
    s.players.p2.field.spirits.push(lio)
    act(s, "p1", { type: "nextPhase" })
    assert(act(s, "p1", { type: "attack", instanceId: gora.instanceId }) === null, "ゴラドンでアタック")
    assert(act(s, "p2", { type: "block", instanceId: lio.instanceId }) === null, "ライオライダーでブロック")
    act(s, "p2", { type: "pass" })
    assert(act(s, "p1", { type: "pass" }) === null, "バトル解決")
    assert(s.players.p1.field.spirits.length === 0, "アタッカーが破壊される")
    assert(lio.isRested === false, "onBattle(blocker)のrefreshSelfで回復している")

    console.log("--- 機神官フレイLv2：ブロック時に相手のフラッシュを封印 ---")
    const s2 = createGame(
        "bs02-gw-test3",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s2)
    const gora2 = createInstance("BS01-001", s2.turn, 1)
    s2.players.p1.field.spirits.push(gora2)
    const frey = createInstance("BS02-047", s2.turn, 2) // Lv2
    s2.players.p2.field.spirits.push(frey)
    act(s2, "p1", { type: "nextPhase" })
    act(s2, "p1", { type: "attack", instanceId: gora2.instanceId })
    assert(act(s2, "p2", { type: "block", instanceId: frey.instanceId }) === null, "フレイでブロック")
    assert(s2.battle?.flashLockedPlayer === "p1", "onBlockのlockFlashで攻撃側がフラッシュ封印される")

    console.log("--- リロードコア：フラッシュでBP+3000 ---")
    const s3 = createGame(
        "bs02-gw-test4",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s3)
    const gora3 = createInstance("BS01-001", s3.turn, 1)
    s3.players.p1.field.spirits.push(gora3)
    const blocker = createInstance("BS01-001", s3.turn, 1)
    s3.players.p2.field.spirits.push(blocker)
    s3.players.p2.hand[0] = "BS02-103"
    s3.players.p2.reserve = 10
    act(s3, "p1", { type: "nextPhase" })
    act(s3, "p1", { type: "attack", instanceId: gora3.instanceId })
    assert(
        act(s3, "p2", {
            type: "castMagic",
            handIndex: 0,
            targetInstanceId: blocker.instanceId,
        }) === null,
        "防御側フラッシュでリロードコアを使用",
    )
    assert(blocker.tempBpBuff === 3000, "対象のBPが+3000される")
}

console.log("=== BS02 黄の構造化効果 ===")
{
    console.log("--- BS02-055 チャウー：coreBonus（効果で置かれるコア+1） ---")
    const s = createGame(
        "bs02-055-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const chau = createInstance("BS02-055", s.turn, 1) // チャウー Lv1
    s.players.p1.field.spirits.push(chau)
    s.players.p1.hand[0] = "BS01-115" // アウェイクン：フラッシュでリザーブからコア3個を対象へ
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: chau.instanceId }) === null,
        "アウェイクンでチャウーへコアチャージ",
    )
    assert(chau.cores === 1 + 3 + 1, "coreBonusで置かれるコアが+1される（元1+チャージ3+bonus1=5）")
}
{
    console.log("--- BS02-066 アルカナドール・パン：召喚時に相手スピリットを疲労 ---")
    const s = createGame(
        "bs02-066-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p1.hand[0] = "BS02-066"
    const enemy = createInstance("BS01-001", s.turn, 1) // ゴラドン（対象）
    s.players.p2.field.spirits.push(enemy)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "アルカナドール・パンを召喚")
    assert(enemy.isRested === true, "onSummon効果（exhaust）で相手スピリットが疲労する")
}
{
    console.log("--- BS02-105/107/108/111：フラッシュでBP+（グレートウォール/タイムリープ/マジックブック/スピリットイリュージョン） ---")
    const s = createGame(
        "bs02-yellow-magic-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 100
    const target = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(target)

    s.players.p1.hand[0] = "BS02-105"
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: target.instanceId }) === null,
        "グレートウォールのフラッシュ効果を使用",
    )
    assert(target.tempBpBuff === 2000, "グレートウォールでBP+2000")

    s.players.p1.hand[0] = "BS02-107"
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: target.instanceId }) === null,
        "タイムリープのフラッシュ効果を使用",
    )
    assert(target.tempBpBuff === 4000, "タイムリープでさらにBP+2000（合計4000）")

    s.players.p1.hand[0] = "BS02-108"
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: target.instanceId }) === null,
        "マジックブックのフラッシュ効果を使用",
    )
    assert(target.tempBpBuff === 8000, "マジックブックでさらにBP+4000（合計8000）")

    s.players.p1.hand[0] = "BS02-111"
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: target.instanceId }) === null,
        "スピリットイリュージョンのフラッシュ効果を使用",
    )
    assert(target.tempBpBuff === 11000, "スピリットイリュージョンでさらにBP+3000（合計11000）")
}

console.log("=== BS02 構造化スキップ分：エンジン小拡張 ===")
{
    console.log("--- BS02-036 カイザレオン大帝Lv1：constraint cantAttack でアタック不可 ---")
    const s = createGame(
        "bs02-ext-cantattack",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const kaiser1 = createInstance("BS02-036", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(kaiser1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s, "p1", { type: "attack", instanceId: kaiser1.instanceId }) !== null,
        "Lv1のカイザレオン大帝はcantAttack制約でアタックできない",
    )
}
{
    console.log("--- BS02-004 オルカリアLv2：canDirectAttack targetFilter recovered ---")
    const s = createGame(
        "bs02-ext-recovered",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const orca = createInstance("BS02-004", s.turn, 3) // Lv2
    s.players.p1.field.spirits.push(orca)
    const restedEnemy = createInstance("BS01-001", s.turn, 1)
    restedEnemy.isRested = true
    const recoveredEnemy = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(restedEnemy, recoveredEnemy)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: orca.instanceId,
            targetSpiritInstanceId: restedEnemy.instanceId,
        }) !== null,
        "疲労状態のスピリットはrecoveredフィルタで指定できない",
    )
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: orca.instanceId,
            targetSpiritInstanceId: recoveredEnemy.instanceId,
        }) === null,
        "回復状態のスピリットはrecoveredフィルタで指定アタックできる",
    )
}
{
    console.log("--- BS02-018/019：unblockableBy levelFilter ---")
    const s = createGame(
        "bs02-ext-levelfilter",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const supler = createInstance("BS02-018", s.turn, 2) // 悪魔スプラー Lv2（levelFilter[3]）
    s.players.p1.field.spirits.push(supler)
    const lv3Blocker = createInstance("BS01-007", s.turn, 7) // ハンマドレイク Lv3
    const lv2Blocker = createInstance("BS01-007", s.turn, 2) // ハンマドレイク Lv2
    s.players.p2.field.spirits.push(lv3Blocker, lv2Blocker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: supler.instanceId }) === null, "スプラーでアタック")
    assert(
        act(s, "p2", { type: "block", instanceId: lv3Blocker.instanceId }) !== null,
        "Lv3のブロッカーはlevelFilter[3]でブロックできない",
    )
    assert(
        act(s, "p2", { type: "block", instanceId: lv2Blocker.instanceId }) === null,
        "Lv2のブロッカーはブロックできる",
    )
}
{
    console.log("--- BS02-061 天使エンジュ：召喚時にrefreshOne colorFilter yellowで自分の黄のみ回復 ---")
    const s = createGame(
        "bs02-ext-refreshcolor",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const yellowRested = createInstance("BS02-055", s.turn, 1) // チャウー（黄）
    yellowRested.isRested = true
    const redRested = createInstance("BS01-001", s.turn, 1) // ゴラドン（赤）
    redRested.isRested = true
    s.players.p1.field.spirits.push(yellowRested, redRested)
    s.players.p1.hand[0] = "BS02-061"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "天使エンジュを召喚")
    assert(!yellowRested.isRested, "黄のスピリットが回復する")
    assert(redRested.isRested === true, "赤のスピリットはcolorFilter対象外で疲労のまま")
}
{
    console.log("--- BS02-084 祝福されし大聖堂Lv2：fieldEvent colorFilter yellowで自分の黄破壊時のみ発火 ---")
    const s = createGame(
        "bs02-ext-fieldevent-color",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const cathedral = createInstance("BS02-084", s.turn, 3) // Lv2
    s.players.p1.field.nexuses.push(cathedral)
    const yellowSpirit = createInstance("BS02-055", s.turn, 1) // チャウー（黄）
    const redSpirit = createInstance("BS01-001", s.turn, 1) // ゴラドン（赤）
    s.players.p1.field.spirits.push(yellowSpirit, redSpirit)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")

    const reserveBefore = s.players.p1.reserve
    const handBefore = s.players.p1.hand.length
    destroySpirit(s, "p1", redSpirit.instanceId)
    // 破壊された赤スピリット自身のコア1個のみリザーブへ（colorFilter不一致でcoreGainは発火せず）
    assert(s.players.p1.reserve === reserveBefore + 1, "赤のスピリット破壊：colorFilter不一致で発火しない")
    assert(s.players.p1.hand.length === handBefore, "赤のスピリット破壊：ドローも発火しない")

    const reserveBefore2 = s.players.p1.reserve
    const handBefore2 = s.players.p1.hand.length
    destroySpirit(s, "p1", yellowSpirit.instanceId)
    // 自身のコア1個 + coreGain(1) = +2
    assert(s.players.p1.reserve === reserveBefore2 + 2, "黄のスピリット破壊：colorFilter一致でcoreGainが発火")
    assert(s.players.p1.hand.length === handBefore2 + 1, "黄のスピリット破壊：Lv2のdrawも発火")
}
{
    console.log("--- BS02-071 宝石の獣カーバルクLv2：破壊時に想獣数ぶんcoreGainPer+drawPer ---")
    const s = createGame(
        "bs02-ext-family",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const carbuncle = createInstance("BS02-071", s.turn, 3) // Lv2（コア3個）
    const kerberos = createInstance("BS02-063", s.turn, 1) // 冥犬ケルル・ベロス（想獣）
    s.players.p1.field.spirits.push(carbuncle, kerberos)
    const reserveBefore = s.players.p1.reserve
    const handBefore = s.players.p1.hand.length
    destroySpirit(s, "p1", carbuncle.instanceId)
    // 自身のコア3個 + coreGainPer（想獣1体=ケルル・ベロスのみ。破壊時点でカーバルク自身はフィールドから除去済み）= +4
    assert(s.players.p1.reserve === reserveBefore + 4, "破壊時：自身のコア3+coreGainPer(想獣1体分)=+4")
    assert(s.players.p1.hand.length === handBefore + 1, "破壊時：drawPer(想獣1体分)で1枚ドロー")
}
{
    console.log("--- BS02-106 ローヤルポーション：refreshAllByCostで両陣営のコスト2スピリットを回復 ---")
    const s = createGame(
        "bs02-ext-refreshcost",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const own2 = createInstance("BS01-004", s.turn, 1) // ドラグノ偵察兵 コスト2
    own2.isRested = true
    const own3 = createInstance("BS01-009", s.turn, 1) // ヴォルク・バブーン コスト3
    own3.isRested = true
    s.players.p1.field.spirits.push(own2, own3)
    const opp2 = createInstance("BS01-004", s.turn, 1)
    opp2.isRested = true
    s.players.p2.field.spirits.push(opp2)
    s.players.p1.hand[0] = "BS02-106"
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ローヤルポーションを使用")
    assert(!own2.isRested, "自分のコスト2スピリットが回復")
    assert(!opp2.isRested, "相手のコスト2スピリットも回復（両陣営）")
    assert(own3.isRested === true, "コスト3のスピリットはrefreshAllByCost対象外で疲労のまま")
}
{
    console.log("--- BS02-075 天使長プリンシパール：召喚時にdestroyOwnByCostでコスト最大の1体を破壊 ---")
    const s = createGame(
        "bs02-ext-destroyowncost",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const low = createInstance("BS01-004", s.turn, 1) // コスト2
    const mid = createInstance("BS01-012", s.turn, 1) // コスト4
    const high = createInstance("BS01-016", s.turn, 1) // コスト5（maxCost超過で対象外）
    s.players.p1.field.spirits.push(low, mid, high)
    s.players.p1.hand[0] = "BS02-075"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "天使長プリンシパールを召喚")
    assert(!s.players.p1.field.spirits.includes(mid), "コスト4以下のうちコスト最大のスピリットが破壊される")
    assert(s.players.p1.field.spirits.includes(low), "コスト2のスピリットは対象外で生存")
    assert(s.players.p1.field.spirits.includes(high), "コスト5のスピリットはmaxCost超過で対象外")
    // 召喚コスト8+維持コア1=9を消費（20→11）、destroyOwnByCostでmid自身のコア1個がリザーブへ（11→12）、
    // gainCoresEqualCostでmidのコスト4ぶんコア追加（12→16）
    assert(s.players.p1.reserve === 16, "召喚コスト消費＋破壊時のコア戻し＋gainCoresEqualCostの合計が一致")
}

console.log("=== キーワード付与（grantKeyword / keywordGrant）と aura keywordFilter ===")
{
    console.log("--- スピリットリンク：付与された覚醒でawakenアクションが通る ---")
    const s = createGame(
        "grant-keyword-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const attacker = createInstance("BS01-001", s.turn, 1) // ゴラドン（覚醒なし）
    const donor = createInstance("BS01-001", s.turn, 2) // コア供給元
    s.players.p1.field.spirits.push(attacker, donor)
    s.players.p1.hand[0] = "BS02-089"
    s.players.p1.reserve = 10
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    // 覚醒なしの時点では拒否される
    assert(
        act(s, "p1", {
            type: "awaken",
            instanceId: attacker.instanceId,
            fromInstanceId: donor.instanceId,
            count: 1,
        }) !== null,
        "覚醒を持たないスピリットのawakenは拒否",
    )
    act(s, "p2", { type: "pass" }) // 防御側パス → p1に優先権
    assert(
        act(s, "p1", {
            type: "castMagic",
            handIndex: 0,
            targetInstanceId: attacker.instanceId,
        }) === null,
        "フラッシュでスピリットリンクを使用",
    )
    assert(
        attacker.tempKeywords.some((k) => k.keyword === "awaken"),
        "対象に覚醒が一時付与される",
    )
    act(s, "p2", { type: "pass" }) // 使用で優先権がp2へ移る → p2パスでp1へ戻る
    assert(
        act(s, "p1", {
            type: "awaken",
            instanceId: attacker.instanceId,
            fromInstanceId: donor.instanceId,
            count: 1,
        }) === null,
        "付与された覚醒でコアを移動できる",
    )
    assert(attacker.cores === 2 && donor.cores === 1, "コアが移動している")

    console.log("--- ターン終了で一時付与がクリアされる ---")
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" }) // フラッシュ終了
    act(s, "p2", { type: "takeLife" })
    act(s, "p1", { type: "endTurn" })
    assert(attacker.tempKeywords.length === 0, "endTurnでtempKeywordsが空になる")

    console.log("--- インビンシブルシールド：付与された装甲が赤の効果を防ぐ ---")
    const s2 = createGame(
        "grant-armor-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s2)
    const guard = createInstance("BS01-001", s2.turn, 1)
    s2.players.p2.field.spirits.push(guard)
    resolveAction(s2, "p2", null, {
        type: "grantKeyword",
        keyword: "armor",
        colors: ["red", "purple", "green", "blue"],
    }, guard.instanceId)
    // p1の赤ソースの破壊効果は装甲で対象に取れない
    resolveAction(s2, "p1", null, { type: "destroy", count: 1 }, undefined, "red")
    assert(s2.players.p2.field.spirits.length === 1, "付与された装甲が赤の破壊効果を防ぐ")
}

{
    console.log("--- ディラノス：keywordGrant（地竜へ覚醒付与、アタックステップ限定） ---")
    const s = createGame(
        "keyword-grant-field-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const dillanos = createInstance("BS02-X05", s.turn, 3) // Lv2（keywordGrant有効）
    const dino = createInstance("BS02-003", s.turn, 2) // ディノハウンド（地竜）
    const gora = createInstance("BS01-001", s.turn, 1) // ゴラドン（爬獣＝対象外）
    s.players.p1.field.spirits.push(dillanos, dino, gora)
    assert(
        !spiritHasKeyword(s, "p1", dino, "awaken"),
        "メインステップでは付与されない（phase: attack 限定）",
    )
    act(s, "p1", { type: "nextPhase" })
    assert(
        spiritHasKeyword(s, "p1", dino, "awaken"),
        "アタックステップ中は地竜に覚醒が付与される",
    )
    assert(
        !spiritHasKeyword(s, "p1", gora, "awaken"),
        "地竜以外には付与されない",
    )

    console.log("--- ディラノスの aura keywordFilter：覚醒持ちのみBP+1000 ---")
    const s2 = createGame(
        "aura-keyword-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s2)
    const dillanos2 = createInstance("BS02-X05", s2.turn, 1) // Lv1（auraは有効、keywordGrantは無効）
    const balmung = createInstance("BS02-007", s2.turn, 1) // バルムンク（静的覚醒持ち・Lv1 BP3000）
    const gora2 = createInstance("BS01-001", s2.turn, 1) // 覚醒なし・Lv1 BP1000
    s2.players.p1.field.spirits.push(dillanos2, balmung, gora2)
    assert(
        effectiveBp(s2, "p1", balmung) === 3000 + 1000,
        "覚醒持ちバルムンクはaura keywordFilterで+1000",
    )
    assert(effectiveBp(s2, "p1", gora2) === 1000, "覚醒を持たないゴラドンは対象外")
}

console.log("")
if (failed > 0) {
    console.error(`${failed}件の失敗があります（合格${passed}件）`)
    process.exit(1)
}
console.log(`すべてのチェックに合格しました 🎉（${passed}件）`)
