import 'dotenv/config'
import OpenAI from 'openai';
import { createServer } from 'node:http'
import { createSchema, createYoga } from 'graphql-yoga';

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
  return Object.keys(conversations).map(conversationId => ({
    conversationId,
    messages: conversations[conversationId].messages,
  }));
}

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Conversation {
      conversationId: String!
      messages: [Message!]!
    }

    type Message {
      role: String!
      content: String!
    }

    type CreateOrUpdateConversationResponse {
      response: String!
      conversationId: String!
    }

    type Query {
      getAllConversations: [Conversation!]!
    }

    type Mutation {
      createConversation(query: String!): CreateOrUpdateConversationResponse!
      updateConversation(conversationId: String!, query: String!): CreateOrUpdateConversationResponse!
    }
  `,
  resolvers: {
    Query: {
      getAllConversations: () => getAllConversations(),
    },
    Mutation: {
      createConversation: (_, { query }) => createConversation(query),
      updateConversation: (_, { conversationId, query }) => updateConversation(conversationId, query),
    },
  }
})

// Create a Yoga instance with a GraphQL schema.
const yoga = createYoga({ schema })

// Pass it into a server to hook into request handlers.
const server = createServer(yoga)

// Start the server and you're done!
server.listen(4000, () => {
  console.info('Server is running on http://localhost:4000/graphql')
})
