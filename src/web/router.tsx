import type { PropsWithChildren } from "react";
import { BrowserRouter } from "react-router";

export function AppRouter({ children }: PropsWithChildren) {
  // Native view transitions own the update boundary. Deferring the route with
  // React.startTransition would capture the old page twice before scroll reset.
  return <BrowserRouter useTransitions={false}>{children}</BrowserRouter>;
}
