// smoke パート731（BS19 赤 079・080・081・097・098・099・X01：効果文どおりの場面テスト。実装前なので落ちてよい）
// 解釈は docs/design/BS19_PLAN.md §2（Q&A 確定分）・docs/design/SEMANTICS_AUDIT.md §3.23〜3.25・docs/design/CONJUNCTION.md に従う。
// 【強化】の行そのもの（BP破壊上限+1000 等）は part726 が見るので、ここでは「【強化】を持つスピリット」という条件だけを見る。
// 【連鎖】は連鎖元のあと、条件のシンボルがあるとき／無いときの両方を見る。
// 場に残るマジック（BS19-099）は、フィールドに置かれている間は中身の効果（疲労防止）が効き、
// 破棄の条件（自分のスピリットが相手の効果で破壊された）でトラッシュへ行って効果が止まる、の2場面を書く。
// 注意: 【強化】・【連鎖】を持つスピリットは BS19 にしか存在しないので、それらの条件を見る場面では
// BS19-017 サイドロン（【強化】Lv2-3）・BS19-006 ケファレダガー（【連鎖】）を素材として使う。
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

// ── 主役（BS19 赤 7枚） ──
const TOWER = "BS19-079" // 星見の三連塔（ネクサス・赤・コスト4）
const VOLCANO = "BS19-080" // 両断された活火山（ネクサス・赤・コスト4）
const SCALE = "BS19-081" // 剥がれ落ちるウロコ山（ネクサス・赤/紫・コスト5）
const AURA = "BS19-097" // チャージオーラ（マジック・赤・コスト3）
const RAY = "BS19-098" // レッドレイ（マジック・赤・コスト5）
const FLAMEFIELD = "BS19-099" // フレイムフィールド（マジック・赤・コスト5）
const STARB = "BS19-X01" // 十剣聖スターブレード・ドラゴン（赤・コスト8・剣使/星竜）

// ── 素材 ──
const SIDE = "BS19-017" // 大蛇サイドロン（紫・コスト4・【強化】Lv2-3・Lv2 BP5000）
const KEFAL = "BS19-006" // ケファレダガー（赤・コスト4・地竜・【連鎖】・Lv1 BP3000）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・Lv1 BP1000/Lv2 BP3000）
const DIMETRO = "BS05-003" // ディメトロドロン（赤・コスト3・地竜・Lv1 BP3000/Lv2 BP5000）
const RAIN = "BS07-001" // レイニードル（赤・コスト1・星竜・Lv2 BP3000）
const GIGANOT = "BS06-012" // 巨竜ギガノトン（赤・コスト7・地竜・Lv3 BP9000）
const TORNADO = "BS10-009" // トルネードラ（赤・コスト6・星竜・Lv1 BP5000）
const PAKI = "BS11-005" // 頭竜人パキケファロン（赤・コスト4・地竜/竜人・Lv2 BP6000）
const PENTA = "BS14-008" // ペンタケラトップ（赤・コスト5・地竜・Lv2 BP7000）
const APOLLO = "BS11-X01" // 太陽神龍ライジング・アポロドラゴン（赤・コスト7・星竜・Lv3 BP11000）
const ASURA = "BS10-X01" // 幻羅星龍ガイ・アスラ（赤・コスト10・星竜・Lv3 BP13000）
const SANDMAN = "BS05-010" // サンドマン（紫・コスト1・バニラ・シンボル紫）
const GUST = "BS09-069" // フレイムガスト（赤マジック・コスト6・BP6000以下を破壊）
const ARDER = "BS17-073" // アーダーフレイム（赤マジック・コスト4・BP4000以下を破壊）
const THORN = "BS06-100" // ソーンプリズン（緑マジック・コスト4・相手は相手のスピリット2体を疲労させる）
const BIND = "BS01-134" // バインディングソーン（緑マジック・コスト2・相手のスピリット1体を疲労させる）
const DRAKE = "BS18-055" // ドレイク・バヤー（赤ブレイヴ・コスト4・合体条件コスト4以上）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = (id: string) => getCard(id)
    const bp = (id: string, i: number) => getCard(id).levels[i]!.bp
    assert(c(TOWER).name === "星見の三連塔" && c(TOWER).type === "nexus" && c(TOWER).cost === 4 && c(TOWER).colors.includes("red"), "TOWER は星見の三連塔（赤ネクサス・コスト4）")
    assert(c(VOLCANO).name === "両断された活火山" && c(VOLCANO).type === "nexus" && c(VOLCANO).cost === 4 && c(VOLCANO).colors.includes("red"), "VOLCANO は両断された活火山（赤ネクサス・コスト4）")
    assert(c(SCALE).name === "剥がれ落ちるウロコ山" && c(SCALE).type === "nexus" && c(SCALE).cost === 5 && c(SCALE).colors.includes("purple") && c(SCALE).symbol.includes("purple"), "SCALE は剥がれ落ちるウロコ山（赤/紫ネクサス・コスト5・紫シンボル持ち）")
    assert(c(AURA).name === "チャージオーラ" && c(AURA).type === "magic" && c(AURA).cost === 3 && c(AURA).colors.includes("red"), "AURA はチャージオーラ（赤マジック・コスト3）")
    assert(c(RAY).name === "レッドレイ" && c(RAY).type === "magic" && c(RAY).cost === 5 && c(RAY).colors.includes("red"), "RAY はレッドレイ（赤マジック・コスト5）")
    assert(c(FLAMEFIELD).name === "フレイムフィールド" && c(FLAMEFIELD).type === "magic" && c(FLAMEFIELD).cost === 5 && c(FLAMEFIELD).colors.includes("red"), "FLAMEFIELD はフレイムフィールド（赤マジック・コスト5）")
    assert(c(STARB).name === "十剣聖スターブレード・ドラゴン" && c(STARB).type === "spirit" && c(STARB).cost === 8 && c(STARB).family.includes("剣使") && c(STARB).family.includes("星竜"), "STARB は十剣聖スターブレード・ドラゴン（赤スピリット・コスト8・剣使/星竜）")
    assert(bp(STARB, 0) === 7000 && bp(STARB, 1) === 10000 && bp(STARB, 2) === 15000 && bp(STARB, 3) === 20000, "STARB のBPは 7000/10000/15000/20000")
    // 素材
    assert(c(SIDE).name === "大蛇サイドロン" && c(SIDE).type === "spirit" && c(SIDE).cost === 4 && c(SIDE).colors.includes("purple") && bp(SIDE, 1) === 5000, "SIDE は大蛇サイドロン（紫・コスト4・Lv2 BP5000・【強化】持ち）")
    assert(c(KEFAL).name === "ケファレダガー" && c(KEFAL).type === "spirit" && c(KEFAL).cost === 4 && c(KEFAL).colors.includes("red") && c(KEFAL).family.includes("地竜") && bp(KEFAL, 0) === 3000, "KEFAL はケファレダガー（赤・コスト4・地竜・Lv1 BP3000・【連鎖】持ち）")
    assert(c(VANILLA).name === "ロクケラトプス" && c(VANILLA).type === "spirit" && c(VANILLA).cost === 1 && c(VANILLA).family.includes("地竜") && bp(VANILLA, 0) === 1000 && bp(VANILLA, 1) === 3000, "VANILLA はロクケラトプス（赤・コスト1・地竜・Lv1 BP1000/Lv2 BP3000）")
    assert(c(DIMETRO).name === "ディメトロドロン" && c(DIMETRO).type === "spirit" && c(DIMETRO).cost === 3 && c(DIMETRO).family.includes("地竜") && bp(DIMETRO, 0) === 3000 && bp(DIMETRO, 1) === 5000, "DIMETRO はディメトロドロン（赤・コスト3・地竜・Lv1 BP3000/Lv2 BP5000）")
    assert(c(RAIN).name === "レイニードル" && c(RAIN).type === "spirit" && c(RAIN).cost === 1 && c(RAIN).family.includes("星竜") && bp(RAIN, 1) === 3000, "RAIN はレイニードル（赤・コスト1・星竜・Lv2 BP3000）")
    assert(c(GIGANOT).name === "巨竜ギガノトン" && c(GIGANOT).type === "spirit" && c(GIGANOT).cost === 7 && bp(GIGANOT, 2) === 9000, "GIGANOT は巨竜ギガノトン（赤・コスト7・Lv3 BP9000）")
    assert(c(TORNADO).name === "トルネードラ" && c(TORNADO).type === "spirit" && c(TORNADO).cost === 6 && bp(TORNADO, 0) === 5000, "TORNADO はトルネードラ（赤・コスト6・Lv1 BP5000）")
    assert(c(PAKI).name === "頭竜人パキケファロン" && c(PAKI).type === "spirit" && c(PAKI).cost === 4 && bp(PAKI, 1) === 6000, "PAKI は頭竜人パキケファロン（赤・コスト4・Lv2 BP6000）")
    assert(c(PENTA).name === "ペンタケラトップ" && c(PENTA).type === "spirit" && c(PENTA).cost === 5 && bp(PENTA, 1) === 7000, "PENTA はペンタケラトップ（赤・コスト5・Lv2 BP7000）")
    assert(c(APOLLO).name === "太陽神龍ライジング・アポロドラゴン" && c(APOLLO).type === "spirit" && c(APOLLO).cost === 7 && bp(APOLLO, 2) === 11000, "APOLLO は太陽神龍ライジング・アポロドラゴン（赤・コスト7・Lv3 BP11000）")
    assert(c(ASURA).name === "幻羅星龍ガイ・アスラ" && c(ASURA).type === "spirit" && c(ASURA).cost === 10 && bp(ASURA, 2) === 13000, "ASURA は幻羅星龍ガイ・アスラ（赤・コスト10・Lv3 BP13000）")
    assert(c(SANDMAN).name === "サンドマン" && c(SANDMAN).type === "spirit" && c(SANDMAN).cost === 1 && c(SANDMAN).colors.includes("purple") && c(SANDMAN).symbol.includes("purple"), "SANDMAN はサンドマン（紫・コスト1・シンボル紫）")
    assert(c(GUST).name === "フレイムガスト" && c(GUST).type === "magic" && c(GUST).cost === 6, "GUST はフレイムガスト（赤マジック・コスト6）")
    assert(c(ARDER).name === "アーダーフレイム" && c(ARDER).type === "magic" && c(ARDER).cost === 4, "ARDER はアーダーフレイム（赤マジック・コスト4）")
    assert(c(THORN).name === "ソーンプリズン" && c(THORN).type === "magic" && c(THORN).cost === 4, "THORN はソーンプリズン（緑マジック・コスト4）")
    assert(c(BIND).name === "バインディングソーン" && c(BIND).type === "magic" && c(BIND).cost === 2, "BIND はバインディングソーン（緑マジック・コスト2）")
    assert(c(DRAKE).name === "ドレイク・バヤー" && c(DRAKE).type === "brave" && c(DRAKE).cost === 4, "DRAKE はドレイク・バヤー（赤ブレイヴ・コスト4）")
}

// ════════ BS19-079 星見の三連塔 ════════
// Lv1･Lv2『自分のアタックステップ』【強化】を持つコスト2以上の自分のスピリットがアタックしたとき、1枚ドロー
console.log("=== 079-1: 【強化】持ち（コスト4）のアタックでドロー ===")
scenario({
    name: "三連塔-強化アタックでドロー",
    start: {
        turn: "me", phase: "attack",
        me: { nexuses: [{ card: TOWER, label: "三連塔" }], spirits: [{ card: SIDE, cores: 3 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("大蛇サイドロン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.大蛇サイドロン.疲労: false → true",
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 079-2: 【強化】を持たないコスト3のアタックではドローしない ===")
scenario({
    name: "三連塔-非強化はドローなし",
    start: {
        turn: "me", phase: "attack",
        me: { nexuses: [{ card: TOWER, label: "三連塔" }], spirits: [{ card: DIMETRO, cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ディメトロドロン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ディメトロドロン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// Lv2『自分のアタックステップ』系統：「星竜」を持つ自分のスピリットが相手のスピリットを破壊したとき、トラッシュのブレイヴ1枚を手札に戻す
console.log("=== 079-3: 星竜がバトルで破壊したらトラッシュのブレイヴを手札に戻す（Lv2） ===")
scenario({
    name: "三連塔-星竜破壊でブレイヴ回収",
    start: {
        turn: "me", phase: "attack",
        me: { nexuses: [{ card: TOWER, label: "三連塔", cores: 2 }], spirits: [{ card: RAIN, cores: 2 }], trash: [DRAKE] },
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
        "自分.トラッシュ: ドレイク・バヤー → なし",
        "自分.手札: なし → ドレイク・バヤー",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 079-4: ネクサスLv1では破壊しても戻らない（条件はLv2） ===")
scenario({
    name: "三連塔-Lv1は回収なし",
    start: {
        turn: "me", phase: "attack",
        me: { nexuses: [{ card: TOWER, label: "三連塔", cores: 0 }], spirits: [{ card: RAIN, cores: 2 }], trash: [DRAKE] },
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
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ════════ BS19-080 両断された活火山 ════════
// Lv1･Lv2: 系統：「地竜」を持つ自分のスピリットすべてに【激突】を与える（相手は可能ならば必ずブロックする）
console.log("=== 080-1: 地竜のアタックに【激突】＝ブロックできる相手はブロックして破壊される ===")
scenario({
    name: "活火山-激突で強制ブロック",
    start: {
        turn: "me", phase: "attack",
        me: { nexuses: [{ card: VOLCANO, label: "活火山", cores: 0 }], spirits: [{ card: DIMETRO, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ディメトロドロン") })
        t.closeFlash()
        // 【激突】がある間は、ブロックできる相手がいる限りライフを取ることができない
        t.actRejected("opp", { type: "takeLife" })
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    expect: [
        "自分.ディメトロドロン.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 080-2: ネクサスが無ければ（条件を1つ外す）ブロックされず素通り ===")
scenario({
    name: "活火山-激突なしは素通り",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: DIMETRO, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ディメトロドロン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ディメトロドロン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
// Lv2『自分のアタックステップ』地竜がアタックしたとき、そのスピリットと同じBPの相手のスピリット1体を破壊する
console.log("=== 080-3: 地竜のアタックで同じBP（3000）の相手を破壊する（Lv2） ===")
scenario({
    name: "活火山-同BP破壊",
    start: {
        turn: "me", phase: "attack",
        me: { nexuses: [{ card: VOLCANO, label: "活火山", cores: 2 }], spirits: [{ card: DIMETRO, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 2, rested: true }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ディメトロドロン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ディメトロドロン.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 13",
        "相手.ライフ: 5 → 4",
    ],
})
console.log("=== 080-4: ネクサスLv1では同じBPでも破壊しない（条件はLv2） ===")
scenario({
    name: "活火山-Lv1は同BP破壊なし",
    start: {
        turn: "me", phase: "attack",
        me: { nexuses: [{ card: VOLCANO, label: "活火山", cores: 0 }], spirits: [{ card: DIMETRO, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 2, rested: true }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ディメトロドロン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ディメトロドロン.疲労: false → true",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// ════════ BS19-081 剥がれ落ちるウロコ山 ════════
// Lv1･Lv2『自分のアタックステップ』【連鎖】を持つ自分のスピリットが相手の効果で破壊された/手札に戻ったとき、相手のスピリット1体を破壊する
console.log("=== 081-1: 自分のアタックステップ中に【連鎖】持ちが相手の効果で破壊されたら相手のスピリットを破壊する ===")
scenario({
    name: "ウロコ山-連鎖持ち破壊で報復",
    start: {
        turn: "me", phase: "attack",
        me: { nexuses: [{ card: SCALE, label: "ウロコ山", cores: 0 }], spirits: [{ card: KEFAL, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1, rested: true }], hand: [GUST] },
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
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → フレイムガスト、ロクケラトプス",
        "相手.トラッシュのコア: 0 → 5",
        "相手.リザーブ: 10 → 6",
        "相手.手札: フレイムガスト → なし",
    ],
})
console.log("=== 081-2: 破壊されたのが【連鎖】持ちでなければ報復しない ===")
scenario({
    name: "ウロコ山-非連鎖は報復なし",
    start: {
        turn: "me", phase: "attack",
        me: { nexuses: [{ card: SCALE, label: "ウロコ山", cores: 0 }], spirits: [{ card: DIMETRO, cores: 1 }] },
        opp: { spirits: [{ card: VANILLA, cores: 1, rested: true }], hand: [GUST] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ディメトロドロン") })
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ディメトロドロン") })
        t.closeFlash()
    },
    expect: [
        "自分.ディメトロドロン.場所: フィールド → なし",
        "自分.トラッシュ: なし → ディメトロドロン",
        "自分.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → フレイムガスト",
        "相手.トラッシュのコア: 0 → 5",
        "相手.リザーブ: 10 → 5",
        "相手.手札: フレイムガスト → なし",
    ],
})
// Lv2『自分のアタックステップ』【連鎖】を持つ自分のスピリットすべてをBP+3000する（継続。Lv1→Lv2に上げて観察）
console.log("=== 081-3: Lv2に上げると【連鎖】持ちすべてがBP+3000 ===")
scenario({
    name: "ウロコ山-Lv2で連鎖持ちBP3000",
    start: {
        turn: "me", phase: "main",
        me: { nexuses: [{ card: SCALE, label: "ウロコ山", cores: 0 }], spirits: [{ card: KEFAL, cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "moveCore", instanceId: t.id("ウロコ山"), direction: "add" })
    },
    expect: [
        "自分.リザーブ: 10 → 9",
        "自分.ウロコ山.コア: 0 → 1",
        "自分.ウロコ山.Lv: 1 → 2",
        "自分.ケファレダガー.BP: 3000 → 6000",
    ],
})
console.log("=== 081-4: 【連鎖】を持たないスピリットはBPが変わらない ===")
scenario({
    name: "ウロコ山-非連鎖はBP据え置き",
    start: {
        turn: "me", phase: "main",
        me: { nexuses: [{ card: SCALE, label: "ウロコ山", cores: 0 }], spirits: [{ card: DIMETRO, cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "moveCore", instanceId: t.id("ウロコ山"), direction: "add" })
    },
    expect: [
        "自分.リザーブ: 10 → 9",
        "自分.ウロコ山.コア: 0 → 1",
        "自分.ウロコ山.Lv: 1 → 2",
    ],
})

// ════════ BS19-097 チャージオーラ ════════
// フラッシュ: このターンの間、アタックしている自分のスピリットすべてをBP+1000。さらに、アタックしている【強化】を持つ自分のスピリットすべてをBP+3000
console.log("=== 097-1: アタック中の【強化】持ちに +1000＋3000 の計+4000 ===")
scenario({
    name: "チャージオーラ-強化持ち+4000",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: SIDE, cores: 3 }], hand: [AURA] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("大蛇サイドロン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.大蛇サイドロン.疲労: false → true",
        "自分.大蛇サイドロン.BP: 5000 → 9000",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: チャージオーラ → なし",
        "自分.トラッシュ: なし → チャージオーラ",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("=== 097-2: 【強化】を持たなければ +1000 だけ ===")
scenario({
    name: "チャージオーラ-非強化+1000",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: DIMETRO, cores: 1 }], hand: [AURA] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ディメトロドロン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ディメトロドロン.疲労: false → true",
        "自分.ディメトロドロン.BP: 3000 → 4000",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: チャージオーラ → なし",
        "自分.トラッシュ: なし → チャージオーラ",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ════════ BS19-098 レッドレイ ════════
// フラッシュ: BP5000以下の相手のスピリット1体を破壊。さらに【連鎖：条件《紫シンボル》】[紫]: 疲労状態のコスト4以下の相手のスピリット1体を破壊
console.log("=== 098-1: 紫シンボルがあれば連鎖まで解決する（破壊された個体のソウルコアはリザーブへ） ===")
scenario({
    name: "レッドレイ-紫シンボルで連鎖",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: SANDMAN, cores: 1 }], hand: [RAY] },
        opp: {
            spirits: [
                { card: TORNADO, cores: 1 },
                { card: PAKI, cores: 3, rested: true },
            ],
            soulCore: "頭竜人パキケファロン",
        },
    },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.手札: レッドレイ → なし",
        "自分.トラッシュ: なし → レッドレイ",
        "相手.トルネードラ.場所: フィールド → なし",
        "相手.頭竜人パキケファロン.場所: フィールド → なし",
        "相手.トラッシュ: なし → トルネードラ、頭竜人パキケファロン",
        "相手.リザーブ: 10 → 14",
        "相手.ソウルコア: 頭竜人パキケファロン → リザーブ",
    ],
})
console.log("=== 098-2: 紫シンボルがなければ連鎖は解決しない ===")
scenario({
    name: "レッドレイ-紫なしは連鎖不発",
    start: {
        turn: "me", phase: "main",
        me: { hand: [RAY] },
        opp: {
            spirits: [
                { card: TORNADO, cores: 1 },
                { card: PAKI, cores: 3, rested: true },
            ],
        },
    },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.手札: レッドレイ → なし",
        "自分.トラッシュ: なし → レッドレイ",
        "相手.トルネードラ.場所: フィールド → なし",
        "相手.トラッシュ: なし → トルネードラ",
        "相手.リザーブ: 10 → 11",
    ],
})

// ════════ BS19-099 フレイムフィールド（場に残るマジック） ════════
// メイン: お互いのスピリットすべては、お互いの効果で、疲労せず、フィールドから手札/デッキに戻らず、入れ替わらない。
// このカードは自分のフィールドに置かれ、その間効果を発揮し続ける。自分のスピリットが相手の効果で破壊されたとき、このカードを破棄する。
// フラッシュ: このターンの間、スピリット1体をBP+3000する。
console.log("=== 099-1: フィールドに置いている間は相手の疲労効果が効かない ===")
scenario({
    name: "フレイムフィールド-疲労防止",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: DIMETRO, cores: 1 }, { card: VANILLA, cores: 1 }], hand: [FLAMEFIELD] },
        opp: { hand: [THORN] },
    },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ディメトロドロン") })
        t.act("opp", { type: "castMagic", handIndex: 0 })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: フレイムフィールド → なし",
        "自分.ディメトロドロン.疲労: false → true",
        "相手.リザーブ: 10 → 7",
        "相手.トラッシュのコア: 0 → 4",
        "相手.手札: ソーンプリズン → なし",
        "相手.トラッシュ: なし → ソーンプリズン",
        "相手.ライフ: 5 → 4",
    ],
})
console.log("=== 099-2: 自分のスピリットが相手の効果で破壊されたら破棄されてトラッシュへ、効果が止まる ===")
scenario({
    name: "フレイムフィールド-破壊で破棄され効果が止まる",
    start: {
        turn: "me", phase: "main",
        me: {
            spirits: [
                { card: VANILLA, cores: 1 },
                { card: PENTA, cores: 2 },
                { card: DIMETRO, cores: 2 },
            ],
            hand: [FLAMEFIELD],
        },
        opp: { hand: [ARDER, THORN] },
    },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0 })
        t.act("me", { type: "nextPhase" })
        // 1回目のアタック中に相手がロクケラトプスを効果で破壊 → フレイムフィールドが破棄される
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        // 2回目のアタック中はもう疲労防止が効いていない
        t.act("me", { type: "attack", instanceId: t.id("ペンタケラトップ") })
        t.act("opp", { type: "castMagic", handIndex: 0 })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 9",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: フレイムフィールド → なし",
        "自分.トラッシュ: なし → フレイムフィールド、ロクケラトプス",
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.ペンタケラトップ.疲労: false → true",
        "自分.ディメトロドロン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 3",
        "相手.トラッシュのコア: 0 → 8",
        "相手.手札: アーダーフレイム、ソーンプリズン → なし",
        "相手.トラッシュ: なし → アーダーフレイム、ソーンプリズン",
    ],
})
console.log("=== 099-3: フラッシュで使えば通常どおりトラッシュへ、スピリット1体をBP+3000 ===")
scenario({
    name: "フレイムフィールド-フラッシュでBP3000",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: DIMETRO, cores: 1 }], hand: [FLAMEFIELD] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ディメトロドロン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ディメトロドロン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.手札: フレイムフィールド → なし",
        "自分.トラッシュ: なし → フレイムフィールド",
        "自分.ディメトロドロン.疲労: false → true",
        "自分.ディメトロドロン.BP: 3000 → 6000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ════════ BS19-X01 十剣聖スターブレード・ドラゴン ════════
// Lv1-4『このスピリットのアタック時』最もBPの高い相手のスピリット1体を破壊する
console.log("=== X01-1: アタック時に最もBPの高い相手を破壊する（Lv1でも発動） ===")
scenario({
    name: "スターブレード-最高BP破壊",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: STARB, label: "スターブレード", cores: 1 }] },
        opp: { spirits: [{ card: GIGANOT, cores: 5, rested: true }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("スターブレード") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.スターブレード.疲労: false → true",
        "相手.巨竜ギガノトン.場所: フィールド → なし",
        "相手.トラッシュ: なし → 巨竜ギガノトン",
        "相手.リザーブ: 10 → 16",
        "相手.ライフ: 5 → 4",
    ],
})
// Lv2-4『このスピリットのアタック時』このスピリットをBP+5000する（期間の書かれていないBP+はバトルの間だけ）
console.log("=== X01-2: Lv2のアタック中はBP+5000（BP11000のブロッカーを返り討ちにする） ===")
scenario({
    name: "スターブレード-Lv2アタックでBP5000",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: STARB, label: "スターブレード", cores: 3 }] },
        opp: {
            spirits: [
                { card: ASURA, cores: 6, rested: true },
                { card: APOLLO, cores: 5 },
            ],
        },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("スターブレード") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("太陽神龍ライジング・アポロドラゴン") })
        t.closeFlash()
    },
    expect: [
        "自分.スターブレード.疲労: false → true",
        "相手.幻羅星龍ガイ・アスラ.場所: フィールド → なし",
        "相手.太陽神龍ライジング・アポロドラゴン.場所: フィールド → なし",
        "相手.トラッシュ: なし → 太陽神龍ライジング・アポロドラゴン、幻羅星龍ガイ・アスラ",
        "相手.リザーブ: 10 → 21",
    ],
})
console.log("=== X01-3: Lv1ではBP+5000が無いのでBP11000のブロッカーに敗れる（条件はLv2） ===")
scenario({
    name: "スターブレード-Lv1はBP5000なし",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: STARB, label: "スターブレード", cores: 1 }] },
        opp: {
            spirits: [
                { card: ASURA, cores: 6, rested: true },
                { card: APOLLO, cores: 5 },
            ],
        },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("スターブレード") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("太陽神龍ライジング・アポロドラゴン") })
        t.closeFlash()
    },
    expect: [
        "自分.スターブレード.場所: フィールド → なし",
        "自分.トラッシュ: なし → 十剣聖スターブレード・ドラゴン",
        "自分.リザーブ: 10 → 11",
        "相手.幻羅星龍ガイ・アスラ.場所: フィールド → なし",
        "相手.トラッシュ: なし → 幻羅星龍ガイ・アスラ",
        "相手.リザーブ: 10 → 16",
        "相手.太陽神龍ライジング・アポロドラゴン.疲労: false → true",
    ],
})
// 【合体中】Lv3-4『このスピリットのアタック時』BP7000以下の相手のスピリット1体を破壊する。
// この効果でコスト6以上のスピリットを破壊したとき、相手のライフのコア1個を相手のリザーブに置く。
console.log("=== X01-4: 合体中Lv3のアタックでBP7000以下を破壊し、コスト6以上ならライフのコアをリザーブへ ===")
scenario({
    name: "スターブレード-合体中でBP7000破壊とライフ",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: STARB, label: "スターブレード", cores: 4 }], hand: [DRAKE] },
        opp: {
            spirits: [
                { card: GIGANOT, cores: 5, rested: true },
                { card: TORNADO, cores: 1, rested: true },
            ],
        },
    },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("スターブレード") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("スターブレード") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: ドレイク・バヤー → なし",
        "自分.ドレイク・バヤー.場所: なし → 合体",
        "自分.ドレイク・バヤー.疲労: なし → false",
        "自分.ドレイク・バヤー.コア: なし → 0",
        "自分.ドレイク・バヤー.Lv: なし → 1",
        "自分.スターブレード.BP: 15000 → 18000",
        "自分.スターブレード.疲労: false → true",
        "相手.巨竜ギガノトン.場所: フィールド → なし",
        "相手.トルネードラ.場所: フィールド → なし",
        "相手.トラッシュ: なし → トルネードラ、巨竜ギガノトン",
        // 合体スピリットのシンボルはホスト＋ブレイヴの計2つなので、貫通ダメージは2。C3でライフのコア1個がリザーブへ
        "相手.ライフ: 5 → 2",
        "相手.リザーブ: 10 → 19",
    ],
})
console.log("=== X01-5: 合体していなければBP7000以下の破壊は起きない（条件は【合体中】） ===")
scenario({
    name: "スターブレード-非合体はBP7000破壊なし",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: STARB, label: "スターブレード", cores: 4 }] },
        opp: {
            spirits: [
                { card: GIGANOT, cores: 5, rested: true },
                { card: TORNADO, cores: 1, rested: true },
            ],
        },
    },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("スターブレード") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.スターブレード.疲労: false → true",
        "相手.巨竜ギガノトン.場所: フィールド → なし",
        "相手.トラッシュ: なし → 巨竜ギガノトン",
        "相手.リザーブ: 10 → 16",
        "相手.ライフ: 5 → 4",
    ],
})
console.log("=== X01-6: 破壊したのがコスト6未満ならライフのコアは動かない（条件はコスト6以上） ===")
scenario({
    name: "スターブレード-コスト6未満はライフなし",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: STARB, label: "スターブレード", cores: 4 }], hand: [DRAKE] },
        opp: {
            spirits: [
                { card: GIGANOT, cores: 5, rested: true },
                { card: DIMETRO, cores: 1, rested: true },
            ],
        },
    },
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("スターブレード") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("スターブレード") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: ドレイク・バヤー → なし",
        "自分.ドレイク・バヤー.場所: なし → 合体",
        "自分.ドレイク・バヤー.疲労: なし → false",
        "自分.ドレイク・バヤー.コア: なし → 0",
        "自分.ドレイク・バヤー.Lv: なし → 1",
        "自分.スターブレード.BP: 15000 → 18000",
        "自分.スターブレード.疲労: false → true",
        "相手.巨竜ギガノトン.場所: フィールド → なし",
        "相手.ディメトロドロン.場所: フィールド → なし",
        "相手.トラッシュ: なし → ディメトロドロン、巨竜ギガノトン",
        // 破壊したディメトロドロンはコスト3なのでライフのコアは動かない。貫通ダメージは合体の2シンボルぶん
        "相手.リザーブ: 10 → 18",
        "相手.ライフ: 5 → 3",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part731）")
