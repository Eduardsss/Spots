import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

type ProtectedRouteProps = {
  children: ReactNode;
  requireAdmin?: boolean;
};

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const location = useLocation();
  // Ja lietotājs nav saglabājis sesijas tokenu, uzreiz novirzām uz pieslēgšanos.
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const storedUser =
    typeof window !== 'undefined' ? localStorage.getItem('user') : null;
  let user: { role?: string } | null = null;

  if (storedUser) {
    try {
      // Saglabātais JSON tiek pārvērsts atpakaļ JS objektā.
      user = JSON.parse(storedUser) as { role?: string };
    } catch (error) {
      user = null;
    }
  }

  if (!token) {
    // Pāradresācija uz /login atceroties sākotnējo maršrutu.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && user?.role !== 'admin') {
    // Papildus drošībai neļaujam parastiem lietotājiem redzēt admin sadaļas.
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
