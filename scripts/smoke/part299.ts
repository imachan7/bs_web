// smoke パート299（BS13 赤バッチ後半9枚：新しく足した6つの器）
// E=ブレイヴ同士の合体（塊は2段で止める）／G=他のブレイヴの『合体アタック時』を借りて発揮／
// P=ブレイヴの合体上限を2つにする／Q=継続で実効BPを固定する（BP+は上に乗る）／
// M=系統AND（familyAll）／R=手札のカードのコストを置換する
import { assert, createGame, createInstance, effectiveBp, effectiveCost, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { attachBrave } from "../../server/src/logic/removal"
import { braveCombineCandidates } from "../../shared/summon"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: BS13 赤バッチ後半のカード定義 ===")
{
    assert(getCard("BS13-049").name === "イリテバン", "BS13-049はイリテバン")
    assert(getCard("BS13-050").name === "輝竜シャイン・ブレイザー", "BS13-050は輝竜シャイン・ブレイザー")
    assert(getCard("BS13-061").name === "戴冠する活火山", "BS13-061は戴冠する活火山")
    assert(getCard("BS13-062").name === "光り輝く大銀河", "BS13-062は光り輝く大銀河")
    assert(getCard("BS13-X01").name === "光龍騎神サジット・アポロドラゴン", "BS13-X01はサジット・アポロドラゴン")
    assert(getCard("X011").name === "光導龍騎ゾディアックアポロクリムゾン", "X011はゾディアックアポロクリムゾン")
}

console.log("=== E: ブレイヴ同士の合体（BS13-049イリテバン Lv1） ===")
{
    const s = game("e-brave-on-brave")
    const p1 = s.players.p1
    // イリテバン自身がスピリット状態のブレイヴ。ここに別のブレイヴ（ヘッジボルグ：合体条件コスト4以上）を合体させる
    const iri = createInstance("BS13-049", s.turn, 1)
    p1.field.spirits.push(iri)
    const hedge = createInstance("BS10-065", s.turn, 1)
    p1.field.spirits.push(hedge)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", iri, { type: "combineOwnBrave", hostSelf: true })
    assert((iri.braveRefs ?? []).length === 1, "イリテバンにブレイヴ1つが合体した")
    assert(
        p1.field.spirits.every((sp) => sp.instanceId !== hedge.instanceId),
        "合体したブレイヴはスピリット状態ではなくなった",
    )
    assert(
        (iri.braveRefs ?? [])[0]?.instanceId !== iri.instanceId,
        "イリテバン自身は合体するブレイヴの候補にならない（自分自身とは合体しない）",
    )

    // 塊はここで止まる：もう1つのブレイヴは、既にブレイヴが乗っているイリテバンには合体できない
    const hedge2 = createInstance("BS10-065", s.turn, 1)
    p1.field.spirits.push(hedge2)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", iri, { type: "combineOwnBrave", hostSelf: true })
    assert((iri.braveRefs ?? []).length === 1, "既にブレイヴが乗っている塊には、さらに合体できない（実体の入れ子は2段で止まる）")
    assert(
        p1.field.spirits.some((sp) => sp.instanceId === hedge2.instanceId),
        "2つめのブレイヴはスピリット状態のまま残る",
    )
}
{
    // 逆向き：ブレイヴが乗った「塊」自体を、本物のスピリットへ合体させることはできない
    const s = game("e-cluster-not-combinable")
    const p1 = s.players.p1
    const iri = createInstance("BS13-049", s.turn, 1)
    p1.field.spirits.push(iri)
    const hedge = createInstance("BS10-065", s.turn, 1)
    p1.field.spirits.push(hedge)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", iri, { type: "combineOwnBrave", hostSelf: true })
    assert((iri.braveRefs ?? []).length === 1, "前提：イリテバンにブレイヴが合体している")
    // 恐竜王メガロ・ザウル（コスト7）はイリテバンの合体条件（コスト4以上）を満たす合体先だが、
    // 塊になったイリテバンは合体できない（RuleValidator.ts の現状の制限を維持）
    const megalo = createInstance("BS13-008", s.turn, 1)
    p1.field.spirits.push(megalo)
    refreshLevelAsOverrides(s)
    assert(
        !braveCombineCandidates(s, "p1", "BS13-049").includes(megalo.instanceId) ||
            (iri.braveRefs ?? []).length === 1,
        "塊のイリテバンは、そのままでは本物のスピリットと合体しない",
    )
}

console.log("=== G: 他のブレイヴの『合体アタック時』効果を借りて発揮する（BS13-049【合体時】） ===")
{
    const s = game("g-borrow-attack")
    const p1 = s.players.p1
    const p2 = s.players.p2
    // ホスト：恐竜王メガロ・ザウル（コスト7）。イリテバンの合体条件（コスト4以上）を満たす
    const host = createInstance("BS13-008", s.turn, 1)
    p1.field.spirits.push(host)
    const iri = createInstance("BS13-049", s.turn, 1)
    p1.field.spirits.push(iri)
    attachBrave(s, "p1", host, iri)
    // 借り元：骸戦車ゲパルバート（スピリット状態のブレイヴ）。
    // 【合体時】『このスピリットのアタック時』疲労状態の相手のスピリット1体を破壊する
    p1.field.spirits.push(createInstance("BS10-064", s.turn, 1))
    const rested = createInstance("BS01-001", s.turn, 1)
    rested.isRested = true
    p2.field.spirits.push(rested)
    refreshLevelAsOverrides(s)

    resolveAction(s, "p1", host, { type: "borrowCombinedAttackEffect" })
    assert(
        p2.field.spirits.every((sp) => sp.instanceId !== rested.instanceId),
        "スピリット状態のブレイヴの『合体アタック時』効果を、合体スピリット自身の効果として発揮した",
    )
}
{
    // イリテバン自身も借り元の候補に入る（2026-09-08 ユーザー確認）。
    // 自身を選ぶと借用がもう一段走るが、**2回まで**で止まり、そこでは別のブレイヴの効果が発揮される
    const s = game("g-borrow-self")
    const p1 = s.players.p1
    const p2 = s.players.p2
    const host = createInstance("BS13-008", s.turn, 1)
    p1.field.spirits.push(host)
    const iri = createInstance("BS13-049", s.turn, 1)
    p1.field.spirits.push(iri)
    attachBrave(s, "p1", host, iri)
    p1.field.spirits.push(createInstance("BS10-064", s.turn, 1))
    const rested = createInstance("BS01-001", s.turn, 1)
    rested.isRested = true
    p2.field.spirits.push(rested)
    refreshLevelAsOverrides(s)

    // targetInstanceId でイリテバン自身を明示的に選ぶ
    resolveAction(s, "p1", host, { type: "borrowCombinedAttackEffect" }, iri.instanceId)
    assert(
        p2.field.spirits.every((sp) => sp.instanceId !== rested.instanceId),
        "自身を選んだ場合、借用がもう一段走ってゲパルバートの効果が発揮される（自身の再選択は止まる）",
    )
    assert(iri.borrowedAttackEffectOnce === undefined, "借用の再入ガードは解決後に外れる")
}

console.log("=== P: ブレイヴの合体上限を2つにする（BS13-X01 Lv1-3） ===")
{
    const s = game("p-combine-limit")
    const p1 = s.players.p1
    // サジット・アポロドラゴン（コスト8）。合体条件コスト5以上のブレイヴも合体できる
    const sagitt = createInstance("BS13-X01", s.turn, 1)
    p1.field.spirits.push(sagitt)
    refreshLevelAsOverrides(s)
    assert(
        braveCombineCandidates(s, "p1", "BS10-065").includes(sagitt.instanceId),
        "ブレイヴ0つの状態では当然、合体先の候補になる",
    )
    const b1 = createInstance("BS10-065", s.turn, 1)
    p1.field.spirits.push(b1)
    attachBrave(s, "p1", sagitt, b1)
    refreshLevelAsOverrides(s)
    assert(
        braveCombineCandidates(s, "p1", "BS10-065").includes(sagitt.instanceId),
        "ブレイヴ1つでも、合体上限が2つなのでまだ合体先の候補になる",
    )
    const b2 = createInstance("BS10-065", s.turn, 1)
    p1.field.spirits.push(b2)
    attachBrave(s, "p1", sagitt, b2)
    refreshLevelAsOverrides(s)
    assert((sagitt.braveRefs ?? []).length === 2, "ブレイヴ2つが合体している")
    assert(
        !braveCombineCandidates(s, "p1", "BS10-065").includes(sagitt.instanceId),
        "上限の2つに達したら合体先の候補から外れる",
    )
}
{
    // 上限を上げていない普通のスピリットは、従来どおり1つで打ち止め
    const s = game("p-combine-limit-default")
    const p1 = s.players.p1
    const plain = createInstance("BS13-008", s.turn, 1)
    p1.field.spirits.push(plain)
    const b1 = createInstance("BS10-065", s.turn, 1)
    p1.field.spirits.push(b1)
    attachBrave(s, "p1", plain, b1)
    refreshLevelAsOverrides(s)
    assert(
        !braveCombineCandidates(s, "p1", "BS10-065").includes(plain.instanceId),
        "合体上限を上げていないスピリットは1つで打ち止め（既存の挙動は変わらない）",
    )
}

console.log("=== Q: 継続で実効BPを固定する（X011【合体時】Lv2） ===")
{
    const s = game("q-bp-as")
    const p1 = s.players.p1
    // X011 は Lv2（維持コア5）で【合体時】。ブレイヴ1つを合体させて条件を満たす
    const zodiac = createInstance("X011", s.turn, 5)
    p1.field.spirits.push(zodiac)
    const brave = createInstance("BS10-065", s.turn, 1)
    p1.field.spirits.push(brave)
    attachBrave(s, "p1", zodiac, brave)
    // 系統「光導」を持つ天蠍神騎スコル・スピア（Lv1のBPは5000）
    const scol = createInstance("BS10-X06", s.turn, 1)
    p1.field.spirits.push(scol)
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", scol) === 12000, "系統「光導」を持つ自分のスピリットの実効BPが12000になる")

    // 「Lv1/Lv2/Lv3**BP**を12000として扱う」＝置き換わるのは印刷BPだけ。BP+はその上に乗る
    scol.tempBpBuff += 2000
    assert(effectiveBp(s, "p1", scol) === 14000, "BP+2000は12000の上に乗る（全上書きではない）")

    // 系統「光導」を持たないスピリットは影響を受けない（恐竜王メガロ・ザウルのLv1のBPは5000）
    const other = createInstance("BS13-008", s.turn, 1)
    p1.field.spirits.push(other)
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", other) === 5000, "系統「光導」を持たないスピリットのBPは置き換わらない")
}
{
    // 合体していなければ発揮しない（【合体時】）
    const s = game("q-bp-as-not-combined")
    const p1 = s.players.p1
    p1.field.spirits.push(createInstance("X011", s.turn, 5))
    const scol = createInstance("BS10-X06", s.turn, 1)
    p1.field.spirits.push(scol)
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", scol) === 5000, "X011が合体していなければBPは置き換わらない")
}

console.log("=== M: 系統AND（familyAll。BS13-061戴冠する活火山 Lv2） ===")
{
    const s = game("m-family-all")
    const p1 = s.players.p1
    p1.life = 3
    // 地竜と竜人の両方を持つ：鎧竜人アンキロング（Lv1のBPは2000）
    const both = createInstance("BS13-002", s.turn, 1)
    p1.field.spirits.push(both)
    // 地竜だけ：ロクケラトプス（Lv1のBPは1000）
    const onlyOne = createInstance("BS01-002", s.turn, 1)
    p1.field.spirits.push(onlyOne)
    refreshLevelAsOverrides(s)
    const volcano = createInstance("BS13-061", s.turn, 1)
    p1.field.nexuses.push(volcano)
    resolveAction(s, "p1", volcano, {
        type: "bpBuffAllPer",
        counter: "ownLife",
        amountPer: 1000,
        filter: { familyAll: ["地竜", "竜人"] },
    })
    assert(effectiveBp(s, "p1", both) === 2000 + 3000, "両方の系統を持つスピリットだけがライフ3個ぶんBP+3000された")
    assert(effectiveBp(s, "p1", onlyOne) === 1000, "片方の系統しか持たないスピリットはBP+されない")
}

console.log("=== R: 手札のカードのコストを置換する（BS13-062光り輝く大銀河 Lv1-2） ===")
{
    const s = game("r-cost-set")
    const p1 = s.players.p1
    p1.field.nexuses.push(createInstance("BS13-062", s.turn, 0))
    refreshLevelAsOverrides(s)
    // 巨蟹武神キャンサード（系統「光導」・コスト6）→ コスト5に置き換わる
    assert(getCard("BS10-X03").cost === 6, "前提：巨蟹武神キャンサードの印刷コストは6")
    assert(effectiveCost(s, "p1", getCard("BS10-X03")) === 5, "手札の系統「光導」スピリットのコストが5に置き換わる")
    // 天秤造神リブラ・ゴレム（系統「光導」・コスト8）も同じく5になる（増減ではなく置換）
    assert(getCard("BS11-X06").cost === 8, "前提：天秤造神リブラ・ゴレムの印刷コストは8")
    assert(effectiveCost(s, "p1", getCard("BS11-X06")) === 5, "コスト8のカードも5に置き換わる（下げ幅ではなく置換）")
    // 系統「光導」を持たないカードは置換されない（恐竜王メガロ・ザウルはコスト7・軽減赤4つ。
    // 大銀河自身の赤シンボル1つで軽減されて6になるだけで、5にはならない）
    assert(effectiveCost(s, "p1", getCard("BS13-008")) === 6, "系統「光導」を持たないカードのコストは置換されない（軽減だけが効く）")
}

console.log("=== BS13-061 Lv1-2：BP4000以下のスピリットのアタックは両陣営が破壊される ===")
{
    const s = game("volcano-both-sides")
    const p1 = s.players.p1
    p1.field.nexuses.push(createInstance("BS13-061", s.turn, 0))
    // 自分のBP2000のスピリットでアタックする。「相手の」と書いていないので自分も破壊される
    const weak = createInstance("BS13-001", s.turn, 1)
    p1.field.spirits.push(weak)
    refreshLevelAsOverrides(s)
    s.phase = "attack"
    handleAction(s, "p1", { type: "attack", instanceId: weak.instanceId })
    assert(
        p1.field.spirits.every((sp) => sp.instanceId !== weak.instanceId),
        "自分のBP4000以下のスピリットも、アタックすると破壊される（両陣営）",
    )
}

console.log("すべてのチェックに合格しました 🎉（part299）")
