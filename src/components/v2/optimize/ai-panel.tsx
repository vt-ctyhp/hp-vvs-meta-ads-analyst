"use client";

import { Bot, FileText, Loader2, MessageSquare, Send } from "lucide-react";
import { useCallback, useState } from "react";

import { AnalysisClient } from "@/components/analysis-client";
import type { SavedAnalysisDashboard } from "@/lib/ad-hoc-analytics";
import { translateError } from "@/lib/glossary";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Props = {
  initialSaved: SavedAnalysisDashboard[];
  canUseAdHocAnalysis: boolean;
  dateRange: {
    days: number;
    startDate: string | null;
    endDate: string | null;
  };
};

export function OptimizeAiPanel({
  initialSaved,
  canUseAdHocAnalysis,
  dateRange,
}: Props) {
  const [chatInput, setChatInput] = useState("");
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reportStatus, setReportStatus] = useState("");

  const sendChatMessage = useCallback(async function sendChatMessage() {
    const message = chatInput.trim();
    if (!message) return;

    setChatInput("");
    setChatMessages((messages) => [...messages, { role: "user", content: message }]);
    setIsChatting(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: chatSessionId,
          message,
          days: dateRange.days,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Chat failed");
      setChatSessionId(payload.sessionId ?? null);
      setChatMessages((messages) => [
        ...messages,
        { role: "assistant", content: payload.answer },
      ]);
    } catch (error) {
      setChatMessages((messages) => [
        ...messages,
        { role: "assistant", content: translateError(error) },
      ]);
    } finally {
      setIsChatting(false);
    }
  }, [chatInput, chatSessionId, dateRange.days, dateRange.endDate, dateRange.startDate]);

  const generateReport = useCallback(async function generateReport() {
    setIsReporting(true);
    setReportStatus("");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          days: dateRange.days,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Report generation failed");
      setReportStatus(`Report generated: ${payload.title}`);
    } catch (error) {
      setReportStatus(translateError(error));
    } finally {
      setIsReporting(false);
    }
  }, [dateRange.days, dateRange.endDate, dateRange.startDate]);

  if (!canUseAdHocAnalysis) {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-600">
        AI analysis tools require AI Analysis access.
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2 text-stone-950">
            <MessageSquare size={18} />
            <h2 className="text-sm font-semibold">Ask AI</h2>
          </div>
          <div className="max-h-80 min-h-40 space-y-3 overflow-y-auto border-y border-stone-200 py-4">
            {chatMessages.length ? (
              chatMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={[
                    "text-sm leading-6 [overflow-wrap:anywhere]",
                    message.role === "user" ? "text-stone-950" : "text-stone-700",
                  ].join(" ")}
                >
                  <span className="mr-2 text-[10px] uppercase tracking-wider text-stone-400">
                    {message.role}
                  </span>
                  {message.content}
                </div>
              ))
            ) : (
              <p className="text-sm text-stone-500">
                Ask about spend, fatigue, winners, risks, or what to inspect next.
              </p>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void sendChatMessage();
              }}
              className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-stone-400"
              placeholder="Ask an executive question"
            />
            <button
              type="button"
              onClick={() => void sendChatMessage()}
              disabled={isChatting || !chatInput.trim()}
              title="Send"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-stone-900 text-stone-50 hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {isChatting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2 text-stone-950">
            <FileText size={18} />
            <h2 className="text-sm font-semibold">Report</h2>
          </div>
          <p className="text-sm leading-6 text-stone-600">
            Generate the current executive report for the selected date range.
          </p>
          <button
            type="button"
            onClick={() => void generateReport()}
            disabled={isReporting}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-stone-900 px-3 text-sm font-medium text-stone-900 hover:bg-stone-900 hover:text-stone-50 disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400"
          >
            {isReporting ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
            Generate report
          </button>
          {reportStatus ? (
            <p className="mt-3 text-sm leading-6 text-stone-600">{reportStatus}</p>
          ) : null}
        </section>
      </div>

      <AnalysisClient initialSaved={initialSaved} surface="panel" />
    </section>
  );
}
