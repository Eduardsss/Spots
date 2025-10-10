import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import HomePage from './pages/HomePage';
import MapPage from './pages/MapPage';
import PublicSpotsPage from './pages/PublicSpotsPage';
import MySpotsPage from './pages/MySpotsPage';
import AdminReportsPage from './pages/AdminReportsPage';
import CollectionsPage from './pages/CollectionsPage';
import { palette, radii, shadows, transitions } from './styles/theme';

function Placeholder({ title, description }: { title: string; description?: string }) {
  // Vienkāršs bloks, ko izmantojam kļūdu/404 lapās, lai parādītu draudzīgu ziņu.
  return (
    <main
      style={{
        padding: '64px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <div
        className="spotz-card"
        style={{
          padding: '32px 40px',
          maxWidth: '520px',
          width: '100%',
          borderRadius: radii.xl,
          boxShadow: shadows.soft,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignItems: 'center',
          transition: transitions.base,
        }}
      >
        <h2 style={{ margin: 0, fontSize: '32px', color: palette.textPrimary }}>{title}</h2>
        <p style={{ margin: 0, color: palette.textSecondary }}>
          {description ?? 'Šī sadaļa vēl tiek veidota. Aicinām paviesoties drīzumā!'}
        </p>
      </div>
    </main>
  );
}

export default function App() {
  // Galvenā maršrutu konfigurācija visai lietotnei.
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route
          path="map"
          element={
            // ProtectedRoute pasargā kartes lapu no viesu piekļuves.
            <ProtectedRoute>
              <MapPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="myspots"
          element={
            // Līdzīgi – lietotāja privātie spoti ir redzami tikai pēc pieteikšanās.
            <ProtectedRoute>
              <MySpotsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="collections"
          element={
            // Kolekcijas ir personalizētas, tāpēc arī prasa autentifikāciju.
            <ProtectedRoute>
              <CollectionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/reports"
          element={
            // Admin sadaļā papildus pārbaudām vai lietotājam ir administratora loma.
            <ProtectedRoute requireAdmin>
              <AdminReportsPage />
            </ProtectedRoute>
          }
        />
        <Route path="public" element={<PublicSpotsPage />} />
        <Route
          path="*"
          element={
            <Placeholder
              title="Lapa nav atrasta"
              description="Meklētā lapa nav pieejama vai tā ir pārvietota."
            />
          }
        />
      </Route>
    </Routes>
  );
}
