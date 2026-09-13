import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "@/data/auth";
import { RealmProvider } from "@/data/RealmProvider";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { HorizonProvider } from "@/horizon/HorizonProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { router } from "@/routes";
import "./index.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <HorizonProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RealmProvider>
              <TooltipProvider delayDuration={150}>
                <RouterProvider router={router} />
              </TooltipProvider>
            </RealmProvider>
          </AuthProvider>
        </QueryClientProvider>
      </HorizonProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
