import { Function, Request, Response, sources, storage, logger } from '@zaiusinc/app-sdk';
import { ShopifyProduct } from '../data/ShopifyProducts';
import { ShopifyClient } from '../lib/ShopifyClient';
import { transformProductToPayload } from '../lib/transformProductToPayload';

export class ProductWebhook extends Function {
  public constructor(request: Request) {
    super(request);
  }

  public async perform(): Promise<Response> {
    try {
      logger.info('[ProductWebhook] Processing incoming Shopify product');

      // Get the product data from the request body
      const shopifyProduct = this.request.bodyJSON as ShopifyProduct;

      if (!shopifyProduct || !shopifyProduct.id) {
        logger.error('Invalid product data received');
        return new Response(400, 'Invalid product data. Missing required fields.');
      }

      const topic = this.request.headers.get('x-shopify-topic');

      // Handle collection updates — re-fetch all products in the collection and emit them
      if (topic === 'collections/update') {
        const collectionId = shopifyProduct.id;
        logger.info(`[ProductWebhook] Processing collection update for collection ${collectionId}`);

        const settings: Record<string, string> = await storage.settings.get('shopify_credentials');
        if (!settings?.store_url || !settings?.access_token) {
          logger.error('[ProductWebhook] Missing credentials for collection update');
          return new Response(500, {success: false, error: 'Missing Shopify credentials'});
        }

        const shopifyClient = new ShopifyClient({
          storeUrl: settings.store_url,
          accessToken: settings.access_token
        });
        const products = await shopifyClient.getProductsByCollectionId(collectionId);

        for (const product of products) {
          const productPayload = transformProductToPayload(product);
          await sources.emit('Product', {data: productPayload as any});
        }

        logger.info(`[ProductWebhook] Emitted ${products.length} products from collection ${collectionId}`);
        return new Response(200, {
          success: true,
          message: `Processed collection update, emitted ${products.length} products`,
          collection_id: collectionId
        });
      }

      // Handle product deletions — product no longer exists in Shopify, so emit with _isDeleted flag
      if (topic === 'products/delete') {
        logger.info(`[ProductWebhook] Processing product deletion for product ${shopifyProduct.id}`);
        await sources.emit('Product', {data: {shopify_product_id: shopifyProduct.id.toString(), _isDeleted: true}});
        return new Response(200, {
          success: true,
          message: 'Successfully processed product deletion',
          shopify_product_id: shopifyProduct.id
        });
      }

      // Re-fetch product via GraphQL to include collection data not present in webhook payloads
      let productForTransform: ShopifyProduct = shopifyProduct;
      try {
        const settings: Record<string, string> = await storage.settings.get('shopify_credentials');
        if (settings?.store_url && settings?.access_token) {
          const shopifyClient = new ShopifyClient({
            storeUrl: settings.store_url,
            accessToken: settings.access_token
          });
          productForTransform = await shopifyClient.getProductById(shopifyProduct.id);
          logger.info(`[ProductWebhook] Re-fetched product ${shopifyProduct.id} with collection data`);
        } else {
          logger.warn('[ProductWebhook] Missing credentials, using raw webhook data');
        }
      } catch (error: any) {
        const pid = shopifyProduct.id;
        logger.warn(`[ProductWebhook] Failed to re-fetch product ${pid}, using raw webhook data: ${error.message}`);
      }

      // Transform the product data to Hub object format
      const payload = transformProductToPayload(productForTransform);

      logger.debug('Emitting transformed product payload', payload);
      await sources.emit('Product', {data: payload as any});

      return new Response(200, {
        success: true,
        message: `Successfully processed product: ${shopifyProduct.title}`,
        shopify_product_id: shopifyProduct.id
      });
    } catch (error: any) {
      logger.error(`Error processing Shopify product: ${error.message}`);
      return new Response(500, {
        success: false,
        error: `An error occurred while processing the product: ${error.message}`
      });
    }
  }
}
