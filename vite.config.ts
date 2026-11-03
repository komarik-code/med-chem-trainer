import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Для GitHub Pages сайт живе за адресою https://<user>.github.io/<repo>/,
// тому base = "/<repo>/". У GitHub Actions назва репозиторію береться автоматично
// з GITHUB_REPOSITORY; локально можна задати BASE_PATH вручну.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
// репозиторій виду <user>.github.io публікується в корені домену
const base = process.env.BASE_PATH ?? (repo && !repo.endsWith('.github.io') ? `/${repo}/` : '/')

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
