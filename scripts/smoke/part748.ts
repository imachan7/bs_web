// smoke パート748（STARTER-redA：SD03-013 SD03-015 SD03-016 SD10-001 SD10-002 SD10-003 SD10-004 SD10-005）
// 効果文とカードの属性だけから書いた期待値（docs/design/STARTER_PLAN.md §2・BS19_PLAN.md §2【強化】・SEMANTICS_AUDIT §3）。
// effects は未実装なので、現状は落ちてよい（例外で止まらず最後まで走ること）。
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

// ===== 主役 =====
const NEXUS = "SD03-013" // 炎の楽園（ネクサス・赤・コスト4）
const MAGIC_DRAW = "SD03-015" // ブレイヴドロー（マジック・赤・コスト5）
const MAGIC_SAGITTA = "SD03-016" // サジッタフレイム（マジック・赤・コスト5）
const DRAGRA = "SD10-001" // ライト・ブレイドラ（スピリット・赤・星竜・コスト0）
const GUARDLER = "SD10-002" // グローリー・ガードラー（スピリット・赤・星竜・コスト1）
const WYVERN = "SD10-003" // ミラージュ・ワイバーン（スピリット・赤・星竜・コスト2）
const SEASMOKER = "SD10-004" // 蒸気竜シースモーカー（スピリット・赤・星竜・コスト2）
const VULM = "SD10-005" // ブロンズ・ヴルム（スピリット・赤・星竜・コスト3）

// ===== 脇役 =====
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ・Lv1BP1000）
const METALBURN = "BS01-008" // メタルバーン（赤・コスト3・バニラ・Lv1BP3000）
const TERIMUCK = "BS17-019" // テリムック（緑・コスト0・バニラ・Lv1BP2000）
const VAJURANGA = "BS17-007" // ヴァジュランガ（赤・コスト6・バニラ・Lv1BP4000）
const ILLUYANKA = "BS16-053" // イルルヤンカッシュ（青・コスト6・バニラ・Lv1BP5000）
const MATANGOL = "BS10-028" // マタンゴル（緑・コスト5・バニラ・Lv1BP6000）
const CITY = "BS14-090" // 勇壮なる船上都市（ネクサス・青・コスト5。合体スピリットがいないので無害）
const BRAVE_P = "SD13-007" // シャドウ・メイデン（ブレイヴ・紫・コスト4・軽減[紫][紫]）
const BRAVE_R = "SD03-010" // 砲竜バル・ガンナー（ブレイヴ・赤・コスト4）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = (id: string) => getCard(id)
    assert(c(NEXUS).name === "炎の楽園" && c(NEXUS).type === "nexus" && c(NEXUS).colors[0] === "red" && c(NEXUS).cost === 4, "SD03-013は炎の楽園（赤ネクサス・コスト4）")
    assert(c(MAGIC_DRAW).name === "ブレイヴドロー" && c(MAGIC_DRAW).type === "magic" && c(MAGIC_DRAW).colors[0] === "red" && c(MAGIC_DRAW).cost === 5, "SD03-015はブレイヴドロー（赤マジック・コスト5）")
    assert(c(MAGIC_SAGITTA).name === "サジッタフレイム" && c(MAGIC_SAGITTA).type === "magic" && c(MAGIC_SAGITTA).colors[0] === "red" && c(MAGIC_SAGITTA).cost === 5, "SD03-016はサジッタフレイム（赤マジック・コスト5）")
    assert(c(DRAGRA).name === "ライト・ブレイドラ" && c(DRAGRA).type === "spirit" && c(DRAGRA).colors[0] === "red" && c(DRAGRA).family.includes("星竜") && c(DRAGRA).cost === 0, "SD10-001はライト・ブレイドラ（赤・星竜・コスト0）")
    assert(c(GUARDLER).name === "グローリー・ガードラー" && c(GUARDLER).type === "spirit" && c(GUARDLER).colors[0] === "red" && c(GUARDLER).family.includes("星竜") && c(GUARDLER).cost === 1, "SD10-002はグローリー・ガードラー（赤・星竜・コスト1）")
    assert(c(WYVERN).name === "ミラージュ・ワイバーン" && c(WYVERN).type === "spirit" && c(WYVERN).colors[0] === "red" && c(WYVERN).family.includes("星竜") && c(WYVERN).cost === 2, "SD10-003はミラージュ・ワイバーン（赤・星竜・コスト2）")
    assert(c(SEASMOKER).name === "蒸気竜シースモーカー" && c(SEASMOKER).type === "spirit" && c(SEASMOKER).colors[0] === "red" && c(SEASMOKER).family.includes("星竜") && c(SEASMOKER).cost === 2, "SD10-004は蒸気竜シースモーカー（赤・星竜・コスト2）")
    assert(c(VULM).name === "ブロンズ・ヴルム" && c(VULM).type === "spirit" && c(VULM).colors[0] === "red" && c(VULM).family.includes("星竜") && c(VULM).cost === 3, "SD10-005はブロンズ・ヴルム（赤・星竜・コスト3）")
    assert(c(VANILLA).name === "ロクケラトプス" && c(VANILLA).type === "spirit" && c(VANILLA).colors[0] === "red" && c(VANILLA).cost === 1 && c(VANILLA).effect === "", "BS01-002はロクケラトプス（赤・コスト1・バニラ）")
    const lv1bp = (id: string) => getCard(id).levels[0]?.bp ?? -1
    assert(c(METALBURN).name === "メタルバーン" && c(METALBURN).colors[0] === "red" && lv1bp(METALBURN) === 3000 && c(METALBURN).effect === "", "BS01-008はメタルバーン（赤・Lv1BP3000・バニラ）")
    assert(c(TERIMUCK).name === "テリムック" && c(TERIMUCK).colors[0] === "green" && lv1bp(TERIMUCK) === 2000 && c(TERIMUCK).effect === "", "BS17-019はテリムック（緑・Lv1BP2000・バニラ）")
    assert(c(VAJURANGA).name === "ヴァジュランガ" && c(VAJURANGA).colors[0] === "red" && lv1bp(VAJURANGA) === 4000 && c(VAJURANGA).effect === "", "BS17-007はヴァジュランガ（赤・Lv1BP4000・バニラ）")
    assert(c(ILLUYANKA).name === "イルルヤンカッシュ" && c(ILLUYANKA).colors[0] === "blue" && lv1bp(ILLUYANKA) === 5000 && c(ILLUYANKA).effect === "", "BS16-053はイルルヤンカッシュ（青・Lv1BP5000・バニラ）")
    assert(c(MATANGOL).name === "マタンゴル" && c(MATANGOL).colors[0] === "green" && lv1bp(MATANGOL) === 6000 && c(MATANGOL).effect === "", "BS10-028はマタンゴル（緑・Lv1BP6000・バニラ）")
    assert(c(CITY).name === "勇壮なる船上都市" && c(CITY).type === "nexus" && c(CITY).colors[0] === "blue" && c(CITY).cost === 5, "BS14-090は勇壮なる船上都市（青ネクサス・コスト5）")
    assert(c(BRAVE_P).name === "シャドウ・メイデン" && c(BRAVE_P).type === "brave" && c(BRAVE_P).colors[0] === "purple" && c(BRAVE_P).cost === 4, "SD13-007はシャドウ・メイデン（紫ブレイヴ・コスト4・軽減[紫][紫]）")
    assert(c(BRAVE_R).name === "砲竜バル・ガンナー" && c(BRAVE_R).type === "brave" && c(BRAVE_R).colors[0] === "red" && c(BRAVE_R).cost === 4, "SD03-010は砲竜バル・ガンナー（赤ブレイヴ・コスト4）")
}

// ===== SD03-013 炎の楽園 =====
// 節1（Lv1-2）：自分の手札にあるブレイヴカードすべてに軽減シンボル[赤]を与える
scenario({
    name: "SD03-013-grant-reduction",
    start: {
        me: {
            nexuses: [{ card: NEXUS, label: "楽園", cores: 1 }],
            spirits: [{ card: VANILLA }],
            hand: [BRAVE_P],
        },
    },
    steps(t) {
        // シャドウ・メイデン（コスト4・軽減[紫][紫]）に[赤]が加わり、場の赤シンボル（楽園＋ロクケラトプス）で1軽減 → 3支払い＋維持コア1
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: シャドウ・メイデン → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.シャドウ・メイデン.場所: なし → フィールド",
        "自分.シャドウ・メイデン.疲労: なし → false",
        "自分.シャドウ・メイデン.コア: なし → 1",
        "自分.シャドウ・メイデン.Lv: なし → 1",
        "自分.シャドウ・メイデン.BP: なし → 2000",
    ],
})

scenario({
    name: "SD03-013-grant-not-opponents",
    start: {
        me: { spirits: [{ card: VANILLA }], hand: [BRAVE_P] },
        opp: { nexuses: [{ card: NEXUS, label: "楽園", cores: 1 }] },
    },
    steps(t) {
        // 相手の楽園は相手の手札にしか効かない。軽減[紫][紫]に赤シンボルは当たらない → 4支払い＋維持コア1
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: シャドウ・メイデン → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.シャドウ・メイデン.場所: なし → フィールド",
        "自分.シャドウ・メイデン.疲労: なし → false",
        "自分.シャドウ・メイデン.コア: なし → 1",
        "自分.シャドウ・メイデン.Lv: なし → 1",
        "自分.シャドウ・メイデン.BP: なし → 2000",
    ],
})

// 節2（Lv2『自分のドローステップ』）：ドローの枚数を+1枚する
scenario({
    name: "SD03-013-draw-plus1",
    start: { me: { nexuses: [{ card: NEXUS, label: "楽園", cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "endTurn" }) // 相手のターン（相手はドロー1枚）
        t.act("opp", { type: "endTurn" }) // 自分のドローステップ：1+1=2枚
    },
    expect: [
        "自分.デッキ枚数: 40 → 38",
        "自分.手札: なし → ロクケラトプス、ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
        "相手.リザーブ: 10 → 11",
    ],
})

scenario({
    name: "SD03-013-draw-lv1-not-plus1",
    start: { me: { nexuses: [{ card: NEXUS, label: "楽園", cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "endTurn" }) // Lv1なのでドローは1枚のまま
    },
    expect: [
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
        "相手.リザーブ: 10 → 11",
    ],
})

// ===== SD03-015 ブレイヴドロー =====
// 節1（メイン）：2枚ドロー → 上3枚オープンしブレイヴ1枚手札 → 残りをデッキ上に戻す
scenario({
    name: "SD03-015-main-brave-draw",
    start: {
        me: {
            hand: [MAGIC_DRAW],
            deck: [VANILLA, VANILLA, VANILLA, BRAVE_R, ...Array.from({ length: 36 }, () => VANILLA)],
        },
    },
    steps(t) {
        // コスト5・軽減[赤][赤][赤]、場にシンボルなし → 5支払い
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.手札: ブレイヴドロー → ロクケラトプス、ロクケラトプス、砲竜バル・ガンナー",
        "自分.デッキ枚数: 40 → 37",
        "自分.トラッシュ: なし → ブレイヴドロー",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
    ],
})

// 節2（フラッシュ）：このターンの間、スピリット1体をBP+2000する
scenario({
    name: "SD03-015-flash-bp-plus",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: VULM, label: "ヴルム", cores: 1 }], hand: [MAGIC_DRAW] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ヴルム") })
        t.act("opp", { type: "pass" }) // フラッシュは相手が先に優先権を持つ
        // コスト5・軽減[赤][赤][赤]、場の赤シンボル1 → 4支払い
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ヴルム") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ブレイヴドロー → なし",
        "自分.トラッシュ: なし → ブレイヴドロー",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ヴルム.疲労: false → true",
        "自分.ヴルム.BP: 3000 → 5000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ===== SD03-016 サジッタフレイム =====
// 節1（フラッシュ）：BP合計5000まで相手のスピリットを好きなだけ破壊。または、相手のネクサス1つを破壊する
scenario({
    name: "SD03-016-destroy-spirits-budget",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: VANILLA }], hand: [MAGIC_SAGITTA] },
        opp: { spirits: [{ card: METALBURN, label: "メタルバーン" }, { card: TERIMUCK, label: "テリムック" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        // コスト5・軽減[赤][赤][青]、場の赤シンボル1 → 4支払い
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: サジッタフレイム → なし",
        "自分.トラッシュ: なし → サジッタフレイム",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ロクケラトプス.疲労: false → true",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.テリムック.場所: フィールド → なし",
        "相手.トラッシュ: なし → テリムック、メタルバーン",
        "相手.リザーブ: 10 → 13",
        "相手.ライフ: 5 → 4",
    ],
})

scenario({
    name: "SD03-016-destroy-nexus-mode",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: VANILLA }], hand: [MAGIC_SAGITTA] },
        opp: {
            spirits: [{ card: MATANGOL, label: "マタンゴル" }],
            nexuses: [{ card: CITY, label: "船上都市", cores: 0 }],
        },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        // 相手スピリットはBP6000で合計5000の枠に収まらない → ネクサス1つを破壊する方を選ぶ
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: サジッタフレイム → なし",
        "自分.トラッシュ: なし → サジッタフレイム",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ロクケラトプス.疲労: false → true",
        "相手.船上都市.場所: ネクサス → なし",
        "相手.トラッシュ: なし → 勇壮なる船上都市",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ===== SD10-002 グローリー・ガードラー =====
// 節1（Lv1-2『このスピリットのアタック時』）：このスピリットをBP+2000する
scenario({
    name: "SD10-002-attack-bp-plus",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: GUARDLER, label: "ガードラー", cores: 1 }] },
        opp: { spirits: [{ card: METALBURN, label: "メタルバーン" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ガードラー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("メタルバーン") })
        t.closeFlash()
        // アタック時BP+2000で1000+2000=3000。BPが同じなので両者破壊
    },
    expect: [
        "自分.ガードラー.場所: フィールド → なし",
        "自分.トラッシュ: なし → グローリー・ガードラー",
        "自分.リザーブ: 10 → 11",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン",
        "相手.リザーブ: 10 → 11",
    ],
})

// ===== SD10-004 蒸気竜シースモーカー（【強化】の受け手として使う） =====
// 節1（Lv1-2『このスピリットの破壊時』）：BP4000以下の相手のスピリット1体を破壊する
scenario({
    name: "SD10-004-ondestroy-bp4000",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: SEASMOKER, label: "シースモーカー", cores: 1 }] },
        opp: { spirits: [{ card: VAJURANGA, label: "ヴァジュランガ" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("シースモーカー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ヴァジュランガ") })
        t.closeFlash()
        // 1000 < 4000 で破壊。破壊時：BP4000以下のヴァジュランガ（4000）を破壊
    },
    expect: [
        "自分.シースモーカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → 蒸気竜シースモーカー",
        "自分.リザーブ: 10 → 11",
        "相手.ヴァジュランガ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヴァジュランガ",
        "相手.リザーブ: 10 → 11",
    ],
})

scenario({
    name: "SD10-004-ondestroy-bp5000-not-destroyed",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: SEASMOKER, label: "シースモーカー", cores: 1 }] },
        opp: { spirits: [{ card: ILLUYANKA, label: "イルルヤンカッシュ" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("シースモーカー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("イルルヤンカッシュ") })
        t.closeFlash()
        // 破壊時は発動するが BP5000 > 4000 なのでイルルヤンカッシュは残る
    },
    expect: [
        "自分.シースモーカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → 蒸気竜シースモーカー",
        "自分.リザーブ: 10 → 11",
        "相手.イルルヤンカッシュ.疲労: false → true",
    ],
})

// ===== SD10-001 ライト・ブレイドラ（Lv1-3【強化】：BP破壊効果の上限+1000） =====
scenario({
    name: "SD10-001-kyoka-raises-cap",
    start: {
        turn: "me",
        phase: "attack",
        me: {
            spirits: [
                { card: SEASMOKER, label: "シースモーカー", cores: 1 },
                { card: DRAGRA, label: "ブレイドラ", cores: 1 },
            ],
        },
        opp: { spirits: [{ card: ILLUYANKA, label: "イルルヤンカッシュ" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("シースモーカー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("イルルヤンカッシュ") })
        t.closeFlash()
        // 【強化】で破壊時の上限が4000+1000=5000になり、イルルヤンカッシュ（5000）も破壊
    },
    expect: [
        "自分.シースモーカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → 蒸気竜シースモーカー",
        "自分.リザーブ: 10 → 11",
        "相手.イルルヤンカッシュ.場所: フィールド → なし",
        "相手.トラッシュ: なし → イルルヤンカッシュ",
        "相手.リザーブ: 10 → 11",
    ],
})

// ===== SD10-002 Lv2【強化】 =====
scenario({
    name: "SD10-002-lv2-kyoka-raises-cap",
    start: {
        turn: "me",
        phase: "attack",
        me: {
            spirits: [
                { card: SEASMOKER, label: "シースモーカー", cores: 1 },
                { card: GUARDLER, label: "ガードラー", cores: 2 },
            ],
        },
        opp: { spirits: [{ card: ILLUYANKA, label: "イルルヤンカッシュ" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("シースモーカー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("イルルヤンカッシュ") })
        t.closeFlash()
        // Lv2のガードラーの【強化】で上限5000。イルルヤンカッシュ（5000）も破壊
    },
    expect: [
        "自分.シースモーカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → 蒸気竜シースモーカー",
        "自分.リザーブ: 10 → 11",
        "相手.イルルヤンカッシュ.場所: フィールド → なし",
        "相手.トラッシュ: なし → イルルヤンカッシュ",
        "相手.リザーブ: 10 → 11",
    ],
})

// ===== SD10-005 ブロンズ・ヴルム（Lv1-3【強化】） =====
scenario({
    name: "SD10-005-kyoka-raises-cap",
    start: {
        turn: "me",
        phase: "attack",
        me: {
            spirits: [
                { card: SEASMOKER, label: "シースモーカー", cores: 1 },
                { card: VULM, label: "ヴルム", cores: 1 },
            ],
        },
        opp: { spirits: [{ card: ILLUYANKA, label: "イルルヤンカッシュ" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("シースモーカー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("イルルヤンカッシュ") })
        t.closeFlash()
        // ヴルムの【強化】で上限5000。イルルヤンカッシュ（5000）も破壊
    },
    expect: [
        "自分.シースモーカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → 蒸気竜シースモーカー",
        "自分.リザーブ: 10 → 11",
        "相手.イルルヤンカッシュ.場所: フィールド → なし",
        "相手.トラッシュ: なし → イルルヤンカッシュ",
        "相手.リザーブ: 10 → 11",
    ],
})

// ===== SD10-003 ミラージュ・ワイバーン =====
// 節1（Lv2-3『このスピリットのアタック時』）：自分はデッキから1枚ドローする
scenario({
    name: "SD10-003-attack-draw",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: WYVERN, label: "ワイバーン", cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ワイバーン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ワイバーン.疲労: false → true",
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

scenario({
    name: "SD10-003-lv1-no-draw",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: WYVERN, label: "ワイバーン", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ワイバーン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ワイバーン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part748）")
