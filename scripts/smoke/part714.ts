// smoke パート714（プロモ B：P072 ゴールド・クロー・ドラゴン／P060 ナイト・ドラゴン／P065 ショベル・ゴレム。期待値役が効果文だけから書いた場面テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string, string][] = [
        ["P072", "ゴールド・クロー・ドラゴン", "spirit"],
        ["P060", "ナイト・ドラゴン", "spirit"],
        ["P065", "ショベル・ゴレム", "spirit"],
        ["BS01-002", "ロクケラトプス", "spirit"], // 赤・コスト1・バニラ
        ["BS01-005", "アイバーン", "spirit"], // 赤・コスト2・Lv2(コア4)でBP6000
        ["BS02-046", "ウィンガル", "spirit"], // 白・コスト6・Lv1でBP5000・Lv2(コア2)でBP6000
        ["BS10-039", "ビアンコ・ティーガー", "spirit"], // 白・コスト6・Lv2(コア2)でBP9000
        ["BS06-013", "ピジョンヘディレス", "spirit"], // 紫・コスト0・バニラ（トラッシュから召喚される側）
        ["BS10-011", "オニグモン", "spirit"], // 紫・コスト0・バニラ
        ["BS17-076", "ラウンドテーブルナイツ", "magic"], // 紫・コスト5。バースト【自分のライフ減少後】でトラッシュのコスト5以下のスピリット1枚を召喚
        ["BS15-076", "妖華吸血爪", "magic"], // 紫・コスト5。バースト【自分のライフ減少後】で2枚ドロー
        ["BS14-101", "仁王壁", "magic"], // 緑・コスト4。バースト【相手による自分のスピリット破壊後】でボイドからコア1個をリザーブへ
        ["BS16-025", "タランドーズ", "spirit"], // 緑・コスト6・シンボル2つ・バニラ
        ["BS03-076", "爪剣のラザラス", "spirit"], // 青・【粉砕】持ち・Lv1でBP2000
        ["BS02-110", "ヘビィゲート", "magic"], // 黄・コスト5・バースト効果を持たない
    ]
    for (const [id, name, type] of expect) assert(getCard(id).name === name && getCard(id).type === type, `${id} は ${name}(${type})`)
    const c = (id: string) => getCard(id)
    assert(c("P072").cost === 6 && c("P072").colors[0] === "red", "P072 は赤・コスト6")
    assert(c("P060").cost === 5 && c("P065").cost === 3 && c("P065").colors[0] === "blue", "P060 はコスト5・P065 は青コスト3")
    assert(c("BS06-013").cost === 0 && c("BS10-011").cost === 0 && c("BS06-013").colors[0] === "purple", "トラッシュ側の2体は紫・コスト0")
    assert(c("BS16-025").symbol.length === 2 && c("BS01-002").symbol.length === 1, "タランドーズはシンボル2つ")
    assert(c("BS03-076").effect.includes("【粉砕】") && c("BS15-076").effect.includes("バースト") && !c("BS02-110").effect.includes("バースト"), "粉砕／バースト効果の有無")
    assert(c("BS17-076").effect.includes("自分のライフ減少後") && c("BS14-101").effect.includes("相手による自分のスピリット破壊後"), "バースト条件")
}

function settle(t: ScenarioCtx, attacker: Side): void {
    const defender: Side = attacker === "me" ? "opp" : "me"
    t.act(defender, { type: "pass" })
    t.act(attacker, { type: "pass" })
}
const V = "BS01-002" // ロクケラトプス
const deckOf = (...top: string[]): string[] => [...top, ...Array.from({ length: 40 - top.length }, () => V)]
const newSpirit = (name: string, bp: number): string[] => [
    `自分.${name}.場所: なし → フィールド`,
    `自分.${name}.疲労: なし → false`,
    `自分.${name}.コア: なし → 1`,
    `自分.${name}.Lv: なし → 1`,
    `自分.${name}.BP: なし → ${bp}`,
]

// ── P072 ゴールド・クロー・ドラゴン ──
// 自分のバースト：ラウンドテーブルナイツ。ライフが減ったとき、トラッシュのコスト5以下のスピリット1枚を召喚する（召喚コストは0、維持するコア1個はリザーブから）
// 追撃の「その後コストを支払うことで」はリザーブ不足で払えない
console.log("=== P072 Lv2 / 自分のバースト発動後：そのバースト発動時にスピリットが召喚されていたら、疲労させてもう1度発揮（もう1体召喚できる） ===")
scenario({
    name: "P072-召喚するバーストをもう1度",
    start: {
        turn: "opp",
        phase: "attack",
        me: { reserve: 1, burst: "BS17-076", trash: ["BS06-013", "BS10-011"], spirits: [{ card: "P072", cores: 3 }] },
        opp: { spirits: [{ card: "BS01-005", label: "アタッカー", cores: 4 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "takeLife" })
    },
    // 1回目で1体、疲労させた2回目でもう1体（対象を選び直す）。ライフのコア1個が入ったリザーブ2個を、2体の維持コアで使い切る
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 1 → 0",
        "自分.バースト: ラウンドテーブルナイツ → なし",
        "自分.トラッシュ: オニグモン、ピジョンヘディレス → ラウンドテーブルナイツ",
        "自分.ゴールド・クロー・ドラゴン.疲労: false → true",
        ...newSpirit("ピジョンヘディレス", 1000),
        ...newSpirit("オニグモン", 1000),
        "相手.アタッカー.疲労: false → true",
    ],
})

console.log("=== P072 Lv2 / 召喚しないバースト（2枚ドロー）ではもう1度発揮しない（疲労もしない） ===")
scenario({
    name: "P072-召喚しないバーストでは再発揮しない",
    start: {
        turn: "opp",
        phase: "attack",
        me: { reserve: 0, burst: "BS15-076", spirits: [{ card: "P072", cores: 3 }] },
        opp: { spirits: [{ card: "BS01-005", label: "アタッカー", cores: 4 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 0 → 1",
        "自分.手札: なし → ロクケラトプス、ロクケラトプス",
        "自分.デッキ枚数: 40 → 38",
        "自分.トラッシュ: なし → 妖華吸血爪",
        "自分.バースト: 妖華吸血爪 → なし",
        "相手.アタッカー.疲労: false → true",
    ],
})

console.log("=== P072 Lv1 / この節はLv2・3限定：召喚するバーストでも1体しか召喚されない ===")
scenario({
    name: "P072-Lv1では再発揮しない",
    start: {
        turn: "opp",
        phase: "attack",
        me: { reserve: 1, burst: "BS17-076", trash: ["BS06-013"], spirits: [{ card: "P072", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-005", label: "アタッカー", cores: 4 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.バースト: ラウンドテーブルナイツ → なし",
        "自分.トラッシュ: ピジョンヘディレス → ラウンドテーブルナイツ",
        ...newSpirit("ピジョンヘディレス", 1000),
        "相手.アタッカー.疲労: false → true",
    ],
})

console.log("=== P072 Lv2 / すでに疲労しているときは疲労させられないので、もう1度発揮しない ===")
scenario({
    name: "P072-疲労済みなら再発揮しない",
    start: {
        turn: "opp",
        phase: "attack",
        me: { reserve: 1, burst: "BS17-076", trash: ["BS06-013"], spirits: [{ card: "P072", cores: 3, rested: true }] },
        opp: { spirits: [{ card: "BS01-005", label: "アタッカー", cores: 4 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.バースト: ラウンドテーブルナイツ → なし",
        "自分.トラッシュ: ピジョンヘディレス → ラウンドテーブルナイツ",
        ...newSpirit("ピジョンヘディレス", 1000),
        "相手.アタッカー.疲労: false → true",
    ],
})

console.log("=== P072 Lv2 / 選び直せる対象がもうなければ（トラッシュに1体だけ）、完全に解決できないので疲労しない ===")
scenario({
    name: "P072-2回目の対象がなければ疲労しない",
    start: {
        turn: "opp",
        phase: "attack",
        me: { reserve: 1, burst: "BS17-076", trash: ["BS06-013"], spirits: [{ card: "P072", cores: 3 }] },
        opp: { spirits: [{ card: "BS01-005", label: "アタッカー", cores: 4 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.バースト: ラウンドテーブルナイツ → なし",
        "自分.トラッシュ: ピジョンヘディレス → ラウンドテーブルナイツ",
        ...newSpirit("ピジョンヘディレス", 1000),
        "相手.アタッカー.疲労: false → true",
    ],
})

console.log("=== P072 / フラッシュ【覚醒】：自分のスピリットのコアを好きなだけ置く（Lv1→Lv2、置いた2個ぶん元は減る） ===")
scenario({
    name: "P072-覚醒",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "P072", cores: 1 }, { card: "BS01-002", label: "提供元", cores: 3 }] },
        opp: { spirits: [{ card: "BS01-005", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("提供元") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "awaken", instanceId: t.id("ゴールド・クロー・ドラゴン"), fromInstanceId: t.id("提供元"), count: 2 })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ゴールド・クロー・ドラゴン.コア: 1 → 3",
        "自分.ゴールド・クロー・ドラゴン.Lv: 1 → 2",
        "自分.ゴールド・クロー・ドラゴン.BP: 4000 → 6000",
        "自分.提供元.コア: 3 → 1",
        "自分.提供元.Lv: 3 → 1",
        "自分.提供元.BP: 4000 → 1000",
        "自分.提供元.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== P072 / 【覚醒】で置けるのは自分のスピリットのコアだけ（相手のスピリットからは取れない） ===")
scenario({
    name: "P072-覚醒は相手から取れない",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "P072", cores: 1 }, { card: "BS01-002", label: "アタッカー", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-005", label: "コア持ち", cores: 4 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("opp", { type: "pass" })
        t.actRejected("me", { type: "awaken", instanceId: t.id("ゴールド・クロー・ドラゴン"), fromInstanceId: t.id("コア持ち"), count: 2 })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.アタッカー.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ── P060 ナイト・ドラゴン ──
console.log("=== P060 / 激突：アタック時、相手は可能ならば必ずブロックする ===")
scenario({
    name: "P060-激突で強制ブロック",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "P060", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-002", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ナイト・ドラゴン") })
        settle(t, "me")
        t.actRejected("opp", { type: "takeLife" })
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: ["自分.ナイト・ドラゴン.疲労: false → true", "相手.ロクケラトプス.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})

console.log("=== P060 / アタック時：バーストをセットしているときBP+3000（4000+3000=7000 が 6000 に勝つ） ===")
scenario({
    name: "P060-バーストセット中はBP+3000",
    start: {
        turn: "me",
        phase: "attack",
        me: { burst: "BS15-076", spirits: [{ card: "P060", cores: 1 }] },
        opp: { spirits: [{ card: "BS02-046", cores: 2 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ナイト・ドラゴン") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ウィンガル") })
        t.closeFlash()
    },
    // BP+3000はバトルの間だけ（解決後は元のBP4000に戻る）
    expect: [
        "自分.ナイト・ドラゴン.疲労: false → true",
        "相手.ウィンガル.場所: フィールド → なし",
        "相手.トラッシュ: なし → ウィンガル",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== P060 / バーストをセットしていなければBP+されず、4000 は 6000 に負ける ===")
scenario({
    name: "P060-バーストなしならBP上がらない",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "P060", cores: 1 }] },
        opp: { spirits: [{ card: "BS02-046", cores: 2 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ナイト・ドラゴン") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ウィンガル") })
        t.closeFlash()
    },
    expect: [
        "自分.ナイト・ドラゴン.場所: フィールド → なし",
        "自分.トラッシュ: なし → ナイト・ドラゴン",
        "自分.リザーブ: 10 → 11",
        "相手.ウィンガル.疲労: false → true",
    ],
})

console.log("=== P060 Lv2 / 自分のバースト発動後：発動したカードのバースト条件が【自分のライフ減少後】なら、リザーブのコア1個をライフに置く ===")
scenario({
    name: "P060-ライフ減少後のバーストでライフ+1",
    start: {
        turn: "opp",
        phase: "attack",
        me: { reserve: 0, burst: "BS15-076", spirits: [{ card: "P060", cores: 3 }] },
        opp: { spirits: [{ card: "BS16-025", label: "アタッカー", cores: 1 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "takeLife" })
    },
    // シンボル2つのアタックでライフ5→3（コア2個がリザーブへ）。バースト後にリザーブ1個をライフへ置いて4、リザーブ1
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 0 → 1",
        "自分.手札: なし → ロクケラトプス、ロクケラトプス",
        "自分.デッキ枚数: 40 → 38",
        "自分.トラッシュ: なし → 妖華吸血爪",
        "自分.バースト: 妖華吸血爪 → なし",
        "相手.アタッカー.疲労: false → true",
    ],
})

console.log("=== P060 Lv2 / バースト条件が【相手による自分のスピリット破壊後】のカードでは、ライフに置かない ===")
scenario({
    name: "P060-別条件のバーストではライフ+1しない",
    start: {
        turn: "opp",
        phase: "attack",
        me: { reserve: 0, burst: "BS14-101", spirits: [{ card: "P060", cores: 3 }, { card: "BS01-002", cores: 1 }] },
        opp: { spirits: [{ card: "BS02-046", label: "アタッカー", cores: 1 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    // ロクケラトプス(1000)が破壊され、コア1個がリザーブへ。仁王壁の効果でボイドからコア1個がリザーブへ（計2）
    expect: [
        "自分.リザーブ: 0 → 2",
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス、仁王壁",
        "自分.バースト: 仁王壁 → なし",
        "相手.アタッカー.疲労: false → true",
    ],
})

console.log("=== P060 Lv1 / この節はLv2・3限定：ライフ減少後のバーストでもライフに置かない ===")
scenario({
    name: "P060-Lv1ではライフ+1しない",
    start: {
        turn: "opp",
        phase: "attack",
        me: { reserve: 0, burst: "BS15-076", spirits: [{ card: "P060", cores: 1 }] },
        opp: { spirits: [{ card: "BS16-025", label: "アタッカー", cores: 1 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ライフ: 5 → 3",
        "自分.リザーブ: 0 → 2",
        "自分.手札: なし → ロクケラトプス、ロクケラトプス",
        "自分.デッキ枚数: 40 → 38",
        "自分.トラッシュ: なし → 妖華吸血爪",
        "自分.バースト: 妖華吸血爪 → なし",
        "相手.アタッカー.疲労: false → true",
    ],
})

// ── P065 ショベル・ゴレム ──
// 相手のデッキの上から、粉砕で破棄される。deck は先頭が一番上
const p065Scene = (name: string, myCores: number, oppDeck: string[], expectLines: string[], attackerLabel = "ショベル・ゴレム", extraMine: { card: string; cores: number }[] = []): void =>
    scenario({
        name,
        start: {
            turn: "me",
            phase: "attack",
            me: { spirits: [{ card: "P065", cores: myCores }, ...extraMine] },
            opp: { deck: oppDeck },
        },
        steps: (t) => {
            t.act("me", { type: "attack", instanceId: t.id(attackerLabel) })
            settle(t, "me")
            t.act("opp", { type: "takeLife" })
        },
        expect: expectLines,
    })
const P065_BASE = ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]

console.log("=== P065 Lv1 / 【粉砕】アタック時：相手のデッキを上からLvと同じ枚数（1枚）破棄 ===")
p065Scene("P065-Lv1は1枚", 1, deckOf(), [...P065_BASE, "自分.ショベル・ゴレム.疲労: false → true", "相手.デッキ枚数: 40 → 39", "相手.トラッシュ: なし → ロクケラトプス"])

console.log("=== P065 Lv2 / Lvと同じ2枚破棄 ===")
p065Scene("P065-Lv2は2枚", 2, deckOf(), [
    ...P065_BASE,
    "自分.ショベル・ゴレム.疲労: false → true",
    "相手.デッキ枚数: 40 → 38",
    "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
])

console.log("=== P065 Lv3 / 破棄したカードにバースト効果を持つカードがあれば、さらに2枚破棄（3枚＋2枚＝5枚） ===")
p065Scene("P065-Lv3でバースト効果のカードを破棄", 4, deckOf("BS15-076"), [
    ...P065_BASE,
    "自分.ショベル・ゴレム.疲労: false → true",
    "相手.デッキ枚数: 40 → 35",
    "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、妖華吸血爪",
])

console.log("=== P065 Lv3 / 3枚の中に（バースト効果を持たない）マジックがあっても追加では破棄しない ===")
p065Scene("P065-Lv3でバースト効果なしのマジック", 4, deckOf("BS02-110"), [
    ...P065_BASE,
    "自分.ショベル・ゴレム.疲労: false → true",
    "相手.デッキ枚数: 40 → 37",
    "相手.トラッシュ: なし → ヘビィゲート、ロクケラトプス、ロクケラトプス",
])

console.log("=== P065 Lv3 / 破棄されなかった4枚目にバースト効果のカードがあっても追加では破棄しない（Lvと同じ3枚の外） ===")
p065Scene("P065-Lv3で4枚目にバースト", 4, deckOf(V, V, V, "BS15-076"), [
    ...P065_BASE,
    "自分.ショベル・ゴレム.疲労: false → true",
    "相手.デッキ枚数: 40 → 37",
    "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス",
])

console.log("=== P065 Lv2 / さらに破棄する節はLv3限定：バースト効果のカードを破棄しても2枚だけ ===")
p065Scene("P065-Lv2は追加破棄なし", 2, deckOf("BS15-076"), [
    ...P065_BASE,
    "自分.ショベル・ゴレム.疲労: false → true",
    "相手.デッキ枚数: 40 → 38",
    "相手.トラッシュ: なし → ロクケラトプス、妖華吸血爪",
])

console.log("=== P065 Lv3 / 自分の別のスピリットの【粉砕】で破棄したバースト効果のカードにも働く（ラザラスLv1が1枚破棄＋2枚） ===")
p065Scene(
    "P065-他のスピリットの粉砕にも働く",
    4,
    deckOf("BS15-076"),
    [
        ...P065_BASE,
        "自分.爪剣のラザラス.疲労: false → true",
        "相手.デッキ枚数: 40 → 37",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、妖華吸血爪",
    ],
    "爪剣のラザラス",
    [{ card: "BS03-076", cores: 1 }],
)

console.log("すべてのチェックに合格しました 🎉（part714）")
