// 個体に掛かる制約 ConstraintDef（アタック・ブロック・効果の対象などの禁止と強制）
import type { CardPick } from "./effectAction";
import { Color, FamilyFilter, ImmuneSource, Keyword } from "../type";

export type ConstraintDef =
    | { type: "cantBlock" } // このスピリットはブロックできない
    | { type: "canBlockUnblockable" } // このスピリットは、「ブロックされない」効果を持つ相手のスピリットもブロックできる（継続的な制約・ターン限定の印の**どちらも**乗り越える。2026-08-14 ユーザー確認。BS09-049炎蜥蜴クトゥグマ）
    | { type: "cantBlockLowerBp" } // 自分より実効BPが低いアタッカーをブロックできない
    | { type: "unblockableBy"; noSoulCore?: true; levelAtMostAttacker?: true; colorFilter?: Color; keywordFilter?: Keyword; keywordFilterAbsent?: Keyword; familyFilterAbsent?: FamilyFilter; maxCores?: number; maxCost?: number; maxBp?: number; levelFilter?: number[]; costNot?: number; costAtMostAttacker?: true; nonVanilla?: true; requireOwnFieldColorNexus?: Color; requireOwnCostCountAtLeast?: { cost: number; count: number } } // このスピリットのアタックが、条件を満たすスピリットにブロックされない。*Absent は「持たない」側。maxCost はブロッカーの付与コストも見る。require* は持ち主の盤面が条件を満たす間だけ有効（activeConstraints が外す）
    | { type: "coresImmovableByOpponent" } // このスピリットのコアは相手の効果では移動できない（相手の効果の coreRemove をすべて防ぐ。発生源の種別を問わない。26RDB01-025）
    | { type: "untargetableByOpponentMagic" } // 相手のマジックの効果では指定されない（対象指定のみ。範囲効果は届く。26RDB01-049 Lv2 を constraintGrant で付与）
    | { type: "blockPayCost"; count: number; noStackId?: string } // このスピリットをブロックする時、相手はcountコスト支払わなければブロックできない（リザーブ＋フィールドのコアから選んで払う。2026-10-08 ユーザー確認。26RDB01-X06）。noStackId＝〔重複不可〕：同じ値の制約は何体から受けても1回分（2026-10-08 ユーザー確認）
    | { type: "blockReserveToTrash"; count: number } // このスピリットがアタックしている間、相手はブロックする時にリザーブのコアcount個をトラッシュに置かなければブロックできない（リザーブからだけ払う。26RCB01-050）
    | { type: "blockExhaustSpirit" } // このスピリットがアタックしている間、相手はブロックする時にブロックするスピリット以外の自分の回復状態のスピリット1体を疲労させなければブロックできない（疲労させる個体はブロックする側が選ぶ。いなければブロックできない。26RSD06-X01）
    | { type: "blockRequiresCount"; count: number } // このスピリットのアタックは、相手がスピリットをcount体そろえてブロック宣言しないとブロックできない（BS10-X03巨蟹武神キャンサード＝2体）。
    // 効果文は「スピリット2体か、**アルティメット1体**でないとブロックできない」だが、アルティメットは未実装のため2体ブロックだけを見る。
    // count体そろえられないときはブロックそのものができない。宣言は BattleState.pendingBlockerIds に貯まり、
    // そろった時点で**アタック側**がどれとバトルするかを選ぶ（PendingChoice.blockBattlePick。「どれか1体とだけバトルする」）
    | { type: "mustAttack" } // このスピリットはアタックできるとき、必ずアタックしなければならない
    | { type: "protectOwnLifeByBpUpToSelf" } // ブロックされなかったアタッカーの実効BPが**この発生源自身の実効BP以下**のとき、そのアタックでは発生源の持ち主のライフは減らされない（片側のみ。ライフダメージ直前に activeConstraints から発生源ごとのBPを引き直して比較する。BS08空帝竜騎プラチナム）
    | { type: "untargetableByOpponent" } // このスピリットは相手のスピリット/マジックの効果の対象にならない（クイーン・ワルキューレ。範囲効果には無力）
    | { type: "immuneToOpponentSummonEffects" } // このスピリットは、相手のスピリットの『このスピリットの召喚時』効果を受けない（isEffectBlockedがGameState.resolvingSummonTriggerPidを見て判定する。BS05リトルナイト・ランスロットLv3）
    | { type: "immuneToOpponentEffects"; against?: ImmuneSource | ImmuneSource[]; whileOwnNexusCount?: number } // このスピリットは、相手のスピリット/マジックの効果を受けない（untargetableByOpponentと異なり範囲効果にも有効。ネクサスの効果・自分の効果は通る。BS04ワルキューレ・ヒルド）。against:"spirit"指定時は相手の**スピリットの**効果のみ（マジックは通る。BS10-091シャボンの湖畔Lv2＝「相手のスピリットの効果を受けない」）。whileOwnNexusCount指定時は「持ち主のフィールドのネクサス数がちょうどこの数の間」だけ有効（BS11-027 海戦機ニヨルド）。against:"brave"指定時は相手の**ブレイヴの**効果のみ（BS11-055 ジャノメ・シールダーの【合体時】＝「相手のブレイヴの効果を受けない」。合体中のブレイヴが発生源のとき srcType は "brave" になる）。against:"magic"指定時は相手の**マジックの**効果のみ（スピリットの効果は通る。BS15共通器：BS15-060バンディット・アームズ【合体時】：「相手がバーストをセットしている間、このスピリットは相手のマジックの効果を受けない」）
    | { type: "canDirectAttack"; targetFilter: "rested" | "singleCore" | "recovered" | "any"; targetMinBp?: number; targetMinCost?: number; targetCombinedOnly?: true; targetHighestBp?: true } // targetCombinedOnly指定時は相手の**合体スピリット**しか指定できない（instIsCombinedで判定。BS11-X02 滅神星龍ダークヴルム・ノヴァ）。// targetMinCost指定時は相手スピリットのコストがこれ以上のもののみ指定できる（instMatchesCostFilterで判定＝道化師クランの付与コストも見る。BS05天焦がす大聖火Lv2：コスト5以上） // 相手スピリット1体を指定してアタックできる（targetFilter: rested=疲労状態のみ、singleCore=コア1個のみ、recovered=回復状態のみ、any=状態条件なし。イリュージョナ／牛霊スモゥグ／オルカリア）。targetMinBp指定時は相手スピリットの実効BPがこれ以上のものだけ指定できる（BS05シンクロニシティ：BP4000以上。BP条件だけで絞りたい場合はtargetFilter:"any"と組み合わせる）
    | { type: "cantCombine" } // このスピリットにはブレイヴを合体できない（BS11-X02 滅神星龍ダークヴルム・ノヴァ＝「このスピリットは合体できない」）。判定は shared/summon.ts の braveCombineCandidates（合体先の候補から外す）
    | { type: "combineLimit"; limit: number } // このスピリットに合体できるブレイヴの上限数（既定1）。判定はshared/summon.tsのcombineLimitFor（braveCombineCandidates／RuleValidatorのダイレクトブレイヴ判定が共通で読む。器P。BS13-X01光龍騎神サジット・アポロドラゴン：「ブレイヴ2つまでと合体できる」）
    | { type: "ignoreBraveCondition" } // 器BI：このスピリットには、合体条件を満たさないブレイヴも合体できる（matchesBraveConditionが最初に見る。BS13-X05麒麟星獣リーン：「合体条件を無視して合体できる」）
    | { type: "cantSeparate" } // この合体スピリットは分離できない（BS13-005強暴竜ディラノ・レックス：【超覚醒】を持つ自分の合体スピリットすべて）。判定はactiveConstraintsを見る3入口（メインステップの任意分離 validateDetachBrave／効果による自分の分離 detachBraveByEffect／相手の効果による分離 detachBraveByOwnerChoice）すべてで共有する
    | { type: "cantAttack"; whileNoOwnSoulCore?: true; whileNoOwnFamilySpirit?: string; unlessOpponentHasColorSpirit?: Color; whileOwnNexusCount?: number } // このスピリットはアタックできない（カイザレオン大帝Lv1）。whileOwnNexusCount指定時は「持ち主のフィールドのネクサス数がちょうどこの数の間」だけ有効（BS11-027 海戦機ニヨルド＝ネクサスが1つだけある間）。unlessOpponentHasColorSpirit 指定時は「持ち主から見た相手のフィールドに指定色のスピリットがいない間」だけ有効（activeConstraints が判定して外す。BS04鎧装獣ヘイズ・ルーン＝赤）
    | { type: "lifeDamageBonus"; amount: number; ifOwnEffectVanishedOpponentSpirit?: true; ifOwnTrashAtLeast?: { pick: CardPick; count: number } } // このスピリットのアタックで相手のライフが減る量（減るコア）を+amount（シンボル数とは別。ライフ減少の上限は超えない）。ifOwnEffectVanishedOpponentSpirit＝このターンに自分の効果で相手のスピリットが消滅していたときだけ（26RBS01-X06）。ifOwnTrashAtLeast＝自分のトラッシュに pick に合うカードが count 枚以上あるときだけ（26RDB01-X05）
    | { type: "lifeDamageToVoid" } // このスピリットがアタッカーとしてライフダメージを与えるとき、相手のライフから取り除かれるコアはリザーブでなくボイドへ（スライミーLv3）
    | { type: "noRestWhenBlockingColor"; color: Color } // このスピリットが指定色のスピリットをブロックしたとき疲労しない（巨神機トール）
    | { type: "noRestWhenBlockingCost"; maxCost?: number; sameCost?: true } // このスピリットが、コストmaxCost以下（sameCost指定時は自身と同じコスト）の相手のスピリットをブロックしたとき疲労しない（noRestWhenBlockingColor の兄弟。BS07シルバー・ゴレム／造兵工房）
    | { type: "noRestWhenBlockingWithoutKeyword"; keyword: Keyword; oncePerTurn?: true } // このスピリットが、指定キーワードを**持たない**相手のスピリットをブロックしたとき疲労しない（noRestWhenBlockingColor/Cost の兄弟。BS07ブリシンガメンの首飾りLv2＝【転召】を持たない相手）。
    // oncePerTurn 指定時は「ターンに1回」に制限する（消費した**発生源**を PlayerState.noRestWhenBlockingUsedThisTurn に記録。ネクサス1枚につき1回なので、同名を2枚置けば2回使える。2026-08-24）
    | { type: "noRefresh" } // このスピリットはリフレッシュステップで回復しない（スクルディア）
    | { type: "coresCantBeRemoved" } // **お互い、このスピリットのコアを取り除けない**（BS10-X01 幻羅星龍ガイ・アスラ）。
    // 2026-08-25 ユーザー確認で「文字どおり。効果でもプレイヤーによる操作でも取り除けない」。
    // ⚠️ **自分の効果・自分の操作も止める**ので、`boardResistanceAgainst` の「ここから下は相手の効果限定」
    // より**前**で判定する（battlingEffectImmune と同じ位置）。
    // プレイヤー操作は3入口で止める：コアの手動移動（moveCore）・コストの支払い元（validatePaySources）・
    // 【覚醒】の移動元（validateAwaken）
    | { type: "tenshoCoreSubstitute"; mode?: "rest" | "returnToHand"; familyFilter?: FamilyFilter; costFilter?: number } // このスピリットが【転召】の対象になったとき、疲労していなければ、疲労することでコアすべてを指定場所に置いたものとして扱う（実際にはコアを失わない代替。dumpAllCoresTenshoが判定する。BS05の竜使い6枚）。familyFilter/costFilter指定時は対象スピリットの絞り込み用（自分自身ではなく**他の発生源から宣言**される想定＝BS12-061剣の誕生地。この場合、疲労するのは対象スピリットではなく**宣言した発生源自身**。activeConstraintsWithSourceが familyFilter/costFilter 一致で他の発生源から合流させる）
    // mode:"returnToHand" 指定時は、疲労の代わりに**このスピリットを手札に戻す**ことで同じ扱いにする
    // （SD02-009 獣将軍クジャルタ）。手札に戻る＝通常のバウンスなので**上のコアはリザーブへ行く**
    // （「指定場所に置いたものとして扱う」は【転召】の条件を満たすための扱いで、実際に置くわけではない。
    //  2026-08-16 ユーザー確認）。疲労版と違い、既に疲労していても使える。「疲労させることで」は**任意**なので、interactiveTargets時は「疲労する／コアを置く」の選択を出す（自動時は疲労を選ぶ決定的簡略化）
    // levelAtMostAttacker：ブロッカーのcurrentLevelがアタッカーのcurrentLevel以下ならブロックできない
    // （costAtMostAttacker の Lv 版。SD02-012 天の城門Lv2＝「同じLv以下の相手のスピリットからブロックされない」）
    | { type: "canBlockWhileRested"; targetMaxCost?: number; targetKeywordExclude?: Keyword; targetMaxBp?: number; targetCombinedOnly?: true }
