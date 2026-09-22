import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { AuthProvider } from "@/auth/auth-provider";
import { App } from "./app";
import { ThemeProvider, ToastProvider } from "./ui";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </BrowserRouter>,
);
