import { describe, it, expect } from 'vitest';
import { transformProductToPayload } from './transformProductToPayload';
import { ShopifyProduct } from '../data/ShopifyProducts';

describe('transformProductToPayload', () => {
  const mockShopifyProduct: ShopifyProduct = {
    id: 123456789,
    title: 'Test Product',
    body_html: '<p>Test product description</p>',
    vendor: 'Test Vendor',
    product_type: 'Test Type',
    handle: 'test-product',
    published_at: '2023-01-01T00:00:00Z',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-02T00:00:00Z',
    tags: 'tag1, tag2',
    status: 'active',
    variants: [
      {
        id: 111,
        shopify_product_id: 123456789,
        title: 'Default Title',
        price: '19.99',
        compare_at_price: '29.99',
        sku: 'SKU123',
        inventory_quantity: 10,
        inventory_policy: 'deny',
        barcode: '12345',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
      },
    ],
    options: [
      {
        id: 222,
        shopify_product_id: 123456789,
        name: 'Title',
        position: 1,
        values: ['Default Title'],
      },
    ],
    images: [
      {
        id: 333,
        shopify_product_id: 123456789,
        position: 1,
        src: 'https://example.com/image.jpg',
        width: 800,
        height: 600,
        alt: 'Test image',
      },
    ],
    image: {
      id: 333,
      shopify_product_id: 123456789,
      position: 1,
      src: 'https://example.com/image.jpg',
      width: 800,
      height: 600,
      alt: 'Test image',
    },
  };

  function withCollections(
    product: ShopifyProduct,
    collections: Array<{collection_id: string; title: string}>
  ): ShopifyProduct {
    const p = {...product};
    Object.defineProperty(p, '_collections', {
      value: collections,
      enumerable: false,
      writable: false,
    });
    return p;
  }

  it('transforms a Shopify product into a payload with nested types', () => {
    const product = withCollections(mockShopifyProduct, [
      {collection_id: '111', title: 'Collection A'},
      {collection_id: '222', title: 'Collection B'},
    ]);
    const payload = transformProductToPayload(product);

    expect(payload).toEqual({
      shopify_product_id: '123456789',
      title: 'Test Product',
      body_html: '<p>Test product description</p>',
      vendor: 'Test Vendor',
      product_type: 'Test Type',
      handle: 'test-product',
      published_at: '2023-01-01T00:00:00Z',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-02T00:00:00Z',
      tags: ['tag1', 'tag2'],
      status: 'active',
      variants: [
        {
          variant_id: '111',
          title: 'Default Title',
          price: 19.99,
          compare_at_price: 29.99,
          sku: 'SKU123',
          inventory_quantity: 10,
          inventory_policy: 'deny',
          barcode: '12345',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        },
      ],
      images: [
        {
          image_id: '333',
          url: 'https://example.com/image.jpg',
          width: 800,
          height: 600,
          alt_text: 'Test image',
          position: 1,
        },
      ],
      collections: [
        {collection_id: '111', title: 'Collection A'},
        {collection_id: '222', title: 'Collection B'},
      ],
      options: [
        {
          option_id: '222',
          name: 'Title',
          position: 1,
          values: ['Default Title'],
        },
      ],
    });
  });

  it('splits tags into an array', () => {
    const payload = transformProductToPayload(mockShopifyProduct);
    expect(payload.tags).toEqual(['tag1', 'tag2']);
  });

  it('handles empty tags', () => {
    const product = {...mockShopifyProduct, tags: ''};
    const payload = transformProductToPayload(product);
    expect(payload.tags).toEqual([]);
  });

  it('handles products with no variants', () => {
    const product = {...mockShopifyProduct, variants: []};
    const payload = transformProductToPayload(product);
    expect(payload.variants).toEqual([]);
  });

  it('handles products with no images', () => {
    const product = {...mockShopifyProduct, images: [], image: null};
    const payload = transformProductToPayload(product);
    expect(payload.images).toEqual([]);
  });

  it('handles products with no collections', () => {
    const payload = transformProductToPayload(mockShopifyProduct);
    expect(payload.collections).toEqual([]);
  });

  it('handles products with no options', () => {
    const product = {...mockShopifyProduct, options: []};
    const payload = transformProductToPayload(product);
    expect(payload.options).toEqual([]);
  });

  it('handles variants with null compare_at_price', () => {
    const product = {
      ...mockShopifyProduct,
      variants: [
        {...mockShopifyProduct.variants[0], compare_at_price: null},
      ],
    };
    const payload = transformProductToPayload(product);
    expect(payload.variants[0].compare_at_price).toBeNull();
  });
});
