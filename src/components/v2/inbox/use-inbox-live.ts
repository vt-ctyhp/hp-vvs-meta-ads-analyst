"use client";

import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import { createBrowserClient } from "@/lib/supabase";

import { planInboxRefetch, type InboxChangePing } from "./inbox-live-plan";

type UseInboxLiveInput = {
  environment: string;
  enabled: boolean;
  selectedConversationIdRef: MutableRefObject<string | null>;
  refetchQueue: () => Promise<void>;
  refetchThread: (conversationId: string) => Promise<void>;
};

export function useInboxLive({
  environment,
  enabled,
  selectedConversationIdRef,
  refetchQueue,
  refetchThread,
}: UseInboxLiveInput): { live: boolean } {
  const [live, setLive] = useState(false);

  // Keep latest callbacks in refs so the subscription effect only re-runs on (env, enabled).
  const refetchQueueRef = useRef(refetchQueue);
  const refetchThreadRef = useRef(refetchThread);
  refetchQueueRef.current = refetchQueue;
  refetchThreadRef.current = refetchThread;

  useEffect(() => {
    if (!enabled || !environment) return;

    const supabase = createBrowserClient();
    let disposed = false;
    let debounceTimer: number | null = null;
    let pollTimer: number | null = null;
    let pendingQueue = false;
    let pendingThreadId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const flush = () => {
      debounceTimer = null;
      if (disposed) return;
      if (pendingQueue) {
        pendingQueue = false;
        void refetchQueueRef.current();
      }
      const threadId = pendingThreadId;
      pendingThreadId = null;
      if (threadId) void refetchThreadRef.current(threadId);
    };

    const startPolling = () => {
      if (pollTimer !== null) return;
      pollTimer = window.setInterval(() => void refetchQueueRef.current(), 15_000);
    };
    const stopPolling = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const connect = async () => {
      // Authorize the PRIVATE channel with the current Supabase session token.
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);
      if (disposed) return;

      channel = supabase
        .channel(`inbox:${environment}`, { config: { private: true } })
        .on("broadcast", { event: "inbox-changed" }, (message) => {
          const ping = (message.payload ?? {}) as InboxChangePing;
          const plan = planInboxRefetch(ping, selectedConversationIdRef.current);
          if (plan.queue) pendingQueue = true;
          if (plan.thread && ping.conversationId) pendingThreadId = ping.conversationId;
          if (debounceTimer === null) {
            debounceTimer = window.setTimeout(flush, 750);
          }
        })
        .subscribe((status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            setLive(true);
            stopPolling();
          } else {
            // CHANNEL_ERROR | TIMED_OUT | CLOSED → degrade to polling.
            setLive(false);
            startPolling();
          }
        });
    };

    void connect();

    return () => {
      disposed = true;
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      stopPolling();
      if (channel) void supabase.removeChannel(channel);
      setLive(false);
    };
  }, [enabled, environment, selectedConversationIdRef]);

  return { live };
}
