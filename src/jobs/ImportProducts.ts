import {
  Job,
  JobStatus,
  logger,
  notifications,
  sources,
  storage,
  ValueHash,
} from '@zaiusinc/app-sdk';
import { ShopifyClient } from '../lib/ShopifyClient';
import { transformProductToPayload } from '../lib/transformProductToPayload';

interface ImportJobStatus extends JobStatus {
  state: {
    currentPage: string | null;
    processedCount: number;
    failedProducts: Array<{id: number; error: string}>;
    retries: number;
  };
}

/**
 * Historical import job to sync all products from Shopify
 */
export class ImportProducts extends Job {
  private shopifyClient!: ShopifyClient;
  private includeArchived!: boolean;
  private includeDrafts!: boolean;

  /**
   * Prepares to run the import job by setting up the Shopify client with credentials from settings
   * @param params Job parameters
   * @param status Previous job status if resuming
   */
  public async prepare(
    params: ValueHash,
    status?: ImportJobStatus
  ): Promise<ImportJobStatus> {
    logger.info('Preparing Shopify product import job');

    // Get settings
    const settings: Record<string, string> = await storage.settings.get('shopify_credentials');
    const syncOptions: Record<string, string | number | boolean> = await storage.settings.get('sync_options');

    // Check if Shopify is configured
    if (!settings.store_url || !settings.access_token) {
      logger.error('Shopify credentials are not fully configured');

      await notifications.error(
        'Shopify Sync',
        'Import Failed',
        'Shopify credentials are not fully configured. Please complete the Shopify Credentials section in app settings.'
      );

      return {
        state: {
          currentPage: null,
          processedCount: 0,
          failedProducts: [],
          retries: 0
        },
        complete: true
      };
    }

    // Create Shopify client
    this.shopifyClient = new ShopifyClient({
      storeUrl: settings.store_url,
      accessToken: settings.access_token
    });

    // Get sync options
    this.includeArchived = syncOptions.include_archived === true;
    this.includeDrafts = syncOptions.include_drafts === true;

    logger.info(
      `Shopify sync config - include archived: ${this.includeArchived}, ` +
      `include drafts: ${this.includeDrafts}`
    );

    // If we're resuming, use the existing status
    if (status) {
      logger.info(`Resuming previous import job. Processed so far: ${status.state.processedCount}`);
      return status;
    }

    // Start a new import job
    return {
      state: {
        currentPage: null,
        processedCount: 0,
        failedProducts: [],
        retries: 0
      },
      complete: false
    };
  }

  /**
   * Performs the import job, processing one batch of products at a time
   * @param status Current job status
   */
  public async perform(
    status: ImportJobStatus
  ): Promise<ImportJobStatus> {
    const state = status.state;

    try {
      // Get a batch of products from Shopify
      logger.info(`Fetching products from Shopify${state.currentPage ? ' (continued)' : ''}`);

      const result = await this.shopifyClient.getProducts(
        50,
        state.currentPage || undefined
      );

      // Filter products based on status if needed
      let products = result.products;
      if (!this.includeArchived || !this.includeDrafts) {
        products = products.filter((product) => {
          if (!this.includeArchived && product.status === 'archived') {
            return false;
          }
          if (!this.includeDrafts && product.status === 'draft') {
            return false;
          }
          return true;
        });
      }

      // Process each product
      for (const product of products) {
        logger.debug(`Processing product: ${product.id} - ${product.title}`);
        const productPayload = transformProductToPayload(product);
        await sources.emit('Product', {data: productPayload as any});
      }

      state.processedCount += products.length;
      logger.info(`Processed ${state.processedCount} products so far`);

      // Update paging information for the next iteration
      state.currentPage = result.nextPageInfo || null;

      // If we have no more pages, we're done
      if (!state.currentPage) {
        logger.info(`Completed importing ${state.processedCount} products from Shopify`);
        await notifications.success(
          'Shopify Sync',
          'Import Completed Successfully',
          `Imported ${state.processedCount} products from Shopify to Optimizely Hub.`
        );

        status.complete = true;
      }

      return status;
    } catch (error: any) {
      // Handle errors with retries
      logger.error(`Shopify import error: ${error.message}`);

      if (state.retries >= 5) {
        // Max retries reached, notify user and stop
        await notifications.error(
          'Shopify Sync',
          'Import Failed',
          `Error importing products from Shopify: ${error.message}. Maximum retries exceeded.`
        );

        status.complete = true;
      } else {
        // Increment retry counter and wait before trying again
        state.retries++;
        logger.info(`Retry ${state.retries}/5 after error. Waiting before retry...`);

        // Wait for 5 seconds per retry (increasing backoff)
        await new Promise((resolve) => setTimeout(resolve, state.retries * 5000));
      }

      return status;
    }
  }
}
