// smoke パート730（BS19 red 8枚：BS19-003・005・007・008・009・011・067・068 の期待値場面テスト）
// 効果文とカードの属性だけから書いている（docs/design/BS19_PLAN.md §2・SEMANTICS_AUDIT §3.23〜3.25・CONJUNCTION.md）。
// BS19 の effects はまだ空なので、データ役の実装が終わる前は落ちてよい（例外で止まらないこと）。
// 【強化】の行は part726 が見ているのでここでは書かない。
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

// ── 担当カード ──
const SPLIT_DRAGOON = "BS19-003" // スプライト・ドラグーン
const CLERIC = "BS19-005" // クレリック・ドラゴン
const STARVA = "BS19-007" // スタバ・ドラゴン
const DESMATOCK = "BS19-008" // デス・マトック
const DAMASKUS = "BS19-009" // 流星の剣使いダマスクス
const QUASAR = "BS19-011" // 天星龍クェーサー・ドラゴン
const GAIMIMUS = "BS19-067" // ガイミムス
const TRANSFER = "BS19-068" // 電竜機トランスファー・ドラゴン

// ── 脇役（data/cards の既存弾。BS19 は effects がまだ無いので脇役にしない） ──
const VANILLA = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・バニラ）
const STATUE = "BS03-073" // ストン・スタチュー（青・造兵・召喚時に相手のデッキ1枚破棄）
const SAILFISH = "BS12-028" // セイルフィッシュ（白・空魚/星魂・【重装甲：白】持ち）
const CAMEL = "BS15-058" // ダブル・キャメル（白ブレイヴ・機獣・コスト4・合体時は重装甲のみ）
const RAYNEEDLE = "BS07-001" // レイニードル（赤・星竜・バニラ）
const PAKI = "BS11-005" // 頭竜人パキケファロン（赤・地竜/竜人・バニラ）
const DUALDO = "BS10-007" // デュアルド（赤・古竜/異合・バニラ・Lv2 BP8000）
const ESPADA = "BS06-008" // 刀剣魚エスパーダ（赤・溶魚・バニラ・コスト4）
const ANTMAN = "BS05-024" // 用心棒アントマン（緑・殻人/怪虫・バニラ・Lv1 BP5000）
const ONIGMON = "BS10-011" // オニグモン（紫・霊獣・バニラ・コスト0・紫シンボル）
const FIORD = "BS17-067" // 凍えるフィヨルド（白ネクサス）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SPLIT_DRAGOON).name === "スプライト・ドラグーン" && getCard(SPLIT_DRAGOON).type === "spirit" && getCard(SPLIT_DRAGOON).colors.join() === "red" && getCard(SPLIT_DRAGOON).family.join() === "星竜", "BS19-003はスプライト・ドラグーン（赤・星竜）")
    assert(getCard(CLERIC).name === "クレリック・ドラゴン" && getCard(CLERIC).type === "spirit" && getCard(CLERIC).colors.join() === "red" && getCard(CLERIC).family.join() === "戦竜", "BS19-005はクレリック・ドラゴン（赤・戦竜）")
    assert(getCard(STARVA).name === "スタバ・ドラゴン" && getCard(STARVA).type === "spirit" && getCard(STARVA).colors.join() === "red" && getCard(STARVA).family.join() === "星竜", "BS19-007はスタバ・ドラゴン（赤・星竜）")
    assert(getCard(DESMATOCK).name === "デス・マトック" && getCard(DESMATOCK).type === "spirit" && getCard(DESMATOCK).colors.join() === "red" && getCard(DESMATOCK).family.join() === "地竜", "BS19-008はデス・マトック（赤・地竜）")
    assert(getCard(DAMASKUS).name === "流星の剣使いダマスクス" && getCard(DAMASKUS).type === "spirit" && getCard(DAMASKUS).colors.join() === "red" && getCard(DAMASKUS).family.join() === "剣使,星竜", "BS19-009は流星の剣使いダマスクス（赤・剣使/星竜）")
    assert(getCard(QUASAR).name === "天星龍クェーサー・ドラゴン" && getCard(QUASAR).type === "spirit" && getCard(QUASAR).colors.join() === "red" && getCard(QUASAR).family.join() === "星竜", "BS19-011は天星龍クェーサー・ドラゴン（赤・星竜）")
    assert(getCard(GAIMIMUS).name === "ガイミムス" && getCard(GAIMIMUS).type === "brave" && getCard(GAIMIMUS).colors.join() === "red" && getCard(GAIMIMUS).family.join() === "地竜", "BS19-067はガイミムス（赤ブレイヴ・地竜）")
    assert(getCard(TRANSFER).name === "電竜機トランスファー・ドラゴン" && getCard(TRANSFER).type === "brave" && getCard(TRANSFER).colors.join() === "red" && getCard(TRANSFER).family.join() === "機竜", "BS19-068は電竜機トランスファー・ドラゴン（赤ブレイヴ・機竜）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).colors.join() === "red" && getCard(VANILLA).family.join() === "地竜", "VANILLAはロクケラトプス（赤・地竜）")
    assert(getCard(STATUE).name === "ストン・スタチュー" && getCard(STATUE).colors.join() === "blue" && getCard(STATUE).family.join() === "造兵", "STATUEはストン・スタチュー（青・造兵）")
    assert(getCard(SAILFISH).name === "セイルフィッシュ" && getCard(SAILFISH).colors.join() === "white" && getCard(SAILFISH).family.join() === "空魚,星魂", "SAILFISHはセイルフィッシュ（白・空魚/星魂）")
    assert(getCard(CAMEL).name === "ダブル・キャメル" && getCard(CAMEL).type === "brave" && getCard(CAMEL).colors.join() === "white" && getCard(CAMEL).family.join() === "機獣", "CAMELはダブル・キャメル（白ブレイヴ・機獣）")
    assert(getCard(RAYNEEDLE).name === "レイニードル" && getCard(RAYNEEDLE).colors.join() === "red" && getCard(RAYNEEDLE).family.join() === "星竜", "RAYNEEDLEはレイニードル（赤・星竜）")
    assert(getCard(PAKI).name === "頭竜人パキケファロン" && getCard(PAKI).colors.join() === "red" && getCard(PAKI).family.join() === "地竜,竜人", "PAKIは頭竜人パキケファロン（赤・地竜/竜人）")
    assert(getCard(DUALDO).name === "デュアルド" && getCard(DUALDO).colors.join() === "red" && getCard(DUALDO).family.join() === "古竜,異合", "DUALDOはデュアルド（赤・古竜/異合）")
    assert(getCard(ESPADA).name === "刀剣魚エスパーダ" && getCard(ESPADA).colors.join() === "red" && getCard(ESPADA).family.join() === "溶魚", "ESPADAは刀剣魚エスパーダ（赤・溶魚）")
    assert(getCard(ANTMAN).name === "用心棒アントマン" && getCard(ANTMAN).colors.join() === "green" && getCard(ANTMAN).family.join() === "殻人,怪虫", "ANTMANは用心棒アントマン（緑・殻人/怪虫）")
    assert(getCard(ONIGMON).name === "オニグモン" && getCard(ONIGMON).colors.join() === "purple" && getCard(ONIGMON).family.join() === "霊獣", "ONIGMONはオニグモン（紫・霊獣）")
    assert(getCard(FIORD).name === "凍えるフィヨルド" && getCard(FIORD).type === "nexus" && getCard(FIORD).colors.join() === "white", "FIORDは凍えるフィヨルド（白ネクサス）")
}

// ══════════════════════════════════════════════
// BS19-003 スプライト・ドラグーン
// Lv1-3『自分のアタックステップ』系統：「星竜」を持つ自分のスピリットは、【重装甲】を持つ相手のスピリットにブロックされたとき回復する。
// Lv2-3『このスピリットのアタック時』このスピリットをBP+3000する。（期間の書かれていないアタック時のBP+はバトルの間だけ）
// ══════════════════════════════════════════════

// 節1＋：星竜（レイニードル）が【重装甲】持ちにブロックされたら回復する（疲労したままにならない）
scenario({
    name: "spritDragoonRefreshOnArmorBlock",
    start: {
        me: { spirits: [{ card: SPLIT_DRAGOON, label: "スプライト", cores: 1 }, { card: RAYNEEDLE, label: "レイニードル", cores: 2 }] },
        opp: { spirits: [{ card: SAILFISH, label: "セイルフィッシュ", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("レイニードル") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("セイルフィッシュ") })
        t.closeFlash()
    },
    expect: [
        // レイニードルは回復するので疲労の行は出ない（回復しなければ false → true が余計に出て落ちる）
        "相手.セイルフィッシュ.場所: フィールド → なし",
        "相手.トラッシュ: なし → セイルフィッシュ",
        "相手.リザーブ: 10 → 11",
    ],
})

// 節1−：ブロッカーが【重装甲】を持たなければ回復しない（条件を1つ外す）
scenario({
    name: "spritDragoonNoRefreshOnPlainBlock",
    start: {
        me: { spirits: [{ card: SPLIT_DRAGOON, label: "スプライト", cores: 1 }, { card: RAYNEEDLE, label: "レイニードル", cores: 2 }] },
        opp: { spirits: [{ card: VANILLA, label: "ロク", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("レイニードル") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ロク") })
        t.closeFlash()
    },
    expect: [
        "自分.レイニードル.疲労: false → true",
        "相手.ロク.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// 節2＋：Lv2のアタック時はバトルの間BP+3000（BP4000でBP6000にブロックされても生き残る）
scenario({
    name: "spritDragoonAttackBpPlus",
    start: {
        me: { spirits: [{ card: SPLIT_DRAGOON, label: "スプライト", cores: 2 }] },
        opp: { spirits: [{ card: PAKI, label: "パキ", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("スプライト") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("パキ") })
        t.closeFlash()
    },
    expect: [
        "自分.スプライト.疲労: false → true",
        "相手.パキ.場所: フィールド → なし",
        "相手.トラッシュ: なし → 頭竜人パキケファロン",
        "相手.リザーブ: 10 → 13",
    ],
})

// 節2−：Lv1のアタックではBP+3000されない（条件を1つ外す。BP2000のままBP6000に負ける）
scenario({
    name: "spritDragoonAttackBpPlusLv1",
    start: {
        me: { spirits: [{ card: SPLIT_DRAGOON, label: "スプライト", cores: 1 }] },
        opp: { spirits: [{ card: PAKI, label: "パキ", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("スプライト") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("パキ") })
        t.closeFlash()
    },
    expect: [
        "自分.スプライト.場所: フィールド → なし",
        "自分.トラッシュ: なし → スプライト・ドラグーン",
        "自分.リザーブ: 10 → 11",
        "相手.パキ.疲労: false → true",
    ],
})

// ══════════════════════════════════════════════
// BS19-005 クレリック・ドラゴン
// Lv1-2『このスピリットの召喚時』自分のトラッシュにあるスピリットカード1枚を手札に戻す。
// Lv2『自分のアタックステップ』自分の手札1枚につき、このスピリットをBP+1000する。
// ══════════════════════════════════════════════

// 節1＋：召喚時にトラッシュのスピリットカード（ロクケラトプス）1枚を手札に戻す
scenario({
    name: "clericSummonReturnTrash",
    start: { me: { hand: [CLERIC], trash: [VANILLA], reserve: 10 } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: クレリック・ドラゴン → ロクケラトプス",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: ロクケラトプス → なし",
        "自分.クレリック・ドラゴン.場所: なし → フィールド",
        "自分.クレリック・ドラゴン.疲労: なし → false",
        "自分.クレリック・ドラゴン.コア: なし → 1",
        "自分.クレリック・ドラゴン.Lv: なし → 1",
        "自分.クレリック・ドラゴン.BP: なし → 2000",
    ],
})

// 節2＋：Lv2の自分のアタックステップの間、手札2枚につきBP+2000
scenario({
    name: "clericAttackStepBpPerHand",
    start: { me: { spirits: [{ card: CLERIC, label: "クレリック", cores: 3 }], hand: [VANILLA, VANILLA] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
    },
    expect: ["自分.クレリック.BP: 3000 → 5000"],
})

// 節2−：Lv1では手札があってBP+されない（条件を1つ外す）
scenario({
    name: "clericAttackStepBpPerHandLv1",
    start: { me: { spirits: [{ card: CLERIC, label: "クレリック", cores: 1 }], hand: [VANILLA, VANILLA] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
    },
    expect: [],
})

// ══════════════════════════════════════════════
// BS19-007 スタバ・ドラゴン
// Lv1-3 お互いのデッキは破棄されない。
// Lv2-3『このスピリットのアタック時』BP4000以下の相手のスピリット1体を破壊する。
// ══════════════════════════════════════════════

// 節1＋：スタバがいる間、ストン・スタチューの召喚時でも相手のデッキは破棄されない
scenario({
    name: "starvaNoDeckDiscard",
    start: { me: { spirits: [{ card: STARVA, label: "スタバ", cores: 1 }], hand: [STATUE], reserve: 10 } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ストン・スタチュー → なし",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 1",
        "自分.ストン・スタチュー.場所: なし → フィールド",
        "自分.ストン・スタチュー.疲労: なし → false",
        "自分.ストン・スタチュー.コア: なし → 1",
        "自分.ストン・スタチュー.Lv: なし → 1",
        "自分.ストン・スタチュー.BP: なし → 2000",
        // 相手のデッキ枚数・トラッシュは変わらない
    ],
})

// 節1−：スタバがいなければ相手のデッキは1枚破棄される（条件を1つ外す）
scenario({
    name: "statueDiscardsWithoutStarva",
    start: { me: { hand: [STATUE], reserve: 10 } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ストン・スタチュー → なし",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 1",
        "自分.ストン・スタチュー.場所: なし → フィールド",
        "自分.ストン・スタチュー.疲労: なし → false",
        "自分.ストン・スタチュー.コア: なし → 1",
        "自分.ストン・スタチュー.Lv: なし → 1",
        "自分.ストン・スタチュー.BP: なし → 2000",
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュ: なし → ロクケラトプス",
    ],
})

// 節2＋：Lv2のアタック時、BP4000以下の相手のスピリット1体（ロクケラトプス）を破壊する
scenario({
    name: "starvaAttackDestroySmall",
    start: {
        me: { spirits: [{ card: STARVA, label: "スタバ", cores: 2 }] },
        opp: { spirits: [{ card: VANILLA, label: "ロク", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("スタバ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.スタバ.疲労: false → true",
        "相手.ロク.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})

// 節2−：Lv1のアタックでは破壊しない（条件を1つ外す）
scenario({
    name: "starvaAttackDestroySmallLv1",
    start: {
        me: { spirits: [{ card: STARVA, label: "スタバ", cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, label: "ロク", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("スタバ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.スタバ.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ══════════════════════════════════════════════
// BS19-008 デス・マトック
// Lv1-3『このスピリットのアタック時』このスピリットをBP+5000する。（バトルの間だけ）
// 【連鎖：条件《紫シンボル》】[紫]：系統：「殻人」を持つ相手のスピリット1体を破壊する。
// ══════════════════════════════════════════════

// 節1＋：Lv1のアタックでもバトルの間BP+5000（BP3000がBP6000のブロッカーに勝つ）
scenario({
    name: "desmatockAttackBpPlus",
    start: {
        me: { spirits: [{ card: DESMATOCK, label: "マトック", cores: 1 }] },
        opp: { spirits: [{ card: PAKI, label: "パキ", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("マトック") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("パキ") })
        t.closeFlash()
    },
    expect: [
        "自分.マトック.疲労: false → true",
        "相手.パキ.場所: フィールド → なし",
        "相手.トラッシュ: なし → 頭竜人パキケファロン",
        "相手.リザーブ: 10 → 13",
    ],
})

// 連鎖＋：自分の紫シンボル（オニグモン）があるとき、アタック時に続けて殻人1体を破壊する
scenario({
    name: "desmatockChainPurple",
    start: {
        me: { spirits: [{ card: DESMATOCK, label: "マトック", cores: 1 }, { card: ONIGMON, label: "オニグモン", cores: 1 }] },
        opp: { spirits: [{ card: ANTMAN, label: "アントマン", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("マトック") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.マトック.疲労: false → true",
        "相手.アントマン.場所: フィールド → なし",
        "相手.トラッシュ: なし → 用心棒アントマン",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})

// 連鎖−：自分の紫シンボルが無いときは続けて発揮しない（条件を1つ外す）
scenario({
    name: "desmatockChainNoPurple",
    start: {
        me: { spirits: [{ card: DESMATOCK, label: "マトック", cores: 1 }] },
        opp: { spirits: [{ card: ANTMAN, label: "アントマン", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("マトック") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.マトック.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ══════════════════════════════════════════════
// BS19-009 流星の剣使いダマスクス
// 【強化】の行は part726 が見ているのでここでは書かない
// 【合体時】Lv2-3『このスピリットの合体アタック時』このスピリットのBP以下の相手のスピリットにブロックされたとき、BP6000以下の相手のスピリット1体を破壊する。
// ══════════════════════════════════════════════

// 合体時節＋：Lv2で合体アタックしBP9000以下のブロッカー（デュアルド BP8000）にブロックされたら、BP6000以下のアントマン1体を破壊する
scenario({
    name: "damaskusCombinedAttack",
    start: {
        me: { spirits: [{ card: DAMASKUS, label: "ダマスクス", cores: 3 }, { card: CAMEL, label: "キャメル", cores: 1 }] },
        opp: { spirits: [{ card: DUALDO, label: "デュアルド", cores: 3 }, { card: ANTMAN, label: "アントマン", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("キャメル"), hostInstanceId: t.id("ダマスクス") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ダマスクス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("デュアルド") })
        t.closeFlash()
    },
    expect: [
        "自分.ダマスクス.BP: 6000 → 9000",
        "自分.ダマスクス.コア: 3 → 4",
        "自分.キャメル.場所: フィールド → 合体",
        "自分.キャメル.コア: 1 → 0",
        "自分.キャメル.BP: 3000 → なし",
        "自分.ダマスクス.疲労: false → true",
        "相手.デュアルド.場所: フィールド → なし",
        "相手.アントマン.場所: フィールド → なし",
        "相手.トラッシュ: なし → デュアルド、用心棒アントマン",
        "相手.リザーブ: 10 → 14",
    ],
})

// 合体時節−：Lv1の合体アタックでは破壊しない（条件を1つ外す。BP6000以下のアントマンが残る）
scenario({
    name: "damaskusCombinedAttackLv1",
    start: {
        me: { spirits: [{ card: DAMASKUS, label: "ダマスクス", cores: 1 }, { card: CAMEL, label: "キャメル", cores: 1 }] },
        opp: { spirits: [{ card: PAKI, label: "パキ", cores: 3 }, { card: ANTMAN, label: "アントマン", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("キャメル"), hostInstanceId: t.id("ダマスクス") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ダマスクス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("パキ") })
        t.closeFlash()
    },
    expect: [
        "自分.ダマスクス.BP: 4000 → 7000",
        "自分.ダマスクス.コア: 1 → 2",
        "自分.キャメル.場所: フィールド → 合体",
        "自分.キャメル.コア: 1 → 0",
        "自分.キャメル.BP: 3000 → なし",
        "自分.ダマスクス.疲労: false → true",
        "相手.パキ.場所: フィールド → なし",
        "相手.トラッシュ: なし → 頭竜人パキケファロン",
        "相手.リザーブ: 10 → 13",
    ],
})

// ══════════════════════════════════════════════
// BS19-011 天星龍クェーサー・ドラゴン
// Lv1-3『このスピリットの召喚時』BP7000以下の相手のスピリット1体を破壊する。
// Lv2-3『自分のアタックステップ』系統：「星竜」を持つ自分のスピリットがアタックしたとき、そのスピリットのBP以下の相手のスピリットにブロックされたら、相手のライフのコア1個を相手のリザーブに置く。
// ══════════════════════════════════════════════

// 節1＋：召喚時にBP7000以下の相手のスピリット（アントマン BP5000）1体を破壊する
scenario({
    name: "quasarSummonDestroy",
    start: { me: { hand: [QUASAR], reserve: 12 }, opp: { spirits: [{ card: ANTMAN, label: "アントマン", cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 天星龍クェーサー・ドラゴン → なし",
        "自分.リザーブ: 12 → 4",
        "自分.トラッシュのコア: 0 → 7",
        "自分.天星龍クェーサー・ドラゴン.場所: なし → フィールド",
        "自分.天星龍クェーサー・ドラゴン.疲労: なし → false",
        "自分.天星龍クェーサー・ドラゴン.コア: なし → 1",
        "自分.天星龍クェーサー・ドラゴン.Lv: なし → 1",
        "自分.天星龍クェーサー・ドラゴン.BP: なし → 5000",
        "相手.アントマン.場所: フィールド → なし",
        "相手.トラッシュ: なし → 用心棒アントマン",
        "相手.リザーブ: 10 → 11",
    ],
})

// 節1−：相手がBP8000なら破壊しない（条件を1つ外す）
scenario({
    name: "quasarSummonDestroyAboveBp",
    start: { me: { hand: [QUASAR], reserve: 12 }, opp: { spirits: [{ card: DUALDO, label: "デュアルド", cores: 3 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 天星龍クェーサー・ドラゴン → なし",
        "自分.リザーブ: 12 → 4",
        "自分.トラッシュのコア: 0 → 7",
        "自分.天星龍クェーサー・ドラゴン.場所: なし → フィールド",
        "自分.天星龍クェーサー・ドラゴン.疲労: なし → false",
        "自分.天星龍クェーサー・ドラゴン.コア: なし → 1",
        "自分.天星龍クェーサー・ドラゴン.Lv: なし → 1",
        "自分.天星龍クェーサー・ドラゴン.BP: なし → 5000",
        // デュアルド（BP8000）は破壊されない
    ],
})

// 節2＋：星竜（レイニードル BP4000）がBP以下の相手にブロックされたら、相手のライフのコア1個を相手のリザーブへ
scenario({
    name: "quasarSeiryuBlockedLifeCore",
    start: {
        me: { spirits: [{ card: QUASAR, label: "クェーサー", cores: 3 }, { card: RAYNEEDLE, label: "レイニードル", cores: 3 }] },
        opp: { spirits: [{ card: PAKI, label: "パキ", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("レイニードル") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("パキ") })
        t.closeFlash()
    },
    expect: [
        "自分.レイニードル.疲労: false → true",
        "相手.パキ.場所: フィールド → なし",
        "相手.トラッシュ: なし → 頭竜人パキケファロン",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})

// 節2−：アタックした自分のスピリットが星竜でなければライフのコアは動かない（条件を1つ外す）
scenario({
    name: "quasarNonSeiryuNoLifeCore",
    start: {
        me: { spirits: [{ card: QUASAR, label: "クェーサー", cores: 3 }, { card: VANILLA, label: "ロクA", cores: 2 }] },
        opp: { spirits: [{ card: VANILLA, label: "ロクB", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ロクA") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ロクB") })
        t.closeFlash()
    },
    expect: [
        "自分.ロクA.疲労: false → true",
        "相手.ロクB.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ══════════════════════════════════════════════
// BS19-067 ガイミムス
// 合体条件：コスト4以上
// 【合体時】『このスピリットのアタック時』自分はデッキから1枚ドローし、相手のネクサス1つを破壊する。
// ══════════════════════════════════════════════

// 合体時節＋：コスト4のエスパーダに合体してアタックしたら、1枚ドローし相手のネクサス（凍えるフィヨルド）1つを破壊する
scenario({
    name: "gaimimusCombinedAttackDrawNexus",
    start: {
        me: { spirits: [{ card: ESPADA, label: "エスパーダ", cores: 1 }, { card: GAIMIMUS, label: "ガイミムス", cores: 1 }] },
        opp: { nexuses: [{ card: FIORD, label: "フィヨルド", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ガイミムス"), hostInstanceId: t.id("エスパーダ") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("エスパーダ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.エスパーダ.BP: 4000 → 7000",
        "自分.エスパーダ.コア: 1 → 2",
        "自分.ガイミムス.場所: フィールド → 合体",
        "自分.ガイミムス.コア: 1 → 0",
        "自分.ガイミムス.BP: 3000 → なし",
        "自分.エスパーダ.疲労: false → true",
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → ロクケラトプス",
        "相手.フィヨルド.場所: ネクサス → なし",
        "相手.トラッシュ: なし → 凍えるフィヨルド",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 13",
    ],
})

// 合体時節−：スピリット状態で単独アタックしてもドローもネクサス破壊もしない（条件を1つ外す）
scenario({
    name: "gaimimusSoloAttackNoEffect",
    start: {
        me: { spirits: [{ card: GAIMIMUS, label: "ガイミムス", cores: 1 }] },
        opp: { nexuses: [{ card: FIORD, label: "フィヨルド", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ガイミムス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ガイミムス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 合体条件−：コスト1のスピリットには合体できない（拒否される）
scenario({
    name: "gaimimusCantCombineCost1",
    start: {
        me: { spirits: [{ card: GAIMIMUS, label: "ガイミムス", cores: 1 }, { card: VANILLA, label: "ロク", cores: 1 }] },
    },
    steps(t) {
        t.actRejected("me", { type: "combineBrave", braveInstanceId: t.id("ガイミムス"), hostInstanceId: t.id("ロク") })
    },
    expect: [],
})

// ══════════════════════════════════════════════
// BS19-068 電竜機トランスファー・ドラゴン
// Lv1『このブレイヴの召喚時』系統1つを指定する。指定した系統を持つBP5000以下の相手のスピリット2体を破壊する。
// 合体条件：コスト4以上
// 【合体時】『このスピリットの合体アタック時』BP7000以上の相手のスピリット1体を指定し、そのスピリットにアタックできる。
// ══════════════════════════════════════════════

// 節1＋：召喚時に系統（地竜）を指定し、指定した系統のBP5000以下の相手のスピリット2体（ロクA・ロクB）を破壊する
scenario({
    name: "transferSummonFamilyDestroy",
    start: {
        interactive: true,
        me: { hand: [TRANSFER], reserve: 10 },
        opp: { spirits: [{ card: VANILLA, label: "ロクA", cores: 1 }, { card: VANILLA, label: "ロクB", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        // 対象を1体ずつ選ぶ（2体）
        for (const label of ["ロクA", "ロクB"]) {
            if (t.state.pendingChoice?.kind === "target") t.act("me", { type: "resolveChoice", instanceId: t.id(label) })
        }
    },
    expect: [
        "自分.手札: 電竜機トランスファー・ドラゴン → なし",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.電竜機トランスファー・ドラゴン.場所: なし → フィールド",
        "自分.電竜機トランスファー・ドラゴン.疲労: なし → false",
        "自分.電竜機トランスファー・ドラゴン.コア: なし → 1",
        "自分.電竜機トランスファー・ドラゴン.Lv: なし → 1",
        "自分.電竜機トランスファー・ドラゴン.BP: なし → 2000",
        "相手.ロクA.場所: フィールド → なし",
        "相手.ロクB.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.リザーブ: 10 → 12",
    ],
})

// 節1−：指定した系統の相手がBP5000を超えていれば破壊しない（条件を1つ外す。パキA・パキBはBP6000）
scenario({
    name: "transferSummonFamilyAboveBp",
    start: {
        interactive: true,
        me: { hand: [TRANSFER], reserve: 10 },
        opp: { spirits: [{ card: PAKI, label: "パキA", cores: 3 }, { card: PAKI, label: "パキB", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "resolveChoice", option: "地竜" })
    },
    expect: [
        "自分.手札: 電竜機トランスファー・ドラゴン → なし",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.電竜機トランスファー・ドラゴン.場所: なし → フィールド",
        "自分.電竜機トランスファー・ドラゴン.疲労: なし → false",
        "自分.電竜機トランスファー・ドラゴン.コア: なし → 1",
        "自分.電竜機トランスファー・ドラゴン.Lv: なし → 1",
        "自分.電竜機トランスファー・ドラゴン.BP: なし → 2000",
        // パキA・パキB（BP6000）は破壊されない
    ],
})

// 合体時節＋：コスト4のエスパーダに合体してアタックし、BP7000以上の相手（デュアルド BP8000）1体を指定してそのスピリットにアタックする
scenario({
    name: "transferCombinedTargetAttack",
    start: {
        me: { spirits: [{ card: ESPADA, label: "エスパーダ", cores: 3 }, { card: TRANSFER, label: "トランスファー", cores: 1 }] },
        opp: { spirits: [{ card: DUALDO, label: "デュアルド", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("トランスファー"), hostInstanceId: t.id("エスパーダ") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("エスパーダ"), targetSpiritInstanceId: t.id("デュアルド") })
        t.closeFlash()
    },
    expect: [
        "自分.エスパーダ.BP: 7000 → 9000",
        "自分.エスパーダ.コア: 3 → 4",
        "自分.トランスファー.場所: フィールド → 合体",
        "自分.トランスファー.コア: 1 → 0",
        "自分.トランスファー.BP: 2000 → なし",
        "自分.エスパーダ.疲労: false → true",
        "相手.デュアルド.場所: フィールド → なし",
        "相手.トラッシュ: なし → デュアルド",
        "相手.リザーブ: 10 → 13",
        // ライフは減らない
    ],
})

// 合体条件−：コスト1のスピリットには合体できない（拒否される）
scenario({
    name: "transferCantCombineCost1",
    start: {
        me: { spirits: [{ card: TRANSFER, label: "トランスファー", cores: 1 }, { card: VANILLA, label: "ロク", cores: 1 }] },
    },
    steps(t) {
        t.actRejected("me", { type: "combineBrave", braveInstanceId: t.id("トランスファー"), hostInstanceId: t.id("ロク") })
    },
    expect: [],
})

// 合体時節−：スピリット状態のトランスファーは相手を指定してアタックできない（拒否される）
scenario({
    name: "transferSoloCantTargetAttack",
    start: {
        me: { spirits: [{ card: TRANSFER, label: "トランスファー", cores: 1 }] },
        opp: { spirits: [{ card: DUALDO, label: "デュアルド", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.actRejected("me", { type: "attack", instanceId: t.id("トランスファー"), targetSpiritInstanceId: t.id("デュアルド") })
    },
    expect: [],
})

console.log("すべてのチェックに合格しました 🎉（part730）")
