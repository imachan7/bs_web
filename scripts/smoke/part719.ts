// smoke パート719（プロモ 解釈確定済みの5枚：P019 皇角獣メガロ・エルス／P022 拳闘巨人ジャスティン／P039 太陽伯爵ルビカンテ／P050 コウディーン／PX09 鳥獣烈神ガルード。
// 期待値役が効果文と確認済みの解釈から書いた場面テスト）
import { assert, effectiveBp, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const P019 = "P019"
const P022 = "P022"
const P039 = "P039"
const P050 = "P050"
const PX09 = "PX09"
const P038 = "P038" // 太陽飛竜フレアドラグーン（赤・スピリット・名前に「太陽」）
const SUN_NEXUS = "BS01-100" // ルビーの太陽（赤・ネクサス。名前に「太陽」だがスピリットではない）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・BP3000）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・コスト3・BP4000）
const ARNOLD = "BS03-089" // ディープ・アーノルド（青・コスト4・BP4000）
const TAIGA = "BS03-099" // 虎拳士タイガ（青・コスト7・Lv1 BP5000／Lv3(コア7) BP10000）
const WINGAL = "BS02-046" // ウィンガル（白・コスト6・BP5000）
const FENRIR = "BS10-071" // フェンリルキャノンType-B（白・ブレイヴ・コスト4・BP3000）
const KETTO = "BS02-077" // 決闘台地（赤・ネクサス。この場面では何も起きない）
const SPEAR = "BS01-114" // バスタースピア（赤・マジック・コスト3・フラッシュ：ネクサス1つを破壊。相手のネクサスなら1枚ドロー）
const BURST = "SD06-016" // 絶甲氷盾（白・マジック・バースト：自分のライフ減少後にライフへコア1個）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    const chk = (id: string, name: string, type: string, color: string, cost: number) =>
        assert(c(id).name === name && c(id).type === type && c(id).colors.join() === color && c(id).cost === cost, `${id}は${color}の${type}「${name}」コスト${cost}`)
    chk(P019, "皇角獣メガロ・エルス", "spirit", "red", 5)
    chk(P022, "拳闘巨人ジャスティン", "spirit", "blue", 4)
    chk(P039, "太陽伯爵ルビカンテ", "spirit", "purple", 5)
    chk(P050, "コウディーン", "spirit", "purple", 4)
    chk(PX09, "鳥獣烈神ガルード", "spirit", "blue", 7)
    chk(P038, "太陽飛竜フレアドラグーン", "spirit", "red", 4)
    chk(SUN_NEXUS, "ルビーの太陽", "nexus", "red", 5)
    chk(ROKU, "ロクケラトプス", "spirit", "red", 1)
    chk(METAL, "メタルバーン", "spirit", "red", 3)
    chk(HERA, "ヘラクレス・ジオ", "spirit", "green", 3)
    chk(ARNOLD, "ディープ・アーノルド", "spirit", "blue", 4)
    chk(TAIGA, "虎拳士タイガ", "spirit", "blue", 7)
    chk(WINGAL, "ウィンガル", "spirit", "white", 6)
    chk(FENRIR, "フェンリルキャノンType-B", "brave", "white", 4)
    chk(KETTO, "決闘台地", "nexus", "red", 4)
    chk(SPEAR, "バスタースピア", "magic", "red", 3)
    chk(BURST, "絶甲氷盾", "magic", "white", 4)
    assert(c(P019).levels[0]!.bp === 4000 && c(P019).levels[1]!.bp === 7000 && c(P019).levels[1]!.cores === 3, "P019はLv1 BP4000／Lv2(コア3) BP7000")
    assert(c(P039).levels[1]!.cores === 3 && c(PX09).levels[1]!.cores === 5 && c(P022).levels[1]!.cores === 4 && c(P050).levels[1]!.cores === 2, "各カードのLv2に要るコア数")
    assert(c(TAIGA).levels[2]!.cores === 7 && c(TAIGA).levels[2]!.bp === 10000, "TAIGAはLv3(コア7)でBP10000")
    assert(c(SPEAR).flash === true, "SPEARはフラッシュ")
    for (const id of [ROKU, METAL, HERA, ARNOLD, TAIGA, WINGAL, P038]) assert(c(id).effects.length === 0 && c(id).type === "spirit", `${id}は効果なしのスピリット`)
}

function resolveAll(t: ScenarioCtx, prefer: string[] = []): void {
    for (let i = 0; i < 30 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "target") {
            const hit = prefer.map((l) => t.id(l)).find((id) => pc.candidates.includes(id))
            t.act(side, { type: "resolveChoice", instanceId: hit ?? pc.candidates[0]! })
        } else if (pc.kind === "option") {
            const opts = pc.options!
            t.act(side, { type: "resolveChoice", option: opts.find((o) => prefer.some((p) => o.includes(p))) ?? opts[0]! })
        } else {
            const zone = pc.cardZone === "trash" ? t.state.players[pc.cardOwner!].trashCards : t.state.players[pc.cardOwner!].hand
            const idx = pc.cardIndices!.find((i) => prefer.includes(getCard(zone[i]!).name))
            t.act(side, { type: "resolveChoice", cardIndex: idx ?? pc.cardIndices![0]! })
        }
    }
}
const bpOf = (t: ScenarioCtx, label: string) => effectiveBp(t.state, t.me, t.inst(label))

// ================= P019 =================
console.log("=== 1. P019 召喚時：BP4000以下のスピリット1体を破壊し、自分はデッキから1枚ドロー ===")
scenario({
    name: "p019-destroy-draw",
    start: { interactive: true, me: { hand: [P019] }, opp: { spirits: [{ card: ROKU }, { card: TAIGA }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t, ["相手.ロクケラトプス"])
    },
    expect: [
        "自分.手札: 皇角獣メガロ・エルス → ロクケラトプス",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.デッキ枚数: 40 → 39",
        "自分.皇角獣メガロ・エルス.場所: なし → フィールド",
        "自分.皇角獣メガロ・エルス.疲労: なし → false",
        "自分.皇角獣メガロ・エルス.コア: なし → 1",
        "自分.皇角獣メガロ・エルス.Lv: なし → 1",
        "自分.皇角獣メガロ・エルス.BP: なし → 4000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → ロクケラトプス",
    ],
})

console.log("=== 2. P019：破壊できる相手がいなくても、同時にドローする（Lv2にして自身もBP7000で対象外） ===")
scenario({
    name: "p019-draw-without-target",
    start: { me: { hand: [P019] }, opp: { spirits: [{ card: TAIGA }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, level: 2 })
        resolveAll(t)
    },
    expect: [
        "自分.手札: 皇角獣メガロ・エルス → ロクケラトプス",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 5",
        "自分.デッキ枚数: 40 → 39",
        "自分.皇角獣メガロ・エルス.場所: なし → フィールド",
        "自分.皇角獣メガロ・エルス.疲労: なし → false",
        "自分.皇角獣メガロ・エルス.コア: なし → 3",
        "自分.皇角獣メガロ・エルス.Lv: なし → 2",
        "自分.皇角獣メガロ・エルス.BP: なし → 7000",
    ],
})

console.log("=== 3. P019：「自分の」「相手の」が無いので、相手側に候補がなければ自分のスピリットが破壊される（赤シンボルでコスト4） ===")
scenario({
    name: "p019-own-spirit",
    start: { me: { hand: [P019], spirits: [{ card: ROKU }] }, opp: { spirits: [{ card: TAIGA }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, level: 2 })
        resolveAll(t)
    },
    expect: [
        "自分.手札: 皇角獣メガロ・エルス → ロクケラトプス",
        "自分.リザーブ: 10 → 4", // コスト4＋コア3個で7、破壊されたロクケラトプスのコア1個が戻る
        "自分.トラッシュのコア: 0 → 4",
        "自分.デッキ枚数: 40 → 39",
        "自分.皇角獣メガロ・エルス.場所: なし → フィールド",
        "自分.皇角獣メガロ・エルス.疲労: なし → false",
        "自分.皇角獣メガロ・エルス.コア: なし → 3",
        "自分.皇角獣メガロ・エルス.Lv: なし → 2",
        "自分.皇角獣メガロ・エルス.BP: なし → 7000",
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
    ],
})

console.log("=== 4. P019【転召：コスト3以上/トラッシュ】：コスト支払い後、コスト3以上の自分のスピリットのコアすべてをトラッシュに置いて召喚する ===")
scenario({
    name: "p019-tensho",
    start: { interactive: true, me: { hand: [P019], spirits: [{ card: METAL }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, substituteInstanceId: t.id("自分.メタルバーン") })
        resolveAll(t, ["相手.ロクケラトプス"])
    },
    expect: [
        "自分.手札: 皇角獣メガロ・エルス → ロクケラトプス",
        "自分.リザーブ: 10 → 5", // 赤シンボル1つで軽減してコスト4＋コア1個
        "自分.トラッシュのコア: 0 → 5", // コスト4＋メタルバーンのコア1個
        "自分.デッキ枚数: 40 → 39",
        "自分.メタルバーン.場所: フィールド → なし",
        "自分.トラッシュ: なし → メタルバーン",
        "自分.皇角獣メガロ・エルス.場所: なし → フィールド",
        "自分.皇角獣メガロ・エルス.疲労: なし → false",
        "自分.皇角獣メガロ・エルス.コア: なし → 1",
        "自分.皇角獣メガロ・エルス.Lv: なし → 1",
        "自分.皇角獣メガロ・エルス.BP: なし → 4000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → ロクケラトプス",
    ],
})

// ================= P022 =================
// アタックを宣言した直後（バトル中）の BP を見る。ライフでは受けない
function attackP022(t: ScenarioCtx): void {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("拳闘巨人ジャスティン") })
    resolveAll(t)
}

console.log("=== 5. P022 Lv1 アタック時：自分のフィールドにネクサスがある間、BP+2000 ===")
scenario({
    name: "p022-bp-nexus",
    start: { me: { spirits: [{ card: P022 }], nexuses: [{ card: KETTO, cores: 0 }] } },
    steps: attackP022,
    expect: ["自分.拳闘巨人ジャスティン.疲労: false → true", "自分.拳闘巨人ジャスティン.BP: 3000 → 5000"],
})

console.log("=== 6. P022：ネクサスが無ければ BP は上がらない ===")
scenario({
    name: "p022-bp-no-nexus",
    start: { me: { spirits: [{ card: P022 }] } },
    steps: attackP022,
    expect: ["自分.拳闘巨人ジャスティン.疲労: false → true"],
})

console.log("=== 7. P022：疲労状態のネクサスでも「ある間」に当たる（BP+2000のまま） ===")
scenario({
    name: "p022-bp-rested-nexus",
    start: { me: { spirits: [{ card: P022 }], nexuses: [{ card: KETTO, cores: 0, rested: true }] } },
    steps: attackP022,
    expect: ["自分.拳闘巨人ジャスティン.疲労: false → true", "自分.拳闘巨人ジャスティン.BP: 3000 → 5000"],
})

console.log("=== 8. P022：「ある間」なのでアタック中ずっと見る。バトル中にネクサスが破壊されたら BP+2000 は消える ===")
scenario({
    name: "p022-bp-nexus-lost",
    start: { me: { spirits: [{ card: P022 }], nexuses: [{ card: KETTO, cores: 0 }] }, opp: { hand: [SPEAR] } },
    steps: (t) => {
        attackP022(t)
        assert(bpOf(t, "拳闘巨人ジャスティン") === 5000, "ネクサスがある間は BP5000")
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        resolveAll(t)
        assert(bpOf(t, "拳闘巨人ジャスティン") === 3000, "ネクサスが無くなったら BP3000に戻る")
    },
    expect: [
        "自分.拳闘巨人ジャスティン.疲労: false → true",
        "自分.決闘台地.場所: ネクサス → なし",
        "自分.トラッシュ: なし → 決闘台地",
        "相手.手札: バスタースピア → ロクケラトプス", // 相手のネクサスを破壊した場合のドロー
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュ: なし → バスタースピア",
        "相手.トラッシュのコア: 0 → 3",
        "相手.リザーブ: 10 → 7",
    ],
})

console.log("=== 9. P022 Lv2【強襲：1】：ネクサス1つを疲労させて回復する（BP+2000も同時に掛かる） ===")
scenario({
    name: "p022-lv2-assault",
    start: { me: { spirits: [{ card: P022, cores: 4 }], nexuses: [{ card: KETTO, cores: 0 }] } },
    steps: attackP022,
    expect: ["自分.決闘台地.疲労: false → true", "自分.拳闘巨人ジャスティン.BP: 5000 → 7000"],
})

console.log("=== 10. P022 の【強襲】はLv2のみ：Lv1ではネクサスがあっても回復しない ===")
scenario({
    name: "p022-lv1-no-assault",
    start: { me: { spirits: [{ card: P022 }], nexuses: [{ card: KETTO, cores: 0 }] } },
    steps: attackP022,
    expect: ["自分.拳闘巨人ジャスティン.疲労: false → true", "自分.拳闘巨人ジャスティン.BP: 3000 → 5000"],
})

// ================= P039 =================
console.log("=== 11. P039 召喚時：トラッシュのカード名に「太陽」と入っているスピリット1枚を手札に戻す（ネクサスの「ルビーの太陽」は対象外） ===")
scenario({
    name: "p039-return-sun",
    start: { interactive: true, me: { hand: [P039], trash: [P038, ROKU, SUN_NEXUS] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t, ["太陽飛竜フレアドラグーン"])
    },
    expect: [
        "自分.手札: 太陽伯爵ルビカンテ → 太陽飛竜フレアドラグーン",
        "自分.トラッシュ: ルビーの太陽、ロクケラトプス、太陽飛竜フレアドラグーン → ルビーの太陽、ロクケラトプス",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.太陽伯爵ルビカンテ.場所: なし → フィールド",
        "自分.太陽伯爵ルビカンテ.疲労: なし → false",
        "自分.太陽伯爵ルビカンテ.コア: なし → 1",
        "自分.太陽伯爵ルビカンテ.Lv: なし → 1",
        "自分.太陽伯爵ルビカンテ.BP: なし → 4000",
    ],
})

console.log("=== 12. P039 召喚時：「太陽」を含む名前のスピリットがトラッシュに無ければ何も戻らない ===")
scenario({
    name: "p039-return-none",
    start: { me: { hand: [P039], trash: [ROKU, SUN_NEXUS] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [
        "自分.手札: 太陽伯爵ルビカンテ → なし",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.太陽伯爵ルビカンテ.場所: なし → フィールド",
        "自分.太陽伯爵ルビカンテ.疲労: なし → false",
        "自分.太陽伯爵ルビカンテ.コア: なし → 1",
        "自分.太陽伯爵ルビカンテ.Lv: なし → 1",
        "自分.太陽伯爵ルビカンテ.BP: なし → 4000",
    ],
})

// 破壊時：自分のターンに P039（Lv2）にブレイヴを合体させ、ターンを渡す。相手のターンに相手が合体（タイガ Lv3＋ブレイヴ）して攻撃し、P039 がブロックして破壊される
function p039Battle(t: ScenarioCtx, oppCombined: boolean): void {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("自分.フェンリルキャノンType-B"), hostInstanceId: t.id("自分.太陽伯爵ルビカンテ") })
    t.act("me", { type: "endTurn" })
    resolveAll(t)
    if (oppCombined) t.act("opp", { type: "combineBrave", braveInstanceId: t.id("相手.フェンリルキャノンType-B"), hostInstanceId: t.id("相手.虎拳士タイガ") })
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("相手.虎拳士タイガ") })
    resolveAll(t)
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id("自分.太陽伯爵ルビカンテ") })
    resolveAll(t)
    t.closeFlash()
    resolveAll(t)
}
const P039_SPEC = (oppBrave: boolean) => ({
    me: { spirits: [{ card: P039, cores: 3 }, { card: FENRIR }] },
    opp: { spirits: [{ card: TAIGA, cores: 7 }, ...(oppBrave ? [{ card: FENRIR }] : [])] },
})

console.log("=== 13. P039【合体時】Lv2『破壊時』：相手の合体スピリット1体を破壊し、その後ブレイヴを残してスピリットだけを手札に戻す（トラッシュには置かれない） ===")
scenario({
    name: "p039-destroyed-combined",
    start: P039_SPEC(true),
    steps: (t) => p039Battle(t, true),
    expect: [
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 18",
        "相手.虎拳士タイガ.場所: フィールド → なし",
        "相手.トラッシュ: なし → 虎拳士タイガ",
        "相手.フェンリルキャノンType-B.疲労: false → true",
        "自分.手札: なし → 太陽伯爵ルビカンテ",
        "自分.太陽伯爵ルビカンテ.場所: フィールド → なし",
        "自分.フェンリルキャノンType-B.疲労: false → true",
        "自分.リザーブ: 10 → 13",
    ],
})

console.log("=== 14. P039：相手の合体スピリットがいなくても、その後のスピリットだけを手札に戻す処理は行う ===")
scenario({
    name: "p039-destroyed-no-opp-combined",
    start: P039_SPEC(false),
    steps: (t) => p039Battle(t, false),
    expect: [
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "相手.虎拳士タイガ.疲労: false → true",
        "自分.手札: なし → 太陽伯爵ルビカンテ",
        "自分.太陽伯爵ルビカンテ.場所: フィールド → なし",
        "自分.フェンリルキャノンType-B.疲労: false → true",
        "自分.リザーブ: 10 → 13",
    ],
})

// ================= P050 =================
// 相手のターンに相手が合体し（タイガ＋ブレイヴ）、rest=true ならアタックして疲労させたままターンを終える。自分のターンに P050 を召喚する
function p050Summon(t: ScenarioCtx, rest: boolean): void {
    t.act("opp", { type: "combineBrave", braveInstanceId: t.id("相手.フェンリルキャノンType-B"), hostInstanceId: t.id("相手.虎拳士タイガ") })
    if (rest) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.虎拳士タイガ") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        resolveAll(t)
    }
    t.act("opp", { type: "endTurn" })
    resolveAll(t)
    t.act("me", { type: "summon", handIndex: 0 })
    resolveAll(t)
}
const P050_SPEC = { turn: "opp" as const, me: { hand: [P050] }, opp: { spirits: [{ card: TAIGA }, { card: FENRIR }] } }

console.log("=== 15. P050 召喚時：疲労状態の相手の合体スピリット1体を破壊 ===")
scenario({
    name: "p050-destroy-rested-combined",
    start: P050_SPEC,
    steps: (t) => p050Summon(t, true),
    expect: [
        "相手.虎拳士タイガ.場所: フィールド → なし",
        "相手.トラッシュ: なし → 虎拳士タイガ",
        "相手.リザーブ: 10 → 11",
        "相手.フェンリルキャノンType-B.疲労: false → true",
        "自分.コウディーン.BP: なし → 2000",
        "自分.コウディーン.Lv: なし → 1",
        "自分.コウディーン.コア: なし → 1",
        "自分.コウディーン.場所: なし → フィールド",
        "自分.コウディーン.疲労: なし → false",
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ライフ: 5 → 3",
        "自分.リザーブ: 10 → 8",
        "自分.手札: コウディーン → ロクケラトプス",
    ],
})

console.log("=== 16. P050 召喚時：疲労していない合体スピリットは破壊されない ===")
scenario({
    name: "p050-ready-combined",
    start: P050_SPEC,
    steps: (t) => p050Summon(t, false),
    expect: [
        "相手.フェンリルキャノンType-B.BP: 3000 → なし",
        "相手.フェンリルキャノンType-B.コア: 1 → 0",
        "相手.フェンリルキャノンType-B.場所: フィールド → 合体",
        "相手.虎拳士タイガ.BP: 5000 → 8000",
        "相手.虎拳士タイガ.コア: 1 → 2",
        "自分.コウディーン.BP: なし → 2000",
        "自分.コウディーン.Lv: なし → 1",
        "自分.コウディーン.コア: なし → 1",
        "自分.コウディーン.場所: なし → フィールド",
        "自分.コウディーン.疲労: なし → false",
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュのコア: 0 → 4",
        "自分.リザーブ: 10 → 6",
        "自分.手札: コウディーン → ロクケラトプス",
    ],
})

// バースト発動後：相手のタイガがアタックし、自分がライフで受けてバースト（絶甲氷盾）が発動する
function oppAttackBurst(t: ScenarioCtx): void {
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("相手.虎拳士タイガ") })
    t.closeFlash()
    t.act("me", { type: "takeLife" })
    resolveAll(t, ["発動"])
}
const P050_BURST_OPP = { spirits: [{ card: TAIGA }, { card: ROKU }, { card: METAL, cores: 2 }] }

console.log("=== 17. P050 Lv2『自分のバースト発動後』：コスト4以下の相手のスピリットすべてのコア1個ずつをリザーブへ。コア1個のスピリットは1個残さず消える ===")
scenario({
    name: "p050-after-burst",
    start: { turn: "opp", me: { reserve: 0, spirits: [{ card: P050, cores: 2 }], burst: BURST }, opp: P050_BURST_OPP },
    steps: oppAttackBurst,
    expect: [
        "相手.虎拳士タイガ.疲労: false → true",
        "自分.トラッシュ: なし → 絶甲氷盾",
        "自分.バースト: 絶甲氷盾 → なし",
        "自分.リザーブ: 0 → 1",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.メタルバーン.コア: 2 → 1",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== 18. P050 の効果はLv2から：Lv1（コア1）ではバースト発動後に何も起きない ===")
scenario({
    name: "p050-lv1-after-burst",
    start: { turn: "opp", me: { reserve: 0, spirits: [{ card: P050 }], burst: BURST }, opp: P050_BURST_OPP },
    steps: oppAttackBurst,
    expect: [
        "相手.虎拳士タイガ.疲労: false → true",
        "自分.トラッシュ: なし → 絶甲氷盾",
        "自分.バースト: 絶甲氷盾 → なし",
        "自分.リザーブ: 0 → 1",
    ],
})

// ================= PX09 =================
const PX09_OPP = { spirits: [{ card: ROKU }, { card: METAL }, { card: HERA }, { card: ARNOLD }, { card: WINGAL }] }
function px09Attack(t: ScenarioCtx, blockWith: string | null): void {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("鳥獣烈神ガルード") })
    resolveAll(t)
    t.closeFlash()
    if (blockWith) {
        t.act("opp", { type: "block", instanceId: t.id(blockWith) })
        resolveAll(t)
        t.closeFlash()
    } else {
        t.act("opp", { type: "takeLife" })
    }
    resolveAll(t)
}
const MILL = (n: number, extra: string[] = []) => [...extra, ...Array.from({ length: n }, () => "ロクケラトプス")].sort().join("、")

console.log("=== 19. PX09【暴風：5】：ブロックされたとき、相手は相手のスピリット5体を疲労させる（相手のスピリットがちょうど5体なら全員） ===")
scenario({
    name: "px09-storm",
    start: { me: { spirits: [{ card: PX09 }] }, opp: PX09_OPP },
    steps: (t) => px09Attack(t, "相手.メタルバーン"),
    expect: [
        "自分.鳥獣烈神ガルード.疲労: false → true",
        "相手.ロクケラトプス.疲労: false → true",
        "相手.ヘラクレス・ジオ.疲労: false → true",
        "相手.ディープ・アーノルド.疲労: false → true",
        "相手.ウィンガル.疲労: false → true",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → メタルバーン",
    ],
})

console.log("=== 20. PX09 Lv1 アタック時：アタックによってライフを減らしたとき、相手のデッキを上から12枚破棄 ===")
scenario({
    name: "px09-mill12",
    start: { me: { spirits: [{ card: PX09 }] }, opp: PX09_OPP },
    steps: (t) => px09Attack(t, null),
    expect: [
        "自分.鳥獣烈神ガルード.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "相手.デッキ枚数: 40 → 28",
        `相手.トラッシュ: なし → ${MILL(12)}`,
    ],
})

console.log("=== 21. PX09 Lv2『自分のアタックステップ』：相手のスピリットが疲労したとき、そのスピリット1体につき3枚破棄。【暴風：5】で5体が同時に疲労したら15枚 ===")
scenario({
    name: "px09-lv2-15",
    start: { me: { spirits: [{ card: PX09, cores: 5 }] }, opp: PX09_OPP },
    steps: (t) => px09Attack(t, "相手.メタルバーン"),
    expect: [
        "自分.鳥獣烈神ガルード.疲労: false → true",
        "相手.ロクケラトプス.疲労: false → true",
        "相手.ヘラクレス・ジオ.疲労: false → true",
        "相手.ディープ・アーノルド.疲労: false → true",
        "相手.ウィンガル.疲労: false → true",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "相手.デッキ枚数: 40 → 25",
        `相手.トラッシュ: なし → ${MILL(15, ["メタルバーン"])}`,
    ],
})

console.log("=== 22. PX09 Lv2：疲労が起きなければ3枚破棄は起きない（ライフを減らしたときの12枚だけ） ===")
scenario({
    name: "px09-lv2-no-rest",
    start: { me: { spirits: [{ card: PX09, cores: 5 }] }, opp: PX09_OPP },
    steps: (t) => px09Attack(t, null),
    expect: [
        "自分.鳥獣烈神ガルード.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "相手.デッキ枚数: 40 → 28",
        `相手.トラッシュ: なし → ${MILL(12)}`,
    ],
})

console.log("=== 23. PX09 Lv1：Lv2の3枚破棄は無い。5体が疲労してもデッキは減らない ===")
scenario({
    name: "px09-lv1-no-mill",
    start: { me: { spirits: [{ card: PX09 }] }, opp: PX09_OPP },
    steps: (t) => px09Attack(t, "相手.メタルバーン"),
    expect: [
        "自分.鳥獣烈神ガルード.疲労: false → true",
        "相手.ロクケラトプス.疲労: false → true",
        "相手.ヘラクレス・ジオ.疲労: false → true",
        "相手.ディープ・アーノルド.疲労: false → true",
        "相手.ウィンガル.疲労: false → true",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → メタルバーン",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part719）")
