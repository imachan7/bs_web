// smoke パート1021（#631 GX03・GX04・GX11・GX13・GX18・GX24・KF-02・KF-07・KF-14・KF-15・PB12-04・PB13-01・X010・X018（バーストの節）・X015・GX12-01（バースト以外））
// 期待値役：効果文だけから書いた。staging のカードは data に入るまで節ごと（未実装）で飛ばす
import { born, check, fix, magicOut, nm, nmOf, resolveAll, summonOut, VAN } from "./lib631"
import { assert, effectiveBp, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const TODOL = "BS17-030" // トドール（白・コスト3・Lv1 BP1000）
const HINA = "BS06-052" // ヒナペンタン（黄・コスト2・系統 歌鳥・Lv1 BP2000）
const PENT = "BS10-044" // 森の妖精ペンタン（黄・コスト2・Lv1 BP1000・効果なし）
const ADO = "BS23-039" // 冒険家アドペンタン（黄・コスト3・Lv1 BP3000・召喚時にデッキ上3枚オープン）
const AMP = "BS02-073" // 皇帝アンプルール（黄・コスト6・系統 歌鳥・Lv1 BP3000／Lv3(コア6) 5000）
const BERUDO = "BS09-X36" // 魔界七将ベルドゴール（紫・コスト3・Lv1 BP3000）
const BEET = "BS01-050" // ビートビートル（緑・コスト0・系統 殻虫・Lv1 BP1000）
const EME = "BS01-055" // エメアント（緑・コスト2・系統 怪虫・Lv1 BP1000）
const JANE = "BS17-023" // ジェーンバード（緑・コスト3・Lv2(コア3)から【暴風】・Lv1 BP2000／Lv2 4000）
const MOSQ = "BS21-019" // クイック・モスキー（緑・コスト1・【神速】・Lv1 BP1000／Lv2(コア2) 2000）
const YUMI = "BS20-038" // 弓ピッド（黄・コスト2・系統 天霊・Lv1 BP2000）
const STRIKE = "EX007" // 月牙龍ストライクヴルム・シリウス（緑・コスト6・Lv1 BP5000）
const KF01 = "KF-01" // カーネル・ドラゴン（赤・コスト6・Lv1 BP4000）
const KF04 = "KF-04" // チキンフィレサンドナイト（コスト4・召喚時：相手のスピリットのコア1個を相手のリザーブに置く）
const KF12 = "KF-12" // ポテトアロー（赤マジック・コスト5・BP4000以下のスピリットすべてを破壊）
const KF13 = "KF-13" // 鶏肉の覇王ジーク・ケンタ・フリード（赤・コスト8）
const KF03 = "KF-03" // カーネル・ゴレム（赤・コスト5）
const DOG = "BS12-036" // 星犬ポメラン（黄・コスト3・Lv1 BP3000）
const SHIELD = "SD06-016" // 絶甲氷盾（白マジック・バースト：ライフ減少後にコア1個をライフへ置く）
const BRAVE1 = "BS21-063" // ぐるみパンダ（黄ブレイヴ・コスト4・合体条件 コスト4以上）
const COFFIN = "BS01-131" // ダークコフィン（紫マジック・コスト7）

console.log("=== 前提: カードの機械確認 ===")
fix(TODOL, "トドール", "spirit", 3)
fix(HINA, "ヒナペンタン", "spirit", 2)
fix(PENT, "森の妖精ペンタン", "spirit", 2)
fix(ADO, "冒険家アドペンタン", "spirit", 3)
fix(AMP, "皇帝アンプルール", "spirit", 6)
fix(BERUDO, "魔界七将ベルドゴール", "spirit", 3)
fix(BEET, "ビートビートル", "spirit", 0)
fix(EME, "エメアント", "spirit", 2)
fix(JANE, "ジェーンバード", "spirit", 3)
fix(MOSQ, "クイック・モスキー", "spirit", 1)
fix(YUMI, "弓ピッド", "spirit", 2)
fix(STRIKE, "月牙龍ストライクヴルム・シリウス", "spirit", 6)
fix(KF01, "カーネル・ドラゴン", "spirit", 6)
fix(KF03, "カーネル・ゴレム", "spirit", 5)
fix(KF04, "チキンフィレサンドナイト", "spirit", 4)
fix(KF12, "ポテトアロー", "magic", 5)
fix(KF13, "鶏肉の覇王ジーク・ケンタ・フリード", "spirit", 8)
fix(DOG, "星犬ポメラン", "spirit", 3)
fix(SHIELD, "絶甲氷盾", "magic", 4)
fix(BRAVE1, "ぐるみパンダ", "brave", 4)
fix(COFFIN, "ダークコフィン", "magic", 7)

const castMain = (t: ScenarioCtx): void => t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
const castFlash = (t: ScenarioCtx, target: string): void => t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id(target) })
const REJECT = { type: "castMagic", handIndex: 0, timing: "main" } as const
const bp = (t: ScenarioCtx, label: string): number => effectiveBp(t.state, t.me, t.inst(label))
const deckLen = (t: ScenarioCtx): number => t.state.players[t.me].deck.length
// 2体目以降の同名は写像のラベルに「#2」が付く
const bornN = (name: string, bpv: number, suffix: string): string[] => [
    `自分.${name}${suffix}.場所: なし → フィールド`, `自分.${name}${suffix}.疲労: なし → false`, `自分.${name}${suffix}.コア: なし → 1`, `自分.${name}${suffix}.Lv: なし → 1`, `自分.${name}${suffix}.BP: なし → ${bpv}`,
]

// フラッシュ：自分のスピリット1体のBP増加。相手のスピリットを指定しても自分のスピリットに及ぶ
function flashTests(id: string, who: string, cost: number, bonus: number, spirit = TODOL): void {
    const dn = nmOf(id)
    scenario({
        name: `${id}-フラッシュで自分のスピリット1体がBP+${bonus}され、相手のスピリットは対象にならない`,
        start: { names: { me: who, opp: "ユウキ" }, me: { hand: [id], spirits: [{ card: spirit, label: "A" }] }, opp: { spirits: [{ card: VAN, label: "U" }] } },
        steps: (t) => castFlash(t, "U"),
        expect: [...magicOut("自分", dn, cost), `自分.A.BP: 1000 → ${1000 + bonus}`],
    })
}

// ==== GX03 ヴァイオレットステージ ====
if (check("GX03", "ヴァイオレットステージ", "magic", 2)) {
    console.log("=== GX03 メイン：トラッシュの「魔界七将」入りスピリットすべてを、コストを支払わずに召喚できる ===")
    const dn = nmOf("GX03")
    const board = (n: string) => ({ names: { me: n, opp: "ユウキ" }, interactive: true, me: { hand: ["GX03"], trash: [BERUDO, BERUDO, VAN] } })
    scenario({
        name: "GX03-トラッシュの魔界七将入りスピリットすべて（2枚）を無償召喚する。魔界七将でないスピリットは召喚しない",
        start: board("硯 秀斗"),
        steps: (t) => {
            castMain(t)
            resolveAll(t)
        },
        expect: [
            `自分.手札: ${dn} → なし`, `自分.トラッシュ: ${nm("魔界七将ベルドゴール", "魔界七将ベルドゴール", "ロクケラトプス")} → ${nm(dn, "ロクケラトプス")}`,
            "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 2",
            ...bornN("魔界七将ベルドゴール", 3000, ""), ...bornN("魔界七将ベルドゴール", 3000, "#2"),
        ],
    })
    scenario({
        name: "GX03-召喚できるを断ると何も召喚しない",
        start: board("ヴィオレ魔ゐ"),
        steps: (t) => {
            castMain(t)
            resolveAll(t, [], false)
        },
        expect: [`自分.手札: ${dn} → なし`, `自分.トラッシュ: ${nm("魔界七将ベルドゴール", "魔界七将ベルドゴール", "ロクケラトプス")} → ${nm("魔界七将ベルドゴール", "魔界七将ベルドゴール", "ロクケラトプス", dn)}`, "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 2"],
    })
    scenario({
        name: "GX03-コアの光主でなければ使用できない",
        start: { me: { hand: ["GX03"] } },
        steps: (t) => t.actRejected("me", REJECT),
        expect: [],
    })
    flashTests("GX03", "馬神ダン", 2, 2000)
}

// ==== GX04 ソードサイクロン ====
if (check("GX04", "ソードサイクロン", "magic", 3)) {
    console.log("=== GX04 メイン：このターン、【神速】/【暴風】持ちの自分のスピリットすべては、アタックするとき相手のスピリット1体を指定してアタックできる ===")
    const dn = nmOf("GX04")
    const board = (spirit: string, cores: number) => ({
        names: { me: "馬神弾", opp: "ユウキ" },
        me: { hand: ["GX04"], spirits: [{ card: spirit, label: "M", cores }] },
        opp: { spirits: [{ card: VAN, label: "U" }, { card: VAN, label: "W" }] },
    })
    // 緑のシンボル1つで軽減されコスト2。M は BP2000（Lv2）で U（BP1000）に勝つ
    const win = (t: ScenarioCtx, spirit: string): void => {
        castMain(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("M"), targetSpiritInstanceId: t.id("U") })
        t.closeFlash()
        assert(t.inst("M").cardId === spirit, "GX04: 攻撃したのは自分のスピリット")
    }
    const rows = ["自分.M.疲労: false → true", ...magicOut("自分", dn, 2).filter((l) => !l.startsWith("自分.リザーブ") && !l.startsWith("自分.トラッシュのコア")), "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 2", "相手.U.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"]
    scenario({
        name: "GX04-【神速】持ちのスピリットが、相手のスピリットU（回復状態）を指定してアタックでき、バトルする",
        start: board(MOSQ, 2),
        steps: (t) => win(t, MOSQ),
        expect: rows,
    })
    scenario({
        name: "GX04-【暴風】持ち（Lv2）のスピリットも同じ（BP4000でBP1000のUに勝つ）",
        start: board(JANE, 3),
        steps: (t) => win(t, JANE),
        // 指定された U はブロック扱いで疲労し（破壊されて盤面に残らない）、【暴風】は指定以外の W を疲労させる（2026-11-20 ユーザー決定）
        expect: [...rows, "相手.W.疲労: false → true"],
    })
    scenario({
        name: "GX04-【神速】【暴風】のどちらも持たないスピリットは指定してアタックできない",
        start: { names: { me: "馬神弾", opp: "ユウキ" }, me: { hand: ["GX04"], spirits: [{ card: VAN, label: "M" }] }, opp: { spirits: [{ card: VAN, label: "U" }] } },
        steps(t) {
            castMain(t)
            t.act("me", { type: "nextPhase" })
            t.actRejected("me", { type: "attack", instanceId: t.id("M"), targetSpiritInstanceId: t.id("U") })
        },
        expect: [...magicOut("自分", dn, 3)],
    })
    scenario({
        name: "GX04-このマジックを使っていなければ、【神速】持ちでも相手のスピリットを指定してアタックできない",
        start: { me: { spirits: [{ card: MOSQ, label: "M" }] }, opp: { spirits: [{ card: VAN, label: "U" }] }, phase: "attack" },
        steps: (t) => t.actRejected("me", { type: "attack", instanceId: t.id("M"), targetSpiritInstanceId: t.id("U") }),
        expect: [],
    })
    scenario({
        name: "GX04-コアの光主でなければ使用できない",
        start: { me: { hand: ["GX04"] } },
        steps: (t) => t.actRejected("me", REJECT),
        expect: [],
    })
    flashTests("GX04", "紫乃宮まゐ", 3, 3000)
}

// ==== GX11 ダークネスバグ ====
if (check("GX11", "ダークネスバグ", "magic", 2)) {
    console.log("=== GX11 メイン：このターン、系統「怪虫」/「殻虫」/「殻人」の自分のスピリットすべてに【呪撃】（ブロックした相手のスピリットをバトル終了時に破壊）を与える ===")
    const dn = nmOf("GX11")
    // 攻撃側のBP1000がブロッカーのBP4000に負けても、呪撃でブロッカーも破壊される
    const clash = (t: ScenarioCtx): void => {
        castMain(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("A") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("K") })
        t.closeFlash()
    }
    const board = (spirit: string) => ({
        names: { me: "暴将デュック", opp: "ユウキ" },
        me: { hand: ["GX11"], spirits: [{ card: spirit, label: "A" }] },
        opp: { spirits: [{ card: VAN, label: "K", cores: 3 }] },
    })
    const oppDead = ["相手.K.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 13"]
    // 緑のシンボル1つで軽減され、コスト1。攻撃側（コア1個）が破壊されてコア1個はリザーブへ戻る
    for (const [card, name] of [[BEET, "ビートビートル"], [EME, "エメアント"]] as const) {
        scenario({
            name: `GX11-${name}（${card === BEET ? "殻虫" : "怪虫"}）がブロックされると、ブロックしたスピリットがバトル終了時に破壊される`,
            start: board(card),
            steps: clash,
            expect: [
                `自分.手札: ${dn} → なし`, `自分.トラッシュ: なし → ${nm(dn, name)}`, "自分.トラッシュのコア: 0 → 1", "自分.A.場所: フィールド → なし", ...oppDead,
            ],
        })
    }
    scenario({
        name: "GX11-系統が怪虫/殻虫/殻人でないスピリットには呪撃は与えられない（ブロッカーは生き残る）",
        start: board(VAN),
        steps: clash,
        expect: [
            `自分.手札: ${dn} → なし`, `自分.トラッシュ: なし → ${nm(dn, "ロクケラトプス")}`, "自分.リザーブ: 10 → 9", "自分.トラッシュのコア: 0 → 2", "自分.A.場所: フィールド → なし", "相手.K.疲労: false → true",
        ],
    })
    scenario({
        name: "GX11-暴将デュック以外は使用できない",
        start: { me: { hand: ["GX11"] } },
        steps: (t) => t.actRejected("me", REJECT),
        expect: [],
    })
    flashTests("GX11", "暴将デュック", 2, 5000)
}

// ==== GX13 エンジェリックヘヴン ====
if (check("GX13", "エンジェリックヘヴン", "magic", 4)) {
    console.log("=== GX13 メイン：このターン、系統「天霊」の自分のスピリットが破壊されたとき、自分のライフが5になるようにボイドからコアを置く ===")
    const dn = nmOf("GX13")
    const run = (spirit: string, life: number) => ({
        name: "",
        start: {
            names: { me: "クラッキー・レイ", opp: "ユウキ" },
            me: { hand: ["GX13"], life, spirits: [{ card: spirit, label: "A" }] },
            opp: { spirits: [{ card: VAN, label: "B", cores: 3 }] },
        },
        steps(t: ScenarioCtx) {
            castMain(t)
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("A") })
            t.closeFlash()
            t.act("opp", { type: "block", instanceId: t.id("B") })
            t.closeFlash()
        },
    })
    // 弓ピッド（黄のシンボル1つ）でマジックはコスト3。破壊されたコア1個はリザーブへ戻る
    scenario({
        ...run(YUMI, 2),
        name: "GX13-天霊のスピリットが破壊されると、ライフが5になるようにコアが置かれる（2→5）",
        expect: [`自分.手札: ${dn} → なし`, `自分.トラッシュ: なし → ${nm(dn, "弓ピッド")}`, "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 3", "自分.A.場所: フィールド → なし", "自分.ライフ: 2 → 5", "相手.B.疲労: false → true"],
    })
    scenario({
        ...run(YUMI, 5),
        name: "GX13-ライフがすでに5なら増えない",
        expect: [`自分.手札: ${dn} → なし`, `自分.トラッシュ: なし → ${nm(dn, "弓ピッド")}`, "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 3", "自分.A.場所: フィールド → なし", "相手.B.疲労: false → true"],
    })
    scenario({
        ...run(VAN, 2),
        name: "GX13-天霊でないスピリットが破壊されてもライフは増えない",
        expect: [`自分.手札: ${dn} → なし`, `自分.トラッシュ: なし → ${nm(dn, "ロクケラトプス")}`, "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 4", "自分.A.場所: フィールド → なし", "相手.B.疲労: false → true"],
    })
    scenario({
        name: "GX13-クラッキー・レイ以外は使用できない",
        start: { me: { hand: ["GX13"] } },
        steps: (t) => t.actRejected("me", REJECT),
        expect: [],
    })
    flashTests("GX13", "クラッキー・レイ", 4, 5000)
}

// ==== GX18 ムーンライトクローク ====
if (check("GX18", "ムーンライトクローク", "magic", 4)) {
    console.log("=== GX18 メイン：このターン、カード名に「ストライク」と入っている自分のスピリットすべてはブロックされない ===")
    const dn = nmOf("GX18")
    const start = (card: string) => ({
        names: { me: "月光のバローネ", opp: "ユウキ" },
        me: { hand: ["GX18"], spirits: [{ card, label: "A" }] },
        opp: { spirits: [{ card: VAN, label: "B" }] },
    })
    const attack = (t: ScenarioCtx): void => {
        castMain(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("A") })
        t.closeFlash()
    }
    scenario({
        name: "GX18-ストライクの名のスピリットは、相手のスピリットBがいてもブロックされず、ライフで受けるしかない",
        start: start(STRIKE),
        steps(t) {
            attack(t)
            t.actRejected("opp", { type: "block", instanceId: t.id("B") })
            t.act("opp", { type: "takeLife" })
            t.closeFlash()
        },
        expect: [...magicOut("自分", dn, 4), "自分.A.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "GX18-ストライクの名でないスピリットはブロックされる",
        start: start(VAN),
        steps(t) {
            attack(t)
            t.act("opp", { type: "block", instanceId: t.id("B") })
            t.closeFlash()
        },
        expect: [
            `自分.手札: ${dn} → なし`, `自分.トラッシュ: なし → ${nm(dn, "ロクケラトプス")}`, "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 4", "自分.A.場所: フィールド → なし",
            "相手.B.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11",
        ],
    })
    scenario({
        name: "GX18-月光のバローネ以外は使用できない",
        start: { me: { hand: ["GX18"] } },
        steps: (t) => t.actRejected("me", REJECT),
        expect: [],
    })
    flashTests("GX18", "月光のバローネ", 4, 4000, VAN)
}

// ==== GX24 ジャスティスバースト ====
if (check("GX24", "ジャスティスバースト", "magic", 6)) {
    console.log("=== GX24 バースト（ライフ減少後）：ライフが1のとき手札のスピリット/ブレイヴを好きなだけ召喚（コストは払わない）。その後コストを支払ってフラッシュ（ライフが1のとき5になるようにコアを置く） ===")
    const dn = nmOf("GX24")
    const board = (life: number, hand = [TODOL, HINA, COFFIN]) => ({
        names: { me: "ジャスティス立花", opp: "ユウキ" }, turn: "opp" as const, phase: "attack" as const, interactive: true,
        me: { burst: "GX24", life, hand },
        opp: { spirits: [{ card: VAN, label: "O" }] },
    })
    const run = (t: ScenarioCtx, accept: boolean | "noPay"): void => {
        t.act("opp", { type: "attack", instanceId: t.id("O") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        resolveAll(t, [], accept)
    }
    const common = ["相手.O.疲労: false → true", "自分.バースト: ジャスティスバースト → なし"]
    const hands = [`自分.手札: ${nm("ダークコフィン", "トドール", "ヒナペンタン")} → ダークコフィン`]
    const summons = [...born("自分", "トドール", 1000), ...born("自分", "ヒナペンタン", 2000)]
    scenario({
        name: "GX24-ライフが1になったとき手札のスピリットすべてをコストを支払わずに召喚し（マジックは召喚しない）、払わなければフラッシュは発揮しない",
        start: board(2),
        steps: (t) => run(t, "noPay"),
        // ライフ減少のコア1個込みでリザーブ11。置くコアはトドール・ヒナペンタン1個ずつ
        expect: [...common, ...hands, ...summons, "自分.ライフ: 2 → 1", "自分.リザーブ: 10 → 9", `自分.トラッシュ: なし → ${dn}`],
    })
    scenario({
        name: "GX24-その後コストを支払うと、ライフが5になるようにボイドからコアが置かれる（召喚した白・黄のシンボルで軽減されコスト4）",
        start: board(2),
        steps: (t) => run(t, true),
        expect: [...common, ...hands, ...summons, "自分.ライフ: 2 → 5", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 4", `自分.トラッシュ: なし → ${dn}`],
    })
    scenario({
        name: "GX24-ライフが1にならなければ（3→2）召喚もフラッシュも起きない（バーストカードは使用済みになる）",
        start: board(3),
        steps: (t) => run(t, "noPay"), // 払う確認は出るが、対戦者が払わなければ何も起きない
        expect: [...common, "自分.ライフ: 3 → 2", "自分.リザーブ: 10 → 11", `自分.トラッシュ: なし → ${dn}`],
    })
    scenario({
        name: "GX24-ジャスティス立花以外はバーストをセットできない",
        start: { me: { hand: ["GX24"] } },
        steps: (t) => t.actRejected("me", { type: "setBurst", handIndex: 0 }),
        expect: [],
    })
}

// ==== KF-02 キング・カーネル ====
if (check("KF-02", "キング・カーネル", "spirit", 4)) {
    console.log("=== KF-02 カード名に「カーネル」/「ケンタ」と入っている自分のスピリット1体につき、このスピリットをBP+1000 ===")
    const start = (mine: string[], theirs: string[] = []) => ({
        me: { spirits: [{ card: "KF-02", label: "K" }, ...mine.map((c, i) => ({ card: c, label: `M${i}` }))] },
        opp: { spirits: theirs.map((c, i) => ({ card: c, label: `T${i}` })) },
    })
    const cases: [string, string[], string[], number][] = [
        ["自分に条件に合うスピリットがキング・カーネル自身だけ（自身も名前に「カーネル」を含む）", [], [], 4000],
        ["カーネル・ドラゴン1体が加わると+1000", [KF01], [], 5000],
        ["「カーネル」と「ケンタ」の名の2体が加わると+2000", [KF01, KF13], [], 6000],
        ["名前に合わないスピリットは数えない", [VAN], [], 4000],
        ["相手のスピリットは数えない", [], [KF01], 4000],
    ]
    for (const [name, mine, theirs, want] of cases) {
        scenario({ name: `KF-02-${name}`, start: start(mine, theirs), steps: (t) => assert(bp(t, "K") === want, `KF-02: BPは${want}（実際 ${bp(t, "K")}）`), expect: [] })
    }
}

// ==== KF-07 フライドチキンの殿堂 ====
if (check("KF-07", "フライドチキンの殿堂", "nexus", 4)) {
    console.log("=== KF-07 Lv1･Lv2：お互いのアタックステップ、カード名に「カーネル」/「ケンタ」と入っている自分のスピリットすべてをBP+2000。Lv2：相手のメインステップ、相手のスピリットすべての召喚時効果は発揮されない ===")
    const bpBoard = (cores: number, turn: "me" | "opp", phase: "main" | "attack") => ({
        turn, phase,
        me: { nexuses: [{ card: "KF-07", label: "N", cores }], spirits: [{ card: KF01, label: "K" }, { card: VAN, label: "V" }] },
        opp: { spirits: [{ card: KF03, label: "T" }] },
    })
    for (const [lv, cores] of [["Lv1", 0], ["Lv2", 3]] as const) {
        scenario({
            name: `KF-07-${lv}：自分のアタックステップで、カーネル・ドラゴンはBP+2000。他のスピリット・相手のスピリットは変わらない`,
            start: bpBoard(cores, "me", "attack"),
            steps(t) {
                assert(bp(t, "K") === 6000, `KF-07: 自分のアタックステップのBPは6000（実際 ${bp(t, "K")}）`)
                assert(bp(t, "V") === 1000 && bp(t, "T") === 4000, "KF-07: ほかは変わらない")
            },
            expect: [],
        })
        scenario({
            name: `KF-07-${lv}：相手のアタックステップでもBP+2000`,
            start: bpBoard(cores, "opp", "attack"),
            steps: (t) => assert(bp(t, "K") === 6000, `KF-07: 相手のアタックステップのBPは6000（実際 ${bp(t, "K")}）`),
            expect: [],
        })
        scenario({
            name: `KF-07-${lv}：メインステップでは+2000されない`,
            start: bpBoard(cores, "me", "main"),
            steps: (t) => assert(bp(t, "K") === 4000, `KF-07: メインステップのBPは4000（実際 ${bp(t, "K")}）`),
            expect: [],
        })
    }
    // 相手がチキンフィレサンドナイトを召喚（4＋コア1）。召喚時：自分のスピリットのコア1個を自分のリザーブへ
    const oppSummon = (cores: number) => ({
        turn: "opp" as const,
        me: { nexuses: [{ card: "KF-07", label: "N", cores }], spirits: [{ card: VAN, label: "A", cores: 2 }] },
        opp: { hand: [KF04] },
    })
    const summoned = ["相手.手札: チキンフィレサンドナイト → なし", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4", ...born("相手", "チキンフィレサンドナイト", 1000)]
    scenario({
        name: "KF-07-Lv2：相手のメインステップに召喚されたスピリットの召喚時効果は発揮されない",
        start: oppSummon(3),
        steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
        expect: summoned,
    })
    scenario({
        name: "KF-07-Lv1：Lv2でなければ召喚時効果は発揮される（自分のスピリットのコアが1個リザーブへ）",
        start: oppSummon(0),
        steps(t) {
            t.act("opp", { type: "summon", handIndex: 0 })
            resolveAll(t)
        },
        expect: [...summoned, "自分.A.コア: 2 → 1", "自分.A.Lv: 2 → 1", "自分.A.BP: 3000 → 1000", "自分.リザーブ: 10 → 11"],
    })
}

// ==== KF-14 爆揚げの覇王ケンタ・ドラゴン・バゼル ====
if (check("KF-14", "爆揚げの覇王ケンタ・ドラゴン・バゼル", "spirit", 7)) {
    console.log("=== KF-14 バースト：召喚（コストは払わない）。Lv2･Lv3 アタック時：「カーネル」入りの自分のスピリットがいるとき BP+5000。Lv3：自分のバースト発動後に回復 ===")
    const burstBoard = (reserve = 10) => ({
        names: { me: "アキラ", opp: "ユウキ" }, turn: "opp" as const, phase: "attack" as const, interactive: true,
        me: { burst: "KF-14", reserve, spirits: [{ card: TODOL, label: "A" }] },
        opp: { spirits: [{ card: VAN, label: "O" }] },
    })
    const takeLife = (t: ScenarioCtx): void => {
        t.act("opp", { type: "attack", instanceId: t.id("O") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        resolveAll(t, ["A"])
    }
    const common = ["相手.O.疲労: false → true", "自分.ライフ: 5 → 4", "自分.バースト: 爆揚げの覇王ケンタ・ドラゴン・バゼル → なし"]
    scenario({
        name: "KF-14-バースト：ライフ減少後にコストを支払わずに召喚する",
        start: burstBoard(),
        steps: takeLife,
        expect: [...common, ...born("自分", "爆揚げの覇王ケンタ・ドラゴン・バゼル", 5000)],
    })
    const attackBoard = (cores: number, mine: string[]) => ({
        phase: "attack" as const,
        me: { spirits: [{ card: "KF-14", label: "K", cores }, ...mine.map((c, i) => ({ card: c, label: `M${i}` }))] },
        opp: { spirits: [{ card: VAN, label: "U" }] },
    })
    scenario({
        name: "KF-14-Lv2アタック時：カーネルの名のスピリットがいればBP+5000（7000→12000）",
        start: attackBoard(3, [KF01]),
        steps: (t) => t.act("me", { type: "attack", instanceId: t.id("K") }),
        expect: ["自分.K.疲労: false → true", "自分.K.BP: 7000 → 12000"],
    })
    scenario({
        name: "KF-14-Lv2アタック時：カーネルの名のスピリットがいなければBPは変わらない（ケンタ名やほかの名前は条件を満たさない）",
        start: attackBoard(3, [KF13, VAN]),
        steps: (t) => t.act("me", { type: "attack", instanceId: t.id("K") }),
        expect: ["自分.K.疲労: false → true"],
    })
    scenario({
        name: "KF-14-Lv1にはアタック時のBP上昇がない",
        start: attackBoard(1, [KF01]),
        steps: (t) => t.act("me", { type: "attack", instanceId: t.id("K") }),
        expect: ["自分.K.疲労: false → true"],
    })
    // 絶甲氷盾：ライフ減少後にライフへコア1個（ライフは5のまま）。フラッシュは払わない
    const recoverBoard = (cores: number) => ({
        names: { me: "アキラ", opp: "ユウキ" }, turn: "opp" as const, phase: "attack" as const, interactive: true,
        me: { burst: SHIELD, spirits: [{ card: "KF-14", label: "K", cores, rested: true }] },
        opp: { spirits: [{ card: VAN, label: "O" }] },
    })
    const afterBurst = ["相手.O.疲労: false → true", "自分.バースト: 絶甲氷盾 → なし", "自分.トラッシュ: なし → 絶甲氷盾", "自分.リザーブ: 10 → 11"]
    scenario({
        name: "KF-14-Lv3：自分のバースト発動後に回復する",
        start: recoverBoard(5),
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.closeFlash()
            t.act("me", { type: "takeLife" })
            resolveAll(t, [], "noPay")
        },
        expect: [...afterBurst, "自分.K.疲労: true → false"],
    })
    scenario({
        name: "KF-14-Lv2では回復しない",
        start: recoverBoard(3),
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.closeFlash()
            t.act("me", { type: "takeLife" })
            resolveAll(t, [], "noPay")
        },
        expect: afterBurst,
    })
}

// ==== KF-15 アルバイト姫ケンタッキースター ====
if (check("KF-15", "アルバイト姫ケンタッキースター", "spirit", 6)) {
    console.log("=== KF-15 Lv1･Lv2 召喚時：トラッシュの「カーネル」入りスピリット1枚を手札へ。Lv2 アタック時：Lv1の相手のスピリットからブロックされない ===")
    const ks = "アルバイト姫ケンタッキースター"
    const summon = (trash: string[]) => ({
        name: "", start: { interactive: true, me: { hand: ["KF-15"], trash } },
        steps(t: ScenarioCtx) {
            t.act("me", { type: "summon", handIndex: 0 })
            resolveAll(t, ["カーネル・ゴレム"])
        },
    })
    scenario({
        ...summon([KF01, KF03, VAN]),
        name: "KF-15-召喚時：トラッシュのカーネル入りスピリット（2枚から選んだ1枚）を手札へ戻す",
        expect: [
            `自分.手札: ${ks} → カーネル・ゴレム`, `自分.トラッシュ: ${nm("カーネル・ドラゴン", "カーネル・ゴレム", "ロクケラトプス")} → ${nm("カーネル・ドラゴン", "ロクケラトプス")}`,
            "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 6", ...born("自分", ks, 4000),
        ],
    })
    scenario({
        ...summon([KF13, VAN]),
        name: "KF-15-「ケンタ」入りだけのトラッシュからは戻らない（名前に「カーネル」と入るものだけ）",
        expect: [`自分.手札: ${ks} → なし`, "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 6", ...born("自分", ks, 4000)],
    })
    const atk = (cores: number, oppCores: number) => ({
        phase: "attack" as const,
        me: { spirits: [{ card: "KF-15", label: "K", cores }] },
        opp: { spirits: [{ card: VAN, label: "B", cores: oppCores }] },
    })
    scenario({
        name: "KF-15-Lv2アタック時：Lv1の相手のスピリットはブロックできず、ライフで受ける",
        start: atk(3, 1),
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("K") })
            t.closeFlash()
            t.actRejected("opp", { type: "block", instanceId: t.id("B") })
            t.act("opp", { type: "takeLife" })
            t.closeFlash()
        },
        expect: ["自分.K.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "KF-15-Lv2アタック時：Lv2の相手のスピリットはブロックできる（BP6000が3000を破壊）",
        start: atk(3, 2),
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("K") })
            t.closeFlash()
            t.act("opp", { type: "block", instanceId: t.id("B") })
            t.closeFlash()
        },
        expect: ["自分.K.疲労: false → true", "相手.B.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 12"],
    })
    scenario({
        name: "KF-15-Lv1にはブロックされない効果がなく、Lv1の相手のスピリットもブロックできる",
        start: atk(1, 1),
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("K") })
            t.closeFlash()
            t.act("opp", { type: "block", instanceId: t.id("B") })
            t.closeFlash()
        },
        expect: ["自分.K.疲労: false → true", "相手.B.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
    })
}

// ==== PB12-04 ふりかけの覇王ホワイトライス ====
if (check("PB12-04", "ふりかけの覇王ホワイトライス", "spirit", 5)) {
    console.log("=== PB12-04 バースト：BP(自分のスピリットの体数×1000)以下の相手のスピリット1体を破壊。この効果発揮後、このスピリットカードを召喚 ===")
    const name = "ふりかけの覇王ホワイトライス"
    const board = (mine: { card: string; label: string }[]) => ({
        names: { me: "アキラ", opp: "ユウキ" }, turn: "opp" as const, phase: "attack" as const, interactive: true,
        me: { burst: "PB12-04", spirits: mine },
        opp: { spirits: [{ card: VAN, label: "O" }, { card: VAN, label: "Y", cores: 2 }] },
    })
    const run = (t: ScenarioCtx): void => {
        t.act("opp", { type: "attack", instanceId: t.id("O") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        resolveAll(t, ["Y", "O"])
    }
    const common = ["自分.ライフ: 5 → 4", `自分.バースト: ${name} → なし`]
    // 赤のシンボル1つ（ロクケラトプス）で軽減されコスト4
    scenario({
        name: "PB12-04-自分のスピリットが2体なら BP2000以下（O）だけが対象。Y（BP3000）は破壊されない。そのあと召喚する",
        start: board([{ card: TODOL, label: "A" }, { card: VAN, label: "B" }]),
        steps: run,
        expect: [...common, "相手.O.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11", ...born("自分", name, 4000)],
    })
    // 赤のシンボル2つで軽減されコスト3
    scenario({
        name: "PB12-04-自分のスピリットが3体なら BP3000以下になり、Y（BP3000）を選んで破壊できる",
        start: board([{ card: TODOL, label: "A" }, { card: VAN, label: "B" }, { card: VAN, label: "C" }]),
        steps: run,
        expect: [...common, "相手.O.疲労: false → true", "相手.Y.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 12", ...born("自分", name, 4000)],
    })
}

// ==== PB13-01 魔犬ゼロ ====
if (check("PB13-01", "魔犬ゼロ", "spirit", 5)) {
    console.log("=== PB13-01 Lv1･Lv2【呪撃】アタック時：ブロックした相手のスピリット1体をバトル終了時に破壊。【連鎖：黄シンボル】相手のライフを減らしたとき、ボイドからコア1個を自分のライフへ ===")
    scenario({
        name: "PB13-01-【呪撃】：ブロックされると、BPで負けて破壊されても、ブロックしたスピリットはバトル終了時に破壊される",
        start: { phase: "attack", me: { spirits: [{ card: "PB13-01", label: "Z" }] }, opp: { spirits: [{ card: VAN, label: "K", cores: 3 }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("Z") })
            t.closeFlash()
            t.act("opp", { type: "block", instanceId: t.id("K") })
            t.closeFlash()
        },
        expect: ["自分.Z.場所: フィールド → なし", "自分.トラッシュ: なし → 魔犬ゼロ", "自分.リザーブ: 10 → 11", "相手.K.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 13"],
    })
    const lifeAttack = (mine: string) => ({
        name: "",
        start: { phase: "attack" as const, me: { spirits: [{ card: "PB13-01", label: "Z" }, { card: mine, label: "Y" }] }, opp: {} },
        steps(t: ScenarioCtx) {
            t.act("me", { type: "attack", instanceId: t.id("Z") })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
            t.closeFlash()
        },
    })
    scenario({
        ...lifeAttack(HINA),
        name: "PB13-01-連鎖：自分に黄のシンボルがあるとき、アタックで相手のライフを減らすと自分のライフが1増える",
        expect: ["自分.Z.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", "自分.ライフ: 5 → 6"],
    })
    scenario({
        ...lifeAttack(TODOL),
        name: "PB13-01-連鎖：黄のシンボルが無ければ自分のライフは増えない",
        expect: ["自分.Z.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
}

// ==== X010 超皇帝ジークペンタン・ノヴァ ====
if (check("X010", "超皇帝ジークペンタン・ノヴァ", "spirit", 8)) {
    console.log("=== X010 【転召：歌鳥/ボイド】。[皇帝アンプルール]で転召したとき、手札とトラッシュの「ペンタン」入りスピリットを好きなだけ無償召喚（召喚時効果は発揮されない） ===")
    const x = "超皇帝ジークペンタン・ノヴァ"
    const board = (field: string) => ({
        interactive: true, manualCoreLevel: true as const,
        me: { reserve: 20, hand: ["X010", PENT], trash: [ADO], spirits: [{ card: field, label: "S", cores: 3 }], },
    })
    scenario({
        name: "X010-皇帝アンプルールで転召すると、手札の森の妖精ペンタンとトラッシュの冒険家アドペンタンを無償召喚し、冒険家アドペンタンの召喚時効果（デッキ上3枚オープン）は発揮されない",
        start: board(AMP),
        steps(t) {
            const n = deckLen(t)
            t.act("me", { type: "summon", handIndex: 0 })
            resolveAll(t, ["S"])
            assert(deckLen(t) === n, "X010: ただし書きにより召喚時効果は発揮されずデッキは変わらない")
            assert(!t.state.players[t.me].hand.includes("X010") && !t.state.players[t.me].hand.includes(PENT), "X010: 手札の2枚は場に出た")
        },
        expect: [
            "自分.S.場所: フィールド → なし", `自分.手札: ${nm(x, "森の妖精ペンタン")} → なし`, "自分.トラッシュ: 冒険家アドペンタン → 皇帝アンプルール",
            "自分.リザーブ: 20 → 10", "自分.トラッシュのコア: 0 → 7",
            ...born("自分", x, 5000), ...born("自分", "森の妖精ペンタン", 1000), ...born("自分", "冒険家アドペンタン", 3000),
        ],
    })
}

// ==== X015 放浪者ロロ ====
if (check("X015", "放浪者ロロ", "spirit", 6)) {
    console.log("=== X015 コストを支払わなければ召喚できない。Lv1･Lv2：アタックと合体ができず、このスピリット以外の一切の効果を受けない ===")
    scenario({
        name: "X015-手札からコストを支払って召喚できる（コスト6＋コア1）",
        start: { me: { hand: ["X015"] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: summonOut("自分", "放浪者ロロ", 6, 3000),
    })
    scenario({
        name: "X015-軽減でコストが0になっても、0コストを支払ったことになり召喚できる（場のX015のシンボル6色で軽減）",
        start: { me: { hand: ["X015"], spirits: [{ card: "X015", label: "R" }] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: [...summonOut("自分", "放浪者ロロ", 0, 3000).filter((l) => !l.startsWith("自分.リザーブ") && !l.startsWith("自分.トラッシュのコア")), "自分.リザーブ: 10 → 9"],
    })
    scenario({
        name: "X015-コストを支払わずに召喚する効果では出せない（運命神焔武でオープンしても召喚されない）",
        start: { names: { me: "薬師寺アラタ", opp: "ユウキ" }, turn: "opp" as const, phase: "attack" as const, interactive: true, me: { burst: "GX23", deck: ["X015", KF12, KF12, KF12, KF12] }, opp: { spirits: [{ card: VAN, label: "O" }] } },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.closeFlash()
            t.act("me", { type: "takeLife" })
            resolveAll(t, [], "noPay")
        },
        expect: ["相手.O.疲労: false → true", "自分.ライフ: 5 → 4", "自分.バースト: 運命神焔武 → なし", "自分.トラッシュ: なし → " + nm("運命神焔武"), "自分.デッキ枚数: 5 → 0", "自分.リザーブ: 10 → 11", "自分.手札: なし → " + nm("放浪者ロロ", ...Array(4).fill("ポテトアロー"))], // 召喚できないカードは候補に入らず、残りのカードとして手札へ
    })
    scenario({
        name: "X015-アタックできない",
        start: { phase: "attack", me: { spirits: [{ card: "X015", label: "R" }] } },
        steps: (t) => t.actRejected("me", { type: "attack", instanceId: t.id("R") }),
        expect: [],
    })
    scenario({
        name: "X015-ブレイヴと合体できない",
        start: { me: { spirits: [{ card: "X015", label: "R" }, { card: BRAVE1, label: "G" }] } },
        steps: (t) => t.actRejected("me", { type: "combineBrave", braveInstanceId: t.id("G"), hostInstanceId: t.id("R") }),
        expect: [],
    })
    scenario({
        name: "X015-相手のマジックの効果を受けない（ポテトアロー BP4000以下すべて破壊：BP3000のX015は残り、BP1000のAだけ破壊）",
        start: { turn: "opp", me: { spirits: [{ card: "X015", label: "R" }, { card: VAN, label: "A" }] }, opp: { hand: [KF12] } },
        steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" }),
        expect: [
            ...magicOut("相手", "ポテトアロー", 5), "自分.A.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11",
        ],
    })
}

// ==== X018 歌鳥の覇王ジーク・ヤマト・ペンタン（バーストの節） ====
if (check("X018", "歌鳥の覇王ジーク・ヤマト・ペンタン", "spirit", 8)) {
    console.log("=== X018 バースト：ライフが3以下のとき、BP15000以下の相手のスピリット1体はこのターンアタックできない。この効果発揮後、このスピリットカードを召喚 ===")
    const name = "歌鳥の覇王ジーク・ヤマト・ペンタン"
    const board = (life: number) => ({
        names: { me: "アキラ", opp: "ユウキ" }, turn: "opp" as const, phase: "attack" as const, interactive: true,
        me: { burst: "X018", life, spirits: [{ card: TODOL, label: "A" }] },
        opp: { spirits: [{ card: VAN, label: "O" }, { card: VAN, label: "Y" }, { card: VAN, label: "Z" }] },
    })
    const start = (t: ScenarioCtx): void => {
        t.act("opp", { type: "attack", instanceId: t.id("O") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    }
    scenario({
        name: "X018-ライフが3になったとき、選んだ相手のスピリットY はこのターンアタックできず（Z は できる）、このスピリットを召喚する",
        start: board(4),
        steps(t) {
            start(t)
            resolveAll(t, ["Y"])
            t.actRejected("opp", { type: "attack", instanceId: t.id("Y") })
            t.act("opp", { type: "attack", instanceId: t.id("Z") })
        },
        expect: ["相手.O.疲労: false → true", "相手.Z.疲労: false → true", "自分.ライフ: 4 → 3", `自分.バースト: ${name} → なし`, ...born("自分", name, 5000)],
    })
    scenario({
        name: "X018-ライフが4のままなら（5→4）効果も召喚も起きず、バーストカードは使用済みになる",
        start: board(5),
        steps(t) {
            start(t)
            resolveAll(t, ["Y"])
        },
        expect: ["相手.O.疲労: false → true", "自分.ライフ: 5 → 4", `自分.バースト: ${name} → なし`, `自分.トラッシュ: なし → ${name}`, "自分.リザーブ: 10 → 11"],
    })
}

// ==== GX12-01 偽☆ギャラクシー（バースト以外） ====
if (check("GX12-01", "偽☆ギャラクシー", "spirit", 12)) {
    console.log("=== GX12-01 Lv1･Lv2：相手の一切の効果を受けない。Lv2 フラッシュ：トラッシュの「犬」入りスピリット/ブレイヴ1枚を無償召喚 ===")
    scenario({
        name: "GX12-01-相手のスピリットの召喚時効果（相手の効果）を受けない：コア除去の対象は他のスピリットAだけになる",
        start: { turn: "opp", interactive: true, me: { spirits: [{ card: "GX12-01", label: "G", cores: 5 }, { card: VAN, label: "A", cores: 2 }] }, opp: { hand: [KF04] } },
        steps(t) {
            t.act("opp", { type: "summon", handIndex: 0 })
            resolveAll(t, ["G", "A"])
        },
        expect: ["相手.手札: チキンフィレサンドナイト → なし", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4", ...born("相手", "チキンフィレサンドナイト", 1000), "自分.A.コア: 2 → 1", "自分.A.Lv: 2 → 1", "自分.A.BP: 3000 → 1000", "自分.リザーブ: 10 → 11"],
    })
    scenario({
        name: "GX12-01-相手のマジックの効果を受けない：BP4000以下すべてを破壊するポテトアローで、BP10000のGは残りAだけ破壊される",
        start: { turn: "opp", me: { spirits: [{ card: "GX12-01", label: "G" }, { card: VAN, label: "A" }] }, opp: { hand: [KF12] } },
        steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" }),
        expect: [...magicOut("相手", "ポテトアロー", 5), "自分.A.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11"],
    })
    const flashId = (): string => getCard("GX12-01").effects!.find((e) => e.kind === "activated")!.id
    const flash = (cores: number, trash: string[]) => ({
        name: "",
        start: { turn: "opp" as const, phase: "attack" as const, interactive: true, me: { trash, spirits: [{ card: "GX12-01", label: "G", cores }] }, opp: { spirits: [{ card: VAN, label: "O" }] } },
        steps(t: ScenarioCtx) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.act("me", { type: "activateAbility", instanceId: t.id("G"), effectId: flashId() })
            resolveAll(t)
        },
    })
    scenario({
        ...flash(5, [DOG, VAN]),
        name: "GX12-01-Lv2フラッシュ：トラッシュの「犬」入りスピリットを無償召喚する（犬でないカードは召喚しない）",
        expect: ["相手.O.疲労: false → true", `自分.トラッシュ: ${nm("星犬ポメラン", "ロクケラトプス")} → ロクケラトプス`, "自分.リザーブ: 10 → 9", ...born("自分", "星犬ポメラン", 3000)],
    })
    scenario({
        name: "GX12-01-Lv1ではフラッシュ効果を使えない",
        start: flash(1, [DOG]).start,
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            t.actRejected("me", { type: "activateAbility", instanceId: t.id("G"), effectId: flashId() })
        },
        expect: ["相手.O.疲労: false → true"],
    })
}

console.log("すべてのチェックに合格しました 🎉（part1021）")
