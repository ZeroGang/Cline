import { Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@/context/ThemeContext'
import { I18nProvider } from '@/context/I18nContext'
import OfficePage from '@/pages/OfficePage'
import SettingsPage from '@/pages/SettingsPage'

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <Routes>
          <Route path="/" element={<OfficePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </I18nProvider>
    </ThemeProvider>
  )
}
