import { SectionStateCard } from "@/components/common/SectionStateCard";
import { BoardSkeleton } from "@/components/services/BoardSkeleton";
import type { CardDensity } from "@shared/dashboard-settings";

interface ServicesSectionFeedbackProps {
  categoriesError: string | null;
  density: CardDensity;
  error: string | null;
  onRetry: () => void;
  showInitialError: boolean;
  showInitialLoading: boolean;
  showInlineError: boolean;
}

export function ServicesSectionFeedback({
  categoriesError,
  density,
  error,
  onRetry,
  showInitialError,
  showInitialLoading,
  showInlineError,
}: ServicesSectionFeedbackProps) {
  return (
    <>
      {showInlineError && error && (
        <SectionStateCard
          tone="error"
          title="Services may be stale"
          description={`${error} The last saved list is still visible.`}
          actionLabel="Retry"
          onAction={onRetry}
        />
      )}

      {categoriesError && (
        <SectionStateCard
          tone="error"
          title="Categories are unavailable"
          description={categoriesError}
        />
      )}

      {showInitialLoading && <BoardSkeleton density={density} />}

      {showInitialError && error && (
        <SectionStateCard
          tone="error"
          title="Services are unavailable"
          description={error}
          actionLabel="Retry"
          onAction={onRetry}
        />
      )}
    </>
  );
}
