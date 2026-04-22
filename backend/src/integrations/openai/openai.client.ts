import OpenAI from 'openai';
import { config } from '../../config';

let openAIClient: OpenAI | undefined;

export const getOpenAIClient = (): OpenAI => {
  if (!openAIClient) {
    openAIClient = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }

  return openAIClient;
};
