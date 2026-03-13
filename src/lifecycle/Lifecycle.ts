import {
  Lifecycle as AppLifecycle,
  AuthorizationGrantResult,
  functions,
  jobs,
  LifecycleResult,
  LifecycleSettingsResult,
  logger,
  Request,
  storage, SubmittedFormData
} from '@zaiusinc/app-sdk';
import { ShopifyClient } from '../lib/ShopifyClient';
import { ShopifyWebhookManager } from '../lib/ShopifyWebhookManager';

export class Lifecycle extends AppLifecycle {
  public async onInstall(): Promise<LifecycleResult> {
    try {
      logger.info('Performing Install');
      // TODO: any operation you need to perform during installation
      return {success: true};
    } catch (error: any) {
      logger.error('Error during installation:', error);
      return {success: false, retryable: true, message: `Error during installation: ${error}`};
    }
  }

  public async onSettingsForm(
    section: string, action: string, formData: SubmittedFormData
  ): Promise<LifecycleSettingsResult> {
    const result = new LifecycleSettingsResult();
    try {
      if (action === 'trigger_full_import') {
        return this.handleTriggerFullImport(result);
      }

      if (section === 'shopify_credentials') {
        return this.handleShopifyCredentials(formData, result);
      }

      // Default: save form data to settings store
      await storage.settings.put(section, formData);
      return result;
    } catch {
      return result.addToast('danger', 'Sorry, an unexpected error occurred. Please try again in a moment.');
    }
  }

  private async handleTriggerFullImport(
    result: LifecycleSettingsResult
  ): Promise<LifecycleSettingsResult> {
    // Check credentials exist in storage
    const settings: Record<string, string> = await storage.settings.get('shopify_credentials');
    if (!settings.store_url || !settings.access_token) {
      return result.addToast('danger', 'Please configure your Shopify credentials before running an import.');
    }

    await jobs.trigger('import_products', {});
    return result.addToast(
      'success', 'Full product import has been triggered. You will be notified when it completes.'
    );
  }

  private async handleShopifyCredentials(
    formData: SubmittedFormData, result: LifecycleSettingsResult
  ): Promise<LifecycleSettingsResult> {
    const storeUrl = formData.store_url as string;
    const accessToken = formData.access_token as string;

    if (!storeUrl || !accessToken) {
      return result.addToast('danger', 'Please provide both a store URL and access token.');
    }

    // Validate credentials by testing the connection
    const client = new ShopifyClient({storeUrl, accessToken});
    const isValid = await client.testCredentials();

    if (!isValid) {
      return result.addToast('danger', 'Invalid Shopify credentials. Please check your store URL and access token.');
    }

    // Credentials are valid — save them
    await storage.settings.put('shopify_credentials', formData);

    // Set up webhooks for real-time product sync
    try {
      const endpoints = await functions.getEndpoints();
      const webhookUrl = endpoints['product_webhook'];

      const webhookManager = new ShopifyWebhookManager({storeUrl, accessToken});
      try {
        await webhookManager.deleteWebhooks(webhookUrl, client);
      } catch {
        // Ignore deletion errors for old webhooks
      }
      await webhookManager.createWebhooks(webhookUrl, client);
      await storage.settings.patch('shopify_credentials', {webhooks_active: true, webhook_error: ''});

      return result.addToast(
        'success',
        `Connected to Shopify store: ${storeUrl}. Webhooks configured for real-time sync.`
      );
    } catch (webhookError: any) {
      logger.error(`Error setting up webhooks: ${webhookError.message}`);
      await storage.settings.patch('shopify_credentials', {
        webhooks_active: false,
        webhook_error: webhookError.message
      });
      return result.addToast(
        'success',
        `Connected to Shopify store: ${storeUrl}, but webhook setup failed: ${webhookError.message}`
      );
    }
  }

  public async onAuthorizationRequest(
    _section: string, _formData: SubmittedFormData
  ): Promise<LifecycleSettingsResult> {
    const result = new LifecycleSettingsResult();
    // TODO: if your application supports the OAuth flow (via oauth_button in the settings form), evaluate the form
    // data and determine where to send the user: `result.redirect('https://<external oauth endpoint>')`
    return result.addToast('danger', 'Sorry, OAuth is not supported.');
  }

  public async onAuthorizationGrant(_request: Request): Promise<AuthorizationGrantResult> {
    // TODO: if your application supports the OAuth flow, evaluate the inbound request and perform any necessary action
    // to retrieve the access token, then forward the user to the next relevant settings form section:
    // `new AuthorizationGrantResult('my_next_section')`
    return new AuthorizationGrantResult('').addToast('danger', 'Sorry, OAuth is not supported.');
  }

  public async onUpgrade(_fromVersion: string): Promise<LifecycleResult> {
    // TODO: any logic required when upgrading from a previous version of the app
    // Note: `fromVersion` may not be the most recent version or could be a beta version
    return {success: true};
  }

  public async onFinalizeUpgrade(_fromVersion: string): Promise<LifecycleResult> {
    // TODO: any logic required when finalizing an upgrade from a previous version
    // At this point, new webhook URLs have been created for any new functions in this version
    return {success: true};
  }

  public async onAfterUpgrade(): Promise<LifecycleResult> {
    // TODO: any logic required after the upgrade has been completed.  This is the plugin point
    // for triggering one-time jobs against the upgraded installation
    return {success: true};
  }

  public async onUninstall(): Promise<LifecycleResult> {
    try {
      logger.info('Uninstalling app, cleaning up webhooks...');

      const settings: Record<string, string> = await storage.settings.get('shopify_credentials');
      if (settings?.store_url && settings?.access_token) {
        const endpoints = await functions.getEndpoints();
        const webhookUrl = endpoints['product_webhook'];

        const webhookManager = new ShopifyWebhookManager({
          storeUrl: settings.store_url,
          accessToken: settings.access_token
        });
        await webhookManager.deleteWebhooks(webhookUrl);
        await storage.settings.patch('shopify_credentials', {webhooks_active: false});
      }

      return {success: true};
    } catch (error: any) {
      logger.error(`Error during uninstall: ${error.message}`);
      return {success: true, message: `Warning: Unable to clean up all webhooks: ${error.message}`};
    }
  }
}
