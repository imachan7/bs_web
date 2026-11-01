// smoke パート733（BS19 紫 担当7枚：BS19-070 鎧戦艦ブレード・ハインド／BS19-082 魂彷徨う骨の森／BS19-083 大蛇の城門／
// BS19-084 命の蝋燭塔／BS19-100 デッドエンドフィールド／BS19-102 パープルヘイズ／BS19-X02 冥府三巨頭バロック・ボルドー。
// 期待値役が効果文と属性だけから書いた場面テスト。effects は未実装なので、実装前に落ちるのが正しい）
// 参照: BS19_PLAN §2.2（C 場に残るマジック・D X02 の下のカード）・SEMANTICS_AUDIT §3.23〜3.25・CONJUNCTION.md・TEST_STRATEGY §5・§6・SOULCORE.md §1
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const HIND = "BS19-070" // 鎧戦艦ブレード・ハインド（紫・ブレイヴ・コスト5・魔影）
const BONEWOOD = "BS19-082" // 魂彷徨う骨の森（紫・ネクサス・コスト4）
const SNAKEGATE = "BS19-083" // 大蛇の城門（紫・ネクサス・コスト4）
const CANDLE = "BS19-084" // 命の蝋燭塔（紫/黄・ネクサス・コスト5）
const DEADEND = "BS19-100" // デッドエンドフィールド（紫・マジック・コスト3）
const HAZE = "BS19-102" // パープルヘイズ（紫・マジック・コスト6）
const BAROQUE = "BS19-X02" // 冥府三巨頭バロック・ボルドー（紫・スピリット・コスト8・魔神/無魔）

// 脇役（既存の弾から。BS19 は effects がまだ無いので脇役にしない）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）
const SHIKA = "BS16-010" // 骨鹿（紫・無魔・コスト1・効果なし）
const HEBI = "SD01-012" // 双頭ヘビ（紫・妖蛇・コスト4）
const CAESAR = "BS01-063" // エメラルドシーザー（緑・怪虫・コスト4・召喚時に相手1体を疲労させる）
const KIRIKABUTO = "BS01-065" // キリカブト（緑・怪虫・コスト4・召喚時にボイドからコア1個を自分のスピリットに置く）
const PHENIX = "BS01-023" // 原始鳥フェニキオス（赤・空牙・コスト7・召喚時にBP3000以下を全破壊）
const GUST = "BS09-069" // フレイムガスト（赤・マジック6・フラッシュでBP6000以下の相手1体を破壊）
const CALLLOST = "BS01-118" // コールオブロスト（赤・マジック4・相手の手札の枚数を見るための埋め草）
const MJOLNIR = "BS03-144" // マジックハンマー（青・マジック4・メインで相手のデッキを上から5枚破棄）
const GATHER = "BS01-136" // ギャザーフォース（緑・マジック3・メインでボイドから自分のリザーブにコア1個）
const EXECUTION = "BS14-111" // エクスキューションデストロイ（青・マジック3・メインで相手のデッキを上から1枚破棄）

// 手番の中で召喚した個体（ラベルは写像のときに初めて付くので t.id では引けない）の instanceId を探す
function summonedId(t: ScenarioCtx, side: "me" | "opp", cardId: string): string {
    const pid = side === "me" ? t.me : t.opp
    const p = t.state.players[pid]
    const hit = [...p.field.spirits, ...p.field.nexuses, ...p.field.combinedBraves].find((x) => x.cardId === cardId)
    if (!hit) throw new Error(`フィールドに ${cardId} がいない`)
    return hit.instanceId
}

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    assert(c(HIND).name === "鎧戦艦ブレード・ハインド" && c(HIND).type === "brave" && c(HIND).colors.join() === "purple" && c(HIND).family.join() === "魔影" && c(HIND).cost === 5, "HINDは紫コスト5のブレイヴ（魔影）")
    assert(c(BONEWOOD).name === "魂彷徨う骨の森" && c(BONEWOOD).type === "nexus" && c(BONEWOOD).colors.join() === "purple" && c(BONEWOOD).cost === 4, "BONEWOODは紫コスト4のネクサス")
    assert(c(SNAKEGATE).name === "大蛇の城門" && c(SNAKEGATE).type === "nexus" && c(SNAKEGATE).colors.join() === "purple" && c(SNAKEGATE).cost === 4, "SNAKEGATEは紫コスト4のネクサス")
    assert(c(CANDLE).name === "命の蝋燭塔" && c(CANDLE).type === "nexus" && c(CANDLE).colors.join() === "purple,yellow" && c(CANDLE).cost === 5, "CANDLEは紫/黄コスト5のネクサス")
    assert(c(DEADEND).name === "デッドエンドフィールド" && c(DEADEND).type === "magic" && c(DEADEND).colors.join() === "purple" && c(DEADEND).cost === 3, "DEADENDは紫コスト3のマジック")
    assert(c(HAZE).name === "パープルヘイズ" && c(HAZE).type === "magic" && c(HAZE).colors.join() === "purple" && c(HAZE).cost === 6, "HAZEは紫コスト6のマジック")
    assert(c(BAROQUE).name === "冥府三巨頭バロック・ボルドー" && c(BAROQUE).type === "spirit" && c(BAROQUE).colors.join() === "purple" && c(BAROQUE).family.join() === "魔神,無魔" && c(BAROQUE).cost === 8 && c(BAROQUE).levels[0]!.bp === 6000, "BAROQUEは紫コスト8のスピリット（魔神/無魔・Lv1 BP6000）")
    assert(c(ROKU).name === "ロクケラトプス" && c(ROKU).type === "spirit" && c(ROKU).colors.join() === "red" && c(ROKU).cost === 1 && c(ROKU).effects.length === 0, "ROKUは赤コスト1のバニラ")
    assert(c(SHIKA).name === "骨鹿" && c(SHIKA).type === "spirit" && c(SHIKA).colors.join() === "purple" && c(SHIKA).family.includes("無魔") && c(SHIKA).effects.length === 0, "SHIKAは紫の効果なしスピリット（無魔）")
    assert(c(HEBI).name === "双頭ヘビ" && c(HEBI).type === "spirit" && c(HEBI).colors.join() === "purple" && c(HEBI).family.includes("妖蛇") && c(HEBI).cost === 4, "HEBIは紫コスト4のスピリット（妖蛇）")
    assert(c(CAESAR).name === "エメラルドシーザー" && c(CAESAR).type === "spirit" && c(CAESAR).colors.join() === "green" && c(CAESAR).family.includes("怪虫") && c(CAESAR).cost === 4, "CAESARは緑コスト4のスピリット（怪虫）")
    assert(c(KIRIKABUTO).name === "キリカブト" && c(KIRIKABUTO).type === "spirit" && c(KIRIKABUTO).colors.join() === "green" && c(KIRIKABUTO).family.includes("怪虫") && c(KIRIKABUTO).cost === 4, "KIRIKABUTOは緑コスト4のスピリット（怪虫）")
    assert(c(PHENIX).name === "原始鳥フェニキオス" && c(PHENIX).type === "spirit" && c(PHENIX).colors.join() === "red" && c(PHENIX).family.includes("空牙") && c(PHENIX).cost === 7, "PHENIXは赤コスト7のスピリット（空牙）")
    assert(c(GUST).name === "フレイムガスト" && c(GUST).type === "magic" && c(GUST).colors.join() === "red" && c(GUST).cost === 6, "GUSTは赤コスト6のマジック")
    assert(c(CALLLOST).name === "コールオブロスト" && c(CALLLOST).type === "magic" && c(CALLLOST).colors.join() === "red" && c(CALLLOST).cost === 4, "CALLLOSTは赤コスト4のマジック")
    assert(c(MJOLNIR).name === "マジックハンマー" && c(MJOLNIR).type === "magic" && c(MJOLNIR).colors.join() === "blue" && c(MJOLNIR).cost === 4, "MJOLNIRは青コスト4のマジック")
    assert(c(GATHER).name === "ギャザーフォース" && c(GATHER).type === "magic" && c(GATHER).colors.join() === "green" && c(GATHER).cost === 3, "GATHERは緑コスト3のマジック")
    assert(c(EXECUTION).name === "エクスキューションデストロイ" && c(EXECUTION).type === "magic" && c(EXECUTION).colors.join() === "blue" && c(EXECUTION).cost === 3, "EXECUTIONは青コスト3のマジック")
}

// ── BS19-070 鎧戦艦ブレード・ハインド ──
// 『このブレイヴの召喚時』相手のスピリット1体のコア1個を相手のリザーブに置く。
// この効果でそのスピリットのコアが0個になったとき、ボイドからコア1個を自分のリザーブに置く。

console.log("=== BS19-070 召喚時：コア1個をリザーブへ。0個になったら破壊されて、ボイドから自分のリザーブに+1 ===")
scenario({
    name: "hindo-deplete",
    start: { me: { hand: [HIND] }, opp: { spirits: [{ card: ROKU, cores: 1, label: "標的" }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 鎧戦艦ブレード・ハインド → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.鎧戦艦ブレード・ハインド.場所: なし → フィールド",
        "自分.鎧戦艦ブレード・ハインド.疲労: なし → false",
        "自分.鎧戦艦ブレード・ハインド.コア: なし → 1",
        "自分.鎧戦艦ブレード・ハインド.Lv: なし → 1",
        "自分.鎧戦艦ブレード・ハインド.BP: なし → 3000",
        "相手.標的.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== BS19-070 召喚時：コアが0個にならなければボイドの+1は無い ===")
scenario({
    name: "hindo-survive",
    start: { me: { hand: [HIND] }, opp: { spirits: [{ card: ROKU, cores: 2, label: "標的" }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 鎧戦艦ブレード・ハインド → なし",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.鎧戦艦ブレード・ハインド.場所: なし → フィールド",
        "自分.鎧戦艦ブレード・ハインド.疲労: なし → false",
        "自分.鎧戦艦ブレード・ハインド.コア: なし → 1",
        "自分.鎧戦艦ブレード・ハインド.Lv: なし → 1",
        "自分.鎧戦艦ブレード・ハインド.BP: なし → 3000",
        "相手.標的.コア: 2 → 1",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== BS19-070 召喚時：ソウルコア1個だけのスピリットは、その1個がリザーブへ移って破壊される ===")
scenario({
    name: "hindo-soulcore",
    start: { me: { hand: [HIND] }, opp: { spirits: [{ card: ROKU, cores: 1, label: "標的" }], soulCore: "標的" } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 鎧戦艦ブレード・ハインド → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.鎧戦艦ブレード・ハインド.場所: なし → フィールド",
        "自分.鎧戦艦ブレード・ハインド.疲労: なし → false",
        "自分.鎧戦艦ブレード・ハインド.コア: なし → 1",
        "自分.鎧戦艦ブレード・ハインド.Lv: なし → 1",
        "自分.鎧戦艦ブレード・ハインド.BP: なし → 3000",
        "相手.標的.場所: フィールド → なし",
        "相手.ソウルコア: 相手.標的 → リザーブ",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ── BS19-082 魂彷徨う骨の森 ──
// Lv1･Lv2『お互いのアタックステップ』自分のスピリットが破壊されたとき、自分はデッキから1枚ドローする。
// Lv2 系統：「無魔」を持つ自分のスピリットすべては、相手の効果では疲労しない。

console.log("=== BS19-082 Lv1『お互いのアタックステップ』：自分のスピリットが相手の効果で破壊されたら1枚ドロー ===")
scenario({
    name: "bonewood-draw",
    start: {
        turn: "opp",
        phase: "attack",
        me: { nexuses: [{ card: BONEWOOD, cores: 0 }], spirits: [{ card: ROKU, label: "標的" }] },
        opp: { spirits: [{ card: ROKU, label: "アタッカー" }], hand: [GUST] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("me", { type: "pass" })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("標的") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.アタッカー.疲労: false → true",
        "相手.手札: フレイムガスト → なし",
        "相手.リザーブ: 10 → 5",
        "相手.トラッシュ: なし → フレイムガスト",
        "相手.トラッシュのコア: 0 → 5",
        "自分.標的.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 12",
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → ロクケラトプス",
        "自分.ライフ: 5 → 4",
    ],
})

console.log("=== BS19-082 Lv1：アタックステップ外（相手のメインステップ）の破壊では引かない ===")
scenario({
    name: "bonewood-mainstep",
    start: {
        turn: "opp",
        phase: "main",
        me: { nexuses: [{ card: BONEWOOD, cores: 0 }], spirits: [{ card: ROKU, label: "標的" }] },
        opp: { hand: [PHENIX] },
    },
    steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
    expect: [
        "相手.手札: 原始鳥フェニキオス → なし",
        "相手.リザーブ: 10 → 2",
        "相手.トラッシュのコア: 0 → 7",
        "相手.原始鳥フェニキオス.場所: なし → フィールド",
        "相手.原始鳥フェニキオス.疲労: なし → false",
        "相手.原始鳥フェニキオス.コア: なし → 1",
        "相手.原始鳥フェニキオス.Lv: なし → 1",
        "相手.原始鳥フェニキオス.BP: なし → 4000",
        "自分.標的.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
    ],
})

console.log("=== BS19-082 Lv2：系統「無魔」の自分のスピリットは、相手の効果では疲労しない ===")
scenario({
    name: "bonewood-mama",
    start: {
        turn: "opp",
        phase: "main",
        me: { nexuses: [{ card: BONEWOOD, cores: 1 }], spirits: [{ card: SHIKA }] },
        opp: { hand: [CAESAR] },
    },
    steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
    expect: [
        "相手.手札: エメラルドシーザー → なし",
        "相手.リザーブ: 10 → 5",
        "相手.トラッシュのコア: 0 → 4",
        "相手.エメラルドシーザー.場所: なし → フィールド",
        "相手.エメラルドシーザー.疲労: なし → false",
        "相手.エメラルドシーザー.コア: なし → 1",
        "相手.エメラルドシーザー.Lv: なし → 1",
        "相手.エメラルドシーザー.BP: なし → 3000",
    ],
})

console.log("=== BS19-082 Lv2：無魔でなければ相手の効果で疲労する ===")
scenario({
    name: "bonewood-notmama",
    start: {
        turn: "opp",
        phase: "main",
        me: { nexuses: [{ card: BONEWOOD, cores: 1 }], spirits: [{ card: ROKU, label: "標的" }] },
        opp: { hand: [CAESAR] },
    },
    steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
    expect: [
        "相手.手札: エメラルドシーザー → なし",
        "相手.リザーブ: 10 → 5",
        "相手.トラッシュのコア: 0 → 4",
        "相手.エメラルドシーザー.場所: なし → フィールド",
        "相手.エメラルドシーザー.疲労: なし → false",
        "相手.エメラルドシーザー.コア: なし → 1",
        "相手.エメラルドシーザー.Lv: なし → 1",
        "相手.エメラルドシーザー.BP: なし → 3000",
        "自分.標的.疲労: false → true",
    ],
})

// ── BS19-083 大蛇の城門 ──
// Lv1･Lv2『相手のメインステップ』召喚するためにコアを置くとき以外で、コアを置かれた相手のスピリットすべては疲労する。
// Lv2『自分のアタックステップ』系統：「妖蛇」を持つ自分のスピリットがアタックしたとき、相手のスピリットのコア1個を相手のリザーブに置く。

console.log("=== BS19-083 Lv1『相手のメインステップ』：効果でコアを置かれた相手のスピリットは疲労する ===")
scenario({
    name: "snakegate-exhaust",
    start: { turn: "opp", phase: "main", me: { nexuses: [{ card: SNAKEGATE, cores: 1 }] }, opp: { hand: [KIRIKABUTO] } },
    steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
    expect: [
        "相手.手札: キリカブト → なし",
        "相手.リザーブ: 10 → 5",
        "相手.トラッシュのコア: 0 → 4",
        "相手.キリカブト.場所: なし → フィールド",
        "相手.キリカブト.疲労: なし → true",
        "相手.キリカブト.コア: なし → 2",
        "相手.キリカブト.Lv: なし → 1",
        "相手.キリカブト.BP: なし → 1000",
    ],
})

console.log("=== BS19-083 Lv1：召喚のためにコアを置いただけでは疲労しない ===")
scenario({
    name: "snakegate-summon",
    start: { turn: "opp", phase: "main", me: { nexuses: [{ card: SNAKEGATE, cores: 1 }] }, opp: { hand: [ROKU] } },
    steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
    expect: [
        "相手.手札: ロクケラトプス → なし",
        "相手.リザーブ: 10 → 8",
        "相手.トラッシュのコア: 0 → 1",
        "相手.ロクケラトプス.場所: なし → フィールド",
        "相手.ロクケラトプス.疲労: なし → false",
        "相手.ロクケラトプス.コア: なし → 1",
        "相手.ロクケラトプス.Lv: なし → 1",
        "相手.ロクケラトプス.BP: なし → 1000",
    ],
})

console.log("=== BS19-083 Lv2『自分のアタックステップ』：妖蛇のアタックで相手のスピリットのコア1個をリザーブへ ===")
scenario({
    name: "snakegate-attack",
    start: {
        phase: "attack",
        me: { nexuses: [{ card: SNAKEGATE, cores: 3 }], spirits: [{ card: HEBI }] },
        opp: { spirits: [{ card: ROKU, cores: 2, label: "標的" }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("双頭ヘビ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.双頭ヘビ.疲労: false → true",
        "相手.標的.コア: 2 → 1",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== BS19-083 Lv2：妖蛇でなければコアは動かない ===")
scenario({
    name: "snakegate-notsnake",
    start: {
        phase: "attack",
        me: { nexuses: [{ card: SNAKEGATE, cores: 3 }], spirits: [{ card: ROKU, label: "アタッカー" }] },
        opp: { spirits: [{ card: ROKU, cores: 2, label: "標的" }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.アタッカー.疲労: false → true",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== BS19-083 Lv2：ソウルコア1個だけの相手スピリットは、その1個がリザーブへ移って破壊される ===")
scenario({
    name: "snakegate-attack-soulcore",
    start: {
        phase: "attack",
        me: { nexuses: [{ card: SNAKEGATE, cores: 3 }], spirits: [{ card: HEBI }] },
        opp: { spirits: [{ card: ROKU, cores: 1, label: "標的" }], soulCore: "標的" },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("双頭ヘビ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.双頭ヘビ.疲労: false → true",
        "相手.標的.場所: フィールド → なし",
        "相手.ソウルコア: 相手.標的 → リザーブ",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

// ── BS19-084 命の蝋燭塔 ──
// Lv1･Lv2【連鎖】を持つ自分のスピリットが相手の効果によって破壊されたとき、自分は、相手の手札1枚を破棄する。
//   ※ 既存の弾に【連鎖】を持つスピリットがいないため、正場面は書けない。起きない場面だけ書く
// Lv2『相手のメインステップ』相手によって自分のデッキが破棄されるとき、相手は、相手のリザーブのコア10個を
// 相手のトラッシュに置かなければ自分のデッキを破棄できない。

console.log("=== BS19-084 Lv1：【連鎖】を持たないスピリットの破壊では、相手の手札は破棄されない ===")
scenario({
    name: "candle-notrensa",
    start: {
        turn: "opp",
        phase: "attack",
        me: { nexuses: [{ card: CANDLE, cores: 1 }], spirits: [{ card: ROKU, label: "標的" }] },
        opp: { spirits: [{ card: ROKU, label: "アタッカー" }], hand: [GUST, CALLLOST] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("me", { type: "pass" })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("標的") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.アタッカー.疲労: false → true",
        "相手.手札: コールオブロスト、フレイムガスト → コールオブロスト",
        "相手.リザーブ: 10 → 5",
        "相手.トラッシュ: なし → フレイムガスト",
        "相手.トラッシュのコア: 0 → 5",
        "自分.標的.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 12",
        "自分.ライフ: 5 → 4",
    ],
})

console.log("=== BS19-084 Lv2『相手のメインステップ』：自分のデッキ破棄には相手のリザーブ10個が要る（払えるなら払って破棄される） ===")
scenario({
    name: "candle-toll",
    start: { turn: "opp", phase: "main", me: { nexuses: [{ card: CANDLE, cores: 1 }] }, opp: { reserve: 20, hand: [MJOLNIR] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" }),
    expect: [
        "相手.手札: マジックハンマー → なし",
        "相手.リザーブ: 20 → 6",
        "相手.トラッシュのコア: 0 → 14",
        "相手.トラッシュ: なし → マジックハンマー、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "自分.デッキ枚数: 40 → 35",
        "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
    ],
})

console.log("=== BS19-084 Lv2：相手のリザーブが10個に満たなければデッキは破棄されない ===")
scenario({
    name: "candle-cantpay",
    start: { turn: "opp", phase: "main", me: { nexuses: [{ card: CANDLE, cores: 1 }] }, opp: { hand: [MJOLNIR] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" }),
    expect: [
        "相手.手札: マジックハンマー → なし",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 4",
        "相手.トラッシュ: なし → マジックハンマー",
    ],
})

// ── BS19-100 デッドエンドフィールド（場に残るマジック。BS19_PLAN §2.2 C）──
// メイン：お互い、コアステップ以外でボイドからコアを増やせず、デッキを破棄することができない。
// このマジックカードは、自分のスピリットが相手の効果によって破壊されるまで自分のフィールドに置いておき、
// その間、効果を発揮し続ける。この効果が無効になったとき破棄される。
// フラッシュ：このターンの間、スピリット1体をBP+2000する。

console.log("=== BS19-100 メインで使う：フィールドに残り、ボイド増加もデッキ破棄もお互いにできない ===")
scenario({
    name: "deadend-field",
    start: { me: { hand: [DEADEND, GATHER, EXECUTION] } },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" }) // デッドエンドフィールド → 場に残る
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" }) // ギャザーフォース → ボイドからのコア増加が止められる
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" }) // エクスキューションデストロイ → デッキ破棄が止められる
    },
    expect: [
        "自分.手札: エクスキューションデストロイ、ギャザーフォース、デッドエンドフィールド → なし",
        "自分.リザーブ: 10 → 1",
        "自分.トラッシュのコア: 0 → 9",
        "自分.トラッシュ: なし → エクスキューションデストロイ、ギャザーフォース",
    ],
})

console.log("=== BS19-100 自分のスピリットが相手の効果で破壊されたら自分のトラッシュへ行き、破棄が再びできる ===")
scenario({
    name: "deadend-broken",
    start: { me: { hand: [DEADEND], spirits: [{ card: ROKU, label: "アタッカー" }] }, opp: { hand: [GUST, MJOLNIR] } },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("アタッカー") })
        t.closeFlash()
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" }) // トラッシュへ行ったあとなら破棄できる
    },
    expect: [
        "自分.手札: デッドエンドフィールド → なし",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 3",
        "自分.アタッカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → デッドエンドフィールド、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "自分.デッキ枚数: 40 → 35",
        "相手.手札: フレイムガスト、マジックハンマー → ロクケラトプス",
        "相手.リザーブ: 10 → 1",
        "相手.トラッシュ: なし → フレイムガスト、マジックハンマー",
        "相手.トラッシュのコア: 0 → 10",
        "相手.デッキ枚数: 40 → 39",
    ],
})

console.log("=== BS19-100 フラッシュで使う：BP+2000だけ。フィールドには残らない ===")
scenario({
    name: "deadend-flash",
    start: { phase: "attack", me: { hand: [DEADEND], spirits: [{ card: ROKU, label: "アタッカー" }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("アタッカー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.アタッカー.疲労: false → true",
        "自分.アタッカー.BP: 1000 → 3000",
        "自分.手札: デッドエンドフィールド → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.トラッシュ: なし → デッドエンドフィールド",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ── BS19-102 パープルヘイズ ──
// フラッシュ：相手のスピリット1体のコア1個を相手のリザーブに置く。
// この効果でそのスピリットのコアが0個になったとき、このマジックカードは手札に戻る。

console.log("=== BS19-102 コアが0個になったら破壊されて、このマジックは手札に戻る ===")
scenario({
    name: "haze-return",
    start: { turn: "opp", phase: "attack", me: { hand: [HAZE] }, opp: { spirits: [{ card: ROKU, cores: 1, label: "アタッカー" }] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("アタッカー") })
    },
    expect: [
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 6",
        "相手.アタッカー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== BS19-102 コアが0個にならなければ手札には戻らない ===")
scenario({
    name: "haze-trash",
    start: {
        phase: "attack",
        me: { hand: [HAZE], spirits: [{ card: ROKU, label: "アタッカー" }] },
        opp: { spirits: [{ card: ROKU, cores: 2, label: "標的" }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("標的") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.アタッカー.疲労: false → true",
        "自分.手札: パープルヘイズ → なし",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 6",
        "自分.トラッシュ: なし → パープルヘイズ",
        "相手.標的.コア: 2 → 1",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== BS19-102 ソウルコア1個だけのスピリット：その1個がリザーブへ移り、手札に戻る ===")
scenario({
    name: "haze-soulcore",
    start: { turn: "opp", phase: "attack", me: { hand: [HAZE] }, opp: { spirits: [{ card: ROKU, cores: 1, label: "アタッカー" }], soulCore: "アタッカー" } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("アタッカー") })
    },
    expect: [
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 6",
        "相手.アタッカー.場所: フィールド → なし",
        "相手.ソウルコア: 相手.アタッカー → リザーブ",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ── BS19-X02 冥府三巨頭バロック・ボルドー（BS19_PLAN §2.2 D）──
// Lv1･Lv2･Lv3『このスピリットの召喚時』自分の手札3枚までを裏向きでこのスピリットの下に置く。
// (下のカードは、このスピリットがフィールドを離れるとき破棄する)
// Lv1･Lv2･Lv3 このスピリットが相手によって破壊される/手札かデッキに戻るとき、
// 下のカード1枚を破棄することで、回復状態でフィールドに残る。
// Lv2･Lv3『このスピリットのアタック時』下のカード1枚を破棄することで、
// 相手のスピリット1体を破壊し、そのスピリットのコア1個をボイドに置く。

console.log("=== BS19-X02 召喚時：手札3枚までをこのスピリットの下に置く（写像に無いので手札の減りで見る） ===")
scenario({
    name: "baroque-summon",
    start: { me: { hand: [BAROQUE, ROKU, ROKU, ROKU] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: ロクケラトプス、ロクケラトプス、ロクケラトプス、冥府三巨頭バロック・ボルドー → なし",
        "自分.リザーブ: 10 → 1",
        "自分.トラッシュのコア: 0 → 8",
        "自分.冥府三巨頭バロック・ボルドー.場所: なし → フィールド",
        "自分.冥府三巨頭バロック・ボルドー.疲労: なし → false",
        "自分.冥府三巨頭バロック・ボルドー.コア: なし → 1",
        "自分.冥府三巨頭バロック・ボルドー.Lv: なし → 1",
        "自分.冥府三巨頭バロック・ボルドー.BP: なし → 6000",
    ],
})

console.log("=== BS19-X02 Lv2 アタック時：下のカード1枚を破棄して相手1体を破壊し、コア1個だけボイドへ ===")
scenario({
    name: "baroque-under-attack",
    start: { me: { reserve: 15, hand: [BAROQUE, ROKU] }, opp: { spirits: [{ card: ROKU, cores: 3, label: "標的" }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, level: 2 })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: summonedId(t, "me", BAROQUE) })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ロクケラトプス、冥府三巨頭バロック・ボルドー → なし",
        "自分.リザーブ: 15 → 4",
        "自分.トラッシュのコア: 0 → 8",
        "自分.冥府三巨頭バロック・ボルドー.場所: なし → フィールド",
        "自分.冥府三巨頭バロック・ボルドー.疲労: なし → true",
        "自分.冥府三巨頭バロック・ボルドー.コア: なし → 3",
        "自分.冥府三巨頭バロック・ボルドー.Lv: なし → 2",
        "自分.冥府三巨頭バロック・ボルドー.BP: なし → 8000",
        "自分.トラッシュ: なし → ロクケラトプス",
        "相手.標的.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 13",
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== BS19-X02 Lv2 アタック時（ソウルコア）：ボイドへ行くのは通常コアで、ソウルコアはリザーブへ残る ===")
scenario({
    name: "baroque-under-attack-soulcore",
    start: { me: { reserve: 15, hand: [BAROQUE, ROKU] }, opp: { spirits: [{ card: ROKU, cores: 3, label: "標的" }], soulCore: "標的" } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, level: 2 })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: summonedId(t, "me", BAROQUE) })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ロクケラトプス、冥府三巨頭バロック・ボルドー → なし",
        "自分.リザーブ: 15 → 4",
        "自分.トラッシュのコア: 0 → 8",
        "自分.冥府三巨頭バロック・ボルドー.場所: なし → フィールド",
        "自分.冥府三巨頭バロック・ボルドー.疲労: なし → true",
        "自分.冥府三巨頭バロック・ボルドー.コア: なし → 3",
        "自分.冥府三巨頭バロック・ボルドー.Lv: なし → 2",
        "自分.冥府三巨頭バロック・ボルドー.BP: なし → 8000",
        "自分.トラッシュ: なし → ロクケラトプス",
        "相手.標的.場所: フィールド → なし",
        "相手.ソウルコア: 相手.標的 → リザーブ",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 13",
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== BS19-X02 Lv2 アタック時：下のカードが無ければ破壊もしない ===")
scenario({
    name: "baroque-no-under",
    start: { me: { reserve: 15, hand: [BAROQUE] }, opp: { spirits: [{ card: ROKU, cores: 2, label: "標的" }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, level: 2 })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: summonedId(t, "me", BAROQUE) })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 冥府三巨頭バロック・ボルドー → なし",
        "自分.リザーブ: 15 → 4",
        "自分.トラッシュのコア: 0 → 8",
        "自分.冥府三巨頭バロック・ボルドー.場所: なし → フィールド",
        "自分.冥府三巨頭バロック・ボルドー.疲労: なし → true",
        "自分.冥府三巨頭バロック・ボルドー.コア: なし → 3",
        "自分.冥府三巨頭バロック・ボルドー.Lv: なし → 2",
        "自分.冥府三巨頭バロック・ボルドー.BP: なし → 8000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== BS19-X02 相手の効果で破壊されるとき：下のカード1枚を破棄して回復状態で残る ===")
scenario({
    name: "baroque-stay",
    start: { me: { hand: [BAROQUE, ROKU, ROKU] }, opp: { spirits: [{ card: ROKU, label: "アタッカー" }], hand: [GUST] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("me", { type: "pass" })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: summonedId(t, "me", BAROQUE) })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ロクケラトプス、ロクケラトプス、冥府三巨頭バロック・ボルドー → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 8",
        "自分.冥府三巨頭バロック・ボルドー.場所: なし → フィールド",
        "自分.冥府三巨頭バロック・ボルドー.疲労: なし → false",
        "自分.冥府三巨頭バロック・ボルドー.コア: なし → 1",
        "自分.冥府三巨頭バロック・ボルドー.Lv: なし → 1",
        "自分.冥府三巨頭バロック・ボルドー.BP: なし → 6000",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.ライフ: 5 → 4",
        "相手.アタッカー.疲労: false → true",
        "相手.手札: フレイムガスト → ロクケラトプス",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュ: なし → フレイムガスト",
        "相手.トラッシュのコア: 0 → 5",
        "相手.デッキ枚数: 40 → 39",
    ],
})

console.log("=== BS19-X02 下のカードが無ければ、相手の効果で破壊されたままトラッシュへ行く ===")
scenario({
    name: "baroque-fall",
    start: { me: { hand: [BAROQUE] }, opp: { spirits: [{ card: ROKU, label: "アタッカー" }], hand: [GUST] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("me", { type: "pass" })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: summonedId(t, "me", BAROQUE) })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 冥府三巨頭バロック・ボルドー → なし",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 8",
        "自分.トラッシュ: なし → 冥府三巨頭バロック・ボルドー",
        "自分.ライフ: 5 → 4",
        "相手.アタッカー.疲労: false → true",
        "相手.手札: フレイムガスト → ロクケラトプス",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュ: なし → フレイムガスト",
        "相手.トラッシュのコア: 0 → 5",
        "相手.デッキ枚数: 40 → 39",
    ],
})

console.log("=== BS19-X02 フィールドを離れるとき：下のカードは破棄されて自分のトラッシュへ（消滅で見る） ===")
scenario({
    name: "baroque-leave",
    start: { me: { hand: [BAROQUE, ROKU] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "moveCore", instanceId: summonedId(t, "me", BAROQUE), direction: "remove", confirmDeplete: true })
    },
    expect: [
        "自分.手札: ロクケラトプス、冥府三巨頭バロック・ボルドー → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 8",
        "自分.トラッシュ: なし → ロクケラトプス、冥府三巨頭バロック・ボルドー",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part733）")
