export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN";
  active: boolean;
};

export type LoginResponse = {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: "ADMIN";
  };
};

export type LeadRecord = {
  id: string;
  name: string;
  whatsapp: string | null;
  instagram: string | null;
  city: string | null;
  state: string | null;
  leadCategory: string | null;
  eventType: string | null;
  score: number;
  classification: "HOT" | "WARM" | "COLD";
  pipelineStatus:
    | "LEAD_FOUND"
    | "LEAD_QUALIFIED"
    | "CONTACT_STARTED"
    | "IN_CONVERSATION"
    | "MEETING_HANDOFF"
    | "PROPOSAL_NEGOTIATION"
    | "WAITING_DECISION"
    | "WON"
    | "LOST";
  sourceConfidence: number;
  evidences: Array<{
    id: string;
    sourceType:
      | "GOOGLE_MAPS"
      | "GOOGLE_SEARCH"
      | "TICKETING_SITE"
      | "PUBLIC_REGISTRY"
      | "MANUAL_WEBSITE"
      | "OTHER";
    sourceLabel: string;
    sourceUrl: string | null;
    confidence: number;
  }>;
  sourceCount: number;
  latestMessagePreview: string | null;
  hasConversation: boolean;
};

export type LeadCandidateRecord = {
  id: string;
  displayName: string;
  normalizedPhone: string | null;
  rawPhone: string | null;
  city: string | null;
  state: string | null;
  leadCategory: string | null;
  eventType: string | null;
  confidence: number;
  hasEventEvidence: boolean;
  evidences: Array<{
    id: string;
    sourceType: string;
    sourceLabel: string;
    confidence: number;
  }>;
};

export type PipelineColumn = {
  status: LeadRecord["pipelineStatus"];
  leads: LeadRecord[];
};

export type ConversationRecord = {
  id: string;
  leadId: string;
  status: "PENDING" | "ACTIVE" | "NEEDS_REVIEW" | "HANDOFF" | "CLOSED" | "LOST";
  currentStep:
    | "RESPONSIBLE"
    | "EVENT_TYPE"
    | "AUDIENCE"
    | "COMMERCIAL_STACK"
    | "NEXT_EVENT"
    | "COMPLETE"
    | "HUMAN_REVIEW";
  meetingRequested: boolean;
  needsHumanReview: boolean;
  aiSummary: string | null;
  createdAt: string;
  updatedAt: string;
  lead: LeadRecord;
  qualification: {
    responsibleAnswer: string | null;
    isResponsible: boolean | null;
    eventTypeAnswer: string | null;
    nextEventAt: string | null;
    audienceSizeAnswer: string | null;
    estimatedAudience: number | null;
    sellsOnline: boolean | null;
    paidTraffic: boolean | null;
    completedAt: string | null;
  } | null;
  messages: Array<{
    id: string;
    direction: "OUTBOUND" | "INBOUND" | "SYSTEM";
    type: "TEXT" | "QUALIFICATION" | "STATUS_UPDATE";
    content: string;
    sentAt: string;
  }>;
};

export type DashboardMetrics = {
  kpis: {
    newLeadsToday: number;
    leadsWithoutContact: number;
    activeConversations: number;
    candidatesInQueue: number;
    handoffCount: number;
    responseRate: number;
    schedulingRate: number;
  };
  scoreBuckets: Array<{
    label: string;
    value: number;
  }>;
  sourceBreakdown: Array<{
    sourceType: string;
    count: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    count: number;
  }>;
  pipelineBreakdown: Array<{
    status: string;
    count: number;
  }>;
  recentTransitions: Array<{
    id: string;
    reason: string | null;
    toStatus: string;
    createdAt: string;
    lead: {
      id: string;
      name: string;
    };
  }>;
  whatsapp: WhatsAppSessionRecord | null;
};

export type WhatsAppSessionRecord = {
  id: string;
  label: string;
  status: "DISCONNECTED" | "QR_PENDING" | "CONNECTED" | "ERROR";
  qrCodeDataUrl: string | null;
  connectedAt: string | null;
  updatedAt: string;
};
