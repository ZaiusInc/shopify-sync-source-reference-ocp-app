import { logger } from '@zaiusinc/app-sdk';
import {
  ShopifyProduct,
  ShopifyGraphQLProduct
} from '../data/ShopifyProducts';
import {
  convertGraphQLProductToRESTFormat
} from './shopifyConverter';

export interface ShopifyCredentials {
  storeUrl: string;
  accessToken: string;
}

export interface ShopifyWebhook {
  id?: number;
  address: string;
  topic: string;
  format: string;
}

const SHOPIFY_API_VERSION = '2026-01';

export class ShopifyClient {
  private graphqlEndpoint: string;
  private accessToken: string;
  private storeUrl: string;

  public constructor(credentials: ShopifyCredentials) {
    this.storeUrl = credentials.storeUrl;
    this.graphqlEndpoint = `https://${credentials.storeUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    this.accessToken = credentials.accessToken;
  }

  /**
   * Execute a GraphQL query against the Shopify Admin API
   * @param query GraphQL query string
   * @param variables Variables for the GraphQL query
   * @returns The response data
   */
  private async executeGraphQL<T>(query: string, variables?: Record<string, any>): Promise<T> {
    try {
      const response = await fetch(this.graphqlEndpoint, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
      }

      const { data, errors } = await response.json() as { data: any; errors?: any[] };

      if (errors && Array.isArray(errors) && errors.length > 0) {
        // Safely extract error messages
        const errorMessages = errors.map((e) => (typeof e === 'object' && e !== null && 'message' in e) ?
          String(e.message) : 'Unknown GraphQL error');
        throw new Error(`GraphQL error: ${errorMessages.join(', ')}`);
      }

      return data;
    } catch (error: any) {
      logger.error(`Error executing GraphQL query: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a paginated list of products using GraphQL
   * @param limit Number of products to retrieve per request
   * @param cursor Cursor for pagination
   * @returns Array of products and pagination info
   */
  public async getProducts(limit = 50, cursor?: string): Promise<{
    products: ShopifyProduct[];
    nextPageInfo?: string;
  }> {
    try {
      const query = `
        query GetProducts($first: Int!, $after: String) {
          products(first: $first, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                descriptionHtml
                vendor
                productType
                handle
                publishedAt
                createdAt
                updatedAt
                tags
                status
                variants(first: 50) {
                  edges {
                    node {
                      id
                      title
                      price
                      compareAtPrice
                      sku
                      inventoryQuantity
                      inventoryPolicy
                      barcode
                      createdAt
                      updatedAt
                    }
                  }
                }
                options {
                  id
                  name
                  position
                  values
                }
                images(first: 20) {
                  edges {
                    node {
                      id
                      url
                      width
                      height
                      altText
                    }
                  }
                }
                collections(first: 20) {
                  edges {
                    node {
                      id
                      title
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const variables = {
        first: limit,
        after: cursor || null,
      };

      const data = await this.executeGraphQL<{
        products: {
          pageInfo: {
            hasNextPage: boolean;
            endCursor: string;
          };
          edges: Array<{
            node: ShopifyGraphQLProduct;
          }>;
        };
      }>(query, variables);

      // Convert GraphQL products to REST format for compatibility
      const products = data.products.edges.map((edge) => convertGraphQLProductToRESTFormat(edge.node));

      // Get pagination info
      const nextPageInfo = data.products.pageInfo.hasNextPage ?
        data.products.pageInfo.endCursor :
        undefined;

      return {
        products,
        nextPageInfo,
      };
    } catch (error: any) {
      logger.error(`Error fetching products from Shopify: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a single product by ID using GraphQL
   * @param productId The Shopify product ID
   * @returns The product data
   */
  public async getProductById(productId: number): Promise<ShopifyProduct> {
    try {
      // Convert numeric ID to Shopify GraphQL ID format
      const gid = `gid://shopify/Product/${productId}`;
      const query = `
        query GetProduct($id: ID!) {
          product(id: $id) {
            id
            title
            descriptionHtml
            vendor
            productType
            handle
            publishedAt
            createdAt
            updatedAt
            tags
            status
            variants(first: 50) {
              edges {
                node {
                  id
                  title
                  price
                  compareAtPrice
                  sku
                  inventoryQuantity
                  inventoryPolicy
                  barcode
                  createdAt
                  updatedAt
                }
              }
            }
            options {
              id
              name
              position
              values
            }
            images(first: 20) {
              edges {
                node {
                  id
                  url
                  width
                  height
                  altText
                }
              }
            }
            collections(first: 20) {
              edges {
                node {
                  id
                  title
                }
              }
            }
          }
        }
      `;

      const variables = {
        id: gid,
      };

      const data = await this.executeGraphQL<{
        product: ShopifyGraphQLProduct;
      }>(query, variables);

      if (!data.product) {
        throw new Error(`Product not found: ${productId}`);
      }

      // Convert GraphQL product to REST format
      return convertGraphQLProductToRESTFormat(data.product);
    } catch (error: any) {
      logger.error(`Error fetching product ${productId} from Shopify: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all products in a collection by collection ID using GraphQL
   * @param collectionId The Shopify collection ID
   * @returns Array of products in the collection
   */
  public async getProductsByCollectionId(collectionId: number): Promise<ShopifyProduct[]> {
    try {
      const gid = `gid://shopify/Collection/${collectionId}`;
      const query = `
        query GetCollectionProducts($id: ID!, $first: Int!, $after: String) {
          collection(id: $id) {
            products(first: $first, after: $after) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  title
                  descriptionHtml
                  vendor
                  productType
                  handle
                  publishedAt
                  createdAt
                  updatedAt
                  tags
                  status
                  variants(first: 50) {
                    edges {
                      node {
                        id
                        title
                        price
                        compareAtPrice
                        sku
                        inventoryQuantity
                        inventoryPolicy
                        barcode
                        createdAt
                        updatedAt
                      }
                    }
                  }
                  options {
                    id
                    name
                    position
                    values
                  }
                  images(first: 20) {
                    edges {
                      node {
                        id
                        url
                        width
                        height
                        altText
                      }
                    }
                  }
                  collections(first: 20) {
                    edges {
                      node {
                        id
                        title
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      let allProducts: ShopifyProduct[] = [];
      let cursor: string | null = null;

      do {
        const data = await this.executeGraphQL<{
          collection: {
            products: {
              pageInfo: {
                hasNextPage: boolean;
                endCursor: string;
              };
              edges: Array<{
                node: ShopifyGraphQLProduct;
              }>;
            };
          } | null;
        }>(query, { id: gid, first: 50, after: cursor });

        if (!data.collection) {
          logger.warn(`Collection not found: ${collectionId}`);
          return [];
        }

        const edges: Array<{node: ShopifyGraphQLProduct}> = data.collection.products.edges;
        const products = edges.map(
          (edge) => convertGraphQLProductToRESTFormat(edge.node)
        );
        allProducts = [...allProducts, ...products];

        cursor = data.collection.products.pageInfo.hasNextPage
          ? data.collection.products.pageInfo.endCursor
          : null;
      } while (cursor);

      return allProducts;
    } catch (error: any) {
      logger.error(`Error fetching products for collection ${collectionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a webhook in Shopify
   * @param topic The webhook topic (e.g., products/create)
   * @param address The URL to send webhook data to
   * @returns The created webhook data
   */
  public async createWebhook(topic: string, address: string): Promise<any> {
    try {
      const restEndpoint = `https://${this.storeUrl}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`;

      const response = await fetch(restEndpoint, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhook: {
            topic,
            address,
            format: 'json',
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as any;
      logger.info(`Created webhook for ${topic} pointing to ${address}`);
      return data.webhook;
    } catch (error: any) {
      logger.error(`Error creating webhook: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a webhook in Shopify
   * @param webhookId The ID of the webhook to delete
   * @returns Success status
   */
  public async deleteWebhook(webhookId: number): Promise<boolean> {
    try {
      const restEndpoint = `https://${this.storeUrl}/admin/api/${SHOPIFY_API_VERSION}/webhooks/${webhookId}.json`;

      const response = await fetch(restEndpoint, {
        method: 'DELETE',
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
        },
      });

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
      }

      logger.info(`Deleted webhook with ID ${webhookId}`);
      return true;
    } catch (error: any) {
      logger.error(`Error deleting webhook: ${error.message}`);
      return false;
    }
  }

  /**
   * Get all webhooks configured in the Shopify store
   * @returns Array of webhooks
   */
  public async getWebhooks(): Promise<ShopifyWebhook[]> {
    try {
      const restEndpoint = `https://${this.storeUrl}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`;

      const response = await fetch(restEndpoint, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
        },
      });

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.webhooks;
    } catch (error: any) {
      logger.error(`Error fetching webhooks: ${error.message}`);
      return [];
    }
  }

  /**
   * Test the Shopify credentials by making a simple API call
   * @returns True if credentials are valid
   */
  public async testCredentials(): Promise<boolean> {
    try {
      const restEndpoint = `https://${this.storeUrl}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`;
      const response = await fetch(restEndpoint, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Sets up all required webhooks for product synchronization
   * @returns Array of created webhook IDs
   */
  public async setupProductWebhooks(webhookUrl: string): Promise<number[]> {
    try {
      if (!webhookUrl) {
        throw new Error('Could not get webhook URL for product_webhook function');
      }

      logger.info(`Setting up webhooks to point to: ${webhookUrl}`);

      // Define the product-related topics we want to listen for
      const topics = [
        'products/create',
        'products/update',
        'products/delete'
      ];

      // Create all webhooks and collect their IDs
      const webhookPromises = topics.map((topic) => this.createWebhook(topic, webhookUrl));
      const webhooks = await Promise.all(webhookPromises);

      return webhooks.map((webhook) => webhook.id);
    } catch (error: any) {
      logger.error(`Error setting up product webhooks: ${error.message}`);
      throw error;
    }
  }
}
