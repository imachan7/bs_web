// smoke パート880（reviveOnDestroy の ownAll を持つスピリット21枚：効果文だけから書いた場面テスト。発生源自身も条件に入る＝2026-10-29 ユーザー確認）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, SideSpec } from "./scenario"

const KILL = "BS14-094" // 天翔龍神覇（赤・コスト6・フラッシュ：BP6000以下の相手のスピリット1体を破壊）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const ALT = "BS01-005" // アイバーン（赤・コスト2・バニラ。ドローで引くカードを見分ける）
const COST4 = "BS01-089" // デュアルキャノン・ベル（白・コスト4・バニラ）
const GIANT = "X001" // 神龍皇ジーク・カタストロフドラゴン（Lv3 BP20000。ブロッカー役）
const HERA = "BS01-058" // ヘラクレス・ジオ（Lv2 cores3 BP6000。ブロッカー役）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, name: string, type: string, cost: number) =>
        assert(getCard(id).name === name && getCard(id).type === type && getCard(id).cost === cost, `${id} は ${name}（${type}・コスト${cost}）`)
    chk(KILL, "天翔龍神覇", "magic", 6)
    chk(VANILLA, "ロクケラトプス", "spirit", 1)
    chk(ALT, "アイバーン", "spirit", 2)
    chk(COST4, "デュアルキャノン・ベル", "spirit", 4)
    chk(GIANT, "神龍皇ジーク・カタストロフドラゴン", "spirit", 6)
    chk(HERA, "ヘラクレス・ジオ", "spirit", 3)
    chk("SD15-X01", "戦天使イクセル", "spirit", 6)
    chk("BS20-002", "炎楯の守護者コロナ・ドラゴン", "spirit", 3)
    chk("BS20-013", "闇楯の守護者ナーガン", "spirit", 3)
    chk("BS20-022", "風楯の守護者トビマル", "spirit", 3)
    chk("BS20-030", "氷楯の守護者オーシン", "spirit", 3)
    chk("BS20-039", "光楯の守護者イーディス", "spirit", 3)
    chk("BS20-047", "海楯の守護者ジャイルズ", "spirit", 3)
    chk("BS18-044", "創造主グリム・ジェイ", "spirit", 5)
    chk("BS18-043", "創造主グリム・ウィル", "spirit", 5)
    chk("BS22-041", "アルミラージ", "spirit", 4)
    chk("BS08-041", "犬将クー・シー", "spirit", 4)
    chk("BS12-X05", "戦神乙女ヴィエルジェ", "spirit", 6)
    chk("BS10-048", "天使パワー", "spirit", 5)
    chk("BS03-062", "チワール", "spirit", 5)
    chk("BS02-059", "ロム", "spirit", 3)
    chk("BS13-X02", "蛇皇神帝アスクレピオーズ", "spirit", 9)
    chk("BS09-026", "軍艦長ドレッドノート", "spirit", 7)
    chk("BS15-020", "パンダル", "spirit", 3)
    chk("BS04-039", "宝石虫スカラベール", "spirit", 3)
    chk("BS02-026", "マッハジー", "spirit", 1)
    chk("BS05-036", "氷の魔女ヘル", "spirit", 8)
    chk("BS06-040", "薄氷の侍女長フッラ", "spirit", 3)
    chk("BS13-036", "星鳥クージャ", "spirit", 4)
    chk("BS02-051", "チュンポポ", "spirit", 1)
    chk("BS17-052", "アラビアン騎士シンド・バード", "spirit", 6)
    chk("BS16-037", "ブレーペンタンの音楽隊", "spirit", 2)
    chk("BS14-064", "レボルシング・ゼヨン", "spirit", 6)
    chk("BS14-090", "勇壮なる船上都市", "nexus", 5)
    chk("BS15-049", "ツンドッグ・ゴレム", "spirit", 3)
    chk("BS03-076", "爪剣のラザラス", "spirit", 2)
    chk("BS10-046", "龍仙公主", "spirit", 5)
    chk("BS13-038", "魔女タランダ", "spirit", 5)
}

const KILL_COST = ["相手.リザーブ: 10 → 4", "相手.トラッシュのコア: 0 → 6", "相手.手札: 天翔龍神覇 → なし", "相手.トラッシュ: なし → 天翔龍神覇"]
const oppKill = (t: ScenarioCtx, label: string) => t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id(label) })
const nm = (id: string) => getCard(id).name

// 自分のスピリットが破壊されたときの結果の行（cores＝その個体のコア数。破壊・手札に戻るときはリザーブへ戻る）
const toTrash = (id: string, cores: number, label = nm(id)) => [`自分.${label}.場所: フィールド → なし`, `自分.トラッシュ: なし → ${nm(id)}`, `自分.リザーブ: 10 → ${10 + cores}`]
const toHand = (id: string, cores: number, label = nm(id)) => [`自分.${label}.場所: フィールド → なし`, `自分.手札: なし → ${nm(id)}`, `自分.リザーブ: 10 → ${10 + cores}`]
const rested = (label: string) => [`自分.${label}.疲労: false → true`]

// 相手の効果（KILL）で自分のスピリットを破壊する場面。phase を attack にすると、相手がアイバーンでアタックを宣言した直後のフラッシュで使う（相手のアタックステップ）
function byEffect(name: string, me: SideSpec, target: string, expect: string[], phase: "main" | "attack" = "main", extra: string[] = []) {
    const atk = phase === "attack"
    scenario({
        name,
        start: { turn: "opp", phase, me, opp: { hand: [KILL], spirits: atk ? [{ card: ALT }] : [] } },
        steps: (t) => {
            if (atk) {
                t.act("opp", { type: "attack", instanceId: t.id(nm(ALT)) })
                t.act("me", { type: "pass" })
            }
            oppKill(t, target)
        },
        expect: [...(atk ? KILL_COST.map((l) => l.replace("→ 4", "→ 5").replace("→ 6", "→ 5")) : KILL_COST), ...(atk ? [`相手.${nm(ALT)}.疲労: false → true`] : []), ...expect, ...extra],
    })
}

// 自分のアタックステップ：自分の attacker が相手の blocker にブロックされる
function myAttackBlocked(name: string, me: SideSpec, opp: SideSpec, attacker: string, blocker: string, expect: string[]) {
    scenario({
        name,
        start: { turn: "me", phase: "attack", me, opp },
        steps: (t) => {
            t.act("me", { type: "attack", instanceId: t.id(attacker) })
            t.act("opp", { type: "pass" })
            t.act("me", { type: "pass" })
            t.act("opp", { type: "block", instanceId: t.id(blocker) })
            t.closeFlash()
        },
        expect: [`相手.${blocker}.疲労: false → true`, ...expect],
    })
}

console.log("=== SD15-X01 戦天使イクセル：コスト3以下が相手の効果で破壊されたら手札に戻り、1枚ドロー ===")
{
    const deck = [ALT, ...Array(39).fill(VANILLA)]
    byEffect("イクセル-コスト3以下", { spirits: [{ card: "SD15-X01", cores: 3 }, { card: VANILLA }], deck }, "ロクケラトプス",
        [...toHand(VANILLA, 1).slice(0, 1), "自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 11", "自分.手札: なし → アイバーン、ロクケラトプス"])
    byEffect("イクセル-コスト4は対象外", { spirits: [{ card: "SD15-X01", cores: 3 }, { card: COST4 }], deck }, "デュアルキャノン・ベル", toTrash(COST4, 1))
}

console.log("=== BS20 守護者6種（コスト3以下の自分のスピリットすべては、相手の効果で破壊されたとき疲労状態で残る） ===")
for (const id of ["BS20-002", "BS20-013", "BS20-022", "BS20-030", "BS20-039", "BS20-047"]) {
    const n = nm(id)
    byEffect(`${n}-自身`, { spirits: [{ card: id }] }, n, rested(n))
    byEffect(`${n}-コスト3以下の他のスピリット`, { spirits: [{ card: id }, { card: VANILLA }] }, "ロクケラトプス", rested("ロクケラトプス"))
    byEffect(`${n}-コスト4は対象外`, { spirits: [{ card: id }, { card: COST4 }] }, "デュアルキャノン・ベル", toTrash(COST4, 1))
    // 相手の効果で、の「相手」は発生源の持ち主から見た相手。自分側の守護者は、相手側のスピリットを守らない
    scenario({
        name: `${n}-相手側のスピリットは守らない`,
        start: { turn: "me", me: { spirits: [{ card: id }], hand: [KILL] }, opp: { spirits: [{ card: VANILLA }] } },
        steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロクケラトプス") }),
        expect: [`自分.リザーブ: 10 → ${id === "BS20-002" ? 5 : 4}`, `自分.トラッシュのコア: 0 → ${id === "BS20-002" ? 5 : 6}`, "自分.手札: 天翔龍神覇 → なし", "自分.トラッシュ: なし → 天翔龍神覇",
            "相手.ロクケラトプス.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
    })
}

console.log("=== BS18-044 創造主グリム・ジェイ：Lv2以上で、自身と[グリム・ウィル]すべてが相手によって破壊されたとき疲労状態で残る ===")
{
    const JAY = "BS18-044"
    const WILL = "BS18-043"
    byEffect("ジェイ-Lv2の自身", { spirits: [{ card: JAY, cores: 2 }] }, nm(JAY), rested(nm(JAY)))
    byEffect("ジェイ-Lv2でウィルが破壊", { spirits: [{ card: JAY, cores: 2 }, { card: WILL }] }, nm(WILL), rested(nm(WILL)))
    byEffect("ジェイ-Lv1は効かない", { spirits: [{ card: JAY, cores: 1 }] }, nm(JAY), toTrash(JAY, 1))
    byEffect("ジェイ-ほかのスピリットは対象外", { spirits: [{ card: JAY, cores: 2 }, { card: VANILLA }] }, "ロクケラトプス", toTrash(VANILLA, 1))
}

console.log("=== BS22-041 アルミラージ：Lv2以上で、【聖命】を持つ自分のスピリットすべてが相手の効果で破壊されたとき疲労状態で残る ===")
{
    const ARM = "BS22-041"
    const KOO = "BS08-041"
    byEffect("アルミラージ-Lv2の自身（聖命持ち）", { spirits: [{ card: ARM, cores: 2 }] }, nm(ARM), rested(nm(ARM)))
    byEffect("アルミラージ-Lv2で他の聖命持ち", { spirits: [{ card: ARM, cores: 2 }, { card: KOO }] }, nm(KOO), rested(nm(KOO)))
    byEffect("アルミラージ-Lv1は効かない", { spirits: [{ card: ARM, cores: 1 }, { card: KOO }] }, nm(KOO), toTrash(KOO, 1))
    byEffect("アルミラージ-聖命を持たない", { spirits: [{ card: ARM, cores: 2 }, { card: VANILLA }] }, "ロクケラトプス", toTrash(VANILLA, 1))
}

console.log("=== BS12-X05 戦神乙女ヴィエルジェ：Lv2以上で、「光導」/「天霊」の自分のスピリットすべてが相手によって破壊されたとき手札に戻る ===")
{
    const VIE = "BS12-X05"
    const POWER = "BS10-048"
    byEffect("ヴィエルジェ-Lv2の自身", { spirits: [{ card: VIE, cores: 2 }] }, nm(VIE), toHand(VIE, 2))
    byEffect("ヴィエルジェ-Lv2で天霊の他のスピリット", { spirits: [{ card: VIE, cores: 2 }, { card: POWER }] }, nm(POWER), toHand(POWER, 1))
    byEffect("ヴィエルジェ-Lv1は効かない", { spirits: [{ card: VIE, cores: 1 }, { card: POWER }] }, nm(POWER), toTrash(POWER, 1))
    byEffect("ヴィエルジェ-系統が違う", { spirits: [{ card: VIE, cores: 2 }, { card: VANILLA }] }, "ロクケラトプス", toTrash(VANILLA, 1))
}

console.log("=== BS03-062 チワール：Lv2以上で、「小玩」の自分のスピリットが破壊されたとき手札に戻る ===")
{
    const CHI = "BS03-062"
    const ROM = "BS02-059"
    byEffect("チワール-Lv2で小玩が破壊", { spirits: [{ card: CHI, cores: 3 }, { card: ROM }] }, nm(ROM), toHand(ROM, 1))
    byEffect("チワール-Lv1は効かない", { spirits: [{ card: CHI, cores: 1 }, { card: ROM }] }, nm(ROM), toTrash(ROM, 1))
    byEffect("チワール-小玩でない", { spirits: [{ card: CHI, cores: 3 }, { card: VANILLA }] }, "ロクケラトプス", toTrash(VANILLA, 1))
}

console.log("=== BS13-X02 アスクレピオーズ：自分のアタックステップ、Lv2以上で「光導」/「妖蛇」の自分のスピリットが BPを比べ破壊されたとき回復状態で残る ===")
{
    const ASK = "BS13-X02"
    const VIE = "BS12-X05"
    const NAGAN = "BS20-013"
    const blk: SideSpec = { spirits: [{ card: GIANT, cores: 10 }] }
    myAttackBlocked("アスクレピオーズ-Lv2の自身がバトルで破壊", { spirits: [{ card: ASK, cores: 4 }] }, blk, nm(ASK), nm(GIANT), [])
    myAttackBlocked("アスクレピオーズ-光導の他のスピリット", { spirits: [{ card: ASK, cores: 4 }, { card: VIE }] }, blk, nm(VIE), nm(GIANT), [])
    myAttackBlocked("アスクレピオーズ-妖蛇の他のスピリット", { spirits: [{ card: ASK, cores: 4 }, { card: NAGAN }] }, blk, nm(NAGAN), nm(GIANT), [])
    myAttackBlocked("アスクレピオーズ-Lv1は効かない", { spirits: [{ card: ASK, cores: 1 }, { card: VIE }] }, blk, nm(VIE), nm(GIANT), toTrash(VIE, 1))
    myAttackBlocked("アスクレピオーズ-系統が違う", { spirits: [{ card: ASK, cores: 4 }, { card: VANILLA }] }, blk, nm(VANILLA), nm(GIANT), toTrash(VANILLA, 1))
    byEffect("アスクレピオーズ-相手のターン（効果での破壊）は対象外", { spirits: [{ card: ASK, cores: 4 }, { card: VIE }] }, nm(VIE), toTrash(VIE, 1))
}


console.log("=== BS09-026 ドレッドノート：自分のアタックステップ、Lv2で【暴風】持ちの自分のスピリットが BPを比べ破壊されたとき疲労状態で戻る ===")
{
    const DRE = "BS09-026"
    const PAN = "BS15-020"
    const blk: SideSpec = { spirits: [{ card: GIANT, cores: 10 }] }
    myAttackBlocked("ドレッドノート-Lv2の自身（暴風持ち）", { spirits: [{ card: DRE, cores: 3 }] }, blk, nm(DRE), nm(GIANT), rested(nm(DRE)))
    myAttackBlocked("ドレッドノート-Lv2で他の暴風持ち", { spirits: [{ card: DRE, cores: 3 }, { card: PAN }] }, blk, nm(PAN), nm(GIANT), rested(nm(PAN)))
    myAttackBlocked("ドレッドノート-Lv1は効かない", { spirits: [{ card: DRE, cores: 1 }, { card: PAN }] }, blk, nm(PAN), nm(GIANT), toTrash(PAN, 1))
    myAttackBlocked("ドレッドノート-暴風を持たない", { spirits: [{ card: DRE, cores: 3 }, { card: VANILLA }] }, blk, nm(VANILLA), nm(GIANT), toTrash(VANILLA, 1))
    byEffect("ドレッドノート-相手のターンの効果破壊は対象外", { spirits: [{ card: DRE, cores: 3 }, { card: PAN }] }, nm(PAN), toTrash(PAN, 1))
}

console.log("=== BS04-039 スカラベール：Lv2、自分のアタックステップ、【神速】持ちが BPを比べ相手のスピリットに破壊されたとき、コア1個をトラッシュに置くことで手札に戻る ===")
{
    const SCA = "BS04-039"
    const MAC = "BS02-026"
    const blk: SideSpec = { spirits: [{ card: GIANT, cores: 10 }] }
    myAttackBlocked("スカラベール-神速持ち", { spirits: [{ card: SCA, cores: 3 }, { card: MAC }] }, blk, nm(MAC), nm(GIANT), [...toHand(MAC, 1).slice(0, 2), "自分.トラッシュのコア: 0 → 1"])
    myAttackBlocked("スカラベール-Lv1は効かない", { spirits: [{ card: SCA, cores: 1 }, { card: MAC }] }, blk, nm(MAC), nm(GIANT), toTrash(MAC, 1))
    myAttackBlocked("スカラベール-神速を持たない", { spirits: [{ card: SCA, cores: 3 }, { card: VANILLA }] }, blk, nm(VANILLA), nm(GIANT), toTrash(VANILLA, 1))
}

console.log("=== BS05-036 ヘル：Lv2、お互いのアタックステップ、[ヘル]以外の「氷姫」の自分のスピリットは破壊されたとき手札に戻る ===")
{
    const HEL = "BS05-036"
    const HUR = "BS06-040"
    const blk: SideSpec = { spirits: [{ card: GIANT, cores: 10 }] }
    byEffect("ヘル-相手のアタックステップで氷姫が破壊", { spirits: [{ card: HEL, cores: 4 }, { card: HUR }] }, nm(HUR), toHand(HUR, 1), "attack")
    myAttackBlocked("ヘル-自分のアタックステップのバトルで氷姫が破壊", { spirits: [{ card: HEL, cores: 4 }, { card: HUR }] }, blk, nm(HUR), nm(GIANT), toHand(HUR, 1))
    myAttackBlocked("ヘル-ヘル自身は対象外（以外）", { spirits: [{ card: HEL, cores: 4 }] }, blk, nm(HEL), nm(GIANT), toTrash(HEL, 4))
    byEffect("ヘル-Lv1は効かない", { spirits: [{ card: HEL, cores: 1 }, { card: HUR }] }, nm(HUR), toTrash(HUR, 1), "attack")
    byEffect("ヘル-アタックステップ以外は効かない", { spirits: [{ card: HEL, cores: 4 }, { card: HUR }] }, nm(HUR), toTrash(HUR, 1), "main")
    byEffect("ヘル-氷姫でない", { spirits: [{ card: HEL, cores: 4 }, { card: VANILLA }] }, "ロクケラトプス", toTrash(VANILLA, 1), "attack")
}

console.log("=== BS13-036 星鳥クージャ：お互いのアタックステップ、黄のスピリットが破壊されたとき、ライフのコア1個をリザーブに置くことで疲労状態で残る（Lv2:ドロー／Lv3:ボイドからコア1個） ===")
{
    const KUJ = "BS13-036"
    const PYO = "BS02-051"
    const deck = [ALT, ...Array(39).fill(VANILLA)]
    const pay = ["自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"]
    const draw = ["自分.デッキ枚数: 40 → 39", "自分.手札: なし → アイバーン"]
    byEffect("クージャ-Lv1で自身（黄）", { spirits: [{ card: KUJ, cores: 1 }] }, nm(KUJ), [...rested(nm(KUJ)), ...pay], "attack")
    byEffect("クージャ-Lv1で他の黄", { spirits: [{ card: KUJ, cores: 1 }, { card: PYO }] }, nm(PYO), [...rested(nm(PYO)), ...pay], "attack")
    byEffect("クージャ-Lv2はドローも", { spirits: [{ card: KUJ, cores: 2 }, { card: PYO }], deck }, nm(PYO), [...rested(nm(PYO)), ...pay, ...draw], "attack")
    byEffect("クージャ-Lv3はボイドからコアも", { spirits: [{ card: KUJ, cores: 3 }, { card: PYO }], deck }, nm(PYO), [...rested(nm(PYO)), "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 12", ...draw], "attack")
    byEffect("クージャ-黄でないスピリット", { spirits: [{ card: KUJ, cores: 3 }, { card: VANILLA }], deck }, "ロクケラトプス", toTrash(VANILLA, 1), "attack")
    byEffect("クージャ-アタックステップ以外", { spirits: [{ card: KUJ, cores: 3 }, { card: PYO }], deck }, nm(PYO), toTrash(PYO, 1), "main")
}

console.log("=== BS17-052 シンド・バード：Lv1・Lv2、相手のアタックステップ、「雄将」の自分のスピリットが破壊されたとき、デッキを上から5枚破棄することで回復状態で残る ===")
{
    const SIN = "BS17-052"
    const BRE = "BS16-037"
    const mill = ["自分.デッキ枚数: 40 → 35", `自分.トラッシュ: なし → ${Array(5).fill("ロクケラトプス").join("、")}`]
    byEffect("シンド・バード-自身（雄将）", { spirits: [{ card: SIN, cores: 1 }] }, nm(SIN), mill, "attack")
    byEffect("シンド・バード-他の雄将", { spirits: [{ card: SIN, cores: 1 }, { card: BRE }] }, nm(BRE), mill, "attack")
    byEffect("シンド・バード-疲労状態の雄将は回復状態で残る", { spirits: [{ card: SIN, cores: 1 }, { card: BRE, rested: true }] }, nm(BRE), [...mill, `自分.${nm(BRE)}.疲労: true → false`], "attack")
    byEffect("シンド・バード-Lv2でも効く", { spirits: [{ card: SIN, cores: 4 }, { card: BRE }] }, nm(BRE), mill, "attack")
    byEffect("シンド・バード-アタックステップ以外", { spirits: [{ card: SIN, cores: 1 }, { card: BRE }] }, nm(BRE), toTrash(BRE, 1), "main")
    byEffect("シンド・バード-雄将でない", { spirits: [{ card: SIN, cores: 1 }, { card: VANILLA }] }, "ロクケラトプス", toTrash(VANILLA, 1), "attack")
}

console.log("=== BS14-064 ゼヨン：Lv2、お互いのアタックステップ、相手によって自分のスピリットが破壊されたとき、ネクサス1つを疲労させることで疲労状態で残る ===")
{
    const ZEY = "BS14-064"
    const NEX = "BS14-090"
    const blk: SideSpec = { spirits: [{ card: GIANT, cores: 10 }] }
    byEffect("ゼヨン-他のスピリット（ネクサスを疲労）", { spirits: [{ card: ZEY, cores: 4 }, { card: VANILLA }], nexuses: [{ card: NEX }] }, "ロクケラトプス", [...rested("ロクケラトプス"), ...rested(nm(NEX))], "attack")
    myAttackBlocked("ゼヨン-自身がバトルで破壊", { spirits: [{ card: ZEY, cores: 4 }], nexuses: [{ card: NEX }] }, blk, nm(ZEY), nm(GIANT), [...rested(nm(ZEY)), ...rested(nm(NEX))])
    byEffect("ゼヨン-ネクサスが無ければ支払えない", { spirits: [{ card: ZEY, cores: 4 }, { card: VANILLA }] }, "ロクケラトプス", toTrash(VANILLA, 1), "attack")
    byEffect("ゼヨン-ネクサスが疲労済みなら支払えない", { spirits: [{ card: ZEY, cores: 4 }, { card: VANILLA }], nexuses: [{ card: NEX, rested: true }] }, "ロクケラトプス", toTrash(VANILLA, 1), "attack")
    byEffect("ゼヨン-Lv1は効かない", { spirits: [{ card: ZEY, cores: 1 }, { card: VANILLA }], nexuses: [{ card: NEX }] }, "ロクケラトプス", toTrash(VANILLA, 1), "attack")
    byEffect("ゼヨン-アタックステップ以外", { spirits: [{ card: ZEY, cores: 4 }, { card: VANILLA }], nexuses: [{ card: NEX }] }, "ロクケラトプス", toTrash(VANILLA, 1), "main")
}

console.log("=== BS15-049 ツンドッグ・ゴレム：召喚したターンの間、【粉砕】持ちの自分のスピリットが BPを比べ破壊されたとき疲労状態で残る ===")
{
    const TUN = "BS15-049"
    const LAZ = "BS03-076"
    const blk: SideSpec = { spirits: [{ card: GIANT, cores: 10 }] }
    const run = (name: string, hand: string[], spirits: { card: string }[], summons: number, attacker: string, expect: string[]) =>
        scenario({
            name,
            start: { turn: "me", phase: "main", me: { hand, spirits }, opp: blk },
            steps: (t) => {
                for (let i = 0; i < summons; i++) t.act("me", { type: "summon", handIndex: 0 })
                t.act("me", { type: "nextPhase" })
                const atk = t.state.players[t.me].field.spirits.find((x) => x.cardId === attacker)
                if (!atk) throw new Error(`${name}: アタッカーがいない`)
                t.act("me", { type: "attack", instanceId: atk.instanceId })
                t.act("opp", { type: "pass" })
                t.act("me", { type: "pass" })
                t.act("opp", { type: "block", instanceId: t.id(nm(GIANT)) })
                t.closeFlash()
            },
            expect: [...expect, `相手.${nm(GIANT)}.疲労: false → true`],
        })
    const crush = ["相手.デッキ枚数: 40 → 39", "相手.トラッシュ: なし → ロクケラトプス"] // 爪剣のラザラスの【粉砕】のアタック時（Lv1＝1枚）
    const tunEntry = (rest: boolean) => ["自分.ツンドッグ・ゴレム.BP: なし → 3000", "自分.ツンドッグ・ゴレム.Lv: なし → 1", "自分.ツンドッグ・ゴレム.コア: なし → 1", "自分.ツンドッグ・ゴレム.場所: なし → フィールド", `自分.ツンドッグ・ゴレム.疲労: なし → ${rest}`]
    const tunCost = ["自分.トラッシュのコア: 0 → 2", "自分.リザーブ: 10 → 7", "自分.手札: ツンドッグ・ゴレム → なし"]
    run("ツンドッグ-召喚前から場にいた粉砕持ち", [TUN], [{ card: LAZ }], 1, LAZ, [...crush, ...tunEntry(false), ...tunCost, ...rested(nm(LAZ))])
    run("ツンドッグ-召喚後に出た粉砕持ち", [TUN, LAZ], [], 2, LAZ, [...crush, ...tunEntry(false), "自分.トラッシュのコア: 0 → 4", "自分.リザーブ: 10 → 4", "自分.手札: ツンドッグ・ゴレム、爪剣のラザラス → なし",
        "自分.爪剣のラザラス.BP: なし → 2000", "自分.爪剣のラザラス.Lv: なし → 1", "自分.爪剣のラザラス.コア: なし → 1", "自分.爪剣のラザラス.場所: なし → フィールド", "自分.爪剣のラザラス.疲労: なし → true"])
    run("ツンドッグ-自身（粉砕持ち）", [TUN], [], 1, TUN, [...tunEntry(true), ...crush, "自分.トラッシュのコア: 0 → 3", "自分.リザーブ: 10 → 6", "自分.手札: ツンドッグ・ゴレム → なし"])
    run("ツンドッグ-粉砕を持たない", [TUN], [{ card: VANILLA }], 1, VANILLA, [...tunEntry(false), "自分.トラッシュのコア: 0 → 3", "自分.リザーブ: 10 → 7", "自分.手札: ツンドッグ・ゴレム → なし", "自分.ロクケラトプス.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス"])
    run("ツンドッグ-召喚していなければ効かない", [], [{ card: LAZ }], 0, LAZ, [...crush, ...toTrash(LAZ, 1)])
}

console.log("=== BS10-046 龍仙公主 / BS13-038 魔女タランダ：破棄できるカードが手札に無ければ戻せない ===")
{
    byEffect("龍仙公主-手札にマジックが無い", { spirits: [{ card: "BS10-046", cores: 1 }] }, nm("BS10-046"), toTrash("BS10-046", 1))
    byEffect("タランダ-手札にスピリットが無い", { spirits: [{ card: "BS13-038", cores: 1 }] }, nm("BS13-038"), toTrash("BS13-038", 1))
    // 手札から「好きなだけ破棄」して戻す側は、数を誰がどう選ぶかが効果文から決まらないので書かない（報告の質問欄）
}
console.log("すべてのチェックに合格しました 🎉（part880）")
