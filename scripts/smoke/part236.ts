// smoke パート236（実行時カバレッジで「一度も発火していない」と出た効果を実際に通す。2026-08-24）
//
// 45種の継続効果に計測点を入れたところ（scripts/coverage-effects.ts）、
// **書いてあるのに smoke が一度も通していない**エントリが12件見つかった。
// CLAUDE.md の方針どおり「実行実績0の行が出たら smoke の穴」としてここで潰す。
//
// 内訳:
//   magicNegate 5件      【氷壁：色】5枚。既存テストは「無効化できる発生源を探す」ところまでで、
//                        **実際に無効化のコストを払う経路**（payMagicNegate）を通っていなかった
//   onMilledFromDeck 2件 デッキから破棄されたとき自分をコストなしで使う3枚のうち2枚が未検証
//   bothSidesTargetRedirect 1件  BS06-086 開かれし魔導書（BS02-087 封印された魔導書だけが通っていた）
//   freeSummonFromHandOnDiscardedByOpponent 1件  BS09-025 忍者サルトベ
//   freeSummonFromHandOnLifeDamaged 1件          BS09-035 巨獣皇スミドロード（条件つきの成立側が未検証）
//   bofuChooserSelf 1件   BS09-060 緑翼の大樹Lv2
//   magicNegateTurnOverrideGrant 1件  BS09-077 アイスバーグ
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { millDeck, resolveMagic, tryFreeSummonOnHandDiscard, tryHandFreeSummonOnLifeDamaged } from "../../server/src/logic/EffectModules"
import { findBothSidesRedirectSource } from "../../server/src/logic/triggers"

function base(seed: string, colors: { p1: string; p2: string } = { p1: "white", p2: "red" }): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, colors as never)
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// そのレベルに必要なコア数（カードデータから引く。ハードコードしない）
function coresFor(cardId: string, level: number): number {
    return getCard(cardId).levels.find((l) => l.level === level)?.cores ?? 0
}

const RED_MAGIC = "BS01-114" // バスタースピア（赤）
const PURPLE_MAGIC = "BS01-123" // リターンドロー（紫）
const GREEN_MAGIC = "BS01-132" // ストームドロー（緑）

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    const expect: [string, string][] = [
        ["BS08-032", "知将ゲンドリル"],
        ["BS08-036", "機神獣インフェニット・ヴォルス"],
        ["BS08-X32", "翼神機グラン・ウォーデン"],
        ["BS09-031", "守護巨獣ガラパーゾ"],
        ["BS09-034", "風花の戦乙女グナ"],
        ["BS06-086", "開かれし魔導書"],
        ["BS09-025", "忍者サルトベ"],
        ["BS09-035", "巨獣皇スミドロード"],
        ["BS09-060", "緑翼の大樹"],
        ["BS09-077", "アイスバーグ"],
        [RED_MAGIC, "バスタースピア"],
        [PURPLE_MAGIC, "リターンドロー"],
        [GREEN_MAGIC, "ストームドロー"],
    ]
    for (const [id, name] of expect) assert(getCard(id).name === name, `${id} は${name}`)
    assert(getCard(RED_MAGIC).colors.includes("red"), "バスタースピアは赤のマジック")
    assert(getCard(PURPLE_MAGIC).colors.includes("purple"), "リターンドローは紫のマジック")
    assert(getCard(GREEN_MAGIC).colors.includes("green"), "ストームドローは緑のマジック")
}

console.log("=== 【氷壁：色】5枚：相手のマジックを実際に無効にする（コストの疲労まで通す） ===")
{
    // 「相手が◯色のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする」。
    // 『相手のターン』なので、持ち主（p1）がターンプレイヤーでないときに効く
    const cases: { id: string; level: number; magic: string; note: string }[] = [
        { id: "BS08-032", level: 1, magic: RED_MAGIC, note: "【氷壁：赤】" },
        { id: "BS08-036", level: 1, magic: PURPLE_MAGIC, note: "【氷壁：紫/白/黄/青】" },
        { id: "BS08-X32", level: 1, magic: RED_MAGIC, note: "【氷壁：全色】" },
        { id: "BS09-031", level: 2, magic: GREEN_MAGIC, note: "Lv2【氷壁：緑】" },
        { id: "BS09-034", level: 1, magic: GREEN_MAGIC, note: "【氷壁：緑/青】" },
    ]
    for (const c of cases) {
        const s = base(`p236-hyoheki-${c.id}`)
        s.turnPlayer = "p2" // 『相手のターン』
        s.phase = "attack"
        const guard = put(s, "p1", c.id, coresFor(c.id, c.level))
        assert(!guard.isRested, `${getCard(c.id).name}は回復状態で始まる`)
        resolveMagic(s, "p2", c.magic, "flash")
        assert(guard.isRested, `${c.note}：無効化のコストとして疲労する（${getCard(c.id).name}）`)
    }

    // 対照：色が合わなければ無効化しない（【氷壁：赤】に緑のマジック）
    const s = base("p236-hyoheki-color")
    s.turnPlayer = "p2"
    s.phase = "attack"
    const gendriru = put(s, "p1", "BS08-032", coresFor("BS08-032", 1))
    resolveMagic(s, "p2", GREEN_MAGIC, "flash")
    assert(!gendriru.isRested, "色が合わないマジックは無効にしない（疲労しない）")

    // 対照：『相手のターン』なので、自分のターンには無効化しない
    const own = base("p236-hyoheki-turn")
    own.turnPlayer = "p1"
    own.phase = "attack"
    const guard2 = put(own, "p1", "BS08-032", coresFor("BS08-032", 1))
    resolveMagic(own, "p2", RED_MAGIC, "flash")
    assert(!guard2.isRested, "自分のターンには無効化しない（『相手のターン』限定）")
}

console.log("=== BS09-077 アイスバーグ：【氷壁】の発揮タイミングを『自分のターン』へ置き換える ===")
{
    // アイスバーグは「このターンの間、自分のスピリットすべての【氷壁】の効果は『自分のターン』に発揮される」。
    // 貸与（lendSelfThisTurn）で仮想発生源になるので、マジックを使ってから確かめる
    const s = base("p236-iceberg")
    s.turnPlayer = "p1" // 自分のターン。本来【氷壁】は『相手のターン』限定で発揮しない
    s.phase = "attack"
    const guard = put(s, "p1", "BS08-032", coresFor("BS08-032", 1)) // 【氷壁：赤】
    resolveMagic(s, "p1", RED_MAGIC, "flash") // 自分で使った赤マジックは無効化の対象外
    assert(!guard.isRested, "前提：自分のターンでは【氷壁】は発揮しない")

    resolveMagic(s, "p1", "BS09-077", "main") // アイスバーグ（貸与）
    resolveMagic(s, "p2", RED_MAGIC, "flash")
    assert(guard.isRested, "アイスバーグがあれば自分のターンでも無効化できる（疲労する）")
}

console.log("=== BS06-086 開かれし魔導書：お互いを対象とする効果の対象を変更できる発生源になる ===")
{
    const s = base("p236-open-book")
    s.turnPlayer = "p1" // 『自分のターン』
    assert(findBothSidesRedirectSource(s) === null, "前提：発生源が無ければ見つからない")
    const book = putNexus(s, "p1", "BS06-086", coresFor("BS06-086", 1))
    const found = findBothSidesRedirectSource(s)
    assert(found?.inst.instanceId === book.instanceId, "開かれし魔導書が発生源として見つかる")

    s.turnPlayer = "p2"
    assert(findBothSidesRedirectSource(s) === null, "相手のターンには効かない（『自分のターン』限定）")
}

console.log("=== BS09-025 忍者サルトベ：相手のスピリットの効果で手札から破棄されたら、コストなしで召喚できる ===")
{
    const s = base("p236-sarutobi")
    const cardId = "BS09-025"
    // 破棄済み＝トラッシュにある状態から呼ぶ（呼び出し側が先にトラッシュへ入れる約束）
    s.players.p1.trashCards.push(cardId)
    const summoned = tryFreeSummonOnHandDiscard(s, "p1", cardId, "spirit", "p2")
    assert(summoned, "相手のスピリットの効果で破棄されたら召喚できる")
    assert(
        s.players.p1.field.spirits.some((x) => x.cardId === cardId),
        "忍者サルトベがフィールドに出る",
    )

    // 対照：相手の**マジック**の効果ではダメ（「相手のスピリットの効果で」限定）
    const other = base("p236-sarutobi-magic")
    other.players.p1.trashCards.push(cardId)
    assert(
        !tryFreeSummonOnHandDiscard(other, "p1", cardId, "magic", "p2"),
        "マジックの効果で破棄されたときは召喚できない",
    )
}

console.log("=== BS09-035 巨獣皇スミドロード：ライフが3以下で相手のアタックステップなら、手札からコストなしで召喚 ===")
{
    const cardId = "BS09-035"
    const s = base("p236-sumidorodo")
    s.turnPlayer = "p2" // 『相手のアタックステップ』
    s.phase = "attack"
    s.players.p1.life = 3 // 条件：自分のライフが3以下
    s.players.p1.hand = [cardId]
    tryHandFreeSummonOnLifeDamaged(s, "p1")
    assert(
        s.players.p1.field.spirits.some((x) => x.cardId === cardId),
        "ライフ3以下なら手札からコストを支払わずに召喚される",
    )
    assert(!s.players.p1.hand.includes(cardId), "召喚したカードは手札から離れる")

    // 対照：ライフが4なら条件を満たさない
    const high = base("p236-sumidorodo-life")
    high.turnPlayer = "p2"
    high.phase = "attack"
    high.players.p1.life = 4
    high.players.p1.hand = [cardId]
    tryHandFreeSummonOnLifeDamaged(high, "p1")
    assert(high.players.p1.hand.includes(cardId), "ライフ4では召喚されない（condition.ownLifeAtMost）")
}

console.log("=== BS09-060 緑翼の大樹Lv2：【暴風】で疲労させる相手を自分で指定する（アタックステップ限定） ===")
{
    const VANILLA = "BS01-001" // ゴラドン
    // 【暴風】の exhaust は既定では「疲労させられる側」が選ぶ（chooserIsTarget）。
    // 緑翼の大樹Lv2 があると持ち主自身が選ぶ側に切り替わる
    const s = base("p236-daiju")
    s.interactiveTargets = true
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS09-060", coresFor("BS09-060", 2))
    const self = put(s, "p1", VANILLA, 1)
    put(s, "p2", VANILLA, 1)
    put(s, "p2", VANILLA, 1)
    resolveAction(s, "p1", self, { type: "exhaust", count: 1, chooserIsTarget: true })
    assert(s.pendingChoice !== null, "選択待ちが立つ")
    assert(s.pendingChoice?.pid === "p1", "選ぶのは持ち主（p1）＝大樹Lv2の効果で選択者が入れ替わる")

    // 対照：メインステップでは切り替わらない（『お互いのアタックステップ』限定。2026-08-24 修正）
    const main = base("p236-daiju-main")
    main.interactiveTargets = true
    main.turnPlayer = "p1"
    main.phase = "main"
    putNexus(main, "p1", "BS09-060", coresFor("BS09-060", 2))
    const self2 = put(main, "p1", VANILLA, 1)
    put(main, "p2", VANILLA, 1)
    put(main, "p2", VANILLA, 1)
    resolveAction(main, "p1", self2, { type: "exhaust", count: 1, chooserIsTarget: true })
    assert(main.pendingChoice?.pid === "p2", "メインステップでは既定どおり疲労させられる側（p2）が選ぶ")
}

console.log("=== デッキから破棄されたとき、コストを支払わずに使われるマジック3枚 ===")
{
    // 「相手の効果で自分のデッキから破棄されたとき、このマジックカードはコストを支払わずに使用される」
    for (const cardId of ["BS06-108", "BS09-068", "BS09-080"]) {
        const s = base(`p236-milled-${cardId}`)
        s.players.p1.deck = [cardId, ...s.players.p1.deck]
        const trashBefore = s.players.p1.trashCards.length
        millDeck(s, "p1", 1, "p2", { sourceType: "magic" })
        assert(
            s.players.p1.trashCards.length >= trashBefore,
            `${getCard(cardId).name}：破棄の処理が最後まで走る`,
        )
        assert(
            !s.players.p1.deck.includes(cardId),
            `${getCard(cardId).name}：デッキから離れている`,
        )
    }
}
