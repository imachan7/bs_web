// smoke パート743（BS19 未発火の効果エントリ15件: 055 e3/e5・059 e1・061 e1・069 e2・079 e3・081 e2・
// 084 e1・090 e2・099 e3・112 トラッシュ回収禁止・X03 e3・X08 e1/e2 の期待値。
// 効果文とカードの属性だけから書く（docs/design/TEST_STRATEGY.md §5・§6・CONJUNCTION.md・PROMO_PLAN.md §2）。
// BS19 の effects はまだ空なので、効果が絡む場面は現状落ちる。例外では止まらないこと）
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

// ── 主役（BS19） ──
const PERUDIA = "BS19-055" // ペルーディア（黄・スピリット・コスト6・想獣）
const GAIUS = "BS19-059" // 光の戦士ガイウス（青・スピリット・コスト2・闘神）
const RANDAL = "BS19-061" // 光の闘士ランダル（青・スピリット・コスト3・闘神）
const HIHI = "BS19-069" // ヒヒ・ボーン（紫・ブレイヴ・コスト3・無魔）
const TOWER = "BS19-079" // 星見の三連塔（赤・ネクサス・コスト4）
const SCALE = "BS19-081" // 剥がれ落ちるウロコ山（赤/紫・ネクサス・コスト5）
const CANDLE = "BS19-084" // 命の蝋燭塔（紫/黄・ネクサス・コスト5）
const ICETOWER = "BS19-090" // 凍てつくつららの逆塔（白/緑・ネクサス・コスト5）
const FLAMEFIELD = "BS19-099" // フレイムフィールド（赤・マジック・コスト5）
const OCEANFIELD = "BS19-112" // オーシャンフィールド（青・マジック・コスト3）
const MANTIS = "BS19-X03" // 黒蟲魔王ディアボリカ・マンティス（緑・スピリット・コスト6・怪虫）
const MEIL = "BS19-X08" // 蒼海の大剣メイルシュトロム（青・ブレイヴ・コスト6・剣刃）

// ── 脇役 ──
const KEFAL = "BS19-006" // ケファレダガー（赤・コスト4・地竜・【連鎖】持ち）
const MACH = "BS19-024" // ダーク・マッハジー（緑・コスト2・怪虫・【神速】持ち）
const RAIN = "BS07-001" // レイニードル（赤・コスト1・星竜・バニラ）
const TOWERGOLEM = "BS11-043" // タワー・ゴレム（青・コスト3・造兵・【粉砕】アタック時デッキ破棄）
const JEFFREY = "BS03-072" // 槍兵のジェフリー（青・コスト1・闘神・バニラ）
const ARNOLD = "BS03-089" // ディープ・アーノルド（青・コスト4・異合・バニラ BP4000/Lv2 BP8000）
const BANFA = "BS03-091" // 戦闘獣バン・ファロー（青・コスト5・戦獣・バニラ BP4000）
const DIMETRO = "BS05-003" // ディメトロドロン（赤・コスト3・地竜・バニラ Lv2 BP5000）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・バニラ）
const GEPA = "BS10-064" // 骸戦車ゲパルバート（紫・ブレイヴ・コスト3・無魔）
const GUST = "BS09-069" // フレイムガスト（赤マジック・コスト6・BP6000以下を破壊）
const DREAMRIBBON = "BS01-146" // ドリームリボン（白マジック・コスト4・相手1体を手札に戻す）
const CALLOFLOST = "BS01-118" // コールオブロスト（赤マジック・コスト4・トラッシュのスピリット1枚を手札に戻す）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = (id: string) => getCard(id)
    const t = (id: string, name: string, type: string, colors: string[], family: string[], cost: number) => {
        assert(c(id).name === name, `${id}は${name}`)
        assert(c(id).type === type, `${name}は${type}`)
        assert(JSON.stringify(c(id).colors) === JSON.stringify(colors), `${name}の色は${colors.join("/")}`)
        assert(JSON.stringify(c(id).family ?? []) === JSON.stringify(family), `${name}の系統は${family.join("/")}`)
        assert(c(id).cost === cost, `${name}のコストは${cost}`)
    }
    t(PERUDIA, "ペルーディア", "spirit", ["yellow"], ["想獣"], 6)
    t(GAIUS, "光の戦士ガイウス", "spirit", ["blue"], ["闘神"], 2)
    t(RANDAL, "光の闘士ランダル", "spirit", ["blue"], ["闘神"], 3)
    t(HIHI, "ヒヒ・ボーン", "brave", ["purple"], ["無魔"], 3)
    t(TOWER, "星見の三連塔", "nexus", ["red"], [], 4)
    t(SCALE, "剥がれ落ちるウロコ山", "nexus", ["red", "purple"], [], 5)
    t(CANDLE, "命の蝋燭塔", "nexus", ["purple", "yellow"], [], 5)
    t(ICETOWER, "凍てつくつららの逆塔", "nexus", ["white", "green"], [], 5)
    t(FLAMEFIELD, "フレイムフィールド", "magic", ["red"], [], 5)
    t(OCEANFIELD, "オーシャンフィールド", "magic", ["blue"], [], 3)
    t(MANTIS, "黒蟲魔王ディアボリカ・マンティス", "spirit", ["green"], ["怪虫"], 6)
    t(MEIL, "蒼海の大剣メイルシュトロム", "brave", ["blue"], ["剣刃"], 6)
    t(KEFAL, "ケファレダガー", "spirit", ["red"], ["地竜"], 4)
    t(MACH, "ダーク・マッハジー", "spirit", ["green"], ["怪虫"], 2)
    t(RAIN, "レイニードル", "spirit", ["red"], ["星竜"], 1)
    t(TOWERGOLEM, "タワー・ゴレム", "spirit", ["blue"], ["造兵"], 3)
    t(JEFFREY, "槍兵のジェフリー", "spirit", ["blue"], ["闘神"], 1)
    t(ARNOLD, "ディープ・アーノルド", "spirit", ["blue"], ["異合"], 4)
    t(BANFA, "戦闘獣バン・ファロー", "spirit", ["blue"], ["戦獣"], 5)
    t(DIMETRO, "ディメトロドロン", "spirit", ["red"], ["地竜"], 3)
    t(VANILLA, "ロクケラトプス", "spirit", ["red"], ["地竜"], 1)
    t(GEPA, "骸戦車ゲパルバート", "brave", ["purple"], ["無魔"], 3)
    t(GUST, "フレイムガスト", "magic", ["red"], [], 6)
    t(DREAMRIBBON, "ドリームリボン", "magic", ["white"], [], 4)
    t(CALLOFLOST, "コールオブロスト", "magic", ["red"], [], 4)
    // BP の確認（期待値で使う分）
    assert(getCard(KEFAL).levels[0]!.bp === 3000, "ケファレダガーのLv1 BPは3000")
    assert(getCard(DIMETRO).levels[1]!.bp === 5000, "ディメトロドロンのLv2 BPは5000")
    assert(getCard(JEFFREY).levels[0]!.bp === 2000, "ジェフリーのLv1 BPは2000")
    assert(getCard(HIHI).levels[0]!.bp === 2000, "ヒヒ・ボーンのLv1 BPは2000")
    assert(getCard(ARNOLD).levels[1]!.bp === 8000, "ディープ・アーノルドのLv2 BPは8000")
    assert(getCard(BANFA).levels[0]!.bp === 4000, "バン・ファローのLv1 BPは4000")
    assert(getCard(MEIL).levels[0]!.bp === 5000, "メイルシュトロムのLv1 BPは5000")
    assert(getCard(RAIN).levels[1]!.bp === 3000, "レイニードルのLv2 BPは3000")
}

// ════════ BS19-055 ペルーディア Lv2･Lv3: 【連鎖】を持つ自分のスピリットすべてに【聖命】を与える ════════
// 【聖命】＝アタックで相手のライフを減らしたとき、ボイドからコア1個を自分のライフに置く
console.log("=== 055: Lv2で【連鎖】持ち（ケファレダガー）のアタックがライフを減らすと自分のライフが増える ===")
scenario({
    name: "ペルーディア-連鎖持ちに聖命",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: PERUDIA, cores: 2 }, { card: KEFAL, cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ケファレダガー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ケファレダガー.疲労: false → true",
        "自分.ライフ: 5 → 6", // 付与された【聖命】でボイドから自分のライフへ
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ════════ BS19-059 光の戦士ガイウス Lv1【強化】: 相手へのデッキ破棄効果の枚数を+1枚 ════════
console.log("=== 059: 【強化】持ちがいると【粉砕】(Lv1=1枚)のデッキ破棄が2枚になる ===")
scenario({
    name: "ガイウス-強化でデッキ破棄2枚",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: GAIUS, cores: 1 }, { card: TOWERGOLEM, cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("タワー・ゴレム") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.タワー・ゴレム.疲労: false → true",
        "相手.デッキ枚数: 40 → 38", // 【粉砕】1枚＋【強化】1枚
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ════════ BS19-061 光の闘士ランダル Lv1･Lv2【強化】 ════════
console.log("=== 061: 【強化】持ちがいると【粉砕】(Lv1=1枚)のデッキ破棄が2枚になる ===")
scenario({
    name: "ランダル-強化でデッキ破棄2枚",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: RANDAL, cores: 1 }, { card: TOWERGOLEM, cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("タワー・ゴレム") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.タワー・ゴレム.疲労: false → true",
        "相手.デッキ枚数: 40 → 38",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ════════ BS19-069 ヒヒ・ボーン 【合体中】【呪撃】: バトル解決時にブロックしていた相手1体をバトル終了時に破壊 ════════
console.log("=== 069: 合体中のアタックにBP8000でブロックされても、ブロッカーが【呪撃】で破壊される ===")
scenario({
    name: "ヒヒボーン-呪撃でブロッカー破壊",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: JEFFREY, cores: 1 }], hand: [HIHI], reserve: 10 },
        opp: { spirits: [{ card: ARNOLD, cores: 5 }], reserve: 10 },
    },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("槍兵のジェフリー") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("槍兵のジェフリー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ディープ・アーノルド") })
        t.closeFlash()
    },
    expect: [
        "自分.トラッシュのコア: 0 → 3",
        "自分.槍兵のジェフリー.場所: フィールド → なし", // 合体BP4000 は BP8000 にバトルで負ける
        "相手.ディープ・アーノルド.場所: フィールド → なし", // 【呪撃】でバトル終了時に破壊
        "相手.トラッシュ: なし → ディープ・アーノルド",
        "相手.リザーブ: 10 → 15",
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュ: なし → 槍兵のジェフリー",
        "自分.ヒヒ・ボーン.BP: なし → 2000",
        "自分.ヒヒ・ボーン.Lv: なし → 1",
        "自分.ヒヒ・ボーン.コア: なし → 1",
        "自分.ヒヒ・ボーン.場所: なし → フィールド",
        "自分.ヒヒ・ボーン.疲労: なし → true",
        "自分.リザーブ: 10 → 7",
        "自分.手札: ヒヒ・ボーン → ロクケラトプス",
    ],
})

// ════════ BS19-079 星見の三連塔 Lv2: 星竜が相手のスピリットを破壊したらトラッシュのブレイヴ1枚を手札に戻す ════════
console.log("=== 079: Lv2で星竜（レイニードル）がバトル破壊したらトラッシュのブレイヴを手札に戻す ===")
scenario({
    name: "三連塔-星竜破壊でブレイヴ回収",
    start: {
        turn: "me", phase: "attack",
        me: { nexuses: [{ card: TOWER, label: "三連塔", cores: 2 }], spirits: [{ card: RAIN, cores: 2 }], trash: [GEPA] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("レイニードル") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.レイニードル.疲労: false → true",
        "自分.トラッシュ: 骸戦車ゲパルバート → なし",
        "自分.手札: なし → 骸戦車ゲパルバート",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ════════ BS19-081 剥がれ落ちるウロコ山 Lv2『自分のアタックステップ』: 【連鎖】持ちすべてをBP+3000 ════════
console.log("=== 081: Lv2のアタックステップで【連鎖】持ちがBP+3000され、BP5000のブロッカーを破壊する ===")
scenario({
    name: "ウロコ山-Lv2で連鎖持ちがBP5000のブロッカーを破壊",
    start: {
        turn: "me", phase: "attack",
        me: { nexuses: [{ card: SCALE, label: "ウロコ山", cores: 1 }], spirits: [{ card: KEFAL, cores: 1 }] },
        opp: { spirits: [{ card: DIMETRO, cores: 2 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ケファレダガー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ディメトロドロン") })
        t.closeFlash()
    },
    expect: [
        "自分.ケファレダガー.疲労: false → true",
        "相手.ディメトロドロン.場所: フィールド → なし", // 6000 対 5000 で勝つ
        "相手.トラッシュ: なし → ディメトロドロン",
        "相手.リザーブ: 10 → 12",
    ],
})

// ════════ BS19-084 命の蝋燭塔 Lv1･Lv2: 【連鎖】持ちが相手の効果で破壊されたら相手の手札1枚を破棄 ════════
console.log("=== 084: 【連鎖】持ちがフレイムガストで破壊されたら相手は手札1枚を破棄する ===")
scenario({
    name: "蝋燭塔-連鎖持ち破壊で相手手札破棄",
    start: {
        turn: "me", phase: "attack",
        me: { nexuses: [{ card: CANDLE, label: "蝋燭塔", cores: 0 }], spirits: [{ card: KEFAL, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1, rested: true }], hand: [GUST, VANILLA], reserve: 10 },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ケファレダガー") })
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ケファレダガー") })
        t.closeFlash()
    },
    expect: [
        "自分.ケファレダガー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ケファレダガー",
        "自分.リザーブ: 10 → 11",
        "相手.手札: フレイムガスト、ロクケラトプス → なし", // 使用1枚＋蝋燭塔で破棄1枚
        "相手.トラッシュ: なし → フレイムガスト、ロクケラトプス",
        "相手.トラッシュのコア: 0 → 5", // フレイムガストのコスト6（赤シンボル1つで軽減1）
        "相手.リザーブ: 10 → 5",
    ],
})

// ════════ BS19-090 凍てつくつららの逆塔 Lv2: 【連鎖】持ちが相手の効果で破壊されたら破壊された自分のスピリット1体を手札に戻す ════════
console.log("=== 090: Lv2で【連鎖】持ちが破壊されたら、そのスピリットが手札に戻る ===")
scenario({
    name: "逆塔-連鎖持ち破壊で手札に戻す",
    start: {
        turn: "me", phase: "attack",
        me: { nexuses: [{ card: ICETOWER, label: "逆塔", cores: 2 }], spirits: [{ card: KEFAL, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1, rested: true }], hand: [GUST], reserve: 10 },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ケファレダガー") })
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ケファレダガー") })
        t.closeFlash()
    },
    expect: [
        "自分.ケファレダガー.場所: フィールド → なし",
        "自分.手札: なし → ケファレダガー", // 破壊されたスピリットが手札に戻る（トラッシュへは行かない）
        "自分.リザーブ: 10 → 11",
        "相手.手札: フレイムガスト → なし",
        "相手.トラッシュ: なし → フレイムガスト",
        "相手.トラッシュのコア: 0 → 5",
        "相手.リザーブ: 10 → 5",
    ],
})

// ════════ BS19-099 フレイムフィールド: お互いの効果でフィールドから手札/デッキに戻らない ════════
console.log("=== 099: フィールドに置いている間は相手のバウンス（ドリームリボン）で手札に戻らない ===")
scenario({
    name: "フレイムフィールド-バウンス無効",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: DIMETRO, cores: 1 }], hand: [FLAMEFIELD], reserve: 10 },
        opp: { hand: [DREAMRIBBON], reserve: 10 },
    },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ディメトロドロン") })
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ディメトロドロン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 6", // フレイムフィールドのコスト5（赤シンボル1つで軽減1）
        "自分.トラッシュのコア: 0 → 4",
        "自分.手札: フレイムフィールド → なし",
        "自分.ディメトロドロン.疲労: false → true", // 手札には戻らずアタックが通る
        "相手.リザーブ: 10 → 7", // ドリームリボンのコスト4（白シンボルなし）＋ライフのコア1個
        "相手.トラッシュのコア: 0 → 4",
        "相手.手札: ドリームリボン → なし",
        "相手.トラッシュ: なし → ドリームリボン",
        "相手.ライフ: 5 → 4",
    ],
})

// ════════ BS19-112 オーシャンフィールド: 自分のトラッシュにあるカードを手札に加えられない ════════
console.log("=== 112: フィールドに置いている間はトラッシュのカードを手札に戻すマジックが効かない ===")
scenario({
    name: "オーシャンフィールド-トラッシュ回収禁止",
    start: {
        turn: "me", phase: "main",
        me: {
            spirits: [{ card: VANILLA, cores: 1 }, { card: JEFFREY, cores: 1 }],
            hand: [OCEANFIELD, CALLOFLOST],
            trash: [VANILLA],
            reserve: 10,
        },
    },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0 }) // オーシャンフィールド（場に残る）
        t.act("me", { type: "castMagic", handIndex: 0 }) // コールオブロスト（赤シンボルがあるので使用可）
    },
    expect: [
        "自分.手札: オーシャンフィールド、コールオブロスト → なし",
        "自分.リザーブ: 10 → 5", // オーシャンフィールド2（青軽減1）＋コールオブロスト3（赤軽減1）
        "自分.トラッシュのコア: 0 → 5",
        "自分.トラッシュ: ロクケラトプス → コールオブロスト、ロクケラトプス", // トラッシュのスピリットは戻せない
    ],
})

// ════════ BS19-X03 黒蟲魔王ディアボリカ・マンティス Lv2: このスピリットと【神速】持ちのアタックで
//          相手のライフを減らしたとき、相手のライフのコア1個を相手のリザーブに置く ════════
console.log("=== X03: Lv2で【神速】持ち（マッハジー）のアタックがライフを減らすと、もう1個ライフのコアがリザーブへ ===")
scenario({
    name: "マンティス-神速持ちのアタックでライフ2減",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: MANTIS, cores: 3 }, { card: MACH, cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ダーク・マッハジー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ダーク・マッハジー.疲労: false → true",
        "相手.ライフ: 5 → 3", // アタックで1個＋マンティスの効果で1個
        "相手.リザーブ: 10 → 12",
    ],
})

// ════════ BS19-X08 蒼海の大剣メイルシュトロム Lv1【強化】 ════════
console.log("=== X08-1: ブレイヴをスピリットとして場に出していても【強化】でデッキ破棄が+1枚 ===")
scenario({
    name: "メイルシュトロム-強化でデッキ破棄2枚",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: MEIL, cores: 1 }, { card: TOWERGOLEM, cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("タワー・ゴレム") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.タワー・ゴレム.疲労: false → true",
        "相手.デッキ枚数: 40 → 38",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ════════ BS19-X08 【合体時】【強襲：1】: ネクサス1つを疲労させることで回復する ════════
console.log("=== X08-2: 合体時のアタックで【強襲：1】によりネクサスを疲労させて回復する ===")
scenario({
    name: "メイルシュトロム-強襲で回復",
    start: {
        turn: "me", phase: "main",
        me: {
            spirits: [{ card: BANFA, cores: 1 }],
            nexuses: [{ card: ICETOWER, label: "逆塔", cores: 0 }],
            hand: [MEIL],
            reserve: 10,
        },
    },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("戦闘獣バン・ファロー") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("戦闘獣バン・ファロー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 蒼海の大剣メイルシュトロム → なし",
        "自分.リザーブ: 10 → 5", // コスト6（青シンボル1つで軽減1）
        "自分.トラッシュのコア: 0 → 5",
        "自分.蒼海の大剣メイルシュトロム.場所: なし → 合体",
        "自分.蒼海の大剣メイルシュトロム.疲労: なし → false",
        "自分.蒼海の大剣メイルシュトロム.コア: なし → 0",
        "自分.蒼海の大剣メイルシュトロム.Lv: なし → 1",
        "自分.戦闘獣バン・ファロー.BP: 4000 → 9000", // 合体時 BP+5000
        "自分.逆塔.疲労: false → true", // 【強襲：1】のコスト
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part743）")
