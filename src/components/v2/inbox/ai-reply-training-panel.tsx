"use client";

import { Loader2, PenLine, Plus, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Brand = "HP" | "VVS" | "Unassigned";

type PromptProfile = {
  id: string;
  brand: Brand;
  name: string;
  version: number;
  businessContext: string;
  salesGuidance: string;
  toneGuidance: string;
  disallowedClaims: string[];
  active: boolean;
};

type TrainingExample = {
  id: string;
  promptProfileId: string | null;
  brand: Brand;
  title: string;
  source: string;
  conversationText: string;
  idealResponse: string;
  critique: string | null;
  rating: number | null;
};

type TrainingData = {
  profiles: PromptProfile[];
  examples: TrainingExample[];
  questions: string[];
};

type SimulationResult = {
  draft: string;
  strategy: string;
  nextBestAction: string;
  confidence: string;
  riskFlags: string[];
  toneNotes: string[];
};

type ProfileDraft = {
  businessContext: string;
  salesGuidance: string;
  toneGuidance: string;
  disallowedClaims: string;
};

const FIELD =
  "border border-hp-rule bg-hp-card px-3 py-2 text-sm leading-6 text-hp-body outline-none focus:border-hp-ink disabled:bg-hp-inset disabled:text-hp-muted";
const LABEL = "mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted";
const BTN =
  "inline-flex h-10 items-center justify-center gap-2 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:border-hp-ink disabled:opacity-50";
const EMPTY_PROFILE_DRAFT: ProfileDraft = {
  businessContext: "",
  salesGuidance: "",
  toneGuidance: "",
  disallowedClaims: "",
};

export function AiReplyTrainingPanel({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<TrainingData | null>(null);
  const [brand, setBrand] = useState<Brand>("HP");
  const [profileDraftState, setProfileDraftState] = useState<{
    key: string;
    draft: ProfileDraft;
  } | null>(null);
  const [exampleDraft, setExampleDraft] = useState({
    title: "",
    conversationText: "Customer: \nTeam: ",
    idealResponse: "",
    critique: "",
    rating: "5",
  });
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState<"load" | "profile" | "example" | null>("load");
  const [status, setStatus] = useState<string | null>(null);

  const activeProfile = useMemo(
    () => data?.profiles.find((profile) => profile.brand === brand && profile.active) || null,
    [brand, data?.profiles],
  );
  const brandExamples = useMemo(
    () => (data?.examples || []).filter((example) => example.brand === brand).slice(0, 6),
    [brand, data?.examples],
  );
  const activeProfileKey = activeProfile?.id || `${brand}:empty`;
  const profileDraft =
    profileDraftState?.key === activeProfileKey
      ? profileDraftState.draft
      : draftFromProfile(activeProfile);

  const refresh = useCallback(async () => {
    setBusy("load");
    try {
      const response = await fetch("/api/social-inbox/ai-training", { cache: "no-store" });
      const payload = (await response.json()) as TrainingData | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Could not load reply training.");
      }
      setData(payload);
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load reply training.");
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function updateProfileDraft(patch: Partial<ProfileDraft>) {
    setProfileDraftState({
      key: activeProfileKey,
      draft: { ...profileDraft, ...patch },
    });
  }

  async function saveProfile() {
    if (!activeProfile || !canManage) return;
    setBusy("profile");
    try {
      const response = await fetch("/api/social-inbox/ai-training", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: activeProfile.id,
          brand,
          businessContext: profileDraft.businessContext,
          salesGuidance: profileDraft.salesGuidance,
          toneGuidance: profileDraft.toneGuidance,
          disallowedClaims: profileDraft.disallowedClaims
            .split("\n")
            .map((claim) => claim.trim())
            .filter(Boolean),
        }),
      });
      const payload = (await response.json()) as { profile?: PromptProfile; error?: string };
      if (!response.ok || payload.error || !payload.profile) {
        throw new Error(payload.error || "Could not save reply profile.");
      }
      setData((current) =>
        current
          ? {
              ...current,
              profiles: current.profiles.map((profile) =>
                profile.id === payload.profile?.id ? payload.profile : profile,
              ),
            }
          : current,
      );
      setStatus("Reply profile saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save reply profile.");
    } finally {
      setBusy(null);
    }
  }

  async function createExample() {
    if (!activeProfile || !canManage) return;
    setBusy("example");
    try {
      const response = await fetch("/api/social-inbox/ai-training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptProfileId: activeProfile.id,
          brand,
          title: exampleDraft.title,
          source: "synthetic",
          conversationText: exampleDraft.conversationText,
          idealResponse: exampleDraft.idealResponse,
          critique: exampleDraft.critique,
          rating: exampleDraft.rating,
        }),
      });
      const payload = (await response.json()) as { example?: TrainingExample; error?: string };
      if (!response.ok || payload.error || !payload.example) {
        throw new Error(payload.error || "Could not save training example.");
      }
      setData((current) =>
        current
          ? {
              ...current,
              examples: [payload.example as TrainingExample, ...current.examples],
            }
          : current,
      );
      setExampleDraft({
        title: "",
        conversationText: "Customer: \nTeam: ",
        idealResponse: "",
        critique: "",
        rating: "5",
      });
      setStatus("Training example saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save training example.");
    } finally {
      setBusy(null);
    }
  }

  async function simulateDraft() {
    if (!canManage) return;
    setBusy("example");
    try {
      const response = await fetch("/api/social-inbox/ai-training", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          conversationText: exampleDraft.conversationText,
          staffGuidance: profileDraft.salesGuidance,
        }),
      });
      const payload = (await response.json()) as SimulationResult | { error?: string; reason?: string };
      if (!response.ok || !("draft" in payload)) {
        const errorPayload = payload as { error?: string; reason?: string };
        throw new Error(
          errorPayload.error ||
            errorPayload.reason ||
            "Could not draft test reply.",
        );
      }
      setSimulation(payload);
      setStatus("Test draft ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not draft test reply.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="border border-hp-rule bg-hp-card p-5">
      <header className="flex flex-col gap-3 border-b border-hp-rule-soft pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Reply Intelligence
          </p>
          <h2 className="mt-1 font-title text-2xl leading-tight text-hp-ink">
            Suggested Reply Training
          </h2>
        </div>
        <select
          value={brand}
          onChange={(event) => setBrand(event.target.value as Brand)}
          className={`${FIELD} h-10`}
        >
          <option value="HP">Hung Phat</option>
          <option value="VVS">VVS</option>
          <option value="Unassigned">Unassigned</option>
        </select>
      </header>

      {!canManage ? (
        <p className="mt-4 border border-hp-rule bg-hp-inset px-3 py-2 text-sm leading-6 text-hp-muted">
          Reply training is read-only for this role.
        </p>
      ) : null}

      {status ? (
        <p className="mt-4 border border-hp-rule bg-hp-inset px-3 py-2 text-sm leading-6 text-hp-body">
          {status}
        </p>
      ) : null}

      {busy === "load" ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-hp-muted">
          <Loader2 size={14} className="animate-spin" />
          Loading reply training...
        </p>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {(data?.questions || []).map((question, index) => (
              <div key={question} className="border border-hp-rule-soft bg-hp-foundation px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  Q{index + 1}
                </p>
                <p className="mt-1 text-sm leading-6 text-hp-body">{question}</p>
              </div>
            ))}
          </div>

          <label className="block">
            <span className={LABEL}>Business context</span>
            <textarea
              value={profileDraft.businessContext}
              onChange={(event) =>
                updateProfileDraft({ businessContext: event.target.value })
              }
              disabled={!canManage || !activeProfile}
              rows={4}
              className={`${FIELD} w-full resize-y`}
            />
          </label>

          <label className="block">
            <span className={LABEL}>Sales guidance</span>
            <textarea
              value={profileDraft.salesGuidance}
              onChange={(event) =>
                updateProfileDraft({ salesGuidance: event.target.value })
              }
              disabled={!canManage || !activeProfile}
              rows={4}
              className={`${FIELD} w-full resize-y`}
            />
          </label>

          <label className="block">
            <span className={LABEL}>Tone guidance</span>
            <textarea
              value={profileDraft.toneGuidance}
              onChange={(event) =>
                updateProfileDraft({ toneGuidance: event.target.value })
              }
              disabled={!canManage || !activeProfile}
              rows={3}
              className={`${FIELD} w-full resize-y`}
            />
          </label>

          <label className="block">
            <span className={LABEL}>Never claim</span>
            <textarea
              value={profileDraft.disallowedClaims}
              onChange={(event) =>
                updateProfileDraft({ disallowedClaims: event.target.value })
              }
              disabled={!canManage || !activeProfile}
              rows={3}
              className={`${FIELD} w-full resize-y`}
            />
          </label>

          <button
            type="button"
            onClick={saveProfile}
            disabled={!canManage || !activeProfile || busy === "profile"}
            className={BTN}
          >
            {busy === "profile" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Profile
          </button>
        </div>

        <div className="space-y-4">
          <section className="border border-hp-rule-soft bg-hp-foundation p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              Synthetic example
            </p>
            <div className="mt-3 grid gap-3">
              <input
                value={exampleDraft.title}
                onChange={(event) =>
                  setExampleDraft((current) => ({ ...current, title: event.target.value }))
                }
                disabled={!canManage}
                placeholder="Scenario name"
                className={FIELD}
              />
              <textarea
                value={exampleDraft.conversationText}
                onChange={(event) =>
                  setExampleDraft((current) => ({
                    ...current,
                    conversationText: event.target.value,
                  }))
                }
                disabled={!canManage}
                rows={5}
                className={`${FIELD} resize-y`}
              />
              <textarea
                value={exampleDraft.idealResponse}
                onChange={(event) =>
                  setExampleDraft((current) => ({
                    ...current,
                    idealResponse: event.target.value,
                  }))
                }
                disabled={!canManage}
                rows={4}
                placeholder="Ideal reply"
                className={`${FIELD} resize-y`}
              />
              <textarea
                value={exampleDraft.critique}
                onChange={(event) =>
                  setExampleDraft((current) => ({ ...current, critique: event.target.value }))
                }
                disabled={!canManage}
                rows={3}
                placeholder="What makes this good or bad"
                className={`${FIELD} resize-y`}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={simulateDraft}
                  disabled={
                    !canManage ||
                    !exampleDraft.conversationText.trim() ||
                    busy === "example"
                  }
                  className={BTN}
                >
                  {busy === "example" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <PenLine size={14} />
                  )}
                  Draft Test
                </button>
                <button
                  type="button"
                  onClick={createExample}
                  disabled={
                    !canManage ||
                    !exampleDraft.title.trim() ||
                    !exampleDraft.conversationText.trim() ||
                    !exampleDraft.idealResponse.trim() ||
                    busy === "example"
                  }
                  className={BTN}
                >
                  {busy === "example" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  Add Example
                </button>
              </div>
            </div>
          </section>

          {simulation ? (
            <section className="border border-hp-rule-soft bg-hp-foundation p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                    Test draft
                  </p>
                  <p className="mt-1 text-sm leading-6 text-hp-muted">
                    {simulation.nextBestAction.replaceAll("_", " ")} · {simulation.confidence}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setExampleDraft((current) => ({
                      ...current,
                      idealResponse: simulation.draft,
                    }))
                  }
                  className="text-[10px] uppercase tracking-[0.14em] text-hp-ink hover:text-hp-pink"
                >
                  Use as ideal
                </button>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-hp-body">
                {simulation.draft}
              </p>
              <p className="mt-3 border-t border-hp-rule-soft pt-3 text-xs leading-5 text-hp-muted">
                {simulation.strategy}
              </p>
            </section>
          ) : null}

          <section className="border border-hp-rule-soft bg-hp-foundation p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              Recent examples
            </p>
            {brandExamples.length ? (
              <div className="mt-3 space-y-3">
                {brandExamples.map((example) => (
                  <article key={example.id} className="border border-hp-rule bg-hp-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-title text-base text-hp-ink">{example.title}</p>
                      <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                        {example.source}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs leading-5 text-hp-muted">
                      {example.conversationText}
                    </p>
                    <p className="mt-2 border-t border-hp-rule-soft pt-2 text-sm leading-6 text-hp-body">
                      {example.idealResponse}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-hp-muted">
                No examples saved for this brand.
              </p>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

function draftFromProfile(profile: PromptProfile | null): ProfileDraft {
  return profile
    ? {
        businessContext: profile.businessContext,
        salesGuidance: profile.salesGuidance,
        toneGuidance: profile.toneGuidance,
        disallowedClaims: profile.disallowedClaims.join("\n"),
      }
    : EMPTY_PROFILE_DRAFT;
}
