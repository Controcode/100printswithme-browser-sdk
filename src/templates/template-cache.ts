import { DocumentTemplate } from './types';
import { SdkRenderResponse } from '../api/types';

interface CacheEntry {
  data: SdkRenderResponse;
  fetchedAt: number;
}

export class TemplateCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  get(templateId: string): SdkRenderResponse | null {
    const entry = this.cache.get(templateId);
    if (!entry) return null;

    if (Date.now() - entry.fetchedAt > this.TTL_MS) {
      this.cache.delete(templateId);
      return null;
    }

    return entry.data;
  }

  set(templateId: string, data: SdkRenderResponse): void {
    this.cache.set(templateId, {
      data,
      fetchedAt: Date.now()
    });
  }
  
  clear(): void {
    this.cache.clear();
  }
}
