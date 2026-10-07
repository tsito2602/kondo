import { DockToast, ThumbDock } from "./thumb-dock";

/**
 * The dock's toast mode after a plan is deleted: the two islands run together
 * into one with what happened and 「元に戻す」 (kondo-cartoon §5).
 */
export function PlanUndoDock({
  message,
  onUndo,
  duration,
  restartKey,
}: {
  message: string;
  onUndo: () => void;
  duration?: number;
  restartKey?: string;
}) {
  return (
    <ThumbDock mode="toast">
      <DockToast
        message={message}
        onUndo={onUndo}
        duration={duration}
        restartKey={restartKey}
      />
    </ThumbDock>
  );
}
