"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/common/use-toast";
import { conflictGuideMarkdown } from "@/content/conflict-guide";

const scripts = [
  "I want to understand your perspective. Can you walk me through what you need?",
  "Let's separate the issue from the person so we can solve it together.",
  "I might be missing something. Can we reset and clarify the goal?"
];

export default function GuidePanel() {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (script: string) => {
    await navigator.clipboard.writeText(script);
    setCopied(script);
    toast({ title: "Script copied", description: "Ready to paste into chat." });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <ReactMarkdown className="prose-guide">{conflictGuideMarkdown}</ReactMarkdown>
      </div>
      <div className="rounded-2xl border border-border bg-muted/40 p-4">
        <h3 className="text-sm font-semibold">Copy-ready scripts</h3>
        <div className="mt-3 flex flex-col gap-2">
          {scripts.map((script) => (
            <div key={script} className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">{script}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => handleCopy(script)}>
                {copied === script ? "Copied" : "Copy script"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
