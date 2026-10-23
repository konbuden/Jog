# My Running Coach — Release 0.1

## 方針

公開先は利用者が指定した`konbuden/Jog`。アプリ名・ローカルディレクトリ・パッケージ名はMy Running Coach / my-running-coachを維持する。

React / strict TypeScript / Vite。日本語、ダークモード、スマートフォン・iPad・PC対応。サーバーは不要。画面はダッシュボードと走力分析に限定。AIコーチ・体重管理は対象外。

## 層とディレクトリ

- `src/app`: 起動、ハッシュルーティング、共通レイアウト
- `src/pages`: ダッシュボードと走力分析
- `src/components`: 共通UI、SVGグラフ、履歴表示
- `src/domain/models`: Runと取り込み型
- `src/domain/analytics`: UI・DBから独立した純粋な計算関数
- `src/infrastructure/db`: Dexie、IndexedDB、一時領域、確定トランザクション
- `src/infrastructure/apple-health`: SAX XML解析、ZIPストリーム、単位・日時変換
- `src/features/import`: ファイル選択、進捗、確認、保存結果
- `src/workers`: 取り込みWorkerと型付きメッセージ
- `src/styles`: レスポンシブCSS
- `tests/unit`, `tests/integration`, `tests/e2e`, `tests/fixtures/synthetic`

## データ経路とプライバシー

File → Worker → ZIPのexport.xmlのみ逐次展開 → SAX解析 → 正規化 → IndexedDB一時領域 → 件数・期間・警告プレビュー → ユーザー確定 → 本データへ原子的に保存。
生XML・ZIPは保存しない。キャンセル・失敗では本データを変更しない。一時領域は破棄し、異常終了後も次回処理開始時に清掃する。同時取り込みはWeb Locksで排他する。
データ送信・分析SDK・外部フォントなし。健康情報をログ・URL・ビルド成果物に含めない。テストデータは架空の合成値のみ。画面にサンプルを自動投入しない。

## メモリと信頼性

Fileを小さなチャンクで読み、fflateの同期ストリーミング解凍とsaxesをWorkerで実行。全XML文字列、DOM、全心拍レコードを保持しない。書き込みは小バッチで待ち合わせ、UIへの通知は集計値だけ。一時領域はIndexedDB。ZIPエントリ数、実展開バイト数、入力ファイルサイズ、解析トークン長に上限。キャンセルはWorker終了と一時領域削除。
XML外部実体・外部リソースは参照せず、独自ENTITY宣言を拒否。暗号化・未対応圧縮・複数export.xmlはエラー。DB容量不足や利用不可を日本語表示。

## UI

当月100km目標、距離・ペース・心拍、月次距離、直近10件をダッシュボードに表示。分析にはランごとの10km等速換算、月次ペース、心拍130台の推移、距離・日付・心拍フィルタを配置。欠損値は補間しない。数値・対象件数をグラフにも併記。タッチ領域、フォーカス、読み上げ、縮小モーションに対応。

## 品質と公開

Vitestで計算・解析・DB、Playwrightで実Workerを使う取り込みと表示を検証。Chromium / Firefox / WebKit。合成大容量XML・ZIPで時間とメモリを計測。GitHub Actionsで型検査・テスト・ビルド後のみPagesへ公開。baseは`/Jog/`、ルーティングはhash。

## タスクと完了条件

| ID  | 内容                                          | 検証                               |
| --- | --------------------------------------------- | ---------------------------------- |
| T01 | 設計文書・Vite・strict・2画面骨格・テスト導入 | 型検査・build・遷移                |
| T02 | Run・集計・フィルタ・Dexie                    | ペース・換算・月境界・心拍・DB重複 |
| T03 | Worker・ZIP/XML・確認・確定                   | 抽出・不正値・再取り込み・中止     |
| T04 | ダッシュボード                                | 集計値・直近10件・空状態           |
| T05 | 走力分析                                      | 複合フィルタ・月次・心拍欠損       |
| T06 | 応答性・エラー・アクセシビリティ              | 3エンジンE2E・大容量合成計測       |
| T07 | README・CI・Pages                             | 全検証成功後に公開確認             |

各タスクで変更ファイル・テスト結果・未対応を報告する。公開先・権限がなければ実装済みの成果と公開手順、阻害要因を明記する。
