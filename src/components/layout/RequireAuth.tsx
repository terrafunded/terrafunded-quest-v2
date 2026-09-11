import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/data/auth";
import { LoadingState } from "@/components/realm/PageStates";

/**
 * Nothing behind this renders until the session exists *and* the Payments-staff check has
 * passed (`access === "granted"`); a refused user is sent back to /login, where the reason shows.
 */
export function RequireAuth() {
  const { session, ready, access } = useAuth();
  const location = useLocation();
  if (!ready || (session && access === "checking")) {
    return (
      <div className="p-6">
        <LoadingState rows={3} />
      </div>
    );
  }
  if (!session || access !== "granted") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
