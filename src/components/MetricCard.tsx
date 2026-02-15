import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cpu, MemoryStick, HardDrive } from "lucide-react";

interface MetricCardProps {
    title: string;
    value: number | null;
    icon: "cpu" | "ram" | "disk";
}

const iconMap = {
    cpu: Cpu,
    ram: MemoryStick,
    disk: HardDrive,
};

export function MetricCard({ title, value, icon }: MetricCardProps) {
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
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                    {title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold tabular-nums ${getValueColor(value)}`}>
                    {displayValue}%
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${getBarColor(value)}`}
                        style={{ width: `${Math.min(value ?? 0, 100)}%` }}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
