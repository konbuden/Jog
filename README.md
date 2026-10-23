# My Running Coach — Release 0.1

Apple Healthのランニングを日本語のダッシュボードと走力分析画面で振り返る、個人用Webアプリ。React / strict TypeScript / Vite / Dexieで構築しています。

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
4. ダッシュボードの表示月、走力分析の距離・期間・心拍フィルタで記録を確認します。

サンプルデータは自動投入しません。初回は空の画面です。健康情報はブラウザ内で処理し、IndexedDBに保存します。生XML/ZIPは保存しません。本番ではCSPの`connect-src 'none'`で通信も禁止しています。テレメトリや外部フォントは使用しません。アプリの静的ファイル取得には通常のHTTPS通信が発生します。

## 数値のルール

- 日時はUTC保存、表示・月集計・日付条件は日本時間（Asia/Tokyo）です。
- 月をまたぐランは開始月に計上します。目標は月100km固定です。
- 平均ペースは総時間÷総距離、平均心拍は取得済みランだけの時間加重平均です。
- 10km等速換算は同じ平均ペースで10km走った場合の時間で、予測記録ではありません。
- 心拍は同じWorkout内の平均統計だけを使用します。独立した心拍Recordを時刻から紐付けず、不明な心拍は「データなし」と表示します。
- 同じファイルや重複エクスポートを再度取り込んでも、同じIDのランは追加しません。内容が変わっている場合は既存値を保持し警告します。
- 分析のグラフは選択した最終月までの12か月です。記録表は絞り込み結果全体を20件ずつ表示します。

詳細：[architecture.md](architecture.md)、[data-specification.md](data-specification.md)。

## 保存・対応範囲

保存先は端末・ブラウザ・オリジンごとに独立し、同期しません。ブラウザのデータ削除や保存領域の回収で記録が消えることがあります。元のエクスポートを保管してください。ブラウザを変えた場合は元ファイルから再取り込みできます。

XMLは512 MiB、ZIPは128 MiB、展開後のXMLは512 MiBまでです。ZIPは10,000エントリ・管理情報8 MiBまで。通常ZIPのstored/deflateに対応し、ZIP64・暗号化・分割ZIP・複数export.xmlは非対応です。その場合はexport.xmlを直接選択してください。構文不正のXMLは一部だけ保存しません。未知の単位や欠損データは理由を表示します。

安定したUUIDがないランで距離等が後から変更されると、別の記録になる場合があります。異なる出典・機器の同一活動は自動統合しません。XMLの距離は`totalDistance`またはWorkout内の対応する距離統計が必要です。

対応API：Web Worker、Web Crypto、IndexedDB、Web Locks、dialog。モダンブラウザを想定しています。GitHub ActionsでChromium・Firefox・WebKitのE2E 45件が成功しています。iPhone・iPad実機は未検証です。CIでは3ブラウザの成功を公開条件にしています。

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

`test:large`は100 MiBの合成XMLとZIPを一時ディレクトリに生成して解析し、終了後に削除します。計測結果はOSの一時ディレクトリの`my-running-coach-performance.json`へ保存します。詳細は[validation-report.md](validation-report.md)を参照してください。

合成テストデータは`tests/fixtures/synthetic/`に限定しています。実データをリポジトリ、テスト、CI、スクリーンショットに入れないでください。XML/ZIPは原則gitignoreし、合成fixtureのXMLだけを例外としています。

## GitHub Pagesへの公開

アプリ名・パッケージ名はMy Running Coach / my-running-coach、公開先は[`konbuden/Jog`](https://github.com/konbuden/Jog)です。Viteのbaseは`/Jog/`です。

1. GitHubの`konbuden/Jog`リポジトリを使用します。
2. Settings → Pages → Build and deployment → Sourceを **GitHub Actions** に設定します。
3. このプロジェクトをmainブランチへpushします。
4. Actionsの「Validate and deploy Pages」を確認します。型検査・Vitest・大容量解析・3ブラウザE2Eのいずれかが失敗すると公開ジョブは実行されません。
5. 成功後、Actionsに表示されるPages URLでダッシュボード、分析への直接アクセス、ZIP/XML取り込みを確認します。

ワークフローは`dist/`だけをアップロードします。IndexedDBや元の健康情報は公開成果物に含まれません。独自ドメイン・別名リポジトリを使う場合はViteのbaseとテストURLも変更してください。

### Pagesの設定

1. [JogのPages設定](https://github.com/konbuden/Jog/settings/pages)を開きます。スマートフォンではSettingsメニューのCodespacesの下にPagesがあります。
2. 「Build and deployment」の「Source」で **GitHub Actions** を選択します。
3. mainへの反映後、Actionsの「Validate and deploy Pages」の結果を確認します。

Jogは現在非公開です。設定画面にUpgrade等が表示される場合、契約プランで非公開リポジトリのPagesが利用できない可能性があります。公開範囲は自動変更しません。利用可能な契約にするか、利用者が公開範囲を決める必要があります。

GitHub接続でJogの管理・書き込み権限を確認済みです。環境のCLI認証は無効のため、接続済みGitHubツール経由でソースを反映します。トークンをチャットに貼る必要はありません。Pagesが有効になっている場合の標準公開先は`https://konbuden.github.io/Jog/`です。[検証実行](https://github.com/konbuden/Jog/actions/runs/39902487375)では、型検査・ビルド・整形チェック・単体テスト36件・大容量テスト1件・3ブラウザE2E 45件が成功しました。公開ジョブはPages未設定のNot Foundで停止しています。設定後は失敗した公開ジョブだけを再実行できます。公開URLの確認は未実施です。

この実行環境ではPlaywrightの配布先`cdn.playwright.dev`および`playwright.download.prss.microsoft.com`への取得が通信ポリシーにより403 `Domain forbidden`となりました。制限を回避せず、残りのFirefox・WebKit検証はGitHub Actionsで行います。
