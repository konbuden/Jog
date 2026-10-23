# データ仕様 — Release 0.1

## Run

`id: string`, `source: 'apple-health'`, `sourceId: string`, `startTime: string`, `endTime: string`, `distanceMeters: number`, `durationSeconds: number`, `averageHeartRateBpm: number | null`, `paceSecondsPerKm: number`, `importedAt: string`。
追加でsourceName、device、元UTCオフセット、距離と心拍の取得根拠を保持する。日時はUTC ISO 8601、importedAtは保存確定時。

## 日時

Appleの`YYYY-MM-DD HH:mm:ss ±HHmm`または明示的オフセット付きISO日時を厳密に解析。オフセット欠損・不正日付・終了が開始より前の場合は対象ランを除外。端末のタイムゾーンに依存しない。
表示・日付フィルタ・月間集計は`Asia/Tokyo`固定。開始日時の月に全距離を計上。日付フィルタは開始日00:00以上、終了日の翌日00:00未満。

## 抽出と単位

`HKWorkoutActivityTypeRunning`のみ。距離はWorkout.totalDistanceを優先、なければそのWorkout内のHKQuantityTypeIdentifierDistanceWalkingRunningのsum。同じ距離を二重加算しない。矛盾は警告。距離m/km/miをmへ、durationのs/sec/min/h/hrを秒へ。miは1609.344m。
時間はWorkout.durationを用い、開始終了差で補完しない。距離・時間は有限の正値。欠損・未知単位・日時不正は除外理由を表示。
心拍は同じWorkoutに含まれるHKQuantityTypeIdentifierHeartRateのaverageのみ。count/minとbpmに対応。正の有限値でなければnullにして警告。独立した心拍Recordは時刻が重なっても紐付けない。平均心拍統計が複数ある場合も推測で統合しない。

## 重複

WorkoutにUUID等の明示的安定IDがある場合は出典と組み合わせる。なければ出典名・device・UTC開始終了・正規化距離・正規化durationからsourceIdを作る。正規化数値は小数点以下6桁で安定化。idはこのキーのSHA-256。
心拍とimportedAtはキーに含めない。同一ファイル・重複エクスポートの同じランは追加しない。同じIDで内容が変わっている場合は既存値を保持し警告。別出典の同時刻ランは自動統合しない。同一Workoutの距離等が後で変更された場合、UUIDがないと別ランになり得る。

## 計算

- paceSecondsPerKm = durationSeconds / (distanceMeters / 1000)
- 10km等速換算 = paceSecondsPerKm × 10。予測記録ではない。
- 月間距離 = 開始月に属する有効ランの距離合計
- 平均ペース = 対象の総duration / 総距離km。各ランのペースの単純平均ではない。
- 平均心拍 = 心拍取得済みランのdurationによる加重平均。取得件数を併記。
- 心拍130台 = 130以上140未満。月次の帯内平均ペースも総時間 / 総距離km。
- フィルタはAND。距離・心拍は下限を含み上限を含まない。心拍指定時はnullを除外。
- 目標は月100km固定。達成率は100%超も数値表示。ゲージのみ100%で上限。
- 丸めは表示時。計算には元の精度を使用。

## 欠損とエラー

心拍nullは「データなし」、集計値なしは「—」。空の月の距離は0km、平均ペース・心拍は欠損。グラフで欠損月を補間しない。
インポート前に新規・重複・除外件数と対象期間を表示。警告は種類別件数を集計し、無制限のエラーメッセージ配列を保持しない。XML構文不正はファイル全体を失敗とし、部分保存しない。
IndexedDBの本データは確定トランザクションでのみ更新。ブラウザ・端末・オリジン間で同期しない。ブラウザデータ削除で消えるため元のApple Healthエクスポートは利用者が保管する。

## インポート容量

選択するZIP・XMLはどちらも200 MB（200,000,000バイト）以下を受け付け、1バイトでも超える場合は読み込み前にエラーにする。ZIP展開後のXMLは別途512 MiB（536,870,912バイト）以下に制限し、ZIPの管理情報と展開中の実測サイズの両方で検証する。逐次解析のチャンクサイズ・XMLトークン・項目数の制限は維持する。

## テストデータ

`tests/fixtures/synthetic`以外のXML・ZIPはgitignore。架空の出典・日時・値のみ。実在の健康データはコミット・ログ・CI・外部APIに送信しない。
