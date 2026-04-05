import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Cpu, MemoryStick, HardDrive } from "lucide-react";

interface MetricCardProps {
  className?: string;
  title: string;
  value: number | null;
  icon: "cpu" | "ram" | "disk";
}

const iconMap = {
  cpu: Cpu,
  ram: MemoryStick,
  disk: HardDrive,
};

export function MetricCard({ className, title, value, icon }: MetricCardProps) {
  const Icon = iconMap[icon];
  const displayValue = value !== null ? value.toFixed(1) : "—";

  // Color coding based on value
  const getValueColor = (v: number | null) => {
    if (v === null) return "text-muted-foreground";
    if (v >= 90) return "text-red-500";
    if (v >= 70) return "text-amber-500";
    return "text-foreground";
  };

  const getBarColor = (v: number | null) => {
    if (v === null) return "bg-muted";
    if (v >= 90) return "bg-red-500";
    if (v >= 70) return "bg-amber-500";
    return "bg-primary";
  };

  return (
    <Card size="sm" className={className}>
      <CardContent className="flex h-full flex-col justify-between gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold text-muted-foreground">{title}</CardTitle>
          </div>
          <div className={`text-sm font-bold tabular-nums ${getValueColor(value)}`}>
            {displayValue}%
          </div>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getBarColor(value)}`}
            style={{ width: `${Math.min(value ?? 0, 100)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
