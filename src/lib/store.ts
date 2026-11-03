import { useSyncExternalStore } from 'react'

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export interface Store<T> {
  get(): T
  set(next: T): void
  update(fn: (prev: T) => T): void
  subscribe(listener: () => void): () => void
}

/** Простий реактивний стан, синхронізований з localStorage. */
export function createPersistentStore<T>(
  key: string,
  fallback: () => T,
  validate: (raw: unknown) => T | null,
): Store<T> {
  const listeners = new Set<() => void>()
  let value: T = (() => {
    const raw = safeGet(key)
    if (raw === null) return fallback()
    try {
      return validate(JSON.parse(raw)) ?? fallback()
    } catch {
      return fallback()
    }
  })()

  const emit = () => listeners.forEach((l) => l())

  // синхронізація між вкладками
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== key) return
      try {
        value = e.newValue === null ? fallback() : (validate(JSON.parse(e.newValue)) ?? fallback())
      } catch {
        value = fallback()
      }
      emit()
    })
  }

  return {
    get: () => value,
    set(next) {
      value = next
      safeSet(key, next === null ? null : JSON.stringify(next))
      emit()
    },
    update(fn) {
      this.set(fn(value))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
