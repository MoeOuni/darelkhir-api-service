export const getConfig = () => ({
  stage: process.env.STAGE || 'dev',
  productsTableName: process.env.PRODUCTS_TABLE_NAME || '',
  ordersTableName: process.env.ORDERS_TABLE_NAME || '',
  categoriesTableName: process.env.CATEGORIES_TABLE_NAME || '',
  clientsTableName: process.env.CLIENTS_TABLE_NAME || '',
  transportersTableName: process.env.TRANSPORTERS_TABLE_NAME || '',
  declaredTableName: process.env.DECLARED_TABLE_NAME || '',
  settingsTableName: process.env.SETTINGS_TABLE_NAME || '',
  journalTableName: process.env.JOURNAL_TABLE_NAME || '',
  staffTableName: process.env.STAFF_TABLE_NAME || '',
  catalogTableName: process.env.CATALOG_TABLE_NAME || '',
  paymentsTableName: process.env.PAYMENTS_TABLE_NAME || '',
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || '',
  cognitoClientId: process.env.COGNITO_CLIENT_ID || '',
  clientsUserPoolId: process.env.CLIENTS_USER_POOL_ID || '',
  clientsUserPoolClientId: process.env.CLIENTS_USER_POOL_CLIENT_ID || '',
  s3BucketName: process.env.S3_BUCKET_NAME || '',
  region: process.env.AWS_REGION || 'us-east-1',
  // The Darija reader, and only it, uses these. Both keys come from SSM at
  // deploy time; which one is used is a setting, so moving between vendors
  // does not touch the code.
  aiProvider: (process.env.AI_PROVIDER || 'anthropic') as 'anthropic' | 'openai',
  /** Empty means the provider's default in darija-order.ts. */
  aiModel: process.env.AI_MODEL || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  /**
   * Which workspace the call acts in.
   *
   * A key created against a person rather than against the organisation is
   * identity-linked, and Anthropic refuses it without being told which
   * workspace to bill and account the call to. Empty for an ordinary key,
   * which needs no such thing.
   */
  anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  /**
   * Where the OpenAI-shaped calls go.
   *
   * Groq, Gemini, OpenRouter, Cerebras and Mistral all answer the same
   * protocol, so a free tier is a URL and a key rather than another
   * integration. Empty means OpenAI itself.
   */
  aiBaseUrl: process.env.AI_BASE_URL || '',
  /**
   * 'schema' holds the answer to the shape and is what should be used wherever
   * it works. Several free providers accept only 'object' — JSON, but any
   * JSON — so the shape is described in words instead and checked on arrival.
   */
  // Speech is bought separately from reading: Claude has no voice, so this is
  // whichever provider says Arabic best for the money.
  ttsProvider: (process.env.TTS_PROVIDER || 'openai') as 'openai' | 'fish',
  ttsApiKey: process.env.TTS_API_KEY || '',
  ttsBaseUrl: process.env.TTS_BASE_URL || '',
  ttsModel: process.env.TTS_MODEL || '',
  ttsVoice: process.env.TTS_VOICE || '',
  // Listening is bought separately again: whoever hears Derja best.
  sttApiKey: process.env.STT_API_KEY || '',
  sttBaseUrl: process.env.STT_BASE_URL || '',
  /** Empty lets the model detect it, which a Derja-and-French sentence needs. */
  sttLanguage: process.env.STT_LANGUAGE || '',
  aiJsonMode: (process.env.AI_JSON_MODE || 'schema') as 'schema' | 'object',
});
