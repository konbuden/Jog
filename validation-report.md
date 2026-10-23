# Release 0.1 検証記録

最新結果：ZIP 200 MB・展開後XML 5 GB対応版を公開済み。GitHub Actionsで単体61件・大容量3件・3ブラウザE2E 48件が成功し、2026年10月23日17:25（日本時間）にdeployジョブも成功しました。

200 MB版の公開結果：200 MB上限への変更を公開済み。GitHub Actionsで単体39件・大容量2件・3ブラウザE2E 45件が成功し、2026年10月23日14:48（日本時間）にdeployジョブも成功しました。

初回公開結果：**[My Running Coach](https://konbuden.github.io/Jog/)を公開済み**。2026年10月23日14:09（日本時間）にGitHub Pagesのdeployジョブが成功。型検査・ビルド・整形チェック、Vitest 36件、大容量テスト1件、Chromium・Firefox・WebKitのE2E合計45件が成功しています。

実データは使用していません。すべて架空の合成記録です。2026-10-23、Node.js 24.19.0 / Linux / システムChromiumで検証。

## 展開後XMLの5 GB対応

ZIP自体の200 MB上限を維持し、展開後のexport.xmlを5 GB（5,000,000,000バイト）まで受け付ける。選択するXMLファイル自体の上限も従来どおり200 MB。4 GiB超に必要なZIP64のエントリ追加情報・終端レコード・データ記述子に対応した。

ZIPの管理情報を上限内で読み、対象XMLの圧縮位置・サイズを使って逐次展開する。不要なGPX等は展開しない。中央管理情報とローカルヘッダー、CRC32、実展開サイズを照合し、不正・欠損・暗号化・分割ZIPはエラーにする。5 GB超過は事前の宣言サイズと実展開の両方で制限する。全XML・全心拍データをメモリやIndexedDBへ保存しない。

変更ファイル：`src/infrastructure/apple-health/{import-limits,import-file,zip-metadata}.ts`、インポート画面、ZIP64合成生成器・単体・大容量・E2Eテスト、README、設計・仕様・検証記録。

ローカル検証：単体61件、大容量3件、Chromium E2E 16件、strict型検査・本番ビルド・整形チェック成功。通常ZIP／ZIP64、ZIP64終端レコード有無、サイズのみ64bitの形式、データ記述子有無、4 GiB超・5 GB境界、1バイト超過、管理情報破損・サイズ過小申告・暗号化・分割・既存管理上限を検証した。

5 GB実測：合成XMLを小さなブロックから圧縮し、ZIP64だけを一時ディレクトリに生成。ZIP 22,098,748バイトからXML 5,000,000,000バイトを逐次解析し、合成ラン24件の抽出とCRC一致を確認。解析142.48秒、プロセスRSS最大266.1 MiB、開始前からのRSS増加183.2 MiB、JSヒープ増加85.5 MiB。圧縮生成の時間は解析秒数に含まない。チャンク単位のサンプリングで、実機の上限を保証する値ではない。5 GBのXML自体はディスクへ書き出していない。

[GitHub Actions実行39923570883](https://github.com/konbuden/Jog/actions/runs/39923570883)で単体61件・大容量3件・Chromium／Firefox／WebKit各16件、合計48件のE2E、整形・型検査・本番ビルドが成功。検証対象コミットは`86d2e01cb94209d55224ae3166ac284428a355d3`。deployジョブ`120317372452`で2026-10-23 08:25:32 UTC（17:25 JST）の`Reported success!`と公開URL https://konbuden.github.io/Jog/ を確認した。iPhone・iPad実機での5 GB取り込みは未検証。実データは使用していない。

## 200 MB上限への変更（過去の結果）

選択するZIP・XMLの上限を200 MB（200,000,000バイト）へ統一。上限値を独立した定数にし、Workerの判定・画面表示・容量エラーを共有した。ZIP展開後のXMLは既存の512 MiB上限を維持し、逐次解析と項目数・トークンの制限も維持した。

変更ファイル：`src/infrastructure/apple-health/{import-file,import-limits}.ts`、`src/features/import/ImportDialog.tsx`、単体・大容量・E2Eテスト、README、本仕様・検証記録。

ローカル検証：単体39件、大容量2件、Chromium E2E 15件、strict型検査・本番ビルド・整形チェック成功。200 MBちょうどのXMLとZIPを一時ファイルとして生成し、各24件の合成ランを解析した。199,999,999／200,000,000バイトで読み込みを開始すること、200,000,001バイトでは読み込み前にエラーになることを両形式で確認。512 MiBを超える展開サイズのZIPも拒否する。

[GitHub Actions実行39907528477](https://github.com/konbuden/Jog/actions/runs/39907528477)で単体39件・大容量2件・3ブラウザE2E 45件、整形・型検査・ビルドが成功。検証対象コミットは`1f2f171139af385f5a72fb23596f16ace1248b78`。deployジョブ`120263683656`のログに2026-10-23 05:48:45 UTC（14:48 JST）の`Reported success!`と公開URL https://konbuden.github.io/Jog/ を確認した。実在の健康情報は使用していない。iPhone・iPad実機および公開URLでの直接表示確認は引き続き未実施。

## タスク別

| ID  | 主な変更ファイル                                                                                                                                    | 検証結果                                                          | 未対応・制約                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| T01 | architecture.md、data-specification.md、package.json、設定各種、src/main.tsx、src/app/App.tsx、src/styles/index.css、tests/e2e/navigation.spec.ts   | strict型検査・本番ビルド成功、Chromium画面遷移1件成功             | 初期骨格。機能は後続で実装                                                                  |
| T02 | src/domain/models/run.ts、src/domain/analytics/{running,time}.ts、src/infrastructure/db/database.ts、単体・DBテスト、合成Run                        | Vitest 13件成功、型検査・ビルド成功                               | インポートはT03                                                                             |
| T03 | src/infrastructure/apple-health/_、src/workers/_、src/features/import/ImportDialog.tsx、合成XML、取り込みテスト                                     | Vitest 23件成功、型検査・ビルド成功、Chromium E2E 3件成功         | ZIP64・暗号化・分割ZIP非対応                                                                |
| T04 | src/pages/Dashboard.tsx、src/components/{DistanceChart,RunHistory,format}、App・CSS、dashboard.spec.ts                                              | Vitest 23件、Chromium E2E 5件、型検査・ビルド成功                 | 端末幅の追加検証はT06                                                                       |
| T05 | src/pages/Analysis.tsx、src/components/PaceChart.tsx、App・CSS、analysis.spec.ts                                                                    | Vitest 23件、Chromium E2E 7件、型検査・ビルド成功                 | グラフは12か月、全記録はページング                                                          |
| T06 | tests/e2e/quality.spec.ts、tests/performance/import.large.test.ts、合成XML生成、単体・DBテスト拡充、フォーカス・スキップリンク・CSP・数値解析の修正 | Vitest 28件、大容量1件、Chromium E2E 15件成功、型検査・ビルド成功 | ローカルのFirefox・WebKitは起動不可。3ブラウザ検証はT07のCIで成功。実機・全上限容量は未検証 |
| T07 | README.md、.github/workflows/pages.yml、public/.nojekyll、仕様・検証記録                                                                            | 型検査・本番ビルド・Vitest 36件・3ブラウザE2E 45件成功            | Pagesへの公開成功。公開先の直接表示確認は通信制限により未実施                               |

## 必須ケース

- 距離・時間からのペース、10km等速換算、加重平均、月間距離、日本時間の月境界
- 距離・期間・心拍帯のAND条件、130以上140未満、null除外
- Workout属性とWorkoutStatisticsからの抽出、m/km/mi、秒/分/時間
- 心拍Recordを推測で紐付けない、欠損・複数心拍統計をnullとして表示
- XML・ZIP、CRC不一致、複数XML、未対応形式、不正XML、過大トークン、容量超過
- 同一ファイル再取り込み、単位違いでも同一ID、UUID、既存値保持、201件の複数バッチ確定
- 保存前の本データ未変更、失敗時ロールバック、途中不正XMLの部分保存なし、キャンセル、タブ間排他
- ダッシュボード、心拍全欠損の分析、フィルタ、10件・20件の表示件数
- 390×844 / 768×1024 / 1440×1050のページ横はみ出し検証、スクリーンショット目視
- ダイアログのキーボード操作とフォーカス復帰、分析画面のスキップリンク
- 取り込み時の外部通信なし、25 MiB XML解析中のメインスレッド応答と実Worker起動

## 大容量測定

100.04 MiBのXMLと同内容の0.40 MiB ZIP。独立した心拍Recordを大量に含み、有効な合成ランは24件。Node.js上でファイルを逐次読み込み、100 MiB全体を文字列にはしていません。

| 入力 | 解析秒 | プロセスRSS最大 | 解析前からのRSS増加 | JSヒープ増加 |
| ---- | -----: | --------------: | ------------------: | -----------: |
| XML  |   4.24 |       125.7 MiB |            22.4 MiB |     13.0 MiB |
| ZIP  |   5.04 |       200.1 MiB |            74.3 MiB |     19.0 MiB |

各読み込みチャンク後のサンプリング値で、瞬間ピークの保証ではありません。Nodeのプロセス・コンプレッサー生成・GCの影響を含み、Safari/iPadでのメモリ上限や実ファイルの最大対応を保証しません。ZIP展開チャンク、XMLトークン、全展開量に独立した上限を設けています。大量のWorkoutを含むデータではDB容量と保存時間も増えます。

## 初回公開時の最終状態

検証対象コミット：[`9c06edc84ffc192997da8712cafa21f31cc91c96`](https://github.com/konbuden/Jog/commit/9c06edc84ffc192997da8712cafa21f31cc91c96)。GitHub Actionsの[実行39902487375](https://github.com/konbuden/Jog/actions/runs/39902487375)でverify・deployジョブ成功。

- 整形チェック、strict型検査、本番ビルド成功
- Vitest 36件成功
- 100 MiB合成XML/ZIPの大容量テスト1件成功
- Chromium 15件・Firefox 15件・WebKit 15件、合計45件成功
- 検証済みのdist成果物をGitHub Pagesへ公開済み

公開先は利用者が指定した`konbuden/Jog`。接続済みGitHubツール経由でmainへ反映した。アプリ名・パッケージ名を維持し、baseとテストURLは`/Jog/`へ変更した。

当初はPages未設定で公開ジョブが停止した。利用者がリポジトリをPublicに設定してPagesを有効にしたことを確認後、失敗した公開ジョブのみ再実行。実行39902487375のattempt 2、deployジョブ`120252090487`で、検証対象コミットの成果物が2026-10-23 05:09 UTC（14:09 JST）に公開成功した。GitHubのログに`Reported success!`と公開URL **https://konbuden.github.io/Jog/** が記録され、リポジトリの`has_pages: true`も確認した。

この作業環境から公開URLへの直接HTTPSアクセスは通信ポリシーの403で制限されたため、公開先での実ブラウザ表示・取り込み確認は未実施。公開成功はGitHubのデプロイ結果で確認している。公開に使用した本番ビルドに対する3ブラウザE2Eは成功している。iPhone・iPad実機検証は未実施。

以下は作業中の確認履歴。最新状態は本節を参照。

## 公開再開時の確認

2026-10-23、残作業の完了に向け再確認。ローカル実装コミット`df138f3`の作業ツリーは変更なし。CLI認証は引き続き無効、`konbuden/my-running-coach`の取得は404。接続済みリポジトリの検索も全ページで該当なし。

`PLAYWRIGHT_BROWSERS_PATH=/tmp/my-running-coach-browsers PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=10000 timeout 40s npx playwright install firefox webkit`を実行。標準配布先と公式フォールバックのいずれも403 `Domain forbidden`で取得不可。Firefox・WebKitは未検証のままで、成功件数に追加していない。通信制限の回避やテスト条件の緩和は行っていない。

変更はREADMEの接続・公開再開手順と本確認記録のみ。アプリやCIの公開条件は変更していない。文書の整形チェックを実行し、ソースアーカイブを更新する。

## Jogへの公開先変更

利用者指定の`konbuden/Jog`を接続ツールで確認。空の非公開リポジトリで、管理・書き込み権限あり。アプリ・パッケージ名を維持し、Viteのbase、PlaywrightのURL、起動・公開手順を`/Jog/`へ変更した。Pagesの利用可否・設定は未確認で、公開範囲は変更しない。ローカル再検証とソース反映を完了し、最終結果を「最終状態」に記載した。

## CIで判明した差異と対応

初回の3ブラウザ実行では44件成功。WebKitがFile読み込みを同一オリジンのblob URLとして報告し、外部通信検出テストが誤判定した。URLのオリジンを比較するよう修正し、別ホスト・別ポート・外部blobを検出しつつ、同一オリジンblob・埋め込みdata URLを区別する8件の回帰テストを追加。アプリ本体の通信設定は緩和していない。

CIのUbuntu Azure HTTPミラーが低速だったため、依存導入とブラウザ取得を分離し、それぞれ5分の上限を設定。公式Ubuntu HTTPSアーカイブへ切り替えた最終実行で準備と全検証が成功した。長時間の準備中だった旧実行は新コミットのconcurrency設定によりキャンセルされた。
