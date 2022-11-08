import type {
  ISourceProvider,
  ISourceProviderTransferResults,
  ProviderType,
  TransferStage,
} from '../../../types';
import { chain } from 'stream-chain';
import { Readable } from 'stream';
import { createEntitiesStream, createEntitiesTransformStream } from './entities';
import { createLinksStream } from './links';
import { createConfigurationStream } from './configuration';
import { onItemPassthrough } from '../util';

export interface ILocalStrapiSourceProviderOptions {
  getStrapi(): Strapi.Strapi | Promise<Strapi.Strapi>;

  autoDestroy?: boolean;
}

export const createLocalStrapiSourceProvider = (options: ILocalStrapiSourceProviderOptions) => {
  return new LocalStrapiSourceProvider(options);
};

class LocalStrapiSourceProvider implements ISourceProvider {
  name: string = 'source::local-strapi';
  type: ProviderType = 'source';

  options: ILocalStrapiSourceProviderOptions;
  strapi?: Strapi.Strapi;
  results: ISourceProviderTransferResults = {};

  constructor(options: ILocalStrapiSourceProviderOptions) {
    this.options = options;
  }

  #transferCounter = (transferStage: TransferStage) => {
    return onItemPassthrough(() => {
      if (!this.results[transferStage]) {
        this.results[transferStage] = {
          items: 0,
        };
      }
      this.results[transferStage]!.items!++;
    });
  };

  async bootstrap(): Promise<void> {
    this.strapi = await this.options.getStrapi();
  }

  async close(): Promise<void> {
    const { autoDestroy } = this.options;

    // Basically `!== false` but more deterministic
    if (autoDestroy === undefined || autoDestroy === true) {
      await this.strapi?.destroy();
    }
  }

  // TODO: Implement the get metadata
  async getMetadata() {
    return null;
  }

  async streamEntities(): Promise<NodeJS.ReadableStream> {
    if (!this.strapi) {
      throw new Error('Not able to stream entities. Strapi instance not found');
    }

    return chain([
      // Entities stream
      createEntitiesStream(this.strapi),

      // Count
      this.#transferCounter('entities'),

      // Transform stream
      createEntitiesTransformStream(),
    ]);
  }

  streamLinks(): NodeJS.ReadableStream {
    if (!this.strapi) {
      throw new Error('Not able to stream links. Strapi instance not found');
    }

    return chain([createLinksStream(this.strapi), this.#transferCounter('links')]);
  }

  streamConfiguration(): NodeJS.ReadableStream {
    if (!this.strapi) {
      throw new Error('Not able to stream configuration. Strapi instance not found');
    }

    return chain([createConfigurationStream(strapi), this.#transferCounter('configuration')]);
  }

  getSchemas() {
    if (!this.strapi) {
      throw new Error('Not able to get Schemas. Strapi instance not found');
    }

    const schemas = [
      ...Object.values(this.strapi.contentTypes),
      ...Object.values(this.strapi.components),
    ];
    this.results.schemas = { items: schemas.length };
    return schemas;
  }

  streamSchemas(): NodeJS.ReadableStream {
    return Readable.from(this.getSchemas());
  }
}

export type ILocalStrapiSourceProvider = InstanceType<typeof LocalStrapiSourceProvider>;
