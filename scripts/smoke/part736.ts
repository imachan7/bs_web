// smoke パート736（BS19 白9枚：BS19-035/036/038/039/040/042/043/044/073 の場面テスト）
// 期待値は効果文とカードの属性だけから書く（docs/design/BS19_PLAN.md §2・SEMANTICS_AUDIT §3.23〜3.25）。
// 【強化】の行（BS19-038 Lv1-2）は part726 が見るので、ここでは場面を書かない。
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

// 対象カード（BS19・白）
const JURENUK = "BS19-035" // ジュレヌーク
const VIKING = "BS19-036" // 近衛機バイキング1号
const CURIOSITY = "BS19-038" // 近衛機キュリオシティ
const PEGASUS = "BS19-039" // ペガシオーネ
const VOLGA = "BS19-040" // 十剣聖ヴォル・クーガ
const SOBEK = "BS19-042" // 機甲要塞ソーベック・タートル
const ARIANRHOD = "BS19-043" // 銀の女神アリアンロッド
const OSELODER = "BS19-044" // 高速機獣オセローダー
const TORADOR = "BS19-073" // 銃機トラドール

// 脇役（既存の弾から。BS19 の他のカードは effects がまだ無いので使わない）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const SHOCKEATER = "BS01-054" // ショックイーター（緑・コスト2・バニラ）
const BIANCO = "BS10-039" // ビアンコ・ティーガー（白・コスト6・バニラ）
const MONSHIRO = "BS14-027" // モンシロラン（緑・コスト3・バニラ）
const LIME = "BS16-035" // 樹氷竜シルバー・ライム（白・コスト6・バニラ・シンボル2つ）
const HAMMER = "BS03-144" // マジックハンマー（青・マジック）
const RIBBON = "BS01-146" // ドリームリボン（白・マジック）
const POTION = "BS02-102" // ホワイトポーション（白・マジック）
const CANNON = "BS10-062" // 砲凰竜フェニック・キャノン（赤・ブレイヴ・シンボルなし）
const GEPARD = "BS10-064" // 骸戦車ゲパルバート（紫・ブレイヴ・召喚時にドロー）
const RETICLE = "BS11-059" // レチクル・アームズ（青・ブレイヴ・召喚時にデッキ破棄）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(JURENUK).name === "ジュレヌーク" && getCard(JURENUK).type === "spirit" && getCard(JURENUK).family.includes("甲獣"), "JURENUKは白の甲獣")
    assert(getCard(VIKING).name === "近衛機バイキング1号" && getCard(VIKING).type === "spirit" && getCard(VIKING).family.includes("武装"), "VIKINGは白の武装")
    assert(getCard(CURIOSITY).name === "近衛機キュリオシティ" && getCard(CURIOSITY).type === "spirit" && getCard(CURIOSITY).family.includes("武装"), "CURIOSITYは白の武装")
    assert(getCard(PEGASUS).name === "ペガシオーネ" && getCard(PEGASUS).type === "spirit" && getCard(PEGASUS).family.includes("機獣"), "PEGASUSは白の機獣")
    assert(getCard(VOLGA).name === "十剣聖ヴォル・クーガ" && getCard(VOLGA).type === "spirit" && getCard(VOLGA).family.includes("剣使") && getCard(VOLGA).family.includes("武装"), "VOLGAは白の剣使/武装")
    assert(getCard(SOBEK).name === "機甲要塞ソーベック・タートル" && getCard(SOBEK).type === "spirit" && getCard(SOBEK).family.includes("機獣") && getCard(SOBEK).family.includes("甲獣"), "SOBEKは白の機獣/甲獣")
    assert(getCard(ARIANRHOD).name === "銀の女神アリアンロッド" && getCard(ARIANRHOD).type === "spirit" && getCard(ARIANRHOD).family.includes("氷姫"), "ARIANRHODは白の氷姫")
    assert(getCard(OSELODER).name === "高速機獣オセローダー" && getCard(OSELODER).type === "spirit" && getCard(OSELODER).family.includes("機獣"), "OSELODERは白の機獣")
    assert(getCard(TORADOR).name === "銃機トラドール" && getCard(TORADOR).type === "brave" && getCard(TORADOR).family.includes("武装") && getCard(TORADOR).braveCondition !== undefined, "TORADORは白のブレイヴ・合体条件コスト4以上")
    for (const id of [JURENUK, VIKING, CURIOSITY, PEGASUS, VOLGA, SOBEK, ARIANRHOD, OSELODER, TORADOR]) {
        assert(getCard(id).colors.length === 1 && getCard(id).colors[0] === "white", `${id}は白`)
    }
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).colors[0] === "red" && getCard(VANILLA).cost === 1 && getCard(VANILLA).family.includes("地竜"), "VANILLAは赤コスト1の地竜")
    assert(getCard(SHOCKEATER).name === "ショックイーター" && getCard(SHOCKEATER).colors[0] === "green" && getCard(SHOCKEATER).family.includes("樹魔"), "SHOCKEATERは緑の樹魔")
    assert(getCard(BIANCO).name === "ビアンコ・ティーガー" && getCard(BIANCO).colors[0] === "white" && getCard(BIANCO).family.includes("機獣") && getCard(BIANCO).levels.length === 2, "BIANCOは白の機獣・Lv1:5000/Lv2:9000")
    assert(getCard(MONSHIRO).name === "モンシロラン" && getCard(MONSHIRO).colors[0] === "green" && getCard(MONSHIRO).family.includes("怪虫"), "MONSHIROは緑の怪虫")
    assert(getCard(LIME).name === "樹氷竜シルバー・ライム" && getCard(LIME).colors[0] === "white" && getCard(LIME).symbol.length === 2, "LIMEは白・シンボル2つ持ち")
    assert(getCard(HAMMER).name === "マジックハンマー" && getCard(HAMMER).type === "magic" && getCard(HAMMER).colors[0] === "blue" && getCard(HAMMER).cost === 4, "HAMMERは青コスト4のマジック")
    assert(getCard(RIBBON).name === "ドリームリボン" && getCard(RIBBON).type === "magic" && getCard(RIBBON).colors[0] === "white" && getCard(RIBBON).cost === 4, "RIBBONは白コスト4のマジック")
    assert(getCard(POTION).name === "ホワイトポーション" && getCard(POTION).type === "magic" && getCard(POTION).colors[0] === "white" && getCard(POTION).cost === 4, "POTIONは白コスト4のマジック")
    assert(getCard(CANNON).name === "砲凰竜フェニック・キャノン" && getCard(CANNON).type === "brave" && getCard(CANNON).symbol.length === 0, "CANNONはシンボルを持たないブレイヴ")
    assert(getCard(GEPARD).name === "骸戦車ゲパルバート" && getCard(GEPARD).type === "brave" && getCard(GEPARD).colors[0] === "purple" && getCard(GEPARD).cost === 3, "GEPARDは紫コスト3のブレイヴ")
    assert(getCard(RETICLE).name === "レチクル・アームズ" && getCard(RETICLE).type === "brave" && getCard(RETICLE).colors[0] === "blue" && getCard(RETICLE).cost === 3, "RETICLEは青コスト3のブレイヴ")
}

console.log("=== BS19-035 ジュレヌーク ===")
// Lv1-2：お互いのデッキは破棄されない（相手のメインマジックで自分のデッキが破棄されない）
scenario({
    name: "jurenuk-deck-protect",
    start: { turn: "opp", me: { spirits: [{ card: JURENUK, cores: 1 }] }, opp: { hand: [HAMMER] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 4",
        "相手.トラッシュ: なし → マジックハンマー",
        "相手.手札: マジックハンマー → なし",
    ],
})
// 起きない場面：ジュレヌークがいなければ5枚破棄される
scenario({
    name: "jurenuk-deck-discard-no-protect",
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
// Lv2『相手のターン』：疲労状態の自分のスピリットすべてをBP+2000（ブロックで疲労した個体が+2000込みで勝つ）
scenario({
    name: "jurenuk-rested-bp-block",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: JURENUK, cores: 2 }, { card: BIANCO, cores: 1 }] },
        opp: { spirits: [{ card: MONSHIRO, cores: 2 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.モンシロラン") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("自分.ビアンコ・ティーガー") })
        t.closeFlash()
    },
    expect: [
        "相手.モンシロラン.場所: フィールド → なし",
        "相手.トラッシュ: なし → モンシロラン",
        "相手.リザーブ: 10 → 12",
        "自分.ビアンコ・ティーガー.疲労: false → true",
        "自分.ビアンコ・ティーガー.BP: 5000 → 7000",
    ],
})
// 起きない場面：Lv1ではBP+2000されず、ブロックしたスピリットが破壊される
scenario({
    name: "jurenuk-lv1-no-bp",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: JURENUK, cores: 1 }, { card: BIANCO, cores: 1 }] },
        opp: { spirits: [{ card: MONSHIRO, cores: 2 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.モンシロラン") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("自分.ビアンコ・ティーガー") })
        t.closeFlash()
    },
    expect: [
        "自分.ビアンコ・ティーガー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ビアンコ・ティーガー",
        "自分.リザーブ: 10 → 11",
        "相手.モンシロラン.疲労: false → true",
    ],
})

console.log("=== BS19-036 近衛機バイキング1号 ===")
// Lv1-3【重装甲：白/青】：相手の白マジックのバウンスを受けない（脇役のロクケラトプスだけ戻る）
// 相手は自分のアタックのフラッシュでマジックを使う（アタック後のフラッシュの優先権は受け側から）
scenario({
    name: "viking-heavy-armor",
    start: {
        phase: "attack",
        me: { spirits: [{ card: VIKING, cores: 1 }, { card: VANILLA, cores: 1 }] },
        opp: { hand: [RIBBON] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("自分.近衛機バイキング1号") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("自分.ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.手札: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
        "自分.近衛機バイキング1号.疲労: false → true",
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュのコア: 0 → 4",
        "相手.トラッシュ: なし → ドリームリボン",
        "相手.手札: ドリームリボン → なし",
        "相手.ライフ: 5 → 4",
    ],
})
// Lv2-3『相手のアタックステップ』：BP6000以下のアタックで自分のスピリット1体を回復（発生源自身＝疲労状態の自分）
scenario({
    name: "viking-refresh-trigger",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: VIKING, cores: 2, rested: true }] },
        opp: { spirits: [{ card: BIANCO, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ビアンコ・ティーガー") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.ビアンコ・ティーガー.疲労: false → true",
        "自分.近衛機バイキング1号.疲労: true → false",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})
// 起きない場面：アタックしたスピリットがBP6000超なら回復しない
scenario({
    name: "viking-no-trigger-over-bp",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: VIKING, cores: 2, rested: true }] },
        opp: { spirits: [{ card: BIANCO, cores: 2 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ビアンコ・ティーガー") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.ビアンコ・ティーガー.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})

console.log("=== BS19-038 近衛機キュリオシティ ===")
// Lv1-2：お互いのデッキは破棄されない（相手ブレイヴの召喚時デッキ破棄が自分のデッキに届かない）
scenario({
    name: "curiosity-deck-protect",
    start: { turn: "opp", me: { spirits: [{ card: CURIOSITY, cores: 1 }] }, opp: { hand: [RETICLE] } },
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
    ],
})

console.log("=== BS19-039 ペガシオーネ ===")
// Lv1-2『アタック時』バウンス＋【連鎖：条件《緑シンボル》】[緑]ボイドからコア1個（ソウルコアはリザーブに残る）
scenario({
    name: "pegasus-chain-green",
    start: {
        phase: "attack",
        me: { spirits: [{ card: PEGASUS, cores: 1 }, { card: SHOCKEATER, cores: 1 }], soulCore: "リザーブ" },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("自分.ペガシオーネ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ペガシオーネ.疲労: false → true",
        "自分.ペガシオーネ.コア: 1 → 2",
        "自分.ペガシオーネ.Lv: 1 → 2",
        "自分.ペガシオーネ.BP: 3000 → 5000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})
// 起きない場面：緑シンボルがなければ連鎖は発揮せず、コアは増えない（バウネスだけ起きる）
scenario({
    name: "pegasus-chain-no-green",
    start: {
        phase: "attack",
        me: { spirits: [{ card: PEGASUS, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("自分.ペガシオーネ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ペガシオーネ.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})
// 起きない場面：相手のスピリットがBP4000超ならバウンスしない
scenario({
    name: "pegasus-no-bounce-over-bp",
    start: {
        phase: "attack",
        me: { spirits: [{ card: PEGASUS, cores: 1 }] },
        opp: { spirits: [{ card: BIANCO, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("自分.ペガシオーネ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ペガシオーネ.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== BS19-040 十剣聖ヴォル・クーガ ===")
// Lv2-3『このスピリットのアタック時』：[十剣聖ヴォル・クーガ]以外の自分のスピリット1体を回復
scenario({
    name: "volga-refresh-on-attack",
    start: {
        phase: "attack",
        me: { spirits: [{ card: VOLGA, cores: 2 }, { card: SHOCKEATER, cores: 1, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("自分.十剣聖ヴォル・クーガ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.十剣聖ヴォル・クーガ.疲労: false → true",
        "自分.ショックイーター.疲労: true → false",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// 起きない場面：Lv1では回復しない
scenario({
    name: "volga-lv1-no-refresh",
    start: {
        phase: "attack",
        me: { spirits: [{ card: VOLGA, cores: 1 }, { card: SHOCKEATER, cores: 1, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("自分.十剣聖ヴォル・クーガ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.十剣聖ヴォル・クーガ.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// 【合体時】Lv1-3：このスピリットのブレイヴは破壊されない（合体スピリットがバトルで負けてもブレイヴは場に残る）
scenario({
    name: "volga-brave-not-destroyed",
    start: {
        me: { spirits: [{ card: VOLGA, cores: 1 }], hand: [TORADOR] },
        opp: { spirits: [{ card: BIANCO, cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("自分.十剣聖ヴォル・クーガ") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.十剣聖ヴォル・クーガ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("相手.ビアンコ・ティーガー") })
        t.closeFlash()
    },
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: 銃機トラドール → なし",
        "自分.十剣聖ヴォル・クーガ.場所: フィールド → なし",
        "自分.トラッシュ: なし → 十剣聖ヴォル・クーガ",
        "自分.銃機トラドール.場所: なし → フィールド",
        "自分.銃機トラドール.疲労: なし → true",
        "自分.銃機トラドール.コア: なし → 1",
        "自分.銃機トラドール.Lv: なし → 1",
        "自分.銃機トラドール.BP: なし → 3000",
        "相手.ビアンコ・ティーガー.疲労: false → true",
    ],
})
// 【合体時】Lv3：シンボルを持たないブレイヴとの合体中は白のシンボルを1つ追加（次の召喚の軽減が2つになる）
scenario({
    name: "volga-symbol-add-reduction",
    start: {
        me: { spirits: [{ card: VOLGA, cores: 4 }], hand: [CANNON, BIANCO] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("自分.十剣聖ヴォル・クーガ") })
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 1",
        "自分.トラッシュのコア: 0 → 8",
        "自分.手札: ビアンコ・ティーガー、砲凰竜フェニック・キャノン → なし",
        "自分.砲凰竜フェニック・キャノン.場所: なし → 合体",
        "自分.砲凰竜フェニック・キャノン.疲労: なし → false",
        "自分.砲凰竜フェニック・キャノン.コア: なし → 0",
        "自分.砲凰竜フェニック・キャノン.Lv: なし → 1",
        "自分.十剣聖ヴォル・クーガ.BP: 8000 → 11000",
        "自分.ビアンコ・ティーガー.場所: なし → フィールド",
        "自分.ビアンコ・ティーガー.疲労: なし → false",
        "自分.ビアンコ・ティーガー.コア: なし → 1",
        "自分.ビアンコ・ティーガー.Lv: なし → 1",
        "自分.ビアンコ・ティーガー.BP: なし → 5000",
    ],
})
// 起きない場面：合体していなければ追加シンボルは無く、軽減は1つ
scenario({
    name: "volga-unbraved-no-symbol-add",
    start: {
        me: { spirits: [{ card: VOLGA, cores: 4 }], hand: [BIANCO] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.手札: ビアンコ・ティーガー → なし",
        "自分.ビアンコ・ティーガー.場所: なし → フィールド",
        "自分.ビアンコ・ティーガー.疲労: なし → false",
        "自分.ビアンコ・ティーガー.コア: なし → 1",
        "自分.ビアンコ・ティーガー.Lv: なし → 1",
        "自分.ビアンコ・ティーガー.BP: なし → 5000",
    ],
})

console.log("=== BS19-042 機甲要塞ソーベック・タートル ===")
// Lv1-2『召喚時』：相手のスピリット1体を手札に戻す
scenario({
    name: "sobek-summon-bounce",
    start: { me: { hand: [SOBEK] }, opp: { spirits: [{ card: VANILLA, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        "自分.手札: 機甲要塞ソーベック・タートル → なし",
        "自分.機甲要塞ソーベック・タートル.場所: なし → フィールド",
        "自分.機甲要塞ソーベック・タートル.疲労: なし → false",
        "自分.機甲要塞ソーベック・タートル.コア: なし → 1",
        "自分.機甲要塞ソーベック・タートル.Lv: なし → 1",
        "自分.機甲要塞ソーベック・タートル.BP: なし → 4000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
// 【連鎖：条件《緑シンボル》】[緑]：手札のブレイヴをコストを支払わずに召喚（召喚時効果のドローは発揮しない）
scenario({
    name: "sobek-chain-free-brave",
    start: {
        me: { spirits: [{ card: SHOCKEATER, cores: 1 }], hand: [SOBEK, GEPARD] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 6",
        "自分.手札: 機甲要塞ソーベック・タートル、骸戦車ゲパルバート → なし",
        "自分.機甲要塞ソーベック・タートル.場所: なし → フィールド",
        "自分.機甲要塞ソーベック・タートル.疲労: なし → false",
        "自分.機甲要塞ソーベック・タートル.コア: なし → 1",
        "自分.機甲要塞ソーベック・タートル.Lv: なし → 1",
        "自分.機甲要塞ソーベック・タートル.BP: なし → 4000",
        "自分.骸戦車ゲパルバート.場所: なし → フィールド",
        "自分.骸戦車ゲパルバート.疲労: なし → false",
        "自分.骸戦車ゲパルバート.コア: なし → 1",
        "自分.骸戦車ゲパルバート.Lv: なし → 1",
        "自分.骸戦車ゲパルバート.BP: なし → 2000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
// 起きない場面：緑シンボルがなければ無償召喚は起きない（バウンスだけ起きる）
scenario({
    name: "sobek-chain-no-green",
    start: {
        me: { hand: [SOBEK, GEPARD] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        "自分.手札: 機甲要塞ソーベック・タートル、骸戦車ゲパルバート → 骸戦車ゲパルバート",
        "自分.機甲要塞ソーベック・タートル.場所: なし → フィールド",
        "自分.機甲要塞ソーベック・タートル.疲労: なし → false",
        "自分.機甲要塞ソーベック・タートル.コア: なし → 1",
        "自分.機甲要塞ソーベック・タートル.Lv: なし → 1",
        "自分.機甲要塞ソーベック・タートル.BP: なし → 4000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== BS19-043 銀の女神アリアンロッド ===")
// Lv1-2『相手のアタックステップ』：シンボル2つ以上の相手のスピリット1体からは1までしか減らされない
// （2回アタックされても2回目は減らない。SEMANTICS_AUDIT §3.25：発生源ごとに数える）
scenario({
    name: "arianrhod-cap-per-source",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: ARIANRHOD, cores: 1 }] },
        opp: { spirits: [{ card: LIME, cores: 1 }], hand: [POTION] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.樹氷竜シルバー・ライム") })
        t.act("me", { type: "pass" })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.樹氷竜シルバー・ライム") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.樹氷竜シルバー・ライム") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.樹氷竜シルバー・ライム.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
        "相手.リザーブ: 10 → 8",
        "相手.トラッシュのコア: 0 → 2",
        "相手.トラッシュ: なし → ホワイトポーション",
        "相手.手札: ホワイトポーション → なし",
    ],
})
// 起きない場面：シンボル1つのスピリットは対象外で、2回とも減らされる
scenario({
    name: "arianrhod-one-symbol-uncapped",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: ARIANRHOD, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }], hand: [POTION] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.act("me", { type: "pass" })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.ロクケラトプス.疲労: false → true",
        "自分.ライフ: 5 → 3",
        "自分.リザーブ: 10 → 12",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 4",
        "相手.トラッシュ: なし → ホワイトポーション",
        "相手.手札: ホワイトポーション → なし",
    ],
})

console.log("=== BS19-044 高速機獣オセローダー ===")
// Lv1-3『召喚時』：【連鎖】を持つ自分のスピリット1体につき、相手のスピリット1体を手札に戻す（自分自身も持つので1体）
scenario({
    name: "oselo-summon-bounce-one",
    start: { me: { hand: [OSELODER] }, opp: { spirits: [{ card: VANILLA, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 7",
        "自分.手札: 高速機獣オセローダー → なし",
        "自分.高速機獣オセローダー.場所: なし → フィールド",
        "自分.高速機獣オセローダー.疲労: なし → false",
        "自分.高速機獣オセローダー.コア: なし → 1",
        "自分.高速機獣オセローダー.Lv: なし → 1",
        "自分.高速機獣オセローダー.BP: なし → 4000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
// Lv2-3『ブロック時』BP+4000（バトルの間だけ。7000+4000=11000でBP9000のアタッカーに勝つ）
// ＋【連鎖：条件《緑シンボル》】[緑]：BP4000以下の相手のスピリットすべてを疲労させる
scenario({
    name: "oselo-block-buff-chain",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: OSELODER, cores: 2 }, { card: SHOCKEATER, cores: 1 }] },
        opp: { spirits: [{ card: BIANCO, cores: 2 }, { card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ビアンコ・ティーガー") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("自分.高速機獣オセローダー") })
        t.closeFlash()
    },
    expect: [
        "相手.ビアンコ・ティーガー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ビアンコ・ティーガー",
        "相手.リザーブ: 10 → 12",
        "自分.高速機獣オセローダー.疲労: false → true",
        "相手.ロクケラトプス.疲労: false → true",
    ],
})
// 起きない場面：緑シンボルがなければ連鎖の疲労は起きない（BP+4000は効く）
scenario({
    name: "oselo-block-no-green",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: OSELODER, cores: 2 }] },
        opp: { spirits: [{ card: BIANCO, cores: 2 }, { card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ビアンコ・ティーガー") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("自分.高速機獣オセローダー") })
        t.closeFlash()
    },
    expect: [
        "相手.ビアンコ・ティーガー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ビアンコ・ティーガー",
        "相手.リザーブ: 10 → 12",
        "自分.高速機獣オセローダー.疲労: false → true",
    ],
})
// 起きない場面：Lv1ではBP+4000も連鎖も無く、ブロックした側が破壊される
scenario({
    name: "oselo-lv1-block-loses",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: OSELODER, cores: 1 }, { card: SHOCKEATER, cores: 1 }] },
        opp: { spirits: [{ card: BIANCO, cores: 2 }, { card: VANILLA, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ビアンコ・ティーガー") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("自分.高速機獣オセローダー") })
        t.closeFlash()
    },
    expect: [
        "自分.高速機獣オセローダー.場所: フィールド → なし",
        "自分.トラッシュ: なし → 高速機獣オセローダー",
        "自分.リザーブ: 10 → 11",
        "相手.ビアンコ・ティーガー.疲労: false → true",
    ],
})

console.log("=== BS19-073 銃機トラドール ===")
// 【合体時】『このスピリットの合体アタック時』：BP5000以下の相手のスピリット1体を手札に戻す
scenario({
    name: "torador-brave-attack-bounce",
    start: {
        me: { spirits: [{ card: BIANCO, cores: 1 }], hand: [TORADOR] },
        opp: { spirits: [{ card: SHOCKEATER, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("自分.ビアンコ・ティーガー") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ビアンコ・ティーガー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: 銃機トラドール → なし",
        "自分.ビアンコ・ティーガー.BP: 5000 → 8000",
        "自分.ビアンコ・ティーガー.疲労: false → true",
        "自分.銃機トラドール.場所: なし → 合体",
        "自分.銃機トラドール.疲労: なし → false",
        "自分.銃機トラドール.コア: なし → 0",
        "自分.銃機トラドール.Lv: なし → 1",
        "相手.ショックイーター.場所: フィールド → なし",
        "相手.手札: なし → ショックイーター",
        "相手.リザーブ: 10 → 13",
        "相手.ライフ: 5 → 3",
    ],
})
// 起きない場面：相手のスピリットがBP5000超なら戻さない
scenario({
    name: "torador-no-bounce-over-bp",
    start: {
        me: { spirits: [{ card: BIANCO, cores: 1 }], hand: [TORADOR] },
        opp: { spirits: [{ card: MONSHIRO, cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("自分.ビアンコ・ティーガー") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自分.ビアンコ・ティーガー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: 銃機トラドール → なし",
        "自分.ビアンコ・ティーガー.BP: 5000 → 8000",
        "自分.ビアンコ・ティーガー.疲労: false → true",
        "自分.銃機トラドール.場所: なし → 合体",
        "自分.銃機トラドール.疲労: なし → false",
        "自分.銃機トラドール.コア: なし → 0",
        "自分.銃機トラドール.Lv: なし → 1",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part736）")
