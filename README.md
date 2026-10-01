<!--
title: 'AWS Simple HTTP Endpoint example in NodeJS'
description: 'This template demonstrates how to make a simple HTTP API with Node.js running on AWS Lambda and API Gateway using the Serverless Framework.'
layout: Doc
framework: v4
platform: AWS
language: nodeJS
authorLink: 'https://github.com/serverless'
authorName: 'Serverless, Inc.'
authorAvatar: 'https://avatars1.githubusercontent.com/u/13742415?s=200&v=4'
-->

# Serverless Framework Node HTTP API on AWS

This template demonstrates how to make a simple HTTP API with Node.js running on AWS Lambda and API Gateway using the Serverless Framework.

This template does not include any kind of persistence (database). For more advanced examples, check out the [serverless/examples repository](https://github.com/serverless/examples/) which includes Typescript, Mongo, DynamoDB and other examples.

## Usage

### Deployment

In order to deploy the example, you need to run the following command:

```
serverless deploy
```

After running deploy, you should see output similar to:

```
Deploying "serverless-http-api" to stage "dev" (us-east-1)

✔ Service deployed to stack serverless-http-api-dev (91s)

endpoint: GET - https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/
functions:
  hello: serverless-http-api-dev-hello (1.6 kB)
```

_Note_: In current form, after deployment, your API is public and can be invoked by anyone. For production deployments, you might want to configure an authorizer. For details on how to do that, refer to [HTTP API (API Gateway V2) event docs](https://www.serverless.com/framework/docs/providers/aws/events/http-api).

### Invocation

After successful deployment, you can call the created application via HTTP:

```
curl https://xxxxxxx.execute-api.us-east-1.amazonaws.com/
```

Which should result in response similar to:

```json
{ "message": "Go Serverless v4! Your function executed successfully!" }
```

### Local development

The easiest way to develop and test your function is to use the `dev` command:

```
serverless dev
```

This will start a local emulator of AWS Lambda and tunnel your requests to and from AWS Lambda, allowing you to interact with your function as if it were running in the cloud.

Now you can invoke the function as before, but this time the function will be executed locally. Now you can develop your function locally, invoke it, and see the results immediately without having to re-deploy.

When you are done developing, don't forget to run `serverless deploy` to deploy the function to the cloud.

## Invoice documents

`libs/invoice.ts` renders the facture, the devis and the avoir from one layout,
matching the shop's own printed paper: the bilingual header, the ruled item
table, the totals block, the amount in words, the delivery details and the two
footer wings.

Assets live in `src/functions/orders/invoice/data/` and travel with the handler
— the renderer resolves them from `__dirname/data` in Lambda and from the
repository when run locally.

### Fonts

Everything is set in **HealthySans** (Regular, Medium, Bold, Black), which
covers Latin and Arabic in one family, so the two scripts finally match in size
and weight on the same line.

The font carries **no `GSUB` table**, so nothing joins the Arabic letters for
us. `libs/arabic-shaper.ts` does it: each letter is mapped to its isolated,
initial, medial or final form from the Arabic Presentation Forms-B block, lam
and alef become a single ligature, and the run is reversed for drawing. Numbers
and Latin words inside Arabic keep their own left-to-right order.

The source of the font is `RO-invoices-assets/healthy-sans-*.ts`, base64 blobs
supplied by the client. They are decoded to `.ttf` once and committed, rather
than inlined into every bundle.

### Bilingual identity

The header prints the shop's details twice, so the settings hold each one in
both languages: `businessName` / `businessNameAr`, `addressLine` /
`addressLineAr`, `taxId` / `taxIdAr`. The Arabic field falls back to the French
one when it is empty, so a half-filled settings record still produces a
complete invoice.

### Looking at the result

```bash
npx tsx scripts/render-sample-invoice.ts ./out
```

Writes a sample of each of the three documents. It reads nothing from AWS.
