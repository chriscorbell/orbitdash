import { useMemo } from "react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { MetricSample } from "@/shared/types";

interface MetricChartsProps {
    samples: MetricSample[];
}

const chartConfig = {
    cpu: { label: "CPU", color: "#ffffff" },
    ram: { label: "RAM", color: "#ffffff" },
    disk: { label: "Disk", color: "#ffffff" },
};

function MetricLineChart({
    data,
    color,
    label,
    nowTs,
    gradientId,
}: {
    data: Array<{ ts: number; value: number }>;
    color: string;
    label: string;
    nowTs: number;
    gradientId: string;
}) {
    const domain = [nowTs - 30_000, nowTs];
    return (
        <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                />
                <XAxis
                    dataKey="ts"
                    type="number"
                    domain={domain}
                    allowDataOverflow={true}
                    tickFormatter={(ts: number) => {
                        const ago = Math.round((nowTs - ts) / 1000);
                        return `${ago}s`;
                    }}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    ticks={[nowTs - 30000, nowTs - 25000, nowTs - 20000, nowTs - 15000, nowTs - 10000, nowTs - 5000, nowTs]}
                />
                <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                    contentStyle={{
                        backgroundColor: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        color: "var(--popover-foreground)",
                        fontSize: 12,
                    }}
                    labelStyle={{ color: "var(--muted-foreground)" }}
                    labelFormatter={(ts) => {
                        const ago = Math.round((nowTs - Number(ts)) / 1000);
                        return `${ago}s ago`;
                    }}
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, label]}
                />
                <Area
                    type="monotone"
                    dataKey="value"
                    stroke={color}
                    strokeWidth={3}
                    fill={`url(#${gradientId})`}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0, fill: color }}
                    isAnimationActive={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}

export function MetricCharts({ samples }: MetricChartsProps) {
    const nowTs = samples.length > 0 ? samples[samples.length - 1].ts : 30_000;

    const cpuData = useMemo(
        () => samples.map((s) => ({ ts: s.ts, value: s.cpu })),
        [samples]
    );

    const ramData = useMemo(
        () => samples.map((s) => ({ ts: s.ts, value: s.ram })),
        [samples]
    );

    const diskData = useMemo(
        () => samples.map((s) => ({ ts: s.ts, value: s.disk })),
        [samples]
    );

    return (
        <Card>
            <Tabs defaultValue="cpu">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-muted-foreground">
                        Metrics
                    </CardTitle>
                    <TabsList>
                        <TabsTrigger value="cpu" className="text-xs font-semibold">
                            CPU
                        </TabsTrigger>
                        <TabsTrigger value="ram" className="text-xs font-semibold">
                            RAM
                        </TabsTrigger>
                        <TabsTrigger value="disk" className="text-xs font-semibold">
                            Disk
                        </TabsTrigger>
                    </TabsList>
                </CardHeader>
                <CardContent>
                    <TabsContent value="cpu" className="mt-0">
                        <MetricLineChart
                            data={cpuData}
                            nowTs={nowTs}
                            color={chartConfig.cpu.color}
                            label={chartConfig.cpu.label}
                            gradientId="gradient-cpu"
                        />
                    </TabsContent>
                    <TabsContent value="ram" className="mt-0">
                        <MetricLineChart
                            data={ramData}
                            nowTs={nowTs}
                            color={chartConfig.ram.color}
                            label={chartConfig.ram.label}
                            gradientId="gradient-ram"
                        />
                    </TabsContent>
                    <TabsContent value="disk" className="mt-0">
                        <MetricLineChart
                            data={diskData}
                            nowTs={nowTs}
                            color={chartConfig.disk.color}
                            label={chartConfig.disk.label}
                            gradientId="gradient-disk"
                        />
                    </TabsContent>
                </CardContent>
            </Tabs>
        </Card>
    );
}
