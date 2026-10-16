// smoke パート600（BS12 の「カードは smoke に出るが、この効果節だけ一度も適用されていない」20枚の場面テスト）
import { act, assert, createGame, createInstance, effectiveBp, effectiveCost, getCard, hasArmorAgainst, refreshLevelAsOverrides } from "./helpers"
import type { GameState } from "./helpers"
import { scenario } from "./scenario"

const MUMMY = "BS12-011"
const UDO = "BS12-023"
const SIBERUZA = "BS12-020"
const THORN = "BS01-134" // バインディングソーン（緑・フラッシュ：相手のスピリット1体を疲労）
const FLAME = "BS01-121" // フレイムダンス（赤・フラッシュ：BP4000以下のスピリット1体を破壊）
const ROKU = "BS01-002" // ロクケラトプス（赤・Lv1 BP1000・Lv2は2コア）
const ABYS = "BS04-066" // 猫人アビシニア（青・Lv1 BP3000・Lv2は4コア）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        [MUMMY]: "ミイラバード",
        [UDO]: "忍仙人ウドウ",
        [SIBERUZA]: "一番槍のシベルザ",
        [THORN]: "バインディングソーン",
        [FLAME]: "フレイムダンス",
        [ROKU]: "ロクケラトプス",
        [ABYS]: "猫人アビシニア",
    }
    for (const [id, name] of Object.entries(names)) assert(getCard(id).name === name, `${id} は ${name}`)
}

console.log("=== BS12-011 ミイラバード Lv2 ===")
scenario({
    name: "mummy-exhausted-by-opp-magic",
    start: {
        turn: "opp",
        me: { spirits: [{ card: MUMMY, cores: 3 }] },
        opp: { hand: [THORN], spirits: [{ card: ABYS, cores: 3 }] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ミイラバード") })
    },
    expect: [
        "自分.ミイラバード.疲労: false → true",
        "相手.猫人アビシニア.コア: 3 → 2",
        "相手.手札: バインディングソーン → なし",
        "相手.トラッシュ: なし → バインディングソーン",
        "相手.リザーブ: 10 → 8",
        "相手.トラッシュのコア: 0 → 3",
    ],
})

scenario({
    name: "mummy-other-spirit-exhausted",
    start: {
        turn: "opp",
        me: { spirits: [{ card: MUMMY, cores: 3 }, { card: ROKU }] },
        opp: { hand: [THORN], spirits: [{ card: ABYS, cores: 3 }] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロクケラトプス") })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "相手.手札: バインディングソーン → なし",
        "相手.トラッシュ: なし → バインディングソーン",
        "相手.リザーブ: 10 → 8",
        "相手.トラッシュのコア: 0 → 2",
    ],
})

scenario({
    name: "mummy-lv1-exhausted",
    start: {
        turn: "opp",
        me: { spirits: [{ card: MUMMY, cores: 1 }] },
        opp: { hand: [THORN], spirits: [{ card: ABYS, cores: 3 }] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ミイラバード") })
    },
    expect: [
        "自分.ミイラバード.疲労: false → true",
        "相手.手札: バインディングソーン → なし",
        "相手.トラッシュ: なし → バインディングソーン",
        "相手.リザーブ: 10 → 8",
        "相手.トラッシュのコア: 0 → 2",
    ],
})

// 自分の効果（ユナイテッドパワーのコスト）で疲労したときは相手のコアを動かさない
scenario({
    name: "mummy-exhausted-by-own-effect",
    start: {
        me: { hand: ["BS03-131"], spirits: [{ card: MUMMY, cores: 3 }] },
        opp: { spirits: [{ card: ABYS, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ミイラバード") })
    },
    expect: [
        "自分.ミイラバード.疲労: false → true",
        "自分.ミイラバード.BP: 4000 → 8000",
        "自分.手札: ユナイテッドパワー → なし",
        "自分.トラッシュ: なし → ユナイテッドパワー",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
    ],
})

console.log("=== BS12-023 忍仙人ウドウ Lv2 ===")
scenario({
    name: "udo-own-spirit-destroyed-by-opp-magic",
    start: {
        turn: "opp",
        me: { spirits: [{ card: UDO, cores: 3, rested: true }, { card: ROKU }, { card: ABYS, rested: true }] },
        opp: { hand: [FLAME] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロクケラトプス") })
    },
    expect: [
        "自分.忍仙人ウドウ.疲労: true → false",
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
        "相手.手札: フレイムダンス → なし",
        "相手.トラッシュ: なし → フレイムダンス",
        "相手.リザーブ: 10 → 5",
        "相手.トラッシュのコア: 0 → 5",
    ],
})

scenario({
    name: "udo-own-spirit-destroyed-by-own-magic",
    start: {
        me: { hand: [FLAME], spirits: [{ card: UDO, cores: 3, rested: true }, { card: ROKU }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロクケラトプス") })
    },
    expect: [
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.トラッシュ: なし → フレイムダンス、ロクケラトプス",
        "自分.手札: フレイムダンス → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 4",
    ],
})

scenario({
    name: "udo-lv1",
    start: {
        turn: "opp",
        me: { spirits: [{ card: UDO, cores: 1, rested: true }, { card: ROKU }] },
        opp: { hand: [FLAME] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロクケラトプス") })
    },
    expect: [
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
        "相手.手札: フレイムダンス → なし",
        "相手.トラッシュ: なし → フレイムダンス",
        "相手.リザーブ: 10 → 5",
        "相手.トラッシュのコア: 0 → 5",
    ],
})

// バトルでの破壊は「効果で破壊」ではない
scenario({
    name: "udo-own-spirit-destroyed-in-battle",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: UDO, cores: 3, rested: true }, { card: ROKU }] },
        opp: { spirits: [{ card: ABYS }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("猫人アビシニア") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
        "相手.猫人アビシニア.疲労: false → true",
    ],
})

console.log("=== BS12-020 一番槍のシベルザ Lv2 ===")
scenario({
    name: "siberuza-first-attack",
    start: { phase: "attack", me: { spirits: [{ card: SIBERUZA, cores: 3 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("一番槍のシベルザ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// 「自分のターンの最初のアタック」＝そのターンの自分の最初のアタック（他のスピリットでも数える）と読んだ
scenario({
    name: "siberuza-second-attack-of-turn",
    start: { phase: "attack", me: { spirits: [{ card: ROKU }, { card: SIBERUZA, cores: 3 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        t.act("me", { type: "attack", instanceId: t.id("一番槍のシベルザ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ロクケラトプス.疲労: false → true", "自分.一番槍のシベルザ.疲労: false → true", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"],
})

scenario({
    name: "siberuza-lv1",
    start: { phase: "attack", me: { spirits: [{ card: SIBERUZA, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("一番槍のシベルザ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.一番槍のシベルザ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== BS12-053 オオヅツナナフシ ===")
const NANA = "BS12-053"
const NANA_SUMMON = [
    "自分.オオヅツナナフシ.BP: なし → 2000",
    "自分.オオヅツナナフシ.Lv: なし → 1",
    "自分.オオヅツナナフシ.コア: なし → 1",
    "自分.オオヅツナナフシ.場所: なし → フィールド",
    "自分.オオヅツナナフシ.疲労: なし → false",
    "自分.リザーブ: 10 → 5",
    "自分.トラッシュのコア: 0 → 4",
]
scenario({
    name: "nana-summon-discard",
    start: { interactive: true, me: { hand: [NANA, ROKU, ROKU] }, opp: { hand: [ABYS, ABYS, ABYS] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "resolveChoice", option: "発動する" })
    },
    expect: [
        ...NANA_SUMMON,
        "自分.手札: オオヅツナナフシ、ロクケラトプス、ロクケラトプス → ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "自分.デッキ枚数: 40 → 37",
    ],
})

scenario({
    name: "nana-summon-decline",
    start: { interactive: true, me: { hand: [NANA, ROKU, ROKU] }, opp: { hand: [ABYS, ABYS, ABYS] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "resolveChoice" })
    },
    expect: [...NANA_SUMMON, "自分.手札: オオヅツナナフシ、ロクケラトプス、ロクケラトプス → ロクケラトプス、ロクケラトプス"],
})

// 「最低1枚以上」：召喚で手札が0枚になるなら破棄もドローも起きない

const NANA_COMBINE = [
    "自分.オオヅツナナフシ.BP: 2000 → なし",
    "自分.オオヅツナナフシ.コア: 1 → 0",
    "自分.オオヅツナナフシ.場所: フィールド → 合体",
    "自分.猫人アビシニア.コア: 1 → 2",
    "自分.猫人アビシニア.BP: 3000 → 5000",
]
// 相手の効果によるドロー（ダブルドロー）。ターン開始時のドローは別の場面で確かめる
scenario({
    name: "nana-combined-opp-draws-by-magic",
    start: { me: { spirits: [{ card: NANA }, { card: ABYS, rested: true }] }, opp: { hand: ["BS01-117"] } },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("オオヅツナナフシ"), hostInstanceId: t.id("猫人アビシニア") })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        ...NANA_COMBINE,
        "自分.猫人アビシニア.疲労: true → false",
        "相手.デッキ枚数: 40 → 37",
        "相手.トラッシュ: なし → ダブルドロー",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 7",
        "相手.手札: ダブルドロー → ロクケラトプス、ロクケラトプス、ロクケラトプス",
    ],
})

scenario({
    name: "nana-combined-opp-turn-draw",
    start: { me: { spirits: [{ card: NANA }, { card: ABYS, rested: true }] } },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("オオヅツナナフシ"), hostInstanceId: t.id("猫人アビシニア") })
        t.act("me", { type: "endTurn" })
    },
    expect: [
        ...NANA_COMBINE,
        "自分.猫人アビシニア.疲労: true → false",
        "相手.デッキ枚数: 40 → 39",
        "相手.リザーブ: 10 → 11",
        "相手.手札: なし → ロクケラトプス",
    ],
})

// 自分のドローでは回復しない
scenario({
    name: "nana-combined-own-draw",
    start: { me: { hand: ["BS01-117"], spirits: [{ card: NANA }, { card: ABYS, rested: true }] } },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("オオヅツナナフシ"), hostInstanceId: t.id("猫人アビシニア") })
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.オオヅツナナフシ.BP: 2000 → なし",
        "自分.オオヅツナナフシ.コア: 1 → 0",
        "自分.オオヅツナナフシ.場所: フィールド → 合体",
        "自分.猫人アビシニア.コア: 1 → 2",
        "自分.猫人アビシニア.BP: 3000 → 5000",
        "自分.デッキ枚数: 40 → 38",
        "自分.トラッシュ: なし → ダブルドロー",
        "自分.トラッシュのコア: 0 → 4",
        "自分.リザーブ: 10 → 6",
        "自分.手札: ダブルドロー → ロクケラトプス、ロクケラトプス",
    ],
})

// 合体していない（スピリット状態の）ブレイヴは回復しない
scenario({
    name: "nana-uncombined-opp-draws",
    start: { turn: "opp", me: { spirits: [{ card: NANA, rested: true }] }, opp: { hand: ["BS01-117"] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "相手.デッキ枚数: 40 → 38",
        "相手.トラッシュ: なし → ダブルドロー",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
        "相手.手札: ダブルドロー → ロクケラトプス、ロクケラトプス",
    ],
})

console.log("=== BS12-058 神聖鳥サンダ・バード ===")
const SANDA = "BS12-058"
const KOGUMARU = "BS12-033" // コグマル（黄・星魂・コスト1・バニラ。Lv1 BP2000）
const SANDA_SUMMON = [
    "自分.神聖鳥サンダ・バード.BP: なし → 3000",
    "自分.神聖鳥サンダ・バード.Lv: なし → 1",
    "自分.神聖鳥サンダ・バード.コア: なし → 1",
    "自分.神聖鳥サンダ・バード.場所: なし → フィールド",
    "自分.神聖鳥サンダ・バード.疲労: なし → false",
    "自分.リザーブ: 10 → 4",
    "自分.トラッシュのコア: 0 → 5",
]
scenario({
    name: "sanda-summon-returns-magic",
    start: { me: { hand: [SANDA], trash: [FLAME, ROKU] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [...SANDA_SUMMON, "自分.手札: 神聖鳥サンダ・バード → フレイムダンス", "自分.トラッシュ: フレイムダンス、ロクケラトプス → ロクケラトプス"],
})

scenario({
    name: "sanda-summon-no-magic-in-trash",
    start: { me: { hand: [SANDA], trash: [ROKU] }, opp: { trash: [FLAME] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [...SANDA_SUMMON, "自分.手札: 神聖鳥サンダ・バード → なし"],
})

// 合体アタックで相手スピリットにブロックされたあと、自分がマジックを使用すると、その効果発揮後にブロッカーのBPが2000になる
const DIVINE_CHAIN = "BS01-143" // ディバインチェイン（白・コスト3・フラッシュ。バトル結果には影響しない）
function sandaBattle(name: string, opts: { combine: boolean; caster: "me" | "opp" }, expect: string[]) {
    scenario({
        name,
        start: {
            me: {
                hand: opts.caster === "me" ? [DIVINE_CHAIN] : [],
                spirits: [{ card: SANDA }, { card: KOGUMARU }],
            },
            opp: { hand: opts.caster === "opp" ? [DIVINE_CHAIN] : [], spirits: [{ card: ABYS, cores: 4 }] },
        },
        steps(t) {
            const attacker = opts.combine ? "コグマル" : "神聖鳥サンダ・バード"
            if (opts.combine) t.act("me", { type: "combineBrave", braveInstanceId: t.id("神聖鳥サンダ・バード"), hostInstanceId: t.id("コグマル") })
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(attacker) })
            t.closeFlash()
            t.act("opp", { type: "block", instanceId: t.id("猫人アビシニア") })
            if (opts.caster === "me") t.act("opp", { type: "pass" })
            t.act(opts.caster, { type: "castMagic", handIndex: 0 })
            t.closeFlash()
        },
        expect,
    })
}
// 相手がマジックを使っても効かない。ブロッカー(BP6000)のほうが合体スピリット(BP5000)より高いまま、合体スピリットが破壊される
sandaBattle("sanda-combined-attack-opp-magic", { combine: true, caster: "opp" }, [
    "自分.コグマル.場所: フィールド → なし",
    "自分.トラッシュ: なし → コグマル",
    "自分.リザーブ: 10 → 11",
    "自分.神聖鳥サンダ・バード.疲労: false → true",
    "相手.猫人アビシニア.疲労: false → true",
    "相手.手札: ディバインチェイン → なし",
    "相手.トラッシュ: なし → ディバインチェイン",
    "相手.トラッシュのコア: 0 → 3",
    "相手.リザーブ: 10 → 7",
])

// 合体していないブレイヴの攻撃では【合体時】の効果は無い
sandaBattle("sanda-uncombined-attack-own-magic", { combine: false, caster: "me" }, [
    "自分.神聖鳥サンダ・バード.場所: フィールド → なし",
    "自分.トラッシュ: なし → ディバインチェイン、神聖鳥サンダ・バード",
    "自分.リザーブ: 10 → 8",
    "自分.トラッシュのコア: 0 → 3",
    "自分.手札: ディバインチェイン → なし",
    "相手.猫人アビシニア.疲労: false → true",
])

console.log("=== 剣の誕生地 / 偶像の館 / 巨木の門：【転召】の生贄を疲労で代替 ===")
const MARS = "BS12-007" // 炎星神龍マルス・ドラグーン（【転召：星魂/ボイド】。召喚時は相手のシンボル1つのスピリットを破壊＝相手が空なら何も起きない）
const BEARD = "BS10-033" // ノーザンベアード（白・星魂・コスト3）
const CRYSTEEL = "BS10-036" // 水晶魚クリスティール（白・星魂・コスト4）
// 赤のネクサス（剣の誕生地）のシンボルはマルス（赤）の軽減に使えるので、支払いが1少ない
const marsSummon = (reduced: boolean) => [
    "自分.炎星神龍マルス・ドラグーン.BP: なし → 5000",
    "自分.炎星神龍マルス・ドラグーン.Lv: なし → 1",
    "自分.炎星神龍マルス・ドラグーン.コア: なし → 1",
    "自分.炎星神龍マルス・ドラグーン.場所: なし → フィールド",
    "自分.炎星神龍マルス・ドラグーン.疲労: なし → false",
    `自分.トラッシュのコア: 0 → ${reduced ? 5 : 6}`,
    `自分.リザーブ: 10 → ${reduced ? 4 : 3}`,
    "自分.手札: 炎星神龍マルス・ドラグーン → なし",
]
for (const [id, name] of [["BS12-061", "剣の誕生地"], ["BS12-064", "偶像の館"], ["BS12-066", "巨木の門"]] as const) {
    assert(getCard(id).name === name, `${id} は ${name}`)
    const base = (target: string, targetCores: number, restedNexus = false) => ({
        interactive: true,
        me: { hand: [MARS], nexuses: [{ card: id, cores: 0, rested: restedNexus }], spirits: [{ card: target, cores: targetCores }] },
    })
    scenario({
        name: `tensho-substitute-${id}`,
        start: base(BEARD, 2),
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            t.act("me", { type: "resolveChoice", option: "疲労してコアを維持する" })
        },
        expect: [...marsSummon(id === "BS12-061"), `自分.${name}.疲労: false → true`],
    })
    scenario({
        name: `tensho-no-substitute-${id}`,
        start: base(BEARD, 2),
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            t.act("me", { type: "resolveChoice", option: "疲労せずコアを置く" })
        },
        expect: [...marsSummon(id === "BS12-061"), "自分.ノーザンベアード.場所: フィールド → なし", "自分.トラッシュ: なし → ノーザンベアード"],
    })
    // コスト4の星魂は「コスト3」に当たらないので代替の対象外。ネクサスは疲労しない
    scenario({
        name: `tensho-cost4-target-${id}`,
        start: base(CRYSTEEL, 2),
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: [...marsSummon(id === "BS12-061"), "自分.水晶魚クリスティール.場所: フィールド → なし", "自分.トラッシュ: なし → 水晶魚クリスティール"],
    })
    // 疲労済みのネクサスは疲労できない
    scenario({
        name: `tensho-rested-nexus-${id}`,
        start: base(BEARD, 2, true),
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: [...marsSummon(id === "BS12-061"), "自分.ノーザンベアード.場所: フィールド → なし", "自分.トラッシュ: なし → ノーザンベアード"],
    })
}

console.log("=== BS12-064 偶像の館 Lv2：相手の効果で疲労したスピリット1体につき相手のスピリット1体を疲労 ===")
const IDOL = "BS12-064"
const IVY = "BS03-127" // アイビィーケイジ（緑・メイン：BP2000以下のスピリットすべてを疲労）
assert(getCard(IVY).name === "アイビィーケイジ", "IVYはアイビィーケイジ")
const IVY_COST = ["相手.手札: アイビィーケイジ → なし", "相手.トラッシュ: なし → アイビィーケイジ", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 5"]
scenario({
    name: "idol-lv2-two-exhausted",
    start: {
        turn: "opp",
        me: { nexuses: [{ card: IDOL, cores: 1 }], spirits: [{ card: ROKU, label: "ロク1" }, { card: ROKU, label: "ロク2" }] },
        opp: { hand: [IVY], spirits: [{ card: ABYS, label: "相手A" }, { card: ABYS, label: "相手B" }] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.ロク1.疲労: false → true",
        "自分.ロク2.疲労: false → true",
        "相手.相手A.疲労: false → true",
        "相手.相手B.疲労: false → true",
        ...IVY_COST,
    ],
})
scenario({
    name: "idol-lv2-one-exhausted",
    start: {
        turn: "opp",
        me: { nexuses: [{ card: IDOL, cores: 1 }], spirits: [{ card: ROKU }] },
        opp: { hand: [IVY], spirits: [{ card: ABYS }] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
    },
    expect: ["自分.ロクケラトプス.疲労: false → true", "相手.猫人アビシニア.疲労: false → true", ...IVY_COST],
})
scenario({
    name: "idol-lv1",
    start: {
        turn: "opp",
        me: { nexuses: [{ card: IDOL, cores: 0 }], spirits: [{ card: ROKU }] },
        opp: { hand: [IVY], spirits: [{ card: ABYS }] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
    },
    expect: ["自分.ロクケラトプス.疲労: false → true", ...IVY_COST],
})
// 自分の効果で疲労した場合は相手を疲労させない
scenario({
    name: "idol-lv2-own-effect",
    start: {
        me: { hand: [IVY], nexuses: [{ card: IDOL, cores: 1 }], spirits: [{ card: ROKU }] },
        opp: { spirits: [{ card: ABYS }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.手札: アイビィーケイジ → なし",
        "自分.トラッシュ: なし → アイビィーケイジ",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
    ],
})

console.log("=== BS12-050 突機竜アーケランサー：召喚時にドローし、相手のネクサス1つを破壊 ===")
const LANCER = "BS12-050"
const GATE = "BS12-066" // 巨木の門（Lv1のコア0個なら【転召】の置換以外に効果を持たないので、ネクサスの置き物に使う）
const LANCER_SUMMON = [
    "自分.突機竜アーケランサー.BP: なし → 3000",
    "自分.突機竜アーケランサー.Lv: なし → 1",
    "自分.突機竜アーケランサー.コア: なし → 1",
    "自分.突機竜アーケランサー.場所: なし → フィールド",
    "自分.突機竜アーケランサー.疲労: なし → false",
    "自分.リザーブ: 10 → 4",
    "自分.トラッシュのコア: 0 → 5",
    "自分.手札: 突機竜アーケランサー → ロクケラトプス",
    "自分.デッキ枚数: 40 → 39",
]
scenario({
    name: "lancer-summon-draw-and-break-nexus",
    start: { me: { hand: [LANCER], nexuses: [{ card: GATE, cores: 0 }] }, opp: { nexuses: [{ card: GATE, cores: 0 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [...LANCER_SUMMON, "相手.巨木の門.場所: ネクサス → なし", "相手.トラッシュ: なし → 巨木の門"],
})
scenario({
    name: "lancer-summon-no-opp-nexus",
    start: { me: { hand: [LANCER], nexuses: [{ card: GATE, cores: 0 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: LANCER_SUMMON,
})

console.log("=== 【重装甲】：指定された色の相手の効果を受けない ===")
const RIBBON = "BS01-146" // ドリームリボン（白・フラッシュ：相手のスピリット1体を手札に戻す）
const COFFIN = "BS01-131" // ダークコフィン（紫・メイン：疲労状態のスピリット1体を破壊）
const MAGICS = {
    [THORN]: { name: "バインディングソーン", cost: 2 },
    [FLAME]: { name: "フレイムダンス", cost: 5 },
    [RIBBON]: { name: "ドリームリボン", cost: 4 },
    [COFFIN]: { name: "ダークコフィン", cost: 7 },
} as const
for (const [id, m] of Object.entries(MAGICS)) assert(getCard(id).name === m.name && getCard(id).cost === m.cost, `${id} は ${m.name}`)

// 相手が自分のターン外（相手のメインステップ）で単体を狙うマジックを撃つ。装甲の対象は「効果を受けない」ので対象に選べず、
// 使用そのものが拒否される（盤面は何も変わらない）と読んだ。効くはずの色では通ることも別の場面で確かめている
function armorCase(name: string, o: { card: string; cores: number; rested?: boolean; magic: keyof typeof MAGICS; armored: boolean; label: string; bp?: number }) {
    const m = MAGICS[o.magic]
    const lines = o.armored ? [] : [`相手.手札: ${m.name} → なし`, `相手.トラッシュ: なし → ${m.name}`, `相手.リザーブ: 10 → ${10 - m.cost}`, `相手.トラッシュのコア: 0 → ${m.cost}`]
    if (!o.armored) {
        if (o.magic === THORN) lines.push(`自分.${o.label}.疲労: ${o.rested ?? false} → true`)
        else {
            lines.push(`自分.${o.label}.場所: フィールド → なし`)
            if (o.magic === FLAME || o.magic === COFFIN) lines.push(`自分.トラッシュ: なし → ${getCard(o.card).name}`)
            else lines.push(`自分.手札: なし → ${getCard(o.card).name}`)
            lines.push(`自分.リザーブ: 10 → ${10 + o.cores}`)
        }
    }
    scenario({
        name,
        start: { turn: "opp", me: { spirits: [{ card: o.card, cores: o.cores, ...(o.rested === undefined ? {} : { rested: o.rested }) }] }, opp: { hand: [o.magic] } },
        steps(t) {
            const cast = { type: "castMagic", handIndex: 0, targetInstanceId: t.id(o.label) } as const
            if (o.armored) t.actRejected("opp", cast)
            else t.act("opp", cast)
        },
        expect: lines,
    })
}
const LUNA = "BS12-X04"
const ZANI = "BS12-025"
const CLIZ = "BS12-027"
const SAIL = "BS12-028"
const FORS = "BS12-030"
armorCase("armor-luna-lv1-white", { card: LUNA, cores: 1, magic: RIBBON, armored: true, label: "月光神龍ルナテック・ストライクヴルム" })
armorCase("armor-luna-lv3-white", { card: LUNA, cores: 5, magic: RIBBON, armored: true, label: "月光神龍ルナテック・ストライクヴルム" })
armorCase("armor-luna-lv1-green", { card: LUNA, cores: 1, magic: THORN, armored: false, label: "月光神龍ルナテック・ストライクヴルム" })
armorCase("armor-zani-lv2-red", { card: ZANI, cores: 3, magic: FLAME, armored: true, label: "ザニーガン" })
armorCase("armor-zani-lv2-green", { card: ZANI, cores: 3, magic: THORN, armored: false, label: "ザニーガン" })
armorCase("armor-zani-lv1-red", { card: ZANI, cores: 1, magic: FLAME, armored: false, label: "ザニーガン" })
armorCase("armor-cliz-lv1-purple", { card: CLIZ, cores: 1, rested: true, magic: COFFIN, armored: true, label: "近衛機クリザンテMk-VIII" })
armorCase("armor-cliz-lv2-purple", { card: CLIZ, cores: 3, rested: true, magic: COFFIN, armored: true, label: "近衛機クリザンテMk-VIII" })
armorCase("armor-cliz-lv1-red", { card: CLIZ, cores: 1, magic: FLAME, armored: false, label: "近衛機クリザンテMk-VIII" })
armorCase("armor-sail-lv1-white", { card: SAIL, cores: 1, magic: RIBBON, armored: true, label: "セイルフィッシュ" })
armorCase("armor-sail-lv2-white", { card: SAIL, cores: 2, magic: RIBBON, armored: true, label: "セイルフィッシュ" })
armorCase("armor-sail-lv1-red", { card: SAIL, cores: 1, magic: FLAME, armored: false, label: "セイルフィッシュ" })
armorCase("armor-fors-lv1-purple", { card: FORS, cores: 1, rested: true, magic: COFFIN, armored: true, label: "機人フォルセティ" })
armorCase("armor-fors-lv1-green", { card: FORS, cores: 1, magic: THORN, armored: true, label: "機人フォルセティ" })
armorCase("armor-fors-lv2-green", { card: FORS, cores: 3, magic: THORN, armored: true, label: "機人フォルセティ" })
armorCase("armor-fors-lv1-red", { card: FORS, cores: 1, magic: FLAME, armored: false, label: "機人フォルセティ" })
armorCase("armor-fors-lv2-white", { card: FORS, cores: 3, magic: RIBBON, armored: false, label: "機人フォルセティ" })

console.log("=== BS12-055 ゲッコ・グライダー：【合体時】のときだけ【重装甲：紫/黄】 ===")
const GECKO = "BS12-055"
// 自分のターンに合体し、相手のターンに相手が狙う。相手のターン開始でドロー1枚・コア1個が入る
function geckoCombined(name: string, magic: keyof typeof MAGICS, hostRested: boolean, armored: boolean) {
    const m = MAGICS[magic]
    scenario({
        name,
        start: { me: { spirits: [{ card: GECKO }, { card: KOGUMARU, rested: hostRested }] }, opp: { hand: [magic] } },
        steps(t) {
            t.act("me", { type: "combineBrave", braveInstanceId: t.id("ゲッコ・グライダー"), hostInstanceId: t.id("コグマル") })
            t.act("me", { type: "endTurn" })
            const cast = { type: "castMagic", handIndex: 0, targetInstanceId: t.id("コグマル") } as const
            if (armored) t.actRejected("opp", cast)
            else t.act("opp", cast)
        },
        expect: [
            "自分.ゲッコ・グライダー.BP: 4000 → なし",
            "自分.ゲッコ・グライダー.コア: 1 → 0",
            "自分.ゲッコ・グライダー.場所: フィールド → 合体",
            "自分.コグマル.コア: 1 → 2",
            "自分.コグマル.BP: 2000 → 6000",
            "相手.デッキ枚数: 40 → 39",
            ...(armored
                ? ["相手.リザーブ: 10 → 11", `相手.手札: ${m.name} → ${m.name}、ロクケラトプス`]
                : [
                      `相手.手札: ${m.name} → ロクケラトプス`,
                      `相手.トラッシュ: なし → ${m.name}`,
                      `相手.リザーブ: 10 → ${11 - m.cost}`,
                      `相手.トラッシュのコア: 0 → ${m.cost}`,
                      "自分.コグマル.疲労: false → true",
                  ]),
        ],
    })
}
geckoCombined("gecko-combined-purple", COFFIN, true, true)
geckoCombined("gecko-combined-green", THORN, false, false)

// 合体していない（スピリット状態の）ゲッコ・グライダーは装甲を持たない
scenario({
    name: "gecko-uncombined-purple",
    start: { turn: "opp", me: { spirits: [{ card: GECKO, rested: true }] }, opp: { hand: [COFFIN] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ゲッコ・グライダー") })
    },
    expect: [
        "自分.ゲッコ・グライダー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ゲッコ・グライダー",
        "自分.リザーブ: 10 → 11",
        "相手.手札: ダークコフィン → なし",
        "相手.トラッシュ: なし → ダークコフィン",
        "相手.リザーブ: 10 → 3",
        "相手.トラッシュのコア: 0 → 7",
    ],
})

console.log("=== BS12-059 ショゴルス：【合体時】効果の記述を持たないものとして扱っても、ホストの効果は残る（SEMANTICS_AUDIT §3.19） ===")
const SHOGO = "BS12-059"
scenario({
    name: "shogorus-combined-host-keeps-armor",
    start: { me: { spirits: [{ card: SHOGO, cores: 2 }, { card: FORS, cores: 1 }] }, opp: { hand: [THORN] } },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ショゴルス"), hostInstanceId: t.id("機人フォルセティ") })
        t.act("me", { type: "endTurn" })
        t.actRejected("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("機人フォルセティ") })
    },
    expect: [
        "自分.ショゴルス.BP: 4000 → なし",
        "自分.ショゴルス.コア: 2 → 0",
        "自分.ショゴルス.場所: フィールド → 合体",
        "自分.機人フォルセティ.コア: 1 → 3",
        "自分.機人フォルセティ.Lv: 1 → 2",
        "自分.機人フォルセティ.BP: 4000 → 10000",
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: バインディングソーン → バインディングソーン、ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== BS12-046 ナタ・ゴレム：合体して効果の記述を持たないものとして扱っても、コア支払いの制限は残る（SEMANTICS_AUDIT §3.19） ===")
const NATA = "BS12-046"
const HEDGE = "BS10-065"
function nataAttack(name: string, combined: boolean, payFromSpirit: boolean) {
    const lines = [
        "自分.ナタ・ゴレム.疲労: false → true",
        "自分.ロクケラトプス.疲労: false → true",
        "相手.手札: バインディングソーン → なし",
        "相手.トラッシュ: なし → バインディングソーン",
        "相手.トラッシュのコア: 0 → 2",
    ]
    if (payFromSpirit) lines.push("相手.猫人アビシニア.コア: 3 → 1")
    else lines.push("相手.リザーブ: 10 → 8")
    if (combined) lines.push("自分.ヘッジボルグ.BP: 3000 → なし", "自分.ヘッジボルグ.コア: 1 → 0", "自分.ヘッジボルグ.場所: フィールド → 合体", "自分.ナタ・ゴレム.コア: 3 → 4", "自分.ナタ・ゴレム.BP: 8000 → 11000")
    scenario({
        name,
        start: {
            me: { spirits: [{ card: NATA, cores: 3 }, { card: ROKU }, ...(combined ? [{ card: HEDGE }] : [])] },
            opp: { hand: [THORN], spirits: [{ card: ABYS, cores: 3 }] },
        },
        steps(t) {
            if (combined) t.act("me", { type: "combineBrave", braveInstanceId: t.id("ヘッジボルグ"), hostInstanceId: t.id("ナタ・ゴレム") })
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("ナタ・ゴレム") })
            const cast = {
                type: "castMagic",
                handIndex: 0,
                targetInstanceId: t.id("ロクケラトプス"),
                ...(payFromSpirit ? { paySources: [{ instanceId: t.id("猫人アビシニア"), count: 2 }] } : {}),
            } as const
            if (payFromSpirit) t.actRejected("opp", cast)
            else t.act("opp", cast)
        },
        expect: payFromSpirit
            ? ["自分.ナタ・ゴレム.疲労: false → true", ...(combined ? lines.filter((l) => l.includes("ヘッジボルグ") || l.startsWith("自分.ナタ・ゴレム.コア") || l.startsWith("自分.ナタ・ゴレム.BP")) : [])]
            : lines,
    })
}
nataAttack("nata-uncombined-pay-from-spirit", false, true)
nataAttack("nata-uncombined-pay-from-reserve", false, false)
nataAttack("nata-combined-pay-from-spirit", true, true)

console.log("=== BS12-030 機人フォルセティ：【合体時】Lv2『相手のアタックステップ』白のスピリットすべてBP+3000 ===")
// 場面テストは自分のターンからしか合体を組めないので、合体は自分のメインで済ませ、
// ターンとステップの札だけを書き換えて BP を読む（BP の読み取りは effectiveBp）
function forsetiWorld(o: { cores: number; combined: boolean }): { s: GameState; fors: ReturnType<typeof createInstance>; white: ReturnType<typeof createInstance>; red: ReturnType<typeof createInstance> } {
    const s = createGame("forseti-bp", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = false
    const me = s.players.p1
    const fors = createInstance(FORS, 2, o.cores)
    const white = createInstance(ZANI, 2, 1)
    const red = createInstance(ROKU, 2, 1)
    const brave = createInstance(HEDGE, 2, 1)
    me.field.spirits = [fors, white, red, ...(o.combined ? [brave] : [])]
    s.players.p2.field.spirits = []
    refreshLevelAsOverrides(s)
    if (o.combined) assert(act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: fors.instanceId }) === null, "合体できる")
    return { s, fors, white, red }
}
function bpIn(w: ReturnType<typeof forsetiWorld>, turnPlayer: "p1" | "p2", phase: "main" | "attack") {
    w.s.turnPlayer = turnPlayer
    w.s.phase = phase
    return { fors: effectiveBp(w.s, "p1", w.fors), white: effectiveBp(w.s, "p1", w.white), red: effectiveBp(w.s, "p1", w.red) }
}
{
    const w = forsetiWorld({ cores: 3, combined: true })
    const base = bpIn(w, "p2", "main")
    const opp = bpIn(w, "p2", "attack")
    assert(opp.fors - base.fors === 3000, `Lv2合体：相手のアタックステップで自分(白)のフォルセティが+3000（実際 ${opp.fors - base.fors}）`)
    assert(opp.white - base.white === 3000, `Lv2合体：相手のアタックステップで他の白スピリットも+3000（実際 ${opp.white - base.white}）`)
    assert(opp.red - base.red === 0, `非白のスピリットは+されない（実際 ${opp.red - base.red}）`)
    const own = bpIn(w, "p1", "attack")
    assert(own.fors - base.fors === 0 && own.white - base.white === 0, "自分のアタックステップでは+されない")
}
{
    const w = forsetiWorld({ cores: 3, combined: false })
    const base = bpIn(w, "p2", "main")
    const opp = bpIn(w, "p2", "attack")
    assert(opp.white - base.white === 0 && opp.fors - base.fors === 0, "合体していなければ+されない")
}
{
    const w = forsetiWorld({ cores: 1, combined: true })
    const base = bpIn(w, "p2", "main")
    const opp = bpIn(w, "p2", "attack")
    assert(opp.white - base.white === 0 && opp.fors - base.fors === 0, "Lv1 では+されない")
}

console.log("=== BS12-081 メロディアスハープ：このターン、スピリット1体は効果をすべて失い、新たに得ることもない ===")
const HARP = "BS12-081"
const SHIELD = "BS02-100" // インビンシブルシールド（白・フラッシュ：自分のスピリット1体に赤/紫/緑/青の【装甲】を与える）
assert(getCard(HARP).name === "メロディアスハープ" && getCard(SHIELD).name === "インビンシブルシールド", "HARP/SHIELD の名前")
const harpCost = ["自分.手札: メロディアスハープ → なし", "自分.トラッシュ: なし → メロディアスハープ", "自分.トラッシュのコア: 0 → 3"]
function sibeAttack(name: string, harpTarget: string) {
    const lost = harpTarget === "一番槍のシベルザ"
    scenario({
        name,
        start: { me: { hand: [HARP], spirits: [{ card: SIBERUZA, cores: 3 }, { card: ROKU }] } },
        steps(t) {
            t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id(harpTarget) })
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("一番槍のシベルザ") })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            ...harpCost,
            "自分.リザーブ: 10 → 7",
            "相手.ライフ: 5 → 4",
            "相手.リザーブ: 10 → 11",
            ...(lost ? ["自分.一番槍のシベルザ.疲労: false → true"] : []),
        ],
    })
}
// 効果を失ったシベルザは「ターンの最初のアタックで回復する」効果も失う
sibeAttack("harp-on-siberuza", "一番槍のシベルザ")
sibeAttack("harp-on-other-spirit", "ロクケラトプス")

scenario({
    name: "harp-then-grant-armor",
    start: { me: { hand: [HARP, SHIELD], spirits: [{ card: ROKU }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロクケラトプス") })
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロクケラトプス") })
        assert(!hasArmorAgainst(t.state, t.inst("ロクケラトプス"), ["red"]), `[harp-then-grant-armor｜自分=${t.me}] ハープ後は新たな【装甲】を得ない`)
    },
    expect: [
        "自分.手札: インビンシブルシールド、メロディアスハープ → なし",
        "自分.トラッシュ: なし → インビンシブルシールド、メロディアスハープ",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 6",
    ],
})
scenario({
    name: "grant-armor-without-harp",
    start: { me: { hand: [SHIELD], spirits: [{ card: ROKU }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロクケラトプス") })
        assert(hasArmorAgainst(t.state, t.inst("ロクケラトプス"), ["red"]), `[grant-armor-without-harp｜自分=${t.me}] 対照：ハープが無ければ【装甲】を得る`)
    },
    expect: [
        "自分.手札: インビンシブルシールド → なし",
        "自分.トラッシュ: なし → インビンシブルシールド",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
    ],
})

console.log("=== BS12-016 骸巨人ギ・ガッシャ：トラッシュに「無魔」のスピリットが5枚以上ある間、手札ではコスト3 ===")
const GIGA = "BS12-016"
assert(getCard(GIGA).name === "骸巨人ギ・ガッシャ" && getCard(GIGA).cost === 8, "GIGAはコスト8")
for (const id of [MUMMY, "BS12-016"]) assert(getCard(id).family?.includes("無魔") === true, `${id} は無魔`)
function gigaCost(trash: string[], oppTrash: string[] = []): number {
    const s = createGame("giga-cost", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.players.p1.trashCards = [...trash]
    s.players.p2.trashCards = [...oppTrash]
    s.players.p1.hand = [GIGA]
    return effectiveCost(s, "p1", getCard(GIGA))
}
assert(gigaCost([MUMMY, MUMMY, MUMMY, MUMMY, MUMMY]) === 3, "無魔スピリット5枚でコスト3")
assert(gigaCost([MUMMY, MUMMY, MUMMY, MUMMY, MUMMY, MUMMY, MUMMY]) === 3, "無魔スピリット7枚でもコスト3")
assert(gigaCost([MUMMY, MUMMY, MUMMY, MUMMY]) === 8, "無魔スピリット4枚ならコスト8のまま")
assert(gigaCost([MUMMY, MUMMY, MUMMY, MUMMY, ROKU]) === 8, "無魔でないスピリットは数えない（4+1）")
assert(gigaCost([MUMMY, MUMMY, MUMMY, MUMMY, FLAME]) === 8, "マジックは数えない（4+1）")
assert(gigaCost([MUMMY, MUMMY, MUMMY, MUMMY], [MUMMY, MUMMY]) === 8, "相手のトラッシュは数えない")

scenario({
    name: "giga-summon-for-3",
    // リザーブ4＝コスト3＋置くコア1。コスト8のままなら召喚できない。
    // 召喚時の「好きなだけ」は選択待ちにならず最大（コスト合計13以内＝ミイラバード4枚）が自動で戻る。この場面では選ぶ段が無いのでそのまま写した
    start: { me: { reserve: 4, hand: [GIGA], trash: [MUMMY, MUMMY, MUMMY, MUMMY, MUMMY] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.骸巨人ギ・ガッシャ.BP: なし → 5000",
        "自分.骸巨人ギ・ガッシャ.Lv: なし → 1",
        "自分.骸巨人ギ・ガッシャ.コア: なし → 1",
        "自分.骸巨人ギ・ガッシャ.場所: なし → フィールド",
        "自分.骸巨人ギ・ガッシャ.疲労: なし → false",
        "自分.リザーブ: 4 → 0",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: 骸巨人ギ・ガッシャ → ミイラバード、ミイラバード、ミイラバード、ミイラバード",
        "自分.トラッシュ: ミイラバード、ミイラバード、ミイラバード、ミイラバード、ミイラバード → ミイラバード",
    ],
})

scenario({
    name: "giga-cost-8-with-four",
    start: { me: { reserve: 4, hand: [GIGA], trash: [MUMMY, MUMMY, MUMMY, MUMMY] } },
    steps(t) {
        t.actRejected("me", { type: "summon", handIndex: 0 })
    },
    expect: [],
})

console.log("=== BS12-049 アンフィスバエナー：「シール」と入っている相手のマジックの効果を無効にする ===")
const AMPH = "BS12-049"
const LUNATIC = "BS10-108" // ルナティックシール（メイン：エンドステップを3回行うまでお互いアタックステップを行えない）
assert(getCard(AMPH).name === "アンフィスバエナー" && getCard(LUNATIC).name === "ルナティックシール", "AMPH/LUNATIC の名前")
const OPT_DESTROY = "BP6000以下の相手のスピリット1体を破壊する"
const OPT_NEGATE = "カード名に「シール」と入っている相手のマジックの効果を無効にする"
const AMPH_SUMMON = [
    "自分.アンフィスバエナー.BP: なし → 4000",
    "自分.アンフィスバエナー.Lv: なし → 1",
    "自分.アンフィスバエナー.コア: なし → 1",
    "自分.アンフィスバエナー.場所: なし → フィールド",
    "自分.アンフィスバエナー.疲労: なし → false",
    "自分.トラッシュのコア: 0 → 5",
]
// 相手がターン中にルナティックシールを使い、次の自分のターンにアンフィスバエナーを召喚する。ターン交代で自分はドロー1枚・コア1個
const oppSealBase = ["相手.手札: ルナティックシール → なし", "相手.トラッシュのコア: 0 → 5"]
function amphAfterSeal(name: string, option: string, negated: boolean) {
    scenario({
        name,
        start: {
            turn: "opp",
            interactive: true,
            me: { hand: [AMPH] },
            opp: { hand: [LUNATIC], spirits: [{ card: ABYS, cores: 1 }] },
        },
        steps(t) {
            t.act("opp", { type: "castMagic", handIndex: 0 })
            t.act("opp", { type: "endTurn" })
            t.actRejected("me", { type: "nextPhase" })
            t.act("me", { type: "summon", handIndex: 0 })
            t.act("me", { type: "resolveChoice", option })
            if (negated) t.act("me", { type: "nextPhase" })
            else t.actRejected("me", { type: "nextPhase" })
        },
        expect: [
            ...oppSealBase,
            "自分.デッキ枚数: 40 → 39",
            ...AMPH_SUMMON,
            "自分.リザーブ: 10 → 5",
            "自分.手札: アンフィスバエナー → ロクケラトプス",
            ...(negated
                ? ["相手.トラッシュ: なし → ルナティックシール", "相手.リザーブ: 10 → 5"]
                : [
                      "相手.猫人アビシニア.場所: フィールド → なし",
                      "相手.トラッシュ: なし → ルナティックシール、猫人アビシニア",
                      "相手.リザーブ: 10 → 6",
                  ]),
        ],
    })
}
amphAfterSeal("amph-negate-seal", OPT_NEGATE, true)
amphAfterSeal("amph-destroy-instead", OPT_DESTROY, false)

// 自分のシール（「相手の」ではない）は無効にしない
scenario({
    name: "amph-negate-own-seal",
    start: { interactive: true, me: { reserve: 20, hand: [LUNATIC, AMPH] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "resolveChoice", option: OPT_NEGATE })
        t.actRejected("me", { type: "nextPhase" })
    },
    expect: [
        ...AMPH_SUMMON.map((l) => l.replace("トラッシュのコア: 0 → 5", "トラッシュのコア: 0 → 10")),
        "自分.手札: アンフィスバエナー、ルナティックシール → なし",
        "自分.トラッシュ: なし → ルナティックシール",
        "自分.リザーブ: 20 → 9",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part600）")
