import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  LayoutDashboard,
  LockKeyhole,
  ShieldCheck,
  Settings,
  Upload,
} from 'lucide-react';
import { ImportDialog } from '../features/import/ImportDialog';
import { db } from '../infrastructure/db/database';
import { monthKey } from '../domain/analytics/time';
import { Dashboard } from '../pages/Dashboard';
import { Analysis } from '../pages/Analysis';
import { MonthSelector } from '../components/MonthSelector';
import { SettingsDialog } from '../features/settings/SettingsDialog';
import { DEFAULT_GOALS } from '../domain/models/goals';
import { selectPeriod, type MonthSelection } from '../domain/analytics/period';

export function App() {
  const [importing, setImporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analysis, setAnalysis] = useState(location.hash === '#/analysis');
  const initialMonth = monthKey(new Date());
  const [dashboardPeriod, setDashboardPeriod] = useState<MonthSelection>({
    mode: 'single',
    from: initialMonth,
    through: initialMonth,
  });
  const [analysisPeriod, setAnalysisPeriod] = useState<MonthSelection>({
    mode: 'all',
    from: initialMonth,
    through: initialMonth,
  });
  const data = useLiveQuery(async () => {
    try {
      return {
        runs: await db.runs.orderBy('startTime').reverse().toArray(),
        goals: (await db.settings.get('goals')) ?? DEFAULT_GOALS,
        error: null,
      };
    } catch {
      return {
        runs: [],
        goals: DEFAULT_GOALS,
        error:
          '保存領域を利用できません。ブラウザのプライベートモードや保存容量を確認してください。',
      };
    }
  }, []);
  useEffect(() => {
    // A live import in another tab owns this lock, so startup cleanup cannot erase its preview.
    void navigator.locks
      ?.request('my-running-coach-import', { ifAvailable: true }, async (lock) => {
        if (lock)
          await db.transaction('rw', db.staging, db.stagingRoutes, async () => {
            await db.staging.clear();
            await db.stagingRoutes.clear();
          });
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
  const period = analysis ? analysisPeriod : dashboardPeriod;
  const selected = selectPeriod(data?.runs ?? [], period);
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
            MY RUNNING COACH <span>v0.3.0</span>
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
          <div className="header-actions">
            <button className="secondary-button" onClick={() => setSettingsOpen(true)}>
              <Settings size={16} />
              目標・バックアップ
            </button>
            <button className="primary-button" onClick={() => setImporting(true)}>
              <Upload size={17} />
              データをインポート
            </button>
          </div>
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
        ) : (
          <>
            <div className="section-toolbar period-toolbar">
              <div>
                <span className="section-kicker">対象期間</span>
                <span className="timezone-label">日本時間・開始月で集計</span>
              </div>
              <MonthSelector
                value={period}
                onChange={analysis ? setAnalysisPeriod : setDashboardPeriod}
              />
            </div>
            {selected.months.length === 0 && (
              <p role="alert" className="error-message">
                開始月は終了月以前にし、期間は100年以内で指定してください。
              </p>
            )}
            {analysis ? (
              <Analysis
                allRuns={data.runs}
                runs={selected.runs}
                months={selected.months}
                periodKey={`${period.mode}:${selected.from}:${selected.through}`}
              />
            ) : (
              <Dashboard
                runs={selected.runs}
                months={selected.months}
                hasData={Boolean(data.runs.length)}
                allRuns={data.runs}
                goals={data.goals}
                onImport={() => setImporting(true)}
              />
            )}
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
      {settingsOpen && (
        <SettingsDialog
          goals={data?.goals ?? DEFAULT_GOALS}
          runs={data?.runs ?? []}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
