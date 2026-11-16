// smoke パート976（BSC05-017 古の魔王城・BS11-076 シェアリングペイン・X13-17 六楯の皇帝ケイ。期待値役が効果文だけから書いた場面テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

const CASTLE = "BSC05-017" // 古の魔王城（紫ネクサス・コスト4。Lv2＝コア1）
const PAIN = "BS11-076" // シェアリングペイン（紫マジック・コスト5）
const KEI = "X13-17" // 六楯の皇帝ケイ（6色・コスト6・赤シンボル）
const TWIN = "SD10-014" // ツインフレイム（赤マジック・コスト3・フラッシュ：BP2000以下の相手のスピリット2体を破壊）
const POWER = "BS01-133" // ワイルドパワー（緑マジック・コスト2・フラッシュ：スピリット1体をBP+2000）
const RED = "BS01-002" // ロクケラトプス（赤・コスト1）
const WHITE = "BS01-074" // バーサーカー・ガン（白・コスト1）
const GREEN = "BS01-051" // フライングミラージュ（緑・コスト1）
const IBARN = "BS01-005" // アイバーン（赤・コスト2）
const METAL = "BS01-008" // メタルバーン（赤・コスト3）
const GORA = "BS01-001" // ゴラドン（赤・コスト0）
const GATLING = "BS01-084" // ガトリングスタンド（白・コスト3）
const PURPLE = "BS01-031" // デス・ハーデス（紫・コスト3）
const SHOCK = "BS01-054" // ショックイーター（緑・コスト2）
const PIYON = "BS02-049" // ピヨン（黄・コスト0）
const BULL = "BS03-071" // 戦闘獣ブルトップ（青・コスト0）
const BURST_P048 = "P048" // 武威煌炎刃（赤・コスト3・バースト：BP3000以下の相手のスピリット2体を破壊）
const BURST_BS14 = "BS14-092" // 烈光閃刃（赤・コスト4・バースト：自分のライフ減少後 BP3000以下のスピリットすべてを破壊）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string, number][] = [[CASTLE, "古の魔王城", 4], [PAIN, "シェアリングペイン", 5], [KEI, "六楯の皇帝ケイ", 6], [TWIN, "ツインフレイム", 3],
        [POWER, "ワイルドパワー", 2], [RED, "ロクケラトプス", 1], [WHITE, "バーサーカー・ガン", 1], [GREEN, "フライングミラージュ", 1], [IBARN, "アイバーン", 2],
        [METAL, "メタルバーン", 3], [GORA, "ゴラドン", 0], [GATLING, "ガトリングスタンド", 3], [PURPLE, "デス・ハーデス", 3], [SHOCK, "ショックイーター", 2],
        [PIYON, "ピヨン", 0], [BULL, "戦闘獣ブルトップ", 0], [BURST_P048, "武威煌炎刃", 3], [BURST_BS14, "烈光閃刃", 4]]
    for (const [id, name, cost] of names) assert(getCard(id).name === name && getCard(id).cost === cost, `${id}は${name}（コスト${cost}）`)
}

const confirm = (t: ScenarioCtx, side: Side, yes: boolean) => {
    const pc = t.state.pendingChoice
    if (!pc || pc.kind !== "option" || !pc.options) return
    const hit = pc.options.find((o) => (yes ? /はい|する|払|発動/ : /いいえ|しない|しません/).test(o) && (yes ? !/しない|しません/.test(o) : true))
    t.act(side, { type: "resolveChoice", option: hit ?? (yes ? pc.options[0] : pc.options[pc.options.length - 1]) ?? "" })
}
// 発動後の「コストを支払ってください」。出ていれば既定（リザーブ）から払う
const payIfAsked = (t: ScenarioCtx, side: Side) => {
    const pc = t.state.pendingChoice
    // 「コストNを支払ってください」は選択肢「支払う」で答える（支払い元を省くとリザーブから払う）
    if (pc && /支払/.test(pc.prompt) && !/スピリットを選んで/.test(pc.prompt)) t.act(side, { type: "resolveChoice", option: "支払う" })
}
const answer = (t: ScenarioCtx, side: Side, label: string) => t.act(side, { type: "resolveChoice", instanceId: t.id(label) })
const oppStart = (reserve = 10) => [`相手.リザーブ: ${reserve} → ${reserve + 1}`, "相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス"]

console.log("=== BSC05-017 古の魔王城 ===")
// 相手が自分のスピリットを対象に含む効果を使ったとき、対象選択後・解決前に、自分が元の対象のうち1体を選び、対象をその1体だけにできる
for (const [lv, cores] of [["Lv1", 0], ["Lv2", 1]] as const) {
    scenario({
        name: `castle-${lv}-相手のツインフレイムの対象2体のうち自分が選んだ1体だけが破壊される`,
        start: { turn: "opp", interactive: true, me: { nexuses: [{ card: CASTLE, cores }], spirits: [{ card: WHITE, label: "A" }, { card: RED, label: "B" }] },
            opp: { hand: [TWIN] } },
        steps(t) {
            const b = t.id("B")
            t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
            // 相手の候補がちょうど2体なので対象選択は出ない。魔王城の持ち主への「付け替えますか」だけに答える（見送りは skip）
            t.act("me", { type: "resolveChoice", instanceId: b })
        },
        expect: ["自分.B.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → ロクケラトプス", "相手.手札: ツインフレイム → なし",
            "相手.トラッシュ: なし → ツインフレイム", "相手.リザーブ: 10 → 7", "相手.トラッシュのコア: 0 → 3"],
    })
}
scenario({
    name: "castle-自分が使った効果では発揮されない（相手の2体が両方破壊される）",
    start: { interactive: true, me: { nexuses: [{ card: CASTLE, cores: 1 }], hand: [TWIN] }, opp: { spirits: [{ card: WHITE, label: "A" }, { card: RED, label: "B" }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" }) // 候補が相手の2体だけなので選択は出ず、魔王城の付け替えも出ない
    },
    expect: ["相手.A.場所: フィールド → なし", "相手.B.場所: フィールド → なし", "相手.リザーブ: 10 → 12",
        "相手.トラッシュ: なし → バーサーカー・ガン、ロクケラトプス", "自分.手札: ツインフレイム → なし", "自分.トラッシュ: なし → ツインフレイム",
        "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3"],
})
scenario({
    name: "castle-相手が自分のスピリットを対象にしない効果では発揮されない",
    start: { turn: "opp", interactive: true, me: { nexuses: [{ card: CASTLE, cores: 1 }] }, opp: { hand: [POWER], spirits: [{ card: RED, label: "R" }] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("R") })
    },
    expect: ["相手.R.BP: 1000 → 3000", "相手.手札: ワイルドパワー → なし", "相手.トラッシュ: なし → ワイルドパワー", "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 2"],
})

console.log("=== BS11-076 シェアリングペイン ===")
// メイン：自分のスピリット1体を破壊することで、相手は1体ずつ選んでコスト合計がそのコスト以上になるまで破壊（届いたらコスト1以上は選べない。最低1体）
// 条件：自分が破壊できるのは相手のスピリットのコスト合計以下のスピリットだけ／相手のスピリットが0体なら使えない
scenario({
    name: "pain-相手は合計コストが3に届くまで1体ずつ選んで破壊し、届いたら残りのコスト1は選べない",
    start: { interactive: true, me: { hand: [PAIN], spirits: [{ card: METAL, label: "M" }] },
        opp: { spirits: [{ card: IBARN, label: "I" }, { card: RED, label: "R" }, { card: GREEN, label: "F" }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        confirm(t, "me", true)
        if (t.state.pendingChoice && t.state.pendingChoice.pid === t.me) answer(t, "me", "M")
        answer(t, "opp", "I")
        answer(t, "opp", "R")
    },
    expect: ["自分.M.場所: フィールド → なし", "自分.手札: シェアリングペイン → なし", "自分.トラッシュ: なし → シェアリングペイン、メタルバーン",
        "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 5", "相手.I.場所: フィールド → なし", "相手.R.場所: フィールド → なし",
        "相手.リザーブ: 10 → 12", "相手.トラッシュ: なし → アイバーン、ロクケラトプス"],
})
scenario({
    name: "pain-コスト0を破壊しても相手は最低1体を破壊する（1体でコスト0以上に届く）",
    start: { interactive: true, me: { hand: [PAIN], spirits: [{ card: GORA, label: "G" }] },
        opp: { spirits: [{ card: IBARN, label: "I" }, { card: RED, label: "R" }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        confirm(t, "me", true)
        if (t.state.pendingChoice && t.state.pendingChoice.pid === t.me) answer(t, "me", "G")
        answer(t, "opp", "R")
    },
    expect: ["自分.G.場所: フィールド → なし", "自分.手札: シェアリングペイン → なし", "自分.トラッシュ: なし → ゴラドン、シェアリングペイン",
        "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 5", "相手.R.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "pain-相手のスピリットのコスト合計より高い自分のスピリットしかいないと使えない",
    start: { interactive: true, me: { hand: [PAIN], spirits: [{ card: METAL, label: "M" }] }, opp: { spirits: [{ card: IBARN, label: "I" }] } },
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [],
})
scenario({
    name: "pain-相手のスピリットが0体なら使えない",
    start: { interactive: true, me: { hand: [PAIN], spirits: [{ card: GORA, label: "G" }] }, opp: {} },
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [],
})
// フラッシュ：このターンの間、スピリット1体をBP+3000
scenario({
    name: "pain-フラッシュ-自分のスピリットをBP+3000",
    start: { me: { hand: [PAIN], spirits: [{ card: RED, label: "R" }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("R") }),
    expect: ["自分.R.BP: 1000 → 4000", "自分.手札: シェアリングペイン → なし", "自分.トラッシュ: なし → シェアリングペイン", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 5"],
})
scenario({
    name: "pain-フラッシュ-相手のスピリットも選べてBP+3000",
    start: { me: { hand: [PAIN] }, opp: { spirits: [{ card: RED, label: "R" }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("R") }),
    expect: ["相手.R.BP: 1000 → 4000", "自分.手札: シェアリングペイン → なし", "自分.トラッシュ: なし → シェアリングペイン", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 5"],
})

console.log("=== X13-17 六楯の皇帝ケイ ===")
// 節1：1コスト以上支払わなければ召喚できない（シンボル軽減で0にならない）
const sixSymbols = [{ card: RED, label: "赤" }, { card: PURPLE, label: "紫" }, { card: SHOCK, label: "緑" }, { card: WHITE, label: "白" }, { card: PIYON, label: "黄" }, { card: BULL, label: "青" }]
// Q18936：軽減で支払いが0になるなら召喚できない（1払って召喚、ではない）
scenario({
    name: "kei-6色のシンボルで軽減して支払いが0になるなら召喚できない",
    start: { me: { hand: [KEI], spirits: sixSymbols } },
    steps: (t) => t.actRejected("me", { type: "summon", handIndex: 0 }),
    expect: [],
})
scenario({
    name: "kei-シンボル4つの軽減ならコスト2を払う（軽減後に1以上残れば通常どおり召喚できる）",
    start: { me: { hand: [KEI], spirits: sixSymbols.slice(0, 4) } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: ["自分.手札: 六楯の皇帝ケイ → なし", "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 2", "自分.六楯の皇帝ケイ.場所: なし → フィールド",
        "自分.六楯の皇帝ケイ.疲労: なし → false", "自分.六楯の皇帝ケイ.コア: なし → 1", "自分.六楯の皇帝ケイ.Lv: なし → 1", "自分.六楯の皇帝ケイ.BP: なし → 4000"],
})
// 節2：お互いのアタックステップ、自分のスピリットすべては相手のバースト効果を受けない
const burstOnLifeDamage = (t: ScenarioCtx) => {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("A") })
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
    confirm(t, "opp", true)
}
const burstOpp = { life: 5, reserve: 0, burst: BURST_BS14, spirits: [{ card: RED, label: "O", rested: true }] }
scenario({
    name: "kei-アタックステップ中、相手のバーストの破壊は自分のスピリットに効かない",
    start: { me: { spirits: [{ card: KEI, label: "ケイ" }, { card: WHITE, label: "A" }] }, opp: burstOpp },
    steps: burstOnLifeDamage,
    expect: ["自分.A.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 0 → 2", "相手.O.場所: フィールド → なし", "相手.バースト: 烈光閃刃 → なし",
        "相手.トラッシュ: なし → ロクケラトプス、烈光閃刃"],
})
scenario({
    name: "kei-ケイがいなければ同じバーストで自分のスピリットも破壊される",
    start: { me: { spirits: [{ card: WHITE, label: "A" }] }, opp: burstOpp },
    steps: burstOnLifeDamage,
    expect: ["自分.A.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → バーサーカー・ガン", "相手.ライフ: 5 → 4", "相手.リザーブ: 0 → 2",
        "相手.O.場所: フィールド → なし", "相手.バースト: 烈光閃刃 → なし", "相手.トラッシュ: なし → ロクケラトプス、烈光閃刃"],
})
// 節3（Lv3）：自分のエンドステップ、自分のスピリット1体をデッキの下に戻すことで、そのコスト以下で同じ色の自分のバーストを条件を無視して発動
scenario({
    name: "kei-Lv3-エンドステップに、色とコストが合うスピリットだけを戻してバーストを発動する",
    start: { interactive: true,
        me: { reserve: 0, burst: BURST_P048, spirits: [{ card: KEI, label: "ケイ", cores: 3 }, { card: METAL, label: "M" }, { card: IBARN, label: "I" }, { card: GATLING, label: "G" }] },
        opp: { spirits: [{ card: RED, label: "R" }, { card: WHITE, label: "W" }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
        confirm(t, "me", true)
        t.actRejected("me", { type: "resolveChoice", instanceId: t.id("I") }) // コスト2は武威煌炎刃（コスト3）に届かない
        t.actRejected("me", { type: "resolveChoice", instanceId: t.id("G") }) // 白は赤のバーストと色が合わない
        answer(t, "me", "M")
        confirm(t, "me", true)
        payIfAsked(t, "me") // 武威煌炎刃：発動後に「コストを支払うことでフラッシュ効果」。戻した M のコア1個から払う
    },
    expect: ["自分.M.場所: フィールド → なし", "自分.トラッシュのコア: 0 → 1", "自分.デッキ枚数: 40 → 41", "自分.バースト: 武威煌炎刃 → なし", "自分.トラッシュ: なし → 武威煌炎刃",
        "相手.R.場所: フィールド → なし", "相手.W.場所: フィールド → なし", "相手.リザーブ: 10 → 13", "相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス",
        "相手.トラッシュ: なし → バーサーカー・ガン、ロクケラトプス"],
})
scenario({
    name: "kei-Lv3-バーストがセットされていなければ何も戻さない",
    start: { interactive: true, me: { spirits: [{ card: KEI, label: "ケイ", cores: 3 }, { card: METAL, label: "M" }] } },
    steps: (t) => t.act("me", { type: "endTurn" }),
    expect: oppStart(),
})
scenario({
    name: "kei-Lv2-エンドステップの効果はLv3だけ",
    start: { interactive: true, me: { burst: BURST_P048, spirits: [{ card: KEI, label: "ケイ", cores: 2 }, { card: METAL, label: "M" }] } },
    steps: (t) => t.act("me", { type: "endTurn" }),
    expect: oppStart(),
})

console.log("=== 追加の場面 ===")
// 古の魔王城 Lv2：自分の合体スピリットが疲労したとき1ドロー（ショゴルス＝合体条件コスト3以上・効果の記述なし）
const SHOGORS = "BS12-059"
scenario({
    name: "castle-Lv2-合体スピリットがアタックで疲労すると1ドロー",
    start: { me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: METAL, label: "M" }, { card: SHOGORS, label: "ブレイヴ", cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("M") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("M") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.M.疲労: false → true", "自分.M.BP: 3000 → 8000", "自分.M.Lv: 1 → 2", "自分.M.コア: 1 → 3", "自分.ブレイヴ.場所: フィールド → 合体", "自分.ブレイヴ.コア: 2 → 0", "自分.ブレイヴ.BP: 4000 → なし",
        "自分.手札: なし → ロクケラトプス", "自分.デッキ枚数: 40 → 39", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"],
})
scenario({
    name: "castle-Lv2-合体していないスピリットが疲労してもドローしない",
    start: { me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: METAL, label: "M" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("M") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.M.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
// 古の魔王城が使えない場面：相手のバースト効果（Q23567）・相手の【連鎖】の部分（Q23568）
scenario({
    name: "castle-相手のバーストの効果では1体に絞れず、自分の2体とも破壊される",
    start: { interactive: true, me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: WHITE, label: "A" }, { card: RED, label: "B" }] },
        opp: { reserve: 0, burst: BURST_P048 } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("A") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        confirm(t, "opp", true)
    },
    expect: ["自分.A.場所: フィールド → なし", "自分.B.場所: フィールド → なし", "自分.リザーブ: 10 → 12", "自分.トラッシュ: なし → バーサーカー・ガン、ロクケラトプス",
        "相手.ライフ: 5 → 4", "相手.リザーブ: 0 → 1", "相手.バースト: 武威煌炎刃 → なし", "相手.トラッシュ: なし → 武威煌炎刃"],
})
scenario({
    name: "castle-相手の【連鎖】の部分では1体に絞れず、自分の2体とも疲労する",
    start: { turn: "opp", interactive: true, me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: WHITE, label: "A" }, { card: RED, label: "B" }] },
        opp: { hand: ["BS20-083"], spirits: [{ card: GREEN, label: "緑" }] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        const pc = t.state.pendingChoice
        if (pc && pc.kind === "option" && pc.options) t.act("opp", { type: "resolveChoice", option: pc.options.find((o) => o.includes("2体")) ?? pc.options[pc.options.length - 1] ?? "" })
    },
    expect: ["自分.A.疲労: false → true", "自分.B.疲労: false → true", "相手.手札: コールオブディープ → なし", "相手.トラッシュ: なし → コールオブディープ",
        "相手.リザーブ: 10 → 7", "相手.トラッシュのコア: 0 → 3"],
})
// ケイ Lv3 エンドステップ：ターン1回。次のターンのエンドステップにはまた出る（1体のまま）
scenario({
    name: "kei-Lv3-次のターンのエンドステップにもう一度発動できる",
    start: { interactive: true,
        me: { reserve: 0, burst: BURST_P048, hand: [BURST_P048], spirits: [{ card: KEI, label: "ケイ", cores: 3 }, { card: METAL, label: "M" }, { card: METAL, label: "M2" }] },
        opp: { spirits: [{ card: RED, label: "R" }, { card: WHITE, label: "W" }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
        confirm(t, "me", true)
        answer(t, "me", "M")
        confirm(t, "me", true)
        payIfAsked(t, "me")
        t.act("opp", { type: "endTurn" })
        t.act("me", { type: "setBurst", handIndex: 0 })
        t.act("me", { type: "endTurn" })
        confirm(t, "me", true)
        answer(t, "me", "M2")
        confirm(t, "me", true)
        payIfAsked(t, "me")
    },
    expect: ["自分.M.場所: フィールド → なし", "自分.M2.場所: フィールド → なし", "自分.リザーブ: 0 → 1", "自分.トラッシュのコア: 0 → 2", "自分.デッキ枚数: 40 → 41", "自分.手札: 武威煌炎刃 → ロクケラトプス",
        "自分.バースト: 武威煌炎刃 → なし", "自分.トラッシュ: なし → 武威煌炎刃、武威煌炎刃", "相手.R.場所: フィールド → なし", "相手.W.場所: フィールド → なし",
        "相手.リザーブ: 10 → 14", "相手.デッキ枚数: 40 → 38", "相手.手札: なし → ロクケラトプス、ロクケラトプス", "相手.トラッシュ: なし → バーサーカー・ガン、ロクケラトプス"],
})
// Q18941：合体したスピリットを戻すなら、ホスト＋ブレイヴの合計コスト以下のバーストを発動できる（烈光閃刃はコスト4。メタルバーン単体はコスト3で届かない）
const combinedKei = (combine: boolean) => ({ interactive: true,
    me: { reserve: 0, burst: BURST_BS14, spirits: [{ card: KEI, label: "ケイ", cores: 3 }, { card: METAL, label: "M" }, ...(combine ? [{ card: SHOGORS, label: "ブレイヴ", cores: 2 }] : [])] },
    opp: { spirits: [{ card: RED, label: "R" }, { card: WHITE, label: "W" }] } })
scenario({
    name: "kei-Lv3-合体したスピリットは合計コスト6として戻せ、コスト4のバーストを発動できる",
    start: combinedKei(true),
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("M") })
        t.act("me", { type: "endTurn" })
        confirm(t, "me", true)
        answer(t, "me", "M")
        confirm(t, "me", true)
        payIfAsked(t, "me")
    },
    expect: ["自分.M.場所: フィールド → なし", "自分.ブレイヴ.場所: フィールド → なし", "自分.デッキ枚数: 40 → 42", "自分.バースト: 烈光閃刃 → なし",
        "自分.トラッシュ: なし → 烈光閃刃", "自分.リザーブ: 0 → 3", "相手.R.場所: フィールド → なし", "相手.W.場所: フィールド → なし", "相手.リザーブ: 10 → 13",
        "相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス", "相手.トラッシュ: なし → バーサーカー・ガン、ロクケラトプス"],
})
scenario({
    name: "kei-Lv3-合体していないメタルバーン（コスト3）ではコスト4のバーストに届かず戻せない",
    start: combinedKei(false),
    steps(t) {
        t.act("me", { type: "endTurn" })
        confirm(t, "me", true)
        t.actRejected("me", { type: "resolveChoice", instanceId: t.id("M") })
    },
    expect: [],
})

console.log("すべてのチェックに合格しました 🎉（part976）")
