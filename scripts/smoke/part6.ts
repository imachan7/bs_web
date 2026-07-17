// smoke パート6（scripts/smoke.ts から機械分割）
// 収録セクション:
//   - BS02-027 カプリホルン：アタック時、相手の回復状態スピリット数×1000でBP+
//   - BS02-099 ライフチェイン：フラッシュで自分のコスト最大スピリットを破壊しコスト分コア獲得
//   - BS02-072 トリックスター：召喚時、トラッシュのマジックを手札に戻す（スピリットは戻らない）
//   - BS02-057 妖精女王ティ・ターニャ / BS02-097 ネイチャーフォース：トラッシュのコアをスピリットへ
//   - BS02-101 リフレクションアーマー：コスト2の自分スピリット全員に装甲付与（コスト2以外は対象外）
//   - BS02-043 アルマ・ジール：相手のアタックステップ中のみ白スピリット+1000
//   - BS02-110 ヘビィゲート：コスト1以下のスピリットはこのターンアタック/ブロック不可、ターン終了で解除
//   - BS02-034 老賢樹トレントン：アタックでライフを減らしたとき、ボイドからコア1個
//   - BS02-080 エメラルドに輝く鍾乳洞：コア3個以上の自分スピリットのみ、自分のアタックステップ中+1000
//   - BS02-076 太古の断層 e3：自分のアタックステップ中、アタック中のコスト2スピリットのみ+2000
//   - BS02-048 竜戦車アースガルド Lv2：コスト8以外がブロック不可、コスト8はブロック可
//   - BS02-X07 巨神機トール：赤のアタッカーをブロックしても疲労しない（他色では疲労する）
//   - BS02-035 漆黒鳥ヤタグロス：破壊時、置かれていたコア数ぶんボイドからリザーブへ
//   - BS02-086 螺旋の塔：自分のアタックステップ中、相手のマジックのみ+1コスト
//   - BS02-062 ポークン：漂精スピリットは相手のマジックの効果を受けない（スピリット効果は防がない）
//   - deployNexus：白虎ハック／黒虎クロン／スコルピードの召喚時ネクサス配置
//   - BS02-095 サクリファイス：自分ネクサス破壊＋相手ネクサスのコアを全てトラッシュへ
import {
    createGame,
    createInstance,
    draw,
    getCard,
    lv1Cores,
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
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"

console.log("=== BS02-027 カプリホルン：アタック時、相手の回復状態スピリット数×1000でBP+ ===")
{
    const s = createGame(
        "bs02-caprihorn-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const caprihorn = createInstance("BS02-027", s.turn, 3) // Lv2 BP3000
    s.players.p1.field.spirits.push(caprihorn)
    const ready1 = createInstance("BS01-001", s.turn, 1)
    const ready2 = createInstance("BS01-002", s.turn, 1)
    const rested = createInstance("BS01-003", s.turn, 1)
    rested.isRested = true
    s.players.p2.field.spirits.push(ready1, ready2, rested)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: caprihorn.instanceId }) === null,
        "カプリホルンでアタック",
    )
    assert(
        effectiveBp(s, "p1", caprihorn) === 3000 + 2 * 1000,
        "相手の回復状態スピリット2体ぶんBP+2000（3000+2000=5000）",
    )
}

console.log("=== BS02-099 ライフチェイン：フラッシュで自分のコスト最大スピリットを破壊しコスト分コア獲得 ===")
{
    const s = createGame(
        "bs02-lifechain-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const low = createInstance("BS01-001", s.turn, 1) // ゴラドン cost0
    const high = createInstance("BS01-004", s.turn, 1) // ドラグノ偵察兵 cost2
    s.players.p1.field.spirits.push(low, high)
    s.players.p1.hand[0] = "BS02-099"
    s.players.p1.reserve = 10
    const reserveBefore = s.players.p1.reserve
    const cost = effectiveCost(s, "p1", getCard("BS02-099"))
    const highCores = high.cores // 破壊時にスピリット自身のコアもリザーブへ戻る
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ライフチェインを使用")
    assert(!s.players.p1.field.spirits.includes(high), "コスト最大のドラグノ偵察兵が破壊される")
    assert(s.players.p1.field.spirits.includes(low), "コストの低いゴラドンは残る")
    assert(
        s.players.p1.reserve === reserveBefore - cost + highCores + 2,
        "コスト支払い後、破壊されたスピリット自身のコアが戻り、さらにコスト(2)ぶんコアを獲得する",
    )
}

console.log("=== BS02-072 トリックスター：召喚時、トラッシュのマジックを手札に戻す（スピリットは戻らない） ===")
{
    const s = createGame(
        "bs02-trickster-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.trashCards.push("BS01-001", "BS02-102") // スピリット、マジックの順でトラッシュに積む
    s.players.p1.hand[0] = "BS02-072"
    s.players.p1.reserve = 10
    const handBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "トリックスターを召喚")
    assert(
        s.players.p1.hand.includes("BS02-102"),
        "トラッシュのマジック（ホワイトポーション）が手札に戻る",
    )
    assert(s.players.p1.trashCards.includes("BS01-001"), "トラッシュのスピリット（ゴラドン）は残る")
    assert(s.players.p1.hand.length === handBefore, "召喚(-1)と回収(+1)で手札枚数は変わらない")
}

console.log("=== BS02-057 妖精女王ティ・ターニャ / BS02-097 ネイチャーフォース：トラッシュのコアをスピリットへ ===")
{
    console.log("--- ティ・ターニャ：相手のアタックステップ開始時、トラッシュのコア2個を自身に置く ---")
    const s = createGame(
        "bs02-tityanya-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const tityanya = createInstance("BS02-057", s.turn, 2) // Lv2
    s.players.p1.field.spirits.push(tityanya)
    s.players.p1.trashCores = 5
    assert(
        act(s, "p1", { type: "nextPhase" }) === null,
        "p1がアタックステップへ移行（自分のターンでは発火しない）",
    )
    assert(tityanya.cores === 2, "p1自身のアタックステップでは発火せずコアは変わらない")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了、p2のターンへ")
    assert(
        act(s, "p2", { type: "nextPhase" }) === null,
        "p2がアタックステップへ移行（相手のアタックステップとして発火）",
    )
    assert(tityanya.cores === 4, "トラッシュからコア2個が自身に置かれる（2→4）")
    assert(s.players.p1.trashCores === 3, "トラッシュのコアが2個減る（5→3）")

    console.log("--- ネイチャーフォース：フラッシュで自分のトラッシュのコアすべてを対象スピリットへ ---")
    const s2 = createGame(
        "bs02-natureforce-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s2)
    const target = createInstance("BS01-001", s2.turn, 1)
    s2.players.p1.field.spirits.push(target)
    s2.players.p1.trashCores = 4
    s2.players.p1.hand[0] = "BS02-097"
    s2.players.p1.reserve = 10
    const cost2 = effectiveCost(s2, "p1", getCard("BS02-097"))
    // 使用コストの支払いぶんも支払い直後にトラッシュコアへ加算されるため、効果発動時点では
    // 4 + cost2 個のトラッシュコアが対象になる（コスト支払い→効果解決の順で処理されるため）
    assert(
        act(s2, "p1", {
            type: "castMagic",
            handIndex: 0,
            targetInstanceId: target.instanceId,
        }) === null,
        "ネイチャーフォースを使用",
    )
    assert(
        target.cores === 1 + 4 + cost2,
        "トラッシュのコア（初期4個＋コスト支払い分）すべてが対象スピリットに置かれる",
    )
    assert(s2.players.p1.trashCores === 0, "トラッシュのコアが0になる")
}

console.log("=== BS02-101 リフレクションアーマー：コスト2の自分スピリット全員に装甲付与（コスト2以外は対象外） ===")
{
    const s = createGame(
        "bs02-reflectionarmor-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const cost2a = createInstance("BS01-004", s.turn, 1) // ドラグノ偵察兵 cost2 BP2000
    const cost2b = createInstance("BS01-003", s.turn, 1) // テラノセイバー cost2 BP4000
    const cost0 = createInstance("BS01-001", s.turn, 1) // ゴラドン cost0 BP1000
    s.players.p1.field.spirits.push(cost2a, cost2b, cost0)
    s.players.p1.hand[0] = "BS02-101"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "リフレクションアーマーを使用")
    // p2からの赤ソースの破壊効果（フレイムダンス相当）を直接シミュレート
    resolveAction(s, "p2", null, { type: "destroy", maxBp: 4000, count: 1 }, undefined, "red")
    assert(s.players.p1.field.spirits.includes(cost2a), "コスト2のドラグノ偵察兵は装甲で赤の破壊効果を防ぐ")
    assert(s.players.p1.field.spirits.includes(cost2b), "コスト2のテラノセイバーも装甲で赤の破壊効果を防ぐ")
    assert(!s.players.p1.field.spirits.includes(cost0), "コスト2以外のゴラドンは装甲が付与されず破壊される")
}

console.log("=== BS02-043 アルマ・ジール：相手のアタックステップ中のみ白スピリット+1000 ===")
{
    const s = createGame(
        "bs02-almazeal-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const almazeal = createInstance("BS02-043", s.turn, 3) // Lv2
    s.players.p1.field.spirits.push(almazeal)
    const whiteSpirit = createInstance("BS01-074", s.turn, 1) // 白スピリット
    s.players.p1.field.spirits.push(whiteSpirit)
    const baseBp = effectiveBp(s, "p1", whiteSpirit)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1（自分）のアタックステップへ移行")
    assert(
        effectiveBp(s, "p1", whiteSpirit) === baseBp,
        "自分のターンのアタックステップではBP+されない（+0）",
    )
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了、p2のターンへ")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2がアタックステップへ移行")
    assert(
        effectiveBp(s, "p1", whiteSpirit) === baseBp + 1000,
        "相手（p2）のアタックステップ中は白スピリット+1000",
    )
}

console.log("=== BS02-110 ヘビィゲート：コスト1以下のスピリットはこのターンアタック/ブロック不可、ターン終了で解除 ===")
{
    const s = createGame(
        "bs02-heavygate-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const cheap = createInstance("BS01-001", s.turn, 1) // ゴラドン cost0（自分の場）
    s.players.p1.field.spirits.push(cheap)
    const attacker2 = createInstance("BS01-004", s.turn, 1) // ドラグノ偵察兵 cost2（アタック要員、バトル成立用）
    s.players.p1.field.spirits.push(attacker2)
    const blocker = createInstance("BS01-001", s.turn, 1) // 相手側の同cost0（ブロック検証用）
    s.players.p2.field.spirits.push(blocker)
    s.players.p1.hand[0] = "BS02-110"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ヘビィゲートを使用")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1がアタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: cheap.instanceId }) !== null,
        "コスト0のcheapはこのターンアタックできない",
    )
    assert(
        act(s, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null,
        "コスト2のattacker2はアタックできる",
    )
    assert(
        act(s, "p2", { type: "block", instanceId: blocker.instanceId }) !== null,
        "コスト0のblockerはこのターンブロックできない",
    )
    assert(act(s, "p2", { type: "takeLife" }) === null, "ライフで受ける")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2がアタックステップへ移行")
    assert(
        act(s, "p2", { type: "attack", instanceId: blocker.instanceId }) === null,
        "ターン終了後は制約が解除され、blockerはアタックできる",
    )
}

console.log("=== BS02-034 老賢樹トレントン：アタックでライフを減らしたとき、ボイドからコア1個 ===")
{
    const s = createGame(
        "bs02-trenton-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const trenton = createInstance("BS02-034", s.turn, 4) // Lv2
    s.players.p1.field.spirits.push(trenton)
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: trenton.instanceId }) === null,
        "老賢樹トレントンでアタック",
    )
    assert(act(s, "p2", { type: "takeLife" }) === null, "p2がライフで受ける")
    assert(
        s.players.p1.reserve === reserveBefore + 1,
        "ライフを減らしたことでボイドからコア1個を自分のリザーブに置く",
    )
}

console.log("=== BS02-080 エメラルドに輝く鍾乳洞：コア3個以上の自分スピリットのみ、自分のアタックステップ中+1000 ===")
{
    const s = createGame(
        "bs02-emerald-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const emerald = createInstance("BS02-080", s.turn, 2) // Lv2
    s.players.p1.field.nexuses.push(emerald)
    const heavy = createInstance("BS01-001", s.turn, 3) // コア3個（Lv2 BP3000）
    const light = createInstance("BS01-002", s.turn, 1) // コア1個
    s.players.p1.field.spirits.push(heavy, light)
    const heavyBaseBp = effectiveBp(s, "p1", heavy)
    const lightBaseBp = effectiveBp(s, "p1", light)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行")
    assert(
        effectiveBp(s, "p1", heavy) === heavyBaseBp + 1000,
        "コア3個以上のheavyは自分のアタックステップ中+1000",
    )
    assert(effectiveBp(s, "p1", light) === lightBaseBp, "コア1個のlightは対象外のため+0")
}

console.log("=== BS02-076 太古の断層 e3：自分のアタックステップ中、アタック中のコスト2スピリットのみ+2000 ===")
{
    const s = createGame(
        "bs02-kodaidansou-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const tower = createInstance("BS02-076", s.turn, 0) // Lv1（levels[1,2]で有効）
    s.players.p1.field.nexuses.push(tower)
    // BS01-004（ドラグノ偵察兵）はonAttackでの自己BP+2000を持つため、
    // 効果のないバニラのコスト2スピリットを使って純粋にオーラの増減だけを検証する
    const attacker = createInstance("BS01-005", s.turn, 1) // アイバーン cost2 Lv1 BP2000（アタック要員・効果なし）
    const bench = createInstance("BS02-003", s.turn, 2) // ディノハウンド cost2 Lv1（維持コア2）BP4000（非バトル中の対照・効果なし）
    const cheapAttacker = createInstance("BS01-001", s.turn, 1) // ゴラドン cost0 Lv1 BP1000（コスト2以外の対照）
    s.players.p1.field.spirits.push(attacker, bench, cheapAttacker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null,
        "コスト2のattackerでアタック",
    )
    assert(effectiveBp(s, "p1", attacker) === 2000 + 2000, "アタック中のコスト2スピリットは+2000")
    assert(effectiveBp(s, "p1", bench) === 4000, "非バトル中のコスト2スピリットは対象外（+0）")
    assert(effectiveBp(s, "p1", cheapAttacker) === 1000, "コスト2以外は対象外（+0）")

}

console.log("=== BS02-048 竜戦車アースガルド Lv2：コスト8以外がブロック不可、コスト8はブロック可 ===")
{
    const s = createGame(
        "bs02-earthgard-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const earthgard = createInstance("BS02-048", s.turn, 4) // Lv2
    s.players.p1.field.spirits.push(earthgard)
    const notCost8 = createInstance("BS01-001", s.turn, 1) // ゴラドン cost0
    const cost8 = createInstance("BS01-025", s.turn, 1) // 要塞龍ギガ cost8
    s.players.p2.field.spirits.push(notCost8, cost8)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: earthgard.instanceId }) === null,
        "アースガルドでアタック",
    )
    assert(
        act(s, "p2", { type: "block", instanceId: notCost8.instanceId }) !== null,
        "コスト8以外のnotCost8はブロックできない",
    )
    assert(
        act(s, "p2", { type: "block", instanceId: cost8.instanceId }) === null,
        "コスト8のcost8はブロックできる",
    )
}

console.log("=== BS02-X07 巨神機トール：赤のアタッカーをブロックしても疲労しない（他色では疲労する） ===")
{
    const s = createGame(
        "bs02-thor-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const thor = createInstance("BS02-X07", s.turn, 2) // Lv2（levels[2,3]で有効）
    s.players.p2.field.spirits.push(thor)
    const redAttacker = createInstance("BS01-001", s.turn, 1) // ゴラドン 赤
    const greenAttacker = createInstance("BS01-050", s.turn, 1) // ビートビートル 緑
    s.players.p1.field.spirits.push(redAttacker, greenAttacker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: redAttacker.instanceId }) === null,
        "赤のredAttackerでアタック",
    )
    assert(act(s, "p2", { type: "block", instanceId: thor.instanceId }) === null, "トールがブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "p2がパス（防御側から優先権）")
    assert(act(s, "p1", { type: "pass" }) === null, "p1がパス（両者パスでバトル解決）")
    assert(thor.isRested === false, "赤のスピリットをブロックしたトールは疲労しない")

    assert(
        act(s, "p1", { type: "attack", instanceId: greenAttacker.instanceId }) === null,
        "緑のgreenAttackerでアタック",
    )
    assert(act(s, "p2", { type: "block", instanceId: thor.instanceId }) === null, "トールが再度ブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "p2がパス")
    assert(act(s, "p1", { type: "pass" }) === null, "p1がパス（両者パスでバトル解決）")
    assert(thor.isRested === true, "赤以外のスピリットをブロックしたトールは疲労する")
}

console.log("=== BS02-035 漆黒鳥ヤタグロス：破壊時、置かれていたコア数ぶんボイドからリザーブへ ===")
{
    const s = createGame(
        "bs02-yatagurosu-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const yatagurosu = createInstance("BS02-035", s.turn, 3) // Lv2（コア3個）
    s.players.p1.field.spirits.push(yatagurosu)
    const reserveBefore = s.players.p1.reserve
    destroySpirit(s, "p1", yatagurosu.instanceId)
    assert(
        !s.players.p1.field.spirits.includes(yatagurosu),
        "ヤタグロスはフィールドから除去された",
    )
    assert(
        s.players.p1.reserve === reserveBefore + 6,
        "コア3個の戻し(+3)とボイドからの追加(+3)で、リザーブ+6",
    )
}

console.log("=== BS02-086 螺旋の塔：自分のアタックステップ中、相手のマジックのみ+1コスト ===")
{
    const s = createGame(
        "bs02-rasennotou-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const tower = createInstance("BS02-086", s.turn, 0) // Lv1（levels[1,2]で有効）
    s.players.p1.field.nexuses.push(tower)
    const magic = getCard("BS01-114") // バスタースピア（赤・reduction=red2つ、フィールドに一致色なしなので軽減0）
    const baseCost = magic.cost
    assert(
        effectiveCost(s, "p1", magic) === baseCost,
        "メインステップではp1のコストは基本コストのまま",
    )
    assert(
        effectiveCost(s, "p2", magic) === baseCost,
        "メインステップではp2のコストも基本コストのまま（フェーズ条件未成立）",
    )
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ移行")
    assert(
        effectiveCost(s, "p1", magic) === baseCost,
        "p1のアタックステップ中もp1自身のマジックのコストは変わらない",
    )
    assert(
        effectiveCost(s, "p2", magic) === baseCost + 1,
        "p1のアタックステップ中、相手(p2)のマジックは+1コスト",
    )
}

console.log("=== BS02-062 ポークン：漂精スピリットは相手のマジックの効果を受けない（スピリット効果は防がない） ===")
{
    const s = createGame(
        "bs02-poakun-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const poakun = createInstance("BS02-062", s.turn, 3) // Lv2（levels[2,3]で有効）
    s.players.p1.field.spirits.push(poakun)
    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, undefined, undefined, "magic")
    assert(
        s.players.p1.field.spirits.includes(poakun),
        "マジック由来の破壊効果は漂精のポークンに効かない",
    )
    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, undefined, undefined, "spirit")
    assert(
        !s.players.p1.field.spirits.includes(poakun),
        "スピリット効果由来の破壊効果はポークンにも通常通り効く",
    )
}

console.log("=== deployNexus：白虎ハック／黒虎クロン／スコルピードの召喚時ネクサス配置 ===")
{
    console.log("--- 白虎ハック：手札の白ネクサスを配置（該当なしなら何も起きない） ---")
    const s = createGame(
        "bs02-deploynexus-haku-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.hand[0] = "BS02-068" // 白虎ハック
    s.players.p1.reserve = 20
    const nexusCountBefore = s.players.p1.field.nexuses.length
    assert(
        act(s, "p1", { type: "summon", handIndex: 0 }) === null,
        "手札に白ネクサスがない状態で白虎ハックを召喚",
    )
    assert(
        s.players.p1.field.nexuses.length === nexusCountBefore,
        "該当する白ネクサスが手札になければ何も起きない",
    )

    console.log("--- 白虎ハック：手札に白ネクサス（生み出される尖兵）がある場合は配置される ---")
    const s2 = createGame(
        "bs02-deploynexus-haku2-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s2)
    s2.players.p1.hand[0] = "BS02-068" // 白虎ハック
    s2.players.p1.hand[1] = "BS02-082" // 生み出される尖兵（白ネクサス）
    s2.players.p1.reserve = 20
    assert(act(s2, "p1", { type: "summon", handIndex: 0 }) === null, "白虎ハックを召喚")
    assert(
        s2.players.p1.field.nexuses.some((n) => n.cardId === "BS02-082"),
        "手札の白ネクサスが配置される",
    )
    assert(!s2.players.p1.hand.includes("BS02-082"), "配置したネクサスは手札から消える")

    console.log("--- 黒虎クロン：手札の紫ネクサス（紫水晶の森）を配置 ---")
    const s3 = createGame(
        "bs02-deploynexus-kuro-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s3)
    s3.players.p1.hand[0] = "BS02-069" // 黒虎クロン
    s3.players.p1.hand[1] = "BS02-079" // 紫水晶の森（紫ネクサス）
    s3.players.p1.reserve = 20
    assert(act(s3, "p1", { type: "summon", handIndex: 0 }) === null, "黒虎クロンを召喚")
    assert(
        s3.players.p1.field.nexuses.some((n) => n.cardId === "BS02-079"),
        "手札の紫ネクサスが配置される",
    )

    console.log("--- スコルピード：トラッシュの緑ネクサス（緑芽吹く原野）を配置 ---")
    const s4 = createGame(
        "bs02-deploynexus-scorpio-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s4)
    s4.players.p1.trashCards.push("BS02-081") // 緑芽吹く原野（緑ネクサス）
    s4.players.p1.hand[0] = "BS02-031" // スコルピード
    s4.players.p1.reserve = 20
    assert(act(s4, "p1", { type: "summon", handIndex: 0 }) === null, "スコルピードを召喚")
    assert(
        s4.players.p1.field.nexuses.some((n) => n.cardId === "BS02-081"),
        "トラッシュの緑ネクサスが配置される",
    )
    assert(!s4.players.p1.trashCards.includes("BS02-081"), "配置したネクサスはトラッシュから消える")
}

console.log("=== BS02-095 サクリファイス：自分ネクサス破壊＋相手ネクサスのコアを全てトラッシュへ ===")
{
    const s = createGame(
        "bs02-sacrifice-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const n1 = createInstance("BS02-078", s.turn, 1) // 夢魔の寝所（コア1個・最小）
    const n2 = createInstance("BS02-079", s.turn, 3) // 紫水晶の森（コア3個）
    s.players.p1.field.nexuses.push(n1, n2)
    const oppNexus = createInstance("BS01-098", s.turn, 2) // 燃えさかる戦場（コア2個）
    s.players.p2.field.nexuses.push(oppNexus)
    s.players.p1.hand[0] = "BS02-095"
    s.players.p1.reserve = 20
    const trashCoresBefore = s.players.p2.trashCores
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "サクリファイスを使用")
    assert(!s.players.p1.field.nexuses.includes(n1), "コア数最小のn1が破壊される")
    assert(s.players.p1.field.nexuses.includes(n2), "n2は残る")
    assert(oppNexus.cores === 0, "相手ネクサスのコアが0になる")
    assert(
        s.players.p2.trashCores === trashCoresBefore + 2,
        "相手ネクサスのコア2個がトラッシュに置かれる",
    )
}

