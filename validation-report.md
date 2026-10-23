# Release 0.1 検証記録

実データは使用していません。すべて架空の合成記録です。2026-10-23、Node.js 24.19.0 / Linux / システムChromiumで検証。

## タスク別

| ID  | 主な変更ファイル                                                                                                                                    | 検証結果                                                          | 未対応・制約                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| T01 | architecture.md、data-specification.md、package.json、設定各種、src/main.tsx、src/app/App.tsx、src/styles/index.css、tests/e2e/navigation.spec.ts   | strict型検査・本番ビルド成功、Chromium画面遷移1件成功             | 初期骨格。機能は後続で実装                                                  |
| T02 | src/domain/models/run.ts、src/domain/analytics/{running,time}.ts、src/infrastructure/db/database.ts、単体・DBテスト、合成Run                        | Vitest 13件成功、型検査・ビルド成功                               | インポートはT03                                                             |
| T03 | src/infrastructure/apple-health/_、src/workers/_、src/features/import/ImportDialog.tsx、合成XML、取り込みテスト                                     | Vitest 23件成功、型検査・ビルド成功、Chromium E2E 3件成功         | ZIP64・暗号化・分割ZIP非対応                                                |
| T04 | src/pages/Dashboard.tsx、src/components/{DistanceChart,RunHistory,format}、App・CSS、dashboard.spec.ts                                              | Vitest 23件、Chromium E2E 5件、型検査・ビルド成功                 | 端末幅の追加検証はT06                                                       |
| T05 | src/pages/Analysis.tsx、src/components/PaceChart.tsx、App・CSS、analysis.spec.ts                                                                    | Vitest 23件、Chromium E2E 7件、型検査・ビルド成功                 | グラフは12か月、全記録はページング                                          |
| T06 | tests/e2e/quality.spec.ts、tests/performance/import.large.test.ts、合成XML生成、単体・DBテスト拡充、フォーカス・スキップリンク・CSP・数値解析の修正 | Vitest 28件、大容量1件、Chromium E2E 15件成功、型検査・ビルド成功 | Firefox・WebKitは実行ファイル不足で起動不可。Safari実機・全上限容量は未検証 |
| T07 | README.md、.github/workflows/pages.yml、public/.nojekyll、仕様・検証記録                                                                            | 型検査・本番ビルド・Vitest 28件・Chromium E2E 15件成功            | リモート作成・push・公開確認はGitHub接続待ち                                |

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

## 最終状態

最終チェック：`npm test` 28件成功、`npm run test:large` 1件成功、`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- --project=chromium` 15件成功。E2Eコマンド内のstrict型検査・本番ビルドも成功。

T07のREADME・Pagesワークフロー・静的公開設定は作成済み。Prettierで整形し、CIに整形チェックも追加。GitHub CLIの認証が無効で、接続済みアカウントの`konbuden/my-running-coach`は404のため、リポジトリ作成・push・実デプロイ・公開URL確認は未実施。

Firefox / WebKitの起動を試みたところ、実行ファイルがないため開始できなかった。機能テストの成功としては数えない。CIはブラウザをインストールして3エンジンを必須実行し、成功後だけ公開する構成。

公開済みとは扱わず、GitHub認証・リポジトリ接続と3ブラウザCI成功後に公開URLを検証する必要がある。

## 公開再開時の確認

2026-10-23、残作業の完了に向け再確認。ローカル実装コミット`df138f3`の作業ツリーは変更なし。CLI認証は引き続き無効、`konbuden/my-running-coach`の取得は404。接続済みリポジトリの検索も全ページで該当なし。

`PLAYWRIGHT_BROWSERS_PATH=/tmp/my-running-coach-browsers PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=10000 timeout 40s npx playwright install firefox webkit`を実行。標準配布先と公式フォールバックのいずれも403 `Domain forbidden`で取得不可。Firefox・WebKitは未検証のままで、成功件数に追加していない。通信制限の回避やテスト条件の緩和は行っていない。

変更はREADMEの接続・公開再開手順と本確認記録のみ。アプリやCIの公開条件は変更していない。文書の整形チェックを実行し、ソースアーカイブを更新する。

## Jogへの公開先変更

利用者指定の`konbuden/Jog`を接続ツールで確認。空の非公開リポジトリで、管理・書き込み権限あり。アプリ・パッケージ名を維持し、Viteのbase、PlaywrightのURL、起動・公開手順を`/Jog/`へ変更した。Pagesの利用可否・設定は未確認で、公開範囲は変更しない。ローカル再検証とソース反映の結果は後続に記録する。
