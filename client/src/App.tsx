import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import HomePage from './pages/HomePage';
import MapPage from './pages/MapPage';
import PublicSpotsPage from './pages/PublicSpotsPage';
import MySpotsPage from './pages/MySpotsPage';
import { palette, radii, shadows, transitions } from './styles/theme';

function Placeholder({ title, description }: { title: string; description?: string }) {
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
          {description ?? 'This page is under construction. Check back soon!'}
        </p>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route
          path="map"
          element={
            <ProtectedRoute>
              <MapPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="myspots"
          element={
            <ProtectedRoute>
              <MySpotsPage />
            </ProtectedRoute>
          }
        />
        <Route path="public" element={<PublicSpotsPage />} />
        <Route
          path="*"
          element={
            <Placeholder
              title="Page not found"
              description="We couldn’t find the page you’re looking for."
            />
          }
        />
      </Route>
    </Routes>
  );
}
