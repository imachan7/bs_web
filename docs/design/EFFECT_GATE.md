# 操作ごとの「できるか」の問い合わせ（下書き・2026-10-29）

禁止（「〜できない」）と耐性（「〜されない」「効果を受けない」）を、操作ごとの1つの問い合わせにまとめる計画。
同じ判定が「候補の列挙」「使用時・払える判定」「解決」「クライアントのボタン」に別々に書かれ、
片方の経路でだけ見落とすバグが続いた（#312・#315・#316・サテライド・バード）のが動機。

## 1. 決まったこと（2026-10-29 ユーザー合意）

- **問い合わせの単位は ACTION_VOCABULARY §3 の単純なアクション1つ**（召喚・破壊・戻す・ドロー・コアを取り除く…）。
  効果全体を実行前に1回判定するのではない（「その後」の後半は前半の結果で変わる）。操作を行うその時点で聞く
- 使用時・払える判定（COST_MODEL §1）は、同じ問い合わせを「試しに聞くだけ」（今の `probing`）で回す
- **置換効果（「代わりに〜する」）は入れない**。許す／止めるではなく中身を変えるため
- 複数の PR に分けて、操作の種類ごとに移す。この文書で問い合わせの種類と分類を先に決める

## 2. 問い合わせに持たせる情報（案）

今の `EffectAttempt`（`shared/rules/resistance.ts`：操作・対象指定か範囲か・誰の効果か・発生源の種類と色）に足す:

| 情報 | 例 | 読む禁止・耐性の例 |
| :-- | :-- | :-- |
| 動く元と先（`from`／`to`） | 手札→フィールド、トラッシュ→手札、デッキ→トラッシュ | 「トラッシュから手札に戻せない」「手札に戻らない」 |
| 原因（`cause`） | 効果／アタック／コスト／ルール（リフレッシュステップ・BP比較） | 「効果で」「コストで」「あらゆる原因で」 |
| 効果の種類 | バースト効果／召喚時効果／マジック／ネクサス | 「バースト効果で召喚できない」「相手の召喚時効果を受けない」 |
| 時点 | メインステップ中、自分のターン | 「メインステップ中はドローできない」 |

## 2.5 耐性の貫通（「〜の効果で防げない」）（2026-10-29 ユーザーと検討中）

例：BS45-X01 龍星の射手リュキオース【龍射撃】「この『BP破壊効果』は一切の効果で防げない」。
Q7409＝【装甲】・「効果を受けない」・「破壊されない」に防がれない。Q7415＝【影武者】【煌空蝉】で対象を変えることはできる。

- 耐性（`Resistance`）に**発生源**を持たせる：その耐性を書いているカード（種類・色・持ち主）と、キーワード（装甲系）か効果か。
  スピリット自身の効果文・キーワードの耐性は、そのスピリット自身が発生源
- 貫通は問い合わせ側（`EffectAttempt`）に「無視する耐性の条件」として持たせる。判定は「効く耐性を集める → 貫通に当たるものを外す → 残れば止まる」で、§1 の2段（効果を受けない／操作ごと）を区別しない
- 貫通は効果全体ではなく、その効果の中の1つの操作に付く（「この『BP破壊効果』は」）
- **「装甲を含む」は【装甲】【重装甲】と今後の「〇〇装甲」すべて**（2026-10-29 ユーザー確認）
- **「〜できない」型の制限も貫通される**（`coresCantBeRemoved*`「コアは取り除けない」・`nexusIndestructible` など。お互いに効くものも、効果で操作を防いでいるので同じ扱い。2026-10-29 ユーザー確認）
- **ブレイヴの【合体時】効果は、合体スピリットに効果を足す扱い**。発生源はブレイヴのカードではなく合体スピリット（色・種類は合体スピリットで見る）。「スピリットの効果で防げない」はブレイヴ由来の【合体時】の耐性も貫通する（2026-10-29 ユーザー確認。根拠：効果の記述を持たないスピリットに、合体中／スピリット状態の効果を持つブレイヴを合体すると「効果の記述を持つ合体スピリット」として扱う。カブトガメ・式鬼魔神のような効果の無いブレイヴは例外）
- 「相手のブレイヴの効果を受けない」（`braveImmune`）が防ぐのは、ブレイヴのカード自身が発揮する効果（召喚時・バースト・スピリット状態の効果）。【装甲】では防げなかったこれらを防げるのが【装甲】との違い（2026-10-29 ユーザー提示）。【合体時】効果は合体スピリットの効果なので `braveImmune` では防がない。今の `resistance.ts` はこの形（合体中の効果は sourceType "spirit" で来る）
- 貫通の書き方の一覧（batspi.com「カード効果：自分の効果は相手の効果で防げない」。2026-10-29 ユーザー提供）から、貫通は**2つの軸の組み合わせ**で書ける:

  | 軸 | 値 | 例 |
  | :-- | :-- | :-- |
  | どの操作に付くか | その効果の中の操作名（「BP破壊効果」「指定アタック」「コア除去効果」「除外効果」「手札/デッキに戻す」）／発生源の効果すべて（「自分の〇〇の効果は防げない」） | 【龍射撃】＝BP破壊効果、サンダー・Z・バイソン＝指定アタック |
  | どの耐性を無視するか | すべて（「一切の」「すべての」）／陣営（「相手の効果では」「お互いの」）／耐性の名前（「装甲」を含む・【PS装甲】・【弾幕】・【転神】…）／発生源の属性（色・コスト・カードの種類）。それぞれ「〜では防げない」（それを無視）と「〜以外では防げない」（それ以外を無視）の向きがある | 【龍射撃】＝すべて、サンダー・Z・バイソン＝「効果名に『装甲』を含む効果では防げない」 |
- 「指定アタック」も貫通の対象なので、**効果による指定アタックは問い合わせに入れる**（§3 の「入れない候補」から外す。【装甲】が防いでいるのは効果による指定）
- 例外：「フィールドに残る」効果（破壊後に待機から戻る）は防ぐ効果ではないので、貫通されても働く（同ページの裁定）。効果そのものを発揮できなくする（【レーザーボレー】の無効など）も貫通とは別
- **量の制限も同じ枠に入れる**（`coreFloor*`「N個より減らない」・`millCap`・`lifeDamagePerSpiritPerTurn` など）。問い合わせの答えは「止める／許す」に加えて「Nまで許す」を返す。量の制限も防ぐ効果なので貫通される（2026-10-29 ユーザー確認）
- **防ぐ効果ではないので貫通されないもの**：対象の変更（【影武者】【煌空蝉】。Q7415）、「対象にならない」（2026-10-29 ユーザー見解：効果を防ぐところには効いていない）。今の `ResistanceCategory` では `untargetable`・`magicRedirect`・`meisai`（指定時のコスト要求）がこちら

## 3. 分類（たたき台。ユーザーと1行ずつ精査する）

今の型の名前から、どの操作の問い合わせに入るかを振り分けた。**「?」は分類に迷う行**。

| 操作 | 禁止・耐性（今の型の例） | 迷う点 |
| :-- | :-- | :-- |
| 召喚 | `noBurstSpiritSummonForPid`・`noSummonByEffect`・`summonLimitByEffectForOpponent`・`summonLimitByCostForOpponent`・`maxSpiritsOnField` | `maxSpiritsOnField`（旋風渦巻く渓谷）は禁止。メインステップ中なら効果による召喚にも効き、貫通される（2026-10-29 ユーザー確認。今は通常の召喚にしか効いていない＝PR 2 で直す） |
| 破壊 | `nexusIndestructible`・`ownNexusIndestructible`・`noBpCompareDestroy`・`immunityGrant` | BP比較の破壊も同じ問い合わせ（`cause:"bpCompare"`）。耐性は効く原因を持つ：「効果で破壊されない」「効果を受けない」は効果のときだけ、`noBpCompareDestroy` と原因を限らない「破壊されない」はBP比較も防ぐ。貫通は効果の操作にだけ付く（2026-10-29 ユーザー確認） |
| 戻す | `allSpiritsCantBounce`・`immunityGrant` | |
| 手札に加える | `noHandGainByEffect`・`noTrashRecovery`・`opponentCantReturnFromTrashToHand`・`handGainBlocked` | 禁止は2種類：**行き先で効く**もの（「手札に加えられない」は、ドロー（効果）・戻す（手札へ）・手札に加えるのどれでも `to: hand` なら効く。今の `noHandGainByEffect` の形）と、**操作で効く**もの（`noDrawInMain` はドローだけ）。ドローはデッキ切れの敗北があるので操作としては別のまま（2026-10-29 ユーザー確認） |
| ドロー | `noDrawInMain`・`noDrawOutsideDrawStep` | |
| 破棄（トラッシュに置く） | `noDeckMill`・`noDeckMillByOpponent`・`noDeckMillInMain`・`millCap`・`noHandDiscardByEffect`・`noHandDiscardInMain`・`handImmuneForPid` | `millCap` は量の制限（§2.5） |
| コアを取り除く | `coresCantBeRemoved`・`coresCantBeRemovedAll`・`coresCantBeRemovedByOpponent`・`battlingCoresProtected`・`coreFloorByCost` 等 | `coreFloor*` は量の制限（§2.5） |
| コアを置く | `noVoidToLife`・`coreGainCap`・`voidCoreBlockedOutsideCoreStep` | |
| ライフを減らす | `lifeImmuneForPid`・`ownLifeFloor`・`noLifeDamageByCost`・`ownLifeImmuneToSpiritEffects`・`cantReduceOpponentLife*`・`lifeDamagePerSpiritPerTurn` | 「1回に減るのはN個まで」は量の制限（§2.5） |
| 疲労 | `exhaustImmunityGrant`・`opponentNexusesUnexhaustable`・`exhaustPreventByPay` | 払って防ぐ（`exhaustPreventByPay`・`targetNegateByHandDiscard`）は問い合わせの答えが「払えば止まる」になる |
| 回復 | `noRefresh`・`noRefreshByAnyEffect`・`noRefreshByNexusOrMagic`・`nexusesCantRefresh`・`opponentCombinedCantRefresh` | |
| 合体／分離 | `cantCombine`・`cantSeparate`・`opponentCantSpiritStateBrave` | |
| 効果を受けない（すべての操作に横断） | `immuneToOpponentEffects`・`immuneToOpponentSummonEffects`・`battlingEffectImmune`・`braveImmuneGrant` | 操作ごとではなく、全操作の問い合わせが共通に読む層か |
| **入れない候補** | アタック・ブロックの可否（`cantAttack`・`cantBlock`・`unblockableBy`…）、マジック・バーストの使用（`cantUseMagicForPid`・`noBurstEffectForPid`・`magicNegate`…）、コストの増減 | 効果の操作ではなくプレイヤーの行動の可否。別の問い合わせ（行動の可否）にするか |

## 4. PR の計画（§3 の「?」は 10-29 にすべて決着）

1. ✅ サテライド・バード（#319）。`burstSummonBlocked` を召喚の全経路の候補判定から呼ぶ
2. **召喚の問い合わせ**（設計を10-29に確定）
   - `server/src/logic/summonGate.ts`（新規）に `summonDenial(state, attempt): string | null`（止める理由。null＝召喚できる）。`attempt = { pid, cardId, from: "hand"|"trash"|"burst"|"deck"|"revealed", cause: "normal"|"effect", flash?: true, braveTargetInstanceId?: string, viaBurstAction?: true }`
   - 集める禁止：`noSummonByEffect`（cause effect）・`noBurstSpiritSummonForPid`（今の `burstSummonBlocked`）・`maxSpiritsOnField`（メインステップ中、cause を問わない。ダイレクトブレイヴは体数が増えないので対象外のまま）・`summonLimitByCostForOpponent`・`summonLimitByEffectForOpponent`（from:"hand" だけ）
   - 呼ぶ所：通常の召喚（RuleValidator の validateSummon・【烈神速】）と、効果による召喚の候補判定・安全網（今 `burstSummonBlocked`／`summonByEffectBlocked` を呼んでいる所すべて）
   - **一般則（10-29、旋風渦巻く渓谷で確認）：召喚の制限は、効果文に「通常の召喚」と書かれていなければ効果による召喚にも効く**。旋風渦巻く渓谷・夢想法師サンゾール・未完成の古代戦艦：帆の3枚が、今は通常の召喚にしか効いていない
   - 2a に入れないもの：効果の種類の持ち回り（#319 の既知の制限）は 2b、`summonRepeatFromHand` の統一は 2c（挙動を変えない作業なので分ける。10-29 ユーザー了承）
   - ✅ **2b の設計（10-30 確定）**：「いまバースト効果そのものを解決中か」を `state.currentEffectSource.burst` で持つ（解決中の印 `resolvingBurstPid` の置き換え）。
     立てるのはバースト効果の入口4か所（`keywords/burst.ts` の2か所・`choice.ts` のバースト確認後・`handBurstEffect.ts`）。
     入れ子の `resolveAction` は、**発生源のインスタンスが無く同じカードの解決**（バースト効果の子のアクション）だけが引き継ぐ。召喚されたカードの召喚時効果など、別の効果の解決は発生源が変わるので引き継がない（＝#319 の既知の制限が直る。バーストで召喚されたゾロ自身の召喚時効果も、インスタンスがあるので引き継がない）。
     選択待ち（`PendingChoice`）・再開スタック（`ResumeFrame`）を作るときに `burst` を保存し、再開で戻す。
     読む側（`summonGate.ts`・`removal.ts` の `ownBurstOnly`・`triggers.ts` の `burstSummonOnly`）を `currentEffectSource.burst` に移し、`resolvingBurstPid` は消す
   - **2c の設計（10-30）**：`summonRepeatFromHand`（データは兵隊アントマン1枚）を `summon{from:"hand", repeatWhileChosen, payCost, skipOnSummon}` で書く。
     「まとめて選び、合計コストを1回で払う（【転召】の対象は決定の後・支払いの前。10-15 ユーザー確認）」は手順の違いなので、`summonRepeat.ts` はそのまま残し、内部専用の type（`summonBatchPaidInternal`）にする。`summon{from:"hand"}` の入口が `repeatWhileChosen && payCost` のときそちらへ振り分ける。`mode:"free"` は使うカードが無いので消す
3. ✅ **貫通の最初の形**（#324）：`EffectAttempt.pierce:"all"`（一切の効果で防げない）だけを入れた。耐性の発生源（色・種類で絞る貫通に要る）は、該当カードを取り込むときに足す。元の案：**耐性に発生源、問い合わせに貫通**（§2.5）。今のプールに貫通のカードは無いので、型と判定の形だけ入れ、場面テストは【龍射撃】相当を組んで確かめる
4. ライフを減らす（ライフのコストと `lifeCrush` が同じ問い合わせを呼ぶ。量の制限を含む）
   - **ライフを減らす処理なら原因を問わず（アタック・効果・コスト）、ライフの制限はすべて効く**。減ったコアの行き先（リザーブ・ボイド・トラッシュ）も問わない。効果文の「スピリット」はお互いのスピリットを指すので、自分のスピリットの効果のコストで自分のライフを置くのも「そのスピリットから減らされた」に数える（10-30 ユーザー確認）
   - 「お互いのライフは、ターンごとにスピリット1体から1まで」は**プレイヤーごと**に数える（スピリットXが相手のライフを1減らした後でも、自分のライフはXからまだ減らされていない。10-30 ユーザー確認）。記録は「スピリット×減らされた側」の組ごとに持つ（今は `lifeDealtThisTurn` がスピリットごとに1つ）
   - ✅ **4 の設計（10-30 確定。#325）**：`server/src/logic/lifeGate.ts`（新規）に `lifeLossAllowed(state, a): number`（0〜amount。量で答える）。`a = { pid（減る側）, amount, cause: "attack"|"effect"|"cost", actorPid, sourceType?, sourceInstance?（アタッカーや効果の発生源のスピリット）, floor?（その効果だけの下限。neverZero 用） }`。
     集める制限：`lifeImmuneThisTurn`（原因を問わない）・`cantReduceOpponentLife`（actor≠pid）・`ownLifeImmuneToOpponentSpiritEffects`（cause effect・sourceType spirit・actor≠pid）・下限（`lifeFloorByEffect`・`ownLifeFloorContinuous`・永久凍土の王都の `ownLifeFloor`。今の `lifeCostBlocked` の床もここへ）・スピリット1体からの上限2種（`lifeDamagePerSpiritRemaining`・`ownLifeDamageCapRemaining`。原因を問わず、記録は組ごと）。
     アタックだけの制限（`negateLifeDamageFromTarget`・`lifeDamageMaxForPid`・`noLifeDamageByCost` など）は今の `lifeDamageLimit` に残し、共通の分は `lifeDamageLimit` から `lifeLossAllowed` を呼ぶ。
     減らした後の記録（`recordLifeLost`・組ごとの累計）も1つの関数にする。呼ぶ所：ライフを減らす全11か所（`grep -rn "\.life -=" server/src/logic`）。コストは「全部払えるか」（`lifeLossAllowed < amount` なら払えない）で、`lifeCostBlocked` はこれで置き換える
   - 4 の裁定（10-30 ユーザー確認）：「ターンごとにスピリット1体から1までしか減らされない」は、チャンプボンゴル型（お互い）もシーマ・クリーク型（自分だけ）も、そのスピリットのアタックと効果を合算して数える（今はシーマ・クリーク型がアタックだけ）
5. 以降、§3 の行ごとに1 PR（手札に加える＝行き先で効く禁止、破壊＝BP比較を含む、コアを取り除く＝量の制限、…）
