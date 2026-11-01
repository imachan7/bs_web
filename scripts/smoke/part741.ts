// smoke パート741（BS19 青9枚: BS19-078/094/095/096/112/113/114/X06/X08 の期待値。
// 効果文とカードの属性だけから書く（docs/design/TEST_STRATEGY.md §5・§6・CONJUNCTION.md・
// BS19_PLAN.md §2・SEMANTICS_AUDIT.md §3.23〜3.25）。【強化】の行は part726 が見るため書かない。
// BS19 の effects はまだ空なので、効果が絡む場面は現状落ちる。例外では止まらないこと）
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

// ── 対象9枚 ──
const T078 = "BS19-078" // 海獣グーロ（青・ブレイヴ・コスト4・異合）
const N094 = "BS19-094" // 永遠なる水道橋（青・ネクサス・コスト4）
const N095 = "BS19-095" // 光灯る三叉灯台（青・ネクサス・コスト6）
const N096 = "BS19-096" // 海魔巣食う海域（青/赤・ネクサス・コスト5）
const M112 = "BS19-112" // オーシャンフィールド（青・マジック・コスト3）
const M113 = "BS19-113" // ダブルバイセップス（青・マジック・コスト4）
const M114 = "BS19-114" // ポセイドンクラッシュ（青・マジック・コスト6）
const X06 = "BS19-X06" // 戦輝神ゼルドナーグ（青・スピリット・コスト7・闘神）
const X08 = "BS19-X08" // 蒼海の大剣メイルシュトロム（青・ブレイヴ・コスト6・剣刃）

// ── 脇役（既存の弾から。BS19 は effects がまだ無いので BS19-060 だけ例外） ──
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・バニラ）
const HAMMER = "BS01-007" // ハンマドレイク（赤・コスト2・地竜。Lv1 BP4000・赤シンボル）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3・幽魔。『召喚時』ドロー1枚）
const JEFFREY = "BS03-072" // 槍兵のジェフリー（青・コスト1・闘神。バニラ）
const STATUE = "BS03-073" // ストン・スタチュー（青・コスト1・造兵。効果持ちの青シンボル）
const RAZARUS = "BS03-076" // 爪剣のラザラス（青・コスト2・闘神。3Lv持ち）
const TROLL = "BS03-078" // 暴れトロル（青・コスト2・創手。バニラ BP3000）
const BEARD = "BS03-083" // 熊男ベアード（青・コスト3・獣頭。3Lv持ちのバニラ）
const ARNOLD = "BS03-089" // ディープ・アーノルド（青・コスト4・異合。バニラ BP4000）
const BANFA = "BS03-091" // 戦闘獣バン・ファロー（青・コスト5・戦獣。バニラ BP4000）
const MONGKOU = "BS04-062" // 猿人モンゴクウ（青・コスト2・獣頭/勇傑。闘神でないバニラ）
const REDWALL = "BS04-110" // レッドウォール（青・コスト2・軽減[青]のフラッシュマジック）
const SHIBA = "BS10-067" // からくり犬シバ（緑・ブレイヴ・コスト3・樹魔。『召喚時』ボイドからリザーブへ）
const GEPA = "BS10-064" // 骸戦車ゲパルバート（紫・ブレイヴ・コスト3・無魔。『召喚時』ドロー1枚）
const KRISH = "BS17-005" // ドラグ・クリシュナー（赤・コスト5・覇皇/翼竜。バースト効果持ち）
const BAZEL = "BS16-X01" // 爆炎の覇王ロード・ドラゴン・バゼル（赤・コスト7。バースト:ライフ減少後・無償召喚）
const LOVN = "BS15-030" // 愛の女神ロヴン（白・コスト3・氷姫。疲労で自分のデッキ破棄を防ぐ）
const MINOTA = "BS19-060" // ミノタ・コルス（青・コスト3・異合。【連鎖】持ち。BS19 のほかに連鎖スピリットがいないため起用）

console.log("=== 前提: カードの機械確認 ===")
{
    // cardId は記憶で書かない。名前・種別・色・系統・コストをここで必ず確かめる
    const t = (id: string, name: string, type: string, colors: string[], family: string[], cost: number) => {
        const c = getCard(id)
        assert(c.name === name, `${id}は${name}`)
        assert(c.type === type, `${name}は${type}`)
        assert(JSON.stringify(c.colors) === JSON.stringify(colors), `${name}の色は${colors.join("/")}`)
        assert(JSON.stringify(c.family ?? []) === JSON.stringify(family), `${name}の系統は${family.join("/")}`)
        assert(c.cost === cost, `${name}のコストは${cost}`)
    }
    t(T078, "海獣グーロ", "brave", ["blue"], ["異合"], 4)
    t(N094, "永遠なる水道橋", "nexus", ["blue"], [], 4)
    t(N095, "光灯る三叉灯台", "nexus", ["blue"], [], 6)
    t(N096, "海魔巣食う海域", "nexus", ["blue", "red"], [], 5)
    t(M112, "オーシャンフィールド", "magic", ["blue"], [], 3)
    t(M113, "ダブルバイセップス", "magic", ["blue"], [], 4)
    t(M114, "ポセイドンクラッシュ", "magic", ["blue"], [], 6)
    t(X06, "戦輝神ゼルドナーグ", "spirit", ["blue"], ["闘神"], 7)
    t(X08, "蒼海の大剣メイルシュトロム", "brave", ["blue"], ["剣刃"], 6)
    t(VANILLA, "ロクケラトプス", "spirit", ["red"], ["地竜"], 1)
    t(HAMMER, "ハンマドレイク", "spirit", ["red"], ["地竜"], 2)
    t(GRIP, "グリプ・ハンズ", "spirit", ["purple"], ["幽魔"], 3)
    t(JEFFREY, "槍兵のジェフリー", "spirit", ["blue"], ["闘神"], 1)
    t(STATUE, "ストン・スタチュー", "spirit", ["blue"], ["造兵"], 1)
    t(RAZARUS, "爪剣のラザラス", "spirit", ["blue"], ["闘神"], 2)
    t(TROLL, "暴れトロル", "spirit", ["blue"], ["創手"], 2)
    t(BEARD, "熊男ベアード", "spirit", ["blue"], ["獣頭"], 3)
    t(ARNOLD, "ディープ・アーノルド", "spirit", ["blue"], ["異合"], 4)
    t(BANFA, "戦闘獣バン・ファロー", "spirit", ["blue"], ["戦獣"], 5)
    t(MONGKOU, "猿人モンゴクウ", "spirit", ["blue"], ["獣頭", "勇傑"], 2)
    t(REDWALL, "レッドウォール", "magic", ["blue"], [], 2)
    t(SHIBA, "からくり犬シバ", "brave", ["green"], ["樹魔"], 3)
    t(GEPA, "骸戦車ゲパルバート", "brave", ["purple"], ["無魔"], 3)
    t(KRISH, "ドラグ・クリシュナー", "spirit", ["red"], ["覇皇", "翼竜"], 5)
    t(BAZEL, "爆炎の覇王ロード・ドラゴン・バゼル", "spirit", ["red"], ["覇皇", "戦竜"], 7)
    t(LOVN, "愛の女神ロヴン", "spirit", ["white"], ["氷姫"], 3)
    t(MINOTA, "ミノタ・コルス", "spirit", ["blue"], ["異合"], 3)
}

// ── BS19-078 海獣グーロ【合体時】『このスピリットの合体アタック時』
//    相手の手札にある【連鎖】を持たないマジックカードすべての軽減シンボルすべてを無いものとして扱う ──
// 合体アタック中なら、相手のレッドウォール（コスト2・軽減[青]1つ）は軽減なしの2支払いになる
scenario({
    name: "gouroVoidReductionOnCombinedAttack",
    start: {
        me: { spirits: [{ card: ARNOLD }, { card: JEFFREY }], hand: [T078], reserve: 10 },
        opp: { spirits: [{ card: TROLL }], hand: [REDWALL], reserve: 5 },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ディープ・アーノルド") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ディープ・アーノルド") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 海獣グーロ → なし",
        "自分.リザーブ: 10 → 8", // グーロのコスト4。青シンボル2つで軽減2つ
        "自分.海獣グーロ.場所: なし → 合体",
        "自分.海獣グーロ.疲労: なし → false",
        "自分.海獣グーロ.コア: なし → 0",
        "自分.海獣グーロ.Lv: なし → 1",
        "自分.ディープ・アーノルド.BP: 4000 → 6000", // 合体時BP+2000
        "自分.ディープ・アーノルド.疲労: false → true",
        "相手.手札: レッドウォール → なし",
        "相手.リザーブ: 5 → 4", // 軽減を無いものとして扱うので2支払い。ライフのコア+1
        "相手.トラッシュ: なし → レッドウォール",
        "相手.トラッシュのコア: 0 → 2", // レッドウォールの使用コスト2
        "相手.ライフ: 5 → 4",
    ],
})

// 合体アタックでなければ軽減は普段どおり効く（1支払い。リザーブは増減なし）
scenario({
    name: "gouroNoCombinedAttackReductionKept",
    start: {
        me: { spirits: [{ card: ARNOLD }, { card: JEFFREY }], reserve: 10 },
        opp: { spirits: [{ card: TROLL }], hand: [REDWALL], reserve: 5 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ディープ・アーノルド") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ディープ・アーノルド.疲労: false → true",
        "相手.手札: レッドウォール → なし",
        "相手.トラッシュ: なし → レッドウォール",
        "相手.トラッシュのコア: 0 → 1", // 軽減1つが効くので1支払い
        "相手.ライフ: 5 → 4",
    ],
})

// ── BS19-094 永遠なる水道橋 Lv1･Lv2
//    『このスピリットの召喚時』効果と『このブレイヴの召喚時』効果は発揮されない ──
// グリプ・ハンズのドローも、からくり犬シバのボイドコアも出ない
scenario({
    name: "suidobashiSealsSummonTriggers",
    start: {
        me: { nexuses: [{ card: N094, cores: 0 }], hand: [GRIP, SHIBA], reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: からくり犬シバ、グリプ・ハンズ → なし",
        "自分.リザーブ: 10 → 2", // コスト3+Lv1コア1×2体
        "自分.トラッシュのコア: 0 → 6", // 召喚コスト3×2
        "自分.グリプ・ハンズ.場所: なし → フィールド",
        "自分.グリプ・ハンズ.疲労: なし → false",
        "自分.グリプ・ハンズ.コア: なし → 1",
        "自分.グリプ・ハンズ.Lv: なし → 1",
        "自分.グリプ・ハンズ.BP: なし → 2000",
        "自分.からくり犬シバ.場所: なし → フィールド",
        "自分.からくり犬シバ.疲労: なし → false",
        "自分.からくり犬シバ.コア: なし → 1",
        "自分.からくり犬シバ.Lv: なし → 1",
        "自分.からくり犬シバ.BP: なし → 2000",
    ],
})

// ネクサスがなければどちらの『召喚時』も発揮する（ドロー1枚＋ボイドからリザーブへ1個）
scenario({
    name: "summonTriggersWithoutSuidobashi",
    start: {
        me: { hand: [GRIP, SHIBA], reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: からくり犬シバ、グリプ・ハンズ → ロクケラトプス",
        "自分.リザーブ: 10 → 3", // 支払い8＋シバのボイドコア+1
        "自分.トラッシュのコア: 0 → 6", // 召喚コスト3×2
        "自分.デッキ枚数: 40 → 39",
        "自分.グリプ・ハンズ.場所: なし → フィールド",
        "自分.グリプ・ハンズ.疲労: なし → false",
        "自分.グリプ・ハンズ.コア: なし → 1",
        "自分.グリプ・ハンズ.Lv: なし → 1",
        "自分.グリプ・ハンズ.BP: なし → 2000",
        "自分.からくり犬シバ.場所: なし → フィールド",
        "自分.からくり犬シバ.疲労: なし → false",
        "自分.からくり犬シバ.コア: なし → 1",
        "自分.からくり犬シバ.Lv: なし → 1",
        "自分.からくり犬シバ.BP: なし → 2000",
    ],
})

// ── BS19-094 Lv2『自分のアタックステップ』
//    系統：「闘神」を持つ自分のスピリットが相手のスピリットにブロックされたとき、
//    ボイドからコア1個を自分のスピリットに置く（置く先は自分のスピリットから選ぶ） ──
scenario({
    name: "suidobashiCoreWhenTotushinBlocked",
    start: {
        me: { spirits: [{ card: JEFFREY }], nexuses: [{ card: N094, cores: 2 }], reserve: 10 },
        opp: { spirits: [{ card: VANILLA }], reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("槍兵のジェフリー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.槍兵のジェフリー.疲労: false → true",
        "自分.槍兵のジェフリー.コア: 1 → 2", // ボイドから+1（自分のスピリットはジェフリーのみ）
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11", // 破壊されたロクケラトプスのコアはリザーブへ
    ],
})

// 闘神でなければブロックされてもコアは置かれない（条件を1つ外す）
scenario({
    name: "suidobashiNoCoreForNonTotushin",
    start: {
        me: { spirits: [{ card: MONGKOU }], nexuses: [{ card: N094, cores: 2 }], reserve: 10 },
        opp: { spirits: [{ card: VANILLA }], reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("猿人モンゴクウ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.猿人モンゴクウ.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ── BS19-095 光灯る三叉灯台 Lv1･Lv2『このネクサスの配置時』
//    自分の手札にあるブレイヴカード1枚をコストを支払わずに召喚できる。
//    ただし、『このブレイヴの召喚時』効果は発揮されない ──
// ゲパルバート（コスト3）が無償で召喚され（コスト不払い・Lv1コアのみ）、ドローはしない
scenario({
    name: "toushadoFreeBraveSummonOnPlace",
    start: {
        me: { spirits: [{ card: STATUE }], hand: [N095, GEPA], reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "setNexus", handIndex: 0, level: 1 })
    },
    expect: [
        "自分.手札: 光灯る三叉灯台、骸戦車ゲパルバート → なし",
        "自分.リザーブ: 10 → 4", // 灯台コスト6（軽減1）＋ゲパルバートのLv1コア1
        "自分.トラッシュのコア: 0 → 5", // 灯台の配置コスト（ゲパルバートは無償）
        "自分.光灯る三叉灯台.場所: なし → ネクサス",
        "自分.光灯る三叉灯台.疲労: なし → false",
        "自分.光灯る三叉灯台.コア: なし → 0",
        "自分.光灯る三叉灯台.Lv: なし → 1",
        "自分.骸戦車ゲパルバート.場所: なし → フィールド",
        "自分.骸戦車ゲパルバート.疲労: なし → false",
        "自分.骸戦車ゲパルバート.コア: なし → 1",
        "自分.骸戦車ゲパルバート.Lv: なし → 1",
        "自分.骸戦車ゲパルバート.BP: なし → 2000",
    ],
})

// ── BS19-095 Lv2『自分のアタックステップ』（常在）
//    系統：「闘神」を持つ自分のスピリットすべてを、そのスピリットが持つ最高Lvとして扱う ──
scenario({
    name: "toushadoLv2TotushinAsHighest",
    start: {
        me: { spirits: [{ card: RAZARUS, cores: 1 }], hand: [N095], reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "setNexus", handIndex: 0, level: 2 })
    },
    expect: [
        "自分.手札: 光灯る三叉灯台 → なし",
        "自分.リザーブ: 10 → 3", // コスト6（軽減1）＋Lv2コア2
        "自分.トラッシュのコア: 0 → 5", // 灯台の配置コスト
        "自分.光灯る三叉灯台.場所: なし → ネクサス",
        "自分.光灯る三叉灯台.疲労: なし → false",
        "自分.光灯る三叉灯台.コア: なし → 2",
        "自分.光灯る三叉灯台.Lv: なし → 2",
        "自分.爪剣のラザラス.Lv: 1 → 3", // 最高Lvとして扱う
        "自分.爪剣のラザラス.BP: 2000 → 5000",
    ],
})

// Lv1なら最高Lv扱いにはならない（条件を1つ外す）
scenario({
    name: "toushadoLv1NoLevelBoost",
    start: {
        me: { spirits: [{ card: RAZARUS, cores: 1 }], hand: [N095], reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "setNexus", handIndex: 0, level: 1 })
    },
    expect: [
        "自分.手札: 光灯る三叉灯台 → なし",
        "自分.リザーブ: 10 → 5", // コスト6（軽減1）のみ
        "自分.トラッシュのコア: 0 → 5", // 灯台の配置コスト
        "自分.光灯る三叉灯台.場所: なし → ネクサス",
        "自分.光灯る三叉灯台.疲労: なし → false",
        "自分.光灯る三叉灯台.コア: なし → 0",
        "自分.光灯る三叉灯台.Lv: なし → 1",
    ],
})

// ── BS19-096 海魔巣食う海域 Lv1･Lv2『自分のアタックステップ』
//    【連鎖】を持つ自分のスピリットがアタックしたとき、そのスピリットのLvを1つ上のものとして扱う（そのアタックの間） ──
// ミノタ・コルス（Lv1 BP3000）がLv2扱い（BP5000）になり、BP4000のブロッカーを破壊する
scenario({
    name: "kaiikiRensaAttackerOneLevelUp",
    start: {
        me: {
            spirits: [{ card: MINOTA }, { card: VANILLA }],
            nexuses: [{ card: N096, cores: 0 }],
            reserve: 10,
        },
        opp: { spirits: [{ card: ARNOLD }], reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ミノタ・コルス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ディープ・アーノルド") })
        t.closeFlash()
    },
    expect: [
        "自分.ミノタ・コルス.疲労: false → true",
        "自分.デッキ枚数: 40 → 39", // ミノタ・コルスの連鎖[赤]（自分の赤シンボルで発動）のドロー
        "自分.手札: なし → ロクケラトプス",
        "相手.ディープ・アーノルド.場所: フィールド → なし",
        "相手.トラッシュ: なし → ディープ・アーノルド",
        "相手.リザーブ: 10 → 11",
    ],
})

// 【連鎖】を持たなければLvは上がらず、BP3000のままでブロッカーに破壊される（条件を1つ外す）
scenario({
    name: "kaiikiNoBoostWithoutRensa",
    start: {
        me: { spirits: [{ card: TROLL }], nexuses: [{ card: N096, cores: 0 }], reserve: 10 },
        opp: { spirits: [{ card: ARNOLD }], reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("暴れトロル") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ディープ・アーノルド") })
        t.closeFlash()
    },
    expect: [
        "自分.暴れトロル.場所: フィールド → なし",
        "自分.トラッシュ: なし → 暴れトロル",
        "自分.リザーブ: 10 → 11",
        "相手.ディープ・アーノルド.疲労: false → true",
    ],
})

// ── BS19-096 Lv2『お互いのアタックステップ』
//    相手は赤/緑/白のバーストを発動できない ──
// 自分のアタックで相手のライフが減っても、相手の赤バースト（バゼル）は発動できない
scenario({
    name: "kaiikiLv2SealsRedBurst",
    start: {
        me: { spirits: [{ card: TROLL }], nexuses: [{ card: N096, cores: 1 }], reserve: 10 },
        opp: { burst: BAZEL, reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("暴れトロル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.暴れトロル.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// Lv1なら発動できる（条件を1つ外す）。バースト効果でバゼルが無償召喚される
scenario({
    name: "kaiikiLv1RedBurstFires",
    start: {
        me: { spirits: [{ card: TROLL }], nexuses: [{ card: N096, cores: 0 }], reserve: 10 },
        opp: { burst: BAZEL, reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("暴れトロル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.暴れトロル.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.バースト: 爆炎の覇王ロード・ドラゴン・バゼル → なし",
        "相手.爆炎の覇王ロード・ドラゴン・バゼル.場所: なし → フィールド",
        "相手.爆炎の覇王ロード・ドラゴン・バゼル.疲労: なし → false",
        "相手.爆炎の覇王ロード・ドラゴン・バゼル.コア: なし → 1",
        "相手.爆炎の覇王ロード・ドラゴン・バゼル.Lv: なし → 1",
        "相手.爆炎の覇王ロード・ドラゴン・バゼル.BP: なし → 5000",
    ],
})

// ── BS19-112 オーシャンフィールド（場に残るマジック）
//    メイン: お互い、それぞれのフィールドにあるシンボルと同じ色のマジックカードしか使用できず、
//    自分のトラッシュにあるカードを手札に加えられない。
//    相手のスピリットのアタックによって自分のライフが減るまで自分のフィールドに置いておき、
//    その間、効果を発揮し続ける ──
// 使ってもトラッシュに行かず場に残り、赤シンボルしかない相手は青のマジックを使用できない
scenario({
    name: "oceanfieldStaysAndLocksMagicColor",
    start: {
        me: { spirits: [{ card: TROLL }], hand: [M112], reserve: 10 },
        opp: { spirits: [{ card: VANILLA }], hand: [REDWALL], reserve: 5 },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("暴れトロル") })
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: オーシャンフィールド → なし",
        "自分.リザーブ: 10 → 8", // コスト3（軽減1）。トラッシュには行かない
        "自分.トラッシュのコア: 0 → 2", // 使用コスト3（軽減1）
        "自分.暴れトロル.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 5 → 6",
    ],
})

// 相手のスピリットのアタックで自分のライフが減ったとき破棄され、以降マジックの色の制限が効かなくなる
scenario({
    name: "oceanfieldDiscardedOnLifeLoss",
    start: {
        me: { spirits: [{ card: TROLL }], hand: [M112], reserve: 10 },
        opp: {
            spirits: [
                { card: VANILLA, label: "ロクケラトプス一号" },
                { card: VANILLA, label: "ロクケラトプス二号" },
            ],
            hand: [REDWALL],
            reserve: 10,
        },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス一号") })
        t.act("me", { type: "pass" })
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash" }) // まだ場にあるので使えない
        t.closeFlash()
        t.act("me", { type: "takeLife" }) // ここでオーシャンフィールドが破棄される
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス二号") })
        t.act("me", { type: "pass" })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" }) // 破棄後は使える
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.手札: オーシャンフィールド → なし",
        "自分.トラッシュ: なし → オーシャンフィールド",
        "自分.トラッシュのコア: 0 → 2", // 使用コスト3（軽減1）
        "自分.ライフ: 5 → 3",
        "相手.手札: レッドウォール → ロクケラトプス", // ドロー1枚＋レッドウォールを使用
        "相手.デッキ枚数: 40 → 39",
        "相手.リザーブ: 10 → 9", // 相手ターン開始+1、レッドウォール2支払い
        "相手.トラッシュのコア: 0 → 2",
        "相手.トラッシュ: なし → レッドウォール",
        "相手.ロクケラトプス一号.疲労: false → true",
        "相手.ロクケラトプス二号.疲労: false → true",
    ],
})

// ── BS19-112 フラッシュ: このターンの間、スピリット1体をBP+2000する ──
// フラッシュ効果で使うときは通常どおりトラッシュへ行く（場に残るのはメイン効果の使用時）
scenario({
    name: "oceanfieldFlashBpBuff",
    start: {
        me: { spirits: [{ card: TROLL }], hand: [M112], reserve: 10 },
        opp: { reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("暴れトロル") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("暴れトロル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: オーシャンフィールド → なし",
        "自分.リザーブ: 10 → 8", // コスト3（軽減1）
        "自分.トラッシュ: なし → オーシャンフィールド",
        "自分.トラッシュのコア: 0 → 2",
        "自分.暴れトロル.BP: 3000 → 5000", // このターンの間BP+2000
        "自分.暴れトロル.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ── BS19-113 ダブルバイセップス フラッシュ:
//    このターンの間、自分のスピリット1体のLvを2つまで上のものとして扱う ──
scenario({
    name: "doublebicepsTwoLevelsUp",
    start: {
        me: { spirits: [{ card: BEARD }], hand: [M113], reserve: 10 },
        opp: { reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("熊男ベアード") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("熊男ベアード") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ダブルバイセップス → なし",
        "自分.リザーブ: 10 → 7", // コスト4（軽減1）
        "自分.トラッシュのコア: 0 → 3", // 使用コスト4（軽減1）
        "自分.トラッシュ: なし → ダブルバイセップス",
        "自分.熊男ベアード.Lv: 1 → 3", // 2つ上のLv3として扱う
        "自分.熊男ベアード.BP: 3000 → 8000",
        "自分.熊男ベアード.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ── BS19-114 ポセイドンクラッシュ フラッシュ:
//    コスト5/8/11のバースト効果を持つスピリットすべてを破壊する。
//    【連鎖：条件《赤シンボル》】[赤]: BP3000以下のスピリットすべてを破壊する（お互い対象） ──
// 自分に赤シンボル（ハンマドレイク）があるとき: クリシュナー（コスト5・バースト効果持ち）と
// 相手のロクケラトプス（BP1000）が破壊され、BP4000のスピリットは両陣営とも残る
scenario({
    name: "poseidonBurstHolderAndSmallDestroyed",
    start: {
        me: { spirits: [{ card: BANFA }, { card: HAMMER }], hand: [M114], reserve: 10 },
        opp: { spirits: [{ card: KRISH }, { card: VANILLA }, { card: ARNOLD }], reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("戦闘獣バン・ファロー") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ポセイドンクラッシュ → なし",
        "自分.リザーブ: 10 → 5", // コスト6（軽減1）
        "自分.トラッシュ: なし → ポセイドンクラッシュ",
        "自分.戦闘獣バン・ファロー.疲労: false → true",
        "相手.ドラグ・クリシュナー.場所: フィールド → なし",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "自分.トラッシュのコア: 0 → 5", // 使用コスト6（軽減1）
        "相手.トラッシュ: なし → ドラグ・クリシュナー、ロクケラトプス",
        "相手.リザーブ: 10 → 13", // 破壊2体のコア+2、ライフのコア+1
        "相手.ライフ: 5 → 4",
    ],
})

// 自分に赤シンボルがなければ連鎖は発動せず、BP3000以下も破壊しない（条件を1つ外す）
scenario({
    name: "poseidonNoChainWithoutRedSymbol",
    start: {
        me: { spirits: [{ card: BANFA }], hand: [M114], reserve: 10 },
        opp: { spirits: [{ card: KRISH }, { card: VANILLA }, { card: ARNOLD }], reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("戦闘獣バン・ファロー") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ポセイドンクラッシュ → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュ: なし → ポセイドンクラッシュ",
        "自分.戦闘獣バン・ファロー.疲労: false → true",
        "相手.ドラグ・クリシュナー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ドラグ・クリシュナー",
        "自分.トラッシュのコア: 0 → 5", // 使用コスト6（軽減1）
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

// ── BS19-X06 戦輝神ゼルドナーグ Lv1･Lv2･Lv3『このスピリットのアタック時』
//    相手のデッキを上から5枚破棄し、マジックカードが破棄されたとき、このスピリットに青のシンボル1つを追加する ──
// 上から5枚にマジック（レッドウォール）が含まれる（シンボル追加は写像に載らないので破棄で見る）
scenario({
    name: "zerdonaegDiscardFiveWithMagic",
    start: {
        me: { spirits: [{ card: X06, cores: 1 }], reserve: 10 },
        opp: { deck: [REDWALL, ...Array.from({ length: 39 }, () => VANILLA)], reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("戦輝神ゼルドナーグ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.戦輝神ゼルドナーグ.疲労: false → true",
        "相手.デッキ枚数: 40 → 35",
        "相手.トラッシュ: なし → レッドウォール、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 上から5枚にマジックが無ければ破棄は5枚のまま（マジックのときだけシンボルが増える）
scenario({
    name: "zerdonaegDiscardFiveNoMagic",
    start: {
        me: { spirits: [{ card: X06, cores: 1 }], reserve: 10 },
        opp: { reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("戦輝神ゼルドナーグ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.戦輝神ゼルドナーグ.疲労: false → true",
        "相手.デッキ枚数: 40 → 35",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ── BS19-X06 Lv3『このスピリットのアタック時』
//    このスピリットが相手へのデッキ破棄効果を発揮したとき、相手の効果で1枚も破棄できなければ、
//    ターンに3回まで、このスピリットは回復できる ──
// 相手のロヴン（疲労で自分のデッキの破棄を防ぐ）が効いて1枚も破棄できなければ、ゼルドナーグは回復する
scenario({
    name: "zerdonaegRefreshesWhenPrevented",
    start: {
        me: { spirits: [{ card: X06, cores: 5 }], reserve: 10 },
        opp: { spirits: [{ card: LOVN }], reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("戦輝神ゼルドナーグ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "相手.愛の女神ロヴン.疲労: false → true", // 疲労させてデッキを守る
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// デッキ切れで1枚も破棄できなくても回復はしない（相手の効果による0枚ではない）
scenario({
    name: "zerdonaegNoRefreshOnDeckOut",
    start: {
        me: { spirits: [{ card: X06, cores: 5 }], reserve: 10 },
        opp: { deck: [], reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("戦輝神ゼルドナーグ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.戦輝神ゼルドナーグ.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ── BS19-X08 蒼海の大剣メイルシュトロム【合体時】【強襲：1】『このスピリットの合体アタック時』
//    このスピリットは、ターンに1回まで、自分のネクサス1つを疲労させることで回復する ──
scenario({
    name: "mailstromAssaultRefresh",
    start: {
        me: {
            spirits: [{ card: BANFA }, { card: JEFFREY }, { card: TROLL }],
            nexuses: [{ card: N094, cores: 0 }],
            hand: [X08],
            reserve: 10,
        },
        opp: { reserve: 10 },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("戦闘獣バン・ファロー") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("戦闘獣バン・ファロー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 蒼海の大剣メイルシュトロム → なし",
        "自分.リザーブ: 10 → 7", // コスト6（軽減3）
        "自分.トラッシュのコア: 0 → 3", // 召喚コスト6（軽減3）
        "自分.蒼海の大剣メイルシュトロム.場所: なし → 合体",
        "自分.蒼海の大剣メイルシュトロム.疲労: なし → false",
        "自分.蒼海の大剣メイルシュトロム.コア: なし → 0",
        "自分.蒼海の大剣メイルシュトロム.Lv: なし → 1",
        "自分.戦闘獣バン・ファロー.BP: 4000 → 9000", // 合体時BP+5000
        "自分.永遠なる水道橋.疲労: false → true", // 強襲のコスト
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part741）")
