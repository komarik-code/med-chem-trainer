import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { FlaskConical, RefreshCw } from 'lucide-react'
import { DataProvider } from './lib/data'
import { useStore } from './lib/store'
import { settingsStore } from './lib/progress'
import { Layout } from './components/Layout'
import { Button } from './components/ui'
import { HomePage } from './pages/HomePage'
import { CategoryPage } from './pages/CategoryPage'
import { SetupPage } from './pages/SetupPage'
import { QuizPage } from './pages/QuizPage'
import { ResultsPage } from './pages/ResultsPage'
import { MistakesPage } from './pages/MistakesPage'
import { ProgressPage } from './pages/ProgressPage'

function useTheme() {
  const { theme } = useStore(settingsStore)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0e1016' : '#f5f6fb'))
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-3 text-ink-3">
        <FlaskConical className="size-10 animate-pulse text-accent" />
        <span className="text-sm font-medium">Завантаження питань…</span>
      </div>
    </div>
  )
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-bold">Не вдалося завантажити базу питань</h1>
        <p className="mt-2 text-sm text-ink-3">{message}</p>
        <Button className="mt-5" onClick={retry} icon={<RefreshCw className="size-5" />}>
          Спробувати ще раз
        </Button>
      </div>
    </div>
  )
}

export default function App() {
  useTheme()
  return (
    <DataProvider fallback={<Splash />} error={(m, retry) => <LoadError message={m} retry={retry} />}>
      <HashRouter>
        <ScrollToTop />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="category/:id" element={<CategoryPage />} />
            <Route path="setup/:mode" element={<SetupPage />} />
            <Route path="mistakes" element={<MistakesPage />} />
            <Route path="progress" element={<ProgressPage />} />
          </Route>
          <Route path="quiz" element={<QuizPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </DataProvider>
  )
}
