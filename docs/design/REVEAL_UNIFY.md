# オープン系17 type の統合前調査（事実集め）

正解は決めない。設計担当がスキーマを決めてユーザーに相談するための事実だけをまとめる。

## §0 共通関数のメモ

- `requestCardChoice`（targeting.ts:413-457）：`cardZone:"reveal"|"hand"` の card choice を出す。**選ぶのは常に呼び出し元が渡した `pid`**（chooserPid 未指定なら効果の所有者 owner。17種はどれも chooserPid を渡していない＝選ぶのは常に効果の持ち主）。候補1枚・`alwaysAsk=false`・chooserPid未指定なら**選択を出さず自動解決**（targeting.ts:437-440）。`alwaysAsk=true` なら候補1枚でも選択（スキップ可）を出す。中断しうる（`suspend`）。
- `requestActivationConfirm`（targeting.ts:325-345）：「発動する/しない」の option choice（confirm）。中断しうる。
- `summonFreeFromTrashIndex`（summon.ts:210-260超）：トラッシュ経由の無償召喚。**【転召】は必ず解決**（resolveTensho、公式Q&A根拠のコメントがsummon.ts:250付近）、`skipOnSummon`未指定なら召喚時効果・「召喚されたとき」誘発も発揮。中断しうる（転召選択・召喚時効果の対象選択）。
- `summonRevealedFree`（reveal.ts:557-599、reveal.ts内のローカル関数）：公開ゾーンの1枚を直接無償召喚。familyFilter指定時は**【転召】を通常どおり解決**（reveal.ts:588）、familyFilter無指定（keyword版）は**【転召】を解決しない**＝転召済み扱い（reveal.ts:596-598のコメント）。**どちらも召喚時効果は発揮する**（fireSummonTrigger / fireSummonSequence を呼ぶ）。中断しうる。
- `placeNexusRevealedFree`（reveal.ts:604-620）：公開ゾーンの1枚を無償配置。誘発は `notifyNexusDeployed` のみ。中断しない（同期処理）。
- `discardRevealedZone`（reveal.ts:546-554）：公開ゾーンの残りをまとめてトラッシュへ。誘発なし。
- `notifyHandGained`（triggers.ts:1887）：手札に加わったことの通知（「手札が増えたとき」系トリガー用）。中断しないが誘発を積む可能性あり（中身は未確認）。
- `resolveTensho`（keywords/tensho.ts:62）：【転召】の解決。中断しうる（生贄選択）。
- `fireSummonTrigger` / `fireSummonSequence`（triggers.ts:223、summon.ts:56）：召喚時効果・召喚シーケンスの発火。中断しうる。

## §1 1種類1行の表

| type | 使用枚数 | オープン元 | 枚数 | 選ぶ条件 | 選ぶ数 | 行き先 | 残りの扱い | 選ぶ人 | 自動選択 | 中断・再開 | ほか | 根拠(行) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| revealReturnToDeck | 0 | 公開ゾーンの残り（他typeの後始末専用） | 全残り | なし | 順番のみ選択 | デッキ上or下 | ―（自分自身が残り処理） | 効果の持ち主 | 現在の順のまま | 1枚ずつ選択、上戻しはスキップ不可・下戻しはスキップ可 | ― | reveal.ts:14-77 |
| deckReveal | 自分デッキ上 | count or countPer(色/ネクサス数/シンボル数) | pickType/nameIncludes/familyFilter/colorFilter/costFilter一致（pickAllOfTypeならtype一致すべて、pickNoneなら選ばず） | 通常1枚、pickAllOfTypeは複数可、pickNoneは0 | 手札 | discardNonMatching:トラッシュ／returnToTop:デッキ上／既定:デッキ下（公開順のまま） | 効果の持ち主 | 先頭一致1枚（findIndex） | 候補2枚以上でcard choice、選択後chosenCardIndexで再入 | ― | reveal.ts:79-216 |
| revealDiscardRest | 0 | 公開ゾーンの残り（後始末専用） | 全残り | なし | ― | トラッシュ | ― | ― | ― | 中断しない | ― | reveal.ts:218-221,546-554 |
| revealAndSummonKeyword | 自分デッキ上 | count | 指定keyword（静的）またはfamilyFilter、type=spirit | 1枚（できる＝任意） | 無償召喚（keyword版は転召省略／familyFilter版は転召通常解決。どちらも召喚時効果は発揮） | トラッシュ | 効果の持ち主 | コスト最大1枚 | 候補1枚でもalwaysAsk=trueで選択、スキップ時は後始末をresumeキューに積む | returnToDeckBottomAtEndStep指定時はエンド時にデッキ下へ戻すフラグ付与 | reveal.ts:223-307 |
| revealAndSummonAllByFamily | 自分デッキ上 | count（またはcountFromSelfLevel＝発生源の現Lv） | familyFilter＋costFilter(min/max)、type=spirit | 該当する**すべて**（維持コア不足分は除外） | 無償召喚（転召させない・召喚時効果は発揮されない） | 該当せず/召喚不可分はトラッシュ | ― | ― | 選択なし（範囲処理、for文で機械的） | 中断しない（同期for） | ― | reveal.ts:313-355 |
| revealAndSummonAllByKeyword | 自分デッキ上 | count（またはpendingCardIdsで再開） | 指定keyword（静的）、type=spirit | 該当する**すべて** | 無償召喚（転召は通常解決・召喚時効果も発揮） | 非該当分はトラッシュ（先に一括） | ― | ― | 選択なし（whileループで1体ずつ召喚、転召/召喚時効果の選択待ちが出たら`pendingCardIds`に残りを積んでresume） | ― | reveal.ts:366-433 |
| revealTopBurstOneToHandRestBottom | 自分デッキ上 | count | burst効果(kind:"burst")を持つカード1枚（複数なら公開順先頭。決定的簡略化） | 1枚 | 手札 | 公開順のままデッキ下 | ― | ― | 選択なし（findIndex） | 中断しない | ― | reveal.ts:440-464 |
| revealTopFamilyToHand | 自分デッキ上 | count | familyFilter、type=spirit（includeBraves時はbraveも） | 該当する**すべて** | 手札 | 非該当分はトラッシュ | ― | ― | 選択なし（for文） | 中断しない | ― | reveal.ts:467-502 |
| revealTopToHandThenRefreshOwn | 自分デッキ上 | 1 | colorFilter（マジックのときだけ追加効果） | ― | 手札（無条件） | ― | ― | ― | ― | マジック＆色一致ならrefreshOne（別action）に委譲、そちらで中断しうる | 「その後」を別actionのresolveで表現 | reveal.ts:506-522 |
| revealTopToHandIfColorSpiritElseReturnToDeck | 自分デッキ上 | 1 | colorFilter＋type=spirit | ― | 一致：手札／不一致：デッキ上に戻す | ― | ― | ― | ― | 選択なし | ― | reveal.ts:527-544 |
| revealAndPlaceNexusFree | 自分デッキ上 | count | type=nexus | 1枚（できる＝任意） | 無償配置（notifyNexusDeployedのみ、召喚時効果に相当するものなし） | トラッシュ | 効果の持ち主 | コスト最大1枚 | alwaysAsk=trueで候補1枚でも選択、スキップ時は後始末をresumeキューに積む | ― | reveal.ts:626-685 |
| revealOpponentDeckPickBottomRestTop | **相手**デッキ上 | count | なし（任意の1枚を選ぶ） | 1枚（下へ）＋残り全部（順番選択、上へ） | 1枚:相手デッキ下／残り:相手デッキ上 | ―（2段階選択で使い切る） | 効果の持ち主（=相手のデッキだが選ぶのは効果の使用者） | 非対話時：末尾（新しい方）を下へ、残りは公開順のまま上へ | 2フェーズ（chooseBottom→chooseTop）、各フェーズでcard choice・中断/再開 | 相手専用デッキに触る唯一のtype | reveal.ts:694-780 |
| revealTopSummonFreeOrHand | 自分デッキ上 | 1 | type=spirit or brave | ― | 無償召喚（summonFreeFromTrashIndex経由。転召・召喚時効果とも通常発揮）／召喚不可なら手札 | ―（1枚のみ） | ― | 召喚できれば召喚、できなければ手札（分岐に選択なし） | summonFreeFromTrashIndex内部で中断しうる | いったんトラッシュに置いてから召喚経路に載せる実装（reveal.ts:799） | reveal.ts:786-814 |
| revealTopSummonFreeByFamily | 自分デッキ上 | 1 | familyFilter、type=spirit | ―（できる＝任意） | 無償召喚（転召・召喚時効果とも通常発揮）／召喚しない・非該当はトラッシュ | ―（1枚のみ） | 効果の持ち主 | 非対話時は召喚する側に倒す | alwaysAsk=trueで候補1枚でも確認、スキップ時は後始末をresumeキューに積む | 非該当時はオープン即トラッシュ（選択なし） | reveal.ts:819-874 |
| revealTopSummonFreeOrReturnToDeck | 自分デッキ上 | 1（**デッキから取り除かず先に確認**） | cardType＋colorFilter | ―（できる＝任意） | 無償召喚（confirmed再入で取り除いて召喚）／召喚しない・非該当は**動かさずデッキ上に残す** | ―（1枚のみ） | 効果の持ち主 | 非対話時は召喚する側に倒す | requestActivationConfirmで確認、confirmed:trueで再入 | 唯一「取り除かず先に見る」型（他は基本splice先出し） | reveal.ts:878-916 |
| revealTopCastMagicFreeOrHand | 自分デッキ上 | 1 | type=magic | ―（できる＝任意） | 無償フラッシュ即時使用（resolveMagicEffects）／使わない・非magicは手札 | ―（1枚のみ） | 効果の持ち主 | 非対話時は使用する側に倒す | suspend(option,confirm)で確認、chosenOptionで再入 | ― | reveal.ts:918-961 |
| revealHandMagicToTegamotoDraw | **手札**（デッキではない） | 手札内のマジック全部が候補 | type=magic | 1枚 | 手元(tegamoto)＋1枚ドロー | ―（残りは手札のまま） | 効果の持ち主 | 手札末尾（新しい方）の該当1枚 | resolveOnSkip未指定のrequestCardChoice（optional=false＝必ず選ばせる） | 「〜することで」の任意性はカード側のtriggered.optionalで表現（本typeは常に必須選択） | tegamoto.ts:185-237 |

**未確認**：0行（全17種、ハンドラ本体を実際に読んで確認した）。ただし `notifyHandGained` の内部（トリガーを積むかどうか）は本文だけ読み中身は未確認。

## §2 語彙に足りない軸・部品

`reveal { from, count, pick, dest, rest }` を仮に想定した場合に必要な値・足りない部品：

- **from の軸**：`自分デッキ上`／`相手デッキ上`（revealOpponentDeckPickBottomRestTop）／`自分手札`（revealHandMagicToTegamotoDraw）の3種。相手デッキは既存17種で1例のみだが軸としては必要。
- **count の軸**：固定数値、`countFromSelfLevel`（発生源の現Lv）、`countPer`（自分の色スピリット/ネクサス合計・自分のネクサス数・自分の指定色シンボル数）の3系統。**器に一本化するなら「枚数の決め方」を選べる別軸が要る**（既存の`countPer`/`countFromSelfLevel`をそのまま踏襲できそうだが、命名は要検討）。
- **pick（選ぶ条件）の軸**：type一致／familyFilter／keyword（静的）／colorFilter／costFilter（完全一致 or min/max）／nameIncludes／burst効果の有無（`effects`の`kind`を見る）／条件なし（デッキ上1枚固定）。**「burst効果を持つか」は既存のtype/family/color/costの列挙と質が違う**（カードの効果構造そのものを見る）ので、既存フィルタ列挙に無い軸＝足りない部品。
- **選ぶ数の軸**：0枚（pickNone）／1枚（できる＝任意）／1枚（無条件＝必須）／**すべて（複数体・選択を挟まない範囲処理）**／「順番だけ選ぶ」（revealReturnToDeck・revealOpponentDeckPickBottomRestTopのchooseTop）。**「すべて」を選択なしで処理する範囲effectと、1枚を選ばせる効果とでは中断ポイントの有無が違う**ため、単純に`pick: "one"|"all"`だけでは済まない（allは選択自体が要らない）。
- **dest（選んだものの行き先）の軸**：手札／無償召喚（転召あり・転召なし・転召させないの3態）／無償配置（ネクサス）／無償フラッシュ即時使用／手元(tegamoto)＋ドロー。**「無償召喚」だけで3つの転召挙動が並立**しており、器にするなら転召の扱いを選べるサブ軸が要る（`tenshoMode: "resolve"|"skip"|"asResolved"`のような部品が足りない）。
- **rest（残りの行き先）の軸**：トラッシュ／デッキ下（公開順のまま or 好きな順番で選ばせる）／デッキ上（好きな順番で選ばせる、または動かさずそのまま＝revealTopSummonFreeOrReturnToDeckは「そもそも取り除いていない」ので厳密には残り処理が存在しない）。**「好きな順番で戻す」の有無**は既存の`revealReturnToDeck`のtoTop/デフォルト下戻しでカバーできそうだが、「取り除かず先に見る」（revealTopSummonFreeOrReturnToDeck）は前提が違う＝count=1限定の別モードとして扱うか、部品として別立てが要る。
- **後続処理（「その後」に相当）**：revealTopToHandThenRefreshOwnの「マジックだったときrefreshOneを追加発動」は`sequence`＋`if`（条件：手札に加えた1枚がマジックか）で書けそうだが、条件の主語が「今公開して手札に加えたそのカード」という一時的な参照を要るため、既存の`if`の条件語彙に「直前にpickしたカードの属性」を見る軸が無ければ足りない部品になる。
- **相手デッキが対象になるケース**（revealOpponentDeckPickBottomRestTop）は、既存の`deckReveal`/`revealReturnToDeck`が`owner`固定である設計と根本的に前提が違う（`state.revealedCards.pid`を誰にするか）。単に`from`を選べるようにするだけでなく、選ぶ人（効果の使用者）と公開されるデッキの持ち主が別人になる状態を扱う必要がある。
- **「デッキから取り除かず先に確認する」**（revealTopSummonFreeOrReturnToDeck）は他16種の「先にspliceで取り除いてから公開ゾーンに置く」設計と異なり、`count=1`のときだけ通用する簡略化に見える（複数枚を「取り除かずに見る」は他に前例がない）。器にするなら、この1種だけ別扱いにするか、「取り除くタイミング」を軸に持たせるかの判断が要る。

## §3 挙動の食い違い

1. **「無償召喚」時の【転召】の扱いが3通りに割れている**：revealAndSummonKeyword（keyword版・familyFilter未指定）は転召を**解決しない**＝「転召を発揮したものとして扱う」（reveal.ts:596-598）。同じrevealAndSummonKeywordでもfamilyFilter指定時（reveal.ts:588、BS13-074）は転召を**通常どおり解決**する。revealAndSummonAllByFamily（reveal.ts:313-355）は「転召させない」（転召自体を発生させない＝解決しないとも異なる第3の扱い）。revealAndSummonAllByKeyword（reveal.ts:400、resolveTensho呼び出し）・summonFreeFromTrashIndex系（revealTopSummonFreeOrHand等）は通常どおり解決。影響カード：revealAndSummonKeyword 2枚（うち転召省略はBS05トランスマイグレーション1枚のみ、familyFilter版のBS13-074は通常解決）、revealAndSummonAllByFamily 3枚（転召させない）。
2. **召喚時効果の発揮有無が type によって逆**：revealAndSummonKeyword・revealAndSummonAllByKeyword・summonFreeFromTrashIndex系は召喚時効果を**発揮する**。revealAndSummonAllByFamilyだけ**発揮しない**（効果文に明記あり、reveal.ts:340-343コメント）。影響カード：revealAndSummonAllByFamily 3枚。
3. **「残りの行き先」がトラッシュ／デッキ上／デッキ下の3通りに分かれ、しかも type ごとに固定**：revealAndSummonKeyword・revealAndSummonAllByFamily・revealAndSummonAllByKeyword・revealTopFamilyToHand・revealAndPlaceNexusFreeはトラッシュ固定。revealTopBurstOneToHandRestBottomはデッキ下（好きな順番のUIなし＝「好きな順番で」の効果文だが順番が結果に影響しないため実装は固定順）。revealTopToHandIfColorSpiritElseReturnToDeckはデッキ上固定。**deckRevealだけ discardNonMatching/returnToTop フラグで3通りを切り替え可能**（reveal.ts:198-211）。効果文どおりの実装だが、「なぜ deckReveal だけ切替式で他は固定か」は型の増殖の経緯（1枚ごとに専用type）がそのまま残っている。
4. **「取り除かず先に見る」のは revealTopSummonFreeOrReturnToDeck だけ**（reveal.ts:882コメント「デッキから取り除かず先にオープンする」）。他の count=1 type（revealTopSummonFreeOrHand・revealTopSummonFreeByFamily・revealTopCastMagicFreeOrHand・revealTopToHandThenRefreshOwn・revealTopToHandIfColorSpiritElseReturnToDeck）はすべて`deck.shift()`で先に取り除いてから処理する。効果文の違い（BS14-081は「デッキの上に戻す」という言い方をしない＝「そのまま」に近い）が実装差の理由と見えるが、要確認。
5. **効果文と実装の食い違い（要点だけ）**：revealTopBurstOneToHandRestBottom・revealReturnToDeckの下戻しは効果文「好きな順番で」を**順番選択UIとして実装**しているが、revealAndSummonKeyword・revealAndSummonAllByFamily等の「残ったカードは破棄する」に対応する型は元の効果文に順番指定が無いのでこの食い違いには該当しない（食い違いなし、確認のみ）。

## 最終報告

以下、SubagentHandback で報告する。

## §4 確定スキーマ `reveal`（2026-09-26。名前を変えない）

```ts
| { type: "reveal"
    from?: "ownDeck" | "opponentDeck" | "hand"   // 既定 ownDeck（デッキは上から count 枚をいったん取り出して公開する）
    count?: number; countPer?: 旧 deckReveal と同じ形; countFromSelfLevel?: true   // from hand のときは手札全部が対象
    pick?: { cardType?: CardType | CardType[]; family?: FamilyFilter; color?: Color; keyword?: Keyword; nameIncludes?: string; cost?: number | { min?: number; max?: number }; hasBurst?: true }
    pickCount?: 1 | "all" | 0   // 既定 1。all＝条件に合うすべて（選ばせない）、0＝選ばない（公開して戻すだけ）
    optional?: true   // 「〜できる」
    dest?: "hand" | "summon" | "cast" | "placeNexus" | "tegamoto" | "deckBottom"   // 選んだものの行き先。既定 hand。deckBottom はそのカードの持ち主のデッキの下
    orHand?: true   // summon／cast をしない・できないときは手札
    tensho?: "asIfDone" | "none"   // 無償召喚時の【転召】。既定＝通常どおり解決。asIfDone＝「【転召】を発揮したものとして扱う」、none＝「【転召】させずに」
    noSummonEffects?: true   // 「召喚時効果は発揮されない」
    rest?: "trash" | "deckTop" | "deckBottom" | "hand"   // 選ばなかったものの行き先。既定 deckBottom。デッキへ戻すときは効果の使用者が順番を選ぶ（公開したのが相手のデッキでも）
    returnToDeckBottomAtEndStep?: true }
```

規則（2026-09-26。選ぶのは常に効果の使用者）：
- `pickCount: 1` で候補が2枚以上なら使用者に選ばせる（AI・非対話はコスト最大）。旧 revealTopBurstOneToHandRestBottom は先頭を自動で選んでいた
- オープンしたカードはいったんデッキから取り出す（旧 revealTopSummonFreeOrReturnToDeck だけ取り出さずに見ていた。戻す先がデッキの上なので結果は同じ）

| 旧 type | 書き方 |
| :-- | :-- |
| deckReveal（17） | count／countPer・pick（pickType→cardType、familyFilter→family、colorFilter→color、costFilter→cost、nameIncludes）・pickAllOfType→pickCount all＋cardType・pickNone→pickCount 0・rest（discardNonMatching→trash、returnToTop→deckTop、既定 deckBottom） |
| revealAndSummonKeyword（2） | pick{cardType spirit, keyword／family}・optional・dest summon・tensho（keyword 版は asIfDone、family 版は既定）・rest trash・returnToDeckBottomAtEndStep |
| revealAndSummonAllByFamily（3） | count／countFromSelfLevel・pick{spirit, family, cost}・pickCount all・dest summon・tensho none・noSummonEffects・rest trash |
| revealAndSummonAllByKeyword（1） | pick{spirit, keyword}・pickCount all・dest summon・rest trash |
| revealTopBurstOneToHandRestBottom（1） | pick{hasBurst}・dest hand・rest deckBottom |
| revealTopFamilyToHand（1） | pick{cardType spirit（includeBraves→[spirit, brave]）, family}・pickCount all・dest hand・rest trash |
| revealTopToHandIfColorSpiritElseReturnToDeck（1） | count 1・pick{spirit, color}・dest hand・rest deckTop |
| revealAndPlaceNexusFree（1） | pick{nexus}・optional・dest placeNexus・rest trash |
| revealOpponentDeckPickBottomRestTop（1） | from opponentDeck・dest deckBottom・rest deckTop |
| revealTopSummonFreeOrHand（1） | count 1・pick{[spirit, brave]}・dest summon・orHand・rest hand |
| revealTopSummonFreeByFamily（1） | count 1・pick{spirit, family}・optional・dest summon・rest trash |
| revealTopSummonFreeOrReturnToDeck（1） | count 1・pick{cardType, color}・optional・dest summon・rest deckTop |
| revealTopCastMagicFreeOrHand（1） | count 1・pick{magic}・optional・dest cast・orHand・rest hand |
| revealHandMagicToTegamotoDraw（1） | 「手元に置くことで1枚ドロー」＝pay{ cost: reveal{from hand・pick{magic}・dest tegamoto}, then: draw 1 }。**pay の対応一覧に reveal を足すまで旧 type のまま**（sequence だと手札にマジックが無くてもドローしてしまう） |

revealTopToHandThenRefreshOwn は M2 の `if`（cond.last）で移行済み（2026-09-27）。
内部専用の revealReturnToDeck・revealDiscardRest は新しい器の後始末として使い続けてよい（カードデータには書かない）。
