import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  LockKeyhole,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { ImportDialog } from '../features/import/ImportDialog';
import { db } from '../infrastructure/db/database';
import { monthKey } from '../domain/analytics/time';
import { Dashboard } from '../pages/Dashboard';
import { Analysis } from '../pages/Analysis';

export function App() {
  const [importing, setImporting] = useState(false);
  const [analysis, setAnalysis] = useState(location.hash === '#/analysis');
  const [month, setMonth] = useState(monthKey(new Date()));
  const data = useLiveQuery(async () => {
    try {
      return { runs: await db.runs.orderBy('startTime').reverse().toArray(), error: null };
    } catch {
      return {
        runs: [],
        error:
          '保存領域を利用できません。ブラウザのプライベートモードや保存容量を確認してください。',
      };
    }
  }, []);
  useEffect(() => {
    // A live import in another tab owns this lock, so startup cleanup cannot erase its preview.
    void navigator.locks
      ?.request('my-running-coach-import', { ifAvailable: true }, async (lock) => {
        if (lock) await db.staging.clear();
      })
      .catch(() => {
        /* The regular data query provides the storage error UI. */
      });
    const update = () => {
      setAnalysis(location.hash === '#/analysis');
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', update);
    return () => removeEventListener('hashchange', update);
  }, []);
  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        メインコンテンツへ
      </a>
      <aside className="sidebar">
        <a href="#/" className="brand" aria-label="My Running Coach ホーム">
          <span className="brand-mark">
            <Activity size={26} strokeWidth={2.7} />
          </span>
          <span>
            My Running
            <span className="brand-second">
              Coach<span className="brand-dot">.</span>
            </span>
          </span>
        </a>
        <div className="nav-caption">ワークスペース</div>
        <nav aria-label="メインナビゲーション">
          <a
            className={!analysis ? 'nav-item active' : 'nav-item'}
            aria-current={!analysis ? 'page' : undefined}
            href="#/"
          >
            <LayoutDashboard size={19} />
            ダッシュボード
            <span className="nav-indicator" />
          </a>
          <a
            className={analysis ? 'nav-item active' : 'nav-item'}
            aria-current={analysis ? 'page' : undefined}
            href="#/analysis"
          >
            <BarChart3 size={19} />
            走力分析
            <span className="nav-indicator" />
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={21} />
            <strong>あなたのデータは、あなたの手に。</strong>
            <p>健康データはこのブラウザ内だけで処理・保存されます。</p>
            <span className="local-status">
              <i />
              ローカル保存
            </span>
          </div>
          <div className="release-label">
            MY RUNNING COACH <span>v0.1</span>
          </div>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1}>
        <header className="page-header">
          <div>
            <div className="eyebrow">あなたのランニングノート</div>
            <h1>{analysis ? '走力分析' : 'ダッシュボード'}</h1>
            <p className="page-description">
              {analysis
                ? '距離、ペース、心拍から、走りの変化を見つけよう。'
                : '一歩ずつ、自分のペースで。日々の積み重ねを振り返ろう。'}
            </p>
          </div>
          <button className="primary-button" onClick={() => setImporting(true)}>
            <Upload size={17} />
            データをインポート
          </button>
        </header>
        {data?.error && (
          <p role="alert" className="error-message">
            {data.error}
          </p>
        )}
        {!data ? (
          <div className="loading-state" role="status">
            記録を読み込んでいます…
          </div>
        ) : analysis ? (
          <Analysis runs={data.runs} />
        ) : (
          <>
            <div className="section-toolbar">
              <div>
                <span className="section-kicker">ランニングの概要</span>
                <span className="timezone-label">日本時間</span>
              </div>
              <label className="month-select">
                <CalendarDays size={16} />
                <span aria-hidden="true">
                  {month.slice(0, 4)}年{Number(month.slice(5))}月
                </span>
                <input
                  aria-label="表示月"
                  type="month"
                  value={month}
                  min="1900-01"
                  max="9999-12"
                  onChange={(event) => {
                    if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value);
                  }}
                />
              </label>
            </div>
            <Dashboard runs={data.runs} month={month} onImport={() => setImporting(true)} />
          </>
        )}
        <footer className="page-footer">
          <span>
            <LockKeyhole size={13} />
            健康データの外部送信なし
          </span>
          <span>
            あなたらしい走りを、これからも。
            <ArrowUpRight size={13} />
          </span>
        </footer>
      </main>
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
