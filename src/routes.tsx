import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { LoadingState } from "@/components/realm/PageStates";
import { ThroneRoom } from "@/pages/ThroneRoom";
import { Login } from "@/pages/Login";

const WarPlan = lazy(() => import("@/pages/WarPlan"));
const Exodus = lazy(() => import("@/pages/Exodus"));
const RealmMap = lazy(() => import("@/pages/RealmMap"));
const Quests = lazy(() => import("@/pages/Quests"));
const Pipeline = lazy(() => import("@/pages/Pipeline"));
const Sponsors = lazy(() => import("@/pages/Sponsors"));
const Treasury = lazy(() => import("@/pages/Treasury"));
const Oracle = lazy(() => import("@/pages/Oracle"));
const Chronicle = lazy(() => import("@/pages/Chronicle"));
const TrophiesPage = lazy(() => import("@/pages/TrophiesPage"));
const Quality = lazy(() => import("@/pages/Quality"));

const wrap = (el: React.ReactNode) => <Suspense fallback={<LoadingState />}>{el}</Suspense>;

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <ThroneRoom /> },
          { path: "/warplan", element: wrap(<WarPlan />) },
          { path: "/exodus", element: wrap(<Exodus />) },
          { path: "/realm", element: wrap(<RealmMap />) },
          { path: "/quests", element: wrap(<Quests />) },
          { path: "/pipeline", element: wrap(<Pipeline />) },
          { path: "/sponsors", element: wrap(<Sponsors />) },
          { path: "/treasury", element: wrap(<Treasury />) },
          { path: "/oracle", element: wrap(<Oracle />) },
          { path: "/chronicle", element: wrap(<Chronicle />) },
          { path: "/trophies", element: wrap(<TrophiesPage />) },
          { path: "/quality", element: wrap(<Quality />) },
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
