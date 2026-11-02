// smoke パート747（STARTER-redA 8枚：BS20-074 EX004 SD03-002 SD03-003 SD03-004 SD03-006 SD03-010 SD03-011。
// docs/design/STARTER_PLAN.md §2・STARTER_SURVEY_redA.md §3・SEMANTICS_AUDIT §3）
// 期待値役が効果文とカードの属性だけから書いた場面テスト。この8枚の effects はまだ空なので、
// 効果が効くべき場面はいまは落ちてよい（例外で止まらず最後まで走ることだけを確認する）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

// ── 主役（STARTER-redA）──
const SHINING_FLAME = "BS20-074" // シャイニングフレイム（赤・マジック・コスト7・軽減[赤][赤][赤]。フラッシュ：BP10000以下の相手1体破壊）
const ALTER = "EX004" // 煌星龍ジークヴルム・アルター（赤・星竜/古竜・コスト6。【激突】＋Lv2-3 BP比べ勝利時同じ系統1体破壊）
const STEGO = "SD03-002" // 剣竜人ステゴラス（赤・竜人/地竜・コスト2。自分2体以下の間Lv3扱い）
const MORGE = "SD03-003" // モルゲザウルス（赤・地竜・コスト3。アタック時BP+2000）
const GARNAL = "SD03-004" // 角獣ガルナール（赤・皇獣・コスト4。アタック時上3枚オープン・星竜1枚回収）
const APOLLO = "SD03-006" // 太陽龍ジーク・アポロドラゴン（赤・神星/星竜・コスト6。回復状態指定アタック＋合体時Lv3 BP9000以下破壊）
const BALGUNNER = "SD03-010" // 砲竜バル・ガンナー（赤・地竜/星竜・ブレイヴ・コスト4。合体条件コスト4以上。合体時ドロー＋BP4000以下破壊）
const GIRAS = "SD03-011" // 鎧殻竜グラウン・ギラス（赤・星竜・ブレイヴ・コスト4。合体条件コスト3以上。召喚時/合体中に相手ネクサス破壊）

// ── 脇役（data/cards から選んだ）──
const ROKU = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・BP1000・バニラ）
const METABURN = "BS01-008" // メタルバーン（赤・機竜・コスト3・Lv1 BP3000・バニラ）
const WINGAL = "BS02-046" // ウィンガル（白・武装・コスト6・Lv1 BP5000・バニラ）
const RAYNEEDLE = "BS07-001" // レイニードル（赤・星竜・コスト1・Lv1 BP1000・バニラ）
const TORNADRA = "BS10-009" // トルネードラ（赤・星竜・コスト6・Lv2 BP9000・バニラ）
const PAKI = "BS11-005" // 頭竜人パキケファロン（赤・地竜/竜人・コスト4・Lv1 BP3000・バニラ）
const MATENRO = "BS12-063" // 旅団の摩天楼（紫・ネクサス・コスト3。配置時効果はこの場面では発動しない）
const VAJURANGA = "BS17-007" // ヴァジュランガ（赤・皇獣・コスト6・Lv2 BP10000・バニラ）
const JADVALJAR = "BS17-026" // ジャドバルジャー（緑・雄将/剣獣・コスト5・Lv3 BP12000。「効果の記述を持たないスピリットとして扱う」）
const GYOKURUNE = "BS10-077" // ギョクリューン（青・ブレイヴ・コスト4・合体条件コスト4以上・合体時BP+3000）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    const chk = (id: string, name: string, type: string, color: string, cost: number) =>
        assert(c(id).name === name && c(id).type === type && c(id).colors.join() === color && c(id).cost === cost, `${id}は${color}の${type}「${name}」コスト${cost}`)
    chk(SHINING_FLAME, "シャイニングフレイム", "magic", "red", 7)
    chk(ALTER, "煌星龍ジークヴルム・アルター", "spirit", "red", 6)
    chk(STEGO, "剣竜人ステゴラス", "spirit", "red", 2)
    chk(MORGE, "モルゲザウルス", "spirit", "red", 3)
    chk(GARNAL, "角獣ガルナール", "spirit", "red", 4)
    chk(APOLLO, "太陽龍ジーク・アポロドラゴン", "spirit", "red", 6)
    chk(BALGUNNER, "砲竜バル・ガンナー", "brave", "red", 4)
    chk(GIRAS, "鎧殻竜グラウン・ギラス", "brave", "red", 4)
    assert(c(SHINING_FLAME).effect.includes("フラッシュ") && c(SHINING_FLAME).effect.includes("BP10000以下"), "シャイニングフレイムはフラッシュでBP10000以下を破壊する")
    assert(c(ALTER).family.join() === "星竜,古竜" && c(ALTER).levels[1]!.bp === 6000, "アルターは星竜/古竜でLv2 BP6000")
    assert(c(STEGO).levels[2]!.bp === 5000 && c(STEGO).effect.includes("2体以下"), "ステゴラスはLv3 BP5000で、2体以下の間Lv3扱い")
    assert(c(MORGE).levels[1]!.bp === 3000 && c(MORGE).effect.includes("BP+2000"), "モルゲザウルスはLv2 BP3000でアタック時BP+2000")
    assert(c(GARNAL).effect.includes("3枚オープン") && c(GARNAL).effect.includes("星竜"), "ガルナールは3枚オープンして星竜を回収する")
    assert(c(APOLLO).levels[2]!.bp === 9000 && c(APOLLO).effect.includes("回復状態"), "アポロドラゴンはLv3 BP9000で回復状態を指定してアタックする")
    assert(c(BALGUNNER).effect.includes("合体条件：コスト4以上") && c(BALGUNNER).braveLevels?.[0]?.bp === 2000, "バル・ガンナーはコスト4以上に合体し合体時BP+2000")
    assert(c(GIRAS).effect.includes("合体条件：コスト3以上") && c(GIRAS).braveLevels?.[0]?.bp === 3000, "グラウン・ギラスはコスト3以上に合体し合体時BP+3000")
    chk(ROKU, "ロクケラトプス", "spirit", "red", 1)
    chk(METABURN, "メタルバーン", "spirit", "red", 3)
    chk(WINGAL, "ウィンガル", "spirit", "white", 6)
    chk(RAYNEEDLE, "レイニードル", "spirit", "red", 1)
    chk(TORNADRA, "トルネードラ", "spirit", "red", 6)
    chk(PAKI, "頭竜人パキケファロン", "spirit", "red", 4)
    chk(MATENRO, "旅団の摩天楼", "nexus", "purple", 3)
    chk(VAJURANGA, "ヴァジュランガ", "spirit", "red", 6)
    chk(JADVALJAR, "ジャドバルジャー", "spirit", "green", 5)
    chk(GYOKURUNE, "ギョクリューン", "brave", "blue", 4)
    assert(c(ROKU).levels[0]!.bp === 1000 && c(ROKU).effect === "", "ロクケラトプスはBP1000のバニラ")
    assert(c(METABURN).levels[0]!.bp === 3000 && c(METABURN).effect === "", "メタルバーンはLv1 BP3000のバニラ")
    assert(c(WINGAL).levels[0]!.bp === 5000 && c(WINGAL).effect === "", "ウィンガルはLv1 BP5000のバニラ")
    assert(c(RAYNEEDLE).levels[0]!.bp === 1000 && c(RAYNEEDLE).family.join() === "星竜" && c(RAYNEEDLE).effect === "", "レイニードルは星竜のバニラ（Lv1 BP1000）")
    assert(c(TORNADRA).levels[1]!.bp === 9000 && c(TORNADRA).family.join() === "星竜" && c(TORNADRA).effect === "", "トルネードラは星竜のバニラ（Lv2 BP9000）")
    assert(c(PAKI).levels[0]!.bp === 3000 && c(PAKI).effect === "", "パキケファロンはLv1 BP3000のバニラ")
    assert(c(VAJURANGA).levels[1]!.bp === 10000 && c(VAJURANGA).effect === "", "ヴァジュランガはLv2 BP10000のバニラ")
    assert(c(JADVALJAR).levels[2]!.bp === 12000, "ジャドバルジャーはLv3 BP12000")
    assert(c(GYOKURUNE).effect.includes("合体条件：コスト4以上") && c(GYOKURUNE).braveLevels?.[0]?.bp === 3000, "ギョクリューンはコスト4以上に合体し合体時BP+3000")
}

// ═══ BS20-074 シャイニングフレイム（フラッシュ：BP10000以下の相手のスピリット1体を破壊する）═══

console.log("=== BS20-074: フラッシュでBP10000のヴァジュランガを破壊する（軽減[赤]×3でコスト4を払う） ===")
scenario({
    name: "shiningFlameDestroy10000",
    start: {
        phase: "attack",
        me: { spirits: [{ card: ROKU, label: "先鋒" }, { card: ROKU, label: "次鋒" }, { card: ROKU, label: "中堅" }], hand: [SHINING_FLAME] },
        opp: { spirits: [{ card: VAJURANGA, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("先鋒") })
        t.act("opp", { type: "pass" }) // フラッシュの優先権は防御側から
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.先鋒.疲労: false → true",
        "自分.手札: シャイニングフレイム → なし",
        "自分.リザーブ: 10 → 6", // コスト7−軽減3（赤シンボル3つ）
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → シャイニングフレイム",
        "相手.ヴァジュランガ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヴァジュランガ",
        "相手.リザーブ: 10 → 14", // 破壊された3コア＋ライフ1コア
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== BS20-074: BP12000のジャドバルジャーは破壊できず、BP10000のヴァジュランガだけ壊れる ===")
scenario({
    name: "shiningFlameCantDestroy12000",
    start: {
        phase: "attack",
        me: { spirits: [{ card: ROKU, label: "先鋒" }, { card: ROKU, label: "次鋒" }, { card: ROKU, label: "中堅" }], hand: [SHINING_FLAME] },
        opp: { spirits: [{ card: VAJURANGA, cores: 3 }, { card: JADVALJAR, cores: 4 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("先鋒") })
        t.act("opp", { type: "pass" }) // フラッシュの優先権は防御側から
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ジャドバルジャー") })
        t.closeFlash()
    },
    expect: [
        "自分.先鋒.疲労: false → true",
        "自分.手札: シャイニングフレイム → なし",
        "自分.リザーブ: 10 → 7", // 6支払い＋先鋒の1コアが戻る
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → シャイニングフレイム、ロクケラトプス",
        "自分.先鋒.場所: フィールド → なし",
        "相手.ヴァジュランガ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヴァジュランガ",
        "相手.リザーブ: 10 → 13",
        "相手.ジャドバルジャー.疲労: false → true",
    ],
})

// ═══ EX004 煌星龍ジークヴルム・アルター ═══
// Lv1-3【激突】『このスピリットのアタック時』相手は可能ならば必ずブロックする。
// Lv2-3『このスピリットのアタック時』BPを比べ相手のスピリットだけを破壊したとき、
//        そのスピリットと同じ系統を持つ相手のスピリット1体を破壊する。

console.log("=== EX004 【激突】: ブロックできる相手はライフを取れず、必ずブロックする ===")
scenario({
    name: "alterClashForcesBlock",
    start: { phase: "attack", me: { spirits: [{ card: ALTER, cores: 1 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("煌星龍ジークヴルム・アルター") })
        t.closeFlash()
        t.actRejected("opp", { type: "takeLife" }) // 【激突】でブロックが可能な間はライフを取れない
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.煌星龍ジークヴルム・アルター.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== EX004 【激突】: 相手がブロックできない（疲労状態）ならライフを取れる ===")
scenario({
    name: "alterClashNoBlocker",
    start: { phase: "attack", me: { spirits: [{ card: ALTER, cores: 1 }] }, opp: { spirits: [{ card: ROKU, rested: true }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("煌星龍ジークヴルム・アルター") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.煌星龍ジークヴルム・アルター.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== EX004 Lv2: BP比べで星竜を破壊したら、もう1体の星竜も破壊する ===")
scenario({
    name: "alterLv2SameFamilyDestroy",
    start: {
        phase: "attack",
        me: { spirits: [{ card: ALTER, cores: 3 }] },
        opp: { spirits: [{ card: RAYNEEDLE, label: "レイニードルA" }, { card: RAYNEEDLE, label: "レイニードルB" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("煌星龍ジークヴルム・アルター") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("レイニードルA") })
        t.closeFlash()
    },
    expect: [
        "自分.煌星龍ジークヴルム・アルター.疲労: false → true",
        "相手.レイニードルA.場所: フィールド → なし",
        "相手.レイニードルB.場所: フィールド → なし",
        "相手.トラッシュ: なし → レイニードル、レイニードル",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== EX004 Lv1: Lv2未満なら（条件を1つ外す）同じ系統の追加破壊は起きない ===")
scenario({
    name: "alterLv1NoSameFamilyDestroy",
    start: {
        phase: "attack",
        me: { spirits: [{ card: ALTER, cores: 1 }] },
        opp: { spirits: [{ card: RAYNEEDLE, label: "レイニードルA" }, { card: RAYNEEDLE, label: "レイニードルB" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("煌星龍ジークヴルム・アルター") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("レイニードルA") })
        t.closeFlash()
    },
    expect: [
        "自分.煌星龍ジークヴルム・アルター.疲労: false → true",
        "相手.レイニードルA.場所: フィールド → なし",
        "相手.トラッシュ: なし → レイニードル",
        "相手.リザーブ: 10 → 11",
    ],
})

// ═══ SD03-002 剣竜人ステゴラス（自分のフィールドにスピリットが2体以下の間、このスピリットはLv3として扱う）═══

console.log("=== SD03-002: 1体だけならLv3扱い（BP5000）で、BP3000のブロッカーに勝つ ===")
scenario({
    name: "stegoTreatedAsLv3",
    start: { phase: "attack", me: { spirits: [{ card: STEGO, cores: 1 }] }, opp: { spirits: [{ card: METABURN, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("剣竜人ステゴラス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("メタルバーン") })
        t.closeFlash()
    },
    expect: [
        "自分.剣竜人ステゴラス.疲労: false → true",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== SD03-002: 自分のスピリットが3体いれば（条件を1つ外す）Lv1扱いで負ける ===")
scenario({
    name: "stegoNotTreatedAsLv3",
    start: {
        phase: "attack",
        me: { spirits: [{ card: STEGO, cores: 1 }, { card: ROKU, label: "援護1" }, { card: ROKU, label: "援護2" }] },
        opp: { spirits: [{ card: METABURN, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("剣竜人ステゴラス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("メタルバーン") })
        t.closeFlash()
    },
    expect: [
        "自分.剣竜人ステゴラス.場所: フィールド → なし",
        "自分.トラッシュ: なし → 剣竜人ステゴラス",
        "自分.リザーブ: 10 → 11",
        "相手.メタルバーン.疲労: false → true",
    ],
})

// ═══ SD03-003 モルゲザウルス（Lv1-3『このスピリットのアタック時』このスピリットをBP+2000する。バトルの間だけ）═══

console.log("=== SD03-003: Lv2のアタック時はバトルの間BP+2000（BP5000）でBP3000に勝つ ===")
scenario({
    name: "morgeBpPlus2000",
    start: { phase: "attack", me: { spirits: [{ card: MORGE, cores: 2 }] }, opp: { spirits: [{ card: METABURN, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("モルゲザウルス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("メタルバーン") })
        t.closeFlash()
    },
    expect: [
        "自分.モルゲザウルス.疲労: false → true",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== SD03-003: Lv1ならBP+2000してもBP4000で、BP5000のブロッカーに負ける ===")
scenario({
    name: "morgeLv1LosesTo5000",
    start: { phase: "attack", me: { spirits: [{ card: MORGE, cores: 1 }] }, opp: { spirits: [{ card: WINGAL, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("モルゲザウルス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ウィンガル") })
        t.closeFlash()
    },
    expect: [
        "自分.モルゲザウルス.場所: フィールド → なし",
        "自分.トラッシュ: なし → モルゲザウルス",
        "自分.リザーブ: 10 → 11",
        "相手.ウィンガル.疲労: false → true",
    ],
})

// ═══ SD03-004 角獣ガルナール（Lv1-2『このスピリットのアタック時』上から3枚オープン、星竜1枚手札、残りデッキ下）═══

console.log("=== SD03-004: 上3枚に星竜（レイニードル）があれば1枚手札に加え、残り2枚はデッキ下へ ===")
scenario({
    name: "garnalRevealTakeSeiryu",
    start: {
        phase: "attack",
        me: { spirits: [{ card: GARNAL, cores: 1 }], deck: [RAYNEEDLE, ROKU, ROKU, ...Array.from({ length: 37 }, () => ROKU)] },
        opp: {},
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("角獣ガルナール") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.角獣ガルナール.疲労: false → true",
        "自分.手札: なし → レイニードル",
        "自分.デッキ枚数: 40 → 39",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== SD03-004: 上3枚に星竜がなければ（条件を1つ外す）手札は増えず3枚ともデッキ下へ ===")
scenario({
    name: "garnalRevealNoSeiryu",
    start: { phase: "attack", me: { spirits: [{ card: GARNAL, cores: 1 }] }, opp: {} },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("角獣ガルナール") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.角獣ガルナール.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ═══ SD03-006 太陽龍ジーク・アポロドラゴン ═══
// Lv1-3『このスピリットのアタック時』回復状態の相手のスピリット1体を指定し、そのスピリットにアタックできる。
// 【合体時】Lv3『このスピリットの合体アタック時』BP9000以下の相手のスピリット1体を破壊する。

console.log("=== SD03-006 節1: 回復状態のロクケラトプスを指定してアタックし、バトルで破壊する ===")
scenario({
    name: "apolloSpecifyRecovered",
    start: {
        phase: "attack",
        me: { spirits: [{ card: APOLLO, cores: 1 }] },
        opp: { spirits: [{ card: ROKU }, { card: METABURN, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("太陽龍ジーク・アポロドラゴン"), targetSpiritInstanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.太陽龍ジーク・アポロドラゴン.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== SD03-006 節1: 相手がすべて疲労状態なら（条件を1つ外す）指定アタックはできず、ライフを取る ===")
scenario({
    name: "apolloNoRecoveredTarget",
    start: {
        phase: "attack",
        me: { spirits: [{ card: APOLLO, cores: 1 }] },
        opp: { spirits: [{ card: ROKU, rested: true }] },
    },
    steps(t) {
        t.actRejected("me", { type: "attack", instanceId: t.id("太陽龍ジーク・アポロドラゴン"), targetSpiritInstanceId: t.id("ロクケラトプス") })
        t.act("me", { type: "attack", instanceId: t.id("太陽龍ジーク・アポロドラゴン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.太陽龍ジーク・アポロドラゴン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== SD03-006 節2: 【合体時】Lv3の合体アタックでBP9000のトルネードラを破壊する ===")
scenario({
    name: "apolloCombinedDestroy9000",
    start: {
        me: { spirits: [{ card: APOLLO, cores: 5 }], hand: [GYOKURUNE] },
        opp: { spirits: [{ card: TORNADRA, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("太陽龍ジーク・アポロドラゴン") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("太陽龍ジーク・アポロドラゴン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ギョクリューン → なし",
        "自分.リザーブ: 10 → 6", // コスト4（軽減なし：自分のシンボルは赤のみ）
        "自分.トラッシュのコア: 0 → 4",
        "自分.ギョクリューン.場所: なし → 合体",
        "自分.ギョクリューン.疲労: なし → false",
        "自分.ギョクリューン.コア: なし → 0",
        "自分.ギョクリューン.Lv: なし → 1",
        "自分.太陽龍ジーク・アポロドラゴン.BP: 9000 → 12000", // 合体時BP+3000
        "自分.太陽龍ジーク・アポロドラゴン.疲労: false → true",
        "相手.トルネードラ.場所: フィールド → なし",
        "相手.トラッシュ: なし → トルネードラ",
        "相手.リザーブ: 10 → 14", // 破壊された3コア＋ライフ1コア
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== SD03-006 節2: 合体していなければ（条件を1つ外す）BP9000のトルネードラは破壊されない ===")
scenario({
    name: "apolloNotCombinedNoDestroy",
    start: {
        phase: "attack",
        me: { spirits: [{ card: APOLLO, cores: 5 }] },
        opp: { spirits: [{ card: TORNADRA, cores: 3, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("太陽龍ジーク・アポロドラゴン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.太陽龍ジーク・アポロドラゴン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ═══ SD03-010 砲竜バル・ガンナー（合体条件：コスト4以上。【合体時】『合体アタック時』1枚ドローしBP4000以下を破壊）═══

console.log("=== SD03-010: 合体アタックで1枚ドローし、BP1000のロクケラトプスを破壊する ===")
scenario({
    name: "balgunnerCombinedDrawDestroy",
    start: {
        me: { spirits: [{ card: PAKI, cores: 1 }], hand: [BALGUNNER] },
        opp: { spirits: [{ card: ROKU }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("頭竜人パキケファロン") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("頭竜人パキケファロン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 砲竜バル・ガンナー → ロクケラトプス", // ドローした1枚
        "自分.リザーブ: 10 → 7", // コスト4−軽減1（パキの赤シンボル）
        "自分.トラッシュのコア: 0 → 3",
        "自分.砲竜バル・ガンナー.場所: なし → 合体",
        "自分.砲竜バル・ガンナー.疲労: なし → false",
        "自分.砲竜バル・ガンナー.コア: なし → 0",
        "自分.砲竜バル・ガンナー.Lv: なし → 1",
        "自分.頭竜人パキケファロン.BP: 3000 → 5000", // 合体時BP+2000
        "自分.頭竜人パキケファロン.疲労: false → true",
        "自分.デッキ枚数: 40 → 39",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12", // 破壊された1コア＋ライフ1コア
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== SD03-010: コスト1には合体できず、スピリット状態のアタックでは（条件を1つ外す）ドローも破壊も起きない ===")
scenario({
    name: "balgunnerSpiritStateNoEffect",
    start: {
        me: { spirits: [{ card: PAKI, cores: 1 }, { card: ROKU, label: "援護" }], hand: [BALGUNNER] },
        opp: { spirits: [{ card: ROKU, label: "壁", cores: 3 }] },
    },
    steps(t) {
        t.actRejected("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("援護") }) // 合体条件コスト4以上
        t.act("me", { type: "summon", handIndex: 0 }) // スピリット状態で召喚
        const brave = t.state.players[t.me].field.spirits.find((x) => x.cardId === BALGUNNER)
        assert(brave !== undefined, "バル・ガンナーがスピリット状態で場に出ている")
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: brave!.instanceId })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: 砲竜バル・ガンナー → なし",
        "自分.リザーブ: 10 → 9", // 8（コスト4−軽減2）＋破壊されたブレイヴの1コアが戻る
        "自分.トラッシュのコア: 0 → 1",
        "自分.トラッシュ: なし → 砲竜バル・ガンナー", // BP2000がBP4000に負ける。ドローも破壊も起きない
        "相手.壁.疲労: false → true",
    ],
})

// ═══ SD03-011 鎧殻竜グラウン・ギラス ═══
// Lv1『このブレイヴの召喚時』相手のネクサス1つを破壊する。合体条件：コスト3以上。
// 【合体中】『このスピリットのアタック時』相手のネクサス1つを破壊する。

console.log("=== SD03-011 節1: ブレイヴの召喚時に相手のネクサス1つを破壊する ===")
scenario({
    name: "girasSummonDestroyNexus",
    start: { me: { hand: [GIRAS] }, opp: { nexuses: [{ card: MATENRO }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 鎧殻竜グラウン・ギラス → なし",
        "自分.リザーブ: 10 → 6", // コスト4（軽減なし：自分のフィールドにシンボルがない）
        "自分.トラッシュのコア: 0 → 3",
        "自分.鎧殻竜グラウン・ギラス.場所: なし → フィールド",
        "自分.鎧殻竜グラウン・ギラス.疲労: なし → false",
        "自分.鎧殻竜グラウン・ギラス.コア: なし → 1",
        "自分.鎧殻竜グラウン・ギラス.Lv: なし → 1",
        "自分.鎧殻竜グラウン・ギラス.BP: なし → 3000",
        "相手.旅団の摩天楼.場所: ネクサス → なし",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== SD03-011 節2: 合体中のアタックで（召喚時にも1つ壊し）もう1つのネクサスを破壊する ===")
scenario({
    name: "girasCombinedAttackDestroyNexus",
    start: {
        interactive: true,
        me: { spirits: [{ card: METABURN, cores: 1 }], hand: [GIRAS] },
        opp: { nexuses: [{ card: MATENRO, label: "摩天楼A" }, { card: MATENRO, label: "摩天楼B" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("メタルバーン") })
        t.act("me", { type: "resolveChoice", instanceId: t.id("摩天楼A") }) // 召喚時：Aを破壊
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("メタルバーン") })
        t.act("me", { type: "resolveChoice", instanceId: t.id("摩天楼B") }) // 合体中：Bを破壊
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 鎧殻竜グラウン・ギラス → なし",
        "自分.リザーブ: 10 → 7", // コスト4−軽減1（メタルバーンの赤シンボル）
        "自分.トラッシュのコア: 0 → 3",
        "自分.鎧殻竜グラウン・ギラス.場所: なし → 合体",
        "自分.鎧殻竜グラウン・ギラス.疲労: なし → false",
        "自分.鎧殻竜グラウン・ギラス.コア: なし → 0",
        "自分.鎧殻竜グラウン・ギラス.Lv: なし → 1",
        "自分.メタルバーン.BP: 3000 → 6000", // 合体時BP+3000
        "自分.メタルバーン.疲労: false → true",
        "相手.摩天楼A.場所: ネクサス → なし",
        "相手.摩天楼B.場所: ネクサス → なし",
        "相手.リザーブ: 10 → 13", // ネクサス2コア＋ライフ1コア
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== SD03-011 節2: スピリット状態のアタックでは（条件を1つ外す）2つ目のネクサスは破壊されない ===")
scenario({
    name: "girasSpiritStateAttackKeepsNexus",
    start: {
        interactive: true,
        me: { spirits: [{ card: METABURN, cores: 1 }], hand: [GIRAS] },
        opp: { nexuses: [{ card: MATENRO, label: "摩天楼A" }, { card: MATENRO, label: "摩天楼B" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // スピリット状態で召喚
        const brave = t.state.players[t.me].field.spirits.find((x) => x.cardId === GIRAS)
        assert(brave !== undefined, "グラウン・ギラスがスピリット状態で場に出ている")
        t.act("me", { type: "resolveChoice", instanceId: t.id("摩天楼A") }) // 召喚時：Aを破壊
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: brave!.instanceId })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 鎧殻竜グラウン・ギラス → なし",
        "自分.リザーブ: 10 → 7", // コスト4−軽減1
        "自分.トラッシュのコア: 0 → 2",
        "自分.鎧殻竜グラウン・ギラス.場所: なし → フィールド",
        "自分.鎧殻竜グラウン・ギラス.疲労: なし → true",
        "自分.鎧殻竜グラウン・ギラス.コア: なし → 1",
        "自分.鎧殻竜グラウン・ギラス.Lv: なし → 1",
        "自分.鎧殻竜グラウン・ギラス.BP: なし → 3000",
        "相手.摩天楼A.場所: ネクサス → なし",
        "相手.リザーブ: 10 → 12", // ネクサス1コア＋ライフ1コア
        "相手.ライフ: 5 → 4",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part747）")
