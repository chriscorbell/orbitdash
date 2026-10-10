import { SectionStateCard } from "@/components/common/SectionStateCard";

interface ServicesSectionFeedbackProps {
  categoriesError: string | null;
  error: string | null;
  onRetry: () => void;
  showInitialError: boolean;
  showInitialLoading: boolean;
  showInlineError: boolean;
}

export function ServicesSectionFeedback({
  categoriesError,
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
