import type { Logger } from 'pino';

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<void>;
}

export class ConsoleSmsProvider implements SmsProvider {
  constructor(private readonly logger: Logger) {}

  async send(message: SmsMessage): Promise<void> {
    this.logger.info({ to: message.to, body: message.body }, 'SMS [console]');
  }
}

export class TwilioSmsProvider implements SmsProvider {
  constructor(
    private readonly logger: Logger,
    private readonly config: { accountSid: string; authToken: string; fromNumber: string },
  ) {}

  async send(message: SmsMessage): Promise<void> {
    this.logger.info(
      {
        to: message.to,
        from: this.config.fromNumber,
        body: `[twilio-stub] ${message.body}`,
      },
      'SMS [twilio]',
    );
    this.logger.warn(
      'TwilioSmsProvider is a stub: it does not call the Twilio API. Plug in a real SDK when a gateway is available.',
    );
  }
}

export function createSmsProvider(
  env: { OTP_MODE: 'console' | 'twilio' },
  logger: Logger,
): SmsProvider {
  if (env.OTP_MODE === 'twilio') {
    return new TwilioSmsProvider(logger, {
      accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
      authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
      fromNumber: process.env.TWILIO_FROM_NUMBER ?? '',
    });
  }
  return new ConsoleSmsProvider(logger);
}
