// smoke パート104（cards.json の2つ目の効果欠落バッチ4・8枚）
//
// 背景：cards.json は「{"kind":"keyword", ...}」等を1件書いた時点で「実装済み」と誤認されており、
// 同じカードの2つ目の効果が丸ごと欠落していたカードが多数見つかった。今回は次の8枚を実装する:
//   - BS03-X09 蛮騎士ハーキュリー Lv1/2：召喚時、【神速】を持つスピリットすべて（両陣営）を回復
//   - BS03-X11 大天使ヴァリエル Lv1-3：召喚時、緑/黄から1色を指定しトラッシュの該当色マジックを全回収
//   - BS04-057 天使長セラフィー Lv1-3：召喚時、手札の天霊（コスト6以下）を好きなだけコスト不要召喚
//   - BS02-030 兵隊アントマン Lv2：破壊時、手札の怪虫を好きなだけ通常コストで召喚
//   - BS03-017 幽霊船長シルバーシャーク Lv2：破壊時、コア2個のスピリット1体を破壊
//   - BS05-X19 聖皇ジークフリーデン Lv1-3：召喚時、コスト合計5まで相手スピリットを破壊
//   - BS05-032 珊瑚蟹シオマネキッド Lv2：自分の緑のスピリットすべてに装甲：赤/白を付与
//   - BS02-X07 巨神機トール Lv1-3：アタック時＋Lv3バトル終了時、武装を疲労/破壊してBP増加/回復
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    destroySpirit,
    hasArmorAgainst,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== BS03-X09 蛮騎士ハーキュリー Lv1/2：召喚時、【神速】持ちすべて（両陣営）を回復 ===")
{
    const s = createGame("harkyuree-soku", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const p1Soku = put(s, "p1", "BS02-030", 1) // 兵隊アントマン：神速持ち
    p1Soku.isRested = true
    const p2Soku = put(s, "p2", "BS02-030", 1)
    p2Soku.isRested = true
    const p1NonSoku = put(s, "p1", "BS01-001", 1) // ゴラドン：神速なし
    p1NonSoku.isRested = true
    s.players.p1.hand[0] = "BS03-X09"
    s.players.p1.reserve = 20

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ハーキュリーを召喚")
    assert(!p1Soku.isRested, "p1の神速持ちは回復する")
    assert(!p2Soku.isRested, "p2の神速持ちも回復する（修飾なし＝両陣営が対象）")
    assert(p1NonSoku.isRested, "神速を持たないスピリットは回復しない")
}

console.log("=== BS03-X11 大天使ヴァリエル Lv1-3：召喚時、色を指定しトラッシュの該当色マジックを全回収 ===")
{
    const s = createGame("valeriel-magic-recover", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    // 緑マジック2枚・黄マジック1枚・赤マジック1枚（対象外の色）
    s.players.p1.trashCards = ["BS01-132", "BS01-133", "BS02-104", "BS01-114"]
    s.players.p1.hand[0] = "BS03-X11"
    s.players.p1.reserve = 15

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ヴァリエルを召喚")
    // 緑2枚 > 黄1枚のため、非対話時は該当枚数最多の緑が自動選択される
    assert(s.players.p1.hand.includes("BS01-132"), "緑マジック「ストームドロー」が手札に戻る")
    assert(s.players.p1.hand.includes("BS01-133"), "緑マジック「ワイルドパワー」が手札に戻る")
    assert(!s.players.p1.trashCards.includes("BS01-132"), "トラッシュから取り除かれる")
    assert(s.players.p1.trashCards.includes("BS02-104"), "黄マジックはトラッシュに残る（緑が選ばれたため）")
    assert(s.players.p1.trashCards.includes("BS01-114"), "対象外の色（赤）のマジックはトラッシュに残る")
}

console.log("=== BS04-057 天使長セラフィー Lv1-3：召喚時、手札の天霊をコスト不要で好きなだけ召喚 ===")
{
    const s = createGame("seraphy-free-summon", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    // hand[0]=セラフィー本体、以降：天使エンジュ(コスト3・天霊)／天使クレイオ(コスト2・天霊)／
    // 大天使ミカファール(コスト7・天霊だが上限6超で対象外)／ゴラドン(天霊でないため対象外)
    s.players.p1.hand = ["BS04-057", "BS02-061", "BS05-037", "BS02-X08", "BS01-001"]
    s.players.p1.reserve = 20

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "セラフィーを召喚（コスト8+維持コア1=9消費、残り11）")
    // エンジュ・クレイオはいずれも必要リザーブ2（維持コア1+追加コスト1）で並び、両方とも召喚できる（残り11→7）
    assert(!s.players.p1.hand.includes("BS02-061"), "天使エンジュは手札から召喚される")
    assert(!s.players.p1.hand.includes("BS05-037"), "天使クレイオも手札から召喚される（複数体の召喚）")
    assert(s.players.p1.hand.includes("BS02-X08"), "コスト7の大天使ミカファールはコスト上限6を超えるため対象外")
    assert(s.players.p1.hand.includes("BS01-001"), "天霊でないゴラドンは対象外")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS02-061") &&
            s.players.p1.field.spirits.some((sp) => sp.cardId === "BS05-037"),
        "召喚された2体がフィールドに存在する",
    )
    assert(s.players.p1.reserve === 20 - 9 - 2 - 2, "リザーブはセラフィー本体+2体分の維持コア+追加コストぶん減る")
}

console.log("=== BS02-030 兵隊アントマン Lv2：破壊時、手札の怪虫を通常コストで好きなだけ召喚 ===")
{
    const s = createGame("antman-paid-summon", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    const ant = put(s, "p1", "BS02-030", 2) // Lv2（cores2）
    // マッハジー(コスト1・怪虫)／エメアント(コスト2・怪虫)／テラノセイバー(コスト2・空牙＝対象外)
    s.players.p1.hand = ["BS02-026", "BS01-055", "BS01-003"]
    s.players.p1.reserve = 5
    s.players.p1.trashCores = 0

    destroySpirit(s, "p1", ant.instanceId, "destroy")
    // アントマン破壊でコア2個がリザーブへ戻り（5→7）、必要リザーブが小さいマッハジー
    // （維持コア1+コスト1=2、フィールドに軽減シンボルなし）から貪欲に選ばれて7→5。
    // マッハジー召喚後は緑シンボル1つが場に出るため、エメアント（維持コア1+コスト2）は
    // 軽減1が乗って必要リザーブ2となり5→3。テラノセイバーは系統「怪虫」でないため対象外
    assert(!s.players.p1.hand.includes("BS02-026"), "マッハジーは手札から召喚される")
    assert(!s.players.p1.hand.includes("BS01-055"), "エメアントも手札から召喚される（複数体の召喚）")
    assert(s.players.p1.hand.includes("BS01-003"), "系統「怪虫」でないテラノセイバーは対象外")
    assert(s.players.p1.reserve === 3, "リザーブは通常コスト分（維持コア込みで2+2）を含めて消費される")
    assert(s.players.p1.trashCores === 2, "支払ったコスト分（1+1、軽減込み）はトラッシュのコアへ計上される（コスト不要の召喚ではない）")
}

console.log("=== BS03-017 幽霊船長シルバーシャーク Lv2：破壊時、コア2個のスピリット1体を破壊 ===")
{
    const s = createGame("silvershark-coredestroy", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const shark = put(s, "p1", "BS03-017", 3) // Lv2
    const target = put(s, "p2", "BS01-001", 2) // コア2個（対象）
    const decoy = put(s, "p2", "BS01-002", 1) // コア1個（対象外）

    destroySpirit(s, "p1", shark.instanceId, "destroy")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === target.instanceId), "コア2個のスピリットは破壊される")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === decoy.instanceId), "コア2個でないスピリットは対象外")
}

console.log("=== BS05-X19 聖皇ジークフリーデン Lv1-3：召喚時、コスト合計5まで相手スピリットを破壊 ===")
{
    const s = createGame("siegfrieden-budget-destroy", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    const a = put(s, "p2", "BS01-008", 1) // メタルバーン：コスト3
    const b = put(s, "p2", "BS01-003", 1) // テラノセイバー：コスト2
    const c = put(s, "p2", "BS03-065", 1) // 天使キュリオ：コスト6（予算を超えるため対象外）
    s.players.p1.hand[0] = "BS05-X19"
    s.players.p1.reserve = 15
    put(s, "p1", "BS02-023", 1) // 【転召:コスト6以上】の犠牲（効果を持たないコスト6のスピリット）

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ジークフリーデンを召喚")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === a.instanceId), "コスト3のスピリットは破壊される（合計3）")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === b.instanceId), "コスト2のスピリットも破壊される（合計5で予算ちょうど）")
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === c.instanceId),
        "コスト6のスピリットは予算内に収まらないため破壊されない（転召時の上限8への切替は簡略化しbudget=5固定）",
    )
}

console.log("=== BS05-032 珊瑚蟹シオマネキッド Lv2：自分の緑のスピリットすべてに装甲：赤/白を付与 ===")
{
    const s = createGame("shiomaneki-armor-grant", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "green" })
    runTurnStart(s)
    put(s, "p1", "BS05-032", 2) // Lv2
    const greenSpirit = put(s, "p1", "BS02-030", 1) // 緑のスピリット
    refreshLevelAsOverrides(s)

    assert(hasArmorAgainst(greenSpirit, ["red"]) === true, "緑のスピリットは装甲：赤を得る")
    assert(hasArmorAgainst(greenSpirit, ["white"]) === true, "緑のスピリットは装甲：白を得る")
    assert(hasArmorAgainst(greenSpirit, ["blue"]) === false, "赤/白以外の色には装甲が効かない")

    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, greenSpirit.instanceId, ["red"], "spirit")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === greenSpirit.instanceId),
        "赤の破壊効果は装甲：赤/白で防がれる",
    )
    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, greenSpirit.instanceId, ["blue"], "spirit")
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === greenSpirit.instanceId),
        "青の破壊効果は装甲でカバーされないため通る",
    )
}

console.log("=== BS02-X07 巨神機トール：アタック時BP増加＋Lv3バトル終了時回復（武装を疲労/破壊） ===")
{
    const s = createGame("thor-armament", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS02-X07", 4) // Lv3（cores4・BP8000）
    const buddy = put(s, "p1", "BS02-X07", 1) // Lv1（cores1・BP4000）：系統「武装」の疲労/破壊対象
    const blocker = put(s, "p2", "BS01-001", 1) // 弱小ブロッカー（BP1000）：バトルを成立させる（onBattleEndはブロック時のみ発火）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")

    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "トールでアタック宣言")
    assert(buddy.isRested === true, "系統「武装」の自分のスピリットが疲労する（BP増加のコスト）")
    assert(attacker.tempBpBuff === 4000, "疲労させたスピリットの実効BP分だけBP+する")

    assert(declareBlock(s, "p2", blocker.instanceId) === null, "フラッシュ①を閉じてからブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.battle === null, "バトルが解決される")
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === buddy.instanceId),
        "Lv3：バトル終了時、系統「武装」の自分のスピリットが破壊される（回復のコスト）",
    )
    assert(attacker.isRested === false, "犠牲によってトール自身は回復する")
}
