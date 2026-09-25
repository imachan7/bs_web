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
 *   S8 重複:     同じ action を OR で2エントリに分けていて、両立すると二重発火する
 *                （キーワード・系統・色での分割が危ない。levels/role/trigger/event 等は構造的に排他）
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
// 例: pay（「〜することで〜する」の汎用の器）、
//     targetNegateByHandDiscard（竜騎集う円卓＝手札1枚破棄で対象を防ぐ）、
//     summonCostHandDiscardPay（ビクティム＝召喚コストを手札破棄で）、
//     nexusCostMillPay（栄光の表彰台＝配置コストをデッキ破棄で）、
//     tenshoCoreSubstitute（ダークスカルデーモン＝疲労することでコアを置いたものとして扱う）
// これらは cost で始まる**キー名**を持たないため、type の**値**を別途チェックする
const COST_BAKED_ACTION_TYPES = new Set([
    "revealHandMagicToTegamotoDraw",
    "handMagicToTegamotoDraw",
    "selfBuffByExhaustFamily",
    "discardHandNexusToVoidCoreSelf",
    "targetNegateByHandDiscard",
    "summonCostHandDiscardPay",
    "nexusCostMillPay",
    "coreRemovePerHandDiscard",
    "tenshoCoreSubstitute",
    "pay",
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

// S3 で「読んで問題なしと確認した」もの。**理由を必ず添える**（次に見る人が再検証しないため）。
// キーは cardId（S3 は1カードにつき最初の「できる。」1件しか出さない）。
// 機械的な等価表現に落とせるものは OPTIONAL_CAPABLE_KINDS 側で落とすこと
const S3_VERIFIED: Record<string, string> = {
    // ミーアバット: handActivated（手札から使う任意の起動）なので、発動そのものが任意のため
    "BS15-011": "handActivatedの宣言自体が任意のため（2026-09-18 確認）",
    // インフェニット・ヴォルス: 「疲労状態でブロックできる」はブロック可否の緩和（constraintGrant）で、宣言が任意のため
    "BS15-036": "ブロック可否の緩和で、ブロック宣言そのものが任意のため（2026-09-18 確認）",
    // プロボケイション: 「使用できる」は使用タイミングの拡張で、使うかどうかは確認を出しているため
    "BS15-079": "使用の確認をofferOpponentMainEndMagicで出しているため（2026-09-18 確認）",
    // グラン・ドルバルカン: 起動能力(activated)なので二重確認になるため
    "BS01-094": "起動能力(activated)なので二重確認になるため（2026-09-16 確認）",
    // キラーテレスコープ: 能力の付与（対象に選べる）なので不要のため
    "BS01-127": "能力の付与（対象に選べる）なので不要のため（2026-09-16 確認）",
    // 大天使ミカファール: コスト無償化の付与で使用自体は任意選択のため
    "BS02-X08": "コスト無償化の付与で使用自体は任意選択のため（2026-09-16 確認）",
    // 栄光の表彰台: コストの支払い方の選択肢のため
    "BS04-088": "コストの支払い方の選択肢のため（2026-09-16 確認）",
    // レッドウォール: 能力の付与（ブロックできる）なので不要のため
    "BS04-110": "能力の付与（ブロックできる）なので不要のため（2026-09-16 確認）",
    // 最古龍の顎: 能力の付与（対象指定してアタック）なので不要のため
    "BS05-056": "能力の付与（対象指定してアタック）なので不要のため（2026-09-16 確認）",
    // シンクロニシティ: 能力の付与（対象指定してアタック）なので不要のため
    "BS05-068": "能力の付与（対象指定してアタック）なので不要のため（2026-09-16 確認）",
    // トランスマイグレーション: revealAndSummonKeywordが候補1枚でも選択（スキップ可）を出すため
    "BS05-069": "revealAndSummonKeywordが候補1枚でも選択（スキップ可）を出すため（2026-09-16 確認）",
    // 計画された場外乱闘: 能力の付与（ブロックできる）なので不要のため
    "BS06-088": "能力の付与（ブロックできる）なので不要のため（2026-09-16 確認）",
    // アームズインパクト: destroyByCostBudgetがトグル選択で0体も選べるため
    "BS07-084": "destroyByCostBudgetがトグル選択で0体も選べるため（2026-09-16 確認）",
    // 大天使イスフィール: magicRepeatGrantが再発揮の確認(suspend)を出すため
    "BS07-X27": "magicRepeatGrantが再発揮の確認(suspend)を出すため（2026-09-16 確認）",
    // 機神獣インフェニット・ヴォルス: 能力の付与（ブロックできる）なので不要のため
    "BS08-036": "能力の付与（ブロックできる）なので不要のため（2026-09-16 確認）",
    // ビクティム: コストの支払い方の選択肢のため
    "BS08-071": "コストの支払い方の選択肢のため（2026-09-16 確認）",
    // インフィニティシールド: 能力の付与（ブロックできる）なので不要のため
    "BS08-077": "能力の付与（ブロックできる）なので不要のため（2026-09-16 確認）",
    // マジックミラー: カード全体が単一の決定的処理で、使用自体が選択のため
    "BS08-080": "カード全体が単一の決定的処理で、使用自体が選択のため（2026-09-16 確認）",
    // 堕天使ミカファール: castMagicFromTrashByColorが「選ばなければ発動しません」の確認を出すため
    "BS08-X33": "castMagicFromTrashByColorが「選ばなければ発動しません」の確認を出すため（2026-09-16 確認）",
    // 蛇凰神バァラル: 【不死】キーワードが召喚確認のsuspendを出すため
    "BS09-017": "【不死】キーワードが召喚確認のsuspendを出すため（2026-09-16 確認）",
    // 忍者サルトベ: freeSummonFromHandOnDiscardedByOpponentが確認待ちを出すため
    "BS09-025": "freeSummonFromHandOnDiscardedByOpponentが確認待ちを出すため（2026-09-16 確認）",
    // 炎蜥蜴クトゥグマ: 能力の付与（ブロックできる）なので不要のため
    "BS09-049": "能力の付与（ブロックできる）なので不要のため（2026-09-16 確認）",
    // 魔導女皇アンブロシウス: コスト無償化の付与で使用自体は任意選択のため
    "BS09-X39": "コスト無償化の付与で使用自体は任意選択のため（2026-09-16 確認）",
    // 水星神龍メルクリウス・サーペント: altSummonFromHandは召喚アクション自体が任意選択のため
    "BS10-058": "altSummonFromHandは召喚アクション自体が任意選択のため（2026-09-16 確認）",
    // 明星きらめく花園: コスト軽減の付与で常に有利なため確認不要のため
    "BS10-092": "コスト軽減の付与で常に有利なため確認不要のため（2026-09-16 確認）",
    // 冥王神獣インフェルド・ハデス: 【不死】キーワードが召喚確認のsuspendを出すため
    "BS11-015": "【不死】キーワードが召喚確認のsuspendを出すため（2026-09-16 確認）",
    // カーミュラ1: コストの支払い方の選択肢のため
    "BS11-053": "コストの支払い方の選択肢のため（2026-09-16 確認）",
    // 終末描かれしキャンバス: 能力の付与（対象指定してアタック）なので不要のため
    "BS11-063": "能力の付与（対象指定してアタック）なので不要のため（2026-09-16 確認）",
    // ソリッドボディー: 能力の付与（ブロックできる）なので不要のため
    "BS11-084": "能力の付与（ブロックできる）なので不要のため（2026-09-16 確認）",
    // 太陽神龍ライジング・アポロドラゴン: 能力の付与（対象指定してアタック）なので不要のため
    "BS11-X01": "能力の付与（対象指定してアタック）なので不要のため（2026-09-16 確認）",
    // 滅神星龍ダークヴルム・ノヴァ: 能力の付与（対象指定してアタック）なので不要のため
    "BS11-X02": "能力の付与（対象指定してアタック）なので不要のため（2026-09-16 確認）",
    // グランド・ドラグキャッスル: 能力の付与（対象指定してアタック）なので不要のため
    "BS12-008": "能力の付与（対象指定してアタック）なので不要のため（2026-09-16 確認）",
    // ジェット・レイ: freeSummonFromHandOnLifeDamagedが確認待ちを出すため
    "BS12-056": "freeSummonFromHandOnLifeDamagedが確認待ちを出すため（2026-09-16 確認）",
    // マジックランプ: revealAndPlaceNexusFreeが候補1枚でも選択（スキップ可）を出すため
    "BS12-083": "revealAndPlaceNexusFreeが候補1枚でも選択（スキップ可）を出すため（2026-09-16 確認）",
    // 虹竜アウローリア: 能力の付与（ブロックできる）なので不要のため
    "BS13-031": "能力の付与（ブロックできる）なので不要のため（2026-09-16 確認）",
    // イリテバン: 起動能力(activated)なので二重確認になるため
    "BS13-049": "起動能力(activated)なので二重確認になるため（2026-09-16 確認）",
    // 光龍騎神サジット・アポロドラゴン: 能力の付与（合体できる上限）なので不要のため
    "BS13-X01": "能力の付与（合体できる上限）なので不要のため（2026-09-16 確認）",
    // トウダー: 【不死】キーワードが召喚確認のsuspendを出すため
    "BS14-015": "【不死】キーワードが召喚確認のsuspendを出すため（2026-09-16 確認）",
    // ティンダロ・ハウンド: freeSummonFromHandOnOwnNexusDeployedが確認待ちを出すため
    "BS14-060": "freeSummonFromHandOnOwnNexusDeployedが確認待ちを出すため（2026-09-16 確認）",
    // 神樹の切り株都市: revealTopSummonFreeOrReturnToDeckが発動確認を出すため
    "BS14-081": "revealTopSummonFreeOrReturnToDeckが発動確認を出すため（2026-09-16 確認）",
    // 仁王壁: 能力の付与（ブロックできる）なので不要のため
    "BS14-101": "能力の付与（ブロックできる）なので不要のため（2026-09-16 確認）",
    // 龍の覇王ジーク・ヤマト・フリード: 能力の付与（対象指定してアタック）なので不要のため
    "BS14-X01": "能力の付与（対象指定してアタック）なので不要のため（2026-09-16 確認）",
    // イカヅチ・ヴルム: 能力の付与（対象指定してアタック）なので不要のため
    "SD06-006": "能力の付与（対象指定してアタック）なので不要のため（2026-09-16 確認）",
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
// triggered/step/battleWon/fieldEvent/reviveOnDestroy/deckMillNegate/magicTargetRedirect の7種だけで、
// constraint・keyword・levelAs・familyGrant・reductionGrant・
// magicFreeGrant・constraintGrant・colorAs・alsoCostGrant 等の「発生源が場にある間ずっと有効な
// 継続的な権限付与」は構造上 optional を持てない（「〜できる」は"許可"を表す定型文で、
// 効果解決のたびに選ぶ任意発揮ではない）。これらの kind しか無いカードに「できる。」があっても
// 実装側に対応するフィールドが存在しえないため、S3 の対象から外す
// （実測: 166件中ほぼ全部がこのカテゴリで、キーワード定義の頻度ベース除外だけでは拾いきれなかった）
const OPTIONAL_CAPABLE_KINDS = new Set(["triggered", "step", "battleWon", "fieldEvent", "reviveOnDestroy", "deckMillNegate", "magic", "magicTargetRedirect"])

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

// S4 で「読んで問題なしと確認した」もの。**理由を必ず添える**。
// キーは `${cardId}|${見出し}`（出力の「テキスト根拠」と同じ文字列＝先頭30字）
const S4_VERIFIED: Record<string, string> = {
    // ショカツリョー: anySpiritAttacked はアタックステップにしか起きないため限定は不要
    "BS15-026|Lv2『自分のアタックステップ』": "アタック誘発はアタックステップにしか起きないため（2026-09-18 確認）",
    // ホウオウガ: ownSpiritDealtLife（アタックによるライフ減少）はアタックステップにしか起きないため
    "BS15-027|Lv1･Lv2･Lv3『自分のアタックステップ』": "アタックによるライフ減少はアタックステップにしか起きないため（2026-09-18 確認）",
    // スフィン・クロス: ownSpiritBlocked / ownSpiritDealtLife はどちらもアタックステップにしか起きないため
    "BS15-045|Lv1･Lv2･Lv3『自分のアタックステップ』": "ブロック時の誘発はアタックステップにしか起きないため（2026-09-18 確認）",
    "BS15-045|Lv2･Lv3『自分のアタックステップ』": "アタックによるライフ減少はアタックステップにしか起きないため（2026-09-18 確認）",
    // 冥府へ続く魔門: 見出しはfushiFreeByExhaust側で、別見出しのfieldEvent（アタック時）と突き合わせている誤検出
    "BS15-064|Lv2『お互いのアタックステップ』": "見出しがfushiFreeByExhaust側で別エントリと混同のため（2026-09-18 確認）",
    // 花の宮殿: Lv2 の見出しは globalConstraint 側で、別見出しの reviveOnDestroy と突き合わせている誤検出
    "BS09-063|Lv2『お互いのアタックステップ』": "見出しはglobalConstraintで別見出しのreviveOnDestroyと混同のため（2026-09-16 確認）",
    // 赤き砂の座: tenshoSelfCostBonus の見出しは『自分のメインステップ』で、【転召】召喚は
    // メインステップにしか起きないため限定は不要（アタックステップの見出しは別エントリの globalConstraint 側）
    "BS08-057|Lv1･Lv2『お互いのアタックステップ』": "見出しが違うエントリとの突き合わせで、転召はメインステップにしか起きないため（2026-09-16 確認）",
    // スケルトン・ジョウ: 見出しはconstraintで別見出しのtriggeredと混同のため
    "BS01-016|Lv1･Lv2･Lv3『相手のアタックステップ』": "見出しはconstraintで別見出しのtriggeredと混同のため（2026-09-16 確認）",
    // 魔帝の墓標: fieldEventはaction自身に作用し陣営不問のため
    "BS01-105|Lv1･Lv2『お互いのアタックステップ』": "fieldEventはaction自身に作用し陣営不問のため（2026-09-16 確認）",
    // 魔帝の墓標: 同上（重複見出し）のため
    "BS01-105|Lv2『お互いのアタックステップ』": "同上（重複見出し）のため（2026-09-16 確認）",
    // 隠されたる賢者の樹: auraはbattlingOnlyで対象自体が攻防中限定のため
    "BS01-106|Lv1･Lv2『お互いのアタックステップ』": "auraはbattlingOnlyで対象自体が攻防中限定のため（2026-09-16 確認）",
    // ドラグノ突撃兵: 見出しはconstraintで別見出しのtriggeredと混同のため
    "BS02-005|Lv1･Lv2『相手のアタックステップ』": "見出しはconstraintで別見出しのtriggeredと混同のため（2026-09-16 確認）",
    // 騎獣スレイプホース: magicBuffBonusはphase==="attack"がハードコード済みのため
    "BS02-033|Lv3『自分のアタックステップ』": "magicBuffBonusはphase==='attack'がハードコード済みのため（2026-09-16 確認）",
    // 盾精ラングリーズ: 見出しはconstraintで別見出しのtriggeredと混同のため
    "BS02-038|Lv1･Lv2『自分のアタックステップ』": "見出しはconstraintで別見出しのtriggeredと混同のため（2026-09-16 確認）",
    // 太古の断層: battleWonは戦闘解決時限定・auraはphaseTurn明記済みのため
    "BS02-076|Lv2『お互いのアタックステップ』": "battleWonは戦闘解決時限定・auraはphaseTurn明記済みのため（2026-09-16 確認）",
    // 崩壊する戦線: funsaiBonusは【粉砕】使用時限定・levelAsはphase/turn明記済みのため
    "BS03-115|Lv1･Lv2『お互いのアタックステップ』": "funsaiBonusは【粉砕】使用時限定・levelAsはphase/turn明記済みのため（2026-09-16 確認）",
    // オッドセイ: 見出しはconstraintで別見出しのfieldEventと混同のため
    "BS04-036|Lv1･Lv2『自分のアタックステップ』": "見出しはconstraintで別見出しのfieldEventと混同のため（2026-09-16 確認）",
    // 鎧装獣ヘイズ・ルーン: fieldEventはturn:opponent指定済みで一致のため
    "BS04-037|Lv1･Lv2『相手のアタックステップ』": "fieldEventはturn:opponent指定済みで一致のため（2026-09-16 確認）",
    // 魔影街: exhaustOnManualCoreAddは関数内でmainフェーズ限定のため
    "BS04-078|Lv1･Lv2『自分のアタックステップ』": "exhaustOnManualCoreAddは関数内でmainフェーズ限定のため（2026-09-16 確認）",
    // 緑眼の虚空: 見出しはglobalConstraintで別見出しのeffectGrantと混同のため
    "BS05-059|Lv1･Lv2『お互いのアタックステップ』": "見出しはglobalConstraintで別見出しのeffectGrantと混同のため（2026-09-16 確認）",
    // 白夜の虚空: 見出しはglobalConstraintで別見出しのkeywordGrantと混同のため
    "BS05-061|Lv1･Lv2『お互いのアタックステップ』": "見出しはglobalConstraintで別見出しのkeywordGrantと混同のため（2026-09-16 確認）",
    // センザンゴウ: 見出しはconstraintで別見出しのfieldEventと混同のため
    "BS06-038|Lv1･Lv2『自分のアタックステップ』": "見出しはconstraintで別見出しのfieldEventと混同のため（2026-09-16 確認）",
    // アイランド・ゴレム: keywordは能力付与・funsaiBonusは【粉砕】使用時限定のため
    "BS07-053|Lv2･Lv3『お互いのアタックステップ』": "keywordは能力付与・funsaiBonusは【粉砕】使用時限定のため（2026-09-16 確認）",
    // ダークスカルデーモン: fieldEventはturn:opponent指定済みで一致のため
    "BS08-012|Lv2･Lv3『相手のアタックステップ』": "fieldEventはturn:opponent指定済みで一致のため（2026-09-16 確認）",
    // ブラックアメンボーグ: fieldEventはturn:opponent指定済みで一致のため
    "BS08-021|Lv2『相手のアタックステップ』": "fieldEventはturn:opponent指定済みで一致のため（2026-09-16 確認）",
    // 一角魚モノケロック: 見出しはkeyword（能力付与）で別見出しのconstraintと混同のため
    "BS08-029|Lv2･Lv3『相手のアタックステップ』": "見出しはkeyword（能力付与）で別見出しのconstraintと混同のため（2026-09-16 確認）",
    // 空帝竜騎プラチナム: 見出しはactivated(timing:main)で別見出しのconstraintと混同のため
    "BS08-034|Lv1･Lv2･Lv3『相手のアタックステップ』": "見出しはactivated(timing:main)で別見出しのconstraintと混同のため（2026-09-16 確認）",
    // 機神獣インフェニット・ヴォルス: magicNegateはturn:opponent一致・他は別見出しのため
    "BS08-036|Lv2･Lv3『相手のアタックステップ』": "magicNegateはturn:opponent一致・他は別見出しのため（2026-09-16 確認）",
    // 竜騎集う円卓: ownLifeDamagedは戦闘由来限定・targetNegateは別見出しで一致のため
    "BS08-055|Lv1･Lv2『相手のアタックステップ』": "ownLifeDamagedは戦闘由来限定・targetNegateは別見出しで一致のため（2026-09-16 確認）",
    // 無限蟻の地底都市: fieldEventはturn:opponent・stepは別見出しでどちらも一致のため
    "BS08-060|Lv1･Lv2『相手のアタックステップ』": "fieldEventはturn:opponent・stepは別見出しでどちらも一致のため（2026-09-16 確認）",
    // 蛇凰神バァラル: fushiCandidatesがphase==="attack"をハードコード済みのため
    "BS09-017|Lv1･Lv2･Lv3【不死：コスト3/4/5/6】『お互い": "fushiCandidatesがphase==='attack'をハードコード済みのため（2026-09-16 確認）",
    // 炎蜥蜴クトゥグマ: 見出しはconstraintで別見出しのtriggeredと混同のため
    "BS09-049|Lv1･Lv2･Lv3『相手のアタックステップ』": "見出しはconstraintで別見出しのtriggeredと混同のため（2026-09-16 確認）",
    // 巨獣守りし神域: effectGrantはonBlock発火・stepは別見出しで一致のため
    "BS09-061|Lv1･Lv2『相手のアタックステップ』": "effectGrantはonBlock発火・stepは別見出しで一致のため（2026-09-16 確認）",
    // タワー・ゴレム: 見出しはkeyword（能力付与）で別見出しのconstraintと混同のため
    "BS11-043|Lv2･Lv3『相手のアタックステップ』": "見出しはkeyword（能力付与）で別見出しのconstraintと混同のため（2026-09-16 確認）",
    // 定規山脈: 見出しはdestroyAsMaxLevelGrantで別見出しのglobalConstraintと混同のため
    "BS12-069|Lv2『相手のアタックステップ』": "見出しはdestroyAsMaxLevelGrantで別見出しのglobalConstraintと混同のため（2026-09-16 確認）",
    // 戦神乙女ヴィエルジェ: 見出しはtriggered(onSummon)で別見出しのglobalConstraint等と混同のため
    "BS12-X05|Lv1･Lv2･Lv3『相手のアタックステップ』": "見出しはtriggered(onSummon)で別見出しのglobalConstraint等と混同のため（2026-09-16 確認）",
    // 冥総裁ハーゲン: fieldEventはownOnly+攻撃時限定で自分の攻撃にしか起きないため
    "BS13-015|Lv2『自分のアタックステップ』": "fieldEventはownOnly+攻撃時限定で自分の攻撃にしか起きないため（2026-09-16 確認）",
    // オリンピアの天使オク: 見出しはglobalConstraintで別見出し（step無し）のreductionGrantと混同のため
    "BS13-035|Lv1･Lv2『お互いのアタックステップ』": "見出しはglobalConstraintで別見出し（step無し）のreductionGrantと混同のため（2026-09-16 確認）",
    // 古代戦艦アルゴ・ゴレム: nexusAsSpiritDuringAttackStepはPhaseManagerでアタックステップ限定のため
    "BS13-048|Lv2『お互いのアタックステップ』": "nexusAsSpiritDuringAttackStepはPhaseManagerでアタックステップ限定のため（2026-09-16 確認）",
    // 戴冠する活火山: fieldEventは攻撃時限定・stepはphase/turn一致のため
    "BS13-061|Lv1･Lv2『お互いのアタックステップ』": "fieldEventは攻撃時限定・stepはphase/turn一致のため（2026-09-16 確認）",
    // 蛇教徒の宮殿: constraintGrantはこのスピリットのアタック限定で暗黙に自分のターンのため
    "BS13-064|Lv1･Lv2『自分のアタックステップ』": "constraintGrantはこのスピリットのアタック限定で暗黙に自分のターンのため（2026-09-16 確認）",
    // 蛇教徒の宮殿: fieldEventはturn:opponent指定済みで一致のため
    "BS13-064|Lv2『相手のアタックステップ』": "fieldEventはturn:opponent指定済みで一致のため（2026-09-16 確認）",
    // 光導く巨塔: reviveOnDestroyはbyBattle限定で戦闘時にしか起きないため
    "BS13-067|Lv1･Lv2『お互いのアタックステップ』": "reviveOnDestroyはbyBattle限定で戦闘時にしか起きないため（2026-09-16 確認）",
    // 遥かなる衛星砲: 見出しはglobalConstraintで別見出しのfieldEventと混同のため
    "BS13-068|Lv1･Lv2『お互いのアタックステップ』": "見出しはglobalConstraintで別見出しのfieldEventと混同のため（2026-09-16 確認）",
    // 遥かなる衛星砲: fieldEventはturn:opponent指定済みで一致のため
    "BS13-068|Lv2『相手のアタックステップ』": "fieldEventはturn:opponent指定済みで一致のため（2026-09-16 確認）",
    // 星宿の障壁: 見出しはglobalConstraintで別見出しのfieldEventと混同のため
    "BS13-070|Lv1･Lv2『お互いのアタックステップ』": "見出しはglobalConstraintで別見出しのfieldEventと混同のため（2026-09-16 確認）",
    // 巨人港: 見出しはglobalConstraintで別見出しのfieldEventと混同のため
    "BS13-071|Lv1･Lv2『お互いのアタックステップ』": "見出しはglobalConstraintで別見出しのfieldEventと混同のため（2026-09-16 確認）",
    // グラント・ベンケイ: effectGrantはonBattleEnd限定で戦闘時にしか起きないため
    "BS14-030|Lv2『お互いのアタックステップ』": "effectGrantはonBattleEnd限定で戦闘時にしか起きないため（2026-09-16 確認）",
    // エゾノ・アウル: fieldEventはsubjectSide:opponentで相手の攻撃時にしか起きないため
    "BS14-037|Lv1･Lv2･Lv3『相手のアタックステップ』": "fieldEventはsubjectSide:opponentで相手の攻撃時にしか起きないため（2026-09-16 確認）",
    // 勇機リュードロイド: 見出しはconstraintで別見出しのkeyword/magicNegateと混同のため
    "BS14-040|Lv1･Lv2『相手のアタックステップ』": "見出しはconstraintで別見出しのkeyword/magicNegateと混同のため（2026-09-16 確認）",
    // 雷皇龍ジークヴルム: 激突は攻撃時にしか意味を持たずkeywordGrantが常時付与でも結果は同じため
    "SD01-008|Lv3『自分のアタックステップ』": "激突は攻撃時にしか意味を持たずkeywordGrantが常時付与でも結果は同じため（2026-09-16 確認）",
    // 天の城門: lifeDamageMillGuardはturn:opponent・constraintGrantはphaseTurn明記済みのため
    "SD02-012|Lv1･Lv2『相手のアタックステップ』": "lifeDamageMillGuardはturn:opponent・constraintGrantはphaseTurn明記済みのため（2026-09-16 確認）",
    // 海皇龍シーマ・クリーク: 自陣ライフ減少は相手の攻撃由来限定で自分のターンには起きないため
    "SD06-010|Lv1･Lv2･Lv3『相手のターン』": "自陣ライフ減少は相手の攻撃由来限定で自分のターンには起きないため（2026-09-16 確認）",
}

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

// S6 で「読んで問題なしと確認した」もの。**理由を必ず添える**（次に見る人が再検証しないため）。
// 機械的な等価表現に落とせないものだけをここに書く（落とせるなら hasSubjectFixedEvidence へ）
const S6_VERIFIED: Record<string, string> = {
    // 効果文の主語が「**相手は**、相手のスピリットのコア1個を相手のリザーブに置く」なので、
    // 実行者が相手になるのが正しい。chooserIsTarget を書かない実装（coreRemove は実行者側の
    // 場を操作する）でも actionPid が相手で正解なので、主体の固定は不要
    "BS11-063-e1": "効果文の主語が「相手は」＝相手が実行者で正しい（2026-09-13 確認）",
}

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
        // 等価表現4（2026-09-13 に S6 を全12件仕分けて追加）：
        // **イベント対象そのものに作用する／実行者に依存しない action** は、
        // 主体がどちらでも結果が変わらないので対象外にする。
        //   destroySelf              … アタックしたスピリット自身を破壊する
        //                              （BS13-006 炎獣ファイオリック／BS13-061 戴冠する活火山／BS13-063 血塗られた魔具）
        //   setTargetBpAsThisBattle  … そのバトルの間、アタックしたスピリット自身のLvBPを置き換える
        //                              （BS12-037 オリンピアの天使ベトール）
        //   endAttackStepAfterBattle … アタックステップの終了はプレイヤーに紐づかない
        //                              （BS13-059 フォビッド・バルチャー／BS14-083 氷結した瀑布）
        if (a.type === "destroySelf" || a.type === "setTargetBpAsThisBattle" || a.type === "endAttackStepAfterBattle") return true

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
    // drawDiscard.ts の tryInteractiveCardChoice(state, targetPid, ...) で確認）
    "discardOpponent",
    "discardOpponentDownTo",
    // 相手が自分のスピリットを1体ずつ選んで破壊/コア移動する（CHOOSER_RULES.md §3）
    "destroyDownToOwnCount",
    "sacrificeOwnNexusesThenEnemyDestroysOwn",
    // 相手本人に手札から選ばせてデッキの上へ戻す（type.ts の定義コメントで明言。BS07-013 ディーシャ）
    "opponentHandToDeckTop",
    // 取り先（リザーブ／トラッシュ／フィールドの個体）を1個ずつ相手が選ぶ（BS02-094 ブラッディレイン）
    "opponentCoresToVoidByTotal",
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
// 2026-09-13 に S7 を全9件仕分けて語尾を追加した。「できない」しか見ておらず、
// 「使えない」「支払えない」「戻せない」の制約文を選択だと誤判定していた（6件）。
// **可能動詞の否定形は「選ばせる余地が無い」の印**なので、語尾ごとに足していく
const CONSTRAINT_SUFFIX_RE =
    /(できない|できなくなる|なければならない|しかできない|使えない|支払えない|戻せない|置けない|得られない|選べない)/

// 「相手は可能ならブロックする」型。**ブロッカーを選ぶのは通常のブロック宣言**であって
// 効果の中の選択ではないので、効果データに選択者を書く必要がない
// （燃えさかる戦場／翼持つ者の空域／ワーニングアタック／激神皇カタストロフドラゴン／闘将カタパルドス）
const FORCED_BLOCK_RE = /ブロック(する|しなければ)/

// S7 で「読んで問題なしと確認した」もの。**理由を必ず添える**。
// 語尾や kind では機械的に落とせないもの（ハンドラの中で選択者を渡している等）だけをここに書く
const S7_VERIFIED: Record<string, string> = {
    // ハンドラが requestChoice に chooserPid＝コアを失う側を渡している
    // （cores.ts coresDownToLimitHandler「選ぶのはコアを失う側」）。効果文の「相手は」と一致
    "BS10-019-e2": "ハンドラが chooserPid にコアを失う側を渡している（2026-09-13 確認）",
    // ハンドラが分岐先の destroy / destroyNexus に chooserIsTarget:true を渡している
    // （mill.ts millThenDestroyByCardTypeHandler）。データ側からは見えない
    "BS14-111-e1": "ハンドラが chooserIsTarget:true を渡している（2026-09-13 確認）",
    // fieldEvent の actionPid が相手になる＝効果文の「相手は」と一致（S6 でも確認済み）
    "BS11-063-e1": "効果文の主語が「相手は」で、actionPid も相手になる（2026-09-13 確認）",
}

// 選択者が相手に焼き込まれた action を**ノード単位**で集める。
// 次の2つは主語が「自分は」でも食い違わない:
//   random:true         … 誰も選ばない（「内容を見ないで破棄する」）
//   chooserIsSource:true … 選択者を発生源の持ち主に差し替えてある（「手札すべてを見て」）
function collectOpponentChoosesActions(effects: Record<string, unknown>[]): string[] {
    const found: string[] = []
    for (const eff of effects) {
        walk(eff, (key, value, node) => {
            if (key !== "type" || typeof value !== "string") return
            if (!OPPONENT_CHOOSES_ACTION_TYPES.has(value)) return
            if (node.random === true) return
            if (node.chooserIsSource === true) return
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

// ============================================================
// S8: 重複（同じ action を OR で2エントリに分けている）
// ============================================================
//
// SD01-027 溶岩の大瀑布「【覚醒】/【激突】を持つ自分のスピリットが…1枚ドローする」を
// winnerKeywordFilter 違いの2エントリで書いていたため、**両方を持つスピリット**
// （X004 龍星神ジーク・メテオヴルム）で2枚引いていた（2026-08-17 に修正）。
//
// 危ないのは「1体が同時に複数持てる」フィルタ（キーワード・系統・色）での分割だけ。
// 下のキーが差分にあるものは**構造的に排他**なので、分けて書いても二重発火しない。
const EXCLUSIVE_KEYS = new Set([
    "levels", // レベルで排他
    "role", // 1回のバトルで自分は attacker か blocker のどちらか
    "battleRole",
    "trigger", // 誘発イベントが別（onSummon / onAttack / onBlock…）
    "event", // fieldEvent のイベントが別（ownMagicUsed / opponentMagicUsed…）
    "step",
    "phase",
    "phaseTurn",
    "turn",
    "condition",
    "magicCostEquals", // 1枚のマジックのコストは1つ
    "winnerNameContains", // 1体が両方の名前を含むことはない
    "byBattleOnly",
])

// 同一カード内で action が完全一致するエントリ対
function pairsOfSameAction(effects: Record<string, unknown>[]): [Record<string, unknown>, Record<string, unknown>][] {
    const out: [Record<string, unknown>, Record<string, unknown>][] = []
    for (let i = 0; i < effects.length; i++) {
        for (let j = i + 1; j < effects.length; j++) {
            const a = effects[i]
            const b = effects[j]
            if (!a || !b) continue
            if (a.kind !== b.kind) continue
            if (!("action" in a) || !("action" in b)) continue
            if (JSON.stringify(a.action) !== JSON.stringify(b.action)) continue
            out.push([a, b])
        }
    }
    return out
}

// id と action を除いた差分キー
function diffKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    keys.delete("id")
    keys.delete("action")
    return [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
}

interface SemGap {
    axis: "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8"
    cardId: string
    name: string
    textEvidence: string
    implKinds: string
}

const gaps: SemGap[] = []
// VERIFIED に登録済みで、実際に検出（＝除外）されたキー。残りは古くなった登録として警告する
const usedVerified = new Set<string>()

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
            if (S3_VERIFIED[card.cardId] !== undefined) usedVerified.add(`S3:${card.cardId}`)
            else
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
                const verifiedKey = `${card.cardId}|${header.slice(0, 30)}`
                if (!matchesTiming(decls, phase, side)) {
                    if (S4_VERIFIED[verifiedKey] !== undefined) {
                        usedVerified.add(`S4:${verifiedKey}`)
                        continue
                    }
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
            // 読んで問題なしと判定済みのものは出さない（理由は S6_VERIFIED に書いてある）
            if (typeof eff.id === "string" && S6_VERIFIED[eff.id] !== undefined) {
                usedVerified.add(`S6:${eff.id}`)
                continue
            }
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
        // 読んで問題なしと判定済みのカードは出さない（理由は S7_VERIFIED に書いてある）
        const s7Verified = card.effects.some((e) => {
            if (typeof e.id !== "string" || S7_VERIFIED[e.id] === undefined) return false
            usedVerified.add(`S7:${e.id}`)
            return true
        })
        if (aiteSent && !s7Verified && !hasChooserEvidence(card.effects)) {
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

    // ---- S8 重複（OR を2エントリに分けたための二重発火） ----
    if (!axisFilter || axisFilter === "S8") {
        for (const [a, b] of pairsOfSameAction(card.effects)) {
            const diff = diffKeys(a, b)
            // 差分に「構造的に排他な軸」が1つでもあれば、同時に成立しないので安全
            if (diff.some((k) => EXCLUSIVE_KEYS.has(k))) continue
            gaps.push({
                axis: "S8",
                cardId: card.cardId,
                name: card.name,
                textEvidence: `同じ効果を2エントリに分けている（${a.id ?? "?"} / ${b.id ?? "?"}）`,
                implKinds: `${String(a.kind)}：差分は ${diff.join(",") || "(完全同一)"}`,
            })
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
        S8: "S8 重複（同じ効果を OR で2エントリに分けていて、両立すると二重発火する）",
    }
    const order: SemGap["axis"][] = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]
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

    // 登録したのに検出されなくなった VERIFIED（実装が変わった＝消し忘れ）を出す
    const stale = [
        ...Object.keys(S3_VERIFIED).map((k) => `S3:${k}`),
        ...Object.keys(S4_VERIFIED).map((k) => `S4:${k}`),
        ...Object.keys(S6_VERIFIED).map((k) => `S6:${k}`),
        ...Object.keys(S7_VERIFIED).map((k) => `S7:${k}`),
    ].filter((k) => !usedVerified.has(k))
    if (stale.length > 0 && !axisFilter && !cardFilter) {
        console.log(`\n⚠️ 検出されなくなった VERIFIED 登録（消してよい）: ${stale.join(" / ")}`)
    }
}
