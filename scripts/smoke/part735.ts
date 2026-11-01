// smoke パート735（BS19 green 9枚：BS19-072/085/086/087/103/104/105/X03/X07）
// 効果文と属性だけから期待値を書いた実装前テスト（docs/design/BS19_PLAN.md §2・SEMANTICS_AUDIT §3.23〜3.25）。
// 【強化】の行は扱わない（part726）。085 のLv1節（【強化】持ちへコア）は脇役にできる【強化】持ちが既存の弾に無いため未カバー（報告参照）。
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

// ---------- 対象9枚 ----------
const AKKESHI = "BS19-072" // アッケシグモ（緑ブレイヴ・怪虫・コスト6）
const SEIRYU = "BS19-085" // 零れ堕ちる清流（緑ネクサス・コスト4）
const KAKUREZATO = "BS19-086" // 忍の隠れ里（緑ネクサス・コスト4）
const NEJIRO = "BS19-087" // 魔王蟲の根城（緑/青ネクサス・コスト5）
const EMERALD = "BS19-103" // エメラルドフィールド（緑マジック・コスト3・場に残る）
const TURBULENCE = "BS19-104" // タービュランス（緑マジック・コスト4）
const BINDIVY = "BS19-105" // バインディングアイヴィー（緑マジック・コスト4）
const MANTIS = "BS19-X03" // 黒蟲魔王ディアボリカ・マンティス（緑・怪虫・コスト6）
const USUBA = "BS19-X07" // 黒蟲の妖刀ウスバカゲロウ（緑ブレイヴ・剣刃・コスト5）

// ---------- 脇役（既存の弾から。機械確認で名前・色・系統を確かめる） ----------
const VANILLA = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・バニラ）
const TERIMUCK = "BS17-019" // テリムック（緑・歌鳥・コスト0・バニラ）
const KAMOMEVE = "BS10-024" // カモメーヴェ（緑・爪鳥・コスト3・バニラ）
const ORYX = "BS17-046" // オリクス盗賊団（青・獣頭・コスト1・バニラ・青シンボル）
const GRIPHANS = "BS01-030" // グリプ・ハンズ（紫・幽魔・コスト3・『召喚時』1枚ドロー）
const ALDEED = "BS17-027" // 翠玉の怪鳥アルディード（緑・爪鳥・コスト7・【神速】のみ）
const DUALDO = "BS10-007" // デュアルド（赤・古竜/異合・コスト5・バニラ）
const YAKUSHA = "BS18-007" // ヤクシャモリ（赤・爬獣・コスト5・バニラ・Lv2 BP10000）
const BURSTDRAGON = "SD06-007" // 英雄龍ロード・ドラゴン（赤・【バースト：自分のライフ減少後】で召喚）

console.log("=== 前提: カードの機械確認 ===")
{
    // 対象9枚
    assert(getCard(AKKESHI).name === "アッケシグモ" && getCard(AKKESHI).type === "brave" && getCard(AKKESHI).colors.join() === "green" && getCard(AKKESHI).family.join() === "怪虫" && getCard(AKKESHI).cost === 6, "AKKESHIは緑ブレイヴ怪虫コスト6")
    assert(getCard(SEIRYU).name === "零れ堕ちる清流" && getCard(SEIRYU).type === "nexus" && getCard(SEIRYU).colors.join() === "green" && getCard(SEIRYU).cost === 4, "SEIRYUは緑ネクサスコスト4")
    assert(getCard(KAKUREZATO).name === "忍の隠れ里" && getCard(KAKUREZATO).type === "nexus" && getCard(KAKUREZATO).colors.join() === "green" && getCard(KAKUREZATO).cost === 4, "KAKUREZATOは緑ネクサスコスト4")
    assert(getCard(NEJIRO).name === "魔王蟲の根城" && getCard(NEJIRO).type === "nexus" && getCard(NEJIRO).colors.join() === "green,blue" && getCard(NEJIRO).cost === 5, "NEJIROは緑/青ネクサスコスト5")
    assert(getCard(EMERALD).name === "エメラルドフィールド" && getCard(EMERALD).type === "magic" && getCard(EMERALD).colors.join() === "green" && getCard(EMERALD).cost === 3, "EMERALDは緑マジックコスト3")
    assert(getCard(TURBULENCE).name === "タービュランス" && getCard(TURBULENCE).type === "magic" && getCard(TURBULENCE).colors.join() === "green" && getCard(TURBULENCE).cost === 4, "TURBULENCEは緑マジックコスト4")
    assert(getCard(BINDIVY).name === "バインディングアイヴィー" && getCard(BINDIVY).type === "magic" && getCard(BINDIVY).colors.join() === "green" && getCard(BINDIVY).cost === 4, "BINDIVYは緑マジックコスト4")
    assert(getCard(MANTIS).name === "黒蟲魔王ディアボリカ・マンティス" && getCard(MANTIS).type === "spirit" && getCard(MANTIS).colors.join() === "green" && getCard(MANTIS).family.join() === "怪虫" && getCard(MANTIS).cost === 6, "MANTISは緑怪虫コスト6")
    assert(getCard(USUBA).name === "黒蟲の妖刀ウスバカゲロウ" && getCard(USUBA).type === "brave" && getCard(USUBA).colors.join() === "green" && getCard(USUBA).family.join() === "剣刃" && getCard(USUBA).cost === 5, "USUBAは緑ブレイヴ剣刃コスト5")
    // 脇役
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).colors.join() === "red" && getCard(VANILLA).family.join() === "地竜" && getCard(VANILLA).cost === 1 && getCard(VANILLA).effect === "", "VANILLAは赤地竜コスト1バニラ")
    assert(getCard(TERIMUCK).name === "テリムック" && getCard(TERIMUCK).colors.join() === "green" && getCard(TERIMUCK).family.join() === "歌鳥" && getCard(TERIMUCK).cost === 0, "TERIMUCKは緑歌鳥コスト0")
    assert(getCard(KAMOMEVE).name === "カモメーヴェ" && getCard(KAMOMEVE).colors.join() === "green" && getCard(KAMOMEVE).family.join() === "爪鳥" && getCard(KAMOMEVE).cost === 3, "KAMOMEVEは緑爪鳥コスト3")
    assert(getCard(ORYX).name === "オリクス盗賊団" && getCard(ORYX).colors.join() === "blue" && getCard(ORYX).family.join() === "獣頭" && getCard(ORYX).cost === 1, "ORYXは青獣頭コスト1")
    assert(getCard(GRIPHANS).name === "グリプ・ハンズ" && getCard(GRIPHANS).colors.join() === "purple" && getCard(GRIPHANS).family.join() === "幽魔" && getCard(GRIPHANS).cost === 3, "GRIPHANSは紫幽魔コスト3")
    assert(getCard(ALDEED).name === "翠玉の怪鳥アルディード" && getCard(ALDEED).colors.join() === "green" && getCard(ALDEED).family.join() === "爪鳥" && getCard(ALDEED).cost === 7, "ALDEEDは緑爪鳥コスト7")
    assert(getCard(DUALDO).name === "デュアルド" && getCard(DUALDO).colors.join() === "red" && getCard(DUALDO).cost === 5 && getCard(DUALDO).effect === "", "DUALDOは赤コスト5バニラ")
    assert(getCard(YAKUSHA).name === "ヤクシャモリ" && getCard(YAKUSHA).colors.join() === "red" && getCard(YAKUSHA).family.join() === "爬獣" && getCard(YAKUSHA).cost === 5, "YAKUSHAは赤爬獣コスト5")
    assert(getCard(BURSTDRAGON).name === "英雄龍ロード・ドラゴン" && getCard(BURSTDRAGON).colors.join() === "red" && getCard(BURSTDRAGON).cost === 6 && getCard(BURSTDRAGON).effect.includes("【バースト：自分のライフ減少後】"), "BURSTDRAGONは赤のライフ減少後バースト")
}

// ============================================================
// BS19-072 アッケシグモ
// Lv1『このブレイヴの召喚時』ボイドからコア1個ずつを【連鎖】を持つ自分のスピリットすべてに置く
// ============================================================

// 起きる場面：【連鎖】持ち（X03）がいるときに召喚すると、その個体にコアが1個乗る
scenario({
    name: "072_rensa_cores",
    start: { me: { spirits: [{ card: MANTIS, label: "ディアボリカ", cores: 1 }], hand: [AKKESHI] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: アッケシグモ → なし",
        "自分.リザーブ: 10 → 4", // コスト6から緑シンボル1つで軽減→5支払い＋維持コア1
        "自分.トラッシュのコア: 0 → 5",
        "自分.ディアボリカ.コア: 1 → 2",
        "自分.アッケシグモ.場所: なし → フィールド",
        "自分.アッケシグモ.疲労: なし → false",
        "自分.アッケシグモ.コア: なし → 1",
        "自分.アッケシグモ.Lv: なし → 1",
        "自分.アッケシグモ.BP: なし → 3000",
    ],
})

// 起きない場面：【連鎖】を持つスピリットがいないときはコアは乗らない
scenario({
    name: "072_no_rensa_holder",
    start: { me: { spirits: [{ card: VANILLA }], hand: [AKKESHI] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: アッケシグモ → なし",
        "自分.リザーブ: 10 → 3", // 緑シンボルなし→6支払い＋維持コア1
        "自分.トラッシュのコア: 0 → 6",
        "自分.アッケシグモ.場所: なし → フィールド",
        "自分.アッケシグモ.疲労: なし → false",
        "自分.アッケシグモ.コア: なし → 1",
        "自分.アッケシグモ.Lv: なし → 1",
        "自分.アッケシグモ.BP: なし → 3000",
    ],
})

// ソウルコアあり：ボイドから乗るコアは通常コアで、[ソウルコア]はその個体に留まる
scenario({
    name: "072_soulcore_stays",
    start: { me: { spirits: [{ card: MANTIS, label: "ディアボリカ", cores: 1 }], soulCore: "ディアボリカ", hand: [AKKESHI] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: アッケシグモ → なし",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.ディアボリカ.コア: 1 → 2",
        "自分.アッケシグモ.場所: なし → フィールド",
        "自分.アッケシグモ.疲労: なし → false",
        "自分.アッケシグモ.コア: なし → 1",
        "自分.アッケシグモ.Lv: なし → 1",
        "自分.アッケシグモ.BP: なし → 3000",
    ],
})

// ============================================================
// BS19-085 零れ堕ちる清流
// Lv1･Lv2『自分のアタックステップ』緑のスピリットのアタックで【強化】持ちにコア（脇役不在のため未カバー）
// Lv2『相手のアタックステップ』相手のアタックでライフが減ったとき1枚ドロー
// ============================================================

// 起きる場面：Lv2で相手のアタックによりライフが減ったら1枚ドロー
scenario({
    name: "085_lv2_draw_on_life_loss",
    start: { turn: "opp", me: { nexuses: [{ card: SEIRYU, cores: 2 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.ロクケラトプス.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → ロクケラトプス",
    ],
})

// 起きない場面：Lv1（コア1個）ではドローしない
scenario({
    name: "085_lv1_no_draw",
    start: { turn: "opp", me: { nexuses: [{ card: SEIRYU, cores: 1 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.ロクケラトプス.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})

// ============================================================
// BS19-086 忍の隠れ里
// Lv1･Lv2『自分のエンドステップ』自分の緑のスピリットすべてを回復させる
// Lv2『自分のアタックステップ』爪鳥のアタックで相手1体を疲労させる
// ============================================================

// 起きる場面：エンドステップで緑のスピリットだけ回復する（赤は疲労のまま＝否定も兼ねる）
scenario({
    name: "086_end_refresh_green_only",
    start: { me: { nexuses: [{ card: KAKUREZATO, cores: 1 }], spirits: [{ card: TERIMUCK, rested: true }, { card: VANILLA, rested: true }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
    },
    expect: [
        "自分.テリムック.疲労: true → false",
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きる場面：Lv2で爪鳥がアタックしたら相手1体を疲労させる
scenario({
    name: "086_lv2_toride_exhausts",
    start: { me: { nexuses: [{ card: KAKUREZATO, cores: 3 }], spirits: [{ card: KAMOMEVE }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("カモメーヴェ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.カモメーヴェ.疲労: false → true",
        "相手.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きない場面：爪鳥でなければ（緑・歌鳥のアタックでは）疲労させない
scenario({
    name: "086_lv2_not_toride",
    start: { me: { nexuses: [{ card: KAKUREZATO, cores: 3 }], spirits: [{ card: TERIMUCK }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("テリムック") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.テリムック.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// BS19-087 魔王蟲の根城
// Lv1･Lv2『自分のアタックステップ』【連鎖】持ちのアタックでライフが減ったらボイドからリザーブにコア1個
// Lv2『お互いのアタックステップ』ターンに1回、【神速】召喚のコストを支払わない
// ============================================================

// 起きる場面：【連鎖】持ち（X03）のアタックでライフが減ったらリザーブにコア1個（X03の連鎖[青]も根城の青シンボルで発動）
scenario({
    name: "087_core_on_rensa_attack",
    start: { me: { nexuses: [{ card: NEJIRO, cores: 1 }], spirits: [{ card: MANTIS, label: "ディアボリカ", cores: 1 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ディアボリカ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ディアボリカ.疲労: false → true",
        "相手.ロクケラトプス.疲労: false → true", // X03のアタック時効果
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.リザーブ: 10 → 11", // 根城Lv1：ボイドからリザーブへ
        "自分.デッキ枚数: 40 → 38", // X03の連鎖[青]：2枚ドロー
        "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス", // その後2枚破棄
    ],
})

// 起きない場面：【連鎖】を持たないスピリットのアタックではリザーブにコアは増えない
scenario({
    name: "087_no_core_without_rensa",
    start: { me: { nexuses: [{ card: NEJIRO, cores: 1 }], spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きる場面：Lv2なら【神速】召喚のコストを支払わない（維持コア1個だけ減る）
scenario({
    name: "087_lv2_shinsoku_free",
    start: { me: { nexuses: [{ card: NEJIRO, cores: 2 }], spirits: [{ card: VANILLA }], hand: [ALDEED] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "summon", handIndex: 0 }) // フラッシュ【神速】でコスト支払いなし
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.リザーブ: 10 → 9", // 維持コアのみ
        "自分.手札: 翠玉の怪鳥アルディード → なし",
        "自分.翠玉の怪鳥アルディード.場所: なし → フィールド",
        "自分.翠玉の怪鳥アルディード.疲労: なし → false",
        "自分.翠玉の怪鳥アルディード.コア: なし → 1",
        "自分.翠玉の怪鳥アルディード.Lv: なし → 1",
        "自分.翠玉の怪鳥アルディード.BP: なし → 4000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きない場面：Lv1（コア1個）では【神速】召喚のコストを支払う（緑シンボル1つで7→6）
scenario({
    name: "087_lv1_shinsoku_paid",
    start: { me: { nexuses: [{ card: NEJIRO, cores: 1 }], spirits: [{ card: VANILLA }], hand: [ALDEED] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "summon", handIndex: 0 })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.リザーブ: 10 → 3", // 6支払い＋維持コア1
        "自分.トラッシュのコア: 0 → 6",
        "自分.手札: 翠玉の怪鳥アルディード → なし",
        "自分.翠玉の怪鳥アルディード.場所: なし → フィールド",
        "自分.翠玉の怪鳥アルディード.疲労: なし → false",
        "自分.翠玉の怪鳥アルディード.コア: なし → 1",
        "自分.翠玉の怪鳥アルディード.Lv: なし → 1",
        "自分.翠玉の怪鳥アルディード.BP: なし → 4000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// BS19-103 エメラルドフィールド（場に残るマジック）
// ============================================================

// 場面1：使うと自分のフィールドに残り、いる間はドローステップ以外のドローができない
scenario({
    name: "103_field_blocks_draw",
    start: { me: { spirits: [{ card: VANILLA }], hand: [EMERALD, GRIPHANS] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.act("me", { type: "summon", handIndex: 0 }) // 『召喚時』ドローが止まる
    },
    expect: [
        "自分.手札: エメラルドフィールド、グリプ・ハンズ → なし",
        "自分.リザーブ: 10 → 3", // 103コスト3＋ハンズ3＋維持コア1
        "自分.トラッシュのコア: 0 → 6",
        "自分.グリプ・ハンズ.場所: なし → フィールド",
        "自分.グリプ・ハンズ.疲労: なし → false",
        "自分.グリプ・ハンズ.コア: なし → 1",
        "自分.グリプ・ハンズ.Lv: なし → 1",
        "自分.グリプ・ハンズ.BP: なし → 2000",
        // デッキ枚数は減らない（ドロー禁止）。103はトラッシュへは行かない（場に残る）
    ],
})

// 場面1b：いる間は効果以外でスピリットのコアを0個にできない（メインステップのコア移動）
scenario({
    name: "103_field_blocks_core_zero",
    start: { me: { spirits: [{ card: VANILLA, cores: 1 }], hand: [EMERALD] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.actRejected("me", { type: "moveCore", instanceId: t.id("ロクケラトプス"), direction: "remove", confirmDeplete: true })
    },
    expect: [
        "自分.手札: エメラルドフィールド → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
    ],
})

// 場面2：相手のアタックでライフが減ると自分のトラッシュへ破棄され、以降ドローができる
scenario({
    name: "103_discarded_then_draw_works",
    start: { me: { hand: [EMERALD, GRIPHANS] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" }) // ここで103がトラッシュへ
        t.act("opp", { type: "endTurn" })
        t.act("me", { type: "summon", handIndex: 0 }) // 破棄後なので『召喚時』ドローが通る
    },
    expect: [
        "自分.手札: エメラルドフィールド、グリプ・ハンズ → ロクケラトプス、ロクケラトプス",
        "自分.トラッシュ: なし → エメラルドフィールド",
        "自分.デッキ枚数: 40 → 38", // ドローステップ1枚＋『召喚時』1枚
        "自分.ライフ: 5 → 4",
        "自分.グリプ・ハンズ.場所: なし → フィールド",
        "自分.グリプ・ハンズ.疲労: なし → false",
        "自分.グリプ・ハンズ.コア: なし → 1",
        "自分.グリプ・ハンズ.Lv: なし → 1",
        "自分.グリプ・ハンズ.BP: なし → 2000",
        "相手.ロクケラトプス.疲労: false → true",
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "自分.トラッシュのコア: 0 → 3",
        "自分.リザーブ: 10 → 8",
    ],
})

// ============================================================
// BS19-104 タービュランス
// メイン：このターンの間、コスト4以下の自分のスピリットがアタックするとき相手はバーストを発動できない
// フラッシュ：このターンの間、スピリット1体をBP+2000する
// ============================================================

// 起きる場面：コスト4以下のアタックでは相手バースト（ライフ減少後）が発動しない
scenario({
    name: "104_burst_banned_low_cost",
    start: { me: { spirits: [{ card: VANILLA }], hand: [TURBULENCE] }, opp: { burst: BURSTDRAGON } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: タービュランス → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → タービュランス",
        "自分.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        // 相手.バーストは「英雄龍ロード・ドラゴン」のまま（§3.23：そのアタックの間だけ発動できない）
    ],
})

// 起きない場面：コスト5以上のスピリットのアタックならバーストは発動する
scenario({
    name: "104_burst_fires_cost5",
    start: { me: { spirits: [{ card: DUALDO }], hand: [TURBULENCE] }, opp: { burst: BURSTDRAGON } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("デュアルド") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: タービュランス → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → タービュランス",
        "自分.デュアルド.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.バースト: 英雄龍ロード・ドラゴン → なし",
        "相手.英雄龍ロード・ドラゴン.場所: なし → フィールド",
        "相手.英雄龍ロード・ドラゴン.疲労: なし → false",
        "相手.英雄龍ロード・ドラゴン.コア: なし → 1",
        "相手.英雄龍ロード・ドラゴン.Lv: なし → 1",
        "相手.英雄龍ロード・ドラゴン.BP: なし → 4000",
    ],
})

// フラッシュ：スピリット1体をこのターンの間BP+2000する
scenario({
    name: "104_flash_bp_plus",
    start: { me: { spirits: [{ card: VANILLA }], hand: [TURBULENCE] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: タービュランス → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → タービュランス",
        "自分.ロクケラトプス.BP: 1000 → 3000",
        "自分.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// BS19-105 バインディングアイヴィー
// フラッシュ：相手のスピリット1体を疲労させる
// 【連鎖：条件《青シンボル》】[青]：コスト3以下の相手のスピリット1体を破壊する
// ============================================================

// 起きる場面：フラッシュで1体疲労させ、青シンボルがあれば連鎖でコスト3以下を破壊する
scenario({
    name: "105_exhaust_chain_destroy",
    start: { me: { spirits: [{ card: VANILLA, label: "アタッカー" }, { card: ORYX }], hand: [BINDIVY] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: バインディングアイヴィー → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → バインディングアイヴィー",
        "自分.アタッカー.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし", // 疲労の後、連鎖[青]で破壊
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12", // 破壊されたコア＋ライフのコア
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面：青シンボルがなければ疲労だけで、破壊は起きない
scenario({
    name: "105_exhaust_only_no_blue",
    start: { me: { spirits: [{ card: VANILLA, label: "アタッカー" }], hand: [BINDIVY] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: バインディングアイヴィー → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → バインディングアイヴィー",
        "自分.アタッカー.疲労: false → true",
        "相手.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// BS19-X03 黒蟲魔王ディアボリカ・マンティス
// Lv1･Lv2『アタック時』相手1体を疲労させる／【連鎖：青】2枚ドロー→2枚破棄
// Lv2『自分のアタックステップ』ライフを減らしたら相手のライフのコア1個を相手のリザーブへ
// ============================================================

// 起きる場面：アタック時効果で相手1体を疲労させる（Lv1＝Lv2効果の否定にもなる：ライフは1しか減らない）
scenario({
    name: "x03_attack_exhausts",
    start: { me: { spirits: [{ card: MANTIS, label: "ディアボリカ", cores: 1 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ディアボリカ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ディアボリカ.疲労: false → true",
        "相手.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 連鎖[青]：青シンボルがあるとき2枚ドロー→2枚破棄（手札0枚でもデッキ2枚減・トラッシュ2枚増）
scenario({
    name: "x03_chain_blue_draw_discard",
    start: { me: { spirits: [{ card: MANTIS, label: "ディアボリカ", cores: 1 }, { card: ORYX }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ディアボリカ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ディアボリカ.疲労: false → true",
        "相手.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.デッキ枚数: 40 → 38",
        "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
    ],
})

// Lv2：ライフを減らしたら、通常の減少に加えてライフのコア1個を相手のリザーブに置く
scenario({
    name: "x03_lv2_life_core_to_reserve",
    start: { me: { spirits: [{ card: MANTIS, label: "ディアボリカ", cores: 3 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ディアボリカ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ディアボリカ.疲労: false → true",
        "相手.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

// ============================================================
// BS19-X07 黒蟲の妖刀ウスバカゲロウ
// フラッシュ【神速】／【合体時】『バトル時』相手はバーストを発動できない
// 【合体時】『アタック時』BPを比べ相手のスピリットだけを破壊したとき、ライフのコア1個を相手のトラッシュへ
// ============================================================

// 【神速】：アタックステップのフラッシュで手札から召喚できる
scenario({
    name: "x07_shinsoku_flash_summon",
    start: { me: { spirits: [{ card: VANILLA }], hand: [USUBA] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "summon", handIndex: 0 })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 黒蟲の妖刀ウスバカゲロウ → なし",
        "自分.リザーブ: 10 → 4", // コスト5＋維持コア1
        "自分.トラッシュのコア: 0 → 5",
        "自分.ロクケラトプス.疲労: false → true",
        "自分.黒蟲の妖刀ウスバカゲロウ.場所: なし → フィールド",
        "自分.黒蟲の妖刀ウスバカゲロウ.疲労: なし → false",
        "自分.黒蟲の妖刀ウスバカゲロウ.コア: なし → 1",
        "自分.黒蟲の妖刀ウスバカゲロウ.Lv: なし → 1",
        "自分.黒蟲の妖刀ウスバカゲロウ.BP: なし → 5000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 【合体時】バトル時：合体スピリットのアタック中は相手バースト（ライフ減少後）が発動しない
scenario({
    name: "x07_combined_burst_banned",
    start: { me: { spirits: [{ card: DUALDO }], hand: [USUBA] }, opp: { burst: BURSTDRAGON } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("デュアルド") }) // ダイレクト合体
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("デュアルド") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 黒蟲の妖刀ウスバカゲロウ → なし",
        "自分.リザーブ: 10 → 5", // コスト5のみ（ダイレクト合体は維持コア不要）
        "自分.トラッシュのコア: 0 → 5",
        "自分.デュアルド.BP: 5000 → 10000",
        "自分.デュアルド.疲労: false → true",
        "自分.黒蟲の妖刀ウスバカゲロウ.場所: なし → 合体",
        "自分.黒蟲の妖刀ウスバカゲロウ.疲労: なし → false",
        "自分.黒蟲の妖刀ウスバカゲロウ.コア: なし → 0",
        "自分.黒蟲の妖刀ウスバカゲロウ.Lv: なし → 1",
        // 相手.バーストは「英雄龍ロード・ドラゴン」のまま
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

// 起きない場面：合体していなければ（ブレイヴ単体のとき）バーストは発動する
scenario({
    name: "x07_spiritstate_burst_fires",
    start: { me: { spirits: [{ card: DUALDO }], hand: [USUBA] }, opp: { burst: BURSTDRAGON } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // スピリット状態で召喚
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("デュアルド") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 黒蟲の妖刀ウスバカゲロウ → なし",
        "自分.リザーブ: 10 → 4", // コスト5＋維持コア1
        "自分.トラッシュのコア: 0 → 5",
        "自分.デュアルド.疲労: false → true",
        "自分.黒蟲の妖刀ウスバカゲロウ.場所: なし → フィールド",
        "自分.黒蟲の妖刀ウスバカゲロウ.疲労: なし → false",
        "自分.黒蟲の妖刀ウスバカゲロウ.コア: なし → 1",
        "自分.黒蟲の妖刀ウスバカゲロウ.Lv: なし → 1",
        "自分.黒蟲の妖刀ウスバカゲロウ.BP: なし → 5000",
        "相手.ライフ: 5 → 4",
        "相手.バースト: 英雄龍ロード・ドラゴン → なし",
        "相手.英雄龍ロード・ドラゴン.場所: なし → フィールド",
        "相手.英雄龍ロード・ドラゴン.疲労: なし → false",
        "相手.英雄龍ロード・ドラゴン.コア: なし → 1",
        "相手.英雄龍ロード・ドラゴン.Lv: なし → 1",
        "相手.英雄龍ロード・ドラゴン.BP: なし → 4000",
    ],
})

// 【合体時】アタック時：BPを比べ相手だけを破壊したら、ライフのコア1個を相手のトラッシュに置く
scenario({
    name: "x07_battle_life_core_to_trash",
    start: { me: { spirits: [{ card: DUALDO }], hand: [USUBA] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("デュアルド") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("デュアルド") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: 黒蟲の妖刀ウスバカゲロウ → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.デュアルド.BP: 5000 → 10000",
        "自分.デュアルド.疲労: false → true",
        "自分.黒蟲の妖刀ウスバカゲロウ.場所: なし → 合体",
        "自分.黒蟲の妖刀ウスバカゲロウ.疲労: なし → false",
        "自分.黒蟲の妖刀ウスバカゲロウ.コア: なし → 0",
        "自分.黒蟲の妖刀ウスバカゲロウ.Lv: なし → 1",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11", // 破壊されたブロッカーのコア
        "相手.トラッシュのコア: 0 → 1", // ライフのコア1個がトラッシュへ
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面：相打ち（BP同値）は「相手のスピリットだけ」ではないので、ライフのコアは動かない
scenario({
    name: "x07_mutual_destroy_no_life_core",
    start: { me: { spirits: [{ card: DUALDO }], hand: [USUBA] }, opp: { spirits: [{ card: YAKUSHA, cores: 4 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("デュアルド") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("デュアルド") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ヤクシャモリ") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: 黒蟲の妖刀ウスバカゲロウ → なし",
        "自分.トラッシュのコア: 0 → 5",
        "自分.デュアルド.場所: フィールド → なし",
        "相手.ヤクシャモリ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヤクシャモリ",
        "相手.リザーブ: 10 → 14",
        // 相手.トラッシュのコアは 0 のまま／相手.ライフは 5 のまま
        "自分.トラッシュ: なし → デュアルド",
        "自分.リザーブ: 10 → 5",
        "自分.黒蟲の妖刀ウスバカゲロウ.BP: なし → 5000",
        "自分.黒蟲の妖刀ウスバカゲロウ.Lv: なし → 1",
        "自分.黒蟲の妖刀ウスバカゲロウ.コア: なし → 1",
        "自分.黒蟲の妖刀ウスバカゲロウ.場所: なし → フィールド",
        "自分.黒蟲の妖刀ウスバカゲロウ.疲労: なし → true",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part735）")
