import 'dotenv/config'
import OpenAI from 'openai';

const openai = new OpenAI();

/** @typedef {import("openai/src/resources/chat/completions").ChatCompletionMessageParam} ChatCompletionMessageParam */

/** Temporary Object to store conversations
 * @type Record<string, { messages: ChatCompletionMessageParam[] }>
 */
const conversations = {};

// Generate a unique conversation ID
function generateConversationId() {
  return Math.random().toString(36).substring(2, 15);
}

// Create a new conversation
async function createConversation(
  /**@type string */
  query
) {
  const conversationId = generateConversationId();

  /** @type ChatCompletionMessageParam[] */
  const messages = [{ role: 'user', content: query }];
  const completion = await openai.chat.completions.create({
    messages,
    model: 'gpt-3.5-turbo',
  });

  const { message } = completion.choices[0];
  conversations[conversationId] = { messages: [...messages, message] };

  return { response: message.content, conversationId };
}

// Update an existing conversation
async function updateConversation(
  /**@type string */
  conversationId,
  /**@type string */
  query
) {
  const { messages } = conversations[conversationId]

  const completion = await openai.chat.completions.create({
    messages: [...messages, { role: 'user', content: query }],
    model: 'gpt-3.5-turbo',
  });

  const { message } = completion.choices[0];

  conversations[conversationId] = { messages: [...messages, { role: 'user', content: query }, message] };

  return { response: message.content, conversationId };
}

// Get all conversations
function getAllConversations() {
  return conversations;
}

async function main() {
  const result = await createConversation('Say this is a test');
  console.log(result);

  console.log(await updateConversation(result.conversationId, 'Say this is an updated test'));

  console.log(await createConversation('Say this is an updated test'));

  console.log(getAllConversations());
}

main();