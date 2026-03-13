/**
 * Interface representing a Shopify product from GraphQL API
 */
export interface ShopifyGraphQLProduct {
  id: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  handle: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  status: string;
  variants: {
    edges: Array<{
      node: ShopifyGraphQLVariant;
    }>;
  };
  options: ShopifyGraphQLOption[];
  images: {
    edges: Array<{
      node: ShopifyGraphQLImage;
    }>;
  };
  collections: {
    edges: Array<{
      node: {
        id: string;
        title: string;
      };
    }>;
  };
}

/**
 * Interface representing a Shopify product variant from GraphQL API
 */
export interface ShopifyGraphQLVariant {
  id: string;
  title: string;
  price: string; // Updated to scalar type in the latest API
  compareAtPrice: string | null; // Updated to scalar type in the latest API
  sku: string;
  inventoryQuantity: number;
  inventoryPolicy: string;
  barcode: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Interface representing a Shopify product option from GraphQL API
 */
export interface ShopifyGraphQLOption {
  id: string;
  name: string;
  position: number;
  values: string[];
}

/**
 * Interface representing a Shopify product image from GraphQL API
 */
export interface ShopifyGraphQLImage {
  id: string;
  url: string;
  width: number;
  height: number;
  altText: string | null;
}

// Keep REST API interfaces for backward compatibility
/**
 * Interface representing a Shopify product from REST API
 */
export interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  handle: string;
  published_at: string;
  created_at: string;
  updated_at: string;
  tags: string;
  status: string;
  variants: ShopifyVariant[];
  options: ShopifyOption[];
  images: ShopifyImage[];
  image: ShopifyImage | null;
}

/**
 * Interface representing a Shopify product variant from REST API
 */
export interface ShopifyVariant {
  id: number;
  shopify_product_id: number;
  title: string;
  price: string;
  compare_at_price: string | null;
  sku: string;
  inventory_quantity: number;
  inventory_policy: string;
  barcode: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Interface representing a Shopify product option from REST API
 */
export interface ShopifyOption {
  id: number;
  shopify_product_id: number;
  name: string;
  position: number;
  values: string[];
}

/**
 * Interface representing a Shopify product image from REST API
 */
export interface ShopifyImage {
  id: number;
  shopify_product_id: number;
  position: number;
  src: string;
  width: number;
  height: number;
  alt: string | null;
}
