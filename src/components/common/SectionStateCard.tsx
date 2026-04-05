import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { AlertCircle, LoaderCircle, WifiOff } from "lucide-react";

interface SectionStateCardProps {
  title: string;
  description: string;
  tone: "error" | "loading" | "offline";
  actionLabel?: string;
  onAction?: () => void;
}

const toneConfig = {
  error: {
    icon: AlertCircle,
    iconClassName: "text-red-500",
    liveMode: "assertive",
  },
  loading: {
    icon: LoaderCircle,
    iconClassName: "animate-spin text-muted-foreground",
    liveMode: "polite",
  },
  offline: {
    icon: WifiOff,
    iconClassName: "text-amber-500",
    liveMode: "polite",
  },
} satisfies Record<
  SectionStateCardProps["tone"],
  {
    icon: typeof AlertCircle;
    iconClassName: string;
    liveMode: "assertive" | "polite";
  }
>;

export function SectionStateCard({
  title,
  description,
  tone,
  actionLabel,
  onAction,
}: SectionStateCardProps) {
  const config = toneConfig[tone];
  const Icon = config.icon;

  return (
    <Card size="sm" className="border-dashed" role="status" aria-live={config.liveMode}>
      <CardContent className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.iconClassName}`} />
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        {actionLabel && onAction && (
          <Button variant="outline" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
