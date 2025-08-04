/**
 * Google Calendar Token Manager
 * Centralized token management with automatic refresh
 */

interface TokenData {
  access_token: string;
  expires_at: number;
  refresh_token: string;
}

class GoogleTokenManager {
  private tokenData: TokenData | null = null;
  private refreshPromise: Promise<string> | null = null;
  private readonly BUFFER_TIME = 5 * 60 * 1000; // 5 minutes buffer before expiry

  /**
   * Get a valid access token, refreshing if necessary
   */
  public async getValidToken(): Promise<string> {
    try {
      // If we have a valid token with buffer time, return it
      if (this.tokenData && this.isTokenValid()) {
        console.log('🔄 Using cached token (still valid)');
        return this.tokenData.access_token;
      }

      // If there's already a refresh in progress, wait for it
      if (this.refreshPromise) {
        console.log('⏳ Waiting for token refresh in progress...');
        return await this.refreshPromise;
      }

      // Start token refresh
      console.log('🔄 Token expired or missing, refreshing...');
      this.refreshPromise = this.refreshToken();
      
      try {
        const token = await this.refreshPromise;
        return token;
      } finally {
        this.refreshPromise = null;
      }

    } catch (error) {
      console.error('❌ Error getting valid token:', error);
      throw new Error('Failed to obtain valid access token');
    }
  }

  /**
   * Force refresh the access token
   */
  public async forceRefresh(): Promise<string> {
    console.log('🔄 Force refreshing access token...');
    this.tokenData = null;
    return await this.getValidToken();
  }

  /**
   * Check if current token is valid (with buffer time)
   */
  private isTokenValid(): boolean {
    if (!this.tokenData) return false;
    
    const now = Date.now();
    const expiresWithBuffer = this.tokenData.expires_at - this.BUFFER_TIME;
    
    return now < expiresWithBuffer;
  }

  /**
   * Refresh the access token using Google OAuth API
   */
  private async refreshToken(): Promise<string> {
    try {
      const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
      const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

      if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Missing required Google OAuth credentials in environment variables');
      }

      const tokenRequestBody = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      });

      console.log('📤 Calling Google OAuth token endpoint...');

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: tokenRequestBody.toString()
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('❌ Google OAuth API Error:', responseData);
        throw new Error(`Google OAuth error: ${responseData.error_description || responseData.error || 'Unknown error'}`);
      }

      // Calculate expiry time
      const expiresAt = Date.now() + (responseData.expires_in * 1000);

      // Store token data
      this.tokenData = {
        access_token: responseData.access_token,
        expires_at: expiresAt,
        refresh_token: refreshToken
      };

      console.log('✅ Successfully refreshed access token');
      console.log(`🕒 Token expires at: ${new Date(expiresAt).toISOString()}`);

      return this.tokenData.access_token;

    } catch (error: any) {
      console.error('🚨 Error refreshing token:', error);
      throw error;
    }
  }

  /**
   * Get token information for debugging
   */
  public getTokenInfo(): any {
    if (!this.tokenData) {
      return { status: 'no_token', message: 'No token cached' };
    }

    const now = Date.now();
    const isValid = this.isTokenValid();
    const expiresIn = Math.max(0, this.tokenData.expires_at - now);

    return {
      status: isValid ? 'valid' : 'expired',
      expires_at: new Date(this.tokenData.expires_at).toISOString(),
      expires_in_seconds: Math.floor(expiresIn / 1000),
      expires_in_minutes: Math.floor(expiresIn / (1000 * 60)),
      is_valid: isValid
    };
  }

  /**
   * Clear cached token (useful for testing)
   */
  public clearToken(): void {
    this.tokenData = null;
    this.refreshPromise = null;
    console.log('🧹 Token cache cleared');
  }
}

// Export singleton instance
export const tokenManager = new GoogleTokenManager();

/**
 * Convenience function to get a valid token
 */
export async function getValidGoogleToken(): Promise<string> {
  return await tokenManager.getValidToken();
}

/**
 * Convenience function to force token refresh
 */
export async function forceRefreshGoogleToken(): Promise<string> {
  return await tokenManager.forceRefresh();
}
