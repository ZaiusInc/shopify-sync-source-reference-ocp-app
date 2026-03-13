import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

const mockTestCredentials = vi.fn();
const mockCreateWebhooks = vi.fn();
const mockDeleteWebhooks = vi.fn();

vi.mock('../lib/ShopifyClient', () => ({
  ShopifyClient: function ShopifyClient(_credentials: any) {
    return { testCredentials: mockTestCredentials };
  },
}));

vi.mock('../lib/ShopifyWebhookManager', () => ({
  ShopifyWebhookManager: function ShopifyWebhookManager(_credentials: any) {
    return { createWebhooks: mockCreateWebhooks, deleteWebhooks: mockDeleteWebhooks };
  },
}));

vi.mock('@zaiusinc/app-sdk', async () => {
  const actual = await vi.importActual('@zaiusinc/app-sdk');
  return {
    ...actual,
    functions: {
      getEndpoints: vi.fn().mockResolvedValue({
        product_webhook: 'https://example.com/webhook',
      }),
    },
    jobs: {
      trigger: vi.fn(),
    },
  };
});

import { Lifecycle } from './Lifecycle';
import { resetLocalStores, storage, jobs } from '@zaiusinc/app-sdk';

describe('Lifecycle', () => {
  let lifecycle: Lifecycle;

  beforeEach(() => {
    vi.clearAllMocks();
    lifecycle = new Lifecycle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetLocalStores();
  });

  describe('onSettingsForm - shopify_credentials', () => {
    const formData = {
      store_url: 'test-store.myshopify.com',
      access_token: 'shpat_test123',
    };

    it('should create webhooks after successful credential validation', async () => {
      mockTestCredentials.mockResolvedValue(true);

      const result = await lifecycle.onSettingsForm('shopify_credentials', 'save', formData);

      expect(mockTestCredentials).toHaveBeenCalled();
      expect(mockDeleteWebhooks).toHaveBeenCalled();
      expect(mockCreateWebhooks).toHaveBeenCalledWith('https://example.com/webhook', expect.anything());
      expect((result as any).toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            intent: 'success',
            message: expect.stringContaining('Webhooks configured'),
          }),
        ])
      );
      const settings = await storage.settings.get('shopify_credentials');
      expect(settings.store_url).toBe('test-store.myshopify.com');
      expect(settings.access_token).toBe('shpat_test123');
      expect(settings.webhooks_active).toBe(true);
      expect(settings.webhook_error).toBe('');
    });

    it('should not create webhooks or save credentials when credentials are invalid', async () => {
      mockTestCredentials.mockResolvedValue(false);

      const result = await lifecycle.onSettingsForm('shopify_credentials', 'save', formData);

      expect(mockTestCredentials).toHaveBeenCalled();
      expect(mockDeleteWebhooks).not.toHaveBeenCalled();
      expect(mockCreateWebhooks).not.toHaveBeenCalled();
      expect((result as any).toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            intent: 'danger',
            message: expect.stringContaining('Invalid'),
          }),
        ])
      );
      const settings = await storage.settings.get('shopify_credentials');
      expect(settings?.store_url).toBeUndefined();
      expect(settings?.access_token).toBeUndefined();
    });

    it('should not create webhooks or save credentials when credentials are incomplete', async () => {
      const result = await lifecycle.onSettingsForm('shopify_credentials', 'save', {
        store_url: '',
        access_token: '',
      });

      expect(mockTestCredentials).not.toHaveBeenCalled();
      expect(mockCreateWebhooks).not.toHaveBeenCalled();
      expect((result as any).toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            intent: 'danger',
          }),
        ])
      );
      const settings = await storage.settings.get('shopify_credentials');
      expect(settings?.store_url).toBeUndefined();
      expect(settings?.access_token).toBeUndefined();
    });

    it('should still show success toast if webhook setup fails', async () => {
      mockTestCredentials.mockResolvedValue(true);
      mockCreateWebhooks.mockRejectedValue(new Error('Webhook creation failed'));

      const result = await lifecycle.onSettingsForm('shopify_credentials', 'save', formData);

      expect((result as any).toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            intent: 'success',
            message: expect.stringContaining('webhook setup failed'),
          }),
        ])
      );
      const settings = await storage.settings.get('shopify_credentials');
      expect(settings.webhooks_active).toBe(false);
      expect(settings.webhook_error).toBe('Webhook creation failed');
    });

    it('should ignore errors when deleting old webhooks', async () => {
      mockTestCredentials.mockResolvedValue(true);
      mockDeleteWebhooks.mockRejectedValue(new Error('Old webhook not found'));
      mockCreateWebhooks.mockResolvedValue(undefined);

      const result = await lifecycle.onSettingsForm('shopify_credentials', 'save', formData);

      expect(mockCreateWebhooks).toHaveBeenCalledWith('https://example.com/webhook', expect.anything());
      expect((result as any).toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            intent: 'success',
            message: expect.stringContaining('Webhooks configured'),
          }),
        ])
      );
    });
  });

  describe('onSettingsForm - trigger_full_import', () => {
    it('should trigger import when credentials exist', async () => {
      await storage.settings.put('shopify_credentials', {
        store_url: 'test.myshopify.com',
        access_token: 'token',
      });

      const result = await lifecycle.onSettingsForm('shopify_credentials', 'trigger_full_import', {});

      expect(jobs.trigger).toHaveBeenCalledWith('import_products', {});
      expect((result as any).toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            intent: 'success',
            message: expect.stringContaining('import has been triggered'),
          }),
        ])
      );
    });

    it('should show danger toast when credentials are missing', async () => {
      const result = await lifecycle.onSettingsForm('shopify_credentials', 'trigger_full_import', {});

      expect(jobs.trigger).not.toHaveBeenCalled();
      expect((result as any).toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            intent: 'danger',
          }),
        ])
      );
    });
  });
});
