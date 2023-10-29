# GraphQL w/ Cloudflare

Let's start with a problem statement. Assume you want to build a critical set of services for your client. When deploying the product to the market, they want confidence. Confidence that the service they're calling is implementing the correct contract. Confidence that any input they give is being validated correctly. And confidence that things don't break randomly. In the real world, a large part of this confidence comes from the tools we're using.

While building services and defining their contracts, an adherence to a strictly typed contract should resolve 80% of runtime errors. In layman terms, a contract is a source of truth for what data an API **accepts** and **returns**. This makes it straight-forward and safe for clients to access these APIs, as long as they follow the contracts. In **REST** APIs, one can follow specifications like [OpenAPI](https://www.openapis.org/) for defining contracts, although it isn't strictly enforced. Whereas, a schema is a core component in **GraphQL**.

Similarly, **serverless** is a new programming paradigm which allows you to deploy services to the internet without worrying about provisioning and maintaining your servers. If you read our previous article on [GraphQL and Serverless](https://www.contentful.com/blog/graphql-and-serverless-where-cloud-computing-is-heading/) a couple of years ago, you must've realised the integration between GraphQL and Serverless wasn't very mature. However, nowadays the situation is very different.

To explore deploying robust GraphQL services to Cloudflare, let's build a ChatGPT-like backend. It will have the following features:

1. Create a new GPT conversation
2. Continue an existing conversation
3. List conversations

## Pre-requisites

1. Install and set up [Node.JS](https://nodejs.org/).
2. Generate an OpenAI key for yourself from [the website](https://platform.openai.com/).

## Designing the APIs

We'll start designing the fundamental API in a bottom-up manner. If we start with an APIs-first approach, and try to understand what kind of methods we want to expose via GraphQL, that helps us move faster and also gives us more flexibility in adding other APIs down the line.

To start with our project,

- Create a new folder locally.
- Run `npm init` inside the folder so npm creates all of the required files to run a Node project.
- To install the OpenAI node library, we run the command `npm i openai`.
- We also install the [dotenv](https://www.npmjs.com/package/dotenv) package by running `npm i dotenv` so our secrets aren't exposed to the outside world 🤫.

Fetch the API key generated as a part of the pre-requisites. We're going to use it to set up our secrets file. Create a file named `.env` at the root of your project.

```
OPENAI_API_KEY="your_api_key"
```

Next, create an `index.mjs` file at the root of the project. We're using the `.mjs` extension to tell the Node compiler that the file is a module, allowing us to use `import`s.

```js
import 'dotenv/config'
import OpenAI from 'openai';

const openai = new OpenAI();

async function main() {
  const completion = await openai.chat.completions.create({
    messages: [{ role: 'user', content: 'Say this is a test' }],
    model: 'gpt-3.5-turbo',
  });

  console.log(completion.choices);
}

main();

```

Run the file using `node index.mjs` to check whether your project is set up correctly. Your output should look something like this.

```js
[
  {
    index: 0,
    message: { role: 'assistant', content: 'This is a test.' },
    finish_reason: 'stop'
  }
]

```

The [chat completions](https://platform.openai.com/docs/guides/gpt/chat-completions-api) API is all we require to build out our conversational APIs. A user's message is always sent with the `role` of `user`, and GPT's response is returned with the role `assistant`. It's the developer's job to append new messages of the conversation to the messages array before sending it to GPT for computation.

Since we don't have a persistence layer yet (patience), we will try to fake one by storing the data in a global variable within the script. Replace the code after imports in `index.mjs` with the following. We are using JSDocs instead of TypeScript to add types our file to avoid adding a transpilation step.

```js
...

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

async function main() {
  const result = await createConversation('Say this is a test');
  console.log(result);

  console.log(await updateConversation(result.conversationId, 'Say this is an updated test'));

  console.log(await createConversation('Say this is an updated test'));

  console.log(getAllConversations());
}

main();

```

If you run `node index.mjs` again, you should see something like the following in your console. Ignore the objects for now as they are just a presentation of what we are trying to build.

```js
{ response: 'This is a test.', conversationId: 'npj2oeemsr9' }
{ response: 'This is an updated test.', conversationId: 'npj2oeemsr9' }
{ response: 'This is an updated test.', conversationId: '145s4b3w3y1' }
{
  npj2oeemsr9: { messages: [ [Object], [Object], [Object], [Object] ] },
  '145s4b3w3y1': { messages: [ [Object], [Object] ] }
}

```

Next, we want to serve this data from a persistent server. To make it easily queriable and type-safe, we will now build a GraphQL server.

## Create a GraphQL Server

To get started with creating our GraphQL server, let's install [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server), a batteries-included cross-platform HTTP spec-compliant GraphQL server that runs anywhere, including Cloudflare Workers.

Run `npm i graphql-yoga graphql` to install our dependencies. Next, add all of the necessary imports to the top-level of `index.mjs`.

```js
import { createServer } from 'node:http'
import { createSchema, createYoga } from 'graphql-yoga';
```

Now, we're going to define our schema and resolvers. In GraphQL, the schema is the centerpiece of your API. It specifies the capabilities of the API and defines how clients can request the data. It is often seen as a contract between the server and client. Resolvers are functions that resolve data for your GraphQL fields in the schema. They fetch the data from a database or other data sources. They return data in the format specified by your schema, and can be used to handle custom logic for fetching data. 

To these using GraphQL Yoga, add the following code to the bottom of `index.mjs`.


```js
// Create a GraphQL schema, including resolvers to call methods we've defined above.
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
```

Run `node index.mjs` again to start the server. You should see the following output.


To persist this data between calls to these methods, we're going to use Cloudflare's free [KV Store service](https://developers.cloudflare.com/kv/). Cloudflare also has their own serverless platform called [Cloudflare Workers](https://developers.cloudflare.com/workers/). The optimum way to use the KV store is to use it within Cloudflare's worker service. Hence, we will now start with integrating into Cloudflare.