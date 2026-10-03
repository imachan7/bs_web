// smoke パート481（BS12 の未発火エントリ：fieldEvent／triggered／keyword(重装甲)の場面テスト）
// 期待値は効果文から書いた。実装の出力を写していない
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const V = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1 BP1000／Lv2 BP3000／Lv3 BP4000）
const MUMMY = "BS12-011"
const UDO = "BS12-023"
const NANAFUSHI = "BS12-053"
const THUNDER = "BS12-058"
const IDOL = "BS12-064"
const SHIBERUZA = "BS12-020"
const ARCH = "BS12-050"
const HYDRA = "BS12-057"
const X04 = "BS12-X04"
const ZANIGAN = "BS12-025"
const CHRYSANTHE = "BS12-027"
const SAILFISH = "BS12-028"
const FORSETI = "BS12-030"
const GEKKO = "BS12-055"
// 相手側の効果の発生源（召喚時に相手のスピリットへ作用する）
const EMERALD = "BS01-063" // 緑・コスト4：相手のスピリット1体を疲労
const EIR = "BS10-035" // 白・コスト4：相手のスピリット1体を手札に戻す
const GOAT = "BS06-014" // 紫・コスト1：相手のスピリット上のコア1個をリザーブへ（0個にはできない）
const PAN = "BS02-066" // 黄・コスト4：相手のスピリット1体を疲労させることができる
const LEO = "BS11-006" // 赤・コスト5：BP5000以下の相手のスピリット1体を破壊
const BINDING = "BS01-134" // 緑のマジック（トラッシュに置いておく用）
const IBURN = "BS01-005"
const SHOCK = "BS01-054"
const PHANTASM = "BS02-014"
const METAL = "BS01-008" // コスト3

console.log("=== 前提: カードの機械確認 ===")
{
    const expectCard = (id: string, name: string, type: string, color: string, cost: number) => {
        const c = getCard(id)
        assert(c.name === name && c.type === type && c.colors.join() === color && c.cost === cost, `${id} は ${name}（${type}・${color}・コスト${cost}）`)
    }
    expectCard(V, "ロクケラトプス", "spirit", "red", 1)
    expectCard(MUMMY, "ミイラバード", "spirit", "purple", 3)
    expectCard(UDO, "忍仙人ウドウ", "spirit", "green", 6)
    expectCard(NANAFUSHI, "オオヅツナナフシ", "brave", "green", 4)
    expectCard(THUNDER, "神聖鳥サンダ・バード", "brave", "yellow", 5)
    expectCard(IDOL, "偶像の館", "nexus", "purple", 4)
    expectCard(SHIBERUZA, "一番槍のシベルザ", "spirit", "green", 3)
    expectCard(ARCH, "突機竜アーケランサー", "brave", "red", 5)
    expectCard(HYDRA, "ハイドランディア", "brave", "yellow", 2)
    expectCard(X04, "月光神龍ルナテック・ストライクヴルム", "spirit", "white", 7)
    expectCard(ZANIGAN, "ザニーガン", "spirit", "white", 1)
    expectCard(CHRYSANTHE, "近衛機クリザンテMk-VIII", "spirit", "white", 3)
    expectCard(SAILFISH, "セイルフィッシュ", "spirit", "white", 3)
    expectCard(FORSETI, "機人フォルセティ", "spirit", "white", 5)
    expectCard(GEKKO, "ゲッコ・グライダー", "brave", "white", 4)
    expectCard(EMERALD, "エメラルドシーザー", "spirit", "green", 4)
    expectCard(EIR, "樹氷の女神エイル", "spirit", "white", 4)
    expectCard(GOAT, "スモッグゴート", "spirit", "purple", 1)
    expectCard(PAN, "アルカナドール・パン", "spirit", "yellow", 4)
    expectCard(LEO, "獅龍皇子レオグルス", "spirit", "red", 5)
    expectCard(BINDING, "バインディングソーン", "magic", "green", 2)
    expectCard(IBURN, "アイバーン", "spirit", "red", 2)
    expectCard(SHOCK, "ショックイーター", "spirit", "green", 2)
    expectCard(PHANTASM, "ファンタズマ", "spirit", "purple", 2)
    expectCard(METAL, "メタルバーン", "spirit", "red", 3)
    assert(getCard(V).effects.length === 0, "Vは効果なし")
}

const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option" && (pc.options ?? []).includes("発動する")
}

// 選択待ちを答え切る。確認は decline なら断る（何も渡さない）、そうでなければ「発動する」。
// 対象選択は prefer のラベルが候補にあればそれ、無ければ先頭。確認の出た回数を返す
function drive(t: ScenarioCtx, opts: { prefer?: string; decline?: boolean } = {}): number {
    let confirms = 0
    let guard = 0
    while (t.state.pendingChoice) {
        if (++guard > 30) throw new Error("選択待ちが終わらない: " + t.state.pendingChoice.prompt)
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(t)) {
            confirms++
            if (opts.decline) t.act(side, { type: "resolveChoice" })
            else t.act(side, { type: "resolveChoice", option: "発動する" })
        } else if (pc.kind === "option") {
            t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        } else {
            let pick = pc.candidates[0]!
            if (opts.prefer) {
                try {
                    const want = t.id(opts.prefer)
                    if (pc.candidates.includes(want)) pick = want
                } catch {
                    /* 場にいなければ先頭 */
                }
            }
            t.act(side, { type: "resolveChoice", instanceId: pick })
        }
    }
    return confirms
}

// 手札の先頭を召喚し、選択を答え切る
function summonFirst(t: ScenarioCtx, side: "me" | "opp", opts: { prefer?: string; decline?: boolean } = {}): number {
    t.act(side, { type: "summon", handIndex: 0 })
    return drive(t, opts)
}

// 攻撃側が攻撃し、ブロック無しでライフを受ける（受ける側のターンプレイヤーでない側が takeLife）
function attackAndTakeLife(t: ScenarioCtx, atkSide: "me" | "opp", who: string, opts: { prefer?: string } = {}) {
    const defSide = atkSide === "me" ? "opp" : "me"
    t.act(atkSide, { type: "attack", instanceId: t.id(who) })
    drive(t, opts)
    if (t.state.battle) {
        t.closeFlash()
        drive(t, opts)
        if (t.state.battle && !t.state.pendingChoice) t.act(defSide, { type: "takeLife" })
        drive(t, opts)
    }
}

// 新しくフィールドに出た個体の写像（コア・Lv・BP は呼び出し側が与える）
const placed = (key: string, cores: number, lv: number, bp: number, rested = false) => [
    `${key}.場所: なし → フィールド`,
    `${key}.コア: なし → ${cores}`,
    `${key}.Lv: なし → ${lv}`,
    `${key}.BP: なし → ${bp}`,
    ...(rested ? [`${key}.疲労: なし → true`] : [`${key}.疲労: なし → false`]),
]

// ───────────────────────── BS12-011 ミイラバード（Lv2：相手の効果で疲労したとき、相手のスピリットのコア1個をトラッシュ）
console.log("=== 1. ミイラバード Lv2：相手のスピリットの効果で疲労したら、相手のスピリットのコア1個がトラッシュへ ===")
scenario({
    name: "mummy-lv2",
    start: {
        turn: "opp",
        interactive: true,
        me: { spirits: [{ card: MUMMY, cores: 3 }] },
        opp: { hand: [EMERALD], spirits: [{ card: V, label: "標的", cores: 2 }] },
    },
    steps: (t) => {
        summonFirst(t, "opp", { prefer: "標的" })
    },
    expect: [
        "自分.ミイラバード.疲労: false → true",
        "相手.標的.コア: 2 → 1",
        "相手.標的.Lv: 2 → 1",
        "相手.標的.BP: 3000 → 1000",
        ...placed("相手.エメラルドシーザー", 1, 1, 3000),
        "相手.手札: エメラルドシーザー → なし",
        "相手.リザーブ: 10 → 5",
        "相手.トラッシュのコア: 0 → 5",
    ],
})

console.log("=== 2. ミイラバード Lv1：疲労しても何も起きない ===")
scenario({
    name: "mummy-lv1",
    start: {
        turn: "opp",
        interactive: true,
        me: { spirits: [{ card: MUMMY, cores: 1 }] },
        opp: { hand: [EMERALD], spirits: [{ card: V, label: "標的", cores: 2 }] },
    },
    steps: (t) => {
        summonFirst(t, "opp", { prefer: "標的" })
    },
    expect: [
        "自分.ミイラバード.疲労: false → true",
        ...placed("相手.エメラルドシーザー", 1, 1, 3000),
        "相手.手札: エメラルドシーザー → なし",
        "相手.リザーブ: 10 → 5",
        "相手.トラッシュのコア: 0 → 4",
    ],
})

console.log("=== 3. ミイラバード Lv2：自分のアタックによる疲労は効果ではないので何も起きない ===")
scenario({
    name: "mummy-attack",
    start: {
        phase: "attack",
        me: { spirits: [{ card: MUMMY, cores: 3 }] },
        opp: { spirits: [{ card: V, label: "標的", cores: 2 }] },
    },
    steps: (t) => attackAndTakeLife(t, "me", "ミイラバード"),
    expect: ["自分.ミイラバード.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ───────────────────────── BS12-023 忍仙人ウドウ（Lv2：相手の効果で自分のスピリットが破壊されたとき、【暴風】持ちを回復）
const udoScene = (cores: number) => ({
    turn: "opp" as const,
    interactive: true,
    me: { spirits: [{ card: UDO, cores, rested: true }, { card: V, label: "犠牲", cores: 1 }] },
    opp: { hand: [LEO], spirits: [{ card: V, label: "相手V", cores: 1 }] },
})
console.log("=== 4. ウドウ Lv2：相手のスピリットの効果で自分のスピリットが破壊されたら、疲労したウドウが回復 ===")
scenario({
    name: "udo-lv2",
    start: udoScene(3),
    steps: (t) => {
        summonFirst(t, "opp", { prefer: "犠牲" })
    },
    expect: [
        "自分.忍仙人ウドウ.疲労: true → false",
        "自分.犠牲.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
        ...placed("相手.獅龍皇子レオグルス", 1, 1, 4000),
        "相手.手札: 獅龍皇子レオグルス → ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
        "相手.リザーブ: 10 → 5",
        "相手.トラッシュのコア: 0 → 4",
    ],
})

console.log("=== 5. ウドウ Lv1：回復しない ===")
scenario({
    name: "udo-lv1",
    start: udoScene(1),
    steps: (t) => {
        summonFirst(t, "opp", { prefer: "犠牲" })
    },
    expect: [
        "自分.犠牲.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
        ...placed("相手.獅龍皇子レオグルス", 1, 1, 4000),
        "相手.手札: 獅龍皇子レオグルス → ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
        "相手.リザーブ: 10 → 5",
        "相手.トラッシュのコア: 0 → 4",
    ],
})

// ───────────────────────── BS12-053 オオヅツナナフシ
const nanaPlaced = (rested = false) => [
    "自分.オオヅツナナフシ.場所: なし → フィールド",
    "自分.オオヅツナナフシ.コア: なし → 1",
    "自分.オオヅツナナフシ.Lv: なし → 1",
    "自分.オオヅツナナフシ.BP: なし → 2000",
    `自分.オオヅツナナフシ.疲労: なし → ${rested}`,
    "自分.リザーブ: 10 → 5",
    "自分.トラッシュのコア: 0 → 4",
]
console.log("=== 6. ナナフシ召喚時：手札すべてを捨て、相手の手札と同じ枚数ドロー（確認1回） ===")
scenario({
    name: "nana-summon",
    start: {
        interactive: true,
        me: { hand: [NANAFUSHI, V, V] },
        opp: { hand: [V, V, V] },
    },
    steps: (t) => {
        const n = summonFirst(t, "me")
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [
        ...nanaPlaced(),
        "自分.手札: オオヅツナナフシ、ロクケラトプス、ロクケラトプス → ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "自分.デッキ枚数: 40 → 37",
    ],
})

console.log("=== 7. ナナフシ召喚時：断ると手札は捨てずドローもしない ===")
scenario({
    name: "nana-decline",
    start: {
        interactive: true,
        me: { hand: [NANAFUSHI, V, V] },
        opp: { hand: [V, V, V] },
    },
    steps: (t) => {
        const n = summonFirst(t, "me", { decline: true })
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [...nanaPlaced(), "自分.手札: オオヅツナナフシ、ロクケラトプス、ロクケラトプス → ロクケラトプス、ロクケラトプス"],
})

console.log("=== 8. ナナフシ召喚時：召喚後の手札が0枚なら確認は出ない（最低1枚以上） ===")
scenario({
    name: "nana-empty",
    start: {
        interactive: true,
        me: { hand: [NANAFUSHI] },
        opp: { hand: [V, V, V] },
    },
    steps: (t) => {
        const n = summonFirst(t, "me")
        assert(n === 0, `確認は出ない（実際 ${n} 回）`)
    },
    expect: [...nanaPlaced(), "自分.手札: オオヅツナナフシ → なし"],
})

console.log("=== 9. ナナフシ合体中：相手がドローしたとき（相手のドローステップ）、疲労したホストが回復 ===")
scenario({
    name: "nana-combined",
    start: {
        me: { spirits: [{ card: SHIBERUZA, cores: 1, rested: true }, { card: NANAFUSHI, cores: 0 }] },
    },
    steps: (t) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("オオヅツナナフシ"), hostInstanceId: t.id("一番槍のシベルザ") })
        t.act("me", { type: "endTurn" })
    },
    expect: [
        "自分.一番槍のシベルザ.疲労: true → false",
        "自分.一番槍のシベルザ.BP: 3000 → 5000",
        "自分.オオヅツナナフシ.場所: フィールド → 合体",
        "自分.オオヅツナナフシ.BP: 0 → なし",
        "自分.オオヅツナナフシ.Lv: 0 → 1",
        "相手.手札: なし → ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 10. ナナフシ（合体していない）：相手がドローしても疲労したままのスピリットは回復しない ===")
scenario({
    name: "nana-uncombined",
    start: {
        me: { spirits: [{ card: NANAFUSHI, cores: 1, rested: true }] },
    },
    steps: (t) => {
        t.act("me", { type: "endTurn" })
    },
    expect: ["相手.手札: なし → ロクケラトプス", "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11"],
})

// ───────────────────────── BS12-058 神聖鳥サンダ・バード
const thunderPlaced = [
    "自分.神聖鳥サンダ・バード.場所: なし → フィールド",
    "自分.神聖鳥サンダ・バード.コア: なし → 1",
    "自分.神聖鳥サンダ・バード.Lv: なし → 1",
    "自分.神聖鳥サンダ・バード.BP: なし → 3000",
    "自分.神聖鳥サンダ・バード.疲労: なし → false",
    "自分.リザーブ: 10 → 4",
    "自分.トラッシュのコア: 0 → 5",
]
console.log("=== 11. サンダ・バード召喚時：トラッシュのマジック1枚が手札に戻る ===")
scenario({
    name: "thunder-summon",
    start: { me: { hand: [THUNDER], trash: [BINDING, V] } },
    steps: (t) => {
        summonFirst(t, "me")
    },
    expect: [...thunderPlaced, "自分.手札: 神聖鳥サンダ・バード → バインディングソーン", "自分.トラッシュ: バインディングソーン、ロクケラトプス → ロクケラトプス"],
})

console.log("=== 12. サンダ・バード召喚時：トラッシュにマジックが無ければ何も戻らない ===")
scenario({
    name: "thunder-summon-nomagic",
    start: { me: { hand: [THUNDER], trash: [V] } },
    steps: (t) => {
        summonFirst(t, "me")
    },
    expect: [...thunderPlaced, "自分.手札: 神聖鳥サンダ・バード → なし"],
})

const thunderBattle = (combined: boolean) => ({
    name: combined ? "thunder-combined" : "thunder-uncombined",
    start: {
        me: {
            hand: [BINDING],
            spirits: combined
                ? [{ card: SHIBERUZA, cores: 1 }, { card: THUNDER, cores: 0 }]
                : [{ card: SHIBERUZA, cores: 1 }],
        },
        opp: { spirits: [{ card: V, label: "ブロッカー", cores: 3 }] },
    },
    steps: (t: ScenarioCtx) => {
        if (combined) t.act("me", { type: "combineBrave", braveInstanceId: t.id("神聖鳥サンダ・バード"), hostInstanceId: t.id("一番槍のシベルザ") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("一番槍のシベルザ") })
        drive(t)
        t.closeFlash() // アタック宣言のフラッシュを閉じるとブロック宣言へ進む
        t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
        drive(t)
        // ブロック宣言後のフラッシュで、優先権を持つ側に合わせて自分の番まで回す
        let g = 0
        while (t.state.priorityPlayer !== t.me && g++ < 3) t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ブロッカー") })
        drive(t)
    },
})
console.log("=== 13. サンダ・バード合体アタック：マジックを使うと、ブロッカーのBPが2000として扱われる ===")
scenario({
    ...thunderBattle(true),
    expect: [
        "自分.一番槍のシベルザ.疲労: false → true",
        "自分.一番槍のシベルザ.BP: 3000 → 6000",
        "自分.神聖鳥サンダ・バード.場所: フィールド → 合体",
        "自分.神聖鳥サンダ・バード.BP: 0 → なし",
        "自分.神聖鳥サンダ・バード.Lv: 0 → 1",
        "相手.ブロッカー.疲労: false → true",
        "相手.ブロッカー.BP: 4000 → 2000",
        "自分.手札: バインディングソーン → なし",
        "自分.トラッシュ: なし → バインディングソーン",
        "自分.リザーブ: 10 → 9",
        "自分.トラッシュのコア: 0 → 1",
    ],
})

console.log("=== 14. サンダ・バード（合体していない）：同じマジックを使ってもBPは変わらない ===")
scenario({
    ...thunderBattle(false),
    expect: [
        "自分.一番槍のシベルザ.疲労: false → true",
        "相手.ブロッカー.疲労: false → true",
        "自分.手札: バインディングソーン → なし",
        "自分.トラッシュ: なし → バインディングソーン",
        "自分.リザーブ: 10 → 9",
        "自分.トラッシュのコア: 0 → 1",
    ],
})

// ───────────────────────── BS12-064 偶像の館（Lv2：相手の効果で自分のスピリットが疲労したら、相手のスピリット1体を疲労）
const idolScene = (cores: number) => ({
    turn: "opp" as const,
    interactive: true,
    me: { nexuses: [{ card: IDOL, cores }], spirits: [{ card: V, label: "味方" }] },
    opp: { hand: [EMERALD], spirits: [{ card: V, label: "標的" }] },
})
const idolOppSummon = [
    ...placed("相手.エメラルドシーザー", 1, 1, 3000),
    "相手.手札: エメラルドシーザー → なし",
    "相手.リザーブ: 10 → 5",
    "相手.トラッシュのコア: 0 → 4",
]
console.log("=== 15. 偶像の館 Lv2：自分のスピリットが相手の効果で疲労したら、相手のスピリット1体を疲労させる ===")
scenario({
    name: "idol-lv2",
    start: idolScene(1),
    steps: (t) => {
        summonFirst(t, "opp", { prefer: "標的" })
    },
    expect: ["自分.味方.疲労: false → true", "相手.標的.疲労: false → true", ...idolOppSummon],
})

console.log("=== 16. 偶像の館 Lv1（コア0）：誘発しない ===")
scenario({
    name: "idol-lv1",
    start: idolScene(0),
    steps: (t) => {
        summonFirst(t, "opp", { prefer: "標的" })
    },
    expect: ["自分.味方.疲労: false → true", ...idolOppSummon],
})

// ───────────────────────── BS12-020 一番槍のシベルザ（Lv2：自分のターンの最初のアタックのとき回復）
console.log("=== 17. シベルザ Lv2：最初のアタックで疲労せず回復している ===")
scenario({
    name: "shiberuza-first",
    start: { phase: "attack", me: { spirits: [{ card: SHIBERUZA, cores: 3 }] } },
    steps: (t) => attackAndTakeLife(t, "me", "一番槍のシベルザ"),
    expect: ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== 18. シベルザ Lv1：回復しない ===")
scenario({
    name: "shiberuza-lv1",
    start: { phase: "attack", me: { spirits: [{ card: SHIBERUZA, cores: 1 }] } },
    steps: (t) => attackAndTakeLife(t, "me", "一番槍のシベルザ"),
    expect: ["自分.一番槍のシベルザ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== 19. シベルザ Lv2：同じターンの2回目のアタック（最初のアタックは別のスピリット）では回復しない ===")
scenario({
    name: "shiberuza-second",
    start: { phase: "attack", me: { spirits: [{ card: V, label: "先陣" }, { card: SHIBERUZA, cores: 3 }] } },
    steps: (t) => {
        attackAndTakeLife(t, "me", "先陣")
        attackAndTakeLife(t, "me", "一番槍のシベルザ")
    },
    expect: ["自分.先陣.疲労: false → true", "自分.一番槍のシベルザ.疲労: false → true", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"],
})

// ───────────────────────── BS12-050 突機竜アーケランサー
console.log("=== 20. アーケランサー召喚時：1枚ドローし、相手のネクサス1つを破壊 ===")
scenario({
    name: "arch-summon",
    start: { me: { hand: [ARCH] }, opp: { nexuses: [{ card: IDOL, cores: 1 }] } },
    steps: (t) => {
        summonFirst(t, "me")
    },
    expect: [
        "自分.突機竜アーケランサー.場所: なし → フィールド",
        "自分.突機竜アーケランサー.コア: なし → 1",
        "自分.突機竜アーケランサー.Lv: なし → 1",
        "自分.突機竜アーケランサー.BP: なし → 3000",
        "自分.突機竜アーケランサー.疲労: なし → false",
        "自分.手札: 突機竜アーケランサー → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "相手.偶像の館.場所: ネクサス → なし",
        "相手.トラッシュ: なし → 偶像の館",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 21. アーケランサー召喚時：相手にネクサスがいなくてもドローはする ===")
scenario({
    name: "arch-summon-nonexus",
    start: { me: { hand: [ARCH] } },
    steps: (t) => {
        summonFirst(t, "me")
    },
    expect: [
        "自分.突機竜アーケランサー.場所: なし → フィールド",
        "自分.突機竜アーケランサー.コア: なし → 1",
        "自分.突機竜アーケランサー.Lv: なし → 1",
        "自分.突機竜アーケランサー.BP: なし → 3000",
        "自分.突機竜アーケランサー.疲労: なし → false",
        "自分.手札: 突機竜アーケランサー → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
    ],
})

// 【合体時】フラッシュ：起動能力ではなく、合体した時点で誘発して「疲労させることで」を聞く解釈（質問事項）
const archFlash = (spare: boolean) => ({
    name: spare ? "arch-flash" : "arch-flash-nopay",
    start: {
        interactive: true,
        me: {
            spirits: [
                { card: SHIBERUZA, cores: 1, rested: !spare },
                { card: ARCH, cores: 0 },
                { card: V, label: "コスト", rested: !spare },
            ],
        },
    },
    steps: (t: ScenarioCtx) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("突機竜アーケランサー"), hostInstanceId: t.id("一番槍のシベルザ") })
        const n = drive(t, { prefer: "コスト" })
        assert(n === (spare ? 1 : 0), `確認は${spare ? 1 : 0}回（実際 ${n} 回）`)
    },
})
const archBrave = ["自分.突機竜アーケランサー.場所: フィールド → 合体", "自分.突機竜アーケランサー.BP: 0 → なし", "自分.突機竜アーケランサー.Lv: 0 → 1"]
console.log("=== 22. アーケランサー合体時フラッシュ：スピリット1体を疲労させて、BP+3000 ===")
scenario({
    ...archFlash(true),
    expect: ["自分.一番槍のシベルザ.BP: 3000 → 9000", "自分.コスト.疲労: false → true", ...archBrave],
})

console.log("=== 23. アーケランサー合体時フラッシュ：疲労させられるスピリットがいなければ確認も出ず、BPも上がらない ===")
scenario({
    ...archFlash(false),
    expect: ["自分.一番槍のシベルザ.BP: 3000 → 6000", ...archBrave],
})

// ───────────────────────── BS12-057 ハイドランディア
const hydraPlaced = [
    "自分.ハイドランディア.場所: なし → フィールド",
    "自分.ハイドランディア.コア: なし → 1",
    "自分.ハイドランディア.Lv: なし → 1",
    "自分.ハイドランディア.BP: なし → 2000",
    "自分.ハイドランディア.疲労: なし → false",
]
console.log("=== 24. ハイドランディア召喚時：トラッシュのコスト2のスピリット3枚をコストを払わず召喚 ===")
scenario({
    name: "hydra-summon",
    start: { me: { hand: [HYDRA], trash: [IBURN, SHOCK, PHANTASM, METAL] } },
    steps: (t) => {
        summonFirst(t, "me")
    },
    expect: [
        ...hydraPlaced,
        ...placed("自分.アイバーン", 1, 1, 2000),
        ...placed("自分.ショックイーター", 1, 1, 3000),
        ...placed("自分.ファンタズマ", 1, 1, 2000),
        "自分.手札: ハイドランディア → なし",
        "自分.トラッシュ: アイバーン、ショックイーター、ファンタズマ、メタルバーン → メタルバーン",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 2",
    ],
})

console.log("=== 25. ハイドランディア召喚時：トラッシュにコスト2のスピリットがいなければ何も召喚されない ===")
scenario({
    name: "hydra-none",
    start: { me: { hand: [HYDRA], trash: [METAL] } },
    steps: (t) => {
        summonFirst(t, "me")
    },
    expect: [...hydraPlaced, "自分.手札: ハイドランディア → なし", "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 2"],
})

// ───────────────────────── BS12-X04 月光神龍ルナテック・ストライクヴルム
console.log("=== 26. X04：相手のスピリットがアタックしたとき、疲労したX04が回復 ===")
scenario({
    name: "x04-recover",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: X04, cores: 1, rested: true }] }, opp: { spirits: [{ card: V, label: "攻撃役" }] } },
    steps: (t) => attackAndTakeLife(t, "opp", "攻撃役"),
    expect: ["自分.月光神龍ルナテック・ストライクヴルム.疲労: true → false", "相手.攻撃役.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})

console.log("=== 27. X04：自分のターンの自分のアタックでは回復しない（相手のアタックステップ限定） ===")
scenario({
    name: "x04-own-attack",
    start: { phase: "attack", me: { spirits: [{ card: X04, cores: 1, rested: true }, { card: V, label: "攻撃役" }] } },
    steps: (t) => attackAndTakeLife(t, "me", "攻撃役"),
    expect: ["自分.攻撃役.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

const x04Combined = (cores: number) => ({
    name: `x04-combined-${cores}`,
    start: {
        me: { spirits: [{ card: X04, cores }, { card: GEKKO, cores: 0 }] },
        opp: { spirits: [{ card: V, label: "相手V" }] },
    },
    steps: (t: ScenarioCtx) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ゲッコ・グライダー"), hostInstanceId: t.id("月光神龍ルナテック・ストライクヴルム") })
        t.act("me", { type: "nextPhase" })
        attackAndTakeLife(t, "me", "月光神龍ルナテック・ストライクヴルム")
    },
})
console.log("=== 28. X04 合体中 Lv2：アタック時、BP以下の相手のスピリット1体を手札に戻す ===")
scenario({
    ...x04Combined(3),
    expect: [
        "自分.月光神龍ルナテック・ストライクヴルム.疲労: false → true",
        "自分.月光神龍ルナテック・ストライクヴルム.BP: 8000 → 12000",
        "自分.ゲッコ・グライダー.場所: フィールド → 合体",
        "自分.ゲッコ・グライダー.BP: 0 → なし",
        "自分.ゲッコ・グライダー.Lv: 0 → 1",
        "相手.相手V.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== 29. X04 合体中 Lv1：戻さない ===")
scenario({
    ...x04Combined(1),
    expect: [
        "自分.月光神龍ルナテック・ストライクヴルム.疲労: false → true",
        "自分.月光神龍ルナテック・ストライクヴルム.BP: 6000 → 10000",
        "自分.ゲッコ・グライダー.場所: フィールド → 合体",
        "自分.ゲッコ・グライダー.BP: 0 → なし",
        "自分.ゲッコ・グライダー.Lv: 0 → 1",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ───────────────────────── 【重装甲】系：相手の効果の発生源を召喚して作用させる
const oppSummonLines = (name: string, cost: number, bp: number) => [
    ...placed(`相手.${name}`, 1, 1, bp),
    `相手.手札: ${name} → なし`,
    `相手.リザーブ: 10 → ${10 - cost - 1}`,
    `相手.トラッシュのコア: 0 → ${cost}`,
]
const armorScene = (victim: string, cores: number, source: string) => ({
    turn: "opp" as const,
    interactive: true,
    me: { spirits: [{ card: victim, cores }] },
    opp: { hand: [source] },
})
const armorRun = (t: ScenarioCtx) => {
    summonFirst(t, "opp")
}

console.log("=== 30. X04【重装甲：可変】：白の相手の効果（エイル）は受けない ===")
scenario({
    name: "x04-armor-white",
    start: armorScene(X04, 1, EIR),
    steps: armorRun,
    expect: oppSummonLines("樹氷の女神エイル", 4, 1000),
})
console.log("=== 31. X04：白でない相手の効果（エメラルドシーザー）は受ける ===")
scenario({
    name: "x04-armor-green",
    start: armorScene(X04, 1, EMERALD),
    steps: armorRun,
    expect: ["自分.月光神龍ルナテック・ストライクヴルム.疲労: false → true", ...oppSummonLines("エメラルドシーザー", 4, 3000)],
})

console.log("=== 32. ザニーガン Lv2【重装甲：赤】：赤の相手の効果（レオグルス）で破壊されない ===")
scenario({
    name: "zanigan-armor-red",
    start: armorScene(ZANIGAN, 3, LEO),
    steps: armorRun,
    expect: oppSummonLines("獅龍皇子レオグルス", 5, 4000),
})
console.log("=== 33. ザニーガン Lv1：重装甲は無いので赤の効果で破壊される ===")
scenario({
    name: "zanigan-lv1",
    start: armorScene(ZANIGAN, 1, LEO),
    steps: armorRun,
    expect: [
        "自分.ザニーガン.場所: フィールド → なし",
        "自分.トラッシュ: なし → ザニーガン",
        "自分.リザーブ: 10 → 11",
        "相手.手札: 獅龍皇子レオグルス → ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
        ...oppSummonLines("獅龍皇子レオグルス", 5, 4000).filter((l) => !l.startsWith("相手.手札")),
    ],
})
console.log("=== 34. ザニーガン Lv2：赤でない相手の効果（エメラルドシーザー）は受ける ===")
scenario({
    name: "zanigan-green",
    start: armorScene(ZANIGAN, 3, EMERALD),
    steps: armorRun,
    expect: ["自分.ザニーガン.疲労: false → true", ...oppSummonLines("エメラルドシーザー", 4, 3000)],
})

console.log("=== 35. クリザンテ【重装甲：紫】：紫の相手の効果（スモッグゴート）でコアを取られない ===")
scenario({
    name: "chrysanthe-armor-purple",
    start: armorScene(CHRYSANTHE, 2, GOAT),
    steps: armorRun,
    expect: oppSummonLines("スモッグゴート", 1, 1000),
})
console.log("=== 36. クリザンテ：紫でない相手の効果（エメラルドシーザー）は受ける ===")
scenario({
    name: "chrysanthe-green",
    start: armorScene(CHRYSANTHE, 2, EMERALD),
    steps: armorRun,
    expect: ["自分.近衛機クリザンテMk-VIII.疲労: false → true", ...oppSummonLines("エメラルドシーザー", 4, 3000)],
})

console.log("=== 37. セイルフィッシュ【重装甲：白】：白の相手の効果（エイル）で手札に戻されない ===")
scenario({
    name: "sailfish-armor-white",
    start: armorScene(SAILFISH, 1, EIR),
    steps: armorRun,
    expect: oppSummonLines("樹氷の女神エイル", 4, 1000),
})
console.log("=== 38. セイルフィッシュ：白でない相手の効果（エメラルドシーザー）は受ける ===")
scenario({
    name: "sailfish-green",
    start: armorScene(SAILFISH, 1, EMERALD),
    steps: armorRun,
    expect: ["自分.セイルフィッシュ.疲労: false → true", ...oppSummonLines("エメラルドシーザー", 4, 3000)],
})

console.log("=== 39. フォルセティ【重装甲：紫/緑】：緑の相手の効果（エメラルドシーザー）は受けない ===")
scenario({
    name: "forseti-armor-green",
    start: armorScene(FORSETI, 1, EMERALD),
    steps: armorRun,
    expect: oppSummonLines("エメラルドシーザー", 4, 3000),
})
console.log("=== 40. フォルセティ：紫の相手の効果（スモッグゴート）も受けない ===")
scenario({
    name: "forseti-armor-purple",
    start: armorScene(FORSETI, 2, GOAT),
    steps: armorRun,
    expect: oppSummonLines("スモッグゴート", 1, 1000),
})
console.log("=== 41. フォルセティ：紫/緑でない相手の効果（エイル）は受ける ===")
scenario({
    name: "forseti-white",
    start: armorScene(FORSETI, 1, EIR),
    steps: armorRun,
    expect: [
        "自分.機人フォルセティ.場所: フィールド → なし",
        "自分.手札: なし → 機人フォルセティ",
        "自分.リザーブ: 10 → 11",
        ...oppSummonLines("樹氷の女神エイル", 4, 1000),
    ],
})

// ゲッコ・グライダー：合体した自分のターンのうちに相手の番へ進め、そこで相手が効果を使う
const gekkoScene = (source: string) => ({
    interactive: true,
    me: { spirits: [{ card: SHIBERUZA, cores: 2 }, { card: GEKKO, cores: 0 }] },
    opp: { hand: [source] },
})
const gekkoRun = (t: ScenarioCtx) => {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("ゲッコ・グライダー"), hostInstanceId: t.id("一番槍のシベルザ") })
    t.act("me", { type: "endTurn" })
    drive(t)
    t.act("opp", { type: "summon", handIndex: 0 })
    drive(t)
}
const gekkoBase = [
    "自分.ゲッコ・グライダー.BP: 0 → なし",
    "自分.ゲッコ・グライダー.Lv: 0 → 1",
    "自分.一番槍のシベルザ.BP: 3000 → 7000",
    "自分.ゲッコ・グライダー.場所: フィールド → 合体",
    "相手.デッキ枚数: 40 → 39",
]
console.log("=== 42. ゲッコ・グライダー合体時【重装甲：紫/黄】：紫の相手の効果（スモッグゴート）を受けない ===")
scenario({
    name: "gekko-armor-purple",
    start: gekkoScene(GOAT),
    steps: gekkoRun,
    expect: [...gekkoBase, "相手.手札: スモッグゴート → ロクケラトプス", "相手.リザーブ: 10 → 9", "相手.トラッシュのコア: 0 → 1", ...placed("相手.スモッグゴート", 1, 1, 1000)],
})
console.log("=== 43. ゲッコ・グライダー合体時：黄の相手の効果（パン）を受けない ===")
scenario({
    name: "gekko-armor-yellow",
    start: gekkoScene(PAN),
    steps: gekkoRun,
    expect: [...gekkoBase, "相手.手札: アルカナドール・パン → ロクケラトプス", "相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 4", ...placed("相手.アルカナドール・パン", 1, 1, 2000)],
})
console.log("=== 44. ゲッコ・グライダー合体時：紫/黄でない相手の効果（エメラルドシーザー）は受ける ===")
scenario({
    name: "gekko-green",
    start: gekkoScene(EMERALD),
    steps: gekkoRun,
    expect: [...gekkoBase, "自分.一番槍のシベルザ.疲労: false → true", "相手.手札: エメラルドシーザー → ロクケラトプス", "相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 4", ...placed("相手.エメラルドシーザー", 1, 1, 3000)],
})

console.log("すべてのチェックに合格しました 🎉（part481）")
