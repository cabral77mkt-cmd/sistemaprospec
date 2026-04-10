import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      name: '77 Marketing Prospeccao API',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
