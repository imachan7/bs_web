// smoke パート603（BS15 の実行時カバレッジで未実行だった効果節の場面テスト。期待値は効果文だけから書いた）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { InstanceSpec, Side } from "./scenario"

const CATA = "BS15-009" // 虚龍帝カタストロフドラゴン
const SHOKA = "BS15-026" // 軍師鳥ショカツリョー
const HOUOU = "BS15-027" // 虚天帝ホウオウガ
const YURI = "BS15-061" // 幼竜の揺り籠
const BAARAL = "BS15-X02" // 虚皇帝ネザード・バァラル
const SOUSO = "BS15-X03" // 鳥武帝スザクロス・ソウソー
const ANAGU = "BS15-022" // アナグマッド・デビル
const HAIJI = "BS15-066" // 廃寺の無限階段
const WERE = "BS15-012" // ワーウルフ・コマンド
const GAWAIN = "BS15-016" // 闇騎士ガウェイン
const GRASS = "BS15-031" // 虚獣グラスベア
const MEGA = "BS15-035" // 軍神機メガ・テュール
const SAIGO = "BS15-X06" // 鉄の覇王サイゴード・ゴレム
const BONGO = "BS15-005" // 虚獣チャンプボンゴル
const IBOS = "BS15-014" // 冥虚獣イボス
const AOI = "BS15-021" // 虚兵アオイ・スビン
const ARATORON = "BS15-042" // オリンピアの天使アラトロン
const EME = "BS15-051" // 虚海獣エメヒドラル
const UZU = "BS15-072" // 渦巻く大海峡
const VOLS = "BS15-036" // 虚械帝インフェニット・ヴォルス
const ESAR = "BS15-015" // 吸血令嬢エサルフリーダ
const TSUN = "BS15-049" // ツンドッグ・ゴレム

const VANILLA = "BS01-002" // ロクケラトプス（赤・Lv1 BP1000）
const PANDAL = "BS15-020" // パンダル（緑・【暴風：1】・Lv1 BP2000）
const YATSUNO = "BS14-032" // ヤツノカンゾウ（緑・【暴風：2】）
const HORN = "BS06-003" // 猛角獣ホーングリズリー（赤・【激突】）
const ASH = "BS07-010" // アシュタル（紫・夜族・バニラ・BP1000）
const TIGER = "BS03-099" // 虎拳士タイガ（青・バニラ・Lv1 BP5000）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・バニラ・Lv1 BP4000）
const BEETLE = "BS01-050" // ビートビートル（緑・バニラ・Lv1 BP1000）
const DOLF = "BS06-061" // ドルフィーノ（青・バニラ・Lv1 BP1000）
const BULL = "BS03-071" // 戦闘獣ブルトップ（青・バニラ）
const ILLU = "BS16-053" // イルルヤンカッシュ（青・バニラ・シンボル2・Lv1 BP5000）
const BURSTM = "BS14-099" // 武迅衝（緑・バースト効果を持つマジック）
const SHURI = "BS10-003" // シュリケラプトル（赤・Lv2 BP3000／Lv3 BP5000）
const MAMI = "BS02-017" // マミーラ（紫・召喚時：相手のスピリット1体のコア1個をリザーブへ）
const EMER = "BS01-063" // エメラルドシーザー（緑・召喚時：相手のスピリット1体を疲労）
const RAZ = "BS03-076" // 爪剣のラザラス（青・【粉砕】・Lv1 BP2000）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        [CATA]: "虚龍帝カタストロフドラゴン", [SHOKA]: "軍師鳥ショカツリョー", [HOUOU]: "虚天帝ホウオウガ", [YURI]: "幼竜の揺り籠",
        [BAARAL]: "虚皇帝ネザード・バァラル", [SOUSO]: "鳥武帝スザクロス・ソウソー", [ANAGU]: "アナグマッド・デビル", [HAIJI]: "廃寺の無限階段",
        [WERE]: "ワーウルフ・コマンド", [GAWAIN]: "闇騎士ガウェイン", [GRASS]: "虚獣グラスベア", [MEGA]: "軍神機メガ・テュール",
        [SAIGO]: "鉄の覇王サイゴード・ゴレム", [BONGO]: "虚獣チャンプボンゴル", [IBOS]: "冥虚獣イボス", [AOI]: "虚兵アオイ・スビン",
        [ARATORON]: "オリンピアの天使アラトロン", [EME]: "虚海獣エメヒドラル", [UZU]: "渦巻く大海峡", [VOLS]: "虚械帝インフェニット・ヴォルス",
        [ESAR]: "吸血令嬢エサルフリーダ", [TSUN]: "ツンドッグ・ゴレム", [VANILLA]: "ロクケラトプス", [PANDAL]: "パンダル",
        [YATSUNO]: "ヤツノカンゾウ", [HORN]: "猛角獣ホーングリズリー", [ASH]: "アシュタル", [TIGER]: "虎拳士タイガ", [HERA]: "ヘラクレス・ジオ",
        [BEETLE]: "ビートビートル", [DOLF]: "ドルフィーノ", [BULL]: "戦闘獣ブルトップ", [ILLU]: "イルルヤンカッシュ", [BURSTM]: "武迅衝",
        [SHURI]: "シュリケラプトル", [MAMI]: "マミーラ", [EMER]: "エメラルドシーザー", [RAZ]: "爪剣のラザラス",
    }
    for (const [id, name] of Object.entries(names)) assert(getCard(id).name === name, `${id} は ${name}`)
}

const nameOf = (id: string) => getCard(id).name
const sortedNames = (ids: string[]) => ids.map(nameOf).sort().join("、")
const spirit = (card: string, cores = 1, extra: Partial<InstanceSpec> = {}): InstanceSpec => ({ card, cores, ...extra })
const rested = (card: string, cores = 1): InstanceSpec => ({ card, cores, rested: true })

// 召喚で新しく現れた個体の行（場面の途中で現れた個体は変化前を「なし」として写る）
function appeared(k: "自分" | "相手", card: string, cores: number, lv: number, bp: number, label = nameOf(card)): string[] {
    return [`${k}.${label}.場所: なし → フィールド`, `${k}.${label}.疲労: なし → false`, `${k}.${label}.コア: なし → ${cores}`, `${k}.${label}.Lv: なし → ${lv}`, `${k}.${label}.BP: なし → ${bp}`]
}

// ---------------------------------------------------------------------------------------------
console.log("=== 1. 手札のコストが7になる（自分のバーストをセットしている間）／バァラルは逆 ===")
// 軽減シンボルはフィールドに無いので、コストはそのまま払う。召喚＝コスト＋Lv1のコア1個
for (const [card, bp] of [[CATA, 7000], [HOUOU, 8000], [VOLS, 7000]] as const) {
    const name = nameOf(card)
    scenario({
        name: `cost7-burst-${card}`,
        start: { me: { reserve: 8, hand: [card], burst: BURSTM } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: ["自分.リザーブ: 8 → 0", "自分.トラッシュのコア: 0 → 7", `自分.手札: ${name} → なし`, ...appeared("自分", card, 1, 1, bp)],
    })
    scenario({
        name: `cost11-noburst-${card}`,
        start: { me: { reserve: 8, hand: [card] } },
        steps(t) {
            t.actRejected("me", { type: "summon", handIndex: 0 })
        },
        expect: [],
    })
    scenario({
        name: `cost11-oppburst-${card}`,
        start: { me: { reserve: 8, hand: [card] }, opp: { burst: BURSTM } },
        steps(t) {
            t.actRejected("me", { type: "summon", handIndex: 0 })
        },
        expect: [],
    })
    scenario({
        name: `cost11-paid-${card}`,
        start: { me: { reserve: 12, hand: [card] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: ["自分.リザーブ: 12 → 0", "自分.トラッシュのコア: 0 → 11", `自分.手札: ${name} → なし`, ...appeared("自分", card, 1, 1, bp)],
    })
}
// バァラル：バーストをセットしていない間は11、セットしていれば元の7
scenario({
    name: "baaral-cost11-noburst",
    start: { me: { reserve: 10, hand: [BAARAL] } },
    steps(t) {
        t.actRejected("me", { type: "summon", handIndex: 0 })
    },
    expect: [],
})
scenario({
    name: "baaral-cost7-burst",
    start: { me: { reserve: 10, hand: [BAARAL], burst: BURSTM } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: ["自分.リザーブ: 10 → 2", "自分.トラッシュのコア: 0 → 7", "自分.手札: 虚皇帝ネザード・バァラル → なし", ...appeared("自分", BAARAL, 1, 1, 4000)],
})
scenario({
    name: "baaral-cost11-paid",
    start: { me: { reserve: 12, hand: [BAARAL] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: ["自分.リザーブ: 12 → 0", "自分.トラッシュのコア: 0 → 11", "自分.手札: 虚皇帝ネザード・バァラル → なし", ...appeared("自分", BAARAL, 1, 1, 4000)],
})

// ---------------------------------------------------------------------------------------------
console.log("=== 2. カタストロフ：【激突】を持つ他の自分のスピリットがアタックしたとき回復 ===")
for (const cores of [4, 8]) {
    scenario({
        name: `cata-recover-lv${cores === 4 ? 2 : 3}`,
        start: { phase: "attack", me: { spirits: [rested(CATA, cores), spirit(HORN)] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("猛角獣ホーングリズリー") })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.虚龍帝カタストロフドラゴン.疲労: true → false", "自分.猛角獣ホーングリズリー.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
}
scenario({
    name: "cata-no-clash",
    start: { phase: "attack", me: { spirits: [rested(CATA, 4), spirit(VANILLA)] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ロクケラトプス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "cata-lv1",
    start: { phase: "attack", me: { spirits: [rested(CATA, 1), spirit(HORN)] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("猛角獣ホーングリズリー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.猛角獣ホーングリズリー.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "cata-opp-clash",
    start: { turn: "opp", phase: "attack", me: { spirits: [rested(CATA, 4)] }, opp: { spirits: [spirit(HORN)] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("猛角獣ホーングリズリー") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.猛角獣ホーングリズリー.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})

// ---------------------------------------------------------------------------------------------
console.log("=== 3. ショカツリョー：【暴風】持ちがアタックしたとき、コアを払って疲労 ===")
scenario({
    name: "shoka-storm1",
    start: { phase: "attack", me: { spirits: [spirit(SHOKA, 3), spirit(PANDAL)] }, opp: { spirits: [spirit(DOLF)] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("パンダル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.リザーブ: 10 → 9", "自分.トラッシュのコア: 0 → 1", "自分.パンダル.疲労: false → true", "相手.ドルフィーノ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "shoka-storm2",
    start: { phase: "attack", me: { spirits: [spirit(SHOKA, 3), spirit(YATSUNO)] }, opp: { spirits: [spirit(DOLF), spirit(BULL)] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ヤツノカンゾウ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 2", "自分.ヤツノカンゾウ.疲労: false → true", "相手.ドルフィーノ.疲労: false → true", "相手.戦闘獣ブルトップ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "shoka-no-storm",
    start: { phase: "attack", me: { spirits: [spirit(SHOKA, 3), spirit(VANILLA)] }, opp: { spirits: [spirit(DOLF)] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ロクケラトプス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "shoka-lv1",
    start: { phase: "attack", me: { spirits: [spirit(SHOKA, 1), spirit(PANDAL)] }, opp: { spirits: [spirit(DOLF)] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("パンダル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.パンダル.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "shoka-cannot-pay",
    start: { phase: "attack", me: { reserve: 0, spirits: [spirit(SHOKA, 3), spirit(PANDAL)] }, opp: { spirits: [spirit(DOLF)] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("パンダル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.パンダル.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "shoka-opp-storm",
    start: { turn: "opp", phase: "attack", me: { spirits: [spirit(SHOKA, 3)] }, opp: { spirits: [spirit(PANDAL)] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("パンダル") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.パンダル.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})

// ---------------------------------------------------------------------------------------------
console.log("=== 4. ホウオウガ：自身か【暴風】持ちのアタックでライフを減らしたとき、ライフのコア1個をボイドへ ===")
scenario({
    name: "houou-self",
    start: { phase: "attack", me: { spirits: [spirit(HOUOU)] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("虚天帝ホウオウガ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.虚天帝ホウオウガ.疲労: false → true", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "houou-storm-ally",
    start: { phase: "attack", me: { spirits: [spirit(HOUOU), spirit(PANDAL)] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("パンダル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.パンダル.疲労: false → true", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "houou-plain-ally",
    start: { phase: "attack", me: { spirits: [spirit(HOUOU), spirit(VANILLA)] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ロクケラトプス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "houou-opp-storm",
    start: { turn: "opp", phase: "attack", me: { spirits: [rested(HOUOU)] }, opp: { spirits: [spirit(PANDAL)] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("パンダル") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.パンダル.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "houou-blocked",
    start: { phase: "attack", me: { spirits: [spirit(HOUOU)] }, opp: { spirits: [spirit(DOLF)] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("虚天帝ホウオウガ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ドルフィーノ") })
        t.closeFlash()
    },
    expect: ["自分.虚天帝ホウオウガ.疲労: false → true", "相手.ドルフィーノ.場所: フィールド → なし", "相手.トラッシュ: なし → ドルフィーノ", "相手.リザーブ: 10 → 11"],
})
// 【暴風】持ちの自分のスピリットが相手によって破壊されたとき（Lv2・3）
function bounceCase(name: string, hCores: number, blocker: string, blockerName: string, bounce: boolean): void {
    scenario({
        name,
        start: { turn: "opp", phase: "attack", me: { spirits: [rested(HOUOU, hCores), spirit(blocker)] }, opp: { spirits: [spirit(TIGER)] } },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("虎拳士タイガ") })
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id(blockerName) })
            t.closeFlash()
        },
        expect: [
            `自分.${blockerName}.場所: フィールド → なし`,
            `自分.トラッシュ: なし → ${blockerName}`,
            "自分.リザーブ: 10 → 11",
            ...(bounce ? ["相手.虎拳士タイガ.場所: フィールド → なし", "相手.手札: なし → 虎拳士タイガ", "相手.リザーブ: 10 → 11"] : ["相手.虎拳士タイガ.疲労: false → true"]),
        ],
    })
}
bounceCase("houou-bounce-lv2", 4, PANDAL, "パンダル", true)
bounceCase("houou-bounce-lv3", 7, PANDAL, "パンダル", true)
bounceCase("houou-bounce-plain", 4, VANILLA, "ロクケラトプス", false)
bounceCase("houou-bounce-lv1", 1, PANDAL, "パンダル", false)
// バウンスされた場合も、攻撃側は疲労済み（攻撃の宣言で疲労する）。場を離れるので行は「場所」だけ

// ---------------------------------------------------------------------------------------------
console.log("=== 5. 幼竜の揺り籠：相手によって自分のスピリットが破壊されたとき、相手のネクサス1つを破壊 ===")
function yuriCase(name: string, yCores: number, destroyed: boolean, oppNexus: boolean): void {
    scenario({
        name,
        start: {
            turn: "opp", phase: "attack",
            me: { spirits: [spirit(VANILLA)], nexuses: [spirit(YURI, yCores)] },
            opp: { spirits: [spirit(TIGER)], nexuses: oppNexus ? [spirit(HAIJI, 0)] : [] },
        },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("虎拳士タイガ") })
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id("ロクケラトプス") })
            t.closeFlash()
        },
        expect: [
            "自分.ロクケラトプス.場所: フィールド → なし",
            "自分.トラッシュ: なし → ロクケラトプス",
            "自分.リザーブ: 10 → 11",
            "相手.虎拳士タイガ.疲労: false → true",
            ...(destroyed ? ["相手.廃寺の無限階段.場所: ネクサス → なし", "相手.トラッシュ: なし → 廃寺の無限階段"] : []),
        ],
    })
}
yuriCase("yuri-lv2", 1, true, true)
yuriCase("yuri-lv1", 0, false, true)
scenario({
    name: "yuri-opp-spirit-destroyed",
    start: {
        phase: "attack",
        me: { spirits: [spirit(HERA)], nexuses: [spirit(YURI, 1)] },
        opp: { spirits: [spirit(DOLF)], nexuses: [spirit(HAIJI, 0)] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ヘラクレス・ジオ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ドルフィーノ") })
        t.closeFlash()
    },
    expect: ["自分.ヘラクレス・ジオ.疲労: false → true", "相手.ドルフィーノ.場所: フィールド → なし", "相手.トラッシュ: なし → ドルフィーノ", "相手.リザーブ: 10 → 11"],
})

// ---------------------------------------------------------------------------------------------
console.log("=== 6. バァラル：【不死】を持つ自分のスピリットがアタックしたとき、相手のフィールドのコア2個をトラッシュへ ===")
// 相手のLvコスト+1（バァラル自身の別節）で消滅しないよう、相手のスピリットはコア5個
function baaralAttack(name: string, bCores: number, attacker: string, attackerName: string, removed: boolean): void {
    scenario({
        name,
        start: { phase: "attack", me: { spirits: [spirit(BAARAL, bCores), spirit(attacker)] }, opp: { spirits: [{ card: DOLF, cores: 5, rested: true }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id(attackerName) })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            `自分.${attackerName}.疲労: false → true`,
            "相手.ライフ: 5 → 4",
            "相手.リザーブ: 10 → 11",
            ...(removed ? ["相手.ドルフィーノ.コア: 5 → 3", "相手.トラッシュのコア: 0 → 2"] : []),
        ],
    })
}
baaralAttack("baaral-fushi-lv2", 3, WERE, "ワーウルフ・コマンド", true)
baaralAttack("baaral-fushi-lv3", 9, GAWAIN, "闇騎士ガウェイン", true)
baaralAttack("baaral-plain", 3, VANILLA, "ロクケラトプス", false)
baaralAttack("baaral-lv1", 1, WERE, "ワーウルフ・コマンド", false)
scenario({
    name: "baaral-opp-fushi",
    start: { turn: "opp", phase: "attack", me: { spirits: [spirit(BAARAL, 3), { card: DOLF, cores: 5, rested: true }] }, opp: { spirits: [spirit(WERE, 2)] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ワーウルフ・コマンド") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.ワーウルフ・コマンド.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})

// ---------------------------------------------------------------------------------------------
console.log("=== 7. ソウソー：相手のスピリットが疲労したとき回復（Lv2・自分のアタックステップ） ===")
function sousoCase(name: string, cores: number, block: boolean): void {
    const recovers = cores === 3 && block
    scenario({
        name,
        start: { phase: "attack", me: { spirits: [rested(SOUSO, cores), spirit(HERA)] }, opp: { spirits: [spirit(DOLF)] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("ヘラクレス・ジオ") })
            t.closeFlash()
            if (block) {
                t.act("opp", { type: "block", instanceId: t.id("ドルフィーノ") })
                t.closeFlash()
            } else t.act("opp", { type: "takeLife" })
        },
        expect: [
            "自分.ヘラクレス・ジオ.疲労: false → true",
            ...(recovers ? ["自分.鳥武帝スザクロス・ソウソー.疲労: true → false"] : []),
            ...(block
                ? ["相手.ドルフィーノ.場所: フィールド → なし", "相手.トラッシュ: なし → ドルフィーノ", "相手.リザーブ: 10 → 11"]
                : ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]),
        ],
    })
}
sousoCase("souso-recover", 3, true)
sousoCase("souso-no-exhaust", 3, false)
sousoCase("souso-lv1", 1, true)

// ---------------------------------------------------------------------------------------------
console.log("=== 8. アナグマッド・デビル：アタック時にボイドからコア ===")
function anaguCase(name: string, others: InstanceSpec[], burst: boolean, gain: number): void {
    const cores = 1 + gain
    scenario({
        name,
        start: { phase: "attack", me: { spirits: [spirit(ANAGU), ...others], ...(burst ? { burst: BURSTM } : {}) } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("アナグマッド・デビル") })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            "自分.アナグマッド・デビル.疲労: false → true",
            ...(gain > 0 ? [`自分.アナグマッド・デビル.コア: 1 → ${cores}`] : []),
            ...(cores >= 3 ? ["自分.アナグマッド・デビル.Lv: 1 → 2", "自分.アナグマッド・デビル.BP: 2000 → 4000"] : []),
            ...(burst && gain === 2 ? ["自分.バースト: 武迅衝 → なし", "自分.トラッシュ: なし → 武迅衝"] : []),
            "相手.ライフ: 5 → 4",
            "相手.リザーブ: 10 → 11",
        ],
    })
}
anaguCase("anagu-green-only", [], false, 1)
anaguCase("anagu-green-only-burst", [], true, 2)
anaguCase("anagu-other-color", [spirit(VANILLA)], false, 0)

// ---------------------------------------------------------------------------------------------
// 「バースト1つを破棄することで」は任意。断ればバーストは残り、追加のコアは置かれない
scenario({
    name: "anagu-burst-decline",
    start: { phase: "attack", interactive: true, me: { spirits: [spirit(ANAGU)], burst: BURSTM } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("アナグマッド・デビル") })
        assert(t.state.pendingChoice !== null && t.state.pendingChoice.pid === t.me, "アナグマッド：バースト破棄の確認が自分に出る")
        t.act("me", { type: "resolveChoice" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.アナグマッド・デビル.疲労: false → true", "自分.アナグマッド・デビル.コア: 1 → 2", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "anagu-burst-accept-interactive",
    start: { phase: "attack", interactive: true, me: { spirits: [spirit(ANAGU)], burst: BURSTM } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("アナグマッド・デビル") })
        assert(t.state.pendingChoice !== null && t.state.pendingChoice.pid === t.me, "アナグマッド：バースト破棄の確認が自分に出る")
        t.act("me", { type: "resolveChoice", option: "発動する" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.アナグマッド・デビル.疲労: false → true", "自分.アナグマッド・デビル.コア: 1 → 3", "自分.アナグマッド・デビル.Lv: 1 → 2", "自分.アナグマッド・デビル.BP: 2000 → 4000",
        "自分.バースト: 武迅衝 → なし", "自分.トラッシュ: なし → 武迅衝", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 9. 廃寺の無限階段：緑しか無い間、相手のスピリットだけを破壊したら回復 ===")
function haijiAttack(name: string, hCores: number, others: InstanceSpec[], recovers: boolean): void {
    scenario({
        name,
        start: { phase: "attack", me: { spirits: [spirit(HERA), ...others], nexuses: [spirit(HAIJI, hCores)] }, opp: { spirits: [spirit(DOLF)] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("ヘラクレス・ジオ") })
            t.closeFlash()
            t.act("opp", { type: "block", instanceId: t.id("ドルフィーノ") })
            t.closeFlash()
        },
        expect: [
            ...(recovers ? [] : ["自分.ヘラクレス・ジオ.疲労: false → true"]),
            "相手.ドルフィーノ.場所: フィールド → なし",
            "相手.トラッシュ: なし → ドルフィーノ",
            "相手.リザーブ: 10 → 11",
        ],
    })
}
haijiAttack("haiji-lv2", 1, [], true)
haijiAttack("haiji-lv1", 0, [], true)
haijiAttack("haiji-other-color", 1, [spirit(VANILLA)], false)
scenario({
    name: "haiji-opp-turn-block",
    start: { turn: "opp", phase: "attack", me: { spirits: [spirit(HERA)], nexuses: [spirit(HAIJI, 1)] }, opp: { spirits: [spirit(DOLF)] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ドルフィーノ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ヘラクレス・ジオ") })
        t.closeFlash()
    },
    expect: ["相手.ドルフィーノ.場所: フィールド → なし", "相手.トラッシュ: なし → ドルフィーノ", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "haiji-other-color-opp-turn-block",
    start: { turn: "opp", phase: "attack", me: { spirits: [spirit(HERA), spirit(VANILLA)], nexuses: [spirit(HAIJI, 1)] }, opp: { spirits: [spirit(DOLF)] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ドルフィーノ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ヘラクレス・ジオ") })
        t.closeFlash()
    },
    expect: ["自分.ヘラクレス・ジオ.疲労: false → true", "相手.ドルフィーノ.場所: フィールド → なし", "相手.トラッシュ: なし → ドルフィーノ", "相手.リザーブ: 10 → 11"],
})

// ---------------------------------------------------------------------------------------------
console.log("=== 10. 渦巻く大海峡Lv2：バーストをセットしている間『このスピリットの破壊時』は発揮されない ===")
function uzuCase(name: string, uCores: number, burst: boolean, draws: boolean): void {
    scenario({
        name,
        start: {
            turn: "opp", phase: "attack",
            me: { spirits: [spirit(WERE)], nexuses: [spirit(UZU, uCores)], ...(burst ? { burst: BURSTM } : {}) },
            opp: { spirits: [spirit(TIGER)] },
        },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("虎拳士タイガ") })
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id("ワーウルフ・コマンド") })
            t.closeFlash()
        },
        expect: [
            "自分.ワーウルフ・コマンド.場所: フィールド → なし",
            "自分.トラッシュ: なし → ワーウルフ・コマンド",
            "自分.リザーブ: 10 → 11",
            "相手.虎拳士タイガ.疲労: false → true",
            ...(draws ? ["自分.手札: なし → ロクケラトプス", "自分.デッキ枚数: 40 → 39"] : []),
        ],
    })
}
uzuCase("uzu-lv2-burst", 2, true, false)
uzuCase("uzu-lv2-noburst", 2, false, true)
uzuCase("uzu-lv1-burst", 0, true, true)
scenario({
    name: "uzu-opp-spirit",
    start: {
        phase: "attack",
        me: { spirits: [spirit(HERA)], nexuses: [spirit(UZU, 2)], burst: BURSTM },
        opp: { spirits: [spirit(WERE)] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ヘラクレス・ジオ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ワーウルフ・コマンド") })
        t.closeFlash()
    },
    expect: ["自分.ヘラクレス・ジオ.疲労: false → true", "相手.ワーウルフ・コマンド.場所: フィールド → なし", "相手.トラッシュ: なし → ワーウルフ・コマンド", "相手.リザーブ: 10 → 11"],
})

// ---------------------------------------------------------------------------------------------
console.log("=== 11. エサルフリーダ：Lv2以上の間、相手のネクサスすべてのLvコスト+1 ===")
scenario({
    name: "esar-lv2-up",
    start: { me: { spirits: [spirit(ESAR, 1)], nexuses: [spirit(HAIJI, 1)] }, opp: { nexuses: [spirit(HAIJI, 1)] } },
    steps(t) {
        t.act("me", { type: "moveCore", instanceId: t.id("吸血令嬢エサルフリーダ"), direction: "add" })
    },
    expect: ["自分.リザーブ: 10 → 9", "自分.吸血令嬢エサルフリーダ.コア: 1 → 2", "自分.吸血令嬢エサルフリーダ.Lv: 1 → 2", "自分.吸血令嬢エサルフリーダ.BP: 3000 → 5000", "相手.廃寺の無限階段.Lv: 2 → 1"],
})
scenario({
    name: "esar-lv1-down",
    start: { me: { spirits: [spirit(ESAR, 2)], nexuses: [spirit(HAIJI, 1)] }, opp: { nexuses: [spirit(HAIJI, 1)] } },
    steps(t) {
        t.act("me", { type: "moveCore", instanceId: t.id("吸血令嬢エサルフリーダ"), direction: "remove" })
    },
    expect: ["自分.リザーブ: 10 → 11", "自分.吸血令嬢エサルフリーダ.コア: 2 → 1", "自分.吸血令嬢エサルフリーダ.Lv: 2 → 1", "自分.吸血令嬢エサルフリーダ.BP: 5000 → 3000", "相手.廃寺の無限階段.Lv: 1 → 2"],
})

// ---------------------------------------------------------------------------------------------
console.log("=== 12. サイゴード・ゴレム：大粉砕（Lv1につき5枚破棄、バースト効果を持つカードが破棄されたら相手のスピリット1体を破壊） ===")
// デッキの上がどちら端か分からないので、バースト効果のカードは両端から同じ位置に置く（片方だけが破棄範囲に入る）
function deckWith(positions: number[]): string[] {
    const d = Array.from({ length: 40 }, () => VANILLA)
    for (const p of positions) d[p] = BURSTM
    return d
}
function saigoCase(name: string, cores: number, burstAt: number[], milled: number, destroyed: boolean): void {
    const milledNames = Array.from({ length: milled }, (_, i) => (i === 0 && burstAt.length > 0 && destroyed ? BURSTM : VANILLA))
    scenario({
        name,
        start: { phase: "attack", me: { spirits: [spirit(SAIGO, cores)] }, opp: { deck: deckWith(burstAt), spirits: [rested(DOLF)] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("鉄の覇王サイゴード・ゴレム") })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            "自分.鉄の覇王サイゴード・ゴレム.疲労: false → true",
            `相手.デッキ枚数: 40 → ${40 - milled}`,
            `相手.トラッシュ: なし → ${sortedNames([...milledNames, ...(destroyed ? [DOLF] : [])])}`,
            ...(destroyed ? ["相手.ドルフィーノ.場所: フィールド → なし"] : []),
            "相手.ライフ: 5 → 4",
            `相手.リザーブ: 10 → ${destroyed ? 12 : 11}`,
        ],
    })
}
saigoCase("saigo-lv1-burst-in-range", 1, [2, 37], 5, true)
saigoCase("saigo-lv1-burst-out-of-range", 1, [20], 5, false)
saigoCase("saigo-lv1-none", 1, [], 5, false)
saigoCase("saigo-lv2-burst-in-range", 4, [8, 31], 10, true)
saigoCase("saigo-lv2-burst-out-of-range", 4, [12, 27], 10, false)

// ---------------------------------------------------------------------------------------------
console.log("=== 13. 自分のバーストをセットしている間、お互いのライフはターンごとにスピリット1体から1までしか減らされない ===")
for (const card of [GRASS, BONGO, IBOS, AOI, ARATORON, EME]) {
    const oppAttacks = (burst: "me" | "opp" | "none", life: number) => {
        scenario({
            name: `lifecap-${card}-${burst}`,
            start: {
                turn: "opp", phase: "attack",
                me: { spirits: [rested(card)], ...(burst === "me" ? { burst: BURSTM } : {}) },
                opp: { spirits: [spirit(ILLU)], ...(burst === "opp" ? { burst: BURSTM } : {}) },
            },
            steps(t) {
                t.act("opp", { type: "attack", instanceId: t.id("イルルヤンカッシュ") })
                t.closeFlash()
                t.act("me", { type: "takeLife" })
            },
            expect: ["相手.イルルヤンカッシュ.疲労: false → true", `自分.ライフ: 5 → ${life}`, `自分.リザーブ: 10 → ${10 + 5 - life}`],
        })
    }
    oppAttacks("me", 4)
    oppAttacks("none", 3)
    oppAttacks("opp", 3)
    scenario({
        name: `lifecap-${card}-mine-attacks`,
        start: { phase: "attack", me: { spirits: [spirit(card), spirit(ILLU)], burst: BURSTM } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("イルルヤンカッシュ") })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.イルルヤンカッシュ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
}

// ---------------------------------------------------------------------------------------------
console.log("=== 14. 【重装甲】：指定色の相手の効果を受けない ===")
// グラスベア（赤/黄）。シュリケラプトル『アタック時』は同じBPの相手のスピリット1体を破壊する（Lv3=5000、Lv2=3000）
scenario({
    name: "grass-armor-red",
    start: { turn: "opp", phase: "attack", me: { spirits: [rested(GRASS, 3)] }, opp: { spirits: [spirit(SHURI, 4)] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("シュリケラプトル") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.シュリケラプトル.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "grass-lv1-no-armor",
    start: { turn: "opp", phase: "attack", me: { spirits: [rested(GRASS, 1)] }, opp: { spirits: [spirit(SHURI, 2)] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("シュリケラプトル") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.シュリケラプトル.疲労: false → true", "自分.虚獣グラスベア.場所: フィールド → なし", "自分.トラッシュ: なし → 虚獣グラスベア", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 12"],
})
// メガ・テュール（赤/紫/青）。マミーラ（紫）は相手のスピリット1体のコア1個をリザーブへ、エメラルドシーザー（緑）は疲労させる
scenario({
    name: "mega-armor-purple",
    start: { turn: "opp", phase: "main", me: { spirits: [spirit(MEGA, 3)] }, opp: { hand: [MAMI] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: ["相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4", "相手.手札: マミーラ → なし", ...appeared("相手", MAMI, 1, 1, 1000)],
})
scenario({
    name: "mega-lv1-no-armor",
    start: { turn: "opp", phase: "main", me: { spirits: [spirit(MEGA, 2)] }, opp: { hand: [MAMI] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: ["相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4", "相手.手札: マミーラ → なし", ...appeared("相手", MAMI, 1, 1, 1000), "自分.軍神機メガ・テュール.コア: 2 → 1", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "mega-green-effect-applies",
    start: { turn: "opp", phase: "main", me: { spirits: [spirit(MEGA, 3)] }, opp: { hand: [EMER] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: ["相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4", "相手.手札: エメラルドシーザー → なし", ...appeared("相手", EMER, 1, 1, 3000), "自分.軍神機メガ・テュール.疲労: false → true"],
})
scenario({
    name: "grass-green-effect-applies",
    start: { turn: "opp", phase: "main", me: { spirits: [spirit(GRASS, 3)] }, opp: { hand: [EMER] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: ["相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4", "相手.手札: エメラルドシーザー → なし", ...appeared("相手", EMER, 1, 1, 3000), "自分.虚獣グラスベア.疲労: false → true"],
})

// ---------------------------------------------------------------------------------------------
console.log("=== 15. ツンドッグ・ゴレム：このターン、【粉砕】持ちが BP 比べで破壊されたら疲労状態で場に残る ===")
// 召喚コストは3。フィールドの青シンボル（ラザラス）1つぶん軽減されて2
function tsunCase(name: string, summon: boolean, attacker: string, attackerName: string): void {
    const stays = summon && attacker === RAZ
    const cost = attacker === RAZ ? 2 : 3
    scenario({
        name,
        start: { me: { hand: summon ? [TSUN] : [], spirits: [spirit(attacker)] }, opp: { spirits: [spirit(TIGER)] } },
        steps(t) {
            if (summon) t.act("me", { type: "summon", handIndex: 0 })
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(attackerName) })
            t.closeFlash()
            t.act("opp", { type: "block", instanceId: t.id("虎拳士タイガ") })
            t.closeFlash()
        },
        expect: [
            ...(summon && stays ? [`自分.リザーブ: 10 → ${10 - cost - 1}`] : []),
            ...(summon ? [`自分.トラッシュのコア: 0 → ${cost}`, "自分.手札: ツンドッグ・ゴレム → なし", ...appeared("自分", TSUN, 1, 1, 3000)] : []),
            ...(stays
                ? [`自分.${attackerName}.疲労: false → true`]
                : [`自分.${attackerName}.場所: フィールド → なし`, `自分.トラッシュ: なし → ${attackerName}`, `自分.リザーブ: 10 → ${summon ? 10 - cost : 11}`]),
            ...(attacker === RAZ ? ["相手.デッキ枚数: 40 → 39", "相手.トラッシュ: なし → ロクケラトプス"] : []),
            "相手.虎拳士タイガ.疲労: false → true",
        ],
    })
}
tsunCase("tsun-funsai-stays", true, RAZ, "爪剣のラザラス")
tsunCase("tsun-not-summoned", false, RAZ, "爪剣のラザラス")
tsunCase("tsun-non-funsai", true, VANILLA, "ロクケラトプス")

console.log("=== 16. 【不死：夜族】：夜族の自分のスピリットが破壊されたとき、トラッシュから召喚できる ===")
// 夜族の破壊元はワイバット（赤）。紫のスピリットだと、破壊されたスピリット自身の紫シンボルが召喚コストの軽減に数えられるか否かが混ざるため避けた
const WYV = "BS09-004" // 吸血竜ワイバット（赤・夜族・Lv1はバニラ）
assert(getCard(WYV).name === "吸血竜ワイバット", "WYVは吸血竜ワイバット")
function fushiCase(card: string, cost: number, lv: number, bp: number, mode: "accept" | "decline" | "plain" | "oppNight"): void {
    const name = nameOf(card)
    const wyv = nameOf(WYV)
    const base = { phase: "attack" as const, interactive: true }
    if (mode === "oppNight") {
        scenario({
            name: `fushi-${card}-${mode}`,
            start: { ...base, me: { trash: [card], spirits: [spirit(HERA)] }, opp: { spirits: [spirit(WYV)] } },
            steps(t) {
                t.act("me", { type: "attack", instanceId: t.id("ヘラクレス・ジオ") })
                t.closeFlash()
                t.act("opp", { type: "block", instanceId: t.id(wyv) })
                t.closeFlash()
            },
            expect: ["自分.ヘラクレス・ジオ.疲労: false → true", `相手.${wyv}.場所: フィールド → なし`, `相手.トラッシュ: なし → ${wyv}`, "相手.リザーブ: 10 → 11"],
        })
        return
    }
    const blocker = mode === "plain" ? VANILLA : WYV
    const bName = nameOf(blocker)
    scenario({
        name: `fushi-${card}-${mode}`,
        start: { ...base, turn: "opp", me: { trash: [card], spirits: [spirit(blocker)] }, opp: { spirits: [spirit(TIGER)] } },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("虎拳士タイガ") })
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id(bName) })
            t.closeFlash()
            if (mode === "plain") assert(t.state.pendingChoice === null, `${name}：夜族でないスピリットの破壊では召喚の確認が出ない`)
            else {
                assert(t.state.pendingChoice !== null && t.state.pendingChoice.pid === t.me, `${name}：自分に召喚の確認が出る`)
                if (mode === "accept") {
                    t.act("me", { type: "resolveChoice", option: "召喚する" })
                    t.act("me", { type: "resolveChoice", option: "支払う" })
                } else t.act("me", { type: "resolveChoice" })
            }
        },
        expect: [
            // 【不死】で出たバァラルの「相手のスピリットすべての Lv コスト+1」で、コア1個のタイガは消滅する
            ...(mode === "accept" && card === BAARAL
                ? ["相手.虎拳士タイガ.場所: フィールド → なし", "相手.トラッシュ: なし → 虎拳士タイガ", "相手.リザーブ: 10 → 11"]
                : ["相手.虎拳士タイガ.疲労: false → true"]),
            `自分.${bName}.場所: フィールド → なし`,
            ...(mode === "accept"
                ? [
                      `自分.トラッシュ: ${name} → ${bName}`,
                      `自分.リザーブ: 10 → ${10 - cost}`,
                      `自分.トラッシュのコア: 0 → ${cost}`,
                      ...appeared("自分", card, 1, lv, bp),
                  ]
                : [
                      `自分.トラッシュ: ${name} → ${sortedNames([card, blocker])}`,
                      "自分.リザーブ: 10 → 11",
                  ]),
        ],
    })
}
for (const [card, cost, lv, bp] of [[WERE, 3, 1, 1000], [GAWAIN, 6, 3, 9000], [BAARAL, 7, 1, 4000]] as const) {
    for (const mode of ["accept", "decline", "plain", "oppNight"] as const) fushiCase(card, cost, lv, bp, mode)
}

console.log("すべてのチェックに合格しました 🎉（part603）")
