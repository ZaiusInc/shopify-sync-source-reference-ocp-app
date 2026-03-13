import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

vi.mock('../lib/transformProductToPayload', () => ({
  transformProductToPayload: vi.fn(),
}));

vi.mock('../lib/ShopifyClient');

vi.mock('@zaiusinc/app-sdk', async () => {
  const actual = await vi.importActual('@zaiusinc/app-sdk');
  return {
    ...actual,
    sources: {
      emit: vi.fn(),
    },
  };
});

import { ImportProducts } from './ImportProducts';
import { transformProductToPayload } from '../lib/transformProductToPayload';
import { ShopifyClient } from '../lib/ShopifyClient';
import { resetLocalStores, sources, storage } from '@zaiusinc/app-sdk';

describe('ImportProducts', () => {
  let job: ImportProducts;

  beforeEach(() => {
    vi.clearAllMocks();
    job = new ImportProducts({} as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
    resetLocalStores();
  });

  describe('prepare', () => {
    it('returns complete when shopify_credentials is not defined', async () => {
      await storage.settings.delete('shopify_credentials');
      const res = await job.prepare({});
      expect(res.complete).toBeTruthy();
    });

    it('creates shopify client with credentials from settings', async () => {
      await storage.settings.put('shopify_credentials', {
        store_url: 'https://example.myshopify.com',
        access_token: 'test_token'
      });

      await job.prepare({});

      expect(ShopifyClient).toHaveBeenCalledWith({
        accessToken: 'test_token',
        storeUrl: 'https://example.myshopify.com'
      });
    });

    it('returns default state if no status is provided', async () => {
      await storage.settings.put('shopify_credentials', {
        store_url: 'https://example.myshopify.com',
        access_token: 'test_token'
      });

      const res = await job.prepare({});
      expect(res).toEqual({
        state: {
          currentPage: null,
          processedCount: 0,
          failedProducts: [],
          retries: 0
        },
        complete: false
      });
    });

    it('returns the same status if provided', async () => {
      await storage.settings.put('shopify_credentials', {
        store_url: 'https://example.myshopify.com',
        access_token: 'test_token'
      });

      const status = {
        state: {
          currentPage: 'test_page',
          processedCount: 10,
          failedProducts: [],
          retries: 0
        },
        complete: false
      };
      const res = await job.prepare({}, status as any);
      expect(res).toEqual(status);
    });
  });

  describe('perform', () => {
    let status: any;

    beforeEach(async () => {
      status = {
        state: {
          currentPage: 123,
          processedCount: 0,
          failedProducts: [],
          retries: 0
        },
        complete: false
      };

      await storage.settings.put('shopify_credentials', {
        store_url: 'https://example.myshopify.com',
        access_token: 'test_token'
      });

      await job.prepare({});

      vi.spyOn(ShopifyClient.prototype, 'getProducts').mockResolvedValue({ products: [] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls shopifyClient.getProducts with batch size 50', async () => {
      await job.perform(status);
      expect(ShopifyClient.prototype.getProducts).toHaveBeenCalledTimes(1);
      expect(ShopifyClient.prototype.getProducts).toHaveBeenCalledWith(50, 123);
    });

    it('transforms and emits each product via sources.emit', async () => {
      const mockProducts = [{id: 1, name: 'product1'}, {id: 2, name: 'product2'}] as any;
      vi.spyOn(ShopifyClient.prototype, 'getProducts').mockResolvedValue({ products: mockProducts });

      await job.perform(status);

      expect(transformProductToPayload).toHaveBeenCalledTimes(2);
      expect(transformProductToPayload).toHaveBeenCalledWith(mockProducts[0]);
      expect(transformProductToPayload).toHaveBeenCalledWith(mockProducts[1]);
      expect(sources.emit).toHaveBeenCalledTimes(2);
      expect(sources.emit).toHaveBeenCalledWith('Product', {data: transformProductToPayload(mockProducts[0])});
      expect(sources.emit).toHaveBeenCalledWith('Product', {data: transformProductToPayload(mockProducts[1])});
    });

    it('should include archived products if configured', async () => {
      await storage.settings.put('sync_options', {include_archived: true, include_drafts: true});
      await job.prepare({});

      vi.spyOn(ShopifyClient.prototype, 'getProducts').mockResolvedValue({ products: [] });

      const mockProducts = [{id: 1, status: 'archived'}, {id: 2, status: 'draft'}] as any;
      vi.spyOn(ShopifyClient.prototype, 'getProducts').mockResolvedValue({ products: mockProducts });

      await job.perform(status);
      expect(transformProductToPayload).toHaveBeenCalledTimes(2);
    });

    it('should not include archived or draft products if not configured', async () => {
      await storage.settings.put('sync_options', {include_archived: false, include_drafts: false});
      await job.prepare({});

      vi.spyOn(ShopifyClient.prototype, 'getProducts').mockResolvedValue({ products: [] });

      const mockProducts = [{id: 1, status: 'archived'}, {id: 2, status: 'draft'}] as any;
      vi.spyOn(ShopifyClient.prototype, 'getProducts').mockResolvedValue({ products: mockProducts });

      await job.perform(status);
      expect(transformProductToPayload).not.toHaveBeenCalled();
    });

    it('returns complete when no more pages', async () => {
      const result = await job.perform(status);
      expect(result.complete).toBeTruthy();
    });

    it('should retry when there is an error', async () => {
      vi.useFakeTimers();
      vi.spyOn(ShopifyClient.prototype, 'getProducts').mockRejectedValue(new Error('Test error'));
      const performPromise = job.perform(status);

      await Promise.resolve();
      vi.advanceTimersByTime(5000);

      const result = await performPromise;
      expect(result.state.retries).toBe(1);
      expect(result.complete).toBeFalsy();
    });

    it('should not retry if retries exceed limit', async () => {
      status.state.retries = 5;
      vi.spyOn(ShopifyClient.prototype, 'getProducts').mockRejectedValue(new Error('Test error'));
      const performPromise = job.perform(status);

      const result = await performPromise;
      expect(result.state.retries).toBe(5);
      expect(result.complete).toBeTruthy();
    });
  });
});
