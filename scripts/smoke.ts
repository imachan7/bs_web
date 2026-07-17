// smoke テストのランナー（本体は scripts/smoke/ に分割。npm run smoke / smoke:quiet で実行）
// 新しいテストは scripts/smoke/ に partN.ts を追加してここに import を足す
import "./smoke/part1"
import "./smoke/part2"
import "./smoke/part3"
import "./smoke/part4"
import "./smoke/part5"
import "./smoke/part6"
import "./smoke/part7"
import "./smoke/part8"
import "./smoke/part9"
import { summary } from "./smoke/helpers"

summary()
