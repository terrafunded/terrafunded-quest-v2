import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/data/auth";
import { LoadingState } from "@/components/realm/PageStates";

export function RequireAuth() {
  const { session, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div className="p-6">
        <LoadingState rows={3} />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
