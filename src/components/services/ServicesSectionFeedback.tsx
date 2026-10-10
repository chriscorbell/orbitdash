import { SectionStateCard } from "@/components/common/SectionStateCard";

interface ServicesSectionFeedbackProps {
  categoryOrderError: string | null;
  error: string | null;
  isReorderMode: boolean;
  onRetry: () => void;
  showInitialError: boolean;
  showInitialLoading: boolean;
  showInlineError: boolean;
}

export function ServicesSectionFeedback({
  categoryOrderError,
  error,
  isReorderMode,
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

      {categoryOrderError && !isReorderMode && (
        <SectionStateCard
          tone="error"
          title="Category ordering is unavailable"
          description={categoryOrderError}
        />
      )}

      {showInitialLoading && (
        <SectionStateCard
          tone="loading"
          title="Loading services"
          description="Fetching your saved services and category layout."
        />
      )}

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
