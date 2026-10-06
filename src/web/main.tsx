import { createRoot } from "react-dom/client";
import { AppRouter } from "./router";
import { AuthProvider } from "@/auth/auth-provider";
import { App } from "./app";
import { ThemeProvider, ToastProvider } from "./ui";
import "./styles.css";
import { installHaptics } from "./haptics";
import { installSpringTokens } from "./cartoon";

// The faces' @font-face list is large (Japanese comes in ~120 slices per
// weight), so it loads beside the app instead of blocking its first paint.
void import("./fonts.css");
installHaptics();
installSpringTokens();
createRoot(document.getElementById("root")!).render(
  <AppRouter>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </AppRouter>,
);
