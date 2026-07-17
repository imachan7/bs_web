// smoke パート8（BS02構造化バッチ7：系統付与＋手札からの無料召喚）
// 収録セクション:
//   - BS02-054 ポム：Lv1は自分のアタックステップ中のみ道化スピリット+1000（kind:aura familyFilter）
//     Lv2は黄3つ以上で道化以外にも系統「道化」を付与→オーラの対象になる（kind:familyGrant）
//   - BS02-082 生み出される尖兵：お互いのアタックステップ中、コスト2の白スピリットに
//     系統「武装」を付与する（kind:familyGrant、colorFilter/costFilter/phase）
//   - BS02-034 老賢樹トレントン／BS02-048 竜戦車アースガルド：召喚時に手札のスピリット1枚を
//     コストを支払わずに召喚する（onSummon効果は発揮されない。kind:triggered summonFromHandFree）
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectiveBp,
    runTurnStart,
    spiritHasFamily,
} from "./helpers"

console.log("=== BS02-054 ポム Lv1：自分のアタックステップ中のみ道化スピリットをBP+1000 ===")
{
    const s = createGame(
        "bs02-pom-lv1-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const pom = createInstance("BS02-054", s.turn, 1) // Lv1
    const clown = createInstance("BS02-060", s.turn, 1) // 道化師クラン（系統:道化）
    s.players.p1.field.spirits.push(pom, clown)

    assert(
        effectiveBp(s, "p1", clown) === currentLevel(clown).bp,
        "メインステップ中は道化師クランのBPは変わらない",
    )
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        effectiveBp(s, "p1", clown) === currentLevel(clown).bp + 1000,
        "自分のアタックステップ中、道化師クランはBP+1000される",
    )
    assert(
        effectiveBp(s, "p1", pom) === currentLevel(pom).bp,
        "道化を持たないポム自身のBPは変わらない",
    )
}

console.log("=== BS02-054 ポム Lv2：黄3つ以上で道化以外にも系統「道化」が付与される ===")
{
    const s = createGame(
        "bs02-pom-lv2-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const pom = createInstance("BS02-054", s.turn, 3) // Lv2
    const piyon1 = createInstance("BS02-049", s.turn, 1) // 黄
    const piyon2 = createInstance("BS02-049", s.turn, 1) // 黄
    const goradon = createInstance("BS01-001", s.turn, 1) // 赤・非道化
    s.players.p1.field.spirits.push(pom, piyon1, piyon2, goradon)

    assert(
        spiritHasFamily(s, "p1", goradon, "道化"),
        "黄のスピリットが3つ以上（ポム＋ピヨン2体）あるとき、ゴラドンにも系統「道化」が付与される",
    )
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        effectiveBp(s, "p1", goradon) === currentLevel(goradon).bp + 1000,
        "系統付与によりゴラドンもアタックステップ中BP+1000の対象になる",
    )

    s.players.p1.field.spirits = s.players.p1.field.spirits.filter((i) => i !== piyon2)
    assert(
        !spiritHasFamily(s, "p1", goradon, "道化"),
        "黄が2つ（ポム＋ピヨン1体）に減ると系統付与は成立しない",
    )
    assert(
        effectiveBp(s, "p1", goradon) === currentLevel(goradon).bp,
        "系統付与が外れるとゴラドンのBPは元に戻る",
    )
}

console.log("=== BS02-082 生み出される尖兵：アタックステップ中コスト2の白スピリットに系統「武装」を付与 ===")
{
    const s = createGame(
        "bs02-sentinel-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const sentinel = createInstance("BS02-082", s.turn, 0) // Lv1（ネクサス、コア0）
    const babyRoki = createInstance("BS01-077", s.turn, 1) // コスト2の白（系統:動器）
    s.players.p1.field.nexuses.push(sentinel)
    s.players.p1.field.spirits.push(babyRoki)

    assert(
        !spiritHasFamily(s, "p1", babyRoki, "武装"),
        "メインステップ中は系統「武装」が付与されない",
    )
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        spiritHasFamily(s, "p1", babyRoki, "武装"),
        "アタックステップ中、コスト2の白のベビー・ロキは系統「武装」を持つ扱いになる",
    )
}

console.log("=== BS02-034 老賢樹トレントン：召喚時に手札の緑スピリット（コスト最大）を無料召喚 ===")
{
    const s = createGame(
        "bs02-trenton-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    // エイプウィップ（緑・コスト4・onSummon:coreGain）とマッチュラ（緑・コスト3）を候補に用意し、
    // コスト最大のエイプウィップが選ばれること、かつその onSummon（コアゲイン）が発揮されないことを確認する
    s.players.p1.hand = ["BS02-034", "BS01-061", "BS01-056"]
    s.players.p1.reserve = 20

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "老賢樹トレントンを召喚")
    assert(s.players.p1.field.spirits.length === 2, "トレントン自身＋無料召喚された1体で2体になる")
    assert(
        s.players.p1.field.spirits.some((i) => i.cardId === "BS01-061"),
        "コスト最大のエイプウィップが無料召喚される（コスト3のマッチュラではない）",
    )
    assert(
        s.players.p1.hand.length === 1 && s.players.p1.hand[0] === "BS01-056",
        "召喚に使われなかったマッチュラだけが手札に残る",
    )
    assert(
        s.players.p1.reserve === 20 - 7 - 1,
        "コスト6+維持1（トレントン）と維持1（エイプウィップ）のみ消費（エイプウィップのonSummon:coreGainは発揮されないため+1されない）",
    )
}

console.log("=== BS02-034 老賢樹トレントン：リザーブ不足なら無料召喚は不発 ===")
{
    const s = createGame(
        "bs02-trenton-insufficient-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.hand = ["BS02-034", "BS01-061"]
    s.players.p1.reserve = 7 // トレントン自身のコスト6+維持1でちょうど使い切る

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "老賢樹トレントンを召喚")
    assert(s.players.p1.reserve === 0, "リザーブを使い切った")
    assert(
        s.players.p1.field.spirits.length === 1,
        "リザーブ不足のため無料召喚は発動せず、トレントンのみが場に出る",
    )
    assert(
        s.players.p1.hand.length === 1 && s.players.p1.hand[0] === "BS01-061",
        "エイプウィップは手札に残ったまま",
    )
}

console.log("=== BS02-048 竜戦車アースガルド：同系統（機獣）の手札カードだけが無料召喚される ===")
{
    const s = createGame(
        "bs02-earthguard-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    // ライオライダー（白・コスト4・系統:機獣）とモノケイロス（緑・コスト5・系統:殻人）を候補に用意する。
    // モノケイロスの方がコストが高いが系統が異なるため選ばれず、機獣のライオライダーが選ばれることを確認する
    s.players.p1.hand = ["BS02-048", "BS02-041", "BS01-070"]
    s.players.p1.reserve = 20

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "竜戦車アースガルドを召喚")
    assert(
        s.players.p1.field.spirits.some((i) => i.cardId === "BS02-041"),
        "同系統（機獣）のライオライダーが無料召喚される",
    )
    assert(
        s.players.p1.hand.length === 1 && s.players.p1.hand[0] === "BS01-070",
        "系統が異なるモノケイロス（コストはより高い）は召喚されず手札に残る",
    )
}
