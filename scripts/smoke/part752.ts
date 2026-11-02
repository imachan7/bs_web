// smoke パート752（SD17 赤B 8枚: SD17-012/013/014/015/016/X01/X02/X009 の期待値。
// 効果文とカードの属性だけから書く（docs/design/TEST_STRATEGY.md §5・§6・CONJUNCTION.md・
// STARTER_PLAN.md §2・BS19_PLAN.md §2（【連鎖】）・SEMANTICS_AUDIT.md §3）。
// STARTER-redB の effects はまだ空なので、効果が絡む場面は現状落ちる。例外では止まらないこと）
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"
import { assert, getCard } from "./helpers"

// ── 対象8枚 ──
const MORI = "SD17-012" // 原始の森（赤・ネクサス・コスト4・シンボル[赤]）
const GINGA = "SD17-013" // 黄昏の暗黒銀河（赤/緑・ネクサス・コスト5・シンボル[赤][緑]）
const JFLAME = "SD17-014" // ジュラシックフレイム（赤・マジック・コスト3・フラッシュ）
const CRISIS = "SD17-015" // ディノクライシス（赤・マジック・コスト5・フラッシュ）
const RUSH = "SD17-016" // ラッシュドロー（赤・マジック・コスト5・メイン/フラッシュ）
const TYRANO = "SD17-X01" // 闇龍ダーク・ティラノザウラー（赤・スピリット・コスト6・地竜）
const BLADE = "SD17-X02" // 暗黒の魔剣ダーク・ブレード（赤・ブレイヴ・コスト6・剣刃）
const PHOENIX = "X009" // 鳳凰竜フェニック・ソード（赤・ブレイヴ・コスト6・機竜/星魂）

// ── 脇役（既存の弾から） ──
const V = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・Lv1 BP1000・バニラ）
const GORA = "BS01-001" // ゴラドン（赤・コスト0・爬獣・Lv1 BP1000・バニラ）
const HOUND = "BS02-003" // ディノハウンド（赤・コスト2・地竜・Lv1[コア2] BP4000・バニラ）
const PAKI = "BS11-005" // 頭竜人パキケファロン（赤・コスト4・地竜/竜人・Lv2[コア3] BP6000・バニラ）
const PENTA = "BS14-008" // ペンタケラトップ（赤・コスト5・地竜・Lv1 BP4000・Lv2[コア2] BP7000・バニラ）
const SHOCK = "BS01-054" // ショックイーター（緑・コスト2・樹魔・Lv1 BP3000・バニラ。緑シンボル1つ）
const TAL = "BS16-025" // タランドーズ（緑・コスト6・バニラ・シンボル[緑][緑]の2つ）
const BANFA = "BS03-091" // 戦闘獣バン・ファロー（青・コスト5・戦獣・Lv1 BP4000・バニラ。地竜でない）
const FIELD = "BS01-098" // 燃えさかる戦場（赤・ネクサス・コスト3・シンボル[赤]）
const DINON = "BS08-001" // ディノニクソー（赤・コスト1・地竜・バニラ。トラッシュから回収される側）
const RENSA = "SD17-004" // ブロンソードザウルス（赤・コスト3・地竜・【連鎖】持ちスピリット）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = (id: string) => getCard(id)
    const t = (id: string, name: string, type: string, colors: string[], family: string[], cost: number) => {
        assert(c(id).name === name, `${id}は${name}`)
        assert(c(id).type === type, `${name}は${type}`)
        assert(JSON.stringify(c(id).colors) === JSON.stringify(colors), `${name}の色は${colors.join("/")}`)
        assert(JSON.stringify(c(id).family ?? []) === JSON.stringify(family), `${name}の系統は${family.join("/")}`)
        assert(c(id).cost === cost, `${name}のコストは${cost}`)
    }
    t(MORI, "原始の森", "nexus", ["red"], [], 4)
    t(GINGA, "黄昏の暗黒銀河", "nexus", ["red", "green"], [], 5)
    t(JFLAME, "ジュラシックフレイム", "magic", ["red"], [], 3)
    t(CRISIS, "ディノクライシス", "magic", ["red"], [], 5)
    t(RUSH, "ラッシュドロー", "magic", ["red"], [], 5)
    t(TYRANO, "闇龍ダーク・ティラノザウラー", "spirit", ["red"], ["地竜"], 6)
    t(BLADE, "暗黒の魔剣ダーク・ブレード", "brave", ["red"], ["剣刃"], 6)
    t(PHOENIX, "鳳凰竜フェニック・ソード", "brave", ["red"], ["機竜", "星魂"], 6)
    t(V, "ロクケラトプス", "spirit", ["red"], ["地竜"], 1)
    t(GORA, "ゴラドン", "spirit", ["red"], ["爬獣"], 0)
    t(HOUND, "ディノハウンド", "spirit", ["red"], ["地竜"], 2)
    t(PAKI, "頭竜人パキケファロン", "spirit", ["red"], ["地竜", "竜人"], 4)
    t(PENTA, "ペンタケラトップ", "spirit", ["red"], ["地竜"], 5)
    t(SHOCK, "ショックイーター", "spirit", ["green"], ["樹魔"], 2)
    t(TAL, "タランドーズ", "spirit", ["green"], ["殻人"], 6)
    t(BANFA, "戦闘獣バン・ファロー", "spirit", ["blue"], ["戦獣"], 5)
    t(FIELD, "燃えさかる戦場", "nexus", ["red"], [], 3)
    t(DINON, "ディノニクソー", "spirit", ["red"], ["地竜"], 1)
    t(RENSA, "ブロンソードザウルス", "spirit", ["red"], ["地竜"], 3)
    // 期待値で頼る BP・シンボル・軽減・キーワード
    const lv = (id: string, n: number, bp: number) => {
        const l = c(id).levels[n]
        assert(l !== undefined && l.bp === bp, `${id}のLv${n + 1} BPは${bp}`)
    }
    lv(V, 0, 1000)
    lv(GORA, 0, 1000)
    const hound = c(HOUND).levels[0]
    assert(hound !== undefined && hound.bp === 4000 && hound.cores === 2, "ディノハウンドはLv1[コア2] BP4000")
    const paki = c(PAKI).levels[1]
    assert(paki !== undefined && paki.bp === 6000 && paki.cores === 3, "パキケファロンはLv2[コア3] BP6000")
    lv(PENTA, 0, 4000)
    lv(PENTA, 1, 7000)
    lv(TYRANO, 0, 5000)
    lv(TYRANO, 1, 7000)
    lv(BLADE, 0, 5000)
    lv(PHOENIX, 0, 5000)
    assert(c(SHOCK).symbol.length === 1 && c(SHOCK).symbol[0] === "green", "ショックイーターは緑シンボル1つ")
    assert(c(TAL).symbol.length === 2, "タランドーズはシンボル2つ（回復効果の対象から外すため）")
    assert(c(V).symbol.length === 1, "ロクケラトプスはシンボル1つ")
    assert(JSON.stringify(c(JFLAME).reduction) === JSON.stringify(["red", "red"]), "ジュラシックフレイムの軽減は[赤][赤]")
    assert(JSON.stringify(c(CRISIS).reduction) === JSON.stringify(["red", "red"]), "ディノクライシスの軽減は[赤][赤]")
    assert(JSON.stringify(c(RUSH).reduction) === JSON.stringify(["red", "red", "red"]), "ラッシュドローの軽減は[赤]×3")
    assert(JSON.stringify(c(TYRANO).reduction) === JSON.stringify(["red", "red", "red"]), "ティラノザウラーの軽減は[赤]×3")
    assert(JSON.stringify(c(BLADE).reduction) === JSON.stringify(["red", "red", "red"]), "ダーク・ブレードの軽減は[赤]×3")
    assert(JSON.stringify(c(PHOENIX).reduction) === JSON.stringify(["red", "red", "red"]), "フェニック・ソードの軽減は[赤]×3")
    assert(c(RENSA).effect.includes("【連鎖"), "ブロンソードザウルスは【連鎖】持ち")
    assert(c(PHOENIX).symbol.length === 0, "フェニック・ソードはシンボルを持たない")
}

// ════════ SD17-012 原始の森 ════════
// Lv1･Lv2『自分のアタックステップ』自分のスピリットがBPを比べ相手のスピリットだけを破壊したとき、1ドロー
console.log("=== 012-1: BP比べで相手だけを破壊したら1ドロー ===")
scenario({
    name: "morI-drawOnBattleWon",
    start: {
        me: { nexuses: [{ card: MORI, label: "森", cores: 0 }], spirits: [{ card: HOUND, cores: 2 }] },
        opp: { spirits: [{ card: V, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ディノハウンド") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.ディノハウンド.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → ロクケラトプス",
    ],
})

// 相打ち（BP同値）は「相手のスピリットだけを破壊したとき」ではない → ドローしない
console.log("=== 012-2: 相打ちは「相手だけ」ではないのでドローしない ===")
scenario({
    name: "morI-noDrawOnMutual",
    start: {
        me: { nexuses: [{ card: MORI, label: "森", cores: 0 }], spirits: [{ card: GORA, cores: 1 }] },
        opp: { spirits: [{ card: V, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ゴラドン") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.ゴラドン.場所: フィールド → なし",
        "自分.トラッシュ: なし → ゴラドン",
        "自分.リザーブ: 10 → 11",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// Lv2 自分のスピリットが相手によって破壊されたとき、トラッシュの地竜スピリットカード1枚を手札に戻す
console.log("=== 012-3: Lv2で相手に破壊されたらトラッシュの地竜を回収 ===")
scenario({
    name: "morI-recoverDinosaurOnKilled",
    start: {
        me: { nexuses: [{ card: MORI, label: "森", cores: 2 }], spirits: [{ card: V, cores: 1 }], trash: [DINON] },
        opp: { spirits: [{ card: HOUND, cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ディノハウンド") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "相手.ディノハウンド.疲労: false → true",
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.トラッシュ: ディノニクソー → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
        "自分.手札: なし → ディノニクソー",
    ],
})

// Lv1では回収しない（条件を1つ外す）
console.log("=== 012-4: Lv1では回収しない ===")
scenario({
    name: "morI-lv1NoRecover",
    start: {
        me: { nexuses: [{ card: MORI, label: "森", cores: 0 }], spirits: [{ card: V, cores: 1 }], trash: [DINON] },
        opp: { spirits: [{ card: HOUND, cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ディノハウンド") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "相手.ディノハウンド.疲労: false → true",
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.トラッシュ: ディノニクソー → ディノニクソー、ロクケラトプス",
        "自分.リザーブ: 10 → 11",
    ],
})

// ════════ SD17-013 黄昏の暗黒銀河 ════════
// Lv1･Lv2『自分のアタックステップ』地竜すべてをBP+3000する
console.log("=== 013-1: 自分のアタックステップで地竜だけBP+3000 ===")
scenario({
    name: "ginga-chiryuBpPlus",
    start: {
        me: {
            nexuses: [{ card: GINGA, label: "銀河", cores: 0 }],
            spirits: [{ card: HOUND, cores: 2 }, { card: BANFA, cores: 1 }],
        },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
    },
    expect: [
        "自分.ディノハウンド.BP: 4000 → 7000",
        // 戦闘獣バン・ファロー（地竜でない）はBPが変わらない
    ],
})

// Lv2『自分のエンドステップ』地竜3体を回復させる
console.log("=== 013-2: Lv2のエンドステップで地竜3体を回復 ===")
scenario({
    name: "ginga-refreshThreeAtEnd",
    start: {
        me: {
            nexuses: [{ card: GINGA, label: "銀河", cores: 2 }],
            spirits: [
                { card: V, label: "ロクA", cores: 1, rested: true },
                { card: V, label: "ロクB", cores: 1, rested: true },
                { card: V, label: "ロクC", cores: 1, rested: true },
                { card: GORA, cores: 1, rested: true },
            ],
        },
    },
    steps(t) {
        t.act("me", { type: "endTurn" })
    },
    expect: [
        "自分.ロクA.疲労: true → false",
        "自分.ロクB.疲労: true → false",
        "自分.ロクC.疲労: true → false",
        // ゴラドン（爬獣）は回復しない
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// Lv1では回復しない（条件を1つ外す）
console.log("=== 013-3: Lv1ではエンドステップの回復をしない ===")
scenario({
    name: "ginga-lv1NoRefresh",
    start: {
        me: {
            nexuses: [{ card: GINGA, label: "銀河", cores: 0 }],
            spirits: [
                { card: V, label: "ロクA", cores: 1, rested: true },
                { card: V, label: "ロクB", cores: 1, rested: true },
                { card: V, label: "ロクC", cores: 1, rested: true },
            ],
        },
    },
    steps(t) {
        t.act("me", { type: "endTurn" })
    },
    expect: [
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ════════ SD17-014 ジュラシックフレイム ════════
// フラッシュ: BP3000以下の相手1体を破壊。【連鎖：条件《緑シンボル》》[緑]: 相手1体を疲労
console.log("=== 014-1: BP3000以下を破壊し、緑シンボルがあれば連鎖で疲労 ===")
scenario({
    name: "jflame-destroyAndChainExhaust",
    start: {
        me: { spirits: [{ card: SHOCK, cores: 1 }], hand: [JFLAME] },
        opp: { spirits: [{ card: GORA, cores: 1 }, { card: HOUND, cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.手札: ジュラシックフレイム → なし",
        "自分.リザーブ: 10 → 7", // コスト3。自分の赤シンボル0つなので軽減なし
        "自分.トラッシュのコア: 0 → 3",
        "自分.トラッシュ: なし → ジュラシックフレイム",
        "相手.ゴラドン.場所: フィールド → なし",
        "相手.トラッシュ: なし → ゴラドン",
        "相手.リザーブ: 10 → 11",
        "相手.ディノハウンド.疲労: false → true", // 連鎖[緑]
    ],
})

// 緑シンボルがなければ連鎖は発揮しない（条件を1つ外す）
console.log("=== 014-2: 緑シンボルがなければ破壊だけ ===")
scenario({
    name: "jflame-noChainWithoutGreen",
    start: {
        me: { spirits: [{ card: V, cores: 1 }], hand: [JFLAME] },
        opp: { spirits: [{ card: GORA, cores: 1 }, { card: HOUND, cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.手札: ジュラシックフレイム → なし",
        "自分.リザーブ: 10 → 8", // コスト3−赤シンボル1つ
        "自分.トラッシュのコア: 0 → 2",
        "自分.トラッシュ: なし → ジュラシックフレイム",
        "相手.ゴラドン.場所: フィールド → なし",
        "相手.トラッシュ: なし → ゴラドン",
        "相手.リザーブ: 10 → 11",
        // ディノハウンドは疲労しない
    ],
})

// ════════ SD17-015 ディノクライシス ════════
// フラッシュ: BP合計5000まで相手のスピリットを好きなだけ破壊。【連鎖：条件《緑シンボル》》[緑]: シンボル1つだけの自分2体を回復
console.log("=== 015-1: BP合計5000まで破壊し、連鎖でシンボル1つの自分2体を回復 ===")
scenario({
    name: "crisis-budgetDestroyAndChainRefresh",
    start: {
        me: {
            spirits: [
                { card: TAL, cores: 1 },
                { card: V, label: "ロクD", cores: 1, rested: true },
                { card: V, label: "ロクE", cores: 1, rested: true },
            ],
            hand: [CRISIS],
        },
        opp: { spirits: [{ card: V, label: "ロクA", cores: 1 }, { card: V, label: "ロクB", cores: 1 }, { card: V, label: "ロクC", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.手札: ディノクライシス → なし",
        "自分.リザーブ: 10 → 7", // コスト5−赤シンボル2つ（ロクD・ロクE）
        "自分.トラッシュのコア: 0 → 3",
        "自分.トラッシュ: なし → ディノクライシス",
        "相手.ロクA.場所: フィールド → なし",
        "相手.ロクB.場所: フィールド → なし",
        "相手.ロクC.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "相手.リザーブ: 10 → 13",
        "自分.ロクD.疲労: true → false", // 連鎖[緑]。シンボル1つだけ
        "自分.ロクE.疲労: true → false",
        // タランドーズ（シンボル2つ）は対象外
    ],
})

// 緑シンボルがなければ連鎖の回復をしない（条件を1つ外す）
console.log("=== 015-2: 緑シンボルがなければ破壊だけ ===")
scenario({
    name: "crisis-noChainWithoutGreen",
    start: {
        me: {
            spirits: [
                { card: V, label: "ロクD", cores: 1, rested: true },
                { card: V, label: "ロクE", cores: 1, rested: true },
            ],
            hand: [CRISIS],
        },
        opp: { spirits: [{ card: V, label: "ロクA", cores: 1 }, { card: V, label: "ロクB", cores: 1 }, { card: V, label: "ロクC", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.手札: ディノクライシス → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.トラッシュ: なし → ディノクライシス",
        "相手.ロクA.場所: フィールド → なし",
        "相手.ロクB.場所: フィールド → なし",
        "相手.ロクC.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "相手.リザーブ: 10 → 13",
        // ロクD・ロクEは疲労したまま
    ],
})

// ════════ SD17-016 ラッシュドロー ════════
// メイン: 2枚ドロー→上から2枚オープンし【連鎖】持ち1枚を手札に→残りをデッキの上に戻す
console.log("=== 016-1: メイン。2ドロー→オープン2枚の【連鎖】持ちを回収 ===")
scenario({
    name: "rush-mainDrawAndPickRensa",
    start: {
        me: { hand: [RUSH], deck: [V, V, RENSA, ...Array.from({ length: 37 }, () => V)] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "自分.手札: ラッシュドロー → ブロンソードザウルス、ロクケラトプス、ロクケラトプス",
        "自分.リザーブ: 10 → 5", // コスト5。自分の赤シンボル0つ
        "自分.トラッシュのコア: 0 → 5",
        "自分.トラッシュ: なし → ラッシュドロー",
        "自分.デッキ枚数: 40 → 37", // 2ドロー＋オープン2枚のうち1枚回収。残った1枚はデッキの上に戻る
    ],
})

// オープンした2枚に【連鎖】持ちがなければどちらもデッキに戻す
console.log("=== 016-2: オープン2枚が【連鎖】持ちでなければ回収しない ===")
scenario({
    name: "rush-mainNoRensaOpened",
    start: {
        me: { hand: [RUSH] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "自分.手札: ラッシュドロー → ロクケラトプス、ロクケラトプス",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.トラッシュ: なし → ラッシュドロー",
        "自分.デッキ枚数: 40 → 38",
    ],
})

// フラッシュ: このターンの間、スピリット1体をBP+3000する
console.log("=== 016-3: フラッシュでアタッカーをBP+3000 ===")
scenario({
    name: "rush-flashBpPlus",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: V, cores: 1 }], hand: [RUSH] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.ロクケラトプス.BP: 1000 → 4000",
        "自分.手札: ラッシュドロー → なし",
        "自分.リザーブ: 10 → 6", // コスト5−赤シンボル1つ
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → ラッシュドロー",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ════════ SD17-X01 闇龍ダーク・ティラノザウラー ════════
// Lv1-3『このスピリットのアタック時』このスピリットのBP以下の相手1体を破壊する
console.log("=== X01-1: アタック時、このBP以下の相手1体を破壊 ===")
scenario({
    name: "tyrano-destroyBelowSelfBp",
    start: {
        me: { spirits: [{ card: TYRANO, label: "闇龍", cores: 1 }] },
        opp: { spirits: [{ card: GORA, cores: 1 }, { card: PAKI, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("闇龍") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.闇龍.疲労: false → true",
        "相手.ゴラドン.場所: フィールド → なし", // BP1000 ≦ このBP5000
        "相手.トラッシュ: なし → ゴラドン",
        "相手.リザーブ: 10 → 12", // 破壊されたコア1個＋ライフのコア1個
        "相手.ライフ: 5 → 4",
        // パキケファロン（BP6000）はこのBP以下ではないので破壊されない
    ],
})

// 相手がこのBPより高ければ破壊しない（条件を1つ外す）
console.log("=== X01-2: 相手のBPがこのBPより高ければ破壊しない ===")
scenario({
    name: "tyrano-noDestroyAboveSelfBp",
    start: {
        me: { spirits: [{ card: TYRANO, label: "闇龍", cores: 1 }] },
        opp: { spirits: [{ card: PAKI, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("闇龍") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.闇龍.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 【連鎖：条件《緑シンボル》】[緑]: BPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個をリザーブへ
// アタック時効果の対象が2体いるので、対象選択は対話でゴラドンを指定する（実装前に選択待ちが出ないことも許す）
console.log("=== X01-3: 連鎖[緑]。BP比べ勝利で相手のライフのコア1個をリザーブへ ===")
scenario({
    name: "tyrano-chainLifeCrush",
    start: {
        interactive: true,
        me: { spirits: [{ card: TYRANO, label: "闇龍", cores: 1 }, { card: SHOCK, cores: 1 }] },
        opp: { spirits: [{ card: GORA, cores: 1 }, { card: HOUND, cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("闇龍") })
        const pc = t.state.pendingChoice
        if (pc) {
            assert(pc.pid === t.me, "アタック時効果の対象は自分が選ぶ")
            assert((pc.candidates ?? []).includes(t.id("ゴラドン")), "対象の候補にゴラドンがいる")
            t.act("me", { type: "resolveChoice", instanceId: t.id("ゴラドン") })
        }
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ディノハウンド") })
        t.closeFlash()
    },
    expect: [
        "自分.闇龍.疲労: false → true",
        "相手.ゴラドン.場所: フィールド → なし", // アタック時効果
        "相手.ディノハウンド.場所: フィールド → なし", // BP比べ
        "相手.トラッシュ: なし → ゴラドン、ディノハウンド",
        "相手.リザーブ: 10 → 14", // 破壊されたコア1＋2個＋連鎖でライフのコア1個
        "相手.ライフ: 5 → 4", // 連鎖[緑]（ブロックされているのでアタックでは減らない）
    ],
})

// 緑シンボルがなければ連鎖は発揮しない（条件を1つ外す）
console.log("=== X01-4: 緑シンボルがなければライフのコアは動かない ===")
scenario({
    name: "tyrano-noChainWithoutGreen",
    start: {
        interactive: true,
        me: { spirits: [{ card: TYRANO, label: "闇龍", cores: 1 }] },
        opp: { spirits: [{ card: GORA, cores: 1 }, { card: HOUND, cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("闇龍") })
        const pc = t.state.pendingChoice
        if (pc) {
            assert(pc.pid === t.me, "アタック時効果の対象は自分が選ぶ")
            assert((pc.candidates ?? []).includes(t.id("ゴラドン")), "対象の候補にゴラドンがいる")
            t.act("me", { type: "resolveChoice", instanceId: t.id("ゴラドン") })
        }
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ディノハウンド") })
        t.closeFlash()
    },
    expect: [
        "自分.闇龍.疲労: false → true",
        "相手.ゴラドン.場所: フィールド → なし",
        "相手.ディノハウンド.場所: フィールド → なし",
        "相手.トラッシュ: なし → ゴラドン、ディノハウンド",
        "相手.リザーブ: 10 → 13", // 破壊されたコアだけ。ライフは減らない
    ],
})

// Lv2-3『自分のアタックステップ』地竜すべてをBP+3000する
console.log("=== X01-5: Lv2のアタックステップで地竜すべてBP+3000 ===")
scenario({
    name: "tyrano-lv2ChiryuAura",
    start: {
        me: { spirits: [{ card: TYRANO, label: "闇龍", cores: 3 }, { card: V, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
    },
    expect: [
        "自分.闇龍.BP: 7000 → 10000", // 発生源自身も地竜
        "自分.ロクケラトプス.BP: 1000 → 4000",
    ],
})

// Lv1ではこのBP+はない（条件を1つ外す）
console.log("=== X01-6: Lv1ではBP+3000しない ===")
scenario({
    name: "tyrano-lv1NoAura",
    start: {
        me: { spirits: [{ card: TYRANO, label: "闇龍", cores: 1 }, { card: V, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
    },
    expect: [],
})

// ════════ SD17-X02 暗黒の魔剣ダーク・ブレード ════════
// Lv1『このブレイヴの召喚時』相手のネクサス1つを破壊。破壊したら1ドロー
console.log("=== X02-1: 召喚時、相手のネクサスを破壊して1ドロー ===")
scenario({
    name: "blade-destroyNexusAndDraw",
    start: {
        me: { spirits: [{ card: PENTA, cores: 1 }], hand: [BLADE] },
        opp: { nexuses: [{ card: FIELD, label: "戦場", cores: 0 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ペンタケラトップ") })
    },
    expect: [
        "自分.手札: 暗黒の魔剣ダーク・ブレード → ロクケラトプス", // 破壊した後のドロー
        "自分.リザーブ: 10 → 5", // コスト6−赤シンボル1つ
        "自分.トラッシュのコア: 0 → 5",
        "自分.暗黒の魔剣ダーク・ブレード.場所: なし → 合体",
        "自分.暗黒の魔剣ダーク・ブレード.疲労: なし → false",
        "自分.暗黒の魔剣ダーク・ブレード.コア: なし → 0",
        "自分.暗黒の魔剣ダーク・ブレード.Lv: なし → 1",
        "自分.ペンタケラトップ.BP: 4000 → 9000", // 合体時BP+5000
        "相手.戦場.場所: ネクサス → なし",
        "相手.トラッシュ: なし → 燃えさかる戦場",
        "自分.デッキ枚数: 40 → 39",
    ],
})

// 相手のネクサスがなければ破壊できずドローもしない（条件を1つ外す）
console.log("=== X02-2: ネクサスがなければドローしない ===")
scenario({
    name: "blade-noNexusNoDraw",
    start: {
        me: { spirits: [{ card: PENTA, cores: 1 }], hand: [BLADE] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ペンタケラトップ") })
    },
    expect: [
        "自分.手札: 暗黒の魔剣ダーク・ブレード → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.暗黒の魔剣ダーク・ブレード.場所: なし → 合体",
        "自分.暗黒の魔剣ダーク・ブレード.疲労: なし → false",
        "自分.暗黒の魔剣ダーク・ブレード.コア: なし → 0",
        "自分.暗黒の魔剣ダーク・ブレード.Lv: なし → 1",
        "自分.ペンタケラトップ.BP: 4000 → 9000",
    ],
})

// 【合体時】『このスピリットのアタック時』相手のスピリット1体を指定してアタックできる
console.log("=== X02-3: 合体時。指定した相手にアタックし、ブロックさせて破壊する ===")
scenario({
    name: "blade-combinedTargetAttack",
    start: {
        me: { spirits: [{ card: PENTA, cores: 1 }], hand: [BLADE] },
        opp: { spirits: [{ card: V, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ペンタケラトップ") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ペンタケラトップ"), targetSpiritInstanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: 暗黒の魔剣ダーク・ブレード → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.暗黒の魔剣ダーク・ブレード.場所: なし → 合体",
        "自分.暗黒の魔剣ダーク・ブレード.疲労: なし → false",
        "自分.暗黒の魔剣ダーク・ブレード.コア: なし → 0",
        "自分.暗黒の魔剣ダーク・ブレード.Lv: なし → 1",
        "自分.ペンタケラトップ.BP: 4000 → 9000",
        "自分.ペンタケラトップ.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        // 指定アタックはブロックされているのでライフは減らない
    ],
})

// 合体していなければ指定してアタックできない（条件を1つ外す）
console.log("=== X02-4: スピリット状態では指定アタックできない ===")
scenario({
    name: "blade-spiritStateNoTargetAttack",
    start: {
        me: { spirits: [{ card: BLADE, cores: 1 }] },
        opp: { spirits: [{ card: V, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.actRejected("me", { type: "attack", instanceId: t.id("暗黒の魔剣ダーク・ブレード"), targetSpiritInstanceId: t.id("ロクケラトプス") })
    },
    expect: [],
})

// ════════ X009 鳳凰竜フェニック・ソード ════════
// Lv1『このブレイヴの召喚時』BP4000以下のスピリットすべてを破壊する。または、ネクサスすべてを破壊する
// 陣営の書かれていない対象はお互い（STARTER_PLAN §2.2-4）
console.log("=== X009-1: 召喚時。BP4000以下のスピリットすべて（お互い）を破壊 ===")
scenario({
    name: "phoenix-destroyLowBpAll",
    start: {
        me: { spirits: [{ card: V, cores: 1 }], hand: [PHOENIX] },
        opp: { spirits: [{ card: GORA, cores: 1 }, { card: PAKI, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // スピリット状態で召喚
    },
    expect: [
        "自分.手札: 鳳凰竜フェニック・ソード → なし",
        "自分.リザーブ: 10 → 5", // コスト6−赤1つ。支払い5＋コア1個、破壊されたロクケラトプスのコア1個が戻る
        "自分.トラッシュのコア: 0 → 5",
        "自分.トラッシュ: なし → ロクケラトプス", // 自分のロクケラトプス（BP1000）も対象
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.鳳凰竜フェニック・ソード.場所: なし → フィールド",
        "自分.鳳凰竜フェニック・ソード.疲労: なし → false",
        "自分.鳳凰竜フェニック・ソード.コア: なし → 1",
        "自分.鳳凰竜フェニック・ソード.Lv: なし → 1",
        "自分.鳳凰竜フェニック・ソード.BP: なし → 5000",
        "相手.ゴラドン.場所: フィールド → なし",
        "相手.トラッシュ: なし → ゴラドン",
        "相手.リザーブ: 10 → 11",
        // パキケファロン（BP6000）は破壊されない
    ],
})

// ネクサスすべてを破壊するモード（お互いのネクサス）
console.log("=== X009-2: 召喚時。ネクサスすべて（お互い）を破壊 ===")
scenario({
    name: "phoenix-destroyAllNexuses",
    start: {
        me: {
            spirits: [{ card: PAKI, label: "パキ自", cores: 3 }],
            nexuses: [{ card: FIELD, label: "戦場自", cores: 0 }],
            hand: [PHOENIX],
        },
        opp: {
            spirits: [{ card: PAKI, label: "パキ相", cores: 3 }],
            nexuses: [{ card: FIELD, label: "戦場相", cores: 0 }],
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // BP4000以下のスピリットがいないのでネクサスのモード
    },
    expect: [
        "自分.手札: 鳳凰竜フェニック・ソード → なし",
        "自分.リザーブ: 10 → 5", // コスト6−赤2つ（パキ自・戦場自）
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → 燃えさかる戦場",
        "自分.戦場自.場所: ネクサス → なし",
        "自分.鳳凰竜フェニック・ソード.場所: なし → フィールド",
        "自分.鳳凰竜フェニック・ソード.疲労: なし → false",
        "自分.鳳凰竜フェニック・ソード.コア: なし → 1",
        "自分.鳳凰竜フェニック・ソード.Lv: なし → 1",
        "自分.鳳凰竜フェニック・ソード.BP: なし → 5000",
        "相手.戦場相.場所: ネクサス → なし",
        "相手.トラッシュ: なし → 燃えさかる戦場",
    ],
})

// 【合体時】『このスピリットの合体アタック時』相手のスピリット1体を指定し、そのスピリットにアタックできる
console.log("=== X009-3: 合体時。合体アタック時に指定した相手にアタックする ===")
scenario({
    name: "phoenix-combinedTargetAttack",
    start: {
        me: { spirits: [{ card: PENTA, cores: 2 }], hand: [PHOENIX] },
        opp: { spirits: [{ card: V, cores: 1 }, { card: PAKI, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ペンタケラトップ") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ペンタケラトップ"), targetSpiritInstanceId: t.id("頭竜人パキケファロン") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: 鳳凰竜フェニック・ソード → なし",
        "自分.リザーブ: 10 → 5", // コスト6−赤1つ
        "自分.トラッシュのコア: 0 → 5",
        "自分.鳳凰竜フェニック・ソード.場所: なし → 合体",
        "自分.鳳凰竜フェニック・ソード.疲労: なし → false",
        "自分.鳳凰竜フェニック・ソード.コア: なし → 0",
        "自分.鳳凰竜フェニック・ソード.Lv: なし → 1",
        "自分.ペンタケラトップ.BP: 7000 → 12000", // Lv2 BP7000＋合体時BP+5000
        "自分.ペンタケラトップ.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし", // 召喚時：BP4000以下（お互い）
        "相手.頭竜人パキケファロン.場所: フィールド → なし", // 指定アタックでブロックさせて破壊
        "相手.トラッシュ: なし → ロクケラトプス、頭竜人パキケファロン",
        "相手.リザーブ: 10 → 14", // 1＋3個。ブロックされているのでライフは減らない
    ],
})

// 合体していなければ指定してアタックできない（条件を1つ外す）
console.log("=== X009-4: スピリット状態では指定アタックできない ===")
scenario({
    name: "phoenix-spiritStateNoTargetAttack",
    start: {
        me: { spirits: [{ card: PHOENIX, cores: 1 }] },
        opp: { spirits: [{ card: V, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.actRejected("me", { type: "attack", instanceId: t.id("鳳凰竜フェニック・ソード"), targetSpiritInstanceId: t.id("ロクケラトプス") })
    },
    expect: [],
})

console.log("すべてのチェックに合格しました 🎉（part752）")
