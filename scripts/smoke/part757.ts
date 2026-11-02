// smoke パート757（STARTER blue 8枚：SD16-002／SD16-003／SD16-004／SD16-005／SD16-006／SD16-007／SD16-008／SD16-X01）
// 期待値役が効果文と属性だけから書いた実装前テスト（docs/design/STARTER_PLAN.md §2・BS19_PLAN §2【強化】・SEMANTICS_AUDIT §3）。
// effects はまだ空なので、効果が絡む場面は落ちてよい。例外で止まらず最後まで走ること。
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

// ---------- 対象8枚 ----------
const ROGER = "SD16-002" // 豪拳のロジャー（青スピリット・闘神・コスト2）
const LANCE = "SD16-003" // 重槍巨人ランス（青スピリット・闘神・コスト3）
const GORDON = "SD16-004" // 戦鎚のゴードン（青スピリット・闘神・コスト4）
const BARNHARD = "SD16-005" // 双首竜使いのバーンハード（青スピリット・闘神/海首・コスト5）
const CLOVIS = "SD16-006" // 魔剣使いのクローヴィス（青スピリット・剣使/闘神・コスト5）
const LOADER = "SD16-007" // ローダー・アームズ（青ブレイヴ・造兵・コスト4・合体条件：闘神）
const CITADEL = "SD16-008" // 鉄壁なる巨人城塞（青ネクサス・コスト3）
const ALEX = "SD16-X01" // 巨人帝王アレクサンダー13世（青スピリット・闘神・コスト7）

// ---------- 脇役（既存の弾から。機械確認で名前・色・系統を確かめる） ----------
const VANILLA = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・バニラ）
const JEFFERY = "BS03-072" // 槍兵のジェフリー（青・闘神・コスト1・BP2000・バニラ）
const METAL = "BS01-008" // メタルバーン（赤・機竜・コスト3・BP3000・バニラ）
const GOLEM = "BS11-044" // シェル・ゴレム（青・造兵・コスト4・BP4000・バニラ）
const DUALDO = "BS10-007" // デュアルド（赤・古竜/異合・コスト5・BP5000・バニラ）
const MITHRIL = "BS05-052" // ミスリル・ゴレム（青・造兵・コスト6・BP5000・バニラ）
const CLAM = "BS19-058" // クラーメン（青・異合・コスト2・BP2000・バニラ）
const SAIL = "BS12-071" // 未完成の古代戦艦：帆（青ネクサス・コスト3・シンボル青）
const CAVERN = "BS02-080" // エメラルドに輝く鍾乳洞（緑ネクサス・コスト3）
const JAVELIN = "BS06-091" // バスタージャベリン（赤マジック・コスト3・メイン：ネクサス1つを破壊する）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    assert(c(ROGER).name === "豪拳のロジャー" && c(ROGER).type === "spirit" && c(ROGER).colors.join() === "blue" && c(ROGER).family.join() === "闘神" && c(ROGER).cost === 2 && c(ROGER).effect.includes("【強化】") && c(ROGER).effect.includes("コスト4以下の相手のスピリット1体を破壊する"), "ROGERは青闘神コスト2・強化＋Lv2破壊時")
    assert(c(LANCE).name === "重槍巨人ランス" && c(LANCE).type === "spirit" && c(LANCE).colors.join() === "blue" && c(LANCE).family.join() === "闘神" && c(LANCE).cost === 3 && c(LANCE).effect.includes("【強化】") && c(LANCE).effect.includes("破壊されない"), "LANCEは青闘神コスト3・強化＋Lv2ネクサス耐性")
    assert(c(GORDON).name === "戦鎚のゴードン" && c(GORDON).type === "spirit" && c(GORDON).colors.join() === "blue" && c(GORDON).family.join() === "闘神" && c(GORDON).cost === 4 && c(GORDON).effect.includes("【粉砕】") && c(GORDON).effect.includes("置かなければアタックできない"), "GORDONは青闘神コスト4・粉砕＋Lv2通行料")
    assert(c(BARNHARD).name === "双首竜使いのバーンハード" && c(BARNHARD).type === "spirit" && c(BARNHARD).colors.join() === "blue" && c(BARNHARD).family.join() === "闘神,海首" && c(BARNHARD).cost === 5 && c(BARNHARD).effect.includes("コスト3以下の相手のスピリット2体を破壊する"), "BARNHARDは青闘神/海首コスト5・召喚時2体破壊")
    assert(c(CLOVIS).name === "魔剣使いのクローヴィス" && c(CLOVIS).type === "spirit" && c(CLOVIS).colors.join() === "blue" && c(CLOVIS).family.join() === "剣使,闘神" && c(CLOVIS).cost === 5 && c(CLOVIS).effect.includes("相手のネクサス1つを破壊することで") && c(CLOVIS).effect.includes("コスト4以下の相手のスピリットはアタックできない"), "CLOVISは青剣使/闘神コスト5・召喚時ネクサス破壊＋合体時アタック封じ")
    assert(c(LOADER).name === "ローダー・アームズ" && c(LOADER).type === "brave" && c(LOADER).colors.join() === "blue" && c(LOADER).family.join() === "造兵" && c(LOADER).cost === 4 && c(LOADER).effect.includes("ボイドからコア1個を自分のネクサスに置く") && c(LOADER).effect.includes("合体条件：闘神") && c(LOADER).effect.includes("コスト3以下の相手のスピリット1体を破壊する"), "LOADERは青造兵ブレイヴコスト4・合体条件闘神")
    assert(c(CITADEL).name === "鉄壁なる巨人城塞" && c(CITADEL).type === "nexus" && c(CITADEL).colors.join() === "blue" && c(CITADEL).cost === 3 && c(CITADEL).effect.includes("疲労状態でフィールドに残す") && c(CITADEL).effect.includes("【粉砕】"), "CITADELは青ネクサスコスト3・破壊された青ネクサスを残す＋Lv2粉砕付与")
    assert(c(ALEX).name === "巨人帝王アレクサンダー13世" && c(ALEX).type === "spirit" && c(ALEX).colors.join() === "blue" && c(ALEX).family.join() === "闘神" && c(ALEX).cost === 7 && c(ALEX).effect.includes("コスト5以下の相手のスピリット1体を破壊する") && c(ALEX).effect.includes("5枚破棄する") && c(ALEX).effect.includes("このスピリットは回復する"), "ALEXは青闘神コスト7・召喚時破壊＋アタック時破棄＋回復")
    assert(c(VANILLA).name === "ロクケラトプス" && c(VANILLA).colors.join() === "red" && c(VANILLA).family.join() === "地竜" && c(VANILLA).cost === 1 && c(VANILLA).effect === "", "VANILLAは赤地竜コスト1バニラ")
    assert(c(JEFFERY).name === "槍兵のジェフリー" && c(JEFFERY).colors.join() === "blue" && c(JEFFERY).family.join() === "闘神" && c(JEFFERY).cost === 1 && c(JEFFERY).effect === "" && c(JEFFERY).levels?.[0]?.bp === 2000, "JEFFERYは青闘神コスト1バニラ・BP2000")
    assert(c(METAL).name === "メタルバーン" && c(METAL).colors.join() === "red" && c(METAL).family.join() === "機竜" && c(METAL).cost === 3 && c(METAL).effect === "" && c(METAL).levels?.[0]?.bp === 3000, "METALは赤機竜コスト3バニラ・BP3000")
    assert(c(GOLEM).name === "シェル・ゴレム" && c(GOLEM).colors.join() === "blue" && c(GOLEM).family.join() === "造兵" && c(GOLEM).cost === 4 && c(GOLEM).effect === "" && c(GOLEM).levels?.[0]?.bp === 4000, "GOLEMは青造兵コスト4バニラ・BP4000")
    assert(c(DUALDO).name === "デュアルド" && c(DUALDO).colors.join() === "red" && c(DUALDO).family.join() === "古竜,異合" && c(DUALDO).cost === 5 && c(DUALDO).effect === "" && c(DUALDO).levels?.[0]?.bp === 5000, "DUALDOは赤古竜/異合コスト5バニラ・BP5000")
    assert(c(MITHRIL).name === "ミスリル・ゴレム" && c(MITHRIL).colors.join() === "blue" && c(MITHRIL).family.join() === "造兵" && c(MITHRIL).cost === 6 && c(MITHRIL).effect === "" && c(MITHRIL).levels?.[0]?.bp === 5000, "MITHRILは青造兵コスト6バニラ・BP5000")
    assert(c(CLAM).name === "クラーメン" && c(CLAM).colors.join() === "blue" && c(CLAM).family.join() === "異合" && c(CLAM).cost === 2 && c(CLAM).effect === "" && c(CLAM).levels?.[0]?.bp === 2000, "CLAMは青異合コスト2バニラ・BP2000")
    assert(c(SAIL).name === "未完成の古代戦艦：帆" && c(SAIL).type === "nexus" && c(SAIL).colors.join() === "blue" && c(SAIL).cost === 3 && c(SAIL).symbol?.join() === "blue", "SAILは青ネクサスコスト3・シンボル青")
    assert(c(CAVERN).name === "エメラルドに輝く鍾乳洞" && c(CAVERN).type === "nexus" && c(CAVERN).colors.join() === "green" && c(CAVERN).cost === 3, "CAVERNは緑ネクサスコスト3")
    assert(c(JAVELIN).name === "バスタージャベリン" && c(JAVELIN).type === "magic" && c(JAVELIN).colors.join() === "red" && c(JAVELIN).cost === 3 && c(JAVELIN).effect.includes("メイン：") && c(JAVELIN).effect.includes("ネクサス1つを破壊する"), "JAVELINは赤マジックコスト3・メインでネクサス1つ破壊")
}

// 対話の選択待ちを最後まで答える。target は targetLabel の個体を、option は optionKeys を含む選択肢を優先する
function answer(t: ScenarioCtx, targetLabel: string, optionKeys: string[]): void {
    for (let i = 0; i < 20 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "target") {
            const hit = pc.candidates.includes(t.id(targetLabel)) ? t.id(targetLabel) : pc.candidates[0]!
            t.act(side, { type: "resolveChoice", instanceId: hit })
        } else if (pc.kind === "option") {
            const opts = pc.options!
            const hit = opts.find((o) => optionKeys.some((k) => o.includes(k)))
            t.act(side, { type: "resolveChoice", option: hit ?? opts[0]! })
        } else t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices![0]! })
    }
}

// ============================================================
// SD16-002 豪拳のロジャー
// Lv1･Lv2【強化】アルティメット以外の自分の「相手へのデッキ破棄効果」の枚数を+1枚する。
// ============================================================

// 【強化】が働く場面：ロジャーがいるとき、ゴードン（Lv1）の【粉砕】はLv1ぶんの1枚に+1枚されて2枚破棄する
scenario({
    name: "roger-kyoka-funsai-mill2",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: ROGER, cores: 1 }, { card: GORDON, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("戦鎚のゴードン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.戦鎚のゴードン.疲労: false → true",
        "相手.デッキ枚数: 40 → 38", // 粉砕1枚＋強化1枚
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD16-002 Lv2『このスピリットの破壊時』コスト4以下の相手のスピリット1体を破壊する。
// ============================================================

// 起きる場面：Lv2のロジャーがバトルで破壊されると、コスト3のメタルバーンを破壊する
scenario({
    name: "roger-ondestroy-destroy-cost3",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: ROGER, label: "ロジャー", cores: 3 }] },
        opp: { spirits: [{ card: DUALDO, cores: 1 }, { card: METAL, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルド") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ロジャー") })
        t.closeFlash()
    },
    expect: [
        "自分.ロジャー.場所: フィールド → なし", // BP4000 vs 5000 で敗北
        "自分.トラッシュ: なし → 豪拳のロジャー",
        "自分.リザーブ: 10 → 13", // ロジャーのコア3個がリザーブへ
        "相手.メタルバーン.場所: フィールド → なし", // 破壊時：コスト4以下を破壊
        "相手.トラッシュ: なし → メタルバーン",
        "相手.リザーブ: 10 → 11", // メタルバーンのコア1個がリザーブへ
        "相手.デュアルド.疲労: false → true",
    ],
})

// 起きない場面：Lv1（条件を1つ外す）で破壊されても何も起きない
scenario({
    name: "roger-ondestroy-lv1-none",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: ROGER, label: "ロジャー", cores: 1 }] },
        opp: { spirits: [{ card: DUALDO, cores: 1 }, { card: METAL, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルド") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ロジャー") })
        t.closeFlash()
    },
    expect: [
        "自分.ロジャー.場所: フィールド → なし",
        "自分.トラッシュ: なし → 豪拳のロジャー",
        "自分.リザーブ: 10 → 11",
        "相手.デュアルド.疲労: false → true",
    ],
})

// ============================================================
// SD16-003 重槍巨人ランス
// Lv1･Lv2【強化】（ロジャーと同じ文）
// ============================================================

// 【強化】が働く場面：ランスがいるとき、ゴードン（Lv1）の【粉砕】は2枚破棄する
scenario({
    name: "lance-kyoka-funsai-mill2",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: LANCE, cores: 1 }, { card: GORDON, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("戦鎚のゴードン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.戦鎚のゴードン.疲労: false → true",
        "相手.デッキ枚数: 40 → 38",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD16-003 Lv2 自分の青のネクサスすべては、相手のスピリット/ブレイヴ/ネクサス/マジックの効果では破壊されない。
// ============================================================

// 起きる場面：Lv2のランスがいるとき、相手のマジックでは自分の青ネクサス（帆）を破壊できない
scenario({
    name: "lance-lv2-blue-nexus-protected",
    start: {
        turn: "opp", phase: "main",
        me: { spirits: [{ card: LANCE, cores: 2 }], nexuses: [{ card: SAIL, label: "帆", cores: 0 }] },
        opp: { hand: [JAVELIN] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "相手.手札: バスタージャベリン → なし",
        "相手.リザーブ: 10 → 7", // コスト3・赤シンボルなしで3支払い
        "相手.トラッシュのコア: 0 → 3",
        "相手.トラッシュ: なし → バスタージャベリン", // 使用したマジック
        // 帆は破壊されない。破壊していないので相手のドローもない
    ],
})

// 起きない場面：Lv1（条件を1つ外す）では帆が破壊され、相手は1枚ドローする
scenario({
    name: "lance-lv1-nexus-destroyed",
    start: {
        turn: "opp", phase: "main",
        me: { spirits: [{ card: LANCE, cores: 1 }], nexuses: [{ card: SAIL, label: "帆", cores: 0 }] },
        opp: { hand: [JAVELIN] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "相手.手札: バスタージャベリン → ロクケラトプス", // 破壊したときのドロー
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュのコア: 0 → 3",
        "相手.トラッシュ: なし → バスタージャベリン",
        "相手.デッキ枚数: 40 → 39",
        "自分.帆.場所: ネクサス → なし",
        "自分.トラッシュ: なし → 未完成の古代戦艦：帆",
    ],
})

// ============================================================
// SD16-004 戦鎚のゴードン
// Lv1･Lv2･Lv3【粉砕】『このスピリットのアタック時』相手のデッキを上から、このスピリットのLvと同じ枚数破棄する。
// ============================================================

// 【粉砕】が働く場面（強化持ちがいないので1枚だけ。ロジャー／ランスの場面との対比）
scenario({
    name: "gordon-funsai-mill1",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: GORDON, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("戦鎚のゴードン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.戦鎚のゴードン.疲労: false → true",
        "相手.デッキ枚数: 40 → 39", // Lv1と同じ1枚
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD16-004 Lv2･Lv3『相手のアタックステップ』コスト3以下の相手のスピリットがアタックするとき、
// 相手は、相手のリザーブのコア1個を相手のトラッシュに置かなければアタックできない。
// ============================================================

// 起きる場面：Lv2のゴードンがいるとき、コスト3のアタックに通行料（リザーブ→トラッシュ1個）が要る
scenario({
    name: "gordon-lv2-core-toll",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: GORDON, cores: 2 }] },
        opp: { spirits: [{ card: METAL, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.メタルバーン") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.メタルバーン.疲労: false → true",
        "相手.リザーブ: 10 → 9", // 通行料
        "相手.トラッシュのコア: 0 → 1",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})

// 起きない場面：Lv1（条件を1つ外す）では通行料がない
scenario({
    name: "gordon-lv1-no-toll",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: GORDON, cores: 1 }] },
        opp: { spirits: [{ card: METAL, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.メタルバーン") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.メタルバーン.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD16-005 双首竜使いのバーンハード
// Lv1･Lv2『このスピリットの召喚時』コスト3以下の相手のスピリット2体を破壊する。
// この効果で破壊したスピリット1体につき、相手のデッキを上から3枚破棄する。
// ============================================================

// 起きる場面：コスト3以下が2体いて、2体破壊して6枚破棄する
scenario({
    name: "barnhard-summon-destroy2-mill6",
    start: {
        turn: "me", phase: "main",
        me: { hand: [BARNHARD] },
        opp: { spirits: [{ card: CLAM, cores: 1 }, { card: METAL, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 双首竜使いのバーンハード → なし",
        "自分.リザーブ: 10 → 4", // コスト5の支払い＋維持コア1個（場に青シンボルなし）
        "自分.トラッシュのコア: 0 → 5",
        "自分.双首竜使いのバーンハード.場所: なし → フィールド",
        "自分.双首竜使いのバーンハード.コア: なし → 1",
        "自分.双首竜使いのバーンハード.Lv: なし → 1",
        "自分.双首竜使いのバーンハード.疲労: なし → false",
        "自分.双首竜使いのバーンハード.BP: なし → 4000",
        "相手.クラーメン.場所: フィールド → なし",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → クラーメン、メタルバーン、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "相手.デッキ枚数: 40 → 34", // 2体×3枚
        "相手.リザーブ: 10 → 12", // 破壊された2体のコア1個ずつがリザーブへ
    ],
})

// 起きない場面：相手がコスト4だけ（条件を1つ外す）なら破壊も破棄もない
scenario({
    name: "barnhard-summon-cost4-unaffected",
    start: {
        turn: "me", phase: "main",
        me: { hand: [BARNHARD] },
        opp: { spirits: [{ card: GOLEM, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 双首竜使いのバーンハード → なし",
        "自分.リザーブ: 10 → 4", // コスト5の支払い＋維持コア1個
        "自分.トラッシュのコア: 0 → 5",
        "自分.双首竜使いのバーンハード.場所: なし → フィールド",
        "自分.双首竜使いのバーンハード.コア: なし → 1",
        "自分.双首竜使いのバーンハード.Lv: なし → 1",
        "自分.双首竜使いのバーンハード.疲労: なし → false",
        "自分.双首竜使いのバーンハード.BP: なし → 4000",
    ],
})

// ============================================================
// SD16-006 魔剣使いのクローヴィス
// Lv1･Lv2『このスピリットの召喚時』相手のネクサス1つを破壊することで、相手のデッキを上から7枚破棄する。
// ============================================================

// 起きる場面：相手のネクサスを破壊して7枚破棄する
scenario({
    name: "clovis-summon-destroy-nexus-mill7",
    start: {
        turn: "me", phase: "main",
        me: { hand: [CLOVIS] },
        opp: { nexuses: [{ card: CAVERN, label: "鍾乳洞", cores: 0 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 魔剣使いのクローヴィス → なし",
        "自分.リザーブ: 10 → 4", // コスト5の支払い＋維持コア1個（場に青シンボルなし）
        "自分.トラッシュのコア: 0 → 5",
        "自分.魔剣使いのクローヴィス.場所: なし → フィールド",
        "自分.魔剣使いのクローヴィス.コア: なし → 1",
        "自分.魔剣使いのクローヴィス.Lv: なし → 1",
        "自分.魔剣使いのクローヴィス.疲労: なし → false",
        "自分.魔剣使いのクローヴィス.BP: なし → 4000",
        "相手.鍾乳洞.場所: ネクサス → なし",
        "相手.トラッシュ: なし → エメラルドに輝く鍾乳洞、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "相手.デッキ枚数: 40 → 33",
    ],
})

// 起きない場面：相手のネクサスがない（条件を1つ外す）と払えないので、破棄も何も起きない
scenario({
    name: "clovis-summon-no-nexus-none",
    start: {
        turn: "me", phase: "main",
        me: { hand: [CLOVIS] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 魔剣使いのクローヴィス → なし",
        "自分.リザーブ: 10 → 4", // コスト5の支払い＋維持コア1個
        "自分.トラッシュのコア: 0 → 5",
        "自分.魔剣使いのクローヴィス.場所: なし → フィールド",
        "自分.魔剣使いのクローヴィス.コア: なし → 1",
        "自分.魔剣使いのクローヴィス.Lv: なし → 1",
        "自分.魔剣使いのクローヴィス.疲労: なし → false",
        "自分.魔剣使いのクローヴィス.BP: なし → 4000",
    ],
})

// ============================================================
// SD16-006 【合体時】Lv2『相手のアタックステップ』コスト4以下の相手のスピリットはアタックできない。
// ============================================================

// 起きる場面：クローヴィス（闘神）にローダー・アームズを合体させると、コスト4のアタックが拒否され、コスト5は通る
scenario({
    name: "clovis-combined-cant-attack-cost4",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: CLOVIS, label: "クローヴィス", cores: 3 }], hand: [LOADER] },
        opp: { spirits: [{ card: GOLEM, cores: 1 }, { card: DUALDO, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("クローヴィス") })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.actRejected("opp", { type: "attack", instanceId: t.id("相手.シェル・ゴレム") })
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルド") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ローダー・アームズ → なし",
        "自分.リザーブ: 10 → 8", // コスト4・青シンボル1つで軽減1 → 3支払い（10→7）＋ライフ減少で+1（7→8）。差分は開始対終了の純計
        "自分.トラッシュのコア: 0 → 3",
        "自分.ローダー・アームズ.場所: なし → 合体",
        "自分.ローダー・アームズ.コア: なし → 0",
        "自分.ローダー・アームズ.Lv: なし → 1",
        "自分.ローダー・アームズ.疲労: なし → false",
        "自分.クローヴィス.BP: 7000 → 10000", // ホストLv2の7000＋ブレイヴの3000
        "相手.デッキ枚数: 40 → 39", // 相手のターン開始のドロー
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11", // ターン開始のコア+1
        "相手.デュアルド.疲労: false → true",
        "自分.ライフ: 5 → 4",
    ],
})

// 起きない場面：合体していなければ（条件を1つ外す）コスト4でもアタックできる
scenario({
    name: "clovis-uncombined-cost4-attacks",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: CLOVIS, cores: 3 }] },
        opp: { spirits: [{ card: GOLEM, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.シェル・ゴレム") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.シェル・ゴレム.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD16-007 ローダー・アームズ
// Lv1『このブレイヴの召喚時』ボイドからコア1個を自分のネクサスに置く。
// ============================================================

// 起きる場面：自分のネクサス（帆）があるとき、ボイドからコア1個を置く（ソウルコアはリザーブに残る）
scenario({
    name: "loader-summon-core-to-nexus",
    start: {
        turn: "me", phase: "main",
        me: {
            spirits: [{ card: JEFFERY, cores: 1 }],
            nexuses: [{ card: SAIL, label: "帆", cores: 0 }],
            hand: [LOADER],
            soulCore: "リザーブ",
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("槍兵のジェフリー") })
    },
    expect: [
        "自分.手札: ローダー・アームズ → なし",
        "自分.リザーブ: 10 → 8", // コスト4・青シンボル2つ（ジェフリー＋帆）で軽減2 → 2支払い
        "自分.トラッシュのコア: 0 → 2",
        "自分.帆.コア: 0 → 1", // ボイドからコア1個（ソウルコアは動かない）
        "自分.ローダー・アームズ.場所: なし → 合体",
        "自分.ローダー・アームズ.コア: なし → 0",
        "自分.ローダー・アームズ.Lv: なし → 1",
        "自分.ローダー・アームズ.疲労: なし → false",
        "自分.槍兵のジェフリー.BP: 2000 → 5000",
    ],
})

// 起きない場面：自分のネクサスがない（条件を1つ外す）とコアを置く先がない
scenario({
    name: "loader-summon-no-nexus-none",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: JEFFERY, cores: 1 }], hand: [LOADER] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("槍兵のジェフリー") })
    },
    expect: [
        "自分.手札: ローダー・アームズ → なし",
        "自分.リザーブ: 10 → 7", // 青シンボル1つで軽減1 → 3支払い
        "自分.トラッシュのコア: 0 → 3",
        "自分.ローダー・アームズ.場所: なし → 合体",
        "自分.ローダー・アームズ.コア: なし → 0",
        "自分.ローダー・アームズ.Lv: なし → 1",
        "自分.ローダー・アームズ.疲労: なし → false",
        "自分.槍兵のジェフリー.BP: 2000 → 5000",
    ],
})

// ============================================================
// SD16-007 【合体時】『このスピリットの合体アタック時』コスト3以下の相手のスピリット1体を破壊する。
// ============================================================

// 起きる場面：合体アタックでコスト3のメタルバーンを破壊する
scenario({
    name: "loader-combined-attack-destroy-cost3",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: JEFFERY, cores: 1 }], hand: [LOADER] },
        opp: { spirits: [{ card: METAL, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("槍兵のジェフリー") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("槍兵のジェフリー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ローダー・アームズ → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.ローダー・アームズ.場所: なし → 合体",
        "自分.ローダー・アームズ.コア: なし → 0",
        "自分.ローダー・アームズ.Lv: なし → 1",
        "自分.ローダー・アームズ.疲労: なし → false",
        "自分.槍兵のジェフリー.BP: 2000 → 5000",
        "自分.槍兵のジェフリー.疲労: false → true",
        "相手.メタルバーン.場所: フィールド → なし", // 合体アタック時：コスト3以下を破壊
        "相手.トラッシュ: なし → メタルバーン",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12", // メタルバーンのコア1個＋ライフのコア1個
    ],
})

// 起きない場面：相手がコスト4（条件を1つ外す）だと破壊されない
scenario({
    name: "loader-combined-attack-cost4-survives",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: JEFFERY, cores: 1 }], hand: [LOADER] },
        opp: { spirits: [{ card: GOLEM, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("槍兵のジェフリー") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("槍兵のジェフリー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ローダー・アームズ → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.ローダー・アームズ.場所: なし → 合体",
        "自分.ローダー・アームズ.コア: なし → 0",
        "自分.ローダー・アームズ.Lv: なし → 1",
        "自分.ローダー・アームズ.疲労: なし → false",
        "自分.槍兵のジェフリー.BP: 2000 → 5000",
        "自分.槍兵のジェフリー.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD16-008 鉄壁なる巨人城塞
// Lv1･Lv2 自分のネクサスが破壊されたとき、このネクサスを疲労させることで、
// 破壊された青のネクサス1つを疲労状態でフィールドに残す。
// ============================================================

// 起きる場面：相手のマジックで帆（青）が破壊されるとき、城塞を疲労させて帆を疲労状態で残す
scenario({
    name: "citadel-revive-blue-nexus",
    start: {
        turn: "opp", phase: "main", interactive: true,
        me: { nexuses: [{ card: CITADEL, label: "城塞", cores: 0 }, { card: SAIL, label: "帆", cores: 0 }] },
        opp: { hand: [JAVELIN] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
        answer(t, "帆", ["疲労", "残す", "はい"])
    },
    expect: [
        "相手.手札: バスタージャベリン → なし",
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュのコア: 0 → 3",
        "相手.トラッシュ: なし → バスタージャベリン",
        "自分.城塞.疲労: false → true", // コストとして疲労
        "自分.帆.疲労: false → true", // 疲労状態でフィールドに残る
        // 帆は破壊されていないので、相手のドローもない
    ],
})

// 起きない場面：破壊されたネクサスが青でない（条件を1つ外す）と残せない
scenario({
    name: "citadel-green-nexus-not-saved",
    start: {
        turn: "opp", phase: "main", interactive: true,
        me: { nexuses: [{ card: CITADEL, label: "城塞", cores: 0 }, { card: CAVERN, label: "鍾乳洞", cores: 0 }] },
        opp: { hand: [JAVELIN] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
        answer(t, "鍾乳洞", [])
    },
    expect: [
        "相手.手札: バスタージャベリン → ロクケラトプス", // 破壊したときのドロー
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュのコア: 0 → 3",
        "相手.トラッシュ: なし → バスタージャベリン",
        "相手.デッキ枚数: 40 → 39",
        "自分.鍾乳洞.場所: ネクサス → なし",
        "自分.トラッシュ: なし → エメラルドに輝く鍾乳洞",
        // 城塞は疲労しない（青のネクサスが破壊されていない）
    ],
})

// ============================================================
// SD16-008 Lv2 系統：「闘神」を持つ自分のスピリットすべてに【粉砕】を与える。
// ============================================================

// 起きる場面：Lv2の城塞がいるとき、粉砕を持たない闘神（ジェフリー）のアタックで1枚破棄する
scenario({
    name: "citadel-lv2-grant-funsai",
    start: {
        turn: "me", phase: "main",
        me: { nexuses: [{ card: CITADEL, cores: 1 }], spirits: [{ card: JEFFERY, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("槍兵のジェフリー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.槍兵のジェフリー.疲労: false → true",
        "相手.デッキ枚数: 40 → 39", // 与えられた粉砕：Lv1と同じ1枚
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きない場面：Lv1（条件を1つ外す）では粉砕が付かない
scenario({
    name: "citadel-lv1-no-funsai",
    start: {
        turn: "me", phase: "main",
        me: { nexuses: [{ card: CITADEL, cores: 0 }], spirits: [{ card: JEFFERY, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("槍兵のジェフリー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.槍兵のジェフリー.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD16-X01 巨人帝王アレクサンダー13世
// Lv1･Lv2･Lv3『このスピリットの召喚時』コスト5以下の相手のスピリット1体を破壊する。
// ============================================================

// 起きる場面：コスト5のデュアルドを破壊する
scenario({
    name: "alex-summon-destroy-cost5",
    start: {
        turn: "me", phase: "main",
        me: { hand: [ALEX] },
        opp: { spirits: [{ card: DUALDO, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 巨人帝王アレクサンダー13世 → なし",
        "自分.リザーブ: 10 → 2", // コスト7の支払い＋維持コア1個（場に青シンボルなし）
        "自分.トラッシュのコア: 0 → 7",
        "自分.巨人帝王アレクサンダー13世.場所: なし → フィールド",
        "自分.巨人帝王アレクサンダー13世.コア: なし → 1",
        "自分.巨人帝王アレクサンダー13世.Lv: なし → 1",
        "自分.巨人帝王アレクサンダー13世.疲労: なし → false",
        "自分.巨人帝王アレクサンダー13世.BP: なし → 6000",
        "相手.デュアルド.場所: フィールド → なし",
        "相手.トラッシュ: なし → デュアルド",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きない場面：相手がコスト6（条件を1つ外す）だと破壊されない
scenario({
    name: "alex-summon-cost6-survives",
    start: {
        turn: "me", phase: "main",
        me: { hand: [ALEX] },
        opp: { spirits: [{ card: MITHRIL, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 巨人帝王アレクサンダー13世 → なし",
        "自分.リザーブ: 10 → 2", // コスト7の支払い＋維持コア1個
        "自分.トラッシュのコア: 0 → 7",
        "自分.巨人帝王アレクサンダー13世.場所: なし → フィールド",
        "自分.巨人帝王アレクサンダー13世.コア: なし → 1",
        "自分.巨人帝王アレクサンダー13世.Lv: なし → 1",
        "自分.巨人帝王アレクサンダー13世.疲労: なし → false",
        "自分.巨人帝王アレクサンダー13世.BP: なし → 6000",
    ],
})

// ============================================================
// SD16-X01 Lv1･Lv2･Lv3『このスピリットのアタック時』相手のデッキを上から5枚破棄する。
// Lv2･Lv3『このスピリットのアタック時』ターンに1回、系統：「闘神」を持つ自分のスピリット1体を
// 疲労させることで、このスピリットは回復する。
// ============================================================

// 起きる場面：Lv2のアタックで5枚破棄し、闘神（ジェフリー）を疲労させて回復する
scenario({
    name: "alex-lv2-attack-mill5-recover",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: ALEX, label: "アレクサンダー", cores: 2 }, { card: JEFFERY, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アレクサンダー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.槍兵のジェフリー.疲労: false → true", // 回復のコスト
        // アレクサンダーはアタックで疲労するが回復するので、疲労の行は変化なし
        "相手.デッキ枚数: 40 → 35",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きない場面：Lv1（条件を1つ外す）では回復できず、破棄の5枚だけ起きる
scenario({
    name: "alex-lv1-attack-mill5-no-recover",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: ALEX, label: "アレクサンダー", cores: 1 }, { card: JEFFERY, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アレクサンダー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.アレクサンダー.疲労: false → true", // 回復しない
        "相手.デッキ枚数: 40 → 35",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part757）")
