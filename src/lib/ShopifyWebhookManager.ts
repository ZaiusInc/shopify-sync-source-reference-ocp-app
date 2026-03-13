import { logger } from '@zaiusinc/app-sdk';
import { ShopifyClient, ShopifyCredentials } from './ShopifyClient';

export class ShopifyWebhookManager {
  private credentials: ShopifyCredentials;

  public constructor(credentials: ShopifyCredentials) {
    this.credentials = credentials;
  }

  public async createWebhooks(webhookUrl: string, client?: ShopifyClient): Promise<void> {
    if (!webhookUrl) {
      throw new Error('Webhook URL is not configured');
    }

    const shopifyClient = client || new ShopifyClient(this.credentials);
    await shopifyClient.setupProductWebhooks(webhookUrl);
  }

  public async deleteWebhooks(webhookUrl: string, client?: ShopifyClient): Promise<void> {
    const shopifyClient = client || new ShopifyClient(this.credentials);
    const webhooks = await shopifyClient.getWebhooks();
    const matching = webhooks.filter((webhook) => webhook.address === webhookUrl);

    if (matching.length === 0) {
      return;
    }

    const failedDeletions: number[] = [];
    for (const webhook of matching) {
      try {
        await shopifyClient.deleteWebhook(webhook.id!);
      } catch (err: any) {
        logger.error(`Failed to delete webhook ${webhook.id}: ${err?.message}`);
        failedDeletions.push(webhook.id!);
      }
    }

    if (failedDeletions.length > 0) {
      throw new Error(`Failed to delete webhooks: ${failedDeletions.join(', ')}`);
    }

    logger.info('Webhook deletion completed successfully');
  }
}
