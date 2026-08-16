// smoke パート20（BS03 赤・紫の構造化効果を代表6枚で検証）
import {
    assert,
    act,
    createGame,
    createInstance,
    runTurnStart,
    effectiveBp,
    hasKeyword,
    spiritHasKeyword,
} from "./helpers"

console.log("=== BS03-002 エッジホッグ Lv2：アタック時BP+1000 ===")
{
    const s = createGame(
        "bs03-002-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const hog = createInstance("BS03-002", s.turn, 2) // エッジホッグ Lv2 cores2 bp3000
    s.players.p1.field.spirits.push(hog)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: hog.instanceId }) === null, "エッジホッグでアタック")
    assert(effectiveBp(s, "p1", hog) === 4000, "アタック時にBP+1000（3000→4000）")
}

console.log("=== BS03-003 ドラグノ暗殺者 Lv2：呪撃/神速持ちにブロックされない ===")
{
    const s = createGame(
        "bs03-003-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const assassin = createInstance("BS03-003", s.turn, 3) // ドラグノ暗殺者 Lv2 cores3 bp4000
    const sokuBlocker = createInstance("BS01-053", s.turn, 1) // リーヴォルフ：【神速】持ち
    const jugekiBlocker = createInstance("BS02-015", s.turn, 3) // ハンプダンプ Lv2 cores3：【呪撃】持ち
    const plainBlocker = createInstance("BS01-001", s.turn, 1) // ゴラドン：キーワードなし
    s.players.p1.field.spirits.push(assassin)
    s.players.p2.field.spirits.push(sokuBlocker, jugekiBlocker, plainBlocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: assassin.instanceId }) === null, "暗殺者でアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    const err1 = act(s, "p2", { type: "block", instanceId: sokuBlocker.instanceId })
    assert(err1 !== null, "【神速】持ちのリーヴォルフはブロックできない")
    const err2 = act(s, "p2", { type: "block", instanceId: jugekiBlocker.instanceId })
    assert(err2 !== null, "【呪撃】持ちのハンプダンプはブロックできない")
    assert(
        act(s, "p2", { type: "block", instanceId: plainBlocker.instanceId }) === null,
        "キーワードなしのゴラドンは通常通りブロックできる",
    )
}

console.log("=== BS03-006 ランカフォリンクス Lv2：覚醒＋同BP破壊 ===")
{
    const s = createGame(
        "bs03-006-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    assert(hasKeyword("BS03-006", "awaken"), "ランカフォリンクスは【覚醒】を持つ")
    const lanka = createInstance("BS03-006", s.turn, 4) // Lv2 cores4 bp5000
    const sameBp = createInstance("BS03-006", s.turn, 4) // 同BP5000の対象（Lv2 cores4）
    s.players.p1.field.spirits.push(lanka)
    s.players.p2.field.spirits.push(sameBp)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: lanka.instanceId }) === null, "ランカフォリンクスでアタック")
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === sameBp.instanceId),
        "同BPの相手スピリットが破壊された",
    )
}

console.log("=== BS03-019 魔界軍師ヘルミア：召喚時破棄・アタック時ドロー ===")
{
    const s = createGame(
        "bs03-019-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p1.hand[0] = "BS03-019" // 魔界軍師ヘルミア：コスト5・維持1
    const handBeforeSummon = s.players.p1.hand.length
    const trashBefore = s.players.p1.trashCards.length
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ヘルミアを召喚")
    assert(
        s.players.p1.hand.length === handBeforeSummon - 2,
        "召喚で手札-1・召喚時効果の自壊で手札さらに-1",
    )
    assert(s.players.p1.trashCards.length === trashBefore + 1, "破棄したカードがトラッシュへ")

    const helmia = s.players.p1.field.spirits[0]!
    assert(act(s, "p1", { type: "moveCore", instanceId: helmia.instanceId, direction: "add" }) === null, "コア追加1")
    assert(act(s, "p1", { type: "moveCore", instanceId: helmia.instanceId, direction: "add" }) === null, "コア追加2")
    assert(helmia.cores === 3, "Lv2（cores3）に到達")

    const deckBefore = s.players.p1.deck.length
    const handBeforeAttack = s.players.p1.hand.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: helmia.instanceId }) === null, "ヘルミアでアタック")
    assert(s.players.p1.deck.length === deckBefore - 1, "アタック時にデッキから1枚ドロー")
    assert(s.players.p1.hand.length === handBeforeAttack + 1, "手札が1枚増えた")
}

console.log("=== BS03-023 人造生命体No.44 Lv2：呪撃＋ブロック勝利時に疲労 ===")
{
    const s = createGame(
        "bs03-023-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    assert(hasKeyword("BS03-023", "jugeki"), "人造生命体No.44は【呪撃】を持つ")
    const weakAttacker = createInstance("BS01-001", s.turn, 1) // ゴラドン：BP1000
    const bystander = createInstance("BS01-001", s.turn, 1) // 疲労付与の対象用
    const no44 = createInstance("BS03-023", s.turn, 4) // Lv2 cores4 bp7000
    s.players.p1.field.spirits.push(weakAttacker, bystander)
    s.players.p2.field.spirits.push(no44)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: weakAttacker.instanceId }) === null, "弱いゴラドンでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: no44.instanceId }) === null, "No.44でブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === weakAttacker.instanceId),
        "BPで負けたゴラドンが破壊された",
    )
    assert(bystander.isRested === true, "ブロック勝利でNo.44の効果により相手スピリット1体が疲労した")
}

console.log("=== BS03-105 暗礁海域 Lv2：自分のアタックステップにコスト2へ呪撃付与 ===")
{
    const s = createGame(
        "bs03-105-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const reef = createInstance("BS03-105", s.turn, 3) // 暗礁海域 Lv2 cores3
    const costTwoSpirit = createInstance("BS01-005", s.turn, 1) // アイバーン：コスト2・キーワードなし
    s.players.p1.field.nexuses.push(reef)
    s.players.p1.field.spirits.push(costTwoSpirit)

    assert(
        !spiritHasKeyword(s, "p1", costTwoSpirit, "jugeki"),
        "アタックステップ前は【呪撃】を持たない",
    )
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        spiritHasKeyword(s, "p1", costTwoSpirit, "jugeki"),
        "自分のアタックステップ中、コスト2のスピリットに【呪撃】が付与される",
    )
}
