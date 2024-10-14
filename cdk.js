import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as lambda from '@aws-cdk/aws-lambda';
import * as apigateway from '@aws-cdk/aws-apigateway';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as iam from '@aws-cdk/aws-iam';

export class AiCapabilityStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. S3 Bucket for Static Website
    const websiteBucket = new s3.Bucket(this, 'StaticWebsiteBucket', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: true,
    });

    // 2. DynamoDB Table for storing data
    const table = new dynamodb.Table(this, 'AiDataTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // 3. Lambda Function (JavaScript) to handle backend logic
    const backendLambda = new lambda.Function(this, 'BackendLambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const https = require('https');
        const dynamo = new AWS.DynamoDB.DocumentClient();
        
        exports.handler = async function(event) {
          const { prompt } = JSON.parse(event.body);
          const apiKey = process.env.OPENAI_API_KEY;

          // Call OpenAI API
          const options = {
            hostname: 'api.openai.com',
            path: '/v1/completions',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + apiKey,
            },
          };

          const requestBody = JSON.stringify({
            model: 'text-davinci-003',
            prompt: prompt,
            max_tokens: 100,
          });

          const result = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
              let data = '';
              res.on('data', (chunk) => {
                data += chunk;
              });
              res.on('end', () => resolve(JSON.parse(data)));
            });

            req.on('error', reject);
            req.write(requestBody);
            req.end();
          });

          // Store result in DynamoDB
          const response = await dynamo.put({
            TableName: process.env.TABLE_NAME,
            Item: { id: new Date().toISOString(), prompt, response: result.choices[0].text },
          }).promise();

          return {
            statusCode: 200,
            body: JSON.stringify({ result: result.choices[0].text }),
          };
        };
      `),
      environment: {
        OPENAI_API_KEY: '<YOUR_OPENAI_API_KEY>', // Replace with your OpenAI API Key
        TABLE_NAME: table.tableName,
      },
    });

    // Grant DynamoDB write permissions to Lambda
    table.grantWriteData(backendLambda);

    // 4. API Gateway to expose the Lambda function
    const api = new apigateway.LambdaRestApi(this, 'AiApi', {
      handler: backendLambda,
      proxy: false,
    });

    // Define API Resource and POST method
    const aiResource = api.root.addResource('ai');
    aiResource.addMethod('POST'); // POST /ai will trigger the Lambda function

    // 5. Output the S3 Website URL and API URL
    new cdk.CfnOutput(this, 'WebsiteURL', {
      value: websiteBucket.bucketWebsiteUrl,
    });

    new cdk.CfnOutput(this, 'APIURL', {
      value: api.url,
    });
  }
}

const app = new cdk.App();
new AiCapabilityStack(app, 'AiCapabilityStack');
