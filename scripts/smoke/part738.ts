// smoke パート738（BS19 黄8枚：BS19-046/048/049/051/052/053/054/075 の期待値場面テスト）
// 期待値は効果文とカードの属性だけから書く（docs/design/BS19_PLAN.md §2・SEMANTICS_AUDIT.md §3.23〜3.25・
// PROMO_PLAN.md §2・CONJUNCTION.md）。BS19 の effects はまだ空なので、データ役の実装が終わる前は落ちてよい。
// 【強化】の行（BS19-052 Lv1-3）は part726 が見るので、ここでは場面を書かない。【連鎖】は白シンボルの有無で2場面。
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

// ── 主役（BS19・黄）──
const HACKBISHIN = "BS19-046" // ハックビシン（黄・コスト1・戯狩）お互いのデッキは破棄されない
const AIRAVATA = "BS19-048" // アイラヴァター（黄・コスト3・想獣）召喚時にデッキ1枚オープン
const MIRANSA = "BS19-049" // 天使ミランサ（黄・コスト3・天霊）召喚時に相手1体BP-2000
const KONTON = "BS19-051" // 凶獣コントン（黄・コスト4・想獣）召喚時に相手すべてLv1扱い＋連鎖[白]バウンス
const SNIPULE = "BS19-052" // 天使スナイプル（黄・コスト4・天霊）お互いのデッキは破棄されない（＋【強化】は part726）
const LUCIEL = "BS19-053" // 十剣聖ルシエル（黄・コスト5・剣使/天霊）アタック時BP-2000／合体アタック時黄マジック無償／Lv3コスト3マジックで回復
const PENTAN = "BS19-054" // 賢者ペンタン（黄・コスト5・歌鳥/漂精）マジック使用時に疲労させて3コストまで支払い扱い
const KONGOU = "BS19-075" // コンゴウショウキ（黄・コスト4・想獣・ブレイヴ）召喚時にコスト3以下はブロック不可

// ── 脇役（既存の弾から。BS19 の他のカードは effects がまだ無いので使わない）──
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・バニラ・BP1000）
const HIPPO = "BS07-037" // ヒッポカンプー（黄・コスト1・想獣・バニラ・BP1000）＝デッキの想獣
const WHITE_SYM = "BS01-074" // バーサーカー・ガン（白・コスト1・動器・バニラ・BP1000）＝白シンボル源
const PIYON = "BS02-049" // ピヨン（黄・コスト0・歌鳥・バニラ・BP1000）
const METALBURN = "BS01-008" // メタルバーン（赤・コスト3・機竜・バニラ・BP3000）
const BIANCO = "BS10-039" // ビアンコ・ティーガー（白・コスト6・機獣・バニラ・Lv1:5000/Lv2:9000）
const MEGARON = "BS05-006" // 城塞龍メガロン（赤・コスト5・機竜・バニラ・Lv1:5000）＝コスト4以上のブロッカー
const HAMMER = "BS03-144" // マジックハンマー（青・マジック・コスト4）メイン：相手のデッキを5枚破棄
const RETICLE = "BS11-059" // レチクル・アームズ（青・ブレイヴ・コスト3）召喚時に相手のデッキを3枚破棄
const RIBBON = "BS01-146" // ドリームリボン（白・マジック・コスト4）フラッシュ：相手1体を手札に戻す
const GWALL = "BS02-105" // グレートウォール（黄・マジック・コスト3）フラッシュ：1体をBP+2000
const FOCUS = "BS03-136" // フォーカスライト（黄・マジック・コスト4）フラッシュ：1体をBP+2000
const POPPOR = "BS13-057" // ポッポール（黄・ブレイヴ・コスト4・BP4000・合体条件コスト4以上）

console.log("=== 前提: カードの機械確認 ===")
{
    // 主役（BS19・黄。effect 欄は見ないで属性だけ確認する）
    assert(getCard(HACKBISHIN).name === "ハックビシン" && getCard(HACKBISHIN).type === "spirit" && getCard(HACKBISHIN).colors.join() === "yellow" && getCard(HACKBISHIN).cost === 1 && getCard(HACKBISHIN).family.includes("戯狩"), "HACKBISHINは黄コスト1の戯狩")
    assert(getCard(AIRAVATA).name === "アイラヴァター" && getCard(AIRAVATA).type === "spirit" && getCard(AIRAVATA).colors.join() === "yellow" && getCard(AIRAVATA).cost === 3 && getCard(AIRAVATA).family.includes("想獣"), "AIRAVATAは黄コスト3の想獣")
    assert(getCard(MIRANSA).name === "天使ミランサ" && getCard(MIRANSA).type === "spirit" && getCard(MIRANSA).colors.join() === "yellow" && getCard(MIRANSA).cost === 3 && getCard(MIRANSA).family.includes("天霊"), "MIRANSAは黄コスト3の天霊")
    assert(getCard(KONTON).name === "凶獣コントン" && getCard(KONTON).type === "spirit" && getCard(KONTON).colors.join() === "yellow" && getCard(KONTON).cost === 4 && getCard(KONTON).family.includes("想獣"), "KONTONは黄コスト4の想獣")
    assert(getCard(SNIPULE).name === "天使スナイプル" && getCard(SNIPULE).type === "spirit" && getCard(SNIPULE).colors.join() === "yellow" && getCard(SNIPULE).cost === 4 && getCard(SNIPULE).family.includes("天霊"), "SNIPULEは黄コスト4の天霊")
    assert(getCard(LUCIEL).name === "十剣聖ルシエル" && getCard(LUCIEL).type === "spirit" && getCard(LUCIEL).colors.join() === "yellow" && getCard(LUCIEL).cost === 5 && getCard(LUCIEL).family.includes("剣使") && getCard(LUCIEL).family.includes("天霊") && getCard(LUCIEL).levels.length === 3, "LUCIELは黄コスト5の剣使/天霊・Lv3まで")
    assert(getCard(PENTAN).name === "賢者ペンタン" && getCard(PENTAN).type === "spirit" && getCard(PENTAN).colors.join() === "yellow" && getCard(PENTAN).cost === 5 && getCard(PENTAN).family.includes("歌鳥") && getCard(PENTAN).family.includes("漂精"), "PENTANは黄コスト5の歌鳥/漂精")
    assert(getCard(KONGOU).name === "コンゴウショウキ" && getCard(KONGOU).type === "brave" && getCard(KONGOU).colors.join() === "yellow" && getCard(KONGOU).cost === 4 && getCard(KONGOU).family.includes("想獣") && getCard(KONGOU).braveCondition !== undefined, "KONGOUは黄コスト4の想獣ブレイヴ・合体条件コスト4以上")
    // 脇役
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).colors.join() === "red" && getCard(VANILLA).cost === 1 && getCard(VANILLA).levels[0]!.bp === 1000, "VANILLAは赤コスト1・BP1000のバニラ")
    assert(getCard(HIPPO).name === "ヒッポカンプー" && getCard(HIPPO).type === "spirit" && getCard(HIPPO).colors.join() === "yellow" && getCard(HIPPO).cost === 1 && getCard(HIPPO).family.includes("想獣"), "HIPPOは黄コスト1の想獣")
    assert(getCard(WHITE_SYM).name === "バーサーカー・ガン" && getCard(WHITE_SYM).colors.join() === "white" && getCard(WHITE_SYM).symbol.join() === "white" && getCard(WHITE_SYM).cost === 1, "WHITE_SYMは白コスト1・白シンボル")
    assert(getCard(PIYON).name === "ピヨン" && getCard(PIYON).colors.join() === "yellow" && getCard(PIYON).cost === 0 && getCard(PIYON).levels[0]!.bp === 1000, "PIYONは黄コスト0・BP1000のバニラ")
    assert(getCard(METALBURN).name === "メタルバーン" && getCard(METALBURN).colors.join() === "red" && getCard(METALBURN).cost === 3 && getCard(METALBURN).levels[0]!.bp === 3000, "METALBURNは赤コスト3・BP3000のバニラ")
    assert(getCard(BIANCO).name === "ビアンコ・ティーガー" && getCard(BIANCO).colors.join() === "white" && getCard(BIANCO).cost === 6 && getCard(BIANCO).levels[1]!.bp === 9000 && getCard(BIANCO).levels[1]!.cores === 2, "BIANCOは白コスト6・Lv2(コア2)でBP9000のバニラ")
    assert(getCard(MEGARON).name === "城塞龍メガロン" && getCard(MEGARON).colors.join() === "red" && getCard(MEGARON).cost === 5 && getCard(MEGARON).levels[0]!.bp === 5000, "MEGARONは赤コスト5・BP5000のバニラ")
    assert(getCard(HAMMER).name === "マジックハンマー" && getCard(HAMMER).type === "magic" && getCard(HAMMER).colors.join() === "blue" && getCard(HAMMER).cost === 4, "HAMMERは青コスト4のマジック")
    assert(getCard(RETICLE).name === "レチクル・アームズ" && getCard(RETICLE).type === "brave" && getCard(RETICLE).colors.join() === "blue" && getCard(RETICLE).cost === 3, "RETICLEは青コスト3のブレイヴ")
    assert(getCard(RIBBON).name === "ドリームリボン" && getCard(RIBBON).type === "magic" && getCard(RIBBON).colors.join() === "white" && getCard(RIBBON).cost === 4, "RIBBONは白コスト4のマジック")
    assert(getCard(GWALL).name === "グレートウォール" && getCard(GWALL).type === "magic" && getCard(GWALL).colors.join() === "yellow" && getCard(GWALL).cost === 3, "GWALLは黄コスト3のマジック")
    assert(getCard(FOCUS).name === "フォーカスライト" && getCard(FOCUS).type === "magic" && getCard(FOCUS).colors.join() === "yellow" && getCard(FOCUS).cost === 4, "FOCUSは黄コスト4のマジック")
    assert(getCard(POPPOR).name === "ポッポール" && getCard(POPPOR).type === "brave" && getCard(POPPOR).colors.join() === "yellow" && getCard(POPPOR).cost === 4 && getCard(POPPOR).levels[0]!.bp === 4000 && getCard(POPPOR).braveCondition !== undefined, "POPPORは黄コスト4・BP4000のブレイヴ")
}

console.log("=== BS19-046 ハックビシン ===")
// Lv1-3：お互いのデッキは破棄されない（相手のメインマジックで自分のデッキが破棄されない）
scenario({
    name: "hackbishin-protect-own-deck",
    start: { turn: "opp", me: { spirits: [{ card: HACKBISHIN, cores: 1 }] }, opp: { hand: [HAMMER] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 4",
        "相手.トラッシュ: なし → マジックハンマー",
        "相手.手札: マジックハンマー → なし",
        // 自分.デッキ枚数の差分なし＝破棄されていない
    ],
})
// 「お互いの」＝自分の効果でも相手のデッキは破棄されない
scenario({
    name: "hackbishin-protect-opp-deck",
    start: { me: { spirits: [{ card: HACKBISHIN, cores: 1 }], hand: [HAMMER] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → マジックハンマー",
        "自分.手札: マジックハンマー → なし",
        // 相手.デッキ枚数の差分なし＝破棄されていない
    ],
})
// 起きない場面：ハックビシンがいなければ5枚破棄される
scenario({
    name: "hackbishin-absent-discard",
    start: { turn: "opp", opp: { hand: [HAMMER] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "自分.デッキ枚数: 40 → 35",
        "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 4",
        "相手.トラッシュ: なし → マジックハンマー",
        "相手.手札: マジックハンマー → なし",
    ],
})

console.log("=== BS19-048 アイラヴァター ===")
// Lv1-2『このスピリットの召喚時』：オープンしたカードが系統：「想獣」のスピリットカードなら手札に加える
scenario({
    name: "airavata-soujuu-to-hand",
    start: { me: { hand: [AIRAVATA], deck: [HIPPO, ...Array.from({ length: 39 }, () => VANILLA)] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: アイラヴァター → ヒッポカンプー",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.アイラヴァター.場所: なし → フィールド",
        "自分.アイラヴァター.疲労: なし → false",
        "自分.アイラヴァター.コア: なし → 1",
        "自分.アイラヴァター.Lv: なし → 1",
        "自分.アイラヴァター.BP: なし → 2000",
    ],
})
// 起きない場面：系統：「想獣」でなければ手札に加えず破棄する（ロクケラトプスは地竜）
scenario({
    name: "airavata-nonsoujuu-trashed",
    start: { me: { hand: [AIRAVATA] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: アイラヴァター → なし",
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.アイラヴァター.場所: なし → フィールド",
        "自分.アイラヴァター.疲労: なし → false",
        "自分.アイラヴァター.コア: なし → 1",
        "自分.アイラヴァター.Lv: なし → 1",
        "自分.アイラヴァター.BP: なし → 2000",
    ],
})

console.log("=== BS19-049 天使ミランサ ===")
// Lv1-2『このスピリットの召喚時』：このターンの間、相手のスピリット1体をBP-2000する
scenario({
    name: "miransa-summon-bp-minus",
    start: { me: { hand: [MIRANSA] }, opp: { spirits: [{ card: METALBURN, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 天使ミランサ → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.天使ミランサ.場所: なし → フィールド",
        "自分.天使ミランサ.疲労: なし → false",
        "自分.天使ミランサ.コア: なし → 1",
        "自分.天使ミランサ.Lv: なし → 1",
        "自分.天使ミランサ.BP: なし → 2000",
        "相手.メタルバーン.BP: 3000 → 1000",
    ],
})

console.log("=== BS19-051 凶獣コントン ===")
// Lv1-3『このスピリットの召喚時』：このターンの間、相手のスピリットすべてをLv1として扱う
// ＋【連鎖：条件《白シンボル》】[白]：相手のスピリット1体を手札に戻す（白シンボルがあるとき）
scenario({
    name: "konton-lv1-chain-bounce",
    start: {
        interactive: true,
        me: { spirits: [{ card: WHITE_SYM, cores: 1 }], hand: [KONTON] },
        opp: { spirits: [{ card: BIANCO, cores: 2 }, { card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "resolveChoice", instanceId: t.id("相手.ロクケラトプス") })
    },
    expect: [
        "自分.手札: 凶獣コントン → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.凶獣コントン.場所: なし → フィールド",
        "自分.凶獣コントン.疲労: なし → false",
        "自分.凶獣コントン.コア: なし → 1",
        "自分.凶獣コントン.Lv: なし → 1",
        "自分.凶獣コントン.BP: なし → 2000",
        "相手.ビアンコ・ティーガー.Lv: 2 → 1",
        "相手.ビアンコ・ティーガー.BP: 9000 → 5000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
// 起きない場面：白シンボルがなければ連鎖は発揮せず、Lv1として扱うだけ（ビアンコは戻らない）
scenario({
    name: "konton-lv1-no-chain",
    start: { me: { hand: [KONTON] }, opp: { spirits: [{ card: BIANCO, cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 凶獣コントン → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.凶獣コントン.場所: なし → フィールド",
        "自分.凶獣コントン.疲労: なし → false",
        "自分.凶獣コントン.コア: なし → 1",
        "自分.凶獣コントン.Lv: なし → 1",
        "自分.凶獣コントン.BP: なし → 2000",
        "相手.ビアンコ・ティーガー.Lv: 2 → 1",
        "相手.ビアンコ・ティーガー.BP: 9000 → 5000",
    ],
})

console.log("=== BS19-052 天使スナイプル（【強化】の行は part726）===")
// Lv1-3：お互いのデッキは破棄されない（相手ブレイヴの召喚時デッキ破棄が自分のデッキに届かない）
scenario({
    name: "snipule-protect-deck",
    start: { turn: "opp", me: { spirits: [{ card: SNIPULE, cores: 1 }] }, opp: { hand: [RETICLE] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: [
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 3",
        "相手.手札: レチクル・アームズ → なし",
        "相手.レチクル・アームズ.場所: なし → フィールド",
        "相手.レチクル・アームズ.疲労: なし → false",
        "相手.レチクル・アームズ.コア: なし → 1",
        "相手.レチクル・アームズ.Lv: なし → 1",
        "相手.レチクル・アームズ.BP: なし → 2000",
        // 自分.デッキ枚数の差分なし＝破棄されていない
    ],
})
// 起きない場面：スナイプルがいなければ3枚破棄される
scenario({
    name: "snipule-absent-discard",
    start: { turn: "opp", opp: { hand: [RETICLE] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.デッキ枚数: 40 → 37",
        "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 3",
        "相手.手札: レチクル・アームズ → なし",
        "相手.レチクル・アームズ.場所: なし → フィールド",
        "相手.レチクル・アームズ.疲労: なし → false",
        "相手.レチクル・アームズ.コア: なし → 1",
        "相手.レチクル・アームズ.Lv: なし → 1",
        "相手.レチクル・アームズ.BP: なし → 2000",
    ],
})

console.log("=== BS19-053 十剣聖ルシエル ===")
// Lv1-3『このスピリットのアタック時』：このターンの間、相手のスピリット1体をBP-2000する
scenario({
    name: "luciel-attack-bp-minus",
    start: {
        phase: "attack",
        me: { spirits: [{ card: LUCIEL, cores: 1 }] },
        opp: { spirits: [{ card: METALBURN, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("自分.十剣聖ルシエル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.十剣聖ルシエル.疲労: false → true",
        "相手.メタルバーン.BP: 3000 → 1000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// 【合体時】の条件を外す（合体していない）＝黄マジックは無償にならず通常どおり支払う。
// Lv3『このスピリットのアタック時』：コスト3のマジックを使用したので効果発揮後に回復する（疲労の差分なし）
scenario({
    name: "luciel-unbraved-pay-magic-refresh",
    start: { phase: "attack", me: { spirits: [{ card: LUCIEL, cores: 3 }], hand: [GWALL] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("自分.十剣聖ルシエル") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("自分.十剣聖ルシエル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        // 疲労の差分なし＝アタックで疲労したが、コスト3のマジック使用後に回復した
        "自分.十剣聖ルシエル.BP: 7000 → 9000",
        "自分.手札: グレートウォール → なし",
        "自分.トラッシュ: なし → グレートウォール",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// 【合体時】Lv2-3『このスピリットの合体アタック時』：黄マジックをコストを支払わずに使用できる（リザーブ・トラッシュのコアの差分なし）。
// Lv3の回復はコスト3のマジックのときだけなので、コスト4では回復しない（疲労のまま）
scenario({
    name: "luciel-braved-free-magic",
    start: {
        interactive: true,
        me: { spirits: [{ card: LUCIEL, cores: 3 }, { card: POPPOR, cores: 1 }], hand: [FOCUS] },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("自分.ポッポール"), hostInstanceId: t.id("自分.十剣聖ルシエル") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.十剣聖ルシエル") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("自分.十剣聖ルシエル") })
        t.act("me", { type: "resolveChoice", option: "コストを支払わずに使用する" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ポッポール.場所: フィールド → 合体",
        "自分.ポッポール.コア: 1 → 0",
        "自分.ポッポール.BP: 4000 → なし",
        "自分.十剣聖ルシエル.コア: 3 → 4",
        // 合体時BP+2000（ポッポール）＋フォーカスライトのBP+2000
        "自分.十剣聖ルシエル.BP: 7000 → 11000",
        "自分.十剣聖ルシエル.疲労: false → true",
        "自分.手札: フォーカスライト → なし",
        "自分.トラッシュ: なし → フォーカスライト",
        // 自分.リザーブ・自分.トラッシュのコアの差分なし＝コストを支払っていない
        // 合体スピリットのシンボル＝ホスト＋ブレイヴの黄2つで、ライフは2減る
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== BS19-054 賢者ペンタン ===")
// Lv1-2『お互いのアタックステップ』：マジック使用時に疲労させることで3コストまで支払ったものとして扱う
// （コスト4のドリームリボン＝疲労で3ぶん＋リザーブから1。3ぶんはコアを動かさない）
scenario({
    name: "pentan-exhaust-pay3",
    start: {
        phase: "attack",
        me: { spirits: [{ card: PENTAN, cores: 1 }, { card: PIYON, cores: 1 }], hand: [RIBBON] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("自分.ピヨン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ピヨン.疲労: false → true",
        "自分.賢者ペンタン.疲労: false → true",
        "自分.手札: ドリームリボン → なし",
        "自分.トラッシュ: なし → ドリームリボン",
        "自分.リザーブ: 10 → 9",
        "自分.トラッシュのコア: 0 → 1",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})
// 起きない場面：ペンタンがすでに疲労していれば疲労させられず、コストを全額リザーブから支払う
scenario({
    name: "pentan-rested-pay-full",
    start: {
        phase: "attack",
        me: { spirits: [{ card: PENTAN, cores: 1, rested: true }, { card: PIYON, cores: 1 }], hand: [RIBBON] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("自分.ピヨン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ピヨン.疲労: false → true",
        // 自分.賢者ペンタン.疲労の差分なし＝疲労したまま（回復もしない）
        "自分.手札: ドリームリボン → なし",
        "自分.トラッシュ: なし → ドリームリボン",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== BS19-075 コンゴウショウキ ===")
// Lv1『このブレイヴの召喚時』：このターンの間、コスト3以下の相手のスピリットすべてはブロックできない
// （コスト3以下の相手＝ロクケラトプスはブロックを拒否される。ピヨンの黄シンボルでコンゴウショウキは3コスト支払い）
scenario({
    name: "kongou-block-cost3-rejected",
    start: { me: { spirits: [{ card: PIYON, cores: 1 }], hand: [KONGOU] }, opp: { spirits: [{ card: VANILLA, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ピヨン") })
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("相手.ロクケラトプス") })
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: コンゴウショウキ → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.コンゴウショウキ.場所: なし → フィールド",
        "自分.コンゴウショウキ.疲労: なし → false",
        "自分.コンゴウショウキ.コア: なし → 1",
        "自分.コンゴウショウキ.Lv: なし → 1",
        "自分.コンゴウショウキ.BP: なし → 3000",
        "自分.ピヨン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// 起きない場面：コスト4以上（城塞龍メガロン＝コスト5）ならブロックできる。BP比べでピヨンが破壊される
scenario({
    name: "kongou-block-cost5-allowed",
    start: { me: { spirits: [{ card: PIYON, cores: 1 }], hand: [KONGOU] }, opp: { spirits: [{ card: MEGARON, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ピヨン") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.城塞龍メガロン") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: コンゴウショウキ → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.コンゴウショウキ.場所: なし → フィールド",
        "自分.コンゴウショウキ.疲労: なし → false",
        "自分.コンゴウショウキ.コア: なし → 1",
        "自分.コンゴウショウキ.Lv: なし → 1",
        "自分.コンゴウショウキ.BP: なし → 3000",
        "自分.ピヨン.場所: フィールド → なし",
        "自分.トラッシュ: なし → ピヨン",
        "相手.城塞龍メガロン.疲労: false → true",
        // 相手.ライフの差分なし＝ブロックされてライフは減っていない
    ],
})

console.log("すべてのチェックに合格しました 🎉（part738）")
