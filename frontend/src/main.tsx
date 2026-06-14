import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { SettingsProvider } from '@/contexts/SettingsContext'
import './styles/styles.css'
import './i18n'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <SettingsProvider>
          <RouterProvider router={router} />
        </SettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
