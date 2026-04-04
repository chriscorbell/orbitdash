import * as React from "react";
import { Button, type buttonVariants } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import type { VariantProps } from "class-variance-authority";

interface IconButtonProps
    extends React.ComponentProps<"button">,
        VariantProps<typeof buttonVariants> {
    tooltip: string;
    asChild?: boolean;
}

export function IconButton({ tooltip, children, ...props }: IconButtonProps) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button {...props}>{children}</Button>
                </TooltipTrigger>
                <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
