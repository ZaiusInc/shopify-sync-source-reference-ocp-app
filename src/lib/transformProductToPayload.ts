import { ShopifyProduct } from '../data/ShopifyProducts';
import { CollectionInfo } from './shopifyConverter';

/**
 * Transforms a Shopify product into an Optimizely Hub payload with nested types
 * @param product The Shopify product data
 * @returns Payload object matching the unified shopify_products schema
 */
export function transformProductToPayload(product: ShopifyProduct) {
  // Split comma-separated tags into array
  const tags = product.tags
    ? product.tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0)
    : [];

  // Transform variants
  const variants = (product.variants || []).map((v) => ({
    variant_id: v.id.toString(),
    title: v.title,
    price: parseFloat(v.price),
    compare_at_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
    sku: v.sku,
    inventory_quantity: v.inventory_quantity,
    inventory_policy: v.inventory_policy,
    barcode: v.barcode,
    created_at: v.created_at,
    updated_at: v.updated_at,
  }));

  // Transform images
  const images = (product.images || []).map((img) => ({
    image_id: img.id.toString(),
    url: img.src,
    width: img.width,
    height: img.height,
    alt_text: img.alt,
    position: img.position,
  }));

  // Transform collections from the non-enumerable _collections property
  const collectionData: CollectionInfo[] = (product as any)._collections || [];
  const collections = collectionData.map((c) => ({
    collection_id: c.collection_id,
    title: c.title,
  }));

  // Transform options
  const options = (product.options || []).map((opt) => ({
    option_id: opt.id.toString(),
    name: opt.name,
    position: opt.position,
    values: opt.values,
  }));

  return {
    shopify_product_id: product.id.toString(),
    title: product.title,
    body_html: product.body_html,
    vendor: product.vendor,
    product_type: product.product_type,
    handle: product.handle,
    published_at: product.published_at,
    created_at: product.created_at,
    updated_at: product.updated_at,
    tags,
    status: product.status,
    variants,
    images,
    collections,
    options,
  };
}
