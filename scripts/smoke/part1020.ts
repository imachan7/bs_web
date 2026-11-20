// smoke パート1020（#631 GX02・GX09・GX12・GX17・GX19・GX21・PB12-06）
// 期待値役：効果文だけから書いた。staging のカードは data に入るまで節ごと（未実装）で飛ばす
import { born, check, fix, magicOut, nm, nmOf, resolveAll, VAN } from "./lib631"
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const TODOL = "BS17-030" // トドール（白・コスト3・Lv1 BP1000・バニラ）
const BRONZE = "SD10-005" // ブロンズ・ヴルム（赤・コスト3・Lv1 BP3000）
const FLARE = "P038" // 太陽飛竜フレアドラグーン（赤・コスト4・Lv1 BP3000）
const GOLEM = "P040" // 太陽巨兵ソーラー・ゴレム（青・コスト4）
const GEKKA = "P037" // 月光妖精ゲッカ（黄・コスト4・Lv1 BP3000）
const SCORE = "BS10-X06" // 天蠍神騎スコル・スピア（青・コスト5・系統 光導・Lv1 BP5000）
const LORD = "X012R" // 英雄皇ロード・ドラゴン・ドミニオン（赤・コスト6・Lv1 BP5000）
const NEXUS = "BS01-110" // 時止まりの氷原（ネクサス・コスト3）
const COFFIN = "BS01-131" // ダークコフィン（紫マジック・コスト7）
const BRAVE1 = "BS21-063" // ぐるみパンダ（黄ブレイヴ・コスト4・合体条件 コスト4以上）
const BRAVE2 = "BS21-061" // 衛星機パイオニア・V（白ブレイヴ・コスト3・合体条件 白のシンボル）
const TENREI = "BS10-048" // 天使パワー（黄・コスト5）
const SOLEIL = "SD03-006" // 太陽龍ジーク・アポロドラゴン（赤・コスト6）

console.log("=== 前提: カードの機械確認 ===")
fix(TODOL, "トドール", "spirit", 3)
fix(BRONZE, "ブロンズ・ヴルム", "spirit", 3)
fix(FLARE, "太陽飛竜フレアドラグーン", "spirit", 4)
fix(GOLEM, "太陽巨兵ソーラー・ゴレム", "spirit", 4)
fix(GEKKA, "月光妖精ゲッカ", "spirit", 4)
fix(SCORE, "天蠍神騎スコル・スピア", "spirit", 5)
fix(LORD, "英雄皇ロード・ドラゴン・ドミニオン", "spirit", 6)
fix(NEXUS, "時止まりの氷原", "nexus", 3)
fix(COFFIN, "ダークコフィン", "magic", 7)
fix(BRAVE1, "ぐるみパンダ", "brave", 4)
fix(BRAVE2, "衛星機パイオニア・V", "brave", 3)
fix(TENREI, "天使パワー", "spirit", 5)
fix(SOLEIL, "太陽龍ジーク・アポロドラゴン", "spirit", 6)

const castMain = (t: ScenarioCtx): void => t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
const castFlash = (t: ScenarioCtx, target: string): void => t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id(target) })
const REJECT = { type: "castMagic", handIndex: 0, timing: "main" } as const
const deckOf = (t: ScenarioCtx): string => [...t.state.players[t.me].deck].sort().join(",")
const sorted = (ids: string[]): string => [...ids].sort().join(",")

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

// メイン：デッキすべてを見て、条件に合うスピリット1枚をコストを支払わずに召喚し、その後シャッフル
function mainTests(id: string, name: string, cost: number, who: string, target: string, tName: string, tBp: number, bonus: number, flashSpirit = TODOL): void {
    const dn = nmOf(id)
    const board = (n: string, deck: string[]) => ({ names: { me: n, opp: "ユウキ" }, interactive: true, me: { hand: [id], deck } })
    const deck = [VAN, target, VAN, VAN, VAN]
    scenario({
        name: `${id}-使える人が使うと、デッキから条件に合う${tName}を召喚する（召喚コストは払わない）。デッキは残り4枚`,
        start: board(who, deck),
        steps(t) {
            castMain(t)
            resolveAll(t)
            assert(deckOf(t) === sorted([VAN, VAN, VAN, VAN]), `${id}: 召喚した1枚だけがデッキから減る`)
        },
        expect: [...magicOut("自分", dn, cost).filter((l) => !l.startsWith("自分.リザーブ")), `自分.リザーブ: 10 → ${10 - cost - 1}`, "自分.デッキ枚数: 5 → 4", ...born("自分", tName, tBp)],
    })
    scenario({
        name: `${id}-条件に合うカードがデッキに無ければ召喚せず、デッキは5枚のまま`,
        start: board(who, [VAN, VAN, VAN, VAN, VAN]),
        steps(t) {
            castMain(t)
            resolveAll(t)
            assert(deckOf(t) === sorted([VAN, VAN, VAN, VAN, VAN]), `${id}: デッキの中身は変わらない`)
        },
        expect: magicOut("自分", dn, cost),
    })
    scenario({
        name: `${id}-使える人でないプレイヤーは使用できない`,
        start: { me: { hand: [id] } },
        steps: (t) => t.actRejected("me", REJECT),
        expect: [],
    })
    flashTests(id, who, cost, bonus, flashSpirit)
}

// ==== GX02 ヴィクトリードロー ====
const ok02 = check("GX02", "ヴィクトリードロー", "magic", 1)
if (ok02) {
    console.log("=== GX02 メイン：デッキから「ヴルム」入りのスピリット1枚を無償召喚できる。その後シャッフル ===")
    const dn = nmOf("GX02")
    const board = (n: string, deck: string[]) => ({ names: { me: n, opp: "ユウキ" }, interactive: true, me: { hand: ["GX02"], deck } })
    const deck = [VAN, BRONZE, VAN, VAN, VAN]
    scenario({
        name: "GX02-コアの光主（空白は無視）が使うと、デッキのヴルム入りスピリットを無償召喚する。デッキは残り4枚",
        start: board("馬神 弾", deck),
        steps(t) {
            castMain(t)
            resolveAll(t)
            assert(deckOf(t) === sorted([VAN, VAN, VAN, VAN]), "GX02: 召喚した1枚だけがデッキから減る")
        },
        expect: [...magicOut("自分", dn, 1).filter((l) => !l.startsWith("自分.リザーブ")), "自分.リザーブ: 10 → 8", "自分.デッキ枚数: 5 → 4", ...born("自分", "ブロンズ・ヴルム", 3000)],
    })
    scenario({
        name: "GX02-召喚できるを断ると召喚しないが、デッキのシャッフルは行う（デッキは5枚のまま）",
        start: board("クラッキー・レイ", deck),
        steps(t) {
            castMain(t)
            resolveAll(t, [], false)
            assert(deckOf(t) === sorted(deck), "GX02: 断ってもデッキの中身は変わらない")
        },
        expect: magicOut("自分", dn, 1),
    })
    scenario({
        name: "GX02-ヴルム入りが無ければ召喚しない",
        start: board("硯秀斗", [VAN, VAN, VAN, VAN, VAN]),
        steps(t) {
            castMain(t)
            resolveAll(t)
        },
        expect: magicOut("自分", dn, 1),
    })
    scenario({
        name: "GX02-コアの光主でないプレイヤーは使用できない",
        start: { me: { hand: ["GX02"] } },
        steps: (t) => t.actRejected("me", REJECT),
        expect: [],
    })
    flashTests("GX02", "百瀬勇貴", 1, 1000)
}

// ==== GX09 ライジングドロー ====
if (check("GX09", "ライジングドロー", "magic", 3)) {
    console.log("=== GX09 メイン：デッキから「太陽」入りのスピリット1枚を無償召喚する。その後シャッフル ===")
    mainTests("GX09", "ライジングドロー", 3, "馬神弾", FLARE, "太陽飛竜フレアドラグーン", 3000, 5000)
    scenario({
        name: "GX09-「太陽」入りが2枚あれば、使った本人が選んだ1枚だけを召喚する",
        start: { names: { me: "馬神弾", opp: "ユウキ" }, interactive: true, me: { hand: ["GX09"], deck: [FLARE, GOLEM, SOLEIL, VAN, VAN] } },
        steps(t) {
            castMain(t)
            resolveAll(t, ["太陽巨兵ソーラー・ゴレム"])
            assert(deckOf(t) === sorted([FLARE, SOLEIL, VAN, VAN]), "GX09: 選んだ1枚だけがデッキから減る")
        },
        expect: [...magicOut("自分", nmOf("GX09"), 3).filter((l) => !l.startsWith("自分.リザーブ")), "自分.リザーブ: 10 → 6", "自分.デッキ枚数: 5 → 4", ...born("自分", "太陽巨兵ソーラー・ゴレム", 3000)],
    })
}

// ==== GX12 ルナテックドロー ====
if (check("GX12", "ルナテックドロー", "magic", 3)) {
    console.log("=== GX12 メイン：デッキから「月光」入りのスピリット1枚を無償召喚する。その後シャッフル ===")
    mainTests("GX12", "ルナテックドロー", 3, "月光のバローネ", GEKKA, "月光妖精ゲッカ", 3000, 5000, VAN)
}

// ==== GX17 ゾディアックサーチ ====
if (check("GX17", "ゾディアックサーチ", "magic", 5)) {
    console.log("=== GX17 メイン：デッキから系統「光導」のスピリット1枚を無償召喚する。その後シャッフル ===")
    mainTests("GX17", "ゾディアックサーチ", 5, "兵堂剣蔵", SCORE, "天蠍神騎スコル・スピア", 5000, 5000)
}

// ==== GX19 ハンサムドロー ====
if (check("GX19", "ハンサムドロー", "magic", 2)) {
    console.log("=== GX19 メイン：お互い手札すべてを破棄。その後お互い、デッキの上から2枚目をドロー ===")
    const dn = nmOf("GX19")
    scenario({
        name: "GX19-ハンサムが使うと、お互いの手札すべてを破棄し、お互いデッキの上から2枚目だけを引く（上の1枚は残る）",
        start: {
            names: { me: "ハンサム", opp: "ユウキ" },
            me: { hand: ["GX19", TENREI], deck: [VAN, TODOL, BRONZE] },
            opp: { hand: [VAN, TODOL], deck: [COFFIN, GEKKA, FLARE] },
        },
        steps: castMain,
        expect: [
            `自分.手札: ${nm(dn, "天使パワー")} → ${nm("トドール")}`, `自分.トラッシュ: なし → ${nm(dn, "天使パワー")}`,
            "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 2", "自分.デッキ枚数: 3 → 2",
            `相手.手札: ${nm("ロクケラトプス", "トドール")} → ${nm("月光妖精ゲッカ")}`, `相手.トラッシュ: なし → ${nm("ロクケラトプス", "トドール")}`, "相手.デッキ枚数: 3 → 2",
        ],
    })
    scenario({
        name: "GX19-デッキが1枚なら2枚目が無いので引かない（手札の破棄は行う）",
        start: {
            names: { me: "ハンサム", opp: "ユウキ" },
            me: { hand: ["GX19", TENREI], deck: [VAN] },
            opp: { hand: [VAN], deck: [COFFIN] },
        },
        steps: castMain,
        expect: [
            `自分.手札: ${nm(dn, "天使パワー")} → なし`, `自分.トラッシュ: なし → ${nm(dn, "天使パワー")}`, "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 2",
            "相手.手札: ロクケラトプス → なし", "相手.トラッシュ: なし → ロクケラトプス",
        ],
    })
    scenario({
        name: "GX19-ハンサム以外は使用できない",
        start: { me: { hand: ["GX19"] } },
        steps: (t) => t.actRejected("me", REJECT),
        expect: [],
    })
    flashTests("GX19", "ハンサム", 2, 2000)
}

// ==== GX21 太陽昇龍覇 ====
if (check("GX21", "太陽昇龍覇", "magic", 3)) {
    console.log("=== GX21 バースト（ライフ減少後）：デッキから「ロード・ドラゴン」入りのスピリット1枚を召喚（コストは払わない）。その後シャッフル。その後コストを支払ってフラッシュ ===")
    const dn = nmOf("GX21")
    const board = (deck: string[], reserve = 10) => ({
        names: { me: "陽昇ハジメ", opp: "ユウキ" }, turn: "opp" as const, phase: "attack" as const, interactive: true,
        me: { burst: "GX21", deck, reserve, spirits: [{ card: TODOL, label: "A" }] },
        opp: { spirits: [{ card: VAN, label: "O" }] },
    })
    const run = (t: ScenarioCtx, accept: boolean | "noPay"): void => {
        t.act("opp", { type: "attack", instanceId: t.id("O") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        resolveAll(t, ["A"], accept)
    }
    const common = ["相手.O.疲労: false → true", "自分.ライフ: 5 → 4", "自分.バースト: 太陽昇龍覇 → なし", `自分.トラッシュ: なし → ${dn}`]
    scenario({
        name: "GX21-ロード・ドラゴン入りのスピリットをコストを支払わずに召喚する。支払わなければフラッシュは発揮しない",
        start: board([VAN, LORD, VAN, VAN, VAN]),
        steps(t) {
            run(t, "noPay")
            assert(deckOf(t) === sorted([VAN, VAN, VAN, VAN]), "GX21: 召喚した1枚だけがデッキから減る")
        },
        expect: [...common, "自分.デッキ枚数: 5 → 4", ...born("自分", "英雄皇ロード・ドラゴン・ドミニオン", 5000)],
    })
    scenario({
        name: "GX21-ロード・ドラゴン入りが無ければ召喚せず、デッキは5枚のまま",
        start: board([VAN, VAN, VAN, VAN, VAN]),
        steps(t) {
            run(t, "noPay")
            assert(deckOf(t) === sorted([VAN, VAN, VAN, VAN, VAN]), "GX21: デッキの中身は変わらない")
        },
        expect: [...common, "自分.リザーブ: 10 → 11"],
    })
    scenario({
        name: "GX21-その後コストを支払うと、フラッシュ効果で自分のスピリット1体がBP+3000される",
        start: board([VAN, LORD, VAN, VAN, VAN]),
        steps: (t) => run(t, true),
        // 召喚したロード・ドラゴン（赤のシンボル1つ）の軽減で、フラッシュのコスト3は2になる
        expect: [...common, "自分.デッキ枚数: 5 → 4", "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 2", ...born("自分", "英雄皇ロード・ドラゴン・ドミニオン", 5000), "自分.A.BP: 1000 → 4000"],
    })
    scenario({
        name: "GX21-陽昇ハジメ以外は使えない（バーストもセットできない）",
        start: { me: { hand: ["GX21"] } },
        steps: (t) => t.actRejected("me", { type: "setBurst", handIndex: 0 }),
        expect: [],
    })
    flashTests("GX21", "陽昇ハジメ", 3, 3000)
}

// ==== PB12-06 ナイスミドル ====
if (check("PB12-06", "ナイスミドル", "spirit", 3)) {
    console.log("=== PB12-06 アタック時：デッキの上から1枚破棄。種類で効果が変わる ===")
    const board = (deck: string[]) => ({
        phase: "attack" as const, interactive: true,
        me: { deck, spirits: [{ card: "PB12-06", label: "P" }] },
        opp: { spirits: [{ card: VAN, label: "U" }, { card: VAN, label: "W" }] },
    })
    const base = (top: string, deckAfter = 2) => ["自分.P.疲労: false → true", `自分.トラッシュ: なし → ${getCard(top).name}`, `自分.デッキ枚数: 3 → ${deckAfter}`]
    const attack = (t: ScenarioCtx): void => {
        t.act("me", { type: "attack", instanceId: t.id("P") })
        resolveAll(t, ["U", "A", "B"])
    }
    scenario({
        name: "PB12-06-破棄したのがスピリットなら、相手のスピリット1体（自分が選ぶ）を疲労させる",
        start: board([TODOL, VAN, VAN]),
        steps: attack,
        expect: [...base(TODOL), "相手.U.疲労: false → true"],
    })
    scenario({
        name: "PB12-06-破棄したのがネクサスなら、自分はデッキから1枚ドローする（破棄の次の1枚）",
        start: board([NEXUS, TODOL, VAN]),
        steps: attack,
        expect: [...base(NEXUS, 1), "自分.手札: なし → トドール"],
    })
    scenario({
        name: "PB12-06-破棄したのがマジックなら、ボイドからコア1個を自分のリザーブに置く",
        start: board([COFFIN, VAN, VAN]),
        steps: attack,
        expect: [...base(COFFIN), "自分.リザーブ: 10 → 11"],
    })
    // 相手の合体スピリット2体は、相手のターンのメインで合体させてから、自分のアタックステップへ進めて作る
    scenario({
        name: "PB12-06-破棄したのがブレイヴなら、相手の合体スピリット2体が同時に疲労する（合体していない相手のスピリットは疲労しない）",
        start: {
            turn: "opp", phase: "main", interactive: true,
            me: { deck: [BRAVE1, VAN, VAN], spirits: [{ card: "PB12-06", label: "P" }] },
            opp: { spirits: [{ card: FLARE, label: "A" }, { card: TODOL, label: "B" }, { card: BRAVE1, label: "X" }, { card: BRAVE2, label: "Y" }, { card: VAN, label: "W" }] },
        },
        steps(t) {
            t.act("opp", { type: "combineBrave", braveInstanceId: t.id("X"), hostInstanceId: t.id("A") })
            t.act("opp", { type: "combineBrave", braveInstanceId: t.id("Y"), hostInstanceId: t.id("B") })
            t.state.turnPlayer = t.me
            t.state.priorityPlayer = t.me
            t.state.phase = "attack"
            attack(t)
        },
        // 合体の準備による変化（ブレイヴのコアとBPがホストへ移る）も含む
        expect: [...base(BRAVE1), "相手.A.BP: 3000 → 5000", "相手.A.コア: 1 → 2", "相手.B.BP: 1000 → 4000", "相手.B.コア: 1 → 2", "相手.X.BP: 2000 → なし", "相手.X.コア: 1 → 0", "相手.Y.BP: 3000 → なし", "相手.Y.コア: 1 → 0", "相手.A.疲労: false → true", "相手.B.疲労: false → true", "相手.X.場所: フィールド → 合体", "相手.Y.場所: フィールド → 合体"],
    })
}

console.log("すべてのチェックに合格しました 🎉（part1020）")
