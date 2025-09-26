import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "@/contexts/auth-context";
import { MainLayout } from "@/layouts/main-layout";
import { HomePage } from "@/pages/home-page";
import { LoginPage } from "@/pages/login-page";
import { MapPage } from "@/pages/map-page";
import { MySpotsPage } from "@/pages/my-spots-page";
import { PublicSpotsPage } from "@/pages/public-spots-page";
import { RegisterPage } from "@/pages/register-page";

function PrivateRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        Notiek ielāde...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="public" element={<PublicSpotsPage />} />
        <Route
          path="my-spots"
          element={
            <PrivateRoute>
              <MySpotsPage />
            </PrivateRoute>
          }
        />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
      </Route>
    </Routes>
  );
}
