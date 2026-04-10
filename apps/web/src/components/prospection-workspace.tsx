"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import {
  AlertTriangle,
  CheckCircle2,
  LogOut,
  QrCode,
  RefreshCcw,
  Search,
  Send,
  Wifi,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import type {
  AuthUser,
  ConversationRecord,
  DashboardMetrics,
  LeadCandidateRecord,
  LeadRecord,
  LoginResponse,
  PipelineColumn,
  WhatsAppSessionRecord,
} from "@/lib/types";

const TOKEN_STORAGE_KEY = "prospection-auth-token";
const EMAIL_HINT = "admin@77marketing.local";
const PASSWORD_HINT = "77marketing123";

export function ProspectionWorkspace() {
  const [token, setToken] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [loginEmail, setLoginEmail] = useState(EMAIL_HINT);
  const [loginPassword, setLoginPassword] = useState(PASSWORD_HINT);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("ALL");
  const [pipelineFilter, setPipelineFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [captureQuery, setCaptureQuery] = useState("eventos");
  const [captureUrls, setCaptureUrls] = useState("");
  const [allowBurst, setAllowBurst] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [inboundDraft, setInboundDraft] = useState("");

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken) {
      setToken(storedToken);
    }
    setBooted(true);
  }, []);

  const { data: user, error: userError, mutate: mutateUser } = useSWR(
    token ? ["/auth/me", token] : null,
    ([path, authToken]) => apiFetch<AuthUser>(path, { token: authToken }),
  );
  const { data: metrics, mutate: mutateMetrics } = useSWR(
    token ? ["/dashboard/metrics", token] : null,
    ([path, authToken]) => apiFetch<DashboardMetrics>(path, { token: authToken }),
  );
  const { data: leads, mutate: mutateLeads } = useSWR(token ? ["/leads", token] : null, ([path, authToken]) =>
    apiFetch<LeadRecord[]>(path, { token: authToken }),
  );
  const { data: candidates, mutate: mutateCandidates } = useSWR(
    token ? ["/leads/candidates", token] : null,
    ([path, authToken]) => apiFetch<LeadCandidateRecord[]>(path, { token: authToken }),
  );
  const { data: pipeline, mutate: mutatePipeline } = useSWR(
    token ? ["/pipeline", token] : null,
    ([path, authToken]) => apiFetch<PipelineColumn[]>(path, { token: authToken }),
  );
  const { data: conversations, mutate: mutateConversations } = useSWR(
    token ? ["/conversations", token] : null,
    ([path, authToken]) => apiFetch<ConversationRecord[]>(path, { token: authToken }),
  );
  const { data: whatsappSession, mutate: mutateWhatsapp } = useSWR(
    token ? ["/whatsapp/session", token] : null,
    ([path, authToken]) => apiFetch<WhatsAppSessionRecord | null>(path, { token: authToken }),
  );

  useEffect(() => {
    if (userError instanceof ApiError && userError.status === 401) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      setToken(null);
    }
  }, [userError]);

  useEffect(() => {
    if (!conversations?.length) {
      setSelectedConversationId(null);
      return;
    }

    if (!selectedConversationId || !conversations.some((item) => item.id === selectedConversationId)) {
      setSelectedConversationId(conversations[0]?.id ?? null);
    }
  }, [conversations, selectedConversationId]);

  const deferredSearch = useDeferredValue(search);
  const filteredLeads =
    leads?.filter((lead) => {
      const matchesSearch =
        !deferredSearch ||
        [lead.name, lead.city, lead.instagram, lead.eventType, lead.leadCategory]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(deferredSearch.toLowerCase());
      const matchesClassification =
        classificationFilter === "ALL" || lead.classification === classificationFilter;
      const matchesPipeline = pipelineFilter === "ALL" || lead.pipelineStatus === pipelineFilter;
      const matchesSource =
        sourceFilter === "ALL" ||
        lead.evidences.some((evidence) => evidence.sourceType === sourceFilter);

      return matchesSearch && matchesClassification && matchesPipeline && matchesSource;
    }) ?? [];

  const selectedConversation =
    conversations?.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const sourceOptions = [
    "ALL",
    ...new Set(leads?.flatMap((lead) => lead.evidences.map((evidence) => evidence.sourceType)) ?? []),
  ];

  const refreshWorkspace = () => {
    void Promise.all([
      mutateMetrics(),
      mutateLeads(),
      mutateCandidates(),
      mutatePipeline(),
      mutateConversations(),
      mutateWhatsapp(),
    ]);
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyAction("login");
    setLoginError(null);

    try {
      const response = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: {
          email: loginEmail,
          password: loginPassword,
        },
      });
      window.localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
      setToken(response.accessToken);
      await mutateUser();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Falha ao autenticar.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setSelectedLeadIds([]);
  };

  const runCapture = async () => {
    if (!token) return;
    setBusyAction("capture");

    try {
      await apiFetch("/capture/run", {
        token,
        method: "POST",
        body: {
          query: captureQuery || undefined,
          manualUrls: captureUrls
            .split(/\r?\n/)
            .map((value) => value.trim())
            .filter(Boolean),
        },
      });
      refreshWorkspace();
      setFeedback({ kind: "success", text: "Captacao rodada e base atualizada." });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Falha ao executar a captura.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const startCampaign = async () => {
    if (!token || selectedLeadIds.length === 0) return;
    setBusyAction("campaign");

    try {
      await apiFetch("/campaigns/start", {
        token,
        method: "POST",
        body: {
          leadIds: selectedLeadIds,
          name: `Lote manual ${new Date().toLocaleString("pt-BR")}`,
          dailyLimit: allowBurst ? selectedLeadIds.length : 20,
          overrideDailyLimit: allowBurst,
        },
      });
      setSelectedLeadIds([]);
      refreshWorkspace();
      setFeedback({ kind: "success", text: "Lote iniciado com sucesso." });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Falha ao iniciar o lote.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const updatePipeline = async (leadId: string, status: LeadRecord["pipelineStatus"]) => {
    if (!token) return;
    await apiFetch(`/leads/${leadId}/pipeline`, {
      token,
      method: "PATCH",
      body: {
        status,
        reason: "Movimentacao manual no dashboard",
      },
    });
    refreshWorkspace();
  };

  const promoteCandidate = async (candidateId: string) => {
    if (!token) return;
    setBusyAction(candidateId);
    try {
      await apiFetch(`/leads/${candidateId}/promote`, { token, method: "POST" });
      refreshWorkspace();
    } finally {
      setBusyAction(null);
    }
  };

  const connectWhatsapp = async () => {
    if (!token) return;
    await apiFetch("/whatsapp/session/connect", {
      token,
      method: "POST",
      body: { label: "77 Marketing" },
    });
    refreshWorkspace();
  };

  const mockScan = async () => {
    if (!token) return;
    await apiFetch("/whatsapp/session/mock-scan", { token, method: "POST" });
    refreshWorkspace();
  };

  const simulateInbound = async () => {
    if (!token || !selectedConversation || !inboundDraft.trim()) return;
    await apiFetch(`/conversations/${selectedConversation.id}/inbound`, {
      token,
      method: "POST",
      body: { content: inboundDraft },
    });
    setInboundDraft("");
    refreshWorkspace();
  };

  const handoffConversation = async () => {
    if (!token || !selectedConversation) return;
    await apiFetch(`/conversations/${selectedConversation.id}/handoff`, {
      token,
      method: "POST",
      body: { note: "Handoff acionado manualmente pelo operador." },
    });
    refreshWorkspace();
  };

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds((current) =>
      current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId],
    );
  };

  if (!booted) {
    return <div className="flex min-h-screen items-center justify-center">Carregando workspace...</div>;
  }

  if (!token || !user) {
    return (
      <div className="min-h-screen px-4 py-4 md:px-8">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="panel px-8 py-10">
            <p className="eyebrow">77 Marketing</p>
            <h1 className="mt-5 font-display text-5xl leading-[0.95] text-stone-950">
              Prospecção de eventos com base única, score e CRM.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-stone-600">
              O MVP concentra captação, qualificação, lote manual de contato e monitor de conversa em um
              único painel operacional.
            </p>
            <div className="mt-10 grid gap-3 md:grid-cols-3">
              <InfoCard title="Captação" text="Google, páginas de ingressos e sites com telefone do produtor." />
              <InfoCard title="Cadência" text="Lote padrão de 20 contatos/dia, com override manual." />
              <InfoCard title="Objetivo" text="Qualificar e gerar handoff para reunião do comercial." />
            </div>
          </section>

          <section className="panel px-8 py-10">
            <p className="eyebrow">Acesso interno</p>
            <h2 className="mt-5 font-display text-3xl text-stone-950">Entrar no workspace</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Login JWT simples para a operação da 77 Marketing.
            </p>
            <form className="mt-8 space-y-4" onSubmit={handleLogin}>
              <input className="input-shell" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
              <input
                className="input-shell"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
              {loginError ? <div className="feedback feedback-error">{loginError}</div> : null}
              <button className="action-primary w-full justify-center" disabled={busyAction === "login"} type="submit">
                {busyAction === "login" ? "Entrando..." : "Liberar painel"}
              </button>
            </form>
            <div className="mt-8 rounded-[28px] border border-stone-200/70 bg-white/80 p-4 text-sm text-stone-600">
              <p className="font-medium text-stone-900">Credenciais seeded</p>
              <p className="mt-2">E-mail: {EMAIL_HINT}</p>
              <p>Senha: {PASSWORD_HINT}</p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-3 py-3 md:px-5">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <section className="panel px-5 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="eyebrow">Painel operacional</p>
              <h2 className="mt-4 font-display text-4xl text-stone-950">
                Leads, pipeline e conversa semi-automática em uma só superfície.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                Toda automação aqui depende de decisão humana. O sistema organiza, qualifica e empurra o
                handoff comercial no momento certo.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="action-secondary" onClick={refreshWorkspace}>
                <RefreshCcw className="h-4 w-4" />
                Atualizar
              </button>
              <button className="action-secondary" onClick={runCapture}>
                <Search className="h-4 w-4" />
                Buscar leads agora
              </button>
              <button
                className="action-primary"
                disabled={selectedLeadIds.length === 0 || busyAction === "campaign"}
                onClick={startCampaign}
              >
                <Send className="h-4 w-4" />
                Iniciar contato
              </button>
              <button className="action-ghost" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </div>
          </div>

          {feedback ? (
            <div className={clsx("mt-5 feedback", feedback.kind === "error" ? "feedback-error" : "feedback-success")}>
              {feedback.text}
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="Novos leads" value={metrics?.kpis.newLeadsToday ?? 0} />
            <MetricCard label="Sem contato" value={metrics?.kpis.leadsWithoutContact ?? 0} />
            <MetricCard label="Em conversa" value={metrics?.kpis.activeConversations ?? 0} />
            <MetricCard label="Fila candidata" value={metrics?.kpis.candidatesInQueue ?? 0} />
            <MetricCard label="Taxa resposta" value={`${metrics?.kpis.responseRate ?? 0}%`} />
            <MetricCard label="Taxa handoff" value={`${metrics?.kpis.schedulingRate ?? 0}%`} />
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <section className="panel px-5 py-5">
              <div className="grid gap-3 xl:grid-cols-[2fr_1fr_1fr_1fr]">
                <label className="relative">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    className="input-shell pl-10"
                    placeholder="Buscar por nome, cidade ou categoria"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <select className="select-shell" value={classificationFilter} onChange={(e) => setClassificationFilter(e.target.value)}>
                  <option value="ALL">Score: todos</option>
                  <option value="HOT">Quente</option>
                  <option value="WARM">Morno</option>
                  <option value="COLD">Frio</option>
                </select>
                <select className="select-shell" value={pipelineFilter} onChange={(e) => setPipelineFilter(e.target.value)}>
                  <option value="ALL">Pipeline: todos</option>
                  {pipelineStages.map((stage) => (
                    <option key={stage.value} value={stage.value}>
                      {stage.label}
                    </option>
                  ))}
                </select>
                <select className="select-shell" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                  {sourceOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === "ALL" ? "Origem: todas" : labelSource(option)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 grid gap-3 rounded-[28px] border border-stone-200/70 bg-white/70 p-4 lg:grid-cols-[1fr_1.2fr_auto]">
                <input
                  className="input-shell"
                  value={captureQuery}
                  onChange={(event) => setCaptureQuery(event.target.value)}
                  placeholder="Termo de captura"
                />
                <textarea
                  className="textarea-shell"
                  value={captureUrls}
                  onChange={(event) => setCaptureUrls(event.target.value)}
                  placeholder="Uma URL por linha para extrair telefone do produtor"
                />
                <label className="flex items-center gap-3 rounded-2xl border border-stone-200/70 bg-stone-50/90 px-3 py-3 text-sm text-stone-600">
                  <input type="checkbox" checked={allowBurst} onChange={(event) => setAllowBurst(event.target.checked)} />
                  Permitir lote acima de 20
                </label>
              </div>

              <div className="mt-5 overflow-hidden rounded-[30px] border border-stone-200/75 bg-white/75">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-stone-100/90 text-xs uppercase tracking-[0.2em] text-stone-500">
                    <tr>
                      <th className="px-4 py-3">Sel</th>
                      <th className="px-4 py-3">Lead</th>
                      <th className="px-4 py-3">Score</th>
                      <th className="px-4 py-3">Origem</th>
                      <th className="px-4 py-3">Pipeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id} className="border-t border-stone-200/70">
                        <td className="px-4 py-4">
                          <input type="checkbox" checked={selectedLeadIds.includes(lead.id)} onChange={() => toggleLead(lead.id)} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            <p className="font-medium text-stone-900">{lead.name}</p>
                            <p className="text-xs text-stone-500">
                              {[lead.city, lead.eventType, lead.leadCategory].filter(Boolean).join(" • ")}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={clsx("status-pill", classificationTone(lead.classification))}>
                            {labelClassification(lead.classification)} {lead.score}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs text-stone-500">
                          {lead.evidences.slice(0, 2).map((evidence) => labelSource(evidence.sourceType)).join(" • ")}
                        </td>
                        <td className="px-4 py-4">
                          <select
                            className="select-shell min-w-[210px]"
                            value={lead.pipelineStatus}
                            onChange={(event) =>
                              updatePipeline(lead.id, event.target.value as LeadRecord["pipelineStatus"])
                            }
                          >
                            {pipelineStages.map((stage) => (
                              <option key={stage.value} value={stage.value}>
                                {stage.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel px-5 py-5">
              <p className="eyebrow">Pipeline</p>
              <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {(pipeline ?? []).map((column) => (
                  <div key={column.status} className="rounded-[26px] border border-stone-200/70 bg-white/75 p-4">
                    <div className="flex items-center justify-between border-b border-stone-200/70 pb-3">
                      <div>
                        <p className="font-medium text-stone-900">{labelPipeline(column.status)}</p>
                        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                          {column.leads.length} lead(s)
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {column.leads.slice(0, 4).map((lead) => (
                        <div key={lead.id} className="rounded-[20px] border border-stone-200/70 bg-stone-50/90 px-3 py-3">
                          <p className="font-medium text-stone-900">{lead.name}</p>
                          <p className="text-xs text-stone-500">
                            {[lead.city, lead.eventType].filter(Boolean).join(" • ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="panel px-5 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow">WhatsApp</p>
                  <p className="mt-2 font-display text-2xl text-stone-950">{labelSession(whatsappSession?.status)}</p>
                </div>
                {whatsappSession?.status === "QR_PENDING" ? (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                )}
              </div>
              <div className="mt-4 flex gap-3">
                <button className="action-secondary flex-1 justify-center" onClick={connectWhatsapp}>
                  <QrCode className="h-4 w-4" />
                  Gerar QR
                </button>
                <button className="action-ghost flex-1 justify-center" onClick={mockScan}>
                  <Wifi className="h-4 w-4" />
                  Mock scan
                </button>
              </div>
              {whatsappSession?.qrCodeDataUrl ? (
                <div className="mt-4 flex justify-center rounded-[26px] border border-stone-200/70 bg-white p-4">
                  <Image
                    alt="QR Code da sessão"
                    className="rounded-[20px]"
                    height={192}
                    src={whatsappSession.qrCodeDataUrl}
                    unoptimized
                    width={192}
                  />
                </div>
              ) : null}
            </section>

            <section className="panel px-5 py-5">
              <p className="eyebrow">Fila de candidatos</p>
              <div className="mt-4 space-y-3">
                {(candidates ?? []).slice(0, 5).map((candidate) => (
                  <div key={candidate.id} className="rounded-[24px] border border-stone-200/70 bg-white/75 p-4">
                    <p className="font-medium text-stone-900">{candidate.displayName}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {[candidate.city, candidate.eventType, candidate.leadCategory].filter(Boolean).join(" • ")}
                    </p>
                    <button
                      className="action-ghost mt-3 w-full justify-center"
                      disabled={busyAction === candidate.id}
                      onClick={() => promoteCandidate(candidate.id)}
                    >
                      Promover
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel px-5 py-5">
              <p className="eyebrow">Conversa</p>
              <div className="mt-4 space-y-2">
                {(conversations ?? []).map((conversation) => (
                  <button
                    key={conversation.id}
                    className={clsx(
                      "w-full rounded-[22px] border px-3 py-3 text-left",
                      selectedConversationId === conversation.id
                        ? "border-stone-950 bg-stone-950 text-white"
                        : "border-stone-200/70 bg-white/80 text-stone-900",
                    )}
                    onClick={() => setSelectedConversationId(conversation.id)}
                    type="button"
                  >
                    <p className="font-medium">{conversation.lead.name}</p>
                    <p className="text-xs opacity-80">{labelConversation(conversation.status)}</p>
                  </button>
                ))}
              </div>

              {selectedConversation ? (
                <div className="mt-4 space-y-3">
                  <div className="max-h-64 space-y-3 overflow-auto rounded-[26px] border border-stone-200/70 bg-white/75 p-4">
                    {selectedConversation.messages.map((message) => (
                      <div
                        key={message.id}
                        className={clsx(
                          "rounded-[20px] px-3 py-3 text-sm leading-6",
                          message.direction === "OUTBOUND" && "ml-auto bg-stone-950 text-white",
                          message.direction === "INBOUND" && "bg-stone-100 text-stone-900",
                          message.direction === "SYSTEM" && "border border-amber-200 bg-amber-50 text-amber-950",
                        )}
                      >
                        {message.content}
                      </div>
                    ))}
                  </div>
                  <textarea
                    className="textarea-shell"
                    value={inboundDraft}
                    onChange={(event) => setInboundDraft(event.target.value)}
                    placeholder="Simular resposta do lead"
                  />
                  <div className="flex gap-3">
                    <button className="action-secondary flex-1 justify-center" onClick={simulateInbound}>
                      <Send className="h-4 w-4" />
                      Simular
                    </button>
                    <button className="action-ghost flex-1 justify-center" onClick={handoffConversation}>
                      Handoff
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-shell">
      <p className="text-xs uppercase tracking-[0.22em] text-stone-500">{label}</p>
      <p className="mt-3 font-display text-3xl text-stone-950">{value}</p>
    </div>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[28px] border border-stone-200/70 bg-white/80 p-5">
      <p className="font-medium text-stone-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">{text}</p>
    </div>
  );
}

function labelSource(value: string) {
  return (
    {
      GOOGLE_MAPS: "Google Maps",
      GOOGLE_SEARCH: "Google Search",
      TICKETING_SITE: "Ingresso",
      PUBLIC_REGISTRY: "Base pública",
      MANUAL_WEBSITE: "Site manual",
      OTHER: "Outra origem",
    }[value] ?? value
  );
}

function labelClassification(value: LeadRecord["classification"]) {
  return value === "HOT" ? "Quente" : value === "WARM" ? "Morno" : "Frio";
}

function classificationTone(value: LeadRecord["classification"]) {
  if (value === "HOT") return "bg-emerald-100 text-emerald-900";
  if (value === "WARM") return "bg-amber-100 text-amber-900";
  return "bg-stone-200 text-stone-700";
}

function labelPipeline(value: LeadRecord["pipelineStatus"]) {
  return pipelineStages.find((stage) => stage.value === value)?.label ?? value;
}

function labelConversation(value: ConversationRecord["status"]) {
  return {
    PENDING: "Pendente",
    ACTIVE: "Ativa",
    NEEDS_REVIEW: "Revisão",
    HANDOFF: "Handoff",
    CLOSED: "Encerrada",
    LOST: "Perdida",
  }[value];
}

function labelSession(value?: WhatsAppSessionRecord["status"] | null) {
  return (
    {
      DISCONNECTED: "Desconectado",
      QR_PENDING: "QR pendente",
      CONNECTED: "Conectado",
      ERROR: "Erro",
    }[value ?? "DISCONNECTED"] ?? "Desconectado"
  );
}

const pipelineStages = [
  { value: "LEAD_FOUND", label: "Lead encontrado" },
  { value: "LEAD_QUALIFIED", label: "Lead qualificado" },
  { value: "CONTACT_STARTED", label: "Contato iniciado" },
  { value: "IN_CONVERSATION", label: "Em conversa" },
  { value: "MEETING_HANDOFF", label: "Reunião / handoff" },
  { value: "PROPOSAL_NEGOTIATION", label: "Proposta / negociação" },
  { value: "WAITING_DECISION", label: "Aguardando decisão" },
  { value: "WON", label: "Fechado" },
  { value: "LOST", label: "Perdido" },
] as const;
