// smoke パート717（プロモ バッチD：P029 アーチ・アームズ／P043 リボル・アームズ／P077 大鳥人ビアディッド／P074 ロウ・コウチュー／P040 太陽巨兵ソーラー・ゴレム／P054 ダイオウ・ヒドラ。
// 期待値役が効果文だけから書いた場面テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const P029 = "P029"
const P043 = "P043"
const P077 = "P077"
const P074 = "P074"
const P040 = "P040"
const P054 = "P054"
const P038 = "P038" // 太陽飛竜フレアドラグーン（赤・コスト4・バニラ。名前に「太陽」）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・BP3000）
const ARNOLD = "BS03-089" // ディープ・アーノルド（青・コスト4・BP4000・異合）
const FENRIR = "BS10-071" // フェンリルキャノンType-B（白・ブレイヴ・コスト4・BP3000）
const KETTO = "BS02-077" // 決闘台地（赤・ネクサス・コスト4。効果は自分の覚醒持ちの回復だけで、この場面では何も起きない）
const TOPAZ = "BS02-085" // トパーズの流星（黄・ネクサス・コスト3。効果は手札のネクサスの軽減だけ）
const OFFENSIVE = "BS01-116" // オフェンシブオーラ（赤・マジック・コスト4・フラッシュ）
const POWERAURA = "BS01-135" // パワーオーラ（緑・マジック・コスト3・フラッシュ）
const REDWALL = "BS04-110" // レッドウォール（青・マジック・コスト2・フラッシュ）
const MULTICORE = "BS03-128" // マルチプルコア（緑・マジック・コスト5・フラッシュ）
const BURST = "SD06-016" // 絶甲氷盾（白・マジック・バースト：自分のライフ減少後にライフへコア1個）
const ZEUS = "BS10-029" // 木星神龍ノブナガード・ゼウシス（緑・コスト6・召喚時に手札のブレイヴを好きなだけ無償召喚できる）
const GYOKU = "BS17-057" // ギョクジーグ（緑・ブレイヴ・コスト2・軽減[緑][白]）
const BEETLE = "BS01-050" // ビートビートル（緑・コスト0・緑シンボル）
const WHITE = "BS01-074" // バーサーカー・ガン（白・コスト1・白シンボル）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    const chk = (id: string, name: string, type: string, color: string, cost: number) =>
        assert(c(id).name === name && c(id).type === type && c(id).colors.join() === color && c(id).cost === cost, `${id}は${color}の${type}「${name}」コスト${cost}`)
    chk(P029, "アーチ・アームズ", "brave", "blue", 4)
    chk(P043, "リボル・アームズ", "brave", "blue", 4)
    chk(P077, "大鳥人ビアディッド", "spirit", "blue", 5)
    chk(P074, "ロウ・コウチュー", "spirit", "green", 4)
    chk(P040, "太陽巨兵ソーラー・ゴレム", "spirit", "blue", 4)
    chk(P054, "ダイオウ・ヒドラ", "spirit", "blue", 6)
    chk(P038, "太陽飛竜フレアドラグーン", "spirit", "red", 4)
    chk(ROKU, "ロクケラトプス", "spirit", "red", 1)
    chk(METAL, "メタルバーン", "spirit", "red", 3)
    chk(ARNOLD, "ディープ・アーノルド", "spirit", "blue", 4)
    chk(FENRIR, "フェンリルキャノンType-B", "brave", "white", 4)
    chk(KETTO, "決闘台地", "nexus", "red", 4)
    chk(TOPAZ, "トパーズの流星", "nexus", "yellow", 3)
    chk(OFFENSIVE, "オフェンシブオーラ", "magic", "red", 4)
    chk(POWERAURA, "パワーオーラ", "magic", "green", 3)
    chk(REDWALL, "レッドウォール", "magic", "blue", 2)
    chk(MULTICORE, "マルチプルコア", "magic", "green", 5)
    chk(BURST, "絶甲氷盾", "magic", "white", 4)
    chk(ZEUS, "木星神龍ノブナガード・ゼウシス", "spirit", "green", 6)
    chk(GYOKU, "ギョクジーグ", "brave", "green", 2)
    chk(BEETLE, "ビートビートル", "spirit", "green", 0)
    chk(WHITE, "バーサーカー・ガン", "spirit", "white", 1)
    assert(c(GYOKU).reduction.join() === "green,white", "GYOKUの軽減は[緑][白]")
    for (const id of [OFFENSIVE, POWERAURA, REDWALL, MULTICORE]) assert(c(id).flash === true, `${id}はフラッシュで使える`)
    assert(c(ARNOLD).family.includes("異合") && c(P054).family.includes("異合") && c(P054).family.includes("海首"), "ARNOLDとP054は系統「異合」を持つ")
    assert(!c(ROKU).family.includes("異合") && !c(ROKU).family.includes("海首"), "ROKUは異合も海首も持たない")
    assert(c(P038).name.includes("太陽") && c(P040).name.includes("太陽") && !c(METAL).name.includes("太陽"), "名前に「太陽」を持つのはP038とP040")
    assert(c(P038).effects.length === 0, "P038は効果なし")
}

// 選択待ちを最後まで答える。prefer に挙げたラベルのインスタンス／option の部分文字列があれば優先する
function resolveAll(t: ScenarioCtx, prefer: string[] = []): void {
    for (let i = 0; i < 20 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "target") {
            const hit = prefer.map((l) => t.id(l)).find((id) => pc.candidates.includes(id))
            t.act(side, { type: "resolveChoice", instanceId: hit ?? pc.candidates[0]! })
        } else if (pc.kind === "option") {
            const opts = pc.options!
            const hit = opts.find((o) => prefer.some((p) => o.includes(p)))
            t.act(side, { type: "resolveChoice", option: hit ?? opts[0]! })
        } else t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices![0]! })
    }
}
const flash = (t: ScenarioCtx, handIndex: number) => t.act("opp", { type: "castMagic", handIndex, timing: "flash" })
const flashRejected = (t: ScenarioCtx, handIndex: number) => t.actRejected("opp", { type: "castMagic", handIndex, timing: "flash" })
const lifeHit = (t: ScenarioCtx) => {
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
    resolveAll(t)
}

// 相手が使ったマジックの支払いと手札・トラッシュの変化（効果自体は盤面に影響しない場面で使う）
const CAST = (name: string, handBefore: string, handAfter: string, reserve: number, trashCores: number) => [
    `相手.手札: ${handBefore} → ${handAfter}`,
    `相手.トラッシュ: なし → ${name}`,
    `相手.リザーブ: 10 → ${reserve}`,
    `相手.トラッシュのコア: 0 → ${trashCores}`,
]

// ================= P029 =================
console.log("=== 1. P029 ブレイヴの召喚時：相手のコスト3以下のスピリット1体を破壊（コスト4は対象外） ===")
scenario({
    name: "p029-summon",
    start: { me: { hand: [P029] }, opp: { spirits: [{ card: METAL }, { card: ARNOLD }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [
        "自分.手札: アーチ・アームズ → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.アーチ・アームズ.場所: なし → フィールド",
        "自分.アーチ・アームズ.疲労: なし → false",
        "自分.アーチ・アームズ.コア: なし → 1",
        "自分.アーチ・アームズ.Lv: なし → 1",
        "自分.アーチ・アームズ.BP: なし → 2000",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → メタルバーン",
    ],
})

console.log("=== 2. P029 ブレイヴの召喚時：コスト3以下がいなければ何も破壊しない ===")
scenario({
    name: "p029-summon-none",
    start: { me: { hand: [P029] }, opp: { spirits: [{ card: ARNOLD }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [
        "自分.手札: アーチ・アームズ → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.アーチ・アームズ.場所: なし → フィールド",
        "自分.アーチ・アームズ.疲労: なし → false",
        "自分.アーチ・アームズ.コア: なし → 1",
        "自分.アーチ・アームズ.Lv: なし → 1",
        "自分.アーチ・アームズ.BP: なし → 2000",
    ],
})

// 合体アタック：相手のフィールドに赤のロクケラトプス（シンボル赤）がいて、手札に赤のオフェンシブオーラ・緑のパワーオーラ・青のレッドウォール
const P029_HAND = [OFFENSIVE, POWERAURA, REDWALL]
function p029Attack(t: ScenarioCtx, withBrave: boolean): void {
    if (withBrave) t.act("me", { type: "combineBrave", braveInstanceId: t.id("自分.アーチ・アームズ"), hostInstanceId: t.id("自分.ディープ・アーノルド") })
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("自分.ディープ・アーノルド") })
    resolveAll(t)
}
const P029_COMBINE = [
    "自分.アーチ・アームズ.場所: フィールド → 合体",
    "自分.アーチ・アームズ.コア: 1 → 0",
    "自分.アーチ・アームズ.BP: 2000 → なし",
    "自分.ディープ・アーノルド.コア: 1 → 2",
    "自分.ディープ・アーノルド.BP: 4000 → 6000",
    "自分.ディープ・アーノルド.疲労: false → true",
]

console.log("=== 3. P029 合体アタック時：相手はフィールドのシンボルと同じ色（赤）のマジックだけ使える。緑・青は使えない ===")
scenario({
    name: "p029-restrict",
    start: { me: { spirits: [{ card: ARNOLD }, { card: P029 }] }, opp: { spirits: [{ card: ROKU, rested: true }], hand: P029_HAND } },
    steps: (t) => {
        p029Attack(t, true)
        flashRejected(t, 1) // 緑のパワーオーラ
        flashRejected(t, 2) // 青のレッドウォール
        flash(t, 0) // 赤のオフェンシブオーラ
        lifeHit(t)
    },
    expect: [
        ...P029_COMBINE,
        "相手.手札: オフェンシブオーラ、パワーオーラ、レッドウォール → パワーオーラ、レッドウォール",
        "相手.トラッシュ: なし → オフェンシブオーラ",
        "相手.トラッシュのコア: 0 → 3", // 赤シンボル1つで軽減
        "相手.リザーブ: 10 → 8", // コスト3を払い、ライフのコア1個が戻る
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== 4. P029 の対照：合体していなければ、緑のマジックも使える ===")
scenario({
    name: "p029-control",
    start: { me: { spirits: [{ card: ARNOLD }] }, opp: { spirits: [{ card: ROKU, rested: true }], hand: [POWERAURA] } },
    steps: (t) => {
        p029Attack(t, false)
        flash(t, 0)
        lifeHit(t)
    },
    expect: [
        "自分.ディープ・アーノルド.疲労: false → true",
        "相手.手札: パワーオーラ → ロクケラトプス", // パワーオーラのドロー
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュ: なし → パワーオーラ",
        "相手.トラッシュのコア: 0 → 3",
        "相手.リザーブ: 10 → 8", // 緑のシンボルが無いのでコスト3、ライフのコア1個が戻る
        "相手.ロクケラトプス.BP: 1000 → 2000", // パワーオーラのBP+1000
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== 5. P029 の制限：相手のフィールドにシンボルが1つも無いと、どの色のマジックも使えない ===")
scenario({
    name: "p029-no-symbol",
    start: { me: { spirits: [{ card: ARNOLD }, { card: P029 }] }, opp: { hand: [OFFENSIVE] } },
    steps: (t) => {
        p029Attack(t, true)
        flashRejected(t, 0)
        lifeHit(t)
    },
    expect: [...P029_COMBINE, "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"], // マジックは1枚も使えず、手札のまま
})

// ================= P043 =================
console.log("=== 6. P043 ブレイヴの召喚時：ボイドからコア2個が自分のネクサスに置かれる ===")
scenario({
    name: "p043-summon",
    start: { me: { hand: [P043], nexuses: [{ card: KETTO, cores: 0 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: リボル・アームズ → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.リボル・アームズ.場所: なし → フィールド",
        "自分.リボル・アームズ.疲労: なし → false",
        "自分.リボル・アームズ.コア: なし → 1",
        "自分.リボル・アームズ.Lv: なし → 1",
        "自分.リボル・アームズ.BP: なし → 3000",
        "自分.決闘台地.コア: 0 → 2",
    ],
})

console.log("=== 7. P043 ブレイヴの召喚時：ネクサスが無ければ何も置かれない（コアはリザーブから減るだけ） ===")
scenario({
    name: "p043-summon-no-nexus",
    start: { me: { hand: [P043] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: リボル・アームズ → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.リボル・アームズ.場所: なし → フィールド",
        "自分.リボル・アームズ.疲労: なし → false",
        "自分.リボル・アームズ.コア: なし → 1",
        "自分.リボル・アームズ.Lv: なし → 1",
        "自分.リボル・アームズ.BP: なし → 3000",
    ],
})

// 合体アタック：ホストはメタルバーン（赤・コスト3）。相手にスピリットはいない（軽減シンボルなし）。手札はパワーオーラ（緑・コスト3）とオフェンシブオーラ（赤・コスト4）
const P043_COMBINE = [
    "自分.リボル・アームズ.場所: フィールド → 合体",
    "自分.リボル・アームズ.コア: 1 → 0",
    "自分.リボル・アームズ.BP: 3000 → なし",
    "自分.メタルバーン.コア: 1 → 2",
    "自分.メタルバーン.BP: 3000 → 6000",
    "自分.メタルバーン.疲労: false → true",
]
function p043Attack(t: ScenarioCtx, cost: string): void {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("自分.リボル・アームズ"), hostInstanceId: t.id("自分.メタルバーン") })
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("自分.メタルバーン") })
    const pc = t.state.pendingChoice
    assert(pc !== null && pc.kind === "option" && pc.pid === t.me && (pc.options ?? []).some((o) => o.includes("3")) && (pc.options ?? []).some((o) => o.includes("4")), "コスト3/4の指定が出る")
    resolveAll(t, [cost])
}

console.log("=== 8. P043 合体アタック時：コスト3を指定すると、相手はコスト3のマジックを使えない（コスト4は使える） ===")
scenario({
    name: "p043-cost3",
    start: { me: { spirits: [{ card: METAL }, { card: P043 }] }, opp: { hand: [POWERAURA, OFFENSIVE] } },
    steps: (t) => {
        p043Attack(t, "3")
        flashRejected(t, 0) // パワーオーラ（コスト3）
        flash(t, 1) // オフェンシブオーラ（コスト4）
        lifeHit(t)
    },
    expect: [
        ...P043_COMBINE,
        "相手.手札: オフェンシブオーラ、パワーオーラ → パワーオーラ",
        "相手.トラッシュ: なし → オフェンシブオーラ",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 7", // コスト4を払い、ライフのコア1個が戻る
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== 9. P043 合体アタック時：コスト4を指定すると、コスト4は使えずコスト3は使える ===")
scenario({
    name: "p043-cost4",
    start: { me: { spirits: [{ card: METAL }, { card: P043 }] }, opp: { hand: [POWERAURA, OFFENSIVE] } },
    steps: (t) => {
        p043Attack(t, "4")
        flashRejected(t, 1) // オフェンシブオーラ（コスト4）
        flash(t, 0) // パワーオーラ（コスト3）
        lifeHit(t)
    },
    expect: [
        ...P043_COMBINE,
        "相手.手札: オフェンシブオーラ、パワーオーラ → オフェンシブオーラ、ロクケラトプス", // パワーオーラのドロー
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュ: なし → パワーオーラ",
        "相手.トラッシュのコア: 0 → 3",
        "相手.リザーブ: 10 → 8", // コスト3を払い、ライフのコア1個が戻る
        "相手.ライフ: 5 → 4",
    ],
})

// ================= P077 =================
console.log("=== 10. P077 Lv1【強襲：1】：アタック時に疲労していないネクサスを疲労させて回復する ===")
scenario({
    name: "p077-assault",
    start: { me: { spirits: [{ card: P077 }], nexuses: [{ card: TOPAZ, cores: 0 }] } },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("大鳥人ビアディッド") })
        resolveAll(t)
        lifeHit(t)
    },
    expect: ["自分.トパーズの流星.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== 11. P077 【強襲：1】：疲労していないネクサスが無ければ回復できない ===")
scenario({
    name: "p077-assault-none",
    start: { me: { spirits: [{ card: P077 }], nexuses: [{ card: TOPAZ, cores: 0, rested: true }] } },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("大鳥人ビアディッド") })
        resolveAll(t)
        lifeHit(t)
    },
    expect: ["自分.大鳥人ビアディッド.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// Lv2（コア4）。疲労状態のネクサス：決闘台地（コスト4）。疲労していないネクサス：トパーズの流星（コスト3）。相手の手札：レッドウォール(2)・パワーオーラ(3)・オフェンシブオーラ(4)・マルチプルコア(5)
const P077_HAND = [REDWALL, POWERAURA, OFFENSIVE, MULTICORE]
function p077Attack(t: ScenarioCtx): void {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("大鳥人ビアディッド") })
    resolveAll(t)
}

console.log("=== 12. P077 Lv2：疲労状態の自分のネクサスと同じコストのマジックを使えない。【強襲】で疲労させたネクサスのコストも、使うたびに見て禁止に加わる ===")
scenario({
    name: "p077-lv2-cost",
    start: {
        me: { spirits: [{ card: P077, cores: 4 }], nexuses: [{ card: KETTO, cores: 0, rested: true }, { card: TOPAZ, cores: 0 }] },
        opp: { hand: P077_HAND },
    },
    steps: (t) => {
        p077Attack(t)
        flashRejected(t, 1) // パワーオーラ（コスト3：【強襲】で疲労したトパーズと同じ）
        flashRejected(t, 2) // オフェンシブオーラ（コスト4：最初から疲労していた決闘台地と同じ）
        flash(t, 0) // レッドウォール（コスト2）
        lifeHit(t)
    },
    expect: [
        "自分.トパーズの流星.疲労: false → true",
        "相手.手札: オフェンシブオーラ、パワーオーラ、マルチプルコア、レッドウォール → オフェンシブオーラ、パワーオーラ、マルチプルコア",
        "相手.トラッシュ: なし → レッドウォール",
        "相手.トラッシュのコア: 0 → 2",
        "相手.リザーブ: 10 → 9", // コスト2を払い、ライフのコア1個が戻る
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== 13. P077 Lv2：疲労状態のネクサスが1つも無ければ、どのコストのマジックも使える ===")
scenario({
    name: "p077-lv2-no-rested",
    start: { me: { spirits: [{ card: P077, cores: 4 }] }, opp: { hand: [OFFENSIVE] } },
    steps: (t) => {
        p077Attack(t)
        flash(t, 0)
        lifeHit(t)
    },
    expect: [
        "自分.大鳥人ビアディッド.疲労: false → true",
        "相手.手札: オフェンシブオーラ → なし",
        "相手.トラッシュ: なし → オフェンシブオーラ",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 7",
        "相手.ライフ: 5 → 4",
    ],
})

// ================= P074 =================
console.log("=== 14. P074 Lv1 アタック時：ボイドからコア1個が自分のリザーブに置かれる ===")
scenario({
    name: "p074-core",
    start: { me: { spirits: [{ card: P074 }] } },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ロウ・コウチュー") })
        resolveAll(t)
        lifeHit(t)
    },
    expect: ["自分.リザーブ: 10 → 11", "自分.ロウ・コウチュー.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// 相手はバースト（絶甲氷盾：ライフ減少後にライフへコア1個）をセット済み。リザーブ0でコストを払う選択は出ない
const BURST_OPP = { reserve: 0, burst: BURST }
function p074Attack(t: ScenarioCtx): void {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("ロウ・コウチュー") })
    resolveAll(t, ["発動"])
}

console.log("=== 15. P074 Lv2 アタック時：リザーブのコア2個を払うと、相手はバーストを発動できない（バーストはセットされたまま） ===")
scenario({
    name: "p074-no-burst",
    start: { me: { reserve: 3, spirits: [{ card: P074, cores: 3 }] }, opp: BURST_OPP },
    steps: (t) => {
        p074Attack(t)
        lifeHit(t)
    },
    expect: [
        "自分.リザーブ: 3 → 2", // +1（ボイドから）−2（払う）
        "自分.トラッシュのコア: 0 → 2",
        "自分.ロウ・コウチュー.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 0 → 1",
    ],
})

console.log("=== 16. P074 Lv2：リザーブのコアが2個に満たなければ払えず何も起きない（相手はバーストを発動する） ===")
scenario({
    name: "p074-cannot-pay",
    start: { me: { reserve: 0, spirits: [{ card: P074, cores: 3 }] }, opp: BURST_OPP },
    steps: (t) => {
        p074Attack(t)
        lifeHit(t)
    },
    expect: [
        "自分.リザーブ: 0 → 1",
        "自分.ロウ・コウチュー.疲労: false → true",
        "相手.バースト: 絶甲氷盾 → なし",
        "相手.トラッシュ: なし → 絶甲氷盾",
        "相手.リザーブ: 0 → 1",
        // ライフ 5 → 4（減少）→ 5（バーストでコア1個がライフに置かれる）で差分なし
    ],
})

console.log("=== 17. P074 Lv1 には発動禁止が無い：リザーブが足りていてもバーストは発動する ===")
scenario({
    name: "p074-lv1-burst",
    start: { me: { reserve: 3, spirits: [{ card: P074 }] }, opp: BURST_OPP },
    steps: (t) => {
        p074Attack(t)
        lifeHit(t)
    },
    expect: [
        "自分.リザーブ: 3 → 4",
        "自分.ロウ・コウチュー.疲労: false → true",
        "相手.バースト: 絶甲氷盾 → なし",
        "相手.トラッシュ: なし → 絶甲氷盾",
        "相手.リザーブ: 0 → 1",
    ],
})

// ================= P040 =================
// 手札のブレイヴ（フェンリルキャノン）を、ゼウシスの召喚時効果で無償召喚しようとする場面
console.log("=== 18. P040：相手の場にいても「お互い」。効果による無償のブレイヴ召喚はできず、手札に残る ===")
scenario({
    name: "p040-block-free-opp",
    start: { me: { hand: [ZEUS, FENRIR] }, opp: { spirits: [{ card: P040 }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [
        "自分.手札: フェンリルキャノンType-B、木星神龍ノブナガード・ゼウシス → フェンリルキャノンType-B",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        "自分.木星神龍ノブナガード・ゼウシス.場所: なし → フィールド",
        "自分.木星神龍ノブナガード・ゼウシス.疲労: なし → false",
        "自分.木星神龍ノブナガード・ゼウシス.コア: なし → 1",
        "自分.木星神龍ノブナガード・ゼウシス.Lv: なし → 1",
        "自分.木星神龍ノブナガード・ゼウシス.BP: なし → 5000",
    ],
})

console.log("=== 18b. P040 の対照：P040 がいなければ、同じ手順でブレイヴが無償召喚される ===")
scenario({
    name: "p040-free-ok",
    start: { me: { hand: [ZEUS, FENRIR] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [
        "自分.手札: フェンリルキャノンType-B、木星神龍ノブナガード・ゼウシス → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 6",
        "自分.木星神龍ノブナガード・ゼウシス.場所: なし → フィールド",
        "自分.木星神龍ノブナガード・ゼウシス.疲労: なし → false",
        "自分.木星神龍ノブナガード・ゼウシス.コア: なし → 1",
        "自分.木星神龍ノブナガード・ゼウシス.Lv: なし → 1",
        "自分.木星神龍ノブナガード・ゼウシス.BP: なし → 5000",
        "自分.フェンリルキャノンType-B.場所: なし → フィールド",
        "自分.フェンリルキャノンType-B.疲労: なし → false",
        "自分.フェンリルキャノンType-B.コア: なし → 1",
        "自分.フェンリルキャノンType-B.Lv: なし → 1",
        "自分.フェンリルキャノンType-B.BP: なし → 3000",
    ],
})

console.log("=== 19. P040：自分の場にいても同じ（お互い） ===")
scenario({
    name: "p040-block-free-own",
    start: { me: { hand: [ZEUS, FENRIR], spirits: [{ card: P040 }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [
        "自分.手札: フェンリルキャノンType-B、木星神龍ノブナガード・ゼウシス → フェンリルキャノンType-B",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        "自分.木星神龍ノブナガード・ゼウシス.場所: なし → フィールド",
        "自分.木星神龍ノブナガード・ゼウシス.疲労: なし → false",
        "自分.木星神龍ノブナガード・ゼウシス.コア: なし → 1",
        "自分.木星神龍ノブナガード・ゼウシス.Lv: なし → 1",
        "自分.木星神龍ノブナガード・ゼウシス.BP: なし → 5000",
    ],
})

console.log("=== 20. P040 の対照：コストを払う手札からの通常召喚は止めない ===")
scenario({
    name: "p040-pay-ok",
    start: { me: { hand: [FENRIR] }, opp: { spirits: [{ card: P040 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: フェンリルキャノンType-B → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.フェンリルキャノンType-B.場所: なし → フィールド",
        "自分.フェンリルキャノンType-B.疲労: なし → false",
        "自分.フェンリルキャノンType-B.コア: なし → 1",
        "自分.フェンリルキャノンType-B.Lv: なし → 1",
        "自分.フェンリルキャノンType-B.BP: なし → 3000",
    ],
})

console.log("=== 21. P040（Q17764）：軽減でコスト0になったブレイヴは「0を払った」ので召喚できる ===")
scenario({
    name: "p040-reduced-zero",
    start: {
        me: { hand: [GYOKU], spirits: [{ card: BEETLE }, { card: WHITE }] },
        opp: { spirits: [{ card: P040 }] },
    },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: ギョクジーグ → なし",
        "自分.リザーブ: 10 → 9", // コスト0（軽減[緑][白]を緑と白のシンボルで満たす）、コア1個だけ置く
        "自分.ギョクジーグ.場所: なし → フィールド",
        "自分.ギョクジーグ.疲労: なし → false",
        "自分.ギョクジーグ.コア: なし → 1",
        "自分.ギョクジーグ.Lv: なし → 1",
        "自分.ギョクジーグ.BP: なし → 2000",
    ],
})

// 合体アタック。P040 は Lv2（コア4。合体するブレイヴのコアが1個載って5個になる）。相手のスピリットはコスト1・コスト3・コスト4
function p040Attack(t: ScenarioCtx, prefer: string[] = []): void {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("自分.フェンリルキャノンType-B"), hostInstanceId: t.id("自分.太陽巨兵ソーラー・ゴレム") })
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("自分.太陽巨兵ソーラー・ゴレム") })
    resolveAll(t, prefer)
}
const P040_COMBINE = (cores: number) => [
    "自分.フェンリルキャノンType-B.場所: フィールド → 合体",
    "自分.フェンリルキャノンType-B.コア: 1 → 0",
    "自分.フェンリルキャノンType-B.BP: 3000 → なし",
    `自分.太陽巨兵ソーラー・ゴレム.コア: ${cores} → ${cores + 1}`,
    "自分.太陽巨兵ソーラー・ゴレム.疲労: false → true",
]

console.log("=== 22. P040 Lv2 合体アタック時：名前に「太陽」を持つ自分のスピリット（自身を含む）2体につき、コスト3以下の相手のスピリットを2体破壊 ===")
scenario({
    name: "p040-two",
    start: {
        me: { spirits: [{ card: P040, cores: 4 }, { card: FENRIR }, { card: P038 }] },
        opp: { spirits: [{ card: ROKU }, { card: METAL }, { card: ARNOLD, rested: true }] },
    },
    steps: (t) => {
        p040Attack(t)
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        resolveAll(t)
    },
    expect: [
        ...P040_COMBINE(4),
        "自分.太陽巨兵ソーラー・ゴレム.BP: 7000 → 10000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン、ロクケラトプス",
        "相手.リザーブ: 10 → 14",
        "相手.ライフ: 5 → 3",
    ],
})

console.log("=== 23. P040：「太陽」を持つのが自分自身だけなら1体だけ破壊（自身も数える） ===")
scenario({
    name: "p040-one",
    start: {
        me: { spirits: [{ card: P040, cores: 4 }, { card: FENRIR }] },
        opp: { spirits: [{ card: ROKU }, { card: METAL }, { card: ARNOLD, rested: true }] },
    },
    steps: (t) => {
        t.state.interactiveTargets = true
        p040Attack(t, ["相手.メタルバーン"])
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        resolveAll(t)
    },
    expect: [
        ...P040_COMBINE(4),
        "自分.太陽巨兵ソーラー・ゴレム.BP: 7000 → 10000",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン",
        "相手.リザーブ: 10 → 13",
        "相手.ライフ: 5 → 3",
    ],
})

console.log("=== 24. P040 の合体アタック時効果はLv2のみ：Lv1（コア2）では何も破壊しない ===")
scenario({
    name: "p040-lv1",
    start: {
        me: { spirits: [{ card: P040, cores: 2 }, { card: FENRIR }, { card: P038 }] },
        opp: { spirits: [{ card: ROKU }, { card: METAL }] },
    },
    steps: (t) => {
        p040Attack(t)
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        resolveAll(t)
    },
    expect: [
        ...P040_COMBINE(2),
        "自分.太陽巨兵ソーラー・ゴレム.BP: 3000 → 6000",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 3",
    ],
})

// ================= P054 =================
console.log("=== 25. P054 召喚時：系統「異合」/「海首」を持つ自分のスピリット1体につき（自身を含めて2体）、コスト3以下の相手のスピリットを2体破壊 ===")
scenario({
    name: "p054-two",
    start: { me: { hand: [P054], spirits: [{ card: ARNOLD }] }, opp: { spirits: [{ card: ROKU }, { card: METAL }, { card: ARNOLD, rested: true }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [
        "自分.手札: ダイオウ・ヒドラ → なし",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.ダイオウ・ヒドラ.場所: なし → フィールド",
        "自分.ダイオウ・ヒドラ.疲労: なし → false",
        "自分.ダイオウ・ヒドラ.コア: なし → 1",
        "自分.ダイオウ・ヒドラ.Lv: なし → 1",
        "自分.ダイオウ・ヒドラ.BP: なし → 4000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン、ロクケラトプス",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== 26. P054 召喚時：系統を持たない自分のスピリットは数えない。自身だけなら1体 ===")
scenario({
    name: "p054-one",
    start: { me: { hand: [P054], spirits: [{ card: ROKU }] }, opp: { spirits: [{ card: ROKU }, { card: METAL }, { card: ARNOLD, rested: true }] } },
    steps: (t) => {
        t.state.interactiveTargets = true
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t, ["相手.メタルバーン"])
    },
    expect: [
        "自分.手札: ダイオウ・ヒドラ → なし",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        "自分.ダイオウ・ヒドラ.場所: なし → フィールド",
        "自分.ダイオウ・ヒドラ.疲労: なし → false",
        "自分.ダイオウ・ヒドラ.コア: なし → 1",
        "自分.ダイオウ・ヒドラ.Lv: なし → 1",
        "自分.ダイオウ・ヒドラ.BP: なし → 4000",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン",
        "相手.リザーブ: 10 → 11",
    ],
})

// 相手のターン。相手が自分のメインステップでブレイヴを合体させる（ディープ・アーノルド BP4000＋フェンリル BP3000。ホストはコスト4以上が要る）
function oppCombine(t: ScenarioCtx): void {
    t.act("opp", { type: "combineBrave", braveInstanceId: t.id("相手.フェンリルキャノンType-B"), hostInstanceId: t.id("相手.ディープ・アーノルド") })
}
const OPP_COMBINE = ["相手.フェンリルキャノンType-B.場所: フィールド → 合体", "相手.フェンリルキャノンType-B.コア: 1 → 0", "相手.フェンリルキャノンType-B.BP: 3000 → なし", "相手.ディープ・アーノルド.コア: 1 → 2"]

console.log("=== 27. P054 継続効果：自分のバーストをセットしている間、相手の合体スピリットの「合体時BP+」は0（BP4000のまま） ===")
scenario({
    name: "p054-zero-bp",
    start: { turn: "opp", me: { spirits: [{ card: P054 }], burst: BURST }, opp: { spirits: [{ card: ARNOLD }, { card: FENRIR }] } },
    steps: oppCombine,
    expect: OPP_COMBINE,
})

console.log("=== 28. P054 の対照：自分がバーストをセットしていなければ、相手の合体スピリットは BP+3000 のまま ===")
scenario({
    name: "p054-no-burst",
    start: { turn: "opp", me: { spirits: [{ card: P054 }] }, opp: { spirits: [{ card: ARNOLD }, { card: FENRIR }] } },
    steps: oppCombine,
    expect: [...OPP_COMBINE, "相手.ディープ・アーノルド.BP: 4000 → 7000"],
})

console.log("すべてのチェックに合格しました 🎉（part717）")
