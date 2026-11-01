// smoke パート726（BS19 【強化】：BS19-009/017/029/038/052/057 の「強化」の行。BS19_PLAN §2.1 Q753〜Q770）
// 期待値役が効果文とカードの属性だけから書いた場面テスト。BS19 の effects はまだ空なので、強化が効く場面はいまは落ちてよい
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

// 【強化】持ち（色ごとに1種）
const DAMASCUS = "BS19-009" // 流星の剣使いダマスクス（赤・剣使/星竜・コスト5）Lv1〜Lv3【強化】BP破壊効果の上限+1000
const SIDRON = "BS19-017" // 大蛇サイドロン（紫・妖蛇・コスト4）Lv2〜Lv3【強化】コア除去効果でリザーブに置くコア+1個
const KIGASHIRA = "BS19-029" // キガシライト（緑・爪鳥・コスト4）Lv2【強化】相手への疲労効果の体数+1体
const CURIOSITY = "BS19-038" // 近衛機キュリオシティ（白・武装・コスト4）Lv1〜Lv2【強化】スピリット回復効果の体数+1体
const SNIPLE = "BS19-052" // 天使スナイプル（黄・天霊・コスト4）Lv1〜Lv3【強化】BP-効果を-1000
const ADRIAN = "BS19-057" // 光の衛士アドリアン（青・闘神・コスト1）Lv1〜Lv2【強化】相手へのデッキ破棄効果の枚数+1枚

// 増やされる側（既存の弾。効果が正しく働くことは前提）
const ARDER = "BS17-073" // アーダーフレイム（赤・マジック・コスト4）フラッシュ：BP4000以下の相手のスピリット1体を破壊する
const STRANGLE = "BS17-075" // ストラングルフォッグ（紫・マジック・コスト4）フラッシュ：相手のスピリットのコア1個を相手のリザーブに置く
const BINDING = "BS01-134" // バインディングソーン（緑・マジック・コスト2）フラッシュ：相手のスピリット1体を疲労させる
const POTION = "BS02-102" // ホワイトポーション（白・マジック・コスト4）フラッシュ：自分のスピリット1体を回復させる
const HAMMER = "BS03-144" // マジックハンマー（青・マジック・コスト4）メイン：相手のデッキを上から5枚破棄する
const DRILL = "BS04-111" // マジックドリル（青・マジック・コスト3）メイン：相手のデッキを上から、相手の手札1枚につき1枚破棄する
const PRESSURE = "BS19-109" // エンジェリックプレッシャー（黄・マジック・コスト3）フラッシュ：このターンの間、相手のスピリット1体をBP-3000する（BS01〜18にBP-効果は無いのでBS19から）

// 脇役
const ROKU = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・BP1000）
const AIBAN = "BS01-005" // アイバーン（赤・翼竜・コスト2・BP2000）
const HADES = "BS01-031" // デス・ハーデス（紫・呪鬼・コスト3・BP4000）
const WINGAL = "BS02-046" // ウィンガル（白・武装・コスト6・Lv1 BP5000／Lv2 BP6000）
const JUGON = "BS03-042" // 海獣ジューゴン（白・巨獣・コスト4・バニラ）
const PONISAS = "BS03-063" // ポニサス（黄・想獣・コスト5・バニラ）
const GASTON = "BS12-003" // 鎧竜人ガストン（赤・地竜/竜人・コスト3・Lv1 BP3000）破壊時：このスピリットのBP以下の相手のスピリット/ブレイヴ1つを破壊
const KAISAR = "BS02-036" // カイザレオン大帝（緑・剣獣・コスト7・Lv2 BP15000）アタック時勝利で相手のライフのコア1個を相手のリザーブに
const BRAN = "BS01-071" // 爆進獣ブランボアー（緑・剣獣・コスト6・Lv2 BP9000）バトル時勝利でこのスピリットは回復する

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    const chk = (id: string, name: string, type: string, color: string, cost: number) =>
        assert(c(id).name === name && c(id).type === type && c(id).colors.join() === color && c(id).cost === cost, `${id}は${color}の${type}「${name}」コスト${cost}`)
    chk(DAMASCUS, "流星の剣使いダマスクス", "spirit", "red", 5)
    chk(SIDRON, "大蛇サイドロン", "spirit", "purple", 4)
    chk(KIGASHIRA, "キガシライト", "spirit", "green", 4)
    chk(CURIOSITY, "近衛機キュリオシティ", "spirit", "white", 4)
    chk(SNIPLE, "天使スナイプル", "spirit", "yellow", 4)
    chk(ADRIAN, "光の衛士アドリアン", "spirit", "blue", 1)
    chk(ARDER, "アーダーフレイム", "magic", "red", 4)
    chk(STRANGLE, "ストラングルフォッグ", "magic", "purple", 4)
    chk(BINDING, "バインディングソーン", "magic", "green", 2)
    chk(POTION, "ホワイトポーション", "magic", "white", 4)
    chk(HAMMER, "マジックハンマー", "magic", "blue", 4)
    chk(DRILL, "マジックドリル", "magic", "blue", 3)
    chk(PRESSURE, "エンジェリックプレッシャー", "magic", "yellow", 3)
    chk(ROKU, "ロクケラトプス", "spirit", "red", 1)
    chk(AIBAN, "アイバーン", "spirit", "red", 2)
    chk(HADES, "デス・ハーデス", "spirit", "purple", 3)
    chk(WINGAL, "ウィンガル", "spirit", "white", 6)
    chk(JUGON, "海獣ジューゴン", "spirit", "white", 4)
    chk(PONISAS, "ポニサス", "spirit", "yellow", 5)
    chk(GASTON, "鎧竜人ガストン", "spirit", "red", 3)
    chk(KAISAR, "カイザレオン大帝", "spirit", "green", 7)
    chk(BRAN, "爆進獣ブランボアー", "spirit", "green", 6)
    assert(c(DAMASCUS).family.join() === "剣使,星竜" && c(SIDRON).family.join() === "妖蛇" && c(KIGASHIRA).family.join() === "爪鳥", "強化持ちの系統（赤・紫・緑）")
    assert(c(CURIOSITY).family.join() === "武装" && c(SNIPLE).family.join() === "天霊" && c(ADRIAN).family.join() === "闘神", "強化持ちの系統（白・黄・青）")
    assert(c(ROKU).family.join() === "地竜" && c(HADES).family.join() === "呪鬼" && c(WINGAL).family.join() === "武装", "脇役の系統")
    assert(c(JUGON).family.join() === "巨獣" && c(PONISAS).family.join() === "想獣" && c(GASTON).family.join() === "地竜,竜人", "脇役の系統2")
    assert(c(KAISAR).family.join() === "剣獣" && c(BRAN).family.join() === "剣獣" && c(AIBAN).family.join() === "翼竜", "脇役の系統3")
    // 強化の行の Lv と、境界に使うBP
    assert(c(DAMASCUS).levels[0]!.bp === 4000 && c(SIDRON).levels[1]!.cores === 3 && c(KIGASHIRA).levels[1]!.cores === 3, "ダマスクスはLv1から、サイドロンとキガシライトの強化はLv2から")
    assert(c(CURIOSITY).levels[1]!.cores === 3 && c(SNIPLE).levels[2]!.cores === 3 && c(ADRIAN).levels[1]!.cores === 4, "Lv2に要るコア（白・黄・青）")
    assert(c(ARDER).effect.includes("BP4000以下の相手のスピリット1体を破壊"), "アーダーフレイムはBP4000以下破壊")
    assert(c(HADES).levels[0]!.bp === 4000 && c(WINGAL).levels[0]!.bp === 5000 && c(WINGAL).levels[1]!.bp === 6000, "デス・ハーデスはBP4000、ウィンガルはLv1 BP5000／Lv2 BP6000")
    assert(c(GASTON).levels[0]!.bp === 3000 && c(KAISAR).levels[1]!.cores === 7 && c(BRAN).levels[1]!.cores === 4, "ガストンはBP3000、カイザレオンはLv2(コア7)、ブランボアーはLv2(コア4)")
    assert(c(ROKU).levels[0]!.bp === 1000 && c(AIBAN).levels[0]!.bp === 2000, "ロクケラトプスはBP1000、アイバーンはBP2000")
    for (const id of [ROKU, AIBAN, HADES, WINGAL, JUGON, PONISAS]) assert(c(id).effects.length === 0 && c(id).type === "spirit", `${id}は効果なしのスピリット`)
}

// 選択待ち（対象・選択肢・カード）を答える。prefer はラベル（対象）か名前（カード・選択肢）の優先順
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

// アタック宣言 → フラッシュを両者パス → ブロック → フラッシュを閉じる
function blockedAttack(t: ScenarioCtx, attacker: "me" | "opp", attackerLabel: string, blockerLabel: string): void {
    t.act(attacker, { type: "attack", instanceId: t.id(attackerLabel) })
    const defender = attacker === "me" ? "opp" : "me"
    t.act(defender, { type: "pass" })
    t.act(attacker, { type: "pass" })
    t.act(defender, { type: "block", instanceId: t.id(blockerLabel) })
    t.closeFlash()
}

// ================= 赤（BP破壊効果の上限+1000） =================
console.log("=== 赤 / 強化1つでBP4000以下破壊がBP5000まで届く（境界） ===")
scenario({
    name: "red-boost-boundary",
    start: { me: { hand: [ARDER], spirits: [{ card: DAMASCUS, cores: 1 }] }, opp: { spirits: [{ card: WINGAL, cores: 1 }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ウィンガル") }),
    // 赤シンボル1つで軽減してコスト3払い。BP5000は上限4000+1000ちょうどなので破壊できる
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: アーダーフレイム → なし",
        "自分.トラッシュ: なし → アーダーフレイム",
        "相手.ウィンガル.場所: フィールド → なし",
        "相手.トラッシュ: なし → ウィンガル",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 赤 / 強化がなければBP4000まで。BP5000は破壊できない ===")
scenario({
    name: "red-no-boost-boundary",
    start: { me: { hand: [ARDER], spirits: [{ card: ROKU, cores: 1 }] }, opp: { spirits: [{ card: HADES, cores: 1 }, { card: WINGAL, cores: 1 }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("デス・ハーデス") }),
    // 候補はBP4000のデス・ハーデスだけ（BP5000は上限外）。ウィンガルは残る
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: アーダーフレイム → なし",
        "自分.トラッシュ: なし → アーダーフレイム",
        "相手.デス・ハーデス.場所: フィールド → なし",
        "相手.トラッシュ: なし → デス・ハーデス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 赤 / 強化2体で+2000。BP6000まで破壊できる（同じ記述は重なる：Q754・Q755） ===")
scenario({
    name: "red-double-boost",
    start: {
        me: { hand: [ARDER], spirits: [{ card: DAMASCUS, label: "ダマスクスA", cores: 1 }, { card: DAMASCUS, label: "ダマスクスB", cores: 1 }] },
        opp: { spirits: [{ card: WINGAL, cores: 2 }] },
    },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ウィンガル") }),
    // 赤シンボル2つで軽減してコスト2払い。上限4000+1000+1000=6000
    expect: [
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: アーダーフレイム → なし",
        "自分.トラッシュ: なし → アーダーフレイム",
        "相手.ウィンガル.場所: フィールド → なし",
        "相手.トラッシュ: なし → ウィンガル",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== 赤 / 「このスピリットのBP以下」は数値で書かれた上限ではないので、強化で増えない（Q756） ===")
scenario({
    name: "red-bp-or-less-not-boosted",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: DAMASCUS, cores: 1 }, { card: GASTON, cores: 1 }] },
        opp: { spirits: [{ card: HADES, cores: 1 }] },
    },
    steps: (t) => blockedAttack(t, "opp", "デス・ハーデス", "鎧竜人ガストン"),
    // ガストン(BP3000)はBP4000にブロック負けして破壊される。破壊時の「このスピリットのBP以下」は3000のままなので、BP4000のデス・ハーデスは破壊されない
    expect: [
        "相手.デス・ハーデス.疲労: false → true",
        "自分.鎧竜人ガストン.場所: フィールド → なし",
        "自分.トラッシュ: なし → 鎧竜人ガストン",
        "自分.リザーブ: 10 → 11",
    ],
})

// ================= 紫（コア除去効果でリザーブに置くコア+1個） =================
console.log("=== 紫 / 強化でコア1個の除去が2個になる（Lv2） ===")
scenario({
    name: "purple-boost",
    start: { me: { hand: [STRANGLE], spirits: [{ card: SIDRON, cores: 3 }] }, opp: { reserve: 6, spirits: [{ card: ROKU, cores: 3 }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロクケラトプス") }),
    // 紫シンボル1つで軽減してコスト3払い。2個取られてロクケラトプスはLv3→Lv1。相手の総コアが自分より3個以上多くならないので追加のボイド除去は起きない
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: ストラングルフォッグ → なし",
        "自分.トラッシュ: なし → ストラングルフォッグ",
        "相手.ロクケラトプス.コア: 3 → 1",
        "相手.ロクケラトプス.Lv: 3 → 1",
        "相手.ロクケラトプス.BP: 4000 → 1000",
        "相手.リザーブ: 6 → 8",
    ],
})

console.log("=== 紫 / 強化の行はLv2から。Lv1では1個のまま ===")
scenario({
    name: "purple-lv1-no-boost",
    start: { me: { hand: [STRANGLE], spirits: [{ card: SIDRON, cores: 1 }] }, opp: { reserve: 6, spirits: [{ card: ROKU, cores: 3 }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロクケラトプス") }),
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: ストラングルフォッグ → なし",
        "自分.トラッシュ: なし → ストラングルフォッグ",
        "相手.ロクケラトプス.コア: 3 → 2",
        "相手.ロクケラトプス.Lv: 3 → 2",
        "相手.ロクケラトプス.BP: 4000 → 3000",
        "相手.リザーブ: 6 → 7",
    ],
})

console.log("=== 紫 / ライフのコアをリザーブに置く除去には効かない（Q759） ===")
scenario({
    name: "purple-life-not-boosted",
    start: { phase: "attack", me: { spirits: [{ card: SIDRON, cores: 3 }, { card: KAISAR, cores: 7 }] }, opp: { spirits: [{ card: ROKU, cores: 1 }] } },
    steps: (t) => blockedAttack(t, "me", "カイザレオン大帝", "ロクケラトプス"),
    // カイザレオン大帝のアタック時勝利でライフからリザーブへ1個。強化があってもライフのコアは2個にならない
    expect: [
        "自分.カイザレオン大帝.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})

// ================= 緑（相手への疲労効果の体数+1体） =================
console.log("=== 緑 / 強化で1体の疲労が2体になる（Lv2） ===")
scenario({
    name: "green-boost",
    start: {
        me: { hand: [BINDING], spirits: [{ card: KIGASHIRA, cores: 3 }] },
        opp: { spirits: [{ card: ROKU, label: "ロクA", cores: 1 }, { card: ROKU, label: "ロクB", cores: 1 }] },
    },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0 }),
    // 緑シンボル1つで軽減してコスト1払い。候補は2体なので両方疲労する
    expect: [
        "自分.リザーブ: 10 → 9",
        "自分.トラッシュのコア: 0 → 1",
        "自分.手札: バインディングソーン → なし",
        "自分.トラッシュ: なし → バインディングソーン",
        "相手.ロクA.疲労: false → true",
        "相手.ロクB.疲労: false → true",
    ],
})

console.log("=== 緑 / 強化の行はLv2から。Lv1では1体だけ疲労する ===")
scenario({
    name: "green-lv1-no-boost",
    start: {
        interactive: true,
        me: { hand: [BINDING], spirits: [{ card: KIGASHIRA, cores: 1 }] },
        opp: { spirits: [{ card: ROKU, label: "ロクA", cores: 1 }, { card: ROKU, label: "ロクB", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0 })
        resolveAll(t, ["相手.ロクA"])
    },
    // ロクAを選んでもロクBは疲労しない
    expect: [
        "自分.リザーブ: 10 → 9",
        "自分.トラッシュのコア: 0 → 1",
        "自分.手札: バインディングソーン → なし",
        "自分.トラッシュ: なし → バインディングソーン",
        "相手.ロクA.疲労: false → true",
    ],
})

// ================= 白（スピリット回復効果の体数+1体） =================
console.log("=== 白 / 強化で1体の回復が2体になる ===")
scenario({
    name: "white-boost",
    start: {
        interactive: true,
        me: {
            hand: [POTION],
            spirits: [
                { card: CURIOSITY, cores: 1 },
                { card: ROKU, label: "ロクA", rested: true, cores: 1 },
                { card: ROKU, label: "ロクB", rested: true, cores: 1 },
            ],
        },
    },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0 })
        resolveAll(t, ["自分.ロクA", "自分.ロクB"])
    },
    // 白シンボル1つで軽減してコスト3払い。疲労した2体を選んで両方回復する
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: ホワイトポーション → なし",
        "自分.トラッシュ: なし → ホワイトポーション",
        "自分.ロクA.疲労: true → false",
        "自分.ロクB.疲労: true → false",
    ],
})

console.log("=== 白 / 「このスピリットは回復する」は体数を増やす効果ではないので、強化で増えない（Q762） ===")
scenario({
    name: "white-self-refresh-not-boosted",
    start: {
        phase: "attack",
        me: {
            spirits: [
                { card: CURIOSITY, cores: 1 },
                { card: BRAN, cores: 4 },
                { card: ROKU, label: "疲労ロク", rested: true, cores: 1 },
            ],
        },
        opp: { spirits: [{ card: ROKU, label: "盾ロク", cores: 1 }] },
    },
    steps: (t) => blockedAttack(t, "me", "爆進獣ブランボアー", "盾ロク"),
    // ブランボアーはアタックで疲労し、バトル勝利でこのスピリット自身だけ回復する（差分なし）。すでに疲労している味方は回復しない
    expect: [
        "相手.盾ロク.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ================= 黄（BP-効果を-1000） =================
console.log("=== 黄 / 強化でBP-3000がBP-4000になる ===")
scenario({
    name: "yellow-boost",
    start: { me: { hand: [PRESSURE], spirits: [{ card: SNIPLE, cores: 1 }] }, opp: { spirits: [{ card: WINGAL, cores: 1 }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ウィンガル") }),
    // 黄シンボル1つで軽減してコスト2払い。BP5000-4000=1000
    expect: [
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: エンジェリックプレッシャー → なし",
        "自分.トラッシュ: なし → エンジェリックプレッシャー",
        "相手.ウィンガル.BP: 5000 → 1000",
    ],
})

console.log("=== 黄 / 相手の効果には効かない（強化は自分の効果だけ） ===")
scenario({
    name: "yellow-opp-effect-no-boost",
    start: { turn: "opp", me: { spirits: [{ card: SNIPLE, cores: 1 }, { card: WINGAL, cores: 1 }] }, opp: { hand: [PRESSURE] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ウィンガル") }),
    // 相手が自分のウィンガルにBP-3000。強化の主は自分でも、効果の主が相手なので-4000にはならない
    expect: [
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュのコア: 0 → 3",
        "相手.手札: エンジェリックプレッシャー → なし",
        "相手.トラッシュ: なし → エンジェリックプレッシャー",
        "自分.ウィンガル.BP: 5000 → 2000",
    ],
})

// ================= 青（相手へのデッキ破棄効果の枚数+1枚） =================
const SIX = [ROKU, AIBAN, HADES, WINGAL, JUGON, PONISAS]
const deck40 = (): string[] => [...SIX, ...Array.from({ length: 34 }, () => ROKU)]

console.log("=== 青 / 強化で5枚破棄が6枚になる ===")
scenario({
    name: "blue-boost",
    start: { me: { hand: [HAMMER], spirits: [{ card: ADRIAN, cores: 1 }] }, opp: { deck: deck40() } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0 }),
    // 青シンボル1つで軽減してコスト3払い。上から6枚破棄される
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: マジックハンマー → なし",
        "自分.トラッシュ: なし → マジックハンマー",
        "相手.デッキ枚数: 40 → 34",
        "相手.トラッシュ: なし → アイバーン、ウィンガル、デス・ハーデス、ポニサス、ロクケラトプス、海獣ジューゴン",
    ],
})

console.log("=== 青 / 相手の効果には効かない。5枚のまま ===")
scenario({
    name: "blue-opp-effect-no-boost",
    start: { turn: "opp", me: { spirits: [{ card: ADRIAN, cores: 1 }], deck: deck40() }, opp: { hand: [HAMMER] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0 }),
    expect: [
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 4",
        "相手.手札: マジックハンマー → なし",
        "相手.トラッシュ: なし → マジックハンマー",
        "自分.デッキ枚数: 40 → 35",
        "自分.トラッシュ: なし → アイバーン、ウィンガル、デス・ハーデス、ロクケラトプス、海獣ジューゴン",
    ],
})

console.log("=== 青 / 破棄する枚数が0枚のときは+1枚されない（Q766） ===")
scenario({
    name: "blue-zero-not-boosted",
    start: { me: { hand: [DRILL], spirits: [{ card: ADRIAN, cores: 1 }] }, opp: { hand: [] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0 }),
    // 相手の手札が0枚なので破棄は0枚。強化でも1枚にはならず、デッキは減らない
    expect: [
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: マジックドリル → なし",
        "自分.トラッシュ: なし → マジックドリル",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part726）")
