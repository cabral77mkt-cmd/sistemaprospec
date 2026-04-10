import {
  LeadClassification,
  LeadPipelineStatus,
  LeadSourceType,
  PrismaClient,
  UserRole,
  WhatsAppSessionStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import path from 'node:path';

if (
  process.env.DATABASE_URL &&
  process.env.DATABASE_URL.startsWith('file:./')
) {
  const relativePath = process.env.DATABASE_URL.replace('file:./', '');
  const absolutePath = path.resolve(__dirname, relativePath);
  process.env.DATABASE_URL = `file:${absolutePath.replace(/\\/g, '/')}`;
}

const prisma = new PrismaClient();

const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@77marketing.local';
const adminPassword = process.env.ADMIN_PASSWORD ?? '77marketing123';

async function main() {
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: 'Equipe 77 Marketing',
      passwordHash,
      role: UserRole.ADMIN,
      active: true,
    },
    create: {
      name: 'Equipe 77 Marketing',
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
      active: true,
    },
  });

  await prisma.pipelineTransition.deleteMany();
  await prisma.message.deleteMany();
  await prisma.qualificationAnswer.deleteMany();
  await prisma.scoreSnapshot.deleteMany();
  await prisma.campaignBatchLead.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.leadSourceEvidence.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.leadCandidate.deleteMany();
  await prisma.campaignBatch.deleteMany();
  await prisma.whatsAppSession.deleteMany();

  const leads = [
    {
      name: 'Festa BR Label',
      normalizedPhone: '5511998991122',
      rawPhone: '(11) 99899-1122',
      whatsapp: '5511998991122',
      instagram: '@festabrlabel',
      city: 'Sao Paulo',
      state: 'SP',
      leadCategory: 'Label de festas',
      eventType: 'Universitario',
      originPrimary: LeadSourceType.TICKETING_SITE,
      score: 82,
      classification: LeadClassification.HOT,
      pipelineStatus: LeadPipelineStatus.IN_CONVERSATION,
      sourceConfidence: 92,
      notes: 'Produtora com agenda frequente e boa presenca digital.',
      evidences: [
        {
          sourceType: LeadSourceType.TICKETING_SITE,
          sourceLabel: 'Plataforma de ingressos',
          sourceUrl: 'https://exemplo.com/evento/festa-br',
          confidence: 92,
          phoneFound: '(11) 99899-1122',
          isPrimary: true,
          eventSignals: ['open bar', 'universitario', 'line-up'],
        },
      ],
    },
    {
      name: 'Rodeio Vale Premium',
      normalizedPhone: '5517991122334',
      rawPhone: '(17) 99112-2334',
      whatsapp: '5517991122334',
      city: 'Barretos',
      state: 'SP',
      leadCategory: 'Organizador de rodeio',
      eventType: 'Rodeio',
      originPrimary: LeadSourceType.GOOGLE_SEARCH,
      score: 74,
      classification: LeadClassification.HOT,
      pipelineStatus: LeadPipelineStatus.LEAD_QUALIFIED,
      sourceConfidence: 88,
      notes:
        'Contato encontrado em agenda regional com evidencia direta do produtor.',
      evidences: [
        {
          sourceType: LeadSourceType.GOOGLE_SEARCH,
          sourceLabel: 'Portal regional',
          sourceUrl: 'https://portal-regional.com/rodeio-vale',
          confidence: 88,
          phoneFound: '(17) 99112-2334',
          isPrimary: true,
          eventSignals: ['rodeio', 'arena', 'patrocinadores'],
        },
      ],
    },
    {
      name: 'Sunset 024',
      normalizedPhone: '5521985567788',
      rawPhone: '(21) 98556-7788',
      whatsapp: '5521985567788',
      instagram: '@sunset024',
      city: 'Rio de Janeiro',
      state: 'RJ',
      leadCategory: 'Produtor de eventos',
      eventType: 'Sunset',
      originPrimary: LeadSourceType.GOOGLE_MAPS,
      score: 58,
      classification: LeadClassification.WARM,
      pipelineStatus: LeadPipelineStatus.CONTACT_STARTED,
      sourceConfidence: 81,
      notes: 'Lead com sinal de evento recorrente, aguardando resposta.',
      evidences: [
        {
          sourceType: LeadSourceType.GOOGLE_MAPS,
          sourceLabel: 'Google Maps',
          sourceUrl: 'https://maps.google.com/?cid=024sunset',
          confidence: 81,
          phoneFound: '(21) 98556-7788',
          isPrimary: true,
          eventSignals: ['sunset', 'eventos', 'lote promocional'],
        },
      ],
    },
  ];

  for (const item of leads) {
    await prisma.lead.create({
      data: {
        name: item.name,
        normalizedPhone: item.normalizedPhone,
        rawPhone: item.rawPhone,
        whatsapp: item.whatsapp,
        instagram: item.instagram,
        city: item.city,
        state: item.state,
        leadCategory: item.leadCategory,
        eventType: item.eventType,
        originPrimary: item.originPrimary,
        score: item.score,
        classification: item.classification,
        pipelineStatus: item.pipelineStatus,
        sourceConfidence: item.sourceConfidence,
        notes: item.notes,
        evidences: {
          create: item.evidences.map((evidence) => ({
            ...evidence,
            payload: { seeded: true },
          })),
        },
        scoreSnapshots: {
          create: {
            totalScore: item.score,
            classification: item.classification,
            breakdown: {
              whatsappConfidence: 25,
              eventEvidence: 20,
              digitalPresence: item.instagram ? 10 : 0,
              activeCommunication: 10,
              frequencySignal: 10,
              largeOperation: item.score > 70 ? 7 : 0,
            },
          },
        },
        pipelineTransitions: {
          create: {
            fromStatus: null,
            toStatus: item.pipelineStatus,
            reason: 'Carga inicial do MVP',
            performedById: admin.id,
          },
        },
      },
    });
  }

  await prisma.leadCandidate.createMany({
    data: [
      {
        displayName: 'Prefeitura de Aracatuba - Festival do Trabalhador',
        normalizedPhone: '5518991234567',
        rawPhone: '(18) 99123-4567',
        city: 'Aracatuba',
        state: 'SP',
        leadCategory: 'Evento de prefeitura',
        eventType: 'Show',
        sourceSummary:
          'Pagina oficial com telefone do departamento responsavel',
        evidenceSummary: 'Telefone publicado na agenda oficial do evento',
        confidence: 86,
        hasEventEvidence: true,
        metadata: {
          seeded: true,
          sourceType: 'PUBLIC_REGISTRY',
        },
      },
      {
        displayName: 'Atlantica Med',
        normalizedPhone: '5511987788001',
        rawPhone: '(11) 98778-8001',
        city: 'Campinas',
        state: 'SP',
        leadCategory: 'Atletica',
        eventType: 'Universitario',
        sourceSummary: 'Site de festa universitaria',
        evidenceSummary: 'Numero do produtor na landing da festa',
        confidence: 79,
        hasEventEvidence: true,
        metadata: {
          seeded: true,
          sourceType: 'MANUAL_WEBSITE',
        },
      },
    ],
  });

  await prisma.whatsAppSession.create({
    data: {
      label: '77 Marketing',
      status: WhatsAppSessionStatus.DISCONNECTED,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
