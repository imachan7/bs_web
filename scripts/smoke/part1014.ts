// smoke パート1014（#631 GX：コアの光主・紫乃宮まゐ・バトスピ大好き声優・バースト系。docs/design/IMPORT_631_PLAN.md §3・§0）
// 期待値役：効果文だけから書いた。staging のカードは data に入るまで節ごと（未実装）で飛ばす
import { born, check, fix, magicOut, nm, nmOf, resolveAll, summonOut, VAN } from "./lib631"
import { assert } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const GX06 = "GX06" // サンシャインレイ（黄マジック・コスト5）「コアの光主」しか使用できない
const GX10 = "GX10" // パープルリフレイン（紫マジック・コスト2）「紫乃宮まゐ」
const GX12_02 = "GX12-02" // 青嵐帝 阪口（青スピリット・コスト7）「バトスピ大好き声優」
const GX12_03 = "GX12-03" // 遠藤ビャク・ガロ子ちゃん（緑スピリット・コスト6）
const GX22 = "GX22" // 獣皇咆哮激（赤マジック・コスト4）「棚志テガマル」
const GX23 = "GX23" // 運命神焔武（赤マジック・コスト5）「薬師寺アラタ」
const GX25 = "GX25" // ボンバースト（紫マジック・コスト2）「ボンバー」と認められたカードバトラー
const GX26 = "GX26" // ギャラクシーバースト（青マジック・コスト7）「ギャラクシー」と認められたカードバトラー
const TENREI1 = "BS10-048" // 天使パワー（黄・コスト5・天霊・Lv1 BP3000・バニラ）
const TENREI2 = "BS23-040" // 人形遣いの天使マリエル（黄・コスト3・天霊・Lv1 BP3000・バニラ）
const TODOL = "BS17-030" // トドール（白・コスト3・機獣・Lv1 BP1000／Lv2(コア3) 6000・バニラ）
const BRAVE1 = "BS21-063" // ぐるみパンダ（黄ブレイヴ・コスト4・Lv1 BP2000）
const BRAVE2 = "BS21-061" // 衛星機パイオニア・V（白ブレイヴ・コスト3・Lv1 BP3000）
const COFFIN = "BS01-131" // ダークコフィン（紫マジック・コスト7・メイン：疲労状態のスピリット1体を破壊）
const LOST = "BS01-118" // コールオブロスト（赤マジック・コスト4）

console.log("=== 前提: カードの機械確認 ===")
fix(TENREI1, "天使パワー", "spirit", 5)
fix(TENREI2, "人形遣いの天使マリエル", "spirit", 3)
fix(TODOL, "トドール", "spirit", 3)
fix(BRAVE1, "ぐるみパンダ", "brave", 4)
fix(BRAVE2, "衛星機パイオニア・V", "brave", 3)
fix(COFFIN, "ダークコフィン", "magic", 7)
fix(LOST, "コールオブロスト", "magic", 4)
const ok06 = check(GX06, "サンシャインレイ", "magic", 5)
const ok10 = check(GX10, "パープルリフレイン", "magic", 2)
const ok1202 = check(GX12_02, "青嵐帝 阪口", "spirit", 7)
const ok1203 = check(GX12_03, "遠藤ビャク・ガロ子ちゃん", "spirit", 6)
const ok22 = check(GX22, "獣皇咆哮激", "magic", 4)
const ok23 = check(GX23, "運命神焔武", "magic", 5)
const ok25 = check(GX25, "ボンバースト", "magic", 2)
const ok26 = check(GX26, "ギャラクシーバースト", "magic", 7)

const castMain = (t: ScenarioCtx): void => t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
const castFlash = (t: ScenarioCtx, target?: string): void =>
    t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", ...(target ? { targetInstanceId: t.id(target) } : {}) })
const REJECT = { type: "castMagic", handIndex: 0, timing: "main" } as const

// ==== GX06 サンシャインレイ ====
if (ok06) {
    console.log("=== GX06 メイン：上から5枚から系統「天霊」のスピリットすべてを無償召喚できる。残りは好きな順番でデッキの上へ ===")
    const mainBoard = (names: { me: string; opp: string }, deck: string[]) => ({
        names, interactive: true,
        me: { hand: [GX06], deck },
    })
    const dn = nmOf(GX06)
    scenario({
        name: "GX06-コアの光主（空白は無視）が使うと、上5枚の天霊のスピリットすべてを無償召喚し、残りはデッキの上へ戻る",
        start: mainBoard({ me: "馬神 弾", opp: "ユウキ" }, [TENREI1, VAN, TENREI2, VAN, VAN]),
        steps(t) {
            castMain(t)
            resolveAll(t)
        },
        // 魔法のコスト5＋無償召喚でも置くLv1のコア1個ずつ（2体で2個）をリザーブから
        expect: [...magicOut("自分", dn, 5).filter((l) => !l.startsWith("自分.リザーブ")), "自分.リザーブ: 10 → 3", "自分.デッキ枚数: 5 → 3", ...born("自分", "天使パワー", 3000), ...born("自分", "人形遣いの天使マリエル", 3000)],
    })
    scenario({
        name: "GX06-上5枚に天霊のスピリットがいないと、誰も召喚されず残りは全部デッキの上へ戻る",
        start: mainBoard({ me: "馬神弾", opp: "ユウキ" }, [VAN, VAN, VAN, VAN, VAN]),
        steps(t) {
            castMain(t)
            resolveAll(t)
        },
        expect: magicOut("自分", dn, 5),
    })
    scenario({
        name: "GX06-召喚できるを断ると、誰も召喚されない",
        start: mainBoard({ me: "馬神ダン", opp: "ユウキ" }, [TENREI1, VAN, TENREI2, VAN, VAN]),
        steps(t) {
            castMain(t)
            resolveAll(t, [], false)
        },
        expect: magicOut("自分", dn, 5),
    })
    scenario({
        name: "GX06-コアの光主でないプレイヤーは使用できない",
        start: { me: { hand: [GX06] } },
        steps: (t) => t.actRejected("me", REJECT),
        expect: [],
    })
    console.log("=== GX06 フラッシュ：このターンの間、自分のスピリット1体をBP+5000 ===")
    scenario({
        name: "GX06-フラッシュで自分のスピリット1体がBP+5000される",
        start: { names: { me: "硯秀斗", opp: "ユウキ" }, me: { hand: [GX06], spirits: [{ card: TODOL, label: "A" }] } },
        steps: (t) => castFlash(t, "A"),
        expect: [...magicOut("自分", dn, 5), "自分.A.BP: 1000 → 6000"],
    })
    scenario({
        name: "GX06-フラッシュは相手のスピリットを対象にできない",
        start: { names: { me: "硯秀斗", opp: "ユウキ" }, me: { hand: [GX06], spirits: [{ card: TODOL, label: "A" }] }, opp: { spirits: [{ card: VAN, label: "U" }] } },
        steps: (t) => t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("U") }),
        expect: [],
    })
}

// ==== GX10 パープルリフレイン ====
if (ok10) {
    console.log("=== GX10 メイン：自分のトラッシュにあるブレイヴカードすべてを無償召喚できる。フラッシュ：自分のスピリット1体BP+5000 ===")
    const dn = nmOf(GX10)
    const board = {
        names: { me: "紫乃宮まゐ", opp: "ユウキ" }, interactive: true,
        me: { hand: [GX10], trash: [BRAVE1, BRAVE2, VAN] },
    }
    scenario({
        name: "GX10-トラッシュのブレイヴすべてを無償召喚する（合体先になれるスピリットがいなければスピリット状態で出る。スピリットは残る）",
        start: board,
        steps(t) {
            castMain(t)
            resolveAll(t)
        },
        expect: [
            "自分.手札: パープルリフレイン → なし", `自分.トラッシュ: ${nmOf(BRAVE1, BRAVE2, VAN)} → ${nm(dn, "ロクケラトプス")}`,
            "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 2", ...born("自分", "ぐるみパンダ", 2000), ...born("自分", "衛星機パイオニア・V", 3000),
        ],
    })
    // BRAVE.md §12.6（2026-08-25）：効果で「コストを支払わずに召喚できる」ブレイヴも合体先を選べる。合体した後の盤面は書いていない
    scenario({
        name: "GX10-合体条件（コスト4以上）を満たすスピリットがいると合体先の選択が出て、選ばなければスピリット状態で出る",
        start: { names: { me: "紫乃宮まゐ", opp: "ユウキ" }, interactive: true, me: { hand: [GX10], trash: [BRAVE1], spirits: [{ card: "BS16-053", label: "H" }] } },
        steps(t) {
            castMain(t)
            const pc = t.state.pendingChoice
            if (pc?.kind === "option") t.act("me", { type: "resolveChoice", option: pc.options!.find((o) => !o.includes("しない") && !o.includes("いいえ")) ?? pc.options![0]! })
            assert(t.state.pendingChoice !== null, "合体先の選択が出る")
            resolveAll(t, [], false)
        },
        expect: [...magicOut("自分", dn, 2).filter((l) => !l.startsWith("自分.トラッシュ:") && !l.startsWith("自分.リザーブ")), `自分.トラッシュ: ぐるみパンダ → ${dn}`, "自分.リザーブ: 10 → 7", ...born("自分", "ぐるみパンダ", 2000)],
    })
    scenario({
        name: "GX10-召喚できるを断ると、ブレイヴはトラッシュに残る",
        start: board,
        steps(t) {
            castMain(t)
            resolveAll(t, [], false)
        },
        expect: [...magicOut("自分", dn, 2).filter((l) => !l.startsWith("自分.トラッシュ:")), `自分.トラッシュ: ${nmOf(BRAVE1, BRAVE2, VAN)} → ${nm(dn, "ぐるみパンダ", "衛星機パイオニア・V", "ロクケラトプス")}`],
    })
    scenario({
        name: "GX10-紫乃宮まゐ以外は使用できない",
        start: { names: { me: "馬神弾", opp: "ユウキ" }, me: { hand: [GX10], trash: [BRAVE1] } },
        steps: (t) => t.actRejected("me", REJECT),
        expect: [],
    })
    scenario({
        name: "GX10-フラッシュで自分のスピリット1体がBP+5000される",
        start: { names: { me: "紫乃宮まゐ", opp: "ユウキ" }, me: { hand: [GX10], spirits: [{ card: TODOL, label: "A" }] } },
        steps: (t) => castFlash(t, "A"),
        expect: [...magicOut("自分", dn, 2), "自分.A.BP: 1000 → 6000"],
    })
}

// ==== GX12-02 青嵐帝 阪口 ====
if (ok1202) {
    console.log("=== GX12-02 バトスピ大好き声優しか使えない ===")
    scenario({
        name: "GX12-02-阪口大助が召喚できる",
        start: { names: { me: "阪口大助", opp: "ユウキ" }, me: { hand: [GX12_02] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: summonOut("自分", "青嵐帝 阪口", 7, 4000),
    })
    scenario({
        name: "GX12-02-バトスピ大好き声優でないプレイヤーは召喚できない",
        start: { me: { hand: [GX12_02] } },
        steps: (t) => t.actRejected("me", { type: "summon", handIndex: 0 }),
        expect: [],
    })
    console.log("=== GX12-02 アタック時：上から3枚オープンできる。天霊のスピリットすべてを手札に。残りは好きな順番で上へ ===")
    const atk = (deck: string[], cores = 1, extra: { card: string; label: string }[] = []) => ({
        phase: "attack" as const, interactive: true,
        names: { me: "阪口大助", opp: "ユウキ" },
        me: { deck, spirits: [{ card: GX12_02, label: "S", cores }, ...extra] },
    })
    scenario({
        name: "GX12-02-Lv1のアタック時、上3枚の天霊のスピリットすべてが手札に加わる",
        start: atk([TENREI1, VAN, TENREI2]),
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("S") })
            resolveAll(t)
        },
        expect: ["自分.S.疲労: false → true", `自分.手札: なし → ${nmOf(TENREI1, TENREI2)}`, "自分.デッキ枚数: 3 → 1"],
    })
    scenario({
        name: "GX12-02-オープンできるを断ると、手札に加わらない",
        start: atk([TENREI1, VAN, TENREI2]),
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("S") })
            resolveAll(t, [], false)
        },
        expect: ["自分.S.疲労: false → true"],
    })
    scenario({
        name: "GX12-02-Lv2のアタック時、系統天霊のスピリット1体につき相手のデッキを5枚破棄する（2体で10枚）",
        start: { ...atk([VAN, VAN, VAN, VAN, VAN, VAN], 4, [{ card: TENREI1, label: "T1" }, { card: TENREI2, label: "T2" }]), opp: { deck: Array.from({ length: 40 }, () => VAN) } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("S") })
            resolveAll(t)
        },
        expect: ["自分.S.疲労: false → true", "相手.デッキ枚数: 40 → 30", "相手.トラッシュ: なし → ロクケラトプス"],
    })
    scenario({
        name: "GX12-02-Lv2でも天霊のスピリットがいなければ破棄しない",
        start: { ...atk([VAN, VAN, VAN, VAN, VAN, VAN], 4), opp: { deck: Array.from({ length: 40 }, () => VAN) } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("S") })
            resolveAll(t)
        },
        expect: ["自分.S.疲労: false → true"],
    })
    scenario({
        name: "GX12-02-Lv1では天霊のスピリットがいても相手のデッキは破棄しない（Lv2・Lv3の効果）",
        start: { ...atk([VAN, VAN, VAN, VAN, VAN, VAN], 1, [{ card: TENREI1, label: "T1" }]), opp: { deck: Array.from({ length: 40 }, () => VAN) } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("S") })
            resolveAll(t)
        },
        expect: ["自分.S.疲労: false → true"],
    })
}

// ==== GX12-03 遠藤ビャク・ガロ子ちゃん（破壊時のみ。バトル時の身代わりは実装しない） ====
if (ok1203) {
    console.log("=== GX12-03 Lv3 破壊時：相手は負けたことになる ===")
    const dest = (cores: number) => ({
        turn: "opp" as const, phase: "main" as const,
        me: { spirits: [{ card: GX12_03, label: "E", cores, rested: true }] },
        opp: { hand: [COFFIN] },
    })
    const coffin = (t: ScenarioCtx): void => t.act("opp", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: t.id("E") })
    scenario({
        name: "GX12-03-Lv3で破壊されると、破壊した側のプレイヤーが負ける",
        start: dest(10),
        steps: coffin,
        expect: [
            ...magicOut("相手", "ダークコフィン", 7), "自分.E.場所: フィールド → なし", "自分.トラッシュ: なし → 遠藤ビャク・ガロ子ちゃん", "自分.リザーブ: 10 → 20", "勝者: なし → 相手",
        ],
    })
    scenario({
        name: "GX12-03-Lv2で破壊されても負けにならない",
        start: dest(3),
        steps: coffin,
        expect: [...magicOut("相手", "ダークコフィン", 7), "自分.E.場所: フィールド → なし", "自分.トラッシュ: なし → 遠藤ビャク・ガロ子ちゃん", "自分.リザーブ: 10 → 13"],
    })
}

// ==== GX22 獣皇咆哮激 ====
if (ok22) {
    console.log("=== GX22 バースト（相手のスピリットのアタック後）：自分のスピリットすべてを回復、このターン最高Lvとして扱う。その後コストを支払ってフラッシュ ===")
    const opp = { spirits: [{ card: VAN, label: "O" }] }
    const board = {
        names: { me: "棚志テガマル", opp: "ユウキ" }, turn: "opp" as const, phase: "attack" as const, interactive: true,
        me: { burst: GX22, spirits: [{ card: TODOL, label: "A", rested: true }, { card: TODOL, label: "B", cores: 3, rested: true }] },
        opp,
    }
    const base = ["相手.O.疲労: false → true", "自分.バースト: 獣皇咆哮激 → なし", "自分.トラッシュ: なし → 獣皇咆哮激", "自分.A.疲労: true → false", "自分.B.疲労: true → false", "自分.A.Lv: 1 → 2", "自分.A.BP: 1000 → 6000"]
    scenario({
        name: "GX22-相手のスピリットのアタック後に、自分のスピリットすべてが回復し最高Lvになる（支払わない）",
        start: board,
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            resolveAll(t, [], false)
        },
        expect: base,
    })
    scenario({
        name: "GX22-その後コストを支払うと、フラッシュ効果で自分のスピリット1体がBP+4000される",
        start: board,
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("O") })
            resolveAll(t, ["A"])
        },
        expect: [...base.filter((l) => l !== "自分.A.BP: 1000 → 6000"), "自分.A.BP: 1000 → 10000", "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4"],
    })
    scenario({
        name: "GX22-自分のスピリットのアタックではバーストは発動しない",
        start: { ...board, turn: "me" as const, me: { burst: GX22, spirits: [{ card: TODOL, label: "A" }] }, opp: { spirits: [] } },
        steps: (t) => t.act("me", { type: "attack", instanceId: t.id("A") }),
        expect: ["自分.A.疲労: false → true"],
    })
    scenario({
        name: "GX22-棚志テガマル以外はバーストをセットできない",
        start: { me: { hand: [GX22] } },
        steps: (t) => t.actRejected("me", { type: "setBurst", handIndex: 0 }),
        expect: [],
    })
}

// ==== GX23 運命神焔武 ====
if (ok23) {
    console.log("=== GX23 バースト（ライフ減少後）：上から5枚オープンできる。スピリット1枚を召喚。残りはすべて手札へ。その後コストを支払ってフラッシュ ===")
    const board = (deck: string[]) => ({
        names: { me: "薬師寺アラタ", opp: "ユウキ" }, turn: "opp" as const, phase: "attack" as const, interactive: true,
        me: { burst: GX23, deck },
        opp: { spirits: [{ card: VAN, label: "O" }] },
    })
    const run = (t: ScenarioCtx): void => {
        t.act("opp", { type: "attack", instanceId: t.id("O") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        resolveAll(t, [], false)
    }
    const common = ["相手.O.疲労: false → true", "自分.ライフ: 5 → 4", "自分.バースト: 運命神焔武 → なし", "自分.トラッシュ: なし → 運命神焔武", "自分.デッキ枚数: 5 → 0"]
    scenario({
        name: "GX23-上5枚からスピリット1枚を召喚（召喚コストを支払う）し、残りは手札に加わる",
        start: board([VAN, VAN, VAN, VAN, VAN]),
        steps: run,
        expect: [...common, "自分.手札: なし → " + nm(...Array(4).fill("ロクケラトプス")), "自分.リザーブ: 10 → 9", "自分.トラッシュのコア: 0 → 1", ...born("自分", "ロクケラトプス", 1000)],
    })
    scenario({
        name: "GX23-上5枚にスピリットがいなければ召喚されず、5枚とも手札に加わる",
        start: board([LOST, LOST, LOST, LOST, LOST]),
        steps: run,
        expect: [...common, "自分.手札: なし → " + nm(...Array(5).fill("コールオブロスト")), "自分.リザーブ: 10 → 11"],
    })
    scenario({
        name: "GX23-薬師寺アラタ以外はバーストをセットできない",
        start: { me: { hand: [GX23] } },
        steps: (t) => t.actRejected("me", { type: "setBurst", handIndex: 0 }),
        expect: [],
    })
}

// ==== GX25 ボンバースト（フラッシュのみ。バーストの「オナラをした後」は実装しない） ====
if (ok25) {
    console.log("=== GX25 フラッシュ：自分のスピリットのコア1個を自分のトラッシュに置く ===")
    scenario({
        name: "GX25-ボンバーが使うと、自分のスピリットのコア1個がトラッシュに置かれる",
        start: { names: { me: "暗黒戦士ボンバー", opp: "ユウキ" }, me: { hand: [GX25], spirits: [{ card: TODOL, label: "A", cores: 3 }] } },
        steps: (t) => castFlash(t),
        expect: [...magicOut("自分", "ボンバースト", 2), "自分.A.コア: 3 → 2", "自分.A.Lv: 2 → 1", "自分.A.BP: 6000 → 1000", "自分.トラッシュのコア: 0 → 3"],
    })
    scenario({
        name: "GX25-ボンバー以外は使用できない",
        start: { me: { hand: [GX25], spirits: [{ card: TODOL, label: "A", cores: 3 }] } },
        steps: (t) => t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash" }),
        expect: [],
    })
}

// ==== GX26 ギャラクシーバースト ====
if (ok26) {
    console.log("=== GX26 バースト（ライフ減少後）：デッキから7枚ドロー。その後コストを支払ってフラッシュ：相手のデッキを上から7枚破棄 ===")
    const board = {
        names: { me: "ギャラクシー渡辺", opp: "ユウキ" }, turn: "opp" as const, phase: "attack" as const, interactive: true,
        me: { burst: GX26 },
        opp: { spirits: [{ card: VAN, label: "O" }] },
    }
    const run = (accept: boolean) => (t: ScenarioCtx): void => {
        t.act("opp", { type: "attack", instanceId: t.id("O") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        resolveAll(t, [], accept)
    }
    const common = ["相手.O.疲労: false → true", "自分.ライフ: 5 → 4", "自分.バースト: ギャラクシーバースト → なし", "自分.トラッシュ: なし → ギャラクシーバースト", "自分.手札: なし → " + nm(...Array(7).fill("ロクケラトプス")), "自分.デッキ枚数: 40 → 33"]
    scenario({
        name: "GX26-バーストで7枚ドローし、コストを支払わなければフラッシュ効果は発揮しない",
        start: board,
        steps: run(false),
        expect: [...common, "自分.リザーブ: 10 → 11"],
    })
    scenario({
        name: "GX26-その後コストを支払うと、相手のデッキを上から7枚破棄する",
        start: board,
        steps: run(true),
        expect: [...common, "自分.リザーブ: 10 → 4", "自分.トラッシュのコア: 0 → 7", "相手.デッキ枚数: 40 → 33", "相手.トラッシュ: なし → ロクケラトプス"],
    })
    scenario({
        name: "GX26-ギャラクシー以外はバーストをセットできない",
        start: { me: { hand: [GX26] } },
        steps: (t) => t.actRejected("me", { type: "setBurst", handIndex: 0 }),
        expect: [],
    })
}

console.log("すべてのチェックに合格しました 🎉（part1014）")
