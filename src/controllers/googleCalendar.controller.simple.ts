import { Request, Response } from "express";

/**
 * Get fresh access token using client credentials from environment
 * This endpoint uses the client ID, secret, and refresh token from .env to get a fresh access token
 */
export const getAccessTokenWithCredentials = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('\n🔑🔑🔑 GETTING FRESH ACCESS TOKEN WITH CREDENTIALS! 🔑🔑🔑');
    console.log('='.repeat(60));
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`📍 Endpoint: POST /api/google-calendar/get-access-token`);
    console.log('='.repeat(60));

    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      console.log('❌ Missing required credentials in environment variables');
      res.status(400).json({
        success: false,
        message: "Missing required Google OAuth credentials in environment variables",
        required: ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET", "GOOGLE_CALENDAR_REFRESH_TOKEN"]
      });
      return;
    }

    console.log(`🔐 Using Client ID: ${clientId.substring(0, 20)}...`);
    console.log(`🔐 Using Refresh Token: ${refreshToken.substring(0, 20)}...`);

    // Prepare the request body for Google OAuth token endpoint
    const tokenRequestBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    console.log('📤 Making request to Google OAuth endpoint...');

    // Make request to Google OAuth token endpoint
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
      res.status(response.status).json({
        success: false,
        message: "Failed to get access token from Google",
        error: responseData.error_description || responseData.error || 'Unknown error',
        details: responseData
      });
      return;
    }

    console.log('✅ Successfully obtained new access token from Google!');
    console.log(`📝 Token type: ${responseData.token_type}`);
    console.log(`⏰ Expires in: ${responseData.expires_in} seconds`);

    // Calculate expiry date
    const expiryDate = new Date(Date.now() + (responseData.expires_in * 1000));

    const tokenData = {
      access_token: responseData.access_token,
      token_type: responseData.token_type || 'Bearer',
      expires_in: responseData.expires_in,
      expiry_date: expiryDate.toISOString(),
      scope: responseData.scope,
      // Keep the same refresh token (Google usually doesn't send a new one unless specifically requested)
      refresh_token: refreshToken
    };

    console.log('🎯 Token Data Summary:');
    console.log(`   - Access Token: ${tokenData.access_token.substring(0, 30)}...`);
    console.log(`   - Expires: ${tokenData.expiry_date}`);
    console.log(`   - Scope: ${tokenData.scope}`);

    res.status(200).json({
      success: true,
      message: "Successfully obtained new access token",
      data: tokenData,
      instructions: {
        usage: "Use the access_token in Authorization header as 'Bearer YOUR_ACCESS_TOKEN'",
        expiry: `Token expires at ${tokenData.expiry_date}`,
        autoRefresh: "You can call this endpoint again to get a fresh token when needed"
      }
    });

  } catch (error: any) {
    console.error('🚨 Error getting access token:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while getting access token",
      error: error.message
    });
  }
};
