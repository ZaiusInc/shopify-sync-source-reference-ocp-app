import {
  ShopifyGraphQLProduct,
  ShopifyProduct,
  ShopifyVariant,
  ShopifyOption,
  ShopifyImage
} from '../data/ShopifyProducts';

export interface CollectionInfo {
  collection_id: string;
  title: string;
}

/**
 * Convert a Shopify GraphQL product to a REST-compatible product format
 * @param graphQLProduct The GraphQL product response
 * @returns A product object compatible with the REST API format
 */
export function convertGraphQLProductToRESTFormat(graphQLProduct: ShopifyGraphQLProduct): ShopifyProduct {
  // Extract the numeric ID from the GraphQL ID (gid://shopify/Product/12345 -> 12345)
  const idMatch = graphQLProduct.id.match(/\/Product\/(\d+)$/);
  const numericId = idMatch ? parseInt(idMatch[1], 10) : 0;

  // Convert variants
  const variants: ShopifyVariant[] = graphQLProduct.variants.edges.map((edge) => {
    const variantIdMatch = edge.node.id.match(/\/ProductVariant\/(\d+)$/);
    const variantNumericId = variantIdMatch ? parseInt(variantIdMatch[1], 10) : 0;

    return {
      id: variantNumericId,
      shopify_product_id: numericId,
      title: edge.node.title,
      price: edge.node.price,
      compare_at_price: edge.node.compareAtPrice || null,
      sku: edge.node.sku,
      inventory_quantity: edge.node.inventoryQuantity,
      inventory_policy: edge.node.inventoryPolicy,
      barcode: edge.node.barcode,
      created_at: edge.node.createdAt,
      updated_at: edge.node.updatedAt
    };
  });

  // Convert options
  const options: ShopifyOption[] = graphQLProduct.options.map((option) => {
    const optionIdMatch = option.id.match(/\/ProductOption\/(\d+)$/);
    const optionNumericId = optionIdMatch ? parseInt(optionIdMatch[1], 10) : 0;

    return {
      id: optionNumericId,
      shopify_product_id: numericId,
      name: option.name,
      position: option.position,
      values: option.values
    };
  });

  // Convert images
  const images: ShopifyImage[] = graphQLProduct.images.edges.map((edge, index) => {
    const imageIdMatch = edge.node.id.match(/\/ProductImage\/(\d+)$/);
    const imageNumericId = imageIdMatch ? parseInt(imageIdMatch[1], 10) : 0;

    return {
      id: imageNumericId,
      shopify_product_id: numericId,
      position: index + 1,
      src: edge.node.url,
      width: edge.node.width,
      height: edge.node.height,
      alt: edge.node.altText
    };
  });

  // Convert tags from array to string
  const tagsString = graphQLProduct.tags.join(', ');

  // Extract collection data (id + title)
  const collections: CollectionInfo[] = graphQLProduct.collections.edges.map((edge) => {
    const collectionIdMatch = edge.node.id.match(/\/Collection\/(\d+)$/);
    const collectionId = collectionIdMatch ? collectionIdMatch[1] : '0';
    return {
      collection_id: collectionId,
      title: edge.node.title
    };
  }).filter((c) => c.collection_id !== '0');

  // Return the converted product
  const convertedProduct = {
    id: numericId,
    title: graphQLProduct.title,
    body_html: graphQLProduct.descriptionHtml,
    vendor: graphQLProduct.vendor,
    product_type: graphQLProduct.productType,
    handle: graphQLProduct.handle,
    published_at: graphQLProduct.publishedAt || '',
    created_at: graphQLProduct.createdAt,
    updated_at: graphQLProduct.updatedAt,
    tags: tagsString,
    status: graphQLProduct.status,
    variants,
    options,
    images,
    image: images.length > 0 ? images[0] : null
  };
  // Add collections as a non-enumerable property to avoid polluting the REST format
  // but make it available to our transformer
  Object.defineProperty(convertedProduct, '_collections', {
    value: collections,
    enumerable: false,
    writable: false
  });

  return convertedProduct;
}
