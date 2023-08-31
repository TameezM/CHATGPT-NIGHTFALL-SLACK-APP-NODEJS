import { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { Message, OpenAIModel, buildSystemMessage, calculateNumTokens, callNightFall, callOpenAI } from '../commands/sample-command';

const sampleMessageCallback = async ({ context, say }: AllMiddlewareArgs & SlackEventMiddlewareArgs<'message'>) => {
  try {
    const apiKey = 'sk-';
    
    const messages: Message[] = [];
    let isDiscussion = false;
    const nRsp:string = await callNightFall('NF',12,context.matches[0]);
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
  const systemMessage = buildSystemMessage(context.user_id);
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
    const greeting = context.matches[0];
    await say(rsp);
  } catch (error) {
    console.error(error);
  }
};

export default sampleMessageCallback;
