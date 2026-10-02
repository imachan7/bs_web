# pay への移行手順表（調査役の成果物）

目的：専用の軸（`costReturnSelfToHand` 等）と step の `cost` で書かれた「〜することで〜する」12エントリを、行動 `pay`（`{ cost, then }`）に寄せるための、エントリ別の書き換えと足りない部品の一覧。
実装役はこの表だけを読んで書く（調査をやり直さない）。ルールの判断が要る点は末尾「ユーザー確認が要る点」に分けた。
調査日 2026-10-02。コード・データは未変更。

## 1. エントリ別の表

共通：step／triggered／fieldEvent の `optional` は現状のまま残す（pay は自分で確認を出し、二重には聞かない＝COST_MODEL §10）。`cost`（EffectDef 側）は消す。

| エントリ | 節（60字以内） | 移行後の JSON（`action` の中身） | 足りない部品 | 消せる旧い軸 | 挙動の変化 |
| :-- | :-- | :-- | :-- | :-- | :-- |
| BS14-043-e3 | 開始時、このスピリットを疲労させることで、相手のスピリット1体を指定。アタック時効果は発揮されない | `{"type":"pay","cost":{"type":"exhaust","target":"self","count":1},"then":<既存の timedEffect そのまま>}` | P6（timedEffect の判定に「相手スピリット1体以上」） | step `cost.exhaustSelf` | 確認が毎回出る。疲労済みでも確認は出て、押すと理由がログに出る（旧は黙って発火しない） |
| BS15-032-e1 | 開始時、リザーブのコア1個をトラッシュに置くことで、相手のスピリット1体を必ずアタックさせる | `{"type":"pay","cost":{"type":"removeCores","side":"own","from":["reserve"],"to":"trash","count":1},"then":<既存の timedEffect(mustAttack)>}` | P6 | step `cost.reserveToTrash` | 同上。相手スピリットがいないときは払わない（旧は払って空振り） |
| BS15-023-e3 | このスピリットのコア1個をトラッシュに置くことで、【暴風】持ちの自分のスピリット1体を回復 | `{"type":"pay","cost":{"type":"removeCores","side":"own","target":"self","to":"trash","count":1},"then":{"type":"refreshOne","filter":{"keywords":["bofu"]}}}` | なし | step `cost.selfCoresToTrash` | 回復できる疲労【暴風】持ちがいなければ払わない（旧は払って空振り）。コアを0にすると removeCores の通常手順（スピリットは破壊）が走る可能性。旧は直接減算 |
| BS15-048-e1 | このスピリットのコア1個をトラッシュに置くことで、このターン【粉砕】の破棄を+1枚 | `{"type":"pay","cost":{"type":"removeCores","side":"own","target":"self","to":"trash","count":1},"then":{"type":"lendSelfThisTurn"}}` | なし | step `cost.selfCoresToTrash` | 同上のコア0の扱い。確認が出る |
| BS16-063-e2 | 手札の系統「無魔」のスピリット1枚を破棄することで、1枚ドロー | `{"type":"pay","cost":{"type":"discardSelfChoose","count":1,"cardType":"spirit","family":"無魔"},"then":{"type":"draw","count":1}}` | P3（discardSelfChoose に `family`） | step `cost.discardHandFamily` | 旧は候補2枚以上でコスト最大を自動で破棄。新は持ち主が選ぶ（audit:choices の「勝手に決めていた」が1つ減る） |
| BS12-043-e1（追加） | 開始時、このスピリットを疲労させることで、シンボル2つの合体スピリットのアタックでライフが減らない | `{"type":"pay","cost":{"type":"exhaust","target":"self","count":1},"then":<既存の timedEffect(playerRule)>}`（`optional:true` はそのまま） | なし（playerRule は既に判定が通る） | step `cost.exhaustSelf` | 旧は確認を断っても疲労した簡略化が直る |
| BS13-027-e1 | 開始時、このスピリットを手札に戻すことで、相手のスピリット1体を指定。ライフが減らない | `{"type":"pay","cost":{"type":"returnToHand","target":"self","count":1},"then":{"type":"negateLifeDamageFromTarget"}}` | P4（returnToHand に `target:"self"`）、P7（指定を常に持ち主が選ぶ） | `negateLifeDamageFromTarget.costReturnSelfToHand`／`costPaid` と buff.ts・grant.ts の該当分岐 | 相手スピリットがいなければ戻さない（旧と同じ）。確認が出る。**P7 で BS04-101／BS14-103 の対象指定も選択式になる** |
| BS15-067-e2 | 自分のスピリットが【氷壁】を使用したとき、このネクサスのコア1個をトラッシュに置くことで、そのスピリットを回復 | `{"type":"pay","cost":{"type":"removeCores","side":"own","target":"self","to":"trash","count":1},"then":{"type":"refreshOne","eventTargetOnly":true}}`（fieldEvent の `selfMode:"source"`／`attackerAsTarget:true` はそのまま） | P1（pay が then にイベント対象を渡す）、P2（refreshOne の判定に `eventTargetOnly`） | `refreshOne.costSelfCoresToTrash`（exhaustRefresh.ts 559 付近） | 確認が出る。ネクサスはコア0でも消えない（nexusCoresToTrash の注記と同じ扱いなら変化なし。要実装役の確認） |
| BS13-004-e2 | バトル終了時、このスピリットとコスト3以上の自分のスピリット1体を破壊することで、「神星」を無償召喚 | `{"type":"pay","cost":{"type":"sequence","actions":[{"type":"destroySelf"},{"type":"destroy","side":"own","count":1,"filter":{"cost":{"min":3},"excludeSelf":true}}]},"then":{"type":"summonFromHandFree","familyFilter":["神星"]}}` | P5（destroySelf を payable に） | `summonFromHandFree.costDestroySelfAndCostFilter`／`costSacrificeChosen` の battleFlow.ts 851〜900 付近 | **2体が同時破壊から逐次破壊になる**（判断要）。`filter.cost` は旧の `instBaseCost`（印刷コスト）と実効コストで差が出うる |
| BS13-023-e2 | バトル終了時、このスピリットのブレイヴ1つを手札に戻すことで、このスピリットは回復 | `{"type":"pay","cost":{"type":"returnToHand","target":"selfBrave","count":1},"then":{"type":"refreshSelf"}}` | P4（`target:"selfBrave"`） | `refreshSelf.costReturnOwnBrave`／`costSacrificeChosen` | 確認が出る。ブレイヴが複数なら選ぶ（旧と同じ） |
| BS13-024-e2 | 系統「遊精」の自分のスピリット1体を疲労させることで、このバトルの間、疲労させたスピリットのBPだけBP+ | `{"type":"pay","cost":{"type":"exhaust","side":"own","count":1,"filter":{"family":"遊精"}},"then":{"type":"timedEffect","target":"self","duration":"battle","content":[{"type":"bp","amount":1,"amountCounter":"lastBp"}]}}` | なし（`lastBp` は exhaust side:"own" が記録済み。BS03-131 が同じ形で稼働中。`lastBp` は RULE_COUNTERS に無いので解決時に固定される） | `bpBuff.costExhaustFamily`／`amountFromExhaustedCost`／`costSacrificeChosen`（buff.ts 135〜180） | 確認が出る。非対話の自動選択は旧が実効BP最大、新は最小（smoke のみ影響）。バトル中の期限は `duration:"battle"` で旧 `scope:"battle"` と同じ |
| BS06-074-e3 | 付与：「系統「地竜」の自分のスピリット1体を疲労させることで、このスピリットをBP+(疲労させたスピリットのBP)」 | `granted.action` を `{"type":"pay","cost":{"type":"exhaust","side":"own","count":1,"filter":{"family":"地竜"}},"then":{"type":"timedEffect","target":"self","duration":"turn","content":[{"type":"bp","amount":1,"amountCounter":"lastBp"}]}}` に置換 | なし | `selfBuffByExhaustFamily`（残る使用: BS02-X07-e2・BS06-X24-e2・BS12-050-e3。下の追加3枚も同じ形で移せば型ごと消せる） | 確認が出る（旧は確認なしで自動で疲労）。付与側の自分自身も候補（回復状態なら）は旧と同じ |
| BS08-084-e3 | 付与：「ターン中に1回まで、自分のネクサス1つを疲労させることで回復できる」（【強襲：1】） | **移さないことを推奨**（下記 §3） | P8（自分のネクサスを疲労させる cost）＋ターン中の回数上限を keyword の count から読む仕組み | — | — |

## 2. 足りない部品

どれも「1つの部品」。新しい専用 type は作らない。

| 部品 | 最小の形 | 使うエントリ | 実装場所 |
| :-- | :-- | :-- | :-- |
| P1 pay が then にイベント対象を渡す | payHandler で `ctx.targetInstanceId` を **then にだけ**渡す（`ctx.resolve(a, { targetInstanceId })` と frame の `targetInstanceId`）。cost には渡さない（exhaust side:"own" 等は `targetInstanceId` を「選択結果」と読むため）。CHECKERS の引数に省略可能の `eventTarget?: string` を足す | BS15-067-e2 | actions/pay.ts |
| P2 refreshOne の判定に eventTargetOnly | `eventTargetOnly` のとき、`eventTarget` が自分の疲労状態のスピリットなら true（いまは常に false） | BS15-067-e2 | actions/pay.ts の CHECKERS.refreshOne |
| P3 discardSelfChoose に family | `family?: FamilyFilter`（カードの `family` に含まれるか。スピリット以外のカードは cardType で絞る）。`discardSelfChooseEligible` に1分岐 | BS16-063-e2 | types/effectAction.ts・actions/drawDiscard.ts（385 付近） |
| P4 returnToHand に target | `target?: "self" \| "selfBrave"`（exhaust／removeCores の `target:"self"` と同じ並び）。self＝`returnSpiritToHand(self)`（自分のコストなので耐性判定なし）、selfBrave＝`detachBraveByEffect`＋`returnSpiritToHand`（exhaustRefresh.ts 774〜800 の処理を移す。2体以上なら選ばせる）。判定：self が場にいる／`braveRefs` が1以上。PAYABLE_TYPES には既にある | BS13-027-e1、BS13-023-e2（追加で BS14-X03-e4） | types/effectAction.ts・actions/bounce.ts・actions/pay.ts |
| P5 destroySelf を payable に | PAYABLE_TYPES に `"destroySelf"` を足し、CHECKERS は「self が自分の場にいる」。新しい欄なし | BS13-004-e2 | actions/pay.ts |
| P6 timedEffect の判定に相手スピリット | target 未指定で playerRule 以外のとき、`filter`（既定は無条件）に合う相手のスピリットが1体以上なら true。いまは `target:"self"` か playerRule だけ true で、相手を指定する書き方は常に false | BS14-043-e3、BS15-032-e1 | actions/pay.ts の CHECKERS.timedEffect |
| P7 negateLifeDamageFromTarget の対象を常に選ばせる | `costReturnSelfToHand` に結びついた「対話時は持ち主が選ぶ」分岐（grant.ts 289 付近）を、フラグなしの常時動作にする | BS13-027-e1（BS04-101・BS14-103 に波及） | actions/grant.ts |
| P8（移さない場合は不要）自分のネクサスを疲労 | `exhaust` の `nexus` は相手側専用。`side:"own"` と併用したときの自分のネクサス版が要る | BS08-084-e3 | actions/exhaustRefresh.ts |

## 3. BS08-084-e3（【強襲】）を移さない理由

【強襲】は 25 エントリ（`refreshSelfByExhaustNexus` を使う data の行数）が keyword として共有する能力で、次を `refreshSelfByExhaustNexus` ハンドラが持つ。1枚だけ pay に移しても型もハンドラも消えず、規則が二重になる。

- ターン中の回数の上限（`kyoshuUsed`、キーワード entry または keywordGrant の `count` から読む）。pay にも `oncePerTurn` にも「回数を別の entry から読む」手段が無い
- `canExhaustNexus`（BS09-063 の制約）の確認
- ブロック時の発揮（GameEngine.ts 1161 が同じアクションを直接呼ぶ）

移すなら 25 エントリを一括で、P8＋「回数上限の記録」の2部品を足す別バッチにする。今回の12エントリからは外すのを推奨。

## 4. 追加で同じ形に移せるエントリ（旧い軸を型ごと消すため）

| エントリ | 今の書き方 | 移行後 | 消せるもの |
| :-- | :-- | :-- | :-- |
| BS12-043-e1 | step `cost.exhaustSelf`（上の表に含めた） | exhaust target self → 既存 timedEffect | step の `cost` 型ごと（下 §5） |
| BS02-X07-e2（triggered onAttack・optional） | `selfBuffByExhaustFamily` 武装 | BS06-074-e3 と同じ形、family だけ「武装」、duration turn | `selfBuffByExhaustFamily` |
| BS06-X24-e2（onBattleStart・optional） | 同上 | 同上 | 同上 |
| BS12-050-e3（activated flash・固定 +3000） | `selfBuffByExhaustFamily` amount 3000、family なし | cost は filter なしの exhaust own、then は timedEffect self bp amount 3000（counter なし） | 同上 |
| BS14-X03-e4（onBattleEnd・optional） | `bpBuff` 3000 ＋ `costReturnSelfToHand` | cost は P4 の returnToHand self、then は bpBuff 3000。**注意：判定は支払い前に走るため、bpBuff の判定が自分自身を候補に数えて通ってしまう。「自分の他のスピリット」を判定する欄（bpBuff の filter に excludeSelf）が先に要る** | `bpBuff.costReturnSelfToHand`／`costPaid`（ここまで消えて axis が全消去できる） |

`costReturnSelfToHand` を消すには BS13-027 と BS14-X03 の両方、`selfBuffByExhaustFamily` は上の4枚の全部が条件。

## 5. step の cost を pay に寄せたら消せる triggers.ts の分岐

step の `cost` を使う data は 6 エントリのみ（BS12-043-e1、BS14-043-e3、BS15-023-e3、BS15-032-e1、BS15-048-e1、BS16-063-e2）。全部移せば次が消える。

| 場所 | 内容 |
| :-- | :-- |
| triggers.ts 1022〜1036 | 発火前の払える判定（exhaustSelf／reserveToTrash／selfCoresToTrash／discardHandFamily） |
| triggers.ts 1053〜1080 | 発火確定時の支払い（疲労／リザーブ→トラッシュ／自コア→トラッシュ／手札の最大コスト自動破棄） |
| types/effectDef.ts 174 付近 | step の `cost?:` と直下の説明コメント |

他の kind の `cost`（activated／magicNegate／reviveOnDestroy／deckMillNegate）は別の処理で、今回は触らない。`PhaseManager.ts:31` の `cost: effect.cost` は activated 用なので残る。

## 6. 他に使われていない旧い軸（grep -rn の結果）

| 旧い軸 | data の使用箇所 | 12エントリ移行後 |
| :-- | :-- | :-- |
| costReturnSelfToHand | BS13-027、BS14-X03 | BS14-X03 も移せば消せる |
| costSelfCoresToTrash | BS15-067 のみ | 消せる |
| costDestroySelfAndCostFilter | BS13-004 のみ | 消せる（`costSacrificeChosen` は summonFromHandFree の別用途が残るか要確認） |
| costReturnOwnBrave | BS13-023 のみ | 消せる |
| costExhaustFamily／amountFromExhaustedCost | BS13-024 のみ | 消せる |
| selfBuffByExhaustFamily | 上記4枚 | 4枚すべて移せば消せる |
| refreshSelfByExhaustNexus | 25 | 消せない（§3） |
| refreshOne.eventTargetOnly | BS15-067 のみ | **消せない**（pay の then で使うため残る） |

## 7. ユーザー確認が要る点（ルールの判断。推測で決めない）

1. **BS13-004 の同時破壊** → **同時に破壊する**（2026-10-02 ユーザー確認）。`sequence` で逐次にせず、2体を同じタイミングで破壊する（自身の【破壊時】を相手の破壊より前に挟まない）
2. **BS04-101／BS14-103（P7）**：「相手のスピリット1体を指定する」を、いまの自動選択（BP最大）から持ち主が選ぶ形にする。BS13-027 は旧から選択式。
3. **確認の出し方**：step／fieldEvent で `optional` を持たない BS14-043-e3 などにも pay の確認が出る（COST_MODEL §10 の決定の適用。旧は黙って払うか黙って不発）。毎回の相手アタックステップで出るので、頻度が気になるなら AI／自動承認の方針が要る。
4. **自コアを払って0になる場合**（BS15-023・BS15-048） → **効果は発揮する**（Q3576・2026-10-02 ユーザー提示）。コア0（Lv0）で場を離れるのは通常の手順どおりで、それでも then は解決する。BS15-067（ネクサス）は消滅しない
5. **バトル中の疲労スピリットの BP**（BS13-024・BS06-074）：`lastBp` は疲労させた後の実効BPを数える。旧も同じ（exhaustSpirit の後に `effectiveBp` を取る分岐と、事前に取る分岐がある。buff.ts 175 は疲労後）。差が出るカードは見つかっていないので判断は不要だが、念のため記載。

## 8. 副次的に見つけたこと

BS13-068（遥かなる衛星砲）は `attackerAsTarget:true` ＋ `pay{ then: returnToHand }` で「そのスピリットを手札に戻す」を書いているが、現状の pay は then にイベント対象を渡さない。P1 を入れると挙動が変わる（意図どおりアタッカーを戻すようになる見込み）。→ P1 は #242 で実装した（part463）。
