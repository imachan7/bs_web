// smoke パート659（BS18 白の場面テスト：効果文だけから先に書いた期待値）
//
// 実装役は本ファイルを変更せずに通すこと。解釈が割れる場面は書いていない（報告の質問欄）。
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"
import { assert, effectiveBp, getCard } from "./helpers"

// ── 前提: カードの機械確認（名前・種別・色・コスト） ──
const CARDS: [string, string, string, string, number][] = [
    ["BS18-028", "メイエリア", "spirit", "white", 1],
    ["BS18-029", "バット・ホリディ", "spirit", "white", 3],
    ["BS18-030", "ワイルド・ホーン", "spirit", "white", 3],
    ["BS18-031", "ジェロニモンド", "spirit", "white", 4],
    ["BS18-032", "アルマジドラゴン", "spirit", "white", 4],
    ["BS18-033", "アウトロー・キッド", "spirit", "white", 5],
    ["BS18-034", "シェリフ・イーグル", "spirit", "white", 6],
    ["BS18-035", "バッファロング・ビル", "spirit", "white", 7],
    ["BS18-036", "聖地の巨獣ベルロック", "spirit", "white", 8],
    ["BS18-058", "ガン・ホース", "brave", "white", 6],
    ["BS18-067", "巨獣の森", "nexus", "white", 4],
    ["BS18-068", "O.K.コラル", "nexus", "white", 4],
    ["BS18-079", "ウィンドスポウト", "magic", "white", 3],
    ["BS18-080", "キズナブレード", "magic", "white", 5],
    ["BS18-X04", "爆氷の覇王ロード・ドラゴン・グレイザー", "spirit", "white", 8],
    ["X012D", "英雄皇ロード・ドラゴン・ドミニオン", "spirit", "white", 6],
    ["BS02-046", "ウィンガル", "spirit", "white", 6],
    ["BS07-035", "鋼翼魚オルカノン", "spirit", "white", 6],
    ["BS01-002", "ロクケラトプス", "spirit", "red", 1],
    ["BS01-005", "アイバーン", "spirit", "red", 2],
    ["BS01-008", "メタルバーン", "spirit", "red", 3],
    ["BS01-001", "ゴラドン", "spirit", "red", 0],
    ["BS04-009", "炎皇クジャラク", "spirit", "red", 6],
    ["BS07-029", "キグナ・スワン", "spirit", "white", 1],
    ["BS10-031", "ジャンガリー", "spirit", "white", 1],
    ["BS03-042", "海獣ジューゴン", "spirit", "white", 4],
    ["BS01-084", "ガトリングスタンド", "spirit", "white", 3],
    ["BS10-038", "黒槍機ボルヴェルグ", "spirit", "white", 6],
    ["BS01-061", "エイプウィップ", "spirit", "green", 4],
    ["BS03-073", "ストン・スタチュー", "spirit", "blue", 1],
    ["BS01-146", "ドリームリボン", "magic", "white", 4],
    ["BS01-134", "バインディングソーン", "magic", "green", 2],
    ["BS01-050", "ビートビートル", "spirit", "green", 0],
    ["BS17-078", "ウォークライ", "magic", "green", 4],
    ["BS01-098", "燃えさかる戦場", "nexus", "red", 3],
    ["BS02-076", "太古の断層", "nexus", "red", 3],
]
for (const [id, name, type, color, cost] of CARDS) {
    const c = getCard(id)
    assert(c.name === name && c.type === type && c.colors[0] === color && c.cost === cost, `前提: ${id} は ${name}（${type}・${color}・コスト${cost}）`)
}

const C029 = "BS18-029", C030 = "BS18-030", C031 = "BS18-031", C032 = "BS18-032", C033 = "BS18-033", C034 = "BS18-034"
const C035 = "BS18-035", C036 = "BS18-036", C058 = "BS18-058", C067 = "BS18-067", C068 = "BS18-068", C079 = "BS18-079", C080 = "BS18-080"
const X04 = "BS18-X04"
const X012D = "X012D"
const ROKE = "BS01-002", AIB = "BS01-005", METAL = "BS01-008", GORA = "BS01-001", KUJ = "BS04-009"
const SWAN = "BS07-029", JANG = "BS10-031", JUGON = "BS03-042", GATLING = "BS01-084", VOLV = "BS10-038"
const EIP = "BS01-061", STONE = "BS03-073", RIBBON = "BS01-146", THORN = "BS01-134", BEETLE = "BS01-050", WARCRY = "BS17-078"
const WINGAL = "BS02-046", ORCA = "BS07-035"
const N_BATTLE = "BS01-098", N_FAULT = "BS02-076"

// ── 期待値を書くための小道具 ──
const nm = (...xs: string[]) => (xs.length ? [...xs].sort().join("、") : "なし")
const appear = (who: string, label: string, o: { cores?: number; lv?: number; bp: number; rested?: boolean }) => [
    `${who}.${label}.場所: なし → フィールド`,
    `${who}.${label}.疲労: なし → ${o.rested ?? false}`,
    `${who}.${label}.コア: なし → ${o.cores ?? 1}`,
    `${who}.${label}.Lv: なし → ${o.lv ?? 1}`,
    `${who}.${label}.BP: なし → ${o.bp}`,
]
const gone = (who: string, label: string) => `${who}.${label}.場所: フィールド → なし`
// 相手ターンの開始（ドロー1枚＝バニラ、コアステップ+1）
const turnStart = (who: string, hand: string[] = [], reserve = 10, deck = 40) => [
    `${who}.手札: ${nm(...hand)} → ${nm(...hand, "ロクケラトプス")}`,
    `${who}.デッキ枚数: ${deck} → ${deck - 1}`,
    `${who}.リザーブ: ${reserve} → ${reserve + 1}`,
]

// 選択待ちを順に答える。picks: ラベル／"SKIP"（選ばない・確定）／"YES"／"NO"／"CARD:n"。
// 確認（kind:option）は既定で「発動する」系を承認する
function settle(t: ScenarioCtx, picks: string[] = []): void {
    const rest = [...picks]
    for (let guard = 0; guard < 16 && t.state.pendingChoice; guard++) {
        const pc = t.state.pendingChoice
        const who = pc.pid === t.me ? "me" : "opp"
        const next = rest[0]
        if (pc.kind === "option") {
            if (next === "NO") {
                rest.shift()
                t.act(who, { type: "resolveChoice" })
            } else {
                if (next === "YES") rest.shift()
                const opt = (pc.options ?? []).find((o) => o.includes("発動する")) ?? (pc.options ?? [])[0]
                t.act(who, opt === undefined ? { type: "resolveChoice" } : { type: "resolveChoice", option: opt })
            }
        } else if (pc.kind === "target") {
            rest.shift()
            if (next === "SKIP" || (next === undefined && pc.optional)) t.act(who, { type: "resolveChoice" })
            else if (next === undefined) t.act(who, { type: "resolveChoice", instanceId: pc.candidates[0]! })
            else t.act(who, { type: "resolveChoice", instanceId: t.id(next) })
        } else {
            rest.shift()
            const idx = next?.startsWith("CARD:") ? Number(next.slice(5)) : (pc.cardIndices ?? [])[0]
            if (next === "SKIP" || idx === undefined) t.act(who, { type: "resolveChoice" })
            else t.act(who, { type: "resolveChoice", cardIndex: idx })
        }
    }
}
const oppAttack = (t: ScenarioCtx, label: string) => {
    t.act("opp", { type: "attack", instanceId: t.id(label) })
    t.closeFlash()
}
const meAttack = (t: ScenarioCtx, label: string) => {
    t.act("me", { type: "attack", instanceId: t.id(label) })
    t.closeFlash()
}
const meBlock = (t: ScenarioCtx, label: string) => {
    t.act("me", { type: "block", instanceId: t.id(label) })
}
const oppBlock = (t: ScenarioCtx, label: string) => {
    t.act("opp", { type: "block", instanceId: t.id(label) })
}
// フラッシュの優先権が自分に来るまで相手がパスする
const meHasPriority = (t: ScenarioCtx) => {
    if (t.state.priorityPlayer !== t.me) t.act("opp", { type: "pass" })
}

// ═══ BS18-028 メイエリア：効果文なし（バニラ）。場面なし ═══

// ═══ BS18-029 バット・ホリディ ═══
// 節1：Lv1･2･3『自分のアタックステップ』アタックできない
scenario({
    name: "029 自分のアタックステップではどのLvでもアタックできない",
    start: { phase: "attack", me: { spirits: [{ card: C029, label: "Lv1", cores: 1 }, { card: C029, label: "Lv2", cores: 2 }, { card: C029, label: "Lv3", cores: 5 }, { card: ROKE, label: "仲間" }] } },
    steps(t) {
        for (const l of ["Lv1", "Lv2", "Lv3"]) t.actRejected("me", { type: "attack", instanceId: t.id(l) })
        meAttack(t, "仲間") // ほかのスピリットは影響なし
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.仲間.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
// 節2：Lv2･3『相手のアタックステップ』相手は可能ならターンに1回以上アタック
scenario({
    name: "029 Lv2：相手はアタックできるのにアタックせずターンを終えられない",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: C029, cores: 2 }] }, opp: { spirits: [{ card: ROKE, label: "A" }, { card: AIB, label: "B" }] } },
    steps(t) {
        t.actRejected("opp", { type: "endTurn" })
    },
    expect: [],
})
scenario({
    name: "029 Lv2：1回アタックすればそれ以上は強制されない（プレイヤー単位）",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: C029, cores: 2 }] }, opp: { spirits: [{ card: ROKE, label: "A" }, { card: AIB, label: "B" }] } },
    steps(t) {
        oppAttack(t, "相手.A")
        t.act("me", { type: "takeLife" })
        t.act("opp", { type: "endTurn" })
    },
    expect: ["相手.A.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 12", "自分.手札: なし → ロクケラトプス", "自分.デッキ枚数: 40 → 39"],
})
scenario({
    name: "029 Lv2：アタックできるスピリットがいなければターンを終えられる",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: C029, cores: 2 }] }, opp: { spirits: [{ card: ROKE, label: "A", rested: true }] } },
    steps(t) {
        t.act("opp", { type: "endTurn" })
    },
    expect: [...turnStart("自分")],
})
scenario({
    name: "029 Lv1：相手はアタックしなくてもターンを終えられる",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: C029, cores: 1 }] }, opp: { spirits: [{ card: ROKE, label: "A" }] } },
    steps(t) {
        t.act("opp", { type: "endTurn" })
    },
    expect: [...turnStart("自分")],
})
scenario({
    name: "029 Lv2でも自分のターンは強制されない（相手側の効果）",
    start: { phase: "attack", me: { spirits: [{ card: C029, cores: 2 }, { card: ROKE, label: "仲間" }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
    },
    expect: [...turnStart("相手")],
})

// ═══ BS18-030 ワイルド・ホーン ═══
// 節1：Lv1･2 ブロック時、ボイドからコア1個を自分のスピリットに置く
scenario({
    name: "030 Lv1：ブロック時にコアが1個増える（BPは増えない）",
    start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [{ card: C030, cores: 1 }] }, opp: { spirits: [{ card: KUJ, cores: 2 }] } },
    steps(t) {
        oppAttack(t, "相手.炎皇クジャラク")
        meBlock(t, "ワイルド・ホーン")
        settle(t, ["ワイルド・ホーン"])
        t.closeFlash()
    },
    // 3000 対 5000 で負ける。増えたコア2個がリザーブへ戻る
    expect: [gone("自分", "ワイルド・ホーン"), "自分.トラッシュ: なし → ワイルド・ホーン", "自分.リザーブ: 10 → 12", "相手.炎皇クジャラク.疲労: false → true"],
})
// 節2：Lv2 ブロック時、系統「機獣」を持つ自分のスピリット1体につき（自身を含む）BP+1000
scenario({
    name: "030 Lv2：機獣の数だけBP+1000（自身とスワンで+2000）。コアも1個増える",
    start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [{ card: C030, cores: 3 }, { card: SWAN }] }, opp: { spirits: [{ card: KUJ, cores: 3 }] } },
    steps(t) {
        oppAttack(t, "相手.炎皇クジャラク")
        meBlock(t, "ワイルド・ホーン")
        settle(t, ["ワイルド・ホーン"])
        t.closeFlash()
    },
    // 4000+2000=6000 対 6000 で相打ち
    expect: [
        gone("自分", "ワイルド・ホーン"),
        "自分.トラッシュ: なし → ワイルド・ホーン",
        "自分.リザーブ: 10 → 14",
        gone("相手", "炎皇クジャラク"),
        "相手.トラッシュ: なし → 炎皇クジャラク",
        "相手.リザーブ: 10 → 13",
    ],
})
scenario({
    name: "030 Lv2：機獣が自身だけならBP+1000（5000対5000で相打ち）",
    start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [{ card: C030, cores: 3 }] }, opp: { spirits: [{ card: KUJ, cores: 2 }] } },
    steps(t) {
        oppAttack(t, "相手.炎皇クジャラク")
        meBlock(t, "ワイルド・ホーン")
        settle(t, ["ワイルド・ホーン"])
        t.closeFlash()
    },
    // 4000+1000=5000 対 5000 で相打ち
    expect: [
        gone("自分", "ワイルド・ホーン"),
        "自分.トラッシュ: なし → ワイルド・ホーン",
        "自分.リザーブ: 10 → 14",
        gone("相手", "炎皇クジャラク"),
        "相手.トラッシュ: なし → 炎皇クジャラク",
        "相手.リザーブ: 10 → 12",
    ],
})

// ═══ BS18-031 ジェロニモンド ═══
// 節1：お互いのデッキは破棄されない
scenario({
    name: "031 相手の効果でも自分のデッキは破棄されない",
    start: { turn: "opp", me: { spirits: [{ card: C031, cores: 1 }] }, opp: { hand: [STONE] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: ["相手.手札: ストン・スタチュー → なし", "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 1", ...appear("相手", "ストン・スタチュー", { bp: 2000 })],
})
scenario({
    name: "031 自分の効果でも相手のデッキは破棄されない",
    start: { me: { hand: [STONE], spirits: [{ card: C031, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: ["自分.手札: ストン・スタチュー → なし", "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 1", ...appear("自分", "ストン・スタチュー", { bp: 2000 })],
})
scenario({
    name: "031 対照：ジェロニモンドがいなければ破棄される",
    start: { turn: "opp", opp: { hand: [STONE] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: ["相手.手札: ストン・スタチュー → なし", "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 1", ...appear("相手", "ストン・スタチュー", { bp: 2000 }), "自分.デッキ枚数: 40 → 39", "自分.トラッシュ: なし → ロクケラトプス"],
})
// 節2：【重装甲：赤/白】相手の赤/白のスピリット/ブレイヴ/ネクサス/マジックの効果を受けない
scenario({
    name: "031 Lv1：相手の白マジックの対象にできない。Lv1では仲間にも重装甲は付かない",
    start: { turn: "opp", me: { spirits: [{ card: C031, cores: 1 }, { card: SWAN }] }, opp: { hand: [RIBBON] } },
    steps(t) {
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ジェロニモンド") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("キグナ・スワン") })
    },
    expect: [
        "相手.手札: ドリームリボン → なし",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 4",
        "相手.トラッシュ: なし → ドリームリボン",
        gone("自分", "キグナ・スワン"),
        "自分.手札: なし → キグナ・スワン",
        "自分.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "031 緑の効果は受ける（赤/白だけが対象）",
    start: { turn: "opp", me: { spirits: [{ card: C031, cores: 1 }] }, opp: { hand: [THORN] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ジェロニモンド") })
    },
    expect: ["相手.手札: バインディングソーン → なし", "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 2", "相手.トラッシュ: なし → バインディングソーン", "自分.ジェロニモンド.疲労: false → true"],
})
// 節3：Lv2 自分の合体していないスピリットすべてに【重装甲：赤/白】を与える
scenario({
    name: "031 Lv2：仲間のスピリットにも重装甲が付き、相手の白マジックの対象にできない",
    start: { turn: "opp", me: { spirits: [{ card: C031, cores: 3 }, { card: SWAN }] }, opp: { hand: [RIBBON] } },
    steps(t) {
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("キグナ・スワン") })
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ジェロニモンド") })
    },
    expect: [],
})
scenario({
    name: "031 Lv2：ジェロニモンドがいなくなれば仲間の重装甲も消える",
    start: { turn: "opp", me: { spirits: [{ card: SWAN }] }, opp: { hand: [RIBBON] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("キグナ・スワン") })
    },
    expect: ["相手.手札: ドリームリボン → なし", "相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 4", "相手.トラッシュ: なし → ドリームリボン", gone("自分", "キグナ・スワン"), "自分.手札: なし → キグナ・スワン", "自分.リザーブ: 10 → 11"],
})

// ═══ BS18-032 アルマジドラゴン ═══
// 節1：赤のスピリットとしても扱う（赤のシンボルが召喚コストを1軽減する）
scenario({
    name: "032 赤としても扱うので、赤のスピリットの召喚コストが1軽減される",
    start: { me: { hand: [AIB], spirits: [{ card: C032, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    // コスト2-1=1 とLv1のコア1個
    expect: ["自分.手札: アイバーン → なし", "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 1", ...appear("自分", "アイバーン", { bp: 2000 })],
})
scenario({
    name: "032 対照：白だけのスピリットでは赤のコストは軽減されない",
    start: { me: { hand: [AIB], spirits: [{ card: GATLING, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: ["自分.手札: アイバーン → なし", "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 2", ...appear("自分", "アイバーン", { bp: 2000 })],
})
// 節2：Lv2 アタック時 BP+2000
scenario({
    name: "032 Lv2：アタック時にBP+2000",
    start: { phase: "attack", me: { spirits: [{ card: C032, cores: 2 }] } },
    steps(t) {
        meAttack(t, "アルマジドラゴン")
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.アルマジドラゴン.疲労: false → true", "自分.アルマジドラゴン.BP: 4000 → 6000", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "032 Lv1：アタック時にBPは増えない",
    start: { phase: "attack", me: { spirits: [{ card: C032, cores: 1 }] } },
    steps(t) {
        meAttack(t, "アルマジドラゴン")
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.アルマジドラゴン.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
// 節3：Lv3 ブロック時 BP+2000
scenario({
    name: "032 Lv3：ブロック時にBP+2000（5000→7000で6000を倒す）",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: C032, cores: 3 }] }, opp: { spirits: [{ card: KUJ, cores: 3 }] } },
    steps(t) {
        oppAttack(t, "相手.炎皇クジャラク")
        meBlock(t, "アルマジドラゴン")
        t.closeFlash()
    },
    expect: ["自分.アルマジドラゴン.疲労: false → true", "自分.アルマジドラゴン.BP: 5000 → 7000", gone("相手", "炎皇クジャラク"), "相手.トラッシュ: なし → 炎皇クジャラク", "相手.リザーブ: 10 → 13"],
})
scenario({
    name: "032 Lv2：ブロック時のBP増加は無い（4000で5000に負ける）",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: C032, cores: 2 }] }, opp: { spirits: [{ card: KUJ, cores: 2 }] } },
    steps(t) {
        oppAttack(t, "相手.炎皇クジャラク")
        meBlock(t, "アルマジドラゴン")
        t.closeFlash()
    },
    expect: [gone("自分", "アルマジドラゴン"), "自分.トラッシュ: なし → アルマジドラゴン", "自分.リザーブ: 10 → 12", "相手.炎皇クジャラク.疲労: false → true"],
})

// ═══ BS18-033 アウトロー・キッド ═══
// Lv2『相手のスタートステップ』疲労状態の相手のスピリット2体まで → 次のリフレッシュで回復できない
scenario({
    name: "033 Lv2：指定した2体は次の相手のリフレッシュで回復せず、指定しなかった1体は回復する",
    start: {
        phase: "main",
        interactive: true,
        me: { spirits: [{ card: C033, cores: 3 }] },
        opp: { spirits: [{ card: AIB, label: "A", rested: true }, { card: METAL, label: "B", rested: true }, { card: GORA, label: "C", rested: true }, { card: ROKE, label: "D" }] },
    },
    steps(t) {
        t.act("me", { type: "endTurn" })
        const pc = t.state.pendingChoice
        assert(pc !== null && pc.pid === t.me, "033: 自分が指定の選択を求められる")
        assert(!pc!.candidates.includes(t.id("相手.D")), "033: 回復状態のDは指定の候補に出ない")
        settle(t, ["相手.A", "相手.B", "SKIP"])
    },
    expect: ["相手.C.疲労: true → false", ...turnStart("相手")],
})
scenario({
    name: "033 Lv1：効果は無く、疲労した相手のスピリットはすべて回復する",
    start: { me: { spirits: [{ card: C033, cores: 1 }] }, opp: { spirits: [{ card: AIB, label: "A", rested: true }, { card: METAL, label: "B", rested: true }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
    },
    expect: ["相手.A.疲労: true → false", "相手.B.疲労: true → false", ...turnStart("相手")],
})

// ═══ BS18-034 シェリフ・イーグル ═══
// 節1：【バースト：相手による自分のスピリット破壊後】機獣が破壊されていたら召喚する
scenario({
    name: "034 バースト：相手に自分の機獣を破壊されたら召喚される",
    start: { turn: "opp", phase: "attack", interactive: true, me: { burst: C034, spirits: [{ card: SWAN }] }, opp: { spirits: [{ card: KUJ, cores: 2 }] } },
    steps(t) {
        oppAttack(t, "相手.炎皇クジャラク")
        meBlock(t, "キグナ・スワン")
        t.closeFlash()
        settle(t)
    },
    // 破壊されたスワンのコア1個が戻り、召喚のLv1コア1個を置く
    expect: [
        gone("自分", "キグナ・スワン"),
        "自分.トラッシュ: なし → キグナ・スワン",
        "自分.バースト: シェリフ・イーグル → なし",
        ...appear("自分", "シェリフ・イーグル", { bp: 4000 }),
        "相手.炎皇クジャラク.疲労: false → true",
    ],
})
scenario({
    name: "034 バースト：相手の機獣が自分に破壊されても発動しない（自分のスピリットではない）",
    start: { phase: "attack", me: { burst: C034, spirits: [{ card: KUJ, cores: 2 }] }, opp: { spirits: [{ card: SWAN }] } },
    steps(t) {
        meAttack(t, "炎皇クジャラク")
        oppBlock(t, "相手.キグナ・スワン")
        t.closeFlash()
    },
    expect: ["自分.炎皇クジャラク.疲労: false → true", gone("相手", "キグナ・スワン"), "相手.トラッシュ: なし → キグナ・スワン", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "034 バースト：破壊されたのが機獣でなければ、発動はできるが召喚は起きずカードはトラッシュへ（BURST.md）",
    start: { turn: "opp", phase: "attack", interactive: true, me: { burst: C034, spirits: [{ card: ROKE }] }, opp: { spirits: [{ card: KUJ, cores: 2 }] } },
    steps(t) {
        oppAttack(t, "相手.炎皇クジャラク")
        meBlock(t, "ロクケラトプス")
        t.closeFlash()
        settle(t)
    },
    expect: [
        gone("自分", "ロクケラトプス"),
        `自分.トラッシュ: なし → ${nm("ロクケラトプス", "シェリフ・イーグル")}`,
        "自分.バースト: シェリフ・イーグル → なし",
        "自分.リザーブ: 10 → 11",
        "相手.炎皇クジャラク.疲労: false → true",
    ],
})
// 節2：Lv2 フラッシュ『ブロック時』このスピリットのコア1個を自分のトラッシュに置くことで、バトル相手のコア1個を相手のリザーブへ
scenario({
    name: "034 Lv2：コア1個を払い、バトルしている相手のコア1個を相手のリザーブへ置く",
    start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [{ card: C034, cores: 3 }] }, opp: { spirits: [{ card: KUJ, cores: 3 }] } },
    steps(t) {
        oppAttack(t, "相手.炎皇クジャラク")
        meBlock(t, "シェリフ・イーグル")
        settle(t)
        t.closeFlash()
    },
    // 自分のコア3→2（Lv2・BP7000のまま）。相手は3→2（Lv1・BP5000）で7000に負け、破壊される
    expect: [
        "自分.シェリフ・イーグル.疲労: false → true",
        "自分.シェリフ・イーグル.コア: 3 → 2",
        "自分.トラッシュのコア: 0 → 1",
        gone("相手", "炎皇クジャラク"),
        "相手.トラッシュ: なし → 炎皇クジャラク",
        "相手.リザーブ: 10 → 13",
    ],
})

// ═══ BS18-035 バッファロング・ビル ═══
// 節1：コスト6以上の相手のスピリットは、アタックするときこのスピリットを指定してアタックしなければならない
scenario({
    name: "035 コスト6以上の相手のスピリットは、ライフ狙いのアタックができない。コスト5以下は従来どおり",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: C035, cores: 1 }] }, opp: { spirits: [{ card: KUJ, cores: 2 }, { card: ROKE }] } },
    steps(t) {
        t.actRejected("opp", { type: "attack", instanceId: t.id("相手.炎皇クジャラク") })
        oppAttack(t, "相手.ロクケラトプス")
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.ロクケラトプス.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "035 コスト6以上が035を指定してアタックでき、035がブロックすればBP+10000（Lv2）",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: C035, cores: 2 }] }, opp: { spirits: [{ card: KUJ, cores: 2 }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.炎皇クジャラク"), targetSpiritInstanceId: t.id("バッファロング・ビル") })
        t.closeFlash()
        meBlock(t, "バッファロング・ビル")
        t.closeFlash()
    },
    // 6000+10000=16000 が 5000 を破壊
    expect: [
        "自分.バッファロング・ビル.疲労: false → true",
        "自分.バッファロング・ビル.BP: 6000 → 16000",
        gone("相手", "炎皇クジャラク"),
        "相手.トラッシュ: なし → 炎皇クジャラク",
        "相手.リザーブ: 10 → 12",
    ],
})
scenario({
    name: "035 Lv2：コスト5以下のスピリットをブロックしてもBPは上がらない",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: C035, cores: 2 }] }, opp: { spirits: [{ card: ROKE }] } },
    steps(t) {
        oppAttack(t, "相手.ロクケラトプス")
        meBlock(t, "バッファロング・ビル")
        t.closeFlash()
    },
    expect: ["自分.バッファロング・ビル.疲労: false → true", gone("相手", "ロクケラトプス"), "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "035 疲労状態の035でも指定してアタックできる",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: C035, cores: 1, rested: true }] }, opp: { spirits: [{ card: KUJ, cores: 2 }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.炎皇クジャラク"), targetSpiritInstanceId: t.id("バッファロング・ビル") })
        t.closeFlash()
    },
    // 5000 対 5000 で相打ち
    expect: [gone("自分", "バッファロング・ビル"), "自分.トラッシュ: なし → バッファロング・ビル", "自分.リザーブ: 10 → 11", gone("相手", "炎皇クジャラク"), "相手.トラッシュ: なし → 炎皇クジャラク", "相手.リザーブ: 10 → 12"],
})

// ═══ BS18-036 聖地の巨獣ベルロック ═══
scenario({
    name: "036 ブロック時に相手のスピリット2体を手札に戻す（3体のうち選んだ2体だけ）",
    start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [{ card: C036, cores: 1 }] }, opp: { spirits: [{ card: ROKE }, { card: SWAN }, { card: JANG }] } },
    steps(t) {
        oppAttack(t, "相手.ロクケラトプス")
        meBlock(t, "聖地の巨獣ベルロック")
        settle(t, ["相手.ロクケラトプス", "相手.キグナ・スワン"])
        t.closeFlash()
    },
    expect: [
        "自分.聖地の巨獣ベルロック.疲労: false → true",
        gone("相手", "ロクケラトプス"),
        gone("相手", "キグナ・スワン"),
        `相手.手札: なし → ${nm("ロクケラトプス", "キグナ・スワン")}`,
        "相手.リザーブ: 10 → 12",
    ],
})
scenario({
    name: "036 相手のスピリットが1体だけならその1体を戻す",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: C036, cores: 1 }] }, opp: { spirits: [{ card: ROKE }] } },
    steps(t) {
        oppAttack(t, "相手.ロクケラトプス")
        meBlock(t, "聖地の巨獣ベルロック")
        t.closeFlash()
    },
    expect: ["自分.聖地の巨獣ベルロック.疲労: false → true", gone("相手", "ロクケラトプス"), "相手.手札: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})

// ═══ BS18-058 ガン・ホース ═══
// 節1：召喚時、相手のネクサス1つを手札に戻す（自分のネクサスは対象外）
scenario({
    name: "058 召喚時に相手のネクサスを手札に戻す。自分のネクサスはそのまま",
    start: { me: { hand: [C058], nexuses: [{ card: N_FAULT }] }, opp: { nexuses: [{ card: N_BATTLE }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ガン・ホース → なし",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        ...appear("自分", "ガン・ホース", { bp: 3000 }),
        "相手.燃えさかる戦場.場所: ネクサス → なし",
        "相手.手札: なし → 燃えさかる戦場",
        "相手.リザーブ: 10 → 11",
    ],
})

// 節2：合体条件コスト6以上。【合体時】『相手のアタックステップ』【転召】を持たない相手のスピリットを疲労状態でブロックできる
// 合体で、ブレイヴのコアはホストの上へ移る（BRAVE.md）。ホストはコア2でLv2、ブレイヴ分のBP+3000
const combineLines = ["自分.ガン・ホース.場所: フィールド → 合体", "自分.ガン・ホース.コア: 1 → 0", "自分.ウィンガル.コア: 1 → 2", "自分.ウィンガル.Lv: 1 → 2", "自分.ウィンガル.BP: 5000 → 9000"]
const combineStart = (oppSpirit: string) => ({
    me: { spirits: [{ card: WINGAL, rested: true }, { card: C058 }] },
    opp: { spirits: [{ card: oppSpirit, label: "A" }] },
})
const combineAndPass = (t: ScenarioCtx) => {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("ガン・ホース"), hostInstanceId: t.id("ウィンガル") })
    t.act("me", { type: "endTurn" })
    t.act("opp", { type: "nextPhase" })
}
scenario({
    name: "058 合体時：疲労状態の合体スピリットで、転召を持たない相手のスピリットをブロックできる",
    start: combineStart(ROKE),
    steps(t) {
        combineAndPass(t)
        oppAttack(t, "相手.A")
        meBlock(t, "ウィンガル")
        t.closeFlash()
    },
    expect: [...combineLines, ...turnStart("相手"), gone("相手", "A"), "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 12"],
})
scenario({
    name: "058 合体時でも、転召を持つ相手のスピリットは疲労状態ではブロックできない",
    start: combineStart(ORCA),
    steps(t) {
        combineAndPass(t)
        oppAttack(t, "相手.A")
        t.actRejected("me", { type: "block", instanceId: t.id("ウィンガル") })
        t.act("me", { type: "takeLife" })
    },
    expect: [...combineLines, "自分.リザーブ: 10 → 11", "自分.ライフ: 5 → 4", ...turnStart("相手"), "相手.A.疲労: false → true"],
})
scenario({
    name: "058 合体していなければ、疲労状態ではブロックできない",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: WINGAL, rested: true }, { card: C058 }] }, opp: { spirits: [{ card: ROKE, label: "A" }] } },
    steps(t) {
        oppAttack(t, "相手.A")
        t.actRejected("me", { type: "block", instanceId: t.id("ウィンガル") })
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.A.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})

// ═══ BS18-067 巨獣の森 ═══
// 節1：Lv1･2『相手のアタックステップ』巨獣/機獣の自分のスピリットがブロックしたとき、ボイドからコア1個をそのスピリットに置く
scenario({
    name: "067 巨獣がブロックしたらコアが1個増える",
    start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: C067, cores: 0 }], spirits: [{ card: JUGON }] }, opp: { spirits: [{ card: ROKE }] } },
    steps(t) {
        oppAttack(t, "相手.ロクケラトプス")
        meBlock(t, "海獣ジューゴン")
        t.closeFlash()
    },
    // コア2個でLv2（BP6000）。ロクケラトプス1000を倒す
    expect: [
        "自分.海獣ジューゴン.疲労: false → true",
        "自分.海獣ジューゴン.コア: 1 → 2",
        "自分.海獣ジューゴン.Lv: 1 → 2",
        "自分.海獣ジューゴン.BP: 3000 → 6000",
        gone("相手", "ロクケラトプス"),
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "067 機獣がブロックしたらコアが1個増える",
    start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: C067, cores: 0 }], spirits: [{ card: JANG }] }, opp: { spirits: [{ card: ROKE }] } },
    steps(t) {
        oppAttack(t, "相手.ロクケラトプス")
        meBlock(t, "ジャンガリー")
        t.closeFlash()
    },
    expect: [
        "自分.ジャンガリー.疲労: false → true",
        "自分.ジャンガリー.コア: 1 → 2",
        "自分.ジャンガリー.Lv: 1 → 2",
        "自分.ジャンガリー.BP: 2000 → 3000",
        gone("相手", "ロクケラトプス"),
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "067 巨獣でも機獣でもないスピリットがブロックしても増えない",
    start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: C067, cores: 0 }], spirits: [{ card: GATLING }] }, opp: { spirits: [{ card: ROKE }] } },
    steps(t) {
        oppAttack(t, "相手.ロクケラトプス")
        meBlock(t, "ガトリングスタンド")
        t.closeFlash()
    },
    expect: ["自分.ガトリングスタンド.疲労: false → true", gone("相手", "ロクケラトプス"), "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})
// 節2：Lv2 ステップ開始時、相手のスピリット1体を指定できる。そのスピリットはこのステップの最初に可能ならば必ずアタックする
scenario({
    name: "067 Lv2：指定したスピリットが最初にアタックしなければならない",
    start: { turn: "opp", phase: "main", interactive: true, me: { nexuses: [{ card: C067, cores: 2 }] }, opp: { spirits: [{ card: AIB, label: "A" }, { card: METAL, label: "B" }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        settle(t, ["相手.A"])
        t.actRejected("opp", { type: "attack", instanceId: t.id("相手.B") })
        oppAttack(t, "相手.A")
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.A.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "067 Lv2：指定を断れば、どのスピリットから攻撃してもよい",
    start: { turn: "opp", phase: "main", interactive: true, me: { nexuses: [{ card: C067, cores: 2 }] }, opp: { spirits: [{ card: AIB, label: "A" }, { card: METAL, label: "B" }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        settle(t, ["NO"])
        oppAttack(t, "相手.B")
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.B.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})
scenario({
    name: "067 Lv1：指定の効果は無い",
    start: { turn: "opp", phase: "main", me: { nexuses: [{ card: C067, cores: 0 }] }, opp: { spirits: [{ card: AIB, label: "A" }, { card: METAL, label: "B" }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        oppAttack(t, "相手.B")
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.B.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})

// ═══ BS18-068 O.K.コラル ═══
// 節1：コスト4以下のスピリット/ブレイヴすべての『召喚時』効果は発揮しない（お互い）
scenario({
    name: "068 コスト4以下の召喚時効果は発揮しない（自分の召喚）",
    start: { me: { hand: [EIP], nexuses: [{ card: C068, label: "コラル", cores: 0 }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    // エイプウィップの「リザーブにコア1個」が起きない
    expect: ["自分.手札: エイプウィップ → なし", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 4", ...appear("自分", "エイプウィップ", { bp: 1000 })],
})
scenario({
    name: "068 対照：コラルが無ければ召喚時効果が発揮される",
    start: { me: { hand: [EIP] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: ["自分.手札: エイプウィップ → なし", "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4", ...appear("自分", "エイプウィップ", { bp: 1000 })],
})
scenario({
    name: "068 相手の召喚でも、コスト4以下なら発揮しない",
    start: { turn: "opp", me: { nexuses: [{ card: C068, label: "コラル", cores: 0 }] }, opp: { hand: [EIP] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: ["相手.手札: エイプウィップ → なし", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4", ...appear("相手", "エイプウィップ", { bp: 1000 })],
})
scenario({
    name: "068 コスト5以上は発揮する（ボルヴェルグ：BP4000以下を手札に戻す）",
    start: { turn: "opp", me: { nexuses: [{ card: C068, label: "コラル", cores: 0 }], spirits: [{ card: ROKE }] }, opp: { hand: [VOLV] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: [
        "相手.手札: 黒槍機ボルヴェルグ → なし",
        "相手.リザーブ: 10 → 3",
        "相手.トラッシュのコア: 0 → 6",
        ...appear("相手", "黒槍機ボルヴェルグ", { bp: 5000 }),
        gone("自分", "ロクケラトプス"),
        "自分.手札: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
    ],
})
// 節2：Lv2『自分のアタックステップ』BPを比べ自分のスピリットが破壊されたとき、相手のスピリット1体を手札に戻す
scenario({
    name: "068 Lv2：BP比べで自分のスピリットが破壊されたら相手のスピリット1体を手札に戻す",
    start: { phase: "attack", me: { nexuses: [{ card: C068, label: "コラル", cores: 1 }], spirits: [{ card: ROKE }] }, opp: { spirits: [{ card: KUJ, cores: 2 }] } },
    steps(t) {
        meAttack(t, "ロクケラトプス")
        oppBlock(t, "相手.炎皇クジャラク")
        t.closeFlash()
    },
    expect: [gone("自分", "ロクケラトプス"), "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11", gone("相手", "炎皇クジャラク"), "相手.手札: なし → 炎皇クジャラク", "相手.リザーブ: 10 → 12"],
})
scenario({
    name: "068 Lv1：破壊されても相手のスピリットは戻らない",
    start: { phase: "attack", me: { nexuses: [{ card: C068, label: "コラル", cores: 0 }], spirits: [{ card: ROKE }] }, opp: { spirits: [{ card: KUJ, cores: 2 }] } },
    steps(t) {
        meAttack(t, "ロクケラトプス")
        oppBlock(t, "相手.炎皇クジャラク")
        t.closeFlash()
    },
    expect: [gone("自分", "ロクケラトプス"), "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11", "相手.炎皇クジャラク.疲労: false → true"],
})

// ═══ BS18-079 ウィンドスポウト ═══
// 【バースト：相手の『召喚時』発揮後】相手のスピリット1体を指定（このターン必ずアタック）→ その後コストを払えばフラッシュ効果
const oppEipLines = [
    "相手.手札: エイプウィップ → なし",
    "相手.リザーブ: 10 → 6",
    "相手.トラッシュのコア: 0 → 4",
    ...appear("相手", "エイプウィップ", { bp: 1000 }),
]
scenario({
    name: "079 バースト＋コストを払う：指定し、自分のスピリットを回復してBP+2000",
    start: { turn: "opp", interactive: true, me: { burst: C079, spirits: [{ card: ROKE, rested: true }] }, opp: { hand: [EIP], spirits: [{ card: AIB }] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        settle(t, ["YES", "相手.アイバーン", "YES", "ロクケラトプス"])
    },
    expect: [
        ...oppEipLines,
        "自分.バースト: ウィンドスポウト → なし",
        "自分.トラッシュ: なし → ウィンドスポウト",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.ロクケラトプス.疲労: true → false",
        "自分.ロクケラトプス.BP: 1000 → 3000",
    ],
})
scenario({
    name: "079 コストを払わなければ指定だけ。指定されたスピリットはアタックせずにターンを終えられない",
    start: { turn: "opp", interactive: true, me: { burst: C079, spirits: [{ card: ROKE, rested: true }] }, opp: { hand: [EIP], spirits: [{ card: AIB }] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        settle(t, ["YES", "相手.アイバーン", "NO"])
        t.act("opp", { type: "nextPhase" })
        t.actRejected("opp", { type: "endTurn" })
    },
    expect: [...oppEipLines, "自分.バースト: ウィンドスポウト → なし", "自分.トラッシュ: なし → ウィンドスポウト"],
})
scenario({
    name: "079 召喚時効果を持たないスピリットの召喚では発動しない",
    start: { turn: "opp", me: { burst: C079, spirits: [{ card: ROKE, rested: true }] }, opp: { hand: [GORA] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: ["相手.手札: ゴラドン → なし", "相手.リザーブ: 10 → 9", ...appear("相手", "ゴラドン", { bp: 1000 })],
})
scenario({
    name: "079 自分の召喚時効果では発動しない（相手の召喚時だけ）",
    start: { me: { hand: [EIP], burst: C079 } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: ["自分.手札: エイプウィップ → なし", "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4", ...appear("自分", "エイプウィップ", { bp: 1000 })],
})

// ═══ BS18-080 キズナブレード ═══
// フラッシュ：バトルしていない自分のスピリットを好きなだけ疲労させ、自分のスピリット1体をBP+（疲労させた分のBP合計）。メインステップでは使えない
const kizunaBattle = (bystanders: { card: string; label: string; rested?: boolean }[]) => ({
    turn: "opp" as const,
    phase: "attack" as const,
    interactive: true,
    me: { hand: [C080], spirits: [{ card: KUJ, cores: 2, label: "ブロッカー" }, ...bystanders.map((b) => (b.rested ? { card: b.card, label: b.label, rested: true } : { card: b.card, label: b.label }))] },
    opp: { spirits: [{ card: KUJ, cores: 3, label: "攻撃側" }] },
})
scenario({
    name: "080 バトルしていない2体を疲労させ、そのBP合計（1000+2000）をブロッカーに足して勝つ",
    start: kizunaBattle([{ card: ROKE, label: "R" }, { card: AIB, label: "S" }]),
    steps(t) {
        oppAttack(t, "相手.攻撃側")
        meBlock(t, "ブロッカー")
        meHasPriority(t)
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        settle(t, ["R", "S", "SKIP", "ブロッカー"])
        t.closeFlash()
    },
    // ブロッカー 5000+3000=8000 が 6000 を破壊
    expect: [
        "自分.手札: キズナブレード → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.トラッシュ: なし → キズナブレード",
        "自分.R.疲労: false → true",
        "自分.S.疲労: false → true",
        "自分.ブロッカー.疲労: false → true",
        "自分.ブロッカー.BP: 5000 → 8000",
        gone("相手", "攻撃側"),
        "相手.トラッシュ: なし → 炎皇クジャラク",
        "相手.リザーブ: 10 → 13",
    ],
})
scenario({
    name: "080 すでに疲労していたスピリットは実際には疲労しないのでBP合計に入らない（1000のみ）",
    start: kizunaBattle([{ card: ROKE, label: "R" }, { card: AIB, label: "S", rested: true }]),
    steps(t) {
        oppAttack(t, "相手.攻撃側")
        meBlock(t, "ブロッカー")
        meHasPriority(t)
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        settle(t, ["R", "S", "SKIP", "ブロッカー"])
        t.closeFlash()
    },
    // ブロッカー 5000+1000=6000 対 6000 で相打ち
    expect: [
        "自分.手札: キズナブレード → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 5",
        `自分.トラッシュ: なし → ${nm("キズナブレード", "炎皇クジャラク")}`,
        "自分.R.疲労: false → true",
        gone("自分", "ブロッカー"),
        gone("相手", "攻撃側"),
        "相手.トラッシュ: なし → 炎皇クジャラク",
        "相手.リザーブ: 10 → 13",
    ],
})
scenario({
    name: "080 メインステップでは使えない",
    start: { me: { hand: [C080], spirits: [{ card: ROKE, label: "R" }] } },
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.actRejected("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [],
})

// ═══ BS18-X04 爆氷の覇王ロード・ドラゴン・グレイザー ═══
// 節1：【バースト：自分のライフ減少後】自分の白のスピリットがいるとき召喚する
scenario({
    name: "X04 バースト：白のスピリットがいる状態でライフが減ると召喚される",
    start: { turn: "opp", phase: "attack", me: { burst: X04, spirits: [{ card: SWAN }] }, opp: { spirits: [{ card: ROKE }] } },
    steps(t) {
        oppAttack(t, "相手.ロクケラトプス")
        t.act("me", { type: "takeLife" })
        settle(t)
    },
    // 減ったライフのコア1個がリザーブへ、召喚のLv1コア1個がリザーブから出る
    expect: ["自分.ライフ: 5 → 4", "自分.バースト: 爆氷の覇王ロード・ドラゴン・グレイザー → なし", ...appear("自分", "爆氷の覇王ロード・ドラゴン・グレイザー", { bp: 6000 }), "相手.ロクケラトプス.疲労: false → true"],
})
scenario({
    name: "X04 バースト：白のスピリットがいなければ、発動はできるが召喚は起きずカードはトラッシュへ",
    start: { turn: "opp", phase: "attack", interactive: true, me: { burst: X04, spirits: [{ card: ROKE }] }, opp: { spirits: [{ card: ROKE, label: "A" }] } },
    steps(t) {
        oppAttack(t, "相手.A")
        t.act("me", { type: "takeLife" })
        settle(t)
    },
    expect: ["自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", "自分.バースト: 爆氷の覇王ロード・ドラゴン・グレイザー → なし", "自分.トラッシュ: なし → 爆氷の覇王ロード・ドラゴン・グレイザー", "相手.A.疲労: false → true"],
})
// 節2：【重装甲：∞】相手のフィールドにあるシンボルの色の効果を受けない
scenario({
    name: "X04 相手のフィールドに緑のシンボルがあれば、緑のマジックの対象にできない",
    start: { turn: "opp", me: { spirits: [{ card: X04, cores: 1 }] }, opp: { hand: [THORN], spirits: [{ card: BEETLE }] } },
    steps(t) {
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("爆氷の覇王ロード・ドラゴン・グレイザー") })
    },
    expect: [],
})
scenario({
    name: "X04 相手のフィールドに無い色（緑のシンボルが無い）のマジックは受ける",
    start: { turn: "opp", me: { spirits: [{ card: X04, cores: 1 }] }, opp: { hand: [THORN], spirits: [{ card: ROKE }] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("爆氷の覇王ロード・ドラゴン・グレイザー") })
    },
    expect: ["相手.手札: バインディングソーン → なし", "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 2", "相手.トラッシュ: なし → バインディングソーン", "自分.爆氷の覇王ロード・ドラゴン・グレイザー.疲労: false → true"],
})
scenario({
    name: "X04 相手のフィールドのシンボルが緑だけなら、白のマジックは受ける",
    start: { turn: "opp", me: { spirits: [{ card: X04, cores: 1 }] }, opp: { hand: [RIBBON], spirits: [{ card: BEETLE }] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("爆氷の覇王ロード・ドラゴン・グレイザー") })
    },
    expect: [
        "相手.手札: ドリームリボン → なし",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 4",
        "相手.トラッシュ: なし → ドリームリボン",
        gone("自分", "爆氷の覇王ロード・ドラゴン・グレイザー"),
        "自分.手札: なし → 爆氷の覇王ロード・ドラゴン・グレイザー",
        "自分.リザーブ: 10 → 11",
    ],
})
// 節3：Lv2･3『バトル時』相手のスピリットを破壊したとき、破壊したスピリット以外の同じ系統を持つ相手のスピリットすべてを手札に戻す
scenario({
    name: "X04 Lv2：破壊した機獣と同じ系統の相手のスピリットだけが手札に戻る",
    start: { phase: "attack", me: { spirits: [{ card: X04, cores: 3 }] }, opp: { spirits: [{ card: SWAN }, { card: JANG }, { card: ROKE }] } },
    steps(t) {
        meAttack(t, "爆氷の覇王ロード・ドラゴン・グレイザー")
        oppBlock(t, "相手.キグナ・スワン")
        t.closeFlash()
    },
    expect: [
        "自分.爆氷の覇王ロード・ドラゴン・グレイザー.疲労: false → true",
        gone("相手", "キグナ・スワン"),
        "相手.トラッシュ: なし → キグナ・スワン",
        gone("相手", "ジャンガリー"),
        "相手.手札: なし → ジャンガリー",
        "相手.リザーブ: 10 → 12",
    ],
})
scenario({
    name: "X04 Lv1：バトル時の効果は無く、破壊するだけ",
    start: { phase: "attack", me: { spirits: [{ card: X04, cores: 1 }] }, opp: { spirits: [{ card: SWAN }, { card: JANG }, { card: ROKE }] } },
    steps(t) {
        meAttack(t, "爆氷の覇王ロード・ドラゴン・グレイザー")
        oppBlock(t, "相手.キグナ・スワン")
        t.closeFlash()
    },
    expect: ["自分.爆氷の覇王ロード・ドラゴン・グレイザー.疲労: false → true", gone("相手", "キグナ・スワン"), "相手.トラッシュ: なし → キグナ・スワン", "相手.リザーブ: 10 → 11"],
})

// ═══ X012D 英雄皇ロード・ドラゴン・ドミニオン（赤 X012R の白版。効果文は同じ） ═══
// 節1・2：バーストで召喚 → 召喚時、手札のバースト効果を持つカード1枚をセットすることで1枚ドロー
scenario({
    name: "X012D バースト召喚→召喚時：手札のバーストカードをセットして1枚ドロー",
    start: { turn: "opp", phase: "attack", interactive: true, me: { burst: X012D, hand: [WARCRY] }, opp: { spirits: [{ card: ROKE }] } },
    steps(t) {
        oppAttack(t, "相手.ロクケラトプス")
        t.act("me", { type: "takeLife" })
        settle(t)
    },
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.バースト: 英雄皇ロード・ドラゴン・ドミニオン → ウォークライ",
        "自分.手札: ウォークライ → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        ...appear("自分", "英雄皇ロード・ドラゴン・ドミニオン", { bp: 5000 }),
        "相手.ロクケラトプス.疲労: false → true",
    ],
})
scenario({
    name: "X012D 手札にバースト効果を持つカードが無ければセットできず、ドローもしない",
    start: { turn: "opp", phase: "attack", interactive: true, me: { burst: X012D, hand: [ROKE] }, opp: { spirits: [{ card: ROKE }] } },
    steps(t) {
        oppAttack(t, "相手.ロクケラトプス")
        t.act("me", { type: "takeLife" })
        settle(t)
    },
    expect: ["自分.ライフ: 5 → 4", "自分.バースト: 英雄皇ロード・ドラゴン・ドミニオン → なし", ...appear("自分", "英雄皇ロード・ドラゴン・ドミニオン", { bp: 5000 }), "相手.ロクケラトプス.疲労: false → true"],
})
scenario({
    name: "X012D 召喚時のセットは断れる（断ればドローしない）",
    start: { turn: "opp", phase: "attack", interactive: true, me: { burst: X012D, hand: [WARCRY] }, opp: { spirits: [{ card: ROKE }] } },
    steps(t) {
        oppAttack(t, "相手.ロクケラトプス")
        t.act("me", { type: "takeLife" })
        settle(t, ["YES", "NO"])
    },
    expect: ["自分.ライフ: 5 → 4", "自分.バースト: 英雄皇ロード・ドラゴン・ドミニオン → なし", ...appear("自分", "英雄皇ロード・ドラゴン・ドミニオン", { bp: 5000 }), "相手.ロクケラトプス.疲労: false → true"],
})
// 節3：Lv3『自分のアタックステップ』自分のバーストをセットしている間 BP+3000
scenario({
    name: "X012D Lv3：自分のアタックステップでバーストをセットしている間だけBP+3000",
    start: { phase: "attack", me: { burst: WARCRY, spirits: [{ card: X012D, cores: 5, label: "セット中" }] } },
    steps(t) {
        assert(effectiveBp(t.state, t.me, t.inst("セット中")) === 13000, "X012D: バーストをセット中は 10000+3000")
    },
    expect: [],
})
scenario({
    name: "X012D Lv3：バーストをセットしていなければBPは増えない",
    start: { phase: "attack", me: { spirits: [{ card: X012D, cores: 5, label: "未セット" }] } },
    steps(t) {
        assert(effectiveBp(t.state, t.me, t.inst("未セット")) === 10000, "X012D: バーストが無ければ 10000")
    },
    expect: [],
})
scenario({
    name: "X012D Lv3：相手のアタックステップ（自分は防御側）ではBP+3000されない",
    start: { turn: "opp", phase: "attack", me: { burst: WARCRY, spirits: [{ card: X012D, cores: 5, label: "防御側" }] } },
    steps(t) {
        assert(effectiveBp(t.state, t.me, t.inst("防御側")) === 10000, "X012D: 相手のアタックステップは 10000 のまま")
    },
    expect: [],
})
scenario({
    name: "X012D Lv2：バーストをセットしていてもBP+3000されない",
    start: { phase: "attack", me: { burst: WARCRY, spirits: [{ card: X012D, cores: 3, label: "Lv2" }] } },
    steps(t) {
        assert(effectiveBp(t.state, t.me, t.inst("Lv2")) === 7000, "X012D: Lv2 は 7000 のまま")
    },
    expect: [],
})

console.log("すべてのチェックに合格しました 🎉（part659）")
