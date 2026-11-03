import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Category, CategoryMeta, Question } from './types'

export interface QuizData {
  categories: Category[]
  byId: Map<string, Question>
  total: number
}

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: QuizData }

const DataContext = createContext<QuizData | null>(null)

const url = (path: string) => `${import.meta.env.BASE_URL}${path}`

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(url(path))
  if (!res.ok) throw new Error(`Не вдалося завантажити ${path} (${res.status})`)
  return res.json() as Promise<T>
}

async function loadAll(): Promise<QuizData> {
  const index = await fetchJson<{ categories: CategoryMeta[] }>('data/index.json')
  const categories = await Promise.all(
    index.categories.map(async (meta) => {
      const file = await fetchJson<{ questions: Omit<Question, 'categoryId'>[] }>(meta.file)
      const questions: Question[] = file.questions.map((q) => ({ ...q, categoryId: meta.id }))
      if (questions.length !== meta.count) {
        console.warn(`Категорія ${meta.id}: очікувалось ${meta.count}, завантажено ${questions.length}`)
      }
      return { ...meta, count: questions.length, questions }
    }),
  )
  const byId = new Map<string, Question>()
  for (const c of categories) for (const q of c.questions) byId.set(q.id, q)
  return { categories, byId, total: byId.size }
}

export function DataProvider({ children, fallback, error }: {
  children: ReactNode
  fallback: ReactNode
  error: (message: string, retry: () => void) => ReactNode
}) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    loadAll()
      .then((data) => alive && setState({ status: 'ready', data }))
      .catch((e: unknown) => alive && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }))
    return () => {
      alive = false
    }
  }, [attempt])

  if (state.status === 'loading') return <>{fallback}</>
  if (state.status === 'error') return <>{error(state.message, () => setAttempt((a) => a + 1))}</>
  return <DataContext.Provider value={state.data}>{children}</DataContext.Provider>
}

export function useQuizData(): QuizData {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useQuizData поза DataProvider')
  return ctx
}
