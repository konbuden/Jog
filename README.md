# My Running Coach — Release 0.1

Apple Healthのランニングを日本語のダッシュボードと走力分析画面で振り返る、個人用Webアプリ。React / strict TypeScript / Vite / Dexieで構築しています。

**公開アプリ：[My Running Coach](https://konbuden.github.io/Jog/)**

## 起動

Node.js 24 LTS、npmを使用します。

```sh
npm ci
npm run dev
```

表示先：`http://localhost:5173/Jog/`。

本番ビルドの確認：

```sh
npm run build
npm run preview
```

表示先：`http://localhost:4173/Jog/`。ファイルを直接開く方式には対応しません。公開時はHTTPSが必要です。ローカルではlocalhostを使用してください。

## 使い方

1. iPhoneの「ヘルスケア」→プロフィール→「すべてのヘルスケアデータを書き出す」でZIPを保存します。
2. 「データをインポート」からZIPか展開済みの`export.xml`を選択します。
3. 新規・重複・除外件数、対象期間、警告を確認して「保存する」を押します。キャンセルもできます。
4. 各画面の「対象月」で単月・複数月（開始月〜終了月）・全期間を選びます。集計・グラフ・履歴すべてに反映します。走力分析の距離・日付・心拍条件も併用できます。
5. 走力分析の記録行にある「詳細を見る」で、コースや追加指標を確認します。元データにない値は「データなし」と表示します。

追加指標はWorkout内の歩数、平均ケイデンス、アクティブ消費エネルギー、ランニングパワー、歩幅、接地時間、上下動、最大心拍、上昇高度、屋内・屋外の情報に対応します。ケイデンスの明示値がなく、Workout内の歩数がある場合は歩数÷Workout時間から算出し、その旨を表示します。独立したRecordを時刻から結び付けて補完しません。

コースはWorkoutRouteのFileReferenceとZIP内GPXの参照先が一致する場合に限り保存します。GPS軌跡を背景地図なしで表示し、外部地図サービスにはアクセスしません。XML単体ではコース座標を取得できません。**以前取り込んだ記録には元のZIPを再インポートしてください。** 保存前に詳細追加件数を確認でき、記録を重複させず不足情報だけを追加します。

サンプルデータは自動投入しません。初回は空の画面です。健康情報はブラウザ内で処理し、IndexedDBに保存します。生XML/ZIPは保存しません。本番ではCSPの`connect-src 'none'`で通信も禁止しています。テレメトリや外部フォントは使用しません。アプリの静的ファイル取得には通常のHTTPS通信が発生します。

## 数値のルール

- 日時はUTC保存、表示・月集計・日付条件は日本時間（Asia/Tokyo）です。
- 月をまたぐランは開始月に計上します。目標は月100km固定です。複数月では100km×対象月数が期間目標です。
- 平均ペースは総時間÷総距離、平均心拍は取得済みランだけの時間加重平均です。
- 10km等速換算は同じ平均ペースで10km走った場合の時間で、予測記録ではありません。
- 心拍は同じWorkout内の平均統計だけを使用します。独立した心拍Recordを時刻から紐付けず、不明な心拍は「データなし」と表示します。
- 同じファイルや重複エクスポートを再度取り込んでも、同じIDのランは追加しません。距離・時間・心拍の内容が変わっている場合は既存値を保持し警告します。追加指標は既存値を上書きせず、欠けている項目だけを補います。
- 各画面のグラフも選択した対象月に揃えます。期間指定は100年（1,200か月）までです。記録表は絞り込み結果全体を20件ずつ表示します。

詳細：[architecture.md](architecture.md)、[data-specification.md](data-specification.md)。

## 保存・対応範囲

保存先は端末・ブラウザ・オリジンごとに独立し、同期しません。ブラウザのデータ削除や保存領域の回収で記録が消えることがあります。元のエクスポートを保管してください。ブラウザを変えた場合は元ファイルから再取り込みできます。

選択するXML・ZIPはどちらも200 MB（200,000,000バイト）まで、ZIP展開後のXMLは5 GB（5,000,000,000バイト）までです。ZIPは10,000エントリ・管理情報8 MiBまで。通常ZIPとZIP64のstored/deflateに対応します。暗号化・分割ZIP・複数export.xmlは非対応です。展開後のXMLをファイルとして丸ごと保存せず、ランニング記録だけを逐次抽出するため、5 GB分の空き領域を必須とはしません。解析時間と保存容量は記録数・端末性能に依存します。構文不正のXMLは一部だけ保存しません。未知の単位や欠損データは理由を表示します。

コースは1ラン8 GPX・64区間、GPXは展開後1ファイル20 MB・全体200 MBまで。GPS点は表示用に約2,000点へ間引き、区間の切れ目をつなぎません。コースだけが不正・欠損の場合は警告して走行記録を残します。座標は別のIndexedDBテーブルで保存し、詳細表示時だけ読み込みます。

安定したUUIDがないランで距離等が後から変更されると、別の記録になる場合があります。異なる出典・機器の同一活動は自動統合しません。XMLの距離は`totalDistance`またはWorkout内の対応する距離統計が必要です。

対応API：Web Worker、Web Crypto、IndexedDB、Web Locks、dialog。モダンブラウザを想定しています。GitHub ActionsでChromium・Firefox・WebKitのE2E 57件が成功しています。iPhone・iPad実機は未検証です。CIでは3ブラウザの成功を公開条件にしています。

## テスト

```sh
npm test
npm run test:large
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
```

E2Eは本番ビルドに対して実行します。システムのChromiumだけで検証する場合：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- --project=chromium
```

`test:large`は100 MiBの合成XMLとZIPに加え、200 MBちょうどのXMLとZIP、5 GBちょうどに展開されるZIP64を一時ディレクトリに生成して解析し、終了後に削除します。計測結果はOSの一時ディレクトリの`my-running-coach-performance.json`と`my-running-coach-zip64-performance.json`へ保存します。詳細は[validation-report.md](validation-report.md)を参照してください。

合成テストデータは`tests/fixtures/synthetic/`に限定しています。実データをリポジトリ、テスト、CI、スクリーンショットに入れないでください。XML/ZIPは原則gitignoreし、合成fixtureのXMLだけを例外としています。

## GitHub Pagesへの公開

アプリ名・パッケージ名はMy Running Coach / my-running-coach、公開先は[`konbuden/Jog`](https://github.com/konbuden/Jog)です。Viteのbaseは`/Jog/`です。

1. GitHubの`konbuden/Jog`リポジトリを使用します。
2. Settings → Pages → Build and deployment → Sourceを **GitHub Actions** に設定します。
3. このプロジェクトをmainブランチへpushします。
4. Actionsの「Validate and deploy Pages」を確認します。型検査・Vitest・大容量解析・3ブラウザE2Eのいずれかが失敗すると公開ジョブは実行されません。
5. 成功後、Actionsに表示されるPages URLでダッシュボード、分析への直接アクセス、ZIP/XML取り込みを確認します。

ワークフローは`dist/`だけをアップロードします。IndexedDBや元の健康情報は公開成果物に含まれません。独自ドメイン・別名リポジトリを使う場合はViteのbaseとテストURLも変更してください。

### 公開状況

2026年10月23日14:09（日本時間）、GitHub Pagesへの公開が成功しました。利用者がリポジトリをPublicに設定し、Pagesを有効にした後、検証済みの成果物を公開しています。公開先は **https://konbuden.github.io/Jog/** です。

2026年10月23日21:10（日本時間）、両画面の単月・複数月選択と、ラン詳細のコース・追加指標に対応した版を公開しました。[GitHub Actionsの実行結果](https://github.com/konbuden/Jog/actions/runs/39950385114)：整形チェック・strict型検査・本番ビルド・単体/DBテスト71件・大容量テスト3件・3ブラウザE2E 57件が成功し、deployジョブも成功しました。5 GBちょうどのZIP64解析も継続して検証しています。検証内容と制約は[validation-report.md](validation-report.md)に記載しています。
