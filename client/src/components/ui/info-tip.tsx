import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function InfoTip({ text, className, side = "top" }: { text: string; className?: string; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" tabIndex={-1} aria-label="More info" className={cn("inline-flex items-center justify-center w-4 h-4 rounded-full text-muted-foreground/60 hover:text-muted-foreground transition-colors", className)}>
            <Info className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[280px] text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
