import { Injectable } from '@nestjs/common';
import { WhatsAppSessionStatus } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhatsappService {
  constructor(private readonly prisma: PrismaService) {}

  async getSession() {
    return this.prisma.whatsAppSession.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
  }

  async connectSession(label?: string) {
    const sessionToken = `77-marketing:${crypto.randomUUID()}`;
    const qrCodeDataUrl = await QRCode.toDataURL(sessionToken);
    const existingSession = await this.getSession();

    if (existingSession) {
      return this.prisma.whatsAppSession.update({
        where: { id: existingSession.id },
        data: {
          label: label ?? existingSession.label,
          sessionToken,
          qrCodeDataUrl,
          status: WhatsAppSessionStatus.QR_PENDING,
          connectedAt: null,
          lastHeartbeatAt: new Date(),
          metadata: {
            mode: 'mock',
            instructions:
              'Use POST /whatsapp/session/mock-scan para simular o scan do QR.',
          },
        },
      });
    }

    return this.prisma.whatsAppSession.create({
      data: {
        label: label ?? '77 Marketing',
        sessionToken,
        qrCodeDataUrl,
        status: WhatsAppSessionStatus.QR_PENDING,
        lastHeartbeatAt: new Date(),
        metadata: {
          mode: 'mock',
          instructions:
            'Use POST /whatsapp/session/mock-scan para simular o scan do QR.',
        },
      },
    });
  }

  async mockScanSession() {
    const session = await this.getSession();

    if (!session) {
      return this.connectSession();
    }

    return this.prisma.whatsAppSession.update({
      where: { id: session.id },
      data: {
        status: WhatsAppSessionStatus.CONNECTED,
        connectedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
    });
  }
}
