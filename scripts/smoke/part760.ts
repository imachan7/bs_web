// smoke パート760（SD14-008 SD14-X01 SD15-001〜008 SD15-X01：効果文どおりの期待値。STARTER_SURVEY_pyg §3・STARTER_PLAN §2・BS19_PLAN §2 参照）
// effects は未実装なので落ちてよい。落ちること自体が実装役の目標になる。
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

// ── 主役11枚の機械確認（名前・種別・色・系統） ──
{
    const ids: Array<[string, string, string, string, string[]]> = [
        ["SD14-008", "インセクトアッセンブル", "magic", "green", []],
        ["SD14-X01", "甲樹神ヘラク・ダイナス", "spirit", "green", ["怪虫", "殻虫"]],
        ["SD15-001", "天使パティエル", "spirit", "yellow", ["天霊"]],
        ["SD15-002", "天使マカエル", "spirit", "yellow", ["天霊"]],
        ["SD15-003", "天使アーチェル", "spirit", "yellow", ["天霊"]],
        ["SD15-004", "天使アクセラ", "spirit", "yellow", ["天霊"]],
        ["SD15-005", "天使ブラスティエル", "spirit", "yellow", ["天霊"]],
        ["SD15-006", "エンジェロイド", "brave", "yellow", ["天霊"]],
        ["SD15-007", "アセンションゼロ", "magic", "yellow", []],
        ["SD15-008", "マジカルドロー", "magic", "yellow", []],
        ["SD15-X01", "戦天使イクセル", "spirit", "yellow", ["天霊"]],
    ]
    for (const [id, name, type, color, family] of ids) {
        const c = getCard(id)
        assert(c.name === name && c.type === type && c.colors.length === 1 && c.colors[0] === color, `${id}は${name}（${type}・${color}）`)
        assert(JSON.stringify(c.family) === JSON.stringify(family), `${id}の系統は${family.join("・")}`)
    }
}

// ── 脇役の機械確認 ──
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const MANTIS = "BS08-020" // ディオ・マンティス（緑・怪虫・コスト2・バニラ）
const ZOU = "BS16-020" // ゾウガオムシ（緑・怪虫・コスト2・バニラ）
const MACH = "BS04-026" // ブラックマッハジー（緑・怪虫・コスト3・バニラ）
const INE = "SD14-003" // イネゴバッタ（緑・怪虫・コスト3・【神速】）
const ORYX = "BS17-046" // オリクス盗賊団（青・コスト1・バニラ＝青シンボル要員）
const PRESS = "BS19-109" // エンジェリックプレッシャー（黄・コスト3・フラッシュ：このターン相手1体をBP-3000）
const FLAME = "BS09-069" // フレイムガスト（赤・コスト6・フラッシュ：BP6000以下の相手1体を破壊）
const GOLEM = "BS11-044" // シェル・ゴレム（青・コスト4・バニラ）
const ILLU = "BS16-053" // イルルヤンカッシュ（青・コスト6・バニラ）
{
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).colors[0] === "red" && getCard(VANILLA).family.includes("地竜"), "VANILLAはロクケラトプス（赤・地竜）")
    assert(getCard(MANTIS).name === "ディオ・マンティス" && getCard(MANTIS).colors[0] === "green" && getCard(MANTIS).family.includes("怪虫"), "MANTISはディオ・マンティス（緑・怪虫）")
    assert(getCard(ZOU).name === "ゾウガオムシ" && getCard(ZOU).colors[0] === "green" && getCard(ZOU).family.includes("怪虫"), "ZOUはゾウガオムシ（緑・怪虫）")
    assert(getCard(MACH).name === "ブラックマッハジー" && getCard(MACH).colors[0] === "green" && getCard(MACH).family.includes("怪虫") && getCard(MACH).cost === 3, "MACHはブラックマッハジー（緑・怪虫・コスト3）")
    assert(getCard(INE).name === "イネゴバッタ" && getCard(INE).colors[0] === "green" && getCard(INE).family.includes("怪虫") && (getCard(INE).effect ?? "").includes("【神速】"), "INEはイネゴバッタ（緑・怪虫・【神速】）")
    assert(getCard(ORYX).name === "オリクス盗賊団" && getCard(ORYX).colors[0] === "blue", "ORYXはオリクス盗賊団（青）")
    assert(getCard(PRESS).name === "エンジェリックプレッシャー" && getCard(PRESS).colors[0] === "yellow" && getCard(PRESS).type === "magic", "PRESSはエンジェリックプレッシャー（黄・マジック）")
    assert(getCard(FLAME).name === "フレイムガスト" && getCard(FLAME).colors[0] === "red" && getCard(FLAME).type === "magic", "FLAMEはフレイムガスト（赤・マジック）")
    assert(getCard(GOLEM).name === "シェル・ゴレム" && getCard(GOLEM).colors[0] === "blue", "GOLEMはシェル・ゴレム（青）")
    assert(getCard(ILLU).name === "イルルヤンカッシュ" && getCard(ILLU).colors[0] === "blue", "ILLUはイルルヤンカッシュ（青）")
}

// ════════ SD14-008 インセクトアッセンブル（緑・コスト5・軽減緑2） ════════
// フラッシュ：怪虫3体を回復。連鎖[青]：コスト3以下の相手1体を破壊
scenario({
    name: "sd14-008-refresh-and-chain",
    start: {
        me: {
            hand: ["SD14-008"],
            spirits: [
                { card: MANTIS, rested: true },
                { card: ZOU, rested: true },
                { card: MACH, rested: true },
                { card: ORYX },
            ],
        },
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.ディオ・マンティス.疲労: true → false",
        "自分.ゾウガオムシ.疲労: true → false",
        "自分.ブラックマッハジー.疲労: true → false",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: インセクトアッセンブル → なし",
        "自分.トラッシュ: なし → インセクトアッセンブル",
    ],
})
// 青シンボルがなければ連鎖は発揮しない（回復だけ起きる）
scenario({
    name: "sd14-008-no-blue-no-destroy",
    start: {
        me: {
            hand: ["SD14-008"],
            spirits: [
                { card: MANTIS, rested: true },
                { card: ZOU, rested: true },
                { card: MACH, rested: true },
            ],
        },
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.ディオ・マンティス.疲労: true → false",
        "自分.ゾウガオムシ.疲労: true → false",
        "自分.ブラックマッハジー.疲労: true → false",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: インセクトアッセンブル → なし",
        "自分.トラッシュ: なし → インセクトアッセンブル",
    ],
})

// ════════ SD14-X01 甲樹神ヘラク・ダイナス（緑・怪虫/殻虫・コスト7） ════════
// Lv1-3『自分のアタックステップ』：このスピリットか【神速】持ちのアタックは2体ブロック必須
scenario({
    name: "sd14x01-self-attack-needs-two-blockers",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD14-X01", label: "ヘラク", cores: 1 }, { card: INE, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA }, { card: ORYX }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ヘラク") })
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ヘラク.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// 【神速】持ちのアタックでも同じ
scenario({
    name: "sd14x01-shinsoku-attack-needs-two-blockers",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD14-X01", label: "ヘラク", cores: 1 }, { card: INE, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA }, { card: ORYX }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("イネゴバッタ") })
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.イネゴバッタ.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// 【神速】を持たないほかのスピリットのアタックなら1体でブロックできる
scenario({
    name: "sd14x01-other-attack-single-block-ok",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD14-X01", label: "ヘラク", cores: 1 }, { card: INE, cores: 1 }, { card: MANTIS, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA }, { card: ORYX }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ディオ・マンティス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "自分.ディオ・マンティス.疲労: false → true",
    ],
})
// Lv2-3：怪虫すべてをBP+2000（発生源自身も怪虫なので含む。BP4000ブロッカーに勝つ）
scenario({
    name: "sd14x01-lv2-aura-kaichu-bp2000",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD14-X01", label: "ヘラク", cores: 3 }, { card: MANTIS, cores: 1 }, { card: ORYX, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ディオ・マンティス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 13",
        "自分.ディオ・マンティス.疲労: false → true",
    ],
})
// Lv1ならBP+2000はなく、BP4000ブロッカーに負ける
scenario({
    name: "sd14x01-lv1-no-aura-lose",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD14-X01", label: "ヘラク", cores: 1 }, { card: MANTIS, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ディオ・マンティス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.ディオ・マンティス.場所: フィールド → なし",
        "自分.トラッシュ: なし → ディオ・マンティス",
        "自分.リザーブ: 10 → 11",
        "相手.ロクケラトプス.疲労: false → true",
    ],
})

// ════════ SD15-001 天使パティエル（黄・天霊・コスト2） ════════
// Lv1-2【強化】：自分の「BP-効果」を-1000する（BP-3000がBP-4000になる）
scenario({
    name: "sd15-001-kyoka-strengthens-own-bpminus",
    start: {
        me: { hand: [PRESS], spirits: [{ card: "SD15-001", cores: 1 }] },
        opp: { spirits: [{ card: MANTIS, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "相手.ディオ・マンティス.BP: 5000 → 1000",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: エンジェリックプレッシャー → なし",
        "自分.トラッシュ: なし → エンジェリックプレッシャー",
    ],
})
// 【強化】がなければBP-3000のまま
scenario({
    name: "sd15-001-no-kyoka-base-bpminus",
    start: {
        me: { hand: [PRESS] },
        opp: { spirits: [{ card: MANTIS, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "相手.ディオ・マンティス.BP: 5000 → 2000",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: エンジェリックプレッシャー → なし",
        "自分.トラッシュ: なし → エンジェリックプレッシャー",
    ],
})

// ════════ SD15-002 天使マカエル（黄・天霊・コスト2） ════════
// Lv1-2【強化】
scenario({
    name: "sd15-002-kyoka-strengthens-own-bpminus",
    start: {
        me: { hand: [PRESS], spirits: [{ card: "SD15-002", cores: 1 }] },
        opp: { spirits: [{ card: MANTIS, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "相手.ディオ・マンティス.BP: 5000 → 1000",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: エンジェリックプレッシャー → なし",
        "自分.トラッシュ: なし → エンジェリックプレッシャー",
    ],
})
// Lv2：相手のスピリットがBP0になったら、BP0のスピリットすべてを疲労させる
scenario({
    name: "sd15-002-lv2-bp0-exhausts",
    start: {
        me: { hand: [PRESS], spirits: [{ card: "SD15-002", cores: 2 }] },
        opp: { spirits: [{ card: MANTIS, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "相手.ディオ・マンティス.BP: 3000 → 0",
        "相手.ディオ・マンティス.疲労: false → true",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: エンジェリックプレッシャー → なし",
        "自分.トラッシュ: なし → エンジェリックプレッシャー",
    ],
})
// Lv1ならBP0になっても疲労しない
scenario({
    name: "sd15-002-lv1-bp0-no-exhaust",
    start: {
        me: { hand: [PRESS], spirits: [{ card: "SD15-002", cores: 1 }] },
        opp: { spirits: [{ card: MANTIS, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "相手.ディオ・マンティス.BP: 3000 → 0",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: エンジェリックプレッシャー → なし",
        "自分.トラッシュ: なし → エンジェリックプレッシャー",
    ],
})

// ════════ SD15-003 天使アーチェル（黄・天霊・コスト3） ════════
// Lv1-3『このスピリットのアタック時』：このターン相手1体をBP-1000
scenario({
    name: "sd15-003-attack-bpminus1000",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD15-003", cores: 1 }] },
        opp: { spirits: [{ card: MANTIS, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("天使アーチェル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.ディオ・マンティス.BP: 3000 → 2000",
        "自分.天使アーチェル.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// ほかのスピリットのアタックでは起きない
scenario({
    name: "sd15-003-other-attack-no-bpminus",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD15-003", cores: 1 }, { card: MANTIS, cores: 1 }] },
        opp: { spirits: [{ card: MANTIS, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("自分.ディオ・マンティス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ディオ・マンティス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// Lv2-3『このスピリットの破壊時』：このターン、コスト3以下の相手はアタックできない
scenario({
    name: "sd15-003-lv2-destroy-cant-attack",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: "SD15-003", cores: 2 }] },
        opp: { spirits: [{ card: VANILLA, cores: 3 }, { card: MACH, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("天使アーチェル") })
        t.closeFlash()
        t.actRejected("opp", { type: "attack", instanceId: t.id("ブラックマッハジー") })
    },
    expect: [
        "自分.天使アーチェル.場所: フィールド → なし",
        "自分.トラッシュ: なし → 天使アーチェル",
        "自分.リザーブ: 10 → 12",
        "相手.ロクケラトプス.疲労: false → true",
    ],
})
// Lv1で破壊されてもアタック制限は起きない
scenario({
    name: "sd15-003-lv1-destroy-can-attack",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: "SD15-003", cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 3 }, { card: MACH, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("天使アーチェル") })
        t.closeFlash()
        t.act("opp", { type: "attack", instanceId: t.id("ブラックマッハジー") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.天使アーチェル.場所: フィールド → なし",
        "自分.トラッシュ: なし → 天使アーチェル",
        "自分.リザーブ: 10 → 11",
        "相手.ロクケラトプス.疲労: false → true",
        "相手.ブラックマッハジー.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})

// ════════ SD15-004 天使アクセラ（黄・天霊・コスト4） ════════
// Lv1-3『このスピリットのアタック時』：このターン相手1体をBP-2000
scenario({
    name: "sd15-004-attack-bpminus2000",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD15-004", cores: 1 }] },
        opp: { spirits: [{ card: MANTIS, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("天使アクセラ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.ディオ・マンティス.BP: 3000 → 1000",
        "自分.天使アクセラ.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// ほかのスピリットのアタックでは起きない
scenario({
    name: "sd15-004-other-attack-no-bpminus",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD15-004", cores: 1 }, { card: MANTIS, cores: 1 }] },
        opp: { spirits: [{ card: MANTIS, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("自分.ディオ・マンティス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ディオ・マンティス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// Lv2-3『このスピリットのアタック時』：BPの低い相手とのBP比べはブロックされなかった扱い
scenario({
    name: "sd15-004-lv2-low-bp-blocker-unblocked",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD15-004", cores: 2 }] },
        opp: { spirits: [{ card: VANILLA, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("天使アクセラ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.ロクケラトプス.BP: 4000 → 2000",
        "相手.ロクケラトプス.疲労: false → true",
        "自分.天使アクセラ.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// BPの低い相手でなければ通常どおりBPを比べる（BP-2000後も5000>4000）
scenario({
    name: "sd15-004-lv2-high-bp-blocker-normal-battle",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD15-004", cores: 2 }] },
        opp: { spirits: [{ card: GOLEM, cores: 4 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("天使アクセラ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("シェル・ゴレム") })
        t.closeFlash()
    },
    expect: [
        "相手.シェル・ゴレム.BP: 7000 → 5000",
        "相手.シェル・ゴレム.疲労: false → true",
        "自分.天使アクセラ.場所: フィールド → なし",
        "自分.トラッシュ: なし → 天使アクセラ",
        "自分.リザーブ: 10 → 12",
    ],
})

// ════════ SD15-005 天使ブラスティエル（黄・天霊・コスト5） ════════
// Lv1-3【強化】
scenario({
    name: "sd15-005-kyoka-strengthens-own-bpminus",
    start: {
        me: { hand: [PRESS], spirits: [{ card: "SD15-005", cores: 1 }] },
        opp: { spirits: [{ card: MANTIS, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "相手.ディオ・マンティス.BP: 5000 → 1000",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: エンジェリックプレッシャー → なし",
        "自分.トラッシュ: なし → エンジェリックプレッシャー",
    ],
})
// Lv2-3『相手のアタックステップ』：BP4000以下のアタックではライフが減らない
scenario({
    name: "sd15-005-lv2-low-attack-no-life-loss",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: "SD15-005", cores: 2 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.ロクケラトプス.疲労: false → true"],
})
// BP4000より大きいアタックならライフは減る
scenario({
    name: "sd15-005-lv2-high-attack-life-loss",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: "SD15-005", cores: 2 }] },
        opp: { spirits: [{ card: MANTIS, cores: 3 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ディオ・マンティス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.ディオ・マンティス.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})
// Lv3『このスピリットの破壊時』：手札に戻る
scenario({
    name: "sd15-005-lv3-destroy-back-to-hand",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: "SD15-005", cores: 3 }] },
        opp: { spirits: [{ card: ILLU, cores: 4 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("イルルヤンカッシュ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("天使ブラスティエル") })
        t.closeFlash()
    },
    expect: [
        "自分.天使ブラスティエル.場所: フィールド → なし",
        "自分.手札: なし → 天使ブラスティエル",
        "自分.リザーブ: 10 → 13",
        "相手.イルルヤンカッシュ.疲労: false → true",
    ],
})
// Lv2の破壊ならトラッシュへ行くだけ
scenario({
    name: "sd15-005-lv2-destroy-to-trash",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: "SD15-005", cores: 2 }] },
        opp: { spirits: [{ card: ILLU, cores: 4 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("イルルヤンカッシュ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("天使ブラスティエル") })
        t.closeFlash()
    },
    expect: [
        "自分.天使ブラスティエル.場所: フィールド → なし",
        "自分.トラッシュ: なし → 天使ブラスティエル",
        "自分.リザーブ: 10 → 12",
        "相手.イルルヤンカッシュ.疲労: false → true",
    ],
})

// ════════ SD15-006 エンジェロイド（黄・天霊・コスト4・ブレイヴ） ════════
// Lv1『このブレイヴの召喚時』：トラッシュの天霊コスト3以下3枚を無償召喚
scenario({
    name: "sd15-006-summon-three-from-trash",
    start: {
        me: { hand: ["SD15-006"], trash: ["SD15-001", "SD15-002", "SD15-003"] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: エンジェロイド → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: 天使アーチェル、天使パティエル、天使マカエル → なし",
        "自分.エンジェロイド.場所: なし → フィールド",
        "自分.エンジェロイド.疲労: なし → false",
        "自分.エンジェロイド.コア: なし → 1",
        "自分.エンジェロイド.Lv: なし → 1",
        "自分.エンジェロイド.BP: なし → 2000",
        "自分.天使パティエル.場所: なし → フィールド",
        "自分.天使パティエル.疲労: なし → false",
        "自分.天使パティエル.コア: なし → 1",
        "自分.天使パティエル.Lv: なし → 1",
        "自分.天使パティエル.BP: なし → 3000",
        "自分.天使マカエル.場所: なし → フィールド",
        "自分.天使マカエル.疲労: なし → false",
        "自分.天使マカエル.コア: なし → 1",
        "自分.天使マカエル.Lv: なし → 1",
        "自分.天使マカエル.BP: なし → 1000",
        "自分.天使アーチェル.場所: なし → フィールド",
        "自分.天使アーチェル.疲労: なし → false",
        "自分.天使アーチェル.コア: なし → 1",
        "自分.天使アーチェル.Lv: なし → 1",
        "自分.天使アーチェル.BP: なし → 2000",
    ],
})
// トラッシュに該当がなければ召喚しない（コスト5の天霊と天霊以外は対象外）
scenario({
    name: "sd15-006-no-valid-in-trash",
    start: {
        me: { hand: ["SD15-006"], trash: [VANILLA, "SD15-005"] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: エンジェロイド → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.エンジェロイド.場所: なし → フィールド",
        "自分.エンジェロイド.疲労: なし → false",
        "自分.エンジェロイド.コア: なし → 1",
        "自分.エンジェロイド.Lv: なし → 1",
        "自分.エンジェロイド.BP: なし → 2000",
    ],
})
// 【合体時】『このスピリットの合体アタック時』：指定した相手1体はこのターンブロックできない
scenario({
    name: "sd15-006-combined-attack-cant-block",
    start: {
        me: { hand: ["SD15-006"], spirits: [{ card: "SD15-001", cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("天使パティエル") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("天使パティエル") })
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: エンジェロイド → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.天使パティエル.BP: 3000 → 5000",
        "自分.エンジェロイド.場所: なし → 合体",
        "自分.エンジェロイド.疲労: なし → false",
        "自分.エンジェロイド.コア: なし → 0",
        "自分.エンジェロイド.Lv: なし → 1",
        "自分.天使パティエル.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// 合体していなければ（スピリット状態のアタックなら）ブロックできる
scenario({
    name: "sd15-006-uncombined-attack-blockable",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD15-006", cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("エンジェロイド") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "自分.エンジェロイド.疲労: false → true",
    ],
})

// ════════ SD15-007 アセンションゼロ（黄・コスト3・マジック） ════════
// フラッシュ：このターンBP0になったらすべて疲労。その後相手1体をBP-2000
scenario({
    name: "sd15-007-bp0-exhaust-then-minus",
    start: {
        me: { hand: ["SD15-007"] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "相手.ロクケラトプス.BP: 1000 → 0",
        "相手.ロクケラトプス.疲労: false → true",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: アセンションゼロ → なし",
        "自分.トラッシュ: なし → アセンションゼロ",
    ],
})
// BP0にならなければ疲労しない
scenario({
    name: "sd15-007-no-bp0-no-exhaust",
    start: {
        me: { hand: ["SD15-007"] },
        opp: { spirits: [{ card: MANTIS, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "相手.ディオ・マンティス.BP: 3000 → 1000",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: アセンションゼロ → なし",
        "自分.トラッシュ: なし → アセンションゼロ",
    ],
})

// ════════ SD15-008 マジカルドロー（黄・コスト5・マジック） ════════
// メイン：1ドロー→上5枚オープン・【強化】持ちを回収→残りを上に戻す
scenario({
    name: "sd15-008-main-draw-and-kyoka-pick",
    start: {
        me: {
            hand: ["SD15-008"],
            deck: ["SD15-001", VANILLA, "SD15-002", VANILLA, VANILLA, VANILLA, VANILLA, VANILLA, VANILLA, VANILLA],
        },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "自分.手札: マジカルドロー → 天使パティエル、天使マカエル",
        "自分.デッキ枚数: 10 → 4",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.トラッシュ: なし → マジカルドロー",
    ],
})
// 【強化】持ちがいなければ1ドローだけ
scenario({
    name: "sd15-008-main-no-kyoka-draw-only",
    start: {
        me: { hand: ["SD15-008"], deck: Array.from({ length: 10 }, () => VANILLA) },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "自分.手札: マジカルドロー → ロクケラトプス",
        "自分.デッキ枚数: 10 → 9",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.トラッシュ: なし → マジカルドロー",
    ],
})
// フラッシュ：このターン1体をBP-3000
scenario({
    name: "sd15-008-flash-bpminus3000",
    start: {
        me: { hand: ["SD15-008"] },
        opp: { spirits: [{ card: VANILLA, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [
        "相手.ロクケラトプス.BP: 4000 → 1000",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.手札: マジカルドロー → なし",
        "自分.トラッシュ: なし → マジカルドロー",
    ],
})

// ════════ SD15-X01 戦天使イクセル（黄・天霊・コスト6） ════════
// Lv1-3『このスピリットのアタック時』：このターン相手1体をBP-3000
scenario({
    name: "sd15x01-attack-bpminus3000",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD15-X01", cores: 1 }] },
        opp: { spirits: [{ card: MANTIS, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("戦天使イクセル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.ディオ・マンティス.BP: 3000 → 0",
        "自分.戦天使イクセル.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// ほかのスピリットのアタックでは起きない
scenario({
    name: "sd15x01-other-attack-no-bpminus",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD15-X01", cores: 1 }, { card: MANTIS, cores: 1 }] },
        opp: { spirits: [{ card: MANTIS, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("自分.ディオ・マンティス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ディオ・マンティス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// Lv2-3『このスピリットのアタック時』：このスピリットの効果でBP0になったらすべて破壊
scenario({
    name: "sd15x01-lv2-bp0-destroy",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD15-X01", cores: 3 }] },
        opp: { spirits: [{ card: MANTIS, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("戦天使イクセル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.ディオ・マンティス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ディオ・マンティス",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
        "自分.戦天使イクセル.疲労: false → true",
    ],
})
// Lv1-3：コスト3以下の自分のスピリットが相手の効果で破壊されたら手札に戻り、1ドロー
scenario({
    name: "sd15x01-destroyed-by-opponent-effect-to-hand",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD15-X01", cores: 1 }, { card: MACH, cores: 1 }] },
        opp: { hand: [FLAME] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("戦天使イクセル") })
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ブラックマッハジー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ブラックマッハジー.場所: フィールド → なし",
        "自分.手札: なし → ブラックマッハジー、ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 11",
        "自分.戦天使イクセル.疲労: false → true",
        "相手.手札: フレイムガスト → なし",
        "相手.リザーブ: 10 → 4",
        "相手.トラッシュのコア: 0 → 6",
        "相手.トラッシュ: なし → フレイムガスト",
        "相手.ライフ: 5 → 4",
    ],
})
// バトルで破壊されたなら手札に戻らない
scenario({
    name: "sd15x01-destroyed-by-battle-to-trash",
    start: {
        phase: "attack",
        me: { spirits: [{ card: "SD15-X01", cores: 1 }, { card: MACH, cores: 1 }] },
        opp: { spirits: [{ card: GOLEM, cores: 4 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ブラックマッハジー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("シェル・ゴレム") })
        t.closeFlash()
    },
    expect: [
        "自分.ブラックマッハジー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ブラックマッハジー",
        "自分.リザーブ: 10 → 11",
        "相手.シェル・ゴレム.疲労: false → true",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part760）")
