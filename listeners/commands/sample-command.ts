import { AllMiddlewareArgs, SlackCommandMiddlewareArgs } from '@slack/bolt';
import {KeyvFile } from 'keyv-file';
import { TextEncoder } from 'util';
import { Nightfall } from 'nightfall-js';
import { Detector, ScanText } from 'nightfall-js/dist/types';



export const API_KEY_ERROR =
  "OpenAI's API key is required for running this function! To fix this, follow these two steps:\n\n 1) Grab the API key string in https://platform.openai.com/account/api-keys \n 2) Place .env file for local development, or run `slack env add OPENAI_API_KEY {YOUR KEY HERE}` for deployed app.";

export const API_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export enum OpenAIModel {
  GPT_3_5_TURBO = "gpt-3.5-turbo",
  GPT_4 = "gpt-4",
}

export interface Message {
  role: "assistant" | "user" | "system";
  content: string;
  name?: string;
}

export interface AssistantMessage extends Message {
  role: "assistant";
}

export interface OpenAIResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    message: AssistantMessage;
    index: number;
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export function buildSystemMessage(botUserId?: string): Message {
  return {
    "role": "system",
    "content":
      `You are a bot in a slack chat room. You might receive messages from multiple people. Slack user IDs match the regex \`<@U.*?>\`. Your Slack user ID is <@${botUserId}>.`,
  };
}

export function calculateNumTokens(
  messages: Message[],
): number {
  // Deep Dive: "Counting tokens for chat API calls"
  // https://platform.openai.com/docs/guides/chat/introduction

  let numTokens = 0;

  for (const message of messages) {
    numTokens += 4; // every message follows <im_start>{role/name}\n{content}<im_end>\n
    // Create an instance of the TextEncoder
const textEncoder = new TextEncoder();
    numTokens += textEncoder.encode(message.role).length;
    numTokens += textEncoder.encode(message.content).length;
    if (message.name) {
      numTokens += textEncoder.encode(message.name).length;
      numTokens -= 1;
    }
  }
  numTokens += 2; // every reply is primed with <im_start>assistant

  return numTokens;
}

export async function callOpenAI(
  apiKey: string,
  timeoutSeconds: number,
  body: string,
): Promise<string> {
  try {
    const c = new AbortController();
    const id = setTimeout(() => c.abort(), timeoutSeconds * 1000);
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body,
      signal: c.signal,
    });
    clearTimeout(id);
    if (!response.ok) {
      console.log(response);
      return `:warning: Something is wrong with your ChaGPT request (error: ${response.statusText})`;
    } else {
      const responseBody: OpenAIResponse = await response.json();
      console.log(responseBody);
      if (responseBody.choices && responseBody.choices.length > 0) {
        return responseBody.choices[0].message.content;
      }
    }
  } catch (e:any) {
    if (e.name === "AbortError") {
      return `:warning: ChatGPT didn't respond within ${timeoutSeconds} seconds.`;
    } else {
      return `:warning: Something is wrong with your ChaGPT request (error: ${e})`;
    }
  }
  return ":warning: ChatGPT didn't respond to your request. Please try it again later.";
}
export async function callNightFall(
  apiKey:string,
  timeoutSeconds:number,
  body:string
): Promise<string> {
// By default, the client reads your API key from the environment variable NIGHTFALL_API_KEY
const nfClient = new Nightfall({apiKey:apiKey,webhookSigningSecret:'todo'});
 const response = await nfClient.scanText(Array.from(body), {
   /*defaultRedactionConfig: {maskConfig: {numCharsToLeaveUnmasked:0,maskingChar: '#',maskLeftToRight:false,charsToIgnore:Array.from(' ')}},
      detectionRuleUUIDs: ['73a8faa7-76e7-46fe-a01d-6b2f8abcdb4b']*/
   detectionRules: [
    {
      name: 'Secrets Scanner',
      logicalOp: 'ANY',
      detectors: [
        {
          minNumFindings: 1,
          minConfidence: Detector.Confidence.Possible,
          displayName: 'Credit Card Number',
          detectorType: Detector.Type.Nightfall,
          nightfallDetector: 'CREDIT_CARD_NUMBER',
        },
      ],
    },
  ]
});
 
if (response.isError) {
  console.log(response.getError());
  return '';
} else {
  response.data?.findings.forEach((finding) => {
    if (finding.length > 0) {
      finding.forEach((result) => {
        console.log(`Finding: ${result.finding}, Confidence: ${result.confidence}`);
      });
    }

  });
  if(response.data?.redactedPayload&&response.data?.redactedPayload?.join('').length>0)
  return response.data?.redactedPayload.join('. ');
else 
 return body;
}
return '';
}
const sampleCommandCallback = async ({command, ack, respond }:
  AllMiddlewareArgs & SlackCommandMiddlewareArgs) => {
  try {
    const apiKey = 'sk-';
    await ack();
    const messages: Message[] = [];
    let isDiscussion = false;
    const nRsp:string = await callNightFall('NF-',12,command.text);
       messages.push({
        role:  "user",
        content: nRsp || "",
      });
    
  
   //  if (!isDiscussion) {
   //    return { outputs: {} };
   //  }
    const model = process.env.OPENAI_MODEL
    ? process.env.OPENAI_MODEL as OpenAIModel
    : OpenAIModel.GPT_3_5_TURBO;
  const maxTokensForThisReply = 1024;
  const modelLimit = model === OpenAIModel.GPT_4 ? 6000 : 4000;
  const systemMessage = buildSystemMessage(command.user_id);
  messages.push(systemMessage); // append this for now but will move it to the beginning later
  while (calculateNumTokens(messages) > modelLimit - maxTokensForThisReply) {
    messages.shift();
  }
  messages.pop(); // remove the appended system one
  messages.unshift(systemMessage); // insert the system one as the 1st element

  const body = JSON.stringify({
    "model": model,
    "messages": messages,
    "max_tokens": maxTokensForThisReply,
  });
    const answer = await callOpenAI(apiKey, 12, body);
    let rsp:string = "From ChatGPT: " + answer;
    await respond(rsp);
  } catch (error) {
    console.error(error);
  }
};

export default sampleCommandCallback;
