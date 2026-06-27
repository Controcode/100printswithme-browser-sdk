import { ApiClientOptions, SdkRenderRequest, SdkRenderResponse } from './types';

export class ApiClient {
  private key: string;
  private baseUrl: string;

  constructor(options: ApiClientOptions) {
    this.key = options.key;
    this.baseUrl = options.baseUrl || 'https://api.100printswith.me';
  }

  async getTemplate(templateId: string): Promise<SdkRenderResponse> {
    const url = `${this.baseUrl}/public/v1/sdk/render?template_id=${encodeURIComponent(templateId)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.key}`
      }
    });

    if (!response.ok) {
      let errorMessage = `API Error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
        }
      } catch (e) {
        // Ignore JSON parse errors for non-JSON responses
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  }
}
