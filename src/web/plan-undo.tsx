import { ContextDock, ThumbDock } from "./thumb-dock";

/**
 * The dock's toast mode after a plan is deleted: one island with what happened
 * and 「元に戻す」. Uses the dock's own entry hook; the dock itself is unchanged.
 */
export function PlanUndoDock({
  message,
  onUndo,
}: {
  message: string;
  onUndo: () => void;
}) {
  return (
    <ThumbDock mode="context">
      <ContextDock
        actions={
          <button className="it-undo" onClick={onUndo}>
            <span role="status">{message}</span>
            <b>元に戻す</b>
          </button>
        }
      />
    </ThumbDock>
  );
}
