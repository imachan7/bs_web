/**
 * 効果「意味」照合スクリプト（軸: S1〜S5）
 *
 * scripts/check-effect-gaps.ts は「効果を書き忘れた」（テキストのブロック数 vs
 * effects[] のエントリ数）を検出するが、「書いてあるが解釈が間違っている」は検出できない。
 * 例: SD01-028 呪われし神殿Lv2「相手のスピリットが疲労したとき、自分はデッキから1枚ドローする」が
 *     実装では相手がドローしていた（typecheck / smoke は全緑のまま2日間見過ごされた）。
 *
 * このスクリプトは、テキスト側の言い回しと実装側にあるべきフィールドを軸ごとに照合し、
 * 食い違いの疑いを一覧で出す。**修正はしない（報告のみ）**。ベースライン機構も持たない。
 *
 * 検査する軸:
 *   S1 回数制限: 「ターンに1回」「ゲーム中に1回」「1回だけ」 vs oncePerTurn/oncePerBattle/oncePerGame/
 *                restriction:"oncePerTurnAll"
 *   S2 コスト:   「〜することで」「〜することによって」 vs cost で始まるキー
 *   S3 任意性:   文末が「〜できる。」 vs optional:true / chooserIsTarget:true
 *   S4 タイミング: 見出しの『自分のアタックステップ』等 vs phase/turn/phaseTurn/step
 *   S5 数値:     節中の数値（N枚/N個/N体/BP+N/コストN以下） vs 対応するレベル群の数値フィールド
 *
 * 誤検出を減らす前処理（これが無いと166件中ほとんどが誤検出になる）:
 *   1. キーワードの定型説明文を落とす（頻度ベース: 同一文が3枚以上のカードの【…】直後に現れるもの）
 *   2. 引用された効果文（“…”/"…"）を落とす（他カードへ与える効果の本文なので対象外）
 *   3. 軸ごとの等価表現をコードに理由つきで持つ（下記 EQUIVALENCE コメント参照）
 *
 * 使い方:
 *   npx tsx scripts/check-effect-semantics.ts [--json] [--card BS01-104] [--axis S1]
 */

import { loadAllCards } from "../data/loadCards"

// ---- 型（cards.json の最小構造だけ。effects[] の中身は軸によって形が違うので unknown で扱う） ----
interface Card {
    cardId: string
    name: string
    type: string
    effect: string
    effects: Record<string, unknown>[]
    levels?: { level: number; cores: number; bp: number }[]
}

// ---- 引数 ----
const args = process.argv.slice(2)
const jsonOutput = args.includes("--json")
const cardFilter = args.includes("--card") ? args[args.indexOf("--card") + 1] : null
const axisFilter = args.includes("--axis") ? args[args.indexOf("--axis") + 1] : null

const cards = loadAllCards() as unknown as Card[]

// ============================================================
// 前処理1: キーワードの定型説明文を頻度ベースで検出する
// ============================================================
// 「【神速】…することで召喚できる。」のような、キーワードの効果を持つカードなら
// 毎回同じ文言が入る定型説明を、ハードコードの一覧ではなく
// 「同一の文が3枚以上のカードの【…】直後に現れる」という頻度基準で検出する。
// これなら新しいキーワードが増えても追随できる。
const BOILERPLATE_MIN_CARDS = 3

// 引用スパン（“…” / "…"）を除去する。他のスピリットに与える効果の本文
// （effectGrant/keywordGrant）なので、このカード自身の解釈判定の対象外
function stripQuotedSpans(text: string): string {
    return text
        .replace(/“[^”]*”/g, "") // “…”
        .replace(/"[^"]*"/g, "") // "…"
}

// 【…】の直後から次の「。」までを1文として取り出す
function extractPostKeywordSentences(text: string): string[] {
    const sentences: string[] = []
    const re = /【[^】]*】/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
        const rest = text.slice(re.lastIndex)
        const periodIdx = rest.indexOf("。")
        if (periodIdx === -1) continue
        const sentence = rest.slice(0, periodIdx + 1).replace(/\s+/g, "")
        if (sentence.length < 4) continue
        sentences.push(sentence)
    }
    return sentences
}

// 数字だけをプレースホルダに置き換えた「型」を頻度カウントのキーにする。
// 【不死：コスト6/7】のように、キーワードの説明文がカードごとに数値だけ変えたテンプレートで
// 埋め込まれているケースがあるため（BS09闇騎士シリーズの【不死】等）、数字の異同を無視して
// 同一テンプレートかどうかを判定する。マスク時に取り除くのは各カードの実テキスト（数字入り）のまま
const normalizeForFreq = (s: string) => s.replace(/\d+/g, "#")

// 文の型（数字を#に置換） -> それが現れたカードID集合
const sentenceSigToCards = new Map<string, Set<string>>()
for (const card of cards) {
    const text = stripQuotedSpans(card.effect || "")
    for (const s of extractPostKeywordSentences(text)) {
        const sig = normalizeForFreq(s)
        if (!sentenceSigToCards.has(sig)) sentenceSigToCards.set(sig, new Set())
        sentenceSigToCards.get(sig)!.add(card.cardId)
    }
}
const boilerplateSignatures = new Set(
    [...sentenceSigToCards.entries()].filter(([, cardIds]) => cardIds.size >= BOILERPLATE_MIN_CARDS).map(([sig]) => sig),
)
// 除外種類数の報告用（型の一覧）
const boilerplateSentences = [...boilerplateSignatures]

// マスク後のテキストを作る（引用除去 → 定型説明除去）。
// 定型説明は「\s+を除去した文字列」の**型（数字を#に置換したもの）**で判定し、
// 該当する範囲を元テキスト（数字入りの実文）から取り除く。
function maskText(rawText: string): string {
    let text = stripQuotedSpans(rawText)
    const re = /【[^】]*】/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
        const restStart = re.lastIndex
        const rest = text.slice(restStart)
        const periodIdx = rest.indexOf("。")
        if (periodIdx === -1) continue
        const candidate = rest.slice(0, periodIdx + 1).replace(/\s+/g, "")
        if (boilerplateSignatures.has(normalizeForFreq(candidate))) {
            text = text.slice(0, restStart) + text.slice(restStart + periodIdx + 1)
            re.lastIndex = restStart // 削除後の位置から再走査
        }
    }
    return text
}

// ============================================================
// 汎用ヘルパー: effects[] を再帰的に走査する
// ============================================================
function walk(obj: unknown, visit: (key: string, value: unknown, node: Record<string, unknown>) => void): void {
    if (obj === null || typeof obj !== "object") return
    if (Array.isArray(obj)) {
        for (const item of obj) walk(item, visit)
        return
    }
    const node = obj as Record<string, unknown>
    for (const [key, value] of Object.entries(node)) {
        visit(key, value, node)
        walk(value, visit)
    }
}

// ============================================================
// 軸ごとの等価表現テーブル（実装側の判定）
// ============================================================

// S1: 「ターンに1回」等の実装側の印。
// restriction:"oncePerTurnAll" は kind:"magicRestriction" 専用のフィールドで、
// 「お互い、ターンに1回しかマジックの効果を使用できない」の実装形（BS03-079 作戦参謀フォクシン）。
// 文言としては「ターンに1回」を含むテキストと対応するので、等価表現として認める
function hasOncePerTurnEvidence(effects: Record<string, unknown>[]): boolean {
    let found = false
    for (const eff of effects) {
        walk(eff, (key, value) => {
            if (found) return
            if ((key === "oncePerTurn" || key === "oncePerBattle" || key === "oncePerGame") && value) {
                found = true
            }
            if (key === "restriction" && value === "oncePerTurnAll") {
                found = true
            }
        })
        if (found) break
    }
    return found
}

// 等価表現: 「〜することで」のコストが、汎用の cost* フィールドではなく
// **アクションの type 自体にコストが焼き込まれている**ものが多数ある（docs/design/COST_MODEL.md §4、
// および type.ts の各アクション定義コメントに「〜することで」「任意コスト」と明記されている）。
// 例: selfBuffByHandDiscard（城壊しのデニス／島持ちのフランシス＝手札破棄でBP+）、
//     targetNegateByHandDiscard（竜騎集う円卓＝手札1枚破棄で対象を防ぐ）、
//     summonCostHandDiscardPay（ビクティム＝召喚コストを手札破棄で）、
//     nexusCostMillPay（栄光の表彰台＝配置コストをデッキ破棄で）、
//     tenshoCoreSubstitute（ダークスカルデーモン＝疲労することでコアを置いたものとして扱う）
// これらは cost で始まる**キー名**を持たないため、type の**値**を別途チェックする
const COST_BAKED_ACTION_TYPES = new Set([
    "selfBuffByHandDiscard",
    "revealHandMagicToTegamotoDraw",
    "handMagicToTegamotoDraw",
    "selfBuffByExhaustFamily",
    "refreshSelfByDestroyFamily",
    "refreshSelfByReturnToDeckTopName",
    "discardHandNexusToVoidCoreSelf",
    "targetNegateByHandDiscard",
    "summonCostHandDiscardPay",
    "nexusCostMillPay",
    "coreRemovePerHandDiscard",
    "tenshoCoreSubstitute",
    "sacrificeNexusThenWipeEnemyNexusCores",
])

// S2: 「〜することで」等の実装側の印。cost で始まるキーはすべて対象
// （cost / costReserveToTrash / costSelfCoresToTrash / costReserveToVoid / costSelfCoresToVoid 等）。
// action.type の値が cost で始まる（costDiscardHandKeywordThenDraw 等）か、上記の焼き込み型一覧に
// 含まれる場合も等価表現として認める。
// ※ TargetFilter.cost（対象のコスト制限= 「コストN以下」の指定）も同じキー名 "cost" を使うため、
//    ここで拾ってしまう可能性がある。誤検出（本来コスト実装が無いのに「ある」と判定してしまう＝
//    見落とし方向）は許容し、過検出（本当は実装済みなのに「無い」と報告する）を避ける方針を優先する
function hasCostEvidence(effects: Record<string, unknown>[]): boolean {
    let found = false
    for (const eff of effects) {
        walk(eff, (key, value) => {
            if (found) return
            if (/^cost/.test(key)) found = true
            // action.type だけでなく、トップレベルの kind 自体がコスト焼き込み型のこともある
            // （BS04-088 栄光の表彰台＝kind:"nexusCostMillPay" 等）
            if ((key === "type" || key === "kind") && typeof value === "string" && (/^cost/i.test(value) || COST_BAKED_ACTION_TYPES.has(value))) {
                found = true
            }
        })
        if (found) break
    }
    return found
}

// S3: 「〜できる。」の実装側の印。optional:true が基本形。
// chooserIsTarget（相手が選ぶ＝プレイヤーに選ばせる印）も「できる」の変種として認める
// （CHOOSER_RULES.md 参照。ただし文言上は「相手は〜できる」のような形になる）
function hasOptionalEvidence(effects: Record<string, unknown>[]): boolean {
    let found = false
    for (const eff of effects) {
        walk(eff, (key, value) => {
            if (found) return
            if ((key === "optional" || key === "chooserIsTarget") && value === true) found = true
        })
        if (found) break
    }
    return found
}

// 等価表現: type.ts を確認すると `optional?` フィールドを持てる kind は
// triggered/step/battleWon/fieldEvent/reviveOnDestroy/deckMillNegate の6種だけで、
// constraint・keyword・levelAs・familyGrant・magicTargetRedirect・reductionGrant・
// magicFreeGrant・constraintGrant・colorAs・alsoCostGrant 等の「発生源が場にある間ずっと有効な
// 継続的な権限付与」は構造上 optional を持てない（「〜できる」は"許可"を表す定型文で、
// 効果解決のたびに選ぶ任意発揮ではない）。これらの kind しか無いカードに「できる。」があっても
// 実装側に対応するフィールドが存在しえないため、S3 の対象から外す
// （実測: 166件中ほぼ全部がこのカテゴリで、キーワード定義の頻度ベース除外だけでは拾いきれなかった）
const OPTIONAL_CAPABLE_KINDS = new Set(["triggered", "step", "battleWon", "fieldEvent", "reviveOnDestroy", "deckMillNegate", "magic"])

function canCarryOptionalEvidence(effects: Record<string, unknown>[]): boolean {
    return effects.some((e) => {
        const kind = typeof e.kind === "string" ? e.kind : ""
        if (OPTIONAL_CAPABLE_KINDS.has(kind)) return true
        return "action" in e // action を持つ kind は内部に chooserIsTarget 等を含みうる
    })
}

// ============================================================
// S4: タイミング（見出し vs phase/turn/phaseTurn/step）
// ============================================================

type Side = "own" | "opponent" | "both"

const TIMING_PATTERNS: { re: RegExp; side: Side; phase: string | null; label: string }[] = [
    { re: /自分のアタックステップ/, side: "own", phase: "attack", label: "自分のアタックステップ" },
    { re: /相手のアタックステップ/, side: "opponent", phase: "attack", label: "相手のアタックステップ" },
    { re: /お互いのアタックステップ/, side: "both", phase: "attack", label: "お互いのアタックステップ" },
    { re: /自分のスタートステップ/, side: "own", phase: "start", label: "自分のスタートステップ" },
    { re: /自分のターン/, side: "own", phase: null, label: "自分のターン" },
    { re: /相手のターン/, side: "opponent", phase: null, label: "相手のターン" },
]

// 効果ブロックの見出し行にマッチする正規表現（check-effect-gaps.ts の BLOCK_HEADER_RE を踏襲）
const BLOCK_HEADER_RE =
    /^(?:(?:フラッシュ|メイン)：?$|Lv\d(?:[･・/]Lv\d)*(?:：フラッシュ)?(?:\s*(?:【[^】]*】|『[^』]*』|[/･・]))*\s*$)/

function parseLevels(headerText: string): number[] | null {
    const matches = headerText.match(/Lv\d/g)
    if (!matches) return null
    return [...new Set(matches.map((m) => parseInt(m.replace("Lv", ""), 10)))]
}

interface Block {
    header: string | null
    levels: number[] | null
    body: string
}

// テキストを見出し単位のブロックに分割する（見出しが無い先頭部分は levels:null の擬似ブロックになる）
function segmentBlocks(text: string): Block[] {
    const blocks: Block[] = []
    let curHeader: string | null = null
    let curLevels: number[] | null = null
    let bodyLines: string[] = []
    const flush = () => {
        if (curHeader !== null || bodyLines.some((l) => l.trim())) {
            blocks.push({ header: curHeader, levels: curLevels, body: bodyLines.join("\n") })
        }
        bodyLines = []
    }
    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim()
        if (!line) continue
        if (BLOCK_HEADER_RE.test(line)) {
            flush()
            curHeader = line
            curLevels = parseLevels(line)
        } else {
            bodyLines.push(line)
        }
    }
    flush()
    return blocks
}

// levels（テキスト見出しが要求するレベル群。null=全レベル）に一致する effects[] エントリを集める。
// エントリの levels が無い/null は「全レベル対象」の簡略化として、どのレベル群にも候補として含める
function entriesForLevels(effects: Record<string, unknown>[], wantLevels: number[] | null): Record<string, unknown>[] {
    return effects.filter((e) => {
        const lv = e.levels
        if (!Array.isArray(lv)) return true
        if (wantLevels === null) return true
        return lv.some((n) => wantLevels.includes(n as number))
    })
}

// エントリ群から phase/turn の宣言（{phase, turn} の組）をすべて集める。
// - phaseTurn: { phase, turn } のネスト形
// - phase/turn または step/turn が兄弟キーで同じオブジェクトに乗っている形（fieldEvent 等）
//
// ⚠️ 等価表現: turn 無指定（省略）は「お互い」を意味する（type.ts のドキュメントコメントで複数箇所
// 明言されている。例: familyGrant.phase＝「ターンプレイヤー不問＝『お互いの〜ステップ』」、
// fieldEvent.turn＝「省略時はどちらでも発火」、battleWon.turn＝"own"のみ指定可＝省略時は両陣営）。
// なので phase/step だけあって turn が無いノードも「turn:both」として扱う
function collectTimingDeclarations(effects: Record<string, unknown>[]): { phase: string | null; turn: string }[] {
    const decls: { phase: string | null; turn: string }[] = []
    const isTurnValue = (v: unknown): v is string => v === "own" || v === "opponent" || v === "both"
    const visitNode = (node: Record<string, unknown>) => {
        const pt = node.phaseTurn
        if (pt && typeof pt === "object") {
            const ptObj = pt as Record<string, unknown>
            decls.push({
                phase: typeof ptObj.phase === "string" ? ptObj.phase : null,
                turn: isTurnValue(ptObj.turn) ? ptObj.turn : "both",
            })
        }
        const phaseVal = typeof node.phase === "string" ? node.phase : typeof node.step === "string" ? node.step : null
        const turnVal = node.turn
        if (isTurnValue(turnVal)) {
            decls.push({ phase: phaseVal, turn: turnVal })
        } else if (phaseVal !== null) {
            // phase/step はあるが turn が無い＝省略時は両陣営（上記コメント参照）
            decls.push({ phase: phaseVal, turn: "both" })
        }
    }
    for (const eff of effects) {
        // 等価表現: kind:"battleWon" は phase フィールドを持たない（バトル決着はアタックステップでしか
        // 起こらないため、常に暗黙で "attack"）。turn も own のみ指定可で、省略時は role が代わりを果たす:
        // role:"attacker"＝自分がアタックして勝つ＝自分のアタックステップ（own）、
        // role:"blocker"＝自分がブロックして勝つ＝相手のアタックステップ（opponent）、
        // role:"any"／turn明示時はそちらを優先
        if (eff.kind === "battleWon") {
            const role = eff.role
            const explicitTurn = isTurnValue(eff.turn) ? eff.turn : null
            const inferredTurn = role === "attacker" ? "own" : role === "blocker" ? "opponent" : "both"
            decls.push({ phase: "attack", turn: explicitTurn ?? inferredTurn })
        }
        // walk() はノード自体を渡さないため、ここでは専用の再帰でノード自体も訪問する
        const rec = (o: unknown) => {
            if (o === null || typeof o !== "object") return
            if (Array.isArray(o)) {
                for (const item of o) rec(item)
                return
            }
            const n = o as Record<string, unknown>
            visitNode(n)
            for (const v of Object.values(n)) rec(v)
        }
        rec(eff)
    }
    return decls
}

function matchesTiming(decls: { phase: string | null; turn: string }[], wantPhase: string | null, wantSide: Side): boolean {
    return decls.some((d) => {
        if (wantSide === "both") {
            if (d.turn !== "both") return false
        } else {
            if (d.turn !== wantSide && d.turn !== "both") return false
        }
        if (wantPhase === null) return true // 「〜ターン」のみの見出しは phase を問わない
        return d.phase === wantPhase
    })
}

// ============================================================
// S5: 数値（節中の数値 vs 対応レベル群の数値フィールド）
// ============================================================

// 等価表現1: 「N枚/N個/N体」の N=1 は「1枚/1体を対象にする」という暗黙の単数を表すことが大半で、
// 実装側もアクションの型自体が単数専用（count フィールドを持たない）ことが多い
// （例: summonFromHandFree はカード名一致1枚を前提にした型で count が無い）。
// 実測で166件中260件がこの「missing=1のみ」パターンで、実質すべて誤検出だったため、
// 数値1は照合対象から外す（2以上は素直に数値として残す）
//
// 等価表現2: 「この効果でコアをN個/N枚にはできない」「〜がN枚のとき、この効果は発揮されない」は、
// 実際に生成される数量ではなく下限/上限の**否定条件**を表す言い回しで、実装側は
// 「そのN±1」の値（leaveAtLeast等）や条件分岐で表現され、Nそのものは数値フィールドに現れないことが多い。
// 「N個/N枚」の直後に否定の言い回しが続く場合は数値抽出から除外する
const NEGATION_SUFFIX_RE = /^(にはできない|のとき、?この効果は発揮されない|未満にはならない)/

function extractNumbers(body: string): number[] {
    const nums = new Set<number>()
    const addIfNotNegated = (raw: string, matchEnd: number, value: number) => {
        if (value === 1) return // 等価表現1
        const after = body.slice(matchEnd, matchEnd + 20)
        if (NEGATION_SUFFIX_RE.test(after)) return // 等価表現2
        nums.add(value)
    }
    for (const m of body.matchAll(/(\d+)枚/g)) addIfNotNegated(m[0], (m.index ?? 0) + m[0].length, Number(m[1]))
    for (const m of body.matchAll(/(\d+)個/g)) addIfNotNegated(m[0], (m.index ?? 0) + m[0].length, Number(m[1]))
    for (const m of body.matchAll(/(\d+)体/g)) addIfNotNegated(m[0], (m.index ?? 0) + m[0].length, Number(m[1]))
    for (const m of body.matchAll(/BP\+(\d+)/g)) nums.add(Number(m[1])) // BP+N は1でも意味のある値なので等価表現1の対象外
    for (const m of body.matchAll(/コスト(\d+)以下/g)) nums.add(Number(m[1])) // コストN以下も1が意味を持つ（例: コスト1以下）
    return [...nums]
}

function collectNumbers(effects: Record<string, unknown>[]): Set<number> {
    const nums = new Set<number>()
    const rec = (o: unknown) => {
        if (o === null || typeof o !== "object") return
        if (Array.isArray(o)) {
            for (const item of o) rec(item)
            return
        }
        for (const v of Object.values(o as Record<string, unknown>)) {
            if (typeof v === "number") nums.add(v)
            else rec(v)
        }
    }
    for (const eff of effects) rec(eff)
    return nums
}

// ============================================================
// S6: 解決の主体（fieldEvent の self すり替え）
// ============================================================
// fieldEvent は「イベント対象（疲労したスピリット等）」を self にして解決するため、
// **その持ち主が効果の実行者になる**（SEMANTICS_AUDIT.md §3.1）。
// 「相手のスピリットが〜したとき、自分は〜する」を素直に書くと相手が実行してしまう
// （実バグ実績: SD01-028 呪われし神殿Lv2 が相手にドローさせていた）。
//
// ただし **すべての fieldEvent が危ないわけではない**。triggers.ts の resolveAction 呼び出しは
// selfOverride があるときだけ主体を差し替えるので、危ないのは
// 「発火先の pid と selfOverride.pid が食い違いうるイベント」だけに限られる。
// 発火側（fireFieldEventTriggers の呼び出し）を全数確認した結果は次のとおり:
//
//   食い違う  ownBofuExhausted   … ownerPid !== bofuSourcePid のときだけ発火する（EffectModules.ts）
//   食い違う  anySpiritExhausted … 疲労した側と相手側の両方に発火する（EffectModules.ts）
//   食い違う  anySpiritAttacked  … アタックした側と相手側の両方に発火する（GameEngine.ts）
//   一致する  ownSpiritExhausted / ownSpiritSummoned / ownSpiritDestroyed /
//             ownSpiritReturnedToHand / ownSpiritBlocked / ownSpiritDealtLife /
//             ownSeimeiLifeCharged … いずれも pid と selfOverride.pid が同じ値
//   selfOverride を渡さない残りのイベント … 常に発生源の持ち主で解決される
//
// 一致する側と selfOverride 無しの側は、印が無くても主体が入れ替わらないので対象外にする。
const SELF_SWAP_EVENTS = new Set(["ownBofuExhausted", "anySpiritExhausted", "anySpiritAttacked"])

// 主体を発生源側に固定する印。どれか1つあればよい
// - selfMode:"source" … self を発生源自身に差し替える（明示的な固定）
// - ownOnly / subjectSide:"own" … selfOverride.pid !== pid の回を発火させない
//   （triggers.ts の `if (effect.ownOnly && selfOverride?.pid !== pid) continue`）
function hasSubjectFixedEvidence(entry: Record<string, unknown>): boolean {
    if (entry.selfMode === "source") return true
    if (entry.ownOnly === true) return true
    if (entry.subjectSide === "own") return true
    // 等価表現1: chooserIsTarget を書いてある＝主体が相手側になることを承知で書いている
    // （BS08-021 ブラックアメンボーグ「相手は、相手のスピリット1体を疲労させる」）
    const action = entry.action
    if (action && typeof action === "object") {
        const a = action as Record<string, unknown>
        if (a.chooserIsTarget === true) return true
        // 等価表現2: イベント対象そのものに作用する action は、主体がどちらでも結果が変わらない。
        // coreToTrashSelf は「self 上のコアを持ち主のトラッシュへ」なので、
        // アタック/疲労したスピリット自身が対象で固定されている
        // （魔帝の墓標／魔力満ちる泉／藍紫の虚空／魔帝の寝所）
        if (a.type === "coreToTrashSelf") return true
    }
    // 等価表現3: anySpiritAttacked に turn:"own" がある＝自分のターンのアタックに限られる。
    // 自分のターンにアタックするのは自分のスピリットだけなので selfOverride.pid は必ず発生源側になる
    // （BS05-066 天焦がす大聖火）。疲労は自分のターンでも相手側に起きうる（【暴風】）ので
    // anySpiritExhausted には適用しない
    if (entry.event === "anySpiritAttacked" && entry.turn === "own") return true
    return false
}

// ============================================================
// S7: 誰が選ぶか（CHOOSER_RULES.md）
// ============================================================
// 主語が「相手は」なら対象を選ぶのは相手（§1）。逆に主語が「自分は」なら自分が選ぶ。
// この軸は**両方向**を見る。片方向だけだと、今回見つかった
// 「自分が選ぶべき効果を、選択者が相手に焼き込まれたアクションで実装している」型を拾えない。

// 選択者が相手に焼き込まれているアクション type。
// これらは chooserIsTarget を書かなくても実装側で相手に選ばせるので、
// 「相手は」側では等価表現（適合）、「自分は」側では**食い違い**になる。
const OPPONENT_CHOOSES_ACTION_TYPES = new Set([
    // 選択者は破棄される相手本人（type.ts の discardOpponent 定義コメント／
    // handDeck.ts の tryInteractiveCardChoice(state, targetPid, ...) で確認）
    "discardOpponent",
    "discardOpponentDownTo",
    // 相手が自分のスピリットを1体ずつ選んで破壊/コア移動する（CHOOSER_RULES.md §3）
    "destroyDownToOwnCount",
    "costOwnSpiritCoresToTrashThenOpponent",
    "sacrificeOwnNexusesThenEnemyDestroysOwn",
    // 相手本人に手札から選ばせてデッキの上へ戻す（type.ts の定義コメントで明言。BS07-013 ディーシャ）
    "opponentHandToDeckTop",
])

// 「相手は」と書かれていても、**選択そのものは通常の手順に委ねられる**kind。
// 相手の行動を縛るだけで、何を選ぶかはゲーム手順の側（ブロック宣言・コストの支払い）が決める
// ので、効果データに選択者を書く必要がない
//   mustBlockGrant  … 「相手は可能ならブロックする」。どのスピリットでブロックするかは
//                      通常のブロック宣言なので相手が選ぶ
//   magicRestriction / costMod / globalConstraint / constraint … 「〜できない」「余分に支払う」
const CHOICE_BY_PROCEDURE_KINDS = new Set([
    "mustBlockGrant",
    "magicRestriction",
    "costMod",
    "globalConstraint",
    "constraint",
])

// 「相手は」で始まるが選択を伴わないもの＝制約（CHOOSER_RULES.md §1 の例外）。
// 「〜できない」「〜しなければならない」は選ばせる余地が無いので対象外
const CONSTRAINT_SUFFIX_RE = /(できない|できなくなる|なければならない|しかできない)/

// 「相手は可能ならブロックする」型。**ブロッカーを選ぶのは通常のブロック宣言**であって
// 効果の中の選択ではないので、効果データに選択者を書く必要がない
// （燃えさかる戦場／翼持つ者の空域／ワーニングアタック／激神皇カタストロフドラゴン／闘将カタパルドス）
const FORCED_BLOCK_RE = /ブロック(する|しなければ)/

// 選択者が相手に焼き込まれた action を**ノード単位**で集める。
// random:true（＝誰も選ばない。「内容を見ないで破棄する」）が付いているものは
// 選択者そのものが存在しないので、主語が「自分は」でも食い違わない
function collectOpponentChoosesActions(effects: Record<string, unknown>[]): string[] {
    const found: string[] = []
    for (const eff of effects) {
        walk(eff, (key, value, node) => {
            if (key !== "type" || typeof value !== "string") return
            if (!OPPONENT_CHOOSES_ACTION_TYPES.has(value)) return
            if (node.random === true) return
            found.push(value)
        })
    }
    return found
}

function collectActionTypes(effects: Record<string, unknown>[]): Set<string> {
    const types = new Set<string>()
    for (const eff of effects) {
        walk(eff, (key, value) => {
            if (key === "type" && typeof value === "string") types.add(value)
        })
    }
    return types
}

function hasChooserEvidence(effects: Record<string, unknown>[]): boolean {
    let found = false
    for (const eff of effects) {
        walk(eff, (key, value) => {
            if (found) return
            if (key === "chooserIsTarget" && value === true) found = true
            if (key === "forcedTargetPid") found = true
        })
        if (found) break
    }
    if (found) return true
    // 等価表現: 選択者が焼き込まれた type、または discardOpponent へ委譲するフィールドを持つ
    // （destroyNexus.discardOpponentPerDestroyed＝BS05-054 鉄槌のオズワルド）
    let delegated = false
    for (const eff of effects) {
        walk(eff, (key) => {
            if (key === "discardOpponentPerDestroyed") delegated = true
        })
        if (delegated) break
    }
    if (delegated) return true
    const types = collectActionTypes(effects)
    if ([...types].some((t) => OPPONENT_CHOOSES_ACTION_TYPES.has(t))) return true
    // 選択が通常手順に委ねられる kind しか持たないカードは対象外
    return effects.length > 0 && effects.every((e) => CHOICE_BY_PROCEDURE_KINDS.has(String(e.kind ?? "")))
}

// 効果文を「。」と改行で文に割り、述語まで含む1文を返す
function splitSentences(text: string): string[] {
    return text
        .split(/\n|(?<=。)/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
}

// ============================================================
// 検出本体
// ============================================================

interface SemGap {
    axis: "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7"
    cardId: string
    name: string
    textEvidence: string
    implKinds: string
}

const gaps: SemGap[] = []

function kindsOf(effects: Record<string, unknown>[]): string {
    const kinds = [...new Set(effects.map((e) => String(e.kind ?? "?")))]
    return kinds.length > 0 ? kinds.join(",") : "(該当エントリなし)"
}

for (const card of cards) {
    if (cardFilter && card.cardId !== cardFilter) continue
    const rawText = (card.effect || "").trim()
    if (!rawText) continue
    const text = maskText(rawText)

    // ---- S1 回数制限 ----
    if (!axisFilter || axisFilter === "S1") {
        const phrase = ["ターンに1回", "ゲーム中に1回", "1回だけ"].find((p) => text.includes(p))
        if (phrase && !hasOncePerTurnEvidence(card.effects)) {
            const idx = text.indexOf(phrase)
            gaps.push({
                axis: "S1",
                cardId: card.cardId,
                name: card.name,
                textEvidence: text.slice(Math.max(0, idx - 10), idx + 20).replace(/\n/g, " ").slice(0, 30),
                implKinds: kindsOf(card.effects),
            })
        }
    }

    // ---- S2 コスト ----
    if (!axisFilter || axisFilter === "S2") {
        const phrase = ["することで", "することによって"].find((p) => text.includes(p))
        if (phrase && !hasCostEvidence(card.effects)) {
            const idx = text.indexOf(phrase)
            gaps.push({
                axis: "S2",
                cardId: card.cardId,
                name: card.name,
                textEvidence: text.slice(Math.max(0, idx - 20), idx + 10).replace(/\n/g, " ").slice(0, 30),
                implKinds: kindsOf(card.effects),
            })
        }
    }

    // ---- S3 任意性 ----
    if (!axisFilter || axisFilter === "S3") {
        const m = /できる。/.exec(text)
        if (m && canCarryOptionalEvidence(card.effects) && !hasOptionalEvidence(card.effects)) {
            const idx = m.index
            gaps.push({
                axis: "S3",
                cardId: card.cardId,
                name: card.name,
                textEvidence: text.slice(Math.max(0, idx - 25), idx + 5).replace(/\n/g, " ").slice(0, 30),
                implKinds: kindsOf(card.effects),
            })
        }
    }

    // ---- S4 タイミング / S5 数値 ----
    if ((!axisFilter || axisFilter === "S4" || axisFilter === "S5") && (card.type === "spirit" || card.type === "nexus" || card.type === "magic")) {
        const blocks = segmentBlocks(text)

        // S4: 見出し単位でレベル群ごとにまとめ、食い違う要求が同じレベル群にあればスキップ
        if (!axisFilter || axisFilter === "S4") {
            const byLevels = new Map<string, { header: string; side: Side; phase: string | null }[]>()
            for (const b of blocks) {
                if (!b.header) continue
                for (const pat of TIMING_PATTERNS) {
                    if (pat.re.test(b.header)) {
                        const key = b.levels ? [...b.levels].sort().join(",") : "ALL"
                        if (!byLevels.has(key)) byLevels.set(key, [])
                        byLevels.get(key)!.push({ header: b.header, side: pat.side, phase: pat.phase })
                        break
                    }
                }
            }
            for (const [key, reqs] of byLevels) {
                const uniq = new Set(reqs.map((r) => `${r.side}:${r.phase}`))
                if (uniq.size > 1) continue // 同一レベル群に食い違う要求 → 対応付け不能なのでスキップ
                const first = reqs[0]
                if (!first) continue
                const { side, phase, header } = first
                const wantLevels = key === "ALL" ? null : key.split(",").map(Number)
                const matching = entriesForLevels(card.effects, wantLevels)
                // 等価表現: kind:"constraint"/"globalConstraint"（cantBlock・unblockableBy・cantAttack 等）は
                // 「発生源が場にありレベル有効の間ずっと有効な継続能力」で phase/turn フィールドを持たない設計。
                // 見出しの『相手のアタックステップ』等はその能力が意味を持つ文脈を示しているだけで、
                // 実装側に対応するフィールドは無くてよい（type.ts の ConstraintDef 群にタイミング条件が無いことから確認）
                if (matching.length > 0 && matching.every((e) => e.kind === "constraint" || e.kind === "globalConstraint")) {
                    continue
                }
                const decls = collectTimingDeclarations(matching)
                if (!matchesTiming(decls, phase, side)) {
                    gaps.push({
                        axis: "S4",
                        cardId: card.cardId,
                        name: card.name,
                        textEvidence: header.slice(0, 30),
                        implKinds: kindsOf(matching),
                    })
                }
            }
        }

        // S5: ブロックごとに数値を突き合わせる
        if (!axisFilter || axisFilter === "S5") {
            for (const b of blocks) {
                const nums = extractNumbers(b.body)
                if (nums.length === 0) continue
                const matching = entriesForLevels(card.effects, b.levels)
                const implNums = collectNumbers(matching)
                const missing = nums.filter((n) => !implNums.has(n))
                if (missing.length > 0) {
                    // 見出しは短く削るが、欠落数値そのものは切り詰めない（判断に必須の情報のため）
                    const headerShort = (b.header ?? "見出しなし").slice(0, 14)
                    gaps.push({
                        axis: "S5",
                        cardId: card.cardId,
                        name: card.name,
                        textEvidence: `[${headerShort}] 数値${missing.join(",")}`,
                        implKinds: kindsOf(matching),
                    })
                }
            }
        }
    }

    // ---- S6 解決の主体（fieldEvent の self すり替え） ----
    if (!axisFilter || axisFilter === "S6") {
        for (const eff of card.effects) {
            if (eff.kind !== "fieldEvent") continue
            const event = typeof eff.event === "string" ? eff.event : ""
            if (!SELF_SWAP_EVENTS.has(event)) continue
            if (hasSubjectFixedEvidence(eff)) continue
            gaps.push({
                axis: "S6",
                cardId: card.cardId,
                name: card.name,
                textEvidence: `${event}に主体の固定なし`,
                implKinds: kindsOf([eff]),
            })
        }
    }

    // ---- S7 誰が選ぶか ----
    if (!axisFilter || axisFilter === "S7") {
        const sentences = splitSentences(text)
        // (a) 「相手は」なのに相手が選ぶ実装になっていない
        // 「相手は」でも、デッキの上から順に処理するものは選ぶ余地が無い（BS03-116 英雄の喪失）
        const aiteSent = sentences.find(
            (sen) =>
                /相手は[、,]?/.test(sen) &&
                !CONSTRAINT_SUFFIX_RE.test(sen) &&
                !FORCED_BLOCK_RE.test(sen) &&
                !/デッキを?上から/.test(sen),
        )
        if (aiteSent && !hasChooserEvidence(card.effects)) {
            gaps.push({
                axis: "S7",
                cardId: card.cardId,
                name: card.name,
                textEvidence: `[相手は] ${aiteSent.slice(0, 26)}`,
                implKinds: kindsOf(card.effects),
            })
        }
        // (b) 逆向き: 「自分は」なのに選択者が相手に焼き込まれたアクションで実装している。
        // 「相手は」の節が同じカードに無いときだけ見る（両方あるカードは節とエントリの
        // 対応付けが要り、S4 と同じ理由で信頼できないため対象外にする）
        if (!aiteSent) {
            const jibunSent = sentences.find((sen) => /自分は/.test(sen))
            if (jibunSent) {
                const baked = collectOpponentChoosesActions(card.effects)
                if (baked.length > 0) {
                    gaps.push({
                        axis: "S7",
                        cardId: card.cardId,
                        name: card.name,
                        textEvidence: `[自分は] ${jibunSent.slice(0, 26)}`,
                        implKinds: `相手が選ぶ実装: ${baked.join(",")}`,
                    })
                }
            }
        }
    }
}

gaps.sort((a, b) => a.axis.localeCompare(b.axis) || a.cardId.localeCompare(b.cardId))

// ---- 出力 ----
if (jsonOutput) {
    console.log(JSON.stringify(gaps, null, 2))
} else {
    const titles: Record<SemGap["axis"], string> = {
        S1: "S1 回数制限（テキストに「ターンに1回」等があるのに回数制限の実装が無い）",
        S2: "S2 コスト（テキストに「〜することで」等があるのにコストの実装が無い）",
        S3: "S3 任意性（テキストが「〜できる。」で終わるのに任意/選択の実装が無い）",
        S4: "S4 タイミング（見出しのステップ/ターン指定と実装の phase/turn/step が一致しない）",
        S5: "S5 数値（節中の数値が対応レベル群の実装にどこにも現れない）",
        S6: "S6 解決の主体（fieldEvent が相手側でも発火するのに主体を発生源側へ固定していない）",
        S7: "S7 誰が選ぶか（効果文の主語と、実装側の選択者が食い違う）",
    }
    const order: SemGap["axis"][] = ["S1", "S2", "S3", "S4", "S5", "S6", "S7"]
    for (const axis of order) {
        if (axisFilter && axisFilter !== axis) continue
        const list = gaps.filter((g) => g.axis === axis)
        console.log(`=== ${titles[axis]}: ${list.length}件 ===`)
        for (const g of list) {
            console.log(
                `  ${g.cardId} ${g.name.padEnd(14, "　")}  テキスト根拠[${g.textEvidence}]  実装: ${g.implKinds}`,
            )
        }
        console.log()
    }

    console.log("=".repeat(60))
    console.log("軸ごとの件数サマリー")
    console.log("=".repeat(60))
    for (const axis of order) {
        console.log(`  ${axis}: ${gaps.filter((g) => g.axis === axis).length}件`)
    }
    console.log()
    console.log(`除外した定型説明: ${boilerplateSentences.length}種`)
}
