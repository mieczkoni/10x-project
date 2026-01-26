import { Button } from "@/components/ui/button";

interface PaginationFooterProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  onRefresh?: () => void;
}

export function PaginationFooter({ hasMore, loading, onLoadMore, onRefresh }: PaginationFooterProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">{hasMore ? "More decks available." : "You’ve reached the end."}</p>
      <div className="flex flex-wrap gap-2">
        {onRefresh ? (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            Refresh
          </Button>
        ) : null}
        <Button size="sm" onClick={onLoadMore} disabled={!hasMore || loading}>
          {loading ? "Loading..." : "Load more"}
        </Button>
      </div>
    </div>
  );
}
