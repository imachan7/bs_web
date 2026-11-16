// smoke パート974（X13-15 マジカルハンマー／X013 黄金皇ロード・ドラゴン・インティ／X016 黒炎の覇王ダーク・ドラゴン・バゼル：期待値役が効果文だけから書いた場面テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const HAMMER = "X13-15"
const INTI = "X013"
const BAZEL = "X016"
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1 BP1000）
const METAL = "BS01-008" // メタルバーン（赤・Lv1 BP3000・8コアでLv3 BP8000）
const BEETLE = "BS01-050" // ビートビートル（緑）
const BALLOON = "BS02-074" // 風船魔人バーバル（黄・コスト6・Lv1 BP5000）
const LEO = "BS04-056" // ブレイブレス・レオ（黄・2コアでLv2 BP7000）
const LORD = "SD06-007" // 英雄龍ロード・ドラゴン（赤・ライフ減少後のバースト＝このカードを召喚・Lv1 BP4000）
const SEAMA = "SD06-010" // 海皇龍シーマ・クリーク（白・相手の召喚時発揮後のバースト＝このカードを召喚・Lv1 BP4000）
const ISSUN = "P051" // 小さな侍イッスンアントマン（緑・相手の召喚時発揮後のバースト・【神速】/【暴風】持ちを手札に戻さないと召喚できない）
const NEXUS = "BS02-085" // トパーズの流星（黄・ネクサス）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HAMMER).type === "brave" && getCard(HAMMER).name === "マジカルハンマー", "X13-15はブレイヴ")
    assert(getCard(INTI).name === "黄金皇ロード・ドラゴン・インティ" && getCard(BAZEL).name === "黒炎の覇王ダーク・ドラゴン・バゼル", "X013・X016")
    assert(getCard(LORD).name.includes("ロード・ドラゴン") && getCard(LORD).levels[0]?.bp === 4000, "SD06-007")
    assert(getCard(SEAMA).name === "海皇龍シーマ・クリーク" && getCard(ISSUN).name === "小さな侍イッスンアントマン", "SD06-010・P051")
    assert(getCard(NEXUS).type === "nexus" && getCard(LEO).levels[1]?.bp === 7000 && getCard(BALLOON).cost === 6, "脇役")
}

// 待ちに順に答える。answers[i]＝i番目の待ちに「発動する／選ぶ」(true) か見送る(false)。足りなければ最後の値。prefer＝対象選択で選ぶ個体のラベル
function settle(t: ScenarioCtx, answers: boolean | boolean[] = true, prefer?: string): void {
    const list = Array.isArray(answers) ? answers : [answers]
    for (let i = 0; i < 10 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        const yes = list[Math.min(i, list.length - 1)]
        if (!yes) t.act(side, { type: "resolveChoice" })
        else if (pc.kind === "card") t.act(side, { type: "resolveChoice", cardIndex: 0 })
        else if (pc.options?.length) t.act(side, { type: "resolveChoice", option: pc.options[0] as string })
        else if (prefer) t.act(side, { type: "resolveChoice", instanceId: t.id(prefer) })
        else t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0] as string })
    }
}

console.log("=== X13-15 合体アタック時：相手はコア1個をライフに置ける／置かれたとき自分もライフに置ける ===")
// 合体の結果（スピリット状態のブレイヴがホストに載り、コアはリザーブへ戻る。ホストのBPは+2000）
const combined = ["自分.マジカルハンマー.場所: フィールド → 合体", "自分.マジカルハンマー.コア: 1 → 0", "自分.風船魔人.BP: 5000 → 7000", "自分.風船魔人.疲労: false → true"]
const hammerStart = (oppReserve = 10) => ({
    phase: "main" as const,
    interactive: true,
    me: { spirits: [{ card: BALLOON, label: "風船魔人" }, { card: HAMMER, label: "マジカルハンマー" }] },
    opp: { reserve: oppReserve },
})
const hammerAttack = (t: ScenarioCtx, answers: boolean | boolean[]) => {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("マジカルハンマー"), hostInstanceId: t.id("風船魔人") })
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("風船魔人") })
    settle(t, answers)
}
// 起きる：相手が置き、置かれたので自分も置く
scenario({
    name: "x13-15 両方置く",
    start: hammerStart(),
    steps: (t) => hammerAttack(t, true),
    expect: [...combined, "相手.ライフ: 5 → 6", "相手.リザーブ: 10 → 9", "自分.ライフ: 5 → 6", "自分.リザーブ: 10 → 11"],
})
// 起きない：相手が置かない（Q21818）→ 自分も置けない
scenario({
    name: "x13-15 相手が置かない",
    start: hammerStart(),
    steps: (t) => hammerAttack(t, false),
    expect: [...combined, "自分.リザーブ: 10 → 11"],
})
// 相手が置いても、自分は置かないこともできる
scenario({
    name: "x13-15 相手が置き自分は置かない",
    start: hammerStart(),
    steps: (t) => hammerAttack(t, [true, false]),
    expect: [...combined, "相手.ライフ: 5 → 6", "相手.リザーブ: 10 → 9", "自分.リザーブ: 10 → 11"],
})
// 起きない：相手のリザーブにコアが無く、置けない → 「置かれたとき」は起きない
scenario({
    name: "x13-15 相手のリザーブが空",
    start: hammerStart(0),
    steps: (t) => hammerAttack(t, false),
    expect: [...combined, "自分.リザーブ: 10 → 11"],
})
// 起きない：合体せずにアタックした（【合体時】の効果）
scenario({
    name: "x13-15 合体していない",
    start: { phase: "attack", interactive: true, me: { spirits: [{ card: BALLOON, label: "風船魔人" }, { card: HAMMER, label: "マジカルハンマー" }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("風船魔人") })
        settle(t)
    },
    expect: ["自分.風船魔人.疲労: false → true"],
})
// 合体条件：コスト4以上（コスト1のスピリットには合体できない）
scenario({
    name: "x13-15 合体条件を満たさない",
    start: { interactive: true, me: { spirits: [{ card: VANILLA, label: "コスト1" }, { card: HAMMER, label: "マジカルハンマー" }] } },
    steps(t) {
        t.actRejected("me", { type: "combineBrave", braveInstanceId: t.id("マジカルハンマー"), hostInstanceId: t.id("コスト1") })
    },
    expect: [],
})

console.log("=== X013 バースト：相手による自分のスピリット破壊後（BP7000以上のスピリットが破壊されていたら召喚） ===")
const intiStart = (mySpirits: { card: string; label: string; cores?: number }[]) => ({
    turn: "opp" as const,
    phase: "attack" as const,
    interactive: true,
    me: { burst: INTI, hand: [LORD], spirits: mySpirits },
    opp: { spirits: [{ card: METAL, label: "攻撃", cores: 8 }] },
})
const intiSteps = (answers: boolean | boolean[]) => (t: ScenarioCtx) => {
    t.act("opp", { type: "attack", instanceId: t.id("攻撃") })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id("ブロッカー") })
    t.closeFlash()
    settle(t, answers)
}
const intiSummoned = [
    "自分.バースト: 黄金皇ロード・ドラゴン・インティ → なし",
    "自分.黄金皇ロード・ドラゴン・インティ.場所: なし → フィールド",
    "自分.黄金皇ロード・ドラゴン・インティ.疲労: なし → false",
    "自分.黄金皇ロード・ドラゴン・インティ.コア: なし → 1",
    "自分.黄金皇ロード・ドラゴン・インティ.Lv: なし → 1",
    "自分.黄金皇ロード・ドラゴン・インティ.BP: なし → 5000",
]
const intiBlockerDestroyed = ["自分.ブロッカー.場所: フィールド → なし", "自分.トラッシュ: なし → ブレイブレス・レオ", "相手.攻撃.疲労: false → true"]
// 起きる：BP7000のスピリットが破壊された。発揮後に手札の「ロード・ドラゴン」1枚をコストなしで召喚（リザーブは増減しない）
scenario({
    name: "x013 バースト 召喚＋手札から召喚",
    start: intiStart([{ card: LEO, label: "ブロッカー", cores: 2 }]),
    steps: intiSteps(true),
    expect: [
        ...intiBlockerDestroyed,
        ...intiSummoned,
        "自分.手札: 英雄龍ロード・ドラゴン → なし",
        "自分.英雄龍ロード・ドラゴン.場所: なし → フィールド",
        "自分.英雄龍ロード・ドラゴン.疲労: なし → false",
        "自分.英雄龍ロード・ドラゴン.コア: なし → 1",
        "自分.英雄龍ロード・ドラゴン.Lv: なし → 1",
        "自分.英雄龍ロード・ドラゴン.BP: なし → 4000",
    ],
})
// 「召喚できる」は任意：バーストの召喚だけ行い、2体目は見送る
scenario({
    name: "x013 バースト 2体目は見送る",
    start: intiStart([{ card: LEO, label: "ブロッカー", cores: 2 }]),
    steps: intiSteps([true, false]),
    expect: [...intiBlockerDestroyed, ...intiSummoned, "自分.リザーブ: 10 → 11"],
})
// 起きない：破壊されたのはBP1000（不発。手札の召喚もしない）
scenario({
    name: "x013 バースト BP7000未満",
    start: intiStart([{ card: VANILLA, label: "ブロッカー" }]),
    steps: intiSteps(true),
    expect: [
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス、黄金皇ロード・ドラゴン・インティ",
        "自分.バースト: 黄金皇ロード・ドラゴン・インティ → なし",
        "自分.リザーブ: 10 → 11",
        "相手.攻撃.疲労: false → true",
    ],
})
// 起きない：BP7000のスピリットは場に残っていて、破壊されたのはBP1000
scenario({
    name: "x013 バースト BP7000は破壊されていない",
    start: intiStart([{ card: LEO, label: "生存", cores: 2 }, { card: VANILLA, label: "ブロッカー" }]),
    steps: intiSteps(true),
    expect: [
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス、黄金皇ロード・ドラゴン・インティ",
        "自分.バースト: 黄金皇ロード・ドラゴン・インティ → なし",
        "自分.リザーブ: 10 → 11",
        "相手.攻撃.疲労: false → true",
    ],
})

console.log("=== X013 Lv2･Lv3『自分のアタックステップ』：「ロード・ドラゴン」を名前に持つ自分のスピリットすべてBP+2000 ===")
const intiField = (cores: number) => ({
    interactive: true,
    me: { spirits: [{ card: INTI, label: "インティ", cores }, { card: LORD, label: "ロード" }, { card: VANILLA, label: "別名" }] },
    opp: { spirits: [{ card: LORD, label: "敵ロード" }] },
})
// 起きる：Lv2で自分のアタックステップに入る（自分のロード・ドラゴンだけ。別名と相手のロード・ドラゴンは上がらない）
scenario({
    name: "x013 Lv2 アタックステップ",
    start: { phase: "main", ...intiField(3) },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.インティ.BP: 8000 → 10000", "自分.ロード.BP: 4000 → 6000"],
})
// 起きない：Lv1
scenario({
    name: "x013 Lv1 は上がらない",
    start: { phase: "main", ...intiField(1) },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: [],
})
// 起きない：相手のアタックステップ
scenario({
    name: "x013 Lv2 相手のアタックステップ",
    start: { turn: "opp", phase: "main", ...intiField(3) },
    steps: (t) => t.act("opp", { type: "nextPhase" }),
    expect: [],
})

console.log("=== X016 バースト：自分のライフ減少後（このスピリットカードを召喚） ===")
const bazelName = "黒炎の覇王ダーク・ドラゴン・バゼル"
scenario({
    name: "x016 バースト ライフ減少後",
    start: { turn: "opp", phase: "attack", interactive: true, me: { burst: BAZEL }, opp: { spirits: [{ card: VANILLA, label: "攻撃" }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("攻撃") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        settle(t)
    },
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.バースト: " + bazelName + " → なし",
        `自分.${bazelName}.場所: なし → フィールド`,
        `自分.${bazelName}.疲労: なし → false`,
        `自分.${bazelName}.コア: なし → 1`,
        `自分.${bazelName}.Lv: なし → 1`,
        `自分.${bazelName}.BP: なし → 5000`,
        "相手.攻撃.疲労: false → true",
    ],
})

console.log("=== X016 Lv2･Lv3：【相手の召喚時発揮後】のバーストを【相手による自分のスピリット破壊後】にも発動できる ===")
const bazelStart = (cores: number, burst: string) => ({
    turn: "opp" as const,
    phase: "attack" as const,
    interactive: true,
    me: { burst, spirits: [{ card: BAZEL, label: "バゼル", cores }, { card: VANILLA, label: "ブロッカー" }] },
    opp: { spirits: [{ card: METAL, label: "攻撃" }] },
})
const bazelSteps = (t: ScenarioCtx) => {
    t.act("opp", { type: "attack", instanceId: t.id("攻撃") })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id("ブロッカー") })
    t.closeFlash()
    settle(t)
}
// 起きる：Lv2。破壊後にシーマ・クリークのバーストが発動して召喚される
scenario({
    name: "x016 Lv2 破壊後にも発動できる",
    start: bazelStart(3, SEAMA),
    steps: bazelSteps,
    expect: [
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.バースト: 海皇龍シーマ・クリーク → なし",
        "自分.海皇龍シーマ・クリーク.場所: なし → フィールド",
        "自分.海皇龍シーマ・クリーク.疲労: なし → false",
        "自分.海皇龍シーマ・クリーク.コア: なし → 1",
        "自分.海皇龍シーマ・クリーク.Lv: なし → 1",
        "自分.海皇龍シーマ・クリーク.BP: なし → 4000",
        "相手.攻撃.疲労: false → true",
    ],
})
// 起きない：Lv1 のバゼルでは発動できず、バーストはセットされたまま
scenario({
    name: "x016 Lv1 は発動できない",
    start: bazelStart(1, SEAMA),
    steps: bazelSteps,
    expect: ["自分.ブロッカー.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11", "相手.攻撃.疲労: false → true"],
})
// 条件を満たさないバーストは不発（Q18884）：イッスンアントマンは【神速】/【暴風】持ちを手札に戻せないと召喚できない。バーストカードは使用済みになる
scenario({
    name: "x016 Lv2 条件を満たさないバーストは不発",
    start: bazelStart(3, ISSUN),
    steps: bazelSteps,
    expect: [
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス、小さな侍イッスンアントマン",
        "自分.バースト: 小さな侍イッスンアントマン → なし",
        "自分.リザーブ: 10 → 11",
        "相手.攻撃.疲労: false → true",
    ],
})

console.log("=== X016 Lv3『自分のバースト発動後』：相手のブレイヴ/ネクサス、どちらか1つを破壊 ===")
const lifeLossStart = (cores: number, oppExtra: { nexuses?: { card: string; label: string }[]; spirits?: { card: string; label: string }[] }) => ({
    turn: "opp" as const,
    phase: "attack" as const,
    interactive: true,
    me: { burst: LORD, spirits: [{ card: BAZEL, label: "バゼル", cores }] },
    opp: { spirits: [{ card: VANILLA, label: "攻撃" }, ...(oppExtra.spirits ?? [])], nexuses: oppExtra.nexuses ?? [] },
})
const lifeLossSteps = (prefer?: string) => (t: ScenarioCtx) => {
    t.act("opp", { type: "attack", instanceId: t.id("攻撃") })
    t.closeFlash()
    t.act("me", { type: "takeLife" })
    settle(t, true, prefer)
}
const lordSummoned = [
    "自分.ライフ: 5 → 4",
    "自分.バースト: 英雄龍ロード・ドラゴン → なし",
    "自分.英雄龍ロード・ドラゴン.場所: なし → フィールド",
    "自分.英雄龍ロード・ドラゴン.疲労: なし → false",
    "自分.英雄龍ロード・ドラゴン.コア: なし → 1",
    "自分.英雄龍ロード・ドラゴン.Lv: なし → 1",
    "自分.英雄龍ロード・ドラゴン.BP: なし → 4000",
    "相手.攻撃.疲労: false → true",
]
// 起きる：ネクサスだけがいる
scenario({
    name: "x016 Lv3 ネクサスを破壊",
    start: lifeLossStart(5, { nexuses: [{ card: NEXUS, label: "ネクサス" }] }),
    steps: lifeLossSteps("ネクサス"),
    expect: [...lordSummoned, "相手.ネクサス.場所: ネクサス → なし", "相手.トラッシュ: なし → トパーズの流星", "相手.リザーブ: 10 → 11"],
})
// 起きる：スピリット状態のブレイヴだけがいる（Q18885）
scenario({
    name: "x016 Lv3 スピリット状態のブレイヴを破壊",
    start: lifeLossStart(5, { spirits: [{ card: HAMMER, label: "ブレイヴ" }] }),
    steps: lifeLossSteps("ブレイヴ"),
    expect: [...lordSummoned, "相手.ブレイヴ.場所: フィールド → なし", "相手.トラッシュ: なし → マジカルハンマー", "相手.リザーブ: 10 → 11"],
})
// 起きる：両方いても破壊するのはどちらか1つ（ここではネクサスを選ぶ。ブレイヴは残る）
scenario({
    name: "x016 Lv3 両方いて1つだけ",
    start: lifeLossStart(5, { nexuses: [{ card: NEXUS, label: "ネクサス" }], spirits: [{ card: HAMMER, label: "ブレイヴ" }] }),
    steps: lifeLossSteps("ネクサス"),
    expect: [...lordSummoned, "相手.ネクサス.場所: ネクサス → なし", "相手.トラッシュ: なし → トパーズの流星", "相手.リザーブ: 10 → 11"],
})
// 起きない：Lv2 では破壊しない
scenario({
    name: "x016 Lv2 では破壊しない",
    start: lifeLossStart(3, { nexuses: [{ card: NEXUS, label: "ネクサス" }] }),
    steps: lifeLossSteps("ネクサス"),
    expect: lordSummoned,
})
// 起きない：相手のブレイヴ/ネクサスがいない（不発。バーストの召喚だけ）
scenario({
    name: "x016 Lv3 相手にブレイヴもネクサスもいない",
    start: lifeLossStart(5, {}),
    steps: lifeLossSteps(),
    expect: lordSummoned,
})

console.log("すべてのチェックに合格しました 🎉（part974）")
