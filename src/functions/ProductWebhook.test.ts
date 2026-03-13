import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

const mockGetProductById = vi.fn();
const mockGetProductsByCollectionId = vi.fn();

vi.mock('../lib/transformProductToPayload', () => ({
  transformProductToPayload: vi.fn(),
}));

vi.mock('../lib/ShopifyClient', () => ({
  ShopifyClient: function ShopifyClient() {
    return {
      getProductById: mockGetProductById,
      getProductsByCollectionId: mockGetProductsByCollectionId,
    };
  },
}));

vi.mock('@zaiusinc/app-sdk', async () => {
  const actual = await vi.importActual('@zaiusinc/app-sdk');
  return {
    ...actual,
    sources: {
      emit: vi.fn(),
    },
    storage: {
      settings: {
        get: vi.fn(),
      },
    },
  };
});

import { transformProductToPayload } from '../lib/transformProductToPayload';
import { ProductWebhook } from './ProductWebhook';
import { resetLocalStores, sources, storage } from '@zaiusinc/app-sdk';

const mockCredentials = {
  store_url: 'test-store.myshopify.com',
  access_token: 'shpat_test123'
};

const mockHeaders = (topic?: string) => ({get: vi.fn().mockReturnValue(topic ?? null)});

describe('ProductWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (storage.settings.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredentials);
    mockGetProductById.mockResolvedValue({id: 111, title: 'Test Product', _collections: ['col1']});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetLocalStores();
  });

  it('should emit _isDeleted when topic is products/delete', async () => {
    const mockRequest = {
      method: 'POST',
      headers: mockHeaders('products/delete'),
      bodyJSON: {id: 111}
    } as any;

    const webhook = new ProductWebhook(mockRequest);
    const response = await webhook.perform();

    expect(response.status).toBe(200);
    expect(sources.emit).toHaveBeenCalledWith('Product', {data: {shopify_product_id: '111', _isDeleted: true}});
    expect(mockGetProductById).not.toHaveBeenCalled();
    expect(transformProductToPayload).not.toHaveBeenCalled();
  });

  it('should fetch and emit all products in collection when topic is collections/update', async () => {
    const product1 = {id: 111, title: 'Product 1', _collections: ['col1']};
    const product2 = {id: 222, title: 'Product 2', _collections: ['col1']};
    mockGetProductsByCollectionId.mockResolvedValue([product1, product2]);
    (transformProductToPayload as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({shopify_product_id: '111'})
      .mockReturnValueOnce({shopify_product_id: '222'});

    const mockRequest = {
      method: 'POST',
      headers: mockHeaders('collections/update'),
      bodyJSON: {id: 999}
    } as any;

    const webhook = new ProductWebhook(mockRequest);
    const response = await webhook.perform();

    expect(response.status).toBe(200);
    expect(mockGetProductsByCollectionId).toHaveBeenCalledWith(999);
    expect(transformProductToPayload).toHaveBeenCalledTimes(2);
    expect(sources.emit).toHaveBeenCalledTimes(2);
  });

  it('should return 200 with no emissions for empty collection update', async () => {
    mockGetProductsByCollectionId.mockResolvedValue([]);

    const mockRequest = {
      method: 'POST',
      headers: mockHeaders('collections/update'),
      bodyJSON: {id: 999}
    } as any;

    const webhook = new ProductWebhook(mockRequest);
    const response = await webhook.perform();

    expect(response.status).toBe(200);
    expect(sources.emit).not.toHaveBeenCalled();
  });

  it('should return 500 for collections/update with missing credentials', async () => {
    (storage.settings.get as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const mockRequest = {
      method: 'POST',
      headers: mockHeaders('collections/update'),
      bodyJSON: {id: 999}
    } as any;

    const webhook = new ProductWebhook(mockRequest);
    const response = await webhook.perform();

    expect(response.status).toBe(500);
    expect(sources.emit).not.toHaveBeenCalled();
  });

  it('return 400 if product data is invalid', async () => {
    const mockRequest = {
      method: 'POST',
      bodyJSON: undefined
    } as any;
    const webhook = new ProductWebhook(mockRequest);
    const response = await webhook.perform();

    expect(response.status).toBe(400);
  });

  it('should return 400 when product id is not provided', async () => {
    const mockRequest = {
      method: 'POST',
      bodyJSON: {
        id: undefined,
        title: 'Test Product'
      }
    } as any;

    const webhook = new ProductWebhook(mockRequest);
    const response = await webhook.perform();

    expect(response.status).toBe(400);
  });

  it('should re-fetch product and pass enriched data to transformer', async () => {
    const enrichedProduct = {id: 111, title: 'Test Product', _collections: ['col1']};
    mockGetProductById.mockResolvedValue(enrichedProduct);

    const mockRequest = {
      method: 'POST',
      headers: mockHeaders(),
      bodyJSON: {
        id: 111,
        title: 'Test Product'
      }
    } as any;

    const webhook = new ProductWebhook(mockRequest);
    await webhook.perform();

    expect(mockGetProductById).toHaveBeenCalledWith(111);
    expect(transformProductToPayload).toHaveBeenCalledTimes(1);
    expect(transformProductToPayload).toHaveBeenCalledWith(enrichedProduct);
  });

  it('should fall back to raw webhook data when re-fetch fails', async () => {
    mockGetProductById.mockRejectedValue(new Error('Product not found'));

    const mockRequest = {
      method: 'POST',
      headers: mockHeaders(),
      bodyJSON: {
        id: 111,
        title: 'Test Product'
      }
    } as any;

    const webhook = new ProductWebhook(mockRequest);
    const response = await webhook.perform();

    expect(response.status).toBe(200);
    expect(transformProductToPayload).toHaveBeenCalledWith({id: 111, title: 'Test Product'});
  });

  it('should fall back to raw webhook data when credentials are missing', async () => {
    (storage.settings.get as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const mockRequest = {
      method: 'POST',
      headers: mockHeaders(),
      bodyJSON: {
        id: 111,
        title: 'Test Product'
      }
    } as any;

    const webhook = new ProductWebhook(mockRequest);
    const response = await webhook.perform();

    expect(response.status).toBe(200);
    expect(mockGetProductById).not.toHaveBeenCalled();
    expect(transformProductToPayload).toHaveBeenCalledWith({id: 111, title: 'Test Product'});
  });

  it('should emit transformed product payload via sources.emit', async () => {
    const mockRequest = {
      method: 'POST',
      headers: mockHeaders(),
      bodyJSON: {
        id: 111,
        title: 'Test Product'
      }
    } as any;

    const webhook = new ProductWebhook(mockRequest);
    await webhook.perform();

    expect(sources.emit).toHaveBeenCalledTimes(1);
    expect(sources.emit).toHaveBeenCalledWith('Product', {data: transformProductToPayload(mockRequest.bodyJSON)});
  });

  it('should return 200 on successful processing', async () => {
    const mockRequest = {
      method: 'POST',
      headers: mockHeaders(),
      bodyJSON: {
        id: 111,
        title: 'Test Product'
      }
    } as any;

    const webhook = new ProductWebhook(mockRequest);
    const response = await webhook.perform();

    expect(response.status).toBe(200);
    const jsonResponse = {
      success: true,
      message: 'Successfully processed product: Test Product',
      shopify_product_id: 111
    };
    expect(response.bodyAsU8Array).toEqual(new TextEncoder().encode(JSON.stringify(jsonResponse)));
  });

  it('should return 500 on error', async () => {
    const mockRequest = {
      method: 'POST',
      headers: mockHeaders(),
      bodyJSON: {
        id: 111,
        title: 'Test Product'
      }
    } as any;

    (sources.emit as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Test error'));

    const webhook = new ProductWebhook(mockRequest);
    const response = await webhook.perform();

    expect(response.status).toBe(500);
    expect(response.bodyAsU8Array).toEqual(new TextEncoder().encode(JSON.stringify({
      success: false,
      error: 'An error occurred while processing the product: Test error'
    })));
  });
});
