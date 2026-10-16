// 対戦全体の状態 GameState（サーバーだけが持つ。クライアントへは GameView に写して渡す）
import type { EffectAction } from "./effectAction"
import type { PendingChoice, ResumeFrame } from "./choice"
import { PlayerId, Phase, Color, CardType, GameEvent, EndStepLock, DestroyContext, CardInstance, PlayerState, BattleState, TimedRecord } from "../type"

// ゲーム全体の状態（サーバーで一元管理）
export interface GameState {
    gameId: string
    turn: number // 通算ターン数（p1→1, p2→2, ...）
    turnPlayer: PlayerId
    phase: Phase
    priorityPlayer: PlayerId
    isFlashTiming: boolean
    flashCount: number
    battle: BattleState | null
    players: Record<PlayerId, PlayerState>
    log: string[]
    winner: PlayerId | null
    endAttackStepAfterBattle: boolean // 今のバトルが終了したときアタックステップを強制終了するか（サイレントウォール用）
    extraStepAfterAttackUsed?: true // BS15-X04 Lv2 をこのターンに使った（ターン終了でリセット）
    extraMainStep?: true // BS15-X04 Lv2 で行っている追加のメインステップ中。アタックステップへは進めず、ターン終了でエンドステップへ（ターン終了でリセット）
    secondMainStep?: true // 第2メインステップ中（アタックステップの後にもう一度行うメインステップ。先攻1ターン目を除く全ターンに存在。2026-10-06）。アタックステップへは進めず、ターン終了でエンドステップへ（ターン終了でリセット）
    oweSecondMain?: true // このターンにアタックステップを経由した＝第2メインステップがまだ残っている（toAttackPhase で立て、第2メインステップへ入るときに消す）
    secondMainDone?: true // このターンに第2メインステップを既に行った（BS10-008 の追加アタックステップの後には第2メインをもう行わない。ターン終了でリセット）
    extraAttackStepPending?: true // **アタックステップとエンドステップをもう1回ずつ行う**（BS10-008 火星神龍アレス・ドラグーン）。
    // PhaseManager.endTurn が「エンドステップの誘発を解決した直後・一時状態のリセット群の前」でこれを見て、
    // ターンプレイヤーを交代せずアタックステップへ戻す。**一度使ったら消す**（同じターンに何度も戻らないため）。
    // ⚠️ この位置より後ろでリセットするとターン終了時の一時状態（tempBpBuff 等）が消えてしまうので、
    // 分岐はリセット群より前でなければならない
    timedEffects: TimedRecord[] // 期間つき効果の記録（docs/design/TIMED_EFFECTS.md）。ターン終了・バトル終了で until に応じて消える
    endStepLocks: EndStepLock[] // エンドステップを数える封印（BS10-108 ルナティックシール）。**ターン終了でリセットしない**
    turnEndActions?: { ownerPid: PlayerId; action: EffectAction; sourceCardId?: string }[] // atTurnEnd
    attacksThisTurn: number // このターンに宣言されたアタックの回数（doAttackで加算・ターン終了でリセット）。「ターンの最初のアタック」判定に使う（BS04ダックル／燃えさかる戦場Lv2）
    lastAttackerCombinedPid?: PlayerId // 直前のアタック宣言が合体スピリットによるものだったとき、そのアタッカーの持ち主（doAttackが宣言のたびに更新。それ以外はundefined）
    prevAttackerCombinedPid?: PlayerId // 「1つ前」の lastAttackerCombinedPid（doAttackが次の宣言の直前にスライドさせる）。ターン開始でどちらもリセット（「次にアタックした」はターンをまたがない。BS10-047赤ずきん妖精ルージュLv3）
    lastDestroyedNexus: { pid: PlayerId; cardId: string } | null // 直近に破壊されたネクサス（destroyNexusが誘発の直前に記録）。reviveLastDestroyedNexus が参照する（BS04戦闘獣ジャッカー）
    lastBattleDestroyedCores: number // 直前のバトル解決でBP比較により破壊されたブロッカーが持っていたコア数（次のバトル解決の冒頭でリセット。魔界七将デストロード）
    lastBattleBlockerCardId?: string // このバトルでブロックを宣言したスピリットのカード（ブロック宣言時に記録。スワップがあれば最後のブロッカー。
    // 26系【地鳴】の減算記録の材料で、バトル終了時点で防御側のトラッシュにこのカードがあるかを見る）
    lastBattleBlockerTrashCost: number // 上記のうちスピリットカードのみを対象に、バトル終了時点で防御側のトラッシュにあったカードの印刷コストの合計
    // （EffectCounter "lastBattleBlockerTrashCost"。0=ブロックされていない／ブロッカーがトラッシュに無い）
    lastBattleDestroyedLevel: number // 直前のバトル解決でBP比較により破壊されたブロッカーのcurrentLevel（次のバトル解決の冒頭でリセット。0=まだ発生していない。魔界伯爵ヴィール）
    lastBattleDestroyedCardId?: string // トラッシュから探す用（インスタンスは破壊後に消える）
    lastBattleDestroyedInstanceId?: string // 直前のバトル解決でBP比較により破壊された側の instanceId
    // （action:"battleLoserCoresToVoid" が読む。破壊待機中＝コアがまだ乗っている間に呼ぶ前提。BS10-065 ヘッジボルグ）
    revealedCards?: { pid: PlayerId; cardIds: string[] } // 「デッキを上からN枚オープンする」の公開ゾーン（両者に見える一時領域）。
    // deckReveal が積み、手札に加える／デッキの下に戻す処理が終わったら消す。cardZone:"reveal" の選択元になる
    magicRedirectTo?: { pid: PlayerId; instanceId: string } // 解決中のマジックの対象が1体へ絞り込まれている間だけ立つ（kind:"magicTargetRedirect"。この pid のスピリットのうち instanceId 以外は、そのマジックの効果を受けない）。resolveMagic が解決の前後で設定・解除する
    // 「そのマジックの効果の対象を、このスピリットのみに**できる**」の任意性（BS04サンク／BS05スノーホワイト）。
    // 対話モードでは resolveMagic が守る側に1回だけ確認し、その答えをこのマジックの解決中ずっと使う
    // （アクションごとに聞き直さない）。**非対話（テスト・自動解決）ではセットされず、従来どおり自動で絞り込む**
    magicRedirectDecision?: { sourceInstanceId: string; approved: boolean }
    // 「手札1枚を破棄することで、その効果を受けない」（BS08竜騎集う円卓Lv2）の答え。
    // **1回の対象化につき1つ**だけ立ち、resume を解決し終えたら消える。
    // 手札の破棄は聞いた時点で済ませてあるので、resistanceAgainst 側はこの値を読むだけでよい。
    // **非対話（テスト・自動解決）ではセットされず、従来どおり払える限り自動で払う**
    payNegateDecision?: { targetInstanceId: string; paid: boolean }
    meisaiPaidFor?: string // 【迷彩】の支払いを選択で済ませた対象（tryMeisaiToll が1回だけ読んで消す）
    summonSurchargePaid?: string // 無償召喚で転召の祭壇などの余分を払った「効果の記録枠:召喚者」（同時召喚は1回。logic/summonSurcharge.ts）
    summonBatch?: string[] // 効果で同時に召喚している個体の instanceId。召喚時効果は全員を出してから選んだ順に発揮する（summon.ts の flushSummonBatch。RESUME_STACK §6.2）
    // 封印された魔導書Lv1（kind:"bothSidesTargetRedirect"）の「対象を相手のみ／自分のみに変更できる」の答え。
    // **keepPid が対象として残る側**（null＝変更しない＝両陣営のまま）。魔導書の持ち主とマジックの使用者は
    // 別人でありうる（『自分のターン』中に相手がフラッシュで使った場合）ので、
    // 「持ち主から見た自分／相手」ではなく残す側の PlayerId をそのまま持つ。
    // 対話モードでは resolveMagic が魔導書の持ち主に1回だけ確認し、そのマジックの解決中ずっと使う。
    // **非対話（テスト・自動解決）ではセットされず、従来どおり持ち主に有利な側へ自動で固定する**
    magicSideDecision?: { sourceInstanceId: string; keepPid: PlayerId | null }
    // 「無償で使えるが、あえてコストを払って使う」を選んだ直後だけ立つ（doCastMagic が立て、
    // resolveMagic が読んですぐ消す）。**oncePerBattle の無償化の枠を消費させない**ために使う
    // （払って使ったのだから、1枚きりの枠は残る。BS07大天使イスフィール）
    magicFreeDeclined?: boolean
    // 直前に bpBuff が BP を増加させた対象の instanceId。効果文が「〜をBP+2000する。**そのスピリットが**〜」と
    // 前の文を指しているカードで、後ろの文を対象1体に限定するために使う（BS07ニードルショット）。
    // 直後の lendSelfThisBattle が仮想発生源の lentBuffTargetId へ写して、そこから battleWon が読む
    lastBpBuffTargetId?: string
    // いま解決中の効果の発生源（resolveAction が handler を呼ぶ間だけ立ち、抜けるときに元へ戻す）。
    // 「**相手の〈色〉のスピリット/ネクサス/マジックの効果で**〜されたとき」を判定するために使う
    // （fieldEvent.sourceColorFilter）。ドローステップのドローやコアステップのコア置きのような
    // **効果によらない**動きでは undefined のままなので、それだけで「効果によるものか」を区別できる。
    // 詳細は docs/design/EFFECT_SOURCE_CONTEXT.md
    currentEffectSource?: { pid: PlayerId; type?: CardType; colors?: Color[]; instanceId?: string; cardId?: string } // instanceIdはresolveActionのself（発生源インスタンス）が確定しているときだけ載る（BS15共通器：BS15-042オリンピアの天使アラトロンLv2「そのスピリットを相手のデッキの下に戻す」＝デッキ破棄を起こしたスピリット自身を特定するために使う）
    resolvingBurstPid?: PlayerId // バースト効果を解決している間だけ、その持ち主を載せる（coreReturnBonus.ownBurstOnly が読む。BS14-019シュテン・ドーガ）
    lastBattleDestroyedColors: Color[] // 直前のバトルで「BPを比べ相手のスピリットだけを破壊した」ときの**破壊された側**の色（次のバトル解決の冒頭でリセット。TargetFilter.sameColorAsBattleLoser が参照。BS04獣使いドヴェルグ）
    lastBattleDestroyedFamilies: string[] // 同上の系統（TargetFilter.sameFamilyAsBattleLoser が参照。BS04ニーベルングリング）
    lastOpponentSpiritDestroyedFamilies: string[] // 直近に発火した fieldEvent "opponentSpiritDestroyed" の対象（破壊された相手のスピリット）の系統。
    // TargetFilter.sameFamilyAsDestroyed が読む（removal.ts の発火直前にセット。BS16-027コーカサス・リョフ・ビートル）
    summonEffectSource?: { pid: PlayerId; instanceId: string; cost: number; colors: Color[]; resolved?: true } // resolved＝召喚時効果を実際に発揮した（BURST.md §10 C）
    resolvingSummonTriggerPid?: PlayerId // スピリットの『このスピリットの召喚時』効果を解決している間だけ立つ、その発生源の持ち主
    // （fireSummonTrigger が設定し、選択待ちで中断した場合は残して handleAction の事後フックがクリアする。
    // ConstraintDef.immuneToOpponentSummonEffects を isEffectBlocked が判定するために使う。BS05リトルナイト・ランスロットLv3）
    lastBattleDestroyedBp: number // 同上の実効BP（破壊直前に測る。0=まだ発生していない。TargetFilter.sameBpAsBattleLoser が参照。BS03熾烈極める最前線Lv2）
    // このバトル中に自分の【暴風】で疲労させた相手のスピリット（BS06颶風高原Lv2 が「【暴風】で疲労した
    // 相手のスピリットすべて」を参照する）。バトルごとの記録なので clearBattle でクリアする
    // bofuSourceInstanceId：疲労させた側の【暴風】持ちスピリットのinstanceId（自分自身の【暴風】での疲労のときのみ入る。
    // TargetFilter.bofuExhausted:"self" がこれをselfと突き合わせて「このスピリットの【暴風】で疲労させた」を絞り込む。BS14-032）
    bofuExhaustedThisBattle: { pid: PlayerId; instanceId: string; bofuSourceInstanceId?: string }[]
    // 〔バトル1回〕（kind:"activated" の oncePerBattle）の発動済み記録。activatedUsedTurn（ターン単位）とは別に
    // バトル単位で数え、clearBattle で消える（次のバトルではまた使える）。キーは `${instanceId}/${effectId}`
    activatedUsedBattle?: Record<string, true>
    lastBattleDestroyedCost: number // 同上のコスト（破壊直前のカード記載コスト。0=まだ発生していない。mill の countCounter:"lastBattleDestroyedCost" が参照。BS06名誉ある御前試合）
    pendingChoice: PendingChoice | null // 効果解決中のプレイヤー選択（非null中は resolveChoice 以外のアクションを拒否する）
    // 同時破壊グループ（destroyTargetsBatch の1回の呼び出し＝1グループ）。
    // 他カードの「〜が破壊されたとき」（fieldEvent ownSpiritDestroyed/opponentSpiritDestroyed）と
    // 他の発生源の reviveOnDestroy を、このグループの間は`${発生源instanceId}:${effectId}`単位で1回にする
    // （perDestroyed指定の効果は対象外。公式Q&A Q22359。docs/design/TIMING_CHART.md）。
    // 中断・入れ子の破壊に備え、destroyTargetsBatch/resumeDestroyBatch が退避・復元する
    destroyGroup?: { id: string; memberIds: string[]; used: string[]; familiesByPid: Partial<Record<PlayerId, string[]>> }
    // 破壊後バースト（kind:"burst".event:"ownSpiritDestroyed"）が発火を待つ列。
    // commitPendingDestructionが確定のたびに1件積み、ブレイヴの「残す/残さない」まで決着した後
    // （handleAction末尾のfireQueuedDestroyBursts）でgroupKey+pid単位にまとめて1回だけ発火する
    pendingBurstDestroyQueue?: {
        pid: PlayerId
        groupKey: string // 同じ破壊（同時破壊グループのid、または単体破壊ならinstanceId）をまとめる単位
        cardId: string
        colors: Color[]
        hostCost: number // ホスト自身のコスト（合体中のブレイヴぶんは含まない。braves側で別途足す）
        braves: { instanceId: string; cost: number }[] // 破壊時に合体していたブレイヴ。トラッシュへ行った分だけ発火時にhostCostへ加算する
        byOpponentEffect: boolean
        destroyedBp: number
    }[]
    burstEventColors?: Color[] // 破壊後バースト発動時、破壊された全メンバーの色の和集合（burstEventCostと同じ寿命）。条件{burstDestroyedColor}が読む
    burstTaxUnpaid?: number // 発動中のバーストに掛かった税のうち、まだ払われていない数。0でなければ thenPay も止める（effectTax.ts）
    burstEventLifeDamagerId?: string // event:"ownLifeDamaged"のバースト発動時、ライフを減らしたスピリットのinstanceId（burstEventCostと同じ寿命。取れなければundefined）
    lastDeckMill?: { pid: PlayerId; cardIds: string[] } // 直近の破棄（toDeck.fromEvent が読む。次の破棄で上書き）
    summonPaidWithSoulCore?: true // 直近の召喚・マジック使用のコストの支払いに[ソウルコア]を使ったか
    keishoExcludedCardIds?: string[] // 直近の召喚・マジック使用の《継召》で除外したカード（毎回の召喚・使用で上書き＝《継召》不使用なら空配列。コストを払わない使用でも空にする。条件{ownKeishoExcludedTeamAtLeast}・{keishoUsedForSummon}が読む）
    // 直前の「破壊される代わりに復活できる」の確認で、**結局その個体が破壊されたか**。
    // 破壊バッチ（destroyBatch フレーム）が中断から再開したときに、中断の原因になった1体を
    // 「破壊できた数」に算入するかの判定に使う（断って破壊された＝算入する。RESUME_STACK.md §7 ①）。
    // 承認して場に残った／手札へ戻った場合は false。読み取ったら消す
    lastReviveDestroyed?: boolean
    // 直前の「どの体から破壊処理をするか」（PendingChoice.destroyOrder）でターンプレイヤーが選んだ instanceId。
    // 破壊バッチ（destroySpiritsFrom）が再開時に読み取り、その個体を残りの先頭へ入れ替えて消す。
    // 同時発揮の一般則（docs/design/TIMING_CHART.md §0-3）
    destroyOrderPick?: string
    // 直前の「どの誘発から解決するか」（PendingChoice.triggerOrder）でターンプレイヤーが選んだ番号。
    // 誘発バッチ（ResumeFrame の triggerBatch）が再開時に読み取り、読んだら消す
    triggerOrderPick?: number
    // ターンプレイヤーが選んだ側。destroySpiritsFrom が読み取って解決順を組み立て、読んだら消す
    // 召喚の途中で、**まだ場に出していない**スピリットの instanceId（2026-08-20）。
    // 【転召】は「召喚コスト支払い後・維持コアを置く前」に解決するため、その間だけ立つ。
    // これが立っている間は『転召したとき』の誘発を保留する（下の pendingTenshoEvent）
    summoningFromHand?: true // いま解決中の召喚が**手札からの召喚**か（通常召喚・効果による手札からの召喚のどちらも）。fireSummonSequence が読んで「手札から召喚されたとき」（fieldEvent.fromHandOnly。BS11-X05 魔導双神ジェミナイズ）に渡し、そこで消す
    summoningBySoku?: true // いま解決中の召喚が【神速】によるものか（フラッシュタイミングの手札からの召喚）。fireSummonSequence が読んで「【神速】の効果で召喚されたとき」（fieldEvent.sokuSummonOnly。BS11-065 満天の牧草地Lv2）に渡し、そこで消す
    summoningInstanceId?: string
    // 保留した『転召したとき』（fieldEvent "ownTensho"）。召喚されたスピリットが場に出た時点で発火する。
    // 保留しないと、召喚されたカード自身が持つこの誘発（BS08-009関将龍皇ドラグロン等6枚。
    // 効果文では『召喚時』ブロックの一部）を拾えない
    pendingTenshoEvent?: { pid: PlayerId; families: string[]; names: string[] }
    // 合体スピリットが場を離れて、**コアを乗せずに分けて置いてある**ブレイヴ（BRAVE.md §6.3.1）。
    // 場のどのゾーンにも属さない一時的な置き場で、flushBraveKeeps が1体ずつ決着させる
    // （残す＝コアを置いて field.spirits へ／残さない＝トラッシュへ）。
    // **答えが返るまでエントリを消さない**ので、確認が別の中断に上書きされても保険の flush で拾い直せる
    pendingBraveKeeps?: { pid: PlayerId; brave: CardInstance; wasAttacker: boolean; wasBlocker: boolean }[]
    resumeStack: ResumeFrame[] // 中断した処理の再開情報。先頭から順に消化する（docs/design/RESUME_STACK.md）
    resumeInsertAt: number // 「今回の中断で積まれた領域の末尾」を指す挿入位置。
    // 中断が始まるたび（pendingChoice を立てるたび）に 0 へ戻す。
    // **単純な push / unshift ではどちらも解決順が壊れる**：1回の中断では内側の層から外側の層へ順に
    // フレームが積まれ、正しい順は「内側 → 外側 → それ以前の中断の古いフレーム」。RESUME_STACK.md §3
    // 「破壊される代わりに復活**できる**」（reviveOnDestroy.optional）の確認待ち行列。
    // 破壊処理の途中では中断できない（destroySpirit の呼び出しはループの中にあり、
    // pendingChoice の queue は EffectAction の列しか運べない）ため、いったん破壊を見送って
    // ここへ積み、handleAction の末尾＝安全な地点で1件ずつ確認する
    pendingReviveConfirms?: {
        pid: PlayerId
        instanceId: string
        effectId: string // 適用する reviveOnDestroy エントリのid（承認時にコスト・復活先を再解決する）
        sourceInstanceId: string // 発生源（oncePerTurn の記録先。scope:"self" なら対象自身）
        context?: DestroyContext // 断ったときに破壊し直すための文脈
    }[]
    effectFizzled?: true // 効果が、対象がいない・コストを払えないなどで**何も起こさずに終わった**ことを示す一時フラグ。
    // 起動能力（kind:"activated"）と、oncePerTurn を持つ triggered / fieldEvent が見る。
    // 立てた側の効果は「発揮していない」ので、**「ターンに1回」の消費を巻き戻す**
    // （RULES_BATSPI_WIKI.md：払えなければ発揮していないのだから消費もしない。2026-09-16）。
    // 立てっぱなしにしないよう、見た側が毎回落とす
    drawStepSkipped: boolean // このターンのドローステップのドローを、効果のコストとして放棄したか（BS07常闇の聖堂Lv2「ドローしないことで」）。ドローの前に発火する step.beforeStepAction の効果が立て、ドロー区間がこれを見て引かずに進む。ターン開始処理の先頭で false に戻す
    coreStepSkipped: boolean // このターンのコアステップの「ボイドからリザーブへコアを置く」を、効果のコストとして放棄したか（BS10-087戦場に息づく命「ボイドからコアを自分のリザーブに置かないことで」）。drawStepSkipped と同型で、コア置きの前に発火する step.beforeStepAction の効果が立てる
    interactiveTargets: boolean // trueなら誘発効果の対象選択候補2件以上でpendingChoiceを要求する（既定false。実対戦では server/src/index.ts が true に設定。smokeは既定のfalseのまま自動選択を使う）
    events: GameEvent[] // クライアント演出用の一時イベント列（handleAction冒頭でクリア）
    eventSeq: number // GameEvent.seq の通し番号（クリアしてもリセットしない）
    spiritVanishedThisTurn?: Partial<Record<PlayerId, true>> // このターンに、そのプレイヤーのスピリットが消滅（維持コア割れ。破壊とは別）した
    oppSpiritRemovedByEffectThisTurn?: Partial<Record<PlayerId, string[]>> // このターンに、そのプレイヤーの効果で相手のスピリットが破壊("destroy")／消滅("vanish")された記録。スピリット/マジックの効果なら "sm:" 付きも積む（26RBS01-026・X06）
    selfSummonCostUsedNames?: Partial<Record<PlayerId, string[]>> // このターンに「手札のこのカードを召喚する時、〜ならコストNにする」（ターンに1回）で召喚したカード名
    ownSpiritWithOnDestroyDestroyedByOwnEffect?: Partial<Record<PlayerId, true>> // このターンに、そのプレイヤー自身の効果で破壊された、破壊時効果（onDestroy の誘発）を持つそのプレイヤーのスピリットがいたか（26RBS02-076。カードが静的に持つ効果で判じる）
    ownSpiritDestroyedByOwnEffectColors?: Partial<Record<PlayerId, Color[]>> // このターンに、そのプレイヤー自身の効果で破壊された、そのプレイヤーのスピリットの色（破壊時の色。26RBS02-X05）
    ownSpiritDestroyedThisTurn?: Partial<Record<PlayerId, true>> // このターンに自分のスピリットが破壊された（26系「このターンに自分のスピリットが破壊されていたなら」）
    magicEffectsUsedByName?: Partial<Record<PlayerId, string[]>> // このターンに使ったマジック効果の "カード名|timing"（EffectDef.oncePerTurnByName の判定。2026-10-08 ユーザー確定）
    lifeLostThisTurn?: Partial<Record<PlayerId, true>> // このターンにライフが1以上減ったプレイヤー（26系「このターンに自分のライフが減っていたなら」）
    magicIdsUsedThisTurn?: Partial<Record<PlayerId, string[]>> // このターンに各プレイヤーが使用したマジックのカードID（record.ts の recordMagicUsed）
    magicUsedThisTurn: Record<PlayerId, number> // このターンに各プレイヤーがマジックを使用した回数（ターン終了でリセット。magicRestriction:"oncePerTurnAll"用。作戦参謀フォクシン）
    coreGainCountThisTurn: Record<PlayerId, number> // このターンに各プレイヤーが相手の発生源の coreGainCap の対象となる配置で置いたコアの累計（サーバー内部のみ）
    millCountThisTurn: Record<PlayerId, number> // このターンに各プレイヤーが相手の効果でデッキを破棄された累計枚数（ターン終了でリセット。globalConstraint "millCap" の perTurn用。BS04侵されざる聖域Lv2。隠匿情報を含まないがGameViewには含めない＝サーバー内部のみで判定に使う）
    millCountThisTurnMutual: Record<PlayerId, number> // 器AM：このターンに各プレイヤーが**誰の効果であっても**デッキを破棄された累計枚数（ターン終了でリセット。globalConstraint "millCap" の mutual用。millCountThisTurnとは別集計＝相手効果限定の既存カードを巻き込まない。BS13-026キグナ・スワンMk-II）
    battleAttackerRef?: CardInstance // 今のバトルのアタッカーの**実体参照**（GameViewには含めない＝サーバー内部のみ）。
    // アタッカーが場を離れてバトルが終わるとき、＞７の【光芒】判定に cardId とコア数が要るため保持する。
    // 場から取り除かれた後でもオブジェクト参照からは読み取れる（resolveBattle が attacker を
    // ローカル変数で持ち回っているのと同じ考え方）。clearBattle で消す
    lastFunsai?: { total: number; spirits: number; nexuses: number; magics: number; costAtLeast4: number } // 直前の【粉砕】で破棄した内容（resolveFunsaiが記録）。アタック宣言のたびにクリアする（doAttack冒頭）。EffectCounter "lastFunsaiTotal"/"lastFunsaiSpirits"とtriggered.condition {lastFunsaiHasNexus}が参照する（BS03巨人王ランドルフ／BS04二刀流のアムブローズ／BS04伝説巨人ジュード）。costAtLeast4はBS15共通器：破棄したカードのうちコスト4以上の枚数（BS15-053コジロンド・ゴレムLv2-3：「コスト4以上のカードを破棄したとき」）
    lastMoved?: Record<string, string[]> // 枠ごとの直前に動いたカード（logic/record.ts）
    lastLeftCosts?: Record<string, Record<string, number>> // 枠ごと・cardId ごとの、待機状態に入ったときのコスト（logic/record.ts）
    lastCores?: Record<string, number>
    lastNexusCost?: Record<string, number> // 枠ごとの、直前に破壊した自分のネクサスの印刷コスト（logic/record.ts。ほかの破壊が lastMoved を書き換えても残る）
    lastDrawn?: Record<string, number> // 枠ごとの直前のドローで引いた枚数（logic/record.ts）
    lastTargets?: Record<string, string[]>
    recordScope?: string
    bpSeen?: Record<string, number> // instanceId -> 前回観測した実効BP（ownSpiritBpReached の「前回値」。BPが届いたかを判定する効果が場に無いときは消す。サーバー内部のみ）
    flashEffect?: true // いまフラッシュ効果（マジックのフラッシュ・【起動：フラッシュ】）を解決中（ownSpiritBpUpByFlash の判定用。中断しても pendingChoice.flashEffect 経由で再開時に戻す）
    burstEventCost?: number // BS15共通器：バースト発動時、eventInfo.costsの先頭値を一時的に積む（EffectCounter "burstEventCost" が読む。confirmを経由する対話モードでもpendingChoice.burstActivate.destroyedCostへ引き継いで復元する。BS15-084爆砕轟神掌／BS15-X06鉄の覇王サイゴード・ゴレム）
    lastMagicUsed?: { pid: PlayerId; cardId: string } // 直近にマジックの効果の発揮を終えた使用者とカード（fireMagicUsedTriggers が ownMagicUsed の発火前に記録。returnLastUsedMagicToHand が読む）
    lastMagicCast?: { pid: PlayerId; cardId: string; timing: "main" | "flash"; targetInstanceId?: string } // 直前にプレイヤー自身が手札/手元から使用したマジック（doCastMagic・castMagicFromTrashByColorが記録。action:"magicMirrorRepeat"が参照する。**フラッシュタイミングが閉じた時点**でクリアされ、それより前の使用は対象にならない＝フラッシュ①で使われたマジックをフラッシュ②で写すことはできない。バトル終了時（clearBattle）にもクリアする。BS08マジックミラー）
    magicUsedVia?: string // いま解決中のマジックの使用経路（"majutsu"=【魔述】による無償使用。resolveMagicが書き、action "if" の magicUsedVia 条件が読む。通常の使用はundefinedで上書きされる）
}
