# 「ことで」の pay 移行棚卸し（2026-10-02 調査）

目的：効果文に「ことで」があるのに `pay` を使わず、専用の kind／action／軸で書かれているエントリを洗い出し、対話中に「払うか」の確認が出るかを調べた。コード・データは変更していない。
調査範囲：`data/cards/*.json` のうち効果文に「ことで」を含む256枚。うち `pay`（または `targetNegateByHandDiscard`）が節数以上ある75枚は実装済みとして除外。残り節をエントリに対応づけて下表に並べた。
件数（エントリ単位）：済（入口）63／済（自前）51（ほかに【バースト】の「その後コストを支払うことで」35枚＝済（自前）、別表）／要対応：pay へ移せる 9／要対応：器が聞く必要 12／説明文 1（ほかに【神速】の説明文18枚、別表）／対応不明 0。
限界：除外判定は「pay の個数 ≥ 節数」の機械判定。同じ節に burst と magic の2エントリが並ぶカード（BS14-095／096 等）は目視で確認した。節とエントリの対応は見出し・Lv・『』と action の内容で人手照合した。

## 要対応を先に

| カードID | カード名 | エントリID | kind／行動の type | 節（60字以内） | 区分 | 根拠（ファイル:行 か 欄名） |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| BS13-004 | フォボス・ドラグーン | BS13-004-e2 | triggered/summonFromHandFree(optional:false) | バトル終了時、このスピリットと自分のコスト3以上のスピリット1体を破壊することで、自分の手札にある系統：「神星」を持つス | 要対応：pay へ移せる | triggered optional:false。pay{cost: sequence[destroy(self), destroy(コスト3以上)], then: summonFromHandFree}。いずれも PAYABLE_TYPES |
| BS13-023 | マウンテン・セイカイ | BS13-023-e2 | triggered/refreshSelf(optional:false) | バトル終了時、このスピリットのブレイヴ1つを手札に戻すことで、このスピリットは回復する。 | 要対応：pay へ移せる | triggered optional:false。pay{cost: returnToHand(自分のブレイヴ1つ), then: refreshSelf}。returnToHand/refreshSelf は PAYABLE_TYPES（ブレイヴ限定の絞り込みが returnToHand の filter で書けるか要確認） |
| BS13-027 | ムーンショウウオ | BS13-027-e1 | step/negateLifeDamageFromTarget | ステップ開始時、このスピリットを手札に戻すことで、相手のスピリット1体を指定する。 | 要対応：pay へ移せる | step optional なし。action の costReturnSelfToHand は確認なしで自動払い。pay{cost: returnToHand(self), then: negateLifeDamageFromTarget}。いずれも PAYABLE_TYPES |
| BS14-043 | 月光姫マーニ | BS14-043-e3 | step/timedEffect | ステップ開始時、このスピリットを疲労させることで、相手のスピリット1体を指定する。 | 要対応：pay へ移せる | step optional なし。triggers.ts:1022/1058 で cost:exhaustSelf を確認なしで疲労。pay{cost: exhaust(self), then: timedEffect(suppressTrigger)} |
| BS15-023 | タケノ・サイガー | BS15-023-e3 | step/refreshOne | このスピリットのコア1個を自分のトラッシュに置くことで、【暴風】を持つ自分のスピリット1体を回復させる。 | 要対応：pay へ移せる | step optional なし。cost:selfCoresToTrash を triggers.ts:1058 付近で自動払い。pay{cost: removeCores(self), then: refreshOne}。いずれも PAYABLE_TYPES |
| BS15-032 | スノーフレイクン | BS15-032-e1 | step/timedEffect | ステップ開始時、自分のリザーブのコア1個を自分のトラッシュに置くことで、相手のスピリット1体を指定する。 | 要対応：pay へ移せる | step optional なし。cost:reserveToTrash を自動払い。pay{cost: removeCores(own reserve→trash), then: timedEffect(mustAttack)} |
| BS15-048 | 釣り仙人ジゴロウ | BS15-048-e1 | step/lendSelfThisTurn | このスピリットのコア1個を自分のトラッシュに置くことで、このターンの間、自分のスピリットの【粉砕】/【大粉砕】で破棄する | 要対応：pay へ移せる | step optional なし。cost:selfCoresToTrash を自動払い。pay{cost: removeCores(self), then: lendSelfThisTurn}。いずれも PAYABLE_TYPES |
| BS15-067 | 雪の結晶樹 | BS15-067-e2 | fieldEvent/refreshOne | 自分のスピリットが【氷壁】を使用したとき、このネクサスのコア1個を自分のトラッシュに置くことで、そのスピリットを回復させ | 要対応：pay へ移せる | fieldEvent optional なし。action の costSelfCoresToTrash を自動払い。pay{cost: removeCores(self), then: refreshOne}。いずれも PAYABLE_TYPES |
| BS16-063 | 釣魂台 | BS16-063-e2 | step/draw | 自分の手札にある系統：「無魔」を持つスピリットカード1枚を破棄することで、自分はデッキから1枚ドローする。 | 要対応：pay へ移せる | step optional なし。cost:discardHandFamily を triggers.ts:1062 付近で自動選択・自動払い。pay{cost: discardSelfChoose(系統:無魔), then: draw}。いずれも PAYABLE_TYPES |
| BS04-039 | 宝石虫スカラベール | BS04-039-e2 | reviveOnDestroy | 【神速】を持つ自分のスピリットすべては、BPを比べ相手のスピリットに破壊されたとき、自分のフィールド/リザーブにあるコア | 要対応：器が聞く必要 | revive.ts:875 optional が無いと確認なしで cost を自動払い。置換効果で pay に移せない（データに optional:true を足せば確認は出る可能性。要設計確認） |
| BS06-074 | 紅玉の火山弾 | BS06-074-e3 | effectGrant/selfBuffByExhaustFamily | 自分の赤のスピリットすべてに“『このスピリットのアタック時』系統：「地竜」を持つ自分のスピリット1体を疲労させることで、 | 要対応：器が聞く必要 | effectGrant の granted は triggers.ts:604 resolveAction 直呼びで確認なし。selfBuffByExhaustFamily(buff.ts:332)は犠牲の選択のみ。pay に移せない理由：後続のBP量が疲労させた個体のBPを参照 |
| BS06-076 | 暴かれた墓石 | BS06-076-e2 | reviveOnDestroy | ターンに1回、系統：「無魔」を持つ自分のスピリットが破壊されたとき、自分の手札1枚を破棄することで、回復状態で自分のフィ | 要対応：器が聞く必要 | revive.ts:875 optional が無いと確認なしで cost を自動払い。置換効果で pay に移せない（データに optional:true を足せば確認は出る可能性。要設計確認） |
| BS07-042 | パオ・ペイール | BS07-042-e1 | reviveOnDestroy | 系統：「想獣」を持つ自分のスピリット1体を疲労させることで、このスピリットは回復状態で自分のフィールドに残る。 | 要対応：器が聞く必要 | revive.ts:875 optional が無いと確認なしで cost を自動払い。置換効果で pay に移せない（データに optional:true を足せば確認は出る可能性。要設計確認） |
| BS08-056 | 太陽石の神殿 | BS08-056-e2 | reviveOnDestroy | 【激突】を持つ自分のスピリットが破壊されたとき、自分のライフのコア1個をボイドに置くことで、回復状態で自分のフィールドに | 要対応：器が聞く必要 | revive.ts:875 optional が無いと確認なしで cost を自動払い。置換効果で pay に移せない（データに optional:true を足せば確認は出る可能性。要設計確認） |
| BS08-084 | キマイラアサルト | BS08-084-e3 | effectGrant/refreshSelfByExhaustNexus | このターンの間、系統：「異合」を持つ自分のスピリットすべてに“【強襲：1】『このスピリットのアタック時』このスピリットは | 要対応：器が聞く必要 | granted(refreshSelfByExhaustNexus) は triggers.ts:604 直呼びで確認なし。exhaustRefresh.ts:825 は疲労させるネクサスの選択のみ。pay に移せない理由：【強襲】回数上限の判定と疲労ネクサスの選択が器の中 |
| BS13-024 | 武神獣ディアル・ユキムラ | BS13-024-e2 | triggered/bpBuff(optional:false) | 系統：「遊精」を持つ自分のスピリット1体を疲労させることで、このスピリットをBP+(疲労させたスピリットのBP)する。 | 要対応：器が聞く必要 | triggered optional:false。bpBuff の costExhaustFamily+amountFromExhaustedCost。pay に移せない理由：後続のBP量が疲労させた個体のBPを参照 |
| BS14-064 | レボルシング・ゼヨン | BS14-064-e2 | reviveOnDestroy | 相手によって自分のスピリットが破壊されたとき、自分のネクサス1つを疲労させることで、破壊されたスピリット1体を疲労状態で | 要対応：器が聞く必要 | revive.ts:875 optional が無いと確認なしで cost を自動払い。置換効果で pay に移せない（データに optional:true を足せば確認は出る可能性。要設計確認） |
| BS14-084 | 永久凍土の王都 | BS14-084-e2 | globalConstraint/ownLifeFloor | 自分のライフが0になるとき、このネクサスを自分のトラッシュに置くことで、自分のライフは0にならない。 | 要対応：器が聞く必要 | EffectModules.ts:526 tryOwnLifeFloorByCost が確認なしで自動払い（「払わなければ即敗北」を理由にした簡略化）。置換効果（ライフ0の置換）で pay に移せない |
| BS14-X05 | 神獣鳥アン・ズール | BS14-X05-e2 | reviveOnDestroy | 自分のバースト1つを破棄することで、このスピリットは回復状態で自分のフィールドに残る。 | 要対応：器が聞く必要 | revive.ts:875 optional が無いと確認なしで cost を自動払い。置換効果で pay に移せない（データに optional:true を足せば確認は出る可能性。要設計確認） |
| BS15-057 | カメン・フクロウ | BS15-057-e1 | reviveOnDestroy | 自分のバースト1つを破棄することで、このスピリットは回復状態で自分のフィールドに残る。 | 要対応：器が聞く必要 | revive.ts:875 optional が無いと確認なしで cost を自動払い。置換効果で pay に移せない（データに optional:true を足せば確認は出る可能性。要設計確認） |
| BS15-063 | 吊られた古城 | BS15-063-e2 | reviveOnDestroy | 系統：「夜族」/「虚神」を持つ自分のスピリットが破壊されたとき、自分の手札1枚を破棄することで、そのスピリットを疲労状態 | 要対応：器が聞く必要 | revive.ts:875 optional が無いと確認なしで cost を自動払い。置換効果で pay に移せない（データに optional:true を足せば確認は出る可能性。要設計確認） |

## 済・説明文（確認用）

| カードID | カード名 | エントリID | kind／行動の type | 節（60字以内） | 区分 | 根拠（ファイル:行 か 欄名） |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| BS02-052 | チャガマル | BS02-052-e1 | reviveOnDestroy(optional:true) | このスピリットが相手のスピリット/ネクサス/マジックの効果で破壊されたとき、このスピリット上のコア1個だけを残し、それ以 | 済（自前） | revive.ts:875 optional:true は持ち主に確認（suspendReviveConfirm） |
| BS02-079 | 紫水晶の森 | BS02-079-e1 | reviveOnDestroy(optional:true) | 自分のスピリットが相手のスピリット/ネクサス/マジックの効果で破壊されたとき、そのスピリット上のコア1個をボイドに置くこ | 済（自前） | revive.ts:875 optional:true は持ち主に確認（suspendReviveConfirm） |
| BS03-107 | 果て無き地平線 | BS03-107-e2 | reviveOnDestroy(optional:true) | 【神速】を持つ自分のスピリットすべては、BPを比べ相手のスピリットに破壊されたとき、自分のリザーブにあるコア1個を自分の | 済（自前） | revive.ts:875 optional:true は持ち主に確認（suspendReviveConfirm） |
| BS05-007 | 真紅の竜使いロッソ | BS05-007-e1 | constraint/tenshoCoreSubstitute | このスピリットが【転召】の対象になったとき、このスピリットを疲労させることで、このスピリット上のコアすべてを指定場所に置 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS05-017 | 紫煙の竜使いヴァイオレット | BS05-017-e3 | constraint/tenshoCoreSubstitute | このスピリットが【転召】の対象になったとき、このスピリットを疲労させることで、このスピリット上のコアすべてを指定場所に置 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS05-026 | 碧緑の竜使いグリューン | BS05-026-e3 | constraint/tenshoCoreSubstitute | このスピリットが【転召】の対象になったとき、このスピリットを疲労させることで、このスピリット上のコアすべてを指定場所に置 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS05-034 | 白亜の竜使いアルブス | BS05-034-e1 | constraint/tenshoCoreSubstitute | このスピリットが【転召】の対象になったとき、このスピリットを疲労させることで、このスピリット上のコアすべてを指定場所に置 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS05-043 | 黄昏の竜使いフラウム | BS05-043-e3 | constraint/tenshoCoreSubstitute | このスピリットが【転召】の対象になったとき、このスピリットを疲労させることで、このスピリット上のコアすべてを指定場所に置 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS05-053 | 蒼海の竜使いアズール | BS05-053-e3 | constraint/tenshoCoreSubstitute | このスピリットが【転召】の対象になったとき、このスピリットを疲労させることで、このスピリット上のコアすべてを指定場所に置 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS08-003 | ダークアンキラーザウルス | BS08-003-e1 | constraint/tenshoCoreSubstitute | このスピリットが【転召】の対象になったとき、このスピリットを疲労させることで、【転召】させずに召喚できる。 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS08-012 | ダークスカルデーモン | BS08-012-e1 | constraint/tenshoCoreSubstitute | このスピリットが【転召】の対象になったとき、このスピリットを疲労させることで、【転召】させずに召喚できる。 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS08-021 | ブラックアメンボーグ | BS08-021-e1 | constraint/tenshoCoreSubstitute | このスピリットが【転召】の対象になったとき、このスピリットを疲労させることで、【転召】させずに召喚できる。 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS08-032 | 知将ゲンドリル | BS08-032-e2 | magicNegate | 相手が赤のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS08-036 | 機神獣インフェニット・ヴォルス | BS08-036-e2 | magicNegate | 相手が紫/白/黄/青のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS08-039 | ダークチュンポポ | BS08-039-e1 | constraint/tenshoCoreSubstitute | このスピリットが【転召】の対象になったとき、このスピリットを疲労させることで、【転召】させずに召喚できる。 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS08-048 | ブラックウガルルム | BS08-048-e1 | constraint/tenshoCoreSubstitute | このスピリットが【転召】の対象になったとき、このスピリットを疲労させることで、【転召】させずに召喚できる。 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS08-064 | 鳳翼の聖剣 | BS08-064-e3 | deckMillNegate | 【粉砕】以外の相手のスピリットの効果で自分のデッキが破棄されるとき、自分のライフのコア1個を自分のリザーブに置くことで、 | 済（自前） | zones/mill.ts:315 「無効にしますか」を確認 |
| BS08-X32 | 翼神機グラン・ウォーデン | BS08-X32-e3 | magicNegate | 相手が赤/紫/緑/白/黄/青のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS09-031 | 守護巨獣ガラパーゾ | BS09-031-e3 | magicNegate | 相手が緑のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS09-034 | 風花の戦乙女グナ | BS09-034-e2 | magicNegate | 相手が緑/青のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS09-062 | ノルンの泉 | BS09-062-e1 | magicNegatePayByNexusGrant | 自分のスピリットの【氷壁】の効果を、自分のネクサス1つを代わりに疲労させることで使用できる。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS09-063 | 花の宮殿 | BS09-063-e1 | reviveOnDestroy(optional:true) | 系統：「楽族」を持つ自分のスピリットが破壊されたとき、そのスピリット上のコア1個をトラッシュに置くことで、疲労状態で自分 | 済（自前） | revive.ts:875 optional:true は持ち主に確認（suspendReviveConfirm） |
| BS10-034 | 鎧装獣キマイロン | BS10-034-e2 | magicNegate | 相手が赤/紫のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS11-028 | 鳥人機フレスヴェルガー | BS11-028-e3 | magicNegate | 相手が白のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS11-066 | 発見されし世界樹 | BS11-066-e2 | reviveOnDestroy(optional:true) | 自分のスピリットが破壊されたとき、このネクサス上のコア3個をトラッシュに置くことで、そのスピリットを疲労状態で自分のフィ | 済（自前） | revive.ts:875 optional:true は持ち主に確認（suspendReviveConfirm） |
| BS12-029 | 氷の淑女スノトラ | BS12-029-e2 | magicNegate | 相手が緑/黄のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS12-032 | 蹴激皇ヴィーザル | BS12-032-e2 | magicNegate | 相手が紫/緑/白/黄のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS12-052 | デス・ヘイズ | BS12-052-e2 | reviveOnDestroy(optional:true) | 自分の手札1枚を破棄することで、このスピリットは疲労状態で自分のフィールドに戻る。 | 済（自前） | revive.ts:875 optional:true は持ち主に確認（suspendReviveConfirm） |
| BS12-061 | 剣の誕生地 | BS12-061-e1 | constraint/tenshoCoreSubstitute | 【転召】するとき、このネクサスを疲労させることで、系統：「星魂」を持つ自分のコスト3のスピリット1体のコアすべてを指定場 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS12-064 | 偶像の館 | BS12-064-e1 | constraint/tenshoCoreSubstitute | 【転召】するとき、このネクサスを疲労させることで、系統：「星魂」を持つ自分のコスト3のスピリット1体のコアすべてを指定場 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS12-066 | 巨木の門 | BS12-066-e1 | constraint/tenshoCoreSubstitute | 【転召】するとき、このネクサスを疲労させることで、系統：「星魂」を持つ自分のコスト3のスピリット1体の上のコアすべてを指 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS12-068 | 光の聖剣 | BS12-068-e1 | effectEntryGrant | 【装甲】/【重装甲】を持つ自分のスピリットすべてに“【氷壁：紫/白】『相手のターン』相手が紫/白のマジックの効果を使用し | 済（自前） | continuous.ts:285 付与された氷壁は magicNegate と同じ経路（magic/cast.ts:50 で持ち主に確認） |
| BS13-028 | 誓約の女神ヴァール | BS13-028-e2 | magicNegate | 相手が赤/緑/黄のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS13-036 | 星鳥クージャ | BS13-036-e1 | reviveOnDestroy(optional:true) | 自分の黄のスピリットが破壊されたとき、自分のライフのコア1個を自分のリザーブに置くことで、破壊された自分の黄のスピリット | 済（自前） | revive.ts:875 optional:true は持ち主に確認（suspendReviveConfirm） |
| BS13-040 | 金星神龍ヴィーナ・フェーザー | BS13-040-e2 | reviveOnDestroy(optional:true) | 自分のデッキを上から3枚破棄することで、このスピリットは疲労状態で自分のフィールドに戻る。 | 済（自前） | revive.ts:875 optional:true は持ち主に確認（suspendReviveConfirm） |
| BS13-X05 | 麒麟星獣リーン | BS13-X05-e2 | reviveOnDestroy(optional:true) | このスピリットと同じ系統を持つ自分のスピリット1体を疲労させることで、このスピリットは回復状態で自分のフィールドに残る。 | 済（自前） | revive.ts:875 optional:true は持ち主に確認（suspendReviveConfirm） |
| BS14-040 | 勇機リュードロイド | BS14-040-e4 | magicNegate | 相手が紫/黄のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS14-043 | 月光姫マーニ | BS14-043-e2 | magicNegate | 相手が赤/緑/白/青のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS14-078 | 幽鬼集う廃都 | BS14-078-e1 | reviveOnDestroy(optional:true) | 相手によって自分のスピリットが破壊されたとき、自分のデッキを上から4枚破棄することで、破壊されたスピリット1体を疲労状態 | 済（自前） | revive.ts:875 optional:true は持ち主に確認（suspendReviveConfirm） |
| BS14-X02 | 呪の覇王カオティック・セイメイ | BS14-X02-e3 | reviveOnDestroy(optional:true) | 相手のライフのコア1個を相手のトラッシュに置くことで、このスピリットは回復状態でフィールドに残る。 | 済（自前） | revive.ts:875 optional:true は持ち主に確認（suspendReviveConfirm） |
| BS15-028 | フェネボラック | BS15-028-e2 | deckMillNegate | 相手によって自分のデッキが破棄されるとき、このスピリットを疲労させることで、自分のデッキは破棄されない。 | 済（自前） | zones/mill.ts:315 「無効にしますか」を確認 |
| BS15-030 | 愛の女神ロヴン | BS15-030-e1 | deckMillNegate | 相手によって自分のデッキが破棄されるとき、このスピリットを疲労させることで、自分のデッキは破棄されない。 | 済（自前） | zones/mill.ts:315 「無効にしますか」を確認 |
| BS15-032 | スノーフレイクン | BS15-032-e3 | magicNegate | 相手が緑のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS15-042 | オリンピアの天使アラトロン | BS15-042-e2 | deckMillNegate | 相手のスピリットの効果で自分のデッキが破棄されるとき、このスピリットを疲労させることで、自分のデッキは破棄されず、そのス | 済（自前） | zones/mill.ts:315 「無効にしますか」を確認 |
| BS15-064 | 冥府へ続く魔門 | BS15-064-e2 | fushiFreeByExhaust | 自分のトラッシュにある【不死】を持つコスト6以下のスピリットカードを召喚するとき、このネクサスを疲労させることで、コスト | 済（自前） | revive.ts:259 fushiSummonOrConfirm が「不死で召喚しますか」を持ち主に確認（疲労して無償にする選択肢を含む） |
| BS16-X02 | 牛骨魔王 | BS16-X02-e2 | reviveOnDestroy(optional:true) | 自分の手札1枚を破棄することで、このスピリットは疲労状態で自分のフィールドに残る。 | 済（自前） | revive.ts:875 optional:true は持ち主に確認（suspendReviveConfirm） |
| BS16-067 | 氷聖女の塔 | BS16-067-e1 | effectEntryGrant | 系統：「覇皇」/「雄将」を持つ自分のスピリットすべてに“【氷壁：紫/黄/青】『相手のターン』相手が紫/黄/青のマジックの | 済（自前） | continuous.ts:285 付与された氷壁は magicNegate と同じ経路（magic/cast.ts:50 で持ち主に確認） |
| BS16-036 | 氷聖女ジャンヌダルク | BS16-036-e3 | magicNegate | 相手が赤/紫/緑/白のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS16-031 | ジル・ド・レ | BS16-031-e1 | magicNegate | 相手が赤/青のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| BS16-032 | ラ・イール | BS16-032-e1 | magicNegate | 相手が白/黄のマジックの効果を使用したとき、このスピリットを疲労させることで、その効果を無効にする。 | 済（自前） | magic/cast.ts:50 防御側に「無効にしますか」を確認 |
| SD02-009 | 獣将軍クジャルタ | SD02-009-e1 | constraint/tenshoCoreSubstitute | このスピリットが【転召】の対象になったとき、このスピリットを手札に戻すことで、このスピリット上のコアすべてを指定場所に置 | 済（自前） | keywords/tensho.ts:229 tenshoSubstituteChoice で疲労するかを選ばせる |
| BS01-094 | グラン・ドルバルカン | BS01-094-e1 | activated/endBattle | 自分のリザーブから、コア1個を自分のトラッシュに置くことで、ただちにバトルを終了できる。 | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS02-X07 | 巨神機トール | BS02-X07-e2 | triggered/selfBuffByExhaustFamily(optional:true) | 系統：「武装」を持つ自分のスピリット1体を疲労させることで、このスピリットをBP+(疲労させたスピリットのBP)する。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS03-033 | ビートプリースト | BS03-033-e1 | activated/grantKeywordToHandCard | 自分のリザーブのコア1個を自分のトラッシュに置くことで、このターンの間、自分の手札にある系統：「殻虫」を持つスピリットカ | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS04-057 | 天使長セラフィー | BS04-057-e2 | triggered/summonRepeatFromHand(optional:true) | 自分の手札にあるコスト6以下の系統：「天霊」を持つスピリットカード1枚につき、自分のリザーブにあるコア1個を自分のトラッ | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS04-061 | 戦闘獣ジャッカー | BS04-061-e1 | fieldEvent/reviveLastDestroyedNexus(optional:true) | 自分のネクサス1つが破壊されたとき、このスピリット上のコアすべてを自分のトラッシュに置くことで、その破壊されたネクサス1 | 済（入口） | triggers.ts:1697 optional:true は requestActivationConfirm |
| BS04-088 | 栄光の表彰台 | BS04-088-e1 | nexusCostMillPay | 自分は、ネクサスの配置に支払うコストを、コスト1につき、自分のデッキを上から1枚破棄することで支払うことができる。 | 済（入口） | shared/cost.ts:247 配置コストの支払い方を宣言時にプレイヤーが指定 |
| BS05-047 | ブロンズ・ゴレム | BS05-047-e2 | fieldEvent/reviveLastDestroyedNexus(optional:true) | 自分のネクサスが破壊されたとき、このスピリット上のコア1個を自分のトラッシュに置くことで、破壊されたネクサス1つを自分の | 済（入口） | triggers.ts:1697 optional:true は requestActivationConfirm |
| BS06-X24 | 鎧神機ヴァルハランス | BS06-X24-e2 | triggered/selfBuffByExhaustFamily(optional:true) | 系統：「武装」を持つ自分のスピリット1体を疲労させることで、このスピリットをBP+(疲労させたスピリットのBP)する。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS07-022 | ブラックカラカロッサム | BS07-022-e1 | battleSwapSummon | 自分の手札のこのスピリットカードは、バトルしている自分の[カラカロッサム]1体を手札に戻すことで、疲労状態で召喚して代わ | 済（入口） | GameEngine.ts:477 召喚宣言でプレイヤーが戻す個体を指定 |
| BS07-038 | 桜の妖精オウカ | BS07-038-e1 | activated/timedEffect | このスピリットを疲労させることで、アタックしている【聖命】を持つ自分のスピリット1体をBP+2000する。 | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS07-051 | 天斧の勇者カイオー | BS07-051-e3 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターン中に指定された回数まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS07-052 | 隼の剣士ファルコニア | BS07-052-e2 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターン中に指定された回数まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS07-054 | 神凰兵フェニックス・ゴレム | BS07-054-e4 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターン中に指定された回数まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS07-058 | 常闇の聖堂 | BS07-058-e1 | step/summonFromTrashFree(optional:true) | 自分のフィールドのコアをコストとして使うことで、自分のトラッシュにある系統：「夜族」を持つコスト3以下のスピリットカード | 済（入口） | triggers.ts:1089 optional:true は requestActivationConfirm |
| BS07-058 | 常闇の聖堂 | BS07-058-e2 | step/recoverSpiritFromTrash(optional:true) | ドローしないことで、自分のトラッシュにある系統：「夜族」を持つスピリットカード1枚を選んで手札に戻すことができる。 | 済（入口） | triggers.ts:1089 optional:true は requestActivationConfirm |
| BS07-X28 | 巨人大帝アレクサンダー | BS07-X28-e2 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターンに2回まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS08-030 | 機人フィアラル | BS08-030-e2 | activated/bpBuff | このスピリットを疲労させることで、このターンの間、系統：「武装」を持つ自分のスピリット1体をBP+(このスピリットのBP | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS08-051 | 古将ドグウ・ゴレム | BS08-051-e3 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターン中に1回まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS08-071 | ビクティム | BS08-071-e3 | summonCostHandDiscardPay | このターンの間、自分は、スピリットカード1枚の召喚に支払うコストすべて、または一部を、コスト1につき、自分の手札1枚を破 | 済（入口） | shared/cost.ts:268 召喚コストの支払い方を宣言時にプレイヤーが指定（e1/e2 のマジック入口とは別） |
| BS08-X34 | 神造巨兵オリハルコン・ゴレム | BS08-X34-e4 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターン中に2回まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS09-052 | フォレスト・ゴレム | BS09-052-eK | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターン中に1回まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS09-054 | 蒼嵐の勇者皇カイオー | BS09-054-eK | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターン中に1回まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS09-065 | 名工集いし大工房 | BS09-065-e2 | step/deployNexusFromTrashByFieldCores(optional:true) | 自分のフィールドのコアをコストとして使うことで、自分のトラッシュにある緑/青のネクサスカード1枚を配置できる。 | 済（入口） | triggers.ts:1089 optional:true は requestActivationConfirm |
| BS10-076 | バズーカ・アームズ | BS10-076-e3 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターン中に1回まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS10-096 | 最後の優勝旗 | BS10-096-e2 | step/summonFromHandFree(optional:true) | 自分のスピリット1体を破壊することで、自分の手札にある、その破壊したスピリットと同じコストのブレイヴカード1枚を、コスト | 済（入口） | triggers.ts:1089 optional:true は requestActivationConfirm |
| BS10-087 | 戦場に息づく命 | BS10-087-e1 | step/draw(optional:true) | ボイドからコアを自分のリザーブに置かないことで、自分はデッキから1枚ドローする。 | 済（入口） | triggers.ts:1089 optional:true は requestActivationConfirm |
| BS10-103 | グロウイングソード | BS10-103-e1 | magic/bpBuff | さらに、自分のフィールド/リザーブのコアを自分のトラッシュに好きなだけ置くことで、置いたコア1個につき、そのスピリットを | 済（入口） | magic/cast.ts 使用の宣言が確認 |
| BS10-X05 | 堕天神龍ヴィーナ・ルシファー | BS10-X05-e2 | triggered/millUntilMagicCastFree(optional:true) | 自分の手札にあるスピリットカード1枚を破棄することで、自分のデッキを上から、マジックカードが出るまで破棄し、そのマジック | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS10-054 | ロコモ・ゴレム | BS10-054-e3 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターン中に1回まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS10-058 | 水星神龍メルクリウス・サーペント | BS10-058-e1 | altSummonFromHand | 手札にあるこのスピリットカードは、自分の青のネクサス1つをデッキの下に戻すことで、コストを支払わずに召喚できる。 | 済（入口） | GameEngine.ts:484 代替召喚の宣言でプレイヤーが戻すネクサスを指定 |
| BS10-059 | フォート・ゴレム | BS10-059-e3 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターンに1回まで、自分のネクサス1つを疲労させることで回復する。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS10-086 | 巨星望む大樹 | BS10-086-e2 | fieldEvent/detachBrave(optional:true) | 自分の合体スピリットがバトルしたとき、バトル終了時、分離することで、そのスピリットを回復させる。 | 済（入口） | triggers.ts:1697 optional:true は requestActivationConfirm |
| BS11-046 | 轟腕のトドン | BS11-046-e2 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターン中に1回まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS11-066 | 発見されし世界樹 | BS11-066-e1 | fieldEvent/reviveLastDestroyedNexus(optional:true) | 自分の緑のネクサスが破壊されたとき、このネクサス上のコア1個を自分のトラッシュに置くことで、破壊されたネクサス1つを同じ | 済（入口） | triggers.ts:1697 optional:true は requestActivationConfirm |
| BS11-067 | 白き楯の長城 | BS11-067-e2 | activated/endBattle | このネクサスのコア3個をトラッシュに置くことで、ただちにバトルを終了させる。 | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS12-043 | 大地の狩人コンドラッド | BS12-043-e1 | step/timedEffect(optional:true) | ステップ開始時、このスピリットを疲労させることで、このターンの間、シンボル2つを持つ合体スピリットのアタックでは、自分の | 済（入口） | triggers.ts:1089 optional:true は requestActivationConfirm |
| BS12-050 | 突機竜アーケランサー | BS12-050-e3 | activated/selfBuffByExhaustFamily | 自分のスピリット1体を疲労させることで、このターンの間、このスピリットをBP+3000する。 | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS12-075 | ボオーテスコール | BS12-075-e1 | magic/summonFromTrashFree | 召喚コストの支払いと上に置くコアをリザーブから使用することで、自分のトラッシュにある【不死】を持つスピリットカード1枚を | 済（入口） | magic/cast.ts 使用の宣言が確認 |
| BS13-062 | 光り輝く大銀河 | BS13-062-e2 | activated/bpBuff | 自分の手札にある系統：「神星」/「光導」を持つスピリットカード1枚を破棄することで、このバトルの間、自分のスピリット1体 | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS13-026 | キグナ・スワンMk-II | BS13-026-e1 | activated/timedEffect | このスピリットを疲労させることで、このターンの間、系統：「光導」/「星魂」を持つ自分のスピリットすべてをBP+3000す | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS13-046 | シャンターグ | BS13-046-e5 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターン中に1回まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS13-060 | トレス・ベルーガ | BS13-060-e1 | triggered/bpBuff(optional:true) | 自分のデッキを上から6枚破棄することで、このスピリットをBP+6000する。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS13-X06 | 巨人勇者ペルセウス | BS13-X06-e4 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターンに3回まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS14-051 | アルカナビーストクィーン | BS14-051-e2 | activated/timedEffect | 系統：「四道」を持つ自分のスピリット1体を疲労させることで、このターンの間、相手のスピリット1体をLv1として扱う。 | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS14-066 | 虎拳聖タイガ | BS14-066-e2 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターンに2回まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS14-087 | ペンタン帝国：帝都アンプルール | BS14-087-e1 | activated/timedEffect | このネクサスのコア2個を自分のトラッシュに置くことで、バトル解決時、BPのかわりにLvを比べ、Lvの低いスピリットが破壊 | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS14-X03 | 風の覇王ドルクス・ウシワカ | BS14-X03-e4 | triggered/bpBuff(optional:true) | バトル終了時、このスピリットを手札に戻すことで、このターンの間、自分のスピリット1体をBP+3000する。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS15-003 | ファイアファンサウル | BS15-003-e1 | activated/destroyNexus | 自分の手札1枚を破棄し、このスピリットを疲労させることで、相手のネクサス1つを破壊する。 | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS15-011 | ミーアバット | BS15-011-e2 | handActivated/timedEffect | 手札にあるこのスピリットカードを破棄することで、このターンの間、スピリット1体をBP+2000する。 | 済（入口） | GameEngine.ts:800 手札からの起動を押す操作が確認 |
| BS15-017 | エンプレス・ヨウクィーン | BS15-017-e3 | activated/recoverSpiritFromTrash | 自分の手札にある【不死】を持つスピリットカード1枚を破棄することで、自分のトラッシュにある紫のスピリットカード1枚を手札 | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS15-051 | 虚海獣エメヒドラル | BS15-051-e2 | activated/destroy | このスピリットのコア1個を自分のトラッシュに置くことで、「ブロックされない」効果を持つ相手のスピリット1体を破壊する。 | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS15-X05 | 光の覇王ルナアーク・カグヤ | BS15-X05-e2 | activated/timedEffect | 自分のリザーブのコア2個を自分のトラッシュに置くことで、このバトルの間、相手のスピリット1体のLv1/Lv2/Lv3/L | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS16-047 | 警備兵パグ | BS16-047-e1 | fieldEvent/reviveLastDestroyedNexus(optional:true) | 自分のネクサスが破壊されたとき、このスピリットのコア1個を自分のトラッシュに置くことで、破壊されたネクサス1つを同じ状態 | 済（入口） | triggers.ts:1697 optional:true は requestActivationConfirm |
| BS16-052 | エンキドゥ・ゴレム | BS16-052-e2 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターンに1回まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS16-X06 | 霊峰魔龍ヤマタノヒドラ | BS16-X06-e2 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターンに8回まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| BS16-X03 | 烈の覇王セイリュービ | BS16-X03-e1 | burst/summonBurstCardFree | 自分のトラッシュのコアが5個以上のとき、自分のトラッシュのコアすべてを自分のフィールド/リザーブに好きなように置くことで | 済（入口） | keywords/burst.ts:125,315 バースト発動の確認 |
| BS16-021 | ノウゼンサーバル | BS16-021-e1 | shinsokuPayAssist | 【神速】で自分の手札にあるスピリットカードを召喚するとき、このスピリットを疲労させることで、自分のリザーブから2コストま | 済（入口） | GameEngine.ts:489 神速召喚の宣言でプレイヤーが疲労させる個体を指定 |
| BS16-018 | 太骨望 | BS16-018-e2 | activated/destroy | 自分の手札にある系統：「覇皇」/「雄将」を持つスピリットカード1枚を破棄することで、疲労状態のコスト6以下の相手のスピリ | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS16-005 | ゴエモン・シーフ・ドラゴン | BS16-005-e2 | activated/timedEffect | 自分の手札にある赤のカード1枚を破棄することで、このバトルの間、系統：「覇皇」/「雄将」を持つ自分のスピリット1体の持つ | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| BS16-006 | アーチャー・ドラゴン | BS16-006-e2 | activated/destroy | このスピリットのコア2個を自分のトラッシュに置くことで、BP4000以下の相手のスピリット1体を破壊する。 | 済（入口） | GameEngine.ts:1332 起動ボタンを押す操作が確認（cost もここで払う） |
| SD02-008 | 犀銃士グライノス | SD02-008-e3 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターン中に指定された回数まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| SD02-010 | 轟剣士レーヴェン | SD02-010-e3 | triggered/refreshSelfByExhaustNexus(optional:true) | このスピリットは、ターンに1回まで、自分のネクサス1つを疲労させることで回復できる。 | 済（入口） | triggers.ts:566 optional:true は requestActivationConfirm |
| SD02-014 | 魔法監視塔 | SD02-014-e1 | fieldEvent/reviveLastDestroyedNexus(optional:true) | 自分のネクサスが破壊されたとき、自分のフィールド/リザーブのコア1個を自分のトラッシュに置くことで、破壊されたネクサス1 | 済（入口） | triggers.ts:1697 optional:true は requestActivationConfirm |
| BS10-085 | 浮遊する岩塊 | BS10-085-e2 | handKeywordGrant | 自分の手札にある効果の記述を持たないスピリットカードすべてに“【神速】手札にあるこのスピリットカードは、召喚コストの支払 | 説明文 | 神速の付与文（granted keyword の効果文）。実体は keyword 神速 |

## 別表：キーワード／バーストの定型文

| 区分 | 件数 | カードID | 節 | 根拠 |
| :-- | --: | :-- | :-- | :-- |
| 済（自前） | 28 | BS14-091, BS14-094, BS14-095, BS14-096, BS14-101, BS14-102, BS14-103, BS14-105, BS14-107, BS14-110, BS14-112, BS14-113, BS14-114, BS15-073, BS15-076, BS15-080, BS15-082, BS15-083, BS15-084, BS16-074, BS16-076, BS16-078, BS16-080, BS16-082, BS16-083, SD06-015, SD06-016, SD06-017 | その後コストを支払うことで、このカードのフラッシュ効果を発揮する（バースト thenPay） | keywords/burst.ts:127 `requestActivationConfirm`。choice.ts:394 で承認後に支払う。**ただし burst.ts:124 は払えないとき確認を出さずスキップ（「払えないときも確認は出す」と食い違い）** |
| 済（自前） | 7 | BS14-092, BS14-097, BS14-099, BS15-074, BS15-078, SD06-013, SD06-014 | その後コストを支払うことで、このカードのメイン効果を発揮する（バースト thenPay） | 同上 |
| 説明文 | 18 | BS02-026, BS06-035, BS10-026, BS11-017, BS11-020, BS11-021, BS11-053, BS11-X03, BS12-019, BS13-021, BS14-025, BS14-X03, BS15-025, BS16-022, BS16-023, BS16-026, BS16-057, SD01-016 | 手札にあるこのスピリット／ブレイヴカードは、召喚コストの支払いと上に置くコアをリザーブから使用することで召喚できる（【神速】の説明文） | kind:keyword 神速。召喚の宣言そのものが確認 |

## 要対応のまとめ（kind／type ごと）

| 区分 | kind／type | 件数 | カードID |
| :-- | :-- | --: | :-- |
| 要対応：pay へ移せる | fieldEvent/refreshOne | 1 | BS15-067 |
| 要対応：pay へ移せる | step/draw | 1 | BS16-063 |
| 要対応：pay へ移せる | step/lendSelfThisTurn | 1 | BS15-048 |
| 要対応：pay へ移せる | step/negateLifeDamageFromTarget | 1 | BS13-027 |
| 要対応：pay へ移せる | step/refreshOne | 1 | BS15-023 |
| 要対応：pay へ移せる | step/timedEffect | 2 | BS14-043, BS15-032 |
| 要対応：pay へ移せる | triggered/refreshSelf | 1 | BS13-023 |
| 要対応：pay へ移せる | triggered/summonFromHandFree | 1 | BS13-004 |
| 要対応：器が聞く必要 | effectGrant/refreshSelfByExhaustNexus | 1 | BS08-084 |
| 要対応：器が聞く必要 | effectGrant/selfBuffByExhaustFamily | 1 | BS06-074 |
| 要対応：器が聞く必要 | globalConstraint/ownLifeFloor | 1 | BS14-084 |
| 要対応：器が聞く必要 | reviveOnDestroy | 8 | BS04-039, BS06-076, BS07-042, BS08-056, BS14-064, BS14-X05, BS15-057, BS15-063 |
| 要対応：器が聞く必要 | triggered/bpBuff | 1 | BS13-024 |

補足：
- reviveOnDestroy の optional なし（8件）は、データに `optional: true` を付ければ revive.ts の確認に乗る可能性がある（要設計確認。「〜できる」でない強制の置換効果が無いか、効果文を見て決める）。
- 「pay へ移せる」9件は step／fieldEvent／triggered の optional なしで、cost を自動払いしている。pay に移すか、`optional: true` を付けるかのどちらでも確認は出る。
- 「払えないときも確認は出す」との食い違い：burst.ts:124（thenPay）。
