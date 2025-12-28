// chat.js - Vercel Serverless Function
export default async function handler(req, res) {
  // Set CORS headers for cross-origin requests (if needed)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 1. Method validation
    if (req.method !== 'POST') {
      return res.status(405).json({ 
        error: 'Method not allowed',
        message: 'Only POST requests are allowed' 
      });
    }

    // 2. Check and load API key from Vercel environment variables
    const apiKey = process.env.LONGCAT_API_KEY;
    if (!apiKey) {
      console.error('❌ LONGCAT_API_KEY is not configured in Vercel environment variables');
      return res.status(500).json({ 
        reply: 'Server configuration error. Please check your API key setup.',
        error: 'Missing API Key'
      });
    }

    // 3. Parse and validate message
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        reply: 'Please provide a message.' 
      });
    }

    const trimmedMessage = message.toString().trim();
    
    if (trimmedMessage.length === 0) {
      return res.status(400).json({ 
        reply: 'Message cannot be empty.' 
      });
    }

    if (trimmedMessage.length > 2000) {
      return res.status(400).json({ 
        reply: 'Message is too long. Please keep it under 2000 characters.' 
      });
    }

    // Optional: Basic content filtering
    const blockedPatterns = [
      /(?:malicious|hack|exploit|inject)/i, // Add your own patterns
    ];
    
    for (const pattern of blockedPatterns) {
      if (pattern.test(trimmedMessage)) {
        console.warn(`⚠️ Blocked potentially harmful message: ${trimmedMessage.substring(0, 50)}...`);
        return res.status(400).json({ 
          reply: 'Message contains blocked content.' 
        });
      }
    }

    // 4. Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutMs = 15000; // 15 seconds timeout for Vercel (max 10-15s for free tier)
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // 5. Call LongCat AI API
    console.log(`📨 Processing message: "${trimmedMessage.substring(0, 100)}${trimmedMessage.length > 100 ? '...' : ''}"`);
    
    const response = await fetch(
      'https://api.longcat.chat/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Vercel-AI-Chatbot/1.0'
        },
        body: JSON.stringify({
          model: 'LongCat-Flash-Chat',
          messages: [
            {
              role: 'system',
              content: `You are a helpful AI assistant. Respond in clear, concise Markdown format when appropriate. 
Current date: ${new Date().toISOString().split('T')[0]}
Be friendly, helpful, and accurate.`
            },
            { 
              role: 'user', 
              content: trimmedMessage 
            }
          ],
          max_tokens: 300,
          temperature: 0.7,
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.1,
          stream: false
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    // 6. Handle API response errors
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      console.error('❌ LongCat API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText.substring(0, 500)
      });
      
      // User-friendly error messages based on status code
      const errorMessages = {
        400: 'Bad request to AI service.',
        401: 'Invalid API key. Please check your LongCat API key.',
        403: 'Access forbidden to AI service.',
        429: 'Too many requests. Please wait a moment and try again.',
        500: 'AI service internal error.',
        502: 'AI service is temporarily unavailable.',
        503: 'AI service is overloaded.',
        504: 'AI service timeout.'
      };
      
      const userMessage = errorMessages[response.status] || 'AI service error. Please try again.';
      
      return res.status(response.status >= 500 ? 502 : response.status).json({ 
        reply: `🤖 ${userMessage}`,
        error: response.statusText,
        details: process.env.NODE_ENV === 'development' ? errorText : undefined
      });
    }

    // 7. Parse successful response
    const data = await response.json();
    
    // 8. Extract and validate AI response
    let reply = '⚠️ AI did not return a response.';
    
    if (data?.choices?.[0]?.message?.content) {
      reply = data.choices[0].message.content.trim();
      
      // Ensure response isn't too long for frontend
      if (reply.length > 5000) {
        reply = reply.substring(0, 5000) + '... [response truncated due to length]';
      }
      
      // Ensure reply isn't empty
      if (reply.length === 0) {
        reply = 'AI returned an empty response.';
      }
    } else {
      console.warn('⚠️ Unexpected API response structure:', {
        hasChoices: !!data?.choices,
        choicesLength: data?.choices?.length,
        hasMessage: !!data?.choices?.[0]?.message,
        dataKeys: Object.keys(data || {})
      });
    }

    // 9. Log successful request (optional)
    const tokensUsed = data?.usage?.total_tokens || 0;
    console.log(`✅ Request completed: ${tokensUsed} tokens used`);

    // 10. Return success response
    return res.status(200).json({ 
      reply,
      // Include metadata for debugging/frontend
      metadata: {
        tokens: tokensUsed,
        model: data?.model || 'LongCat-Flash-Chat',
        timestamp: new Date().toISOString(),
        truncated: reply.length > 5000
      }
    });

  } catch (err) {
    // 11. Handle all other errors
    console.error('🔥 Unhandled error in chat handler:', {
      name: err.name,
      message: err.message,
      stack: err.stack?.split('\n')[0]
    });
    
    // Specific error handling
    if (err.name === 'AbortError') {
      return res.status(504).json({ 
        reply: '⏱️ Request timed out. Please try a shorter message or try again later.',
        error: 'Timeout'
      });
    }
    
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      return res.status(502).json({ 
        reply: '🔌 Network error. Please check your connection and try again.',
        error: 'Network Error'
      });
    }
    
    if (err.name === 'SyntaxError') {
      return res.status(400).json({ 
        reply: '📄 Invalid request format. Please check your input.',
        error: 'Invalid JSON'
      });
    }
    
    // Generic error
    return res.status(500).json({
      reply: '❌ An unexpected error occurred. Please try again.',
      error: err.message,
      // Only show detailed error in development
      ...(process.env.NODE_ENV === 'development' && { 
        stack: err.stack,
        type: err.name 
      })
    });
  }
}
