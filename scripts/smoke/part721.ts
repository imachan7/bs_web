// smoke パート721（プロモ 紫・緑の組：P004 P005 P010 P014 P018 P025 P030 P031 P035 P042 P051 P057 P061 P062 P066 P068 P073 PX03 PX04 PX08 PX16。
// 期待値役が効果文と PROMO_PLAN §2 の解釈から書いた場面テスト。実装前は落ちてよい）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const P004 = "P004", P005 = "P005", P010 = "P010", P014 = "P014", P018 = "P018", P025 = "P025", P030 = "P030"
const P031 = "P031", P035 = "P035", P042 = "P042", P051 = "P051", P057 = "P057", P061 = "P061", P062 = "P062"
const P066 = "P066", P068 = "P068", P073 = "P073", PX03 = "PX03", PX04 = "PX04", PX08 = "PX08", PX16 = "PX16"
const ROKU = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・BP1000・Lv2(コア2)BP3000）
const METAL = "BS01-008" // メタルバーン（赤・機竜・コスト3・Lv1 BP3000・Lv2はコア3）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・巨獣・コスト3・Lv1 BP4000・Lv2はコア3）
const HATCH = "SD01-015" // ハッチドリ（緑・歌鳥・コスト1）
const AIBURN = "BS01-005" // アイバーン（赤・翼竜・コスト2）
const GABU = "BS06-028" // ガブノハシ（緑・【暴風：1】持ち・コスト3）
const HYDRAM = "BS02-023" // 双蛇ヒュドラム（紫・妖蛇・コスト6・効果なし）
const HUMP = "BS03-020" // メガ・ハンプダンプ（紫・幽魔・コスト5・Lv1 BP3000）
const DARKLAYS = "BS03-018" // ダークレイス（紫・呪鬼・コスト4・Lv1 BP2000・Lv2はコア3）
const WINGAL = "BS02-046" // ウィンガル（白・武装・コスト6・Lv1 BP5000）
const BIANCO = "BS10-039" // ビアンコ・ティーガー（白・機獣・コスト6・Lv1 BP5000・Lv2(コア2)BP9000）
const SKELBY = "BS01-038" // スケル・バイパー（紫・妖蛇・コスト4・召喚時にドロー）
const TITAN = "BS03-X12" // 英雄巨人タイタス（青・コスト8・召喚時に相手のデッキ10枚破棄）
const POISON = "BS01-129" // ポイズンシュート（紫マジック・コスト5・フラッシュ：スピリット1体の上のコア1個をリザーブへ）
const FLAME = "BS01-121" // フレイムダンス（赤マジック・コスト5・フラッシュ：BP4000以下のスピリット1体を破壊）
const DOUBLE = "BS01-117" // ダブルドロー（赤マジック・コスト4・メイン：2枚ドロー）
const BEAM = "BS10-068" // ビーム・ビートル（緑ブレイヴ・コスト4・召喚時効果なし・合体条件コスト4以上）
const FENRIR = "BS10-071" // フェンリルキャノンType-B（白ブレイヴ・コスト4・召喚時効果なし）
const ANT = "BS05-024" // 用心棒アントマン（緑・殻人/怪虫・コスト4・BP5000）
const PAN = "BS04-X14" // 魔界七将パンデミウム（紫・魔神/妖蛇・コスト8・召喚時効果なし）
const DORUKUSU = "BS14-X03" // 風の覇王ドルクス・ウシワカ（緑・覇皇/殻虫・コスト5）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, name: string, type: string, color: string, cost: number, family?: string) => {
        const c = getCard(id)
        assert(c.name === name && c.type === type && c.colors.join() === color && c.cost === cost && (family === undefined || c.family.includes(family)), `${id}は${color}の${type}「${name}」コスト${cost}${family ? `・系統${family}` : ""}`)
    }
    chk(P004, "魔刃将ヘル・ブレド", "spirit", "purple", 6)
    chk(P005, "ガル・カルラ", "spirit", "green", 4)
    chk(P010, "ケロロドラゴン", "spirit", "green", 6, "翼竜")
    chk(P014, "マンティスター", "spirit", "green", 5)
    chk(P018, "森林の偵察兵バタフラー", "spirit", "green", 4)
    chk(P025, "マハーヴァスキ", "spirit", "purple", 5, "妖蛇")
    chk(P030, "冥車輪ブェール", "brave", "purple", 4)
    chk(P031, "飛甲虫イットウカブト", "brave", "green", 4)
    chk(P035, "月光武者ヘイケ・ボルタ", "spirit", "green", 5)
    chk(P042, "シールディバグ", "brave", "green", 4)
    chk(P051, "小さな侍イッスンアントマン", "spirit", "green", 3)
    chk(P057, "闇騎士ガレス", "spirit", "purple", 4)
    chk(P061, "怪盗ヴァンビット", "spirit", "purple", 3)
    chk(P062, "カヒョウエン", "spirit", "green", 4)
    chk(P066, "プリズモルフォ", "spirit", "green", 3)
    chk(P068, "疾風弾導破", "magic", "green", 4)
    chk(P073, "闇騎士トリスタン", "spirit", "purple", 5)
    chk(PX03, "獣槍王ギガ・ガルレイヴ", "spirit", "green", 8)
    chk(PX04, "魔神王エル・ブラド", "spirit", "purple", 8)
    chk(PX08, "甲蟲武神ギラファ・ランドウ", "spirit", "green", 7)
    chk(PX16, "魔界七将ベリオット", "spirit", "purple", 8)
    chk(ROKU, "ロクケラトプス", "spirit", "red", 1)
    chk(METAL, "メタルバーン", "spirit", "red", 3)
    chk(HERA, "ヘラクレス・ジオ", "spirit", "green", 3)
    chk(HATCH, "ハッチドリ", "spirit", "green", 1, "歌鳥")
    chk(AIBURN, "アイバーン", "spirit", "red", 2, "翼竜")
    chk(GABU, "ガブノハシ", "spirit", "green", 3)
    chk(HYDRAM, "双蛇ヒュドラム", "spirit", "purple", 6, "妖蛇")
    chk(HUMP, "メガ・ハンプダンプ", "spirit", "purple", 5)
    chk(DARKLAYS, "ダークレイス", "spirit", "purple", 4)
    chk(WINGAL, "ウィンガル", "spirit", "white", 6)
    chk(BIANCO, "ビアンコ・ティーガー", "spirit", "white", 6)
    chk(SKELBY, "スケル・バイパー", "spirit", "purple", 4)
    chk(TITAN, "英雄巨人タイタス", "spirit", "blue", 8)
    chk(POISON, "ポイズンシュート", "magic", "purple", 5)
    chk(FLAME, "フレイムダンス", "magic", "red", 5)
    chk(DOUBLE, "ダブルドロー", "magic", "red", 4)
    chk(BEAM, "ビーム・ビートル", "brave", "green", 4)
    chk(FENRIR, "フェンリルキャノンType-B", "brave", "white", 4)
    chk(ANT, "用心棒アントマン", "spirit", "green", 4)
    chk(PAN, "魔界七将パンデミウム", "spirit", "purple", 8)
    chk(DORUKUSU, "風の覇王ドルクス・ウシワカ", "spirit", "green", 5)
    assert(getCard(P004).levels[1]!.bp === 7000 && getCard(P004).levels[1]!.cores === 4, "P004はLv2(コア4)BP7000")
    assert(getCard(BIANCO).levels[1]!.bp === 9000 && getCard(BIANCO).levels[1]!.cores === 2, "BIANCOはLv2(コア2)BP9000")
    assert(getCard(ROKU).levels[1]!.bp === 3000 && getCard(ROKU).levels[1]!.cores === 2, "ROKUはLv2(コア2)BP3000")
    assert(getCard(P025).levels[1]!.cores === 2 && getCard(P025).levels[1]!.bp === 4000, "P025はLv2(コア2)BP4000")
    assert(getCard("BS06-028").effects.length >= 0 && getCard(PX08).levels[1]!.bp === 11000, "PX08はLv2 BP11000")
    for (const id of [ROKU, METAL, HERA, HATCH, AIBURN, HYDRAM, HUMP, DARKLAYS, WINGAL, BIANCO, ANT, PAN]) assert(getCard(id).effects.length === 0 || id === PAN, `${id}は効果なしのスピリット（PANは召喚時効果なし）`)
}

function resolveAll(t: ScenarioCtx, prefer: string[] = [], who: "me" | "opp" | "auto" = "auto"): void {
    for (let i = 0; i < 30 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = who === "auto" ? (pc.pid === t.me ? "me" : "opp") : who
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
// 自分のターンのアタック宣言まで（バトルは進めない）
function declare(t: ScenarioCtx, label: string, prefer: string[] = []): void {
    if (t.state.phase === "main") t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id(label) })
    resolveAll(t, prefer)
}
// 自分のアタックを宣言し、相手がブロックして（または受けて）バトルを終える
function battle(t: ScenarioCtx, attacker: string, blocker: string | null, prefer: string[] = []): void {
    declare(t, attacker, prefer)
    t.closeFlash()
    if (blocker) t.act("opp", { type: "block", instanceId: t.id(blocker) })
    else t.act("opp", { type: "takeLife" })
    resolveAll(t, prefer)
    t.closeFlash()
    resolveAll(t, prefer)
}
// 相手のターンのアタック宣言から、自分がブロックして（または受けて）バトルを終える
function oppBattle(t: ScenarioCtx, attacker: string, blocker: string | null, prefer: string[] = []): void {
    t.act("opp", { type: "attack", instanceId: t.id(attacker) })
    resolveAll(t, prefer)
    t.closeFlash()
    if (blocker) t.act("me", { type: "block", instanceId: t.id(blocker) })
    else t.act("me", { type: "takeLife" })
    resolveAll(t, prefer)
    t.closeFlash()
    resolveAll(t, prefer)
}
const tired = (label: string) => `${label}.疲労: false → true`
// ブレイヴを手札から召喚して合体させたときの行（軽減後のコストと、ホストのBP加算）
const combined = (brave: string, cost: number, host: string, bpFrom: number, bpTo: number) => [
    `${brave}.場所: なし → 合体`,
    `${brave}.疲労: なし → false`,
    `${brave}.コア: なし → 0`,
    `${brave}.Lv: なし → 1`,
    `自分.リザーブ: 10 → ${10 - cost}`,
    `自分.トラッシュのコア: 0 → ${cost}`,
    `${host}.BP: ${bpFrom} → ${bpTo}`,
]
// 召喚で場に出た個体の5行
const entered = (label: string, cores: number, lv: number, bp: number) => [
    `${label}.場所: なし → フィールド`,
    `${label}.疲労: なし → false`,
    `${label}.コア: なし → ${cores}`,
    `${label}.Lv: なし → ${lv}`,
    `${label}.BP: なし → ${bp}`,
]
// 破壊されて場を離れたとき（コアはリザーブ、カードはトラッシュ）
const left = (label: string) => `${label}.場所: フィールド → なし`

// ================= P004 =================
console.log("=== 1. P004 アタック時：BPを比べ相手のスピリットだけを破壊したとき、疲労している相手のスピリット上のコア1個を相手のトラッシュに置く ===")
scenario({
    name: "p004-yes",
    start: { me: { spirits: [{ card: P004, cores: 4 }] }, opp: { spirits: [{ card: ROKU }, { card: METAL, cores: 2, rested: true }] } },
    steps: (t) => battle(t, "魔刃将ヘル・ブレド", "ロクケラトプス"),
    expect: [
        tired("自分.魔刃将ヘル・ブレド"),
        left("相手.ロクケラトプス"),
        "相手.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.メタルバーン.コア: 2 → 1",
        "相手.トラッシュのコア: 0 → 1",
    ],
})

console.log("=== 2. P004：双方が破壊されたら（相手のスピリットだけ、ではない）コアは動かない ===")
scenario({
    name: "p004-both-destroyed",
    start: { me: { spirits: [{ card: P004, cores: 1 }] }, opp: { spirits: [{ card: METAL }, { card: ROKU, cores: 2, rested: true }] } },
    steps: (t) => battle(t, "魔刃将ヘル・ブレド", "メタルバーン"),
    expect: [
        left("自分.魔刃将ヘル・ブレド"),
        "自分.リザーブ: 10 → 11",
        "自分.トラッシュ: なし → 魔刃将ヘル・ブレド",
        left("相手.メタルバーン"),
        "相手.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → メタルバーン",
    ],
})

// ================= P005 =================
console.log("=== 3. P005 アタック時：系統「歌鳥」のスピリットがいればBP+2000 ===")
scenario({
    name: "p005-yes",
    start: { me: { spirits: [{ card: P005 }, { card: HATCH }] } },
    steps: (t) => declare(t, "ガル・カルラ"),
    expect: [tired("自分.ガル・カルラ"), "自分.ガル・カルラ.BP: 2000 → 4000"],
})
console.log("=== 4. P005：歌鳥がいなければBPは上がらない ===")
scenario({
    name: "p005-no",
    start: { me: { spirits: [{ card: P005 }, { card: ROKU }] } },
    steps: (t) => declare(t, "ガル・カルラ"),
    expect: [tired("自分.ガル・カルラ")],
})

// ================= P010 =================
console.log("=== 5. P010 アタック時：系統「翼竜」のスピリットが2体以上（自身を含む）ならBP+1000 ===")
scenario({
    name: "p010-yes",
    start: { me: { spirits: [{ card: P010 }, { card: AIBURN }] } },
    steps: (t) => declare(t, "ケロロドラゴン"),
    expect: [tired("自分.ケロロドラゴン"), "自分.ケロロドラゴン.BP: 3000 → 4000"],
})
console.log("=== 6. P010：翼竜が自身だけ（1体）ならBPは上がらない ===")
scenario({
    name: "p010-no",
    start: { me: { spirits: [{ card: P010 }, { card: ROKU }] } },
    steps: (t) => declare(t, "ケロロドラゴン"),
    expect: [tired("自分.ケロロドラゴン")],
})

// ================= P014 =================
// トラッシュのコアは開始盤面に書けないので、steps の頭で 3 個にする（その差分 0 → 1 が expect に出る。3 個から 2 個を動かすため）
console.log("=== 7. P014 アタック時：自分のトラッシュからコア2個をリザーブに置く ===")
scenario({
    name: "p014-yes",
    start: { me: { spirits: [{ card: P014 }] } },
    steps: (t) => {
        t.state.players[t.me].trashCores = 3
        declare(t, "マンティスター")
    },
    expect: [tired("自分.マンティスター"), "自分.リザーブ: 10 → 12", "自分.トラッシュのコア: 0 → 1"],
})
console.log("=== 8. P014：トラッシュにコアが無ければ何も起きない ===")
scenario({
    name: "p014-no-core",
    start: { me: { spirits: [{ card: P014 }] } },
    steps: (t) => declare(t, "マンティスター"),
    expect: [tired("自分.マンティスター")],
})

// ================= P018 =================
console.log("=== 9. P018 アタック時：ボイドからコア1個を【暴風】を持つ自分のスピリット1体の上に置く ===")
scenario({
    name: "p018-yes",
    start: { me: { spirits: [{ card: P018 }, { card: GABU }, { card: ROKU }] } },
    steps: (t) => declare(t, "森林の偵察兵バタフラー"),
    expect: [tired("自分.森林の偵察兵バタフラー"), "自分.ガブノハシ.コア: 1 → 2"],
})
console.log("=== 10. P018：【暴風】を持つスピリットがいなければ何も起きない（P018自身は暴風を持たない） ===")
scenario({
    name: "p018-no",
    start: { me: { spirits: [{ card: P018 }, { card: ROKU }] } },
    steps: (t) => declare(t, "森林の偵察兵バタフラー"),
    expect: [tired("自分.森林の偵察兵バタフラー")],
})

// ================= P025 =================
console.log("=== 11. P025 召喚時：自分はデッキから1枚ドローする ===")
scenario({
    name: "p025-summon-draw",
    start: { me: { hand: [P025] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: マハーヴァスキ → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        ...entered("自分.マハーヴァスキ", 1, 1, 3000),
    ],
})
console.log("=== 12. P025 Lv2 破壊時：トラッシュの系統「妖蛇」のスピリットカード1枚を手札に戻す（妖蛇でないスピリットは戻さない） ===")
scenario({
    name: "p025-destroyed-lv2",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: P025, cores: 2 }], trash: [HYDRAM, ROKU] }, opp: { spirits: [{ card: WINGAL }] } },
    steps: (t) => oppBattle(t, "ウィンガル", "マハーヴァスキ"),
    expect: [
        tired("相手.ウィンガル"),
        left("自分.マハーヴァスキ"),
        "自分.リザーブ: 10 → 12",
        "自分.手札: なし → 双蛇ヒュドラム",
        "自分.トラッシュ: ロクケラトプス、双蛇ヒュドラム → マハーヴァスキ、ロクケラトプス",
    ],
})
console.log("=== 13. P025 Lv1 で破壊されても（破壊時はLv2･Lv3限定）手札には戻らない ===")
scenario({
    name: "p025-destroyed-lv1",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: P025, cores: 1 }], trash: [HYDRAM] }, opp: { spirits: [{ card: WINGAL }] } },
    steps: (t) => oppBattle(t, "ウィンガル", "マハーヴァスキ"),
    expect: [
        tired("相手.ウィンガル"),
        left("自分.マハーヴァスキ"),
        "自分.リザーブ: 10 → 11",
        "自分.トラッシュ: 双蛇ヒュドラム → マハーヴァスキ、双蛇ヒュドラム",
    ],
})

// ================= P030 =================
// 合体: 手札のブレイヴを自分のスピリット1体へ召喚して合体させる
console.log("=== 14. P030 合体アタック時：1枚ドローし、コスト4以下の相手のスピリットのコア1個を相手のリザーブに置く ===")
scenario({
    name: "p030-yes",
    start: { me: { hand: [P030], spirits: [{ card: DARKLAYS, cores: 3 }] }, opp: { spirits: [{ card: METAL, cores: 2 }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ダークレイス") })
        declare(t, "ダークレイス")
    },
    expect: [
        "自分.手札: 冥車輪ブェール → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        tired("自分.ダークレイス"),
        "相手.メタルバーン.コア: 2 → 1",
        "相手.リザーブ: 10 → 11",
        ...combined("自分.冥車輪ブェール", 3, "自分.ダークレイス", 4000, 6000),
    ],
})
console.log("=== 15. P030：相手のスピリットがコスト5以上ならコアは動かない（ドローは同時なので起きる） ===")
scenario({
    name: "p030-cost5",
    start: { me: { hand: [P030], spirits: [{ card: DARKLAYS, cores: 3 }] }, opp: { spirits: [{ card: HUMP, cores: 2 }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ダークレイス") })
        declare(t, "ダークレイス")
    },
    expect: [
        "自分.手札: 冥車輪ブェール → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        tired("自分.ダークレイス"),
        ...combined("自分.冥車輪ブェール", 3, "自分.ダークレイス", 4000, 6000),
    ],
})

// ================= P031 =================
console.log("=== 16. P031 召喚時：相手のスピリット1体を疲労させる ===")
scenario({
    name: "p031-summon",
    start: { me: { hand: [P031] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 飛甲虫イットウカブト → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "相手.ロクケラトプス.疲労: false → true",
        ...entered("自分.飛甲虫イットウカブト", 1, 1, 3000),
    ],
})
console.log("=== 17. P031 合体アタック時：自分のターンの最初のアタックなら回復する（疲労が残らない） ===")
scenario({
    name: "p031-first-attack",
    start: { me: { hand: [P031], spirits: [{ card: ANT }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("用心棒アントマン") })
        declare(t, "用心棒アントマン")
    },
    expect: ["自分.手札: 飛甲虫イットウカブト → なし", ...combined("自分.飛甲虫イットウカブト", 3, "自分.用心棒アントマン", 5000, 8000)],
})
console.log("=== 18. P031：最初のアタックでなければ（別のスピリットが先にアタックしていたら）回復しない ===")
scenario({
    name: "p031-second-attack",
    start: { me: { hand: [P031], spirits: [{ card: ANT }, { card: ROKU }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("用心棒アントマン") })
        battle(t, "ロクケラトプス", null)
        declare(t, "用心棒アントマン")
    },
    expect: ["自分.手札: 飛甲虫イットウカブト → なし", tired("自分.用心棒アントマン"), tired("自分.ロクケラトプス"), "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", ...combined("自分.飛甲虫イットウカブト", 3, "自分.用心棒アントマン", 5000, 8000)],
})

// ================= P035 =================
function cast(t: ScenarioCtx, side: "me" | "opp", hand: number, target?: string): void {
    t.act(side, target === undefined ? { type: "castMagic", handIndex: hand, timing: "flash" } : { type: "castMagic", handIndex: hand, timing: "flash", targetInstanceId: target })
    resolveAll(t)
}
const poisonCost = ["相手.手札: ポイズンシュート → なし", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 5", "相手.トラッシュ: なし → ポイズンシュート"]
console.log("=== 19. P035 Lv1･Lv2：相手の効果で、名前に「月光」を含む自分のスピリット上のコアは取り除かれない ===")
scenario({
    name: "p035-protected",
    start: { turn: "opp", me: { spirits: [{ card: P035, cores: 2 }] }, opp: { hand: [POISON] } },
    steps: (t) => cast(t, "opp", 0, t.id("自分.月光武者ヘイケ・ボルタ")),
    expect: poisonCost,
})
console.log("=== 20. P035：名前に「月光」を含まない自分のスピリット上のコアは取り除かれる ===")
scenario({
    name: "p035-unprotected",
    start: { turn: "opp", me: { spirits: [{ card: P035, cores: 2 }, { card: ROKU, cores: 2 }] }, opp: { hand: [POISON] } },
    steps: (t) => cast(t, "opp", 0, t.id("自分.ロクケラトプス")),
    expect: [...poisonCost, "自分.ロクケラトプス.コア: 2 → 1", "自分.ロクケラトプス.Lv: 2 → 1", "自分.ロクケラトプス.BP: 3000 → 1000", "自分.リザーブ: 10 → 11"],
})
console.log("=== 21. P035【合体時】Lv2：ブレイヴと合体していて、自分のスピリットのコアが相手の効果で取り除かれたら、1個につき相手のスピリット上のコア1個をボイドに置く ===")
scenario({
    name: "p035-combined",
    start: { turn: "opp", me: { hand: [BEAM], spirits: [{ card: P035, cores: 3 }, { card: ROKU, cores: 2 }] }, opp: { hand: [POISON], spirits: [{ card: METAL, cores: 2 }] } },
    steps: (t) => {
        // 合体は自分のターンのメインでしかできないので、先に自分のターンで合体させてから相手のターンに移す
        t.state.turnPlayer = t.me
        t.state.priorityPlayer = t.me
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("自分.月光武者ヘイケ・ボルタ") })
        t.state.turnPlayer = t.opp
        t.state.priorityPlayer = t.opp
        cast(t, "opp", 0, t.id("自分.ロクケラトプス"))
    },
    expect: [...poisonCost, "自分.ロクケラトプス.コア: 2 → 1", "自分.ロクケラトプス.Lv: 2 → 1", "自分.ロクケラトプス.BP: 3000 → 1000", "相手.メタルバーン.コア: 2 → 1", "自分.手札: ビーム・ビートル → なし", ...combined("自分.ビーム・ビートル", 3, "自分.月光武者ヘイケ・ボルタ", 7000, 9000).filter((l) => !l.startsWith("自分.リザーブ")), "自分.リザーブ: 10 → 8"],
})
console.log("=== 22. P035【合体時】Lv2：合体していなければ相手のスピリットのコアは動かない ===")
scenario({
    name: "p035-not-combined",
    start: { turn: "opp", me: { spirits: [{ card: P035, cores: 3 }, { card: ROKU, cores: 2 }] }, opp: { hand: [POISON], spirits: [{ card: METAL, cores: 2 }] } },
    steps: (t) => cast(t, "opp", 0, t.id("自分.ロクケラトプス")),
    expect: [...poisonCost, "自分.ロクケラトプス.コア: 2 → 1", "自分.ロクケラトプス.Lv: 2 → 1", "自分.ロクケラトプス.BP: 3000 → 1000", "自分.リザーブ: 10 → 11"],
})

// ================= P042 =================
console.log("=== 23. P042 フラッシュ【神速】：相手のアタック中に、手札から召喚コストと上に置くコアをリザーブで払って召喚できる ===")
scenario({
    name: "p042-shinsoku",
    start: { turn: "opp", phase: "attack", me: { hand: [P042] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        tired("相手.ロクケラトプス"),
        "自分.手札: シールディバグ → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        ...entered("自分.シールディバグ", 1, 1, 3000),
    ],
})
console.log("=== 24. P042 合体時『バトル時』：BPを比べ相手のスピリットだけを破壊したとき回復する ===")
scenario({
    name: "p042-recover",
    start: { me: { hand: [P042], spirits: [{ card: HERA }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ヘラクレス・ジオ") })
        battle(t, "ヘラクレス・ジオ", "ロクケラトプス")
    },
    expect: ["自分.手札: シールディバグ → なし", left("相手.ロクケラトプス"), "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス", ...combined("自分.シールディバグ", 3, "自分.ヘラクレス・ジオ", 4000, 8000)],
})
console.log("=== 25. P042：ブロックされずBP比較がなければ回復しない ===")
scenario({
    name: "p042-unblocked",
    start: { me: { hand: [P042], spirits: [{ card: HERA }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ヘラクレス・ジオ") })
        battle(t, "ヘラクレス・ジオ", null)
    },
    expect: ["自分.手札: シールディバグ → なし", tired("自分.ヘラクレス・ジオ"), "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", ...combined("自分.シールディバグ", 3, "自分.ヘラクレス・ジオ", 4000, 8000)],
})

// ================= P051 =================
// 相手のターンのメインで、召喚時効果を持つスピリット（スケル・バイパー）を召喚させる
const oppSummonSkelby = ["相手.手札: スケル・バイパー → ロクケラトプス", "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4", ...entered("相手.スケル・バイパー", 1, 1, 3000)]
console.log("=== 26. P051 バースト：相手の召喚時発揮後、【暴風】を持つ自分のスピリット1体を手札に戻すことで、コストを支払わず召喚する ===")
scenario({
    name: "p051-burst",
    start: { turn: "opp", me: { burst: P051, spirits: [{ card: GABU }] }, opp: { hand: [SKELBY] } },
    steps: (t) => {
        t.act("opp", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [
        ...oppSummonSkelby,
        "自分.バースト: 小さな侍イッスンアントマン → なし",
        "自分.手札: なし → ガブノハシ",
        left("自分.ガブノハシ"),
        ...entered("自分.小さな侍イッスンアントマン", 1, 1, 3000),
    ],
})
console.log("=== 27. P051 バースト：相手が召喚時効果を持たないスピリットを召喚しても発動しない ===")
scenario({
    name: "p051-burst-no-trigger",
    start: { turn: "opp", me: { burst: P051, spirits: [{ card: GABU }] }, opp: { hand: [ROKU] } },
    steps: (t) => {
        t.act("opp", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: ["相手.手札: ロクケラトプス → なし", "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 1", ...entered("相手.ロクケラトプス", 1, 1, 1000)],
})
console.log("=== 28. P051 Lv2 相手のアタックステップ開始時：このスピリットを疲労させることで、相手のスピリット1体を疲労させる ===")
scenario({
    name: "p051-lv2-step",
    start: { turn: "opp", me: { spirits: [{ card: P051, cores: 3 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        resolveAll(t)
    },
    expect: [tired("自分.小さな侍イッスンアントマン"), tired("相手.ロクケラトプス")],
})
console.log("=== 29. P051：Lv1 ではステップ開始時の効果は無い ===")
scenario({
    name: "p051-lv1-step",
    start: { turn: "opp", me: { spirits: [{ card: P051, cores: 1 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        resolveAll(t)
    },
    expect: [],
})

// ================= P057 =================
console.log("=== 30. P057【不死：コスト5/6】：自分のコスト5のスピリットが破壊されたとき、トラッシュからこのスピリットを召喚できる ===")
scenario({
    name: "p057-fushi",
    start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [{ card: HUMP }], trash: [P057] }, opp: { spirits: [{ card: WINGAL }] } },
    steps: (t) => oppBattle(t, "ウィンガル", "メガ・ハンプダンプ", ["闇騎士ガレス"]),
    expect: [
        tired("相手.ウィンガル"),
        left("自分.メガ・ハンプダンプ"),
        "自分.トラッシュ: 闇騎士ガレス → メガ・ハンプダンプ",
        ...entered("自分.闇騎士ガレス", 1, 1, 3000),
        "自分.リザーブ: 10 → 7", // 軽減後のコスト3＋上に置く1個を払い、破壊されたハンプダンプのコア1個が戻る（破壊されたスピリットのシンボルも軽減に数える）
        "自分.トラッシュのコア: 0 → 3",
    ],
})
console.log("=== 31. P057【不死：コスト5/6】：コスト4のスピリットが破壊されても召喚できない ===")
scenario({
    name: "p057-fushi-cost4",
    start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [{ card: DARKLAYS }], trash: [P057] }, opp: { spirits: [{ card: WINGAL }] } },
    steps: (t) => oppBattle(t, "ウィンガル", "ダークレイス"),
    expect: [tired("相手.ウィンガル"), left("自分.ダークレイス"), "自分.リザーブ: 10 → 11", "自分.トラッシュ: 闇騎士ガレス → ダークレイス、闇騎士ガレス"],
})
// 相手のアタック宣言の直後（フラッシュタイミング）に、相手がフレイムダンスで自分のロクケラトプスを破壊する
function flameInBattle(t: ScenarioCtx): void {
    t.act("opp", { type: "attack", instanceId: t.id("ウィンガル") })
    t.act("me", { type: "pass" }) // 防御側が先に優先権を持つので、パスして相手にフラッシュの機会を渡す
    cast(t, "opp", 0, t.id("自分.ロクケラトプス"))
}
const flameCost = ["相手.手札: フレイムダンス → なし", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 5", "相手.トラッシュ: なし → フレイムダンス"]
console.log("=== 32. P057 Lv2『お互いのアタックステップ』：相手の効果で自分のスピリットが破壊されたとき、自分のトラッシュのコア1個をリザーブに置く ===")
scenario({
    name: "p057-core",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: P057, cores: 2 }, { card: ROKU }] }, opp: { hand: [FLAME], spirits: [{ card: WINGAL }] } },
    steps: (t) => {
        t.state.players[t.me].trashCores = 3
        flameInBattle(t)
    },
    expect: [tired("相手.ウィンガル"), ...flameCost, left("自分.ロクケラトプス"), "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 12", "自分.トラッシュのコア: 0 → 2"],
})
console.log("=== 33. P057 Lv2：バトルでの破壊（相手の効果ではない）ではトラッシュのコアは動かない ===")
scenario({
    name: "p057-core-battle",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: P057, cores: 2 }, { card: ROKU }] }, opp: { spirits: [{ card: WINGAL }] } },
    steps: (t) => {
        t.state.players[t.me].trashCores = 3
        oppBattle(t, "ウィンガル", "ロクケラトプス")
    },
    expect: [tired("相手.ウィンガル"), left("自分.ロクケラトプス"), "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11", "自分.トラッシュのコア: 0 → 3"],
})
console.log("=== 34. P057 Lv1 ではトラッシュのコアは動かない（Lv2･Lv3 の効果） ===")
scenario({
    name: "p057-core-lv1",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: P057, cores: 1 }, { card: ROKU }] }, opp: { hand: [FLAME], spirits: [{ card: WINGAL }] } },
    steps: (t) => {
        t.state.players[t.me].trashCores = 3
        flameInBattle(t)
    },
    expect: [tired("相手.ウィンガル"), ...flameCost, left("自分.ロクケラトプス"), "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11", "自分.トラッシュのコア: 0 → 3"],
})

// ================= P061 =================
console.log("=== 35. P061【不死：コスト4】：自分のコスト4のスピリットが破壊されたとき、トラッシュからこのスピリットを召喚できる ===")
scenario({
    name: "p061-fushi",
    start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [{ card: DARKLAYS }], trash: [P061] }, opp: { spirits: [{ card: WINGAL }] } },
    steps: (t) => oppBattle(t, "ウィンガル", "ダークレイス", ["怪盗ヴァンビット"]),
    expect: [
        tired("相手.ウィンガル"),
        left("自分.ダークレイス"),
        "自分.トラッシュ: 怪盗ヴァンビット → ダークレイス",
        ...entered("自分.怪盗ヴァンビット", 1, 1, 2000),
        "自分.リザーブ: 10 → 8", // 軽減後のコスト2＋上に置く1個を払い、破壊されたダークレイスのコア1個が戻る
        "自分.トラッシュのコア: 0 → 2",
    ],
})
const deck10 = Array.from({ length: 10 }, () => "ロクケラトプス").join("、")
console.log("=== 36. P061：相手のスピリットの効果で自分のデッキが1度に10枚以上破棄されたとき、相手のライフのコア2個を相手のリザーブに置く ===")
scenario({
    name: "p061-mill10",
    start: { turn: "opp", me: { spirits: [{ card: P061 }] }, opp: { hand: [TITAN] } },
    steps: (t) => {
        t.act("opp", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [
        "相手.手札: 英雄巨人タイタス → なし",
        "相手.リザーブ: 10 → 3",
        "相手.トラッシュのコア: 0 → 8",
        "相手.ライフ: 5 → 3",
        ...entered("相手.英雄巨人タイタス", 1, 1, 6000),
        "自分.デッキ枚数: 40 → 30",
        `自分.トラッシュ: なし → ${deck10}`,
    ],
})
console.log("=== 37. P061：デッキが10枚に満たず、実際に破棄された枚数が9枚以下なら何も起きない ===")
scenario({
    name: "p061-mill9",
    start: { turn: "opp", me: { spirits: [{ card: P061 }], deck: Array.from({ length: 9 }, () => ROKU) }, opp: { hand: [TITAN] } },
    steps: (t) => {
        t.act("opp", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [
        "相手.手札: 英雄巨人タイタス → なし",
        "相手.リザーブ: 10 → 1",
        "相手.トラッシュのコア: 0 → 8",
        ...entered("相手.英雄巨人タイタス", 1, 1, 6000),
        "自分.デッキ枚数: 9 → 0",
        `自分.トラッシュ: なし → ${Array.from({ length: 9 }, () => "ロクケラトプス").join("、")}`,
    ],
})

// ================= P062 =================
console.log("=== 38. P062【暴風：1】：ブロックされたとき、相手が相手のスピリット1体を疲労させる（選ぶのは相手） ===")
scenario({
    name: "p062-bofu",
    start: { interactive: true, me: { spirits: [{ card: P062 }] }, opp: { spirits: [{ card: ROKU }, { card: HERA }] } },
    steps: (t) => {
        declare(t, "カヒョウエン")
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        resolveAll(t, ["相手.ヘラクレス・ジオ"], "opp")
        t.closeFlash()
        resolveAll(t)
    },
    expect: [tired("自分.カヒョウエン"), "相手.ヘラクレス・ジオ.疲労: false → true", left("相手.ロクケラトプス"), "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})
console.log("=== 39. P062 Lv2：【暴風：1】を持つ自分のスピリットのアタックで相手のライフを減らしたとき、相手のスピリット1体を疲労させる ===")
scenario({
    name: "p062-lv2-life",
    start: { me: { spirits: [{ card: P062, cores: 3 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => battle(t, "カヒョウエン", null),
    expect: [tired("自分.カヒョウエン"), "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", tired("相手.ロクケラトプス")],
})
console.log("=== 40. P062 Lv1 ではライフを減らしても相手のスピリットは疲労しない（Lv2 の効果） ===")
scenario({
    name: "p062-lv1-life",
    start: { me: { spirits: [{ card: P062, cores: 1 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => battle(t, "カヒョウエン", null),
    expect: [tired("自分.カヒョウエン"), "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ================= P066 =================
console.log("=== 41. P066：シンボルは赤/紫/白/黄/青としても扱う（赤の軽減シンボルとして火吹きメルトのコストを下げる） ===")
const MELT = "BS03-009" // 火吹きメルト（赤・コスト5・効果なし・軽減は赤3つ・Lv1 BP4000）
assert(getCard(MELT).name === "火吹きメルト" && getCard(MELT).effects.length === 0 && getCard(MELT).reduction.join() === "red,red,red", "MELTは効果なしで軽減が赤3つ")
scenario({
    name: "p066-symbol",
    start: { me: { hand: [MELT], spirits: [{ card: P066 }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: ["自分.手札: 火吹きメルト → なし", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 4", ...entered("自分.火吹きメルト", 1, 1, 4000)],
})
console.log("=== 42. P066：緑のスピリット1体だけ（P066ではない）では赤の軽減は効かない ===")
scenario({
    name: "p066-control",
    start: { me: { hand: [MELT], spirits: [{ card: HERA }] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: ["自分.手札: 火吹きメルト → なし", "自分.リザーブ: 10 → 4", "自分.トラッシュのコア: 0 → 5", ...entered("自分.火吹きメルト", 1, 1, 4000)],
})

// ================= P068 =================
console.log("=== 43. P068 バースト：コア1個の相手のスピリットすべてを疲労させ、その後コストを支払ってフラッシュ効果（自分のスピリットとドルクス/ベンケイにコアを置く） ===")
scenario({
    name: "p068-burst",
    start: { turn: "opp", phase: "attack", interactive: true, me: { burst: P068, spirits: [{ card: HERA }, { card: DORUKUSU }] }, opp: { spirits: [{ card: WINGAL }, { card: ROKU }, { card: METAL, cores: 2 }] } },
    steps: (t) => oppBattle(t, "ウィンガル", null, ["自分.ヘラクレス・ジオ", "自分.風の覇王ドルクス・ウシワカ"]),
    expect: [
        tired("相手.ウィンガル"),
        tired("相手.ロクケラトプス"),
        "自分.ライフ: 5 → 4",
        "自分.バースト: 疾風弾導破 → なし",
        "自分.トラッシュ: なし → 疾風弾導破",
        "自分.ヘラクレス・ジオ.コア: 1 → 2",
        "自分.風の覇王ドルクス・ウシワカ.コア: 1 → 2",
        "自分.リザーブ: 10 → 8", // ライフ減少で+1、軽減後のコスト3を払う
        "自分.トラッシュのコア: 0 → 3",
    ],
})
console.log("=== 44. P068：コストを支払えなければ疲労だけ行い、フラッシュ効果は発揮しない（リザーブ0・ライフ1個がリザーブに来ても4個に満たない） ===")
scenario({
    name: "p068-cant-pay",
    start: { turn: "opp", phase: "attack", interactive: true, me: { reserve: 0, burst: P068, spirits: [{ card: HERA }, { card: DORUKUSU }] }, opp: { spirits: [{ card: WINGAL }, { card: ROKU }, { card: METAL, cores: 2 }] } },
    steps: (t) => oppBattle(t, "ウィンガル", null),
    expect: [tired("相手.ウィンガル"), tired("相手.ロクケラトプス"), "自分.ライフ: 5 → 4", "自分.リザーブ: 0 → 1", "自分.バースト: 疾風弾導破 → なし", "自分.トラッシュ: なし → 疾風弾導破"],
})

// ================= P073 =================
console.log("=== 45. P073 バースト：相手の召喚時発揮後、このスピリットカードを召喚する ===")
scenario({
    name: "p073-burst",
    start: { turn: "opp", me: { burst: P073, trash: [FENRIR] }, opp: { hand: [SKELBY] } },
    steps: (t) => {
        t.act("opp", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [...oppSummonSkelby, "自分.バースト: 闇騎士トリスタン → なし", "自分.リザーブ: 10 → 9", ...entered("自分.闇騎士トリスタン", 1, 1, 3000)],
})
console.log("=== 46. P073【不死：コスト6/7】で召喚されたとき、トラッシュのブレイヴ1枚をコストを支払わず召喚できる ===")
scenario({
    name: "p073-fushi",
    start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [{ card: HYDRAM }], trash: [P073, FENRIR] }, opp: { spirits: [{ card: WINGAL }] } },
    steps: (t) => oppBattle(t, "ウィンガル", "双蛇ヒュドラム", ["闇騎士トリスタン", "フェンリルキャノンType-B"]),
    expect: [
        tired("相手.ウィンガル"),
        left("自分.双蛇ヒュドラム"),
        "自分.トラッシュ: フェンリルキャノンType-B、闇騎士トリスタン → 双蛇ヒュドラム",
        ...entered("自分.闇騎士トリスタン", 1, 1, 3000),
        ...entered("自分.フェンリルキャノンType-B", 1, 1, 3000),
        "自分.リザーブ: 10 → 5", // ヒュドラムのコア1個が戻り、軽減後のコスト4と上に置く1個、無償召喚したブレイヴの上に置く1個を払う
        "自分.トラッシュのコア: 0 → 4",
    ],
})

// ================= PX03 =================
console.log("=== 47. PX03 召喚時：ボイドから、コア1個ずつを自分のスピリットすべての上に置く（自身を含む。相手のスピリットには置かない） ===")
scenario({
    name: "px03-summon",
    start: { me: { hand: [PX03], spirits: [{ card: HERA }, { card: METAL }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 獣槍王ギガ・ガルレイヴ → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 7",
        "自分.ヘラクレス・ジオ.コア: 1 → 2",
        "自分.メタルバーン.コア: 1 → 2",
        ...entered("自分.獣槍王ギガ・ガルレイヴ", 2, 1, 4000),
    ],
})
console.log("=== 48. PX03 Lv2 アタック時：ボイドから、コア1個を自分のリザーブに置く ===")
scenario({
    name: "px03-attack-lv2",
    start: { me: { spirits: [{ card: PX03, cores: 3 }] } },
    steps: (t) => declare(t, "獣槍王ギガ・ガルレイヴ"),
    expect: [tired("自分.獣槍王ギガ・ガルレイヴ"), "自分.リザーブ: 10 → 11"],
})
console.log("=== 49. PX03 Lv1 ではアタック時の効果は無い（Lv2 の効果） ===")
scenario({
    name: "px03-attack-lv1",
    start: { me: { spirits: [{ card: PX03, cores: 1 }] } },
    steps: (t) => declare(t, "獣槍王ギガ・ガルレイヴ"),
    expect: [tired("自分.獣槍王ギガ・ガルレイヴ")],
})

// ================= PX04 =================
console.log("=== 50. PX04 召喚時：コア1個だけしか置かれていない相手のスピリットすべてを疲労させる ===")
scenario({
    name: "px04-summon",
    start: { me: { hand: [PX04] }, opp: { spirits: [{ card: ROKU }, { card: HERA }, { card: METAL, cores: 2 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: 魔神王エル・ブラド → なし",
        "自分.リザーブ: 10 → 1",
        "自分.トラッシュのコア: 0 → 8",
        ...entered("自分.魔神王エル・ブラド", 1, 1, 5000),
        tired("相手.ロクケラトプス"),
        tired("相手.ヘラクレス・ジオ"),
    ],
})
console.log("=== 51. PX04 Lv2 アタック時：自分はデッキから1枚ドローする ===")
scenario({
    name: "px04-attack-lv2",
    start: { me: { spirits: [{ card: PX04, cores: 4 }] } },
    steps: (t) => declare(t, "魔神王エル・ブラド"),
    expect: [tired("自分.魔神王エル・ブラド"), "自分.手札: なし → ロクケラトプス", "自分.デッキ枚数: 40 → 39"],
})
console.log("=== 52. PX04 Lv1 ではドローしない（Lv2･Lv3 の効果） ===")
scenario({
    name: "px04-attack-lv1",
    start: { me: { spirits: [{ card: PX04, cores: 1 }] } },
    steps: (t) => declare(t, "魔神王エル・ブラド"),
    expect: [tired("自分.魔神王エル・ブラド")],
})

// ================= PX08 =================
console.log("=== 53. PX08【氷壁：紫/白/青】：相手が紫のマジックの効果を使用したとき、このスピリットを疲労させることで効果を無効にする ===")
scenario({
    name: "px08-hyoheki",
    start: { turn: "opp", me: { spirits: [{ card: PX08 }, { card: ROKU, cores: 2 }] }, opp: { hand: [POISON] } },
    steps: (t) => cast(t, "opp", 0, t.id("自分.ロクケラトプス")),
    expect: [...poisonCost, tired("自分.甲蟲武神ギラファ・ランドウ")],
})
console.log("=== 54. PX08【氷壁】：赤のマジックには反応しない（ポイズンシュートでなくダブルドローを使用） ===")
scenario({
    name: "px08-hyoheki-red",
    start: { turn: "opp", me: { spirits: [{ card: PX08 }] }, opp: { hand: [DOUBLE] } },
    steps: (t) => {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
        resolveAll(t)
    },
    expect: ["相手.手札: ダブルドロー → ロクケラトプス、ロクケラトプス", "相手.デッキ枚数: 40 → 38", "相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 4", "相手.トラッシュ: なし → ダブルドロー"],
})
console.log("=== 55. PX08『相手のアタックステップ』：疲労状態でもブロックできる（他の疲労スピリットはできない） ===")
scenario({
    name: "px08-block-rested",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: PX08, rested: true }, { card: ROKU, rested: true }] }, opp: { spirits: [{ card: WINGAL }] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("ウィンガル") })
        t.closeFlash()
        t.actRejected("me", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.act("me", { type: "block", instanceId: t.id("甲蟲武神ギラファ・ランドウ") })
        t.closeFlash()
    },
    expect: [left("相手.ウィンガル"), "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ウィンガル"],
})
console.log("=== 56. PX08 Lv2 アタック時：BPを比べ相手のスピリットだけを破壊したとき、回復し、相手のスピリット1体を疲労させる ===")
scenario({
    name: "px08-lv2-attack",
    start: { me: { spirits: [{ card: PX08, cores: 4 }] }, opp: { spirits: [{ card: ROKU }, { card: HERA }] } },
    steps: (t) => battle(t, "甲蟲武神ギラファ・ランドウ", "ロクケラトプス"),
    expect: [left("相手.ロクケラトプス"), "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス", tired("相手.ヘラクレス・ジオ")],
})
console.log("=== 57. PX08 Lv1 ではアタック時の回復・疲労の効果は無い（Lv2 の効果） ===")
scenario({
    name: "px08-lv1-attack",
    start: { me: { spirits: [{ card: PX08, cores: 1 }] }, opp: { spirits: [{ card: ROKU }, { card: HERA }] } },
    steps: (t) => battle(t, "甲蟲武神ギラファ・ランドウ", "ロクケラトプス"),
    expect: [tired("自分.甲蟲武神ギラファ・ランドウ"), left("相手.ロクケラトプス"), "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ロクケラトプス"],
})

// ================= PX16 =================
console.log("=== 58. PX16 召喚時：トラッシュの名前に「魔界七将」を含むスピリットカード1枚を、コストを支払わず召喚できる ===")
scenario({
    name: "px16-summon",
    start: { me: { reserve: 12, hand: [PX16], trash: [PAN, ROKU] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: [
        "自分.手札: 魔界七将ベリオット → なし",
        "自分.リザーブ: 12 → 2",
        "自分.トラッシュのコア: 0 → 8",
        "自分.トラッシュ: ロクケラトプス、魔界七将パンデミウム → ロクケラトプス",
        ...entered("自分.魔界七将ベリオット", 1, 1, 6000),
        ...entered("自分.魔界七将パンデミウム", 1, 1, 5000),
    ],
})
console.log("=== 59. PX16：トラッシュに「魔界七将」のスピリットがなければ召喚しない ===")
scenario({
    name: "px16-summon-none",
    start: { me: { reserve: 12, hand: [PX16], trash: [ROKU] } },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        resolveAll(t)
    },
    expect: ["自分.手札: 魔界七将ベリオット → なし", "自分.リザーブ: 12 → 3", "自分.トラッシュのコア: 0 → 8", ...entered("自分.魔界七将ベリオット", 1, 1, 6000)],
})
console.log("=== 60. PX16 破壊時：相手のフィールドのコア1個を相手のトラッシュに置く ===")
scenario({
    name: "px16-destroyed",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: PX16 }] }, opp: { spirits: [{ card: BIANCO, cores: 2 }] } },
    steps: (t) => oppBattle(t, "ビアンコ・ティーガー", "魔界七将ベリオット"),
    expect: [
        tired("相手.ビアンコ・ティーガー"),
        left("自分.魔界七将ベリオット"),
        "自分.リザーブ: 10 → 11",
        "自分.トラッシュ: なし → 魔界七将ベリオット",
        "相手.ビアンコ・ティーガー.コア: 2 → 1",
        "相手.ビアンコ・ティーガー.Lv: 2 → 1",
        "相手.ビアンコ・ティーガー.BP: 9000 → 5000",
        "相手.トラッシュのコア: 0 → 1",
    ],
})
console.log("=== 61. PX16 Lv2 アタック時：自分のスピリット1体が持つ『破壊時』効果1つを、破壊させずに発揮させる（P025の破壊時でトラッシュの妖蛇を手札へ） ===")
scenario({
    name: "px16-attack-lv2",
    start: { interactive: true, me: { spirits: [{ card: PX16, cores: 3 }, { card: P025, cores: 2 }], trash: [HYDRAM] } },
    steps: (t) => declare(t, "魔界七将ベリオット", ["自分.マハーヴァスキ"]),
    expect: [tired("自分.魔界七将ベリオット"), "自分.手札: なし → 双蛇ヒュドラム", "自分.トラッシュ: 双蛇ヒュドラム → なし"],
})
console.log("=== 62. PX16 Lv1 ではアタック時の効果は無い（Lv2･Lv3 の効果） ===")
scenario({
    name: "px16-attack-lv1",
    start: { interactive: true, me: { spirits: [{ card: PX16, cores: 1 }, { card: P025, cores: 2 }], trash: [HYDRAM] } },
    steps: (t) => declare(t, "魔界七将ベリオット"),
    expect: [tired("自分.魔界七将ベリオット")],
})

console.log("すべてのチェックに合格しました 🎉（part721）")
