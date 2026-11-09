// smoke パート867（BS23 青 046 アトライアソルジャー・048 ファルコパンサー・049 猪人ボアボア・054 海皇巨兵アトライア・ゴレム：効果文だけを根拠にした期待値）
// 公式Q&A：048=Q776（シンボル2つ以上をブロックしなければBP+も【連鎖】も出ない）／054=Q4580（自身も「造兵」に数える）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const SOLDIER = "BS23-046"
const FALCON = "BS23-048"
const BOA = "BS23-049"
const GOLEM = "BS23-054"
const DURANZAM = "BS22-X06"
const JEFFREY = "BS03-072" // 槍兵のジェフリー（青シンボル1）
const ILULYANKASH = "BS16-053" // イルルヤンカッシュ（青・コスト6・軽減青2・青シンボル2・BP5000）
const HADES = "BS01-031" // デス・ハーデス（紫シンボル1・BP4000）
const PHANTASMA = "BS02-014" // ファンタズマ（紫シンボル1）
const BEETLE = "BS01-050" // ビートビートル（緑・コスト0）
const ROKU = "BS01-002" // ロクケラトプス（コスト1）
const GUSTAV = "BS04-060" // 戦士グスタフ（造兵・青）
const DRACO = "BS23-002" // 恐竜剣聖ドラコレックス（剣使）
const IVERN = "BS01-005" // アイバーン（コスト2）
const METAL = "BS01-008" // メタルバーン（コスト3・BP3000）
const SHOCK = "BS01-054" // ショックイーター（コスト2）
const PHOENIX = "BS01-023" // 原始鳥フェニキオス（コスト7）
const VOLCANO = "BS03-101" // ボルカノ・ゴレム（コスト8）

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string, string, number][] = [
        [SOLDIER, "アトライアソルジャー", "spirit", 1], [FALCON, "ファルコパンサー", "spirit", 3], [BOA, "猪人ボアボア", "spirit", 3],
        [GOLEM, "海皇巨兵アトライア・ゴレム", "spirit", 8], [DURANZAM, "海皇巨神デュランザム", "spirit", 10], [JEFFREY, "槍兵のジェフリー", "spirit", 1],
        [ILULYANKASH, "イルルヤンカッシュ", "spirit", 6], [HADES, "デス・ハーデス", "spirit", 3], [PHANTASMA, "ファンタズマ", "spirit", 2],
        [BEETLE, "ビートビートル", "spirit", 0], [ROKU, "ロクケラトプス", "spirit", 1], [GUSTAV, "戦士グスタフ", "spirit", 1],
        [DRACO, "恐竜剣聖ドラコレックス", "spirit", 3], [IVERN, "アイバーン", "spirit", 2], [METAL, "メタルバーン", "spirit", 3],
        [SHOCK, "ショックイーター", "spirit", 2], [PHOENIX, "原始鳥フェニキオス", "spirit", 7], [VOLCANO, "ボルカノ・ゴレム", "spirit", 8],
    ]
    for (const [id, name, type, cost] of expect) {
        const c = getCard(id)
        assert(c.name === name && c.type === type && c.cost === cost, `${id} は ${name}（${type}・コスト${cost}）`)
    }
}

const names = (xs: string[]) => xs.map((x) => getCard(x).name).sort().join("、")

console.log("=== 046: 名前指定の召喚コスト-1 ===")
// 自分のメインステップ中、手札の［海皇巨神デュランザム］の召喚コストだけが1下がる。ソルジャー自身の青シンボル1つぶんの軽減も効く
scenario({
    name: "soldier-duranzam-minus1",
    start: { me: { hand: [DURANZAM], spirits: [{ card: SOLDIER, label: "ソルジャー" }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 海皇巨神デュランザム → なし",
        "自分.リザーブ: 10 → 1", // コスト10 - 青シンボル1 - 効果1 = 8、Lv1の維持コア1
        "自分.トラッシュのコア: 0 → 8",
        "自分.海皇巨神デュランザム.場所: なし → フィールド",
        "自分.海皇巨神デュランザム.疲労: なし → false",
        "自分.海皇巨神デュランザム.コア: なし → 1",
        "自分.海皇巨神デュランザム.Lv: なし → 1",
        "自分.海皇巨神デュランザム.BP: なし → 12000", // 自身のLv1効果で闘神の自分のスピリットすべてBP+5000
        "自分.ソルジャー.BP: 1000 → 6000",
    ],
})
// 名前が違う手札はコストが下がらない（コスト6 - 青シンボル1 = 5）
scenario({
    name: "soldier-other-card-no-discount",
    start: { me: { hand: [ILULYANKASH], spirits: [{ card: SOLDIER, label: "ソルジャー" }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: イルルヤンカッシュ → なし",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.イルルヤンカッシュ.場所: なし → フィールド",
        "自分.イルルヤンカッシュ.疲労: なし → false",
        "自分.イルルヤンカッシュ.コア: なし → 1",
        "自分.イルルヤンカッシュ.Lv: なし → 1",
        "自分.イルルヤンカッシュ.BP: なし → 5000",
    ],
})
// 「自分の手札」なので、相手のソルジャーでは下がらない（コスト10 - 青シンボル1 = 9）
scenario({
    name: "soldier-opp-side-no-discount",
    start: {
        me: { hand: [DURANZAM], reserve: 12, spirits: [{ card: JEFFREY, label: "ジェフリー" }] },
        opp: { spirits: [{ card: SOLDIER, label: "ソルジャー" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 海皇巨神デュランザム → なし",
        "自分.リザーブ: 12 → 2",
        "自分.トラッシュのコア: 0 → 9",
        "自分.海皇巨神デュランザム.場所: なし → フィールド",
        "自分.海皇巨神デュランザム.疲労: なし → false",
        "自分.海皇巨神デュランザム.コア: なし → 1",
        "自分.海皇巨神デュランザム.Lv: なし → 1",
        "自分.海皇巨神デュランザム.BP: なし → 12000",
        "自分.ジェフリー.BP: 2000 → 7000", // 闘神
    ],
})

console.log("=== 048: ブロック時 BP+7000（シンボル2つ以上をブロックしたとき）＋【連鎖】紫でドロー ===")
// 2シンボルのアタッカーをブロック：BP+7000（3000→10000）で勝ち、紫シンボルがあるので1枚引く
scenario({
    name: "falcon-block-2symbols-chain",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: FALCON, label: "ファルコ" }, { card: PHANTASMA, label: "紫" }] },
        opp: { spirits: [{ card: ILULYANKASH, label: "二重" }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("二重") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ファルコ") })
        t.closeFlash()
    },
    expect: [
        "自分.ファルコ.BP: 3000 → 10000",
        "自分.ファルコ.疲労: false → true", // ブロックしたスピリットは疲労する
        "自分.手札: なし → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "相手.二重.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → イルルヤンカッシュ",
    ],
})
// 紫シンボルが無ければ BP+ だけ（連鎖は出ない）
scenario({
    name: "falcon-block-2symbols-no-purple",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: FALCON, label: "ファルコ" }] },
        opp: { spirits: [{ card: ILULYANKASH, label: "二重" }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("二重") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ファルコ") })
        t.closeFlash()
    },
    expect: [
        "自分.ファルコ.BP: 3000 → 10000",
        "自分.ファルコ.疲労: false → true",
        "相手.二重.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → イルルヤンカッシュ",
    ],
})
// シンボル1つの相手をブロックしても、BP+も連鎖も出ない（Q776）。BP3000はBP4000に負ける
scenario({
    name: "falcon-block-1symbol",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: FALCON, label: "ファルコ" }, { card: PHANTASMA, label: "紫" }] },
        opp: { spirits: [{ card: HADES, label: "一重" }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("一重") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ファルコ") })
        t.closeFlash()
    },
    expect: [
        "相手.一重.疲労: false → true",
        "自分.ファルコ.場所: フィールド → なし",
        "自分.リザーブ: 10 → 11",
        "自分.トラッシュ: なし → ファルコパンサー",
    ],
})

console.log("=== 049: アタック時 Lvを1つ上として扱う＋【連鎖】緑でボイドからコア1個 ===")
scenario({
    name: "boa-attack-chain-green",
    start: { phase: "attack", me: { spirits: [{ card: BOA, label: "ボア" }, { card: BEETLE, label: "緑" }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ボア") })
    },
    expect: ["自分.ボア.疲労: false → true", "自分.ボア.Lv: 1 → 2", "自分.ボア.BP: 2000 → 4000", "自分.ボア.コア: 1 → 2"],
})
// 緑シンボルが無ければ Lv+1 だけ
scenario({
    name: "boa-attack-no-green",
    start: { phase: "attack", me: { spirits: [{ card: BOA, label: "ボア" }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ボア") })
    },
    expect: ["自分.ボア.疲労: false → true", "自分.ボア.Lv: 1 → 2", "自分.ボア.BP: 2000 → 4000"],
})
// 別のスピリットがアタックしても、ボアボアは変わらない
scenario({
    name: "boa-other-attacks",
    start: { phase: "attack", me: { spirits: [{ card: BOA, label: "ボア" }, { card: ROKU, label: "ロク" }, { card: BEETLE, label: "緑" }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロク") })
    },
    expect: ["自分.ロク.疲労: false → true"],
})

console.log("=== 054: 召喚時 剣使/造兵1体につきコスト7以下の相手を破壊（自身も数える）＋ コスト1/2はアタック/ブロック不可 ===")
// 自分の剣使（ドラコレックス）・造兵（グスタフ）・自身で3体ぶん。コスト7以下が3体、コスト8は対象外
scenario({
    name: "golem-summon-count3",
    start: {
        me: { hand: [GOLEM], reserve: 15, spirits: [{ card: GUSTAV, label: "グスタフ" }, { card: DRACO, label: "ドラコ" }] },
        opp: { spirits: [{ card: ROKU, label: "A" }, { card: METAL, label: "B" }, { card: PHOENIX, label: "C" }, { card: VOLCANO, label: "D" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 海皇巨兵アトライア・ゴレム → なし",
        "自分.リザーブ: 15 → 7", // コスト8 - 青シンボル1 = 7、Lv1の維持コア1
        "自分.トラッシュのコア: 0 → 7",
        "自分.海皇巨兵アトライア・ゴレム.場所: なし → フィールド",
        "自分.海皇巨兵アトライア・ゴレム.疲労: なし → false",
        "自分.海皇巨兵アトライア・ゴレム.コア: なし → 1",
        "自分.海皇巨兵アトライア・ゴレム.Lv: なし → 1",
        "自分.海皇巨兵アトライア・ゴレム.BP: なし → 7000",
        "相手.A.場所: フィールド → なし",
        "相手.B.場所: フィールド → なし",
        "相手.C.場所: フィールド → なし",
        `相手.トラッシュ: なし → ${names([ROKU, METAL, PHOENIX])}`,
        "相手.リザーブ: 10 → 13",
    ],
})
// 剣使/造兵が自身だけなら1体（グスタフの代わりに系統の違う自分のスピリットがいる）。選んだ1体だけ破壊
scenario({
    name: "golem-summon-count1",
    start: {
        me: { hand: [GOLEM], reserve: 15, spirits: [{ card: ROKU, label: "ロク" }] },
        opp: { spirits: [{ card: IVERN, label: "A" }, { card: METAL, label: "B" }] },
        interactive: true,
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "resolveChoice", instanceId: t.id("A") })
    },
    expect: [
        "自分.手札: 海皇巨兵アトライア・ゴレム → なし",
        "自分.リザーブ: 15 → 6", // コスト8（青シンボル無し）、Lv1の維持コア1
        "自分.トラッシュのコア: 0 → 8",
        "自分.海皇巨兵アトライア・ゴレム.場所: なし → フィールド",
        "自分.海皇巨兵アトライア・ゴレム.疲労: なし → false",
        "自分.海皇巨兵アトライア・ゴレム.コア: なし → 1",
        "自分.海皇巨兵アトライア・ゴレム.Lv: なし → 1",
        "自分.海皇巨兵アトライア・ゴレム.BP: なし → 7000",
        "相手.A.場所: フィールド → なし",
        "相手.トラッシュ: なし → アイバーン",
        "相手.リザーブ: 10 → 11",
    ],
})
// コスト7以下の相手がいなければ何も起きない（コスト8だけ）
scenario({
    name: "golem-summon-no-target",
    start: {
        me: { hand: [GOLEM], reserve: 15, spirits: [{ card: GUSTAV, label: "グスタフ" }] },
        opp: { spirits: [{ card: VOLCANO, label: "D" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 海皇巨兵アトライア・ゴレム → なし",
        "自分.リザーブ: 15 → 7",
        "自分.トラッシュのコア: 0 → 7",
        "自分.海皇巨兵アトライア・ゴレム.場所: なし → フィールド",
        "自分.海皇巨兵アトライア・ゴレム.疲労: なし → false",
        "自分.海皇巨兵アトライア・ゴレム.コア: なし → 1",
        "自分.海皇巨兵アトライア・ゴレム.Lv: なし → 1",
        "自分.海皇巨兵アトライア・ゴレム.BP: なし → 7000",
    ],
})
// 自分のアタックステップ：コスト2の相手はブロックできない（自分のコスト1のスピリットのアタックは妨げない）
scenario({
    name: "golem-opp-cost2-cant-block",
    start: {
        phase: "attack",
        me: { spirits: [{ card: GOLEM, label: "ゴレム" }, { card: ROKU, label: "アタッカー" }] },
        opp: { spirits: [{ card: IVERN, label: "アイバーン" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("アイバーン") })
    },
    expect: ["自分.アタッカー.疲労: false → true"],
})
// コスト3の相手はブロックできる（BP1000は3000に負ける）
scenario({
    name: "golem-opp-cost3-can-block",
    start: {
        phase: "attack",
        me: { spirits: [{ card: GOLEM, label: "ゴレム" }, { card: ROKU, label: "アタッカー" }] },
        opp: { spirits: [{ card: METAL, label: "メタル" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("メタル") })
        t.closeFlash()
    },
    expect: ["自分.アタッカー.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → ロクケラトプス", "相手.メタル.疲労: false → true"],
})
// 相手のアタックステップ：コスト1/2の相手（自分から見た相手）はアタックできない。コスト0と3以上はできる
scenario({
    name: "golem-opp-cost12-cant-attack",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: GOLEM, label: "ゴレム" }] },
        opp: { spirits: [{ card: IVERN, label: "コスト2" }, { card: ROKU, label: "コスト1" }, { card: BEETLE, label: "コスト0" }] },
    },
    steps(t) {
        t.actRejected("opp", { type: "attack", instanceId: t.id("コスト2") })
        t.actRejected("opp", { type: "attack", instanceId: t.id("コスト1") })
        t.act("opp", { type: "attack", instanceId: t.id("コスト0") })
    },
    expect: ["相手.コスト0.疲労: false → true"],
})

void SHOCK
console.log("すべてのチェックに合格しました 🎉（part867）")
