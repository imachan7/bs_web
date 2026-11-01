// smoke パート734（BS19-green：BS19-024/025/027/028/029/030/032/033/071 の期待値場面テスト）
// 効果文とカードの属性だけから書く（docs/design/BS19_PLAN.md §2・SEMANTICS_AUDIT §3.23〜3.25・PROMO_PLAN §2・CONJUNCTION.md）。
// 【強化】の行（BS19-029 Lv2）は part726 担当なのでここでは見ない。【連鎖】は「青シンボルがあるとき／無いとき」の2場面を書く。
// BS19 の effects はまだ空なので、実装前にこの part は落ちてよい（落ちないことを確認して直すのは実装役）。
import { scenario, type ScenarioCtx } from "./scenario"
import { assert, getCard } from "./helpers"

// ── 脇役（data/cards の既存弾。BS19 は effects がまだ空なので脇役にしない）──
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const MACHAFRY = "BS03-029" // マッハフライ（緑・コスト3・怪虫・バニラ）
const DIOMANTIS = "BS08-020" // ディオ・マンティス（緑・コスト2・怪虫・バニラ）
const KAMOMEVE = "BS10-024" // カモメーヴェ（緑・コスト3・爪鳥・バニラ）
const STAGGER = "BS12-041" // スタッガー（青・コスト1・異合・バニラ。青シンボルの源）
const FRUIT = "BS01-107" // 命の果実（緑・コスト4・ネクサス。自分のライフが減らない場面では無効）
const AQUIRIES = "BS01-069" // 征空の翼アクィリーズ（緑・コスト5・爪鳥。『召喚時』ボイド→自分のスピリット1体）
const STATUE = "BS03-073" // ストン・スタチュー（青・コスト1・造兵。『召喚時』相手のデッキを1枚破棄）
const BEAMBEETLE = "BS10-068" // ビーム・ビートル（緑・コスト4・ブレイヴ。合体条件：コスト4以上）
const BENKEI = "BS14-030" // グラント・ベンケイ（緑・コスト5。バースト：自分のライフ減少後→相手は手札1枚を破棄、このカードを手札に戻す）

console.log("=== 前提: カードの機械確認 ===")
{
    const check = (id: string, name: string, type: string, colors: string, family: string[] | null, cost: number) => {
        const c = getCard(id)
        assert(
            c.name === name && c.type === type && c.colors.join("/") === colors &&
                (family === null || c.family.join("/") === family.join("/")) && c.cost === cost,
            `${id} は ${name}（${type}・${colors}・${family ? family.join("/") : "系統なし"}・コスト${cost}）`,
        )
    }
    // 担当9枚
    check("BS19-024", "ダーク・マッハジー", "spirit", "green", ["怪虫"], 2)
    check("BS19-025", "ダーク・ディオマンティス", "spirit", "green", ["怪虫"], 3)
    check("BS19-027", "オウゴンオニクワガー", "spirit", "green", ["殻虫", "怪虫"], 4)
    check("BS19-028", "ハゴロモチョウ", "spirit", "green", ["怪虫"], 4)
    check("BS19-029", "キガシライト", "spirit", "green", ["爪鳥"], 4)
    check("BS19-030", "オウギ・エンショー", "spirit", "green", ["華兵", "爪鳥"], 5)
    check("BS19-032", "葉滅蜻蛉ハビロング", "spirit", "green", ["怪虫"], 6)
    check("BS19-033", "十剣聖ムラサメ", "spirit", "green", ["剣使", "爪鳥"], 7)
    check("BS19-071", "バンブール", "brave", "green", ["樹魔"], 3)
    // 脇役
    check(VANILLA, "ロクケラトプス", "spirit", "red", ["地竜"], 1)
    check(MACHAFRY, "マッハフライ", "spirit", "green", ["怪虫"], 3)
    check(DIOMANTIS, "ディオ・マンティス", "spirit", "green", ["怪虫"], 2)
    check(KAMOMEVE, "カモメーヴェ", "spirit", "green", ["爪鳥"], 3)
    check(STAGGER, "スタッガー", "spirit", "blue", ["異合"], 1)
    check(FRUIT, "命の果実", "nexus", "green", [], 4)
    check(AQUIRIES, "征空の翼アクィリーズ", "spirit", "green", ["爪鳥"], 5)
    check(STATUE, "ストン・スタチュー", "spirit", "blue", ["造兵"], 1)
    check(BEAMBEETLE, "ビーム・ビートル", "brave", "green", ["殻虫"], 4)
    check(BENKEI, "グラント・ベンケイ", "spirit", "green", ["覇皇", "殻虫"], 5)
    // バーストの文言確認（グラント・ベンケイは「ライフ減少後」トリガーで使う）
    assert(getCard(BENKEI).effect.includes("【バースト：自分のライフ減少後】"), "グラント・ベンケイはライフ減少後バースト")
}

// ── 対話の応答。「〜できる」の確認は1つ目の選択肢＝発動、数値のステッパーは numeric、
//    対象は target を1回だけ選び、それ以降と card は card を1回だけ選び、それ以降はスキップ ──
interface Want {
    numeric?: string // ステッパー（"0"〜"N"）で選ぶ個数
    target?: string // kind:"target" で1回だけ選ぶ対象のラベル（「自分.X」）
    card?: string // kind:"card" で1回だけ選ぶ手札の cardId
    decline?: boolean // 確認を断る（スキップ）
}
function answer(t: ScenarioCtx, want: Want): void {
    let targetUsed = false
    let cardUsed = false
    let numericUsed = false
    for (let i = 0; i < 30 && t.state.pendingChoice !== null; i++) {
        const pc = t.state.pendingChoice
        if (pc.pid !== t.me) return // 相手への選択はここでは答えない
        if (pc.kind === "option") {
            const opts = pc.options ?? []
            const numeric = opts.length > 0 && opts.every((o) => /^[0-9]+$/.test(o))
            if (want.decline) {
                t.act("me", { type: "resolveChoice" })
            } else if (numeric) {
                t.act("me", { type: "resolveChoice", option: numericUsed ? "0" : (want.numeric ?? "1") })
                numericUsed = true
            } else {
                const first = opts[0]
                if (first === undefined) return
                t.act("me", { type: "resolveChoice", option: first })
            }
        } else if (pc.kind === "target") {
            if (want.target !== undefined && !targetUsed) {
                targetUsed = true
                t.act("me", { type: "resolveChoice", instanceId: t.id(want.target) })
            } else {
                t.act("me", { type: "resolveChoice" })
            }
        } else if (pc.kind === "card") {
            if (want.card !== undefined && !cardUsed) {
                cardUsed = true
                const idx = t.state.players[t.me].hand.indexOf(want.card)
                t.act("me", { type: "resolveChoice", cardIndex: idx })
            } else {
                t.act("me", { type: "resolveChoice" })
            }
        } else {
            return
        }
    }
}

// ════════════════ BS19-024 ダーク・マッハジー ════════════════
// 節1 フラッシュ【神速】／節2 【連鎖：条件《青シンボル》】[青]：コスト2以下の相手のスピリット1体を破壊する
// 神速はフラッシュのタイミングでリザーブからコストとコアを払って手札から召喚できる（キーワード単独の行→働く1場面）。
// 連鎖元はこの神速召喚。青シンボルがあれば破壊が続く（Q773〜776）。

scenario({
    name: "024-shinsoku-no-blue",
    // 自分のアタックのフラッシュで神速召喚。青シンボルが無いので連鎖しない
    start: {
        me: { hand: ["BS19-024"], spirits: [{ card: VANILLA, label: "ロクケラトプス" }] },
        opp: { spirits: [{ card: VANILLA, label: "ロクケラトプス" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ロクケラトプス") })
        t.act("me", { type: "summon", handIndex: 0 }) // フラッシュで【神速】召喚（コスト2＋コア1をリザーブから）
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.手札: ダーク・マッハジー → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 2",
        "自分.ダーク・マッハジー.場所: なし → フィールド",
        "自分.ダーク・マッハジー.疲労: なし → false",
        "自分.ダーク・マッハジー.コア: なし → 1",
        "自分.ダーク・マッハジー.Lv: なし → 1",
        "自分.ダーク・マッハジー.BP: なし → 2000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

scenario({
    name: "024-rensu-destroy",
    // 青シンボル（スタッガー）があるので、神速召喚に続けてコスト2以下の相手のスピリット1体を破壊する
    start: {
        me: { hand: ["BS19-024"], spirits: [{ card: VANILLA, label: "ロクケラトプス" }, { card: STAGGER, label: "スタッガー" }] },
        opp: { spirits: [{ card: VANILLA, label: "ロクケラトプス" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ロクケラトプス") })
        t.act("me", { type: "summon", handIndex: 0 })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.手札: ダーク・マッハジー → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 2",
        "自分.ダーク・マッハジー.場所: なし → フィールド",
        "自分.ダーク・マッハジー.疲労: なし → false",
        "自分.ダーク・マッハジー.コア: なし → 1",
        "自分.ダーク・マッハジー.Lv: なし → 1",
        "自分.ダーク・マッハジー.BP: なし → 2000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12", // 破壊されたコア1個＋ライフのコア1個
        "相手.ライフ: 5 → 4",
    ],
})

// ════════════════ BS19-025 ダーク・ディオマンティス ════════════════
// 節1 Lv1〜3『このスピリットのアタック時』自分のスピリットのコア3個までを自分のリザーブに置くことができる
// 節2 【連鎖：条件《青シンボル》】[青]：このスピリットは最高Lvとして扱う

scenario({
    name: "025-core-to-reserve",
    // アタック時にマッハフライのコア1個をリザーブへ置く（青シンボルが無いので連鎖しない）
    start: {
        interactive: true,
        me: {
            spirits: [{ card: "BS19-025", label: "ディオマンティス" }, { card: MACHAFRY, label: "マッハフライ", cores: 3 }],
        },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ディオマンティス") })
        answer(t, { numeric: "1", target: "自分.マッハフライ" }) // 発動し、コア1個をマッハフライからリザーブへ
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ディオマンティス.疲労: false → true",
        "自分.マッハフライ.コア: 3 → 2",
        "自分.マッハフライ.Lv: 2 → 1",
        "自分.マッハフライ.BP: 3000 → 2000",
        "自分.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

scenario({
    name: "025-rensu-maxlevel",
    // 青シンボルがあるので、アタック時に続けて最高Lv（Lv3・BP7000）として扱う。
    // BP5000のブロッカーに勝って、ブロッカーだけが破壊される
    start: {
        interactive: true,
        me: {
            spirits: [
                { card: "BS19-025", label: "ディオマンティス" },
                { card: MACHAFRY, label: "マッハフライ", cores: 3 },
                { card: STAGGER, label: "スタッガー" },
            ],
        },
        opp: { spirits: [{ card: DIOMANTIS, label: "ディオ・マンティス", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ディオマンティス") })
        answer(t, { numeric: "1", target: "自分.マッハフライ" })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.ディオ・マンティス") })
        t.closeFlash()
    },
    expect: [
        "自分.ディオマンティス.疲労: false → true",
        "自分.マッハフライ.コア: 3 → 2",
        "自分.マッハフライ.Lv: 2 → 1",
        "自分.マッハフライ.BP: 3000 → 2000",
        "自分.リザーブ: 10 → 11",
        "相手.ディオ・マンティス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ディオ・マンティス",
        "相手.リザーブ: 10 → 13", // 破壊されたブロッカーのコア3個
    ],
})

scenario({
    name: "025-no-blue-destroyed",
    // 青シンボルが無ければ最高Lvにならない。Lv1（BP3000）のまま BP5000 に破壊される
    start: {
        interactive: true,
        me: {
            spirits: [{ card: "BS19-025", label: "ディオマンティス" }, { card: MACHAFRY, label: "マッハフライ", cores: 3 }],
        },
        opp: { spirits: [{ card: DIOMANTIS, label: "ディオ・マンティス", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ディオマンティス") })
        answer(t, { decline: true }) // コア移しは断る
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.ディオ・マンティス") })
        t.closeFlash()
    },
    expect: [
        "自分.ディオマンティス.場所: フィールド → なし",
        "自分.トラッシュ: なし → ダーク・ディオマンティス",
        "自分.リザーブ: 10 → 11", // 破壊されたディオマンティスのコア1個
        "相手.ディオ・マンティス.疲労: false → true",
    ],
})

// ════════════════ BS19-027 オウゴンオニクワガー ════════════════
// 節1 Lv1･Lv2『このスピリットのアタック時』ボイドからコア1個を自分のリザーブに置く
// 節2 Lv2『このスピリットのアタック時』自分のターンの最初のアタックのとき、このスピリットは回復する

scenario({
    name: "027-void-core-lv1",
    // Lv1 のアタック時：ボイドからリザーブへ +1（回復は Lv2 だけなので疲労のまま）。
    // コアを動かす効果なので、ソウルコアをリザーブに置いた場面で見る（ソウルコアはリザーブのまま）
    start: {
        me: { soulCore: "リザーブ", spirits: [{ card: "BS19-027", label: "オニクワガー" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.オニクワガー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.オニクワガー.疲労: false → true",
        "自分.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

scenario({
    name: "027-lv2-refresh",
    // Lv2 で最初のアタック：疲労してから回復するので、最後は疲労していない（差分に疲労行が出ない）
    start: {
        me: { spirits: [{ card: "BS19-027", label: "オニクワガー", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.オニクワガー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ════════════════ BS19-028 ハゴロモチョウ ════════════════
// 節1 フラッシュ【神速】／節2 Lv1･Lv2『このスピリットの召喚時』系統：「怪虫」を持つ自分のスピリット1体を回復させる

scenario({
    name: "028-shinsoku-refresh-kaichu",
    // 自分のアタックのフラッシュで神速召喚し、その召喚時で疲労している怪虫（マッハフライ）を回復させる
    start: {
        interactive: true,
        me: {
            hand: ["BS19-028"],
            spirits: [
                { card: VANILLA, label: "ロクケラトプス" },
                { card: MACHAFRY, label: "マッハフライ", rested: true },
            ],
        },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ロクケラトプス") })
        t.act("me", { type: "summon", handIndex: 0 }) // 神速（緑1シンボルでコスト4-1=3、コア1個）
        answer(t, { target: "自分.マッハフライ" }) // 召喚時：回復させる怪虫は自分で選ぶ（候補に自身も入る）
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.マッハフライ.疲労: true → false",
        "自分.手札: ハゴロモチョウ → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.ハゴロモチョウ.場所: なし → フィールド",
        "自分.ハゴロモチョウ.疲労: なし → false",
        "自分.ハゴロモチョウ.コア: なし → 1",
        "自分.ハゴロモチョウ.Lv: なし → 1",
        "自分.ハゴロモチョウ.BP: なし → 2000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

scenario({
    name: "028-refresh-not-kaichu",
    // メインステップで通常召喚。場にいる疲労スピリットが怪虫でなければ回復しない
    start: {
        me: { hand: ["BS19-028"], spirits: [{ card: VANILLA, label: "ロクケラトプス", rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // 緑シンボルが無いのでコスト4
    },
    expect: [
        "自分.手札: ハゴロモチョウ → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ハゴロモチョウ.場所: なし → フィールド",
        "自分.ハゴロモチョウ.疲労: なし → false",
        "自分.ハゴロモチョウ.コア: なし → 1",
        "自分.ハゴロモチョウ.Lv: なし → 1",
        "自分.ハゴロモチョウ.BP: なし → 2000",
        // ロクケラトプス（地竜）は疲労したまま → 疲労の差分なし
    ],
})

// ════════════════ BS19-029 キガシライト ════════════════
// 節1 Lv1･Lv2：お互いのデッキは破棄されない（【強化】は part726）
// 相手のストン・スタチューの『召喚時』（相手＝自分のデッキを1枚破棄）で見る

scenario({
    name: "029-deck-protected",
    // キガシライトがいる間、相手のデッキ破棄効果でも自分のデッキは破棄されない
    start: {
        turn: "opp",
        me: { spirits: [{ card: "BS19-029", label: "キガシライト" }] },
        opp: { hand: [STATUE] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: [
        "相手.手札: ストン・スタチュー → なし",
        "相手.リザーブ: 10 → 8",
        "相手.トラッシュのコア: 0 → 1",
        "相手.ストン・スタチュー.場所: なし → フィールド",
        "相手.ストン・スタチュー.疲労: なし → false",
        "相手.ストン・スタチュー.コア: なし → 1",
        "相手.ストン・スタチュー.Lv: なし → 1",
        "相手.ストン・スタチュー.BP: なし → 2000",
        // 自分.デッキ枚数・トラッシュに変化なし＝破棄が止まっている
    ],
})

scenario({
    name: "029-no-protection",
    // キガシライトがいなければデッキは破棄される（条件を1つ外す）
    start: {
        turn: "opp",
        opp: { hand: [STATUE] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: [
        "相手.手札: ストン・スタチュー → なし",
        "相手.リザーブ: 10 → 8",
        "相手.トラッシュのコア: 0 → 1",
        "相手.ストン・スタチュー.場所: なし → フィールド",
        "相手.ストン・スタチュー.疲労: なし → false",
        "相手.ストン・スタチュー.コア: なし → 1",
        "相手.ストン・スタチュー.Lv: なし → 1",
        "相手.ストン・スタチュー.BP: なし → 2000",
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュ: なし → ロクケラトプス",
    ],
})

// ════════════════ BS19-030 オウギ・エンショー ════════════════
// 節1 Lv1〜3『このスピリットの召喚時』手札の系統：「華兵」/「爪鳥」のスピリットカード1枚をコストを支払わずに召喚できる。
//      ただし、そのスピリットの『このスピリットの召喚時』効果は発揮されない

scenario({
    name: "030-free-summon-no-trigger",
    // 召喚時：手札の爪鳥（征空の翼アクィリーズ）を無償召喚するが、アクィリーズの『召喚時』（ボイド→コア1個）は発揮されない
    start: {
        interactive: true,
        me: { hand: ["BS19-030", AQUIRIES] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // コスト5（緑シンボル無し）
        answer(t, { card: AQUIRIES }) // 発動し、手札から爪鳥1枚を選ぶ
    },
    expect: [
        "自分.手札: オウギ・エンショー、征空の翼アクィリーズ → なし",
        "自分.リザーブ: 10 → 3", // エンショーのコスト5＋コア1、アクィリーズはコスト不要でコア1個だけ
        "自分.トラッシュのコア: 0 → 5",
        "自分.オウギ・エンショー.場所: なし → フィールド",
        "自分.オウギ・エンショー.疲労: なし → false",
        "自分.オウギ・エンショー.コア: なし → 1",
        "自分.オウギ・エンショー.Lv: なし → 1",
        "自分.オウギ・エンショー.BP: なし → 4000",
        "自分.征空の翼アクィリーズ.場所: なし → フィールド",
        "自分.征空の翼アクィリーズ.疲労: なし → false",
        "自分.征空の翼アクィリーズ.コア: なし → 1",
        "自分.征空の翼アクィリーズ.Lv: なし → 1",
        "自分.征空の翼アクィリーズ.BP: なし → 4000",
        // アクィリーズの『召喚時』が発揮されない＝コアやリザーブにそれ以上の変化がない
    ],
})

scenario({
    name: "030-no-kahei-chouchi",
    // 手札に華兵/爪鳥がいなければ、無償召喚は起きない（条件を1つ外す）
    start: {
        me: { hand: ["BS19-030", VANILLA] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: オウギ・エンショー、ロクケラトプス → ロクケラトプス",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.オウギ・エンショー.場所: なし → フィールド",
        "自分.オウギ・エンショー.疲労: なし → false",
        "自分.オウギ・エンショー.コア: なし → 1",
        "自分.オウギ・エンショー.Lv: なし → 1",
        "自分.オウギ・エンショー.BP: なし → 4000",
    ],
})

// ════════════════ BS19-032 葉滅蜻蛉ハビロング ════════════════
// 節1 Lv1･Lv2『このスピリットのアタック時』BPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個を相手のリザーブに置く
// 節2 【連鎖：条件《青シンボル》】[青]：ターンに1回、自分のネクサス1つを疲労させることで、このスピリットは回復する

scenario({
    name: "032-battle-destroy-life-core",
    // BPを比べて相手だけを破壊したので、相手のライフのコア1個が相手のリザーブに置かれる
    start: {
        me: { spirits: [{ card: "BS19-032", label: "ハビロング" }] },
        opp: { spirits: [{ card: VANILLA, label: "ロクケラトプス" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ハビロング") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.ハビロング.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12", // 破壊されたコア1個＋ライフから移ったコア1個
        "相手.ライフ: 5 → 4",
    ],
})

scenario({
    name: "032-unblocked-no-condition",
    // ブロックされなければ「BPを比べ破壊」が起きない（節1の条件外し）＋青シンボルが無いので連鎖もしない（節2の条件外し）
    start: {
        me: { spirits: [{ card: "BS19-032", label: "ハビロング" }] },
        opp: { spirits: [{ card: VANILLA, label: "ロクケラトプス" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ハビロング") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ハビロング.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        // ライフからリザーブへの追加移動は無い。相手のロクケラトプスもそのまま
    ],
})

scenario({
    name: "032-rensu-rest-nexus-refresh",
    // 青シンボルがあるので、アタック時に続けて自分のネクサス1つを疲労させることでハビロングが回復する
    start: {
        interactive: true,
        me: {
            spirits: [{ card: "BS19-032", label: "ハビロング" }, { card: STAGGER, label: "スタッガー" }],
            nexuses: [{ card: FRUIT, label: "命の果実" }],
        },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ハビロング") })
        answer(t, { target: "自分.命の果実" }) // 連鎖の「ネクサスを疲労させて回復」を発動
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.命の果実.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        // ハビロングは疲労してから回復するので、差分に疲労行は出ない
    ],
})

// ════════════════ BS19-033 十剣聖ムラサメ ════════════════
// 節1 Lv1･Lv2『このスピリットのアタック時』相手のスピリット1体を疲労させる
// 節2 【合体時】Lv1･Lv2：系統：「爪鳥」を持つ自分のスピリットすべてに『このスピリットのバトル時』相手はバーストを発動できない、を与える
// 節3 Lv2『このスピリットのアタック時』自分のターンの最初のアタックのとき、このスピリットは回復する

scenario({
    name: "033-lv2-first-attack-refresh",
    // Lv2 で最初のアタック：相手のスピリットを疲労させ（節1）、自分は疲労してから回復する（節3）
    start: {
        me: { spirits: [{ card: "BS19-033", label: "ムラサメ", cores: 3 }] },
        opp: { spirits: [{ card: VANILLA, label: "ロクケラトプス" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ムラサメ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        // ムラサメは回復するので疲労の差分なし
    ],
})

scenario({
    name: "033-lv1-no-refresh",
    // Lv1 では回復しない（節3の条件外し）。疲労効果（節1）は Lv1 でも発揮される
    start: {
        me: { spirits: [{ card: "BS19-033", label: "ムラサメ" }] },
        opp: { spirits: [{ card: VANILLA, label: "ロクケラトプス" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ムラサメ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ムラサメ.疲労: false → true",
        "相手.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

scenario({
    name: "033-grant-block-burst",
    // 合体時：爪鳥（カモメーヴェ）のバトル中、相手はライフ減少後のバースト（グラント・ベンケイ）を発動できない
    start: {
        me: {
            spirits: [
                { card: "BS19-033", label: "ムラサメ" },
                { card: BEAMBEETLE, label: "ビーム・ビートル" },
                { card: KAMOMEVE, label: "カモメーヴェ" },
            ],
        },
        opp: { burst: BENKEI },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("自分.ビーム・ビートル"), hostInstanceId: t.id("自分.ムラサメ") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.カモメーヴェ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ビーム・ビートル.場所: フィールド → 合体",
        "自分.ビーム・ビートル.コア: 1 → 0",
        "自分.ビーム・ビートル.BP: 2000 → なし",
        "自分.ムラサメ.コア: 1 → 2", // スピリット状態のブレイヴが載せていたコアは合体スピリット（ホスト）へ集約
        "自分.ムラサメ.BP: 5000 → 7000", // 合体スピリットのBP＝ホスト＋ブレイヴ
        "自分.カモメーヴェ.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        // 相手.バースト・手札に変化なし＝バーストが発動できずセットされたまま
    ],
})

scenario({
    name: "033-grant-not-toride",
    // 攻撃したスピリットが爪鳥でなければ付与された禁止は効かない（条件を1つ外す）→ バーストが発動する
    start: {
        me: {
            hand: [VANILLA],
            spirits: [
                { card: "BS19-033", label: "ムラサメ" },
                { card: BEAMBEETLE, label: "ビーム・ビートル" },
                { card: VANILLA, label: "ロクケラトプス" },
            ],
        },
        opp: { burst: BENKEI },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("自分.ビーム・ビートル"), hostInstanceId: t.id("自分.ムラサメ") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        // 相手のバーストが発動する：自分は手札1枚を破棄し、バーストカードは相手の手札に戻る
    },
    expect: [
        "自分.ビーム・ビートル.場所: フィールド → 合体",
        "自分.ビーム・ビートル.コア: 1 → 0",
        "自分.ビーム・ビートル.BP: 2000 → なし",
        "自分.ムラサメ.コア: 1 → 2", // スピリット状態のブレイヴが載せていたコアは合体スピリット（ホスト）へ集約
        "自分.ムラサメ.BP: 5000 → 7000",
        "自分.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "相手.バースト: グラント・ベンケイ → なし",
        "相手.手札: なし → グラント・ベンケイ",
        "自分.手札: ロクケラトプス → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
    ],
})

// ════════════════ BS19-071 バンブール（ブレイヴ） ════════════════
// 節1 Lv1『このブレイヴの召喚時』相手のスピリット1体を疲労させる
// 節2 【合体時】『このスピリットの合体アタック時』相手のスピリット1体を疲労させる

scenario({
    name: "071-summon-fatigue",
    // ブレイヴをスピリット状態で召喚したとき、相手のスピリット1体を疲労させる
    start: {
        me: { hand: ["BS19-071"] },
        opp: { spirits: [{ card: VANILLA, label: "ロクケラトプス" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // コスト3（緑シンボル無し）
    },
    expect: [
        "自分.手札: バンブール → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.バンブール.場所: なし → フィールド",
        "自分.バンブール.疲労: なし → false",
        "自分.バンブール.コア: なし → 1",
        "自分.バンブール.Lv: なし → 1",
        "自分.バンブール.BP: なし → 2000",
        "相手.ロクケラトプス.疲労: false → true",
    ],
})

scenario({
    name: "071-spirit-attack-no-fatigue",
    // 合体していなければ『合体アタック時』は起きない（節2の条件外し）。
    // ホスト（マッハフライ）がブレイヴを合体させずにアタックしても、相手のスピリットは疲労しない
    start: {
        me: { spirits: [{ card: MACHAFRY, label: "マッハフライ" }, { card: "BS19-071", label: "バンブール" }] },
        opp: { spirits: [{ card: VANILLA, label: "ロクケラトプス" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.マッハフライ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.マッハフライ.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        // 相手.ロクケラトプス.疲労の差分なし＝疲労効果が起きていない
    ],
})

scenario({
    name: "071-combined-attack-fatigue",
    // コスト3以上のマッハフライに合体してアタックしたとき、相手のスピリット1体を疲労させる
    start: {
        me: {
            spirits: [
                { card: MACHAFRY, label: "マッハフライ" },
                { card: "BS19-071", label: "バンブール" },
            ],
        },
        opp: { spirits: [{ card: VANILLA, label: "ロクケラトプス" }] },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("自分.バンブール"), hostInstanceId: t.id("自分.マッハフライ") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.マッハフライ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.バンブール.場所: フィールド → 合体",
        "自分.バンブール.コア: 1 → 0",
        "自分.バンブール.BP: 2000 → なし",
        "自分.マッハフライ.コア: 1 → 2", // スピリット状態のブレイヴが載せていたコアは合体スピリット（ホスト）へ集約
        "自分.マッハフライ.BP: 2000 → 4000", // 合体スピリットのBP＝ホスト＋ブレイヴ
        "自分.マッハフライ.疲労: false → true",
        "相手.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part734）")
