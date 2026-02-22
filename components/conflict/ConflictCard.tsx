"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ConflictCardData = {
  neutralSummary: string;
  clarifyingQuestions: string[];
  options: Array<{
    title: string;
    description: string;
  }>;
  suggestedScript: string;
  nextQuestion: string;
  confidence: number;
};

type ConflictCardProps = {
  data: ConflictCardData;
};

export default function ConflictCard({ data }: ConflictCardProps) {
  const [copied, setCopied] = useState(false);

  const confidenceLabel = useMemo(() => {
    const bounded = Number.isFinite(data.confidence)
      ? Math.min(1, Math.max(0, data.confidence))
      : 0;
    return `${Math.round(bounded * 100)}% confidence`;
  }, [data.confidence]);

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(data.suggestedScript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Mediator summary
        </p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {confidenceLabel}
        </span>
      </div>

      <p className="font-chatSerif whitespace-pre-wrap text-[16px] leading-7 tracking-normal text-foreground sm:text-[17px]">
        {data.neutralSummary}
      </p>

      {data.clarifyingQuestions.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Clarifying questions
          </p>
          <ul className="font-chatSerif list-disc space-y-1 pl-5 text-[16px] leading-7 tracking-normal text-foreground sm:text-[17px]">
            {data.clarifyingQuestions.map((question, index) => (
              <li key={`${question}-${index}`} className="whitespace-pre-wrap">
                {question}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.options.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Options
          </p>
          <div className="space-y-2">
            {data.options.map((option, index) => (
              <div key={`${option.title}-${index}`} className="space-y-0.5">
                <p className="font-chatSerif text-[16px] font-semibold leading-7 tracking-normal text-foreground sm:text-[17px]">
                  {option.title}
                </p>
                <p className="font-chatSerif text-[16px] leading-7 tracking-normal text-muted-foreground sm:text-[17px]">
                  {option.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Suggested script
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleCopyScript}
          >
            {copied ? (
              <>
                <Check className="mr-1 h-3.5 w-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3.5 w-3.5" />
                Copy
              </>
            )}
          </Button>
        </div>
        <p className="font-chatSerif whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2 text-[16px] leading-7 tracking-normal text-foreground sm:text-[17px]">
          {data.suggestedScript}
        </p>
      </div>

      {data.nextQuestion ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Next question
          </p>
          <p className="font-chatSerif text-[16px] leading-7 tracking-normal text-foreground sm:text-[17px]">
            {data.nextQuestion}
          </p>
        </div>
      ) : null}
    </div>
  );
}
